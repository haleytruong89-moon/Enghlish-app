# Các quyết định đang chờ phụ huynh — có đề xuất và lý do (18/10/2026)

Cách trả lời nhanh: "**đồng ý tất cả**", hoặc "đồng ý tất cả trừ #x, #y" kèm lựa chọn của bạn.
Nguồn: audit 18/10 (`docs/AUDIT_2026-10-18.md`), PROGRESS (bảng quyết định #1–#13, S4 "cần xác nhận"), PR #12, PR #14.

## A. Cần quyết trước khi dùng thật

| # | Câu hỏi | Đề xuất | Lý do |
|---|---|---|---|
| A1 | Làm lát nhỏ **S5c** trước khi đưa gia sư dùng thật? | **Có** | Có 2 lỗi làm sai dữ liệu mà về sau không sửa lại được: ghi buổi học không lưu "đã luyện kỹ năng gì", và một bài có thể bị tính "lần đầu" 2 lần. Thêm nữa, khôi phục bản sao lưu chưa từng được thử. Chi phí khoảng 1–2 ngày |
| A2 | Dữ liệu pilot giấy 17–19/10 | **Nhập vào app**: nới luật ngày cho bài "nhập từ giấy" (cho phép trước ngày giao tối đa 14 ngày, bắt buộc ghi lý do) | Baseline là mốc để đo tiến bộ, để ngoài app thì mất mốc. Chỉ vài bài, nhập tay được, không cần công cụ CSV |
| A3 | Sao lưu cả **tài khoản đăng nhập** (`auth.users`)? | **Có**, mã hóa cùng khóa hiện tại | Thiếu bảng này thì khôi phục xong không ai đăng nhập được, phải tạo lại mọi tài khoản. Bản sao lưu sẽ gồm cả tài khoản Launcher (cùng dự án) — vẫn là dữ liệu của gia đình mình |
| A4 | Sao lưu **file** (ảnh, PDF)? | **Chưa** (giữ quyết định 17/10) | Bản gốc vẫn ở máy gia sư và máy các em. Xem lại sau 1 tháng dùng thật |
| A5 | **Màn xóa dữ liệu một em** | **Làm trong S5c** | Xóa tài khoản trực tiếp trên Supabase sẽ kéo theo xóa quan hệ và đồng ý (dùng chung Launcher). Cần một cách xóa an toàn **trước khi** dữ liệu thật vào |
| A6 | Xóa dữ liệu một em có xóa luôn tài khoản đăng nhập? (#2) | **Không**. Chỉ xóa dữ liệu trong app và tên đăng nhập ngắn | Tài khoản dùng chung với Launcher. Xóa nhầm thì mất cả bên Launcher |
| A7 | Bật **Deployment Protection** cho bản Preview trên Vercel | **Bật** | Preview dùng chung database thật với khóa toàn quyền. Bật lên thì chỉ người đăng nhập Vercel (bạn) mở được Preview. Miễn phí, mất 1 phút |
| A8 | **Văn bản thông báo đồng ý** (consent, #13) | **Claude soạn 5–7 câu, bạn duyệt trước khi tạo gia đình thật** | Đây là dữ liệu thật của trẻ: cần ghi rõ app lưu gì, ai xem, xóa thế nào. AI vẫn tắt |
| A9 | Bài link (Gemini, NotebookLM, test-english): câu trả lời của con đi qua dịch vụ ngoài | **Chấp nhận, ghi thành quyết định D29**. App chỉ lưu link và ảnh kết quả | Gia sư đang dùng các trang này hằng tuần, lợi ích lớn hơn rủi ro. App không gửi dữ liệu gì của con đi |
| A10 | "Kiểm tra lại" theo nhãn đang dùng chung con số 14 ngày với "bài ôn sau 2 tuần" theo kỹ năng | **Tách thành 2 cài đặt riêng**; đổi chữ hiển thị thành "Hỏi lại điểm yếu" | Hai khái niệm khác nhau. Dùng chung thì sau này đổi một bên sẽ kéo theo bên kia, gia sư cũng dễ nhầm |

## B. Xác nhận những gì đã làm theo hướng an toàn (đề xuất: giữ nguyên tất cả)

| # | Đang làm | Lý do giữ |
|---|---|---|
| B1 | Ghi chú buổi học mẫu mới luôn chia sẻ cho phụ huynh | Phụ huynh là người theo dõi chính. Đã có ô riêng "ghi chú cho phụ huynh" mà em không thấy |
| B2 | Câu bỏ trống tính là sai | Đúng cách chấm của đề thi. Bỏ trống thường là do chưa biết |
| B3 | Phụ huynh thấy câu chờ gắn nhãn của gia sư sau 2 ngày; câu do mình nhập thì thấy ngay | Gia sư phân loại ngữ pháp chính xác hơn; phụ huynh là người dự phòng |
| B4 | Kiểm tra lại "ổn" thì nhãn chuyển từ Lặp lại sang Ổn (chỉ tính lỗi trước ngày kiểm tra) | Ghi nhận được tiến bộ. Nếu sau đó sai lại thì nhãn tự bật lại |
| B5 | Đề PDF không hỏi "có bấm Hint" | Đề giấy không có nút Hint |
| B6 | Mật khẩu các con ≥ 12 ký tự | Tên đăng nhập ngắn nên dễ đoán |
| B7 | Bài làm trong buổi và bài nói trực tiếp: chỉ gia sư ghi (#6) | Đây là bằng chứng quan sát trực tiếp (quy tắc D15) |
| B8 | Em không xem chữ người lớn ghi giúp (#7) | Tránh để em thấy nhận xét chấm điểm hay gợi ý đáp án |
| B9 | Ngày ghi bài ngoài app không sớm hơn lần làm gần nhất (#8) | Giữ thứ tự bằng chứng. Ngoại lệ duy nhất là bài nhập từ pilot giấy (A2) |
| B10 | Tiêu chí "nghe trực tiếp" chỉ tick được với bài nghe trực tiếp (#9) | Không chấm thứ mình không quan sát được |
| B11 | Ghi chú gợi ý tối đa 300 ký tự (#10) | Đủ cho 2–3 câu. Nới được nếu thấy ngắn |

## C. Nội dung bài học

| # | Câu hỏi | Đề xuất | Lý do |
|---|---|---|---|
| C1 | Bảng "bước nào dùng bài đọc/nghe nào" | **Gia sư xem 1 lần**; Claude xuất bảng dễ đọc | Bảng sai thì em đọc nhầm bài |
| C2 | 5 bài nghe chưa có link | **Gia sư phát tệp trong buổi** (như Pilot Kit) | Đúng quy tắc "âm thanh không đi qua app", không phải lo lưu file và bản quyền |
| C3 | Câu điền chữ tự chấm (A-W0) | **Giữ**: không phân biệt hoa thường/khoảng trắng, chấp nhận nhiều đáp án | Phù hợp lớp 6. Câu mở vẫn cần người chấm |
| C4 | Video (#3) | **Chỉ dùng link** YouTube/nguồn mở | Không vi phạm bản quyền, không tốn dung lượng |
| C5 | Đề thử tuần 4 của Nguyên (#4) | **21/11** (đã đưa vào Kit) | Đủ 4 tuần sau baseline |
| C6 | Kỹ năng sửa bài `B-A3-REVISE` của Nguyên (#11) | **Thêm vào bộ B-v2 sau baseline** | Đang được chấm nhưng chưa được theo dõi, nên mất dữ liệu |
| C7 | `B-T5-SOURCE`: làm trên nguồn mới C có tính là kiểm tra trễ? (#12) | **Không**. Tính là bài "chuyển sang nguồn mới" | Định nghĩa kiểm tra trễ là cùng chủ đề/nguồn. Nguồn mới đo khả năng chuyển giao, là thứ khác |
| C8 | Bộ nhãn lỗi cho An (KET) | **Dùng bộ tạm 10 nhãn**, chỉnh khi có đề KET mẫu | Gia sư An dùng "Nhập nhanh" được ngay |

## D. Thứ tự và cách vận hành

| # | Câu hỏi | Đề xuất | Lý do |
|---|---|---|---|
| D1 | Thứ tự làm tiếp | **S5c → đưa gia sư vào → S6 → S7 → S8 → S5b-2** | Khép vòng học của con (S6) và có bằng chứng cho engine (S7) trước. Phần gợi ý bài (S5b-2) trùng với "việc tiếp theo" của S8 |
| D2 | Cách đưa gia sư vào | **Hướng dẫn 1 trang + buổi 30 phút mỗi gia sư**, có bạn ngồi cùng | Cổng G4: gia sư hiểu thang chấm, quy tắc "không ghi điểm trong lời nhắn cho em" |
| D3 | Đổi gia sư | **Chưa làm công cụ**; Claude viết hướng dẫn thao tác khi nào cần | Việc hiếm, tốn công làm trước |
| D4 | Hạn nộp, nộp muộn | **Chỉ hiển thị "quá hạn" cho gia sư**, không trừ điểm, không chặn nộp | App gia đình, không cần phạt. Gia sư biết để nhắc |
