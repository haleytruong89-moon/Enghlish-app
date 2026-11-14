# W4 · Bàn học của con — Implementation Plan (bản kế hoạch, chưa code)

> **For agentic workers:** Implement this plan PR-by-PR, task-by-task (`builder`, Sonnet). Steps use checkbox (`- [ ]`) syntax for tracking.
> Mỗi PR kết thúc bằng review Opus (`reviewer`) trước khi mở PR cho phụ huynh. Sai 2 lần cùng chỗ → dừng, chuyển Opus. **Mỗi file SQL: Opus review riêng file SQL trước khi code tiếp phần app.**
> **Chưa được code PR nào** cho tới khi phụ huynh trả lời các câu hỏi "chặn" của PR đó (mục "Câu hỏi cho phụ huynh", cột "Chặn PR").

**Goal:** Dựng "Bàn học của con" theo brief S-1…S-10 (14/11): màn **Hôm nay** (thẻ Làm tiếp + danh sách việc), **Cô đã xem**, **Đã làm**, **Hành trình** (núi theo trạng thái từng Unit + mốc do thầy/cô xác nhận, cấp theo mảng, mục tiêu tuần + chuỗi tuần mềm, thành tích, "Những điều mình đã làm được", "Ngày ấy – bây giờ"), các luồng làm / nộp bài (trên app có tự lưu, bài giấy chụp nhiều trang, bài link), màn sau khi nộp theo S-10 (không điểm, không đáp án, "Thử lại câu này" một lần ở bài luyện), Đặt mục tiêu tuần; phía thầy/cô thêm trang **Lộ trình** nhỏ (mốc) và các chỗ duyệt mục tiêu / lần thử lại.

**Architecture:** Chia **6 PR tuần tự** (W4a → W4e, W4c tách đôi), mỗi PR một nhánh `feature/w4x-…`, mỗi PR có một migration riêng (W4a lấy **0031**; các PR sau dùng số **dự kiến 0032–0035**, thực tế "số trống kế tiếp lúc gộp"; các PR sau lấy **số trống kế tiếp lúc gộp**; bộ mục kiến thức Destination cũng lấy số trống kế tiếp khi sẵn sàng). Học sinh vẫn chỉ đọc / ghi qua hàm `eng_my_*` (`security definer`, `search_path = ''`, nhận diện bằng `auth.uid()`, chỉ `authenticated`). Mọi luật dẫn xuất (núi, chuỗi tuần, thành tích, "bài tính vào mục tiêu") là **hàm thuần TypeScript một nơi** (như `lib/sessions/count.ts`), SQL chỉ trả dữ kiện có cấu trúc. Không AI mới, không đổi `prompts/*`, không đổi engine S7a / điểm.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind 4 · Supabase (schema `english`) · zod · Vitest (unit · dom · db) · Playwright (CI). Không thêm thư viện (núi vẽ bằng SVG tay; xoay / nén ảnh bằng `<canvas>`).

**Nguồn:** brief phụ huynh 14/11 (S-1…S-10, chép trong yêu cầu lát); bản bấm thử `/home/claude/mockups/student/index.html` (con) và `/home/claude/mockups/workdesk/index.html` (thầy/cô, đang sửa thêm màn Lộ trình nhỏ — đã đọc bản lúc 21:27); `CLAUDE.md`; `docs/PRD_FAMILY_EDITION.md` (§1, §2, §6.2, §10); `docs/DESIGN.md` §5, §7, §17, §19.2, §19.8–§19.19; `docs/DOMAIN.md` (bản 0.4) §1, §2, §4, §5, §6, §7, §11; `docs/UX_COPY_GUIDE.md` §2, §3.2, §3.5, §4; `docs/PROGRESS.md` (mục 3A, 3B); spec `docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md` §W4–W6; kế hoạch mẫu `2026-11-14-ux-round3.md`.

---

## 0. Tóm tắt cho phụ huynh (đọc phần này trước)

**Con sẽ có gì sau W4:** một bàn học riêng trên iPad / laptop, 4 mục: **Hôm nay** (việc cần làm hôm nay, thẻ "Làm tiếp" mở đúng bài đang dở), **Cô đã xem** (lời khen, điều cần sửa, mục cần ôn — hiện ngay khi thầy/cô gửi), **Đã làm** (mọi bài đã nộp, chờ cô xem / cô đã xem), **Hành trình** (ngọn núi theo giáo trình chính: Unit nào xong, con đang ở đâu, còn mấy Unit tới mốc và tới đỉnh; cấp từng mảng do thầy/cô xác nhận; mục tiêu tuần + chuỗi tuần; thành tích thật; những điều con đã tự làm được; "Ngày ấy – bây giờ"). Nộp bài giấy bằng camera iPad (nhiều trang, xếp lại, xoay, xóa), nộp bài link bằng ảnh trang kết quả, làm bài trên app có tự lưu, sau khi nộp thấy **câu nên nhìn lại** (không điểm, không đáp án) và được **thử lại mỗi câu một lần** ở bài luyện.

**Thầy/cô có thêm:** trang **Lộ trình** nhỏ (đặt / xác nhận / bỏ mốc; app tự đề xuất mốc nháp từ giáo trình, hồ sơ đầu vào, mục tiêu của track), duyệt mục tiêu tuần con đề xuất, xem lần "thử lại câu này" của con, gửi góp ý cho bài nộp giấy / link.

**Chia 6 PR** (mỗi PR thử được trên bản preview, gộp riêng):

| PR | Nhánh | Làm gì | SQL (phụ huynh áp sau khi gộp) |
|---|---|---|---|
| **W4a** | `feature/w4a-roadmap` | Lộ trình mốc (thầy/cô) + Hành trình: núi (con) | `0031_roadmap_milestones.sql` |
| **W4b** | `feature/w4b-student-desk` | Khung bàn học: Hôm nay · Cô đã xem · Đã làm · Hành trình; bỏ trang "Bài luyện" cũ (chuyển hướng) | `NNNN_student_desk_reads.sql` (chỉ hàm đọc, không bảng) |
| **W4c1** | `feature/w4c1-paper-link` | Nộp bài giấy (camera, nhiều trang, xếp / xoay / xóa, 2 câu hỏi) + nộp bài link + góp ý của thầy/cô cho bài nộp | `NNNN_paper_link_submit.sql` |
| **W4c2** | `feature/w4c2-player-result` | Làm bài trên app (từng câu, tự lưu) + màn sau khi nộp S-10 + "Thử lại câu này" + loại bài Luyện tập / Kiểm tra | `NNNN_result_view_retry.sql` |
| **W4d** | `feature/w4d-weekly-goal` | Mục tiêu tuần (con đề xuất, thầy/cô đồng ý) + chuỗi tuần mềm + thành tích; **đổi luật "không streak"** trong PRD / CLAUDE.md / DOMAIN | `NNNN_weekly_goals.sql` |
| **W4e** | `feature/w4e-levels-cando` | Cấp theo mảng (con thấy) + "Những điều mình đã làm được" + "Ngày ấy – bây giờ" (thầy/cô chọn bài) | `NNNN_then_now.sql` |

Số migration lấy theo thứ tự gộp; **nếu một PR khác chen vào thì lấy số trống kế tiếp** (test tìm file theo hậu tố, không viết cứng số — như 3B U23).

**Không làm trong W4:** nút "Hỏi gia sư" (S-3: chỉ để **một ô mờ "Sắp có"** trong bài luyện, không có ở bài kiểm tra); bước **Nói** của bài chủ đề bằng chuyển giọng nói thành chữ trên máy (chưa có — cần spike `Sp` trước, xem Q13); AI đọc ảnh bài giấy con nộp (thuộc lát "giao bài AI đọc ảnh" của spec); bảng xếp hạng, so sánh hai em, xu / điểm thưởng.

**Cần phụ huynh trả lời trước:** 22 câu ở mục 2 — có **6 chỗ đổi luật đã ghi trong tài liệu** (chuỗi tuần; con thấy cấp; con thấy tên điều đã làm được; con thấy Unit giáo trình; con thấy số đếm việc của mình; con không thấy đáp án sau khi nộp — ngược với Studio B1 hiện nay). Mỗi PR chỉ chờ các câu ghi ở cột "Chặn PR".

---

## 1. Đã kiểm trong code trước khi viết kế hoạch (14/11, `main` = `c7afba8`, sau PR #34 / 3B; không sửa code app)

1. **Trang của con hôm nay là 2 màn rời:** `/` (`components/student/StudentHome.tsx`: "Việc tiếp theo" + thẻ chủ đề theo `eng_my_home`; bài Studio cũng là một "chủ đề" 1 bước `ACT-SOURCE-QA`, `mode = 'PRACTICE'`) và `/practice` (`StudentPractice.tsx`: bài link / PDF theo `eng_my_practice`, tối đa 40 bài, kèm "Việc cần ôn" + lời nhắn từ `eng_my_review_points`). Đầu trang dùng `AppHeader studentNav="next" | "practice"`. Bài làm từng bước ở `/activities/[id]` (`WorkForm` tự lưu qua `eng_save_draft`, nộp qua `eng_submit_attempt` có `client_submission_id`; bài sửa S6 qua `eng_my_revision`).
2. **`eng_my_home` (bản 0027)** trả `inquiries[].steps[]` với `attempts` (số lần nộp) — **không** có loại mẫu (studio / chủ đề), không có nháp, không có giờ nộp ⇒ không đủ cho "Làm tiếp" (bài đang dở), "Đã làm" (giờ nộp, đã xem chưa). Cần hàm đọc mới (W4b), không đụng hàm cũ.
3. **Nộp bài link / PDF có sẵn (0016):** `eng_submit_practice` + `SubmitPanel` / `ImagePicker`: dán / chọn ảnh, **xóa** được, **không** xếp lại, **không** xoay, không mở camera (`capture`). **Tối đa 6 file** (`submissions.file_ids` CHECK ≤ 6). Hai câu hỏi: "lần đầu?" (cả hai loại) và "có bấm Hint?" **chỉ ở bài link** — SQL **từ chối** `used_hint` khác NULL cho bài PDF. Bucket chỉ nhận PDF/PNG/JPEG/WebP, 15 MB/file. Em sửa lại được tới khi thầy/cô ghi kết quả (`reviewed`).
4. **Bài nộp giấy / link không có kênh góp ý cho con:** "đã xem" = có `results` cho bài giao; `feedback_notes` (S6) chỉ trỏ tới `attempts` (bài làm trên app), không tới `submissions`. Lời nhắn chung chỉ có ở ghi chú buổi học (`message_to_learner`).
5. **Màn sau khi nộp bài Studio hiện nay (`eng_my_studio_review`, 0024; `StudioReview.tsx`)** trả và hiện **đáp án đúng ("Nên là") + giải thích ("Vì sao")** cho câu sai — đúng quyết định E2/E7 (18/10) và UX_COPY_GUIDE §3.5. **S-10 nói ngược lại** (không đáp án). Nút "Làm lại" = làm lại cả bài (lần làm 2), không theo từng câu.
6. **Không có khái niệm "bài kiểm tra" cho bài Studio / link / PDF:** mẫu Studio luôn `PRACTICE`; `results.source` (`test`/`practice`) do người lớn chọn **lúc ghi kết quả**. Chỉ bài chủ đề có bước `INDEPENDENT_CHECK` (engine S7a dùng mode này để đếm "tự làm" — đổi mode là đổi cách đếm, DESIGN §17).
7. **Không có số đo thời gian làm bài** ở đâu cả (không bảng, không cột). DOMAIN §1: "Nhật ký hành vi: **Không** thêm mới". Văn bản đồng ý `pilot-2026-10` câu 1 không nhắc thời gian làm bài.
8. **Không có chuyển giọng nói thành chữ (STT)** trong code (không `lib/stt`, không thư viện Whisper, không `speech_metrics`). Spike `Sp` chưa chạy; S10 chưa làm.
9. **Giáo trình (0026):** không có cờ "giáo trình chính". Trạng thái Unit = sự kiện mới nhất (`curriculum_unit_events`, theo mã Unit ổn định), "bỏ qua" ở phiên bản hoặc ở sự kiện; luật "đang học đến" ở `lib/curriculum/progress.ts` (`curriculumProgress`). Dòng "Không phải Unit" nằm trong `payload.ignored` của phiên bản (không có id riêng; có `isProgressTest`, `relatedUnits` ở `lib/curriculum/rows.ts`). Học sinh không đọc được bảng nào của W2.
10. **Hồ sơ đầu vào (0025):** `learner_intake.content.goals = [{title, due}]` (`due` là chữ ≤ 20 ký tự, vd "06/2027"); bản hiện hành = dòng mới nhất. **Mục tiêu ngôn ngữ của track** chỉ có trong JSON danh mục (`catalogue_versions` → `tracks.A.language_goal = "B1"`, `tracks.B.language_goal = "secure C1"` — chữ tiếng Anh, không dùng thẳng làm tên mốc được).
11. **Cấp theo mảng (0020):** `level_decisions` (chỉ thầy/cô ghi; baseline / adjust); chưa có dòng = cấp "giả định" của track. Mảng Tư duy dùng thang `'1'..'4'` (không phải CEFR). e2e `student-no-scores.spec.ts` đang **khẳng định con không bao giờ thấy cấp** (P2-d, SM-2) và không thấy tên bậc S7a.
12. **Mức đã xác nhận:** kỹ năng — `mastery_decisions` (`CONFIRMED`) + `competency_state`; mục kiến thức — `point_decisions` (`CONFIRMED`) + `point_state`. Câu "can-do" có sẵn: kỹ năng có `can_do` (tiếng Anh) + `title_vi`; Track A có `skillNames[].student` (UX §3.4); mục kiến thức chỉ có `error_tags.label_vi`.
13. **Cột trái thầy/cô:** mục `roadmap` đang `status: "soon"`, `lane: "W5"` (`lib/shell/nav.ts`), đường dẫn `/learners/[id]/roadmap` đã đăng ký ở `lib/shell/paths.ts`. Số "Chờ duyệt" đọc qua `loadPendingRows` (`lib/desk/load.ts`, `buildPendingRows`).
14. **Tên lát trùng:** spec bàn làm việc (08/11) đặt **W4 = "4 cách giao bài + thang CAM-WS-1"** và **W5 = "Lộ trình 12 tháng nhiều dòng (`roadmap_versions`)"**; DOMAIN R6 ghi "`CAM-WS-1` vào **W4**". Brief này dùng "W4" cho Bàn học của con và đặt Lộ trình mốc nhỏ vào đây (Q1).
15. **Purge mới nhất:** `eng_purge_learner` / `eng_purge_preview` của `0030` (thân 0029 + 2 bảng). Mỗi migration W4 có bảng `learner_id` phải **chép thân purge của migration đã áp gần nhất** (0030, hoặc 0031 nếu bộ Destination đổi purge) + bảng mới.
16. **Study Launcher:** repo này không có dòng code nào gọi / được Launcher gọi; PRD §6.2: "Hai app **không** gọi dữ liệu của nhau trong v1"; DOMAIN §11: "nối bài giao sang Study Launcher (để sau)".

