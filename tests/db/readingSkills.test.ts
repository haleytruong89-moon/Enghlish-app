import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayVn } from "../../lib/inquiries/dates";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

/** Studio 1A (migration 0018): reading skills. One database for the whole file. */
describe("Studio 1A reading skills (migration 0018)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
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

  describe("1. tags and thresholds", () => {
    it("Track B has 14 reading skills and Track A 6, in report order; A's generic doc-hieu stays active", async () => {
      const keys = async (track: string) =>
        (await q1<{ key: string }>("select key from english.error_tags where track_id = $1 and group_vi = 'Kỹ năng đọc' and retired_at is null order by created_at, key", [track])).map((r) => r.key);
      expect(await keys("B")).toHaveLength(14);
      expect((await keys("B"))[0]).toBe("doc-author-purpose");
      expect(await keys("A")).toEqual(["doc-main-idea", "doc-details", "doc-inference", "doc-author-purpose", "doc-context-clues", "doc-sequence"]);
      // The generic tag stays usable: eng_tag_exists rejects retired tags, which would break rechecks and corrections that mention it.
      expect((await q1<{ retired: boolean }>("select retired_at is not null as retired from english.error_tags where track_id = 'A' and key = 'doc-hieu'"))[0]?.retired).toBe(false);
    });

    it("seeds the two thresholds and running the migration again changes nothing", async () => {
      const read = async () => q1<{ key: string; value: number }>("select key, value from english.tutorwork_settings where key like 'reading_%' order by key");
      expect(await read()).toEqual([{ key: "reading_min_questions", value: 4 }, { key: "reading_weak_pct", value: 60 }]);
      await migrate(db.client, true);
      expect(await read()).toEqual([{ key: "reading_min_questions", value: 4 }, { key: "reading_weak_pct", value: 60 }]);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.error_tags where group_vi = 'Kỹ năng đọc'"))[0]?.n).toBe(20);
    });
  });

  type Rec = { id: string; replayed: boolean };
  const TODAY = todayVn();
  const thisMonth = `${TODAY.slice(0, 7)}-01`;
  const lastMonth = (() => { const d = new Date(`${thisMonth}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const row = (tag_key: string, questions: number, correct_pct: number) => ({ tag_key, questions, correct_pct });
  const record = (by: string, o: { learner?: string; month?: string; rows?: unknown; source?: string | null; note?: string | null; supersedes?: string | null; clientId?: string } = {}) =>
    svc<Rec>("select english.eng_record_reading_report($1, $2::date, $3, $4::jsonb, $5, $6, $7, $8) as r", [
      o.learner ?? NG(), o.month ?? thisMonth, o.source === undefined ? null : o.source,
      JSON.stringify(o.rows ?? [row("doc-cause-effect", 5, 40), row("doc-sequence", 1, 0), row("doc-main-idea", 8, 75)]),
      o.note ?? null, o.supersedes ?? null, by, o.clientId ?? randomUUID(),
    ]);
  const skills = (l: string = NG()) => svc<{
    min_questions: number; weak_pct: number; latest_month: string | null; previous_month: string | null;
    skills: { tag_key: string; questions: number | null; correct_pct: number | null; prev_correct_pct: number | null; status: string; wrong_6w: number }[];
  }>("select english.eng_reading_skills($1) as r", [l]);

  describe("2. recording a monthly report", () => {
    it("a tutor or a parent records one; replaying the same client id returns it; another payload under the same id is refused", async () => {
      const id = "reading-0001-aaaa";
      const a = await record(M().tutorNguyen, { month: lastMonth, clientId: id, rows: [row("doc-cause-effect", 4, 75)] });
      expect(a.replayed).toBe(false);
      expect(await record(M().tutorNguyen, { month: lastMonth, clientId: id, rows: [row("doc-cause-effect", 4, 75)] })).toEqual({ id: a.id, replayed: true });
      await fail(record(M().tutorNguyen, { month: lastMonth, clientId: id, rows: [row("doc-cause-effect", 4, 50)] }), "23505");
      // the same client id from ANOTHER member is not a replay
      await fail(record(M().parent, { month: lastMonth, clientId: id, rows: [row("doc-cause-effect", 4, 75)] }), "23505");
      const b = await record(M().parent, { month: thisMonth });
      expect(b.replayed).toBe(false);
    });

    it("one current report per month and source; a correction replaces it once; the source name keeps months apart", async () => {
      await fail(record(M().tutorNguyen, { month: thisMonth }), "23505", /\(duplicate_month\)/);
      const cur = (await q1<{ id: string }>("select id from english.reading_reports r where learner_id = $1 and month = $2 and not exists (select 1 from english.reading_reports r2 where r2.supersedes_id = r.id)", [NG(), thisMonth]))[0]!.id;
      const fixed = await record(M().tutorNguyen, { month: thisMonth, supersedes: cur, rows: [row("doc-cause-effect", 5, 40), row("doc-sequence", 1, 0), row("doc-main-idea", 8, 75), row("doc-summarize", 6, 50)] });
      await fail(record(M().tutorNguyen, { month: thisMonth, supersedes: cur }), "23505", /\(stale_report\)/); // already replaced: someone else fixed it first
      await fail(record(M().tutorNguyen, { month: lastMonth, supersedes: fixed.id }), "23514");
      // another source for LAST month, recorded after the TOMO one with very different numbers: it must never become the "previous" of the TOMO report
      expect((await record(M().tutorNguyen, { month: lastMonth, source: "Lớp học", rows: [row("doc-cause-effect", 10, 99)] })).replayed).toBe(false);
    });

    it("refuses a bad month, a future month, an unknown or other-track skill, duplicates, bad numbers and extra keys", async () => {
      const next = (() => { const d = new Date(`${thisMonth}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); })();
      await fail(record(M().tutorNguyen, { month: `${TODAY.slice(0, 7)}-15` }), "23514", /\(bad_month\)/);
      await fail(record(M().tutorNguyen, { month: next }), "23514", /\(bad_month\)/);
      await fail(record(M().tutorNguyen, { month: lastMonth, source: "x1", rows: [row("doc-details", 4, 50)] }), "23514"); // Track A only
      await fail(record(M().tutorNguyen, { month: lastMonth, source: "x2", rows: [row("dang-tu", 4, 50)] }), "23514"); // not a reading skill
      await fail(record(M().tutorNguyen, { month: lastMonth, source: "x3", rows: [row("doc-sequence", 4, 50), row("doc-sequence", 2, 0)] }), "22023");
      for (const bad of [[row("doc-sequence", 0, 50)], [row("doc-sequence", 4, 101)], [{ tag_key: "doc-sequence", questions: 4.5, correct_pct: 50 }],
        [{ tag_key: "doc-sequence", questions: 4, correct_pct: 50, extra: 1 }], [], "x"]) {
        await fail(record(M().tutorNguyen, { month: lastMonth, source: "x4", rows: bad }), "22023");
      }
      await fail(record(M().tutorNguyen, { month: lastMonth, source: "x5", note: "n".repeat(301) }), "22023", /\(note_too_long\)/);
    });

    it("only staff of this learner: a student, the other child's tutor and strangers are refused", async () => {
      await fail(record(M().studentNguyen, { month: lastMonth, source: "s1" }), "42501");
      await fail(record(M().tutorAn, { month: lastMonth, source: "s2" }), "42501");
      await fail(record(randomUUID(), { month: lastMonth, source: "s3" }), "42501");
      await fail(record(M().tutorNguyen, { learner: randomUUID(), month: lastMonth }), "P0002");
    });

    it("is append-only, writes an audit row without content, and both functions are closed to everyone but service_role", async () => {
      const upd = await db.client.query("update english.reading_reports set note = 'x'").then(() => null, (e: unknown) => e);
      expect(upd, "append-only: an update outside a purge must fail").not.toBeNull();
      // service_role cannot insert directly either: only the function writes
      const ins = await asCommit(db.client, "service_role", null, (q) =>
        q("insert into english.reading_reports(learner_id, month, rows, recorded_by_member, recorded_role, client_id) values ($1, $2::date, '[]'::jsonb, $3, 'tutor', 'direct-insert-1')", [NG(), thisMonth, M().tutorNguyen]),
      ).then(() => null, (e: unknown) => e as { code?: string });
      expect(ins?.code, "service_role INSERT must be denied").toBe("42501");
      const log = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'reading_report.recorded' order by id desc limit 1");
      expect(Object.keys(log[0]!.payload).sort()).toEqual(["month", "report_id", "skills", "source", "supersedes"]);
      const acl = await q1<{ proname: string; anon: boolean; auth: boolean; svc: boolean }>(`
        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
               has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'english' and p.proname in ('eng_record_reading_report', 'eng_reading_skills')`);
      expect(acl).toHaveLength(2);
      for (const a of acl) expect([a.anon, a.auth, a.svc]).toEqual([false, false, true]);
    });
  });

  describe("3. the 'Kỹ năng đọc' table", () => {
    it("lists every reading skill of the track with the latest report, last month's %, thresholds from settings", async () => {
      const v = await skills();
      expect(v.min_questions).toBe(4);
      expect(v.weak_pct).toBe(60);
      expect(v.latest_month).toBe(thisMonth);
      expect(v.previous_month).toBe(lastMonth);
      expect(v.skills).toHaveLength(14);
      const by = new Map(v.skills.map((x) => [x.tag_key, x]));
      expect(by.get("doc-cause-effect")).toMatchObject({ questions: 5, correct_pct: 40, prev_correct_pct: 75, status: "weak" });
      expect(by.get("doc-sequence")).toMatchObject({ questions: 1, status: "thin" }); // 1 question: not enough to judge
      expect(by.get("doc-main-idea")).toMatchObject({ questions: 8, correct_pct: 75, status: "ok" });
      expect(by.get("doc-prediction")).toMatchObject({ questions: null, status: "none" });
    });

    it("counts wrong items tagged with a reading skill in the last 6 weeks (first attempts only)", async () => {
      await svc("select english.eng_record_result($1, 'quick', null, 'Reading test', 10, 8, '{3,5}', $2::jsonb, 'home', 'first', false, $3::date, null, null, $4, $5, 'test') as r",
        [NG(), JSON.stringify([{ n: 3, tag_key: "doc-cause-effect" }, { n: 5, tag_key: "doc-cause-effect" }]), addDays(TODAY, -3), M().tutorNguyen, randomUUID()]);
      const by = new Map((await skills()).skills.map((x) => [x.tag_key, x]));
      expect(by.get("doc-cause-effect")?.wrong_6w).toBe(2);
    });

    it("'previous' is the latest earlier report of the SAME source as the latest one (a 'Lớp học' report never stands in for TOMO)", async () => {
      const l = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Em thử nguồn', 'B', true, 'active') returning id", [s.familyId]))[0]!.id;
      await record(M().parent, { learner: l, month: lastMonth, rows: [row("doc-sequence", 8, 50)] });
      await record(M().parent, { learner: l, month: lastMonth, source: "Lớp học", rows: [row("doc-sequence", 8, 99)] });
      await record(M().parent, { learner: l, month: thisMonth, rows: [row("doc-sequence", 8, 70)] });
      const v = await skills(l);
      expect(v.latest_month).toBe(thisMonth);
      expect(v.previous_month).toBe(lastMonth);
      expect(v.skills.find((x) => x.tag_key === "doc-sequence")).toMatchObject({ correct_pct: 70, prev_correct_pct: 50 });
      // a latest report from another source with no earlier report of its own has no previous
      const l2 = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Em thử nguồn 2', 'B', true, 'active') returning id", [s.familyId]))[0]!.id;
      await record(M().parent, { learner: l2, month: lastMonth, rows: [row("doc-sequence", 8, 50)] });
      await record(M().parent, { learner: l2, month: thisMonth, source: "Lớp học", rows: [row("doc-sequence", 8, 70)] });
      expect((await skills(l2)).previous_month).toBeNull();
    });

    it("only wrong items from tests and practice count: a lesson-note tag on a reading skill does not", async () => {
      await svc("select english.eng_write_lesson_note_v2($1, $2::date, 'Reading', '{doc-inference}'::text[], null, null, '[]'::jsonb, null, $3, $4) as r", [NG(), TODAY, M().tutorNguyen, randomUUID()]);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.tag_marks where learner_id = $1 and tag_key = 'doc-inference' and source = 'lesson'", [NG()]))[0]?.n).toBeGreaterThan(0);
      const by = new Map((await skills()).skills.map((x) => [x.tag_key, x]));
      expect(by.get("doc-inference")?.wrong_6w).toBe(0);
    });

    it("a setting that is not a whole number falls back to the default instead of failing the page", async () => {
      try {
        await q1("update english.tutorwork_settings set value = '\"abc\"'::jsonb where key = 'reading_min_questions'");
        await q1("update english.tutorwork_settings set value = '60.5'::jsonb where key = 'reading_weak_pct'");
        const v = await skills();
        expect([v.min_questions, v.weak_pct]).toEqual([4, 60]);
      } finally {
        await q1("update english.tutorwork_settings set value = '4'::jsonb where key = 'reading_min_questions'");
        await q1("update english.tutorwork_settings set value = '60'::jsonb where key = 'reading_weak_pct'");
      }
    });

    it("a learner with no report gets every skill as 'none'; Track A shows its 6", async () => {
      const v = await svc<{ latest_month: string | null; skills: { status: string }[] }>("select english.eng_reading_skills($1) as r", [AN()]);
      expect(v.latest_month).toBeNull();
      expect(v.skills).toHaveLength(6);
      expect(v.skills.every((x) => x.status === "none")).toBe(true);
    });
  });

  describe("4. purge", () => {
    it("the preview counts reading reports and the purge deletes them", async () => {
      const prev = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [NG()]);
      expect(prev.counts.reading_reports).toBeGreaterThanOrEqual(3);
      const fnSrc = (await q1<{ src: string }>("select pg_get_functiondef('english.eng_purge_learner(uuid, uuid)'::regprocedure) as src"))[0]?.src ?? "";
      expect(fnSrc).toContain("delete from english.reading_reports");
    });

    it("a real purge deletes a report and its correction (self-reference) and the receipt counts them", async () => {
      const l = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Em thử đọc', 'B', true, 'active') returning id", [s.familyId]))[0]!.id;
      const first = await record(M().parent, { learner: l, month: thisMonth });
      await record(M().parent, { learner: l, month: thisMonth, supersedes: first.id });
      const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [l]);
      expect(dry.counts.reading_reports).toBe(2);
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [l, s.users.parent]);
      expect(receipt.deleted.reading_reports).toBe(2);
      expect(receipt.deleted).toEqual(dry.counts);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.reading_reports where learner_id = $1", [l]))[0]?.n).toBe(0);
    });
  });
});
