# S2 — Inquiry templates, sources, assignment with snapshot

Owner: builder (Sonnet). Plan: Opus, 14/10/2026. Review: Opus before PR.
Refs: PRD_FAMILY_EDITION FR-05/FR-06, §4 (8 activity types), §6.3 (video) · DESIGN §4 (inquiry_templates,
sources), §5 (inquiry_instances, activity_instances), §7 (RLS), §13 · S1 (config, version lock, generator).
Content input: Pilot Kit A/B v0.2.1 drafts (`inquiry-draft/0.1`) — copy into `content/inquiries/drafts/`
from /home/claude/english-os/v0.2/audit/inquiries_A_draft.json and inquiries_B_draft.json.

## Goal
A parent (or the learner's tutor) picks a published inquiry template for that learner's track and assigns
it with a due date. The app stores an immutable **snapshot** (steps, targets, modes, sources) so later
template versions never change what was assigned. Staff can reschedule/skip a step only with a reason.
Answer keys and model answers are **never readable by students** (not even via REST).

## Decisions (Opus) — assumptions the parent can overturn
1. **O-F1 video = link-only (PRD §6.3 default).** Sources may carry a video URL; the app never embeds
   video (no iframe/player). Recorded in PROGRESS as an assumption.
2. **Templates are content, not UI-authored** (Family Edition): `content/inquiries/*.json` → generated seed
   migration via the S1 generator + version lock (`gen:config -- --new`). Authoring UI is out of scope.
3. **Answer keys live apart from student-visible data:** `template_item_keys` and `instance_item_keys`
   (staff-only RLS). Kinds: `answer` (closed items, used by S3 auto-check) and `sealed` (open-item model
   answers / key ideas: staff UI must show them only after the learner's attempt — enforced in S5; S2
   only stores the flag).
4. **Baseline** templates get `purpose: ["baseline"]` on every step (never counts toward Independent).
5. **Catalogue whitelist enforced at generation time:** for every step, each target's
   `evidence_tasks` must contain the step's `activity_type`; violation = generator error (this is what
   the Kit A audit found by hand).

## Steps (commit after each; typecheck/lint/test green; `gen:config -- --check` green)

### Step 1 — Content
- Zod schema `inquiryTemplate` in `lib/config/schemas.ts` (fields from the draft format + `version`,
  `status`). Convert the two drafts into one file per template: `content/inquiries/A-W0-BASELINE.json`,
  `A-W1-VOLCANOES.json` … `B-W4-…json` (10 files). Keep the drafts in `content/inquiries/drafts/` (not seeded).
- Unit tests: every template parses; track matches id prefix; all target ids exist in the catalogue for
  that track; activity_type ∈ 8 types; mode ∈ PRACTICE/INDEPENDENT_CHECK/REVISION; whitelist rule (decision 5);
  every closed item (`mcq|gap|word_form|transform`) has a non-empty answer; MCQ answer ∈ options (or a
  letter index that resolves); item ids unique within template; baseline steps carry `baseline`.
  If real content violates a rule, FIX THE CONTENT only when the fix is unambiguous (e.g. a typo in an
  id); otherwise mark that step `status: "needs_review"` with a note, keep the template `draft` (not
  seeded), and list it in the final report. Do not change answers.

### Step 2 — Schema `db/migrations/0007_inquiries.sql`
Tables (schema `english`, idempotent, RLS on all, per-table grants, never `on all tables`):
- `sources` (id text, title, url null, author, rights_note not null, modality check text|audio|video,
  text null, created_at) and `source_versions` if you need versioning — simplest acceptable: sources are
  immutable rows keyed `(id, version)`.
- `inquiry_templates` PK `(id, version)`: track_id FK, title_vi, big_question_en/vi, week, date_from,
  date_to, domain_bucket, target_ids text[], steps jsonb (**student-safe**: no answers/explanations),
  catalogue_version, status draft|published, published_at, source_hash. Published → immutable (reuse the
  S1 trigger pattern).
- `template_item_keys` PK `(template_id, version, item_id)`: step_no, kind answer|sealed, answer text,
  explanation_vi. Immutable with its template. **Staff-only.**
