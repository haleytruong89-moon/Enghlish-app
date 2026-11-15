import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
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
  const history = (user: string, before: string | null = null, limit = 20) =>
    read<{ items: Row[] }>(user, "select english.eng_my_history($1, $2) as r", [before, limit]).then((r) => r.items);
  const seen = (user: string, before: string | null = null, limit = 20) =>
    read<{ items: Row[] }>(user, "select english.eng_my_seen($1, $2) as r", [before, limit]).then((r) => r.items);
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
    for (const sql of ["select english.eng_my_today()", "select english.eng_my_today_count()", "select english.eng_my_history(null, 5)", "select english.eng_my_seen(null, 5)"]) {
      await fail(as(db.client, "anon", null, async (q) => q(sql)), "42501");
      await fail(as(db.client, "service_role", null, async (q) => q(sql)), "42501");
    }
    await fail(as(db.client, "authenticated", U().studentAn, async (q) => q("select * from english.eng_student_done($1)", [s.learners.an])), "42501");
  });

  it("a signed-in adult (not a student) gets nothing", async () => {
    expect(await today(U().parent)).toEqual([]);
    expect(await count(U().tutorAn)).toBe(0);
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
    expect(await count(U().studentAn)).toBe(items.length);
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

  it("paging: p_before moves to older rows, p_limit is clamped to 1..50, newest first", async () => {
    const all = await history(U().studentNguyen, null, 50);
    expect(all.length).toBeGreaterThanOrEqual(2);
    const first = await history(U().studentNguyen, null, 1);
    expect(first).toHaveLength(1);
    expect(first[0]!.ref).toBe(all[0]!.ref);
    const submittedAt = (first[0] as unknown as { submitted_at: string }).submitted_at;
    const next = await history(U().studentNguyen, submittedAt, 1);
    expect(next[0]!.ref).toBe(all[1]!.ref);
    expect(await history(U().studentNguyen, null, 0)).toHaveLength(1); // clamped up to 1
    expect(await history(U().studentNguyen, null, 9999)).toHaveLength(all.length);
    const s1 = await seen(U().studentAn, null, 1);
    expect(s1).toHaveLength(1);
    const s2 = await seen(U().studentAn, s1[0]!.seen_at as string, 5);
    expect(s2.every((r) => r.ref !== s1[0]!.ref)).toBe(true);
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
});
