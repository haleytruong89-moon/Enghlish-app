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

### 3.2. Bậc năng lực (trạng thái) — phụ huynh, gia sư; học sinh chỉ thấy lời khen/việc tiếp theo (từ W4e: thêm **tên cấp CEFR đã xác nhận** và **tên điều đã làm được** ở Hành trình; **vẫn không** thấy thang này, bậc, ⚑)

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
| PRACTICE | Luyện tập (trước 22/11: "Luyện tập (có gợi ý)") | Bài luyện tập |
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

Mọi chữ lấy từ `studioCopy` / `resultCopy` / `studioInboxCopy` / `aiSettingsCopy` / `studioErrors` / `studioIssueText` trong `lib/copy/vi.ts`. Chữ cho con đi qua `resultCopy`; test `studioCopy.test.ts` quét điểm / x/y / %.

| Ngữ cảnh | Chữ | Ai thấy |
|---|---|---|
| Liên kết trên thẻ em, tiêu đề trang | Tạo bài từ đề | Phụ huynh, gia sư |
| Hai nút khi tạo | Cho AI đọc đề · Soạn tay | Phụ huynh, gia sư |
| Chờ AI | AI đang đọc đề… | Phụ huynh, gia sư |
| Màn Duyệt | Duyệt đề · Chỉ câu cần xem · Kỹ năng cả phần · Đáp án (theo file của thầy/cô) · Đáp án chấp nhận · Nhãn · Kỹ năng · Không có kỹ năng phù hợp · Thiếu đáp án | Phụ huynh, gia sư |
| Khung bên phải | Bài sẽ tạo: App tự chấm · Có thể cần thầy/cô xem · Tính bậc kỹ năng · Chỉ tín hiệu (nhãn) · Khung đề giấy | Phụ huynh, gia sư |
| Giao bài | Giao bài · Ngày làm · Hạn nộp | Phụ huynh, gia sư |
| Con xem lại bài | **Đã thay ở W4c2** (xem mục "W4c2" cuối tệp): "Nên là" / "Vì sao" **không còn** hiện cho con. **Không bao giờ** điểm, x/y, số câu đúng | Học sinh |
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

## W4a (14/11/2026) — Lộ trình mốc và Hành trình

Khóa mới trong `lib/copy/vi.ts`: `roadmapCopy.*` (trang Lộ trình của thầy/cô: mốc, đỉnh, đề xuất, giáo trình chính, lỗi theo mã SQL), `journeyCopy.*` (trang của con: tiêu đề, tóm tắt "Còn N Unit tới …", đỉnh chưa đặt tên "Đỉnh của bạn — {thầy/cô} sẽ đặt tên", danh sách thay thế), `monthLabel`, `practiceStudent.navJourney` ("Hành trình"), `pendingCopy.kinds.milestone` / `need.milestone` / `groups.roadmap`, `deskCopy.roadmapLine`, `deskCopy.alerts.orphanTitle` / `orphanLine`, `purgePage.countLabels` cho hai bảng mới.

Quy tắc: xưng "bạn" với con; "thầy/cô" qua `tutorHonorific`, không viết cứng; con không thấy chữ điểm, mức dạng số, x/y, %, nhãn kỹ năng (ngoại lệ W4e: tên cấp đã xác nhận, tên điều đã làm được).

## W4b (15/11/2026) — Bàn học của con: Hôm nay · Đã xem · Đã làm

Khối `studentDeskCopy` trong `lib/copy/vi.ts`. Xưng "bạn"; người dạy luôn là `tutorHonorific` (**tên mục là "Đã xem", không "Cô đã xem"**; không viết cứng "cô"). Số con được thấy chỉ là việc của chính con (số việc, câu đã trả lời, bài đã nộp), bọc trong `data-count="work"`; không số câu đúng / sai, %, điểm. Chữ "điểm" **không xuất hiện** trên màn của con (kể cả để nói là không có).