---

## 2. Câu hỏi cho phụ huynh — **ĐÃ TRẢ LỜI 14/11 (22:26)**

> **Phụ huynh: "ok đề xuất"** — mọi câu Q1–Q22 theo cột "Đề xuất", **trừ Q5: chọn (i) chỉ đếm bài đã nộp** (không ghi phút làm bài, không bảng `work_minutes`, không mục tiêu phút, không văn bản đồng ý mới). Ghi thành quyết định **D34–D38** trong PRD (D35 + D38 đã vào ở W4a) ở đúng PR dùng tới. Không còn câu nào chặn PR.


Mỗi câu có **đề xuất**; kế hoạch dưới đây viết theo đề xuất, đổi nếu phụ huynh chọn khác. "Chặn PR" = PR đó không bắt đầu code khi chưa có câu trả lời.

| # | Câu hỏi | Đề xuất | Chặn PR |
|---|---|---|---|
| **Q1** | **Tên lát + quan hệ với spec.** Spec 08/11: W4 = giao bài AI đọc ảnh + `CAM-WS-1`, W5 = Lộ trình nhiều dòng có phiên bản. Brief này gọi Bàn học của con là W4 và đặt "Lộ trình mốc nhỏ" (S-8) vào đây. | Lát này = **W4 · Bàn học của con**; W4 cũ đổi thành **W5** (giao bài AI đọc ảnh + `CAM-WS-1`, R6 đi theo), W5 cũ thành **W6**, W6 cũ thành **W7** (sửa spec + DOMAIN R6 + `lane` ở `nav.ts`). **Lộ trình mốc nhỏ là bước đầu** của Lộ trình nhiều dòng: bảng mốc giữ riêng; Lộ trình nhiều dòng (W6 mới) sẽ đọc các mốc này, không thay chúng. DOMAIN §4 / §6 dòng "Lộ trình" sửa thành luật mốc ở mục 3.4 (bản 0.5). | W4a |
| **Q2** | **Sáu chỗ đổi luật cho con** (tài liệu hiện cấm): (a) **chuỗi tuần mềm** (CLAUDE.md "Không thêm streak", DOMAIN §1, §11); (b) con thấy **tên cấp theo mảng** (S-5) — đảo P2-d của SM-2, DOMAIN §2 "con không thấy mức", UX §3.2; (c) con thấy **tên điều đã tự làm được** (kỹ năng / mục kiến thức đã xác nhận 3–4) — DOMAIN §7.6 "không nhãn kỹ năng"; (d) con thấy **Unit + trạng thái của giáo trình chính** (UX W2: "Học sinh không thấy gì ở W2"); (e) con thấy **số đếm việc của chính mình**: "3/5 bài tuần này", "Đã xong 4/26 Unit", "Câu 13/30" (đã trả lời); (f) con **không** thấy đáp án sau khi nộp (Q3). | Đồng ý cả 6, ghi thành **D34–D36** trong PRD, sửa CLAUDE.md / DOMAIN (bản 0.5) / UX trong **đúng PR dùng tới** (a: W4d; b, c: W4e; d: W4a; e: W4b; f: W4c2). Luật số đếm (e): **được** đếm việc / Unit / câu đã trả lời của chính con; **không bao giờ** số câu đúng / sai, %, điểm, x/4, so với em kia. | W4a (d), W4b (e), W4c2 (f), W4d (a), W4e (b, c) |
| **Q3** | **S-10 ngược Studio B1 (E2/E7, 18/10):** hôm nay con thấy "Nên là: …" + "Vì sao: …" ngay sau khi nộp. S-10: không đáp án. Sau khi thầy/cô xem xong thì sao? Bản thử còn liệt kê "Các câu còn lại: ổn · Câu 13 · …" (lộ số câu đúng). | Theo S-10: màn sau khi nộp **không** đáp án, **không** giải thích, **không** liệt kê câu đúng (chỉ một dòng "Các câu còn lại: ổn", không số). Sau khi thầy/cô xem: con thấy lời góp ý của thầy/cô (S6 / góp ý bài nộp) — **không** tự hiện đáp án; thầy/cô muốn cho đáp án thì viết trong góp ý. Migration NNNN **thu quyền** `eng_my_studio_review` khỏi `authenticated` (trình duyệt không lấy được đáp án nữa). | W4c2 |
| **Q4** | **"Bài kiểm tra" là gì trong dữ liệu?** Hôm nay bài Studio / link / PDF không có cờ này; bài chủ đề có bước `INDEPENDENT_CHECK` (engine đếm "tự làm" theo mode). | Thêm **cờ "Bài kiểm tra"** chọn khi giao (Studio, link, PDF), lưu ở bảng chỉ thêm `activity_test_marks` / cột mới của bảng giao bài qua hàm v2; **chỉ đổi giao diện** (không "Thử lại câu này", không ô "Hỏi gia sư", chữ "Bài kiểm tra: tự làm, không có gợi ý"), **không đổi mode, không đổi cách tính S7a / điểm**. Bước `INDEPENDENT_CHECK` của bài chủ đề coi là "kiểm tra" như hiện nay. Đổi cách tính (cho cờ này vào engine) = việc riêng, phụ huynh quyết sau. | W4c2 |
| **Q5** | **"≥ 15 phút làm thật" cần ghi phút làm bài** — một loại nhật ký hành vi mới (DOMAIN §1 cấm thêm), văn bản đồng ý chưa nói. Mục tiêu phút (tùy chọn) ở bản thử cũng cần số này. | **(ii)** ghi **một dòng mỗi phút làm bài thật trên app** (trang bài đang mở, có thao tác trong 60 giây qua; không ghi nội dung, không ghi trang nào khác), chỉ dùng cho mục tiêu tuần; thêm câu vào văn bản đồng ý bản mới `pilot-2026-11`; DOMAIN §1 ghi ngoại lệ. Nếu phụ huynh chọn **(i)** "chỉ đếm bài đã nộp": bỏ bảng `work_minutes`, bỏ mục tiêu phút, sửa chữ mục tiêu tuần. | W4d |
| **Q6** | Bài **thầy/cô "nộp thay"** (ảnh bài giấy con làm), bài ghi **trong buổi** (Ghi buổi, `eng_record_offline_attempt`), **bài nạp** (W3) có tính vào mục tiêu tuần? | Tính: bài con tự nộp; bài thầy/cô / phụ huynh nộp thay **ảnh bài giấy của con** trong tuần đó. Không tính: bài ghi trong buổi, bài nạp (bài cũ), lần "thử lại câu này". | W4d |
| **Q7** | **Tuần nghỉ** (Tết, tuần thi ở trường) có làm đứt chuỗi? | v1 **không có tuần nghỉ** (đúng câu S-4 "lỡ một tuần thì chuỗi tính lại từ tuần sau"); thêm sau nếu thấy cần. | W4d |
| **Q8** | **Khoảng gợi ý** khi con đặt mục tiêu (bản thử: 3–6 bài/tuần cho cả hai; phút 1 g 30 – 2 g 30). | Cấu hình theo track ở `track_settings.weekly_goal_range`: A `{min 2, max 5}`, B `{min 3, max 6}`; phút: không đặt / 60 / 90 / 120 / 150. Thầy/cô điều chỉnh được ngoài khoảng (1–14 bài, 30–600 phút). Mục tiêu **đầu tiên** cũng chỉ áp từ tuần sau (S-6). | W4d |
| **Q9** | **Giáo trình chính** của núi (S-1: "nhiều giáo trình → núi theo giáo trình chính"): chưa có trường này. | Thầy/cô chọn ở trang Lộ trình (bảng chỉ thêm, dòng mới nhất thắng). Chưa chọn → giáo trình đã duyệt có **sự kiện Unit gần nhất**; chưa có sự kiện nào → giáo trình đã duyệt **tạo sớm nhất**. Giáo trình khác hiện ở thẻ "Giáo trình khác" (tên + "n/N Unit đã xong"). | W4a |
| **Q10** | **Đỉnh khi chưa có mốc đỉnh đã xác nhận:** bản thử của con hiện "Lên B1" lấy thẳng từ cấu hình track; S-9 nói con chỉ thấy mốc thầy/cô đã xác nhận. | Theo S-9: chưa xác nhận đỉnh → đỉnh **không tên** "Đỉnh của bạn — thầy/cô sẽ đặt tên". App đề xuất "Lên B1" / "Lên C1" thành **nháp** cho thầy/cô (Q11 của mục 3.4). | W4a |
| **Q11** | **Tên mốc đề xuất từ track:** `language_goal` của B là chữ tiếng Anh "secure C1". | Thêm cấu hình `track_settings.roadmap_goal_label` = A "Lên B1", B "Lên C1" (dữ liệu, không `if track`). Thứ tự đề xuất: mục tiêu đầu tiên trong Hồ sơ đầu vào → nháp **đỉnh**; các mục tiêu sau + mục tiêu của track → nháp **"sau đỉnh"**; không có mục tiêu đầu vào → mục tiêu của track là nháp đỉnh. Progress Test ("Không phải Unit" loại test / Progress Test) → nháp **cờ trên núi** đặt sau Unit cuối cùng mà nó ôn. | W4a |
| **Q12** | **Nộp bài giấy:** (a) câu 2 "có xem gợi ý / đáp án không?" cho bài **PDF** (SQL hiện từ chối); (b) tối đa 6 ảnh → bài kiểm tra dài 6–8 trang không đủ; (c) xoay + nén ảnh **trên máy** (JPEG, cạnh dài ≤ 2400 px) trước khi gửi. | Đồng ý cả 3: hàm `eng_submit_practice_v2` (giữ v1), nới CHECK lên **12** file; thứ tự ảnh = thứ tự trang. | W4c1 |
| **Q13** | **Bài chủ đề bước Nói** (đọc nguồn → nói bằng STT trên máy → viết): chưa có STT, spike `Sp` chưa chạy (DESIGN §10 cổng Sp). | W4 **không làm bước Nói**: bước nói giữ nhãn "làm cùng thầy/cô" như hiện nay; màn "Bài chủ đề · 3 bước" làm ở PR sau spike (`W4f`, ngoài kế hoạch này). Bước đọc + viết dùng màn làm bài mới của W4c2. | W4c2 |
| **Q14** | **Study Launcher hiện số việc + mở thẳng** (brief) ngược PRD §6.2 ("không gọi dữ liệu của nhau trong v1"). | Đổi PRD §6.2 (D37): English OS có **một hàm chỉ trả một con số** `eng_my_today_count()` (con đăng nhập, cùng Supabase) + link mở thẳng `/` (Hôm nay). Launcher gọi bằng phiên của con; **không** dữ liệu nào khác, không ghi gì vào `public`. Phần hiển thị bên Launcher làm ở repo Launcher (không thuộc W4). Hai app khác tên miền ⇒ con vẫn đăng nhập riêng mỗi app (ghi rõ). | W4b |
| **Q15** | **Góp ý cho bài nộp giấy / link** (S-2 "lời cô hiện ngay"; mục 1.4: hiện chưa có kênh). | Thêm bảng chỉ thêm `submission_feedback` (câu khen + tối đa 3 điều cần sửa, như S6, có kiểm chữ dạng điểm), thầy/cô **hoặc** phụ huynh gửi trên trang bài đã giao; con thấy ngay ở "Cô đã xem". Không yêu cầu nộp lại (muốn con sửa thì giao bài mới). | W4c1 |
| **Q16** | **"Ngày ấy – bây giờ":** bản thử lấy "bài đầu vào 15/09" (bài giấy pilot). Hệ thống chỉ có chữ của bài viết **trên app**; bài giấy là ảnh. | v1: thầy/cô chọn **hai bài viết trên app** (chữ). Ảnh bài giấy làm sau. Bài đầu vào giấy muốn dùng thì nhập lại thành bài viết (thầy/cô gõ, `manual_import`). | W4e |
| **Q17** | **Chữ của "Những điều mình đã làm được":** mục kiến thức chỉ có tên nhãn ("Hiện tại hoàn thành với since / for"); bản thử dùng câu "can-do" viết riêng. Mục bị hạ (⚑ → hạ mức) thì sao? | v1 dùng tên có sẵn (Track A: tên cho học sinh ở UX §3.4; còn lại `title_vi` / `label_vi`). Mục không còn ở mức 3–4 thì **ẩn lặng lẽ** (không báo "mất"). Câu can-do riêng do thầy/cô viết: làm sau. | W4e |
| **Q18** | **Mảng Tư duy** dùng thang 1–4 (giống điểm). Con có thấy "Tư duy · 3"? | **Không** hiện mảng Tư duy cho con; chỉ 6 mảng CEFR, chỉ mảng **đã được thầy/cô xác nhận** (cấp giả định không hiện). | W4e |
| **Q19** | **Vai trò:** Lộ trình — chỉ thầy/cô của em sửa (S-9), phụ huynh xem. Mục tiêu tuần — ai đồng ý? "Ngày ấy – bây giờ" — ai chọn? | Cả ba: **chỉ thầy/cô của em** ghi (SQL kiểm lại), phụ huynh xem. Phụ huynh được báo có mốc mới đã xác nhận (một dòng ở Bàn làm việc), không cần duyệt. | W4a, W4d, W4e |
| **Q20** | **Danh sách thành tích v1** (mục 3.7) và ngưỡng. | Duyệt bảng mục 3.7. Không xu, không điểm thưởng, không so sánh. | W4d |
| **Q21** | **Dấu "Mới"** ở "Cô đã xem": nhớ trên máy (iPad và laptop có thể khác nhau) hay ghi lên máy chủ (thêm dữ liệu "con đã mở lúc nào" = nhật ký hành vi)? | **Nhớ trên máy** (`localStorage`), không ghi máy chủ. | W4b |
| **Q22** | **Chữ "cô" trong bản bấm thử** ("Cô đã xem", "Cô nhắn", "Chờ cô xem"…) ngược luật `tutorHonorific` (UX W1–W3: không viết cứng "cô"); gia sư của An trong bản thử là **thầy**. | Tên tab **"Đã xem"**; các câu khác dùng `tutorHonorific` / `tutorHonorificCap` ("Thầy/cô nhắn", "Chờ thầy/cô xem"). Nếu phụ huynh muốn gọi đúng từng người ("Cô", "Thầy"): thêm cấu hình xưng hô theo **quan hệ gia sư** (dữ liệu, không theo track) — việc nhỏ riêng, không thuộc W4. | W4b |

