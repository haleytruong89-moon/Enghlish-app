-- 0015_seed_tags.sql
-- S5b-1 (PR A, bước 2): nhãn lỗi có sẵn (seed) cho 2 track. Nguồn: content/tags/tags_A.json và tags_B.json (Track B lấy từ các điểm
-- ngữ pháp / từ vựng trong khóa đáp án bài kiểm tra Destination C1 & C2 U1–12, thêm "Từ nối & lập luận" và "Phát âm"; Track A: KET/A2).
-- KHÔNG thuộc danh mục đã khóa (content/config.lock.json) và engine không dùng. Có test đối chiếu từng dòng với hai file JSON.
-- Idempotent (on conflict do nothing); thêm nhãn mới = migration mới, không sửa file này.

insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin)
select v.track_id, v.key, v.label_vi, v.group_vi, null, 'seed'
from (values
  ('A', 'hien-tai-don', 'Hiện tại đơn', 'Ngữ pháp'),
  ('A', 'hien-tai-don-s-es', 'Hiện tại đơn: thêm -s / -es', 'Ngữ pháp'),
  ('A', 'gioi-tu-thoi-gian', 'Giới từ chỉ thời gian: in / on / at', 'Ngữ pháp'),
  ('A', 'qua-khu-don', 'Quá khứ đơn', 'Ngữ pháp'),
  ('A', 'so-sanh', 'So sánh', 'Ngữ pháp'),
  ('A', 'tu-vung-chu-de', 'Từ vựng theo chủ đề', 'Từ vựng'),
  ('A', 'doc-hieu', 'Đọc hiểu (KET Reading)', 'Kỹ năng'),
  ('A', 'viet-cau', 'Viết câu / đoạn ngắn', 'Kỹ năng'),
  ('A', 'nghe', 'Nghe', 'Kỹ năng'),
  ('A', 'phat-am', 'Phát âm', 'Kỹ năng'),
  ('B', 'cau-dieu-kien-dao-ngu', 'Câu điều kiện & đảo ngữ', 'Ngữ pháp'),
  ('B', 'wish-would-rather', 'Wish / would rather / had better', 'Ngữ pháp'),
  ('B', 'modal-suy-doan', 'Động từ khuyết thiếu (suy đoán, khả năng)', 'Ngữ pháp'),
  ('B', 'bi-dong-nho-tuong-thuat', 'Bị động, nhờ ai làm, tường thuật', 'Ngữ pháp'),
  ('B', 'dang-tu', 'Dạng từ', 'Từ vựng'),
  ('B', 'tu-vung-ngu-canh', 'Từ vựng theo ngữ cảnh', 'Từ vựng'),
  ('B', 'cum-dong-tu', 'Cụm động từ', 'Từ vựng'),
  ('B', 'thanh-ngu', 'Thành ngữ', 'Từ vựng'),
  ('B', 'tu-noi-lap-luan', 'Từ nối & lập luận', 'Viết & nói'),
  ('B', 'phat-am', 'Phát âm', 'Viết & nói')
) as v(track_id, key, label_vi, group_vi)
on conflict do nothing;

insert into english.schema_migrations(version) values ('0015') on conflict do nothing;
