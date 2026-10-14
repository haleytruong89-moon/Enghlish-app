import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, applyMigrations, listMigrations } from "../../scripts/lib/migrate";
import { createTestDb, type TestDb } from "./helpers";

const B_WEEKS = "('B-W1-HOMEWORK', 'B-W2-PHONES', 'B-W3-TRANSPORT', 'B-W4-AI-HOMEWORK')";

/** A folder holding the real migrations whose version passes `keep`; `patch` may rewrite 0012 on the way. */
async function folder(keep: (version: string) => boolean, patch?: (sql: string) => string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "mig0012-"));
  for (const m of await listMigrations()) {
    if (!keep(m.version)) continue;
    if (m.version === "0012" && patch) await writeFile(path.join(dir, path.basename(m.file)), patch(await readFile(m.file, "utf8")));
    else await copyFile(m.file, path.join(dir, path.basename(m.file)));
  }
  return dir;
}

describe("0012 fails loudly instead of silently inserting nothing", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of cleanup.splice(0)) await c();
  });

  async function setup(keep: (v: string) => boolean, patch?: (sql: string) => string) {
    const db: TestDb = await createTestDb();
    const dir = await folder(keep, patch);
    cleanup.push(async () => {
      await db.drop();
      await rm(dir, { recursive: true, force: true });
    });
    return { db, dir };
  }
  const n = async (db: TestDb, sql: string) => (await db.client.query<{ n: number }>(sql)).rows[0]?.n;

  it("a re-run after success passes and changes nothing", async () => {
    const { db, dir } = await setup(() => true);
    await applyMigrations(db.client, { dir });
    expect(await n(db, `select count(*)::int as n from english.template_step_sources where template_id in ${B_WEEKS}`)).toBe(31);
    await applyMigrations(db.client, { dir, all: true });
    expect(await n(db, `select count(*)::int as n from english.template_step_sources where template_id in ${B_WEEKS}`)).toBe(31);
    expect(await n(db, "select count(*)::int as n from english.schema_migrations where version = '0012'")).toBe(1);
  });

  it("without 0011 it raises and records no '0012' row", async () => {
    const { db, dir } = await setup((v) => v !== "0011");
    await expect(applyMigrations(db.client, { dir })).rejects.toThrow(/0012 needs 0011/);
    expect(await n(db, "select count(*)::int as n from english.schema_migrations where version = '0012'")).toBe(0);
    expect(await n(db, `select count(*)::int as n from english.template_step_sources where template_id in ${B_WEEKS}`)).toBe(0);
  });

  it("with 0011 but a row that points at no real source it raises (fewer than 31 rows) and records no '0012' row", async () => {
    const real = await readFile(path.join(MIGRATIONS_DIR, "0012_track_b_step_sources.sql"), "utf8");
    const target = "('B-W1-HOMEWORK', 1, 'B-W1-HOMEWORK-S1', 1)";
    expect(real).toContain(target);
    const { db, dir } = await setup(() => true, (sql) => sql.replace(target, "('B-W1-HOMEWORK', 1, 'B-W1-HOMEWORK-S99', 1)"));
    await expect(applyMigrations(db.client, { dir })).rejects.toThrow(/expected 31 step-to-source rows.*found 30/);
    expect(await n(db, "select count(*)::int as n from english.schema_migrations where version = '0012'")).toBe(0);
    expect(await n(db, `select count(*)::int as n from english.template_step_sources where template_id in ${B_WEEKS}`)).toBe(0); // rolled back
  });
});
