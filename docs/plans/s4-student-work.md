# S4 (+ phần S3) — Student Home, đọc nguồn, trả lời câu hỏi, viết; nộp bài bất biến

Owner: builder (Sonnet). Plan: Opus, 14/10/2026. Review: Opus before PR.
Refs: PRD_FAMILY_EDITION FR-07 (đọc/nghe + câu hỏi, tự chấm theo đáp án), FR-10 (viết + snapshot),
FR-11 (mode + mức hỗ trợ) · DESIGN §5 (working_drafts, attempts, artifact_versions, assistance_events,
exposure_log), §6 (episodes), §8 "Quy tắc đếm", §9 (submit/idempotency/receipt), §7 RLS · UX_COPY_GUIDE
(student voice "bạn", modeLabels.student, no scores) · mockup: canvas Main/Studio (student home, task page).
Builds on S2: `eng_my_released_steps`, instance keys (staff-only), activity events.

## Goal
An (and Nguyên) log in, see **"Việc tiếp theo"** and this week's steps (only released ones), open a
reading/listening source, answer the questions, write a paragraph with autosave, declare any help used,
and submit. Each submit is an **immutable attempt** with a server-side **receipt**; resubmitting the same
`client_submission_id` returns the same receipt. Closed items are auto-checked on the server against the
instance key snapshot — results are stored for staff only; **the student sees no score, no right/wrong**
in this slice (feedback is S5/S6).

