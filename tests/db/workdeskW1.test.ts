import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

describe("W1 workdesk (migration 0025)", () => {
  let db: TestDb; let s: Seeded;
  const M = () => s.members; const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull(); expect(err?.code, err?.message).toBe(code); if (re) expect(err?.message).toMatch(re);
  };
  beforeAll(async () => { db = await createTestDb(); await migrate(db.client); s = await seed(db.client); });
  afterAll(async () => { await db?.drop(); });

  describe("1. tables", () => {
    it("exist, are append-only and reject direct inserts from service_role", async () => {
      for (const t of ["teaching_notes", "learner_intake", "app_feedback", "app_feedback_events"]) {
        expect((await q1("select to_regclass($1) as r", [`english.${t}`]))[0]).toEqual({ r: `english.${t}` });
      }
      await fail(svc("insert into english.teaching_notes(learner_id, field, text, author_member, author_role, client_id) values ($1,'focus','x',$2,'tutor','c-00000001')", [NG(), M().tutorNguyen]), "42501");
    });
    it("students read nothing; tutor of the child and parent of the family read", async () => {
      await q1(`insert into english.teaching_notes(learner_id, field, text, author_member, author_role, client_id) values ($1,'focus','Đảo ngữ',$2,'tutor','c-seed-0001')`, [NG(), M().tutorNguyen]);
      const read = (uid: string) => asCommit(db.client, "authenticated", uid, async (q) => (await q("select count(*)::int as n from english.teaching_notes where learner_id = $1", [NG()])).rows[0] as { n: number });
      expect((await read(s.users.studentNguyen)).n).toBe(0);
      expect((await read(s.users.tutorNguyen)).n).toBe(1);
      expect((await read(s.users.parent)).n).toBe(1);
      expect((await read(s.users.tutorAn)).n).toBe(0);
    });
  });
});
