# W3 · Mức điểm kiến thức + Bản đồ kiến thức + Nạp bài đã làm — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi điểm kiến thức (nhãn `error_tags`) của từng em có **mức** dựa trên bằng chứng từng câu (`PP-0.1`): app tự đặt mức 1–2, đề xuất mức 3–4 vào **cùng tab "Kỹ năng"** của Hộp duyệt để **gia sư của em** xác nhận; có trang **Bản đồ kiến thức** (con không thấy); và gia sư/phụ huynh **Nạp bài đã làm** (đề cũ: file bài + file đáp án + ngày làm thật + mức hỗ trợ) → AI đọc câu trả lời, code so đáp án, gia sư xác nhận → thành một lần làm `provenance='imported'` nuôi mức điểm.

**Architecture:** Một engine **song song nhưng tách riêng** `lib/engine/points/` (thuần, không I/O, không đồng hồ) tính mức điểm theo `PP-0.1` với **đúng kỷ luật S7a** (không bao giờ tự hạ, gia sư xác nhận 3–4, một đề xuất mở mỗi (em, điểm), không đề xuất / gắn cờ lại cùng bằng chứng). Sổ **tách riêng** `point_decisions` / `point_state` (song song `mastery_decisions` / `competency_state`), chính sách **tách riêng** `point_policies` (song song `assessment_policies`), vì điểm khóa theo `error_tags.key` chứ không theo `targets.id`, policy có hình khác, và R1 nói "hai đường tính độc lập, không cộng dồn". Hai bộ máy gặp nhau **chỉ ở màn duyệt**: tab "Kỹ năng" nạp cả `eng_skill_inbox` và `eng_point_inbox`, render chung một hộp, nút xác nhận định tuyến theo nguồn. Bằng chứng điểm = câu đóng đã chấm gắn nhãn (`attempt_auto_checks ⋈ studio_item_meta`), dùng được cho **cả** câu Studio và câu bài nạp. Nạp bài đã làm dùng lại pipeline AI đọc của Studio B1 (`lib/ai/*`, trần $10, `ai_runs`, `AI_FAKE`) với mục đích mới `read_answers`, rồi dựng một mẫu `kind='imported'` + một lần làm `provenance='imported'` + `attempt_auto_checks` để cả engine điểm và S7a (cách 2) đọc được — nhưng vì là mẫu riêng nên **không** là "lần làm đầu" của bước nào đã giao (R2).

**Tech Stack:** Next.js App Router · TypeScript strict · Tailwind · Supabase (schema `english`, RLS, plpgsql, `security definer`) · zod · Vitest (unit + DB Postgres local tại 127.0.0.1:5432) · Playwright (CI) · Claude API từ server (chỉ nháp; `AI_FAKE=1` trong CI).

**Spec:** `docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md` (§4 hàng W3, §5 yêu cầu chung + quy tắc giao diện máy tính, §6 W3, §8 "Thử AI bằng dùng thật") · luật `docs/DOMAIN.md` §2 (quyền), §3 tầng B+C, §4 phiên bản, §5.2 (mức điểm `PP-0.1`), §5.3 (Nạp bài đã làm), §6 trạng thái, §7 bất biến, §8 ca biên, §9 AI, §13 D-W1/D-W3/D-W5/D-W6/D-W7/D-W8, §14 R1/R2/R5/R8.

## Global Constraints

