import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "@/lib/config/content";
import { LOCK_FILE } from "@/lib/config/versions";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";
import { checkConfig, generateNew, type ConfigPaths } from "../../scripts/lib/configLock";

let tmp = "";
let paths: ConfigPaths;

const readJson = (file: string): unknown => JSON.parse(readFileSync(path.join(paths.contentDir, file), "utf8"));
const writeJson = (file: string, v: unknown) =>
  writeFileSync(path.join(paths.contentDir, file), JSON.stringify(v, null, 2) + "\n");
const migrations = () => readdirSync(paths.migrationsDir).filter((f) => f.endsWith(".sql")).sort();

/** target_sets_v2.json with B-v2 = B-v1 minus its last target (just different content, same track). */
function addBV2(): void {
  const v1 = readJson("target_sets_v1.json") as Array<{ id: string; version: number; target_ids: string[] }>;
  const b = structuredClone(v1.find((d) => d.id === "B-v1")!);
  b.id = "B-v2";
  b.version = 2;
  b.target_ids = b.target_ids.slice(0, -1);
  writeJson("target_sets_v2.json", [b]);
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "cfg-lock-"));
  paths = { contentDir: path.join(tmp, "content"), migrationsDir: path.join(tmp, "migrations") };
  cpSync(CONTENT_DIR, paths.contentDir, { recursive: true });
  mkdirSync(paths.migrationsDir);
  cpSync(MIGRATIONS_DIR, paths.migrationsDir, { recursive: true });
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("content/config.lock.json", () => {
  it("locks catalogue, policy and both target sets, all pointing at 0006", () => {
    const lock = JSON.parse(readFileSync(path.join(CONTENT_DIR, LOCK_FILE), "utf8")) as Record<string, Record<string, { sha256: string; migration: string }>>;
    expect(Object.keys(lock.catalogues ?? {})).toEqual(["0.2.1-draft"]);
    expect(Object.keys(lock.policies ?? {})).toEqual(["AP-0.2-pilot"]);
    expect(Object.keys(lock.targetSets ?? {})).toEqual(["A-v1", "B-v1"]);
    for (const e of [...Object.values(lock.catalogues ?? {}), ...Object.values(lock.policies ?? {}), ...Object.values(lock.targetSets ?? {})]) {
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.migration).toBe("0006_seed_config_v0_2_1.sql");
    }
  });

  it("the repository as checked in is consistent", async () => {
    expect((await checkConfig()).problems).toEqual([]);
  });
});

describe("check", () => {
  it("passes on the untouched copy", async () => {
    expect(await checkConfig(paths)).toEqual({ problems: [], unlocked: [] });
  });

  it("fails when a locked target set is changed (English + Vietnamese message)", async () => {
    const v1 = readJson("target_sets_v1.json") as Array<{ id: string; target_ids: string[] }>;
    const b = v1.find((d) => d.id === "B-v1")!;
    b.target_ids = [...b.target_ids].reverse();
    writeJson("target_sets_v1.json", v1);
    const { problems } = await checkConfig(paths);
    const msg = problems.find((p) => p.includes("B-v1"));
    expect(msg).toContain("published version target set B-v1 changed — create a new version instead");
    expect(msg).toContain("hãy tạo phiên bản mới");
    // A-v1 is untouched
    expect(problems.some((p) => p.includes("A-v1"))).toBe(false);
  });

  it("fails when the locked policy or catalogue changes", async () => {
    const policy = readJson("assessment_policy_AP-0.2-pilot.json") as { conflictWindowDays: number };
    policy.conflictWindowDays += 1;
    writeJson("assessment_policy_AP-0.2-pilot.json", policy);
    const { problems } = await checkConfig(paths);
    expect(problems.some((p) => p.includes("policy AP-0.2-pilot changed"))).toBe(true);
  });

  it("still fails when 0006 drifts from the generator output", async () => {
    const file = path.join(paths.migrationsDir, "0006_seed_config_v0_2_1.sql");
    writeFileSync(file, readFileSync(file, "utf8") + "\n-- hand edit\n");
    const { problems } = await checkConfig(paths);
    expect(problems.some((p) => p.includes("0006_seed_config_v0_2_1.sql differs from the generator output"))).toBe(true);
  });

  it("fails when new content has not been put into a migration yet", async () => {
    addBV2();
    const { problems, unlocked } = await checkConfig(paths);
    expect(unlocked).toEqual(["target set B-v2"]);
    expect(problems.some((p) => p.includes("gen:config -- --new"))).toBe(true);
  });
});

