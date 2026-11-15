-- 0032_student_desk_reads.sql
-- W4b · Bàn học của con: bốn hàm ĐỌC cho màn Hôm nay / Đã xem / Đã làm (kế hoạch docs/superpowers/plans/2026-11-14-w4-student-desk.md, mục 3.1, 3.2, 3.9).
-- Chỉ thêm hàm: KHÔNG bảng, KHÔNG đổi purge, KHÔNG đổi hàm cũ (eng_my_home / eng_my_practice / eng_my_feedback giữ nguyên).
--  * eng_my_today()          việc con cần làm (bước bài trên app đã mở chưa nộp · bài link / PDF chưa nộp · bài sửa S6).
--  * eng_my_today_count()    đúng MỘT con số = số việc của eng_my_today() (cho Study Launcher, PRD D37).
--  * eng_my_history(...)     mọi bài con đã nộp, mới nhất trước, có "đã được người lớn xem chưa".
--  * eng_my_seen(...)        các bài mà người lớn đã làm gì đó, kèm lời góp ý (câu khen + điều cần sửa), mới xem nhất trước.
-- Học sinh được nhận diện bằng auth.uid(); chỉ `authenticated` gọi được. Không bao giờ trả: điểm, kết quả đúng/sai, %, đáp án, giải thích, nhãn kỹ năng,
-- quyết định / quan sát, ghi chú cho phụ huynh, ai duyệt. Bài của mẫu 'imported' (bài nạp) không hiện. Idempotent.

