/**
 * Pure SQL generator for the config seed migration (S1 plan, step 3).
 * content/*.json  →  db/migrations/0006_seed_config_v0_2_1.sql
 * No timestamps and no randomness: the output is a pure function of the content files,
 * so CI can check that the checked-in file equals what the generator produces.
 */
import type { ConfigBundle } from "../../lib/config/content";

export const SEED_MIGRATION_VERSION = "0006";
export const SEED_MIGRATION_FILE = "0006_seed_config_v0_2_1.sql";

/**
 * Which tracks use each activity type — PRD_FAMILY_EDITION §4 table (the catalogue only lists the ids).
 * ACT-CANVAS-ADV is Track B (its full version is paused until summer 2027, PRD §2.1).
 */
export const ACTIVITY_TRACKS: Record<string, readonly string[]> = {
  "ACT-SOURCE-QA": ["A", "B"],
  "ACT-CANVAS-BASIC": ["A"],
  "ACT-CANVAS-ADV": ["B"],
  "ACT-SPEAK-MONO": ["A", "B"],
  "ACT-SPEAK-LIVE": ["A", "B"],
  "ACT-WRITE": ["A", "B"],
  "ACT-REVISE": ["A", "B"],
  "ACT-SELF-REVIEW": ["A", "B"],
};

function assertNoNul(s: string): void {
  if (s.includes("\u0000")) throw new Error("NUL characters cannot be stored in Postgres text");
}

