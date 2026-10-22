# S7a · Trạng thái từng kỹ năng — Thiết kế (đã duyệt 22–23/10/2026)

Người soạn: Claude (Opus), brainstorm cùng phụ huynh 22–23/10/2026. Nguồn: PRD §8 (S7 = "Episode, observation, engine trạng thái §6.4, đề xuất → xác nhận, rebuild", FR-15), D22 (luật "Tự làm được"), D32; DESIGN §6 (`mastery_decisions`, `competency_state`), §8 (engine `computeTargetState`), §13, §17; spec bản đồ kỹ năng `2026-10-21-skill-map-levels-design.md` (P3-a/P3-b, §4); UX_COPY_GUIDE §3.2 (thang bậc); `content/assessment_policy_AP-0.2-pilot.json`.

## 0. Mục tiêu và tiêu chí đạt

Mỗi kỹ năng trong bộ kỹ năng của em có **một bậc** (thang 5 bậc đã có trong app), tính lại được từ bằng chứng đã duyệt; thầy/cô xác nhận các khẳng định quan trọng. Là nền cho S7b (lên cấp theo mảng).

Đạt khi:
1. App tự tính bậc mọi kỹ năng của 2 em từ toàn bộ bằng chứng đã duyệt (kể cả bài pilot), tính lại được bất cứ lúc nào cho cùng kết quả.
2. Đề xuất lên bậc 3–4 xuất hiện ở Hộp duyệt → tab **Kỹ năng**; gia sư xác nhận / "Chưa" (lý do) / xác nhận nhiều cái một lần.
3. Hồ sơ cấp có số thật ở "Đã vững / Đang luyện / Còn cần" và "n/N điểm đã vững".
4. Không bao giờ tự hạ bậc; kết quả kém sau khi đã đạt → ⚑ "Cần thầy/cô xem lại", giữ bậc.
5. Học sinh không thấy bậc, không thấy điểm.

## 1. Quyết định của phụ huynh

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Chia S7 | **2 PR: S7a (trạng thái kỹ năng) → S7b (lên cấp theo mảng)** |
| Q2 | Kỹ năng dùng chung 2 con (`S-…`) | **Hoãn tới khi An gần B1+**; trước đó bổ sung trong từng track (A-v2, B-v2) |
| Q3 | Bài tự chấm tính cho Đọc/Nghe/Ngữ pháp/Từ vựng | **Câu hỏi đóng làm trong app: tính ngay; bài Studio: khi có Studio PR B; bài giấy ở "Ghi kết quả bài": không tính** (chỉ có câu sai) |
| Q4 | Điểm cốt lõi theo cấp | **Claude soạn, gia sư rà, phụ huynh duyệt** (thuộc S7b + bản đồ phiên bản mới) |
| 1 | Bậc nào cần xác nhận | **Chỉ bậc 3 "Tự làm được" và bậc 4 "Vận dụng được"**; bậc 1–2 app tự cập nhật, thầy/cô sửa được |
| 2 | Ai xác nhận | **Gia sư của em**; phụ huynh xem |
| 3 | Bằng chứng cũ | **Tính lại từ đầu**, gồm cả bài pilot đã duyệt |
| 4 | Bậc 4 (bài ôn ≥ 14 ngày + chủ đề mới) | **Tính khi bước đó đã được đánh dấu sẵn trong mẫu chủ đề** (`delayed_check` / `transfer_check`); tự lên lịch bài ôn = S8 |
| A | Luật chặn chữ dạng điểm (S6) | **Chỉ chặn 2 nhãn "Đạt yêu cầu" và "Vững, rõ ràng"** (cùng mọi dạng số đã chặn) — đi chung PR này, migration `0022` |

Ghi chú §17 DESIGN: mục 1 thay đổi nguyên tắc "engine chỉ đề xuất" cho bậc 1–2 — **phụ huynh đã đồng ý 23/10/2026**. Bậc 3–4 và mọi thay đổi do người sửa vẫn qua người duyệt.

## 2. Luật tính bậc (cấu hình trong `AP-0.3`, không viết cứng)

