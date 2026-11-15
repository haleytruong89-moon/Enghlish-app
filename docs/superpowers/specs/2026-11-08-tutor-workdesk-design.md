# Bàn làm việc gia sư — spec (bản 0.3 · 08/11/2026)

Trạng thái: **0.3 — phụ huynh duyệt 08/11** (D-W1…D-W8; rà soát R1–R8 ở `docs/DOMAIN.md` §14). Kế hoạch W1: `docs/superpowers/plans/2026-11-08-w1-notes-feedback.md`.
Đi cùng: `docs/DOMAIN.md` (luật + dữ liệu; mọi quy tắc tính, trạng thái, bất biến nằm ở đó). Hub: `TUTOR_WORKDESK_REVIEW_2026-11-07.md`, `AI_QUALITY_PLAN_2026-11-07.md`, `TUTOR_SESSION_30MIN_2026-11-07.md`.
Bản bấm thử: https://claude.ai/artifact/BxGqLyRiixGeJhWDFsmfVT · Trang luồng: https://claude.ai/artifact/GNJifVVkmQxok3Jdg56RvJ

## 1. Vấn đề và mục tiêu

**Vấn đề (gia sư 05/11, rà code 07/11):** app không có lớp "bài dạy" (giáo trình, Unit), nên ghi buổi khó, danh sách nhãn/kỹ năng mỏng và lệch với nội dung dạy. Gia sư phải ghi tay những thứ app có thể đọc từ đề và bài làm. AI chưa giúp được việc chuẩn bị và theo dõi.

**Mục tiêu:**
1. Gia sư làm việc theo **giáo trình thật** (nhiều quyển mỗi em), app biết "đang học đến đâu".
2. **Gia sư cung cấp dữ liệu và duyệt; AI đọc và soạn nháp; code tính chính xác; phụ huynh được báo.**
3. Gia sư dành **~30 phút/tuần/em** ngoài giờ dạy (✅ 08/11).
4. Mỗi điểm kiến thức có mức dựa trên **bằng chứng từng câu**, không dựa cảm nhận.
5. Chất lượng AI đo được (% câu gia sư giữ nguyên) và cải thiện được qua vòng góp ý.

**Thước đo thành công (sau 4 tuần dùng thật):**
- Ghi buổi ≤ 2 phút.
- ≥ 80 % bài về nhà nộp và chấm qua app (cách ① ② ③).
- Gia sư giữ nguyên ≥ 85 % câu AI soạn cho việc "đọc đề" và "gợi ý bài".
- Không có lần nào con thấy điểm.

**Không làm:** xem `docs/DOMAIN.md` §11.

## 2. Người dùng và cách đọc dữ liệu thật

| Em | Giáo trình (✅ 08/11) | Cấp theo sách | Hệ quả thiết kế |
|---|---|---|---|
| **Nguyên** (lớp 9, Track B) | Destination C1&C2 Grammar & Vocabulary · Reading Explorer **3** · Great Writing **4** (ôn lại triển khai đoạn, câu gọn, không lặp ý) · Listening & Notetaking **1** · SGK Tiếng Anh 9 | Ngữ pháp/Từ vựng ≈ C1; Đọc ≈ B1+; Viết ≈ B1–B2; Nghe ≈ A2–B1 | Lộ trình **nhiều dòng, mỗi dòng một cấp**. Nghe là dòng xa mục tiêu C1 nhất → báo phụ huynh rủi ro mốc C1 ~10/2027 |
| **An** (lớp 6, Track A) | SGK Global Success 6 · Cambridge (Flyers/KET…) 🕓 · sách kỹ năng đọc/viết 🕓 · đề ôn thi trường | ≈ A2 | Giáo trình "đề ôn thi trường" là loại đề (không có Unit) → dùng cách giao ① |

Mục tiêu Nguyên (phương án B, ✅ 07/11): thi vào 10 (06/2027, ưu tiên 1) · C1 (~10/2027) · HSG không gấp.

## 3. Màn hình (theo bản bấm thử, đã sửa theo góp ý 07–08/11)