## Decisions (Opus)
1. In scope activity types for students: **ACT-SOURCE-QA** and **ACT-WRITE** (incl. pasted text with
   declaration). Other types appear on the home list with a neutral label ("Làm cùng thầy/cô trong buổi
   học" for SPEAK-LIVE; "Sắp có trên app — làm theo phiếu" for CANVAS/SPEAK-MONO/SELF-REVIEW/REVISE) and
   no submit button.
2. **Episode created at submit** (DESIGN §9) with server-computed facets, following DESIGN §8 counting
   rules exactly: `is_first_attempt = (attempt_no = 1 within the learning family) and mode <> 'REVISION'`;
   `facets.baseline = true` when step purpose has `baseline`; `facets.checkpoint` from purpose;
   `observed_directly = false` for in-app work. One attempt → at most one episode (unique). Nothing is
   scored here.
3. **Exposure log** row per target of the step at submit (`source='practice'`, or `'retry'` for attempt_no>1).
4. **Assistance**: before submit the student ticks what help they used (copy from UX guide; if absent add
   in its tone): notes, dictionary/translator, asked someone, AI outside the app, none. Each tick →
   `assistance_events(verification='declared', affects_target_keys = step targets)`. Pasted text (paste
   detected in the editor or "Tôi dán từ chỗ khác" checkbox) → provenance `pasted` + event `external_declared`.
   "Opening the listening transcript" is out of scope (no student transcript path in this slice).
5. **Drafts**: `working_drafts` is the only mutable learner table (DESIGN §5); autosave every ~5 s and on
   blur; "Đã tự lưu lúc HH:MM". Two-tab overwrite → warning only (PRD FR-10).
6. **Student reading path**: add `eng_my_step_sources(p_activity uuid)` (security definer, search_path='',
   own released step only) returning title/author/rights/modality/url/text — never transcripts, keys,
   prompt_vi or notes. Video/audio = external link only. Plus `eng_my_inquiries()` listing the caller's
   own instances (id, title, big question, due) so the home can find them.
7. Auto-check rules (server, staff-visible `attempts.auto_checks jsonb`): mcq = exact option match
   (letter or text, normalised); gap/word_form = case/whitespace-insensitive exact match against the key
   (multiple accepted answers if the key lists them separated by " / "); transform/short/open = not
   auto-checked (`null`, needs a person). Never a 0–4 score.

## Steps (commit after each; typecheck/lint/test green; gen:config --check green)
1. **Migration `0009_student_work.sql`**: tables `working_drafts` (PK activity_instance_id+learner_id;
   student can upsert own via RPC only), `attempts` (DESIGN §5 columns + `auto_checks jsonb`, unique
   `client_submission_id`, unique `(activity_instance_id, attempt_no)`), `artifact_versions` (kind
   text|answers; is_raw), `assistance_events`, `exposure_log`, `episodes` (DESIGN §6 columns relevant now:
   attempt_id unique, learner_id, is_first_attempt, context_id = inquiry template id, observed_directly,
   facets). All learner tables except working_drafts append-only (eng_forbid_mutation) and in
   eng_purge_learner (create-or-replace from 0007's body, only add deletes — prove by diff test).
   RLS: student SELECT own attempts/artifacts/assistance (NOT `auto_checks` column — column privilege or a
   view without it), staff SELECT in scope; episodes/exposure staff-only. No direct INSERT for anyone:
   RPCs `eng_save_draft(p_activity, p_content jsonb)` and `eng_submit_attempt(p_activity, p_client_id,
   p_content jsonb, p_assistance text[], p_provenance text)` — security definer, caller must be the
   learner of that activity, step must be released (same rule as eng_my_released_steps), activity type ∈
   {SOURCE-QA, WRITE}; content validated (size limits: text ≤ 20k chars; answers only for item ids of
   that step); server assigns attempt_no, content_hash (sha256 of canonical JSON), learning_family_id
   (= first attempt id of that activity), computes auto_checks from instance_item_keys, inserts artifact,
   assistance, exposure, episode, audit receipt; idempotent on client id (same caller only; different
   content with same id → error 409). Returns receipt {attempt_id, attempt_no, submitted_at, hash}.
2. **Server routes**: `GET /api/student/home`, `GET /api/student/activities/:id` (step + sources + own
   draft + own attempts list without auto_checks), `PUT /api/drafts/:activityId`, `POST /api/attempts`.
   requireAccess: student acts only on self; staff cannot submit as student (403). Zod bodies.
3. **UI** (mobile-first, follow mockup Main/Studio + UX guide; all strings in lib/copy/vi.ts):
   `/` student home: greeting, "Việc tiếp theo" (earliest released, not-yet-submitted step of
   SOURCE-QA/WRITE), "Chủ đề tuần này" checklist (released steps with done/now/later icons), mode banner
   (`modeLabels.student`). `/activities/[id]`: source reader (text; links for audio/video), questions by
   kind (radio for mcq; inputs for gap/word_form/transform/short; textarea for open), or writing editor
   with word count + autosave; help declaration; "Nộp bài" → receipt screen "Đã nộp lúc HH:MM" (no
   correctness shown). After submit the step shows as done; resubmitting (retry) allowed only if mode is
   PRACTICE (INDEPENDENT_CHECK: one attempt; REVISION is S6).
4. **Tests**: DB — submit happy path for both types; idempotency (same id twice → same receipt; 4 concurrent
   → 1 row; same id different content → 409); unreleased step rejected; other learner's activity rejected;
   staff cannot submit; INDEPENDENT_CHECK second attempt rejected; PRACTICE retry → attempt_no 2,
   is_first_attempt false, same learning family; REVISION never first attempt (construct via direct
   function call on a REVISION step → rejected in this slice since REVISE not supported, assert that);
   auto_checks correct incl. accepted alternatives; student cannot read auto_checks or episodes/exposure;
   append-only + purge; baseline facet set. Unit — auto-check normaliser, routes (401/403/404/409/200),
   receipt. E2E — An (thử) home shows next task; opens A-W1 reading step, answers, declares "không dùng
   hỗ trợ", submits, sees receipt without any right/wrong; reload → step done; Nguyên (thử) cannot open
   An's activity URL (404); tutor sees nothing new in S4 UI (no review yet) but cannot submit (403).
   Use dates relative to today (seed-dev assigns with due so steps are released — adjust seed to assign
   An's A-W1 so its first steps are released today in CI).
5. **Docs**: PROGRESS S4 section (SQL 0009 for parent; what the child can do now; what is still on paper),
   CLAUDE.md status.

## Out of scope
Showing correctness/feedback to students (S5/S6), review inbox/scoring (S5), revision (S6), Canvas
(S3b), speaking (S10), AI (S11+), listening transcript opening, offline mode.

## Stop and ask
Anything that would show scores/right-wrong to students, change counting rules, or send audio anywhere.
