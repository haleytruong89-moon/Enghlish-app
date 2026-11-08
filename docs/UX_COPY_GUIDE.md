# Learning OS — Bảng từ ngữ & quy tắc giao diện v0.1

*Ngày: 13/10/2026 · Áp dụng cho: mọi màn hình, thông báo, báo cáo · Claude Code phải dùng đúng nhãn trong file này (lưu trong `lib/copy/vi.ts`), không tự đặt tên mới.*

---

## 1. Kết quả rà soát mockup v1 (vì sao phải sửa)

| # | Vấn đề | Ở đâu | Sửa thế nào |
|---|---|---|---|
| 1 | Lộ mã kỹ thuật (`A-L3-CAUSE-S`, `AP-0.2-pilot`, "Danh mục 0.2", "bộ mục tiêu A-v1") | Phụ huynh, Vì sao | Học sinh và phụ huynh **không bao giờ** thấy mã. Gia sư thấy mã cỡ chữ nhỏ, màu xám |
| 2 | Thuật ngữ dịch thô: "Chưa đủ bằng chứng", "Làm được khi có hỗ trợ", "checkpoint", "chấm mù", "inquiry", "bản chép tự động" | Mọi màn | Dùng bảng nhãn ở mục 3 |
| 3 | Thang điểm 0–4 chỉ có con số, không biết mỗi số nghĩa là gì; không thấy "đang được mấy điểm" | Gia sư | Mỗi nút có nhãn chữ; luôn hiện dòng "Cô chấm: 3/4 · Đạt yêu cầu"; có thanh tổng kết bài |
| 4 | Thanh màu xếp chồng + "7 mục" — phụ huynh không đọc được | Phụ huynh | Danh sách từng kỹ năng, thang 4 bậc có chữ, câu tóm tắt ở đầu |
| 5 | Cột "Đạt/Chưa" khô, không nói còn thiếu bao nhiêu | Vì sao | Checklist có biểu tượng + "Còn 1 bước nữa" |
| 6 | Giọng nói với trẻ 11 tuổi còn cứng ("Kiểm tra tự làm — gợi ý đang tắt") | Học sinh | Câu ngắn, ấm, không phán xét; nói rõ "sai cũng không sao" |
| 7 | Hai nút "Lưu đánh giá" và "Duyệt" dễ nhầm | Gia sư | Một nút chính "Lưu và duyệt", có điều kiện bật |

## 2. Giọng nói theo vai

| Vai | Xưng hô | Giọng | Không được |
|---|---|---|---|
| Học sinh (An, 11 tuổi) | Gọi tên hoặc "bạn"; câu ngắn ≤ 15 từ | Ấm, khích lệ, chỉ một việc mỗi lần | Không điểm số, không mã, không so sánh với anh/chị, không "sai rồi" |
| Phụ huynh | "An", "bố mẹ" | Rõ, có kết luận trước, số liệu sau | Không thuật ngữ đo lường, không % B1, không thanh màu không chữ |
| Gia sư | "Cô/thầy" (cấu hình), trung tính chuyên môn | Ngắn gọn, đủ căn cứ để quyết | Không ẩn căn cứ; không để AI "quyết" thay |

**Nội dung tiếng Anh** (đề bài, bài làm) giữ tiếng Anh; tiêu đề chủ đề hiện song ngữ: *Vì sao núi lửa phun trào? · Why do volcanoes erupt?*

## 3. Bảng nhãn (thuật ngữ nội bộ → hiển thị)

### 3.1. Thang chất lượng một bài (rubric 0–4) — chỉ gia sư/phụ huynh thấy

| Giá trị | Nhãn ngắn | Giải thích (tooltip) |
|---|---|---|
| 0 | Chưa thể hiện | Bài có cơ hội nhưng chưa làm được điều này |
| 1 | Còn thiếu nhiều | Có cố gắng nhưng thiếu phần chính |
| 2 | Được một phần | Làm được một phần yêu cầu |
| 3 | **Đạt yêu cầu** | Đạt mọi yêu cầu của mục này |
| 4 | Vững, rõ ràng | Đạt yêu cầu và làm rất chắc, rõ |
| NULL | Bài này không có cơ hội thể hiện | Không chấm — **khác với 0** |

