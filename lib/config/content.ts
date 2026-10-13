/**
 * Loads and validates the versioned config files in /content (Node only: scripts and tests).
 * The same parsed data feeds the SQL generator (scripts/gen-config-sql.ts), so the seed
 * migration can never drift from the files without CI noticing.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessmentPolicySchema,
  catalogueSchema,
  targetSetsFileSchema,
  type AssessmentPolicy,
  type Catalogue,
  type TargetSetDefinition,
} from "./schemas";

export const CONTENT_DIR = fileURLToPath(new URL("../../content", import.meta.url));

export const CATALOGUE_FILE = "catalogue_v0.2.json";
export const POLICY_FILE = "assessment_policy_AP-0.2-pilot.json";
export const TARGET_SETS_FILE = "target_sets_v1.json";

function readJson(file: string, dir: string): unknown {
  return JSON.parse(readFileSync(path.join(dir, file), "utf8")) as unknown;
}

/** sha256 of the canonical (re-serialised) JSON — immune to line endings and formatting. */
export function sourceHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export type ConfigBundle = {
  catalogue: Catalogue;
  policy: { version: string; config: AssessmentPolicy };
  targetSets: TargetSetDefinition[];
  hashes: { catalogue: string; policy: string; targetSets: string };
};

export function loadConfig(dir: string = CONTENT_DIR): ConfigBundle {
  const rawCatalogue = readJson(CATALOGUE_FILE, dir);
  const rawPolicy = readJson(POLICY_FILE, dir);
  const rawSets = readJson(TARGET_SETS_FILE, dir);

  const catalogue = catalogueSchema.parse(rawCatalogue);
  const config = assessmentPolicySchema.parse(rawPolicy);
  const targetSets = targetSetsFileSchema.parse(rawSets);

  const version = /^assessment_policy_(.+)\.json$/.exec(POLICY_FILE)?.[1];
  if (!version) throw new Error("cannot derive policy version from file name");
  if (version !== catalogue.meta.assessment_policy_version) {
    throw new Error(
      `policy file ${POLICY_FILE} does not match catalogue assessment_policy_version ${catalogue.meta.assessment_policy_version}`,
    );
  }

  return {
    catalogue,
    policy: { version, config },
    targetSets,
    hashes: {
      // Hash the parsed-from-file JSON, not the zod output (zod may reorder/strip).
      catalogue: sourceHash(rawCatalogue),
      policy: sourceHash(rawPolicy),
      targetSets: sourceHash(rawSets),
    },
  };
}
