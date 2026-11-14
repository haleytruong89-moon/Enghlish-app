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

## W3 · Mức mục kiến thức, Bản đồ kiến thức, Nạp bài đã làm (08/11/2026; đổi chữ 13/11)

Khóa mới trong `lib/copy/vi.ts` (người dạy luôn là `tutorHonorific`, không viết cứng "cô"):

- `pointStateCopy` — đề xuất mức mục kiến thức trong tab "Kỹ năng": `Mục “…”: Đang tiến bộ → Tự làm được`, "Xem điều kiện", Xác nhận · Chưa (lý do) · Giữ mức (⚑), "Chờ thầy/cô xác nhận", "Tính lại mức các mục kiến thức từ đầu". Mức gọi bằng chữ (Đã gặp · Đang tiến bộ · Tự làm được · Vận dụng được), không dùng "đạt".
- `pointMapCopy` — trang Bản đồ kiến thức (mảng › nhóm › mục kiến thức), "App tự cập nhật" / "Thầy/cô đã xác nhận", "Bằng chứng từng câu" với Đúng · Sai · Có hỗ trợ. **Không** có điểm số hay % ở bất cứ chỗ nào của trang.
- `importCopy` — Nạp bài đã làm (tên đề, file bài, file đáp án, ngày làm thật, mức hỗ trợ: Tự làm · Tự làm rồi chữa cùng thầy/cô · Làm cùng thầy/cô), màn "Xem và xác nhận bài nạp" (Cần xem, Đúng · Sai · Bỏ trống, Chỉ ở giấy, thanh dưới "Còn n câu cần xử lý · Xác nhận và tính mức"), lỗi theo mã (`importCopy.errors`) và lý do AI không đọc được (`importCopy.failReasons`).
- `pendingCopy.kinds.point` / `need.point` — dòng "Đề xuất mức mục kiến thức" trong Chờ duyệt. `appFeedback.screens.knowledgeMap` / `importNew` / `importConfirm` — tên màn khi gửi "Góp ý về app".

Luật: mọi thứ AI soạn là nháp; con không thấy mục kiến thức, bài nạp, nhãn hay mức; "%" chỉ ở màn người lớn (điều kiện đề xuất).

## UX vòng 1 cho gia sư (09/11/2026)

Khóa mới / đổi trong `lib/copy/vi.ts`:

- `resultPage` — "Ghi điểm nhanh (bài link)" thay "Ghi kết quả": điểm theo phần (`partsTitle`, `partsHelp`, `partHeading`, `partName`, `partNameHint`, `partWrongHint`, `addPart`, `removePart`, `overall`, `overallEmpty`, `partError`, `tooManyItems`, `tagItemPart`, `breakdownDropped`). Ô "Tên phần" chỉ hiện khi bài có từ hai phần.
- `sessionNotePage.recordResult` = "Ghi điểm nhanh", `savedNext` = "Ghi thêm điểm nhanh" (cùng tên với màn mới).
- `filePickerCopy` (`icon`, `choose`, `change`, `none`) — nút chọn file dùng chung; chữ nhìn thấy nằm trong tên đọc cho trình đọc màn hình ("<tên ô>: Chọn file"), tên file đã chọn được đọc to.
- `levelCopy.confirmAllAction(n)` = "Xác nhận cấp khởi điểm (n mảng)", n = số mảng còn là ước lượng; `intakeCopy.nextStepLevels` và cảnh báo "levelsLine" không còn nêu số mảng.
- `skillStateCopy.criteriaIntro` = "Một bài được tính là đạt khi:" (tiêu chí của danh mục, không đồng nhất với bậc 3); `missingLine` = "Còn thiếu để lên Tự làm được: …".

## Mục kiến thức (13/11/2026)

Phụ huynh duyệt 13/11 sau buổi gia sư thử: chữ "điểm" khi nghĩa là **điểm kiến thức** (một ngữ pháp / từ vựng / dạng câu nhỏ) đổi thành **"mục kiến thức"** (gọn: "mục"). Luật dùng chữ:

- **điểm** = điểm số (3/4, thang điểm, phiếu điểm, "Ghi điểm nhanh (bài link)", "Điểm theo phần", "không ghi điểm", "Điểm do người chấm", "Điểm đề thử tháng"), cấp **khởi điểm**, **điểm mạnh / điểm yếu** ban đầu của hồ sơ đầu vào. Không đổi.
- **mục kiến thức** = nhãn / điểm kiến thức. "Điểm cần chú ý" thành **"Mục cần chú ý"**; "hỏi lại điểm yếu" thành "hỏi lại mục còn yếu"; "Bảng nối Unit → mục kiến thức"; cột Giáo trình: "Unit này dạy mục kiến thức nào?".
- Trong ô chọn mục kiến thức (Giao bài, Ghi buổi, Chờ gắn nhãn…): "Tìm mục kiến thức", "+ Mục kiến thức khác", "Mục riêng", "— Chọn mục kiến thức —", "Đã chọn 3/3 (đủ). Bỏ một mục để chọn mục khác." "Nhãn" ở chỗ khác ("Chờ gắn nhãn", nhãn câu sai trong Hộp duyệt) giữ nguyên ở vòng này.
- Bộ đếm kỹ năng ở Hồ sơ cấp ("n/N **kỹ năng** đã vững") đếm kỹ năng, không phải mục kiến thức.
- Học sinh: chỉ một dòng đổi, `studentReviewCopy.intro` = "Ôn lại mấy mục này nhé." (câu ngắn, không số).
- Mã code không đổi tên (`tag_marks`, `point_*`, `weakPage`…). Test `tests/unit/copyKnowledgeItem.test.ts` canh: các khối chữ về mục kiến thức không còn chữ "điểm" ngoài các cụm điểm số ở trên.

## Mẫu báo lưu (13/11/2026)

Mọi ô sửa của người lớn dùng một mẫu: **"Đang lưu…"** → **"✓ Đã lưu lúc hh:mm"** (giờ Việt Nam, giữ nguyên tới lần sửa tiếp) → **"● Có thay đổi chưa lưu"**; lỗi: "Chưa lưu được. Thay đổi vẫn còn trên màn hình, bạn bấm Lưu lại nhé." Còn thay đổi chưa lưu thì đóng tab / tải lại hỏi lại, và bấm liên kết của khung (cột trái, thanh trên, "Đóng") hiện "Còn thay đổi chưa lưu. Rời trang thì mất các thay đổi này. Vẫn rời?". Khóa: `saveStatusCopy`, `busyCopy` trong `lib/copy/vi.ts`. Chữ ký hiệu (● ✓) đi kèm chữ, không chỉ màu.

## UX vòng 3A (14/11/2026)

Khóa mới trong `lib/copy/vi.ts` (chữ đã duyệt theo kế hoạch 14/11; đổi chữ = sửa ở đây và ở file đó):

| Khóa | Chữ |
|---|---|
| `shellCopy.sections.results` | Ghi kết quả |
| `shellCopy.inboxBadge(n)` (aria) | `{n} việc đang chờ duyệt` |
| `assignWaysCopy.title(alias)` · `intro` · `stripLabel` | Giao bài · {alias} · Chọn một cách giao. Cách nào cũng chọn được Unit của giáo trình (trừ Bài chủ đề). · Cách giao |
| `assignWaysCopy.recommended` · `choose` | Nên dùng · Chọn cách này → |
| `assignWaysCopy.ways.studio` | Đề + đáp án → bài trên app · Tải đề và đáp án (PDF hoặc Word). AI soạn nháp, {thầy/cô} duyệt; con làm ngay trên app, app tự chấm và ghi mục kiến thức của từng câu. · Hạn nộp chọn sau khi duyệt nháp. |
| `assignWaysCopy.ways.link` · `pdf` | Giao bằng link · Bài trên test-english, NotebookLM, Gemini… Con làm ở đó rồi nộp ảnh trang kết quả. / PDF để con tải về · Con tải đề về làm trên giấy rồi nộp ảnh hoặc file bài làm. |
| `assignWaysCopy.ways.topic` | Bài chủ đề trong app · (lời giới thiệu `inquiriesPage.intro`, có liên kết Góp ý về app) · Không dùng Unit. |
| `assignWaysCopy.fromBook(label)` · `seeStudio` · `seeTopic` · `listTitle` | Từ giáo trình: {label} — chọn cách giao bên dưới. · Bài đã tạo từ đề → · Bài chủ đề đã giao → · Bài link / PDF đã giao |
| `nonUnitCopy.giveLink` | Giao bài này → |
| `sessionStatsCopy.title` · `cards.*` | Tổng quan buổi học · Tổng số buổi / Buổi tháng này / Trung bình / tuần / Đang học đến |
| `sessionStatsCopy.perWeekHint` · `unitNone` · `perWeekNone` | 8 tuần trọn gần nhất · Chưa bắt đầu · — |
| `sessionStatsCopy.calendarTitle` · `weekdays` · `cellHas/cellNone/cellFuture` | 12 tuần gần đây · T2…CN · "{Thứ Năm 12/11/2026}: có buổi học · {U13 Unreal time}" / "…: không có buổi" / "…: chưa tới" |
| `sessionStatsCopy.monthTable.*` · `sameDay` · `rule` · `none` · `unreadable` | Theo tháng / Tháng / Số buổi / Các ngày / Sao chép / In · ⚠ 2 ghi chú cùng ngày · Một buổi = một ngày có ghi chú buổi học do thầy/cô ghi (ngày chỉ phụ huynh ghi hiện dấu "Phụ huynh ghi", không tính). Bản đã sửa chỉ tính bản mới nhất. · Chưa ghi buổi học nào. · Chưa đọc được thống kê buổi học. |
| `sessionMonthCopy.*` | Buổi học tháng {11/2026} · {alias} · {n} buổi · Sao chép danh sách / ✓ Đã chép / In · Ngày, Thứ, Unit đã dạy, Người ghi · (ghi chú riêng của {thầy/cô}) · câu Zalo: "{Nguyên} · Tháng {11/2026}: {5} buổi — {03/11, 05/11, …}." (tháng trống: "… chưa có buổi.") |
| `deskCopy.monthLine` · `monthLineNone` | Tháng {11}: {5} buổi · buổi gần nhất {12/11} · Tháng {11}: chưa có buổi · buổi gần nhất {28/10} |

