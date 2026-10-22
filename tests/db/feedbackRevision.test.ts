import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { SCORE_WORD_SAMPLES } from "../unit/fixtures/scoreWords";
import { as, asCommit, createAuthUser, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const TODAY = todayVn();
const template = (id: string): InquiryTemplate =>
  JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
/** The due date that releases every step of the template today. */
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

const TEXT_A = "Some volcanoes explode because the magma is thick. The gas stays inside, so the pressure grows. Other volcanoes let lava flow gently.";
const TEXT_B = "A nightly limit on homework is fair because students need sleep. However, some subjects need more practice than others.";
const ITEMS = [{ text: "Thêm một câu kết cho đoạn văn.", excerpt: "Other volcanoes let lava flow gently." }, { text: "Dùng thêm một từ nối chỉ kết quả." }];

/** S6 (migration 0021): feedback, revision steps, revision attempts, marks, checks, student reads, purge. One database for the file. */
describe("S6 feedback + revision (migration 0021)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const U = () => s.users;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const n = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const student = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const studentRead = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    as(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  let reqSeq = 0;
  const assign = async (who: "an" | "nguyen", tpl: string, due: string) =>
    (await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [s.learners[who], tpl, due, M().parent, `s6-${(reqSeq += 1)}-${tpl}`]))[0]!.id;
  const step = async (instance: string, stepNo: number) =>
    (await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [instance, stepNo]))[0]!.id;
  type Receipt = { attempt_id: string; attempt_no: number; replayed: boolean };
  const submitText = (user: string, activity: string, text: string, provenance = "in_app") =>
    student<Receipt>(user, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], $5) as r", [activity, randomUUID(), JSON.stringify({ text }), ["none"], provenance]);
  const episodeOf = async (attempt: string) => (await q1<{ id: string }>("select id from english.episodes where attempt_id = $1", [attempt]))[0]!.id;

  type Written = { id: string; round: number; revision_activity_id: string | null; replayed: boolean };
  const write = (by: string, attempt: string, o: { praise?: string; items?: unknown; requires?: boolean; supersedes?: string | null; clientId?: string } = {}) =>
    svc<Written>("select english.eng_write_feedback($1, $2, $3::jsonb, $4, $5, $6, $7) as r", [
      attempt, o.praise ?? "Con giải thích rõ vì sao núi lửa phun.", JSON.stringify(o.items ?? ITEMS), o.requires ?? true, o.supersedes ?? null, by, o.clientId ?? randomUUID(),
    ]);
  /** The feedback the child is answering on a revision step: the live one asking for a revision (what the page shows). */
  const liveFeedbackOf = async (activity: string) =>
    (await q1<{ id: string }>(
      `select f.id from english.feedback_notes f
       where f.revision_activity_id = $1 and f.kind = 'feedback' and f.requires_revision and english.eng_feedback_is_live(f.id)
       order by f.round desc, f.created_at desc limit 1`, [activity]))[0]?.id ?? null;
  const reviseAs = async (user: string, activity: string, text: string, marks: unknown, o: { clientId?: string; assistance?: string[]; feedback?: string | null } = {}) =>
    student<Receipt>(user, "select english.eng_submit_revision($1, $2, $3, $4::jsonb, $5::text[], 'in_app', $6) as r", [
      activity, o.clientId ?? randomUUID(), text, JSON.stringify(marks), o.assistance ?? ["none"], o.feedback === undefined ? await liveFeedbackOf(activity) : o.feedback,
    ]);
  const finish = (by: string, attempt: string, o: { action?: string; checks?: unknown; closing?: string | null; praise?: string | null; items?: unknown; clientId?: string } = {}) =>
    svc<{ closing_id: string | null; feedback_id: string | null; replayed: boolean }>(
      "select english.eng_finish_revision($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8) as r",
      [attempt, o.action ?? "close", JSON.stringify(o.checks ?? [{ n: 1, verdict: "improved" }, { n: 2, verdict: "reason_ok" }]), o.closing ?? null,
        o.praise ?? null, o.items === undefined ? null : JSON.stringify(o.items), by, o.clientId ?? randomUUID()],
    );

  let a1: string; // An, A-W1, everything released: step 6 practice writing, step 11 checkpoint writing, step 13 REVISION
  let b1: string; // Nguyên, B-W1, everything released: step 7 writing, step 8 REVISION
  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    a1 = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
    b1 = await assign("nguyen", "B-W1-HOMEWORK", dueReleasingAll("B-W1-HOMEWORK"));
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. books, rules on revision attempts, settings, purge", () => {
    it("score words: the database and the app agree on every shared sample", async () => {
      for (const [text, hit] of SCORE_WORD_SAMPLES) {
        expect((await q1<{ r: boolean }>("select english.eng_has_score_words($1) as r", [text]))[0]?.r, text).toBe(hit);
      }
    });

    it("the books are append-only and service_role cannot insert directly; the tables refuse scores and bad shapes", async () => {
      const att = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const insert = (over: Record<string, unknown> = {}) => {
        const v = { kind: "feedback", praise: "Con viết rõ ý.", items: [{ n: 1, text: "Thêm câu kết." }], requires: false, round: 1, ...over };
        return q1(`insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, requires_revision, author_member, author_role, client_id)
                   values ($1, $2, $2, $3, $4, $5, $6::jsonb, $7, $8, 'tutor', $9)`,
          [s.learners.an, att, v.round, v.kind, v.praise, JSON.stringify(v.items), v.requires, M().tutorAn, randomUUID()]);
      };
      for (const over of [{ praise: "Bài được 3/4" }, { items: [{ n: 1, text: "Sai 2 điểm" }] }, { praise: null }, { items: [] }, { requires: true }, { round: 2 }, { kind: "closing", items: [] }]) {
        await fail(insert(over), "23514");
      }
      await insert(); // a valid row (the RLS test below reads it)
      for (const sql of ["update english.feedback_notes set praise = 'x'", "delete from english.feedback_notes", "truncate english.feedback_notes",
        "truncate english.revision_marks", "truncate english.revision_checks"]) {
        const err = await db.client.query(sql).then(() => null, (e: unknown) => e as { code?: string });
        // TRUNCATE of a table that other tables point to is refused by Postgres itself (0A000) before any trigger runs.
        expect(err?.code, sql).toBe(sql === "truncate english.feedback_notes" ? "0A000" : "42501");
      }
      const direct = await asCommit(db.client, "service_role", null, (q) =>
        q(`insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, author_member, author_role, client_id)
           values ($1, $2, $2, 1, 'feedback', 'x', '[{"n":1,"text":"y"}]'::jsonb, $3, 'tutor', 'direct-insert-1')`, [s.learners.an, att, M().tutorAn]))
        .then(() => null, (e: unknown) => e as { code?: string });
      expect(direct?.code).toBe("42501");
    });

    it("a revision attempt must be REVISION, not attempt 1, follow the revised work and stay in its family; its episode is never first", async () => {
      // A fresh instance: steps 11 and 13 of a1 are kept for Task 2 (the template step is reused only when it has no attempt yet).
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const root = (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id;
      const [r] = await q1<{ learning_family_id: string }>("select learning_family_id from english.attempts where id = $1", [root]);
      const act13 = await step(x, 13);
      const ins = (over: Record<string, unknown>) => {
        const v = { id: randomUUID(), no: 9, parent: root, family: r!.learning_family_id, mode: "REVISION", ...over };
        return q1(`insert into english.attempts(id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance, declared_assistance, content_hash, client_submission_id, revises_attempt_id)
                   values ($1, $2, $3, $4, $5, $6, $7, 'in_app', '{none}', $8, $9, $10)`,
          [v.id, act13, s.learners.an, v.no, v.parent, v.family, v.mode, "a".repeat(64), randomUUID(), root]);
      };
      await fail(ins({ mode: "PRACTICE" }), "23514");
      await fail(ins({ no: 1, parent: null }), "23514");
      await fail(ins({ parent: (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id }), "23514");
      const other = (await submitText(U().studentAn, await step(x, 11), TEXT_A)).attempt_id;
      await fail(ins({ family: other }), "23514");
      const ok = randomUUID();
      await ins({ id: ok });
      await fail(q1("insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id) values ($1, $2, true, 'A-W1-VOLCANOES')", [ok, s.learners.an]), "23514");
      await q1("insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id) values ($1, $2, false, 'A-W1-VOLCANOES')", [ok, s.learners.an]);
    });

    it("track settings: A does not require a reason, B does; each track has its A3 target; the table is not readable by app roles", async () => {
      const rows = await q1<{ track_id: string; key: string; value: unknown }>("select track_id, key, value from english.track_settings order by track_id, key");
      expect(rows).toEqual([
        { track_id: "A", key: "revision_reason_required", value: false },
        { track_id: "A", key: "revision_target_key", value: "A-A3-REDRAFT" },
        { track_id: "B", key: "revision_reason_required", value: true },
        { track_id: "B", key: "revision_target_key", value: "B-A3-REVISE" },
      ]);
      for (const role of ["authenticated", "service_role", "anon"]) {
        expect((await q1<{ ok: boolean }>(`select has_table_privilege('${role}', 'english.track_settings', 'select') as ok`))[0]?.ok, role).toBe(false);
      }
    });

    it("RLS: the child's tutor and the parent read the books; the student and the other child's tutor read nothing", async () => {
      const count = async (user: string, t: string) =>
        (await rowsAs<{ n: number }>(db.client, "authenticated", user, `select count(*)::int as n from english.${t} where learner_id = $1`, [s.learners.an]))[0]?.n;
      expect(await count(U().tutorAn, "feedback_notes")).toBeGreaterThan(0);
      expect(await count(U().parent, "feedback_notes")).toBeGreaterThan(0);
      for (const t of ["feedback_notes", "revision_marks", "revision_checks"]) {
        expect(await count(U().studentAn, t), t).toBe(0);
        expect(await count(U().tutorNguyen, t), t).toBe(0);
        expect((await q1<{ ok: boolean }>(`select has_table_privilege('anon', 'english.${t}', 'select') as ok`))[0]?.ok, t).toBe(false);
      }
    });

    it("running every migration again changes nothing", async () => {
      const before = await q1("select (select count(*) from english.feedback_notes)::int as f, (select count(*) from english.track_settings)::int as t");
      await migrate(db.client, true);
      expect(await q1("select (select count(*) from english.feedback_notes)::int as f, (select count(*) from english.track_settings)::int as t")).toEqual(before);
    });
  });

  describe("2. giving feedback (eng_write_feedback) and opening the revision step", () => {
    it("who: the child's tutor and the parent on ordinary work; on in-session tests only the tutor (D15); nobody outside; never a student", async () => {
      const work = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      await fail(write(M().tutorNguyen, work), "42501", /\(D15\)/);
      await fail(student(U().studentAn, "select english.eng_write_feedback($1, 'x', '[]'::jsonb, true, null, $2, 'client-0001') as r", [work, M().studentAn]), "42501");
      expect((await write(M().parent, work, { requires: false })).round).toBe(1);
      const check = (await submitText(U().studentAn, await step(a1, 11), TEXT_A)).attempt_id; // A-W1 step 11 = checkpoint
      await fail(write(M().parent, check), "42501", /\(D15\)/);
      const r = await write(M().tutorAn, check);
      expect(r.revision_activity_id).toBe(await step(a1, 13)); // D1: 11 → (12 self-review) → 13
    });

    it("only in-app writing (D8): paper work and answer-shaped steps are refused", async () => {
      const paper = await svc<{ attempt_id: string }>(
        "select english.eng_record_offline_attempt($1, 'manual_import', $2, null, null, $3::date, '{none}'::text[], $4, $5) as r",
        [await step(a1, 6), TEXT_A, TODAY, M().tutorAn, randomUUID()]);
      await fail(write(M().tutorAn, paper.attempt_id), "23514", /\(not_writing\)/);
      const reading = (await student<Receipt>(U().studentAn, "select english.eng_submit_attempt($1, $2, $3::jsonb, '{none}', 'in_app') as r",
        [await step(a1, 3), randomUUID(), JSON.stringify({ answers: { "W1-R2": "Melted rock." } })])).attempt_id;
      await fail(write(M().tutorAn, reading), "23514", /\(not_writing\)/);
    });

    it("praise is required, 1-3 items, no scores, the excerpt must be in the work, the leaf must be in the map", async () => {
      const work = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      await fail(write(M().tutorAn, work, { praise: "  " }), "23514", /\(praise_required\)/);
      await fail(write(M().tutorAn, work, { praise: "Bài được 3/4" }), "23514", /\(score_words\)/);
      await fail(write(M().tutorAn, work, { items: [{ text: "Đúng 80%" }] }), "23514", /\(score_words\)/);
      await fail(write(M().tutorAn, work, { items: [] }), "22023", /\(bad_items\)/);
      await fail(write(M().tutorAn, work, { items: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }] }), "22023", /\(bad_items\)/);
      await fail(write(M().tutorAn, work, { items: [{ text: "Sửa câu này.", excerpt: "This sentence is not in the work." }] }), "23514", /\(excerpt_not_found\)/);
      await fail(write(M().tutorAn, work, { items: [{ text: "Sửa.", leaf: { kind: "tag", ref_key: "no-such-tag" } }] }), "23514", /\(unknown_leaf\)/);
      const [leaf] = await q1<{ kind: string; ref_key: string }>(
        "select kind, ref_key from english.skill_leaves where map_id = english.eng_current_skill_map() and track_id = 'A' order by group_key, ord limit 1");
      // spacing and curly quotes do not matter for the excerpt; the stored excerpt is the trimmed one
      const ok = await write(M().tutorAn, work, { items: [{ text: "Thêm câu kết.", excerpt: "  Other volcanoes   let lava flow gently. ", leaf }] });
      const [row] = await q1<{ items: unknown }>("select items from english.feedback_notes where id = $1", [ok.id]);
      expect(row?.items).toEqual([{ n: 1, text: "Thêm câu kết.", excerpt: "Other volcanoes   let lava flow gently.", leaf: { kind: leaf!.kind, ref_key: leaf!.ref_key } }]);
    });

    it("one live feedback per work; a replay returns the same row; edits only by the author, only the live row, only before the child starts", async () => {
      const work = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const first = await write(M().tutorAn, work, { clientId: "feedback-replay-1" });
      expect(first).toMatchObject({ round: 1, replayed: false });
      expect(await write(M().tutorAn, work, { clientId: "feedback-replay-1" })).toMatchObject({ id: first.id, replayed: true });
      await fail(write(M().tutorAn, work, { clientId: "feedback-replay-1", praise: "Khác" }), "23505");
      await fail(write(M().tutorAn, work), "23505", /\(already_given\)/);
      await fail(write(M().parent, work, { supersedes: first.id }), "42501", /\(author_only\)/);
      const second = await write(M().tutorAn, work, { supersedes: first.id, items: [{ text: "Chỉ một góp ý thôi." }] });
      expect(second.revision_activity_id).toBe(first.revision_activity_id); // the same revision step
      await fail(write(M().tutorAn, work, { supersedes: first.id }), "23505", /\(already_superseded\)/);
      // the child saves a first draft of the revision: from then on the feedback can no longer be edited
      await q1("insert into english.working_drafts(activity_instance_id, learner_id, content) values ($1, $2, '{}'::jsonb)", [second.revision_activity_id, s.learners.an]);
      await fail(write(M().tutorAn, work, { supersedes: second.id }), "23514", /\(revision_started\)/);
    });

    it("revision step: the template step is reused (and opened today if dated later); otherwise the app adds step 1001, 1002 on the track's A3 skill", async () => {
      // A-W1 step 6: step 11 (writing) lies between 6 and 13 → a step of its own
      const w6a = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const r6a = await write(M().tutorAn, w6a);
      const w6b = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const r6b = await write(M().tutorAn, w6b);
      const own = await q1<{ step_no: number; activity_type: string; mode: string; target_ids: string[]; scheduled_for: string }>(
        "select step_no, activity_type, mode, target_ids, scheduled_for::text from english.activity_instances where id = any($1::uuid[]) order by step_no",
        [[r6a.revision_activity_id, r6b.revision_activity_id]]);
      expect(own.map((o) => o.step_no)).toEqual([own[0]!.step_no, own[0]!.step_no + 1]);
      expect(own[0]!.step_no).toBeGreaterThan(1000);
      expect(own[0]).toMatchObject({ activity_type: "ACT-REVISE", mode: "REVISION", target_ids: ["A-A3-REDRAFT"], scheduled_for: TODAY });
      // B-W1 with only step 7 released: step 8 (REVISION, dated tomorrow) is reused and opened today
      const b = await assign("nguyen", "B-W1-HOMEWORK", dueReleasing("B-W1-HOMEWORK", 7));
      const step8 = await step(b, 8);
      expect((await q1<{ ok: boolean }>("select english.eng_activity_released($1) as ok", [step8]))[0]?.ok).toBe(false);
      const wb = (await submitText(U().studentNguyen, await step(b, 7), TEXT_B)).attempt_id;
      expect((await write(M().tutorNguyen, wb, { items: [{ text: "Nêu rõ hơn lý do thứ hai." }] })).revision_activity_id).toBe(step8);
      expect((await q1<{ ok: boolean }>("select english.eng_activity_released($1) as ok", [step8]))[0]?.ok).toBe(true);
      expect(await n("select count(*)::int as n from english.activity_instance_events where activity_instance_id = $1 and kind = 'reschedule'", [step8])).toBe(1);
      // the fully released B-W1: its step 8 is free and already open
      const wb2 = (await submitText(U().studentNguyen, await step(b1, 7), TEXT_B)).attempt_id;
      const rb2 = await write(M().tutorNguyen, wb2, { items: [{ text: "Thêm phản biện." }] });
      expect(rb2.revision_activity_id).toBe(await step(b1, 8)); // B-W1 7 → 8 (the next step)
    });

    it("'Chỉ góp ý' opens no step; the S4 paths still refuse a REVISION step; eng_revision_open follows the live feedback", async () => {
      const work = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const note = await write(M().tutorAn, work, { requires: false });
      expect(note.revision_activity_id).toBeNull();
      const work2 = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const rev = (await write(M().tutorAn, work2)).revision_activity_id!;
      expect((await q1<{ ok: boolean }>("select english.eng_revision_open($1) as ok", [rev]))[0]?.ok).toBe(true);
      await fail(student(U().studentAn, "select english.eng_save_draft($1, '{\"text\":\"x\"}'::jsonb) as r", [rev]), "22023");
      await fail(student(U().studentAn, "select english.eng_submit_attempt($1, $2, '{\"text\":\"x\"}'::jsonb, '{none}', 'in_app') as r", [rev, randomUUID()]), "22023");
    });
  });

  describe("3. the child's side: read, draft, submit", () => {
    const STUDENT_FORBIDDEN = ["score", "verdict", "observation", "decision", "leaf", "ref_key", "target", "author", "rationale"];
    const noLeaks = (v: unknown) => {
      const text = JSON.stringify(v);
      for (const bad of STUDENT_FORBIDDEN) expect(text, bad).not.toContain(bad);
    };
    type MyRevision = { state: string; round: number; praise: string; items: { n: number; text: string; excerpt: string | null }[]; old_text: string; reason_required: boolean; draft: unknown };
    type MyFeedback = { items: { feedback_id: string; activity_id: string; state: string; items_count: number; closing_note: string | null }[] };

    let root: string;
    let rev: string; // An's own revision step (A-W1 step 6 → 100x)
    let revised: string; // the revision attempt
    beforeAll(async () => {
      // a fresh instance: the root is attempt 1 of its step, so the revision is attempt 2 of the family
      const fresh = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      root = (await submitText(U().studentAn, await step(fresh, 6), TEXT_A)).attempt_id;
      const [leaf] = await q1<{ kind: string; ref_key: string }>(
        "select kind, ref_key from english.skill_leaves where map_id = english.eng_current_skill_map() and track_id = 'A' order by group_key, ord limit 1");
      rev = (await write(M().tutorAn, root, { items: [{ ...ITEMS[0]!, leaf }, ITEMS[1]!] })).revision_activity_id!;
    });

    it("the child reads the feedback (praise, items, excerpt, old text) but never a leaf, a score or who scored; others read nothing", async () => {
      const home = await studentRead<MyFeedback>(U().studentAn, "select english.eng_my_feedback() as r");
      expect(home.items.find((i) => i.activity_id === rev)).toMatchObject({ state: "todo", items_count: 2 });
      noLeaks(home);
      const page = await studentRead<MyRevision>(U().studentAn, "select english.eng_my_revision($1) as r", [rev]);
      expect(page).toMatchObject({ state: "todo", round: 1, old_text: TEXT_A, reason_required: false, draft: null });
      expect(page.items).toEqual([{ n: 1, text: ITEMS[0]!.text, excerpt: ITEMS[0]!.excerpt }, { n: 2, text: ITEMS[1]!.text, excerpt: null }]);
      noLeaks(page);
      expect(await studentRead(U().studentNguyen, "select english.eng_my_revision($1) as r", [rev])).toBeNull();
      expect(await studentRead(U().tutorAn, "select english.eng_my_revision($1) as r", [rev])).toBeNull();
      expect(await studentRead<MyFeedback>(U().parent, "select english.eng_my_feedback() as r")).toEqual({ items: [] });
      // S4 still sees the step as "not in the app"
      expect(await studentRead<{ supported: boolean }>(U().studentAn, "select english.eng_my_activity($1) as r", [rev])).toMatchObject({ supported: false });
      // service_role may not call the child's functions
      await fail(svc("select english.eng_my_feedback() as r"), "42501");
    });

    it("drafts: only {text, marks, pasted, assistance}, saved on the revision step, with the other-tab warning", async () => {
      await fail(student(U().studentAn, "select english.eng_save_revision_draft($1, $2::jsonb) as r", [rev, JSON.stringify({ marks: { "4": { choice: "kept" } } })]), "22023");
      await fail(student(U().studentAn, "select english.eng_save_revision_draft($1, $2::jsonb) as r", [rev, JSON.stringify({ answers: {} })]), "22023");
      const first = await student<{ revision: number }>(U().studentAn, "select english.eng_save_revision_draft($1, $2::jsonb, 0) as r",
        [rev, JSON.stringify({ text: TEXT_A, marks: { "1": { choice: "changed" } } })]);
      expect(first.revision).toBe(1);
      const second = await student<{ revision: number; other_tab_changed: boolean }>(U().studentAn, "select english.eng_save_revision_draft($1, $2::jsonb, 0) as r",
        [rev, JSON.stringify({ text: `${TEXT_A} More.` })]);
      expect(second).toMatchObject({ revision: 2, other_tab_changed: true });
      expect((await studentRead<MyRevision>(U().studentAn, "select english.eng_my_revision($1) as r", [rev])).draft).toMatchObject({ revision: 2 });
      await fail(student(U().studentNguyen, "select english.eng_save_revision_draft($1, '{}'::jsonb) as r", [rev]), "P0002");
    });

    it("submit: every item marked; an unchanged text needs 'kept' with a reason; then one revision, never first, in the root's family", async () => {
      const NEW = `${TEXT_A} As a result, the eruption is violent.`;
      await fail(reviseAs(U().studentAn, rev, NEW, { "1": { choice: "changed" } }), "23514", /\(marks_incomplete\)/);
      await fail(reviseAs(U().studentAn, rev, TEXT_A, { "1": { choice: "changed" }, "2": { choice: "kept", reason: "Mình thấy đủ rồi" } }), "23514", /\(unchanged_needs_reason\)/);
      const marks = { "1": { choice: "changed", reason: "Mình đã thêm câu kết" }, "2": { choice: "changed" } };
      const receipt = await reviseAs(U().studentAn, rev, NEW, marks, { clientId: "a1111111-1111-4111-8111-111111111111" });
      expect(receipt).toMatchObject({ attempt_no: 2, replayed: false });
      revised = receipt.attempt_id;
      expect(await reviseAs(U().studentAn, rev, NEW, marks, { clientId: "a1111111-1111-4111-8111-111111111111" })).toMatchObject({ attempt_id: revised, replayed: true });
      await fail(reviseAs(U().studentAn, rev, `${NEW}!`, marks, { clientId: "a1111111-1111-4111-8111-111111111111" }), "23505");
      await fail(reviseAs(U().studentAn, rev, NEW, marks), "23505", /\(already_submitted\)/);
      await fail(student(U().studentAn, "select english.eng_save_revision_draft($1, '{}'::jsonb) as r", [rev]), "22023", /\(revision_not_open\)/);

      const [att] = await q1<Record<string, unknown>>(
        "select mode, attempt_no, parent_attempt_id, learning_family_id, revises_attempt_id from english.attempts where id = $1", [revised]);
      const [r] = await q1<{ learning_family_id: string }>("select learning_family_id from english.attempts where id = $1", [root]);
      expect(att).toEqual({ mode: "REVISION", attempt_no: 2, parent_attempt_id: root, learning_family_id: r!.learning_family_id, revises_attempt_id: root });
      const [ep] = await q1<{ is_first_attempt: boolean; facets: Record<string, boolean> }>("select is_first_attempt, facets from english.episodes where attempt_id = $1", [revised]);
      expect(ep).toMatchObject({ is_first_attempt: false, facets: { revision: true, checkpoint: false } });
      expect(await q1("select item_n, choice, reason from english.revision_marks where attempt_id = $1 order by item_n", [revised])).toEqual([
        { item_n: 1, choice: "changed", reason: "Mình đã thêm câu kết" }, { item_n: 2, choice: "changed", reason: null },
      ]);
      const help = await q1<{ kind: string; verification: string; affects_target_keys: string[]; note: string; recorded_by: string }>(
        "select kind, verification, affects_target_keys, note, recorded_by from english.assistance_events where attempt_id = $1 and kind = 'tutor_prompt'", [revised]);
      expect(help).toEqual([{ kind: "tutor_prompt", verification: "observed", affects_target_keys: ["A-A3-REDRAFT", "A-L3-CAUSE-W", "A-L2-CHUNKS"], note: "Góp ý vòng 1", recorded_by: M().tutorAn }]);
      expect(await q1("select distinct source from english.exposure_log where attempt_id = $1", [revised])).toEqual([{ source: "retry" }]);
      expect(await n("select count(*)::int as n from english.working_drafts where activity_instance_id = $1", [rev])).toBe(0);
      // the S5 scoring path sees the step's A3 skill first, then the root's skills
      const targets = await q1<{ target_key: string; scorable: boolean }>("select target_key, scorable from english.eng_episode_targets($1) order by ord", [await episodeOf(revised)]);
      expect(targets).toEqual([
        { target_key: "A-A3-REDRAFT", scorable: true }, { target_key: "A-L3-CAUSE-W", scorable: true }, { target_key: "A-L2-CHUNKS", scorable: true },
      ]);
      // the child sees "submitted", nothing more
      const page = await studentRead<MyRevision>(U().studentAn, "select english.eng_my_revision($1) as r", [rev]);
      expect(page).toMatchObject({ state: "submitted", draft: null });
      noLeaks(page);
    });

    it("S2: a submit made on a stale page is refused (feedback_changed); the page carries the feedback id; no feedback id is refused", async () => {
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const work = (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id;
      const first = await write(M().tutorAn, work);
      const act = first.revision_activity_id!;
      expect((await studentRead<MyRevision & { feedback_id: string }>(U().studentAn, "select english.eng_my_revision($1) as r", [act])).feedback_id).toBe(first.id);
      // the tutor edits before the child has started: the child's old page still answers the first feedback
      const second = await write(M().tutorAn, work, { supersedes: first.id, items: [{ text: "Chỉ một góp ý thôi." }] });
      const marks = { "1": { choice: "changed" }, "2": { choice: "changed" } };
      await fail(reviseAs(U().studentAn, act, `${TEXT_A} In short, it is violent.`, marks, { feedback: first.id }), "23514", /\(feedback_changed\)/);
      await fail(reviseAs(U().studentAn, act, `${TEXT_A} In short, it is violent.`, marks, { feedback: null }), "22004");
      expect(await n("select count(*)::int as n from english.attempts where revises_attempt_id = $1", [work])).toBe(0);
      const ok = await reviseAs(U().studentAn, act, `${TEXT_A} In short, it is violent.`, { "1": { choice: "changed" } }, { feedback: second.id });
      expect(ok.replayed).toBe(false);
      expect(await n("select count(*)::int as n from english.revision_marks where attempt_id = $1 and feedback_id = $2", [ok.attempt_id, second.id])).toBe(1);
    });

    it("S2: a tutor edit waits for a submit in flight on the same revision step, then sees that the child started (no stale revision)", async () => {
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const work = (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id;
      const first = await write(M().tutorAn, work);
      const act = first.revision_activity_id!;
      const other = new Client(pgConfigFromUrl(db.url));
      await other.connect();
      try {
        // another session holds the revision step (as eng_save_revision_draft / eng_submit_revision do) and is about to save a first draft
        await other.query("begin");
        await other.query("select 1 from english.activity_instances where id = $1 for no key update", [act]);
        let settled = false;
        const edit = write(M().tutorAn, work, { supersedes: first.id, items: [{ text: "Chỉ một góp ý thôi." }] }).then(
          () => { settled = true; return null; }, (e: unknown) => { settled = true; return e as { code?: string; message?: string }; });
        await new Promise((r) => setTimeout(r, 400));
        expect(settled, "the edit must wait for the lock on the revision step").toBe(false);
        await other.query("insert into english.working_drafts(activity_instance_id, learner_id, content) values ($1, $2, '{}'::jsonb)", [act, s.learners.an]);
        await other.query("commit");
        const err = await edit;
        expect(err?.code, err?.message).toBe("23514");
        expect(err?.message).toMatch(/\(revision_started\)/);
      } finally {
        await other.end();
      }
    });

    describe("S5: a 'Sửa bài' row never goes stale", () => {
      /** A fresh writing + revision-asking feedback → the revision step. */
      const open = async () => {
        const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
        const work = (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id;
        return { work, act: (await write(M().tutorAn, work)).revision_activity_id! };
      };
      const todo = async (act: string) => (await studentRead<MyFeedback>(U().studentAn, "select english.eng_my_feedback() as r")).items.find((i) => i.activity_id === act);
      const event = (act: string, kind: string, date: string | null) =>
        q1("select english.eng_activity_event($1, $2, $3::date, 'S5 test: stale row', $4)", [act, kind, date, M().parent]);

      it("a skipped step leaves the home and the page; unskipping brings it back", async () => {
        const { act } = await open();
        expect(await todo(act)).toMatchObject({ state: "todo" });
        await event(act, "skip", null);
        expect(await todo(act)).toBeUndefined();
        expect(await studentRead(U().studentAn, "select english.eng_my_revision($1) as r", [act])).toBeNull();
        await event(act, "unskip", null);
        expect(await todo(act)).toMatchObject({ state: "todo" });
      });

      it("a step moved to a later day leaves the home until that day; moving it back returns it", async () => {
        const { act } = await open();
        await event(act, "reschedule", addDays(TODAY, 3));
        expect(await todo(act)).toBeUndefined();
        await event(act, "reschedule", TODAY);
        expect(await todo(act)).toMatchObject({ state: "todo" });
      });

      it("work recorded outside the app on the revision step closes the open revision: gone from the home, no page, no draft, no submit", async () => {
        const { act } = await open();
        const feedback = await liveFeedbackOf(act);
        expect(await todo(act)).toMatchObject({ state: "todo" });
        await svc("select english.eng_record_offline_attempt($1, 'manual_import', $2, null, null, $3::date, '{none}'::text[], $4, $5) as r",
          [act, `${TEXT_A} On paper, I added an ending.`, TODAY, M().tutorAn, randomUUID()]);
        expect(await todo(act)).toBeUndefined();
        expect(await studentRead(U().studentAn, "select english.eng_my_revision($1) as r", [act])).toBeNull();
        expect((await q1<{ ok: boolean }>("select english.eng_revision_open($1) as ok", [act]))[0]?.ok).toBe(false);
        await fail(student(U().studentAn, "select english.eng_save_revision_draft($1, '{}'::jsonb) as r", [act]), "22023", /\(revision_not_open\)/);
        await fail(reviseAs(U().studentAn, act, `${TEXT_A} Again.`, { "1": { choice: "changed" } }, { feedback }), "22023", /\(revision_not_open\)/);
      });

      it("a revision the child already sent stays on the home as 'submitted' (the row is not stale), and round 2 is a fresh 'todo'", async () => {
        const { act } = await open();
        await reviseAs(U().studentAn, act, `${TEXT_A} As a result, it is violent.`, { "1": { choice: "changed" }, "2": { choice: "changed" } });
        expect(await todo(act)).toMatchObject({ state: "submitted" });
      });
    });

    it("G4: a 'Chỉ góp ý' note is read on its own activity (no expiry, no leaf, no author); a revision request and other children get nothing", async () => {
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const act = await step(x, 6);
      const work = (await submitText(U().studentAn, act, TEXT_A)).attempt_id;
      expect(await studentRead(U().studentAn, "select english.eng_my_activity_note($1) as r", [act])).toBeNull();
      await write(M().tutorAn, work, { requires: false, items: [{ text: "Thêm một câu kết." }] });
      const note = await studentRead<{ feedback_id: string; praise: string; notes: { n: number; text: string }[] }>(U().studentAn, "select english.eng_my_activity_note($1) as r", [act]);
      expect(note).toMatchObject({ praise: "Con giải thích rõ vì sao núi lửa phun.", notes: [{ n: 1, text: "Thêm một câu kết." }] });
      noLeaks(note);
      expect(await studentRead(U().studentNguyen, "select english.eng_my_activity_note($1) as r", [act])).toBeNull();
      expect(await studentRead(U().tutorAn, "select english.eng_my_activity_note($1) as r", [act])).toBeNull();
      await fail(svc("select english.eng_my_activity_note($1) as r", [act]), "42501");
      // a note that asks for a revision is not a note
      const y = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const actY = await step(y, 6);
      await write(M().tutorAn, (await submitText(U().studentAn, actY, TEXT_A)).attempt_id);
      expect(await studentRead(U().studentAn, "select english.eng_my_activity_note($1) as r", [actY])).toBeNull();
    });

    it("Track B requires a reason for every item (track setting, no `if track`)", async () => {
      // a fresh B-W1 instance: step 7 of b1 is a one-time check that Task 2's test already used
      const bx = await assign("nguyen", "B-W1-HOMEWORK", dueReleasingAll("B-W1-HOMEWORK"));
      const wb = (await submitText(U().studentNguyen, await step(bx, 7), TEXT_B)).attempt_id;
      const rb = (await write(M().tutorNguyen, wb, { items: [{ text: "Nêu rõ hơn lý do thứ hai." }] })).revision_activity_id!;
      expect((await studentRead<MyRevision>(U().studentNguyen, "select english.eng_my_revision($1) as r", [rb])).reason_required).toBe(true);
      await fail(reviseAs(U().studentNguyen, rb, `${TEXT_B} Sleep matters most.`, { "1": { choice: "changed" } }), "23514", /\(reason_required\)/);
      expect((await reviseAs(U().studentNguyen, rb, `${TEXT_B} Sleep matters most.`, { "1": { choice: "changed", reason: "I added why sleep matters." } })).replayed).toBe(false);
    });

    it("D14: the revision of an in-session test stays tutor-only for scoring and checking", async () => {
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const check = (await submitText(U().studentAn, await step(x, 11), TEXT_A)).attempt_id;
      const r = await write(M().tutorAn, check, { items: [{ text: "Thêm câu kết." }] });
      const done = await reviseAs(U().studentAn, r.revision_activity_id!, `${TEXT_A} In the end, the lava cools.`, { "1": { choice: "changed" } });
      const ep = await episodeOf(done.attempt_id);
      expect((await q1<{ r: string | null }>("select english.eng_review_role($1, $2) as r", [ep, M().parent]))[0]?.r).toBeNull();
      expect((await q1<{ r: string | null }>("select english.eng_review_role($1, $2) as r", [ep, M().tutorAn]))[0]?.r).toBe("tutor");
      // D14 in full: tagging and the episode view follow the same rule (eng_episode_restricted)
      const tag = (by: string) => svc<{ added: number }>("select english.eng_tag_episode($1, '{viet-cau}'::text[], $2) as r", [ep, by]);
      await fail(tag(M().parent), "42501", /\(D15\)/);
      expect((await tag(M().tutorAn)).added).toBe(1);
      const view = (user: string, episode: string) => studentRead<{ episode: { restricted: boolean }; viewer: { restricted: boolean; can_decide: boolean } } | null>(user, "select english.eng_review_episode($1) as r", [episode]);
      expect(await view(U().parent, ep)).toMatchObject({ episode: { restricted: true }, viewer: { restricted: true, can_decide: false } });
      expect(await view(U().tutorAn, ep)).toMatchObject({ episode: { restricted: true }, viewer: { can_decide: true } });
    });

    it("D14 keeps the old behaviour for ordinary work: the parent may tag and decide, the episode is not restricted", async () => {
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const ordinary = await submitText(U().studentAn, await step(x, 6), TEXT_A);
      const ep = await episodeOf(ordinary.attempt_id);
      expect((await svc<{ added: number }>("select english.eng_tag_episode($1, '{viet-cau}'::text[], $2) as r", [ep, M().parent])).added).toBe(1);
      expect(await studentRead(U().parent, "select english.eng_review_episode($1) as r", [ep])).toMatchObject({ episode: { restricted: false }, viewer: { restricted: false, can_decide: true } });
      // the checkpoint itself (not a revision) is restricted as before
      const check = await submitText(U().studentAn, await step(x, 11), TEXT_A);
      const cep = await episodeOf(check.attempt_id);
      await fail(svc("select english.eng_tag_episode($1, '{viet-cau}'::text[], $2) as r", [cep, M().parent]), "42501", /\(D15\)/);
      expect(await studentRead(U().parent, "select english.eng_review_episode($1) as r", [cep])).toMatchObject({ episode: { restricted: true } });
    });
  });

  describe("4. the reviewer's side: verdicts, Xong, round 2, reads, inbox, purge", () => {
    type View = { round: number; before: { text: string }; after: { text: string }; marks: unknown[]; checks: unknown[]; closing: unknown; can_finish: boolean; can_open_round2: boolean };
    type Inbox = { items: { attempt_id: string; revision_round: number | null }[]; counts: Record<string, number> };
    const inboxAs = (user: string, filter: string) =>
      as(db.client, "authenticated", user, async (q) => ((await q("select english.eng_review_inbox(true, $1, 100) as r", [filter])).rows[0] as { r: Inbox }).r);

    /** A fresh A-W1, An's writing at step 6, feedback with 2 items, An's revision → the revision attempt id. */
    const revised = async () => {
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const root = (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id;
      const rev = (await write(M().tutorAn, root)).revision_activity_id!;
      const r = await reviseAs(U().studentAn, rev, `${TEXT_A} As a result, it is violent.`, { "1": { choice: "changed" }, "2": { choice: "kept", reason: "Đã có so" } });
      return { root, rev, attempt: r.attempt_id };
    };

    it("verdicts must cover every item and fit the child's choice; Xong closes once, with an optional note and no scores", async () => {
      const { attempt } = await revised();
      await fail(finish(M().tutorNguyen, attempt), "42501", /\(D15\)/);
      await fail(finish(M().tutorAn, attempt, { checks: [{ n: 1, verdict: "improved" }] }), "23514", /\(checks_incomplete\)/);
      await fail(finish(M().tutorAn, attempt, { checks: [{ n: 1, verdict: "reason_ok" }, { n: 2, verdict: "reason_ok" }] }), "22023", /\(bad_verdict\)/);
      await fail(finish(M().tutorAn, attempt, { closing: "Lần này được 4/4" }), "23514", /\(score_words\)/);
      expect(await n("select count(*)::int as n from english.revision_checks where attempt_id = $1", [attempt])).toBe(0); // all or nothing
      const done = await finish(M().parent, attempt, { closing: "Bài sửa rõ hơn nhiều!", clientId: "finish-replay-1" }); // ordinary work: the parent may
      expect(done.closing_id).toBeTruthy();
      expect(await finish(M().parent, attempt, { closing: "Bài sửa rõ hơn nhiều!", clientId: "finish-replay-1" })).toMatchObject({ replayed: true });
      await fail(finish(M().tutorAn, attempt), "23505", /\(already_finished\)/);
      const view = await svc<View>("select english.eng_revision_view($1, $2) as r", [attempt, M().tutorAn]);
      expect(view).toMatchObject({ round: 1, before: { text: TEXT_A }, can_finish: false, can_open_round2: false, closing: { note: "Bài sửa rõ hơn nhiều!" } });
      expect(view.checks).toHaveLength(2);
    });

    it("S2: finish and the before-after view follow the feedback the child answered (the marks), even if another row is live", async () => {
      const { root, attempt } = await revised();
      const [f1] = await q1<{ id: string; revision_activity_id: string }>("select id, revision_activity_id from english.feedback_notes where source_attempt_id = $1 and kind = 'feedback'", [root]);
      // a row that took over without the child answering it (what a lost race would leave behind): one item only, live
      const [f2] = await q1<{ id: string }>(
        `insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, requires_revision, revision_activity_id, supersedes_id, author_member, author_role, client_id)
         values ($1, $2, $2, 1, 'feedback', 'Con viết rõ ý.', '[{"n":1,"text":"Chỉ một góp ý."}]'::jsonb, true, $3, $4, $5, 'tutor', $6) returning id`,
        [s.learners.an, root, f1!.revision_activity_id, f1!.id, M().tutorAn, randomUUID()]);
      expect((await q1<{ ok: boolean }>("select english.eng_feedback_is_live($1) as ok", [f2!.id]))[0]?.ok).toBe(true);
      const view = await svc<View & { feedback: { id: string; items: unknown[] }; round: number }>("select english.eng_revision_view($1, $2) as r", [attempt, M().tutorAn]);
      expect(view.feedback.id).toBe(f1!.id);
      expect(view.feedback.items).toHaveLength(2);
      expect((await q1<{ r: number }>("select english.eng_revision_round($1) as r", [attempt]))[0]?.r).toBe(1);
      // two verdicts (one per item the child answered) close it; with the live row (one item) they would be refused
      const done = await finish(M().tutorAn, attempt);
      expect(done.closing_id).toBeTruthy();
      expect(await n("select count(*)::int as n from english.revision_checks where attempt_id = $1", [attempt])).toBe(2);
    });

    it("the child then sees 'đã xem' and the closing note - still no verdict", async () => {
      const { rev, attempt } = await revised();
      await finish(M().tutorAn, attempt, { closing: "Cô thấy bạn tiến bộ." });
      const page = await studentRead<{ state: string; closing_note: string }>(U().studentAn, "select english.eng_my_revision($1) as r", [rev]);
      expect(page).toMatchObject({ state: "seen", closing_note: "Cô thấy bạn tiến bộ." });
      const home = await studentRead<{ items: { activity_id: string; state: string }[] }>(U().studentAn, "select english.eng_my_feedback() as r");
      expect(home.items.find((i) => i.activity_id === rev)?.state).toBe("seen");
      for (const bad of ["improved", "not_yet", "reason_ok", "verdict"]) expect(JSON.stringify([page, home]), bad).not.toContain(bad);
    });

    it("round 2: same step, new attempt in the same family; after round 2 only Xong remains; never round 3", async () => {
      const { root, rev, attempt } = await revised();
      const next = await finish(M().tutorAn, attempt, { action: "round2", praise: "Câu kết hay hơn rồi.", items: [{ text: "Thêm một ví dụ cụ thể." }] });
      expect(next.feedback_id).toBeTruthy();
      expect((next as unknown as { revision_activity_id: string }).revision_activity_id).toBe(rev); // D7
      const page = await studentRead<{ state: string; round: number }>(U().studentAn, "select english.eng_my_revision($1) as r", [rev]);
      expect(page).toMatchObject({ state: "todo", round: 2 });
      const r2 = await reviseAs(U().studentAn, rev, `${TEXT_A} As a result, it is violent. For example, Mount St Helens.`, { "1": { choice: "changed" } });
      const [a2] = await q1<{ attempt_no: number; parent_attempt_id: string; revises_attempt_id: string; learning_family_id: string }>(
        "select attempt_no, parent_attempt_id, revises_attempt_id, learning_family_id from english.attempts where id = $1", [r2.attempt_id]);
      const [r0] = await q1<{ learning_family_id: string }>("select learning_family_id from english.attempts where id = $1", [root]);
      expect(a2).toEqual({ attempt_no: 3, parent_attempt_id: attempt, revises_attempt_id: attempt, learning_family_id: r0!.learning_family_id });
      expect((await svc<View>("select english.eng_revision_view($1, $2) as r", [r2.attempt_id, M().tutorAn]))).toMatchObject({ round: 2, can_open_round2: false, can_finish: true });
      await fail(finish(M().tutorAn, r2.attempt_id, { action: "round2", checks: [{ n: 1, verdict: "improved" }], praise: "x", items: [{ text: "y" }] }), "23514", /\(max_rounds\)/);
      await fail(write(M().tutorAn, r2.attempt_id), "23514", /\(max_rounds\)/);
      await finish(M().tutorAn, r2.attempt_id, { checks: [{ n: 1, verdict: "improved" }] });
    });

    it("panel: eligibility, who may give, the live note with its edit window, the history; never for the student", async () => {
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const root = (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id;
      type Panel = { eligible: boolean; can_give: boolean; text: string | null; live: { editable: boolean; revision_state: string; author_is_me: boolean } | null; history: unknown[] };
      const panel = (by: string) => svc<Panel>("select english.eng_feedback_panel($1, $2) as r", [root, by]);
      expect(await panel(M().tutorAn)).toMatchObject({ eligible: true, can_give: true, text: TEXT_A, live: null, history: [] });
      const first = await write(M().tutorAn, root);
      await write(M().tutorAn, root, { supersedes: first.id, praise: "Con nêu rõ hai loại núi lửa." });
      expect(await panel(M().tutorAn)).toMatchObject({ can_give: false, live: { editable: true, revision_state: "todo", author_is_me: true } });
      expect((await panel(M().tutorAn)).history).toHaveLength(1);
      expect(await panel(M().parent)).toMatchObject({ live: { editable: false, author_is_me: false } });
      await fail(student(U().studentAn, "select english.eng_feedback_panel($1, $2) as r", [root, M().studentAn]), "42501");
      await fail(student(U().studentAn, "select english.eng_revision_list($1) as r", [s.learners.an]), "42501");
    });

    it("inbox: a revision shows its round and stays 'to do' until Xong / Mở vòng 2, even with no score at all", async () => {
      const { attempt } = await revised();
      const todo = await inboxAs(U().tutorAn, "todo");
      expect(todo.items.find((i) => i.attempt_id === attempt)?.revision_round).toBe(1);
      await finish(M().tutorAn, attempt);
      expect((await inboxAs(U().tutorAn, "todo")).items.some((i) => i.attempt_id === attempt)).toBe(false);
      expect((await inboxAs(U().tutorAn, "done")).items.some((i) => i.attempt_id === attempt)).toBe(true);
      // ordinary work keeps the S5 rule (done = every skill decided)
      expect((await inboxAs(U().tutorAn, "todo")).items.some((i) => i.revision_round === null)).toBe(true);
    });

    it("'Bài đã sửa' lists the pairs newest first with the verdict counts; scoring the A3 skill goes through S5 and stays off the target set", async () => {
      const { attempt } = await revised();
      await finish(M().tutorAn, attempt, { checks: [{ n: 1, verdict: "improved" }, { n: 2, verdict: "not_yet" }] });
      const list = await svc<{ items: { attempt_id: string; state: string; good: number; not_yet: number; items_count: number }[] }>(
        "select english.eng_revision_list($1) as r", [s.learners.an]);
      expect(list.items[0]).toMatchObject({ attempt_id: attempt, state: "done", good: 1, not_yet: 1, items_count: 2 });
      const r = await svc<unknown[]>("select english.eng_record_reviews($1, $2::jsonb, $3, $4) as r",
        [await episodeOf(attempt), JSON.stringify([{ target_key: "A-A3-REDRAFT", score: 3, not_observed: false }]), M().tutorAn, randomUUID()]);
      expect(r).toHaveLength(1);
      // D4: neither A3 target is in a published target set
      expect(await n("select count(*)::int as n from english.target_set_definitions where target_ids && array['A-A3-REDRAFT', 'B-A3-REVISE']")).toBe(0);
    });

    it("purge: the dry run counts the three books and the purge deletes them with the attempts, with a matching receipt", async () => {
      // a throwaway TEST child with its own student login, in the test family, with An's tutor
      const user = await createAuthUser(db.client, `s6-purge-${randomUUID().slice(0, 8)}@test.local`);
      const member = (await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'student', 'Em thử S6') returning id", [user, s.familyId]))[0]!.id;
      const learner = (await q1<{ id: string }>(
        "insert into english.learners(family_id, alias, track_id, is_test, status, member_id) values ($1, 'Em thử S6', 'A', true, 'active', $2) returning id", [s.familyId, member]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'tutor')", [M().tutorAn, learner]);
      const x = (await q1<{ id: string }>("select english.eng_assign_inquiry($1, 'A-W1-VOLCANOES', 1, $2, $3, $4) as id",
        [learner, dueReleasingAll("A-W1-VOLCANOES"), M().parent, `s6-purge-${randomUUID()}`]))[0]!.id;
      const root = (await submitText(user, await step(x, 6), TEXT_A)).attempt_id;
      const rev = (await write(M().tutorAn, root)).revision_activity_id!;
      const r = await reviseAs(user, rev, `${TEXT_A} So it is violent.`, { "1": { choice: "changed" }, "2": { choice: "changed" } });
      await finish(M().tutorAn, r.attempt_id, { checks: [{ n: 1, verdict: "improved" }, { n: 2, verdict: "improved" }] });

      const preview = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [learner]);
      expect([preview.counts.feedback_notes, preview.counts.revision_marks, preview.counts.revision_checks]).toEqual([2, 2, 2]); // feedback + closing
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [learner, U().parent]);
      expect(receipt.deleted).toEqual(preview.counts);
      expect(await n(`select ((select count(*) from english.feedback_notes where learner_id = $1) + (select count(*) from english.revision_marks where learner_id = $1)
                      + (select count(*) from english.revision_checks where learner_id = $1) + (select count(*) from english.attempts where learner_id = $1)
                      + (select count(*) from english.activity_instances where learner_id = $1))::int as n`, [learner])).toBe(0);
    });
  });
});