| Chỗ | Chữ |
|---|---|
| Tab | Hôm nay · Đã xem · Đã làm · Hành trình; dấu "Mới" (kèm số, `aria-label` "n lời nhắn mới") |
| Hôm nay | "Chào {tên}!" · "Còn n việc · khoảng m phút" · "Xong hết việc rồi 🎉 Nghỉ ngơi nhé. {Thầy/cô} sẽ giao thêm bài sớm thôi." · nhóm "Làm cùng {thầy/cô}" + "Những việc này làm trên giấy hoặc trong buổi học, không làm trong app." · nhóm "Vừa gửi" + "Bạn đã gửi hôm nay. {Thầy/cô} chưa xem, nên bạn vẫn sửa lại được." · nhãn chế độ "Luyện tập (có gợi ý)" / "Bài tự làm" và "Ôn lại bài cũ" · "Làm tiếp" / "Việc tiếp theo" · "a/b câu" · "Việc cần làm" · "Hạn Thứ Sáu 20/11" · "Hỏi gia sư · Sắp có" + "Sắp có — gia sư sẽ gợi ý từng bước, không làm hộ. Chỉ có ở bài luyện tập, không có ở bài kiểm tra." · "{Thầy/cô} nhắn" · "{Thầy/cô} xem bài và nhắn lại cho bạn: điều bạn làm tốt và điều cần sửa." |
| Loại việc | Bài trên app · Bài chủ đề · Đề giấy · Bài link · Sửa bài |
| Đã xem | "{Thầy/cô} xem bài xong là lời nhắn hiện ngay ở đây: điều bạn làm tốt và điều cần sửa." · "{Thầy/cô} khen" · "Cần sửa" · "Chỗ này trong bài của bạn:" · "Sửa bài" · "Đã gửi bản sửa · chờ {thầy/cô} xem" · "Bài này không cần nộp lại — đọc lời {thầy/cô} là được." · "{Thầy/cô} đã xem bài này." · "Ôn lại mấy mục này" · "Xem các bài cũ hơn" |
| Đã làm | "Tất cả (n)" · "Chờ {thầy/cô} xem (n)" · "{Thầy/cô} đã xem" · "Nộp {ngày} · làm lần đầu / làm lại · có / không xem gợi ý" · "{Thầy/cô} ghi lại bài này" · "Xem lại" · "Bạn chưa nộp bài nào. Bài nộp xong sẽ hiện ở đây." · bộ lọc chỉ lọc các bài đã tải (20 bài mới nhất mỗi trang): nếu mục lọc trống mà còn bài cũ hơn thì hiện "Chưa thấy bài nào ở mục này trong các bài mới nhất. Bấm \"Xem các bài cũ hơn\" để tìm tiếp." (còn không: "Không có bài nào ở mục này.") |
| Chưa áp 0032 | "Bàn học chưa mở được. {Thầy/cô} sẽ báo khi sẵn sàng." |

Đã bỏ khóa `practiceStudent.navNext` / `navPractice` / `navJourney` (thay bằng `studentDeskCopy.tabs`).

---
## W4c1 (15/11/2026) — Nộp bài giấy, bài link, góp ý bài nộp

Bốn khối trong `lib/copy/vi.ts`: `submitScreenCopy` (khung chung: các bước, "Gửi", "Còn thiếu", báo lỗi), `paperSubmitCopy` (chụp / chọn file, lưới trang, xoay · xóa · lên · xuống, "Tối đa 12 trang"), `linkSubmitCopy` (3 bước, ảnh trang kết quả), `submissionFeedbackCopy` (form của người lớn: khen · điều cần sửa · báo lỗi). Thêm `practiceStudent.goSubmit` / `goSubmitPdf` / `errors.pages_unavailable`, `resultPage.sentHintPdf` / `sentNoHintPdf`, `assignPage.sentLine(kind)`, `purgePage.countLabels.submission_feedback` ("Góp ý cho bài nộp").

Luật: xưng "bạn"; người dạy là `tutorHonorific`; không điểm / đúng / sai / % / kỹ năng trên màn của con (test `submitCopy.test.ts` quét); nút chạm ≥ 44 px; câu hỏi chính là "Bạn làm lần đầu?" và câu gợi ý (hỏi cả bài PDF); màn "Nộp thay" của người lớn có thêm "Không rõ" cho câu gợi ý; nút **Nộp** tắt cho đến khi đủ ảnh và 2 câu trả lời, dòng "Còn thiếu" nói rõ thiếu gì; đổi thứ tự bằng nút **Lên / Xuống** (không kéo thả); lỗi mạng dùng một dòng "gửi lại không mất ảnh". Góp ý của người lớn: lời khen ≤ 400 chữ, tối đa 3 điều cần sửa ≤ 300 chữ mỗi điều, không từ chấm điểm.

---
## W4c2 (15/11/2026) — Làm bài từng câu · màn sau khi nộp (S-10) · "Thử lại câu này" · cờ "Bài kiểm tra"

Bốn khối trong `lib/copy/vi.ts`: `playerCopy` (làm bài), `resultCopy` (sau khi nộp), `retryCopy` (thử lại một câu), `testMarkCopy` (cờ khi giao, người lớn). Đã **bỏ** `studioStudentCopy` (Nên là / Vì sao / Câu cần xem lại / Làm lại). Xưng "bạn"; người dạy là `tutorHonorific`; không điểm, không đáp án, không giải thích, không số câu đúng.

