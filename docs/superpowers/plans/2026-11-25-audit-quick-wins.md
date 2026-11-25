# Sửa nhanh sau audit UI/UX (25/11/2026)

Nguồn: báo cáo "English OS · Audit UI/UX theo vai và nhịp" (25/11), mục 7, phụ huynh duyệt 25/11 ("ok như đề xuất"): làm Q1, Q2, Q3, Q6.
**Không SQL**, không AI, không đổi quyền. Nhánh `fix/audit-quick-wins`.

## Q1 · Tách bài soạn sẵn khỏi số "Chờ duyệt"

- Nháp đề Studio (`studio_draft`) sang nhóm mới `drafts` ("Bài soạn sẵn"). Nhóm này **không** nằm trong "Tất cả" và **không** tính vào số "Chờ duyệt" (cột trái, Bàn làm việc, route đếm).
- Lý do: 30 nháp Destination nhập sẵn (U21–U26, PT2) là kho bài chờ soát trước khi giao, không phải việc con đang chờ. Chúng vẫn ở Giao bài → "Bản nháp đang soạn" và ở tab "Bài soạn sẵn" của Chờ duyệt.
- Bàn làm việc: một dòng "n bài soạn sẵn chờ soát trước khi giao" dẫn tới tab đó.

## Q2 · Gom Chờ duyệt theo bài con nộp

- Một lần nộp (`attemptId`) = một dòng, dù đang chờ ở nhiều chỗ: chấm câu tự luận (Studio), chấm kỹ năng (bài làm), con thử lại / xem đáp án, **chưa góp ý** (mới).
- "Cần làm" nối các phần còn lại: "8 câu cần xem · đã chấm 0/1 kỹ năng · chưa góp ý". "Mở" dẫn tới phần đầu tiên còn dở theo thứ tự đó.
- Phần "chưa góp ý" lấy từ cùng hàm của Bài đã giao (`tabOfStudio` = need, `feedbackReady && !feedbackGiven`), nên hai trang nói cùng một điều.

## Q3 · Số "Bài giao" trên Bàn làm việc

- Dòng ở khối "Buổi học & bài giao" lấy từ `buildBoard` (cùng nguồn với trang Bài đã giao): "Bài đã giao: n cần thầy/cô xử lý · n con đang làm · n quá hạn". Trước đây chỉ đếm bài link / PDF nên ghi "0 đang mở".
- Sửa 2 chỗ còn chỉ đường cũ "Giao bài → Bài làm trên app đã giao".

## Q6 · Nhắc gỡ bài trùng và bài quá hạn lâu

- Cảnh báo "n bài làm trên app quá hạn" thêm chi tiết: bao nhiêu bài trùng tên với bài khác (đã nộp, hoặc giao trước đó), bao nhiêu bài quá hạn trên 7 ngày; dẫn tới tab "Con đang làm" (nút Gỡ bài có sẵn).
- Bảng Bài đã giao: bài quá hạn trùng tên có nhãn "Có thể giao trùng".
- Không tự gỡ gì: người lớn vẫn bấm Gỡ bài và ghi lý do.

## Test

Unit: `deskPending`, `deskAlerts`, `assignedBoard`, `pendingCountRoute`. `npm run typecheck && npm run lint && npm test`.
