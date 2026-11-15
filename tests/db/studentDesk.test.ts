import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { buildStudioBuild } from "../../lib/studio/buildTemplate";
import type { StudioContext } from "../../lib/studio/context";
import { normalizeExtract } from "../../lib/studio/normalize";
import { aiExtractSchema, type StudioDraft } from "../../lib/studio/schema";
import { FAKE_EXTRACT } from "../unit/fixtures/studio";
import { as, asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

const TODAY = todayVn();
const template = (id: string): InquiryTemplate => JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
function dueReleasingAll(id: string): string {
  const t = template(id);
  const last = t.steps.map((s) => s.planned_date ?? "").sort().at(-1) ?? "";
  return addDays(TODAY, daysBetween(last, t.dates.to));
}
/** The due date that releases the template's step `stepNo` today (later steps stay in the future). */
function dueReleasing(id: string, stepNo: number): string {
  const t = template(id);
  return addDays(TODAY, daysBetween(t.steps[stepNo - 1]!.planned_date!, t.dates.to));
}
const png = () => ({ id: randomUUID(), mime: "image/png", bytes: 80_000 });

// Keys the child's desk reads must never carry (plan 3.9). Values are scanned too for the answer-ish words of the fixtures.
const FORBIDDEN_KEY = /^(score|scores|correct|expected|answer|answers|explanation|explanation_vi|tag_key|tag_keys|level_num|pct|percent|result|results|wrong|wrong_items|rubric|verdict|decision)$/;
function keysOf(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysOf(x, out);
    }
  return out;
}

type Item = Record<string, unknown> & { kind: string; title: string; activity_id?: string; assignment_id?: string };
type Row = Record<string, unknown> & { src: string; ref: string; title: string; kind: string; seen?: boolean; seen_at?: string };