| Chỗ | Chữ |
|---|---|
| Làm bài | "Luyện tập" / "Bài kiểm tra" · "Thoát" (hiện "Thoát · bài đã được lưu" chỉ khi đã lưu xong; chưa lưu được: "Thoát, bài chưa được lưu") · "a/b câu" (trong `data-count="work"`) · "Câu n · Điền vào chỗ trống / Chọn đáp án / Trả lời ngắn" · "Câu trước" · "Câu tiếp" · "Xem lại và nộp" · "Đang lưu…" · "Đã lưu" · "Trước khi nộp" · "Bạn chưa trả lời câu 3, 5. Bạn vẫn nộp được, hoặc quay lại làm tiếp." · "Nộp bài" |
| Bài kiểm tra | "Bài kiểm tra: tự làm, không có gợi ý. Cứ làm hết sức mình — {thầy/cô} cần thấy bạn tự làm được đến đâu." |
| Bài luyện tập | ô mờ "Hỏi gia sư · Sắp có" (không bấm được) + "Sắp có — gia sư sẽ gợi ý từng bước, không làm hộ. Chỉ có ở bài luyện tập, không có ở bài kiểm tra." (không có ở bài kiểm tra) |
| Sau khi nộp | "Bạn đã nộp bài · {thầy/cô} sẽ xem" · "Mấy câu bạn nên nhìn lại" (bài kiểm tra: "Mấy câu {thầy/cô} sẽ xem lại cùng bạn") · "Bạn trả lời: “…”" / "Bạn chưa trả lời câu này." · "Câu viết tự do" + "{Thầy/cô} sẽ đọc câu này" · "Các câu còn lại: ổn" (một dòng, **không số**) · "Về Hôm nay" · "Xem trong Đã làm" · "Làm lại cả bài" (chỉ bài luyện tập) |
| Bài kiểm tra, sau khi nộp | "Bài kiểm tra: {thầy/cô} sẽ chữa cùng bạn." + "Bạn chưa cần làm gì thêm." (không thử lại) |
| Thử lại | "Thử lại câu này" → ô nhập → "Gửi cho {thầy/cô}" · "Để sau"; gửi rồi: "Lần thử lại của bạn: “…”" + "Đã gửi lần thử lại cho {thầy/cô}" (app **không** nói đúng hay sai) |
| Giao bài (người lớn) | Ô "Loại bài": Luyện tập · Bài kiểm tra + một dòng giải thích ("Cách app đếm bằng chứng không đổi") |

| Người lớn thấy lần thử lại | Chờ duyệt: "Thử lại" · "Con thử lại n câu"; trang "Cần thầy/cô xem" có mục "Con thử lại": "Đọc lần thử lại của con rồi bấm Đã xem." · "Lần đầu: …" · "Thử lại: …" · ô "Ghi chú (không bắt buộc, chỉ người lớn thấy)" · "Con không thấy ghi chú này." · nút **Đã xem** (chỉ nút này làm dòng hết chờ) |
| Con (S4, S5) | "Mỗi câu bạn được thử lại một lần. {Thầy/cô} sẽ thấy lần thử của bạn. App không hiện đáp án." · tiêu đề câu viết tự do: "Câu {thầy/cô} sẽ đọc" |

Luật: cờ "Bài kiểm tra" **chỉ đổi giao diện** (không thử lại, không ô hỏi gia sư, chữ khác); không đổi `mode`, không đổi cách S7a / điểm kiến thức đếm. Lần thử lại **không phải bằng chứng** (không engine nào đọc).

### D39 (15/11) — đáp án sau lần thử lại, chỉ bài luyện tập của bộ Studio
- **Con:** "Từng câu" · "✓ Đúng" / "✗ Chưa đúng" / "{Thầy/cô} sẽ đọc câu này" (hộp xanh / đỏ / cam: màu **và** chữ) · câu ✗: "Thử lại câu này" hoặc "Xem đáp án" · sau lần thử: "Lần thử lại: ✓ đúng / ✗ chưa đúng" rồi "Đáp án: …" và "Vì sao: …" · câu ✓: "Vì sao" thu gọn · không "Các câu còn lại: ổn", không tổng / % / điểm · không "Làm lại cả bài" khi đã hiện đáp án (nếu vẫn nộp được từ tab khác: "Bạn đã xem đáp án của bài này nên không làm lại cả bài được. Bạn mở lại trang chủ nhé."). Dòng "Bạn đã nộp bài này lúc 15:05 ngày 15/11/2026." có cả ngày. Bài kiểm tra: như cũ ("{thầy/cô} sẽ chữa cùng bạn").
- **Thầy/cô:** màn bài làm: chip "✓ Đúng" (xanh) · "✗ Sai" / "✗ Để trống" (đỏ) · "⏳ Chờ thầy/cô xem" (cam); bộ lọc "Tất cả" / "Chỉ câu sai và cần xem"; thẻ "Con thử lại" ghi "Con chọn Xem đáp án, không thử lại" khi không thử lại; dòng Chờ duyệt "Con thử lại n câu · Con xem đáp án m câu".