- `inquiry_instances`: id uuid, learner_id FK, template_id+version FK, snapshot jsonb (student-safe),
  assigned_by (member id), assigned_at, due_at, client_request_id unique. **Append-only** (attach
  `eng_forbid_mutation('learner_id')`, add to `eng_purge_learner` via create-or-replace in 0007, keeping
  every existing statement — diff against 0005's version).
- `activity_instances`: id uuid, inquiry_instance_id, learner_id, step_no, activity_type, mode,
  purpose text[], target_ids text[], scheduled_for date null. Append-only, purge.
- `instance_item_keys`: snapshot of keys at assign time (instance_id, item_id, step_no, kind, answer,
  explanation_vi). Staff-only, append-only, purge.
- `activity_instance_events`: id, activity_instance_id, learner_id, kind reschedule|skip|unskip,
  new_date null, reason text not null (length ≥ 3), by_member, at. Append-only, purge. Effective schedule
  = latest event (order by at, id).
RLS (SELECT only for `authenticated`; no write policies):
- templates/sources: any member reads `published`.
- template_item_keys / instance_item_keys: **only** parent of the learner's family or tutor with active
  relationship (`eng_is_parent_of` / tutor check); students and anon never. (Keys of templates: parent
  or any tutor of the family.)
- instances/activity_instances/events: `eng_can_read_learner(learner_id)`.
Functions (security definer, `search_path=''`, execute only service_role):
- `eng_assign_inquiry(p_learner uuid, p_template text, p_version int, p_due date, p_by uuid,
  p_client_request_id text) returns uuid` — checks template published, track = learner track, `p_by` is
  parent of the family or active tutor of the learner; builds snapshot + activity_instances + key
  snapshot in one transaction; idempotent on client_request_id (returns existing id); audit receipt.
- `eng_activity_event(p_activity uuid, p_kind text, p_new_date date, p_reason text, p_by uuid)` — same
  actor check; audit receipt.
End with schema_migrations insert '0007'.

### Step 3 — Seed
Extend the S1 generator to include inquiry templates + their sources + keys as lockable versions;
`npm run gen:config -- --new` → `0008_seed_inquiries_pilot_v1.sql` (published). Lock updated. Re-run no-op.
seed-dev: assign A-W1-VOLCANOES to An (thử) and B-W1-… to Nguyên (thử) (idempotent via fixed
client_request_id).

### Step 4 — Server routes + access
- `requireAccess` actions: `inquiries:assign`, `inquiries:read`, `activities:event` (parent of family,
  tutor with active relationship; students denied).
- `GET /api/learners/:id/templates` (published templates for that learner's track),
  `POST /api/learners/:id/inquiries` (zod body: template id+version, due date, client_request_id) →
  calls `eng_assign_inquiry` with service role **after** requireAccess; `GET /api/learners/:id/inquiries`
  (instances + steps + effective schedule; keys NOT included), `POST /api/activities/:id/events`.
  All 404 outside scope (same pattern as S0/S1). Never return keys from these routes.

### Step 5 — UI (staff only; student home is S3)
- On each learner card (parent + tutor): link "Giao bài". Page `/learners/[id]/inquiries`:
  section "Bài có thể giao" (template title, big question, week dates, button "Giao bài" with due date
  defaulting to date_to) and section "Đã giao" (each inquiry → its steps: activity label, mode label
  per UX guide `modeLabels.staff`, scheduled date, "Đổi ngày"/"Bỏ bước" requiring a reason).
- Video sources render as a plain external link with the label from vi.ts; never embedded.
- All strings in `lib/copy/vi.ts` per docs/UX_COPY_GUIDE.md (check §3/§4 for activity/mode labels; add
  missing activity labels in the same tone; codes never shown to parents outside the collapsed
  "Thông tin kỹ thuật").

### Step 6 — Tests
- DB (`tests/db/inquiries.test.ts`): assign happy path (snapshot equals template, N activity rows, keys
  snapshot); wrong track rejected; unpublished rejected; actor not parent/tutor rejected; tutor of An
  cannot assign to Nguyên; idempotent client_request_id; instances/activities/keys/events immutable;
  purge removes all of them for that learner only; **student and anon cannot read any key table**;
  student reads own instances only; template change after assign does not change snapshot (new version).
- Unit: route handlers with mocked store (403/404/400/200), zod bodies, generator whitelist errors.
- E2E (`tests/e2e/inquiries.spec.ts`): parent assigns A-W1 to An (thử) via UI → appears under "Đã giao";
  tutor of Nguyên opens An's page → 404; student has no "Giao bài" link and the URL 404s; reschedule
  without reason is blocked in UI and API. Verify in CI (workflow_dispatch on the branch).

### Step 7 — Docs
PROGRESS S2 section (SQL for parent: 0007, 0008; O-F1 assumption; how to assign), CLAUDE.md status.

## Out of scope
Student-facing pages (S3), answering/auto-check (S3), drafts/attempts (S4), review/sealed-content UI (S5),
template authoring UI, PDF sources.

## Stop and ask
Any change to answers in the kit content; anything letting students read keys; embedding video.