---

## 3. Luật dẫn xuất (chính xác; mỗi luật một hàm thuần, có ví dụ làm test)

Ngày / tuần = **lịch Việt Nam** (`Asia/Ho_Chi_Minh`, UTC+7, không giờ mùa hè). **Tuần bắt đầu thứ Hai 00:00, kết thúc Chủ nhật 24:00.** `weekStart(t)` = thứ Hai của tuần chứa `t` (SQL: `date_trunc('week', t at time zone 'Asia/Ho_Chi_Minh')::date`; TS: `lib/student/week.ts`). Giờ của **máy chủ** quyết định (giờ máy của con bỏ qua, DOMAIN §5.5).

### 3.1 "Việc cần làm" (Hôm nay) — `lib/student/today.ts`
- Một **việc** = (a) một bước bài trên app đã mở (`eng_activity_released`), chưa có lần nộp nào: bài **Studio** (`type = app`) hoặc bước **bài chủ đề** (`type = topic`); bước không làm được trên app (nói, canvas…) vẫn là việc, nhãn "làm cùng thầy/cô" / "làm trên giấy", không mở bài; (b) một **bài giao link / PDF** chưa rút, chưa có bài nộp hiện hành, chưa được ghi kết quả (`type = link | paper`); (c) một **bài sửa** S6 trạng thái `todo` đã mở (`type = revision`).
- **Thẻ "Làm tiếp"** = việc làm được trên app **có nháp** (`working_drafts`), nháp sửa gần nhất; không có → "Việc tiếp theo" = việc đầu tiên của danh sách.
- **Thứ tự:** bài sửa → có nháp (mới nhất trước) → hạn sớm nhất (không hạn xếp cuối) → ngày mở sớm nhất → tên. Bước chưa mở (ngày sau hôm nay) **không** trả về (như hiện nay).
- **"Hôm nay còn n việc · khoảng m phút":** n = số việc; m = tổng `time_min` đã biết (bài giao link / PDF không có số phút → không cộng); không biết phút nào → bỏ "· khoảng m phút".
- **Tiến độ trên thẻ** (bài trên app): "a/b câu" = số câu **đã trả lời trong nháp** / số câu của bước (không bao giờ số câu đúng). Hạn hiện "Hạn Thứ Sáu 20/11"; **không** có nhãn "Quá hạn" cho con (D4 giữ).

| Ví dụ | Kết quả |
|---|---|
| Studio "Unit 5 luyện tập" có nháp 12/30 câu; bài link hạn 16/11; bài sửa đang `todo` | Thứ tự: Sửa bài → Unit 5 (thẻ **Làm tiếp**, "12/30 câu") → bài link |
| Bài PDF đã nộp ảnh, thầy/cô chưa ghi kết quả | Không còn trong Hôm nay; ở "Đã làm · Chờ cô xem" |
| Bước nói của bài chủ đề (chưa có STT) | Trong danh sách, nhãn "làm cùng thầy/cô", không bấm vào được |

### 3.2 "Đã làm" và "Cô đã xem" — `lib/student/history.ts`
- **Đã làm** = mọi bài con đã nộp: lần nộp trên app (`attempts`, `provenance` `in_app`/`pasted`, không `imported`), bài nộp link / PDF hiện hành (bản bị thay không hiện riêng), bài sửa. Bài người lớn ghi ngoài app trên bước của con hiện nhãn "Thầy/cô ghi lại bài này" (như `AttemptProvenance = offline` hiện nay).
- **"Cô đã xem"** một bài = có **một hành động của người lớn** trên chính bài đó: góp ý S6 còn hiệu lực (`feedback_notes`), ghi chú "Chỉ góp ý", quyết định duyệt S5 trên episode của nó, Đúng/Sai của người lớn cho câu "cần xem" (Studio), kết quả đã ghi cho bài giao (`results.assignment_id`), góp ý bài nộp (W4c1). Tự chấm của app **không** phải "cô đã xem". `seen_at` = giờ của hành động sớm nhất trong số đó.
- **Mục "Cô đã xem"** liệt kê bài đã xem, mới nhất trước (phân trang 20), mỗi bài: câu khen, điều cần sửa (≤ 3, kèm trích đoạn), "Ôn lại mấy mục này" (nhãn ôn của ghi chú buổi gần nhất — chỉ ở thẻ đầu trang), trạng thái bài sửa (cần sửa / đã gửi bản sửa · chờ cô xem / cô đã xem bản sửa). **Không giới hạn 14 ngày** như ô ở trang chủ cũ (cũ vẫn giữ cho hàm cũ).
- **Dấu "Mới"** (Q21): `seen_at` sau lần con mở tab "Cô đã xem" gần nhất **trên máy này** (`localStorage`, khóa theo learner id); tab hiện số mới (chữ + `aria-label`, không chỉ màu).

| Ví dụ | Kết quả |
|---|---|
| Bài Studio tự chấm hết, không câu "cần xem", thầy/cô chưa làm gì | Đã làm · **Chờ cô xem** |
| Bài link: thầy/cô ghi điểm nhanh, không góp ý | Đã làm · **Cô đã xem**; "Cô đã xem" hiện thẻ không lời nhắn ("Cô đã xem bài này") |
| Bài viết: thầy/cô gửi góp ý S6 yêu cầu sửa | Cô đã xem · "Cần sửa" + nút **Sửa bài**; Hôm nay có việc "Sửa bài" |

### 3.3 Núi (Hành trình) — `lib/journey/path.ts`
Đầu vào (từ `eng_my_roadmap`): Unit của **phiên bản đang dùng** của **giáo trình chính** (mã, thứ tự, tên, trạng thái, ngày xong) + mốc **con được thấy** (mục 3.4).
- **Trạng thái Unit** = sự kiện mới nhất (như `curriculumProgress`); Unit đánh dấu bỏ qua ở phiên bản **hoặc** sự kiện mới nhất "bỏ qua" ⇒ `skipped`.
- **Được tính** = Unit không `skipped`. `N` = số Unit được tính; `done` = số Unit được tính ở `done`. Dòng tóm tắt: "Đã xong {done}/{N} Unit · còn {k} Unit tới {mốc kế tiếp}" (hoặc "· còn {k} Unit tới đỉnh" / "· bạn đã đi hết các Unit").
- **Người leo núi** đứng ở Unit `in_progress` có **thứ tự lớn nhất** ("Bạn đang ở đây"); không có → Unit `done` thứ tự lớn nhất ("Bạn vừa xong"); không có → chân núi ("Bạn đang ở chân núi · Cùng bắt đầu nhé"). Hai Unit đang học → người leo ở Unit thứ tự lớn hơn, cả hai có nhãn "Đang học". Học không theo thứ tự (U5 xong khi U3 chưa học) → mỗi chấm hiện **trạng thái của chính nó** (không suy từ vị trí); đường đã đi tô đậm chỉ giữa hai chấm cùng `done` liền kề.
- **Unit bỏ qua:** chấm xám, nhãn "Thầy/cô cho bỏ qua", đường đi qua, không đếm.
- **Còn bao nhiêu tới mốc M** (M gắn sau Unit `u`): `k(M)` = số Unit được tính có thứ tự ≤ thứ tự của `u` và chưa `done`. `k = 0` ⇒ "Đã tới mốc". **Mốc kế tiếp** = mốc cờ có `k > 0` gắn với Unit thứ tự nhỏ nhất.
- **Mốc cờ** đặt ngay sau Unit của nó; mốc có Unit **không còn** trong phiên bản đang dùng, hoặc mốc chỉ có tháng (không Unit), **không** vẽ trên núi mà hiện ở danh sách "Mốc khác" (tên + "Tháng 03/2027" / "Khoảng 10/2027").
- **Đỉnh** = mốc vai trò `summit` con được thấy; không có → đỉnh không tên (Q10). **Sau đỉnh** = các mốc vai trò `beyond` con được thấy, theo tháng.
- **Không có giáo trình chính** (chưa giáo trình nào đã duyệt) → núi trống, chỉ có đỉnh + "Thầy/cô sẽ vẽ đường lên đỉnh khi có giáo trình của bạn."
- **Nhiều giáo trình:** núi theo giáo trình chính; thẻ "Giáo trình khác": tên + "{done}/{N} Unit đã xong" (luật đếm như trên).
- **Có dạng danh sách** cho trình đọc màn hình và iPad nhỏ ("Xem dạng danh sách", đọc từ dưới lên); mọi chấm có chữ, không chỉ màu; vùng chạm ≥ 44 px.

| Ví dụ | Kết quả |
|---|---|
| Destination 26 Unit, U1–U4 + U7 xong, U5 đang học, U3 bỏ qua; mốc "Progress Test 1" sau U12 | N = 25, done = 4 (U3 không đếm); người leo ở **U5**; "còn 7 Unit tới Progress Test 1" (U5, U6, U8–U12) |
| U5 và U9 đều đang học | Người leo ở **U9**; U5 vẫn nhãn "Đang học" |
| Giáo trình lên v2 bỏ U20 (mốc "Thi thử" gắn U20) | Mốc không còn trên núi; hiện ở "Mốc khác" (thầy/cô nên gắn lại — Lộ trình báo "Mốc gắn Unit không còn") |
| An chưa có giáo trình đã duyệt; chưa có đỉnh xác nhận | Núi trống, đỉnh "Đỉnh của bạn — thầy/cô sẽ đặt tên" |

### 3.4 Mốc lộ trình — phiên bản, "bản mới nhất thắng" — `lib/roadmap/*`
- Một **mốc** có id ổn định (`milestone_id`); mỗi lần ghi = **một phiên bản mới** (dòng mới, `version` + 1, `supersedes_id` = dòng trước); không sửa, không xóa dòng (chỉ thêm).
- **Bản hiện hành** của mốc = phiên bản lớn nhất. Trạng thái: `draft` (nháp) · `confirmed` (đã xác nhận) · `removed` (đã bỏ, **bắt buộc lý do 5–300 ký tự**).
- **Con thấy gì** (S-9): lấy bản hiện hành `v`. `v = confirmed` → con thấy `v`. `v = removed` → con không thấy. `v = draft` → con thấy **bản `confirmed` gần nhất trước `v`** nếu có (thầy/cô đang sửa một mốc đã xác nhận thì con vẫn thấy bản cũ), không có → không thấy.
- **Chỉ thầy/cô của em** ghi (SQL kiểm `role = 'tutor'` + `eng_actor_may_manage`, như `eng_write_teaching_note`); phụ huynh đọc. Nút chính "Lưu và xác nhận"; phụ "Lưu nháp".
- **Một đỉnh:** tại một lúc, tối đa **một** mốc có bản "con thấy" là `summit`; xác nhận một đỉnh thứ hai → lỗi `(summit_exists)` ("Đã có đỉnh: …. Đổi đỉnh cũ thành mốc thường trước.").
- **Đề xuất của app** (không lưu cho tới khi thầy/cô bấm): tính mỗi lần mở trang từ (i) dòng "Không phải Unit" của giáo trình chính là Progress Test / bài kiểm tra (`isProgressTest` hoặc `reason = 'test'`) → cờ sau Unit thứ tự lớn nhất trong `relatedUnits`; (ii) `learner_intake.content.goals` bản hiện hành; (iii) `track_settings.roadmap_goal_label` (Q11). Khóa đề xuất ổn định: `pt:<curriculum_id>:<tên chuẩn hóa>`, `goal:<tên chuẩn hóa>`, `track:<track_id>`. Đề xuất **ẩn** khi đã có mốc (bất kỳ trạng thái) mang khóa đó — nên "Bỏ đề xuất" = ghi mốc v1 `removed` có lý do, và không hiện lại. Tháng của mục tiêu đầu vào: đọc `due` dạng `MM/YYYY` hoặc `~MM/YYYY` (khoảng); dạng khác → không tháng.
- **Số "mốc nháp chờ xác nhận"** (cột trái + Bàn làm việc + Chờ duyệt) = đề xuất chưa xử lý + mốc có bản hiện hành `draft`.