## W4d (15/11/2026) — Mục tiêu tuần · chuỗi tuần mềm · thành tích

Bốn khối trong `lib/copy/vi.ts`: `weeklyGoalCopy` (con), `streakCopy` (con), `achievementsCopy` (con), `goalDeskCopy` (người lớn). Xưng "bạn"; người dạy là `tutorHonorific`; test canh chữ (`tests/unit/weeklyGoalCopy.test.ts`): không "điểm", "xếp hạng", "streak", "%", "quá hạn"; không gọi cứng "cô" / "thầy"; mỗi câu ≤ 15 chữ.

| Chỗ | Chữ |
|---|---|
| Hôm nay | chip "🔥 n tuần liền" (chỉ từ tuần thứ nhất của chuỗi; có `aria-label` "Chuỗi n tuần liền đạt mục tiêu. Mở Hành trình") · thẻ "Mục tiêu tuần" 09/11 – 15/11 · "a/b bài" (trong `data-count="work"`) · "Chỉ tính bài bạn đã nộp — mở app không tính." · chưa có mục tiêu: "Bạn chưa có mục tiêu tuần" + "Đặt mục tiêu tuần" |
| Đặt mục tiêu tuần | "Mỗi tuần bạn muốn nộp bao nhiêu bài?" · các ô số (nhẹ nhàng / vừa phải / đều đặn / chăm hơn) · "Gợi ý: Mấy tuần gần đây bạn nộp 2–3 bài mỗi tuần." (không có câu này khi chưa có tuần nào) · "Gửi {thầy/cô}" · đang chờ: "Chờ {thầy/cô} đồng ý" + "Rút lại" · đã đồng ý: "{Thầy/cô} đã đồng ý: n bài/tuần. Áp dụng từ tuần sau." |
| Hành trình | thẻ "Mục tiêu tuần" (tuần này, "Còn n bài nữa" / "Bạn đã đạt mục tiêu tuần này", "Chờ … đồng ý" hoặc "… · từ tuần sau", dòng chuỗi "🔥 Chuỗi: n tuần liền đạt mục tiêu" hoặc "Chưa có chuỗi. Nộp đủ bài của tuần này để bắt đầu.") · "Bộ sưu tập thành tích": "Chỉ có cột mốc thật — không có xu, không có thưởng." · "Đã đạt" (có ngày) · "Sắp đạt" (3 mục gần nhất, ghi còn thiếu gì) |
| Luật nói với con | "Một tuần “đạt” khi bạn nộp đủ số bài đã chọn. Chuỗi tuần là các tuần đạt liên tiếp. Mục tiêu mới áp dụng từ tuần sau. Lỡ một tuần thì chuỗi tính lại từ tuần sau, không sao cả." (không phạt, không "mất chuỗi") |
| Người lớn | Bàn làm việc: hộp "Mục tiêu tuần" · "Tuần này 2/4 bài · chuỗi 3 tuần" · đề xuất: "Con đề xuất n bài mỗi tuần" + "Nếu đồng ý, mục tiêu bắt đầu thứ Hai dd/mm. Tuần đang chạy giữ mục tiêu cũ." · nút **Đồng ý n bài/tuần** / **Điều chỉnh** (thầy/cô); phụ huynh: "Đang chờ {thầy/cô} của con đồng ý. Phụ huynh chỉ xem." · Chờ duyệt: loại "Mục tiêu tuần" |

Bổ sung (sau review): sau khi thầy/cô **điều chỉnh** số bài, con thấy "{Thầy/cô} đã chỉnh: n bài/tuần. Áp dụng từ tuần sau." (không phải "đã đồng ý"). Chờ duyệt có nhóm riêng "Mục tiêu tuần". Khối `workWeekCopy` (người lớn nộp thay): ô "Tuần làm bài" · "Tuần này" (mặc định) / "Tuần trước" (chỉ hiện thứ Hai–thứ Ba) · "Con làm bài vào tuần nào? Thứ Hai và thứ Ba bạn chọn được “Tuần trước” nếu con làm bài hôm Chủ nhật hay những ngày trước. Bài chỉ tính vào một tuần, theo mục tiêu tuần của con." · hộp mục tiêu sau khi lưu: "Đã lưu. Mục tiêu mới bắt đầu thứ Hai dd/mm."

