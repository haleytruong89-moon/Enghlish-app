-- 0045_seed_tags_global_success_6_tap_1.sql
-- Global Success 6 Tập 1 (Unit 1–6) · 23 nhãn ngữ pháp / từ vựng / phát âm có sẵn cho Track A (An), đọc từ Book Map của sách giáo khoa
--   (phụ huynh duyệt danh sách 26/11/2026). Mã CỐ ĐỊNH mãi mãi: file bài soạn ngoài app (STUDIO_IMPORT_FORMAT v1) dùng đúng các mã này.
--   Cùng cách với 0042: SM-1 đã công bố (bất biến) nên không thêm lá; nhóm của nhãn nằm ở cột error_tags.seed_group_key (cột và các hàm đọc nhóm
--   đã có từ 0042, nên migration này CHỈ thêm dòng). Phát âm → nhóm sp-pron; từ vựng theo chủ đề → vo-topic.
--   Nhãn đã có dùng lại, không thêm: hien-tai-don, hien-tai-don-s-es, so-sanh, qua-khu-don, phat-am, tu-vung-chu-de (+ 'Tương lai với Will' của gia đình).
-- Idempotent; chỉ thêm. Không đụng schema public. Cần 0042.

insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin, seed_group_key, created_at)
select v.track_id, v.key, v.label_vi, v.group_vi, null, 'seed', v.group_key,
  pg_catalog.clock_timestamp() + v.ord * interval '1 millisecond'
from (values
  ('A', 1, 'trang-tu-tan-suat', 'Trạng từ chỉ tần suất (always, usually, never…)', 'Ngữ pháp', 'gr-compare-prep'),
  ('A', 2, 'so-huu-cach', 'Sở hữu cách ''s', 'Ngữ pháp', 'gr-noun-det'),
  ('A', 3, 'gioi-tu-noi-chon', 'Giới từ chỉ nơi chốn (in, on, under, next to…)', 'Ngữ pháp', 'gr-compare-prep'),
  ('A', 4, 'hien-tai-tiep-dien', 'Hiện tại tiếp diễn', 'Ngữ pháp', 'gr-tense'),
  ('A', 5, 'hien-tai-don-va-tiep-dien', 'Phân biệt hiện tại đơn và hiện tại tiếp diễn', 'Ngữ pháp', 'gr-tense'),
  ('A', 6, 'danh-tu-dem-khong-dem', 'Danh từ đếm được / không đếm được', 'Ngữ pháp', 'gr-noun-det'),
  ('A', 7, 'must-mustnt', 'Must / Mustn''t (bắt buộc, cấm đoán)', 'Ngữ pháp', 'gr-modal'),
  ('A', 8, 'should-shouldnt', 'Should / Shouldn''t (lời khuyên)', 'Ngữ pháp', 'gr-modal'),
  ('A', 9, 'some-any-chi-luong', 'Some / Any (chỉ lượng)', 'Ngữ pháp', 'gr-noun-det'),
  ('A', 10, 'tv-truong-hoc', 'Từ vựng: Trường học (đồ dùng, môn học, hoạt động)', 'Từ vựng', 'vo-topic'),
  ('A', 11, 'tv-cum-play-do-have-study', 'Cụm động từ + danh từ: play / do / have / study', 'Từ vựng', 'vo-colloc-idiom'),
  ('A', 12, 'tv-nha-cua', 'Từ vựng: Nhà cửa (loại nhà, phòng, nội thất)', 'Từ vựng', 'vo-topic'),
  ('A', 13, 'tv-ngoai-hinh', 'Từ vựng: Ngoại hình và bộ phận cơ thể', 'Từ vựng', 'vo-topic'),
  ('A', 14, 'tv-tinh-cach', 'Từ vựng: Tính từ chỉ tính cách', 'Từ vựng', 'vo-topic'),
  ('A', 15, 'tv-khu-pho', 'Từ vựng: Địa điểm trong khu phố', 'Từ vựng', 'vo-topic'),
  ('A', 16, 'tv-thien-nhien-du-lich', 'Từ vựng: Thiên nhiên và đồ dùng du lịch', 'Từ vựng', 'vo-topic'),
  ('A', 17, 'tv-tet', 'Từ vựng: Ngày Tết (đồ vật, hoạt động)', 'Từ vựng', 'vo-topic'),
  ('A', 18, 'pa-aa-uh', 'Phát âm: /ɑː/ - /ʌ/', 'Phát âm', 'sp-pron'),
  ('A', 19, 'pa-s-z-cuoi-tu', 'Phát âm: âm cuối /s/ - /z/', 'Phát âm', 'sp-pron'),
  ('A', 20, 'pa-b-p', 'Phát âm: /b/ - /p/', 'Phát âm', 'sp-pron'),
  ('A', 21, 'pa-i-ee', 'Phát âm: /ɪ/ - /iː/', 'Phát âm', 'sp-pron'),
  ('A', 22, 'pa-t-d', 'Phát âm: /t/ - /d/', 'Phát âm', 'sp-pron'),
  ('A', 23, 'pa-s-sh', 'Phát âm: /s/ - /ʃ/', 'Phát âm', 'sp-pron')
) as v(track_id, ord, key, label_vi, group_vi, group_key)
on conflict (track_id, key) do nothing;

insert into english.schema_migrations(version) values ('0045') on conflict do nothing;
