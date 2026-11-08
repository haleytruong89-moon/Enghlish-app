# Khung bàn làm việc (tutor workdesk shell) — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang người lớn (gia sư + phụ huynh) trông và đi lại giống bản bấm thử đã thống nhất: thanh trên + **cột trái cố định** (Bàn làm việc · Hồ sơ học sinh · Bản đồ kiến thức · Lộ trình · Buổi học · Giao bài · Giáo trình · Chờ duyệt · Góp ý về app), trang **Bàn làm việc** thay trang chủ cũ, trang **Chờ duyệt** dạng bảng gọn có lọc. Chỉ dùng trang và dữ liệu đã có (S0–S7a, Studio B1, W0–W2). Không SQL, không API mới, không AI. Màn của con không đổi.

**Architecture:** Mô hình cột trái là **dữ liệu thuần** (`lib/shell/nav.ts` + `lib/shell/paths.ts`, test đơn vị, không rẽ nhánh theo track). Một component server `StaffShell` (thanh trên + `SidebarNav` client tô sáng mục đang mở theo `usePathname`). Mọi trang `/learners/[id]/**` nhận khung qua **một layout** `app/learners/[id]/layout.tsx` (nên trang W3 sau này tự có khung); 9 trang người lớn ngoài nhánh đó tự bọc `StaffShell`. Bàn làm việc và Chờ duyệt ghép các loader có sẵn qua `lib/desk/` (hàm thuần `buildPendingRows`, `deskAlerts` + loader server mềm: một nguồn lỗi không làm sập trang).

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Vitest (unit) · Playwright (CI, Supabase local).

**Spec:** `docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md` (§3 màn hình, §5 "Quy tắc giao diện cho máy tính" 1–8, điện thoại 390 px, ô bấm ≥ 44 px) · bản bấm thử `/home/claude/mockups/workdesk/index.html` (khung `.shell/.side`, `R.desk`, `R.inbox` `.ib`, `alerts(pg)`) · `docs/DOMAIN.md` (R1: một hộp xác nhận; không duyệt bằng một cú bấm) · `docs/UX_COPY_GUIDE.md` · `CLAUDE.md`.

## Global Constraints

- **SQL cần áp: không có.** Không tạo file trong `db/migrations/`. Không đụng schema `public`. Không `supabase db push`.
- **Không route API mới.** Chỉ đọc qua loader đã có (`loadHome`, `loadToday`, `loadInbox`, `loadStudioPending`, `loadSkillInbox`, `loadDraftList`, `loadCurriculumCards`, `loadIntake`, `loadLevelProfile`, `loadRecentLevelChanges`, `loadAiSettings`, `revisionsAvailable`).
- **Quyền không đổi:** mỗi trang giữ cổng của nó (`requireLearnerPage` / `authorizeLearnerPage` / `authorizeStaffPage`). Loader dùng admin client (`loadDraftList`, `loadLevelProfile`) chỉ gọi **sau** cổng của đúng em. Học sinh và người ngoài phạm vi → 404 trơn (không 403, không lộ tên em).
- **Màn của con không đổi:** nhánh học sinh trong `app/page.tsx`, `app/practice`, `app/activities/[id]`, `components/student/**`, `app/account/password` giữ nguyên; không import `@/components/shell`.
- **Không duyệt một cú bấm:** bảng Chờ duyệt và Bàn làm việc chỉ có **liên kết "Mở"** sang trang chi tiết đã có; không nút Duyệt/Xác nhận/Đúng/Sai trong bảng.
- Mọi chữ giao diện trong `lib/copy/vi.ts`; người dạy gọi bằng `tutorHonorific` ("thầy/cô"), không viết cứng "cô". Không chữ có dạng điểm ở chỗ con thấy (con không thấy gì mới).
- **Track là cấu hình:** không `if (track === 'A')` (lint chặn). Mô hình cột trái giống nhau cho mọi em; chỉ khác `learnerId`.
- Giao diện: cột trái 220 px, cố định khi cuộn (`md:sticky md:top-0 md:h-dvh`); nội dung tối đa `max-w-[1240px]`; điện thoại 390 px không cuộn ngang; ô bấm `min-h-11` (44 px); thứ tự Bàn làm việc: tiêu đề + nút "Ghi buổi học hôm nay" (phải) → Chờ duyệt → Cần chú ý → 3 khung.
- Code, comment, commit: tiếng Anh. Mỗi task commit riêng; trailer:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1`.
- Nhánh: `feature/workdesk-shell` từ `origin/main` **sau khi PR #26 (W2) gộp**; trước W3. `npm run typecheck && npm run lint && npm test` xanh trước khi mở PR; review Opus (`reviewer`) bắt buộc; `npm run test:e2e -- --list` liệt kê test mới (chạy đủ trong CI job "E2E smoke").
- Phân vai model: mỗi task ghi model. `builder` (Sonnet) sai 2 lần cùng chỗ → dừng, chuyển Opus. `chore` (Haiku) chỉ làm Task 6 (sửa cơ học có test canh).

---

## Assumptions (chờ phụ huynh)

Mỗi mục: chỗ bản bấm thử / spec / yêu cầu lát không khớp hoặc thiếu, và **đề xuất** của plan. Builder làm theo đề xuất; phụ huynh đổi được trước khi gộp (đa số chỉ đổi 1 dòng cấu hình hoặc 1 chữ).

- **K1 — Tên mục đầu: "Bàn làm việc" (đề xuất) hay "Hôm nay".** Bản bấm thử và spec §3 gọi màn là "Bàn làm việc"; yêu cầu lát gọi "Hôm nay". Đề xuất: cột trái và tiêu đề `Bàn làm việc · {tên em}`; dòng phụ `{tên} · Track … · Hôm nay · {ngày}` (giữ chữ "Hôm nay"). Đổi = sửa `shellCopy.sections.desk` + `deskCopy.title`.
- **K2 — Mục của lát sau: hiện mờ "Sắp có" (đề xuất) hay ẩn.** "Bản đồ kiến thức" (W3) và "Lộ trình" (W5) hiện trong cột trái, **không bấm được**, có nhãn nhỏ "Sắp có" (không có link chết, không 404) — để gia sư thấy đúng bố cục đã xem trong bản bấm thử. "Tổng hợp góp ý" (W6, chỉ phụ huynh) **ẩn** tới W6. Đổi = sửa `status` trong `SECTIONS` (`lib/shell/nav.ts`); W3 đổi `knowledge` thành `"live"`.
- **K3 — "Buổi học & bài giao" (bản bấm thử: 1 mục) tách thành 2 mục "Buổi học" và "Giao bài" (đề xuất).** Spec §3 có 2 dòng (Lịch/Buổi học · Giao bài) và yêu cầu lát liệt kê 2 mục; bản bấm thử gộp 1 trang có lịch tuần. App **chưa có dữ liệu lịch** (K8), nên lát này trỏ thẳng 2 trang đã có: "Buổi học" → `/learners/[id]/notes` (con: Ghi buổi học, Ghi chú buổi học), "Giao bài" → `/learners/[id]/assign` (con: Giao bài luyện, Tạo bài từ đề, Bài chủ đề trong app, Ghi kết quả bài). Gộp thành một trang "Buổi học & bài giao" khi có lịch.
- **K4 — Chọn em ở thanh trên (như bản bấm thử), không ở cột trái.** Yêu cầu lát ghi "learner switcher trong sidebar"; bản bấm thử đặt các nút "Nguyên · lớp 9 / An · lớp 6" ở thanh trên. Đề xuất theo bản bấm thử: trên điện thoại vẫn thấy mà không phải mở menu. Chỉ hiện khi người đó có > 1 em (phụ huynh); gia sư 1 em thấy tên em (không nút). Bấm đổi em giữ nguyên phần đang mở (vd. đang ở "Điểm cần chú ý" của An → sang "Điểm cần chú ý" của Nguyên).
- **K5 — Trang con hiện thụt vào dưới mục đang mở.** Bản bấm thử cột trái phẳng; nhưng thẻ học sinh cũ có ~10 liên kết nhỏ (Điểm cần chú ý, Kỹ năng đang theo dõi, Nhập kỹ năng đọc tháng, Bài đã sửa…). Bỏ thẻ cũ thì các trang đó mất lối vào. Đề xuất: mục đang mở hiện danh sách trang con (chỉ mục đang mở, để cột trái không dài quá ở 1366×768). Không trang cũ nào mất lối vào.
- **K6 — Chưa có con số (badge) trên "Chờ duyệt" ở cột trái.** Đếm đủ cần chạy 5 nguồn (bài làm, Cần thầy/cô xem — có ghi lại kết quả tự động —, kỹ năng, nháp đề, nháp giáo trình) ở **mọi trang**. Đề xuất: số chỉ hiện ở Bàn làm việc ("Chờ duyệt · n") và trên các nút lọc của trang Chờ duyệt. Thêm số ở cột trái khi W4 gom "Chờ duyệt mọi cách nộp" bằng một hàm đếm SQL.
- **K7 — 3 khung ở Bàn làm việc:** bản bấm thử là Hồ sơ · Lộ trình · Hôm nay & tiếp theo. Lộ trình chưa có (W5) → khung giữa tạm là **Giáo trình** (Đang học đến + độ phủ, W2). Khung Hồ sơ = câu tóm tắt + Mạnh nhất / Cần tập trung (SM-2) + 3 điểm cần chú ý đầu; bảng 7 mảng đầy đủ ở trang Hồ sơ học sinh.
- **K8 — Lịch buổi học (buổi hôm nay / buổi sau, giờ, tuần này) chưa có ở lát nào W1–W6.** W6 có "kế hoạch buổi sau" (AI) nhưng không có bảng lịch. Lát này chỉ hiện "Buổi gần nhất" + nút "Ghi buổi học hôm nay" luôn có; dòng "Lịch buổi học chưa có trong app". **Phụ huynh cần chọn**: thêm bảng lịch nhỏ (thứ + giờ mỗi em) vào W5 hay W6, hay giữ không lịch.
- **K9 — Phụ huynh xem từng em một** (như bản bấm thử) thay vì 2 thẻ trên một trang như cũ; mặc định em đầu theo thứ tự cũ (Track A trước → An). "Thay đổi cấp gần đây" (cả 2 em) và hộp chi phí AI vẫn ở Bàn làm việc của phụ huynh, dưới 3 khung. Nhóm "Phụ huynh" ở cột trái: Cài đặt AI · Xóa dữ liệu của em.
- **K10 — Chờ duyệt theo từng em ở `/learners/[id]/inbox` (mới); Hộp duyệt cũ giữ nguyên.** `/review` (Bài làm), `/review/skills` (Kỹ năng), `/review/studio` (Cần thầy/cô xem) vẫn là nơi **duyệt thật** và là trang con của "Chờ duyệt"; link cũ vẫn chạy. Bảng mới chỉ liệt kê + "Mở". Lưu ý: tab Kỹ năng đã có nút "Xác nhận tất cả" từ S7a (spec S7a §4, chỉ cho đề xuất lên bậc); spec bàn làm việc §3 nói "không duyệt một cú bấm" cho **nháp AI**. Lát này không đổi nút đó; nếu phụ huynh muốn bỏ khi W3 đưa đề xuất mức điểm vào cùng tab (R1) → quyết ở W3.
- **K11 — Nháp giáo trình trong Chờ duyệt không có "Từ ngày"** (loader W2 không đọc ngày của bản nháp; lát này không sửa W2) → hiện "—", xếp cuối. Thêm ngày khi một lát sau đụng loader giáo trình.
- **K12 — Giữ liên kết "Về trang chủ" trên các trang cũ** trong lát này (vô hại; cột trái đã thay việc đó). Dọn ở lát dọn dẹp sau.
- **K13 — Trang Đổi mật khẩu giữ nguyên** (dùng chung với con; không khung).
- **K14 — Chữ cuối cột trái:** bản bấm thử ghi "Mọi thứ AI soạn là nháp: chưa duyệt thì con **và phụ huynh** chưa thấy" — sai với app hiện tại (phụ huynh xem được nháp Studio/giáo trình). Đề xuất: "Mọi thứ AI soạn là nháp: chưa duyệt thì con chưa thấy."
- **K15 — Trang không thuộc một em** (`/review*`, `/feedback`, `/settings/ai`) lấy em từ `?learner=`; không có thì em đầu tiên. Lọc trong `/review` (link `?f=`) bỏ `?learner=` → cột trái quay về em đầu (chỉ ảnh hưởng phụ huynh; không sai dữ liệu).
- **K16 — Tên trang con "Bài chủ đề trong app"** cho `/learners/[id]/inquiries` (nhãn cũ của trang đó là "Giao bài", trùng tên mục). Phụ huynh đổi chữ được.

**Phụ huynh cần quyết trước khi gộp (ngắn):** K1 (tên), K2 (mờ hay ẩn), K3 (2 mục hay 1), K8 (lịch học thuộc lát nào), K9 (xem từng em). Phần còn lại builder làm theo đề xuất.

---

## Route → cột trái (toàn bộ `app/**/page.tsx`)

| Đường dẫn (đã có, giữ nguyên) | Ai mở được | Mục cột trái → trang con | Khung | Ghi chú |
|---|---|---|---|---|
| `/` (người lớn) | gia sư, phụ huynh | **Bàn làm việc** | `StaffShell` trong trang | thay `LearnerCard`; `?learner=` chọn em |
| `/` (học sinh) | học sinh | — | không | **không đổi** (`StudentHome`) |
| `/learners/[id]/levels` (+ `/baseline`, `/adjust`, `/external/new`) | gia sư, phụ huynh | **Hồ sơ học sinh** → Hồ sơ cấp | layout | W1 thẻ Ghi chú dạy học + Hồ sơ đầu vào đã ở đây |
| `/learners/[id]/weak` | gia sư, phụ huynh | Hồ sơ học sinh → Điểm cần chú ý | layout | |
| `/learners/[id]/targets` | gia sư, phụ huynh | Hồ sơ học sinh → Kỹ năng đang theo dõi | layout | |
| `/learners/[id]/reading/new` | gia sư, phụ huynh | Hồ sơ học sinh → Nhập kỹ năng đọc tháng | layout | |
| `/learners/[id]/knowledge` *(W3)* | — | **Bản đồ kiến thức** (Sắp có) | layout | đã đăng ký trong `paths.ts` |
| `/learners/[id]/roadmap` *(W5)* | — | **Lộ trình** (Sắp có) | layout | đã đăng ký |
| `/learners/[id]/notes/new` | gia sư, phụ huynh | **Buổi học** → Ghi buổi học | layout | |
| `/learners/[id]/notes` | gia sư, phụ huynh | Buổi học → Ghi chú buổi học | layout | mục gốc "Buổi học" |
| `/learners/[id]/assign` | gia sư, phụ huynh | **Giao bài** → Giao bài luyện | layout | mục gốc "Giao bài" |
| `/studio/new?learner=` | gia sư, phụ huynh | Giao bài → Tạo bài từ đề | `StaffShell` trong trang | |
| `/studio/drafts/[id]` | gia sư, phụ huynh của em | Giao bài → Tạo bài từ đề | `StaffShell` trong trang | em = `draft.learnerId` |
| `/learners/[id]/inquiries` | gia sư, phụ huynh | Giao bài → Bài chủ đề trong app (K16) | layout | |
| `/learners/[id]/results/new` | gia sư, phụ huynh | Giao bài → Ghi kết quả bài | layout | |
| `/learners/[id]/imports/**` *(W3)* | — | Giao bài | layout | đã đăng ký |
| `/learners/[id]/curricula`, `/learners/[id]/curricula/[curriculumId]` | gia sư, phụ huynh | **Giáo trình** | layout | |
| `/curricula/versions/[id]` | gia sư, phụ huynh của em | Giáo trình | `StaffShell` trong trang | em = `version.learnerId` |
| `/learners/[id]/inbox` **(mới)** | gia sư, phụ huynh | **Chờ duyệt** → Tất cả việc chờ | layout | bảng gọn, chỉ "Mở" |
| `/review` | gia sư, phụ huynh | Chờ duyệt → Bài làm | `StaffShell` trong trang | duyệt thật ở đây (S5) |
| `/review/[episodeId]` | gia sư, phụ huynh của em | Chờ duyệt → Bài làm | `StaffShell` trong trang | em = em của bài |
| `/review/skills` | gia sư, phụ huynh | Chờ duyệt → Kỹ năng | `StaffShell` trong trang | R1: một hộp xác nhận |
| `/review/studio` | gia sư, phụ huynh | Chờ duyệt → Cần thầy/cô xem | `StaffShell` trong trang | |
| `/learners/[id]/revisions`, `/learners/[id]/revisions/[attemptId]` | gia sư, phụ huynh | Chờ duyệt → Bài đã sửa | layout | ẩn link khi `0021` chưa áp |
| `/feedback` | gia sư, phụ huynh | **Góp ý về app** (cuối cột trái, luôn thấy) | `StaffShell` trong trang | link mang `?screen=` tên màn đang mở |
| `/settings/ai` | phụ huynh | nhóm **Phụ huynh** → Cài đặt AI | `StaffShell` trong trang | gia sư 404 (giữ) |
| `/learners/[id]/delete` | phụ huynh | nhóm Phụ huynh → Xóa dữ liệu của em | layout | gia sư 404 (giữ) |
| *Tổng hợp góp ý (W6)* | phụ huynh | ẩn (K2) | — | W6 thêm vào nhóm Phụ huynh |
| `/account/password` | mọi vai | link "Đổi mật khẩu" ở thanh trên | không (K13) | |
| `/practice`, `/activities/[id]` | học sinh | — | không | **không đổi** |
| `/login` | khách | — | không | |

## Để lát sau (bản bấm thử cần dữ liệu chưa có)

| Phần trong bản bấm thử | Cần | Lát |
|---|---|---|
| Bản đồ kiến thức (`R.map`), nút "Nạp bài đã làm" | `point_state`, `import_batches` | W3 |
| Lộ trình (`R.roadmap`, khung Lộ trình ở Bàn làm việc), nhắc "chậm 1 Unit so với lộ trình", "Kiểm tra tiến độ T11 còn 3 ngày, chưa chọn đề" | `roadmap_versions`, kiểm tra tháng | W5 |
| Bài nộp ảnh / file / trang kết quả trong Chờ duyệt (`subWriting`, `subLink`, `subFile`) | `submission_files`, `ai_feedback` | W4 |
| Số trên "Chờ duyệt" ở cột trái, "!" trên Hồ sơ / Lộ trình (K6) | một hàm đếm SQL | W4 |
| Kế hoạch buổi sau (AI), "Đã dùng ghi chú của cô", nhận xét tháng (AI), cờ "Cần đối chiếu", gợi ý bài, Tổng hợp góp ý (`R.parentfb`) | `session-plan.v1`, `monthly_comments`, `consistency_flags`, `practice-suggest.v1` | W6 |
| Buổi hôm nay / buổi sau có giờ, lịch tuần (`R.schedule`) | bảng lịch buổi học | **chưa có lát** (K8) |
| "Đánh giá lại hồ sơ định kỳ: 20/01/2027" | ngày đánh giá lại trong hồ sơ đầu vào (W1 không có) | chưa có lát — ghi vào K8 khi phụ huynh quyết |
| Dòng nhắc riêng từng trang (`alerts(pg)` — quy tắc 3) ở trang khác ngoài Bàn làm việc | dữ liệu của từng trang | mỗi lát tự thêm khi trang có dữ liệu |
| Màn duyệt rộng `.modal.wide` + thanh hành động dính đáy (quy tắc 1) cho màn duyệt mới | — | W3 (duyệt bài nạp), W4 (bài nộp); trang duyệt giáo trình (W2) và đề Studio đã rộng |
| Trang Hồ sơ học sinh theo đúng bố cục `R.profile` (bảng 7 mảng "Vào → nay", Diễn biến) | dữ liệu đã có (SM-2) — chỉ đổi giao diện | lát dọn giao diện sau, hoặc W6 cùng nhận xét tháng |

## Ảnh hưởng tới W3 (plan `origin/feature/w3-plan`)

- Trang mới của W3 `app/learners/[id]/knowledge/page.tsx` và `app/learners/[id]/imports/new/page.tsx` nằm dưới layout mới → **không** render `AppHeader`, **không** dùng `<main>` (test canh `tests/unit/shellPages.test.ts` sẽ đỏ nếu có). Bỏ `feedbackScreen` (khung tự lấy tên màn từ đường dẫn).
- W3 đổi một dòng `status: "soon"` → `"live"` của `knowledge` trong `lib/shell/nav.ts`; có thể thêm trang con `{ key: "import", label: importCopy.link, href: …/imports/new }` vào `assign` và đổi `child` của luật `/imports` trong `lib/shell/paths.ts` thành `"import"`; nếu W3 thêm `appFeedback.screens.knowledgeMap` / `importNew` thì sửa `screen` của 2 luật đó.
- Đề xuất mức điểm vào tab "Kỹ năng" (R1) tự hiện trong bảng Chờ duyệt nếu W3 gộp nó vào `loadSkillInbox`; nếu W3 dùng loader riêng `loadPointInbox` → thêm một nguồn vào `buildPendingRows` (kind `point`, nhóm `skills`).

---

## File structure

| File | Trách nhiệm |
|---|---|
| `lib/shell/nav.ts` | **Tạo.** Mô hình cột trái thuần: `SECTIONS`, `buildNav`, `learnerQuery` |
| `lib/shell/paths.ts` | **Tạo.** `activeFor(pathname)` (mục + trang con + tên màn góp ý), `switchHref`, `feedbackHref` |
| `lib/shell/shell.ts` | **Tạo.** Thuần: `ShellData`, `firstParam`, `pickLearner`, `toShell` |
| `lib/shell/load.ts` | **Tạo.** Server: `loadShell`, `requireShell` |
| `components/shell/StaffShell.tsx` | **Tạo.** Thanh trên + cột trái + vùng nội dung 1240 px |
| `components/shell/SidebarNav.tsx` | **Tạo.** Client: tô mục đang mở, trang con, nút menu điện thoại, Góp ý về app |
| `components/shell/LearnerSwitcher.tsx` | **Tạo.** Client: nút chọn em (giữ phần đang mở) |
| `components/shell/PhoneFeedbackLink.tsx` | **Tạo.** Client: "Góp ý về app" ở thanh trên trên điện thoại (cột trái đang đóng) |
| `app/learners/[id]/layout.tsx` | **Tạo.** Khung cho mọi trang của một em; học sinh / ngoài phạm vi → 404 |
| 17 trang `app/learners/[id]/**/page.tsx` | **Sửa.** Bỏ `AppHeader`, đổi `<main>` → `<div>` |
| `lib/desk/pending.ts` | **Tạo.** Thuần: `buildPendingRows`, `filterRows`, `countGroups`, `parseGroup` |
| `lib/desk/alerts.ts` | **Tạo.** Thuần: `deskAlerts` (chuyển từ `Attention` trong `LearnerCard` + cảnh báo mới) |
| `lib/desk/load.ts` | **Tạo.** Server: `loadPendingRows`, `loadDesk` (mềm) |
| `components/desk/PendingTable.tsx` | **Tạo.** Bảng gọn + lọc (chỉ link "Mở") |
| `components/desk/DeskAlerts.tsx` · `DeskInbox.tsx` · `ProfileBox.tsx` · `CurriculumBox.tsx` · `SessionsBox.tsx` · `DeskView.tsx` | **Tạo.** Các phần Bàn làm việc |
| `app/learners/[id]/inbox/page.tsx` | **Tạo.** Chờ duyệt của một em |
| `app/page.tsx` | **Sửa.** Nhánh người lớn → `StaffShell` + `DeskView`; nhánh học sinh giữ nguyên |
| `app/review/page.tsx`, `app/review/[episodeId]/page.tsx`, `app/review/skills/page.tsx`, `app/review/studio/page.tsx`, `app/studio/new/page.tsx`, `app/studio/drafts/[id]/page.tsx`, `app/curricula/versions/[id]/page.tsx`, `app/feedback/page.tsx`, `app/settings/ai/page.tsx` | **Sửa.** Bọc `StaffShell` |
| `components/review/StudioPendingCard.tsx`, `components/skills/SkillProposalCard.tsx`, `components/workdesk/IntakeCard.tsx` | **Sửa.** Thêm `id` neo (`studio-…`, `skill-…`, `intake`) + `scroll-mt-4` |
| `components/LearnerCard.tsx` | **Xóa** (nội dung chuyển sang `lib/desk/alerts.ts` + `components/desk/*`) |
| `lib/copy/vi.ts` | **Sửa.** `shellCopy`, `pendingCopy`, `deskCopy`, `appFeedback.screens.inbox` |
| `tests/unit/shellNav.test.ts`, `shellPaths.test.ts`, `shellData.test.ts`, `shellUi.test.ts`, `shellLayout.test.ts`, `shellPages.test.ts`, `deskPending.test.ts`, `deskAlerts.test.ts`, `deskLoad.test.ts`, `deskUi.test.ts`, `pendingPage.test.ts`, `homePage.test.ts`, `shellCopy.test.ts` | **Tạo.** |
| `tests/unit/tutorWorkUi.test.ts`, `revisionsPage.test.ts`, `practiceUi.test.ts`, `reviewInboxPage.test.ts` | **Sửa.** Chuyển phần `LearnerCard`; mock khung |
| `tests/e2e/shell.spec.ts` | **Tạo.** |
| `tests/e2e/roles.spec.ts`, `tutorWork.spec.ts`, `review.spec.ts`, `curriculum.spec.ts`, `studio.spec.ts`, `purge.spec.ts` | **Sửa.** Lối vào mới |
| `docs/UX_COPY_GUIDE.md`, `docs/PROGRESS.md`, `CLAUDE.md` | **Sửa.** Mục "Khung bàn làm việc"; trạng thái; "SQL cần áp: không" |

## Copy keys mới (`lib/copy/vi.ts`) — danh sách đầy đủ

- `shellCopy`: `navLabel`, `menu`, `switcherLabel`, `sections.{desk, profile, knowledge, roadmap, sessions, assign, curricula, inbox}`, `soon`, `parentGroup`, `inquiriesChild`, `inboxAll`, `aiDraftNote`.
- `appFeedback.screens.inbox` ("Chờ duyệt").
- `pendingCopy`: `title(alias)`, `intro`, `filtersLabel`, `groups.{all, work, check, ai, skills}`, `groupCount(label, n)`, `cols.{kind, content, since, need}`, `kinds.{work, studioCheck, studioDraft, curriculumDraft, skill, flag}`, `need.{studioCheck(n), studioDraft, curriculumDraft, aiFailed, skill, flag}`, `open`, `noDate`, `empty`, `emptyGroup`, `failed(what)`, `sources.{work, studio, skills, drafts, curricula}`, `more`, `fullInbox`, `deskTitle(n)`, `deskOpenAll`, `deskMore(n)`, `deskPartial`.
- `deskCopy`: `titlePrefix`, `title(alias)`, `titleEmpty`, `subtitle(learnerLine, todayLine)`, `logToday`, `seeAll`, `alerts.{missingBadge, flagBadge, intakeTitle, intakeLineTutor, intakeLineParent, curriculaTitle, curriculaLine, overdueTitle(n), overdueLine, flagsTitle(n), flagsLine}`, `profileUnavailable`, `attentionNone`, `curriculaUnavailable`, `curriculaEmpty`, `currentUnit(code, title)`, `noCurrentUnit`, `draftWaiting`, `sessionsTitle`, `sessionsUnavailable`, `practiceCounts(open, sent, late)`, `seeAssignments`, `noSchedule`.
- Dùng lại (không đổi): `todayPage.*`, `home.parentSummary`, `home.tutorEmpty`, `levelCopy.{link, strongest, focus, even}`, `weakPage.link`, `targetsPage.link`, `readingPage.link`, `sessionNotePage.link`, `notesPage.link`, `assignPage.link`, `studioCopy.navLink`, `resultPage.link`, `skillStateCopy.{tabWork, tabSkills}`, `studioInboxCopy.tab`, `revisionReviewCopy.{link, inboxLabel, inboxProgress}`, `reviewPage.{progress, waitingTutor}`, `aiSettingsCopy.navLink`, `purgePage.link`, `curriculumCopy.{screenLabel, reviewTitle}`, `app.{name, testBadge}`, `account.changePassword`, `auth.signOut`, `appFeedback.link`.

## testid

Khung: `staff-shell`, `staff-topbar`, `staff-sidebar`, `nav-menu-toggle`, `nav-<section>` (mục "Sắp có" là `<span aria-disabled="true" data-status="soon">`), `nav-<section>-<child>`, `nav-aiSettings`, `nav-delete`, `learner-switcher`, `learner-option-<id>`, `shell-learner`, `feedback-link` (cột trái, máy tính), `feedback-link-phone` (thanh trên, điện thoại), `change-password-link`.
Bàn làm việc: `today-page` (giữ), `desk-title`, `action-note-<id>`, `action-result-<id>`, `action-assign-<id>` (giữ), `desk-inbox`, `desk-inbox-open`, `desk-inbox-row-<key>`, `attention-<id>` (giữ), `desk-profile`, `desk-profile-unavailable`, `desk-curricula`, `desk-coverage-<curriculumId>`, `desk-sessions`, `last-session-<id>` (giữ), `desk-practice-counts`.
Chờ duyệt: `pending-page`, `pending-filter-<group>`, `pending-table`, `pending-row-<key>`, `pending-open-<key>`, `pending-empty`, `pending-failed-<source>`, `pending-more`.
Bỏ (cùng `LearnerCard`): `review-link`, `levels-link-<id>`, `curricula-link-<id>`, `studio-link-<id>`, `revisions-link-<id>`, `delete-link-<id>`, `practice-<id>` — e2e đang dùng được sửa ở Task 13.

---

### Task 1: Mô hình cột trái + `shellCopy`  *(builder · Sonnet)*

**Files:**
- Create: `lib/shell/nav.ts`
- Modify: `lib/copy/vi.ts` (thêm `shellCopy` ngay sau `curriculumCopy`; thêm `inbox: "Chờ duyệt"` vào `appFeedback.screens`)
- Test: `tests/unit/shellNav.test.ts`

**Interfaces:**
- Produces: `SECTION_KEYS`, `type SectionKey`, `type NavStatus = "live" | "soon"`, `type NavRole = "tutor" | "parent"`, `type NavFlags = { revisionsReady: boolean }`, `type NavLink = { key: string; label: string; href: string }`, `type NavSection = { key: SectionKey; label: string; status: NavStatus; lane: string | null; href: string | null; children: NavLink[] }`, `type NavModel = { sections: NavSection[]; parent: NavLink[] }`, `SECTIONS: readonly SectionDef[]` (với `root(learnerId)` và `children(learnerId, flags)`), `learnerQuery(id): string`, `buildNav(role: NavRole, learnerId: string | null, flags: NavFlags): NavModel`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shellNav.test.ts
import { describe, expect, it } from "vitest";
import { aiSettingsCopy, purgePage, revisionReviewCopy, shellCopy } from "@/lib/copy/vi";
import { buildNav, SECTION_KEYS } from "@/lib/shell/nav";

const NG = "b0000000-0000-4000-8000-000000000002";
const AN = "a0000000-0000-4000-8000-000000000001";
const hrefs = (n: ReturnType<typeof buildNav>) => [...n.sections.flatMap((s) => [s.href, ...s.children.map((c) => c.href)]), ...n.parent.map((p) => p.href)].filter((h): h is string => h !== null);

describe("staff sidebar model", () => {
  it("follows the prototype order with the agreed labels", () => {
    const n = buildNav("tutor", NG, { revisionsReady: true });
    expect(n.sections.map((s) => s.key)).toEqual(["desk", "profile", "knowledge", "roadmap", "sessions", "assign", "curricula", "inbox"]);
    expect(n.sections.map((s) => s.key)).toEqual([...SECTION_KEYS]);
    for (const s of n.sections) expect(s.label).toBe(shellCopy.sections[s.key]);
  });

  it("sections of later slices are 'soon': no link, no children (no dead link, no 404)", () => {
    const n = buildNav("tutor", NG, { revisionsReady: true });
    for (const key of ["knowledge", "roadmap"] as const) {
      const s = n.sections.find((x) => x.key === key)!;
      expect(s.status).toBe("soon");
      expect(s.href).toBeNull();
      expect(s.children).toEqual([]);
    }
    expect(n.sections.find((x) => x.key === "knowledge")!.lane).toBe("W3");
    expect(n.sections.find((x) => x.key === "roadmap")!.lane).toBe("W5");
  });

  it("every link is about the chosen child and no other", () => {
    const all = hrefs(buildNav("parent", NG, { revisionsReady: true }));
    expect(all.length).toBeGreaterThan(15);
    for (const h of all) {
      expect(h, h).not.toContain(AN);
      if (h !== "/feedback") expect(h.includes(NG) || h.startsWith("/settings/ai"), h).toBe(true);
    }
    expect(all).toContain(`/?learner=${NG}`);
    expect(all).toContain(`/learners/${NG}/inbox`);
    expect(all).toContain(`/studio/new?learner=${NG}`);
    expect(all).toContain(`/review/skills?learner=${NG}`);
  });

  it("only the parent gets the 'Phụ huynh' group (AI settings, delete the child's data)", () => {
    expect(buildNav("tutor", NG, { revisionsReady: true }).parent).toEqual([]);
    const p = buildNav("parent", NG, { revisionsReady: true }).parent;
    expect(p.map((x) => [x.key, x.label])).toEqual([["aiSettings", aiSettingsCopy.navLink], ["delete", purgePage.link]]);
    expect(p.find((x) => x.key === "delete")!.href).toBe(`/learners/${NG}/delete`);
    expect(hrefs(buildNav("tutor", NG, { revisionsReady: true })).some((h) => h.endsWith("/delete"))).toBe(false);
  });

  it("'Bài đã sửa' is left out until migration 0021 is readable (was the N7 test of the learner card)", () => {
    const off = buildNav("tutor", NG, { revisionsReady: false });
    expect(hrefs(off).some((h) => h.includes("/revisions"))).toBe(false);
    const on = buildNav("tutor", NG, { revisionsReady: true }).sections.find((s) => s.key === "inbox")!;
    expect(on.children.find((c) => c.key === "revisions")).toEqual({ key: "revisions", label: revisionReviewCopy.link, href: `/learners/${NG}/revisions` });
  });

  it("with no child yet only the desk has a link", () => {
    const n = buildNav("tutor", null, { revisionsReady: true });
    expect(n.sections.find((s) => s.key === "desk")!.href).toBe("/");
    for (const s of n.sections.filter((x) => x.key !== "desk")) {
      expect(s.href, s.key).toBeNull();
      expect(s.children, s.key).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/shellNav.test.ts`
Expected: FAIL — `Cannot find module '@/lib/shell/nav'`.

- [ ] **Step 3: Add the copy**

In `lib/copy/vi.ts`, inside `appFeedback.screens` add after `feedback: "Góp ý về app",`:

```ts
    inbox: "Chờ duyệt",
```

After the closing `} as const;` of `curriculumCopy` add:

```ts
// ---------- Khung bàn làm việc (cột trái + thanh trên; lát "Khung bàn làm việc", 08/11/2026) ----------
export const shellCopy = {
  navLabel: "Các phần",
  menu: "Các phần",
  switcherLabel: "Chọn học sinh",
  sections: {
    desk: "Bàn làm việc",
    profile: "Hồ sơ học sinh",
    knowledge: "Bản đồ kiến thức",
    roadmap: "Lộ trình",
    sessions: "Buổi học",
    assign: "Giao bài",
    curricula: "Giáo trình",
    inbox: "Chờ duyệt",
  },
  soon: "Sắp có",
  parentGroup: "Phụ huynh",
  inquiriesChild: "Bài chủ đề trong app",
  inboxAll: "Tất cả việc chờ",
  aiDraftNote: "Mọi thứ AI soạn là nháp: chưa duyệt thì con chưa thấy.",
} as const;
```

- [ ] **Step 4: Write the model**

```ts
// lib/shell/nav.ts
/**
 * The staff sidebar as data (pure, unit-tested). Sections follow the agreed workdesk prototype (spec §3). A section that a later
 * slice builds is "soon": shown, never a link, until that slice flips its status here. No track branching: the same model for every
 * child; only the learner id differs.
 */