/** W4b (migration 0032): eng_my_today / eng_my_today_count / eng_my_history / eng_my_seen. One database. */
describe("student desk reads (migration 0032)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const U = () => s.users;
  const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const student = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const read = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    as(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
  };
  const today = (user: string) => read<{ items: Item[] }>(user, "select english.eng_my_today() as r").then((r) => r.items);
  const historyPage = (user: string, before: string | null = null, limit = 20, ref: string | null = null) =>
    read<{ items: Row[]; total: number; waiting: number }>(user, "select english.eng_my_history($1, $2, $3) as r", [before, ref, limit]);
  const history = (user: string, before: string | null = null, limit = 20, ref: string | null = null) => historyPage(user, before, limit, ref).then((r) => r.items);
  const seen = (user: string, before: string | null = null, limit = 20, ref: string | null = null) =>
    read<{ items: Row[] }>(user, "select english.eng_my_seen($1, $2, $3) as r", [before, ref, limit]).then((r) => r.items);
  const count = (user: string) => read<number>(user, "select english.eng_my_today_count() as r");

  let reqSeq = 0;
  const assign = async (who: "an" | "nguyen", tpl: string, due: string) =>
    (await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [s.learners[who], tpl, due, M().parent, `w4b-${(reqSeq += 1)}-${tpl}`]))[0]!.id;
  const step = async (instance: string, stepNo: number) =>
    (await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [instance, stepNo]))[0]!.id;
  const submitText = (user: string, activity: string, text: string) =>
    student<{ attempt_id: string }>(user, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [activity, randomUUID(), JSON.stringify({ text }), ["none"]]);
  const saveDraft = (user: string, activity: string, content: unknown) =>
    student(user, "select english.eng_save_draft($1, $2::jsonb, null) as r", [activity, JSON.stringify(content)]);
  const makeLink = (title: string, due: string | null = null, learner = NG(), by = M().tutorNguyen) =>
    svc<{ id: string }>("select english.eng_create_assignment($1, 'link', 'https://example.org/a', $2, '{}'::text[], $3::date, null, null, $4, $5) as r", [learner, title, due, by, randomUUID()]);
  const sendLink = (assignment: string, user = M().studentNguyen) =>
    svc("select english.eng_submit_practice($1, $2, $3, 'first', false, null, $4::jsonb) as r", [assignment, user, randomUUID(), JSON.stringify([png()])]);
  const record = (assignment: string, learner = NG(), by = M().tutorNguyen) =>
    svc("select english.eng_record_result($1, 'quick', null, $8, 10, 8, '{4,7}'::int[], '[]'::jsonb, 'home', $6, false, $2::date, $3, $7, $4, $5, null) as r", [
      learner, TODAY, assignment, by, randomUUID(), "first", null, "Linked",
    ]);

  let a1: string; // An, A-W1, everything released

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    a1 = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
    await assign("nguyen", "B-W1-HOMEWORK", dueReleasing("B-W1-HOMEWORK", 2));
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("only authenticated can call the four reads; the internal row function is closed to everyone", async () => {
    for (const sql of ["select english.eng_my_today()", "select english.eng_my_today_count()", "select english.eng_my_history(null, null, 5)", "select english.eng_my_seen(null, null, 5)"]) {
      await fail(as(db.client, "anon", null, async (q) => q(sql)), "42501");
      await fail(as(db.client, "service_role", null, async (q) => q(sql)), "42501");
    }
    await fail(as(db.client, "authenticated", U().studentAn, async (q) => q("select * from english.eng_student_done($1)", [s.learners.an])), "42501");
  });

  it("a signed-in adult (not a student) gets nothing", async () => {
    expect(await today(U().parent)).toEqual([]);
    expect(await count(U().tutorAn)).toBeNull(); // not a student: Launcher shows "not linked", never 0
    expect(await historyPage(U().parent)).toEqual({ items: [], total: 0, waiting: 0 });
    expect(await history(U().parent)).toEqual([]);
    expect(await seen(U().tutorNguyen)).toEqual([]);
  });

  it("Hôm nay: released unsubmitted steps of the child's own topic work; revision steps and later steps are not tasks", async () => {
    const items = await today(U().studentAn);
    const t = template("A-W1-VOLCANOES");
    // every non-REVISION step of the template is released (and not yet submitted) → one task each
    expect(items).toHaveLength(t.steps.filter((x) => x.mode !== "REVISION").length);
    expect(items.every((i) => i.kind === "topic")).toBe(true);
    const speak = items.find((i) => i.activity_type === "ACT-SPEAK-LIVE" && i.step_no === 1)!;
    expect(speak).toMatchObject({ doable: false, practice: true, off_label: "with_tutor", has_draft: false });
    const qa = items.find((i) => i.step_no === 2)!;
    expect(qa).toMatchObject({ doable: true, practice: false, off_label: null, time_min: 10, items_total: 6, items_filled: 0, has_draft: false });
    expect(items.some((i) => i.step_no === 13)).toBe(false);
    // the count is what the child can do in the app: the with-tutor step is listed but not counted
    expect(await count(U().studentAn)).toBe(items.filter((i) => i.doable).length);
    expect(items.some((i) => !i.doable)).toBe(true);
    // the other child sees only theirs (B-W1 step 1-2 released), never An's
    const ng = await today(U().studentNguyen);
    expect(ng.length).toBeGreaterThan(0);
    expect(ng.length).toBeLessThan(items.length);
    expect(new Set(ng.map((i) => i.activity_id)).size).toBe(ng.length);
    expect(await q1("select 1 from english.activity_instances where inquiry_instance_id = $1 and id = any($2::uuid[])", [a1, ng.map((i) => i.activity_id)])).toHaveLength(0);
  });

  it("a draft makes the card 'Làm tiếp' material: has_draft, how many items are filled (never how many are right)", async () => {
    const t = template("A-W1-VOLCANOES");
    const items2 = (t.steps[1] as { items?: { id: string; options?: string[] }[] }).items!;
    const act = await step(a1, 2);
    await saveDraft(U().studentAn, act, { answers: { [items2[0]!.id]: items2[0]!.options![1]!, [items2[1]!.id]: "Three." } });
    const qa = (await today(U().studentAn)).find((i) => i.activity_id === act)!;
    expect(qa).toMatchObject({ has_draft: true, items_filled: 2, items_total: 6 });
    expect(typeof qa.draft_at).toBe("string");
    // a writing step: a typed text counts as a draft, no item counters
    const w = await step(a1, 6);
    await saveDraft(U().studentAn, w, { text: "Volcanoes are hot." });
    const wi = (await today(U().studentAn)).find((i) => i.activity_id === w)!;
    expect(wi).toMatchObject({ has_draft: true, items_total: null, items_filled: null });
  });

  it("a submitted step leaves Hôm nay and shows in Đã làm as 'chờ xem'; the other child does not see it", async () => {
    const act = await step(a1, 6);
    const before = await count(U().studentAn);
    const r = await submitText(U().studentAn, act, "Some volcanoes explode because the magma is thick.");
    expect(await count(U().studentAn)).toBe(before - 1);
    const h = await history(U().studentAn);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ src: "attempt", ref: r.attempt_id, kind: "topic", first: true, seen: false, offline: false, activity_id: act });
    expect(await history(U().studentNguyen)).toEqual([]);
    expect(await seen(U().studentAn)).toEqual([]);
  });

  it("link / PDF work: a task until a photo is sent; then 'Đã làm'; the result written by the adult makes it 'đã xem' without exposing it", async () => {
    const link = await makeLink("Unless, even if", addDays(TODAY, 2));
    const t1 = (await today(U().studentNguyen)).find((i) => i.assignment_id === link.id)!;
    expect(t1).toMatchObject({ kind: "link", due_on: addDays(TODAY, 2), doable: true, practice: true });
    expect(t1.time_min).toBeNull();
    await sendLink(link.id);
    expect((await today(U().studentNguyen)).some((i) => i.assignment_id === link.id)).toBe(false);
    let h = (await history(U().studentNguyen)).find((r) => r.assignment_id === link.id)!;
    expect(h).toMatchObject({ src: "submission", kind: "link", seen: false, first: true });
    expect(await seen(U().studentNguyen)).toEqual([]);
    await record(link.id);
    h = (await history(U().studentNguyen)).find((r) => r.assignment_id === link.id)!;
    expect(h.seen).toBe(true);
    const sn = (await seen(U().studentNguyen)).find((r) => r.assignment_id === link.id)!;
    expect(sn).toMatchObject({ kind: "link", fb_state: null, praise: null, notes: null });
    // result of a bought paper: the PDF task is not a task once a result exists, even without a submission
    const retracted = await makeLink("Retracted");
    await svc("select english.eng_retract_assignment($1, 'oops', $2) as r", [retracted.id, M().tutorNguyen]);
    expect((await today(U().studentNguyen)).some((i) => i.assignment_id === retracted.id)).toBe(false);
    // a retracted assignment that was already sent stays in Đã làm (it is the child's work), flagged so the card is not reopened
    const sentThenRetracted = await makeLink("Sent then retracted");
    await sendLink(sentThenRetracted.id);
    await svc("select english.eng_retract_assignment($1, 'oops', $2) as r", [sentThenRetracted.id, M().tutorNguyen]);
    expect((await today(U().studentNguyen)).some((i) => i.assignment_id === sentThenRetracted.id)).toBe(false);
    expect((await history(U().studentNguyen)).find((r) => r.assignment_id === sentThenRetracted.id)).toMatchObject({ retracted: true, kind: "link" });
    // resubmit: only the current submission shows (the replaced one never appears on its own)
    const l2 = await makeLink("Twice");
    await sendLink(l2.id);
    await sendLink(l2.id);
    expect((await history(U().studentNguyen)).filter((r) => r.assignment_id === l2.id)).toHaveLength(1);
  });

  it("feedback: 'Chỉ góp ý' and 'Cần sửa' reach Đã xem with the words, a revision task appears in Hôm nay, and sending the revision updates both", async () => {
    const act = await step(a1, 6);
    const att = (await q1<{ id: string }>("select id from english.attempts where activity_instance_id = $1", [act]))[0]!.id;
    const items = [{ text: "Thêm một câu kết cho đoạn văn.", excerpt: "the magma is thick" }, { text: "Dùng thêm một từ nối." }];
    const fb = await svc<{ id: string; revision_activity_id: string }>("select english.eng_write_feedback($1, $2, $3::jsonb, true, null, $4, $5) as r", [
      att, "Con giải thích rõ vì sao núi lửa phun.", JSON.stringify(items), M().tutorAn, randomUUID(),
    ]);
    const sn = (await seen(U().studentAn))[0]!;
    expect(sn).toMatchObject({ ref: att, fb_state: "todo", praise: "Con giải thích rõ vì sao núi lửa phun.", revision_activity_id: fb.revision_activity_id });
    expect(sn.notes).toEqual([{ n: 1, text: items[0]!.text, excerpt: items[0]!.excerpt }, { n: 2, text: items[1]!.text, excerpt: null }]);
    expect((await history(U().studentAn))[0]!.seen).toBe(true);
    const rev = (await today(U().studentAn)).find((i) => i.kind === "revision")!;
    expect(rev.activity_id).toBe(fb.revision_activity_id);
    expect(rev.practice).toBe(false);
    // revise
    const marks = { "1": { choice: "changed" }, "2": { choice: "changed" } };
    const r2 = await student<{ attempt_id: string }>(U().studentAn, "select english.eng_submit_revision($1, $2, $3, $4::jsonb, $5::text[], 'in_app', $6) as r", [
      fb.revision_activity_id, randomUUID(), "Some volcanoes explode because the magma is thick. As a result, the gas cannot escape.", JSON.stringify(marks), ["none"], fb.id,
    ]);
    expect((await today(U().studentAn)).some((i) => i.kind === "revision")).toBe(false);
    const sn2 = (await seen(U().studentAn)).find((r) => r.ref === att)!;
    expect(sn2).toMatchObject({ fb_state: "revised", revision_activity_id: null });
    const h = await history(U().studentAn);
    expect(h.find((r) => r.ref === r2.attempt_id)).toMatchObject({ kind: "revision", first: false, seen: false });
    // the adult closes the revision → the revision attempt is seen, with the closing note
    await svc("select english.eng_finish_revision($1, 'close', $2::jsonb, $3, null, null, $4, $5) as r", [
      r2.attempt_id, JSON.stringify([{ n: 1, verdict: "improved" }, { n: 2, verdict: "improved" }]), "Cô thấy con đã sửa rất tốt.", M().tutorAn, randomUUID(),
    ]);
    const sn3 = (await seen(U().studentAn)).find((r) => r.ref === r2.attempt_id)!;
    expect(sn3).toMatchObject({ kind: "revision", closing_note: "Cô thấy con đã sửa rất tốt.", fb_state: null });
  });

  it("paging: the cursor (time, ref) walks every row once, newest first; p_limit is clamped to 1..50; total / waiting cover the whole history", async () => {
    const all = await history(U().studentNguyen, null, 50);
    expect(all.length).toBeGreaterThanOrEqual(2);
    const page = await historyPage(U().studentNguyen, null, 1);
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(all.length);
    expect(page.waiting).toBe(all.filter((r) => !r.seen).length);
    expect(await history(U().studentNguyen, null, 0)).toHaveLength(1); // clamped up to 1
    expect(await history(U().studentNguyen, null, 9999)).toHaveLength(all.length);
    const walked: string[] = [];
    let cur = page.items;
    while (cur.length > 0) {
      walked.push(cur[0]!.ref);
      const at = (cur[0] as unknown as { submitted_at: string }).submitted_at;
      cur = await history(U().studentNguyen, at, 1, cur[0]!.ref);
    }
    expect(walked).toEqual(all.map((r) => r.ref));
    // seen: same walk by (seen_at, ref)
    const allSeen = await seen(U().studentAn, null, 50);
    expect(allSeen.length).toBeGreaterThanOrEqual(2);
    const walkedSeen: string[] = [];
    let c2 = await seen(U().studentAn, null, 1);
    while (c2.length > 0) {
      walkedSeen.push(c2[0]!.ref);
      c2 = await seen(U().studentAn, c2[0]!.seen_at as string, 1, c2[0]!.ref);
    }
    expect(walkedSeen).toEqual(allSeen.map((r) => r.ref));
  });

  it("another child's rows never appear, in any of the reads", async () => {
    const an = new Set([...(await today(U().studentAn)).map((i) => i.activity_id), ...(await history(U().studentAn, null, 50)).map((r) => r.ref), ...(await seen(U().studentAn, null, 50)).map((r) => r.ref)]);
    const ng = [...(await today(U().studentNguyen)).map((i) => i.activity_id ?? i.assignment_id), ...(await history(U().studentNguyen, null, 50)).map((r) => r.ref), ...(await seen(U().studentNguyen, null, 50)).map((r) => r.ref)];
    for (const x of ng) expect(an.has(x as string)).toBe(false);
  });

  describe("Studio (app) work", () => {
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
    const studioDraft = async (mutate: (d: StudioDraft) => StudioDraft) => {
      const made = await svc<{ id: string }>("select english.eng_create_studio_draft($1, $2, null, null, false, $3, $4) as r", [NG(), "Unit thử", M().tutorNguyen, `w4b-st-${randomUUID().slice(0, 8)}`]);
      const base = normalizeExtract(aiExtractSchema.parse(FAKE_EXTRACT), await ctxOf(NG()));
      const payload = mutate({ ...base, items: base.items.map((i) => (i.n === 8 ? { ...i, key: "is said to be" } : i)) });
      const cur = await svc<{ updated_at: string }>("select english.eng_studio_draft($1) as r", [made.id]);
      const saved = await svc<{ updated_at: string }>("select english.eng_save_studio_draft($1, $2, $3::jsonb, $4, $5) as r", [made.id, "Unit thử", JSON.stringify(payload), cur.updated_at, M().tutorNguyen]);
      await svc("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [made.id, saved.updated_at, JSON.stringify(buildStudioBuild(payload)), M().tutorNguyen]);
      return svc<{ activity_id: string }>("select english.eng_assign_studio($1, current_date, current_date + 3, $2, $3) as r", [made.id, M().parent, `as-${randomUUID()}`]);
    };
    const answers = { q1: "B. had", q2: "A. must", q3: "A. off", q4: "C. A visit that changed Lan's plans", q5: "B. The robot room was interesting", q6: "happiness", q7: "I wish I could", q8: "is said to be" };

    it("the auto-check result written at submit is not 'seen' (Studio without an open item)", async () => {
      const a = await studioDraft((x) => ({ ...x, items: x.items.filter((i) => i.n <= 4) }));
      const sub = await student<{ attempt_id: string }>(U().studentNguyen, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [a.activity_id, randomUUID(), JSON.stringify({ answers: { q1: answers.q1, q2: answers.q2, q3: answers.q3, q4: answers.q4 } }), ["none"]]);
      expect((await q1("select 1 from english.results where attempt_id = $1", [sub.attempt_id])).length).toBeGreaterThan(0);
      expect((await history(U().studentNguyen, null, 50)).find((r) => r.ref === sub.attempt_id)).toMatchObject({ kind: "app", seen: false });
      expect((await seen(U().studentNguyen, null, 50)).some((r) => r.ref === sub.attempt_id)).toBe(false);
    });

    it("a Studio step is a 'app' task; the app's own marking is NOT 'seen'; an adult's Đúng/Sai on an open item IS seen (and shows no verdict)", async () => {
      const a = await studioDraft((x) => ({ ...x, items: x.items.map((i) => (i.n === 9 ? { ...i, out_of_app: false, kind: "open", key: "A MODEL ANSWER", explanation_vi: "Viết một câu." } : i)) }));
      const task = (await today(U().studentNguyen)).find((i) => i.activity_id === a.activity_id)!;
      expect(task).toMatchObject({ kind: "app", doable: true });
      const sub = await student<{ attempt_id: string }>(U().studentNguyen, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [
        a.activity_id, randomUUID(), JSON.stringify({ answers: { ...answers, q9: "I see a cat" } }), ["none"],
      ]);
      let h = (await history(U().studentNguyen, null, 50)).find((r) => r.ref === sub.attempt_id)!;
      expect(h).toMatchObject({ kind: "app", seen: false });
      expect((await seen(U().studentNguyen, null, 50)).some((r) => r.ref === sub.attempt_id)).toBe(false);
      // the adult marks the open item → seen, and the child still gets no verdict
      await svc("select english.eng_decide_studio_items($1, $2::jsonb, $3, $4) as r", [sub.attempt_id, JSON.stringify([{ item_id: "q9", result: "incorrect" }]), M().tutorNguyen, `dc-${randomUUID()}`]);
      h = (await history(U().studentNguyen, null, 50)).find((r) => r.ref === sub.attempt_id)!;
      expect(h.seen).toBe(true);
      const sn = (await seen(U().studentNguyen, null, 50)).find((r) => r.ref === sub.attempt_id)!;
      expect(sn).toMatchObject({ kind: "app", fb_state: null, praise: null, notes: null });
      expect(JSON.stringify(sn)).not.toMatch(/incorrect|correct|A MODEL ANSWER/);
    });
  });

  it("tie: three submissions with the identical timestamp are walked one by one with no duplicate and no gap", async () => {
    const ids: string[] = [];
    for (const n of [1, 2, 3]) ids.push((await makeLink(`Tie ${n}`)).id);
    const at = "2026-01-05T03:00:00.123456Z";
    const subs: string[] = [];
    for (const g of ids) {
      subs.push((await q1<{ id: string }>(
        "insert into english.submissions(assignment_id, learner_id, attempt, used_hint, link_url, submitted_by_member, submitted_by_role, client_id, created_at) values ($1, $2, 'first', false, 'https://example.org/t', $3, 'student', $4, $5) returning id",
        [g, NG(), M().studentNguyen, `tie-${randomUUID()}`, at],
      ))[0]!.id);
    }
    const all = await history(U().studentNguyen, null, 50);
    const tied = all.filter((r) => subs.includes(r.ref));
    expect(tied).toHaveLength(3);
    expect(tied.map((r) => r.ref)).toEqual([...subs].sort().reverse()); // same time: the ref decides, descending
    const walked: string[] = [];
    let cur = await history(U().studentNguyen, null, 1);
    while (cur.length > 0) {
      walked.push(cur[0]!.ref);
      cur = await history(U().studentNguyen, (cur[0] as unknown as { submitted_at: string }).submitted_at, 1, cur[0]!.ref);
    }
    expect(walked).toEqual(all.map((r) => r.ref));
    expect(new Set(walked).size).toBe(walked.length);
  });

  it("validation_decisions (the adult scores a skill of the episode) make the attempt 'seen'", async () => {
    const act = await step(a1, 11);
    const sub = await submitText(U().studentAn, act, "Volcanoes erupt because pressure builds up. As a result, the lava flows out.");
    expect((await history(U().studentAn, null, 50)).find((r) => r.ref === sub.attempt_id)!.seen).toBe(false);
    const ep = (await q1<{ id: string }>("select id from english.episodes where attempt_id = $1", [sub.attempt_id]))[0]!.id;
    await svc("select english.eng_record_reviews($1, $2::jsonb, $3, $4) as r", [ep, JSON.stringify([{ target_key: "A-L3-CAUSE-W", score: 3, not_observed: false }]), M().tutorAn, randomUUID()]);
    expect((await q1("select 1 from english.validation_decisions where episode_id = $1", [ep])).length).toBeGreaterThan(0);
    const h = (await history(U().studentAn, null, 50)).find((r) => r.ref === sub.attempt_id)!;
    expect(h.seen).toBe(true);
    const sn = (await seen(U().studentAn, null, 50)).find((r) => r.ref === sub.attempt_id)!;
    expect(sn).toMatchObject({ fb_state: null, praise: null, notes: null });
    expect(JSON.stringify(sn)).not.toMatch(/score|"3"|CAUSE/);
  });

  it("no forbidden key anywhere in what the child gets back", async () => {
    for (const user of [U().studentAn, U().studentNguyen]) {
      const payloads = [await today(user), await history(user, null, 50), await seen(user, null, 50)];
      for (const keys of payloads.map((p) => keysOf(p))) for (const k of keys) expect(k, k).not.toMatch(FORBIDDEN_KEY);
    }
  });

  it("the migration is functions only: no table, no purge body, repeatable, ends with its own version", async () => {
    const { readdirSync, readFileSync: rf } = await import("node:fs");
    const { MIGRATIONS_DIR } = await import("../../scripts/lib/migrate");
    const f = readdirSync(MIGRATIONS_DIR).find((x) => x.endsWith("_student_desk_reads.sql"))!;
    const sql = rf(path.join(MIGRATIONS_DIR, f), "utf8");
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/create table|alter table|eng_purge_|drop /i);
    expect(code).not.toMatch(/\bpublic\./);
    await migrate(db.client, true);
    expect((await q1<{ n: number }>("select count(*)::int as n from english.schema_migrations where version = $1", [f.slice(0, 4)]))[0]!.n).toBe(1);
  });

  // last: an import leaves files that the repeat-migration test above would trip over (a seed constraint re-check)
  describe("imported work (Nạp bài) is invisible to the child", () => {
    const pdf = () => ({ id: randomUUID(), mime: "application/pdf", bytes: 4096 });
    it("the imported attempt is absent from Đã làm and Đã xem and its activities from Hôm nay", async () => {
      const [tag] = (await q1<{ key: string }>("select key from english.error_tags where track_id='B' and origin='seed' and retired_at is null and key !~ '^nghe-' order by key limit 1"));
      const hash = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
      const c = await svc<{ id: string }>("select english.eng_create_import($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10) as r", [
        NG(), "Imported for desk", JSON.stringify(pdf()), JSON.stringify(pdf()), "2026-10-23", "tu_lam_chua", hash, M().tutorNguyen, randomUUID(), false,
      ]);
      await svc("select english.eng_finish_import_read($1,$2::jsonb,null) as r", [c.id, JSON.stringify({ items: [] })]);
      const upd = (await q1<{ t: string }>("select updated_at::text as t from english.import_batches where id = $1", [c.id]))[0]!.t;
      const items = ["q1", "q2"].map((id, k) => ({ id, kind: "short", stem: `Câu ${k + 1}`, options: [], target_id: null }));
      const build = {
        template: { prompt_en: "Imported work.", time_min: 5, items },
        keys: items.map((x) => ({ item_id: x.id, kind: "answer", answer: "x", explanation_vi: null })),
        meta: items.map((x, k) => ({ n: k + 1, part: "A", tag_key: tag!.key, reading_skill_key: null, out_of_app: false })),
        results: [{ item_id: "q1", result: "correct" }, { item_id: "q2", result: "incorrect" }],
      };
      const conf = await svc<{ attempt_id: string }>("select english.eng_confirm_import($1,$2,$3::jsonb,$4,$5) as r", [c.id, upd, JSON.stringify(build), M().tutorNguyen, randomUUID()]);
      expect((await q1("select 1 from english.attempts where id = $1 and provenance = 'imported'", [conf.attempt_id]))).toHaveLength(1);
      const actIds = (await q1<{ id: string }>("select id from english.activity_instances where id = (select activity_instance_id from english.attempts where id = $1)", [conf.attempt_id])).map((r) => r.id);
      expect((await history(U().studentNguyen, null, 50)).some((r) => r.ref === conf.attempt_id)).toBe(false);
      expect((await seen(U().studentNguyen, null, 50)).some((r) => r.ref === conf.attempt_id)).toBe(false);
      expect((await today(U().studentNguyen)).some((i) => actIds.includes(i.activity_id as string))).toBe(false);
    });
  });
});