Khác với kế hoạch: bỏ chữ "điểm thưởng" (e2e cấm chữ "điểm" trên trang của con) → "không có thưởng".

## W4e (16/11/2026) — Cấp theo mảng · Những điều mình đã làm được · Ngày ấy – bây giờ

Ba khối cho con trong `lib/copy/vi.ts`: `levelsStudentCopy`, `candoCopy`, `thenNowCopy` (cộng `achievementsCopy` có thêm `cando_n`), và một khối cho người lớn `thenNowPickerCopy`. Xưng "bạn"; người dạy là `tutorHonorific`; test canh chữ (`tests/unit/growthCopy.test.ts`): không "điểm", "%", "đạt", "xếp hạng"; câu ≤ 15 chữ. Cấp là **tên** ("B2", "B1+"), không số, không so với em kia, không chữ "đạt" (rủi ro: "B1+" bị hiểu như điểm → chữ nói rõ "do {thầy/cô} xác nhận").

| Chỗ | Chữ |
|---|---|
| Hành trình · thẻ cấp | "Cấp hiện tại theo mảng" · "Cấp do {thầy/cô} xác nhận · dd/mm" · mỗi ô: tên mảng + "B2" (hoặc "{Thầy/cô} chưa xác nhận") · chân thẻ "Tên cấp để bạn biết mình đang ở đâu. Không so với ai, không phải kết quả của một bài." · chưa mảng nào xác nhận: "{Thầy/cô} chưa xác nhận cấp nào. Khi xác nhận, cấp sẽ hiện ở đây." · **không có mảng Tư duy** |
| Hành trình · điều đã làm được | "Những điều mình đã làm được" · "Mỗi điều là một việc {thầy/cô} đã thấy bạn tự làm được. Bài làm của bạn là bằng chứng." · "n điều" · mỗi thẻ kỹ năng "Mình đã tự làm được: {tên}", mục kiến thức "Mình đã nắm chắc: {tên}" + "Mới · {Thầy/cô} xác nhận dd/mm" (Mới = trong 7 ngày) · chưa có: "Chưa có điều nào. {Thầy/cô} sẽ xác nhận khi thấy bạn tự làm được một việc." |
| Hành trình · Ngày ấy – bây giờ | "Ngày ấy – bây giờ" · "Hai đoạn viết của chính bạn. {Thầy/cô} chọn để bạn tự thấy mình đã đi xa." · "{Thầy/cô} chọn" · "Ngày ấy · dd/mm" / "Bây giờ · dd/mm" · "{Thầy/cô} nhắn: …" · chưa chọn hoặc đã ẩn: **không hiện thẻ** |
| Thành tích mới | ✋ "n điều tự làm được" (n = 5, 10, 20) · chưa đạt: "Còn k điều nữa (đã có m)" |
| Người lớn · Hồ sơ cấp · khối "Ngày ấy – bây giờ" | "Chọn hai bài viết của {em} trên app để em tự thấy mình đã tiến bộ. Bài "ngày ấy" phải nộp trước bài "bây giờ" ít nhất một ngày." · ô "Ngày ấy (bài cũ)" / "Bây giờ (bài mới)" · "Lời nhắn cho em (tối đa 200 ký tự, không ghi điểm)" · **Lưu lựa chọn** · **Ẩn thẻ với em** · phụ huynh: "Chỉ {thầy/cô} của em chọn. Phụ huynh chỉ xem." · lời nhắn ghi điểm: "Lời nhắn không được ghi điểm, phần trăm hay xếp loại." |

Khác với kế hoạch: câu giới thiệu "Mỗi điều là một việc {t} đã thấy bạn tự làm được, có bài làm làm bằng chứng." (18 chữ) tách thành hai câu để đủ ≤ 15 chữ (test canh chữ); thẻ cấp **không có "Hướng tới"** (bỏ sau review; để sau nếu có cấp mục tiêu riêng). Ô chọn của người lớn gắn nhãn "bài giấy gõ lại" cho bài do thầy/cô gõ lại.

## 0037 (21/11/2026) — Góp ý cho bài làm trên app · Unit của bài