**Luôn hiển thị dạng:** `3/4 · Đạt yêu cầu` (số + mẫu số + nhãn). Không bao giờ chỉ "3".

### 3.2. Bậc năng lực (trạng thái) — phụ huynh, gia sư; học sinh chỉ thấy lời khen/việc tiếp theo

| Nội bộ | Nhãn | Bậc | Một câu giải thích |
|---|---|---|---|
| NOT_OBSERVED | Chưa đủ bài để đánh giá | — | Cần thêm bài làm mới nhận xét được |
| SUPPORTED | Làm được khi có gợi ý | 1/4 | Làm được khi có câu mẫu, gợi ý hoặc thầy/cô nhắc |
| DEVELOPING | Đang tiến bộ | 2/4 | Đã tự làm được vài lần, chưa đủ chắc |
| INDEPENDENT | Tự làm được | 3/4 | Tự làm đúng nhiều lần, ở nhiều chủ đề, thầy/cô đã xác nhận |
| TRANSFERABLE | Vận dụng được | 4/4 | Vẫn nhớ sau ≥ 2 tuần và dùng được ở tình huống mới |
| NEEDS_CONFIRMATION | ⚑ Cần thầy/cô xem lại | (giữ bậc cũ) | Bài gần đây chưa tốt bằng trước — chưa hạ bậc |

Hiển thị bằng **thang 4 ô có chữ**, không dùng màu đơn thuần ("Chưa đủ bài" = không ô nào tô + dòng chữ). Bậc 1–2 do app tự cập nhật từ bài đã duyệt (dòng nhỏ "App tự cập nhật"); bậc 3–4 chỉ sau khi thầy/cô của em bấm **Xác nhận** (S7a). Học sinh không thấy thang, bậc hay ⚑ ở bất cứ đâu.

### 3.3. Các khái niệm khác

| Nội bộ | Học sinh thấy | Phụ huynh/Gia sư thấy |
|---|---|---|
| Inquiry | Chủ đề tuần này | Chủ đề |
| Activity step | Bước | Bước |
| PRACTICE | Luyện tập (có gợi ý) | Bài luyện tập |
| INDEPENDENT_CHECK | Bài tự làm — lần này chưa có gợi ý | Bài tự làm (không gợi ý) |
| REVISION | Sửa bài | Bài sửa lại |
| Feedback (S6) | Góp ý của thầy/cô | Góp ý cho con |
| Revision round (S6) | Sửa bài · Lần sửa thứ hai | Bài sửa lại (vòng n) |
| Revision mark (S6) | Đã sửa / Giữ nguyên | Con chọn: Đã sửa / Giữ nguyên |
| Revision verdict (S6) | (không hiện) | Cải thiện thật / Chưa / Lý do hợp lý |
| Revision seen (S6) | Thầy/cô đã xem bài sửa của bạn | Đã xem xong |
| Revision pairs (S6) | (không hiện) | Bài đã sửa |
| Checkpoint | (không hiện) | Bài kiểm tra trong buổi học |
| Delayed check | Ôn lại bài cũ | Bài ôn lại sau 2 tuần |
| Transfer check | Thử ở chủ đề mới | Bài dùng ở chủ đề mới |
| Blind review | (không hiện) | Cô chấm trước, xem gợi ý của AI sau |
| Assistance / support | Gợi ý | Gợi ý đã dùng / Không dùng gợi ý |
| Sentence frame | Câu mẫu | Câu mẫu |
| Evidence / episode | (không hiện) | Bài làm được tính |
| Validation | (không hiện) | Duyệt |
| Transcript (raw) | Lời bạn nói (máy ghi thành chữ) | Chữ do máy ghi, chưa sửa |
| Transcript edit | Sửa chỗ máy nghe nhầm | Bản đã sửa chỗ máy nghe nhầm |
| Target set | (không hiện) | 12 kỹ năng đang theo dõi |
| Not observed (score) | — | Bài này không có cơ hội thể hiện |
| Coverage | (không hiện) | Số kỹ năng đã "Tự làm được" / số đang theo dõi |
| Level proposal (S7a) | (không hiện) | Đang chờ xác nhận: Tự làm được · nút **Xác nhận** / **Chưa** (bắt buộc lý do) |
| Proposal routes (S7a) | (không hiện) | Cách 1: bài thầy/cô đã chấm · Cách 2: câu tự chấm trong app |
| AUTO level 1–2 (S7a) | (không hiện) | App tự cập nhật |
| Flag ⚑ (S7a) | (không hiện) | ⚑ Cần thầy/cô xem lại · nút **Giữ bậc** / **Sửa bậc** |
| Manual level (S7a) | (không hiện) | Sửa tay bậc 1–2 (bắt buộc lý do) |
| Rebuild (S7a) | (không hiện) | Tính lại từ đầu |
| Domain summary (S7a) | (không hiện) | Đã vững · n/N điểm đã vững · Đang luyện · Để lên cấp tiếp, còn cần |
| Transfer mark (S7a, G4) | (không hiện) | Bài này ở chủ đề / nguồn mới (vận dụng) — ô tick trên trang duyệt bài |
| Policy/catalogue version | (không hiện) | Chỉ trong "Thông tin kỹ thuật" (thu gọn) |