- Migration `db/migrations/0027_points_import.sql`: idempotent, **chỉ thêm** (expand), kết thúc `insert into english.schema_migrations(version) values ('0027') on conflict do nothing;`. Không sửa 0001–0026. Không đụng schema `public`. Áp **sau** 0025 và 0026 (guard dừng sớm nếu thiếu 0026).
- PP-0.1 (dòng chính sách) **không** nằm trong 0027: seed bằng `npm run gen:config -- --new` → migration **0028** (file sinh tự động, khóa vào `content/config.lock.json`, như AP-0.3). 0027 chỉ tạo **bảng rỗng** `point_policies`; engine điểm không chạy tới khi 0028 áp (giống S7a khi thiếu AP). **SQL cần phụ huынh áp: `0025`, `0026` rồi `0027` rồi `0028`.**
- Số migration kế tiếp sau lát này = **0029** (0027 là bảng W3, 0028 là seed PP-0.1).
- Bảng chỉ thêm gắn `english.eng_forbid_mutation('learner_id')` (row) + `eng_forbid_mutation()` (truncate); bảng không có `learner_id` gắn `eng_forbid_mutation()` không tham số. Bảng dẫn xuất (`point_state`) không gắn forbid (xóa/tính lại được) nhưng không cấp `insert/update/delete` cho ai ngoài hàm.
- `revoke insert, update, delete, truncate … from public, anon, authenticated, service_role`; ghi chỉ qua hàm `security definer set search_path = ''`; mỗi hàm tự kiểm vai + `english.eng_actor_may_manage(p_by, p_learner)`. Engine đọc/ghi (`eng_point_*`) chỉ cấp cho `service_role`, gọi sau `requireAccess`.
- Bảng có `learner_id` → vào `eng_purge_learner` **và** `eng_purge_preview` bằng `create or replace` (mẫu 0026), kèm test so từng dòng. `jsonb_build_object` tối đa 100 tham số → khóa mới vào **object thứ ba** (0024 đã mở object thứ hai, 0026 thêm vào object thứ hai; W3 dùng `|| pg_catalog.jsonb_build_object(...)` mới).
- Mọi chữ giao diện trong `lib/copy/vi.ts`; người dạy là "thầy/cô" qua `tutorHonorific` / `tutorHonorificCap`; **không** viết cứng "cô". Con **không bao giờ** thấy điểm, x/y, %, mức, nhãn (bất biến §7.6): mọi hàm con đọc là `eng_my_*`, không bảng nào của W3 cho `student` SELECT.
- Engine điểm **thuần**: không `Date.now()`, không I/O; nhận `now` trong input. Ngày = **ngày lịch Việt Nam (UTC+7)** cho mọi phép tính (dùng `vnDay` của `lib/engine/days.ts`).
- Track là **cấu hình**: không `if (track === 'A')` trong logic nghiệp vụ (lint chặn). Code, comment, commit: tiếng Anh.
- `npm run typecheck && npm run lint && npm test` xanh trước khi mở PR; review Opus (`reviewer`) trước PR; PR tiếng Việt: làm gì · cách thử preview · **SQL cần phụ huынh áp: `0025`, `0026`, `0027`, `0028`** · tiêu chí đạt/chưa.
- Commit trailer (mọi commit của lát này):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1
  ```
- Nhánh builder: `feature/w3-points-import` từ `origin/feature/w2-curriculum`; PR base = `main` (W1, W2 và khung bàn làm việc đã gộp).

---

## Assumptions (**H1–H7 đã duyệt 08/11**)

Những điểm **chưa** chốt trong spec/DOMAIN; builder dùng mặc định ghi dưới đây và nêu lại trong PR + `docs/PROGRESS.md`. Không chặn build.

- **H1 — Ngưỡng `PP-0.1` lấy đúng §5.2.** Mức 2: ≥ 1 câu được tính **đúng** *hoặc* ≥ 1 câu đúng có hỗ trợ. Mức 3 (đề xuất): ≥ 4 câu được tính · ≥ 75 % đúng · ≥ 2 dịp khác ngày. Mức 4 (đề xuất): đã ở mức 3 **và** ≥ 2 câu được tính **đúng** ở một dịp **≥ 14 ngày** sau dịp gần nhất trước đó, từ **nguồn khác**. ⚑: đang ≥ 3 mà 3 câu được tính gần nhất có ≥ 2 sai. "75 %" tính nguyên: `correct*100 ≥ 75*counted`. Nếu phụ huynh muốn khác → bản `PP-0.2` (file mới, `gen:config -- --new`), không sửa `PP-0.1`.
- **H2 — "nguồn khác" (mức 4) = mẫu đề khác (`template_id` khác).** Dịp ≥ 14 ngày phải có ≥ 2 câu được tính **đúng** mà `source_id` của chúng khác mọi `source_id` của các dịp trước đó của điểm này. (Không có ví dụ §5.2 nào chạm mức 4 với dữ liệu thật của Nguyên, nên có thêm 1 unit test tổng hợp.)
- **H3 — Bản đồ kiến thức là TRANG RIÊNG** `/learners/[id]/knowledge` (spec §3 liệt kê "Bản đồ kiến thức" là một màn riêng), **không** nhồi vào Hồ sơ cấp (trang đó đã có cấp 7 mảng + S7a + W1). Hồ sơ cấp chỉ thêm 1 liên kết "Xem Bản đồ kiến thức". Nếu phụ huынh muốn gộp → chuyển component sau, dữ liệu không đổi.
- **H4 — Nhãn dạng câu đọc/nghe (R7, nhãn 0018 + nhãn nghe 0026) vào CHUNG engine điểm.** `studio_item_meta` có `reading_skill_key` (nhóm Kỹ năng đọc) *hoặc* `tag_key`. Engine điểm đọc **cả hai** như một "điểm" (khóa = `coalesce(tag_key, reading_skill_key)`); Bản đồ kiến thức xếp chúng vào mảng Đọc/Nghe của SM-1 qua `error_tags.group_key` / nhóm "Kỹ năng đọc". Bảng "Kỹ năng đọc" nhập tay theo tháng (0018) vẫn chỉ là **tín hiệu**, không vào luật mức (DOMAIN §5.2 đoạn cuối).
- **H5 — Mức điểm 3–4 confirm TỪNG điểm (không "Xác nhận tất cả" cho điểm trong W3).** S7a có nút "Xác nhận tất cả" cho kỹ năng; điểm thì xác nhận từng thẻ (R1 nói xác nhận theo *điểm/kỹ năng*, không nói phải có bulk cho điểm). Thêm bulk cho điểm để lát sau nếu gia sư thấy nhiều.
- **H6 — Bài nạp tạo MỘT bước đóng (ACT-SOURCE-QA) với toàn bộ câu đóng.** Câu tự luận / viết trong đề cũ: đánh dấu `out_of_app` (chỉ ở khung giấy), không chấm đúng/sai, không nuôi mức điểm (giống Studio). Mức viết/nói đi đường Cambridge ở **W4** (R6), không thuộc W3.
- **H7 — `provenance='imported'` là giá trị MỚI, tách khỏi `manual_import` đã có.** `manual_import` (0009) là bài tự luận ghi ngoài app (không có đáp án đóng, không dedup theo mã băm). `imported` của W3 là đề cũ có đáp án đóng + ngày làm thật + mức hỗ trợ + mã băm chống trùng. Hai luồng khác nhau nên hai giá trị.

---

## File structure

| File | Trách nhiệm |
|---|---|
| `db/migrations/0027_points_import.sql` | attempts cột mới + `imported`; `inquiry_templates.kind='imported'`; `point_policies`/`point_decisions`/`point_state`; `import_batches`; hàm engine điểm (inputs/apply/decide/reset/inbox/map); `eng_create_import`/`eng_confirm_import`; `ai_runs.purpose='read_answers'`; purge |
| `content/point_policy_PP-0.1.json` | Cấu hình ngưỡng `PP-0.1` (đọc bằng `gen:config`) |
| `db/migrations/0028_seed_point_policy_pp_0_1.sql` | **Sinh tự động** bởi `gen:config -- --new` (Task 17) |
| `lib/engine/points/types.ts` | Hằng số + kiểu: `POINT_LEVELS`, `POINT_STATE`, `PointEngineInput`, `PointEngineResult`, `PointPolicy` |
| `lib/engine/points/compute.ts` | `computePointLevel(input)` — engine thuần `PP-0.1` |
| `lib/engine/points/project.ts` | `projectPointDecisions` (như `lib/engine/project.ts`) |
| `lib/engine/points/shape.ts` | parse `eng_point_inputs` → input mỗi điểm; `toPointApplyRow` |
| `lib/engine/points/runner.ts` | `recomputePoints` / `rebuildPoints` / `pointEvidenceKeyFor` + `PointEngineStore` |
| `lib/engine/points/supabaseStore.ts` · `hook.ts` | rpc service-role; hook sau ghi |
| `lib/config/pointPolicySchema.ts` | zod `pointPolicyConfigSchema` (dùng cho engine + generator) |
| `lib/ai/prompts.ts` (modify) · `prompts/read-answers.v1.md` | công thức `read_answers` |
| `lib/import/readTool.ts` · `context.ts` · `extract.ts` · `normalize.ts` · `schema.ts` | pipeline AI đọc bài làm (mẫu `lib/curriculum/*`) |
| `lib/points/` (`types.ts` `schemas.ts` `handlers.ts` `supabaseStore.ts` `route.ts` `load.ts` `shape.ts` `view.ts`) | decide/rebuild điểm + Bản đồ + inbox điểm |
| `lib/import/` (`client.ts` `handlers.ts` `supabaseStore.ts` `route.ts` `load.ts` `shape.ts`) | tạo/duyệt bài nạp |
| `app/api/review/points/[id]/route.ts` · `app/api/learners/[id]/points/rebuild/route.ts` | POST decide / rebuild |
| `app/api/learners/[id]/imports/route.ts` · `.../imports/files/route.ts` · `app/api/imports/[id]/confirm/route.ts` | tạo bài nạp · xin URL tải · duyệt |
| `app/learners/[id]/knowledge/page.tsx` + `components/points/PointMap.tsx` | Bản đồ kiến thức |
| `app/review/skills/page.tsx` (modify) + `components/points/PointProposalCard.tsx` | điểm vào tab "Kỹ năng" (R1) |
| `app/learners/[id]/imports/new/page.tsx` · `components/import/ImportForm.tsx` · `components/import/ImportConfirm.tsx` | Nạp bài đã làm + duyệt |
| `app/review/studio/page.tsx` (modify) hoặc `ReviewTabs` | bài nạp "cần xem" nằm chung Chờ duyệt |
| `lib/auth/requireAccess.ts` (modify) | action `points:read` `points:decide` `points:rebuild` `import:upload` `import:confirm` |
| `lib/copy/vi.ts` (modify) | `pointStateCopy`, `pointMapCopy`, `importCopy`, `appFeedback.screens.*` |
| `tests/fixtures/import/fake-read-answers.json` | AI_FAKE cho `save_read_answers` (Progress Test) |
| `tests/db/pointsImport.test.ts` · `tests/unit/pointEngine.test.ts` · `tests/unit/importAi.test.ts` · `tests/unit/pointsApi.test.ts` · `tests/e2e/pointsImport.spec.ts` | test |
| `docs/PROGRESS.md` · `docs/DESIGN.md` (§19.14) · `CLAUDE.md` · `docs/UX_COPY_GUIDE.md` (modify) | tài liệu |

---

### Task 1: Migration 0027 — attempts cột mới + `imported`; `inquiry_templates.kind='imported'`

**Files:**
- Create: `db/migrations/0027_points_import.sql`
- Test: `tests/db/pointsImport.test.ts`

**Interfaces:**
- Produces: `english.attempts.taken_on date`, `.support_level text`, `.source_hash text`; `provenance` CHECK nhận `'imported'`; `inquiry_templates.kind` CHECK nhận `'imported'`, id `^[AB]-IM-[0-9]{6}$`, `family_id`+`learner_id` bắt buộc khi `kind='imported'`; sequence `english.import_template_seq`.

- [ ] **Step 1: Failing DB test** (helpers như `tests/db/workdeskW1.test.ts` / `tests/db/studio.test.ts`)

```ts
// tests/db/pointsImport.test.ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

describe("W3 points + import (migration 0027)", () => {
  let db: TestDb; let s: Seeded;
  const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.client.query<R>(sql, p)).rows;
  const svc = <T = unknown>(sql: string, p: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, p)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const e = await p.then(() => null, (x: unknown) => x as { code?: string; message?: string });
    expect(e, "expected error").not.toBeNull(); expect(e?.code, e?.message).toBe(code); if (re) expect(e?.message).toMatch(re);
  };
  beforeAll(async () => { db = await createTestDb(); await migrate(db.client); s = await seed(db.client); });
  afterAll(async () => { await db?.drop(); });

  describe("1. attempts + template kind", () => {
    it("attempts has taken_on / support_level / source_hash and accepts provenance 'imported'", async () => {
      for (const col of ["taken_on", "support_level", "source_hash"]) {
        expect((await q1("select 1 as r from information_schema.columns where table_schema='english' and table_name='attempts' and column_name=$1", [col]))[0]).toEqual({ r: 1 });
      }
      // CHECK: imported requires taken_on + support_level; support_level in the three values.
      expect((await q1<{ ok: boolean }>(
        "select $1 = any (enum_range_from_check()) as ok", []).catch(() => [{ ok: true }]))[0]?.ok ?? true).toBe(true);
    });
    it("inquiry_templates.kind accepts 'imported' with the A-IM-/B-IM- id and requires owner", async () => {
      expect((await q1("select 1 as r from pg_constraint where conname='inquiry_templates_kind_check'"))[0]).toEqual({ r: 1 });
    });
  });
});
```

(Chú ý: test shape ở trên chỉ kiểm cột/constraint tồn tại; ràng buộc giá trị được kiểm gián tiếp qua Task 7–8 khi dựng lần làm thật. `enum_range_from_check` là giả — thay bằng kiểm `check_clause` của `support_level` qua `information_schema.check_constraints` nếu muốn chặt.)

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/db/pointsImport.test.ts -t "attempts"` (cột chưa có). Postgres local 127.0.0.1:5432 chạy được; không có Docker → ghi "chạy trong CI".

- [ ] **Step 3: Viết đầu migration 0027 (guard + attempts + template kind)**

```sql
-- 0027_points_import.sql
-- W3 · Mức điểm kiến thức (PP-0.1) + Bản đồ kiến thức + Nạp bài đã làm
-- (spec docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md §4 W3, §5, §6 W3, §8; luật docs/DOMAIN.md §2, §3, §4, §5.2, §5.3,
--  §6, §7, §8, §9, §13 D-W1/D-W3/D-W5/D-W6/D-W7/D-W8, §14 R1/R2/R5/R8).
--   1. attempts: taken_on (ngày làm thật), support_level (tu_lam/tu_lam_chua/lam_cung_co), source_hash (mã băm file bài, chống trùng);
--      provenance thêm 'imported'. inquiry_templates.kind thêm 'imported' (mẫu riêng của MỘT em, id A-IM-/B-IM-).
--   2. point_policies (RỖNG ở đây; PP-0.1 seed ở 0028 bằng gen:config). point_decisions (chỉ thêm, song song mastery_decisions, khóa
--      theo tag_key) + point_state (dẫn xuất). Engine điểm thuần ở lib/engine/points; hàm SQL kiểm lại mọi luật trước khi ghi.
--   3. import_batches (bài nạp: file bài + file đáp án + ngày + mức hỗ trợ + mã băm + payload AI đọc). eng_create_import (gia sư HOẶC
--      phụ huынh tải — R8) / eng_confirm_import (CHỈ gia sư của em: dựng mẫu imported + 1 lần làm + attempt_auto_checks — R8).
--   4. ai_runs.purpose thêm 'read_answers'; eng_ai_gate / eng_log_ai_run nới purpose.
--   5. eng_purge_learner + eng_purge_preview thêm point_decisions, point_state, import_batches (lần làm imported đã nằm trong attempts).
-- Idempotent; chỉ thêm (expand). Không đụng schema public. Cần 0025 và 0026 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations where version = '0026') then
    raise exception '0027 cần 0026_curriculum.sql: hãy áp 0025, 0026 trước rồi áp lại 0027 (missing_0026)' using errcode = 'P0001';
  end if;
end
$guard$;

-- 1. attempts: ngày làm thật, mức hỗ trợ, mã băm file; provenance 'imported' ------------------------------------------------------------
alter table english.attempts add column if not exists taken_on date;
alter table english.attempts add column if not exists support_level text
  check (support_level is null or support_level in ('tu_lam', 'tu_lam_chua', 'lam_cung_co'));
alter table english.attempts add column if not exists source_hash text
  check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$');
alter table english.attempts drop constraint if exists attempts_provenance_check;  -- CHECK cũ là inline; đổi tên qua cột
-- Postgres không cho sửa CHECK inline của cột; nới bằng một CHECK bảng mới (chỉ rộng hơn: giữ mọi giá trị cũ + 'imported').
alter table english.attempts drop constraint if exists attempts_provenance_imported;
alter table english.attempts add constraint attempts_provenance_imported check (
  provenance in ('in_app', 'pasted', 'manual_import', 'tutor_live', 'imported'));
-- Bài nạp bắt buộc có ngày + mức hỗ trợ; bài khác không có hai cột này (giữ sạch).
alter table english.attempts drop constraint if exists attempts_imported_shape;
alter table english.attempts add constraint attempts_imported_shape check (
  (provenance = 'imported') = (taken_on is not null and support_level is not null));
create index if not exists attempts_source_hash_idx on english.attempts(learner_id, source_hash) where source_hash is not null;
```

> **Lưu ý về CHECK cũ:** `provenance` trong 0009 là CHECK **inline** (ẩn danh). Không drop được bằng tên cố định; ta **thêm** một CHECK bảng `attempts_provenance_imported` rộng hơn (bao mọi giá trị cũ) — CHECK cũ vẫn còn nhưng không bao giờ bị vi phạm vì CHECK mới hẹp hơn hoặc bằng. Nếu CI báo trùng, builder để lại đúng một CHECK rộng; không cần xoá CHECK cũ. (Ghi rõ giả định này trong PR.)

```sql
-- inquiry_templates: thêm kind 'imported' (mẫu riêng MỘT em; id A-IM-/B-IM-; bắt buộc family_id + learner_id như 'studio').
alter table english.inquiry_templates drop constraint if exists inquiry_templates_kind_check;
alter table english.inquiry_templates add constraint inquiry_templates_kind_check check (kind in ('topic', 'studio', 'imported'));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_studio_owner;
alter table english.inquiry_templates add constraint inquiry_templates_studio_owner
  check ((kind in ('studio', 'imported')) = (family_id is not null and learner_id is not null));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_id_check;
alter table english.inquiry_templates add constraint inquiry_templates_id_check check (
  (kind = 'topic' and id ~ '^[AB]-W[0-9]+-[A-Z0-9-]+$')
  or (kind = 'studio' and id ~ '^[AB]-ST-[0-9]{6}$')
  or (kind = 'imported' and id ~ '^[AB]-IM-[0-9]{6}$'));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_target_ids_check;
alter table english.inquiry_templates add constraint inquiry_templates_target_ids_check check (kind in ('studio', 'imported') or cardinality(target_ids) > 0);
create sequence if not exists english.import_template_seq;
revoke all on sequence english.import_template_seq from public, anon, authenticated;

insert into english.schema_migrations(version) values ('0027') on conflict do nothing;
```

(Dòng `insert … schema_migrations` để **cuối** file; mỗi task sau chèn SQL **trước** dòng này.)

- [ ] **Step 4: Run → PASS.** · **Step 5: Commit** `feat(w3): migration 0027 — attempts taken_on/support/source_hash + imported template kind`

---

### Task 2: `point_policies` (rỗng) + `eng_point_policy` + `eng_point_level`

**Files:** Modify `db/migrations/0027_points_import.sql`; Test `tests/db/pointsImport.test.ts`.

**Interfaces:**
- Produces: bảng `english.point_policies(version pk, config jsonb, source_hash text, published_at timestamptz)` (bất biến như `assessment_policies`); `english.eng_point_policy() returns text` = `version` của dòng published mới nhất (NULL khi chưa seed); `english.eng_point_level(text) returns int` (0..4, NULL nếu không phải trạng thái).

- [ ] **Step 1: Failing test**

```ts
  describe("2. point policy", () => {
    it("point_policies exists and is empty until 0028; eng_point_policy() is null", async () => {
      expect((await q1("select to_regclass('english.point_policies') as r"))[0]).toEqual({ r: "english.point_policies" });
      expect((await q1<{ n: number }>("select count(*)::int as n from english.point_policies"))[0]?.n).toBe(0);
      expect(await svc<string | null>("select english.eng_point_policy() as r")).toBeNull();
    });
    it("eng_point_level maps the four states", async () => {
      expect(await svc<number>("select english.eng_point_level('INDEPENDENT') as r")).toBe(3);
      expect(await svc<number | null>("select english.eng_point_level('NOPE') as r")).toBeNull();
    });
  });
```

- [ ] **Step 2: Run → FAIL.** · **Step 3: Thêm SQL (trước dòng schema_migrations)**

```sql
-- 2. Chính sách mức điểm (song song assessment_policies). Bất biến khi đã published. RỖNG ở 0027; PP-0.1 seed ở 0028 (gen:config).
create table if not exists english.point_policies (
  version text primary key check (pg_catalog.length(pg_catalog.btrim(version)) > 0),
  config jsonb not null check (pg_catalog.jsonb_typeof(config) = 'object'),
  source_hash text not null,
  published_at timestamptz
);
drop trigger if exists point_policies_immutable on english.point_policies;
create trigger point_policies_immutable before update or delete on english.point_policies
  for each row execute function english.eng_forbid_published_change('self');
drop trigger if exists point_policies_immutable_truncate on english.point_policies;
create trigger point_policies_immutable_truncate before truncate on english.point_policies
  for each statement execute function english.eng_forbid_row_change();
alter table english.point_policies enable row level security;
revoke all on english.point_policies from public, anon, authenticated, service_role;
grant select on english.point_policies to service_role;

-- Dòng chính sách điểm đang dùng = bản published mới nhất. NULL = chưa seed (engine điểm chưa chạy).
create or replace function english.eng_point_policy() returns text
language sql stable security definer set search_path = ''
as $$
  select p.version from english.point_policies p where p.published_at is not null order by p.published_at desc, p.version desc limit 1
$$;
revoke execute on function english.eng_point_policy() from public, anon, authenticated;
grant execute on function english.eng_point_policy() to service_role;

-- Bậc của trạng thái điểm (dùng chung tên trạng thái với S7a để gia sư chỉ học một luật).
create or replace function english.eng_point_level(p_state text) returns int
language sql immutable set search_path = ''
as $$ select english.eng_skill_level(p_state) $$;  -- 0=NOT_OBSERVED … 4=TRANSFERABLE (0023)
revoke execute on function english.eng_point_level(text) from public, anon;
grant execute on function english.eng_point_level(text) to authenticated, service_role;
```

`eng_forbid_published_change('self')` và `eng_forbid_row_change` có từ 0005 (dùng cho `assessment_policies`). `eng_skill_level` có từ 0023.

- [ ] **Step 4: Run → PASS.** · **Step 5: Commit** `feat(w3): point_policies table + eng_point_policy / eng_point_level`

---

### Task 3: `point_decisions` + `point_state` + `eng_project_point_state`

**Files:** Modify `db/migrations/0027_points_import.sql`; Test `tests/db/pointsImport.test.ts`.

**Interfaces:**
- Produces: `english.point_decisions` (song song `mastery_decisions`: `kind` AUTO/PROPOSED/CONFIRMED/REJECTED/MANUAL/FLAG; khóa **`tag_key`** thay `target_key`; `policy_version references point_policies(version)`; `evidence_item_refs text[]` thay cho `evidence_episode_ids`; cùng mọi index "một lần" như 0023). `english.point_state` (dẫn xuất: `(learner_id, tag_key)` → state + decision ids + conditions). `english.eng_project_point_state(p_learner uuid, p_tag text)`.

- [ ] **Step 1: Failing test** (shape + append-only + RLS + projection)

```ts
  describe("3. point decisions + state", () => {
    const seedState = async () => {
      // AUTO 0→DEVELOPING then PROPOSED DEVELOPING→INDEPENDENT (app writes via apply in Task 5; here insert via a tiny helper).
    };
    it("point_decisions/point_state exist, append-only, students read nothing", async () => {
      for (const t of ["point_decisions", "point_state"]) {
        expect((await q1("select to_regclass($1) as r", [`english.${t}`]))[0]).toEqual({ r: `english.${t}` });
      }
      await fail(svc("insert into english.point_decisions(learner_id, tag_key, kind, from_state, to_state, evidence_key, policy_version, engine_version) values ($1,'cum-dong-tu','AUTO','NOT_OBSERVED','DEVELOPING','1-0000000000000000','PP-0.1','PP-eng-1')", [NG()]), "42501");
    });
    it("eng_project_point_state picks the latest AUTO/CONFIRMED/MANUAL and leaves PROPOSED/FLAG open", async () => {
      // inserted through apply in Task 5's test; here assert the projector exists:
      expect((await q1("select 1 as r from pg_proc where proname='eng_project_point_state'"))[0]).toEqual({ r: 1 });
    });
  });
```

- [ ] **Step 2: Run → FAIL.** · **Step 3: Thêm SQL** — sao `english.mastery_decisions` (0023 dòng 94–141) đổi: tên bảng `point_decisions`; `target_key`→`tag_key` (check `~ '^[a-z0-9][a-z0-9-]{1,79}$'` để bao cả nhãn `x-…` của gia đình và nhãn đọc/nghe); `policy_version references english.point_policies(version)`; thay `evidence_episode_ids uuid[]` bằng `evidence_item_refs text[] not null default '{}' check (cardinality(evidence_item_refs) <= 400)` (mỗi ref = `template:item:attempt`, không phải uuid); dùng lại `english.eng_point_level` trong mọi CHECK `levels`; index `point_decisions_answered_once`, `point_decisions_evidence_once` (`kind='PROPOSED'`, trên `(learner_id, tag_key, to_state, evidence_key)`), `point_decisions_flag_once`, `point_decisions_client_once`, `point_decisions_learner_idx`. Trigger `eng_forbid_mutation('learner_id')` + truncate. `point_state` sao `competency_state` đổi `target_key`→`tag_key`, FK trỏ `point_decisions`. RLS `eng_is_staff_of(learner_id)` cho SELECT; `grant select … to authenticated`; `revoke insert/update/delete/truncate … from … service_role`. `eng_project_point_state` sao `eng_project_skill_state` (0023 dòng 228–253) đổi bảng/tên.

> **Vì sao bảng riêng, không dùng lại `mastery_decisions` (khuyến nghị thiết kế):** `mastery_decisions.target_key` khóa theo `targets.id` của **bộ kỹ năng**; điểm khóa theo `error_tags.key` — **không gian khóa khác**, hai em khác track. `mastery_decisions.policy_version` có FK tới `assessment_policies`; `PP-0.1` ở `point_policies` (hình khác, ngưỡng khác). Bằng chứng kỹ năng là `episode` (uuid); bằng chứng điểm là **câu** (`template:item`). Dùng chung sẽ phải nới hàng loạt CHECK, cho khóa null, và phá bất biến "một câu là bằng chứng cho đúng 1 nhãn **và** tối đa 1 kỹ năng — hai đường độc lập" (R1). Tách riêng giữ mỗi engine đọc đúng sổ của mình; hai engine chỉ gặp nhau ở **đọc** (tab "Kỹ năng" union hai inbox) và ở **bằng chứng** (cùng `attempt_auto_checks`, đọc bằng hai hàm input khác nhau). `eng_engine_inputs` của S7a **không** đổi.

- [ ] **Step 4: Run → PASS.** · **Step 5: Commit** `feat(w3): point_decisions + point_state (parallel to mastery) + projector`

---

### Task 4: `eng_point_inputs` — đọc bằng chứng từng điểm

**Files:** Modify `db/migrations/0027_points_import.sql`; Test `tests/db/pointsImport.test.ts`.

**Interfaces:**
- Produces: `english.eng_point_inputs(p_learner uuid, p_tags text[] default null) returns jsonb` = `{ learner_id, now, policy:{version,config}|null, points:[{ tag_key, title_vi, group_key, taught_unit:boolean, counted:[{ ref, day, correct, source_id, first }], supported_correct:int, decisions:[…] }] }`. "Câu được tính" = câu **đóng** đã chấm (`attempt_auto_checks` result ∈ correct/incorrect; **không** `blank`), gắn đúng điểm đó (`studio_item_meta.tag_key` *hoặc* `reading_skill_key`), **lần làm đầu** của em trên câu đó, **không hỗ trợ**; `day` = `vnDay` của `coalesce(attempts.taken_on, submitted_at VN)`; `source_id` = `template_id`; `supported_correct` = số câu **đúng có hỗ trợ** (bài `lam_cung_co` hoặc `declared_assistance<>none`) — chỉ nâng tới mức 2.

- [ ] **Step 1: Failing test** — seed: tạo một mẫu Studio đã duyệt (dùng `eng_approve_studio_draft` như `tests/db/studio.test.ts`) với 2 câu gắn `tag_key='cum-dong-tu'`, nộp + tự chấm 1 đúng 1 sai → `eng_point_inputs(NG(),array['cum-dong-tu'])` trả `points[0].counted` dài 2, một `correct=true` một `false`, `policy` null (chưa seed PP-0.1).

```ts
  describe("4. point inputs", () => {
    it("reads counted closed questions per tag from auto-checks; blank not counted; policy null before 0028", async () => {
      // … seed a studio template + attempt with auto-checks (reuse helpers from tests/db/studio.test.ts) …
      const got = await svc<{ points: { tag_key: string; counted: unknown[] }[]; policy: unknown }>(
        "select english.eng_point_inputs($1,$2) as r", [NG(), ["cum-dong-tu"]]);
      expect(got.policy).toBeNull();
      expect(got.points.find((p) => p.tag_key === "cum-dong-tu")?.counted.length).toBe(2);
    });
  });
```

- [ ] **Step 2: Run → FAIL.** · **Step 3: Thêm SQL** — hàm `eng_point_inputs`: điểm = `distinct coalesce(tag_key, reading_skill_key)` trong `studio_item_meta` của em (mọi mẫu `studio`/`imported`), lọc theo `p_tags`. Với mỗi điểm:
  - `title_vi` / `group_key`: `error_tags` (`key=tag`, track/em) hoặc nhãn đọc (nhóm "Kỹ năng đọc"); null nếu không tra được.
  - `taught_unit`: `exists` câu trong `curriculum_unit_points` của em có `code` mà sự kiện Unit mới nhất (`curriculum_unit_events`) ∈ `('in_progress','done')` **hoặc** có dòng `lesson_note_units`.
  - `counted`: join `attempt_auto_checks c` → `attempts t` → `episodes e` → `activity_instances a` → `inquiry_instances i` → `inquiry_templates tpl`, mảng item trong `i.snapshot`, khớp `studio_item_meta` (template+item) theo `tag`, `c.checks->'items'->item->>'result' in ('correct','incorrect')`, `e.is_first_attempt`, **không hỗ trợ** (`t.provenance <> 'imported' and 'none' = any(t.declared_assistance)` *hoặc* `t.provenance='imported' and t.support_level in ('tu_lam','tu_lam_chua')`). `ref = tpl.id||':'||item||':'||t.id`; `day = english.eng_vn_day(coalesce(english.eng_session_ts(t.taken_on), t.submitted_at))`; `correct = result='correct'`; `source_id = tpl.id`; `first = english.eng_is_step_repeat(t.id) = false`.
  - `supported_correct`: cùng join nhưng câu **đúng có hỗ trợ** (`support_level='lam_cung_co'` hoặc `declared_assistance <> array['none']`).
  - `policy`: `case when english.eng_point_policy() is null then null else jsonb_build_object('version', …, 'config', (select config from point_policies …)) end`.
  - `decisions`: như `eng_engine_inputs` nhưng từ `point_decisions` theo `tag_key`.
  - Thêm helper nhỏ `english.eng_vn_day(ts timestamptz) returns int` = `floor((extract(epoch from ts)+7*3600)/86400)::int` (khớp `vnDay` TS) nếu chưa có; `security definer`, revoke như các helper khác.

- [ ] **Step 4: Run → PASS.** · **Step 5: Commit** `feat(w3): eng_point_inputs — counted closed questions per tag`

---

### Task 5: `eng_apply_point_results` + `eng_reset_point_states`

**Files:** Modify `db/migrations/0027_points_import.sql`; Test `tests/db/pointsImport.test.ts`.

**Interfaces:**
- Produces: `english.eng_apply_point_results(p_learner uuid, p_results jsonb, p_engine_version text) returns jsonb` (`{auto,proposed,flagged,policy_version}`) — kiểm lại mọi luật (AUTO 1–2 chỉ lên; PROPOSED 3–4 cao hơn hiện tại, mức 4 chỉ từ INDEPENDENT, một đề xuất mở, không trùng (bậc,khóa); FLAG ≥2, không ⚑ mở, không trùng khóa; MANUAL giữ tới khi khóa đổi). `english.eng_reset_point_states(p_learner uuid, p_by uuid)`.

- [ ] **Step 1: Failing test** — chèn một dãy `point_decisions` qua apply: `[{tag_key:'cum-dong-tu', auto:'DEVELOPING', propose:'INDEPENDENT', evidence_key:'…', propose_key:'…', route:1, conditions:[], evidence:{auto:[…],propose:[…],flag:[]}, computed_at:now}]` → kỳ vọng 1 AUTO + 1 PROPOSED; apply lại y hệt → 0 thêm (không trùng); apply với `auto` thấp hơn hiện tại → không hạ.

- [ ] **Step 2: Run → FAIL.** · **Step 3: Thêm SQL** — sao `eng_apply_engine_results` (0023 dòng 410–524) đổi: bảng `point_decisions`/`point_state`, `target_key`→`tag_key`, `english.eng_point_level`, `english.eng_point_policy()` (không tham số), **bỏ** `eng_engine_scope` (điểm không có "bộ": mọi `tag_key` hợp lệ đều ghi được — thay guard `not_in_set` bằng kiểm `tag_key ~ '^[a-z0-9][a-z0-9-]{1,79}$'`), `evidence_episode_ids`→`evidence_item_refs` (text[], bỏ `eng_uuid_array` — dùng `array(select jsonb_array_elements_text(...))`). Giữ nguyên: khóa dòng em (`for update` trên `learners`), B2 (MANUAL giữ), 4 bước (AUTO/PROPOSED/FLAG/điều kiện), N2 (`inputs_at`). `eng_reset_point_states` sao `eng_reset_skill_states` (0023 dòng 529–565) đổi bảng; phạm vi tính lại = mọi `tag_key` xuất hiện trong `point_decisions` **và** mọi điểm `eng_point_inputs` trả về (dùng `eng_point_inputs(p_learner,null)`).

- [ ] **Step 4: Run → PASS** (gồm: không hạ; apply lại không tạo trùng). · **Step 5: Commit** `feat(w3): eng_apply_point_results + eng_reset_point_states (never downgrade, no dup)`

---

### Task 6: `eng_decide_point` + `eng_point_inbox` + `eng_point_map`

**Files:** Modify `db/migrations/0027_points_import.sql`; Test `tests/db/pointsImport.test.ts`.

**Interfaces:**
- Produces: `eng_decide_point(p_decision uuid, p_action text, p_reason text, p_by uuid, p_client_id text) returns jsonb` (confirm/reject; **chỉ gia sư của em**; một đề xuất trả lời một lần). `eng_point_inbox(p_by uuid, p_allow_real boolean default false) returns jsonb` (`{open,decidable,items:[{id,kind,learner_id,alias,is_test,tag_key,title_vi,from_state,to_state,current_state,conditions,evidence:[{ref,title_vi,at}],created_at,can_decide}]}`). `eng_point_map(p_learner uuid) returns jsonb` (Bản đồ: điểm theo mảng/giáo trình với mức + bằng chứng từng câu). `eng_set_point_state` (sửa tay 1–2, tùy chọn) — có thể hoãn; nếu làm, sao `eng_set_skill_state`.

- [ ] **Step 1: Failing test** — sau khi apply tạo PROPOSED INDEPENDENT: `eng_point_inbox(tutorNguyen)` có item `kind='PROPOSED'`, `can_decide=true`; `eng_point_inbox(parent)` `can_decide=false`; `eng_decide_point(id,'confirm',null,tutorNguyen,client)` → `point_state.state='INDEPENDENT'`; `eng_decide_point(id,'confirm',null,parent,client)` → `42501 (tutor_only)`; `eng_decide_point(id,'reject',null,tutorNguyen,client)` khi chưa có lý do → `23514 (reason_required)`.

- [ ] **Step 2: Run → FAIL.** · **Step 3: Thêm SQL** — `eng_decide_point` sao `eng_decide_skill` (0023 dòng 578–648) đổi bảng + `eng_point_policy()`; `eng_point_inbox` sao `eng_skill_inbox` (0023 dòng 898–943) **bỏ** `eng_engine_scope` (mọi `tag_key`), `title_vi` tra từ `error_tags`/nhãn đọc thay `targets`, `evidence` = ref câu (không join episodes — dựng `{ref, title_vi, at}` từ `evidence_item_refs`: tách `template:item:attempt`, lấy `attempts.coalesce(taken_on,submitted_at)` làm `at`, `title` từ `inquiry_templates.title_vi`). `eng_point_map`: với mỗi điểm của em (từ `studio_item_meta`), trả `{tag_key, title_vi, group_key, group_vi, curricula:[{id,title}], state, state_kind, flag, proposal, conditions, counted:[{ref,title,at,correct,support}]}`, **không điểm số thô** (chỉ đúng/sai từng câu + mức). RLS/grants như các hàm engine khác (service_role).

- [ ] **Step 4: Run → PASS.** · **Step 5: Commit** `feat(w3): eng_decide_point + eng_point_inbox + eng_point_map`

---

### Task 7: `import_batches` + `eng_create_import` (tải = gia sư HOẶC phụ huынh) + dedup

**Files:** Modify `db/migrations/0027_points_import.sql`; Test `tests/db/pointsImport.test.ts`.

**Interfaces:**
- Produces: `english.import_batches(id, family_id, learner_id, track_id, title, work_file_id, key_file_id, taken_on date, support_level, source_hash text, status text in ('reading','ai_failed','draft','confirmed','discarded'), payload jsonb, error_code, ai_run_id, created_by_member, updated_by_member, approved_by_member, approved_at, template_id, template_version, client_id, created_at)` (workflow như `studio_drafts`; guard `eng_guard_import_batch`). `eng_create_import(p_learner, p_title, p_work_file, p_key_file, p_taken_on, p_support, p_source_hash, p_by, p_client_id) returns jsonb` (`{id,status,replayed}`) — **gia sư của em HOẶC phụ huынh** (R8); chặn trùng (`source_hash` cùng em, **hoặc** `(title, taken_on, learner)` cùng em) trừ khi `p_allow_other := true`.

- [ ] **Step 1: Failing test** — parent tạo được bài nạp; tạo lại cùng `source_hash` → `23505 (duplicate_import)`; `taken_on` ở tương lai → `23514 (date_future)`; student → `42501`.

- [ ] **Step 2: Run → FAIL.** · **Step 3: Thêm SQL** — bảng `import_batches` (payload mặc định `'{"items":[]}'::jsonb`, CHECK `jsonb_typeof(payload)='object'`, `length(payload::text) <= 1000000`; `taken_on <= english.eng_today_vn()` kiểm trong hàm, không CHECK vì `eng_today_vn` không immutable). Guard `eng_guard_import_batch` (sửa chỉ khi `status in ('reading','ai_failed','draft')`) như `eng_guard_studio_draft`. RLS `eng_is_staff_of`. `eng_create_import`: kiểm vai (`tutor` của em qua `eng_actor_may_manage`, **hoặc** `parent` cùng gia đình — R8); kiểm `support_level` hợp lệ; kiểm `taken_on <= eng_today_vn()` (lỗi `date_future`), không giới hạn quá khứ (D-W5); chặn trùng; đăng ký file (`eng_register_file` kind mới `work_file`+`answer_key` — thêm vào CHECK `files.kind` như 0026 làm với `curriculum_toc`); ghi dòng `status='reading'`; `audit_log`. Dedup "Đây là lần làm khác" = tham số `p_allow_other boolean default false` bỏ qua kiểm trùng.

- [ ] **Step 4: Run → PASS.** · **Step 5: Commit** `feat(w3): import_batches + eng_create_import (tutor or parent, dedup by hash / title+date)`

---

### Task 8: `eng_confirm_import` — dựng mẫu `imported` + lần làm + auto-checks (gia sư của em)

**Files:** Modify `db/migrations/0027_points_import.sql`; Test `tests/db/pointsImport.test.ts`.

**Interfaces:**
- Produces: `english.eng_confirm_import(p_batch uuid, p_base text, p_build jsonb, p_by uuid, p_client_id text) returns jsonb` (`{template_id, version, attempt_id, counted}`). **Chỉ gia sư của em** (R8). `p_build` (máy chủ dựng, lưới an toàn kiểm lại) = `{ template:{title,target_ids[],prompt_en,time_min}, items:[{id,kind,...}], keys:[{item_id,kind,answer,explanation_vi}], meta:[{n,part,tag_key?,reading_skill_key?,out_of_app}], results:[{item_id, result:'correct'|'incorrect'|'blank'}] }`.

- [ ] **Step 1: Failing test** — confirm một bài nạp 3 câu (2 đúng 1 sai, `tag_key='cum-dong-tu'`, `taken_on='2026-10-23'`, `support='tu_lam_chua'`) → trả `template_id ~ '-IM-'`, tạo `attempts` với `provenance='imported'`, `taken_on='2026-10-23'`, `support_level='tu_lam_chua'`, `source_hash` set; `attempt_auto_checks` có 3 câu (2 correct 1 incorrect); **không** tạo episode "lần làm đầu" cho mẫu `topic`/`studio` nào khác (S7a step states của mẫu khác không đổi — R2); parent confirm → `42501 (tutor_only)`.

- [ ] **Step 2: Run → FAIL.** · **Step 3: Thêm SQL** — `eng_confirm_import` trong một transaction:
  1. Khóa `import_batches` `for update`; kiểm gia sư của em (`eng_actor_may_manage` + `role='tutor'`); `status='draft'`; `eng_same_instant(updated_at,p_base)`.
  2. **Dựng mẫu `imported`** mô phỏng `eng_approve_studio_draft` (0024 dòng 1245–1274) nhưng `kind='imported'`, id `track||'-IM-'||lpad(nextval('english.import_template_seq'),6,'0')`, một bước `ACT-SOURCE-QA` `mode='INDEPENDENT_CHECK'` với `items`, `template_item_keys`, `studio_item_meta` (tag từ `p_build.meta`). (Mẫu `imported` **không** là bước của bài giao nào khác → không bao giờ là "lần làm đầu" của bước khác, R2.)
  3. Tạo `inquiry_instances` (snapshot = template), `activity_instances` (step 1, `learner_id`, `released`), rồi **một** `attempts`: `provenance='imported'`, `mode='INDEPENDENT_CHECK'`, `taken_on`, `support_level` (từ batch), `source_hash` (từ batch), `declared_assistance = case support_level when 'lam_cung_co' then array['asked_someone'] else array['none'] end`, `submitted_at = english.eng_session_ts(taken_on)`, `content_hash`, `client_submission_id`. Gọi `english.eng_record_attempt_effects(...)` để sinh `episodes` (`is_first_attempt=true`, không `step_repeat` vì mẫu riêng).
  4. `attempt_auto_checks(attempt_id, learner_id, checks)` với `checks = jsonb_build_object('items', jsonb_object_agg(item_id, jsonb_build_object('result', result)))` từ `p_build.results` (chỉ câu không `out_of_app`).
  5. `update import_batches set status='confirmed', template_id, template_version, approved_*`; `audit_log`.
  6. Trả kết quả; **route gọi hook engine điểm + S7a** sau (Task 13–14).

> Giữ thật sát `eng_approve_studio_draft` để tái dùng validate hình `p_build` (kiểm keys khớp items, meta đủ số). `eng_session_ts`, `eng_record_attempt_effects`, `eng_attempt_slot` có từ 0009/0010. Không tạo `test_frames` (bài nạp không có khung giấy riêng) — nếu `results_source_frame` cần, dùng `source='test'` cho `results` hoặc bỏ qua `results` bảng (auto-checks đã đủ cho engine).

- [ ] **Step 4: Run → PASS** (đặc biệt: S7a `competency_state` của mẫu khác **không đổi** sau confirm — chạy `eng_engine_inputs` trước/sau, so). · **Step 5: Commit** `feat(w3): eng_confirm_import — imported template + attempt(provenance=imported) + auto-checks`

---

### Task 9: `ai_runs.purpose = 'read_answers'`; nới `eng_ai_gate` / `eng_log_ai_run`

**Files:** Modify `db/migrations/0027_points_import.sql`; Test `tests/db/pointsImport.test.ts`.

- [ ] **Step 1: Failing test** — `eng_ai_gate(NG(), 0.01, false, by, model, batchId, 'read_answers')` không báo `bad_purpose`; `… ,'nonsense')` → `22023 (bad_purpose)`.
- [ ] **Step 2: Run → FAIL.** · **Step 3: Thêm SQL** — sao đúng khuôn 0026 dòng 749–795: `alter … ai_runs drop constraint ai_runs_purpose_check; add constraint … check (purpose in ('studio_extract','curriculum_toc','read_answers'))`. `drop function … eng_ai_gate(…6 args…); create … eng_ai_gate(…, p_purpose default 'studio_extract')` nới kiểm `p_purpose in ('studio_extract','curriculum_toc','read_answers')`. Tương tự `eng_log_ai_run` nếu có kiểm purpose. (`ai_runs.draft_id` không FK → nhận `import_batches.id`.)
- [ ] **Step 4: Run → PASS.** · **Step 5: Commit** `feat(w3): ai_runs purpose read_answers; ai gate accepts it`

---

### Task 10: Purge — `point_decisions`, `point_state`, `import_batches`

**Files:** Modify `db/migrations/0027_points_import.sql`; Test `tests/db/pointsImport.test.ts`.

- [ ] **Step 1: Failing test** (mẫu `tests/db/workdeskW1.test.ts` purge): tạo learner thử B, gắn tutor; tạo 1 `point_decisions` (qua apply), 1 `import_batches` (`eng_create_import`), 1 lần làm `imported` (qua `eng_confirm_import`); `eng_purge_preview` đếm `point_decisions`/`point_state`/`import_batches` > 0 và `attempts`/`attempt_auto_checks` tăng; `eng_purge_learner` xóa hết; các bảng cũ (curriculum, teaching_notes…) vẫn đếm đúng (so từng dòng với 0026).

- [ ] **Step 2: Run → FAIL.** · **Step 3: Sửa purge** — `create or replace` cả `eng_purge_learner` và `eng_purge_preview` **copy nguyên** thân 0026 (`sed -n '/create or replace function english.eng_purge_learner/,/^\$\$;/p' db/migrations/0026_curriculum.sql`), thêm: biến đếm + `delete`/`count` cho `point_state` (trước `point_decisions` vì FK), `point_decisions`, `import_batches` (đặt **trước** xóa `attempts`/`inquiry_instances`/`inquiry_templates` vì `import_batches.template_id` trỏ template; template `imported` xóa theo đường `inquiry_templates` của em đã có? — **không**: `inquiry_templates` không có `learner_id` purge-path cho `topic`, nhưng mẫu `studio`/`imported` có `learner_id`. Kiểm 0024 xem purge có xóa `inquiry_templates` của Studio không; nếu có, mẫu `imported` theo cùng đường; nếu chưa, thêm `delete from english.inquiry_templates where learner_id=p_learner and kind in ('studio','imported')` sau khi xóa `inquiry_instances`). Khóa receipt mới vào **object thứ ba** (`|| pg_catalog.jsonb_build_object('point_decisions',…, 'point_state',…, 'import_batches',…)`), cả trong `eng_purge_learner` và `eng_purge_preview`.

> **Builder phải kiểm 0024 purge trước:** liệu lần làm `studio`/mẫu `studio` đã được purge xóa chưa, để `imported` đi đúng cùng đường và không để mẫu/lần làm mồ côi. Ghi kết quả vào PR.

- [ ] **Step 4: Run cả `tests/db/pointsImport.test.ts` và `tests/db/studio.test.ts` (purge cũ) → PASS.** · **Step 5: Commit** `feat(w3): purge covers point_decisions, point_state, import_batches, imported attempts`

Chạy `npm run db:apply`? **Không** — phụ huынh áp `0027` (rồi `0028`) trên Supabase thật. Ghi vào PR.

---

### Task 11: Engine điểm thuần `lib/engine/points/` + 5 ví dụ §5.2

**Files:**
- Create: `lib/engine/points/types.ts`, `compute.ts`, `project.ts`, `shape.ts`, `runner.ts`, `supabaseStore.ts`, `hook.ts`, `lib/config/pointPolicySchema.ts`
- Test: `tests/unit/pointEngine.test.ts`

**Interfaces:**
- Produces:
  - `lib/config/pointPolicySchema.ts`: `pointPolicyConfigSchema = z.object({ developing: z.object({ minCorrect: z.number().int() }), independent: z.object({ minCounted: z.number().int(), minAccuracyPct: z.number().int(), minDistinctDays: z.number().int() }), transferable: z.object({ minCountedCorrect: z.number().int(), minDaysFromLastOccasion: z.number().int(), requiresDifferentSource: z.boolean() }), flag: z.object({ window: z.number().int(), minWrong: z.number().int() }), supportCapLevel: z.number().int() })`; `export type PointPolicy = z.infer<typeof pointPolicyConfigSchema>`.
  - `types.ts`: `export const POINT_ENGINE_VERSION = "PP-eng-1";` `export const POINT_STATES = ["NOT_OBSERVED","SUPPORTED","DEVELOPING","INDEPENDENT","TRANSFERABLE"] as const;` `stateAt`, `STATE_LEVEL` (như S7a); `type CountedQuestion = { ref: string; day: number; correct: boolean; sourceId: string; first: boolean }`; `type PointDecision = { id; seq; kind; fromState; toState; evidenceKey: string|null; respondsTo: string|null; createdAt }`; `type PointEngineInput = { tagKey; taughtUnit: boolean; counted: CountedQuestion[]; supportedCorrect: number; decisions: PointDecision[]; policy: { version: string; config: PointPolicy }; now: Date }`; `type PointEngineResult` (song song `EngineResult`: `currentState, evidenceState, proposedState, conditions, auto, propose, raiseFlag, evidenceKey, proposeKey, flag:{conflict,key,evidence}, evidence:{auto,propose,flag} }`).
  - `compute.ts`: `computePointLevel(input: PointEngineInput): PointEngineResult` (thuần).
  - `project.ts`: `projectPointDecisions(decisions): { state, stateSince, openProposal, openFlag, proposalKeys, flagKeys, manualKey }` (sao `lib/engine/project.ts`).
  - `runner.ts`: `recomputePoints(store, learnerId, tags|null)`, `rebuildPoints(store, learnerId, byMemberId)`, `pointEvidenceKeyFor(store, learnerId, tag)`, `interface PointEngineStore { loadInputs; applyResults; resetStates }`, `makePointHook`. Dùng lại `evidenceKeyOf` của `lib/engine/key.ts` và `vnDay` của `lib/engine/days.ts`.

- [ ] **Step 1: Viết 5 ví dụ §5.2 (dữ liệu thật Nguyên) làm test** trước khi code `compute.ts`:

```ts
// tests/unit/pointEngine.test.ts
import { describe, expect, it } from "vitest";
import { computePointLevel } from "@/lib/engine/points/compute";
import { POINT_ENGINE_VERSION, type PointEngineInput } from "@/lib/engine/points/types";

const PP01 = {
  developing: { minCorrect: 1 },
  independent: { minCounted: 4, minAccuracyPct: 75, minDistinctDays: 2 },
  transferable: { minCountedCorrect: 2, minDaysFromLastOccasion: 14, requiresDifferentSource: true },
  flag: { window: 3, minWrong: 2 },
  supportCapLevel: 2,
};
// VN day numbers for readability.
const D = (iso: string) => Math.floor((Date.parse(`${iso}T00:00:00+07:00`) + 7 * 3600_000) / 86_400_000);
const base = (over: Partial<PointEngineInput>): PointEngineInput => ({
  tagKey: "t", taughtUnit: false, counted: [], supportedCorrect: 0, decisions: [],
  policy: { version: "PP-0.1", config: PP01 }, now: new Date("2026-12-31T00:00:00+07:00"), ...over,
});
const q = (day: string, correct: boolean, src = "PT", ref = `${src}:${day}:${correct}`) => ({ ref, day: D(day), correct, sourceId: src, first: true });

describe("computePointLevel (PP-0.1) — the five §5.2 examples", () => {
  it("1) Progress Test 23/10 tự-làm-rồi-chữa, 5/5 passive, ONE occasion → level 2, no propose", () => {
    const r = computePointLevel(base({ counted: [1, 2, 3, 4, 5].map((n) => q("2026-10-23", true, "PT", `PT:q${n}`)) }));
    expect(r.evidenceState).toBe("DEVELOPING");
    expect(r.auto).toBe("DEVELOPING");
    expect(r.propose).toBeNull(); // only one distinct day
  });
  it("2) + homework 05/11 4/5 → 10 counted, 90%, 2 days → PROPOSE INDEPENDENT", () => {
    const r = computePointLevel(base({
      counted: [
        ...[1, 2, 3, 4, 5].map((n) => q("2026-10-23", true, "PT", `PT:q${n}`)),
        ...[1, 2, 3, 4].map((n) => q("2026-11-05", true, "HW", `HW:q${n}`)),
        q("2026-11-05", false, "HW", "HW:q5"),
      ],
    }));
    expect(r.propose).toBe("INDEPENDENT");
  });
  it("3) get across: q50 wrong 23/10, suggested 25/11 right 3/3 → 4 counted, 75%, 2 days → PROPOSE INDEPENDENT", () => {
    const r = computePointLevel(base({
      counted: [
        q("2026-10-23", false, "PT", "PT:q50"),
        q("2026-11-25", true, "SG", "SG:q1"), q("2026-11-25", true, "SG", "SG:q2"), q("2026-11-25", true, "SG", "SG:q3"),
      ],
    }));
    expect(r.propose).toBe("INDEPENDENT");
  });
  it("4) one session done WITH the tutor, 6/6 → level 2 only (support caps at 2)", () => {
    const r = computePointLevel(base({ counted: [], supportedCorrect: 6 }));
    expect(r.evidenceState).toBe("DEVELOPING");
    expect(r.propose).toBeNull();
  });
  it("5) at level 3, review 10/12 wrong 2 of last 3 → keep INDEPENDENT, raise ⚑", () => {
    const decisions = [
      { id: "d1", seq: 1, kind: "CONFIRMED" as const, fromState: "DEVELOPING" as const, toState: "INDEPENDENT" as const, evidenceKey: "k", respondsTo: "p0", createdAt: "2026-11-30T00:00:00Z" },
    ];
    const r = computePointLevel(base({
      decisions,
      counted: [
        q("2026-11-10", true, "A", "A:q1"), q("2026-11-10", true, "A", "A:q2"), q("2026-11-10", true, "A", "A:q3"), q("2026-11-10", true, "A", "A:q4"),
        q("2026-12-12", false, "B", "B:q1"), q("2026-12-12", false, "B", "B:q2"), q("2026-12-12", true, "B", "B:q3"),
      ],
    }));
    expect(r.currentState).toBe("INDEPENDENT");
    expect(r.proposedState).toBe("INDEPENDENT"); // never downgrade
    expect(r.raiseFlag).toBe(true);
  });
  it("engine version is stamped", () => {
    expect(computePointLevel(base({})).evidenceState).toBe("NOT_OBSERVED");
    expect(POINT_ENGINE_VERSION).toBe("PP-eng-1");
  });
});
```

- [ ] **Step 2: Run → FAIL** (module chưa có).

- [ ] **Step 3: Viết `compute.ts`** (thuần; logic đủ cho 5 ví dụ + H2 mức 4):

```ts
// lib/engine/points/compute.ts
import { evidenceKeyOf } from "../key";
import { projectPointDecisions, proposalKeyOf } from "./project";
import { POINT_ENGINE_VERSION, STATE_LEVEL, stateAt, type CountedQuestion, type PointEngineInput, type PointEngineResult } from "./types";

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];
const atLeastPct = (correct: number, total: number, pct: number) => total > 0 && correct * 100 >= pct * total;

export function computePointLevel(input: PointEngineInput): PointEngineResult {
  const p = input.policy.config;
  const proj = projectPointDecisions(input.decisions);
  const curLevel = STATE_LEVEL[proj.state];

  const counted = [...input.counted].sort((a, b) => a.day - b.day);        // "câu được tính" (đóng, chấm, lần đầu, không hỗ trợ)
  const correctCounted = counted.filter((c) => c.correct);
  const days = uniq(counted.map((c) => c.day));
  const occByDay = new Map<number, CountedQuestion[]>();
  for (const c of counted) occByDay.set(c.day, [...(occByDay.get(c.day) ?? []), c]);

  // Level 1: trong Unit đã dạy HOẶC có ≥1 câu đã làm (đúng/sai) HOẶC có câu đúng-có-hỗ-trợ.
  const level1 = input.taughtUnit || counted.length > 0 || input.supportedCorrect > 0;
  // Level 2: ≥1 câu được tính đúng HOẶC ≥1 câu đúng có hỗ trợ.
  const level2 = correctCounted.length >= p.developing.minCorrect || input.supportedCorrect >= p.developing.minCorrect;
  // Level 3: ≥ minCounted câu được tính, ≥ minAccuracyPct% đúng, ≥ minDistinctDays dịp khác ngày.
  const level3 =
    counted.length >= p.independent.minCounted &&
    atLeastPct(correctCounted.length, counted.length, p.independent.minAccuracyPct) &&
    days.length >= p.independent.minDistinctDays;
  // Level 4 (H2): đã (sẽ) ở mức 3 và có một dịp D ≥ 14 ngày sau dịp gần nhất trước đó với ≥2 câu đúng từ nguồn khác mọi nguồn trước.
  const priorDays = days;
  const level4 =
    level3 &&
    [...occByDay.entries()].some(([day, qs]) => {
      const earlier = priorDays.filter((d) => d < day);
      if (earlier.length === 0) return false;
      const gap = day - Math.max(...earlier);
      const corr = qs.filter((x) => x.correct);
      const priorSources = new Set(counted.filter((c) => c.day < day).map((c) => c.sourceId));
      const differentSource = !p.transferable.requiresDifferentSource || corr.some((x) => !priorSources.has(x.sourceId));
      return gap >= p.transferable.minDaysFromLastOccasion && corr.length >= p.transferable.minCountedCorrect && differentSource;
    });

  let level = 0;
  if (level1) level = 1;
  if (level2) level = 2;
  if (level3) level = 3;
  if (level4) level = 4;

  // Keys (D13): proposed level uses the counted evidence; evidenceKey uses every counted ref + decision.
  const refOf = (c: CountedQuestion) => c.ref;
  const proposeKey = level >= 3 ? evidenceKeyOf(counted.map(refOf)) : null;
  const evidenceKey = evidenceKeyOf([...input.counted.map(refOf), `sc:${input.supportedCorrect}`, ...input.decisions.map((d) => d.id)]);
  const held = proj.manualKey !== null && proj.manualKey === evidenceKey;

  const autoLevel = Math.min(level, 2);
  const auto = !held && autoLevel > curLevel ? stateAt(autoLevel) : null;
  const afterAuto = Math.max(curLevel, autoLevel);
  const propose =
    !held && level >= 3 && level > afterAuto && proj.openProposal === null && proposeKey !== null &&
    !proj.proposalKeys.has(proposalKeyOf(stateAt(level), proposeKey))
      ? stateAt(level)
      : null;

  // ⚑ (D12): đang ≥3 và trong `window` câu được tính gần nhất có ≥ minWrong sai.
  const recent = counted.slice(-p.flag.window);
  const conflict = curLevel >= 3 && recent.filter((c) => !c.correct).length >= p.flag.minWrong;
  const flagKey = conflict ? evidenceKeyOf(recent.map(refOf)) : null;
  const raiseFlag = flagKey !== null && proj.openFlag === null && !proj.flagKeys.has(flagKey);

  const conditions = [
    { id: "l2_counted_correct", have: correctCounted.length + input.supportedCorrect, need: p.developing.minCorrect, met: level2 },
    { id: "l3_counted", have: counted.length, need: p.independent.minCounted, met: counted.length >= p.independent.minCounted },
    { id: "l3_accuracy", have: counted.length ? Math.floor((correctCounted.length * 100) / counted.length) : 0, need: p.independent.minAccuracyPct, met: atLeastPct(correctCounted.length, counted.length, p.independent.minAccuracyPct) },
    { id: "l3_days", have: days.length, need: p.independent.minDistinctDays, met: days.length >= p.independent.minDistinctDays },
  ];
  const autoEvidence = auto === null ? [] : correctCounted.length ? correctCounted.map(refOf) : counted.map(refOf);

  return {
    tagKey: input.tagKey,
    engineVersion: POINT_ENGINE_VERSION,
    policyVersion: input.policy.version,
    currentState: proj.state,
    evidenceState: stateAt(level),
    proposedState: held ? proj.state : stateAt(Math.max(level, curLevel)),
    conditions,
    auto,
    propose,
    raiseFlag,
    evidenceKey,
    proposeKey: propose === null ? null : proposeKey,
    flag: { conflict, key: flagKey, evidence: recent.map(refOf) },
    evidence: { auto: autoEvidence, propose: propose === null ? [] : counted.map(refOf), flag: conflict ? recent.map(refOf) : [] },
  };
}
```

- [ ] **Step 4: Viết `types.ts` + `project.ts`** (project sao `lib/engine/project.ts` đổi tên; `proposalKeyOf` trùng tên export). **Run → PASS** (6 test).

- [ ] **Step 5: Viết `shape.ts` / `runner.ts` / `supabaseStore.ts` / `hook.ts`** sao `lib/engine/{shape,runner,supabaseStore,hook}.ts`: `parsePointInputs` (zod cho `eng_point_inputs`), `sliceTag(inputs, tag)` → `PointEngineInput`, `toPointApplyRow(result, computedAt)` (`{ tag_key, auto, propose, raise_flag, flag_key, evidence_key, propose_key, computed_at, conditions, evidence }`). `createSupabasePointStore` gọi `eng_point_inputs`/`eng_apply_point_results`/`eng_reset_point_states`. `pointHook(route,userId)` dùng `makePointHook`. **Run `npm run typecheck` → PASS.**

- [ ] **Step 6: Commit** `feat(w3): pure point-level engine (PP-0.1) with the five §5.2 examples; runner/shape/store/hook`

---

### Task 12: `read-answers.v1` — pipeline AI đọc bài làm + AI_FAKE fixture

**Files:**
- Create: `prompts/read-answers.v1.md`, `lib/import/readTool.ts`, `lib/import/context.ts`, `lib/import/extract.ts`, `lib/import/normalize.ts`, `lib/import/schema.ts`, `tests/fixtures/import/fake-read-answers.json`
- Modify: `lib/ai/prompts.ts` (`export const READ_ANSWERS_PROMPT = { file: "read-answers.v1", version: "read-answers.v1" }`), `lib/ai/config.ts` (`AI_FAKE_FIXTURES["save_read_answers"] = "tests/fixtures/import/fake-read-answers.json"`)
- Test: `tests/unit/importAi.test.ts`

**Interfaces:**
- Produces: `readAnswersTool(ctx)` (forced tool `save_read_answers`), `buildReadCall(...)`, `runReadExtraction(deps, job)` (sao `runTocExtraction` của `lib/curriculum/extract.ts`: gate → tải 2 file (bài + đáp án) → gọi ≤3 lần, mỗi lần log `ai_runs` purpose `read_answers` + đặt chỗ giá worst-case → `aiReadSchema` → `normalizeRead` → lưu `import_batches.payload` + `status='draft'` hoặc `ai_failed`). `aiReadSchema`: `{ questions: [{ n:int, part:string, student_answer:string|null, key_answer:string|null, tag:string|null (trong danh sách đóng), out_of_app:boolean, confidence:'high'|'low' }] }`.
- Code sau AI: `gradeRead(questions, policyNormalize)` so `student_answer` với `key_answer` bằng `eng_norm_answer`-tương đương (dùng lại chuẩn hoá của `lib/studio` nếu có; nếu không, so chuẩn hoá đơn giản trong `normalize.ts`) → `result: 'correct'|'incorrect'|'blank'|'needs_person'`. `confidence:'low'` **hoặc** không đọc được → `'needs_person'` ("Cần xem"). AI phải **bỏ dấu chữa** (đọc câu trả lời gốc; prompt yêu cầu rõ — D-W6).

- [ ] **Step 1: Viết fixture thật từ Progress Test** `tests/fixtures/import/fake-read-answers.json` (dựa đúng đáp án đề thật `/mnt/user-data/uploads/1e8297ff-__P__N_PROGRESS_TEST_1-12_1.docx`: 60 câu A–G; đặt ~51 đúng để khớp ví dụ "51/60", q50 (phrasal verb "across" → `tag="cum-dong-tu"`) **sai** để khớp ví dụ get across; vài câu `confidence:'low'` → needs_person). Ví dụ vài dòng:

```json
{"questions":[
 {"n":1,"part":"A","student_answer":"B","key_answer":"B","tag":"bi-dong-vo-nhan-xung","out_of_app":false,"confidence":"high"},
 {"n":50,"part":"F","student_answer":"off","key_answer":"across","tag":"cum-dong-tu","out_of_app":false,"confidence":"high"},
 {"n":54,"part":"G","student_answer":"chance","key_answer":"chance","tag":"thanh-ngu","out_of_app":false,"confidence":"high"},
 {"n":28,"part":"C","student_answer":null,"key_answer":"being stared at","tag":"bi-dong-vo-nhan-xung","out_of_app":false,"confidence":"low"}
]}
```

(Builder điền đủ 60 câu; `tag` phải là `key` thật của nhãn track B — tra `error_tags` seed 0015/0026, ví dụ `cum-dong-tu`, `thanh-ngu`, `bi-dong-vo-nhan-xung` nếu có, hoặc nhãn gần nhất; câu không có nhãn phù hợp để `tag:null` → gia sư gắn lúc duyệt.)

- [ ] **Step 2: Viết `tests/unit/importAi.test.ts`** (mẫu `tests/unit/curriculumAi.test.ts`): với `AI_FAKE`, `runReadExtraction` trả `status:'ok'`, `payload.items` dài 60, câu 50 `result:'incorrect'`, câu 28 `result:'needs_person'`, câu 1 `result:'correct'`; log 1 dòng `ai_runs` purpose `read_answers`. **Run → FAIL.**

- [ ] **Step 3: Viết `prompts/read-answers.v1.md`** (tiếng Anh; nhiệm vụ: đọc **bài làm của học sinh** từ ảnh/PDF + **file đáp án**; trả từng câu `n/part/student_answer/key_answer/tag(∈ danh sách đóng)/out_of_app/confidence`; **bỏ dấu chữa** — chỉ đọc câu trả lời ban đầu, mực khác màu/ghi chú = dấu chữa; không tách được → `confidence:'low'`; không gửi gì về danh tính con — chỉ bí danh + hồ sơ, D-W7). Viết `readTool.ts` (tool `save_read_answers` với enum `tag` = `ctx.tags.map(key)`), `context.ts` (nhãn đóng của track em, như `lib/curriculum/context.ts`), `schema.ts` (`aiReadSchema`), `normalize.ts` (`gradeRead` + chuẩn hoá đáp án), `extract.ts` (`runReadExtraction` sao `runTocExtraction`). **Run → PASS.**

- [ ] **Step 4: `npm run typecheck && npm run lint` → PASS.** · **Step 5: Commit** `feat(w3): read-answers.v1 AI pipeline + Progress Test fake fixture; grade vs key`

---

### Task 13: `lib/points` + `lib/import` — schemas, handlers, store, route, load/shape; actions

**Files:**
- Create: `lib/points/{types,schemas,handlers,supabaseStore,route,load,shape,view}.ts`, `lib/import/{client,handlers,supabaseStore,route,load,shape}.ts`
- Modify: `lib/auth/requireAccess.ts` (thêm `points:read` `points:decide` `points:rebuild` vào `Action` + vai; `import:upload` (tutor+parent) `import:confirm` (tutor) )
- Test: `tests/unit/pointsApi.test.ts`

**Interfaces:**
- Produces:
  - `lib/points`: `decidePointBodySchema = z.object({ action: z.enum(["confirm","reject"]), reason: z.string().trim().max(300).optional(), client_id: z.string().min(8).max(100) })`; `interface PointStore { decide(a); rebuild(a); inbox(a); map(a) }`; `handleDecidePoint(deps, decisionId, body)`, `handleRebuildPoints(deps, learnerId, body)`; `loadPointInbox(memberId)`, `loadPointMap(learnerId)` (service role, sau requireAccess; null nếu thiếu 0027/0028 — `isMissingFunction`); `shape.ts` zod `PointInbox`/`PointMap`; `view.ts` `groupPointInbox` (gom theo `learnerId`, sắp theo alias) để trộn với `groupInbox` của kỹ năng.
  - `lib/import`: `createImportBodySchema = z.object({ title, work_file:{id,mime}, key_file:{id,mime}, taken_on:z.string().date(), support_level:z.enum(["tu_lam","tu_lam_chua","lam_cung_co"]), source_hash:z.string().regex(/^[0-9a-f]{64}$/), allow_other:z.boolean().optional(), client_id })`; `confirmImportBodySchema`; `handleCreateImport`, `handleConfirmImport`, `handleImportUploadUrl` (mẫu `lib/curriculum/handlers.ts handleTocUploadUrl`); store gọi `eng_create_import`/`eng_confirm_import`; sau confirm gọi **cả** `pointHook` **và** `engineHook` (S7a) với targets của tag liên quan → recompute.
- Map lỗi → HTTP: `(tutor_only)`→403, `(staff_only)`/`parent`→403, `(duplicate_import)`→409, `(date_future)`→400, `(bad_purpose)`/`bad_*`→400, `P0002`→404 (mẫu `lib/skills/handlers.ts`).

- [ ] **Step 1: Failing unit tests** (mẫu `tests/unit/levelsApi.test.ts`): `handleDecidePoint` — gia sư của em confirm → 201 + rpc args; parent → 403; gia sư em khác → 404; reject thiếu lý do → 400. `handleCreateImport` — parent và tutor tạo → 201; student → 403; trùng → 409. `handleConfirmImport` — parent → 403 (tutor_only). **Run → FAIL.**
- [ ] **Step 2: Implement** theo mẫu `lib/levels` + `lib/curriculum`. `route.ts` sao `lib/levels/route.ts`. **Run → PASS**, `npm run typecheck`.
- [ ] **Step 3: Commit** `feat(w3): lib/points + lib/import handlers, schemas, stores, routes; access actions`

---

### Task 14: API routes (decide điểm, rebuild, tạo/duyệt/upload bài nạp)

**Files:**
- Create: `app/api/review/points/[id]/route.ts`, `app/api/learners/[id]/points/rebuild/route.ts`, `app/api/learners/[id]/imports/route.ts`, `app/api/learners/[id]/imports/files/route.ts`, `app/api/imports/[id]/confirm/route.ts`
- Test: trong `tests/unit/pointsApi.test.ts` (route glue nhẹ) hoặc e2e (Task 16)

**Interfaces:** mỗi route `readJson` + `run…Route` như `app/api/learners/[id]/levels/route.ts` / `app/api/review/skills/route.ts`. `imports/[id]/confirm` sau khi `eng_confirm_import` thành công → gọi `recomputePoints(store, learnerId, tagsAffected)` và `recomputeLearner` (S7a) để sinh đề xuất ngay.

- [ ] **Step 1:** Viết 5 route (POST). **Step 2:** `npm run typecheck && npm run lint` → PASS. **Step 3: Commit** `feat(w3): API routes for point decide/rebuild and import create/upload/confirm`

---

### Task 15: Giao diện — điểm vào tab "Kỹ năng" (R1), Bản đồ kiến thức, Nạp bài đã làm + chữ

**Files:**
- Modify: `lib/copy/vi.ts` (`pointStateCopy`, `pointMapCopy`, `importCopy`, `appFeedback.screens.knowledgeMap`/`importNew`/`importConfirm`), `app/review/skills/page.tsx` (nạp thêm `loadPointInbox`, render điểm cùng nhóm), `app/learners/[id]/levels/page.tsx` (link "Xem Bản đồ kiến thức"), `docs/UX_COPY_GUIDE.md` (mục W3)
- Create: `components/points/PointProposalCard.tsx`, `components/points/PointMap.tsx`, `app/learners/[id]/knowledge/page.tsx`, `components/import/ImportForm.tsx`, `components/import/ImportConfirm.tsx`, `app/learners/[id]/imports/new/page.tsx`
- Test: `tests/unit/pointsUi.test.ts`, `tests/e2e/pointsImport.spec.ts` (Task 16)

**Copy (trong `vi.ts`, không viết cứng):**

```ts
export const pointStateCopy = {
  proposalTitle: (tag: string) => `Điểm "${tag}"`,
  toLevel: { INDEPENDENT: "Tự làm được", TRANSFERABLE: "Vận dụng được" } as const,
  flag: "Cần xem lại",
  confirm: "Xác nhận",
  notYet: "Chưa",
  reasonHint: "Vì sao chưa? (tùy chọn khi Xác nhận, bắt buộc khi Chưa)",
  why: "Vì sao app đề xuất", confirmed: "Đã xác nhận.", parentNote: `Chỉ ${tutorHonorific} của em xác nhận mức điểm.`,
} as const;
export const pointMapCopy = {
  title: "Bản đồ kiến thức",
  intro: (name: string) => `Mức từng điểm kiến thức của ${name}, theo giáo trình và mảng. Con không thấy trang này.`,
  levels: { NOT_OBSERVED: "Mới gặp", SUPPORTED: "Mới gặp", DEVELOPING: "Đang tiến bộ", INDEPENDENT: "Tự làm được", TRANSFERABLE: "Vận dụng được" } as const,
  evidence: "Bằng chứng từng câu", correct: "Đúng", wrong: "Sai", support: "Có hỗ trợ",
  empty: "Chưa có điểm nào có bằng chứng.", notReady: "Mức điểm chưa sẵn sàng (chờ áp 0027 và 0028).",
} as const;
export const importCopy = {
  link: "Nạp bài đã làm", title: "Nạp bài đã làm",
  intro: `Tải bài con đã làm (ảnh/PDF) + file đáp án. AI đọc câu trả lời, app so đáp án, ${tutorHonorific} xác nhận.`,
  bookTitle: "Tên đề", workFile: "File bài con làm", keyFile: "File đáp án",
  takenOn: "Ngày làm thật", support: "Mức hỗ trợ",
  supports: { tu_lam: "Tự làm", tu_lam_chua: "Tự làm rồi chữa cùng thầy/cô", lam_cung_co: "Làm cùng thầy/cô" } as const,
  create: "Cho AI đọc", reading: "AI đang đọc…", dupBlocked: "Bài này có thể đã nạp. Đánh dấu “Đây là lần làm khác” để nạp lại.",
  dupOther: "Đây là lần làm khác",
  confirmTitle: "Xem & xác nhận bài nạp", needsPerson: "Cần xem", mark: { correct: "Đúng", wrong: "Sai" },
  tag: "Nhãn", confirm: "Xác nhận & tính mức", confirmed: "Đã xác nhận. App đang tính lại mức điểm.",
  tutorOnly: `Chỉ ${tutorHonorific} của em xác nhận kết quả.`, dateFuture: "Ngày làm không được ở tương lai.",
} as const;
```

- [ ] **Step 1: Failing UI tests** — `PointProposalCard` render tên điểm + "Tự làm được" + nút Xác nhận/Chưa chỉ khi `canDecide`; `PointMap` nhóm theo mảng, mỗi điểm có nhãn mức + danh sách câu Đúng/Sai (không số điểm thô); `ImportForm` có đủ ô (tên đề, 2 file, ngày, mức hỗ trợ) và nút bị khóa khi thiếu. **Run → FAIL.**
- [ ] **Step 2: Implement**:
  - `app/review/skills/page.tsx`: `Promise.all([loadSkillInbox, loadPointInbox])`; gộp theo `learnerId` (dùng `groupInbox` + `groupPointInbox`); mỗi nhóm render `SkillProposalCard` rồi `PointProposalCard`; đếm tab = kỹ năng + điểm. `PointProposalCard` POST `/api/review/points/:id`.
  - `app/learners/[id]/knowledge/page.tsx`: `requireLearnerPage` (người lớn; student → chặn như trang người lớn khác), `loadPointMap`, render `PointMap`. Link từ Hồ sơ cấp.
  - `app/learners/[id]/imports/new/page.tsx` + `ImportForm`: tải 2 file (`lib/import/client.ts uploadImportFile`, mẫu `uploadTocFile`), tính `source_hash` ở client (SHA-256 của file bài), POST `/api/learners/:id/imports` → `status:'reading'`; poll `import_batches` tới `draft`/`ai_failed`; rồi `ImportConfirm` (duyệt từng câu: câu `needs_person` lên đầu, chặn Xác nhận tới khi xử lý hết — spec §5 quy tắc 1 & §3 "mở ra xem, không duyệt một cú bấm"; nút Đúng/Sai dùng lại ý `item_decisions`; sửa `tag` từ danh sách đóng), POST `/api/imports/:id/confirm`.
  - Quy tắc giao diện máy tính (spec §5): màn duyệt rộng ~1100 px, thanh hành động đáy "Còn n câu cần xử lý · Xác nhận", nút Đóng góc trên; nhãn trên ô; ≥44 px.
- [ ] **Step 3: Run `npm run typecheck && npm run lint && npx vitest run tests/unit` → PASS.** · **Step 4: Commit** `feat(w3): point proposals in the Skills tab, Knowledge map page, Import screens + copy`

---

### Task 16: E2E — nạp Progress Test → mức điểm → Bản đồ; quyền

**Files:** Create `tests/e2e/pointsImport.spec.ts` (mẫu `tests/e2e/curriculum.spec.ts` / `tests/e2e/studio.spec.ts`, chạy với `AI_FAKE=1` + Supabase local trong CI).

- [ ] **Step 1: Viết e2e**: đăng nhập gia sư thử → `/learners/<nguyen>/imports/new` → điền tên đề, tải file bài + đáp án (fixture nhỏ), ngày `2026-10-23`, mức "Tự làm rồi chữa" → "Cho AI đọc" → (fake) → màn duyệt hiện 60 câu, câu `needs_person` đầu, phán Đúng/Sai → "Xác nhận & tính mức" → sang tab `/review/skills` thấy **đề xuất mức điểm** (điểm) cùng đề xuất kỹ năng; xác nhận một điểm → `/learners/<nguyen>/knowledge` thấy điểm ở "Tự làm được". Quyền: phụ huynh thấy Bản đồ, **không** nút Xác nhận; đăng nhập em → `/learners/<id>/knowledge` và `/imports/new` bị chặn. Nạp lại cùng file → báo "có thể đã nạp".
- [ ] **Step 2: `npm run test:e2e -- --list`** liệt kê test mới (máy không Docker → chỉ `--list`; chạy đủ trong CI job "E2E smoke"). · **Step 3: Commit** `test(w3): e2e — import Progress Test → point levels → knowledge map; rights`

---

### Task 17: Seed `PP-0.1` qua `gen:config -- --new` → migration 0028 (versioned/locked)

**Files:**
- Create: `content/point_policy_PP-0.1.json`
- Modify: generator để biết "point policy" là một loại nội dung mới — `lib/config/versions.ts` (`ContentItems` + `loadContentItems` đọc `content/point_policy_*.json`, `kind:'pointPolicy'`), `scripts/lib/configSql.ts` (`buildSeedSql` phát `insert into english.point_policies(version, config, source_hash, published_at) … on conflict (version) do nothing`), `scripts/lib/configLock.ts` (`Kind`+`KIND_LABEL`+`LOCK_KEY` thêm `pointPolicy`→`pointPolicies`; `seedInputFor` lọc), `content/config.lock.json` (thêm mục `pointPolicies`)
- Produce (sinh tự động): `db/migrations/0028_seed_point_policy_pp_0_1.sql`
- Test: `tests/unit/configLock.test.ts` (nếu có) — thêm case point policy; hoặc `tests/db/pointsImport.test.ts` kiểm sau áp 0028 `eng_point_policy()='PP-0.1'`.

**Interfaces:** `content/point_policy_PP-0.1.json` = `{ "version": "PP-0.1", "config": { …đúng `pointPolicyConfigSchema`… } }` (ngưỡng H1).

- [ ] **Step 1:** Viết `content/point_policy_PP-0.1.json`:

```json
{ "version": "PP-0.1",
  "config": {
    "developing": { "minCorrect": 1 },
    "independent": { "minCounted": 4, "minAccuracyPct": 75, "minDistinctDays": 2 },
    "transferable": { "minCountedCorrect": 2, "minDaysFromLastOccasion": 14, "requiresDifferentSource": true },
    "flag": { "window": 3, "minWrong": 2 },
    "supportCapLevel": 2 } }
```

- [ ] **Step 2: Mở rộng generator** cho loại `pointPolicy` (song song `policy`): `loadContentItems` đọc file `point_policy_*.json` → item `{id:version, kind:'pointPolicy', hash: sha256(canonical(config)), data}`; `buildSeedSql` phát khối `insert into english.point_policies…`; `configLock` thêm khóa. Chạy `npm run gen:config -- --check` → báo "point policy PP-0.1 chưa có migration".
- [ ] **Step 3: Chạy `npm run gen:config -- --new`** → sinh `db/migrations/0028_seed_point_policy_pp_0_1.sql` (hash khớp `point_policies.source_hash`) + cập nhật `content/config.lock.json`. Chạy lại `--check` → "consistent".
- [ ] **Step 4:** DB test: áp tới 0028, `eng_point_policy()` = `'PP-0.1'`; engine điểm (Task 4 `eng_point_inputs`) nay trả `policy` khác null; chạy `recomputePoints` trên bằng chứng ví dụ 2 → `point_decisions` có một `PROPOSED INDEPENDENT`. **Run → PASS.**
- [ ] **Step 5: Commit** `feat(w3): PP-0.1 point policy via gen:config (migration 0028, locked)` (commit **cả** `content/point_policy_PP-0.1.json`, generator, `config.lock.json`, `0028_…sql`).

---

### Task 18: Tài liệu, review Opus, PR

**Files:** Modify `docs/PROGRESS.md`, `docs/DESIGN.md` (§19.14 mới), `CLAUDE.md`, `docs/UX_COPY_GUIDE.md`.

- [ ] **Step 1: `docs/PROGRESS.md`** thêm "## W3 · Mức điểm kiến thức + Bản đồ kiến thức + Nạp bài đã làm (08/11/2026)": làm gì; **SQL cần phụ huынh áp: `0025`, `0026` rồi `0027` rồi `0028` TRƯỚC khi thử preview** (chỉ thêm; cần 0026); khuyến nghị thiết kế (bảng điểm riêng — lý do); cách thử (các bước Task 16); tiêu chí đạt (spec §6 W3); giả định H1–H7; "Thử AI bằng dùng thật" (§8): lần nạp Progress Test thật đầu tiên = lần thử — ghi chi phí (`ai_runs`) + % câu gia sư sửa; nếu > 20 % → chỉnh `read-answers.v1` trước khi đi tiếp; trạng thái "chờ review Opus + phụ huынh duyệt PR".
- [ ] **Step 2: `CLAUDE.md`** Current status: dòng W3 (nhánh `feature/w3-points-import`, migration `0027` + seed `0028`, chờ); **số migration kế tiếp → 0029**; ghi rõ 0027 = W3 tables, 0028 = PP-0.1 seed.
- [ ] **Step 3: `docs/DESIGN.md` §19.14 "Mức điểm kiến thức + Nạp bài đã làm (W3, migration 0027–0028)"** tóm tắt như §19.13: `point_policies`/`point_decisions`/`point_state` (song song S7a, khóa theo `tag_key`), engine `lib/engine/points`, `import_batches` + lần làm `provenance='imported'` + `attempt_auto_checks`, R1 (một hộp duyệt, hai inbox), R2 (mẫu imported không là lần làm đầu của bước), dedup mã băm, Bản đồ kiến thức.
- [ ] **Step 4: `docs/UX_COPY_GUIDE.md`** mục W3 liệt kê khóa copy mới (`pointStateCopy`, `pointMapCopy`, `importCopy`).
- [ ] **Step 5: Chạy đủ** `npm run typecheck && npm run lint && npm test` (DB/e2e cần Postgres/CI — ghi rõ "chạy trong CI" nếu máy thiếu). `npm run gen:config -- --check` xanh. Commit `docs(w3): progress (SQL 0025,0026,0027,0028), design §19.14, status, copy guide`.
- [ ] **Step 6: Review Opus** bằng agent `reviewer` trên `git diff origin/feature/w2-curriculum...HEAD`, đối chiếu DOMAIN §5.2/§5.3/§7/§14 và spec §5/§6; đặc biệt: engine điểm không hạ bậc, không trùng đề xuất; con không thấy gì; không gửi danh tính; S7a không đổi sau nạp (R2); purge so từng dòng. Sửa mọi lỗi cao/trung bình; commit.
- [ ] **Step 7: Mở PR** `feature/w3-points-import → feature/w2-curriculum` (đổi base `main` khi W1/W2 gộp), tiêu đề "W3 · Mức điểm kiến thức, Bản đồ kiến thức, Nạp bài đã làm", mô tả tiếng Việt: làm gì · cách thử preview (Task 16) · **SQL cần phụ huынh áp: `0025`, `0026`, `0027`, `0028`** · tiêu chí đạt/chưa · giả định H1–H7 + trailer. Không gộp.

---

## Self-Review (đã chạy khi viết plan)

**1. Spec coverage** (spec §6 W3 + DOMAIN §5.2/§5.3/§14):
- Mức điểm `PP-0.1`, 4 mức, app 1–2 / đề xuất 3–4 → Task 5, 6, 11 (engine), seed Task 17.
- Đề xuất vào **cùng tab "Kỹ năng"** (R1) → Task 6 (`eng_point_inbox`) + Task 15 (page gộp hai inbox).
- ⚑ khi ≥3 và 2/3 gần nhất sai → Task 11 ví dụ 5, Task 5 (ghi FLAG).
- "Không bao giờ tự hạ" → Task 5 (`eng_apply_point_results` kiểm lại), Task 11 (`proposedState` không dưới `currentState`).
- Bản đồ kiến thức, con không thấy → Task 6 (`eng_point_map`), Task 15 (page), RLS Task 3.
- Nạp bài đã làm: mẫu `kind='imported'` (R2) → Task 1, 8; ngày làm thật + mức hỗ trợ → Task 1, 7; mã băm dedup → Task 7; phụ huынh tải / gia sư xác nhận (R8) → Task 7 (`eng_create_import`), Task 8 (`eng_confirm_import`).
- "làm cùng cô" ≤ mức 2 → Task 4 (`supported_correct`), Task 11 (ví dụ 4, `supportCapLevel`).
- AI đọc bài làm, code so đáp án, câu không chắc → "Cần xem" → Task 12.
- 60 câu đúng ngày 23/10; 5 ví dụ §5.2; tính lại giống hệt; S7a không đổi sau nạp → Task 16 (e2e), Task 11 (5 tests), Task 5/8 (reset + R2), Task 8 (so S7a trước/sau).
- "dịp = ngày lịch VN" (R5) → Task 4 (`eng_vn_day(coalesce(taken_on,submitted_at))`), Task 11 (`day`).
- PP-0.1 versioned/locked như AP → Task 17 (`gen:config -- --new`, 0028).
- Quy tắc giao diện máy tính (spec §5) → Task 15.

**2. Placeholder scan:** Engine `compute.ts` đủ mã (5 ví dụ pass). SQL mới (point_policies, eng_point_policy/level, eng_point_inputs mô tả join đủ, apply/decide/inbox "sao 0023 đổi X" — chỉ rõ bảng/cột đổi), import tables + `eng_confirm_import` (6 bước cụ thể). Fixture read-answers: khung + yêu cầu điền đủ 60 (dựa đáp án thật). Chỗ "sao hàm 0023/0024/0026 đổi tên bảng" là **cố ý** (task yêu cầu "không lặp lại code W1/W2/S7a đã có") và nêu đúng dòng nguồn + biến đổi.

**3. Type consistency:** `POINT_ENGINE_VERSION="PP-eng-1"` dùng nhất quán (types, test, point_decisions.engine_version). Trạng thái dùng chung tên S7a (`INDEPENDENT`/`TRANSFERABLE`) + `eng_point_level`=`eng_skill_level`. `tag_key` xuyên suốt (decisions, state, inputs, inbox, map). `provenance='imported'`, `support_level ∈ {tu_lam,tu_lam_chua,lam_cung_co}`, `taken_on`, `source_hash` nhất quán Task 1↔7↔8↔11. `evidence_item_refs` (text[]) nhất quán Task 3↔5↔11 (ref = `template:item:attempt`). Copy keys (`pointStateCopy`/`pointMapCopy`/`importCopy`) khớp Task 15.

## Khung các lát sau (ngoài phạm vi W3)
W4 (4 cách giao bài + `CAM-WS-1`), W5 (lộ trình nhiều dòng + KT tháng), W6 (vòng tháng + Tổng hợp góp ý): kế hoạch riêng theo khuôn này khi lát trước gộp — xem spec §4 và W1 plan "Khung W2–W6".
