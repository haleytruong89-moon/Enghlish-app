import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayVn } from "../../lib/inquiries/dates";
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
});