import { aiSettingsCopy, assignPage, levelCopy, notesPage, purgePage, readingPage, resultPage, revisionReviewCopy, sessionNotePage, shellCopy, skillStateCopy, studioCopy, studioInboxCopy, targetsPage, weakPage } from "@/lib/copy/vi";

export const SECTION_KEYS = ["desk", "profile", "knowledge", "roadmap", "sessions", "assign", "curricula", "inbox"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type NavStatus = "live" | "soon";
export type NavRole = "tutor" | "parent";
export type NavFlags = { revisionsReady: boolean };
export type NavLink = { key: string; label: string; href: string };
export type NavSection = { key: SectionKey; label: string; status: NavStatus; lane: string | null; href: string | null; children: NavLink[] };
export type NavModel = { sections: NavSection[]; parent: NavLink[] };

export type SectionDef = {
  key: SectionKey;
  status: NavStatus;
  /** The slice that builds a "soon" section (shown to nobody; for the plan and the tests). */
  lane: string | null;
  root: (learnerId: string) => string;
  children: (learnerId: string, flags: NavFlags) => NavLink[];
};

const L = (id: string) => `/learners/${id}`;
export const learnerQuery = (id: string) => `?learner=${id}`;

export const SECTIONS: readonly SectionDef[] = [
  { key: "desk", status: "live", lane: null, root: (id) => `/${learnerQuery(id)}`, children: () => [] },
  {
    key: "profile", status: "live", lane: null, root: (id) => `${L(id)}/levels`,
    children: (id) => [
      { key: "levels", label: levelCopy.link, href: `${L(id)}/levels` },
      { key: "weak", label: weakPage.link, href: `${L(id)}/weak` },
      { key: "targets", label: targetsPage.link, href: `${L(id)}/targets` },
      { key: "reading", label: readingPage.link, href: `${L(id)}/reading/new` },
    ],
  },
  { key: "knowledge", status: "soon", lane: "W3", root: (id) => `${L(id)}/knowledge`, children: () => [] },
  { key: "roadmap", status: "soon", lane: "W5", root: (id) => `${L(id)}/roadmap`, children: () => [] },
  {
    key: "sessions", status: "live", lane: null, root: (id) => `${L(id)}/notes`,
    children: (id) => [
      { key: "notesNew", label: sessionNotePage.link, href: `${L(id)}/notes/new` },
      { key: "notes", label: notesPage.link, href: `${L(id)}/notes` },
    ],
  },
  {
    key: "assign", status: "live", lane: null, root: (id) => `${L(id)}/assign`,
    children: (id) => [
      { key: "assign", label: assignPage.link, href: `${L(id)}/assign` },
      { key: "studio", label: studioCopy.navLink, href: `/studio/new${learnerQuery(id)}` },
      { key: "inquiries", label: shellCopy.inquiriesChild, href: `${L(id)}/inquiries` },
      { key: "results", label: resultPage.link, href: `${L(id)}/results/new` },
    ],
  },
  { key: "curricula", status: "live", lane: null, root: (id) => `${L(id)}/curricula`, children: () => [] },
  {
    key: "inbox", status: "live", lane: null, root: (id) => `${L(id)}/inbox`,
    children: (id, f) => [
      { key: "all", label: shellCopy.inboxAll, href: `${L(id)}/inbox` },
      { key: "work", label: skillStateCopy.tabWork, href: `/review${learnerQuery(id)}` },
      { key: "skills", label: skillStateCopy.tabSkills, href: `/review/skills${learnerQuery(id)}` },
      { key: "studio", label: studioInboxCopy.tab, href: `/review/studio${learnerQuery(id)}` },
      ...(f.revisionsReady ? [{ key: "revisions", label: revisionReviewCopy.link, href: `${L(id)}/revisions` }] : []),
    ],
  },
];

export function buildNav(role: NavRole, learnerId: string | null, flags: NavFlags): NavModel {
  const sections = SECTIONS.map((s): NavSection => {
    const live = s.status === "live" && learnerId !== null;
    return {
      key: s.key,
      label: shellCopy.sections[s.key],
      status: s.status,
      lane: s.lane,
      href: s.key === "desk" ? (learnerId ? s.root(learnerId) : "/") : live ? s.root(learnerId) : null,
      children: live ? s.children(learnerId, flags) : [],
    };
  });
  const parent: NavLink[] =
    role === "parent"
      ? [
          { key: "aiSettings", label: aiSettingsCopy.navLink, href: `/settings/ai${learnerId ? learnerQuery(learnerId) : ""}` },
          ...(learnerId ? [{ key: "delete", label: purgePage.link, href: `${L(learnerId)}/delete` }] : []),
        ]
      : [];
  return { sections, parent };
}
```

Note: inside `buildNav` TypeScript narrows `learnerId` only through `live`; if `tsc` complains, write `live && learnerId ? s.root(learnerId) : null` and `live && learnerId ? s.children(learnerId, flags) : []`.

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/unit/shellNav.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/shell/nav.ts lib/copy/vi.ts tests/unit/shellNav.test.ts
git commit -m "feat(shell): staff sidebar model as data (prototype order, soon sections, parent group)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 2: Đường dẫn → mục đang mở, đổi em, tên màn góp ý  *(builder · Sonnet)*

**Files:**
- Create: `lib/shell/paths.ts`
- Test: `tests/unit/shellPaths.test.ts`

**Interfaces:**
- Consumes: `SECTIONS`, `learnerQuery`, `type SectionKey` (Task 1).
- Produces: `type ActiveKey = SectionKey | "aiSettings" | "delete" | "feedback"`, `type Active = { section: ActiveKey | null; child: string | null; screen: string }`, `activeFor(pathname: string): Active`, `switchHref(pathname: string, toLearnerId: string): string`, `feedbackHref(pathname: string, learnerId: string | null): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shellPaths.test.ts
import { describe, expect, it } from "vitest";
import { appFeedback, curriculumCopy, shellCopy } from "@/lib/copy/vi";
import { activeFor, feedbackHref, switchHref } from "@/lib/shell/paths";

const X = "a0000000-0000-4000-8000-000000000001";
const Y = "b0000000-0000-4000-8000-000000000002";
const S = appFeedback.screens;

describe("activeFor: every existing page keeps the feedback screen it passed to AppHeader", () => {
  const table: [string, string | null, string | null, string][] = [
    ["/", "desk", null, S.home],
    [`/learners/${X}/levels`, "profile", "levels", S.levels],
    [`/learners/${X}/levels/baseline`, "profile", "levels", S.baseline],
    [`/learners/${X}/levels/adjust`, "profile", "levels", S.adjust],
    [`/learners/${X}/levels/external/new`, "profile", "levels", S.external],
    [`/learners/${X}/weak`, "profile", "weak", S.weak],
    [`/learners/${X}/targets`, "profile", "targets", S.targets],
    [`/learners/${X}/reading/new`, "profile", "reading", S.reading],
    [`/learners/${X}/notes/new`, "sessions", "notesNew", S.notesNew],
    [`/learners/${X}/notes`, "sessions", "notes", S.notes],
    [`/learners/${X}/assign`, "assign", "assign", S.assign],
    ["/studio/new", "assign", "studio", S.studioNew],
    ["/studio/drafts/d1", "assign", "studio", S.studioDraft],
    [`/learners/${X}/inquiries`, "assign", "inquiries", S.inquiries],
    [`/learners/${X}/results/new`, "assign", "results", S.resultsNew],
    [`/learners/${X}/curricula`, "curricula", null, curriculumCopy.screenLabel],
    [`/learners/${X}/curricula/c1`, "curricula", null, curriculumCopy.screenLabel],
    ["/curricula/versions/v1", "curricula", null, curriculumCopy.screenLabel],
    [`/learners/${X}/inbox`, "inbox", "all", S.inbox],
    ["/review", "inbox", "work", S.review],
    ["/review/skills", "inbox", "skills", S.reviewSkills],
    ["/review/studio", "inbox", "studio", S.reviewStudio],
    ["/review/e1", "inbox", "work", S.reviewEpisode],
    [`/learners/${X}/revisions`, "inbox", "revisions", S.revisions],
    [`/learners/${X}/revisions/a1`, "inbox", "revisions", S.revisionOne],
    ["/settings/ai", "aiSettings", null, S.settingsAi],
    [`/learners/${X}/delete`, "delete", null, S.delete],
    ["/feedback", "feedback", null, S.feedback],
    // reserved for later slices
    [`/learners/${X}/knowledge`, "knowledge", null, shellCopy.sections.knowledge],
    [`/learners/${X}/roadmap`, "roadmap", null, shellCopy.sections.roadmap],
    [`/learners/${X}/imports/new`, "assign", null, shellCopy.sections.assign],
  ];
  for (const [path, section, child, screen] of table) {
    it(path, () => expect(activeFor(path)).toEqual({ section, child, screen }));
  }
  it("a trailing slash does not matter; an unknown page has no section and the default screen", () => {
    expect(activeFor(`/learners/${X}/weak/`).section).toBe("profile");
    expect(activeFor("/somewhere")).toEqual({ section: null, child: null, screen: appFeedback.screenDefault });
  });
});

describe("switchHref keeps the part of the app that is open", () => {
  it("same child page when every child has it; the section root otherwise", () => {
    expect(switchHref(`/learners/${X}/weak`, Y)).toBe(`/learners/${Y}/weak`);
    expect(switchHref(`/learners/${X}/levels/baseline`, Y)).toBe(`/learners/${Y}/levels`);
    expect(switchHref(`/learners/${X}/curricula/c1`, Y)).toBe(`/learners/${Y}/curricula`);
    expect(switchHref("/curricula/versions/v1", Y)).toBe(`/learners/${Y}/curricula`);
    expect(switchHref("/review/e1", Y)).toBe(`/review?learner=${Y}`);
    expect(switchHref("/studio/drafts/d1", Y)).toBe(`/studio/new?learner=${Y}`);
    expect(switchHref(`/learners/${X}/inbox`, Y)).toBe(`/learners/${Y}/inbox`);
  });
  it("desk, feedback, AI settings and delete", () => {
    expect(switchHref("/", Y)).toBe(`/?learner=${Y}`);
    expect(switchHref("/feedback", Y)).toBe(`/feedback?learner=${Y}`);
    expect(switchHref("/settings/ai", Y)).toBe(`/settings/ai?learner=${Y}`);
    expect(switchHref(`/learners/${X}/delete`, Y)).toBe(`/learners/${Y}/delete`);
  });
  it("a 'soon' section or an unknown page goes to the desk", () => {
    expect(switchHref(`/learners/${X}/knowledge`, Y)).toBe(`/?learner=${Y}`);
    expect(switchHref("/somewhere", Y)).toBe(`/?learner=${Y}`);
  });
});

describe("feedbackHref carries the screen name and the child", () => {
  it("builds /feedback?screen=…&learner=…", () => {
    expect(feedbackHref(`/learners/${X}/weak`, X)).toBe(`/feedback?screen=${encodeURIComponent(S.weak)}&learner=${X}`);
    expect(feedbackHref("/", null)).toBe(`/feedback?screen=${encodeURIComponent(S.home)}`);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/shellPaths.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/shell/paths.ts
/**
 * Which sidebar entry a URL belongs to, and the screen name sent with "Góp ý về app" (pure, unit-tested). One table: the order
 * matters (specific paths before /review/[id]). Paths of later slices (W3 knowledge / imports, W5 roadmap) are registered already
 * so their pages light up the right entry as soon as they exist.
 */
import { appFeedback, curriculumCopy, shellCopy } from "@/lib/copy/vi";
import { learnerQuery, SECTIONS, type SectionKey } from "./nav";

export type ActiveKey = SectionKey | "aiSettings" | "delete" | "feedback";
export type Active = { section: ActiveKey | null; child: string | null; screen: string };

const S = appFeedback.screens;
const lp = (rest: string) => new RegExp(`^/learners/[^/]+${rest}$`);
type Rule = { re: RegExp; section: ActiveKey; child: string | null; screen: string };

const RULES: readonly Rule[] = [
  { re: /^\/$/, section: "desk", child: null, screen: S.home },
  { re: lp("/levels/baseline"), section: "profile", child: "levels", screen: S.baseline },
  { re: lp("/levels/adjust"), section: "profile", child: "levels", screen: S.adjust },
  { re: lp("/levels/external/new"), section: "profile", child: "levels", screen: S.external },
  { re: lp("/levels"), section: "profile", child: "levels", screen: S.levels },
  { re: lp("/weak"), section: "profile", child: "weak", screen: S.weak },
  { re: lp("/targets"), section: "profile", child: "targets", screen: S.targets },
  { re: lp("/reading/new"), section: "profile", child: "reading", screen: S.reading },
  { re: lp("/knowledge(/.*)?"), section: "knowledge", child: null, screen: shellCopy.sections.knowledge },
  { re: lp("/roadmap(/.*)?"), section: "roadmap", child: null, screen: shellCopy.sections.roadmap },
  { re: lp("/notes/new"), section: "sessions", child: "notesNew", screen: S.notesNew },
  { re: lp("/notes"), section: "sessions", child: "notes", screen: S.notes },
  { re: lp("/assign"), section: "assign", child: "assign", screen: S.assign },
  { re: /^\/studio\/new$/, section: "assign", child: "studio", screen: S.studioNew },
  { re: /^\/studio\/drafts\/[^/]+$/, section: "assign", child: "studio", screen: S.studioDraft },
  { re: lp("/inquiries"), section: "assign", child: "inquiries", screen: S.inquiries },
  { re: lp("/results/new"), section: "assign", child: "results", screen: S.resultsNew },
  { re: lp("/imports(/.*)?"), section: "assign", child: null, screen: shellCopy.sections.assign },
  { re: lp("/curricula(/[^/]+)?"), section: "curricula", child: null, screen: curriculumCopy.screenLabel },
  { re: /^\/curricula\/versions\/[^/]+$/, section: "curricula", child: null, screen: curriculumCopy.screenLabel },
  { re: lp("/inbox"), section: "inbox", child: "all", screen: S.inbox },
  { re: /^\/review$/, section: "inbox", child: "work", screen: S.review },
  { re: /^\/review\/skills$/, section: "inbox", child: "skills", screen: S.reviewSkills },
  { re: /^\/review\/studio$/, section: "inbox", child: "studio", screen: S.reviewStudio },
  { re: /^\/review\/[^/]+$/, section: "inbox", child: "work", screen: S.reviewEpisode },
  { re: lp("/revisions"), section: "inbox", child: "revisions", screen: S.revisions },
  { re: lp("/revisions/[^/]+"), section: "inbox", child: "revisions", screen: S.revisionOne },
  { re: /^\/settings\/ai$/, section: "aiSettings", child: null, screen: S.settingsAi },
  { re: lp("/delete"), section: "delete", child: null, screen: S.delete },
  { re: /^\/feedback$/, section: "feedback", child: null, screen: S.feedback },
];

export function activeFor(pathname: string): Active {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const r = RULES.find((x) => x.re.test(p));
  return r ? { section: r.section, child: r.child, screen: r.screen } : { section: null, child: null, screen: appFeedback.screenDefault };
}

export function switchHref(pathname: string, to: string): string {
  const a = activeFor(pathname);
  if (a.section === "feedback") return `/feedback${learnerQuery(to)}`;
  if (a.section === "aiSettings") return `/settings/ai${learnerQuery(to)}`;
  if (a.section === "delete") return `/learners/${to}/delete`;
  const def = SECTIONS.find((s) => s.key === a.section);
  if (!def || def.status !== "live") return `/${learnerQuery(to)}`;
  const child = a.child ? def.children(to, { revisionsReady: true }).find((c) => c.key === a.child) : undefined;
  return child?.href ?? def.root(to);
}

export function feedbackHref(pathname: string, learnerId: string | null): string {
  return `/feedback?screen=${encodeURIComponent(activeFor(pathname).screen)}${learnerId ? `&learner=${learnerId}` : ""}`;
}
```

Note: `switchHref("/review/e1", Y)` → child `work` → `/review?learner=Y` (the review of one piece of work belongs to one child; the other child gets its list). `/learners/X/levels/baseline` → child `levels` → `/learners/Y/levels` (baseline is a form; land on the profile).

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/shellPaths.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/shell/paths.ts tests/unit/shellPaths.test.ts
git commit -m "feat(shell): URL to sidebar entry, child switch and feedback screen (one table)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 3: Dữ liệu khung (`toShell`, `loadShell`, `requireShell`)  *(builder · Sonnet)*

**Files:**
- Create: `lib/shell/shell.ts`, `lib/shell/load.ts`
- Test: `tests/unit/shellData.test.ts`

**Interfaces:**
- Consumes: `loadHome(): Promise<HomeData>` (`lib/home/loadHome.ts`), `type LearnerSummary` (`lib/home/visible.ts`), `revisionsAvailable(): Promise<boolean>` (`lib/revision/load.ts`).
- Produces:
  - `type StaffRole = "tutor" | "parent"`; `type ShellData = { displayName: string; role: StaffRole; memberId: string; learners: LearnerSummary[]; current: LearnerSummary | null; revisionsReady: boolean }`
  - `firstParam(v: string | string[] | undefined): string | null`
  - `pickLearner(learners: readonly LearnerSummary[], hint: string | null): LearnerSummary | null`
  - `toShell(home: { kind: "tutor" | "parent" | "student"; displayName: string; memberId: string; learners: LearnerSummary[] }, hint: string | null, revisionsReady: boolean): ShellData | null`
  - `type ShellResult = { kind: "ok"; shell: ShellData } | { kind: "login" } | { kind: "not-found" }`
  - `loadShell(hint: string | null, opts?: { strict?: boolean }): Promise<ShellResult>` — `strict`: the hint must be one of the caller's visible children, else `not-found`.
  - `requireShell(hint: string | null, opts?: { strict?: boolean }): Promise<ShellData>` — `redirect("/login")` / `notFound()`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shellData.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerSummary } from "@/lib/home/visible";

vi.mock("server-only", () => ({}));
const loadHome = vi.fn();
vi.mock("@/lib/home/loadHome", () => ({ loadHome: () => loadHome() }));
vi.mock("@/lib/revision/load", () => ({ revisionsAvailable: async () => true }));
const notFound = vi.fn(() => { throw new Error("NOT_FOUND"); });
const redirect = vi.fn(() => { throw new Error("REDIRECT"); });
vi.mock("next/navigation", () => ({ notFound: () => notFound(), redirect: (u: string) => redirect(u) }));

import { firstParam, pickLearner, toShell } from "@/lib/shell/shell";
import { loadShell, requireShell } from "@/lib/shell/load";

const an: LearnerSummary = { id: "a0000000-0000-4000-8000-000000000001", alias: "An (thử)", trackId: "A", status: "active", isTest: true, color: null };
const ng: LearnerSummary = { id: "b0000000-0000-4000-8000-000000000002", alias: "Nguyên (thử)", trackId: "B", status: "active", isTest: true, color: null };
const parent = { kind: "parent" as const, displayName: "Mẹ", memberId: "m1", learners: [an, ng] };

beforeEach(() => { loadHome.mockReset(); notFound.mockClear(); redirect.mockClear(); });

describe("shell data (pure)", () => {
  it("firstParam takes the first non-empty value", () => {
    expect(firstParam(undefined)).toBeNull();
    expect(firstParam(["  ", "x"])).toBeNull();
    expect(firstParam([" x ", "y"])).toBe("x");
  });
  it("pickLearner: the hinted child when visible, else the first; null when there is none", () => {
    expect(pickLearner([an, ng], ng.id)).toBe(ng);
    expect(pickLearner([an, ng], "not-mine")).toBe(an);
    expect(pickLearner([an, ng], null)).toBe(an);
    expect(pickLearner([], null)).toBeNull();
  });
  it("toShell: staff only", () => {
    expect(toShell({ ...parent, kind: "student" }, null, true)).toBeNull();
    expect(toShell(parent, ng.id, false)).toEqual({ displayName: "Mẹ", role: "parent", memberId: "m1", learners: [an, ng], current: ng, revisionsReady: false });
  });
});

describe("loadShell / requireShell", () => {
  it("signed out → login; no member or student → not-found", async () => {
    loadHome.mockResolvedValue({ kind: "signed-out" });
    expect(await loadShell(null)).toEqual({ kind: "login" });
    loadHome.mockResolvedValue({ kind: "no-member", email: null });
    expect(await loadShell(null)).toEqual({ kind: "not-found" });
    loadHome.mockResolvedValue({ ...parent, kind: "student", learners: [an] });
    expect(await loadShell(an.id)).toEqual({ kind: "not-found" });
  });
  it("strict: a child outside the caller's visible children → not-found (same as requireAccess: never reveal it exists)", async () => {
    loadHome.mockResolvedValue({ kind: "tutor", displayName: "Thầy", memberId: "m2", learners: [an] });
    expect(await loadShell(ng.id, { strict: true })).toEqual({ kind: "not-found" });
    const ok = await loadShell(an.id, { strict: true });
    expect(ok.kind === "ok" && ok.shell.current?.id).toBe(an.id);
  });
  it("requireShell turns the result into redirect / notFound", async () => {
    loadHome.mockResolvedValue({ kind: "signed-out" });
    await expect(requireShell(null)).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
    loadHome.mockResolvedValue({ kind: "no-member", email: null });
    await expect(requireShell(null)).rejects.toThrow("NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/shellData.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/shell/shell.ts
/** What the staff shell needs about the signed-in adult and the child in view (pure). */
import type { LearnerSummary } from "@/lib/home/visible";

export type StaffRole = "tutor" | "parent";
export type ShellData = { displayName: string; role: StaffRole; memberId: string; learners: LearnerSummary[]; current: LearnerSummary | null; revisionsReady: boolean };

export function firstParam(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
}

/** The hinted child when it is one of the caller's (RLS + ALLOW_REAL_LEARNERS filtered) children; else the first one. */
export function pickLearner(learners: readonly LearnerSummary[], hint: string | null): LearnerSummary | null {
  return (hint ? learners.find((l) => l.id === hint) : undefined) ?? learners[0] ?? null;
}

export function toShell(
  home: { kind: "tutor" | "parent" | "student"; displayName: string; memberId: string; learners: LearnerSummary[] },
  hint: string | null,
  revisionsReady: boolean,
): ShellData | null {
  if (home.kind === "student") return null;
  return { displayName: home.displayName, role: home.kind, memberId: home.memberId, learners: home.learners, current: pickLearner(home.learners, hint), revisionsReady };
}
```

```ts
// lib/shell/load.ts
import "server-only";
import { notFound, redirect } from "next/navigation";
import { loadHome } from "@/lib/home/loadHome";
import { revisionsAvailable } from "@/lib/revision/load";
import { toShell, type ShellData } from "./shell";

export type ShellResult = { kind: "ok"; shell: ShellData } | { kind: "login" } | { kind: "not-found" };

/**
 * The shell of a staff page. Reads the adult and their children with the USER client (RLS decides scope, like the old home page).
 * `strict` (pages of one child): the hint must be one of those children, else not-found — the page still checks its own action.
 */
export async function loadShell(hint: string | null, opts: { strict?: boolean } = {}): Promise<ShellResult> {
  const home = await loadHome();
  if (home.kind === "signed-out") return { kind: "login" };
  if (home.kind === "no-member" || home.kind === "student") return { kind: "not-found" };
  if (opts.strict && !home.learners.some((l) => l.id === hint)) return { kind: "not-found" };
  const shell = toShell(home, hint, await revisionsAvailable());
  return shell ? { kind: "ok", shell } : { kind: "not-found" };
}

export async function requireShell(hint: string | null, opts: { strict?: boolean } = {}): Promise<ShellData> {
  const r = await loadShell(hint, opts);
  if (r.kind === "login") redirect("/login");
  if (r.kind === "not-found") notFound();
  return r.shell;
}
```

(`redirect` / `notFound` throw, so TypeScript accepts the final `return r.shell`; if it does not, add `throw new Error("unreachable")` after the two calls.)

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/shellData.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/shell/shell.ts lib/shell/load.ts tests/unit/shellData.test.ts
git commit -m "feat(shell): shell data from loadHome (pick the child, strict scope for child pages)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 4: `StaffShell`, `SidebarNav`, `LearnerSwitcher`  *(builder · Sonnet)*

**Files:**
- Create: `components/shell/StaffShell.tsx`, `components/shell/SidebarNav.tsx`, `components/shell/LearnerSwitcher.tsx`, `components/shell/PhoneFeedbackLink.tsx`
- Test: `tests/unit/shellUi.test.ts`

**Interfaces:**
- Consumes: `buildNav`, `NavModel` (Task 1); `activeFor`, `switchHref`, `feedbackHref` (Task 2); `ShellData` (Task 3).
- Produces: `StaffShell({ shell, children }: { shell: ShellData; children: React.ReactNode })`; `SidebarNav({ nav, learnerId }: { nav: NavModel; learnerId: string | null })` (client); `LearnerSwitcher({ options, currentId }: { options: { id: string; label: string }[]; currentId: string | null })` (client).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shellUi.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { app, appFeedback, learnerWithTrack, shellCopy } from "@/lib/copy/vi";
import type { ShellData } from "@/lib/shell/shell";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({ default: (p: Record<string, unknown> & { href: string; children: React.ReactNode }) => createElement("a", { ...p, href: p.href }, p.children) }));

import { StaffShell } from "@/components/shell/StaffShell";

const an = { id: "a0000000-0000-4000-8000-000000000001", alias: "An (thử)", trackId: "A" as const, status: "active" as const, isTest: true, color: null };
const ng = { id: "b0000000-0000-4000-8000-000000000002", alias: "Nguyên (thử)", trackId: "B" as const, status: "active" as const, isTest: true, color: null };
const shell = (over: Partial<ShellData> = {}): ShellData => ({ displayName: "Mẹ", role: "parent", memberId: "m1", learners: [an, ng], current: an, revisionsReady: true, ...over });
const render = (s: ShellData, path: string) => { pathname = path; return renderToStaticMarkup(createElement(StaffShell, { shell: s }, createElement("p", null, "BODY"))); };

describe("staff shell", () => {
  it("parent with 2 children: switcher keeps the open part; test badge; body inside <main>", () => {
    const html = render(shell(), `/learners/${an.id}/weak`);
    expect(html).toContain('data-testid="staff-shell"');
    expect(html).toContain('data-testid="learner-switcher"');
    expect(html).toContain(learnerWithTrack("An (thử)", "A"));
    expect(html).toContain(`href="/learners/${ng.id}/weak"`);
    expect(html).toContain(app.testBadge);
    expect(html).toMatch(/<main[^>]*>[\s\S]*BODY[\s\S]*<\/main>/);
  });
  it("tutor with 1 child: no switcher, the child's name; no parent group", () => {
    const html = render(shell({ role: "tutor", learners: [ng], current: ng }), "/");
    expect(html).not.toContain('data-testid="learner-switcher"');
    expect(html).toContain('data-testid="shell-learner"');
    expect(html).not.toContain(shellCopy.parentGroup);
    expect(html).not.toContain('data-testid="nav-delete"');
  });
  it("marks the open section and child; shows children of the open section only", () => {
    const html = render(shell(), `/learners/${an.id}/weak`);
    expect(html).toMatch(/data-testid="nav-profile"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="nav-profile"/);
    expect(html).toContain('data-testid="nav-profile-weak"');
    expect(html).not.toContain('data-testid="nav-assign-studio"');
  });
  it("'soon' sections are not links", () => {
    const html = render(shell(), "/");
    expect(html).toMatch(/<span[^>]*data-testid="nav-knowledge"[^>]*aria-disabled="true"|<span[^>]*aria-disabled="true"[^>]*data-testid="nav-knowledge"/);
    expect(html).toContain(shellCopy.soon);
    expect(html).not.toContain("/knowledge");
    expect(html).not.toContain("/roadmap");
  });
  it("'Góp ý về app' is always in the sidebar and carries the screen and the child", () => {
    const html = render(shell(), `/learners/${an.id}/weak`);
    expect(html).toContain('data-testid="feedback-link"');
    expect(html).toContain(`/feedback?screen=${encodeURIComponent(appFeedback.screens.weak)}&amp;learner=${an.id}`);
    expect(html).toContain(shellCopy.aiDraftNote);
  });
  it("phone: one nav (no duplicate test ids), opened by a 44px button", () => {
    const html = render(shell(), "/");
    expect(html.match(/data-testid="staff-sidebar"/g)).toHaveLength(1);
    expect(html.match(/data-testid="nav-desk"/g)).toHaveLength(1);
    expect(html).toMatch(/data-testid="nav-menu-toggle"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*data-testid="nav-menu-toggle"/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/shellUi.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LearnerSwitcher`**

```tsx
// components/shell/LearnerSwitcher.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { shellCopy } from "@/lib/copy/vi";
import { switchHref } from "@/lib/shell/paths";

/** "Nguyên · Track B / An · Track A" (prototype top bar). Switching keeps the part of the app that is open. */
export function LearnerSwitcher({ options, currentId }: { options: { id: string; label: string }[]; currentId: string | null }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label={shellCopy.switcherLabel} data-testid="learner-switcher" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Link
          key={o.id}
          href={switchHref(pathname, o.id)}
          aria-current={o.id === currentId ? "true" : undefined}
          data-testid={`learner-option-${o.id}`}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm no-underline ${o.id === currentId ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-ink hover:border-accent"}`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Implement `SidebarNav`**

```tsx
// components/shell/SidebarNav.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { appFeedback, shellCopy } from "@/lib/copy/vi";
import type { NavLink, NavModel } from "@/lib/shell/nav";
import { activeFor, feedbackHref } from "@/lib/shell/paths";

const item = "flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm no-underline";

/**
 * The left column (spec §5 rule 5): sticky on a computer, a drawer under one button on a phone. One <nav> only (no duplicate test ids).
 * Children of the open section are shown under it (plan K5). "Góp ý về app" is always at the bottom.
 */
export function SidebarNav({ nav, learnerId }: { nav: NavModel; learnerId: string | null }) {
  const pathname = usePathname() ?? "/";
  const active = activeFor(pathname);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const openLabel = nav.sections.find((s) => s.key === active.section)?.label ?? nav.parent.find((p) => p.key === active.section)?.label ?? shellCopy.sections.desk;
  const child = (c: NavLink, testid: string, current: boolean) => (
    <li key={c.key}>
      <Link href={c.href} onClick={close} data-testid={testid} aria-current={current ? "page" : undefined}
        className={`${item} pl-6 ${current ? "font-semibold text-accent" : "text-ink hover:bg-[#eceee8]"}`}>
        {c.label}
      </Link>
    </li>
  );
  return (
    <div className="border-b border-line bg-[#fbfbf8] md:border-b-0 md:border-r">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="staff-nav" data-testid="nav-menu-toggle"
        className="flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold md:hidden">
        {shellCopy.menu} · {openLabel}
      </button>
      <nav id="staff-nav" aria-label={shellCopy.navLabel} data-testid="staff-sidebar"
        className={`${open ? "flex" : "hidden"} flex-col gap-1 px-3 pb-4 md:sticky md:top-0 md:flex md:h-dvh md:overflow-y-auto md:py-4`}>
        <ul className="flex flex-col gap-1">
          {nav.sections.map((s) => {
            const current = active.section === s.key;
            return (
              <li key={s.key}>
                {s.href ? (
                  <Link href={s.href} onClick={close} data-testid={`nav-${s.key}`} aria-current={current ? "page" : undefined}
                    className={`${item} ${current ? "bg-[#e3ece8] font-semibold text-[#1d4136]" : "text-ink hover:bg-[#eceee8]"}`}>
                    {s.label}
                  </Link>
                ) : (
                  <span data-testid={`nav-${s.key}`} aria-disabled="true" data-status={s.status} className={`${item} cursor-default text-muted`}>
                    {s.label}
                    {s.status === "soon" ? <span className="rounded-full bg-[#eceee8] px-2 py-0.5 text-xs font-semibold">{shellCopy.soon}</span> : null}
                  </span>
                )}
                {current && s.children.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-0.5">{s.children.map((c) => child(c, `nav-${s.key}-${c.key}`, active.child === c.key))}</ul>
                ) : null}
              </li>
            );
          })}
        </ul>
        {nav.parent.length > 0 ? (
          <>
            <p className="mt-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{shellCopy.parentGroup}</p>
            <ul className="flex flex-col gap-0.5">{nav.parent.map((p) => child(p, `nav-${p.key}`, active.section === p.key))}</ul>
          </>
        ) : null}
        <div className="mt-auto flex flex-col gap-2 px-3 pt-4 text-xs text-muted">
          <p>{shellCopy.aiDraftNote}</p>
          <Link href={feedbackHref(pathname, learnerId)} onClick={close} data-testid="feedback-link"
            className="inline-flex min-h-11 items-center self-start rounded-lg border border-line bg-white px-3 text-sm font-medium text-accent no-underline hover:border-accent">
            {appFeedback.link}
          </Link>
        </div>
      </nav>
    </div>
  );
}
```

Notes for the builder: no `useEffect` to close the drawer (the `react-hooks/set-state-in-effect` lint rule); links close it with `onClick`. The feedback link inside the drawer is hidden on a phone until the drawer opens, so the top bar has `feedback-link-phone` (Step 5).

- [ ] **Step 5: Implement `StaffShell`**

```tsx
// components/shell/StaffShell.tsx
import Link from "next/link";
import { account, app, auth, learnerWithTrack } from "@/lib/copy/vi";
import { buildNav } from "@/lib/shell/nav";
import type { ShellData } from "@/lib/shell/shell";
import { LearnerSwitcher } from "./LearnerSwitcher";
import { PhoneFeedbackLink } from "./PhoneFeedbackLink";
import { SidebarNav } from "./SidebarNav";

/** Staff pages only (tutor, parent). Students never get this shell (their pages do not import it). */
export function StaffShell({ shell, children }: { shell: ShellData; children: React.ReactNode }) {
  const learnerId = shell.current?.id ?? null;
  const nav = buildNav(shell.role, learnerId, { revisionsReady: shell.revisionsReady });
  const options = shell.learners.map((l) => ({ id: l.id, label: learnerWithTrack(l.alias, l.trackId) }));
  return (
    <div data-testid="staff-shell" className="min-h-dvh">
      <header data-testid="staff-topbar" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-white px-4 py-3 md:px-6">
        <span className="font-semibold text-accent">{app.name}</span>
        {shell.current?.isTest ? <span className="rounded-full border border-accent/40 px-2 py-0.5 text-xs font-medium text-accent">{app.testBadge}</span> : null}
        {options.length > 1 ? (
          <LearnerSwitcher options={options} currentId={learnerId} />
        ) : shell.current ? (
          <span data-testid="shell-learner" className="text-sm font-semibold">{learnerWithTrack(shell.current.alias, shell.current.trackId)}</span>
        ) : null}
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="hidden text-sm text-muted sm:inline">{shell.displayName}</span>
          <PhoneFeedbackLink learnerId={learnerId} />
          <Link href="/account/password" data-testid="change-password-link" className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-accent underline">
            {account.changePassword}
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:border-accent">{auth.signOut}</button>
          </form>
        </div>
      </header>
      <div className="md:grid md:grid-cols-[220px_minmax(0,1fr)]">
        <SidebarNav nav={nav} learnerId={learnerId} />
        <main className="min-w-0 px-4 py-6 md:px-7">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
```

```tsx
// components/shell/PhoneFeedbackLink.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { appFeedback } from "@/lib/copy/vi";
import { feedbackHref } from "@/lib/shell/paths";

/** "Góp ý về app" stays visible on a phone (spec §5 rule 5) while the sidebar drawer is closed. */
export function PhoneFeedbackLink({ learnerId }: { learnerId: string | null }) {
  return (
    <Link href={feedbackHref(usePathname() ?? "/", learnerId)} data-testid="feedback-link-phone" className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-accent underline md:hidden">
      {appFeedback.link}
    </Link>
  );
}
```

(`git add components/shell` in Step 7 includes it.)

- [ ] **Step 6: Run the test**

Run: `npx vitest run tests/unit/shellUi.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/shell tests/unit/shellUi.test.ts
git commit -m "feat(shell): StaffShell with sticky sidebar, phone drawer, child switcher, feedback link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 5: Layout cho mọi trang của một em  *(builder · Sonnet)*

**Files:**
- Create: `app/learners/[id]/layout.tsx`
- Test: `tests/unit/shellLayout.test.ts`

**Interfaces:**
- Consumes: `requireShell(hint, { strict: true })` (Task 3), `StaffShell` (Task 4).
- Produces: every page under `app/learners/[id]/` is rendered inside the shell of child `[id]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shellLayout.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/learners/l1/weak" }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
const requireShell = vi.fn();
vi.mock("@/lib/shell/load", () => ({ requireShell: (...a: unknown[]) => requireShell(...a) }));

import LearnerLayout from "@/app/learners/[id]/layout";

const shell = { displayName: "Thầy", role: "tutor", memberId: "m", learners: [{ id: "l1", alias: "An (thử)", trackId: "A", status: "active", isTest: true, color: null }], revisionsReady: true };

describe("app/learners/[id]/layout", () => {
  it("asks for the shell of the child in the URL, strictly", async () => {
    requireShell.mockResolvedValue({ ...shell, current: shell.learners[0] });
    const html = renderToStaticMarkup(await LearnerLayout({ params: Promise.resolve({ id: "l1" }), children: createElement("p", null, "PAGE") }));
    expect(requireShell).toHaveBeenCalledWith("l1", { strict: true });
    expect(html).toContain('data-testid="staff-shell"');
    expect(html).toContain("PAGE");
  });
  it("a student / a child outside the scope: requireShell throws (notFound) and nothing is rendered", async () => {
    requireShell.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(LearnerLayout({ params: Promise.resolve({ id: "x" }), children: null })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/shellLayout.test.ts`
Expected: FAIL — `Cannot find module '@/app/learners/[id]/layout'`.

- [ ] **Step 3: Implement**

```tsx
// app/learners/[id]/layout.tsx
import { StaffShell } from "@/components/shell/StaffShell";
import { requireShell } from "@/lib/shell/load";

export const dynamic = "force-dynamic";

/**
 * Every /learners/[id]/** page is a staff page about one child: the workdesk shell of that child. A student, or a child outside the
 * caller's scope (or a real child while ALLOW_REAL_LEARNERS=false) → plain 404 here; each page still checks its own action.
 */
export default async function LearnerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shell = await requireShell(id, { strict: true });
  return <StaffShell shell={shell}>{children}</StaffShell>;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/shellLayout.test.ts && npm run typecheck`
Expected: PASS. (Pages still render their own `AppHeader` until Task 6 — do **not** open a preview between Task 5 and Task 6.)

- [ ] **Step 5: Commit**

```bash
git add "app/learners/[id]/layout.tsx" tests/unit/shellLayout.test.ts
git commit -m "feat(shell): one layout gives every child page the workdesk shell (strict scope)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 6: Gỡ `AppHeader` / `<main>` khỏi 17 trang của một em  *(chore · Haiku — cơ học, có test canh)*

**Files:**
- Modify (17): `app/learners/[id]/assign/page.tsx`, `curricula/page.tsx`, `curricula/[curriculumId]/page.tsx`, `delete/page.tsx`, `inquiries/page.tsx`, `levels/page.tsx`, `levels/adjust/page.tsx`, `levels/baseline/page.tsx`, `levels/external/new/page.tsx`, `notes/page.tsx`, `notes/new/page.tsx`, `reading/new/page.tsx`, `results/new/page.tsx`, `revisions/page.tsx`, `revisions/[attemptId]/page.tsx`, `targets/page.tsx`, `weak/page.tsx` (all under `app/learners/[id]/`)
- Create: `tests/unit/shellPages.test.ts`

**Interfaces:**
- Consumes: the layout (Task 5) now gives header + `<main>`.
- Produces: guard test reused by Task 12 and by W3.

- [ ] **Step 1: Write the failing guard test**

```ts
// tests/unit/shellPages.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
function filesUnder(rel: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (keep(name)) out.push(path.relative(root, p));
    }
  };
  walk(path.join(root, rel));
  return out;
}
const pagesUnder = (rel: string) => filesUnder(rel, (n) => n === "page.tsx");

describe("workdesk shell wiring", () => {
  it("pages of one child render no AppHeader and no <main> (app/learners/[id]/layout.tsx gives both)", () => {
    const files = pagesUnder("app/learners/[id]");
    expect(files.length).toBeGreaterThanOrEqual(17);
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/AppHeader/);
      expect(src, f).not.toMatch(/<main\b/);
    }
  });
  it("student pages never import the staff shell", () => {
    const files = [...pagesUnder("app/practice"), ...pagesUnder("app/activities"), ...filesUnder("components/student", (n) => /\.tsx?$/.test(n))];
    for (const f of files) expect(read(f), f).not.toMatch(/components\/shell/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/shellPages.test.ts`
Expected: FAIL — 17 files still contain `AppHeader`.

- [ ] **Step 3: Edit each of the 17 pages with exactly these rules**

For every file (check every `return` branch: `grep -n "AppHeader\|<main\|</main>" <file>`):
1. Delete the line `import { AppHeader } from "@/components/AppHeader";`.
2. Delete every `<AppHeader … />` element.
3. Replace `<main className="mx-auto max-w-… px-4 py-10 …" …>` with `<div className="mx-auto max-w-… …" …>` — keep `mx-auto`, the `max-w-*` class, every other class except `px-4`, `py-*`, `sm:px-*`, and keep every attribute (`data-testid`, `data-status`, …). Replace the matching `</main>` with `</div>`.
4. If a page wrapped header + main in a fragment `<>…</>` that now has one child, the fragment may stay (no behaviour change) or go.
5. Remove imports that became unused (usually `appFeedback`, sometimes `curriculumCopy` when it was only used for `feedbackScreen`). `npm run lint` lists them.
6. Change nothing else (back links stay — plan K12).

Example (`app/learners/[id]/weak/page.tsx`):

```diff
-import { AppHeader } from "@/components/AppHeader";
 …
-    <>
-      <AppHeader name={member.displayName} showTestBadge={learner.isTest} feedbackScreen={appFeedback.screens.weak} />
-      <main className="mx-auto max-w-4xl px-4 py-10" data-testid="weak-page">
+    <>
+      <div className="mx-auto max-w-4xl" data-testid="weak-page">
 …
-      </main>
+      </div>
     </>
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/shellPages.test.ts tests/unit/revisionsPage.test.ts tests/unit/deployOrder.test.ts && npm run typecheck && npm run lint`
Expected: PASS (the `LearnerCard` part of `revisionsPage.test.ts` still passes — `LearnerCard` is removed in Task 10).

- [ ] **Step 5: Commit**

```bash
git add "app/learners/[id]" tests/unit/shellPages.test.ts
git commit -m "refactor(shell): child pages drop AppHeader and <main>; guard test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 7: Dòng "Chờ duyệt" thuần (`buildPendingRows`) + `pendingCopy`  *(builder · Sonnet)*

**Files:**
- Create: `lib/desk/pending.ts`
- Modify: `lib/copy/vi.ts` (add `pendingCopy` after `shellCopy`)
- Test: `tests/unit/deskPending.test.ts`

**Interfaces:**
- Consumes: `type InboxItem` (`lib/review/types.ts`), `type PendingAttempt`, `type DraftListItem` (`lib/studio/types.ts`), `type SkillInboxItem` (`lib/skills/types.ts`), `type CurriculumCard` (`lib/curriculum/shape.ts`), `proposalTitle(i: SkillInboxItem): string` (`lib/skills/view.ts`).
- Produces:
  - `PENDING_GROUPS = ["all", "work", "check", "ai", "skills"] as const`; `type PendingGroup`
  - `type PendingKind = "work" | "studio_check" | "studio_draft" | "curriculum_draft" | "skill" | "flag"`
  - `type PendingRow = { key: string; kind: PendingKind; group: Exclude<PendingGroup, "all">; label: string; title: string; since: string | null; need: string; href: string; waitingTutor: boolean }`
  - `type PendingInput = { learnerId: string; role: "tutor" | "parent"; work: readonly InboxItem[]; studio: readonly PendingAttempt[]; skills: readonly SkillInboxItem[]; drafts: readonly DraftListItem[]; curricula: readonly CurriculumCard[] }`
  - `PENDING_LOAD_LIMIT = 200`
  - `buildPendingRows(i: PendingInput): PendingRow[]` (oldest first, no date last)
  - `filterRows(rows: readonly PendingRow[], g: PendingGroup): PendingRow[]`, `countGroups(rows: readonly PendingRow[]): Record<PendingGroup, number>`, `parseGroup(v: string | string[] | undefined): PendingGroup`

- [ ] **Step 1: Add the copy**

```ts
// lib/copy/vi.ts — after shellCopy
export const pendingCopy = {
  title: (alias: string) => `Chờ duyệt · ${alias}`,
  intro: `Bài con nộp và nháp AI đang chờ ${tutorHonorific}. Mục cũ nhất ở trên. Mở từng mục ra xem, sửa rồi mới duyệt ở trang đó.`,
  filtersLabel: "Lọc việc chờ",
  groups: { all: "Tất cả", work: "Bài nộp", check: "Cần xem câu", ai: "Nháp AI", skills: "Kỹ năng" },
  groupCount: (label: string, n: number) => `${label} (${n})`,
  cols: { kind: "Loại", content: "Nội dung", since: "Từ ngày", need: "Cần làm" },
  kinds: {
    work: "Bài nộp",
    studioCheck: `Cần ${tutorHonorific} xem`,
    studioDraft: "Nháp AI · đề",
    curriculumDraft: "Nháp AI · giáo trình",
    skill: "Đề xuất kỹ năng",
    flag: "⚑ Cần xem lại",
  },
  need: {
    studioCheck: (n: number) => `${n} câu cần xem`,
    studioDraft: "Xem nháp, sửa rồi duyệt",
    curriculumDraft: "Duyệt Unit và bảng nối",
    aiFailed: "AI chưa đọc được · soạn tay",
    skill: "Xem điều kiện rồi xác nhận",
    flag: "Xem bằng chứng",
  },
  open: "Mở",
  noDate: "—",
  empty: "Không có gì chờ duyệt.",
  emptyGroup: "Không có mục nào ở nhóm này.",
  failed: (what: string) => `Chưa đọc được phần “${what}”. Các phần khác vẫn đúng.`,
  sources: { work: "Bài làm", studio: `Cần ${tutorHonorific} xem`, skills: "Kỹ năng", drafts: "Nháp đề", curricula: "Giáo trình" },
  more: "Còn bài khác chưa hiện ở đây. Mở Hộp duyệt đầy đủ.",
  fullInbox: "Hộp duyệt đầy đủ",
  deskTitle: (n: number) => `Chờ duyệt · ${n}`,
  deskOpenAll: "Mở tất cả",
  deskMore: (n: number) => `+ ${n} mục nữa`,
  deskPartial: "Có phần chưa đọc được; mở Chờ duyệt để xem.",
} as const;
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/deskPending.test.ts
import { describe, expect, it } from "vitest";
import { pendingCopy, reviewPage, revisionReviewCopy } from "@/lib/copy/vi";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import { buildPendingRows, countGroups, filterRows, parseGroup, type PendingInput } from "@/lib/desk/pending";
import type { InboxItem } from "@/lib/review/types";
import type { SkillInboxItem } from "@/lib/skills/types";
import type { DraftListItem, PendingAttempt } from "@/lib/studio/types";

const L = "a0000000-0000-4000-8000-000000000001";
const O = "b0000000-0000-4000-8000-000000000002";
const work = (over: Partial<InboxItem> = {}): InboxItem => ({
  episodeId: "e1", attemptId: "a1", learnerId: L, alias: "An (thử)", isTest: true, titleVi: "Núi lửa", stepNo: 7, activityType: "ACT-WRITE", mode: "PRACTICE",
  purpose: [], provenance: "in_app", attemptNo: 1, isFirstAttempt: true, submittedAt: "2026-11-02T03:00:00Z", restricted: false, category: "practice",
  targetsTotal: 2, targetsDecided: 0, canDecide: true, revisionRound: null, ...over,
});
const studio = (over: Partial<PendingAttempt> = {}): PendingAttempt => ({ attemptId: "s1", learnerId: L, alias: "An (thử)", isTest: true, activityId: "act", title: "Unit 5 test", submittedAt: "2026-11-01T03:00:00Z", attemptNo: 1, waitingDays: 3, items: [{ itemId: "i1", n: 4, kind: "gap", stem: "x", expected: "y", accepted: [], given: "z" }], ...over });
const skill = (over: Partial<SkillInboxItem> = {}): SkillInboxItem => ({ id: "k1", kind: "PROPOSED", learnerId: L, alias: "An (thử)", isTest: true, targetKey: "A-L3-CAUSE-S", titleVi: "Nêu nguyên nhân", fromState: "DEVELOPING", toState: "INDEPENDENT", currentState: "DEVELOPING", route: 1, conditions: [], evidence: [], createdAt: "2026-11-03T03:00:00Z", canDecide: true, ...over } as SkillInboxItem);
const draft = (over: Partial<DraftListItem> = {}): DraftListItem => ({ id: "d1", title: "Destination U5", status: "draft", updatedAt: "2026-11-04T03:00:00Z", templateId: null, templateVersion: null, superseded: false, assigned: 0, ...over });
const card = (over: Partial<CurriculumCard> = {}): CurriculumCard => ({ id: "c1", title: "Destination C1&C2", levelNote: null, current: null, progress: null, open: { versionId: "v1", version: 1, status: "draft", errorCode: null }, events: [], ...over });
const input = (over: Partial<PendingInput> = {}): PendingInput => ({ learnerId: L, role: "tutor", work: [work()], studio: [studio()], skills: [skill(), skill({ id: "k2", kind: "FLAG" })], drafts: [draft()], curricula: [card()], ...over });

describe("Chờ duyệt rows", () => {
  it("one row per waiting item of THIS child, oldest first, undated last", () => {
    const rows = buildPendingRows(input({ work: [work(), work({ episodeId: "e9", learnerId: O })], studio: [studio(), studio({ attemptId: "s9", learnerId: O })] }));
    expect(rows.map((r) => r.key)).toEqual(["studio-s1", "work-e1", "skill-k1", "skill-k2", "draft-d1", "curriculum-v1"]);
    expect(rows.every((r) => !r.key.endsWith("9"))).toBe(true);
  });
  it("every row opens an existing detail page (no decision in the table)", () => {
    const byKey = Object.fromEntries(buildPendingRows(input()).map((r) => [r.key, r.href]));
    expect(byKey).toEqual({
      "studio-s1": "/review/studio#studio-s1",
      "work-e1": "/review/e1",
      "skill-k1": "/review/skills#skill-k1",
      "skill-k2": "/review/skills#skill-k2",
      "draft-d1": "/studio/drafts/d1",
      "curriculum-v1": "/curricula/versions/v1",
    });
  });
  it("labels and 'Cần làm'", () => {
    const rows = buildPendingRows(input({ work: [work(), work({ episodeId: "e2", revisionRound: 2, mode: "REVISION" })] }));
    const r = (k: string) => rows.find((x) => x.key === k)!;
    expect(r("work-e1")).toMatchObject({ label: pendingCopy.kinds.work, need: reviewPage.progress(0, 2), group: "work" });
    expect(r("work-e2")).toMatchObject({ label: revisionReviewCopy.inboxLabel(2), need: revisionReviewCopy.inboxProgress });
    expect(r("studio-s1")).toMatchObject({ label: pendingCopy.kinds.studioCheck, need: pendingCopy.need.studioCheck(1), group: "check" });
    expect(r("skill-k2")).toMatchObject({ kind: "flag", label: pendingCopy.kinds.flag, group: "skills" });
    expect(r("draft-d1")).toMatchObject({ group: "ai", need: pendingCopy.need.studioDraft });
    expect(r("curriculum-v1")).toMatchObject({ group: "ai", since: null, need: pendingCopy.need.curriculumDraft });
  });
  it("leaves out what does not wait: superseded / approved / reading drafts, approved curricula", () => {
    const rows = buildPendingRows(input({
      drafts: [draft({ id: "x1", superseded: true }), draft({ id: "x2", status: "approved" }), draft({ id: "x3", status: "extracting" }), draft({ id: "x4", status: "ai_failed" })],
      curricula: [card({ id: "c2", open: null }), card({ id: "c3", open: { versionId: "v3", version: 2, status: "extracting", errorCode: null } })],
    }));
    expect(rows.filter((r) => r.kind === "studio_draft").map((r) => r.key)).toEqual(["draft-x4"]);
    expect(rows.find((r) => r.key === "draft-x4")!.need).toBe(pendingCopy.need.aiFailed);
    expect(rows.some((r) => r.kind === "curriculum_draft")).toBe(false);
  });
  it("parent: in-class work, skill proposals and curriculum approval wait for the tutor", () => {
    const rows = buildPendingRows(input({ role: "parent", work: [work({ canDecide: false })], skills: [skill({ canDecide: false })] }));
    expect(rows.find((r) => r.key === "work-e1")!.waitingTutor).toBe(true);
    expect(rows.find((r) => r.key === "skill-k1")!.waitingTutor).toBe(true);
    expect(rows.find((r) => r.key === "curriculum-v1")!.waitingTutor).toBe(true);
    expect(rows.find((r) => r.key === "draft-d1")!.waitingTutor).toBe(false);
  });
  it("filters, counts, parses the group", () => {
    const rows = buildPendingRows(input());
    expect(countGroups(rows)).toEqual({ all: 6, work: 1, check: 1, ai: 2, skills: 2 });
    expect(filterRows(rows, "ai").map((r) => r.kind)).toEqual(["studio_draft", "curriculum_draft"]);
    expect(filterRows(rows, "all")).toHaveLength(6);
    expect(parseGroup("skills")).toBe("skills");
    expect(parseGroup(["ai", "work"])).toBe("ai");
    expect(parseGroup("bogus")).toBe("all");
    expect(parseGroup(undefined)).toBe("all");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/unit/deskPending.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// lib/desk/pending.ts
/**
 * "Chờ duyệt" of one child as one compact list (spec §3, §5 rule 4): every source that already waits for an adult, oldest first.
 * Pure. A row only LINKS to the page where the decision is made (DOMAIN R1, spec §3: no one-click approval) — it decides nothing.
 */
import { activityLabels, curriculumCopy, fallbackLabels, pendingCopy, reviewPage, revisionReviewCopy } from "@/lib/copy/vi";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import type { InboxItem } from "@/lib/review/types";
import type { SkillInboxItem } from "@/lib/skills/types";
import { proposalTitle } from "@/lib/skills/view";
import type { DraftListItem, PendingAttempt } from "@/lib/studio/types";

export const PENDING_GROUPS = ["all", "work", "check", "ai", "skills"] as const;
export type PendingGroup = (typeof PENDING_GROUPS)[number];
export type PendingKind = "work" | "studio_check" | "studio_draft" | "curriculum_draft" | "skill" | "flag";
export type PendingRow = { key: string; kind: PendingKind; group: Exclude<PendingGroup, "all">; label: string; title: string; since: string | null; need: string; href: string; waitingTutor: boolean };
export type PendingInput = {
  learnerId: string;
  role: "tutor" | "parent";
  work: readonly InboxItem[];
  studio: readonly PendingAttempt[];
  skills: readonly SkillInboxItem[];
  /** Drafts of THIS child (loadDraftList is per child). */
  drafts: readonly DraftListItem[];
  /** Curricula of THIS child (loadCurriculumCards is per child). */
  curricula: readonly CurriculumCard[];
};
/** How many S5 inbox rows are read for one child's list; more → "Còn bài khác" + link to the full inbox. */
export const PENDING_LOAD_LIMIT = 200;

const GROUP_OF: Record<PendingKind, Exclude<PendingGroup, "all">> = { work: "work", studio_check: "check", studio_draft: "ai", curriculum_draft: "ai", skill: "skills", flag: "skills" };
const WAITING = ["draft", "ai_failed"] as const;
const isWaiting = (s: string) => (WAITING as readonly string[]).includes(s);

function byOldest(a: PendingRow, b: PendingRow): number {
  if (a.since === null || b.since === null) return a.since === b.since ? a.key.localeCompare(b.key) : a.since === null ? 1 : -1;
  return Date.parse(a.since) - Date.parse(b.since) || a.key.localeCompare(b.key);
}

export function buildPendingRows(i: PendingInput): PendingRow[] {
  const rows: PendingRow[] = [];
  const push = (r: Omit<PendingRow, "group">) => rows.push({ ...r, group: GROUP_OF[r.kind] });
  for (const w of i.work) {
    if (w.learnerId !== i.learnerId) continue;
    push({
      key: `work-${w.episodeId}`, kind: "work",
      label: w.revisionRound ? revisionReviewCopy.inboxLabel(w.revisionRound) : pendingCopy.kinds.work,
      title: `${w.titleVi} · ${activityLabels[w.activityType] ?? fallbackLabels.activity}`,
      since: w.submittedAt,
      need: w.revisionRound ? revisionReviewCopy.inboxProgress : reviewPage.progress(w.targetsDecided, w.targetsTotal),
      href: `/review/${w.episodeId}`, waitingTutor: !w.canDecide,
    });
  }
  for (const a of i.studio) {
    if (a.learnerId !== i.learnerId) continue;
    push({ key: `studio-${a.attemptId}`, kind: "studio_check", label: pendingCopy.kinds.studioCheck, title: a.title, since: a.submittedAt, need: pendingCopy.need.studioCheck(a.items.length), href: `/review/studio#studio-${a.attemptId}`, waitingTutor: false });
  }
  for (const s of i.skills) {
    if (s.learnerId !== i.learnerId) continue;
    const flag = s.kind === "FLAG";
    push({ key: `skill-${s.id}`, kind: flag ? "flag" : "skill", label: flag ? pendingCopy.kinds.flag : pendingCopy.kinds.skill, title: proposalTitle(s), since: s.createdAt, need: flag ? pendingCopy.need.flag : pendingCopy.need.skill, href: `/review/skills#skill-${s.id}`, waitingTutor: !s.canDecide });
  }
  for (const d of i.drafts) {
    if (d.superseded || !isWaiting(d.status)) continue;
    push({ key: `draft-${d.id}`, kind: "studio_draft", label: pendingCopy.kinds.studioDraft, title: d.title, since: d.updatedAt, need: d.status === "ai_failed" ? pendingCopy.need.aiFailed : pendingCopy.need.studioDraft, href: `/studio/drafts/${d.id}`, waitingTutor: false });
  }
  for (const c of i.curricula) {
    if (!c.open || !isWaiting(c.open.status)) continue;
    push({
      key: `curriculum-${c.open.versionId}`, kind: "curriculum_draft", label: pendingCopy.kinds.curriculumDraft,
      title: curriculumCopy.reviewTitle(c.title, c.open.version), since: null,
      need: c.open.status === "ai_failed" ? pendingCopy.need.aiFailed : pendingCopy.need.curriculumDraft,
      href: `/curricula/versions/${c.open.versionId}`,
      // Only the child's tutor approves a curriculum (D-W8); the parent may only discard a draft.
      waitingTutor: i.role !== "tutor" && c.open.status === "draft",
    });
  }
  return rows.sort(byOldest);
}

export function filterRows(rows: readonly PendingRow[], g: PendingGroup): PendingRow[] {
  return g === "all" ? [...rows] : rows.filter((r) => r.group === g);
}

export function countGroups(rows: readonly PendingRow[]): Record<PendingGroup, number> {
  const out: Record<PendingGroup, number> = { all: rows.length, work: 0, check: 0, ai: 0, skills: 0 };
  for (const r of rows) out[r.group] += 1;
  return out;
}

export function parseGroup(v: string | string[] | undefined): PendingGroup {
  const s = Array.isArray(v) ? v[0] : v;
  return (PENDING_GROUPS as readonly string[]).includes(s ?? "") ? (s as PendingGroup) : "all";
}
```

If the `curricula` row in the test fails on `curriculumCopy.reviewTitle` arity, read its signature in `lib/copy/vi.ts` (used as `curriculumCopy.reviewTitle(v.title, v.version)` in `app/curricula/versions/[id]/page.tsx`) and match it. If `SkillInboxItem` fixture types fail (`route`, `Condition`), keep the `as SkillInboxItem` cast in the test only.

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/unit/deskPending.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/desk/pending.ts lib/copy/vi.ts tests/unit/deskPending.test.ts
git commit -m "feat(desk): one compact 'Chờ duyệt' list per child from the existing inboxes (links only)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 8: Loader mềm + trang `/learners/[id]/inbox` + neo trên thẻ cũ  *(builder · Sonnet)*

**Files:**
- Create: `lib/desk/load.ts` (only `loadPendingRows` now; `loadDesk` is added in Task 10), `components/desk/PendingTable.tsx`, `app/learners/[id]/inbox/page.tsx`
- Modify: `components/review/StudioPendingCard.tsx` (the `<li data-testid={`studio-card-…`}>` gets `id={`studio-${attempt.attemptId}`}` and class `scroll-mt-4`), `components/skills/SkillProposalCard.tsx` (the `<li data-testid={`skill-proposal-…`}>` gets `id={`skill-${item.id}`}` and `scroll-mt-4`)
- Test: `tests/unit/deskLoad.test.ts`, `tests/unit/pendingPage.test.ts`

**Interfaces:**
- Consumes: `buildPendingRows`, `PENDING_LOAD_LIMIT`, `filterRows`, `countGroups`, `parseGroup`, `PENDING_GROUPS` (Task 7); `loadInbox(filter, after, limit)` (`lib/review/load.ts`), `loadStudioPending(memberId)` (`lib/studio/load.ts`), `loadSkillInbox(memberId)` (`lib/skills/load.ts`), `loadDraftList(learnerId)` (`lib/studio/load.ts`, admin — call after the gate), `loadCurriculumCards(learnerId)` (`lib/curriculum/load.ts`); `requireLearnerPage(id, "work:review")` (`lib/tutorwork/page.ts`).
- Produces: `type PendingSource = "work" | "studio" | "skills" | "drafts" | "curricula"`; `type PendingRowsResult = { rows: PendingRow[]; failed: PendingSource[]; more: boolean }`; `loadPendingRows(memberId: string, role: "tutor" | "parent", learnerId: string): Promise<PendingRowsResult>` (never throws); `PendingTable({ learnerId, rows, group, counts })`.

- [ ] **Step 1: Write the failing loader test**

```ts
// tests/unit/deskLoad.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = { loadInbox: vi.fn(), loadStudioPending: vi.fn(), loadSkillInbox: vi.fn(), loadDraftList: vi.fn(), loadCurriculumCards: vi.fn() };
vi.mock("@/lib/review/load", () => ({ loadInbox: (...a: unknown[]) => m.loadInbox(...a) }));
vi.mock("@/lib/studio/load", () => ({ loadStudioPending: (...a: unknown[]) => m.loadStudioPending(...a), loadDraftList: (...a: unknown[]) => m.loadDraftList(...a), loadAiSettings: vi.fn() }));
vi.mock("@/lib/skills/load", () => ({ loadSkillInbox: (...a: unknown[]) => m.loadSkillInbox(...a) }));
vi.mock("@/lib/curriculum/load", () => ({ loadCurriculumCards: (...a: unknown[]) => m.loadCurriculumCards(...a) }));
vi.mock("@/lib/tutorwork/load", () => ({ loadToday: vi.fn() }));
vi.mock("@/lib/workdesk/load", () => ({ loadIntake: vi.fn() }));
vi.mock("@/lib/levels/load", () => ({ loadLevelProfile: vi.fn(), loadRecentLevelChanges: vi.fn() }));

import { loadPendingRows } from "@/lib/desk/load";
import { PENDING_LOAD_LIMIT } from "@/lib/desk/pending";

beforeEach(() => {
  m.loadInbox.mockResolvedValue({ items: [], next: null, counts: {} });
  m.loadStudioPending.mockResolvedValue({ count: 0, attempts: [] });
  m.loadSkillInbox.mockResolvedValue({ open: 0, decidable: 0, items: [] });
  m.loadDraftList.mockResolvedValue([]);
  m.loadCurriculumCards.mockResolvedValue([]);
});

describe("loadPendingRows", () => {
  it("reads the S5 inbox (todo) with the larger limit, and the per-child sources for this child", async () => {
    await loadPendingRows("m1", "tutor", "L1");
    expect(m.loadInbox).toHaveBeenCalledWith("todo", null, PENDING_LOAD_LIMIT);
    expect(m.loadStudioPending).toHaveBeenCalledWith("m1");
    expect(m.loadSkillInbox).toHaveBeenCalledWith("m1");
    expect(m.loadDraftList).toHaveBeenCalledWith("L1");
    expect(m.loadCurriculumCards).toHaveBeenCalledWith("L1");
  });
  it("one failing / not-ready source does not take the page down: it is named in `failed`", async () => {
    m.loadStudioPending.mockResolvedValue(null); // 0024 not applied
    m.loadDraftList.mockRejectedValue(new Error("eng_studio_drafts failed"));
    const r = await loadPendingRows("m1", "tutor", "L1");
    expect(r.failed).toEqual(["studio", "drafts"]);
    expect(r.rows).toEqual([]);
  });
  it("`more` when the S5 inbox has another page", async () => {
    m.loadInbox.mockResolvedValue({ items: [], next: { at: "2026-11-01T00:00:00Z", id: "x" }, counts: {} });
    expect((await loadPendingRows("m1", "parent", "L1")).more).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/deskLoad.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the loader**

```ts
// lib/desk/load.ts
import "server-only";
import { loadCurriculumCards } from "@/lib/curriculum/load";
import { loadInbox } from "@/lib/review/load";
import { loadSkillInbox } from "@/lib/skills/load";
import { loadDraftList, loadStudioPending } from "@/lib/studio/load";
import { buildPendingRows, PENDING_LOAD_LIMIT, type PendingRow } from "./pending";

export type PendingSource = "work" | "studio" | "skills" | "drafts" | "curricula";
export type PendingRowsResult = { rows: PendingRow[]; failed: PendingSource[]; more: boolean };

async function settle<T>(p: Promise<T | null>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/**
 * "Chờ duyệt" of one child. Call ONLY after the page gate of that child (loadDraftList uses the admin client). Never throws: a source
 * that cannot be read (error, or null before its migration) is listed in `failed` and the others still show.
 */
export async function loadPendingRows(memberId: string, role: "tutor" | "parent", learnerId: string): Promise<PendingRowsResult> {
  const [work, studio, skills, drafts, curricula] = await Promise.all([
    settle(loadInbox("todo", null, PENDING_LOAD_LIMIT)),
    settle(loadStudioPending(memberId)),
    settle(loadSkillInbox(memberId)),
    settle(loadDraftList(learnerId)),
    settle(loadCurriculumCards(learnerId)),
  ]);
  const failed: PendingSource[] = [];
  if (work === null) failed.push("work");
  if (studio === null) failed.push("studio");
  if (skills === null) failed.push("skills");
  if (drafts === null) failed.push("drafts");
  if (curricula === null) failed.push("curricula");
  return {
    rows: buildPendingRows({ learnerId, role, work: work?.items ?? [], studio: studio?.attempts ?? [], skills: skills?.items ?? [], drafts: drafts ?? [], curricula: curricula ?? [] }),
    failed,
    more: (work?.next ?? null) !== null,
  };
}
```

- [ ] **Step 4: Write the failing page test**

```ts
// tests/unit/pendingPage.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { pendingCopy } from "@/lib/copy/vi";
import type { PendingRow } from "@/lib/desk/pending";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { ...p, href: p.href }, p.children) }));
vi.mock("@/lib/tutorwork/page", () => ({ requireLearnerPage: async () => ({ member: { id: "m1", role: "tutor", displayName: "Thầy" }, learner: { id: "L1", alias: "An (thử)", trackId: "A", isTest: true } }) }));
const loadPendingRows = vi.fn();
vi.mock("@/lib/desk/load", () => ({ loadPendingRows: (...a: unknown[]) => loadPendingRows(...a) }));

import PendingPage from "@/app/learners/[id]/inbox/page";

const row = (key: string, group: PendingRow["group"], since: string | null): PendingRow => ({ key, kind: group === "work" ? "work" : group === "ai" ? "studio_draft" : group === "check" ? "studio_check" : "skill", group, label: "L", title: `T-${key}`, since, need: "N", href: `/review/${key}`, waitingTutor: false });
const render = async (f?: string) => renderToStaticMarkup(await PendingPage({ params: Promise.resolve({ id: "L1" }), searchParams: Promise.resolve(f ? { f } : {}) }));

describe("Chờ duyệt page", () => {
  it("lists every row with one 'Mở' link and no button at all", async () => {
    loadPendingRows.mockResolvedValue({ rows: [row("e1", "work", "2026-11-01T00:00:00Z"), row("d1", "ai", null)], failed: [], more: false });
    const html = await render();
    expect(html).toContain('data-testid="pending-page"');
    expect(html).toContain(pendingCopy.title("An (thử)"));
    expect(html).toContain('data-testid="pending-row-e1"');
    expect(html).toContain('href="/review/e1"');
    expect(html).toContain(pendingCopy.noDate);
    expect(html).not.toMatch(/<button\b/);
  });
  it("?f= filters the rows; chips show the counts of all groups", async () => {
    loadPendingRows.mockResolvedValue({ rows: [row("e1", "work", "2026-11-01T00:00:00Z"), row("d1", "ai", null)], failed: [], more: false });
    const html = await render("ai");
    expect(html).not.toContain('data-testid="pending-row-e1"');
    expect(html).toContain('data-testid="pending-row-d1"');
    expect(html).toContain(pendingCopy.groupCount(pendingCopy.groups.work, 1));
    expect(html).toContain(pendingCopy.groupCount(pendingCopy.groups.all, 2));
  });
  it("names a source that could not be read; links to the full inbox when there is more", async () => {
    loadPendingRows.mockResolvedValue({ rows: [], failed: ["studio"], more: true });
    const html = await render();
    expect(html).toContain('data-testid="pending-failed-studio"');
    expect(html).toContain(pendingCopy.failed(pendingCopy.sources.studio));
    expect(html).toContain('data-testid="pending-more"');
    expect(html).toContain('href="/review?learner=L1"');
    expect(html).toContain('data-testid="pending-empty"');
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `npx vitest run tests/unit/pendingPage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement the table and the page**

```tsx
// components/desk/PendingTable.tsx
import Link from "next/link";
import { pendingCopy, reviewPage } from "@/lib/copy/vi";
import { PENDING_GROUPS, type PendingGroup, type PendingRow } from "@/lib/desk/pending";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";

const GRID = "md:grid-cols-[200px_minmax(0,1fr)_100px_180px_96px]";
const pill = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";

/** Spec §5 rule 4: one line per item — Loại · Nội dung · Từ ngày · Cần làm · Mở; filter by type; oldest first; fixed-width action column. */
export function PendingTable({ learnerId, rows, group, counts }: { learnerId: string; rows: PendingRow[]; group: PendingGroup; counts: Record<PendingGroup, number> }) {
  const base = `/learners/${learnerId}/inbox`;
  const c = pendingCopy.cols;
  return (
    <>
      <nav aria-label={pendingCopy.filtersLabel} className="flex flex-wrap gap-2">
        {PENDING_GROUPS.map((g) => (
          <Link key={g} href={g === "all" ? base : `${base}?f=${g}`} aria-current={g === group ? "true" : undefined} data-testid={`pending-filter-${g}`}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm no-underline ${g === group ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-ink hover:border-accent"}`}>
            {pendingCopy.groupCount(pendingCopy.groups[g], counts[g])}
          </Link>
        ))}
      </nav>
      <section className="mt-4 rounded-xl border border-line bg-white" data-testid="pending-table">
        <div aria-hidden="true" className={`hidden gap-3 border-b border-line px-4 py-2 text-xs font-semibold text-muted md:grid ${GRID}`}>
          <span>{c.kind}</span><span>{c.content}</span><span>{c.since}</span><span>{c.need}</span><span />
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted" data-testid="pending-empty">{group === "all" ? pendingCopy.empty : pendingCopy.emptyGroup}</p>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.key} data-testid={`pending-row-${r.key}`} className={`grid gap-1 border-b border-[#eceee8] px-4 py-3 text-sm last:border-b-0 md:items-center md:gap-3 ${GRID}`}>
                <span><span className="md:sr-only">{c.kind}: </span><span className={`${pill} ${r.group === "work" ? "bg-[#eceee8] text-[#3d433f]" : "bg-[#e4ebf5] text-[#1f3f6e]"}`}>{r.label}</span></span>
                <span className="min-w-0 break-words"><span className="md:sr-only">{c.content}: </span>{r.title}</span>
                <span className="tabular-nums"><span className="md:sr-only">{c.since}: </span>{r.since ? formatDateVi(todayVn(new Date(r.since))) : pendingCopy.noDate}</span>
                <span>
                  <span className="md:sr-only">{c.need}: </span>{r.need}
                  {r.waitingTutor ? <span className={`ml-2 ${pill} border border-line`}>{reviewPage.waitingTutor}</span> : null}
                </span>
                <span className="md:justify-self-end">
                  <Link href={r.href} data-testid={`pending-open-${r.key}`} className="inline-flex min-h-11 w-24 items-center justify-center rounded-lg border border-accent text-sm font-semibold text-accent no-underline hover:bg-accent hover:text-white">
                    {pendingCopy.open}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
```

```tsx
// app/learners/[id]/inbox/page.tsx
import Link from "next/link";
import { PendingTable } from "@/components/desk/PendingTable";
import { pendingCopy } from "@/lib/copy/vi";
import { loadPendingRows } from "@/lib/desk/load";
import { countGroups, filterRows, parseGroup } from "@/lib/desk/pending";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Chờ duyệt" of one child (tutor and parent; students 404 in the layout). Lists and links only — decisions stay on the detail pages. */
export default async function PendingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "work:review");
  const group = parseGroup(sp.f);
  const { rows, failed, more } = await loadPendingRows(member.id, member.role === "parent" ? "parent" : "tutor", learner.id);
  return (
    <div className="flex flex-col gap-4" data-testid="pending-page">
      <div>
        <h1 className="text-2xl font-bold">{pendingCopy.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{pendingCopy.intro}</p>
      </div>
      {failed.map((s) => (
        <p key={s} role="status" data-testid={`pending-failed-${s}`} className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-muted">
          {pendingCopy.failed(pendingCopy.sources[s])}
        </p>
      ))}
      <PendingTable learnerId={learner.id} rows={filterRows(rows, group)} group={group} counts={countGroups(rows)} />
      {more ? (
        <Link href={`/review?learner=${learner.id}`} data-testid="pending-more" className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">
          {pendingCopy.more}
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: Add the anchors** on the two existing cards (no behaviour change): in `components/review/StudioPendingCard.tsx` the root `<li data-testid={`studio-card-${attempt.attemptId}`} className="…">` becomes `<li id={`studio-${attempt.attemptId}`} data-testid={`studio-card-${attempt.attemptId}`} className="scroll-mt-4 …">`; in `components/skills/SkillProposalCard.tsx` the root `<li className="…" data-testid={`skill-proposal-${item.targetKey}`} …>` gets `id={`skill-${item.id}`}` and `scroll-mt-4`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/unit/deskLoad.test.ts tests/unit/pendingPage.test.ts tests/unit/shellPages.test.ts && npm run typecheck && npm run lint`
Expected: PASS (the new page has no `AppHeader` / `<main>`, so the guard test stays green).

- [ ] **Step 9: Commit**

```bash
git add lib/desk/load.ts components/desk/PendingTable.tsx "app/learners/[id]/inbox/page.tsx" components/review/StudioPendingCard.tsx components/skills/SkillProposalCard.tsx tests/unit/deskLoad.test.ts tests/unit/pendingPage.test.ts
git commit -m "feat(desk): Chờ duyệt page per child — compact filterable table, open-only, soft sources

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 9: Cảnh báo Bàn làm việc (`deskAlerts`) + `DeskAlerts` + `deskCopy`  *(builder · Sonnet)*

**Files:**
- Create: `lib/desk/alerts.ts`, `components/desk/DeskAlerts.tsx`
- Modify: `lib/copy/vi.ts` (add `deskCopy` after `pendingCopy`), `components/workdesk/IntakeCard.tsx` (root `<section … data-testid="intake-card">` gets `id="intake"` and `scroll-mt-4`)
- Test: `tests/unit/deskAlerts.test.ts`

**Interfaces:**
- Consumes: `type TodayData` (`lib/tutorwork/load.ts`), `isOverdue` (`lib/practice/overdue.ts`), `itemList` (`lib/tutorwork/frameScore.ts`), `formatDateVi`, `todayVn`, `formatHm` (`lib/work/view.ts`).
- Produces: `type AlertTone = "warn" | "info" | "sent" | "repeat" | "tag" | "recheck"`; `type DeskAlert = { key: string; tone: AlertTone; badge: string; title: string; line: string; href: string }`; `type DeskAlertInput = { learnerId: string; role: "tutor" | "parent"; todayIso: string; today: TodayData | null; intakeMissing: boolean | null; curriculaCount: number | null; flagCount: number }`; `deskAlerts(i: DeskAlertInput): DeskAlert[]`; `DeskAlerts({ learnerId, items }: { learnerId: string; items: DeskAlert[] })`.

- [ ] **Step 1: Add the copy**

```ts
// lib/copy/vi.ts — after pendingCopy
export const deskCopy = {
  titlePrefix: "Bàn làm việc",
  title: (alias: string) => `Bàn làm việc · ${alias}`,
  titleEmpty: "Bàn làm việc",
  subtitle: (learnerLine: string, todayLine: string) => `${learnerLine} · ${todayLine}`,
  logToday: "Ghi buổi học hôm nay",
  seeAll: "Xem đầy đủ",
  alerts: {
    missingBadge: "Chưa có",
    flagBadge: "⚑",
    intakeTitle: "Hồ sơ đầu vào",
    intakeLineTutor: "App chưa biết em đang ở đâu nên chưa gợi ý được gì. Lập hồ sơ khoảng 15 phút.",
    intakeLineParent: `Chờ ${tutorHonorific} lập hồ sơ đầu vào (mục tiêu, điểm mạnh và yếu ban đầu).`,
    curriculaTitle: "Giáo trình",
    curriculaLine: "Chưa có giáo trình nào. Thêm quyển đang dạy để app biết em đang học đến đâu.",
    overdueTitle: (n: number) => `${n} bài luyện quá hạn`,
    overdueLine: "Em chưa gửi và chưa ai ghi kết quả. Con không thấy chữ “quá hạn”.",
    flagsTitle: (n: number) => `${n} kỹ năng cần xem lại`,
    flagsLine: "Sai lặp lại sau khi đã lên bậc. App không tự hạ bậc.",
  },
  profileUnavailable: "Chưa đọc được hồ sơ cấp. Mở Hồ sơ học sinh để xem.",
  attentionNone: "Chưa có điểm nào lặp lại.",
  curriculaUnavailable: "Chưa đọc được giáo trình.",
  curriculaEmpty: "Chưa có giáo trình.",
  currentUnit: (code: string, title: string) => `Đang học đến ${code} · ${title}`,
  noCurrentUnit: "Chưa chọn Unit đang học.",
  draftWaiting: "Có bản mục lục chờ duyệt",
  sessionsTitle: "Buổi học & bài giao",
  sessionsUnavailable: "Chưa đọc được buổi học và bài giao.",
  practiceCounts: (open: number, sent: number, late: number) => `Bài giao: ${open} đang mở · ${sent} em đã gửi${late > 0 ? ` · ${late} quá hạn` : ""}`,
  seeAssignments: "Xem bài giao",
  noSchedule: "Lịch buổi học chưa có trong app.",
} as const;
```

- [ ] **Step 2: Write the failing test** (ports the six `LearnerCard` "Hôm nay" tests from `tests/unit/tutorWorkUi.test.ts` + new alerts)

```ts
// tests/unit/deskAlerts.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { deskCopy, fallbackLabels, todayPage } from "@/lib/copy/vi";
import { deskAlerts, type DeskAlertInput } from "@/lib/desk/alerts";
import type { TodayData } from "@/lib/tutorwork/load";
import type { UntaggedItem, WeakPoint, WeakPointsView } from "@/lib/tutorwork/types";
import type { AssignmentView } from "@/lib/practice/types";

vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
import { DeskAlerts } from "@/components/desk/DeskAlerts";

const L = "a0000000-0000-4000-8000-000000000001";
const weakTag = (over: Partial<WeakPoint> = {}): WeakPoint => ({
  tagKey: "cau-dieu-kien-dao-ngu", label: "Câu điều kiện & đảo ngữ", group: "Ngữ pháp", sources: 3,
  bySource: { test: 1, lesson: 1, writing: 1, practice: 0 }, itemsWrong: { test: 4, practice: 0 }, asked: 8, askedWrong: 4,
  lastSeen: "2026-10-16", recheckDueOn: "2026-10-30", recheckDue: false, lastRecheck: null, status: "repeat",
  events: [{ date: "2026-10-16", source: "test", sourceId: "s1", items: [4, 5], title: "Destination", usedHint: true, inClass: true }], ...over,
});
const weakView = (t: WeakPoint[]): WeakPointsView => ({ policyDays: 14, since: null, today: "2026-10-17", tags: t });
const untagged: UntaggedItem = { resultId: "r1", recordedByMember: "m-tutor", recordedRole: "tutor", own: false, title: "Unless, even if…", takenOn: "2026-10-08", createdAt: "2026-10-08T01:00:00Z", source: "practice", usedHint: false, inClass: false, items: [4, 7] };
const today = (over: Partial<TodayData> = {}): TodayData => {
  const w = weakView([weakTag(), weakTag({ tagKey: "cum-dong-tu", label: "Cụm động từ", sources: 1, status: "watch", recheckDue: true, recheckDueOn: "2026-10-16" })]);
  return { weak: w, repeats: w.tags.filter((t) => t.status === "repeat"), due: w.tags.filter((t) => t.recheckDue), untagged: [untagged], lastNote: null, recent: null, practice: [], tagLabels: { "cau-dieu-kien-dao-ngu": "Câu điều kiện & đảo ngữ" }, ...over };
};
const input = (over: Partial<DeskAlertInput> = {}): DeskAlertInput => ({ learnerId: L, role: "tutor", todayIso: "2026-10-18", today: today(), intakeMissing: false, curriculaCount: 1, flagCount: 0, ...over });
const html = (i: DeskAlertInput) => renderToStaticMarkup(createElement(DeskAlerts, { learnerId: L, items: deskAlerts(i) }));
const late = { id: "c1", kind: "link", title: "Bài 1", url: null, sourceKey: null, tagKeys: [], dueOn: "2026-10-10", frameId: null, createdAt: "2026-10-01T00:00:00Z", retractedAt: null, file: null, answerFile: null, submission: null, resultId: null } as AssignmentView;

describe("desk alerts (was the attention part of the learner card)", () => {
  it("tutor: repeat, waiting for a tag, due for re-check — with the old wording and links", () => {
    const h = html(input());
    expect(h).toContain(`data-testid="attention-${L}"`);
    expect(h).toContain(todayPage.repeatBadge(3));
    expect(h).toContain(todayPage.untaggedBadge);
    expect(h).toContain(todayPage.recheckBadge);
    expect(h).toContain(todayPage.untaggedTutorLine("Unless, even if…", "08/10/2026", "4, 7"));
    expect(h).toContain(`href="/learners/${L}/weak"`);
    expect(h).toContain(`href="/learners/${L}/results/new#pending"`);
  });
  it("parent: untagged items are worded as waiting for the tutor; her own entries are not", () => {
    const h = html(input({ role: "parent" }));
    expect(h).toContain(todayPage.untaggedParentBadge);
    expect(h).toContain(todayPage.untaggedParentLine("Unless, even if…", "08/10/2026", "4, 7"));
    const own = html(input({ role: "parent", today: today({ untagged: [{ ...untagged, own: true, recordedRole: "parent" }] }) }));
    expect(own).toContain(todayPage.untaggedBadge);
    expect(own).not.toContain(todayPage.untaggedParentBadge);
  });
  it("a tag that is a repeat AND due shows once (the repeat wins)", () => {
    const both = weakTag({ recheckDue: true });
    const h = html(input({ today: today({ weak: weakView([both]), repeats: [both], due: [both], untagged: [] }) }));
    expect(h.match(/Câu điều kiện &amp; đảo ngữ/g)).toHaveLength(1);
    expect(h).not.toContain(todayPage.recheckBadge);
  });
  it("never a raw tag key: an unknown tag gets the neutral word", () => {
    const d = weakTag({ tagKey: "x-gone", label: "x", status: "watch", recheckDue: true });
    const h = html(input({ today: today({ weak: weakView([d]), repeats: [], due: [d], untagged: [], tagLabels: {} }) }));
    expect(h).not.toContain("x-gone");
    expect(h).toContain(fallbackLabels.tag);
  });
  it("nothing to show: the empty line and the link to all weak points", () => {
    const h = html(input({ today: today({ repeats: [], due: [], untagged: [] }) }));
    expect(h).toContain(todayPage.attentionEmpty);
    expect(h).toContain(todayPage.seeAll);
  });
  it("new: missing intake (tutor / parent wording), no curriculum, overdue practice, ⚑ flags", () => {
    const t = deskAlerts(input({ intakeMissing: true, curriculaCount: 0, flagCount: 2, today: today({ repeats: [], due: [], untagged: [], practice: [late] }) }));
    expect(t.map((a) => a.key)).toEqual(["intake", "curricula", "overdue", "flags"]);
    expect(t[0]).toMatchObject({ line: deskCopy.alerts.intakeLineTutor, href: `/learners/${L}/levels#intake` });
    expect(t[2]).toMatchObject({ title: deskCopy.alerts.overdueTitle(1), href: `/learners/${L}/assign` });
    expect(t[3]).toMatchObject({ title: deskCopy.alerts.flagsTitle(2), href: `/learners/${L}/inbox?f=skills` });
    expect(deskAlerts(input({ role: "parent", intakeMissing: true }))[0]!.line).toBe(deskCopy.alerts.intakeLineParent);
  });
  it("unknown (null) intake / curricula and no numbers: no guess", () => {
    expect(deskAlerts(input({ intakeMissing: null, curriculaCount: null, today: null }))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/unit/deskAlerts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// lib/desk/alerts.ts
/**
 * "Cần chú ý" of the desk (spec §5 rule 3: the full list lives only here). Pure. The rows of the old learner card (sent work, repeats,
 * waiting for a tag, due for a re-check) keep their wording; new rows: no intake profile, no curriculum, overdue practice, ⚑ flags.
 */
import { deskCopy, fallbackLabels, todayPage } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";
import { isOverdue } from "@/lib/practice/overdue";
import { itemList } from "@/lib/tutorwork/frameScore";
import type { TodayData } from "@/lib/tutorwork/load";
import { formatHm } from "@/lib/work/view";

export type AlertTone = "warn" | "info" | "sent" | "repeat" | "tag" | "recheck";
export type DeskAlert = { key: string; tone: AlertTone; badge: string; title: string; line: string; href: string };
export type DeskAlertInput = {
  learnerId: string;
  role: "tutor" | "parent";
  todayIso: string;
  today: TodayData | null;
  /** null = unknown (W1 tables not readable): no alert. */
  intakeMissing: boolean | null;
  /** null = unknown: no alert. */
  curriculaCount: number | null;
  flagCount: number;
};

export function deskAlerts(i: DeskAlertInput): DeskAlert[] {
  const base = `/learners/${i.learnerId}`;
  const out: DeskAlert[] = [];
  const A = deskCopy.alerts;
  if (i.intakeMissing === true) out.push({ key: "intake", tone: "warn", badge: A.missingBadge, title: A.intakeTitle, line: i.role === "tutor" ? A.intakeLineTutor : A.intakeLineParent, href: `${base}/levels#intake` });
  if (i.curriculaCount === 0) out.push({ key: "curricula", tone: "info", badge: A.missingBadge, title: A.curriculaTitle, line: A.curriculaLine, href: `${base}/curricula` });
  const t = i.today;
  if (t) {
    const late = t.practice.filter((a) => isOverdue(a, i.todayIso)).length;
    if (late > 0) out.push({ key: "overdue", tone: "warn", badge: todayPage.practiceOverdue, title: A.overdueTitle(late), line: A.overdueLine, href: `${base}/assign` });
    const label = (key: string) => t.tagLabels[key] ?? fallbackLabels.tag;
    for (const a of t.practice.filter((x) => x.submission !== null).slice(0, 3)) {
      const when = a.submission ? `${formatDateVi(todayVn(new Date(a.submission.createdAt)))} ${formatHm(a.submission.createdAt)}` : "";
      out.push({ key: `sent-${a.id}`, tone: "sent", badge: todayPage.submittedBadge, title: a.title, line: `${todayPage.submittedLine(a.title, when)} · ${todayPage.submittedNote}`, href: `${base}/results/new?assignment=${a.id}` });
    }
    for (const r of t.repeats) out.push({ key: `repeat-${r.tagKey}`, tone: "repeat", badge: todayPage.repeatBadge(r.sources), title: r.label, line: todayPage.repeatLine(r.lastSeen ? formatDateVi(r.lastSeen) : null), href: `${base}/weak` });
    for (const u of t.untagged.slice(0, 3)) {
      // The parent's own entries are hers to tag; only the tutor's are "waiting for the tutor".
      const waiting = i.role === "parent" && !u.own;
      out.push({
        key: `untagged-${u.resultId}`, tone: "tag", badge: waiting ? todayPage.untaggedParentBadge : todayPage.untaggedBadge, title: u.title,
        line: waiting ? todayPage.untaggedParentLine(u.title, formatDateVi(u.takenOn), itemList(u.items)) : todayPage.untaggedTutorLine(u.title, formatDateVi(u.takenOn), itemList(u.items)),
        href: `${base}/results/new#pending`,
      });
    }
    // A tag that is both a repeat and due for a re-check shows once, as the repeat.
    for (const d of t.due.filter((x) => !t.repeats.some((r) => r.tagKey === x.tagKey))) {
      out.push({ key: `due-${d.tagKey}`, tone: "recheck", badge: todayPage.recheckBadge, title: label(d.tagKey), line: todayPage.recheckLine(d.lastSeen ? formatDateVi(d.lastSeen) : null, t.weak.policyDays), href: `${base}/notes/new` });
    }
  }
  if (i.flagCount > 0) out.push({ key: "flags", tone: "info", badge: A.flagBadge, title: A.flagsTitle(i.flagCount), line: A.flagsLine, href: `${base}/inbox?f=skills` });
  return out;
}
```

```tsx
// components/desk/DeskAlerts.tsx
import Link from "next/link";
import { todayPage } from "@/lib/copy/vi";
import type { AlertTone, DeskAlert } from "@/lib/desk/alerts";

const TONE: Record<AlertTone, { badge: string; row: string }> = {
  warn: { badge: "bg-[#7a4a00] text-white", row: "bg-[#fbf0dc]" },
  repeat: { badge: "bg-[#7a4a00] text-white", row: "bg-[#fbf0dc]" },
  sent: { badge: "bg-accent text-white", row: "bg-[#e5efe9]" },
  tag: { badge: "bg-[#2f5d9e] text-white", row: "bg-paper" },
  recheck: { badge: "bg-accent text-white", row: "bg-paper" },
  info: { badge: "bg-[#2f5d9e] text-white", row: "bg-[#eef3fa]" },
};

export function DeskAlerts({ learnerId, items }: { learnerId: string; items: DeskAlert[] }) {
  return (
    <section className="flex flex-col gap-2" aria-label={todayPage.attentionTitle} data-testid={`attention-${learnerId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{todayPage.attentionTitle}</h2>
        <Link href={`/learners/${learnerId}/weak`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">{todayPage.seeAll}</Link>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted">{todayPage.attentionEmpty}</p> : null}
      {items.map((r) => (
        <Link key={r.key} href={r.href} className={`flex items-start gap-3 rounded-lg px-4 py-3 text-ink no-underline ${TONE[r.tone].row}`}>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[r.tone].badge}`}>{r.badge}</span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold">{r.title}</span>
            <span className="text-sm text-muted">{r.line}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
```

Add `id="intake"` + `scroll-mt-4` on the root section of `components/workdesk/IntakeCard.tsx`.

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/unit/deskAlerts.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/desk/alerts.ts components/desk/DeskAlerts.tsx components/workdesk/IntakeCard.tsx lib/copy/vi.ts tests/unit/deskAlerts.test.ts
git commit -m "feat(desk): desk alerts (old attention rows + intake, curriculum, overdue, flags)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 10: Các khung Bàn làm việc + `loadDesk`; xóa `LearnerCard`  *(builder · Sonnet)*

**Files:**
- Create: `components/desk/DeskInbox.tsx`, `components/desk/ProfileBox.tsx`, `components/desk/CurriculumBox.tsx`, `components/desk/SessionsBox.tsx`, `components/desk/DeskView.tsx`
- Modify: `lib/desk/load.ts` (add `DeskData`, `loadDesk`)
- Delete: `components/LearnerCard.tsx`
- Modify tests: `tests/unit/tutorWorkUi.test.ts` (delete the `describe("S5b-1 'Hôm nay' card", …)` block and the `LearnerCard` import — ported to `deskAlerts.test.ts` and `deskUi.test.ts`), `tests/unit/revisionsPage.test.ts` (delete the third test "the learner card leaves the link out…" and the `LearnerCard` import — ported to `shellNav.test.ts`), `tests/unit/practiceUi.test.ts` (replace the `LearnerCard` loop in "the assignment table and the home card show the label…" by a `SessionsBox` assertion, below)
- Test: `tests/unit/deskUi.test.ts`

**Interfaces:**
- Consumes: `PendingRowsResult`, `loadPendingRows` (Task 8); `deskAlerts`, `DeskAlerts` (Task 9); `ShellData` (Task 3); `LearnerSummary`; `TodayData`, `loadToday(learnerId, trackId, viewer)`; `loadIntake(learnerId): Promise<Soft<IntakeView | null>>` (`lib/workdesk/load.ts`); `loadCurriculumCards`; `loadLevelProfile`, `loadRecentLevelChanges` (`lib/levels/load.ts`); `loadAiSettings` (`lib/studio/load.ts`); `strongestWeakest` (`lib/levels/scale.ts`); `boxValue`, `profileSummary` (`lib/levels/view.ts`); `CoverageBar` (`components/curriculum/CoverageBar.tsx`); `RecentLevelChanges`, `AiSoftCapBox`.
- Produces: `type DeskData = { today: TodayData | null; pending: PendingRowsResult; intakeMissing: boolean | null; curricula: CurriculumCard[] | null; profile: LevelProfile | null; recent: RecentChange[] | null; aiSettings: AiSettingsView | null }`; `loadDesk(shell: ShellData, learner: LearnerSummary): Promise<DeskData>` (never throws); `DeskView({ shell, learner, data, todayIso })`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/deskUi.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { deskCopy, fallbackLabels, home, pendingCopy, todayPage } from "@/lib/copy/vi";
import type { DeskData } from "@/lib/desk/load";
import type { ShellData } from "@/lib/shell/shell";
import type { TodayData } from "@/lib/tutorwork/load";
import type { AssignmentView } from "@/lib/practice/types";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { ...p, href: p.href }, p.children) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
import { DeskView } from "@/components/desk/DeskView";

const L = "a0000000-0000-4000-8000-000000000001";
const learner = { id: L, alias: "Nguyên (thử)", trackId: "B" as const, status: "active" as const, isTest: true, color: null };
const shell = (role: "tutor" | "parent"): ShellData => ({ displayName: "X", role, memberId: "m", learners: [learner], current: learner, revisionsReady: true });
const asg = (over: Partial<AssignmentView>) => ({ id: "c1", kind: "link", title: "Bài 1", url: null, sourceKey: null, tagKeys: [], dueOn: null, frameId: null, createdAt: "2026-10-01T00:00:00Z", retractedAt: null, file: null, answerFile: null, submission: null, resultId: null, ...over }) as AssignmentView;
const today = (over: Partial<TodayData> = {}): TodayData => ({
  weak: { policyDays: 14, since: null, today: "2026-10-18", tags: [] }, repeats: [], due: [], untagged: [],
  lastNote: { id: "n1", sessionDate: "2026-10-15", studied: "Unit 7", weakTagKeys: ["x-gone"], practisedTargetIds: [], message: "Had it not been for + N", authorRole: "tutor" },
  recent: { id: "r0", title: "Destination U1-12", takenOn: "2026-10-16", total: 60, correct: 50 }, practice: [], tagLabels: {}, ...over,
});
const data = (over: Partial<DeskData> = {}): DeskData => ({ today: today(), pending: { rows: [], failed: [], more: false }, intakeMissing: false, curricula: [], profile: null, recent: null, aiSettings: null, ...over });
const render = (role: "tutor" | "parent", d: DeskData) => renderToStaticMarkup(createElement(DeskView, { shell: shell(role), learner, data: d, todayIso: "2026-10-18" }));

describe("Bàn làm việc", () => {
  it("order (spec §5 rule 2): title + main action → Chờ duyệt → Cần chú ý → 3 boxes", () => {
    const h = render("tutor", data());
    const at = (s: string) => h.indexOf(s);
    expect(h).toContain(deskCopy.title("Nguyên (thử)"));
    expect(at('data-testid="desk-title"')).toBeLessThan(at(`data-testid="action-note-${L}"`));
    expect(at(`data-testid="action-note-${L}"`)).toBeLessThan(at('data-testid="desk-inbox"'));
    expect(at('data-testid="desk-inbox"')).toBeLessThan(at(`data-testid="attention-${L}"`));
    expect(at(`data-testid="attention-${L}"`)).toBeLessThan(at('data-testid="desk-profile"'));
    expect(at('data-testid="desk-profile"')).toBeLessThan(at('data-testid="desk-curricula"'));
    expect(at('data-testid="desk-curricula"')).toBeLessThan(at('data-testid="desk-sessions"'));
  });
  it("quick actions keep their old targets and test ids", () => {
    const h = render("tutor", data());
    expect(h).toContain(`href="/learners/${L}/notes/new"`);
    expect(h).toContain(`href="/learners/${L}/results/new"`);
    expect(h).toContain(`href="/learners/${L}/assign"`);
    expect(h).toContain(deskCopy.logToday);
    expect(h).toContain(todayPage.resultAction);
    expect(h).toContain(todayPage.assignAction);
  });
  it("Chờ duyệt box: count, first 3 rows as links, 'Mở tất cả' → the child's inbox; no button", () => {
    const rows = ["a", "b", "c", "d"].map((k) => ({ key: k, kind: "work" as const, group: "work" as const, label: "Bài nộp", title: `T-${k}`, since: null, need: "N", href: `/review/${k}`, waitingTutor: false }));
    const h = render("tutor", data({ pending: { rows, failed: [], more: false } }));
    expect(h).toContain(pendingCopy.deskTitle(4));
    expect(h).toContain('data-testid="desk-inbox-row-c"');
    expect(h).not.toContain('data-testid="desk-inbox-row-d"');
    expect(h).toContain(pendingCopy.deskMore(1));
    expect(h).toContain(`href="/learners/${L}/inbox"`);
    expect(h.slice(h.indexOf('data-testid="desk-inbox"'), h.indexOf(`data-testid="attention-${L}"`))).not.toMatch(/<button\b/);
  });
  it("Buổi học box: last session without a raw tag key, last result, practice counts only (spec §5 rule 6), no schedule yet", () => {
    const h = render("tutor", data({ today: today({ practice: [asg({ id: "c1", dueOn: "2026-10-10" }), asg({ id: "c2", dueOn: "2026-10-30" })] }) }));
    expect(h).toContain(`data-testid="last-session-${L}"`);
    expect(h).toContain("Had it not been for + N");
    expect(h).toContain("15/10/2026");
    expect(h).not.toContain("x-gone");
    expect(h).toContain(fallbackLabels.tag);
    expect(h).toContain(todayPage.lastResultLine("Destination U1-12", "16/10/2026"));
    expect(h).toContain(deskCopy.practiceCounts(2, 0, 1));
    expect(h).not.toContain('data-testid="overdue-c1"');
    expect(h).toContain(deskCopy.noSchedule);
  });
  it("boxes say plainly when their data could not be read", () => {
    const h = render("tutor", data({ today: null, curricula: null, profile: null }));
    expect(h).toContain('data-testid="desk-profile-unavailable"');
    expect(h).toContain(deskCopy.curriculaUnavailable);
    expect(h).toContain(deskCopy.sessionsUnavailable);
  });
  it("parent: the family summary line; tutor: none", () => {
    expect(render("parent", data())).toContain(home.parentSummary(1));
    expect(render("tutor", data())).not.toContain(home.parentSummary(1));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/deskUi.test.ts`
Expected: FAIL — `DeskView` / `DeskData` not found.

- [ ] **Step 3: Implement `loadDesk`** (append to `lib/desk/load.ts`)

```ts
// lib/desk/load.ts — additions
import type { CurriculumCard } from "@/lib/curriculum/shape";
import type { LearnerSummary } from "@/lib/home/visible";
import { loadLevelProfile, loadRecentLevelChanges } from "@/lib/levels/load";
import type { LevelProfile, RecentChange } from "@/lib/levels/types";
import type { ShellData } from "@/lib/shell/shell";
import { loadAiSettings } from "@/lib/studio/load";
import type { AiSettingsView } from "@/lib/studio/types";
import { loadToday, type TodayData } from "@/lib/tutorwork/load";
import { loadIntake } from "@/lib/workdesk/load";

export type DeskData = {
  today: TodayData | null;
  pending: PendingRowsResult;
  intakeMissing: boolean | null;
  curricula: CurriculumCard[] | null;
  profile: LevelProfile | null;
  recent: RecentChange[] | null;
  aiSettings: AiSettingsView | null;
};

/** Everything the desk of one child needs. Call ONLY after the page gate of that child (admin-client loaders). Never throws. */
export async function loadDesk(shell: ShellData, learner: LearnerSummary): Promise<DeskData> {
  const parent = shell.role === "parent";
  const [today, pending, intake, curricula, profile, recent, aiSettings] = await Promise.all([
    settle(loadToday(learner.id, learner.trackId, { role: shell.role, memberId: shell.memberId })),
    loadPendingRows(shell.memberId, shell.role, learner.id),
    settle(loadIntake(learner.id)),
    settle(loadCurriculumCards(learner.id)),
    settle(loadLevelProfile(learner.id)),
    parent ? settle(loadRecentLevelChanges(shell.learners)) : Promise.resolve(null),
    parent ? settle(loadAiSettings(shell.memberId)) : Promise.resolve(null),
  ]);
  return { today, pending, intakeMissing: intake && intake.available ? intake.data === null : null, curricula, profile, recent, aiSettings };
}
```

(Merge imports with the ones from Task 8; `settle` and `loadPendingRows` are already in the file. Add mocks for the new imports to `tests/unit/deskLoad.test.ts` if it stops loading — it already mocks `lib/tutorwork/load`, `lib/workdesk/load`, `lib/levels/load`.)

- [ ] **Step 4: Implement the boxes**

```tsx
// components/desk/DeskInbox.tsx
import Link from "next/link";
import { pendingCopy } from "@/lib/copy/vi";
import type { PendingRowsResult } from "@/lib/desk/load";

export function DeskInbox({ learnerId, pending }: { learnerId: string; pending: PendingRowsResult }) {
  const rows = pending.rows;
  return (
    <section data-testid="desk-inbox" aria-labelledby="desk-inbox-title" className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#2f5d9e] bg-[#eef3fa] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="desk-inbox-title" className="text-lg font-semibold">{pendingCopy.deskTitle(rows.length)}</h2>
        <Link href={`/learners/${learnerId}/inbox`} data-testid="desk-inbox-open" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">{pendingCopy.deskOpenAll}</Link>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted">{pendingCopy.empty}</p> : null}
      {rows.slice(0, 3).map((r) => (
        <Link key={r.key} href={r.href} data-testid={`desk-inbox-row-${r.key}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2 text-ink no-underline hover:outline hover:outline-1 hover:outline-[#2f5d9e]">
          <span className="rounded-full bg-[#e4ebf5] px-2.5 py-0.5 text-xs font-semibold text-[#1f3f6e]">{r.label}</span>
          <span className="min-w-0 flex-1 text-sm">{r.title}</span>
          <span className="text-sm text-muted">{r.need}</span>
        </Link>
      ))}
      {rows.length > 3 ? <p className="text-sm text-muted">{pendingCopy.deskMore(rows.length - 3)}</p> : null}
      {pending.failed.length > 0 ? <p className="text-xs text-muted">{pendingCopy.deskPartial}</p> : null}
    </section>
  );
}
```

```tsx
// components/desk/ProfileBox.tsx
import Link from "next/link";
import { deskCopy, levelCopy, shellCopy, todayPage } from "@/lib/copy/vi";
import { strongestWeakest } from "@/lib/levels/scale";
import type { LevelProfile } from "@/lib/levels/types";
import { boxValue, profileSummary } from "@/lib/levels/view";
import type { WeakPoint } from "@/lib/tutorwork/types";

export const BOX = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-white p-5";
export const BOX_LINK = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline";

export function ProfileBox({ learnerId, alias, profile, weak }: { learnerId: string; alias: string; profile: LevelProfile | null; weak: WeakPoint[] }) {
  const sw = profile ? strongestWeakest(profile.domains) : null;
  return (
    <section data-testid="desk-profile" className={BOX}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{shellCopy.sections.profile}</h2>
        <Link href={`/learners/${learnerId}/levels`} className={BOX_LINK}>{deskCopy.seeAll}</Link>
      </div>
      {profile && sw ? (
        <>
          <p className="text-sm">{profileSummary(alias, profile)}</p>
          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{levelCopy.strongest}</dt><dd>{sw.even ? levelCopy.even : boxValue(sw.strongest)}</dd>
            <dt className="text-muted">{levelCopy.focus}</dt><dd>{sw.even ? levelCopy.even : boxValue(sw.weakest)}</dd>
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted" data-testid="desk-profile-unavailable">{deskCopy.profileUnavailable}</p>
      )}
      <div>
        <h3 className="text-sm font-semibold">{todayPage.attentionTitle}</h3>
        {weak.length === 0 ? (
          <p className="text-sm text-muted">{deskCopy.attentionNone}</p>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {weak.slice(0, 3).map((w) => <li key={w.tagKey}>{w.label} · <span className="text-muted">{todayPage.repeatBadge(w.sources)}</span></li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
```

```tsx
// components/desk/CurriculumBox.tsx
import Link from "next/link";
import { CoverageBar } from "@/components/curriculum/CoverageBar";
import { deskCopy, shellCopy } from "@/lib/copy/vi";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import { BOX, BOX_LINK } from "./ProfileBox";

/** Stands in the "Lộ trình" slot of the prototype until W5 (plan K7). */
export function CurriculumBox({ learnerId, cards }: { learnerId: string; cards: CurriculumCard[] | null }) {
  return (
    <section data-testid="desk-curricula" className={BOX}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{shellCopy.sections.curricula}</h2>
        <Link href={`/learners/${learnerId}/curricula`} className={BOX_LINK}>{deskCopy.seeAll}</Link>
      </div>
      {cards === null ? <p className="text-sm text-muted">{deskCopy.curriculaUnavailable}</p> : null}
      {cards !== null && cards.length === 0 ? <p className="text-sm text-muted">{deskCopy.curriculaEmpty}</p> : null}
      {(cards ?? []).map((c) => (
        <div key={c.id} className="flex flex-col gap-1 border-t border-[#eceee8] pt-2 first:border-t-0 first:pt-0">
          <p className="text-sm font-semibold">{c.title}</p>
          <p className="text-sm text-muted">{c.progress?.current ? deskCopy.currentUnit(c.progress.current.code, c.progress.current.title) : deskCopy.noCurrentUnit}</p>
          {c.progress ? <CoverageBar done={c.progress.done} total={c.progress.total} pct={c.progress.pct} testId={`desk-coverage-${c.id}`} /> : null}
          {c.open && (c.open.status === "draft" || c.open.status === "ai_failed") ? (
            <span className="self-start rounded-full bg-[#e4ebf5] px-2.5 py-0.5 text-xs font-semibold text-[#1f3f6e]">{deskCopy.draftWaiting}</span>
          ) : null}
        </div>
      ))}
    </section>
  );
}
```

```tsx
// components/desk/SessionsBox.tsx
import Link from "next/link";
import { deskCopy, fallbackLabels, todayPage, tutorHonorific } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { isOverdue } from "@/lib/practice/overdue";
import type { TodayData } from "@/lib/tutorwork/load";
import { BOX, BOX_LINK } from "./ProfileBox";

export function SessionsBox({ learnerId, today, todayIso }: { learnerId: string; today: TodayData | null; todayIso: string }) {
  const note = today?.lastNote ?? null;
  return (
    <section data-testid="desk-sessions" className={BOX}>
      <h2 className="text-lg font-semibold">{deskCopy.sessionsTitle}</h2>
      {today === null ? (
        <p className="text-sm text-muted">{deskCopy.sessionsUnavailable}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1 text-sm" data-testid={`last-session-${learnerId}`}>
            {note ? (
              <>
                <h3 className="font-semibold">{todayPage.lastSessionTitle(formatDateVi(note.sessionDate))}</h3>
                <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
                  {note.studied ? (<><dt className="text-muted">{todayPage.studied}</dt><dd>{note.studied}</dd></>) : null}
                  {note.weakTagKeys.length > 0 ? (<><dt className="text-muted">{todayPage.reinforce}</dt><dd>{note.weakTagKeys.map((k) => today.tagLabels[k] ?? fallbackLabels.tag).join("; ")}</dd></>) : null}
                  {note.message ? (<><dt className="text-muted">{todayPage.message}</dt><dd>“{note.message}”</dd></>) : null}
                  <dt className="text-muted">{todayPage.writtenBy}</dt><dd>{todayPage.roleLabel[note.authorRole] ?? tutorHonorific}</dd>
                </dl>
              </>
            ) : (
              <p className="text-muted">{todayPage.lastSessionNone}</p>
            )}
            {today.recent ? <p className="text-muted">{todayPage.lastResultLine(today.recent.title, formatDateVi(today.recent.takenOn))}</p> : null}
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[#eceee8] pt-2">
            <p className="text-sm" data-testid="desk-practice-counts">
              {deskCopy.practiceCounts(today.practice.length, today.practice.filter((a) => a.submission !== null).length, today.practice.filter((a) => isOverdue(a, todayIso)).length)}
            </p>
            <Link href={`/learners/${learnerId}/assign`} className={BOX_LINK}>{deskCopy.seeAssignments}</Link>
          </div>
        </>
      )}
      <p className="text-xs text-muted">{deskCopy.noSchedule}</p>
    </section>
  );
}
```

```tsx
// components/desk/DeskView.tsx
import Link from "next/link";
import { AiSoftCapBox } from "@/components/settings/AiSoftCapBox";
import { RecentLevelChanges } from "@/components/levels/RecentLevelChanges";
import { deskCopy, home, learnerWithTrack, todayPage } from "@/lib/copy/vi";
import { deskAlerts } from "@/lib/desk/alerts";
import type { DeskData } from "@/lib/desk/load";
import type { LearnerSummary } from "@/lib/home/visible";
import { formatDay } from "@/lib/review/format";
import type { ShellData } from "@/lib/shell/shell";
import { CurriculumBox } from "./CurriculumBox";
import { DeskAlerts } from "./DeskAlerts";
import { DeskInbox } from "./DeskInbox";
import { ProfileBox } from "./ProfileBox";
import { SessionsBox } from "./SessionsBox";

const SECONDARY = "inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-accent no-underline hover:border-accent";

/** Bàn làm việc of one child (spec §3, §5 rule 2). Presentational: the page loads `data` after the gate. */
export function DeskView({ shell, learner, data, todayIso }: { shell: ShellData; learner: LearnerSummary; data: DeskData; todayIso: string }) {
  const id = learner.id;
  const parent = shell.role === "parent";
  const alerts = deskAlerts({
    learnerId: id, role: shell.role, todayIso, today: data.today, intakeMissing: data.intakeMissing,
    curriculaCount: data.curricula === null ? null : data.curricula.length,
    flagCount: data.pending.rows.filter((r) => r.kind === "flag").length,
  });
  return (
    <div className="flex flex-col gap-5" data-testid="today-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="desk-title">{deskCopy.title(learner.alias)}</h1>
          <p className="mt-1 text-sm text-muted">{deskCopy.subtitle(learnerWithTrack(learner.alias, learner.trackId), todayPage.title(formatDay(todayIso)))}</p>
          {parent ? <p className="mt-1 text-sm text-muted">{home.parentSummary(shell.learners.length)}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={todayPage.actionsLabel}>
          <Link href={`/learners/${id}/notes/new`} data-testid={`action-note-${id}`} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-white no-underline">{deskCopy.logToday}</Link>
          <Link href={`/learners/${id}/results/new`} data-testid={`action-result-${id}`} className={SECONDARY}>{todayPage.resultAction}</Link>
          <Link href={`/learners/${id}/assign`} data-testid={`action-assign-${id}`} className={SECONDARY}>{todayPage.assignAction}</Link>
        </div>
      </div>
      <DeskInbox learnerId={id} pending={data.pending} />
      <DeskAlerts learnerId={id} items={alerts} />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ProfileBox learnerId={id} alias={learner.alias} profile={data.profile} weak={data.today?.weak.tags ?? []} />
        <CurriculumBox learnerId={id} cards={data.curricula} />
        <SessionsBox learnerId={id} today={data.today} todayIso={todayIso} />
      </div>
      {parent && data.recent ? <RecentLevelChanges items={data.recent} /> : null}
      {parent && data.aiSettings ? <AiSoftCapBox settings={data.aiSettings} /> : null}
    </div>
  );
}
```

`deskCopy.logToday` ("Ghi buổi học hôm nay") contains `todayPage.noteAction` ("Ghi buổi học"), so `tutorWork.spec.ts`'s `toContainText(todayPage.noteAction)` still holds.

- [ ] **Step 5: Delete `components/LearnerCard.tsx` and migrate the three tests**

- `tests/unit/tutorWorkUi.test.ts`: remove `import { LearnerCard } …`, the `learner` const if now unused, the `today` helper if unused, and the whole `describe("S5b-1 'Hôm nay' card", …)` block. Keep every other describe.
- `tests/unit/revisionsPage.test.ts`: remove `import { LearnerCard } …`, `const learner = …`, and the test "the learner card leaves the link out until 0021 is applied, and shows it after".
- `tests/unit/practiceUi.test.ts`: in "the assignment table and the home card show the label for an overdue one…", replace the `LearnerCard` loop with:

```ts
    const { SessionsBox } = await import("@/components/desk/SessionsBox");
    const data: TodayData = { weak: { policyDays: 14, since: null, today: "2026-10-18", tags: [] }, repeats: [], due: [], untagged: [], lastNote: null, recent: null, practice: [late, fine], tagLabels: {} };
    const box = render(createElement(SessionsBox, { learnerId: "a0000000-0000-4000-8000-000000000001", today: data, todayIso: "2026-10-18" }));
    expect(box).toContain(deskCopy.practiceCounts(2, 0, 1));
```

(make the `it` callback `async`, add `deskCopy` to its copy import, drop the `LearnerCard` import).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/unit/deskUi.test.ts tests/unit/deskLoad.test.ts tests/unit/tutorWorkUi.test.ts tests/unit/revisionsPage.test.ts tests/unit/practiceUi.test.ts && npm run typecheck && npm run lint`
Expected: PASS. `grep -rn "LearnerCard" app components lib tests` → no result.

- [ ] **Step 7: Commit**

```bash
git add components/desk lib/desk/load.ts tests/unit && git rm components/LearnerCard.tsx
git commit -m "feat(desk): desk boxes (Chờ duyệt, profile, curriculum, sessions) + loadDesk; retire LearnerCard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 11: Trang chủ người lớn = Bàn làm việc trong khung  *(builder · Sonnet)*

**Files:**
- Modify: `app/page.tsx` (only the staff part after `if (data.kind === "student") { … }`; the signed-out, no-member and **student branches stay byte-for-byte**)
- Test: `tests/unit/homePage.test.ts`

**Interfaces:**
- Consumes: `loadHome` (existing), `toShell`, `firstParam` (Task 3), `revisionsAvailable`, `requireLearnerPage(id, "tutorwork:read")`, `loadDesk` (Task 10), `StaffShell` (Task 4), `DeskView` (Task 10).
- Produces: `HomePage({ searchParams }: { searchParams: Promise<{ learner?: string | string[] }> })`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/homePage.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deskCopy, home } from "@/lib/copy/vi";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), usePathname: () => "/", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { ...p, href: p.href }, p.children) }));
const loadHome = vi.fn();
vi.mock("@/lib/home/loadHome", () => ({ loadHome: () => loadHome() }));
vi.mock("@/lib/revision/load", () => ({ revisionsAvailable: async () => true }));
const requireLearnerPage = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock("@/lib/tutorwork/page", () => ({ requireLearnerPage: (...a: unknown[]) => requireLearnerPage(...a) }));
const loadDesk = vi.fn();
vi.mock("@/lib/desk/load", () => ({ loadDesk: (...a: unknown[]) => loadDesk(...a) }));
vi.mock("@/lib/work/load", () => ({ loadStudentHome: async () => ({ kind: "empty" }) }));

import HomePage from "@/app/page";

const an = { id: "a0000000-0000-4000-8000-000000000001", alias: "An (thử)", trackId: "A", status: "active", isTest: true, color: null };
const ng = { id: "b0000000-0000-4000-8000-000000000002", alias: "Nguyên (thử)", trackId: "B", status: "active", isTest: true, color: null };
const desk = { today: null, pending: { rows: [], failed: [], more: false }, intakeMissing: null, curricula: null, profile: null, recent: null, aiSettings: null };
const render = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => { loadDesk.mockResolvedValue(desk); requireLearnerPage.mockClear(); });

describe("home page", () => {
  it("student: the student home, unchanged — no staff shell", async () => {
    loadHome.mockResolvedValue({ kind: "student", displayName: "An", memberId: "s", learners: [an] });
    const h = await render();
    expect(h).toContain('data-testid="student-nav"');
    expect(h).toContain(home.studentGreeting("An (thử)"));
    expect(h).not.toContain('data-testid="staff-shell"');
  });
  it("parent: shell + desk of the hinted child, gated before loading", async () => {
    loadHome.mockResolvedValue({ kind: "parent", displayName: "Mẹ", memberId: "p", learners: [an, ng] });
    const h = await render({ learner: ng.id });
    expect(h).toContain('data-testid="staff-shell"');
    expect(h).toContain(deskCopy.title("Nguyên (thử)"));
    expect(requireLearnerPage).toHaveBeenCalledWith(ng.id, "tutorwork:read");
    expect(loadDesk).toHaveBeenCalledWith(expect.objectContaining({ role: "parent" }), expect.objectContaining({ id: ng.id }));
  });
  it("tutor without a child: the shell and the empty line", async () => {
    loadHome.mockResolvedValue({ kind: "tutor", displayName: "Thầy", memberId: "t", learners: [] });
    const h = await render();
    expect(h).toContain(home.tutorEmpty);
    expect(loadDesk).not.toHaveBeenCalled();
  });
});
```

(If `loadStudentHome`'s non-ok kind is named differently, read `lib/work/load.ts` and use a value that makes the page take its `home.studentEmpty` branch.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/homePage.test.ts`
Expected: FAIL — the staff branch still renders `LearnerCard` (now deleted → import error) / no `staff-shell`.

- [ ] **Step 3: Rewrite the staff part of `app/page.tsx`**

Keep the imports the student / no-member branches use (`AppHeader`, `StudentHome`, `home`, `safeColor`, `loadStudentHome`, `redirect`). Remove the imports only the old staff branch used (`LearnerCard`, `AiSoftCapBox`, `RecentLevelChanges`, `Link`, `aiSettingsCopy`, `appFeedback`, `reviewPage`, `todayPage`, `formatDay`, `loadToday`, `TodayData`, `loadRecentLevelChanges`, `countToDecide`, `loadAiSettings`). New signature and staff part:

```tsx
import { DeskView } from "@/components/desk/DeskView";
import { StaffShell } from "@/components/shell/StaffShell";
import { deskCopy } from "@/lib/copy/vi";            // merge into the existing copy import
import { loadDesk } from "@/lib/desk/load";
import { todayVn } from "@/lib/inquiries/dates";
import { revisionsAvailable } from "@/lib/revision/load";
import { firstParam, toShell } from "@/lib/shell/shell";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ learner?: string | string[] }> }) {
  const data = await loadHome();
  // … signed-out, no-member and student branches exactly as before …

  // Staff (tutor / parent): Bàn làm việc of one child (plan K9), in the workdesk shell.
  const shell = toShell(data, firstParam((await searchParams).learner), await revisionsAvailable());
  if (!shell) redirect("/login"); // unreachable: students returned above
  const learner = shell.current;
  if (!learner) {
    return (
      <StaffShell shell={shell}>
        <div data-testid="today-page">
          <h1 className="text-2xl font-bold" data-testid="desk-title">{deskCopy.titleEmpty}</h1>
          <p className="mt-3 text-muted">{shell.role === "parent" ? home.parentSummary(0) : home.tutorEmpty}</p>
        </div>
      </StaffShell>
    );
  }
  // The child comes from the RLS-scoped list; the gate runs anyway before the admin-client loaders of the desk.
  await requireLearnerPage(learner.id, "tutorwork:read");
  const desk = await loadDesk(shell, learner);
  return (
    <StaffShell shell={shell}>
      <DeskView shell={shell} learner={learner} data={desk} todayIso={todayVn()} />
    </StaffShell>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/homePage.test.ts && npm test && npm run typecheck && npm run lint`
Expected: PASS (whole unit suite).

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx tests/unit/homePage.test.ts
git commit -m "feat(desk): staff home is Bàn làm việc in the workdesk shell; student home untouched

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 12: Bọc khung cho 9 trang người lớn ngoài `/learners/[id]`  *(builder · Sonnet)*

**Files:**
- Modify: `app/review/page.tsx`, `app/review/[episodeId]/page.tsx`, `app/review/skills/page.tsx`, `app/review/studio/page.tsx`, `app/studio/new/page.tsx`, `app/studio/drafts/[id]/page.tsx`, `app/curricula/versions/[id]/page.tsx`, `app/feedback/page.tsx`, `app/settings/ai/page.tsx`
- Modify tests: `tests/unit/reviewInboxPage.test.ts` (mock the shell), `tests/unit/shellPages.test.ts` (new case)

**Interfaces:**
- Consumes: `requireShell(hint)` (non-strict, Task 3), `firstParam` (Task 3), `StaffShell` (Task 4).

- [ ] **Step 1: Extend the guard test (fails first)**

Append to `tests/unit/shellPages.test.ts`:

```ts
  it("staff pages outside /learners/[id] use the shell and no AppHeader", () => {
    for (const f of [
      "app/review/page.tsx", "app/review/[episodeId]/page.tsx", "app/review/skills/page.tsx", "app/review/studio/page.tsx",
      "app/studio/new/page.tsx", "app/studio/drafts/[id]/page.tsx", "app/curricula/versions/[id]/page.tsx", "app/feedback/page.tsx", "app/settings/ai/page.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toMatch(/StaffShell/);
      expect(src, f).toMatch(/requireShell\(/);
      expect(src, f).not.toMatch(/AppHeader/);
      expect(src, f).not.toMatch(/<main\b/);
    }
  });
  it("the home page keeps its student branch (AppHeader with the student nav + StudentHome)", () => {
    const src = read("app/page.tsx");
    expect(src).toMatch(/studentNav="next"/);
    expect(src).toMatch(/<StudentHome\b/);
  });
```

Run: `npx vitest run tests/unit/shellPages.test.ts` → FAIL (9 files still use `AppHeader`).

- [ ] **Step 2: Edit each page** — after the page's own gate succeeds (never before it), get the shell with the right hint, then replace `<AppHeader …/>` + `<main …>` by `<StaffShell shell={shell}><div …>` (same class rule as Task 6: drop `px-*`/`py-*`, keep `mx-auto`, `max-w-*`, every attribute):

| Page | Hint | Line to add after the gate |
|---|---|---|
| `app/review/page.tsx` | `?learner=` | `const shell = await requireShell(firstParam(sp.learner));` (add `learner?: string \| string[]` to the `searchParams` type) |
| `app/review/skills/page.tsx` | `?learner=` | add `{ searchParams }: { searchParams: Promise<{ learner?: string \| string[] }> }`; `const shell = await requireShell(firstParam((await searchParams).learner));` |
| `app/review/studio/page.tsx` | `?learner=` | same as skills |
| `app/review/[episodeId]/page.tsx` | the episode's child | `const shell = await requireShell(learnerId);` (after `authorizeLearnerPage` → ok) |
| `app/studio/new/page.tsx` | `l.id` | `const shell = await requireShell(l.id);` |
| `app/studio/drafts/[id]/page.tsx` | `draft.learnerId` | `const shell = await requireShell(draft.learnerId);` |
| `app/curricula/versions/[id]/page.tsx` | `v.learnerId` | `const shell = await requireShell(v.learnerId);` |
| `app/feedback/page.tsx` | `?learner=` | `const shell = await requireShell(firstParam(sp.learner));` (add `learner` to the `searchParams` type; the `screen` param is unchanged) |
| `app/settings/ai/page.tsx` | `?learner=` | add `searchParams`; `const shell = await requireShell(firstParam((await searchParams).learner));` |

Imports to add: `import { StaffShell } from "@/components/shell/StaffShell";`, `import { requireShell } from "@/lib/shell/load";`, `import { firstParam } from "@/lib/shell/shell";` (where used). Remove `AppHeader` and imports that only fed `feedbackScreen` / `name` / `showTestBadge`. Check every `return` branch (`grep -n "AppHeader\|<main" <file>`).

Example (`app/review/studio/page.tsx`):

```diff
-import { AppHeader } from "@/components/AppHeader";
+import { StaffShell } from "@/components/shell/StaffShell";
+import { requireShell } from "@/lib/shell/load";
+import { firstParam } from "@/lib/shell/shell";
 …
-export default async function ReviewStudioPage() {
+export default async function ReviewStudioPage({ searchParams }: { searchParams: Promise<{ learner?: string | string[] }> }) {
 …
   if (access.kind === "not-found") notFound();
+  const shell = await requireShell(firstParam((await searchParams).learner));
   const [pending, skillInbox] = …
   return (
-    <>
-      <AppHeader name={…} showTestBadge={…} feedbackScreen={appFeedback.screens.reviewStudio} />
-      <main className="mx-auto max-w-3xl px-4 py-10" data-testid="studio-inbox">
+    <StaffShell shell={shell}>
+      <div className="mx-auto max-w-3xl" data-testid="studio-inbox">
 …
-      </main>
-    </>
+      </div>
+    </StaffShell>
   );
```

- [ ] **Step 3: Update `tests/unit/reviewInboxPage.test.ts`**

Add before the page import:

```ts
vi.mock("@/lib/shell/load", () => ({
  requireShell: async () => ({ displayName: "Thầy/cô của An (thử)", role: "tutor", memberId: "m1", learners: [], current: null, revisionsReady: true }),
}));
vi.mock("@/lib/skills/load", () => ({ loadSkillInbox: async () => null }));
vi.mock("@/lib/studio/load", () => ({ loadStudioPending: async () => null }));
```

and extend the `next/navigation` mock: `vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), usePathname: () => "/review" }));`. Change the `authorizeStaffPage` mock's member to include `id: "m1", role: "tutor"` if the page now reads them. (If `@/lib/skills/load` / `@/lib/studio/load` were already resolving fine before, keep only what is needed for the test to run.)

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/review app/studio app/curricula app/feedback app/settings tests/unit/reviewInboxPage.test.ts tests/unit/shellPages.test.ts
git commit -m "feat(shell): review, studio, curriculum version, feedback and AI settings pages in the shell

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 13: E2E — khung, quyền mỗi link, điện thoại, màn con, link cũ; sửa spec cũ  *(builder · Sonnet)*

**Files:**
- Create: `tests/e2e/shell.spec.ts`
- Modify: `tests/e2e/roles.spec.ts`, `tests/e2e/tutorWork.spec.ts`, `tests/e2e/review.spec.ts`, `tests/e2e/curriculum.spec.ts`, `tests/e2e/studio.spec.ts`, `tests/e2e/purge.spec.ts`

**Interfaces:**
- Consumes: `buildNav` (Task 1), `deskCopy`, `home`, `shellCopy`, `pendingCopy`; helpers `loginAs`, `LEARNER_IDS`.

- [ ] **Step 1: Write the new spec**

```ts
// tests/e2e/shell.spec.ts
import { expect, test, type Page } from "@playwright/test";
import { deskCopy, home } from "@/lib/copy/vi";
import { buildNav, type NavRole } from "@/lib/shell/nav";
import { LEARNER_IDS, loginAs, type AccountKey } from "./helpers";

const AN = LEARNER_IDS.an;
const NG = LEARNER_IDS.nguyen;
const allHrefs = (role: NavRole, id: string) => {
  const n = buildNav(role, id, { revisionsReady: true });
  return [...n.sections.flatMap((s) => [s.href, ...s.children.map((c) => c.href)]), ...n.parent.map((p) => p.href)].filter((h): h is string => h !== null);
};
const childScoped = (h: string) => h.startsWith("/learners/") || h.startsWith("/studio/new");
async function status(page: Page, href: string) { return (await page.goto(href))?.status(); }

test.describe("workdesk shell", () => {
  test("the tutor lands on Bàn làm việc with the sidebar; Chờ duyệt is above the fold at 1366×768", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await loginAs(page, "tutorNguyen");
    await expect(page.getByTestId("staff-sidebar")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: deskCopy.title("Nguyên (thử)") })).toBeVisible();
    await expect(page.getByTestId("nav-desk")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-knowledge")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("learner-switcher")).toHaveCount(0);
    await expect(page.getByTestId("shell-learner")).toContainText("Nguyên (thử)");
    const box = await page.getByTestId("desk-inbox").boundingBox();
    expect(box && box.y + 40).toBeLessThan(768);
    await expect(page.getByTestId("feedback-link")).toBeVisible();
  });

  for (const t of [{ key: "tutorNguyen", own: NG, other: AN }, { key: "tutorAn", own: AN, other: NG }] as const) {
    test(`${t.key}: every sidebar link opens (200); the same links for the other child are 404; parent-only pages are 404`, async ({ page }) => {
      await loginAs(page, t.key as AccountKey);
      for (const h of allHrefs("tutor", t.own)) expect(await status(page, h), h).toBe(200);
      for (const h of allHrefs("tutor", t.other).filter(childScoped)) expect(await status(page, h), h).toBe(404);
      expect(await status(page, "/settings/ai")).toBe(404);
      expect(await status(page, `/learners/${t.own}/delete`)).toBe(404);
    });
  }

  test("parent: every link of both children opens; the switcher keeps the open part", async ({ page }) => {
    await loginAs(page, "parent");
    for (const id of [AN, NG]) for (const h of allHrefs("parent", id)) expect(await status(page, h), h).toBe(200);
    await page.goto(`/learners/${AN}/weak`);
    await expect(page.getByTestId("learner-switcher")).toBeVisible();
    await page.getByTestId(`learner-option-${NG}`).click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/weak$`));
    await expect(page.getByTestId("nav-profile-weak")).toHaveAttribute("aria-current", "page");
    await page.goto("/");
    await expect(page.getByText(home.parentSummary(2))).toBeVisible();
  });

  for (const key of ["studentAn", "studentNguyen"] as const) {
    test(`${key}: the child's home is unchanged (no shell) and every staff link is 404`, async ({ page }) => {
      await loginAs(page, key);
      await expect(page.getByTestId("student-nav")).toBeVisible();
      for (const id of ["staff-shell", "staff-sidebar", "learner-switcher", "feedback-link", "nav-desk"]) await expect(page.getByTestId(id), id).toHaveCount(0);
      const own = key === "studentAn" ? AN : NG;
      for (const h of allHrefs("parent", own).filter((x) => !x.startsWith("/?"))) expect(await status(page, h), h).toBe(404);
    });
  }

  test("old deep links still open, inside the shell", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    for (const h of ["/review", "/review/skills", "/review/studio", `/learners/${NG}/levels`, `/learners/${NG}/weak`, `/learners/${NG}/notes/new`, `/learners/${NG}/assign`, `/studio/new?learner=${NG}`, "/feedback"]) {
      expect(await status(page, h), h).toBe(200);
      await expect(page.getByTestId("staff-shell"), h).toBeVisible();
    }
  });

  test("Chờ duyệt: a compact table with no button; a row opens the existing review page", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.getByTestId("nav-inbox").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${AN}/inbox$`));
    await expect(page.getByTestId("pending-page")).toBeVisible();
    await expect(page.getByTestId("pending-table").getByRole("button")).toHaveCount(0);
    // Other specs run in parallel and may decide the seeded work, so the list can be empty: then the empty line shows.
    const open = page.locator('[data-testid^="pending-open-"]');
    if ((await open.count()) === 0) {
      await expect(page.getByTestId("pending-empty")).toBeVisible();
      return;
    }
    await open.first().click();
    await expect(page).toHaveURL(/\/(review\/[0-9a-f-]{36}|review\/(skills|studio)(\?.*)?(#.*)?|studio\/drafts\/[0-9a-f-]{36}|curricula\/versions\/[0-9a-f-]{36})$/);
  });

  test("phone 390px: no sideways scroll, a 44px menu button opens the sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "tutorNguyen");
    for (const h of ["/", `/learners/${NG}/inbox`, `/learners/${NG}/levels`, `/learners/${NG}/curricula`, `/learners/${NG}/assign`]) {
      await page.goto(h);
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(sw, h).toBeLessThanOrEqual(cw);
    }
    await page.goto("/");
    await expect(page.getByTestId("staff-sidebar")).toBeHidden();
    const toggle = page.getByTestId("nav-menu-toggle");
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await toggle.click();
    await expect(page.getByTestId("nav-profile")).toBeVisible();
    expect((await page.getByTestId("nav-profile").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId("feedback-link-phone")).toBeVisible();
  });
});
```

- [ ] **Step 2: Update the old specs**

- `roles.spec.ts`: import `deskCopy`; both heading checks `new RegExp(`^${todayPage.titlePrefix}`)` → `new RegExp(`^${deskCopy.titlePrefix}`)`; in the tutor test replace `await expect(page.getByRole("listitem")).toHaveCount(1);` with `await expect(page.getByTestId("learner-switcher")).toHaveCount(0); await expect(page.getByTestId("shell-learner")).toContainText(t.own);`. Drop `todayPage` from the import if unused.
- `tutorWork.spec.ts` line ~22: heading regex → `deskCopy.titlePrefix` (import `deskCopy`).
- `review.spec.ts`:
  - ~line 68: replace the `review-link` block with `await page.getByTestId("nav-inbox").click(); await page.getByTestId("nav-inbox-work").click(); await expect(page).toHaveURL(/\/review(\?.*)?$/);` (the rest — heading `reviewPage.inboxTitle`, `inbox-list` — unchanged).
  - ~line 384 (students): keep `review-link` count 0 and add `await expect(page.getByTestId("staff-sidebar")).toHaveCount(0);`.
  - ~line 558: replace `await page.getByTestId(`revisions-link-${LEARNER_IDS.an}`).click();` with `await page.goto(`/learners/${LEARNER_IDS.an}/inbox`); await page.getByTestId("nav-inbox-revisions").click();`.
- `curriculum.spec.ts` ~line 35: `page.getByTestId(`curricula-link-${NGUYEN}`).click()` → `page.getByTestId("nav-curricula").click()`.
- `studio.spec.ts` ~line 39: `page.getByTestId(`studio-link-${NGUYEN}`).click()` → `await page.getByTestId("nav-assign").click(); await page.getByTestId("nav-assign-studio").click();`.
- `purge.spec.ts`: ~line 34 `await page.getByTestId(`delete-link-${t.learnerId}`).click();` → `await page.goto(`/?learner=${t.learnerId}`); await page.getByTestId("nav-delete").click();`; ~line 75 `delete-link-${TEST_LEARNER_AN_ID}` count 0 → `await expect(page.getByTestId("nav-delete")).toHaveCount(0); // no parent group for a tutor`.
- `practice.spec.ts` (~line 96 `attention-${NG}` on `/`) and `workdesk.spec.ts` (`feedback-link`) need no change — keep them as they are and confirm they still list.

- [ ] **Step 3: List the tests**

Run: `npm run test:e2e -- --list`
Expected: `shell.spec.ts` tests listed; no TypeScript error in any spec. (Full run happens in CI job "E2E smoke" with Supabase local; this machine has no Docker.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): workdesk shell — landing, link rights per role, phone 390px, student home, old links; update entry points

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
```

---

### Task 14: Chữ, tài liệu, review Opus, PR  *(builder · Sonnet cho tài liệu; reviewer · Opus bắt buộc)*

**Files:**
- Create: `tests/unit/shellCopy.test.ts`
- Modify: `docs/UX_COPY_GUIDE.md`, `docs/PROGRESS.md`, `CLAUDE.md`

- [ ] **Step 1: Copy test**

```ts
// tests/unit/shellCopy.test.ts
import { describe, expect, it } from "vitest";
import { deskCopy, pendingCopy, shellCopy, tutorHonorific } from "@/lib/copy/vi";

const strings = (o: unknown): string[] =>
  typeof o === "string" ? [o] : typeof o === "function" ? [String((o as (...a: unknown[]) => unknown)(1, 2, 3))] : o && typeof o === "object" ? Object.values(o).flatMap(strings) : [];

describe("workdesk shell copy", () => {
  const all = [...strings(shellCopy), ...strings(pendingCopy), ...strings(deskCopy)];
  it("never hard-codes 'cô' / 'thầy' alone: the tutor is tutorHonorific", () => {
    for (const s of all) expect(s.replaceAll(tutorHonorific, ""), s).not.toMatch(/(^|[^\p{L}])(cô|thầy)([^\p{L}]|$)/iu);
  });
  it("no track code, no provider name", () => {
    for (const s of all) {
      expect(s, s).not.toMatch(/Track [AB]/);
      expect(s, s).not.toMatch(/Claude|Anthropic|OpenAI/);
    }
  });
});
```

Run: `npx vitest run tests/unit/shellCopy.test.ts` → PASS (fix any string it flags in `lib/copy/vi.ts`).

- [ ] **Step 2: `docs/UX_COPY_GUIDE.md`** — append:

```md
## Khung bàn làm việc (08/11/2026)

Khóa mới trong `lib/copy/vi.ts` (người dạy luôn là `tutorHonorific`):

- `shellCopy` — cột trái theo bản bấm thử: Bàn làm việc · Hồ sơ học sinh · Bản đồ kiến thức · Lộ trình · Buổi học · Giao bài · Giáo trình · Chờ duyệt; nhãn "Sắp có" cho mục của lát sau (không bấm được); nhóm "Phụ huynh"; câu cuối cột "Mọi thứ AI soạn là nháp: chưa duyệt thì con chưa thấy."
- `pendingCopy` — trang Chờ duyệt (bảng: Loại · Nội dung · Từ ngày · Cần làm · Mở; lọc Tất cả · Bài nộp · Cần xem câu · Nháp AI · Kỹ năng) và khung "Chờ duyệt · n" ở Bàn làm việc. Không có nút duyệt trong bảng.
- `deskCopy` — Bàn làm việc: tiêu đề, nút "Ghi buổi học hôm nay", cảnh báo mới (hồ sơ đầu vào, giáo trình, bài quá hạn, ⚑), 3 khung (Hồ sơ · Giáo trình · Buổi học & bài giao).
- `appFeedback.screens.inbox` = "Chờ duyệt".

Học sinh không thấy gì mới. "Quá hạn" chỉ ở màn người lớn.
```

- [ ] **Step 3: `docs/PROGRESS.md` + `CLAUDE.md`** — add a "Khung bàn làm việc" entry: branch `feature/workdesk-shell`, PR number, **SQL cần áp: không có**, assumptions K1–K16 (link to this plan), what the parent must decide (K1, K2, K3, K8, K9), and "W3 trang mới nằm trong layout, không AppHeader". In `CLAUDE.md` "Current status" add one bullet (same facts, short). Do not change the "next migration number" line (still 0027).

- [ ] **Step 4: Full check**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e -- --list`
Expected: all green; e2e listed.

- [ ] **Step 5: Opus review** — dispatch `reviewer` (Opus) on `git diff origin/main...HEAD` with this plan and the spec. Must check: no new route under `app/api`, no file in `db/migrations`, no `if (track …)`, every staff page gated before admin loaders, student files untouched (`git diff --stat origin/main -- components/student app/practice app/activities app/account` empty), no approve/confirm button in `PendingTable` / `DeskInbox`, copy only from `lib/copy/vi.ts`. Fix findings; re-run Step 4.

- [ ] **Step 6: Commit docs and push; open the PR**

```bash
git add tests/unit/shellCopy.test.ts docs/UX_COPY_GUIDE.md docs/PROGRESS.md CLAUDE.md
git commit -m "docs(shell): copy guide, progress, status; copy test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1"
git push -u origin feature/workdesk-shell
```

PR description (tiếng Việt) — khung:

```md
## Khung bàn làm việc (giao diện giống bản bấm thử)

**Làm gì**
- Trang người lớn có thanh trên + cột trái cố định như bản bấm thử: Bàn làm việc · Hồ sơ học sinh · Bản đồ kiến thức (Sắp có) · Lộ trình (Sắp có) · Buổi học · Giao bài · Giáo trình · Chờ duyệt · Góp ý về app. Phụ huynh có thêm nhóm "Phụ huynh" (Cài đặt AI, Xóa dữ liệu của em) và nút chọn An / Nguyên ở thanh trên.
- Trang chủ người lớn = **Bàn làm việc** của một em: nút "Ghi buổi học hôm nay" → khung "Chờ duyệt · n" → "Cần chú ý" → 3 khung (Hồ sơ · Giáo trình · Buổi học & bài giao).
- Trang mới **Chờ duyệt** của từng em: bảng gọn, lọc theo loại, mục cũ nhất trên cùng, chỉ có nút "Mở" (không duyệt một cú bấm). Duyệt thật vẫn ở các trang cũ.
- Mọi trang và link cũ vẫn chạy. Màn của con không đổi.

**SQL cần phụ huynh áp:** không có.

**Cách thử trên preview** (đăng nhập tài khoản thử)
1. Gia sư Nguyên (thử): thấy cột trái; "Bàn làm việc" sáng; "Chờ duyệt" nằm ngay dưới tiêu đề, không phải cuộn (máy tính 1366×768).
2. Bấm lần lượt từng mục cột trái; mở "Hồ sơ học sinh" thấy các trang con (Điểm cần chú ý, …).
3. "Chờ duyệt": bấm các nút lọc; bấm "Mở" một dòng → sang đúng trang duyệt cũ.
4. Phụ huynh: bấm "An" / "Nguyên" ở thanh trên khi đang ở "Điểm cần chú ý" → sang "Điểm cần chú ý" của em kia.
5. Điện thoại: bấm "Các phần" để mở cột trái; trang không bị kéo ngang.
6. Đăng nhập em (thử): trang của con như cũ, không có cột trái.

**Tiêu chí đạt / chưa**
- [ ] Gia sư và phụ huynh thấy bố cục giống bản bấm thử
- [ ] Mỗi link cột trái mở được với đúng người; người khác 404
- [ ] Chờ duyệt không có nút duyệt; "Mở" sang đúng trang
- [ ] Điện thoại 390 px không cuộn ngang; ô bấm ≥ 44 px
- [ ] Màn của con không đổi; link cũ vẫn chạy
- [ ] CI xanh (typecheck, lint, unit, E2E smoke); review Opus xong

**Cần phụ huynh quyết:** K1 (tên "Bàn làm việc"), K2 (mục lát sau hiện mờ hay ẩn), K3 (2 mục Buổi học / Giao bài hay gộp), K8 (lịch học thuộc lát nào), K9 (xem từng em) — chi tiết `docs/superpowers/plans/2026-11-08-workdesk-shell.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Self-Review

**1. Spec / prototype coverage**

| Bản bấm thử / spec | Task | Ghi chú |
|---|---|---|
| Khung `.top` + `.shell` + `.side` sticky (spec §5 rule 5) | 4, 5, 12 | `md:sticky md:top-0 md:h-dvh`; điện thoại: ngăn kéo |
| Chọn em (`.switch`) | 4 | thanh trên (K4) |
| `VIEWS` (8 mục) + "Góp ý về app" cuối cột | 1, 4 | `parentfb` ẩn (K2); "Buổi học & bài giao" tách 2 (K3) |
| `R.desk` (tiêu đề + `logBtn` → `inboxMini` → `alerts()` → `grid3`) — spec §5 rule 2 | 9, 10, 11 | e2e đo "Chờ duyệt" trên màn 1366×768; khung Lộ trình → Giáo trình (K7) |
| `alerts(pg)` — full list only on desk (rule 3) | 9 | trang khác chưa có dòng nhắc → Để lát sau |
| `R.inbox` `.ib` bảng gọn, lọc, cũ nhất trên (rule 4); "không duyệt một cú bấm" (spec §3) | 7, 8 | test: không `<button>` trong bảng |
| `R.profile` | map → `/levels` (đã có W1 + SM-2) | đổi bố cục theo `R.profile` → Để lát sau |
| `R.curriculum` | map → `/learners/[id]/curricula` (W2) | |
| `R.map`, `R.roadmap` | 1 ("Sắp có") | W3, W5 |
| `R.schedule`, `R.log` | map → `notes`, `notes/new`, `assign` | lịch tuần → K8 |
| `R.parentfb` | ẩn | W6 |
| `.modal.wide` + `.sticky-act` (rule 1) | — | màn duyệt mới của W3/W4 (Để lát sau) |
| Rule 6 (không lặp danh sách) | 10 | Bàn làm việc chỉ đếm bài giao; danh sách ở Giao bài |
| Rule 7 (form) | — | không đổi form nào |
| Rule 8 (≤ 1240 px) | 4 | `max-w-[1240px]` |
| 390 px, ô ≥ 44 px | 4, 8, 13 | e2e đo `scrollWidth` + chiều cao nút |
| Màn con không đổi | 6, 11, 12, 13 | test canh file + unit `homePage` + e2e |
| Quyền không đổi | 3, 5, 8, 11, 12, 13 | layout strict + cổng của từng trang; e2e mỗi link × vai |
| Không SQL / API mới | Global + 14 (review) | |

**2. Placeholder scan:** không còn "TBD"/"TODO"/"làm sau" trong các bước code. Những chỗ phụ thuộc mã có sẵn mà plan không chép nguyên (chữ ký `curriculumCopy.reviewTitle`, nhánh rỗng của `loadStudentHome`, mock `reviewInboxPage.test.ts`) đều có lệnh đọc + cách sửa cụ thể. Task 6/12 sửa cơ học có quy tắc + ví dụ diff + test canh thay vì chép 26 file.

**3. Type consistency:** `SectionKey`/`NavModel`/`buildNav(role, learnerId, flags)` (T1) dùng ở T2, T4, T13; `activeFor`/`switchHref`/`feedbackHref` (T2) dùng ở T4; `ShellData`/`toShell`/`firstParam`/`requireShell(hint, { strict })` (T3) dùng ở T4, T5, T10, T11, T12; `PendingRow`/`PendingGroup`/`buildPendingRows`/`filterRows`/`countGroups`/`parseGroup`/`PENDING_LOAD_LIMIT` (T7) dùng ở T8, T10; `PendingRowsResult`/`loadPendingRows(memberId, role, learnerId)` (T8) dùng ở T10; `DeskAlert`/`deskAlerts(DeskAlertInput)` (T9) dùng ở T10; `DeskData`/`loadDesk(shell, learner)`/`DeskView({ shell, learner, data, todayIso })` (T10) dùng ở T11. Tên `PendingGroup` tránh trùng `InboxGroup` có sẵn trong `lib/skills/view.ts`. `PhoneFeedbackLink` (T4) có trong bảng File structure và trong danh sách file của T4. Hai test cùng tên biến `render` / `today` ở file khác nhau không đụng nhau.

**Ước lượng:** 14 task; ~20 file mới, ~35 file sửa (phần lớn là sửa cơ học 26 trang), 1 file xóa; không migration, không API, không AI. Cỡ code ≈ 35–40 % W2, rủi ro thấp hơn nhiều (không có dữ liệu mới); phần rủi ro chính là e2e cũ phụ thuộc trang chủ cũ (đã liệt kê đủ ở Task 13).