- `studioFeedbackCopy` (trang xem bài, người lớn): dùng lại các nhãn của `submissionFeedbackCopy` (Góp ý cho con · Khen · Cần sửa…); chỉ đổi lời giới thiệu ("Đây chỉ là lời nhắn: không yêu cầu con làm lại bài") và lỗi `feedback_unavailable` (cần 0037), `not_found`, `attempt_replaced`.
- `studioAssignedCopy`: `openWork` "Xem cả bài làm" (trước 0037) / `openWorkFeedback` "Xem cả bài làm · góp ý"; `units` "Unit U13, U14"; `feedbackGiven` "Đã góp ý".
- `studioCopy.assignUnits` "Unit của bài (không bắt buộc)" / "Unit của bài: U14"; `assignUnitsHelp` nói rõ app chỉ **đề xuất** "Đang học" khi đã có bài nộp, người lớn bấm.
- `curriculumCopy.workProposeTitle` "Đã có bài nộp cho các Unit này" (không ghi "con": bài người lớn nộp thay cũng tính), `workProposeHelp` xưng "bạn" (thầy/cô và phụ huynh đều bấm được), `workProposeLine` "U14 · tên bài, tên bài + n bài".
- `studioErrors`: `units_need_update` (cần 0037), `bad_units`, `client_id_reused`.
- Con thấy ở Đã xem: câu khen + điều cần sửa như góp ý bài nộp (không tên người viết, không điểm).

## E1 (21/11/2026) — Nút "Hỏi" (gia sư AI) trong bài luyện

- **22/11: tắt trong bài theo mặc định** (`TUTOR_IN_WORK`). `testMarkCopy.hintPractice` không còn hứa "Hỏi" khi làm bài; `tutorCopy.errors.tutor_off` cho tab mở từ trước. Phụ huynh quyết 22/11: nhãn của con `modeLabels.PRACTICE.student` đổi thành "Luyện tập" (bỏ "(có gợi ý)"); đoạn mô tả gia sư AI ở Cài đặt AI (nằm trong văn bản đồng ý) sửa cùng mục "Gia sư" mới (E2).
- `tutorCopy`: tên "Gia sư" (không "cô", không TOMO; T4), nút "Hỏi" → "Gợi ý tiếp", "Gợi ý n/3", lời nhắc "Gia sư gợi ý từng bước, không đưa đáp án."; ô hỏi ngắn "Hỏi gia sư về câu này (không bắt buộc)".
- Câu cố định (không AI): `passage` (câu có bài đọc, 0040: gợi ý cách tìm trong bài, không nội dung), `no_answer` (câu mở), `daily_limit` (nhắc tự làm + "Xem đáp án" sau khi nộp), `missing_part` (G8, hỏi thầy/cô), `max_level`, `ai_off` ("Gia sư đang nghỉ"), `ai_error`. Câu an toàn `safe` / `plain` theo ngôn ngữ của track (`vi` / `en_first`).
- Không chữ "điểm", không đúng / sai trước khi nộp, không số câu đúng; xưng "bạn".
- `aiSettingsCopy`: `capTitle` / `capLabel` "Hạn mức (USD, tối đa 50)" / `softLabel` / `capSave` / `capInvalid`; `reconsent` (bản đồng ý mới có phần gia sư AI); `tutorLine` "An: hỏi gia sư AI n lượt hôm nay · m lượt tháng này"; `points` nói rõ câu hỏi con gõ được gửi cho AI, không kèm tên.
- `studioErrors`: `bad_cap`, `cap_needs_update` (cần 0039).

## E2a (23/11/2026) — Gia sư + Sổ tay

- Tab của con: `studentDeskCopy.tabs.tutor` "Gia sư", `.notebook` "Sổ tay" (chỉ hiện khi đã áp 0041).
- `tutorPageCopy`:
  - `title` "Gia sư";
  - `watched` "Mẹ và thầy/cô xem được câu bạn hỏi ở đây để giúp bạn." (D-G8, luôn hiện);
  - `tabWord` "Tra từ", `send` "Tra";
  - `off` (chưa đồng ý v3 / AI tắt), `left(n)` (số lượt còn trong `data-count="work"`);
  - `errors` và `fixed` (hết lượt, từ chặn, chưa soạn được thẻ, không thấy từ).
