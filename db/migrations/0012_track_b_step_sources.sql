-- 0012_track_b_step_sources.sql
-- Bước nào đọc / nghe gì cho 4 mẫu Track B vừa công bố ở 0011 (B-W1 … B-W4). Cùng cách làm với 0009 (bảng template_step_sources,
-- chỉ thêm, không sửa). Suy ra từ lời nhắc của từng bước: "Read Sources A and B…" → Nguồn A + B; "Sources A and B open" (bài viết) →
-- Nguồn A + B; câu hỏi đọc hiểu kiểu đề thi (EXAM-R) → bài đọc S1; điền đoạn văn (CLOZE) → bài S2; "Read Source X again/for 2 minutes"
-- (nói trực tiếp) → nguồn đó; B-W4 bước 9 "Read Source C" → S5. Bước không có nguồn rõ ràng (viết lại câu, luyện nhanh, sơ đồ ý,
-- sửa bài) thì KHÔNG có dòng. Chờ phụ huynh xác nhận (docs/PROGRESS.md). Muốn đổi sau này = thêm migration mới.
-- Fail loudly (never insert 0 rows by accident): this file needs 0011 (templates + sources) to be applied first.
do $$
begin
  if not exists (select 1 from english.schema_migrations where version = '0011') then
    raise exception '0012 needs 0011 to be applied first (templates and sources of B-W1..B-W4 are seeded there)';
  end if;
end $$;

insert into english.template_step_sources(template_id, template_version, step_no, source_id, source_version, position)
select m.template_id, 1, m.step_no, m.source_id, 1, m.position
from (values
  -- B-W1-HOMEWORK
  ('B-W1-HOMEWORK', 1, 'B-W1-HOMEWORK-S1', 1),
  ('B-W1-HOMEWORK', 2, 'B-W1-HOMEWORK-S2', 1),
  ('B-W1-HOMEWORK', 4, 'B-W1-HOMEWORK-S3', 1),
  ('B-W1-HOMEWORK', 4, 'B-W1-HOMEWORK-S4', 2),
  ('B-W1-HOMEWORK', 7, 'B-W1-HOMEWORK-S3', 1),
  ('B-W1-HOMEWORK', 7, 'B-W1-HOMEWORK-S4', 2),
  ('B-W1-HOMEWORK', 9, 'B-W1-HOMEWORK-S4', 1),
  -- B-W2-PHONES (bước 4 tách đôi: 4 = giả định, 5 = độ tin cậy của nguồn)
  ('B-W2-PHONES', 1, 'B-W2-PHONES-S2', 1),
  ('B-W2-PHONES', 2, 'B-W2-PHONES-S1', 1),
  ('B-W2-PHONES', 4, 'B-W2-PHONES-S3', 1),
  ('B-W2-PHONES', 4, 'B-W2-PHONES-S4', 2),
  ('B-W2-PHONES', 5, 'B-W2-PHONES-S3', 1),
  ('B-W2-PHONES', 5, 'B-W2-PHONES-S4', 2),
  ('B-W2-PHONES', 8, 'B-W2-PHONES-S3', 1),
  ('B-W2-PHONES', 8, 'B-W2-PHONES-S4', 2),
  ('B-W2-PHONES', 10, 'B-W2-PHONES-S3', 1),
  -- B-W3-TRANSPORT
  ('B-W3-TRANSPORT', 1, 'B-W3-TRANSPORT-S1', 1),
  ('B-W3-TRANSPORT', 2, 'B-W3-TRANSPORT-S2', 1),
  ('B-W3-TRANSPORT', 4, 'B-W3-TRANSPORT-S3', 1),
  ('B-W3-TRANSPORT', 4, 'B-W3-TRANSPORT-S4', 2),
  ('B-W3-TRANSPORT', 7, 'B-W3-TRANSPORT-S3', 1),
  ('B-W3-TRANSPORT', 7, 'B-W3-TRANSPORT-S4', 2),
  ('B-W3-TRANSPORT', 9, 'B-W3-TRANSPORT-S3', 1),
  -- B-W4-AI-HOMEWORK
  ('B-W4-AI-HOMEWORK', 1, 'B-W4-AI-HOMEWORK-S1', 1),
  ('B-W4-AI-HOMEWORK', 2, 'B-W4-AI-HOMEWORK-S2', 1),
  ('B-W4-AI-HOMEWORK', 4, 'B-W4-AI-HOMEWORK-S3', 1),
  ('B-W4-AI-HOMEWORK', 4, 'B-W4-AI-HOMEWORK-S4', 2),
  ('B-W4-AI-HOMEWORK', 6, 'B-W4-AI-HOMEWORK-S3', 1),
  ('B-W4-AI-HOMEWORK', 6, 'B-W4-AI-HOMEWORK-S4', 2),
  ('B-W4-AI-HOMEWORK', 8, 'B-W4-AI-HOMEWORK-S4', 1),
  ('B-W4-AI-HOMEWORK', 9, 'B-W4-AI-HOMEWORK-S5', 1)
) as m(template_id, step_no, source_id, position)
where exists (select 1 from english.sources s where s.id = m.source_id and s.version = 1)
  and exists (select 1 from english.inquiry_templates t where t.id = m.template_id and t.version = 1)
on conflict do nothing;

-- All 31 rows must be there (a missing template or source would have been skipped silently by the filters above).
do $$
declare
  n integer;
begin
  select count(*) into n
  from english.template_step_sources
  where template_id in ('B-W1-HOMEWORK', 'B-W2-PHONES', 'B-W3-TRANSPORT', 'B-W4-AI-HOMEWORK');
  if n < 31 then
    raise exception '0012 expected 31 step-to-source rows for B-W1..B-W4 but found %', n;
  end if;
end $$;

insert into english.schema_migrations(version) values ('0012') on conflict do nothing;
