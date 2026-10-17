# S5b-1 — Bài của gia sư: tên đăng nhập ngắn, ghi kết quả bài, nhận xét có nhãn, điểm cần chú ý, giao bài link/PDF

Owner: builder (Sonnet). Plan: Opus, 17/10/2026. Review: Opus before each PR.
Refs: PRD_FAMILY_EDITION §3 (measurement contract), D15 · DESIGN §6, §8 (counting), §17 (not decided by Claude) ·
UX_COPY_GUIDE (all strings in `lib/copy/vi.ts`) · S5 plan (lesson_notes, security-definer pattern, append-only) ·
mockup canvas "Màn gia sư — S5b (mockup)" (claude.ai artifact F32JyJTzmvqWbbUwBCjzqA; local copy
`…/scratchpad/s5b-mockup/project/*.dc.html`) · tutor test sample: Destination C1&C2 Progress Test U1–12 (answer key
labels each item's grammar point) · NotebookLM/Gemini quiz result screens (score X/Y, "Missed it" list, Hint, Retake).

## Goal
Tutors (and the parent as fallback) use the app every week for what they already do outside it: give homework
(link or PDF), record test/homework results, write a short note after each session. The app turns those into
"Điểm cần chú ý": the same grammar/vocabulary **tag** wrong in ≥ 2 different sources. Students receive homework,
download PDFs, send back a **screenshot of the result page** (or photos of paper work) with two taps, and see
"Việc cần ôn" + the tutor's message — never scores. **One design for both tutors**; tracks differ only by tag set
(config, never `if (track === …)`).

## Parent decisions this plan implements (16–17/10/2026)
- Level **b**: tag-based insight; library + suggestions later (S5b-2). **No AI** in this slice (image reading:
  "tạm chưa, bổ sung sau nếu cần").
- Who enters: tutor **and** parent. Who tags wrong items: **tutor first, parent as fallback**.
- Tutors work on a **computer** (desktop-first layout; still usable at phone width).
- PDF homework: tutor **uploads**, student **downloads**. Link homework: student sends a **screenshot** of the result
  page (pasting the link is optional — a quiz link does not carry the attempt's result).
- Uploaded files are **not** in the weekly backup for now ("chưa cần sao lưu").
- Short login names: `an`, `nguyen`, `giasu-an`, `giasu-nguyen` mapped to Gmail plus-addresses
  (`haley.truong89+an@gmail.com`, …, tutors `+giasu-an1`, `+giasu-nguyen1`). Parent keeps her email.
- Assumed accepted (shown in the mockup, no objection; listed in PR for confirmation): two note fields (message to
  the student / note for parent), blank answer = wrong, in-class results recorded by tutor only, tags on writing
  reviews, recheck result recorded in the session note.

## Measurement rules (DB-enforced where possible)
1. Test/practice results are **signals**, never evidence for states/levels: no rows in `observations` /
   `validation_decisions`; the engine (S7) ignores them.
2. Only the **first attempt** of a piece of work feeds "Điểm cần chú ý"; retries are stored with `attempt='retry'`
   and excluded. `used_hint=true` is stored and shown ("có gợi ý"), still counted.
3. Work done **in the session** (`context='class'`): only a tutor with an active relationship may record it (D15 style).
4. Students never SELECT the new tables; they use `eng_my_*` RPCs that return no scores, counts or wrong items.
5. Recheck due = last mark of a tag + `delayedMinDaysFromLastExposure` from the learner's assessment policy (14 in
   AP-0.2-pilot) — read from `assessment_policies`, not hard-coded.
6. No question text of published tests is stored: frames hold item number → part → tag only. PDFs live in private
   storage, opened by short-lived signed URLs, family-scoped.

## Data model (expand-only; new migrations, idempotent, end with `schema_migrations` insert)
- **`0013_login_names.sql`** — `english.login_names(login_name text pk check ^[a-z0-9][a-z0-9-]{1,30}$,
  auth_user_id uuid not null unique, active bool, created_at)`. No grants to anon/authenticated.
  `english.eng_login_email(p_name text) returns text` security definer, execute **service_role only**: returns the
  auth email for an active name, else NULL.
- **`0014_tutor_work.sql`**
  - `error_tags(id, track_id, key, label_vi, group_vi, family_id null=global seed, origin 'seed'|'custom',
    created_by, retired_at)`; unique (track_id, family_id, key). Staff may add custom tags (search box "+ nhãn khác").
    Not part of the locked catalogue; not used by the engine.
  - `test_frames(id, family_id, track_id, title, total_items, parts jsonb [{key,name,from,to}],
    items jsonb [{n, part, tag_key}], scale jsonb null, supersedes_id, created_by, created_at)` — append-only;
    validation: items cover 1..total exactly once, every tag_key exists for the track.
  - `results(id, learner_id, assignment_id null, frame_id null, mode 'frame'|'quick', context 'home'|'class',
    attempt 'first'|'retry', used_hint bool, total_items, correct, wrong_items int[], item_tags jsonb
    [{n, tag_key|null}], taken_on date, recorded_by_member, recorded_role, supersedes_id, client_id, created_at)` —
    append-only; frame mode derives item_tags from the frame; quick mode allows untagged items (= "chờ gắn nhãn").
  - `tag_marks(id, learner_id, tag_key, source 'test'|'practice'|'lesson'|'writing', source_id, item_no null,
    counts bool, created_at, recorded_by_member)` — append-only, written inside the same transaction as the source
    row; `counts=false` for retries and superseded rows. "Điểm cần chú ý" = group by tag over a window.
  - `lesson_notes` **expand**: add `weak_tag_keys text[] (≤3)`, `message_to_learner text (≤500)`,
    `note_for_parent text (≤1000)`, `author_role 'tutor'|'parent'`; `recheck_events(id, learner_id, tag_key,
    lesson_note_id, result 'ok'|'still_wrong'|'not_asked', created_at)`. New writer `eng_write_lesson_note_v2`
    (tutor or parent of the family; old function untouched). `still_wrong` writes a counting `tag_marks` row.
  - `writing_tag_marks` via existing review screen: optional tag chips per reviewed episode →
    `tag_marks(source='writing')` (function `eng_tag_episode`).
  - RPCs (security definer, `search_path=''`, execute service_role only; server calls after `requireAccess`):
    `eng_record_result`, `eng_tag_result_items` (fills untagged items; tutor or parent), `eng_weak_points(learner,
    since)` → per tag: counts per source, distinct sources, last_seen, recheck_due, status
    ('repeat' ≥2 sources | 'watch' 1 source | 'ok'), `eng_untagged_queue(learner)`.
  - Purge: extend `eng_purge_learner` (create-or-replace from latest body, only add deletes; diff test).
- **`0015_seed_tags.sql`** — seed tags from `content/tags/tags_B.json` (from the Destination U1–12 key:
  câu điều kiện & đảo ngữ; wish/would rather/had better; động từ khuyết thiếu suy đoán; bị động/nhờ ai làm/tường
  thuật; dạng từ; từ vựng theo ngữ cảnh; cụm động từ; thành ngữ; + từ nối & lập luận; phát âm) and
  `content/tags/tags_A.json` (KET/A2: hiện tại đơn, hiện tại đơn -s/-es, giới từ in/on/at, quá khứ đơn, so sánh,
  từ vựng theo chủ đề, đọc hiểu KET, viết câu/đoạn ngắn, nghe, phát âm). `on conflict do nothing`.
- **`0016_practice_files.sql`**
  - Storage bucket `english-work` (private, 15 MB, pdf/png/jpeg/webp) created only `if exists schema storage`
    (CI's plain Postgres has none). **No policies on `storage.objects`** → nobody reads/writes it with their own
    session; the server uses service role **after** an english-side access check and hands out signed upload URLs
    (client uploads directly; avoids Vercel's 4.5 MB body limit) and signed download URLs (TTL 300 s).
    Touches only bucket `english-work`; schema `public` untouched.
  - `files(id, family_id, learner_id null, kind 'assignment_pdf'|'answer_key'|'result_image'|'work_photo',
    path, mime, bytes, uploaded_by_member, created_at, removed_at)`; path = `{family}/{learner|shared}/{uuid}.{ext}`.
  - `assignments(id, learner_id, kind 'link'|'pdf', url null (https only), source_label (detected:
    test-english / NotebookLM / Gemini / khác), title, tag_keys text[], due_on, frame_id null, file_id null,
    assigned_by_member, created_at)` + `assignment_events(retracted)`.
  - `submissions(id, assignment_id, learner_id, attempt, used_hint, link_url null, file_ids uuid[],
    submitted_by_member, created_at, supersedes_id)` — student or staff may submit (staff: "nộp thay").
  - Student RPCs: `eng_my_practice()` (title, kind, open url / has file, due, submitted?), `eng_submit_practice`,
    `eng_my_review_points()` (labels of the latest note's weak tags + `message_to_learner`, nothing else).
  - Purge deletes rows; a server-side purge helper removes the learner's storage folder (documented; storage objects
    are outside pg_dump).

## Screens (copy from `lib/copy/vi.ts`; layout per mockup)
- `/` for tutor/parent → **Hôm nay**: 3 actions (Ghi buổi học · Ghi kết quả bài · Giao bài), "Cần chú ý" (top
  repeats, recheck due, untagged submissions — parent sees untagged items older than 2 days as "chờ gia sư"),
  open practice list, inbox link, last session.
- `/learners/[id]/results/new` → **Ghi kết quả bài**: pick assignment or "bài trên giấy"; mode Đề có khung (grid,
  click wrong) | Nhập nhanh (score + wrong numbers + tag per wrong item; screenshot shown beside if submitted);
  attempt / hint / context. In-class option hidden for parent.
- `/learners/[id]/notes/new` → **Ghi buổi học** (v2): ngày, hôm nay học, ≤3 weak-tag chips + search/add, message to
  student, note for parent, recheck due items (ok / còn sai / chưa hỏi), links to assign / record result.
- `/learners/[id]/weak` → **Điểm cần chú ý**: table tag × source, window 4/8 weeks/all, detail timeline, recheck.
- `/learners/[id]/assign` → **Giao bài**: Link | Đề PDF (upload, optional answer key), title, tags, due.
- Student `/practice` → **Bài luyện**: open link / download PDF; send screenshot (Ctrl+V paste or file picker,
  downscaled client-side to ≤ 1600 px) or photos; 2 taps (lần đầu? Hint?); "Việc cần ôn" + message.
- Login: one field "Tên đăng nhập hoặc email".
- Frames: no builder UI yet — `npm run db:import-frame <file.json>` + workflow "Import test frame" (confirm IMPORT);
  Claude drafts the JSON from an answer key; first frame = Destination U1–12 (`content/frames/`).

## Steps (each: typecheck · lint · test · gen:config --check green; commit)
**PR A — `feature/s5b1a-login-results`**
1. Login names: migration 0013, login action resolves names server-side (service client), identical error for
   unknown name / wrong password, unit + e2e test; extend `create-real-family` (optional inputs, defaults above) to
   upsert names idempotently.
2. Migrations 0014 + 0015 (tags, frames, results, tag_marks, lesson-note expand, recheck, RPCs, purge) + DB tests:
   RLS (students 0 rows; cross-family 0), in-class by parent rejected, frame validation, retry excluded from weak
   points, recheck due from policy, append-only, purge diff.
3. Frame import script + workflow + Destination U1–12 frame JSON.
4. Screens: Hôm nay, Ghi kết quả bài (both modes, no files yet), Ghi buổi học v2, Điểm cần chú ý, tag chips on the
   review screen. Copy in `vi.ts`.
5. Opus review → fixes → PR (Vietnamese description: try-on-preview steps, SQL to apply 0013–0015).

**PR B — `feature/s5b1b-practice-files`**
6. Migration 0016 + storage helper (`lib/storage/`: signed upload/download, mime/size checks, path builder) +
   DB tests (student sees own assignments only; submit only own; staff "nộp thay"; files family-scoped).
7. Screens: Giao bài (link/PDF), student Bài luyện (paste/upload screenshot), screenshot beside "Nhập nhanh".
8. E2E smoke with local Supabase storage: tutor assigns PDF → student downloads → submits screenshot → tutor tags →
   weak point appears.
9. Opus review → fixes → PR (SQL to apply 0016).

## Out of scope
Library + suggestions, sổ lỗi của em (S5b-2) · AI reading screenshots (parent: later, only if needed) · in-app frame
builder · tutor replacement flow for `giasu-*` names · backup of storage files · Launcher short-name login.

## Risks / open
- Storage bucket lives in the project shared with Launcher (schema `storage`, bucket-scoped). Parent approved file
  upload; PR will state exactly what is created.
- Copyrighted PDFs (e.g. Destination) stay private to the family; no public links.
- Student self-report via screenshot can be wrong → staff confirm numbers before saving; only staff create results.
