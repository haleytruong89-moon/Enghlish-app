/* eslint-disable @typescript-eslint/no-unused-vars -- helpers are used by the sections added in Tasks 2-4 (removed in Task 4) */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
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
  const reviseAs = (user: string, activity: string, text: string, marks: unknown, o: { clientId?: string; assistance?: string[] } = {}) =>
    student<Receipt>(user, "select english.eng_submit_revision($1, $2, $3, $4::jsonb, $5::text[], 'in_app') as r", [
      activity, o.clientId ?? randomUUID(), text, JSON.stringify(marks), o.assistance ?? ["none"],
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

  // (Tasks 3 and 4 add their sections here)
});