- `vocabCardCopy`: khối theo khuôn §4.5 "🤔 Đoán trước" · "Xem luôn" · "💡 Bản chất" · "📌 Nắm nhanh" · "❓ Vì sao" (+ "So với tiếng Việt:", "⚠️ Bẫy hay gặp:") · "🔗 Liên quan" · "✏️ Tự kiểm" · "🎯 Đến lượt bạn"; "+ Lưu vào Sổ tay" / "Đã lưu vào Sổ tay ✓" / "Đã có trong Sổ tay ✓"; "Chưa hiểu, giải thích cách khác"; 😊 / 😐 / 😕 (nhãn "Dễ hiểu" / "Tạm được" / "Chưa hiểu").
- `notebookCopy`: "Sổ tay", tab "Từ vựng", ô lọc, "Bỏ khỏi Sổ tay" (hỏi lại "Bỏ từ này khỏi Sổ tay?"), "Đã bỏ (n)" + "Thêm lại".
- `tutorAsksCopy` (người lớn): "Con hỏi Gia sư", bảng Lúc · Loại · Con gõ · Gia sư trả lời · Sổ tay · Con chấm; "thẻ có sẵn".
- `aiSettingsCopy` (bản đồng ý `ai-studio-tutor-v3`): `intro`, `points[1]` (Gia sư là mục riêng, không có trong bài làm; câu con hỏi được lưu, mẹ và thầy/cô đọc được), `reconsent`.
- Con không thấy chữ "điểm", tổng số câu đúng, %; Tự kiểm chỉ ✓ / ✗ từng câu + một dòng vì sao.

## Bài đã giao · PR 1 (24/11/2026) — Gỡ bài · Khôi phục · Quá hạn n ngày

- `studioAssignedCopy.status.skipped` đổi "Đã bỏ qua" → "Đã gỡ".
- `remove` "Gỡ bài" (chỉ bài con CHƯA nộp), `removeTitle`, `removeHelp` (nói rõ con không còn thấy bài, hết báo quá hạn, khôi phục được), `reasonLabel` "Lý do gỡ bài", `reasonPlaceholder`, `reasonRequired`, `confirmRemove`, `cancel` "Thôi", `saving`, `failed`.
- `restore` "Khôi phục"; lý do ghi sẵn `restoreReason` "Khôi phục bài đã gỡ".
- `overdueDays` "Quá hạn n ngày" thay cho "Quá hạn" ở danh sách người lớn. Con không bao giờ thấy chữ quá hạn.
- `removedReason` "Lý do gỡ: …".

## Bài đã giao · PR 2 (24/11/2026) — mục mới · Giao bài chỉ để tạo bài

- `shellCopy.sections.assigned` / `appFeedback.screens.assigned` "Bài đã giao"; `appFeedback.screens.inquiries` đổi thành "Bài chủ đề đã giao" (để góp ý về app phân biệt hai trang). Bỏ `assignWaysCopy.seeTopic`, `assignWaysCopy.listTitle` (không còn dùng).
- `assignedBoardCopy`: `title` "Bài đã giao · Nguyên", `intro`, `newWork` "+ Giao bài mới", `tab` (Cần thầy/cô xử lý · Con đang làm · Đã xong · Đã gỡ), `tabCount` "… · n", `hint` (một câu mỗi tab nói tab đó là gì), `empty` (mỗi tab), `studioList` "Bài trên app", `practiceList` "Bài link / PDF", `topicLink`.
- `assignWaysCopy.followBanner` "Muốn xem con làm đến đâu, bài nào quá hạn?", `followLink` "Mở Bài đã giao →", `draftsTitle` "Bản nháp đang soạn · n", `draftsHelp`.
- `studioAssignedCopy.duplicateWarning` (cảnh báo giao trùng, không chặn); `openWorkToFeedback` "Xem bài và góp ý", `openWorkFed` "Xem bài · đã góp ý", `feedbackGiven` "đã góp ý", `noFeedbackYet` "chưa góp ý" (thay `openWorkFeedback`).


## L1 · "Xong một bài" (26/11/2026) — Chấm và góp ý

- Tên màn: **Chấm và góp ý**. Nút cuối: **Xong bài · gửi góp ý cho con** (chưa đủ điều kiện: "Chấm nốt câu chờ và viết góp ý để xong bài"). Bài tiếp: "Sang bài tiếp: <tên bài> ›".
- Trạng thái từng câu: "Đúng · app chấm", "Sai · app chấm", "Bỏ trống", "Chờ thầy/cô", "Đúng · thầy/cô chấm", "Sai · thầy/cô chấm", "Chỉ trên giấy · không tính", "Chưa chấm được · không tính".
- Điểm chỉ người lớn thấy, dạng "đúng/đã chấm"; chưa có câu nào chấm thì "–" (không bao giờ "0/0"). Lời đánh giá: "Cần chữa cùng con" (< 50 %), "Tạm được", "Tốt" (≥ 80 %) — cùng ngưỡng của Việc nên làm (phụ huynh duyệt 25/11). Lần làm lại: "không tính vào tổng", không gọi là "điểm chính thức".
- Gợi ý góp ý do app soạn từ câu sai, ghi rõ "app soạn sẵn, không dùng AI"; chỉ lời, không phân số, không "%", không "điểm" (cùng luật chữ dạng điểm). Dạng: "Phần E · So sánh: xem lại câu 11, 12." / "Phần A: con làm đúng hết, rất chắc tay."