/** Plain SQL string literal. Backslashes switch to E'' form so the result never depends on server settings. */
export function quoteLiteral(s: string): string {
  assertNoNul(s);
  const escaped = s.replace(/'/g, "''");
  if (s.includes("\\")) return `E'${escaped.replace(/\\/g, "\\\\")}'`;
  return `'${escaped}'`;
}

/** Dollar-quote with a tag that does not occur in the text. */
export function dollarQuote(s: string): string {
  assertNoNul(s);
  let tag = "j";
  for (let i = 1; s.includes(`$${tag}$`); i++) tag = `j${i}`;
  return `$${tag}$${s}$${tag}$`;
}

/** jsonb literal for any JSON value. */
export function jsonLiteral(value: unknown): string {
  const json = JSON.stringify(value);
  // JSON escapes NUL as the six characters \u0000, which jsonb rejects.
  if (json.includes("\\u0000")) throw new Error("NUL characters cannot be stored in Postgres jsonb");
  return `${dollarQuote(json)}::jsonb`;
}

const textArray = (path: string) =>
  `array(select e from jsonb_array_elements_text(${path}) with ordinality as t(e, n) order by n)`;

export function buildConfigSql(cfg: ConfigBundle): string {
  const { catalogue, policy, targetSets, hashes } = cfg;
  const cv = catalogue.meta.version;
  const dv = catalogue.meta.descriptor_version;
  const cvLit = quoteLiteral(cv);
  const dvLit = quoteLiteral(dv);

  const activityIds = catalogue.meta.activity_types.items.map((a) => a.id);
  const unknown = Object.keys(ACTIVITY_TRACKS).filter((id) => !activityIds.includes(id));
  const missing = activityIds.filter((id) => !(id in ACTIVITY_TRACKS));
  if (unknown.length || missing.length) {
    throw new Error(
      `ACTIVITY_TRACKS does not match catalogue activity types (unknown: ${unknown.join(",")}; missing: ${missing.join(",")})`,
    );
  }

  const notPublished = `where not exists (
    select 1 from english.catalogue_versions cv
    where cv.version = ${cvLit} and cv.published_at is not null)`;

  const parts: string[] = [];
  parts.push(`-- ${SEED_MIGRATION_FILE}
-- GENERATED FILE — do not edit by hand. Source: content/*.json. Regenerate: npm run gen:config
-- (CI runs \`npm run gen:config -- --check\` and fails when this file differs from the generator output.)
-- Catalogue ${cv} · policy ${policy.version} · target sets ${targetSets.map((s) => s.id).join(", ")}
-- sha256 catalogue=${hashes.catalogue}
-- sha256 policy=${hashes.policy}
-- sha256 target_sets=${hashes.targetSets}
-- Idempotent: the catalogue block is skipped once ${cv} is published (published rows are immutable).
`);

  parts.push(`-- 1. Assessment policy (published immediately)
insert into english.assessment_policies(version, config, source_hash, published_at)
values (${quoteLiteral(policy.version)}, ${jsonLiteral(policy.config)}, ${quoteLiteral(hashes.policy)}, now())
on conflict (version) do nothing;
`);

  parts.push(`-- 2. Catalogue version (stays unpublished until the last statement of the catalogue block)
insert into english.catalogue_versions(version, descriptor_version, assessment_policy_version, source_hash, meta)
values (${cvLit}, ${dvLit}, ${quoteLiteral(catalogue.meta.assessment_policy_version)}, ${quoteLiteral(hashes.catalogue)}, ${jsonLiteral(catalogue.meta)})
on conflict (version) do nothing;
`);

  parts.push(`-- 3. Dimensions
insert into english.dimensions(id, catalogue_version, dim_group, name_en, name_vi, ai_scorable, cefr_applicable, extension, track_ids, rubric, rubric_vi, raw)
select r->>'id', ${cvLit}, r->>'group', r->>'name_en', r->>'name_vi',
  (r->>'ai_scorable')::boolean, (r->>'cefr_applicable')::boolean, (r->>'extension')::boolean,
  ${textArray("r->'tracks'")}, r->'rubric_0_4', r->'rubric_0_4_vi', r
from jsonb_array_elements(${jsonLiteral(catalogue.dimensions)}) as r
${notPublished}
on conflict (id, catalogue_version) do nothing;
`);

  parts.push(`-- 4. Targets
insert into english.targets(id, descriptor_version, catalogue_version, track_id, dimension_id, title_en, title_vi, target_demand, input_modality, output_modality, success_criteria, opportunity_rule, ai_may_propose, core, status, raw)
select r->>'id', ${dvLit}, ${cvLit}, r->>'track', r->>'dimension_id', r->>'title_en', r->>'title_vi', r->>'target_demand',
  r->>'input_modality', r->>'output_modality', r->'success_criteria', r->>'opportunity_rule',
  (r->>'ai_may_propose')::boolean, (r->>'core')::boolean, r->>'status', r
from jsonb_array_elements(${jsonLiteral(catalogue.targets)}) as r
${notPublished}
on conflict (id, descriptor_version) do nothing;
`);

  parts.push(`-- 5. Aggregate indicators (diagnostic only, never mastery gates)
insert into english.aggregate_indicators(id, catalogue_version, track_id, dimension_id, definition, definition_vi, use, mastery_gate, raw)
select r->>'id', ${cvLit}, r->>'track', r->>'dimension_id', r->>'definition', r->>'definition_vi', r->>'use',
  (r->>'mastery_gate')::boolean, r
from jsonb_array_elements(${jsonLiteral(catalogue.aggregate_indicators)}) as r
${notPublished}
on conflict (id, catalogue_version) do nothing;
`);

  parts.push(`-- 6. Activity templates (ids from the catalogue, tracks from PRD §4; \`schema\` is filled by later slices)
insert into english.activity_templates(id, track_ids, description)
select r->>'id', ${textArray("r->'track_ids'")}, r->>'desc'
from jsonb_array_elements(${jsonLiteral(
    catalogue.meta.activity_types.items.map((a) => ({ id: a.id, desc: a.desc, track_ids: ACTIVITY_TRACKS[a.id] })),
  )}) as r
on conflict (id) do nothing;
`);

  parts.push(`-- 7. Target set definitions (published immediately; a trigger checks that every target exists for the track)
insert into english.target_set_definitions(id, track_id, version, descriptor_version, catalogue_version, target_ids, tracking_only, source_hash, published_at)
select r->>'id', r->>'track', (r->>'version')::int, ${dvLit}, ${cvLit},
  ${textArray("r->'target_ids'")}, r->'tracking_only', ${quoteLiteral(hashes.targetSets)}, now()
from jsonb_array_elements(${jsonLiteral(targetSets)}) as r
on conflict (id) do nothing;
`);

  parts.push(`-- 8. Publish the catalogue version (last, so the inserts above never meet the immutability trigger)
update english.catalogue_versions set published_at = now()
where version = ${cvLit} and published_at is null;
`);

  parts.push(`insert into english.schema_migrations(version) values ('${SEED_MIGRATION_VERSION}') on conflict do nothing;\n`);
  return parts.join("\n");
}
