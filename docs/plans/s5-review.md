# S5 — Review inbox, chấm theo kỹ năng, duyệt theo vai trò, bài ngoài app, lesson note

Owner: builder (Sonnet). Plan: Opus, 14/10/2026. Review: Opus before PR.
Refs: PRD_FAMILY_EDITION D15, D16, FR-13, FR-20, §3 (measurement contract: rubric = quality only,
support separate, NULL ≠ 0) · DESIGN §6 (observations, validation_decisions, lesson_notes), §7, §8 counting
rules, §13 routes · UX_COPY_GUIDE §3.1 (score labels "3/4 · Đạt yêu cầu", NULL label), §4 rules ·
mockup Review.dc.html (/tmp/claude-0/-home-claude/ff8c28a0-38ea-504f-aa5f-fd4cb6bc3bf1/scratchpad/canvas/project/Review.dc.html) ·
S4 (attempts, episodes, attempt_auto_checks, assistance_events, instance_item_keys incl. sealed/note).

## Goal
Tutor and parent see an **inbox** of submitted work, open one, read the work beside the rubric of each
target of that step, and record a score 0–4 or "không có cơ hội thể hiện" (NULL) **per target**, with
D15 routing enforced in the database. Tutors can also record work done **outside the app** (live speaking
in the session, paper tasks from the pilot kit) so the pilot's paper steps enter the same evidence log.
Tutors write a lesson note (≤ 3 next actions) that can log which targets were practised (exposure).
Nothing is shown to the student in this slice. No engine/state computation (S7).

## Decisions (Opus)
1. **Two layers now, AI layer later:** a human score = one `observations` row (scorer `tutor`|`parent`,
   status `PROPOSED`, score 0–4 or `not_observed=true` with score NULL, criteria_results optional,
   rationale optional, blind) **plus** one `validation_decisions` row (decision `AGREE`, final_score /
   final_not_observed copied, validator_role). Changing a decision = new decision row with
   `decision='MODIFY'`, `supersedes_id`, mandatory reason (≥ 3 chars). Current decision per
   (episode, target) = latest non-superseded. Both tables append-only.
2. **D15 in the DB:** if the episode is a checkpoint (`facets.checkpoint`) or `observed_directly` →
   only a tutor with an active relationship may observe/decide; otherwise tutor or parent of the family.
   Students never. Enforced inside the security-definer function; tested.
3. **Support stays separate:** the review screen shows the declared assistance next to the work as a
   fact ("Bạn đã khai: dùng từ điển"); it never changes the score input. Reviewers may add an
   observed-support event (`assistance_events`, verification `observed`, affects chosen targets) from the
   review screen — separate action, separate row.
4. **Blind:** for checkpoint episodes `observations.blind = true` (no AI scores exist yet; the flag is
   recorded for D16 calibration later).
5. **Sealed content:** `instance_item_keys` of kind `sealed`/`note` (key ideas, model answers, tutor
   scripts) are shown on the review screen **only once the episode exists** (i.e. after the learner's
   attempt) — never on assignment/inbox pages. Closed-item auto-checks shown as "x/y câu đúng (máy chấm)"
   + per-item ✓/✗ for staff.
6. **Work outside the app** (`eng_record_offline_attempt`): staff choose a released activity of the
   learner, provenance `tutor_live` (tutor only; sets observed_directly=true; for ACT-SPEAK-LIVE and any
   step done live in the session) or `manual_import` (tutor or parent; observed_directly=false; paper
   work), content = typed/pasted text or a short note (≤ 20k chars), optional duration_sec/word_count,
   the session/paper date (≤ today, ≥ assigned date − 1). Creates attempt + artifact + episode + exposure
   with the same counting rules as S4 (attempt_no, learning family, first attempt, baseline/checkpoint
   facets). Idempotent on client id. No audio, ever.
