import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { seedThrowawayLearner } from "../../scripts/lib/seed";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

const TODAY = todayVn();
const daysAgo = (n: number) => addDays(TODAY, -n);

/** S5c (migration 0017): readiness fixes. One database for the whole file; every test builds on its own learner or title. */
describe("S5c readiness (migration 0017)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;

  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("1. lesson note v2 logs the skills practised (exposure_log)", () => {
    type NoteRes = { id: string; replayed: boolean };
    const note = (
      by: string,
      o: { learner?: string; date?: string; studied?: string | null; practised?: string[]; weak?: string[]; supersedes?: string | null; clientId?: string } = {},
    ) =>
      svc<NoteRes>("select english.eng_write_lesson_note_v2($1, $2::date, $3, $4::text[], null, null, '[]'::jsonb, $5, $6, $7, $8::text[]) as r", [
        o.learner ?? NG(), o.date ?? TODAY, o.studied === undefined ? "Unit 13" : o.studied, o.weak ?? [], o.supersedes ?? null, by,
        o.clientId ?? randomUUID(), o.practised ?? [],
      ]);
    const exposures = (noteId: string) =>
      q1<{ target_key: string; source: string; learner_id: string; at: Date }>(
        "select target_key, source, learner_id, at from english.exposure_log where lesson_note_id = $1 order by target_key", [noteId]);

    it("writes one exposure per practised skill, source 'lesson', on the day of the session", async () => {
      const n = await note(M().tutorNguyen, { date: daysAgo(3), practised: ["B-T7-ARGUE", "B-L2-CLOZE"], clientId: "s5c-note-0001" });
      const rows = await exposures(n.id);
      expect(rows.map((r) => r.target_key)).toEqual(["B-L2-CLOZE", "B-T7-ARGUE"]);
      for (const r of rows) {
        expect(r.source).toBe("lesson");
        expect(r.learner_id).toBe(NG());
        // 12:00 Vietnam time of the session day (not the day it was typed in)
        expect(r.at.toISOString()).toBe(new Date(`${daysAgo(3)}T05:00:00.000Z`).toISOString());
      }
      expect((await q1<{ practised_target_ids: string[] }>("select practised_target_ids from english.lesson_notes where id = $1", [n.id]))[0]?.practised_target_ids).toEqual([
        "B-T7-ARGUE", "B-L2-CLOZE",
      ]);
    });

    it("a parent can log them too; duplicates collapse; practised alone is enough for a note", async () => {
      const n = await note(M().parent, { studied: null, practised: ["B-T7-ARGUE", " B-T7-ARGUE ", ""], clientId: "s5c-note-0002" });
      expect((await exposures(n.id)).map((r) => r.target_key)).toEqual(["B-T7-ARGUE"]);
    });

    it("refuses a skill of another track, an unknown skill, and more than 30", async () => {
      const before = await count("select count(*)::int as n from english.exposure_log");
      await fail(note(M().tutorNguyen, { practised: ["A-T1-TEXT-R"], clientId: "s5c-note-0003" }), "23514", /not a skill of this learner/);
      await fail(note(M().tutorNguyen, { practised: ["B-T7-ARGUE", "NOPE-1"], clientId: "s5c-note-0004" }), "23514", /not a skill of this learner/);
      await fail(note(M().tutorAn, { learner: AN(), practised: ["B-T7-ARGUE"], clientId: "s5c-note-0005" }), "23514", /not a skill of this learner/);
      await fail(note(M().tutorNguyen, { practised: Array.from({ length: 31 }, (_, i) => `B-X-${i}`), clientId: "s5c-note-0006" }), "23514", /at most 30/);
      expect(await count("select count(*)::int as n from english.exposure_log")).toBe(before); // nothing half-written
    });

    it("sent twice it is the same note and adds no second exposure; a different skill list under the same id is refused", async () => {
      const a = await note(M().tutorNguyen, { practised: ["B-T7-ARGUE"], clientId: "s5c-note-0007" });
      expect(await note(M().tutorNguyen, { practised: ["B-T7-ARGUE"], clientId: "s5c-note-0007" })).toEqual({ ...a, replayed: true });
      expect(await exposures(a.id)).toHaveLength(1);
      await fail(note(M().tutorNguyen, { practised: ["B-L2-CLOZE"], clientId: "s5c-note-0007" }), "23505");
      await fail(note(M().tutorNguyen, { practised: [], clientId: "s5c-note-0007" }), "23505");
    });

    it("an edit logs only the NEW skills and can never remove one that was already logged", async () => {
      const a = await note(M().tutorNguyen, { practised: ["B-T7-ARGUE"], clientId: "s5c-note-0008" });
      await fail(note(M().tutorNguyen, { practised: ["B-L2-CLOZE"], supersedes: a.id, clientId: "s5c-note-0009" }), "23514", /cannot be removed/);
      const b = await note(M().tutorNguyen, { practised: ["B-T7-ARGUE", "B-L2-CLOZE"], supersedes: a.id, clientId: "s5c-note-0010" });
      expect((await exposures(b.id)).map((r) => r.target_key)).toEqual(["B-L2-CLOZE"]);
      expect(await count("select count(*)::int as n from english.exposure_log where lesson_note_id = any($1::uuid[])", [[a.id, b.id]])).toBe(2);
    });

    it("the old 10-argument call still works, the function is closed to everyone but service_role, and only one version exists", async () => {
      const n = await svc<NoteRes>("select english.eng_write_lesson_note_v2($1, $2::date, 'Old call', '{}'::text[], null, null, '[]'::jsonb, null, $3, $4) as r", [
        NG(), TODAY, M().tutorNguyen, "s5c-note-0011",
      ]);
      expect(await exposures(n.id)).toHaveLength(0);
      expect(await count("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'english' and p.proname = 'eng_write_lesson_note_v2'")).toBe(1);
      const priv = await q1<{ r: string; ok: boolean }>(
        `select r, has_function_privilege(r, p.oid, 'execute') as ok
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(array['anon', 'authenticated', 'service_role']) r
          where n.nspname = 'english' and p.proname = 'eng_write_lesson_note_v2'`);
      expect(Object.fromEntries(priv.map((p) => [p.r, p.ok]))).toEqual({ anon: false, authenticated: false, service_role: true });
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("2. a quick result without an assignment has one 'first' per learner + title + day", () => {
    type Res = { id: string; replayed: boolean; untagged: number };
    const quick = (
      by: string,
      o: { learner?: string; title?: string; on?: string; attempt?: "first" | "retry"; supersedes?: string | null; clientId?: string; assignment?: string | null } = {},
    ) =>
      svc<Res>("select english.eng_record_result($1, 'quick', null, $2, 10, 8, '{4,7}'::int[], null, 'home', $3, false, $4::date, $5, $6, $7, $8, null) as r", [
        o.learner ?? NG(), o.title ?? "Link practice", o.attempt ?? "first", o.on ?? TODAY, o.assignment ?? null, o.supersedes ?? null, by, o.clientId ?? randomUUID(),
      ]);

    it("the same learner, title (any case or spacing) and day cannot be a first attempt twice - tutor and parent alike", async () => {
      const a = await quick(M().tutorNguyen, { title: "Destination Unit 3", clientId: "s5c-dup-0001" });
      await fail(quick(M().parent, { title: "Destination Unit 3" }), "23505", /duplicate_first/);
      await fail(quick(M().parent, { title: "  destination   UNIT 3 " }), "23505", /duplicate_first/);
      // the same request sent again is a replay, not a duplicate
      expect(await quick(M().tutorNguyen, { title: "Destination Unit 3", clientId: "s5c-dup-0001" })).toEqual({ ...a, replayed: true });
    });

    it("another title, another day, another learner, or a retry are all fine", async () => {
      await quick(M().tutorNguyen, { title: "Destination Unit 4", clientId: "s5c-dup-0002" });
      await quick(M().tutorNguyen, { title: "Destination Unit 5", clientId: "s5c-dup-0003" });
      await quick(M().tutorNguyen, { title: "Destination Unit 4", on: daysAgo(1), clientId: "s5c-dup-0004" });
      await quick(M().tutorAn, { learner: AN(), title: "Destination Unit 4", clientId: "s5c-dup-0005" });
      await quick(M().parent, { title: "Destination Unit 4", attempt: "retry", clientId: "s5c-dup-0006" });
    });

    it("correcting the saved one (supersedes) is allowed once, and then the correction is the live first", async () => {
      const a = await quick(M().tutorNguyen, { title: "Destination Unit 6", clientId: "s5c-dup-0007" });
      const b = await quick(M().tutorNguyen, { title: "Destination Unit 6", supersedes: a.id, clientId: "s5c-dup-0008" });
      expect(b.replayed).toBe(false);
      await fail(quick(M().parent, { title: "Destination Unit 6", clientId: "s5c-dup-0009" }), "23505", /duplicate_first/);
      await fail(quick(M().tutorNguyen, { title: "Destination Unit 6", supersedes: a.id, clientId: "s5c-dup-0010" }), "23505");
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("3. 'Hỏi lại điểm yếu' has its own setting", () => {
    const settings = (by: string) => svc<{ recheck_days: number }>("select english.eng_tutorwork_settings($1) as r", [by]);
    const set = (by: string, key: string, value: unknown) =>
      svc<{ key: string; value: number }>("select english.eng_set_tutorwork_setting($1, $2::jsonb, $3) as r", [key, JSON.stringify(value), by]);

    it("is seeded with 14 days and readable by a tutor or a parent only", async () => {
      expect(await settings(M().tutorNguyen)).toEqual({ recheck_days: 14 });
      expect(await settings(M().parent)).toEqual({ recheck_days: 14 });
      await fail(settings(M().studentNguyen), "42501");
      await fail(settings(randomUUID()), "42501");
    });

    it("only a parent changes it, only to a whole number of days 1..180, and the change is logged and used", async () => {
      await fail(set(M().tutorNguyen, "recheck_days", 7), "42501", /only a parent/);
      await fail(set(M().studentNguyen, "recheck_days", 7), "42501");
      await fail(set(M().parent, "other_key", 7), "22023", /unknown setting/);
      for (const bad of [0, 181, 7.5, -3, "7", null, { a: 1 }]) await fail(set(M().parent, "recheck_days", bad), "22023");
      expect(await set(M().parent, "recheck_days", 10)).toEqual({ key: "recheck_days", value: 10 });
      expect((await settings(M().tutorAn)).recheck_days).toBe(10);
      expect(await count("select english.eng_recheck_days($1) as n", [NG()])).toBe(10);
      const log = await q1<{ payload: { from: number; to: number } }>("select payload from english.audit_log where action = 'tutorwork_setting.changed' order by id desc limit 1");
      expect(log[0]?.payload).toEqual({ key: "recheck_days", from: 14, to: 10 });
      await set(M().parent, "recheck_days", 14); // put it back for the rest of the file
    });

    it("the table is closed: RLS on, nobody but the owner reads or writes it directly, and the assessment policy is no longer the source", async () => {
      expect((await q1<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid = 'english.tutorwork_settings'::regclass"))[0]?.relrowsecurity).toBe(true);
      const priv = await q1<{ r: string; p: string; ok: boolean }>(
        `select r, p, has_table_privilege(r, 'english.tutorwork_settings', p) as ok
           from unnest(array['anon', 'authenticated', 'service_role']) r, unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p`);
      expect(priv.filter((x) => x.ok)).toEqual([]);
      const fn = (await q1<{ src: string }>("select pg_get_functiondef('english.eng_recheck_days(uuid)'::regprocedure) as src"))[0]?.src ?? "";
      expect(fn).toContain("tutorwork_settings");
      expect(fn).not.toContain("assessment_policies");
      const exec = await q1<{ fn: string; r: string; ok: boolean }>(
        `select p.proname as fn, r, has_function_privilege(r, p.oid, 'execute') as ok
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(array['anon', 'authenticated', 'service_role']) r
          where n.nspname = 'english' and p.proname in ('eng_tutorwork_settings', 'eng_set_tutorwork_setting')`);
      expect(exec.filter((x) => x.ok).map((x) => `${x.fn}:${x.r}`).sort()).toEqual(["eng_set_tutorwork_setting:service_role", "eng_tutorwork_settings:service_role"]);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("4. paper import: work dated up to 14 days before the assignment, with a reason", () => {
    const template = (id: string): InquiryTemplate => JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
    const dueReleasingAll = (id: string) => {
      const t = template(id);
      const last = t.steps.map((st) => st.planned_date ?? "").sort().at(-1) ?? "";
      return addDays(TODAY, daysBetween(last, t.dates.to));
    };
    let seq = 0;
    const assign = async (templateId: string, due: string) =>
      ((await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [AN(), templateId, due, M().parent, `s5c-assign-${(seq += 1)}`]))[0] as { id: string }).id;
    const step = async (instance: string, n: number) =>
      ((await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [instance, n]))[0] as { id: string }).id;
    type Offline = { attempt_id: string; episode_id: string; attempt_no: number; submitted_at: string; replayed: boolean };
    const offline = (by: string, act: string, o: { prov?: string; date?: string; reason?: string | null; clientId?: string; text?: string } = {}) =>
      svc<Offline>("select english.eng_record_offline_attempt($1, $2, $3, null, null, $4::date, '{none}'::text[], $5, $6, $7) as r", [
        act, o.prov ?? "manual_import", o.text ?? "Paper work from the pilot", o.date ?? TODAY, by, o.clientId ?? randomUUID(), o.reason ?? null,
      ]);
    let w1: string;
    let w3: string;
    beforeAll(async () => {
      w1 = await assign("A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const w3planned = template("A-W3-EARTHQUAKES").steps[6]?.planned_date as string;
      w3 = await assign("A-W3-EARTHQUAKES", addDays(TODAY, daysBetween(w3planned, template("A-W3-EARTHQUAKES").dates.to)));
    });

    it("without a reason the old rule stands: not earlier than the day before the assignment", async () => {
      await fail(offline(M().tutorAn, await step(w1, 4), { date: daysAgo(5) }), "23514", /day before the inquiry was assigned/);
      await fail(offline(M().parent, await step(w1, 4), { date: daysAgo(5), reason: "   " }), "23514", /day before the inquiry was assigned/);
    });

    it("with a reason (5-200 characters) a tutor or a parent can import paper work dated before the assignment", async () => {
      const act = await step(w1, 5);
      const r = await offline(M().tutorAn, act, { date: daysAgo(5), reason: "Nhập từ phiếu giấy pilot 17–19/10", clientId: "9a1f0c52-0000-4000-8000-000000000001" });
      expect(r.attempt_no).toBe(1);
      expect(new Date(r.submitted_at).toISOString()).toBe(new Date(`${daysAgo(5)}T05:00:00.000Z`).toISOString());
      const art = (await q1<{ content: Record<string, unknown> }>("select content from english.artifact_versions where attempt_id = $1", [r.attempt_id]))[0]?.content;
      expect(art).toMatchObject({ text: "Paper work from the pilot", session_date: daysAgo(5), backdate_reason: "Nhập từ phiếu giấy pilot 17–19/10" });
      const log = (await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'attempt.recorded_offline' and payload ->> 'attempt' = $1", [r.attempt_id]))[0]?.payload;
      expect(log).toMatchObject({ backdated: true, backdate_reason: "Nhập từ phiếu giấy pilot 17–19/10", provenance: "manual_import" });
      const parentCase = await offline(M().parent, await step(w1, 6), { date: daysAgo(3), reason: "Phiếu giấy làm ở nhà" });
      expect(parentCase.attempt_no).toBe(1);
    });

    it("at most 14 days before the assignment; never in the future; the reason has 5 to 200 characters", async () => {
      await fail(offline(M().tutorAn, await step(w1, 4), { date: daysAgo(15), reason: "Phiếu giấy cũ" }), "23514", /backdate_too_early/);
      expect((await offline(M().tutorAn, await step(w1, 4), { date: daysAgo(14), reason: "Phiếu giấy cũ" })).attempt_no).toBe(1);
      await fail(offline(M().tutorAn, await step(w1, 7), { date: addDays(TODAY, 1), reason: "Phiếu giấy cũ" }), "23514", /until today/);
      await fail(offline(M().tutorAn, await step(w1, 7), { date: daysAgo(5), reason: "abcd" }), "22023", /5 to 200/);
      await fail(offline(M().tutorAn, await step(w1, 7), { date: daysAgo(5), reason: "x".repeat(201) }), "22023", /5 to 200/);
      expect((await offline(M().tutorAn, await step(w1, 7), { date: daysAgo(5), reason: "x".repeat(200) })).attempt_no).toBe(1);
    });

    it("only paper work (manual_import) can be backdated - 'watched live' is always about today's session", async () => {
      await fail(offline(M().tutorAn, await step(w1, 5), { prov: "tutor_live", date: daysAgo(6), reason: "Phiếu giấy cũ" }), "22023", /only work on paper/);
    });

    it("the order of attempts is still real: not earlier than the last attempt of the same step", async () => {
      const act = await step(w1, 5); // already has an attempt dated 5 days ago
      await fail(offline(M().tutorAn, act, { date: daysAgo(9), reason: "Phiếu giấy cũ" }), "23514", /date_before_last_attempt/);
      expect((await offline(M().tutorAn, act, { date: daysAgo(5), reason: "Phiếu giấy làm lại" })).attempt_no).toBe(2);
      expect((await offline(M().tutorAn, act, { date: daysAgo(2), reason: "Phiếu giấy làm lại" })).attempt_no).toBe(3);
    });

    it("a step that opens today can take paper work from before it opened - with a reason only", async () => {
      const act = await step(w3, 7);
      await fail(offline(M().tutorAn, act, { date: daysAgo(1) }), "23514", /step_not_open_on_date/);
      expect((await offline(M().tutorAn, act, { date: daysAgo(1), reason: "Phiếu giấy làm hôm qua" })).attempt_no).toBe(1);
    });

    it("sent twice it is the same record; the same id with another reason is refused; the old 9-argument call still works", async () => {
      const act = await step(w1, 6);
      const id = "9a1f0c52-0000-4000-8000-000000000002";
      const a = await offline(M().parent, act, { date: daysAgo(3), reason: "Phiếu giấy làm ở nhà", clientId: id });
      expect(a.replayed).toBe(false);
      expect(await offline(M().parent, act, { date: daysAgo(3), reason: "Phiếu giấy làm ở nhà", clientId: id })).toMatchObject({ attempt_id: a.attempt_id, replayed: true });
      await fail(offline(M().parent, act, { date: daysAgo(3), reason: "Lý do khác hẳn", clientId: id }), "23505");
      const old = await svc<Offline>("select english.eng_record_offline_attempt($1, 'manual_import', 'Old style call', null, null, $2::date, '{none}'::text[], $3, $4) as r", [
        act, TODAY, M().parent, randomUUID(),
      ]);
      expect(old.attempt_no).toBeGreaterThan(1);
      expect(await count("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'english' and p.proname = 'eng_record_offline_attempt'")).toBe(1);
    });

    it("a student cannot call it; a paper import by a tutor still cannot be backdated on a tutor-only (checkpoint) step by a parent", async () => {
      const priv = await q1<{ r: string; ok: boolean }>(
        `select r, has_function_privilege(r, p.oid, 'execute') as ok
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(array['anon', 'authenticated', 'service_role']) r
          where n.nspname = 'english' and p.proname = 'eng_record_offline_attempt'`);
      expect(Object.fromEntries(priv.map((x) => [x.r, x.ok]))).toEqual({ anon: false, authenticated: false, service_role: true });
      await fail(offline(M().parent, await step(w1, 11), { date: daysAgo(5), reason: "Phiếu giấy cũ" }), "42501", /D15/);
    });
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("5. 'Xóa dữ liệu của em': the dry run matches the purge, the login account stays, the audit says who did it", () => {
    let victim: string;
    let studentUser: string;
    let studentMember: string;
    const preview = (learner: string) => svc<{ learner_id: string; alias: string; is_test: boolean; counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [learner]);

    beforeAll(async () => {
      studentUser = (await q1<{ id: string }>("insert into auth.users(email) values ('s5c-purge-student@test.local') returning id"))[0]?.id as string;
      studentMember = ((await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'student', 'Purge student') returning id", [studentUser, s.familyId]))[0] as { id: string }).id;
      victim = ((await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status, member_id) values ($1, 'Em thử xóa', 'B', true, 'active', $2) returning id", [s.familyId, studentMember]))[0] as { id: string }).id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [M().parent, victim]);
      await q1("insert into english.login_names(login_name, auth_user_id) values ('thu-xoa-em', $1)", [studentUser]);
      await q1("select english.eng_assign_target_set($1, 'B-v1')", [victim]);
      await svc("select english.eng_record_result($1, 'quick', null, 'Purge sample', 10, 8, '{4,7}'::int[], '[{\"n\":4,\"tag_key\":\"dang-tu\"}]'::jsonb, 'home', 'first', false, $2::date, null, null, $3, 'purge-sample-0001', null) as r", [victim, TODAY, M().parent]);
      await svc("select english.eng_write_lesson_note_v2($1, $2::date, 'Unit 1', '{dang-tu}'::text[], null, null, '[]'::jsonb, null, $3, 'purge-note-0001', '{B-T7-ARGUE}'::text[]) as r", [victim, TODAY, M().parent]);
    });

    it("the dry run reports counts under exactly the keys of the purge receipt, and they are the numbers the purge then deletes", async () => {
      const dry = await preview(victim);
      expect(dry).toMatchObject({ learner_id: victim, alias: "Em thử xóa", is_test: true });
      expect(dry.counts).toMatchObject({ results: 1, lesson_notes: 1, tag_marks: 2, exposure_log: 1, relationships: 1, target_sets: 1, login_names: 1, members: 1, learners: 1 });
      const before = await count("select count(*)::int as n from english.results where learner_id = $1", [victim]);
      expect(before).toBe(1); // the dry run deleted nothing
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [victim, s.users.parent]);
      expect(Object.keys(dry.counts).sort()).toEqual(Object.keys(receipt.deleted).sort());
      // the receipt counts the audit rows that existed when it ran; the dry run counted the same rows
      expect(receipt.deleted).toEqual(dry.counts);
    });

    it("never touches the login account: the auth user is still there, the short name and the student membership are gone", async () => {
      expect(await count("select count(*)::int as n from auth.users where id = $1", [studentUser])).toBe(1);
      expect(await count("select count(*)::int as n from english.login_names where auth_user_id = $1", [studentUser])).toBe(0);
      expect(await count("select count(*)::int as n from english.members where id = $1", [studentMember])).toBe(0);
      expect(await count("select count(*)::int as n from english.members where role in ('parent', 'tutor')")).toBeGreaterThan(0);
      // the family's other children are untouched
      expect(await count("select count(*)::int as n from english.learners where id = any($1::uuid[])", [[AN(), NG()]])).toBe(2);
    });

    it("the audit log keeps who purged (a receipt with counts, no content), then the number of stored files removed - only after a finished purge", async () => {
      const receipt = (await q1<{ actor_user_id: string; actor_role: string; payload: { deleted: Record<string, number> } }>(
        "select actor_user_id, actor_role, payload from english.audit_log where action = 'learner.purged' and learner_id = $1", [victim]))[0];
      expect(receipt).toMatchObject({ actor_user_id: s.users.parent, actor_role: "parent" });
      expect(JSON.stringify(receipt?.payload)).not.toContain("Purge sample");
      const files = (a: { fam?: string; learner?: string; user?: string; n?: number }) =>
        svc("select english.eng_audit_purge_files($1, $2, $3, $4) as r", [a.fam ?? s.familyId, a.learner ?? victim, a.user ?? s.users.parent, a.n ?? 3]);
      await fail(files({ user: s.users.tutorNguyen }), "23514", /no finished purge/); // another person
      await fail(files({ learner: NG() }), "23514", /no finished purge/); // a learner who still exists
      await fail(files({ learner: randomUUID() }), "23514", /no finished purge/); // never purged
      await fail(files({ n: -1 }), "22004");
      await files({});
      expect((await q1<{ payload: { removed: number }; family_id: string }>("select payload, family_id from english.audit_log where action = 'learner.files_deleted' and learner_id = $1", [victim]))[0]).toEqual({
        payload: { removed: 3 }, family_id: s.familyId,
      });
    });

    it("the throwaway learner of the e2e purge spec is a test learner of the test family with data, and purging it leaves An and Nguyên alone", async () => {
      const t = await seedThrowawayLearner(db.client, { alias: "Em thử xóa e2e" });
      expect((await q1<{ is_test: boolean; family_id: string; track_id: string }>("select is_test, family_id, track_id from english.learners where id = $1", [t.learnerId]))[0]).toEqual({
        is_test: true, family_id: s.familyId, track_id: "A",
      });
      const dry = await preview(t.learnerId);
      expect(dry.counts).toMatchObject({ results: 1, lesson_notes: 1, relationships: 1, target_sets: 1, members: 0, login_names: 0 });
      const anBefore = await count("select count(*)::int as n from english.results where learner_id = $1", [AN()]);
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [t.learnerId, s.users.parent]);
      expect(receipt.deleted).toEqual(dry.counts);
      expect(await count("select count(*)::int as n from english.learners where id = $1", [t.learnerId])).toBe(0);
      expect(await count("select count(*)::int as n from english.results where learner_id = $1", [AN()])).toBe(anBefore);
    });

    it("the preview of a learner that does not exist is refused; both functions are closed to everyone but service_role", async () => {
      await fail(svc("select english.eng_purge_preview($1) as r", [randomUUID()]), "P0002");
      const exec = await q1<{ fn: string; r: string; ok: boolean }>(
        `select p.proname as fn, r, has_function_privilege(r, p.oid, 'execute') as ok
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(array['anon', 'authenticated', 'service_role']) r
          where n.nspname = 'english' and p.proname in ('eng_purge_preview', 'eng_audit_purge_files')`);
      expect(exec.filter((x) => x.ok).map((x) => `${x.fn}:${x.r}`).sort()).toEqual(["eng_audit_purge_files:service_role", "eng_purge_preview:service_role"]);
    });
  });
});