Chỉ dùng **bằng chứng đã duyệt** (episode có quyết định duyệt hiệu lực theo D15); không dùng `results` / `tag_marks` / `reading_reports` / "hỏi lại điểm yếu" (tín hiệu, D32).

| Bậc | Điều kiện |
|---|---|
| Chưa đủ bài | Không có quan sát đã duyệt nào cho kỹ năng |
| 1 · Làm được khi có gợi ý | ≥ 1 quan sát đạt (≥ `supported.minScore`) nhưng có hỗ trợ ảnh hưởng kỹ năng (khai báo, quan sát, bài sửa S6, chế độ PRACTICE có khung) |
| 2 · Đang tiến bộ | ≥ 1 lần làm đầu **không hỗ trợ** đạt ≥ `minScoreEach`, chưa đủ bậc 3 |
| 3 · Tự làm được | **Cách 1 (D22, mọi kỹ năng):** ≥ `minFirstAttemptEpisodes` (3) lần làm đầu, ngày khác nhau, mỗi lần ≥ `minScoreEach` (3/4), ≥ `minContexts` (2) chủ đề/nguồn, trải ≥ `minSpanDays` (7) ngày, ≥ `minDirectCheckpoint` (1) bài kiểm tra trực tiếp, không hỗ trợ ảnh hưởng. **Cách 2 (P3-b, chỉ kỹ năng mảng Đọc/Nghe/Ngữ pháp/Từ vựng có câu tự chấm trong app):** ≥ 8 câu gắn kỹ năng đó, thuộc ≥ 2 bài khác nhau, đúng ≥ 75 %, và một bài ôn ≥ 14 ngày sau lần gần nhất đúng ≥ 70 % |
| 4 · Vận dụng được | Đang bậc 3 **và** 1 bài `delayed_check` (≥ `delayedMinDaysFromLastExposure` = 14 ngày) đạt **và** 1 bài `transfer_check` (chủ đề mới) đạt |
| ⚑ Cần thầy/cô xem lại | Sau khi đạt bậc ≥ 2: một bằng chứng mới dưới ngưỡng trong `conflictWindowDays` (21) → giữ bậc, gắn cờ, đề xuất "xem lại" |

"Bài khác nhau" (cách 2) = `activity_instance` khác nhau; "bài ôn" = bước có facet `delayed_check` hoặc lần làm cách lần gần nhất ≥ 14 ngày trên cùng kỹ năng. Bài sửa (S6) luôn là "có hỗ trợ", không bao giờ là lần làm đầu.

## 3. Luồng

1. Có bằng chứng mới (quyết định duyệt S5, lần làm có câu tự chấm, bài sửa đã xem) → app tính lại trạng thái các kỹ năng liên quan của em đó (hàm thuần `computeTargetState`, chạy ở server sau khi ghi).
2. Kết quả đổi trong bậc 1–2 → ghi thẳng (quyết định `AUTO`), hiện trên Hồ sơ cấp / Kỹ năng đang theo dõi.
3. Kết quả lên bậc 3 hoặc 4, hoặc cờ ⚑ → tạo **đề xuất** (`PROPOSED`) vào Hộp duyệt → tab **Kỹ năng** của gia sư em đó.
4. Gia sư: **Xác nhận** (→ `CONFIRMED`, bậc đổi) · **Chưa** (lý do bắt buộc → `REJECTED`, giữ bậc; đề xuất mới chỉ khi có thêm bằng chứng) · **Xác nhận tất cả** (chỉ cho các đề xuất lên bậc, không cho cờ ⚑).
5. Gia sư sửa tay bậc 1–2 (hiếm) → quyết định `MANUAL` có lý do.
6. "Tính lại từ đầu" (rebuild) cho một em: chỉ phụ huynh/gia sư, dựng lại `competency_state` từ quyết định + bằng chứng, không tạo đề xuất trùng.

## 4. Dữ liệu (migration `0022`, chỉ thêm)