### 3.4. Tên kỹ năng hiển thị (Track A, target set v1)

| Mã | Tên cho phụ huynh/gia sư | Tên cho học sinh (khi khen) |
|---|---|---|
| A-L3-CAUSE-S | Nói "vì sao – nên" (nguyên nhân – kết quả) | Nói được vì sao và kết quả |
| A-L3-CAUSE-W | Viết "vì sao – nên" | Viết được vì sao và kết quả |
| A-L3-PARA-W | Viết đoạn văn có câu mở đoạn rõ | Viết đoạn văn rõ ý |
| A-L4-PROCESS-S | Giải thích một quá trình khi nói | Kể các bước của một hiện tượng |
| A-L1-PAST-W | Dùng thì quá khứ khi viết | Viết chuyện đã xảy ra |
| A-L2-CHUNKS | Dùng từ mới của chủ đề | Dùng từ mới vừa học |
| A-L2-COMPENSATE-S | Xoay xở bằng tiếng Anh khi thiếu từ | Nói tiếp được khi quên từ |
| A-T1-TEXT-R | Đọc hiểu bài ngắn | Hiểu bài đọc |
| A-T1-TEXT-L | Nghe hiểu đoạn nói ngắn | Hiểu bài nghe |
| A-T4-CAUSE | Giải thích chuỗi nguyên nhân | Giải thích vì sao |
| A-T7-OPINION | Nêu ý kiến có lý do, ví dụ | Nói ý kiến của mình |
| A-X1-TURN | Nói trôi chảy (cô nghe trực tiếp) | Nói liền mạch |

### 3.5. Studio (đề PDF/Word → bài trong app, Studio B1)

Mọi chữ lấy từ `studioCopy` / `studioStudentCopy` / `studioInboxCopy` / `aiSettingsCopy` / `studioErrors` / `studioIssueText` trong `lib/copy/vi.ts`. Chữ cho con đi qua `studioStudentCopy`; test `studioCopy.test.ts` quét điểm / x/y / %.