| Ví dụ | Kết quả |
|---|---|
| v1 confirmed "Thi thử vào 10 · 03/2027" sau U18; v2 draft đổi sang U20 | Con thấy **v1** (U18); thầy/cô thấy "Nháp · con đang thấy bản đã xác nhận 14/11" |
| v3 removed "lịch thi đổi" | Con không thấy mốc; lịch sử giữ v1–v3 |
| Thầy/cô bấm "Bỏ đề xuất" Progress Test 2 (lý do "không làm đề này") | Ghi mốc v1 `removed`; đề xuất không hiện lại |

### 3.5 Mục tiêu tuần — `lib/student/goal.ts`
- Sổ chỉ thêm `weekly_goals`: con **đề xuất** (số bài/tuần trong khoảng gợi ý của track; không có mục tiêu phút — Q5-i), thầy/cô **đồng ý** (giữ nguyên) hoặc **điều chỉnh** (số khác), con **rút lại** khi còn chờ. Mỗi lúc tối đa một đề xuất đang chờ (`(pending_exists)`).
- Quyết định (đồng ý / điều chỉnh) lúc `t` áp dụng từ `weekStart(t) + 7 ngày` (thứ Hai tuần sau, S-6). **Mục tiêu của tuần W** = quyết định mới nhất có `applies_from ≤ W`. Chưa có → tuần "chưa có mục tiêu".
- **Gợi ý** (chữ dưới các nút): "Mấy tuần gần đây bạn làm a–b bài mỗi tuần" — a, b = nhỏ nhất / lớn nhất của 4 tuần trọn gần nhất (mục 3.6); chưa có tuần trọn → không câu gợi ý.

### 3.6 "Bài tính vào mục tiêu" (việc làm thật) và chuỗi tuần mềm — `lib/student/streak.ts`
- **Một bài tính** trong tuần W = **một việc** (bước bài trên app / bài giao / bước sửa) mà trong W có: **≥ 1 lần nộp** của con (`attempts.submitted_at`, hoặc `submissions.created_at` — gồm "nộp thay" ảnh bài giấy theo Q6). **Q5 = (i): không đếm phút làm bài.** Mỗi việc tính **tối đa 1 lần mỗi tuần**; cùng việc ở tuần sau đủ điều kiện thì tính lại cho tuần sau.
- **Không tính:** mở app, mở link, xem góp ý, tự lưu (chưa nộp), "Thử lại câu này", gửi lại cùng bài trong cùng tuần (vẫn 1), bài ghi trong buổi, bài nạp.
- **Đạt tuần W** = có mục tiêu ∧ số bài tính ≥ mục tiêu bài.
- **Chuỗi** (hiện lúc này, tuần đang chạy C): `k` = số tuần **đạt liên tiếp** kết thúc ở C − 1; nếu C đã đạt thì chuỗi = `k + 1`, chưa đạt thì chuỗi = `k` (**tuần đang chạy chưa bao giờ làm đứt chuỗi**). Một tuần đã kết thúc mà không đạt (kể cả tuần chưa có mục tiêu) → chuỗi về 0, tuần sau đếm lại. Xét tối đa 52 tuần.

| Ví dụ (mục tiêu 4 bài) | Kết quả |
|---|---|
| Tuần 9–15/11: nộp Studio (T2), nộp ảnh bài PDF (T4), nộp lại ảnh bài PDF đó (T4), viết đoạn 20 phút chưa nộp (T6), nộp link (CN 23:50), nộp Studio thứ hai (CN 21:00) | 4 bài (PDF tính 1; đoạn viết chưa nộp không tính) → **đạt** |
| Tuần 16–22/11: 3 bài; tuần 23–29/11 đang chạy: 1 bài | Chuỗi trước 16/11 là 5 → 16–22 không đạt → hôm nay chuỗi **0** (tuần đang chạy chưa đạt, chưa tính đứt thêm) |
| Thầy/cô đồng ý "5 bài" lúc Chủ nhật 15/11 21:00 | Áp từ **thứ Hai 16/11**; tuần 9–15/11 vẫn xét theo mục tiêu cũ |
| Con mở link test-english 3 lần, chưa nộp ảnh | 0 bài |

### 3.7 Thành tích v1 — `lib/student/achievements.ts` (dẫn xuất, không bảng)
Một thành tích "đạt" khi điều kiện **đang đúng** (trừ thành tích chuỗi: đã từng đúng); **ngày đạt** = đầu đợt gần nhất mà điều kiện đúng liên tục tới nay (dựng lại từ sổ sự kiện: giờ nộp, sự kiện Unit, sổ quyết định, tuần đạt). Chưa đạt → hiện "Cần …" (việc của chính con, không so với ai). Hiện tối đa: mọi cái đã đạt + 3 cái gần đạt nhất.

| Khóa | Tên (chữ từ bản thử, duyệt ở UX) | Điều kiện | PR |
|---|---|---|---|
| `first_work` | Bài đầu tiên | ≥ 1 bài con tự nộp | W4d |
| `units_n` | Xong n Unit đầu (n = 2, 4, 8, 12, 16, 20, 24…, và "Xong cả giáo trình") | số Unit được tính đã `done` của giáo trình chính ≥ n | W4d |
| `streak_n` | n tuần liền đạt mục tiêu (n = 4, 8, 12) | chuỗi đã từng ≥ n | W4d |
| `weeks_n` | n tuần đạt mục tiêu (n = 10, 20) | tổng số tuần đạt ≥ n | W4d |
| `writing_n` | n bài viết (n = 10, 25) | số lần nộp đầu bước `ACT-WRITE` của con | W4d |
| `topic_first` | Bài chủ đề đầu tiên | mọi bước làm được trên app của một bài chủ đề đã nộp | W4d |
| `revision_first` | Lần sửa bài đầu tiên | ≥ 1 bài sửa S6 đã nộp | W4d |
| `milestone:<id>` | (tên mốc), vd "Progress Test 1" | mốc cờ con thấy có `k = 0` (mục 3.3); ngày = ngày xong Unit cuối cần | W4d |
| `cando_n` | n điều tự làm được (n = 5, 10, 20) | số mục ở mục 3.8 ≥ n | W4e |

### 3.8 Cấp theo mảng, "Những điều mình đã làm được", "Ngày ấy – bây giờ" (W4e)
- **Cấp:** mỗi mảng CEFR (không Tư duy, Q18) có `level_decisions` → cấp của dòng mới nhất + "thầy/cô xác nhận {ngày}". Mảng chưa xác nhận: "Thầy/cô chưa xác nhận" (không hiện cấp giả định). "Hướng tới": tên đỉnh đã xác nhận (nếu có).
- **Điều đã làm được** = kỹ năng có `competency_state` ở `INDEPENDENT`/`TRANSFERABLE` mà dòng bậc mới nhất là `CONFIRMED`, **và** mục kiến thức có `point_state` mức 3–4 mà dòng mức mới nhất là `CONFIRMED`; chữ theo Q17; ngày = ngày xác nhận; mới nhất trước; "Mới" = xác nhận trong 7 ngày.
- **Ngày ấy – bây giờ** = dòng `then_now_picks` mới nhất của em, trạng thái `shown`: hai lần nộp **bài viết trên app** của chính con (chữ gốc lần nộp đó), bài "ngày ấy" nộp trước bài "bây giờ", kèm lời nhắn ≤ 200 ký tự (kiểm chữ dạng điểm `eng_has_score_words`). `hidden` hoặc chưa có → ẩn thẻ.

### 3.9 Hàm của con trả gì / **không bao giờ** trả gì
| Hàm (W4) | Trả | Không bao giờ trả |
|---|---|---|
| `eng_my_roadmap()` | giáo trình chính (tên), Unit (mã, thứ tự, tên, trạng thái, ngày xong), giáo trình khác (tên, done, N), mốc con thấy (id, loại, tên, vai trò, Unit, tháng, "khoảng") | mốc nháp / đã bỏ, lý do, phiên bản, ai ghi, khóa đề xuất, trang sách, mục kiến thức / nhãn của Unit, độ phủ %, ghi chú cấp sách |
| `eng_my_today()` · `eng_my_today_count()` | việc (loại, tên, hạn, ngày mở, phút, có nháp, số câu đã trả lời / số câu, nhãn Luyện tập / Kiểm tra) · một con số | đáp án, nhãn kỹ năng, mục kiến thức của bài / Unit, "quá hạn", điểm |
| `eng_my_history()` · `eng_my_seen()` | bài đã nộp (tên, loại, giờ nộp, lần đầu / làm lại, có xem gợi ý, trạng thái chờ / đã xem), góp ý (câu khen, ≤ 3 điều cần sửa, trích đoạn), nhãn ôn | điểm, đúng x/y, %, kết quả `results`, quan sát, quyết định, ghi chú cho phụ huynh, ai duyệt |
| `eng_my_result_view(activity)` | câu nên nhìn lại (số câu, đề, câu con viết / bỏ trống, lần thử lại đã gửi, còn thử được không), câu viết tự do "thầy/cô sẽ đọc", cờ bài kiểm tra | đáp án, giải thích, danh sách câu đúng, số câu đúng / sai, nhãn, kỹ năng |
| `eng_my_week()` | mục tiêu hiện hành / đang chờ / tuần sau, dữ kiện từng tuần (26 tuần: số việc có nộp, phút mỗi việc), khoảng gợi ý | dữ liệu của em kia, giờ chi tiết từng phút |
| `eng_my_levels()` · `eng_my_cando()` · `eng_my_then_now()` | cấp đã xác nhận + ngày; tên điều đã làm được + ngày; hai đoạn viết + lời nhắn | cấp giả định, bậc / mức dạng số, ⚑, đề xuất, bằng chứng, điểm |

Mọi hàm: `language sql|plpgsql stable security definer set search_path = ''`, nhận diện `members.user_id = auth.uid() and role = 'student'`, `revoke … from public, anon, service_role; grant execute … to authenticated`. Test DB quét JSON trả về: không có khóa `score|correct|expected|answer|explanation|tag_key|level_num|pct|result` (trừ khóa được phép liệt kê trong test).

---

## 4. Global Constraints (mọi PR)

