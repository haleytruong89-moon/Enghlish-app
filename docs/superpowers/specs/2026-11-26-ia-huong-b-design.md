# Sắp xếp lại trang người lớn theo hướng B — thiết kế ngắn

Ngày: 26/11/2026 · Phụ huynh duyệt hướng B ("ok đồng ý", 26/11) · Bản phác: https://claude.ai/artifact/Goybra3gfpzgLkyRDkqUFT

## Vì sao

Sau buổi gia sư thử (25–26/11), phụ huynh nêu 3 điều:

1. Cột trái có 11 mục ngang hàng. Việc làm hằng ngày (chấm, giao, ghi buổi) không nổi bật.
2. Muốn xem con tiến bộ ra sao thì phải cuộn rất dài, và chưa có trang tổng quan hay biểu đồ.
3. Nhiều phần trùng nhau: Giao bài, Bài đã giao, Kết quả, Ghi kết quả, Chờ duyệt.

Mục tiêu: cô mở app thấy ngay việc phải làm, bấm tối đa 1 lần để tới đó, và mỗi tuần 5 phút xem được con lên hay xuống.

## Mục tiêu / không làm / không được làm

| | Nội dung |
|---|---|
| Mục tiêu | Ở đầu cột trái có 3 nút việc chính. Dưới đó là 5 mục, cuối cùng là Hồ sơ học sinh. Một trang Bài tập có 4 tab. Một trang Tiến bộ có Tổng quan và biểu đồ. Việc nên làm chỉ nằm ở Hôm nay. |
| Không làm | Không thêm SQL, bảng hay hàm mới. Không đổi luật đo, quyền từng vai hay màn của con. Không đổi các trang quyết định (Xong một bài, Duyệt đề, Hộp duyệt). |
| Không được làm | Không làm mất đường vào một trang đang có (đường dẫn cũ vẫn mở được). Không cho con thấy điểm. Không có số giả: số nào chưa đọc được thì ẩn, không hiện 0. Không viết nhánh `if track`. |

## Các hướng đã cân nhắc

| Hướng | Cách làm | Được | Mất | Chọn |
|---|---|---|---|---|
| A · Chỉ gom nhóm | Giữ 11 trang, chia cột trái thành nhóm có tiêu đề | Nhanh, rủi ro thấp | Không giải quyết chuyện trùng lặp, vẫn chưa có tổng quan | |
| **B · 3 nút + 5 mục, gộp theo việc** | 3 nút việc chính. Bài tập có 4 tab (gộp Giao bài, Bài đã giao, Ghi kết quả, phần bài nộp của Chờ duyệt). Tiến bộ có 4 tab (gộp Kết quả, Bản đồ kiến thức, Hồ sơ cấp). Kế hoạch gồm Giáo trình và Lộ trình. Hồ sơ học sinh để cuối. | Hết trùng, việc hằng ngày nổi bật, có tổng quan | 3 PR. Gia sư phải làm quen lại một lần (có tour sau). | ✓ |
| C · Viết lại cả trang người lớn | Một màn hình duy nhất theo luồng | Gọn nhất | Đụng mọi trang quyết định, rủi ro cao, lâu | |

## Những gì đã chốt

- **Cột trái:**
  - 3 nút: **Chấm bài** (màu đỏ, có số bài chờ, khi có bài con nộp chờ chấm; màu thường khi không có) · **Giao bài** · **Ghi buổi học**.
  - 5 mục: **Hôm nay · Bài tập · Buổi học · Tiến bộ · Kế hoạch**.
  - Cuối cột: **Hồ sơ học sinh**, rồi nhóm Phụ huynh, rồi "Góp ý về app".
  - Mục **Chờ duyệt** riêng bị bỏ.
- **Bài tập** (trang `/learners/[id]/assigned`):
  - 4 tab: **Cần chấm · Con đang làm · Đã xong · Bản nháp**.
  - Tab Bản nháp gom bản nháp theo Unit. Unit "kế tiếp" đứng đầu: Unit đầu tiên (theo số) có bản nháp chưa giao và chưa "Đã học" ở giáo trình chính.
  - "Đã gỡ" là liên kết nhỏ ở tab Đã xong.
  - Đầu trang có nút: + Giao bài mới · Ghi kết quả bài giấy / link · Nạp bài đã làm.
- **Tiến bộ:**
  - 4 tab: **Tổng quan · Theo Unit · Mục kiến thức · Cấp và kỹ năng**.
  - Tổng quan có 4 ô số:
    - bài nộp 4 tuần, so với 4 tuần trước;
    - đúng lần đầu 4 tuần, chênh bao nhiêu điểm %;
    - số bài chờ chấm, kèm bài lâu nhất;
    - Unit đang học, kèm số Unit đã học / tổng.
  - Tổng quan có biểu đồ đúng lần đầu theo từng bài, theo ngày nộp, có vạch 50 % và 80 %.
  - Tổng quan có thanh theo Unit, mục yếu nhất và mạnh nhất, và bảng mỗi bài một dòng (bấm để xổ ra từng phần).
  - Tab Mục kiến thức gồm danh sách theo mục và liên kết tới Bản đồ kiến thức.
  - Tab Cấp và kỹ năng gồm Hồ sơ cấp, Mục cần chú ý và Kỹ năng đang theo dõi.
