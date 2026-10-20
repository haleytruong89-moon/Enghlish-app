# Studio 1 · PR A — Kỹ năng đọc (reading skills) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tutors and the parent can record a child's monthly reading-skill report (TOMO-style: per skill, number of questions and % correct) and see a "Kỹ năng đọc" table on "Điểm cần chú ý", with "chưa đủ dữ liệu" for thin samples; reading skills also become ordinary error tags usable on results and session notes.

**Architecture:** One new migration `0018_reading_skills.sql` seeds reading-skill tags into `english.error_tags` (group "Kỹ năng đọc": 14 for Track B, 6 for Track A), retires A's old generic `doc-hieu`, seeds two thresholds in `tutorwork_settings`, adds an append-only `english.reading_reports` table with two service-role functions (`eng_record_reading_report`, `eng_reading_skills`) and extends the purge + purge preview. The app adds a small `lib/reading/` module (types, zod schema, handler, store, loader, shape) following the `lib/tutorwork/` pattern, one POST route, one entry page, one table component on the weak-points page and one link on the learner card. No AI.

**Tech Stack:** Next.js App Router + TypeScript strict, Supabase Postgres (schema `english`), zod, Vitest (unit + DB tests on local Postgres), Playwright (CI only).

**Spec:** `docs/superpowers/specs/2026-10-20-studio-design.md` (§1 Q8, §2 PR A, §3).

## Global Constraints

- Everything lives in schema `english`; never create or change anything in schema `public`; never `supabase db push` / `db reset --linked`.
- Migration is idempotent, expand-only, ends with `insert into english.schema_migrations(version) values ('0018') on conflict do nothing;`. Never edit 0001–0017.
- Every new function: `security definer`, `set search_path = ''`, `revoke execute … from public, anon, authenticated; grant execute … to service_role;`. Routes call them only after `requireAccess` (outside scope → 404).
- New append-only table gets `eng_forbid_mutation` triggers (header of `0004_append_only.sql`) and is added to `eng_purge_learner` and `eng_purge_preview`. No `grant … on all tables`.
- All UI text from `lib/copy/vi.ts`; students never see this data (staff only: tutor + parent). Track is configuration: no `if (track === 'A')` in business logic (ESLint blocks it).
- Reading reports are a **signal**, not evidence: the S7 engine never reads them.
- Thresholds are settings, not code: `tutorwork_settings.reading_min_questions = 4`, `reading_weak_pct = 60`.
- Only skills (questions + %); **no Lexile/CEFR** in this PR.
- Before PR: `npm run typecheck && npm run lint && npm test && npm run gen:config` green; Opus review; PR description in Vietnamese with "SQL cần áp: 0018".
- Commits end with the session's Co-Authored-By / Claude-Session lines.

---

## File map

| File | Responsibility |
|---|---|
| `content/tags/reading_A.json`, `content/tags/reading_B.json` | Source of truth for the reading-skill tags (order = display order) |
| `db/migrations/0018_reading_skills.sql` | Tags seed, retire `A/doc-hieu`, settings seed, `reading_reports`, `eng_record_reading_report`, `eng_reading_skills`, purge + preview |
| `lib/reading/types.ts` | Constants + view types |
| `lib/reading/schemas.ts` | zod body of POST |
| `lib/reading/shape.ts` | Parse DB jsonb → view types |
| `lib/reading/handlers.ts` | `handleRecordReadingReport` (requireAccess → zod → store) |
| `lib/reading/supabaseStore.ts` | RPC calls (service role) |
| `lib/reading/route.ts` | Route glue (session → handler → JSON) |
| `lib/reading/load.ts` | Server loaders for pages |
| `app/api/learners/[id]/reading-reports/route.ts` | POST |
| `app/learners/[id]/reading/new/page.tsx` | Entry page (tutor + parent) |
| `components/tutor/ReadingReportForm.tsx` | Client form (14/6 rows) |
| `components/tutor/ReadingSkillsTable.tsx` | Table on the weak page |
| `app/learners/[id]/weak/page.tsx` | Render the reading section |
| `components/LearnerCard.tsx` | Link "Nhập kỹ năng đọc tháng" |
| `lib/copy/vi.ts` | `readingPage` copy + purge label |
| Tests | `tests/unit/readingTags.test.ts`, `tests/unit/migration0018.test.ts`, `tests/db/readingSkills.test.ts`, `tests/unit/reading.test.ts`, `tests/unit/readingUi.test.ts`, `tests/e2e/reading.spec.ts` |

---

### Task 1: Reading-skill tag files

**Files:**
- Create: `content/tags/reading_A.json`, `content/tags/reading_B.json`
- Test: `tests/unit/readingTags.test.ts`

**Interfaces:**
- Produces: JSON `{ track: "A"|"B", group_vi: "Kỹ năng đọc", tags: [{ key, label_vi }] }`; keys used by Task 2's migration and the tests.

- [ ] **Step 1: Write the failing test** — `tests/unit/readingTags.test.ts`

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";

type ReadingFile = { track: string; group_vi: string; tags: { key: string; label_vi: string }[] };
const read = (f: string) => JSON.parse(readFileSync(path.join(CONTENT_DIR, "tags", f), "utf8")) as ReadingFile;