| Thêm | Nội dung |
|---|---|
| `english.mastery_decisions` (append-only) | `learner_id`, `target_key`, `from_state`, `to_state`, `kind` (`AUTO` / `PROPOSED` / `CONFIRMED` / `REJECTED` / `MANUAL` / `FLAG`), `conditions jsonb` (điều kiện đạt/chưa, đường 1 hay 2), `evidence_episode_ids`, `policy_version`, `engine_version`, `decided_by`, `reason`, `responds_to` (đề xuất được trả lời), `created_at` |
| `english.competency_state` (bảng dẫn xuất, dựng lại được) | Một dòng / (em, kỹ năng): bậc hiện hành, cờ, đề xuất đang mở, cập nhật lúc; chỉ ghi qua hàm engine |
| `assessment_policies` `AP-0.3` | Bản mới của AP-0.2 + khối `receptiveAuto` (8 câu, 2 bài, 75 %, ôn 14 ngày 70 %) + chỗ trống cho khối `levelGate` của S7b; seed qua `gen:config -- --new`; schema zod mở rộng |
| Chọn chính sách cho em | Bộ kỹ năng hiện tại (A-v1/B-v1, danh mục 0.2.1) giữ nguyên; app dùng `AP-0.3` cho engine qua bảng cấu hình (không sửa danh mục đã khóa) |
| Sửa chuỗi quyết định duyệt S5 | Gỡ chặn `validation_decisions_first_once` theo kiểu expand nếu engine cần trạng thái "thiếu bằng chứng"; nếu không cần thì để nguyên (kế hoạch quyết, ghi rõ) |
| Luật chặn chữ dạng điểm (A) | `eng_has_score_words` bản mới: bỏ 3 nhãn "Chưa thể hiện", "Còn thiếu nhiều", "Được một phần"; giữ "Đạt yêu cầu", "Vững, rõ ràng"; mẫu chung app–DB cập nhật |
| Xóa dữ liệu một em | Thêm 2 bảng mới vào purge / preview |

Ghi qua hàm security definer (`search_path = ''`, service_role sau `requireAccess`); học sinh không đọc được bảng nào mới.

## 5. Màn hình

| Màn | Ai | Nội dung |
|---|---|---|
| Hộp duyệt → tab **Kỹ năng** | Gia sư (phụ huynh xem, không bấm) | Danh sách đề xuất theo em: "Tên kỹ năng: bậc cũ → bậc mới" hoặc ⚑; mở ra: điều kiện đạt (✓/✗), các bài bằng chứng (bấm xem), đường 1 hay 2; nút Xác nhận / Chưa (lý do) / Xác nhận tất cả |
| Hồ sơ cấp (SM-2) | Phụ huynh, gia sư | "Đã vững" = bậc 3–4 · "Đang luyện" = bậc 1–2 + ⚑ · "Còn cần" = điều kiện chưa đạt gần nhất; "n/N điểm đã vững" theo bộ kỹ năng hiện tại |
| Kỹ năng đang theo dõi | Phụ huynh, gia sư | Thang 4 ô có chữ cho từng kỹ năng, cờ ⚑, ngày cập nhật, "đang chờ xác nhận" |
| Trang học sinh | Học sinh | Không đổi |

Mockup 1 bảng (Hộp duyệt → tab Kỹ năng) — phụ huynh duyệt trước khi code giao diện.

## 6. Không làm trong S7a

Lên cấp theo mảng, điểm cốt lõi, bộ kỹ năng theo em, lời chúc cho em (S7b); kỹ năng dùng chung `S-…` (hoãn); tự lên lịch bài ôn / chủ đề mới (S8); bằng chứng từ Studio (Studio PR B); AI đề xuất bậc (không bao giờ); hạ bậc tự động (không bao giờ).

## 7. Rủi ro

| Rủi ro | Giảm |
|---|---|
| Engine tính sai → bậc sai | Hàm thuần có bộ test theo từng điều kiện D22/P3-b (DESIGN §8 L177), rebuild cho cùng kết quả; bậc 3–4 luôn qua người |
| Tự cập nhật bậc 1–2 làm phụ huynh hiểu nhầm | Ghi rõ "app tự cập nhật" + thầy/cô sửa được |
| Đề xuất trùng lặp sau mỗi bài | Một đề xuất mở / (em, kỹ năng); "Chưa" chặn đề xuất lại tới khi có bằng chứng mới |
| Đổi ngưỡng sau này | Ngưỡng nằm trong `AP-x`, có phiên bản; quyết định ghi `policy_version` |
