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
    it("Track B has 14 reading skills and Track A 6, in report order; A's generic doc-hieu is retired", async () => {
      const keys = async (track: string) =>
        (await q1<{ key: string }>("select key from english.error_tags where track_id = $1 and group_vi = 'Kỹ năng đọc' and retired_at is null order by created_at, key", [track])).map((r) => r.key);
      expect(await keys("B")).toHaveLength(14);
      expect((await keys("B"))[0]).toBe("doc-author-purpose");
      expect(await keys("A")).toEqual(["doc-main-idea", "doc-details", "doc-inference", "doc-author-purpose", "doc-context-clues", "doc-sequence"]);
      expect((await q1<{ retired: boolean }>("select retired_at is not null as retired from english.error_tags where track_id = 'A' and key = 'doc-hieu'"))[0]?.retired).toBe(true);
    });

    it("seeds the two thresholds and running the migration again changes nothing", async () => {
      const read = async () => q1<{ key: string; value: number }>("select key, value from english.tutorwork_settings where key like 'reading_%' order by key");
      expect(await read()).toEqual([{ key: "reading_min_questions", value: 4 }, { key: "reading_weak_pct", value: 60 }]);
      await migrate(db.client, true);
      expect(await read()).toEqual([{ key: "reading_min_questions", value: 4 }, { key: "reading_weak_pct", value: 60 }]);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.error_tags where group_vi = 'Kỹ năng đọc'"))[0]?.n).toBe(20);
    });
  });
});
