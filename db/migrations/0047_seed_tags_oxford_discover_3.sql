-- 0047_seed_tags_oxford_discover_3.sql
-- Oxford Discover 3 (Unit 1–18) · 20 nhãn ngữ pháp / Word Study cho Track A (An), đọc từ Scope and Sequence của Student Book
--   (phụ huynh duyệt danh sách 27/11/2026). Mã CỐ ĐỊNH mãi mãi: file bài soạn ngoài app (STUDIO_IMPORT_FORMAT v1) dùng đúng các mã này.
--   Cùng cách với 0042 / 0045 / 0046: SM-1 đã công bố (bất biến) nên không thêm lá; nhóm của nhãn nằm ở cột error_tags.seed_group_key, nên
--   migration này CHỈ thêm dòng. Dùng lại, không thêm: so-sanh, so-sanh-nhat, so-huu-cach, dai-tu-so-huu, tinh-tu-so-huu, mao-tu-a-an-the,
--   danh-tu-dem-khong-dem, gioi-tu-noi-chon, might-kha-nang (cả may), lien-tu-and-but-so và các nhãn riêng của gia đình cho Unit 1–8.
--   Không thêm nhãn cho chính tả / âm vụn (-le, -dge, -th, âm g cứng, âm tiết, viết hoa).
-- Idempotent; chỉ thêm. Không đụng schema public. Cần 0042.

insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin, seed_group_key, created_at)
select v.track_id, v.key, v.label_vi, v.group_vi, null, 'seed', v.group_key,
  pg_catalog.clock_timestamp() + v.ord * interval '1 millisecond'
from (values
  ('A', 1, 'tinh-tu-ed-ing', 'Tính từ đuôi -ed / -ing (bored / boring)', 'Ngữ pháp', 'gr-compare-prep'),
  ('A', 2, 'trat-tu-tinh-tu', 'Trật tự tính từ (a big blue sky)', 'Ngữ pháp', 'gr-compare-prep'),
  ('A', 3, 'luong-tu-a-few-a-little', 'Lượng từ a few / a little', 'Ngữ pháp', 'gr-noun-det'),
  ('A', 4, 'so-sanh-bang-as-as', 'So sánh bằng: as … as / not as … as', 'Ngữ pháp', 'gr-compare-prep'),
  ('A', 5, 'too-either', 'Too / either (cũng vậy, cũng không)', 'Ngữ pháp', 'gr-clause'),
  ('A', 6, 'hoa-hop-chu-ngu-ghep', 'Chủ ngữ ghép + động từ (My desk and my chair are…)', 'Ngữ pháp', 'gr-clause'),
  ('A', 7, 'so-sanh-trang-tu', 'So sánh hơn / nhất của trạng từ (faster, the most carefully)', 'Ngữ pháp', 'gr-compare-prep'),
  ('A', 8, 'cau-before-after', 'Câu với before / after', 'Ngữ pháp', 'gr-clause'),
  ('A', 9, 'tu-chi-don-vi', 'Từ chỉ đơn vị (a bag of, a cup of)', 'Ngữ pháp', 'gr-noun-det'),
  ('A', 10, 'trang-tu-trinh-tu', 'Trạng từ chỉ trình tự (first, then, finally)', 'Ngữ pháp', 'gr-clause'),
  ('A', 11, 'tinh-tu-gioi-tu', 'Tính từ + giới từ (curious about, good at)', 'Ngữ pháp', 'gr-compare-prep'),
  ('A', 12, 'gioi-tu-chuyen-dong', 'Giới từ chỉ chuyển động (up, down, across, into)', 'Ngữ pháp', 'gr-compare-prep'),
  ('A', 13, 'want-need-have-to', 'Want to / need to / have to', 'Ngữ pháp', 'gr-modal'),
  ('A', 14, 'cau-although', 'Câu với although', 'Ngữ pháp', 'gr-clause'),
  ('A', 15, 'cum-dong-tu-get', 'Cụm động từ với get (get up, get on…)', 'Từ vựng', 'vo-colloc-idiom'),
  ('A', 16, 'cum-dong-tu-look', 'Cụm động từ với look (look for, look after…)', 'Từ vựng', 'vo-colloc-idiom'),
  ('A', 17, 'dong-nghia-trai-nghia', 'Từ đồng nghĩa / trái nghĩa', 'Từ vựng', 'vo-context'),
  ('A', 18, 'tien-to-re', 'Tiền tố re- (redo, reuse)', 'Từ vựng', 'vo-word-form'),
  ('A', 19, 'hau-to-ful-less', 'Hậu tố -ful / -less (careful, careless)', 'Từ vựng', 'vo-word-form'),
  ('A', 20, 'danh-tu-ghep', 'Danh từ ghép (bookshelf, sunflower)', 'Từ vựng', 'vo-word-form')
) as v(track_id, ord, key, label_vi, group_vi, group_key)
on conflict (track_id, key) do nothing;

insert into english.schema_migrations(version) values ('0047') on conflict do nothing;