Bỏ khóa `loadingCopy` (không dùng). Cột "Người ghi" dùng `todayPage.roleLabel` (Gia sư / Phụ huynh). Không có số tiền ở bất cứ chữ nào về buổi học.

## UX vòng 3B (14/11/2026) — buổi nghỉ, học bù, buổi tính phí

Khóa mới trong `lib/copy/vi.ts` (chữ theo bảng kế hoạch 14/11, phụ huynh đã duyệt hướng; chữ lỗi và gợi ý đi kèm là chữ nối, xem lại ở bản thử):

| Khóa | Chữ |
|---|---|
| `sessionKindCopy.label` · `regular` · `makeup` · `notCounted` · `mark` | Loại buổi · Thường · Học bù · Không tính · Đánh dấu |
| `sessionKindCopy.reason` · `makeupFor` | Lý do (bắt buộc khi Không tính) · Bù cho buổi nghỉ ngày |
| `sessionKindCopy.makeupForNone` · `save` · `cancel` · `strike` · `reasonNeeded` · `parentNoteHint` | Không chọn · Lưu dấu · Thôi · Không tính (trước lý do, ghi chú gạch ngang) · Cần ghi lý do (ít nhất 5 ký tự). · Ghi chú của phụ huynh không tạo ra buổi học dù đánh dấu gì. |
| `absenceCopy.add` · `listTitle` · `date` · `by` | Ghi buổi nghỉ · Buổi nghỉ · Ngày nghỉ · Bên báo nghỉ |
| `absenceCopy.byStudent` · `byTutor` · `byOther` | Con · {Thầy/cô} · Khác (lễ, thời tiết…) |
| `absenceCopy.billable` · `billableYes` · `billableNo` · `billableChoose` | Có tính phí buổi này không? · Có tính phí · Không tính phí · Bạn chọn buổi nghỉ này có tính phí hay không. |
| `absenceCopy.note` · `cancel` · `cancelReason` · `cancelConfirm` · `dismiss` · `none` · `dateHint` | Ghi chú · Bỏ ghi nghỉ · Lý do bỏ · Bỏ ghi nghỉ này · Thôi · Chưa ghi buổi nghỉ nào. · Chọn trong khoảng từ 120 ngày trước đến 60 ngày tới. |
| `absenceCopy.errors.*` | câu cho từng mã lỗi của SQL (`bad_date`, `reason_required`, `already_cancelled`, `bad_absence`, `not_current`, `kind_on_edit`, `client_id_reused`, `sessions_unavailable`…) |
| `sessionStatsCopy.monthTable.makeups` · `absences` · `billable` | Học bù · Nghỉ (con / {thầy/cô} / khác) · Buổi tính phí |
| `sessionBillingCopy.*` | `rule`: "Buổi tính phí = buổi đã học (thường + bù) + buổi nghỉ có tính phí − buổi bù cho một buổi nghỉ đã tính phí." · `unavailable`: "Phần buổi nghỉ / học bù chưa sẵn sàng (cần cập nhật cơ sở dữ liệu)." · `absenceDays`: Ngày nghỉ · chữ N / B của lịch · câu sao chép "· học bù n · nghỉ n (con, không tính phí) · tính phí n buổi" |
| `purgePage.countLabels.session_marks` · `session_absences` | Đánh dấu loại buổi học · Buổi nghỉ |

Không có chữ về số tiền, đơn giá hay chốt tháng.