| Màn | Việc gia sư (12 việc) | Có AI? |
|---|---|---|
| **Bàn làm việc** | Hôm nay: buổi tiếp theo, việc cần duyệt, cảnh báo (bài quá hạn, cờ "Cần đối chiếu", ⚑) | Kế hoạch buổi sau (nháp) |
| **Hồ sơ học sinh** | 1 Hồ sơ đầu vào (mục tiêu, cấp 7 mảng, mạnh/yếu ban đầu) · **Ghi chú dạy học** (4 ô) · 12 Xác nhận cấp quý | Nhận xét tháng (nháp) |
| **Giáo trình** | 2 Nạp giáo trình (không giới hạn số quyển) · "Đang học đến" | Đọc mục lục → Unit + nối điểm (nháp) |
| **Bản đồ kiến thức** | Xem mức từng điểm theo giáo trình / mảng; bằng chứng từng câu | — |
| **Lộ trình** | 4 Lộ trình 12 tháng nhiều dòng · 11 Điều chỉnh | Nháp lộ trình / phần thay đổi |
| **Lịch / Buổi học** | 5 Chuẩn bị buổi · 6 Ghi buổi theo Unit (~1 phút) | Kế hoạch buổi |
| **Giao bài** | 7 Giao bài 4 cách · 3 Kiểm tra đầu vào (**tùy chọn**) hoặc **Nạp bài đã làm** · 9 Kiểm tra tiến độ tháng | Đọc đề (Studio B1) · gợi ý bài |
| **Chờ duyệt** | 8 Xem kết quả (mọi cách nộp) · duyệt mọi nháp AI — **mở ra xem, không duyệt một cú bấm**, câu AI không chắc phải xử lý xong | Đọc bài làm (ảnh / file / trang kết quả) |
| **Góp ý về app** (cột trái) | Gửi *Lỗi / Khó dùng / Đề xuất / Câu hỏi*; xem trạng thái | — |
| **Tổng hợp góp ý** (chỉ phụ huynh) | % câu giữ nguyên theo việc, lý do, Sửa công thức; trả lời góp ý về app | — |

Bỏ so với bản bấm thử: tab "Hướng dẫn cho AI" (thay bằng Ghi chú dạy học, 07/11); mục "Phụ huynh góp ý" trong Chờ duyệt (góp ý phụ huynh → cô qua Zalo, 08/11).

## 4. Thứ tự lát (đề xuất, chưa lên kế hoạch chi tiết)

Mỗi lát = một nhánh = một PR; có migration thì phụ huynh áp trước khi thử preview.