describe("--new", () => {
  it("writes the next free migration with ONLY B-v2, locks it, and leaves 0006 untouched", async () => {
    const before0006 = readFileSync(path.join(paths.migrationsDir, "0006_seed_config_v0_2_1.sql"), "utf8");
    addBV2();

    const res = await generateNew(paths);
    expect(res).toEqual({ file: "0007_seed_b_v2.sql", ids: ["B-v2"] });

    const sql = readFileSync(path.join(paths.migrationsDir, "0007_seed_b_v2.sql"), "utf8");
    expect(sql).toContain("Target set definition B-v2");
    expect(sql).not.toContain('"id":"B-v1"');
    expect(sql).not.toContain('"id":"A-v1"');
    expect(sql).not.toContain("insert into english.catalogue_versions");
    expect(sql).not.toContain("insert into english.assessment_policies");
    expect(sql.trim().endsWith("values ('0007') on conflict do nothing;")).toBe(true);
    expect(readFileSync(path.join(paths.migrationsDir, "0006_seed_config_v0_2_1.sql"), "utf8")).toBe(before0006);

    const lock = JSON.parse(readFileSync(path.join(paths.contentDir, LOCK_FILE), "utf8")) as { targetSets: Record<string, { migration: string; catalogue: string }> };
    expect(Object.keys(lock.targetSets)).toEqual(["A-v1", "B-v1", "B-v2"]);
    expect(lock.targetSets["B-v2"]).toMatchObject({ migration: "0007_seed_b_v2.sql", catalogue: "0.2.1-draft" });

    // everything is consistent afterwards, and a second --new has nothing to do
    expect(await checkConfig(paths)).toEqual({ problems: [], unlocked: [] });
    expect(await generateNew(paths)).toBeNull();
    expect(migrations().filter((f) => f.startsWith("0007"))).toEqual(["0007_seed_b_v2.sql"]);
  });

  it("takes the next free number when 0007 is already used, and never touches the existing file", async () => {
    addBV2();
    const taken = path.join(paths.migrationsDir, "0007_seed_other.sql");
    writeFileSync(taken, "-- not mine\n");
    const res = await generateNew(paths);
    expect(res?.file).toBe("0008_seed_b_v2.sql");
    expect(readFileSync(taken, "utf8")).toBe("-- not mine\n");
  });

  it("refuses to overwrite an existing migration file (even if the number were forced)", async () => {
    addBV2();
    const clash = path.join(paths.migrationsDir, "0007_seed_b_v2.sql");
    writeFileSync(clash, "-- not mine\n");
    await expect(generateNew(paths, () => "0007")).rejects.toThrow(/refusing to overwrite/);
    expect(readFileSync(clash, "utf8")).toBe("-- not mine\n");
    // and the lock was not changed
    expect((await checkConfig(paths)).unlocked).toEqual(["target set B-v2"]);
  });

  it("refuses when a locked version changed", async () => {
    addBV2();
    const v1 = readJson("target_sets_v1.json") as Array<{ id: string; target_ids: string[] }>;
    v1[0]!.target_ids = v1[0]!.target_ids.slice(1);
    writeJson("target_sets_v1.json", v1);
    await expect(generateNew(paths)).rejects.toThrow(/published version target set A-v1 changed/);
    expect(migrations()).not.toContain("0007_seed_b_v2.sql");
  });
});