- **Việc nên làm** chỉ nằm ở Hôm nay. Hôm nay hiện tối đa 6 việc, các việc còn lại ở mục "Xem thêm". Trang Tiến bộ chỉ có một dòng trỏ về Hôm nay.
- **Hôm nay:** "Chờ duyệt" đổi thành **Việc khác**, gồm các việc không phải chấm bài (kỹ năng, mức mục kiến thức, giáo trình nháp, mốc lộ trình, mục tiêu tuần, bài nạp). Bài con nộp nằm ở Bài tập › Cần chấm. Việc khác có một dòng trỏ tới Cần chấm.
- **Hồ sơ học sinh** (trang mới `/learners/[id]/profile`):
  - Gồm Hồ sơ đầu vào, Ghi chú dạy học và "Ngày ấy – bây giờ" (chuyển từ trang Hồ sơ cấp), Con hỏi Gia sư, Nhập kỹ năng đọc tháng.
  - Hồ sơ cấp chuyển sang Tiến bộ › Cấp và kỹ năng.
- **Tên:** trang chủ người lớn đổi tên "Bàn làm việc" → **Hôm nay**. Chữ giao diện nằm trong `lib/copy/vi.ts`.

## Đường dẫn

Không trang nào bị xóa. Mọi đường dẫn cũ vẫn mở trang của nó và sáng đúng mục mới:

| Trang | Mục mới |
|---|---|
| `/assign`, `/assigned`, `/finish/*`, `/results/new`, `/imports/*`, `/studio/*`, `/inquiries`, `/review`, `/review/[id]`, `/review/studio`, `/revisions/*` | Bài tập |
| `/progress`, `/knowledge`, `/levels/*`, `/weak`, `/targets` | Tiến bộ |
| `/curricula/*`, `/roadmap` | Kế hoạch |
| `/notes`, `/notes/new` | Buổi học |
| `/inbox`, `/review/skills` | Hôm nay (Việc khác) |
| `/profile`, `/tutor-asks`, `/reading/new` | Hồ sơ học sinh |

Có 3 chỗ tự chuyển:

- `/inbox?f=drafts` chuyển sang `/assigned?tab=drafts`. (`/inbox?f=work` vẫn mở danh sách cũ, vì nhóm này còn có bài chờ chấm kỹ năng ở Hộp duyệt, mà Cần chấm không có.)
- `/progress?tab=work` mở Tổng quan.
- Nút cảnh báo "Hồ sơ đầu vào" trỏ `/profile#intake` (thay cho `/levels#intake`).

## Chia việc

| PR | Nội dung |
|---|---|
| 1 | Cột trái mới (3 nút, 5 mục, Hồ sơ), bảng mục theo đường dẫn, số bài chờ trên nút Chấm bài, trang Bài tập 4 tab và Bản nháp theo Unit, tab Kế hoạch, đổi tên Hôm nay. |
| 2 | Trang Tiến bộ: tab, Tổng quan và biểu đồ. Việc nên làm chuyển hết về Hôm nay. |
| 3 | Việc nên làm và Việc khác về Hôm nay, tự chuyển `/inbox?f=drafts`, tài liệu. (Trang Hồ sơ học sinh đã làm ở PR 2.) |

## Những chỗ tôi tự quyết (phụ huynh xem lại khi đọc)

1. Bài tập giữ đường dẫn `/assigned`, không đổi sang `/work`, để không phải chuyển hướng.
2. Nút Chấm bài mở hàng chờ "Xong một bài". Hàng chờ này chỉ có bài trên app. Khi hàng chờ trống mà còn bài link / PDF chờ, nút tự chuyển sang Bài tập › Cần chấm.
3. Số trên nút Chấm bài **bằng đúng số của tab Cần chấm** (cùng hàm `buildBoard`). Vì thế nút, tab và Hôm nay không lệch nhau. Đây là sửa sau bản rà PR1: bản đầu đếm theo dòng Chờ duyệt, nên có lúc nút đỏ mà trang mở ra lại báo "không còn bài".
4. Bỏ 3 nút việc chính đang nằm trên đầu trang Hôm nay, vì cột trái đã có.
5. Cách tính "4 tuần": 28 ngày giờ Việt Nam tính đến hôm nay, so với 28 ngày liền trước. Chỉ tính bài được đo (lần làm đầu).