| Ngữ cảnh | Chữ | Ai thấy |
|---|---|---|
| Liên kết trên thẻ em, tiêu đề trang | Tạo bài từ đề | Phụ huynh, gia sư |
| Hai nút khi tạo | Cho AI đọc đề · Soạn tay | Phụ huynh, gia sư |
| Chờ AI | AI đang đọc đề… | Phụ huynh, gia sư |
| Màn Duyệt | Duyệt đề · Chỉ câu cần xem · Kỹ năng cả phần · Đáp án (theo file của thầy/cô) · Đáp án chấp nhận · Nhãn · Kỹ năng · Không có kỹ năng phù hợp · Thiếu đáp án | Phụ huynh, gia sư |
| Khung bên phải | Bài sẽ tạo: App tự chấm · Có thể cần thầy/cô xem · Tính bậc kỹ năng · Chỉ tín hiệu (nhãn) · Khung đề giấy | Phụ huynh, gia sư |
| Giao bài | Giao bài · Ngày làm · Hạn nộp | Phụ huynh, gia sư |
| Con xem lại bài | Câu cần xem lại · Bạn viết · Bạn để trống câu này · Nên là · Vì sao · Thầy/cô sẽ xem n câu này · Về Việc tiếp theo · Làm lại. **Không bao giờ** điểm, x/y, số câu đúng | Học sinh |
| Hộp duyệt, tab mới | Cần thầy/cô xem · chờ n ngày · Đúng · Sai · "Đã xong bài này của …: đúng x/y câu làm trên app…" | Phụ huynh, gia sư |
| Cài đặt AI | Cài đặt AI · Đồng ý và bật · Tắt AI · chi phí tháng | Chỉ phụ huynh |

## 4. Quy tắc trình bày

1. **Kết luận trước, số sau.** Mỗi màn phụ huynh mở đầu bằng 1–2 câu tóm tắt bằng lời.
2. **Số luôn có mẫu số và chữ:** "đạt 2/3 bài ôn", "3/4 · Đạt yêu cầu", "4/5 điều kiện".
3. **Không màu đơn thuần:** mọi thanh/ô màu có chữ đi kèm.
4. **Thiếu dữ liệu nói thẳng:** "Chưa đủ bài để đánh giá" — không hiện 0, không ẩn.
5. **Học sinh không thấy điểm.** Chỉ thấy: việc tiếp theo, gợi ý (≤ 3), lời ghi nhận cụ thể ("Lần này bạn đã dùng *as a result* đúng chỗ").
6. **Một hành động chính mỗi màn**, nút chính ≥ 48px, nút phụ dạng viền.
7. **Ngày giờ** dạng "Thứ Sáu 20/11", không ISO.
8. **Mã và version** chỉ trong mục thu gọn "Thông tin kỹ thuật" (phụ huynh/gia sư).

## 5. Thông điệp mẫu

| Tình huống | Câu hiển thị |
|---|---|
| Nộp bài thành công | "Đã nộp! Cô sẽ xem và gửi góp ý cho bạn." |
| AI chưa phân tích | "Đã nhận bài. Góp ý sẽ có sau." (học sinh) · "AI chưa xem được bài này — cần cô xem." (gia sư) |
| Mất mạng khi viết | "Mất mạng — bài vẫn đang được giữ trên máy. Đừng đóng trang nhé." |
| Bài tự làm | "Lần này bạn tự làm — chưa có gợi ý. Cứ nói hết ý, sai cũng không sao." |
| Ôn lại | "Hôm nay ôn: Ong làm mật thế nào? Nói lại mà không xem ghi chép nhé." |
| Lên bậc (phụ huynh) | "An đã lên 'Tự làm được' ở *Dùng thì quá khứ khi viết* — cô xác nhận ngày 12/11." |
| Cần xem lại (gia sư) | "Bài gần đây chưa tốt bằng trước. Giữ bậc hiện tại — cô xem lại khi rảnh." |
| Tính lại xong (phụ huynh/gia sư) | "Đã tính lại. 2 đề xuất mới đang chờ thầy/cô." · "Đã tính lại. Không có đề xuất mới." |
| "Chưa" / sửa tay không có lý do | "Bạn ghi lý do nhé (ít nhất 3 ký tự)." |
| Phụ huynh xem tab Kỹ năng | "Phụ huynh xem; chỉ thầy/cô của em xác nhận." |
| Chưa áp 0023 | "Phần trạng thái kỹ năng chưa sẵn sàng (cần cập nhật cơ sở dữ liệu). Các phần khác vẫn dùng bình thường." |
| Nộp bài sửa (học sinh) | "Đã nộp bài sửa! Thầy/cô sẽ xem lại." |
| Góp ý có dạng điểm (người lớn) | "Góp ý cho con không ghi điểm (như “3/4”, “6 điểm”, “80%”). Bạn viết lại bằng lời nhé." |

