# Kết quả + Việc nên làm (PR-A) · 26/11/2026

Nguồn: phụ huynh 25/11 tối: "cô phải nhìn thấy điểm và progress theo từng bài làm, từng unit … report phải mang tính urge action (cho con luyện thêm, học kỹ hơn 1 topic / bài, chữa bài cùng con …)". Đề xuất được duyệt ("ok") cùng ngưỡng và thứ tự PR-A → PR-B. Nhánh `feature/ket-qua-viec-nen-lam` (dựa trên `fix/audit-quick-wins`, PR #59).

**Không SQL.** Mọi bảng cần đọc đã có quyền đọc cho người lớn của em (RLS `eng_is_staff_of`): `attempt_auto_checks` (0009), `item_decisions`, `studio_item_meta`, `studio_drafts` (0024). Không đọc chữ bài làm, không đọc đáp án.

## Đo gì (luật đo giữ nguyên)

- Chỉ **lần làm đầu** của mỗi bài Studio. Câu chỉ làm trên giấy (`out_of_app`) không tính.
- Câu app tự chấm: đúng / sai / bỏ trống (bỏ trống = chưa đúng). Câu app để người lớn: lấy Đúng/Sai của người lớn; chưa có → **"chờ thầy/cô"** (không đúng, không sai).
- **Điểm tạm** = đúng / số câu đã chấm, kèm "n câu chờ thầy/cô". Có kết quả chính thức (mọi câu đã chấm) thì ghi "chính thức".
- Gộp theo **phần** của bài (`studio_item_meta.part`, tên phần từ bản nháp đã duyệt), theo **Unit** (Unit giao kèm bài, không có thì đọc từ tên bài; Review / Progress Test là nhóm riêng), theo **mục kiến thức** (`tag_key`).
- Con không thấy gì mới (D35).

## Việc nên làm (luật cố định, không AI) — `lib/results/actions.ts`

| Thẻ | Khi nào | Nút |
|---|---|---|
| Chấm bài (luôn đầu tiên) | Có bài còn câu chờ hoặc chưa góp ý. Màu: < 2 ngày thường, 2–4 ngày cam, ≥ 5 ngày đỏ | Chấm bài cũ nhất |
| Chữa bài cùng con | Một phần (hoặc cả bài nếu không chia phần) < 50 %, ≥ 4 câu đã chấm, nộp trong 21 ngày | Ghi vào buổi học |
| Học kỹ lại Unit | Unit của sách (không phải Review) < 60 %, ≥ 4 câu | Ghi vào buổi học |
| Luyện thêm | Mục kiến thức < 60 % qua ≥ 2 bài, ≥ 4 câu | Giao bài luyện |
| Khen | Phần / bài ≥ 80 %, mới nhất | Mở bài để góp ý |

Bàn làm việc: tối đa 6 thẻ, mỗi loại tối đa (chấm 1 · chữa 2 · Unit 1 · luyện 1 · khen 1), "chữa" lấy phần yếu nhất của mỗi bài. Trang Kết quả: mọi thẻ. Trang Ghi buổi học: khối "Gợi ý cho buổi này" (chữa / Unit / luyện). Phụ huynh thấy cùng thẻ, không nút.

Chạy thử trên số liệu thật của Nguyên (25/11, chỉ đọc): Bàn làm việc ra đúng 6 thẻ — chấm 5 bài (14 câu, lâu nhất 11 ngày, đỏ) · chữa U15 phần E 0/10 · chữa Review 1 phần C 1/8 · học lại U15 (41 %) · luyện thêm Dạng từ (42 % qua 3 bài) · khen U15 phần A 11/11.

## Kèm theo

- Bài đã giao: dòng "tạm: đúng x/y · n câu chờ thầy/cô" khi bài chưa có kết quả chính thức.
- Hộp từ trong ngoặc cuối lời dẫn ("… the words in the box. (demanding, few, …)") thành chip từ cho con (U15 phần E: con không dùng từ nào trong hộp, 0/10).

## Để PR-B (cần SQL)

Nút "Đã làm" / "Bỏ qua (lý do)" trên thẻ, lưu chỉ thêm, để phụ huynh thấy cô đã xử lý thẻ nào và sau bao lâu; thẻ đã xử lý không hiện lại.
