# SM-2 · Hồ sơ cấp đang học (level profile) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each child gets a "Hồ sơ cấp" — the level they are currently learning in each of the 7 domains (assumed from the track until the tutor confirms it), a book of level decisions (baseline / adjust; `level_up` reserved for S7) and a book of external exam results; tutor screens to confirm the starting levels and to adjust one level with a reason; a parent form for external results; tag pickers that put the current level ± 1 first; a "Thay đổi cấp gần đây" box on the parent home; and "Việc cần ôn" by domain on the student home (labels and domain names only).

**Architecture:** One expand-only migration `0020_level_profile.sql` adds two append-only tables (`level_decisions`, `external_results`), widens `files.kind` with `external_result`, adds five security-definer functions (`eng_record_level`, `eng_record_external_result`, `eng_level_profile`, `eng_recent_level_changes` — service_role only — and the student-safe `eng_my_review_by_domain`, authenticated only, keyed on `auth.uid()`), and extends `eng_purge_learner` / `eng_purge_preview`. The app gets a pure `lib/levels/` module (types, scale rules, plain-language view helpers, zod shapes, handlers, store, routes, loaders), four staff pages under `/learners/[id]/levels`, a small change in `lib/skillmap/group.ts` + `DomainTabs` / `TagSelect` for the ± 1 sort, and two home-page additions. The current level is derived data: latest decision per domain, else the track's assumed level in `skill_maps.assumed` (SM-1 config).

**Tech Stack:** Next.js App Router + TypeScript strict + Tailwind, Supabase Postgres (schema `english`), zod 4, Vitest (unit + DB tests on local Postgres 16), Playwright (CI only).

**Spec:** `docs/superpowers/specs/2026-10-21-skill-map-levels-design.md` — SM-2 = §1 rows P2-a, P2-b, P2-c, P2-d, P4-c; §3; the SM-2 rows of §5 and §6; §7; §8. Mockup board "10 · Hồ sơ cấp" and the other SM-2 boards approved by the parent on 22/10/2026. Builds on SM-1 (`docs/superpowers/plans/2026-10-21-sm1-skill-map.md`, migration `0019`).

## Global Constraints

> Note: Amendments A1 and A2 at the end of this plan override the D9 / D13 wording in this section and in the decision table.

- Everything lives in schema `english`; never create or change anything in schema `public`; never `supabase db push` / `db reset --linked`.
- Migration `0020_level_profile.sql` is idempotent, expand-only, and its LAST line is `insert into english.schema_migrations(version) values ('0020') on conflict do nothing;`. Never edit 0001–0019, `content/skill_map/SM-1.json`, the catalogue / target-set / tag JSON or `content/config.lock.json`.
- New append-only tables carry `english.eng_forbid_mutation('learner_id')` (update/delete) and `english.eng_forbid_mutation()` (truncate), RLS on, no direct INSERT/UPDATE/DELETE/TRUNCATE for anyone (also revoked from `service_role`); SELECT only through the policy `english.eng_is_staff_of(learner_id)` (parent of the family, tutor with an active relationship — never a student). No `grant … on all tables`.
- Every callable new function: `security definer`, `set search_path = ''`. `eng_record_level`, `eng_record_external_result`, `eng_level_profile`, `eng_recent_level_changes`: `revoke … from public, anon, authenticated; grant … to service_role;` — routes/pages call them only after `requireAccess` / `requireLearnerPage`. `eng_my_review_by_domain`: `revoke … from public, anon, service_role; grant … to authenticated;` (it finds the student by `auth.uid()`).
- Levels: CEFR 9 steps `A1 · A2 · A2+ · B1 · B1+ · B2 · B2+ · C1 · C2`, or task level `1`–`4` for the domain whose `skill_domains.scale = 'task_level'` (`thinking`). The map's `domain.scale` decides; the write function checks it.
- Current level = latest `level_decisions` row of that domain; none → the track's assumed level from `skill_maps.assumed` (status "assumed", shown as "Ước lượng — cô chưa xác nhận").
- `baseline` and `adjust` are written ONLY by a tutor with an active relationship to the child (checked in the DB; route action `levels:decide` is tutor-only). Parents read and are told on their home. `level_up` is refused by `eng_record_level` (reserved for S7). Reason is required for `adjust`. Never lower a level automatically; external results never change a level.
- Students read none of the two books: no RLS path, no access to the four staff functions. Their only new call is `eng_my_review_by_domain()` → `{items: [{domain_key, domain_name, label}]}`, at most 3, no level, no score, no date, no count.
- All UI text from `lib/copy/vi.ts` (rules `docs/UX_COPY_GUIDE.md`). Levels are written "đang học B1" — never the word "đạt" for a level (a unit test scans the new copy). Never the word "TOMO" in the UI (reading reports appear as "Báo cáo kỹ năng đọc tháng 10/2026", without their source). The app is always light (`color-scheme: only light` from SM-1; no `dark:` classes).
- Track is configuration: no `=== "A"` / `=== "B"` anywhere (ESLint `no-restricted-syntax`, tests included).
- Branch `feature/sm2-level-profile` from `feature/skill-map` (or from `main` once SM-1 is merged). Before the PR: `npm run typecheck && npm run lint && npm test && npm run gen:config` green; Opus `reviewer`; PR description in Vietnamese with "SQL cần áp: 0020 (áp TRƯỚC khi thử preview hoặc gộp; cần 0019 đã áp)".
- Every commit message ends with the `Co-Authored-By` / `Claude-Session` lines of the session that implements it (as in SM-1).

## Decisions taken in this plan (for the parent)

Approved behaviour is unchanged; these fill gaps the spec leaves open. They are repeated in the PR description.

| # | Spec says | This plan does | Why |
|---|---|---|---|
| D1 | P4-c "cấp hiện tại ± 1" | ± 1 **CEFR level** (A1 · A2/A2+ · B1/B1+ · B2/B2+ · C1 · C2), not ± 1 of the 9 steps; thinking: ± 1 task level. A tag without a level ("Suy luận", "Phát âm"…) is always near; a tag already chosen is always near. | Q1 uses "1 cấp" the same way (An A2 → B1+, Nguyên B2 → C1). ± 1 step would hide B1 tags from a child at A2. |
| D2 | P4-c "ô chọn nhãn" | Applies to the **tag** pickers only (chips and the wrong-item select). "Kỹ năng đã luyện hôm nay" lists the child's own skill set and is not split. Weak points are never split. | The set is what the child is learning; hiding part of it would be wrong. |
| D3 | §3 "tiến độ trong cấp n/N" | Shown as the honest empty state "Sẽ có khi app bắt đầu theo dõi trạng thái từng kỹ năng (bước sau)." in the three boxes Đã vững / Đang luyện / Để lên cấp tiếp, còn cần. The word "S7" is not shown (UX guide: no codes). | No skill states exist before S7. |
| D4 | Mockup "Mạnh nhất / Cần tập trung" | Computed from current levels of the **6 CEFR domains** only (thinking has its own scale). Ties list every tied domain ("Đọc, Nghe · B2+"). All equal → both boxes say "Các mảng đang ngang nhau". "Đang chờ cô" = "Không có" until S7. | The two scales cannot be compared. |
| D5 | Mockup "7 thanh trên một thang A1→C2" | The 6 CEFR bars share the A1 → C2 axis; the thinking bar has the same width and says "bậc 2 · thang riêng bậc 1 → 4". Assumed bars are striped with a dashed border and the text "Ước lượng — cô chưa xác nhận" (never colour alone). | A task level is not a CEFR level. |
| D6 | §3 baseline / adjust | `baseline` once per domain (second time → "đã xác nhận", use Điều chỉnh). `adjust` needs a baseline of that domain first, exactly one domain, a different level and a reason (1–300 characters). The baseline screen saves every not-yet-confirmed domain in one call (one shared optional note). | Keeps "giả định" vs "đã xác nhận" unambiguous. |
| D7 | §3 `evidence jsonb` | Filled by the database for baseline / adjust: `{"basis": "tutor_judgement", "assumed_level": …, "latest_external_result_id": …}`; nothing from the browser. S7 fills it for `level_up`. `policy_version` = the policy of the child's current skill set (null if none). | No untrusted input in evidence. |
| D8 | §3 `decided_role` | Only `'tutor'` is allowed (table check). | Q3: the tutor confirms. S7 can widen the check (expand). |
| D9 | §3 external results | Exam date: not after today, not more than 10 years back. Score is free text (1–60 characters). At least one domain. Optional file (PDF / image ≤ 15 MB) in `english-work` under the child's folder (new file kind `external_result`; a PDF opens as a download). No correction / deletion screen in SM-2 (append-only; a wrong entry stays and a correct one can be added). | Smallest safe version; correction can come with S7 if needed. |
| D10 | §3 "Báo cáo TOMO … hiển thị như mốc ngoài của mảng Đọc" | The profile lists the 6 latest current monthly reading reports as "Báo cáo kỹ năng đọc tháng MM/YYYY · Đọc" in "Mốc ngoài & lịch sử" — no source name, no numbers (numbers stay in the Đọc tile of Điểm cần chú ý). | "Never TOMO in the UI" (parent 22/10). |
| D11 | §5 "Trang chủ phụ huynh: ô thay đổi cấp gần đây" | Last 30 days, newest first, at most 5 rows across both children: "An · Ngữ pháp: A2 → A2+", kind, date, tutor, reason in quotes. Empty → "30 ngày qua chưa có thay đổi cấp nào." If no child's changes could be read, the box is hidden (no false "no change"). | Plain "báo phụ huynh" in the app (no email/push, §7). |
| D12 | §5 "Việc cần ôn theo mảng (≤ 3)" | At most **3 labels in total**, grouped under their domain name, taken from the tags whose re-check is due (`eng_weak_points.recheck_due`), worst first. A tag with no group in the map is listed under "Khác". No items → the box is not shown. If the call fails the student home still renders without the box. | UX guide §4.5 "gợi ý (≤ 3)". |
| D13 | Mockup wording | Level strings say "cô" literally ("Đang chờ cô", "Ước lượng — cô chưa xác nhận", "Cô xác nhận ngày …"), as approved, instead of the configurable `tutorHonorific` ("thầy/cô"). | Approved mockup text. |
| D14 | §5 Hồ sơ cấp detail "nhóm, điểm ở cấp hiện tại" | The detail panel lists, for the current level band, each group of the domain with its SM-1 description ("Ở B2, mảng này gồm: Thì — QK hoàn thành…"), then the three S7 boxes (D3), then up to 5 weak points of the domain (8 weeks) with a link to the Điểm cần chú ý tile. Default panel = the "Cần tập trung" domain, else Ngữ pháp. | Uses only data that exists today. |
| D15 | Who opens which page | `/levels` (profile): tutor + parent (`tutorwork:read`). `/levels/baseline` and `/levels/adjust`: tutor only (new action `levels:decide`; a parent gets 404 like any page outside her role). `/levels/external/new`: tutor + parent (`tutorwork:write`). | Spec §3 "Ai ghi". |

## Spec gaps noticed (asked in the PR, not blocking)

1. The spec does not say whether an external result can be corrected or withdrawn (D9 says no for now; Amendment A2 overrides this: a correction is a replacement entry, withdrawal without replacement is deferred).
2. The spec does not say whether the parent's home should mark a change as "đã xem". SM-2 shows the last 30 days (D11).
3. "Đang chờ cô" has nothing to count before S7 (proposals); it always says "Không có" in SM-2.

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/0020_level_profile.sql` | 2 append-only tables + RLS; `files.kind` + `external_result`; 5 functions; purge + preview |
| `lib/levels/types.ts` | Constants (`EXAMS`, `LEVEL_KINDS`, limits) + view types (`DomainLevel`, `LevelProfile`, `LevelChange`, `RecentChange`, `ReviewItem`, …) |
| `lib/levels/scale.ts` | Pure scale rules: `TASK_LEVELS`, `levelsOf`, `isLevelOf`, `stepIndex`, `majorIndex`, `barFraction`, `bandOf`, `nearLevel`, `strongestWeakest`, `currentLevels` |
| `lib/levels/view.ts` | Pure text helpers from `lib/copy/vi.ts`: `levelText`, `profileSummary`, `domainSentence`, `boxValue`, `groupReview`, `monthLabel`, `dayLabel` |
| `lib/levels/shape.ts` | zod parsers: `parseLevelProfile`, `parseRecentChanges`, `parseReviewByDomain` (strict) |
| `lib/levels/schemas.ts` | Request bodies: `recordLevelsBodySchema`, `externalResultBodySchema` |
| `lib/levels/handlers.ts` | `handleRecordLevels`, `handleRecordExternalResult` (requireAccess → body → file check → store) |
| `lib/levels/supabaseStore.ts` | service-role calls of the two write functions |
| `lib/levels/route.ts` | session → handler → JSON glue (with file storage) |
| `lib/levels/load.ts` | `loadLevelProfile`, `loadRecentLevelChanges` (server only) |
| `lib/storage/verify.ts` | `FILE_ERRORS`, `verifyStoredFile` (shared by practice and levels) |
| `lib/storage/rules.ts`, `lib/practice/{handlers,schemas}.ts` | kind `external_result`, upload purpose, download name |
| `lib/auth/requireAccess.ts` | new action `levels:decide` (tutor) |
| `lib/skillmap/{types,group,load}.ts` | `SkillMapView.current`; near / far buckets; `loadPickerMap` |
| `components/tutor/{DomainTabs,TagSelect}.tsx` | "Cấp khác (n)" collapsed; near optgroups first |
| `components/levels/{LevelSummaryCard,LevelBars,DomainDetail,Milestones,BaselineForm,AdjustForm,ExternalResultForm,RecentLevelChanges}.tsx` | SM-2 screens |
| `components/student/ReviewByDomain.tsx`, `components/student/StudentHome.tsx` | "Việc cần ôn" by domain |
| `app/learners/[id]/levels/page.tsx`, `…/levels/baseline/page.tsx`, `…/levels/adjust/page.tsx`, `…/levels/external/new/page.tsx` | pages |
| `app/api/learners/[id]/levels/route.ts`, `app/api/learners/[id]/external-results/route.ts` | POST routes |
| `app/page.tsx`, `components/LearnerCard.tsx` | parent box; "Hồ sơ cấp" link |
| `lib/work/{handlers,supabaseStore,load}.ts` | student home carries `review` |
| `lib/copy/vi.ts`, `lib/tutorwork/client.ts` | `levelCopy`, `levelFormCopy`, `externalCopy`, `studentReviewCopy`, picker words, errors, purge labels |
| Tests | `tests/unit/migration0020.test.ts`, `tests/db/levelProfile.test.ts`, `tests/db/migrations.test.ts`, `tests/unit/fixtures/levels.ts`, `tests/unit/levels.test.ts`, `tests/unit/levelsUi.test.ts`, `tests/unit/skillMap.test.ts`, `tests/unit/skillMapUi.test.ts`, `tests/unit/purge.test.ts`, `tests/unit/requireAccess.test.ts`, `tests/unit/practiceHandlers.test.ts`, `tests/unit/workHandlers.test.ts`, `tests/unit/workUi.test.ts`, `tests/e2e/tutorWork.spec.ts`, `tests/e2e/student-no-scores.spec.ts` |
| Docs | `docs/PROGRESS.md` (SM-2 section), `CLAUDE.md` (status + next migration 0021), `docs/DESIGN.md` (§19.8) |

Task order: 0 (gate) → 1 → 2 → 3 (migration) → 4 (`lib/levels` core) → 5 (API) → 6 (profile page) → 7 (forms) → 8 (pickers ± 1) → 9 (homes) → 10 (e2e) → 11 (docs, checks, review, PR).

---

### Task 0: Gate (parent, not for the builder)

- [x] Mockup boards approved by the parent on 22/10/2026 ("10 · Hồ sơ cấp", "Chọn nhãn theo mảng" with ± 1, "Trang chủ của em").
- [ ] SM-1 (`feature/skill-map`, migration `0019`) is the base: create the branch with `git fetch origin && git checkout -b feature/sm2-level-profile origin/feature/skill-map` (or `origin/main` once SM-1 is merged). If `feature/skill-map` moves while SM-2 is built, rebase onto it before the PR.

---

### Task 1: Migration 0020 part 1 — two append-only books, `files.kind`, RLS, purge

**Files:**
- Create: `db/migrations/0020_level_profile.sql`
- Modify: `tests/db/migrations.test.ts` (two table lists)
- Test: `tests/unit/migration0020.test.ts` (grown in Tasks 2–3), `tests/db/levelProfile.test.ts` (grown in Tasks 2–3)

**Interfaces:**
- Consumes: `english.skill_maps` (0019), `english.files` (0016), `english.eng_forbid_mutation` (0004), `english.eng_is_staff_of` (0007), `eng_purge_learner` / `eng_purge_preview` as of 0018 (lines 277–550 of `0018_reading_skills.sql`).
- Produces:
  - `english.level_decisions(id, learner_id, domain_key, map_id, from_level, to_level, kind, reason, evidence, policy_version, decided_by_member, decided_role, client_id, decided_at)`; unique `(learner_id, client_id, domain_key)`.
  - `english.external_results(id, learner_id, exam, taken_on, score_text, domains text[], file_id, note, recorded_by_member, recorded_role, client_id, recorded_at)`; unique `(learner_id, client_id)`; `file_id` used once.
  - `files.kind` accepts `'external_result'` (PDF or image).
  - Purge receipt / preview keys `level_decisions`, `external_results`.
  - Marker line `-- 6. Purge: …` in the migration: Tasks 2 and 3 insert their sections ABOVE it.

- [ ] **Step 1: Write the failing unit test** — `tests/unit/migration0020.test.ts`

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0020_level_profile.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fnText = (src: string, name: string) => {
  const start = src.indexOf(`create or replace function english.${name}(`);
  return src.slice(start, src.indexOf("\n$$;", start));
};
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));

describe("0020_level_profile.sql", () => {
  it("ends by recording its own version, is expand-only and never touches schema public", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0020') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|drop\s+function/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("level_decisions and external_results are append-only, staff-read only, and nobody inserts directly", () => {
    for (const t of ["level_decisions", "external_results"]) {
      expect(code).toContain(`create table if not exists english.${t} (`);
      expect(code).toMatch(new RegExp(`create trigger ${t}_forbid_mutation\\s+before update or delete on english\\.${t}\\s+for each row execute function english\\.eng_forbid_mutation\\('learner_id'\\);`));
      expect(code).toMatch(new RegExp(`create trigger ${t}_forbid_truncate\\s+before truncate on english\\.${t}\\s+for each statement execute function english\\.eng_forbid_mutation\\(\\);`));
      expect(code).toMatch(new RegExp(`create policy ${t}_select on english\\.${t}\\s+for select to authenticated\\s+using \\(english\\.eng_is_staff_of\\(learner_id\\)\\);`));
      expect(code).toContain(`alter table english.${t} enable row level security;`);
    }
    expect(code).toContain("revoke insert, update, delete, truncate on english.level_decisions, english.external_results from public, anon, authenticated, service_role;");
    expect(code).toContain("check (decided_role = 'tutor')");
    expect(code).toContain("constraint level_decisions_adjust_reason check (kind <> 'adjust' or reason is not null)");
  });

  it("files: the kind list only grows (external_result added, nothing removed)", () => {
    expect(code).toContain("check (kind in ('assignment_pdf', 'answer_key', 'result_image', 'work_photo', 'external_result'))");
    expect(code).toContain("or kind in ('answer_key', 'work_photo', 'external_result')");
  });

  it("the purge keeps EVERY line of the 0018 version and its preview too; the two books are deleted before files", () => {
    const old18 = readFileSync(path.join(MIGRATIONS_DIR, "0018_reading_skills.sql"), "utf8");
    for (const fn of ["eng_purge_learner", "eng_purge_preview"]) {
      const now = new Set(lines(fnText(sql, fn)));
      for (const l of lines(fnText(old18, fn))) expect(now.has(l), `${fn}: ${l}`).toBe(true);
    }
    const purge = fnText(sql, "eng_purge_learner");
    expect(purge).toContain("delete from english.level_decisions ld where ld.learner_id = p_learner_id;");
    expect(purge.indexOf("delete from english.external_results er where er.learner_id = p_learner_id;")).toBeGreaterThan(0);
    expect(purge.indexOf("delete from english.external_results")).toBeLessThan(purge.indexOf("delete from english.files fl"));
    expect(purge).toContain("'level_decisions', n_level_decisions,");
    expect(purge).toContain("'external_results', n_external_results,");
    const preview = fnText(sql, "eng_purge_preview");
    expect(preview).toContain("'level_decisions', (select pg_catalog.count(*) from english.level_decisions x where x.learner_id = p_learner),");
    expect(preview).toContain("'external_results', (select pg_catalog.count(*) from english.external_results x where x.learner_id = p_learner),");
  });

  // (Tasks 2 and 3 add their tests here)
});
```

- [ ] **Step 2: Run it** — `npx vitest run tests/unit/migration0020.test.ts` → FAIL (ENOENT `0020_level_profile.sql`).

- [ ] **Step 3: Create the migration (part 1)** — run from the repo root:

```bash
cat > db/migrations/0020_level_profile.sql <<'SQL'
-- 0020_level_profile.sql
-- SM-2 · Hồ sơ cấp đang học (spec docs/superpowers/specs/2026-10-21-skill-map-levels-design.md §1 P2-a..P2-d, P4-c, §3, §5, §6):
--   1. english.level_decisions (append-only): sổ quyết định cấp từng mảng. Cấp hiện tại = dòng gần nhất của mảng; chưa có dòng nào →
--      cấp giả định của track (skill_maps.assumed — cấu hình của bản đồ, không phải dữ liệu của em).
--   2. english.external_results (append-only): mốc thi ngoài (KET/PET/FCE/CAE/CPE/đề thử vào 10/trường/khác), file kèm trong kho
--      english-work. Mốc ngoài KHÔNG tự đổi cấp.
--   3. files.kind thêm 'external_result' (nới ràng buộc: chỉ thêm, không bỏ loại nào).
--   4. Ghi: eng_record_level (baseline / adjust — CHỈ gia sư còn quan hệ hiệu lực với em; level_up để dành cho S7),
--      eng_record_external_result (gia sư hoặc phụ huynh của em).
--   5. Đọc: eng_level_profile (7 mảng + lịch sử + mốc ngoài), eng_recent_level_changes (ô "Thay đổi cấp gần đây" của phụ huynh),
--      eng_my_review_by_domain (trang chủ của em: tên điểm cần ôn + tên mảng; không cấp, không điểm, không ngày).
--   6. eng_purge_learner + eng_purge_preview thêm hai sổ mới.
-- Học sinh không đọc được hai sổ (RLS chỉ cho người lớn trong phạm vi; hàm ghi/đọc chỉ service_role). Không đụng schema public.
-- Idempotent; chỉ thêm (expand).

-- 1. Hai sổ (append-only) ------------------------------------------------------------------------------------------------------------
create table if not exists english.level_decisions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  domain_key text not null check (domain_key in ('grammar', 'vocab', 'reading', 'listening', 'writing', 'speaking', 'thinking')),
  map_id text not null references english.skill_maps(id),
  -- CEFR 9 nấc, hoặc bậc nhiệm vụ '1'..'4' cho mảng có thang task_level (thang của mảng trong bản đồ quyết định; hàm ghi kiểm).
  from_level text not null check (from_level in ('A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2', '1', '2', '3', '4')),
  to_level text not null check (to_level in ('A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2', '1', '2', '3', '4')),
  kind text not null check (kind in ('baseline', 'level_up', 'adjust')),
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 1 and 300),
  -- baseline / adjust: do hàm ghi điền ({basis, assumed_level, latest_external_result_id}); level_up (S7): bằng chứng của đề xuất.
  evidence jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(evidence) = 'object'),
  policy_version text,
  -- id của english.members, KHÔNG có khóa ngoại (xóa tài khoản không làm hỏng lịch sử).
  decided_by_member uuid not null,
  decided_role text not null check (decided_role = 'tutor'),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  decided_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id, domain_key),
  constraint level_decisions_adjust_reason check (kind <> 'adjust' or reason is not null)
);
create index if not exists level_decisions_learner_idx on english.level_decisions(learner_id, domain_key, decided_at desc);

create table if not exists english.external_results (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  exam text not null check (exam in ('KET', 'PET', 'FCE', 'CAE', 'CPE', 'VAO10_MOCK', 'SCHOOL', 'OTHER')),
  taken_on date not null,
  score_text text not null check (pg_catalog.length(pg_catalog.btrim(score_text)) between 1 and 60),
  domains text[] not null check (
    pg_catalog.cardinality(domains) between 1 and 7
    and domains <@ array['grammar', 'vocab', 'reading', 'listening', 'writing', 'speaking', 'thinking']::text[]),
  file_id uuid references english.files(id),
  note text check (note is null or pg_catalog.length(note) <= 300),
  recorded_by_member uuid not null,
  recorded_role text not null check (recorded_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create unique index if not exists external_results_file_once on english.external_results(file_id) where file_id is not null;
create index if not exists external_results_learner_idx on english.external_results(learner_id, taken_on desc, recorded_at desc);

drop trigger if exists level_decisions_forbid_mutation on english.level_decisions;
create trigger level_decisions_forbid_mutation
  before update or delete on english.level_decisions
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists level_decisions_forbid_truncate on english.level_decisions;
create trigger level_decisions_forbid_truncate
  before truncate on english.level_decisions
  for each statement execute function english.eng_forbid_mutation();
drop trigger if exists external_results_forbid_mutation on english.external_results;
create trigger external_results_forbid_mutation
  before update or delete on english.external_results
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists external_results_forbid_truncate on english.external_results;
create trigger external_results_forbid_truncate
  before truncate on english.external_results
  for each statement execute function english.eng_forbid_mutation();

-- 2. RLS: phụ huynh / gia sư trong phạm vi đọc; học sinh không bao giờ (eng_is_staff_of). Không ai ghi trực tiếp.
alter table english.level_decisions enable row level security;
alter table english.external_results enable row level security;
revoke all on english.level_decisions, english.external_results from public, anon, authenticated;
revoke insert, update, delete, truncate on english.level_decisions, english.external_results from public, anon, authenticated, service_role;
grant select on english.level_decisions, english.external_results to authenticated;
drop policy if exists level_decisions_select on english.level_decisions;
create policy level_decisions_select on english.level_decisions
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists external_results_select on english.external_results;
create policy external_results_select on english.external_results
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- 3. File phiếu điểm thi ngoài: thêm loại 'external_result' (PDF hoặc ảnh). Thay hai CHECK bằng bản rộng hơn (không bỏ loại nào).
alter table english.files drop constraint if exists files_kind_check;
alter table english.files add constraint files_kind_check
  check (kind in ('assignment_pdf', 'answer_key', 'result_image', 'work_photo', 'external_result'));
alter table english.files drop constraint if exists files_kind_mime;
alter table english.files add constraint files_kind_mime check (
  (kind = 'assignment_pdf' and mime = 'application/pdf')
  or kind in ('answer_key', 'work_photo', 'external_result')
  or (kind = 'result_image' and mime <> 'application/pdf'));

-- 6. Purge: thêm level_decisions + external_results (giữ nguyên mọi dòng của 0018; có test đối chiếu từng dòng).
SQL
sed -n '277,550p' db/migrations/0018_reading_skills.sql >> db/migrations/0020_level_profile.sql
printf '\ninsert into english.schema_migrations(version) values (%s) on conflict do nothing;\n' "'0020'" >> db/migrations/0020_level_profile.sql
```

Check that the copied block starts with `create or replace function english.eng_purge_learner(` and ends with `grant execute on function english.eng_purge_preview(uuid) to service_role;` (`sed -n '277p;550p' db/migrations/0018_reading_skills.sql`).

- [ ] **Step 4: Add the two books to the purge** — five exact replacements in `db/migrations/0020_level_profile.sql` (each `old` occurs once):

1. `  n_reading_reports int := 0;` →
```sql
  n_reading_reports int := 0;
  n_level_decisions int := 0;
  n_external_results int := 0;
```
2. `  get diagnostics n_results = row_count;` →
```sql
  get diagnostics n_results = row_count;

  -- SM-2: sổ quyết định cấp và mốc thi ngoài (external_results trỏ tới files → xóa TRƯỚC files). File thật: deleteLearnerFolder.
  delete from english.level_decisions ld where ld.learner_id = p_learner_id;
  get diagnostics n_level_decisions = row_count;

  delete from english.external_results er where er.learner_id = p_learner_id;
  get diagnostics n_external_results = row_count;
```
3. `      'reading_reports', n_reading_reports,` →
```sql
      'reading_reports', n_reading_reports,
      'level_decisions', n_level_decisions,
      'external_results', n_external_results,
```
4. `      'reading_reports', (select pg_catalog.count(*) from english.reading_reports x where x.learner_id = p_learner),` →
```sql
      'reading_reports', (select pg_catalog.count(*) from english.reading_reports x where x.learner_id = p_learner),
      'level_decisions', (select pg_catalog.count(*) from english.level_decisions x where x.learner_id = p_learner),
      'external_results', (select pg_catalog.count(*) from english.external_results x where x.learner_id = p_learner),
```
5. `-- Đếm trước khi xóa: thêm reading_reports (giữ nguyên mọi dòng của 0017).` → `-- Đếm trước khi xóa: thêm level_decisions + external_results (giữ nguyên mọi dòng của 0018).`

- [ ] **Step 5: Run the unit test** — `npx vitest run tests/unit/migration0020.test.ts` → PASS (4 tests).

- [ ] **Step 6: Write the failing DB test** — `tests/db/levelProfile.test.ts` (Tasks 2 and 3 replace the marker comment at the end with their sections)

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayVn } from "../../lib/inquiries/dates";
import { asCommit, createAuthUser, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** SM-2 (migration 0020): level decisions, external results, the profile and the student's review list. One database for the file. */
describe("SM-2 level profile (migration 0020)", () => {
  let db: TestDb;
  let s: Seeded;
  let oldTutor: string;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const TODAY = todayVn();
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const n = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  /** A throwaway child in the test family, with Nguyên's tutor as its tutor (the parent is in scope through the family). */
  const newLearner = async (track: "A" | "B") => {
    const id = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, $2, $3, true, 'active') returning id",
      [s.familyId, `Em thử ${randomUUID().slice(0, 6)}`, track]))[0]!.id;
    await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'tutor')", [M().tutorNguyen, id]);
    return id;
  };
  type Rec = { ids: string[]; replayed: boolean };
  const rec = (by: string, o: { learner?: string; kind?: string; levels?: unknown; reason?: string | null; clientId?: string } = {}) =>
    svc<Rec>("select english.eng_record_level($1, $2, $3::jsonb, $4, $5, $6) as r", [
      o.learner ?? NG(), o.kind ?? "baseline", JSON.stringify(o.levels ?? { grammar: "B2" }), o.reason ?? null, by, o.clientId ?? randomUUID(),
    ]);
  const ext = (by: string, o: { learner?: string; exam?: string; takenOn?: string; score?: string; domains?: string[]; note?: string | null; file?: unknown; clientId?: string } = {}) =>
    svc<{ id: string; replayed: boolean }>("select english.eng_record_external_result($1, $2, $3::date, $4, $5::text[], $6, $7::jsonb, $8, $9) as r", [
      o.learner ?? NG(), o.exam ?? "FCE", o.takenOn ?? addDays(TODAY, -30), o.score ?? "172 · Grade B", o.domains ?? ["reading", "listening"],
      o.note ?? null, o.file === undefined ? null : JSON.stringify(o.file), by, o.clientId ?? randomUUID(),
    ]);

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    // a tutor whose relationship with Nguyên has ended
    const oldUser = await createAuthUser(db.client, "old-tutor@test.local");
    oldTutor = (await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'tutor', 'Cô cũ') returning id", [oldUser, s.familyId]))[0]!.id;
    await q1("insert into english.relationships(member_id, learner_id, relation, valid_from, valid_to) values ($1, $2, 'tutor', now() - interval '60 days', now() - interval '1 day')", [oldTutor, NG()]);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. the two books", () => {
    const insertDecision = (learner: string, over: Record<string, unknown> = {}) => {
      const v = { domain_key: "grammar", from_level: "B2", to_level: "B2", kind: "baseline", reason: null, decided_role: "tutor", client_id: randomUUID(), ...over };
      return q1(`insert into english.level_decisions(learner_id, domain_key, map_id, from_level, to_level, kind, reason, decided_by_member, decided_role, client_id)
                 values ($1, $2, 'SM-1', $3, $4, $5, $6, $7, $8, $9)`,
        [learner, v.domain_key, v.from_level, v.to_level, v.kind, v.reason, M().tutorNguyen, v.decided_role, v.client_id]);
    };
    const insertExternal = (learner: string, over: Record<string, unknown> = {}) => {
      const v = { exam: "FCE", domains: ["reading"], recorded_role: "parent", file_id: null, ...over };
      return q1(`insert into english.external_results(learner_id, exam, taken_on, score_text, domains, file_id, recorded_by_member, recorded_role, client_id)
                 values ($1, $2, $3::date, '172', $4::text[], $5, $6, $7, $8)`,
        [learner, v.exam, TODAY, v.domains, v.file_id, M().parent, v.recorded_role, randomUUID()]);
    };

    it("are append-only (no update / delete / truncate outside a purge) and service_role cannot insert directly", async () => {
      const L = await newLearner("B");
      await insertDecision(L);
      await insertExternal(L);
      for (const sql of ["update english.level_decisions set reason = 'x'", "delete from english.level_decisions", "truncate english.level_decisions",
        "update english.external_results set note = 'x'", "delete from english.external_results", "truncate english.external_results"]) {
        const err = await db.client.query(sql).then(() => null, (e: unknown) => e as { code?: string });
        expect(err?.code, sql).toBe("42501");
      }
      for (const sql of [
        "insert into english.level_decisions(learner_id, domain_key, map_id, from_level, to_level, kind, decided_by_member, decided_role, client_id) values ($1, 'vocab', 'SM-1', 'B2', 'B2', 'baseline', $2, 'tutor', 'direct-insert-1')",
        "insert into english.external_results(learner_id, exam, taken_on, score_text, domains, recorded_by_member, recorded_role, client_id) values ($1, 'PET', current_date, '150', '{reading}', $2, 'tutor', 'direct-insert-2')",
      ]) {
        const err = await asCommit(db.client, "service_role", null, (q) => q(sql, [L, M().tutorNguyen])).then(() => null, (e: unknown) => e as { code?: string });
        expect(err?.code, sql).toBe("42501");
      }
    });

    it("table checks: level values, kinds, a reason for every adjustment, tutor-only decisions, exams and domains", async () => {
      const L = await newLearner("B");
      for (const over of [{ to_level: "D1" }, { from_level: "5" }, { kind: "promote" }, { kind: "adjust", reason: null }, { reason: "   " }, { decided_role: "parent" }]) {
        await fail(insertDecision(L, over), "23514");
      }
      await insertDecision(L, { kind: "adjust", reason: "Bài gần đây tốt", domain_key: "vocab" });
      for (const over of [{ exam: "IELTS" }, { domains: [] }, { domains: ["music"] }, { recorded_role: "student" }]) {
        await fail(insertExternal(L, over), "23514");
      }
    });

    it("files accept the new kind 'external_result' as a PDF or an image; the other kinds keep their rules", async () => {
      const L = await newLearner("B");
      const file = async (kind: string, mime: string, ext: string) => {
        const id = randomUUID();
        return q1(`insert into english.files(id, family_id, learner_id, kind, path, mime, bytes, uploaded_by_member) values ($1, $2, $3, $4, $5, $6, 100, $7)`,
          [id, s.familyId, L, kind, `${s.familyId}/${L}/${id}.${ext}`, mime, M().parent]);
      };
      await file("external_result", "application/pdf", "pdf");
      await file("external_result", "image/jpeg", "jpg");
      await fail(file("result_image", "application/pdf", "pdf"), "23514");
      await fail(file("assignment_pdf", "image/png", "png"), "23514");
      await fail(file("scan", "image/png", "png"), "23514");
      expect(await n("select count(*)::int as n from pg_constraint where conrelid = 'english.files'::regclass and conname in ('files_kind_check', 'files_kind_mime')")).toBe(2);
    });

    it("the child's tutor and the parent read through RLS; the student, the other child's tutor and anon read nothing", async () => {
      await insertDecision(NG(), { client_id: "rls-ng-0001", domain_key: "speaking" });
      await insertExternal(NG());
      const count = async (user: string, t: string) =>
        (await rowsAs<{ n: number }>(db.client, "authenticated", user, `select count(*)::int as n from english.${t} where learner_id = $1`, [NG()]))[0]?.n;
      for (const t of ["level_decisions", "external_results"]) {
        expect(await count(s.users.tutorNguyen, t), t).toBeGreaterThan(0);
        expect(await count(s.users.parent, t), t).toBeGreaterThan(0);
        expect(await count(s.users.studentNguyen, t), t).toBe(0);
        expect(await count(s.users.tutorAn, t), t).toBe(0);
        expect((await q1<{ ok: boolean }>(`select has_table_privilege('anon', 'english.${t}', 'select') as ok`))[0]?.ok, t).toBe(false);
      }
    });

    it("purge: the dry run counts both books and the purge deletes them and the file row, with a matching receipt", async () => {
      const L = await newLearner("B");
      const fileId = randomUUID();
      await q1(`insert into english.files(id, family_id, learner_id, kind, path, mime, bytes, uploaded_by_member) values ($1, $2, $3, 'external_result', $4, 'application/pdf', 100, $5)`,
        [fileId, s.familyId, L, `${s.familyId}/${L}/${fileId}.pdf`, M().parent]);
      await insertDecision(L);
      await insertExternal(L, { file_id: fileId });
      const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
      expect([dry.counts.level_decisions, dry.counts.external_results, dry.counts.files]).toEqual([1, 1, 1]);
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, $2) as r", [L, s.users.parent]);
      expect(receipt.deleted).toEqual(dry.counts);
      expect(await n(`select ((select count(*) from english.level_decisions where learner_id = $1) + (select count(*) from english.external_results where learner_id = $1)
                      + (select count(*) from english.files where learner_id = $1))::int as n`, [L])).toBe(0);
    });

    it("running every migration again changes nothing", async () => {
      const before = await q1("select (select count(*) from english.level_decisions)::int as d, (select count(*) from english.external_results)::int as e");
      await migrate(db.client, true);
      expect(await q1("select (select count(*) from english.level_decisions)::int as d, (select count(*) from english.external_results)::int as e")).toEqual(before);
    });
  });

  // (Tasks 2 and 3 add their sections here)
});
```

(`rec`, `ext`, `oldTutor`, `AN` are used by Tasks 2–3; ESLint may flag them as unused until then — run lint at the end of Task 3.)

- [ ] **Step 7: Update the table lists** in `tests/db/migrations.test.ts`:
  - In "RLS is enabled on every english table": replace `"attempts", "audit_log", "catalogue_versions", "consents", "dimensions", "episodes", "error_tags", "exposure_log",` with `"attempts", "audit_log", "catalogue_versions", "consents", "dimensions", "episodes", "error_tags", "exposure_log", "external_results",`, and `"families", "files", "inquiry_instances", "inquiry_templates", "instance_item_keys", "learners", "lesson_notes", "login_names", "members",` with `"families", "files", "inquiry_instances", "inquiry_templates", "instance_item_keys", "learners", "lesson_notes", "level_decisions", "login_names", "members",`.
  - In "authenticated only has SELECT, and only on the readable tables": replace `"audit_log", "catalogue_versions", "consents", "dimensions", "episodes", "error_tags", "exposure_log", "families", "files",` with `"audit_log", "catalogue_versions", "consents", "dimensions", "episodes", "error_tags", "exposure_log", "external_results", "families", "files",`, and `"inquiry_instances", "inquiry_templates", "instance_item_keys", "learners", "lesson_notes", "members", "observations",` with `"inquiry_instances", "inquiry_templates", "instance_item_keys", "learners", "lesson_notes", "level_decisions", "members", "observations",`.

- [ ] **Step 8: Run the DB tests** — `npm run test:db -- tests/db/levelProfile.test.ts tests/db/migrations.test.ts tests/db/readingSkills.test.ts tests/db/practiceFiles.test.ts` → PASS (0018's purge tests and 0016's file tests still pass: expand).

- [ ] **Step 9: Commit**

```bash
git add db/migrations/0020_level_profile.sql tests/unit/migration0020.test.ts tests/db/levelProfile.test.ts tests/db/migrations.test.ts
git commit -m "feat(sm-2): migration 0020 part 1 - append-only level decisions and external results, file kind external_result, purge"
```

---

### Task 2: Migration 0020 part 2 — `eng_record_level`, `eng_record_external_result`

**Files:**
- Modify: `db/migrations/0020_level_profile.sql` (insert section 4 above the line `-- 6. Purge: …`)
- Test: `tests/unit/migration0020.test.ts`, `tests/db/levelProfile.test.ts`

**Interfaces:**
- Consumes: Task 1 tables; `english.eng_actor_may_manage(member, learner)` (0007: parent of the family, or tutor with an active relationship); `english.eng_register_file(family, learner, kind, {id,mime,bytes}, by)` (0016, internal); `english.eng_today_vn()` (0010); `english.skill_maps` / `skill_domains` (0019).
- Produces (service_role only):
  - `english.eng_record_level(p_learner uuid, p_kind text, p_levels jsonb, p_reason text, p_by uuid, p_client_id text) returns jsonb` → `{ids: uuid[] (ordered by domain key), replayed: boolean}`. `p_levels` = `{"grammar": "B2+", "thinking": "3"}`. Errors (tag in brackets inside the message; the handler matches it): `42501 (tutor_only)` not the child's active tutor; `22023 (level_up_reserved)`; `22023 (bad_level)` wrong kind / domain / level / shape; `22023 (reason_too_long)`; `23514 (reason_required)`; `23505 (already_confirmed)`; `23514 (needs_baseline)`; `23514 (same_level)`; `23505` client id reused for other levels; `P0002` learner or map missing.
  - `english.eng_record_external_result(p_learner uuid, p_exam text, p_taken_on date, p_score_text text, p_domains text[], p_note text, p_file jsonb, p_by uuid, p_client_id text) returns jsonb` → `{id, replayed}`. Errors: `42501` not the child's tutor or parent; `22023 (bad_exam)`, `(bad_domains)`, `(note_too_long)`, empty score; `23514 (bad_date)`; `23505` client id reused / file used twice.
  - Audit actions `level.recorded` `{kind, map_id, domains}` and `external_result.recorded` `{result_id, exam, domains, has_file}` (never the reason, score or note).

- [ ] **Step 1: Add failing unit assertions** — in `tests/unit/migration0020.test.ts` replace `  // (Tasks 2 and 3 add their tests here)` with:

```ts
  it("eng_record_level: only the child's active tutor, never level_up, reason for adjust; eng_record_external_result: tutor or parent", () => {
    const lvl = fnText(sql, "eng_record_level");
    expect(lvl).toContain("v_member.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner)");
    for (const tag of ["(tutor_only)", "(level_up_reserved)", "(reason_required)", "(already_confirmed)", "(needs_baseline)", "(same_level)", "(bad_level)"]) {
      expect(lvl, tag).toContain(tag);
    }
    expect(lvl).toContain("for update");
    const ext = fnText(sql, "eng_record_external_result");
    expect(ext).toContain("v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner)");
    expect(ext).toContain("english.eng_register_file(v_l.family_id, p_learner, 'external_result', p_file, p_by)");
    for (const sig of [
      "eng_record_level(uuid, text, jsonb, text, uuid, text)",
      "eng_record_external_result(uuid, text, date, text, text[], text, jsonb, uuid, text)",
    ]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function english.${sig} to service_role;`);
    }
  });

  // (Task 3 adds its tests here)
```

- [ ] **Step 2: Run it** — `npx vitest run tests/unit/migration0020.test.ts` → FAIL (1 test).

- [ ] **Step 3: Insert section 4** — in `db/migrations/0020_level_profile.sql`, replace the line `-- 6. Purge: thêm level_decisions + external_results (giữ nguyên mọi dòng của 0018; có test đối chiếu từng dòng).` with the block below followed by that same line:

```sql
-- 4. Ghi ------------------------------------------------------------------------------------------------------------------------------
-- Xác nhận cấp khởi điểm (baseline, 1..7 mảng một lần) hoặc điều chỉnh (adjust, đúng 1 mảng, bắt buộc lý do). CHỈ gia sư còn quan hệ
-- hiệu lực với em (kiểu D15; phụ huynh xem, không ghi). level_up không đi qua đây (S7: xác nhận đề xuất). Cấp cũ (from_level) do hàm
-- tính: dòng gần nhất của mảng, chưa có thì cấp giả định của track. Gửi lại cùng client_id + cùng nội dung = trả lại (replayed).
create or replace function english.eng_record_level(
  p_learner uuid,
  p_kind text,
  p_levels jsonb,
  p_reason text,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_map english.skill_maps%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_n int;
  v_policy text;
  v_item record;
  v_prev english.level_decisions%rowtype;
  v_from text;
  v_new jsonb;
  v_old jsonb;
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  if p_learner is null or p_kind is null or p_levels is null or p_by is null or p_client_id is null then
    raise exception 'eng_record_level: learner, kind, levels, actor and client id are required' using errcode = '22004';
  end if;
  if p_kind = 'level_up' then
    raise exception 'eng_record_level: a level-up is confirmed from a proposal, not recorded here (level_up_reserved)' using errcode = '22023';
  end if;
  if p_kind not in ('baseline', 'adjust') then
    raise exception 'eng_record_level: kind must be baseline or adjust (bad_level)' using errcode = '22023';
  end if;
  -- Khóa dòng em: hai lần ghi cùng lúc xếp hàng (một mảng không thể được xác nhận hai lần).
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_record_level: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_record_level: only a tutor of this learner records levels (tutor_only)' using errcode = '42501';
  end if;
  if v_reason is not null and pg_catalog.length(v_reason) > 300 then
    raise exception 'eng_record_level: the reason is too long (reason_too_long)' using errcode = '22023';
  end if;
  if p_kind = 'adjust' and v_reason is null then
    raise exception 'eng_record_level: an adjustment needs a reason (reason_required)' using errcode = '23514';
  end if;
  if pg_catalog.jsonb_typeof(p_levels) <> 'object' then
    raise exception 'eng_record_level: levels must be {domain: level} (bad_level)' using errcode = '22023';
  end if;
  select pg_catalog.count(*)::int into v_n from pg_catalog.jsonb_object_keys(p_levels);
  if v_n not between 1 and 7 or (p_kind = 'adjust' and v_n <> 1) then
    raise exception 'eng_record_level: a baseline names 1 to 7 domains, an adjustment exactly one (bad_level)' using errcode = '22023';
  end if;
  select * into v_map from english.skill_maps m where m.published_at is not null order by m.published_at desc, m.id desc limit 1;
  if not found then
    raise exception 'eng_record_level: no published skill map' using errcode = 'P0002';
  end if;
  -- Mỗi khóa là một mảng của bản đồ; mỗi giá trị là một nấc của THANG CỦA MẢNG ĐÓ.
  if exists (
    select 1 from pg_catalog.jsonb_each(p_levels) x
    left join english.skill_domains d on d.map_id = v_map.id and d.key = x.key
    where d.key is null
       or pg_catalog.jsonb_typeof(x.value) <> 'string'
       or (d.scale = 'cefr' and (x.value #>> '{}') not in ('A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2'))
       or (d.scale = 'task_level' and (x.value #>> '{}') not in ('1', '2', '3', '4'))) then
    raise exception 'eng_record_level: each domain needs a level of its own scale (bad_level)' using errcode = '22023';
  end if;

  -- Gửi lại (mạng chập chờn): cùng client_id + cùng nội dung + cùng người → trả lại các dòng cũ.
  select pg_catalog.jsonb_object_agg(x.key, x.value #>> '{}') into v_new from pg_catalog.jsonb_each(p_levels) x;
  if exists (select 1 from english.level_decisions d where d.learner_id = p_learner and d.client_id = p_client_id) then
    select pg_catalog.jsonb_object_agg(d.domain_key, d.to_level) into v_old
    from english.level_decisions d where d.learner_id = p_learner and d.client_id = p_client_id;
    if v_old = v_new and not exists (
      select 1 from english.level_decisions d
      where d.learner_id = p_learner and d.client_id = p_client_id
        and (d.kind <> p_kind or d.decided_by_member <> p_by or d.reason is distinct from v_reason)) then
      return pg_catalog.jsonb_build_object(
        'ids', (select pg_catalog.jsonb_agg(d.id order by d.domain_key) from english.level_decisions d where d.learner_id = p_learner and d.client_id = p_client_id),
        'replayed', true);
    end if;
    raise exception 'eng_record_level: this client id was already used for other levels' using errcode = '23505';
  end if;

  -- Chính sách đánh giá của bộ kỹ năng hiện tại của em (để S7 đọc lại; NULL nếu em chưa có bộ kỹ năng).
  select c.assessment_policy_version into v_policy
  from english.target_sets ts
  join english.target_set_definitions d on d.id = ts.definition_id
  join english.catalogue_versions c on c.version = d.catalogue_version
  where ts.learner_id = p_learner
  order by ts.effective_from desc, ts.seq desc
  limit 1;

  for v_item in select x.key, x.value #>> '{}' as lvl from pg_catalog.jsonb_each(p_levels) x order by x.key loop
    select * into v_prev from english.level_decisions d
    where d.learner_id = p_learner and d.domain_key = v_item.key
    order by d.decided_at desc, d.id desc
    limit 1;
    if p_kind = 'baseline' and v_prev.id is not null then
      raise exception 'eng_record_level: this domain was already confirmed; adjust it instead (already_confirmed)' using errcode = '23505';
    end if;
    if p_kind = 'adjust' and v_prev.id is null then
      raise exception 'eng_record_level: confirm the starting level of this domain first (needs_baseline)' using errcode = '23514';
    end if;
    v_from := coalesce(v_prev.to_level, v_map.assumed -> v_l.track_id ->> v_item.key);
    if v_from is null then
      raise exception 'eng_record_level: the map has no assumed level for this track' using errcode = 'P0002';
    end if;
    if p_kind = 'adjust' and v_from = v_item.lvl then
      raise exception 'eng_record_level: the new level is the current one (same_level)' using errcode = '23514';
    end if;
    insert into english.level_decisions(learner_id, domain_key, map_id, from_level, to_level, kind, reason, evidence, policy_version,
                                        decided_by_member, decided_role, client_id)
    values (p_learner, v_item.key, v_map.id, v_from, v_item.lvl, p_kind, v_reason,
            pg_catalog.jsonb_build_object(
              'basis', 'tutor_judgement',
              'assumed_level', v_map.assumed -> v_l.track_id ->> v_item.key,
              'latest_external_result_id', (
                select e.id from english.external_results e
                where e.learner_id = p_learner and v_item.key = any (e.domains)
                order by e.taken_on desc, e.recorded_at desc limit 1)),
            v_policy, p_by, 'tutor', p_client_id)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'level.recorded', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('kind', p_kind, 'map_id', v_map.id,
                                        'domains', (select pg_catalog.jsonb_agg(k order by k) from pg_catalog.jsonb_object_keys(p_levels) k)));
  return pg_catalog.jsonb_build_object('ids', pg_catalog.to_jsonb(v_ids), 'replayed', false);
end
$$;

-- Một kết quả thi ngoài (gia sư hoặc phụ huynh của em). File kèm (nếu có) đã được máy chủ kiểm có thật trong kho trước khi gọi;
-- hàm ghi dòng files loại 'external_result' (đường dẫn tính từ id). Mốc ngoài KHÔNG đổi cấp.
create or replace function english.eng_record_external_result(
  p_learner uuid,
  p_exam text,
  p_taken_on date,
  p_score_text text,
  p_domains text[],
  p_note text,
  p_file jsonb,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_today date := english.eng_today_vn();
  v_score text := pg_catalog.btrim(coalesce(p_score_text, ''));
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_domains text[];
  v_has_file boolean := p_file is not null and p_file <> 'null'::jsonb;
  v_old english.external_results%rowtype;
  v_file uuid;
  v_id uuid;
begin
  if p_learner is null or p_exam is null or p_taken_on is null or p_domains is null or p_by is null or p_client_id is null then
    raise exception 'eng_record_external_result: learner, exam, date, domains, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_record_external_result: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_record_external_result: this member may not record results for this learner' using errcode = '42501';
  end if;
  if p_exam not in ('KET', 'PET', 'FCE', 'CAE', 'CPE', 'VAO10_MOCK', 'SCHOOL', 'OTHER') then
    raise exception 'eng_record_external_result: unknown exam (bad_exam)' using errcode = '22023';
  end if;
  if p_taken_on > v_today or p_taken_on < v_today - 3660 then
    raise exception 'eng_record_external_result: the date must be today or earlier, within 10 years (bad_date)' using errcode = '23514';
  end if;
  if pg_catalog.length(v_score) not between 1 and 60 then
    raise exception 'eng_record_external_result: the score must be 1 to 60 characters' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 300 then
    raise exception 'eng_record_external_result: the note is too long (note_too_long)' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(p_domains) = 0 or exists (
    select 1 from unnest(p_domains) d
    where d is null or d not in ('grammar', 'vocab', 'reading', 'listening', 'writing', 'speaking', 'thinking')) then
    raise exception 'eng_record_external_result: name 1 to 7 known domains (bad_domains)' using errcode = '22023';
  end if;
  v_domains := array(select distinct d from unnest(p_domains) d order by d);

  select * into v_old from english.external_results e where e.learner_id = p_learner and e.client_id = p_client_id;
  if found then
    if v_old.exam = p_exam and v_old.taken_on = p_taken_on and v_old.score_text = v_score and v_old.domains = v_domains
       and v_old.note is not distinct from v_note and v_old.recorded_by_member = p_by
       and v_old.file_id::text is not distinct from (case when v_has_file then pg_catalog.lower(p_file ->> 'id') end) then
      return pg_catalog.jsonb_build_object('id', v_old.id, 'replayed', true);
    end if;
    raise exception 'eng_record_external_result: this client id was already used for another result' using errcode = '23505';
  end if;

  if v_has_file then
    v_file := english.eng_register_file(v_l.family_id, p_learner, 'external_result', p_file, p_by);
  end if;
  insert into english.external_results(learner_id, exam, taken_on, score_text, domains, file_id, note, recorded_by_member, recorded_role, client_id)
  values (p_learner, p_exam, p_taken_on, v_score, v_domains, v_file, v_note, p_by, v_member.role, p_client_id)
  returning id into v_id;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'external_result.recorded', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('result_id', v_id, 'exam', p_exam, 'domains', pg_catalog.to_jsonb(v_domains), 'has_file', v_file is not null));
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

revoke execute on function english.eng_record_level(uuid, text, jsonb, text, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_record_level(uuid, text, jsonb, text, uuid, text) to service_role;
revoke execute on function english.eng_record_external_result(uuid, text, date, text, text[], text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_record_external_result(uuid, text, date, text, text[], text, jsonb, uuid, text) to service_role;

```

- [ ] **Step 4: Run the unit test** — `npx vitest run tests/unit/migration0020.test.ts` → PASS (5 tests).

- [ ] **Step 5: Add DB tests** — in `tests/db/levelProfile.test.ts` replace `  // (Tasks 2 and 3 add their sections here)` with:

```ts
  describe("2. recording levels", () => {
    it("the child's tutor confirms several starting levels at once; 'from' is the track's assumed level; replay returns the same rows", async () => {
      const L = await newLearner("B");
      const r = await rec(M().tutorNguyen, { learner: L, levels: { thinking: "3", grammar: "B2+", reading: "B2" }, reason: "Buổi đầu", clientId: "lvl-base-0001" });
      expect([r.ids.length, r.replayed]).toEqual([3, false]);
      expect(await q1("select domain_key, from_level, to_level, kind, reason, decided_role, map_id from english.level_decisions where learner_id = $1 order by domain_key", [L])).toEqual([
        { domain_key: "grammar", from_level: "B2", to_level: "B2+", kind: "baseline", reason: "Buổi đầu", decided_role: "tutor", map_id: "SM-1" },
        { domain_key: "reading", from_level: "B2", to_level: "B2", kind: "baseline", reason: "Buổi đầu", decided_role: "tutor", map_id: "SM-1" },
        { domain_key: "thinking", from_level: "2", to_level: "3", kind: "baseline", reason: "Buổi đầu", decided_role: "tutor", map_id: "SM-1" },
      ]);
      expect(await rec(M().tutorNguyen, { learner: L, levels: { grammar: "B2+", reading: "B2", thinking: "3" }, reason: "Buổi đầu", clientId: "lvl-base-0001" })).toEqual({ ids: r.ids, replayed: true });
      await fail(rec(M().tutorNguyen, { learner: L, levels: { grammar: "C1", reading: "B2", thinking: "3" }, reason: "Buổi đầu", clientId: "lvl-base-0001" }), "23505");
      expect((await q1<{ evidence: unknown; policy_version: string | null }>("select evidence, policy_version from english.level_decisions where learner_id = $1 and domain_key = 'grammar'", [L]))[0])
        .toEqual({ evidence: { basis: "tutor_judgement", assumed_level: "B2", latest_external_result_id: null }, policy_version: null });
      // a child with a skill set records the policy of that set
      await rec(M().tutorNguyen, { levels: { grammar: "B2" } });
      expect((await q1<{ p: string }>("select policy_version as p from english.level_decisions where learner_id = $1 and domain_key = 'grammar'", [NG()]))[0]?.p).toBe("AP-0.2-pilot");
    });

    it("baseline once per domain; adjust needs a baseline, one domain, a different level and a reason; going down is allowed", async () => {
      const L = await newLearner("B");
      await rec(M().tutorNguyen, { learner: L, levels: { grammar: "B2+" } });
      await fail(rec(M().tutorNguyen, { learner: L, levels: { grammar: "B2" } }), "23505", /\(already_confirmed\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { listening: "B1+" }, reason: "Nghe còn yếu" }), "23514", /\(needs_baseline\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B2" } }), "23514", /\(reason_required\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B2" }, reason: "   " }), "23514", /\(reason_required\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B2", vocab: "B2" }, reason: "x" }), "22023", /\(bad_level\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B2+" }, reason: "x" }), "23514", /\(same_level\)/);
      await rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B2" }, reason: "Bài viết gần đây còn nhiều lỗi thì" });
      expect(await q1("select from_level, to_level, kind, reason from english.level_decisions where learner_id = $1 and domain_key = 'grammar' order by decided_at", [L])).toEqual([
        { from_level: "B2", to_level: "B2+", kind: "baseline", reason: null },
        { from_level: "B2+", to_level: "B2", kind: "adjust", reason: "Bài viết gần đây còn nhiều lỗi thì" },
      ]);
    });

    it("each level must fit its domain's scale; unknown domains, level_up, other kinds and long reasons are refused", async () => {
      const L = await newLearner("A");
      for (const levels of [{ thinking: "B1" }, { grammar: "3" }, { grammar: "B3" }, { music: "B1" }, {}, { grammar: 2 }, ["grammar"]]) {
        await fail(rec(M().tutorNguyen, { learner: L, levels }), "22023", /\(bad_level\)/);
      }
      await fail(rec(M().tutorNguyen, { learner: L, kind: "level_up", levels: { grammar: "B1" } }), "22023", /\(level_up_reserved\)/);
      await fail(rec(M().tutorNguyen, { learner: L, kind: "promote", levels: { grammar: "B1" } }), "22023");
      await fail(rec(M().tutorNguyen, { learner: L, levels: { grammar: "A2" }, reason: "x".repeat(301) }), "22023", /\(reason_too_long\)/);
      expect(await n("select count(*)::int as n from english.level_decisions where learner_id = $1", [L])).toBe(0);
    });

    it("only a tutor with an active relationship: the parent, the other child's tutor, a past tutor, the student and strangers are refused", async () => {
      for (const by of [M().parent, M().tutorAn, oldTutor, M().studentNguyen, randomUUID()]) {
        await fail(rec(by, { levels: { vocab: "B2" } }), "42501", /\(tutor_only\)/);
      }
      await fail(rec(M().tutorNguyen, { learner: randomUUID(), levels: { vocab: "B2" } }), "P0002");
    });

    it("writes an audit row without the reason", async () => {
      const L = await newLearner("B");
      await rec(M().tutorNguyen, { learner: L, levels: { writing: "B1+" }, reason: "Chi tiết riêng tư" });
      const log = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'level.recorded' and learner_id = $1", [L]);
      expect(log[0]?.payload).toEqual({ kind: "baseline", map_id: "SM-1", domains: ["writing"] });
    });
  });

  describe("3. recording external results", () => {
    it("the parent or the tutor records one, with or without a file; replay returns it; a reused client id or file is refused", async () => {
      const a = await ext(M().parent, { clientId: "ext-0000-0001", domains: ["reading", "listening", "reading"] });
      expect(a.replayed).toBe(false);
      expect(await ext(M().parent, { clientId: "ext-0000-0001", domains: ["listening", "reading"] })).toEqual({ id: a.id, replayed: true });
      await fail(ext(M().parent, { clientId: "ext-0000-0001", score: "180" }), "23505");
      expect((await q1("select exam, score_text, domains, recorded_role, file_id from english.external_results where id = $1", [a.id]))[0])
        .toEqual({ exam: "FCE", score_text: "172 · Grade B", domains: ["listening", "reading"], recorded_role: "parent", file_id: null });
      const fileId = randomUUID();
      const b = await ext(M().tutorNguyen, { exam: "VAO10_MOCK", score: "8,5/10", domains: ["grammar"], file: { id: fileId, mime: "application/pdf", bytes: 2048 } });
      expect((await q1("select kind, path, learner_id from english.files where id = $1", [fileId]))[0]).toEqual({
        kind: "external_result", path: `${s.familyId}/${NG()}/${fileId}.pdf`, learner_id: NG(),
      });
      expect((await q1<{ f: string }>("select file_id::text as f from english.external_results where id = $1", [b.id]))[0]?.f).toBe(fileId);
      await fail(ext(M().tutorNguyen, { file: { id: fileId, mime: "application/pdf", bytes: 2048 } }), "23505");
    });

    it("refuses a future or very old date, unknown exams and domains, an empty score, a long note, and members outside the child", async () => {
      await fail(ext(M().parent, { takenOn: addDays(TODAY, 1) }), "23514", /\(bad_date\)/);
      await fail(ext(M().parent, { takenOn: addDays(TODAY, -3700) }), "23514", /\(bad_date\)/);
      await fail(ext(M().parent, { exam: "IELTS" }), "22023", /\(bad_exam\)/);
      await fail(ext(M().parent, { domains: [] }), "22023", /\(bad_domains\)/);
      await fail(ext(M().parent, { domains: ["music"] }), "22023", /\(bad_domains\)/);
      await fail(ext(M().parent, { score: "   " }), "22023");
      await fail(ext(M().parent, { note: "n".repeat(301) }), "22023", /\(note_too_long\)/);
      for (const by of [M().tutorAn, oldTutor, M().studentNguyen, randomUUID()]) await fail(ext(by), "42501");
    });

    it("the audit row names the kind of result, never the score or the note; both write functions are service_role only", async () => {
      const r = await ext(M().parent, { note: "Riêng tư" });
      const log = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'external_result.recorded' and payload ->> 'result_id' = $1", [r.id]);
      expect(Object.keys(log[0]!.payload).sort()).toEqual(["domains", "exam", "has_file", "result_id"]);
      const acl = await q1<{ proname: string; anon: boolean; auth: boolean; svc: boolean }>(`
        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
               has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'english' and p.proname in ('eng_record_level', 'eng_record_external_result')`);
      expect(acl).toHaveLength(2);
      for (const a of acl) expect([a.anon, a.auth, a.svc], a.proname).toEqual([false, false, true]);
    });
  });

  // (Task 3 adds its sections here)
```

- [ ] **Step 6: Run** — `npm run test:db -- tests/db/levelProfile.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0020_level_profile.sql tests/unit/migration0020.test.ts tests/db/levelProfile.test.ts
git commit -m "feat(sm-2): migration 0020 part 2 - eng_record_level (tutor only, baseline/adjust) and eng_record_external_result"
```

---

### Task 3: Migration 0020 part 3 — `eng_level_profile`, `eng_recent_level_changes`, `eng_my_review_by_domain`

**Files:**
- Modify: `db/migrations/0020_level_profile.sql` (insert section 5 above `-- 6. Purge: …`)
- Test: `tests/unit/migration0020.test.ts`, `tests/db/levelProfile.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `english.eng_weak_points(learner, since)` (0014: `tags[]` worst first, each with `tag_key`, `label_vi`, `recheck_due`); `english.eng_current_skill_map()` (0019, internal); `english.reading_reports` (0018).
- Produces:
  - `english.eng_level_profile(p_learner uuid) returns jsonb` (service_role) → `{map_id, track_id, domains: [7 × {key, name_vi, scale, ord, assumed_level, current_level, status: 'assumed'|'confirmed', last_kind, decided_at, decided_by_name, external: {id, exam, taken_on, score_text} | null}], history: [≤ 30 × {id, domain_key, from_level, to_level, kind, reason, decided_at, decided_by_name}], external_results: [≤ 30 × {id, exam, taken_on, score_text, domains, note, file_id, recorded_by_name, recorded_role, recorded_at}], reading_reports: [≤ 6 × {month, skills}]}`. Task levels are strings (`"2"`). No reading-report source anywhere.
  - `english.eng_recent_level_changes(p_learner uuid, p_days int) returns jsonb` (service_role) → `{changes: [≤ 10 × {id, domain_key, domain_name, scale, from_level, to_level, kind, reason, decided_at, decided_by_name}]}`, newest first, `p_days` clamped to 1..365.
  - `english.eng_my_review_by_domain() returns jsonb` (authenticated only; caller = a student with a learner) → `{items: [≤ 3 × {domain_key, domain_name, label}]}` from tags whose re-check is due, worst first; `domain_key` / `domain_name` null for a tag without a group in the map. Anyone else → `{items: []}`.

- [ ] **Step 1: Add failing unit assertions** — in `tests/unit/migration0020.test.ts` replace `  // (Task 3 adds its tests here)` with:

```ts
  it("every function pins search_path and is security definer; staff reads are service_role only, the student's read authenticated only", () => {
    for (const m of code.matchAll(/create or replace function english\.(\w+)\(([\s\S]*?)\n\$\$;/g)) {
      expect(m[0], `${m[1]} search_path`).toMatch(/set search_path = ''/);
      expect(m[0], `${m[1]} security definer`).toMatch(/security definer/);
    }
    for (const sig of ["eng_level_profile(uuid)", "eng_recent_level_changes(uuid, int)", "eng_purge_learner(uuid, uuid)", "eng_purge_preview(uuid)"]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function english.${sig} to service_role;`);
    }
    expect(code).toContain("revoke execute on function english.eng_my_review_by_domain() from public, anon, service_role;");
    expect(code).toContain("grant execute on function english.eng_my_review_by_domain() to authenticated;");
  });

  it("the student's review list returns only a label and a domain, at most 3, and finds the student by auth.uid()", () => {
    const f = fnText(sql, "eng_my_review_by_domain");
    expect(f).toContain("where m.user_id = auth.uid() and m.role = 'student'");
    expect(f).toContain("pg_catalog.jsonb_build_object('domain_key', p.domain_key, 'domain_name', p.domain_name, 'label', p.label)");
    expect(f).toContain("limit 3");
    expect(f).not.toMatch(/to_level|score|'sources'|last_seen|recheck_due_on/);
  });

  it("the profile never returns the source of a reading report", () => {
    expect(fnText(sql, "eng_level_profile")).not.toMatch(/'source'|\.source\b/);
  });
```

- [ ] **Step 2: Run it** — `npx vitest run tests/unit/migration0020.test.ts` → FAIL (3 tests).

- [ ] **Step 3: Insert section 5** — in `db/migrations/0020_level_profile.sql`, replace the line `-- 6. Purge: thêm level_decisions + external_results (giữ nguyên mọi dòng của 0018; có test đối chiếu từng dòng).` with the block below followed by that same line:

```sql
-- 5. Đọc ------------------------------------------------------------------------------------------------------------------------------
-- Hồ sơ cấp của một em (gia sư / phụ huynh; máy chủ gọi sau requireAccess). Cấp hiện tại = dòng gần nhất của mảng, chưa có thì cấp giả
-- định của track (status 'assumed'). Báo cáo kỹ năng đọc tháng hiện như mốc ngoài của mảng Đọc: chỉ tháng + số kỹ năng, KHÔNG tên nguồn.
create or replace function english.eng_level_profile(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_map english.skill_maps%rowtype;
begin
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_level_profile: learner not found' using errcode = 'P0002';
  end if;
  select * into v_map from english.skill_maps m where m.published_at is not null order by m.published_at desc, m.id desc limit 1;
  if not found then
    raise exception 'eng_level_profile: no published skill map' using errcode = 'P0002';
  end if;

  return (
    with latest as (
      select distinct on (d.domain_key) d.*
      from english.level_decisions d
      where d.learner_id = p_learner
      order by d.domain_key, d.decided_at desc, d.id desc
    ),
    ext as (
      select distinct on (x.dk) x.dk, e.id, e.exam, e.taken_on, e.score_text
      from english.external_results e
      cross join lateral unnest(e.domains) as x(dk)
      where e.learner_id = p_learner
      order by x.dk, e.taken_on desc, e.recorded_at desc
    )
    select pg_catalog.jsonb_build_object(
      'map_id', v_map.id,
      'track_id', v_l.track_id,
      'domains', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'key', dm.key, 'name_vi', dm.name_vi, 'scale', dm.scale, 'ord', dm.ord,
            'assumed_level', v_map.assumed -> v_l.track_id ->> dm.key,
            'current_level', coalesce(lt.to_level, v_map.assumed -> v_l.track_id ->> dm.key),
            'status', case when lt.id is null then 'assumed' else 'confirmed' end,
            'last_kind', lt.kind,
            'decided_at', lt.decided_at,
            'decided_by_name', mb.display_name,
            'external', case when ex.id is null then null
                             else pg_catalog.jsonb_build_object('id', ex.id, 'exam', ex.exam, 'taken_on', ex.taken_on, 'score_text', ex.score_text) end)
          order by dm.ord)
        from english.skill_domains dm
        left join latest lt on lt.domain_key = dm.key
        left join english.members mb on mb.id = lt.decided_by_member
        left join ext ex on ex.dk = dm.key
        where dm.map_id = v_map.id),
      'history', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', h.id, 'domain_key', h.domain_key, 'from_level', h.from_level, 'to_level', h.to_level, 'kind', h.kind,
            'reason', h.reason, 'decided_at', h.decided_at, 'decided_by_name', hm.display_name)
          order by h.decided_at desc, h.id desc)
        from (select * from english.level_decisions d where d.learner_id = p_learner order by d.decided_at desc, d.id desc limit 30) h
        left join english.members hm on hm.id = h.decided_by_member), '[]'::jsonb),
      'external_results', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', e.id, 'exam', e.exam, 'taken_on', e.taken_on, 'score_text', e.score_text, 'domains', pg_catalog.to_jsonb(e.domains),
            'note', e.note, 'file_id', e.file_id, 'recorded_by_name', em.display_name, 'recorded_role', e.recorded_role, 'recorded_at', e.recorded_at)
          order by e.taken_on desc, e.recorded_at desc)
        from (select * from english.external_results x where x.learner_id = p_learner order by x.taken_on desc, x.recorded_at desc limit 30) e
        left join english.members em on em.id = e.recorded_by_member), '[]'::jsonb),
      'reading_reports', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('month', rr.month, 'skills', pg_catalog.jsonb_array_length(rr.rows))
                                    order by rr.month desc, rr.recorded_at desc)
        from (select * from english.reading_reports x
              where x.learner_id = p_learner and not exists (select 1 from english.reading_reports x2 where x2.supersedes_id = x.id)
              order by x.month desc, x.recorded_at desc limit 6) rr), '[]'::jsonb)
    )
  );
