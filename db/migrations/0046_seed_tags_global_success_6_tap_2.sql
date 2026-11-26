-- 0046_seed_tags_global_success_6_tap_2.sql
-- Global Success 6 Tập 2 (Unit 7–12) · 21 nhãn ngữ pháp / từ vựng / phát âm có sẵn cho Track A (An), đọc từ Book Map của sách giáo khoa
--   (phụ huynh duyệt danh sách 26/11/2026). Mã CỐ ĐỊNH mãi mãi: file bài soạn ngoài app (STUDIO_IMPORT_FORMAT v1) dùng đúng các mã này.
--   Cùng cách với 0042: SM-1 đã công bố (bất biến) nên không thêm lá; nhóm của nhãn nằm ở cột error_tags.seed_group_key (cột và các hàm đọc nhóm
--   đã có từ 0042, nên migration này CHỈ thêm dòng). Phát âm → nhóm sp-pron; từ vựng theo chủ đề → vo-topic.
--   Nhãn đã có dùng lại, không thêm: hien-tai-don, hien-tai-don-s-es, so-sanh, qua-khu-don, phat-am, tu-vung-chu-de (+ 'Tương lai với Will' của gia đình).
-- Idempotent; chỉ thêm. Không đụng schema public. Cần 0042.

insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin, seed_group_key, created_at)
select v.track_id, v.key, v.label_vi, v.group_vi, null, 'seed', v.group_key,
  pg_catalog.clock_timestamp() + v.ord * interval '1 millisecond'
from (values
  ('A', 1, 'tu-hoi-wh', 'Từ để hỏi Wh- (what, where, when, who, why, how…)', 'Ngữ pháp', 'gr-clause'),
  ('A', 2, 'lien-tu-and-but-so', 'Liên từ trong câu ghép: and / but / so', 'Ngữ pháp', 'gr-clause'),
  ('A', 3, 'cau-menh-lenh', 'Câu mệnh lệnh', 'Ngữ pháp', 'gr-clause'),
  ('A', 4, 'tinh-tu-so-huu', 'Tính từ sở hữu (my, your, his…)', 'Ngữ pháp', 'gr-noun-det'),
  ('A', 5, 'dai-tu-so-huu', 'Đại từ sở hữu (mine, yours, his…)', 'Ngữ pháp', 'gr-noun-det'),
  ('A', 6, 'might-kha-nang', 'Might (khả năng)', 'Ngữ pháp', 'gr-modal'),
  ('A', 7, 'mao-tu-a-an-the', 'Mạo từ a / an / the', 'Ngữ pháp', 'gr-noun-det'),
  ('A', 8, 'dieu-kien-loai-1', 'Câu điều kiện loại 1', 'Ngữ pháp', 'gr-conditional'),
  ('A', 9, 'so-sanh-nhat', 'So sánh nhất (tính từ ngắn)', 'Ngữ pháp', 'gr-compare-prep'),
  ('A', 10, 'tv-chuong-trinh-tv', 'Từ vựng: Chương trình TV', 'Từ vựng', 'vo-topic'),
  ('A', 11, 'tv-the-thao-tro-choi', 'Từ vựng: Thể thao và trò chơi', 'Từ vựng', 'vo-topic'),
  ('A', 12, 'tv-thanh-pho-dia-danh', 'Từ vựng: Thành phố và địa danh', 'Từ vựng', 'vo-topic'),
  ('A', 13, 'tv-nha-tuong-lai-do-gia-dung', 'Từ vựng: Nhà tương lai và đồ gia dụng', 'Từ vựng', 'vo-topic'),
  ('A', 14, 'tv-reduce-reuse-recycle', 'Từ vựng: Reduce / Reuse / Recycle (giảm thải, tái sử dụng, tái chế)', 'Từ vựng', 'vo-topic'),
  ('A', 15, 'tv-hoat-dong-hang-ngay', 'Từ vựng: Hoạt động hằng ngày', 'Từ vựng', 'vo-topic'),
  ('A', 16, 'pa-th-dh', 'Phát âm: /θ/ - /ð/', 'Phát âm', 'sp-pron'),
  ('A', 17, 'pa-e-ae', 'Phát âm: /e/ - /æ/', 'Phát âm', 'sp-pron'),
  ('A', 18, 'pa-ou-au', 'Phát âm: /əʊ/ - /aʊ/', 'Phát âm', 'sp-pron'),
  ('A', 19, 'pa-trong-am-2-am-tiet', 'Phát âm: trọng âm từ hai âm tiết', 'Phát âm', 'sp-pron'),
  ('A', 20, 'pa-nhip-dieu-cau', 'Phát âm: nhịp điệu trong câu', 'Phát âm', 'sp-pron'),
  ('A', 21, 'pa-ngu-dieu-xuong', 'Phát âm: ngữ điệu xuống ở câu khẳng định', 'Phát âm', 'sp-pron')
) as v(track_id, ord, key, label_vi, group_vi, group_key)
on conflict (track_id, key) do nothing;

insert into english.schema_migrations(version) values ('0046') on conflict do nothing;