-- 1. Nội bộ: các "dòng đã làm" của một em (attempt + bài nộp link/PDF hiện hành), kèm lúc người lớn xem đầu tiên. Không ai gọi trực tiếp. --------
-- "Người lớn đã xem" = có MỘT hành động của người lớn trên chính bài đó: góp ý (S6, kể cả "Chỉ góp ý" và nhận xét kết), Đúng/Sai cho câu "cần xem" (Studio),
-- kết quả đã ghi cho lần làm Studio, quyết định duyệt S5 trên episode của nó, đánh giá bài sửa; với bài link / PDF: kết quả đã ghi cho bài giao.
-- Tự chấm của app KHÔNG phải "đã xem".
create or replace function english.eng_student_done(p_learner uuid)
returns table (
  src text, ref uuid, activity_id uuid, assignment_id uuid, title text, kind text, step_no int, activity_type text,
  submitted_at timestamptz, is_first boolean, used_hint boolean, offline boolean, seen_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select 'attempt'::text, t.id, a.id, null::uuid,
    i.snapshot -> 'template' ->> 'title_vi',
    case when t.revises_attempt_id is not null or a.mode = 'REVISION' then 'revision'
         when tp.kind = 'studio' then 'app' else 'topic' end,
    a.step_no, a.activity_type, t.submitted_at,
    t.attempt_no = 1 and t.revises_attempt_id is null,
    null::boolean,
    t.provenance in ('manual_import', 'tutor_live'),
    (select pg_catalog.min(x.at) from (
       select f.created_at as at from english.feedback_notes f where f.source_attempt_id = t.id
       union all select d.at from english.item_decisions d where d.attempt_id = t.id
       union all select r.created_at from english.results r where r.attempt_id = t.id
       union all select v.created_at from english.validation_decisions v join english.episodes e on e.id = v.episode_id where e.attempt_id = t.id
       union all select c.created_at from english.revision_checks c where c.attempt_id = t.id
     ) x)
  from english.attempts t
  join english.activity_instances a on a.id = t.activity_instance_id
  join english.inquiry_instances i on i.id = a.inquiry_instance_id
  join english.inquiry_templates tp on tp.id = i.template_id and tp.version = i.template_version and tp.kind in ('topic', 'studio')
  where t.learner_id = p_learner
  union all
  select 'submission'::text, s.id, null::uuid, g.id, g.title,
    case g.kind when 'link' then 'link' else 'paper' end,
    null::int, null::text, s.created_at,
    s.attempt = 'first',
    s.used_hint,
    s.submitted_by_role <> 'student',
    (select pg_catalog.min(r.created_at) from english.results r where r.assignment_id = g.id)
  from english.submissions s
  join english.assignments g on g.id = s.assignment_id
  where s.learner_id = p_learner
    and not exists (select 1 from english.submissions s2 where s2.supersedes_id = s.id)
    and not exists (select 1 from english.assignment_events e where e.assignment_id = g.id and e.kind = 'retracted')
$$;
revoke execute on function english.eng_student_done(uuid) from public, anon, authenticated, service_role;

-- 2. Hôm nay -------------------------------------------------------------------------------------------------------------------------
-- Một việc = bước bài trên app đã mở chưa có lần nộp nào (bài Studio = 'app', bài chủ đề = 'topic'; bước app chưa làm được vẫn là việc, có nhãn `off_label`,
-- không mở bài) · bài link / PDF chưa rút, chưa có bài nộp, chưa được ghi kết quả · bài sửa S6 đang chờ em sửa. Bước chưa đến ngày không trả.
-- practice = bài luyện (không phải bước kiểm tra tự làm): chỗ ô "Hỏi gia sư · Sắp có" mờ được hiện. Số câu: items_filled / items_total = số câu ĐÃ TRẢ LỜI trong nháp / số câu của bước (không bao giờ số câu đúng). Không "quá hạn".
create or replace function english.eng_my_today() returns jsonb
language sql stable security definer set search_path = ''
as $$
  with me as (
    select l.id from english.members m join english.learners l on l.member_id = m.id
    where m.user_id = auth.uid() and m.role = 'student'
  ),
  steps as (
    select a.id as activity_id, a.step_no, a.activity_type, a.mode, i.id as instance_id, i.due_on, i.assigned_at,
           i.snapshot -> 'template' ->> 'title_vi' as title_vi, tp.kind as tkind,
           english.eng_step_supported(a.activity_type, a.mode) as doable,
           english.eng_step_effective_date(a.id) as opens_on,
           (select x from pg_catalog.jsonb_array_elements(i.snapshot -> 'steps') as x where (x ->> 'step_no')::int = a.step_no) as step,
           d.content as draft, d.updated_at as draft_at
    from me
    join english.inquiry_instances i on i.learner_id = me.id
    join english.inquiry_templates tp on tp.id = i.template_id and tp.version = i.template_version and tp.kind in ('topic', 'studio')
    join english.activity_instances a on a.inquiry_instance_id = i.id
    left join english.working_drafts d on d.activity_instance_id = a.id and d.learner_id = me.id
    where a.mode <> 'REVISION' and a.step_no <= 1000
      and english.eng_activity_released(a.id)
      and not exists (select 1 from english.attempts t where t.activity_instance_id = a.id)
  ),
  step_items as (
    select s.*,
      pg_catalog.jsonb_array_length(coalesce(s.step -> 'items', '[]'::jsonb)) as n_total,
      case when s.draft is not null and pg_catalog.jsonb_typeof(s.draft -> 'answers') = 'object' then (
        select pg_catalog.count(*)::int from pg_catalog.jsonb_each_text(s.draft -> 'answers') e
        where pg_catalog.btrim(e.value) <> ''
          and exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(s.step -> 'items', '[]'::jsonb)) it where it ->> 'id' = e.key)
      ) else 0 end as n_filled
    from steps s
  ),
  parts as (
    select s.opens_on, s.title_vi as title,
      pg_catalog.jsonb_build_object(
        'kind', case when s.tkind = 'studio' then 'app' else 'topic' end,
        'activity_id', s.activity_id,
        'step_no', s.step_no,
        'activity_type', s.activity_type,
        'title', s.title_vi,
        'due_on', s.due_on,
        'opens_on', s.opens_on,
        'time_min', (s.step ->> 'time_min')::int,
        'doable', s.doable,
        'practice', s.mode = 'PRACTICE',
        'off_label', case when s.doable then null else english.eng_step_status_label(s.activity_type, s.mode) end,
        'has_draft', s.doable and (s.n_filled > 0 or pg_catalog.btrim(coalesce(s.draft ->> 'text', '')) <> ''),
        'draft_at', case when s.doable and (s.n_filled > 0 or pg_catalog.btrim(coalesce(s.draft ->> 'text', '')) <> '') then s.draft_at end,
        'items_filled', case when s.doable and s.n_total > 0 then s.n_filled end,
        'items_total', case when s.doable and s.n_total > 0 then s.n_total end) as obj
    from step_items s
    union all
    select (g.created_at at time zone 'Asia/Ho_Chi_Minh')::date, g.title,
      pg_catalog.jsonb_build_object(
        'kind', case g.kind when 'link' then 'link' else 'paper' end,
        'assignment_id', g.id,
        'title', g.title,
        'due_on', g.due_on,
        'opens_on', (g.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
        'time_min', null,
        'doable', true,
        'practice', true,
        'has_draft', false)
    from (
      select g2.* from english.assignments g2 join me on me.id = g2.learner_id
      where not exists (select 1 from english.assignment_events e where e.assignment_id = g2.id and e.kind = 'retracted')
        and not exists (select 1 from english.submissions s where s.assignment_id = g2.id)
        and not exists (select 1 from english.results r where r.assignment_id = g2.id)
      order by g2.created_at desc, g2.id
      limit 40) g
    union all
    select english.eng_step_effective_date(f.revision_activity_id), i.snapshot -> 'template' ->> 'title_vi',
      pg_catalog.jsonb_build_object(
        'kind', 'revision',
        'activity_id', f.revision_activity_id,
        'title', i.snapshot -> 'template' ->> 'title_vi',
        'due_on', null,
        'opens_on', english.eng_step_effective_date(f.revision_activity_id),
        'time_min', null,
        'doable', true,
        'practice', false,
        'has_draft', false)
    from english.feedback_notes f
    join me on me.id = f.learner_id
    join english.activity_instances ra on ra.id = f.revision_activity_id
    join english.inquiry_instances i on i.id = ra.inquiry_instance_id
    where f.kind = 'feedback' and f.requires_revision and english.eng_feedback_is_live(f.id)
      and not exists (select 1 from english.attempts t where t.revises_attempt_id = f.source_attempt_id)
      and not english.eng_revision_offline_answered(f.id)
      and english.eng_activity_released(f.revision_activity_id)
  )
  select pg_catalog.jsonb_build_object('items', coalesce(pg_catalog.jsonb_agg(p.obj order by p.opens_on, p.title), '[]'::jsonb))
  from parts p
$$;

-- Đúng MỘT con số: số việc của Hôm nay (Study Launcher hiện số này + mở thẳng `/`). 0 nếu không phải học sinh.
create or replace function english.eng_my_today_count() returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_array_length(english.eng_my_today() -> 'items'), 0)
$$;