| Lát | Gồm | Dữ liệu mới (dự kiến) | AI | Vì sao ở vị trí này |
|---|---|---|---|---|
| **W0** ✅ | Sửa nhanh Ghi buổi (PR #23) | — | — | Gia sư đang dùng hằng ngày |
| **W1** | Hồ sơ đầu vào (mục tiêu, mạnh/yếu ban đầu) + **Ghi chú dạy học** + **Góp ý về app** (gửi + trạng thái + màn phụ huynh trả lời) | `learner_goals`, `teaching_notes`, `app_feedback`, `app_feedback_events` | — | Nhỏ, không AI. Có kênh góp ý ngay từ lát đầu, các lát sau nhận góp ý thật |
| **W2** | **Giáo trình**: nạp PDF mục lục → AI đọc → duyệt Unit + bảng nối Unit → nhãn → "đang học đến"; Ghi buổi chọn Unit đã dạy; nhãn hạt giống dạng câu nghe (R7) | `curricula` (không `kind`, R4), `curriculum_versions`, `curriculum_units`, `curriculum_unit_points`, `curriculum_unit_events`; `lesson_notes` thêm Unit; seed nhãn nghe | Công thức `curriculum-toc.v1` | Nền cho mọi lát sau |
| **W3** | **Mức điểm kiến thức** (`PP-0.1`, đề xuất vào **cùng tab "Kỹ năng"** của Hộp duyệt — R1) + **Bản đồ kiến thức** + **Nạp bài đã làm** (mẫu `kind = 'imported'`, không thuộc bước nào — R2; phụ huynh tải, gia sư xác nhận — R8) | `point_policies` (seed), `point_decisions` (chỉ thêm), `point_state` (dẫn xuất); `attempts.provenance` thêm `imported` + mức hỗ trợ + ngày làm thật + mã băm file | Công thức `read-answers.v1` | Cần W2 để nối Unit; dùng ngay Progress Test thật |
| **W4a** | **Lộ trình mốc** (gia sư đặt mốc + đỉnh, app đề xuất từ giáo trình) + **"Hành trình"** của con (ngọn núi: Unit + mốc đã xác nhận, không điểm) | `roadmap_milestones`, `roadmap_main_curriculum` (chỉ thêm) | `roadmap:read`, `roadmap:write` | Kế hoạch `2026-11-14-w4-student-desk.md` |
| **W5** | **4 cách giao bài**: ② file → con nộp ảnh/file → AI đọc → code so đáp án; ③ link → con nộp ảnh trang kết quả → điểm theo phần; ④ nhập nhanh khi ghi buổi. **Thang `CAM-WS-1`** cho bài viết/nói + quy đổi 0–4 (R6). Chờ duyệt gom mọi cách nộp + vòng góp ý ngắn cho AI | `submission_files`, `ai_feedback` (chỉ thêm), seed `CAM-WS-1` | `read-answers.v1` (dùng lại), `read-result-page.v1` | Gia sư dùng cả 4 cách (08/11) |
| **W6** | **Lộ trình 12 tháng nhiều dòng** (có phiên bản, chỉ duyệt phần thay đổi, phụ huynh được báo) + **Kiểm tra tiến độ tháng** (Studio B1 đánh dấu "kiểm tra tháng") | `roadmap_versions` (chỉ thêm) | `roadmap.v1` | Cần độ phủ giáo trình (W2) + mức (W3) |
| **W7** | **Vòng tháng**: nhận xét tháng nháp (4 mục quen dùng của cô, mỗi câu dẫn bằng chứng) + cờ "Cần đối chiếu"; kế hoạch buổi sau; gợi ý bài luyện (gộp Studio bước 2); **Tổng hợp góp ý** cho phụ huynh | `monthly_comments`, `comment_point_links`, `consistency_flags` | `monthly-comment.v1`, `session-plan.v1`, `practice-suggest.v1` | Cần đủ bằng chứng từ W3–W5 |

Thứ tự có thể đổi W5 ↔ W6 nếu gia sư cần lộ trình sớm hơn. Mỗi lát có buổi gia sư thử bản preview trước khi gộp.

## 5. Yêu cầu chung cho mọi lát

**AI** (`docs/DOMAIN.md` §9, `AI_QUALITY_PLAN`):
- Mỗi việc = một công thức `prompts/<việc>.vN.md`, đầu ra JSON bắt buộc qua tool, sai mẫu → từ chối.
- 3 bước trước khi soạn: Câu hỏi cho cô → AI hỏi lại (nếu thiếu/mâu thuẫn) → Nháp. Ô ghi chú có câu gợi ý mờ; tick "Lưu vào hồ sơ con, mục …".
- Đưa vào AI theo thứ tự: luật → công thức → dữ liệu → câu trả lời → ghi chú lần này → Ghi chú dạy học → 2–3 góp ý gần nhất của đúng em + đúng việc.
- Màn duyệt: từng câu, "Vì sao AI làm vậy", độ chắc; câu không chắc lên đầu và chặn Duyệt; Sửa / Bỏ có lý do tùy chọn; *Tốt / Tạm / Phải sửa nhiều*.
- Bộ đề chuẩn từ tài liệu thật (Progress Test + đáp án, mục lục Destination, bài Mixed conditionals; thêm Reading Explorer 3 / Great Writing 4 / Listening & Notetaking 1 khi có PDF) chạy mỗi khi đổi công thức hoặc model.
- Trần $10/tháng; hết trần → "Soạn tay" ở mọi việc. `AI_FAKE=1` trong CI.
- **Danh tính** (✅ D-W7 08/11): chỉ gửi bí danh + hồ sơ học tập; giữ luật lọc tên hiện có.

**Dữ liệu:**
- Migration chỉ thêm, idempotent.
- Bảng sổ gắn `eng_forbid_mutation`.
- Bảng có `learner_id` vào `eng_purge_learner` / `eng_purge_preview` kèm test so từng dòng.
- RLS đọc `eng_is_staff_of`; ghi qua hàm `security definer` sau `requireAccess`.
- Học sinh chỉ đọc qua hàm `eng_my_*`, không bao giờ điểm.

**Giao diện:** chữ trong `lib/copy/vi.ts`; người dạy là "thầy/cô" (`tutorHonorific`); điện thoại 390 px không cuộn ngang; ô bấm ≥ 44 px; tìm không dấu (W0).

**Quy tắc giao diện cho máy tính** (gia sư chủ yếu dùng máy tính; audit bản bấm thử 08/11 ở 1366×768 và 1920×1080):
1. **Màn duyệt rộng**: mọi màn xem / duyệt việc AI làm và bài nộp rộng ~1100 px (hoặc trang riêng); thanh hành động **luôn hiện ở đáy** ("Còn n câu cần xử lý · Duyệt & giao"); nút "Đóng" ở góc trên.
2. **Việc cần làm trước, ở trên cùng**: Bàn làm việc = tiêu đề + nút "Ghi buổi học hôm nay" (góc phải) → "Chờ duyệt" → nhắc việc → 3 khung tóm tắt. Không để việc chính phải cuộn mới thấy ở 1366×768.
3. **Nhắc việc đúng chỗ**: đủ danh sách chỉ ở Bàn làm việc; trang khác chỉ hiện dòng nhắc liên quan tới trang đó.
4. **Danh sách dài = bảng gọn** (Chờ duyệt, bài giao): một dòng một mục — Loại · Nội dung · Từ ngày · Cần làm · Nút; lọc theo loại; mục cũ nhất trên cùng; cột nút cố định độ rộng.
5. **Cột trái cố định** khi cuộn; "Góp ý về app" luôn thấy.
6. Không lặp cùng một danh sách ở 2 trang (Bàn làm việc chỉ tóm tắt số bài giao; danh sách đầy đủ ở "Buổi học & bài giao").
7. Form: nhãn luôn ở **trên** ô, lưới 2 cột thẳng hàng; nhãn trạng thái dạng viên nhỏ, không kéo giãn.
8. Nội dung rộng tối đa ~1240 px trên màn lớn.

**Thử:** mỗi lát có test đơn vị cho quy tắc tính (ví dụ ở DOMAIN §5), test DB cho quyền + bất biến, một E2E đường chính; review Opus trước khi mở PR; hướng dẫn thử trên preview trong PR.

## 6. Tiêu chí chấp nhận theo lát (rút gọn)
| Lát | Đạt khi |
|---|---|
| W1 | Gia sư sửa 4 ô Ghi chú dạy học, lịch sử giữ đủ; gửi góp ý về app, thấy trạng thái phụ huynh đổi; con không thấy gì mới |
| W2 | Nạp PDF mục lục Destination → AI ra 26 Unit đúng thứ tự (bộ đề chuẩn), gia sư duyệt; nối Unit → nhãn chỉ trong danh sách đóng; "đang học đến" đúng 3 ví dụ DOMAIN §5.1; sửa sau duyệt tạo v2, bằng chứng cũ không đổi; nhãn nghe chọn được trong ô chọn |
| W3 | Nạp Progress Test thật → 60 câu được tính đúng ngày 23/10; mức đúng 5 ví dụ DOMAIN §5.2; nạp trùng bị chặn; "làm cùng cô" không vượt mức 2; tính lại từ đầu cho kết quả giống hệt; **trạng thái S7a không đổi sau khi nạp** (R2); đề xuất mức điểm nằm trong tab "Kỹ năng" (R1) |
| W4a | Gia sư đặt mốc + đỉnh, mỗi mốc ghi sửa/bỏ có lý do; con thấy ngọn núi chỉ có Unit + mốc đã xác nhận, không điểm/mức; đỉnh chưa xác nhận hiện "Đỉnh của bạn — … sẽ đặt tên" |
| W5 | Con nộp ảnh bài giấy → AI đọc → code chấm; câu mờ → gia sư phán; trang kết quả link → điểm theo phần, không bịa câu sai; góp ý cho AI ghi đủ |
| W6 | Lộ trình nhiều dòng (≥ 4 dòng cho Nguyên), tổng buổi khớp phép tính; duyệt phần thay đổi; phụ huynh thấy thông báo phiên bản mới |
| W7 | Nhận xét tháng nháp có 4 mục, mỗi câu dẫn bằng chứng; cờ "Cần đối chiếu" đúng 3 ví dụ DOMAIN §5.4; Tổng hợp góp ý đếm đúng |

## 7. Rủi ro
| Rủi ro | Cách giảm |
|---|---|
| AI đọc sai mục lục / chữ viết tay | Danh sách đóng, code kiểm, câu không chắc chặn Duyệt, bộ đề chuẩn |
| Gia sư không có thời gian duyệt | Duyệt theo câu "cần xem" trước; phần chắc chắn gom lại; đo thời gian thật ở W1–W2 |
| Nhiều bảng mới làm phình phần xóa dữ liệu một em | Mỗi lát mở rộng `eng_purge_learner` + test so từng dòng (đã có mẫu) |
| Mục tiêu C1 cho Nghe xa (Listening & Notetaking 1) | Lộ trình hiển thị khoảng cách; phụ huynh quyết điều chỉnh mốc |
| Chi phí AI tăng khi đọc ảnh | Đọc ảnh chỉ trang có câu trả lời; đo chi phí thật ở W3; trần $10 không đổi |

## 8. Còn chờ
- 🕓 Gia sư: tên quyển Cambridge và sách kỹ năng của An; 4 mục nhận xét tháng quen dùng; cấp khởi điểm 7 mảng + điểm cốt lõi đợt 1 (việc cũ).
- ✅ D-W1 … D-W8 (`docs/DOMAIN.md` §13) và R1 … R8 (§14) đã chốt 08/11; spec + DOMAIN bản 0.3 đã duyệt.
- Bước thiết kế coi như xong (phụ huynh, 08/11): gia sư đã xem bản bấm thử; audit giao diện máy tính đã sửa vào bản bấm thử (mục 5).
- **Thử AI bằng dùng thật** (phụ huynh 08/11): không làm nhánh thử riêng. Lần đầu gia sư nạp mục lục (W2) và bài đã làm (W3) chính là lần thử: ghi chi phí từng lần (`ai_runs`) và % câu gia sư phải sửa vào `docs/PROGRESS.md`; file đó vào bộ đề chuẩn. Trần $10 giữ chi phí; màn duyệt bắt buộc giữ chất lượng. Nếu AI đọc sai nhiều (gia sư sửa > 20 % câu) → dừng, chỉnh công thức trước khi đi tiếp.
