/**
 * Version lock for the config seed migrations (S1 review fix).
 *
 * content/config.lock.json lists every published version (catalogue, policy, target-set definition) with
 * its sha256 and the seed migration that carries it. Rules:
 *  - a locked version whose content changed            → error ("create a new version instead")
 *  - a seed migration differing from what the lock says → error (drift)
 *  - content that is not locked yet                     → error until `--new` puts it in the NEXT migration
 *  - `--new` never overwrites a file and never touches an existing migration.
 */
import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONTENT_DIR } from "../../lib/config/content";
import {
  LOCK_FILE,
  loadContentItems,
  readLock,
  serializeLock,
  type ConfigLock,
  type ContentItems,
  type LockEntry,
} from "../../lib/config/versions";
import { MIGRATIONS_DIR } from "./migrate";
import { buildSeedSql, type SeedInput, type SeedTargetSet } from "./configSql";

export type ConfigPaths = { contentDir: string; migrationsDir: string };
export const defaultPaths = (): ConfigPaths => ({ contentDir: CONTENT_DIR, migrationsDir: MIGRATIONS_DIR });

type Kind = "catalogue" | "policy" | "targetSet";
const KIND_LABEL: Record<Kind, string> = { catalogue: "catalogue", policy: "policy", targetSet: "target set" };
const LOCK_KEY = { catalogue: "catalogues", policy: "policies", targetSet: "targetSets" } as const;

export const changedMessage = (kind: Kind, id: string) =>
  `published version ${KIND_LABEL[kind]} ${id} changed — create a new version instead ` +
  `(Phiên bản đã công bố ${KIND_LABEL[kind]} ${id} bị đổi nội dung — hãy tạo phiên bản mới, đừng sửa bản cũ).`;

/** Newest catalogue (by file name) = the one a NEW target set is bound to. */
function newestCatalogueId(items: ContentItems): string {
  const last = items.catalogues[items.catalogues.length - 1];
  if (!last) throw new Error("no catalogue file in content/");
  return last.id;
}

/** The items the lock assigns to one migration file → generator input. */
function seedInputFor(file: string, items: ContentItems, lock: ConfigLock): SeedInput {
  const inFile = (e: LockEntry | undefined) => e?.migration === file;
  return {
    file,
    allCatalogues: items.catalogues,
    catalogues: items.catalogues.filter((c) => inFile(lock.catalogues[c.id])),
    policies: items.policies.filter((p) => inFile(lock.policies[p.id])),
    targetSets: items.targetSets
      .filter((t) => inFile(lock.targetSets[t.id]))
      .map((t): SeedTargetSet => ({ ...t, catalogue: lock.targetSets[t.id]?.catalogue ?? newestCatalogueId(items) })),
  };
}

export type CheckResult = { problems: string[]; unlocked: string[] };

export async function checkConfig(paths: ConfigPaths = defaultPaths()): Promise<CheckResult> {
  const items = loadContentItems(paths.contentDir);
  const lock = readLock(paths.contentDir);
  const problems: string[] = [];
  const unlocked: string[] = [];

  const all = [...items.catalogues, ...items.policies, ...items.targetSets];
  for (const kind of ["catalogue", "policy", "targetSet"] as const) {
    const locked = lock[LOCK_KEY[kind]];
    const present = new Set(all.filter((i) => i.kind === kind).map((i) => i.id));
    for (const id of Object.keys(locked)) {
      if (!present.has(id)) {
        problems.push(
          `published version ${KIND_LABEL[kind]} ${id} is in ${LOCK_FILE} but its content file is gone — never delete a published version ` +
            `(Phiên bản đã công bố ${id} mất file nội dung — không được xóa).`,
        );
      }
    }
  }
  for (const item of all) {
    const entry = lock[LOCK_KEY[item.kind]][item.id];
    if (!entry) unlocked.push(`${KIND_LABEL[item.kind]} ${item.id}`);
    else if (entry.sha256 !== item.hash) problems.push(changedMessage(item.kind, item.id));
  }
  if (unlocked.length) {
    problems.push(
      `new content is not in any seed migration yet: ${unlocked.join(", ")} — run \`npm run gen:config -- --new\` ` +
        `(Nội dung mới chưa có migration — chạy \`npm run gen:config -- --new\`).`,
    );
  }

  // Each locked migration must equal what the generator builds from the items the lock assigns to it.
  // Skipped for a migration with a changed item: that error is already reported and the diff would only add noise.
  const hasChanged = all.some((i) => {
    const entry = lock[LOCK_KEY[i.kind]][i.id];
    return entry !== undefined && entry.sha256 !== i.hash;
  });
  const files = new Set(
    [...Object.values(lock.catalogues), ...Object.values(lock.policies), ...Object.values(lock.targetSets)].map((e) => e.migration),
  );
  for (const file of [...files].sort()) {
    let onDisk: string;
    try {
      onDisk = await readFile(path.join(paths.migrationsDir, file), "utf8");
    } catch {
      problems.push(`seed migration ${file} is listed in ${LOCK_FILE} but missing (Thiếu file migration ${file}).`);
      continue;
    }
    if (hasChanged) continue;
    if (onDisk !== buildSeedSql(seedInputFor(file, items, lock))) {
      problems.push(
        `${file} differs from the generator output for its locked versions — do not edit a seed migration by hand ` +
          `(${file} khác với bản sinh ra từ phiên bản đã khóa — không sửa tay migration).`,
      );
    }
  }
  return { problems, unlocked };
}