-- 3. Đã làm --------------------------------------------------------------------------------------------------------------------------
-- p_before: chỉ lấy bài nộp TRƯỚC giờ này (trang sau). p_limit 1..50.
create or replace function english.eng_my_history(p_before timestamptz default null, p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_learner uuid;
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  select l.id into v_learner from english.members m join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if v_learner is null then return pg_catalog.jsonb_build_object('items', '[]'::jsonb); end if;
  return pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'src', h.src, 'ref', h.ref, 'activity_id', h.activity_id, 'assignment_id', h.assignment_id,
      'title', h.title, 'kind', h.kind, 'step_no', h.step_no, 'activity_type', h.activity_type,
      'submitted_at', h.submitted_at, 'first', h.is_first, 'used_hint', h.used_hint, 'offline', h.offline,
      'seen', h.seen_at is not null) order by h.submitted_at desc, h.ref)
    from (
      select d.* from english.eng_student_done(v_learner) d
      where p_before is null or d.submitted_at < p_before
      order by d.submitted_at desc, d.ref
      limit v_limit) h), '[]'::jsonb));
end
$$;

-- 4. Đã xem --------------------------------------------------------------------------------------------------------------------------
-- Mỗi bài người lớn đã xem: lúc xem đầu tiên (seen_at), câu khen + tối đa 3 điều cần sửa (kèm trích đoạn) nếu có góp ý còn hiệu lực, trạng thái bài sửa,
-- nhận xét kết (cho bài sửa). Không có góp ý → chỉ "đã xem". fb_state: note (chỉ góp ý) · todo (cần sửa, chưa sửa) · closed (đã xong ngoài app)
-- · revised (đã gửi bản sửa). Không trả điểm, kết quả, quyết định, ai xem.
create or replace function english.eng_my_seen(p_before timestamptz default null, p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_learner uuid;
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  select l.id into v_learner from english.members m join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if v_learner is null then return pg_catalog.jsonb_build_object('items', '[]'::jsonb); end if;
  return pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'src', h.src, 'ref', h.ref, 'activity_id', h.activity_id, 'assignment_id', h.assignment_id,
        'title', h.title, 'kind', h.kind, 'step_no', h.step_no, 'activity_type', h.activity_type,
        'submitted_at', h.submitted_at, 'seen_at', h.seen_at,
        'praise', fb.praise,
        'notes', case when fb.id is null then null else (
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', (x ->> 'n')::int, 'text', x ->> 'text', 'excerpt', x ->> 'excerpt')
                                      order by (x ->> 'n')::int)
          from pg_catalog.jsonb_array_elements(fb.items) x) end,
        'fb_state', case
          when fb.id is null then null
          when not fb.requires_revision then 'note'
          when exists (select 1 from english.attempts rt where rt.revises_attempt_id = fb.source_attempt_id) then 'revised'
          when english.eng_revision_offline_answered(fb.id) then 'closed'
          else 'todo' end,
        'revision_activity_id', case
          when fb.requires_revision
            and not exists (select 1 from english.attempts rt where rt.revises_attempt_id = fb.source_attempt_id)
            and not english.eng_revision_offline_answered(fb.id)
            and english.eng_activity_released(fb.revision_activity_id) then fb.revision_activity_id end,
        'closing_note', (select c.praise from english.feedback_notes c where c.source_attempt_id = h.ref and c.kind = 'closing')
      ) order by h.seen_at desc, h.ref)
    from (
      select d.* from english.eng_student_done(v_learner) d
      where d.seen_at is not null and (p_before is null or d.seen_at < p_before)
      order by d.seen_at desc, d.ref
      limit v_limit) h
    left join lateral (
      select f.* from english.feedback_notes f
      where h.src = 'attempt' and f.source_attempt_id = h.ref and f.kind = 'feedback' and english.eng_feedback_is_live(f.id)
      order by f.created_at desc limit 1) fb on true), '[]'::jsonb));
end
$$;

-- 5. Quyền thực thi: CHỈ authenticated (người gọi nhận diện bằng auth.uid() bên trong hàm); không anon, không public, không service_role. -----------
revoke execute on function english.eng_my_today() from public, anon, service_role;
revoke execute on function english.eng_my_today_count() from public, anon, service_role;
revoke execute on function english.eng_my_history(timestamptz, int) from public, anon, service_role;
revoke execute on function english.eng_my_seen(timestamptz, int) from public, anon, service_role;
grant execute on function english.eng_my_today() to authenticated;
grant execute on function english.eng_my_today_count() to authenticated;
grant execute on function english.eng_my_history(timestamptz, int) to authenticated;
grant execute on function english.eng_my_seen(timestamptz, int) to authenticated;

insert into english.schema_migrations(version) values ('0032') on conflict do nothing;
