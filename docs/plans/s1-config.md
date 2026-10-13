# S1 — Config (tracks, catalogue, rubric, target sets, assessment policy)

Owner: builder (Sonnet). Plan: Opus, 13/10/2026. Review: reviewer (Opus) before PR.
Refs: PRD_FAMILY_EDITION §3.1/§3.2/§4, FR-03 · DESIGN §4, §7, §8 · CATALOGUE.md · content/catalogue_v0.2.json (0.2.1-draft).

## Goal
All configuration the later slices read is in the DB, versioned, **immutable once published**,
readable (published rows only) by every family member, writable by nobody except migrations /
service-role functions. Both tracks active (PRD v1.1).

## Decisions taken in this plan (Opus)
1. **Seed via generated SQL migration, not a runtime script.** The parent applies SQL files in the
   SQL Editor; a generator turns JSON into `db/migrations/0006_seed_config_v0_2_1.sql`.
   CI checks the checked-in file equals the generator output (no drift).
2. **Target sets = definitions + per-learner assignment.** DESIGN §4 has `target_sets(learner_id…)`;
   learners do not exist at seed time, so split into `target_set_definitions` (A-v1, B-v1, published,
   immutable) and `target_sets` (learner_id → definition, effective_from, assigned_by). A new version
   (e.g. B-v2 after Nguyên's baseline, O-F7) = new definition row + new assignment; old rows stay.
3. `learners.track_id` keeps its check and gains an FK to `english.tracks` (expand only).
4. Aggregate indicators are stored (`aggregate_indicators`) but flagged `mastery_gate=false`; they
   never enter a target-set denominator.
5. `legacy_map` is NOT seeded (doc-only).

## Steps (commit after each; `npm run typecheck && npm run lint && npm test` green each time)

### Step 1 — Content files + zod schemas (`lib/config/`)
- `content/assessment_policy_AP-0.2-pilot.json` — exactly the JSON block in DESIGN §8.
- `content/target_sets_v1.json` — `[{id:"A-v1", track:"A", version:1, target_ids:[12 from PRD §3.1]},
  {id:"B-v1", track:"B", version:1, target_ids:[12 from PRD §3.2]}]` plus `tracking_only` lists
  (A: dimensions A1/A3/A5 view; B: AGG-B-EXAM-MOCK, AGG-B-L1-ERRORS) that are **not** in the denominator.
- `lib/config/schemas.ts`: zod for catalogue (meta, dimensions, targets, aggregate_indicators),
  policy, target sets. Export TS types (`AssessmentPolicy`, `Target`, `Dimension`, `TargetKey`).
- `lib/config/targetKey.ts`: build TargetKey per catalogue `meta.target_key` (output modality
  "any" → key per actual modality). Pure function.
- Unit tests: catalogue parses; 18 dimensions, 37 A + 33 B targets, 21 aggregates; every target-set
  id exists, belongs to the set's track, 12 each, no duplicates, no aggregate inside target_ids;
  X1/X2 have `ai_scorable=false`; thinking targets (T*) never carry a CEFR label in target_demand;
  policy parses and `transferable.delayedMinDaysFromLastExposure === 14`.

### Step 2 — Schema migration `db/migrations/0005_config.sql`
Tables (all in `english`, idempotent `create table if not exists`):
`tracks`, `catalogue_versions`, `dimensions` (PK id+catalogue_version), `targets`
(PK id+descriptor_version, FK dimension), `aggregate_indicators`, `assessment_policies`
(PK version), `activity_templates` (8 ids from catalogue meta.activity_types, `track_ids text[]`,
`schema jsonb default '{}'`), `target_set_definitions`, `target_sets`.
Columns per DESIGN §4; keep full JSON of each catalogue row in `raw jsonb` too.
- `published_at timestamptz` / `status` on versioned rows. Trigger
  `english.eng_forbid_published_change()` → UPDATE/DELETE of a published row raises
  (catalogue_versions, dimensions/targets of a published catalogue version, assessment_policies,
  target_set_definitions). TRUNCATE blocked by statement trigger.
- `target_sets`: append-only (attach `english.eng_forbid_mutation('learner_id')` per 0004 header;
  add it to `english.eng_purge_learner`). Current set = latest `effective_from <= now()`.
- FK `learners.track_id → tracks(id)` added `not valid` then `validate` (after tracks seeded — so
  put the FK in 0006 after the inserts, or insert tracks in 0005; choose tracks insert in 0005).
- RLS on every new table. SELECT for `authenticated` when published AND `english.eng_current_member_id()
  is not null`; `target_sets` SELECT via `english.eng_can_read_learner(learner_id)`. No INSERT/UPDATE/DELETE
  policies for authenticated/anon. Grants per table (never `on all tables`).
- `english.eng_assign_target_set(p_learner uuid, p_set text)` security definer, `search_path=''`,
  checks set.track = learner.track, inserts row + audit_log receipt; `revoke execute` from
  public/anon/authenticated (service role / SQL editor only).
- Ends with `insert into english.schema_migrations(version) values ('0005') on conflict do nothing;`

### Step 3 — Generator + seed migration
- `scripts/gen-config-sql.ts` → writes `db/migrations/0006_seed_config_v0_2_1.sql` from the 3 JSON
  files: catalogue_versions (with sha256 of the JSON as source_hash), dimensions, targets,
  aggregates, policy, activity_templates, target_set_definitions; all `on conflict do nothing`; sets
  `published_at = now()` in the same statement (insert-then-publish order must not trip the trigger).
  Dollar-quote JSON safely (no string concatenation of untrusted text without escaping — use
  `quote_literal`-equivalent escaping in TS and a test with a `'` and `$$` in content).
- `npm run gen:config` and `npm run gen:config -- --check` (exit 1 on drift). Add `--check` to CI
  `check` job.
- `scripts/seed-dev.ts`: after creating test learners, call `english.eng_assign_target_set` (A-v1 for
  An (thử), B-v1 for Nguyên (thử)); still idempotent on second run.

### Step 4 — DB tests (`tests/db/config.test.ts`)
- 0001–0006 apply on the stub; second apply is a no-op.
- Counts match JSON; every target_set_definition target exists in `targets`.
- UPDATE/DELETE/TRUNCATE on published target / policy / definition → rejected (even as owner).
- RLS: student reads published config + **own** target_sets only; tutor of An cannot read Nguyên's
  target_sets and vice versa; anon reads nothing; authenticated cannot insert into any config table.
- `eng_assign_target_set`: wrong track → error; not executable by authenticated; writes audit row.
- Purge removes the learner's target_sets rows.
- `learners.track_id` FK rejects 'C'.

### Step 5 — Minimal read-only UI
- Parent and tutor home: under each learner, a link "Kỹ năng đang theo dõi" → page
  `/learners/[id]/targets` listing the current set: `title_vi`, dimension `name_vi`, and the level
  label "Chưa đủ bài để đánh giá" (no states exist yet). Tracking-only items in a separate muted
  section "Theo dõi thêm (không tính vào đánh giá)".
- Access via `requireAccess` (404 outside scope — add a unit test like the existing learners route).
- Students do **not** get this page in S1.
- All strings in `lib/copy/vi.ts` following docs/UX_COPY_GUIDE.md (no codes like A-L3-CAUSE-S shown
  to anyone except in a small muted "mã" line for tutor/parent).

### Step 6 — Docs
- `docs/PROGRESS.md`: S1 section — done items, **SQL for the parent: 0005, 0006 in order**, how to
  assign sets to real learners later (one SQL line), G1-relevant notes.
- `docs/CATALOGUE.md` unchanged. Update CLAUDE.md "Current status".

## Out of scope (do not build)
inquiry_templates, sources (S2) · any engine/state computation (S7) · editing config from the UI ·
student-facing config UI.

## Stop and ask (do not decide)
Anything that changes the policy numbers, the target lists, who may read scores, or touches `public`.