end
$$;

-- "Thay đổi cấp gần đây" (trang chủ phụ huynh): quyết định cấp của một em trong p_days ngày qua (1..365), mới nhất trước, tối đa 10.
create or replace function english.eng_recent_level_changes(p_learner uuid, p_days int) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('changes', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', d.id, 'domain_key', d.domain_key, 'domain_name', dm.name_vi, 'scale', dm.scale,
        'from_level', d.from_level, 'to_level', d.to_level, 'kind', d.kind, 'reason', d.reason,
        'decided_at', d.decided_at, 'decided_by_name', m.display_name)
      order by d.decided_at desc, d.id desc)
    from (select * from english.level_decisions x
          where x.learner_id = p_learner
            and x.decided_at >= pg_catalog.now() - pg_catalog.make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
          order by x.decided_at desc, x.id desc
          limit 10) d
    left join english.skill_domains dm on dm.map_id = d.map_id and dm.key = d.domain_key
    left join english.members m on m.id = d.decided_by_member), '[]'::jsonb))
$$;

-- "Việc cần ôn" theo mảng cho trang chủ của EM: tối đa 3 điểm đã đến hạn hỏi lại (thứ tự của "Điểm cần chú ý": nặng trước), mỗi điểm chỉ
-- tên và tên mảng. Người gọi nhận diện bằng auth.uid() (chỉ học sinh có hồ sơ); người khác nhận danh sách rỗng.
create or replace function english.eng_my_review_by_domain() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_map text;
  v_weak jsonb;
begin
  select l.* into v_l
  from english.members m
  join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if not found then
    return pg_catalog.jsonb_build_object('items', '[]'::jsonb);
  end if;
  v_map := english.eng_current_skill_map();
  v_weak := english.eng_weak_points(v_l.id, null);
  return pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('domain_key', p.domain_key, 'domain_name', p.domain_name, 'label', p.label) order by p.ord)
    from (
      select x.ord, x.tag ->> 'label_vi' as label, dm.key as domain_key, dm.name_vi as domain_name
      from pg_catalog.jsonb_array_elements(coalesce(v_weak -> 'tags', '[]'::jsonb)) with ordinality as x(tag, ord)
      left join english.error_tags et on et.track_id = v_l.track_id and et.key = x.tag ->> 'tag_key'
      left join english.skill_leaves lf on lf.map_id = v_map and lf.kind = 'tag' and lf.track_id = v_l.track_id and lf.ref_key = x.tag ->> 'tag_key'
      left join english.skill_groups g on g.map_id = v_map and g.key = coalesce(et.group_key, lf.group_key)
      left join english.skill_domains dm on dm.map_id = g.map_id and dm.key = g.domain_key
      where coalesce((x.tag ->> 'recheck_due')::boolean, false)
      order by x.ord
      limit 3
    ) p), '[]'::jsonb));
end
$$;

revoke execute on function english.eng_level_profile(uuid) from public, anon, authenticated;
grant execute on function english.eng_level_profile(uuid) to service_role;
revoke execute on function english.eng_recent_level_changes(uuid, int) from public, anon, authenticated;
grant execute on function english.eng_recent_level_changes(uuid, int) to service_role;
revoke execute on function english.eng_my_review_by_domain() from public, anon, service_role;
grant execute on function english.eng_my_review_by_domain() to authenticated;

```

(`error_tags` has a unique `(track_id, key)` index since 0014, so the join finds at most one tag; seed tags have `group_key` null and take their group from `skill_leaves`. The function owner may call the internal `eng_weak_points` / `eng_current_skill_map` even though `authenticated` may not.)

- [ ] **Step 4: Run the unit test** — `npx vitest run tests/unit/migration0020.test.ts` → PASS (8 tests).

- [ ] **Step 5: Add DB tests** — in `tests/db/levelProfile.test.ts` replace `  // (Task 3 adds its sections here)` with:

```ts
  describe("4. reading the profile", () => {
    type Dom = { key: string; current_level: string; assumed_level: string; status: string; last_kind: string | null; decided_by_name: string | null; external: { exam: string } | null };
    type Profile = {
      map_id: string; track_id: string; domains: Dom[]; history: { domain_key: string; kind: string; to_level: string }[];
      external_results: { exam: string }[]; reading_reports: { month: string; skills: number }[];
    };
    const profile = (l: string) => svc<Profile>("select english.eng_level_profile($1) as r", [l]);

    it("a new Track A child: 7 domains in map order, all assumed (A2, thinking 1), nothing in history", async () => {
      const L = await newLearner("A");
      const p = await profile(L);
      expect([p.map_id, p.track_id]).toEqual(["SM-1", "A"]);
      expect(p.domains.map((d) => [d.key, d.current_level, d.status])).toEqual([
        ["grammar", "A2", "assumed"], ["vocab", "A2", "assumed"], ["reading", "A2", "assumed"], ["listening", "A2", "assumed"],
        ["writing", "A2", "assumed"], ["speaking", "A2", "assumed"], ["thinking", "1", "assumed"],
      ]);
      expect([p.history, p.external_results, p.reading_reports]).toEqual([[], [], []]);
    });

    it("the latest decision wins; who decided; the newest external result per domain; history newest first", async () => {
      const L = await newLearner("A");
      await rec(M().tutorNguyen, { learner: L, levels: { grammar: "A2+", reading: "A2" } });
      await rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { grammar: "B1" }, reason: "Làm tốt 3 bài kiểm tra" });
      await ext(M().parent, { learner: L, exam: "KET", takenOn: addDays(TODAY, -200), domains: ["reading", "listening"] });
      await ext(M().parent, { learner: L, exam: "PET", takenOn: addDays(TODAY, -10), domains: ["reading"] });
      const p = await profile(L);
      const by = new Map(p.domains.map((d) => [d.key, d]));
      expect(by.get("grammar")).toMatchObject({ current_level: "B1", assumed_level: "A2", status: "confirmed", last_kind: "adjust", decided_by_name: "Cô của Nguyên (thử)" });
      expect(by.get("reading")).toMatchObject({ current_level: "A2", status: "confirmed", external: { exam: "PET" } });
      expect(by.get("listening")).toMatchObject({ status: "assumed", external: { exam: "KET" } });
      expect(by.get("vocab")?.external).toBeNull();
      expect(p.history.map((h) => [h.domain_key, h.kind, h.to_level])).toEqual([["grammar", "adjust", "B1"], ["reading", "baseline", "A2"], ["grammar", "baseline", "A2+"]]);
      expect(p.external_results.map((e) => e.exam)).toEqual(["PET", "KET"]);
    });

    it("current monthly reading reports appear as months only, never with their source name", async () => {
      const L = await newLearner("A");
      const month = `${TODAY.slice(0, 7)}-01`;
      await svc("select english.eng_record_reading_report($1, $2::date, null, $3::jsonb, null, null, $4, $5) as r",
        [L, month, JSON.stringify([{ tag_key: "doc-main-idea", questions: 6, correct_pct: 50 }]), M().parent, randomUUID()]);
      const p = await profile(L);
      expect(p.reading_reports).toEqual([{ month, skills: 1 }]);
      expect(JSON.stringify(p)).not.toMatch(/tomo/i);
    });

    it("recent changes: last p_days days, newest first, with the domain name and scale; older rows are left out", async () => {
      const L = await newLearner("B");
      await rec(M().tutorNguyen, { learner: L, levels: { thinking: "3" } });
      await rec(M().tutorNguyen, { learner: L, kind: "adjust", levels: { thinking: "2" }, reason: "Chưa tự lập luận được" });
      // an old decision, inserted by the owner as if made 40 days ago
      await q1(`insert into english.level_decisions(learner_id, domain_key, map_id, from_level, to_level, kind, decided_by_member, decided_role, client_id, decided_at)
                values ($1, 'grammar', 'SM-1', 'B2', 'B2', 'baseline', $2, 'tutor', 'old-decision-1', now() - interval '40 days')`, [L, M().tutorNguyen]);
      type Change = { domain_key: string; domain_name: string; scale: string; from_level: string; to_level: string; kind: string; reason: string | null };
      const r = await svc<{ changes: Change[] }>("select english.eng_recent_level_changes($1, 30) as r", [L]);
      expect(r.changes.map((c) => [c.domain_key, c.domain_name, c.scale, c.from_level, c.to_level, c.kind, c.reason])).toEqual([
        ["thinking", "Tư duy & tự học", "task_level", "3", "2", "adjust", "Chưa tự lập luận được"],
        ["thinking", "Tư duy & tự học", "task_level", "2", "3", "baseline", null],
      ]);
      expect((await svc<{ changes: unknown[] }>("select english.eng_recent_level_changes($1, 60) as r", [L])).changes).toHaveLength(3);
    });

    it("the staff reads are closed to anon and authenticated (a student calling it is refused)", async () => {
      const acl = await q1<{ proname: string; anon: boolean; auth: boolean; svc: boolean }>(`
        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
               has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'english' and p.proname in ('eng_level_profile', 'eng_recent_level_changes')`);
      expect(acl).toHaveLength(2);
      for (const a of acl) expect([a.anon, a.auth, a.svc], a.proname).toEqual([false, false, true]);
      const err = await rowsAs(db.client, "authenticated", s.users.studentNguyen, "select english.eng_level_profile($1) as r", [NG()])
        .then(() => null, (e: unknown) => e as { code?: string });
      expect(err?.code).toBe("42501");
    });
  });

  describe("5. the student's 'Việc cần ôn' by domain", () => {
    it("lists at most 3 due tags with only a label and a domain name; no level, score, count or date", async () => {
      // 4 wrong items 20 days ago, on 4 tags of 4 domains: with the 14-day policy of B-v1 all 4 are due for a re-check
      await svc("select english.eng_record_result($1, 'quick', null, 'Ôn tập tháng', 10, 6, '{1,2,3,4}', $2::jsonb, 'home', 'first', false, $3::date, null, null, $4, $5, 'test') as r", [
        NG(),
        JSON.stringify([{ n: 1, tag_key: "modal-suy-doan" }, { n: 2, tag_key: "dang-tu" }, { n: 3, tag_key: "phat-am" }, { n: 4, tag_key: "doc-inference" }]),
        addDays(TODAY, -20), M().tutorNguyen, randomUUID(),
      ]);
      const [row] = await rowsAs<{ r: { items: Record<string, unknown>[] } }>(db.client, "authenticated", s.users.studentNguyen, "select english.eng_my_review_by_domain() as r");
      const items = row!.r.items;
      expect(items).toHaveLength(3);
      const names = new Map([["grammar", "Ngữ pháp"], ["vocab", "Từ vựng"], ["speaking", "Nói"], ["reading", "Đọc"]]);
      for (const it of items) {
        expect(Object.keys(it).sort()).toEqual(["domain_key", "domain_name", "label"]);
        expect(names.get(String(it.domain_key))).toBe(it.domain_name);
      }
      expect(JSON.stringify(row)).not.toMatch(/B2|\/4|20\d\d-/);
    });

    it("a tutor, a parent or another student without due tags gets an empty list; service_role and anon cannot call it", async () => {
      for (const u of [s.users.tutorNguyen, s.users.parent, s.users.studentAn]) {
        const [row] = await rowsAs<{ r: { items: unknown[] } }>(db.client, "authenticated", u, "select english.eng_my_review_by_domain() as r");
        expect(row!.r.items, u).toEqual([]);
      }
      expect((await q1<{ s: boolean; a: boolean }>(`select has_function_privilege('service_role', 'english.eng_my_review_by_domain()', 'execute') as s,
                                                          has_function_privilege('anon', 'english.eng_my_review_by_domain()', 'execute') as a`))[0]).toEqual({ s: false, a: false });
    });
  });
```

(Track B seed tags used above sit in SM-1 as: `modal-suy-doan` → Ngữ pháp, `dang-tu` → Từ vựng, `phat-am` → Nói, `doc-inference` → Đọc. An has no tag marks in this file, so `studentAn` gets an empty list.)

- [ ] **Step 6: Run** — `npm run test:db -- tests/db/levelProfile.test.ts tests/db/migrations.test.ts tests/db/tutorWork.test.ts tests/db/readingSkills.test.ts` → PASS; then `npm run lint` → clean (every helper of the DB test is used now).

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0020_level_profile.sql tests/unit/migration0020.test.ts tests/db/levelProfile.test.ts
git commit -m "feat(sm-2): migration 0020 part 3 - level profile, recent level changes, the student's review list by domain"
```

---

### Task 4: `lib/levels` core — types, scale rules, plain-language text, parsers, copy

**Files:**
- Create: `lib/levels/types.ts`, `lib/levels/scale.ts`, `lib/levels/view.ts`, `lib/levels/shape.ts`, `tests/unit/fixtures/levels.ts`
- Modify: `lib/copy/vi.ts` (append four blocks at the end of the file)
- Test: `tests/unit/levels.test.ts`

**Interfaces:**
- Consumes: `CEFR_LEVELS`, `CefrLevel`, `DOMAIN_KEYS`, `DomainKey` (`lib/skillmap/types.ts`); `todayVn` (`lib/inquiries/dates.ts`), `formatDateVi` (`lib/inquiries/format.ts`); the JSON of Task 3.
- Produces:
  - `lib/levels/types.ts`: `EXAMS`, `type Exam`, `LEVEL_KINDS`, `type LevelKind`, `type Scale = "cefr" | "task_level"`, `REASON_MAX = 300`, `NOTE_MAX = 300`, `SCORE_MAX = 60`, `EXAM_DAYS_BACK = 3660`, `RECENT_DAYS = 30`, `RECENT_MAX = 5`, `REVIEW_MAX = 3`, `type ExternalMark`, `type DomainLevel`, `type LevelHistoryRow`, `type ExternalResultRow`, `type LevelProfile`, `type LevelChange`, `type RecentChange`, `type ReviewItem`.
  - `lib/levels/scale.ts`: `TASK_LEVELS = ["1","2","3","4"] as const`, `levelsOf(scale): readonly string[]`, `isLevelOf(scale, level): boolean`, `stepIndex(scale, level | null | undefined): number | null`, `majorIndex(scale, level | null | undefined): number | null`, `barFraction(scale, level): number`, `bandOf(scale, level): string | null`, `nearLevel(scale, current: string | null | undefined, leaf: { levelFrom: string | null; levelTo: string | null; taskFrom: number | null; taskTo: number | null }): boolean`, `strongestWeakest(domains: DomainLevel[]): { strongest: DomainLevel[]; weakest: DomainLevel[]; even: boolean }`, `currentLevels(profile: LevelProfile): Partial<Record<DomainKey, string>>`.
  - `lib/levels/view.ts`: `levelText(scale, level): string`, `profileSummary(alias, profile): string`, `domainSentence(alias, d): string`, `boxValue(list: DomainLevel[]): string`, `groupReview(items: ReviewItem[]): { name: string; labels: string[] }[]`, `monthLabel("2026-10-01") → "10/2026"`, `dayLabel(timestamp) → "22/10/2026"` (Vietnam day).
  - `lib/levels/shape.ts`: `parseLevelProfile(raw): LevelProfile`, `parseRecentChanges(raw): LevelChange[]`, `parseReviewByDomain(raw): ReviewItem[]` (strict: an extra key throws).
  - `lib/copy/vi.ts`: `levelCopy`, `levelFormCopy`, `externalCopy`, `studentReviewCopy`.
  - `tests/unit/fixtures/levels.ts`: `assumedProfile()`, `confirmedProfile()`.

- [ ] **Step 1: Write the fixture** — `tests/unit/fixtures/levels.ts`

```ts
import type { DomainLevel, LevelProfile } from "@/lib/levels/types";

const DOMAINS: Pick<DomainLevel, "key" | "name" | "scale">[] = [
  { key: "grammar", name: "Ngữ pháp", scale: "cefr" },
  { key: "vocab", name: "Từ vựng", scale: "cefr" },
  { key: "reading", name: "Đọc", scale: "cefr" },
  { key: "listening", name: "Nghe", scale: "cefr" },
  { key: "writing", name: "Viết", scale: "cefr" },
  { key: "speaking", name: "Nói", scale: "cefr" },
  { key: "thinking", name: "Tư duy & tự học", scale: "task_level" },
];

/** Nguyên (Track B) before any decision: every domain assumed B2 / bậc 2. */
export function assumedProfile(): LevelProfile {
  return {
    mapId: "SM-1",
    trackId: "B",
    domains: DOMAINS.map((d) => {
      const lv = d.scale === "cefr" ? "B2" : "2";
      return { ...d, current: lv, assumed: lv, status: "assumed", lastKind: null, decidedAt: null, decidedBy: null, external: null };
    }),
    history: [],
    externalResults: [],
    readingReports: [],
  };
}

/** After the tutor confirmed reading B2+ and writing B2 then adjusted writing to B1+, with one FCE result and one reading report. */
export function confirmedProfile(): LevelProfile {
  const p = assumedProfile();
  const set = (key: string, over: Partial<DomainLevel>) => {
    p.domains = p.domains.map((d) => (d.key === key ? { ...d, ...over } : d));
  };
  set("reading", {
    current: "B2+", status: "confirmed", lastKind: "baseline", decidedAt: "2026-10-21T03:00:00+00:00", decidedBy: "Cô Lan",
    external: { id: "e1", exam: "FCE", takenOn: "2026-09-12", scoreText: "172 · Grade B" },
  });
  set("writing", { current: "B1+", status: "confirmed", lastKind: "adjust", decidedAt: "2026-10-22T03:00:00+00:00", decidedBy: "Cô Lan" });
  p.history = [
    { id: "h3", domainKey: "writing", from: "B2", to: "B1+", kind: "adjust", reason: "Bài luận còn thiếu liên kết", decidedAt: "2026-10-22T03:00:00+00:00", decidedBy: "Cô Lan" },
    { id: "h2", domainKey: "writing", from: "B2", to: "B2", kind: "baseline", reason: null, decidedAt: "2026-10-21T03:00:01+00:00", decidedBy: "Cô Lan" },
    { id: "h1", domainKey: "reading", from: "B2", to: "B2+", kind: "baseline", reason: null, decidedAt: "2026-10-21T03:00:00+00:00", decidedBy: "Cô Lan" },
  ];
  p.externalResults = [
    {
      id: "e1", exam: "FCE", takenOn: "2026-09-12", scoreText: "172 · Grade B", domains: ["listening", "reading"], note: null,
      fileId: "f0000000-0000-4000-8000-000000000001", recordedBy: "Phụ huynh", recordedRole: "parent", recordedAt: "2026-09-13T01:00:00+00:00",
    },
  ];
  p.readingReports = [{ month: "2026-10-01", skills: 14 }];
  return p;
}
```

- [ ] **Step 2: Write the failing test** — `tests/unit/levels.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { externalCopy, levelCopy, levelFormCopy, studentReviewCopy } from "@/lib/copy/vi";
import { barFraction, bandOf, currentLevels, isLevelOf, levelsOf, majorIndex, nearLevel, stepIndex, strongestWeakest } from "@/lib/levels/scale";
import { parseLevelProfile, parseRecentChanges, parseReviewByDomain } from "@/lib/levels/shape";
import { boxValue, dayLabel, domainSentence, groupReview, levelText, monthLabel, profileSummary } from "@/lib/levels/view";
import { assumedProfile, confirmedProfile } from "./fixtures/levels";

const leaf = (over: Partial<{ levelFrom: string | null; levelTo: string | null; taskFrom: number | null; taskTo: number | null }> = {}) => ({
  levelFrom: null, levelTo: null, taskFrom: null, taskTo: null, ...over,
});

describe("scale (P2-b, P4-c)", () => {
  it("knows the two scales and positions on them", () => {
    expect(levelsOf("cefr")).toEqual(["A1", "A2", "A2+", "B1", "B1+", "B2", "B2+", "C1", "C2"]);
    expect(levelsOf("task_level")).toEqual(["1", "2", "3", "4"]);
    expect([isLevelOf("cefr", "B1+"), isLevelOf("cefr", "3"), isLevelOf("task_level", "3"), isLevelOf("task_level", "B1")]).toEqual([true, false, true, false]);
    expect([stepIndex("cefr", "A1"), stepIndex("cefr", "C2"), stepIndex("task_level", "2"), stepIndex("cefr", "D1"), stepIndex("cefr", null)]).toEqual([0, 8, 1, null, null]);
    expect(["A1", "A2", "A2+", "B1", "B1+", "B2", "B2+", "C1", "C2"].map((l) => majorIndex("cefr", l))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5]);
    expect(majorIndex("task_level", "4")).toBe(3);
  });

  it("bar length and level band follow the domain's own scale", () => {
    expect([barFraction("cefr", "A1"), barFraction("cefr", "C2"), barFraction("task_level", "2"), barFraction("task_level", "4")]).toEqual([1 / 9, 1, 0.5, 1]);
    expect(["A2+", "B1+", "B2", "C2"].map((l) => bandOf("cefr", l))).toEqual(["A1-A2", "B1", "B2", "C1-C2"]);
    expect(["1", "2", "3", "4"].map((l) => bandOf("task_level", l))).toEqual(["low", "low", "high", "high"]);
    expect(bandOf("cefr", "X")).toBeNull();
  });

  it("near = within the current level ± 1 CEFR level (or ± 1 task level); no level known or no leaf level → near (D1)", () => {
    expect(nearLevel("cefr", "A2", leaf({ levelFrom: "B1", levelTo: "B1+" }))).toBe(true); // one level above
    expect(nearLevel("cefr", "A2", leaf({ levelFrom: "B2", levelTo: "B2" }))).toBe(false);
    expect(nearLevel("cefr", "B2", leaf({ levelFrom: "A2", levelTo: "A2+" }))).toBe(false);
    expect(nearLevel("cefr", "B2", leaf({ levelFrom: "A2", levelTo: "B1" }))).toBe(true); // range reaches B1
    expect(nearLevel("cefr", "B2", leaf({ levelFrom: "C1", levelTo: "C2" }))).toBe(true);
    expect(nearLevel("cefr", "A2", leaf({ levelFrom: "C2", levelTo: "C2" }))).toBe(false);
    expect(nearLevel("task_level", "2", leaf({ taskFrom: 3, taskTo: 3 }))).toBe(true);
    expect(nearLevel("task_level", "2", leaf({ taskFrom: 4, taskTo: 4 }))).toBe(false);
    expect(nearLevel("cefr", undefined, leaf({ levelFrom: "C2", levelTo: "C2" }))).toBe(true);
    expect(nearLevel("cefr", "B2", leaf())).toBe(true);
  });

  it("strongest / weakest compare the 6 CEFR domains only; all equal → even (D4)", () => {
    expect(strongestWeakest(assumedProfile().domains)).toEqual({ strongest: [], weakest: [], even: true });
    const p = confirmedProfile();
    p.domains = p.domains.map((d) => (d.key === "thinking" ? { ...d, current: "4" } : d));
    const r = strongestWeakest(p.domains);
    expect([r.strongest.map((d) => d.key), r.weakest.map((d) => d.key), r.even]).toEqual([["reading"], ["writing"], false]);
    expect(currentLevels(confirmedProfile())).toMatchObject({ reading: "B2+", writing: "B1+", grammar: "B2", thinking: "2" });
  });
});

describe("plain-language text (never 'đạt' for a level)", () => {
  it("summary, one sentence per domain, box values, labels", () => {
    expect(profileSummary("Nguyên", assumedProfile())).toBe(
      `${levelCopy.summaryRange("Nguyên", "B2", "B2")} ${levelCopy.summaryNoneConfirmed("Nguyên")}`,
    );
    expect(profileSummary("Nguyên", confirmedProfile())).toBe(`${levelCopy.summaryRange("Nguyên", "B1+", "B2+")} ${levelCopy.summaryConfirmed(2, 7)}`);
    const p = confirmedProfile();
    expect(domainSentence("Nguyên", p.domains[2]!)).toBe(levelCopy.sentenceConfirmed("Nguyên", "Đọc", "B2+"));
    expect(domainSentence("Nguyên", p.domains[6]!)).toBe(levelCopy.sentenceAssumed("Nguyên", "Tư duy & tự học", "bậc 2"));
    expect(boxValue([p.domains[2]!, p.domains[3]!])).toBe(levelCopy.boxLine("Đọc, Nghe", "B2+"));
    expect([levelText("cefr", "B1"), levelText("task_level", "3")]).toEqual(["B1", "bậc 3"]);
    expect([monthLabel("2026-10-01"), dayLabel("2026-10-21T18:30:00+00:00")]).toEqual(["10/2026", "22/10/2026"]);
  });

  it("the student's review list keeps at most 3 labels, grouped by domain in order; no domain → 'Khác' (D12)", () => {
    expect(groupReview([
      { domainKey: "grammar", domainName: "Ngữ pháp", label: "Câu điều kiện" },
      { domainKey: "vocab", domainName: "Từ vựng", label: "Dạng từ" },
      { domainKey: "grammar", domainName: "Ngữ pháp", label: "Bị động" },
      { domainKey: null, domainName: null, label: "Nhãn riêng cũ" },
    ])).toEqual([{ name: "Ngữ pháp", labels: ["Câu điều kiện", "Bị động"] }, { name: "Từ vựng", labels: ["Dạng từ"] }]);
    expect(groupReview([{ domainKey: null, domainName: null, label: "x" }])).toEqual([{ name: studentReviewCopy.otherDomain, labels: ["x"] }]);
  });

  it("no level text, form text or student text contains 'đạt'", () => {
    const texts = (o: Record<string, unknown>): string[] =>
      Object.values(o).flatMap((v) =>
        typeof v === "string" ? [v]
          : typeof v === "function" ? [String((v as (...a: unknown[]) => unknown)("An", "B1", "B2", "Cô Lan"))]
            : v && typeof v === "object" ? texts(v as Record<string, unknown>) : []);
    for (const t of [...texts(levelCopy), ...texts(levelFormCopy), ...texts(studentReviewCopy), ...texts(externalCopy)]) expect(t).not.toMatch(/đạt/iu);
  });
});

