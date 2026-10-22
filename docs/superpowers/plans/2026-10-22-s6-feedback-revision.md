# S6 · Góp ý cho con + Sửa bài (trước–sau) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the first learning loop with no AI: the reviewer of a piece of in-app writing sends the child one specific praise and 1–3 priorities (optionally with an excerpt of the work and a skill leaf). By default the app then opens a revision step at the top of the child's "Việc tiếp theo". The child revises on top of the old text and marks each item "Đã sửa" or "Giữ nguyên", with a reason as the track setting requires. The reviewer sees before and after side by side with a word-level diff, gives a required verdict on every item, may score "Sửa bài" (A3) and the language skills (tagged "bài sửa — có góp ý"), and then presses "Xong" or "Mở vòng 2" (at most 2 rounds). The child sees "Thầy/cô đã xem bài sửa của bạn". Parent and tutor read every before–after pair under "Bài đã sửa". A revision never counts as a first attempt, and the child never sees a score.

**Architecture:** One expand-only migration `0021_feedback_revision.sql` makes these changes:
- adds `attempts.revises_attempt_id`, guarded by a CHECK and two insert triggers: a revision is mode REVISION, never attempt 1, never `is_first_attempt`, and in the same learning family as the work it revises;
- adds a small `track_settings` config table: `revision_reason_required` is A=false and B=true, and `revision_target_key` is the track's A3 target;
- adds three append-only books: `feedback_notes`, `revision_marks` and `revision_checks`;
- adds the security-definer functions for staff writes and reads (service_role, after `requireAccess`) and for student reads and writes (authenticated, keyed on `auth.uid()`);
- extends three S5 functions so a revision is scored through the existing S5 path. `eng_episode_targets` adds the root's skills, `eng_review_role` makes D15 follow the root, and `eng_review_inbox` treats a revision as done when the reviewer presses Xong or Mở vòng 2;
- extends `eng_purge_learner` and `eng_purge_preview`.

The app gets a pure `lib/revision/` module (word diff, excerpt finder, score-word check, mark and verdict rules, zod parsers and bodies, staff handlers, store, routes, loaders). It also gets four student methods on the existing `WorkStore`, three review-side components, a student revision form on `/activities/[id]`, home rows, and two learner pages "Bài đã sửa".

**Tech Stack:** Next.js App Router + TypeScript strict + Tailwind; Supabase Postgres (schema `english`); zod 4; Vitest (unit tests, plus DB tests on local Postgres 16); Playwright (CI only).

**Spec:** `docs/superpowers/specs/2026-10-22-s6-feedback-revision-design.md` (approved section by section on 22/10/2026). §1 holds the parent's decisions Q1–Q4, PA, 1-a…4-b; §2 the flow; §3 the data; §4 the screens; §5 what is out of scope; §6 the risks. This branch builds on SM-2 (`feature/sm2-level-profile`, migration `0020`) and on SM-1 (`0019`).

## Global Constraints

- Everything lives in schema `english`. Never create or change anything in schema `public`. Never run `supabase db push` or `db reset --linked`.
- `db/migrations/0021_feedback_revision.sql` is idempotent and expand-only. Its LAST line is `insert into english.schema_migrations(version) values ('0021') on conflict do nothing;`. Never edit 0001–0020, `content/**` or `content/config.lock.json`. S6 adds no versioned content, so `npm run gen:config` must report nothing new.
- New append-only tables carry the `english.eng_forbid_mutation('learner_id')` trigger for update and delete, and `english.eng_forbid_mutation()` for truncate. RLS is on. Nobody, `service_role` included, may INSERT, UPDATE, DELETE or TRUNCATE directly. SELECT works only through a policy `english.eng_is_staff_of(learner_id)` (the family's parent, or a tutor with an active relationship, never a student). No `grant … on all tables`.
- Every callable new function is `security definer` with `set search_path = ''`. Staff functions are `eng_write_feedback`, `eng_finish_revision`, `eng_feedback_panel`, `eng_revision_view` and `eng_revision_list`. For them: `revoke … from public, anon, authenticated; grant … to service_role;`, and routes and pages call them only after `requireAccess` / `requireLearnerPage`. Student functions are `eng_my_feedback`, `eng_my_revision`, `eng_save_revision_draft` and `eng_submit_revision`. For them: `revoke … from public, anon, service_role; grant … to authenticated;`; they find the student through `auth.uid()`, the same pattern as `eng_my_review_by_domain`. Internal helpers are revoked from everyone.
- D15 and Q1: only the reviewer of the work gives feedback and checks its revision. Use `english.eng_review_role` (tutor of the child always; parent only when the work is not restricted). From 0021 a revision is restricted whenever its root is.
- A revision is never a first attempt (FR-14a): `episodes.is_first_attempt = false`, `attempts.mode = 'REVISION'`, `attempt_no > 1`, `parent_attempt_id = revises_attempt_id`, and the learning family is that of the revised work. Three DB checks enforce this: a CHECK constraint, `attempts_revision_check` and `episodes_revision_not_first`.
- At most 2 rounds per root work (the DB refuses round 3). Feedback can be edited (a new row supersedes the old) only until the child saves the first draft of that revision or submits it.
- Adult text that contains a score is refused in both the app and the DB: the pattern `\d+\s*/\s*\d+`, the word "điểm" in any case, or "%". This covers praise, items and the closing note. The child's excerpt and reasons are never checked.
- The child sees praise, items, excerpts, the old text, and the states "Đã nộp" / "Thầy/cô đã xem bài sửa của bạn" with the closing note. The child never sees a score, an observation, a decision, a verdict or a skill leaf. All copy lives in `lib/copy/vi.ts` (rules in `docs/UX_COPY_GUIDE.md`). Any text that names the person teaching uses `tutorHonorific` / `tutorHonorificCap` and never the literal "cô" or "thầy". The app is always light: no `dark:` classes, and never the word "TOMO".
- Track is configuration. Never write `=== "A"` / `=== "B"` anywhere, tests included (ESLint `no-restricted-syntax`). Track-specific behaviour comes from `english.track_settings`.
- The branch is `feature/s6-feedback-revision`, which already holds the spec. Before the PR: `npm run typecheck && npm run lint && npm test && npm run gen:config` must be green, then the Opus `reviewer` runs. The PR description is in Vietnamese and says "SQL cần áp: 0021 (áp TRƯỚC khi thử preview hoặc gộp; cần 0019 + 0020 đã áp)".
- Every commit message ends with the `Co-Authored-By` / `Claude-Session` lines of the session that implements it.

## Decisions taken in this plan (for the parent)

These decisions do not change approved behaviour; they fill gaps the spec leaves open. The PR description repeats them.

| # | Spec says | This plan does | Why |
|---|---|---|---|
| D1 | §2.3 "nếu bài gốc thuộc một chủ đề có bước REVISION ngay sau" | The template's REVISION step is reused when it is the **first REVISION step after the work's step with no other writing step (`ACT-WRITE`) in between**. Examples: A-W1 11 → 13 (12 is a self-review), B-W1 7 → 8. A-W1 6 is not reused (11 is a writing step in between), so it gets its own step. The rule sits in one SQL function, `eng_open_revision_step`. See Spec gap G1. | A literal "step_no + 1" never matches Track A, because every A template has a self-review between the writing step and its revision step. |
| D2 | §3 "dùng lại bước REVISION của chủ đề nếu có" | A template REVISION step is reused only when it has no attempt yet, no other feedback points to it, and it is not skipped. If its date is later than today, the function writes a `reschedule` event to today with the reason "Mở bước sửa bài theo góp ý", so the child can start now. In every other case the app creates its own step. | The step must open when the feedback arrives, not on the template's date. A step that was skipped or already used (e.g. on paper) must not change meaning. |
| D3 | §3 "Bước sửa tự tạo: activity_instances mode REVISION, nguồn = góp ý" | The created step goes into the same inquiry with `step_no` 1001, 1002, …, `activity_type` `ACT-REVISE`, mode `REVISION`, no purpose, target = the track setting `revision_target_key`, scheduled today. Staff screens label it "Bước sửa bài". The link from the step to the feedback is a new column, `feedback_notes.revision_activity_id`. It is not listed in the spec table; it is additive, and rows are append-only, so the link has to sit on the feedback row. | The column `activity_instances.step_no` must be unique per inquiry, and steps 1–15 belong to templates. |
| D4 | Brief: "how an optional 0–4 'Sửa bài' score is recorded without breaking coverage denominators" | The A3 score is an ordinary S5 observation and decision on the **revision episode**, for the track's `revision_target_key`: `A-A3-REDRAFT` for A (the catalogue target for "redraft after 1–3 feedback priorities") and `B-A3-REVISE` for B. Coverage denominators are the target set's `target_ids` (`lib/targets/view.ts`); neither A3 target is in A-v1 or B-v1, so neither enters a denominator. For A, dimension A3 is listed as "tracking only" (shown apart, never counted). For B, B-v1 is locked (`config.lock.json`) and has no A3 tracking. B's A3 scores are visible only on the revision episode and under "Bài đã sửa"; listing them as tracking-only needs a B-v2 later. | Nothing published changes, so `gen:config` stays green. |
| D5 | 3-b "Chấm kỹ năng ngôn ngữ trên bài sửa … app tự gắn 'bài sửa — có góp ý'" | `eng_episode_targets` gives a revision episode the step's own skills (A3) plus, after them, the root work's skills. A revision episode is tagged in three ways: `episodes.facets.revision = true`; one `assistance_events` row (`tutor_prompt`, `observed`, every skill of the pair, `recorded_by` = the author of the feedback, note "Góp ý vòng n"); and `is_first_attempt = false`. The scoring panel runs in "optional" mode on revisions: the reviewer saves only the skills they pick. A chip "Bài sửa — có góp ý" sits in the header. | S7 reads the assistance row as supported evidence, the same rule as any other hint, so a revision never reads as "tự làm được". |
| D6 | §3 "learning_family của bài sửa = của bài gốc; first = false luôn" | A revision attempt has: `attempt_no` = the highest number in the family or on the step, plus 1; `parent_attempt_id` = `revises_attempt_id` = the revised work; `learning_family_id` = that work's family. A CHECK and a trigger enforce this. Exposures for every skill of the pair are logged as `retry`. | The constraint `attempts_first_is_own_family` forbids attempt 1 in someone else's family. "Retry" is what the 14-day delayed-check rule counts as practice. |
| D7 | 2-a "Tối đa 2 vòng" | Round 2 reuses the same revision step and adds a new attempt. Round-2 feedback can only be created through "Mở vòng 2", after every item of round 1 has a verdict, and it always asks for a revision. After round 2 the only action left is "Xong" (closing note optional). | "Mở vòng 2 với góp ý mới" (spec §2.5). |
| D8 | Q4 "Bài viết … làm trong app" | Feedback is possible only on work whose stored artifact is a text (`eng_step_shape` = `text`) and whose provenance is `in_app` / `pasted`. The panel does not appear on paper or offline work, on answer-shaped steps (e.g. B sentence transformations), or on questions. | Closed questions already have "Làm lại"; paper work is Studio PR B (spec §5). |
| D9 | §2.2 "chấm như S5, rồi điền khung Góp ý" | Feedback does not require scores first, and scoring does not require feedback. One live feedback chain per work. | Keeps the "≤ 2 phút" goal. |
| D10 | 1-c and "Chỉ góp ý" | A "Chỉ góp ý" note (no revision) appears in the child's home box "Góp ý của thầy/cô" for 14 days. Its author can edit it at any time, because there is no revision to start. See Spec gap G4. | Spec §4 does not say where such a note is read. |
| D11 | 3-a "Xong", "nhận xét kết (tùy chọn)" | The verdicts and the Xong / Mở vòng 2 action are saved in **one** call (`eng_finish_revision`), and the verdicts are final. The closing note (≤ 300 characters, optional) is a `feedback_notes` row of kind `closing`, with its text in `praise`. | One transaction: a half-saved set of verdicts cannot happen. |
| D12 | 2-c "Con thấy 'Thầy/cô đã xem bài sửa của bạn'" | The home shows that line and the closing note for 14 days after Xong or Mở vòng 2. "Đã nộp bài sửa — thầy/cô sẽ xem lại" shows until then. | The child is not left with a stale "waiting". |
| D13 | §2.4 (no word on the help declaration) | The revision form keeps S4's help declaration ("Bạn đã dùng gợi ý nào?" with the same five choices, `work.help`) and its paste detection. | The column `attempts.declared_assistance` is required, and evidence keeps one rule. |
| D14 | Q1 / D15 for a revision | The revision of tutor-only work (in-session test or watched live) is tutor-only too. `eng_review_role` asks `eng_episode_restricted`, which looks at the root. Template REVISION steps have no purpose; without this, a parent could check them. | "Người duyệt bài đó". |
| D15 | §2.5 "Bài sửa vào Hộp duyệt nhãn 'Bài sửa lại (vòng n)'" | Inbox: a revision episode is "done" once Xong or Mở vòng 2 was pressed, not when every skill is scored, because scores on revisions are optional. It carries the label "Bài sửa lại (vòng n)". Categories and filters are unchanged. | Otherwise optional scores would keep revisions in "Cần duyệt" forever. |
| D16 | 1-b "gắn kỹ năng = 1 lá của bản đồ SM-1" | A leaf is stored as `{kind, ref_key}`. It must be a leaf of the current map for the child's track, or one of the family's own tags that has a group. The child never receives it. The picker is Domain → Group → Leaf (SM-1 `GroupPicker` + one select). | Spec 1-b. |
| D17 | 3-c "Phụ huynh xem trước–sau … Bài đã sửa" | The page `/learners/[id]/revisions` (list) and `/learners/[id]/revisions/[attemptId]` (read-only before–after) are open to tutor and parent (`tutorwork:read`). Staff see "2/3 góp ý đã cải thiện hoặc có lý do hợp lý" (with its denominator, UX guide §4.2). The card of each child gets a link "Bài đã sửa". | Spec §4. |
| D18 | §6 "Kiểm mẫu điểm … ở cả app lẫn DB" | The check applies to praise, item texts and the closing note. It does not apply to excerpts (quotes of the child's English, e.g. "3/4 of the water") or to the child's reasons. | An excerpt must match the child's text exactly. |
| D19 | Q3 "Là cài đặt theo track" | A generic table `english.track_settings(track_id, key, value jsonb)` holds `revision_reason_required` (A false, B true) and `revision_target_key`. It is readable only through functions. | Configuration, not `if track`. |
| D20 | §4 "Màn sửa bài" | The revision form is shown at `/activities/[id]`, the link every step already uses: a REVISION step with open feedback renders the form, any other step keeps S4. The S4 functions keep refusing REVISION steps. The spec says "eng_step_supported cho REVISION khi có góp ý"; `eng_step_supported(text, text)` is immutable and has no activity id, so the rule lives in `eng_revision_open(activity)`, which every revision entry point checks. | The S4 paths stay exactly as tested. |

## Spec gaps (asked in the PR, not silently decided)

1. **G1 — "ngay sau"**: Read literally (the next step number), the rule never reuses a Track A template's REVISION step (A-W1 11 → 12 self-review → 13; the same in A-W2, A-W3, A-W4). Those steps would then stay "trên giấy" forever, while the spec (PA) says the template step is used when the topic has one. The plan applies D1 ("first REVISION step after it, no other writing step in between"). If the parent wants the literal rule, change one condition in `eng_open_revision_step` (Task 2, marked `-- D1`).
2. **G2 — score words**: The approved rule refuses every "điểm" and every `\d+/\d+`. That also refuses common praise such as "Điểm mạnh của bài là …" and dates such as "như hôm 22/10". The plan implements the rule exactly as written, and the error text tells the adult to rephrase. Should the parent narrow it (e.g. "điểm" only next to a number)?
3. **G3 — "hoặc bài viết giao lẻ"** (§2.1): Today no standalone writing exists in the app; S5b practice is paper or photo. S6 has nothing to attach to; photo practice belongs to Studio PR B.
4. **G4 — where the child reads "Chỉ góp ý"**: §4 lists no screen for a note without a revision. The plan shows it in the home box "Góp ý của thầy/cô" (D10).

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/0021_feedback_revision.sql` | Column `attempts.revises_attempt_id` + checks/triggers; `track_settings`; 3 append-only books + RLS; helpers; S5 extensions (`eng_episode_restricted`, `eng_review_role`, `eng_episode_targets`, `eng_review_inbox`); feedback (`eng_clean_feedback_items`, `eng_open_revision_step`, `eng_write_feedback`); student (`eng_clean_revision_marks`, `eng_my_feedback`, `eng_my_revision`, `eng_save_revision_draft`, `eng_submit_revision`); staff (`eng_finish_revision`, `eng_feedback_panel`, `eng_revision_view`, `eng_revision_list`); purge + preview |
| `lib/revision/types.ts` | Limits (`PRAISE_MAX` …), `MARK_CHOICES`, `VERDICTS`, `verdictsFor`, view types |
| `lib/revision/text.ts` | `cleanText` (mirror of `eng_clean_text`), `isUnchanged` |
| `lib/revision/scoreWords.ts` | `hasScoreWords` (mirror of `eng_has_score_words`) |
| `lib/revision/diff.ts` | `diffWords` (word-level LCS), `DiffToken` |
| `lib/revision/excerpt.ts` | `findExcerpt`, `segmentsFor` (highlighting) |
| `lib/revision/rules.ts` | `checkFeedback`, `checkMarks`, `missingVerdicts` |
| `lib/revision/shape.ts` | zod parsers `parseFeedbackPanel`, `parseRevisionView`, `parseRevisionList`, `parseMyFeedback`, `parseMyRevision` |
| `lib/revision/schemas.ts` | Request bodies `feedbackBodySchema`, `finishBodySchema`, `revisionDraftBodySchema`, `revisionSubmitBodySchema` |
| `lib/revision/handlers.ts` | Staff: `handleWriteFeedback`, `handleFinishRevision`, `fromRevisionDbError`, `RevisionStore` |
| `lib/revision/supabaseStore.ts`, `lib/revision/route.ts`, `lib/revision/load.ts`, `lib/revision/client.ts` | service-role calls; route glue; page loaders; `revisionFailText` |
| `lib/work/{handlers,supabaseStore,load}.ts` | Student: `getMyFeedback`, `getMyRevision`, `saveRevisionDraft`, `submitRevision`; `handleStudentFeedback`, `handleStudentRevision`, `handleSaveRevisionDraft`, `handleSubmitRevision`; home carries `feedback`; `loadRevisionPage` |
| `lib/review/{types,shape}.ts` | `InboxItem.revisionRound` |
| `app/api/review/attempts/[id]/feedback/route.ts`, `app/api/review/attempts/[id]/revision-finish/route.ts` | Staff POST routes |
| `app/api/student/feedback/route.ts`, `app/api/student/revisions/[id]/route.ts`, `app/api/student/revisions/[id]/draft/route.ts` | Student routes |
| `components/revision/{FeedbackFields,LeafPicker,FeedbackPanel,DiffView,RevisionReview,ExcerptText,RevisionForm,RevisionList}.tsx` | S6 screens |
| `components/student/{RevisionRows,FeedbackBox}.tsx`, `components/student/StudentHome.tsx` | Student home |
| `components/review/ScoringPanel.tsx` | `optional` mode |
| `app/review/[episodeId]/page.tsx`, `app/review/page.tsx`, `app/activities/[id]/page.tsx`, `app/page.tsx` (student branch), `app/learners/[id]/revisions/page.tsx`, `app/learners/[id]/revisions/[attemptId]/page.tsx`, `components/LearnerCard.tsx` | wiring |
| `lib/copy/vi.ts` | `feedbackCopy`, `revisionCopy`, `revisionReviewCopy`, `purgePage.countLabels` (+3), `inquiriesPage.stepLabel` |
| Tests | `tests/unit/migration0021.test.ts`, `tests/unit/fixtures/scoreWords.ts`, `tests/db/feedbackRevision.test.ts`, `tests/db/migrations.test.ts`, `tests/unit/revision.test.ts`, `tests/unit/revisionApi.test.ts`, `tests/unit/workHandlers.test.ts`, `tests/unit/revisionUi.test.ts`, `tests/unit/purge.test.ts`, `tests/unit/copy-and-visibility.test.ts`, `tests/e2e/review.spec.ts`, `tests/e2e/student-no-scores.spec.ts` |
| Docs | `docs/PROGRESS.md` (S6 section), `CLAUDE.md` (status + next migration 0022), `docs/DESIGN.md` (§19.9), `docs/UX_COPY_GUIDE.md` (§3.3 rows + §5 messages) |

Task order: 0 (gate) → 1 → 2 → 3 → 4 (migration) → 5 (`lib/revision` core) → 6 (API) → 7 (review: feedback panel) → 8 (student: home + revision form) → 9 (review: before–after, "Bài đã sửa") → 10 (e2e) → 11 (docs, checks, review, PR).
**Tasks 1–6 may start before the gate; Tasks 7–9 wait for Task 0.**

The migration is built in four parts. Task 1 creates the file with sections 1–4 and the purge (section 9). Tasks 2, 3 and 4 each paste their section **immediately above the line that starts with `-- 9. Purge:`**, so the purge stays last and the file ends with the `schema_migrations` insert.

---

### Task 0: Gate — mockups (parent, not for the builder)

- [ ] Claude builds 3 mockup boards (an HTML artifact, always light, phone and desktop) from spec §2 and §4 and this plan's copy (Task 5):
  1. **"Thầy/cô góp ý"**: the review screen with the "Góp ý cho con" panel (praise, 1–3 items, "Lấy đoạn đang chọn", leaf picker, "Yêu cầu con sửa bài" / "Chỉ góp ý", "Gửi góp ý cho con"), the sent state with "Sửa góp ý", and the score-word error.
  2. **"Con sửa bài"**: the home with the revision row first, the revision page (praise, numbered items, highlighted excerpts, editor prefilled, "Xem bài cũ", Đã sửa / Giữ nguyên + reason for A and for B, help declaration, receipt), and "Thầy/cô đã xem bài sửa của bạn".
  3. **"Trước–sau"**: the "Bài sửa lại (vòng n)" review (two columns on desktop, stacked on phone, struck deletions, highlighted insertions, one verdict per item, optional A3 / language scoring, closing note, Xong / Mở vòng 2) and the parent's "Bài đã sửa" list and viewer.
- [ ] The parent approves all 3 boards. Any copy or layout change goes back into Tasks 5 and 7–9 **before** they start.
- [ ] Base: the branch `feature/s6-feedback-revision` exists with the spec (`git fetch origin && git checkout feature/s6-feedback-revision`). If `feature/sm2-level-profile` moves while S6 is built, rebase onto it before the PR.

---

### Task 1: Migration 0021 part 1 — revision column and rules, track settings, three books, helpers, purge

**Files:**
- Create: `db/migrations/0021_feedback_revision.sql`, `tests/unit/migration0021.test.ts`, `tests/unit/fixtures/scoreWords.ts`, `tests/db/feedbackRevision.test.ts`
- Modify: `tests/db/migrations.test.ts` (two table lists)

**Interfaces:**
- Consumes: `english.attempts`, `english.episodes` (0009), `english.activity_instances` (0007), `english.working_drafts` (0009), `english.tracks` (0005), `english.eng_forbid_mutation` (0004), `english.eng_is_staff_of` (0007), `english.eng_clean_text` (0009), the purge / preview of 0020 (lines 542–828 of `0020_level_profile.sql`).
- Produces:
  - `english.attempts.revises_attempt_id uuid` (nullable, FK attempts). Constraint `attempts_revision_shape`; triggers `attempts_revision_check` (before insert on attempts) and `episodes_revision_not_first` (before insert on episodes).
  - `english.track_settings(track_id, key, value jsonb)` with `revision_reason_required` = `false`/`true` (A/B) and `revision_target_key` = `"A-A3-REDRAFT"`/`"B-A3-REVISE"`. `english.eng_track_setting(p_track text, p_key text) returns jsonb` (internal).
  - `english.feedback_notes(id, learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, requires_revision, revision_activity_id, supersedes_id, author_member, author_role, client_id, created_at)`.
  - `english.revision_marks(id, learner_id, attempt_id, feedback_id, item_n, choice, reason, created_at)`, unique `(attempt_id, item_n)`.
  - `english.revision_checks(id, learner_id, attempt_id, item_n, verdict, checker_member, checker_role, client_id, created_at)`, unique `(attempt_id, item_n)`.
  - `english.eng_has_score_words(p_text text) returns boolean` and `english.eng_feedback_texts_ok(p_items jsonb) returns boolean` (immutable; also used by table CHECKs).
  - Internal helpers: `eng_revision_root(p_attempt uuid) returns uuid`, `eng_feedback_is_live(p_feedback uuid) returns boolean`, `eng_revision_round(p_attempt uuid) returns int`, `eng_revision_started(p_feedback uuid) returns boolean`, `eng_revision_feedback(p_activity uuid) returns uuid`, `eng_revision_open(p_activity uuid) returns boolean`.
  - Purge receipt / preview keys `feedback_notes`, `revision_marks`, `revision_checks`.
  - The marker line `-- 9. Purge: …`. Tasks 2–4 insert ABOVE it.
  - `tests/unit/fixtures/scoreWords.ts`: `export const SCORE_WORD_SAMPLES: readonly (readonly [string, boolean])[]`.

- [ ] **Step 1: Write the shared samples** — `tests/unit/fixtures/scoreWords.ts`

```ts
/** One list for the app check (lib/revision/scoreWords.ts) and the database check (english.eng_has_score_words): [text, has a score]. */
export const SCORE_WORD_SAMPLES: readonly (readonly [string, boolean])[] = [
  ["Bài được 3/4", true],
  ["được 3 / 4 câu", true],
  ["Điểm cao lắm", true],
  ["ĐIỂM", true],
  ["con được điểm tốt", true],
  ["đúng 80% rồi", true],
  ["như hôm 22/10", true],
  ["Con dùng “because” đúng chỗ", false],
  ["Câu mở đoạn rõ ràng, có ví dụ", false],
  ["Lần 2 con viết rõ hơn", false],
  ["Thêm một câu kết cho đoạn văn", false],
  ["diem", false],
] as const;
```

- [ ] **Step 2: Write the failing unit test** — `tests/unit/migration0021.test.ts` (Tasks 2–4 add their `it` blocks at the marker comment)

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0021_feedback_revision.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnText = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));

describe("0021_feedback_revision.sql", () => {
  it("ends by recording its own version, is expand-only and never touches schema public", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0021') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|drop\s+function/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("a revision points at the work it revises, is never attempt 1 and never a first attempt", () => {
    expect(code).toContain("alter table english.attempts add column if not exists revises_attempt_id uuid references english.attempts(id);");
    expect(code).toContain("or (mode = 'REVISION' and attempt_no > 1 and parent_attempt_id = revises_attempt_id and revises_attempt_id <> id)");
    expect(code).toMatch(/create trigger attempts_revision_check\s+before insert on english\.attempts/);
    expect(code).toMatch(/create trigger episodes_revision_not_first\s+before insert on english\.episodes/);
  });

  it("track settings are configuration: reason required A false / B true, the A3 target of each track; nobody reads the table directly", () => {
    expect(code).toContain("('A', 'revision_reason_required', 'false'::jsonb)");
    expect(code).toContain("('B', 'revision_reason_required', 'true'::jsonb)");
    expect(code).toContain("('A', 'revision_target_key', '\"A-A3-REDRAFT\"'::jsonb)");
    expect(code).toContain("('B', 'revision_target_key', '\"B-A3-REVISE\"'::jsonb)");
    expect(code).toContain("revoke all on english.track_settings from public, anon, authenticated, service_role;");
  });

  it("the three books are append-only, staff-read only, and nobody inserts directly", () => {
    for (const t of ["feedback_notes", "revision_marks", "revision_checks"]) {
      expect(code).toContain(`create table if not exists english.${t} (`);
      expect(code).toMatch(new RegExp(`create trigger ${t}_forbid_mutation\\s+before update or delete on english\\.${t}\\s+for each row execute function english\\.eng_forbid_mutation\\('learner_id'\\);`));
      expect(code).toMatch(new RegExp(`create trigger ${t}_forbid_truncate\\s+before truncate on english\\.${t}\\s+for each statement execute function english\\.eng_forbid_mutation\\(\\);`));
      expect(code).toMatch(new RegExp(`create policy ${t}_select on english\\.${t}\\s+for select to authenticated\\s+using \\(english\\.eng_is_staff_of\\(learner_id\\)\\);`));
      expect(code).toContain(`alter table english.${t} enable row level security;`);
    }
    expect(code).toContain(
      "revoke insert, update, delete, truncate on english.feedback_notes, english.revision_marks, english.revision_checks from public, anon, authenticated, service_role;",
    );
    expect(code).toContain("create unique index if not exists feedback_notes_supersedes_once on english.feedback_notes(supersedes_id) where supersedes_id is not null;");
    expect(code).toContain("create unique index if not exists feedback_notes_first_once on english.feedback_notes(source_attempt_id, kind) where supersedes_id is null;");
  });

  it("the score-word check is in the table: praise and item texts, never the excerpt", () => {
    const fn = fnText(sql, "eng_has_score_words");
    expect(fn).toContain("'[0-9]+[[:space:]]*/[[:space:]]*[0-9]+'");
    expect(fn).toContain("'[đĐ][iI][ểỂ][mM]'");
    expect(fn).toContain("pg_catalog.strpos(coalesce(p_text, ''), '%') > 0");
    expect(fnText(sql, "eng_feedback_texts_ok")).toContain("english.eng_has_score_words(x ->> 'text')");
    expect(code).toContain("not english.eng_has_score_words(praise)");
    expect(code).toContain("english.eng_feedback_texts_ok(items)");
  });

  it("the purge keeps EVERY line of the 0020 version and its preview too; the three books go before attempts", () => {
    const old20 = readFileSync(path.join(MIGRATIONS_DIR, "0020_level_profile.sql"), "utf8");
    for (const fn of ["eng_purge_learner", "eng_purge_preview"]) {
      const now = new Set(lines(fnText(sql, fn)));
      for (const l of lines(fnText(old20, fn))) expect(now.has(l), `${fn}: ${l}`).toBe(true);
    }
    const purge = fnText(sql, "eng_purge_learner");
    const at = (s: string) => purge.indexOf(s);
    expect(at("delete from english.revision_checks rc where rc.learner_id = p_learner_id;")).toBeGreaterThan(0);
    expect(at("delete from english.revision_marks rm where rm.learner_id = p_learner_id;")).toBeGreaterThan(at("delete from english.revision_checks rc"));
    expect(at("delete from english.feedback_notes fn where fn.learner_id = p_learner_id;")).toBeGreaterThan(at("delete from english.revision_marks rm"));
    expect(at("delete from english.feedback_notes fn")).toBeLessThan(at("delete from english.attempts t"));
    expect(at("delete from english.feedback_notes fn")).toBeLessThan(at("delete from english.activity_instances a"));
    for (const k of ["feedback_notes", "revision_marks", "revision_checks"]) {
      expect(purge).toContain(`'${k}', n_${k},`);
      expect(fnText(sql, "eng_purge_preview")).toContain(`'${k}', (select pg_catalog.count(*) from english.${k} x where x.learner_id = p_learner),`);
    }
  });

  // (Tasks 2, 3 and 4 add their tests here)
});
```

- [ ] **Step 3: Run it** — `npx vitest run tests/unit/migration0021.test.ts` → FAIL (ENOENT `0021_feedback_revision.sql`).

- [ ] **Step 4: Create the migration (part 1)** — create `db/migrations/0021_feedback_revision.sql` with exactly this content (header, sections 1–4, and the marker line of section 9):

```sql
-- 0021_feedback_revision.sql
-- S6 · Góp ý cho con + Sửa bài (trước–sau) (spec docs/superpowers/specs/2026-10-22-s6-feedback-revision-design.md §1–§4;
-- kế hoạch docs/superpowers/plans/2026-10-22-s6-feedback-revision.md):
--   1. attempts.revises_attempt_id: bài sửa trỏ về bài được góp ý. Luật (CHECK + trigger): chế độ REVISION, không bao giờ là lần 1, lần trước
--      = bài được góp ý, cùng em và cùng gia đình học tập với bài đó (đi xuyên bước). Episode của một lần REVISION không bao giờ là lần đầu.
--   2. english.track_settings: cài đặt theo track (revision_reason_required: A = false, B = true; revision_target_key: kỹ năng "Sửa bài" A3).
--   3. Sổ append-only: feedback_notes (góp ý / nhận xét kết; sửa = dòng mới thay dòng cũ, chỉ trước khi con bắt đầu sửa; tối đa 2 vòng),
--      revision_marks (em đánh dấu Đã sửa / Giữ nguyên + lý do), revision_checks (người duyệt đánh giá từng góp ý).
--   4. Góp ý "yêu cầu sửa" mở bước sửa: bước REVISION của chủ đề nếu là bước sửa kế tiếp, không thì một bước sửa riêng (step_no 1001+).
--   5. Điểm "Sửa bài" (A3) và điểm kỹ năng ngôn ngữ trên bài sửa đi qua đường chấm S5 (eng_episode_targets thêm kỹ năng của bài gốc;
--      D15 theo bài gốc). Hộp duyệt: bài sửa xong khi người duyệt bấm Xong hoặc Mở vòng 2.
--   6. Học sinh đọc qua eng_my_feedback / eng_my_revision (không điểm, không quan sát, không quyết định, không đánh giá), ghi qua
--      eng_save_revision_draft / eng_submit_revision. Chữ của người lớn có dạng điểm bị từ chối ở DB (eng_has_score_words).
--   7. eng_purge_learner + eng_purge_preview thêm 3 sổ mới.
-- Không đụng schema public. Idempotent; chỉ thêm (expand).

-- 1. Bài sửa trỏ về bài được góp ý ---------------------------------------------------------------------------------------------------
alter table english.attempts add column if not exists revises_attempt_id uuid references english.attempts(id);
create index if not exists attempts_revises_idx on english.attempts(revises_attempt_id) where revises_attempt_id is not null;
alter table english.attempts drop constraint if exists attempts_revision_shape;
alter table english.attempts add constraint attempts_revision_shape check (
  revises_attempt_id is null
  or (mode = 'REVISION' and attempt_no > 1 and parent_attempt_id = revises_attempt_id and revises_attempt_id <> id));

-- Cùng em, cùng gia đình học tập với bài được góp ý (phải đọc dòng khác → trigger, không CHECK).
create or replace function english.eng_check_revision_attempt() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_src english.attempts%rowtype;
begin
  if new.revises_attempt_id is null then
    return new;
  end if;
  select a.* into v_src from english.attempts a where a.id = new.revises_attempt_id;
  if not found or v_src.learner_id <> new.learner_id or v_src.learning_family_id <> new.learning_family_id then
    raise exception 'english.attempts: a revision stays with the same learner and in the learning family of the work it revises'
      using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function english.eng_check_revision_attempt() from public, anon, authenticated, service_role;
drop trigger if exists attempts_revision_check on english.attempts;
create trigger attempts_revision_check
  before insert on english.attempts
  for each row execute function english.eng_check_revision_attempt();

-- FR-14a: một lần nộp chế độ REVISION (bài sửa theo góp ý hay bài sửa ghi ngoài app) không bao giờ là "lần đầu".
create or replace function english.eng_check_revision_episode() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.is_first_attempt and exists (
    select 1 from english.attempts a where a.id = new.attempt_id and (a.mode = 'REVISION' or a.revises_attempt_id is not null)) then
    raise exception 'english.episodes: a revision is never a first attempt (FR-14a)' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function english.eng_check_revision_episode() from public, anon, authenticated, service_role;
drop trigger if exists episodes_revision_not_first on english.episodes;
create trigger episodes_revision_not_first
  before insert on english.episodes
  for each row execute function english.eng_check_revision_episode();

-- 2. Cài đặt theo track (cấu hình; không ai đọc thẳng, chỉ qua hàm) ------------------------------------------------------------------
create table if not exists english.track_settings (
  track_id text not null references english.tracks(id),
  key text not null check (key ~ '^[a-z][a-z_]{2,59}$'),
  value jsonb not null,
  primary key (track_id, key)
);
insert into english.track_settings(track_id, key, value) values
  ('A', 'revision_reason_required', 'false'::jsonb),
  ('B', 'revision_reason_required', 'true'::jsonb),
  ('A', 'revision_target_key', '"A-A3-REDRAFT"'::jsonb),
  ('B', 'revision_target_key', '"B-A3-REVISE"'::jsonb)
on conflict (track_id, key) do nothing;
alter table english.track_settings enable row level security;
revoke all on english.track_settings from public, anon, authenticated, service_role;

create or replace function english.eng_track_setting(p_track text, p_key text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select s.value from english.track_settings s where s.track_id = p_track and s.key = p_key
$$;
revoke execute on function english.eng_track_setting(text, text) from public, anon, authenticated, service_role;

-- 3. Ba sổ mới (append-only) ---------------------------------------------------------------------------------------------------------
-- Chữ của người lớn có dạng điểm: "3/4", "3 / 4", "điểm" (mọi kiểu hoa thường, chuẩn NFC), "%". Dùng ở bảng (CHECK) và trong các hàm ghi.
-- Có danh sách mẫu chung với lib/revision/scoreWords.ts (tests/unit/fixtures/scoreWords.ts).
create or replace function english.eng_has_score_words(p_text text) returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(p_text, '') ~ '[0-9]+[[:space:]]*/[[:space:]]*[0-9]+'
      or normalize(coalesce(p_text, ''), nfc) ~ '[đĐ][iI][ểỂ][mM]'
      or pg_catalog.strpos(coalesce(p_text, ''), '%') > 0
$$;
-- Chỉ kiểm chữ góp ý (text), không kiểm trích đoạn (đó là chữ tiếng Anh của em, vd. "3/4 of the water").
create or replace function english.eng_feedback_texts_ok(p_items jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select pg_catalog.jsonb_typeof(p_items) = 'array'
     and not exists (select 1 from pg_catalog.jsonb_array_elements(p_items) x where english.eng_has_score_words(x ->> 'text'))
$$;
revoke execute on function english.eng_has_score_words(text) from public, anon;
grant execute on function english.eng_has_score_words(text) to authenticated, service_role;
revoke execute on function english.eng_feedback_texts_ok(jsonb) from public, anon;
grant execute on function english.eng_feedback_texts_ok(jsonb) to authenticated, service_role;

-- Góp ý (kind feedback: câu khen + 1–3 ưu tiên) và nhận xét kết (kind closing: câu cho con, có thể trống). Sửa = dòng mới trỏ supersedes_id.
-- round: 1 = góp ý cho bài gốc, 2 = góp ý cho bài sửa vòng 1. revision_activity_id = bước sửa mà góp ý này mở (D3).
create table if not exists english.feedback_notes (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  source_attempt_id uuid not null references english.attempts(id),
  root_attempt_id uuid not null references english.attempts(id),
  round smallint not null check (round in (1, 2)),
  kind text not null check (kind in ('feedback', 'closing')),
  praise text check (praise is null or (pg_catalog.length(pg_catalog.btrim(praise)) between 1 and 300 and not english.eng_has_score_words(praise))),
  items jsonb not null default '[]'::jsonb
    check (pg_catalog.jsonb_typeof(items) = 'array' and pg_catalog.jsonb_array_length(items) <= 3 and english.eng_feedback_texts_ok(items)),
  requires_revision boolean not null default false,
  revision_activity_id uuid references english.activity_instances(id),
  supersedes_id uuid references english.feedback_notes(id),
  -- id của english.members, KHÔNG có khóa ngoại (xóa tài khoản không làm hỏng lịch sử).
  author_member uuid not null,
  author_role text not null check (author_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint feedback_notes_shape check (
    (kind = 'feedback' and praise is not null and pg_catalog.length(praise) <= 160 and pg_catalog.jsonb_array_length(items) between 1 and 3)
    or (kind = 'closing' and pg_catalog.jsonb_array_length(items) = 0 and not requires_revision and supersedes_id is null)),
  constraint feedback_notes_revision_step check (requires_revision = (revision_activity_id is not null)),
  constraint feedback_notes_round check (
    (kind = 'feedback' and (round = 1) = (source_attempt_id = root_attempt_id))
    or (kind = 'closing' and source_attempt_id <> root_attempt_id))
);
create unique index if not exists feedback_notes_supersedes_once on english.feedback_notes(supersedes_id) where supersedes_id is not null;
create unique index if not exists feedback_notes_first_once on english.feedback_notes(source_attempt_id, kind) where supersedes_id is null;
create index if not exists feedback_notes_learner_idx on english.feedback_notes(learner_id, created_at desc);
create index if not exists feedback_notes_revision_activity_idx on english.feedback_notes(revision_activity_id) where revision_activity_id is not null;

-- Em đánh dấu từng góp ý khi nộp bài sửa: changed (Đã sửa) / kept (Giữ nguyên) + lý do (bắt buộc hay không: track_settings).
create table if not exists english.revision_marks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  attempt_id uuid not null references english.attempts(id),
  feedback_id uuid not null references english.feedback_notes(id),
  item_n smallint not null check (item_n between 1 and 3),
  choice text not null check (choice in ('changed', 'kept')),
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 1 and 300),
  created_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, item_n)
);
create index if not exists revision_marks_learner_idx on english.revision_marks(learner_id);

-- Người duyệt đánh giá từng góp ý của bài sửa: improved (Cải thiện thật) / not_yet (Chưa) / reason_ok (Lý do hợp lý). Một lần, không sửa.
create table if not exists english.revision_checks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  attempt_id uuid not null references english.attempts(id),
  item_n smallint not null check (item_n between 1 and 3),
  verdict text not null check (verdict in ('improved', 'not_yet', 'reason_ok')),
  checker_member uuid not null,
  checker_role text not null check (checker_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, item_n)
);
create index if not exists revision_checks_learner_idx on english.revision_checks(learner_id);

drop trigger if exists feedback_notes_forbid_mutation on english.feedback_notes;
create trigger feedback_notes_forbid_mutation
  before update or delete on english.feedback_notes
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists feedback_notes_forbid_truncate on english.feedback_notes;
create trigger feedback_notes_forbid_truncate
  before truncate on english.feedback_notes
  for each statement execute function english.eng_forbid_mutation();
drop trigger if exists revision_marks_forbid_mutation on english.revision_marks;
create trigger revision_marks_forbid_mutation
  before update or delete on english.revision_marks
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists revision_marks_forbid_truncate on english.revision_marks;
create trigger revision_marks_forbid_truncate
  before truncate on english.revision_marks
  for each statement execute function english.eng_forbid_mutation();
drop trigger if exists revision_checks_forbid_mutation on english.revision_checks;
create trigger revision_checks_forbid_mutation
  before update or delete on english.revision_checks
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists revision_checks_forbid_truncate on english.revision_checks;
create trigger revision_checks_forbid_truncate
  before truncate on english.revision_checks
  for each statement execute function english.eng_forbid_mutation();

-- RLS: phụ huynh / gia sư trong phạm vi đọc; học sinh không bao giờ (em đọc qua eng_my_feedback / eng_my_revision). Không ai ghi trực tiếp.
alter table english.feedback_notes enable row level security;
alter table english.revision_marks enable row level security;
alter table english.revision_checks enable row level security;
revoke all on english.feedback_notes, english.revision_marks, english.revision_checks from public, anon, authenticated;
revoke insert, update, delete, truncate on english.feedback_notes, english.revision_marks, english.revision_checks from public, anon, authenticated, service_role;
grant select on english.feedback_notes, english.revision_marks, english.revision_checks to authenticated;
drop policy if exists feedback_notes_select on english.feedback_notes;
create policy feedback_notes_select on english.feedback_notes
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists revision_marks_select on english.revision_marks;
create policy revision_marks_select on english.revision_marks
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists revision_checks_select on english.revision_checks;
create policy revision_checks_select on english.revision_checks
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- 4. Hàm nhỏ dùng chung (nội bộ: chỉ các hàm security definer của file này gọi) -------------------------------------------------------
-- Bài gốc của một chuỗi sửa: đi ngược revises_attempt_id tới bài không sửa bài nào (bài thường trả về chính nó).
create or replace function english.eng_revision_root(p_attempt uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  with recursive up(id, rev, depth) as (
    select a.id, a.revises_attempt_id, 0 from english.attempts a where a.id = p_attempt
    union all
    select a.id, a.revises_attempt_id, u.depth + 1
    from up u join english.attempts a on a.id = u.rev
    where u.depth < 5
  )
  select u.id from up u where u.rev is null order by u.depth desc limit 1
$$;

-- Dòng góp ý còn hiệu lực = chưa bị dòng nào thay.
create or replace function english.eng_feedback_is_live(p_feedback uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from english.feedback_notes s where s.supersedes_id = p_feedback)
$$;

-- Vòng của một bài sửa (1 / 2); NULL nếu không phải bài sửa.
create or replace function english.eng_revision_round(p_attempt uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select f.round::int
  from english.attempts a
  join english.feedback_notes f on f.source_attempt_id = a.revises_attempt_id and f.kind = 'feedback' and f.requires_revision
  where a.id = p_attempt and english.eng_feedback_is_live(f.id)
  limit 1
$$;

-- Con đã bắt đầu sửa theo góp ý này chưa: đã có bản nháp ở bước sửa, hoặc đã nộp bài sửa. Góp ý không yêu cầu sửa → không bao giờ (D10).
create or replace function english.eng_revision_started(p_feedback uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select exists (select 1 from english.attempts t where t.revises_attempt_id = f.source_attempt_id)
        or (f.revision_activity_id is not null
            and exists (select 1 from english.working_drafts d where d.activity_instance_id = f.revision_activity_id and d.learner_id = f.learner_id))
    from english.feedback_notes f where f.id = p_feedback), false)
$$;

-- Góp ý đang chờ con sửa ở một bước sửa (còn hiệu lực, yêu cầu sửa, chưa có bài sửa), hoặc NULL.
create or replace function english.eng_revision_feedback(p_activity uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select f.id from english.feedback_notes f
  where f.revision_activity_id = p_activity and f.kind = 'feedback' and f.requires_revision
    and english.eng_feedback_is_live(f.id)
    and not exists (select 1 from english.attempts t where t.revises_attempt_id = f.source_attempt_id)
  order by f.round desc, f.created_at desc
  limit 1
$$;

-- Spec §3 "Mở mode REVISION": một bước REVISION chỉ làm được trong app khi có góp ý còn hiệu lực yêu cầu sửa (D20).
-- eng_step_supported (0009) giữ nguyên: các đường S4 vẫn từ chối bước REVISION.
create or replace function english.eng_revision_open(p_activity uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select english.eng_revision_feedback(p_activity) is not null
$$;

revoke execute on function english.eng_revision_root(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_feedback_is_live(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_revision_round(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_revision_started(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_revision_feedback(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_revision_open(uuid) from public, anon, authenticated, service_role;

-- 9. Purge: thêm feedback_notes + revision_marks + revision_checks (giữ nguyên mọi dòng của 0020; có test đối chiếu từng dòng).
```

Then append the 0020 purge and preview, and the version line:

```bash
sed -n '542,828p' db/migrations/0020_level_profile.sql >> db/migrations/0021_feedback_revision.sql
printf '\ninsert into english.schema_migrations(version) values (%s) on conflict do nothing;\n' "'0021'" >> db/migrations/0021_feedback_revision.sql
```

Check that the copied block starts with `create or replace function english.eng_purge_learner(` and ends with `grant execute on function english.eng_purge_preview(uuid) to service_role;` (`sed -n '542p;828p' db/migrations/0020_level_profile.sql`).

- [ ] **Step 5: Add the three books to the purge.** Make five exact replacements in `db/migrations/0021_feedback_revision.sql`; each `old` occurs once.

1. `  n_external_results int := 0;` →
```sql
  n_external_results int := 0;
  n_feedback_notes int := 0;
  n_revision_marks int := 0;
  n_revision_checks int := 0;
```
2. `  get diagnostics n_external_results = row_count;` →
```sql
  get diagnostics n_external_results = row_count;

  -- S6: đánh giá bài sửa, đánh dấu của em, góp ý (trỏ tới attempts / activity_instances → xóa TRƯỚC chúng; đánh dấu trỏ tới góp ý).
  delete from english.revision_checks rc where rc.learner_id = p_learner_id;
  get diagnostics n_revision_checks = row_count;

  delete from english.revision_marks rm where rm.learner_id = p_learner_id;
  get diagnostics n_revision_marks = row_count;

  delete from english.feedback_notes fn where fn.learner_id = p_learner_id;
  get diagnostics n_feedback_notes = row_count;
```
3. `      'external_results', n_external_results,` →
```sql
      'external_results', n_external_results,
      'feedback_notes', n_feedback_notes,
      'revision_marks', n_revision_marks,
      'revision_checks', n_revision_checks,
```
4. `      'external_results', (select pg_catalog.count(*) from english.external_results x where x.learner_id = p_learner),` →
```sql
      'external_results', (select pg_catalog.count(*) from english.external_results x where x.learner_id = p_learner),
      'feedback_notes', (select pg_catalog.count(*) from english.feedback_notes x where x.learner_id = p_learner),
      'revision_marks', (select pg_catalog.count(*) from english.revision_marks x where x.learner_id = p_learner),
      'revision_checks', (select pg_catalog.count(*) from english.revision_checks x where x.learner_id = p_learner),
```
5. `-- Đếm trước khi xóa: thêm level_decisions + external_results (giữ nguyên mọi dòng của 0018).` → `-- Đếm trước khi xóa: thêm feedback_notes + revision_marks + revision_checks (giữ nguyên mọi dòng của 0020).`

- [ ] **Step 6: Run the unit test** — `npx vitest run tests/unit/migration0021.test.ts` → PASS (6 tests).

- [ ] **Step 7: Write the failing DB test** — `tests/db/feedbackRevision.test.ts`. Tasks 2–4 replace the marker comment at the end with their sections. The helpers defined here (`write`, `finish`, `reviseAs`, …) call functions from later tasks; ESLint may flag them as unused until then, so run lint at the end of Task 4.

```ts
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { SCORE_WORD_SAMPLES } from "../unit/fixtures/scoreWords";
import { as, asCommit, createAuthUser, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const TODAY = todayVn();
const template = (id: string): InquiryTemplate =>
  JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
/** The due date that releases every step of the template today. */
function dueReleasingAll(id: string): string {
  const t = template(id);
  const last = t.steps.map((s) => s.planned_date ?? "").sort().at(-1) ?? "";
  return addDays(TODAY, daysBetween(last, t.dates.to));
}
/** The due date that releases the template's step `stepNo` today (later steps stay in the future). */
function dueReleasing(id: string, stepNo: number): string {
  const t = template(id);
  return addDays(TODAY, daysBetween(t.steps[stepNo - 1]!.planned_date!, t.dates.to));
}

const TEXT_A = "Some volcanoes explode because the magma is thick. The gas stays inside, so the pressure grows. Other volcanoes let lava flow gently.";
const TEXT_B = "A nightly limit on homework is fair because students need sleep. However, some subjects need more practice than others.";
const ITEMS = [{ text: "Thêm một câu kết cho đoạn văn.", excerpt: "Other volcanoes let lava flow gently." }, { text: "Dùng thêm một từ nối chỉ kết quả." }];

/** S6 (migration 0021): feedback, revision steps, revision attempts, marks, checks, student reads, purge. One database for the file. */
describe("S6 feedback + revision (migration 0021)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const U = () => s.users;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const n = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const student = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const studentRead = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    as(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  let reqSeq = 0;
  const assign = async (who: "an" | "nguyen", tpl: string, due: string) =>
    (await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [s.learners[who], tpl, due, M().parent, `s6-${(reqSeq += 1)}-${tpl}`]))[0]!.id;
  const step = async (instance: string, stepNo: number) =>
    (await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [instance, stepNo]))[0]!.id;
  type Receipt = { attempt_id: string; attempt_no: number; replayed: boolean };
  const submitText = (user: string, activity: string, text: string, provenance = "in_app") =>
    student<Receipt>(user, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], $5) as r", [activity, randomUUID(), JSON.stringify({ text }), ["none"], provenance]);
  const episodeOf = async (attempt: string) => (await q1<{ id: string }>("select id from english.episodes where attempt_id = $1", [attempt]))[0]!.id;

  type Written = { id: string; round: number; revision_activity_id: string | null; replayed: boolean };
  const write = (by: string, attempt: string, o: { praise?: string; items?: unknown; requires?: boolean; supersedes?: string | null; clientId?: string } = {}) =>
    svc<Written>("select english.eng_write_feedback($1, $2, $3::jsonb, $4, $5, $6, $7) as r", [
      attempt, o.praise ?? "Con giải thích rõ vì sao núi lửa phun.", JSON.stringify(o.items ?? ITEMS), o.requires ?? true, o.supersedes ?? null, by, o.clientId ?? randomUUID(),
    ]);
  const reviseAs = (user: string, activity: string, text: string, marks: unknown, o: { clientId?: string; assistance?: string[] } = {}) =>
    student<Receipt>(user, "select english.eng_submit_revision($1, $2, $3, $4::jsonb, $5::text[], 'in_app') as r", [
      activity, o.clientId ?? randomUUID(), text, JSON.stringify(marks), o.assistance ?? ["none"],
    ]);
  const finish = (by: string, attempt: string, o: { action?: string; checks?: unknown; closing?: string | null; praise?: string | null; items?: unknown; clientId?: string } = {}) =>
    svc<{ closing_id: string | null; feedback_id: string | null; replayed: boolean }>(
      "select english.eng_finish_revision($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8) as r",
      [attempt, o.action ?? "close", JSON.stringify(o.checks ?? [{ n: 1, verdict: "improved" }, { n: 2, verdict: "reason_ok" }]), o.closing ?? null,
        o.praise ?? null, o.items === undefined ? null : JSON.stringify(o.items), by, o.clientId ?? randomUUID()],
    );

  let a1: string; // An, A-W1, everything released: step 6 practice writing, step 11 checkpoint writing, step 13 REVISION
  let b1: string; // Nguyên, B-W1, everything released: step 7 writing, step 8 REVISION
  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    a1 = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
    b1 = await assign("nguyen", "B-W1-HOMEWORK", dueReleasingAll("B-W1-HOMEWORK"));
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. books, rules on revision attempts, settings, purge", () => {
    it("score words: the database and the app agree on every shared sample", async () => {
      for (const [text, hit] of SCORE_WORD_SAMPLES) {
        expect((await q1<{ r: boolean }>("select english.eng_has_score_words($1) as r", [text]))[0]?.r, text).toBe(hit);
      }
    });

    it("the books are append-only and service_role cannot insert directly; the tables refuse scores and bad shapes", async () => {
      const att = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const insert = (over: Record<string, unknown> = {}) => {
        const v = { kind: "feedback", praise: "Con viết rõ ý.", items: [{ n: 1, text: "Thêm câu kết." }], requires: false, round: 1, ...over };
        return q1(`insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, requires_revision, author_member, author_role, client_id)
                   values ($1, $2, $2, $3, $4, $5, $6::jsonb, $7, $8, 'tutor', $9)`,
          [s.learners.an, att, v.round, v.kind, v.praise, JSON.stringify(v.items), v.requires, M().tutorAn, randomUUID()]);
      };
      for (const over of [{ praise: "Bài được 3/4" }, { items: [{ n: 1, text: "Sai 2 điểm" }] }, { praise: null }, { items: [] }, { requires: true }, { round: 2 }, { kind: "closing", items: [] }]) {
        await fail(insert(over), "23514");
      }
      await insert(); // a valid row (the RLS test below reads it)
      for (const sql of ["update english.feedback_notes set praise = 'x'", "delete from english.feedback_notes", "truncate english.feedback_notes",
        "delete from english.revision_marks", "truncate english.revision_checks"]) {
        const err = await db.client.query(sql).then(() => null, (e: unknown) => e as { code?: string });
        expect(err?.code, sql).toBe("42501");
      }
      const direct = await asCommit(db.client, "service_role", null, (q) =>
        q(`insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, author_member, author_role, client_id)
           values ($1, $2, $2, 1, 'feedback', 'x', '[{"n":1,"text":"y"}]'::jsonb, $3, 'tutor', 'direct-insert-1')`, [s.learners.an, att, M().tutorAn]))
        .then(() => null, (e: unknown) => e as { code?: string });
      expect(direct?.code).toBe("42501");
    });

    it("a revision attempt must be REVISION, not attempt 1, follow the revised work and stay in its family; its episode is never first", async () => {
      // A fresh instance: steps 11 and 13 of a1 are kept for Task 2 (the template step is reused only when it has no attempt yet).
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const root = (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id;
      const [r] = await q1<{ learning_family_id: string }>("select learning_family_id from english.attempts where id = $1", [root]);
      const act13 = await step(x, 13);
      const ins = (over: Record<string, unknown>) => {
        const v = { id: randomUUID(), no: 9, parent: root, family: r!.learning_family_id, mode: "REVISION", ...over };
        return q1(`insert into english.attempts(id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance, declared_assistance, content_hash, client_submission_id, revises_attempt_id)
                   values ($1, $2, $3, $4, $5, $6, $7, 'in_app', '{none}', $8, $9, $10)`,
          [v.id, act13, s.learners.an, v.no, v.parent, v.family, v.mode, "a".repeat(64), randomUUID(), root]);
      };
      await fail(ins({ mode: "PRACTICE" }), "23514");
      await fail(ins({ no: 1, parent: null }), "23514");
      await fail(ins({ parent: (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id }), "23514");
      const other = (await submitText(U().studentAn, await step(x, 11), TEXT_A)).attempt_id;
      await fail(ins({ family: other }), "23514");
      const ok = randomUUID();
      await ins({ id: ok });
      await fail(q1("insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id) values ($1, $2, true, 'A-W1-VOLCANOES')", [ok, s.learners.an]), "23514");
      await q1("insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id) values ($1, $2, false, 'A-W1-VOLCANOES')", [ok, s.learners.an]);
    });

    it("track settings: A does not require a reason, B does; each track has its A3 target; the table is not readable by app roles", async () => {
      const rows = await q1<{ track_id: string; key: string; value: unknown }>("select track_id, key, value from english.track_settings order by track_id, key");
      expect(rows).toEqual([
        { track_id: "A", key: "revision_reason_required", value: false },
        { track_id: "A", key: "revision_target_key", value: "A-A3-REDRAFT" },
        { track_id: "B", key: "revision_reason_required", value: true },
        { track_id: "B", key: "revision_target_key", value: "B-A3-REVISE" },
      ]);
      for (const role of ["authenticated", "service_role", "anon"]) {
        expect((await q1<{ ok: boolean }>(`select has_table_privilege('${role}', 'english.track_settings', 'select') as ok`))[0]?.ok, role).toBe(false);
      }
    });

    it("RLS: the child's tutor and the parent read the books; the student and the other child's tutor read nothing", async () => {
      const count = async (user: string, t: string) =>
        (await rowsAs<{ n: number }>(db.client, "authenticated", user, `select count(*)::int as n from english.${t} where learner_id = $1`, [s.learners.an]))[0]?.n;
      expect(await count(U().tutorAn, "feedback_notes")).toBeGreaterThan(0);
      expect(await count(U().parent, "feedback_notes")).toBeGreaterThan(0);
      for (const t of ["feedback_notes", "revision_marks", "revision_checks"]) {
        expect(await count(U().studentAn, t), t).toBe(0);
        expect(await count(U().tutorNguyen, t), t).toBe(0);
        expect((await q1<{ ok: boolean }>(`select has_table_privilege('anon', 'english.${t}', 'select') as ok`))[0]?.ok, t).toBe(false);
      }
    });

    it("running every migration again changes nothing", async () => {
      const before = await q1("select (select count(*) from english.feedback_notes)::int as f, (select count(*) from english.track_settings)::int as t");
      await migrate(db.client, true);
      expect(await q1("select (select count(*) from english.feedback_notes)::int as f, (select count(*) from english.track_settings)::int as t")).toEqual(before);
    });
  });

  // (Tasks 2, 3 and 4 add their sections here)
});
```

- [ ] **Step 8: Update the table lists** in `tests/db/migrations.test.ts`:
  - In "RLS is enabled on every english table": replace `"families", "files", "inquiry_instances",` with `"families", "feedback_notes", "files", "inquiry_instances",`, replace `"relationships", "results", "schema_migrations",` with `"relationships", "results", "revision_checks", "revision_marks", "schema_migrations",`, and replace `"test_frames", "tracks", "tutorwork_settings",` with `"test_frames", "track_settings", "tracks", "tutorwork_settings",`.
  - In "authenticated only has SELECT, and only on the readable tables": replace `"exposure_log", "external_results", "families", "files",` with `"exposure_log", "external_results", "families", "feedback_notes", "files",`, and replace `"reading_reports", "recheck_events", "relationships", "results", "skill_domains",` with `"reading_reports", "recheck_events", "relationships", "results", "revision_checks", "revision_marks", "skill_domains",`. `track_settings` is not readable.

- [ ] **Step 9: Run the DB tests** — `npm run test:db -- tests/db/feedbackRevision.test.ts tests/db/migrations.test.ts tests/db/levelProfile.test.ts tests/db/studentWork.test.ts tests/db/review.test.ts` → PASS. 0020's purge tests and the S4/S5 attempt tests still pass, because the change only adds.

- [ ] **Step 10: Commit**

```bash
git add db/migrations/0021_feedback_revision.sql tests/unit/migration0021.test.ts tests/unit/fixtures/scoreWords.ts tests/db/feedbackRevision.test.ts tests/db/migrations.test.ts
git commit -m "feat(s6): migration 0021 part 1 - revision column and rules, track settings, append-only feedback books, purge"
```

---

### Task 2: Migration 0021 part 2 — S5 for revisions (D15, skills) and writing feedback (rounds, edit window, revision step)

**Files:**
- Modify: `db/migrations/0021_feedback_revision.sql` (sections 5 and 6, pasted above `-- 9. Purge:`), `tests/unit/migration0021.test.ts`, `tests/db/feedbackRevision.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; `english.eng_actor_may_manage` (0007); `english.eng_step_effective_date`, `english.eng_clean_text` (0009); `english.eng_today_vn` (0010); `english.eng_current_skill_map`, `english.skill_leaves`, `english.error_tags.group_key` (0019).
- Produces:
  - `english.eng_episode_restricted(p_episode uuid) returns boolean` (internal): the work's own checkpoint or live flag, or the root's when it is a revision.
  - `english.eng_review_role(p_episode uuid, p_member uuid) returns text`, redefined: same answers for ordinary work; a revision of restricted work is tutor-only (D14).
  - `english.eng_episode_targets(p_episode uuid)`, redefined: same columns; a revision also returns the root's skills, ordered after the step's own (ord + 1000).
  - `english.eng_clean_feedback_items(p_items jsonb, p_text text, p_learner uuid) returns jsonb` (internal) → `[{n, text, excerpt?, leaf?: {kind, ref_key}}]`.
  - `english.eng_open_revision_step(p_source_attempt uuid, p_by uuid) returns uuid` (internal; D1–D3).
  - `english.eng_write_feedback(p_source_attempt uuid, p_praise text, p_items jsonb, p_requires_revision boolean, p_supersedes uuid, p_by uuid, p_client_id text) returns jsonb` → `{id, round, revision_activity_id, replayed}` (service_role). Error tags in the message: `(D15)` 42501, `(author_only)` 42501, `(not_found)` P0002, `(not_writing)` / `(praise_required)` / `(score_words)` / `(excerpt_not_found)` / `(unknown_leaf)` / `(max_rounds)` / `(checks_incomplete)` / `(revision_started)` 23514, `(bad_items)` / `(excerpt_too_long)` 22023, `(already_given)` / `(already_superseded)` / `(already_finished)` 23505, a different body under the same client id 23505.

- [ ] **Step 1: Write the failing unit tests** — in `tests/unit/migration0021.test.ts`, replace `  // (Tasks 2, 3 and 4 add their tests here)` with:

```ts
  it("feedback is written by the reviewer of the work (D15), in-app writing only, no scores; rounds and the edit window are in the DB", () => {
    const w = fnText(sql, "eng_write_feedback");
    expect(w).toContain("v_role := english.eng_review_role(v_ep, p_by);");
    for (const tag of ["(not_writing)", "(praise_required)", "(score_words)", "(max_rounds)", "(checks_incomplete)", "(revision_started)", "(author_only)", "(already_given)"]) {
      expect(w, tag).toContain(tag);
    }
    expect(fnText(sql, "eng_open_revision_step")).toContain("-- D1");
    expect(fnText(sql, "eng_clean_feedback_items")).toContain("(excerpt_not_found)");
  });

  it("S5 grows for revisions: D15 follows the root; a revision is scored on its own skill and on the root's skills", () => {
    expect(fnText(sql, "eng_review_role")).toContain("and not english.eng_episode_restricted(e.id) then 'parent'");
    expect(fnText(sql, "eng_episode_targets")).toContain("where at.revises_attempt_id is not null and ra.id = english.eng_revision_root(at.id)");
  });

  it("eng_write_feedback is for service_role only; the helpers for nobody", () => {
    expect(code).toContain("revoke execute on function english.eng_write_feedback(uuid, text, jsonb, boolean, uuid, uuid, text) from public, anon, authenticated;");
    expect(code).toContain("grant execute on function english.eng_write_feedback(uuid, text, jsonb, boolean, uuid, uuid, text) to service_role;");
    for (const f of ["eng_episode_restricted(uuid)", "eng_clean_feedback_items(jsonb, text, uuid)", "eng_open_revision_step(uuid, uuid)"]) {
      expect(code).toContain(`revoke execute on function english.${f} from public, anon, authenticated, service_role;`);
    }
  });

  // (Tasks 3 and 4 add their tests here)
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/migration0021.test.ts` → FAIL (function `eng_write_feedback` not found in the file).

- [ ] **Step 3: Paste sections 5 and 6** into `db/migrations/0021_feedback_revision.sql`, immediately above the line `-- 9. Purge: thêm feedback_notes …`:

```sql
-- 5. S5 cho bài sửa ----------------------------------------------------------------------------------------------------------------------
-- Bài chỉ gia sư duyệt (D15): bài kiểm tra trong buổi hoặc bài quan sát trực tiếp - và từ S6 cả bài sửa của những bài đó (D14).
create or replace function english.eng_episode_restricted(p_episode uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((e.facets ->> 'checkpoint')::boolean, false) or e.observed_directly
         or coalesce((
           select coalesce((re.facets ->> 'checkpoint')::boolean, false) or re.observed_directly
           from english.attempts a
           join english.episodes re on re.attempt_id = english.eng_revision_root(a.id)
           where a.id = e.attempt_id and a.revises_attempt_id is not null), false)
  from english.episodes e
  where e.id = p_episode
$$;
revoke execute on function english.eng_episode_restricted(uuid) from public, anon, authenticated, service_role;

-- Ai được duyệt một episode (D15) - như 0010, chỉ thay "bài bị giới hạn" bằng eng_episode_restricted (bài sửa theo bài gốc).
create or replace function english.eng_review_role(p_episode uuid, p_member uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when m.role = 'tutor' and english.eng_actor_may_manage(m.id, e.learner_id) then 'tutor'
    when m.role = 'parent' and english.eng_actor_may_manage(m.id, e.learner_id)
         and not english.eng_episode_restricted(e.id) then 'parent'
    else null
  end
  from english.episodes e
  join english.members m on m.id = p_member
  where e.id = p_episode
$$;
revoke execute on function english.eng_review_role(uuid, uuid) from public, anon, authenticated, service_role;

-- Kỹ năng chấm được của một episode - như 0010; bài sửa còn có các kỹ năng của bài gốc, xếp sau kỹ năng của bước sửa (3-b, D5).
create or replace function english.eng_episode_targets(p_episode uuid)
returns table (target_key text, ord int, is_target boolean, live_only boolean, scorable boolean)
language sql stable security definer set search_path = ''
as $$
  select u.k, min(u.o)::int,
         bool_or(t.id is not null),
         coalesce(bool_or(not exists (select 1 from pg_catalog.jsonb_array_elements(t.success_criteria) c where c ->> 'method' <> 'tutor_live')), false),
         coalesce(bool_or(t.id is not null
                          and (e.observed_directly
                               or exists (select 1 from pg_catalog.jsonb_array_elements(t.success_criteria) c where c ->> 'method' <> 'tutor_live'))), false)
  from english.episodes e
  join english.attempts at on at.id = e.attempt_id
  join english.activity_instances a on a.id = at.activity_instance_id
  join english.inquiry_instances i on i.id = a.inquiry_instance_id
  cross join lateral (
    select x.k, x.o from unnest(a.target_ids) with ordinality as x(k, o)
    union all
    select y.k, 1000 + y.o
    from english.attempts ra
    join english.activity_instances rai on rai.id = ra.activity_instance_id
    cross join lateral unnest(rai.target_ids) with ordinality as y(k, o)
    where at.revises_attempt_id is not null and ra.id = english.eng_revision_root(at.id)
  ) u(k, o)
  left join english.targets t on t.id = u.k and t.descriptor_version = i.snapshot -> 'template' ->> 'descriptor_version'
  where e.id = p_episode
  group by u.k
$$;
revoke execute on function english.eng_episode_targets(uuid) from public, anon, authenticated, service_role;

-- 6. Góp ý cho con ----------------------------------------------------------------------------------------------------------------------
-- 1–3 góp ý: {text 1..200, không điểm; excerpt? ≤ 120, phải có trong bài (so sau khi làm sạch khoảng trắng / nháy); leaf? = 1 lá của bản đồ
-- hiện hành cho track của em, hoặc nhãn riêng của gia đình đã có nhóm}. Trả mảng chuẩn [{n, text, excerpt?, leaf?}], n = 1..k theo thứ tự.
create or replace function english.eng_clean_feedback_items(p_items jsonb, p_text text, p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_map text := english.eng_current_skill_map();
  v_x jsonb;
  v_i int := 0;
  v_text text;
  v_ex text;
  v_leaf jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) not between 1 and 3 then
    raise exception 'feedback: 1 to 3 items (bad_items)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  for v_x in select x from pg_catalog.jsonb_array_elements(p_items) as x loop
    v_i := v_i + 1;
    if pg_catalog.jsonb_typeof(v_x) <> 'object'
       or exists (select 1 from pg_catalog.jsonb_object_keys(v_x) k where k not in ('text', 'excerpt', 'leaf'))
       or pg_catalog.jsonb_typeof(v_x -> 'text') is distinct from 'string'
       or (v_x ? 'excerpt' and pg_catalog.jsonb_typeof(v_x -> 'excerpt') not in ('string', 'null'))
       or (v_x ? 'leaf' and pg_catalog.jsonb_typeof(v_x -> 'leaf') not in ('object', 'null')) then
      raise exception 'feedback: each item is {text, excerpt?, leaf?} (bad_items)' using errcode = '22023';
    end if;
    v_text := pg_catalog.btrim(v_x ->> 'text');
    if pg_catalog.length(v_text) not between 1 and 200 then
      raise exception 'feedback: each item is 1 to 200 characters (bad_items)' using errcode = '22023';
    end if;
    if english.eng_has_score_words(v_text) then
      raise exception 'feedback: no scores in feedback for the child (score_words)' using errcode = '23514';
    end if;
    v_ex := nullif(pg_catalog.btrim(coalesce(v_x ->> 'excerpt', '')), '');
    if v_ex is not null then
      if pg_catalog.length(v_ex) > 120 then
        raise exception 'feedback: an excerpt is at most 120 characters (excerpt_too_long)' using errcode = '22023';
      end if;
      if pg_catalog.strpos(english.eng_clean_text(p_text), english.eng_clean_text(v_ex)) = 0 then
        raise exception 'feedback: the excerpt is not in the work (excerpt_not_found)' using errcode = '23514';
      end if;
    end if;
    v_leaf := case when pg_catalog.jsonb_typeof(v_x -> 'leaf') = 'object' then v_x -> 'leaf' end;
    if v_leaf is not null then
      if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_leaf)) <> 2
         or coalesce(v_leaf ->> 'kind', '') not in ('tag', 'target') or coalesce(v_leaf ->> 'ref_key', '') = '' then
        raise exception 'feedback: a leaf is {kind, ref_key} (bad_items)' using errcode = '22023';
      end if;
      if not exists (select 1 from english.skill_leaves sl
                     where sl.map_id = v_map and sl.kind = v_leaf ->> 'kind' and sl.track_id = v_l.track_id and sl.ref_key = v_leaf ->> 'ref_key')
         and not (v_leaf ->> 'kind' = 'tag' and exists (
                     select 1 from english.error_tags et
                     where et.family_id = v_l.family_id and et.track_id = v_l.track_id and et.key = v_leaf ->> 'ref_key'
                       and et.group_key is not null and et.retired_at is null)) then
        raise exception 'feedback: the skill is not a leaf of the map for this child (unknown_leaf)' using errcode = '23514';
      end if;
    end if;
    v_out := v_out || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('n', v_i, 'text', v_text)
      || case when v_ex is null then '{}'::jsonb else pg_catalog.jsonb_build_object('excerpt', v_ex) end
      || case when v_leaf is null then '{}'::jsonb
              else pg_catalog.jsonb_build_object('leaf', pg_catalog.jsonb_build_object('kind', v_leaf ->> 'kind', 'ref_key', v_leaf ->> 'ref_key')) end);
  end loop;
  return v_out;
end
$$;
revoke execute on function english.eng_clean_feedback_items(jsonb, text, uuid) from public, anon, authenticated, service_role;

-- Bước sửa cho một bài (spec PA, D1–D3): bước REVISION của chủ đề nếu còn trống, không thì bước sửa riêng (1001+) mở hôm nay.
create or replace function english.eng_open_revision_step(p_source_attempt uuid, p_by uuid) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_src english.attempts%rowtype;
  v_act english.activity_instances%rowtype;
  v_step uuid;
  v_eff date;
  v_no int;
  v_target text;
begin
  select * into v_src from english.attempts t where t.id = p_source_attempt;
  select * into v_act from english.activity_instances a where a.id = v_src.activity_instance_id;

  select a.id into v_step
  from english.activity_instances a
  where a.inquiry_instance_id = v_act.inquiry_instance_id and a.mode = 'REVISION'
    and a.step_no > v_act.step_no and a.step_no <= 1000
    -- D1: không có bước viết nào khác giữa bài và bước sửa (spec "ngay sau"; Spec gap G1).
    and not exists (
      select 1 from english.activity_instances w
      where w.inquiry_instance_id = a.inquiry_instance_id and w.activity_type = 'ACT-WRITE'
        and w.step_no > v_act.step_no and w.step_no < a.step_no)
  order by a.step_no
  limit 1;

  -- D2: chỉ dùng lại khi bước còn trống (chưa có lần nộp nào, chưa là bước sửa của bài khác) và không bị bỏ; dời về hôm nay nếu còn ở tương lai.
  if v_step is not null
     and not exists (select 1 from english.attempts t where t.activity_instance_id = v_step)
     and not exists (select 1 from english.feedback_notes f where f.revision_activity_id = v_step and f.source_attempt_id <> p_source_attempt) then
    v_eff := english.eng_step_effective_date(v_step);
    if v_eff is not null then
      if v_eff > english.eng_today_vn() then
        insert into english.activity_instance_events(activity_instance_id, learner_id, kind, new_date, reason, by_member)
        values (v_step, v_src.learner_id, 'reschedule', english.eng_today_vn(), 'Mở bước sửa bài theo góp ý', p_by);
      end if;
      return v_step;
    end if;
  end if;

  -- D3: bước sửa riêng, sau các bước của mẫu, trên kỹ năng "Sửa bài" (A3) của track. Khóa chủ đề: hai bước tự tạo không trùng số.
  perform 1 from english.inquiry_instances i where i.id = v_act.inquiry_instance_id for no key update;
  select coalesce(max(a.step_no), 1000) + 1 into v_no
  from english.activity_instances a where a.inquiry_instance_id = v_act.inquiry_instance_id and a.step_no > 1000;
  v_target := english.eng_track_setting((select l.track_id from english.learners l where l.id = v_src.learner_id), 'revision_target_key') #>> '{}';
  if v_target is null then
    raise exception 'eng_open_revision_step: the track has no revision skill (revision_target_key)' using errcode = 'P0002';
  end if;
  insert into english.activity_instances(inquiry_instance_id, learner_id, step_no, activity_type, mode, purpose, target_ids, scheduled_for)
  values (v_act.inquiry_instance_id, v_src.learner_id, v_no, 'ACT-REVISE', 'REVISION', '{}', array[v_target], english.eng_today_vn())
  returning id into v_step;
  return v_step;
end
$$;
revoke execute on function english.eng_open_revision_step(uuid, uuid) from public, anon, authenticated, service_role;

-- Gửi / sửa góp ý cho một bài (người duyệt bài đó - Q1, D15). p_supersedes = dòng đang hiệu lực khi "Sửa góp ý" (1-c).
-- Vòng 2 (bài nguồn là bài sửa vòng 1) chỉ đi qua eng_finish_revision ("Mở vòng 2"), sau khi đã đánh giá đủ mọi góp ý.
create or replace function english.eng_write_feedback(
  p_source_attempt uuid,
  p_praise text,
  p_items jsonb,
  p_requires_revision boolean,
  p_supersedes uuid,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_src english.attempts%rowtype;
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_ep uuid;
  v_role text;
  v_kind text;
  v_text text;
  v_praise text := pg_catalog.btrim(coalesce(p_praise, ''));
  v_items jsonb;
  v_round int := 1;
  v_root uuid;
  v_prev_round english.feedback_notes%rowtype;
  v_old english.feedback_notes%rowtype;
  v_prev english.feedback_notes%rowtype;
  v_rev uuid;
  v_id uuid;
begin
  if p_source_attempt is null or p_items is null or p_requires_revision is null or p_by is null or p_client_id is null then
    raise exception 'eng_write_feedback: work, items, requires_revision, actor and client id are required' using errcode = '22004';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_write_feedback: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select * into v_src from english.attempts t where t.id = p_source_attempt;
  if not found then
    raise exception 'eng_write_feedback: work not found (not_found)' using errcode = 'P0002';
  end if;
  -- Khóa bước của bài: hai người góp ý cùng lúc cho một bài xếp hàng.
  perform 1 from english.activity_instances a where a.id = v_src.activity_instance_id for no key update;
  select * into v_l from english.learners l where l.id = v_src.learner_id;
  select * into v_member from english.members m where m.id = p_by;
  select e.id into v_ep from english.episodes e where e.attempt_id = v_src.id;

  v_role := english.eng_review_role(v_ep, p_by);
  if v_role is null then
    raise exception 'eng_write_feedback: this member may not give feedback on this work (D15)' using errcode = '42501';
  end if;

  -- Q4 / D8: bài viết làm trong app.
  select av.kind, av.content ->> 'text' into v_kind, v_text
  from english.artifact_versions av where av.attempt_id = v_src.id order by av.version limit 1;
  if v_kind is distinct from 'text' or v_text is null or v_src.provenance not in ('in_app', 'pasted') then
    raise exception 'eng_write_feedback: feedback is for writing done in the app (not_writing)' using errcode = '23514';
  end if;

  if pg_catalog.length(v_praise) not between 1 and 160 then
    raise exception 'eng_write_feedback: one specific praise of 1 to 160 characters (praise_required)' using errcode = '23514';
  end if;
  if english.eng_has_score_words(v_praise) then
    raise exception 'eng_write_feedback: no scores in feedback for the child (score_words)' using errcode = '23514';
  end if;
  v_items := english.eng_clean_feedback_items(p_items, v_text, v_l.id);

  -- Gửi lại (mạng chập chờn): cùng client_id + cùng nội dung + cùng người → trả lại dòng cũ; khác → 23505.
  select * into v_old from english.feedback_notes f where f.learner_id = v_l.id and f.client_id = p_client_id;
  if found then
    if v_old.kind = 'feedback' and v_old.source_attempt_id = p_source_attempt and v_old.praise = v_praise and v_old.items = v_items
       and v_old.requires_revision = p_requires_revision and v_old.supersedes_id is not distinct from p_supersedes and v_old.author_member = p_by then
      return pg_catalog.jsonb_build_object('id', v_old.id, 'round', v_old.round, 'revision_activity_id', v_old.revision_activity_id, 'replayed', true);
    end if;
    raise exception 'eng_write_feedback: this client id was already used for other feedback' using errcode = '23505';
  end if;

  -- Vòng (2-a): 1 cho bài gốc; 2 cho bài sửa vòng 1, luôn yêu cầu sửa, sau khi đã đánh giá đủ mọi góp ý; không bao giờ 3.
  v_root := english.eng_revision_root(v_src.id);
  if v_src.revises_attempt_id is not null then
    select f.* into v_prev_round from english.feedback_notes f
    where f.source_attempt_id = v_src.revises_attempt_id and f.kind = 'feedback' and english.eng_feedback_is_live(f.id);
    v_round := coalesce(v_prev_round.round, 2) + 1;
    if v_round > 2 then
      raise exception 'eng_write_feedback: at most 2 rounds of revision (max_rounds)' using errcode = '23514';
    end if;
    if not p_requires_revision then
      raise exception 'eng_write_feedback: a second round always asks for a revision; a closing note goes with Xong (bad_items)' using errcode = '22023';
    end if;
    if exists (select 1 from english.feedback_notes c where c.source_attempt_id = v_src.id and c.kind = 'closing') then
      raise exception 'eng_write_feedback: this revision was already closed (already_finished)' using errcode = '23505';
    end if;
    if exists (select 1 from pg_catalog.jsonb_array_elements(v_prev_round.items) x
               where not exists (select 1 from english.revision_checks c where c.attempt_id = v_src.id and c.item_n = (x ->> 'n')::int)) then
      raise exception 'eng_write_feedback: give a verdict on every item first (checks_incomplete)' using errcode = '23514';
    end if;
  end if;

  if p_supersedes is null then
    if exists (select 1 from english.feedback_notes f where f.source_attempt_id = p_source_attempt and f.kind = 'feedback') then
      raise exception 'eng_write_feedback: this work already has feedback; edit it instead (already_given)' using errcode = '23505';
    end if;
  else
    -- 1-c: sửa = dòng mới thay dòng đang hiệu lực, cùng bài, cùng người gửi, khi con chưa bắt đầu sửa.
    select f.* into v_prev from english.feedback_notes f
    where f.id = p_supersedes and f.source_attempt_id = p_source_attempt and f.kind = 'feedback';
    if not found then
      raise exception 'eng_write_feedback: the feedback to edit was not found (not_found)' using errcode = 'P0002';
    end if;
    if v_prev.author_member <> p_by then
      raise exception 'eng_write_feedback: only the author may edit feedback (author_only)' using errcode = '42501';
    end if;
    if not english.eng_feedback_is_live(v_prev.id) then
      raise exception 'eng_write_feedback: this feedback was already edited (already_superseded)' using errcode = '23505';
    end if;
    if english.eng_revision_started(v_prev.id) then
      raise exception 'eng_write_feedback: the child already started the revision (revision_started)' using errcode = '23514';
    end if;
  end if;

  -- Bước sửa: bước mà góp ý của bài này đã mở trước đó (mọi bản); vòng 2 dùng lại bước của vòng 1 (D7); không thì mở bước (D1–D3).
  if p_requires_revision then
    v_rev := coalesce(
      (select f.revision_activity_id from english.feedback_notes f
       where f.source_attempt_id = p_source_attempt and f.kind = 'feedback' and f.revision_activity_id is not null
       order by f.created_at desc limit 1),
      v_prev_round.revision_activity_id,
      english.eng_open_revision_step(p_source_attempt, p_by));
  end if;

  insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, requires_revision,
                                     revision_activity_id, supersedes_id, author_member, author_role, client_id)
  values (v_l.id, p_source_attempt, v_root, v_round, 'feedback', v_praise, v_items, p_requires_revision,
          v_rev, p_supersedes, p_by, v_role, p_client_id)
  returning id into v_id;

  -- Nhật ký: không chép chữ góp ý (chỉ số góp ý, vòng, có yêu cầu sửa không).
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, case when p_supersedes is null then 'feedback.given' else 'feedback.edited' end, v_l.family_id, v_l.id,
          pg_catalog.jsonb_build_object('feedback', v_id, 'attempt', p_source_attempt, 'round', v_round, 'items', pg_catalog.jsonb_array_length(v_items),
                                        'requires_revision', p_requires_revision, 'supersedes', p_supersedes));
  return pg_catalog.jsonb_build_object('id', v_id, 'round', v_round, 'revision_activity_id', v_rev, 'replayed', false);
end
$$;
revoke execute on function english.eng_write_feedback(uuid, text, jsonb, boolean, uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_write_feedback(uuid, text, jsonb, boolean, uuid, uuid, text) to service_role;
```

- [ ] **Step 4: Run the unit test** — `npx vitest run tests/unit/migration0021.test.ts` → PASS (9 tests).

- [ ] **Step 5: Write the failing DB tests** — in `tests/db/feedbackRevision.test.ts`, replace `  // (Tasks 2, 3 and 4 add their sections here)` with:

```ts
  describe("2. giving feedback (eng_write_feedback) and opening the revision step", () => {
    it("who: the child's tutor and the parent on ordinary work; on in-session tests only the tutor (D15); nobody outside; never a student", async () => {
      const work = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      await fail(write(M().tutorNguyen, work), "42501", /\(D15\)/);
      await fail(student(U().studentAn, "select english.eng_write_feedback($1, 'x', '[]'::jsonb, true, null, $2, 'client-0001') as r", [work, M().studentAn]), "42501");
      expect((await write(M().parent, work, { requires: false })).round).toBe(1);
      const check = (await submitText(U().studentAn, await step(a1, 11), TEXT_A)).attempt_id; // A-W1 step 11 = checkpoint
      await fail(write(M().parent, check), "42501", /\(D15\)/);
      const r = await write(M().tutorAn, check);
      expect(r.revision_activity_id).toBe(await step(a1, 13)); // D1: 11 → (12 self-review) → 13
    });

    it("only in-app writing (D8): paper work and answer-shaped steps are refused", async () => {
      const paper = await svc<{ attempt_id: string }>(
        "select english.eng_record_offline_attempt($1, 'manual_import', $2, null, null, $3::date, '{none}'::text[], $4, $5) as r",
        [await step(a1, 6), TEXT_A, TODAY, M().tutorAn, randomUUID()]);
      await fail(write(M().tutorAn, paper.attempt_id), "23514", /\(not_writing\)/);
      const reading = (await student<Receipt>(U().studentAn, "select english.eng_submit_attempt($1, $2, $3::jsonb, '{none}', 'in_app') as r",
        [await step(a1, 3), randomUUID(), JSON.stringify({ answers: { "W1-R2": "Melted rock." } })])).attempt_id;
      await fail(write(M().tutorAn, reading), "23514", /\(not_writing\)/);
    });

    it("praise is required, 1-3 items, no scores, the excerpt must be in the work, the leaf must be in the map", async () => {
      const work = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      await fail(write(M().tutorAn, work, { praise: "  " }), "23514", /\(praise_required\)/);
      await fail(write(M().tutorAn, work, { praise: "Bài được 3/4" }), "23514", /\(score_words\)/);
      await fail(write(M().tutorAn, work, { items: [{ text: "Đúng 80%" }] }), "23514", /\(score_words\)/);
      await fail(write(M().tutorAn, work, { items: [] }), "22023", /\(bad_items\)/);
      await fail(write(M().tutorAn, work, { items: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }] }), "22023", /\(bad_items\)/);
      await fail(write(M().tutorAn, work, { items: [{ text: "Sửa câu này.", excerpt: "This sentence is not in the work." }] }), "23514", /\(excerpt_not_found\)/);
      await fail(write(M().tutorAn, work, { items: [{ text: "Sửa.", leaf: { kind: "tag", ref_key: "no-such-tag" } }] }), "23514", /\(unknown_leaf\)/);
      const [leaf] = await q1<{ kind: string; ref_key: string }>(
        "select kind, ref_key from english.skill_leaves where map_id = english.eng_current_skill_map() and track_id = 'A' order by group_key, ord limit 1");
      // spacing and curly quotes do not matter for the excerpt; the stored excerpt is the trimmed one
      const ok = await write(M().tutorAn, work, { items: [{ text: "Thêm câu kết.", excerpt: "  Other volcanoes   let lava flow gently. ", leaf }] });
      const [row] = await q1<{ items: unknown }>("select items from english.feedback_notes where id = $1", [ok.id]);
      expect(row?.items).toEqual([{ n: 1, text: "Thêm câu kết.", excerpt: "Other volcanoes   let lava flow gently.", leaf: { kind: leaf!.kind, ref_key: leaf!.ref_key } }]);
    });

    it("one live feedback per work; a replay returns the same row; edits only by the author, only the live row, only before the child starts", async () => {
      const work = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const first = await write(M().tutorAn, work, { clientId: "feedback-replay-1" });
      expect(first).toMatchObject({ round: 1, replayed: false });
      expect(await write(M().tutorAn, work, { clientId: "feedback-replay-1" })).toMatchObject({ id: first.id, replayed: true });
      await fail(write(M().tutorAn, work, { clientId: "feedback-replay-1", praise: "Khác" }), "23505");
      await fail(write(M().tutorAn, work), "23505", /\(already_given\)/);
      await fail(write(M().parent, work, { supersedes: first.id }), "42501", /\(author_only\)/);
      const second = await write(M().tutorAn, work, { supersedes: first.id, items: [{ text: "Chỉ một góp ý thôi." }] });
      expect(second.revision_activity_id).toBe(first.revision_activity_id); // the same revision step
      await fail(write(M().tutorAn, work, { supersedes: first.id }), "23505", /\(already_superseded\)/);
      // the child saves a first draft of the revision: from then on the feedback can no longer be edited
      await q1("insert into english.working_drafts(activity_instance_id, learner_id, content) values ($1, $2, '{}'::jsonb)", [second.revision_activity_id, s.learners.an]);
      await fail(write(M().tutorAn, work, { supersedes: second.id }), "23514", /\(revision_started\)/);
    });

    it("revision step: the template step is reused (and opened today if dated later); otherwise the app adds step 1001, 1002 on the track's A3 skill", async () => {
      // A-W1 step 6: step 11 (writing) lies between 6 and 13 → a step of its own
      const w6a = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const r6a = await write(M().tutorAn, w6a);
      const w6b = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const r6b = await write(M().tutorAn, w6b);
      const own = await q1<{ step_no: number; activity_type: string; mode: string; target_ids: string[]; scheduled_for: string }>(
        "select step_no, activity_type, mode, target_ids, scheduled_for::text from english.activity_instances where id = any($1::uuid[]) order by step_no",
        [[r6a.revision_activity_id, r6b.revision_activity_id]]);
      expect(own.map((o) => o.step_no)).toEqual([own[0]!.step_no, own[0]!.step_no + 1]);
      expect(own[0]!.step_no).toBeGreaterThan(1000);
      expect(own[0]).toMatchObject({ activity_type: "ACT-REVISE", mode: "REVISION", target_ids: ["A-A3-REDRAFT"], scheduled_for: TODAY });
      // B-W1 with only step 7 released: step 8 (REVISION, dated tomorrow) is reused and opened today
      const b = await assign("nguyen", "B-W1-HOMEWORK", dueReleasing("B-W1-HOMEWORK", 7));
      const step8 = await step(b, 8);
      expect((await q1<{ ok: boolean }>("select english.eng_activity_released($1) as ok", [step8]))[0]?.ok).toBe(false);
      const wb = (await submitText(U().studentNguyen, await step(b, 7), TEXT_B)).attempt_id;
      expect((await write(M().tutorNguyen, wb, { items: [{ text: "Nêu rõ hơn lý do thứ hai." }] })).revision_activity_id).toBe(step8);
      expect((await q1<{ ok: boolean }>("select english.eng_activity_released($1) as ok", [step8]))[0]?.ok).toBe(true);
      expect(await n("select count(*)::int as n from english.activity_instance_events where activity_instance_id = $1 and kind = 'reschedule'", [step8])).toBe(1);
      // the fully released B-W1: its step 8 is free and already open
      const wb2 = (await submitText(U().studentNguyen, await step(b1, 7), TEXT_B)).attempt_id;
      const rb2 = await write(M().tutorNguyen, wb2, { items: [{ text: "Thêm phản biện." }] });
      expect(rb2.revision_activity_id).toBe(await step(b1, 8)); // B-W1 7 → 8 (the next step)
    });

    it("'Chỉ góp ý' opens no step; the S4 paths still refuse a REVISION step; eng_revision_open follows the live feedback", async () => {
      const work = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const note = await write(M().tutorAn, work, { requires: false });
      expect(note.revision_activity_id).toBeNull();
      const work2 = (await submitText(U().studentAn, await step(a1, 6), TEXT_A)).attempt_id;
      const rev = (await write(M().tutorAn, work2)).revision_activity_id!;
      expect((await q1<{ ok: boolean }>("select english.eng_revision_open($1) as ok", [rev]))[0]?.ok).toBe(true);
      await fail(student(U().studentAn, "select english.eng_save_draft($1, '{\"text\":\"x\"}'::jsonb) as r", [rev]), "22023");
      await fail(student(U().studentAn, "select english.eng_submit_attempt($1, $2, '{\"text\":\"x\"}'::jsonb, '{none}', 'in_app') as r", [rev, randomUUID()]), "22023");
    });
  });

  // (Tasks 3 and 4 add their sections here)
```

- [ ] **Step 6: Run** — `npm run test:db -- tests/db/feedbackRevision.test.ts tests/db/review.test.ts tests/db/reviewHardening.test.ts` → PASS. The S5 tests stay green, because `eng_review_role` and `eng_episode_targets` answer the same for ordinary work.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0021_feedback_revision.sql tests/unit/migration0021.test.ts tests/db/feedbackRevision.test.ts
git commit -m "feat(s6): migration 0021 part 2 - D15 and skills follow the root of a revision, eng_write_feedback with rounds, edit window and revision step"
```

---

### Task 3: Migration 0021 part 3 — the child's side: read feedback, draft, submit the revision (first = false, same family, marks)

**Files:**
- Modify: `db/migrations/0021_feedback_revision.sql` (section 7, pasted above `-- 9. Purge:`), `tests/unit/migration0021.test.ts`, `tests/db/feedbackRevision.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `english.eng_activity_released`, `english.eng_clean_text` (0009); `english.working_drafts` (0009).
- Produces (all `authenticated` only; the caller is found by `auth.uid()`, staff and other children get `null` / an empty list / an error):
  - `english.eng_clean_revision_marks(p_marks jsonb, p_items jsonb, p_reason_required boolean, p_unchanged boolean) returns jsonb` (internal) → `[{n, choice, reason}]`; errors `(marks_incomplete)` / `(reason_required)` / `(unchanged_needs_reason)` 23514, `(reason_too_long)` 22023.
  - `english.eng_my_feedback() returns jsonb` → `{items: [{feedback_id, activity_id, title_vi, round, items_count, state: "todo"|"submitted"|"seen"|"note", seen_at, closing_note, praise (notes only), notes (notes only: [{n, text, excerpt}])}]}`. The order is todo, then submitted, then the rest, newest first. "seen" and "note" rows are kept for 14 days (D10, D12).
  - `english.eng_my_revision(p_activity uuid) returns jsonb` → `{activity_id, instance_id, title_vi, big_question_en, round, praise, items: [{n, text, excerpt}], old_text, reason_required, state: "todo"|"submitted"|"seen", submitted_at, closing_note, draft: {content, revision, updated_at} | null}`, or `null`.
  - `english.eng_save_revision_draft(p_activity uuid, p_content jsonb, p_base_revision int default null) returns jsonb` → `{revision, saved_at, other_tab_changed}`. Content is `{text?, marks?: {"1".."3": {choice?, reason?}}, pasted?, assistance?}`. Errors: `(revision_not_open)` 22023, bad content 22023, not theirs P0002.
  - `english.eng_submit_revision(p_activity uuid, p_client_id uuid, p_text text, p_marks jsonb, p_assistance text[], p_provenance text) returns jsonb` → the receipt `{attempt_id, attempt_no, submitted_at, hash, replayed}`. Errors: `(revision_not_open)` 22023, `(already_submitted)` 23505, mark errors as above, a different body under the same client id 23505.

- [ ] **Step 1: Write the failing unit tests** — in `tests/unit/migration0021.test.ts`, replace `  // (Tasks 3 and 4 add their tests here)` with:

```ts
  it("the child's functions are for authenticated only and return no score, observation, decision, verdict or leaf", () => {
    for (const sig of ["eng_my_feedback()", "eng_my_revision(uuid)", "eng_save_revision_draft(uuid, jsonb, int)", "eng_submit_revision(uuid, uuid, text, jsonb, text[], text)"]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, service_role;`);
      expect(code).toContain(`grant execute on function english.${sig} to authenticated;`);
    }
    for (const fn of ["eng_my_feedback", "eng_my_revision"]) {
      const body = fnText(sql, fn);
      for (const bad of ["observations", "validation_decisions", "revision_checks", "'leaf'", "score"]) expect(body, `${fn}: ${bad}`).not.toContain(bad);
      expect(body).toContain("m.user_id = auth.uid() and m.role = 'student'");
    }
  });

  it("a submitted revision is never first, stays in the root's family, follows the revised work, and is marked as supported", () => {
    const body = fnText(sql, "eng_submit_revision");
    expect(body).toContain("values (v_id, p_activity, v_act.learner_id, v_no, v_src.id, v_src.learning_family_id, 'REVISION', p_provenance, v_assist, v_at, v_hash, p_client_id, v_src.id);");
    expect(body).toContain("values (v_id, v_act.learner_id, false, v_context, false,");
    expect(body).toContain("'revision', true");
    expect(body).toContain("'tutor_prompt', null, v_targets, 'observed'");
    expect(body).toContain("english.eng_track_setting(v_l.track_id, 'revision_reason_required')");
  });

  // (Task 4 adds its tests here)
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/migration0021.test.ts` → FAIL (`eng_my_feedback` not found).

- [ ] **Step 3: Paste section 7** into `db/migrations/0021_feedback_revision.sql`, immediately above `-- 9. Purge: …`:

```sql
-- 7. Phía em: đọc góp ý, nháp, nộp bài sửa ------------------------------------------------------------------------------------------
-- Đánh dấu của em cho đúng các góp ý của vòng: {"1": {choice, reason?}, …} → [{n, choice, reason}] theo thứ tự góp ý.
-- Lý do bắt buộc khi track yêu cầu (Q3); bài không đổi chữ nào → mọi góp ý phải là "Giữ nguyên" có lý do (spec §2.4).
create or replace function english.eng_clean_revision_marks(p_marks jsonb, p_items jsonb, p_reason_required boolean, p_unchanged boolean) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_item jsonb;
  v_n int;
  v_m jsonb;
  v_choice text;
  v_reason text;
  v_out jsonb := '[]'::jsonb;
begin
  if p_marks is null or pg_catalog.jsonb_typeof(p_marks) <> 'object'
     or exists (select 1 from pg_catalog.jsonb_object_keys(p_marks) k
                where not exists (select 1 from pg_catalog.jsonb_array_elements(p_items) x where x ->> 'n' = k)) then
    raise exception 'revision: one mark per feedback item (marks_incomplete)' using errcode = '23514';
  end if;
  for v_item in select x from pg_catalog.jsonb_array_elements(p_items) x order by (x ->> 'n')::int loop
    v_n := (v_item ->> 'n')::int;
    v_m := p_marks -> (v_n::text);
    if v_m is null or pg_catalog.jsonb_typeof(v_m) <> 'object'
       or exists (select 1 from pg_catalog.jsonb_object_keys(v_m) k where k not in ('choice', 'reason'))
       or coalesce(v_m ->> 'choice', '') not in ('changed', 'kept') then
      raise exception 'revision: mark every item "changed" or "kept" (marks_incomplete)' using errcode = '23514';
    end if;
    if v_m ? 'reason' and pg_catalog.jsonb_typeof(v_m -> 'reason') not in ('string', 'null') then
      raise exception 'revision: a reason is text (marks_incomplete)' using errcode = '23514';
    end if;
    v_choice := v_m ->> 'choice';
    v_reason := nullif(pg_catalog.btrim(coalesce(v_m ->> 'reason', '')), '');
    if v_reason is not null and pg_catalog.length(v_reason) > 300 then
      raise exception 'revision: a reason is at most 300 characters (reason_too_long)' using errcode = '22023';
    end if;
    if p_reason_required and v_reason is null then
      raise exception 'revision: a reason is needed for every item (reason_required)' using errcode = '23514';
    end if;
    if p_unchanged and (v_choice <> 'kept' or v_reason is null) then
      raise exception 'revision: the text did not change, so every item is "kept" with a reason (unchanged_needs_reason)' using errcode = '23514';
    end if;
    v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('n', v_n, 'choice', v_choice, 'reason', v_reason));
  end loop;
  return v_out;
end
$$;
revoke execute on function english.eng_clean_revision_marks(jsonb, jsonb, boolean, boolean) from public, anon, authenticated, service_role;

-- Trang chủ của em: các góp ý còn hiệu lực. Chỉ câu khen / góp ý / trích đoạn (với "Chỉ góp ý"), số góp ý, trạng thái và nhận xét kết.
-- KHÔNG điểm, quan sát, quyết định, đánh giá từng góp ý, lá kỹ năng. "Đã xem" và "Chỉ góp ý" giữ 14 ngày (D10, D12).
create or replace function english.eng_my_feedback() returns jsonb
language sql stable security definer set search_path = ''
as $$
  with me as (
    select l.id from english.members m join english.learners l on l.member_id = m.id
    where m.user_id = auth.uid() and m.role = 'student'
  ),
  fb as (
    select f.id, f.created_at, f.round, f.requires_revision, f.praise, f.items,
           coalesce(f.revision_activity_id, sa.activity_instance_id) as activity_id,
           i.snapshot -> 'template' ->> 'title_vi' as title_vi,
           rv.id as revision_id,
           (select c.praise from english.feedback_notes c where c.source_attempt_id = rv.id and c.kind = 'closing') as closing_note,
           (select min(x.created_at) from english.feedback_notes x where x.source_attempt_id = rv.id) as seen_at
    from english.feedback_notes f
    join me on me.id = f.learner_id
    join english.attempts sa on sa.id = f.source_attempt_id
    join english.activity_instances a on a.id = sa.activity_instance_id
    join english.inquiry_instances i on i.id = a.inquiry_instance_id
    left join lateral (
      select t.id from english.attempts t where t.revises_attempt_id = f.source_attempt_id order by t.submitted_at limit 1) rv on true
    where f.kind = 'feedback' and english.eng_feedback_is_live(f.id)
  ),
  st as (
    select fb.*, case when not fb.requires_revision then 'note'
                      when fb.revision_id is null then 'todo'
                      when fb.seen_at is null then 'submitted'
                      else 'seen' end as state
    from fb
  )
  select pg_catalog.jsonb_build_object('items', coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'feedback_id', r.id,
      'activity_id', r.activity_id,
      'title_vi', r.title_vi,
      'round', r.round,
      'items_count', pg_catalog.jsonb_array_length(r.items),
      'state', r.state,
      'seen_at', r.seen_at,
      'closing_note', r.closing_note,
      'praise', case when r.state = 'note' then r.praise end,
      'notes', case when r.state = 'note' then (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', (x ->> 'n')::int, 'text', x ->> 'text', 'excerpt', x ->> 'excerpt')
                                    order by (x ->> 'n')::int)
        from pg_catalog.jsonb_array_elements(r.items) x) end)
    order by case r.state when 'todo' then 0 when 'submitted' then 1 else 2 end, r.created_at desc), '[]'::jsonb))
  from st r
  where r.state in ('todo', 'submitted')
     or coalesce(r.seen_at, case when r.state = 'note' then r.created_at end) >= pg_catalog.now() - pg_catalog.make_interval(days => 14)
$$;

-- Màn sửa bài của em (một bước REVISION đã mở, có góp ý còn hiệu lực yêu cầu sửa): câu khen, góp ý đánh số + trích đoạn, bài cũ của chính em,
-- lý do có bắt buộc không, trạng thái, nhận xét kết, bản nháp. NULL nếu không phải của em / chưa mở / không có góp ý.
create or replace function english.eng_my_revision(p_activity uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_act english.activity_instances%rowtype;
  v_f english.feedback_notes%rowtype;
  v_inst english.inquiry_instances%rowtype;
  v_old text;
  v_sub english.attempts%rowtype;
  v_draft jsonb;
  v_seen timestamptz;
begin
  select l.* into v_l from english.members m join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if not found then return null; end if;
  select a.* into v_act from english.activity_instances a where a.id = p_activity and a.learner_id = v_l.id and a.mode = 'REVISION';
  if not found or not english.eng_activity_released(p_activity) then return null; end if;
  select f.* into v_f from english.feedback_notes f
  where f.revision_activity_id = p_activity and f.kind = 'feedback' and f.requires_revision and english.eng_feedback_is_live(f.id)
  order by f.round desc, f.created_at desc limit 1;
  if not found then return null; end if;
  select * into v_inst from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  select av.content ->> 'text' into v_old from english.artifact_versions av where av.attempt_id = v_f.source_attempt_id order by av.version limit 1;
  select t.* into v_sub from english.attempts t where t.revises_attempt_id = v_f.source_attempt_id order by t.submitted_at limit 1;
  if v_sub.id is null then
    select pg_catalog.jsonb_build_object('content', d.content, 'revision', d.revision, 'updated_at', d.updated_at) into v_draft
    from english.working_drafts d where d.activity_instance_id = p_activity and d.learner_id = v_l.id;
  else
    select min(x.created_at) into v_seen from english.feedback_notes x where x.source_attempt_id = v_sub.id;
  end if;
  return pg_catalog.jsonb_build_object(
    'activity_id', v_act.id,
    'instance_id', v_inst.id,
    'title_vi', v_inst.snapshot -> 'template' ->> 'title_vi',
    'big_question_en', v_inst.snapshot -> 'template' ->> 'big_question_en',
    'round', v_f.round,
    'praise', v_f.praise,
    'items', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', (x ->> 'n')::int, 'text', x ->> 'text', 'excerpt', x ->> 'excerpt')
                                          order by (x ->> 'n')::int)
              from pg_catalog.jsonb_array_elements(v_f.items) x),
    'old_text', v_old,
    'reason_required', coalesce(english.eng_track_setting(v_l.track_id, 'revision_reason_required') = 'true'::jsonb, false),
    'state', case when v_sub.id is null then 'todo' when v_seen is null then 'submitted' else 'seen' end,
    'submitted_at', v_sub.submitted_at,
    'closing_note', (select c.praise from english.feedback_notes c where c.source_attempt_id = v_sub.id and c.kind = 'closing'),
    'draft', v_draft);
end
$$;

-- Nháp tự lưu của bài sửa (cùng bảng working_drafts, cùng cảnh báo "tab khác vừa lưu" như eng_save_draft). Chỉ khi bước sửa đang mở.
create or replace function english.eng_save_revision_draft(p_activity uuid, p_content jsonb, p_base_revision int default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member uuid;
  v_role text;
  v_act english.activity_instances%rowtype;
  v_cur int;
  v_rev int;
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'eng_save_revision_draft: not signed in' using errcode = '42501';
  end if;
  select m.id, m.role into v_member, v_role from english.members m where m.user_id = v_uid;
  if v_member is null then
    raise exception 'eng_save_revision_draft: activity not found' using errcode = 'P0002';
  end if;
  if v_role <> 'student' then
    raise exception 'eng_save_revision_draft: only the learner may save a draft' using errcode = '42501';
  end if;
  select a.* into v_act from english.activity_instances a join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member and a.mode = 'REVISION'
  for no key update of a;
  if not found or not english.eng_activity_released(p_activity) then
    raise exception 'eng_save_revision_draft: activity not found' using errcode = 'P0002';
  end if;
  if not english.eng_revision_open(p_activity) then
    raise exception 'eng_save_revision_draft: there is no revision to do on this step (revision_not_open)' using errcode = '22023';
  end if;

  if p_content is null or pg_catalog.jsonb_typeof(p_content) <> 'object' or pg_catalog.length(p_content::text) > 200000
     or exists (select 1 from pg_catalog.jsonb_object_keys(p_content) k where k not in ('text', 'marks', 'pasted', 'assistance'))
     or (p_content ? 'text' and (pg_catalog.jsonb_typeof(p_content -> 'text') <> 'string' or pg_catalog.length(p_content ->> 'text') > 20000))
     or (p_content ? 'pasted' and pg_catalog.jsonb_typeof(p_content -> 'pasted') <> 'boolean')
     or (p_content ? 'assistance' and (pg_catalog.jsonb_typeof(p_content -> 'assistance') <> 'array'
         or exists (select 1 from pg_catalog.jsonb_array_elements(p_content -> 'assistance') x
                    where pg_catalog.jsonb_typeof(x) <> 'string' or (x #>> '{}') not in ('none', 'notes', 'dictionary', 'asked_someone', 'ai_outside'))))
     or (p_content ? 'marks' and (pg_catalog.jsonb_typeof(p_content -> 'marks') <> 'object'
         or exists (select 1 from pg_catalog.jsonb_each(p_content -> 'marks') kv
                    where kv.key !~ '^[1-3]$' or pg_catalog.jsonb_typeof(kv.value) <> 'object'
                       or exists (select 1 from pg_catalog.jsonb_object_keys(kv.value) k2 where k2 not in ('choice', 'reason'))
                       or (kv.value ? 'choice' and coalesce(kv.value ->> 'choice', '') not in ('changed', 'kept'))
                       or (kv.value ? 'reason' and (pg_catalog.jsonb_typeof(kv.value -> 'reason') <> 'string'
                                                    or pg_catalog.length(kv.value ->> 'reason') > 300))))) then
    raise exception 'eng_save_revision_draft: the draft is {text, marks, pasted, assistance}' using errcode = '22023';
  end if;

  select d.revision into v_cur from english.working_drafts d where d.activity_instance_id = p_activity and d.learner_id = v_act.learner_id;
  insert into english.working_drafts as d(activity_instance_id, learner_id, content, revision, updated_at)
  values (p_activity, v_act.learner_id, p_content, 1, pg_catalog.clock_timestamp())
  on conflict (activity_instance_id, learner_id) do update
    set content = excluded.content, revision = d.revision + 1, updated_at = excluded.updated_at
  returning d.revision, d.updated_at into v_rev, v_at;
  return pg_catalog.jsonb_build_object(
    'revision', v_rev, 'saved_at', v_at,
    'other_tab_changed', p_base_revision is not null and v_cur is not null and p_base_revision <> v_cur);
end
$$;

-- Nộp bài sửa (spec §2.4): một transaction tạo attempt (REVISION, không bao giờ lần đầu, lần trước = bài được góp ý, cùng gia đình học tập),
-- nội dung, đánh dấu từng góp ý, khai báo trợ giúp, một trợ giúp "góp ý" quan sát được (bằng chứng có hỗ trợ - D5), lần luyện "retry"
-- cho mọi kỹ năng của cặp, episode (facets.revision). Idempotent theo (em, client_submission_id) như eng_submit_attempt.
create or replace function english.eng_submit_revision(
  p_activity uuid,
  p_client_id uuid,
  p_text text,
  p_marks jsonb,
  p_assistance text[],
  p_provenance text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member uuid;
  v_role text;
  v_act english.activity_instances%rowtype;
  v_l english.learners%rowtype;
  v_f english.feedback_notes%rowtype;
  v_src english.attempts%rowtype;
  v_src_text text;
  v_assist text[];
  v_marks jsonb;
  v_content jsonb;
  v_hash text;
  v_existing english.attempts%rowtype;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_no int;
  v_at timestamptz := pg_catalog.clock_timestamp();
  v_targets text[];
  v_item text;
  v_context text;
begin
  if v_uid is null then
    raise exception 'eng_submit_revision: not signed in' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'eng_submit_revision: client_submission_id is required' using errcode = '22004';
  end if;
  select m.id, m.role into v_member, v_role from english.members m where m.user_id = v_uid;
  if v_member is null then
    raise exception 'eng_submit_revision: activity not found' using errcode = 'P0002';
  end if;
  if v_role <> 'student' then
    raise exception 'eng_submit_revision: only the learner may submit a revision' using errcode = '42501';
  end if;
  -- Khóa dòng bước: hai lần nộp cùng lúc xếp hàng.
  select a.* into v_act from english.activity_instances a join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member and a.mode = 'REVISION'
  for no key update of a;
  if not found then
    raise exception 'eng_submit_revision: activity not found' using errcode = 'P0002';
  end if;
  select * into v_l from english.learners l where l.id = v_act.learner_id;

  select coalesce(array_agg(distinct x order by x), '{}') into v_assist from unnest(p_assistance) as x;
  if cardinality(v_assist) = 0
     or not (v_assist <@ array['none', 'notes', 'dictionary', 'asked_someone', 'ai_outside'])
     or ('none' = any (v_assist) and cardinality(v_assist) > 1) then
    raise exception 'eng_submit_revision: declare the help used (or "none")' using errcode = '22023';
  end if;
  if p_provenance is null or p_provenance not in ('in_app', 'pasted') then
    raise exception 'eng_submit_revision: provenance must be in_app or pasted' using errcode = '22023';
  end if;
  if p_text is null or pg_catalog.btrim(p_text) = '' or pg_catalog.length(p_text) > 20000 then
    raise exception 'eng_submit_revision: the text must be 1 to 20000 characters' using errcode = '22023';
  end if;

  select f.* into v_f from english.feedback_notes f
  where f.revision_activity_id = p_activity and f.kind = 'feedback' and f.requires_revision and english.eng_feedback_is_live(f.id)
  order by f.round desc, f.created_at desc limit 1;
  if not found or not english.eng_activity_released(p_activity) then
    raise exception 'eng_submit_revision: there is no revision to do on this step (revision_not_open)' using errcode = '22023';
  end if;
  select * into v_src from english.attempts t where t.id = v_f.source_attempt_id;
  select av.content ->> 'text' into v_src_text from english.artifact_versions av where av.attempt_id = v_src.id order by av.version limit 1;
  v_marks := english.eng_clean_revision_marks(
    p_marks, v_f.items,
    coalesce(english.eng_track_setting(v_l.track_id, 'revision_reason_required') = 'true'::jsonb, false),
    english.eng_clean_text(p_text) = english.eng_clean_text(v_src_text));
  v_content := pg_catalog.jsonb_build_object('text', p_text);
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('text', p_text, 'marks', v_marks)::text, 'UTF8')), 'hex');

  -- Gửi lại: cùng biên nhận; cùng id mà khác bước / chữ / đánh dấu / khai báo / nguồn gốc → 23505.
  select t.* into v_existing from english.attempts t where t.learner_id = v_act.learner_id and t.client_submission_id = p_client_id;
  if found then
    if v_existing.activity_instance_id <> p_activity or v_existing.content_hash <> v_hash
       or v_existing.declared_assistance is distinct from v_assist or v_existing.provenance is distinct from p_provenance then
      raise exception 'eng_submit_revision: client_submission_id was already used for a different submission' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('attempt_id', v_existing.id, 'attempt_no', v_existing.attempt_no,
      'submitted_at', v_existing.submitted_at, 'hash', v_existing.content_hash, 'replayed', true);
  end if;
  if exists (select 1 from english.attempts t where t.revises_attempt_id = v_src.id) then
    raise exception 'eng_submit_revision: this revision was already submitted (already_submitted)' using errcode = '23505';
  end if;

  -- D6: số lần = lớn nhất trong gia đình học tập / trên bước này + 1; lần trước = bài được góp ý; gia đình của bài đó.
  v_no := greatest(
    (select coalesce(max(t.attempt_no), 0) from english.attempts t where t.learning_family_id = v_src.learning_family_id),
    (select coalesce(max(t.attempt_no), 0) from english.attempts t where t.activity_instance_id = p_activity)) + 1;
  insert into english.attempts(id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance,
                               declared_assistance, submitted_at, content_hash, client_submission_id, revises_attempt_id)
  values (v_id, p_activity, v_act.learner_id, v_no, v_src.id, v_src.learning_family_id, 'REVISION', p_provenance, v_assist, v_at, v_hash, p_client_id, v_src.id);
  insert into english.artifact_versions(attempt_id, learner_id, kind, version, content, is_raw, created_by)
  values (v_id, v_act.learner_id, 'text', 1, v_content, true, v_member);
  insert into english.revision_marks(learner_id, attempt_id, feedback_id, item_n, choice, reason)
  select v_act.learner_id, v_id, v_f.id, (x ->> 'n')::smallint, x ->> 'choice', x ->> 'reason'
  from pg_catalog.jsonb_array_elements(v_marks) x;

  -- Kỹ năng của cặp: của bước sửa, rồi của bài gốc (cùng thứ tự với eng_episode_targets).
  select coalesce(array_agg(z.k order by z.o), '{}') into v_targets
  from (
    select s.k, min(s.o) as o from (
      select u.k, u.o from unnest(v_act.target_ids) with ordinality as u(k, o)
      union all
      select u.k, 1000 + u.o
      from english.attempts r
      join english.activity_instances ra on ra.id = r.activity_instance_id
      cross join lateral unnest(ra.target_ids) with ordinality as u(k, o)
      where r.id = english.eng_revision_root(v_src.id)
    ) s group by s.k
  ) z;

  foreach v_item in array v_assist loop
    if v_item <> 'none' then
      insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification)
      values (v_act.learner_id, v_id, case when v_item = 'notes' then 'notes' else 'external_declared' end, v_item, v_targets, 'declared');
    end if;
  end loop;
  if p_provenance = 'pasted' then
    insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification)
    values (v_act.learner_id, v_id, 'external_declared', 'pasted', v_targets, 'declared');
  end if;
  -- D5: góp ý là một trợ giúp quan sát được → bài sửa luôn là bằng chứng "có hỗ trợ", không bao giờ "tự làm được".
  insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification, note, recorded_by)
  values (v_act.learner_id, v_id, 'tutor_prompt', null, v_targets, 'observed', pg_catalog.format('Góp ý vòng %s', v_f.round), v_f.author_member);

  insert into english.exposure_log(learner_id, target_key, at, source, attempt_id)
  select distinct v_act.learner_id, k, v_at, 'retry', v_id from unnest(v_targets) as k;

  select i.snapshot -> 'template' ->> 'id' into v_context from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id, observed_directly, facets)
  values (v_id, v_act.learner_id, false, v_context, false,
          pg_catalog.jsonb_build_object('baseline', false, 'checkpoint', false, 'delayed_check', false, 'transfer_check', false, 'revision', true));

  delete from english.working_drafts d where d.activity_instance_id = p_activity and d.learner_id = v_act.learner_id;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_uid, v_role, 'revision.submitted', v_l.family_id, v_act.learner_id,
          pg_catalog.jsonb_build_object('attempt', v_id, 'feedback', v_f.id, 'round', v_f.round));
  return pg_catalog.jsonb_build_object('attempt_id', v_id, 'attempt_no', v_no, 'submitted_at', v_at, 'hash', v_hash, 'replayed', false);
end
$$;

revoke execute on function english.eng_my_feedback() from public, anon, service_role;
revoke execute on function english.eng_my_revision(uuid) from public, anon, service_role;
revoke execute on function english.eng_save_revision_draft(uuid, jsonb, int) from public, anon, service_role;
revoke execute on function english.eng_submit_revision(uuid, uuid, text, jsonb, text[], text) from public, anon, service_role;
grant execute on function english.eng_my_feedback() to authenticated;
grant execute on function english.eng_my_revision(uuid) to authenticated;
grant execute on function english.eng_save_revision_draft(uuid, jsonb, int) to authenticated;
grant execute on function english.eng_submit_revision(uuid, uuid, text, jsonb, text[], text) to authenticated;
```

- [ ] **Step 4: Run the unit test** — `npx vitest run tests/unit/migration0021.test.ts` → PASS (11 tests).

- [ ] **Step 5: Write the failing DB tests** — in `tests/db/feedbackRevision.test.ts`, replace `  // (Tasks 3 and 4 add their sections here)` with:

```ts
  describe("3. the child's side: read, draft, submit", () => {
    const STUDENT_FORBIDDEN = ["score", "verdict", "observation", "decision", "leaf", "ref_key", "target", "author", "rationale"];
    const noLeaks = (v: unknown) => {
      const text = JSON.stringify(v);
      for (const bad of STUDENT_FORBIDDEN) expect(text, bad).not.toContain(bad);
    };
    type MyRevision = { state: string; round: number; praise: string; items: { n: number; text: string; excerpt: string | null }[]; old_text: string; reason_required: boolean; draft: unknown };
    type MyFeedback = { items: { feedback_id: string; activity_id: string; state: string; items_count: number; closing_note: string | null }[] };

    let root: string;
    let rev: string; // An's own revision step (A-W1 step 6 → 100x)
    let revised: string; // the revision attempt
    beforeAll(async () => {
      // a fresh instance: the root is attempt 1 of its step, so the revision is attempt 2 of the family
      const fresh = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      root = (await submitText(U().studentAn, await step(fresh, 6), TEXT_A)).attempt_id;
      const [leaf] = await q1<{ kind: string; ref_key: string }>(
        "select kind, ref_key from english.skill_leaves where map_id = english.eng_current_skill_map() and track_id = 'A' order by group_key, ord limit 1");
      rev = (await write(M().tutorAn, root, { items: [{ ...ITEMS[0]!, leaf }, ITEMS[1]!] })).revision_activity_id!;
    });

    it("the child reads the feedback (praise, items, excerpt, old text) but never a leaf, a score or who scored; others read nothing", async () => {
      const home = await studentRead<MyFeedback>(U().studentAn, "select english.eng_my_feedback() as r");
      expect(home.items.find((i) => i.activity_id === rev)).toMatchObject({ state: "todo", items_count: 2 });
      noLeaks(home);
      const page = await studentRead<MyRevision>(U().studentAn, "select english.eng_my_revision($1) as r", [rev]);
      expect(page).toMatchObject({ state: "todo", round: 1, old_text: TEXT_A, reason_required: false, draft: null });
      expect(page.items).toEqual([{ n: 1, text: ITEMS[0]!.text, excerpt: ITEMS[0]!.excerpt }, { n: 2, text: ITEMS[1]!.text, excerpt: null }]);
      noLeaks(page);
      expect(await studentRead(U().studentNguyen, "select english.eng_my_revision($1) as r", [rev])).toBeNull();
      expect(await studentRead(U().tutorAn, "select english.eng_my_revision($1) as r", [rev])).toBeNull();
      expect(await studentRead<MyFeedback>(U().parent, "select english.eng_my_feedback() as r")).toEqual({ items: [] });
      // S4 still sees the step as "not in the app"
      expect(await studentRead<{ supported: boolean }>(U().studentAn, "select english.eng_my_activity($1) as r", [rev])).toMatchObject({ supported: false });
      // service_role may not call the child's functions
      await fail(svc("select english.eng_my_feedback() as r"), "42501");
    });

    it("drafts: only {text, marks, pasted, assistance}, saved on the revision step, with the other-tab warning", async () => {
      await fail(student(U().studentAn, "select english.eng_save_revision_draft($1, $2::jsonb) as r", [rev, JSON.stringify({ marks: { "4": { choice: "kept" } } })]), "22023");
      await fail(student(U().studentAn, "select english.eng_save_revision_draft($1, $2::jsonb) as r", [rev, JSON.stringify({ answers: {} })]), "22023");
      const first = await student<{ revision: number }>(U().studentAn, "select english.eng_save_revision_draft($1, $2::jsonb, 0) as r",
        [rev, JSON.stringify({ text: TEXT_A, marks: { "1": { choice: "changed" } } })]);
      expect(first.revision).toBe(1);
      const second = await student<{ revision: number; other_tab_changed: boolean }>(U().studentAn, "select english.eng_save_revision_draft($1, $2::jsonb, 0) as r",
        [rev, JSON.stringify({ text: `${TEXT_A} More.` })]);
      expect(second).toMatchObject({ revision: 2, other_tab_changed: true });
      expect((await studentRead<MyRevision>(U().studentAn, "select english.eng_my_revision($1) as r", [rev])).draft).toMatchObject({ revision: 2 });
      await fail(student(U().studentNguyen, "select english.eng_save_revision_draft($1, '{}'::jsonb) as r", [rev]), "P0002");
    });

    it("submit: every item marked; an unchanged text needs 'kept' with a reason; then one revision, never first, in the root's family", async () => {
      const NEW = `${TEXT_A} As a result, the eruption is violent.`;
      await fail(reviseAs(U().studentAn, rev, NEW, { "1": { choice: "changed" } }), "23514", /\(marks_incomplete\)/);
      await fail(reviseAs(U().studentAn, rev, TEXT_A, { "1": { choice: "changed" }, "2": { choice: "kept", reason: "Mình thấy đủ rồi" } }), "23514", /\(unchanged_needs_reason\)/);
      const marks = { "1": { choice: "changed", reason: "Mình đã thêm câu kết" }, "2": { choice: "changed" } };
      const receipt = await reviseAs(U().studentAn, rev, NEW, marks, { clientId: "a1111111-1111-4111-8111-111111111111" });
      expect(receipt).toMatchObject({ attempt_no: 2, replayed: false });
      revised = receipt.attempt_id;
      expect(await reviseAs(U().studentAn, rev, NEW, marks, { clientId: "a1111111-1111-4111-8111-111111111111" })).toMatchObject({ attempt_id: revised, replayed: true });
      await fail(reviseAs(U().studentAn, rev, `${NEW}!`, marks, { clientId: "a1111111-1111-4111-8111-111111111111" }), "23505");
      await fail(reviseAs(U().studentAn, rev, NEW, marks), "23505", /\(already_submitted\)/);
      await fail(student(U().studentAn, "select english.eng_save_revision_draft($1, '{}'::jsonb) as r", [rev]), "22023", /\(revision_not_open\)/);

      const [att] = await q1<Record<string, unknown>>(
        "select mode, attempt_no, parent_attempt_id, learning_family_id, revises_attempt_id from english.attempts where id = $1", [revised]);
      const [r] = await q1<{ learning_family_id: string }>("select learning_family_id from english.attempts where id = $1", [root]);
      expect(att).toEqual({ mode: "REVISION", attempt_no: 2, parent_attempt_id: root, learning_family_id: r!.learning_family_id, revises_attempt_id: root });
      const [ep] = await q1<{ is_first_attempt: boolean; facets: Record<string, boolean> }>("select is_first_attempt, facets from english.episodes where attempt_id = $1", [revised]);
      expect(ep).toMatchObject({ is_first_attempt: false, facets: { revision: true, checkpoint: false } });
      expect(await q1("select item_n, choice, reason from english.revision_marks where attempt_id = $1 order by item_n", [revised])).toEqual([
        { item_n: 1, choice: "changed", reason: "Mình đã thêm câu kết" }, { item_n: 2, choice: "changed", reason: null },
      ]);
      const help = await q1<{ kind: string; verification: string; affects_target_keys: string[]; note: string; recorded_by: string }>(
        "select kind, verification, affects_target_keys, note, recorded_by from english.assistance_events where attempt_id = $1 and kind = 'tutor_prompt'", [revised]);
      expect(help).toEqual([{ kind: "tutor_prompt", verification: "observed", affects_target_keys: ["A-A3-REDRAFT", "A-L3-CAUSE-W", "A-L2-CHUNKS"], note: "Góp ý vòng 1", recorded_by: M().tutorAn }]);
      expect(await q1("select distinct source from english.exposure_log where attempt_id = $1", [revised])).toEqual([{ source: "retry" }]);
      expect(await n("select count(*)::int as n from english.working_drafts where activity_instance_id = $1", [rev])).toBe(0);
      // the S5 scoring path sees the step's A3 skill first, then the root's skills
      const targets = await q1<{ target_key: string; scorable: boolean }>("select target_key, scorable from english.eng_episode_targets($1) order by ord", [await episodeOf(revised)]);
      expect(targets).toEqual([
        { target_key: "A-A3-REDRAFT", scorable: true }, { target_key: "A-L3-CAUSE-W", scorable: true }, { target_key: "A-L2-CHUNKS", scorable: true },
      ]);
      // the child sees "submitted", nothing more
      const page = await studentRead<MyRevision>(U().studentAn, "select english.eng_my_revision($1) as r", [rev]);
      expect(page).toMatchObject({ state: "submitted", draft: null });
      noLeaks(page);
    });

    it("Track B requires a reason for every item (track setting, no `if track`)", async () => {
      const wb = (await submitText(U().studentNguyen, await step(b1, 7), TEXT_B)).attempt_id;
      // b1 step 8 may already be the revision step of an earlier B-W1 work (Task 2 test): this one then gets its own step
      const rb = (await write(M().tutorNguyen, wb, { items: [{ text: "Nêu rõ hơn lý do thứ hai." }] })).revision_activity_id!;
      expect((await studentRead<MyRevision>(U().studentNguyen, "select english.eng_my_revision($1) as r", [rb])).reason_required).toBe(true);
      await fail(reviseAs(U().studentNguyen, rb, `${TEXT_B} Sleep matters most.`, { "1": { choice: "changed" } }), "23514", /\(reason_required\)/);
      expect((await reviseAs(U().studentNguyen, rb, `${TEXT_B} Sleep matters most.`, { "1": { choice: "changed", reason: "I added why sleep matters." } })).replayed).toBe(false);
    });

    it("D14: the revision of an in-session test stays tutor-only for scoring and checking", async () => {
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const check = (await submitText(U().studentAn, await step(x, 11), TEXT_A)).attempt_id;
      const r = await write(M().tutorAn, check, { items: [{ text: "Thêm câu kết." }] });
      const done = await reviseAs(U().studentAn, r.revision_activity_id!, `${TEXT_A} In the end, the lava cools.`, { "1": { choice: "changed" } });
      const ep = await episodeOf(done.attempt_id);
      expect((await q1<{ r: string | null }>("select english.eng_review_role($1, $2) as r", [ep, M().parent]))[0]?.r).toBeNull();
      expect((await q1<{ r: string | null }>("select english.eng_review_role($1, $2) as r", [ep, M().tutorAn]))[0]?.r).toBe("tutor");
    });
  });

  // (Task 4 adds its section here)
```

- [ ] **Step 6: Run** — `npm run test:db -- tests/db/feedbackRevision.test.ts tests/db/studentWork.test.ts` → PASS. S4's "a revision step is never submitted in this slice" still passes, because `eng_submit_attempt` still refuses REVISION.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0021_feedback_revision.sql tests/unit/migration0021.test.ts tests/db/feedbackRevision.test.ts
git commit -m "feat(s6): migration 0021 part 3 - the child reads feedback, autosaves and submits the revision (never first, root family, marks, supported)"
```

---

### Task 4: Migration 0021 part 4 — the reviewer's side: verdicts + Xong / Mở vòng 2, panel and before–after reads, list, inbox

**Files:**
- Modify: `db/migrations/0021_feedback_revision.sql` (section 8, pasted above `-- 9. Purge:`), `tests/unit/migration0021.test.ts`, `tests/db/feedbackRevision.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `english.eng_current_member_id`, `english.eng_is_staff_of` (0003/0007); the 0010 body of `eng_review_inbox`.
- Produces (service_role only, called after `requireAccess`, except the inbox, which stays `authenticated` as in 0010):
  - `english.eng_finish_revision(p_attempt uuid, p_action text, p_checks jsonb, p_closing text, p_praise text, p_items jsonb, p_by uuid, p_client_id text) returns jsonb` → `{closing_id, feedback_id, revision_activity_id, replayed}`. `p_action` is `close` or `round2`, and `p_checks` is `[{n, verdict}]`. Errors: `(D15)` 42501, `(not_found)` P0002, `(checks_incomplete)` / `(max_rounds)` / `(score_words)` 23514, `(bad_verdict)` / `(bad_action)` / `(closing_too_long)` 22023, `(already_finished)` 23505; for round 2, every error of `eng_write_feedback`.
  - `english.eng_feedback_panel(p_attempt uuid, p_by uuid) returns jsonb` → `{eligible, can_give, text, live: {id, praise, items, requires_revision, round, revision_activity_id, author_name, author_is_me, created_at, editable, revision_state: "todo"|"started"|"submitted"|"seen"|null, revision_episode_id} | null, history: [{id, praise, items, created_at, author_name}]}`, or `null` for an unknown attempt.
  - `english.eng_revision_view(p_attempt uuid, p_by uuid) returns jsonb` → `{attempt_id, episode_id, learner_id, alias, round, title_vi, submitted_at, before: {attempt_id, episode_id, text, submitted_at}, after: {text}, feedback: {id, praise, items, author_name, created_at}, marks: [{n, choice, reason}], checks: [{n, verdict, checker_name, created_at}], closing: {note, author_name, created_at} | null, next_round: {feedback_id, created_at} | null, reason_required, can_finish, can_open_round2}`, or `null` when the attempt is not a revision.
  - `english.eng_revision_list(p_learner uuid) returns jsonb` → `{items: [{attempt_id, episode_id, title_vi, round, submitted_at, items_count, state: "waiting"|"done", good, not_yet}]}`, newest first, at most 50.
  - `english.eng_review_inbox(...)`, redefined with the same signature. A revision is done once Xong or Mở vòng 2 was pressed (D15), each row carries `revision_round` (int or null), and `restricted` comes from `eng_episode_restricted`.

- [ ] **Step 1: Write the failing unit tests** — in `tests/unit/migration0021.test.ts`, replace `  // (Task 4 adds its tests here)` with:

```ts
  it("the reviewer's functions are for service_role only; the inbox keeps its 0010 grants", () => {
    for (const sig of [
      "eng_finish_revision(uuid, text, jsonb, text, text, jsonb, uuid, text)", "eng_feedback_panel(uuid, uuid)", "eng_revision_view(uuid, uuid)", "eng_revision_list(uuid)",
    ]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function english.${sig} to service_role;`);
    }
    expect(code).toContain("revoke execute on function english.eng_review_inbox(boolean, text, int, timestamptz, uuid) from public, anon, service_role;");
    expect(code).toContain("grant execute on function english.eng_review_inbox(boolean, text, int, timestamptz, uuid) to authenticated;");
  });

  it("Xong / Mở vòng 2 need a verdict on every item first; the inbox closes a revision on Xong / Mở vòng 2, not on scores", () => {
    const f = fnText(sql, "eng_finish_revision");
    expect(f).toContain("(checks_incomplete)");
    expect(f).toContain("(bad_verdict)");
    expect(f).toContain("v_next := english.eng_write_feedback(p_attempt, p_praise, p_items, true, null, p_by, p_client_id);");
    const inbox = fnText(sql, "eng_review_inbox");
    expect(inbox).toContain("case when rv.round is null then x.decided >= x.total else rv.finished end as is_done");
    expect(inbox).toContain("'revision_round', rv.round");
    expect(inbox).toContain("english.eng_episode_restricted(e.id) as restricted");
  });
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/migration0021.test.ts` → FAIL.

- [ ] **Step 3: Paste section 8** into `db/migrations/0021_feedback_revision.sql`, immediately above `-- 9. Purge: …`:

```sql
-- 8. Phía người duyệt -----------------------------------------------------------------------------------------------------------------
-- Đánh giá từng góp ý + Xong (nhận xét kết, tùy chọn) hoặc Mở vòng 2 (góp ý mới) trong MỘT transaction (D11). Đánh giá phải đủ mọi góp ý và
-- hợp với lựa chọn của con: Đã sửa → improved / not_yet; Giữ nguyên → reason_ok / not_yet (3-a). Người duyệt = người được duyệt bài sửa (D14).
create or replace function english.eng_finish_revision(
  p_attempt uuid,
  p_action text,
  p_checks jsonb,
  p_closing text,
  p_praise text,
  p_items jsonb,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_a english.attempts%rowtype;
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_f english.feedback_notes%rowtype;
  v_ep uuid;
  v_role text;
  v_closing text := nullif(pg_catalog.btrim(coalesce(p_closing, '')), '');
  v_c jsonb;
  v_n int;
  v_choice text;
  v_closing_id uuid;
  v_next jsonb;
begin
  if p_attempt is null or p_action is null or p_checks is null or p_by is null or p_client_id is null then
    raise exception 'eng_finish_revision: revision, action, checks, actor and client id are required' using errcode = '22004';
  end if;
  if p_action not in ('close', 'round2') then
    raise exception 'eng_finish_revision: action is close or round2 (bad_action)' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_finish_revision: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select t.* into v_a from english.attempts t where t.id = p_attempt and t.revises_attempt_id is not null;
  if not found then
    raise exception 'eng_finish_revision: revision not found (not_found)' using errcode = 'P0002';
  end if;
  -- Khóa bước sửa: hai người bấm Xong cùng lúc xếp hàng.
  perform 1 from english.activity_instances a where a.id = v_a.activity_instance_id for no key update;
  select * into v_l from english.learners l where l.id = v_a.learner_id;
  select * into v_member from english.members m where m.id = p_by;
  select e.id into v_ep from english.episodes e where e.attempt_id = p_attempt;
  v_role := english.eng_review_role(v_ep, p_by);
  if v_role is null then
    raise exception 'eng_finish_revision: this member may not review this revision (D15)' using errcode = '42501';
  end if;
  select f.* into v_f from english.feedback_notes f
  where f.source_attempt_id = v_a.revises_attempt_id and f.kind = 'feedback' and f.requires_revision and english.eng_feedback_is_live(f.id);

  -- Gửi lại: đánh giá của lần bấm này đã có → trả lại kết quả cũ.
  if exists (select 1 from english.revision_checks c where c.attempt_id = p_attempt and c.client_id = p_client_id) then
    return pg_catalog.jsonb_build_object(
      'closing_id', (select c.id from english.feedback_notes c where c.source_attempt_id = p_attempt and c.kind = 'closing'),
      'feedback_id', (select x.id from english.feedback_notes x where x.source_attempt_id = p_attempt and x.kind = 'feedback' and x.supersedes_id is null),
      'revision_activity_id', (select x.revision_activity_id from english.feedback_notes x where x.source_attempt_id = p_attempt and x.kind = 'feedback' and x.supersedes_id is null),
      'replayed', true);
  end if;
  if exists (select 1 from english.feedback_notes x where x.source_attempt_id = p_attempt)
     or exists (select 1 from english.revision_checks c where c.attempt_id = p_attempt) then
    raise exception 'eng_finish_revision: this revision was already looked at (already_finished)' using errcode = '23505';
  end if;
  if p_action = 'round2' and v_f.round >= 2 then
    raise exception 'eng_finish_revision: at most 2 rounds of revision (max_rounds)' using errcode = '23514';
  end if;

  if pg_catalog.jsonb_typeof(p_checks) <> 'array' then
    raise exception 'eng_finish_revision: checks are [{n, verdict}] (bad_verdict)' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_checks) <> pg_catalog.jsonb_array_length(v_f.items)
     or (select pg_catalog.count(distinct x ->> 'n') from pg_catalog.jsonb_array_elements(p_checks) x) <> pg_catalog.jsonb_array_length(v_f.items) then
    raise exception 'eng_finish_revision: give one verdict for every feedback item (checks_incomplete)' using errcode = '23514';
  end if;
  for v_c in select x from pg_catalog.jsonb_array_elements(p_checks) x loop
    if pg_catalog.jsonb_typeof(v_c) <> 'object' or coalesce(v_c ->> 'n', '') !~ '^[1-3]$' then
      raise exception 'eng_finish_revision: checks are [{n, verdict}] (bad_verdict)' using errcode = '22023';
    end if;
    v_n := (v_c ->> 'n')::int;
    select m.choice into v_choice from english.revision_marks m where m.attempt_id = p_attempt and m.item_n = v_n;
    if v_choice is null then
      raise exception 'eng_finish_revision: give one verdict for every feedback item (checks_incomplete)' using errcode = '23514';
    end if;
    if not ((v_choice = 'changed' and v_c ->> 'verdict' in ('improved', 'not_yet'))
            or (v_choice = 'kept' and v_c ->> 'verdict' in ('reason_ok', 'not_yet'))) then
      raise exception 'eng_finish_revision: this verdict does not fit the child''s choice (bad_verdict)' using errcode = '22023';
    end if;
    insert into english.revision_checks(learner_id, attempt_id, item_n, verdict, checker_member, checker_role, client_id)
    values (v_a.learner_id, p_attempt, v_n, v_c ->> 'verdict', p_by, v_role, p_client_id);
  end loop;

  if p_action = 'close' then
    if v_closing is not null and pg_catalog.length(v_closing) > 300 then
      raise exception 'eng_finish_revision: the closing note is at most 300 characters (closing_too_long)' using errcode = '22023';
    end if;
    if english.eng_has_score_words(v_closing) then
      raise exception 'eng_finish_revision: no scores in the closing note (score_words)' using errcode = '23514';
    end if;
    insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, requires_revision,
                                       author_member, author_role, client_id)
    values (v_a.learner_id, p_attempt, v_f.root_attempt_id, v_f.round, 'closing', v_closing, '[]'::jsonb, false, p_by, v_role, p_client_id)
    returning id into v_closing_id;
  else
    v_next := english.eng_write_feedback(p_attempt, p_praise, p_items, true, null, p_by, p_client_id);
  end if;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'revision.checked', v_l.family_id, v_l.id,
          pg_catalog.jsonb_build_object('attempt', p_attempt, 'action', p_action, 'round', v_f.round, 'checks', pg_catalog.jsonb_array_length(p_checks)));
  return pg_catalog.jsonb_build_object('closing_id', v_closing_id, 'feedback_id', v_next ->> 'id',
                                       'revision_activity_id', v_next ->> 'revision_activity_id', 'replayed', false);
end
$$;

-- Khung "Góp ý cho con" ở màn duyệt (người duyệt; máy chủ gọi sau requireAccess): bài có góp ý được không (D8), người này góp ý được không,
-- chữ của bài (để chọn trích đoạn), góp ý đang hiệu lực (+ còn sửa được không, con đã tới đâu), các bản cũ.
create or replace function english.eng_feedback_panel(p_attempt uuid, p_by uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_a english.attempts%rowtype;
  v_ep uuid;
  v_kind text;
  v_text text;
  v_role text;
  v_eligible boolean;
  v_live english.feedback_notes%rowtype;
  v_rev english.attempts%rowtype;
begin
  select * into v_a from english.attempts t where t.id = p_attempt;
  if not found then return null; end if;
  select e.id into v_ep from english.episodes e where e.attempt_id = p_attempt;
  select av.kind, av.content ->> 'text' into v_kind, v_text
  from english.artifact_versions av where av.attempt_id = p_attempt order by av.version limit 1;
  v_eligible := v_kind = 'text' and v_text is not null and v_a.provenance in ('in_app', 'pasted');
  v_role := english.eng_review_role(v_ep, p_by);
  select f.* into v_live from english.feedback_notes f
  where f.source_attempt_id = p_attempt and f.kind = 'feedback' and english.eng_feedback_is_live(f.id);
  select t.* into v_rev from english.attempts t where t.revises_attempt_id = p_attempt order by t.submitted_at limit 1;
  return pg_catalog.jsonb_build_object(
    'eligible', coalesce(v_eligible, false),
    -- Góp ý mới: chỉ cho bài gốc. Bài sửa nhận góp ý vòng 2 qua "Mở vòng 2" (eng_finish_revision).
    'can_give', coalesce(v_eligible, false) and v_role is not null and v_live.id is null and v_a.revises_attempt_id is null,
    'text', case when v_eligible then v_text end,
    'live', case when v_live.id is null then null else pg_catalog.jsonb_build_object(
      'id', v_live.id, 'praise', v_live.praise, 'items', v_live.items, 'requires_revision', v_live.requires_revision, 'round', v_live.round,
      'revision_activity_id', v_live.revision_activity_id,
      'author_name', (select m.display_name from english.members m where m.id = v_live.author_member),
      'author_is_me', v_live.author_member = p_by,
      'created_at', v_live.created_at,
      'editable', v_live.author_member = p_by and v_role is not null and not english.eng_revision_started(v_live.id),
      'revision_state', case when not v_live.requires_revision then null
                             when v_rev.id is not null then
                               case when exists (select 1 from english.feedback_notes x where x.source_attempt_id = v_rev.id) then 'seen' else 'submitted' end
                             when english.eng_revision_started(v_live.id) then 'started'
                             else 'todo' end,
      'revision_episode_id', (select e.id from english.episodes e where e.attempt_id = v_rev.id)) end,
    'history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', h.id, 'praise', h.praise, 'items', h.items, 'created_at', h.created_at,
                                                                'author_name', m.display_name) order by h.created_at, h.id)
      from english.feedback_notes h left join english.members m on m.id = h.author_member
      where h.source_attempt_id = p_attempt and h.kind = 'feedback' and not english.eng_feedback_is_live(h.id)), '[]'::jsonb));
end
$$;

-- Trước–sau của một bài sửa (màn "Bài sửa lại" và "Bài đã sửa"): bài cũ, bài sửa, góp ý, đánh dấu của con, đánh giá, nhận xét kết / vòng 2,
-- người xem có được đánh giá không. NULL nếu không phải bài sửa.
create or replace function english.eng_revision_view(p_attempt uuid, p_by uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_a english.attempts%rowtype;
  v_f english.feedback_notes%rowtype;
  v_l english.learners%rowtype;
  v_ep uuid;
  v_role text;
  v_done boolean;
  v_title text;
begin
  select t.* into v_a from english.attempts t where t.id = p_attempt and t.revises_attempt_id is not null;
  if not found then return null; end if;
  select f.* into v_f from english.feedback_notes f
  where f.source_attempt_id = v_a.revises_attempt_id and f.kind = 'feedback' and f.requires_revision and english.eng_feedback_is_live(f.id);
  select * into v_l from english.learners l where l.id = v_a.learner_id;
  select e.id into v_ep from english.episodes e where e.attempt_id = p_attempt;
  select i.snapshot -> 'template' ->> 'title_vi' into v_title
  from english.activity_instances a join english.inquiry_instances i on i.id = a.inquiry_instance_id where a.id = v_a.activity_instance_id;
  v_role := english.eng_review_role(v_ep, p_by);
  v_done := exists (select 1 from english.feedback_notes x where x.source_attempt_id = p_attempt);
  return pg_catalog.jsonb_build_object(
    'attempt_id', v_a.id, 'episode_id', v_ep, 'learner_id', v_l.id, 'alias', v_l.alias, 'round', v_f.round, 'title_vi', v_title,
    'submitted_at', v_a.submitted_at,
    'before', pg_catalog.jsonb_build_object(
      'attempt_id', v_a.revises_attempt_id,
      'episode_id', (select e.id from english.episodes e where e.attempt_id = v_a.revises_attempt_id),
      'text', (select av.content ->> 'text' from english.artifact_versions av where av.attempt_id = v_a.revises_attempt_id order by av.version limit 1),
      'submitted_at', (select t.submitted_at from english.attempts t where t.id = v_a.revises_attempt_id)),
    'after', pg_catalog.jsonb_build_object(
      'text', (select av.content ->> 'text' from english.artifact_versions av where av.attempt_id = p_attempt order by av.version limit 1)),
    'feedback', pg_catalog.jsonb_build_object(
      'id', v_f.id, 'praise', v_f.praise, 'items', v_f.items, 'created_at', v_f.created_at,
      'author_name', (select m.display_name from english.members m where m.id = v_f.author_member)),
    'marks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', m.item_n, 'choice', m.choice, 'reason', m.reason) order by m.item_n)
                       from english.revision_marks m where m.attempt_id = p_attempt), '[]'::jsonb),
    'checks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', c.item_n, 'verdict', c.verdict, 'checker_name', mb.display_name,
                                                                                  'created_at', c.created_at) order by c.item_n)
                        from english.revision_checks c left join english.members mb on mb.id = c.checker_member where c.attempt_id = p_attempt), '[]'::jsonb),
    'closing', (select pg_catalog.jsonb_build_object('note', c.praise, 'author_name', mb.display_name, 'created_at', c.created_at)
                from english.feedback_notes c left join english.members mb on mb.id = c.author_member
                where c.source_attempt_id = p_attempt and c.kind = 'closing'),
    'next_round', (select pg_catalog.jsonb_build_object('feedback_id', x.id, 'created_at', x.created_at)
                   from english.feedback_notes x where x.source_attempt_id = p_attempt and x.kind = 'feedback' and x.supersedes_id is null),
    'reason_required', coalesce(english.eng_track_setting(v_l.track_id, 'revision_reason_required') = 'true'::jsonb, false),
    'can_finish', v_role is not null and not v_done,
    'can_open_round2', v_role is not null and not v_done and v_f.round < 2);
end
$$;

-- "Bài đã sửa" của một em (phụ huynh, gia sư): các cặp trước–sau, mới nhất trước, tối đa 50.
create or replace function english.eng_revision_list(p_learner uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('items', coalesce(pg_catalog.jsonb_agg(x.obj order by x.at desc, x.id desc), '[]'::jsonb))
  from (
    select t.id, t.submitted_at as at, pg_catalog.jsonb_build_object(
      'attempt_id', t.id,
      'episode_id', e.id,
      'title_vi', i.snapshot -> 'template' ->> 'title_vi',
      'round', english.eng_revision_round(t.id),
      'submitted_at', t.submitted_at,
      'items_count', (select pg_catalog.count(*) from english.revision_marks m where m.attempt_id = t.id),
      'state', case when exists (select 1 from english.feedback_notes x where x.source_attempt_id = t.id) then 'done' else 'waiting' end,
      'good', (select pg_catalog.count(*) from english.revision_checks c where c.attempt_id = t.id and c.verdict in ('improved', 'reason_ok')),
      'not_yet', (select pg_catalog.count(*) from english.revision_checks c where c.attempt_id = t.id and c.verdict = 'not_yet')) as obj
    from english.attempts t
    join english.episodes e on e.attempt_id = t.id
    join english.activity_instances a on a.id = t.activity_instance_id
    join english.inquiry_instances i on i.id = a.inquiry_instance_id
    where t.learner_id = p_learner and t.revises_attempt_id is not null
    order by t.submitted_at desc, t.id desc
    limit 50
  ) x
$$;

revoke execute on function english.eng_finish_revision(uuid, text, jsonb, text, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_finish_revision(uuid, text, jsonb, text, text, jsonb, uuid, text) to service_role;
revoke execute on function english.eng_feedback_panel(uuid, uuid) from public, anon, authenticated;
grant execute on function english.eng_feedback_panel(uuid, uuid) to service_role;
revoke execute on function english.eng_revision_view(uuid, uuid) from public, anon, authenticated;
grant execute on function english.eng_revision_view(uuid, uuid) to service_role;
revoke execute on function english.eng_revision_list(uuid) from public, anon, authenticated;
grant execute on function english.eng_revision_list(uuid) to service_role;

-- Hộp duyệt (0010) - giữ nguyên mọi luật, thêm cho bài sửa: XONG khi người duyệt đã bấm Xong / Mở vòng 2 (điểm trên bài sửa là tùy chọn - D15),
-- nhãn vòng ('revision_round'), "chỉ gia sư" theo bài gốc (eng_episode_restricted - D14).
create or replace function english.eng_review_inbox(
  p_allow_real boolean default false,
  p_filter text default 'todo',
  p_limit int default 50,
  p_after_at timestamptz default null,
  p_after_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_me uuid := english.eng_current_member_id();
begin
  if p_filter is null or p_filter not in ('todo', 'tutor', 'independent', 'baseline', 'practice', 'done') then
    raise exception 'eng_review_inbox: unknown filter' using errcode = '22023';
  end if;
  if (p_after_at is null) <> (p_after_id is null) then
    raise exception 'eng_review_inbox: the cursor needs both a time and an id' using errcode = '22023';
  end if;

  return (
    with base as (
      select e.id as episode_id, at.submitted_at,
        x.total, x.decided,
        case when rv.round is null then x.decided >= x.total else rv.finished end as is_done,
        case
          when x.restricted then 'tutor'
          when coalesce((e.facets ->> 'baseline')::boolean, false) then 'baseline'
          when a.mode = 'INDEPENDENT_CHECK' then 'independent'
          else 'practice' end as category,
        english.eng_review_role(e.id, v_me) is not null as can_decide,
        pg_catalog.jsonb_build_object(
          'episode_id', e.id,
          'attempt_id', at.id,
          'learner_id', l.id,
          'alias', l.alias,
          'is_test', l.is_test,
          'title_vi', i.snapshot -> 'template' ->> 'title_vi',
          'step_no', a.step_no,
          'activity_type', a.activity_type,
          'mode', a.mode,
          'purpose', pg_catalog.to_jsonb(a.purpose),
          'provenance', at.provenance,
          'attempt_no', at.attempt_no,
          'is_first_attempt', e.is_first_attempt,
          'submitted_at', at.submitted_at,
          'restricted', x.restricted,
          'targets_total', x.total,
          'targets_decided', x.decided,
          'revision_round', rv.round) as obj
      from english.episodes e
      join english.learners l on l.id = e.learner_id
      join english.attempts at on at.id = e.attempt_id
      join english.activity_instances a on a.id = at.activity_instance_id
      join english.inquiry_instances i on i.id = a.inquiry_instance_id
      cross join lateral (
        select count(*) filter (where t.scorable)::int as total,
               count(*) filter (where t.scorable and exists (
                 select 1 from english.validation_decisions d
                 where d.episode_id = e.id and d.target_key = t.target_key and d.supersedes_id is null))::int as decided,
               english.eng_episode_restricted(e.id) as restricted
        from english.eng_episode_targets(e.id) t
      ) x
      cross join lateral (
        select english.eng_revision_round(at.id) as round,
               exists (select 1 from english.feedback_notes f where f.source_attempt_id = at.id) as finished
      ) rv
      where english.eng_is_staff_of(e.learner_id)
        and (p_allow_real or l.is_test)
        and x.total > 0
    ),
    counts as (
      select pg_catalog.jsonb_build_object(
        'todo', count(*) filter (where not b.is_done),
        'tutor', count(*) filter (where not b.is_done and b.category = 'tutor'),
        'independent', count(*) filter (where not b.is_done and b.category = 'independent'),
        'baseline', count(*) filter (where not b.is_done and b.category = 'baseline'),
        'practice', count(*) filter (where not b.is_done and b.category = 'practice'),
        'done', count(*) filter (where b.is_done),
        'to_decide', count(*) filter (where not b.is_done and b.can_decide)) as c
      from base b
    ),
    picked as (
      select b.*
      from base b
      where (case p_filter
               when 'done' then b.is_done
               when 'todo' then not b.is_done
               else not b.is_done and b.category = p_filter end)
        and (p_after_at is null or (b.submitted_at, b.episode_id) > (p_after_at, p_after_id))
      order by b.submitted_at, b.episode_id
      limit v_limit + 1
    ),
    page as (
      select p.*, row_number() over (order by p.submitted_at, p.episode_id) as rn from picked p
    )
    select pg_catalog.jsonb_build_object(
      'items', coalesce((select pg_catalog.jsonb_agg(
                           pg_catalog.jsonb_build_object('category', p.category, 'can_decide', p.can_decide) || p.obj
                           order by p.rn)
                         from page p where p.rn <= v_limit), '[]'::jsonb),
      'next', (select pg_catalog.jsonb_build_object('at', p.submitted_at, 'id', p.episode_id)
               from page p where p.rn = v_limit and exists (select 1 from page q where q.rn = v_limit + 1)),
      'counts', (select c from counts))
  );
end
$$;
revoke execute on function english.eng_review_inbox(boolean, text, int, timestamptz, uuid) from public, anon, service_role;
grant execute on function english.eng_review_inbox(boolean, text, int, timestamptz, uuid) to authenticated;
```

- [ ] **Step 4: Run the unit test** — `npx vitest run tests/unit/migration0021.test.ts` → PASS (13 tests).

- [ ] **Step 5: Write the failing DB tests** — in `tests/db/feedbackRevision.test.ts`, replace `  // (Task 4 adds its section here)` with:

```ts
  describe("4. the reviewer's side: verdicts, Xong, round 2, reads, inbox, purge", () => {
    type View = { round: number; before: { text: string }; after: { text: string }; marks: unknown[]; checks: unknown[]; closing: unknown; can_finish: boolean; can_open_round2: boolean };
    type Inbox = { items: { attempt_id: string; revision_round: number | null }[]; counts: Record<string, number> };
    const inboxAs = (user: string, filter: string) =>
      as(db.client, "authenticated", user, async (q) => ((await q("select english.eng_review_inbox(true, $1, 100) as r", [filter])).rows[0] as { r: Inbox }).r);

    /** A fresh A-W1, An's writing at step 6, feedback with 2 items, An's revision → the revision attempt id. */
    const revised = async () => {
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const root = (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id;
      const rev = (await write(M().tutorAn, root)).revision_activity_id!;
      const r = await reviseAs(U().studentAn, rev, `${TEXT_A} As a result, it is violent.`, { "1": { choice: "changed" }, "2": { choice: "kept", reason: "Đã có so" } });
      return { root, rev, attempt: r.attempt_id };
    };

    it("verdicts must cover every item and fit the child's choice; Xong closes once, with an optional note and no scores", async () => {
      const { attempt } = await revised();
      await fail(finish(M().tutorNguyen, attempt), "42501", /\(D15\)/);
      await fail(finish(M().tutorAn, attempt, { checks: [{ n: 1, verdict: "improved" }] }), "23514", /\(checks_incomplete\)/);
      await fail(finish(M().tutorAn, attempt, { checks: [{ n: 1, verdict: "reason_ok" }, { n: 2, verdict: "reason_ok" }] }), "22023", /\(bad_verdict\)/);
      await fail(finish(M().tutorAn, attempt, { closing: "Lần này được 4/4" }), "23514", /\(score_words\)/);
      expect(await n("select count(*)::int as n from english.revision_checks where attempt_id = $1", [attempt])).toBe(0); // all or nothing
      const done = await finish(M().parent, attempt, { closing: "Bài sửa rõ hơn nhiều!", clientId: "finish-replay-1" }); // ordinary work: the parent may
      expect(done.closing_id).toBeTruthy();
      expect(await finish(M().parent, attempt, { closing: "Bài sửa rõ hơn nhiều!", clientId: "finish-replay-1" })).toMatchObject({ replayed: true });
      await fail(finish(M().tutorAn, attempt), "23505", /\(already_finished\)/);
      const view = await svc<View>("select english.eng_revision_view($1, $2) as r", [attempt, M().tutorAn]);
      expect(view).toMatchObject({ round: 1, before: { text: TEXT_A }, can_finish: false, can_open_round2: false, closing: { note: "Bài sửa rõ hơn nhiều!" } });
      expect(view.checks).toHaveLength(2);
    });

    it("the child then sees 'đã xem' and the closing note - still no verdict", async () => {
      const { rev, attempt } = await revised();
      await finish(M().tutorAn, attempt, { closing: "Cô thấy bạn tiến bộ." });
      const page = await studentRead<{ state: string; closing_note: string }>(U().studentAn, "select english.eng_my_revision($1) as r", [rev]);
      expect(page).toMatchObject({ state: "seen", closing_note: "Cô thấy bạn tiến bộ." });
      const home = await studentRead<{ items: { activity_id: string; state: string }[] }>(U().studentAn, "select english.eng_my_feedback() as r");
      expect(home.items.find((i) => i.activity_id === rev)?.state).toBe("seen");
      for (const bad of ["improved", "not_yet", "reason_ok", "verdict"]) expect(JSON.stringify([page, home]), bad).not.toContain(bad);
    });

    it("round 2: same step, new attempt in the same family; after round 2 only Xong remains; never round 3", async () => {
      const { root, rev, attempt } = await revised();
      const next = await finish(M().tutorAn, attempt, { action: "round2", praise: "Câu kết hay hơn rồi.", items: [{ text: "Thêm một ví dụ cụ thể." }] });
      expect(next.feedback_id).toBeTruthy();
      expect((next as unknown as { revision_activity_id: string }).revision_activity_id).toBe(rev); // D7
      const page = await studentRead<{ state: string; round: number }>(U().studentAn, "select english.eng_my_revision($1) as r", [rev]);
      expect(page).toMatchObject({ state: "todo", round: 2 });
      const r2 = await reviseAs(U().studentAn, rev, `${TEXT_A} As a result, it is violent. For example, Mount St Helens.`, { "1": { choice: "changed" } });
      const [a2] = await q1<{ attempt_no: number; parent_attempt_id: string; revises_attempt_id: string; learning_family_id: string }>(
        "select attempt_no, parent_attempt_id, revises_attempt_id, learning_family_id from english.attempts where id = $1", [r2.attempt_id]);
      const [r0] = await q1<{ learning_family_id: string }>("select learning_family_id from english.attempts where id = $1", [root]);
      expect(a2).toEqual({ attempt_no: 3, parent_attempt_id: attempt, revises_attempt_id: attempt, learning_family_id: r0!.learning_family_id });
      expect((await svc<View>("select english.eng_revision_view($1, $2) as r", [r2.attempt_id, M().tutorAn]))).toMatchObject({ round: 2, can_open_round2: false, can_finish: true });
      await fail(finish(M().tutorAn, r2.attempt_id, { action: "round2", checks: [{ n: 1, verdict: "improved" }], praise: "x", items: [{ text: "y" }] }), "23514", /\(max_rounds\)/);
      await fail(write(M().tutorAn, r2.attempt_id), "23514", /\(max_rounds\)/);
      await finish(M().tutorAn, r2.attempt_id, { checks: [{ n: 1, verdict: "improved" }] });
    });

    it("panel: eligibility, who may give, the live note with its edit window, the history; never for the student", async () => {
      const x = await assign("an", "A-W1-VOLCANOES", dueReleasingAll("A-W1-VOLCANOES"));
      const root = (await submitText(U().studentAn, await step(x, 6), TEXT_A)).attempt_id;
      type Panel = { eligible: boolean; can_give: boolean; text: string | null; live: { editable: boolean; revision_state: string; author_is_me: boolean } | null; history: unknown[] };
      const panel = (by: string) => svc<Panel>("select english.eng_feedback_panel($1, $2) as r", [root, by]);
      expect(await panel(M().tutorAn)).toMatchObject({ eligible: true, can_give: true, text: TEXT_A, live: null, history: [] });
      const first = await write(M().tutorAn, root);
      await write(M().tutorAn, root, { supersedes: first.id, praise: "Con nêu rõ hai loại núi lửa." });
      expect(await panel(M().tutorAn)).toMatchObject({ can_give: false, live: { editable: true, revision_state: "todo", author_is_me: true } });
      expect((await panel(M().tutorAn)).history).toHaveLength(1);
      expect(await panel(M().parent)).toMatchObject({ live: { editable: false, author_is_me: false } });
      await fail(student(U().studentAn, "select english.eng_feedback_panel($1, $2) as r", [root, M().studentAn]), "42501");
      await fail(student(U().studentAn, "select english.eng_revision_list($1) as r", [s.learners.an]), "42501");
    });

    it("inbox: a revision shows its round and stays 'to do' until Xong / Mở vòng 2, even with no score at all", async () => {
      const { attempt } = await revised();
      const todo = await inboxAs(U().tutorAn, "todo");
      expect(todo.items.find((i) => i.attempt_id === attempt)?.revision_round).toBe(1);
      await finish(M().tutorAn, attempt);
      expect((await inboxAs(U().tutorAn, "todo")).items.some((i) => i.attempt_id === attempt)).toBe(false);
      expect((await inboxAs(U().tutorAn, "done")).items.some((i) => i.attempt_id === attempt)).toBe(true);
      // ordinary work keeps the S5 rule (done = every skill decided)
      expect((await inboxAs(U().tutorAn, "todo")).items.some((i) => i.revision_round === null)).toBe(true);
    });

    it("'Bài đã sửa' lists the pairs newest first with the verdict counts; scoring the A3 skill goes through S5 and stays off the target set", async () => {
      const { attempt } = await revised();
      await finish(M().tutorAn, attempt, { checks: [{ n: 1, verdict: "improved" }, { n: 2, verdict: "not_yet" }] });
      const list = await svc<{ items: { attempt_id: string; state: string; good: number; not_yet: number; items_count: number }[] }>(
        "select english.eng_revision_list($1) as r", [s.learners.an]);
      expect(list.items[0]).toMatchObject({ attempt_id: attempt, state: "done", good: 1, not_yet: 1, items_count: 2 });
      const r = await svc<unknown[]>("select english.eng_record_reviews($1, $2::jsonb, $3, $4) as r",
        [await episodeOf(attempt), JSON.stringify([{ target_key: "A-A3-REDRAFT", score: 3, not_observed: false }]), M().tutorAn, randomUUID()]);
      expect(r).toHaveLength(1);
      // D4: neither A3 target is in a published target set
      expect(await n("select count(*)::int as n from english.target_set_definitions where target_ids && array['A-A3-REDRAFT', 'B-A3-REVISE']")).toBe(0);
    });

    it("purge: the dry run counts the three books and the purge deletes them with the attempts, with a matching receipt", async () => {
      // a throwaway TEST child with its own student login, in the test family, with An's tutor
      const user = await createAuthUser(db.client, `s6-purge-${randomUUID().slice(0, 8)}@test.local`);
      const member = (await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'student', 'Em thử S6') returning id", [user, s.familyId]))[0]!.id;
      const learner = (await q1<{ id: string }>(
        "insert into english.learners(family_id, alias, track_id, is_test, status, member_id) values ($1, 'Em thử S6', 'A', true, 'active', $2) returning id", [s.familyId, member]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'tutor')", [M().tutorAn, learner]);
      const x = (await q1<{ id: string }>("select english.eng_assign_inquiry($1, 'A-W1-VOLCANOES', 1, $2, $3, $4) as id",
        [learner, dueReleasingAll("A-W1-VOLCANOES"), M().parent, `s6-purge-${randomUUID()}`]))[0]!.id;
      const root = (await submitText(user, await step(x, 6), TEXT_A)).attempt_id;
      const rev = (await write(M().tutorAn, root)).revision_activity_id!;
      const r = await reviseAs(user, rev, `${TEXT_A} So it is violent.`, { "1": { choice: "changed" }, "2": { choice: "changed" } });
      await finish(M().tutorAn, r.attempt_id, { checks: [{ n: 1, verdict: "improved" }, { n: 2, verdict: "improved" }] });

      const preview = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [learner]);
      expect([preview.counts.feedback_notes, preview.counts.revision_marks, preview.counts.revision_checks]).toEqual([2, 2, 2]); // feedback + closing
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [learner, U().parent]);
      expect(receipt.deleted).toEqual(preview.counts);
      expect(await n(`select ((select count(*) from english.feedback_notes where learner_id = $1) + (select count(*) from english.revision_marks where learner_id = $1)
                      + (select count(*) from english.revision_checks where learner_id = $1) + (select count(*) from english.attempts where learner_id = $1)
                      + (select count(*) from english.activity_instances where learner_id = $1))::int as n`, [learner])).toBe(0);
    });
  });
```

- [ ] **Step 6: Run** — `npm run test:db` (the whole DB suite: S5 inbox tests, `review.test.ts`, and `reviewHardening.test.ts` must stay green with the new inbox) → PASS.

- [ ] **Step 7: Lint the DB test** — `npx eslint tests/db/feedbackRevision.test.ts tests/unit/migration0021.test.ts` → clean. Every helper of Task 1 (`write`, `finish`, `reviseAs`, `studentRead`, `dueReleasing`, `episodeOf`) is used by now.

- [ ] **Step 8: Commit**

```bash
git add db/migrations/0021_feedback_revision.sql tests/unit/migration0021.test.ts tests/db/feedbackRevision.test.ts
git commit -m "feat(s6): migration 0021 part 4 - verdicts with Xong or round 2, feedback panel and before-after reads, 'Bài đã sửa' list, inbox closes revisions"
```

---

### Task 5: `lib/revision` core — types, text clean-up, score words, word diff, excerpts, rules, parsers, copy

**Files:**
- Create: `lib/revision/types.ts`, `lib/revision/text.ts`, `lib/revision/scoreWords.ts`, `lib/revision/diff.ts`, `lib/revision/excerpt.ts`, `lib/revision/rules.ts`, `lib/revision/shape.ts`, `tests/unit/revision.test.ts`
- Modify: `lib/copy/vi.ts` (new `feedbackCopy`, `revisionCopy`, `revisionReviewCopy`; `purgePage.countLabels` +3; `inquiriesPage.stepLabel`), `tests/unit/purge.test.ts`, `tests/unit/copy-and-visibility.test.ts`

**Interfaces:**
- Consumes: `Assistance` (`lib/work/types.ts`); `tutorHonorific`, `tutorHonorificCap` (`lib/copy/vi.ts`); `SCORE_WORD_SAMPLES` (Task 1).
- Produces:
  - `lib/revision/types.ts`: `PRAISE_MAX = 160`, `ITEM_MAX = 200`, `EXCERPT_MAX = 120`, `CLOSING_MAX = 300`, `REASON_MAX = 300`, `MAX_ITEMS = 3`, `MAX_ROUNDS = 2`, `AUTO_REVISION_STEP_BASE = 1000`, `SEEN_DAYS = 14`; `MARK_CHOICES`, `MarkChoice`; `VERDICTS`, `Verdict`; `verdictsFor(choice: MarkChoice): readonly [Verdict, Verdict]`; types `Leaf`, `FeedbackItem`, `FeedbackDraftItem`, `RevisionState`, `LiveFeedback`, `FeedbackPanelView`, `Mark`, `Check`, `RevisionView`, `RevisionListItem`, `MyFeedbackState`, `MyFeedbackItem`, `MarkDraft`, `RevisionDraftContent`, `MyRevisionView`.
  - `lib/revision/text.ts`: `cleanText(s: string): string` (mirror of `english.eng_clean_text`), `isUnchanged(before: string, after: string): boolean`.
  - `lib/revision/scoreWords.ts`: `hasScoreWords(s: string | null | undefined): boolean` (mirror of `english.eng_has_score_words`).
  - `lib/revision/diff.ts`: `DiffOp`, `DiffToken = { op: "same" | "del" | "add"; text: string }`, `DIFF_MAX_CELLS`, `diffWords(before: string, after: string): DiffToken[]`, `changeCount(tokens: DiffToken[]): { added: number; removed: number }`.
  - `lib/revision/excerpt.ts`: `findExcerpt(text: string, excerpt: string): { start: number; end: number } | null`, `Segment = { text: string; n: number | null }`, `segmentsFor(text: string, items: { n: number; excerpt: string | null }[]): Segment[]`.
  - `lib/revision/rules.ts`: `FeedbackProblem`, `checkFeedback(praise: string, items: FeedbackDraftItem[], text: string | null): FeedbackProblem | null`; `MarksProblem`, `checkMarks(items: { n: number }[], marks: Record<string, MarkDraft>, reasonRequired: boolean, unchanged: boolean): MarksProblem | null`; `marksToSend(items: { n: number }[], marks: Record<string, MarkDraft>): Record<string, { choice: MarkChoice; reason?: string }>`; `missingVerdicts(items: { n: number }[], verdicts: Record<number, Verdict | undefined>): number`.
  - `lib/revision/shape.ts`: `parseFeedbackPanel(raw: unknown): FeedbackPanelView | null`, `parseRevisionView(raw: unknown): RevisionView | null`, `parseRevisionList(raw: unknown): RevisionListItem[]`, `parseMyFeedback(raw: unknown): MyFeedbackItem[]`, `parseMyRevision(raw: unknown): MyRevisionView | null`. The student parsers STRIP every key not in the type.
  - `lib/copy/vi.ts`: `feedbackCopy`, `revisionCopy` (student), `revisionReviewCopy` (staff); `purgePage.countLabels.{feedback_notes, revision_marks, revision_checks}`; `inquiriesPage.stepLabel(n)` says "Bước sửa bài" for `n > 1000`.

- [ ] **Step 1: Write the failing test** — `tests/unit/revision.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { feedbackCopy, inquiriesPage, revisionCopy, revisionReviewCopy, tutorHonorific } from "@/lib/copy/vi";
import { changeCount, diffWords } from "@/lib/revision/diff";
import { findExcerpt, segmentsFor } from "@/lib/revision/excerpt";
import { checkFeedback, checkMarks, marksToSend, missingVerdicts } from "@/lib/revision/rules";
import { hasScoreWords } from "@/lib/revision/scoreWords";
import { parseFeedbackPanel, parseMyFeedback, parseMyRevision, parseRevisionList, parseRevisionView } from "@/lib/revision/shape";
import { cleanText, isUnchanged } from "@/lib/revision/text";
import { verdictsFor } from "@/lib/revision/types";
import { SCORE_WORD_SAMPLES } from "./fixtures/scoreWords";

const TEXT = "Some volcanoes explode because the magma is thick. Other volcanoes let lava flow gently.";

describe("score words (same samples as the database)", () => {
  it("agrees with english.eng_has_score_words on every shared sample", () => {
    for (const [text, hit] of SCORE_WORD_SAMPLES) expect(hasScoreWords(text), text).toBe(hit);
    expect(hasScoreWords(null)).toBe(false);
    expect(hasScoreWords("Điẻm".normalize("NFD"))).toBe(false); // not the word "điểm"
    expect(hasScoreWords("điểm")).toBe(true); // "điểm" written with a combining hook (NFD) is caught after NFC
  });
});

describe("text clean-up (mirror of eng_clean_text)", () => {
  it("normalises spaces, zero-width characters and curly quotes; an edit of spacing only is 'unchanged'", () => {
    expect(cleanText("  It’s a   “volcano”.​ ")).toBe("It's a \"volcano\".");
    expect(isUnchanged("Magma rises.\n\nIt is hot.", "Magma rises. It is hot.  ")).toBe(true);
    expect(isUnchanged("Magma rises.", "Magma rises fast.")).toBe(false);
  });
});

describe("word diff", () => {
  it("marks removed and added words; spacing alone is not a change; identical texts are one 'same' run", () => {
    expect(diffWords("a b c", "a x c")).toEqual([
      { op: "same", text: "a " }, { op: "del", text: "b " }, { op: "add", text: "x " }, { op: "same", text: "c" },
    ]);
    expect(diffWords(TEXT, TEXT)).toEqual([{ op: "same", text: TEXT }]);
    expect(diffWords("a  b", "a b")).toEqual([{ op: "same", text: "a b" }]);
    expect(diffWords("", "new text")).toEqual([{ op: "add", text: "new text" }]);
    expect(diffWords("old", "")).toEqual([{ op: "del", text: "old" }]);
  });

  it("keeps the order of a real revision and counts the changed words", () => {
    const t = diffWords("The gas stays inside. The pressure grows.", "The gas stays inside, so the pressure grows a lot.");
    expect(t.map((x) => x.op)).toEqual(["same", "del", "add", "same", "del", "add"]);
    expect(t.filter((x) => x.op !== "del").map((x) => x.text).join("")).toBe("The gas stays inside, so the pressure grows a lot.");
    expect(t.filter((x) => x.op !== "add").map((x) => x.text).join("")).toBe("The gas stays inside. The pressure grows.");
    // added "inside, so the" + "grows a lot." (6 words); removed "inside. The" + "grows." (3 words)
    expect(changeCount(t)).toEqual({ added: 6, removed: 3 });
  });
});

describe("excerpts", () => {
  it("finds an excerpt whatever the spacing or quotes; overlapping excerpts keep the first; unknown ones are left out", () => {
    expect(findExcerpt(TEXT, "Other  volcanoes let\nlava")).toEqual({ start: TEXT.indexOf("Other"), end: TEXT.indexOf(" flow") });
    expect(findExcerpt("It’s hot.", "It's hot")).toEqual({ start: 0, end: 8 });
    expect(findExcerpt(TEXT, "not there")).toBeNull();
    const seg = segmentsFor(TEXT, [{ n: 2, excerpt: "let lava flow" }, { n: 1, excerpt: "the magma is thick" }, { n: 3, excerpt: "magma" }, { n: 4, excerpt: null }]);
    expect(seg.filter((s) => s.n !== null).map((s) => [s.n, s.text])).toEqual([[1, "the magma is thick"], [2, "let lava flow"]]);
    expect(seg.map((s) => s.text).join("")).toBe(TEXT);
  });
});

describe("rules", () => {
  const items = [{ text: "Thêm câu kết.", excerpt: "Other volcanoes", leaf: null }, { text: "Dùng thêm từ nối.", excerpt: "", leaf: null }];
  it("feedback: praise, 1-3 items, lengths, no scores, the excerpt must be in the work", () => {
    expect(checkFeedback("Con viết rõ.", items, TEXT)).toBeNull();
    expect(checkFeedback(" ", items, TEXT)).toBe("praise_required");
    expect(checkFeedback("x".repeat(161), items, TEXT)).toBe("praise_required");
    expect(checkFeedback("Tốt", [], TEXT)).toBe("items_required");
    expect(checkFeedback("Tốt", [...items, ...items], TEXT)).toBe("items_required");
    expect(checkFeedback("Tốt", [{ text: "", excerpt: "", leaf: null }], TEXT)).toBe("items_required");
    expect(checkFeedback("Tốt", [{ text: "x".repeat(201), excerpt: "", leaf: null }], TEXT)).toBe("item_too_long");
    expect(checkFeedback("Được 3/4", items, TEXT)).toBe("score_words");
    expect(checkFeedback("Tốt", [{ text: "Sai 2 điểm", excerpt: "", leaf: null }], TEXT)).toBe("score_words");
    expect(checkFeedback("Tốt", [{ text: "Sửa.", excerpt: "x".repeat(121), leaf: null }], TEXT)).toBe("excerpt_too_long");
    expect(checkFeedback("Tốt", [{ text: "Sửa.", excerpt: "Not in it", leaf: null }], TEXT)).toBe("excerpt_not_found");
    // an excerpt may quote "3/4" from the child's English: never a score-word error
    expect(checkFeedback("Tốt", [{ text: "Sửa câu này.", excerpt: "3/4 of", leaf: null }], "About 3/4 of the Earth is water.")).toBeNull();
  });

  it("marks: every item, reason as the track requires, an unchanged text means 'kept' with a reason", () => {
    const its = [{ n: 1 }, { n: 2 }];
    expect(checkMarks(its, { "1": { choice: "changed" } }, false, false)).toBe("marks_incomplete");
    expect(checkMarks(its, { "1": { choice: "changed" }, "2": { choice: "kept" } }, false, false)).toBeNull();
    expect(checkMarks(its, { "1": { choice: "changed" }, "2": { choice: "kept" } }, true, false)).toBe("reason_required");
    expect(checkMarks(its, { "1": { choice: "kept", reason: "Đúng rồi" }, "2": { choice: "changed", reason: "x" } }, false, true)).toBe("unchanged_needs_reason");
    expect(checkMarks(its, { "1": { choice: "kept", reason: "a" }, "2": { choice: "kept", reason: "b" } }, false, true)).toBeNull();
    expect(checkMarks(its, { "1": { choice: "kept", reason: "x".repeat(301) }, "2": { choice: "kept" } }, false, false)).toBe("reason_too_long");
    expect(marksToSend(its, { "1": { choice: "changed", reason: "  " }, "2": { choice: "kept", reason: " vì đúng " }, "3": { choice: "kept" } })).toEqual({
      "1": { choice: "changed" }, "2": { choice: "kept", reason: "vì đúng" },
    });
  });

  it("verdicts fit the child's choice; every item needs one", () => {
    expect(verdictsFor("changed")).toEqual(["improved", "not_yet"]);
    expect(verdictsFor("kept")).toEqual(["reason_ok", "not_yet"]);
    expect(missingVerdicts([{ n: 1 }, { n: 2 }], { 1: "improved" })).toBe(1);
  });
});

describe("parsers", () => {
  it("the child's parsers keep only what the child may see (no leaf, score, verdict or author)", () => {
    const mine = parseMyFeedback({ items: [{ feedback_id: "f", activity_id: "a", title_vi: "Núi lửa", round: 1, items_count: 2, state: "todo", seen_at: null,
      closing_note: null, praise: null, notes: null, score: 3, verdicts: ["improved"], author_name: "Cô X" }] });
    expect(mine).toEqual([{ feedbackId: "f", activityId: "a", titleVi: "Núi lửa", round: 1, itemsCount: 2, state: "todo", seenAt: null, closingNote: null, praise: null, notes: null }]);
    const page = parseMyRevision({ activity_id: "a", instance_id: "i", title_vi: "Núi lửa", big_question_en: null, round: 1, praise: "Tốt",
      items: [{ n: 1, text: "Thêm câu kết.", excerpt: null, leaf: { kind: "tag", ref_key: "x" } }], old_text: TEXT, reason_required: true, state: "todo",
      submitted_at: null, closing_note: null, draft: { content: { text: "draft", marks: { "1": { choice: "kept" } } }, revision: 2, updated_at: "2026-10-22T01:00:00Z" } });
    expect(page?.items).toEqual([{ n: 1, text: "Thêm câu kết.", excerpt: null }]);
    expect(JSON.stringify(page)).not.toContain("leaf");
    expect(page?.draft?.content.marks).toEqual({ "1": { choice: "kept" } });
    expect(parseMyRevision(null)).toBeNull();
  });

  it("the staff parsers map the panel, the before-after view and the list", () => {
    const panel = parseFeedbackPanel({ eligible: true, can_give: false, text: TEXT, history: [],
      live: { id: "f", praise: "Tốt", items: [{ n: 1, text: "Sửa.", leaf: { kind: "tag", ref_key: "a-past" } }], requires_revision: true, round: 1,
        revision_activity_id: "r", author_name: "Cô An", author_is_me: true, created_at: "2026-10-22T01:00:00Z", editable: true, revision_state: "todo", revision_episode_id: null } });
    expect(panel?.live?.items).toEqual([{ n: 1, text: "Sửa.", excerpt: null, leaf: { kind: "tag", refKey: "a-past" } }]);
    const view = parseRevisionView({ attempt_id: "r", episode_id: "e", learner_id: "l", alias: "An", round: 1, title_vi: "Núi lửa", submitted_at: "2026-10-22T01:00:00Z",
      before: { attempt_id: "o", episode_id: "eo", text: "old", submitted_at: "2026-10-21T01:00:00Z" }, after: { text: "new" },
      feedback: { id: "f", praise: "Tốt", items: [{ n: 1, text: "Sửa." }], author_name: null, created_at: "2026-10-21T02:00:00Z" },
      marks: [{ n: 1, choice: "kept", reason: null }], checks: [], closing: null, next_round: null, reason_required: false, can_finish: true, can_open_round2: true });
    expect(view).toMatchObject({ round: 1, before: { text: "old" }, after: { text: "new" }, marks: [{ n: 1, choice: "kept", reason: null }], canOpenRound2: true });
    expect(parseRevisionList({ items: [{ attempt_id: "r", episode_id: "e", title_vi: "Núi lửa", round: 2, submitted_at: "2026-10-22T01:00:00Z", items_count: 2, state: "done", good: 1, not_yet: 1 }] }))
      .toEqual([{ attemptId: "r", episodeId: "e", titleVi: "Núi lửa", round: 2, submittedAt: "2026-10-22T01:00:00Z", itemsCount: 2, state: "done", good: 1, notYet: 1 }]);
  });
});

describe("S6 copy", () => {
  const strings = (o: unknown, args: unknown[] = [2, 3]): string[] =>
    typeof o === "string" ? [o]
      : typeof o === "function" ? strings((o as (...a: unknown[]) => unknown)(...args), args)
        : o && typeof o === "object" ? Object.values(o).flatMap((v) => strings(v, args)) : [];
  it("the child's copy has no score words; the person teaching is always tutorHonorific (never a bare 'cô' / 'thầy')", () => {
    for (const s of strings(revisionCopy)) expect(hasScoreWords(s), s).toBe(false);
    const bare = /(^|[^/\p{L}])(cô|thầy|Cô|Thầy)([^/\p{L}]|$)/u;
    for (const s of [...strings(revisionCopy), ...strings(feedbackCopy), ...strings(revisionReviewCopy)]) expect(bare.test(s), s).toBe(false);
    expect(revisionCopy.seenTitle).toContain(tutorHonorific.charAt(0).toUpperCase() + tutorHonorific.slice(1));
    expect(revisionCopy.rowLine(2)).toBe(`2 góp ý của ${tutorHonorific}`);
  });
  it("labels from the spec and the UX guide", () => {
    expect(feedbackCopy.title).toBe("Góp ý cho con");
    expect([revisionCopy.changed, revisionCopy.kept]).toEqual(["Đã sửa", "Giữ nguyên"]);
    expect(revisionReviewCopy.inboxLabel(2)).toBe("Bài sửa lại (vòng 2)");
    expect(revisionCopy.receiptTitle).toBe("Đã nộp bài sửa!");
    expect(inquiriesPage.stepLabel(7)).toBe("Bước 7");
    expect(inquiriesPage.stepLabel(1001)).toBe("Bước sửa bài");
  });
});
```

Append to `tests/unit/purge.test.ts`: replace `"files", "upload_tickets", "reading_reports", "level_decisions", "external_results",` with `"files", "upload_tickets", "reading_reports", "level_decisions", "external_results", "feedback_notes", "revision_marks", "revision_checks",`.

In `tests/unit/copy-and-visibility.test.ts`, add `revisionCopy, revisionReviewCopy` to the import from `@/lib/copy/vi`, and inside `describe("copy (UX_COPY_GUIDE v0.1)", …)` add:

```ts
  it("S6 follows the guide: REVISION is 'Sửa bài' for the child and 'Bài sửa lại' for staff", () => {
    expect(modeLabels.REVISION).toEqual({ student: "Sửa bài", staff: "Bài sửa lại" });
    expect(revisionCopy.pageTitle).toBe(modeLabels.REVISION.student);
    expect(revisionReviewCopy.title(1).startsWith(modeLabels.REVISION.staff)).toBe(true);
  });
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/revision.test.ts tests/unit/purge.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Create `lib/revision/types.ts`**

```ts
/** S6 · Góp ý cho con + Sửa bài: limits and shapes shared by screens, routes and parsers. The limits mirror migration 0021. */
import type { Assistance } from "@/lib/work/types";

export const PRAISE_MAX = 160;
export const ITEM_MAX = 200;
export const EXCERPT_MAX = 120;
export const CLOSING_MAX = 300;
export const REASON_MAX = 300;
export const MAX_ITEMS = 3;
export const MAX_ROUNDS = 2;
/** Revision steps the app adds after a template's steps are numbered 1001, 1002, … (migration 0021, D3). */
export const AUTO_REVISION_STEP_BASE = 1000;
/** "Thầy/cô đã xem bài sửa của bạn" and "Chỉ góp ý" notes stay on the child's home this many days (D10, D12; same number in eng_my_feedback). */
export const SEEN_DAYS = 14;

export const MARK_CHOICES = ["changed", "kept"] as const;
export type MarkChoice = (typeof MARK_CHOICES)[number];
export const VERDICTS = ["improved", "not_yet", "reason_ok"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** The two verdicts that fit the child's choice (spec 3-a): Đã sửa → Cải thiện thật / Chưa; Giữ nguyên → Lý do hợp lý / Chưa. */
export function verdictsFor(choice: MarkChoice): readonly [Verdict, Verdict] {
  return choice === "changed" ? ["improved", "not_yet"] : ["reason_ok", "not_yet"];
}

export type Leaf = { kind: "tag" | "target"; refKey: string };
export type FeedbackItem = { n: number; text: string; excerpt: string | null; leaf: Leaf | null };
/** One item while the adult types it (excerpt "" = none). */
export type FeedbackDraftItem = { text: string; excerpt: string; leaf: Leaf | null };
export type RevisionState = "todo" | "started" | "submitted" | "seen";

export type LiveFeedback = {
  id: string;
  praise: string;
  items: FeedbackItem[];
  requiresRevision: boolean;
  round: number;
  revisionActivityId: string | null;
  authorName: string | null;
  authorIsMe: boolean;
  createdAt: string;
  /** "Sửa góp ý" is offered: the author, still allowed to review, and the child has not started (1-c). */
  editable: boolean;
  revisionState: RevisionState | null;
  revisionEpisodeId: string | null;
};

export type FeedbackPanelView = {
  /** In-app writing (D8). */
  eligible: boolean;
  /** This person may send new feedback now. */
  canGive: boolean;
  text: string | null;
  live: LiveFeedback | null;
  history: { id: string; praise: string; items: FeedbackItem[]; createdAt: string; authorName: string | null }[];
};

export type Mark = { n: number; choice: MarkChoice; reason: string | null };
export type Check = { n: number; verdict: Verdict; checkerName: string | null; createdAt: string };

export type RevisionView = {
  attemptId: string;
  episodeId: string;
  learnerId: string;
  alias: string;
  round: number;
  titleVi: string;
  submittedAt: string;
  before: { attemptId: string; episodeId: string | null; text: string; submittedAt: string };
  after: { text: string };
  feedback: { id: string; praise: string; items: FeedbackItem[]; authorName: string | null; createdAt: string };
  marks: Mark[];
  checks: Check[];
  closing: { note: string | null; authorName: string | null; createdAt: string } | null;
  nextRound: { feedbackId: string; createdAt: string } | null;
  reasonRequired: boolean;
  canFinish: boolean;
  canOpenRound2: boolean;
};

export type RevisionListItem = {
  attemptId: string;
  episodeId: string;
  titleVi: string;
  round: number;
  submittedAt: string;
  itemsCount: number;
  state: "waiting" | "done";
  /** Items judged "Cải thiện thật" or "Lý do hợp lý". */
  good: number;
  notYet: number;
};

/** What the child receives (eng_my_feedback / eng_my_revision): never a score, a verdict, a skill leaf or an author. */
export type MyFeedbackState = "todo" | "submitted" | "seen" | "note";
export type MyFeedbackItem = {
  feedbackId: string;
  activityId: string;
  titleVi: string;
  round: number;
  itemsCount: number;
  state: MyFeedbackState;
  seenAt: string | null;
  closingNote: string | null;
  /** Only for a "Chỉ góp ý" note. */
  praise: string | null;
  notes: { n: number; text: string; excerpt: string | null }[] | null;
};

export type MarkDraft = { choice?: MarkChoice; reason?: string };
export type RevisionDraftContent = { text?: string; marks?: Record<string, MarkDraft>; pasted?: boolean; assistance?: Assistance[] };

export type MyRevisionView = {
  activityId: string;
  instanceId: string;
  titleVi: string;
  bigQuestionEn: string | null;
  round: number;
  praise: string;
  items: { n: number; text: string; excerpt: string | null }[];
  oldText: string;
  reasonRequired: boolean;
  state: "todo" | "submitted" | "seen";
  submittedAt: string | null;
  closingNote: string | null;
  draft: { content: RevisionDraftContent; revision: number; updatedAt: string } | null;
};
```

- [ ] **Step 4: Create `lib/revision/text.ts` and `lib/revision/scoreWords.ts`**

```ts
// lib/revision/text.ts
/**
 * Same clean-up as english.eng_clean_text (migration 0009): NFC; odd spaces → " "; zero-width characters removed; curly quotes →
 * straight; runs of white space → one space; trimmed. Used to test excerpts and "the text did not change" exactly as the database does.
 */
export function cleanText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[   -  　]/g, " ")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** The revision changed no word (spacing does not count) - then every item must be "Giữ nguyên" with a reason (spec §2.4). */
export function isUnchanged(before: string, after: string): boolean {
  return cleanText(before) === cleanText(after);
}
```

```ts
// lib/revision/scoreWords.ts
/**
 * Adult text that looks like a score (spec §6): "3/4", "3 / 4", the word "điểm" in any case, or "%". Mirror of english.eng_has_score_words;
 * both are tested on tests/unit/fixtures/scoreWords.ts. Never applied to the child's excerpt or reasons.
 */
export function hasScoreWords(s: string | null | undefined): boolean {
  const t = (s ?? "").normalize("NFC");
  return /[0-9]+\s*\/\s*[0-9]+/.test(t) || /[đĐ][iI][ểỂ][mM]/.test(t) || t.includes("%");
}
```

- [ ] **Step 5: Create `lib/revision/diff.ts`**

```ts
/** Word-level before–after diff for the "Bài sửa lại" view (pure, unit-tested). Spaces never count as a change. */
export type DiffOp = "same" | "del" | "add";
export type DiffToken = { op: DiffOp; text: string };

/** Beyond this many cells (words × words) the diff stops and shows "all removed / all added", so a huge text cannot freeze the page. */
export const DIFF_MAX_CELLS = 4_000_000;

/** Words with the white space that follows them ("magma " / "rises.\n"); leading white space is its own token. */
function tokensOf(s: string): string[] {
  return s.match(/\s+|\S+\s*/g) ?? [];
}
const word = (t: string) => t.trim();

export function diffWords(before: string, after: string): DiffToken[] {
  const a = tokensOf(before);
  const b = tokensOf(after);
  const out: DiffToken[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  if (a.length * b.length > DIFF_MAX_CELLS) {
    if (before) push("del", before);
    if (after) push("add", after);
    return out;
  }
  // lcs[i][j] = longest common word run of a[i..] and b[j..]
  const lcs: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = word(a[i]!) === word(b[j]!) ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (word(a[i]!) === word(b[j]!)) {
      push("same", b[j]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push("del", a[i]!);
      i++;
    } else {
      push("add", b[j]!);
      j++;
    }
  }
  while (i < a.length) push("del", a[i++]!);
  while (j < b.length) push("add", b[j++]!);
  return out;
}

/** How many words were added / removed (for the one-line summary above the diff). */
export function changeCount(tokens: DiffToken[]): { added: number; removed: number } {
  const words = (s: string) => (s.match(/\S+/g) ?? []).length;
  return {
    added: tokens.filter((t) => t.op === "add").reduce((n, t) => n + words(t.text), 0),
    removed: tokens.filter((t) => t.op === "del").reduce((n, t) => n + words(t.text), 0),
  };
}
```

- [ ] **Step 6: Create `lib/revision/excerpt.ts`**

```ts
/** Excerpts of feedback items, found in the child's text for highlighting (pure). The database checks the excerpt the same way (cleaned text). */
import { cleanText } from "./text";

const escapeRe = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A straight quote in the (cleaned) excerpt matches a straight or curly one in the text. */
const QUOTE: Record<string, string> = { "'": "['‘’‛]", '"': '["“”]' };
const SPACE = "[\\s\\u00A0\\u202F\\u2000-\\u200A\\u205F\\u3000]+";

/** Where the excerpt sits in the text, ignoring differences in spacing and quote style; null when it is not there. */
export function findExcerpt(text: string, excerpt: string): { start: number; end: number } | null {
  const words = cleanText(excerpt).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const pattern = words.map((w) => Array.from(w).map((ch) => QUOTE[ch] ?? escapeRe(ch)).join("")).join(SPACE);
  const m = new RegExp(pattern).exec(text);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

export type Segment = { text: string; n: number | null };

/** The text cut into plain parts and the excerpts of the numbered items (first place of each; an excerpt overlapping an earlier one is skipped). */
export function segmentsFor(text: string, items: { n: number; excerpt: string | null }[]): Segment[] {
  const spans = items
    .flatMap((it) => {
      if (!it.excerpt) return [];
      const at = findExcerpt(text, it.excerpt);
      return at ? [{ ...at, n: it.n }] : [];
    })
    .sort((x, y) => x.start - y.start || x.n - y.n);
  const out: Segment[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue;
    if (s.start > pos) out.push({ text: text.slice(pos, s.start), n: null });
    out.push({ text: text.slice(s.start, s.end), n: s.n });
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), n: null });
  return out;
}
```

- [ ] **Step 7: Create `lib/revision/rules.ts`**

```ts
/** Form rules shared by the screens and the routes (the database checks the same rules again). Pure. */
import { hasScoreWords } from "./scoreWords";
import { cleanText } from "./text";
import { EXCERPT_MAX, ITEM_MAX, MAX_ITEMS, PRAISE_MAX, REASON_MAX, type FeedbackDraftItem, type MarkChoice, type MarkDraft, type Verdict } from "./types";

export type FeedbackProblem = "praise_required" | "items_required" | "item_too_long" | "excerpt_too_long" | "excerpt_not_found" | "score_words";

export function checkFeedback(praise: string, items: FeedbackDraftItem[], text: string | null): FeedbackProblem | null {
  const p = praise.trim();
  if (p.length < 1 || p.length > PRAISE_MAX) return "praise_required";
  if (items.length < 1 || items.length > MAX_ITEMS || items.some((i) => i.text.trim() === "")) return "items_required";
  if (items.some((i) => i.text.trim().length > ITEM_MAX)) return "item_too_long";
  if (hasScoreWords(p) || items.some((i) => hasScoreWords(i.text))) return "score_words";
  for (const i of items) {
    const ex = i.excerpt.trim();
    if (ex.length > EXCERPT_MAX) return "excerpt_too_long";
    if (ex && text !== null && !cleanText(text).includes(cleanText(ex))) return "excerpt_not_found";
  }
  return null;
}

export type MarksProblem = "marks_incomplete" | "reason_required" | "unchanged_needs_reason" | "reason_too_long";

export function checkMarks(items: { n: number }[], marks: Record<string, MarkDraft>, reasonRequired: boolean, unchanged: boolean): MarksProblem | null {
  for (const it of items) {
    const m = marks[String(it.n)];
    if (!m?.choice) return "marks_incomplete";
    const reason = (m.reason ?? "").trim();
    if (reason.length > REASON_MAX) return "reason_too_long";
    if (reasonRequired && !reason) return "reason_required";
    if (unchanged && (m.choice !== "kept" || !reason)) return "unchanged_needs_reason";
  }
  return null;
}

/** The marks of this round's items, ready to send: {"1": {choice, reason?}}; empty reasons are left out. */
export function marksToSend(items: { n: number }[], marks: Record<string, MarkDraft>): Record<string, { choice: MarkChoice; reason?: string }> {
  const out: Record<string, { choice: MarkChoice; reason?: string }> = {};
  for (const it of items) {
    const m = marks[String(it.n)];
    if (!m?.choice) continue;
    const reason = (m.reason ?? "").trim();
    out[String(it.n)] = reason ? { choice: m.choice, reason } : { choice: m.choice };
  }
  return out;
}

export function missingVerdicts(items: { n: number }[], verdicts: Record<number, Verdict | undefined>): number {
  return items.filter((it) => !verdicts[it.n]).length;
}
```

- [ ] **Step 8: Create `lib/revision/shape.ts`**

```ts
/**
 * Parsers for what migration 0021 returns. Staff parsers map to camelCase. The CHILD's parsers are allowlists: zod objects drop every key
 * that is not listed, so a future column (a verdict, a leaf, an author) can never reach a child by accident. An unexpected shape throws → 500.
 */
import { z } from "zod";
import { ASSISTANCE_VALUES } from "@/lib/work/types";
import {
  MARK_CHOICES,
  VERDICTS,
  type FeedbackItem,
  type FeedbackPanelView,
  type MyFeedbackItem,
  type MyRevisionView,
  type RevisionListItem,
  type RevisionView,
} from "./types";

const text = z.string();
const nullableText = z.string().nullable().optional().transform((v) => v ?? null);
const int = z.number().int();
const leaf = z.object({ kind: z.enum(["tag", "target"]), ref_key: text });
const item = z.object({ n: int, text, excerpt: nullableText, leaf: leaf.nullable().optional().transform((v) => v ?? null) });
const toItem = (i: z.infer<typeof item>): FeedbackItem => ({ n: i.n, text: i.text, excerpt: i.excerpt, leaf: i.leaf ? { kind: i.leaf.kind, refKey: i.leaf.ref_key } : null });

const panelSchema = z.object({
  eligible: z.boolean(),
  can_give: z.boolean(),
  text: nullableText,
  live: z
    .object({
      id: text, praise: text, items: z.array(item), requires_revision: z.boolean(), round: int, revision_activity_id: nullableText,
      author_name: nullableText, author_is_me: z.boolean(), created_at: text, editable: z.boolean(),
      revision_state: z.enum(["todo", "started", "submitted", "seen"]).nullable().optional().transform((v) => v ?? null),
      revision_episode_id: nullableText,
    })
    .nullable(),
  history: z.array(z.object({ id: text, praise: text, items: z.array(item), created_at: text, author_name: nullableText })),
});

export function parseFeedbackPanel(raw: unknown): FeedbackPanelView | null {
  if (raw === null || raw === undefined) return null;
  const r = panelSchema.parse(raw);
  return {
    eligible: r.eligible,
    canGive: r.can_give,
    text: r.text,
    live: r.live && {
      id: r.live.id, praise: r.live.praise, items: r.live.items.map(toItem), requiresRevision: r.live.requires_revision, round: r.live.round,
      revisionActivityId: r.live.revision_activity_id, authorName: r.live.author_name, authorIsMe: r.live.author_is_me, createdAt: r.live.created_at,
      editable: r.live.editable, revisionState: r.live.revision_state, revisionEpisodeId: r.live.revision_episode_id,
    },
    history: r.history.map((h) => ({ id: h.id, praise: h.praise, items: h.items.map(toItem), createdAt: h.created_at, authorName: h.author_name })),
  };
}

const viewSchema = z.object({
  attempt_id: text, episode_id: text, learner_id: text, alias: text, round: int, title_vi: text, submitted_at: text,
  before: z.object({ attempt_id: text, episode_id: nullableText, text, submitted_at: text }),
  after: z.object({ text }),
  feedback: z.object({ id: text, praise: text, items: z.array(item), author_name: nullableText, created_at: text }),
  marks: z.array(z.object({ n: int, choice: z.enum(MARK_CHOICES), reason: nullableText })),
  checks: z.array(z.object({ n: int, verdict: z.enum(VERDICTS), checker_name: nullableText, created_at: text })),
  closing: z.object({ note: nullableText, author_name: nullableText, created_at: text }).nullable(),
  next_round: z.object({ feedback_id: text, created_at: text }).nullable(),
  reason_required: z.boolean(),
  can_finish: z.boolean(),
  can_open_round2: z.boolean(),
});

export function parseRevisionView(raw: unknown): RevisionView | null {
  if (raw === null || raw === undefined) return null;
  const r = viewSchema.parse(raw);
  return {
    attemptId: r.attempt_id, episodeId: r.episode_id, learnerId: r.learner_id, alias: r.alias, round: r.round, titleVi: r.title_vi, submittedAt: r.submitted_at,
    before: { attemptId: r.before.attempt_id, episodeId: r.before.episode_id, text: r.before.text, submittedAt: r.before.submitted_at },
    after: { text: r.after.text },
    feedback: { id: r.feedback.id, praise: r.feedback.praise, items: r.feedback.items.map(toItem), authorName: r.feedback.author_name, createdAt: r.feedback.created_at },
    marks: r.marks.map((m) => ({ n: m.n, choice: m.choice, reason: m.reason })),
    checks: r.checks.map((c) => ({ n: c.n, verdict: c.verdict, checkerName: c.checker_name, createdAt: c.created_at })),
    closing: r.closing && { note: r.closing.note, authorName: r.closing.author_name, createdAt: r.closing.created_at },
    nextRound: r.next_round && { feedbackId: r.next_round.feedback_id, createdAt: r.next_round.created_at },
    reasonRequired: r.reason_required, canFinish: r.can_finish, canOpenRound2: r.can_open_round2,
  };
}

const listSchema = z.object({
  items: z.array(z.object({
    attempt_id: text, episode_id: text, title_vi: text, round: int, submitted_at: text, items_count: int, state: z.enum(["waiting", "done"]), good: int, not_yet: int,
  })),
});

export function parseRevisionList(raw: unknown): RevisionListItem[] {
  return listSchema.parse(raw ?? { items: [] }).items.map((x) => ({
    attemptId: x.attempt_id, episodeId: x.episode_id, titleVi: x.title_vi, round: x.round, submittedAt: x.submitted_at,
    itemsCount: x.items_count, state: x.state, good: x.good, notYet: x.not_yet,
  }));
}

// --- the child's side (allowlists) --------------------------------------------------------------------------------------------------
const childItem = z.object({ n: int, text, excerpt: nullableText });
const myFeedbackSchema = z.object({
  items: z.array(z.object({
    feedback_id: text, activity_id: text, title_vi: text, round: int, items_count: int, state: z.enum(["todo", "submitted", "seen", "note"]),
    seen_at: nullableText, closing_note: nullableText, praise: nullableText,
    notes: z.array(childItem).nullable().optional().transform((v) => v ?? null),
  })),
});

export function parseMyFeedback(raw: unknown): MyFeedbackItem[] {
  return myFeedbackSchema.parse(raw ?? { items: [] }).items.map((x) => ({
    feedbackId: x.feedback_id, activityId: x.activity_id, titleVi: x.title_vi, round: x.round, itemsCount: x.items_count, state: x.state,
    seenAt: x.seen_at, closingNote: x.closing_note, praise: x.praise,
    notes: x.notes && x.notes.map((n) => ({ n: n.n, text: n.text, excerpt: n.excerpt })),
  }));
}

const markDraft = z.object({ choice: z.enum(MARK_CHOICES).optional(), reason: z.string().optional() });
const myRevisionSchema = z.object({
  activity_id: text, instance_id: text, title_vi: text, big_question_en: nullableText, round: int, praise: text,
  items: z.array(childItem), old_text: text, reason_required: z.boolean(), state: z.enum(["todo", "submitted", "seen"]),
  submitted_at: nullableText, closing_note: nullableText,
  draft: z
    .object({
      content: z.object({
        text: z.string().optional(),
        marks: z.record(z.string(), markDraft).optional(),
        pasted: z.boolean().optional(),
        assistance: z.array(z.enum(ASSISTANCE_VALUES)).optional(),
      }),
      revision: int,
      updated_at: text,
    })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

export function parseMyRevision(raw: unknown): MyRevisionView | null {
  if (raw === null || raw === undefined) return null;
  const r = myRevisionSchema.parse(raw);
  return {
    activityId: r.activity_id, instanceId: r.instance_id, titleVi: r.title_vi, bigQuestionEn: r.big_question_en, round: r.round, praise: r.praise,
    items: r.items.map((i) => ({ n: i.n, text: i.text, excerpt: i.excerpt })), oldText: r.old_text, reasonRequired: r.reason_required,
    state: r.state, submittedAt: r.submitted_at, closingNote: r.closing_note,
    draft: r.draft && {
      content: {
        ...(r.draft.content.text !== undefined ? { text: r.draft.content.text } : {}),
        ...(r.draft.content.marks ? { marks: r.draft.content.marks } : {}),
        ...(r.draft.content.pasted !== undefined ? { pasted: r.draft.content.pasted } : {}),
        ...(r.draft.content.assistance ? { assistance: r.draft.content.assistance } : {}),
      },
      revision: r.draft.revision,
      updatedAt: r.draft.updated_at,
    },
  };
}
```

- [ ] **Step 9: Copy** — in `lib/copy/vi.ts`:
  - in `inquiriesPage`, replace `  stepLabel: (n: number) => \`Bước ${n}\`,` with
    ```ts
      // Steps above 1000 are revision steps the app added after the template's steps (S6, migration 0021 D3).
      stepLabel: (n: number) => (n > 1000 ? "Bước sửa bài" : `Bước ${n}`),
    ```
  - in `purgePage.countLabels`, after `    external_results: "Kết quả thi ngoài",` add
    ```ts
        feedback_notes: "Góp ý cho con",
        revision_marks: "Đánh dấu của em khi sửa bài",
        revision_checks: "Đánh giá bài sửa",
    ```
  - append at the end of the file:

```ts
// --- S6 · Góp ý cho con + Sửa bài (spec docs/superpowers/specs/2026-10-22-s6-feedback-revision-design.md). Người dạy luôn là tutorHonorific.
/** Review screen: the "Góp ý cho con" panel (tutor / parent). */
export const feedbackCopy = {
  title: "Góp ý cho con",
  intro: "Một câu khen cụ thể, rồi 1–3 điều con nên sửa. Viết bằng lời, không ghi điểm.",
  praiseLabel: "Câu khen (bắt buộc)",
  praiseHint: "Khen một điều cụ thể con làm tốt trong bài này.",
  itemLabel: (n: number) => `Góp ý ${n}`,
  itemHint: "Một điều con nên sửa, viết ngắn gọn.",
  excerptLabel: "Trích đoạn trong bài (tùy chọn)",
  excerptHint: "Bôi đen một đoạn trong bài rồi bấm “Lấy đoạn đang chọn”, hoặc gõ lại đúng đoạn đó.",
  takeSelection: "Lấy đoạn đang chọn",
  leafLabel: "Gắn kỹ năng (tùy chọn)",
  leafPick: "Chọn kỹ năng",
  leafNone: "Không gắn",
  addItem: "+ Thêm góp ý",
  removeItem: "Bỏ góp ý này",
  modeLegend: "Sau khi gửi",
  requireRevision: "Yêu cầu con sửa bài",
  requireRevisionHint: "Con sẽ thấy “Sửa bài” đầu Việc tiếp theo.",
  noteOnly: "Chỉ góp ý",
  noteOnlyHint: "Con đọc góp ý, không cần nộp lại.",
  send: "Gửi góp ý cho con",
  sending: "Đang gửi…",
  sent: "Đã gửi góp ý cho con.",
  liveTitle: "Góp ý đã gửi",
  byLine: (name: string | null, when: string) => (name ? `${name} · ${when}` : when),
  edit: "Sửa góp ý",
  editHint: "Sửa được cho tới khi con bắt đầu sửa bài. Bản cũ vẫn được giữ trong lịch sử.",
  saveEdit: "Lưu góp ý đã sửa",
  cancel: "Thôi",
  history: (n: number) => `Bản trước (${n})`,
  modeLine: (requires: boolean) => (requires ? "Có yêu cầu con sửa bài" : "Chỉ góp ý"),
  revisionState: {
    todo: "Con chưa bắt đầu sửa",
    started: "Con đang sửa bài",
    submitted: "Con đã nộp bài sửa — đang chờ xem",
    seen: "Đã xem bài sửa",
  } as Record<string, string>,
  openRevision: "Mở bài sửa",
  notEligible: "Góp ý cho con dùng cho bài viết con làm trong app.",
  readOnly: `Bài này chỉ ${tutorHonorific} góp ý được.`,
  errors: {
    praise_required: "Cần một câu khen cụ thể (tối đa 160 ký tự).",
    items_required: "Cần 1–3 góp ý, mỗi ô có chữ.",
    item_too_long: "Mỗi góp ý tối đa 200 ký tự.",
    excerpt_too_long: "Trích đoạn tối đa 120 ký tự.",
    excerpt_not_found: "Trích đoạn phải là một đoạn có thật trong bài của con.",
    score_words: "Góp ý cho con không ghi điểm (như “3/4”, chữ “điểm”, “%”). Bạn viết lại bằng lời nhé.",
    unknown_leaf: "Kỹ năng đã chọn không có trong bản đồ kỹ năng. Bạn chọn lại nhé.",
    already_given: "Bài này đã có góp ý. Bạn tải lại trang để xem.",
    revision_started: "Con đã bắt đầu sửa bài nên không sửa góp ý được nữa.",
    author_only: "Chỉ người gửi góp ý mới sửa được.",
    already_superseded: "Góp ý này vừa được sửa ở nơi khác. Bạn tải lại trang.",
    not_writing: "Góp ý cho con dùng cho bài viết con làm trong app.",
    max_rounds: "Bài này đã sửa 2 vòng. Chỉ còn nhận xét kết.",
    checks_incomplete: "Hãy đánh giá đủ mọi góp ý trước.",
    already_finished: "Bài sửa này đã được xem xong. Bạn tải lại trang.",
    tutor_only: `Bài này chỉ ${tutorHonorific} góp ý và xem bài sửa được.`,
    closing_too_long: "Nhận xét kết tối đa 300 ký tự.",
  } as Record<string, string>,
} as const;

/** The child's side: home rows, the revision page, the receipt. Never a score, a verdict or a skill code. */
export const revisionCopy = {
  rowTitle: (title: string) => `Sửa bài: ${title}`,
  rowLine: (n: number) => `${n} góp ý của ${tutorHonorific}`,
  start: "Bắt đầu sửa",
  submittedRow: `Đã nộp bài sửa — ${tutorHonorific} sẽ xem lại.`,
  seenTitle: `${tutorHonorificCap} đã xem bài sửa của bạn`,
  closingLabel: `Lời nhắn của ${tutorHonorific}`,
  boxTitle: `Góp ý của ${tutorHonorific}`,
  noteTitle: (title: string) => `Góp ý cho bài “${title}”`,
  pageTitle: "Sửa bài",
  secondRound: "Lần sửa thứ hai",
  praiseTitle: `${tutorHonorificCap} khen bạn`,
  itemsTitle: "Những điều nên sửa",
  itemLabel: (n: number) => `Góp ý ${n}`,
  inYourText: "Chỗ này trong bài của bạn:",
  editorTitle: "Bài của bạn — sửa ngay trên bản cũ",
  editorLabel: "Bài sửa của bạn",
  showOld: "Xem bài cũ",
  marksTitle: "Bạn đã làm gì với từng góp ý?",
  changed: "Đã sửa",
  kept: "Giữ nguyên",
  reasonLabel: (required: boolean) => (required ? "Vì sao? (bắt buộc, một câu)" : "Vì sao? (không bắt buộc, một câu)"),
  reasonHint: "Ví dụ: Mình đã đổi … thành … vì …",
  submit: "Nộp bài sửa",
  submitting: "Đang nộp…",
  receiptTitle: "Đã nộp bài sửa!",
  receiptLine: `${tutorHonorificCap} sẽ xem lại.`,
  waiting: `Bạn đã nộp bài sửa. ${tutorHonorificCap} sẽ xem lại.`,
  problems: {
    marks_incomplete: "Bạn chọn “Đã sửa” hoặc “Giữ nguyên” cho mọi góp ý nhé.",
    reason_required: "Bạn viết một câu lý do cho mỗi góp ý nhé.",
    unchanged_needs_reason: "Bài chưa đổi chữ nào: mọi góp ý cần “Giữ nguyên” kèm một câu lý do.",
    reason_too_long: "Mỗi lý do tối đa 300 ký tự.",
    need_text: "Bài sửa chưa có chữ nào.",
  } as Record<string, string>,
  submitError: "Chưa nộp được. Bạn thử lại nhé — bài vẫn đang được lưu.",
  submitConflict: "Bài sửa này đã được nộp rồi. Bạn về trang chủ để xem.",
} as const;

/** "Bài sửa lại" (before–after) and "Bài đã sửa" (tutor / parent). */
export const revisionReviewCopy = {
  title: (round: number) => `Bài sửa lại (vòng ${round})`,
  inboxLabel: (round: number) => `Bài sửa lại (vòng ${round})`,
  intro: "Bài cũ và bài sửa cạnh nhau: chữ bỏ bị gạch, chữ thêm được tô.",
  before: "Bài cũ",
  after: "Bài sửa",
  deletedLabel: "Chữ bỏ:",
  addedLabel: "Chữ thêm:",
  changeLine: (added: number, removed: number) => `Thêm ${added} chữ · bỏ ${removed} chữ`,
  noChange: "Bài không đổi chữ nào.",
  feedbackTitle: "Góp ý đã gửi",
  itemTitle: (n: number) => `Góp ý ${n}`,
  childChose: (choice: "changed" | "kept") => (choice === "changed" ? "Con chọn: Đã sửa" : "Con chọn: Giữ nguyên"),
  childReason: "Lý do của con",
  noReason: "Con không ghi lý do.",
  verdictLegend: "Đánh giá của bạn",
  verdicts: { improved: "Cải thiện thật", not_yet: "Chưa", reason_ok: "Lý do hợp lý" } as Record<string, string>,
  supportedTag: "Bài sửa — có góp ý",
  scoringNote: "Chấm trên bài sửa là tùy chọn: kỹ năng “Sửa bài” và kỹ năng ngôn ngữ. Điểm trên bài sửa luôn ghi là “có góp ý”.",
  closingLabel: "Nhận xét kết cho con (tùy chọn)",
  closingHint: "Một câu con sẽ đọc. Không ghi điểm.",
  finish: "Xong",
  openRound2: "Mở vòng 2 với góp ý mới",
  round2Title: "Góp ý vòng 2",
  sendRound2: "Gửi góp ý vòng 2",
  saving: "Đang lưu…",
  needVerdicts: (left: number) => `Còn ${left} góp ý chưa đánh giá`,
  done: (when: string) => `Đã xem xong · ${when}`,
  round2Opened: (when: string) => `Đã mở vòng 2 · ${when}`,
  closingShown: "Nhận xét kết",
  readOnly: `Bài này chỉ ${tutorHonorific} đánh giá được.`,
  listTitle: (alias: string) => `Bài đã sửa của ${alias}`,
  listIntro: "Mỗi dòng là một cặp bài cũ – bài sửa. Bấm để xem cạnh nhau (chỉ xem).",
  listEmpty: "Chưa có bài sửa nào.",
  listLine: (round: number, n: number) => `Vòng ${round} · ${n} góp ý`,
  stateWaiting: "Đang chờ xem",
  stateDone: "Đã xem xong",
  verdictSummary: (good: number, total: number) => `${good}/${total} góp ý đã cải thiện hoặc có lý do hợp lý`,
  link: "Bài đã sửa",
  back: "Về danh sách bài đã sửa",
  backHome: "Về trang chủ",
  openReview: "Mở trong Hộp duyệt",
  viewerNote: "Chỉ xem.",
} as const;
```

The bare-word test also scans `feedbackCopy.errors.score_words`, which quotes “3/4” and “điểm” (staff text, allowed). It contains no bare "cô" / "thầy", so it passes. The score-word scan runs on `revisionCopy` only.

- [ ] **Step 10: Run** — `npx vitest run tests/unit/revision.test.ts tests/unit/purge.test.ts tests/unit/copy-and-visibility.test.ts tests/unit/inquiriesUi.test.ts` → PASS. If an inquiries UI test asserts `"Bước 1"`-style labels, they still hold, because only `n > 1000` changed.

- [ ] **Step 11: Commit**

```bash
git add lib/revision tests/unit/revision.test.ts tests/unit/purge.test.ts tests/unit/copy-and-visibility.test.ts lib/copy/vi.ts
git commit -m "feat(s6): lib/revision core - score words, word diff, excerpts, mark and verdict rules, parsers (child allowlists), copy"
```

---

### Task 6: API — request bodies, staff and student handlers, stores, routes, loaders, error words, inbox round

**Files:**
- Create: `lib/revision/schemas.ts`, `lib/revision/handlers.ts`, `lib/revision/supabaseStore.ts`, `lib/revision/route.ts`, `lib/revision/load.ts`, `lib/revision/client.ts`, `app/api/review/attempts/[id]/feedback/route.ts`, `app/api/review/attempts/[id]/revision-finish/route.ts`, `app/api/student/feedback/route.ts`, `app/api/student/revisions/[id]/route.ts`, `app/api/student/revisions/[id]/draft/route.ts`, `tests/unit/revisionApi.test.ts`
- Modify: `lib/work/handlers.ts`, `lib/work/supabaseStore.ts`, `lib/work/load.ts`, `lib/review/types.ts`, `lib/review/shape.ts`, `tests/unit/workHandlers.test.ts`

**Interfaces:**
- Consumes: `requireAccess`, `AccessError`, `AccessDeps`, `AccessGrant`, `AccessUser` (`lib/auth/requireAccess.ts`); `fromDbError`, `ReviewDbError`, `HandlerResult` (`lib/review/handlers.ts`); `UUID_RE` (`lib/work/schemas.ts`); `ASSISTANCE_VALUES`, `PROVENANCE_VALUES` (`lib/work/types.ts`); `toDraftReceipt`, `toReceipt` (`lib/work/shape.ts`); `readJson` (`lib/inquiries/route.ts`); `failText`, `PostFail` (`lib/tutorwork/client.ts`); Task 5 (`hasScoreWords`, parsers, limits, copy); the SQL of Tasks 2–4.
- Produces:
  - `lib/revision/schemas.ts`: `feedbackBodySchema` (`{client_id, praise, items: [{text, excerpt?, leaf?: {kind, ref_key} | null}], requires_revision, supersedes_id?}`), `finishBodySchema` (discriminated on `action`: `{action: "close", client_id, checks: [{n, verdict}], closing_note?}` or `{action: "round2", client_id, checks, praise, items}`), `revisionDraftBodySchema` (`{content: {text?, marks?, pasted?, assistance?}, base_revision?}`), `revisionSubmitBodySchema` (`{client_submission_id, text, marks: {"1".."3": {choice, reason?}}, assistance, provenance}`); types `FeedbackBody`, `FinishBody`.
  - `lib/revision/handlers.ts`: `type FeedbackItemArg = { text: string; excerpt: string | null; leaf: { kind: "tag" | "target"; ref_key: string } | null }`. It also defines:

    ```ts
    interface RevisionStore {
      getAttemptLearnerId(attemptId: string): Promise<string | null>;
      writeFeedback(a: { attemptId: string; praise: string; items: FeedbackItemArg[]; requiresRevision: boolean; supersedesId: string | null; byMemberId: string; clientId: string }): Promise<unknown>;
      finishRevision(a: { attemptId: string; action: "close" | "round2"; checks: { n: number; verdict: string }[]; closingNote: string | null; praise: string | null; items: FeedbackItemArg[] | null; byMemberId: string; clientId: string }): Promise<unknown>;
    }
    type RevisionDeps = { user: AccessUser; store: RevisionStore; access?: Partial<AccessDeps> };
    ```

    The handlers are `handleWriteFeedback(deps, attemptId, rawBody)` → `201/200 {id, round, revision_activity_id, replayed}` and `handleFinishRevision(deps, attemptId, rawBody)` → `201/200 {closing_id, feedback_id, revision_activity_id, replayed}`, plus `fromRevisionDbError(err): HandlerResult`. Error codes: `tutor_only`, `author_only` (403); `not_found` (404); `score_words`, `excerpt_not_found`, `excerpt_too_long`, `unknown_leaf`, `not_writing`, `praise_required`, `items_required`, `max_rounds`, `checks_incomplete`, `closing_too_long` (400); `revision_started`, `already_given`, `already_superseded`, `already_finished` (409); and the usual `invalid_body`, `invalid`, `conflict`, `forbidden`, `unauthenticated`.
  - `lib/revision/supabaseStore.ts`: `callRevisionRpc(fn: string, args: Record<string, unknown>): Promise<unknown>`, `createSupabaseRevisionStore(): RevisionStore`. `lib/revision/route.ts`: `runRevisionRoute(routeName, run)`. `lib/revision/load.ts`: `loadFeedbackPanel(attemptId: string, byMemberId: string): Promise<FeedbackPanelView | null>`, `loadRevisionView(attemptId: string, byMemberId: string): Promise<RevisionView | null>`, `loadRevisionList(learnerId: string): Promise<RevisionListItem[]>`. `lib/revision/client.ts`: `revisionFailText(r: PostFail): string`.
  - `WorkStore` (lib/work) gains `getMyFeedback(): Promise<unknown>`, `getMyRevision(activityId: string): Promise<unknown | null>`, `saveRevisionDraft(a: { activityId: string; content: unknown; baseRevision: number | null }): Promise<unknown>` and `submitRevision(a: { activityId: string; clientSubmissionId: string; text: string; marks: unknown; assistance: string[]; provenance: string }): Promise<unknown>`.
  - New student handlers: `handleStudentFeedback(deps)` → `{items: MyFeedbackItem[]}`; `handleStudentRevision(deps, activityId)` → `{revision: MyRevisionView}` or 404; `handleSaveRevisionDraft(deps, activityId, body)` → `{draft}`; `handleSubmitRevision(deps, activityId, body)` → `{receipt}`. `handleStudentHome` adds `feedback: MyFeedbackItem[] | null`. Student error codes: `marks_incomplete`, `reason_required`, `unchanged_needs_reason`, `reason_too_long` (400) and `revision_not_open`, `conflict` (409).
  - `StudentHomeData` (ok) gains `feedback: MyFeedbackItem[] | null`; `loadRevisionPage(activityId): Promise<RevisionPageData>` with `RevisionPageData = { kind: "ok"; revision: MyRevisionView } | { kind: "login" } | { kind: "not-found" }`.
  - `InboxItem.revisionRound: number | null`.
  - Routes: `POST /api/review/attempts/:id/feedback`, `POST /api/review/attempts/:id/revision-finish`, `GET /api/student/feedback`, `GET|POST /api/student/revisions/:id`, `PUT /api/student/revisions/:id/draft`.

- [ ] **Step 1: Write the failing test** — `tests/unit/revisionApi.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { feedbackCopy } from "@/lib/copy/vi";
import { ReviewDbError } from "@/lib/review/handlers";
import { parseInbox } from "@/lib/review/shape";
import { revisionFailText } from "@/lib/revision/client";
import { handleFinishRevision, handleWriteFeedback, type RevisionDeps, type RevisionStore } from "@/lib/revision/handlers";
import { feedbackBodySchema, finishBodySchema, revisionDraftBodySchema, revisionSubmitBodySchema } from "@/lib/revision/schemas";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const WORK = "c0000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-22T08:00:00Z");
const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentAn", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: "m-studentAn", alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: null, alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
];
const rels: Relationship[] = [
  { memberId: "m-tutorAn", learnerId: AN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
  { memberId: "m-tutorNguyen", learnerId: NGUYEN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
];
const access: AccessStore = {
  getMemberByUserId: async (u) => members.find((m) => m.userId === u) ?? null,
  getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
  getRelationships: async (m, l) => rels.filter((r) => r.memberId === m && r.learnerId === l),
};
const store = (over: Partial<RevisionStore> = {}) =>
  ({
    getAttemptLearnerId: vi.fn(async (id: string) => (id === WORK ? AN : null)),
    writeFeedback: vi.fn(async (): Promise<unknown> => ({ id: "f1", round: 1, revision_activity_id: "r1", replayed: false })),
    finishRevision: vi.fn(async (): Promise<unknown> => ({ closing_id: "c1", feedback_id: null, revision_activity_id: null, replayed: false })),
    ...over,
  }) satisfies RevisionStore;
const deps = (user: string | null, s: RevisionStore): RevisionDeps => ({ user: user ? { id: `u-${user}` } : null, store: s, access: { store: access, allowRealLearners: false, now: NOW } });
const feedback = { client_id: "feedback-0001", praise: " Con giải thích rõ. ", items: [{ text: "Thêm câu kết.", excerpt: "lava flow" }, { text: "Thêm từ nối.", leaf: { kind: "tag", ref_key: "a-linkers" } }], requires_revision: true };

describe("request bodies", () => {
  it("feedback: praise ≤ 160, 1-3 items ≤ 200, excerpt ≤ 120, leaf {kind, ref_key}; unknown keys refused", () => {
    expect(feedbackBodySchema.safeParse(feedback).success).toBe(true);
    for (const bad of [
      { ...feedback, praise: "" }, { ...feedback, praise: "x".repeat(161) }, { ...feedback, items: [] }, { ...feedback, items: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }] },
      { ...feedback, items: [{ text: "x".repeat(201) }] }, { ...feedback, items: [{ text: "a", excerpt: "x".repeat(121) }] }, { ...feedback, items: [{ text: "a", leaf: { kind: "group", ref_key: "x" } }] },
      { ...feedback, score: 3 }, { ...feedback, supersedes_id: "nope" },
    ]) expect(feedbackBodySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it("finish: close with an optional note, or round 2 with new feedback; verdicts from the list", () => {
    expect(finishBodySchema.safeParse({ action: "close", client_id: "finish-0001", checks: [{ n: 1, verdict: "improved" }] }).success).toBe(true);
    expect(finishBodySchema.safeParse({ action: "round2", client_id: "finish-0001", checks: [{ n: 1, verdict: "not_yet" }], praise: "Tốt", items: [{ text: "Thêm ví dụ." }] }).success).toBe(true);
    expect(finishBodySchema.safeParse({ action: "round2", client_id: "finish-0001", checks: [{ n: 1, verdict: "not_yet" }] }).success).toBe(false);
    expect(finishBodySchema.safeParse({ action: "close", client_id: "finish-0001", checks: [{ n: 1, verdict: "great" }] }).success).toBe(false);
    expect(finishBodySchema.safeParse({ action: "close", client_id: "finish-0001", checks: [{ n: 1, verdict: "improved" }], closing_note: "x".repeat(301) }).success).toBe(false);
  });

  it("the child's draft and submit: marks keyed 1-3, choice changed / kept, reason ≤ 300, help declared", () => {
    expect(revisionDraftBodySchema.safeParse({ content: { text: "x", marks: { "1": { choice: "kept" } } }, base_revision: 0 }).success).toBe(true);
    expect(revisionDraftBodySchema.safeParse({ content: { marks: { "4": { choice: "kept" } } } }).success).toBe(false);
    expect(revisionDraftBodySchema.safeParse({ content: { answers: {} } }).success).toBe(false);
    const submit = { client_submission_id: "a1111111-1111-4111-8111-111111111111", text: "New text.", marks: { "1": { choice: "changed" } }, assistance: ["none"], provenance: "in_app" };
    expect(revisionSubmitBodySchema.safeParse(submit).success).toBe(true);
    expect(revisionSubmitBodySchema.safeParse({ ...submit, marks: { "1": {} } }).success).toBe(false);
    expect(revisionSubmitBodySchema.safeParse({ ...submit, assistance: ["none", "notes"] }).success).toBe(false);
    expect(revisionSubmitBodySchema.safeParse({ ...submit, marks: { "1": { choice: "changed", reason: "x".repeat(301) } } }).success).toBe(false);
  });
});

describe("handleWriteFeedback", () => {
  it("the child's tutor or the parent sends; the store gets the cleaned body and the member id; a replay answers 200", async () => {
    const s = store();
    expect(await handleWriteFeedback(deps("tutorAn", s), WORK, feedback)).toEqual({ status: 201, body: { id: "f1", round: 1, revision_activity_id: "r1", replayed: false } });
    expect(s.writeFeedback).toHaveBeenCalledWith({
      attemptId: WORK, praise: "Con giải thích rõ.", requiresRevision: true, supersedesId: null, byMemberId: "m-tutorAn", clientId: "feedback-0001",
      items: [{ text: "Thêm câu kết.", excerpt: "lava flow", leaf: null }, { text: "Thêm từ nối.", excerpt: null, leaf: { kind: "tag", ref_key: "a-linkers" } }],
    });
    const again = store({ writeFeedback: vi.fn(async (): Promise<unknown> => ({ id: "f1", round: 1, revision_activity_id: "r1", replayed: true })) });
    expect((await handleWriteFeedback(deps("parent", again), WORK, feedback)).status).toBe(200);
  });

  it("access first (401 / 404 other tutor / 403 student) - before the body; score words are refused before the database", async () => {
    const s = store();
    expect((await handleWriteFeedback(deps(null, s), WORK, "x")).status).toBe(401);
    expect((await handleWriteFeedback(deps("tutorNguyen", s), WORK, feedback)).status).toBe(404);
    expect((await handleWriteFeedback(deps("studentAn", s), WORK, feedback)).status).toBe(403);
    expect((await handleWriteFeedback(deps("tutorAn", s), "not-a-uuid", feedback)).status).toBe(404);
    expect(await handleWriteFeedback(deps("tutorAn", s), WORK, { ...feedback, praise: "Được 3/4" })).toMatchObject({ status: 400, body: { error: "score_words" } });
    expect(await handleWriteFeedback(deps("tutorAn", s), WORK, { ...feedback, items: [{ text: "Đúng 80%" }] })).toMatchObject({ status: 400, body: { error: "score_words" } });
    expect(await handleWriteFeedback(deps("tutorAn", s), WORK, { ...feedback, praise: "" })).toMatchObject({ status: 400, body: { error: "praise_required" } });
    expect(await handleWriteFeedback(deps("tutorAn", s), WORK, { ...feedback, items: [{ text: "a", excerpt: "x".repeat(121) }] })).toMatchObject({ status: 400, body: { error: "excerpt_too_long" } });
    expect(s.writeFeedback).not.toHaveBeenCalled();
  });

  it("maps the database answers to codes the panel can explain", async () => {
    const cases: [string, string, number, string][] = [
      ["42501", "eng_write_feedback: … (D15)", 403, "tutor_only"],
      ["42501", "x (author_only)", 403, "author_only"],
      ["23514", "x (revision_started)", 409, "revision_started"],
      ["23514", "x (excerpt_not_found)", 400, "excerpt_not_found"],
      ["23514", "x (unknown_leaf)", 400, "unknown_leaf"],
      ["23514", "x (not_writing)", 400, "not_writing"],
      ["23505", "x (already_given)", 409, "already_given"],
      ["23505", "x (already_superseded)", 409, "already_superseded"],
      ["23505", "x client id was already used", 409, "conflict"],
      ["P0002", "x (not_found)", 404, "not_found"],
    ];
    for (const [code, detail, status, error] of cases) {
      const s = store({ writeFeedback: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError(code, detail); }) });
      expect(await handleWriteFeedback(deps("tutorAn", s), WORK, feedback), detail).toMatchObject({ status, body: { error } });
    }
  });
});

describe("handleFinishRevision", () => {
  it("close with a trimmed note, or round 2 with feedback; scores refused; database answers mapped", async () => {
    const s = store();
    expect((await handleFinishRevision(deps("tutorAn", s), WORK, { action: "close", client_id: "finish-0001", checks: [{ n: 1, verdict: "improved" }], closing_note: "  Tốt lắm! " })).status).toBe(201);
    expect(s.finishRevision).toHaveBeenCalledWith({
      attemptId: WORK, action: "close", checks: [{ n: 1, verdict: "improved" }], closingNote: "Tốt lắm!", praise: null, items: null, byMemberId: "m-tutorAn", clientId: "finish-0001",
    });
    await handleFinishRevision(deps("tutorAn", s), WORK, { action: "round2", client_id: "finish-0002", checks: [{ n: 1, verdict: "not_yet" }], praise: "Tốt", items: [{ text: "Thêm ví dụ." }] });
    expect(s.finishRevision).toHaveBeenLastCalledWith(expect.objectContaining({ action: "round2", closingNote: null, praise: "Tốt", items: [{ text: "Thêm ví dụ.", excerpt: null, leaf: null }] }));
    expect(await handleFinishRevision(deps("tutorAn", s), WORK, { action: "close", client_id: "finish-0003", checks: [{ n: 1, verdict: "improved" }], closing_note: "Được 4/4" }))
      .toMatchObject({ status: 400, body: { error: "score_words" } });
    for (const [code, detail, status, error] of [["23514", "x (checks_incomplete)", 400, "checks_incomplete"], ["23505", "x (already_finished)", 409, "already_finished"],
      ["23514", "x (max_rounds)", 400, "max_rounds"], ["22023", "x (bad_verdict)", 400, "invalid"]] as [string, string, number, string][]) {
      const bad = store({ finishRevision: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError(code, detail); }) });
      expect(await handleFinishRevision(deps("tutorAn", bad), WORK, { action: "close", client_id: "finish-0004", checks: [{ n: 1, verdict: "improved" }] })).toMatchObject({ status, body: { error } });
    }
  });
});

describe("words and the inbox", () => {
  it("every S6 error code has a sentence; unknown codes fall back to the shared ones", () => {
    for (const code of Object.keys(feedbackCopy.errors)) expect(revisionFailText({ ok: false, status: 400, error: code })).toBe(feedbackCopy.errors[code]);
    expect(revisionFailText({ ok: false, status: 0, error: "network" })).toBeTruthy();
  });
  it("an inbox row carries the revision round (null for ordinary work and for an older database)", () => {
    const row = { episode_id: "e", attempt_id: "a", learner_id: AN, alias: "An", is_test: true, title_vi: "Núi lửa", step_no: 1001, activity_type: "ACT-REVISE", mode: "REVISION",
      purpose: [], provenance: "in_app", attempt_no: 2, is_first_attempt: false, submitted_at: "2026-10-22T01:00:00Z", restricted: false, category: "practice",
      targets_total: 3, targets_decided: 0, can_decide: true };
    const counts = { todo: 1, tutor: 0, independent: 0, baseline: 0, practice: 1, done: 0, to_decide: 1 };
    expect(parseInbox({ items: [{ ...row, revision_round: 2 }], next: null, counts }).items[0]?.revisionRound).toBe(2);
    expect(parseInbox({ items: [row], next: null, counts }).items[0]?.revisionRound).toBeNull();
  });
});
```

Append to `tests/unit/workHandlers.test.ts`:
  - import `handleSaveRevisionDraft, handleStudentFeedback, handleStudentRevision, handleSubmitRevision` from `@/lib/work/handlers` (add them to the existing import list);
  - in `makeStore`, after `getReviewByDomain: …,` add:

```ts
    getMyFeedback: vi.fn(async (): Promise<unknown> => ({ items: [] })),
    getMyRevision: vi.fn(async (): Promise<unknown> => rpcRevision),
    saveRevisionDraft: vi.fn(async (): Promise<unknown> => ({ revision: 1, saved_at: "2026-10-14T08:00:00Z", other_tab_changed: false })),
    submitRevision: vi.fn(async (): Promise<unknown> => rpcReceipt),
```

  - above `function makeStore`, add:

```ts
const rpcRevision = {
  activity_id: ACT_AN, instance_id: "44444444-4444-4444-8444-444444444444", title_vi: "Núi lửa", big_question_en: "Why do volcanoes erupt?", round: 1,
  praise: "Con giải thích rõ.", items: [{ n: 1, text: "Thêm câu kết.", excerpt: null, leaf: { kind: "tag", ref_key: "x" } }], old_text: "Old text.",
  reason_required: false, state: "todo", submitted_at: null, closing_note: null, draft: null, score: 3,
};
```

  - at the end of the file, add:

```ts
describe("S6: the child's revision routes", () => {
  const submit = { client_submission_id: CLIENT_ID, text: "New text.", marks: { "1": { choice: "changed" } }, assistance: ["none"], provenance: "in_app" };

  it("home carries the feedback rows; a broken feedback call never takes the home down", async () => {
    const s = makeStore({ getMyFeedback: vi.fn(async (): Promise<unknown> => ({ items: [{ feedback_id: "f", activity_id: ACT_AN, title_vi: "Núi lửa", round: 1, items_count: 1,
      state: "todo", seen_at: null, closing_note: null, praise: null, notes: null }] })) });
    expect((await handleStudentHome(deps("studentAn", s))).body).toMatchObject({ feedback: [{ activityId: ACT_AN, state: "todo", itemsCount: 1 }] });
    const broken = makeStore({ getMyFeedback: vi.fn(async (): Promise<unknown> => { throw new Error("0021 not applied"); }) });
    expect(await handleStudentHome(deps("studentAn", broken))).toMatchObject({ status: 200, body: { feedback: null } });
    expect((await handleStudentFeedback(deps("tutorAn", makeStore()))).status).toBe(403);
  });

  it("the revision page: own step only, no leaf or score in the answer; 404 when there is nothing to revise", async () => {
    const r = await handleStudentRevision(deps("studentAn", makeStore()), ACT_AN);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/leaf|score|ref_key/);
    expect((await handleStudentRevision(deps("studentNguyen", makeStore()), ACT_AN)).status).toBe(404);
    expect((await handleStudentRevision(deps("tutorAn", makeStore()), ACT_AN)).status).toBe(403);
    expect((await handleStudentRevision(deps("studentAn", makeStore({ getMyRevision: vi.fn(async () => null) })), ACT_AN)).status).toBe(404);
  });

  it("draft and submit go to the store after access; the database's mark rules come back as codes the form can explain", async () => {
    const s = makeStore();
    expect((await handleSaveRevisionDraft(deps("studentAn", s), ACT_AN, { content: { text: "x", marks: { "1": { choice: "kept" } } }, base_revision: 0 })).status).toBe(200);
    expect(s.saveRevisionDraft).toHaveBeenCalledWith({ activityId: ACT_AN, content: { text: "x", marks: { "1": { choice: "kept" } } }, baseRevision: 0 });
    expect((await handleSubmitRevision(deps("studentAn", s), ACT_AN, submit)).status).toBe(201);
    expect(s.submitRevision).toHaveBeenCalledWith({ activityId: ACT_AN, clientSubmissionId: CLIENT_ID, text: "New text.", marks: { "1": { choice: "changed" } }, assistance: ["none"], provenance: "in_app" });
    for (const [code, msg, status, error] of [
      ["23514", "eng_submit_revision: … (marks_incomplete)", 400, "marks_incomplete"], ["23514", "x (reason_required)", 400, "reason_required"],
      ["23514", "x (unchanged_needs_reason)", 400, "unchanged_needs_reason"], ["22023", "x (revision_not_open)", 409, "revision_not_open"],
      ["23505", "x (already_submitted)", 409, "conflict"],
    ] as [string, string, number, string][]) {
      const bad = makeStore({ submitRevision: vi.fn(async (): Promise<unknown> => { throw new WorkDbError(code, msg); }) });
      expect(await handleSubmitRevision(deps("studentAn", bad), ACT_AN, submit), msg).toMatchObject({ status, body: { error } });
    }
    expect((await handleSubmitRevision(deps("studentNguyen", s), ACT_AN, submit)).status).toBe(404);
    expect((await handleSubmitRevision(deps("parent", s), ACT_AN, submit)).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/revisionApi.test.ts tests/unit/workHandlers.test.ts` → FAIL (modules / methods missing).

- [ ] **Step 3: Create `lib/revision/schemas.ts`**

```ts
/** Request bodies of the S6 routes (zod, strict: unknown keys are a 400). The database checks every rule again. */
import { z } from "zod";
import { UUID_RE } from "@/lib/work/schemas";
import { ASSISTANCE_VALUES, PROVENANCE_VALUES } from "@/lib/work/types";
import { CLOSING_MAX, EXCERPT_MAX, ITEM_MAX, MARK_CHOICES, MAX_ITEMS, PRAISE_MAX, REASON_MAX, VERDICTS } from "./types";

const clientId = z.string().min(8).max(100).refine((s) => s.trim().length >= 8, "client id");
const leaf = z.strictObject({ kind: z.enum(["tag", "target"]), ref_key: z.string().min(1).max(100) });
const item = z.strictObject({
  text: z.string().trim().min(1).max(ITEM_MAX),
  excerpt: z.string().trim().max(EXCERPT_MAX).optional(),
  leaf: leaf.nullable().optional(),
});
const praise = z.string().trim().min(1).max(PRAISE_MAX);
const items = z.array(item).min(1).max(MAX_ITEMS);

export const feedbackBodySchema = z.strictObject({
  client_id: clientId,
  praise,
  items,
  requires_revision: z.boolean(),
  supersedes_id: z.string().regex(UUID_RE).optional(),
});
export type FeedbackBody = z.infer<typeof feedbackBodySchema>;

const checks = z.array(z.strictObject({ n: z.number().int().min(1).max(MAX_ITEMS), verdict: z.enum(VERDICTS) })).min(1).max(MAX_ITEMS);
export const finishBodySchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("close"), client_id: clientId, checks, closing_note: z.string().trim().max(CLOSING_MAX).optional() }),
  z.strictObject({ action: z.literal("round2"), client_id: clientId, checks, praise, items }),
]);
export type FinishBody = z.infer<typeof finishBodySchema>;

const markKey = z.string().regex(/^[1-3]$/);
export const revisionDraftBodySchema = z.strictObject({
  content: z.strictObject({
    text: z.string().max(20000).optional(),
    marks: z.record(markKey, z.strictObject({ choice: z.enum(MARK_CHOICES).optional(), reason: z.string().max(REASON_MAX).optional() })).optional(),
    pasted: z.boolean().optional(),
    assistance: z.array(z.enum(ASSISTANCE_VALUES)).max(5).optional(),
  }),
  base_revision: z.number().int().min(0).max(1_000_000).optional(),
});
export type RevisionDraftBody = z.infer<typeof revisionDraftBodySchema>;

export const revisionSubmitBodySchema = z.strictObject({
  client_submission_id: z.string().regex(UUID_RE),
  text: z.string().min(1).max(20000),
  marks: z.record(markKey, z.strictObject({ choice: z.enum(MARK_CHOICES), reason: z.string().max(REASON_MAX).optional() })),
  assistance: z
    .array(z.enum(ASSISTANCE_VALUES))
    .min(1)
    .max(5)
    .refine((a) => !a.includes("none") || a.length === 1, "\"none\" cannot be combined with other help"),
  provenance: z.enum(PROVENANCE_VALUES),
});
export type RevisionSubmitBody = z.infer<typeof revisionSubmitBodySchema>;
```

- [ ] **Step 4: Create `lib/revision/handlers.ts`**

```ts
/**
 * Staff handlers of S6 (framework-free). Each one: requireAccess(…, "work:review") for the learner of the work, BEFORE the body; then the
 * body (400) and the score-word check (the app refuses first, the database again); then the store (service-role functions that re-check the
 * actor: D15, author, edit window, rounds). Database refusals become codes the panel can explain; raw database messages never leave.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { UUID_RE } from "@/lib/work/schemas";
import { feedbackBodySchema, finishBodySchema } from "./schemas";
import { hasScoreWords } from "./scoreWords";

export type FeedbackItemArg = { text: string; excerpt: string | null; leaf: { kind: "tag" | "target"; ref_key: string } | null };

export interface RevisionStore {
  /** Which learner a piece of work belongs to (service role, read-only), or null. */
  getAttemptLearnerId(attemptId: string): Promise<string | null>;
  writeFeedback(a: {
    attemptId: string; praise: string; items: FeedbackItemArg[]; requiresRevision: boolean; supersedesId: string | null; byMemberId: string; clientId: string;
  }): Promise<unknown>;
  finishRevision(a: {
    attemptId: string; action: "close" | "round2"; checks: { n: number; verdict: string }[]; closingNote: string | null; praise: string | null;
    items: FeedbackItemArg[] | null; byMemberId: string; clientId: string;
  }): Promise<unknown>;
}

export type RevisionDeps = { user: AccessUser; store: RevisionStore; access?: Partial<AccessDeps> };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

/** The "(tag)" at the end of a database message → HTTP status + code (spec §6: the panel says what to change). */
const TAGS: [RegExp, 400 | 403 | 404 | 409, string][] = [
  [/\(D15\)/, 403, "tutor_only"],
  [/\(author_only\)/, 403, "author_only"],
  [/\(not_found\)/, 404, "not_found"],
  [/\(score_words\)/, 400, "score_words"],
  [/\(excerpt_not_found\)/, 400, "excerpt_not_found"],
  [/\(excerpt_too_long\)/, 400, "excerpt_too_long"],
  [/\(unknown_leaf\)/, 400, "unknown_leaf"],
  [/\(not_writing\)/, 400, "not_writing"],
  [/\(praise_required\)/, 400, "praise_required"],
  [/\(bad_items\)/, 400, "items_required"],
  [/\(max_rounds\)/, 400, "max_rounds"],
  [/\(checks_incomplete\)/, 400, "checks_incomplete"],
  [/\(closing_too_long\)/, 400, "closing_too_long"],
  [/\(revision_started\)/, 409, "revision_started"],
  [/\(already_given\)/, 409, "already_given"],
  [/\(already_superseded\)/, 409, "already_superseded"],
  [/\(already_finished\)/, 409, "already_finished"],
];

export function fromRevisionDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    for (const [re, status, code] of TAGS) if (re.test(err.detail)) return fail(status, code);
  }
  return fromDbError(err);
}

async function guardAttempt(deps: RevisionDeps, attemptId: string): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(attemptId)) return { ok: false, result: fail(404, "not_found") };
  const learnerId = await deps.store.getAttemptLearnerId(attemptId);
  if (!learnerId) return { ok: false, result: fail(404, "not_found") };
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, "work:review", deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** The first problem of a body that the form can explain; anything else is "invalid_body". */
function bodyProblem(issues: readonly { path: readonly PropertyKey[] }[]): string {
  const p = issues[0]?.path ?? [];
  if (p[0] === "praise") return "praise_required";
  if (p[0] === "items" && p.includes("excerpt")) return "excerpt_too_long";
  if (p[0] === "items") return "items_required";
  if (p[0] === "closing_note") return "closing_too_long";
  if (p[0] === "checks") return "checks_incomplete";
  return "invalid_body";
}

const toItems = (items: { text: string; excerpt?: string; leaf?: { kind: "tag" | "target"; ref_key: string } | null }[]): FeedbackItemArg[] =>
  items.map((i) => ({ text: i.text, excerpt: i.excerpt ? i.excerpt : null, leaf: i.leaf ?? null }));

export async function handleWriteFeedback(deps: RevisionDeps, attemptId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardAttempt(deps, attemptId);
  if (!g.ok) return g.result;
  const parsed = feedbackBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, bodyProblem(parsed.error.issues));
  const b = parsed.data;
  if (hasScoreWords(b.praise) || b.items.some((i) => hasScoreWords(i.text))) return fail(400, "score_words");
  try {
    const r = (await deps.store.writeFeedback({
      attemptId, praise: b.praise, items: toItems(b.items), requiresRevision: b.requires_revision, supersedesId: b.supersedes_id ?? null,
      byMemberId: g.grant.member.id, clientId: b.client_id,
    })) as { id: string; round: number; revision_activity_id: string | null; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, round: r.round, revision_activity_id: r.revision_activity_id, replayed: r.replayed } };
  } catch (err) {
    return fromRevisionDbError(err);
  }
}

export async function handleFinishRevision(deps: RevisionDeps, attemptId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardAttempt(deps, attemptId);
  if (!g.ok) return g.result;
  const parsed = finishBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, bodyProblem(parsed.error.issues));
  const b = parsed.data;
  const scored = b.action === "close" ? hasScoreWords(b.closing_note) : hasScoreWords(b.praise) || b.items.some((i) => hasScoreWords(i.text));
  if (scored) return fail(400, "score_words");
  try {
    const r = (await deps.store.finishRevision({
      attemptId,
      action: b.action,
      checks: b.checks,
      closingNote: b.action === "close" ? b.closing_note || null : null,
      praise: b.action === "round2" ? b.praise : null,
      items: b.action === "round2" ? toItems(b.items) : null,
      byMemberId: g.grant.member.id,
      clientId: b.client_id,
    })) as { closing_id: string | null; feedback_id: string | null; revision_activity_id: string | null; replayed: boolean };
    return {
      status: r.replayed ? 200 : 201,
      body: { closing_id: r.closing_id, feedback_id: r.feedback_id, revision_activity_id: r.revision_activity_id, replayed: r.replayed },
    };
  } catch (err) {
    return fromRevisionDbError(err);
  }
}
```

- [ ] **Step 5: Create the store, route glue, loaders and the error words**

```ts
// lib/revision/supabaseStore.ts
import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RevisionStore } from "./handlers";

/** Calls a service-role function of migration 0021. Only after requireAccess (the SQL re-checks the actor). */
export async function callRevisionRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createAdminClient().rpc(fn, args);
  if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
  return data;
}

export function createSupabaseRevisionStore(): RevisionStore {
  return {
    async getAttemptLearnerId(id) {
      const { data, error } = await createAdminClient().from("attempts").select("learner_id").eq("id", id).maybeSingle<{ learner_id: string }>();
      if (error) throw new ReviewDbError(error.code ?? "unknown", `attempts lookup: ${error.message ?? "error"}`);
      return data?.learner_id ?? null;
    },
    writeFeedback: (a) =>
      callRevisionRpc("eng_write_feedback", {
        p_source_attempt: a.attemptId, p_praise: a.praise, p_items: a.items, p_requires_revision: a.requiresRevision, p_supersedes: a.supersedesId,
        p_by: a.byMemberId, p_client_id: a.clientId,
      }),
    finishRevision: (a) =>
      callRevisionRpc("eng_finish_revision", {
        p_attempt: a.attemptId, p_action: a.action, p_checks: a.checks, p_closing: a.closingNote, p_praise: a.praise, p_items: a.items,
        p_by: a.byMemberId, p_client_id: a.clientId,
      }),
  };
}
```

```ts
// lib/revision/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createUserClient } from "@/lib/supabase/server";
import type { RevisionDeps } from "./handlers";
import { createSupabaseRevisionStore } from "./supabaseStore";

/** Session → handler → JSON (no-store); 500 logged. Same glue as lib/review/route.ts. */
export async function runRevisionRoute(routeName: string, run: (deps: RevisionDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({ user, store: createSupabaseRevisionStore() });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
```

```ts
// lib/revision/load.ts
import "server-only";
import { parseFeedbackPanel, parseRevisionList, parseRevisionView } from "./shape";
import { callRevisionRpc } from "./supabaseStore";
import type { FeedbackPanelView, RevisionListItem, RevisionView } from "./types";

/** The pages call these only after requireAccess / requireLearnerPage for the learner of the work. */
export async function loadFeedbackPanel(attemptId: string, byMemberId: string): Promise<FeedbackPanelView | null> {
  return parseFeedbackPanel(await callRevisionRpc("eng_feedback_panel", { p_attempt: attemptId, p_by: byMemberId }));
}
export async function loadRevisionView(attemptId: string, byMemberId: string): Promise<RevisionView | null> {
  return parseRevisionView(await callRevisionRpc("eng_revision_view", { p_attempt: attemptId, p_by: byMemberId }));
}
export async function loadRevisionList(learnerId: string): Promise<RevisionListItem[]> {
  return parseRevisionList(await callRevisionRpc("eng_revision_list", { p_learner: learnerId }));
}
```

```ts
// lib/revision/client.ts
/** Browser-side: one sentence for a failed S6 call (no server-only imports). */
import { feedbackCopy } from "@/lib/copy/vi";
import { failText, type PostFail } from "@/lib/tutorwork/client";

export function revisionFailText(r: PostFail): string {
  return feedbackCopy.errors[r.error] ?? failText(r);
}
```

- [ ] **Step 6: Staff routes**

```ts
// app/api/review/attempts/[id]/feedback/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleWriteFeedback } from "@/lib/revision/handlers";
import { runRevisionRoute } from "@/lib/revision/route";

/** POST /api/review/attempts/:id/feedback — "Góp ý cho con" on one piece of work (new, or "Sửa góp ý" with supersedes_id). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runRevisionRoute("POST /api/review/attempts/[id]/feedback", (deps) => handleWriteFeedback(deps, id, body));
}
```

```ts
// app/api/review/attempts/[id]/revision-finish/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleFinishRevision } from "@/lib/revision/handlers";
import { runRevisionRoute } from "@/lib/revision/route";

/** POST /api/review/attempts/:id/revision-finish — verdict on every item + "Xong" (closing note) or "Mở vòng 2" (new feedback), in one call. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runRevisionRoute("POST /api/review/attempts/[id]/revision-finish", (deps) => handleFinishRevision(deps, id, body));
}
```

- [ ] **Step 7: Student side in `lib/work`**
  - `lib/work/handlers.ts`:
    - imports: add `import { parseMyFeedback, parseMyRevision } from "@/lib/revision/shape";` and `import { revisionDraftBodySchema, revisionSubmitBodySchema } from "@/lib/revision/schemas";`;
    - in `interface WorkStore`, after `getReviewByDomain(): Promise<unknown>;` add:

```ts
  /** english.eng_my_feedback() as the signed-in student (S6): feedback rows, no score, verdict or leaf. */
  getMyFeedback(): Promise<unknown>;
  /** english.eng_my_revision(id) as the signed-in student; null = not theirs / nothing to revise there. */
  getMyRevision(activityId: string): Promise<unknown | null>;
  /** english.eng_save_revision_draft as the signed-in student. */
  saveRevisionDraft(args: { activityId: string; content: unknown; baseRevision: number | null }): Promise<unknown>;
  /** english.eng_submit_revision as the signed-in student. */
  submitRevision(args: { activityId: string; clientSubmissionId: string; text: string; marks: unknown; assistance: string[]; provenance: string }): Promise<unknown>;
```

    - replace the body of `handleStudentHome` after `if (!g.ok) return g.result;` with:

```ts
  // "Việc cần ôn" (SM-2) and the feedback rows (S6) must never take the home down: unreadable or unexpected → left out (null).
  const [raw, review, feedback] = await Promise.all([
    deps.store.getHome(),
    deps.store.getReviewByDomain().then(parseReviewByDomain).catch(() => null),
    deps.store.getMyFeedback().then(parseMyFeedback).catch(() => null),
  ]);
  const home = toHomeView(raw);
  return { status: 200, body: { learner: { alias: g.grant.learner.alias }, ...home, review, feedback } };
```

    - append at the end of the file:

```ts
/** Database refusals of the revision functions that the form can explain (the tag is at the end of the message). */
const REVISION_TAGS: [RegExp, 400 | 409, string][] = [
  [/\(marks_incomplete\)/, 400, "marks_incomplete"],
  [/\(reason_required\)/, 400, "reason_required"],
  [/\(unchanged_needs_reason\)/, 400, "unchanged_needs_reason"],
  [/\(reason_too_long\)/, 400, "reason_too_long"],
  [/\(revision_not_open\)/, 409, "revision_not_open"],
  [/\(already_submitted\)/, 409, "conflict"],
];
function fromRevisionWorkError(err: unknown): HandlerResult {
  if (err instanceof WorkDbError) {
    for (const [re, status, code] of REVISION_TAGS) if (re.test(err.message)) return fail(status, code);
  }
  return fromDbError(err);
}

/** GET /api/student/feedback — the child's feedback rows (S6). */
export async function handleStudentFeedback(deps: HandlerDeps): Promise<HandlerResult> {
  const g = await ownLearner(deps);
  if (!g.ok) return g.result;
  return { status: 200, body: { items: parseMyFeedback(await deps.store.getMyFeedback()) } };
}

/** GET /api/student/revisions/:id — the revision page: praise, items, excerpts, old text, state; never a score, verdict or leaf. */
export async function handleStudentRevision(deps: HandlerDeps, activityId: string): Promise<HandlerResult> {
  const g = await guardActivity(deps, activityId);
  if (!g.ok) return g.result;
  const revision = parseMyRevision(await deps.store.getMyRevision(activityId));
  if (!revision) return fail(404, "not_found");
  return { status: 200, body: { revision } };
}

export async function handleSaveRevisionDraft(deps: HandlerDeps, activityId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardActivity(deps, activityId);
  if (!g.ok) return g.result;
  const parsed = revisionDraftBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const raw = await deps.store.saveRevisionDraft({ activityId, content: parsed.data.content, baseRevision: parsed.data.base_revision ?? null });
    return { status: 200, body: { draft: toDraftReceipt(raw) } };
  } catch (err) {
    return fromRevisionWorkError(err);
  }
}

export async function handleSubmitRevision(deps: HandlerDeps, activityId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardActivity(deps, activityId);
  if (!g.ok) return g.result;
  const parsed = revisionSubmitBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const raw = await deps.store.submitRevision({
      activityId, clientSubmissionId: parsed.data.client_submission_id, text: parsed.data.text, marks: parsed.data.marks,
      assistance: parsed.data.assistance, provenance: parsed.data.provenance,
    });
    const receipt = toReceipt(raw);
    return { status: receipt.replayed ? 200 : 201, body: { receipt } };
  } catch (err) {
    return fromRevisionWorkError(err);
  }
}
```

  - `lib/work/supabaseStore.ts`: add a helper under `dbError`, and the four methods (user client, as every other student call):

```ts
/** Like dbError, but keeps the database message: the S6 handlers read the "(tag)" at its end. It is never sent to the browser. */
function dbErrorWithTag(what: string, err: { code?: string; message?: string }): never {
  throw new WorkDbError(err.code ?? "unknown", `${what}: ${err.message ?? err.code ?? "error"}`);
}
```

```ts
    async getMyFeedback() {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_my_feedback");
      if (error) dbError("eng_my_feedback", error);
      return data;
    },

    async getMyRevision(activityId) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_my_revision", { p_activity: activityId });
      if (error) dbError("eng_my_revision", error);
      return data ?? null;
    },

    async saveRevisionDraft({ activityId, content, baseRevision }) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_save_revision_draft", { p_activity: activityId, p_content: content, p_base_revision: baseRevision });
      if (error) dbErrorWithTag("eng_save_revision_draft", error);
      return data;
    },

    async submitRevision({ activityId, clientSubmissionId, text, marks, assistance, provenance }) {
      const db = await createUserClient();
      const { data, error } = await db.rpc("eng_submit_revision", {
        p_activity: activityId, p_client_id: clientSubmissionId, p_text: text, p_marks: marks, p_assistance: assistance, p_provenance: provenance,
      });
      if (error) dbErrorWithTag("eng_submit_revision", error);
      return data;
    },
```

  - `lib/work/load.ts`:
    - add the imports `import type { MyFeedbackItem, MyRevisionView } from "@/lib/revision/types";` and `handleStudentRevision` (from `./handlers`);
    - change the ok branch of `StudentHomeData` to `{ kind: "ok"; alias: string; home: HomeView; review: ReviewItem[] | null; feedback: MyFeedbackItem[] | null }`;
    - in `loadStudentHome`, read `feedback?: MyFeedbackItem[] | null` from the body and return `feedback: body.feedback ?? null`;
    - append:

```ts
export type RevisionPageData = { kind: "ok"; revision: MyRevisionView } | { kind: "login" } | { kind: "not-found" };

/** The child's revision page for a REVISION step (S6): same access path as the API route. */
export async function loadRevisionPage(activityId: string): Promise<RevisionPageData> {
  const user = await currentUser();
  const res = await handleStudentRevision({ user, store: createSupabaseWorkStore() }, activityId);
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  return { kind: "ok", revision: (res.body as { revision: MyRevisionView }).revision };
}
```

- [ ] **Step 8: Student routes**

```ts
// app/api/student/feedback/route.ts
import { handleStudentFeedback } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** GET /api/student/feedback — the child's feedback rows (no score, verdict or skill code). */
export async function GET() {
  return runWorkRoute("GET /api/student/feedback", (deps) => handleStudentFeedback(deps));
}
```

```ts
// app/api/student/revisions/[id]/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleStudentRevision, handleSubmitRevision } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** GET /api/student/revisions/:id — the revision page of the child's own REVISION step. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runWorkRoute("GET /api/student/revisions/[id]", (deps) => handleStudentRevision(deps, id));
}

/** POST /api/student/revisions/:id — submit the revision with a mark per item. Idempotent on client_submission_id; the reply is a receipt. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runWorkRoute("POST /api/student/revisions/[id]", (deps) => handleSubmitRevision(deps, id, body));
}
```

```ts
// app/api/student/revisions/[id]/draft/route.ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleSaveRevisionDraft } from "@/lib/work/handlers";
import { runWorkRoute } from "@/lib/work/route";

/** PUT /api/student/revisions/:id/draft — autosave of the revision (text + marks). */
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runWorkRoute("PUT /api/student/revisions/[id]/draft", (deps) => handleSaveRevisionDraft(deps, id, body));
}
```

- [ ] **Step 9: Inbox round** — `lib/review/types.ts`: in `InboxItem`, after `canDecide: boolean;` add `/** S6: "Bài sửa lại (vòng n)"; null for ordinary work. */ revisionRound: number | null;`. In `lib/review/shape.ts`: in `inboxRow` after `can_decide: z.boolean(),` add `revision_round: z.number().int().nullable().optional().transform((v) => v ?? null),`, and in `parseInbox`'s item mapping after `canDecide: x.can_decide,` add `revisionRound: x.revision_round,`. Any existing test fixture building an `InboxItem` by hand gets `revisionRound: null` (`npx tsc --noEmit` lists them).

- [ ] **Step 10: Run** — `npx vitest run tests/unit/revisionApi.test.ts tests/unit/workHandlers.test.ts tests/unit/reviewHandlers.test.ts tests/unit/reviewUi.test.ts && npm run typecheck` → PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/revision app/api/review/attempts app/api/student/feedback app/api/student/revisions lib/work lib/review/types.ts lib/review/shape.ts tests/unit/revisionApi.test.ts tests/unit/workHandlers.test.ts
git commit -m "feat(s6): API - feedback and revision-finish routes (staff), feedback/revision/draft/submit routes (student), error words, inbox round"
```

---

### Task 7: Review screen — "Góp ý cho con" panel (send, "Sửa góp ý", history, leaf picker) — after Gate 0

**Files:**
- Create: `components/revision/LeafPicker.tsx`, `components/revision/FeedbackFields.tsx`, `components/revision/FeedbackPanel.tsx`, `tests/unit/revisionUi.test.ts`
- Modify: `app/review/[episodeId]/page.tsx`

**Interfaces:**
- Consumes: `GroupPicker` (`components/tutor/GroupPicker.tsx`), `SkillMapView` (`lib/skillmap/types.ts`), `loadPickerMap` (already loaded by the page for writing steps); `postJson` (`lib/tutorwork/client.ts`); `formatWhen` (`lib/review/format.ts`); Task 5 (`checkFeedback`, types, `feedbackCopy`); Task 6 (`revisionFailText`, `loadFeedbackPanel`, `POST /api/review/attempts/:id/feedback`).
- Produces:
  - `LeafPicker({ map, value, onChange, testIdPrefix }: { map: SkillMapView; value: Leaf | null; onChange: (l: Leaf | null) => void; testIdPrefix: string })`, `findLeaf(map: SkillMapView, leaf: Leaf): { groupKey: string; label: string } | null`.
  - `FeedbackFields({ value, onChange, map, testIdPrefix }: { value: FeedbackDraft; onChange: (v: FeedbackDraft) => void; map: SkillMapView | null; testIdPrefix: string })`, `type FeedbackDraft = { praise: string; items: FeedbackDraftItem[] }`, `emptyItem(): FeedbackDraftItem`, `feedbackPayloadItems(items: FeedbackDraftItem[])` (body items for the API).
  - `FeedbackItemsList({ items, map }: { items: FeedbackItem[]; map: SkillMapView | null })`; `FeedbackPanel({ attemptId, panel, map }: { attemptId: string; panel: FeedbackPanelView; map: SkillMapView | null })`.
  - Test ids: `feedback-panel`, `feedback-form`, `feedback-praise`, `feedback-item-{n}`, `feedback-item-{n}-text`, `feedback-item-{n}-excerpt`, `feedback-item-{n}-take`, `feedback-item-{n}-leaf-domain|group|leaf`, `feedback-add`, `feedback-require`, `feedback-note-only`, `feedback-send`, `feedback-problem`, `feedback-live`, `feedback-live-praise`, `feedback-edit`, `feedback-history`, `feedback-revision-state`, `feedback-read-only`.

- [ ] **Step 1: Write the failing test** — `tests/unit/revisionUi.test.ts` (Tasks 8 and 9 add their `describe` blocks at the marker)

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FeedbackPanel } from "@/components/revision/FeedbackPanel";
import { findLeaf } from "@/components/revision/LeafPicker";
import { feedbackCopy, tutorHonorific } from "@/lib/copy/vi";
import type { FeedbackPanelView } from "@/lib/revision/types";
import { fixtureMap } from "./fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));

const TEXT = "Some volcanoes explode because the magma is thick. Other volcanoes let lava flow gently.";
const ATT = "c0000000-0000-4000-8000-000000000001";
const panel = (over: Partial<FeedbackPanelView> = {}): FeedbackPanelView => ({ eligible: true, canGive: true, text: TEXT, live: null, history: [], ...over });
const live = (over: Partial<NonNullable<FeedbackPanelView["live"]>> = {}): NonNullable<FeedbackPanelView["live"]> => ({
  id: "f1", praise: "Con giải thích rõ vì sao núi lửa phun.",
  items: [{ n: 1, text: "Thêm câu kết.", excerpt: "Other volcanoes let lava flow gently.", leaf: { kind: "tag", refKey: "tu-noi-lap-luan" } }, { n: 2, text: "Dùng từ nối.", excerpt: null, leaf: null }],
  requiresRevision: true, round: 1, revisionActivityId: "r1", authorName: "Thầy/cô của An (thử)", authorIsMe: true, createdAt: "2026-10-22T02:00:00Z",
  editable: true, revisionState: "todo", revisionEpisodeId: null, ...over,
});
const render = (p: FeedbackPanelView) => renderToStaticMarkup(createElement(FeedbackPanel, { attemptId: ATT, panel: p, map: fixtureMap() }));

describe("Góp ý cho con (review screen)", () => {
  it("a reviewer with nothing sent yet gets the form: praise, one item with excerpt + 'Lấy đoạn đang chọn' + skill, 'Yêu cầu con sửa bài' chosen", () => {
    const html = render(panel());
    expect(html).toContain('data-testid="feedback-form"');
    expect(html).toContain(feedbackCopy.praiseLabel);
    expect(html).toContain('data-testid="feedback-item-1-text"');
    expect(html).toContain(feedbackCopy.takeSelection);
    expect(html).toContain('data-testid="feedback-item-1-leaf-domain"');
    expect(html).toMatch(/data-testid="feedback-require"[^>]*checked|checked[^>]*data-testid="feedback-require"/);
    expect(html).toContain(feedbackCopy.noteOnly);
    expect(html).toContain(feedbackCopy.send);
    expect(html).not.toContain('data-testid="feedback-live"');
  });

  it("a sent note shows praise, numbered items, the excerpt and the skill NAME (never its key), its state and 'Sửa góp ý' while allowed", () => {
    const html = render(panel({ canGive: false, live: live(), history: [{ id: "f0", praise: "Bản cũ", items: [{ n: 1, text: "Cũ", excerpt: null, leaf: null }], createdAt: "2026-10-22T01:00:00Z", authorName: null }] }));
    expect(html).toContain('data-testid="feedback-live"');
    expect(html).toContain("Con giải thích rõ vì sao núi lửa phun.");
    expect(html).toContain('data-testid="feedback-item-1"');
    expect(html).toContain("“Other volcanoes let lava flow gently.”");
    expect(html).toContain(findLeaf(fixtureMap(), { kind: "tag", refKey: "tu-noi-lap-luan" })!.label);
    expect(html).toContain(feedbackCopy.revisionState.todo);
    expect(html).toContain('data-testid="feedback-edit"');
    expect(html).toContain(feedbackCopy.history(1));
    expect(html).not.toContain('data-testid="feedback-form"');
  });

  it("no 'Sửa góp ý' once the child started (or for someone else's note); a link to the revision once it is in", () => {
    const started = render(panel({ canGive: false, live: live({ editable: false, revisionState: "started" }) }));
    expect(started).not.toContain('data-testid="feedback-edit"');
    expect(started).toContain(feedbackCopy.revisionState.started);
    const sent = render(panel({ canGive: false, live: live({ editable: false, revisionState: "submitted", revisionEpisodeId: "e9" }) }));
    expect(sent).toContain('href="/review/e9"');
    expect(sent).toContain(feedbackCopy.openRevision);
  });

  it("nothing on paper work / questions; a parent on an in-session test reads 'chỉ thầy/cô góp ý được'", () => {
    expect(render(panel({ eligible: false, canGive: false, text: null }))).toBe("");
    const ro = render(panel({ canGive: false }));
    expect(ro).toContain('data-testid="feedback-read-only"');
    expect(ro).toContain(tutorHonorific);
    expect(ro).not.toContain('data-testid="feedback-form"');
  });

  it("findLeaf names a leaf of the map and its group; an unknown leaf has no name", () => {
    expect(findLeaf(fixtureMap(), { kind: "target", refKey: "B-T7-ARGUE" })).toEqual({ groupKey: "th-argue", label: "B-T7-ARGUE" });
    expect(findLeaf(fixtureMap(), { kind: "tag", refKey: "x-dao-ngu-hardly" })).toBeNull(); // no group: cannot be chosen (D16)
  });
});

// (Tasks 8 and 9 add their describe blocks here)
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/revisionUi.test.ts` → FAIL (components missing).

- [ ] **Step 3: Create `components/revision/LeafPicker.tsx`**

```tsx
"use client";

import { useState } from "react";
import { GroupPicker } from "@/components/tutor/GroupPicker";
import { feedbackCopy } from "@/lib/copy/vi";
import type { Leaf } from "@/lib/revision/types";
import type { SkillMapView } from "@/lib/skillmap/types";

const keyOf = (l: Leaf) => `${l.kind}:${l.refKey}`;

/** The group and the name of a leaf in the map; null when it has no group (it cannot be chosen, D16). */
export function findLeaf(map: SkillMapView, leaf: Leaf): { groupKey: string; label: string } | null {
  for (const d of map.domains) {
    for (const g of d.groups) {
      const hit = g.leaves.find((l) => l.kind === leaf.kind && l.refKey === leaf.refKey);
      if (hit) return { groupKey: g.key, label: hit.label };
    }
  }
  return null;
}

/** Optional skill of one feedback item (1-b, D16): domain → group (SM-1 GroupPicker) → leaf. The child never sees it. */
export function LeafPicker({ map, value, onChange, testIdPrefix }: { map: SkillMapView; value: Leaf | null; onChange: (l: Leaf | null) => void; testIdPrefix: string }) {
  const [group, setGroup] = useState<string | null>(() => (value ? (findLeaf(map, value)?.groupKey ?? null) : null));
  const leaves = map.domains.flatMap((d) => d.groups).find((g) => g.key === group)?.leaves.filter((l) => !l.hiddenInPicker) ?? [];
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{feedbackCopy.leafLabel}</span>
      <GroupPicker
        map={map}
        value={group}
        onChange={(g) => {
          setGroup(g);
          onChange(null);
        }}
        testIdPrefix={testIdPrefix}
      />
      <select
        aria-label={feedbackCopy.leafPick}
        value={value ? keyOf(value) : ""}
        disabled={!group}
        onChange={(e) => {
          const hit = leaves.find((l) => keyOf({ kind: l.kind, refKey: l.refKey }) === e.target.value);
          onChange(hit ? { kind: hit.kind, refKey: hit.refKey } : null);
        }}
        data-testid={`${testIdPrefix}-leaf`}
        className="min-h-11 min-w-0 rounded-lg border border-line bg-white px-2 text-sm"
      >
        <option value="">{feedbackCopy.leafNone}</option>
        {leaves.map((l) => (
          <option key={keyOf({ kind: l.kind, refKey: l.refKey })} value={keyOf({ kind: l.kind, refKey: l.refKey })}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/revision/FeedbackFields.tsx`**

```tsx
"use client";

import { feedbackCopy } from "@/lib/copy/vi";
import { EXCERPT_MAX, ITEM_MAX, MAX_ITEMS, PRAISE_MAX, type FeedbackDraftItem } from "@/lib/revision/types";
import type { SkillMapView } from "@/lib/skillmap/types";
import { LeafPicker } from "./LeafPicker";

export type FeedbackDraft = { praise: string; items: FeedbackDraftItem[] };
export const emptyItem = (): FeedbackDraftItem => ({ text: "", excerpt: "", leaf: null });

/** The items as the API takes them: trimmed text, excerpt only when given, leaf as {kind, ref_key}. */
export function feedbackPayloadItems(items: FeedbackDraftItem[]) {
  return items.map((i) => ({
    text: i.text.trim(),
    ...(i.excerpt.trim() ? { excerpt: i.excerpt.trim() } : {}),
    ...(i.leaf ? { leaf: { kind: i.leaf.kind, ref_key: i.leaf.refKey } } : {}),
  }));
}

const box = "min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-[15px]";

/** Praise + 1–3 items (text, excerpt from the work, optional skill). Controlled: the parent owns the state and the submit. */
export function FeedbackFields({ value, onChange, map, testIdPrefix }: { value: FeedbackDraft; onChange: (v: FeedbackDraft) => void; map: SkillMapView | null; testIdPrefix: string }) {
  const setItem = (i: number, patch: Partial<FeedbackDraftItem>) =>
    onChange({ ...value, items: value.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  // The text selected in the work beside the panel (WorkPanel / before–after view) becomes the excerpt.
  const takeSelection = (i: number) => {
    const sel = typeof window === "undefined" ? "" : (window.getSelection()?.toString() ?? "");
    if (sel.trim()) setItem(i, { excerpt: sel.trim().slice(0, EXCERPT_MAX) });
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">{feedbackCopy.praiseLabel}</span>
        <span className="text-muted">{feedbackCopy.praiseHint}</span>
        <textarea rows={2} maxLength={PRAISE_MAX} value={value.praise} onChange={(e) => onChange({ ...value, praise: e.target.value })}
          data-testid={`${testIdPrefix}-praise`} className={box} />
      </label>
      {value.items.map((it, i) => (
        <fieldset key={i} className="m-0 flex flex-col gap-2 rounded-lg border border-line p-3" data-testid={`${testIdPrefix}-item-${i + 1}`}>
          <legend className="px-1 text-sm font-semibold">{feedbackCopy.itemLabel(i + 1)}</legend>
          <textarea aria-label={feedbackCopy.itemLabel(i + 1)} rows={2} maxLength={ITEM_MAX} placeholder={feedbackCopy.itemHint} value={it.text}
            onChange={(e) => setItem(i, { text: e.target.value })} data-testid={`${testIdPrefix}-item-${i + 1}-text`} className={box} />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{feedbackCopy.excerptLabel}</span>
            <div className="flex flex-wrap gap-2">
              <input type="text" lang="en" aria-label={feedbackCopy.excerptLabel} maxLength={EXCERPT_MAX} value={it.excerpt}
                onChange={(e) => setItem(i, { excerpt: e.target.value })} data-testid={`${testIdPrefix}-item-${i + 1}-excerpt`}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3" />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => takeSelection(i)} data-testid={`${testIdPrefix}-item-${i + 1}-take`}
                className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm">
                {feedbackCopy.takeSelection}
              </button>
            </div>
            <span className="text-xs text-muted">{feedbackCopy.excerptHint}</span>
          </div>
          {map ? <LeafPicker map={map} value={it.leaf} onChange={(leaf) => setItem(i, { leaf })} testIdPrefix={`${testIdPrefix}-item-${i + 1}-leaf`} /> : null}
          {value.items.length > 1 ? (
            <button type="button" onClick={() => onChange({ ...value, items: value.items.filter((_, k) => k !== i) })}
              className="min-h-11 self-start text-sm text-accent underline">
              {feedbackCopy.removeItem}
            </button>
          ) : null}
        </fieldset>
      ))}
      {value.items.length < MAX_ITEMS ? (
        <button type="button" onClick={() => onChange({ ...value, items: [...value.items, emptyItem()] })} data-testid={`${testIdPrefix}-add`}
          className="min-h-11 self-start rounded-lg border border-line bg-white px-4 text-sm font-semibold">
          {feedbackCopy.addItem}
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Create `components/revision/FeedbackPanel.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { feedbackCopy } from "@/lib/copy/vi";
import { formatWhen } from "@/lib/review/format";
import { revisionFailText } from "@/lib/revision/client";
import { checkFeedback } from "@/lib/revision/rules";
import type { FeedbackItem, FeedbackPanelView } from "@/lib/revision/types";
import type { SkillMapView } from "@/lib/skillmap/types";
import { postJson } from "@/lib/tutorwork/client";
import { emptyItem, FeedbackFields, feedbackPayloadItems, type FeedbackDraft } from "./FeedbackFields";
import { findLeaf } from "./LeafPicker";

/** Numbered items with their excerpt and the NAME of their skill (never its key). Shared by the panel and the before–after view. */
export function FeedbackItemsList({ items, map }: { items: FeedbackItem[]; map: SkillMapView | null }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((it) => {
        const leaf = it.leaf && map ? findLeaf(map, it.leaf) : null;
        return (
          <li key={it.n} data-testid={`feedback-item-${it.n}`} className="flex flex-col gap-1 rounded-lg border border-line px-3 py-2 text-sm">
            <span>
              <b>{feedbackCopy.itemLabel(it.n)}.</b> {it.text}
            </span>
            {it.excerpt ? (
              <q lang="en" className="block rounded bg-[#FBF1DC] px-2 py-1 text-[#6B4600] [quotes:none]">
                “{it.excerpt}”
              </q>
            ) : null}
            {leaf ? <span className="self-start rounded-full bg-[#E3ECE8] px-2 py-0.5 text-xs text-[#1F4439]">{leaf.label}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

const toDraftItems = (items: FeedbackItem[]) => items.map((i) => ({ text: i.text, excerpt: i.excerpt ?? "", leaf: i.leaf }));

/**
 * "Góp ý cho con" beside the work (spec §2 step 2): one praise, 1–3 items, "Yêu cầu con sửa bài" (default) or "Chỉ góp ý". After sending:
 * the note, the child's progress, "Sửa góp ý" while the database still allows it (author, before the child starts), older versions.
 * Score words are refused here and again by the server and the database.
 */
export function FeedbackPanel({ attemptId, panel, map }: { attemptId: string; panel: FeedbackPanelView; map: SkillMapView | null }) {
  const router = useRouter();
  const live = panel.live;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FeedbackDraft>({ praise: "", items: [emptyItem()] });
  const [requires, setRequires] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());

  if (!panel.eligible) return null;
  const formOpen = (panel.canGive && !live) || editing;

  function startEdit() {
    if (!live) return;
    setDraft({ praise: live.praise, items: toDraftItems(live.items) });
    setRequires(live.requiresRevision);
    clientId.current = crypto.randomUUID();
    setEditing(true);
  }

  async function send() {
    const p = checkFeedback(draft.praise, draft.items, panel.text);
    if (p) return setProblem(feedbackCopy.errors[p] ?? null);
    setBusy(true);
    setProblem(null);
    const r = await postJson(`/api/review/attempts/${attemptId}/feedback`, {
      client_id: clientId.current,
      praise: draft.praise.trim(),
      items: feedbackPayloadItems(draft.items),
      requires_revision: requires,
      ...(editing && live ? { supersedes_id: live.id } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 409) clientId.current = crypto.randomUUID();
      return setProblem(revisionFailText(r));
    }
    clientId.current = crypto.randomUUID();
    setEditing(false);
    router.refresh();
  }

  return (
    <section aria-labelledby="feedback-title" className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4" data-testid="feedback-panel">
      <h3 id="feedback-title" className="text-base font-bold">
        {feedbackCopy.title}
      </h3>

      {live && !editing ? (
        <div className="flex flex-col gap-2" data-testid="feedback-live">
          <p className="text-sm text-muted">
            {feedbackCopy.liveTitle} · {feedbackCopy.byLine(live.authorName, formatWhen(live.createdAt))} · {feedbackCopy.modeLine(live.requiresRevision)}
          </p>
          <p className="rounded-lg bg-[#E3ECE8] px-3 py-2 text-[#1F4439]" data-testid="feedback-live-praise">
            {live.praise}
          </p>
          <FeedbackItemsList items={live.items} map={map} />
          {live.revisionState ? (
            <p className="text-sm" data-testid="feedback-revision-state">
              {feedbackCopy.revisionState[live.revisionState]}
              {live.revisionEpisodeId ? (
                <>
                  {" · "}
                  <Link href={`/review/${live.revisionEpisodeId}`} className="text-accent underline">
                    {feedbackCopy.openRevision}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          {live.editable ? (
            <>
              <button type="button" onClick={startEdit} data-testid="feedback-edit" className="min-h-11 self-start rounded-lg border border-line bg-white px-4 text-sm font-semibold">
                {feedbackCopy.edit}
              </button>
              <p className="text-xs text-muted">{feedbackCopy.editHint}</p>
            </>
          ) : null}
          {panel.history.length > 0 ? (
            <details data-testid="feedback-history" className="text-sm">
              <summary className="min-h-11 cursor-pointer py-2">{feedbackCopy.history(panel.history.length)}</summary>
              {panel.history.map((h) => (
                <div key={h.id} className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                  <p className="text-xs text-muted">{feedbackCopy.byLine(h.authorName, formatWhen(h.createdAt))}</p>
                  <p>{h.praise}</p>
                  <FeedbackItemsList items={h.items} map={map} />
                </div>
              ))}
            </details>
          ) : null}
        </div>
      ) : null}

      {formOpen ? (
        <div className="flex flex-col gap-3" data-testid="feedback-form">
          <p className="text-sm text-muted">{feedbackCopy.intro}</p>
          <FeedbackFields value={draft} onChange={(v) => { setDraft(v); setProblem(null); }} map={map} testIdPrefix="feedback" />
          {/* A round-2 note always asks for a revision (D7): editing one offers no "Chỉ góp ý". */}
          {editing && live && live.round > 1 ? null : (
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="text-sm font-semibold">{feedbackCopy.modeLegend}</legend>
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input type="radio" name="feedback-mode" checked={requires} onChange={() => setRequires(true)} data-testid="feedback-require" className="mt-1 h-5 w-5 accent-[#2B5D4F]" />
              <span>
                <b>{feedbackCopy.requireRevision}</b>
                <span className="block text-muted">{feedbackCopy.requireRevisionHint}</span>
              </span>
            </label>
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input type="radio" name="feedback-mode" checked={!requires} onChange={() => setRequires(false)} data-testid="feedback-note-only" className="mt-1 h-5 w-5 accent-[#2B5D4F]" />
              <span>
                <b>{feedbackCopy.noteOnly}</b>
                <span className="block text-muted">{feedbackCopy.noteOnlyHint}</span>
              </span>
            </label>
          </fieldset>
          )}
          {problem ? (
            <p role="alert" data-testid="feedback-problem" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={send} data-testid="feedback-send" className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:opacity-60">
              {busy ? feedbackCopy.sending : editing ? feedbackCopy.saveEdit : feedbackCopy.send}
            </button>
            {editing ? (
              <button type="button" onClick={() => setEditing(false)} className="min-h-12 rounded-xl border border-line bg-white px-5 text-base">
                {feedbackCopy.cancel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!live && !panel.canGive ? (
        <p className="text-sm text-muted" data-testid="feedback-read-only">
          {feedbackCopy.readOnly}
        </p>
      ) : null}
    </section>
  );
}
```

The hooks run before the `if (!panel.eligible) return null;`. This keeps the rules of hooks: the early return comes after every `useState` / `useRef`.

- [ ] **Step 6: Wire the review page** — `app/review/[episodeId]/page.tsx`:
  - imports: `import { FeedbackPanel } from "@/components/revision/FeedbackPanel";` and `import { loadFeedbackPanel } from "@/lib/revision/load";`;
  - after the `const writing = …` statement add:

```tsx
  // S6: "Góp ý cho con" (in-app writing only; the panel decides from the database's answer). A failed lookup (e.g. 0021 not applied yet)
  // leaves the panel out; it never blocks the review.
  const feedback = await loadFeedbackPanel(view.attempt.id, member.id).catch(() => null);
  const map = writing ? writing[2] : null;
```

  - in the left column, right after `<WorkPanel view={view} />`, add:

```tsx
            {feedback && feedback.eligible && (view.attempt.mode !== "REVISION" || feedback.live) ? (
              <FeedbackPanel attemptId={view.attempt.id} panel={feedback} map={map} />
            ) : null}
```

- [ ] **Step 7: Run** — `npx vitest run tests/unit/revisionUi.test.ts tests/unit/reviewUi.test.ts tests/unit/lightOnly.test.ts && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 8: Commit**

```bash
git add components/revision/LeafPicker.tsx components/revision/FeedbackFields.tsx components/revision/FeedbackPanel.tsx app/review/[episodeId]/page.tsx tests/unit/revisionUi.test.ts
git commit -m "feat(s6): review screen - 'Góp ý cho con' panel with excerpt from the work, optional skill leaf, 'Sửa góp ý' while allowed, history"
```

---

### Task 8: The child — "Sửa bài" first in Việc tiếp theo, the revision page, "Thầy/cô đã xem bài sửa của bạn" — after Gate 0

**Files:**
- Create: `lib/revision/home.ts`, `components/revision/ExcerptText.tsx`, `components/revision/RevisionForm.tsx`, `components/student/RevisionRows.tsx`, `components/student/FeedbackBox.tsx`
- Modify: `components/student/StudentHome.tsx`, `app/page.tsx` (student branch), `app/activities/[id]/page.tsx`, `tests/unit/revisionUi.test.ts`, `tests/unit/revision.test.ts`

**Interfaces:**
- Consumes: Task 5 (`segmentsFor`, `checkMarks`, `marksToSend`, `isUnchanged`, types, `revisionCopy`); Task 6 (`loadRevisionPage`, `StudentHomeData.feedback`, `PUT /api/student/revisions/:id/draft`, `POST /api/student/revisions/:id`); S4 (`ASSISTANCE_VALUES`, `work.help`, `work.helpTitle`, `work.helpHint`, `work.pastedLabel`, `work.pastedNote`, `work.saving`, `work.notSaved`, `work.savedAt`, `work.otherTab`, `work.wordCount`, `work.back`, `work.homeLink`, `formatHm`, `wordsOf`, `baseRevisionOf`, `stepTitle`).
- Produces:
  - `lib/revision/home.ts`: `splitFeedback(items: MyFeedbackItem[]): { rows: MyFeedbackItem[]; box: MyFeedbackItem[]; openActivityIds: Set<string> }` (rows = todo + submitted, in DB order; box = seen + note); `homeSteps(steps: HomeStep[], openActivityIds: Set<string>): HomeStep[]` (hides the app's own revision steps, `stepNo > 1000`, unless open).
  - `ExcerptText({ text, items }: { text: string; items: { n: number; excerpt: string | null }[] })` with test ids `excerpt-{n}`.
  - `RevisionForm({ revision }: { revision: MyRevisionView })`. Test ids: `revision-form`, `revision-praise`, `revision-item-{n}`, `revision-old`, `revision-editor`, `revision-mark-{n}-changed|kept`, `revision-reason-{n}`, `revision-help`, `revision-problem`, `revision-submit`, `revision-save-status`, `revision-receipt`.
  - `RevisionRows({ items }: { items: MyFeedbackItem[] })` (test ids `revision-rows`, `revision-row-{activityId}`); `FeedbackBox({ items }: { items: MyFeedbackItem[] })` (test ids `feedback-box`, `feedback-seen-{feedbackId}`, `feedback-note-{feedbackId}`).
  - `StudentHome` gains the prop `feedback?: MyFeedbackItem[] | null`.

- [ ] **Step 1: Write the failing tests**
  - In `tests/unit/revision.test.ts`, add `import { homeSteps, splitFeedback } from "@/lib/revision/home";` and append:

```ts
describe("the child's home (pure)", () => {
  const f = (over: Partial<import("@/lib/revision/types").MyFeedbackItem>) => ({
    feedbackId: "f", activityId: "a", titleVi: "Núi lửa", round: 1, itemsCount: 2, state: "todo" as const, seenAt: null, closingNote: null, praise: null, notes: null, ...over,
  });
  it("todo and submitted rows go first, 'đã xem' and notes go to the box; only todo steps are open", () => {
    const s = splitFeedback([f({ feedbackId: "1", activityId: "r1" }), f({ feedbackId: "2", activityId: "r2", state: "submitted" }), f({ feedbackId: "3", state: "seen" }), f({ feedbackId: "4", state: "note" })]);
    expect(s.rows.map((x) => x.feedbackId)).toEqual(["1", "2"]);
    expect(s.box.map((x) => x.feedbackId)).toEqual(["3", "4"]);
    expect([...s.openActivityIds]).toEqual(["r1"]);
  });
  it("the app's own revision steps (1001+) are listed only while open; template revision steps always", () => {
    const step = (stepNo: number, activityId: string) => ({ activityId, stepNo, activityType: "ACT-REVISE", mode: "REVISION" as const, purpose: [], timeMin: null, date: "2026-10-22", attempts: 0 });
    expect(homeSteps([step(13, "t"), step(1001, "own-open"), step(1002, "own-old")], new Set(["own-open"])).map((s) => s.activityId)).toEqual(["t", "own-open"]);
  });
});
```

  - In `tests/unit/revisionUi.test.ts`, add `import { ExcerptText } from "@/components/revision/ExcerptText";`, `import { RevisionForm } from "@/components/revision/RevisionForm";`, `import { StudentHome } from "@/components/student/StudentHome";`, `import { revisionCopy, work } from "@/lib/copy/vi";` and `import type { MyRevisionView } from "@/lib/revision/types";`, then replace `// (Tasks 8 and 9 add their describe blocks here)` with:

```ts
// The S4/S5 score pattern ("3/4 ·") plus words that would leak scoring; not a bare "d/d" (the home header shows today's date "22/10").
const SCORE = /\d\s*\/\s*4\s*·|điểm|verdict|improved|not_yet|reason_ok/i;

describe("Sửa bài (the child)", () => {
  const rev = (over: Partial<MyRevisionView> = {}): MyRevisionView => ({
    activityId: "r1", instanceId: "i1", titleVi: "Núi lửa", bigQuestionEn: "Why do volcanoes erupt?", round: 1, praise: "Con giải thích rõ vì sao núi lửa phun.",
    items: [{ n: 1, text: "Thêm câu kết.", excerpt: "Other volcanoes let lava flow gently." }, { n: 2, text: "Dùng từ nối.", excerpt: null }],
    oldText: TEXT, reasonRequired: false, state: "todo", submittedAt: null, closingNote: null, draft: null, ...over,
  });

  it("the page shows the praise, the numbered items, the old text with the excerpt highlighted, the editor filled with the old text, a mark per item", () => {
    const html = renderToStaticMarkup(createElement(RevisionForm, { revision: rev() }));
    expect(html).toContain(revisionCopy.praiseTitle);
    expect(html).toContain("Con giải thích rõ vì sao núi lửa phun.");
    expect(html).toContain('data-testid="revision-item-2"');
    expect(html).toContain('data-testid="excerpt-1"');
    expect(html).toContain(revisionCopy.showOld);
    expect(html).toMatch(/data-testid="revision-editor"[^>]*>Some volcanoes explode/);
    expect(html).toContain('data-testid="revision-mark-1-changed"');
    expect(html).toContain('data-testid="revision-mark-2-kept"');
    expect(html).toContain(revisionCopy.reasonLabel(false));
    expect(html).toContain(work.helpTitle);
    expect(html).not.toMatch(SCORE);
  });

  it("Track B (reason required) says so; a saved draft wins over the old text", () => {
    const html = renderToStaticMarkup(createElement(RevisionForm, { revision: rev({ reasonRequired: true, round: 2,
      draft: { content: { text: "Draft text here.", marks: { "1": { choice: "changed", reason: "I added an ending." } } }, revision: 3, updatedAt: "2026-10-22T03:00:00Z" } }) }));
    expect(html).toContain(revisionCopy.reasonLabel(true));
    expect(html).toContain(revisionCopy.secondRound);
    expect(html).toMatch(/data-testid="revision-editor"[^>]*>Draft text here\./);
    expect(html).toContain("I added an ending.");
  });

  it("excerpts are marked and numbered in the old text", () => {
    const html = renderToStaticMarkup(createElement(ExcerptText, { text: TEXT, items: [{ n: 1, excerpt: "the magma is thick" }] }));
    expect(html).toMatch(/<mark[^>]*data-testid="excerpt-1"[^>]*>the magma is thick/);
  });

  it("home: 'Sửa bài' rows come first, above Việc tiếp theo; 'đã xem' and notes in the box; no score anywhere", () => {
    const html = renderToStaticMarkup(createElement(StudentHome, {
      alias: "An (thử)", color: "#9A4A15", data: { inquiries: [] }, review: null,
      feedback: [
        { feedbackId: "f1", activityId: "r1", titleVi: "Núi lửa", round: 1, itemsCount: 2, state: "todo", seenAt: null, closingNote: null, praise: null, notes: null },
        { feedbackId: "f2", activityId: "r2", titleVi: "Vòng tuần hoàn nước", round: 1, itemsCount: 1, state: "seen", seenAt: "2026-10-22T03:00:00Z", closingNote: "Bài sửa rõ hơn nhiều!", praise: null, notes: null },
        { feedbackId: "f3", activityId: "a3", titleVi: "Hành tinh", round: 1, itemsCount: 1, state: "note", seenAt: null, closingNote: null, praise: "Câu mở đoạn rõ.", notes: [{ n: 1, text: "Thêm ví dụ.", excerpt: null }] },
      ],
    }));
    expect(html.indexOf('data-testid="revision-rows"')).toBeGreaterThan(-1);
    expect(html).toContain(revisionCopy.rowTitle("Núi lửa"));
    expect(html).toContain(revisionCopy.rowLine(2));
    expect(html).toContain('href="/activities/r1"');
    expect(html).toContain(revisionCopy.seenTitle);
    expect(html).toContain("Bài sửa rõ hơn nhiều!");
    expect(html).toContain("Câu mở đoạn rõ.");
    expect(html).not.toMatch(SCORE);
  });
});

// (Task 9 adds its describe blocks here)
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/revision.test.ts tests/unit/revisionUi.test.ts` → FAIL.

- [ ] **Step 3: Create `lib/revision/home.ts`**

```ts
/** The child's home with feedback (pure): which rows go first, which go to the box, which revision steps are open. */
import type { HomeStep } from "@/lib/work/types";
import { AUTO_REVISION_STEP_BASE, type MyFeedbackItem } from "./types";

export function splitFeedback(items: MyFeedbackItem[]): { rows: MyFeedbackItem[]; box: MyFeedbackItem[]; openActivityIds: Set<string> } {
  return {
    rows: items.filter((i) => i.state === "todo" || i.state === "submitted"),
    box: items.filter((i) => i.state === "seen" || i.state === "note"),
    openActivityIds: new Set(items.filter((i) => i.state === "todo").map((i) => i.activityId)),
  };
}

/** A revision step the app added (1001+) is shown only while the child has something to revise there (D3); template steps stay. */
export function homeSteps(steps: HomeStep[], openActivityIds: Set<string>): HomeStep[] {
  return steps.filter((s) => s.stepNo <= AUTO_REVISION_STEP_BASE || openActivityIds.has(s.activityId));
}
```

- [ ] **Step 4: Create `components/revision/ExcerptText.tsx`**

```tsx
import { segmentsFor } from "@/lib/revision/excerpt";

/** The child's old text with the excerpts of the numbered items marked (underline + tint + number: never colour alone). */
export function ExcerptText({ text, items }: { text: string; items: { n: number; excerpt: string | null }[] }) {
  return (
    <p lang="en" className="whitespace-pre-wrap text-[15px] leading-relaxed">
      {segmentsFor(text, items).map((s, i) =>
        s.n === null ? (
          <span key={i}>{s.text}</span>
        ) : (
          <mark key={i} data-testid={`excerpt-${s.n}`} className="rounded bg-[#FBF1DC] px-0.5 text-[#3D2A00] underline decoration-2 underline-offset-2">
            {s.text}
            <sup className="ml-0.5 text-xs font-bold">{s.n}</sup>
          </mark>
        ),
      )}
    </p>
  );
}
```

- [ ] **Step 5: Create `components/revision/RevisionForm.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { revisionCopy, work } from "@/lib/copy/vi";
import { checkMarks, marksToSend } from "@/lib/revision/rules";
import { isUnchanged } from "@/lib/revision/text";
import { REASON_MAX, type MarkChoice, type MarkDraft, type MyRevisionView, type RevisionDraftContent } from "@/lib/revision/types";
import { ASSISTANCE_VALUES, type Assistance } from "@/lib/work/types";
import { baseRevisionOf, formatHm, wordsOf } from "@/lib/work/view";
import { ExcerptText } from "./ExcerptText";

const AUTOSAVE_MS = 5000;
type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * "Sửa bài" (spec §2 step 4): the praise, the numbered items (excerpts marked in the old text), the editor filled with the old text,
 * "Xem bài cũ", a mark per item (Đã sửa / Giữ nguyên + reason as the track requires), the help declaration. Autosaves like S4 (every ~5 s
 * and on blur). One client_submission_id per content; the reply is a receipt. Nothing here shows a score, a verdict or a skill code.
 */
export function RevisionForm({ revision }: { revision: MyRevisionView }) {
  const initial: RevisionDraftContent = revision.draft?.content ?? {};
  const [text, setText] = useState(initial.text ?? revision.oldText);
  const [marks, setMarks] = useState<Record<string, MarkDraft>>(initial.marks ?? {});
  const [pasted, setPasted] = useState(initial.pasted ?? false);
  const [assist, setAssist] = useState<Assistance[]>(initial.assistance ?? []);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(revision.draft?.updatedAt ?? null);
  const [otherTab, setOtherTab] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ submittedAt: string } | null>(null);

  const dirty = useRef(false);
  const closed = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);
  const base = useRef<number>(baseRevisionOf(revision.draft));
  const pending = useRef<{ id: string; sig: string } | null>(null);
  const contentRef = useRef<RevisionDraftContent>({});
  useEffect(() => {
    contentRef.current = { text, marks, pasted, assistance: assist };
  });

  function touch() {
    dirty.current = true;
    setProblem(null);
  }
  function setMark(n: number, patch: { choice?: MarkChoice; reason?: string }) {
    touch();
    setMarks((m) => ({ ...m, [String(n)]: { ...m[String(n)], ...patch } }));
  }

  async function saveNow(): Promise<void> {
    if (closed.current) return;
    if (inflight.current) await inflight.current;
    if (!dirty.current || closed.current) return;
    const snapshot = contentRef.current;
    dirty.current = false;
    const run = (async () => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/student/revisions/${revision.activityId}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: snapshot, base_revision: base.current }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { draft: { revision: number; savedAt: string; otherTabChanged: boolean } };
        base.current = json.draft.revision;
        setSavedAt(json.draft.savedAt);
        setOtherTab(json.draft.otherTabChanged);
        setSaveState("saved");
      } catch {
        dirty.current = true;
        setSaveState("error");
      }
    })();
    inflight.current = run;
    await run;
    if (inflight.current === run) inflight.current = null;
  }
  const saveRef = useRef(saveNow);
  useEffect(() => {
    saveRef.current = saveNow;
  });
  useEffect(() => {
    const timer = setInterval(() => void saveRef.current(), AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, []);

  function toggleHelp(value: Assistance, on: boolean) {
    touch();
    setAssist((prev) => (!on ? prev.filter((v) => v !== value) : value === "none" ? ["none"] : [...prev.filter((v) => v !== "none"), value]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || receipt) return;
    if (text.trim() === "") return setProblem(revisionCopy.problems.need_text ?? null);
    const p = checkMarks(revision.items, marks, revision.reasonRequired, isUnchanged(revision.oldText, text));
    if (p) return setProblem(revisionCopy.problems[p] ?? null);
    if (assist.length === 0) return setProblem(work.needHelp);
    setBusy(true);
    setProblem(null);
    if (inflight.current) await inflight.current;
    const body = { text, marks: marksToSend(revision.items, marks), assistance: assist, provenance: pasted ? "pasted" : "in_app" };
    const sig = JSON.stringify(body);
    if (!pending.current || pending.current.sig !== sig) pending.current = { id: crypto.randomUUID(), sig };
    try {
      const res = await fetch(`/api/student/revisions/${revision.activityId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, client_submission_id: pending.current.id }),
      });
      if (res.status === 409) {
        setProblem(revisionCopy.submitConflict);
        pending.current = null;
        return;
      }
      if (res.status === 400) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setProblem((j.error && revisionCopy.problems[j.error]) || revisionCopy.submitError);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { receipt: { submittedAt: string } };
      closed.current = true;
      dirty.current = false;
      pending.current = null;
      setReceipt(json.receipt);
    } catch {
      setProblem(revisionCopy.submitError);
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <section aria-live="polite" data-testid="revision-receipt" className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
        <h2 role="status" className="text-xl font-bold text-accent">
          {revisionCopy.receiptTitle}
        </h2>
        <p className="text-[15px]">{revisionCopy.receiptLine}</p>
        <Link href="/" className="flex min-h-12 items-center self-start rounded-xl bg-accent px-5 text-base font-bold text-white">
          {work.homeLink}
        </Link>
      </section>
    );
  }

  const savedLine = saveState === "saving" ? work.saving : saveState === "error" ? work.notSaved : savedAt ? work.savedAt(formatHm(savedAt)) : "";

  return (
    <form
      onSubmit={submit}
      onBlur={() => void saveNow()}
      onPasteCapture={() => {
        setPasted(true);
        touch();
      }}
      className="flex flex-col gap-3.5"
      data-testid="revision-form"
      noValidate
    >
      {revision.round > 1 ? <p className="text-sm font-semibold text-[#6B4600]">{revisionCopy.secondRound}</p> : null}

      <section aria-labelledby="praise" className="rounded-2xl bg-[#E3ECE8] p-4 text-[#1F4439]" data-testid="revision-praise">
        <h2 id="praise" className="text-sm font-semibold">
          {revisionCopy.praiseTitle}
        </h2>
        <p className="text-[15px]">{revision.praise}</p>
      </section>

      <section aria-labelledby="items" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
        <h2 id="items" className="text-sm font-semibold text-muted">
          {revisionCopy.itemsTitle}
        </h2>
        <ol className="flex flex-col gap-3">
          {revision.items.map((it) => {
            const m = marks[String(it.n)] ?? {};
            return (
              <li key={it.n} className="flex flex-col gap-2" data-testid={`revision-item-${it.n}`}>
                <p className="text-[15px]">
                  <b>{revisionCopy.itemLabel(it.n)}.</b> {it.text}
                </p>
                {it.excerpt ? (
                  <p className="text-sm text-muted">
                    {revisionCopy.inYourText} <span lang="en" className="rounded bg-[#FBF1DC] px-1 text-[#3D2A00] underline">{it.excerpt}</span>
                  </p>
                ) : null}
                <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
                  <legend className="sr-only">{revisionCopy.marksTitle}</legend>
                  {(["changed", "kept"] as const).map((c) => (
                    <label key={c} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-[15px] has-[:checked]:border-accent has-[:checked]:bg-[#E3ECE8]">
                      <input type="radio" name={`mark-${it.n}`} checked={m.choice === c} onChange={() => setMark(it.n, { choice: c })}
                        data-testid={`revision-mark-${it.n}-${c}`} className="h-5 w-5 accent-[#2B5D4F]" />
                      {c === "changed" ? revisionCopy.changed : revisionCopy.kept}
                    </label>
                  ))}
                </fieldset>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">{revisionCopy.reasonLabel(revision.reasonRequired)}</span>
                  <input type="text" maxLength={REASON_MAX} value={m.reason ?? ""} placeholder={revisionCopy.reasonHint}
                    onChange={(e) => setMark(it.n, { reason: e.target.value })} data-testid={`revision-reason-${it.n}`}
                    className="min-h-11 rounded-lg border border-line bg-white px-3" />
                </label>
              </li>
            );
          })}
        </ol>
      </section>

      <details className="rounded-2xl border border-line bg-white p-4" data-testid="revision-old">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">{revisionCopy.showOld}</summary>
        <ExcerptText text={revision.oldText} items={revision.items} />
      </details>

      <section aria-labelledby="edit" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
        <h2 id="edit" className="text-sm font-semibold text-muted">
          {revisionCopy.editorTitle}
        </h2>
        <textarea aria-label={revisionCopy.editorLabel} rows={10} value={text} maxLength={20000} lang="en"
          onChange={(e) => { touch(); setText(e.target.value); }} data-testid="revision-editor"
          className="min-h-48 rounded-lg border border-line bg-white px-3 py-2 text-base leading-relaxed" />
        <span className="text-[13px] text-muted">{work.wordCount(wordsOf(text))}</span>
      </section>

      <fieldset data-testid="revision-help" className="m-0 flex flex-col gap-1 rounded-2xl border border-line bg-white px-4 py-3">
        <legend className="px-1 text-sm font-semibold text-muted">{work.helpTitle}</legend>
        <p className="mb-1 text-[13px] leading-snug text-muted">{work.helpHint}</p>
        {ASSISTANCE_VALUES.map((v) => (
          <label key={v} className="flex min-h-11 items-center gap-2.5 text-sm">
            <input type="checkbox" checked={assist.includes(v)} onChange={(e) => toggleHelp(v, e.target.checked)} className="h-[22px] w-[22px] accent-[#2B5D4F]" />
            {work.help[v]}
          </label>
        ))}
        {pasted ? <p className="text-[13px] text-muted">{work.pastedNote}</p> : null}
      </fieldset>

      {problem ? (
        <p role="alert" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]" data-testid="revision-problem">
          {problem}
        </p>
      ) : null}
      {otherTab ? (
        <p role="status" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {work.otherTab}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <button type="submit" disabled={busy} data-testid="revision-submit" className="min-h-[52px] rounded-[14px] bg-accent text-base font-bold text-white disabled:opacity-60">
          {busy ? revisionCopy.submitting : revisionCopy.submit}
        </button>
        <span className="text-center text-xs text-muted" aria-live="polite" data-testid="revision-save-status">
          {savedLine}
        </span>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Create the home pieces**

```tsx
// components/student/RevisionRows.tsx
import Link from "next/link";
import { revisionCopy } from "@/lib/copy/vi";
import type { MyFeedbackItem } from "@/lib/revision/types";

/** "Sửa bài" rows at the top of Việc tiếp theo (spec §2 step 3): to do first, then "đã nộp" (waiting). No score, no verdict. */
export function RevisionRows({ items }: { items: MyFeedbackItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={revisionCopy.pageTitle} className="flex flex-col gap-2" data-testid="revision-rows">
      {items.map((i) =>
        i.state === "todo" ? (
          <Link key={i.feedbackId} href={`/activities/${i.activityId}`} data-testid={`revision-row-${i.activityId}`}
            className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border-2 border-accent bg-white px-4 py-3 no-underline">
            <span className="flex min-w-0 flex-col">
              <span className="font-bold text-ink">{revisionCopy.rowTitle(i.titleVi)}</span>
              <span className="text-[13px] text-muted">{revisionCopy.rowLine(i.itemsCount)}</span>
            </span>
            <span className="shrink-0 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-white">{revisionCopy.start}</span>
          </Link>
        ) : (
          <p key={i.feedbackId} data-testid={`revision-row-${i.activityId}`} className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">
            <b>{revisionCopy.rowTitle(i.titleVi)}</b> · {revisionCopy.submittedRow}
          </p>
        ),
      )}
    </section>
  );
}
```

```tsx
// components/student/FeedbackBox.tsx
import { revisionCopy } from "@/lib/copy/vi";
import type { MyFeedbackItem } from "@/lib/revision/types";

/** "Góp ý của thầy/cô": "Thầy/cô đã xem bài sửa của bạn" + the closing note, and "Chỉ góp ý" notes (14 days). Never a score or a verdict. */
export function FeedbackBox({ items }: { items: MyFeedbackItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="feedback-box-title" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" data-testid="feedback-box">
      <h2 id="feedback-box-title" className="text-[15px] font-bold">
        {revisionCopy.boxTitle}
      </h2>
      {items.map((i) =>
        i.state === "seen" ? (
          <div key={i.feedbackId} data-testid={`feedback-seen-${i.feedbackId}`} className="flex flex-col gap-1 rounded-xl bg-[#E3ECE8] px-3 py-2 text-[#1F4439]">
            <span className="text-sm font-semibold">{revisionCopy.seenTitle} · {i.titleVi}</span>
            {i.closingNote ? (
              <span className="text-sm">
                {revisionCopy.closingLabel}: {i.closingNote}
              </span>
            ) : null}
          </div>
        ) : (
          <details key={i.feedbackId} data-testid={`feedback-note-${i.feedbackId}`} className="rounded-xl border border-line px-3 py-2 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">{revisionCopy.noteTitle(i.titleVi)}</summary>
            {i.praise ? <p className="mb-1">{i.praise}</p> : null}
            <ol className="flex list-decimal flex-col gap-1 pl-5">
              {(i.notes ?? []).map((n) => (
                <li key={n.n}>
                  {n.text}
                  {n.excerpt ? <span lang="en" className="ml-1 rounded bg-[#FBF1DC] px-1 underline">{n.excerpt}</span> : null}
                </li>
              ))}
            </ol>
          </details>
        ),
      )}
    </section>
  );
}
```

- [ ] **Step 7: `components/student/StudentHome.tsx`**
  - imports: add `import type { MyFeedbackItem } from "@/lib/revision/types";`, `import { homeSteps, splitFeedback } from "@/lib/revision/home";`, `import { FeedbackBox } from "./FeedbackBox";`, `import { RevisionRows } from "./RevisionRows";`;
  - `StepRow` gets a third prop `open: boolean` and computes `const doable = doableInApp(step.activityType, step.mode) || open;`;
  - `InquiryCard` gets the prop `openIds: Set<string>`: replace `inquiry.steps` with `homeSteps(inquiry.steps, openIds)` in all three places (the counts and the list), use `(s) => doableInApp(s.activityType, s.mode) || openIds.has(s.activityId)` for `inApp`, and pass `open={openIds.has(s.activityId)}` to `StepRow`;
  - `StudentHome` signature becomes `({ alias, color, data, review = null, feedback = null }: { …; feedback?: MyFeedbackItem[] | null })`. At its top add `const fb = splitFeedback(feedback ?? []);`. Place `<RevisionRows items={fb.rows} />` immediately **above** the `{next ? (<section … data-testid="next-task"` block, `<FeedbackBox items={fb.box} />` right after the `ReviewByDomain` line, and pass `openIds={fb.openActivityIds}` to every `InquiryCard`.
  - `pickNextTask` is unchanged: revision rows sit above the next-task card, and the S4 test ids and behaviour of that card stay as they are (S4 e2e).

- [ ] **Step 8: `app/page.tsx`** — in the student branch replace `<StudentHome alias={alias} color={color} data={work.home} review={work.review} />` with `<StudentHome alias={alias} color={color} data={work.home} review={work.review} feedback={work.feedback} />`.

- [ ] **Step 9: `app/activities/[id]/page.tsx`**
  - imports: `import { RevisionForm } from "@/components/revision/RevisionForm";`, `import { revisionCopy } from "@/lib/copy/vi";` (add to the existing copy import), `import { loadRevisionPage } from "@/lib/work/load";` (add to the existing import);
  - replace the line `  if (!a.supported) {` with:

```tsx
  if (!a.supported && a.mode === "REVISION") {
    // S6: a REVISION step with feedback is done in the app (eng_revision_open); without feedback it stays a neutral "not in the app" step.
    const r = await loadRevisionPage(id);
    if (r.kind === "login") redirect("/login");
    if (r.kind === "ok") {
      const rv = r.revision;
      return (
        <>
          <AppHeader />
          <main className="mx-auto flex max-w-xl flex-col gap-3.5 px-5 py-5" data-testid="revision-page">
            <header className="flex items-center gap-2">
              <Link href="/" className="flex min-h-11 min-w-11 items-center text-sm font-semibold text-accent">
                {work.back(rv.titleVi)}
              </Link>
            </header>
            <h1 className="text-lg font-bold">{revisionCopy.pageTitle}</h1>
            {rv.state === "todo" ? (
              <RevisionForm revision={rv} />
            ) : (
              <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" data-testid={`revision-${rv.state}`}>
                <p role="status" className="text-[15px] font-semibold text-accent">
                  {rv.state === "seen" ? revisionCopy.seenTitle : revisionCopy.waiting}
                </p>
                {rv.state === "seen" && rv.closingNote ? (
                  <p className="text-[15px]">
                    {revisionCopy.closingLabel}: {rv.closingNote}
                  </p>
                ) : null}
                <Link href="/" className="flex min-h-12 items-center self-start rounded-xl bg-accent px-5 text-base font-bold text-white">
                  {work.homeLink}
                </Link>
              </section>
            )}
          </main>
        </>
      );
    }
  }
  if (!a.supported) {
```

- [ ] **Step 10: Run** — `npx vitest run tests/unit/revision.test.ts tests/unit/revisionUi.test.ts tests/unit/workUi.test.ts tests/unit/lightOnly.test.ts && npm run typecheck && npm run lint` → PASS. The existing `workUi` tests still pass, because `feedback` is optional and defaults to none.

- [ ] **Step 11: Commit**

```bash
git add lib/revision/home.ts components/revision/ExcerptText.tsx components/revision/RevisionForm.tsx components/student/RevisionRows.tsx components/student/FeedbackBox.tsx components/student/StudentHome.tsx app/page.tsx app/activities/[id]/page.tsx tests/unit/revision.test.ts tests/unit/revisionUi.test.ts
git commit -m "feat(s6): the child - 'Sửa bài' first in Việc tiếp theo, revision page on the old text with marks per item, 'Thầy/cô đã xem bài sửa của bạn'"
```

---

### Task 9: Review "Bài sửa lại" (before–after, verdicts, Xong / Mở vòng 2, optional scoring) and "Bài đã sửa" for parent and tutor — after Gate 0

**Files:**
- Create: `components/revision/DiffView.tsx`, `components/revision/RevisionReview.tsx`, `components/revision/RevisionList.tsx`, `app/learners/[id]/revisions/page.tsx`, `app/learners/[id]/revisions/[attemptId]/page.tsx`
- Modify: `components/review/ScoringPanel.tsx`, `app/review/[episodeId]/page.tsx`, `app/review/page.tsx`, `components/LearnerCard.tsx`, `tests/unit/revisionUi.test.ts`

**Interfaces:**
- Consumes: Task 5 (`diffWords`, `changeCount`, `verdictsFor`, `missingVerdicts`, `checkFeedback`, `revisionReviewCopy`, `feedbackCopy`); Task 6 (`loadRevisionView`, `loadRevisionList`, `revisionFailText`, `POST /api/review/attempts/:id/revision-finish`, `InboxItem.revisionRound`); Task 7 (`FeedbackFields`, `emptyItem`, `feedbackPayloadItems`, `FeedbackItemsList`); `requireLearnerPage` (`lib/tutorwork/page.ts`); `loadPickerMap`; `formatWhen`; `UUID_RE`.
- Produces:
  - `DiffView({ before, after }: { before: string; after: string })` (test ids `diff-view`, `diff-before`, `diff-after`; `<del>` / `<ins>` with screen-reader labels).
  - `RevisionReview({ view, map, readOnly }: { view: RevisionView; map: SkillMapView | null; readOnly?: boolean })` (test ids `revision-review`, `revision-check-{n}`, `verdict-{n}-{verdict}`, `revision-closing`, `revision-finish`, `revision-round2-open`, `round2-…` (FeedbackFields prefix), `revision-round2-send`, `revision-review-problem`, `revision-done`).
  - `RevisionList({ learnerId, items }: { learnerId: string; items: RevisionListItem[] })` (test ids `revisions-list`, `revisions-empty`, `revision-pair-{attemptId}`).
  - `ScoringPanel` gains the prop `optional?: boolean`. On a revision, any chosen skills can be saved and no skill is required.
  - Pages `/learners/[id]/revisions` and `/learners/[id]/revisions/[attemptId]`, open to tutor and parent (`tutorwork:read`); students and outsiders get 404.
  - The learner card gets the link "Bài đã sửa" (`revisions-link-{learnerId}`); the inbox row gets the chip `inbox-revision`.

- [ ] **Step 1: Write the failing tests** — in `tests/unit/revisionUi.test.ts`, add the imports `import { DiffView } from "@/components/revision/DiffView";`, `import { RevisionList } from "@/components/revision/RevisionList";`, `import { RevisionReview } from "@/components/revision/RevisionReview";`, `import { ScoringPanel } from "@/components/review/ScoringPanel";`, `import { reviewPage, revisionReviewCopy } from "@/lib/copy/vi";` and `import type { RevisionView } from "@/lib/revision/types";`, then replace `// (Task 9 adds its describe blocks here)` with:

```ts
describe("Bài sửa lại (before–after) and Bài đã sửa", () => {
  const view = (over: Partial<RevisionView> = {}): RevisionView => ({
    attemptId: "r", episodeId: "e", learnerId: "l", alias: "An (thử)", round: 1, titleVi: "Núi lửa", submittedAt: "2026-10-22T03:00:00Z",
    before: { attemptId: "o", episodeId: "eo", text: "The gas stays inside. The pressure grows.", submittedAt: "2026-10-21T03:00:00Z" },
    after: { text: "The gas stays inside, so the pressure grows a lot." },
    feedback: { id: "f", praise: "Con giải thích rõ.", items: [{ n: 1, text: "Dùng từ nối chỉ kết quả.", excerpt: null, leaf: null }, { n: 2, text: "Thêm ví dụ.", excerpt: null, leaf: null }],
      authorName: "Thầy/cô của An (thử)", createdAt: "2026-10-21T04:00:00Z" },
    marks: [{ n: 1, choice: "changed", reason: "Mình thêm so." }, { n: 2, choice: "kept", reason: null }],
    checks: [], closing: null, nextRound: null, reasonRequired: false, canFinish: true, canOpenRound2: true, ...over,
  });

  it("the diff strikes removed words in the old text and marks added words in the new one, with words for screen readers", () => {
    const html = renderToStaticMarkup(createElement(DiffView, { before: "a b c", after: "a x c" }));
    expect(html).toMatch(/data-testid="diff-before"[\s\S]*<del[^>]*>[\s\S]*b [\s\S]*<\/del>/);
    expect(html).toMatch(/data-testid="diff-after"[\s\S]*<ins[^>]*>[\s\S]*x [\s\S]*<\/ins>/);
    expect(html).toContain(revisionReviewCopy.deletedLabel);
    expect(html).toContain(revisionReviewCopy.addedLabel);
    expect(renderToStaticMarkup(createElement(DiffView, { before: "same", after: "same" }))).toContain(revisionReviewCopy.noChange);
  });

  it("one verdict pair per item fits the child's choice; Xong waits for every verdict; round 2 only in round 1", () => {
    const html = renderToStaticMarkup(createElement(RevisionReview, { view: view(), map: null }));
    expect(html).toContain(revisionReviewCopy.title(1));
    expect(html).toContain('data-testid="verdict-1-improved"');
    expect(html).toContain('data-testid="verdict-1-not_yet"');
    expect(html).not.toContain('data-testid="verdict-1-reason_ok"');
    expect(html).toContain('data-testid="verdict-2-reason_ok"');
    expect(html).toContain(revisionReviewCopy.childChose("kept"));
    expect(html).toContain(revisionReviewCopy.noReason);
    expect(html).toMatch(/<button(?=[^>]*data-testid="revision-finish")(?=[^>]*disabled)[^>]*>/); // any attribute order
    expect(html).toContain(revisionReviewCopy.needVerdicts(2));
    expect(html).toContain('data-testid="revision-round2-open"');
    expect(renderToStaticMarkup(createElement(RevisionReview, { view: view({ round: 2, canOpenRound2: false }), map: null }))).not.toContain('data-testid="revision-round2-open"');
  });

  it("read-only (parent viewer, or after Xong): the verdicts and the closing note, no buttons", () => {
    const done = view({ canFinish: false, canOpenRound2: false, checks: [{ n: 1, verdict: "improved", checkerName: "Thầy/cô", createdAt: "2026-10-22T05:00:00Z" }, { n: 2, verdict: "not_yet", checkerName: null, createdAt: "2026-10-22T05:00:00Z" }],
      closing: { note: "Bài sửa rõ hơn nhiều!", authorName: null, createdAt: "2026-10-22T05:00:00Z" } });
    const html = renderToStaticMarkup(createElement(RevisionReview, { view: done, map: null }));
    expect(html).toContain('data-testid="revision-done"');
    expect(html).toContain(revisionReviewCopy.verdicts.improved!);
    expect(html).toContain("Bài sửa rõ hơn nhiều!");
    expect(html).not.toContain('data-testid="revision-finish"');
    expect(renderToStaticMarkup(createElement(RevisionReview, { view: view(), map: null, readOnly: true }))).not.toContain('data-testid="revision-finish"');
  });

  it("'Bài đã sửa': one row per pair with round, items, state and the verdict summary with its denominator; an empty list says so", () => {
    const html = renderToStaticMarkup(createElement(RevisionList, { learnerId: "l", items: [
      { attemptId: "r", episodeId: "e", titleVi: "Núi lửa", round: 1, submittedAt: "2026-10-22T03:00:00Z", itemsCount: 2, state: "done", good: 1, notYet: 1 },
    ] }));
    expect(html).toContain('href="/learners/l/revisions/r"');
    expect(html).toContain(revisionReviewCopy.listLine(1, 2));
    expect(html).toContain(revisionReviewCopy.verdictSummary(1, 2));
    expect(renderToStaticMarkup(createElement(RevisionList, { learnerId: "l", items: [] }))).toContain('data-testid="revisions-empty"');
  });

  it("scoring on a revision is optional: no 'còn n kỹ năng' counter", () => {
    const t = { key: "A-A3-REDRAFT", isTarget: true, scorable: true, lockedReason: null, titleVi: "Viết lại bài theo ưu tiên phản hồi", dimensionNameVi: null, rubricVi: null,
      criteria: [], opportunityRule: null, decisions: [], current: null, label: "Sửa bài" };
    const html = renderToStaticMarkup(createElement(ScoringPanel, { episodeId: "e", alias: "An", viewerRole: "tutor", canDecide: true, observedDirectly: false, targets: [t, { ...t, key: "A-L3-CAUSE-W" }], optional: true }));
    expect(html).toContain(reviewPage.save);
    expect(html).not.toContain(reviewPage.saveRemaining(2));
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/revisionUi.test.ts` → FAIL.

- [ ] **Step 3: Create `components/revision/DiffView.tsx`**

```tsx
import { revisionReviewCopy } from "@/lib/copy/vi";
import { changeCount, diffWords } from "@/lib/revision/diff";

/**
 * Before and after (spec §2 step 5): two columns on a wide screen, one under the other on a phone. Removed words are struck through in the
 * old text, added words are underlined and tinted in the new one, each with a word for screen readers (never colour alone).
 */
export function DiffView({ before, after }: { before: string; after: string }) {
  const tokens = diffWords(before, after);
  const { added, removed } = changeCount(tokens);
  return (
    <section className="flex flex-col gap-2" data-testid="diff-view">
      <p className="text-sm text-muted">{added + removed === 0 ? revisionReviewCopy.noChange : revisionReviewCopy.changeLine(added, removed)}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-white p-3" data-testid="diff-before">
          <h4 className="mb-1 text-sm font-semibold text-muted">{revisionReviewCopy.before}</h4>
          <p lang="en" className="whitespace-pre-wrap leading-relaxed">
            {tokens.filter((t) => t.op !== "add").map((t, i) =>
              t.op === "del" ? (
                <del key={i} className="rounded bg-[#FBE3E0] text-[#7A1F14] line-through">
                  <span className="sr-only">{revisionReviewCopy.deletedLabel} </span>
                  {t.text}
                </del>
              ) : (
                <span key={i}>{t.text}</span>
              ),
            )}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white p-3" data-testid="diff-after">
          <h4 className="mb-1 text-sm font-semibold text-muted">{revisionReviewCopy.after}</h4>
          <p lang="en" className="whitespace-pre-wrap leading-relaxed">
            {tokens.filter((t) => t.op !== "del").map((t, i) =>
              t.op === "add" ? (
                <ins key={i} className="rounded bg-[#DDEFE3] text-[#14502E] underline decoration-2 underline-offset-2">
                  <span className="sr-only">{revisionReviewCopy.addedLabel} </span>
                  {t.text}
                </ins>
              ) : (
                <span key={i}>{t.text}</span>
              ),
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create `components/revision/RevisionReview.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { feedbackCopy, revisionReviewCopy } from "@/lib/copy/vi";
import { formatWhen } from "@/lib/review/format";
import { revisionFailText } from "@/lib/revision/client";
import { checkFeedback, missingVerdicts } from "@/lib/revision/rules";
import { hasScoreWords } from "@/lib/revision/scoreWords";
import { CLOSING_MAX, verdictsFor, type RevisionView, type Verdict } from "@/lib/revision/types";
import type { SkillMapView } from "@/lib/skillmap/types";
import { postJson } from "@/lib/tutorwork/client";
import { DiffView } from "./DiffView";
import { emptyItem, FeedbackFields, feedbackPayloadItems, type FeedbackDraft } from "./FeedbackFields";
import { FeedbackItemsList } from "./FeedbackPanel";

/**
 * "Bài sửa lại (vòng n)" (spec §2 step 5): before–after with the word diff, the feedback, per item the child's choice and reason and a
 * REQUIRED verdict (two buttons that fit the choice), an optional closing note, then "Xong" or (round 1 only) "Mở vòng 2 với góp ý mới".
 * Verdicts and the action are saved in one call (D11). readOnly = the parent's / tutor's viewer under "Bài đã sửa".
 */
export function RevisionReview({ view, map, readOnly = false }: { view: RevisionView; map: SkillMapView | null; readOnly?: boolean }) {
  const router = useRouter();
  const canAct = view.canFinish && !readOnly;
  const [verdicts, setVerdicts] = useState<Record<number, Verdict | undefined>>({});
  const [closing, setClosing] = useState("");
  const [round2, setRound2] = useState<FeedbackDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());
  const left = missingVerdicts(view.feedback.items, verdicts);
  const markOf = (n: number) => view.marks.find((m) => m.n === n);
  const checkOf = (n: number) => view.checks.find((c) => c.n === n);

  async function finish(action: "close" | "round2") {
    if (left > 0) return setProblem(feedbackCopy.errors.checks_incomplete ?? null);
    if (action === "close" && hasScoreWords(closing)) return setProblem(feedbackCopy.errors.score_words ?? null);
    if (action === "round2") {
      const p = round2 ? checkFeedback(round2.praise, round2.items, view.after.text) : "praise_required";
      if (p) return setProblem(feedbackCopy.errors[p] ?? null);
    }
    setBusy(true);
    setProblem(null);
    const checks = view.feedback.items.map((it) => ({ n: it.n, verdict: verdicts[it.n] as Verdict }));
    const r = await postJson(
      `/api/review/attempts/${view.attemptId}/revision-finish`,
      action === "close"
        ? { action, client_id: clientId.current, checks, ...(closing.trim() ? { closing_note: closing.trim() } : {}) }
        : { action, client_id: clientId.current, checks, praise: round2!.praise.trim(), items: feedbackPayloadItems(round2!.items) },
    );
    setBusy(false);
    if (!r.ok) {
      if (r.status === 409) clientId.current = crypto.randomUUID();
      return setProblem(revisionFailText(r));
    }
    router.refresh();
  }

  return (
    <section aria-labelledby="revision-title" className="flex flex-col gap-4 rounded-xl border border-line bg-white p-4" data-testid="revision-review">
      <h3 id="revision-title" className="text-base font-bold">
        {revisionReviewCopy.title(view.round)}
      </h3>
      <p className="text-sm text-muted">{revisionReviewCopy.intro}</p>
      <DiffView before={view.before.text} after={view.after.text} />

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">{revisionReviewCopy.feedbackTitle}</h4>
        <p className="rounded-lg bg-[#E3ECE8] px-3 py-2 text-sm text-[#1F4439]">{view.feedback.praise}</p>
      </div>

      <ol className="flex flex-col gap-3">
        {view.feedback.items.map((it) => {
          const mark = markOf(it.n);
          const done = checkOf(it.n);
          return (
            <li key={it.n} className="flex flex-col gap-2 rounded-lg border border-line p-3" data-testid={`revision-check-${it.n}`}>
              <FeedbackItemsList items={[it]} map={map} />
              {mark ? (
                <p className="text-sm">
                  <b>{revisionReviewCopy.childChose(mark.choice)}</b>
                  {" · "}
                  {mark.reason ? (
                    <>
                      {revisionReviewCopy.childReason}: <span lang="en">{mark.reason}</span>
                    </>
                  ) : (
                    revisionReviewCopy.noReason
                  )}
                </p>
              ) : null}
              {done ? (
                <p className="text-sm font-semibold">
                  {revisionReviewCopy.verdictLegend}: {revisionReviewCopy.verdicts[done.verdict]}
                </p>
              ) : canAct && mark ? (
                <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
                  <legend className="mb-1 text-sm text-muted">{revisionReviewCopy.verdictLegend}</legend>
                  {verdictsFor(mark.choice).map((v) => (
                    <button key={v} type="button" aria-pressed={verdicts[it.n] === v} onClick={() => { setVerdicts((s) => ({ ...s, [it.n]: v })); setProblem(null); }}
                      data-testid={`verdict-${it.n}-${v}`}
                      className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${verdicts[it.n] === v ? "border-accent bg-accent text-white" : "border-line bg-white"}`}>
                      {revisionReviewCopy.verdicts[v]}
                    </button>
                  ))}
                </fieldset>
              ) : null}
            </li>
          );
        })}
      </ol>

      {view.closing || view.nextRound ? (
        <div className="flex flex-col gap-1 rounded-lg bg-paper px-3 py-2 text-sm" data-testid="revision-done">
          {view.closing ? (
            <>
              <p className="font-semibold">{revisionReviewCopy.done(formatWhen(view.closing.createdAt))}</p>
              {view.closing.note ? (
                <p>
                  {revisionReviewCopy.closingShown}: {view.closing.note}
                </p>
              ) : null}
            </>
          ) : view.nextRound ? (
            <p className="font-semibold">{revisionReviewCopy.round2Opened(formatWhen(view.nextRound.createdAt))}</p>
          ) : null}
        </div>
      ) : null}

      {canAct ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{revisionReviewCopy.scoringNote}</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{revisionReviewCopy.closingLabel}</span>
            <span className="text-muted">{revisionReviewCopy.closingHint}</span>
            <textarea rows={2} maxLength={CLOSING_MAX} value={closing} onChange={(e) => { setClosing(e.target.value); setProblem(null); }}
              data-testid="revision-closing" className="min-h-11 rounded-lg border border-line bg-white px-3 py-2" />
          </label>
          {round2 ? (
            <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <h4 className="text-sm font-semibold">{revisionReviewCopy.round2Title}</h4>
              <FeedbackFields value={round2} onChange={(v) => { setRound2(v); setProblem(null); }} map={map} testIdPrefix="round2" />
            </div>
          ) : null}
          {problem ? (
            <p role="alert" data-testid="revision-review-problem" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {round2 ? (
              <button type="button" disabled={busy || left > 0} onClick={() => finish("round2")} data-testid="revision-round2-send"
                className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:bg-[#C9CEC5] disabled:text-[#3F4541]">
                {busy ? revisionReviewCopy.saving : revisionReviewCopy.sendRound2}
              </button>
            ) : (
              <button type="button" disabled={busy || left > 0} onClick={() => finish("close")} data-testid="revision-finish"
                className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:bg-[#C9CEC5] disabled:text-[#3F4541]">
                {busy ? revisionReviewCopy.saving : revisionReviewCopy.finish}
              </button>
            )}
            {view.canOpenRound2 && !round2 ? (
              <button type="button" onClick={() => setRound2({ praise: "", items: [emptyItem()] })} data-testid="revision-round2-open"
                className="min-h-12 rounded-xl border border-line bg-white px-5 text-base font-semibold">
                {revisionReviewCopy.openRound2}
              </button>
            ) : null}
            {left > 0 ? <span className="text-sm text-muted">{revisionReviewCopy.needVerdicts(left)}</span> : null}
          </div>
        </div>
      ) : !view.closing && !view.nextRound && !readOnly ? (
        <p className="text-sm text-muted">{revisionReviewCopy.readOnly}</p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Create `components/revision/RevisionList.tsx`**

```tsx
import Link from "next/link";
import { revisionReviewCopy } from "@/lib/copy/vi";
import { formatWhen } from "@/lib/review/format";
import type { RevisionListItem } from "@/lib/revision/types";

/** "Bài đã sửa" of one child (parent, tutor): one row per before–after pair, newest first; opens the read-only viewer. */
export function RevisionList({ learnerId, items }: { learnerId: string; items: RevisionListItem[] }) {
  if (items.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="revisions-empty">
        {revisionReviewCopy.listEmpty}
      </p>
    );
  }
  return (
    <ul className="mt-6 flex flex-col gap-3" data-testid="revisions-list">
      {items.map((i) => (
        <li key={i.attemptId} data-testid={`revision-pair-${i.attemptId}`}>
          <Link href={`/learners/${learnerId}/revisions/${i.attemptId}`} className="flex flex-col gap-1 rounded-xl border border-line bg-white px-5 py-4 text-ink no-underline hover:bg-paper">
            <span className="font-semibold">{i.titleVi}</span>
            <span className="text-sm text-muted">
              {revisionReviewCopy.listLine(i.round, i.itemsCount)} · {formatWhen(i.submittedAt)} · {i.state === "done" ? revisionReviewCopy.stateDone : revisionReviewCopy.stateWaiting}
            </span>
            {i.state === "done" ? <span className="text-sm">{revisionReviewCopy.verdictSummary(i.good, i.itemsCount)}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: `components/review/ScoringPanel.tsx` — optional mode.** Make exact replacements:
  1. In the props destructuring, replace `  targets,\n}: {` with `  targets,\n  optional = false,\n}: {`; in the props type, after `  targets: PanelTarget[];` add `  /** S6: on a revision every skill is optional - the reviewer saves the skills she chose (none is required). */\n  optional?: boolean;`.
  2. After `  const remaining = open.filter((t) => choices[t.key] === undefined).length;` add `  const chosen = open.filter((t) => choices[t.key] !== undefined);`.
  3. Replace `  const canSave = canDecide && open.length > 0 && remaining === 0 && !busy;` with `  const canSave = canDecide && open.length > 0 && (optional ? chosen.length > 0 : remaining === 0) && !busy;`.
  4. Replace `      const items = open.map((t) => {` with `      const items = (optional ? chosen : open).map((t) => {`.
  5. Replace `{busy ? reviewPage.saving : remaining > 0 ? reviewPage.saveRemaining(remaining) : reviewPage.save}` with `{busy ? reviewPage.saving : remaining > 0 && !optional ? reviewPage.saveRemaining(remaining) : reviewPage.save}`.

- [ ] **Step 7: The review page** — `app/review/[episodeId]/page.tsx`:
  - imports: `import { RevisionReview } from "@/components/revision/RevisionReview";`, add `loadRevisionView` to the `@/lib/revision/load` import, and add `revisionReviewCopy` to the copy import;
  - after the `const map = …` line (Task 7) add:

```tsx
  const revision = view.attempt.mode === "REVISION" ? await loadRevisionView(view.attempt.id, member.id).catch(() => null) : null;
```

  - in the chips array, after `...(view.episode.isFirstAttempt ? [reviewPage.firstAttemptTag] : []),` add `...(view.episode.facets.revision === true ? [revisionReviewCopy.supportedTag] : []),`;
  - replace `            <WorkPanel view={view} />` with `            {revision ? <RevisionReview view={revision} map={map} /> : <WorkPanel view={view} />}`;
  - in `<ScoringPanel … targets={targets}` add the prop `optional={view.episode.facets.revision === true}`.

- [ ] **Step 8: The inbox chip** — `app/review/page.tsx`: add `revisionReviewCopy` to the copy import, and replace

```tsx
                  {i.titleVi} · {activityLabels[i.activityType] ?? fallbackLabels.activity}
```

with

```tsx
                  {i.titleVi} · {activityLabels[i.activityType] ?? fallbackLabels.activity}
                  {i.revisionRound ? (
                    <span className="ml-2 rounded-full bg-[#FBF1DC] px-2 py-0.5 text-xs text-[#6B4600]" data-testid="inbox-revision">
                      {revisionReviewCopy.inboxLabel(i.revisionRound)}
                    </span>
                  ) : null}
```

- [ ] **Step 9: The two learner pages**

```tsx
// app/learners/[id]/revisions/page.tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { RevisionList } from "@/components/revision/RevisionList";
import { learnerWithTrack, revisionReviewCopy } from "@/lib/copy/vi";
import { loadRevisionList } from "@/lib/revision/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Bài đã sửa" of one child (spec §4, 3-c): parent and tutor read every before–after pair; students and outsiders get 404. */
export default async function RevisionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  const items = await loadRevisionList(learner.id);
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-4xl px-4 py-10" data-testid="revisions-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {revisionReviewCopy.backHome}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{revisionReviewCopy.listTitle(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{revisionReviewCopy.listIntro}</p>
        <RevisionList learnerId={learner.id} items={items} />
      </main>
    </>
  );
}
```

```tsx
// app/learners/[id]/revisions/[attemptId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { RevisionReview } from "@/components/revision/RevisionReview";
import { learnerWithTrack, revisionReviewCopy } from "@/lib/copy/vi";
import { loadRevisionView } from "@/lib/revision/load";
import { loadPickerMap } from "@/lib/skillmap/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";
import { UUID_RE } from "@/lib/work/schemas";

export const dynamic = "force-dynamic";

/** One before–after pair, read-only (spec 3-c). The pair must belong to this child, else 404. */
export default async function RevisionPairPage({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const { id, attemptId } = await params;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  if (!UUID_RE.test(attemptId)) notFound();
  const view = await loadRevisionView(attemptId, member.id);
  if (!view || view.learnerId !== learner.id) notFound();
  const map = await loadPickerMap(learner.id).catch(() => null);
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-5xl px-4 py-10" data-testid="revision-pair-page">
        <Link href={`/learners/${learner.id}/revisions`} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {revisionReviewCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{view.titleVi}</h1>
        <p className="mt-1 text-sm text-muted">
          {learnerWithTrack(learner.alias, learner.trackId)} · {revisionReviewCopy.viewerNote}{" "}
          <Link href={`/review/${view.episodeId}`} className="text-accent underline">
            {revisionReviewCopy.openReview}
          </Link>
        </p>
        <div className="mt-6">
          <RevisionReview view={view} map={map} readOnly />
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 10: The learner card link** — `components/LearnerCard.tsx`: add `revisionReviewCopy` to the copy import, and right after the `</Link>` that closes the `levels-link-${learner.id}` link add:

```tsx
        <Link href={`/learners/${learner.id}/revisions`} data-testid={`revisions-link-${learner.id}`} className={linkClass}>
          {revisionReviewCopy.link}
        </Link>
```

- [ ] **Step 11: Run** — `npx vitest run tests/unit/revisionUi.test.ts tests/unit/reviewUi.test.ts tests/unit/lightOnly.test.ts tests/unit/copyNoProvider.test.ts && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 12: Commit**

```bash
git add components/revision/DiffView.tsx components/revision/RevisionReview.tsx components/revision/RevisionList.tsx components/review/ScoringPanel.tsx app/review app/learners/[id]/revisions components/LearnerCard.tsx tests/unit/revisionUi.test.ts
git commit -m "feat(s6): 'Bài sửa lại' before-after with word diff, required verdicts, Xong / Mở vòng 2, optional scoring; 'Bài đã sửa' list and viewer"
```

---

### Task 10: End-to-end additions to the existing specs (no new e2e file)

**Files:**
- Modify: `tests/e2e/review.spec.ts`, `tests/e2e/student-no-scores.spec.ts`

**Interfaces:**
- Consumes: the dev seed (An (thử) with A-W4-PLANETS released up to step 8, tutorAn, tutorNguyen, parent, studentAn); every `data-testid` of Tasks 7–9; `feedbackCopy`, `revisionCopy`, `revisionReviewCopy`; the routes of Task 6.
- Produces: one new serial group "S6 feedback and revision" in `review.spec.ts` (7 tests), and one more check in the student no-score test. The group writes FRESH work each run (A-W4 step 7 is a practice step), so it can run again on the same database. It never touches A-W1 or the seeded A-W4 attempt that the S5 tests use.

- [ ] **Step 1: `tests/e2e/review.spec.ts`** — add `feedbackCopy, revisionCopy, revisionReviewCopy, work` to the import from `@/lib/copy/vi`, then append at the end of the file:

```ts
// S6: feedback → revision → before–after → "đã xem" → "Bài đã sửa". Fresh work on A-W4 step 7 (practice, repeatable) every run.
test.describe.serial("S6 feedback and revision", () => {
  const PLANETS = "Sao Kim";
  const TEXT = "Venus is hotter than Mars because it has a thick atmosphere. Mars is cold because its air is thin.";
  let workAttempt = "";
  let revisionActivity = "";
  let revisionAttempt = "";

  /** The inbox episode of one attempt (the inbox pages through the database; oldest first). */
  async function episodeOfAttempt(page: Page, attemptId: string): Promise<string> {
    let after = "";
    for (let i = 0; i < 20; i++) {
      const res = await page.request.get(`/api/review/inbox?filter=todo&limit=100${after}`);
      expect(res.status()).toBe(200);
      const data = (await res.json()) as { items: { episodeId: string; attemptId: string }[]; next: { at: string; id: string } | null };
      const hit = data.items.find((x) => x.attemptId === attemptId);
      if (hit) return hit.episodeId;
      if (!data.next) break;
      after = `&after_at=${encodeURIComponent(data.next.at)}&after_id=${data.next.id}`;
    }
    throw new Error(`no inbox item for attempt ${attemptId}`);
  }

  test("An writes a new practice paragraph in the app (A-W4 step 7)", async ({ page }) => {
    await loginAs(page, "studentAn");
    const home = (await (await page.request.get("/api/student/home")).json()) as { inquiries: { titleVi: string; steps: { activityId: string; stepNo: number }[] }[] };
    const step7 = home.inquiries.find((q) => q.titleVi.includes(PLANETS))?.steps.find((s) => s.stepNo === 7);
    expect(step7, "A-W4-PLANETS step 7").toBeTruthy();
    const res = await page.request.post("/api/attempts", {
      data: { activity_id: step7!.activityId, client_submission_id: randomUUID(), content: { text: TEXT }, assistance: ["none"], provenance: "in_app" },
    });
    expect(res.status(), await res.text()).toBe(201);
    workAttempt = ((await res.json()) as { receipt: { attemptId: string } }).receipt.attemptId;
  });

  test("An's tutor: a score in the praise is refused; praise + one item with an excerpt is sent; 'Sửa góp ý' works before An starts", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.goto(`/review/${await episodeOfAttempt(page, workAttempt)}`);
    const panel = page.getByTestId("feedback-panel");
    await panel.getByTestId("feedback-praise").fill("Bài được 3/4");
    await panel.getByTestId("feedback-item-1-text").fill("Thêm một câu kết cho đoạn văn.");
    await panel.getByTestId("feedback-send").click();
    await expect(panel.getByTestId("feedback-problem")).toHaveText(feedbackCopy.errors.score_words!);
    await panel.getByTestId("feedback-praise").fill("Con so sánh rõ Sao Kim và Sao Hỏa.");
    await panel.getByTestId("feedback-item-1-excerpt").fill("its air is thin");
    await expect(panel.getByTestId("feedback-require")).toBeChecked();
    const [sent] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/review/attempts/${workAttempt}/feedback`) && r.request().method() === "POST"),
      panel.getByTestId("feedback-send").click(),
    ]);
    expect(sent.status(), await sent.text()).toBe(201);
    revisionActivity = ((await sent.json()) as { revision_activity_id: string }).revision_activity_id;
    await expect(panel.getByTestId("feedback-live")).toContainText("Con so sánh rõ Sao Kim và Sao Hỏa.");

    await panel.getByTestId("feedback-edit").click();
    await panel.getByTestId("feedback-item-1-text").fill("Thêm một câu kết nói hành tinh nào nóng hơn.");
    await panel.getByTestId("feedback-send").click();
    await expect(panel.getByTestId("feedback-live")).toContainText("Thêm một câu kết nói hành tinh nào nóng hơn.");
    await expect(panel.getByTestId("feedback-history")).toBeVisible();
    // the server refuses a score before the database
    const bad = await page.request.post(`/api/review/attempts/${workAttempt}/feedback`, {
      data: { client_id: randomUUID(), praise: "Được 80%", items: [{ text: "x" }], requires_revision: false },
    });
    expect(bad.status()).toBe(400);
  });

  test("Nguyên's tutor cannot give feedback on An's work (404)", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    const res = await page.request.post(`/api/review/attempts/${workAttempt}/feedback`, {
      data: { client_id: randomUUID(), praise: "Tốt", items: [{ text: "x" }], requires_revision: true },
    });
    expect(res.status()).toBe(404);
  });

  test("An: 'Sửa bài' sits above Việc tiếp theo; the page shows praise and the marked excerpt; An revises, marks the item, gets a receipt - no score", async ({ page }) => {
    await loginAs(page, "studentAn");
    const row = page.getByTestId(`revision-row-${revisionActivity}`);
    await expect(row).toContainText(revisionCopy.rowTitle(""));
    const rowsBox = await page.getByTestId("revision-rows").boundingBox();
    const nextBox = await page.locator('[data-testid="next-task"], [data-testid="no-next-task"]').first().boundingBox();
    expect(rowsBox!.y).toBeLessThan(nextBox!.y);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/activities/${revisionActivity}$`));
    await expect(page.getByTestId("revision-praise")).toContainText("Con so sánh rõ Sao Kim và Sao Hỏa.");
    await page.getByText(revisionCopy.showOld).click();
    await expect(page.getByTestId("excerpt-1")).toHaveText(/its air is thin/);
    const editor = page.getByTestId("revision-editor");
    await expect(editor).toHaveValue(TEXT);
    await editor.fill(`${TEXT} So Venus is the hottest planet.`);
    await page.getByTestId("revision-mark-1-changed").check();
    await page.getByLabel(revisionCopy.reasonLabel(false)).first().fill("Mình thêm câu kết.");
    await page.getByLabel(work.help.none).check(); // same help declaration as S4
    const [sent] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/student/revisions/${revisionActivity}`) && r.request().method() === "POST"),
      page.getByTestId("revision-submit").click(),
    ]);
    expect(sent.status(), await sent.text()).toBe(201);
    revisionAttempt = ((await sent.json()) as { receipt: { attemptId: string } }).receipt.attemptId;
    await expect(page.getByTestId("revision-receipt")).toContainText(revisionCopy.receiptTitle);
    expect(await page.locator("body").innerText()).not.toMatch(SCORE_PATTERN);
  });

  test("An's tutor: 'Bài sửa lại (vòng 1)' shows before-after, Xong waits for the verdict, then closes with a note", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.goto(`/review/${await episodeOfAttempt(page, revisionAttempt)}`);
    const r = page.getByTestId("revision-review");
    await expect(r).toContainText(revisionReviewCopy.title(1));
    await expect(page.getByText(revisionReviewCopy.supportedTag)).toBeVisible();
    await expect(r.getByTestId("diff-after").locator("ins")).not.toHaveCount(0);
    await expect(r.getByTestId("revision-finish")).toBeDisabled();
    await r.getByTestId("verdict-1-improved").click();
    await r.getByTestId("revision-closing").fill("Câu kết rất rõ!");
    await r.getByTestId("revision-finish").click();
    await expect(r.getByTestId("revision-done")).toContainText("Câu kết rất rõ!");
  });

  test("An sees 'Thầy/cô đã xem bài sửa của bạn' with the note - still no score", async ({ page }) => {
    await loginAs(page, "studentAn");
    const box = page.getByTestId("feedback-box");
    await expect(box).toContainText(revisionCopy.seenTitle);
    await expect(box).toContainText("Câu kết rất rõ!");
    expect(await page.locator("body").innerText()).not.toMatch(SCORE_PATTERN);
  });

  test("the parent reads the pair under 'Bài đã sửa' (no buttons); the child cannot open that page", async ({ page, browser }) => {
    await loginAs(page, "parent");
    await page.getByTestId(`revisions-link-${LEARNER_IDS.an}`).click();
    const pair = page.getByTestId(`revision-pair-${revisionAttempt}`);
    await expect(pair).toContainText(revisionReviewCopy.stateDone);
    await pair.getByRole("link").click();
    await expect(page.getByTestId("revision-review")).toBeVisible();
    await expect(page.getByTestId("revision-finish")).toHaveCount(0);
    const kid = await browser.newPage();
    await loginAs(kid, "studentAn");
    await notFound(kid, `/learners/${LEARNER_IDS.an}/revisions`);
    await kid.close();
  });
});
```

- [ ] **Step 2: `tests/e2e/student-no-scores.spec.ts`** — inside the loop test, after the SM-2 assertions, add:

```ts
    // S6: the child's revision pages carry no score, verdict or skill code either.
    const fb = await page.request.get("/api/student/feedback");
    if (fb.status() === 200) {
      const { items } = (await fb.json()) as { items: { activityId: string; state: string }[] };
      for (const it of items.filter((i) => i.state !== "note").slice(0, 3)) {
        await page.goto(`/activities/${it.activityId}`);
        expect(await page.locator("body").innerText()).not.toMatch(SCORE_PATTERN);
        expect(await page.content()).not.toMatch(/"verdict"|improved|not_yet|reason_ok|ref_key/);
      }
    }
```

- [ ] **Step 3: List** — `npx playwright test tests/e2e/review.spec.ts tests/e2e/student-no-scores.spec.ts --list` → the previous count + 7. They run for real in CI (job "E2E smoke", with migrations 0001–0021 applied to the local Supabase).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/review.spec.ts tests/e2e/student-no-scores.spec.ts
git commit -m "test(s6): e2e - feedback with a refused score, edit, revision with marks, before-after Xong, 'đã xem', 'Bài đã sửa', no score for the child"
```

---

### Task 11: Docs, full checks, review, PR

**Files:**
- Modify: `docs/PROGRESS.md` (new section at the end), `CLAUDE.md` (Current status + next migration number), `docs/DESIGN.md` (new §19.9), `docs/UX_COPY_GUIDE.md` (§3.3 rows, §5 messages)

- [ ] **Step 1: `docs/PROGRESS.md`** — append:

```markdown
## S6 — Góp ý cho con + Sửa bài (trước–sau) (22/10/2026)

Nhánh `feature/s6-feedback-revision` (dựa trên `feature/sm2-level-profile`). Thiết kế `docs/superpowers/specs/2026-10-22-s6-feedback-revision-design.md` (duyệt từng phần 22/10); kế hoạch `docs/superpowers/plans/2026-10-22-s6-feedback-revision.md`; 3 mockup (thầy/cô góp ý · con sửa bài · trước–sau) phụ huynh duyệt trước khi làm giao diện. Không AI.

### Đã thay đổi gì (nói đơn giản)

| Việc | Vì sao | Nằm ở |
|---|---|---|
| **Góp ý cho con** ở màn duyệt bài viết: 1 câu khen (bắt buộc) + 1–3 góp ý (trích đoạn trong bài, gắn kỹ năng — tùy chọn), "Yêu cầu con sửa bài" hoặc "Chỉ góp ý". Câu có dạng điểm ("3/4", "điểm", "%") bị từ chối. **Sửa góp ý** được cho tới khi con bắt đầu sửa | Q1, 1-a, 1-b, 1-c | Hộp duyệt → mở một bài viết |
| **Bước sửa**: dùng bước "Sửa bài" của chủ đề nếu là bước sửa kế tiếp, không thì app thêm bước sửa riêng ("Bước sửa bài") | PA | `0021` |
| **Con sửa bài**: dòng "Sửa bài: … · n góp ý của thầy/cô" nằm trên Việc tiếp theo; màn sửa có câu khen, góp ý đánh số, chỗ cần sửa được tô trong bài cũ, ô viết đã điền bài cũ (tự lưu), "Xem bài cũ", mỗi góp ý chọn **Đã sửa / Giữ nguyên** (Track B bắt buộc 1 câu lý do — cài đặt theo track) | Q2, Q3 | trang chủ và màn sửa của con |
| **Bài sửa lại (vòng n)** trong Hộp duyệt: bài cũ – bài sửa cạnh nhau (chữ bỏ gạch, chữ thêm tô), đánh giá **bắt buộc** từng góp ý, điểm "Sửa bài" và điểm kỹ năng ngôn ngữ **tùy chọn** (luôn ghi là "có góp ý"), nhận xét kết, **Xong** hoặc **Mở vòng 2** (tối đa 2 vòng) | 2-a, 3-a, 3-b | Hộp duyệt |
| Con thấy **"Thầy/cô đã xem bài sửa của bạn"** + nhận xét kết; **không bao giờ thấy điểm** hay đánh giá | 2-c | trang chủ của con |
| **Bài đã sửa** trên thẻ của mỗi con: danh sách cặp trước–sau, mở ra xem (chỉ xem) | 3-c | `/learners/…/revisions` |

Bài sửa **không bao giờ** là "lần đầu" và luôn nối với bài gốc (cơ sở dữ liệu ép). Xóa dữ liệu một em xóa luôn 3 sổ mới.

### SQL cần áp

- **`db/migrations/0021_feedback_revision.sql`** — Actions → **Apply database migrations** (gõ APPLY) hoặc dán vào SQL Editor. **Áp `0021` TRƯỚC khi thử preview hoặc gộp PR**; cần `0019` + `0020` đã áp. Chỉ thêm: 1 cột (`attempts.revises_attempt_id`), 1 bảng cài đặt theo track, 3 sổ mới, các hàm mới, bản mới của 3 hàm Hộp duyệt (giữ nguyên luật cũ cho bài thường) và của hàm xóa dữ liệu một em (giữ nguyên mọi dòng cũ). Chạy lại an toàn. Nên bấm chạy tay *Weekly backup* trước khi áp. Chưa áp thì khung "Góp ý cho con" và các dòng "Sửa bài" chỉ không hiện; phần còn lại vẫn chạy.

### Cách thử trên preview (gia đình thử)

1. `thu-an` (em) → mở bài viết tuần 4 (Sao Kim – Sao Hỏa, bước luyện viết) → viết vài câu → Nộp.
2. `thu-giasu-an` → Hộp duyệt → mở bài vừa nộp → khung **Góp ý cho con**: gõ câu khen "Bài được 3/4" → thấy lời nhắc không ghi điểm; sửa câu khen; góp ý 1 + bôi đen một đoạn trong bài → "Lấy đoạn đang chọn" → **Gửi góp ý cho con**. Bấm **Sửa góp ý**, đổi chữ, lưu.
3. `thu-an` → trang chủ: dòng **Sửa bài** ở trên Việc tiếp theo → mở: đoạn được tô, ô viết có sẵn bài cũ → sửa, chọn **Đã sửa**, khai báo "Mình không dùng gợi ý nào" → **Nộp bài sửa**.
4. `thu-giasu-an` → Hộp duyệt: **Bài sửa lại (vòng 1)** → thấy chữ bỏ gạch / chữ thêm tô → bấm **Cải thiện thật** → (tùy chọn) chấm "Sửa bài" → nhận xét kết → **Xong**.
5. `thu-an` → trang chủ: **"Thầy/cô đã xem bài sửa của bạn"** + nhận xét; không có điểm nào.
6. Phụ huynh → thẻ An (thử) → **Bài đã sửa** → mở cặp trước–sau (chỉ xem).

### Quyết định trong kế hoạch (phụ huynh xem lại)

D1 bước "Sửa bài" của chủ đề = bước sửa đầu tiên sau bài, không có bước viết nào xen giữa · D2 bước đó mở ngay hôm nay · D3 bước sửa riêng số 1001+ · D4 điểm "Sửa bài" (A3) ghi trên bài sửa, không vào mẫu số độ phủ · D5 bài sửa luôn là "có góp ý" · D6 số lần / gia đình học tập của bài sửa · D7 vòng 2 cùng bước sửa · D8 chỉ bài viết làm trong app · D9 góp ý và chấm độc lập · D10 "Chỉ góp ý" hiện 14 ngày ở trang chủ con · D11 đánh giá + Xong/Vòng 2 lưu một lần · D12 "đã xem" hiện 14 ngày · D13 giữ khai báo trợ giúp khi nộp bài sửa · D14 bài sửa của bài kiểm tra trong buổi: chỉ gia sư · D15 Hộp duyệt: bài sửa xong khi bấm Xong / Mở vòng 2 · D16 kỹ năng gắn là lá của bản đồ · D17 trang "Bài đã sửa" · D18 không kiểm "điểm" trong trích đoạn / lý do của con · D19 bảng cài đặt theo track · D20 màn sửa nằm ở link bước cũ. Chi tiết: bảng "Decisions" trong kế hoạch.

### Hỏi phụ huynh (chưa chặn)

1. **"Ngay sau"** (G1): hiểu là "bước sửa đầu tiên sau bài, không có bước viết xen giữa" (Track A luôn có bước tự xem lại ở giữa). Đồng ý không?
2. **Chữ "điểm"** (G2): luật hiện từ chối cả "điểm mạnh", "22/10". Có muốn nới (vd. chỉ "điểm" đi cùng con số)?
3. "Bài viết giao lẻ" (G3) chưa có trong app — để Studio PR B.
4. "Chỉ góp ý" hiện ở ô "Góp ý của thầy/cô" trên trang chủ con 14 ngày (G4) — đồng ý không?

### Tiêu chí đạt

`typecheck`, `lint`, `test` (gồm test database: ma trận vai, học sinh không thấy điểm, vòng 1–2 và chặn vòng 3, thời hạn sửa góp ý, bài sửa không bao giờ là lần đầu, xóa dữ liệu), `gen:config` xanh; CI (E2E + áp migration hai lần) xanh; review Opus; phụ huynh áp `0021` rồi làm 6 bước thử ở trên; gia sư gửi được góp ý cho một bài trong ≤ 2 phút.
```

- [ ] **Step 2: `CLAUDE.md`** — two edits:
  - In "Current status", right after the "SM-2 (Hồ sơ cấp đang học)" bullet, add:

```markdown
- **S6 (Góp ý cho con + Sửa bài trước–sau) — code trên nhánh `feature/s6-feedback-revision`** (dựa trên `feature/sm2-level-profile`), chờ CI + review Opus + phụ huynh duyệt PR; **áp `0021_feedback_revision.sql` TRƯỚC khi thử preview hoặc gộp** (chỉ thêm; cần 0019 + 0020): `attempts.revises_attempt_id` (bài sửa không bao giờ là lần đầu, cùng gia đình học tập với bài gốc), `track_settings` (`revision_reason_required` A=false/B=true, `revision_target_key`), 3 sổ append-only `feedback_notes` / `revision_marks` / `revision_checks`, khung "Góp ý cho con" ở Hộp duyệt (câu khen + 1–3 góp ý, từ chối chữ có dạng điểm, "Sửa góp ý" tới khi con bắt đầu sửa), "Sửa bài" đầu Việc tiếp theo, màn sửa trên bản cũ, "Bài sửa lại (vòng n)" trước–sau (đánh giá từng góp ý, điểm A3 / ngôn ngữ tùy chọn, Xong / Mở vòng 2, tối đa 2 vòng), "Bài đã sửa". Kế hoạch `docs/superpowers/plans/2026-10-22-s6-feedback-revision.md`.
```

  - In the "Seed cấu hình sinh tự động…" bullet, replace `(số kế tiếp, **hiện là 0021** vì 0017 là S5c, 0018 là kỹ năng đọc của Studio 1 PR A, 0019 là bản đồ kỹ năng SM-1 và 0020 là hồ sơ cấp SM-2)` with `(số kế tiếp, **hiện là 0022** vì 0017 là S5c, 0018 là kỹ năng đọc của Studio 1 PR A, 0019 là bản đồ kỹ năng SM-1, 0020 là hồ sơ cấp SM-2 và 0021 là góp ý + sửa bài S6)`.

- [ ] **Step 3: `docs/DESIGN.md`** — after §19.8 add:

```markdown
### 19.9. Góp ý cho con + Sửa bài (S6, migration 0021)

- **Bài sửa:** `attempts.revises_attempt_id` → bài được góp ý. Luật trong DB: `mode = 'REVISION'`, `attempt_no > 1`, `parent_attempt_id = revises_attempt_id`, cùng em và cùng `learning_family_id` với bài đó (CHECK `attempts_revision_shape` + trigger `attempts_revision_check`); episode của mọi lần REVISION có `is_first_attempt = false` (trigger `episodes_revision_not_first`, FR-14a). `attempt_no` = lớn nhất trong gia đình / trên bước + 1 (có thể trùng số với một lần làm lại ở bước gốc — số chỉ duy nhất theo bước). Episode bài sửa: `facets.revision = true`; một dòng `assistance_events` (`tutor_prompt`, `observed`, mọi kỹ năng của cặp, `recorded_by` = người góp ý) → S7 đọc là bằng chứng có hỗ trợ; lần luyện `retry`.
- **Cài đặt theo track:** `track_settings(track_id, key, value)` — `revision_reason_required` (A false, B true), `revision_target_key` (A `A-A3-REDRAFT`, B `B-A3-REVISE`). Chỉ đọc qua hàm.
- **Sổ (chỉ thêm, RLS đọc `eng_is_staff_of`, không ai ghi trực tiếp):** `feedback_notes(source_attempt_id, root_attempt_id, round 1|2, kind feedback|closing, praise, items [{n, text, excerpt?, leaf?}], requires_revision, revision_activity_id, supersedes_id, author_member, author_role, client_id)` — sửa = dòng mới thay dòng cũ (mỗi dòng bị thay tối đa 1 lần; chỉ khi con chưa có nháp / bài sửa); `revision_marks(attempt_id, feedback_id, item_n, choice changed|kept, reason)`; `revision_checks(attempt_id, item_n, verdict improved|not_yet|reason_ok, checker_member, checker_role)`. Bảng từ chối chữ có dạng điểm trong câu khen / góp ý (`eng_has_score_words`: `\d+/\d+`, "điểm", "%"). Cả ba nằm trong `eng_purge_learner` / `eng_purge_preview`.
- **Bước sửa:** `eng_open_revision_step` — bước REVISION đầu tiên sau bài, không có bước `ACT-WRITE` xen giữa, còn trống, không bị bỏ (dời về hôm nay nếu cần); không thì bước `ACT-REVISE` riêng, `step_no` 1001+, target = `revision_target_key`, mở hôm nay. Bước REVISION chỉ làm được trong app khi `eng_revision_open(activity)` (có góp ý còn hiệu lực yêu cầu sửa, chưa có bài sửa); `eng_step_supported` của S4 giữ nguyên (đường S4 vẫn từ chối REVISION).
- **S5 mở rộng:** `eng_episode_targets` trả thêm kỹ năng của bài gốc cho bài sửa (sau kỹ năng của bước sửa) → điểm A3 và điểm ngôn ngữ đi qua `observations` / `validation_decisions` như cũ; A3 không thuộc `target_ids` của A-v1 / B-v1 nên không vào mẫu số độ phủ. `eng_review_role` dùng `eng_episode_restricted` (bài sửa của bài chỉ gia sư duyệt → chỉ gia sư). `eng_review_inbox`: bài sửa "xong" khi đã bấm Xong / Mở vòng 2; có `revision_round`.
- **Ghi (service_role sau `requireAccess`):** `eng_write_feedback(p_source_attempt, p_praise, p_items, p_requires_revision, p_supersedes, p_by, p_client_id)`; `eng_finish_revision(p_attempt, p_action close|round2, p_checks, p_closing, p_praise, p_items, p_by, p_client_id)` — đánh giá đủ mọi góp ý + Xong / vòng 2 trong một transaction; vòng 3 bị chặn. Lỗi có thẻ `(tag)` cuối câu để màn hình giải thích.
- **Đọc:** người lớn — `eng_feedback_panel(p_attempt, p_by)`, `eng_revision_view(p_attempt, p_by)`, `eng_revision_list(p_learner)` (service_role); học sinh — `eng_my_feedback()`, `eng_my_revision(p_activity)`, `eng_save_revision_draft`, `eng_submit_revision` (authenticated, theo `auth.uid()`): chỉ câu khen, góp ý, trích đoạn, bài cũ, trạng thái, nhận xét kết — không điểm, quan sát, quyết định, đánh giá, lá kỹ năng.
- **App:** `lib/revision/` (so khác theo từ, tìm trích đoạn, luật đánh dấu / đánh giá, kiểm chữ có dạng điểm — cùng mẫu với DB), màn sửa tại `/activities/[id]`, "Bài đã sửa" tại `/learners/[id]/revisions`.
```

- [ ] **Step 4: `docs/UX_COPY_GUIDE.md`**
  - §3.3: after the row `| REVISION | Sửa bài | Bài sửa lại |` add:

```markdown
| Feedback (S6) | Góp ý của thầy/cô | Góp ý cho con |
| Revision round (S6) | Sửa bài · Lần sửa thứ hai | Bài sửa lại (vòng n) |
| Revision mark (S6) | Đã sửa / Giữ nguyên | Con chọn: Đã sửa / Giữ nguyên |
| Revision verdict (S6) | (không hiện) | Cải thiện thật / Chưa / Lý do hợp lý |
| Revision seen (S6) | Thầy/cô đã xem bài sửa của bạn | Đã xem xong |
| Revision pairs (S6) | (không hiện) | Bài đã sửa |
```

  - §5: after the last row of the table add:

```markdown
| Nộp bài sửa (học sinh) | "Đã nộp bài sửa! Thầy/cô sẽ xem lại." |
| Góp ý có dạng điểm (người lớn) | "Góp ý cho con không ghi điểm (như “3/4”, chữ “điểm”, “%”). Bạn viết lại bằng lời nhé." |
```

- [ ] **Step 5: Full checks** — `npm run typecheck && npm run lint && npm test && npm run gen:config` → all green. The DB tests need local Postgres 16. `gen:config` reports nothing new, because S6 adds no versioned content.

- [ ] **Step 6: Commit docs**

```bash
git add docs/PROGRESS.md CLAUDE.md docs/DESIGN.md docs/UX_COPY_GUIDE.md
git commit -m "docs(s6): PROGRESS section, status + next migration 0022, DESIGN §19.9, UX copy rows"
```

- [ ] **Step 7: Push and CI** — `git push -u origin feature/s6-feedback-revision`, then `gh workflow run ci.yml --ref feature/s6-feedback-revision`; wait for green (E2E included).

- [ ] **Step 8: Opus review** — run the `reviewer` agent on `git diff origin/feature/sm2-level-profile...HEAD` (or `origin/main...HEAD` once SM-2 is merged); fix findings in new commits; re-run CI.

- [ ] **Step 9: Open the PR** — base `feature/sm2-level-profile` until SM-2 is merged, then retarget to `main` (spec 4-b: merge after PR #18 and #19). The body is in Vietnamese: làm gì (the PROGRESS table), cách thử trên preview (6 steps), **SQL cần phụ huynh áp: 0021 (áp TRƯỚC khi thử preview hoặc gộp; cần 0019 + 0020)**, the decisions D1–D20, the 4 questions G1–G4, and tiêu chí đạt/chưa. End it with the session's PR footer.

---

## Self-review against the spec (done while writing this plan)

| Spec item | Where |
|---|---|
| §0.1 praise + 1–3 priorities in ≤ 2 minutes, on the review screen | Task 7 (panel beside the work; "Lấy đoạn đang chọn"), Task 2 SQL, Task 10 e2e |
| §0.2 "Sửa bài" first in Việc tiếp theo; revise on the old text; mark each item; never a score | Task 8 (`RevisionRows` above the next-task card, `RevisionForm`), Task 3 (`eng_my_*` allowlists), Task 5 parsers, Task 10 e2e + `student-no-scores` |
| §0.3 old and new side by side, removed / added words marked, one click per item | Task 9 (`DiffView`, `diffWords` unit-tested in Task 5, verdict buttons) |
| §0.4 parent reads before–after under "Bài đã sửa" | Task 4 (`eng_revision_list`, `eng_revision_view`), Task 9 pages, Task 10 e2e |
| §0.5 never a first attempt; always linked to the root | Task 1 (CHECK + 2 triggers), Task 3 (`eng_submit_revision`, DB test), D6 |
| Q1 the reviewer of that work gives feedback (D15) | Task 2 (`eng_review_role` in `eng_write_feedback`, D14 for revisions), DB tests |
| Q2 revise on the old text, both versions kept | Task 3 (`old_text`, attempts + artifacts), Task 8 editor prefilled, "Xem bài cũ" |
| Q3 reason by track setting, no `if track` | Task 1 `track_settings`, Task 3 `eng_clean_revision_marks`, Task 8 `reasonLabel(revision.reasonRequired)`, DB test Track B |
| Q4 in-app writing only | Task 2 `(not_writing)`, D8 |
| PA template REVISION step or own step | Task 2 `eng_open_revision_step` (D1–D3), DB test; Spec gap G1 |
| 1-a praise required (≤ 160) / 1-b excerpt (real, ≤ 120) and leaf optional | Tasks 1–2 (table + function), Task 5 `checkFeedback`, Task 7 `LeafPicker` |
| 1-c edit until the child starts, history kept | Task 2 (`supersedes`, `eng_revision_started`), Task 4 panel `editable` + `history`, Task 7 UI, DB + e2e tests |
| 2-a max 2 rounds, then only a closing note | Task 2/4 (`max_rounds`), Task 9 (`canOpenRound2`), DB tests |
| 2-b no deadline | nothing scheduled; the step opens today (D2/D3) |
| 2-c "Thầy/cô đã xem bài sửa của bạn" + closing note, no score | Task 3 (`state seen`, `closing_note`), Task 8 `FeedbackBox` / revision page, D12 |
| 3-a required verdict per item; optional A3 score 0–4 | Task 4 `eng_finish_revision`, Task 9 `RevisionReview` + `ScoringPanel optional`, D4 (coverage denominators unchanged) |
| 3-b language scoring on the revision, auto-tagged "có góp ý", never "tự làm được" | Task 2 `eng_episode_targets`, Task 3 assistance row + `facets.revision`, Task 9 chip, D5 |
| 3-c parent views read-only | Task 9 `readOnly`, pages behind `tutorwork:read` |
| 4-a 3 mockups before code / 4-b one PR, `0021`, on SM-2 | Task 0 gate, Global Constraints, Task 11 |
| §3 tables, column, REVISION mode, marks, checks, track setting, student read functions, purge | Tasks 1–4 (`revision_activity_id` added — D3) |
| §4 screens (5 rows) | Tasks 7, 8, 9 |
| §5 out of scope (AI, speaking, deadlines, paper work, closed questions, round 3, S7 states) | nothing built; `eng_step_supported` unchanged; round 3 blocked |
| §6 risks: score words app + DB; first=false in DB; REVISION only with live feedback; no round 3; no new decision kind in the S5 chain; students read only allowlisted fields, RLS staff-only, e2e no-score extended | Tasks 1–6, 10 |
| Copy in `lib/copy/vi.ts`, `tutorHonorific`, always light, no "TOMO" | Task 5 copy + bare-word test; components use no `dark:`; `lightOnly` / `copyNoProvider` tests run in Tasks 7–9 |
| Migration rules (idempotent, expand, last line, `search_path = ''`, grants, append-only triggers, purge keeps every 0020 line) | Task 1–4 unit tests + DB "run again" test |
| Docs (PROGRESS, CLAUDE.md next 0022, DESIGN, UX guide) | Task 11 |

Placeholder scan: every code step carries its code. Two steps edit existing files by exact replacement (ScoringPanel, StudentHome, the review page, LearnerCard, inbox page, `lib/work/*`), and each names its anchor text.

Names checked across tasks: `eng_write_feedback`, `eng_finish_revision`, `eng_feedback_panel`, `eng_revision_view`, `eng_revision_list`, `eng_my_feedback`, `eng_my_revision`, `eng_save_revision_draft`, `eng_submit_revision`, `eng_revision_open`, `eng_revision_root`, `eng_episode_restricted`, `eng_has_score_words`, `hasScoreWords`, `diffWords`, `changeCount`, `findExcerpt`, `segmentsFor`, `checkFeedback`, `checkMarks`, `marksToSend`, `missingVerdicts`, `verdictsFor`, `splitFeedback`, `homeSteps`, `parseFeedbackPanel` / `parseRevisionView` / `parseRevisionList` / `parseMyFeedback` / `parseMyRevision`, `loadFeedbackPanel` / `loadRevisionView` / `loadRevisionList` / `loadRevisionPage`, `revisionFailText`, `feedbackCopy` / `revisionCopy` / `revisionReviewCopy`, `FeedbackFields` / `feedbackPayloadItems` / `emptyItem` / `FeedbackItemsList` / `findLeaf`, `InboxItem.revisionRound`.
