# Văn bản thông báo đồng ý — phiên bản `pilot-2026-10` (BẢN NHÁP, chờ phụ huynh duyệt)

> **Trạng thái: NHÁP.** Soạn 18/10/2026 theo quyết định A8 (`docs/DECISIONS_PENDING.md`). Chưa nối vào giao diện; hệ thống hiện chỉ ghi *số phiên bản* `pilot-2026-10` cho mỗi em khi tạo gia đình thật. Phụ huynh sửa chữ nếu cần rồi nói "duyệt". Sau khi duyệt mà muốn đổi chữ thì đặt **phiên bản mới** (vd. `pilot-2026-11`) và ghi dòng đồng ý mới — không sửa phiên bản cũ.

## Nội dung (5–7 câu, dùng cho phụ huynh và gia sư)

1. Ứng dụng này lưu việc học tiếng Anh của con: bài con làm và nộp, kết quả và các nhãn lỗi do thầy/cô hoặc phụ huynh ghi lại, ghi chú sau buổi học, và ảnh hoặc file PDF bài làm mà con hoặc thầy/cô tải lên.
2. Chỉ có phụ huynh và thầy/cô được giao phụ trách con xem được các nội dung đó; con chỉ thấy bài của chính mình và lời nhắn của thầy/cô, không thấy điểm số.
3. Âm thanh giọng nói của con không bao giờ được lưu hay gửi khỏi thiết bị của con; ứng dụng chỉ nhận chữ và vài chỉ số.
4. Trí tuệ nhân tạo (AI) đang **tắt**; chỉ khi phụ huynh đồng ý riêng và bật lên thì mới dùng, và chỉ với nội dung bài làm, không kèm họ tên hay thông tin nhận dạng của con.
5. Khi thầy/cô giao bài qua trang bên ngoài (ví dụ test-english, NotebookLM, Gemini), con làm bài trên trang đó và trang đó tự xử lý dữ liệu theo quy định của họ; ứng dụng chỉ lưu đường link và ảnh chụp kết quả con gửi lại.
6. Phụ huynh có thể xem lại, và có thể xóa toàn bộ dữ liệu của con trong ứng dụng bất cứ lúc nào bằng chức năng "Xóa dữ liệu của em" (không xóa tài khoản đăng nhập), khi đó app chỉ giữ lại một biên nhận nhỏ gồm mã và số lượng, không có nội dung; các bản sao lưu đã mã hóa sẽ tự hết hạn sau 30 ngày.
7. Bằng việc tiếp tục sử dụng, phụ huynh xác nhận đã đọc và đồng ý với nội dung trên cho con.

## Ghi chú cho phụ huynh khi duyệt (không phải một phần của văn bản)

- Câu 3 đúng với thiết kế hiện tại (chưa có chức năng ghi âm; khi có sẽ làm ngay trên máy của con).
- Câu 4: bật AI cần thêm bản đồng ý riêng loại `ai_text` (chưa có văn bản; làm cùng đề xuất Studio nếu được duyệt).
- Câu 5 là quyết định D29 (PRD).
- Câu 6: **file ảnh/PDF chưa nằm trong bản sao lưu** (quyết định A4); chức năng xóa cũng xóa các file đó.
- Hiện đồng ý được ghi bởi phụ huynh thay cho con (không có luồng xác minh tuổi tự động — PRD FR-02).
