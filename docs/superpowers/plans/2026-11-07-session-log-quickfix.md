# Sửa nhanh "Ghi buổi học" (đợt 1) — kế hoạch

Ngày: 07/11/2026 · Nhánh: `feature/session-log-quickfix` · Trạng thái: **phụ huynh duyệt kế hoạch 07/11** (Q1 = giữ 3, Q2 = không chép "Hôm nay học")
Model: kế hoạch + review cuối = Opus · code = Sonnet (`builder`).

## 1. Vì sao làm

Ngày 05/11 hai gia sư góp ý màn "Ghi buổi học" (ảnh chụp phiếu góp ý):
- Chọn "kỹ năng đã luyện" khó: có cảm giác chỉ chọn được 1, tìm phải gõ đúng dấu.
- "Điểm cần củng cố" cũng vậy.
- An học SGK trên lớp và Cambridge xen nhau, không biết ghi vào đâu. **Phần này để cho bàn làm việc mới** (giáo trình riêng), không làm trong đợt này.

Gia sư đang dùng màn này hằng ngày. Đợt này chỉ sửa cho dễ dùng hơn, **không đổi dữ liệu, không có migration**.

## 2. Đã kiểm tra trong code

| Hiện tượng gia sư thấy | Nguyên nhân trong code |
|---|---|
| Tìm phải gõ đúng dấu | `DomainTabs` so `itemText.toLowerCase().includes(q)`: "dieu kien" không khớp "điều kiện" |
| "Chỉ chọn được 1" kỹ năng | Code cho chọn tối đa **30** (`MAX_PRACTISED_PER_NOTE`), nhưng **không có dòng "Đã chọn (n)"** và không có danh sách đã chọn. Khi đang tìm, chọn xong không thấy tổng số → dễ tưởng chỉ được 1. Cần hỏi lại gia sư ở buổi 30 phút để chắc |
| Điểm cần củng cố khó chọn | Cùng ô tìm (phải đúng dấu). Giới hạn **3** điểm nằm cả trong cơ sở dữ liệu (`0014`: `cardinality(weak_tag_keys) <= 3`) |
| Buổi nào cũng chọn lại từ đầu | Không có cách lấy lại lựa chọn của buổi trước. `loadLastNote` chưa đọc `practised_target_ids` (cột đã có từ `0017`) |

## 3. Thay đổi

1. **Tìm không cần dấu** — hàm mới `lib/text/fold.ts` → `foldVi(s)`: chuẩn hóa NFD, bỏ dấu, `đ → d`, chữ thường, gộp khoảng trắng. `DomainTabs` dùng hàm này cho cả từ gõ vào và tên mục / tên nhóm. Sửa một chỗ thì mọi ô chọn **có ô tìm kiếm** (`DomainTabs`) cùng được: Ghi buổi học (kỹ năng + điểm cần củng cố), duyệt bài viết (nhãn), giao bài luyện. Ghi kết quả bài và Studio dùng danh sách thường (không có ô tìm kiếm) nên không đổi.
2. **"Kỹ năng đã luyện" có dòng "Đã chọn n" + các thẻ đã chọn** (bấm ✕ để bỏ khi chưa lưu), giống phần "Điểm cần củng cố" (`TagChips` đã có "Đang chọn: …").
3. **Nút "Như buổi trước"** ở đầu form (chỉ hiện khi buổi trước có chọn gì đó). Bấm thì điền lại:
   - kỹ năng đã luyện của buổi trước, **chỉ những kỹ năng còn trong bộ kỹ năng hiện tại** của em;
   - điểm cần củng cố của buổi trước, **chỉ những nhãn còn dùng được**, tối đa 3.
   - Không chép ngày, "Hôm nay học", lời nhắn, ghi chú cho phụ huynh. Gia sư vẫn sửa được trước khi lưu.
   - Cần: `loadLastNote` đọc thêm `practised_target_ids`; `LastNote.practisedTargetIds`; `parseLastNote`.
4. **Chữ giao diện mới** đặt trong `lib/copy/vi.ts` (`sessionNotePage.sameAsLast`, `practisedChosen(n)`, `sameAsLastDone(n, m)`, …) theo `docs/UX_COPY_GUIDE.md`.

**Không đổi:** API, schema zod, hàm `eng_write_lesson_note_v2`, giới hạn 3 điểm củng cố (xem câu hỏi Q1), luật "kỹ năng đã lưu thì không bỏ được".

## 4. Test

- Unit `foldVi`: "Câu điều kiện" ⊇ "cau dieu kien"; "Đảo ngữ" ⊇ "dao ngu"; "ĐỌC HIỂU" ⊇ "doc hieu"; chữ đã bỏ dấu vẫn khớp chữ có dấu; NFC và NFD cho cùng kết quả.
- Unit `DomainTabs` (search): gõ không dấu tìm ra mục; tìm theo tên nhóm vẫn chạy.
- Unit `parseLastNote`: có `practised_target_ids`; thiếu cột thì coi là rỗng.
- Unit `SessionNoteForm` "Như buổi trước": bỏ id không còn trong bộ kỹ năng; bỏ nhãn không còn; cắt còn 3 điểm; không đụng ngày / lời nhắn.
- E2E smoke (CI): Ghi buổi học → gõ "dieu kien" ra nhãn → chọn → "Đã chọn 1".
- `npm run typecheck && npm run lint && npm test` xanh.

## 5. Thử trên preview (cho phụ huynh)

1. Đăng nhập gia sư thử → An (thử) hoặc Nguyên (thử) → **Ghi buổi học**.
2. Ô tìm kỹ năng: gõ `doc` hoặc `dieu kien` (không dấu) → ra kết quả.
3. Chọn 3 kỹ năng → thấy "Đã chọn 3" và 3 thẻ; bấm ✕ một thẻ → còn 2.
4. Lưu buổi. Mở "Ghi buổi học" lần nữa → bấm **Như buổi trước** → 2 kỹ năng + điểm củng cố của buổi trước được điền sẵn.

**SQL cần phụ huynh áp:** không có.

## 6. Tiêu chí đạt / chưa đạt

- Đạt: tìm không dấu ở mọi ô chọn theo bản đồ kỹ năng; luôn thấy đã chọn bao nhiêu; "Như buổi trước" điền đúng và không chép mục bị bỏ; không đổi gì ở cơ sở dữ liệu; test xanh; review Opus không còn lỗi mức cao.
- Chưa đạt: còn ô chọn nào phải gõ đúng dấu; "Như buổi trước" điền kỹ năng không còn trong bộ hiện tại.

## 7. Cần phụ huynh quyết

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 ✅ giữ 3 (07/11) | "Điểm cần củng cố" giữ tối đa 3 hay nâng 5? | **Giữ 3** trong đợt này. Nâng 5 cần migration `0025` (đổi ràng buộc trong cơ sở dữ liệu) và đổi cách tính "Điểm cần chú ý". Hỏi gia sư ở buổi 30 phút trước khi đổi |
| Q2 ✅ không chép (07/11) | "Như buổi trước" có chép cả ô "Hôm nay học" không? | **Không**: nội dung buổi thường khác nhau, chép dễ quên sửa |