- Migration: `db/migrations/NNNN_<tên>.sql` (NNNN = số trống kế tiếp lúc gộp), idempotent (`if not exists`, `create or replace`, `do $$ … $$`), chỉ thêm, kết thúc `insert into english.schema_migrations(version) values ('NNNN') on conflict do nothing;`. **Không sửa 0001–0030** (và 0031 khi đã áp). Không `public`. Không `supabase db push`.
- Bảng chỉ thêm: trigger `english.eng_forbid_mutation('learner_id')` + chặn TRUNCATE (mẫu 0030) + `revoke insert, update, delete, truncate … from authenticated, anon, service_role`; RLS bật; policy select `eng_is_staff_of(learner_id)` cho người lớn; học sinh **không** SELECT bảng nào (chỉ qua `eng_my_*`). Không `grant … on all tables`.
- Hàm ghi của người lớn: `security definer set search_path = ''`, `revoke` khỏi `public, anon, authenticated`, `grant` cho `service_role`; route máy chủ gọi **sau** `requireAccess`; hàm **tự kiểm lại người thao tác trước mọi kiểm khác**; idempotent theo `client_id` (khác nội dung → `23505 (client_id_reused)`); lỗi có thẻ `(tag)` cuối câu; `audit_log` không chứa chữ của người dùng.
- Hàm ghi của con (`eng_my_*` ghi: đề xuất mục tiêu, thử lại câu, nhịp phút): chỉ `authenticated`, nhận diện bằng `auth.uid()`, kiểm việc thuộc chính con.
- Purge: mỗi migration có bảng `learner_id` = **chép nguyên thân `eng_purge_learner` / `eng_purge_preview` của migration đã áp gần nhất** + bảng mới (đúng thứ tự FK), khóa biên nhận = khóa bản xem trước (test canh), nhãn ở `purgePage.countLabels`.
- Chữ giao diện chỉ trong `lib/copy/vi.ts` (khối mới ghi ở UX_COPY_GUIDE mục "W4"); người dạy = `tutorHonorific` / `tutorHonorificCap` (chữ cho con trong bản thử viết "cô" — đổi thành `tutorHonorific`, test quét). Xưng "bạn" với con, câu ≤ 15 từ. Không `if (track === 'A')` (khác biệt ở `track_settings`).
- Màn của con không import `components/shell/*` (`tests/unit/shellPages.test.ts`); vùng chạm ≥ 44 px (nút chính ≥ 48 px); không chỉ dựa vào màu; chạy trên iPad Safari + laptop Chrome.
- Dữ liệu người lớn đọc bằng admin client **chỉ sau** cổng quyền của em.
- `npm run typecheck && npm run lint && npm test` (unit + dom + db) xanh trước mỗi commit lớn và trước PR; `npx playwright test --list` có test mới; e2e xanh trong CI.
- Commit trailer (mọi commit):
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015ozhb22xjdX1tG2koXkZk1
  ```

---

## 5. Đối chiếu: đã có gì / W4 cần gì

| Phần W4 | Đã có (dùng lại) | Thiếu → làm ở |
|---|---|---|
| Hôm nay / Làm tiếp | `eng_my_home`, `eng_my_practice`, `eng_my_feedback`, `pickNextTask`, `working_drafts` | Hàm `eng_my_today` (loại việc, nháp, số câu đã trả lời) → **W4b** |
| Cô đã xem | `eng_my_feedback` (14 ngày), `eng_my_activity_note`, `eng_my_review_points` | Hàm `eng_my_seen` (mọi hành động của người lớn, phân trang) → **W4b**; góp ý bài nộp → **W4c1** |
| Đã làm | `attempts`, `submissions` (không có hàm của con trả giờ nộp + trạng thái) | `eng_my_history` → **W4b** |
| Hành trình · núi | `curriculum_units`, `curriculum_unit_events`, `curriculumProgress` (người lớn) | Bảng mốc + giáo trình chính + `eng_my_roadmap` + màn Lộ trình → **W4a** |
| Cấp theo mảng | `level_decisions`, `eng_level_profile` (người lớn) | `eng_my_levels` + đổi luật P2-d → **W4e** |
| Điều đã làm được | `competency_state`, `mastery_decisions`, `point_state`, `point_decisions` | `eng_my_cando` → **W4e** |
| Ngày ấy – bây giờ | `artifact_versions` (chữ bài viết) | Bảng `then_now_picks` + thẻ chọn của thầy/cô + `eng_my_then_now` → **W4e** |
| Mục tiêu tuần, chuỗi, thành tích | — | `weekly_goals`, `eng_my_week`, luật TS → **W4d** |
| Làm bài trên app | `WorkForm`, `eng_save_draft`, `eng_submit_attempt`, `eng_my_activity` | Màn từng câu + ô "Hỏi gia sư · Sắp có" → **W4c2** |
| Sau khi nộp (S-10) | `attempt_auto_checks`, `item_decisions`, `eng_my_studio_review` (có đáp án — bỏ) | `eng_my_result_view`, `item_retries`, cờ bài kiểm tra → **W4c2** |
| Nộp bài giấy | `SubmitPanel`, `ImagePicker`, `eng_submit_practice`, vé tải lên | camera, xếp / xoay / xóa, ≤ 12 trang, câu "gợi ý?" cho PDF → **W4c1** |
| Nộp bài link | như trên | luồng 3 bước "Mở bài → Xong rồi? → Ảnh kết quả" → **W4c1** |
| Bài chủ đề 3 bước | `/activities/[id]` từng bước, `SourceReader` | bước Nói (STT) → **ngoài W4** (Q13) |
| Launcher | — | `eng_my_today_count` → **W4b** (Q14) |

---

## PR W4a · Lộ trình mốc + Hành trình (núi) — `feature/w4a-roadmap`

**Mục tiêu:** thầy/cô đặt / xác nhận / bỏ mốc trên trang **Lộ trình** (app đề xuất nháp), chọn giáo trình chính; con mở **Hành trình** (tạm qua nút thứ ba ở đầu trang của con, W4b đưa vào khung tab) thấy núi + danh sách. Chờ Q1, Q2(d), Q9, Q10, Q11, Q19.

**SQL `0031_roadmap_milestones.sql`** (cần 0026 + 0030 đã áp):
1. `english.roadmap_milestones` (chỉ thêm): `id uuid pk`, `milestone_id uuid not null` (= `id` của v1), `learner_id uuid not null → learners`, `version int not null check (1..999)`, `supersedes_id uuid → roadmap_milestones(id)` (unique khi khác NULL; `check ((version = 1) = (supersedes_id is null))`), `kind text check in ('progress_test','mock_exam','exam','goal','other')`, `role text check in ('flag','summit','beyond')`, `title text check (btrim 1..80)`, `curriculum_id uuid → curricula`, `after_unit text check (~ '^[A-Z0-9][A-Z0-9-]{0,19}$')`, `check (after_unit is null or curriculum_id is not null)`, `check (role = 'flag' or after_unit is null)`, `target_month date check (extract(day from target_month) = 1)`, `approx boolean not null default false check (not approx or target_month is not null)`, `status text check in ('draft','confirmed','removed')`, `reason text check (null or btrim 5..300)`, `check (status <> 'removed' or reason is not null)`, `proposal_key text check (null or ~ '^(pt|goal|track):[a-z0-9:_-]{1,140}$')`, `by_member uuid not null`, `by_role text check (= 'tutor')`, `client_id text check (8..100)`, `created_at timestamptz default clock_timestamp()`; `unique (milestone_id, version)`, `unique (learner_id, client_id)`, `unique (learner_id, proposal_key) where version = 1 and proposal_key is not null`; index `(learner_id, milestone_id, version desc)`.
2. `english.roadmap_main_curriculum` (chỉ thêm): `id`, `learner_id`, `curriculum_id → curricula`, `by_member`, `by_role = 'tutor'`, `client_id`, `created_at`; dòng mới nhất thắng.
3. `track_settings` thêm `('A','roadmap_goal_label','"Lên B1"')`, `('B','roadmap_goal_label','"Lên C1"')` (`on conflict do nothing`).
4. Bảo vệ: `eng_forbid_mutation('learner_id')` + chặn TRUNCATE + revoke (mục 4); RLS select `eng_is_staff_of(learner_id)`.
5. Hàm ghi (service_role, sau `requireAccess(…,"roadmap:write")`): `eng_roadmap_write(p_learner, p_milestone uuid, p_base_version int, p_fields jsonb, p_status text, p_reason text, p_proposal_key text, p_by uuid, p_client_id text) returns jsonb {milestone_id, version, replayed}` — thứ tự kiểm: người thao tác là thầy/cô của em (`42501 (tutor_only)`) → em tồn tại, khóa dòng em `for update` → mốc thuộc em (`P0002 (not_found)`) → `p_base_version` = bản hiện hành (`23505 (stale_version)`) → trường hợp lệ (`22023 (bad_fields)`: loại, vai trò, tên, tháng; Unit phải là mã của một phiên bản đã duyệt của giáo trình **của em** — `(bad_unit)`) → `removed` cần lý do (`23514 (reason_required)`) → một đỉnh (`23514 (summit_exists)`) → khóa đề xuất chưa dùng (`23505 (proposal_used)`) → phát lại `client_id`. `eng_roadmap_set_main(p_learner, p_curriculum, p_by, p_client_id)` (giáo trình của em, có bản đã duyệt — `(bad_curriculum)`). Audit `roadmap.milestone_written` `{milestone, version, status}`, `roadmap.main_set` (không chữ).
6. Hàm đọc người lớn (service_role, sau `"roadmap:read"`): `eng_roadmap(p_learner)` → mốc (bản hiện hành + bản con đang thấy + lịch sử tối đa 20 bản mỗi mốc: phiên bản, trạng thái, lý do, ngày, ai), giáo trình chính (đã chọn / mặc định theo Q9 — tính trong SQL cùng luật với TS, có test so), giáo trình đã duyệt (id, tên, `payload.ignored` của bản đang dùng, Unit + trạng thái), mục tiêu đầu vào hiện hành, `roadmap_goal_label` của track.
7. Hàm của con `eng_my_roadmap()` (mục 3.9).
8. Purge: chép thân của migration đã áp gần nhất + `roadmap_milestones`, `roadmap_main_curriculum` (**trước** `curricula`, vì FK).

**Files:** `db/migrations/0031_roadmap_milestones.sql`; `lib/roadmap/{types,schemas,proposals,visible,handlers,supabaseStore,route,load,shape,view}.ts` (`proposals.ts`, `visible.ts` thuần); `lib/journey/path.ts` (thuần, mục 3.3); `lib/auth/requireAccess.ts` (+ `roadmap:read` thầy/cô + phụ huynh, `roadmap:write` thầy/cô); `app/api/learners/[id]/roadmap/milestones/route.ts` (POST), `app/api/learners/[id]/roadmap/main/route.ts` (POST); `app/learners/[id]/roadmap/page.tsx`; `components/roadmap/{MilestoneList,MilestoneForm,ProposalList,MainCurriculumPicker,MilestoneHistory}.tsx` (dùng `useSaveStatus`, `blockImplicitSubmit`, `GuardedLink`); `lib/shell/nav.ts` (`roadmap` hết "soon", `lane` theo Q1); `lib/desk/{pending,load,alerts}.ts` (dòng loại `milestone` "n mốc nháp chờ xác nhận" + cảnh báo "Mốc gắn Unit không còn"; dòng phụ huynh "Lộ trình có mốc mới"); `app/journey/page.tsx` (con; 404 cho người lớn), `lib/student/load.ts` (đọc `eng_my_roadmap` qua user client), `components/student/journey/{Mountain,PathList,JourneySummary,OtherCurricula}.tsx`; `components/AppHeader.tsx` (`studentNav` thêm `"journey"`); `lib/purge/*` + `purgePage.countLabels`; `lib/copy/vi.ts`.

**Chữ mới (`roadmapCopy`, `journeyCopy`, `pendingCopy.kinds.milestone`, `deskCopy.roadmapLine`, `purgePage.countLabels.roadmap_milestones|roadmap_main_curriculum`):** người lớn — "Lộ trình · {alias}", "Giáo trình chính (núi của con theo giáo trình này)", "Đề xuất của app", "Xác nhận" · "Sửa rồi xác nhận" · "Bỏ đề xuất", "Lưu và xác nhận" · "Lưu nháp", "Bỏ mốc" + "Lý do bỏ", "Nháp · con đang thấy bản đã xác nhận {ngày}", "Con chưa thấy mốc nháp", loại mốc (Kiểm tra tiến độ · Thi thử · Kỳ thi · Mục tiêu · Khác), vai trò (Mốc trên đường · Đỉnh · Sau khi lên đỉnh), "Sau Unit …", "Tháng" + "Khoảng", "Phụ huynh xem; chỉ {thầy/cô} của em sửa mốc.", lỗi theo thẻ. Con (từ bản thử, đổi "cô" → `tutorHonorific`) — "Hành trình", "Bạn đã đi được bao xa, và còn bao xa tới đỉnh.", "Không có điểm số, không so với ai — chỉ có hành trình của bạn.", "Bạn đang ở đây" · "Bạn vừa xong" · "Bạn đang ở chân núi", "Đã xong" · "Đang học" · "Chưa học" · "{Thầy/cô} cho bỏ qua", "Còn {k} Unit tới mốc này" · "Đã tới mốc", "Còn {k} Unit nữa là tới đỉnh", "Đỉnh của bạn", "Sau khi lên đỉnh", "Xem dạng danh sách", "Giáo trình khác", "{Thầy/cô} sẽ vẽ đường lên đỉnh khi có giáo trình của bạn.", "Mốc khác".

**Tasks:**
- [ ] A0 Đọc lại brief + bản thử workdesk (màn Lộ trình bản mới nhất); ghi lệch vào PROGRESS.
- [ ] A1 Test trước (thuần): `tests/unit/journeyPath.test.ts` (mọi ví dụ mục 3.3 + hai Unit đang học + không giáo trình + mốc mất Unit), `tests/unit/roadmapVisible.test.ts` (mục 3.4: draft trên confirmed, removed, chưa từng confirmed), `tests/unit/roadmapProposals.test.ts` (Progress Test → sau Unit lớn nhất của `relatedUnits`; mục tiêu đầu vào `06/2027`, `~10/2027`, chữ lạ; khóa ổn định; ẩn khi đã dùng; không `if track`).
- [ ] A2 Viết `0031` → Opus review riêng file SQL → `tests/db/roadmap.test.ts`: chỉ thầy/cô của em ghi (phụ huynh 42501, thầy/cô em kia 42501, học sinh không gọi được), trình tự kiểm (quyền trước), `stale_version`, `summit_exists`, `bad_unit` (Unit của em kia), `reason_required`, `proposal_used`, phát lại `client_id`, chỉ thêm (UPDATE/DELETE/TRUNCATE bị chặn kể cả service_role), RLS (học sinh 0 dòng), `eng_my_roadmap` không có khóa cấm (mục 3.9) và không thấy nháp / đã bỏ / mốc em kia, giáo trình chính mặc định SQL = TS (bảng ví dụ), purge xóa đủ + biên nhận khớp xem trước, migration chạy 2 lần.
- [ ] A3 `lib/roadmap/*` + route POST (zod, `no-store`, chưa áp 0031 → 409 `roadmap_unavailable` có chữ).
- [ ] A4 Trang `/learners/[id]/roadmap` (thầy/cô sửa, phụ huynh chỉ xem); cột trái sáng mục Lộ trình + số nháp; Chờ duyệt / Bàn làm việc.
- [ ] A5 Trang con `/journey`: SVG núi (chấm ≥ 44 px, `<title>` + `aria-label` từng chấm), dạng danh sách, tóm tắt, giáo trình khác; DOM test `tests/dom/mountain.test.tsx` (chữ trạng thái có mặt, không màu đơn thuần, không số dạng điểm).
- [ ] A6 Docs: DOMAIN bản 0.5 (§4/§6 dòng Lộ trình theo mục 3.4; §2 con thấy Unit + mốc — Q2d), DESIGN §19.20, UX "W4a", PROGRESS mục W4a (SQL cần áp, cách thử, giả định), CLAUDE.md "Current status" (một dòng).
- [ ] A7 e2e `tests/e2e/roadmap.spec.ts` (thầy/cô xác nhận đề xuất → con thấy cờ; sửa nháp → con vẫn thấy bản cũ; bỏ → con không thấy; phụ huynh không có nút ghi); mở rộng `student-no-scores.spec.ts` cho `/journey`.
- [ ] A8 Opus `reviewer` diff cuối → PR.

**Thử trên preview (gia đình THỬ, sau khi áp 0031):** thầy/cô của Nguyên (thử) → Giáo trình đã duyệt có Unit đánh dấu → **Lộ trình**: thấy đề xuất "Progress Test 1" (sau Unit 12), đỉnh từ Hồ sơ đầu vào → Xác nhận; thêm "Thi thử vào 10 · Tháng 03/2027 · sau Unit 18" → Lưu và xác nhận. Đăng nhập Nguyên (thử) → Hành trình: núi, người leo đúng Unit đang học, "còn k Unit tới Progress Test 1". Thầy/cô sửa mốc thành nháp → con vẫn thấy bản cũ. Bỏ mốc (lý do) → con không thấy. Phụ huynh: xem được, không có nút. An (thử) chưa có giáo trình → núi trống, đỉnh không tên.

**Đạt khi:** ví dụ 3.3 / 3.4 là test xanh; con không thấy nháp / đã bỏ / lý do / mốc của em kia (DB + e2e); chỉ thầy/cô ghi; 0031 áp 2 lần; purge đủ. **Rủi ro:** dòng "Không phải Unit" không có id → khóa đề xuất theo tên chuẩn hóa (đổi tên dòng ở bản mới ⇒ đề xuất mới hiện lại: chấp nhận, ghi PROGRESS); vẽ núi trên iPad cũ (giữ SVG tĩnh, không animation nặng).

---

## PR W4b · Khung bàn học: Hôm nay · Cô đã xem · Đã làm · Hành trình — `feature/w4b-student-desk`

**Mục tiêu:** thay `StudentHome` + `/practice` bằng bàn học 4 mục (iPad dọc / điện thoại: thanh tab dưới; laptop / iPad ngang: cột trái); dữ liệu có sẵn, đọc qua hàm mới. Chờ Q2(e), Q14, Q21.

**SQL `NNNN_student_desk_reads.sql`** (chỉ hàm đọc, **không bảng**, không purge): `eng_my_today()`, `eng_my_today_count()`, `eng_my_history(p_before timestamptz default null, p_limit int default 20)`, `eng_my_seen(p_before timestamptz default null, p_limit int default 20)` theo mục 3.1, 3.2, 3.9 (dùng `eng_activity_released`, `eng_feedback_is_live`, `eng_revision_offline_answered`; giấu `imported` như `eng_my_home`; số câu đã trả lời = số khóa `answers` khác rỗng trong nháp ∩ `id` câu của bước). `p_limit` 1..50. Hàm cũ giữ nguyên (màn cũ vẫn chạy được tới khi gộp).

**Files:** `db/migrations/NNNN_student_desk_reads.sql`; `lib/student/{types,shape,today,history,seenMemo,load}.ts`; **một khung riêng của con** `components/student/desk/StudentDeskShell.tsx` (không import `components/shell/*`; tab: Hôm nay `/`, Đã xem `/seen`, Đã làm `/done`, Hành trình `/journey` của W4a; `aria-current`; số mới trên "Đã xem"); trang `app/seen/page.tsx`, `app/done/page.tsx`, `app/done/[ref]/page.tsx` (xem lại một bài: chỉ đọc, "Chỉ xem lại — bài đã nộp thì không sửa ở đây."), `app/journey/page.tsx` chuyển vào khung; `app/page.tsx` nhánh học sinh → `TodayView`; `app/practice/page.tsx` → `redirect("/")`; `components/student/desk/{TodayView,ContinueCard,TaskList,SeenList,SeenCard,HistoryList,HistoryItem}.tsx`; `app/api/student/today/route.ts` (GET, `no-store`, để trang tự làm mới; Launcher gọi thẳng hàm SQL `eng_my_today_count` bằng phiên của con nếu Q14 đồng ý); `lib/copy/vi.ts`; giữ `AppHeader` cho trang cũ chưa chuyển (`/activities/[id]`) tới W4c2.

**Chữ mới (`studentDeskCopy`, theo Q22):** tab "Hôm nay · Đã xem · Đã làm · Hành trình"; "Chào {alias}!"; "Hôm nay còn {n} việc · khoảng {m} phút"; "Làm tiếp" / "Việc tiếp theo"; "{a}/{b} câu"; "Việc cần làm"; "Xong hết việc hôm nay rồi 🎉 Nghỉ ngơi, hoặc làm trước một việc sắp tới nếu bạn muốn."; "Không có điểm số ở đây — {thầy/cô} xem bài và nhắn lại cho bạn."; loại việc (Bài trên app · Bài chủ đề · Đề giấy · Bài link · Sửa bài); "{Thầy/cô} xem bài xong là lời nhắn hiện ngay ở đây. Không có điểm — chỉ có điều bạn làm tốt và điều cần sửa."; "Khen" / "Cần sửa" / "Ôn lại mấy mục này"; "Mới"; "Đã làm": lọc "Tất cả ({n})" · "Chờ {thầy/cô} xem ({n})" · "{Thầy/cô} đã xem"; "Nộp {ngày} · làm lần đầu / làm lại · có / không xem gợi ý"; "Bài này không cần nộp lại — đọc lời {thầy/cô} là được.".

**Tasks:**
- [ ] B1 Test thuần `tests/unit/studentToday.test.ts` (ví dụ 3.1: thứ tự, Làm tiếp, phút, không "quá hạn"), `tests/unit/studentHistory.test.ts` (ví dụ 3.2: "đã xem" theo từng loại hành động; tự chấm không phải đã xem), `tests/unit/seenMemo.test.ts`.
- [ ] B2 `NNNN` → Opus review SQL → `tests/db/studentDesk.test.ts`: con chỉ thấy việc của mình (em kia 0), không khóa cấm (mục 3.9), bài nạp không hiện, bài rút không hiện, `eng_my_today_count` = độ dài `eng_my_today`, phân trang `p_before`, `anon` / `service_role` không gọi được.
- [ ] B3 Khung + 3 màn + chuyển hướng `/practice`; e2e cũ `practice.spec.ts`, `studentWork.spec.ts` sửa theo màn mới (chỉ đổi đường vào, không đổi luật nộp).
- [ ] B4 DOM test (`tests/dom/todayView.test.tsx`, `seenList.test.tsx`): nút ≥ 44 px (lớp `min-h-11`/`min-h-12`), chữ thay màu, không `\d+\s*/\s*4`, không `%`, không "đúng \d".
- [ ] B5 Luật số đếm (Q2e): `student-no-scores.spec.ts` thêm: số dạng `a/b` chỉ được nằm trong phần tử `[data-count="work"]` (bài / Unit / câu đã trả lời); `%`, "điểm", "đúng {số}", "sai {số}" không ở đâu trên trang của con.
- [ ] B6 Docs: PRD D35 (luật số đếm của con), D37 (Launcher, nếu Q14 đồng ý) + §6.2; DOMAIN §2; UX "W4b"; DESIGN §19.21; PROGRESS; CLAUDE.md status.
- [ ] B7 Opus review → PR.

**Thử trên preview:** đăng nhập Nguyên (thử): Hôm nay có bài Studio (đang dở → "Làm tiếp · 12/30 câu"), bài link, bài PDF; nộp ảnh bài PDF (luồng cũ) → biến khỏi Hôm nay, có ở Đã làm "Chờ cô xem"; thầy/cô ghi điểm nhanh → Đã làm "Cô đã xem", tab "Cô đã xem" có thẻ không điểm; thầy/cô gửi góp ý S6 cho bài viết → hiện **ngay** ở "Cô đã xem" (dấu Mới) và Hôm nay có "Sửa bài". Mở `/practice` → về Hôm nay. iPad dọc: thanh tab dưới; laptop: cột trái.

**Đạt khi:** không còn màn của con nào hiện điểm / % / số câu đúng (e2e); hai em không thấy dữ liệu của nhau; e2e cũ xanh sau khi đổi đường vào. **Rủi ro:** `eng_my_seen` gộp 6 nguồn — chậm: giới hạn 20 / trang + index sẵn có; test thời gian trên dữ liệu thử 200 bài.

---

## PR W4c1 · Nộp bài giấy + bài link + góp ý cho bài nộp — `feature/w4c1-paper-link`

**Mục tiêu:** Nộp bài giấy: "Tải đề (PDF)" → "Chụp các trang bài làm" (iPad: nút **Chụp ảnh** mở camera `capture="environment"`; laptop: **Chọn ảnh** / PDF) → lưới trang có **Lên · Xuống · Xoay · Xóa** + "Thêm trang" → **2 câu hỏi** ("Bạn làm lần đầu?" · "Bạn có xem gợi ý hoặc đáp án không?") → "Còn thiếu: …" / **Nộp**. Bài link: "Mở bài và làm" (tab mới) → "Làm xong chưa? Xong rồi / Chưa, làm tiếp sau" → "Chụp hoặc tải ảnh trang kết quả" → 2 câu hỏi → Nộp. Thầy/cô / phụ huynh gửi **góp ý** cho bài nộp (Q15). Chờ Q12, Q15.

**SQL `NNNN_paper_link_submit.sql`:**
1. `alter table english.submissions drop constraint if exists submissions_file_ids_check` + add `check (cardinality(file_ids) <= 12)` (tên ràng buộc lấy đúng từ catalog trong `do $$` — test kiểm hàng cũ vẫn hợp lệ).
2. `eng_submit_practice_v2(…)` = thân v1 (0016) với: `used_hint` **bắt buộc** cho cả link và PDF (con) / tùy chọn khi người lớn nộp thay; ≤ 12 file; thứ tự `file_ids` = thứ tự gửi (đã đúng ở v1 — test khẳng định). v1 giữ nguyên (route cũ chạy tới khi gộp).
3. `english.submission_feedback` (chỉ thêm): `id`, `learner_id`, `submission_id → submissions`, `assignment_id → assignments`, `praise text (≤ 400)`, `items jsonb` (`[{n 1..3, text ≤ 300}]`), `supersedes_id` (một lần), `author_member`, `author_role in ('tutor','parent')`, `client_id`, `created_at`; CHECK chữ không có dạng điểm (`eng_has_score_words` trên praise + items); bảo vệ + RLS như mục 4.
4. `eng_write_submission_feedback(p_submission, p_praise, p_items, p_supersedes, p_by, p_client_id)` (service_role sau `"practice:write"`; `eng_actor_may_manage`; bài nộp hiện hành của em; `(score_words)`, `(empty_feedback)`, `(already_superseded)`).
5. Đọc: `eng_assignment_overview` không đổi (người lớn đọc góp ý qua `eng_submission_feedback(p_learner, p_assignment)` mới); `eng_my_seen` (NNNN) **được thay bằng bản `create or replace`** có thêm nguồn góp ý bài nộp (thân NNNN + một nhánh — test so).
6. Purge: chép thân gần nhất + `submission_feedback` (trước `submissions`).

**Files:** `db/migrations/NNNN_paper_link_submit.sql`; `lib/practice/{schemas,handlers,supabaseStore,client}.ts` (v2, ≤ 12, `used_hint` PDF); `lib/practice/image.ts` (thuần + canvas ở client: xoay 90°, nén JPEG cạnh dài ≤ 2400 px, chất lượng 0.85; HEIC: nếu trình duyệt không vẽ được → báo "Ảnh này chưa mở được, bạn chụp lại hoặc chọn ảnh khác"); `components/student/submit/{PaperSubmit,LinkSubmit,PageGrid,TwoQuestions,MissingRow}.tsx` (thay `SubmitPanel` phía con; `SubmitPanel` giữ cho "nộp thay" của người lớn, chỉ thêm câu gợi ý cho PDF); `app/tasks/[kind]/[id]/page.tsx` hoặc `app/assignments/[id]/page.tsx` (một màn nộp mỗi bài giao, mở từ Hôm nay); `components/practice/SubmissionFeedbackForm.tsx` (người lớn, trên bảng bài đã giao / trang xem bài nộp; dùng `FeedbackFields` của S6); `app/api/learners/[id]/assignments/[aid]/submissions/[sid]/feedback/route.ts`; `lib/copy/vi.ts`.

**Chữ mới (`paperSubmitCopy`, `linkSubmitCopy`, `submissionFeedbackCopy`):** theo bản thử (dòng 233–270 của chữ trích): "Đề giấy · chụp nộp", "Hạn {ngày} · khoảng {m} phút. Làm trên giấy, xong thì chụp từng trang gửi {thầy/cô}.", "Tải đề (PDF)" / "Tải lại đề", "Chụp các trang bài làm", "Trên iPad: bấm Chụp ảnh để mở camera. Trên máy tính: Chọn ảnh đã chụp. Chụp thẳng, đủ sáng, mỗi ảnh một trang.", "Chụp ảnh" · "Chọn ảnh" · "Thêm trang" · "Lên" · "Xuống" · "Xoay" · "Xóa", "{n} trang · xếp đúng thứ tự trước khi nộp.", "Hai câu hỏi nhanh", "Bạn làm lần đầu?" (Có, lần đầu · Làm lại), "Bạn có xem gợi ý hoặc đáp án không?" (Không · Có), "Trả lời thật giúp {thầy/cô} hiểu đúng bài của bạn. Có xem gợi ý cũng không sao.", "Còn thiếu: ảnh bài làm · trả lời 2 câu hỏi", "Nộp"; link: "Mở bài và làm", "Bài mở ở tab mới. Làm xong thì quay lại đây.", "Làm xong chưa?" (Xong rồi · Chưa, làm tiếp sau), "Không sao. Việc này vẫn ở danh sách Hôm nay, bạn quay lại khi xong nhé.", "Chụp hoặc tải ảnh trang kết quả", "Mở được khi bạn chọn “Xong rồi”."; người lớn: "Góp ý cho con" (Khen · Cần sửa ≤ 3) + lỗi chữ dạng điểm (dùng lại câu UX §5).

**Tasks:**
- [ ] C1 Test thuần: `tests/unit/pageOrder.test.ts` (lên / xuống / xóa / xoay giữ đúng thứ tự, tối đa 12), `tests/unit/imageResize.test.ts` (kích thước đích), `tests/unit/twoQuestions.test.ts` (Nộp chỉ bật khi đủ).
- [ ] C2 `NNNN` → Opus review SQL → `tests/db/paperLinkSubmit.test.ts`: v2 nhận `used_hint` cho PDF, 13 file bị từ chối, thứ tự file giữ, phát lại cùng `client_id`, em kia P0002, đã ghi kết quả → `already_reviewed`; góp ý: chỉ người lớn của em, chữ dạng điểm bị từ chối, chỉ thêm, con đọc được qua `eng_my_seen`, không qua bảng; purge.
- [ ] C3 Màn nộp giấy + link (iPad Safari: kiểm `capture`, ảnh dọc / ngang, mất mạng giữa chừng gửi lại không trùng — dùng lại `uploadAll` + `nextAttempt`).
- [ ] C4 Góp ý của người lớn + hiện ở "Cô đã xem".
- [ ] C5 DOM test (`paperSubmit.test.tsx`: nút ≥ 44 px, mỗi trang có chữ "Trang n", nút Xoay / Xóa có `aria-label` kèm số trang); e2e `practice.spec.ts` (giấy 3 trang xếp lại + xoay → thầy/cô thấy đúng thứ tự; link: "Chưa" giữ ở Hôm nay; góp ý → con thấy ngay).
- [ ] C6 Docs: DOMAIN §6 (cách ② ③ phía con), UX "W4c1", DESIGN §19.22, PROGRESS. Opus review → PR.

**Thử trên preview:** trên **iPad thật**: Nguyên (thử) mở bài PDF → Chụp ảnh 3 trang → đổi thứ tự trang 2–3, xoay trang 1 → trả lời 2 câu → Nộp. Thầy/cô mở bài nộp: 3 ảnh đúng thứ tự, đúng chiều; gửi góp ý "Khen…", "Cần sửa: câu 38–40" → con thấy ngay ở "Cô đã xem". Bài link: "Chưa, làm tiếp sau" → vẫn ở Hôm nay; "Xong rồi" → chọn ảnh → Nộp.

**Đạt khi:** đúng thứ tự / chiều ảnh; câu gợi ý lưu cho PDF; ≤ 12 trang; góp ý không có chữ dạng điểm; NNNN áp 2 lần. **Rủi ro:** ảnh HEIC / ảnh rất lớn trên iPad (nén trên máy; thử trên iPad thật trước khi gộp); trần 60 vé tải lên / 24 giờ với 12 trang × vài bài (đủ; ghi PROGRESS).

---

## PR W4c2 · Làm bài trên app + màn sau khi nộp (S-10) + "Thử lại câu này" — `feature/w4c2-player-result`

**Mục tiêu:** màn làm bài từng câu (chấm tiến độ câu, "Câu trước / Câu tiếp", tự lưu "Đang lưu… / Đã lưu", "Nộp bài"), dòng "Luyện tập" hoặc "Bài kiểm tra: tự làm, không có gợi ý. Cứ làm hết sức mình — {thầy/cô} cần thấy bạn tự làm được đến đâu."; ô **"Hỏi gia sư · Sắp có"** mờ, không bấm được, chỉ ở bài luyện tập (S-3). Sau khi nộp: "Bạn đã nộp bài · {thầy/cô} sẽ xem"; bài luyện: "Mấy câu bạn nên nhìn lại" — mỗi câu "Bạn trả lời: …" / "Bạn chưa trả lời câu này." + **"Thử lại câu này"** (một lần, ô nhập → "Gửi cho {thầy/cô}" · "Để sau"; gửi rồi: "Đã gửi lần thử lại cho {thầy/cô}"); "Câu viết tự do · {Thầy/cô} sẽ đọc câu này"; "Các câu còn lại: ổn" (không số, Q3); "Về Hôm nay" · "Xem trong Đã làm". Bài kiểm tra: "Mấy câu {thầy/cô} sẽ xem lại cùng bạn", không thử lại. Chờ Q2(f), Q3, Q4, Q13.

**SQL `NNNN_result_view_retry.sql`:**
1. `english.activity_test_marks` (chỉ thêm): `id`, `activity_id → activity_instances`, `learner_id`, `is_test boolean`, `by_member`, `by_role in ('tutor','parent')`, `client_id`, `created_at`; dòng mới nhất thắng; chỉ đặt được **trước lần nộp đầu** (`(already_started)`). Bài link / PDF: cột tương đương qua bảng `assignment_test_marks` (cùng hình) — hoặc gộp một bảng `work_test_marks(ref_kind, ref_id)`; chọn khi viết SQL, Opus review.
2. `eng_assign_studio_v2(p_draft, p_start, p_due, p_is_test, p_by, p_client_id)` bọc v1 + ghi dấu trong cùng giao dịch; `eng_create_assignment_v3(…, p_is_test)` bọc v2 (0029). `eng_set_test_mark(p_ref_kind, p_ref_id, p_is_test, p_by, p_client_id)`.
3. `english.item_retries` (chỉ thêm): `id`, `learner_id`, `attempt_id → attempts`, `activity_id`, `item_id text check (~ '^q[0-9]{1,3}$')`, `answer text check (btrim 1..500)`, `client_id`, `created_at`; `unique (attempt_id, item_id)`; ghi qua `eng_my_retry_item(p_activity, p_item, p_answer, p_client_id)` (authenticated): lần làm **mới nhất** của con trên bước đó, câu có kết quả `incorrect`/`blank` (hoặc người lớn đã phán Sai), không phải bài kiểm tra (`(test_no_retry)`), một lần (`(already_retried)`), câu thuộc bước (`(bad_item)`). **Không** là bằng chứng: engine S7a / điểm **không đọc** bảng này (test khẳng định `eng_engine_inputs` / `eng_point_inputs` không đổi).
4. `eng_my_result_view(p_activity)` (authenticated) — mục 3.9; dùng cho bài Studio **và** bước đọc / câu hỏi của bài chủ đề có tự chấm.
5. `revoke execute on function english.eng_my_studio_review(uuid) from authenticated;` (Q3; hàm giữ cho tương thích, không ai gọi được từ trình duyệt). `StudioReview.tsx` bỏ.
6. Người lớn: `eng_retry_pending(p_learner)` (service_role) cho Chờ duyệt; `eng_studio_attempt` / màn duyệt bài Studio hiện "Con thử lại: …" bên cạnh đáp án (người lớn).
7. Purge: chép thân gần nhất + `item_retries`, `activity_test_marks` (+ bảng dấu của bài giao).

**Files:** `db/migrations/NNNN_result_view_retry.sql`; `lib/work/{types,shape,handlers,supabaseStore}.ts` (result view, retry); `lib/student/player.ts` (thuần: câu hiện tại, chấm, đã trả lời); `components/student/player/{Player,QuestionCard,QuestionDots,AskTutorSlot,ResultView,RetryBox}.tsx`; `app/activities/[id]/page.tsx` (dùng `StudentDeskShell` + Player; bài sửa S6 giữ `RevisionForm`); người lớn: `components/studio/AssignStudioForm.tsx`, `components/practice/AssignForm.tsx` (ô "Loại bài: Luyện tập · Bài kiểm tra"), màn duyệt bài Studio (dòng "Con thử lại"), `lib/desk/pending.ts` (loại `retry`); `lib/copy/vi.ts` (`playerCopy`, `resultCopy`, `retryCopy`, `testMarkCopy`, `pendingCopy.kinds.retry`; **bỏ** `studioStudentCopy.shouldBe` / `why` khỏi chữ của con).

**Tasks:**
- [ ] D1 Test thuần `tests/unit/player.test.ts` (đi câu, chấm "đã trả lời", tự lưu gộp), `tests/unit/resultView.test.ts` (nhóm câu: nên nhìn lại / tự do / ổn; kiểm tra → không thử lại).
- [ ] D2 `NNNN` → Opus review SQL → `tests/db/resultRetry.test.ts`: result view **không có** `expected`/`explanation`/danh sách câu đúng/số đếm (quét khóa + giá trị), thử lại một lần, không cho bài kiểm tra, không cho câu đúng, không cho lần làm cũ, em kia không ghi / đọc được, `eng_my_studio_review` bị thu quyền (authenticated 42501), engine inputs không đổi trước / sau khi có lần thử lại, dấu bài kiểm tra chỉ trước lần nộp đầu, purge.
- [ ] D3 Player + màn kết quả + "Hỏi gia sư · Sắp có" (disabled, `aria-disabled`, chú thích "Sắp có — gia sư sẽ gợi ý từng bước, không làm hộ. Chỉ có ở bài luyện tập, không có ở bài kiểm tra.").
- [ ] D4 Người lớn: chọn loại bài khi giao; dòng "Con thử lại" ở màn duyệt + Chờ duyệt.
- [ ] D5 DOM + e2e: `studio.spec.ts` sửa (màn kết quả không còn "Nên là"), thêm e2e thử lại câu → thầy/cô thấy; bài kiểm tra không có nút thử lại / ô Hỏi gia sư; `student-no-scores.spec.ts` quét màn kết quả.
- [ ] D6 Docs: PRD D36 (S-10 thay E2/E7 phần "con thấy đáp án"), DOMAIN §2 / §6, UX §3.5 sửa + "W4c2", DESIGN §19.23, PROGRESS. Opus review → PR.

**Thử trên preview:** thầy/cô giao bài Studio "Luyện tập" và một bài "Bài kiểm tra". Nguyên (thử): làm bài luyện, đóng tab giữa chừng → Hôm nay "Làm tiếp · 7/20 câu" → mở lại đúng câu; nộp có vài câu sai → thấy "Mấy câu bạn nên nhìn lại", **không** thấy đáp án; thử lại câu 4 → "Đã gửi lần thử lại"; nút thử lại câu 4 không còn. Bài kiểm tra: không có "Hỏi gia sư", sau khi nộp không có nút thử lại. Thầy/cô: Chờ duyệt có "Con thử lại 1 câu", màn duyệt hiện câu con thử lại cạnh đáp án.

**Đạt khi:** trình duyệt của con không nhận được đáp án ở bất cứ hàm nào (DB test + kiểm mạng trong e2e); thử lại không đổi mức / bậc; NNNN áp 2 lần. **Rủi ro:** bỏ "Nên là" là lùi so với điều gia sư đã quen (E2) — cần phụ huynh xác nhận Q3 rõ; bài chủ đề nhiều bước dùng Player mới phải giữ đúng luật S4 (một `client_submission_id` mỗi lần mở bài).

---

## PR W4d · Mục tiêu tuần + chuỗi tuần mềm + thành tích — `feature/w4d-weekly-goal`

**Mục tiêu:** con **Đặt mục tiêu tuần** (bài/tuần trong khoảng gợi ý) → thầy/cô đồng ý / điều chỉnh → áp từ tuần sau; Hôm nay có chip "🔥 {n} tuần liền" + dòng "Mục tiêu tuần {khoảng ngày} · {a}/{b} bài"; Hành trình có thẻ "Mục tiêu tuần" + "Bộ sưu tập thành tích". **Đổi luật** "không streak" → "chuỗi tuần mềm; không bảng xếp hạng, không so sánh hai em". Chờ Q2(a), Q5, Q6, Q7, Q8, Q19, Q20.

**SQL `NNNN_weekly_goals.sql`:**
1. `english.weekly_goals` (chỉ thêm): `id`, `learner_id`, `kind in ('propose','accept','adjust','withdraw')`, `pieces int check (1..14)` (NULL khi withdraw), `applies_from date` (thứ Hai; chỉ accept / adjust; **hàm đặt** = `weekStart(now VN) + 7`), `responds_to uuid → weekly_goals(id)` (accept / adjust / withdraw trỏ đề xuất; unique — một trả lời mỗi đề xuất), `by_member`, `by_role in ('student','tutor')`, `client_id`, `created_at`; CHECK hình theo `kind`.
3. `track_settings` thêm `weekly_goal_range` (Q8).
4. Ghi: `eng_my_propose_goal(p_pieces, p_client_id)` / `eng_my_withdraw_goal(p_goal, p_client_id)` (authenticated; khoảng gợi ý `(out_of_range)`, `(pending_exists)`, việc của con + còn mở `(bad_ref)`); `eng_decide_goal(p_goal, p_action accept|adjust, p_pieces, p_by, p_client_id)` (service_role sau `"goals:decide"`; **chỉ thầy/cô của em**, Q19).
5. Đọc: `eng_my_week()` (authenticated) và `eng_week_facts(p_learner)` (service_role, người lớn) cùng hình: mục tiêu hiện hành / đang chờ / tuần sau, khoảng gợi ý, **dữ kiện** 26 tuần (mỗi việc: tuần, có lần nộp không) + dữ kiện thành tích (giờ nộp đầu bước viết, bài chủ đề xong, bài sửa đầu, sự kiện Unit giáo trình chính). Luật chuỗi / đạt / thành tích **chỉ ở TS** (U22).
6. Purge: chép thân gần nhất + `weekly_goals`.

**Files:** `db/migrations/NNNN_weekly_goals.sql`; `lib/student/{week,goal,streak,achievements}.ts` (thuần); `components/student/goal/{GoalChip,WeekCard,GoalPicker,AchievementsCard}.tsx`; `app/goal/page.tsx` (Đặt mục tiêu tuần); người lớn: `scripts/seed-dev.ts` (cờ `--goal-history`, chỉ em `is_test`); `components/desk/GoalBox.tsx` (Bàn làm việc: "Mục tiêu tuần · {a}/{b} · chuỗi {n} tuần" + đề xuất chờ: Đồng ý · Điều chỉnh), `lib/desk/pending.ts` (loại `goal`), `app/api/learners/[id]/goals/[gid]/route.ts`, `app/api/student/goal/route.ts` (hoặc gọi RPC thẳng từ client bằng phiên của con — chọn route để giữ một đường ghi; `no-store`); `lib/auth/requireAccess.ts` (+ `goals:decide`); `lib/copy/vi.ts` (`weeklyGoalCopy`, `streakCopy`, `achievementsCopy`, `pendingCopy.kinds.goal`).
**Docs (đổi luật, Q2a):** `CLAUDE.md` mục "Warnings" — thay "Không thêm streak, bảng xếp hạng, …" bằng "Không thêm bảng xếp hạng, so sánh hai em, chat mở với AI, …; **chuỗi tuần mềm** (tuần liền đạt mục tiêu tuần, tính trên việc làm thật) là được phép (D34)"; PRD thêm **D34** + §10 không đổi; DOMAIN bản 0.5 §1 (dòng streak → "Chuỗi tuần mềm: **Có** (D34)"), §11; UX "W4d"; DESIGN §19.24.

**Tasks:**
- [ ] E1 Test thuần (viết trước): `tests/unit/week.test.ts` (ranh giới thứ Hai 00:00 VN = Chủ nhật 17:00 UTC; Chủ nhật 23:59 VN; năm mới), `tests/unit/streak.test.ts` (mọi ví dụ 3.6 + tuần chưa có mục tiêu + 52 tuần), `tests/unit/goalEffective.test.ts` (đồng ý Chủ nhật 21:00 → thứ Hai), `tests/unit/achievements.test.ts` (mỗi dòng 3.7: đạt / chưa / ngày đạt; Unit bị đặt lại "chưa học" → mất đạt, ngày đạt theo đợt mới).
- [ ] E2 `NNNN` → Opus review SQL → `tests/db/weeklyGoals.test.ts`: con chỉ đề xuất cho mình, khoảng gợi ý theo `track_settings`, một đề xuất chờ, chỉ thầy/cô của em quyết (phụ huynh 42501), `applies_from` do hàm đặt (client không gửi được), việc của em kia `bad_ref`, chỉ thêm, purge; `eng_my_week` không có dữ liệu em kia.
- [ ] E3 Màn Đặt mục tiêu tuần (lựa chọn từ khoảng, câu gợi ý từ 4 tuần, trạng thái "Chờ {thầy/cô} đồng ý" + "Rút lại", "Đã đồng ý · từ tuần sau"); chip + thẻ tuần.
- [ ] E4 Người lớn: hộp mục tiêu ở Bàn làm việc + Chờ duyệt.
- [ ] E5 Thành tích (Hành trình): đã đạt + 3 gần đạt, "Chỉ có cột mốc thật — không có xu, không có điểm thưởng."
- [ ] E6 DOM + e2e (`goal.spec.ts`: đề xuất → thầy/cô điều chỉnh → con thấy "từ tuần sau"; chip chuỗi có chữ + `aria-label`); test canh chữ: không "xếp hạng", không tên em kia trên trang của con.
- [ ] E7 Đổi tài liệu (mục Docs ở trên) — **trong PR, phụ huynh duyệt từng đoạn**. Opus review → PR.

**Thử trên preview:** An (thử) → Hành trình → "Đổi mục tiêu" → 4 bài/tuần → Gửi → "Chờ thầy/cô đồng ý". Thầy/cô của An (thử) → Bàn làm việc → "Đồng ý" → An thấy "Đã đồng ý · từ tuần sau (thứ Hai …)". Để thử chuỗi nhanh: script seed `npm run db:seed-dev` có thêm cờ `--goal-history` tạo 5 tuần dữ kiện thử cho học sinh thử (chỉ `is_test`) → chip "🔥 5 tuần liền".

**Đạt khi:** ví dụ 3.5 / 3.6 / 3.7 là test xanh; mở app / mở link không tăng số bài; đổi giờ máy không đổi tuần; tài liệu đổi luật đã được phụ huynh duyệt trong PR. **Rủi ro:** tính mục tiêu "bài" khi việc to (bài kiểm tra 60 câu) = 1 bài như bài 10 câu (ghi rõ trong chữ hướng dẫn).

---

## PR W4e · Cấp theo mảng + "Những điều mình đã làm được" + "Ngày ấy – bây giờ" — `feature/w4e-levels-cando`

**Mục tiêu:** Hành trình có thẻ "Cấp hiện tại theo mảng · Cấp do {thầy/cô} xác nhận · {ngày}" + "Hướng tới …", thẻ "Những điều mình đã làm được" ("Mỗi điều là một việc {thầy/cô} đã thấy bạn tự làm được, có bài làm làm bằng chứng." · "{n} điều" · "Mới · {thầy/cô} xác nhận {ngày}"), thẻ "Ngày ấy – bây giờ" ("Hai đoạn viết của chính bạn, {thầy/cô} chọn để bạn tự thấy mình đã đi xa thế nào." · "{Thầy/cô} chọn" · "{Thầy/cô} nhắn: …"); thành tích `cando_n`. Thầy/cô có thẻ chọn hai bài trên Hồ sơ học sinh. **Đổi luật** P2-d / DOMAIN §2, §7.6 / UX §3.2. Chờ Q2(b, c), Q16, Q17, Q18, Q19.

**SQL `NNNN_then_now.sql`:**
1. `english.then_now_picks` (chỉ thêm): `id`, `learner_id`, `then_attempt_id → attempts`, `now_attempt_id → attempts`, `note text check (null or btrim 1..200)`, `status in ('shown','hidden')`, `by_member`, `by_role = 'tutor'`, `client_id`, `created_at`; CHECK chữ không dạng điểm; dòng mới nhất thắng.
2. `eng_pick_then_now(p_learner, p_then, p_now, p_note, p_status, p_by, p_client_id)` (service_role sau `"teaching:write"`; chỉ thầy/cô của em; hai lần nộp của **đúng em**, bước `ACT-WRITE`, có chữ, không `imported`, `then` nộp trước `now` — `(bad_pick)`); `eng_then_now_candidates(p_learner)` (người lớn: các bài viết của em, ngày, 80 ký tự đầu).
3. Đọc của con: `eng_my_levels()`, `eng_my_cando()`, `eng_my_then_now()` (mục 3.8, 3.9).
4. Purge: chép thân gần nhất + `then_now_picks` (trước `attempts`).

**Files:** `db/migrations/NNNN_then_now.sql`; `lib/student/{levels,cando}.ts` (thuần: lọc mảng CEFR theo `skill_domains.scale`, không theo tên track); `components/student/journey/{LevelsCard,CandoCard,ThenNowCard}.tsx`; `components/workdesk/ThenNowPicker.tsx` (trên `/learners/[id]/levels`); `app/api/learners/[id]/then-now/route.ts`; `lib/student/achievements.ts` (+ `cando_n`); `lib/copy/vi.ts` (`levelsStudentCopy`, `candoCopy`, `thenNowCopy`); `tests/e2e/student-no-scores.spec.ts` (**sửa** dòng P2-d: con thấy cấp đã xác nhận ở thẻ cấp, **không** thấy cấp giả định, tên bậc S7a, ⚑, "Đang chờ xác nhận").

**Tasks:**
- [ ] F1 Test thuần `tests/unit/studentLevels.test.ts` (mảng chưa xác nhận, mảng Tư duy ẩn theo thang, không theo tên), `tests/unit/cando.test.ts` (CONFIRMED mới nhất mới tính; bị hạ → ẩn; AUTO 1–2 không tính).
- [ ] F2 `NNNN` → Opus review SQL → `tests/db/thenNow.test.ts` + `tests/db/studentLevels.test.ts`: không cấp giả định, không bậc số, chỉ đã xác nhận, em kia 0, chọn bài em kia `bad_pick`, chữ dạng điểm bị từ chối, chỉ thầy/cô của em, purge.
- [ ] F3 Ba thẻ của con + thẻ chọn của thầy/cô.
- [ ] F4 DOM + e2e (`levels.spec.ts`: thầy/cô xác nhận cấp → con thấy "Ngữ pháp · B2 · xác nhận {ngày}"; chọn "Ngày ấy – bây giờ" → con thấy hai đoạn).
- [ ] F5 Docs: PRD D36 phần (b, c); DOMAIN bản 0.5 §2, §7.6; UX §3.2 (con thấy **tên cấp CEFR đã xác nhận** và **tên điều đã làm được**; vẫn không thấy thang, bậc, ⚑) + "W4e"; DESIGN §19.25; PROGRESS. Opus review → PR.

**Thử trên preview:** thầy/cô của Nguyên (thử) xác nhận cấp khởi điểm (Hồ sơ cấp) → Nguyên (thử) → Hành trình: 6 mảng có cấp, không có Tư duy. Thầy/cô xác nhận một đề xuất mức 3 ở tab Kỹ năng → con thấy "Mới · thầy/cô xác nhận {hôm nay}". Thầy/cô chọn hai bài viết cho "Ngày ấy – bây giờ" + lời nhắn → con thấy. Thử lời nhắn "8/10" → bị từ chối có chữ.

**Đạt khi:** con không thấy cấp giả định / bậc số / ⚑ (e2e); lời nhắn không chữ dạng điểm; NNNN áp 2 lần. **Rủi ro:** con thấy cấp "B1+" có thể bị hiểu như điểm — chữ thẻ nói rõ "do {thầy/cô} xác nhận", không so với em kia, không "đạt".

---

## 6. Tài liệu đổi trong W4 (tổng hợp — mỗi đoạn ở đúng PR)

| Tài liệu | Đổi | PR |
|---|---|---|
| `docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md` | đổi tên W4→W5, W5→W6, W6→W7 (Q1); thêm dòng "W4 · Bàn học của con" | W4a |
| `lib/shell/nav.ts` | `roadmap` hết "soon", `lane` mới | W4a |
| `docs/DOMAIN.md` → bản 0.5 | §1 (chuỗi tuần mềm), §2 (con thấy gì mới), §4 / §6 (Lộ trình = mốc, mục 3.4), §7.6, §11, R6 (`CAM-WS-1` sang W5 mới) | W4a, W4b, W4d, W4e |
| `docs/PRD_FAMILY_EDITION.md` | D34 (chuỗi tuần mềm, W4d), D35 (số đếm của con, **W4a**), D36 (S-10 + con thấy cấp / điều đã làm được, W4c2/W4e), D37 (Launcher, Q14, W4b), **D38 (con thấy Unit + trạng thái giáo trình chính, W4a)**, §6.2 | W4a–W4e |
| `CLAUDE.md` | dòng "Warnings" về streak (Q2a); "Current status" mỗi PR | W4d (+ mỗi PR) |
| `docs/UX_COPY_GUIDE.md` | §3.2, §3.5, mục mới "W4a"…"W4e" (bảng chữ) | mọi PR |
| `docs/DESIGN.md` | §19.20–§19.25 | mọi PR |
| `docs/PROGRESS.md` | mỗi PR một mục: làm gì · SQL cần áp · cách thử · tiêu chí · giả định | mọi PR |

## 7. Việc không xác minh được khi viết kế hoạch

- Màn **Lộ trình** của bản bấm thử workdesk đang được sửa (đọc bản 21:27: có dữ liệu mốc của An — đỉnh nháp "Lên B1" do app đề xuất, lịch sử, `removed` — chưa thấy bản vẽ đầy đủ của màn). W4a bước A0 đọc lại bản mới nhất.
- Hành vi camera / HEIC / bộ nhớ trên **iPad thật của con** (chỉ kiểm được trên thiết bị; ghi vào tiêu chí W4c1).
- Bộ mục kiến thức Destination chưa có số — nếu nó đổi purge, các migration W4 chép thân purge từ migration mới nhất đã gộp.
- Thời gian chạy `eng_my_seen` / `eng_my_today` trên dữ liệu thật (chưa có dữ liệu thật của con, 07/11).
