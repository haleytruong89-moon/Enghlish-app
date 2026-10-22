# S6 · Góp ý cho con + Sửa bài (trước–sau) — Thiết kế (đã duyệt từng phần 22/10/2026)

Người soạn: Claude (Opus), brainstorm cùng phụ huynh 22/10/2026. Nguồn: PRD §8 (S6 = "Phản hồi tối đa 3 ưu tiên + retry + so sánh trước–sau", FR-14), §4 (ACT-REVISE → A3, cặp trước–sau = 1 episode), Gate G1 ("giao → nộp → duyệt → làm lại"); DESIGN §5–§8, §11, §13; danh mục A3 (`A-A3-HINTFIX`, `A-A3-REDRAFT`, `B-A3-REVISE`); UX_COPY_GUIDE; code S4 (`eng_attempt_slot`, `eng_step_supported`, `WorkForm`), S5 (Hộp duyệt, `validation_decisions`), S5b (lời nhắn sau buổi), SM-1/SM-2 (bản đồ kỹ năng, Việc cần ôn).

## 0. Mục tiêu và tiêu chí đạt

Khép vòng học đầu tiên của Family Edition: **giao → con nộp → người lớn duyệt + góp ý → con sửa bài → người lớn xem trước–sau**. Không AI.

Đạt khi, trên gia đình thử rồi gia đình thật:
1. Thầy/cô gửi được 1 câu khen + 1–3 góp ý ưu tiên cho một bài viết của con trong ≤ 2 phút, ngay ở màn duyệt.
2. Con thấy "Sửa bài" đầu Việc tiếp theo, sửa trên bản cũ, đánh dấu từng góp ý, nộp — **không thấy điểm ở bất kỳ đâu**.
3. Thầy/cô thấy bài cũ và bài sửa cạnh nhau (chữ bỏ/chữ thêm được tô), đánh giá từng góp ý bằng 1 lần bấm.
4. Phụ huynh xem được trước–sau ở mục "Bài đã sửa".
5. Bài sửa không bao giờ được tính là lần làm đầu (FR-14a) và luôn nối với bài gốc.

## 1. Quyết định của phụ huynh (22/10/2026)

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Ai góp ý | **Người duyệt bài đó** (luật duyệt hiện có: bài kiểm tra trong buổi — chỉ gia sư; còn lại — gia sư hoặc phụ huynh) |
| Q2 | Con sửa thế nào | **Sửa trên bản cũ**; app lưu cả hai bản để so sánh |
| Q3 | Con ghi lý do | **Có, gọn theo lứa tuổi**: Track A bấm "Đã sửa"/"Giữ nguyên" + 1 câu tùy chọn; Track B bắt buộc 1 câu lý do. **Là cài đặt theo track**, không viết `if track` |
| Q4 | Loại bài | **Bài viết (và bài nói khi có S10) làm trong app**. Câu hỏi đóng đã có "Làm lại"; đề giấy → Studio PR B |
| PA | Cách tổ chức | **A: góp ý trong Hộp duyệt → mở "Sửa bài" cho đúng bài đó**; nếu chủ đề có bước "Sửa bài" (REVISION) thì dùng bước đó, không có thì app tự tạo bước sửa |
| 1-a | Câu khen | **Bắt buộc 1 câu khen cụ thể** |
| 1-b | Trích đoạn, gắn kỹ năng | **Tùy chọn** (gắn kỹ năng = 1 lá của bản đồ SM-1) |
| 1-c | Sửa góp ý sau khi gửi | **Được cho tới khi con bắt đầu sửa** (bản mới thay bản cũ, giữ lịch sử) |
| 2-a | Số vòng sửa | **Tối đa 2 vòng** cho một bài gốc; sau vòng 2 chỉ còn nhận xét kết |
| 2-b | Hạn sửa | **Không có hạn ở S6** (lịch/nhắc = S8) |
| 2-c | Sau khi thầy/cô xem bài sửa | Con thấy **"Thầy/cô đã xem bài sửa của bạn"** + nhận xét kết (nếu có), không điểm |
| 3-a | Thầy/cô đánh giá bài sửa | **Bắt buộc đánh giá từng góp ý** (Đã sửa → "Cải thiện thật"/"Chưa"; Giữ nguyên → "Lý do hợp lý"/"Chưa"); **điểm 0–4 kỹ năng "Sửa bài" tùy chọn** |
| 3-b | Chấm kỹ năng ngôn ngữ trên bài sửa | **Được**, app tự gắn "bài sửa — có góp ý" (không bao giờ là "tự làm được"; S7 dùng làm bằng chứng có hỗ trợ) |
| 3-c | Phụ huynh xem trước–sau | **Có, chỉ xem**, mục "Bài đã sửa" trên trang mỗi con |
| 4-a | Mockup trước khi code | **Có, 3 màn**: thầy/cô góp ý, con sửa bài, trước–sau |
| 4-b | Thứ tự | **1 PR**, nhánh `feature/s6-feedback-revision`, migration `0021`, xây trên SM-2; gộp sau PR #18 và #19 |