describe("parsers", () => {
  const rawDomain = (key: string, scale = "cefr") => ({
    key, name_vi: key, scale, ord: 1, assumed_level: scale === "cefr" ? "B2" : "2", current_level: scale === "cefr" ? "B2" : "2",
    status: "assumed", last_kind: null, decided_at: null, decided_by_name: null, external: null,
  });
  const raw = {
    map_id: "SM-1", track_id: "B",
    domains: [rawDomain("grammar"), rawDomain("vocab"), rawDomain("reading"), rawDomain("listening"), rawDomain("writing"), rawDomain("speaking"), rawDomain("thinking", "task_level")],
    history: [{ id: "h1", domain_key: "reading", from_level: "B2", to_level: "B2+", kind: "baseline", reason: null, decided_at: "2026-10-21T03:00:00+00:00", decided_by_name: "Cô Lan" }],
    external_results: [{ id: "e1", exam: "FCE", taken_on: "2026-09-12", score_text: "172", domains: ["reading"], note: null, file_id: null, recorded_by_name: "Phụ huynh", recorded_role: "parent", recorded_at: "2026-09-13T01:00:00+00:00" }],
    reading_reports: [{ month: "2026-10-01", skills: 14 }],
  };

  it("maps the profile to the view and refuses anything unexpected", () => {
    const p = parseLevelProfile(raw);
    expect(p.domains).toHaveLength(7);
    expect(p.domains[6]).toEqual({ key: "thinking", name: "thinking", scale: "task_level", current: "2", assumed: "2", status: "assumed", lastKind: null, decidedAt: null, decidedBy: null, external: null });
    expect(p.history[0]).toEqual({ id: "h1", domainKey: "reading", from: "B2", to: "B2+", kind: "baseline", reason: null, decidedAt: "2026-10-21T03:00:00+00:00", decidedBy: "Cô Lan" });
    expect(p.externalResults[0]).toMatchObject({ exam: "FCE", domains: ["reading"], recordedRole: "parent", fileId: null });
    expect(p.readingReports).toEqual([{ month: "2026-10-01", skills: 14 }]);
    expect(() => parseLevelProfile({ ...raw, domains: raw.domains.slice(0, 6) })).toThrow();
    expect(() => parseLevelProfile({ ...raw, history: [{ ...raw.history[0], kind: "promote" }] })).toThrow();
  });

  it("recent changes and the student's list (strict: an extra key is refused)", () => {
    expect(parseRecentChanges({ changes: [{ id: "c1", domain_key: "thinking", domain_name: "Tư duy & tự học", scale: "task_level", from_level: "2", to_level: "3", kind: "adjust", reason: "x", decided_at: "2026-10-22T03:00:00+00:00", decided_by_name: "Cô Lan" }] }))
      .toEqual([{ id: "c1", domainKey: "thinking", domainName: "Tư duy & tự học", scale: "task_level", from: "2", to: "3", kind: "adjust", reason: "x", decidedAt: "2026-10-22T03:00:00+00:00", decidedBy: "Cô Lan" }]);
    expect(parseReviewByDomain({ items: [{ domain_key: "vocab", domain_name: "Từ vựng", label: "Dạng từ" }] })).toEqual([{ domainKey: "vocab", domainName: "Từ vựng", label: "Dạng từ" }]);
    expect(() => parseReviewByDomain({ items: [{ domain_key: "vocab", domain_name: "Từ vựng", label: "Dạng từ", level: "B2" }] })).toThrow();
    expect(() => parseReviewByDomain({ items: [1, 2, 3, 4].map((i) => ({ domain_key: null, domain_name: null, label: `l${i}` })) })).toThrow();
  });
});
```

- [ ] **Step 3: Run it** — `npx vitest run tests/unit/levels.test.ts` → FAIL (modules missing).

- [ ] **Step 4: Copy** — append to the end of `lib/copy/vi.ts`:

```ts
// ---------- SM-2: Hồ sơ cấp đang học (phụ huynh, gia sư). Cấp ghi "đang học B1", KHÔNG BAO GIỜ "đạt" (spec §1 "Cách gọi"). ----------
// "cô" viết thẳng theo mockup đã duyệt 22/10 (không dùng tutorHonorific).
export const levelCopy = {
  link: "Hồ sơ cấp",
  title: (alias: string) => `Hồ sơ cấp · ${alias}`,
  back: "Về trang chủ",
  intro: "Cấp đang học của từng mảng. Cấp đến từ bài làm trong app và nhận xét của cô, không phải bài thi chuẩn.",
  levelName: (scale: "cefr" | "task_level", level: string) => (scale === "cefr" ? level : `bậc ${level}`),
  whereTitle: (alias: string) => `${alias} đang ở đâu?`,
  summaryRange: (alias: string, low: string, high: string) =>
    low === high ? `${alias} đang học quanh ${low} ở cả sáu mảng ngôn ngữ.` : `${alias} đang học từ ${low} đến ${high}, tuỳ mảng.`,
  summaryConfirmed: (n: number, total: number) => `Cô đã xác nhận ${n}/${total} mảng.`,
  summaryNoneConfirmed: (alias: string) => `Đây là cấp ước lượng theo track — cô chưa xác nhận mảng nào của ${alias}.`,
  strongest: "Mạnh nhất",
  focus: "Cần tập trung",
  waiting: "Đang chờ cô",
  waitingNone: "Không có",
  even: "Các mảng đang ngang nhau",
  boxLine: (names: string, level: string) => `${names} · ${level}`,
  barsTitle: "Cấp đang học theo mảng",
  scaleCefr: "Thang A1 → C2",
  scaleTask: "thang riêng bậc 1 → 4",
  assumed: "Ước lượng — cô chưa xác nhận",
  confirmedOn: (dateLabel: string, by: string | null) => `Cô xác nhận ngày ${dateLabel}${by ? ` · ${by}` : ""}`,
  detailTitle: (domain: string) => `Mảng ${domain}`,
  sentenceConfirmed: (alias: string, domain: string, level: string) => `${alias} đang học ${level} ở mảng ${domain}.`,
  sentenceAssumed: (alias: string, domain: string, level: string) => `${alias} được ước lượng đang học ${level} ở mảng ${domain}; cô chưa xác nhận.`,
  contentTitle: (level: string) => `Ở ${level}, mảng này gồm`,
  solidTitle: "Đã vững",
  practisingTitle: "Đang luyện",
  nextTitle: "Để lên cấp tiếp, còn cần",
  notYet: "Sẽ có khi app bắt đầu theo dõi trạng thái từng kỹ năng (bước sau).",
  weakTitle: "Điểm cần chú ý của mảng này",
  weakNone: "Chưa có điểm cần chú ý nào ở mảng này (8 tuần gần đây).",
  weakMore: "Xem trong Điểm cần chú ý",
  milestonesTitle: "Mốc ngoài & lịch sử",
  addExternal: "+ Thêm kết quả thi ngoài",
  externalTitle: "Kết quả thi ngoài",
  externalNone: "Chưa có kết quả thi ngoài.",
  externalLine: (exam: string, dateLabel: string, score: string) => `${exam} · ${dateLabel} · ${score}`,
  externalDomains: (names: string) => `Mảng: ${names}`,
  readingReportLine: (monthLabel: string) => `Báo cáo kỹ năng đọc tháng ${monthLabel} · Đọc`,
  openFile: "Xem phiếu điểm",
  historyTitle: "Lịch sử cấp",
  historyNone: "Chưa có quyết định cấp nào.",
  historyLine: (domain: string, from: string, to: string) => `${domain}: ${from} → ${to}`,
  historyMeta: (kind: string, dateLabel: string, by: string | null) => `${kind} · ${dateLabel}${by ? ` · ${by}` : ""}`,
  kindLabels: { baseline: "Xác nhận cấp khởi điểm", level_up: "Lên cấp", adjust: "Điều chỉnh" } as Record<string, string>,
  confirmLink: "Xác nhận cấp khởi điểm",
  adjustLink: "Điều chỉnh cấp",
  recentTitle: "Thay đổi cấp gần đây",
  recentNone: "30 ngày qua chưa có thay đổi cấp nào.",
  recentLine: (alias: string, domain: string, from: string, to: string) => `${alias} · ${domain}: ${from} → ${to}`,
} as const;

/** SM-2: "Xác nhận cấp khởi điểm" và "Điều chỉnh cấp" (chỉ gia sư của em). */
export const levelFormCopy = {
  back: "Về Hồ sơ cấp",
  baselineTitle: (alias: string) => `Xác nhận cấp khởi điểm · ${alias}`,
  baselineIntro: "Mỗi mảng đã điền sẵn cấp ước lượng. Cô sửa mảng nào chưa đúng rồi bấm lưu một lần.",
  baselineDone: "Mọi mảng đã được xác nhận. Muốn đổi một mảng, dùng “Điều chỉnh cấp”.",
  levelOf: (domain: string) => `Cấp đang học · ${domain}`,
  assumedHint: (level: string) => `Ước lượng: ${level}`,
  note: "Ghi chú (không bắt buộc)",
  saveBaseline: "Lưu cấp khởi điểm",
  adjustTitle: (alias: string) => `Điều chỉnh cấp · ${alias}`,
  adjustIntro: "Phụ huynh sẽ thấy thay đổi này ở trang chủ, kèm lý do.",
  pickDomain: "Chọn mảng cần điều chỉnh",
  pickNone: "Chưa có mảng nào được xác nhận. Xác nhận cấp khởi điểm trước.",
  current: (level: string) => `Hiện tại: đang học ${level}`,
  newLevel: "Cấp mới",
  reason: "Lý do (bắt buộc)",
  reasonHint: "Ví dụ: 3 bài kiểm tra gần đây đều làm tốt phần câu điều kiện.",
  reasonRequired: "Bạn ghi lý do điều chỉnh nhé.",
  sameLevel: "Cấp mới đang trùng cấp hiện tại.",
  saveAdjust: "Lưu điều chỉnh",
  saving: "Đang lưu…",
  saved: "Đã lưu.",
} as const;

/** SM-2: "Thêm kết quả thi ngoài" (phụ huynh, gia sư). Mốc ngoài chỉ để đối chiếu, không đổi cấp. */
export const externalCopy = {
  title: (alias: string) => `Thêm kết quả thi ngoài · ${alias}`,
  back: "Về Hồ sơ cấp",
  intro: "Kết quả thi ngoài chỉ để đối chiếu — không tự đổi cấp đang học.",
  exam: "Kỳ thi",
  examLabels: {
    KET: "KET (A2 Key)", PET: "PET (B1 Preliminary)", FCE: "FCE (B2 First)", CAE: "CAE (C1 Advanced)", CPE: "CPE (C2 Proficiency)",
    VAO10_MOCK: "Đề thử vào 10", SCHOOL: "Bài thi ở trường", OTHER: "Khác",
  } as Record<string, string>,
  takenOn: "Ngày thi",
  score: "Điểm / kết quả",
  scoreHint: "Ví dụ: 140 · Merit, hoặc 8,5/10",
  domains: "Mảng liên quan",
  domainsHelp: "Chọn ít nhất một mảng.",
  note: "Ghi chú (không bắt buộc)",
  file: "Ảnh hoặc PDF phiếu điểm (không bắt buộc)",
  save: "Lưu kết quả",
  saving: "Đang lưu…",
  uploading: "Đang tải file lên…",
  needDomain: "Bạn chọn ít nhất một mảng nhé.",
  needScore: "Bạn ghi điểm hoặc kết quả nhé.",
} as const;

/** SM-2: "Việc cần ôn" theo mảng trên trang chủ của em. Không cấp, không điểm (P2-d). Xưng "bạn". */
export const studentReviewCopy = {
  title: "Việc cần ôn",
  intro: "Ôn lại mấy điểm này nhé.",
  otherDomain: "Khác",
} as const;
```

- [ ] **Step 5: `lib/levels/types.ts`**

```ts
/** SM-2 level profile (spec 2026-10-21 §3): shapes the staff screens and the student home work with (camelCase, parsed by shape.ts). */
import type { DomainKey } from "@/lib/skillmap/types";

export const EXAMS = ["KET", "PET", "FCE", "CAE", "CPE", "VAO10_MOCK", "SCHOOL", "OTHER"] as const;
export type Exam = (typeof EXAMS)[number];
export const LEVEL_KINDS = ["baseline", "level_up", "adjust"] as const;
export type LevelKind = (typeof LEVEL_KINDS)[number];
export type Scale = "cefr" | "task_level";

/** Same limits as migration 0020. */
export const REASON_MAX = 300;
export const NOTE_MAX = 300;
export const SCORE_MAX = 60;
/** An exam date may be at most this many days back (≈ 10 years; same number in eng_record_external_result). */
export const EXAM_DAYS_BACK = 3660;
/** Parent home box (D11). */
export const RECENT_DAYS = 30;
export const RECENT_MAX = 5;
/** Student home (D12; same limit in eng_my_review_by_domain). */
export const REVIEW_MAX = 3;

export type ExternalMark = { id: string; exam: Exam; takenOn: string; scoreText: string };

export type DomainLevel = {
  key: DomainKey;
  name: string;
  scale: Scale;
  /** CEFR step ("B1+") or task level ("2"): latest decision, else the track's assumed level. */
  current: string;
  assumed: string;
  status: "assumed" | "confirmed";
  lastKind: LevelKind | null;
  decidedAt: string | null;
  decidedBy: string | null;
  /** Newest external result that names this domain. */
  external: ExternalMark | null;
};

export type LevelHistoryRow = { id: string; domainKey: DomainKey; from: string; to: string; kind: LevelKind; reason: string | null; decidedAt: string; decidedBy: string | null };

export type ExternalResultRow = {
  id: string; exam: Exam; takenOn: string; scoreText: string; domains: DomainKey[]; note: string | null; fileId: string | null;
  recordedBy: string | null; recordedRole: "tutor" | "parent"; recordedAt: string;
};

export type LevelProfile = {
  mapId: string;
  trackId: string;
  domains: DomainLevel[];
  history: LevelHistoryRow[];
  externalResults: ExternalResultRow[];
  /** Current monthly reading reports: month + number of skills. Never their source (D10). */
  readingReports: { month: string; skills: number }[];
};

export type LevelChange = {
  id: string; domainKey: DomainKey; domainName: string; scale: Scale; from: string; to: string; kind: LevelKind; reason: string | null;
  decidedAt: string; decidedBy: string | null;
};
export type RecentChange = LevelChange & { learnerId: string; alias: string };

/** What the student's home may show: a label and its domain. Nothing else. */
export type ReviewItem = { domainKey: DomainKey | null; domainName: string | null; label: string };
```

- [ ] **Step 6: `lib/levels/scale.ts`**

```ts
/** SM-2 level scales (spec 2026-10-21 P2-b, P4-c). Pure: used on the server, in the browser and by lib/skillmap/group.ts. */
import { CEFR_LEVELS, type CefrLevel, type DomainKey } from "@/lib/skillmap/types";
import type { DomainLevel, LevelProfile, Scale } from "./types";

export const TASK_LEVELS = ["1", "2", "3", "4"] as const;

export function levelsOf(scale: Scale): readonly string[] {
  return scale === "cefr" ? CEFR_LEVELS : TASK_LEVELS;
}

export function isLevelOf(scale: Scale, level: string): boolean {
  return levelsOf(scale).includes(level);
}

/** Position on the domain's own scale (CEFR 0..8, task level 0..3); null when unknown. */
export function stepIndex(scale: Scale, level: string | null | undefined): number | null {
  if (!level) return null;
  const i = levelsOf(scale).indexOf(level);
  return i < 0 ? null : i;
}

/** "Cấp" as Q1 and P4-c use it: A1 · A2/A2+ · B1/B1+ · B2/B2+ · C1 · C2 (0..5). Task levels are their own steps. */
const MAJOR: Record<CefrLevel, number> = { A1: 0, A2: 1, "A2+": 1, B1: 2, "B1+": 2, B2: 3, "B2+": 3, C1: 4, C2: 5 };
export function majorIndex(scale: Scale, level: string | null | undefined): number | null {
  const i = stepIndex(scale, level);
  if (i === null) return null;
  return scale === "cefr" ? MAJOR[level as CefrLevel] : i;
}

/** Bar length on its domain's scale: A1 = 1/9 … C2 = 1; bậc 1 = 1/4 … bậc 4 = 1. */
export function barFraction(scale: Scale, level: string): number {
  const i = stepIndex(scale, level);
  return i === null ? 0 : (i + 1) / levelsOf(scale).length;
}

/** Key of the group description that fits a level: "A1-A2" | "B1" | "B2" | "C1-C2" (CEFR) or "low" | "high" (task levels). */
export function bandOf(scale: Scale, level: string): string | null {
  const m = majorIndex(scale, level);
  if (m === null) return null;
  if (scale === "task_level") return m <= 1 ? "low" : "high";
  return m <= 1 ? "A1-A2" : m === 2 ? "B1" : m === 3 ? "B2" : "C1-C2";
}

type LeafLevels = { levelFrom: string | null; levelTo: string | null; taskFrom: number | null; taskTo: number | null };

/** P4-c (D1): does a leaf's level range touch the current level ± 1? No current level, or a leaf without a level → near. */
export function nearLevel(scale: Scale, current: string | null | undefined, leaf: LeafLevels): boolean {
  const c = majorIndex(scale, current);
  if (c === null) return true;
  const lo = scale === "cefr" ? majorIndex(scale, leaf.levelFrom) : leaf.taskFrom === null ? null : leaf.taskFrom - 1;
  const hi = scale === "cefr" ? majorIndex(scale, leaf.levelTo) : leaf.taskTo === null ? null : leaf.taskTo - 1;
  if (lo === null || hi === null) return true;
  return lo <= c + 1 && hi >= c - 1;
}

/** D4: strongest / weakest of the CEFR domains by current level. Thinking has its own scale and is left out. */
export function strongestWeakest(domains: DomainLevel[]): { strongest: DomainLevel[]; weakest: DomainLevel[]; even: boolean } {
  const rated = domains.flatMap((d) => {
    const i = d.scale === "cefr" ? stepIndex("cefr", d.current) : null;
    return i === null ? [] : [{ d, i }];
  });
  if (rated.length === 0) return { strongest: [], weakest: [], even: true };
  const max = Math.max(...rated.map((x) => x.i));
  const min = Math.min(...rated.map((x) => x.i));
  if (max === min) return { strongest: [], weakest: [], even: true };
  return { strongest: rated.filter((x) => x.i === max).map((x) => x.d), weakest: rated.filter((x) => x.i === min).map((x) => x.d), even: false };
}

/** Current level per domain, for the pickers (SkillMapView.current). */
export function currentLevels(profile: LevelProfile): Partial<Record<DomainKey, string>> {
  return Object.fromEntries(profile.domains.map((d) => [d.key, d.current]));
}
```

- [ ] **Step 7: `lib/levels/view.ts`**

```ts
/** Plain-language text for the level screens (spec §1 "Cách gọi": "đang học B1", never "đạt"). Pure; every word from lib/copy/vi.ts. */
import { levelCopy, studentReviewCopy } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";
import { stepIndex } from "./scale";
import { REVIEW_MAX, type DomainLevel, type LevelProfile, type ReviewItem, type Scale } from "./types";

export function levelText(scale: Scale, level: string): string {
  return levelCopy.levelName(scale, level);
}

/** "Nguyên đang học từ B1+ đến B2+, tuỳ mảng. Cô đã xác nhận 2/7 mảng." (conclusion first, UX guide §4.1). */
export function profileSummary(alias: string, p: LevelProfile): string {
  const cefr = p.domains
    .filter((d) => d.scale === "cefr" && stepIndex("cefr", d.current) !== null)
    .map((d) => d.current)
    .sort((a, b) => (stepIndex("cefr", a) ?? 0) - (stepIndex("cefr", b) ?? 0));
  const confirmed = p.domains.filter((d) => d.status === "confirmed").length;
  const range = cefr.length > 0 ? levelCopy.summaryRange(alias, cefr[0]!, cefr[cefr.length - 1]!) : "";
  const conf = confirmed === 0 ? levelCopy.summaryNoneConfirmed(alias) : levelCopy.summaryConfirmed(confirmed, p.domains.length);
  return [range, conf].filter(Boolean).join(" ");
}

export function domainSentence(alias: string, d: DomainLevel): string {
  const lv = levelText(d.scale, d.current);
  return d.status === "confirmed" ? levelCopy.sentenceConfirmed(alias, d.name, lv) : levelCopy.sentenceAssumed(alias, d.name, lv);
}

/** "Đọc, Nghe · B2+" (domains tied on the same level). */
export function boxValue(list: DomainLevel[]): string {
  const first = list[0];
  return first ? levelCopy.boxLine(list.map((d) => d.name).join(", "), levelText(first.scale, first.current)) : levelCopy.even;
}

/** D12: at most 3 labels, grouped under their domain in the order they come; a label without a domain goes under "Khác". */
export function groupReview(items: ReviewItem[]): { name: string; labels: string[] }[] {
  const out: { name: string; labels: string[] }[] = [];
  for (const it of items.slice(0, REVIEW_MAX)) {
    const name = it.domainName ?? studentReviewCopy.otherDomain;
    const g = out.find((x) => x.name === name);
    if (g) g.labels.push(it.label);
    else out.push({ name, labels: [it.label] });
  }
  return out;
}

/** "2026-10-01" → "10/2026". */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  return m ? `${m[2]}/${m[1]}` : month;
}

/** A timestamp → its calendar day in Vietnam, "22/10/2026". */
export function dayLabel(ts: string): string {
  return formatDateVi(todayVn(new Date(ts)));
}
```

- [ ] **Step 8: `lib/levels/shape.ts`**

```ts
/** Parse the jsonb of the 0020 read functions. zod strips unknown keys (except the student's list: strict); anything unexpected throws. */
import { z } from "zod";
import { DOMAIN_KEYS } from "@/lib/skillmap/types";
import { EXAMS, LEVEL_KINDS, REVIEW_MAX, type LevelChange, type LevelProfile, type ReviewItem } from "./types";

const scale = z.enum(["cefr", "task_level"]);
const domainKey = z.enum(DOMAIN_KEYS);
const kind = z.enum(LEVEL_KINDS);

const domainRow = z.object({
  key: domainKey,
  name_vi: z.string(),
  scale,
  assumed_level: z.string(),
  current_level: z.string(),
  status: z.enum(["assumed", "confirmed"]),
  last_kind: kind.nullable(),
  decided_at: z.string().nullable(),
  decided_by_name: z.string().nullable(),
  external: z.object({ id: z.string(), exam: z.enum(EXAMS), taken_on: z.string(), score_text: z.string() }).nullable(),
});
const historyRow = z.object({
  id: z.string(), domain_key: domainKey, from_level: z.string(), to_level: z.string(), kind, reason: z.string().nullable(),
  decided_at: z.string(), decided_by_name: z.string().nullable(),
});
const externalRow = z.object({
  id: z.string(), exam: z.enum(EXAMS), taken_on: z.string(), score_text: z.string(), domains: z.array(domainKey), note: z.string().nullable(),
  file_id: z.string().nullable(), recorded_by_name: z.string().nullable(), recorded_role: z.enum(["tutor", "parent"]), recorded_at: z.string(),
});
const profileRow = z.object({
  map_id: z.string(),
  track_id: z.string(),
  domains: z.array(domainRow).length(7),
  history: z.array(historyRow),
  external_results: z.array(externalRow),
  reading_reports: z.array(z.object({ month: z.string(), skills: z.number().int().min(0) })),
});

export function parseLevelProfile(raw: unknown): LevelProfile {
  const p = profileRow.parse(raw);
  return {
    mapId: p.map_id,
    trackId: p.track_id,
    domains: p.domains.map((d) => ({
      key: d.key, name: d.name_vi, scale: d.scale, current: d.current_level, assumed: d.assumed_level, status: d.status, lastKind: d.last_kind,
      decidedAt: d.decided_at, decidedBy: d.decided_by_name,
      external: d.external ? { id: d.external.id, exam: d.external.exam, takenOn: d.external.taken_on, scoreText: d.external.score_text } : null,
    })),
    history: p.history.map((h) => ({
      id: h.id, domainKey: h.domain_key, from: h.from_level, to: h.to_level, kind: h.kind, reason: h.reason, decidedAt: h.decided_at, decidedBy: h.decided_by_name,
    })),
    externalResults: p.external_results.map((e) => ({
      id: e.id, exam: e.exam, takenOn: e.taken_on, scoreText: e.score_text, domains: e.domains, note: e.note, fileId: e.file_id,
      recordedBy: e.recorded_by_name, recordedRole: e.recorded_role, recordedAt: e.recorded_at,
    })),
    readingReports: p.reading_reports.map((r) => ({ month: r.month, skills: r.skills })),
  };
}

const changeRow = z.object({
  id: z.string(), domain_key: domainKey, domain_name: z.string().nullable(), scale: scale.nullable(), from_level: z.string(), to_level: z.string(),
  kind, reason: z.string().nullable(), decided_at: z.string(), decided_by_name: z.string().nullable(),
});

export function parseRecentChanges(raw: unknown): LevelChange[] {
  return z.object({ changes: z.array(changeRow) }).parse(raw).changes.map((c) => ({
    id: c.id, domainKey: c.domain_key, domainName: c.domain_name ?? c.domain_key, scale: c.scale ?? "cefr", from: c.from_level, to: c.to_level,
    kind: c.kind, reason: c.reason, decidedAt: c.decided_at, decidedBy: c.decided_by_name,
  }));
}

/** STRICT: if the database ever sends more than a label and a domain, the student's home must fail rather than show it. */
const reviewRow = z.strictObject({ domain_key: domainKey.nullable(), domain_name: z.string().nullable(), label: z.string().min(1) });

export function parseReviewByDomain(raw: unknown): ReviewItem[] {
  return z.strictObject({ items: z.array(reviewRow).max(REVIEW_MAX) }).parse(raw).items.map((r) => ({
    domainKey: r.domain_key, domainName: r.domain_name, label: r.label,
  }));
}
```

- [ ] **Step 9: Run** — `npx vitest run tests/unit/levels.test.ts tests/unit/copyNoProvider.test.ts` → PASS; `npm run typecheck && npm run lint` → clean (the DB test helpers are all used since Task 3).

- [ ] **Step 10: Commit**

```bash
git add lib/levels/types.ts lib/levels/scale.ts lib/levels/view.ts lib/levels/shape.ts lib/copy/vi.ts tests/unit/fixtures/levels.ts tests/unit/levels.test.ts
git commit -m "feat(sm-2): lib/levels - scales, near level ± 1, strongest/weakest, plain-language text, parsers, copy"
```

---

### Task 5: API — `levels:decide`, external-result files, schemas, handlers, store, routes, error words

**Files:**
- Create: `lib/storage/verify.ts`, `lib/levels/schemas.ts`, `lib/levels/handlers.ts`, `lib/levels/supabaseStore.ts`, `lib/levels/route.ts`, `app/api/learners/[id]/levels/route.ts`, `app/api/learners/[id]/external-results/route.ts`
- Modify: `lib/auth/requireAccess.ts`, `lib/storage/rules.ts`, `lib/practice/handlers.ts`, `lib/practice/schemas.ts`, `lib/tutorwork/client.ts`, `lib/copy/vi.ts`
- Test: `tests/unit/levelsApi.test.ts`, `tests/unit/requireAccess.test.ts`, `tests/unit/practiceHandlers.test.ts`, `tests/unit/purge.test.ts`

**Interfaces:**
- Consumes: `requireAccess`, `AccessError`, `AccessDeps`, `AccessGrant`, `AccessUser`, `Action` (`lib/auth/requireAccess.ts`); `fromDbError`, `ReviewDbError`, `HandlerResult` (`lib/review/handlers.ts`); `FileStorage` (`lib/storage/types.ts`); `checkFile`, `buildPath`, `FileKind` (`lib/storage/rules.ts`); `fileMetaSchema`, `FileMeta` (`lib/practice/schemas.ts`); Task 2 SQL; Task 4 constants.
- Produces:
  - Action `"levels:decide"` (tutor only).
  - `FILE_KINDS` gains `"external_result"`; staff upload purpose `"external_result"` on `POST /api/learners/:id/files`; `GET /api/files/:id` offers an external-result PDF as a download named `ket-qua-thi-ngoai.pdf`.
  - `lib/storage/verify.ts`: `FILE_ERRORS`, `verifyStoredFile(storage: FileStorage, owner: { familyId: string; learnerId: string }, kind: FileKind, meta: { id: string; mime: AllowedMime; bytes: number }): Promise<string | null>` (null = ok; else `file_type` / `file_empty` / `file_too_big` / `file_missing` / `file_mismatch`).
  - `lib/practice/schemas.ts`: `export const isoDate`.
  - `lib/levels/schemas.ts`: `recordLevelsBodySchema` (`{client_id, kind: "baseline"|"adjust", levels: {domain: level}, reason?}`), `externalResultBodySchema` (`{client_id, exam, taken_on, score_text, domains[], note?, file?}`).
  - `lib/levels/handlers.ts`: `interface LevelStore { recordLevels(a: { learnerId: string; kind: "baseline" | "adjust"; levels: Record<string, string>; reason: string | null; byMemberId: string; clientId: string }): Promise<unknown>; recordExternal(a: { learnerId: string; exam: string; takenOn: string; scoreText: string; domains: string[]; note: string | null; file: FileMeta | null; byMemberId: string; clientId: string }): Promise<unknown> }`, `type LevelDeps = { user: AccessUser; store: LevelStore; storage: FileStorage; access?: Partial<AccessDeps> }`, `handleRecordLevels(deps, learnerId, rawBody)` → `201/200 {ids, replayed}`, `handleRecordExternalResult(deps, learnerId, rawBody)` → `201/200 {id, replayed}`. Error codes in the body: `level_tutor_only` (403), `already_confirmed` (409), `needs_baseline`, `same_level`, `reason_required`, `bad_date` (400), plus the usual `invalid_body`, `invalid`, `forbidden`, `conflict`, `not_found`, `unauthenticated`, file codes.
  - `createSupabaseLevelStore(): LevelStore`, `runLevelRoute(routeName, run)`.
  - Routes `POST /api/learners/:id/levels`, `POST /api/learners/:id/external-results`.
  - `failText` understands the six new codes; `tutorWorkErrors.{levelTutorOnly, alreadyConfirmed, needsBaseline, sameLevel, reasonRequired, badDate}`; `downloadNames.externalResult`; `purgePage.countLabels.{level_decisions, external_results}`.

- [ ] **Step 1: Write the failing test** — `tests/unit/levelsApi.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { tutorWorkErrors } from "@/lib/copy/vi";
import { handleRecordExternalResult, handleRecordLevels, type LevelDeps, type LevelStore } from "@/lib/levels/handlers";
import { externalResultBodySchema, recordLevelsBodySchema } from "@/lib/levels/schemas";
import { staffUploadBodySchema } from "@/lib/practice/schemas";
import { ReviewDbError } from "@/lib/review/handlers";
import { checkFile, FILE_KINDS } from "@/lib/storage/rules";
import type { FileStorage } from "@/lib/storage/types";
import { failText } from "@/lib/tutorwork/client";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const FILE = "d0000000-0000-4000-8000-000000000009";
const NOW = new Date("2026-10-22T08:00:00Z");
const mk = (id: string, role: Member["role"]): Member => ({ id: `m-${id}`, userId: `u-${id}`, familyId: FAMILY, role, displayName: id });
const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentNguyen", "student")];
const learners: Learner[] = [
  { id: AN, familyId: FAMILY, memberId: null, alias: "An", trackId: "A", isTest: true, status: "active" },
  { id: NGUYEN, familyId: FAMILY, memberId: "m-studentNguyen", alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
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
const store = (over: Partial<LevelStore> = {}) =>
  ({
    recordLevels: vi.fn(async (): Promise<unknown> => ({ ids: ["d1"], replayed: false })),
    recordExternal: vi.fn(async (): Promise<unknown> => ({ id: "x1", replayed: false })),
    ...over,
  }) satisfies LevelStore;
const storage = (stat: { bytes: number; mime: string } | null = { bytes: 2048, mime: "application/pdf" }) =>
  ({
    createUpload: vi.fn(async () => ({ url: "https://signed.example/u" })),
    stat: vi.fn(async () => stat),
    createDownload: vi.fn(async () => "https://signed.example/d"),
    removeFolder: vi.fn(async () => 0),
  }) satisfies FileStorage;
const deps = (user: string | null, s: LevelStore, st: FileStorage = storage()): LevelDeps => ({
  user: user ? { id: `u-${user}` } : null, store: s, storage: st, access: { store: access, allowRealLearners: false, now: NOW },
});
const baseline = { client_id: "levels-0001", kind: "baseline", levels: { grammar: "B2+", thinking: "3" }, reason: "Buổi đầu" };
const adjust = { client_id: "levels-0002", kind: "adjust", levels: { writing: "B1+" }, reason: "Bài luận còn thiếu liên kết" };
const result = { client_id: "external-0001", exam: "FCE", taken_on: "2026-09-12", score_text: "172 · Grade B", domains: ["reading", "listening"] };

describe("request bodies", () => {
  it("levels: a baseline names 1..7 domains; an adjustment exactly one with a reason; unknown fields, domains, levels and kinds are refused", () => {
    expect(recordLevelsBodySchema.safeParse(baseline).success).toBe(true);
    expect(recordLevelsBodySchema.safeParse(adjust).success).toBe(true);
    expect(recordLevelsBodySchema.safeParse({ ...adjust, reason: undefined }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...adjust, reason: "   " }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...adjust, levels: { writing: "B1+", vocab: "B2" } }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...baseline, levels: {} }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...baseline, levels: { music: "B1" } }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...baseline, levels: { grammar: "D1" } }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...baseline, kind: "level_up" }).success).toBe(false);
    expect(recordLevelsBodySchema.safeParse({ ...baseline, evidence: {} }).success).toBe(false);
  });

  it("external result: a known exam, a calendar date, a score, 1..7 domains, an optional file {id, mime, bytes}", () => {
    expect(externalResultBodySchema.safeParse(result).success).toBe(true);
    expect(externalResultBodySchema.safeParse({ ...result, file: { id: FILE, mime: "image/jpeg", bytes: 10 } }).success).toBe(true);
    expect(externalResultBodySchema.safeParse({ ...result, exam: "IELTS" }).success).toBe(false);
    expect(externalResultBodySchema.safeParse({ ...result, taken_on: "2026-02-30" }).success).toBe(false);
    expect(externalResultBodySchema.safeParse({ ...result, score_text: " " }).success).toBe(false);
    expect(externalResultBodySchema.safeParse({ ...result, domains: [] }).success).toBe(false);
    expect(externalResultBodySchema.safeParse({ ...result, file: { id: FILE, mime: "text/html", bytes: 10 } }).success).toBe(false);
    expect(externalResultBodySchema.safeParse({ ...result, path: "x/y.pdf" }).success).toBe(false);
  });

  it("an exam sheet is uploaded with the staff purpose 'external_result'; the kind takes a PDF or an image", () => {
    expect(staffUploadBodySchema.safeParse({ purpose: "external_result", mime: "application/pdf", bytes: 10 }).success).toBe(true);
    expect(FILE_KINDS).toContain("external_result");
    expect([checkFile("external_result", "application/pdf", 10), checkFile("external_result", "image/png", 10)]).toEqual([{ ok: true }, { ok: true }]);
  });
});

