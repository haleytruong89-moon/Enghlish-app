-- 0018_reading_skills.sql
-- Studio bước 1 · PR A (spec docs/superpowers/specs/2026-10-20-studio-design.md §3): kỹ năng đọc.
--   1. Nhãn "Kỹ năng đọc" (khung báo cáo TOMO mà gia sư đang dùng): Track B 14 kỹ năng, Track A 6. Nguồn: content/tags/reading_*.json
--      (test đối chiếu từng dòng). Nhãn chung cũ A/doc-hieu nghỉ dùng (dấu nhãn cũ vẫn hiện đúng tên).
--   2. Ngưỡng trong tutorwork_settings (không hard-code): reading_min_questions = 4, reading_weak_pct = 60.
--   3. Bảng append-only reading_reports (báo cáo kỹ năng đọc tháng: số câu + % mỗi kỹ năng; KHÔNG có Lexile/CEFR).
--   4. eng_record_reading_report (ghi), eng_reading_skills (đọc cho bảng "Kỹ năng đọc"); cả hai chỉ service_role gọi sau requireAccess.
--   5. eng_purge_learner + eng_purge_preview thêm reading_reports.
-- Là TÍN HIỆU, không phải bằng chứng: engine S7 không đọc. Idempotent; chỉ thêm.

-- 1. Nhãn kỹ năng đọc -----------------------------------------------------------------------------------------------------------------
insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin)
select v.track_id, v.key, v.label_vi, 'Kỹ năng đọc', null, 'seed'
from (values
  ('A', 1, 'doc-main-idea', 'Main Idea — Ý chính'),
  ('A', 2, 'doc-details', 'Details — Tìm chi tiết'),
  ('A', 3, 'doc-inference', 'Make Inferences — Suy luận'),
  ('A', 4, 'doc-author-purpose', 'Author''s Purpose — Mục đích của tác giả'),
  ('A', 5, 'doc-context-clues', 'Context Clues — Gợi ý từ văn bản'),
  ('A', 6, 'doc-sequence', 'Chronology/Sequence — Trình tự thời gian / sự kiện'),
  ('B', 1, 'doc-author-purpose', 'Author''s Purpose — Mục đích của tác giả'),
  ('B', 2, 'doc-compare-contrast', 'Compare and Contrast — So sánh và đối lập'),
  ('B', 3, 'doc-cause-effect', 'Cause and Effect — Nguyên nhân – kết quả'),
  ('B', 4, 'doc-sequence', 'Chronology/Sequence — Trình tự thời gian / sự kiện'),
  ('B', 5, 'doc-conclusions', 'Draw Conclusions — Rút ra kết luận'),
  ('B', 6, 'doc-fact-opinion', 'Fact and Opinion — Sự kiện và ý kiến'),
  ('B', 7, 'doc-main-idea', 'Main Idea — Ý chính'),
  ('B', 8, 'doc-inference', 'Make Inferences — Suy luận'),
  ('B', 9, 'doc-prediction', 'Make Predictions — Dự đoán'),
  ('B', 10, 'doc-summarize', 'Summarize — Tóm tắt'),
  ('B', 11, 'doc-evidence', 'Use Evidence — Sử dụng chứng cứ'),
  ('B', 12, 'doc-antonyms', 'Antonyms — Từ trái nghĩa'),
  ('B', 13, 'doc-context-clues', 'Context Clues — Gợi ý từ văn bản'),
  ('B', 14, 'doc-synonyms', 'Synonyms — Từ đồng nghĩa')
) as v(track_id, ord, key, label_vi)
-- created_at = clock_timestamp() theo từng dòng: chèn theo thứ tự của báo cáo để bảng hiện đúng thứ tự.
order by v.track_id, v.ord
on conflict do nothing;

update english.error_tags set retired_at = pg_catalog.clock_timestamp()
  where track_id = 'A' and key = 'doc-hieu' and retired_at is null;

-- 2. Ngưỡng ----------------------------------------------------------------------------------------------------------------------------
insert into english.tutorwork_settings(key, value) values
  ('reading_min_questions', '4'::jsonb),
  ('reading_weak_pct', '60'::jsonb)
on conflict do nothing;

insert into english.schema_migrations(version) values ('0018') on conflict do nothing;