## 2. Luồng

1. Con nộp bài viết (bước WRITE/DRAFT của chủ đề, hoặc bài viết giao lẻ) → bài vào Hộp duyệt như hiện nay.
2. Người duyệt chấm như S5, rồi điền khung **"Góp ý cho con"**: câu khen (bắt buộc, ≤ 160 ký tự), 1–3 ưu tiên (mỗi ưu tiên ≤ 200 ký tự, trích đoạn tùy chọn ≤ 120 ký tự phải là một đoạn có thật trong bài, gắn lá bản đồ tùy chọn), chọn **"Yêu cầu con sửa bài"** (mặc định) hoặc **"Chỉ góp ý"** → **Gửi góp ý cho con**. Câu có dạng điểm (`\d/\d`, "điểm", "%") → app và DB **từ chối**, kèm lời nhắc viết lại không có điểm (xem §6).
3. Có "Yêu cầu sửa" → app mở **bước sửa**: nếu bài gốc thuộc một chủ đề có bước REVISION ngay sau (theo `template_steps`), dùng bước đó; nếu không, tạo một bước sửa riêng cho bài gốc. Bước sửa nằm **đầu** Việc tiếp theo của con: "Sửa bài: <tên bài> · n góp ý của thầy/cô".
4. Con mở bước sửa: câu khen → các góp ý đánh số (trích đoạn được tô trong bài) → ô viết đã điền **bài cũ** (tự lưu như hiện nay, có "Xem bài cũ") → dưới mỗi góp ý chọn **Đã sửa / Giữ nguyên** (+ lý do theo cài đặt track). Nộp được khi mọi góp ý đã đánh dấu; nếu bài không đổi chữ nào thì mọi góp ý phải là "Giữ nguyên" có lý do. Biên nhận: "Đã nộp bài sửa! Thầy/cô sẽ xem lại."
5. Bài sửa vào Hộp duyệt nhãn **"Bài sửa lại (vòng n)"**: trước–sau cạnh nhau (điện thoại: trên–dưới), chữ bỏ gạch, chữ thêm tô; mỗi góp ý: lựa chọn + lý do của con và 2 nút đánh giá (bắt buộc); điểm "Sửa bài" 0–4 (tùy chọn); chấm kỹ năng ngôn ngữ (tùy chọn, tự gắn "bài sửa — có góp ý"); nhận xét kết cho con (tùy chọn); **Xong** hoặc **Mở vòng 2 với góp ý mới** (chỉ ở vòng 1).
6. Con thấy "Thầy/cô đã xem bài sửa của bạn" + nhận xét kết (nếu có). Phụ huynh xem trước–sau ở "Bài đã sửa".

Sửa góp ý (1-c): trước khi con lưu bản nháp đầu tiên của bước sửa, người gửi được "Sửa góp ý" (dòng mới thay dòng cũ). Sau đó nút này ẩn.

## 3. Dữ liệu (migration `0021`, chỉ thêm)