describe("handleRecordLevels (the child's tutor only)", () => {
  it("the tutor records; the store gets the cleaned body and the tutor's member id; a replay answers 200", async () => {
    const s = store();
    expect(await handleRecordLevels(deps("tutorNguyen", s), NGUYEN, baseline)).toEqual({ status: 201, body: { ids: ["d1"], replayed: false } });
    expect(s.recordLevels).toHaveBeenCalledWith({
      learnerId: NGUYEN, kind: "baseline", levels: { grammar: "B2+", thinking: "3" }, reason: "Buổi đầu", byMemberId: "m-tutorNguyen", clientId: "levels-0001",
    });
    const again = store({ recordLevels: vi.fn(async (): Promise<unknown> => ({ ids: ["d1"], replayed: true })) });
    expect((await handleRecordLevels(deps("tutorNguyen", again), NGUYEN, { ...baseline, reason: undefined })).status).toBe(200);
    expect(again.recordLevels).toHaveBeenCalledWith(expect.objectContaining({ reason: null }));
  });

  it("access first: no session 401, the parent 403, another child's tutor 404, the student 403 - before the body is read", async () => {
    const s = store();
    expect((await handleRecordLevels(deps(null, s), NGUYEN, "x")).status).toBe(401);
    expect((await handleRecordLevels(deps("parent", s), NGUYEN, baseline)).status).toBe(403);
    expect((await handleRecordLevels(deps("tutorAn", s), NGUYEN, baseline)).status).toBe(404);
    expect((await handleRecordLevels(deps("studentNguyen", s), NGUYEN, baseline)).status).toBe(403);
    expect((await handleRecordLevels(deps("tutorNguyen", s), NGUYEN, { ...baseline, kind: "level_up" })).status).toBe(400);
    expect(s.recordLevels).not.toHaveBeenCalled();
  });

  it("maps the database answers to codes the screens can explain", async () => {
    const cases: [string, string, number, string][] = [
      ["42501", "eng_record_level: only a tutor of this learner records levels (tutor_only)", 403, "level_tutor_only"],
      ["23505", "x (already_confirmed)", 409, "already_confirmed"],
      ["23514", "x (needs_baseline)", 400, "needs_baseline"],
      ["23514", "x (same_level)", 400, "same_level"],
      ["23514", "x (reason_required)", 400, "reason_required"],
      ["22023", "x (bad_level)", 400, "invalid"],
      ["23505", "x client id was already used", 409, "conflict"],
    ];
    for (const [code, detail, status, error] of cases) {
      const s = store({ recordLevels: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError(code, detail); }) });
      expect(await handleRecordLevels(deps("tutorNguyen", s), NGUYEN, baseline), detail).toMatchObject({ status, body: { error } });
    }
  });
});

describe("handleRecordExternalResult (tutor or parent)", () => {
  it("the parent and the tutor record; without a file storage is never asked", async () => {
    const s = store();
    const st = storage();
    expect(await handleRecordExternalResult(deps("parent", s, st), NGUYEN, result)).toEqual({ status: 201, body: { id: "x1", replayed: false } });
    expect(s.recordExternal).toHaveBeenCalledWith({
      learnerId: NGUYEN, exam: "FCE", takenOn: "2026-09-12", scoreText: "172 · Grade B", domains: ["reading", "listening"], note: null, file: null,
      byMemberId: "m-parent", clientId: "external-0001",
    });
    expect(st.stat).not.toHaveBeenCalled();
    expect((await handleRecordExternalResult(deps("tutorNguyen", store()), NGUYEN, result)).status).toBe(201);
  });

  it("a file must really be in storage at the path built from ids, with the claimed type and size", async () => {
    const file = { id: FILE, mime: "application/pdf", bytes: 2048 };
    const s = store();
    const st = storage();
    expect((await handleRecordExternalResult(deps("parent", s, st), NGUYEN, { ...result, file })).status).toBe(201);
    expect(st.stat).toHaveBeenCalledWith(`${FAMILY}/${NGUYEN}/${FILE}.pdf`);
    expect(s.recordExternal).toHaveBeenCalledWith(expect.objectContaining({ file }));
    expect(await handleRecordExternalResult(deps("parent", store(), storage(null)), NGUYEN, { ...result, file })).toMatchObject({ status: 400, body: { error: "file_missing" } });
    expect(await handleRecordExternalResult(deps("parent", store(), storage({ bytes: 1, mime: "application/pdf" })), NGUYEN, { ...result, file }))
      .toMatchObject({ status: 400, body: { error: "file_mismatch" } });
  });

  it("access first (401 / 404 / 403 for the student); a bad date is explained", async () => {
    const s = store();
    expect((await handleRecordExternalResult(deps(null, s), NGUYEN, result)).status).toBe(401);
    expect((await handleRecordExternalResult(deps("tutorAn", s), NGUYEN, result)).status).toBe(404);
    expect((await handleRecordExternalResult(deps("studentNguyen", s), NGUYEN, result)).status).toBe(403);
    expect(s.recordExternal).not.toHaveBeenCalled();
    const bad = store({ recordExternal: vi.fn(async (): Promise<unknown> => { throw new ReviewDbError("23514", "x (bad_date)"); }) });
    expect(await handleRecordExternalResult(deps("parent", bad), NGUYEN, result)).toMatchObject({ status: 400, body: { error: "bad_date" } });
  });
});

describe("failText", () => {
  it("has one sentence for each new code", () => {
    const t = (status: number, error: string) => failText({ ok: false, status, error });
    expect([t(403, "level_tutor_only"), t(409, "already_confirmed"), t(400, "needs_baseline"), t(400, "same_level"), t(400, "reason_required"), t(400, "bad_date")]).toEqual([
      tutorWorkErrors.levelTutorOnly, tutorWorkErrors.alreadyConfirmed, tutorWorkErrors.needsBaseline, tutorWorkErrors.sameLevel,
      tutorWorkErrors.reasonRequired, tutorWorkErrors.badDate,
    ]);
  });
});
```

Append to `tests/unit/requireAccess.test.ts` (end of file; `status`, `AN`, `NGUYEN` are already defined there):

```ts
describe("SM-2: levels:decide", () => {
  it("only the child's tutor may confirm or adjust a level; the parent reads but may not decide", async () => {
    expect(await status("tutorAn", AN, "levels:decide")).toBe(200);
    expect(await status("parent", AN, "levels:decide")).toBe(403);
    expect(await status("tutorAn", NGUYEN, "levels:decide")).toBe(404);
  });
});
```

Append to `tests/unit/practiceHandlers.test.ts` (end of file; `makeStore`, `makeStorage`, `deps`, `pathOf`, `AN`, `FILE_NEW`, `FILE_KEY`, `vi` are already there):

```ts
describe("SM-2: exam sheets (kind external_result)", () => {
  it("staff get an upload target for a PDF or an image; a stored PDF sheet opens as a download, never inside the site", async () => {
    const st = makeStorage();
    const r = await handleStaffUploadUrl(deps("parent", makeStore(), st), AN, { purpose: "external_result", mime: "application/pdf", bytes: 5000 });
    expect(r.status).toBe(201);
    expect(st.createUpload).toHaveBeenCalledWith(pathOf(AN, FILE_NEW, "pdf"));
    expect((await handleStaffUploadUrl(deps("tutorAn", makeStore(), makeStorage()), AN, { purpose: "external_result", mime: "image/png", bytes: 5000 })).status).toBe(201);
    const sheet = makeStore({ getFile: vi.fn(async () => ({ learnerId: AN, path: pathOf(AN, FILE_KEY, "pdf"), mime: "application/pdf", kind: "external_result" })) });
    const st2 = makeStorage();
    await handleStaffFile(deps("parent", sheet, st2), FILE_KEY);
    expect(st2.createDownload).toHaveBeenCalledWith(pathOf(AN, FILE_KEY, "pdf"), { downloadName: "ket-qua-thi-ngoai.pdf" });
  });
});
```

In `tests/unit/purge.test.ts` replace `"files", "upload_tickets", "reading_reports",` with `"files", "upload_tickets", "reading_reports", "level_decisions", "external_results",`.

- [ ] **Step 2: Run** — `npx vitest run tests/unit/levelsApi.test.ts tests/unit/requireAccess.test.ts tests/unit/practiceHandlers.test.ts tests/unit/purge.test.ts` → FAIL (modules / action / labels missing).

- [ ] **Step 3: Access action** — in `lib/auth/requireAccess.ts`:
  - after the line `  | "practice:write" //     give / retract practice, upload its files, submit on the student's behalf - tutor and parent` add
    `  | "levels:decide" //     confirm the starting levels / adjust one level (SM-2) - the child's tutor only; the database checks it again`
  - replace `    "practice:write",\n  ],\n  parent: [` with `    "practice:write",\n    "levels:decide",\n  ],\n  parent: [`.

- [ ] **Step 4: Storage** — in `lib/storage/rules.ts` replace `export const FILE_KINDS = ["assignment_pdf", "answer_key", "result_image", "work_photo"] as const;` with `export const FILE_KINDS = ["assignment_pdf", "answer_key", "result_image", "work_photo", "external_result"] as const;` (`checkFile` already accepts a PDF or an image for any kind other than `assignment_pdf` / `result_image`). Create `lib/storage/verify.ts`:

```ts
import { buildPath, checkFile, type AllowedMime, type FileKind } from "./rules";
import type { FileStorage } from "./types";

/** Error codes of a file that fails checkFile (shared by the practice and the level routes). */
export const FILE_ERRORS = {
  type: "file_type",
  empty: "file_empty",
  too_big: "file_too_big",
  kind: "file_type",
} as const;

/**
 * Does storage really hold this file of this child, at the path the server builds from ids, with the type and size the browser
 * claimed? Returns an error code, or null when it does. The path is never taken from the request.
 */
export async function verifyStoredFile(
  storage: FileStorage,
  owner: { familyId: string; learnerId: string },
  kind: FileKind,
  meta: { id: string; mime: AllowedMime; bytes: number },
): Promise<string | null> {
  const c = checkFile(kind, meta.mime, meta.bytes);
  if (!c.ok) return FILE_ERRORS[c.reason];
  const stat = await storage.stat(buildPath({ familyId: owner.familyId, learnerId: owner.learnerId, fileId: meta.id, mime: meta.mime }));
  if (!stat) return "file_missing";
  if (stat.bytes !== meta.bytes || stat.mime !== meta.mime) return "file_mismatch";
  return null;
}
```

- [ ] **Step 5: Practice uses the shared check, knows the new purpose and names the download** — in `lib/practice/handlers.ts`:
  - add `import { FILE_ERRORS, verifyStoredFile } from "@/lib/storage/verify";` after the `@/lib/storage/rules` import;
  - delete the local `const FILE_ERRORS = { … } as const;` block (5 keys);
  - replace the body of `verifyStored` with `  return verifyStoredFile(deps.storage, { familyId: grant.learner.familyId, learnerId: grant.learner.id }, kind, meta);` (keep its signature);
  - in `handleStaffFile` replace
    ```ts
      const sent = (file.kind === "work_photo" || file.kind === "result_image") && file.mime === "application/pdf";
      const opts = sent ? { downloadName: safeDownloadName(downloadNames.studentWork, "application/pdf") } : undefined;
    ```
    with
    ```ts
      const sent = (file.kind === "work_photo" || file.kind === "result_image" || file.kind === "external_result") && file.mime === "application/pdf";
      const name = file.kind === "external_result" ? downloadNames.externalResult : downloadNames.studentWork;
      const opts = sent ? { downloadName: safeDownloadName(name, "application/pdf") } : undefined;
    ```
  - run `npx tsc --noEmit -p .` and remove any import that became unused (`checkFile` stays: `makeUpload` uses it).

  In `lib/practice/schemas.ts`: `const isoDate = z` → `export const isoDate = z`; `purpose: z.enum(["assignment_pdf", "answer_key", "submission"]),` → `purpose: z.enum(["assignment_pdf", "answer_key", "external_result", "submission"]),`. (`handleStaffUploadUrl` passes any purpose other than `submission` straight on as the file kind.)

- [ ] **Step 6: Copy and error words** — in `lib/copy/vi.ts`:
  - in `tutorWorkErrors`, after `  alreadyGrouped: "Nhãn này đã được xếp vào nhóm khác. Tải lại trang để xem.",` add:
    ```ts
      levelTutorOnly: "Chỉ cô của em mới xác nhận hoặc điều chỉnh được cấp.",
      alreadyConfirmed: "Mảng này đã được xác nhận rồi. Tải lại trang rồi dùng “Điều chỉnh cấp”.",
      needsBaseline: "Mảng này chưa có cấp khởi điểm. Xác nhận cấp khởi điểm trước.",
      sameLevel: "Cấp mới đang trùng cấp hiện tại.",
      reasonRequired: "Điều chỉnh cấp cần ghi lý do.",
      badDate: "Ngày thi không hợp lệ: không chọn ngày sau hôm nay, không quá 10 năm trước.",
    ```
  - in `downloadNames`, after `  studentWork: "bai-em-gui",` add `  externalResult: "ket-qua-thi-ngoai",`;
  - in `purgePage.countLabels`, after `    reading_reports: "Báo cáo kỹ năng đọc tháng",` add `    level_decisions: "Quyết định cấp đang học",` and `    external_results: "Kết quả thi ngoài",`.

  In `lib/tutorwork/client.ts` `failText`, before `  if (r.status === 403) return tutorWorkErrors.forbidden;` add:
  ```ts
    if (r.error === "level_tutor_only") return tutorWorkErrors.levelTutorOnly;
    if (r.error === "already_confirmed") return tutorWorkErrors.alreadyConfirmed;
    if (r.error === "needs_baseline") return tutorWorkErrors.needsBaseline;
    if (r.error === "same_level") return tutorWorkErrors.sameLevel;
    if (r.error === "reason_required") return tutorWorkErrors.reasonRequired;
    if (r.error === "bad_date") return tutorWorkErrors.badDate;
  ```

- [ ] **Step 7: `lib/levels/schemas.ts`**

```ts
/** Request bodies of the SM-2 routes (zod). Parsed AFTER requireAccess, so outsiders always get 404. */
import { z } from "zod";
import { fileMetaSchema, isoDate } from "@/lib/practice/schemas";
import { CEFR_LEVELS, DOMAIN_KEYS } from "@/lib/skillmap/types";
import { TASK_LEVELS } from "./scale";
import { EXAMS, NOTE_MAX, REASON_MAX, SCORE_MAX } from "./types";

const clientId = z.string().min(8).max(100);
/** A level of either scale; the database checks it against the domain's own scale (bad_level). */
const level = z.enum([...CEFR_LEVELS, ...TASK_LEVELS]);

export const recordLevelsBodySchema = z
  .strictObject({
    client_id: clientId,
    kind: z.enum(["baseline", "adjust"]),
    levels: z.partialRecord(z.enum(DOMAIN_KEYS), level),
    reason: z.string().trim().max(REASON_MAX).optional(),
  })
  .refine(
    (b) => {
      const n = Object.keys(b.levels).length;
      return b.kind === "adjust" ? n === 1 && Boolean(b.reason) : n >= 1;
    },
    { message: "a baseline names 1 to 7 domains; an adjustment exactly one, with a reason", path: ["levels"] },
  );
export type RecordLevelsBody = z.infer<typeof recordLevelsBodySchema>;

export const externalResultBodySchema = z.strictObject({
  client_id: clientId,
  exam: z.enum(EXAMS),
  taken_on: isoDate,
  score_text: z.string().trim().min(1).max(SCORE_MAX),
  domains: z.array(z.enum(DOMAIN_KEYS)).min(1).max(7),
  note: z.string().trim().max(NOTE_MAX).optional(),
  file: fileMetaSchema.optional(),
});
export type ExternalResultBody = z.infer<typeof externalResultBodySchema>;
```

- [ ] **Step 8: `lib/levels/handlers.ts`**

```ts
/**
 * Handlers of the SM-2 writes: POST /api/learners/:id/levels (baseline / adjust - the child's tutor only) and
 * POST /api/learners/:id/external-results (tutor or parent). Same order as lib/reading/handlers.ts: requireAccess first (401 / 404
 * outside scope / 403), then the body (400), then - for an exam sheet - a check that storage really holds the file at the path built
 * from ids, then the service-role store. The SQL checks the actor again (a parent can never record a level, even with a forged call).
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser, type Action } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import type { FileMeta } from "@/lib/practice/schemas";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import type { FileStorage } from "@/lib/storage/types";
import { verifyStoredFile } from "@/lib/storage/verify";
import { externalResultBodySchema, recordLevelsBodySchema } from "./schemas";

export interface LevelStore {
  /** english.eng_record_level (service role). */
  recordLevels(a: { learnerId: string; kind: "baseline" | "adjust"; levels: Record<string, string>; reason: string | null; byMemberId: string; clientId: string }): Promise<unknown>;
  /** english.eng_record_external_result (service role). */
  recordExternal(a: {
    learnerId: string; exam: string; takenOn: string; scoreText: string; domains: string[]; note: string | null; file: FileMeta | null;
    byMemberId: string; clientId: string;
  }): Promise<unknown>;
}

export type LevelDeps = { user: AccessUser; store: LevelStore; storage: FileStorage; access?: Partial<AccessDeps> };

type FailStatus = 400 | 401 | 403 | 404 | 409;
const fail = (status: FailStatus, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

async function guard(deps: LevelDeps, learnerId: string, action: Action): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** The tags in brackets that migration 0020 puts in its messages, and what the screens are told. */
const DB_ANSWERS: { code: string; tag: string; status: FailStatus; error: string }[] = [
  { code: "42501", tag: "tutor_only", status: 403, error: "level_tutor_only" },
  { code: "23505", tag: "already_confirmed", status: 409, error: "already_confirmed" },
  { code: "23514", tag: "needs_baseline", status: 400, error: "needs_baseline" },
  { code: "23514", tag: "same_level", status: 400, error: "same_level" },
  { code: "23514", tag: "reason_required", status: 400, error: "reason_required" },
  { code: "23514", tag: "bad_date", status: 400, error: "bad_date" },
];

function mapDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    const hit = DB_ANSWERS.find((a) => a.code === err.code && err.detail.includes(`(${a.tag})`));
    if (hit) return fail(hit.status, hit.error);
  }
  return fromDbError(err);
}

export async function handleRecordLevels(deps: LevelDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "levels:decide");
  if (!g.ok) return g.result;
  const parsed = recordLevelsBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  const levels = Object.fromEntries(Object.entries(b.levels).filter((e): e is [string, string] => typeof e[1] === "string"));
  try {
    const r = (await deps.store.recordLevels({
      learnerId: g.grant.learner.id,
      kind: b.kind,
      levels,
      reason: b.reason && b.reason.length > 0 ? b.reason : null,
      byMemberId: g.grant.member.id,
      clientId: b.client_id,
    })) as { ids: string[]; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { ids: r.ids, replayed: r.replayed } };
  } catch (err) {
    return mapDbError(err);
  }
}

export async function handleRecordExternalResult(deps: LevelDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "tutorwork:write");
  if (!g.ok) return g.result;
  const parsed = externalResultBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  if (b.file) {
    const bad = await verifyStoredFile(deps.storage, { familyId: g.grant.learner.familyId, learnerId: g.grant.learner.id }, "external_result", b.file);
    if (bad) return fail(400, bad);
  }
  try {
    const r = (await deps.store.recordExternal({
      learnerId: g.grant.learner.id,
      exam: b.exam,
      takenOn: b.taken_on,
      scoreText: b.score_text,
      domains: b.domains,
      note: b.note && b.note.length > 0 ? b.note : null,
      file: b.file ?? null,
      byMemberId: g.grant.member.id,
      clientId: b.client_id,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return mapDbError(err);
  }
}
```

- [ ] **Step 9: Store, route glue, routes**

`lib/levels/supabaseStore.ts`:

```ts
import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LevelStore } from "./handlers";

/** Calls the service-role functions of migration 0020, only after the handler ran requireAccess (the SQL checks the actor again). */
export function createSupabaseLevelStore(): LevelStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  return {
    recordLevels: (a) =>
      call("eng_record_level", { p_learner: a.learnerId, p_kind: a.kind, p_levels: a.levels, p_reason: a.reason, p_by: a.byMemberId, p_client_id: a.clientId }),
    recordExternal: (a) =>
      call("eng_record_external_result", {
        p_learner: a.learnerId, p_exam: a.exam, p_taken_on: a.takenOn, p_score_text: a.scoreText, p_domains: a.domains, p_note: a.note,
        p_file: a.file, p_by: a.byMemberId, p_client_id: a.clientId,
      }),
  };
}
```

`lib/levels/route.ts`:

```ts
import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createFileStorage } from "@/lib/storage/server";
import { createUserClient } from "@/lib/supabase/server";
import type { LevelDeps } from "./handlers";
import { createSupabaseLevelStore } from "./supabaseStore";

/** Session → handler → JSON (no-store); 500 logged. Same glue as lib/reading/route.ts, plus file storage for the exam-sheet check. */
export async function runLevelRoute(routeName: string, run: (deps: LevelDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({ user, store: createSupabaseLevelStore(), storage: createFileStorage() });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
```

`app/api/learners/[id]/levels/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleRecordLevels } from "@/lib/levels/handlers";
import { runLevelRoute } from "@/lib/levels/route";

/** POST /api/learners/:id/levels - confirm the starting levels (baseline) or adjust one level with a reason. The child's tutor only. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runLevelRoute("POST /api/learners/[id]/levels", (deps) => handleRecordLevels(deps, id, body));
}
```

`app/api/learners/[id]/external-results/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleRecordExternalResult } from "@/lib/levels/handlers";
import { runLevelRoute } from "@/lib/levels/route";

/** POST /api/learners/:id/external-results - an external exam result (tutor or parent of the child). It never changes a level. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runLevelRoute("POST /api/learners/[id]/external-results", (deps) => handleRecordExternalResult(deps, id, body));
}
```

- [ ] **Step 10: Run** — `npx vitest run tests/unit/levelsApi.test.ts tests/unit/requireAccess.test.ts tests/unit/practiceHandlers.test.ts tests/unit/purge.test.ts tests/unit/storageRules.test.ts tests/unit/levels.test.ts` → PASS; `npm run typecheck && npm run lint` → clean.

- [ ] **Step 11: Commit**

```bash
git add lib/auth/requireAccess.ts lib/storage/rules.ts lib/storage/verify.ts lib/practice/handlers.ts lib/practice/schemas.ts lib/tutorwork/client.ts lib/copy/vi.ts \
  lib/levels/schemas.ts lib/levels/handlers.ts lib/levels/supabaseStore.ts lib/levels/route.ts \
  app/api/learners/[id]/levels/route.ts app/api/learners/[id]/external-results/route.ts \
  tests/unit/levelsApi.test.ts tests/unit/requireAccess.test.ts tests/unit/practiceHandlers.test.ts tests/unit/purge.test.ts
git commit -m "feat(sm-2): API - record levels (tutor only, levels:decide) and external results with an exam sheet"
```

---

### Task 6: "Hồ sơ cấp" page — summary, 7 bars, domain detail, milestones & history

**Files:**
- Create: `lib/levels/load.ts`, `components/levels/LevelSummaryCard.tsx`, `components/levels/LevelBars.tsx`, `components/levels/DomainDetail.tsx`, `components/levels/Milestones.tsx`, `app/learners/[id]/levels/page.tsx`
- Modify: `components/LearnerCard.tsx` (link "Hồ sơ cấp")
- Test: `tests/unit/levelsUi.test.ts` (grown in Tasks 7 and 9)

**Interfaces:**
- Consumes: Task 3 `eng_level_profile`; Task 4 `parseLevelProfile`, `strongestWeakest`, `barFraction`, `bandOf`, `profileSummary`, `domainSentence`, `boxValue`, `levelText`, `monthLabel`, `dayLabel`, `levelCopy`, `externalCopy`; `loadSkillMap` + `groupWeakPoints` (SM-1); `loadWeakPoints(learnerId, "8")` (`lib/tutorwork/load.ts`); `requireLearnerPage` (`lib/tutorwork/page.ts`); `weakPage.statusRepeat` / `statusWatch`.
- Produces:
  - `loadLevelProfile(learnerId: string): Promise<LevelProfile>` (server only, service role; call after `requireLearnerPage` / `requireAccess`).
  - `<LevelSummaryCard alias profile />` (`data-testid` `level-summary`, `level-summary-text`, `level-strongest`, `level-focus`, `level-waiting`).
  - `<LevelBars profile learnerId active />` (`level-bars`; each bar a link `level-bar-{key}` with `data-status="assumed|confirmed"` to `?domain={key}`; assumed text `level-assumed-{key}`).
  - `<DomainDetail alias domain groups weak learnerId canDecide />` (`level-detail-{key}`, `level-content`, `level-mastery`, `level-weak`, `level-decide-link`).
  - `<Milestones profile learnerId />` (`milestones`, `add-external`, `external-{id}`, `external-file-{id}`, `reading-report-{month}`, `history-{id}`).
  - Page `/learners/[id]/levels?domain=` (tutor + parent; `tutorwork:read`).

- [ ] **Step 1: Write the failing UI test** — `tests/unit/levelsUi.test.ts`

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LearnerCard } from "@/components/LearnerCard";
import { DomainDetail } from "@/components/levels/DomainDetail";
import { LevelBars } from "@/components/levels/LevelBars";
import { LevelSummaryCard } from "@/components/levels/LevelSummaryCard";
import { Milestones } from "@/components/levels/Milestones";
import { levelCopy } from "@/lib/copy/vi";
import type { SkillGroup } from "@/lib/skillmap/types";
import type { WeakPoint } from "@/lib/tutorwork/types";
import { assumedProfile, confirmedProfile } from "./fixtures/levels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const count = (html: string, s: string) => html.split(s).length - 1;
const L = "b0000000-0000-4000-8000-000000000001";
const NO_DAT = /đạt/iu;
const wp = (tagKey: string, status: WeakPoint["status"]): WeakPoint => ({
  tagKey, label: tagKey, group: null, sources: status === "repeat" ? 2 : 1, bySource: { test: 1, lesson: 0, writing: 0, practice: 0 },
  itemsWrong: { test: 1, practice: 0 }, asked: 0, askedWrong: 0, lastSeen: "2026-10-01", recheckDueOn: null, recheckDue: false, lastRecheck: null, status, events: [],
});
const readingGroups: SkillGroup[] = [
  { key: "re-gist-detail", name: "Ý chính & chi tiết", descriptions: { "A1-A2": "Biển báo", B1: "Bài báo đơn giản", B2: "Bài dài, tóm tắt", "C1-C2": "Văn bản phức" }, leaves: [] },
  { key: "re-strategy", name: "Chiến lược", descriptions: { "A1-A2": "Tìm thông tin", B1: null, B2: null, "C1-C2": null }, leaves: [] },
];

describe("LevelSummaryCard", () => {
  it("asks where the child is, says it in one plain sentence, and fills Mạnh nhất / Cần tập trung / Đang chờ cô (D4)", () => {
    const html = render(createElement(LevelSummaryCard, { alias: "Nguyên", profile: confirmedProfile() }));
    expect(html).toContain(levelCopy.whereTitle("Nguyên"));
    expect(html).toMatch(/data-testid="level-strongest"[\s\S]*?Đọc · B2\+/);
    expect(html).toMatch(/data-testid="level-focus"[\s\S]*?Viết · B1\+/);
    expect(html).toMatch(/data-testid="level-waiting"[\s\S]*?Không có/);
    expect(html).not.toMatch(NO_DAT);
    expect(count(render(createElement(LevelSummaryCard, { alias: "Nguyên", profile: assumedProfile() })), levelCopy.even)).toBe(2);
  });
});

describe("LevelBars", () => {
  it("7 bars, one per domain; assumed bars are dashed and say 'Ước lượng — cô chưa xác nhận' in words (D5)", () => {
    const html = render(createElement(LevelBars, { profile: confirmedProfile(), learnerId: L, active: "reading" }));
    expect(count(html, 'data-testid="level-bar-')).toBe(7);
    expect(html).toMatch(/data-testid="level-bar-reading"[^>]*data-status="confirmed"/);
    expect(html).toMatch(/data-testid="level-bar-grammar"[^>]*data-status="assumed"/);
    expect(count(html, levelCopy.assumed)).toBe(5);
    expect(html).toContain("border-dashed");
    expect(html).toMatch(/data-testid="level-bar-reading"[\s\S]*?width:78%/); // B2+ = 7/9 of A1 → C2
    expect(html).toMatch(/data-testid="level-bar-thinking"[\s\S]*?width:50%[\s\S]*?bậc 2/); // its own 1 → 4 scale
    expect(html).toContain(levelCopy.scaleTask);
    expect(html).toContain(`href="/learners/${L}/levels?domain=writing"`);
    expect(html).not.toMatch(NO_DAT);
  });
});

describe("DomainDetail", () => {
  it("a plain sentence, what this level covers, the honest empty state before S7 (D3), the domain's weak points, and the tutor's link", () => {
    const reading = confirmedProfile().domains.find((d) => d.key === "reading")!;
    const html = render(createElement(DomainDetail, {
      alias: "Nguyên", domain: reading, groups: readingGroups, weak: [wp("doc-inference", "repeat"), wp("doc-sequence", "ok")], learnerId: L, canDecide: true,
    }));
    expect(html).toContain(levelCopy.sentenceConfirmed("Nguyên", "Đọc", "B2+"));
    expect(html).toContain(levelCopy.confirmedOn("21/10/2026", "Cô Lan"));
    expect(html).toContain("Bài dài, tóm tắt");
    expect(html).not.toContain("Tìm thông tin"); // another band
    expect(count(html, levelCopy.notYet)).toBe(3);
    expect(html).toContain("doc-inference");
    expect(html).not.toContain("doc-sequence"); // already fine
    expect(html).toContain(`href="/learners/${L}/levels/adjust?domain=reading"`);
    expect(html).toContain(`href="/learners/${L}/weak?domain=reading"`);
    expect(html).not.toMatch(NO_DAT);
  });

  it("an assumed domain says so and offers the baseline screen; the parent gets no decide link", () => {
    const grammar = confirmedProfile().domains[0]!;
    const tutor = render(createElement(DomainDetail, { alias: "Nguyên", domain: grammar, groups: [], weak: [], learnerId: L, canDecide: true }));
    expect(tutor).toContain(levelCopy.sentenceAssumed("Nguyên", "Ngữ pháp", "B2"));
    expect(tutor).toContain(levelCopy.assumed);
    expect(tutor).toContain(`href="/learners/${L}/levels/baseline"`);
    expect(tutor).toContain(levelCopy.weakNone);
    const parent = render(createElement(DomainDetail, { alias: "Nguyên", domain: grammar, groups: [], weak: [], learnerId: L, canDecide: false }));
    expect(parent).not.toContain('data-testid="level-decide-link"');
  });
});

