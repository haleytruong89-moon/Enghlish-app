/**
 * Versioned content items (Node only: scripts and tests).
 *
 * Every published version of the catalogue, the assessment policy and each target-set definition is an
 * "item" with its own sha256. content/config.lock.json records the hash of every item that has already
 * been put into a seed migration, and the migration file it went into. A locked item whose content
 * changed is an error: published versions are immutable, a change needs a NEW version (new id).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  assessmentPolicySchema,
  catalogueSchema,
  targetSetDefinitionSchema,
  type AssessmentPolicy,
  type Catalogue,
  type TargetSetDefinition,
} from "./schemas";
import { CONTENT_DIR, sourceHash } from "./content";

export const LOCK_FILE = "config.lock.json";

export type CatalogueItem = { kind: "catalogue"; id: string; file: string; hash: string; data: Catalogue };
export type PolicyItem = { kind: "policy"; id: string; file: string; hash: string; data: AssessmentPolicy };
export type TargetSetItem = {
  kind: "targetSet";
  id: string;
  file: string;
  hash: string;
  data: TargetSetDefinition;
};
export type ContentItem = CatalogueItem | PolicyItem | TargetSetItem;

export type ContentItems = {
  catalogues: CatalogueItem[];
  policies: PolicyItem[];
  targetSets: TargetSetItem[];
};

export type LockEntry = {
  sha256: string;
  /** File name (in db/migrations) of the seed migration that published this version. */
  migration: string;
  /** Target sets only: the catalogue version the definition was bound to when it was published. */
  catalogue?: string;
};
export type ConfigLock = {
  catalogues: Record<string, LockEntry>;
  policies: Record<string, LockEntry>;
  targetSets: Record<string, LockEntry>;
};

export const emptyLock = (): ConfigLock => ({ catalogues: {}, policies: {}, targetSets: {} });

function readJson(dir: string, file: string): unknown {
  return JSON.parse(readFileSync(path.join(dir, file), "utf8")) as unknown;
}

function files(dir: string, re: RegExp): string[] {
  return readdirSync(dir)
    .filter((f) => re.test(f))
    .sort();
}

/** Reads every versioned content file: catalogue_v*.json, assessment_policy_*.json, target_sets_v*.json. */
export function loadContentItems(dir: string = CONTENT_DIR): ContentItems {
  const catalogues: CatalogueItem[] = files(dir, /^catalogue_v[\w.-]+\.json$/).map((file) => {
    const raw = readJson(dir, file);
    const data = catalogueSchema.parse(raw);
    return { kind: "catalogue", id: data.meta.version, file, hash: sourceHash(raw), data };
  });

  const policies: PolicyItem[] = files(dir, /^assessment_policy_.+\.json$/).map((file) => {
    const raw = readJson(dir, file);
    const data = assessmentPolicySchema.parse(raw);
    const id = /^assessment_policy_(.+)\.json$/.exec(file)?.[1] ?? file;
    return { kind: "policy", id, file, hash: sourceHash(raw), data };
  });

  const targetSets: TargetSetItem[] = [];
  for (const file of files(dir, /^target_sets_v[\w.-]+\.json$/)) {
    const raw = readJson(dir, file);
    if (!Array.isArray(raw)) throw new Error(`${file}: expected a JSON array of target set definitions`);
    for (const rawDef of raw as unknown[]) {
      const data = targetSetDefinitionSchema.parse(rawDef);
      targetSets.push({ kind: "targetSet", id: data.id, file, hash: sourceHash(rawDef), data });
    }
  }

  const seen = new Set<string>();
  for (const item of [...catalogues, ...policies, ...targetSets]) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) throw new Error(`duplicate ${item.kind} id ${item.id} in content/`);
    seen.add(key);
  }
  for (const c of catalogues) {
    if (!policies.some((p) => p.id === c.data.meta.assessment_policy_version)) {
      throw new Error(`catalogue ${c.id} needs policy ${c.data.meta.assessment_policy_version}, but no such policy file exists`);
    }
  }
  return { catalogues, policies, targetSets };
}

export function readLock(dir: string = CONTENT_DIR): ConfigLock {
  let raw: unknown;
  try {
    raw = readJson(dir, LOCK_FILE);
  } catch {
    return emptyLock();
  }
  const o = raw as Partial<ConfigLock>;
  return { catalogues: o.catalogues ?? {}, policies: o.policies ?? {}, targetSets: o.targetSets ?? {} };
}

/** Stable text form of the lock (sorted keys, 2-space indent, trailing newline). */
export function serializeLock(lock: ConfigLock): string {
  const sort = (r: Record<string, LockEntry>) =>
    Object.fromEntries(Object.keys(r).sort().map((k) => [k, r[k]]));
  return (
    JSON.stringify(
      { catalogues: sort(lock.catalogues), policies: sort(lock.policies), targetSets: sort(lock.targetSets) },
      null,
      2,
    ) + "\n"
  );
}
