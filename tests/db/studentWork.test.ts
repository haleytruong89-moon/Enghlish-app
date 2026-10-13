import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveMcqAnswer } from "../../lib/config/inquiries";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { as, asCommit, createTestDb, errorAs, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

// All dates are relative to "today in Asia/Ho_Chi_Minh" (what the database uses).
const TODAY = todayVn();

const template = (id: string): InquiryTemplate =>
  JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
const stepOf = (t: InquiryTemplate, n: number) => {
  const s = t.steps[n - 1];
  if (!s) throw new Error(`no step ${n} in ${t.id}`);
  return s;
};

/** The due date that makes the template's step `stepNo` fall on today (later steps stay in the future). */
function dueReleasing(id: string, stepNo: number): string {
  const t = template(id);
  const planned = stepOf(t, stepNo).planned_date;
  if (!planned) throw new Error("step has no planned date");
  return addDays(TODAY, daysBetween(planned, t.dates.to));
}
/** The due date that releases every step of the template today. */
function dueReleasingAll(id: string): string {
  const t = template(id);
  const last = t.steps.map((s) => s.planned_date ?? "").sort().at(-1) ?? "";
  return addDays(TODAY, daysBetween(last, t.dates.to));
}

const FORBIDDEN = ["auto_check", "explanation_vi", "prompt_vi", "review_note", "transcript", "target_id", "target_ids", '"answer":'];

describe("S4 student work (DESIGN §5, §6, §8, §9)", () => {
  let db: TestDb;
  let s: Seeded;
  const an = () => s.users.studentAn;
  const nguyen = () => s.users.studentNguyen;

  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.client.query<R>(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => (await q1<{ n: number }>(sql, params))[0]?.n;

  let reqSeq = 0;
  async function assign(who: "an" | "nguyen", templateId: string, due: string): Promise<string> {
    const r = await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [
      s.learners[who],
      templateId,
      due,
      s.members.parent,
      `s4-test-${(reqSeq += 1)}-${templateId}`,
    ]);
    return r[0]!.id;
  }
  async function activity(instance: string, stepNo: number): Promise<string> {
    return (await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [instance, stepNo]))[0]!.id;
  }

  type Receipt = { attempt_id: string; attempt_no: number; submitted_at: string; hash: string; replayed: boolean };
  const submitAs = (userId: string | null, activityId: string, clientId: string, content: unknown, assistance: string[] = ["none"], provenance = "in_app") =>
    asCommit(db.client, "authenticated", userId, async (q) => {
      const r = await q("select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], $5) as r", [
        activityId,
        clientId,
        JSON.stringify(content),
        assistance,
        provenance,
      ]);
      return (r.rows[0] as { r: Receipt }).r;
    });
  const saveAs = (userId: string, activityId: string, content: unknown, base: number | null = null) =>
    asCommit(db.client, "authenticated", userId, async (q) => {
      const r = await q("select english.eng_save_draft($1, $2::jsonb, $3) as r", [activityId, JSON.stringify(content), base]);
      return (r.rows[0] as { r: { revision: number; saved_at: string; other_tab_changed: boolean } }).r;
    });
  const rpcAs = <T = unknown>(userId: string | null, sql: string, params: unknown[] = []) =>
    as(db.client, "authenticated", userId, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);

  // instances (see beforeAll)
  let x1: string; // An, A-W1, steps 1-3 released (reading step 3, listening step 2)
  let x2: string; // An, A-W1, steps 1-7 released (PRACTICE writing step 6)
  let x3: string; // An, A-W1, everything released (checkpoint writing 11, REVISE 13)
  let x4: string; // An, A-W1, steps 1-3 released; used for reschedule / skip
  let w0: string; // An, A-W0 baseline, everything released
  let b0: string; // Nguyên, B-W0 baseline, everything released

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    x1 = await assign("an", "A-W1-VOLCANOES", dueReleasing("A-W1-VOLCANOES", 2));
    x2 = await assign("an", "A-W1-VOLCANOES", dueReleasing("A-W1-VOLCANOES", 6));
    x3 = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
    x4 = await assign("an", "A-W1-VOLCANOES", dueReleasing("A-W1-VOLCANOES", 2));
    w0 = await assign("an", "A-W0-BASELINE", dueReleasingAll("A-W0-BASELINE"));
    b0 = await assign("nguyen", "B-W0-BASELINE", dueReleasingAll("B-W0-BASELINE"));
  });
  afterAll(async () => {
    await db?.drop();
  });

  // ---------------------------------------------------------------------------------------------------------
  describe("what a student can read: eng_my_inquiries / eng_my_home / eng_my_activity / eng_my_step_sources", () => {
    it("eng_my_inquiries lists only the caller's own instances", async () => {
      const mine = await rpcAs<{ instance_id: string; title_vi: string; due_on: string }[]>(an(), "select english.eng_my_inquiries() as r");
      expect(mine.map((i) => i.instance_id).sort()).toEqual([x1, x2, x3, x4, w0].sort());
      expect(mine.every((i) => i.title_vi && i.due_on)).toBe(true);
      const his = await rpcAs<{ instance_id: string }[]>(nguyen(), "select english.eng_my_inquiries() as r");
      expect(his.map((i) => i.instance_id)).toEqual([b0]);
      // staff have no "own" instances
      for (const staff of [s.users.parent, s.users.tutorAn]) {
        expect(await rpcAs(staff, "select english.eng_my_inquiries() as r")).toEqual([]);
      }
    });

    it("eng_my_home shows only released steps, with no questions, answers or skill codes", async () => {
      const home = await rpcAs<{ inquiries: { instance_id: string; steps: { step_no: number; activity_type: string; attempts: number }[] }[] }>(
        an(),
        "select english.eng_my_home() as r",
      );
      const byId = new Map(home.inquiries.map((i) => [i.instance_id, i.steps.map((st) => st.step_no)]));
      expect(byId.get(x1)).toEqual([1, 2, 3]);
      expect(byId.get(x2)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(byId.get(x3)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
      expect(byId.get(w0)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
      expect(byId.has(b0)).toBe(false); // another child's instance
      const text = JSON.stringify(home);
      for (const bad of [...FORBIDDEN, "stem", "options", "items"]) expect(text, bad).not.toContain(bad);
      // staff and outsiders get nothing
      expect(await rpcAs(s.users.parent, "select english.eng_my_home() as r")).toEqual({ inquiries: [] });
    });

    it("eng_my_home releases exactly the steps eng_my_released_steps releases, also after reschedule and skip", async () => {
      const stepNos = async () => {
        const home = await rpcAs<{ inquiries: { instance_id: string; steps: { step_no: number }[] }[] }>(an(), "select english.eng_my_home() as r");
        return (home.inquiries.find((i) => i.instance_id === x4)?.steps ?? []).map((st) => st.step_no);
      };
      const released = async () => {
        const r = await rpcAs<{ steps: { step_no: number }[] }>(an(), "select english.eng_my_released_steps($1) as r", [x4]);
        return r.steps.map((st) => st.step_no);
      };
      expect(await stepNos()).toEqual(await released());
      expect(await stepNos()).toEqual([1, 2, 3]);

      const step3 = await activity(x4, 3);
      const step2 = await activity(x4, 2);
      await q1("select english.eng_activity_event($1, 'reschedule', $2, 'test: later', $3)", [step3, addDays(TODAY, 3), s.members.parent]);
      await q1("select english.eng_activity_event($1, 'skip', null, 'test: skip', $2)", [step2, s.members.parent]);
      expect(await stepNos()).toEqual([1]);
      expect(await stepNos()).toEqual(await released());
      // a skipped / not-yet-open step is invisible everywhere a student can look
      expect(await rpcAs(an(), "select english.eng_my_activity($1) as r", [step2])).toBeNull();
      expect(await rpcAs(an(), "select english.eng_my_step_sources($1) as r", [step3])).toBeNull();
      await q1("select english.eng_activity_event($1, 'unskip', null, 'test: back', $2)", [step2, s.members.parent]);
      await q1("select english.eng_activity_event($1, 'reschedule', $2, 'test: today again', $3)", [step3, TODAY, s.members.parent]);
      expect(await stepNos()).toEqual([1, 2, 3]);
      expect(await stepNos()).toEqual(await released());
    });

    it("eng_my_activity returns the step's questions without keys, notes, skill codes or other steps; null for others", async () => {
      const step3 = await activity(x1, 3);
      const a = await rpcAs<Record<string, unknown>>(an(), "select english.eng_my_activity($1) as r", [step3]);
      expect(a).toMatchObject({ step_no: 3, activity_type: "ACT-SOURCE-QA", mode: "INDEPENDENT_CHECK", shape: "answers", supported: true, can_submit: true, attempts: [], draft: null });
      const items = (a.step as { items: { id: string; kind: string; stem: string; options: string[] }[] }).items;
      expect(items.map((i) => i.id)).toEqual(stepOf(template("A-W1-VOLCANOES"), 3).items.map((i) => i.id));
      expect(Object.keys(items[0]!).sort()).toEqual(["id", "kind", "options", "stem"]);
      const text = JSON.stringify(a);
      for (const bad of FORBIDDEN) expect(text, bad).not.toContain(bad);
      for (const it of stepOf(template("A-W1-VOLCANOES"), 3).items) {
        if (it.answer.length > 12) expect(text, it.id).not.toContain(it.answer);
      }
      // not mine → null (indistinguishable from "does not exist")
      expect(await rpcAs(nguyen(), "select english.eng_my_activity($1) as r", [step3])).toBeNull();
      expect(await rpcAs(s.users.parent, "select english.eng_my_activity($1) as r", [step3])).toBeNull();
      expect(await rpcAs(s.users.tutorAn, "select english.eng_my_activity($1) as r", [step3])).toBeNull();
      // not yet released → null
      expect(await rpcAs(an(), "select english.eng_my_activity($1) as r", [await activity(x1, 4)])).toBeNull();
    });

    it("eng_my_step_sources: the reading text for a reading step; never the listening transcript or any key", async () => {
      const tpl = template("A-W1-VOLCANOES");
      const reading = tpl.sources.find((x) => x.modality === "text")!;
      const audio = tpl.sources.find((x) => x.modality === "audio")!;
      const readingStep = await rpcAs<{ id: string; modality: string; text: string | null; url: string | null }[]>(
        an(),
        "select english.eng_my_step_sources($1) as r",
        [await activity(x1, 3)],
      );
      expect(readingStep.map((r) => r.id)).toEqual([reading.id]);
      expect(readingStep[0]?.text).toBe(reading.text);

      // the listening check (step 2) gets the audio source: a title and (maybe) a link, but NO text at all
      const listening = await rpcAs<{ id: string; modality: string; text: string | null }[]>(
        an(),
        "select english.eng_my_step_sources($1) as r",
        [await activity(x1, 2)],
      );
      expect(listening.map((r) => r.id)).toEqual([audio.id]);
      expect(listening[0]?.text).toBeNull();
      const everything = JSON.stringify([readingStep, listening]);
      expect(everything).not.toContain(audio.text.slice(0, 60));
      for (const bad of FORBIDDEN) expect(everything, bad).not.toContain(bad);

      // a supported step without a mapping gets no source (fail closed); other children and staff get null
      expect(await rpcAs(an(), "select english.eng_my_step_sources($1) as r", [await activity(x2, 6)])).toEqual([]);
      expect(await rpcAs(nguyen(), "select english.eng_my_step_sources($1) as r", [await activity(x1, 3)])).toBeNull();
      expect(await rpcAs(s.users.parent, "select english.eng_my_step_sources($1) as r", [await activity(x1, 3)])).toBeNull();
    });

    it("a step the app cannot do yet gives the student only a neutral status: no prompt, items, sources or self-check (API-level RPCs)", async () => {
      const keysOf = (o: unknown) => Object.keys(o as object).sort();
      const MINIMAL_ACTIVITY = ["activity_id", "activity_type", "can_submit", "date", "instance_id", "mode", "status_label_key", "step_no", "supported", "title_vi"];
      const MINIMAL_SOURCES = ["activity_id", "activity_type", "mode", "status_label_key", "supported"];
      const leaks = (text: string, promptEn: string) => {
        for (const bad of [...FORBIDDEN, "prompt_en", "self_check", "items", "stem", "options", '"text"', '"url"']) expect(text, bad).not.toContain(bad);
        expect(text).not.toContain(promptEn.slice(0, 40));
      };

      // B-W0 step 6 is the baseline reading turned over (SPEAK-LIVE, with the tutor), as Nguyên
      const b0t = template("B-W0-BASELINE");
      const step6 = await activity(b0, 6);
      expect(stepOf(b0t, 6).activity_type).toBe("ACT-SPEAK-LIVE");
      const act = await rpcAs<Record<string, unknown>>(nguyen(), "select english.eng_my_activity($1) as r", [step6]);
      const src = await rpcAs<Record<string, unknown>>(nguyen(), "select english.eng_my_step_sources($1) as r", [step6]);
      expect(keysOf(act)).toEqual(MINIMAL_ACTIVITY);
      expect(act).toMatchObject({ activity_type: "ACT-SPEAK-LIVE", mode: "INDEPENDENT_CHECK", supported: false, can_submit: false, status_label_key: "with_tutor" });
      expect(keysOf(src)).toEqual(MINIMAL_SOURCES);
      expect(src).toMatchObject({ supported: false, status_label_key: "with_tutor" });
      leaks(JSON.stringify([act, src]), stepOf(b0t, 6).prompt_en);
      // the text of the step-6 source (the short passage) never comes down either
      const passage = (await q1<{ body: string }>("select s.body from english.sources s where s.id = 'B-W0-BASELINE-S6'"))[0]?.body;
      expect(passage?.length).toBeGreaterThan(40);
      expect(JSON.stringify([act, src])).not.toContain(passage!.slice(0, 40));

      // every other kind of step the app does not do: canvas, mono speaking, self-review, revise (and live speaking in Track A)
      const tpl = template("A-W1-VOLCANOES");
      for (const [stepNo, label] of [[1, "with_tutor"], [4, "on_paper"], [5, "on_paper"], [7, "on_paper"], [13, "on_paper"]] as const) {
        const id = await activity(x3, stepNo);
        const a = await rpcAs<Record<string, unknown>>(an(), "select english.eng_my_activity($1) as r", [id]);
        const so = await rpcAs<Record<string, unknown>>(an(), "select english.eng_my_step_sources($1) as r", [id]);
        expect(keysOf(a), `step ${stepNo}`).toEqual(MINIMAL_ACTIVITY);
        expect(a, `step ${stepNo}`).toMatchObject({ supported: false, can_submit: false, status_label_key: label });
        expect(keysOf(so), `step ${stepNo}`).toEqual(MINIMAL_SOURCES);
        leaks(JSON.stringify([a, so]), stepOf(tpl, stepNo).prompt_en);
      }
      // the supported steps still get everything (nothing was lost for the real work)
      const full = await rpcAs<{ supported: boolean; step: { prompt_en: string } }>(an(), "select english.eng_my_activity($1) as r", [await activity(x3, 3)]);
      expect(full.supported).toBe(true);
      expect(full.step.prompt_en).toBe(stepOf(tpl, 3).prompt_en);
    });

    it("eng_my_released_steps hands the student no skill codes and no purpose flags; unsupported steps carry no text", async () => {
      const walkKeys = (v: unknown, out: string[] = []): string[] => {
        if (Array.isArray(v)) v.forEach((x) => walkKeys(x, out));
        else if (v && typeof v === "object") {
          for (const [k, x] of Object.entries(v)) {
            out.push(k);
            walkKeys(x, out);
          }
        }
        return out;
      };
      type Released = { instance_id: string; steps: { step_no: number; activity_id: string; activity_type: string; mode: string; planned_date: string; supported: boolean; prompt_en?: string; items?: { id: string }[] }[] };
      for (const [who, instance, templateId, total] of [[an, x3, "A-W1-VOLCANOES", 13], [nguyen, b0, "B-W0-BASELINE", 6]] as const) {
        const r = await rpcAs<Released>(who(), "select english.eng_my_released_steps($1) as r", [instance]);
        expect(r.steps).toHaveLength(total);
        const text = JSON.stringify(r);
        const keys = walkKeys(r);
        for (const k of keys) expect(k, `key ${k}`).not.toMatch(/target|purpose|answer|explanation|prompt_vi|review_note|transcript/);
        // no skill / template code (A-T1-TEXT-R, B-L2-CLOZE, A-W1-…). The header text is the template's own title and question: the
        // Track B baseline's question says \"B-v1\" (content wording, shown on the home page too), so the bare-prefix check is An's.
        expect(text).not.toMatch(/\b[AB]-[A-Z]+\d/);
        if (who === an) expect(text).not.toMatch(/\b[AB]-/);
        expect(text).not.toMatch(/AGG-|baseline|checkpoint|delayed_check|transfer_check/);
        const tpl = template(templateId);
        for (const st of r.steps) {
          const src = stepOf(tpl, st.step_no);
          expect(st.activity_type).toBe(src.activity_type);
          const supported = ["ACT-SOURCE-QA", "ACT-WRITE"].includes(st.activity_type) && st.mode !== "REVISION";
          expect(st.supported).toBe(supported);
          if (supported) {
            expect(st.prompt_en).toBe(src.prompt_en);
            expect((st.items ?? []).map((i) => i.id)).toEqual(src.items.map((i) => i.id));
          } else {
            expect(Object.keys(st).sort()).toEqual(["activity_id", "activity_type", "mode", "planned_date", "status_label_key", "step_no", "supported"]);
            expect(text).not.toContain(src.prompt_en.slice(0, 40));
          }
        }
      }
      // the same rules for who may call it as before (null for outsiders)
      expect(await rpcAs(nguyen(), "select english.eng_my_released_steps($1) as r", [x3])).toBeNull();
      expect(await rpcAs(s.users.parent, "select english.eng_my_released_steps($1) as r", [x3])).toBeNull();
    });

    it("the step-to-source table matches the prompts: 'Listen…' steps carry the audio, 'Read…' steps the text", async () => {
      const rows = await q1<{ template_id: string; step_no: number; source_id: string; modality: string }>(
        "select m.template_id, m.step_no, m.source_id, s.modality from english.template_step_sources m join english.sources s on s.id = m.source_id and s.version = m.source_version",
      );
      expect(rows).toHaveLength(16);
      for (const r of rows.filter((x) => x.template_id.startsWith("A-"))) {
        const prompt = stepOf(template(r.template_id), r.step_no).prompt_en;
        expect(/\blisten\b|\bhear\b/i.test(prompt), `${r.template_id}#${r.step_no}`).toBe(r.modality === "audio");
        expect(/\bread the text\b|^read\b/i.test(prompt) || r.modality === "audio", `${r.template_id}#${r.step_no}`).toBe(true);
      }
      // every Track A reading / listening check has its source (nothing silently missing)
      for (const id of ["A-W0-BASELINE", "A-W1-VOLCANOES", "A-W2-WATERCYCLE", "A-W3-EARTHQUAKES", "A-W4-PLANETS"]) {
        const t = template(id);
        for (const st of t.steps.filter((x) => x.activity_type === "ACT-SOURCE-QA" && /\b(listen|read the text)\b/i.test(x.prompt_en))) {
          expect(rows.some((r) => r.template_id === id && r.step_no === st.step_no), `${id}#${st.step_no}`).toBe(true);
        }
      }
      // staff may read the table, students may not; rows are insert-only
      expect(await rowsAs(db.client, "authenticated", s.users.parent, "select 1 from english.template_step_sources")).toHaveLength(16);
      expect(await rowsAs(db.client, "authenticated", an(), "select 1 from english.template_step_sources")).toEqual([]);
      for (const sql of ["update english.template_step_sources set position = 9", "delete from english.template_step_sources", "truncate english.template_step_sources"]) {
        await db.client.query("begin");
        await expect(db.client.query(sql), sql).rejects.toThrow(/insert-only/);
        await db.client.query("rollback");
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe("drafts (the one mutable learner table)", () => {
    it("autosave upserts, bumps the revision, warns (but saves) when another tab changed it, and the student can read it back", async () => {
      const step = await activity(x2, 6);
      const r1 = await saveAs(an(), step, { text: "Magma is melted rock." });
      expect(r1).toMatchObject({ revision: 1, other_tab_changed: false });
      const r2 = await saveAs(an(), step, { text: "Magma is melted rock. It is lighter", pasted: false, assistance: ["notes"] }, 1);
      expect(r2).toMatchObject({ revision: 2, other_tab_changed: false });
      // a stale tab still thinks it is at revision 1: saved anyway, flagged
      const r3 = await saveAs(an(), step, { text: "stale tab text" }, 1);
      expect(r3).toMatchObject({ revision: 3, other_tab_changed: true });
      const own = await rowsAs<{ content: { text: string }; revision: number }>(db.client, "authenticated", an(), "select content, revision from english.working_drafts");
      expect(own).toEqual([{ content: { text: "stale tab text" }, revision: 3 }]);
      // it comes back through eng_my_activity too
      const a = await rpcAs<{ draft: { content: { text: string }; revision: number } }>(an(), "select english.eng_my_activity($1) as r", [step]);
      expect(a.draft).toMatchObject({ content: { text: "stale tab text" }, revision: 3 });
      // nobody else reads it
      expect(await rowsAs(db.client, "authenticated", nguyen(), "select 1 from english.working_drafts")).toEqual([]);
      expect(await rowsAs(db.client, "authenticated", s.users.tutorNguyen, "select 1 from english.working_drafts")).toEqual([]);
      expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, "select 1 from english.working_drafts")).toHaveLength(1);
    });

    it("two tabs that both started with no draft: the second one (base revision 0) is warned, and a lone first save is not", async () => {
      const step = await activity(x3, 6);
      // tab 1 and tab 2 both opened the page with no saved draft, so each reports base 0
      const first = await saveAs(an(), step, { text: "tab one" }, 0);
      expect(first).toMatchObject({ revision: 1, other_tab_changed: false });
      const second = await saveAs(an(), step, { text: "tab two" }, 0);
      expect(second).toMatchObject({ revision: 2, other_tab_changed: true }); // saved over, but flagged
      // tab 2 now knows revision 2 and is quiet again
      expect(await saveAs(an(), step, { text: "tab two, more" }, 2)).toMatchObject({ revision: 3, other_tab_changed: false });
      await db.client.query("delete from english.working_drafts where activity_instance_id = $1", [step]);
    });

    it("rejects bad drafts, other children, staff and steps that are not open or not supported", async () => {
      const step6 = await activity(x2, 6);
      const fail = async (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ code });
      await fail(saveAs(an(), step6, { text: "x".repeat(20001) }), "22023");
      await fail(saveAs(an(), step6, { text: "ok", extra: 1 }), "22023");
      await fail(saveAs(an(), step6, { answers: { "no-such-item": "x" } }), "22023");
      await fail(saveAs(an(), step6, { assistance: ["telepathy"] }), "22023");
      await fail(saveAs(nguyen(), step6, { text: "not mine" }), "P0002");
      await fail(saveAs(s.users.parent, step6, { text: "staff" }), "42501");
      await fail(saveAs(s.users.tutorAn, step6, { text: "staff" }), "42501");
      await fail(saveAs(an(), await activity(x2, 4), { text: "x" }), "22023"); // canvas: not in the app yet
      await fail(saveAs(an(), await activity(x1, 4), { text: "x" }), "P0002"); // not released
      expect((await errorAs(db.client, "anon", null, "select english.eng_save_draft($1, '{}'::jsonb)", [step6]))?.code).toBe("42501");
    });

    it("no direct writes to any new table, for students or anyone else", async () => {
      const tables = ["working_drafts", "attempts", "artifact_versions", "assistance_events", "exposure_log", "episodes", "attempt_auto_checks"];
      for (const t of tables) {
        for (const role of ["authenticated", "anon", "service_role"] as const) {
          const user = role === "authenticated" ? an() : null;
          for (const sql of [`insert into english.${t} default values`, `update english.${t} set learner_id = learner_id`, `delete from english.${t}`, `truncate english.${t}`]) {
            expect((await errorAs(db.client, role, user, sql))?.code, `${role}: ${sql}`).toBe("42501");
          }
        }
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe("submit: ACT-SOURCE-QA (reading check, step 3 of x1)", () => {
    const tpl = template("A-W1-VOLCANOES");
    const items = stepOf(tpl, 3).items;
    const optionOf = (id: string, letter: string) => {
      const it = items.find((i) => i.id === id)!;
      return it.options[letter.charCodeAt(0) - 97]!;
    };
    const content = () => ({
      answers: {
        "W1-R1": optionOf("W1-R1", "b"), // correct
        "W1-R2": "  melted ROCK under the ground ",
        "W1-R7": "Probably not.",
      },
    });
    const clientId = randomUUID();
    let receipt: Receipt;
    let step3: string;

    it("stores an immutable attempt with its receipt, one episode, exposure rows, the help declaration and the auto-check", async () => {
      step3 = await activity(x1, 3);
      receipt = await submitAs(an(), step3, clientId, content(), ["none"]);
      expect(receipt).toMatchObject({ attempt_no: 1, replayed: false });
      expect(receipt.hash).toMatch(/^[0-9a-f]{64}$/);
      const expectedHash = (await q1<{ h: string }>("select encode(sha256(convert_to($1::jsonb::text, 'UTF8')), 'hex') as h", [JSON.stringify(content())]))[0]!.h;
      expect(receipt.hash).toBe(expectedHash);

      const [att] = await q1<Record<string, unknown>>("select * from english.attempts where id = $1", [receipt.attempt_id]);
      expect(att).toMatchObject({
        activity_instance_id: step3,
        learner_id: s.learners.an,
        attempt_no: 1,
        parent_attempt_id: null,
        learning_family_id: receipt.attempt_id,
        mode: "INDEPENDENT_CHECK",
        provenance: "in_app",
        declared_assistance: ["none"],
        client_submission_id: clientId,
      });
      const [art] = await q1<{ kind: string; version: number; is_raw: boolean; content: unknown; created_by: string }>("select * from english.artifact_versions where attempt_id = $1", [receipt.attempt_id]);
      expect(art).toMatchObject({ kind: "answers", version: 1, is_raw: true, content: content(), created_by: s.members.studentAn });

      const [ep] = await q1<{ is_first_attempt: boolean; context_id: string; observed_directly: boolean; facets: Record<string, boolean> }>("select * from english.episodes where attempt_id = $1", [receipt.attempt_id]);
      expect(ep).toMatchObject({ is_first_attempt: true, context_id: "A-W1-VOLCANOES", observed_directly: false });
      expect(ep?.facets).toEqual({ baseline: false, checkpoint: false, delayed_check: false, transfer_check: false });

      const expo = await q1<{ target_key: string; source: string }>("select target_key, source from english.exposure_log where attempt_id = $1", [receipt.attempt_id]);
      expect(expo).toEqual([{ target_key: "A-T1-TEXT-R", source: "practice" }]);
      expect(await count("select count(*)::int as n from english.assistance_events where attempt_id = $1", [receipt.attempt_id])).toBe(0);
    });

    it("auto-checks closed items against the key snapshot; open and short items are left to a person; no 0-4 score anywhere", async () => {
      const [row] = await q1<{ checks: { total: number; checked: number; correct: number; items: Record<string, { kind: string; result: string }> } }>(
        "select checks from english.attempt_auto_checks where attempt_id = $1",
        [receipt.attempt_id],
      );
      // the only closed item is W1-R1 (mcq); the rest are short / open
      expect(row?.checks).toEqual({
        version: 1,
        total: 8,
        checked: 1,
        correct: 1,
        items: {
          "W1-R1": { kind: "mcq", result: "correct" },
          "W1-R2": { kind: "short", result: "needs_person" },
          "W1-R3": { kind: "short", result: "needs_person" },
          "W1-R4": { kind: "short", result: "needs_person" },
          "W1-R5": { kind: "short", result: "needs_person" },
          "W1-R6": { kind: "short", result: "needs_person" },
          "W1-R7": { kind: "open", result: "needs_person" },
          "W1-R8": { kind: "short", result: "needs_person" },
        },
      });
    });

    it("sending the same submission again returns the same receipt and adds nothing (replay)", async () => {
      const again = await submitAs(an(), step3, clientId, content(), ["none"]);
      expect(again).toEqual({ ...receipt, replayed: true });
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [step3])).toBe(1);
      expect(await count("select count(*)::int as n from english.episodes where learner_id = $1 and context_id = 'A-W1-VOLCANOES'", [s.learners.an])).toBe(1);
    });

    it("the same id with different content, or for another step, is a conflict (23505)", async () => {
      const other = { answers: { "W1-R1": optionOf("W1-R1", "a") } };
      await expect(submitAs(an(), step3, clientId, other)).rejects.toMatchObject({ code: "23505" });
      await expect(submitAs(an(), await activity(x1, 2), clientId, content())).rejects.toMatchObject({ code: "23505" });
      expect(await count("select count(*)::int as n from english.attempts where learner_id = $1", [s.learners.an])).toBe(1);
    });

    it("an independent check can be submitted once: a second try with a new id is refused", async () => {
      await expect(submitAs(an(), step3, randomUUID(), content())).rejects.toMatchObject({ code: "23505" });
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [step3])).toBe(1);
      const a = await rpcAs<{ can_submit: boolean; attempts: { attempt_no: number }[] }>(an(), "select english.eng_my_activity($1) as r", [step3]);
      expect(a.can_submit).toBe(false);
      expect(a.attempts.map((x) => x.attempt_no)).toEqual([1]);
      // and the draft endpoint refuses too
      await expect(saveAs(an(), step3, { answers: {} })).rejects.toMatchObject({ code: "23505" });
    });

    it("the draft is gone after the submit", async () => {
      expect(await count("select count(*)::int as n from english.working_drafts where activity_instance_id = $1", [step3])).toBe(0);
    });

    it("4 simultaneous submissions with one client id create exactly one attempt and one receipt", async () => {
      const step2 = await activity(x1, 2);
      const id = randomUUID();
      const body = { answers: { "W1-L1": stepOf(tpl, 2).items[0]!.options[1]! } };
      const clients = await Promise.all(
        [1, 2, 3, 4].map(async () => {
          const c = new Client(pgConfigFromUrl(db.url));
          await c.connect();
          return c;
        }),
      );
      try {
        const results = await Promise.all(
          clients.map(async (c) => {
            await c.query("begin");
            try {
              await c.query("select set_config('request.jwt.claim.sub', $1, true)", [an()]);
              await c.query("set local role authenticated");
              const r = await c.query("select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [step2, id, JSON.stringify(body), ["notes"]]);
              await c.query("commit");
              return (r.rows[0] as { r: Receipt }).r;
            } catch (err) {
              await c.query("rollback");
              throw err;
            }
          }),
        );
        expect(new Set(results.map((r) => r.attempt_id)).size).toBe(1);
        expect(results.filter((r) => !r.replayed)).toHaveLength(1);
      } finally {
        await Promise.all(clients.map((c) => c.end()));
      }
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [step2])).toBe(1);
      expect(await count("select count(*)::int as n from english.episodes e join english.attempts a on a.id = e.attempt_id where a.activity_instance_id = $1", [step2])).toBe(1);
      expect(await count("select count(*)::int as n from english.assistance_events e join english.attempts a on a.id = e.attempt_id where a.activity_instance_id = $1", [step2])).toBe(1);
    });

    it("4 simultaneous submissions of an INDEPENDENT_CHECK with DIFFERENT client ids create exactly one attempt; the others are a clean 409 (23505)", async () => {
      const step = await activity(x4, 2);
      const body = { answers: { "W1-L1": stepOf(tpl, 2).items[0]!.options[0]! } };
      const clients = await Promise.all(
        [1, 2, 3, 4].map(async () => {
          const c = new Client(pgConfigFromUrl(db.url));
          await c.connect();
          return c;
        }),
      );
      try {
        const results = await Promise.allSettled(
          clients.map(async (c) => {
            await c.query("begin");
            try {
              await c.query("select set_config('request.jwt.claim.sub', $1, true)", [an()]);
              await c.query("set local role authenticated");
              const r = await c.query("select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [step, randomUUID(), JSON.stringify(body), ["none"]]);
              await c.query("commit");
              return (r.rows[0] as { r: Receipt }).r;
            } catch (err) {
              await c.query("rollback");
              throw err;
            }
          }),
        );
        const ok = results.filter((r): r is PromiseFulfilledResult<Receipt> => r.status === "fulfilled");
        const bad = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        expect(ok).toHaveLength(1);
        expect(ok[0]!.value).toMatchObject({ attempt_no: 1, replayed: false });
        expect(bad).toHaveLength(3);
        for (const b of bad) expect(b.reason).toMatchObject({ code: "23505" }); // 23505 -> HTTP 409, never a 500 / a second row
      } finally {
        await Promise.all(clients.map((c) => c.end()));
      }
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [step])).toBe(1);
      expect(await count("select count(*)::int as n from english.episodes e join english.attempts a on a.id = e.attempt_id where a.activity_instance_id = $1", [step])).toBe(1);
      expect(await count("select count(*)::int as n from english.exposure_log e join english.attempts a on a.id = e.attempt_id where a.activity_instance_id = $1", [step])).toBe(1);
    });

    it("a replay must match the declared help and the provenance too: same id with different help or provenance is a 409, not a silent old receipt", async () => {
      // `receipt` / `clientId` / `step3` come from the first test of this block: content(), ["none"], in_app
      await expect(submitAs(an(), step3, clientId, content(), ["notes"])).rejects.toMatchObject({ code: "23505" });
      await expect(submitAs(an(), step3, clientId, content(), ["none"], "pasted")).rejects.toMatchObject({ code: "23505" });
      await expect(submitAs(an(), step3, clientId, content(), ["dictionary", "notes"])).rejects.toMatchObject({ code: "23505" });
      // exactly the same declaration (the order of help items does not matter) is still a replay
      expect(await submitAs(an(), step3, clientId, content(), ["none"], "in_app")).toEqual({ ...receipt, replayed: true });
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [step3])).toBe(1);
      expect(await count("select count(*)::int as n from english.assistance_events where attempt_id = $1", [receipt.attempt_id])).toBe(0);
      // a replay of a submission with several help items, sent in another order, is also the same receipt
      const step = await activity(x2, 3);
      const id = randomUUID();
      const body = { answers: { "W1-R1": optionOf("W1-R1", "b") } };
      const first = await submitAs(an(), step, id, body, ["notes", "dictionary"], "pasted");
      expect(await submitAs(an(), step, id, body, ["dictionary", "notes"], "pasted")).toEqual({ ...first, replayed: true });
      await expect(submitAs(an(), step, id, body, ["dictionary", "notes"], "in_app")).rejects.toMatchObject({ code: "23505" });
      await expect(submitAs(an(), step, id, body, ["dictionary"], "pasted")).rejects.toMatchObject({ code: "23505" });
    });

    it("rejects: unreleased step, unsupported step types, another child's step, staff, anon, bad help declarations, bad content", async () => {
      const ok = { answers: { "W1-R1": optionOf("W1-R1", "b") } };
      const fail = (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ code });
      await fail(submitAs(an(), await activity(x1, 4), randomUUID(), ok), "P0002"); // not released yet
      await fail(submitAs(an(), await activity(x1, 1), randomUUID(), ok), "22023"); // SPEAK-LIVE: with the tutor
      await fail(submitAs(an(), await activity(x2, 4), randomUUID(), ok), "22023"); // CANVAS-BASIC: not in the app yet
      await fail(submitAs(nguyen(), step3, randomUUID(), ok), "P0002"); // another child
      await fail(submitAs(s.users.parent, step3, randomUUID(), ok), "42501"); // staff cannot submit as the student
      await fail(submitAs(s.users.tutorAn, step3, randomUUID(), ok), "42501");
      expect((await errorAs(db.client, "anon", null, "select english.eng_submit_attempt($1, $2, '{}'::jsonb, '{none}', 'in_app')", [step3, randomUUID()]))?.code).toBe("42501");
      // x4 step 3 is open for An: use it for the validation cases (none of them may create a row)
      const open = await activity(x4, 3);
      await fail(submitAs(an(), open, randomUUID(), ok, []), "22023"); // no declaration
      await fail(submitAs(an(), open, randomUUID(), ok, ["none", "notes"]), "22023"); // "none" must be alone
      await fail(submitAs(an(), open, randomUUID(), ok, ["telepathy"]), "22023");
      await fail(submitAs(an(), open, randomUUID(), ok, ["none"], "manual_import"), "22023"); // only in_app / pasted from a student
      await fail(submitAs(an(), open, randomUUID(), ok, ["none"], "tutor_live"), "22023");
      await fail(submitAs(an(), open, randomUUID(), { answers: {} }), "22023"); // nothing answered
      await fail(submitAs(an(), open, randomUUID(), { answers: { "W1-R1": "   " } }), "22023");
      await fail(submitAs(an(), open, randomUUID(), { answers: { "W1-L1": "x" } }), "22023"); // an item of another step
      await fail(submitAs(an(), open, randomUUID(), { answers: { "W1-R1": "not one of the options" } }), "22023");
      await fail(submitAs(an(), open, randomUUID(), { answers: { "W1-R2": "x".repeat(2001) } }), "22023");
      await fail(submitAs(an(), open, randomUUID(), { text: "wrong shape" }), "22023");
      await fail(submitAs(an(), open, randomUUID(), { answers: { "W1-R1": optionOf("W1-R1", "b") }, text: "extra" }), "22023");
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [open])).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe("submit: ACT-WRITE, provenance, baseline, checkpoint, retry lineage", () => {
    it("a baseline writing step is stored as text; the episode carries the baseline facet; one exposure row per target", async () => {
      const step12 = await activity(w0, 12);
      const r = await submitAs(an(), step12, randomUUID(), { text: "Leaves change colour because the days get shorter, so ..." }, ["none"]);
      const [art] = await q1<{ kind: string; content: unknown }>("select kind, content from english.artifact_versions where attempt_id = $1", [r.attempt_id]);
      expect(art).toEqual({ kind: "text", content: { text: "Leaves change colour because the days get shorter, so ..." } });
      const [ep] = await q1<{ is_first_attempt: boolean; facets: Record<string, boolean> }>("select is_first_attempt, facets from english.episodes where attempt_id = $1", [r.attempt_id]);
      expect(ep?.is_first_attempt).toBe(true);
      expect(ep?.facets).toMatchObject({ baseline: true, checkpoint: false });
      const expo = await q1<{ target_key: string }>("select target_key from english.exposure_log where attempt_id = $1 order by target_key", [r.attempt_id]);
      expect(expo.map((e) => e.target_key)).toEqual(["A-L3-CAUSE-W", "A-L3-PARA-W", "A-T4-CAUSE"]);
      // a writing step without auto-checkable items has no auto-check row
      expect(await count("select count(*)::int as n from english.attempt_auto_checks where attempt_id = $1", [r.attempt_id])).toBe(0);
    });

    it("a checkpoint writing step sets the checkpoint facet, and a baseline one does not", async () => {
      const r = await submitAs(an(), await activity(x3, 11), randomUUID(), { text: "Some volcanoes explode because their magma is thick." });
      const [ep] = await q1<{ facets: Record<string, boolean> }>("select facets from english.episodes where attempt_id = $1", [r.attempt_id]);
      expect(ep?.facets).toEqual({ baseline: false, checkpoint: true, delayed_check: false, transfer_check: false });
    });

    it("pasted text records provenance 'pasted' and an external_declared event, next to each ticked help", async () => {
      const r = await submitAs(an(), await activity(w0, 13), randomUUID(), { answers: { "BL-G1": "went to the beach" } }, ["notes", "dictionary", "asked_someone", "ai_outside"], "pasted");
      const [att] = await q1<{ provenance: string; declared_assistance: string[] }>("select provenance, declared_assistance from english.attempts where id = $1", [r.attempt_id]);
      expect(att).toEqual({ provenance: "pasted", declared_assistance: ["ai_outside", "asked_someone", "dictionary", "notes"] });
      const events = await q1<{ kind: string; detail: string; verification: string; affects_target_keys: string[] }>(
        "select kind, detail, verification, affects_target_keys from english.assistance_events where attempt_id = $1 order by id",
        [r.attempt_id],
      );
      expect(events.map((e) => [e.kind, e.detail])).toEqual([
        ["external_declared", "ai_outside"],
        ["external_declared", "asked_someone"],
        ["external_declared", "dictionary"],
        ["notes", "notes"],
        ["external_declared", "pasted"],
      ]);
      expect(events.every((e) => e.verification === "declared")).toBe(true);
      // step 13 of the baseline has no skill attached: the events say so, not a made-up target
      expect(events.every((e) => e.affects_target_keys.length === 0)).toBe(true);
    });

    it("declared help is attached to every target of the step", async () => {
      const step12 = await activity(x3, 12);
      expect(step12).toBeTruthy();
      // x3 step 11 already used; use the PRACTICE writing step of x2 (targets: A-L3-CAUSE-W, A-L2-CHUNKS)
      const r = await submitAs(an(), await activity(x2, 6), randomUUID(), { text: "Magma is hot rock." }, ["dictionary"]);
      const [ev] = await q1<{ affects_target_keys: string[]; verification: string }>("select affects_target_keys, verification from english.assistance_events where attempt_id = $1", [r.attempt_id]);
      expect(ev?.affects_target_keys).toEqual(["A-L3-CAUSE-W", "A-L2-CHUNKS"]);
      expect(ev?.verification).toBe("declared");
    });

    it("PRACTICE can be retried: attempt 2 is not a first attempt, shares the learning family, exposure source is 'retry'", async () => {
      const step6 = await activity(x2, 6);
      const first = (await q1<{ id: string }>("select id from english.attempts where activity_instance_id = $1 and attempt_no = 1", [step6]))[0]!.id;
      const r = await submitAs(an(), step6, randomUUID(), { text: "Magma is melted rock. It is lighter than rock, so it rises." });
      expect(r.attempt_no).toBe(2);
      const [att] = await q1<{ parent_attempt_id: string; learning_family_id: string; mode: string }>("select parent_attempt_id, learning_family_id, mode from english.attempts where id = $1", [r.attempt_id]);
      expect(att).toEqual({ parent_attempt_id: first, learning_family_id: first, mode: "PRACTICE" });
      const [ep] = await q1<{ is_first_attempt: boolean }>("select is_first_attempt from english.episodes where attempt_id = $1", [r.attempt_id]);
      expect(ep?.is_first_attempt).toBe(false);
      const expo = await q1<{ source: string }>("select distinct source from english.exposure_log where attempt_id = $1", [r.attempt_id]);
      expect(expo).toEqual([{ source: "retry" }]);
      const a = await rpcAs<{ can_submit: boolean; attempts: unknown[] }>(an(), "select english.eng_my_activity($1) as r", [step6]);
      expect(a.can_submit).toBe(true);
      expect(a.attempts).toHaveLength(2);
      // a third try works too; the unique (activity, attempt_no) holds
      expect((await submitAs(an(), step6, randomUUID(), { text: "Third try." })).attempt_no).toBe(3);
    });

    it("a revision step is never submitted in this slice (so it can never count as a first attempt)", async () => {
      const step13 = await activity(x3, 13);
      await expect(submitAs(an(), step13, randomUUID(), { text: "revised" })).rejects.toMatchObject({ code: "22023" });
      expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [step13])).toBe(0);
    });

    it("the episode formula is also enforced by the data: one episode per attempt, first attempt only for attempt 1", async () => {
      const bad = await q1<{ n: number }>(
        `select count(*)::int as n from english.episodes e join english.attempts a on a.id = e.attempt_id
         where e.is_first_attempt <> (a.attempt_no = 1 and a.mode <> 'REVISION')`,
      );
      expect(bad[0]?.n).toBe(0);
      const dup = await q1<{ n: number }>("select count(*)::int as n from (select attempt_id from english.episodes group by 1 having count(*) > 1) d");
      expect(dup[0]?.n).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe("auto-check rules (mcq, gap, word_form, free text, alternatives)", () => {
    const b0t = template("B-W0-BASELINE");
    const closed = stepOf(b0t, 1).items;

    it("Track B exam-style step: letters resolve against unlabelled options; correct / wrong / blank are counted", async () => {
      const step1 = await activity(b0, 1);
      const answers: Record<string, string> = {};
      const expected: Record<string, string> = {};
      closed.forEach((it, i) => {
        const keyIdx = it.answer.trim().toUpperCase().charCodeAt(0) - 65;
        if (i % 5 === 4) {
          expected[it.id] = "blank";
        } else if (i % 2 === 0) {
          answers[it.id] = it.options[keyIdx]!;
          expected[it.id] = "correct";
        } else {
          answers[it.id] = it.options[(keyIdx + 1) % it.options.length]!;
          expected[it.id] = "incorrect";
        }
      });
      const r = await submitAs(nguyen(), step1, randomUUID(), { answers }, ["dictionary"]);
      const [row] = await q1<{ checks: { total: number; checked: number; correct: number; items: Record<string, { kind: string; result: string }> } }>(
        "select checks from english.attempt_auto_checks where attempt_id = $1",
        [r.attempt_id],
      );
      expect(Object.fromEntries(Object.entries(row!.checks.items).map(([k, v]) => [k, v.result]))).toEqual(expected);
      const results = Object.values(expected);
      expect(row?.checks).toMatchObject({
        total: closed.length,
        checked: closed.length,
        correct: results.filter((x) => x === "correct").length,
      });
      // kinds are recorded (gap / word_form behave like multiple choice when they have options)
      expect(new Set(Object.values(row!.checks.items).map((v) => v.kind))).toEqual(new Set(["mcq", "gap", "word_form"]));
      // the episode of a baseline step in Track B carries the baseline facet, with its aggregate/skill ids as exposure
      const [ep] = await q1<{ facets: Record<string, boolean> }>("select facets from english.episodes where attempt_id = $1", [r.attempt_id]);
      expect(ep?.facets.baseline).toBe(true);
      expect(await q1("select target_key from english.exposure_log where attempt_id = $1 order by 1", [r.attempt_id])).toEqual([
        { target_key: "AGG-B-EXAM-MOCK" },
        { target_key: "B-L2-CLOZE" },
      ]);
    });

    it("free-text gap: case and spacing do not matter; transform / short / open are never auto-checked", async () => {
      // build the A-W0 step-13 shape on a fresh baseline instance
      const fresh = await assign("an", "A-W0-BASELINE", dueReleasingAll("A-W0-BASELINE"));
      const step = await activity(fresh, 13);
      const r = await submitAs(an(), step, randomUUID(), {
        answers: { "BL-G1": "  Went   to the BEACH ", "BL-G2": "had a blue bike", "BL-G3": "An elephant is bigger than a cat.", "BL-G5": "" },
      });
      const [row] = await q1<{ checks: { items: Record<string, { result: string }>; checked: number; correct: number } }>("select checks from english.attempt_auto_checks where attempt_id = $1", [r.attempt_id]);
      const res = (id: string) => row?.checks.items[id]?.result;
      expect(res("BL-G1")).toBe("correct");
      expect(res("BL-G2")).toBe("incorrect");
      expect(res("BL-G5")).toBe("blank");
      expect(res("BL-G3")).toBe("needs_person"); // transform
      expect(res("BL-G4")).toBe("needs_person");
      expect(row?.checks.checked).toBe(6); // the six gap items
      expect(row?.checks.correct).toBe(1);
    });

    it("free-text gap normalisation: NFC, non-breaking and zero-width characters, curly quotes, spacing, trailing . ! ? and case all compare equal", async () => {
      const norm = async (t: string) => (await q1<{ n: string }>("select english.eng_norm_answer($1) as n", [t]))[0]!.n;
      const KEY = "went to the beach";
      const same = [
        "went to the beach",
        "went to the beach.",
        "Went to the beach!",
        "went to the beach?",
        "went to the beach...",
        "  WENT   to  the\tbeach \n",
        "went\u00A0to\u00A0the\u00A0beach", // NBSP
        "went to the beach\u00A0.", // NBSP before the full stop
        "went\u202Fto the beach", // narrow NBSP
        "went\u2009to the beach", // thin space
        "went\u200B to the beach", // zero-width space
        "we\u200Bnt to th\u200Ce be\u200Dach\uFEFF", // zero-width non-joiner / joiner / BOM, inside words and at the end
        "\uFEFFwent to the beach",
      ];
      for (const t of same) expect(await norm(t), JSON.stringify(t)).toBe(KEY);
      // NFC: "é" as e + combining acute equals the single code point
      expect(await norm("caf\u0065\u0301")).toBe(await norm("caf\u00E9"));
      // curly quotes / apostrophes become straight ones
      expect(await norm("don\u2019t")).toBe("don't");
      expect(await norm("don\u2018t")).toBe("don't");
      expect(await norm("\u201CHello\u201D")).toBe('"hello"');
      // what must NOT be forgiven: other words, inner punctuation, other letters
      for (const t of ["went to the beaches", "went, to the beach", "went to the  beach x", "go to the beach", "wnet to the beach"]) {
        expect(await norm(t), t).not.toBe(KEY);
      }

      // end to end through the real submit path: A-W0 step 13, BL-G1 ("went to the beach"), BL-G10 ("is made")
      const results: Record<string, string> = {};
      for (const [label, value] of [
        ["dot", "went to the beach."],
        ["nbsp", "went\u00A0to the beach"],
        ["zwsp", "went to\u200B the beach"],
        ["bang", "WENT TO THE BEACH!"],
        ["wrong", "went to the park."],
      ] as const) {
        const fresh = await assign("an", "A-W0-BASELINE", dueReleasingAll("A-W0-BASELINE"));
        const r = await submitAs(an(), await activity(fresh, 13), randomUUID(), { answers: { "BL-G1": value, "BL-G10": "is\u00A0made. " } });
        const [row] = await q1<{ checks: { items: Record<string, { result: string }> } }>("select checks from english.attempt_auto_checks where attempt_id = $1", [r.attempt_id]);
        results[label] = `${row!.checks.items["BL-G1"]!.result}/${row!.checks.items["BL-G10"]!.result}`;
      }
      expect(results).toEqual({ dot: "correct/correct", nbsp: "correct/correct", zwsp: "correct/correct", bang: "correct/correct", wrong: "incorrect/correct" });

      // alternatives written with " / " keep working, also with odd spaces around the slash and curly quotes in the key
      await db.client.query("begin");
      try {
        await db.client.query(
          `insert into english.instance_item_keys(inquiry_instance_id, learner_id, item_id, step_no, kind, answer)
           values ($1, $2, 'n-gap', 99, 'answer', 'colour\u00A0/\u00A0color'), ($1, $2, 'n-apo', 99, 'answer', 'I don\u2019t know / I do not know')`,
          [x1, s.learners.an],
        );
        const step = { items: [{ id: "n-gap", kind: "gap", stem: "x", options: [] }, { id: "n-apo", kind: "gap", stem: "x", options: [] }] };
        const run = async (answers: Record<string, string>) =>
          (await db.client.query<{ r: { items: Record<string, { result: string }> } }>("select english.eng_compute_auto_checks($1, $2::jsonb, $3::jsonb) as r", [x1, JSON.stringify(step), JSON.stringify(answers)])).rows[0]!.r.items;
        const a = await run({ "n-gap": "Color.", "n-apo": "I don't know!" });
        expect([a["n-gap"]?.result, a["n-apo"]?.result]).toEqual(["correct", "correct"]);
        const b = await run({ "n-gap": "colour\u00A0", "n-apo": "i do not know" });
        expect([b["n-gap"]?.result, b["n-apo"]?.result]).toEqual(["correct", "correct"]);
        const c = await run({ "n-gap": "colours", "n-apo": "I dont know" });
        expect([c["n-gap"]?.result, c["n-apo"]?.result]).toEqual(["incorrect", "incorrect"]);
        // a box holding only an NBSP / zero-width space is blank, not wrong
        const d = await run({ "n-gap": "\u00A0\u200B", "n-apo": " " });
        expect([d["n-gap"]?.result, d["n-apo"]?.result]).toEqual(["blank", "blank"]);
      } finally {
        await db.client.query("rollback");
      }
    });

    it("answers separated by ' / ' in a key are all accepted; labelled options resolve by label; table-driven against resolveMcqAnswer", async () => {
      // 1) accepted alternatives, through the real function with a throwaway instance key set
      const step = {
        items: [
          { id: "t-gap", kind: "gap", stem: "x", options: [] },
          { id: "t-mcq", kind: "mcq", stem: "x", options: ["a) red", "b) blue", "c) green"] },
          { id: "t-wf", kind: "word_form", stem: "x", options: ["happy", "happily", "happiness"] },
        ],
      };
      const instance = x1; // keys are looked up by (instance, item id): use fresh ids that exist for no real item
      await db.client.query("begin");
      try {
        // owner-level insert inside a rolled-back transaction: the table is append-only for everyone else
        await db.client.query(
          `insert into english.instance_item_keys(inquiry_instance_id, learner_id, item_id, step_no, kind, answer)
           values ($1, $2, 't-gap', 99, 'answer', 'colour / color'), ($1, $2, 't-mcq', 99, 'answer', 'b'), ($1, $2, 't-wf', 99, 'answer', 'C')`,
          [instance, s.learners.an],
        );
        const run = async (answers: Record<string, string>) =>
          (await db.client.query<{ r: { items: Record<string, { result: string }> } }>("select english.eng_compute_auto_checks($1, $2::jsonb, $3::jsonb) as r", [instance, JSON.stringify(step), JSON.stringify(answers)])).rows[0]!.r.items;
        const a = await run({ "t-gap": "Color", "t-mcq": "b) blue", "t-wf": "happiness" });
        expect([a["t-gap"]?.result, a["t-mcq"]?.result, a["t-wf"]?.result]).toEqual(["correct", "correct", "correct"]);
        const b = await run({ "t-gap": " COLOUR", "t-mcq": "c) green", "t-wf": "happy" });
        expect([b["t-gap"]?.result, b["t-mcq"]?.result, b["t-wf"]?.result]).toEqual(["correct", "incorrect", "incorrect"]);
        const c = await run({ "t-gap": "colours" });
        expect([c["t-gap"]?.result, c["t-mcq"]?.result, c["t-wf"]?.result]).toEqual(["incorrect", "blank", "blank"]);
      } finally {
        await db.client.query("rollback");
      }

      // 2) the SQL option resolver agrees with the TypeScript one used by CI on a table of tricky inputs…
      const cases: [string[], string][] = [
        [["healthy", "breakfast", "heavy", "meaning"], "D"],
        [["healthy", "breakfast", "heavy", "meaning"], "e"],
        [["a) red", "b) blue", "c) green"], "b"],
        [["a) red", "b) blue", "c) green"], "C"],
        [["a. red", "b. blue", "c. green", "d. pink"], "d"],
        [["a) red", "b) blue", "c) green"], "d"],
        [["a) red", "blue", "c) green"], "b"], // mixed labels: position
        [["a) red", "blue", "c) green"], "z"],
        [["a) red", "b) blue"], "  B) BLUE "],
        [["A", "B", "C", "D"], "c"],
        [["to run", "running", "ran"], "Running"],
        [["x", "y"], ""],
        [["x", "y"], "xy"],
        [["h) one", "g) two"], "g"],
      ];
      for (const [options, answer] of cases) {
        const sql = (await q1<{ i: number | null }>("select english.eng_resolve_option($1::jsonb, $2) as i", [JSON.stringify(options), answer]))[0]!.i;
        expect(sql, JSON.stringify([options, answer])).toBe(resolveMcqAnswer(options, answer));
      }
      // …and on every real closed item of every published template (the keys CI already checks)
      let checked = 0;
      for (const id of ["A-W0-BASELINE", "A-W1-VOLCANOES", "A-W2-WATERCYCLE", "A-W3-EARTHQUAKES", "A-W4-PLANETS", "B-W0-BASELINE"]) {
        for (const st of template(id).steps) {
          for (const it of st.items.filter((x) => ["mcq", "gap", "word_form"].includes(x.kind) && x.options.length > 0)) {
            const sql = (await q1<{ i: number | null }>("select english.eng_resolve_option($1::jsonb, $2) as i", [JSON.stringify(it.options), it.answer]))[0]!.i;
            expect(sql, `${id} ${it.id}`).toBe(resolveMcqAnswer(it.options, it.answer));
            checked += 1;
          }
        }
      }
      expect(checked).toBeGreaterThan(50);
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe("who can read what afterwards", () => {
    it("a student reads their own attempts and artifacts, but never auto-checks, episodes, exposure or the declared help", async () => {
      const mine = await rowsAs<{ learner_id: string }>(db.client, "authenticated", an(), "select learner_id from english.attempts");
      expect(mine.length).toBeGreaterThan(3);
      expect(new Set(mine.map((r) => r.learner_id))).toEqual(new Set([s.learners.an]));
      expect((await rowsAs(db.client, "authenticated", an(), "select 1 from english.artifact_versions")).length).toBe(mine.length);
      for (const t of ["attempt_auto_checks", "episodes", "exposure_log", "assistance_events"]) {
        expect(await rowsAs(db.client, "authenticated", an(), `select * from english.${t}`), t).toEqual([]);
        expect(await rowsAs(db.client, "authenticated", nguyen(), `select * from english.${t}`), `${t} / other child`).toEqual([]);
      }
      // the attempts table itself carries no result column
      const cols = (await q1<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'english' and table_name = 'attempts'")).map((c) => c.column_name);
      expect(cols.some((c) => /check|score|correct|result/.test(c))).toBe(false);
      // nothing in a student's own rows says right or wrong
      const text = JSON.stringify(await rowsAs(db.client, "authenticated", an(), "select a.*, v.content from english.attempts a join english.artifact_versions v on v.attempt_id = a.id"));
      for (const bad of ["correct", "incorrect", "needs_person", "blank"]) expect(text, bad).not.toContain(bad);
    });

    it("Nguyên sees only their own attempt; An's tutor reads An's checks and episodes but not Nguyên's; the other tutor the reverse", async () => {
      expect(await rowsAs(db.client, "authenticated", nguyen(), "select learner_id from english.attempts")).toEqual([{ learner_id: s.learners.nguyen }]);
      for (const t of ["attempt_auto_checks", "episodes", "exposure_log", "assistance_events"]) {
        const tutorAn = await rowsAs<{ learner_id: string }>(db.client, "authenticated", s.users.tutorAn, `select learner_id from english.${t}`);
        expect(tutorAn.length, t).toBeGreaterThan(0);
        expect(new Set(tutorAn.map((r) => r.learner_id)), t).toEqual(new Set([s.learners.an]));
        const tutorNg = await rowsAs<{ learner_id: string }>(db.client, "authenticated", s.users.tutorNguyen, `select learner_id from english.${t}`);
        expect(new Set(tutorNg.map((r) => r.learner_id)), t).toEqual(new Set([s.learners.nguyen]));
        const parent = await rowsAs<{ learner_id: string }>(db.client, "authenticated", s.users.parent, `select learner_id from english.${t}`);
        expect(new Set(parent.map((r) => r.learner_id)), t).toEqual(new Set([s.learners.an, s.learners.nguyen]));
      }
      expect(await rowsAs(db.client, "authenticated", null, "select 1 from english.attempts")).toEqual([]);
      expect((await errorAs(db.client, "anon", null, "select 1 from english.attempts"))?.code).toBe("42501");
    });

    it("the learner tables are append-only for the owner too, and service_role cannot write them", async () => {
      for (const t of ["attempts", "artifact_versions", "assistance_events", "exposure_log", "episodes", "attempt_auto_checks"]) {
        const col = t === "attempts" ? "mode" : t === "artifact_versions" ? "kind" : t === "assistance_events" ? "kind" : t === "exposure_log" ? "source" : t === "episodes" ? "context_id" : "checked_at";
        for (const [sql, msg] of [
          [`update english.${t} set ${col} = ${col}`, /UPDATE is forbidden/],
          [`delete from english.${t}`, /DELETE is forbidden/],
          [`truncate english.${t}`, /TRUNCATE is forbidden|cannot truncate/],
        ] as const) {
          await db.client.query("begin");
          await expect(db.client.query(sql), `${t}: ${sql}`).rejects.toThrow(msg);
          await db.client.query("rollback");
        }
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------
  describe("purge (FR-21)", () => {
    it("removes every S4 row of the learner (and only theirs), then the learner", async () => {
      const tables = ["attempts", "artifact_versions", "assistance_events", "exposure_log", "episodes", "attempt_auto_checks", "working_drafts"];
      const nOf = async (learner: string) => {
        const out: Record<string, number> = {};
        for (const t of tables) out[t] = (await count(`select count(*)::int as n from english.${t} where learner_id = $1`, [learner]))!;
        return out;
      };
      await saveAs(an(), await activity(x2, 6), { text: "An draft that must survive the other child's purge" });
      await saveAs(nguyen(), await activity(b0, 5), { text: "Nguyên draft" });
      const anBefore = await nOf(s.learners.an);
      const ngBefore = await nOf(s.learners.nguyen);
      expect(ngBefore.attempts).toBe(1);
      expect(ngBefore.episodes).toBe(1);
      expect(anBefore.attempts).toBeGreaterThan(5);

      const real = (await q1<{ r: { deleted: Record<string, number> } }>("select english.eng_purge_learner($1, $2) as r", [s.learners.nguyen, s.users.parent]))[0]!.r;
      expect(real.deleted).toMatchObject({
        attempts: 1,
        artifact_versions: 1,
        episodes: 1,
        attempt_auto_checks: 1,
        working_drafts: 1,
        learners: 1,
      });
      expect(await nOf(s.learners.nguyen)).toEqual(Object.fromEntries(tables.map((t) => [t, 0])));
      expect(await nOf(s.learners.an)).toEqual(anBefore);
      expect(await count("select count(*)::int as n from english.learners where id = $1", [s.learners.nguyen])).toBe(0);
      expect(await count("select count(*)::int as n from english.learners where id = $1", [s.learners.an])).toBe(1);
    });
  });
});
