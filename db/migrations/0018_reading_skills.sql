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


-- 3. Báo cáo kỹ năng đọc tháng (append-only) -----------------------------------------------------------------------------------------
create table if not exists english.reading_reports (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  -- Ngày đầu tháng của báo cáo.
  month date not null check (month = pg_catalog.date_trunc('month', month::timestamp)::date),
  source text not null default 'TOMO' check (pg_catalog.length(pg_catalog.btrim(source)) between 1 and 40),
  -- [{tag_key, questions 1..500, correct_pct 0..100}] — chỉ nhãn nhóm "Kỹ năng đọc" của track em (kiểm trong hàm ghi).
  rows jsonb not null check (pg_catalog.jsonb_typeof(rows) = 'array'),
  note text check (note is null or pg_catalog.length(note) <= 300),
  supersedes_id uuid references english.reading_reports(id),
  recorded_by_member uuid not null,
  recorded_role text not null check (recorded_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create unique index if not exists reading_reports_supersedes_once on english.reading_reports(supersedes_id) where supersedes_id is not null;
create index if not exists reading_reports_learner_idx on english.reading_reports(learner_id, month desc, recorded_at desc);

drop trigger if exists reading_reports_forbid_mutation on english.reading_reports;
create trigger reading_reports_forbid_mutation
  before update or delete on english.reading_reports
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists reading_reports_forbid_truncate on english.reading_reports;
create trigger reading_reports_forbid_truncate
  before truncate on english.reading_reports
  for each statement execute function english.eng_forbid_mutation();

alter table english.reading_reports enable row level security;
revoke all on english.reading_reports from public, anon, authenticated;
revoke update, delete, truncate on english.reading_reports from public, anon, authenticated, service_role;
grant select on english.reading_reports to authenticated;
drop policy if exists reading_reports_select on english.reading_reports;
create policy reading_reports_select on english.reading_reports
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- 4. Ghi và đọc ------------------------------------------------------------------------------------------------------------------------
-- Ghi một báo cáo tháng (gia sư hoặc phụ huynh của em). Một bản hiện hành mỗi (em, tháng, nguồn); sửa = p_supersedes (bản hiện hành
-- cùng tháng + nguồn). Gửi lại cùng client_id + cùng nội dung = trả bản cũ (replayed). Ghi audit_log (không có nội dung bài).
create or replace function english.eng_record_reading_report(
  p_learner uuid,
  p_month date,
  p_source text,
  p_rows jsonb,
  p_note text,
  p_supersedes uuid,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_source text := coalesce(nullif(pg_catalog.btrim(p_source), ''), 'TOMO');
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_today date := english.eng_today_vn();
  v_this_month date := pg_catalog.date_trunc('month', english.eng_today_vn()::timestamp)::date;
  v_old english.reading_reports%rowtype;
  v_prior english.reading_reports%rowtype;
  v_rows jsonb;
  v_id uuid;
begin
  if p_learner is null or p_month is null or p_rows is null or p_by is null or p_client_id is null then
    raise exception 'eng_record_reading_report: learner, month, rows, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_record_reading_report: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_record_reading_report: this member may not record reading reports for this learner' using errcode = '42501';
  end if;
  if p_month <> pg_catalog.date_trunc('month', p_month::timestamp)::date or p_month > v_this_month
     or p_month < (v_this_month - interval '24 months')::date then
    raise exception 'eng_record_reading_report: the month must be the first day of a month within the last 24 months (bad_month)' using errcode = '23514';
  end if;
  if pg_catalog.length(v_source) > 40 then
    raise exception 'eng_record_reading_report: the source name is too long' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 300 then
    raise exception 'eng_record_reading_report: the note is too long (note_too_long)' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' or pg_catalog.jsonb_array_length(p_rows) not between 1 and 20 then
    raise exception 'eng_record_reading_report: rows must be a list of 1 to 20 skills' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_rows) x
    where pg_catalog.jsonb_typeof(x) <> 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(x)) <> 3
       or not (x ? 'tag_key' and x ? 'questions' and x ? 'correct_pct')
       or pg_catalog.jsonb_typeof(x -> 'tag_key') <> 'string'
       or pg_catalog.jsonb_typeof(x -> 'questions') <> 'number' or pg_catalog.jsonb_typeof(x -> 'correct_pct') <> 'number'
       or (x ->> 'questions') !~ '^[0-9]{1,3}$' or (x ->> 'correct_pct') !~ '^[0-9]{1,3}$'
       or (x ->> 'questions')::int not between 1 and 500 or (x ->> 'correct_pct')::int not between 0 and 100) then
    raise exception 'eng_record_reading_report: each row needs tag_key, questions 1..500 and correct_pct 0..100 (whole numbers)' using errcode = '22023';
  end if;
  if (select count(distinct x ->> 'tag_key') from pg_catalog.jsonb_array_elements(p_rows) x) <> pg_catalog.jsonb_array_length(p_rows) then
    raise exception 'eng_record_reading_report: a skill appears twice' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_rows) x
    where not exists (
      select 1 from english.error_tags t
      where t.track_id = v_l.track_id and t.key = x ->> 'tag_key' and t.group_vi = 'Kỹ năng đọc'
        and t.retired_at is null and t.family_id is null)) then
    raise exception 'eng_record_reading_report: a row names a skill that is not a reading skill of this track' using errcode = '23514';
  end if;
  select pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object('tag_key', x ->> 'tag_key', 'questions', (x ->> 'questions')::int, 'correct_pct', (x ->> 'correct_pct')::int)
           order by x ->> 'tag_key')
    into v_rows
  from pg_catalog.jsonb_array_elements(p_rows) x;

  select * into v_old from english.reading_reports r where r.learner_id = p_learner and r.client_id = p_client_id;
  if found then
    if v_old.month = p_month and v_old.source = v_source and v_old.rows = v_rows
       and v_old.supersedes_id is not distinct from p_supersedes and v_old.note is not distinct from v_note then
      return pg_catalog.jsonb_build_object('id', v_old.id, 'replayed', true);
    end if;
    raise exception 'eng_record_reading_report: this client id was already used for another report' using errcode = '23505';
  end if;

  if p_supersedes is not null then
    select * into v_prior from english.reading_reports r where r.id = p_supersedes;
    if not found or v_prior.learner_id <> p_learner or v_prior.month <> p_month or v_prior.source <> v_source
       or exists (select 1 from english.reading_reports r2 where r2.supersedes_id = v_prior.id) then
      raise exception 'eng_record_reading_report: only the current report of the same month and source can be replaced' using errcode = '23514';
    end if;
  elsif exists (
    select 1 from english.reading_reports r
    where r.learner_id = p_learner and r.month = p_month and r.source = v_source
      and not exists (select 1 from english.reading_reports r2 where r2.supersedes_id = r.id)) then
    raise exception 'eng_record_reading_report: this month already has a report from this source (duplicate_month)' using errcode = '23505';
  end if;

  insert into english.reading_reports(learner_id, month, source, rows, note, supersedes_id, recorded_by_member, recorded_role, client_id)
  values (p_learner, p_month, v_source, v_rows, v_note, p_supersedes, p_by, v_member.role, p_client_id)
  returning id into v_id;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'reading_report.recorded', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('report_id', v_id, 'month', p_month, 'source', v_source,
                                        'skills', pg_catalog.jsonb_array_length(v_rows), 'supersedes', p_supersedes));
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- Bảng "Kỹ năng đọc" của một em: mọi kỹ năng đọc đang dùng của track (thứ tự báo cáo) với số liệu của báo cáo hiện hành MỚI NHẤT
-- và báo cáo hiện hành của tháng TRƯỚC đó, trạng thái theo ngưỡng cài đặt, và số câu sai (dấu nhãn tính được) 6 tuần gần đây.
create or replace function english.eng_reading_skills(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_min int;
  v_weak int;
  v_since date := english.eng_today_vn() - 42;
  v_latest english.reading_reports%rowtype;
  v_prev english.reading_reports%rowtype;
begin
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_reading_skills: learner not found' using errcode = 'P0002';
  end if;
  v_min := coalesce((select (s.value #>> '{}')::int from english.tutorwork_settings s where s.key = 'reading_min_questions'), 4);
  v_weak := coalesce((select (s.value #>> '{}')::int from english.tutorwork_settings s where s.key = 'reading_weak_pct'), 60);

  select * into v_latest from english.reading_reports r
  where r.learner_id = p_learner and not exists (select 1 from english.reading_reports r2 where r2.supersedes_id = r.id)
  order by r.month desc, r.recorded_at desc limit 1;
  if v_latest.id is not null then
    select * into v_prev from english.reading_reports r
    where r.learner_id = p_learner and r.month < v_latest.month
      and not exists (select 1 from english.reading_reports r2 where r2.supersedes_id = r.id)
    order by r.month desc, r.recorded_at desc limit 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'min_questions', v_min,
    'weak_pct', v_weak,
    'latest_month', v_latest.month,
    'latest_source', v_latest.source,
    'previous_month', v_prev.month,
    'skills', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'tag_key', t.key,
          'label_vi', t.label_vi,
          'questions', cur.questions,
          'correct_pct', cur.correct_pct,
          'prev_questions', prv.questions,
          'prev_correct_pct', prv.correct_pct,
          'status', case when cur.questions is null then 'none'
                         when cur.questions < v_min then 'thin'
                         when cur.correct_pct < v_weak then 'weak'
                         else 'ok' end,
          'wrong_6w', (select count(*)::int from english.tag_marks m
                       where m.learner_id = p_learner and m.tag_key = t.key and m.counts and m.marked_on >= v_since
                         and english.eng_mark_is_live(m.source, m.source_id, m.counts)))
        order by t.created_at, t.key)
      from english.error_tags t
      left join lateral (
        select (x ->> 'questions')::int as questions, (x ->> 'correct_pct')::int as correct_pct
        from pg_catalog.jsonb_array_elements(coalesce(v_latest.rows, '[]'::jsonb)) x where x ->> 'tag_key' = t.key) cur on true
      left join lateral (
        select (x ->> 'questions')::int as questions, (x ->> 'correct_pct')::int as correct_pct
        from pg_catalog.jsonb_array_elements(coalesce(v_prev.rows, '[]'::jsonb)) x where x ->> 'tag_key' = t.key) prv on true
      where t.track_id = v_l.track_id and t.group_vi = 'Kỹ năng đọc' and t.retired_at is null and t.family_id is null
    ), '[]'::jsonb));
end
$$;

revoke execute on function english.eng_record_reading_report(uuid, date, text, jsonb, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_record_reading_report(uuid, date, text, jsonb, text, uuid, uuid, text) to service_role;
revoke execute on function english.eng_reading_skills(uuid) from public, anon, authenticated;
grant execute on function english.eng_reading_skills(uuid) to service_role;

-- 5. Purge: thêm reading_reports (giữ nguyên mọi dòng của 0016; có test đối chiếu từng dòng).
create or replace function english.eng_purge_learner(
  p_learner_id uuid,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_member uuid;
  v_is_test boolean;
  v_actor_role text;
  n_audit int := 0;
  n_auto_checks int := 0;
  n_decisions int := 0;
  n_observations int := 0;
  n_notes int := 0;
  n_episodes int := 0;
  n_exposure int := 0;
  n_assistance int := 0;
  n_artifacts int := 0;
  n_attempts int := 0;
  n_drafts int := 0;
  n_events int := 0;
  n_instance_keys int := 0;
  n_activities int := 0;
  n_instances int := 0;
  n_target_sets int := 0;
  n_consents int := 0;
  n_relationships int := 0;
  n_members int := 0;
  n_tag_marks int := 0;
  n_rechecks int := 0;
  n_results int := 0;
  n_login_names int := 0;
  n_submissions int := 0;
  n_assignment_events int := 0;
  n_assignments int := 0;
  n_files int := 0;
  n_upload_tickets int := 0;
  n_reading_reports int := 0;
  v_receipt jsonb;
begin
  if p_learner_id is null then
    raise exception 'eng_purge_learner: learner id is required' using errcode = '22004';
  end if;

  select l.family_id, l.member_id, l.is_test into v_family, v_member, v_is_test
  from english.learners l where l.id = p_learner_id
  for update;

  if v_family is null then
    raise exception 'eng_purge_learner: learner % not found', p_learner_id using errcode = 'P0002';
  end if;

  select m.role into v_actor_role from english.members m where m.user_id = p_actor_user_id;

  -- Mở "cửa" purge chỉ trong transaction hiện tại.
  perform pg_catalog.set_config('app.purge_learner', p_learner_id::text, true);

  -- Thứ tự: bảng append-only của các lát sau được thêm VÀO ĐÂY (trước learners).
  -- S4 (bài làm của học sinh): con trước, cha sau. working_drafts không append-only nhưng trỏ tới activity_instances
  -- nên cũng xóa ở đây.
  -- S5 (điểm và ghi chú buổi học): con trước, cha sau — quyết định → quan sát; ghi chú buổi học sau exposure_log (khóa ngoại).
  -- S5b-1 (kết quả bài và nhãn): dấu nhãn, kiểm tra lại (trỏ tới ghi chú buổi học → xóa trước ghi chú), kết quả bài.
  delete from english.validation_decisions vd where vd.learner_id = p_learner_id;
  get diagnostics n_decisions = row_count;

  delete from english.observations ob where ob.learner_id = p_learner_id;
  get diagnostics n_observations = row_count;

  delete from english.attempt_auto_checks c where c.learner_id = p_learner_id;
  get diagnostics n_auto_checks = row_count;

  delete from english.episodes e where e.learner_id = p_learner_id;
  get diagnostics n_episodes = row_count;

  delete from english.exposure_log x where x.learner_id = p_learner_id;
  get diagnostics n_exposure = row_count;

  delete from english.tag_marks tm where tm.learner_id = p_learner_id;
  get diagnostics n_tag_marks = row_count;

  delete from english.recheck_events re where re.learner_id = p_learner_id;
  get diagnostics n_rechecks = row_count;

  delete from english.results rs where rs.learner_id = p_learner_id;
  get diagnostics n_results = row_count;

  -- S5b-1 PR B (bài luyện và file): bài nộp, sự kiện của bài giao, bài giao (kết quả trỏ tới bài giao nên đã xóa ở trên), rồi file.
  -- Các file thật nằm ở kho Storage, ngoài database: xóa bằng deleteLearnerFolder (lib/storage) - xem docs/PROGRESS.md.
  delete from english.submissions sb where sb.learner_id = p_learner_id;
  get diagnostics n_submissions = row_count;

  delete from english.assignment_events ae where ae.learner_id = p_learner_id;
  get diagnostics n_assignment_events = row_count;

  delete from english.assignments asg where asg.learner_id = p_learner_id;
  get diagnostics n_assignments = row_count;

  delete from english.files fl where fl.learner_id = p_learner_id;
  get diagnostics n_files = row_count;

  delete from english.upload_tickets ut where ut.learner_id = p_learner_id;
  get diagnostics n_upload_tickets = row_count;
  -- Studio 1A: báo cáo kỹ năng đọc tháng (không trỏ tới bảng nào khác của em ngoài learners).
  delete from english.reading_reports rr where rr.learner_id = p_learner_id;
  get diagnostics n_reading_reports = row_count;

  delete from english.lesson_notes ln where ln.learner_id = p_learner_id;
  get diagnostics n_notes = row_count;

  delete from english.assistance_events s where s.learner_id = p_learner_id;
  get diagnostics n_assistance = row_count;

  delete from english.artifact_versions v where v.learner_id = p_learner_id;
  get diagnostics n_artifacts = row_count;

  delete from english.attempts t where t.learner_id = p_learner_id;
  get diagnostics n_attempts = row_count;

  delete from english.working_drafts d where d.learner_id = p_learner_id;
  get diagnostics n_drafts = row_count;

  -- S2 (bài được giao): con trước, cha sau (khóa ngoại).
  delete from english.activity_instance_events e where e.learner_id = p_learner_id;
  get diagnostics n_events = row_count;

  delete from english.instance_item_keys k where k.learner_id = p_learner_id;
  get diagnostics n_instance_keys = row_count;

  delete from english.activity_instances a where a.learner_id = p_learner_id;
  get diagnostics n_activities = row_count;

  delete from english.inquiry_instances i where i.learner_id = p_learner_id;
  get diagnostics n_instances = row_count;

  delete from english.target_sets ts where ts.learner_id = p_learner_id;
  get diagnostics n_target_sets = row_count;

  delete from english.audit_log a where a.learner_id = p_learner_id;
  get diagnostics n_audit = row_count;

  delete from english.consents c where c.learner_id = p_learner_id;
  get diagnostics n_consents = row_count;

  delete from english.relationships r where r.learner_id = p_learner_id;
  get diagnostics n_relationships = row_count;

  delete from english.learners l where l.id = p_learner_id;

  -- S5b-1: tên đăng nhập ngắn của tài khoản học sinh bị xóa (không đụng auth.users).
  if v_member is not null then
    delete from english.login_names ln
    where ln.auth_user_id = (select m.user_id from english.members m where m.id = v_member and m.role = 'student');
    get diagnostics n_login_names = row_count;
  end if;

  -- Tài khoản học sinh trong app này (không đụng auth.users).
  if v_member is not null then
    delete from english.members m where m.id = v_member and m.role = 'student';
    get diagnostics n_members = row_count;
  end if;

  -- Đóng "cửa" trước khi ghi biên nhận.
  perform pg_catalog.set_config('app.purge_learner', '', true);

  v_receipt := pg_catalog.jsonb_build_object(
    'learner_id', p_learner_id,
    'was_test', v_is_test,
    'deleted', pg_catalog.jsonb_build_object(
      'audit_log', n_audit,
      'target_sets', n_target_sets,
      'inquiry_instances', n_instances,
      'activity_instances', n_activities,
      'instance_item_keys', n_instance_keys,
      'activity_instance_events', n_events,
      'consents', n_consents,
      'relationships', n_relationships,
      'attempt_auto_checks', n_auto_checks,
      'episodes', n_episodes,
      'exposure_log', n_exposure,
      'assistance_events', n_assistance,
      'artifact_versions', n_artifacts,
      'attempts', n_attempts,
      'working_drafts', n_drafts,
      'validation_decisions', n_decisions,
      'observations', n_observations,
      'lesson_notes', n_notes,
      'tag_marks', n_tag_marks,
      'recheck_events', n_rechecks,
      'results', n_results,
      'submissions', n_submissions,
      'assignment_events', n_assignment_events,
      'assignments', n_assignments,
      'files', n_files,
      'upload_tickets', n_upload_tickets,
      'reading_reports', n_reading_reports,
      'login_names', n_login_names,
      'learners', 1,
      'members', n_members
    ),
    'note', 'Backups expire after 30 days.'
  );

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (p_actor_user_id, v_actor_role, 'learner.purged', v_family, p_learner_id, v_receipt);

  return v_receipt;
end
$$;

revoke execute on function english.eng_purge_learner(uuid, uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_learner(uuid, uuid) to service_role;

-- Đếm trước khi xóa: thêm reading_reports (giữ nguyên mọi dòng của 0017).
create or replace function english.eng_purge_preview(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_user uuid;
begin
  if p_learner is null then
    raise exception 'eng_purge_preview: learner id is required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_purge_preview: learner not found' using errcode = 'P0002';
  end if;
  select m.user_id into v_user from english.members m where m.id = v_l.member_id and m.role = 'student';

  return pg_catalog.jsonb_build_object(
    'learner_id', p_learner,
    'alias', v_l.alias,
    'is_test', v_l.is_test,
    'counts', pg_catalog.jsonb_build_object(
      'audit_log', (select pg_catalog.count(*) from english.audit_log x where x.learner_id = p_learner),
      'target_sets', (select pg_catalog.count(*) from english.target_sets x where x.learner_id = p_learner),
      'inquiry_instances', (select pg_catalog.count(*) from english.inquiry_instances x where x.learner_id = p_learner),
      'activity_instances', (select pg_catalog.count(*) from english.activity_instances x where x.learner_id = p_learner),
      'instance_item_keys', (select pg_catalog.count(*) from english.instance_item_keys x where x.learner_id = p_learner),
      'activity_instance_events', (select pg_catalog.count(*) from english.activity_instance_events x where x.learner_id = p_learner),
      'consents', (select pg_catalog.count(*) from english.consents x where x.learner_id = p_learner),
      'relationships', (select pg_catalog.count(*) from english.relationships x where x.learner_id = p_learner),
      'attempt_auto_checks', (select pg_catalog.count(*) from english.attempt_auto_checks x where x.learner_id = p_learner),
      'episodes', (select pg_catalog.count(*) from english.episodes x where x.learner_id = p_learner),
      'exposure_log', (select pg_catalog.count(*) from english.exposure_log x where x.learner_id = p_learner),
      'assistance_events', (select pg_catalog.count(*) from english.assistance_events x where x.learner_id = p_learner),
      'artifact_versions', (select pg_catalog.count(*) from english.artifact_versions x where x.learner_id = p_learner),
      'attempts', (select pg_catalog.count(*) from english.attempts x where x.learner_id = p_learner),
      'working_drafts', (select pg_catalog.count(*) from english.working_drafts x where x.learner_id = p_learner),
      'validation_decisions', (select pg_catalog.count(*) from english.validation_decisions x where x.learner_id = p_learner),
      'observations', (select pg_catalog.count(*) from english.observations x where x.learner_id = p_learner),
      'lesson_notes', (select pg_catalog.count(*) from english.lesson_notes x where x.learner_id = p_learner),
      'tag_marks', (select pg_catalog.count(*) from english.tag_marks x where x.learner_id = p_learner),
      'recheck_events', (select pg_catalog.count(*) from english.recheck_events x where x.learner_id = p_learner),
      'results', (select pg_catalog.count(*) from english.results x where x.learner_id = p_learner),
      'submissions', (select pg_catalog.count(*) from english.submissions x where x.learner_id = p_learner),
      'assignment_events', (select pg_catalog.count(*) from english.assignment_events x where x.learner_id = p_learner),
      'assignments', (select pg_catalog.count(*) from english.assignments x where x.learner_id = p_learner),
      'files', (select pg_catalog.count(*) from english.files x where x.learner_id = p_learner),
      'upload_tickets', (select pg_catalog.count(*) from english.upload_tickets x where x.learner_id = p_learner),
      'reading_reports', (select pg_catalog.count(*) from english.reading_reports x where x.learner_id = p_learner),
      'login_names', (select pg_catalog.count(*) from english.login_names x where x.auth_user_id = v_user),
      'learners', 1,
      'members', (select pg_catalog.count(*) from english.members x where x.id = v_l.member_id and x.role = 'student')));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0018') on conflict do nothing;
