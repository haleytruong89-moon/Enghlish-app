/**
 * Pure SQL generator for the config seed migrations (S1 plan, step 3).
 * content/*.json + content/config.lock.json  →  db/migrations/NNNN_seed_*.sql
 * No timestamps and no randomness: the output is a pure function of the content items assigned to
 * the migration in the lock, so CI can check that each checked-in file equals what the generator produces.
 */
import { createHash } from "node:crypto";
import { toKeyRows, toSafeSteps, toSources, validateInquiryTemplate } from "../../lib/config/inquiries";
import type { CatalogueItem, InquiryTemplateItem, PointPolicyItem, PolicyItem, TargetSetItem } from "../../lib/config/versions";

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
  /** Published inquiry templates (sources, answer keys and tutor notes go with them). */
  inquiryTemplates?: InquiryTemplateItem[];
  /** Knowledge-point level policies (W3): rows of english.point_policies. */
  pointPolicies?: PointPolicyItem[];
  /** Every catalogue (also already-published ones): target sets look up their descriptor version here. */
  allCatalogues: CatalogueItem[];
};

export function buildSeedSql(input: SeedInput): string {
  const { file, catalogues, policies, targetSets, allCatalogues } = input;
  const inquiryTemplates = input.inquiryTemplates ?? [];
  const pointPolicies = input.pointPolicies ?? [];
  const migrationVersion = /^(\d{4})_/.exec(file)?.[1];
  if (!migrationVersion) throw new Error(`bad migration file name ${file}`);

  const parts: string[] = [];
  const contains = [
    ...catalogues.map((c) => `catalogue ${c.id}`),
    ...policies.map((p) => `policy ${p.id}`),
    ...targetSets.map((t) => `target set ${t.id}`),
    ...inquiryTemplates.map((t) => `inquiry template ${t.id}`),
    ...pointPolicies.map((p) => `point policy ${p.id}`),
  ];
  const hashLines = [...catalogues, ...policies, ...targetSets, ...inquiryTemplates, ...pointPolicies].map(
    (i) => `-- sha256 ${KIND_IN_HEADER[i.kind]} ${i.id}=${i.hash}`,
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

  for (const p of pointPolicies) {
    parts.push(`-- Knowledge-point level policy ${p.id} (published immediately; needs 0027)
insert into english.point_policies(version, config, source_hash, published_at)
values (${quoteLiteral(p.id)}, ${jsonLiteral(p.data.config)}, ${quoteLiteral(p.hash)}, now())
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

  for (const t of inquiryTemplates) parts.push(inquiryTemplateBlocks(t, allCatalogues));

  parts.push(`insert into english.schema_migrations(version) values ('${migrationVersion}') on conflict do nothing;\n`);
  return parts.join("\n");
}

const KIND_IN_HEADER = {
  catalogue: "catalogue",
  policy: "policy",
  targetSet: "target_set",
  inquiryTemplate: "inquiry_template",
  pointPolicy: "point_policy",
} as const;

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * One inquiry template: sources → transcripts → (publish sources) → template as draft → answer keys →
 * publish template. Children go in BEFORE the parent is published (published parents refuse new children),
 * and every child insert is skipped when its parent is already published, so a re-run changes nothing.
 * A template that breaks a catalogue rule is a generator error — it never reaches a migration.
 */
function inquiryTemplateBlocks(item: InquiryTemplateItem, allCatalogues: CatalogueItem[]): string {
  const t = item.data;
  const cat = allCatalogues.find((c) => c.id === t.catalogue_version);
  if (!cat) throw new Error(`inquiry template ${item.id}: catalogue ${t.catalogue_version} not found`);
  const violations = validateInquiryTemplate(t, cat.data);
  if (violations.length) {
    throw new Error(
      `inquiry template ${item.id} breaks catalogue rules and cannot be seeded (keep it status "draft" until the parent decides):\n` +
        violations.map((v) => `  - ${v.message}`).join("\n"),
    );
  }

  const { refs, rows } = toSources(t);
  const sourceRecords = rows.map((r) => ({
    id: r.id,
    version: r.version,
    title: r.title,
    url: r.url,
    author: r.author,
    rights_note: r.rights_note,
    modality: r.modality,
    body: r.body,
    source_hash: sha256(r),
  }));
  const transcriptRecords = rows.filter((r) => r.transcript !== null).map((r) => ({ id: r.id, version: r.version, transcript: r.transcript }));
  const keyRecords = toKeyRows(t);
  const templateRecord = {
    id: t.id,
    version: t.version,
    track_id: t.track,
    title_vi: t.title_vi,
    big_question_en: t.big_question_en,
    big_question_vi: t.big_question_vi,
    week: t.week,
    date_from: t.dates.from,
    date_to: t.dates.to,
    domain_bucket: t.domain_bucket,
    target_ids: t.target_ids,
    steps: toSafeSteps(t),
    sources: refs,
  };

  const idLit = quoteLiteral(t.id);
  const verLit = String(t.version);
  const templateNotPublished = `not exists (
    select 1 from english.inquiry_templates it
    where it.id = ${idLit} and it.version = ${verLit} and it.published_at is not null)`;
  const sourceIds = rows.map((r) => quoteLiteral(r.id)).join(", ");

  const parts: string[] = [];
  parts.push(`-- Inquiry template ${t.id} v${t.version} (published after its sources and answer keys are in)`);
  if (rows.length) {
    parts.push(`insert into english.sources(id, version, title, url, author, rights_note, modality, body, source_hash)
select r->>'id', (r->>'version')::int, r->>'title', r->>'url', r->>'author', r->>'rights_note', r->>'modality', r->>'body', r->>'source_hash'
from jsonb_array_elements(${jsonLiteral(sourceRecords)}) as r
where ${templateNotPublished}
on conflict (id, version) do nothing;
`);
  }
  if (transcriptRecords.length) {
    parts.push(`insert into english.source_transcripts(source_id, source_version, transcript)
select r->>'id', (r->>'version')::int, r->>'transcript'
from jsonb_array_elements(${jsonLiteral(transcriptRecords)}) as r
where ${templateNotPublished}
on conflict (source_id, source_version) do nothing;
`);
  }
  if (rows.length) {
    parts.push(`update english.sources set published_at = now()
where version = ${verLit} and id in (${sourceIds}) and published_at is null;
`);
  }
  parts.push(`insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket, target_ids, steps, sources, catalogue_version, status, source_hash)
select r->>'id', (r->>'version')::int, r->>'track_id', r->>'title_vi', r->>'big_question_en', r->>'big_question_vi', (r->>'week')::int,
  (r->>'date_from')::date, (r->>'date_to')::date, r->>'domain_bucket',
  ${textArray("r->'target_ids'")}, r->'steps', r->'sources', ${quoteLiteral(t.catalogue_version)}, 'draft', ${quoteLiteral(item.hash)}
from jsonb_array_elements(${jsonLiteral([templateRecord])}) as r
on conflict (id, version) do nothing;
`);
  parts.push(`insert into english.template_item_keys(template_id, template_version, item_id, step_no, kind, answer, explanation_vi)
select ${idLit}, ${verLit}, r->>'item_id', (r->>'step_no')::int, r->>'kind', r->>'answer', r->>'explanation_vi'
from jsonb_array_elements(${jsonLiteral(keyRecords)}) as r
where ${templateNotPublished}
on conflict (template_id, template_version, item_id) do nothing;
`);
  parts.push(`update english.inquiry_templates set status = 'published', published_at = now()
where id = ${idLit} and version = ${verLit} and published_at is null;
`);
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