const SEED_FILE_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;

function nextMigrationNumber(dir: string): string {
  const nums = readdirSync(dir)
    .map((f) => SEED_FILE_RE.exec(f)?.[1])
    .filter((n): n is string => !!n)
    .map(Number);
  return String(Math.max(0, ...nums) + 1).padStart(4, "0");
}

const slugOf = (ids: string[]) =>
  ids
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/, "") || "config";

export type NewResult = { file: string; ids: string[] } | null;

/**
 * Writes the NEXT free migration number with only the unlocked versions, then adds them to the lock.
 * Refuses when a locked version changed. Never overwrites a file (flag "wx").
 */
export async function generateNew(
  paths: ConfigPaths = defaultPaths(),
  /** Test hook: force the migration number (to prove the no-overwrite guard). */
  pickNumber: (dir: string) => string = nextMigrationNumber,
): Promise<NewResult> {
  const items = loadContentItems(paths.contentDir);
  const lock = readLock(paths.contentDir);

  const changed: string[] = [];
  for (const item of [...items.catalogues, ...items.policies, ...items.targetSets]) {
    const entry = lock[LOCK_KEY[item.kind]][item.id];
    if (entry && entry.sha256 !== item.hash) changed.push(changedMessage(item.kind, item.id));
  }
  if (changed.length) throw new Error(changed.join("\n"));

  const newCatalogues = items.catalogues.filter((c) => !lock.catalogues[c.id]);
  const newPolicies = items.policies.filter((p) => !lock.policies[p.id]);
  const newSets = items.targetSets.filter((t) => !lock.targetSets[t.id]);
  if (!newCatalogues.length && !newPolicies.length && !newSets.length) return null;

  const bound = newestCatalogueId(items);
  const ids = [...newCatalogues, ...newPolicies, ...newSets].map((i) => i.id);
  const file = `${pickNumber(paths.migrationsDir)}_seed_${slugOf(ids)}.sql`;
  const target = path.join(paths.migrationsDir, file);
  if (existsSync(target)) throw new Error(`${file} already exists — refusing to overwrite a migration`);

  const sql = buildSeedSql({
    file,
    allCatalogues: items.catalogues,
    catalogues: newCatalogues,
    policies: newPolicies,
    targetSets: newSets.map((t) => ({ ...t, catalogue: bound })),
  });

  await writeFile(target, sql, { encoding: "utf8", flag: "wx" });

  for (const c of newCatalogues) lock.catalogues[c.id] = { sha256: c.hash, migration: file };
  for (const p of newPolicies) lock.policies[p.id] = { sha256: p.hash, migration: file };
  for (const t of newSets) lock.targetSets[t.id] = { sha256: t.hash, migration: file, catalogue: bound };
  await writeFile(path.join(paths.contentDir, LOCK_FILE), serializeLock(lock), "utf8");
  return { file, ids };
}
