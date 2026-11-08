import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** W2 · Giáo trình (migration 0026): tables, guards, RLS, functions, listening tags, AI purpose, lesson note v3, purge. One database. */
describe("W2 curriculum (migration 0026)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
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

  describe("1. tables and reading rights", () => {
    it("exist, refuse direct writes even from service_role", async () => {
      for (const t of ["curricula", "curriculum_versions", "curriculum_units", "curriculum_unit_points", "curriculum_unit_events", "lesson_note_units"]) {
        expect((await q1("select to_regclass($1)::text as r", [`english.${t}`]))[0]).toEqual({ r: `english.${t}` });
      }
      await fail(svc(
        "insert into english.curricula(family_id, learner_id, track_id, title, created_by_member, client_id) values ($1,$2,'B','x',$3,'raw-00000001') returning id as r",
        [s.familyId, NG(), M().tutorNguyen]), "42501");
    });
    it("the child's tutor and the parent read; the other tutor and students read nothing", async () => {
      // written as the table owner (the app writes through the functions of Task 2)
      await q1("insert into english.curricula(family_id, learner_id, track_id, title, level_note, created_by_member, client_id) values ($1,$2,'B','Reading Explorer 3','Quyển 3 ≈ B1+',$3,'raw-00000002')",
        [s.familyId, NG(), M().tutorNguyen]);
      const n = async (uid: string) =>
        (await rowsAs<{ n: number }>(db.client, "authenticated", uid, "select count(*)::int as n from english.curricula where learner_id = $1", [NG()]))[0]!.n;
      expect(await n(s.users.tutorNguyen)).toBe(1);
      expect(await n(s.users.parent)).toBe(1);
      expect(await n(s.users.tutorAn)).toBe(0);
      expect(await n(s.users.studentNguyen)).toBe(0);
    });
  });

});