7. **Lesson notes** (`lesson_notes`): tutor only; session_date, goals, observed, support_level
   (enum: none|light|moderate|heavy — labels from UX guide or new in its tone), next_actions (array ≤ 3),
   practised_target_ids (must belong to the learner's track) → one `exposure_log` row each with source
   `lesson`; `published` boolean; append-only with `supersedes_id` for edits. Parent reads published notes
   of own family; tutor reads own learner's; students none (S5).
8. Inbox ordering/filters: "Cần thầy/cô duyệt" (checkpoint/observed), "Bài kiểm tra tự làm",
   "Baseline", "Bài luyện", "Đã duyệt"; default = not yet decided, oldest first. Each row: learner alias,
   step label, submitted time, provenance label, how many targets decided / total. Parent sees items they
   may decide plus tutor-only items as read-only ("chờ thầy/cô").

## Steps (commit each; typecheck/lint/test + gen:config --check green)
1. `db/migrations/0010_review.sql` (seed migrations now start at 0011 — keep lock/--new consistent):
   tables observations, validation_decisions, lesson_notes; RLS staff-in-scope SELECT only; append-only +
   purge (create-or-replace from 0009's body, only add deletes, diff test); functions (security definer,
   search_path='', execute service_role only): `eng_record_review(p_episode, p_target, p_score smallint|null,
   p_not_observed bool, p_criteria jsonb, p_rationale text, p_by uuid, p_client_id text)`,
   `eng_modify_decision(p_decision, p_score, p_not_observed, p_reason, p_by, p_client_id)`,
   `eng_record_observed_support(p_attempt, p_targets text[], p_kind, p_note, p_by)`,
   `eng_record_offline_attempt(...)`, `eng_write_lesson_note(...)`. Validate: target ∈ the step's
   target_ids snapshot; score ∈ 0..4 xor not_observed; actor rules (decision 2/6/7).
   A view or function for the inbox (staff-scoped) without exposing anything to students.
2. Routes: `GET /api/review/inbox`, `GET /api/review/episodes/:id` (work, step prompt, sources titles,
   rubric per target from catalogue: success_criteria + dimension rubric_0_4_vi, auto-checks, declared +
   observed assistance, sealed/notes keys, existing decisions with history),
   `POST /api/review/episodes/:id/decisions`, `POST /api/review/decisions/:id/modify`,
   `POST /api/review/attempts/:id/support`, `POST /api/learners/:id/offline-attempts`,
   `GET|POST /api/learners/:id/lesson-notes`. requireAccess actions; 404 outside scope; students 404/403.
3. UI (staff): "Bài cần duyệt" link on staff home with count; inbox page; review page per mockup Review
   (work left/top, targets right/below with 6 score buttons labelled per UX guide §3.1 — never a bare
   number; NULL button "Bài này không có cơ hội thể hiện"; optional criteria checkboxes from
   success_criteria; rationale); decision history with "Sửa quyết định" (reason required);
   "Ghi bài làm ngoài app" on the learner's inquiry page per step; lesson-note page. All strings via vi.ts;
   skill names via existing skillNames/title_vi; codes only in collapsed "Thông tin kỹ thuật".
4. Tests — DB: D15 matrix (parent blocked on checkpoint/observed; tutor of other child blocked; expired
   tutor blocked; student blocked); score/NULL validation; target must be in step; modify needs reason and
   keeps history; current-decision resolution deterministic; offline attempts follow counting rules
   (tutor_live observed_directly; manual_import parent allowed; second offline attempt on
   INDEPENDENT_CHECK rejected like S4); lesson note ≤ 3 actions, exposure rows source 'lesson', track
   check; RLS (students read nothing new; parent reads only published notes; cross-family 0);
   append-only + purge diff. Unit: routes, zod, labels. E2E: tutor of An reviews An's submitted A-W1
   reading attempt (seed-dev should submit one practice attempt for An so the inbox has an item), scores
   2 targets incl. one NULL, sees history after modify; parent cannot decide a checkpoint item (UI
   read-only + API 403); tutor records a live speaking attempt; lesson note with 3 actions; Nguyên's tutor
   sees no An items. Students: no inbox link, URLs 404.
5. Docs: PROGRESS S5 (SQL 0010; what tutor/parent can do; D15 explained simply), CLAUDE.md status.

## Out of scope
Feedback/comments to the student and retry/revision (S6), engine states & mastery decisions (S7),
AI scoring/calibration report (S11+), report to parent (S9), speaking studio (S10).

## Stop and ask
Any change to counting rules, D15 routing, showing scores to students, or audio.
