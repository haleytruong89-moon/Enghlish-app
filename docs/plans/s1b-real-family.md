# S1b — Tạo gia đình THẬT (tài khoản cho phụ huynh, An, Nguyên, 2 gia sư)

Owner: builder (Sonnet). Plan: Opus, 16/10/2026. Review: Opus before PR.
Context: Supabase project is SHARED with Study Launcher (same auth.users). Launcher already has auth
accounts for the parent and both children. Supabase default SMTP does not deliver to arbitrary emails,
so no invite/reset emails: the parent sets passwords and hands them over.

## Goal
One manual GitHub workflow **"Create real family"** (typed confirmation `CREATE`) that idempotently
creates the real family in schema `english`: 1 parent, learner An (track A, alias "An"), learner Nguyên
(track B, alias "Nguyên"), tutor of An, tutor of Nguyên, active relationships, a consent record, and
target sets A-v1 / B-v1 assigned. Re-running changes nothing. Never prints passwords.

## Decisions (Opus)
1. **Reuse existing auth users by email** (case-insensitive). Typing the Launcher login emails of the
   parent/children means one login works for both apps; nothing about those accounts is changed
   (no password reset, no metadata overwrite). Only missing emails get a new auth user with
   password = that slot's own secret `NEW_PASSWORD_PARENT|AN|NGUYEN|TUTOR_AN|TUTOR_NGUYEN` (≥ 12 chars, all
   provided values pairwise different; a slot's secret is required only if its account must be created), `email_confirm: true`, `user_metadata.app = "learning-os"`.
2. Inputs (workflow_dispatch, ≤ 10): `confirm`, `parent_email`, `an_email`, `nguyen_email`,
   `tutor_an_email`, `tutor_an_name` (display, e.g. "Cô Lan"), `tutor_nguyen_email`, `tutor_nguyen_name`.
   Aliases are fixed "An" / "Nguyên" (privacy: only these go to any LLM later). Colors as in the test seed.
3. Real family id: deterministic (fixed UUID constant for the real family) so re-runs are idempotent;
   is_test = false everywhere. If a member row already exists for an auth user in another family →
   stop with a clear error (never move people between families).
4. Consent: insert the parent's consent record with the current notice version used by the schema
   (read 0002 for columns; if a version constant/notice text exists use it, otherwise version
   'pilot-2026-10' with a short Vietnamese summary in the row's text/jsonb field if the schema has one).
5. Target sets via `english.eng_assign_target_set` (A-v1 for An, B-v1 for Nguyên) — idempotent.
6. Do NOT assign inquiries automatically (the parent assigns weeks from the "Giao bài" page).
7. Also document: Vercel Production `ALLOW_REAL_LEARNERS=true` after this runs (Preview stays false).

## Steps
1. `scripts/lib/realFamily.ts` (pure-ish, transaction on a pg client) + `scripts/create-real-family.ts`
   (CLI reading env; Supabase Admin API for auth users, like seed-dev's supabaseUsers but without
   ever changing existing users). npm script `db:create-family`.
2. `.github/workflows/create-real-family.yml` (manual, confirm `CREATE`, ubuntu-24.04, checkout@v5,
   setup-node@v5, Node 22; secrets DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEW_PASSWORD_* (one per slot);
   var NEXT_PUBLIC_SUPABASE_URL). Summary lists per person: role, email, "đã có tài khoản (dùng chung
   Launcher)" vs "tài khoản tạo mới ở lần chạy này — mật khẩu tạm = secret NEW_PASSWORD_<slot>" vs "tạo ở lần chạy trước bởi công cụ này". Inputs are validated
   (email format, the 5 emails distinct). No secret values in output.
3. Tests: DB tests with the stub auth (insert auth.users directly like `--auth=stub`): creates exactly the
   expected rows; idempotent second run; existing auth user reused and untouched; member already in
   another family → error and nothing written (transaction); RLS sanity: tutor of real An cannot read
   real Nguyên; test family untouched. Unit tests for input validation.
4. Docs: PROGRESS section "Tạo gia đình thật" (steps for the parent, incl. Vercel ALLOW_REAL_LEARNERS=true
   for Production only, and how tutors get their password), CLAUDE.md commands.

## Out of scope
A change-password page (later), invite emails, admin UI.

## Review fixes (Opus review, 16/10/2026)
- One temporary-password secret per slot (a shared one let one new tutor log in as another); a "Đổi mật khẩu" page
  (`/account/password`, link in the header for every role) lets each person replace it with their own.
- All checks are read-only and run BEFORE the first auth account is created: passwords, migrations recorded +
  A-v1/B-v1 published, conflicts, requested email vs the person already in a filled slot, learner without a student account.
- Re-runs never reverse later changes: a target set is assigned only to a learner with no `target_sets` row; a tutor
  relationship only when the learner has no tutor relationship row at all (active or ended); both are reported as
  "không đổi (đã có lịch sử)". A failure after accounts were created prints `CẢNH BÁO: đã tạo N tài khoản …`.
- Read-only warning when a trigger on `auth.users` writes to schema `public` (Launcher profile per new user).
