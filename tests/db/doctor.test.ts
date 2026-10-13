import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkDbConnect,
  checkLearnerCounts,
  checkMigrations,
  checkPgVersion,
  checkPublicClean,
  checkRls,
  type DbHandle,
} from "@/lib/ops/doctor";
import { listMigrations } from "../../scripts/lib/migrate";
import { createTestDb, migrate, seed, type TestDb } from "./helpers";

const handle = (db: TestDb): DbHandle => ({ query: (sql, params) => db.client.query(sql, params) });

describe("doctor DB checks", () => {
  let db: TestDb;
  let versions: string[];

  beforeAll(async () => {
    db = await createTestDb();
    versions = (await listMigrations()).map((m) => m.version);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("fresh stub DB before migrations → migrations check fails listing all versions", async () => {
    const r = await checkMigrations(handle(db), versions);
    expect(r.status).toBe("fail");
    expect(r.detail).toBe(`còn thiếu: ${versions.join(", ")}`);
  });

  it("after all migrations every DB check is ok", async () => {
    await migrate(db.client);
    const h = handle(db);
    expect((await checkDbConnect(h, "x")).status).toBe("ok");
    expect((await checkMigrations(h, versions)).status).toBe("ok");
    expect((await checkRls(h)).status).toBe("ok");
    // Launcher's own public.families / public.audit_log (same names as ours) must not trip the check.
    expect((await checkPublicClean(h)).status).toBe("ok");
    expect((await checkPgVersion(h)).status).toBe("ok");
    expect(await checkLearnerCounts(h)).toMatchObject({ status: "info", detail: "0 learner thử · 0 learner thật" });
  });

  it("counts test learners", async () => {
    await seed(db.client);
    const r = await checkLearnerCounts(handle(db));
    expect(r.status).toBe("info");
    expect(r.detail).toMatch(/^2 learner thử · 0 learner thật$/);
  });

  it("a table without RLS in english → fails and names it", async () => {
    await db.client.query("create table english.zz_open (id int)");
    const r = await checkRls(handle(db));
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("zz_open");
    await db.client.query("alter table english.zz_open enable row level security");
    expect((await checkRls(handle(db))).status).toBe("ok");
    await db.client.query("drop table english.zz_open");
  });

  it("a migration version missing from schema_migrations → fails and lists it", async () => {
    await db.client.query("delete from english.schema_migrations where version = '0004'");
    const r = await checkMigrations(handle(db), versions);
    expect(r.status).toBe("fail");
    expect(r.detail).toBe("còn thiếu: 0004");
    await db.client.query("insert into english.schema_migrations(version) values ('0004') on conflict do nothing");
    expect((await checkMigrations(handle(db), versions)).status).toBe("ok");
  });

  it("a future file version not yet applied is reported", async () => {
    const r = await checkMigrations(handle(db), [...versions, "9999"]);
    expect(r.status).toBe("fail");
    expect(r.detail).toBe("còn thiếu: 9999");
  });

  it("eng_ function or our table in public → fails", async () => {
    await db.client.query("create function public.eng_oops() returns int language sql as 'select 1'");
    await db.client.query("create table public.learners (id int)");
    const r = await checkPublicClean(handle(db));
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("eng_oops");
    expect(r.detail).toContain("learners");
    await db.client.query("drop function public.eng_oops()");
    await db.client.query("drop table public.learners");
    expect((await checkPublicClean(handle(db))).status).toBe("ok");
  });
});
