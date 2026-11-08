import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

describe("W3 points + import (migration 0027)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.client.query<R>(sql, p)).rows;
  const svc = <T = unknown>(sql: string, p: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, p)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const e = await p.then(() => null, (x: unknown) => x as { code?: string; message?: string });
    expect(e, "expected an error").not.toBeNull();
    expect(e?.code, e?.message).toBe(code);
    if (re) expect(e?.message).toMatch(re);
  };
  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });
  void randomUUID; void M; void NG; void svc; void fail;

  describe("1. attempts + template kind", () => {
    it("attempts has taken_on / support_level / source_hash; provenance accepts 'imported' only with a date and a support level", async () => {
      for (const col of ["taken_on", "support_level", "source_hash"]) {
        expect((await q1("select 1 as r from information_schema.columns where table_schema='english' and table_name='attempts' and column_name=$1", [col]))[0]).toEqual({ r: 1 });
      }
      const defs = await q1<{ d: string }>("select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='english.attempts'::regclass and conname in ('attempts_provenance_check','attempts_imported_shape')");
      expect(defs.map((x) => x.d).join(" ")).toMatch(/imported/);
      expect(defs.length).toBe(2);
    });
    it("inquiry_templates.kind accepts 'imported' with an A-IM-/B-IM- id", async () => {
      const d = await q1<{ d: string }>("select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='english.inquiry_templates'::regclass and conname in ('inquiry_templates_kind_check','inquiry_templates_id_check')");
      const all = d.map((x) => x.d).join(" ");
      expect(all).toMatch(/imported/);
      expect(all).toMatch(/IM-/);
    });
  });
});