describe("Milestones", () => {
  it("external results with domains and the sheet; reading reports by month without a source; history with kind, day, tutor, reason", () => {
    const html = render(createElement(Milestones, { profile: confirmedProfile(), learnerId: L }));
    expect(html).toContain(levelCopy.externalLine("FCE (B2 First)", "12/09/2026", "172 · Grade B"));
    expect(html).toContain(levelCopy.externalDomains("Nghe, Đọc"));
    expect(html).toContain('href="/api/files/f0000000-0000-4000-8000-000000000001"');
    expect(html).toContain(levelCopy.readingReportLine("10/2026"));
    expect(html).toContain(levelCopy.historyLine("Viết", "B2", "B1+"));
    expect(html).toContain(levelCopy.historyMeta("Điều chỉnh", "22/10/2026", "Cô Lan"));
    expect(html).toContain("“Bài luận còn thiếu liên kết”");
    expect(html).toContain(`href="/learners/${L}/levels/external/new"`);
    expect(html).not.toMatch(/tomo/i);
    expect(html).not.toMatch(NO_DAT);
    const empty = render(createElement(Milestones, { profile: assumedProfile(), learnerId: L }));
    expect(empty).toContain(levelCopy.externalNone);
    expect(empty).toContain(levelCopy.historyNone);
  });

  it("the learner card links to Hồ sơ cấp", () => {
    const html = render(createElement(LearnerCard, {
      learner: { id: L, alias: "Nguyên (thử)", trackId: "B", status: "active", isTest: true, color: null }, today: null, role: "parent",
    }));
    expect(html).toContain(`href="/learners/${L}/levels"`);
    expect(html).toContain(levelCopy.link);
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run tests/unit/levelsUi.test.ts` → FAIL (components missing).

- [ ] **Step 3: `lib/levels/load.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseLevelProfile } from "./shape";
import type { LevelProfile } from "./types";

/** The level profile of one child (eng_level_profile, service role). Call only after requireLearnerPage / requireAccess. */
export async function loadLevelProfile(learnerId: string): Promise<LevelProfile> {
  const { data, error } = await createAdminClient().rpc("eng_level_profile", { p_learner: learnerId });
  if (error) throw new Error(`eng_level_profile failed: ${error.code ?? error.message ?? "error"}`);
  return parseLevelProfile(data);
}
```

- [ ] **Step 4: `components/levels/LevelSummaryCard.tsx`**

```tsx
import { levelCopy } from "@/lib/copy/vi";
import { strongestWeakest } from "@/lib/levels/scale";
import type { LevelProfile } from "@/lib/levels/types";
import { boxValue, profileSummary } from "@/lib/levels/view";

/** "{tên} đang ở đâu?": one plain sentence (conclusion first), then Mạnh nhất / Cần tập trung / Đang chờ cô (D4). Staff only. */
export function LevelSummaryCard({ alias, profile }: { alias: string; profile: LevelProfile }) {
  const { strongest, weakest, even } = strongestWeakest(profile.domains);
  const boxes = [
    { key: "strongest", title: levelCopy.strongest, value: even ? levelCopy.even : boxValue(strongest) },
    { key: "focus", title: levelCopy.focus, value: even ? levelCopy.even : boxValue(weakest) },
    // Proposals to move up come with S7; until then nothing waits for the tutor.
    { key: "waiting", title: levelCopy.waiting, value: levelCopy.waitingNone },
  ];
  return (
    <section aria-labelledby="level-where" className="mt-6 rounded-2xl border border-line bg-white p-5" data-testid="level-summary">
      <h2 id="level-where" className="text-xl font-bold">
        {levelCopy.whereTitle(alias)}
      </h2>
      <p className="mt-2" data-testid="level-summary-text">
        {profileSummary(alias, profile)}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {boxes.map((b) => (
          <div key={b.key} className="flex flex-col gap-1 rounded-xl border border-line bg-paper px-4 py-3" data-testid={`level-${b.key}`}>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{b.title}</span>
            <span className="font-semibold">{b.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: `components/levels/LevelBars.tsx`**

```tsx
import Link from "next/link";
import { levelCopy } from "@/lib/copy/vi";
import { barFraction } from "@/lib/levels/scale";
import type { LevelProfile } from "@/lib/levels/types";
import { levelText } from "@/lib/levels/view";
import { CEFR_LEVELS } from "@/lib/skillmap/types";

/** Striped fill of an assumed level (with a dashed border and words: never colour alone, UX guide §4.3). */
const STRIPES = "repeating-linear-gradient(45deg, #CFE0D8 0 6px, #F4F8F5 6px 12px)";

/**
 * 7 horizontal bars (D5): the 6 CEFR domains on one A1 → C2 scale, the thinking domain on its own 1 → 4 scale with the same width.
 * Each bar opens the detail of its domain (?domain=). Staff only.
 */
export function LevelBars({ profile, learnerId, active }: { profile: LevelProfile; learnerId: string; active: string }) {
  return (
    <section aria-labelledby="level-bars-title" className="mt-6 rounded-xl border border-line bg-white p-5" data-testid="level-bars">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="level-bars-title" className="text-lg font-semibold">
          {levelCopy.barsTitle}
        </h2>
        <span className="text-xs text-muted">{levelCopy.scaleCefr}</span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {profile.domains.map((d) => {
          const pct = Math.round(barFraction(d.scale, d.current) * 100);
          const on = d.key === active;
          const assumed = d.status === "assumed";
          return (
            <li key={d.key}>
              <Link
                href={`/learners/${learnerId}/levels?domain=${d.key}`}
                aria-current={on ? "true" : undefined}
                data-testid={`level-bar-${d.key}`}
                data-status={d.status}
                className={`grid min-h-11 grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-ink no-underline sm:grid-cols-[9rem_minmax(0,1fr)_12rem] ${on ? "bg-[#E3ECE8]" : "hover:bg-paper"}`}
              >
                <span className="text-sm font-medium">{d.name}</span>
                <span className="relative h-4 rounded-full bg-[#EEF1EC]" aria-hidden="true">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${assumed ? "border-2 border-dashed border-accent" : "bg-accent"}`}
                    style={assumed ? { width: `${pct}%`, backgroundImage: STRIPES } : { width: `${pct}%` }}
                  />
                </span>
                <span className="col-span-2 text-sm sm:col-span-1">
                  <b className="font-semibold">{levelText(d.scale, d.current)}</b>
                  {d.scale === "task_level" ? <span className="text-muted"> · {levelCopy.scaleTask}</span> : null}
                  {assumed ? (
                    <span className="block text-xs text-muted" data-testid={`level-assumed-${d.key}`}>
                      {levelCopy.assumed}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 hidden grid-cols-9 text-center text-[11px] text-muted sm:ml-[9.75rem] sm:mr-[12.75rem] sm:grid" aria-hidden="true">
        {CEFR_LEVELS.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </p>
    </section>
  );
}
```

- [ ] **Step 6: `components/levels/DomainDetail.tsx`**

```tsx
import Link from "next/link";
import { levelCopy, weakPage } from "@/lib/copy/vi";
import { bandOf } from "@/lib/levels/scale";
import type { DomainLevel } from "@/lib/levels/types";
import { dayLabel, domainSentence, levelText } from "@/lib/levels/view";
import type { SkillGroup } from "@/lib/skillmap/types";
import type { WeakPoint } from "@/lib/tutorwork/types";

const linkClass = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline";

/**
 * The detail of one domain (D14): a plain sentence, what the current level covers (group descriptions of SM-1 for that band), the
 * three boxes that need skill states (honest empty state until S7, D3), and up to 5 weak points of the domain. The tutor also gets
 * "Xác nhận cấp khởi điểm" (assumed) or "Điều chỉnh cấp" (confirmed).
 */
export function DomainDetail({
  alias,
  domain,
  groups,
  weak,
  learnerId,
  canDecide,
}: {
  alias: string;
  domain: DomainLevel;
  groups: SkillGroup[];
  weak: WeakPoint[];
  learnerId: string;
  canDecide: boolean;
}) {
  const band = bandOf(domain.scale, domain.current);
  const content = groups.flatMap((g) => {
    const text = band ? g.descriptions[band] : null;
    return text ? [{ key: g.key, name: g.name, text }] : [];
  });
  const points = weak.filter((p) => p.status !== "ok").slice(0, 5);
  const assumed = domain.status === "assumed";
  const decideHref = assumed ? `/learners/${learnerId}/levels/baseline` : `/learners/${learnerId}/levels/adjust?domain=${domain.key}`;
  return (
    <section aria-labelledby="level-detail-title" className="mt-6 rounded-xl border border-line bg-white p-5" data-testid={`level-detail-${domain.key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="level-detail-title" className="text-xl font-semibold">
          {levelCopy.detailTitle(domain.name)}
        </h2>
        {canDecide ? (
          <Link href={decideHref} className={linkClass} data-testid="level-decide-link">
            {assumed ? levelCopy.confirmLink : levelCopy.adjustLink}
          </Link>
        ) : null}
      </div>
      <p className="mt-2">{domainSentence(alias, domain)}</p>
      <p className="text-sm text-muted">{!assumed && domain.decidedAt ? levelCopy.confirmedOn(dayLabel(domain.decidedAt), domain.decidedBy) : levelCopy.assumed}</p>

      {content.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold">{levelCopy.contentTitle(levelText(domain.scale, domain.current))}</h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm" data-testid="level-content">
            {content.map((c) => (
              <li key={c.key}>
                <b className="font-semibold">{c.name}:</b> {c.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="level-mastery">
        {[levelCopy.solidTitle, levelCopy.practisingTitle, levelCopy.nextTitle].map((t) => (
          <div key={t} className="rounded-lg border border-dashed border-line px-3 py-2">
            <h3 className="text-sm font-semibold">{t}</h3>
            <p className="text-sm text-muted">{levelCopy.notYet}</p>
          </div>
        ))}
      </div>

      <div className="mt-4" data-testid="level-weak">
        <h3 className="text-base font-semibold">{levelCopy.weakTitle}</h3>
        {points.length === 0 ? (
          <p className="text-sm text-muted">{levelCopy.weakNone}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {points.map((p) => (
              <li key={p.tagKey}>
                {p.label} · {p.status === "repeat" ? weakPage.statusRepeat : weakPage.statusWatch}
              </li>
            ))}
          </ul>
        )}
        <Link href={`/learners/${learnerId}/weak?domain=${domain.key}`} className={linkClass}>
          {levelCopy.weakMore}
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: `components/levels/Milestones.tsx`**

```tsx
import Link from "next/link";
import { externalCopy, levelCopy } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import type { LevelProfile } from "@/lib/levels/types";
import { dayLabel, levelText, monthLabel } from "@/lib/levels/view";
import type { DomainKey } from "@/lib/skillmap/types";

/**
 * "Mốc ngoài & lịch sử": external exam results (with their sheet), the monthly reading reports as milestones of Đọc (month only,
 * no source - D10), then every level decision with its kind, day, tutor and reason. Staff only.
 */
export function Milestones({ profile, learnerId }: { profile: LevelProfile; learnerId: string }) {
  const byKey = new Map(profile.domains.map((d) => [d.key, d]));
  const name = (k: DomainKey) => byKey.get(k)?.name ?? k;
  const lv = (k: DomainKey, level: string) => levelText(byKey.get(k)?.scale ?? "cefr", level);
  return (
    <section aria-labelledby="milestones-title" className="mt-6 rounded-xl border border-line bg-white p-5" data-testid="milestones">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="milestones-title" className="text-xl font-semibold">
          {levelCopy.milestonesTitle}
        </h2>
        <Link
          href={`/learners/${learnerId}/levels/external/new`}
          data-testid="add-external"
          className="inline-flex min-h-11 items-center rounded-xl border border-accent px-4 text-sm font-semibold text-accent no-underline"
        >
          {levelCopy.addExternal}
        </Link>
      </div>

      <h3 className="mt-4 text-base font-semibold">{levelCopy.externalTitle}</h3>
      {profile.externalResults.length === 0 && profile.readingReports.length === 0 ? <p className="text-sm text-muted">{levelCopy.externalNone}</p> : null}
      <ul className="mt-1 flex flex-col gap-2 text-sm">
        {profile.externalResults.map((e) => (
          <li key={e.id} data-testid={`external-${e.id}`} className="flex flex-col gap-0.5 rounded-lg bg-paper px-4 py-2">
            <span className="font-semibold">{levelCopy.externalLine(externalCopy.examLabels[e.exam] ?? e.exam, formatDateVi(e.takenOn), e.scoreText)}</span>
            <span className="text-muted">{levelCopy.externalDomains(e.domains.map(name).join(", "))}</span>
            {e.note ? <span>“{e.note}”</span> : null}
            {e.fileId ? (
              <a href={`/api/files/${e.fileId}`} className="text-accent underline" data-testid={`external-file-${e.id}`}>
                {levelCopy.openFile}
              </a>
            ) : null}
          </li>
        ))}
        {profile.readingReports.map((r) => (
          <li key={r.month} data-testid={`reading-report-${r.month}`} className="rounded-lg bg-paper px-4 py-2">
            {levelCopy.readingReportLine(monthLabel(r.month))}
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-base font-semibold">{levelCopy.historyTitle}</h3>
      {profile.history.length === 0 ? (
        <p className="text-sm text-muted">{levelCopy.historyNone}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-2 text-sm">
          {profile.history.map((h) => (
            <li key={h.id} data-testid={`history-${h.id}`} className="flex flex-col gap-0.5 border-l-4 border-line pl-3">
              <span className="font-semibold">{levelCopy.historyLine(name(h.domainKey), lv(h.domainKey, h.from), lv(h.domainKey, h.to))}</span>
              <span className="text-muted">{levelCopy.historyMeta(levelCopy.kindLabels[h.kind] ?? h.kind, dayLabel(h.decidedAt), h.decidedBy)}</span>
              {h.reason ? <span>“{h.reason}”</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 8: The page** — `app/learners/[id]/levels/page.tsx`

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { DomainDetail } from "@/components/levels/DomainDetail";
import { LevelBars } from "@/components/levels/LevelBars";
import { LevelSummaryCard } from "@/components/levels/LevelSummaryCard";
import { Milestones } from "@/components/levels/Milestones";
import { learnerWithTrack, levelCopy } from "@/lib/copy/vi";
import { loadLevelProfile } from "@/lib/levels/load";
import { strongestWeakest } from "@/lib/levels/scale";
import { groupWeakPoints } from "@/lib/skillmap/group";
import { loadSkillMap } from "@/lib/skillmap/load";
import { loadWeakPoints } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/**
 * "Hồ sơ cấp" of one child (parent and tutor; students get 404): where the child is, 7 bars, the detail of one domain (?domain=,
 * default the "Cần tập trung" domain, else Ngữ pháp), external milestones and the history of level decisions.
 */
export default async function LevelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ domain?: string }> }) {
  const { id } = await params;
  const { domain } = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  const [profile, map, weak] = await Promise.all([loadLevelProfile(learner.id), loadSkillMap(learner.id), loadWeakPoints(learner.id, "8")]);
  const focus = strongestWeakest(profile.domains).weakest[0]?.key;
  const active = profile.domains.find((d) => d.key === domain) ?? profile.domains.find((d) => d.key === focus) ?? profile.domains[0]!;
  const groups = map.domains.find((d) => d.key === active.key)?.groups ?? [];
  const tile = groupWeakPoints(map, weak.tags).find((t) => t.key === active.key);
  const canDecide = member.role === "tutor";

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-4xl px-4 py-10" data-testid="levels-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {levelCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{levelCopy.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{levelCopy.intro}</p>
        <LevelSummaryCard alias={learner.alias} profile={profile} />
        <LevelBars profile={profile} learnerId={learner.id} active={active.key} />
        <DomainDetail alias={learner.alias} domain={active} groups={groups} weak={tile?.points ?? []} learnerId={learner.id} canDecide={canDecide} />
        <Milestones profile={profile} learnerId={learner.id} />
      </main>
    </>
  );
}
```

- [ ] **Step 9: Link from the learner card** — in `components/LearnerCard.tsx`:
  - add `levelCopy` to the import list from `@/lib/copy/vi`;
  - right after the `weakPage.link` `<Link>` (the one whose text is `{weakPage.link}` in the bottom link row) add:
    ```tsx
        <Link href={`/learners/${learner.id}/levels`} data-testid={`levels-link-${learner.id}`} className={linkClass}>
          {levelCopy.link}
        </Link>
    ```

- [ ] **Step 10: Run** — `npx vitest run tests/unit/levelsUi.test.ts tests/unit/tutorWorkUi.test.ts tests/unit/lightOnly.test.ts tests/unit/copyNoProvider.test.ts` → PASS; `npm run typecheck && npm run lint` → clean.

- [ ] **Step 11: Commit**

```bash
git add lib/levels/load.ts components/levels/LevelSummaryCard.tsx components/levels/LevelBars.tsx components/levels/DomainDetail.tsx components/levels/Milestones.tsx \
  "app/learners/[id]/levels/page.tsx" components/LearnerCard.tsx tests/unit/levelsUi.test.ts
git commit -m "feat(sm-2): 'Hồ sơ cấp' - where the child is, 7 level bars, domain detail, external milestones and history"
```

---

### Task 7: Forms — "Xác nhận cấp khởi điểm", "Điều chỉnh cấp", "Thêm kết quả thi ngoài"

**Files:**
- Create: `components/levels/BaselineForm.tsx`, `components/levels/AdjustForm.tsx`, `components/levels/ExternalResultForm.tsx`, `app/learners/[id]/levels/baseline/page.tsx`, `app/learners/[id]/levels/adjust/page.tsx`, `app/learners/[id]/levels/external/new/page.tsx`
- Test: `tests/unit/levelsUi.test.ts`

**Interfaces:**
- Consumes: `POST /api/learners/:id/levels`, `POST /api/learners/:id/external-results`, `POST /api/learners/:id/files` with `{purpose: "external_result", mime, bytes}` (Task 5); `postJson`, `failText` (`lib/tutorwork/client.ts`); `uploadAll`, `practiceErrorText`, `UploadCache` (`lib/practice/client.ts`); `prepareFile`, `Prepared` (`lib/storage/clientUpload.ts`); `levelsOf` (Task 4); `loadLevelProfile` (Task 6); `todayVn`, `addDays` (`lib/inquiries/dates.ts`).
- Produces:
  - `<BaselineForm learnerId rows />` with `type BaselineRow = { key: DomainKey; name: string; scale: Scale; assumed: string }` (`baseline-form`, `baseline-{key}`, `baseline-note`, `baseline-save`, `baseline-msg`).
  - `<AdjustForm learnerId domain={{ key, name, scale, current }} />` (`adjust-form`, `adjust-current`, `adjust-level`, `adjust-reason`, `adjust-save`, `adjust-msg`).
  - `<ExternalResultForm learnerId domains today minDate />` (`external-form`, `external-exam`, `external-date`, `external-score`, `external-domain-{key}`, `external-note`, `external-file`, `external-save`, `external-msg`).
  - Pages `/learners/[id]/levels/baseline` and `/levels/adjust?domain=` (`levels:decide`: tutor only), `/levels/external/new` (`tutorwork:write`: tutor and parent). After saving, each form goes back to `/learners/[id]/levels`.

- [ ] **Step 1: Append the failing tests** to `tests/unit/levelsUi.test.ts` — add these imports at the top:

```ts
import { AdjustForm } from "@/components/levels/AdjustForm";
import { BaselineForm } from "@/components/levels/BaselineForm";
import { ExternalResultForm } from "@/components/levels/ExternalResultForm";
import { externalCopy, levelFormCopy } from "@/lib/copy/vi";
```

(merge `externalCopy, levelFormCopy` into the existing `@/lib/copy/vi` import) and append:

```ts
describe("forms", () => {
  it("baseline: one row per unconfirmed domain, prefilled with the assumed level; the thinking row offers bậc 1–4", () => {
    const html = render(createElement(BaselineForm, {
      learnerId: L,
      rows: [{ key: "grammar", name: "Ngữ pháp", scale: "cefr", assumed: "B2" }, { key: "thinking", name: "Tư duy", scale: "task_level", assumed: "2" }],
    }));
    expect(html).toMatch(/data-testid="baseline-grammar"[\s\S]*?<option value="B2" selected="">B2<\/option>/);
    expect((html.match(/<option value="[ABC][12]\+?"/g) ?? []).length).toBe(9);
    expect(html).toMatch(/data-testid="baseline-thinking"[\s\S]*?<option value="2" selected="">bậc 2<\/option>/);
    expect(html).toContain(levelFormCopy.assumedHint("B2"));
    expect(html).toContain(levelFormCopy.saveBaseline);
    expect(html).not.toMatch(NO_DAT);
  });

  it("adjust: shows the current level, offers the domain's own scale and needs a reason", () => {
    const html = render(createElement(AdjustForm, { learnerId: L, domain: { key: "writing", name: "Viết", scale: "cefr", current: "B1+" } }));
    expect(html).toContain(levelFormCopy.current("B1+"));
    expect(html).toMatch(/<option value="B1\+" selected="">B1\+<\/option>/);
    expect(html).toMatch(/<textarea[^>]*required=""[^>]*data-testid="adjust-reason"/);
    expect(html).toContain(levelFormCopy.reason);
    expect(html).not.toMatch(NO_DAT);
  });

  it("external result: 8 exams, a date no later than today, 7 domain boxes, an optional PDF or image", () => {
    const html = render(createElement(ExternalResultForm, {
      learnerId: L, domains: assumedProfile().domains.map((d) => ({ key: d.key, name: d.name })), today: "2026-10-22", minDate: "2016-10-25",
    }));
    expect((html.match(/<option value="(KET|PET|FCE|CAE|CPE|VAO10_MOCK|SCHOOL|OTHER)"/g) ?? []).length).toBe(8);
    expect(html).toContain(externalCopy.examLabels.VAO10_MOCK);
    expect(html).toMatch(/<input[^>]*type="date"[^>]*max="2026-10-22"/);
    expect(count(html, 'data-testid="external-domain-')).toBe(7);
    expect(html).toContain('accept="application/pdf,image/png,image/jpeg,image/webp"');
    expect(html).not.toMatch(NO_DAT);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/levelsUi.test.ts` → FAIL (3 tests: modules missing).

- [ ] **Step 3: `components/levels/BaselineForm.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { levelCopy, levelFormCopy } from "@/lib/copy/vi";
import { levelsOf } from "@/lib/levels/scale";
import { REASON_MAX, type Scale } from "@/lib/levels/types";
import type { DomainKey } from "@/lib/skillmap/types";
import { failText, postJson } from "@/lib/tutorwork/client";

export type BaselineRow = { key: DomainKey; name: string; scale: Scale; assumed: string };

/** "Xác nhận cấp khởi điểm" (D6): every not-yet-confirmed domain prefilled with its assumed level, one optional note, one save. Tutor only. */
export function BaselineForm({ learnerId, rows }: { learnerId: string; rows: BaselineRow[] }) {
  const router = useRouter();
  const [levels, setLevels] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.key, r.assumed])));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // One client id per screen: a retry after a lost answer is recognised as the same save (replayed).
  const [clientId] = useState(() => crypto.randomUUID());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const r = await postJson(`/api/learners/${learnerId}/levels`, {
      client_id: clientId,
      kind: "baseline",
      levels,
      ...(note.trim() ? { reason: note.trim() } : {}),
    });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: failText(r) });
    setMsg({ ok: true, text: levelFormCopy.saved });
    router.push(`/learners/${learnerId}/levels`);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-4" data-testid="baseline-form">
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
            <span className="flex min-w-0 flex-col">
              <b className="font-semibold">{r.name}</b>
              <span className="text-xs text-muted">{levelFormCopy.assumedHint(levelCopy.levelName(r.scale, r.assumed))}</span>
            </span>
            <select
              aria-label={levelFormCopy.levelOf(r.name)}
              value={levels[r.key] ?? r.assumed}
              onChange={(e) => setLevels({ ...levels, [r.key]: e.target.value })}
              data-testid={`baseline-${r.key}`}
              className="min-h-11 rounded-lg border border-line bg-white px-2"
            >
              {levelsOf(r.scale).map((l) => (
                <option key={l} value={l}>
                  {levelCopy.levelName(r.scale, l)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{levelFormCopy.note}</span>
        <textarea
          value={note}
          maxLength={REASON_MAX}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          data-testid="baseline-note"
          className="rounded-lg border border-line bg-white px-3 py-2"
        />
      </label>
      {msg ? (
        <p role="status" data-testid="baseline-msg" className={msg.ok ? "text-accent" : "font-medium text-[#7a2a0c]"}>
          {msg.text}
        </p>
      ) : null}
      <button type="submit" disabled={busy} data-testid="baseline-save" className="min-h-12 rounded-xl bg-accent px-5 text-base font-semibold text-white disabled:opacity-60">
        {busy ? levelFormCopy.saving : levelFormCopy.saveBaseline}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: `components/levels/AdjustForm.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { levelCopy, levelFormCopy } from "@/lib/copy/vi";
import { levelsOf } from "@/lib/levels/scale";
import { REASON_MAX, type Scale } from "@/lib/levels/types";
import type { DomainKey } from "@/lib/skillmap/types";
import { failText, postJson } from "@/lib/tutorwork/client";

/** "Điều chỉnh cấp" (P2-c, D6): one domain, up or down, reason required; the parent sees it on her home. Tutor only. */
export function AdjustForm({ learnerId, domain }: { learnerId: string; domain: { key: DomainKey; name: string; scale: Scale; current: string } }) {
  const router = useRouter();
  const [level, setLevel] = useState(domain.current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [clientId] = useState(() => crypto.randomUUID());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (level === domain.current) return setMsg(levelFormCopy.sameLevel);
    if (!reason.trim()) return setMsg(levelFormCopy.reasonRequired);
    setBusy(true);
    const r = await postJson(`/api/learners/${learnerId}/levels`, { client_id: clientId, kind: "adjust", levels: { [domain.key]: level }, reason: reason.trim() });
    setBusy(false);
    if (!r.ok) return setMsg(failText(r));
    router.push(`/learners/${learnerId}/levels?domain=${domain.key}`);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-4 rounded-xl border border-line bg-white p-5" data-testid="adjust-form">
      <h2 className="text-lg font-semibold">{domain.name}</h2>
      <p className="text-sm" data-testid="adjust-current">
        {levelFormCopy.current(levelCopy.levelName(domain.scale, domain.current))}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{levelFormCopy.newLevel}</span>
        <select value={level} onChange={(e) => setLevel(e.target.value)} data-testid="adjust-level" className="min-h-11 max-w-40 rounded-lg border border-line bg-white px-2">
          {levelsOf(domain.scale).map((l) => (
            <option key={l} value={l}>
              {levelCopy.levelName(domain.scale, l)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{levelFormCopy.reason}</span>
        <textarea
          required
          data-testid="adjust-reason"
          value={reason}
          maxLength={REASON_MAX}
          rows={3}
          placeholder={levelFormCopy.reasonHint}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-lg border border-line bg-white px-3 py-2"
        />
      </label>
      {msg ? (
        <p role="alert" data-testid="adjust-msg" className="font-medium text-[#7a2a0c]">
          {msg}
        </p>
      ) : null}
      <button type="submit" disabled={busy} data-testid="adjust-save" className="min-h-12 rounded-xl bg-accent px-5 text-base font-semibold text-white disabled:opacity-60">
        {busy ? levelFormCopy.saving : levelFormCopy.saveAdjust}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: `components/levels/ExternalResultForm.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { externalCopy } from "@/lib/copy/vi";
import { EXAMS, NOTE_MAX, SCORE_MAX, type Exam } from "@/lib/levels/types";
import { practiceErrorText, uploadAll, type UploadCache } from "@/lib/practice/client";
import type { DomainKey } from "@/lib/skillmap/types";
import { prepareFile, type Prepared } from "@/lib/storage/clientUpload";
import { failText, postJson } from "@/lib/tutorwork/client";

/**
 * "Thêm kết quả thi ngoài" (D9): exam, date, score (free text), related domains, note, an optional sheet (PDF or image, sent straight
 * to the private store through a one-time link). Tutor or parent. It never changes a level.
 */
export function ExternalResultForm({ learnerId, domains, today, minDate }: { learnerId: string; domains: { key: DomainKey; name: string }[]; today: string; minDate: string }) {
  const router = useRouter();
  const [exam, setExam] = useState<Exam>(EXAMS[0]);
  const [takenOn, setTakenOn] = useState(today);
  const [score, setScore] = useState("");
  const [picked, setPicked] = useState<DomainKey[]>([]);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState<null | "upload" | "save">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [clientId] = useState(() => crypto.randomUUID());
  const [cache] = useState<UploadCache>(() => new Map());

  async function pick(f: File | undefined) {
    setMsg(null);
    if (!f) return setFile(null);
    const r = await prepareFile(f, "phieu-diem");
    if (!r.ok) {
      setFile(null);
      return setMsg(practiceErrorText(r.reason === "type" ? "file_type" : r.reason === "too_big" ? "file_too_big" : "unreadable", "staff"));
    }
    setFile(r.file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!score.trim()) return setMsg(externalCopy.needScore);
    if (picked.length === 0) return setMsg(externalCopy.needDomain);
    let sheet: { id: string; mime: string; bytes: number } | null = null;
    if (file) {
      setBusy("upload");
      const up = await uploadAll([file], `/api/learners/${learnerId}/files`, { purpose: "external_result" }, cache);
      if (!up.ok) {
        setBusy(null);
        return setMsg(practiceErrorText(up.error, "staff"));
      }
      sheet = up.files[0] ?? null;
    }
    setBusy("save");
    const r = await postJson(`/api/learners/${learnerId}/external-results`, {
      client_id: clientId,
      exam,
      taken_on: takenOn,
      score_text: score.trim(),
      domains: picked,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(sheet ? { file: sheet } : {}),
    });
    setBusy(null);
    if (!r.ok) return setMsg(r.error.startsWith("file_") ? practiceErrorText(r.error, "staff") : failText(r));
    router.push(`/learners/${learnerId}/levels`);
    router.refresh();
  }

  const field = "min-h-11 rounded-lg border border-line bg-white px-3";
  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-4" data-testid="external-form">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{externalCopy.exam}</span>
        <select value={exam} onChange={(e) => setExam(e.target.value as Exam)} data-testid="external-exam" className={`${field} max-w-72`}>
          {EXAMS.map((x) => (
            <option key={x} value={x}>
              {externalCopy.examLabels[x] ?? x}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{externalCopy.takenOn}</span>
        <input type="date" min={minDate} max={today} value={takenOn} onChange={(e) => setTakenOn(e.target.value)} data-testid="external-date" className={`${field} max-w-56`} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{externalCopy.score}</span>
        <input type="text" maxLength={SCORE_MAX} placeholder={externalCopy.scoreHint} value={score} onChange={(e) => setScore(e.target.value)} data-testid="external-score" className={field} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-muted">{externalCopy.domains}</legend>
        <p className="text-xs text-muted">{externalCopy.domainsHelp}</p>
        <div className="flex flex-wrap gap-2">
          {domains.map((d) => (
            <label key={d.key} className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm">
              <input
                type="checkbox"
                checked={picked.includes(d.key)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, d.key] : picked.filter((k) => k !== d.key))}
                data-testid={`external-domain-${d.key}`}
              />
              {d.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{externalCopy.note}</span>
        <textarea value={note} maxLength={NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} data-testid="external-note" className="rounded-lg border border-line bg-white px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{externalCopy.file}</span>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => void pick(e.target.files?.[0])}
          data-testid="external-file"
          className="min-h-11 text-sm"
        />
      </label>
      {msg ? (
        <p role="alert" data-testid="external-msg" className="font-medium text-[#7a2a0c]">
          {msg}
        </p>
      ) : null}
      <button type="submit" disabled={busy !== null} data-testid="external-save" className="min-h-12 rounded-xl bg-accent px-5 text-base font-semibold text-white disabled:opacity-60">
        {busy === "upload" ? externalCopy.uploading : busy === "save" ? externalCopy.saving : externalCopy.save}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: The three pages**

`app/learners/[id]/levels/baseline/page.tsx`:

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { BaselineForm } from "@/components/levels/BaselineForm";
import { learnerWithTrack, levelFormCopy } from "@/lib/copy/vi";
import { loadLevelProfile } from "@/lib/levels/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Xác nhận cấp khởi điểm": the child's tutor only (levels:decide; a parent or a student gets 404). */
export default async function BaselinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "levels:decide");
  const profile = await loadLevelProfile(learner.id);
  const rows = profile.domains.filter((d) => d.status === "assumed").map((d) => ({ key: d.key, name: d.name, scale: d.scale, assumed: d.assumed }));
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-2xl px-4 py-10" data-testid="baseline-page">
        <Link href={`/learners/${learner.id}/levels`} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {levelFormCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{levelFormCopy.baselineTitle(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-white px-4 py-3" data-testid="baseline-done">
            {levelFormCopy.baselineDone}
          </p>
        ) : (
          <>
            <p className="mt-3 text-muted">{levelFormCopy.baselineIntro}</p>
            <BaselineForm learnerId={learner.id} rows={rows} />
          </>
        )}
      </main>
    </>
  );
}
```

`app/learners/[id]/levels/adjust/page.tsx`:

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AdjustForm } from "@/components/levels/AdjustForm";
import { learnerWithTrack, levelCopy, levelFormCopy } from "@/lib/copy/vi";
import { loadLevelProfile } from "@/lib/levels/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Điều chỉnh cấp" (?domain=): the child's tutor only. Without a confirmed domain chosen it lists the confirmed ones. */
export default async function AdjustPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ domain?: string }> }) {
  const { id } = await params;
  const { domain } = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "levels:decide");
  const profile = await loadLevelProfile(learner.id);
  const confirmed = profile.domains.filter((d) => d.status === "confirmed");
  const chosen = confirmed.find((d) => d.key === domain) ?? null;
  const link = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline";
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-2xl px-4 py-10" data-testid="adjust-page">
        <Link href={`/learners/${learner.id}/levels`} className={link}>
          {levelFormCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{levelFormCopy.adjustTitle(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{levelFormCopy.adjustIntro}</p>
        {chosen ? (
          <AdjustForm key={chosen.key} learnerId={learner.id} domain={{ key: chosen.key, name: chosen.name, scale: chosen.scale, current: chosen.current }} />
        ) : confirmed.length === 0 ? (
          <p className="mt-4" data-testid="adjust-none">
            {levelFormCopy.pickNone}{" "}
            <Link href={`/learners/${learner.id}/levels/baseline`} className={link}>
              {levelCopy.confirmLink}
            </Link>
          </p>
        ) : (
          <nav aria-label={levelFormCopy.pickDomain} className="mt-4">
            <h2 className="text-lg font-semibold">{levelFormCopy.pickDomain}</h2>
            <ul className="mt-2 flex flex-col gap-1">
              {confirmed.map((d) => (
                <li key={d.key}>
                  <Link href={`/learners/${learner.id}/levels/adjust?domain=${d.key}`} className={link} data-testid={`adjust-pick-${d.key}`}>
                    {d.name} · {levelCopy.levelName(d.scale, d.current)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
    </>
  );
}
```

`app/learners/[id]/levels/external/new/page.tsx`:

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ExternalResultForm } from "@/components/levels/ExternalResultForm";
import { externalCopy, learnerWithTrack } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { loadLevelProfile } from "@/lib/levels/load";
import { EXAM_DAYS_BACK } from "@/lib/levels/types";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Thêm kết quả thi ngoài": tutor or parent of the child (tutorwork:write). */
export default async function ExternalNewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:write");
  const profile = await loadLevelProfile(learner.id);
  const today = todayVn();
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-2xl px-4 py-10" data-testid="external-page">
        <Link href={`/learners/${learner.id}/levels`} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {externalCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{externalCopy.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{externalCopy.intro}</p>
        <ExternalResultForm
          learnerId={learner.id}
          domains={profile.domains.map((d) => ({ key: d.key, name: d.name }))}
          today={today}
          minDate={addDays(today, -EXAM_DAYS_BACK)}
        />
      </main>
    </>
  );
}
```

- [ ] **Step 7: Run** — `npx vitest run tests/unit/levelsUi.test.ts` → PASS; `npm run typecheck && npm run lint` → clean.

- [ ] **Step 8: Commit**

```bash
git add components/levels/BaselineForm.tsx components/levels/AdjustForm.tsx components/levels/ExternalResultForm.tsx \
  "app/learners/[id]/levels/baseline/page.tsx" "app/learners/[id]/levels/adjust/page.tsx" "app/learners/[id]/levels/external/new/page.tsx" tests/unit/levelsUi.test.ts
git commit -m "feat(sm-2): confirm starting levels, adjust one level with a reason, add an external exam result"
```

---

### Task 8: Tag pickers put the current level ± 1 first (P4-c)

**Files:**
- Modify: `lib/skillmap/types.ts` (`SkillMapView.current`), `lib/skillmap/group.ts` (replace), `lib/skillmap/load.ts` (`loadPickerMap`), `components/tutor/DomainTabs.tsx` (replace), `components/tutor/TagSelect.tsx` (optgroups), `lib/copy/vi.ts` (`skillMapCopy`), `app/learners/[id]/notes/new/page.tsx`, `app/learners/[id]/results/new/page.tsx`, `app/learners/[id]/assign/page.tsx`, `app/review/[episodeId]/page.tsx`
- Test: `tests/unit/fixtures/skillMap.ts` (`levelledMap`), `tests/unit/skillMap.test.ts`, `tests/unit/skillMapUi.test.ts`

**Interfaces:**
- Consumes: `nearLevel`, `currentLevels` (Task 4); `loadLevelProfile` (Task 6); SM-1 `SkillMapView`, `Bucket`, `groupTags`, `groupTargets`, `groupWeakPoints`, `firstTab`, `DomainTabs`, `TagSelect`.
- Produces:
  - `SkillMapView.current?: Partial<Record<DomainKey, string>>` (absent = no level sorting, exactly SM-1 behaviour).
  - `type BucketGroup<T> = { key: string; name: string; items: T[] }`; `Bucket<T>` gains `far: BucketGroup<T>[]` (other levels; `groups` = near). `GroupPlace` gains `scale` and `leaf`.
  - `groupTags` splits by level (a kept / chosen tag is always near); `groupTargets` and `groupWeakPoints` never split (D2).
  - `DomainTabs` renders `far` inside `<details data-testid="far-{testId}-{key}">` with the summary "Cấp khác (n)", closed; search covers both.
  - `TagSelect` lists every near group first, then far groups labelled "{Mảng · Nhóm} · cấp khác".
  - `loadPickerMap(learnerId): Promise<SkillMapView>` = `loadSkillMap` + current levels (if the profile cannot be read, the map comes without `current`: pickers keep working unsorted).
  - `skillMapCopy.otherLevels(n)`, `skillMapCopy.nearEmpty`, `skillMapCopy.farPlace(place)`.
  - Fixture `levelledMap()`.

Note: `feature/skill-map` may have moved (review fixes). Apply the edits below to the current content of these files; if an `old` text below no longer matches exactly, make the same change by hand and keep the tests of this task as the contract.

- [ ] **Step 1: Fixture** — append to `tests/unit/fixtures/skillMap.ts`:

```ts
/** SM-2 P4-c: the fixture map with levels on the vocab tags and a current vocab level of B2 (Nguyên). */
export function levelledMap(): SkillMapView {
  const m = fixtureMap();
  const vocab = m.domains[1]!;
  const [wordForm, colloc] = [vocab.groups[0]!, vocab.groups[1]!];
  wordForm.leaves = [{ ...wordForm.leaves[0]!, levelFrom: "B1", levelTo: "B2" }]; // dang-tu: near B2
  colloc.leaves = [
    { ...colloc.leaves[0]!, levelFrom: "A1", levelTo: "A1" }, // cum-dong-tu: two levels below B2 → far
    { ...colloc.leaves[1]!, levelFrom: "C1", levelTo: "C2" }, // thanh-ngu: C1 = B2 + 1 → near
  ];
  return { ...m, current: { vocab: "B2" } };
}
```

- [ ] **Step 2: Write the failing tests**

In `tests/unit/skillMap.test.ts`:
  - change the import `import { fixtureMap } from "./fixtures/skillMap";` to `import { fixtureMap, levelledMap } from "./fixtures/skillMap";`
  - replace `expect(b[3]).toEqual({ key: "listening", name: "Nghe", total: 0, groups: [] });` with `expect(b[3]).toEqual({ key: "listening", name: "Nghe", total: 0, groups: [], far: [] });`
  - append:

```ts
describe("SM-2 P4-c: tag pickers put the current level ± 1 first", () => {
  it("without a current level nothing moves (SM-1 behaviour)", () => {
    expect(groupTags(fixtureMap(), [tag("dang-tu"), tag("cum-dong-tu"), tag("thanh-ngu")]).every((b) => b.far.length === 0)).toBe(true);
  });

  it("a tag outside B2 ± 1 goes to 'far'; a tag without a level and a chosen tag stay near; the tab count includes both", () => {
    const tags = [tag("dang-tu"), tag("cum-dong-tu"), tag("thanh-ngu"), tag("phat-am")];
    const vocab = groupTags(levelledMap(), tags).find((b) => b.key === "vocab")!;
    expect(vocab.groups.flatMap((g) => g.items.map((t) => t.key))).toEqual(["dang-tu", "thanh-ngu"]);
    expect(vocab.far.map((g) => [g.key, g.items.map((t) => t.key)])).toEqual([["vo-colloc-idiom", ["cum-dong-tu"]]]);
    expect(vocab.total).toBe(3);
    expect(groupTags(levelledMap(), tags).find((b) => b.key === "speaking")!.far).toEqual([]);
    expect(groupTags(levelledMap(), tags, { keep: ["cum-dong-tu"] }).find((b) => b.key === "vocab")!.far).toEqual([]);
    expect(firstTab(groupTags(levelledMap(), [tag("cum-dong-tu")]))).toBe("vocab");
  });

  it("the skills of the child's set and the weak points are never split by level (D2)", () => {
    expect(groupTargets(levelledMap(), [{ id: "B-L1-TRANSFORM-W", title: "x" }]).every((b) => b.far.length === 0)).toBe(true);
    const tiles = groupWeakPoints(levelledMap(), [weak("cum-dong-tu", "watch")]);
    expect(tiles.find((t) => t.key === "vocab")?.points.map((p) => p.tagKey)).toEqual(["cum-dong-tu"]);
  });
});
```

In `tests/unit/skillMapUi.test.ts` change `import { fixtureMap } from "./fixtures/skillMap";` to `import { fixtureMap, levelledMap } from "./fixtures/skillMap";` and append:

```ts
describe("SM-2 P4-c in the pickers", () => {
  const near = groupTags(levelledMap(), [tag("dang-tu"), tag("cum-dong-tu"), tag("thanh-ngu")]);
  it("DomainTabs keeps other levels in a closed 'Cấp khác (n)' under the near groups; search still finds them", () => {
    const html = render(
      createElement(DomainTabs<TagInfo>, {
        buckets: near, active: "vocab", onActive: vi.fn(), testId: "t", itemKey: (x: TagInfo) => x.key, itemText: (x: TagInfo) => x.label,
        renderItem: (x: TagInfo) => createElement("span", { "data-testid": `item-${x.key}` }, x.label),
      }),
    );
    const far = html.match(/<details[^>]*data-testid="far-t-vocab"[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(far).toContain(skillMapCopy.otherLevels(1));
    expect(far).toContain('data-testid="item-cum-dong-tu"');
    expect(far).not.toContain('data-testid="item-dang-tu"');
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html.indexOf('data-testid="item-dang-tu"')).toBeLessThan(html.indexOf('data-testid="item-cum-dong-tu"'));
  });

  it("TagSelect lists the near groups first and labels the others '· cấp khác'", () => {
    const html = render(createElement(TagSelect, { tags: [tag("cum-dong-tu"), tag("dang-tu")], map: levelledMap(), value: null, onChange: vi.fn(), onAdd: vi.fn(), label: "Câu 1" }));
    expect(html.indexOf('value="dang-tu"')).toBeGreaterThan(0);
    expect(html.indexOf('value="cum-dong-tu"')).toBeGreaterThan(html.indexOf('value="dang-tu"'));
    expect(html).toContain(`label="${skillMapCopy.farPlace(skillMapCopy.place("Từ vựng", "Kết hợp từ, cụm động từ, thành ngữ"))}"`);
  });
});
```

- [ ] **Step 3: Run** — `npx vitest run tests/unit/skillMap.test.ts tests/unit/skillMapUi.test.ts` → FAIL (`far` missing, `levelledMap` type error on `current`).

- [ ] **Step 4: Types and copy**
  - In `lib/skillmap/types.ts`, inside `SkillMapView`, after the `unassigned: SkillLeaf[];` line add:
    ```ts
      /** SM-2 (P4-c): the child's current level per domain ("B1+", task level "2"). Absent = pickers do not sort by level. */
      current?: Partial<Record<DomainKey, string>>;
    ```
  - In `lib/copy/vi.ts` `skillMapCopy`, after `  setGroupSave: "Lưu nhóm",` add:
    ```ts
      otherLevels: (n: number) => `Cấp khác (${n})`,
      nearEmpty: "Quanh cấp đang học chưa có mục nào — mở “Cấp khác”.",
      farPlace: (place: string) => `${place} · cấp khác`,
    ```

- [ ] **Step 5: Replace `lib/skillmap/group.ts`**

```ts
/**
 * Pure grouping of picker items and weak points by the skill map (no React, no database): used by the pickers (client) and the
 * weak-points page (server). Spec 2026-10-21 §5 (SM-1 rows) and P4-c (SM-2): tag pickers put the items around the child's current level
 * (± 1 level, D1) in `groups` and the others in `far`, shown collapsed. Skills of the child's set and weak points are never split (D2).
 */
import { skillMapCopy } from "@/lib/copy/vi";
import { nearLevel } from "@/lib/levels/scale";
import type { TagInfo, WeakPoint } from "@/lib/tutorwork/types";
import { UNASSIGNED, type BucketKey, type DomainKey, type SkillLeaf, type SkillMapView } from "./types";

export type GroupPlace = {
  domainKey: DomainKey;
  domainName: string;
  scale: "cefr" | "task_level";
  groupKey: string;
  groupName: string;
  hidden: boolean;
  /** The leaf of the map (null for a group found through a family tag's own group key). */
  leaf: SkillLeaf | null;
};
export type BucketGroup<T> = { key: string; name: string; items: T[] };
/** `groups` = around the current level (or everything when no level is known); `far` = other levels. `total` counts both. */
export type Bucket<T> = { key: BucketKey; name: string; total: number; groups: BucketGroup<T>[]; far: BucketGroup<T>[] };
export type WeakTile = { key: BucketKey; name: string; weakCount: number; worst: WeakPoint | null; points: WeakPoint[] };

type Index = { groups: Map<string, GroupPlace>; tags: Map<string, GroupPlace>; targets: Map<string, GroupPlace> };
const cache = new WeakMap<SkillMapView, Index>();

function index(map: SkillMapView): Index {
  const hit = cache.get(map);
  if (hit) return hit;
  const out: Index = { groups: new Map(), tags: new Map(), targets: new Map() };
  for (const d of map.domains)
    for (const g of d.groups) {
      const base = { domainKey: d.key, domainName: d.name, scale: d.scale, groupKey: g.key, groupName: g.name };
      out.groups.set(g.key, { ...base, hidden: false, leaf: null });
      for (const l of g.leaves) (l.kind === "tag" ? out.tags : out.targets).set(l.refKey, { ...base, hidden: l.hiddenInPicker, leaf: l });
    }
  cache.set(map, out);
  return out;
}

export function placeOfGroup(map: SkillMapView, groupKey: string): GroupPlace | null {
  return index(map).groups.get(groupKey) ?? null;
}

/** A family tag's own group wins (it may have been added after the page loaded); a seed tag uses its leaf of the learner's track. */
export function placeOfTag(map: SkillMapView, tag: { key: string; groupKey?: string | null }): GroupPlace | null {
  if (tag.groupKey) return placeOfGroup(map, tag.groupKey);
  return index(map).tags.get(tag.key) ?? null;
}

export function placeOfTarget(map: SkillMapView, id: string): GroupPlace | null {
  return index(map).targets.get(id) ?? null;
}

export function domainOfGroup(map: SkillMapView, groupKey: string): DomainKey | null {
  return placeOfGroup(map, groupKey)?.domainKey ?? null;
}

function bucketize<T>(
  map: SkillMapView,
  items: T[],
  placeOf: (item: T) => GroupPlace | null,
  opts: { keep: (item: T) => boolean; byLevel: boolean },
): Bucket<T>[] {
  const domains = map.domains.map((d) => ({
    key: d.key as BucketKey,
    name: d.name,
    total: 0,
    groups: d.groups.map((g) => ({ key: g.key, name: g.name, items: [] as T[] })),
    far: d.groups.map((g) => ({ key: g.key, name: g.name, items: [] as T[] })),
  }));
  const loose: T[] = [];
  for (const item of items) {
    const p = placeOf(item);
    if (!p) {
      loose.push(item);
      continue;
    }
    const kept = opts.keep(item);
    if (p.hidden && !kept) continue;
    const d = domains.find((x) => x.key === p.domainKey);
    const gi = d ? d.groups.findIndex((x) => x.key === p.groupKey) : -1;
    if (!d || gi < 0) {
      loose.push(item);
      continue;
    }
    const near = !opts.byLevel || kept || p.leaf === null || nearLevel(p.scale, map.current?.[p.domainKey], p.leaf);
    (near ? d.groups : d.far)[gi]!.items.push(item);
    d.total += 1;
  }
  const out: Bucket<T>[] = domains.map((d) => ({
    ...d,
    groups: d.groups.filter((g) => g.items.length > 0),
    far: d.far.filter((g) => g.items.length > 0),
  }));
  if (loose.length > 0) {
    out.push({
      key: UNASSIGNED, name: skillMapCopy.unassigned, total: loose.length,
      groups: [{ key: UNASSIGNED, name: skillMapCopy.unassigned, items: loose }], far: [],
    });
  }
  return out;
}

export function groupTags(map: SkillMapView, tags: TagInfo[], opts: { keep?: string[] } = {}): Bucket<TagInfo>[] {
  const keep = new Set(opts.keep ?? []);
  return bucketize(map, tags, (t) => placeOfTag(map, t), { keep: (t) => keep.has(t.key), byLevel: true });
}

export function groupTargets<T extends { id: string }>(map: SkillMapView, items: T[]): Bucket<T>[] {
  return bucketize(map, items, (t) => placeOfTarget(map, t.id), { keep: () => true, byLevel: false });
}

export function groupWeakPoints(map: SkillMapView, points: WeakPoint[]): WeakTile[] {
  return bucketize(map, points, (p) => placeOfTag(map, { key: p.tagKey }), { keep: () => true, byLevel: false }).map((b) => {
    const all = b.groups.flatMap((g) => g.items);
    // keep the order of eng_weak_points (worst first), not the group order
    const ordered = points.filter((p) => all.includes(p));
    const weak = ordered.filter((p) => p.status !== "ok");
    return { key: b.key, name: b.name, weakCount: weak.length, worst: weak[0] ?? null, points: ordered };
  });
}

export function firstTab<T>(buckets: Bucket<T>[], prefer?: (item: T) => boolean): BucketKey {
  if (prefer) {
    const hit = buckets.find((b) => [...b.groups, ...b.far].some((g) => g.items.some(prefer)));
    if (hit) return hit.key;
  }
  return (buckets.find((b) => b.total > 0) ?? buckets[0])?.key ?? "grammar";
}
```

- [ ] **Step 6: Replace `components/tutor/DomainTabs.tsx`**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { skillMapCopy } from "@/lib/copy/vi";
import type { Bucket, BucketGroup } from "@/lib/skillmap/group";

/**
 * Items of the skill map by domain (SM-1): one tab per domain (+ "Chưa xếp mảng"), group headings inside a tab, and a quick search
 * across every domain. SM-2 (P4-c): the items around the child's current level come first; other levels sit under them in a closed
 * "Cấp khác (n)". Every panel is rendered and the inactive ones are `hidden`, so a choice in another tab keeps its state.
 * Controlled: the parent keeps the active tab (so it can jump to the tab of a tag it just added).
 */
export function DomainTabs<T>({
  buckets,
  active,
  onActive,
  itemKey,
  itemText,
  renderItem,
  testId,
}: {
  buckets: Bucket<T>[];
  active: string;
  onActive: (key: string) => void;
  itemKey: (item: T) => string;
  itemText: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  testId: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const hits = q
    ? buckets.flatMap((b) =>
        [...b.groups, ...b.far].flatMap((g) =>
          g.items
            .filter((it) => itemText(it).toLowerCase().includes(q) || g.name.toLowerCase().includes(q))
            .map((it) => ({ it, place: b.key === g.key ? b.name : skillMapCopy.place(b.name, g.name) })),
        ),
      )
    : [];
  const groupList = (groups: BucketGroup<T>[]) =>
    groups.map((g) => (
      <section key={g.key} aria-label={g.name} className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-muted">{g.name}</h3>
        <ul className="flex flex-wrap gap-2">
          {g.items.map((it) => (
            <li key={itemKey(it)}>{renderItem(it)}</li>
          ))}
        </ul>
      </section>
    ));

  return (
    <div className="flex flex-col gap-3" data-testid={`tabs-${testId}`}>
      <input
        type="search"
        aria-label={skillMapCopy.search}
        placeholder={skillMapCopy.searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid={`search-${testId}`}
        className="min-h-11 rounded-lg border border-line px-3 text-sm"
      />
      {q ? (
        <ul className="flex flex-col gap-2" data-testid={`results-${testId}`}>
          {hits.length === 0 ? <li className="text-sm text-muted">{skillMapCopy.noMatch}</li> : null}
          {hits.map(({ it, place }) => (
            <li key={itemKey(it)} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{place}</span>
              {renderItem(it)}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div role="tablist" aria-label={skillMapCopy.tabsLabel} className="flex flex-wrap gap-2">
            {buckets.map((b) => {
              const on = b.key === active;
              return (
                <button
                  key={b.key}
                  type="button"
                  role="tab"
                  id={`tab-${testId}-${b.key}`}
                  aria-selected={on}
                  aria-controls={`panel-${testId}-${b.key}`}
                  onClick={() => onActive(b.key)}
                  data-testid={`tab-${testId}-${b.key}`}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`}
                >
                  {b.name} <span className="ml-1 text-xs opacity-80">{b.total}</span>
                </button>
              );
            })}
          </div>
          {buckets.map((b) => {
            const farCount = b.far.reduce((n, g) => n + g.items.length, 0);
            return (
              <div
                key={b.key}
                role="tabpanel"
                id={`panel-${testId}-${b.key}`}
                aria-labelledby={`tab-${testId}-${b.key}`}
                hidden={b.key !== active}
                data-testid={`panel-${testId}-${b.key}`}
                className="flex flex-col gap-3"
              >
                {b.groups.length === 0 && farCount === 0 ? <p className="text-sm text-muted">{skillMapCopy.emptyDomain}</p> : null}
                {b.groups.length === 0 && farCount > 0 ? <p className="text-sm text-muted">{skillMapCopy.nearEmpty}</p> : null}
                {groupList(b.groups)}
                {farCount > 0 ? (
                  <details className="rounded-lg border border-line px-3" data-testid={`far-${testId}-${b.key}`}>
                    <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted">{skillMapCopy.otherLevels(farCount)}</summary>
                    <div className="flex flex-col gap-3 pb-3">{groupList(b.far)}</div>
                  </details>
                ) : null}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: `components/tutor/TagSelect.tsx`** — replace the optgroup block

```tsx
        {buckets.flatMap((b) =>
          b.groups.map((g) => (
            <optgroup key={`${b.key}:${g.key}`} label={b.key === g.key ? b.name : skillMapCopy.place(b.name, g.name)}>
              {g.items.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          )),
        )}
```

with

```tsx
        {[false, true].flatMap((far) =>
          buckets.flatMap((b) =>
            (far ? b.far : b.groups).map((g) => {
              const place = b.key === g.key ? b.name : skillMapCopy.place(b.name, g.name);
              return (
                <optgroup key={`${far ? "far" : "near"}:${b.key}:${g.key}`} label={far ? skillMapCopy.farPlace(place) : place}>
                  {g.items.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              );
            }),
          ),
        )}
```

and update its doc comment's first line to: `/** One tag for one wrong item: a native select grouped as "Mảng · Nhóm" of the skill map, the current level ± 1 first (P4-c), plus "+ nhãn khác". */`.

- [ ] **Step 8: The pages load the map with the child's levels** — append to `lib/skillmap/load.ts`:

```ts
/**
 * The map for the tag pickers (P4-c): the published map plus the child's current level per domain. If the level profile cannot be
 * read (e.g. before migration 0020), the map comes without levels and the pickers simply do not sort by level.
 */
export async function loadPickerMap(learnerId: string): Promise<SkillMapView> {
  const [map, profile] = await Promise.all([loadSkillMap(learnerId), loadLevelProfile(learnerId).catch(() => null)]);
  return profile ? { ...map, current: currentLevels(profile) } : map;
}
```

with the imports `import { loadLevelProfile } from "@/lib/levels/load";` and `import { currentLevels } from "@/lib/levels/scale";` at the top. Then switch the four picker pages (not the weak page):

```bash
sed -i 's/loadSkillMap/loadPickerMap/g' "app/learners/[id]/notes/new/page.tsx" "app/learners/[id]/results/new/page.tsx" "app/learners/[id]/assign/page.tsx" "app/review/[episodeId]/page.tsx"
grep -n "loadPickerMap\|loadSkillMap" "app/learners/[id]/notes/new/page.tsx" "app/learners/[id]/results/new/page.tsx" "app/learners/[id]/assign/page.tsx" "app/review/[episodeId]/page.tsx" "app/learners/[id]/weak/page.tsx"
```

Expected: the four picker pages import and call `loadPickerMap`; `weak/page.tsx` still uses `loadSkillMap`.

- [ ] **Step 9: Run** — `npx vitest run tests/unit/skillMap.test.ts tests/unit/skillMapUi.test.ts tests/unit/tutorWorkUi.test.ts tests/unit/practiceUi.test.ts tests/unit/readingUi.test.ts tests/unit/levels.test.ts` → PASS; `npm run typecheck && npm run lint` → clean.

- [ ] **Step 10: Commit**

```bash
git add lib/skillmap/types.ts lib/skillmap/group.ts lib/skillmap/load.ts components/tutor/DomainTabs.tsx components/tutor/TagSelect.tsx lib/copy/vi.ts \
  "app/learners/[id]/notes/new/page.tsx" "app/learners/[id]/results/new/page.tsx" "app/learners/[id]/assign/page.tsx" "app/review/[episodeId]/page.tsx" \
  tests/unit/fixtures/skillMap.ts tests/unit/skillMap.test.ts tests/unit/skillMapUi.test.ts
git commit -m "feat(sm-2): tag pickers show the current level ± 1 first, other levels under a closed 'Cấp khác'"
```

---

### Task 9: Homes — "Thay đổi cấp gần đây" for the parent, "Việc cần ôn" by domain for the student

**Files:**
- Create: `components/levels/RecentLevelChanges.tsx`, `components/student/ReviewByDomain.tsx`
- Modify: `lib/levels/view.ts` (`mergeRecentChanges`), `lib/levels/load.ts` (`loadRecentLevelChanges`), `app/page.tsx`, `lib/work/handlers.ts`, `lib/work/supabaseStore.ts`, `lib/work/load.ts`, `components/student/StudentHome.tsx`
- Test: `tests/unit/levels.test.ts`, `tests/unit/levelsUi.test.ts`, `tests/unit/workHandlers.test.ts`, `tests/unit/workUi.test.ts`

**Interfaces:**
- Consumes: Task 3 `eng_recent_level_changes`, `eng_my_review_by_domain`; Task 4 `parseRecentChanges`, `parseReviewByDomain`, `groupReview`, `levelText`, `dayLabel`, `RECENT_DAYS`, `RECENT_MAX`, `levelCopy`, `studentReviewCopy`; `loadHome` learners (RLS-scoped); `WorkStore`, `handleStudentHome`, `loadStudentHome`.
- Produces:
  - `mergeRecentChanges(per: (RecentChange[] | null)[]): RecentChange[] | null` — newest first, at most `RECENT_MAX`; all children failed → null; no child → `[]`.
  - `loadRecentLevelChanges(learners: { id: string; alias: string }[]): Promise<RecentChange[] | null>` (server only).
  - `<RecentLevelChanges items />` (`recent-levels`, `recent-level-{id}`), shown on the parent home only.
  - `WorkStore.getReviewByDomain(): Promise<unknown>` (user client, `eng_my_review_by_domain`); `GET /api/student/home` body gains `review: ReviewItem[] | null` (null = could not be read; the home still answers 200).
  - `StudentHomeData` ok variant gains `review: ReviewItem[] | null`; `<StudentHome … review />`; `<ReviewByDomain items />` (`review-by-domain`; renders nothing for an empty list).

- [ ] **Step 1: Write the failing tests**

In `tests/unit/levels.test.ts` add `mergeRecentChanges` to the `@/lib/levels/view` import, add `import type { RecentChange } from "@/lib/levels/types";`, and append:

```ts
describe("mergeRecentChanges (D11)", () => {
  const c = (id: string, at: string, alias = "An"): RecentChange => ({
    id, domainKey: "grammar", domainName: "Ngữ pháp", scale: "cefr", from: "A2", to: "A2+", kind: "baseline", reason: null, decidedAt: at, decidedBy: "Cô", learnerId: "l", alias,
  });
  it("both children, newest first, at most 5; a child that failed is skipped; all failed → null; no child → []", () => {
    const merged = mergeRecentChanges([[c("a", "2026-10-20T01:00:00+00:00"), c("b", "2026-10-22T01:00:00+00:00")], null, [c("c", "2026-10-21T01:00:00+00:00", "Nguyên")]]);
    expect(merged?.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(mergeRecentChanges([Array.from({ length: 7 }, (_, i) => c(`x${i}`, `2026-10-1${i}T01:00:00+00:00`))])).toHaveLength(5);
    expect(mergeRecentChanges([null, null])).toBeNull();
    expect(mergeRecentChanges([])).toEqual([]);
  });
});
```

In `tests/unit/levelsUi.test.ts` add the imports `import { RecentLevelChanges } from "@/components/levels/RecentLevelChanges";` and `import { ReviewByDomain } from "@/components/student/ReviewByDomain";`, add `studentReviewCopy` to the `@/lib/copy/vi` import, and append:

```ts
describe("homes", () => {
  it("parent: 'Thay đổi cấp gần đây' names the child, the domain, from → to, the kind, day, tutor and reason; an empty list says so", () => {
    const html = render(createElement(RecentLevelChanges, {
      items: [{
        id: "c1", domainKey: "thinking", domainName: "Tư duy và tự học", scale: "task_level", from: "2", to: "3", kind: "adjust", reason: "Lập luận tốt hơn",
        decidedAt: "2026-10-22T03:00:00+00:00", decidedBy: "Cô Lan", learnerId: L, alias: "Nguyên",
      }],
    }));
    expect(html).toContain(levelCopy.recentLine("Nguyên", "Tư duy và tự học", "bậc 2", "bậc 3"));
    expect(html).toContain(levelCopy.historyMeta("Điều chỉnh", "22/10/2026", "Cô Lan"));
    expect(html).toContain("“Lập luận tốt hơn”");
    expect(html).toContain(`href="/learners/${L}/levels?domain=thinking"`);
    expect(render(createElement(RecentLevelChanges, { items: [] }))).toContain(levelCopy.recentNone);
  });

  it("student: 'Việc cần ôn' grouped by domain, with no level and no score; nothing at all when there is nothing to review", () => {
    const html = render(createElement(ReviewByDomain, {
      items: [{ domainKey: "grammar", domainName: "Ngữ pháp", label: "Câu điều kiện" }, { domainKey: "vocab", domainName: "Từ vựng", label: "Dạng từ" }],
    }));
    expect(html).toContain(studentReviewCopy.title);
    expect(html).toMatch(/Ngữ pháp[\s\S]*Câu điều kiện[\s\S]*Từ vựng[\s\S]*Dạng từ/);
    expect(html).not.toMatch(/\b[ABC][12]\b|\/4|bậc/);
    expect(render(createElement(ReviewByDomain, { items: [] }))).toBe("");
  });
});
```

In `tests/unit/workHandlers.test.ts`, in `makeStore` add after the `getHome: …` line:

```ts
    getReviewByDomain: vi.fn(async (): Promise<unknown> => ({ items: [] })),
```

and append:

```ts
describe("SM-2: 'Việc cần ôn' on the student home", () => {
  it("passes labels and domain names through; a failure or an unexpected key leaves it out (null) instead of breaking the home", async () => {
    const ok = makeStore({ getReviewByDomain: vi.fn(async (): Promise<unknown> => ({ items: [{ domain_key: "vocab", domain_name: "Từ vựng", label: "Dạng từ" }] })) });
    expect((await handleStudentHome(deps("studentAn", ok))).body).toMatchObject({ review: [{ domainKey: "vocab", domainName: "Từ vựng", label: "Dạng từ" }] });
    const broken = makeStore({ getReviewByDomain: vi.fn(async (): Promise<unknown> => { throw new Error("eng_my_review_by_domain is missing"); }) });
    const r = await handleStudentHome(deps("studentAn", broken));
    expect([r.status, (r.body as { review: unknown }).review]).toEqual([200, null]);
    const leaky = makeStore({ getReviewByDomain: vi.fn(async (): Promise<unknown> => ({ items: [{ domain_key: "vocab", domain_name: "Từ vựng", label: "Dạng từ", level: "B2" }] })) });
    expect(((await handleStudentHome(deps("studentAn", leaky))).body as { review: unknown }).review).toBeNull();
  });
});
```

In `tests/unit/workUi.test.ts` append:

```ts
describe("StudentHome · SM-2", () => {
  it("shows 'Việc cần ôn' by domain when there is something to review, and nothing otherwise", () => {
    const withReview = renderToStaticMarkup(createElement(StudentHome, {
      alias: "An (thử)", color: "#9A4A15", data: { inquiries: [] }, review: [{ domainKey: "grammar", domainName: "Ngữ pháp", label: "Thì quá khứ đơn" }],
    }));
    expect(withReview).toContain('data-testid="review-by-domain"');
    expect(withReview).toContain("Thì quá khứ đơn");
    expect(renderToStaticMarkup(createElement(StudentHome, { alias: "An (thử)", color: "#9A4A15", data: { inquiries: [] } }))).not.toContain('data-testid="review-by-domain"');
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/levels.test.ts tests/unit/levelsUi.test.ts tests/unit/workHandlers.test.ts tests/unit/workUi.test.ts` → FAIL.

- [ ] **Step 3: `mergeRecentChanges`** — in `lib/levels/view.ts` replace the import line `import { REVIEW_MAX, type DomainLevel, type LevelProfile, type ReviewItem, type Scale } from "./types";` with `import { RECENT_MAX, REVIEW_MAX, type DomainLevel, type LevelProfile, type RecentChange, type ReviewItem, type Scale } from "./types";` and append:

```ts
/** D11: the changes of every child, newest first, at most RECENT_MAX. null when no child could be read (never a false "no change"). */
export function mergeRecentChanges(per: (RecentChange[] | null)[]): RecentChange[] | null {
  if (per.length > 0 && per.every((x) => x === null)) return null;
  return per
    .flatMap((x) => x ?? [])
    .sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt))
    .slice(0, RECENT_MAX);
}
```

- [ ] **Step 4: `loadRecentLevelChanges`** — in `lib/levels/load.ts` change the imports to

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseLevelProfile, parseRecentChanges } from "./shape";
import { RECENT_DAYS, type LevelProfile, type RecentChange } from "./types";
import { mergeRecentChanges } from "./view";
```

and append:

```ts
/**
 * "Thay đổi cấp gần đây" for the parent home (D11). `learners` must already be the caller's own scope (loadHome reads them with the
 * user client under RLS). A child whose changes cannot be read is skipped; if none could be read the answer is null.
 */
export async function loadRecentLevelChanges(learners: { id: string; alias: string }[]): Promise<RecentChange[] | null> {
  const per = await Promise.all(
    learners.map(async (l): Promise<RecentChange[] | null> => {
      try {
        const { data, error } = await createAdminClient().rpc("eng_recent_level_changes", { p_learner: l.id, p_days: RECENT_DAYS });
        if (error) return null;
        return parseRecentChanges(data).map((c) => ({ ...c, learnerId: l.id, alias: l.alias }));
      } catch {
        return null;
      }
    }),
  );
  return mergeRecentChanges(per);
}
```

- [ ] **Step 5: `components/levels/RecentLevelChanges.tsx`**

```tsx
import Link from "next/link";
import { levelCopy } from "@/lib/copy/vi";
import type { RecentChange } from "@/lib/levels/types";
import { dayLabel, levelText } from "@/lib/levels/view";

/** Parent home (D11): level decisions of the last 30 days for every child, newest first. This is how the parent "is told" (no email / push). */
export function RecentLevelChanges({ items }: { items: RecentChange[] }) {
  return (
    <section aria-labelledby="recent-levels-title" className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="recent-levels">
      <h2 id="recent-levels-title" className="text-lg font-semibold">
        {levelCopy.recentTitle}
      </h2>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{levelCopy.recentNone}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((c) => (
            <li key={c.id} data-testid={`recent-level-${c.id}`}>
              <Link
                href={`/learners/${c.learnerId}/levels?domain=${c.domainKey}`}
                className="flex min-h-11 flex-col gap-0.5 rounded-lg bg-paper px-4 py-3 text-ink no-underline hover:bg-[#E3ECE8]"
              >
                <span className="font-semibold">{levelCopy.recentLine(c.alias, c.domainName, levelText(c.scale, c.from), levelText(c.scale, c.to))}</span>
                <span className="text-sm text-muted">{levelCopy.historyMeta(levelCopy.kindLabels[c.kind] ?? c.kind, dayLabel(c.decidedAt), c.decidedBy)}</span>
                {c.reason ? <span className="text-sm">“{c.reason}”</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 6: `components/student/ReviewByDomain.tsx`**

```tsx
import { studentReviewCopy } from "@/lib/copy/vi";
import type { ReviewItem } from "@/lib/levels/types";
import { groupReview } from "@/lib/levels/view";

/** "Việc cần ôn" on the student's home (P2-d, D12): at most 3 labels grouped by domain. No level, no score, no date, no count. */
export function ReviewByDomain({ items }: { items: ReviewItem[] }) {
  const groups = groupReview(items);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="review-by-domain-title" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" data-testid="review-by-domain">
      <h2 id="review-by-domain-title" className="text-[15px] font-bold">
        {studentReviewCopy.title}
      </h2>
      <p className="text-sm text-muted">{studentReviewCopy.intro}</p>
      <ul className="flex flex-col gap-2">
        {groups.map((g) => (
          <li key={g.name} className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-muted">{g.name}</span>
            <ul className="flex flex-wrap gap-2">
              {g.labels.map((l) => (
                <li key={l} className="rounded-xl bg-[#f6e9df] px-3 py-1.5 text-sm text-[#5a2a0c]">
                  {l}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 7: Student home wiring**
  - `lib/work/handlers.ts`: add `import { parseReviewByDomain } from "@/lib/levels/shape";`; in `WorkStore` replace
    ```ts
      /** english.eng_my_home() as the signed-in user. */
      getHome(): Promise<unknown>;
    ```
    with
    ```ts
      /** english.eng_my_home() as the signed-in user. */
      getHome(): Promise<unknown>;
      /** english.eng_my_review_by_domain() as the signed-in student: labels and domain names only (SM-2). */
      getReviewByDomain(): Promise<unknown>;
    ```
    and in `handleStudentHome` replace
    ```ts
      const home = toHomeView(await deps.store.getHome());
      return { status: 200, body: { learner: { alias: g.grant.learner.alias }, ...home } };
    ```
    with
    ```ts
      // "Việc cần ôn" by domain (SM-2) must never take the home down: unreadable or unexpected → left out (null).
      const [raw, review] = await Promise.all([deps.store.getHome(), deps.store.getReviewByDomain().then(parseReviewByDomain).catch(() => null)]);
      const home = toHomeView(raw);
      return { status: 200, body: { learner: { alias: g.grant.learner.alias }, ...home, review } };
    ```
  - `lib/work/supabaseStore.ts`: after the `getHome` method add
    ```ts
        async getReviewByDomain() {
          const db = await createUserClient();
          const { data, error } = await db.rpc("eng_my_review_by_domain");
          if (error) dbError("eng_my_review_by_domain", error);
          return data;
        },
    ```
  - `lib/work/load.ts`: add `import type { ReviewItem } from "@/lib/levels/types";`; replace `  | { kind: "ok"; alias: string; home: HomeView }` with `  | { kind: "ok"; alias: string; home: HomeView; review: ReviewItem[] | null }`; replace
    ```ts
      const body = res.body as { learner: { alias: string } } & HomeView;
      return { kind: "ok", alias: body.learner.alias, home: { inquiries: body.inquiries } };
    ```
    with
    ```ts
      const body = res.body as { learner: { alias: string }; review?: ReviewItem[] | null } & HomeView;
      return { kind: "ok", alias: body.learner.alias, home: { inquiries: body.inquiries }, review: body.review ?? null };
    ```
  - `components/student/StudentHome.tsx`: add `import type { ReviewItem } from "@/lib/levels/types";` and `import { ReviewByDomain } from "./ReviewByDomain";`; replace `export function StudentHome({ alias, color, data }: { alias: string; color: string; data: HomeView }) {` with `export function StudentHome({ alias, color, data, review = null }: { alias: string; color: string; data: HomeView; review?: ReviewItem[] | null }) {`; replace
    ```tsx
          {data.inquiries.map((q) => (
            <InquiryCard key={q.instanceId} inquiry={q} next={next} />
          ))}
    ```
    with
    ```tsx
          {review && review.length > 0 ? <ReviewByDomain items={review} /> : null}

          {data.inquiries.map((q) => (
            <InquiryCard key={q.instanceId} inquiry={q} next={next} />
          ))}
    ```
  - `app/page.tsx`: replace `<StudentHome alias={alias} color={color} data={work.home} />` with `<StudentHome alias={alias} color={color} data={work.home} review={work.review} />`.

- [ ] **Step 8: Parent home** — in `app/page.tsx`:
  - add the imports `import { RecentLevelChanges } from "@/components/levels/RecentLevelChanges";` and `import { loadRecentLevelChanges } from "@/lib/levels/load";`;
  - replace
    ```tsx
      return (
        <>
          <AppHeader name={data.displayName} showTestBadge={anyTest} />
    ```
    with
    ```tsx
      // "Thay đổi cấp gần đây" (parent only). null = could not be read: the box is left out rather than claiming "no change".
      const recent = isParent ? await loadRecentLevelChanges(data.learners) : null;
      return (
        <>
          <AppHeader name={data.displayName} showTestBadge={anyTest} />
    ```
  - replace
    ```tsx
            <ul className="mt-6 flex flex-col gap-3">
              {data.learners.map((l, i) => (
    ```
    with
    ```tsx
            {recent ? <RecentLevelChanges items={recent} /> : null}
            <ul className="mt-6 flex flex-col gap-3">
              {data.learners.map((l, i) => (
    ```

- [ ] **Step 9: Run** — `npx vitest run tests/unit/levels.test.ts tests/unit/levelsUi.test.ts tests/unit/workHandlers.test.ts tests/unit/workUi.test.ts tests/unit/deployOrder.test.ts` → PASS; `npm run typecheck && npm run lint` → clean.

- [ ] **Step 10: Commit**

```bash
git add lib/levels/view.ts lib/levels/load.ts components/levels/RecentLevelChanges.tsx components/student/ReviewByDomain.tsx components/student/StudentHome.tsx \
  lib/work/handlers.ts lib/work/supabaseStore.ts lib/work/load.ts app/page.tsx \
  tests/unit/levels.test.ts tests/unit/levelsUi.test.ts tests/unit/workHandlers.test.ts tests/unit/workUi.test.ts
git commit -m "feat(sm-2): parent home 'Thay đổi cấp gần đây'; student home 'Việc cần ôn' by domain (labels only)"
```

---

### Task 10: End-to-end additions to the existing specs (no new e2e file)

**Files:**
- Modify: `tests/e2e/tutorWork.spec.ts`, `tests/e2e/student-no-scores.spec.ts`

**Interfaces:**
- Consumes: the dev seed (Nguyên (thử), Track B; tutorNguyen, parent, studentNguyen); every `data-testid` of Tasks 6–9; `levelCopy`.
- Produces: one new serial test in "S5b-1 tutor work"; two more 404 pages in the "other tutor / student get nothing" test; one more assertion on student pages.

- [ ] **Step 1: `tests/e2e/tutorWork.spec.ts`**
  - add `levelCopy` to the import from `@/lib/copy/vi`;
  - in the test "the other child's tutor and the students get nothing", extend both page lists:

```bash
sed -i 's|\["results/new", "notes/new", "weak"\]|["results/new", "notes/new", "weak", "levels", "levels/baseline"]|g' tests/e2e/tutorWork.spec.ts
grep -c '"levels", "levels/baseline"' tests/e2e/tutorWork.spec.ts   # expect 2
```

  - add this test as the LAST test inside `test.describe.serial("S5b-1 tutor work", …)` (just before its closing `});`):

```ts
  test("Hồ sơ cấp: the tutor confirms the starting levels; the parent reads them, sees the change on her home, adds an exam result, and may not decide", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/levels`);
    await expect(page.getByTestId("level-summary")).toContainText(levelCopy.whereTitle("Nguyên (thử)"));
    await expect(page.locator('[data-testid^="level-bar-"]')).toHaveCount(7);
    await page.goto(`/learners/${NG}/levels/baseline`);
    // A re-run on the same database finds every domain already confirmed: then there is no form, only the "đã xác nhận" note.
    if ((await page.getByTestId("baseline-form").count()) > 0) {
      await page.getByTestId("baseline-grammar").selectOption("B2+");
      await page.getByTestId("baseline-save").click();
      await page.waitForURL(`**/learners/${NG}/levels`);
    }
    await page.goto(`/learners/${NG}/levels?domain=grammar`);
    await expect(page.getByTestId("level-bar-grammar")).toHaveAttribute("data-status", "confirmed");
    await expect(page.getByTestId("level-detail-grammar")).toContainText(levelCopy.adjustLink);

    await page.context().clearCookies();
    await loginAs(page, "parent");
    await expect(page.getByTestId("recent-levels")).toContainText(levelCopy.kindLabels.baseline!);
    const denied = await page.request.post(`/api/learners/${NG}/levels`, {
      data: { client_id: randomUUID(), kind: "adjust", levels: { grammar: "C1" }, reason: "thử" },
    });
    expect(denied.status()).toBe(403);
    await notFound(page, `/learners/${NG}/levels/baseline`);
    await page.goto(`/learners/${NG}/levels/external/new`);
    await page.getByTestId("external-exam").selectOption("FCE");
    await page.getByTestId("external-score").fill("172 · Grade B");
    await page.getByTestId("external-domain-reading").check();
    await page.getByTestId("external-save").click();
    await page.waitForURL(`**/learners/${NG}/levels`);
    await expect(page.getByTestId("milestones")).toContainText("172 · Grade B");
    expect(await page.locator("body").innerText()).not.toMatch(/tomo/i);
  });
```

- [ ] **Step 2: `tests/e2e/student-no-scores.spec.ts`** — add `import { levelCopy } from "@/lib/copy/vi";` and, inside the loop test after the two existing `expect`s, add:

```ts
    // SM-2 (P2-d): a student never sees a level, assumed or confirmed.
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/đang học (A1|A2|B1|B2|C1|C2)/);
    expect(text).not.toContain(levelCopy.assumed);
```

- [ ] **Step 3: List** — `npx playwright test tests/e2e/tutorWork.spec.ts tests/e2e/student-no-scores.spec.ts --list` → the previous count + 1 (they run for real in CI, job "E2E smoke", with migrations 0001–0020 applied to the local Supabase).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/tutorWork.spec.ts tests/e2e/student-no-scores.spec.ts
git commit -m "test(sm-2): e2e - confirm levels, parent sees the change and adds an exam result, students and other tutors get nothing"
```

---

### Task 11: Docs, full checks, review, PR

**Files:**
- Modify: `docs/PROGRESS.md` (new section at the end), `CLAUDE.md` (Current status + next migration number), `docs/DESIGN.md` (new §19.8)

- [ ] **Step 1: `docs/PROGRESS.md`** — append:

```markdown
## SM-2 — Hồ sơ cấp đang học (22/10/2026)

Nhánh `feature/sm2-level-profile` (dựa trên `feature/skill-map`). Thiết kế `docs/superpowers/specs/2026-10-21-skill-map-levels-design.md` (P2-a..P2-d, P4-c, §3, §5–§6 phần SM-2); kế hoạch `docs/superpowers/plans/2026-10-22-sm2-level-profile.md`; mockup "10 · Hồ sơ cấp" phụ huynh duyệt 22/10. Không AI.

### Đã thay đổi gì (nói đơn giản)

| Việc | Vì sao | Nằm ở |
|---|---|---|
| **Hồ sơ cấp** của mỗi em: "{tên} đang ở đâu?" + 1 câu tóm tắt + 3 ô Mạnh nhất / Cần tập trung / Đang chờ cô; 7 thanh cấp (6 mảng chung thang A1→C2, mảng Tư duy thang riêng bậc 1→4); thanh **ước lượng** có sọc + chữ "Ước lượng — cô chưa xác nhận"; bấm một mảng → chi tiết (nội dung ở cấp đó, điểm cần chú ý của mảng); "Mốc ngoài & lịch sử" | Phụ huynh thấy 7 dòng cấp đang học, biết dòng nào giả định, dòng nào cô đã xác nhận | trang `/learners/…/levels`, link "Hồ sơ cấp" trên thẻ của em |
| **Sổ quyết định cấp** (`level_decisions`, chỉ thêm): cô **xác nhận cấp khởi điểm** (7 mảng một lần) hoặc **điều chỉnh** một mảng (bắt buộc lý do, lên hoặc xuống). Chỉ **gia sư của em** ghi được — cơ sở dữ liệu chặn phụ huynh. "Lên cấp" để dành cho S7 | P2-a, P2-c, Q3 | `0020` |
| **Mốc thi ngoài** (`external_results`, chỉ thêm): KET / PET / FCE / CAE / CPE / đề thử vào 10 / bài thi ở trường / khác, ngày, điểm, mảng liên quan, ảnh hoặc PDF phiếu điểm (kho riêng tư). **Không tự đổi cấp** | Đối chiếu với cấp trong app | `0020`, "+ Thêm kết quả thi ngoài" |
| **Ô chọn nhãn**: nhãn quanh cấp đang học (± 1 cấp) lên trước; cấp khác nằm trong "Cấp khác (n)" thu gọn | P4-c | Ghi buổi học, Ghi kết quả bài, Giao bài, nhãn bài viết |
| **Trang chủ phụ huynh**: ô "Thay đổi cấp gần đây" (30 ngày, tối đa 5 dòng, kèm lý do) | Phụ huynh được báo khi cô điều chỉnh | trang chủ |
| **Trang chủ của em**: "Việc cần ôn" theo mảng — tối đa 3 điểm đã đến hạn hỏi lại, **không cấp, không điểm** | P2-d | trang chủ của em |

Học sinh không đọc được hai sổ mới (cơ sở dữ liệu chặn). Báo cáo kỹ năng đọc tháng hiện trong "Mốc ngoài" là "Báo cáo kỹ năng đọc tháng 10/2026 · Đọc", không ghi tên nguồn. Xóa dữ liệu một em xóa luôn hai sổ mới và file phiếu điểm.

### SQL cần áp

- **`db/migrations/0020_level_profile.sql`** — Actions → **Apply database migrations** (gõ APPLY) hoặc dán vào SQL Editor. **Áp `0020` TRƯỚC khi thử preview hoặc gộp PR**; cần `0019` đã áp. Chỉ thêm: 2 bảng mới, nới danh sách loại file (thêm `external_result`), 5 hàm mới, bản mới của hàm xóa dữ liệu một em (giữ nguyên mọi dòng cũ). Chạy lại an toàn. Nên bấm chạy tay *Weekly backup* trước khi áp. Chưa áp thì trang Hồ sơ cấp báo lỗi; ô chọn nhãn và trang chủ vẫn chạy (chỉ không sắp theo cấp / không có ô mới).

### Cách thử trên preview (gia đình thử)

1. `thu-giasu-nguyen` → thẻ Nguyên (thử) → **Hồ sơ cấp**: 7 thanh đều có sọc "Ước lượng — cô chưa xác nhận"; 3 ô ghi "Các mảng đang ngang nhau" và "Không có".
2. Bấm **Xác nhận cấp khởi điểm** (7 mảng đã điền sẵn) → đổi Ngữ pháp thành B2+ → Lưu: cả 7 thanh hết sọc; ô "Mạnh nhất" = Ngữ pháp · B2+.
3. Mở mảng Ngữ pháp → **Điều chỉnh cấp** → B2, lý do "thử" → Lưu: "Lịch sử cấp" có thêm dòng "Ngữ pháp: B2+ → B2 · Điều chỉnh" kèm lý do.
4. Đăng nhập phụ huynh → trang chủ có ô **Thay đổi cấp gần đây** (dòng "Điều chỉnh" có lý do ở trên cùng) → mở Hồ sơ cấp → **+ Thêm kết quả thi ngoài** (FCE, 172, mảng Đọc + Nghe, kèm ảnh) → thấy trong "Mốc ngoài". Phụ huynh không có nút Xác nhận / Điều chỉnh.
5. `thu-giasu-nguyen` → **Ghi buổi học**: tab Từ vựng — nhãn quanh B2 hiện trước, phần "Cấp khác" thu gọn.
6. Đăng nhập `thu-nguyen` (em): trang chủ không có chữ cấp nào; nếu có điểm đến hạn hỏi lại thì thấy "Việc cần ôn" theo mảng.

### Quyết định trong kế hoạch (phụ huynh xem lại)

D1 "± 1 cấp" = ± 1 bậc CEFR lớn (A2 → A1…B1+) · D2 chỉ áp cho ô chọn nhãn · D3 ba ô "Đã vững / Đang luyện / Để lên cấp tiếp" ghi "Sẽ có khi app bắt đầu theo dõi trạng thái từng kỹ năng" tới S7 · D4 Mạnh nhất / Cần tập trung chỉ so 6 mảng ngôn ngữ · D5 thanh Tư duy thang riêng · D6 xác nhận một lần mỗi mảng, sau đó chỉ "Điều chỉnh" · D7 bằng chứng do cơ sở dữ liệu tự ghi · D8 chỉ gia sư quyết cấp · D9 mốc ngoài chưa sửa / xóa được · D10 báo cáo đọc không ghi nguồn · D11 30 ngày, 5 dòng · D12 em thấy tối đa 3 điểm · D13 chữ "cô" theo mockup · D14 chi tiết mảng dùng mô tả nhóm của SM-1 · D15 ai mở trang nào. Chi tiết: bảng "Decisions" trong kế hoạch.

### Hỏi phụ huynh (chưa chặn)

1. Có cần sửa / rút một kết quả thi ngoài nhập nhầm không? (hiện chỉ thêm được bản đúng).
2. Ô "Thay đổi cấp gần đây" có cần nút "Đã xem" không?

### Tiêu chí đạt

`typecheck`, `lint`, `test` (gồm test database: ma trận vai, chỉ thêm, xóa dữ liệu, học sinh bị chặn), `gen:config` xanh; CI (E2E + áp migration hai lần) xanh; review Opus; phụ huynh áp `0020` rồi làm 6 bước thử ở trên; buổi 30 phút: gia sư xác nhận cấp khởi điểm cho cả hai em.
```

- [ ] **Step 2: `CLAUDE.md`** — two edits:
  - In "Current status", right after the "SM-1 (Bản đồ kỹ năng)" bullet, add:

```markdown
- **SM-2 (Hồ sơ cấp đang học) — code trên nhánh `feature/sm2-level-profile`** (dựa trên `feature/skill-map`), chờ CI + review Opus + phụ huynh duyệt PR; **áp `0020_level_profile.sql` TRƯỚC khi thử preview hoặc gộp** (chỉ thêm; cần 0019): sổ `level_decisions` (baseline / adjust — chỉ gia sư của em; `level_up` để dành S7) + `external_results` (mốc thi ngoài, file `external_result`), trang Hồ sơ cấp (7 thanh, ước lượng có sọc), Xác nhận cấp khởi điểm / Điều chỉnh cấp (bắt buộc lý do) / Thêm kết quả thi ngoài, ô chọn nhãn ± 1 cấp, ô "Thay đổi cấp gần đây" (phụ huynh), "Việc cần ôn" theo mảng (em: chỉ tên điểm + tên mảng). Kế hoạch `docs/superpowers/plans/2026-10-22-sm2-level-profile.md`.
```

  - In the "Seed cấu hình sinh tự động…" bullet, replace the parenthesis that names the next migration (today: `(số kế tiếp, **hiện là 0020** vì 0017 là S5c, 0018 là kỹ năng đọc của Studio 1 PR A và 0019 là bản đồ kỹ năng SM-1)`) with `(số kế tiếp, **hiện là 0021** vì 0017 là S5c, 0018 là kỹ năng đọc của Studio 1 PR A, 0019 là bản đồ kỹ năng SM-1 và 0020 là hồ sơ cấp SM-2)`.

- [ ] **Step 3: `docs/DESIGN.md`** — after §19.7 add:

```markdown
### 19.8. Hồ sơ cấp đang học (SM-2, migration 0020)

- **Bảng (chỉ thêm, `eng_forbid_mutation('learner_id')`, RLS đọc `eng_is_staff_of`, không ai ghi trực tiếp):** `level_decisions(id, learner_id, domain_key, map_id, from_level, to_level, kind baseline|level_up|adjust, reason (bắt buộc với adjust), evidence jsonb, policy_version, decided_by_member, decided_role = 'tutor', client_id, decided_at)`; `external_results(id, learner_id, exam KET|PET|FCE|CAE|CPE|VAO10_MOCK|SCHOOL|OTHER, taken_on, score_text, domains text[], file_id → files (kind 'external_result'), note, recorded_by_member, recorded_role tutor|parent, client_id, recorded_at)`. Cả hai nằm trong `eng_purge_learner` / `eng_purge_preview` (mốc ngoài xóa trước `files`; file thật xóa bằng `deleteLearnerFolder`).
- **Cấp hiện tại** = dòng gần nhất của mảng; chưa có → `skill_maps.assumed` theo track (status `assumed`). Thang theo `skill_domains.scale`: CEFR 9 nấc hoặc bậc '1'..'4'.
- **Ghi (service_role sau `requireAccess`):** `eng_record_level(p_learner, p_kind, p_levels jsonb, p_reason, p_by, p_client_id)` — chỉ gia sư còn quan hệ hiệu lực (`42501 (tutor_only)`); baseline một lần mỗi mảng (`(already_confirmed)`), adjust cần baseline (`(needs_baseline)`), đúng 1 mảng, khác cấp (`(same_level)`), có lý do (`(reason_required)`); `level_up` bị từ chối (`(level_up_reserved)`, để S7); `from_level` và `evidence` do hàm tính. `eng_record_external_result(p_learner, p_exam, p_taken_on, p_score_text, p_domains, p_note, p_file, p_by, p_client_id)` — gia sư hoặc phụ huynh; ngày ≤ hôm nay, ≥ 3660 ngày trước (`(bad_date)`). Audit `level.recorded` / `external_result.recorded` (không lý do, không điểm).
- **Đọc:** `eng_level_profile(p_learner)` (7 mảng + lịch sử 30 + mốc ngoài 30 + 6 báo cáo đọc gần nhất, không tên nguồn), `eng_recent_level_changes(p_learner, p_days)` (trang chủ phụ huynh) — service_role; `eng_my_review_by_domain()` — **authenticated**, nhận diện em bằng `auth.uid()`, trả tối đa 3 `{domain_key, domain_name, label}` từ các nhãn đến hạn hỏi lại của `eng_weak_points`.
- **App:** `lib/levels/` (thang, ± 1 cấp, văn bản), action `levels:decide` (chỉ gia sư), `loadPickerMap` = bản đồ + `current` → `groupTags` chia `groups` / `far` (P4-c).
```

- [ ] **Step 4: Full checks** — `npm run typecheck && npm run lint && npm test && npm run gen:config` → all green (DB tests need local Postgres 16; `gen:config` reports nothing new: SM-2 adds no versioned content).

- [ ] **Step 5: Commit docs**

```bash
git add docs/PROGRESS.md CLAUDE.md docs/DESIGN.md
git commit -m "docs(sm-2): PROGRESS section, status + next migration 0021, DESIGN §19.8"
```

- [ ] **Step 6: Push and CI** — `git push -u origin feature/sm2-level-profile`, then `gh workflow run ci.yml --ref feature/sm2-level-profile`; wait for green (E2E included).

- [ ] **Step 7: Opus review** — run the `reviewer` agent on `git diff origin/feature/skill-map...HEAD` (or `origin/main...HEAD` once SM-1 is merged); fix findings in new commits; re-run CI.

- [ ] **Step 8: Open the PR** — base `feature/skill-map` until SM-1 is merged, then retarget to `main`. Vietnamese body: làm gì (bảng của PROGRESS) · cách thử trên preview (6 bước) · **SQL cần phụ huynh áp: 0020 (áp TRƯỚC khi thử preview hoặc gộp; cần 0019)** · quyết định D1–D15 · 2 câu hỏi · tiêu chí đạt/chưa; ends with the session's PR footer.

---

## Self-review against the spec (done while writing this plan)

| Spec item | Where |
|---|---|
| P2-a assumed start level, "giả định — chờ cô xác nhận", tutor confirms per domain | Task 3 (`status`), Task 6 bars/detail ("Ước lượng — cô chưa xác nhận", D13), Task 7 baseline form |
| P2-b 9 steps / task levels 1–4 | Task 1 checks, Task 2 `bad_level` by `domain.scale`, Task 4 `levelsOf` |
| P2-c never auto-down; adjust up/down with reason; parent told | Task 2 (`adjust`, reason, no automatic writer), Task 9 parent box |
| P2-d student sees no level; "Việc cần ôn" by domain | Task 3 `eng_my_review_by_domain`, Task 9, Task 10 e2e |
| P4-c picker ± 1 | Task 8 (D1, D2) |
| §3 seven rows, status, date + who, progress "—" until S7, latest external result | Task 3 profile, Task 6 (D3) |
| §3 `level_decisions` columns, latest = current, assumed from config | Tasks 1–3 (+ D7, D8) |
| §3 who writes: tutor with active relationship (DB), `level_up` only via S7, parent reads | Task 2 + Task 5 `levels:decide`, DB tests |
| §3 `external_results` (exams, date, score text, domains, file in `english-work`, note, recorder), no level change | Tasks 1–2, 5, 7 |
| §3 reading reports shown as external milestone of Đọc | Task 3 / Task 6 (D10, no "TOMO") |
| §3 students cannot read the two books | Task 1 RLS + DB test, Task 3 ACL tests |
| §5 SM-2 rows (profile, baseline / adjust, external form, picker ± 1, parent box, student box) | Tasks 6–9 |
| §6 both tables in purge + preview (with files) | Task 1 (+ DB purge test), Task 5 labels |
| §1 "Cách gọi": "đang học B1", never "đạt" | Task 4 copy test, Task 6–9 UI tests |
| §7 no email / push, no AI, no auto level, no score for students | nothing sends; Global Constraints |
| Always light, no "TOMO" | no `dark:` classes in new components (SM-1 `lightOnly` test), `copyNoProvider` test + Milestones test |
| Migration rules (idempotent, expand, last line, search_path, grants, append-only trigger) | Task 1–3 unit tests + DB "run again" test |
| Docs (PROGRESS, CLAUDE.md next 0021, DESIGN) | Task 11 |

Placeholder scan: every code step carries the code; the only "adapt by hand" note is Task 8's warning that `feature/skill-map` may move under review (the tests remain the contract). Names checked across tasks: `eng_record_level`, `eng_record_external_result`, `eng_level_profile`, `eng_recent_level_changes`, `eng_my_review_by_domain`, `loadLevelProfile`, `loadRecentLevelChanges`, `mergeRecentChanges`, `loadPickerMap`, `levelsOf`, `nearLevel`, `currentLevels`, `RecentChange`, `ReviewItem`, `BucketGroup`, `levelCopy` / `levelFormCopy` / `externalCopy` / `studentReviewCopy`, `EXAM_DAYS_BACK`.

---

## Amendments — parent decisions 22/10/2026 ("ok SM-2")

The parent approved D1–D15 except D9 and D13, which change as follows. These amendments override the tasks above wherever they conflict. Task 11 (docs, review, PR) must describe them.

### A1 (replaces D13): say "thầy/cô", never a literal "cô"

All level strings use the existing configurable `tutorHonorific` from `lib/copy/vi.ts` (today "thầy/cô"). Examples: "Đang chờ thầy/cô", "Ước lượng — thầy/cô chưa xác nhận", "Thầy/cô xác nhận ngày …". Reason: tutor accounts are generic and the tutor may change, so a gendered word can become wrong.

- In Task 4 copy and Task 6/7/9 components, build these strings from `tutorHonorific`. Do not hard-code "cô". Capitalise the first letter at sentence start with a small helper, e.g. `cap(tutorHonorific)`.
- Add a unit test: no level-profile string in `lib/copy/vi.ts` contains the standalone word "cô" (regex `/(^|[^/\p{L}])cô([^/\p{L}]|$)/u` on the `levels…` copy objects). Any "cô" must come from `tutorHonorific`.

### A2 (replaces D9): an external result can be corrected by a replacement entry

Nothing is ever deleted. A correction is a new row that replaces an earlier one, following the same pattern as `results.supersedes_id` in 0014 / "Sửa kết quả" in S5b.

- **Migration 0020:** `english.external_results` gets `supersedes_id uuid references english.external_results(id)`, nullable. Add a unique partial index so a row is superseded at most once: `create unique index … on english.external_results(supersedes_id) where supersedes_id is not null`. The table stays append-only.
- **`eng_record_external_result`:** gains the last parameter `p_supersedes uuid default null`. When it is set:
  - the target row must exist and belong to the same learner;
  - the target row must not already be superseded; otherwise raise `already_superseded`;
  - the actor must be tutor or parent in scope, same as for creating a row;
  - write audit `external_result.corrected`.
  - Update the function signature in grants/revokes, the store and the tests.
- **Reading:** `eng_level_profile` and the "Mốc ngoài" lists only show live rows (rows nobody supersedes). History shows a corrected row as "đã sửa" next to its replacement. Purge and preview count both rows.
- **UI (Task 7):** each live external result in "Mốc ngoài & lịch sử" gets a "Sửa" link. It opens the same form prefilled from that row and posts it with `supersedes_id`. The copy goes in `vi.ts`.
- **API (Task 5):** the body schema accepts an optional `supersedes_id`. Error `already_superseded` maps to 409, `not_found` to 404.
- **DB tests:**
  - correct once → OK;
  - correct the same row again → `already_superseded`;
  - correct another learner's row → refused;
  - a student cannot call it;
  - the profile shows only the replacement;
  - purge removes both rows.
- **E2E:** extend the Task 10 external-result check: add a result, press Sửa, change the score, and the profile shows only the new score.