## W1 · Ghi chú dạy học, Hồ sơ đầu vào, Góp ý về app (08/11/2026)

Khóa mới trong `lib/copy/vi.ts` (người dạy luôn gọi bằng `tutorHonorific`, không viết cứng "cô"):

- `teachingNotes` — thẻ "Ghi chú dạy học" trên trang Hồ sơ cấp: 4 ô (Đang tập trung vào · Cách giải thích hợp với con · Lỗi hay lặp lại · Cần tránh), nút Sửa / Lưu, dòng "Cập nhật … · tên".
- `intakeCopy` — thẻ "Hồ sơ đầu vào": Mục tiêu (+ mốc), Điểm mạnh / yếu ban đầu theo 7 mảng, Ghi chú.
- `appFeedback` — trang `/feedback` và nút "Góp ý về app": 4 loại (Lỗi · Khó dùng · Đề xuất · Câu hỏi), trạng thái (Mới · Đang sửa · Đã sửa · Không làm), ô trả lời của phụ huynh.

Học sinh không thấy gì ở W1. Không có chữ nào có dạng điểm.

## W2 · Giáo trình (08/11/2026)

Khóa mới trong `lib/copy/vi.ts` (người dạy luôn gọi bằng `tutorHonorific`, không viết cứng "cô"):

- `curriculumCopy` — trang Giáo trình (thẻ: ghi chú cấp, "Đang học đến", độ phủ), Thêm giáo trình / Nạp mục lục, màn duyệt mục lục (Cần xem, thanh dưới "Còn n dòng cần xử lý · Duyệt", lý do sửa / bỏ, Tốt · Tạm · Phải sửa nhiều), bảng nối chỉ đọc, trạng thái Unit, "Unit đã dạy hôm nay" và đề xuất "Đang học" ở Ghi buổi.
- `curriculumErrors` — thông báo lỗi theo mã (không quyền duyệt, nháp đã đổi, còn dòng cần xem, điểm ngoài danh sách, …).

Luật: người dạy = `tutorHonorific`; "%" độ phủ chỉ ở màn người lớn; không chữ "TOMO". Học sinh không thấy gì ở W2.

## Khung bàn làm việc (08/11/2026)

Khóa mới trong `lib/copy/vi.ts` (người dạy luôn là `tutorHonorific`):

- `shellCopy` — cột trái theo bản bấm thử: Bàn làm việc · Hồ sơ học sinh · Bản đồ kiến thức · Lộ trình · Buổi học · Giao bài · Giáo trình · Chờ duyệt; nhãn "Sắp có" cho mục của lát sau (không bấm được); nhóm "Phụ huynh"; câu cuối cột "Mọi thứ AI soạn là nháp: chưa duyệt thì con chưa thấy."
- `pendingCopy` — trang Chờ duyệt (bảng: Loại · Nội dung · Từ ngày · Cần làm · Mở; lọc Tất cả · Bài nộp · Cần xem câu · Nháp AI · Kỹ năng) và khung "Chờ duyệt · n" ở Bàn làm việc. Không có nút duyệt trong bảng.
- `deskCopy` — Bàn làm việc: tiêu đề, nút "Ghi buổi học hôm nay", cảnh báo mới (hồ sơ đầu vào, giáo trình, bài quá hạn, ⚑), 3 khung (Hồ sơ · Giáo trình · Buổi học & bài giao).
- `appFeedback.screens.inbox` = "Chờ duyệt".

Học sinh không thấy gì mới. "Quá hạn" chỉ ở màn người lớn.