## L2 · Tiến độ tự chạy (26/11/2026)

- Nhãn trên Unit do app đặt: **"App đặt theo bài nộp · dd/mm"**. Dòng luật ở đầu trang Trạng thái Unit: con nộp bài → app đặt "Đang học"; "Đã học" do thầy/cô bấm; app không tự hạ; người lớn đổi thì người lớn thắng.
- Thẻ Việc nên làm: **"U15 có thể đánh dấu Đã học"**, dòng giải thích ghi số bài, "đã chấm hết", tỉ lệ lần làm đầu và câu "App không tự đặt Đã học". Nút: **"Đánh dấu Đã học"**, liên kết "Xem Trạng thái Unit". Con không thấy thẻ này, không thấy số.

## Hướng B · PR1 (26/11/2026) — cột trái mới, Bài tập

- Tên mục: **Hôm nay · Bài tập · Buổi học · Tiến bộ · Kế hoạch · Hồ sơ học sinh**. Ba nút việc chính: **Chấm bài · Giao bài · Ghi buổi học**.
- Tab Bài tập: **Cần chấm · Con đang làm · Đã xong · Bản nháp**. "Đã gỡ" chỉ là liên kết "Xem bài đã gỡ (n)". Nhóm bản nháp viết "Unit 15" (không viết "U15"), và nhóm đứng đầu có nhãn **Kế tiếp**.
- Nhãn đọc màn hình của số trên nút Chấm bài: "n bài con đã nộp đang chờ chấm". Chưa đọc được số thì không hiện số, không bao giờ hiện 0.

## Hướng B · PR2–PR3 (26/11/2026) — Tiến bộ, Hồ sơ học sinh, Hôm nay

- **Tab Tiến bộ:** Tổng quan · Theo Unit · Mục kiến thức · Cấp và kỹ năng.
- **4 ô số:** "Bài nộp · 4 tuần", "Đúng lần đầu · 4 tuần", "Chờ chấm", "Đang học".
  - Chênh lệch viết "tăng / giảm n điểm % so với 4 tuần trước".
  - Số chưa có viết "—".
- **Hôm nay:**
  - Ô "Việc khác · n": việc chờ không phải chấm bài.
  - Dòng "n bài con nộp chờ chấm → Bài tập › Cần chấm".
  - "Xem thêm n việc nên làm".
- **Trang danh sách đầy đủ:** "Việc chờ · tên em".
- **Hồ sơ học sinh:** mục con "Đầu vào và ghi chú dạy học".

## Hướng B v2 (26/11/2026 tối) — bản nháp theo Unit

- Khối đầu: "Sẵn sàng giao · n", nhãn "đã duyệt, chưa giao". Nút "Giao →"; nhãn cho trình đọc màn hình: "Giao bài “tên bài”".
- Nhóm: "Unit 15", "Review và Progress Test", "Bài khác". Nút trên mỗi dòng: "Duyệt" (bản nháp), "Mở" (AI đang đọc / chưa đọc được).
- Giao bài: "Tạo bài mới", "+ Tạo bài mới (4 cách)".

## Bản 3 (26/11/2026 tối) — hàng chờ chấm, mở bài để chữa, Ghi buổi
- Hàng chờ: `finishCopy.queueTitle(n)` "Còn n bài con nộp cần chấm hoặc góp ý", `queueWhy`, `queueWaited(d)` ("chờ d ngày" / "nộp hôm nay"), `queueEmpty`; đọc lỗi: `queueUnknown` (không bao giờ nói "không còn bài"); bài đang mở đã xong: `queueNextOldest`. Không nói "điểm", không so hai em.
- Thẻ gợi ý: `resultsCopy.openFix(part)` "Mở phần E để chữa →" (không có phần: "Mở bài để chữa →").
- Buổi học: `notesPage.writeNew` "✎ Ghi buổi học hôm nay" + `writeNewHint`; `absenceAction` "Ghi buổi nghỉ" + `absenceHint`; khung gập `sessionBillingCopy.foldTitle(n)`.

## Q5 (26/11/2026) — Ghi buổi còn 3 ô
- `sessionNotePage.moreTitle` "Thêm chi tiết (không bắt buộc)"; `moreLine(kind, skills, weak, parentNote)` nói đang chọn gì, không nói "điểm".
- `makeupHint(n)` + `makeupHintButton` "Đánh dấu học bù"; `recheckCount(n)`; `taughtPreset`; `sessionKindCopy.regularSession` "Buổi thường".
