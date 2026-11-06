import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../scripts/lib/migrate";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";
import { recomputeLearner } from "../../lib/engine/runner";
import { pgEngineStore } from "../../scripts/lib/enginePg";
import { buildStudioBuild } from "../../lib/studio/buildTemplate";
import type { StudioContext } from "../../lib/studio/context";
import { normalizeExtract } from "../../lib/studio/normalize";
import { aiExtractSchema, type StudioDraft } from "../../lib/studio/schema";
import { canApprove, validateDraft } from "../../lib/studio/validate";
import { FAKE_EXTRACT } from "../unit/fixtures/studio";

/** Studio B1 (migration 0024): tables, guards, RLS; then approve → assign → work → verdicts → result → purge. One database for the file. */
describe("Studio B1 (migration 0024)", () => {
  let db: TestDb;
  let s: Seeded;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  /** A bare draft row written as the table owner (tests only: the app writes through the functions of Task 3). */
  const rawDraft = async (learner: string, status = "draft") =>
    (await q1<{ id: string }>(
      `insert into english.studio_drafts(family_id, learner_id, track_id, title, status, created_by_member, updated_by_member, client_id)
       select l.family_id, l.id, l.track_id, 'Đề thử', $2, $3, $3, $4 from english.learners l where l.id = $1 returning id`,
      [learner, status, s.members.parent, `raw-${randomUUID()}`],
    ))[0]!.id;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. tables, guards, RLS", () => {
    it("applies twice without error (idempotent)", async () => {
      await applyMigrations(db.client, { all: true });
      expect((await q1("select 1 from english.schema_migrations where version = '0024'")).length).toBe(1);
    });

    it("weekly topics keep their rules; Studio ids and owners are checked", async () => {
      expect(await q1("select count(*)::int as n from english.inquiry_templates where kind <> 'topic'")).toEqual([{ n: 0 }]);
      const tpl = (await q1<Record<string, unknown>>("select * from english.inquiry_templates where id = 'B-W1-HOMEWORK' and version = 1"))[0]!;
      // a Studio row needs its own id pattern and an owner; a topic row may not have an owner
      await fail(
        q1(
          `insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket,
             target_ids, steps, sources, catalogue_version, source_hash, kind)
           values ('B-W9-X', 1, 'B', 't', 't', 't', 0, current_date, current_date, 'studio', '{}', $1, '[]', $2, 'h', 'studio')`,
          [JSON.stringify(tpl.steps), tpl.catalogue_version],
        ),
        "23514",
      );
      await fail(
        q1(
          `insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket,
             target_ids, steps, sources, catalogue_version, source_hash, kind, family_id, learner_id)
           values ('B-ST-000999', 1, 'B', 't', 't', 't', 0, current_date, current_date, 'studio', '{}', $1, '[]', $2, 'h', 'topic', $3, $4)`,
          [JSON.stringify(tpl.steps), tpl.catalogue_version, s.familyId, s.learners.nguyen],
        ),
        "23514",
      );
    });

    it("a draft changes only while it is a draft, along the allowed steps; it is never deleted outside the purge", async () => {
      const id = await rawDraft(s.learners.nguyen, "extracting");
      await q1("update english.studio_drafts set status = 'draft', payload = '{\"parts\":[],\"passages\":[],\"items\":[]}' where id = $1", [id]);
      await fail(q1("update english.studio_drafts set status = 'extracting' where id = $1", [id]), "23514");
      await fail(q1("update english.studio_drafts set learner_id = $2 where id = $1", [id, s.learners.an]), "42501");
      await fail(q1("update english.studio_drafts set payload = '[]' where id = $1", [id]), "23514");
      await q1("update english.studio_drafts set status = 'discarded' where id = $1", [id]);
      await fail(q1("update english.studio_drafts set title = 'x' where id = $1", [id]), "42501");
      await fail(q1("delete from english.studio_drafts where id = $1", [id]), "42501");
      await fail(q1("truncate english.studio_drafts"), "42501");
    });

    it("AI tables: no app role reads them; nobody writes them directly; ai_runs never changes", async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const t of ["ai_settings", "ai_runs"]) {
          expect((await q1<{ ok: boolean }>(`select has_table_privilege('${role}', 'english.${t}', 'select') as ok`))[0]?.ok, `${role} ${t}`).toBe(false);
        }
      }
      for (const t of ["ai_settings", "ai_runs", "studio_drafts", "studio_item_meta", "accepted_additions", "item_decisions"]) {
        for (const priv of ["insert", "update", "delete"]) {
          expect((await q1<{ ok: boolean }>(`select has_table_privilege('service_role', 'english.${t}', '${priv}') as ok`))[0]?.ok, `${t} ${priv}`).toBe(false);
        }
      }
      const run = (await q1<{ id: string }>("insert into english.ai_runs(family_id, purpose, status) values ($1, 'studio_extract', 'refused_off') returning id", [s.familyId]))[0]!.id;
      await fail(q1("update english.ai_runs set error_code = 'x' where id = $1", [run]), "42501");
      await fail(q1("delete from english.ai_runs where id = $1", [run]), "42501");
      await fail(q1("insert into english.ai_runs(family_id, purpose, status, cost_usd) values ($1, 'studio_extract', 'refused_cap', 0.01)", [s.familyId]), "23514");
      await fail(q1("insert into english.ai_settings(family_id, monthly_cap_usd) values ($1, 11)", [s.familyId]), "23514");
    });

    it("students read no Studio table; the other child's tutor reads nothing of this child", async () => {
      await rawDraft(s.learners.nguyen);
      for (const u of [s.users.studentAn, s.users.studentNguyen, s.users.tutorAn]) {
        for (const t of ["studio_drafts", "studio_item_meta", "accepted_additions", "item_decisions"]) {
          expect(await rowsAs(db.client, "authenticated", u, `select * from english.${t} where learner_id = $1`, [s.learners.nguyen]), `${t}`).toEqual([]);
        }
      }
      expect((await rowsAs(db.client, "authenticated", s.users.tutorNguyen, "select id from english.studio_drafts")).length).toBeGreaterThan(0);
      expect((await rowsAs(db.client, "authenticated", s.users.parent, "select id from english.studio_drafts")).length).toBeGreaterThan(0);
    });

    it("files: .docx only for Studio kinds; old kinds keep their rules", async () => {
      const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const ins = (kind: string, mime: string) => {
        const id = randomUUID();
        const ext = mime === docx ? "docx" : mime === "application/pdf" ? "pdf" : "png";
        return q1(
          "insert into english.files(id, family_id, learner_id, kind, path, mime, bytes, uploaded_by_member) values ($1, $2, $3, $4, $5, $6, 10, $7)",
          [id, s.familyId, s.learners.nguyen, kind, `${s.familyId}/${s.learners.nguyen}/${id}.${ext}`, mime, s.members.parent],
        );
      };
      await ins("studio_test", docx);
      await ins("studio_key", "application/pdf");
      await fail(ins("answer_key", docx), "23514");
      await fail(ins("studio_test", "image/png"), "23514");
      await ins("answer_key", "image/png");
    });

    it("results: a Studio result may be a practice with a frame; paper-only items need an attempt", async () => {
      await fail(
        q1(
          `insert into english.results(learner_id, mode, context, attempt, source, title, total_items, correct, wrong_items, not_in_app_items, taken_on, recorded_by_member, recorded_role, client_id)
           values ($1, 'quick', 'home', 'first', 'practice', 't', 5, 2, '{1,2}', '{3}', current_date, $2, 'parent', $3)`,
          [s.learners.nguyen, s.members.parent, `r-${randomUUID()}`],
        ),
        "23514",
      );
    });
  });

  describe("3–5. AI gate, drafts, approve, assign, work, verdicts, result, engine, purge", () => {
    const svc = async <T = unknown>(sql: string, params: unknown[] = []) =>
      asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
    const asStudent = async <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
      asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
    /** The review context of Nguyên, read from the database the way lib/studio/load.ts does (all tags "near"). */
    const ctxOf = async (learner: string): Promise<StudioContext> => {
      const tags = await q1<{ key: string; label: string; group_vi: string | null; related: string[] | null }>(
        `select t.key, t.label_vi as label, t.group_vi,
                (select sl.related from english.skill_leaves sl where sl.kind = 'tag' and sl.track_id = t.track_id and sl.ref_key = t.key limit 1) as related
         from english.error_tags t join english.learners l on l.track_id = t.track_id where l.id = $1 and t.retired_at is null`,
        [learner],
      );
      const skills = (await q1<{ s: { id: string; title_vi: string }[] }>("select english.eng_studio_skills($1) as s", [learner]))[0]!.s;
      return {
        tags: tags.map((t) => ({ key: t.key, label: t.label, reading: t.group_vi === "Kỹ năng đọc", near: true, related: t.related ?? [], group: t.group_vi })),
        skills: skills.map((x) => ({ id: x.id, label: x.title_vi })),
      };
    };
    let draftId = "";
    let templateId = "";
    let activityId = "";
    let attempt1 = "";

    it("AI settings: only the parent reads / changes them; enabling writes an ai_text consent for each child; the gate follows switch, consent and cap", async () => {
      await fail(svc("select english.eng_ai_settings($1) as r", [s.members.tutorNguyen]), "42501", /\(parent_only\)/);
      expect(await svc<{ allowed: boolean; reason: string }>("select english.eng_ai_gate($1) as r", [s.learners.nguyen])).toMatchObject({ allowed: false, reason: "off" });
      const on = await svc<{ enabled: boolean; learners: { ai_text: boolean }[] }>("select english.eng_set_ai_settings(true, 'ai-studio-v1', $1) as r", [s.members.parent]);
      expect(on.enabled).toBe(true);
      expect(on.learners.every((l) => l.ai_text === true)).toBe(true);
      expect(await svc("select english.eng_ai_gate($1) as r", [s.learners.nguyen])).toMatchObject({ allowed: true, reason: null, soft_reached: false });
      // month of Viet Nam: last month's spend does not count; ≥ $8 warns; ≥ $10 refuses
      await q1("insert into english.ai_runs(family_id, purpose, status, cost_usd, at) values ($1, 'studio_extract', 'ok', 9.5, now() - interval '40 days')", [s.familyId]);
      expect(await svc("select english.eng_ai_gate($1) as r", [s.learners.nguyen])).toMatchObject({ allowed: true, soft_reached: false });
      await q1("insert into english.ai_runs(family_id, purpose, status, cost_usd) values ($1, 'studio_extract', 'ok', 8.2)", [s.familyId]);
      expect(await svc("select english.eng_ai_gate($1) as r", [s.learners.nguyen])).toMatchObject({ allowed: true, soft_reached: true });
      await q1("insert into english.ai_runs(family_id, purpose, status, cost_usd) values ($1, 'studio_extract', 'ok', 1.9)", [s.familyId]);
      expect(await svc("select english.eng_ai_gate($1) as r", [s.learners.nguyen])).toMatchObject({ allowed: false, reason: "cap" });
    });

    it("skills offered by Studio = current set ∩ ACT-SOURCE-QA evidence (P1)", async () => {
      const ids = async (l: string) => (await svc<{ id: string }[]>("select english.eng_studio_skills($1) as r", [l])).map((x) => x.id).sort();
      expect(await ids(s.learners.an)).toEqual(["A-T1-TEXT-L", "A-T1-TEXT-R"]);
      expect(await ids(s.learners.nguyen)).toEqual(["B-L2-CLOZE", "B-T1-ARG-R", "B-T1-EXAM-R", "B-T2-ASSUME-R", "B-T5-DATAOP"]);
    });

    it("draft: the child's tutor creates (idempotent), saves with the optimistic lock; the other child's tutor cannot", async () => {
      const file = { id: randomUUID(), mime: "application/pdf", bytes: 1234 };
      await fail(svc("select english.eng_create_studio_draft($1, 'Đề', $2::jsonb, null, true, $3, 'c-aaaaaaaa') as r", [s.learners.nguyen, JSON.stringify(file), s.members.tutorAn]), "42501");
      const made = await svc<{ id: string; status: string; replayed: boolean }>(
        "select english.eng_create_studio_draft($1, 'Destination B1 — Unit 5', $2::jsonb, null, true, $3, 'c-bbbbbbbb') as r",
        [s.learners.nguyen, JSON.stringify(file), s.members.tutorNguyen],
      );
      expect(made).toMatchObject({ status: "extracting", replayed: false });
      expect(await svc("select english.eng_create_studio_draft($1, 'Destination B1 — Unit 5', $2::jsonb, null, true, $3, 'c-bbbbbbbb') as r", [s.learners.nguyen, JSON.stringify(file), s.members.tutorNguyen])).toMatchObject({ id: made.id, replayed: true });
      draftId = made.id;
      const ctx = await ctxOf(s.learners.nguyen);
      const payload = normalizeExtract(aiExtractSchema.parse(FAKE_EXTRACT), ctx);
      expect((await svc<{ applied: boolean }>("select english.eng_finish_studio_extraction($1, $2::jsonb, null) as r", [draftId, JSON.stringify(payload)])).applied).toBe(true);
      expect((await svc<{ applied: boolean }>("select english.eng_finish_studio_extraction($1, $2::jsonb, null) as r", [draftId, JSON.stringify(payload)])).applied).toBe(false);
      const d1 = await svc<{ updated_at: string; status: string }>("select english.eng_studio_draft($1) as r", [draftId]);
      expect(d1.status).toBe("draft");
      await fail(svc("select english.eng_save_studio_draft($1, 'x', $2::jsonb, '2000-01-01 00:00:00+00', $3) as r", [draftId, JSON.stringify(payload), s.members.tutorNguyen]), "23505", /\(draft_changed\)/);
    });

    it("approve: blocked draft is fixed in TS; the template is a published Studio template of Nguyên with keys, reading text, meta and frame", async () => {
      const ctx = await ctxOf(s.learners.nguyen);
      const cur = await svc<{ payload: StudioDraft; updated_at: string }>("select english.eng_studio_draft($1) as r", [draftId]);
      expect(canApprove(validateDraft(cur.payload, ctx))).toBe(false);
      const fixed: StudioDraft = {
        ...cur.payload,
        // item 8 gets its key; item 7 counts for B-L2-CLOZE so a decided needs_person item reaches the engine (Step: engine)
        items: cur.payload.items.map((i) => (i.n === 8 ? { ...i, key: "is said to be" } : i.n === 7 ? { ...i, target_id: "B-L2-CLOZE" } : i)),
      };
      expect(canApprove(validateDraft(fixed, ctx))).toBe(true);
      const saved = await svc<{ updated_at: string }>("select english.eng_save_studio_draft($1, 'Destination B1 — Unit 5', $2::jsonb, $3, $4) as r", [draftId, JSON.stringify(fixed), cur.updated_at, s.members.tutorNguyen]);
      const build = buildStudioBuild(fixed);
      await fail(svc("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [draftId, saved.updated_at, JSON.stringify(build), s.members.tutorAn]), "42501");
      const ok = await svc<{ template_id: string; version: number; frame_id: string }>("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [draftId, saved.updated_at, JSON.stringify(build), s.members.tutorNguyen]);
      expect(ok.template_id).toMatch(/^B-ST-[0-9]{6}$/);
      expect(ok.version).toBe(1);
      templateId = ok.template_id;
      const tpl = (await q1<{ kind: string; learner_id: string; target_ids: string[]; steps: unknown; published: boolean }>(
        "select kind, learner_id, target_ids, steps, published_at is not null as published from english.inquiry_templates where id = $1", [templateId]))[0]!;
      expect(tpl).toMatchObject({ kind: "studio", learner_id: s.learners.nguyen, published: true, target_ids: ["B-L2-CLOZE", "B-T1-EXAM-R", "B-T2-ASSUME-R"] });
      expect(JSON.stringify(tpl.steps)).not.toMatch(/"(answer|explanation_vi)":/);
      expect((await q1("select 1 from english.template_item_keys where template_id = $1", [templateId])).length).toBe(8);
      expect((await q1("select 1 from english.studio_item_meta where template_id = $1", [templateId])).length).toBe(9);
      expect((await q1<{ id: string }>("select source_id as id from english.template_step_sources where template_id = $1", [templateId])).map((r) => r.id)).toEqual([`ST-${templateId}-P1`]);
      expect((await q1<{ total_items: number; title: string }>("select total_items, title from english.test_frames where id = $1", [ok.frame_id]))[0]).toEqual({ total_items: 9, title: `Destination B1 — Unit 5 (${templateId})` });
      await fail(svc("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [draftId, saved.updated_at, JSON.stringify(build), s.members.tutorNguyen]), "23514");
      await fail(q1("update english.studio_drafts set title = 'x' where id = $1", [draftId]), "42501");
    });

    it("who reads a Studio template: the parent and Nguyên's tutor; never An's tutor or a student; it never shows up in 'Giao chủ đề'", async () => {
      for (const t of ["inquiry_templates", "template_item_keys", "template_step_sources", "studio_item_meta"]) {
        const col = t === "inquiry_templates" ? "id" : "template_id";
        const sql = `select 1 from english.${t} where ${col} = $1`;
        expect((await rowsAs(db.client, "authenticated", s.users.parent, sql, [templateId])).length, `${t} parent`).toBeGreaterThan(0);
        expect((await rowsAs(db.client, "authenticated", s.users.tutorNguyen, sql, [templateId])).length, `${t} tutor`).toBeGreaterThan(0);
        for (const u of [s.users.tutorAn, s.users.studentNguyen, s.users.studentAn]) expect(await rowsAs(db.client, "authenticated", u, sql, [templateId]), t).toEqual([]);
      }
      expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, "select 1 from english.sources where id like $1", [`ST-${templateId}-%`])).toEqual([]);
    });

    it("assign: start day and due day; the child sees the step from the start day, items without keys", async () => {
      const today = (await q1<{ d: string }>("select english.eng_today_vn()::text as d"))[0]!.d;
      await fail(svc("select english.eng_assign_studio($1, $2::date + 3, $2::date, $3, 'as-11111111') as r", [draftId, today, s.members.parent]), "23514", /\(start_after_due\)/);
      const a = await svc<{ activity_id: string; replayed: boolean }>("select english.eng_assign_studio($1, $2::date, $2::date + 3, $3, 'as-22222222') as r", [draftId, today, s.members.parent]);
      expect(a.replayed).toBe(false);
      expect((await svc<{ replayed: boolean }>("select english.eng_assign_studio($1, $2::date, $2::date + 3, $3, 'as-22222222') as r", [draftId, today, s.members.parent])).replayed).toBe(true);
      activityId = a.activity_id;
      const act = await asStudent<{ step: { items: Record<string, unknown>[] } }>(s.users.studentNguyen, "select english.eng_my_activity($1) as r", [activityId]);
      expect(act.step.items).toHaveLength(8);
      expect(JSON.stringify(act)).not.toMatch(/"answer":|explanation_vi|target_id|tag_key/);
      await fail(svc("select english.eng_assign_inquiry($1, $2, 1, current_date + 3, $3, 'as-33333333') as r", [s.learners.an, templateId, s.members.parent]), "23514");
    });

    it("work: app checks the closed items; transform not in the key waits for a person; no result yet; the child sees wrong + waiting, never a count", async () => {
      const answers = {
        q1: "B. had", q2: "B. can't", q3: "A. off", q4: "C. A visit that changed Lan's plans",
        q6: "happyness", q7: "I wish I could", q8: "is said to be a",
      };
      const r = await asStudent<{ attempt_id: string }>(s.users.studentNguyen, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [activityId, randomUUID(), JSON.stringify({ answers }), ["none"]]);
      attempt1 = r.attempt_id;
      const checks = (await q1<{ c: { items: Record<string, { result: string }> } }>("select checks as c from english.attempt_auto_checks where attempt_id = $1", [attempt1]))[0]!.c;
      expect(Object.fromEntries(Object.entries(checks.items).map(([k, v]) => [k, v.result]))).toEqual({
        q1: "correct", q2: "incorrect", q3: "correct", q4: "correct", q5: "blank", q6: "incorrect", q7: "needs_person", q8: "needs_person",
      });
      expect(await q1("select 1 from english.results where attempt_id = $1", [attempt1])).toEqual([]);
      const review = await asStudent<{ wrong: { n: number; given: string; expected: string | null }[]; pending: number[] }>(s.users.studentNguyen, "select english.eng_my_studio_review($1) as r", [activityId]);
      expect(review.wrong.map((w) => w.n)).toEqual([2, 5, 6]);
      expect(review.wrong[0]).toMatchObject({ given: "B. can't", expected: "A. must" });
      expect(review.wrong.find((w) => w.n === 6)?.expected).toBe("happiness");
      expect(review.pending).toEqual([7, 8]);
      expect(JSON.stringify(review)).not.toMatch(/"(correct|total|checked|score|tag_key|target_id)"/);
      expect(await asStudent(s.users.studentAn, "select english.eng_my_studio_review($1) as r", [activityId])).toBeNull();
      // a weekly-topic step gives {}
      const topicStep = (await q1<{ id: string }>("select a.id from english.activity_instances a join english.inquiry_instances i on i.id = a.inquiry_instance_id where a.learner_id = $1 and i.template_id not like '%-ST-%' limit 1", [s.learners.nguyen]))[0];
      if (topicStep) expect(await asStudent(s.users.studentNguyen, "select english.eng_my_studio_review($1) as r", [topicStep.id])).toEqual({});
    });

    it("Hộp duyệt lists the waiting items for Nguyên's tutor and the parent, not for An's tutor", async () => {
      const p = await svc<{ count: number; items: { attempt_id: string; items: { n: number; expected: string; given: string }[] }[] }>("select english.eng_studio_pending($1, false) as r", [s.members.tutorNguyen]);
      expect(p.count).toBe(2);
      expect(p.items[0]?.items.map((i) => [i.n, i.expected, i.given])).toEqual([[7, "wish I could", "I wish I could"], [8, "is said to be", "is said to be a"]]);
      expect((await svc<{ count: number }>("select english.eng_studio_pending($1, false) as r", [s.members.parent])).count).toBe(2);
      expect((await svc<{ count: number }>("select english.eng_studio_pending($1, false) as r", [s.members.tutorAn])).count).toBe(0);
    });

    it("verdicts: once per item; the last one writes the result + tag marks (first attempt counts); 'Đúng' adds an accepted answer; the engine reads decided items", async () => {
      await fail(svc("select english.eng_decide_studio_items($1, $2::jsonb, $3, 'dc-00000000') as r", [attempt1, JSON.stringify([{ item_id: "q2", result: "correct" }]), s.members.tutorNguyen]), "23514", /\(not_pending_item\)/);
      await fail(svc("select english.eng_decide_studio_items($1, $2::jsonb, $3, 'dc-00000001') as r", [attempt1, JSON.stringify([{ item_id: "q7", result: "correct" }]), s.members.tutorAn]), "42501");
      const one = await svc<{ decided: number; pending: number; result: { recorded: boolean } }>("select english.eng_decide_studio_items($1, $2::jsonb, $3, 'dc-11111111') as r", [attempt1, JSON.stringify([{ item_id: "q7", result: "correct" }]), s.members.tutorNguyen]);
      expect(one).toMatchObject({ decided: 1, pending: 1, result: { recorded: false } });
      await fail(svc("select english.eng_decide_studio_items($1, $2::jsonb, $3, 'dc-22222222') as r", [attempt1, JSON.stringify([{ item_id: "q7", result: "incorrect" }]), s.members.tutorNguyen]), "23505", /\(already_decided\)/);
      const two = await svc<{ pending: number; result: { recorded: boolean; correct: number; in_app: number } }>("select english.eng_decide_studio_items($1, $2::jsonb, $3, 'dc-33333333') as r", [attempt1, JSON.stringify([{ item_id: "q8", result: "correct" }]), s.members.parent]);
      expect(two).toMatchObject({ pending: 0, result: { recorded: true, correct: 5, in_app: 8 } });
      const res = (await q1<Record<string, unknown>>("select mode, source, attempt, total_items, correct, wrong_items, not_in_app_items, recorded_role from english.results where attempt_id = $1", [attempt1]))[0];
      expect(res).toEqual({ mode: "frame", source: "practice", attempt: "first", total_items: 9, correct: 5, wrong_items: [2, 5, 6], not_in_app_items: [9], recorded_role: "parent" });
      expect((await q1<{ tag_key: string; counts: boolean }>("select tag_key, counts from english.tag_marks where source = 'practice' and learner_id = $1 order by item_no", [s.learners.nguyen]))).toEqual([
        { tag_key: "modal-suy-doan", counts: true }, { tag_key: "doc-inference", counts: true }, { tag_key: "dang-tu", counts: true },
      ]);
      expect((await q1<{ answer: string }>("select answer from english.accepted_additions where template_id = $1 order by item_id", [templateId])).map((r) => r.answer)).toEqual(["I wish I could", "is said to be a"]);
      // the engine input carries the decided q7 for B-L2-CLOZE, in the same JSON shape
      const inputs = await svc<{ auto: { attempt_id: string; items: { item_id: string; result: string }[] }[] }>("select english.eng_engine_inputs($1, array['B-L2-CLOZE']) as r", [s.learners.nguyen]);
      expect(inputs.auto.find((a) => a.attempt_id === attempt1)?.items).toEqual([
        { item_id: "q3", target_key: "B-L2-CLOZE", result: "correct" },
        { item_id: "q6", target_key: "B-L2-CLOZE", result: "incorrect" },
        { item_id: "q7", target_key: "B-L2-CLOZE", result: "correct" },
      ]);
      const r = await recomputeLearner(pgEngineStore(db.client), s.learners.nguyen, null);
      expect(r.results.length).toBeGreaterThan(0);
      // the child now sees only the wrong items, nothing waits
      const review = await asStudent<{ wrong: { n: number }[]; pending: number[] }>(s.users.studentNguyen, "select english.eng_my_studio_review($1) as r", [activityId]);
      expect(review).toMatchObject({ pending: [] });
      expect(review.wrong.map((w) => w.n)).toEqual([2, 5, 6]);
    });

    it("retry: accepted answers check the next attempt at once; the result is written at submit, as a retry that does not count", async () => {
      const answers = { q1: "B. had", q2: "A. must", q3: "A. off", q4: "C. A visit that changed Lan's plans", q5: "B. The robot room was interesting", q6: "happiness", q7: "I wish I could", q8: "is said to be a" };
      const r = await asStudent<{ attempt_id: string }>(s.users.studentNguyen, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [activityId, randomUUID(), JSON.stringify({ answers }), ["none"]]);
      const res = (await q1<Record<string, unknown>>("select attempt, correct, wrong_items from english.results where attempt_id = $1", [r.attempt_id]))[0];
      expect(res).toEqual({ attempt: "retry", correct: 8, wrong_items: [] });
      expect(await q1("select 1 from english.app_errors where code = 'studio_result'")).toEqual([]);
    });

    it("edit after approval → a new version of the same template; the assigned work keeps version 1", async () => {
      const e = await svc<{ id: string; replayed: boolean }>("select english.eng_edit_studio_draft($1, $2, 'ed-11111111') as r", [draftId, s.members.tutorNguyen]);
      expect((await svc<{ id: string }>("select english.eng_edit_studio_draft($1, $2, 'ed-22222222') as r", [draftId, s.members.parent])).id).toBe(e.id);
      const cur = await svc<{ payload: StudioDraft; updated_at: string }>("select english.eng_studio_draft($1) as r", [e.id]);
      const ok = await svc<{ template_id: string; version: number }>("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [e.id, cur.updated_at, JSON.stringify(buildStudioBuild(cur.payload)), s.members.tutorNguyen]);
      expect(ok).toEqual(expect.objectContaining({ template_id: templateId, version: 2 }));
      expect((await q1<{ v: number }>("select template_version as v from english.inquiry_instances where template_id = $1", [templateId])).map((x) => x.v)).toEqual([1]);
    });

    it("purge of Nguyên removes every Studio row (templates included), keeps An, keeps the AI cost ledger; weekly topics stay protected", async () => {
      const preview = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [s.learners.nguyen]);
      expect(preview.counts).toMatchObject({ studio_templates: 2, studio_drafts: 4, item_decisions: 2, accepted_additions: 2, studio_item_meta: 18 });
      const runsBefore = (await q1<{ n: number }>("select count(*)::int as n from english.ai_runs"))[0]!.n;
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, null) as r", [s.learners.nguyen]);
      expect(receipt.deleted).toMatchObject({ studio_templates: 2, studio_sources: 2, studio_template_keys: 16, studio_step_sources: 2, studio_drafts: 4 });
      for (const sql of [
        "select 1 from english.inquiry_templates where kind = 'studio'",
        "select 1 from english.sources where id like 'ST-%'",
        "select 1 from english.studio_drafts",
        "select 1 from english.item_decisions",
      ]) expect(await q1(sql), sql).toEqual([]);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.ai_runs"))[0]!.n).toBe(runsBefore);
      expect((await q1("select 1 from english.learners where id = $1", [s.learners.an])).length).toBe(1);
      await fail(q1("delete from english.inquiry_templates where id = 'A-W1-VOLCANOES'"), "42501");
    });
  });

  // (later tasks add describe blocks here)
});