describe("reading-skill tags (Studio 1A)", () => {
  it("Track B has the 14 TOMO skills in the report's order, bilingual labels", () => {
    const b = read("reading_B.json");
    expect(b.track).toBe("B");
    expect(b.group_vi).toBe("Kỹ năng đọc");
    expect(b.tags.map((t) => t.key)).toEqual([
      "doc-author-purpose", "doc-compare-contrast", "doc-cause-effect", "doc-sequence", "doc-conclusions", "doc-fact-opinion",
      "doc-main-idea", "doc-inference", "doc-prediction", "doc-summarize", "doc-evidence", "doc-antonyms", "doc-context-clues", "doc-synonyms",
    ]);
    for (const t of b.tags) expect(t.label_vi).toMatch(/^[A-Z][^—]+ — \S/);
  });

  it("Track A has the short set of 6, sharing keys and labels with Track B where they overlap", () => {
    const a = read("reading_A.json");
    const b = new Map(read("reading_B.json").tags.map((t) => [t.key, t.label_vi]));
    expect(a.track).toBe("A");
    expect(a.tags.map((t) => t.key)).toEqual(["doc-main-idea", "doc-details", "doc-inference", "doc-author-purpose", "doc-context-clues", "doc-sequence"]);
    for (const t of a.tags) if (b.has(t.key)) expect(t.label_vi).toBe(b.get(t.key));
  });

  it("keys match the error_tags key rule and never start with x- (custom tags)", () => {
    for (const f of ["reading_A.json", "reading_B.json"]) for (const t of read(f).tags) expect(t.key).toMatch(/^doc-[a-z0-9-]{2,57}$/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/readingTags.test.ts`
Expected: FAIL (ENOENT reading_B.json)

- [ ] **Step 3: Create the two files**

`content/tags/reading_B.json`:
```json
{
  "track": "B",
  "group_vi": "Kỹ năng đọc",
  "note": "Reading skills as in the monthly TOMO report the tutor uses (order of the report). Seeded by migration 0018. Not part of the locked catalogue.",
  "tags": [
    { "key": "doc-author-purpose", "label_vi": "Author's Purpose — Mục đích của tác giả" },
    { "key": "doc-compare-contrast", "label_vi": "Compare and Contrast — So sánh và đối lập" },
    { "key": "doc-cause-effect", "label_vi": "Cause and Effect — Nguyên nhân – kết quả" },
    { "key": "doc-sequence", "label_vi": "Chronology/Sequence — Trình tự thời gian / sự kiện" },
    { "key": "doc-conclusions", "label_vi": "Draw Conclusions — Rút ra kết luận" },
    { "key": "doc-fact-opinion", "label_vi": "Fact and Opinion — Sự kiện và ý kiến" },
    { "key": "doc-main-idea", "label_vi": "Main Idea — Ý chính" },
    { "key": "doc-inference", "label_vi": "Make Inferences — Suy luận" },
    { "key": "doc-prediction", "label_vi": "Make Predictions — Dự đoán" },
    { "key": "doc-summarize", "label_vi": "Summarize — Tóm tắt" },
    { "key": "doc-evidence", "label_vi": "Use Evidence — Sử dụng chứng cứ" },
    { "key": "doc-antonyms", "label_vi": "Antonyms — Từ trái nghĩa" },
    { "key": "doc-context-clues", "label_vi": "Context Clues — Gợi ý từ văn bản" },
    { "key": "doc-synonyms", "label_vi": "Synonyms — Từ đồng nghĩa" }
  ]
}
```

`content/tags/reading_A.json`:
```json
{
  "track": "A",
  "group_vi": "Kỹ năng đọc",
  "note": "Short reading-skill set for KET/A2 (names as in the TOMO report; 'Details' added because KET asks for it). Seeded by migration 0018.",
  "tags": [
    { "key": "doc-main-idea", "label_vi": "Main Idea — Ý chính" },
    { "key": "doc-details", "label_vi": "Details — Tìm chi tiết" },
    { "key": "doc-inference", "label_vi": "Make Inferences — Suy luận" },
    { "key": "doc-author-purpose", "label_vi": "Author's Purpose — Mục đích của tác giả" },
    { "key": "doc-context-clues", "label_vi": "Context Clues — Gợi ý từ văn bản" },
    { "key": "doc-sequence", "label_vi": "Chronology/Sequence — Trình tự thời gian / sự kiện" }
  ]
}
```

- [ ] **Step 4: Run the test** — `npx vitest run tests/unit/readingTags.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add content/tags/reading_A.json content/tags/reading_B.json tests/unit/readingTags.test.ts
git commit -m "feat(studio-1a): reading-skill tag sets (TOMO 14 for Track B, 6 for Track A)"
```

---

### Task 2: Migration 0018 part 1 — seed tags, retire `doc-hieu`, seed thresholds

**Files:**
- Create: `db/migrations/0018_reading_skills.sql`
- Test: `tests/unit/migration0018.test.ts`, `tests/db/readingSkills.test.ts`

**Interfaces:**
- Consumes: Task 1 JSON files.
- Produces: rows in `english.error_tags` (`origin='seed'`, `group_vi='Kỹ năng đọc'`), settings keys `reading_min_questions`, `reading_weak_pct`.

- [ ] **Step 1: Write the failing unit test** — `tests/unit/migration0018.test.ts`

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0018_reading_skills.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const json = (f: string) => JSON.parse(readFileSync(path.join(CONTENT_DIR, "tags", f), "utf8")) as { track: string; group_vi: string; tags: { key: string; label_vi: string }[] };

describe("0018_reading_skills.sql", () => {
  it("ends by recording its own version, is expand-only and never touches schema public", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0018') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("seeds exactly the two reading JSON files, in order, as group 'Kỹ năng đọc'", () => {
    const expected = [json("reading_A.json"), json("reading_B.json")].flatMap((f) =>
      f.tags.map((t, i) => `('${f.track}', ${i + 1}, '${t.key}', '${t.label_vi.replace(/'/g, "''")}')`));
    for (const row of expected) expect(code).toContain(row);
    const rows = [...code.matchAll(/\('(A|B)', \d+, 'doc-[a-z-]+', '/g)];
    expect(rows.length).toBe(expected.length);
    expect(code).toContain("'Kỹ năng đọc'");
  });

  it("retires A's generic reading tag and seeds the two thresholds", () => {
    expect(code).toMatch(/update english\.error_tags set retired_at = pg_catalog\.clock_timestamp\(\)\s+where track_id = 'A' and key = 'doc-hieu' and retired_at is null;/);
    expect(code).toContain("('reading_min_questions', '4'::jsonb)");
    expect(code).toContain("('reading_weak_pct', '60'::jsonb)");
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run tests/unit/migration0018.test.ts` → FAIL (ENOENT)

- [ ] **Step 3: Create the migration (part 1)** — `db/migrations/0018_reading_skills.sql`

```sql
-- 0018_reading_skills.sql
-- Studio bước 1 · PR A (spec docs/superpowers/specs/2026-10-20-studio-design.md §3): kỹ năng đọc.
--   1. Nhãn "Kỹ năng đọc" (khung báo cáo TOMO mà gia sư đang dùng): Track B 14 kỹ năng, Track A 6. Nguồn: content/tags/reading_*.json
--      (test đối chiếu từng dòng). Nhãn chung cũ A/doc-hieu nghỉ dùng (dấu nhãn cũ vẫn hiện đúng tên).
--   2. Ngưỡng trong tutorwork_settings (không hard-code): reading_min_questions = 4, reading_weak_pct = 60.
--   3. Bảng append-only reading_reports (báo cáo kỹ năng đọc tháng: số câu + % mỗi kỹ năng; KHÔNG có Lexile/CEFR).
--   4. eng_record_reading_report (ghi), eng_reading_skills (đọc cho bảng "Kỹ năng đọc"); cả hai chỉ service_role gọi sau requireAccess.
--   5. eng_purge_learner + eng_purge_preview thêm reading_reports.
-- Là TÍN HIỆU, không phải bằng chứng: engine S7 không đọc. Idempotent; chỉ thêm.

-- 1. Nhãn kỹ năng đọc -----------------------------------------------------------------------------------------------------------------
insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin)
select v.track_id, v.key, v.label_vi, 'Kỹ năng đọc', null, 'seed'
from (values
  ('A', 1, 'doc-main-idea', 'Main Idea — Ý chính'),
  ('A', 2, 'doc-details', 'Details — Tìm chi tiết'),
  ('A', 3, 'doc-inference', 'Make Inferences — Suy luận'),
  ('A', 4, 'doc-author-purpose', 'Author''s Purpose — Mục đích của tác giả'),
  ('A', 5, 'doc-context-clues', 'Context Clues — Gợi ý từ văn bản'),
  ('A', 6, 'doc-sequence', 'Chronology/Sequence — Trình tự thời gian / sự kiện'),
  ('B', 1, 'doc-author-purpose', 'Author''s Purpose — Mục đích của tác giả'),
  ('B', 2, 'doc-compare-contrast', 'Compare and Contrast — So sánh và đối lập'),
  ('B', 3, 'doc-cause-effect', 'Cause and Effect — Nguyên nhân – kết quả'),
  ('B', 4, 'doc-sequence', 'Chronology/Sequence — Trình tự thời gian / sự kiện'),
  ('B', 5, 'doc-conclusions', 'Draw Conclusions — Rút ra kết luận'),
  ('B', 6, 'doc-fact-opinion', 'Fact and Opinion — Sự kiện và ý kiến'),
  ('B', 7, 'doc-main-idea', 'Main Idea — Ý chính'),
  ('B', 8, 'doc-inference', 'Make Inferences — Suy luận'),
  ('B', 9, 'doc-prediction', 'Make Predictions — Dự đoán'),
  ('B', 10, 'doc-summarize', 'Summarize — Tóm tắt'),
  ('B', 11, 'doc-evidence', 'Use Evidence — Sử dụng chứng cứ'),
  ('B', 12, 'doc-antonyms', 'Antonyms — Từ trái nghĩa'),
  ('B', 13, 'doc-context-clues', 'Context Clues — Gợi ý từ văn bản'),
  ('B', 14, 'doc-synonyms', 'Synonyms — Từ đồng nghĩa')
) as v(track_id, ord, key, label_vi)
-- created_at = clock_timestamp() theo từng dòng: chèn theo thứ tự của báo cáo để bảng hiện đúng thứ tự.
order by v.track_id, v.ord
on conflict do nothing;

update english.error_tags set retired_at = pg_catalog.clock_timestamp()
  where track_id = 'A' and key = 'doc-hieu' and retired_at is null;

-- 2. Ngưỡng ----------------------------------------------------------------------------------------------------------------------------
insert into english.tutorwork_settings(key, value) values
  ('reading_min_questions', '4'::jsonb),
  ('reading_weak_pct', '60'::jsonb)
on conflict do nothing;

insert into english.schema_migrations(version) values ('0018') on conflict do nothing;
```

(The final `schema_migrations` line stays the LAST line of the file; Task 3 inserts its sections above it.)

- [ ] **Step 4: Run the unit test** — `npx vitest run tests/unit/migration0018.test.ts` → PASS

- [ ] **Step 5: Write the failing DB test** — `tests/db/readingSkills.test.ts` (file created here, grown in Task 3)

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayVn } from "../../lib/inquiries/dates";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

/** Studio 1A (migration 0018): reading skills. One database for the whole file. */
describe("Studio 1A reading skills (migration 0018)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. tags and thresholds", () => {
    it("Track B has 14 reading skills and Track A 6, in report order; A's generic doc-hieu is retired", async () => {
      const keys = async (track: string) =>
        (await q1<{ key: string }>("select key from english.error_tags where track_id = $1 and group_vi = 'Kỹ năng đọc' and retired_at is null order by created_at, key", [track])).map((r) => r.key);
      expect(await keys("B")).toHaveLength(14);
      expect((await keys("B"))[0]).toBe("doc-author-purpose");
      expect(await keys("A")).toEqual(["doc-main-idea", "doc-details", "doc-inference", "doc-author-purpose", "doc-context-clues", "doc-sequence"]);
      expect((await q1<{ retired: boolean }>("select retired_at is not null as retired from english.error_tags where track_id = 'A' and key = 'doc-hieu'"))[0]?.retired).toBe(true);
    });

    it("seeds the two thresholds and running the migration again changes nothing", async () => {
      const read = async () => q1<{ key: string; value: number }>("select key, value from english.tutorwork_settings where key like 'reading_%' order by key");
      expect(await read()).toEqual([{ key: "reading_min_questions", value: 4 }, { key: "reading_weak_pct", value: 60 }]);
      await migrate(db.client, true);
      expect(await read()).toEqual([{ key: "reading_min_questions", value: 4 }, { key: "reading_weak_pct", value: 60 }]);
      expect((await q1<{ n: number }>("select count(*)::int as n from english.error_tags where group_vi = 'Kỹ năng đọc'"))[0]?.n).toBe(20);
    });
  });
});
```

- [ ] **Step 6: Run the DB test** — `npm run test:db -- tests/db/readingSkills.test.ts` → PASS (migration file exists now). (`migrate(db.client, true)` re-applies every migration file — the idempotency check.)

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0018_reading_skills.sql tests/unit/migration0018.test.ts tests/db/readingSkills.test.ts
git commit -m "feat(studio-1a): migration 0018 seeds reading-skill tags, retires A/doc-hieu, seeds reading thresholds"
```

---

### Task 3: Migration 0018 part 2 — `reading_reports`, write + read functions, purge

**Files:**
- Modify: `db/migrations/0018_reading_skills.sql` (insert sections 3–5 ABOVE the final `schema_migrations` line)
- Modify: `lib/copy/vi.ts` (`purgePage.countLabels.reading_reports`)
- Test: `tests/unit/migration0018.test.ts`, `tests/db/readingSkills.test.ts`

**Interfaces:**
- Produces (SQL, service_role only):
  - `english.eng_record_reading_report(p_learner uuid, p_month date, p_source text, p_rows jsonb, p_note text, p_supersedes uuid, p_by uuid, p_client_id text) returns jsonb` → `{id uuid, replayed bool}`. Errors: `42501` actor; `P0002` learner; `23514` `(bad_month)`, unknown skill, bad supersede; `22023` bad rows / `(note_too_long)`; `23505` `(duplicate_month)` / client id reused.
  - `english.eng_reading_skills(p_learner uuid) returns jsonb` → `{min_questions int, weak_pct int, latest_month date|null, latest_source text|null, previous_month date|null, skills: [{tag_key, label_vi, questions int|null, correct_pct int|null, prev_questions int|null, prev_correct_pct int|null, status 'none'|'thin'|'weak'|'ok', wrong_6w int}]}`.
  - `p_rows` element shape: `{"tag_key": text, "questions": 1..500, "correct_pct": 0..100}` (integers only, exactly these 3 keys).

- [ ] **Step 1: Add failing unit assertions** — append to `tests/unit/migration0018.test.ts` inside the `describe`:

```ts
  it("reading_reports is append-only, staff-read only, and in the purge and its preview", () => {
    expect(code).toContain("create table if not exists english.reading_reports (");
    expect(code).toMatch(/create trigger reading_reports_forbid_mutation\s+before update or delete on english\.reading_reports\s+for each row execute function english\.eng_forbid_mutation\('learner_id'\);/);
    expect(code).toContain("revoke update, delete, truncate on english.reading_reports from public, anon, authenticated, service_role;");
    expect(code).toMatch(/create policy reading_reports_select on english\.reading_reports\s+for select to authenticated\s+using \(english\.eng_is_staff_of\(learner_id\)\);/);
    expect(code).toContain("delete from english.reading_reports rr where rr.learner_id = p_learner_id;");
    expect(code).toContain("'reading_reports', n_reading_reports,");
    expect(code).toContain("'reading_reports', (select pg_catalog.count(*) from english.reading_reports x where x.learner_id = p_learner),");
  });

  it("the purge keeps EVERY line of the 0016 version and the preview every line of the 0017 version (0018 only adds)", () => {
    const fnText = (src: string, name: string) => {
      const start = src.indexOf(`create or replace function english.${name}(`);
      return src.slice(start, src.indexOf("\n$$;", start));
    };
    const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));
    const old16 = readFileSync(path.join(MIGRATIONS_DIR, "0016_practice_files.sql"), "utf8");
    const old17 = readFileSync(path.join(MIGRATIONS_DIR, "0017_readiness.sql"), "utf8");
    const nowPurge = new Set(lines(fnText(sql, "eng_purge_learner")));
    for (const l of lines(fnText(old16, "eng_purge_learner"))) expect(nowPurge.has(l), l).toBe(true);
    const nowPreview = new Set(lines(fnText(sql, "eng_purge_preview")));
    for (const l of lines(fnText(old17, "eng_purge_preview"))) expect(nowPreview.has(l), l).toBe(true);
  });

  it("every function pins search_path, is security definer, and is closed to everyone but service_role", () => {
    for (const m of code.matchAll(/create or replace function english\.(\w+)\(([\s\S]*?)\n\$\$;/g)) {
      expect(m[0], `${m[1]} search_path`).toMatch(/set search_path = ''/);
      expect(m[0], `${m[1]} security definer`).toMatch(/security definer/);
    }
    for (const sig of [
      "eng_record_reading_report(uuid, date, text, jsonb, text, uuid, uuid, text)",
      "eng_reading_skills(uuid)",
      "eng_purge_learner(uuid, uuid)",
      "eng_purge_preview(uuid)",
    ]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function english.${sig} to service_role;`);
    }
  });
```

Run: `npx vitest run tests/unit/migration0018.test.ts` → FAIL (table missing).

- [ ] **Step 2: Insert sections 3 and 4 into the migration** (above the final line)

```sql
-- 3. Báo cáo kỹ năng đọc tháng (append-only) -----------------------------------------------------------------------------------------
create table if not exists english.reading_reports (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  -- Ngày đầu tháng của báo cáo.
  month date not null check (month = pg_catalog.date_trunc('month', month::timestamp)::date),
  source text not null default 'TOMO' check (pg_catalog.length(pg_catalog.btrim(source)) between 1 and 40),
  -- [{tag_key, questions 1..500, correct_pct 0..100}] — chỉ nhãn nhóm "Kỹ năng đọc" của track em (kiểm trong hàm ghi).
  rows jsonb not null check (pg_catalog.jsonb_typeof(rows) = 'array'),
  note text check (note is null or pg_catalog.length(note) <= 300),
  supersedes_id uuid references english.reading_reports(id),
  recorded_by_member uuid not null,
  recorded_role text not null check (recorded_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create unique index if not exists reading_reports_supersedes_once on english.reading_reports(supersedes_id) where supersedes_id is not null;
create index if not exists reading_reports_learner_idx on english.reading_reports(learner_id, month desc, recorded_at desc);

drop trigger if exists reading_reports_forbid_mutation on english.reading_reports;
create trigger reading_reports_forbid_mutation
  before update or delete on english.reading_reports
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists reading_reports_forbid_truncate on english.reading_reports;
create trigger reading_reports_forbid_truncate
  before truncate on english.reading_reports
  for each statement execute function english.eng_forbid_mutation();

alter table english.reading_reports enable row level security;
revoke all on english.reading_reports from public, anon, authenticated;
revoke update, delete, truncate on english.reading_reports from public, anon, authenticated, service_role;
grant select on english.reading_reports to authenticated;
drop policy if exists reading_reports_select on english.reading_reports;
create policy reading_reports_select on english.reading_reports
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- 4. Ghi và đọc ------------------------------------------------------------------------------------------------------------------------
-- Ghi một báo cáo tháng (gia sư hoặc phụ huynh của em). Một bản hiện hành mỗi (em, tháng, nguồn); sửa = p_supersedes (bản hiện hành
-- cùng tháng + nguồn). Gửi lại cùng client_id + cùng nội dung = trả bản cũ (replayed). Ghi audit_log (không có nội dung bài).
create or replace function english.eng_record_reading_report(
  p_learner uuid,
  p_month date,
  p_source text,
  p_rows jsonb,
  p_note text,
  p_supersedes uuid,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_source text := coalesce(nullif(pg_catalog.btrim(p_source), ''), 'TOMO');
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_today date := english.eng_today_vn();
  v_this_month date := pg_catalog.date_trunc('month', english.eng_today_vn()::timestamp)::date;
  v_old english.reading_reports%rowtype;
  v_prior english.reading_reports%rowtype;
  v_rows jsonb;
  v_id uuid;
begin
  if p_learner is null or p_month is null or p_rows is null or p_by is null or p_client_id is null then
    raise exception 'eng_record_reading_report: learner, month, rows, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_record_reading_report: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_record_reading_report: this member may not record reading reports for this learner' using errcode = '42501';
  end if;
  if p_month <> pg_catalog.date_trunc('month', p_month::timestamp)::date or p_month > v_this_month
     or p_month < (v_this_month - interval '24 months')::date then
    raise exception 'eng_record_reading_report: the month must be the first day of a month within the last 24 months (bad_month)' using errcode = '23514';
  end if;
  if pg_catalog.length(v_source) > 40 then
    raise exception 'eng_record_reading_report: the source name is too long' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 300 then
    raise exception 'eng_record_reading_report: the note is too long (note_too_long)' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' or pg_catalog.jsonb_array_length(p_rows) not between 1 and 20 then
    raise exception 'eng_record_reading_report: rows must be a list of 1 to 20 skills' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_rows) x
    where pg_catalog.jsonb_typeof(x) <> 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(x)) <> 3
       or not (x ? 'tag_key' and x ? 'questions' and x ? 'correct_pct')
       or pg_catalog.jsonb_typeof(x -> 'tag_key') <> 'string'
       or pg_catalog.jsonb_typeof(x -> 'questions') <> 'number' or pg_catalog.jsonb_typeof(x -> 'correct_pct') <> 'number'
       or (x ->> 'questions') !~ '^[0-9]{1,3}$' or (x ->> 'correct_pct') !~ '^[0-9]{1,3}$'
       or (x ->> 'questions')::int not between 1 and 500 or (x ->> 'correct_pct')::int not between 0 and 100) then
    raise exception 'eng_record_reading_report: each row needs tag_key, questions 1..500 and correct_pct 0..100 (whole numbers)' using errcode = '22023';
  end if;
  if (select count(distinct x ->> 'tag_key') from pg_catalog.jsonb_array_elements(p_rows) x) <> pg_catalog.jsonb_array_length(p_rows) then
    raise exception 'eng_record_reading_report: a skill appears twice' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_rows) x
    where not exists (
      select 1 from english.error_tags t
      where t.track_id = v_l.track_id and t.key = x ->> 'tag_key' and t.group_vi = 'Kỹ năng đọc'
        and t.retired_at is null and t.family_id is null)) then
    raise exception 'eng_record_reading_report: a row names a skill that is not a reading skill of this track' using errcode = '23514';
  end if;
  select pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object('tag_key', x ->> 'tag_key', 'questions', (x ->> 'questions')::int, 'correct_pct', (x ->> 'correct_pct')::int)
           order by x ->> 'tag_key')
    into v_rows
  from pg_catalog.jsonb_array_elements(p_rows) x;

  select * into v_old from english.reading_reports r where r.learner_id = p_learner and r.client_id = p_client_id;
  if found then
    if v_old.month = p_month and v_old.source = v_source and v_old.rows = v_rows
       and v_old.supersedes_id is not distinct from p_supersedes and v_old.note is not distinct from v_note then
      return pg_catalog.jsonb_build_object('id', v_old.id, 'replayed', true);
    end if;
    raise exception 'eng_record_reading_report: this client id was already used for another report' using errcode = '23505';
  end if;

  if p_supersedes is not null then
    select * into v_prior from english.reading_reports r where r.id = p_supersedes;
    if not found or v_prior.learner_id <> p_learner or v_prior.month <> p_month or v_prior.source <> v_source
       or exists (select 1 from english.reading_reports r2 where r2.supersedes_id = v_prior.id) then
      raise exception 'eng_record_reading_report: only the current report of the same month and source can be replaced' using errcode = '23514';
    end if;
  elsif exists (
    select 1 from english.reading_reports r
    where r.learner_id = p_learner and r.month = p_month and r.source = v_source
      and not exists (select 1 from english.reading_reports r2 where r2.supersedes_id = r.id)) then
    raise exception 'eng_record_reading_report: this month already has a report from this source (duplicate_month)' using errcode = '23505';
  end if;

  insert into english.reading_reports(learner_id, month, source, rows, note, supersedes_id, recorded_by_member, recorded_role, client_id)
  values (p_learner, p_month, v_source, v_rows, v_note, p_supersedes, p_by, v_member.role, p_client_id)
  returning id into v_id;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'reading_report.recorded', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('report_id', v_id, 'month', p_month, 'source', v_source,
                                        'skills', pg_catalog.jsonb_array_length(v_rows), 'supersedes', p_supersedes));
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- Bảng "Kỹ năng đọc" của một em: mọi kỹ năng đọc đang dùng của track (thứ tự báo cáo) với số liệu của báo cáo hiện hành MỚI NHẤT
-- và báo cáo hiện hành của tháng TRƯỚC đó, trạng thái theo ngưỡng cài đặt, và số câu sai (dấu nhãn tính được) 6 tuần gần đây.
create or replace function english.eng_reading_skills(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_min int;
  v_weak int;
  v_since date := english.eng_today_vn() - 42;
  v_latest english.reading_reports%rowtype;
  v_prev english.reading_reports%rowtype;
begin
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_reading_skills: learner not found' using errcode = 'P0002';
  end if;
  v_min := coalesce((select (s.value #>> '{}')::int from english.tutorwork_settings s where s.key = 'reading_min_questions'), 4);
  v_weak := coalesce((select (s.value #>> '{}')::int from english.tutorwork_settings s where s.key = 'reading_weak_pct'), 60);

  select * into v_latest from english.reading_reports r
  where r.learner_id = p_learner and not exists (select 1 from english.reading_reports r2 where r2.supersedes_id = r.id)
  order by r.month desc, r.recorded_at desc limit 1;
  if v_latest.id is not null then
    select * into v_prev from english.reading_reports r
    where r.learner_id = p_learner and r.month < v_latest.month
      and not exists (select 1 from english.reading_reports r2 where r2.supersedes_id = r.id)
    order by r.month desc, r.recorded_at desc limit 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'min_questions', v_min,
    'weak_pct', v_weak,
    'latest_month', v_latest.month,
    'latest_source', v_latest.source,
    'previous_month', v_prev.month,
    'skills', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'tag_key', t.key,
          'label_vi', t.label_vi,
          'questions', cur.questions,
          'correct_pct', cur.correct_pct,
          'prev_questions', prv.questions,
          'prev_correct_pct', prv.correct_pct,
          'status', case when cur.questions is null then 'none'
                         when cur.questions < v_min then 'thin'
                         when cur.correct_pct < v_weak then 'weak'
                         else 'ok' end,
          'wrong_6w', (select count(*)::int from english.tag_marks m
                       where m.learner_id = p_learner and m.tag_key = t.key and m.counts and m.marked_on >= v_since
                         and english.eng_mark_is_live(m.source, m.source_id, m.counts)))
        order by t.created_at, t.key)
      from english.error_tags t
      left join lateral (
        select (x ->> 'questions')::int as questions, (x ->> 'correct_pct')::int as correct_pct
        from pg_catalog.jsonb_array_elements(coalesce(v_latest.rows, '[]'::jsonb)) x where x ->> 'tag_key' = t.key) cur on true
      left join lateral (
        select (x ->> 'questions')::int as questions, (x ->> 'correct_pct')::int as correct_pct
        from pg_catalog.jsonb_array_elements(coalesce(v_prev.rows, '[]'::jsonb)) x where x ->> 'tag_key' = t.key) prv on true
      where t.track_id = v_l.track_id and t.group_vi = 'Kỹ năng đọc' and t.retired_at is null and t.family_id is null
    ), '[]'::jsonb));
end
$$;

revoke execute on function english.eng_record_reading_report(uuid, date, text, jsonb, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_record_reading_report(uuid, date, text, jsonb, text, uuid, uuid, text) to service_role;
revoke execute on function english.eng_reading_skills(uuid) from public, anon, authenticated;
grant execute on function english.eng_reading_skills(uuid) to service_role;
```

- [ ] **Step 3: Insert section 5 (purge + preview)** (above the final line)

Copy `english.eng_purge_learner(...)` **verbatim** from `db/migrations/0016_practice_files.sql` (from `create or replace function english.eng_purge_learner(` through its `grant execute … to service_role;`) under a header `-- 5. Purge: thêm reading_reports (giữ nguyên mọi dòng của 0016).`, then make exactly these three additions:
1. In `declare`, after `n_upload_tickets int := 0;` add `n_reading_reports int := 0;`
2. After the block `delete from english.upload_tickets ut … get diagnostics n_upload_tickets = row_count;` add:
   ```sql
     -- Studio 1A: báo cáo kỹ năng đọc tháng (không trỏ tới bảng nào khác của em ngoài learners).
     delete from english.reading_reports rr where rr.learner_id = p_learner_id;
     get diagnostics n_reading_reports = row_count;
   ```
3. In the receipt, after `'upload_tickets', n_upload_tickets,` add `'reading_reports', n_reading_reports,`

Copy `english.eng_purge_preview(p_learner uuid)` **verbatim** from `db/migrations/0017_readiness.sql` and, after the `'upload_tickets', (select …),` line, add:
```sql
      'reading_reports', (select pg_catalog.count(*) from english.reading_reports x where x.learner_id = p_learner),
```
Then:
```sql
revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;
```

In `lib/copy/vi.ts`, `purgePage.countLabels`, after `upload_tickets: "Phiếu tải file",` add `reading_reports: "Báo cáo kỹ năng đọc tháng",`.

Run: `npx vitest run tests/unit/migration0018.test.ts tests/unit/purge.test.ts` → PASS (if `purge.test.ts` asserts the label list equals the receipt keys, it now passes with the new label).

- [ ] **Step 4: Add DB tests** — append inside the top `describe` of `tests/db/readingSkills.test.ts`:

```ts
  type Rec = { id: string; replayed: boolean };
  const TODAY = todayVn();
  const thisMonth = `${TODAY.slice(0, 7)}-01`;
  const lastMonth = (() => { const d = new Date(`${thisMonth}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const row = (tag_key: string, questions: number, correct_pct: number) => ({ tag_key, questions, correct_pct });
  const record = (by: string, o: { learner?: string; month?: string; rows?: unknown; source?: string | null; note?: string | null; supersedes?: string | null; clientId?: string } = {}) =>
    svc<Rec>("select english.eng_record_reading_report($1, $2::date, $3, $4::jsonb, $5, $6, $7, $8) as r", [
      o.learner ?? NG(), o.month ?? thisMonth, o.source === undefined ? null : o.source,
      JSON.stringify(o.rows ?? [row("doc-cause-effect", 5, 40), row("doc-sequence", 1, 0), row("doc-main-idea", 8, 75)]),
      o.note ?? null, o.supersedes ?? null, by, o.clientId ?? randomUUID(),
    ]);
  const skills = () => svc<{
    min_questions: number; weak_pct: number; latest_month: string | null; previous_month: string | null;
    skills: { tag_key: string; questions: number | null; correct_pct: number | null; prev_correct_pct: number | null; status: string; wrong_6w: number }[];
  }>("select english.eng_reading_skills($1) as r", [NG()]);

  describe("2. recording a monthly report", () => {
    it("a tutor or a parent records one; replaying the same client id returns it; another payload under the same id is refused", async () => {
      const id = "reading-0001-aaaa";
      const a = await record(M().tutorNguyen, { month: lastMonth, clientId: id, rows: [row("doc-cause-effect", 4, 75)] });
      expect(a.replayed).toBe(false);
      expect(await record(M().tutorNguyen, { month: lastMonth, clientId: id, rows: [row("doc-cause-effect", 4, 75)] })).toEqual({ id: a.id, replayed: true });
      await fail(record(M().tutorNguyen, { month: lastMonth, clientId: id, rows: [row("doc-cause-effect", 4, 50)] }), "23505");
      const b = await record(M().parent, { month: thisMonth });
      expect(b.replayed).toBe(false);
    });

    it("one current report per month and source; a correction replaces it once; the source name keeps months apart", async () => {
      await fail(record(M().tutorNguyen, { month: thisMonth }), "23505", /\(duplicate_month\)/);
      const cur = (await q1<{ id: string }>("select id from english.reading_reports r where learner_id = $1 and month = $2 and not exists (select 1 from english.reading_reports r2 where r2.supersedes_id = r.id)", [NG(), thisMonth]))[0]!.id;
      const fixed = await record(M().tutorNguyen, { month: thisMonth, supersedes: cur, rows: [row("doc-cause-effect", 5, 40), row("doc-sequence", 1, 0), row("doc-main-idea", 8, 75), row("doc-summarize", 6, 50)] });
      await fail(record(M().tutorNguyen, { month: thisMonth, supersedes: cur }), "23514");
      await fail(record(M().tutorNguyen, { month: lastMonth, supersedes: fixed.id }), "23514");
      expect((await record(M().tutorNguyen, { month: thisMonth, source: "Lớp học" })).replayed).toBe(false);
    });

    it("refuses a bad month, a future month, an unknown or other-track skill, duplicates, bad numbers and extra keys", async () => {
      const next = (() => { const d = new Date(`${thisMonth}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); })();
      await fail(record(M().tutorNguyen, { month: `${TODAY.slice(0, 7)}-15` }), "23514", /\(bad_month\)/);
      await fail(record(M().tutorNguyen, { month: next }), "23514", /\(bad_month\)/);
      await fail(record(M().tutorNguyen, { month: lastMonth, source: "x1", rows: [row("doc-details", 4, 50)] }), "23514"); // Track A only
      await fail(record(M().tutorNguyen, { month: lastMonth, source: "x2", rows: [row("dang-tu", 4, 50)] }), "23514"); // not a reading skill
      await fail(record(M().tutorNguyen, { month: lastMonth, source: "x3", rows: [row("doc-sequence", 4, 50), row("doc-sequence", 2, 0)] }), "22023");
      for (const bad of [[row("doc-sequence", 0, 50)], [row("doc-sequence", 4, 101)], [{ tag_key: "doc-sequence", questions: 4.5, correct_pct: 50 }],
        [{ tag_key: "doc-sequence", questions: 4, correct_pct: 50, extra: 1 }], [], "x"]) {
        await fail(record(M().tutorNguyen, { month: lastMonth, source: "x4", rows: bad }), "22023");
      }
      await fail(record(M().tutorNguyen, { month: lastMonth, source: "x5", note: "n".repeat(301) }), "22023", /\(note_too_long\)/);
    });

    it("only staff of this learner: a student, the other child's tutor and strangers are refused", async () => {
      await fail(record(M().studentNguyen, { month: lastMonth, source: "s1" }), "42501");
      await fail(record(M().tutorAn, { month: lastMonth, source: "s2" }), "42501");
      await fail(record(randomUUID(), { month: lastMonth, source: "s3" }), "42501");
      await fail(record(M().tutorNguyen, { learner: randomUUID(), month: lastMonth }), "P0002");
    });

    it("is append-only, writes an audit row without content, and both functions are closed to everyone but service_role", async () => {
      const upd = await db.client.query("update english.reading_reports set note = 'x'").then(() => null, (e: unknown) => e);
      expect(upd, "append-only: an update outside a purge must fail").not.toBeNull();
      const log = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'reading_report.recorded' order by id desc limit 1");
      expect(Object.keys(log[0]!.payload).sort()).toEqual(["month", "report_id", "skills", "source", "supersedes"]);
      const acl = await q1<{ proname: string; anon: boolean; auth: boolean; svc: boolean }>(`
        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
               has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'english' and p.proname in ('eng_record_reading_report', 'eng_reading_skills')`);
      expect(acl).toHaveLength(2);
      for (const a of acl) expect([a.anon, a.auth, a.svc]).toEqual([false, false, true]);
    });
  });

  describe("3. the 'Kỹ năng đọc' table", () => {
    it("lists every reading skill of the track with the latest report, last month's %, thresholds from settings", async () => {
      const v = await skills();
      expect(v.min_questions).toBe(4);
      expect(v.weak_pct).toBe(60);
      expect(v.latest_month).toBe(thisMonth);
      expect(v.previous_month).toBe(lastMonth);
      expect(v.skills).toHaveLength(14);
      const by = new Map(v.skills.map((x) => [x.tag_key, x]));
      expect(by.get("doc-cause-effect")).toMatchObject({ questions: 5, correct_pct: 40, prev_correct_pct: 75, status: "weak" });
      expect(by.get("doc-sequence")).toMatchObject({ questions: 1, status: "thin" }); // 1 question: not enough to judge
      expect(by.get("doc-main-idea")).toMatchObject({ questions: 8, correct_pct: 75, status: "ok" });
      expect(by.get("doc-prediction")).toMatchObject({ questions: null, status: "none" });
    });

    it("counts wrong items tagged with a reading skill in the last 6 weeks (first attempts only)", async () => {
      await svc("select english.eng_record_result($1, 'quick', null, 'Reading test', 10, 8, '{3,5}', $2::jsonb, 'home', 'first', false, $3::date, null, null, $4, $5, 'test') as r",
        [NG(), JSON.stringify([{ n: 3, tag_key: "doc-cause-effect" }, { n: 5, tag_key: "doc-cause-effect" }]), addDays(TODAY, -3), M().tutorNguyen, randomUUID()]);
      const by = new Map((await skills()).skills.map((x) => [x.tag_key, x]));
      expect(by.get("doc-cause-effect")?.wrong_6w).toBe(2);
    });

    it("a learner with no report gets every skill as 'none'; Track A shows its 6", async () => {
      const v = await svc<{ latest_month: string | null; skills: { status: string }[] }>("select english.eng_reading_skills($1) as r", [AN()]);
      expect(v.latest_month).toBeNull();
      expect(v.skills).toHaveLength(6);
      expect(v.skills.every((x) => x.status === "none")).toBe(true);
    });
  });

  describe("4. purge", () => {
    it("the preview counts reading reports and the purge deletes them", async () => {
      const prev = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [NG()]);
      expect(prev.counts.reading_reports).toBeGreaterThanOrEqual(3);
      const fnSrc = (await q1<{ src: string }>("select pg_get_functiondef('english.eng_purge_learner(uuid, uuid)'::regprocedure) as src"))[0]?.src ?? "";
      expect(fnSrc).toContain("delete from english.reading_reports");
    });
  });
```

(The `eng_record_result` quick call uses the 17-argument signature of 0017 — `p_source` last; check `db/migrations/0017_readiness.sql:204` if it was renamed.)

- [ ] **Step 5: Run** — `npm run test:db -- tests/db/readingSkills.test.ts` → PASS; also `npm run test:db -- tests/db/readiness.test.ts` (purge preview key tests) → PASS. If `readiness.test.ts` compares preview keys to purge receipt keys, both now include `reading_reports`.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0018_reading_skills.sql lib/copy/vi.ts tests/unit/migration0018.test.ts tests/db/readingSkills.test.ts
git commit -m "feat(studio-1a): reading_reports (append-only) with record/read functions; purge and preview include them"
```

---

### Task 4: Server module + POST route

**Files:**
- Create: `lib/reading/types.ts`, `lib/reading/schemas.ts`, `lib/reading/shape.ts`, `lib/reading/handlers.ts`, `lib/reading/supabaseStore.ts`, `lib/reading/route.ts`, `lib/reading/load.ts`, `app/api/learners/[id]/reading-reports/route.ts`
- Test: `tests/unit/reading.test.ts`

**Interfaces:**
- Consumes: SQL functions of Task 3.
- Produces:
  - `READING_MAX_ROWS = 20`, `READING_NOTE_MAX = 300`
  - `type ReadingStatus = "none" | "thin" | "weak" | "ok"`
  - `type ReadingSkill = { tagKey: string; label: string; questions: number | null; correctPct: number | null; prevQuestions: number | null; prevCorrectPct: number | null; status: ReadingStatus; wrong6w: number }`
  - `type ReadingSkillsView = { minQuestions: number; weakPct: number; latestMonth: string | null; latestSource: string | null; previousMonth: string | null; skills: ReadingSkill[] }`
  - `type ReadingReportEdit = { id: string; month: string; source: string; note: string | null; rows: { tagKey: string; questions: number; correctPct: number }[] }`
  - `readingReportBodySchema` (zod strict): `{ client_id, month: "YYYY-MM-01", source?: string ≤40, rows: [{tag_key, questions 1..500, correct_pct 0..100}] 1..20, note?: string ≤300, supersedes_id?: uuid }`
  - `interface ReadingStore { recordReport(a: { learnerId; month; source: string | null; rows: {tag_key; questions; correct_pct}[]; note: string | null; supersedes: string | null; byMemberId; clientId }): Promise<unknown> }`
  - `handleRecordReadingReport(deps: ReadingDeps, learnerId: string, body: unknown): Promise<HandlerResult>` → 201/200 `{id, replayed}`; 409 `duplicate_month`; 400 `bad_month`/`invalid_body`; 403/404 per requireAccess.
  - `parseReadingSkills(raw: unknown): ReadingSkillsView`
  - `loadReadingSkills(learnerId: string): Promise<ReadingSkillsView>`; `loadReadingReport(learnerId: string, month: string): Promise<ReadingReportEdit | null>`; `loadReadingTags(trackId: string): Promise<{ key: string; label: string }[]>`

- [ ] **Step 1: Write the failing tests** — `tests/unit/reading.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { ReviewDbError } from "@/lib/review/handlers";
import { handleRecordReadingReport, type ReadingDeps, type ReadingStore } from "@/lib/reading/handlers";
import { readingReportBodySchema } from "@/lib/reading/schemas";
import { parseReadingSkills } from "@/lib/reading/shape";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-20T08:00:00Z");
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
const store = (over: Partial<ReadingStore> = {}) => ({ recordReport: vi.fn(async () => ({ id: "rr1", replayed: false })), ...over }) satisfies ReadingStore;
const deps = (user: string | null, s: ReadingStore): ReadingDeps => ({ user: user ? { id: `u-${user}` } : null, store: s, access: { store: access, allowRealLearners: false, now: NOW } });
const good = { client_id: "reading-0001", month: "2026-10-01", rows: [{ tag_key: "doc-cause-effect", questions: 5, correct_pct: 40 }] };

describe("reading report body", () => {
  it("accepts a good body and refuses mid-month dates, empty or too many rows, bad numbers and unknown fields", () => {
    expect(readingReportBodySchema.safeParse(good).success).toBe(true);
    expect(readingReportBodySchema.safeParse({ ...good, month: "2026-10-15" }).success).toBe(false);
    expect(readingReportBodySchema.safeParse({ ...good, rows: [] }).success).toBe(false);
    expect(readingReportBodySchema.safeParse({ ...good, rows: Array.from({ length: 21 }, (_, i) => ({ tag_key: `doc-x${i}`, questions: 1, correct_pct: 1 })) }).success).toBe(false);
    expect(readingReportBodySchema.safeParse({ ...good, rows: [{ tag_key: "doc-a", questions: 0, correct_pct: 1 }] }).success).toBe(false);
    expect(readingReportBodySchema.safeParse({ ...good, rows: [{ tag_key: "doc-a", questions: 2, correct_pct: 100.5 }] }).success).toBe(false);
    expect(readingReportBodySchema.safeParse({ ...good, lexile: 910 }).success).toBe(false);
  });
});

describe("handleRecordReadingReport", () => {
  it("tutor of the child and parent may record; the store gets the member id and the cleaned body", async () => {
    const s = store();
    expect(await handleRecordReadingReport(deps("tutorNguyen", s), NGUYEN, good)).toEqual({ status: 201, body: { id: "rr1", replayed: false } });
    expect(s.recordReport).toHaveBeenCalledWith({ learnerId: NGUYEN, month: "2026-10-01", source: null, rows: good.rows, note: null, supersedes: null, byMemberId: "m-tutorNguyen", clientId: "reading-0001" });
    expect((await handleRecordReadingReport(deps("parent", store()), NGUYEN, good)).status).toBe(201);
  });

  it("access comes first: no session 401, another child's tutor 404, a student 404 - before the body is read", async () => {
    const s = store();
    expect((await handleRecordReadingReport(deps(null, s), NGUYEN, "garbage")).status).toBe(401);
    expect((await handleRecordReadingReport(deps("tutorAn", s), NGUYEN, good)).status).toBe(404);
    expect((await handleRecordReadingReport(deps("studentNguyen", s), NGUYEN, good)).status).toBe(404);
    expect(s.recordReport).not.toHaveBeenCalled();
  });

  it("maps database answers: duplicate month 409, bad month 400, replay 200", async () => {
    const dup = store({ recordReport: vi.fn(async () => { throw new ReviewDbError("23505", "x: this month already has a report from this source (duplicate_month)"); }) });
    expect(await handleRecordReadingReport(deps("tutorNguyen", dup), NGUYEN, good)).toMatchObject({ status: 409, body: { error: "duplicate_month" } });
    const bad = store({ recordReport: vi.fn(async () => { throw new ReviewDbError("23514", "x: (bad_month)"); }) });
    expect(await handleRecordReadingReport(deps("tutorNguyen", bad), NGUYEN, good)).toMatchObject({ status: 400, body: { error: "bad_month" } });
    const replay = store({ recordReport: vi.fn(async () => ({ id: "rr1", replayed: true })) });
    expect((await handleRecordReadingReport(deps("tutorNguyen", replay), NGUYEN, good)).status).toBe(200);
  });
});

describe("parseReadingSkills", () => {
  it("maps snake_case to the view and keeps nulls", () => {
    const v = parseReadingSkills({
      min_questions: 4, weak_pct: 60, latest_month: "2026-10-01", latest_source: "TOMO", previous_month: null,
      skills: [{ tag_key: "doc-sequence", label_vi: "Chronology/Sequence — Trình tự", questions: 1, correct_pct: 0, prev_questions: null, prev_correct_pct: null, status: "thin", wrong_6w: 0 }],
    });
    expect(v).toEqual({
      minQuestions: 4, weakPct: 60, latestMonth: "2026-10-01", latestSource: "TOMO", previousMonth: null,
      skills: [{ tagKey: "doc-sequence", label: "Chronology/Sequence — Trình tự", questions: 1, correctPct: 0, prevQuestions: null, prevCorrectPct: null, status: "thin", wrong6w: 0 }],
    });
  });
});
```

Run: `npx vitest run tests/unit/reading.test.ts` → FAIL (modules missing).

- [ ] **Step 2: Implement the module**

`lib/reading/types.ts`:
```ts
/** Studio 1A - monthly reading-skill reports (TOMO-style). Staff only; a signal, never evidence. */
export const READING_MAX_ROWS = 20;
export const READING_NOTE_MAX = 300;
export const READING_SOURCE_MAX = 40;

export type ReadingStatus = "none" | "thin" | "weak" | "ok";

export type ReadingSkill = {
  tagKey: string;
  label: string;
  questions: number | null;
  correctPct: number | null;
  prevQuestions: number | null;
  prevCorrectPct: number | null;
  status: ReadingStatus;
  wrong6w: number;
};

export type ReadingSkillsView = {
  minQuestions: number;
  weakPct: number;
  latestMonth: string | null;
  latestSource: string | null;
  previousMonth: string | null;
  skills: ReadingSkill[];
};

export type ReadingReportEdit = {
  id: string;
  month: string;
  source: string;
  note: string | null;
  rows: { tagKey: string; questions: number; correctPct: number }[];
};
```

`lib/reading/schemas.ts`:
```ts
import { z } from "zod";
import { READING_MAX_ROWS, READING_NOTE_MAX, READING_SOURCE_MAX } from "./types";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const firstOfMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);

export const readingReportBodySchema = z.strictObject({
  client_id: z.string().min(8).max(100),
  month: firstOfMonth,
  source: z.string().trim().min(1).max(READING_SOURCE_MAX).optional(),
  rows: z
    .array(z.strictObject({
      tag_key: z.string().trim().min(1).max(61),
      questions: z.number().int().min(1).max(500),
      correct_pct: z.number().int().min(0).max(100),
    }))
    .min(1)
    .max(READING_MAX_ROWS),
  note: z.string().trim().max(READING_NOTE_MAX).optional(),
  supersedes_id: uuid.optional(),
});
export type ReadingReportBody = z.infer<typeof readingReportBodySchema>;
```

`lib/reading/shape.ts`:
```ts
import { z } from "zod";
import type { ReadingReportEdit, ReadingSkillsView } from "./types";

const intOrNull = z.number().int().nullable();
const skillsSchema = z.object({
  min_questions: z.number().int(),
  weak_pct: z.number().int(),
  latest_month: z.string().nullable(),
  latest_source: z.string().nullable(),
  previous_month: z.string().nullable(),
  skills: z.array(z.object({
    tag_key: z.string(),
    label_vi: z.string(),
    questions: intOrNull,
    correct_pct: intOrNull,
    prev_questions: intOrNull,
    prev_correct_pct: intOrNull,
    status: z.enum(["none", "thin", "weak", "ok"]),
    wrong_6w: z.number().int(),
  })),
});

export function parseReadingSkills(raw: unknown): ReadingSkillsView {
  const v = skillsSchema.parse(raw);
  return {
    minQuestions: v.min_questions,
    weakPct: v.weak_pct,
    latestMonth: v.latest_month,
    latestSource: v.latest_source,
    previousMonth: v.previous_month,
    skills: v.skills.map((s) => ({
      tagKey: s.tag_key, label: s.label_vi, questions: s.questions, correctPct: s.correct_pct,
      prevQuestions: s.prev_questions, prevCorrectPct: s.prev_correct_pct, status: s.status, wrong6w: s.wrong_6w,
    })),
  };
}

const reportRow = z.object({
  id: z.string(),
  month: z.string(),
  source: z.string(),
  note: z.string().nullable(),
  rows: z.array(z.object({ tag_key: z.string(), questions: z.number().int(), correct_pct: z.number().int() })),
});
export function parseReadingReport(raw: unknown): ReadingReportEdit | null {
  if (raw === null || raw === undefined) return null;
  const r = reportRow.parse(raw);
  return { id: r.id, month: r.month, source: r.source, note: r.note, rows: r.rows.map((x) => ({ tagKey: x.tag_key, questions: x.questions, correctPct: x.correct_pct })) };
}
```

`lib/reading/handlers.ts`:
```ts
/**
 * Handler of POST /api/learners/:id/reading-reports (Studio 1A). Same order as lib/tutorwork/handlers.ts:
 * requireAccess first (401 / 404 outside scope / 403), then the body (400), then the service-role store; the SQL re-checks the actor.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessUser } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { readingReportBodySchema } from "./schemas";

export interface ReadingStore {
  recordReport(a: {
    learnerId: string;
    month: string;
    source: string | null;
    rows: { tag_key: string; questions: number; correct_pct: number }[];
    note: string | null;
    supersedes: string | null;
    byMemberId: string;
    clientId: string;
  }): Promise<unknown>;
}

export type ReadingDeps = { user: AccessUser; store: ReadingStore; access?: Partial<AccessDeps> };

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

export async function handleRecordReadingReport(deps: ReadingDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  let grant;
  try {
    grant = await requireAccess(deps.user, learnerId, "tutorwork:write", deps.access);
  } catch (err) {
    if (err instanceof AccessError) return fail(err.status, err.message);
    throw err;
  }
  const parsed = readingReportBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  try {
    const r = (await deps.store.recordReport({
      learnerId: grant.learner.id,
      month: b.month,
      source: b.source ?? null,
      rows: b.rows,
      note: b.note && b.note.length > 0 ? b.note : null,
      supersedes: b.supersedes_id ?? null,
      byMemberId: grant.member.id,
      clientId: b.client_id,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    if (err instanceof ReviewDbError && err.code === "23505" && /\(duplicate_month\)/.test(err.detail)) return fail(409, "duplicate_month");
    if (err instanceof ReviewDbError && err.code === "23514" && /\(bad_month\)/.test(err.detail)) return fail(400, "bad_month");
    return fromDbError(err);
  }
}
```

`lib/reading/supabaseStore.ts`:
```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewDbError } from "@/lib/review/handlers";
import type { ReadingStore } from "./handlers";

/** Calls the service-role function of migration 0018, only after the handler ran requireAccess. */
export function createSupabaseReadingStore(): ReadingStore {
  return {
    async recordReport(a) {
      const { data, error } = await createAdminClient().rpc("eng_record_reading_report", {
        p_learner: a.learnerId,
        p_month: a.month,
        p_source: a.source,
        p_rows: a.rows,
        p_note: a.note,
        p_supersedes: a.supersedes,
        p_by: a.byMemberId,
        p_client_id: a.clientId,
      });
      if (error) throw new ReviewDbError(error.code ?? "unknown", `eng_record_reading_report: ${error.message ?? error.code ?? "error"}`);
      return data;
    },
  };
}
```

`lib/reading/route.ts`:
```ts
import "server-only";
import { NextResponse } from "next/server";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createUserClient } from "@/lib/supabase/server";
import type { ReadingDeps } from "./handlers";
import { createSupabaseReadingStore } from "./supabaseStore";

/** Session → handler → JSON (no-store); 500 logged. Same glue as lib/tutorwork/route.ts. */
export async function runReadingRoute(routeName: string, run: (deps: ReadingDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({ user, store: createSupabaseReadingStore() });
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
```

`app/api/learners/[id]/reading-reports/route.ts`:
```ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleRecordReadingReport } from "@/lib/reading/handlers";
import { runReadingRoute } from "@/lib/reading/route";

/** POST /api/learners/:id/reading-reports - record a monthly reading-skill report (tutor or parent of the child). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runReadingRoute("POST /api/learners/[id]/reading-reports", (deps) => handleRecordReadingReport(deps, id, body));
}
```

`lib/reading/load.ts`:
```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { parseReadingReport, parseReadingSkills } from "./shape";
import type { ReadingReportEdit, ReadingSkillsView } from "./types";

/** Call only after requireLearnerPage / requireAccess ("tutorwork:read"). */
function fail(what: string, err: { code?: string; message?: string }): never {
  throw new Error(`${what} failed: ${err.code ?? err.message ?? "error"}`);
}

export async function loadReadingSkills(learnerId: string): Promise<ReadingSkillsView> {
  const { data, error } = await createAdminClient().rpc("eng_reading_skills", { p_learner: learnerId });
  if (error) fail("eng_reading_skills", error);
  return parseReadingSkills(data);
}

/** The reading skills of a track, in report order (user client: RLS on error_tags). */
export async function loadReadingTags(trackId: string): Promise<{ key: string; label: string }[]> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("error_tags")
    .select("key, label_vi")
    .eq("track_id", trackId)
    .eq("group_vi", "Kỹ năng đọc")
    .is("retired_at", null)
    .is("family_id", null)
    .order("created_at", { ascending: true });
  if (error) fail("error_tags lookup", error);
  return ((data ?? []) as { key: string; label_vi: string }[]).map((t) => ({ key: t.key, label: t.label_vi }));
}

/** The current TOMO report of one month (user client: RLS keeps it staff-only), or null. */
export async function loadReadingReport(learnerId: string, month: string): Promise<ReadingReportEdit | null> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("reading_reports")
    .select("id, month, source, note, rows, supersedes_id")
    .eq("learner_id", learnerId)
    .eq("month", month)
    .eq("source", "TOMO")
    .order("recorded_at", { ascending: true });
  if (error) fail("reading_reports lookup", error);
  const rows = (data ?? []) as { id: string; supersedes_id: string | null }[];
  const replaced = new Set(rows.map((r) => r.supersedes_id).filter((x): x is string => x !== null));
  return parseReadingReport(rows.find((r) => !replaced.has(r.id)) ?? null);
}
```

- [ ] **Step 3: Run** — `npx vitest run tests/unit/reading.test.ts` → PASS; `npm run typecheck` → clean.

- [ ] **Step 4: Commit**

```bash
git add lib/reading app/api/learners/\[id\]/reading-reports tests/unit/reading.test.ts
git commit -m "feat(studio-1a): POST reading-reports route, handler, store and loaders"
```

---

### Task 5: Copy, entry page, form, table, links

**Files:**
- Modify: `lib/copy/vi.ts` (new `readingPage`; `tutorWorkErrors.duplicateMonth`, `tutorWorkErrors.badMonth`)
- Create: `components/tutor/ReadingReportForm.tsx`, `components/tutor/ReadingSkillsTable.tsx`, `app/learners/[id]/reading/new/page.tsx`
- Modify: `app/learners/[id]/weak/page.tsx`, `components/LearnerCard.tsx`
- Test: `tests/unit/readingUi.test.ts`

**Interfaces:**
- Consumes: `ReadingSkillsView`, `ReadingReportEdit`, `loadReadingSkills`, `loadReadingTags`, `loadReadingReport`, `postJson`/`failText` from `lib/tutorwork/client.ts`.
- Produces: `<ReadingReportForm learnerId tags month existing />` (client) and `<ReadingSkillsTable view learnerId />` (server-safe), test ids below.

- [ ] **Step 1: Add the copy** — in `lib/copy/vi.ts` after `weakPage`:

```ts
export const readingPage = {
  link: "Nhập kỹ năng đọc tháng",
  title: (alias: string) => `Kỹ năng đọc tháng · ${alias}`,
  back: "Về Điểm cần chú ý",
  intro: "Nhập số câu và % đúng của từng kỹ năng theo báo cáo đọc tháng (TOMO). Dòng để trống = tháng này không có câu.",
  monthLabel: "Tháng",
  colSkill: "Kỹ năng",
  colQuestions: "Số câu",
  colPct: "% đúng",
  noteLabel: "Ghi chú (không bắt buộc)",
  save: "Lưu báo cáo",
  saveCorrection: "Lưu bản sửa",
  saved: "Đã lưu.",
  editing: (month: string) => `Tháng ${month} đã có báo cáo. Sửa các ô rồi bấm “Lưu bản sửa” (bản cũ vẫn được giữ trong lịch sử).`,
  rowInvalid: "Số câu là số nguyên 1–500; % đúng là số nguyên 0–100; nhập cả hai hoặc để trống cả hai.",
  needOneRow: "Nhập ít nhất một kỹ năng.",
  sectionTitle: "Kỹ năng đọc",
  sectionIntro: (month: string | null, source: string | null) =>
    month ? `Theo báo cáo tháng ${month}${source ? ` (${source})` : ""}, so với tháng trước. Câu sai 6 tuần = từ bài kiểm tra và bài luyện.` : "Chưa có báo cáo kỹ năng đọc nào.",
  colLatest: "Tháng này",
  colPrev: "Tháng trước",
  colWrong6w: "Câu sai 6 tuần",
  status: { none: "Chưa có câu", thin: "Chưa đủ dữ liệu", weak: "Cần chú ý", ok: "Ổn" } as Record<string, string>,
  pctLine: (pct: number, q: number) => `${pct}% · ${q} câu`,
  rule: (min: number, pct: number) => `Dưới ${min} câu: chưa đủ dữ liệu để kết luận. Từ ${min} câu trở lên và dưới ${pct}%: cần chú ý. Đây là tín hiệu theo dõi, không đổi bậc kỹ năng.`,
  enter: "Nhập báo cáo tháng",
};
```

And in `tutorWorkErrors` add `duplicateMonth: "Tháng này đã có báo cáo. Tải lại trang để sửa bản đã lưu.",` and `badMonth: "Chọn một tháng trong 24 tháng gần đây, không phải tháng sau.",`; in `lib/tutorwork/client.ts` `failText`, before the `status === 403` line add:
```ts
  if (r.error === "duplicate_month") return tutorWorkErrors.duplicateMonth;
  if (r.error === "bad_month") return tutorWorkErrors.badMonth;
```

- [ ] **Step 2: Write the failing UI test** — `tests/unit/readingUi.test.ts`

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReadingReportForm } from "@/components/tutor/ReadingReportForm";
import { ReadingSkillsTable } from "@/components/tutor/ReadingSkillsTable";
import { readingPage } from "@/lib/copy/vi";
import type { ReadingSkillsView } from "@/lib/reading/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const LEARNER = "b0000000-0000-4000-8000-000000000001";
const tags = [{ key: "doc-cause-effect", label: "Cause and Effect — Nguyên nhân – kết quả" }, { key: "doc-sequence", label: "Chronology/Sequence — Trình tự thời gian / sự kiện" }];
const view: ReadingSkillsView = {
  minQuestions: 4, weakPct: 60, latestMonth: "2026-10-01", latestSource: "TOMO", previousMonth: "2026-09-01",
  skills: [
    { tagKey: "doc-cause-effect", label: tags[0]!.label, questions: 5, correctPct: 40, prevQuestions: 4, prevCorrectPct: 75, status: "weak", wrong6w: 2 },
    { tagKey: "doc-sequence", label: tags[1]!.label, questions: 1, correctPct: 0, prevQuestions: null, prevCorrectPct: null, status: "thin", wrong6w: 0 },
  ],
};

describe("reading UI", () => {
  it("the form has one row per skill with two number inputs, and says when the month is being corrected", () => {
    const html = renderToStaticMarkup(createElement(ReadingReportForm, { learnerId: LEARNER, tags, month: "2026-10-01", existing: null }));
    expect(html).toContain('data-testid="reading-q-doc-cause-effect"');
    expect(html).toContain('data-testid="reading-pct-doc-sequence"');
    expect(html).toContain(readingPage.save);
    const edit = renderToStaticMarkup(createElement(ReadingReportForm, {
      learnerId: LEARNER, tags, month: "2026-10-01",
      existing: { id: "11111111-1111-4111-8111-111111111111", month: "2026-10-01", source: "TOMO", note: null, rows: [{ tagKey: "doc-sequence", questions: 1, correctPct: 0 }] },
    }));
    expect(edit).toContain(readingPage.saveCorrection);
    expect(edit).toContain('value="1"');
  });

  it("the table shows status words (thin sample is not red), this month vs last month, and the rule", () => {
    const html = renderToStaticMarkup(createElement(ReadingSkillsTable, { view, learnerId: LEARNER }));
    expect(html).toContain(readingPage.status.weak);
    expect(html).toContain(readingPage.status.thin);
    expect(html).toContain(readingPage.pctLine(40, 5));
    expect(html).toContain(readingPage.pctLine(75, 4));
    expect(html).toContain(readingPage.rule(4, 60));
    expect(html).toContain('data-testid="reading-status-doc-sequence"');
    expect(html).not.toMatch(/data-testid="reading-status-doc-sequence"[^>]*bg-\[#7a4a00\]/);
  });
});
```

Run: `npx vitest run tests/unit/readingUi.test.ts` → FAIL (components missing).

- [ ] **Step 3: Implement the table** — `components/tutor/ReadingSkillsTable.tsx`

```tsx
import Link from "next/link";
import { formatDateVi } from "@/lib/inquiries/format";
import { readingPage } from "@/lib/copy/vi";
import type { ReadingSkillsView, ReadingStatus } from "@/lib/reading/types";

const badge: Record<ReadingStatus, string> = {
  weak: "bg-[#7a4a00] text-white",
  thin: "bg-paper text-muted border border-line",
  ok: "bg-[#e5efe9] text-accent",
  none: "bg-paper text-muted border border-line",
};
const monthLabel = (iso: string | null) => (iso ? formatDateVi(iso).replace(/^\d{2}\//, "") : null);

/** "Kỹ năng đọc" on the weak-points page: latest monthly report vs the previous one, plus wrong items of the last 6 weeks. Staff only. */
export function ReadingSkillsTable({ view, learnerId }: { view: ReadingSkillsView; learnerId: string }) {
  return (
    <section className="mt-8" aria-label={readingPage.sectionTitle} data-testid="reading-section">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{readingPage.sectionTitle}</h2>
        <Link href={`/learners/${learnerId}/reading/new`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline" data-testid="reading-enter">
          {readingPage.enter}
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">{readingPage.sectionIntro(monthLabel(view.latestMonth), view.latestSource)}</p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-2 font-medium">{readingPage.colSkill}</th>
              <th className="px-4 py-2 font-medium">{readingPage.colLatest}</th>
              <th className="px-4 py-2 font-medium">{readingPage.colPrev}</th>
              <th className="px-4 py-2 font-medium">{readingPage.colWrong6w}</th>
            </tr>
          </thead>
          <tbody>
            {view.skills.map((s) => (
              <tr key={s.tagKey} className="border-b border-line last:border-0">
                <td className="px-4 py-2">{s.label}</td>
                <td className="px-4 py-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge[s.status]}`} data-testid={`reading-status-${s.tagKey}`}>
                      {readingPage.status[s.status]}
                    </span>
                    {s.questions !== null && s.correctPct !== null ? <span>{readingPage.pctLine(s.correctPct, s.questions)}</span> : null}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted">{s.prevQuestions !== null && s.prevCorrectPct !== null ? readingPage.pctLine(s.prevCorrectPct, s.prevQuestions) : "—"}</td>
                <td className="px-4 py-2">{s.wrong6w > 0 ? s.wrong6w : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">{readingPage.rule(view.minQuestions, view.weakPct)}</p>
    </section>
  );
}
```

(`formatDateVi` returns `dd/mm/yyyy`; `monthLabel` drops the day so the table shows `mm/yyyy`.)

- [ ] **Step 4: Implement the form** — `components/tutor/ReadingReportForm.tsx`

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { readingPage } from "@/lib/copy/vi";
import type { ReadingReportEdit } from "@/lib/reading/types";
import { failText, postJson } from "@/lib/tutorwork/client";

type Cell = { q: string; pct: string };
const INT = /^\d{1,3}$/;

/** One row per reading skill of the child's track: "Số câu" + "% đúng". Empty row = no question that month. Staff only. */
export function ReadingReportForm({ learnerId, tags, month, existing }: {
  learnerId: string;
  tags: { key: string; label: string }[];
  month: string; // YYYY-MM-01
  existing: ReadingReportEdit | null;
}) {
  const router = useRouter();
  const initial = useMemo(() => {
    const m: Record<string, Cell> = {};
    for (const t of tags) {
      const r = existing?.rows.find((x) => x.tagKey === t.key);
      m[t.key] = r ? { q: String(r.questions), pct: String(r.correctPct) } : { q: "", pct: "" };
    }
    return m;
  }, [tags, existing]);
  const [cells, setCells] = useState(initial);
  const [note, setNote] = useState(existing?.note ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientId] = useState(() => crypto.randomUUID());

  function rows(): { tag_key: string; questions: number; correct_pct: number }[] | null {
    const out: { tag_key: string; questions: number; correct_pct: number }[] = [];
    for (const t of tags) {
      const c = cells[t.key]!;
      if (c.q === "" && c.pct === "") continue;
      if (!INT.test(c.q) || !INT.test(c.pct)) return null;
      const q = Number(c.q), pct = Number(c.pct);
      if (q < 1 || q > 500 || pct > 100) return null;
      out.push({ tag_key: t.key, questions: q, correct_pct: pct });
    }
    return out;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = rows();
    if (r === null) return setMsg({ ok: false, text: readingPage.rowInvalid });
    if (r.length === 0) return setMsg({ ok: false, text: readingPage.needOneRow });
    setBusy(true);
    const res = await postJson(`/api/learners/${learnerId}/reading-reports`, {
      client_id: clientId, month, rows: r, ...(note.trim() ? { note: note.trim() } : {}), ...(existing ? { supersedes_id: existing.id } : {}),
    });
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: failText(res) });
    setMsg({ ok: true, text: readingPage.saved });
    router.push(`/learners/${learnerId}/weak`);
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-4" data-testid="reading-form">
      {existing ? <p className="rounded-xl border border-line bg-paper px-4 py-3 text-sm">{readingPage.editing(month.slice(0, 7))}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-2 font-medium">{readingPage.colSkill}</th>
              <th className="px-4 py-2 font-medium">{readingPage.colQuestions}</th>
              <th className="px-4 py-2 font-medium">{readingPage.colPct}</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.key} className="border-b border-line last:border-0">
                <td className="px-4 py-2">{t.label}</td>
                {(["q", "pct"] as const).map((f) => (
                  <td key={f} className="px-4 py-2">
                    <input
                      inputMode="numeric"
                      aria-label={`${t.label} · ${f === "q" ? readingPage.colQuestions : readingPage.colPct}`}
                      data-testid={`reading-${f}-${t.key}`}
                      value={cells[t.key]![f]}
                      onChange={(e) => setCells((c) => ({ ...c, [t.key]: { ...c[t.key]!, [f]: e.target.value.trim() } }))}
                      className="min-h-11 w-20 rounded-lg border border-line px-3"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        {readingPage.noteLabel}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="rounded-lg border border-line px-3 py-2" data-testid="reading-note" />
      </label>
      {msg ? <p role="status" className={msg.ok ? "text-accent" : "text-[#8a3b12]"} data-testid="reading-msg">{msg.text}</p> : null}
      <button type="submit" disabled={busy} className="min-h-11 self-start rounded-lg bg-accent px-5 font-semibold text-white disabled:opacity-60" data-testid="reading-save">
        {existing ? readingPage.saveCorrection : readingPage.save}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: The entry page** — `app/learners/[id]/reading/new/page.tsx`

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ReadingReportForm } from "@/components/tutor/ReadingReportForm";
import { learnerWithTrack, readingPage } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { loadReadingReport, loadReadingTags } from "@/lib/reading/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** Enter (or correct) the monthly reading-skill report of one child. Tutor and parent only; ?month=YYYY-MM (default: this month). */
export default async function ReadingNewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const { id } = await params;
  const { month: m } = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:write");
  const thisMonth = todayVn().slice(0, 7);
  const ym = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= thisMonth ? m : thisMonth;
  const month = `${ym}-01`;
  const [tags, existing] = await Promise.all([loadReadingTags(learner.trackId), loadReadingReport(learner.id, month)]);

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-3xl px-4 py-10" data-testid="reading-page">
        <Link href={`/learners/${learner.id}/weak`} className="inline-flex min-h-11 items-center text-sm text-accent underline">{readingPage.back}</Link>
        <h1 className="mt-2 text-2xl font-bold">{readingPage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{readingPage.intro}</p>
        <form method="get" className="mt-4 flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {readingPage.monthLabel}
            <input type="month" name="month" defaultValue={ym} max={thisMonth} className="min-h-11 rounded-lg border border-line px-3" data-testid="reading-month" />
          </label>
          <button type="submit" className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm">OK</button>
        </form>
        <ReadingReportForm key={month} learnerId={learner.id} tags={tags} month={month} existing={existing} />
      </main>
    </>
  );
}
```

Replace the literal `OK` with a copy key: add `monthGo: "Chọn"` to `readingPage` and use `{readingPage.monthGo}`.

- [ ] **Step 6: Wire the weak page and the learner card**

In `app/learners/[id]/weak/page.tsx`: import `ReadingSkillsTable` and `loadReadingSkills`; change the `Promise.all` to also load `loadReadingSkills(learner.id)` as `reading`; after `<WeakTable view={view} />`'s wrapping `div`, render `<ReadingSkillsTable view={reading} learnerId={learner.id} />`.

In `components/LearnerCard.tsx`, in the links row after the `weakPage.link` link, add:
```tsx
        <Link href={`/learners/${learner.id}/reading/new`} className={linkClass}>
          {readingPage.link}
        </Link>
```
and import `readingPage` from `@/lib/copy/vi`. (Only the staff card renders this row; students never get this card.)

- [ ] **Step 7: Run** — `npx vitest run tests/unit/readingUi.test.ts tests/unit/tutorWorkUi.test.ts` → PASS; `npm run typecheck && npm run lint` → clean.

- [ ] **Step 8: Commit**

```bash
git add lib/copy/vi.ts lib/tutorwork/client.ts components/tutor/ReadingReportForm.tsx components/tutor/ReadingSkillsTable.tsx app/learners/\[id\]/reading app/learners/\[id\]/weak/page.tsx components/LearnerCard.tsx tests/unit/readingUi.test.ts
git commit -m "feat(studio-1a): monthly reading report entry page and the 'Kỹ năng đọc' table on Điểm cần chú ý"
```

---

### Task 6: End-to-end on the test family

**Files:**
- Create: `tests/e2e/reading.spec.ts`

**Interfaces:**
- Consumes: test ids of Task 5, `loginAs`, `LEARNER_IDS` from `tests/e2e/helpers.ts`.

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from "@playwright/test";
import { readingPage } from "@/lib/copy/vi";
import { LEARNER_IDS, loginAs } from "./helpers";

// Studio 1A: monthly reading-skill report → "Kỹ năng đọc" on Điểm cần chú ý. Staff only.
test.describe.serial("Studio 1A reading skills", () => {
  test("Nguyên's tutor enters this month's report; the weak page shows 'Cần chú ý' and 'Chưa đủ dữ liệu'", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${LEARNER_IDS.nguyen}/reading/new`);
    await expect(page.getByTestId("reading-q-doc-cause-effect")).toBeVisible();
    await expect(page.locator('[data-testid^="reading-q-"]')).toHaveCount(14);
    await page.getByTestId("reading-q-doc-cause-effect").fill("5");
    await page.getByTestId("reading-pct-doc-cause-effect").fill("40");
    await page.getByTestId("reading-q-doc-sequence").fill("1");
    await page.getByTestId("reading-pct-doc-sequence").fill("0");
    await page.getByTestId("reading-save").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${LEARNER_IDS.nguyen}/weak$`));
    await expect(page.getByTestId("reading-status-doc-cause-effect")).toHaveText(readingPage.status.weak!);
    await expect(page.getByTestId("reading-status-doc-sequence")).toHaveText(readingPage.status.thin!);
  });

  test("the same month again opens as a correction and saves a new version", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto(`/learners/${LEARNER_IDS.nguyen}/reading/new`);
    await expect(page.getByTestId("reading-q-doc-cause-effect")).toHaveValue("5");
    await page.getByTestId("reading-pct-doc-cause-effect").fill("60");
    await page.getByTestId("reading-save").click();
    await expect(page.getByTestId("reading-status-doc-cause-effect")).toHaveText(readingPage.status.ok!);
  });

  test("An's form has the 6 skills; the other child's tutor and the student get 404", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.goto(`/learners/${LEARNER_IDS.an}/reading/new`);
    await expect(page.locator('[data-testid^="reading-q-"]')).toHaveCount(6);
    expect((await page.goto(`/learners/${LEARNER_IDS.nguyen}/reading/new`))?.status()).toBe(404);
    const api = await page.request.post(`/api/learners/${LEARNER_IDS.nguyen}/reading-reports`, {
      data: { client_id: "e2e-reading-x1", month: "2026-10-01", rows: [{ tag_key: "doc-sequence", questions: 4, correct_pct: 50 }] },
    });
    expect(api.status()).toBe(404);
    await page.context().clearCookies();
    await loginAs(page, "studentNguyen");
    expect((await page.goto(`/learners/${LEARNER_IDS.nguyen}/reading/new`))?.status()).toBe(404);
  });
});
```

- [ ] **Step 2: List locally** — `npx playwright test tests/e2e/reading.spec.ts --list` → 3 tests listed (runs for real in CI).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/reading.spec.ts
git commit -m "test(studio-1a): e2e for the monthly reading report and the 'Kỹ năng đọc' table"
```

---

### Task 7: Docs, full checks, review, PR

**Files:**
- Modify: `docs/PROGRESS.md` (new section "Studio 1 · PR A — Kỹ năng đọc"), `CLAUDE.md` (Current status line + next seed number 0019), `docs/DESIGN.md` (§19: one paragraph on `reading_reports`, `eng_record_reading_report`, `eng_reading_skills`, thresholds), `docs/PRD_FAMILY_EDITION.md` (§8 row "Studio 1" note: PR A = kỹ năng đọc)

- [ ] **Step 1: Write the docs** — PROGRESS section in Vietnamese: what changed (table), SQL cần áp `0018_reading_skills.sql` (Actions → Apply database migrations, gõ APPLY — **sau khi gộp PR**; 0018 chỉ thêm, tương thích ngược), cách thử trên preview (3 bước như e2e), tiêu chí đạt, "để sau" (Lexile/CEFR; màn đổi ngưỡng; nhập báo cáo bằng ảnh).

- [ ] **Step 2: Full checks** — `npm run typecheck && npm run lint && npm test && npm run gen:config` → all green (DB tests need local Postgres; `gen:config` must not flag 0018, which is not a config seed).

- [ ] **Step 3: Commit docs**

```bash
git add docs/PROGRESS.md CLAUDE.md docs/DESIGN.md docs/PRD_FAMILY_EDITION.md
git commit -m "docs(studio-1a): PROGRESS section, status, DESIGN §19 note, PRD row"
```

- [ ] **Step 4: Push and CI** — `git push`, then `gh workflow run ci.yml --ref feature/studio-1`; wait for green (E2E included).

- [ ] **Step 5: Opus review** — run the `reviewer` agent on `git diff main...HEAD`; fix findings in new commits; re-run CI.

- [ ] **Step 6: Open the PR** to `main` (REST: `gh api repos/haleytruong89-moon/Enghlish-app/pulls --input pr.json`) with a Vietnamese body: làm gì · cách thử trên preview · **SQL cần phụ huynh áp: 0018 (sau khi gộp)** · tiêu chí đạt/chưa; ends with the session's PR footer.
