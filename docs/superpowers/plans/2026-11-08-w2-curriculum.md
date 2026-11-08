# W2 · Giáo trình — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gia sư (hoặc phụ huynh) thêm giáo trình cho từng em, nạp PDF mục lục → AI đọc ra Unit + nối Unit → nhãn trong danh sách đóng → **gia sư của em duyệt** (bản đã duyệt bất biến, sửa = phiên bản mới) → app tính "đang học đến" + độ phủ từ sự kiện Unit; Ghi buổi chọn "Unit đã dạy hôm nay" và **đề xuất** chuyển Unit sang "Đang học" (gia sư bấm); có nhãn hạt giống dạng câu nghe (R7). Con không thấy gì mới.

**Architecture:** Một migration `0026_curriculum.sql` (chỉ thêm): 6 bảng (`curricula`, `curriculum_versions`, `curriculum_units`, `curriculum_unit_points`, `curriculum_unit_events`, `lesson_note_units`), RLS `eng_is_staff_of`, hàm ghi `security definer` (duyệt chỉ gia sư — D-W8), `eng_write_lesson_note_v3` (v1/v2 không đổi), `ai_runs.purpose` thêm `curriculum_toc` (cổng/sổ AI nhận `p_purpose` cuối, mặc định cũ), 13 nhãn nghe có `group_key` + `eng_skill_map` đặt chúng vào nhóm, purge mở rộng. Code: `lib/curriculum/` (types · schema · context · normalize · validate · progress · editStats · golden · report · tocTool · extract · shape · handlers · supabaseStore · route · load · client) theo đúng mẫu `lib/studio/`; màn `/learners/[id]/curricula`, `/learners/[id]/curricula/[curriculumId]`, `/curricula/versions/[id]` (màn duyệt rộng, thanh hành động dính đáy); Ghi buổi thêm ô chọn Unit.

**Tech Stack:** Next.js App Router · TypeScript strict · Tailwind · Supabase (schema `english`, RLS, plpgsql) · zod · Claude Messages API qua `lib/ai` (tool bắt buộc, `AI_FAKE=1` trong CI) · Vitest (unit + DB Postgres local) · Playwright (CI).

**Spec:** `docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md` (§3 màn Giáo trình, §4 W2, §5 yêu cầu chung + quy tắc giao diện máy tính, §6 W2, §8 "Thử AI bằng dùng thật") · luật: `docs/DOMAIN.md` §2 (quyền), §3 tầng B, §4 (phiên bản giáo trình), §5.1 (+ 3 ví dụ), §6 (trạng thái giáo trình), §7 bất biến, §8 ca biên, §9.2 "Đọc mục lục", §13 D-W1 D-W2 D-W8, §14 R3 R4 R7 · kế hoạch trước: `docs/superpowers/plans/2026-11-08-w1-notes-feedback.md`.

> **Đã kiểm trước khi viết kế hoạch (08/11):** toàn bộ SQL, lib, component, trang và test trong file này đã được chạy thử trên một bản sao `feature/w1-notes-feedback` (đã gộp `main` có PR #23; 0025 của W1) với Postgres local: `npx vitest run` → **130 file / 1712 test xanh** (unit + DB), `npm run typecheck` ✓, `npm run lint` ✓, `npx playwright test tests/e2e/curriculum.spec.ts --list` ✓ (E2E chỉ chạy trong CI). Hai phát hiện đã sửa sẵn trong kế hoạch: (1) `jsonb_build_object` của purge vượt **100 tham số** → khóa mới nằm ở object thứ hai nối bằng `||` (áp dụng cho mọi lát sau); (2) `eng_skill_map` của 0019 không đặt được nhãn CÓ SẴN mang `group_key` → định nghĩa lại.

## Giả định (chờ phụ huynh)

Các điểm spec / DOMAIN chưa nói rõ; kế hoạch chọn cách hợp lý nhất. Phụ huynh đổi được trước khi gộp (ghi vào PR + `docs/PROGRESS.md`).

| # | Giả định | Vì sao chọn vậy |
|---|---|---|
| G1 | **Ai làm gì:** thêm giáo trình, nạp mục lục, sửa / lưu / **bỏ** nháp, đặt trạng thái Unit = gia sư **hoặc** phụ huynh của em. **Duyệt** mục lục + bảng nối = **chỉ gia sư của em** (D-W8; DB kiểm `(tutor_only)`). | Spec yêu cầu "tutor or parent may create a curriculum and upload; approving = tutor only; parent may discard". Phụ huynh vẫn ghi buổi như hiện nay nên cần đặt được trạng thái Unit. |
| G2 | **Tên + ghi chú cấp** của giáo trình cố định sau khi tạo (bảng chỉ thêm). Nhầm → thêm giáo trình mới. **"Lưu trữ" giáo trình** (DOMAIN §6) chưa làm ở W2 (thêm sau bằng bảng sự kiện, không đổi bảng cũ). | Giữ W2 nhỏ; không có tiêu chí W2 nào cần. |
| G3 | **Unit = đơn vị dạy.** Review / Progress Test / phần tra cứu **không phải Unit**; AI ghi chúng vào "Không phải Unit" (không tính). Destination = **26 Unit** (khớp spec §6 W2), 20 dòng không phải Unit. | Đúng mục lục thật (trang 4–5): 26 Unit + 13 Review + 2 Progress Test + 5 phần tra cứu. |
| G4 | **Mã Unit:** số in → `U7`; nhãn chữ → `X-STARTER`; trùng → `U2-2` + "cần xem". Mã giữ nguyên qua các phiên bản. | DOMAIN §4 "mã Unit ổn định"; §8 "Unit trùng tên → khóa theo mã". |
| G5 | Mỗi Unit tối đa **12** điểm; mỗi buổi tối đa **6** Unit đã dạy. "Hôm nay học" để trống mà có chọn Unit → app ghi "U13 · Unreal time; …". | Ghi buổi ≤ 2 phút (spec §1); v2 đòi ít nhất một nội dung. |
| G6 | Đề xuất "Đang học" sau khi ghi buổi **chỉ cho Unit đang "Chưa học"** (không kéo lùi Unit "Đã học"). | DOMAIN §5.1 chỉ nói "đề xuất"; tránh hạ trạng thái. |
| G7 | "Bỏ qua" có hai đường: đánh dấu trong phiên bản lúc duyệt ("Không dạy Unit này") **hoặc** sự kiện "Bỏ qua". Cả hai đều không tính vào độ phủ. | Bảng `curriculum_units.skipped` + sự kiện `skipped` đều có trong yêu cầu. |
| G8 | Lý do khi sửa / bỏ một dòng mục lục: *Sai tên / trang · Sai điểm · Thiếu điểm · Không phải Unit · Khác* (không bắt buộc). Đánh giá cuối *Tốt / Tạm / Phải sửa nhiều* không bắt buộc. | 5 lý do của §9.3 viết cho câu hỏi (quá khó, sai đáp án…), không hợp mục lục. |
| G9 | **13 nhãn nghe hạt giống** (Track B 8 · Track A 5, xem `content/tags/listening_*.json`) mang `group_key` của mảng Nghe; SM-1 đã công bố nên **không** thêm lá (đổi SM-1 = SM-2, quá lớn cho W2). 🕓 gia sư xem lại tên. | R7. |
| G10 | AI đọc mục lục: cùng model với Studio (`claude-sonnet-5-5`, không thêm biến môi trường); **không bao giờ** đặt key mới — điểm ngoài danh sách chỉ là gợi ý chữ (`missing_points`); gia sư bấm "Tạo nhãn riêng" (bắt buộc nhóm SM-1). | D-W1 danh sách đóng. |
| G11 | Ba bước "Câu hỏi cho cô → AI hỏi lại → Nháp" và việc đưa Ghi chú dạy học / 2–3 góp ý gần nhất vào AI (spec §5) **chưa áp** cho việc đọc mục lục ở W2: đầu vào chỉ là PDF + tên sách + ghi chú cấp + danh sách nhãn. Sẽ dùng từ W4/W6 khi có `ai_feedback`. | Mục lục là tài liệu công khai, không cần hiểu biết về con; giữ W2 nhỏ. |
| G12 | Chi phí AI của một phiên bản: **chỉ phụ huynh** thấy trên màn duyệt. Ghi vào `docs/PROGRESS.md` bằng `npm run report:curriculum-ai`. Gia sư sửa > 20 % dòng → màn duyệt báo "DỪNG, chỉnh công thức". | Spec §8; tutor không thấy chi phí (luật Studio). |
| G13 | Phiên bản đang dùng = bản đã duyệt mới nhất; nháp mới (kể cả "Nạp mục lục" lại) không đổi "đang học đến" cho tới khi được duyệt. | DOMAIN §4. |
| G14 | Đường vào: link "Giáo trình" trên thẻ em ở trang chủ (Bàn làm việc chưa có). | Bàn làm việc thuộc lát sau. |

## Global Constraints

- Migration `db/migrations/0026_curriculum.sql`: idempotent, **chỉ thêm**, kết thúc `insert into english.schema_migrations(version) values ('0026') on conflict do nothing;`. Không sửa 0001–0025. Không đụng schema `public`. Cần **0025 (W1) đã áp**.
- Bảng chỉ thêm gắn `english.eng_forbid_mutation('learner_id')` (row) + `eng_forbid_mutation()` (truncate). Phiên bản giáo trình có trigger riêng `eng_guard_curriculum_version` (sửa khi còn nháp; đã duyệt chỉ sang `superseded`; xóa chỉ trong purge).
- Bảng có `learner_id` → thêm vào `eng_purge_learner` **và** `eng_purge_preview` bằng `create or replace` (chép thân của **0025**), kèm test so khóa biên nhận = khóa đếm trước. `jsonb_build_object` tối đa **100 tham số**: khóa mới ở object thứ hai nối `||`.
- `revoke insert, update, delete, truncate … from service_role`; RLS đọc `eng_is_staff_of(learner_id)`; ghi chỉ qua hàm `security definer set search_path = ''`, hàm tự kiểm người thao tác (`eng_actor_may_manage` + vai).
- Mọi chữ giao diện trong `lib/copy/vi.ts` (`curriculumCopy`, `curriculumErrors`); người dạy là "thầy/cô" qua `tutorHonorific`; không viết cứng "cô". Con không thấy gì của W2 (không trang, không API, RLS chặn).
- AI: một công thức `prompts/curriculum-toc.v1.md`, tool bắt buộc `save_curriculum_toc`, sai mẫu → thử lại tối đa 3 lần rồi "Soạn tay"; **mọi** lần gọi ghi `ai_runs` (purpose `curriculum_toc`, `prompt_version`, chi phí, dòng giữ chỗ trước khi gọi); trần $10 qua `eng_ai_gate`; `AI_FAKE=1` trả `tests/fixtures/curriculum/fake-toc.json`. Chỉ gửi PDF mục lục + tên sách + ghi chú cấp + danh sách nhãn — **không** tên / bí danh / dữ liệu của em (D-W7).
- Màn duyệt theo spec §5 "Quy tắc giao diện cho máy tính": rộng (nội dung ≤ 1240 px), dòng cần xem lên đầu, thanh hành động **dính đáy** ("Còn n dòng cần xử lý · Duyệt"), nút "Đóng" góc trên, nhãn trên ô, ô bấm ≥ 44 px; điện thoại 390 px không cuộn ngang (bảng chỉ đọc có `overflow-x-auto`).
- Code, comment, commit: tiếng Anh. Không `if (track === 'A')`.
- `npm run typecheck && npm run lint && npm test` xanh trước khi mở PR; review Opus (`reviewer`) trước PR; PR tiếng Việt: làm gì · cách thử preview · **SQL cần phụ huynh áp: `0025` rồi `0026`** · tiêu chí đạt/chưa.
- Commit trailer (mọi commit): `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1`.
- Nhánh: `feature/w2-curriculum` từ `feature/w1-notes-feedback` (sau khi nhánh W1 đã chứa `main` có PR #23). PR base = `feature/w1-notes-feedback`.

---

## File structure

| File | Trách nhiệm |
|---|---|
| `db/migrations/0026_curriculum.sql` | 8 mục: file mục lục · 6 bảng · bảo vệ + RLS · hàm ghi · AI purpose · nhãn nghe + `eng_skill_map` · ghi buổi v3 · purge |
| `content/tags/listening_A.json`, `listening_B.json` | nguồn của 13 nhãn nghe (test đối chiếu từng dòng với migration) |
| `prompts/curriculum-toc.v1.md` | công thức AI "Đọc mục lục" |
| `tests/fixtures/curriculum/fake-toc.json` | câu trả lời AI giả (Destination C1&C2, 26 Unit) cho `AI_FAKE` + test |
| `tests/fixtures/curriculum/destination-c1c2.golden.json` | bộ đề chuẩn: 26 Unit đúng thứ tự, tên, trang |
| `lib/curriculum/types.ts` · `schema.ts` | hằng số, giới hạn; zod payload nháp / đầu ra AI / body API |
| `lib/curriculum/context.ts` | danh sách đóng (nhãn của track + gia đình, có Mảng › Nhóm) |
| `lib/curriculum/normalize.ts` · `validate.ts` | AI → nháp (mã Unit, cờ "cần xem"); kiểm nháp, "Còn n dòng", danh sách Unit cuối |
| `lib/curriculum/progress.ts` | "đang học đến", độ phủ, đề xuất "Đang học" (DOMAIN §5.1) |
| `lib/curriculum/editStats.ts` · `golden.ts` · `report.ts` | % dòng gia sư sửa; so bộ đề chuẩn; bảng cho PROGRESS |
| `lib/curriculum/tocTool.ts` · `extract.ts` | tool `save_curriculum_toc` + lời gọi; việc nền đọc mục lục (cổng, giữ chỗ, ghi sổ, thử lại) |
| `lib/curriculum/shape.ts` · `handlers.ts` · `supabaseStore.ts` · `route.ts` · `load.ts` · `client.ts` | dòng DB → view; handler (requireAccess trước); rpc; glue route; loader trang; helper trình duyệt |
| `app/api/learners/[id]/curricula/route.ts` · `.../curricula/files/route.ts` | POST thêm giáo trình · POST link tải mục lục |
| `app/api/curricula/[id]/versions` · `edit` · `unit-events` (route.ts) | Nạp mục lục · Sửa (bản mới) · đặt trạng thái Unit |
| `app/api/curricula/versions/[id]/route.ts` · `approve` · `discard` | GET/PUT phiên bản · Duyệt · Bỏ nháp |
| `components/curriculum/*` | `AddCurriculumForm`, `CurriculumCard`, `CoverageBar`, `EditMapButton`, `TocWaiting`, `VersionReview`, `MapTable`, `UnitStatusTable`, `TaughtUnitsPicker`, `UnitProposal` |
| `app/learners/[id]/curricula/page.tsx` · `[curriculumId]/page.tsx` · `app/curricula/versions/[id]/page.tsx` | trang Giáo trình · Trạng thái Unit · Duyệt / Bảng nối |
| `scripts/curriculum-ai-report.ts` · `scripts/golden-curriculum.ts` | số liệu lần dùng thật cho PROGRESS · chạy bộ đề chuẩn với AI thật |
| Sửa: `lib/ai/config.ts`, `anthropic.ts`, `prompts.ts`, `lib/storage/rules.ts`, `lib/auth/requireAccess.ts`, `lib/tutorwork/schemas.ts`, `handlers.ts`, `supabaseStore.ts`, `components/tutor/SessionNoteForm.tsx`, `app/learners/[id]/notes/new/page.tsx`, `components/LearnerCard.tsx`, `lib/copy/vi.ts`, `package.json` | fixture AI theo tool, công thức mới, loại file, quyền, ghi buổi + Unit, link, chữ, lệnh |
| Test mới: `tests/db/curriculum.test.ts`, `tests/unit/curriculum{Progress,Normalize,Ai,Handlers,Ui,Report}.test.ts`, `listeningTags.test.ts`, `migration0026.test.ts`, `tests/e2e/curriculum.spec.ts` | |
| Test sửa: `tests/db/migrations.test.ts`, `skillMap.test.ts`, `tutorWork.test.ts`, `tests/unit/tutorWork.test.ts`, `deployOrder.test.ts` | danh sách bảng; nhãn nghe; trường mới |
| `docs/PROGRESS.md`, `docs/DESIGN.md` (§19.13), `CLAUDE.md`, `docs/UX_COPY_GUIDE.md` | trạng thái, SQL cần áp, thiết kế, chữ |

---

### Task 1: Migration 0026 — file mục lục, 6 bảng, bảo vệ, RLS

**Files:**
- Create: `db/migrations/0026_curriculum.sql` (mục 1–3 + dòng `schema_migrations`)
- Test: `tests/db/curriculum.test.ts`

**Interfaces:**
- Consumes: `english.eng_forbid_mutation` (0004), `english.eng_is_staff_of` (0007), `english.eng_purge_learner(uuid,uuid)` (0025), `english.files` CHECKs (0024).
- Produces: bảng `english.curricula(id, family_id, learner_id, track_id, title, level_note, created_by_member, client_id, created_at)`; `english.curriculum_versions(id, curriculum_id, learner_id, version, source ∈ ai|manual|edit, status ∈ extracting|ai_failed|draft|approved|superseded|discarded, toc_file_id, payload, ai_payload, ai_run_id, error_code, supersedes_version_id, created_by_member, updated_by_member, updated_at, approved_by_member, approved_at, review, superseded_at, client_id, created_at)`; `english.curriculum_units(version_id, curriculum_id, learner_id, code, ord, title, section, page, skipped)`; `english.curriculum_unit_points(version_id, code, learner_id, tag_key, ord)`; `english.curriculum_unit_events(id, curriculum_id, learner_id, unit_code, status, lesson_note_id, by_member, by_role, client_id, created_at)`; `english.lesson_note_units(lesson_note_id, learner_id, curriculum_id, version_id, unit_code)`; `files.kind` thêm `curriculum_toc` (chỉ PDF).

- [ ] **Step 0: Branch**

```bash
git fetch origin
git merge-base --is-ancestor origin/main origin/feature/w1-notes-feedback && echo "W1 has main" || echo "STOP: W1 must be rebased on main (PR #23) first"
git checkout -b feature/w2-curriculum origin/feature/w1-notes-feedback
ls db/migrations | tail -2   # expect 0024_studio_b1.sql, 0025_workdesk_w1.sql
```

Nếu dòng 2 in "STOP": dừng, báo phụ huynh (W1 phải chứa PR #23 vì Task 10 sửa `SessionNoteForm` bản có "Giống buổi trước"). Ngày 08/11 nhánh W1 đã gộp `main` (commit `9396842`).

- [ ] **Step 1: Write the failing DB test (tables + direct writes + RLS)**

`tests/db/curriculum.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** W2 · Giáo trình (migration 0026): tables, guards, RLS, functions, listening tags, AI purpose, lesson note v3, purge. One database. */
describe("W2 curriculum (migration 0026)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
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

  describe("1. tables and reading rights", () => {
    it("exist, refuse direct writes even from service_role", async () => {
      for (const t of ["curricula", "curriculum_versions", "curriculum_units", "curriculum_unit_points", "curriculum_unit_events", "lesson_note_units"]) {
        expect((await q1("select to_regclass($1)::text as r", [`english.${t}`]))[0]).toEqual({ r: `english.${t}` });
      }
      await fail(svc(
        "insert into english.curricula(family_id, learner_id, track_id, title, created_by_member, client_id) values ($1,$2,'B','x',$3,'raw-00000001') returning id as r",
        [s.familyId, NG(), M().tutorNguyen]), "42501");
    });
    it("the child's tutor and the parent read; the other tutor and students read nothing", async () => {
      // written as the table owner (the app writes through the functions of Task 2)
      await q1("insert into english.curricula(family_id, learner_id, track_id, title, level_note, created_by_member, client_id) values ($1,$2,'B','Reading Explorer 3','Quyển 3 ≈ B1+',$3,'raw-00000002')",
        [s.familyId, NG(), M().tutorNguyen]);
      const n = async (uid: string) =>
        (await rowsAs<{ n: number }>(db.client, "authenticated", uid, "select count(*)::int as n from english.curricula where learner_id = $1", [NG()]))[0]!.n;
      expect(await n(s.users.tutorNguyen)).toBe(1);
      expect(await n(s.users.parent)).toBe(1);
      expect(await n(s.users.tutorAn)).toBe(0);
      expect(await n(s.users.studentNguyen)).toBe(0);
    });
  });

});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/db/curriculum.test.ts` (Postgres local 127.0.0.1:5432)
Expected: FAIL — `to_regclass` trả `null`.

- [ ] **Step 3: Write the migration header + sections 1–3 + the last line**

`db/migrations/0026_curriculum.sql (đầu file)`:

```sql
-- 0026_curriculum.sql
-- W2 · Giáo trình (spec docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md §4 W2, §6 W2; luật docs/DOMAIN.md §3 tầng B, §4,
-- §5.1, §6, §7, §8, §9.2, §13 D-W1 D-W2 D-W8, §14 R3 R4 R7; kế hoạch docs/superpowers/plans/2026-11-08-w2-curriculum.md):
--   1. files.kind thêm 'curriculum_toc' (CHỈ PDF) + eng_register_file nhận loại mới.
--   2. Bảng: curricula (của MỘT em, không có kind — R4), curriculum_versions (nháp → đã duyệt → thay bằng vN+1; đã duyệt bất biến),
--      curriculum_units + curriculum_unit_points (chỉ sinh lúc Duyệt; mã Unit ổn định qua các phiên bản; mỗi dòng nối = đúng MỘT nhãn
--      của track / gia đình), curriculum_unit_events (chỉ thêm: chưa học / đang học / đã học / bỏ qua), lesson_note_units (Unit đã dạy
--      trong một buổi, chỉ thêm).
--   3. Bảo vệ (chỉ thêm, phiên bản đã duyệt bất biến) + RLS (eng_is_staff_of; học sinh không đọc gì).
--   4. Ghi (service_role sau requireAccess; hàm kiểm lại người thao tác): tạo giáo trình / nạp mục lục (gia sư HOẶC phụ huynh), lưu / bỏ
--      nháp (gia sư hoặc phụ huynh), DUYỆT (chỉ gia sư của em — D-W8), sửa sau duyệt = phiên bản mới, đặt trạng thái Unit.
--   5. ai_runs.purpose thêm 'curriculum_toc'; eng_ai_gate / eng_log_ai_run thêm tham số CUỐI p_purpose (mặc định 'studio_extract':
--      mọi lời gọi cũ chạy y như trước).
--   6. Nhãn dạng câu NGHE (R7): nhãn có sẵn mới mang group_key mảng Nghe của SM-1 (SM-1 đã công bố nên không thêm lá); CHECK
--      error_tags_group_key_shape nới cho riêng các nhãn 'nghe-…' có sẵn; eng_skill_map đặt chúng vào nhóm như nhãn riêng.
--   7. Ghi buổi v3 = v2 + Unit đã dạy. eng_write_lesson_note_v2 và v1 giữ nguyên.
--   8. eng_purge_learner + eng_purge_preview thêm 6 bảng mới (jsonb_build_object nhận tối đa 100 tham số: khóa mới ở object thứ hai).
-- Idempotent; chỉ thêm (expand). Không đụng schema public. Cần 0025 đã áp.

```

(tiếp):

```sql
-- 1. File mục lục ------------------------------------------------------------------------------------------------------------------
alter table english.files drop constraint if exists files_kind_check;
alter table english.files add constraint files_kind_check
  check (kind in ('assignment_pdf', 'answer_key', 'result_image', 'work_photo', 'external_result', 'studio_test', 'studio_key', 'curriculum_toc'));
alter table english.files drop constraint if exists files_kind_mime;
alter table english.files add constraint files_kind_mime check (
  (kind = 'assignment_pdf' and mime = 'application/pdf')
  or (kind in ('answer_key', 'work_photo', 'external_result') and mime <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  or (kind = 'result_image' and mime in ('image/png', 'image/jpeg', 'image/webp'))
  or (kind in ('studio_test', 'studio_key') and mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
  or (kind = 'curriculum_toc' and mime = 'application/pdf'));

-- Đăng ký file = bản 0024 + mục lục giáo trình (chỉ PDF).
create or replace function english.eng_register_file(p_family uuid, p_learner uuid, p_kind text, p_file jsonb, p_by uuid) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_mime text;
  v_bytes int;
  v_ext text;
begin
  if pg_catalog.jsonb_typeof(p_file) is distinct from 'object'
     or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_file)) <> 3
     or (p_file ->> 'id') is null or (p_file ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or pg_catalog.jsonb_typeof(p_file -> 'mime') is distinct from 'string'
     or (p_file ->> 'bytes') is null or (p_file ->> 'bytes') !~ '^[0-9]{1,9}$' then
    raise exception 'eng_register_file: each file is {id, mime, bytes}' using errcode = '22023';
  end if;
  v_id := (p_file ->> 'id')::uuid;
  v_mime := p_file ->> 'mime';
  v_bytes := (p_file ->> 'bytes')::int;
  if v_mime not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception 'eng_register_file: only pdf, png, jpeg, webp and docx files are accepted' using errcode = '22023';
  end if;
  if v_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and p_kind not in ('studio_test', 'studio_key') then
    raise exception 'eng_register_file: a Word file is accepted only for a Studio test or answer key' using errcode = '22023';
  end if;
  if p_kind in ('studio_test', 'studio_key') and v_mime not in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception 'eng_register_file: a Studio test or answer key must be a PDF or a .docx file' using errcode = '22023';
  end if;
  if p_kind = 'curriculum_toc' and v_mime <> 'application/pdf' then
    raise exception 'eng_register_file: a table of contents must be a PDF (toc_pdf_only)' using errcode = '22023';
  end if;
  if v_bytes < 1 or v_bytes > 15728640 then
    raise exception 'eng_register_file: a file must be between 1 byte and 15 MB' using errcode = '22023';
  end if;
  if p_kind = 'assignment_pdf' and v_mime <> 'application/pdf' then
    raise exception 'eng_register_file: an assignment file must be a PDF' using errcode = '22023';
  end if;
  if p_kind = 'result_image' and v_mime = 'application/pdf' then
    raise exception 'eng_register_file: a result screenshot must be an image' using errcode = '22023';
  end if;
  v_ext := case v_mime when 'application/pdf' then 'pdf' when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx' else 'webp' end;
  insert into english.files(id, family_id, learner_id, kind, path, mime, bytes, uploaded_by_member)
  values (v_id, p_family, p_learner, p_kind, p_family::text || '/' || coalesce(p_learner::text, 'shared') || '/' || v_id::text || '.' || v_ext, v_mime, v_bytes, p_by);
  return v_id;
end
$$;
revoke execute on function english.eng_register_file(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;

```

(tiếp):

```sql

-- 2. Bảng giáo trình -------------------------------------------------------------------------------------------------------------------

-- 2a. Giáo trình: một quyển / nguồn mà gia sư dạy cho MỘT em (D-W2). Không có `kind` (R4). Bất biến sau khi tạo (chỉ thêm).
create table if not exists english.curricula (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references english.families(id),
  learner_id uuid not null references english.learners(id),
  track_id text not null references english.tracks(id),
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 160),
  -- vd "Quyển 3 ≈ B1+": ghi chú cấp của sách, không phải cấp của em.
  level_note text check (level_note is null or pg_catalog.length(pg_catalog.btrim(level_note)) between 1 and 200),
  -- id của english.members, KHÔNG có khóa ngoại (như các bảng khác).
  created_by_member uuid not null,
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create index if not exists curricula_learner_idx on english.curricula(learner_id, created_at);

-- 2b. Phiên bản giáo trình: nháp (sửa tự do, payload) → đã duyệt (bất biến; Unit + nối sinh ra lúc Duyệt) → thay bằng vN+1.
-- payload = {units:[{code,title,section,page,skipped,points[],missing_points[],needs_review,review_reason,origin,dropped,edit_reason}],
--            ignored:[{label,page,reason}]}; hình chi tiết do zod (lib/curriculum/schema.ts) kiểm ở máy chủ.
-- ai_payload = bản AI soạn (chép một lần khi AI xong, không đổi) để đếm % dòng gia sư sửa (spec §8).
create table if not exists english.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references english.curricula(id),
  learner_id uuid not null references english.learners(id),
  version int not null check (version between 1 and 999),
  source text not null check (source in ('ai', 'manual', 'edit')),
  status text not null check (status in ('extracting', 'ai_failed', 'draft', 'approved', 'superseded', 'discarded')),
  toc_file_id uuid references english.files(id),
  payload jsonb not null default '{"units": [], "ignored": []}'::jsonb,
  ai_payload jsonb,
  ai_run_id uuid references english.ai_runs(id),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,40}$'),
  supersedes_version_id uuid references english.curriculum_versions(id),
  created_by_member uuid not null,
  updated_by_member uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  approved_by_member uuid,
  approved_at timestamptz,
  -- {stats:{ai_rows,kept,edited,dropped,added,edited_pct,reasons}, quality:'good'|'ok'|'needs_work'|null, quality_note}
  review jsonb check (review is null or (pg_catalog.jsonb_typeof(review) = 'object' and pg_catalog.length(review::text) <= 4000)),
  superseded_at timestamptz,
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (curriculum_id, version),
  unique (learner_id, client_id),
  constraint curriculum_versions_payload_shape check (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and pg_catalog.jsonb_typeof(payload -> 'units') = 'array'
    and pg_catalog.jsonb_typeof(payload -> 'ignored') = 'array'
    and pg_catalog.jsonb_array_length(payload -> 'units') <= 300
    and pg_catalog.length(payload::text) <= 300000),
  constraint curriculum_versions_approved_shape check (
    (status in ('approved', 'superseded')) = (approved_at is not null and approved_by_member is not null)),
  constraint curriculum_versions_superseded_shape check ((status = 'superseded') = (superseded_at is not null)),
  constraint curriculum_versions_ai_has_file check (source <> 'ai' or toc_file_id is not null)
);
create index if not exists curriculum_versions_curriculum_idx on english.curriculum_versions(curriculum_id, version desc);
create index if not exists curriculum_versions_learner_idx on english.curriculum_versions(learner_id);
-- Một nháp đang mở và một bản đang dùng cho mỗi giáo trình.
create unique index if not exists curriculum_versions_one_open on english.curriculum_versions(curriculum_id)
  where status in ('extracting', 'ai_failed', 'draft');
create unique index if not exists curriculum_versions_one_current on english.curriculum_versions(curriculum_id) where status = 'approved';

-- 2c. Unit của một phiên bản ĐÃ DUYỆT (chỉ sinh trong eng_approve_curriculum_version). Mã Unit ổn định qua các phiên bản (U7 ở v1 = U7
-- ở v2); "bỏ qua" vẫn giữ dòng, chỉ đánh dấu.
create table if not exists english.curriculum_units (
  version_id uuid not null references english.curriculum_versions(id),
  curriculum_id uuid not null references english.curricula(id),
  learner_id uuid not null references english.learners(id),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
  ord int not null check (ord between 1 and 300),
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 160),
  section text check (section is null or pg_catalog.length(pg_catalog.btrim(section)) between 1 and 40),
  page int check (page is null or page between 1 and 3000),
  skipped boolean not null default false,
  primary key (version_id, code),
  unique (version_id, ord)
);
create index if not exists curriculum_units_curriculum_idx on english.curriculum_units(curriculum_id);
create index if not exists curriculum_units_learner_idx on english.curriculum_units(learner_id);

-- 2d. Nối Unit → điểm: mỗi dòng = đúng MỘT nhãn (error_tags.key) của track em, có sẵn hoặc của gia đình (danh sách đóng, D-W1).
create table if not exists english.curriculum_unit_points (
  version_id uuid not null,
  code text not null,
  learner_id uuid not null references english.learners(id),
  tag_key text not null check (pg_catalog.length(tag_key) between 1 and 80),
  ord int not null check (ord between 1 and 12),
  primary key (version_id, code, tag_key),
  unique (version_id, code, ord),
  foreign key (version_id, code) references english.curriculum_units(version_id, code)
);
create index if not exists curriculum_unit_points_learner_idx on english.curriculum_unit_points(learner_id);

-- 2e. Trạng thái Unit: chỉ thêm; trạng thái hiện tại = sự kiện mới nhất của mã Unit đó (DOMAIN §5.1). Theo GIÁO TRÌNH + mã Unit (không
-- theo phiên bản) để "đang học đến" đi theo sang phiên bản mới.
create table if not exists english.curriculum_unit_events (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references english.curricula(id),
  learner_id uuid not null references english.learners(id),
  unit_code text not null check (unit_code ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
  status text not null check (status in ('not_started', 'in_progress', 'done', 'skipped')),
  -- Đặt từ đề xuất sau khi ghi buổi (gia sư bấm) thì trỏ tới buổi đó.
  lesson_note_id uuid references english.lesson_notes(id),
  by_member uuid not null,
  by_role text not null check (by_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create index if not exists curriculum_unit_events_idx on english.curriculum_unit_events(curriculum_id, created_at, id);
create index if not exists curriculum_unit_events_learner_idx on english.curriculum_unit_events(learner_id);

-- 2f. Unit đã dạy trong một buổi (eng_write_lesson_note_v3). Trỏ tới Unit của phiên bản đang dùng LÚC GHI.
create table if not exists english.lesson_note_units (
  lesson_note_id uuid not null references english.lesson_notes(id),
  learner_id uuid not null references english.learners(id),
  curriculum_id uuid not null references english.curricula(id),
  version_id uuid not null,
  unit_code text not null,
  primary key (lesson_note_id, curriculum_id, unit_code),
  foreign key (version_id, unit_code) references english.curriculum_units(version_id, code)
);
create index if not exists lesson_note_units_learner_idx on english.lesson_note_units(learner_id);
create index if not exists lesson_note_units_curriculum_idx on english.lesson_note_units(curriculum_id);

```

(tiếp):

```sql
-- 3. Bảo vệ -------------------------------------------------------------------------------------------------------------------------------

-- 3a. Chỉ thêm (theo hướng dẫn đầu 0004): purge đi qua được nhờ 'learner_id'.
do $$
declare
  t text;
begin
  foreach t in array array['curricula', 'curriculum_units', 'curriculum_unit_points', 'curriculum_unit_events', 'lesson_note_units'] loop
    execute format('drop trigger if exists %I on english.%I', t || '_forbid_mutation', t);
    execute format(
      'create trigger %I before update or delete on english.%I for each row execute function english.eng_forbid_mutation(%L)',
      t || '_forbid_mutation', t, 'learner_id');
    execute format('drop trigger if exists %I on english.%I', t || '_forbid_truncate', t);
    execute format(
      'create trigger %I before truncate on english.%I for each statement execute function english.eng_forbid_mutation()',
      t || '_forbid_truncate', t);
  end loop;
end
$$;

-- 3b. Unit và dòng nối chỉ thêm được vào phiên bản ĐANG được duyệt (status 'draft' trong eng_approve_curriculum_version); phiên bản
-- đã duyệt không nhận thêm dòng nào (bất biến DOMAIN §7.2).
create or replace function english.eng_check_curriculum_row() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1 from english.curriculum_versions v
    where v.id = new.version_id and v.status = 'draft' and v.learner_id = new.learner_id
      and (tg_table_name <> 'curriculum_units' or v.curriculum_id = (pg_catalog.to_jsonb(new) ->> 'curriculum_id')::uuid)) then
    raise exception 'english.%: rows are added only while their version is being approved', tg_table_name using errcode = '42501';
  end if;
  return new;
end
$$;
revoke execute on function english.eng_check_curriculum_row() from public, anon, authenticated, service_role;
drop trigger if exists curriculum_units_check_row on english.curriculum_units;
create trigger curriculum_units_check_row before insert on english.curriculum_units for each row execute function english.eng_check_curriculum_row();
drop trigger if exists curriculum_unit_points_check_row on english.curriculum_unit_points;
create trigger curriculum_unit_points_check_row before insert on english.curriculum_unit_points for each row execute function english.eng_check_curriculum_row();

-- 3c. Phiên bản: sửa khi còn là nháp, đúng các bước chuyển; đã duyệt chỉ được chuyển sang "thay bằng vN+1"; xóa chỉ trong purge.
create or replace function english.eng_guard_curriculum_version() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_purge text := nullif(pg_catalog.current_setting('app.purge_learner', true), '');
  v_owner text;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'english.curriculum_versions: TRUNCATE is forbidden' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if v_purge is not null and old.learner_id::text = v_purge then
      select r.rolname into v_owner
      from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
      where p.oid = pg_catalog.to_regprocedure('english.eng_purge_learner(uuid,uuid)');
      if v_owner is not null and current_user = v_owner then return old; end if;
    end if;
    raise exception 'english.curriculum_versions: DELETE is forbidden (discard the draft instead)' using errcode = '42501';
  end if;
  if new.id <> old.id or new.curriculum_id <> old.curriculum_id or new.learner_id <> old.learner_id or new.version <> old.version
     or new.source <> old.source or new.toc_file_id is distinct from old.toc_file_id or new.created_by_member <> old.created_by_member
     or new.created_at <> old.created_at or new.client_id <> old.client_id or new.supersedes_version_id is distinct from old.supersedes_version_id
     or (old.ai_payload is not null and new.ai_payload is distinct from old.ai_payload) then
    raise exception 'english.curriculum_versions: owner, file, origin, version number and the AI draft never change' using errcode = '42501';
  end if;
  if old.status in ('superseded', 'discarded') then
    raise exception 'english.curriculum_versions: a superseded or discarded version cannot change' using errcode = '42501';
  end if;
  if old.status = 'approved' then
    if new.status <> 'superseded' or new.payload is distinct from old.payload or new.review is distinct from old.review
       or new.approved_at is distinct from old.approved_at or new.approved_by_member is distinct from old.approved_by_member
       or new.ai_run_id is distinct from old.ai_run_id then
      raise exception 'english.curriculum_versions: an approved version is immutable (make a new version instead)' using errcode = '42501';
    end if;
    return new;
  end if;
  if not (new.status = old.status
          or (old.status = 'extracting' and new.status in ('draft', 'ai_failed', 'discarded'))
          or (old.status in ('ai_failed', 'draft') and new.status in ('draft', 'approved', 'discarded'))) then
    raise exception 'english.curriculum_versions: % → % is not allowed', old.status, new.status using errcode = '23514';
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;
revoke execute on function english.eng_guard_curriculum_version() from public, anon, authenticated, service_role;
drop trigger if exists curriculum_versions_guard on english.curriculum_versions;
create trigger curriculum_versions_guard before update or delete on english.curriculum_versions
  for each row execute function english.eng_guard_curriculum_version();
drop trigger if exists curriculum_versions_guard_truncate on english.curriculum_versions;
create trigger curriculum_versions_guard_truncate before truncate on english.curriculum_versions
  for each statement execute function english.eng_guard_curriculum_version();

-- 3d. RLS: người lớn của ĐÚNG em đọc (eng_is_staff_of); học sinh không đọc gì; không ai ghi thẳng.
alter table english.curricula enable row level security;
alter table english.curriculum_versions enable row level security;
alter table english.curriculum_units enable row level security;
alter table english.curriculum_unit_points enable row level security;
alter table english.curriculum_unit_events enable row level security;
alter table english.lesson_note_units enable row level security;
revoke all on english.curricula, english.curriculum_versions, english.curriculum_units, english.curriculum_unit_points,
  english.curriculum_unit_events, english.lesson_note_units from public, anon, authenticated;
revoke insert, update, delete, truncate on english.curricula, english.curriculum_versions, english.curriculum_units, english.curriculum_unit_points,
  english.curriculum_unit_events, english.lesson_note_units from service_role;
grant select on english.curricula, english.curriculum_versions, english.curriculum_units, english.curriculum_unit_points,
  english.curriculum_unit_events, english.lesson_note_units to authenticated;
do $$
declare
  t text;
begin
  foreach t in array array['curricula', 'curriculum_versions', 'curriculum_units', 'curriculum_unit_points', 'curriculum_unit_events', 'lesson_note_units'] loop
    execute format('drop policy if exists %I on english.%I', t || '_select', t);
    execute format('create policy %I on english.%I for select to authenticated using (english.eng_is_staff_of(learner_id))', t || '_select', t);
  end loop;
end
$$;
```

Dòng cuối file (mọi mục của các task sau chèn **trước** dòng này, theo thứ tự task):

```sql

insert into english.schema_migrations(version) values ('0026') on conflict do nothing;
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run tests/db/curriculum.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0026_curriculum.sql tests/db/curriculum.test.ts
git commit -m "feat(w2): migration 0026 — curriculum tables, guards, RLS, curriculum_toc files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 2: Hàm ghi — tạo, nạp mục lục, sửa (bản mới), lưu, AI xong / lỗi, bỏ, **duyệt (chỉ gia sư)**, trạng thái Unit

**Files:**
- Modify: `db/migrations/0026_curriculum.sql` (mục 4, chèn trước dòng `schema_migrations`)
- Test: `tests/db/curriculum.test.ts`

**Interfaces:**
- Consumes: `eng_actor_may_manage(uuid, uuid)` (0014), `eng_register_file(...)` (mục 1), `eng_same_instant(timestamptz, text)` (0024), `eng_tag_exists(track, family, key)` (0014).
- Produces (mọi hàm `returns jsonb`, chỉ `service_role`):
  - `eng_create_curriculum(p_learner uuid, p_title text, p_level_note text, p_toc_file jsonb, p_extract boolean, p_by uuid, p_client_id text)` → `{curriculum_id, version_id, status, replayed}`
  - `eng_add_curriculum_version(p_curriculum uuid, p_toc_file jsonb, p_extract boolean, p_by uuid, p_client_id text)` → `{version_id, status, replayed}`
  - `eng_edit_curriculum(p_curriculum uuid, p_by uuid, p_client_id text)` → `{id, replayed}`
  - `eng_save_curriculum_draft(p_version uuid, p_payload jsonb, p_base text, p_by uuid)` → `{updated_at}`
  - `eng_finish_curriculum_extraction(p_version uuid, p_payload jsonb, p_run uuid)` / `eng_fail_curriculum_extraction(p_version uuid, p_error text, p_run uuid)` → `{applied}`
  - `eng_discard_curriculum_draft(p_version uuid, p_by uuid)` → `{id, status}`
  - `eng_approve_curriculum_version(p_version uuid, p_base text, p_units jsonb, p_review jsonb, p_by uuid)` → `{version_id, version, units}`; `p_units = [{code, title, section, page, skipped, points:[tag_key]}]`
  - `eng_set_unit_status(p_curriculum uuid, p_unit_code text, p_status text, p_lesson_note uuid, p_by uuid, p_client_id text)` → `{id, replayed}`
  - Thẻ lỗi: `(tutor_only)` 42501 · `(toc_file_required)` `(bad_title)` `(bad_level_note)` `(bad_units)` `(bad_review)` `(bad_status)` 22023 · `(not_editable)` `(not_draft)` `(needs_review_left)` `(unknown_point)` `(duplicate_code)` `(duplicate_point)` `(not_approved)` `(unknown_unit)` 23514 · `(draft_changed)` 23505 · không thấy → P0002.

- [ ] **Step 1: Add the test helpers and the failing tests**

Thay dòng `import { afterAll, beforeAll, describe, expect, it } from "vitest";` bằng:

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
```

Chèn ngay **trước** `  beforeAll(async () => {`:

```ts
  const AN = () => s.learners.an;
  const pdf = () => ({ id: randomUUID(), mime: "application/pdf", bytes: 2048 });
  type Created = { curriculum_id: string; version_id: string; status: string; replayed: boolean };
  const create = (by: string, o: { learner?: string; title?: string; note?: string | null; file?: unknown; extract?: boolean; clientId?: string } = {}) =>
    svc<Created>("select english.eng_create_curriculum($1,$2,$3,$4::jsonb,$5,$6,$7) as r", [
      o.learner ?? NG(), o.title ?? "Destination C1&C2", o.note === undefined ? "C1–C2" : o.note,
      o.file === undefined ? null : JSON.stringify(o.file), o.extract ?? false, by, o.clientId ?? randomUUID(),
    ]);
  const updatedAt = async (v: string) => (await q1<{ t: string }>("select updated_at::text as t from english.curriculum_versions where id = $1", [v]))[0]!.t;
  const unitRow = (n: number, points: string[] = [], extra: Record<string, unknown> = {}) => ({
    code: `U${n}`, title: `Unit ${n}`, section: n % 2 ? "Grammar" : "Vocabulary", page: 6 * n, skipped: false, points,
    missing_points: [], needs_review: false, review_reason: null, origin: "ai", dropped: false, edit_reason: null, ...extra,
  });
  const save = async (v: string, units: unknown[], by = M().tutorNguyen) =>
    svc("select english.eng_save_curriculum_draft($1,$2::jsonb,$3,$4) as r", [v, JSON.stringify({ units, ignored: [] }), await updatedAt(v), by]);
  const finalOf = (units: ReturnType<typeof unitRow>[]) =>
    units.filter((u) => !u.dropped).map((u) => ({ code: u.code, title: u.title, section: u.section, page: u.page, skipped: u.skipped, points: u.points }));
  const approve = async (v: string, units: ReturnType<typeof unitRow>[], by = M().tutorNguyen, review: unknown = null) =>
    svc<{ version_id: string; version: number; units: number }>("select english.eng_approve_curriculum_version($1,$2,$3::jsonb,$4::jsonb,$5) as r", [
      v, await updatedAt(v), JSON.stringify(finalOf(units)), review === null ? null : JSON.stringify(review), by,
    ]);
  const setStatus = (cur: string, code: string, status: string, by = M().tutorNguyen, clientId: string = randomUUID(), note: string | null = null) =>
    svc<{ id: string; replayed: boolean }>("select english.eng_set_unit_status($1,$2,$3,$4,$5,$6) as r", [cur, code, status, note, by, clientId]);
  const twentySix = () => Array.from({ length: 26 }, (_, i) => unitRow(i + 1, i === 6 ? ["bi-dong-nho-tuong-thuat"] : i % 2 ? ["cum-dong-tu", "thanh-ngu"] : []));

```

Chèn ngay **trước** dòng `});` cuối file:

```ts
  describe("2. adding a curriculum", () => {
    it("tutor or parent adds one (v1 'draft' for Soạn tay); the tutor of the other child cannot; a replay returns the same rows", async () => {
      const id = randomUUID();
      const a = await create(M().parent, { title: "SGK Tiếng Anh 9", note: null, clientId: `cur-${id}` });
      expect(a).toMatchObject({ status: "draft", replayed: false });
      expect(await create(M().parent, { title: "SGK Tiếng Anh 9", note: null, clientId: `cur-${id}` })).toEqual({ ...a, replayed: true });
      await fail(create(M().parent, { title: "Khác", clientId: `cur-${id}` }), "23505");
      await fail(create(M().tutorAn), "42501");
      await fail(create(M().studentNguyen), "42501");
      await fail(create(M().tutorNguyen, { title: "  " }), "22023", /\(bad_title\)/);
    });
    it("AI mode needs a PDF table of contents; the file is registered as curriculum_toc; Word is refused", async () => {
      await fail(create(M().tutorNguyen, { extract: true }), "22023", /\(toc_file_required\)/);
      const f = pdf();
      const r = await create(M().tutorNguyen, { extract: true, file: f });
      expect(r.status).toBe("extracting");
      expect(await q1("select kind, mime from english.files where id = $1", [f.id])).toEqual([{ kind: "curriculum_toc", mime: "application/pdf" }]);
      await fail(create(M().tutorNguyen, { extract: true, file: { id: randomUUID(), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 10 } }), "22023");
    });
  });

  describe("2b. Nạp mục lục for an existing curriculum", () => {
    it("after v1 is discarded a new version can be read from a PDF; an open draft is returned instead of a second one", async () => {
      const c = await create(M().tutorNguyen, { title: "Listening & Notetaking 1" });
      await svc("select english.eng_discard_curriculum_draft($1,$2) as r", [c.version_id, M().tutorNguyen]);
      const id = `ver-${randomUUID()}`;
      const add = (clientId: string, extract = true) =>
        svc<{ version_id: string; status: string; replayed: boolean }>("select english.eng_add_curriculum_version($1,$2::jsonb,$3,$4,$5) as r",
          [c.curriculum_id, extract ? JSON.stringify(pdf()) : null, extract, M().parent, clientId]);
      const v = await add(id);
      expect(v).toMatchObject({ status: "extracting", replayed: false });
      expect(await add(id)).toEqual({ ...v, replayed: true });
      expect(await add(randomUUID(), false)).toEqual({ ...v, replayed: true });
      expect(await q1("select version, source from english.curriculum_versions where id = $1", [v.version_id])).toEqual([{ version: 2, source: "ai" }]);
      await fail(svc("select english.eng_add_curriculum_version($1,null,true,$2,$3) as r", [c.curriculum_id, M().tutorAn, randomUUID()]), "42501");
    });
  });

  describe("3. AI draft → review → approve (tutor only) → immutable", () => {
    let cur = "";
    let v1 = "";
    it("finish writes payload AND ai_payload once; ai_payload never changes afterwards", async () => {
      const r = await create(M().tutorNguyen, { extract: true, file: pdf() });
      cur = r.curriculum_id;
      v1 = r.version_id;
      const payload = { units: [unitRow(1, [], { needs_review: true, review_reason: "Không có nhãn thì hiện tại" }), unitRow(2, ["cum-dong-tu"])], ignored: [] };
      expect(await svc("select english.eng_finish_curriculum_extraction($1,$2::jsonb,null) as r", [v1, JSON.stringify(payload)])).toEqual({ applied: true });
      expect(await svc("select english.eng_finish_curriculum_extraction($1,$2::jsonb,null) as r", [v1, JSON.stringify(payload)])).toEqual({ applied: false });
      await save(v1, [unitRow(1), unitRow(2, ["cum-dong-tu"])]);
      expect((await q1<{ n: number }>("select jsonb_array_length(ai_payload->'units') as n from english.curriculum_versions where id = $1", [v1]))[0]!.n).toBe(2);
      await fail(q1("update english.curriculum_versions set ai_payload = '{}'::jsonb where id = $1", [v1]), "42501");
    });
    it("Duyệt is refused while a row still needs a look, for the parent, for a stale base, and for a point outside the closed list", async () => {
      const units = twentySix();
      units[0] = { ...units[0]!, needs_review: true };
      await save(v1, units);
      await fail(approve(v1, units), "23514", /\(needs_review_left\)/);
      units[0] = { ...units[0]!, needs_review: false };
      await save(v1, units);
      await fail(approve(v1, units, M().parent), "42501", /\(tutor_only\)/);
      await fail(approve(v1, units, M().tutorAn), "42501", /\(tutor_only\)/);
      const bad = units.map((u, i) => (i === 3 ? { ...u, points: ["khong-co-nhan-nay"] } : u));
      await fail(approve(v1, bad), "23514", /\(unknown_point\)/);
      const dup = units.map((u, i) => (i === 4 ? { ...u, code: "U1" } : u));
      await fail(approve(v1, dup), "23514", /\(duplicate_code\)/);
      await fail(svc("select english.eng_approve_curriculum_version($1,'2020-01-01 00:00:00+00',$2::jsonb,null,$3) as r",
        [v1, JSON.stringify(finalOf(units)), M().tutorNguyen]), "23505", /\(draft_changed\)/);
    });
    it("the tutor approves: 26 units in order + their points; then nothing of v1 can change", async () => {
      expect(await approve(v1, twentySix(), M().tutorNguyen, { stats: { ai_rows: 2, edited: 1 }, quality: "ok", quality_note: null }))
        .toEqual({ version_id: v1, version: 1, units: 26 });
      expect((await q1<{ code: string }>("select code from english.curriculum_units where version_id = $1 order by ord", [v1])).map((r) => r.code))
        .toEqual(Array.from({ length: 26 }, (_, i) => `U${i + 1}`));
      expect(await q1("select tag_key from english.curriculum_unit_points where version_id = $1 and code = 'U7'", [v1])).toEqual([{ tag_key: "bi-dong-nho-tuong-thuat" }]);
      await fail(q1("update english.curriculum_units set title = 'x' where version_id = $1", [v1]), "42501");
      await fail(q1("delete from english.curriculum_unit_points where version_id = $1", [v1]), "42501");
      await fail(q1("update english.curriculum_versions set payload = '{\"units\":[],\"ignored\":[]}'::jsonb where id = $1", [v1]), "42501");
      await fail(q1("insert into english.curriculum_units(version_id, curriculum_id, learner_id, code, ord, title) values ($1,$2,$3,'U99',99,'x')", [v1, cur, NG()]), "42501");
      await fail(svc("select english.eng_save_curriculum_draft($1,'{\"units\":[],\"ignored\":[]}'::jsonb,$2,$3) as r", [v1, await updatedAt(v1), M().tutorNguyen]), "23514", /\(not_editable\)/);
    });

    it("unit status: events only; unknown units refused; the parent may set; a replay is the same event", async () => {
      const id = `ev-${randomUUID()}`;
      const a = await setStatus(cur, "U13", "in_progress", M().tutorNguyen, id);
      expect(await setStatus(cur, "U13", "in_progress", M().tutorNguyen, id)).toEqual({ ...a, replayed: true });
      await fail(setStatus(cur, "U13", "done", M().tutorNguyen, id), "23505");
      await setStatus(cur, "U3", "skipped", M().parent);
      await fail(setStatus(cur, "U99", "done"), "23514", /\(unknown_unit\)/);
      await fail(setStatus(cur, "U1", "finished"), "22023", /\(bad_status\)/);
      await fail(setStatus(cur, "U1", "done", M().tutorAn), "42501");
      await fail(q1("update english.curriculum_unit_events set status = 'done' where curriculum_id = $1", [cur]), "42501");
    });

    it("edit after approval = v2 draft with the same unit codes; v2 drops U20 and adds U27; v1 becomes superseded; events still count by code", async () => {
      const e = await svc<{ id: string; replayed: boolean }>("select english.eng_edit_curriculum($1,$2,$3) as r", [cur, M().parent, randomUUID()]);
      expect(e.replayed).toBe(false);
      expect(await svc("select english.eng_edit_curriculum($1,$2,$3) as r", [cur, M().tutorNguyen, randomUUID()])).toEqual({ id: e.id, replayed: true });
      const p = (await q1<{ codes: string[] }>("select array(select x->>'code' from jsonb_array_elements(payload->'units') x) as codes from english.curriculum_versions where id = $1", [e.id]))[0]!.codes;
      expect(p).toEqual(Array.from({ length: 26 }, (_, i) => `U${i + 1}`));
      const v2 = twentySix().filter((u) => u.code !== "U20").concat([unitRow(27, [], { origin: "manual" })]);
      await save(e.id, v2);
      expect((await approve(e.id, v2)).version).toBe(2);
      expect(await q1("select version, status from english.curriculum_versions where curriculum_id = $1 order by version", [cur])).toEqual([
        { version: 1, status: "superseded" }, { version: 2, status: "approved" },
      ]);
      expect(await q1("select count(*)::int as n from english.curriculum_units where version_id = $1", [v1])).toEqual([{ n: 26 }]); // history kept
      await fail(setStatus(cur, "U20", "done"), "23514", /\(unknown_unit\)/);
      expect((await setStatus(cur, "U27", "in_progress")).replayed).toBe(false);
    });

    it("the parent may discard a draft; nobody discards an approved version", async () => {
      const e = await svc<{ id: string }>("select english.eng_edit_curriculum($1,$2,$3) as r", [cur, M().tutorNguyen, randomUUID()]);
      expect(await svc("select english.eng_discard_curriculum_draft($1,$2) as r", [e.id, M().parent])).toEqual({ id: e.id, status: "discarded" });
      const current = (await q1<{ id: string }>("select id from english.curriculum_versions where curriculum_id = $1 and status = 'approved'", [cur]))[0]!.id;
      await fail(svc("select english.eng_discard_curriculum_draft($1,$2) as r", [current, M().parent]), "23514", /\(not_editable\)/);
    });
  });

```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/db/curriculum.test.ts -t "adding|Nạp|approve"`
Expected: FAIL — `function english.eng_create_curriculum(...) does not exist` (42883).

- [ ] **Step 3: Write section 4 (insert before the `schema_migrations` line)**

```sql

-- 4. Ghi (service_role sau requireAccess; hàm kiểm lại người thao tác) ------------------------------------------------------------------

-- Nội bộ: người lớn được làm việc giáo trình của em (gia sư còn quan hệ hoặc phụ huynh của gia đình). Trả member, không thì 42501.
create or replace function english.eng_curriculum_actor(p_by uuid, p_learner uuid, p_fn text) returns english.members
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
begin
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception '%: this member may not change the curricula of this learner', p_fn using errcode = '42501';
  end if;
  return v_m;
end
$$;
revoke execute on function english.eng_curriculum_actor(uuid, uuid, text) from public, anon, authenticated, service_role;

-- 4a. Thêm giáo trình + phiên bản 1 (gia sư HOẶC phụ huynh của em). p_extract = true → 'extracting' (máy chủ đã qua cổng AI; cần file
-- mục lục), false → nháp trống ("Soạn tay"). Gửi lại cùng client_id = cùng giáo trình.
create or replace function english.eng_create_curriculum(
  p_learner uuid, p_title text, p_level_note text, p_toc_file jsonb, p_extract boolean, p_by uuid, p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_title text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  v_note text := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_level_note, '')), '\s+', ' ', 'g'), '');
  v_prev english.curricula%rowtype;
  v_file uuid;
  v_cid uuid;
  v_vid uuid;
  v_status text;
begin
  if p_learner is null or p_extract is null or p_by is null then
    raise exception 'eng_create_curriculum: learner, mode and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_create_curriculum: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if pg_catalog.length(v_title) not between 1 and 160 then
    raise exception 'eng_create_curriculum: a title of 1..160 characters is required (bad_title)' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 200 then
    raise exception 'eng_create_curriculum: the level note is at most 200 characters (bad_level_note)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_create_curriculum: learner not found' using errcode = 'P0002';
  end if;
  v_m := english.eng_curriculum_actor(p_by, p_learner, 'eng_create_curriculum');
  select * into v_prev from english.curricula c where c.learner_id = p_learner and c.client_id = p_client_id;
  if found then
    if v_prev.title <> v_title then
      raise exception 'eng_create_curriculum: client_id was already used for another curriculum' using errcode = '23505';
    end if;
    select v.id, v.status into v_vid, v_status from english.curriculum_versions v where v.curriculum_id = v_prev.id and v.version = 1;
    return pg_catalog.jsonb_build_object('curriculum_id', v_prev.id, 'version_id', v_vid, 'status', v_status, 'replayed', true);
  end if;
  if p_extract and p_toc_file is null then
    raise exception 'eng_create_curriculum: AI needs the table of contents (toc_file_required)' using errcode = '22023';
  end if;
  if p_toc_file is not null then
    v_file := english.eng_register_file(v_l.family_id, p_learner, 'curriculum_toc', p_toc_file, p_by);
  end if;
  insert into english.curricula(family_id, learner_id, track_id, title, level_note, created_by_member, client_id)
  values (v_l.family_id, p_learner, v_l.track_id, v_title, v_note, p_by, p_client_id)
  returning id into v_cid;
  v_status := case when p_extract then 'extracting' else 'draft' end;
  insert into english.curriculum_versions(curriculum_id, learner_id, version, source, status, toc_file_id, created_by_member, updated_by_member, client_id)
  values (v_cid, p_learner, 1, case when p_extract then 'ai' else 'manual' end, v_status, v_file, p_by, p_by, p_client_id)
  returning id into v_vid;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'curriculum.created', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('curriculum', v_cid, 'version', v_vid, 'extract', p_extract));
  return pg_catalog.jsonb_build_object('curriculum_id', v_cid, 'version_id', v_vid, 'status', v_status, 'replayed', false);
end
$$;

-- 4b. "Nạp mục lục" cho giáo trình đã có (bản 1 đã bỏ, hoặc đọc lại cả mục lục): phiên bản mới vN+1 từ PDF (AI) hoặc trống (Soạn tay).
-- Đã có nháp mở → trả nháp đó. Bản đang dùng (nếu có) vẫn dùng cho tới khi bản mới được duyệt.
create or replace function english.eng_add_curriculum_version(p_curriculum uuid, p_toc_file jsonb, p_extract boolean, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_c english.curricula%rowtype;
  v_prev english.curriculum_versions%rowtype;
  v_open english.curriculum_versions%rowtype;
  v_file uuid;
  v_id uuid;
  v_status text;
begin
  if p_curriculum is null or p_extract is null or p_by is null then
    raise exception 'eng_add_curriculum_version: curriculum, mode and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_add_curriculum_version: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select * into v_c from english.curricula c where c.id = p_curriculum for update;
  if not found then
    raise exception 'eng_add_curriculum_version: curriculum not found' using errcode = 'P0002';
  end if;
  perform english.eng_curriculum_actor(p_by, v_c.learner_id, 'eng_add_curriculum_version');
  select * into v_prev from english.curriculum_versions v where v.learner_id = v_c.learner_id and v.client_id = p_client_id;
  if found then
    if v_prev.curriculum_id <> p_curriculum then
      raise exception 'eng_add_curriculum_version: client_id was already used for another curriculum' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('version_id', v_prev.id, 'status', v_prev.status, 'replayed', true);
  end if;
  select * into v_open from english.curriculum_versions v where v.curriculum_id = p_curriculum and v.status in ('extracting', 'ai_failed', 'draft');
  if found then
    return pg_catalog.jsonb_build_object('version_id', v_open.id, 'status', v_open.status, 'replayed', true);
  end if;
  if p_extract and p_toc_file is null then
    raise exception 'eng_add_curriculum_version: AI needs the table of contents (toc_file_required)' using errcode = '22023';
  end if;
  if p_toc_file is not null then
    v_file := english.eng_register_file(v_c.family_id, v_c.learner_id, 'curriculum_toc', p_toc_file, p_by);
  end if;
  v_status := case when p_extract then 'extracting' else 'draft' end;
  insert into english.curriculum_versions(curriculum_id, learner_id, version, source, status, toc_file_id, supersedes_version_id, created_by_member, updated_by_member, client_id)
  values (p_curriculum, v_c.learner_id, (select pg_catalog.max(v.version) + 1 from english.curriculum_versions v where v.curriculum_id = p_curriculum),
          case when p_extract then 'ai' else 'manual' end, v_status, v_file,
          (select v.id from english.curriculum_versions v where v.curriculum_id = p_curriculum and v.status = 'approved'), p_by, p_by, p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('version_id', v_id, 'status', v_status, 'replayed', false);
end
$$;

-- 4c. "Sửa mục lục / bảng nối" sau khi duyệt = nháp phiên bản mới, chép từ bản đang dùng (mã Unit giữ nguyên). Đã có nháp mở → trả nháp đó.
create or replace function english.eng_edit_curriculum(p_curriculum uuid, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_c english.curricula%rowtype;
  v_cur english.curriculum_versions%rowtype;
  v_open uuid;
  v_id uuid;
  v_payload jsonb;
begin
  if p_curriculum is null or p_by is null or p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) not between 8 and 100 then
    raise exception 'eng_edit_curriculum: curriculum, actor and client_id are required' using errcode = '22004';
  end if;
  select * into v_c from english.curricula c where c.id = p_curriculum for update;
  if not found then
    raise exception 'eng_edit_curriculum: curriculum not found' using errcode = 'P0002';
  end if;
  perform english.eng_curriculum_actor(p_by, v_c.learner_id, 'eng_edit_curriculum');
  select v.id into v_open from english.curriculum_versions v
  where v.curriculum_id = p_curriculum and v.status in ('extracting', 'ai_failed', 'draft');
  if v_open is not null then
    return pg_catalog.jsonb_build_object('id', v_open, 'replayed', true);
  end if;
  select * into v_cur from english.curriculum_versions v where v.curriculum_id = p_curriculum and v.status = 'approved';
  if not found then
    raise exception 'eng_edit_curriculum: there is no approved version to edit (not_approved)' using errcode = '23514';
  end if;
  v_payload := pg_catalog.jsonb_build_object(
    'units', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'code', u.code, 'title', u.title, 'section', u.section, 'page', u.page, 'skipped', u.skipped,
               'points', coalesce((select pg_catalog.jsonb_agg(p.tag_key order by p.ord) from english.curriculum_unit_points p
                                   where p.version_id = u.version_id and p.code = u.code), '[]'::jsonb),
               'missing_points', '[]'::jsonb, 'needs_review', false, 'review_reason', null, 'origin', 'kept', 'dropped', false, 'edit_reason', null)
             order by u.ord)
      from english.curriculum_units u where u.version_id = v_cur.id), '[]'::jsonb),
    'ignored', '[]'::jsonb);
  insert into english.curriculum_versions(curriculum_id, learner_id, version, source, status, payload, supersedes_version_id, created_by_member, updated_by_member, client_id)
  values (p_curriculum, v_c.learner_id, (select pg_catalog.max(v.version) + 1 from english.curriculum_versions v where v.curriculum_id = p_curriculum),
          'edit', 'draft', v_payload, v_cur.id, p_by, p_by, p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- 4d. Lưu nháp (nội dung đã được zod kiểm ở máy chủ). Khóa lạc quan theo updated_at (eng_same_instant của 0024).
create or replace function english.eng_save_curriculum_draft(p_version uuid, p_payload jsonb, p_base text, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_v english.curriculum_versions%rowtype;
  v_at timestamptz;
begin
  if p_version is null or p_payload is null or p_base is null or p_by is null then
    raise exception 'eng_save_curriculum_draft: version, payload, base and actor are required' using errcode = '22004';
  end if;
  select * into v_v from english.curriculum_versions v where v.id = p_version for update;
  if not found then
    raise exception 'eng_save_curriculum_draft: version not found' using errcode = 'P0002';
  end if;
  perform english.eng_curriculum_actor(p_by, v_v.learner_id, 'eng_save_curriculum_draft');
  if v_v.status not in ('draft', 'ai_failed') then
    raise exception 'eng_save_curriculum_draft: this version cannot be edited now (not_editable)' using errcode = '23514';
  end if;
  if not english.eng_same_instant(v_v.updated_at, p_base) then
    raise exception 'eng_save_curriculum_draft: the draft changed in the meantime (draft_changed)' using errcode = '23505';
  end if;
  update english.curriculum_versions set payload = p_payload, status = 'draft', error_code = null, updated_by_member = p_by
  where id = p_version
  returning updated_at into v_at;
  return pg_catalog.jsonb_build_object('updated_at', v_at::text);
end
$$;

-- 4e. Kết thúc phần AI (máy chủ, chạy nền). Chỉ đổi phiên bản còn 'extracting'. ai_payload = bản AI, giữ để đếm % dòng bị sửa.
create or replace function english.eng_finish_curriculum_extraction(p_version uuid, p_payload jsonb, p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n int;
begin
  update english.curriculum_versions set payload = p_payload, ai_payload = p_payload, status = 'draft', ai_run_id = p_run, error_code = null
  where id = p_version and status = 'extracting';
  get diagnostics v_n = row_count;
  return pg_catalog.jsonb_build_object('applied', v_n = 1);
end
$$;

create or replace function english.eng_fail_curriculum_extraction(p_version uuid, p_error text, p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n int;
begin
  if p_error is null or p_error !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'eng_fail_curriculum_extraction: error code required' using errcode = '22023';
  end if;
  update english.curriculum_versions set status = 'ai_failed', error_code = p_error, ai_run_id = coalesce(p_run, ai_run_id)
  where id = p_version and status = 'extracting';
  get diagnostics v_n = row_count;
  return pg_catalog.jsonb_build_object('applied', v_n = 1);
end
$$;

-- 4f. Bỏ nháp: gia sư HOẶC phụ huynh (D-W8: phụ huynh không duyệt thay, chỉ được bỏ; gia sư đã nghỉ không bỏ được — §8).
create or replace function english.eng_discard_curriculum_draft(p_version uuid, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_v english.curriculum_versions%rowtype;
begin
  select * into v_v from english.curriculum_versions v where v.id = p_version for update;
  if not found then
    raise exception 'eng_discard_curriculum_draft: version not found' using errcode = 'P0002';
  end if;
  perform english.eng_curriculum_actor(p_by, v_v.learner_id, 'eng_discard_curriculum_draft');
  if v_v.status not in ('extracting', 'ai_failed', 'draft') then
    raise exception 'eng_discard_curriculum_draft: this version is already final (not_editable)' using errcode = '23514';
  end if;
  update english.curriculum_versions set status = 'discarded', updated_by_member = p_by where id = p_version;
  return pg_catalog.jsonb_build_object('id', p_version, 'status', 'discarded');
end
$$;

-- 4g. DUYỆT (chỉ gia sư của em — D-W8). p_units = danh sách Unit cuối (máy chủ dựng từ nháp đã lưu, bỏ dòng "Bỏ"):
-- [{code, title, section, page, skipped, points:[tag_key]}]. Kiểm lại ở đây: mã, thứ tự, nhãn trong danh sách đóng; nháp không còn dòng
-- "cần xem". Sinh Unit + nối; bản đang dùng (nếu có) → 'superseded'.
create or replace function english.eng_approve_curriculum_version(p_version uuid, p_base text, p_units jsonb, p_review jsonb, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_v english.curriculum_versions%rowtype;
  v_c english.curricula%rowtype;
  v_m english.members%rowtype;
  v_u jsonb;
  v_o int;
  v_key text;
  v_n int;
begin
  if p_version is null or p_base is null or p_units is null or p_by is null then
    raise exception 'eng_approve_curriculum_version: version, base, units and actor are required' using errcode = '22004';
  end if;
  select * into v_v from english.curriculum_versions v where v.id = p_version for update;
  if not found then
    raise exception 'eng_approve_curriculum_version: version not found' using errcode = 'P0002';
  end if;
  select * into v_c from english.curricula c where c.id = v_v.curriculum_id for update;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'tutor' or not english.eng_actor_may_manage(p_by, v_v.learner_id) then
    raise exception 'eng_approve_curriculum_version: only a tutor of this learner approves a curriculum (tutor_only)' using errcode = '42501';
  end if;
  if v_v.status <> 'draft' then
    raise exception 'eng_approve_curriculum_version: only a saved draft is approved (not_draft)' using errcode = '23514';
  end if;
  if not english.eng_same_instant(v_v.updated_at, p_base) then
    raise exception 'eng_approve_curriculum_version: the draft changed in the meantime (draft_changed)' using errcode = '23505';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(v_v.payload -> 'units') x
             where coalesce((x ->> 'needs_review')::boolean, false) and not coalesce((x ->> 'dropped')::boolean, false)) then
    raise exception 'eng_approve_curriculum_version: some rows still need a look (needs_review_left)' using errcode = '23514';
  end if;
  if pg_catalog.jsonb_typeof(p_units) <> 'array' or pg_catalog.jsonb_array_length(p_units) not between 1 and 300 then
    raise exception 'eng_approve_curriculum_version: 1..300 units are required (bad_units)' using errcode = '22023';
  end if;
  if p_review is not null and (pg_catalog.jsonb_typeof(p_review) <> 'object' or pg_catalog.length(p_review::text) > 4000) then
    raise exception 'eng_approve_curriculum_version: review must be a small object (bad_review)' using errcode = '22023';
  end if;
  for v_u, v_o in select x, o from pg_catalog.jsonb_array_elements(p_units) with ordinality as t(x, o) loop
    if pg_catalog.jsonb_typeof(v_u) <> 'object'
       or coalesce(v_u ->> 'code', '') !~ '^[A-Z0-9][A-Z0-9-]{0,19}$'
       or pg_catalog.length(pg_catalog.btrim(coalesce(v_u ->> 'title', ''))) not between 1 and 160
       or (v_u -> 'page' is not null and pg_catalog.jsonb_typeof(v_u -> 'page') <> 'null'
           and (pg_catalog.jsonb_typeof(v_u -> 'page') <> 'number' or (v_u ->> 'page') !~ '^[0-9]{1,4}$'))
       or pg_catalog.jsonb_typeof(v_u -> 'skipped') is distinct from 'boolean'
       or pg_catalog.jsonb_typeof(v_u -> 'points') is distinct from 'array'
       or pg_catalog.jsonb_array_length(v_u -> 'points') > 12 then
      raise exception 'eng_approve_curriculum_version: unit % is not {code, title, section, page, skipped, points}', v_o using errcode = '22023';
    end if;
    if (select pg_catalog.count(distinct x) from pg_catalog.jsonb_array_elements_text(v_u -> 'points') x) <> pg_catalog.jsonb_array_length(v_u -> 'points') then
      raise exception 'eng_approve_curriculum_version: a point appears twice in unit % (duplicate_point)', v_u ->> 'code' using errcode = '23514';
    end if;
    for v_key in select x from pg_catalog.jsonb_array_elements_text(v_u -> 'points') x loop
      if not english.eng_tag_exists(v_c.track_id, v_c.family_id, v_key) then
        raise exception 'eng_approve_curriculum_version: a point of unit % is not in the list (unknown_point)', v_u ->> 'code' using errcode = '23514';
      end if;
    end loop;
  end loop;
  if (select pg_catalog.count(distinct x ->> 'code') from pg_catalog.jsonb_array_elements(p_units) x) <> pg_catalog.jsonb_array_length(p_units) then
    raise exception 'eng_approve_curriculum_version: unit codes must be unique (duplicate_code)' using errcode = '23514';
  end if;

  insert into english.curriculum_units(version_id, curriculum_id, learner_id, code, ord, title, section, page, skipped)
  select p_version, v_v.curriculum_id, v_v.learner_id, x ->> 'code', o::int, pg_catalog.btrim(x ->> 'title'),
         nullif(pg_catalog.btrim(coalesce(x ->> 'section', '')), ''), (x ->> 'page')::int, (x ->> 'skipped')::boolean
  from pg_catalog.jsonb_array_elements(p_units) with ordinality as t(x, o);
  insert into english.curriculum_unit_points(version_id, code, learner_id, tag_key, ord)
  select p_version, x ->> 'code', v_v.learner_id, k, ko::int
  from pg_catalog.jsonb_array_elements(p_units) as t(x)
  cross join lateral pg_catalog.jsonb_array_elements_text(x -> 'points') with ordinality as p(k, ko);

  update english.curriculum_versions set status = 'superseded', superseded_at = pg_catalog.clock_timestamp()
  where curriculum_id = v_v.curriculum_id and status = 'approved';
  update english.curriculum_versions
  set status = 'approved', approved_by_member = p_by, approved_at = pg_catalog.clock_timestamp(), review = p_review, updated_by_member = p_by
  where id = p_version;
  select pg_catalog.jsonb_array_length(p_units) into v_n;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'curriculum.approved', v_c.family_id, v_v.learner_id,
          pg_catalog.jsonb_build_object('curriculum', v_c.id, 'version', v_v.version, 'units', v_n));
  return pg_catalog.jsonb_build_object('version_id', p_version, 'version', v_v.version, 'units', v_n);
end
$$;

-- 4h. Đặt trạng thái một Unit (gia sư hoặc phụ huynh): một sự kiện mới, không xóa sự kiện cũ (§8 "sửa nhầm → đặt lại").
-- Mã Unit phải có trong phiên bản đang dùng. p_lesson_note: buổi học đã đề xuất việc này (tùy chọn, phải của em).
create or replace function english.eng_set_unit_status(
  p_curriculum uuid, p_unit_code text, p_status text, p_lesson_note uuid, p_by uuid, p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_c english.curricula%rowtype;
  v_m english.members%rowtype;
  v_cur uuid;
  v_prev english.curriculum_unit_events%rowtype;
  v_id uuid;
begin
  if p_curriculum is null or p_unit_code is null or p_status is null or p_by is null then
    raise exception 'eng_set_unit_status: curriculum, unit, status and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_set_unit_status: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if p_status not in ('not_started', 'in_progress', 'done', 'skipped') then
    raise exception 'eng_set_unit_status: unknown status (bad_status)' using errcode = '22023';
  end if;
  select * into v_c from english.curricula c where c.id = p_curriculum;
  if not found then
    raise exception 'eng_set_unit_status: curriculum not found' using errcode = 'P0002';
  end if;
  v_m := english.eng_curriculum_actor(p_by, v_c.learner_id, 'eng_set_unit_status');
  select * into v_prev from english.curriculum_unit_events e where e.learner_id = v_c.learner_id and e.client_id = p_client_id;
  if found then
    if v_prev.curriculum_id <> p_curriculum or v_prev.unit_code <> p_unit_code or v_prev.status <> p_status then
      raise exception 'eng_set_unit_status: client_id was already used for another change' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true);
  end if;
  select v.id into v_cur from english.curriculum_versions v where v.curriculum_id = p_curriculum and v.status = 'approved';
  if v_cur is null then
    raise exception 'eng_set_unit_status: the curriculum has no approved version yet (not_approved)' using errcode = '23514';
  end if;
  if not exists (select 1 from english.curriculum_units u where u.version_id = v_cur and u.code = p_unit_code) then
    raise exception 'eng_set_unit_status: the unit is not in the current version (unknown_unit)' using errcode = '23514';
  end if;
  if p_lesson_note is not null and not exists (select 1 from english.lesson_notes n where n.id = p_lesson_note and n.learner_id = v_c.learner_id) then
    raise exception 'eng_set_unit_status: lesson note not found' using errcode = 'P0002';
  end if;
  insert into english.curriculum_unit_events(curriculum_id, learner_id, unit_code, status, lesson_note_id, by_member, by_role, client_id)
  values (p_curriculum, v_c.learner_id, p_unit_code, p_status, p_lesson_note, p_by, v_m.role, p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'eng_create_curriculum(uuid, text, text, jsonb, boolean, uuid, text)',
    'eng_add_curriculum_version(uuid, jsonb, boolean, uuid, text)',
    'eng_edit_curriculum(uuid, uuid, text)',
    'eng_save_curriculum_draft(uuid, jsonb, text, uuid)',
    'eng_finish_curriculum_extraction(uuid, jsonb, uuid)',
    'eng_fail_curriculum_extraction(uuid, text, uuid)',
    'eng_discard_curriculum_draft(uuid, uuid)',
    'eng_approve_curriculum_version(uuid, text, jsonb, jsonb, uuid)',
    'eng_set_unit_status(uuid, text, text, uuid, uuid, text)'
  ] loop
    execute format('revoke execute on function english.%s from public, anon, authenticated', f);
    execute format('grant execute on function english.%s to service_role', f);
  end loop;
end
$$;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/db/curriculum.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0026_curriculum.sql tests/db/curriculum.test.ts
git commit -m "feat(w2): curriculum write functions — create, load contents, edit as new version, save, approve (tutor only), unit status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 3: AI purpose `curriculum_toc` + nhãn dạng câu nghe (R7) + `eng_skill_map`

**Files:**
- Modify: `db/migrations/0026_curriculum.sql` (mục 5 + 6, trước dòng `schema_migrations`)
- Create: `content/tags/listening_A.json`, `content/tags/listening_B.json`, `tests/unit/listeningTags.test.ts`
- Modify: `tests/db/curriculum.test.ts`, `tests/db/skillMap.test.ts`, `tests/db/tutorWork.test.ts`

**Interfaces:**
- Produces: `eng_ai_gate(p_learner uuid, p_estimate numeric default 0, p_reserve boolean default false, p_draft uuid default null, p_model text default null, p_by uuid default null, p_purpose text default 'studio_extract')` → như 0024; `eng_log_ai_run(p_family, p_draft, p_model, p_prompt_version, p_input, p_output, p_cost, p_status, p_error, p_by, p_release uuid default null, p_purpose text default 'studio_extract') returns uuid` (dòng trả giữ chỗ phải cùng purpose, nếu không `(bad_release)`); `ai_runs.purpose ∈ {studio_extract, curriculum_toc}`; nhãn `error_tags` mới `group_vi = 'Kỹ năng nghe'`, `origin = 'seed'`, `group_key ∈ li-*`; `eng_skill_map(uuid)` đặt nhãn có sẵn mang `group_key` vào nhóm (`custom: false`).
- Studio (`lib/studio/supabaseStore.ts`) **không đổi**: không gửi `p_purpose` → mặc định cũ (code cũ chạy được cả trước lẫn sau 0026).

- [ ] **Step 1: Content files (source of the seed)**

`content/tags/listening_A.json`:

```json
{
  "track": "A",
  "group_vi": "Kỹ năng nghe",
  "note": "Listening question types for KET/A2 (R7, DOMAIN §14). Seed tags of migration 0026 with a skill-map group of the Nghe domain (SM-1 is published, so no leaf). 🕓 tutor to confirm.",
  "tags": [
    {"key": "nghe-main-idea", "label_vi": "Nghe · Main idea — Ý chính", "group_key": "li-gist-detail"},
    {"key": "nghe-details", "label_vi": "Nghe · Details — Chi tiết", "group_key": "li-gist-detail"},
    {"key": "nghe-numbers-spelling", "label_vi": "Nghe · Numbers & spelling — Số, tên, đánh vần", "group_key": "li-sound"},
    {"key": "nghe-feelings", "label_vi": "Nghe · Feelings — Cảm xúc người nói", "group_key": "li-attitude"},
    {"key": "nghe-sequence", "label_vi": "Nghe · Sequence — Trình tự", "group_key": "li-argument-notes"}
  ]
}
```

`content/tags/listening_B.json`:

```json
{
  "track": "B",
  "group_vi": "Kỹ năng nghe",
  "note": "Listening question types for Listening & Notetaking 1 / exam listening (R7, DOMAIN §14). Seed tags of migration 0026 with a skill-map group of the Nghe domain (SM-1 is published, so no leaf). 🕓 tutor to confirm.",
  "tags": [
    {"key": "nghe-main-idea", "label_vi": "Nghe · Main idea — Ý chính", "group_key": "li-gist-detail"},
    {"key": "nghe-details", "label_vi": "Nghe · Details — Chi tiết, số liệu", "group_key": "li-gist-detail"},
    {"key": "nghe-attitude", "label_vi": "Nghe · Attitude & opinion — Thái độ, quan điểm", "group_key": "li-attitude"},
    {"key": "nghe-inference", "label_vi": "Nghe · Inference — Hàm ý, suy luận", "group_key": "li-attitude"},
    {"key": "nghe-purpose", "label_vi": "Nghe · Speaker's purpose — Mục đích người nói", "group_key": "li-attitude"},
    {"key": "nghe-signposts", "label_vi": "Nghe · Signposts — Từ báo hiệu bố cục", "group_key": "li-argument-notes"},
    {"key": "nghe-notetaking", "label_vi": "Nghe · Note-taking — Ghi chép ý chính", "group_key": "li-argument-notes"},
    {"key": "nghe-connected-speech", "label_vi": "Nghe · Connected speech — Nối âm, nói nhanh", "group_key": "li-sound"}
  ]
}
```

- [ ] **Step 2: Failing tests**

`tests/unit/listeningTags.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

type ListeningFile = { track: string; group_vi: string; tags: { key: string; label_vi: string; group_key: string }[] };
const read = (f: string) => JSON.parse(readFileSync(path.join(CONTENT_DIR, "tags", f), "utf8")) as ListeningFile;
const sm1 = JSON.parse(readFileSync(path.join(CONTENT_DIR, "skill_map", "SM-1.json"), "utf8")) as { domains: { key: string; groups: { key: string }[] }[] };
const sql = readFileSync(path.join(MIGRATIONS_DIR, "0026_curriculum.sql"), "utf8");

describe("listening question-type tags (W2, R7)", () => {
  const files = ["listening_A.json", "listening_B.json"].map(read);
  it("Track A has 5 and Track B 8, group 'Kỹ năng nghe', every group_key a group of the Nghe domain of SM-1", () => {
    const listening = new Set(sm1.domains.find((d) => d.key === "listening")!.groups.map((g) => g.key));
    expect(files.map((f) => [f.track, f.group_vi, f.tags.length])).toEqual([["A", "Kỹ năng nghe", 5], ["B", "Kỹ năng nghe", 8]]);
    for (const f of files) for (const t of f.tags) {
      expect(t.key).toMatch(/^nghe-[a-z0-9-]+$/);
      expect(listening.has(t.group_key), t.key).toBe(true);
      expect(t.label_vi).toMatch(/^Nghe · [A-Z][^—]+ — \S/);
    }
  });
  it("migration 0026 seeds exactly these rows, in this order", () => {
    const rows = [...sql.matchAll(/\('([AB])', (\d+), '(nghe-[a-z0-9-]+)', '((?:[^']|'')+)', '([a-z-]+)'\)/g)].map((m) => ({
      track: m[1], ord: Number(m[2]), key: m[3], label_vi: m[4]!.replace(/''/g, "'"), group_key: m[5],
    }));
    const want = files.flatMap((f) => f.tags.map((t, i) => ({ track: f.track, ord: i + 1, ...t })));
    expect(rows).toEqual(want);
  });
});
```

Trong `tests/db/curriculum.test.ts`, chèn trước `});` cuối file:

```ts
  describe("4. AI purpose and listening tags", () => {
    it("reservation and release carry the purpose; old calls (no purpose) still mean studio_extract", async () => {
      await q1("insert into english.ai_settings(family_id, enabled) values ($1, true) on conflict (family_id) do update set enabled = true", [s.familyId]);
      await q1("insert into english.consents(learner_id, subject_member_id, notice_version, scope, granted, recorded_by) values ($1,$2,'ai-studio-v1','ai_text',true,$2)", [NG(), M().parent]);
      const g = await svc<{ allowed: boolean; reservation_id: string }>("select english.eng_ai_gate($1, 0.2, true, null, 'claude-sonnet-5-5', $2, 'curriculum_toc') as r", [NG(), M().tutorNguyen]);
      expect(g.allowed).toBe(true);
      expect(await q1("select purpose from english.ai_runs where id = $1", [g.reservation_id])).toEqual([{ purpose: "curriculum_toc" }]);
      await fail(svc("select english.eng_log_ai_run($1,null,'claude-sonnet-5-5','curriculum-toc.v1',10,10,0.01,'ok',null,$2,$3,'studio_extract') as r", [s.familyId, M().tutorNguyen, g.reservation_id]), "23514", /\(bad_release\)/);
      const run = await svc<string>("select english.eng_log_ai_run($1,null,'claude-sonnet-5-5','curriculum-toc.v1',10,10,0.01,'ok',null,$2,$3,'curriculum_toc') as r", [s.familyId, M().tutorNguyen, g.reservation_id]);
      expect(await q1("select purpose, prompt_version from english.ai_runs where id = $1", [run])).toEqual([{ purpose: "curriculum_toc", prompt_version: "curriculum-toc.v1" }]);
      const old = await svc<{ reservation_id: string }>("select english.eng_ai_gate($1, 0.1, true, null, 'claude-sonnet-5-5', $2) as r", [NG(), M().tutorNguyen]);
      expect(await q1("select purpose from english.ai_runs where id = $1", [old.reservation_id])).toEqual([{ purpose: "studio_extract" }]);
      await fail(svc("select english.eng_ai_gate($1, 0, false, null, null, null, 'chat') as r", [NG()]), "22023", /\(bad_purpose\)/);
    });
    it("listening question-type tags exist for both tracks with a listening group, are placed in the map, and only they may carry a seed group", async () => {
      expect(await q1("select track_id, count(*)::int as n from english.error_tags where group_vi = 'Kỹ năng nghe' group by track_id order by track_id")).toEqual([
        { track_id: "A", n: 5 }, { track_id: "B", n: 8 },
      ]);
      expect(await q1("select count(*)::int as n from english.error_tags where group_vi = 'Kỹ năng nghe' and group_key not like 'li-%'")).toEqual([{ n: 0 }]);
      const map = await svc<{ domains: { key: string; groups: { key: string; leaves: { ref_key: string; custom: boolean }[] }[] }[]; unassigned: { ref_key: string }[] }>(
        "select english.eng_skill_map($1) as r", [NG()]);
      const gist = map.domains.find((d) => d.key === "listening")!.groups.find((g) => g.key === "li-gist-detail")!;
      expect(gist.leaves.filter((l) => l.ref_key.startsWith("nghe-")).map((l) => [l.ref_key, l.custom])).toEqual([["nghe-details", false], ["nghe-main-idea", false]]);
      expect(map.unassigned.some((l) => l.ref_key.startsWith("nghe-"))).toBe(false);
      await fail(q1("update english.error_tags set group_key = 'vo-word-form' where track_id = 'B' and key = 'dang-tu'"), "23514");
    });
  });

```

Sửa test cũ vì nhãn nghe là nhãn có sẵn KHÔNG có lá (SM-1 bất biến) và làm tăng số nhãn:

- `tests/db/skillMap.test.ts`, test "every seed tag still in use has exactly one leaf…": trong câu SQL, thay `where t.family_id is null and t.retired_at is null` bằng `where t.family_id is null and t.retired_at is null and t.group_key is null`.
- cùng file, test "Nguyên (B): 7 domains…": `expect(tags.filter((l) => !l.custom)).toHaveLength(24);` → `expect(tags.filter((l) => !l.custom)).toHaveLength(32); // 24 tags with a leaf + 8 listening tags of 0026 (group_key)`.
- cùng file, test "An (A): 16 tags…": `expect(all.filter((l) => l.kind === "tag")).toHaveLength(16);` → `expect(all.filter((l) => l.kind === "tag")).toHaveLength(21); // 16 + 5 listening tags of 0026`.
- `tests/db/tutorWork.test.ts` dòng ~193–194 (hai câu đếm `toBe(10)`): thay `group_vi is distinct from 'Kỹ năng đọc'` bằng `group_vi is distinct from 'Kỹ năng đọc' and group_vi is distinct from 'Kỹ năng nghe'` (cả hai dòng).

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/unit/listeningTags.test.ts tests/db/curriculum.test.ts -t "listening|purpose"`
Expected: FAIL — migration chưa có các dòng `('A', 1, 'nghe-main-idea', …)`; `eng_ai_gate` chưa nhận tham số thứ 7.

- [ ] **Step 4: Write sections 5 and 6 (before the `schema_migrations` line)**

```sql
-- 5. AI: việc mới "đọc mục lục" ------------------------------------------------------------------------------------------------------
alter table english.ai_runs drop constraint if exists ai_runs_purpose_check;
alter table english.ai_runs add constraint ai_runs_purpose_check check (purpose in ('studio_extract', 'curriculum_toc'));

-- Cổng AI = bản 0024 + p_purpose (cuối, mặc định 'studio_extract') cho dòng giữ chỗ. Chữ ký cũ bỏ để không còn hai bản trùng tên.
drop function if exists english.eng_ai_gate(uuid, numeric, boolean, uuid, text, uuid);
create or replace function english.eng_ai_gate(
  p_learner uuid, p_estimate numeric default 0, p_reserve boolean default false, p_draft uuid default null, p_model text default null, p_by uuid default null,
  p_purpose text default 'studio_extract'
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_s english.ai_settings%rowtype;
  v_consent boolean;
  v_spent numeric;
  v_cap numeric;
  v_soft numeric;
  v_est numeric := coalesce(p_estimate, 0);
  v_reason text;
  v_run uuid;
begin
  if v_est < 0 then
    raise exception 'eng_ai_gate: the estimate cannot be negative' using errcode = '22023';
  end if;
  if p_purpose is null or p_purpose not in ('studio_extract', 'curriculum_toc') then
    raise exception 'eng_ai_gate: unknown purpose (bad_purpose)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_ai_gate: learner not found' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('eng_ai_gate:' || v_l.family_id::text, 0));
  select * into v_s from english.ai_settings s where s.family_id = v_l.family_id;
  select c.granted into v_consent from english.consents c
  where c.learner_id = p_learner and c.scope = 'ai_text' order by c.at desc, c.id desc limit 1;
  v_spent := english.eng_ai_month_spent(v_l.family_id);
  v_cap := coalesce(v_s.monthly_cap_usd, 10);
  v_soft := coalesce(v_s.soft_cap_usd, 8);
  v_reason := case when not coalesce(v_s.enabled, false) then 'off'
                   when not coalesce(v_consent, false) then 'no_consent'
                   when v_spent + v_est >= v_cap then 'cap'
                   else null end;
  if v_reason is null and p_reserve then
    insert into english.ai_runs(family_id, purpose, draft_id, model, input_tokens, output_tokens, cost_usd, status, error_code, by_member)
    values (v_l.family_id, p_purpose, p_draft, p_model, 0, 0, v_est, 'reserved', 'reserved', p_by)
    returning id into v_run;
  end if;
  return pg_catalog.jsonb_build_object(
    'family_id', v_l.family_id,
    'enabled', coalesce(v_s.enabled, false),
    'consent', coalesce(v_consent, false),
    'spent_usd', v_spent,
    'monthly_cap_usd', v_cap,
    'soft_cap_usd', v_soft,
    'soft_reached', v_spent >= v_soft,
    'allowed', v_reason is null,
    'reason', v_reason,
    'reservation_id', v_run);
end
$$;
revoke execute on function english.eng_ai_gate(uuid, numeric, boolean, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_ai_gate(uuid, numeric, boolean, uuid, text, uuid, text) to service_role;

-- Sổ chạy AI = bản 0024 + p_purpose (cuối). Dòng trả giữ chỗ phải cùng việc với dòng giữ chỗ.
drop function if exists english.eng_log_ai_run(uuid, uuid, text, text, int, int, numeric, text, text, uuid, uuid);
create or replace function english.eng_log_ai_run(
  p_family uuid, p_draft uuid, p_model text, p_prompt_version text, p_input int, p_output int, p_cost numeric, p_status text, p_error text, p_by uuid,
  p_release uuid default null, p_purpose text default 'studio_extract'
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_family is null or p_status is null then
    raise exception 'eng_log_ai_run: family and status are required' using errcode = '22004';
  end if;
  if p_purpose is null or p_purpose not in ('studio_extract', 'curriculum_toc') then
    raise exception 'eng_log_ai_run: unknown purpose (bad_purpose)' using errcode = '22023';
  end if;
  if p_release is not null then
    perform 1 from english.ai_runs r
    where r.id = p_release and r.family_id = p_family and r.status = 'reserved' and r.purpose = p_purpose
      and not exists (select 1 from english.ai_runs x where x.releases_run_id = r.id)
    for update;
    if not found then
      raise exception 'eng_log_ai_run: p_release must be an unreleased reservation of this family (bad_release)' using errcode = '23514';
    end if;
  end if;
  insert into english.ai_runs(family_id, purpose, draft_id, model, prompt_version, input_tokens, output_tokens, cost_usd, status, error_code, by_member, releases_run_id)
  values (p_family, p_purpose, p_draft, p_model, p_prompt_version, coalesce(p_input, 0), coalesce(p_output, 0), coalesce(p_cost, 0), p_status, p_error, p_by, p_release)
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function english.eng_log_ai_run(uuid, uuid, text, text, int, int, numeric, text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_log_ai_run(uuid, uuid, text, text, int, int, numeric, text, text, uuid, uuid, text) to service_role;

```

Mục 6: nhãn nghe + `eng_skill_map` = **nguyên văn bản 0019** (`sed -n '/create or replace function english.eng_skill_map(p_learner uuid)/,/^\$\$;/p' db/migrations/0019_skill_map.sql`) chỉ thay khối "nhãn riêng của gia đình đã có nhóm" — bản đầy đủ đã thay:

```sql
-- 6. Nhãn dạng câu nghe (R7) -----------------------------------------------------------------------------------------------------------
-- Nới (chỉ rộng hơn): nhãn riêng như cũ; thêm nhãn CÓ SẴN có khóa 'nghe-…' (nhãn sau SM-1, không có lá trong bản đồ đã công bố).
alter table english.error_tags drop constraint if exists error_tags_group_key_shape;
alter table english.error_tags add constraint error_tags_group_key_shape check (
  group_key is null
  or (group_key ~ '^[a-z]{2}-[a-z-]{2,30}$'
      and (origin = 'custom' or (origin = 'seed' and family_id is null and key ~ '^nghe-[a-z0-9-]+$'))));

-- Nguồn: content/tags/listening_A.json, content/tags/listening_B.json (test đối chiếu từng dòng). Thứ tự = created_at cách nhau 1 ms.
insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin, group_key, created_at)
select v.track_id, v.key, v.label_vi, 'Kỹ năng nghe', null, 'seed', v.group_key,
  pg_catalog.clock_timestamp() + v.ord * interval '1 millisecond'
from (values
  ('A', 1, 'nghe-main-idea', 'Nghe · Main idea — Ý chính', 'li-gist-detail'),
  ('A', 2, 'nghe-details', 'Nghe · Details — Chi tiết', 'li-gist-detail'),
  ('A', 3, 'nghe-numbers-spelling', 'Nghe · Numbers & spelling — Số, tên, đánh vần', 'li-sound'),
  ('A', 4, 'nghe-feelings', 'Nghe · Feelings — Cảm xúc người nói', 'li-attitude'),
  ('A', 5, 'nghe-sequence', 'Nghe · Sequence — Trình tự', 'li-argument-notes'),
  ('B', 1, 'nghe-main-idea', 'Nghe · Main idea — Ý chính', 'li-gist-detail'),
  ('B', 2, 'nghe-details', 'Nghe · Details — Chi tiết, số liệu', 'li-gist-detail'),
  ('B', 3, 'nghe-attitude', 'Nghe · Attitude & opinion — Thái độ, quan điểm', 'li-attitude'),
  ('B', 4, 'nghe-inference', 'Nghe · Inference — Hàm ý, suy luận', 'li-attitude'),
  ('B', 5, 'nghe-purpose', 'Nghe · Speaker''s purpose — Mục đích người nói', 'li-attitude'),
  ('B', 6, 'nghe-signposts', 'Nghe · Signposts — Từ báo hiệu bố cục', 'li-argument-notes'),
  ('B', 7, 'nghe-notetaking', 'Nghe · Note-taking — Ghi chép ý chính', 'li-argument-notes'),
  ('B', 8, 'nghe-connected-speech', 'Nghe · Connected speech — Nối âm, nói nhanh', 'li-sound')
) as v(track_id, ord, key, label_vi, group_key)
on conflict (track_id, key) do nothing;

-- Bản đồ cho một em = bản 0019 + nhãn có sẵn mang group_key (nhãn nghe) được đặt vào nhóm của nó (không còn ở "Chưa xếp mảng").
create or replace function english.eng_skill_map(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_map english.skill_maps%rowtype;
  v_set text[];
begin
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_skill_map: learner not found' using errcode = 'P0002';
  end if;
  select * into v_map from english.skill_maps m where m.published_at is not null order by m.published_at desc, m.id desc limit 1;
  if not found then
    raise exception 'eng_skill_map: no published skill map' using errcode = 'P0002';
  end if;
  select d.target_ids into v_set
  from english.target_sets ts
  join english.target_set_definitions d on d.id = ts.definition_id
  where ts.learner_id = p_learner and ts.effective_from <= pg_catalog.now()
  order by ts.effective_from desc, ts.seq desc
  limit 1;
  v_set := coalesce(v_set, '{}'::text[]);

  return (
    with leaves as (
      -- nhãn có sẵn của track em (kể cả lá ẩn khỏi ô chọn và nhãn đã nghỉ dùng: dấu nhãn cũ vẫn cần tên và mảng)
      select lf.group_key, 0 as o1, lf.ord as o2, t.label_vi as o3,
             pg_catalog.jsonb_build_object(
               'kind', 'tag', 'track_id', lf.track_id, 'ref_key', lf.ref_key, 'label_vi', t.label_vi,
               'level_from', lf.level_from, 'level_to', lf.level_to, 'task_from', lf.task_from, 'task_to', lf.task_to,
               'core', lf.core, 'hidden_in_picker', lf.hidden_in_picker, 'related', pg_catalog.to_jsonb(lf.related),
               'custom', false, 'in_set', false) as leaf
      from english.skill_leaves lf
      join english.error_tags t on t.track_id = lf.track_id and t.key = lf.ref_key and t.family_id is null
      where lf.map_id = v_map.id and lf.kind = 'tag' and lf.track_id = v_l.track_id
      union all
      -- nhãn có nhóm riêng (group_key): nhãn riêng của gia đình (kể cả đã nghỉ dùng; ô chọn tự bỏ nhãn đã nghỉ) và, từ 0026, nhãn có sẵn
      -- ra đời sau SM-1 (nhãn nghe 'nghe-…'): nhãn có sẵn trước, theo thứ tự tạo
      select t.group_key, 1, case when t.origin = 'seed' then 0 else 1 end, t.label_vi,
             pg_catalog.jsonb_build_object(
               'kind', 'tag', 'track_id', t.track_id, 'ref_key', t.key, 'label_vi', t.label_vi,
               'level_from', null, 'level_to', null, 'task_from', null, 'task_to', null,
               'core', false, 'hidden_in_picker', false, 'related', '[]'::jsonb, 'custom', t.origin = 'custom', 'in_set', false)
      from english.error_tags t
      where (t.family_id = v_l.family_id or (t.family_id is null and t.origin = 'seed')) and t.track_id = v_l.track_id and t.group_key is not null
        and exists (select 1 from english.skill_groups g where g.map_id = v_map.id and g.key = t.group_key)
      union all
      -- mọi kỹ năng danh mục của bản đồ; "trong bộ" = trong bộ kỹ năng hiện tại của em
      select lf.group_key, case when lf.ref_key = any (v_set) then 2 else 3 end, lf.ord, tg.title_vi,
             pg_catalog.jsonb_build_object(
               'kind', 'target', 'track_id', lf.track_id, 'ref_key', lf.ref_key, 'label_vi', tg.title_vi,
               'level_from', lf.level_from, 'level_to', lf.level_to, 'task_from', lf.task_from, 'task_to', lf.task_to,
               'core', lf.core, 'hidden_in_picker', lf.hidden_in_picker, 'related', pg_catalog.to_jsonb(lf.related),
               'custom', false, 'in_set', lf.ref_key = any (v_set))
      from english.skill_leaves lf
      join english.targets tg on tg.id = lf.ref_key and tg.descriptor_version = v_map.catalogue_version
      where lf.map_id = v_map.id and lf.kind = 'target'
    ),
    loose as (
      -- nhãn đang dùng của track em (có sẵn hoặc của gia đình) chưa có nhóm trong bản đồ
      select t.created_at, t.label_vi,
             pg_catalog.jsonb_build_object(
               'kind', 'tag', 'track_id', t.track_id, 'ref_key', t.key, 'label_vi', t.label_vi,
               'level_from', null, 'level_to', null, 'task_from', null, 'task_to', null,
               'core', false, 'hidden_in_picker', false, 'related', '[]'::jsonb, 'custom', t.origin = 'custom', 'in_set', false) as leaf
      from english.error_tags t
      where t.track_id = v_l.track_id and t.retired_at is null and (t.family_id is null or t.family_id = v_l.family_id)
        and not exists (select 1 from english.skill_leaves lf
                        where lf.map_id = v_map.id and lf.kind = 'tag' and lf.track_id = t.track_id and lf.ref_key = t.key)
        and not (t.group_key is not null
                 and exists (select 1 from english.skill_groups g where g.map_id = v_map.id and g.key = t.group_key))
    )
    select pg_catalog.jsonb_build_object(
      'map_id', v_map.id,
      'track_id', v_l.track_id,
      'assumed', coalesce(v_map.assumed -> v_l.track_id, '{}'::jsonb),
      'domains', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'key', d.key, 'name_vi', d.name_vi, 'scale', d.scale,
            'groups', (
              select coalesce(pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'key', g.key, 'name_vi', g.name_vi, 'desc', g.descriptions,
                  'leaves', (select coalesce(pg_catalog.jsonb_agg(x.leaf order by x.o1, x.o2, x.o3), '[]'::jsonb)
                             from leaves x where x.group_key = g.key))
                order by g.ord), '[]'::jsonb)
              from english.skill_groups g where g.map_id = v_map.id and g.domain_key = d.key))
          order by d.ord)
        from english.skill_domains d where d.map_id = v_map.id),
      'unassigned', (select coalesce(pg_catalog.jsonb_agg(u.leaf order by u.created_at, u.label_vi), '[]'::jsonb) from loose u))
  );
end
$$;
revoke execute on function english.eng_skill_map(uuid) from public, anon, authenticated;
grant execute on function english.eng_skill_map(uuid) to service_role;
```

- [ ] **Step 5: Run**

Run: `npx vitest run tests/unit/listeningTags.test.ts tests/db/curriculum.test.ts tests/db/skillMap.test.ts tests/db/tutorWork.test.ts tests/db/studio.test.ts tests/db/studioReview.test.ts`
Expected: PASS (Studio vẫn xanh: `eng_ai_gate` / `eng_log_ai_run` gọi không có `p_purpose` vẫn ghi `studio_extract`).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0026_curriculum.sql content/tags/listening_A.json content/tags/listening_B.json tests/unit/listeningTags.test.ts tests/db/curriculum.test.ts tests/db/skillMap.test.ts tests/db/tutorWork.test.ts
git commit -m "feat(w2): AI purpose curriculum_toc; listening question-type seed tags with a listening group (R7); skill map places them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 4: Ghi buổi v3 (Unit đã dạy) + purge + kiểm tĩnh migration

**Files:**
- Modify: `db/migrations/0026_curriculum.sql` (mục 7 + 8), `tests/db/curriculum.test.ts`, `tests/db/migrations.test.ts`, `lib/copy/vi.ts` (`purgePage.countLabels`)
- Create: `tests/unit/migration0026.test.ts`

**Interfaces:**
- Produces: `eng_write_lesson_note_v3(p_learner uuid, p_session_date date, p_studied text, p_weak_tags text[], p_message text, p_note_for_parent text, p_rechecks jsonb, p_supersedes uuid, p_by uuid, p_client_id text, p_practised_target_ids text[] default '{}', p_taught_units jsonb default '[]') returns jsonb` → `{id, replayed}` (gọi nguyên `eng_write_lesson_note_v2` rồi ghi `lesson_note_units`); biên nhận / đếm purge thêm khóa `curricula`, `curriculum_versions`, `curriculum_units`, `curriculum_unit_points`, `curriculum_unit_events`, `lesson_note_units`.

- [ ] **Step 1: Failing tests**

Trong `tests/db/curriculum.test.ts`, chèn trước `});` cuối file:

```ts
  describe("5. lesson note v3 (Unit đã dạy hôm nay)", () => {
    it("records taught units of the CURRENT version; empty 'studied' becomes the unit names; replays and wrong units are refused; v2 is unchanged", async () => {
      const c = await create(M().tutorNguyen, { title: "Destination (ghi buổi)" });
      await save(c.version_id, twentySix());
      await approve(c.version_id, twentySix());
      const cur = c.curriculum_id;
      const call = (units: unknown, clientId: string = randomUUID(), studied: string | null = null) =>
        svc<{ id: string; replayed: boolean }>(
          "select english.eng_write_lesson_note_v3($1, current_date, $2, '{}', null, null, '[]'::jsonb, null, $3, $4, '{}', $5::jsonb) as r",
          [NG(), studied, M().tutorNguyen, clientId, JSON.stringify(units)]);
      const cid = `ln-${randomUUID()}`;
      const r = await call([{ curriculum_id: cur, unit_code: "U13" }], cid);
      expect(await q1("select goals from english.lesson_notes where id = $1", [r.id])).toEqual([{ goals: "U13 · Unit 13" }]);
      expect(await q1("select unit_code, version_id = (select id from english.curriculum_versions where curriculum_id = $2 and status = 'approved') as cur from english.lesson_note_units where lesson_note_id = $1", [r.id, cur]))
        .toEqual([{ unit_code: "U13", cur: true }]);
      expect(await call([{ curriculum_id: cur, unit_code: "U13" }], cid)).toEqual({ id: r.id, replayed: true });
      await fail(call([{ curriculum_id: cur, unit_code: "U14" }], cid), "23505");
      await fail(call([{ curriculum_id: cur, unit_code: "U99" }]), "23514", /\(unknown_unit\)/);
      await fail(call([{ curriculum_id: cur, unit_code: "U1" }, { curriculum_id: cur, unit_code: "U1" }]), "22023", /\(bad_units\)/);
      const anCur = await create(M().tutorAn, { learner: AN(), title: "Global Success 6" });
      await fail(call([{ curriculum_id: anCur.curriculum_id, unit_code: "U1" }]), "23514", /\(unknown_unit\)/);
      const plain = await svc<{ id: string }>(
        "select english.eng_write_lesson_note_v2($1, current_date, 'Ôn U12', '{}', null, null, '[]'::jsonb, null, $2, $3) as r", [NG(), M().tutorNguyen, randomUUID()]);
      expect(await q1("select count(*)::int as n from english.lesson_note_units where lesson_note_id = $1", [plain.id])).toEqual([{ n: 0 }]);
    });

  });

  describe("6. purge", () => {
    it("dry run and purge count the six curriculum tables the same way", async () => {
      const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử xóa W2','B',true,'active') returning id", [s.familyId]))[0]!.id;
      await q1("insert into english.relationships(member_id, learner_id, relation) values ($1,$2,'tutor')", [M().tutorNguyen, L]);
      const c = await create(M().tutorNguyen, { learner: L, file: pdf() });
      const u = [unitRow(1, ["cum-dong-tu"]), unitRow(2)];
      await save(c.version_id, u);
      await approve(c.version_id, u);
      await setStatus(c.curriculum_id, "U1", "in_progress");
      await svc("select english.eng_write_lesson_note_v3($1, current_date, null, '{}', null, null, '[]'::jsonb, null, $2, $3, '{}', $4::jsonb) as r",
        [L, M().tutorNguyen, randomUUID(), JSON.stringify([{ curriculum_id: c.curriculum_id, unit_code: "U1" }])]);
      const want = { curricula: 1, curriculum_versions: 1, curriculum_units: 2, curriculum_unit_points: 1, curriculum_unit_events: 1, lesson_note_units: 1 };
      const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
      expect(dry.counts).toMatchObject(want);
      const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
      expect(receipt.deleted).toMatchObject({ ...want, files: 1 });
      expect(Object.keys(receipt.deleted).sort()).toEqual(Object.keys(dry.counts).sort());
      expect(await q1("select count(*)::int as n from english.curriculum_versions where learner_id = $1", [L])).toEqual([{ n: 0 }]);
    });
  });
```

`tests/unit/migration0026.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0026_curriculum.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const NEW_TABLES = ["curricula", "curriculum_versions", "curriculum_units", "curriculum_unit_points", "curriculum_unit_events", "lesson_note_units"];

describe("0026_curriculum.sql", () => {
  it("ends by recording its own version, is expand-only, never touches schema public, grants table by table", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0026') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column\s+\w+\s+type/i);
    // the only drops: the old signatures of the two AI functions that get a trailing p_purpose
    expect([...code.matchAll(/drop\s+function\s+if\s+exists\s+english\.(\w+)/gi)].map((m) => m[1]).sort()).toEqual(["eng_ai_gate", "eng_log_ai_run"]);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });
  it("new tables: RLS on, read through eng_is_staff_of, no direct writes; the old lesson-note functions are not redefined", () => {
    for (const t of NEW_TABLES) expect(code, t).toContain(`alter table english.${t} enable row level security;`);
    expect(code).toContain("create policy %I on english.%I for select to authenticated using (english.eng_is_staff_of(learner_id))");
    expect(code).not.toMatch(/create or replace function english\.eng_write_lesson_note(_v2)?\(/);
    expect(code).toMatch(/create or replace function english\.eng_write_lesson_note_v3\(/);
  });
  it("approving is tutor-only in the database too (D-W8)", () => {
    const start = code.indexOf("create or replace function english.eng_approve_curriculum_version(");
    const body = code.slice(start, code.indexOf("\n$$;", start));
    expect(body).toMatch(/v_m\.role <> 'tutor'/);
    expect(body).toContain("(tutor_only)");
  });
});
```

`tests/db/migrations.test.ts`: trong **cả hai** danh sách (test "RLS is enabled on every english table" và "authenticated only has SELECT…") thêm, đúng thứ tự chữ cái, 6 tên `"curricula", "curriculum_unit_events", "curriculum_unit_points", "curriculum_units", "curriculum_versions", "lesson_note_units"`. (Nếu W1 chưa thêm 4 bảng của 0025 thì thêm luôn `"app_feedback", "app_feedback_events", "learner_intake", "teaching_notes"` — cả 4 đều đọc được bởi `authenticated`.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/db/curriculum.test.ts tests/unit/migration0026.test.ts`
Expected: FAIL — `eng_write_lesson_note_v3` không có; `counts.curricula` undefined.

- [ ] **Step 3: Section 7 (before the `schema_migrations` line)**

```sql
-- 7. Ghi buổi học v3 = v2 (không đổi) + Unit đã dạy: [{curriculum_id, unit_code}] ≤ 6, mỗi Unit trong phiên bản đang dùng của một
-- giáo trình của em. Không ghi gì ở "Hôm nay học" mà có Unit → ô đó = "U13 · Unreal time; …" (≤ 300). Gửi lại: Unit phải giống lần đầu.
create or replace function english.eng_write_lesson_note_v3(
  p_learner uuid,
  p_session_date date,
  p_studied text,
  p_weak_tags text[],
  p_message text,
  p_note_for_parent text,
  p_rechecks jsonb,
  p_supersedes uuid,
  p_by uuid,
  p_client_id text,
  p_practised_target_ids text[] default '{}',
  p_taught_units jsonb default '[]'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_units jsonb := coalesce(p_taught_units, '[]'::jsonb);
  v_rows jsonb := '[]'::jsonb;
  v_item jsonb;
  v_cur uuid;
  v_title text;
  v_studied text := nullif(pg_catalog.btrim(coalesce(p_studied, '')), '');
  v_labels text[] := '{}';
  v_r jsonb;
  v_note uuid;
begin
  if p_learner is null then
    raise exception 'eng_write_lesson_note_v3: learner is required' using errcode = '22004';
  end if;
  if pg_catalog.jsonb_typeof(v_units) <> 'array' or pg_catalog.jsonb_array_length(v_units) > 6 then
    raise exception 'eng_write_lesson_note_v3: taught units must be a list of at most 6 (bad_units)' using errcode = '22023';
  end if;
  for v_item in select x from pg_catalog.jsonb_array_elements(v_units) x loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'curriculum_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_item ->> 'unit_code', '') !~ '^[A-Z0-9][A-Z0-9-]{0,19}$' then
      raise exception 'eng_write_lesson_note_v3: each taught unit is {curriculum_id, unit_code} (bad_units)' using errcode = '22023';
    end if;
    select v.id into v_cur from english.curriculum_versions v
    join english.curricula c on c.id = v.curriculum_id
    where v.curriculum_id = (v_item ->> 'curriculum_id')::uuid and c.learner_id = p_learner and v.status = 'approved';
    select u.title into v_title from english.curriculum_units u where u.version_id = v_cur and u.code = v_item ->> 'unit_code';
    if v_cur is null or v_title is null then
      raise exception 'eng_write_lesson_note_v3: a taught unit is not in a current curriculum of this learner (unknown_unit)' using errcode = '23514';
    end if;
    v_rows := v_rows || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'curriculum_id', v_item ->> 'curriculum_id', 'unit_code', v_item ->> 'unit_code', 'version_id', v_cur));
    v_labels := v_labels || ((v_item ->> 'unit_code') || ' · ' || v_title);
    v_cur := null;
    v_title := null;
  end loop;
  if (select pg_catalog.count(distinct (x ->> 'curriculum_id') || '/' || (x ->> 'unit_code')) from pg_catalog.jsonb_array_elements(v_rows) x)
     <> pg_catalog.jsonb_array_length(v_rows) then
    raise exception 'eng_write_lesson_note_v3: a unit is listed twice (bad_units)' using errcode = '22023';
  end if;
  if v_studied is null and cardinality(v_labels) > 0 then
    v_studied := pg_catalog.left(pg_catalog.array_to_string(v_labels, '; '), 300);
  end if;

  v_r := english.eng_write_lesson_note_v2(p_learner, p_session_date, v_studied, p_weak_tags, p_message, p_note_for_parent, p_rechecks,
                                          p_supersedes, p_by, p_client_id, p_practised_target_ids);
  v_note := (v_r ->> 'id')::uuid;
  if (v_r ->> 'replayed')::boolean then
    if (select coalesce(pg_catalog.jsonb_agg(n.curriculum_id::text || '/' || n.unit_code order by n.curriculum_id, n.unit_code), '[]'::jsonb)
        from english.lesson_note_units n where n.lesson_note_id = v_note)
       <> (select coalesce(pg_catalog.jsonb_agg((x ->> 'curriculum_id') || '/' || (x ->> 'unit_code') order by (x ->> 'curriculum_id')::uuid, x ->> 'unit_code'), '[]'::jsonb)
           from pg_catalog.jsonb_array_elements(v_rows) x) then
      raise exception 'eng_write_lesson_note_v3: client_id was already used for a note with other units' using errcode = '23505';
    end if;
    return v_r;
  end if;
  insert into english.lesson_note_units(lesson_note_id, learner_id, curriculum_id, version_id, unit_code)
  select v_note, p_learner, (x ->> 'curriculum_id')::uuid, (x ->> 'version_id')::uuid, x ->> 'unit_code'
  from pg_catalog.jsonb_array_elements(v_rows) x;
  return v_r;
end
$$;

revoke execute on function english.eng_write_lesson_note_v3(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text, text[], jsonb) from public, anon, authenticated;
grant execute on function english.eng_write_lesson_note_v3(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text, text[], jsonb) to service_role;
```

- [ ] **Step 4: Section 8 — purge = bodies of 0025 + the six tables**

Chép **nguyên** thân hai hàm từ 0025 (bản trên nhánh lúc làm task này, kể cả sửa sau review của W1), rồi chèn 4 đoạn. Làm bằng script để không sót dòng (chạy ở gốc repo; in đoạn SQL ra `/tmp/purge_0026.sql`, rồi dán đoạn đó vào migration trước dòng `schema_migrations`):

```bash
cat > /tmp/purge0026.py <<'PY'
import re, sys
src = open("db/migrations/0025_workdesk_w1.sql").read()
def fn(name):
    i = src.index(f"create or replace function english.{name}(")
    return src[i:src.index("\n$$;", i) + 4]
pl, pp = fn("eng_purge_learner"), fn("eng_purge_preview")
def ins_after(text, anchor, add):
    assert anchor in text, anchor
    return text.replace(anchor, anchor + add, 1)
pl = ins_after(pl, "  n_learner_intake int := 0;\n",
 "  n_curricula int := 0;\n  n_curriculum_versions int := 0;\n  n_curriculum_units int := 0;\n"
 "  n_curriculum_unit_points int := 0;\n  n_curriculum_unit_events int := 0;\n  n_lesson_note_units int := 0;\n")
pl = ins_after(pl, "  delete from english.learner_intake li where li.learner_id = p_learner_id;\n  get diagnostics n_learner_intake = row_count;\n", """
  -- W2: giáo trình. Con trước, cha sau: Unit đã dạy và sự kiện Unit (trỏ tới lesson_notes → TRƯỚC lesson_notes), nối, Unit, phiên bản
  -- (trỏ tới files → TRƯỚC files), giáo trình.
  delete from english.lesson_note_units lnu where lnu.learner_id = p_learner_id;
  get diagnostics n_lesson_note_units = row_count;

  delete from english.curriculum_unit_events cue where cue.learner_id = p_learner_id;
  get diagnostics n_curriculum_unit_events = row_count;

  delete from english.curriculum_unit_points cup where cup.learner_id = p_learner_id;
  get diagnostics n_curriculum_unit_points = row_count;

  delete from english.curriculum_units cu where cu.learner_id = p_learner_id;
  get diagnostics n_curriculum_units = row_count;

  delete from english.curriculum_versions cv where cv.learner_id = p_learner_id;
  get diagnostics n_curriculum_versions = row_count;

  delete from english.curricula cc where cc.learner_id = p_learner_id;
  get diagnostics n_curricula = row_count;
""")
old = "      'members', n_members\n    ),\n"
assert old in pl
pl = pl.replace(old, """      'members', n_members
    -- jsonb_build_object takes at most 100 arguments: keys added from 0026 on go into a second object.
    ) || pg_catalog.jsonb_build_object(
      'curricula', n_curricula,
      'curriculum_versions', n_curriculum_versions,
      'curriculum_units', n_curriculum_units,
      'curriculum_unit_points', n_curriculum_unit_points,
      'curriculum_unit_events', n_curriculum_unit_events,
      'lesson_note_units', n_lesson_note_units
    ),
""", 1)
old = "      'members', (select pg_catalog.count(*) from english.members x where x.id = v_l.member_id and x.role = 'student')));"
assert old in pp
pp = pp.replace(old, """      'members', (select pg_catalog.count(*) from english.members x where x.id = v_l.member_id and x.role = 'student'))
    -- jsonb_build_object takes at most 100 arguments: keys added from 0026 on go into a second object.
    || pg_catalog.jsonb_build_object(
      'curricula', (select pg_catalog.count(*) from english.curricula x where x.learner_id = p_learner),
      'curriculum_versions', (select pg_catalog.count(*) from english.curriculum_versions x where x.learner_id = p_learner),
      'curriculum_units', (select pg_catalog.count(*) from english.curriculum_units x where x.learner_id = p_learner),
      'curriculum_unit_points', (select pg_catalog.count(*) from english.curriculum_unit_points x where x.learner_id = p_learner),
      'curriculum_unit_events', (select pg_catalog.count(*) from english.curriculum_unit_events x where x.learner_id = p_learner),
      'lesson_note_units', (select pg_catalog.count(*) from english.lesson_note_units x where x.learner_id = p_learner)));""", 1)
out = ("\n-- 8. Xóa dữ liệu một em: = bản 0025 + 6 bảng giáo trình (giữ nguyên mọi dòng của 0025).\n" + pl
  + "\n\nrevoke execute on function english.eng_purge_learner(uuid, uuid) from public, anon, authenticated;\n"
  + "grant execute on function english.eng_purge_learner(uuid, uuid) to service_role;\n\n"
  + "-- Đếm trước khi xóa = bản 0025 + 6 bảng giáo trình (cùng khóa với biên nhận).\n" + pp
  + "\n\nrevoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;\n"
  + "grant execute on function english.eng_purge_preview(uuid) to service_role;\n")
open("/tmp/purge_0026.sql", "w").write(out)
PY
python3 -I /tmp/purge0026.py && wc -l /tmp/purge_0026.sql
```

Nếu script báo `AssertionError` (W1 đã đổi dòng neo): mở 0025, tìm dòng tương ứng, sửa neo trong script — **không** bỏ bảng nào của 0025.

`lib/copy/vi.ts`, trong `purgePage.countLabels`, ngay sau dòng `studio_frames: "Khung đề giấy của đề Studio",` thêm:

```ts
    curricula: "Giáo trình",
    curriculum_versions: "Phiên bản mục lục giáo trình",
    curriculum_units: "Unit của giáo trình",
    curriculum_unit_points: "Bảng nối Unit → điểm",
    curriculum_unit_events: "Lần đặt trạng thái Unit",
    lesson_note_units: "Unit đã dạy trong buổi học",
```

- [ ] **Step 5: Run the whole DB suite + the static test**

Run: `npx vitest run --project db && npx vitest run tests/unit/migration0026.test.ts tests/unit/purge.test.ts`
Expected: PASS (mọi file DB; `curriculum.test.ts` 15 test).

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0026_curriculum.sql tests/db/curriculum.test.ts tests/db/migrations.test.ts tests/unit/migration0026.test.ts lib/copy/vi.ts
git commit -m "feat(w2): lesson note v3 with taught units; purge covers the six curriculum tables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

Chạy `npm run db:apply`? **Không** — phụ huynh áp `0025` rồi `0026` trên Supabase thật. Ghi vào PR.

---

### Task 5: `lib/curriculum` lõi thuần — schema, danh sách đóng, chuẩn hóa, kiểm, "đang học đến", % sửa, bộ đề chuẩn

**Files:**
- Create: `lib/curriculum/types.ts`, `schema.ts`, `context.ts`, `normalize.ts`, `validate.ts`, `progress.ts`, `editStats.ts`, `golden.ts`
- Create: `tests/fixtures/curriculum/fake-toc.json`, `tests/fixtures/curriculum/destination-c1c2.golden.json`
- Test: `tests/unit/curriculumProgress.test.ts`, `tests/unit/curriculumNormalize.test.ts`

**Interfaces:**
- Consumes: `placeOfTag(map, tag)` (`lib/skillmap/group.ts`), `SkillMapView`, `TagInfo`, `FILE_ID_RE` (`lib/storage/rules.ts`).
- Produces:
  - `types.ts`: `UNIT_STATUSES`, `UnitStatus`, `VERSION_STATUSES`, `VersionStatus`, `OPEN_STATUSES`, `UNIT_CODE_RE`, `CURRICULUM_LIMITS`, `UNIT_ORIGINS`, `UNIT_FLAGS`, `UnitFlag`, `EDIT_REASONS`, `EditReason`, `QUALITY`, `Quality`, `IGNORED_REASONS`, `EDIT_WARN_PCT = 20`.
  - `schema.ts`: `unitDraftSchema` / `UnitDraft` = `{code, title, section, page, skipped, points, missing_points, needs_review, review_reason, flags, origin, ai_index, dropped, edit_reason}`, `curriculumPayloadSchema` / `CurriculumPayload` = `{units, ignored}`, `aiTocSchema` / `AiToc`, body schemas `tocUploadBodySchema`, `createCurriculumBodySchema`, `addVersionBodySchema`, `saveCurriculumBodySchema`, `approveCurriculumBodySchema`, `editCurriculumBodySchema`, `unitStatusBodySchema`, `taughtUnitSchema` / `TaughtUnit`, `taughtUnitsSchema`, `fileMetaSchema` / `FileMeta`.
  - `context.ts`: `buildTocContext(map, tags): TocContext` (`{tags: TocTag[]}`; `TocTag = {key, label, domain, group, custom}`), `tocTagOf`.
  - `normalize.ts`: `unitCodeOf(printed): string | null`, `normalizeToc(ai: AiToc, ctx): CurriculumPayload`.
  - `validate.ts`: `validateCurriculum(p, ctx): CurriculumIssue[]`, `rowsToResolve(issues): number`, `canApprove`, `finalUnits(p)`, `reviewOrder(p, issues)`, `keptUnits`.
  - `progress.ts`: `curriculumProgress(units: ProgressUnit[], events: UnitEventRow[]): CurriculumProgress` (`{current, done, total, pct, statusOf}`), `latestStatuses`, `proposeInProgress(chosen, statusOf): string[]`.
  - `editStats.ts`: `editStats(ai: CurriculumPayload | null, final): EditStats | null`, `tooManyEdits(stats)`.
  - `golden.ts`: `compareGolden(draft, golden): GoldenReport`, types `Golden`, `GoldenUnit`.

- [ ] **Step 1: Fixtures (real input: Destination C1 & C2 contents, scan pages 6–7 = book pages 4–5)**

`tests/fixtures/curriculum/fake-toc.json` = câu trả lời AI giả (chính là thứ `AI_FAKE=1` trả). Vocabulary Unit nối 4 nhãn từ vựng của Track B; Grammar Unit có nhãn thì nối, không có nhãn (thì hiện tại, quá khứ, tương lai, tính từ/trạng từ, mệnh đề, cụm danh từ, V-ing/to V) thì để trống + `missing_points` + "cần xem" → **8 dòng cần xem** (U1, U3, U5, U15, U17, U19, U21, U23):

`tests/fixtures/curriculum/fake-toc.json`:

```json
{
  "units": [
    {"number": "1", "title": "Present time", "section": "Grammar", "page": 6, "points": [], "missing_points": ["Thì hiện tại (đơn, tiếp diễn, hoàn thành)"], "needs_review": true, "review_reason": "Không có nhãn thì hiện tại trong danh sách"},
    {"number": "2", "title": "Thinking and learning", "section": "Vocabulary", "page": 12, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "3", "title": "Past time", "section": "Grammar", "page": 22, "points": [], "missing_points": ["Thì quá khứ (đơn, tiếp diễn, hoàn thành)"], "needs_review": true, "review_reason": "Không có nhãn thì quá khứ trong danh sách"},
    {"number": "4", "title": "Change and technology", "section": "Vocabulary", "page": 28, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "5", "title": "Future time", "section": "Grammar", "page": 38, "points": [], "missing_points": ["Thì tương lai"], "needs_review": true, "review_reason": "Không có nhãn thì tương lai trong danh sách"},
    {"number": "6", "title": "Time and work", "section": "Vocabulary", "page": 44, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "7", "title": "Passives and causatives", "section": "Grammar", "page": 54, "points": ["bi-dong-nho-tuong-thuat"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "8", "title": "Movement and transport", "section": "Vocabulary", "page": 60, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "9", "title": "Modals and semi-modals", "section": "Grammar", "page": 70, "points": ["modal-suy-doan"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "10", "title": "Communication and the media", "section": "Vocabulary", "page": 76, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "11", "title": "Conditionals", "section": "Grammar", "page": 86, "points": ["cau-dieu-kien-dao-ngu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "12", "title": "Chance and nature", "section": "Vocabulary", "page": 92, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "13", "title": "Unreal time", "section": "Grammar", "page": 106, "points": ["wish-would-rather"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "14", "title": "Quantity and money", "section": "Vocabulary", "page": 112, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "15", "title": "Adjectives and adverbs", "section": "Grammar", "page": 122, "points": [], "missing_points": ["Tính từ & trạng từ"], "needs_review": true, "review_reason": "Không có nhãn tính từ / trạng từ trong danh sách"},
    {"number": "16", "title": "Materials and the built environment", "section": "Vocabulary", "page": 128, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "17", "title": "Clauses", "section": "Grammar", "page": 138, "points": [], "missing_points": ["Mệnh đề quan hệ, mệnh đề trạng ngữ"], "needs_review": true, "review_reason": "Không có nhãn mệnh đề trong danh sách"},
    {"number": "18", "title": "Reactions and health", "section": "Vocabulary", "page": 144, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "19", "title": "Complex sentences", "section": "Grammar", "page": 154, "points": ["cau-dieu-kien-dao-ngu", "tu-noi-lap-luan"], "missing_points": [], "needs_review": true, "review_reason": "Đoán theo tên Unit (đảo ngữ, liên từ); cần xem trang đầu Unit"},
    {"number": "20", "title": "Power and social issues", "section": "Vocabulary", "page": 160, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "21", "title": "Noun phrases", "section": "Grammar", "page": 170, "points": [], "missing_points": ["Cụm danh từ, mạo từ, lượng từ"], "needs_review": true, "review_reason": "Không có nhãn cụm danh từ trong danh sách"},
    {"number": "22", "title": "Quality and the arts", "section": "Vocabulary", "page": 176, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "23", "title": "Verbal complements", "section": "Grammar", "page": 186, "points": [], "missing_points": ["V-ing / to V sau động từ"], "needs_review": true, "review_reason": "Không có nhãn V-ing / to V trong danh sách"},
    {"number": "24", "title": "Relationships and people", "section": "Vocabulary", "page": 192, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "25", "title": "Reporting", "section": "Grammar", "page": 202, "points": ["bi-dong-nho-tuong-thuat"], "missing_points": [], "needs_review": false, "review_reason": null},
    {"number": "26", "title": "Preference and leisure activities", "section": "Vocabulary", "page": 208, "points": ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu"], "missing_points": [], "needs_review": false, "review_reason": null}
  ],
  "ignored": [
    {"label": "Review 1 · Units 1 and 2", "page": 20, "reason": "review"},
    {"label": "Review 2 · Units 3 and 4", "page": 36, "reason": "review"},
    {"label": "Review 3 · Units 5 and 6", "page": 52, "reason": "review"},
    {"label": "Review 4 · Units 7 and 8", "page": 68, "reason": "review"},
    {"label": "Review 5 · Units 9 and 10", "page": 84, "reason": "review"},
    {"label": "Review 6 · Units 11 and 12", "page": 100, "reason": "review"},
    {"label": "Progress Test 1 · Units 1–12", "page": 102, "reason": "test"},
    {"label": "Review 7 · Units 13 and 14", "page": 120, "reason": "review"},
    {"label": "Review 8 · Units 15 and 16", "page": 136, "reason": "review"},
    {"label": "Review 9 · Units 17 and 18", "page": 152, "reason": "review"},
    {"label": "Review 10 · Units 19 and 20", "page": 168, "reason": "review"},
    {"label": "Review 11 · Units 21 and 22", "page": 184, "reason": "review"},
    {"label": "Review 12 · Units 23 and 24", "page": 200, "reason": "review"},
    {"label": "Review 13 · Units 25 and 26", "page": 216, "reason": "review"},
    {"label": "Progress Test 2 · Units 13–26", "page": 218, "reason": "test"},
    {"label": "Topic vocabulary database", "page": 224, "reason": "reference"},
    {"label": "Phrasal verbs database", "page": 245, "reason": "reference"},
    {"label": "Phrases, patterns and collocations database", "page": 251, "reason": "reference"},
    {"label": "Idioms database", "page": 257, "reason": "reference"},
    {"label": "Word formation database", "page": 261, "reason": "reference"}
  ]
}
```

`tests/fixtures/curriculum/destination-c1c2.golden.json` (bộ đề chuẩn — kỳ vọng):

`tests/fixtures/curriculum/destination-c1c2.golden.json`:

```json
{
  "source": "Destination C1 & C2 Grammar and Vocabulary (Macmillan 2008), Contents pp. 4–5 (scan pages 6–7)",
  "units": [
    {"code": "U1", "title": "Present time", "section": "Grammar", "page": 6},
    {"code": "U2", "title": "Thinking and learning", "section": "Vocabulary", "page": 12},
    {"code": "U3", "title": "Past time", "section": "Grammar", "page": 22},
    {"code": "U4", "title": "Change and technology", "section": "Vocabulary", "page": 28},
    {"code": "U5", "title": "Future time", "section": "Grammar", "page": 38},
    {"code": "U6", "title": "Time and work", "section": "Vocabulary", "page": 44},
    {"code": "U7", "title": "Passives and causatives", "section": "Grammar", "page": 54},
    {"code": "U8", "title": "Movement and transport", "section": "Vocabulary", "page": 60},
    {"code": "U9", "title": "Modals and semi-modals", "section": "Grammar", "page": 70},
    {"code": "U10", "title": "Communication and the media", "section": "Vocabulary", "page": 76},
    {"code": "U11", "title": "Conditionals", "section": "Grammar", "page": 86},
    {"code": "U12", "title": "Chance and nature", "section": "Vocabulary", "page": 92},
    {"code": "U13", "title": "Unreal time", "section": "Grammar", "page": 106},
    {"code": "U14", "title": "Quantity and money", "section": "Vocabulary", "page": 112},
    {"code": "U15", "title": "Adjectives and adverbs", "section": "Grammar", "page": 122},
    {"code": "U16", "title": "Materials and the built environment", "section": "Vocabulary", "page": 128},
    {"code": "U17", "title": "Clauses", "section": "Grammar", "page": 138},
    {"code": "U18", "title": "Reactions and health", "section": "Vocabulary", "page": 144},
    {"code": "U19", "title": "Complex sentences", "section": "Grammar", "page": 154},
    {"code": "U20", "title": "Power and social issues", "section": "Vocabulary", "page": 160},
    {"code": "U21", "title": "Noun phrases", "section": "Grammar", "page": 170},
    {"code": "U22", "title": "Quality and the arts", "section": "Vocabulary", "page": 176},
    {"code": "U23", "title": "Verbal complements", "section": "Grammar", "page": 186},
    {"code": "U24", "title": "Relationships and people", "section": "Vocabulary", "page": 192},
    {"code": "U25", "title": "Reporting", "section": "Grammar", "page": 202},
    {"code": "U26", "title": "Preference and leisure activities", "section": "Vocabulary", "page": 208}
  ],
  "ignored_count": 20
}
```

- [ ] **Step 2: Write the failing tests — exactly the 3 examples of DOMAIN §5.1, then normalize/validate/edit count**

`tests/unit/curriculumProgress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { curriculumProgress, proposeInProgress, type ProgressUnit, type UnitEventRow } from "@/lib/curriculum/progress";

/** Exactly the three examples of docs/DOMAIN.md §5.1. */
const units = (codes: number[]): ProgressUnit[] => codes.map((n, i) => ({ code: `U${n}`, ord: i + 1, title: `Unit ${n}`, skipped: false }));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
let seq = 0;
const ev = (code: string, status: UnitEventRow["status"]): UnitEventRow => {
  seq += 1;
  return { unitCode: code, status, at: `2026-11-${String(1 + Math.floor(seq / 10)).padStart(2, "0")}T0${seq % 10}:00:00.000Z`, id: `e${String(seq).padStart(3, "0")}` };
};
/** U1–U12 done (in order), then U3 skipped, then U13 in progress. */
const destinationEvents = () => [...range(1, 12).map((n) => ev(`U${n}`, "done")), ev("U3", "skipped"), ev("U13", "in_progress")];

describe("đang học đến + độ phủ (DOMAIN §5.1)", () => {
  it("Destination 26 Unit; U1–U12 done, U13 in progress, U3 skipped → U13; 11/25 = 44 %", () => {
    const p = curriculumProgress(units(range(1, 26)), destinationEvents());
    expect(p.current?.code).toBe("U13");
    expect([p.done, p.total, p.pct]).toEqual([11, 25, 44]);
    expect(p.statusOf.U3).toBe("skipped");
  });

  it("Reading Explorer 3: nothing marked → not started; 0 %", () => {
    const p = curriculumProgress(units(range(1, 12)), []);
    expect(p.current).toBeNull();
    expect([p.done, p.pct]).toEqual([0, 0]);
  });

  it("v2 drops U20 (not studied) and adds U27 → still U13 (stable codes); coverage recomputed on v2", () => {
    const events = destinationEvents();
    const v2 = units([...range(1, 19), ...range(21, 27)]);
    const p = curriculumProgress(v2, events);
    expect(p.current?.code).toBe("U13");
    expect(v2.map((u) => u.code)).not.toContain("U20");
    expect(p.statusOf.U27).toBe("not_started");
    expect([p.done, p.total, p.pct]).toEqual([11, 25, 44]);
  });

  it("the session note proposes 'Đang học' only for chosen units that have not started", () => {
    const p = curriculumProgress(units(range(1, 26)), destinationEvents());
    expect(proposeInProgress(["U12", "U13", "U14"], p.statusOf)).toEqual(["U14"]);
  });
});
```

`tests/unit/curriculumNormalize.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TocContext } from "@/lib/curriculum/context";
import { editStats, tooManyEdits } from "@/lib/curriculum/editStats";
import { compareGolden, type Golden } from "@/lib/curriculum/golden";
import { normalizeToc, unitCodeOf } from "@/lib/curriculum/normalize";
import { aiTocSchema, curriculumPayloadSchema, type CurriculumPayload } from "@/lib/curriculum/schema";
import { canApprove, finalUnits, reviewOrder, rowsToResolve, validateCurriculum } from "@/lib/curriculum/validate";

const read = (f: string) => JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/curriculum", f), "utf8")) as unknown;
const FAKE = aiTocSchema.parse(read("fake-toc.json"));
const GOLDEN = read("destination-c1c2.golden.json") as Golden;
/** The closed list of "Nguyên (thử)" that the fixture uses (track B seed tags). */
const CTX_B: TocContext = {
  tags: ["cau-dieu-kien-dao-ngu", "wish-would-rather", "modal-suy-doan", "bi-dong-nho-tuong-thuat", "dang-tu", "tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "tu-noi-lap-luan", "phat-am"]
    .map((key) => ({ key, label: key, domain: null, group: null, custom: false })),
};

describe("normalizeToc (Destination C1&C2 fixture = golden set)", () => {
  const draft = normalizeToc(FAKE, CTX_B);
  it("gives the 26 units in book order with stable codes, titles and pages; 20 contents rows are not units", () => {
    expect(curriculumPayloadSchema.parse(draft)).toEqual(draft);
    expect(compareGolden(draft, GOLDEN)).toMatchObject({ ok: true, expected: 26, got: 26, orderOk: true });
    expect(draft.ignored).toHaveLength(GOLDEN.ignored_count);
    expect(draft.ignored.filter((r) => r.reason === "test").map((r) => r.page)).toEqual([102, 218]);
  });
  it("the AI's uncertain rows come first in the review and block Duyệt until resolved", () => {
    const issues = validateCurriculum(draft, CTX_B);
    expect(draft.units.filter((u) => u.needs_review).map((u) => u.code)).toEqual(["U1", "U3", "U5", "U15", "U17", "U19", "U21", "U23"]);
    expect(rowsToResolve(issues)).toBe(8);
    expect(canApprove(issues)).toBe(false);
    expect(reviewOrder(draft, issues).slice(0, 2).map((u) => u.code)).toEqual(["U1", "U3"]);
    const resolved: CurriculumPayload = { ...draft, units: draft.units.map((u) => ({ ...u, needs_review: false })) };
    expect(canApprove(validateCurriculum(resolved, CTX_B))).toBe(true);
    expect(finalUnits(resolved)).toHaveLength(26);
  });
});

describe("normalizeToc checks (code, not the AI)", () => {
  const row = (number: string, points: string[] = [], extra: Record<string, unknown> = {}) => ({ number, title: `T${number}`, points, missing_points: [], needs_review: false, ...extra });
  it("unit codes: printed numbers → U<n>; words → X-…; nothing → flagged", () => {
    expect([unitCodeOf("7"), unitCodeOf("Unit 12"), unitCodeOf("Starter"), unitCodeOf("Bài ôn tập"), unitCodeOf(" ")]).toEqual(["U7", "U12", "X-STARTER", "X-BAI-ON-TAP", null]);
  });
  it("a gap in the numbering, a duplicate number and an unknown point are flagged 'cần xem'; unknown keys never become links", () => {
    const d = normalizeToc(aiTocSchema.parse({ units: [row("1"), row("2", ["cum-dong-tu", "xyz-khong-co"]), row("2"), row("4")] }), CTX_B);
    expect(d.units.map((u) => [u.code, u.flags])).toEqual([
      ["U1", []], ["U2", ["unknown_point"]], ["U2-2", ["duplicate_code"]], ["U4", ["numbering_gap"]],
    ]);
    expect(d.units[1]).toMatchObject({ points: ["cum-dong-tu"], missing_points: ["xyz-khong-co"], needs_review: true });
  });
});

describe("edit count (spec §8: % of AI rows the tutor had to change)", () => {
  it("kept / edited / dropped / added are counted by code; > 20 % raises the stop sign", () => {
    const ai = normalizeToc(FAKE, CTX_B);
    const final: CurriculumPayload = {
      ...ai,
      units: [
        ...ai.units.map((u, i) =>
          i === 0 ? { ...u, points: ["x-thi-hien-tai"], needs_review: false, edit_reason: "missing_points" as const }
          : i === 1 ? { ...u, dropped: true, edit_reason: "not_a_unit" as const }
          : { ...u, needs_review: false }),
        { ...ai.units[0]!, code: "U27", title: "Extra", origin: "manual" as const, ai_index: null, flags: [] },
      ],
    };
    expect(editStats(ai, final)).toEqual({ ai_rows: 26, kept: 24, edited: 1, dropped: 1, added: 1, edited_pct: 8, reasons: { missing_points: 1, not_a_unit: 1 } });
    expect(tooManyEdits(editStats(ai, final))).toBe(false);
    expect(editStats(null, final)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/unit/curriculumProgress.test.ts tests/unit/curriculumNormalize.test.ts`
Expected: FAIL — `Cannot find module '@/lib/curriculum/progress'`.

- [ ] **Step 4: Implement**

`lib/curriculum/types.ts`:

```ts
/**
 * Curriculum (W2 · Giáo trình) constants shared by the server, the browser and the tests. Pure. Same limits as migration 0026.
 * Rules: docs/DOMAIN.md §3 tầng B, §4, §5.1, §6.
 */
export const UNIT_STATUSES = ["not_started", "in_progress", "done", "skipped"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const VERSION_STATUSES = ["extracting", "ai_failed", "draft", "approved", "superseded", "discarded"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];
export const OPEN_STATUSES: readonly VersionStatus[] = ["extracting", "ai_failed", "draft"];

/** Same rule as curriculum_units.code (0026): "U7", "U12", "X-STARTER". Stable across versions. */
export const UNIT_CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

export const CURRICULUM_LIMITS = {
  title: 160,
  levelNote: 200,
  units: 300,
  unitTitle: 160,
  section: 40,
  page: 3000,
  points: 12,
  missing: 5,
  missingText: 120,
  reason: 200,
  ignored: 100,
  ignoredLabel: 160,
  taughtPerNote: 6,
  qualityNote: 200,
} as const;

/** Where a draft row came from: the AI, typed by hand, or copied from the approved version ("Sửa mục lục"). */
export const UNIT_ORIGINS = ["ai", "manual", "kept"] as const;
export type UnitOrigin = (typeof UNIT_ORIGINS)[number];

/** Why the code (not the AI) asked for a second look at a row (spec §5 "câu AI không chắc"). "ai" = the AI itself asked. */
export const UNIT_FLAGS = ["ai", "unknown_point", "duplicate_code", "numbering_gap", "bad_number", "no_title"] as const;
export type UnitFlag = (typeof UNIT_FLAGS)[number];

/** Optional reason when the tutor edits or drops an AI row (DOMAIN §9.3, adapted to a table of contents). */
export const EDIT_REASONS = ["wrong_title_page", "wrong_points", "missing_points", "not_a_unit", "other"] as const;
export type EditReason = (typeof EDIT_REASONS)[number];

/** End-of-review rating (DOMAIN §9.3 "Tốt / Tạm / Phải sửa nhiều"). Optional. */
export const QUALITY = ["good", "ok", "needs_work"] as const;
export type Quality = (typeof QUALITY)[number];

/** Rows of the contents page that are not teaching units (Review, Progress Test, reference pages). */
export const IGNORED_REASONS = ["review", "test", "reference", "other"] as const;
export type IgnoredReason = (typeof IGNORED_REASONS)[number];

/** Spec §8: when the tutor has to edit more than this share of the AI rows, stop and fix the prompt first. */
export const EDIT_WARN_PCT = 20;
```

`lib/curriculum/schema.ts`:

```ts
/**
 * Curriculum draft payload (stored in curriculum_versions.payload), the lenient shape of the AI tool output, and the request bodies.
 * Pure (zod). The strict schema guards what is STORED; lib/curriculum/normalize.ts turns the AI output into a strict payload.
 */
import { z } from "zod";
import { FILE_ID_RE } from "@/lib/storage/rules";
import { CURRICULUM_LIMITS as L, EDIT_REASONS, IGNORED_REASONS, QUALITY, UNIT_CODE_RE, UNIT_FLAGS, UNIT_ORIGINS, UNIT_STATUSES } from "./types";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const tagKey = z.string().min(1).max(80);

export const unitDraftSchema = z.strictObject({
  code: z.string().regex(UNIT_CODE_RE),
  title: trimmed(L.unitTitle),
  section: z.string().trim().min(1).max(L.section).nullable(),
  page: z.number().int().min(1).max(L.page).nullable(),
  skipped: z.boolean(),
  points: z.array(tagKey).max(L.points),
  /** Points the AI thought of that are not in the list (free text): a hint to add a family tag, never stored as a link. */
  missing_points: z.array(trimmed(L.missingText)).max(L.missing),
  needs_review: z.boolean(),
  review_reason: z.string().trim().max(L.reason).nullable(),
  flags: z.array(z.enum(UNIT_FLAGS)).max(UNIT_FLAGS.length),
  origin: z.enum(UNIT_ORIGINS),
  /** Position in the AI draft (ai_payload.units), so the edit count survives a changed code. null for rows not from the AI. */
  ai_index: z.number().int().min(0).max(L.units).nullable(),
  /** "Bỏ": the row stays in the draft (for the edit count) but is not part of the approved version. */
  dropped: z.boolean(),
  edit_reason: z.enum(EDIT_REASONS).nullable(),
});
export type UnitDraft = z.infer<typeof unitDraftSchema>;

export const ignoredRowSchema = z.strictObject({
  label: trimmed(L.ignoredLabel),
  page: z.number().int().min(1).max(L.page).nullable(),
  reason: z.enum(IGNORED_REASONS),
});
export type IgnoredRow = z.infer<typeof ignoredRowSchema>;

export const curriculumPayloadSchema = z.strictObject({
  units: z.array(unitDraftSchema).max(L.units),
  ignored: z.array(ignoredRowSchema).max(L.ignored),
});
export type CurriculumPayload = z.infer<typeof curriculumPayloadSchema>;

export const EMPTY_PAYLOAD: CurriculumPayload = { units: [], ignored: [] };

/** What the model sent through the tool `save_curriculum_toc` (lenient: unknown keys dropped, numbers as text or numbers). */
export const aiTocSchema = z.object({
  units: z
    .array(
      z.object({
        number: z.union([z.string(), z.number()]).transform((v) => String(v)),
        title: z.string(),
        section: z.string().nullable().optional(),
        page: z.number().int().nullable().optional(),
        points: z.array(z.string()).default([]),
        missing_points: z.array(z.string()).default([]),
        needs_review: z.boolean().default(false),
        review_reason: z.string().nullable().optional(),
      }),
    )
    .max(L.units),
  ignored: z.array(z.object({ label: z.string(), page: z.number().int().nullable().optional(), reason: z.string() })).default([]),
});
export type AiToc = z.infer<typeof aiTocSchema>;

// ---- Request bodies (strict) ----------------------------------------------------------------------------------------------------
const clientId = z.string().trim().min(8).max(100);
const base = z.string().min(10).max(64);
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const fileMetaSchema = z.strictObject({ id: z.string().regex(FILE_ID_RE), mime: z.string().max(200), bytes: z.number().int() });
export type FileMeta = z.infer<typeof fileMetaSchema>;

export const tocUploadBodySchema = z.strictObject({ mime: z.string().max(200), bytes: z.number().int() });
export const createCurriculumBodySchema = z.strictObject({
  title: trimmed(L.title),
  level_note: z.string().trim().max(L.levelNote).nullable(),
  mode: z.enum(["ai", "manual"]),
  toc_file: fileMetaSchema.nullable(),
  client_id: clientId,
});
/** "Nạp mục lục" for a curriculum that already exists (a new version). */
export const addVersionBodySchema = z.strictObject({ mode: z.enum(["ai", "manual"]), toc_file: fileMetaSchema.nullable(), client_id: clientId });
export const saveCurriculumBodySchema = z.strictObject({ payload: curriculumPayloadSchema, base_updated_at: base });
export const approveCurriculumBodySchema = z.strictObject({
  base_updated_at: base,
  quality: z.enum(QUALITY).nullable(),
  quality_note: z.string().trim().max(L.qualityNote).nullable(),
});
export const editCurriculumBodySchema = z.strictObject({ client_id: clientId });
export const unitStatusBodySchema = z.strictObject({
  unit_code: z.string().regex(UNIT_CODE_RE),
  status: z.enum(UNIT_STATUSES),
  lesson_note_id: uuid.nullable(),
  client_id: clientId,
});
export const taughtUnitSchema = z.strictObject({ curriculum_id: uuid, unit_code: z.string().regex(UNIT_CODE_RE) });
export type TaughtUnit = z.infer<typeof taughtUnitSchema>;
/** "Unit đã dạy hôm nay" on the session note: at most 6, each (curriculum, unit) once. */
export const taughtUnitsSchema = z
  .array(taughtUnitSchema)
  .max(L.taughtPerNote)
  .default([])
  .refine((xs) => new Set(xs.map((x) => `${x.curriculum_id}/${x.unit_code}`)).size === xs.length, { message: "each unit once" });
```

`lib/curriculum/context.ts`:

```ts
/**
 * The CLOSED list a curriculum may link units to (DOMAIN §3 "Nối Unit → điểm", D-W1): every tag of the child's track that is in use
 * (seed, reading 0018, listening 0026, the family's own tags) and not hidden from the picker, with its place in the skill map so the AI
 * and the review screen can show "Mảng › Nhóm". Pure.
 */
import { placeOfTag } from "@/lib/skillmap/group";
import type { SkillMapView } from "@/lib/skillmap/types";
import type { TagInfo } from "@/lib/tutorwork/types";

export type TocTag = { key: string; label: string; domain: string | null; group: string | null; custom: boolean };
export type TocContext = { tags: TocTag[] };

export function buildTocContext(map: SkillMapView, tags: TagInfo[]): TocContext {
  const out: TocTag[] = [];
  for (const t of tags) {
    const place = placeOfTag(map, t);
    if (place?.hidden) continue;
    out.push({ key: t.key, label: t.label, domain: place?.domainName ?? null, group: place?.groupName ?? null, custom: t.custom });
  }
  return { tags: out };
}

export function tocTagOf(ctx: TocContext, key: string): TocTag | null {
  return ctx.tags.find((t) => t.key === key) ?? null;
}
```

`lib/curriculum/normalize.ts`:

```ts
/**
 * AI tool output → strict draft payload (spec §5 "code kiểm"; DOMAIN §9.2 "Đọc mục lục"): stable unit codes from the printed numbers,
 * the AI's order kept, numbering that is not 1, 2, 3… flagged, duplicate codes made unique and flagged, points outside the closed list
 * dropped and flagged ("cần xem"). Never invents a point. Pure.
 */
import type { TocContext } from "./context";
import type { AiToc, CurriculumPayload, IgnoredRow, UnitDraft } from "./schema";
import { CURRICULUM_LIMITS as L, IGNORED_REASONS, type IgnoredReason, type UnitFlag } from "./types";

const clean = (s: string | null | undefined, max: number): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return t.length > 0 ? t : null;
};

/** "7" → "U7"; "Starter" → "X-STARTER"; nothing usable → null. Same shape as curriculum_units.code. */
export function unitCodeOf(printed: string): string | null {
  const t = printed.trim();
  if (/^\d{1,3}$/.test(t)) return `U${Number(t)}`;
  const slug = t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "D")
    .toUpperCase()
    .replace(/^UNIT\s*/, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (/^\d{1,3}$/.test(slug)) return `U${Number(slug)}`;
  return slug ? `X-${slug}`.slice(0, 20).replace(/-+$/, "") : null;
}

const numberOf = (code: string): number | null => (/^U\d+$/.test(code) ? Number(code.slice(1)) : null);

export function normalizeToc(ai: AiToc, ctx: TocContext): CurriculumPayload {
  const known = new Set(ctx.tags.map((t) => t.key));
  const used = new Map<string, number>();
  let lastNumber: number | null = null;
  const units: UnitDraft[] = ai.units.map((u, i) => {
    const flags: UnitFlag[] = [];
    if (u.needs_review) flags.push("ai");
    let code = unitCodeOf(u.number);
    if (code === null) {
      code = `X-${i + 1}`;
      flags.push("bad_number");
    }
    const seen = used.get(code) ?? 0;
    used.set(code, seen + 1);
    if (seen > 0) {
      code = `${code}-${seen + 1}`.slice(0, 20);
      flags.push("duplicate_code");
    }
    const n = numberOf(code);
    if (n !== null) {
      if (n !== (lastNumber === null ? 1 : lastNumber + 1)) flags.push("numbering_gap");
      lastNumber = n;
    }
    const points: string[] = [];
    const unknown: string[] = [];
    for (const k of u.points) {
      const key = k.trim();
      if (!key || points.includes(key) || unknown.includes(key)) continue;
      if (known.has(key)) points.push(key);
      else unknown.push(key);
    }
    if (unknown.length > 0) flags.push("unknown_point");
    const title = clean(u.title, L.unitTitle);
    if (title === null) flags.push("no_title");
    const missing = [...u.missing_points, ...unknown].map((m) => clean(m, L.missingText)).filter((m): m is string => m !== null);
    return {
      code,
      title: title ?? code,
      section: clean(u.section, L.section),
      page: typeof u.page === "number" && u.page >= 1 && u.page <= L.page ? u.page : null,
      skipped: false,
      points: points.slice(0, L.points),
      missing_points: [...new Set(missing)].slice(0, L.missing),
      needs_review: flags.length > 0,
      review_reason: clean(u.review_reason, L.reason),
      flags,
      origin: "ai",
      ai_index: i,
      dropped: false,
      edit_reason: null,
    };
  });
  const ignored: IgnoredRow[] = ai.ignored
    .map((r) => ({
      label: clean(r.label, L.ignoredLabel),
      page: typeof r.page === "number" && r.page >= 1 && r.page <= L.page ? r.page : null,
      reason: ((IGNORED_REASONS as readonly string[]).includes(r.reason) ? r.reason : "other") as IgnoredReason,
    }))
    .filter((r): r is IgnoredRow => r.label !== null)
    .slice(0, L.ignored);
  return { units, ignored };
}
```

`lib/curriculum/validate.ts`:

```ts
/**
 * Checks of a curriculum draft (spec §5 review screen: uncertain rows first, Duyệt disabled until resolved). Runs on every screen load
 * and again on "Duyệt" (the database checks the same things once more). Only rows that are not dropped count. Pure.
 */
import type { TocContext } from "./context";
import type { CurriculumPayload, UnitDraft } from "./schema";
import { UNIT_CODE_RE } from "./types";

export const CURRICULUM_ISSUES = ["no_units", "needs_review", "duplicate_code", "bad_code", "unknown_point", "no_points"] as const;
export type CurriculumIssueCode = (typeof CURRICULUM_ISSUES)[number];
/** `code` = the unit the issue is about, null for the whole draft. Only `no_points` does not block. */
export type CurriculumIssue = { code: string | null; issue: CurriculumIssueCode; blocking: boolean };

export const keptUnits = (p: CurriculumPayload): UnitDraft[] => p.units.filter((u) => !u.dropped);

export function validateCurriculum(p: CurriculumPayload, ctx: TocContext): CurriculumIssue[] {
  const out: CurriculumIssue[] = [];
  const kept = keptUnits(p);
  if (kept.length === 0) out.push({ code: null, issue: "no_units", blocking: true });
  const known = new Set(ctx.tags.map((t) => t.key));
  const count = new Map<string, number>();
  for (const u of kept) count.set(u.code, (count.get(u.code) ?? 0) + 1);
  for (const u of kept) {
    if (u.needs_review) out.push({ code: u.code, issue: "needs_review", blocking: true });
    if (!UNIT_CODE_RE.test(u.code)) out.push({ code: u.code, issue: "bad_code", blocking: true });
    if ((count.get(u.code) ?? 0) > 1) out.push({ code: u.code, issue: "duplicate_code", blocking: true });
    if (u.points.some((k) => !known.has(k))) out.push({ code: u.code, issue: "unknown_point", blocking: true });
    if (u.points.length === 0 && !u.skipped) out.push({ code: u.code, issue: "no_points", blocking: false });
  }
  return out;
}

/** "Còn n dòng cần xử lý": units with at least one blocking issue (+1 when the draft as a whole is blocked). */
export function rowsToResolve(issues: CurriculumIssue[]): number {
  const units = new Set(issues.filter((i) => i.blocking && i.code !== null).map((i) => i.code));
  return units.size + (issues.some((i) => i.blocking && i.code === null) ? 1 : 0);
}

export const canApprove = (issues: CurriculumIssue[]): boolean => rowsToResolve(issues) === 0;

/** What eng_approve_curriculum_version receives: kept rows in the draft's order, only the stored columns. */
export function finalUnits(p: CurriculumPayload): { code: string; title: string; section: string | null; page: number | null; skipped: boolean; points: string[] }[] {
  return keptUnits(p).map((u) => ({ code: u.code, title: u.title, section: u.section, page: u.page, skipped: u.skipped, points: u.points }));
}

/** Review screen order: rows that block first (in book order), then the rest (in book order). */
export function reviewOrder(p: CurriculumPayload, issues: CurriculumIssue[]): UnitDraft[] {
  const blocked = new Set(issues.filter((i) => i.blocking && i.code !== null).map((i) => i.code));
  const kept = keptUnits(p);
  return [...kept.filter((u) => blocked.has(u.code)), ...kept.filter((u) => !blocked.has(u.code))];
}
```

`lib/curriculum/progress.ts`:

```ts
/**
 * "Đang học đến" and coverage of one curriculum (DOMAIN §5.1) — derived, rebuilt from the unit events every time (bất biến §7.5). Pure.
 *   - current status of a unit = its latest event (no event = not started);
 *   - "đang học đến" = the in-progress unit with the highest order; else the done unit with the highest order; else none;
 *   - coverage = done ÷ units not skipped, over the units of the version in use (skipped = marked in the version OR latest event "skipped");
 *   - events of codes that are not in the version are ignored (a unit dropped in v2 keeps its history but no longer counts).
 */
import type { UnitStatus } from "./types";

export type ProgressUnit = { code: string; ord: number; title: string; skipped: boolean };
export type UnitEventRow = { unitCode: string; status: UnitStatus; at: string; id: string };
export type CurriculumProgress = {
  current: ProgressUnit | null;
  done: number;
  total: number;
  /** Whole percent, 0 when there is nothing to count. */
  pct: number;
  statusOf: Record<string, UnitStatus>;
};

export function latestStatuses(events: UnitEventRow[]): Map<string, UnitStatus> {
  const sorted = [...events].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? -1 : 1));
  const out = new Map<string, UnitStatus>();
  for (const e of sorted) out.set(e.unitCode, e.status);
  return out;
}

export function curriculumProgress(units: ProgressUnit[], events: UnitEventRow[]): CurriculumProgress {
  const latest = latestStatuses(events);
  const statusOf: Record<string, UnitStatus> = Object.fromEntries(units.map((u) => [u.code, latest.get(u.code) ?? "not_started"]));
  const counted = units.filter((u) => !u.skipped && statusOf[u.code] !== "skipped");
  const done = counted.filter((u) => statusOf[u.code] === "done").length;
  const highest = (s: UnitStatus) => units.filter((u) => statusOf[u.code] === s).sort((a, b) => b.ord - a.ord)[0] ?? null;
  const total = counted.length;
  return { current: highest("in_progress") ?? highest("done"), done, total, pct: total > 0 ? Math.round((done * 100) / total) : 0, statusOf };
}

/** Units chosen in "Unit đã dạy hôm nay" that the app proposes to mark "Đang học" (the tutor clicks; never automatic): not started yet. */
export function proposeInProgress(chosen: string[], statusOf: Record<string, UnitStatus>): string[] {
  return chosen.filter((c) => (statusOf[c] ?? "not_started") === "not_started");
}
```

`lib/curriculum/editStats.ts`:

```ts
/**
 * How much of the AI draft the tutor kept (spec §1 goal 5, §8 "Thử AI bằng dùng thật"): counted by CODE, never by the AI. Rows are
 * matched through ai_index, so a corrected unit code still counts as an edit, not as drop + add. Pure.
 */
import type { CurriculumPayload, UnitDraft } from "./schema";
import { EDIT_REASONS, EDIT_WARN_PCT, type EditReason } from "./types";

export type EditStats = {
  ai_rows: number;
  kept: number;
  edited: number;
  dropped: number;
  added: number;
  /** (edited + dropped) ÷ AI rows, whole percent. */
  edited_pct: number;
  reasons: Partial<Record<EditReason, number>>;
};

const sameRow = (a: UnitDraft, b: UnitDraft) =>
  a.code === b.code && a.title === b.title && a.section === b.section && a.page === b.page && a.skipped === b.skipped &&
  [...a.points].sort().join("|") === [...b.points].sort().join("|");

export function editStats(ai: CurriculumPayload | null, final: CurriculumPayload): EditStats | null {
  if (!ai) return null;
  const byIndex = new Map(final.units.filter((u) => u.ai_index !== null).map((u) => [u.ai_index as number, u]));
  let kept = 0;
  let edited = 0;
  let dropped = 0;
  ai.units.forEach((a, i) => {
    const f = byIndex.get(i);
    if (!f || f.dropped) dropped += 1;
    else if (sameRow(a, f)) kept += 1;
    else edited += 1;
  });
  const added = final.units.filter((u) => u.ai_index === null && !u.dropped).length;
  const reasons: Partial<Record<EditReason, number>> = {};
  for (const u of final.units) {
    if (u.edit_reason && (EDIT_REASONS as readonly string[]).includes(u.edit_reason)) reasons[u.edit_reason] = (reasons[u.edit_reason] ?? 0) + 1;
  }
  const n = ai.units.length;
  return { ai_rows: n, kept, edited, dropped, added, edited_pct: n > 0 ? Math.round(((edited + dropped) * 100) / n) : 0, reasons };
}

/** Spec §8: more than 20 % of the AI rows edited → stop and fix the prompt before going on. */
export const tooManyEdits = (s: EditStats | null): boolean => s !== null && s.edited_pct > EDIT_WARN_PCT;
```

`lib/curriculum/golden.ts`:

```ts
/**
 * Golden set of "Đọc mục lục" (spec §5 "Bộ đề chuẩn"): compare a normalized AI draft with the expected units of a real book. Run on
 * every change of prompt or model (scripts/golden-curriculum.ts with the real PDF; the CI runs it on the fake fixture). Pure.
 */
import type { CurriculumPayload } from "./schema";

export type GoldenUnit = { code: string; title: string; section: string | null; page: number | null };
export type Golden = { source: string; units: GoldenUnit[]; ignored_count: number };
export type GoldenReport = {
  ok: boolean;
  expected: number;
  got: number;
  /** Codes in the wrong place or missing / extra. */
  orderOk: boolean;
  missing: string[];
  extra: string[];
  titleMismatches: string[];
  pageMismatches: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[\s\-–—]+/g, " ").trim();

export function compareGolden(draft: CurriculumPayload, golden: Golden): GoldenReport {
  const got = draft.units.filter((u) => !u.dropped);
  const want = golden.units;
  const gotCodes = got.map((u) => u.code);
  const wantCodes = want.map((u) => u.code);
  const missing = wantCodes.filter((c) => !gotCodes.includes(c));
  const extra = gotCodes.filter((c) => !wantCodes.includes(c));
  const orderOk = missing.length === 0 && extra.length === 0 && gotCodes.every((c, i) => c === wantCodes[i]);
  const titleMismatches: string[] = [];
  const pageMismatches: string[] = [];
  for (const w of want) {
    const g = got.find((u) => u.code === w.code);
    if (!g) continue;
    if (norm(g.title) !== norm(w.title)) titleMismatches.push(w.code);
    if (w.page !== null && g.page !== w.page) pageMismatches.push(w.code);
  }
  return {
    ok: orderOk && titleMismatches.length === 0 && pageMismatches.length === 0,
    expected: want.length,
    got: got.length,
    orderOk,
    missing,
    extra,
    titleMismatches,
    pageMismatches,
  };
}
```

- [ ] **Step 5: Run → PASS (9 tests); `npm run typecheck`**

- [ ] **Step 6: Commit**

```bash
git add lib/curriculum tests/fixtures/curriculum tests/unit/curriculumProgress.test.ts tests/unit/curriculumNormalize.test.ts
git commit -m "feat(w2): curriculum core — payload schema, closed list, normalize, checks, progress (DOMAIN 5.1), edit count, golden set

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 6: AI "Đọc mục lục" — công thức `curriculum-toc.v1`, tool bắt buộc, việc nền, `AI_FAKE` theo tool

**Files:**
- Create: `prompts/curriculum-toc.v1.md`, `lib/curriculum/tocTool.ts`, `lib/curriculum/extract.ts`
- Modify: `lib/ai/config.ts`, `lib/ai/anthropic.ts`, `lib/ai/prompts.ts`, `lib/storage/rules.ts`
- Test: `tests/unit/curriculumAi.test.ts`

**Interfaces:**
- Consumes: `ToolCall`, `ToolSpec`, `AiDocument`, `AiCallError`, `estimateInputTokens` (`lib/ai/request.ts`), `estimateCostUsd`, `isPricedModel` (`lib/ai/pricing.ts`), `refusalStatus`, `GateState` (`lib/ai/cap.ts`), `RunLog` (`lib/studio/extract.ts`, `draftId` = id phiên bản).
- Produces: `CURRICULUM_PROMPT = {file: "curriculum-toc.v1", version: "curriculum-toc.v1"}`; `TOC_TOOL_NAME = "save_curriculum_toc"`, `tocTool(ctx)`, `fillTocPrompt(template, ctx, book)`, `buildTocCall({model, toolChoice, prompt, ctx, book, doc})`; `runTocExtraction(deps: TocDeps, job: TocJob): Promise<TocOutcome>` với `TocExtractStore = {gate, reserve({learnerId, estimateUsd, versionId, model, byMemberId}), logRun(RunLog), finish(versionId, payload, runId), fail(versionId, code, runId)}`; `fakeFixtureFor(toolName)`, `AI_FAKE_FIXTURES`; `FILE_KINDS` có `"curriculum_toc"` (chỉ PDF).

- [ ] **Step 1: Failing test**

`tests/unit/curriculumAi.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createToolCaller } from "@/lib/ai/anthropic";
import { fakeFixtureFor } from "@/lib/ai/config";
import { CURRICULUM_PROMPT, loadPrompt } from "@/lib/ai/prompts";
import type { TocContext } from "@/lib/curriculum/context";
import { runTocExtraction, type TocExtractStore } from "@/lib/curriculum/extract";
import { buildTocCall, fillTocPrompt, TOC_TOOL_NAME, tocTool } from "@/lib/curriculum/tocTool";
import { checkFile } from "@/lib/storage/rules";

const CTX: TocContext = { tags: [{ key: "cum-dong-tu", label: "Cụm động từ", domain: "Từ vựng", group: "Kết hợp từ, cụm động từ, thành ngữ", custom: false }] };
const GATE = { familyId: "f", enabled: true, consent: true, spentUsd: 0, monthlyCapUsd: 10, softCapUsd: 8, softReached: false, allowed: true, reason: null, reservationId: "res" };

describe("curriculum-toc.v1 (prompt, tool, fake)", () => {
  it("the prompt file exists with its two slots; filled, it carries the book and the closed list only", () => {
    const text = loadPrompt(CURRICULUM_PROMPT.file);
    expect(text).toContain("{{BOOK}}");
    expect(text).toContain("{{TAGS}}");
    const filled = fillTocPrompt(text, CTX, { title: "Destination C1&C2", levelNote: "C1–C2" });
    expect(filled).toContain("Destination C1&C2 (C1–C2)");
    expect(filled).toContain("- cum-dong-tu — Cụm động từ (Từ vựng › Kết hợp từ, cụm động từ, thành ngữ)");
    expect(filled).not.toMatch(/Nguyên|An \(|alias/);
  });
  it("the forced tool only accepts keys of the closed list as points", () => {
    const t = tocTool(CTX) as unknown as { name: string; input_schema: { properties: { units: { items: { properties: { points: { items: { enum: string[] } } } } } } } };
    expect(t.name).toBe(TOC_TOOL_NAME);
    expect(t.input_schema.properties.units.items.properties.points.items.enum).toEqual(["cum-dong-tu"]);
    const call = buildTocCall({ model: "claude-sonnet-5-5", toolChoice: "tool", prompt: "{{BOOK}} {{TAGS}}", ctx: CTX, book: { title: "B", levelNote: null }, doc: { kind: "pdf", title: "MỤC LỤC", base64: "JVBERg==" } });
    expect([call.documents.length, call.toolChoice, call.maxTokens]).toEqual([1, "tool", 16000]);
  });
  it("AI_FAKE answers each tool with its own fixture; a table of contents is a PDF only", async () => {
    expect(fakeFixtureFor("save_curriculum_toc")).toBe("tests/fixtures/curriculum/fake-toc.json");
    expect(fakeFixtureFor("save_exercise")).toBe("tests/fixtures/studio/fake-extract.json");
    const call = createToolCaller({ AI_FAKE: "1", NODE_ENV: "test" });
    const r = await call(buildTocCall({ model: "m", toolChoice: "tool", prompt: "", ctx: CTX, book: { title: "B", levelNote: null }, doc: { kind: "pdf", title: "x", base64: "" } }));
    expect(r.input).toEqual(JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/curriculum/fake-toc.json"), "utf8")));
    expect(checkFile("curriculum_toc", "application/pdf", 10)).toEqual({ ok: true });
    expect(checkFile("curriculum_toc", "image/png", 10)).toEqual({ ok: false, reason: "kind" });
  });
});

describe("runTocExtraction", () => {
  const store = (over: Partial<TocExtractStore> = {}): TocExtractStore & { runs: unknown[] } => {
    const runs: unknown[] = [];
    return { runs, gate: async () => GATE, reserve: async () => GATE, logRun: async (r) => (runs.push(r), `run-${runs.length}`), finish: vi.fn(async () => ({ applied: true })), fail: vi.fn(async () => ({ applied: true })), ...over };
  };
  const job = { versionId: "v", familyId: "f", learnerId: "l", byMemberId: "m", tocPath: "p", book: { title: "B", levelNote: null } };
  const base = { download: async () => new Uint8Array([1]), context: async () => CTX, model: "claude-sonnet-5-5", toolChoice: "tool" as const, prompt: { text: "{{BOOK}}{{TAGS}}", version: "curriculum-toc.v1" }, sleep: async () => undefined };
  it("bad output is retried and logged each time; the third failure marks the version ai_failed (→ Soạn tay)", async () => {
    const s = store();
    const out = await runTocExtraction({ ...base, store: s, call: async () => ({ input: { nope: 1 }, usage: { inputTokens: 10, outputTokens: 10 }, model: "x" }) }, job);
    expect(out).toEqual({ status: "failed", code: "bad_output", tries: 3 });
    expect(s.runs).toHaveLength(3);
    expect(s.fail).toHaveBeenCalledWith("v", "bad_output", "run-3");
  });
  it("the cap reached at reservation stops before any call", async () => {
    const s = store({ reserve: async () => ({ ...GATE, allowed: false, reason: "cap" as const }) });
    const call = vi.fn();
    expect(await runTocExtraction({ ...base, store: s, call }, job)).toMatchObject({ status: "failed", code: "ai_cap", tries: 0 });
    expect(call).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`Cannot find module '@/lib/curriculum/tocTool'`).

- [ ] **Step 3: Prompt**

`prompts/curriculum-toc.v1.md`:

```markdown
Bạn giúp thầy/cô dạy tiếng Anh đọc MỤC LỤC của một quyển sách để app biết sách có những Unit nào và mỗi Unit dạy điểm nào.
Bạn chỉ đọc tài liệu đính kèm ("MỤC LỤC"). Không có thông tin nào về học sinh, và bạn không cần thông tin đó.
Sách: {{BOOK}}

Quy tắc:
1. `units` = các đơn vị DẠY theo đúng thứ tự in trong mục lục (Unit, Lesson, Chapter…). Không bỏ sót, không gộp, không đảo thứ tự.
   `number` = số in trên mục lục, chép nguyên ("7"); không có số thì chép nhãn ("Starter"). `title` = tên Unit tiếng Anh như in.
   `section` = loại in kèm (Grammar, Vocabulary, Reading…), không có thì null. `page` = số trang in trên mục lục, không thấy thì null.
2. KHÔNG đưa vào `units`: bài ôn (Review), bài kiểm tra (Progress Test, Test), phần tra cứu (Reference, database, Grammar reference,
   Wordlist), lời giới thiệu. Ghi chúng vào `ignored` với `reason` = review / test / reference / other, kèm `label` như in và `page`.
3. `points` = các điểm Unit đó dạy, CHỈ chọn trong DANH SÁCH ĐIỂM bên dưới (đúng key). Chọn điểm khi tên Unit hoặc mục con cho thấy rõ Unit
   dạy điểm đó. Unit từ vựng thường dạy: từ theo chủ đề / ngữ cảnh, cụm động từ, thành ngữ, dạng từ — chọn các key tương ứng nếu có.
   Không chắc → để trống và đặt `needs_review = true`.
4. Unit dạy điểm KHÔNG có trong danh sách → ghi vào `missing_points` (tiếng Việt, ngắn, vd "Thì quá khứ"), đặt `needs_review = true`,
   `review_reason` nói rõ. Không bao giờ tự đặt key mới.
5. `needs_review = true` cả khi: chữ khó đọc, số Unit không liền mạch, trang không rõ, hoặc bạn đoán điểm chỉ từ tên Unit.
   `review_reason` = một câu tiếng Việt ngắn; không có thì null.
6. Gọi tool `save_curriculum_toc` ĐÚNG MỘT LẦN với toàn bộ mục lục.

DANH SÁCH ĐIỂM (key — tên (mảng › nhóm)):
{{TAGS}}
```

- [ ] **Step 4: Tool + job**

`lib/curriculum/tocTool.ts`:

```ts
/** The tool `save_curriculum_toc` (forced, spec §5) and the request of one "Đọc mục lục": the PDF + the closed list + the prompt. Pure. */
import type { AiDocument, ToolCall, ToolSpec } from "@/lib/ai/request";
import type { TocContext } from "./context";
import { IGNORED_REASONS } from "./types";

export const TOC_TOOL_NAME = "save_curriculum_toc";
export const TOC_DOC_TITLE = "MỤC LỤC";
export const TOC_MAX_TOKENS = 16000;

export function tocTool(ctx: TocContext): ToolSpec {
  const str = { type: "string" };
  return {
    name: TOC_TOOL_NAME,
    description: "Save the teaching units of the book's table of contents, in book order, each linked only to points of the given list.",
    input_schema: {
      type: "object",
      required: ["units", "ignored"],
      properties: {
        units: {
          type: "array",
          items: {
            type: "object",
            required: ["number", "title", "section", "page", "points", "missing_points", "needs_review", "review_reason"],
            properties: {
              number: { type: "string", description: "The unit number exactly as printed (\"7\"), or its label when there is no number." },
              title: str,
              section: { type: ["string", "null"], description: "e.g. Grammar / Vocabulary / Reading, as printed; null if none." },
              page: { type: ["integer", "null"] },
              points: { type: "array", items: { type: "string", enum: ctx.tags.map((t) => t.key) } },
              missing_points: { type: "array", items: str, description: "Points this unit teaches that are NOT in the list (short Vietnamese)." },
              needs_review: { type: "boolean" },
              review_reason: { type: ["string", "null"] },
            },
          },
        },
        ignored: {
          type: "array",
          items: {
            type: "object",
            required: ["label", "page", "reason"],
            properties: { label: str, page: { type: ["integer", "null"] }, reason: { type: "string", enum: [...IGNORED_REASONS] } },
          },
        },
      },
    },
  };
}

/** The prompt with the book and the closed list in place: book title + level note + tag keys and names — nothing about the child. */
export function fillTocPrompt(template: string, ctx: TocContext, book: { title: string; levelNote: string | null }): string {
  const tags = ctx.tags.length
    ? ctx.tags.map((t) => `- ${t.key} — ${t.label}${t.domain ? ` (${t.domain}${t.group ? ` › ${t.group}` : ""})` : ""}`).join("\n")
    : "- (không có)";
  return template
    .replace("{{BOOK}}", book.levelNote ? `${book.title} (${book.levelNote})` : book.title)
    .replace("{{TAGS}}", tags);
}

export function buildTocCall(o: { model: string; toolChoice: "tool" | "auto"; prompt: string; ctx: TocContext; book: { title: string; levelNote: string | null }; doc: AiDocument }): ToolCall {
  return { model: o.model, documents: [o.doc], instructions: fillTocPrompt(o.prompt, o.ctx, o.book), tool: tocTool(o.ctx), maxTokens: TOC_MAX_TOKENS, toolChoice: o.toolChoice };
}
```

`lib/curriculum/extract.ts`:

```ts
/**
 * The background job of "Cho AI đọc mục lục" (DOMAIN §9.2): check the gate again, read the PDF, call the AI at most 3 times (EVERY call
 * logged in ai_runs with purpose curriculum_toc, its prompt version and its estimated cost, after a worst-case reservation under the
 * family lock), normalize the answer into a draft and save it — or mark the version ai_failed so the screen offers "Soạn tay". Never
 * sends anything about the child. Same loop as lib/studio/extract.ts (Studio B1 is left untouched). Framework-free.
 */
import { refusalStatus, type GateState } from "@/lib/ai/cap";
import { estimateCostUsd, isPricedModel } from "@/lib/ai/pricing";
import { AiCallError, estimateInputTokens, type CallOptions, type ToolCall, type ToolResult, type Usage } from "@/lib/ai/request";
import type { RunLog } from "@/lib/studio/extract";
import type { TocContext } from "./context";
import { normalizeToc } from "./normalize";
import { aiTocSchema, type CurriculumPayload } from "./schema";
import { buildTocCall, TOC_DOC_TITLE } from "./tocTool";

export interface TocExtractStore {
  gate(learnerId: string): Promise<GateState>;
  /** Under the family lock: refuse when spent + the worst-case price of this call reaches the hard cap, else write the reservation. */
  reserve(a: { learnerId: string; estimateUsd: number; versionId: string; model: string; byMemberId: string }): Promise<GateState>;
  /** RunLog.draftId carries the version id (ai_runs.draft_id has no foreign key). */
  logRun(r: RunLog): Promise<string>;
  finish(versionId: string, payload: CurriculumPayload, runId: string): Promise<{ applied: boolean }>;
  fail(versionId: string, errorCode: string, runId: string | null): Promise<{ applied: boolean }>;
}
export type TocJob = { versionId: string; familyId: string; learnerId: string; byMemberId: string; tocPath: string; book: { title: string; levelNote: string | null } };
export type TocDeps = {
  store: TocExtractStore;
  download: (path: string) => Promise<Uint8Array>;
  context: () => Promise<TocContext>;
  call: (c: ToolCall, o?: CallOptions) => Promise<ToolResult>;
  model: string;
  toolChoice: "tool" | "auto";
  prompt: { text: string; version: string };
  maxTries?: number;
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};
export type TocOutcome = { status: "ok" | "failed" | "refused"; code: string | null; tries: number };

const BACKOFF_MS = [1_000, 3_000];
const MIN_CALL_MS = 60_000;
const MARGIN_MS = 20_000;
const MAX_CALL_MS = 240_000;
const COSTS_INPUT = new Set(["timeout", "http_5xx", "network"]);

export async function runTocExtraction(deps: TocDeps, job: TocJob): Promise<TocOutcome> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();
  const log = (status: RunLog["status"], errorCode: string | null, usage: Usage, model: string | null, releasesRunId: string | null = null) =>
    deps.store.logRun({
      familyId: job.familyId, draftId: job.versionId, model, promptVersion: deps.prompt.version, inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens, costUsd: model ? estimateCostUsd(model, usage.inputTokens, usage.outputTokens) : 0, status, errorCode,
      byMemberId: job.byMemberId, releasesRunId,
    });
  const none: Usage = { inputTokens: 0, outputTokens: 0 };

  if (!isPricedModel(deps.model)) {
    await log("refused_model", "ai_model", none, null);
    await deps.store.fail(job.versionId, "ai_model", null);
    return { status: "refused", code: "ai_model", tries: 0 };
  }
  const gate = await deps.store.gate(job.learnerId);
  if (!gate.allowed && gate.reason) {
    await log(refusalStatus(gate.reason), gate.reason, none, null);
    await deps.store.fail(job.versionId, `ai_${gate.reason}`, null);
    return { status: "refused", code: `ai_${gate.reason}`, tries: 0 };
  }
  let base64: string;
  try {
    base64 = Buffer.from(await deps.download(job.tocPath)).toString("base64");
  } catch {
    await deps.store.fail(job.versionId, "file_unreadable", null);
    return { status: "failed", code: "file_unreadable", tries: 0 };
  }
  const ctx = await deps.context();

  let toolChoice = deps.toolChoice;
  let lastCode = "ai_failed";
  let lastRun: string | null = null;
  let tries = 0;
  for (let t = 1; t <= (deps.maxTries ?? 3); t += 1) {
    if (t > 1) await sleep(BACKOFF_MS[t - 2] ?? 3_000);
    const remaining = (deps.budgetMs ?? 280_000) - (now() - started);
    if (remaining < MIN_CALL_MS) {
      lastCode = "timeout";
      break;
    }
    const call = buildTocCall({ model: deps.model, toolChoice, prompt: deps.prompt.text, ctx, book: job.book, doc: { kind: "pdf", title: TOC_DOC_TITLE, base64 } });
    const inputEstimate = estimateInputTokens(call);
    const g = await deps.store.reserve({
      learnerId: job.learnerId, estimateUsd: estimateCostUsd(deps.model, inputEstimate, call.maxTokens), versionId: job.versionId, model: deps.model, byMemberId: job.byMemberId,
    });
    if (!g.allowed && g.reason) {
      await log(refusalStatus(g.reason), g.reason, none, null);
      lastCode = `ai_${g.reason}`;
      break;
    }
    const reservation = g.reservationId ?? null;
    tries = t;
    try {
      const r = await deps.call(call, { timeoutMs: Math.min(MAX_CALL_MS, remaining - MARGIN_MS) });
      const parsed = aiTocSchema.safeParse(r.input);
      if (!parsed.success || parsed.data.units.length === 0) {
        lastRun = await log("error", "bad_output", r.usage, deps.model, reservation);
        lastCode = "bad_output";
        continue;
      }
      const runId = await log("ok", null, r.usage, deps.model, reservation);
      await deps.store.finish(job.versionId, normalizeToc(parsed.data, ctx), runId);
      return { status: "ok", code: null, tries: t };
    } catch (err) {
      const e = err instanceof AiCallError ? err : new AiCallError("network");
      const usage = e.usage.inputTokens === 0 && e.usage.outputTokens === 0 && COSTS_INPUT.has(e.code) ? { inputTokens: inputEstimate, outputTokens: call.maxTokens } : e.usage;
      lastRun = await log("error", e.code, usage, deps.model, reservation);
      lastCode = e.code;
      if (e.code === "tool_choice" && toolChoice === "tool") {
        toolChoice = "auto";
        continue;
      }
      if (e.code === "http_401" || e.code === "http_400") break;
    }
  }
  await deps.store.fail(job.versionId, lastCode, lastRun);
  return { status: "failed", code: lastCode, tries };
}
```

- [ ] **Step 5: `AI_FAKE` per tool, prompt constant, file kind**

`lib/ai/config.ts`:

```diff
diff --git a/lib/ai/config.ts b/lib/ai/config.ts
--- a/lib/ai/config.ts
+++ b/lib/ai/config.ts
@@ -3,4 +3,10 @@
 export const DEFAULT_STUDIO_MODEL = "claude-sonnet-5-5";
 export const AI_FAKE_FIXTURE = "tests/fixtures/studio/fake-extract.json";
+/** AI_FAKE answer per tool name (each AI job has its own forced tool); a tool not listed gets the Studio fixture. */
+export const AI_FAKE_FIXTURES: Record<string, string> = {
+  save_exercise: AI_FAKE_FIXTURE,
+  save_curriculum_toc: "tests/fixtures/curriculum/fake-toc.json",
+};
+export const fakeFixtureFor = (toolName: string): string => AI_FAKE_FIXTURES[toolName] ?? AI_FAKE_FIXTURE;
 /** Version of the short consent text on /settings/ai (consents.notice_version). Change the text → new version. */
 export const AI_NOTICE_VERSION = "ai-studio-v1";
```

`lib/ai/anthropic.ts`:

```diff
diff --git a/lib/ai/anthropic.ts b/lib/ai/anthropic.ts
--- a/lib/ai/anthropic.ts
+++ b/lib/ai/anthropic.ts
@@ -3,5 +3,5 @@ import "server-only";
 import { readFileSync } from "node:fs";
 import path from "node:path";
-import { AI_FAKE_FIXTURE, aiFake } from "./config";
+import { aiFake, fakeFixtureFor } from "./config";
 import { AiCallError, postToolCall, type CallOptions, type ToolCall, type ToolResult } from "./request";
 
@@ -13,5 +13,5 @@ export function createToolCaller(env: Record<string, string | undefined> = proce
   if (aiFake(env)) {
     return async (c) => ({
-      input: JSON.parse(readFileSync(path.join(process.cwd(), AI_FAKE_FIXTURE), "utf8")) as unknown,
+      input: JSON.parse(readFileSync(path.join(process.cwd(), fakeFixtureFor(c.tool.name)), "utf8")) as unknown,
       usage: { inputTokens: 1000, outputTokens: 500 },
       model: c.model,
```

`lib/ai/prompts.ts`:

```diff
diff --git a/lib/ai/prompts.ts b/lib/ai/prompts.ts
--- a/lib/ai/prompts.ts
+++ b/lib/ai/prompts.ts
@@ -5,4 +5,5 @@ import path from "node:path";
 
 export const STUDIO_PROMPT = { file: "studio-extract.v1", version: "studio-extract.v1" } as const;
+export const CURRICULUM_PROMPT = { file: "curriculum-toc.v1", version: "curriculum-toc.v1" } as const;
 
 export function loadPrompt(file: string, root: string = process.cwd()): string {
```

`lib/storage/rules.ts`:

```diff
diff --git a/lib/storage/rules.ts b/lib/storage/rules.ts
--- a/lib/storage/rules.ts
+++ b/lib/storage/rules.ts
@@ -27,5 +27,5 @@ export type AllowedMime = (typeof ALLOWED_MIMES)[number];
 
 /** What a stored file is for (column files.kind). */
-export const FILE_KINDS = ["assignment_pdf", "answer_key", "result_image", "work_photo", "external_result", "studio_test", "studio_key"] as const;
+export const FILE_KINDS = ["assignment_pdf", "answer_key", "result_image", "work_photo", "external_result", "studio_test", "studio_key", "curriculum_toc"] as const;
 export type FileKind = (typeof FILE_KINDS)[number];
 
@@ -63,5 +63,5 @@ export function checkFile(kind: FileKind, mime: unknown, bytes: unknown): FileCh
   if (mime === DOCX_MIME && !studio) return { ok: false, reason: "kind" };
   if (studio && !(STUDIO_MIMES as readonly string[]).includes(mime)) return { ok: false, reason: "kind" };
-  if (kind === "assignment_pdf" && mime !== "application/pdf") return { ok: false, reason: "kind" };
+  if ((kind === "assignment_pdf" || kind === "curriculum_toc") && mime !== "application/pdf") return { ok: false, reason: "kind" };
   if (kind === "result_image" && !isImageMime(mime)) return { ok: false, reason: "kind" };
   return { ok: true };
```

- [ ] **Step 6: Run** `npx vitest run tests/unit/curriculumAi.test.ts tests/unit/aiClient.test.ts tests/unit/storageRules.test.ts tests/unit/studioExtract.test.ts` → PASS; `npm run typecheck`.

- [ ] **Step 7: Commit**

```bash
git add prompts/curriculum-toc.v1.md lib/curriculum/tocTool.ts lib/curriculum/extract.ts lib/ai/config.ts lib/ai/anthropic.ts lib/ai/prompts.ts lib/storage/rules.ts tests/unit/curriculumAi.test.ts
git commit -m "feat(w2): curriculum-toc.v1 prompt, forced tool, background job with cap reservation and run log; AI_FAKE fixture per tool

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 7: Máy chủ — quyền, view, handler, store, route, loader, API

**Files:**
- Modify: `lib/auth/requireAccess.ts`
- Create: `lib/curriculum/shape.ts`, `handlers.ts`, `supabaseStore.ts`, `route.ts`, `load.ts`
- Create: `app/api/learners/[id]/curricula/route.ts`, `app/api/learners/[id]/curricula/files/route.ts`, `app/api/curricula/[id]/versions/route.ts`, `app/api/curricula/[id]/edit/route.ts`, `app/api/curricula/[id]/unit-events/route.ts`, `app/api/curricula/versions/[id]/route.ts`, `app/api/curricula/versions/[id]/approve/route.ts`, `app/api/curricula/versions/[id]/discard/route.ts`
- Test: `tests/unit/curriculumHandlers.test.ts`

**Interfaces:**
- Produces:
  - Actions `"curriculum:read"` (tutor, parent), `"curriculum:write"` (tutor, parent), `"curriculum:approve"` (**tutor only**).
  - `shape.ts`: `parseVersion(raw, {showCost, now?}): VersionView`, `VersionPageData = {version, track_id, context, issues, rows_to_resolve, can_approve, is_tutor, stats}`, `buildCards(raw): CurriculumCard[]` (`{id, title, levelNote, current: {versionId, version, units: CardUnit[]} | null, progress, open, events}`), `taughtChoices(cards): TaughtChoice[]`, `STALE_EXTRACTING_MS`.
  - `handlers.ts`: `CurriculumStore`, `CurriculumDeps`, `handleTocUploadUrl(deps, learnerId, raw)`, `handleCreateCurriculum(deps, learnerId, raw)` → 201 `{version_id, status, curriculum_id}`, `handleAddVersion(deps, curriculumId, raw)`, `handleEditCurriculum(deps, curriculumId, raw)` → `{version_id}`, `handleGetVersion(deps, versionId, {view?})`, `handleSaveVersion`, `handleApproveVersion` (parent → 403 `tutor_only`), `handleDiscardVersion`, `handleSetUnitStatus(deps, curriculumId, raw)`, `fromCurriculumDbError`.
  - `supabaseStore.ts`: `createSupabaseCurriculumStore()` (gửi `p_purpose: 'curriculum_toc'` cho `eng_ai_gate` giữ chỗ và `eng_log_ai_run`).
  - `load.ts`: `loadTocContext(learnerId, trackId)`, `loadCurriculumCards(learnerId)` (client người dùng, RLS), `loadTaughtChoices(learnerId)` (trả `[]` khi lỗi — Ghi buổi vẫn mở trước khi áp 0026), `loadVersionPage(versionId)`.
  - `route.ts`: `runCurriculumRoute(routeName, run)`.

- [ ] **Step 1: Failing handler tests**

`tests/unit/curriculumHandlers.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import type { TocContext } from "@/lib/curriculum/context";
import {
  handleApproveVersion, handleCreateCurriculum, handleGetVersion, handleSetUnitStatus, handleTocUploadUrl, type CurriculumDeps, type CurriculumStore,
} from "@/lib/curriculum/handlers";
import { normalizeToc } from "@/lib/curriculum/normalize";
import { aiTocSchema, type CurriculumPayload } from "@/lib/curriculum/schema";
import { ReviewDbError } from "@/lib/review/handlers";

const FAMILY = "f0000000-0000-4000-8000-000000000001";
const AN = "a0000000-0000-4000-8000-000000000001";
const NGUYEN = "b0000000-0000-4000-8000-000000000001";
const CUR = "c0000000-0000-4000-8000-0000000000c1";
const VER = "d0000000-0000-4000-8000-0000000000d1";
const FILE = "e0000000-0000-4000-8000-0000000000f1";
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
const FAKE = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/curriculum/fake-toc.json"), "utf8")) as unknown;
const CTX: TocContext = {
  tags: ["cau-dieu-kien-dao-ngu", "wish-would-rather", "modal-suy-doan", "bi-dong-nho-tuong-thuat", "dang-tu", "tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "tu-noi-lap-luan"]
    .map((key) => ({ key, label: key, domain: null, group: null, custom: false })),
};
const AI_DRAFT = normalizeToc(aiTocSchema.parse(FAKE), CTX);
const resolved = (p: CurriculumPayload): CurriculumPayload => ({ ...p, units: p.units.map((u) => ({ ...u, needs_review: false })) });
const versionRow = (payload: CurriculumPayload, over: Record<string, unknown> = {}) => ({
  version: {
    id: VER, curriculum_id: CUR, learner_id: NGUYEN, version: 1, source: "ai", status: "draft", payload, ai_payload: AI_DRAFT, error_code: null,
    updated_at: "2026-11-08 03:00:00.123456+00", approved_at: null, review: null, created_at: "2026-11-08T03:00:00Z", ...over,
  },
  curriculum: { id: CUR, learner_id: NGUYEN, title: "Destination C1&C2", level_note: "C1–C2" },
  ai_cost_usd: 0.0421,
});
const GATE_ON = { family_id: FAMILY, enabled: true, consent: true, spent_usd: 1.5, monthly_cap_usd: 10, soft_cap_usd: 8, soft_reached: false, allowed: true, reason: null };

function store(over: Partial<CurriculumStore> = {}): CurriculumStore {
  return {
    getCurriculum: vi.fn(async (id: string) => (id === CUR ? { learner_id: NGUYEN, title: "Destination C1&C2", level_note: "C1–C2" } : null)),
    getVersionLearnerId: vi.fn(async (id: string) => (id === VER ? NGUYEN : null)),
    issueUploadTicket: vi.fn(async () => ({ issued: 1 })),
    aiGate: vi.fn(async () => GATE_ON),
    aiReserve: vi.fn(async () => ({ ...GATE_ON, reservation_id: "res-1" })),
    logAiRun: vi.fn(async () => "run-1"),
    create: vi.fn(async () => ({ curriculum_id: CUR, version_id: VER, status: "extracting", replayed: false })),
    addVersion: vi.fn(async () => ({ version_id: VER, status: "draft", replayed: false })),
    edit: vi.fn(async () => ({ id: VER, replayed: false })),
    version: vi.fn(async () => versionRow(AI_DRAFT)),
    save: vi.fn(async () => ({ updated_at: "2026-11-08 03:01:00.000001+00" })),
    finish: vi.fn(async () => ({ applied: true })),
    fail: vi.fn(async () => ({ applied: true })),
    discard: vi.fn(async () => ({ id: VER, status: "discarded" })),
    approve: vi.fn(async () => ({ version_id: VER, version: 1, units: 26 })),
    setUnitStatus: vi.fn(async () => ({ id: "ev-1", replayed: false })),
    ...over,
  };
}
function deps(user: string | null, s: CurriculumStore = store()): CurriculumDeps & { jobs: (() => Promise<void>)[] } {
  const jobs: (() => Promise<void>)[] = [];
  return {
    jobs,
    user: user ? { id: `u-${user}` } : null,
    store: s,
    storage: {
      createUpload: vi.fn(async (p: string) => ({ url: `https://upload/${p}` })),
      stat: vi.fn(async () => ({ bytes: 2048, mime: "application/pdf" })),
      createDownload: vi.fn(async () => "https://dl"),
      removeFolder: vi.fn(async () => 0),
      download: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
    },
    access: { store: access, allowRealLearners: false, now: new Date("2026-11-08T08:00:00Z") },
    schedule: (job) => jobs.push(job),
    loadContext: async () => CTX,
    getAi: () => ({ call: async () => ({ input: FAKE, usage: { inputTokens: 900, outputTokens: 2400 }, model: "claude-sonnet-5-5" }), model: "claude-sonnet-5-5", toolChoice: "tool", prompt: { text: "{{BOOK}}\n{{TAGS}}", version: "curriculum-toc.v1" } }),
    newId: () => FILE,
  };
}
const pdf = { id: FILE, mime: "application/pdf", bytes: 2048 };
const create = (who: string, s = store(), body: Record<string, unknown> = {}) =>
  handleCreateCurriculum(deps(who, s), NGUYEN, { title: "Destination C1&C2", level_note: "C1–C2", mode: "ai", toc_file: pdf, client_id: "cur-00000001", ...body });

describe("curriculum API — access", () => {
  it("students, the other child's tutor and anonymous get nothing", async () => {
    expect((await handleGetVersion(deps("studentNguyen"), VER)).status).toBe(403);
    expect((await handleGetVersion(deps("tutorAn"), VER)).status).toBe(404);
    expect((await handleGetVersion(deps(null), VER)).status).toBe(401);
    expect((await handleTocUploadUrl(deps("tutorAn"), NGUYEN, { mime: "application/pdf", bytes: 10 })).status).toBe(404);
  });
  it("the table of contents must be a PDF", async () => {
    expect((await handleTocUploadUrl(deps("parent"), NGUYEN, { mime: "image/png", bytes: 10 })).body).toMatchObject({ error: "file_type" });
    expect((await handleTocUploadUrl(deps("tutorNguyen"), NGUYEN, { mime: "application/pdf", bytes: 10 })).status).toBe(201);
  });
});

describe("Cho AI đọc mục lục", () => {
  it("tutor or parent starts it; the job reserves, logs ONE ok run with purpose prompt version and saves the 26-unit draft", async () => {
    const s = store();
    const d = deps("parent", s);
    const r = await handleCreateCurriculum(d, NGUYEN, { title: "Destination C1&C2", level_note: "C1–C2", mode: "ai", toc_file: pdf, client_id: "cur-00000001" });
    expect(r).toMatchObject({ status: 201, body: { version_id: VER, status: "extracting", curriculum_id: CUR } });
    expect(d.jobs).toHaveLength(1);
    await d.jobs[0]!();
    expect(s.aiReserve).toHaveBeenCalledWith(expect.objectContaining({ versionId: VER, model: "claude-sonnet-5-5" }));
    expect(s.logAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "ok", promptVersion: "curriculum-toc.v1", draftId: VER, releasesRunId: "res-1" }));
    const saved = (s.finish as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { payload: CurriculumPayload };
    expect(saved.payload.units.map((u) => u.code)).toEqual(Array.from({ length: 26 }, (_, i) => `U${i + 1}`));
  });
  it("AI off → 409 ai_off and a refused run is logged; Soạn tay still works without a file; AI without a file → 400", async () => {
    const s = store({ aiGate: vi.fn(async () => ({ ...GATE_ON, enabled: false, allowed: false, reason: "off" })) });
    expect((await create("tutorNguyen", s)).body).toMatchObject({ error: "ai_off" });
    expect(s.logAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "refused_off" }));
    expect((await create("tutorNguyen", store({ create: vi.fn(async () => ({ curriculum_id: CUR, version_id: VER, status: "draft", replayed: false })) }), { mode: "manual", toc_file: null })).status).toBe(201);
    expect((await create("tutorNguyen", store(), { toc_file: null })).body).toMatchObject({ error: "toc_file_required" });
  });
});

describe("Duyệt (the child's tutor only — D-W8)", () => {
  const base = "2026-11-08 03:00:00.123456+00";
  it("refused while rows still need a look; a parent is refused; the tutor approves the kept rows with the edit count", async () => {
    expect((await handleApproveVersion(deps("tutorNguyen"), VER, { base_updated_at: base, quality: null, quality_note: null })).body).toMatchObject({ error: "blocked" });
    const s = store({ version: vi.fn(async () => versionRow(resolved(AI_DRAFT))) });
    expect((await handleApproveVersion(deps("parent", s), VER, { base_updated_at: base, quality: "good", quality_note: null })).body).toMatchObject({ error: "tutor_only" });
    const r = await handleApproveVersion(deps("tutorNguyen", s), VER, { base_updated_at: base, quality: "good", quality_note: "Đọc đúng hết" });
    expect(r).toEqual({ status: 200, body: { version: 1, units: 26 } });
    const arg = (s.approve as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { units: unknown[]; review: { stats: { ai_rows: number; kept: number }; quality: string } };
    expect(arg.units).toHaveLength(26);
    expect(arg.review).toMatchObject({ stats: { ai_rows: 26, kept: 26 }, quality: "good" });
  });
  it("a stale base → 409; database tags map to codes", async () => {
    const s = store({ version: vi.fn(async () => versionRow(resolved(AI_DRAFT))) });
    expect((await handleApproveVersion(deps("tutorNguyen", s), VER, { base_updated_at: "2026-11-08 02:00:00+00", quality: null, quality_note: null })).status).toBe(409);
    const bad = store({ setUnitStatus: vi.fn(async () => Promise.reject(new ReviewDbError("23514", "eng_set_unit_status: x (unknown_unit)"))) });
    expect((await handleSetUnitStatus(deps("tutorNguyen", bad), CUR, { unit_code: "U99", status: "done", lesson_note_id: null, client_id: "ev-00000001" })).body).toMatchObject({ error: "unknown_unit" });
  });
  it("GET: a tutor never sees the AI cost; the parent does; can_approve only for the tutor", async () => {
    const t = (await handleGetVersion(deps("tutorNguyen"), VER)).body as { version: { aiCostUsd: number | null }; can_approve: boolean; rows_to_resolve: number };
    expect([t.version.aiCostUsd, t.rows_to_resolve, t.can_approve]).toEqual([null, 8, false]);
    const p = (await handleGetVersion(deps("parent", store({ version: vi.fn(async () => versionRow(resolved(AI_DRAFT))) })), VER)).body as { version: { aiCostUsd: number }; can_approve: boolean };
    expect([p.version.aiCostUsd, p.can_approve]).toEqual([0.0421, false]);
  });
});
```

- [ ] **Step 2: Run → FAIL** (module missing).

- [ ] **Step 3: Access actions**

`lib/auth/requireAccess.ts`:

```diff
diff --git a/lib/auth/requireAccess.ts b/lib/auth/requireAccess.ts
--- a/lib/auth/requireAccess.ts
+++ b/lib/auth/requireAccess.ts
@@ -34,4 +34,7 @@ export type Action =
   | "studio:read" //       Studio drafts and tests of a child (Studio B1) - tutor and parent; never students
   | "studio:write" //      upload, edit, approve, assign a Studio test, decide "Cần thầy/cô xem" items - tutor and parent of the child
+  | "curriculum:read" //   curricula, their versions, units and unit statuses (W2) - tutor and parent; never students
+  | "curriculum:write" //  add a curriculum, upload its contents, edit / discard a draft, set a unit's status (W2) - tutor and parent
+  | "curriculum:approve" // approve a curriculum version (W2, D-W8) - the child's tutor only; the database checks it again
   | "targets:read" //        tracked-skills page (target set) — parent and tutor only
   | "inquiries:read" //     assigned inquiries + assignable templates — parent and tutor only
@@ -63,4 +66,7 @@ export const ACTIONS_BY_ROLE: Record<Role, readonly Action[]> = {
     "studio:read",
     "studio:write",
+    "curriculum:read",
+    "curriculum:write",
+    "curriculum:approve",
   ],
   parent: [
@@ -81,4 +87,6 @@ export const ACTIONS_BY_ROLE: Record<Role, readonly Action[]> = {
     "studio:read",
     "studio:write",
+    "curriculum:read",
+    "curriculum:write",
     "admin",
   ],
```

- [ ] **Step 4: Implement shape, handlers, store, route, load**

`lib/curriculum/shape.ts`:

```ts
/**
 * Database rows → views of the curriculum screens (zod; anything unexpected throws → 500, logged, instead of a half-right screen). Pure:
 * the Giáo trình cards (progress of the version in use) and one version for the review screen.
 */
import { z } from "zod";
import type { TocContext } from "./context";
import type { EditStats } from "./editStats";
import { curriculumProgress, type CurriculumProgress, type ProgressUnit, type UnitEventRow } from "./progress";
import { curriculumPayloadSchema, type CurriculumPayload } from "./schema";
import type { CurriculumIssue } from "./validate";
import { QUALITY, UNIT_STATUSES, VERSION_STATUSES, type Quality, type VersionStatus } from "./types";

/** A version still "extracting" this long after it was made is shown as failed ("timeout") — the background job is gone (route maxDuration 300 s). */
export const STALE_EXTRACTING_MS = 6 * 60_000;

const text = z.string();
const int = z.number().int();
const version = z.object({
  id: text,
  curriculum_id: text,
  learner_id: text,
  version: int,
  source: z.enum(["ai", "manual", "edit"]),
  status: z.enum(VERSION_STATUSES),
  payload: z.unknown(),
  ai_payload: z.unknown().nullable(),
  error_code: text.nullable(),
  updated_at: text,
  approved_at: text.nullable(),
  review: z.unknown().nullable(),
  created_at: text,
});
const curriculum = z.object({ id: text, learner_id: text, title: text, level_note: text.nullable() });
const reviewRecord = z.object({
  stats: z
    .object({ ai_rows: int, kept: int, edited: int, dropped: int, added: int, edited_pct: int, reasons: z.record(z.string(), int) })
    .nullable()
    .default(null),
  quality: z.enum(QUALITY).nullable().default(null),
  quality_note: text.nullable().default(null),
});
export type ReviewRecord = { stats: EditStats | null; quality: Quality | null; qualityNote: string | null };

export type VersionView = {
  id: string;
  curriculumId: string;
  learnerId: string;
  title: string;
  levelNote: string | null;
  version: number;
  source: "ai" | "manual" | "edit";
  status: VersionStatus;
  payload: CurriculumPayload;
  aiPayload: CurriculumPayload | null;
  errorCode: string | null;
  updatedAt: string;
  approvedAt: string | null;
  review: ReviewRecord | null;
  stale: boolean;
  /** Parent only (spec §8): what the AI calls of this version cost, USD. null for a tutor. */
  aiCostUsd: number | null;
};

/** eng store `version()` returns {version, curriculum, ai_cost_usd}. */
export function parseVersion(raw: unknown, opts: { showCost: boolean; now?: number }): VersionView {
  const r = z.object({ version, curriculum, ai_cost_usd: z.union([z.number(), z.string()]).transform(Number) }).parse(raw);
  const v = r.version;
  const rv = v.review === null ? null : reviewRecord.parse(v.review);
  return {
    id: v.id,
    curriculumId: v.curriculum_id,
    learnerId: v.learner_id,
    title: r.curriculum.title,
    levelNote: r.curriculum.level_note,
    version: v.version,
    source: v.source,
    status: v.status,
    payload: curriculumPayloadSchema.parse(v.payload),
    aiPayload: v.ai_payload === null ? null : curriculumPayloadSchema.parse(v.ai_payload),
    errorCode: v.error_code,
    updatedAt: v.updated_at,
    approvedAt: v.approved_at,
    review: rv === null ? null : { stats: rv.stats as EditStats | null, quality: rv.quality, qualityNote: rv.quality_note },
    stale: v.status === "extracting" && (opts.now ?? Date.now()) - Date.parse(v.created_at) > STALE_EXTRACTING_MS,
    aiCostUsd: opts.showCost ? r.ai_cost_usd : null,
  };
}

/** Body of GET /api/curricula/versions/:id and the data of the review page. */
export type VersionPageData = {
  version: VersionView;
  /** Track of the child (tags of the review screen). */
  track_id: string;
  context: TocContext;
  issues: CurriculumIssue[];
  rows_to_resolve: number;
  can_approve: boolean;
  is_tutor: boolean;
  stats: EditStats | null;
};

// ---- Cards of the Giáo trình page -------------------------------------------------------------------------------------------------
const cardRows = z.object({
  curricula: z.array(z.object({ id: text, title: text, level_note: text.nullable(), created_at: text })),
  versions: z.array(z.object({ id: text, curriculum_id: text, version: int, status: z.enum(VERSION_STATUSES), error_code: text.nullable() })),
  units: z.array(z.object({ version_id: text, code: text, ord: int, title: text, section: text.nullable(), page: int.nullable(), skipped: z.boolean() })),
  points: z.array(z.object({ version_id: text, code: text, tag_key: text, ord: int })),
  events: z.array(z.object({ id: text, curriculum_id: text, unit_code: text, status: z.enum(UNIT_STATUSES), created_at: text })),
});
export type CardUnit = ProgressUnit & { section: string | null; page: number | null; points: string[] };
export type CurriculumCard = {
  id: string;
  title: string;
  levelNote: string | null;
  /** The approved version in use, or null (nothing approved yet). */
  current: { versionId: string; version: number; units: CardUnit[] } | null;
  progress: CurriculumProgress | null;
  /** A draft being read / reviewed (one at most). */
  open: { versionId: string; version: number; status: VersionStatus; errorCode: string | null } | null;
  events: UnitEventRow[];
};

export function buildCards(raw: unknown): CurriculumCard[] {
  const r = cardRows.parse(raw);
  return [...r.curricula]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((c) => {
      const versions = r.versions.filter((v) => v.curriculum_id === c.id);
      const cur = versions.find((v) => v.status === "approved") ?? null;
      const open = versions.find((v) => v.status === "extracting" || v.status === "ai_failed" || v.status === "draft") ?? null;
      const events: UnitEventRow[] = r.events
        .filter((e) => e.curriculum_id === c.id)
        .map((e) => ({ unitCode: e.unit_code, status: e.status, at: e.created_at, id: e.id }));
      const units: CardUnit[] = cur
        ? r.units
            .filter((u) => u.version_id === cur.id)
            .sort((a, b) => a.ord - b.ord)
            .map((u) => ({
              code: u.code, ord: u.ord, title: u.title, skipped: u.skipped, section: u.section, page: u.page,
              points: r.points.filter((p) => p.version_id === cur.id && p.code === u.code).sort((a, b) => a.ord - b.ord).map((p) => p.tag_key),
            }))
        : [];
      return {
        id: c.id,
        title: c.title,
        levelNote: c.level_note,
        current: cur ? { versionId: cur.id, version: cur.version, units } : null,
        progress: cur ? curriculumProgress(units, events) : null,
        open: open ? { versionId: open.id, version: open.version, status: open.status, errorCode: open.error_code } : null,
        events,
      };
    });
}

/** "Unit đã dạy hôm nay" chooser: curricula with an approved version, their units (not skipped) and current statuses. */
export type TaughtChoice = { curriculumId: string; title: string; currentCode: string | null; units: { code: string; title: string; status: string }[]; statusOf: CurriculumProgress["statusOf"] };
export function taughtChoices(cards: CurriculumCard[]): TaughtChoice[] {
  return cards.flatMap((c) =>
    c.current && c.progress
      ? [{
          curriculumId: c.id,
          title: c.title,
          currentCode: c.progress.current?.code ?? null,
          units: c.current.units.filter((u) => !u.skipped && c.progress?.statusOf[u.code] !== "skipped").map((u) => ({ code: u.code, title: u.title, status: c.progress?.statusOf[u.code] ?? "not_started" })),
          statusOf: c.progress.statusOf,
        }]
      : [],
  );
}
```

`lib/curriculum/handlers.ts`:

```ts
/**
 * Framework-free handlers of the curriculum routes (W2). Same order everywhere: requireAccess FIRST (401 / 404 outside scope / 403 wrong
 * role), then the body (400), then the injectable store (service-role functions that check the actor again). A tutor never receives the
 * AI cost (Studio rule). Stored file paths never leave the server. Approving is the child's tutor only (D-W8): a parent gets 403.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser, type Action } from "@/lib/auth/requireAccess";
import { parseGate, refusalStatus } from "@/lib/ai/cap";
import type { CallOptions, ToolCall, ToolResult } from "@/lib/ai/request";
import { apiErrors } from "@/lib/copy/vi";
import { ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { buildPath, checkFile, type AllowedMime } from "@/lib/storage/rules";
import type { FileDownloader, FileStorage } from "@/lib/storage/types";
import { FILE_ERRORS, verifyStoredFile } from "@/lib/storage/verify";
import type { RunLog } from "@/lib/studio/extract";
import { sameInstant } from "@/lib/studio/instant";
import type { TocContext } from "./context";
import { editStats } from "./editStats";
import { runTocExtraction, type TocExtractStore } from "./extract";
import {
  addVersionBodySchema, approveCurriculumBodySchema, createCurriculumBodySchema, editCurriculumBodySchema, saveCurriculumBodySchema, tocUploadBodySchema,
  unitStatusBodySchema, type CurriculumPayload, type FileMeta,
} from "./schema";
import { parseVersion, type VersionPageData } from "./shape";
import { finalUnits, rowsToResolve, validateCurriculum } from "./validate";

export interface CurriculumStore {
  getCurriculum(curriculumId: string): Promise<{ learner_id: string; title: string; level_note: string | null } | null>;
  getVersionLearnerId(versionId: string): Promise<string | null>;
  issueUploadTicket(a: { learnerId: string; byMemberId: string }): Promise<unknown>;
  aiGate(learnerId: string): Promise<unknown>;
  aiReserve(a: { learnerId: string; estimateUsd: number; versionId: string; model: string; byMemberId: string }): Promise<unknown>;
  logAiRun(r: RunLog): Promise<string>;
  create(a: { learnerId: string; title: string; levelNote: string | null; tocFile: FileMeta | null; extract: boolean; byMemberId: string; clientId: string }): Promise<unknown>;
  addVersion(a: { curriculumId: string; tocFile: FileMeta | null; extract: boolean; byMemberId: string; clientId: string }): Promise<unknown>;
  edit(a: { curriculumId: string; byMemberId: string; clientId: string }): Promise<unknown>;
  /** {version: row, curriculum: row, ai_cost_usd} */
  version(versionId: string): Promise<unknown>;
  save(a: { versionId: string; payload: CurriculumPayload; base: string; byMemberId: string }): Promise<unknown>;
  finish(a: { versionId: string; payload: CurriculumPayload; runId: string }): Promise<unknown>;
  fail(a: { versionId: string; errorCode: string; runId: string | null }): Promise<unknown>;
  discard(a: { versionId: string; byMemberId: string }): Promise<unknown>;
  approve(a: { versionId: string; base: string; units: unknown; review: unknown; byMemberId: string }): Promise<unknown>;
  setUnitStatus(a: { curriculumId: string; unitCode: string; status: string; lessonNoteId: string | null; byMemberId: string; clientId: string }): Promise<unknown>;
}

export type CurriculumAi = { call: (c: ToolCall, o?: CallOptions) => Promise<ToolResult>; model: string; toolChoice: "tool" | "auto"; prompt: { text: string; version: string } };
export type CurriculumDeps = {
  user: AccessUser;
  store: CurriculumStore;
  storage: FileStorage & FileDownloader;
  access?: Partial<AccessDeps>;
  /** Runs work after the answer was sent (Next `after()` in the route; tests collect the jobs). */
  schedule: (job: () => Promise<void>) => void;
  /** The closed list of a learner (lib/curriculum/load.ts). */
  loadContext: (learnerId: string, trackId: string) => Promise<TocContext>;
  getAi: () => CurriculumAi;
  log?: (err: unknown) => Promise<void>;
  newId?: () => string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type FailStatus = 400 | 401 | 403 | 404 | 409 | 429;
const fail = (status: FailStatus, error: string, extra: Record<string, unknown> = {}): HandlerResult => ({ status, body: { error, message: apiErrors[status], ...extra } });
type Guard = { ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult };

async function guard(deps: CurriculumDeps, learnerId: string, action: Action): Promise<Guard> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}
async function guardVersion(deps: CurriculumDeps, versionId: string, action: Action): Promise<Guard> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(versionId)) return { ok: false, result: fail(404, "not_found") };
  const learnerId = await deps.store.getVersionLearnerId(versionId);
  if (!learnerId) return { ok: false, result: fail(404, "not_found") };
  return guard(deps, learnerId, action);
}
async function guardCurriculum(deps: CurriculumDeps, curriculumId: string, action: Action): Promise<(Guard & { ok: true; book: { title: string; levelNote: string | null } }) | { ok: false; result: HandlerResult }> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(curriculumId)) return { ok: false, result: fail(404, "not_found") };
  const c = await deps.store.getCurriculum(curriculumId);
  if (!c) return { ok: false, result: fail(404, "not_found") };
  const g = await guard(deps, c.learner_id, action);
  return g.ok ? { ...g, book: { title: c.title, levelNote: c.level_note } } : g;
}

/** Database errors → HTTP. The "(tag)" at the end of a message becomes the error code the screens explain (curriculumErrors in vi.ts). */
export function fromCurriculumDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    const tag = /\(([a-z_]+)\)\s*$/.exec(err.detail)?.[1] ?? null;
    switch (err.code) {
      case "42501":
        return fail(403, tag === "tutor_only" ? "tutor_only" : "forbidden");
      case "P0002":
        return fail(404, "not_found");
      case "23505":
        return fail(409, tag ?? "conflict");
      case "54000":
        return fail(429, "upload_limit");
      case "23514":
      case "22023":
      case "22004":
      case "22P02":
        return fail(400, tag ?? "invalid");
    }
  }
  throw err;
}

const extractStoreOf = (s: CurriculumStore): TocExtractStore => ({
  gate: async (l) => parseGate(await s.aiGate(l)),
  reserve: async (a) => parseGate(await s.aiReserve(a)),
  logRun: (r) => s.logAiRun(r),
  finish: async (versionId, payload, runId) => (await s.finish({ versionId, payload, runId })) as { applied: boolean },
  fail: async (versionId, errorCode, runId) => (await s.fail({ versionId, errorCode, runId })) as { applied: boolean },
});

/** Shared by "Thêm giáo trình" and "Nạp mục lục": file checks, AI gate, then the background job when the version is 'extracting'. */
async function startVersion(
  deps: CurriculumDeps,
  grant: AccessGrant,
  body: { mode: "ai" | "manual"; toc_file: FileMeta | null },
  write: () => Promise<{ versionId: string; status: string; replayed: boolean; extra: Record<string, unknown> }>,
  book: { title: string; levelNote: string | null },
): Promise<HandlerResult> {
  const { learner, member } = grant;
  if (body.mode === "ai" && !body.toc_file) return fail(400, "toc_file_required");
  const owner = { familyId: learner.familyId, learnerId: learner.id };
  if (body.toc_file) {
    const bad = await verifyStoredFile(deps.storage, owner, "curriculum_toc", { id: body.toc_file.id, mime: body.toc_file.mime as AllowedMime, bytes: body.toc_file.bytes });
    if (bad) return fail(400, bad);
  }
  let ctx: TocContext | null = null;
  if (body.mode === "ai") {
    const gate = parseGate(await deps.store.aiGate(learner.id));
    if (!gate.allowed && gate.reason) {
      await deps.store.logAiRun({
        familyId: learner.familyId, draftId: null, model: null, promptVersion: null, inputTokens: 0, outputTokens: 0, costUsd: 0,
        status: refusalStatus(gate.reason), errorCode: gate.reason, byMemberId: member.id, releasesRunId: null,
      });
      return fail(409, `ai_${gate.reason}`);
    }
    ctx = await deps.loadContext(learner.id, learner.trackId); // read in the request: the background job has no session
  }
  let made: Awaited<ReturnType<typeof write>>;
  try {
    made = await write();
  } catch (err) {
    return fromCurriculumDbError(err);
  }
  if (made.status === "extracting" && !made.replayed && ctx && body.toc_file) {
    const ai = deps.getAi();
    const context = ctx;
    const job = {
      versionId: made.versionId, familyId: learner.familyId, learnerId: learner.id, byMemberId: member.id,
      tocPath: buildPath({ ...owner, fileId: body.toc_file.id, mime: body.toc_file.mime as AllowedMime }), book,
    };
    deps.schedule(async () => {
      try {
        await runTocExtraction(
          { store: extractStoreOf(deps.store), download: (p) => deps.storage.download(p), context: async () => context, call: ai.call, model: ai.model, toolChoice: ai.toolChoice, prompt: ai.prompt },
          job,
        );
      } catch (err) {
        await deps.log?.(err);
        await deps.store.fail({ versionId: made.versionId, errorCode: "ai_failed", runId: null }).catch(() => undefined);
      }
    });
  }
  return { status: made.replayed ? 200 : 201, body: { version_id: made.versionId, status: made.status, ...made.extra } };
}

// ---- Files -----------------------------------------------------------------------------------------------------------------------
export async function handleTocUploadUrl(deps: CurriculumDeps, learnerId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = tocUploadBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const c = checkFile("curriculum_toc", p.data.mime, p.data.bytes);
  if (!c.ok) return fail(400, FILE_ERRORS[c.reason]);
  try {
    await deps.store.issueUploadTicket({ learnerId: g.grant.learner.id, byMemberId: g.grant.member.id });
  } catch (err) {
    return fromCurriculumDbError(err);
  }
  const fileId = (deps.newId ?? (() => crypto.randomUUID()))();
  const mime = p.data.mime as AllowedMime;
  const { url } = await deps.storage.createUpload(buildPath({ familyId: g.grant.learner.familyId, learnerId: g.grant.learner.id, fileId, mime }));
  return { status: 201, body: { file_id: fileId, upload_url: url, mime } };
}

// ---- Curricula and versions ------------------------------------------------------------------------------------------------------
export async function handleCreateCurriculum(deps: CurriculumDeps, learnerId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = createCurriculumBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const b = p.data;
  const levelNote = b.level_note && b.level_note.length > 0 ? b.level_note : null;
  return startVersion(deps, g.grant, b, async () => {
    const r = (await deps.store.create({
      learnerId: g.grant.learner.id, title: b.title, levelNote, tocFile: b.toc_file, extract: b.mode === "ai", byMemberId: g.grant.member.id, clientId: b.client_id,
    })) as { curriculum_id: string; version_id: string; status: string; replayed: boolean };
    return { versionId: r.version_id, status: r.status, replayed: r.replayed, extra: { curriculum_id: r.curriculum_id } };
  }, { title: b.title, levelNote });
}

export async function handleAddVersion(deps: CurriculumDeps, curriculumId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardCurriculum(deps, curriculumId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = addVersionBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const b = p.data;
  return startVersion(deps, g.grant, b, async () => {
    const r = (await deps.store.addVersion({ curriculumId, tocFile: b.toc_file, extract: b.mode === "ai", byMemberId: g.grant.member.id, clientId: b.client_id })) as {
      version_id: string; status: string; replayed: boolean;
    };
    return { versionId: r.version_id, status: r.status, replayed: r.replayed, extra: {} };
  }, g.book);
}

export async function handleEditCurriculum(deps: CurriculumDeps, curriculumId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardCurriculum(deps, curriculumId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = editCurriculumBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.edit({ curriculumId, byMemberId: g.grant.member.id, clientId: p.data.client_id })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { version_id: r.id } };
  } catch (err) {
    return fromCurriculumDbError(err);
  }
}

export async function handleGetVersion(deps: CurriculumDeps, versionId: string, opts: { view?: "status" } = {}): Promise<HandlerResult> {
  const g = await guardVersion(deps, versionId, "curriculum:read");
  if (!g.ok) return g.result;
  const showCost = g.grant.member.role === "parent";
  let view = parseVersion(await deps.store.version(versionId), { showCost });
  if (view.stale) {
    await deps.store.fail({ versionId, errorCode: "timeout", runId: null });
    view = parseVersion(await deps.store.version(versionId), { showCost });
  }
  if (opts.view === "status") return { status: 200, body: { status: view.status, error_code: view.errorCode } };
  const context = await deps.loadContext(g.grant.learner.id, g.grant.learner.trackId);
  const issues = validateCurriculum(view.payload, context);
  const toResolve = rowsToResolve(issues);
  const body: VersionPageData = {
      version: view,
      track_id: g.grant.learner.trackId,
      context,
      issues,
      rows_to_resolve: toResolve,
      can_approve: view.status === "draft" && toResolve === 0 && g.grant.member.role === "tutor",
      is_tutor: g.grant.member.role === "tutor",
      stats: view.status === "draft" ? editStats(view.aiPayload, view.payload) : (view.review?.stats ?? null),
  };
  return { status: 200, body };
}

export async function handleSaveVersion(deps: CurriculumDeps, versionId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardVersion(deps, versionId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = saveCurriculumBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.save({ versionId, payload: p.data.payload, base: p.data.base_updated_at, byMemberId: g.grant.member.id })) as { updated_at: string };
    return { status: 200, body: { updated_at: r.updated_at } };
  } catch (err) {
    return fromCurriculumDbError(err);
  }
}

export async function handleApproveVersion(deps: CurriculumDeps, versionId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardVersion(deps, versionId, "curriculum:approve");
  if (!g.ok) return g.result.status === 403 ? fail(403, "tutor_only") : g.result;
  const p = approveCurriculumBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const view = parseVersion(await deps.store.version(versionId), { showCost: false });
  if (!sameInstant(view.updatedAt, p.data.base_updated_at)) return fail(409, "draft_changed");
  if (view.status !== "draft") return fail(400, "not_draft");
  const issues = validateCurriculum(view.payload, await deps.loadContext(g.grant.learner.id, g.grant.learner.trackId));
  if (rowsToResolve(issues) > 0) return fail(400, "blocked", { issues: issues.filter((i) => i.blocking) });
  const review = { stats: editStats(view.aiPayload, view.payload), quality: p.data.quality, quality_note: p.data.quality_note || null };
  try {
    const r = (await deps.store.approve({ versionId, base: view.updatedAt, units: finalUnits(view.payload), review, byMemberId: g.grant.member.id })) as { version: number; units: number };
    return { status: 200, body: { version: r.version, units: r.units } };
  } catch (err) {
    return fromCurriculumDbError(err);
  }
}

export async function handleDiscardVersion(deps: CurriculumDeps, versionId: string): Promise<HandlerResult> {
  const g = await guardVersion(deps, versionId, "curriculum:write");
  if (!g.ok) return g.result;
  try {
    return { status: 200, body: await deps.store.discard({ versionId, byMemberId: g.grant.member.id }) };
  } catch (err) {
    return fromCurriculumDbError(err);
  }
}

// ---- Unit status -------------------------------------------------------------------------------------------------------------------
export async function handleSetUnitStatus(deps: CurriculumDeps, curriculumId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardCurriculum(deps, curriculumId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = unitStatusBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.setUnitStatus({
      curriculumId, unitCode: p.data.unit_code, status: p.data.status, lessonNoteId: p.data.lesson_note_id, byMemberId: g.grant.member.id, clientId: p.data.client_id,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id } };
  } catch (err) {
    return fromCurriculumDbError(err);
  }
}
```

`lib/curriculum/supabaseStore.ts`:

```ts
import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurriculumStore } from "./handlers";

const PURPOSE = "curriculum_toc";

/** Curriculum functions of migration 0026 through the service role; only after the handler ran requireAccess. */
export function createSupabaseCurriculumStore(): CurriculumStore {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await createAdminClient().rpc(fn, args);
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${fn}: ${error.message ?? error.code ?? "error"}`);
    return data;
  };
  const one = async <T>(table: string, columns: string, id: string): Promise<T | null> => {
    const { data, error } = await createAdminClient().from(table).select(columns).eq("id", id).maybeSingle<T>();
    if (error) throw new ReviewDbError(error.code ?? "unknown", `${table} lookup: ${error.message ?? error.code ?? "error"}`);
    return data ?? null;
  };
  return {
    getCurriculum: (id) => one<{ learner_id: string; title: string; level_note: string | null }>("curricula", "learner_id, title, level_note", id),
    getVersionLearnerId: async (id) => (await one<{ learner_id: string }>("curriculum_versions", "learner_id", id))?.learner_id ?? null,
    issueUploadTicket: (a) => call("eng_issue_upload_ticket", { p_learner: a.learnerId, p_by: a.byMemberId }),
    aiGate: (l) => call("eng_ai_gate", { p_learner: l }),
    aiReserve: (a) =>
      call("eng_ai_gate", { p_learner: a.learnerId, p_estimate: a.estimateUsd, p_reserve: true, p_draft: a.versionId, p_model: a.model, p_by: a.byMemberId, p_purpose: PURPOSE }),
    logAiRun: async (r) =>
      String(
        await call("eng_log_ai_run", {
          p_family: r.familyId, p_draft: r.draftId, p_model: r.model, p_prompt_version: r.promptVersion, p_input: r.inputTokens, p_output: r.outputTokens,
          p_cost: r.costUsd, p_status: r.status, p_error: r.errorCode, p_by: r.byMemberId, p_release: r.releasesRunId, p_purpose: PURPOSE,
        }),
      ),
    create: (a) =>
      call("eng_create_curriculum", {
        p_learner: a.learnerId, p_title: a.title, p_level_note: a.levelNote, p_toc_file: a.tocFile, p_extract: a.extract, p_by: a.byMemberId, p_client_id: a.clientId,
      }),
    addVersion: (a) => call("eng_add_curriculum_version", { p_curriculum: a.curriculumId, p_toc_file: a.tocFile, p_extract: a.extract, p_by: a.byMemberId, p_client_id: a.clientId }),
    edit: (a) => call("eng_edit_curriculum", { p_curriculum: a.curriculumId, p_by: a.byMemberId, p_client_id: a.clientId }),
    async version(id) {
      const db = createAdminClient();
      const v = await one<{ curriculum_id: string }>(
        "curriculum_versions",
        "id, curriculum_id, learner_id, version, source, status, payload, ai_payload, error_code, updated_at, approved_at, review, created_at",
        id,
      );
      if (!v) throw new ReviewDbError("P0002", "curriculum_versions: version not found");
      const c = await one("curricula", "id, learner_id, title, level_note", v.curriculum_id);
      // Cost of every call made for this version (retries included), the reservations themselves excluded.
      const { data: runs, error } = await db.from("ai_runs").select("cost_usd").eq("draft_id", id).eq("purpose", PURPOSE).in("status", ["ok", "error"]);
      if (error) throw new ReviewDbError(error.code ?? "unknown", `ai_runs lookup: ${error.message ?? "error"}`);
      const cost = (runs ?? []).reduce((n, r) => n + Number((r as { cost_usd: number | string }).cost_usd), 0);
      return { version: v, curriculum: c, ai_cost_usd: Math.round(cost * 1e6) / 1e6 };
    },
    save: (a) => call("eng_save_curriculum_draft", { p_version: a.versionId, p_payload: a.payload, p_base: a.base, p_by: a.byMemberId }),
    finish: (a) => call("eng_finish_curriculum_extraction", { p_version: a.versionId, p_payload: a.payload, p_run: a.runId }),
    fail: (a) => call("eng_fail_curriculum_extraction", { p_version: a.versionId, p_error: a.errorCode, p_run: a.runId }),
    discard: (a) => call("eng_discard_curriculum_draft", { p_version: a.versionId, p_by: a.byMemberId }),
    approve: (a) => call("eng_approve_curriculum_version", { p_version: a.versionId, p_base: a.base, p_units: a.units, p_review: a.review, p_by: a.byMemberId }),
    setUnitStatus: (a) =>
      call("eng_set_unit_status", {
        p_curriculum: a.curriculumId, p_unit_code: a.unitCode, p_status: a.status, p_lesson_note: a.lessonNoteId, p_by: a.byMemberId, p_client_id: a.clientId,
      }),
  };
}
```

`lib/curriculum/route.ts`:

```ts
// lib/curriculum/route.ts
import "server-only";
import { after, NextResponse } from "next/server";
import { createToolCaller } from "@/lib/ai/anthropic";
import { studioModel, studioToolChoice } from "@/lib/ai/config";
import { CURRICULUM_PROMPT, loadPrompt } from "@/lib/ai/prompts";
import { apiErrors } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import type { HandlerResult } from "@/lib/review/handlers";
import { createFileStorage } from "@/lib/storage/server";
import { createUserClient } from "@/lib/supabase/server";
import type { CurriculumDeps } from "./handlers";
import { loadTocContext } from "./load";
import { createSupabaseCurriculumStore } from "./supabaseStore";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Session → handler → JSON (no-store); 500 logged. The AI job runs in after() (routes that start it set maxDuration = 300). */
export async function runCurriculumRoute(routeName: string, run: (deps: CurriculumDeps) => Promise<HandlerResult>): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const result = await run({
      user,
      store: createSupabaseCurriculumStore(),
      storage: createFileStorage(),
      schedule: (job) => after(job),
      loadContext: loadTocContext,
      // Same model and tool-choice switch as Studio B1 (one priced model, lib/ai/pricing.ts).
      getAi: () => ({ call: createToolCaller(), model: studioModel(), toolChoice: studioToolChoice(), prompt: { text: loadPrompt(CURRICULUM_PROMPT.file), version: CURRICULUM_PROMPT.version } }),
      log: (error) => logAppError({ route: routeName, code: "curriculum_toc", error, userId }),
    });
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (err) {
    await logAppError({ route: routeName, code: "internal", error: err, userId });
    return NextResponse.json({ error: "internal", message: apiErrors[500] }, { status: 500 });
  }
}
```

`lib/curriculum/load.ts`:

```ts
// lib/curriculum/load.ts
import "server-only";
import { loadPickerMap } from "@/lib/skillmap/load";
import { createFileStorage } from "@/lib/storage/server";
import { createUserClient } from "@/lib/supabase/server";
import { loadTags } from "@/lib/tutorwork/load";
import { buildTocContext, type TocContext } from "./context";
import { handleGetVersion, type CurriculumDeps } from "./handlers";
import { buildCards, taughtChoices, type CurriculumCard, type TaughtChoice, type VersionPageData } from "./shape";
import { createSupabaseCurriculumStore } from "./supabaseStore";

/** The closed list of one child (call only after requireAccess / requireLearnerPage). */
export async function loadTocContext(learnerId: string, trackId: string): Promise<TocContext> {
  const [map, tags] = await Promise.all([loadPickerMap(learnerId), loadTags(trackId)]);
  return buildTocContext(map, tags);
}

/** Every curriculum of one child with the version in use, its units, points and unit events (RLS: adults of that child only). */
export async function loadCurriculumCards(learnerId: string): Promise<CurriculumCard[]> {
  const db = await createUserClient();
  const q = async (table: string, columns: string) => {
    const { data, error } = await db.from(table).select(columns).eq("learner_id", learnerId);
    if (error) throw new Error(`${table} lookup failed: ${error.code ?? "error"}`);
    return data ?? [];
  };
  const [curricula, versions, units, points, events] = await Promise.all([
    q("curricula", "id, title, level_note, created_at"),
    q("curriculum_versions", "id, curriculum_id, version, status, error_code"),
    q("curriculum_units", "version_id, code, ord, title, section, page, skipped"),
    q("curriculum_unit_points", "version_id, code, tag_key, ord"),
    q("curriculum_unit_events", "id, curriculum_id, unit_code, status, created_at"),
  ]);
  return buildCards({ curricula, versions, units, points, events });
}

/** "Unit đã dạy hôm nay" of the session note. [] when 0026 is not applied yet (the session note must still open). */
export async function loadTaughtChoices(learnerId: string): Promise<TaughtChoice[]> {
  try {
    return taughtChoices(await loadCurriculumCards(learnerId));
  } catch {
    return [];
  }
}

/** The page calls the same handler as GET /api/curricula/versions/:id (one access path). No AI and no background job from a page. */
export async function loadVersionPage(versionId: string): Promise<{ kind: "ok"; data: VersionPageData } | { kind: "login" } | { kind: "not-found" }> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const deps: CurriculumDeps = {
    user,
    store: createSupabaseCurriculumStore(),
    storage: createFileStorage(),
    schedule: () => undefined,
    loadContext: loadTocContext,
    getAi: () => {
      throw new Error("no AI from a page");
    },
  };
  const res = await handleGetVersion(deps, versionId);
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  return { kind: "ok", data: res.body as VersionPageData };
}
```

- [ ] **Step 5: API routes**

`app/api/learners/[id]/curricula/files/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { handleTocUploadUrl } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** POST - a one-time upload link for the PDF table of contents of a curriculum of this child. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/learners/[id]/curricula/files", (deps) => handleTocUploadUrl(deps, id, body));
}
```

`app/api/learners/[id]/curricula/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { handleCreateCurriculum } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** The AI reads the contents in after(): up to 3 tries within this limit (same as Studio B1). */
export const maxDuration = 300;

/** POST - a new curriculum + version 1 ("Cho AI đọc mục lục" or "Soạn tay"). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/learners/[id]/curricula", (deps) => handleCreateCurriculum(deps, id, body));
}
```

`app/api/curricula/[id]/versions/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { handleAddVersion } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

export const maxDuration = 300;

/** POST - "Nạp mục lục" for an existing curriculum: a new version read from a PDF, or an empty one (Soạn tay). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/curricula/[id]/versions", (deps) => handleAddVersion(deps, id, body));
}
```

`app/api/curricula/[id]/edit/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { handleEditCurriculum } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** POST - "Sửa mục lục / bảng nối": a draft of the next version, copied from the version in use. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/curricula/[id]/edit", (deps) => handleEditCurriculum(deps, id, body));
}
```

`app/api/curricula/[id]/unit-events/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { handleSetUnitStatus } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** POST - set the status of one unit (a new event; old events stay). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/curricula/[id]/unit-events", (deps) => handleSetUnitStatus(deps, id, body));
}
```

`app/api/curricula/versions/[id]/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { handleGetVersion, handleSaveVersion } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** GET - one version (?view=status while the AI reads). PUT - save the edited draft (optimistic lock). */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const view = request.nextUrl.searchParams.get("view") === "status" ? "status" : undefined;
  return runCurriculumRoute("GET /api/curricula/versions/[id]", (deps) => handleGetVersion(deps, id, { view }));
}
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("PUT /api/curricula/versions/[id]", (deps) => handleSaveVersion(deps, id, body));
}
```

`app/api/curricula/versions/[id]/approve/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { handleApproveVersion } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";
import { readJson } from "@/lib/inquiries/route";

/** POST - Duyệt (the child's tutor only). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runCurriculumRoute("POST /api/curricula/versions/[id]/approve", (deps) => handleApproveVersion(deps, id, body));
}
```

`app/api/curricula/versions/[id]/discard/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { handleDiscardVersion } from "@/lib/curriculum/handlers";
import { runCurriculumRoute } from "@/lib/curriculum/route";

/** POST - Bỏ nháp (tutor or parent). */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runCurriculumRoute("POST /api/curricula/versions/[id]/discard", (deps) => handleDiscardVersion(deps, id));
}
```

- [ ] **Step 6: Run** `npx vitest run tests/unit/curriculumHandlers.test.ts tests/unit/requireAccess.test.ts` → PASS; `npm run typecheck && npm run lint`.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/requireAccess.ts lib/curriculum/shape.ts lib/curriculum/handlers.ts lib/curriculum/supabaseStore.ts lib/curriculum/route.ts lib/curriculum/load.ts app/api/curricula "app/api/learners/[id]/curricula" tests/unit/curriculumHandlers.test.ts
git commit -m "feat(w2): curriculum API — access actions (approve = tutor only), handlers, store, loaders, routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 8: Chữ giao diện + trang Giáo trình (thẻ, Thêm giáo trình, Nạp mục lục) + trang Trạng thái Unit

**Files:**
- Modify: `lib/copy/vi.ts` (cuối file: `curriculumCopy`, `curriculumErrors`), `components/LearnerCard.tsx`
- Create: `lib/curriculum/client.ts`, `components/curriculum/CoverageBar.tsx`, `AddCurriculumForm.tsx`, `EditMapButton.tsx`, `CurriculumCard.tsx`, `UnitStatusTable.tsx`
- Create: `app/learners/[id]/curricula/page.tsx`, `app/learners/[id]/curricula/[curriculumId]/page.tsx`
- Test: `tests/unit/curriculumUi.test.ts`

**Interfaces:**
- Consumes: `buildCards`, `CurriculumCard`, `CardUnit` (Task 7), `loadCurriculumCards`, `loadStudioGate` (`lib/studio/load.ts` — cùng cổng AI), `requireLearnerPage` (`lib/tutorwork/page.ts`), `sendJson` (`lib/studio/client.ts`), `putToSignedUrl`, `AppHeader({name, showTestBadge, feedbackScreen})` (W1).
- Produces: `curriculumCopy` (khóa dùng ở mọi component W2), `curriculumErrors`; `uploadTocFile(learnerId, file)`, `curriculumErrorText(code)`; components `CoverageBar({done,total,pct,testId})`, `AddCurriculumForm({learnerId, curriculumId?, aiAllowed, aiReason})`, `EditMapButton({curriculumId})`, `CurriculumCard({card, learnerId, aiAllowed, aiReason})`, `UnitStatusTable({curriculumId, units, statusOf})`.

- [ ] **Step 1: Failing UI test**

`tests/unit/curriculumUi.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
import { CurriculumCard } from "@/components/curriculum/CurriculumCard";
import { curriculumCopy } from "@/lib/copy/vi";
import { buildCards } from "@/lib/curriculum/shape";

const L = "b0000000-0000-4000-8000-000000000001";
const C = "c0000000-0000-4000-8000-0000000000c1";
const units = Array.from({ length: 26 }, (_, i) => ({ version_id: "v1", code: `U${i + 1}`, ord: i + 1, title: `Unit ${i + 1}`, section: null, page: null, skipped: false }));
const ev = (code: string, status: string, n: number) => ({ id: `e${String(n).padStart(3, "0")}`, curriculum_id: C, unit_code: code, status, created_at: `2026-11-0${1 + Math.floor(n / 10)}T0${n % 10}:00:00Z` });
const rows = {
  curricula: [{ id: C, title: "Destination C1&C2", level_note: "C1–C2", created_at: "2026-11-08T00:00:00Z" }],
  versions: [{ id: "v1", curriculum_id: C, version: 1, status: "approved", error_code: null }],
  units,
  points: [{ version_id: "v1", code: "U7", tag_key: "bi-dong-nho-tuong-thuat", ord: 1 }],
  events: [...Array.from({ length: 12 }, (_, i) => ev(`U${i + 1}`, "done", i + 1)), ev("U3", "skipped", 13), ev("U13", "in_progress", 14)],
};

describe("Giáo trình screens", () => {
  const card = buildCards(rows)[0]!;
  it("the card shows the level note, 'đang học đến' U13 and coverage 11/25 · 44 %, and links to the map and unit statuses", () => {
    const html = renderToStaticMarkup(createElement(CurriculumCard, { card, learnerId: L, aiAllowed: true, aiReason: null }));
    expect(html).toContain("C1–C2");
    expect(html).toContain(curriculumCopy.currentLine("U13", "Unit 13"));
    expect(html).toContain(curriculumCopy.coverage(11, 25, 44));
    expect(html).toContain(`href="/curricula/versions/v1"`);
    expect(html).toContain(`href="/learners/${L}/curricula/${C}"`);
    expect(html).toContain(curriculumCopy.loadToc);
  });
});
```

- [ ] **Step 2: Run → FAIL** (module missing).

- [ ] **Step 3: Copy — append at the end of `lib/copy/vi.ts`** (mọi chữ của W2; người dạy luôn là `tutorHonorific`; "%" chỉ ở màn người lớn)

```ts
/** W2 · Giáo trình (spec 2026-11-08-tutor-workdesk-design §3, §4 W2, §5; DOMAIN §5.1, §6). Người dạy luôn là tutorHonorific. */
export const curriculumCopy = {
  navLink: "Giáo trình",
  screenLabel: "Giáo trình",
  title: (alias: string) => `Giáo trình · ${alias}`,
  intro: `Mỗi quyển sách ${tutorHonorific} dạy cho em là một giáo trình. App đọc mục lục, ${tutorHonorific} duyệt Unit và điểm của từng Unit; sau đó app biết em đang học đến đâu.`,
  back: "Về trang chủ",
  empty: "Chưa có giáo trình nào. Thêm quyển đầu tiên ở dưới.",
  levelNote: "Ghi chú cấp",
  currentLabel: "Đang học đến",
  notStarted: "Chưa bắt đầu",
  notApproved: "Chưa có mục lục đã duyệt",
  currentLine: (code: string, title: string) => `${code} · ${title}`,
  coverage: (done: number, total: number, pct: number) => `Đã học ${done}/${total} Unit · ${pct} %`,
  coverageHint: "Không tính Unit bỏ qua.",
  versionLabel: (n: number) => `Bản ${n}`,
  statusLabels: {
    extracting: "AI đang đọc mục lục",
    ai_failed: "AI chưa đọc được",
    draft: "Bản nháp chờ duyệt",
    approved: "Đang dùng",
    superseded: "Đã thay bằng bản mới",
    discarded: "Đã bỏ",
  } as const,
  continueReview: "Tiếp tục duyệt mục lục",
  viewMap: "Xem bảng nối",
  unitsLink: "Cập nhật trạng thái Unit",
  editMap: "Sửa mục lục / bảng nối",
  editHint: "Tạo bản mới; bản đang dùng và bằng chứng cũ không đổi.",
  loadToc: "Nạp mục lục",
  // Thêm giáo trình
  addTitle: "Thêm giáo trình",
  bookTitle: "Tên sách / nguồn",
  bookTitlePlaceholder: "Ví dụ: Destination C1 & C2 Grammar and Vocabulary",
  levelNotePlaceholder: "Ví dụ: Quyển 3 ≈ B1+",
  levelNoteHint: "Cấp của sách, không phải cấp của em. Có thể để trống.",
  tocFile: "File mục lục (PDF)",
  tocHint: "Chỉ các trang mục lục (Contents), PDF tối đa 15 MB. AI chỉ đọc mục lục, không đọc thông tin của con.",
  startAi: "Cho AI đọc mục lục",
  manual: "Soạn tay",
  manualHint: "Bắt đầu từ bảng trống và tự nhập Unit.",
  uploading: "Đang tải file lên…",
  oneChildNote: "Giáo trình thuộc riêng em này. Em kia học cùng sách thì thêm riêng cho em kia (nhãn hai em khác nhau).",
  aiUnavailable: {
    ai_off: "AI đang tắt. Phụ huynh bật ở Cài đặt AI. Bạn vẫn soạn tay được.",
    ai_no_consent: "Chưa có đồng ý cho AI đọc tài liệu. Phụ huynh bật ở Cài đặt AI. Bạn vẫn soạn tay được.",
    ai_cap: "Đã dùng hết hạn mức AI tháng này. Bạn vẫn soạn tay được.",
  } as Record<string, string>,
  // Màn duyệt
  reviewTitle: (title: string, n: number) => `Duyệt mục lục · ${title} · bản ${n}`,
  mapTitle: (title: string, n: number) => `Bảng nối Unit → điểm · ${title} · bản ${n}`,
  close: "Đóng",
  reading: "AI đang đọc mục lục…",
  readingHint: "Thường mất 1–2 phút. Bạn có thể rời trang; bản nháp sẽ chờ ở đây.",
  aiFailedTitle: "AI chưa đọc được mục lục này",
  aiFailedNext: "Bạn có thể soạn tay ở bảng dưới, hoặc bỏ nháp rồi nạp lại file khác.",
  summary: (units: number, ignored: number) => `${units} Unit · ${ignored} dòng không phải Unit (bài ôn, bài kiểm tra, phần tra cứu)`,
  needsTitle: (n: number) => `Cần xem (${n})`,
  needsHint: `AI không chắc hoặc app thấy chỗ lạ. Sửa dòng hoặc bấm "Đã xem" — xong hết mới Duyệt được.`,
  allTitle: "Toàn bộ Unit theo thứ tự sách",
  ignoredTitle: "Không phải Unit (không tính)",
  ignoredReasons: { review: "Bài ôn", test: "Bài kiểm tra", reference: "Phần tra cứu", other: "Khác" } as const,
  col: { code: "Mã", title: "Tên Unit", section: "Loại", page: "Trang", points: "Điểm của Unit", actions: "" } as const,
  flags: {
    ai: "AI không chắc",
    unknown_point: "AI gợi ý điểm ngoài danh sách (đã bỏ)",
    duplicate_code: "Trùng số Unit",
    numbering_gap: "Số Unit không liền mạch",
    bad_number: "Không đọc được số Unit",
    no_title: "Không đọc được tên Unit",
  } as const,
  issueText: {
    no_units: "Chưa có Unit nào.",
    needs_review: "Cần xem",
    duplicate_code: "Mã Unit bị trùng",
    bad_code: "Mã Unit chỉ gồm chữ in hoa, số và dấu -",
    unknown_point: "Có điểm không còn trong danh sách",
    no_points: "Chưa nối điểm nào (vẫn duyệt được)",
  } as const,
  missingHint: "AI thấy Unit dạy điểm chưa có trong danh sách:",
  makeTag: (text: string) => `Tạo nhãn riêng “${text}”`,
  addPoint: "Thêm điểm",
  removePoint: (label: string) => `Bỏ điểm ${label}`,
  markSeen: "Đã xem",
  skip: "Không dạy Unit này",
  unskip: "Có dạy Unit này",
  skippedBadge: "Bỏ qua",
  drop: "Bỏ dòng",
  undrop: "Lấy lại dòng",
  droppedBadge: "Đã bỏ dòng",
  reasonLabel: "Lý do (không bắt buộc)",
  reasons: { wrong_title_page: "Sai tên / trang", wrong_points: "Sai điểm", missing_points: "Thiếu điểm", not_a_unit: "Không phải Unit", other: "Khác" } as const,
  addUnit: "+ Thêm Unit",
  newUnitTitle: "Unit mới",
  barLeft: (n: number) => (n > 0 ? `Còn ${n} dòng cần xử lý` : "Đã xử lý hết · Duyệt được"),
  save: "Lưu nháp",
  saving: "Đang lưu…",
  saved: "Đã lưu.",
  approve: "Duyệt mục lục",
  approving: "Đang duyệt…",
  approveTutorOnly: `Chỉ ${tutorHonorific} của em duyệt được. Phụ huynh có thể bỏ nháp.`,
  approveNeedsSave: "Lưu nháp trước khi duyệt.",
  discard: "Bỏ nháp",
  discardConfirm: "Bỏ bản nháp này? Bản đang dùng (nếu có) không đổi.",
  quality: "AI đọc mục lục này thế nào?",
  qualityOptions: { good: "Tốt", ok: "Tạm", needs_work: "Phải sửa nhiều" } as const,
  qualityNote: "Một dòng góp ý cho AI (không bắt buộc)",
  approvedTitle: "Đã duyệt. Bảng nối này đang được dùng.",
  approvedNote: "Muốn sửa: bấm “Sửa mục lục / bảng nối” để tạo bản mới.",
  stats: (s: { ai_rows: number; kept: number; edited: number; dropped: number; added: number; edited_pct: number }) =>
    `AI soạn ${s.ai_rows} dòng · giữ nguyên ${s.kept} · sửa ${s.edited} · bỏ ${s.dropped} · thêm ${s.added} · phải sửa ${s.edited_pct} %`,
  tooManyEdits: "Phải sửa hơn 20 % dòng AI soạn: báo phụ huynh để chỉnh công thức trước khi nạp quyển tiếp theo.",
  aiCost: (usd: string) => `Chi phí AI cho bản này: ${usd}`,
  // Trạng thái Unit
  unitsTitle: (title: string) => `Trạng thái Unit · ${title}`,
  unitStatus: { not_started: "Chưa học", in_progress: "Đang học", done: "Đã học", skipped: "Bỏ qua" } as const,
  unitStatusSaved: (code: string, label: string) => `${code}: ${label}.`,
  historyTitle: "Lần đổi gần đây",
  historyLine: (code: string, label: string, at: string) => `${code} → ${label} · ${at}`,
  historyNone: "Chưa đổi lần nào.",
  // Ghi buổi
  taughtTitle: "Unit đã dạy hôm nay",
  taughtHelp: "Chọn Unit của giáo trình đã duyệt (tối đa 6). Không ghi gì ở “Hôm nay học” thì app ghi tên Unit vào đó.",
  taughtNone: "Chưa có giáo trình đã duyệt.",
  taughtNext: "Unit tiếp theo",
  taughtOther: "Unit khác…",
  taughtMax: (n: number) => `Chọn tối đa ${n} Unit.`,
  taughtChip: (title: string, code: string) => `${title} · ${code}`,
  proposeTitle: "Đặt Unit đã dạy sang “Đang học”?",
  proposeHelp: `App chỉ đề xuất; ${tutorHonorific} bấm thì mới đổi.`,
  proposeButton: (code: string) => `Đặt ${code} là “Đang học”`,
  proposeDone: (code: string) => `${code} đang học.`,
} as const;

/** Error codes of the curriculum routes → text (unknown codes fall back to apiErrors). */
export const curriculumErrors: Record<string, string> = {
  invalid_body: "Thiếu thông tin hoặc thông tin chưa đúng dạng.",
  toc_file_required: "Cần chọn file mục lục (PDF) để AI đọc.",
  file_type: "Mục lục phải là file PDF.",
  file_empty: "File trống.",
  file_too_big: "File lớn hơn 15 MB. Chỉ cần các trang mục lục.",
  file_missing: "File chưa tải lên xong. Thử lại.",
  file_mismatch: "File trong kho không khớp. Thử tải lại.",
  upload_limit: "Đã tải quá nhiều file trong 24 giờ. Thử lại sau.",
  ai_off: "AI đang tắt. Bạn vẫn soạn tay được.",
  ai_no_consent: "Chưa có đồng ý cho AI. Bạn vẫn soạn tay được.",
  ai_cap: "Đã hết hạn mức AI tháng này. Bạn vẫn soạn tay được.",
  bad_title: "Tên sách cần 1–160 ký tự.",
  bad_level_note: "Ghi chú cấp tối đa 200 ký tự.",
  draft_changed: "Bản nháp vừa được sửa ở nơi khác. Tải lại trang.",
  not_editable: "Bản này không sửa được nữa.",
  not_draft: "Chỉ duyệt được bản nháp đã lưu.",
  needs_review_left: "Còn dòng cần xem.",
  blocked: "Còn dòng cần xử lý.",
  tutor_only: `Chỉ ${tutorHonorific} của em duyệt được.`,
  unknown_point: "Có điểm không còn trong danh sách nhãn.",
  duplicate_code: "Mã Unit bị trùng.",
  duplicate_point: "Một điểm bị chọn hai lần trong cùng Unit.",
  not_approved: "Giáo trình chưa có bản đã duyệt.",
  unknown_unit: "Unit này không có trong bản đang dùng.",
  bad_units: "Danh sách Unit đã dạy chưa đúng.",
  bad_status: "Trạng thái không hợp lệ.",
  forbidden: "Bạn không có quyền làm việc này.",
  not_found: "Không tìm thấy.",
  network: "Mất kết nối. Thử lại.",
};
```

(Thêm mục "W2 · Giáo trình" vào `docs/UX_COPY_GUIDE.md` ở Task 13.)

- [ ] **Step 4: Browser helper + components**

`lib/curriculum/client.ts`:

```ts
"use client";
/** Browser helpers of the curriculum screens: the one-time upload of a PDF table of contents. JSON calls reuse lib/studio/client. */
import { putToSignedUrl } from "@/lib/storage/clientUpload";
import { checkFile } from "@/lib/storage/rules";
import { sendJson } from "@/lib/studio/client";
import { curriculumErrors } from "@/lib/copy/vi";

export { sendJson };

export async function uploadTocFile(learnerId: string, file: File) {
  const c = checkFile("curriculum_toc", file.type, file.size);
  if (!c.ok) return { ok: false as const, error: c.reason === "too_big" ? "file_too_big" : c.reason === "empty" ? "file_empty" : "file_type" };
  const t = await sendJson<{ file_id: string; upload_url: string; mime: string }>(`/api/learners/${learnerId}/curricula/files`, "POST", { mime: file.type, bytes: file.size });
  if (!t.ok) return { ok: false as const, error: t.error };
  if (!(await putToSignedUrl(t.body.upload_url, file))) return { ok: false as const, error: "file_missing" };
  return { ok: true as const, file: { id: t.body.file_id, mime: file.type, bytes: file.size } };
}

export const curriculumErrorText = (code: string | null): string => (code && curriculumErrors[code]) || curriculumErrors.invalid_body!;
```

`components/curriculum/CoverageBar.tsx`:

```tsx
import { curriculumCopy } from "@/lib/copy/vi";

/** Coverage of one curriculum (adults only): a thin bar + "Đã học 11/25 Unit · 44 %". */
export function CoverageBar({ done, total, pct, testId }: { done: number; total: number; pct: number; testId: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={curriculumCopy.coverage(done, total, pct)} className="h-2 w-full max-w-md rounded-full bg-line">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm">{curriculumCopy.coverage(done, total, pct)}</p>
      <p className="text-xs text-muted">{curriculumCopy.coverageHint}</p>
    </div>
  );
}
```

`components/curriculum/AddCurriculumForm.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { GateReason } from "@/lib/ai/cap";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson, uploadTocFile } from "@/lib/curriculum/client";
import { CURRICULUM_LIMITS } from "@/lib/curriculum/types";

/**
 * "Thêm giáo trình" (title + level note + PDF) or, with `curriculumId`, "Nạp mục lục" for an existing curriculum (file only). Then
 * "Cho AI đọc mục lục" (when the gate allows) or "Soạn tay". The file goes straight to storage; the server checks it again.
 */
export function AddCurriculumForm({
  learnerId,
  curriculumId = null,
  aiAllowed,
  aiReason,
}: {
  learnerId: string;
  curriculumId?: string | null;
  aiAllowed: boolean;
  aiReason: GateReason | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [levelNote, setLevelNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"ai" | "manual" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const tid = curriculumId ? `load-toc-${curriculumId}` : "add-curriculum";

  async function start(mode: "ai" | "manual") {
    if (!curriculumId && !title.trim()) return setProblem(curriculumErrorText("bad_title"));
    if (mode === "ai" && !file) return setProblem(curriculumErrorText("toc_file_required"));
    setBusy(mode);
    setProblem(null);
    const up = file ? await uploadTocFile(learnerId, file) : ({ ok: true as const, file: null });
    if (!up.ok) {
      setBusy(null);
      return setProblem(curriculumErrorText(up.error));
    }
    const r = curriculumId
      ? await sendJson<{ version_id: string }>(`/api/curricula/${curriculumId}/versions`, "POST", { mode, toc_file: up.file, client_id: clientId.current })
      : await sendJson<{ version_id: string }>(`/api/learners/${learnerId}/curricula`, "POST", {
          title: title.trim(), level_note: levelNote.trim() || null, mode, toc_file: up.file, client_id: clientId.current,
        });
    setBusy(null);
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    router.push(`/curricula/versions/${r.body.version_id}`);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate data-testid={tid}>
      {curriculumId ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {curriculumCopy.bookTitle}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={CURRICULUM_LIMITS.title} placeholder={curriculumCopy.bookTitlePlaceholder} data-testid={`${tid}-title`} className="min-h-11 rounded-lg border border-line px-3 font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {curriculumCopy.levelNote}
            <input value={levelNote} onChange={(e) => setLevelNote(e.target.value)} maxLength={CURRICULUM_LIMITS.levelNote} placeholder={curriculumCopy.levelNotePlaceholder} data-testid={`${tid}-level`} className="min-h-11 rounded-lg border border-line px-3 font-normal" />
            <span className="text-xs font-normal text-muted">{curriculumCopy.levelNoteHint}</span>
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {curriculumCopy.tocFile}
        <input type="file" accept="application/pdf,.pdf" data-testid={`${tid}-file`} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="min-h-11 font-normal" />
        <span className="text-xs font-normal text-muted">{curriculumCopy.tocHint}</span>
      </label>
      {!aiAllowed && aiReason ? (
        <p role="status" data-testid={`${tid}-ai-unavailable`} className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {curriculumCopy.aiUnavailable[`ai_${aiReason}`]}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" data-testid={`${tid}-problem`} className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {aiAllowed ? (
          <button type="button" disabled={busy !== null} onClick={() => void start("ai")} data-testid={`${tid}-ai`} className="min-h-12 rounded-xl bg-accent px-5 font-bold text-white disabled:opacity-60">
            {busy === "ai" ? curriculumCopy.uploading : curriculumCopy.startAi}
          </button>
        ) : null}
        <button type="button" disabled={busy !== null} onClick={() => void start("manual")} data-testid={`${tid}-manual`} className="min-h-12 rounded-xl border border-line bg-white px-5 font-semibold disabled:opacity-60">
          {busy === "manual" ? curriculumCopy.uploading : curriculumCopy.manual}
        </button>
      </div>
      <p className="text-xs text-muted">{curriculumCopy.manualHint}</p>
    </form>
  );
}
```

`components/curriculum/EditMapButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";

/** "Sửa mục lục / bảng nối": makes (or reopens) the draft of the next version, copied from the version in use. */
export function EditMapButton({ curriculumId }: { curriculumId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  async function go() {
    setBusy(true);
    const r = await sendJson<{ version_id: string }>(`/api/curricula/${curriculumId}/edit`, "POST", { client_id: clientId.current });
    setBusy(false);
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    router.push(`/curricula/versions/${r.body.version_id}`);
  }
  return (
    <span className="inline-flex flex-col">
      <button type="button" disabled={busy} onClick={() => void go()} title={curriculumCopy.editHint} data-testid={`curriculum-edit-${curriculumId}`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline disabled:opacity-60">
        {curriculumCopy.editMap}
      </button>
      {problem ? <span role="alert" className="text-xs text-[#8A1C12]">{problem}</span> : null}
    </span>
  );
}
```

`components/curriculum/CurriculumCard.tsx`:

```tsx
import Link from "next/link";
import type { GateReason } from "@/lib/ai/cap";
import { curriculumCopy } from "@/lib/copy/vi";
import type { CurriculumCard as Card } from "@/lib/curriculum/shape";
import { AddCurriculumForm } from "./AddCurriculumForm";
import { CoverageBar } from "./CoverageBar";
import { EditMapButton } from "./EditMapButton";

const pill = "inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-xs font-medium";
const link = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline";

/** One curriculum on the Giáo trình page: level note, "đang học đến", coverage, then what to do next. Adults only. */
export function CurriculumCard({ card, learnerId, aiAllowed, aiReason }: { card: Card; learnerId: string; aiAllowed: boolean; aiReason: GateReason | null }) {
  const { current, progress, open } = card;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5" data-testid={`curriculum-${card.id}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{card.title}</h2>
        {current ? <span className={pill}>{curriculumCopy.versionLabel(current.version)} · {curriculumCopy.statusLabels.approved}</span> : null}
      </header>
      {card.levelNote ? (
        <p className="text-sm text-muted">
          {curriculumCopy.levelNote}: {card.levelNote}
        </p>
      ) : null}
      {current && progress ? (
        <>
          <p className="text-[15px]" data-testid={`curriculum-current-${card.id}`}>
            <span className="text-muted">{curriculumCopy.currentLabel}: </span>
            <b>{progress.current ? curriculumCopy.currentLine(progress.current.code, progress.current.title) : curriculumCopy.notStarted}</b>
          </p>
          <CoverageBar done={progress.done} total={progress.total} pct={progress.pct} testId={`curriculum-coverage-${card.id}`} />
        </>
      ) : (
        <p className="text-sm text-muted">{curriculumCopy.notApproved}</p>
      )}
      <div className="flex flex-wrap gap-x-5">
        {open ? (
          <Link href={`/curricula/versions/${open.versionId}`} data-testid={`curriculum-open-${card.id}`} className={link}>
            {curriculumCopy.continueReview} ({curriculumCopy.statusLabels[open.status]})
          </Link>
        ) : null}
        {current ? (
          <>
            <Link href={`/curricula/versions/${current.versionId}`} data-testid={`curriculum-map-${card.id}`} className={link}>
              {curriculumCopy.viewMap}
            </Link>
            <Link href={`/learners/${learnerId}/curricula/${card.id}`} data-testid={`curriculum-units-${card.id}`} className={link}>
              {curriculumCopy.unitsLink}
            </Link>
            {open ? null : <EditMapButton curriculumId={card.id} />}
          </>
        ) : null}
      </div>
      {open ? null : (
        <details className="rounded-xl border border-line p-3">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold text-accent" data-testid={`curriculum-load-${card.id}`}>
            {curriculumCopy.loadToc}
          </summary>
          <div className="mt-3">
            <AddCurriculumForm learnerId={learnerId} curriculumId={card.id} aiAllowed={aiAllowed} aiReason={aiReason} />
          </div>
        </details>
      )}
    </article>
  );
}
```

`components/curriculum/UnitStatusTable.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";
import type { CardUnit } from "@/lib/curriculum/shape";
import { UNIT_STATUSES, type UnitStatus } from "@/lib/curriculum/types";

/** Unit statuses of the version in use: one row per unit, 4 buttons. Each click = one new event (old events stay; DOMAIN §8). */
export function UnitStatusTable({ curriculumId, units, statusOf }: { curriculumId: string; units: CardUnit[]; statusOf: Record<string, UnitStatus> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function set(code: string, status: UnitStatus) {
    setBusy(code);
    setMsg(null);
    const r = await sendJson(`/api/curricula/${curriculumId}/unit-events`, "POST", { unit_code: code, status, lesson_note_id: null, client_id: crypto.randomUUID() });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: curriculumErrorText(r.error) });
    setMsg({ ok: true, text: curriculumCopy.unitStatusSaved(code, curriculumCopy.unitStatus[status]) });
    router.refresh();
  }
  return (
    <div className="mt-4 flex flex-col gap-2" data-testid="unit-status-table">
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-accent" : "text-[#8A1C12]"}`}>
          {msg.text}
        </p>
      ) : null}
      {units.map((u) => (
        <div key={u.code} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-2" data-testid={`unit-${u.code}`}>
          <span className="min-w-0 flex-1 text-[15px]">
            <b>{u.code}</b> · {u.title}
            {u.skipped ? <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-xs">{curriculumCopy.skippedBadge}</span> : null}
          </span>
          <div className="flex flex-wrap gap-1" role="group" aria-label={`${u.code} · ${u.title}`}>
            {UNIT_STATUSES.map((s) => (
              <button key={s} type="button" disabled={busy !== null} aria-pressed={statusOf[u.code] === s} onClick={() => void set(u.code, s)} data-testid={`unit-${u.code}-${s}`}
                className={`min-h-11 rounded-lg border px-3 text-sm ${statusOf[u.code] === s ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white"}`}>
                {curriculumCopy.unitStatus[s]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Pages + link on the learner card**

`app/learners/[id]/curricula/page.tsx`:

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AddCurriculumForm } from "@/components/curriculum/AddCurriculumForm";
import { CurriculumCard } from "@/components/curriculum/CurriculumCard";
import { curriculumCopy, learnerWithTrack } from "@/lib/copy/vi";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import { loadStudioGate } from "@/lib/studio/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** Giáo trình của một em (spec §3): one card per book + "Thêm giáo trình". The child's tutor or parent; others 404. */
export default async function CurriculaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member, learner } = await requireLearnerPage(id, "curriculum:read");
  const [cards, gate] = await Promise.all([loadCurriculumCards(learner.id), loadStudioGate(learner.id)]);
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} feedbackScreen={curriculumCopy.screenLabel} />
      <main className="mx-auto max-w-[1240px] px-4 py-8" data-testid="curricula-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {curriculumCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{curriculumCopy.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 max-w-3xl text-[15px]">{curriculumCopy.intro}</p>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {cards.length === 0 ? <p className="text-muted">{curriculumCopy.empty}</p> : null}
          {cards.map((c) => (
            <CurriculumCard key={c.id} card={c} learnerId={learner.id} aiAllowed={gate.allowed} aiReason={gate.reason} />
          ))}
        </div>
        <section className="mt-8 max-w-3xl rounded-2xl border border-line bg-white p-5" data-testid="add-curriculum-box">
          <h2 className="text-lg font-semibold">{curriculumCopy.addTitle}</h2>
          <p className="mb-4 mt-1 text-xs text-muted">{curriculumCopy.oneChildNote}</p>
          <AddCurriculumForm learnerId={learner.id} aiAllowed={gate.allowed} aiReason={gate.reason} />
        </section>
      </main>
    </>
  );
}
```

`app/learners/[id]/curricula/[curriculumId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { CoverageBar } from "@/components/curriculum/CoverageBar";
import { UnitStatusTable } from "@/components/curriculum/UnitStatusTable";
import { curriculumCopy } from "@/lib/copy/vi";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import { formatDateVi } from "@/lib/inquiries/format";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** Trạng thái Unit of one curriculum (version in use) + the last changes. The child's tutor or parent. */
export default async function CurriculumUnitsPage({ params }: { params: Promise<{ id: string; curriculumId: string }> }) {
  const { id, curriculumId } = await params;
  const { member, learner } = await requireLearnerPage(id, "curriculum:read");
  const card = (await loadCurriculumCards(learner.id)).find((c) => c.id === curriculumId);
  if (!card || !card.current || !card.progress) notFound();
  const recent = [...card.events].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10);
  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} feedbackScreen={curriculumCopy.screenLabel} />
      <main className="mx-auto max-w-[1240px] px-4 py-8" data-testid="curriculum-units-page">
        <Link href={`/learners/${learner.id}/curricula`} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {curriculumCopy.navLink}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{curriculumCopy.unitsTitle(card.title)}</h1>
        <p className="mt-2 text-[15px]">
          <span className="text-muted">{curriculumCopy.currentLabel}: </span>
          <b data-testid="units-current">{card.progress.current ? curriculumCopy.currentLine(card.progress.current.code, card.progress.current.title) : curriculumCopy.notStarted}</b>
        </p>
        <div className="mt-2">
          <CoverageBar done={card.progress.done} total={card.progress.total} pct={card.progress.pct} testId="units-coverage" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <UnitStatusTable curriculumId={card.id} units={card.current.units} statusOf={card.progress.statusOf} />
          <aside className="mt-4 h-fit rounded-2xl border border-line bg-white p-4 text-sm lg:sticky lg:top-4">
            <h2 className="font-semibold">{curriculumCopy.historyTitle}</h2>
            {recent.length === 0 ? <p className="text-muted">{curriculumCopy.historyNone}</p> : null}
            <ul className="mt-2 flex flex-col gap-1">
              {recent.map((e) => (
                <li key={e.id}>{curriculumCopy.historyLine(e.unitCode, curriculumCopy.unitStatus[e.status], formatDateVi(e.at.slice(0, 10)))}</li>
              ))}
            </ul>
          </aside>
        </div>
      </main>
    </>
  );
}
```

`components/LearnerCard.tsx`:

```diff
diff --git a/components/LearnerCard.tsx b/components/LearnerCard.tsx
--- a/components/LearnerCard.tsx
+++ b/components/LearnerCard.tsx
@@ -1,4 +1,4 @@
 import Link from "next/link";
-import { assignPage, fallbackLabels, home, inquiriesPage, learnerWithTrack, levelCopy, notesPage, purgePage, readingPage, revisionReviewCopy, sourceLabels, studioCopy, targetsPage, todayPage, tutorHonorific, weakPage } from "@/lib/copy/vi";
+import { assignPage, fallbackLabels, home, inquiriesPage, learnerWithTrack, levelCopy, notesPage, purgePage, readingPage, revisionReviewCopy, sourceLabels, curriculumCopy, studioCopy, targetsPage, todayPage, tutorHonorific, weakPage } from "@/lib/copy/vi";
 import { safeColor, type LearnerSummary } from "@/lib/home/visible";
 import { todayVn } from "@/lib/inquiries/dates";
@@ -224,4 +224,7 @@ export function LearnerCard({
           {studioCopy.navLink}
         </Link>
+        <Link href={`/learners/${learner.id}/curricula`} data-testid={`curricula-link-${learner.id}`} className={linkClass}>
+          {curriculumCopy.navLink}
+        </Link>
         <Link href={`/learners/${learner.id}/targets`} className={linkClass}>
           {targetsPage.link}
```

- [ ] **Step 6: Run** `npx vitest run tests/unit/curriculumUi.test.ts tests/unit/copyNoProvider.test.ts tests/unit/noStrayBackticks.test.ts tests/unit/lightOnly.test.ts` → PASS; `npm run typecheck && npm run lint`.

- [ ] **Step 7: Commit**

```bash
git add lib/copy/vi.ts lib/curriculum/client.ts components/curriculum components/LearnerCard.tsx "app/learners/[id]/curricula" tests/unit/curriculumUi.test.ts
git commit -m "feat(w2): Giáo trình page (cards: level note, current unit, coverage, load contents) and unit status page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 9: Màn "Duyệt mục lục" (rộng, dòng cần xem lên đầu, thanh dính đáy) + "Bảng nối" chỉ đọc

**Files:**
- Create: `components/curriculum/VersionReview.tsx`, `MapTable.tsx`, `TocWaiting.tsx`, `app/curricula/versions/[id]/page.tsx`
- Modify: `tests/unit/curriculumUi.test.ts`

**Interfaces:**
- Consumes: `VersionPageData` (Task 7), `useTags`, `TagSelect`, `AddTag` (`components/tutor/*`, POST `/api/learners/:id/tags` = `eng_add_error_tag_v2`, bắt buộc nhóm SM-1), `buildTocContext`, `validateCurriculum`, `rowsToResolve`, `editStats`, `tooManyEdits`, `loadPickerMap`, `loadTags`.
- Produces: `VersionReview({initial, map, tags, learnerId})`, `MapTable({units, labelOf})`, `TocWaiting({versionId})`. testid: `review-needs`, `review-rest`, `row-<code>` (+ `-seen`, `-skip`, `-drop`, `-reason`, `-add-point`, `-point-<key>`, `-make-<text>`), `review-left`, `review-save`, `review-approve`, `review-approve-tutor-only`, `review-discard`, `review-quality-<q>`, `review-stats`, `version-close`, `version-ai-cost`, `version-approved`, `curriculum-map-table`, `toc-waiting`, `toc-ai-failed`.

Hành vi (spec §5 quy tắc 1, 4, 7): khung nội dung `max-w-[1240px]`; "Đóng" góc phải trên; mục **"Cần xem (n)"** (dòng có lỗi chặn) trước, rồi "Toàn bộ Unit theo thứ tự sách"; mỗi dòng: mã · tên · loại · trang (nhãn trên ô, lưới 5 cột ở ≥ lg, xếp chồng ở điện thoại) · điểm (chip bỏ được + `TagSelect` thêm) · cờ / lý do AI / gợi ý "Tạo nhãn riêng …" · "Đã xem" · "Không dạy Unit này" · "Bỏ dòng" + lý do (không bắt buộc); dòng đã bỏ gom trong `<details>`; "Không phải Unit (n)" gom trong `<details>`; thanh **cố định đáy**: "Còn n dòng cần xử lý" · Tốt/Tạm/Phải sửa nhiều + 1 dòng (chỉ gia sư, chỉ bản AI) · Bỏ nháp · Lưu nháp · Duyệt (chỉ gia sư; tắt khi n > 0; tự lưu trước khi duyệt và dùng **mốc khóa mới** trả về từ lần lưu). Phụ huynh thấy chữ `approveTutorOnly` thay cho nút Duyệt và thấy chi phí AI.

- [ ] **Step 1: Failing UI test** — thêm vào `tests/unit/curriculumUi.test.ts`: import `import { MapTable } from "@/components/curriculum/MapTable";` và, trong `describe("Giáo trình screens")`, it sau:

```ts
  it("the map table lists points by name", () => {
    const html = renderToStaticMarkup(createElement(MapTable, {
      units: [{ code: "U7", title: "Passives and causatives", section: "Grammar", page: 54, skipped: false, points: ["bi-dong-nho-tuong-thuat"], missing_points: [], needs_review: false, review_reason: null, flags: [], origin: "ai", ai_index: 6, dropped: false, edit_reason: null }],
      labelOf: { "bi-dong-nho-tuong-thuat": "Bị động, nhờ ai làm, tường thuật" },
    }));
    expect(html).toContain("Bị động, nhờ ai làm, tường thuật");
  });
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Components + page**

`components/curriculum/TocWaiting.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { curriculumCopy } from "@/lib/copy/vi";

const EVERY_MS = 3000;

/** "AI đang đọc mục lục…": asks the version's status every 3 s; when it is no longer extracting, the page reloads itself. */
export function TocWaiting({ versionId }: { versionId: string }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    const timer = setInterval(async () => {
      if (stop) return;
      const res = await fetch(`/api/curricula/versions/${versionId}?view=status`, { cache: "no-store" }).catch(() => null);
      const body = res && res.ok ? ((await res.json()) as { status: string }) : null;
      if (body && body.status !== "extracting") {
        stop = true;
        clearInterval(timer);
        router.refresh();
      }
    }, EVERY_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [versionId, router]);
  return (
    <section role="status" aria-live="polite" data-testid="toc-waiting" className="mt-6 rounded-2xl border border-line bg-white p-5">
      <p className="text-lg font-semibold text-accent">{curriculumCopy.reading}</p>
      <p className="mt-1 text-sm text-muted">{curriculumCopy.readingHint}</p>
    </section>
  );
}
```

`components/curriculum/MapTable.tsx`:

```tsx
import { curriculumCopy } from "@/lib/copy/vi";
import type { UnitDraft } from "@/lib/curriculum/schema";

/** Read-only "Bảng nối Unit → điểm" of an approved (or superseded) version: one row per unit, points as names. */
export function MapTable({ units, labelOf }: { units: UnitDraft[]; labelOf: Record<string, string> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm" data-testid="curriculum-map-table">
        <thead className="text-xs text-muted">
          <tr>
            <th className="p-3">{curriculumCopy.col.code}</th>
            <th className="p-3">{curriculumCopy.col.title}</th>
            <th className="p-3">{curriculumCopy.col.section}</th>
            <th className="p-3">{curriculumCopy.col.page}</th>
            <th className="p-3">{curriculumCopy.col.points}</th>
          </tr>
        </thead>
        <tbody>
          {units.filter((u) => !u.dropped).map((u) => (
            <tr key={u.code} className="border-t border-line align-top" data-testid={`map-row-${u.code}`}>
              <td className="p-3 font-semibold">{u.code}</td>
              <td className="p-3">
                {u.title}
                {u.skipped ? <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-xs">{curriculumCopy.skippedBadge}</span> : null}
              </td>
              <td className="p-3 text-muted">{u.section ?? "—"}</td>
              <td className="p-3 text-muted">{u.page ?? "—"}</td>
              <td className="p-3">{u.points.length ? u.points.map((k) => labelOf[k] ?? k).join(" · ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`components/curriculum/VersionReview.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AddTag } from "@/components/tutor/AddTag";
import { TagSelect } from "@/components/tutor/TagSelect";
import { useTags } from "@/components/tutor/useTags";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";
import { buildTocContext } from "@/lib/curriculum/context";
import { editStats, tooManyEdits } from "@/lib/curriculum/editStats";
import type { CurriculumPayload, UnitDraft } from "@/lib/curriculum/schema";
import type { VersionPageData } from "@/lib/curriculum/shape";
import { EDIT_REASONS, QUALITY, UNIT_CODE_RE, type EditReason, type Quality } from "@/lib/curriculum/types";
import { rowsToResolve, validateCurriculum, type CurriculumIssue } from "@/lib/curriculum/validate";
import type { SkillMapView } from "@/lib/skillmap/types";
import type { TagInfo } from "@/lib/tutorwork/types";

const input = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-sm";
const small = "min-h-11 rounded-lg border border-line bg-white px-3 text-sm font-medium hover:border-accent";

/**
 * "Duyệt mục lục" (spec §5 desktop rules 1, 4, 7): wide page, rows that block first, a sticky bar at the bottom ("Còn n dòng cần xử lý ·
 * Duyệt"), "Đóng" at the top. Every change is local until "Lưu nháp"; "Duyệt" needs a saved draft with nothing left to resolve and is
 * shown to the child's tutor only (D-W8). Rows the tutor drops stay in the draft (marked) so the edit count stays honest.
 */
export function VersionReview({ initial, map, tags: initialTags, learnerId }: { initial: VersionPageData; map: SkillMapView; tags: TagInfo[]; learnerId: string }) {
  const router = useRouter();
  const v = initial.version;
  const { tags, add } = useTags(learnerId, initialTags);
  const [payload, setPayload] = useState<CurriculumPayload>(v.payload);
  const [base, setBase] = useState(v.updatedAt);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "approve" | "discard" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [qualityNote, setQualityNote] = useState("");
  const ctx = useMemo(() => buildTocContext(map, tags), [map, tags]);
  const issues = useMemo(() => validateCurriculum(payload, ctx), [payload, ctx]);
  const left = rowsToResolve(issues);
  const stats = editStats(v.aiPayload, payload);
  const labelOf = new Map(tags.map((t) => [t.key, t.label]));
  const blocked = new Set(issues.filter((i) => i.blocking && i.code !== null).map((i) => i.code));
  const rows = payload.units.map((u, i) => ({ u, i }));
  const firstRows = rows.filter((r) => !r.u.dropped && blocked.has(r.u.code));
  const restRows = rows.filter((r) => !r.u.dropped && !blocked.has(r.u.code));
  const droppedRows = rows.filter((r) => r.u.dropped);

  function update(i: number, patch: Partial<UnitDraft>) {
    setPayload((p) => ({ ...p, units: p.units.map((u, k) => (k === i ? { ...u, ...patch } : u)) }));
    setDirty(true);
    setNote(null);
  }
  function addUnit() {
    setPayload((p) => {
      const used = new Set(p.units.map((u) => u.code));
      let n = p.units.length + 1;
      while (used.has(`U${n}`)) n += 1;
      const unit: UnitDraft = {
        code: `U${n}`, title: curriculumCopy.newUnitTitle, section: null, page: null, skipped: false, points: [], missing_points: [], needs_review: false,
        review_reason: null, flags: [], origin: "manual", ai_index: null, dropped: false, edit_reason: null,
      };
      return { ...p, units: [...p.units, unit] };
    });
    setDirty(true);
  }
  /** Returns the new lock value, or null when the save failed. */
  async function save(): Promise<string | null> {
    setBusy("save");
    setProblem(null);
    const r = await sendJson<{ updated_at: string }>(`/api/curricula/versions/${v.id}`, "PUT", { payload, base_updated_at: base });
    setBusy(null);
    if (!r.ok) {
      setProblem(curriculumErrorText(r.error));
      return null;
    }
    setBase(r.body.updated_at);
    setDirty(false);
    setNote(curriculumCopy.saved);
    return r.body.updated_at;
  }
  async function approve() {
    // Unsaved changes are saved first; the approval then uses the NEW lock value (state updates are not visible in this closure).
    const lock = dirty ? await save() : base;
    if (lock === null) return;
    setBusy("approve");
    const r = await sendJson(`/api/curricula/versions/${v.id}/approve`, "POST", { base_updated_at: lock, quality, quality_note: qualityNote.trim() || null });
    setBusy(null);
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    router.refresh();
  }
  async function discard() {
    if (!window.confirm(curriculumCopy.discardConfirm)) return;
    setBusy("discard");
    const r = await sendJson(`/api/curricula/versions/${v.id}/discard`, "POST");
    setBusy(null);
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    router.push(`/learners/${learnerId}/curricula`);
  }

  const rowView = ({ u, i }: { u: UnitDraft; i: number }) => (
    <UnitRow
      key={i}
      u={u}
      issues={issues.filter((x) => x.code === u.code)}
      map={map}
      tags={tags}
      labelOf={labelOf}
      onChange={(patch) => update(i, patch)}
      onAdd={add}
    />
  );

  return (
    <div className="pb-40" data-testid="curriculum-review">
      <p className="text-sm text-muted">{curriculumCopy.summary(payload.units.filter((u) => !u.dropped).length, payload.ignored.length)}</p>
      {stats ? (
        <p className="mt-1 text-sm" data-testid="review-stats">
          {curriculumCopy.stats(stats)}
        </p>
      ) : null}
      {tooManyEdits(stats) ? (
        <p role="status" className="mt-2 rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]" data-testid="review-too-many-edits">
          {curriculumCopy.tooManyEdits}
        </p>
      ) : null}

      {firstRows.length > 0 ? (
        <section className="mt-5 flex flex-col gap-2" aria-label={curriculumCopy.needsTitle(firstRows.length)} data-testid="review-needs">
          <h2 className="text-base font-semibold">{curriculumCopy.needsTitle(firstRows.length)}</h2>
          <p className="text-sm text-muted">{curriculumCopy.needsHint}</p>
          {firstRows.map(rowView)}
        </section>
      ) : null}

      <section className="mt-6 flex flex-col gap-2" aria-label={curriculumCopy.allTitle} data-testid="review-rest">
        <h2 className="text-base font-semibold">{curriculumCopy.allTitle}</h2>
        {restRows.map(rowView)}
        <button type="button" onClick={addUnit} data-testid="review-add-unit" className={`${small} self-start`}>
          {curriculumCopy.addUnit}
        </button>
      </section>

      {droppedRows.length > 0 ? (
        <details className="mt-4 rounded-xl border border-line bg-white p-3">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">{curriculumCopy.droppedBadge} ({droppedRows.length})</summary>
          {droppedRows.map(({ u, i }) => (
            <p key={i} className="flex flex-wrap items-center gap-3 py-1 text-sm">
              <span className="text-muted line-through">
                {u.code} · {u.title}
              </span>
              <button type="button" className={small} onClick={() => update(i, { dropped: false })} data-testid={`row-undrop-${i}`}>
                {curriculumCopy.undrop}
              </button>
            </p>
          ))}
        </details>
      ) : null}

      {payload.ignored.length > 0 ? (
        <details className="mt-4 rounded-xl border border-line bg-white p-3" data-testid="review-ignored">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">
            {curriculumCopy.ignoredTitle} ({payload.ignored.length})
          </summary>
          <ul className="mt-2 text-sm text-muted">
            {payload.ignored.map((r, k) => (
              <li key={k}>
                {curriculumCopy.ignoredReasons[r.reason]} · {r.label}
                {r.page ? ` · ${r.page}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 backdrop-blur" data-testid="review-bar">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-4 py-3">
          <p className={`font-semibold ${left > 0 ? "text-[#8A1C12]" : "text-accent"}`} data-testid="review-left">
            {curriculumCopy.barLeft(left)}
          </p>
          {v.source === "ai" && initial.is_tutor ? (
            <fieldset className="flex flex-wrap items-center gap-2 border-0 p-0 text-sm">
              <legend className="sr-only">{curriculumCopy.quality}</legend>
              <span className="text-muted">{curriculumCopy.quality}</span>
              {QUALITY.map((q) => (
                <button key={q} type="button" aria-pressed={quality === q} onClick={() => setQuality(quality === q ? null : q)} data-testid={`review-quality-${q}`}
                  className={`min-h-11 rounded-full border px-3 ${quality === q ? "border-accent bg-accent text-white" : "border-line bg-white"}`}>
                  {curriculumCopy.qualityOptions[q]}
                </button>
              ))}
              <input value={qualityNote} onChange={(e) => setQualityNote(e.target.value)} maxLength={200} placeholder={curriculumCopy.qualityNote} aria-label={curriculumCopy.qualityNote} className={`${input} w-64`} />
            </fieldset>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {note ? <span role="status" className="text-sm text-accent">{note}</span> : null}
            {problem ? <span role="alert" className="text-sm text-[#8A1C12]" data-testid="review-problem">{problem}</span> : null}
            <button type="button" disabled={busy !== null} onClick={() => void discard()} data-testid="review-discard" className={small}>
              {curriculumCopy.discard}
            </button>
            <button type="button" disabled={busy !== null || !dirty} onClick={() => void save()} data-testid="review-save" className={small}>
              {busy === "save" ? curriculumCopy.saving : curriculumCopy.save}
            </button>
            {initial.is_tutor ? (
              <button type="button" disabled={busy !== null || left > 0} onClick={() => void approve()} data-testid="review-approve"
                className="min-h-12 rounded-xl bg-accent px-6 font-bold text-white disabled:opacity-50">
                {busy === "approve" ? curriculumCopy.approving : curriculumCopy.approve}
              </button>
            ) : (
              <span className="text-sm text-muted" data-testid="review-approve-tutor-only">{curriculumCopy.approveTutorOnly}</span>
            )}
          </div>
        </div>
      </div>
      <Link href={`/learners/${learnerId}/curricula`} className="sr-only">
        {curriculumCopy.close}
      </Link>
    </div>
  );
}

function UnitRow({
  u, issues, map, tags, labelOf, onChange, onAdd,
}: {
  u: UnitDraft;
  issues: CurriculumIssue[];
  map: SkillMapView;
  tags: TagInfo[];
  labelOf: Map<string, string>;
  onChange: (patch: Partial<UnitDraft>) => void;
  onAdd: ReturnType<typeof useTags>["add"];
}) {
  const [making, setMaking] = useState<string | null>(null);
  const id = `row-${u.code}`;
  const blockingText = issues.filter((x) => x.blocking).map((x) => curriculumCopy.issueText[x.issue]);
  return (
    <div className={`grid gap-3 rounded-xl border bg-white p-3 lg:grid-cols-[6rem_minmax(0,2fr)_8rem_5rem_minmax(0,3fr)] ${blockingText.length ? "border-[#E9C46A]" : "border-line"}`} data-testid={id}>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {curriculumCopy.col.code}
        <input value={u.code} onChange={(e) => onChange({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20) })} aria-invalid={!UNIT_CODE_RE.test(u.code)} className={input} data-testid={`${id}-code`} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {curriculumCopy.col.title}
        <input value={u.title} maxLength={160} onChange={(e) => onChange({ title: e.target.value })} className={input} data-testid={`${id}-title`} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {curriculumCopy.col.section}
        <input value={u.section ?? ""} maxLength={40} onChange={(e) => onChange({ section: e.target.value.trim() ? e.target.value : null })} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {curriculumCopy.col.page}
        <input inputMode="numeric" value={u.page ?? ""} onChange={(e) => { const n = Number(e.target.value); onChange({ page: e.target.value && Number.isInteger(n) && n >= 1 && n <= 3000 ? n : null }); }} className={input} />
      </label>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-xs text-muted">{curriculumCopy.col.points}</span>
        <div className="flex flex-wrap gap-2">
          {u.points.map((k) => (
            <button key={k} type="button" onClick={() => onChange({ points: u.points.filter((x) => x !== k) })} aria-label={curriculumCopy.removePoint(labelOf.get(k) ?? k)}
              className="min-h-9 rounded-full border border-accent bg-white px-3 text-sm" data-testid={`${id}-point-${k}`}>
              {labelOf.get(k) ?? k} ×
            </button>
          ))}
        </div>
        {u.points.length < 12 ? (
          <TagSelect tags={tags.filter((t) => !u.points.includes(t.key))} map={map} value={null} onChange={(k) => k && onChange({ points: [...u.points, k] })} onAdd={onAdd} label={curriculumCopy.addPoint} testId={`${id}-add-point`} />
        ) : null}
      </div>
      {u.flags.length > 0 || u.review_reason || u.missing_points.length > 0 || blockingText.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm lg:col-span-5">
          {u.flags.length > 0 ? <p className="text-[#6B4600]">{u.flags.map((f) => curriculumCopy.flags[f]).join(" · ")}</p> : null}
          {u.review_reason ? <p className="text-muted">{u.review_reason}</p> : null}
          {u.missing_points.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">{curriculumCopy.missingHint}</span>
              {u.missing_points.map((m) => (
                <button key={m} type="button" className={small} onClick={() => setMaking(m)} data-testid={`${id}-make-${m}`}>
                  {curriculumCopy.makeTag(m)}
                </button>
              ))}
            </div>
          ) : null}
          {making ? (
            <AddTag map={map} prefill={making} onAdd={async (label, group) => {
              const r = await onAdd(label, group);
              if ("key" in r) {
                onChange({ points: u.points.includes(r.key) ? u.points : [...u.points, r.key], missing_points: u.missing_points.filter((x) => x !== making) });
                setMaking(null);
              }
              return r;
            }} />
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 lg:col-span-5">
        {u.needs_review ? (
          <button type="button" className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white" onClick={() => onChange({ needs_review: false })} data-testid={`${id}-seen`}>
            {curriculumCopy.markSeen}
          </button>
        ) : null}
        <button type="button" className={small} aria-pressed={u.skipped} onClick={() => onChange({ skipped: !u.skipped })} data-testid={`${id}-skip`}>
          {u.skipped ? curriculumCopy.unskip : curriculumCopy.skip}
        </button>
        <button type="button" className={small} onClick={() => onChange({ dropped: true })} data-testid={`${id}-drop`}>
          {curriculumCopy.drop}
        </button>
        {u.origin === "ai" ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            {curriculumCopy.reasonLabel}
            <select value={u.edit_reason ?? ""} onChange={(e) => onChange({ edit_reason: (e.target.value || null) as EditReason | null })} className="min-h-11 rounded-lg border border-line bg-white px-2 text-sm" data-testid={`${id}-reason`}>
              <option value="">—</option>
              {EDIT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {curriculumCopy.reasons[r]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {u.skipped ? <span className="rounded-full bg-line px-2.5 py-0.5 text-xs">{curriculumCopy.skippedBadge}</span> : null}
        {blockingText.length > 0 ? <span className="text-xs font-semibold text-[#8A1C12]">{blockingText.join(" · ")}</span> : null}
      </div>
    </div>
  );
}
```

`app/curricula/versions/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { MapTable } from "@/components/curriculum/MapTable";
import { TocWaiting } from "@/components/curriculum/TocWaiting";
import { VersionReview } from "@/components/curriculum/VersionReview";
import { curriculumCopy, studioCopy } from "@/lib/copy/vi";
import { loadVersionPage } from "@/lib/curriculum/load";
import { loadPickerMap } from "@/lib/skillmap/load";
import { loadTags } from "@/lib/tutorwork/load";

export const dynamic = "force-dynamic";

/** Duyệt mục lục (draft) or the read-only Bảng nối (approved / superseded). The child's tutor or parent; others 404. Wide page (spec §5.1). */
export default async function CurriculumVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadVersionPage(id);
  if (r.kind === "login") redirect("/login");
  if (r.kind === "not-found") notFound();
  const { version: v, stats } = r.data;
  const back = `/learners/${v.learnerId}/curricula`;
  const editable = v.status === "draft" || v.status === "ai_failed";
  const [map, tags] = editable ? await Promise.all([loadPickerMap(v.learnerId), loadTags(r.data.track_id)]) : [null, null];
  const labelOf = Object.fromEntries(r.data.context.tags.map((t) => [t.key, t.label]));
  return (
    <>
      <AppHeader feedbackScreen={curriculumCopy.screenLabel} />
      <main className="mx-auto max-w-[1240px] px-4 py-8" data-testid="curriculum-version" data-status={v.status}>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{editable || v.status === "extracting" ? curriculumCopy.reviewTitle(v.title, v.version) : curriculumCopy.mapTitle(v.title, v.version)}</h1>
          <Link href={back} data-testid="version-close" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold">
            {curriculumCopy.close}
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">{curriculumCopy.statusLabels[v.status]}</p>
        {v.aiCostUsd !== null && v.source === "ai" ? (
          <p className="mt-1 text-sm text-muted" data-testid="version-ai-cost">{curriculumCopy.aiCost(`$${v.aiCostUsd.toFixed(4)}`)}</p>
        ) : null}
        {v.status === "extracting" ? <TocWaiting versionId={v.id} /> : null}
        {v.status === "ai_failed" ? (
          <section role="alert" data-testid="toc-ai-failed" className="mt-4 rounded-2xl border border-[#E9C46A] bg-[#FBF1DC] p-4 text-[#6B4600]">
            <p className="font-semibold">{curriculumCopy.aiFailedTitle}</p>
            <p className="text-sm">
              {(v.errorCode && (studioCopy.aiFailedReason as Record<string, string>)[v.errorCode]) ?? ""} {curriculumCopy.aiFailedNext}
            </p>
          </section>
        ) : null}
        {editable && map && tags ? <div className="mt-4"><VersionReview initial={r.data} map={map} tags={tags} learnerId={v.learnerId} /></div> : null}
        {v.status === "approved" || v.status === "superseded" ? (
          <>
            {v.status === "approved" ? (
              <p className="mt-4 font-semibold text-accent" data-testid="version-approved">
                {curriculumCopy.approvedTitle} <span className="font-normal text-muted">{curriculumCopy.approvedNote}</span>
              </p>
            ) : null}
            {stats ? <p className="mt-1 text-sm" data-testid="review-stats">{curriculumCopy.stats(stats)}</p> : null}
            <MapTable units={v.payload.units} labelOf={labelOf} />
          </>
        ) : null}
        {v.status === "discarded" ? <p className="mt-4 text-muted">{curriculumCopy.statusLabels.discarded}</p> : null}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/curriculumUi.test.ts` → PASS; `npm run typecheck && npm run lint`. Thử tay (`npm run dev`, `AI_FAKE=1`, gia đình thử): 1366×768 và 1920×1080 — thanh đáy luôn thấy, "Cần xem (8)" ở trên cùng; 390 px — không cuộn ngang ở màn duyệt.

- [ ] **Step 5: Commit**

```bash
git add components/curriculum/VersionReview.tsx components/curriculum/MapTable.tsx components/curriculum/TocWaiting.tsx app/curricula tests/unit/curriculumUi.test.ts
git commit -m "feat(w2): wide contents review — uncertain rows first, sticky action bar, approve for the tutor only; read-only unit map

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 10: Ghi buổi — "Unit đã dạy hôm nay" + đề xuất "Đang học" (gia sư bấm)

**Files:**
- Modify: `lib/tutorwork/schemas.ts`, `lib/tutorwork/handlers.ts`, `lib/tutorwork/supabaseStore.ts`, `components/tutor/SessionNoteForm.tsx` (bản của `main` sau PR #23 — có `PractisedChosen`, "Giống buổi trước"), `app/learners/[id]/notes/new/page.tsx`
- Create: `components/curriculum/TaughtUnitsPicker.tsx`, `components/curriculum/UnitProposal.tsx`
- Test: `tests/unit/deployOrder.test.ts`, `tests/unit/tutorWork.test.ts`, `tests/unit/curriculumUi.test.ts`

**Interfaces:**
- Consumes: `taughtUnitsSchema`, `TaughtUnit` (Task 5), `TaughtChoice`, `taughtChoices` (Task 7), `proposeInProgress` (Task 5), POST `/api/curricula/:id/unit-events` (Task 7), `eng_write_lesson_note_v3` (Task 4).
- Produces: body Ghi buổi thêm `taught_units: [{curriculum_id, unit_code}]` (≤ 6, mặc định `[]`); `TutorWorkStore.writeSessionNote` nhận `taughtUnits?: TaughtUnit[]` — **chỉ khi khác rỗng** mới gọi `eng_write_lesson_note_v3`, không thì gọi `eng_write_lesson_note_v2` y như cũ (code chạy được trước khi áp 0026); `TaughtUnitsPicker({choices, value, onChange, disabled?})`, `UnitProposal({choices, taught, lessonNoteId})`; `SessionNoteForm` prop mới `taughtChoices?: TaughtChoice[]`.

- [ ] **Step 1: Failing tests**

`tests/unit/deployOrder.test.ts` — thêm trong `describe("the new SQL arguments are only sent when needed …")`, trước it "offline attempt…":

```ts
  it("lesson note: without taught units the v2 call is unchanged (works before 0026); with units it is v3", async () => {
    await createSupabaseTutorWorkStore().writeSessionNote({ ...noteArgs([]), taughtUnits: [] });
    expect((rpc.mock.calls[0] as [string]).at(0)).toBe("eng_write_lesson_note_v2");
    await createSupabaseTutorWorkStore().writeSessionNote({ ...noteArgs([]), taughtUnits: [{ curriculum_id: "c0000000-0000-4000-8000-0000000000c1", unit_code: "U13" }] });
    const [name, params] = rpc.mock.calls[1] as [string, Record<string, unknown>];
    expect(name).toBe("eng_write_lesson_note_v3");
    expect(params.p_taught_units).toEqual([{ curriculum_id: "c0000000-0000-4000-8000-0000000000c1", unit_code: "U13" }]);
  });
```

`tests/unit/tutorWork.test.ts`, test "a session note passes through every field…": thêm `taughtUnits: [],` vào cuối object kỳ vọng (sau `clientId: "client-0003",`).

`tests/unit/curriculumUi.test.ts`: import `import { TaughtUnitsPicker } from "@/components/curriculum/TaughtUnitsPicker";`, đổi import shape thành `import { buildCards, taughtChoices } from "@/lib/curriculum/shape";`, thêm it:

```ts
  it("the session chooser offers the current unit and the next one as chips, the rest in a select (skipped U3 not offered)", () => {
    const html = renderToStaticMarkup(createElement(TaughtUnitsPicker, { choices: taughtChoices([card]), value: [], onChange: () => undefined }));
    expect(html).toContain(`data-testid="taught-${C}-U13"`);
    expect(html).toContain(`data-testid="taught-${C}-U14"`);
    expect(html).not.toContain(`data-testid="taught-${C}-U12"`);
    expect(html).not.toContain(">U3 · Unit 3<");
  });
```

- [ ] **Step 2: Run → FAIL** (`taughtUnits` chưa được truyền; component chưa có).

- [ ] **Step 3: Server side**

`lib/tutorwork/schemas.ts`:

```diff
diff --git a/lib/tutorwork/schemas.ts b/lib/tutorwork/schemas.ts
--- a/lib/tutorwork/schemas.ts
+++ b/lib/tutorwork/schemas.ts
@@ -1,2 +1,3 @@
+import { taughtUnitsSchema } from "@/lib/curriculum/schema";
 /** Request bodies for the S5b-1 routes (zod). Parsed AFTER requireAccess, so outsiders always get 404. */
 import { z } from "zod";
@@ -104,4 +105,6 @@ export const sessionNoteBodySchema = z.strictObject({
   practised_target_ids: z.array(z.string().trim().min(1).max(100)).max(MAX_PRACTISED_PER_NOTE).default([]),
   supersedes_id: uuid.optional(),
+  /** W2: units taught today ("Unit đã dạy hôm nay"); the database checks each is in a current curriculum of the learner. */
+  taught_units: taughtUnitsSchema,
 });
 export type SessionNoteBody = z.infer<typeof sessionNoteBodySchema>;
```

`lib/tutorwork/handlers.ts`:

```diff
diff --git a/lib/tutorwork/handlers.ts b/lib/tutorwork/handlers.ts
--- a/lib/tutorwork/handlers.ts
+++ b/lib/tutorwork/handlers.ts
@@ -12,4 +12,5 @@ import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/han
 import { addTagBodySchema, resultBodySchema, sessionNoteBodySchema, setTagGroupBodySchema, tagItemsBodySchema, writingTagsBodySchema } from "./schemas";
 import { customTagKey } from "./frameScore";
+import type { TaughtUnit } from "@/lib/curriculum/schema";
 
 export interface TutorWorkStore {
@@ -52,4 +53,6 @@ export interface TutorWorkStore {
     byMemberId: string;
     clientId: string;
+    /** W2 (0026): sent only when not empty (then eng_write_lesson_note_v3 is called). */
+    taughtUnits?: TaughtUnit[];
   }): Promise<unknown>;
 }
@@ -228,4 +231,5 @@ export async function handleWriteSessionNote(deps: TutorWorkDeps, learnerId: str
       byMemberId: g.grant.member.id,
       clientId: b.client_id,
+      taughtUnits: b.taught_units,
     })) as { id: string; replayed: boolean };
     return {
```

`lib/tutorwork/supabaseStore.ts`:

```diff
diff --git a/lib/tutorwork/supabaseStore.ts b/lib/tutorwork/supabaseStore.ts
--- a/lib/tutorwork/supabaseStore.ts
+++ b/lib/tutorwork/supabaseStore.ts
@@ -92,4 +92,23 @@ export function createSupabaseTutorWorkStore(): TutorWorkStore {
 
     async writeSessionNote(a) {
+      // W2: units taught today → v3 (0026). Without units the v2 call is unchanged, so the code also runs before 0026 is applied.
+      if (a.taughtUnits && a.taughtUnits.length > 0) {
+        const { data, error } = await db().rpc("eng_write_lesson_note_v3", {
+          p_learner: a.learnerId,
+          p_session_date: a.sessionDate,
+          p_studied: a.studied,
+          p_weak_tags: a.weakTags,
+          p_message: a.message,
+          p_note_for_parent: a.noteForParent,
+          p_rechecks: a.rechecks,
+          p_supersedes: a.supersedes,
+          p_by: a.byMemberId,
+          p_client_id: a.clientId,
+          p_practised_target_ids: a.practisedTargetIds,
+          p_taught_units: a.taughtUnits,
+        });
+        if (error) dbError("eng_write_lesson_note_v3", error);
+        return data;
+      }
       const { data, error } = await db().rpc("eng_write_lesson_note_v2", {
         p_learner: a.learnerId,
```

- [ ] **Step 4: Components**

`components/curriculum/TaughtUnitsPicker.tsx`:

```tsx
"use client";

import { curriculumCopy } from "@/lib/copy/vi";
import type { TaughtUnit } from "@/lib/curriculum/schema";
import type { TaughtChoice } from "@/lib/curriculum/shape";
import { CURRICULUM_LIMITS } from "@/lib/curriculum/types";

/**
 * "Unit đã dạy hôm nay" on the session note (~1 phút, spec §3): per approved curriculum, the unit it is at and the next one as one-tap
 * chips, every other unit in a select. At most 6 in all.
 */
export function TaughtUnitsPicker({ choices, value, onChange, disabled }: { choices: TaughtChoice[]; value: TaughtUnit[]; onChange: (v: TaughtUnit[]) => void; disabled?: boolean }) {
  const max = CURRICULUM_LIMITS.taughtPerNote;
  const has = (c: string, u: string) => value.some((x) => x.curriculum_id === c && x.unit_code === u);
  const toggle = (c: string, u: string) =>
    onChange(has(c, u) ? value.filter((x) => !(x.curriculum_id === c && x.unit_code === u)) : value.length >= max ? value : [...value, { curriculum_id: c, unit_code: u }]);
  if (choices.length === 0) return <p className="text-sm text-muted" data-testid="taught-none">{curriculumCopy.taughtNone}</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="taught-units">
      {choices.map((c) => {
        const at = c.units.findIndex((u) => u.code === c.currentCode);
        const quick = c.units.slice(Math.max(at, 0), Math.max(at, 0) + 2);
        const other = c.units.filter((u) => !quick.some((q) => q.code === u.code));
        return (
          <div key={c.curriculumId} className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{c.title}</p>
            <div className="flex flex-wrap gap-2">
              {[...quick, ...other.filter((u) => has(c.curriculumId, u.code))].map((u) => {
                const on = has(c.curriculumId, u.code);
                return (
                  <button key={u.code} type="button" role="checkbox" aria-checked={on} disabled={disabled || (!on && value.length >= max)} onClick={() => toggle(c.curriculumId, u.code)}
                    data-testid={`taught-${c.curriculumId}-${u.code}`}
                    className={`min-h-11 rounded-full border px-4 text-sm ${on ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white hover:border-accent"}`}>
                    {on ? "✓ " : ""}
                    {u.code} · {u.title}
                  </button>
                );
              })}
              <select aria-label={`${c.title} · ${curriculumCopy.taughtOther}`} value="" disabled={disabled || value.length >= max} onChange={(e) => e.target.value && toggle(c.curriculumId, e.target.value)}
                data-testid={`taught-other-${c.curriculumId}`} className="min-h-11 rounded-lg border border-line bg-white px-2 text-sm">
                <option value="">{curriculumCopy.taughtOther}</option>
                {other.filter((u) => !has(c.curriculumId, u.code)).map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code} · {u.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
      {value.length >= max ? <p className="text-xs text-muted">{curriculumCopy.taughtMax(max)}</p> : null}
    </div>
  );
}
```

`components/curriculum/UnitProposal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";
import { proposeInProgress } from "@/lib/curriculum/progress";
import type { TaughtUnit } from "@/lib/curriculum/schema";
import type { TaughtChoice } from "@/lib/curriculum/shape";

/** After the note is saved: "Đặt U14 là “Đang học”" for each taught unit that had not started (DOMAIN §5.1). Never automatic. */
export function UnitProposal({ choices, taught, lessonNoteId }: { choices: TaughtChoice[]; taught: TaughtUnit[]; lessonNoteId: string }) {
  const [done, setDone] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const items = choices.flatMap((c) =>
    proposeInProgress(taught.filter((t) => t.curriculum_id === c.curriculumId).map((t) => t.unit_code), c.statusOf).map((code) => ({ curriculumId: c.curriculumId, code })),
  );
  if (items.length === 0) return null;
  async function set(curriculumId: string, code: string) {
    const r = await sendJson(`/api/curricula/${curriculumId}/unit-events`, "POST", { unit_code: code, status: "in_progress", lesson_note_id: lessonNoteId, client_id: crypto.randomUUID() });
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    setDone((d) => [...d, `${curriculumId}/${code}`]);
  }
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-accent bg-white p-4" data-testid="unit-proposal">
      <h2 className="text-base font-semibold">{curriculumCopy.proposeTitle}</h2>
      <p className="text-xs text-muted">{curriculumCopy.proposeHelp}</p>
      {items.map((it) =>
        done.includes(`${it.curriculumId}/${it.code}`) ? (
          <p key={`${it.curriculumId}/${it.code}`} role="status" className="text-sm text-accent">
            {curriculumCopy.proposeDone(it.code)}
          </p>
        ) : (
          <button key={`${it.curriculumId}/${it.code}`} type="button" onClick={() => void set(it.curriculumId, it.code)} data-testid={`propose-${it.code}`}
            className="min-h-11 self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent">
            {curriculumCopy.proposeButton(it.code)}
          </button>
        ),
      )}
      {problem ? <p role="alert" className="text-sm text-[#8A1C12]">{problem}</p> : null}
    </section>
  );
}
```

- [ ] **Step 5: Session note form (on the PR #23 version) + page**

`components/tutor/SessionNoteForm.tsx`:

```diff
diff --git a/components/tutor/SessionNoteForm.tsx b/components/tutor/SessionNoteForm.tsx
--- a/components/tutor/SessionNoteForm.tsx
+++ b/components/tutor/SessionNoteForm.tsx
@@ -4,5 +4,5 @@ import Link from "next/link";
 import { useRouter } from "next/navigation";
 import { useMemo, useRef, useState } from "react";
-import { fallbackLabels, sessionNotePage } from "@/lib/copy/vi";
+import { curriculumCopy, fallbackLabels, sessionNotePage } from "@/lib/copy/vi";
 import { formatDateVi } from "@/lib/inquiries/format";
 import { firstTab, groupTargets } from "@/lib/skillmap/group";
@@ -23,4 +23,8 @@ import {
 import { placeOfTag } from "@/lib/skillmap/group";
 import { applySameAsLast } from "@/lib/tutorwork/sameAsLast";
+import { TaughtUnitsPicker } from "@/components/curriculum/TaughtUnitsPicker";
+import { UnitProposal } from "@/components/curriculum/UnitProposal";
+import type { TaughtUnit } from "@/lib/curriculum/schema";
+import type { TaughtChoice } from "@/lib/curriculum/shape";
 import { DomainTabs } from "./DomainTabs";
 import { PractisedChosen } from "./PractisedChosen";
@@ -41,4 +45,5 @@ export function SessionNoteForm({
   minDate,
   map,
+  taughtChoices = [],
 }: {
   learnerId: string;
@@ -52,4 +57,6 @@ export function SessionNoteForm({
   /** The skill map of this learner (SM-1): skills and tags are picked by domain. */
   map: SkillMapView;
+  /** W2: approved curricula of the child for "Unit đã dạy hôm nay" (empty before 0026 or when none is approved). */
+  taughtChoices?: TaughtChoice[];
 }) {
   const router = useRouter();
@@ -66,4 +73,6 @@ export function SessionNoteForm({
   const [skillTab, setSkillTab] = useState<string>(() => firstTab(skillBuckets));
   const [saved, setSaved] = useState(false);
+  const [taught, setTaught] = useState<TaughtUnit[]>([]);
+  const [savedId, setSavedId] = useState<string | null>(null);
   const [sameNote, setSameNote] = useState<{ practised: string; weak: string; text: string } | null>(null);
   const [busy, setBusy] = useState(false);
@@ -95,5 +104,5 @@ export function SessionNoteForm({
     setError(null);
     const answered = Object.entries(rechecks).flatMap(([tag_key, result]) => (result ? [{ tag_key, result }] : []));
-    if (!studied.trim() && weak.length === 0 && practised.length === 0 && !message.trim() && !parentNote.trim() && answered.length === 0) return setError(sessionNotePage.empty);
+    if (!studied.trim() && weak.length === 0 && practised.length === 0 && !message.trim() && !parentNote.trim() && answered.length === 0 && taught.length === 0) return setError(sessionNotePage.empty);
     if (answered.some((a) => a.result === "ok" && weak.includes(a.tag_key))) return setError(sessionNotePage.recheckConflict);
     setBusy(true);
@@ -107,7 +116,9 @@ export function SessionNoteForm({
       ...(parentNote.trim() ? { note_for_parent: parentNote.trim() } : {}),
       rechecks: answered,
+      ...(taught.length > 0 ? { taught_units: taught } : {}),
     });
     setBusy(false);
     if (!r.ok) return setError(failText(r));
+    setSavedId(r.body.id);
     setSaved(true);
     router.refresh();
@@ -157,4 +168,12 @@ export function SessionNoteForm({
         </label>
 
+        {taughtChoices.length > 0 ? (
+          <div className="flex flex-col gap-1">
+            <h2 className="text-base font-semibold">{curriculumCopy.taughtTitle}</h2>
+            <p className="text-sm text-muted">{curriculumCopy.taughtHelp}</p>
+            <TaughtUnitsPicker choices={taughtChoices} value={taught} onChange={setTaught} disabled={saved} />
+          </div>
+        ) : null}
+
         <label className="flex flex-col gap-1 text-sm">
           <span className="text-muted">{sessionNotePage.studied}</span>
@@ -278,4 +297,6 @@ export function SessionNoteForm({
         ) : null}
 
+        {saved && savedId ? <UnitProposal choices={taughtChoices} taught={taught} lessonNoteId={savedId} /> : null}
+
         <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4" data-testid="recheck-panel">
           <h2 className="text-base font-semibold">{sessionNotePage.recheckTitle}</h2>
```

`app/learners/[id]/notes/new/page.tsx`:

```diff
diff --git a/app/learners/[id]/notes/new/page.tsx b/app/learners/[id]/notes/new/page.tsx
--- a/app/learners/[id]/notes/new/page.tsx
+++ b/app/learners/[id]/notes/new/page.tsx
@@ -6,4 +6,5 @@ import { addDays, todayVn } from "@/lib/inquiries/dates";
 import { loadPickerMap } from "@/lib/skillmap/load";
 import { loadTargetsView } from "@/lib/targets/loadTargets";
+import { loadTaughtChoices } from "@/lib/curriculum/load";
 import { loadLastNote, loadTags, loadWeakPoints } from "@/lib/tutorwork/load";
 import { requireLearnerPage } from "@/lib/tutorwork/page";
@@ -15,5 +16,5 @@ export default async function NewSessionNotePage({ params }: { params: Promise<{
   const { id } = await params;
   const { member, learner } = await requireLearnerPage(id, "tutorwork:write");
-  const [tags, weak, previous, targets, map] = await Promise.all([
+  const [tags, weak, previous, targets, map, taughtChoices] = await Promise.all([
     loadTags(learner.trackId),
     loadWeakPoints(learner.id, "all"),
@@ -21,4 +22,5 @@ export default async function NewSessionNotePage({ params }: { params: Promise<{
     loadTargetsView(learner.id),
     loadPickerMap(learner.id),
+    loadTaughtChoices(learner.id),
   ]);
   const today = todayVn();
@@ -44,4 +46,5 @@ export default async function NewSessionNotePage({ params }: { params: Promise<{
             today={today}
             minDate={addDays(today, -120)}
+            taughtChoices={taughtChoices}
           />
         </div>
```

- [ ] **Step 6: Run** `npx vitest run tests/unit/deployOrder.test.ts tests/unit/tutorWork.test.ts tests/unit/tutorWorkUi.test.ts tests/unit/curriculumUi.test.ts` → PASS; `npm run typecheck && npm run lint`.

- [ ] **Step 7: Commit**

```bash
git add lib/tutorwork components/curriculum/TaughtUnitsPicker.tsx components/curriculum/UnitProposal.tsx components/tutor/SessionNoteForm.tsx "app/learners/[id]/notes/new/page.tsx" tests/unit/deployOrder.test.ts tests/unit/tutorWork.test.ts tests/unit/curriculumUi.test.ts
git commit -m "feat(w2): session note records units taught today and proposes 'Đang học' (tutor clicks); v2 call unchanged without units

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 11: "Thử AI bằng dùng thật" — số liệu cho PROGRESS + chạy bộ đề chuẩn với AI thật

**Files:**
- Create: `lib/curriculum/report.ts`, `scripts/curriculum-ai-report.ts`, `scripts/golden-curriculum.ts`, `tests/unit/curriculumReport.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `formatAiReport(rows: AiReportRow[]): string` (bảng Markdown; > 20 % sửa → "DỪNG: chỉnh công thức"); `npm run report:curriculum-ai` (chỉ đọc, cần `DATABASE_URL`); `npm run golden:curriculum -- <contents.pdf>` (cần `ANTHROPIC_API_KEY`, một lần gọi ≈ $0.05; thoát mã 1 khi lệch bộ đề chuẩn).

Cách ghi lần dùng thật (spec §8): sau khi gia sư duyệt mục lục thật đầu tiên, phụ huynh (hoặc Claude) chạy `npm run report:curriculum-ai` và dán bảng vào mục W2 của `docs/PROGRESS.md` (cột: lần gọi AI, token, chi phí, số dòng AI, % phải sửa, đánh giá, kết luận). File PDF đó vào bộ đề chuẩn: lưu trang mục lục ở máy phụ huynh (không đưa vào repo — bản quyền), cập nhật `destination-c1c2.golden.json` nếu sách khác bản. Khi đổi `curriculum-toc.v1` → `v2` hoặc đổi model: chạy `npm run golden:curriculum` trước khi bật.

- [ ] **Step 1: Failing test**

`tests/unit/curriculumReport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatAiReport } from "@/lib/curriculum/report";

describe("AI report for PROGRESS.md (spec §8)", () => {
  it("one row per AI version; more than 20 % edited says STOP", () => {
    const out = formatAiReport([
      { title: "Destination C1&C2", version: 1, approved_at: "2026-11-10 09:00:00+07", runs: 1, input_tokens: 4200, output_tokens: 2600, cost_usd: 0.0344, ai_rows: 26, edited_pct: 8, quality: "ok" },
      { title: "Reading Explorer 3", version: 1, approved_at: null, runs: 2, input_tokens: 9000, output_tokens: 3000, cost_usd: 0.048, ai_rows: null, edited_pct: null, quality: null },
      { title: "Great Writing 4", version: 1, approved_at: "2026-11-12 09:00:00+07", runs: 1, input_tokens: 3000, output_tokens: 2000, cost_usd: 0.026, ai_rows: 10, edited_pct: 30, quality: "needs_work" },
    ]).split("\n");
    expect(out).toHaveLength(5);
    expect(out[2]).toBe("| Destination C1&C2 | v1 | 2026-11-10 | 1 | 4200 / 2600 | $0.0344 | 26 | 8 % | ok | đạt |");
    expect(out[3]).toContain("chưa duyệt");
    expect(out[4]).toContain("DỪNG: chỉnh công thức");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

`lib/curriculum/report.ts`:

```ts
/**
 * The line docs/PROGRESS.md gets after each real "Đọc mục lục" (spec §8 "Thử AI bằng dùng thật"): book, version, date, AI calls, cost,
 * share of AI rows the tutor had to edit, rating — and STOP when more than 20 % were edited. Pure (scripts/curriculum-ai-report.ts feeds it).
 */
import { EDIT_WARN_PCT } from "./types";

export type AiReportRow = {
  title: string;
  version: number;
  approved_at: string | null;
  runs: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  ai_rows: number | null;
  edited_pct: number | null;
  quality: string | null;
};

export function formatAiReport(rows: AiReportRow[]): string {
  const head = "| Giáo trình | Bản | Duyệt ngày | Lần gọi AI | Token vào / ra | Chi phí | Dòng AI | Phải sửa | Đánh giá | Kết luận |\n|---|---|---|---|---|---|---|---|---|---|";
  const lines = rows.map((r) => {
    const verdict = r.edited_pct === null ? "chưa duyệt" : r.edited_pct > EDIT_WARN_PCT ? "DỪNG: chỉnh công thức" : "đạt";
    return `| ${r.title} | v${r.version} | ${r.approved_at ? r.approved_at.slice(0, 10) : "—"} | ${r.runs} | ${r.input_tokens} / ${r.output_tokens} | $${r.cost_usd.toFixed(4)} | ${r.ai_rows ?? "—"} | ${r.edited_pct === null ? "—" : `${r.edited_pct} %`} | ${r.quality ?? "—"} | ${verdict} |`;
  });
  return [head, ...lines].join("\n");
}
```

`scripts/curriculum-ai-report.ts`:

```ts
/**
 * npm run report:curriculum-ai
 *
 * READ-ONLY. Prints, as a Markdown table for docs/PROGRESS.md (spec §8), every curriculum version the AI read: calls, tokens, cost (from
 * ai_runs, purpose curriculum_toc, reservations excluded), the share of AI rows the tutor edited (review.stats) and the rating. No book
 * content and no child name is printed (alias is not selected). Needs DATABASE_URL (.env.local).
 */
import { Client } from "pg";
import { formatAiReport, type AiReportRow } from "../lib/curriculum/report";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";

async function main() {
  const db = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await db.connect();
  try {
    const { rows } = await db.query<AiReportRow>(`
      select c.title, v.version, v.approved_at::text as approved_at,
             count(r.id)::int as runs, coalesce(sum(r.input_tokens), 0)::int as input_tokens, coalesce(sum(r.output_tokens), 0)::int as output_tokens,
             coalesce(sum(r.cost_usd), 0)::float8 as cost_usd,
             (v.review -> 'stats' ->> 'ai_rows')::int as ai_rows, (v.review -> 'stats' ->> 'edited_pct')::int as edited_pct, v.review ->> 'quality' as quality
      from english.curriculum_versions v
      join english.curricula c on c.id = v.curriculum_id
      left join english.ai_runs r on r.draft_id = v.id and r.purpose = 'curriculum_toc' and r.status in ('ok', 'error')
      where v.source = 'ai'
      group by c.title, v.id, v.version, v.approved_at, v.review, v.created_at
      order by v.created_at`);
    console.log(formatAiReport(rows));
  } finally {
    await db.end();
  }
}
main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

`scripts/golden-curriculum.ts`:

```ts
/**
 * npm run golden:curriculum -- <path/to/contents.pdf> [golden.json]
 *
 * Golden set of "Đọc mục lục" (spec §5): runs the CURRENT prompt (prompts/curriculum-toc.v1.md) and model on a real table of contents and
 * compares the normalized draft with tests/fixtures/curriculum/destination-c1c2.golden.json (default). Run by hand after every change of
 * prompt or model, BEFORE switching it on. Needs ANTHROPIC_API_KEY; costs one call (about $0.05). The PDF is NOT in the repo (copyright):
 * use the contents pages (scan pages 6–7) of the tutor's copy. Uses the Track B seed tags of content/tags as the closed list.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { studioModel } from "../lib/ai/config";
import { estimateCostUsd } from "../lib/ai/pricing";
import { CURRICULUM_PROMPT, loadPrompt } from "../lib/ai/prompts";
import { postToolCall } from "../lib/ai/request";
import type { TocContext } from "../lib/curriculum/context";
import { compareGolden, type Golden } from "../lib/curriculum/golden";
import { normalizeToc } from "../lib/curriculum/normalize";
import { aiTocSchema } from "../lib/curriculum/schema";
import { buildTocCall, TOC_DOC_TITLE } from "../lib/curriculum/tocTool";

async function main() {
  const [pdfPath, goldenPath = "tests/fixtures/curriculum/destination-c1c2.golden.json"] = process.argv.slice(2);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!pdfPath || !key) {
    console.error("usage: ANTHROPIC_API_KEY=… npm run golden:curriculum -- <contents.pdf> [golden.json]");
    process.exit(2);
  }
  const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as Golden;
  const tagFile = (f: string) => (JSON.parse(readFileSync(path.join("content", "tags", f), "utf8")) as { tags: { key: string; label_vi: string }[] }).tags;
  const ctx: TocContext = {
    tags: ["tags_B.json", "reading_B.json", "listening_B.json"].flatMap(tagFile).map((t) => ({ key: t.key, label: t.label_vi, domain: null, group: null, custom: false })),
  };
  const model = studioModel();
  const call = buildTocCall({
    model, toolChoice: "tool", prompt: loadPrompt(CURRICULUM_PROMPT.file), ctx, book: { title: "Destination C1 & C2 Grammar and Vocabulary", levelNote: "C1–C2" },
    doc: { kind: "pdf", title: TOC_DOC_TITLE, base64: readFileSync(pdfPath).toString("base64") },
  });
  const r = await postToolCall(call, { apiKey: key });
  const draft = normalizeToc(aiTocSchema.parse(r.input), ctx);
  const report = compareGolden(draft, golden);
  console.log(JSON.stringify({ prompt: CURRICULUM_PROMPT.version, model, cost_usd: estimateCostUsd(model, r.usage.inputTokens, r.usage.outputTokens), needs_review: draft.units.filter((u) => u.needs_review).length, ...report }, null, 2));
  process.exit(report.ok ? 0 : 1);
}
main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

`package.json`:

```diff
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -24,5 +24,7 @@
     "gen:config": "tsx scripts/gen-config-sql.ts",
     "doctor": "tsx --env-file-if-exists=.env.local scripts/doctor.ts",
-    "storage:orphans": "tsx --env-file-if-exists=.env.local scripts/storage-orphans.ts"
+    "storage:orphans": "tsx --env-file-if-exists=.env.local scripts/storage-orphans.ts",
+    "report:curriculum-ai": "tsx --env-file-if-exists=.env.local scripts/curriculum-ai-report.ts",
+    "golden:curriculum": "tsx --env-file-if-exists=.env.local scripts/golden-curriculum.ts"
   },
   "dependencies": {
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/curriculumReport.test.ts` → PASS; `npm run typecheck && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum/report.ts scripts/curriculum-ai-report.ts scripts/golden-curriculum.ts tests/unit/curriculumReport.test.ts package.json
git commit -m "feat(w2): AI usage report for PROGRESS and a golden-set runner for curriculum-toc

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 12: E2E đường chính (CI, `AI_FAKE=1`)

**Files:**
- Create: `tests/e2e/curriculum.spec.ts`

Đường chính: phụ huynh bật AI → gia sư Nguyên thêm Destination + PDF → AI (giả) ra 26 Unit, "Còn 8 dòng", Duyệt tắt, gia sư không thấy chi phí → "Đã xem" hết → Duyệt → bảng nối 26 dòng, `ai_runs` có `curriculum_toc` + `curriculum-toc.v1` → đặt U1 Đã học, U2 Đang học → "đang học đến" U2 → Ghi buổi chọn U3 → đề xuất → bấm → sự kiện có `lesson_note_id` → nhãn nghe chọn được trong tab Nghe → phụ huynh thấy chi phí, API duyệt trả 403 → con mở trang Giáo trình = 404.

- [ ] **Step 1: Write the spec**

`tests/e2e/curriculum.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { curriculumCopy } from "@/lib/copy/vi";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { LEARNER_IDS, loginAs } from "./helpers";

// W2 · Giáo trình end to end on the TEST family with AI_FAKE=1 (CI): the fake answer is tests/fixtures/curriculum/fake-toc.json
// (Destination C1&C2, 26 units, 8 rows "cần xem"). Serial: each step builds on the previous one.
test.describe.configure({ mode: "serial" });
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL for the read-only checks");

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const NGUYEN = LEARNER_IDS.nguyen;
async function q<R extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<R[]> {
  const db = new Client(pgConfigFromUrl(process.env.DATABASE_URL as string));
  await db.connect();
  try {
    return (await db.query<R>(sql, params)).rows;
  } finally {
    await db.end();
  }
}
let versionUrl = "";
let curriculumId = "";

test("AI is on for the test family (parent)", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/settings/ai");
  if (await page.getByTestId("ai-enable").isVisible()) await page.getByTestId("ai-enable").click();
  await expect(page.getByTestId("ai-disable")).toBeVisible();
});

test("Nguyên's tutor adds Destination, the AI draft has 26 units with 8 to look at, Duyệt is blocked until they are resolved", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.getByTestId(`curricula-link-${NGUYEN}`).click();
  await page.getByTestId("add-curriculum-title").fill("Destination C1&C2 (e2e)");
  await page.getByTestId("add-curriculum-level").fill("C1–C2");
  await page.getByTestId("add-curriculum-file").setInputFiles({ name: "contents.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByTestId("add-curriculum-ai").click();
  await expect(page).toHaveURL(/\/curricula\/versions\/[0-9a-f-]{36}$/);
  versionUrl = page.url();
  await expect(page.getByTestId("curriculum-version")).toHaveAttribute("data-status", "draft", { timeout: 30_000 });
  await expect(page.getByTestId("review-left")).toHaveText(curriculumCopy.barLeft(8));
  await expect(page.getByTestId("review-approve")).toBeDisabled();
  await expect(page.getByTestId("version-ai-cost")).toHaveCount(0); // a tutor never sees AI cost
  const seen = page.locator('[data-testid$="-seen"]');
  while ((await seen.count()) > 0) await seen.first().click();
  await expect(page.getByTestId("review-left")).toHaveText(curriculumCopy.barLeft(0));
  await page.getByTestId("review-quality-ok").click();
  await page.getByTestId("review-approve").click();
  await expect(page.getByTestId("version-approved")).toBeVisible();
  await expect(page.getByTestId("curriculum-map-table").locator("tbody tr")).toHaveCount(26);
  const runs = await q<{ purpose: string; prompt_version: string }>(
    "select purpose, prompt_version from english.ai_runs where draft_id = $1::uuid and status = 'ok'", [versionUrl.split("/").pop()]);
  expect(runs).toEqual([{ purpose: "curriculum_toc", prompt_version: "curriculum-toc.v1" }]);
});

test("unit statuses drive 'đang học đến'; the session note offers the units and proposes 'Đang học' (tutor clicks)", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.goto(`/learners/${NGUYEN}/curricula`);
  curriculumId = (await q<{ id: string }>("select id from english.curricula where learner_id = $1 and title = 'Destination C1&C2 (e2e)' order by created_at desc limit 1", [NGUYEN]))[0]!.id;
  await expect(page.getByTestId(`curriculum-current-${curriculumId}`)).toContainText(curriculumCopy.notStarted);
  await page.getByTestId(`curriculum-units-${curriculumId}`).click();
  await page.getByTestId("unit-U1-done").click();
  await page.getByTestId("unit-U2-in_progress").click();
  await expect(page.getByTestId("units-current")).toHaveText(curriculumCopy.currentLine("U2", "Thinking and learning"));
  await page.goto(`/learners/${NGUYEN}/notes/new`);
  await page.getByTestId(`taught-${curriculumId}-U3`).click();
  await page.getByTestId("session-save").click();
  await expect(page.getByTestId("session-saved")).toBeVisible();
  await page.getByTestId("propose-U3").click();
  await expect(page.getByTestId("unit-proposal")).toContainText(curriculumCopy.proposeDone("U3"));
  const ev = await q<{ status: string; has_note: boolean }>(
    "select status, lesson_note_id is not null as has_note from english.curriculum_unit_events where curriculum_id = $1 and unit_code = 'U3'", [curriculumId]);
  expect(ev).toEqual([{ status: "in_progress", has_note: true }]);
});

test("listening question-type tags can be picked in the session note", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.goto(`/learners/${NGUYEN}/notes/new`);
  await page.getByTestId("tab-session-tags-listening").click();
  await expect(page.getByTestId("panel-session-tags-listening")).toContainText("Nghe · Main idea — Ý chính");
});

test("the parent sees the map and the AI cost but cannot approve; the student cannot open the page", async ({ page, browser }) => {
  await loginAs(page, "parent");
  await page.goto(versionUrl);
  await expect(page.getByTestId("version-ai-cost")).toBeVisible();
  const res = await page.request.post(`/api/curricula/versions/${versionUrl.split("/").pop()}/approve`, { data: { base_updated_at: "2026-11-08 00:00:00+00", quality: null, quality_note: null } });
  expect(res.status()).toBe(403);
  const child = await (await browser.newContext()).newPage();
  await loginAs(child, "studentNguyen");
  const r = await child.goto(`/learners/${NGUYEN}/curricula`);
  expect(r?.status()).toBe(404);
});
```

- [ ] **Step 2: Run** `npm run test:e2e -- tests/e2e/curriculum.spec.ts --list` (máy không có Docker) → liệt kê 5 test; chạy thật trong CI (job "E2E smoke").

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/curriculum.spec.ts
git commit -m "test(w2): e2e — contents read by the (fake) AI, review, approve, unit status, session note proposal, rights

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 13: Tài liệu + chạy đủ

**Files:** Modify `docs/PROGRESS.md`, `docs/DESIGN.md`, `CLAUDE.md`, `docs/UX_COPY_GUIDE.md`.

- [ ] **Step 1: `docs/PROGRESS.md`** — thêm cuối file:

```markdown
## W2 · Giáo trình (08/11/2026)

**Trạng thái:** code trên nhánh `feature/w2-curriculum` (dựa trên `feature/w1-notes-feedback`), chờ CI + review Opus + phụ huynh duyệt PR.

**SQL cần phụ huynh áp (theo thứ tự, TRƯỚC khi thử preview hoặc gộp): `0025_workdesk_w1.sql` rồi `0026_curriculum.sql`** (chỉ thêm; 0026 cần 0025). Chưa áp 0026: Ghi buổi vẫn chạy như cũ (không có ô "Unit đã dạy"); trang Giáo trình báo lỗi tải.

### Đã làm
| Việc | Ở đâu |
|---|---|
| 6 bảng: `curricula` (của một em, không có `kind`), `curriculum_versions` (nháp → đã duyệt → thay bằng bản mới; đã duyệt bất biến), `curriculum_units` + `curriculum_unit_points` (sinh lúc Duyệt; mỗi dòng nối = 1 nhãn trong danh sách đóng), `curriculum_unit_events` (chỉ thêm), `lesson_note_units` | `0026` mục 2–3 |
| Thêm giáo trình / Nạp mục lục (PDF) / Soạn tay / Sửa = bản mới / Bỏ nháp: gia sư hoặc phụ huynh. **Duyệt: chỉ thầy/cô của em** (D-W8) | `0026` mục 4, `lib/curriculum/handlers.ts` |
| AI đọc mục lục: `prompts/curriculum-toc.v1.md`, tool bắt buộc, code kiểm (số Unit liền mạch, mã trùng, điểm ngoài danh sách → "cần xem"), trần $10, `ai_runs` purpose `curriculum_toc` | `lib/curriculum/{tocTool,extract,normalize,validate}.ts` |
| Màn duyệt rộng: dòng cần xem lên đầu, thanh dính đáy "Còn n dòng cần xử lý · Duyệt", lý do sửa/bỏ (không bắt buộc), Tốt/Tạm/Phải sửa nhiều | `/curricula/versions/[id]` |
| "Đang học đến" + độ phủ (đúng 3 ví dụ DOMAIN §5.1), trạng thái Unit | `lib/curriculum/progress.ts`, `/learners/[id]/curricula`, `/learners/[id]/curricula/[curriculumId]` |
| Ghi buổi: "Unit đã dạy hôm nay" → đề xuất "Đang học" (thầy/cô bấm) | `SessionNoteForm`, `eng_write_lesson_note_v3` |
| 13 nhãn dạng câu nghe (B 8 · A 5) mang nhóm mảng Nghe (R7) | `content/tags/listening_*.json`, `0026` mục 6 |
| Xóa dữ liệu một em gồm 6 bảng mới | `0026` mục 8 |

### Cách thử trên preview (gia đình thử, AI bật ở Cài đặt AI)
1. Đăng nhập gia sư Nguyên → thẻ Nguyên (thử) → **Giáo trình** → Thêm giáo trình: "Destination C1 & C2", ghi chú cấp "C1–C2", chọn PDF trang mục lục → **Cho AI đọc mục lục**.
2. Chờ 1–2 phút → màn duyệt: kỳ vọng 26 Unit đúng thứ tự, mục "Cần xem" ở trên, nút Duyệt tắt. Sửa / "Đã xem" / "Tạo nhãn riêng" (vd "Thì hiện tại" → nhóm "Thì") cho từng dòng → Duyệt.
3. "Cập nhật trạng thái Unit": U1–U12 Đã học, U3 Bỏ qua, U13 Đang học → thẻ hiện "Đang học đến U13", "Đã học 11/25 Unit · 44 %".
4. Ghi buổi học → chọn U14 → Lưu → bấm "Đặt U14 là “Đang học”".
5. Đăng nhập phụ huynh → mở bảng nối: thấy chi phí AI, không có nút Duyệt; "Sửa mục lục / bảng nối" tạo bản 2.
6. Đăng nhập Nguyên (thử): không có gì mới; `/learners/<id>/curricula` = 404.

### Thử AI bằng dùng thật (spec §8)
Lần đầu gia sư nạp mục lục thật = lần thử. Sau khi duyệt: `npm run report:curriculum-ai` → dán bảng vào đây. Phải sửa > 20 % dòng → **dừng**, chỉnh công thức (v2) và chạy `npm run golden:curriculum -- <pdf>` trước khi nạp quyển tiếp theo.

| Giáo trình | Bản | Duyệt ngày | Lần gọi AI | Token vào / ra | Chi phí | Dòng AI | Phải sửa | Đánh giá | Kết luận |
|---|---|---|---|---|---|---|---|---|---|
| (chờ lần dùng thật) | | | | | | | | | |

### Giả định chờ phụ huynh
G1–G14 ở đầu `docs/superpowers/plans/2026-11-08-w2-curriculum.md`.

### Tiêu chí đạt (spec §6 W2)
- [ ] PDF mục lục Destination → AI ra 26 Unit đúng thứ tự (bộ đề chuẩn), gia sư duyệt
- [ ] Nối Unit → nhãn chỉ trong danh sách đóng
- [ ] "Đang học đến" đúng 3 ví dụ DOMAIN §5.1
- [ ] Sửa sau duyệt tạo v2; bằng chứng cũ không đổi
- [ ] Nhãn nghe chọn được trong ô chọn
```

- [ ] **Step 2: `docs/DESIGN.md`** — thêm sau §19.12:

```markdown
### 19.13. Giáo trình (W2, migration 0026)

- **Bảng mới:** `curricula` (một quyển / nguồn của MỘT em; không có `kind`; `level_note`; bất biến), `curriculum_versions` (payload nháp + `ai_payload` bản AI để đếm % sửa; `extracting → draft | ai_failed → approved → superseded`, `discarded`; một nháp mở và một bản đang dùng mỗi giáo trình; trigger `eng_guard_curriculum_version`), `curriculum_units` + `curriculum_unit_points` (chỉ sinh trong `eng_approve_curriculum_version`, mã Unit ổn định, mỗi dòng nối = 1 `error_tags.key` của track / gia đình), `curriculum_unit_events` (chỉ thêm; theo giáo trình + mã Unit, không theo phiên bản), `lesson_note_units` (Unit đã dạy của một buổi, trỏ tới Unit của bản đang dùng lúc ghi). `files.kind` thêm `curriculum_toc` (chỉ PDF). `ai_runs.purpose` thêm `curriculum_toc`.
- **Ai đọc gì:** mọi bảng mới: phụ huynh và gia sư **của em đó** (`eng_is_staff_of`); học sinh không. Chi phí AI chỉ phụ huynh thấy.
- **Hàm (service_role sau `requireAccess`, tự kiểm lại người thao tác):** `eng_create_curriculum`, `eng_add_curriculum_version`, `eng_edit_curriculum`, `eng_save_curriculum_draft`, `eng_finish_curriculum_extraction`, `eng_fail_curriculum_extraction`, `eng_discard_curriculum_draft` (gia sư hoặc phụ huynh), `eng_approve_curriculum_version` (**chỉ gia sư của em**, D-W8), `eng_set_unit_status`, `eng_write_lesson_note_v3` (= v2 + Unit; v1/v2 không đổi). `eng_ai_gate` / `eng_log_ai_run` thêm tham số cuối `p_purpose` (mặc định `studio_extract`). `eng_skill_map` đặt nhãn có sẵn mang `group_key` (nhãn nghe `nghe-…`, R7) vào nhóm.
- **Dẫn xuất:** "đang học đến", độ phủ tính trong `lib/curriculum/progress.ts` từ sự kiện mỗi lần đọc (DOMAIN §5.1); không lưu.
- **AI:** `prompts/curriculum-toc.v1.md`, tool `save_curriculum_toc` (điểm = enum danh sách đóng), tối đa 3 lần, mỗi lần giữ chỗ giá xấu nhất rồi ghi sổ; chỉ gửi PDF mục lục + tên sách + ghi chú cấp + danh sách nhãn. `AI_FAKE=1` → `tests/fixtures/curriculum/fake-toc.json` (fixture theo tên tool). Bộ đề chuẩn: `tests/fixtures/curriculum/destination-c1c2.golden.json`, `npm run golden:curriculum`.
- **Xóa dữ liệu một em:** thêm 6 bảng; khóa mới của biên nhận ở object `jsonb_build_object` thứ hai (giới hạn 100 tham số).
- **App:** `lib/curriculum/*`, API `app/api/learners/[id]/curricula/**`, `app/api/curricula/**`; màn `/learners/[id]/curricula`, `/learners/[id]/curricula/[curriculumId]`, `/curricula/versions/[id]`; Ghi buổi có "Unit đã dạy hôm nay".
```

- [ ] **Step 3: `CLAUDE.md`** — Current status: thêm dòng sau dòng W1:

```markdown
- **W2 (Giáo trình) — code trên nhánh `feature/w2-curriculum`** (dựa trên `feature/w1-notes-feedback`), chờ CI + review Opus + phụ huynh duyệt PR; **áp `0025_workdesk_w1.sql` rồi `0026_curriculum.sql` TRƯỚC khi thử preview hoặc gộp** (chỉ thêm): giáo trình của từng em, AI đọc PDF mục lục (`curriculum-toc.v1`) → thầy/cô duyệt Unit + bảng nối (danh sách đóng; phụ huynh chỉ được bỏ nháp), bản đã duyệt bất biến (sửa = bản mới), "đang học đến" + độ phủ, Ghi buổi chọn Unit đã dạy + đề xuất "Đang học", 13 nhãn dạng câu nghe (R7). Kế hoạch `docs/superpowers/plans/2026-11-08-w2-curriculum.md`.
```

và đổi "(số kế tiếp, **hiện là 0026** vì …)" thành "(số kế tiếp, **hiện là 0027** vì … 0025 là W1 ghi chú dạy học + góp ý về app và 0026 là W2 giáo trình)".

- [ ] **Step 4: `docs/UX_COPY_GUIDE.md`** — thêm mục "W2 · Giáo trình": liệt kê nhóm khóa `curriculumCopy` (trang Giáo trình, màn duyệt, trạng thái Unit, Ghi buổi) và `curriculumErrors`; luật: người dạy = `tutorHonorific`; "%" độ phủ chỉ ở màn người lớn; không chữ "TOMO".

- [ ] **Step 5: Run everything**

Run: `npm run typecheck && npm run lint && npm test` (Postgres local: unit + DB) và `npm run gen:config` (không có nội dung cấu hình mới → xanh).
Expected: tất cả xanh (bản thử trước kế hoạch: 130 file / 1712 test trên nền W1 đã gộp main).

- [ ] **Step 6: Commit**

```bash
git add docs/PROGRESS.md docs/DESIGN.md CLAUDE.md docs/UX_COPY_GUIDE.md
git commit -m "docs(w2): progress (SQL 0025 then 0026), design 19.13, status, copy guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 14: Review Opus + PR

- [ ] **Step 1: Review** bằng agent `reviewer` trên `git diff origin/feature/w1-notes-feedback...HEAD`, đối chiếu DOMAIN §2 (quyền: duyệt chỉ gia sư; phụ huynh chỉ bỏ), §4 (bản đã duyệt bất biến; bằng chứng lưu khóa nhãn), §5.1, §7 (2, 5, 7, 8, 9, 10), §8 (gia sư nghỉ không bỏ / duyệt được; sửa nhầm = sự kiện mới; Unit trùng tên → mã), §9.2, spec §5 (AI, dữ liệu, giao diện máy tính). Sửa mọi lỗi cao / trung bình, chạy lại Step 5 của Task 13, commit `fix(w2): review findings`.
- [ ] **Step 2: Push + PR**

```bash
git push -u origin feature/w2-curriculum
gh pr create --base feature/w1-notes-feedback --head feature/w2-curriculum --title "W2 · Giáo trình: đọc mục lục, duyệt Unit + bảng nối, đang học đến, Unit đã dạy" --body-file /tmp/w2-pr.md
```

`/tmp/w2-pr.md` (tiếng Việt, 4 mục): **Làm gì** (tóm tắt mục "Đã làm" của PROGRESS) · **Cách thử trên preview** (6 bước của PROGRESS) · **SQL cần phụ huynh áp: `0025` rồi `0026`** (Actions → Apply database migrations, hoặc SQL Editor theo thứ tự) · **Tiêu chí đạt / chưa** (5 dòng spec §6 W2 + "Thử AI bằng dùng thật": chưa — chờ lần nạp mục lục thật) · **Giả định chờ phụ huynh** G1–G14 · cuối body:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1
```

Không gộp. Sau khi phụ huynh áp SQL: chạy E2E trên CI, rồi buổi gia sư thử preview (nạp mục lục thật = lần thử AI, spec §8).

---

## Self-review (writing-plans)

- **Spec coverage (spec §4 W2, §6 W2; DOMAIN):** bảng `curricula` không `kind` + `level_note` → T1 · phiên bản nháp→duyệt→thay, đã duyệt bất biến, sửa = bản mới → T1 (guard) + T2 (`eng_edit_curriculum`, test "edit after approval") · mã Unit ổn định, Unit bỏ ở v2 còn lịch sử → T2 test + T5 ví dụ 3 · nối Unit → đúng 1 nhãn, danh sách đóng → T2 (`unknown_point`), T5 (normalize/validate), T6 (enum trong tool) · sự kiện Unit chỉ thêm → T1/T2 · "đang học đến" + độ phủ, đúng 3 ví dụ §5.1 → T5 · Ghi buổi chọn Unit + đề xuất "Đang học" (gia sư bấm) → T4 (v3), T10 · `files.kind curriculum_toc` → T1/T6 · nhãn nghe R7 có `group_key` mảng Nghe, chọn được trong ô chọn → T3 + E2E · purge → T4 · RLS `eng_is_staff_of`, ghi qua `security definer`, tạo/tải = gia sư hoặc phụ huynh, duyệt = chỉ gia sư (D-W8), phụ huynh bỏ được → T1/T2/T7 + DB/unit/E2E test · AI: công thức, tool bắt buộc, code kiểm, "cần xem" chặn Duyệt, màn rộng + thanh dính đáy, Sửa/Bỏ có lý do tùy chọn, Tốt/Tạm/Phải sửa nhiều, "Soạn tay", trần, `AI_FAKE`, `ai_runs.prompt_version` → T2/T6/T9 · ghi chi phí + % sửa lần dùng thật → T9 (màn), T11 (script) , T13 (PROGRESS) · bộ đề chuẩn Destination 26 Unit → T5 fixture + T11 script · chữ trong `vi.ts` + `tutorHonorific` → T8 · tài liệu (PROGRESS "0025 rồi 0026", DESIGN §19.13, CLAUDE.md, migration kế tiếp 0027) → T13 · review Opus + PR base W1 → T14. Không có yêu cầu nào thiếu task; "lưu trữ giáo trình" và "3 bước Câu hỏi cho cô" ghi rõ là giả định G2, G11.
- **Placeholder scan:** không có TBD/TODO; mọi bước code có code đầy đủ; purge là script xác định chép từ 0025 + 4 đoạn chèn có sẵn (vì W1 có thể còn sửa 0025 sau review). Bảng "Thử AI bằng dùng thật" trong PROGRESS để trống có chủ đích — số liệu chỉ có sau lần dùng thật.
- **Type consistency:** `TaughtUnit` / `taughtUnitsSchema` (T5) dùng ở T10; `VersionPageData` có `track_id` (T7) dùng ở trang T9; `RunLog.draftId` = id phiên bản (T6/T7); `CurriculumStore.aiReserve({versionId})` khớp `TocExtractStore.reserve`; tên hàm SQL và tham số `p_*` trong `supabaseStore.ts` khớp mục 4/5/7 của migration; testid trong E2E khớp component (`add-curriculum-*`, `review-*`, `unit-<code>-<status>`, `taught-<cid>-<code>`, `propose-<code>`, `tab-session-tags-listening`).
- **Đã chạy thật:** toàn bộ nội dung trên đã được dựng trên nhánh W1 (đã gộp main, PR #23) và chạy: 130 file / 1712 test xanh, typecheck + lint xanh, E2E `--list` 5 test.