| Thêm | Nội dung | Ghi chú |
|---|---|---|
| `english.feedback_notes` (append-only) | `learner_id`, `source_attempt_id` (bài được góp ý), `root_attempt_id` (bài gốc của chuỗi sửa), `round` (1 / 2), `kind` (`feedback` / `closing`), `praise`, `items jsonb` (`[{n, text, excerpt?, leaf?}]`, 1–3 với `feedback`, 0 với `closing`), `requires_revision`, `supersedes_id`, `author_member`, `author_role`, `client_id`, `created_at` | Sửa = dòng mới thay dòng cũ (mỗi dòng bị thay tối đa 1 lần, chỉ trước khi con bắt đầu sửa). Ghi qua hàm security definer, kiểm luật duyệt D15 |
| `english.attempts.revises_attempt_id` (cột mới, nullable) | Bài sửa trỏ về bài được góp ý | `learning_family` của bài sửa = của bài gốc (đi xuyên activity_instance); `first = false` luôn |
| Mở mode `REVISION` | `eng_step_supported` cho REVISION **khi** có góp ý còn hiệu lực yêu cầu sửa cho bài gốc của bước đó | Bước sửa tự tạo: `activity_instances` mode `REVISION`, nguồn = góp ý; dùng lại bước REVISION của chủ đề nếu có |
| `english.revision_marks` (append-only) | Theo bài sửa: `item_n`, `choice` (`changed` / `kept`), `reason` | Ghi cùng lúc nộp (trong `eng_submit_attempt` mở rộng hoặc hàm nộp bài sửa riêng) |
| `english.revision_checks` (append-only) | Theo bài sửa: `item_n`, `verdict` (`improved` / `not_yet` / `reason_ok`), người đánh giá | Bắt buộc đủ mọi góp ý trước khi bấm Xong |
| Cài đặt track `revision_reason_required` | A = false, B = true | Cấu hình, không `if track` |
| Đọc cho học sinh | Hàm riêng `eng_my_feedback(...)`, `eng_my_revision(...)`: chỉ câu khen, góp ý, trích đoạn, bài cũ của chính em, trạng thái "đã xem" | **Không** trả điểm, quan sát, quyết định duyệt |
| Xóa dữ liệu một em | Thêm 3 bảng mới vào `eng_purge_learner` / `eng_purge_preview` | |

Điểm "Sửa bài" 0–4 và điểm kỹ năng ngôn ngữ trên bài sửa đi qua đường chấm S5 hiện có (`observations` / `validation_decisions`, episode của cặp trước–sau), không qua sổ góp ý. Episode bài sửa ghi rõ là REVISION (không phải lần đầu).

## 4. Màn hình

| Màn | Ai | Nội dung |
|---|---|---|
| Hộp duyệt · bài viết: khung **Góp ý cho con** | Người duyệt | §2 bước 2; nút "Sửa góp ý" khi còn được |
| Trang chủ con: dòng **Sửa bài** đầu Việc tiếp theo | Con | Tên bài + số góp ý; sau khi thầy/cô xem: "Thầy/cô đã xem bài sửa của bạn" |
| **Màn sửa bài** | Con | §2 bước 4 |
| Hộp duyệt · **Bài sửa lại** (trước–sau) | Người duyệt | §2 bước 5 |
| Trang mỗi con: **Bài đã sửa** | Phụ huynh, gia sư | Danh sách cặp trước–sau, mở ra xem như màn trước–sau (chỉ xem) |

Mọi chữ trong `lib/copy/vi.ts` (bổ sung UX_COPY_GUIDE: "Góp ý cho con", "Sửa bài", "Đã sửa", "Giữ nguyên", "Thầy/cô đã xem bài sửa của bạn"); người dạy = `tutorHonorific`; luôn sáng; không "TOMO"; không điểm cho học sinh.

## 5. Không làm trong S6

- AI soạn góp ý (S11) hay Coach (S12); bài nói (S10); hạn sửa / nhắc (S8); "câu cần xem lại" của bài đề giấy (Studio PR B); góp ý cho câu hỏi đóng; vòng sửa thứ 3; trạng thái kỹ năng / lên cấp từ bài sửa (S7).

## 6. Rủi ro và cách giảm

| Rủi ro | Giảm |
|---|---|
| Lộ điểm qua chữ góp ý | Kiểm mẫu điểm (`\d+\s*/\s*\d+`, "điểm", "%") ở cả app lẫn DB → từ chối, yêu cầu viết lại; test |
| Bài sửa bị tính là lần đầu | `revises_attempt_id` + `first = false` ép trong DB; test |
| Bước REVISION mở khi chưa có góp ý | `eng_step_supported` chỉ mở khi có góp ý hiệu lực yêu cầu sửa; test |
| Vòng sửa vô tận | DB chặn vòng 3 |
| Chuỗi quyết định duyệt S5 (`validation_decisions_first_once`) | Góp ý ở bảng riêng, không thêm loại quyết định mới vào chuỗi S5 |
| Học sinh đọc nhầm dữ liệu chấm | Chỉ đọc qua hàm riêng trả trường cho phép; RLS bảng mới chỉ cho staff; e2e "không điểm" mở rộng sang màn sửa bài |
