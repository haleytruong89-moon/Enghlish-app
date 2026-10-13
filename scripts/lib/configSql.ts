/**
 * Pure SQL generator for the config seed migrations (S1 plan, step 3).
 * content/*.json + content/config.lock.json  →  db/migrations/NNNN_seed_*.sql
 * No timestamps and no randomness: the output is a pure function of the content items assigned to
 * the migration in the lock, so CI can check that each checked-in file equals what the generator produces.
 */
import type { CatalogueItem, PolicyItem, TargetSetItem } from "../../lib/config/versions";

/** The first seed migration (catalogue 0.2.1-draft, AP-0.2-pilot, A-v1, B-v1). */
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

/**
 * Dollar-quote with a tag that cannot collide with the text. The closing `$tag$` is glued to the end
 * of the text, so a text ending in `$j` must also be rejected for tag `j` — hence the `+ "$"`.
 */
export function dollarQuote(s: string): string {
  assertNoNul(s);
  const probe = `${s}$`;
  let tag = "j";
  for (let i = 1; probe.includes(`$${tag}$`); i++) tag = `j${i}`;
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

export type SeedTargetSet = TargetSetItem & { catalogue: string };

export type SeedInput = {
  /** Migration file name, e.g. 0006_seed_config_v0_2_1.sql — the 4-digit prefix is the version it records. */
  file: string;
  catalogues: CatalogueItem[];
  policies: PolicyItem[];
  targetSets: SeedTargetSet[];
  /** Every catalogue (also already-published ones): target sets look up their descriptor version here. */
  allCatalogues: CatalogueItem[];
};

export function buildSeedSql(input: SeedInput): string {
  const { file, catalogues, policies, targetSets, allCatalogues } = input;
  const migrationVersion = /^(\d{4})_/.exec(file)?.[1];
  if (!migrationVersion) throw new Error(`bad migration file name ${file}`);

  const parts: string[] = [];
  const contains = [
    ...catalogues.map((c) => `catalogue ${c.id}`),
    ...policies.map((p) => `policy ${p.id}`),
    ...targetSets.map((t) => `target set ${t.id}`),
  ];
  const hashLines = [...catalogues, ...policies, ...targetSets].map(
    (i) => `-- sha256 ${i.kind === "targetSet" ? "target_set" : i.kind} ${i.id}=${i.hash}`,
  );
  parts.push(`-- ${file}
-- GENERATED FILE — do not edit by hand. Source: content/*.json, locked in content/config.lock.json.
-- Verify: npm run gen:config -- --check (CI fails when this file differs from the generator output
-- or when a version already published here has changed — then create a NEW version instead).
-- Contains: ${contains.join(" · ")}
${hashLines.join("\n")}
-- Idempotent: every insert is skipped when the row exists; catalogue rows are skipped once the version is published.
`);

  for (const p of policies) {
    parts.push(`-- Assessment policy ${p.id} (published immediately)
insert into english.assessment_policies(version, config, source_hash, published_at)
values (${quoteLiteral(p.id)}, ${jsonLiteral(p.data)}, ${quoteLiteral(p.hash)}, now())
on conflict (version) do nothing;
`);
  }

  for (const c of catalogues) parts.push(catalogueBlocks(c));

  // Catalogues are published BEFORE the target sets: a definition may only be published against a published catalogue.
  for (const c of catalogues) {
    parts.push(`-- Publish catalogue ${c.id} (after its inserts, so they never meet the immutability trigger)
update english.catalogue_versions set published_at = now()
where version = ${quoteLiteral(c.id)} and published_at is null;
`);
  }

  for (const t of targetSets) {
    const cat = allCatalogues.find((c) => c.id === t.catalogue);
    if (!cat) throw new Error(`target set ${t.id}: catalogue ${t.catalogue} not found`);
    parts.push(`-- Target set definition ${t.id} (published immediately; a trigger checks that every target exists for the track)
insert into english.target_set_definitions(id, track_id, version, descriptor_version, catalogue_version, target_ids, tracking_only, source_hash, published_at)
select r->>'id', r->>'track', (r->>'version')::int, ${quoteLiteral(cat.data.meta.descriptor_version)}, ${quoteLiteral(cat.id)},
  ${textArray("r->'target_ids'")}, r->'tracking_only', ${quoteLiteral(t.hash)}, now()
from jsonb_array_elements(${jsonLiteral([t.data])}) as r
on conflict (id) do nothing;
`);
  }

  parts.push(`insert into english.schema_migrations(version) values ('${migrationVersion}') on conflict do nothing;\n`);
  return parts.join("\n");
}

function catalogueBlocks(item: CatalogueItem): string {
  const catalogue = item.data;
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
  parts.push(`-- Catalogue version ${cv} (stays unpublished until the publish statement below)
insert into english.catalogue_versions(version, descriptor_version, assessment_policy_version, source_hash, meta)
values (${cvLit}, ${dvLit}, ${quoteLiteral(catalogue.meta.assessment_policy_version)}, ${quoteLiteral(item.hash)}, ${jsonLiteral(catalogue.meta)})
on conflict (version) do nothing;
`);

  parts.push(`-- Dimensions of ${cv}
insert into english.dimensions(id, catalogue_version, dim_group, name_en, name_vi, ai_scorable, cefr_applicable, extension, track_ids, rubric, rubric_vi, raw)
select r->>'id', ${cvLit}, r->>'group', r->>'name_en', r->>'name_vi',
  (r->>'ai_scorable')::boolean, (r->>'cefr_applicable')::boolean, (r->>'extension')::boolean,
  ${textArray("r->'tracks'")}, r->'rubric_0_4', r->'rubric_0_4_vi', r
from jsonb_array_elements(${jsonLiteral(catalogue.dimensions)}) as r
${notPublished}
on conflict (id, catalogue_version) do nothing;
`);

  parts.push(`-- Targets of ${cv}
insert into english.targets(id, descriptor_version, catalogue_version, track_id, dimension_id, title_en, title_vi, target_demand, input_modality, output_modality, success_criteria, opportunity_rule, ai_may_propose, core, status, raw)
select r->>'id', ${dvLit}, ${cvLit}, r->>'track', r->>'dimension_id', r->>'title_en', r->>'title_vi', r->>'target_demand',
  r->>'input_modality', r->>'output_modality', r->'success_criteria', r->>'opportunity_rule',
  (r->>'ai_may_propose')::boolean, (r->>'core')::boolean, r->>'status', r
from jsonb_array_elements(${jsonLiteral(catalogue.targets)}) as r
${notPublished}
on conflict (id, descriptor_version) do nothing;
`);

  parts.push(`-- Aggregate indicators of ${cv} (diagnostic only, never mastery gates)
insert into english.aggregate_indicators(id, catalogue_version, track_id, dimension_id, definition, definition_vi, use, mastery_gate, raw)
select r->>'id', ${cvLit}, r->>'track', r->>'dimension_id', r->>'definition', r->>'definition_vi', r->>'use',
  (r->>'mastery_gate')::boolean, r
from jsonb_array_elements(${jsonLiteral(catalogue.aggregate_indicators)}) as r
${notPublished}
on conflict (id, catalogue_version) do nothing;
`);

  parts.push(`-- Activity templates (ids from the catalogue, tracks from PRD §4; \`schema\` is filled by later slices)
insert into english.activity_templates(id, track_ids, description)
select r->>'id', ${textArray("r->'track_ids'")}, r->>'desc'
from jsonb_array_elements(${jsonLiteral(
    catalogue.meta.activity_types.items.map((a) => ({ id: a.id, desc: a.desc, track_ids: ACTIVITY_TRACKS[a.id] })),
  )}) as r
on conflict (id) do nothing;
`);
  return parts.join("\n");
}
