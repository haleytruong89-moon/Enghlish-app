-- 0034_result_view_retry.sql
-- W4c2 (kế hoạch docs/superpowers/plans/2026-11-14-w4-student-desk.md, PR W4c2; phụ huynh duyệt 14/11: Q2(f), Q3, Q4):
--   1. work_test_marks (chỉ thêm): cờ "Bài kiểm tra" của một bài (bước bài trên app HOẶC bài link / PDF), đặt khi giao; dòng mới nhất thắng;
--      chỉ đặt được TRƯỚC lần nộp đầu. Chỉ đổi giao diện: không đổi mode, không đổi cách S7a / điểm đếm.
--   2. eng_set_test_mark · eng_assign_studio_v2 (bọc v1 + cờ) · eng_create_assignment_v3 (bọc v2 + cờ): service_role sau requireAccess.
--   3. item_retries (chỉ thêm): MỘT lần thử lại cho mỗi câu (chỉ bài luyện tập, lần làm mới nhất, câu sai / bỏ trống). KHÔNG là bằng chứng.
--      eng_my_retry_item (con ghi); eng_item_retries (người lớn đọc, service_role).
--   4. eng_my_result_view (con đọc): câu nên nhìn lại + câu viết tự do + "các câu còn lại ổn" (một cờ, không số). KHÔNG đáp án, giải thích, số đúng.
--      eng_my_test_marks (con đọc): mã bài của chính con được coi là bài kiểm tra.
--   5. Thu quyền eng_my_studio_review khỏi authenticated (Q3): trình duyệt của con không lấy được "Nên là / Vì sao" nữa.
--   6. eng_purge_learner / eng_purge_preview: chép NGUYÊN thân 0033 + 2 bảng (trước submissions / attempts).
-- Idempotent; chỉ thêm. Không đụng schema public. Cần 0024 + 0033 đã áp.

-- 1. Cờ "Bài kiểm tra" ---------------------------------------------------------------------------------------------------------
create table if not exists english.work_test_marks (
  id bigint generated always as identity primary key,
  learner_id uuid not null references english.learners(id),
  activity_id uuid references english.activity_instances(id),
  assignment_id uuid references english.assignments(id),
  is_test boolean not null,
  by_member uuid not null,                       -- english.members.id, no FK (like session_marks.by_member)
  by_role text not null check (by_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 110),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  check ((activity_id is null) <> (assignment_id is null))
);
create index if not exists work_test_marks_activity_idx on english.work_test_marks(activity_id, id desc) where activity_id is not null;
create index if not exists work_test_marks_assignment_idx on english.work_test_marks(assignment_id, id desc) where assignment_id is not null;
create index if not exists work_test_marks_learner_idx on english.work_test_marks(learner_id);

-- 3a. Một lần thử lại cho mỗi câu --------------------------------------------------------------------------------------------------
create table if not exists english.item_retries (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  attempt_id uuid not null references english.attempts(id),
  activity_id uuid not null references english.activity_instances(id),
  item_id text not null check (pg_catalog.length(item_id) between 1 and 40),
  answer text not null check (pg_catalog.length(pg_catalog.btrim(answer)) between 1 and 500),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, item_id),
  unique (learner_id, client_id)
);
create index if not exists item_retries_learner_idx on english.item_retries(learner_id, created_at desc);
create index if not exists item_retries_activity_idx on english.item_retries(activity_id);

-- 2. Chỉ thêm (đầu 0004) + RLS: người lớn của em đọc; học sinh không SELECT bảng nào (chỉ qua eng_my_*); không ai ghi trực tiếp -----
do $$
declare
  t text;
begin
  foreach t in array array['work_test_marks', 'item_retries'] loop
    execute pg_catalog.format('drop trigger if exists %I on english.%I', t || '_forbid_mutation', t);
    execute pg_catalog.format('create trigger %I before update or delete on english.%I for each row execute function english.eng_forbid_mutation(%L)', t || '_forbid_mutation', t, 'learner_id');
    execute pg_catalog.format('drop trigger if exists %I on english.%I', t || '_forbid_truncate', t);
    execute pg_catalog.format('create trigger %I before truncate on english.%I for each statement execute function english.eng_forbid_mutation()', t || '_forbid_truncate', t);
    execute pg_catalog.format('alter table english.%I enable row level security', t);
    execute pg_catalog.format('revoke all on english.%I from public, anon, authenticated', t);
    execute pg_catalog.format('revoke insert, update, delete, truncate on english.%I from service_role', t);
    execute pg_catalog.format('grant select on english.%I to authenticated', t);
    execute pg_catalog.format('drop policy if exists %I on english.%I', t || '_select', t);
    execute pg_catalog.format('create policy %I on english.%I for select to authenticated using (english.eng_is_staff_of(learner_id))', t || '_select', t);
  end loop;
end
$$;

-- 2a. Bài này (bước bài trên app) có phải bài kiểm tra không: bước INDEPENDENT_CHECK của bài chủ đề (như hiện nay) hoặc cờ mới nhất = true.
create or replace function english.eng_work_is_test(p_activity uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select a.mode = 'INDEPENDENT_CHECK'
         or coalesce((select m.is_test from english.work_test_marks m where m.activity_id = a.id order by m.id desc limit 1), false)
  from english.activity_instances a where a.id = p_activity
$$;
revoke execute on function english.eng_work_is_test(uuid) from public, anon, authenticated, service_role;

-- 2b. Đặt / đổi cờ (người lớn). Quyền của người thao tác TRƯỚC mọi kiểm khác. Chỉ trước lần nộp đầu: (already_started).
create or replace function english.eng_set_test_mark(p_ref_kind text, p_ref_id uuid, p_is_test boolean, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_learner uuid;
  v_role text;
  v_old english.work_test_marks%rowtype;
  v_id bigint;
begin
  if p_ref_kind is null or p_ref_id is null or p_is_test is null or p_by is null or p_client_id is null then
    raise exception 'eng_set_test_mark: kind, id, flag, actor and client id are required' using errcode = '22004';
  end if;
  if p_ref_kind not in ('activity', 'assignment') then
    raise exception 'eng_set_test_mark: kind must be activity or assignment (bad_kind)' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_client_id)) not between 8 and 110 then
    raise exception 'eng_set_test_mark: client_id must be 8..110 characters' using errcode = '22023';
  end if;
  -- Vai của người thao tác TRƯỚC khi tìm bài: không phân biệt "không có bài" với "không phải việc của bạn" (không lộ bài có tồn tại).
  select m.role into v_role from english.members m where m.id = p_by;
  if v_role is null or v_role not in ('tutor', 'parent') then
    raise exception 'eng_set_test_mark: this member may not change this work (staff_only)' using errcode = '42501';
  end if;
  if p_ref_kind = 'activity' then
    select a.learner_id into v_learner from english.activity_instances a where a.id = p_ref_id;
  else
    select a.learner_id into v_learner from english.assignments a where a.id = p_ref_id;
  end if;
  if v_learner is null or not english.eng_actor_may_manage(p_by, v_learner) then
    raise exception 'eng_set_test_mark: this member may not change this work (staff_only)' using errcode = '42501';
  end if;

  select * into v_old from english.work_test_marks m where m.learner_id = v_learner and m.client_id = p_client_id;
  if found then
    if v_old.is_test is distinct from p_is_test or v_old.activity_id is distinct from (case when p_ref_kind = 'activity' then p_ref_id end)
       or v_old.assignment_id is distinct from (case when p_ref_kind = 'assignment' then p_ref_id end) then
      raise exception 'eng_set_test_mark: client_id was already used for another mark (client_id_reused)' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_old.id, 'is_test', v_old.is_test, 'replayed', true);
  end if;

  if p_ref_kind = 'activity' then
    if exists (select 1 from english.attempts t where t.activity_instance_id = p_ref_id) then
      raise exception 'eng_set_test_mark: the child already sent this work (already_started)' using errcode = '23514';
    end if;
  elsif exists (select 1 from english.submissions s where s.assignment_id = p_ref_id)
        or exists (select 1 from english.results r where r.assignment_id = p_ref_id) then
    raise exception 'eng_set_test_mark: the child already sent this work (already_started)' using errcode = '23514';
  end if;

  insert into english.work_test_marks(learner_id, activity_id, assignment_id, is_test, by_member, by_role, client_id)
  values (v_learner, case when p_ref_kind = 'activity' then p_ref_id end, case when p_ref_kind = 'assignment' then p_ref_id end,
          p_is_test, p_by, v_role, p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'is_test', p_is_test, 'replayed', false);
end
$$;
revoke execute on function english.eng_set_test_mark(text, uuid, boolean, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_set_test_mark(text, uuid, boolean, uuid, text) to service_role;

-- 2c. Giao bài Studio v2 = v1 (0024, không đổi) + cờ trong cùng giao dịch. Gửi lại: v1 trả bài cũ, cờ đã có (cùng client_id) thì giữ nguyên.
create or replace function english.eng_assign_studio_v2(p_draft uuid, p_start date, p_due date, p_is_test boolean, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_r jsonb;
begin
  v_r := english.eng_assign_studio(p_draft, p_start, p_due, p_by, p_client_id);   -- kiểm người thao tác, quyền, bản đã duyệt, ngày
  if (v_r ->> 'replayed')::boolean then
    -- Gửi lại cùng client_id: loại bài phải giống lần đầu (có dấu = bài kiểm tra, không dấu = luyện tập); khác → client_id_reused (như v3).
    if exists (select 1 from english.work_test_marks m where m.activity_id = (v_r ->> 'activity_id')::uuid and m.client_id = p_client_id || ':test')
       is distinct from coalesce(p_is_test, false) then
      raise exception 'eng_assign_studio_v2: client_id was already used for a different kind of work (client_id_reused)' using errcode = '23505';
    end if;
  elsif coalesce(p_is_test, false) then
    perform english.eng_set_test_mark('activity', (v_r ->> 'activity_id')::uuid, true, p_by, p_client_id || ':test');
  end if;
  return v_r;
end
$$;
revoke execute on function english.eng_assign_studio_v2(uuid, date, date, boolean, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_assign_studio_v2(uuid, date, date, boolean, uuid, text) to service_role;

-- 2d. Giao bài link / PDF v3 = v2 (0029, không đổi) + cờ trong cùng giao dịch.
create or replace function english.eng_create_assignment_v3(
  p_learner uuid, p_kind text, p_url text, p_title text, p_tag_keys text[], p_due_on date, p_frame uuid, p_files jsonb,
  p_by uuid, p_client_id text, p_units jsonb, p_is_test boolean
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_r jsonb;
  v_replay boolean;
begin
  v_replay := exists (select 1 from english.assignments a where a.learner_id = p_learner and a.client_id = p_client_id);
  v_r := english.eng_create_assignment_v2(p_learner, p_kind, p_url, p_title, p_tag_keys, p_due_on, p_frame, p_files, p_by, p_client_id, p_units);
  if v_replay then
    -- Gửi lại cùng client_id: loại bài phải giống lần đầu; khác → client_id_reused (như eng_assign_studio_v2).
    if exists (select 1 from english.work_test_marks m where m.learner_id = p_learner and m.client_id = p_client_id || ':test')
       is distinct from coalesce(p_is_test, false) then
      raise exception 'eng_create_assignment_v3: client_id was already used for a different kind of work (client_id_reused)' using errcode = '23505';
    end if;
  elsif coalesce(p_is_test, false) then
    perform english.eng_set_test_mark('assignment', (v_r ->> 'id')::uuid, true, p_by, p_client_id || ':test');
  end if;
  return v_r;
end
$$;
revoke execute on function english.eng_create_assignment_v3(uuid, text, text, text, text[], date, uuid, jsonb, uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function english.eng_create_assignment_v3(uuid, text, text, text, text[], date, uuid, jsonb, uuid, text, jsonb, boolean) to service_role;

-- 4a. Mã bài của CHÍNH con được coi là bài kiểm tra (cờ hoặc bước tự kiểm). Không trả gì khác.
create or replace function english.eng_my_test_marks() returns jsonb
language sql stable security definer set search_path = ''
as $$
  with me as (
    select l.id from english.members m join english.learners l on l.member_id = m.id
    where m.user_id = auth.uid() and m.role = 'student'
  )
  select pg_catalog.jsonb_build_object(
    'activity_ids', coalesce((
      select pg_catalog.jsonb_agg(a.id order by a.id)
      from english.activity_instances a join me on me.id = a.learner_id
      where english.eng_activity_released(a.id) and english.eng_work_is_test(a.id)), '[]'::jsonb),
    'assignment_ids', coalesce((
      select pg_catalog.jsonb_agg(g.id order by g.id)
      from english.assignments g join me on me.id = g.learner_id
      where coalesce((select m.is_test from english.work_test_marks m where m.assignment_id = g.id order by m.id desc limit 1), false)), '[]'::jsonb))
$$;
revoke execute on function english.eng_my_test_marks() from public, anon, service_role;
grant execute on function english.eng_my_test_marks() to authenticated;

-- 3b. Màn sau khi nộp (S-10). Lần làm MỚI NHẤT của con trên bước đó. Chỉ: câu nên nhìn lại (đề, câu con viết / bỏ trống, lần thử lại đã gửi,
--     còn thử được không), câu cần người đọc (viết tự do / chưa chấm), cờ "các câu còn lại ổn". KHÔNG đáp án, giải thích, danh sách
--     câu đúng, số câu đúng / sai. Chưa nộp / bước viết (không có tự chấm) / không phải bài của con / chưa mở: null.
create or replace function english.eng_my_result_view(p_activity uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_act english.activity_instances%rowtype;
  v_inst english.inquiry_instances%rowtype;
  v_t english.attempts%rowtype;
  v_checks jsonb;
  v_answers jsonb;
  v_step jsonb;
  v_test boolean;
  v_look jsonb;
  v_open jsonb;
  v_others boolean;
  v_rows jsonb;
begin
  select m.id into v_member from english.members m where m.user_id = auth.uid() and m.role = 'student';
  if v_member is null then return null; end if;
  select a.* into v_act
  from english.activity_instances a join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member;
  if not found or not english.eng_activity_released(p_activity) then return null; end if;
  select * into v_inst from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  select t.* into v_t from english.attempts t where t.activity_instance_id = p_activity order by t.attempt_no desc limit 1;
  if not found then return null; end if;
  select c.checks into v_checks from english.attempt_auto_checks c where c.attempt_id = v_t.id;
  if v_checks is null then return null; end if;
  select av.content -> 'answers' into v_answers from english.artifact_versions av
  where av.attempt_id = v_t.id and av.kind = 'answers' order by av.version desc limit 1;
  select x into v_step from pg_catalog.jsonb_array_elements(v_inst.snapshot -> 'steps') as x where (x ->> 'step_no')::int = v_act.step_no;
  v_test := english.eng_work_is_test(p_activity);

  -- Mỗi câu của bước: thứ tự, mã, đề, câu con viết, kết quả hiệu lực (câu 'needs_person' lấy Đúng/Sai của người lớn; chưa có = null).
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'ord', o, 'id', it ->> 'id', 'stem', it ->> 'stem', 'given', coalesce(v_answers ->> (it ->> 'id'), ''),
           'res', case when v_checks -> 'items' -> (it ->> 'id') ->> 'result' = 'needs_person'
                       then (select d.result from english.item_decisions d where d.attempt_id = v_t.id and d.item_id = it ->> 'id')
                       else v_checks -> 'items' -> (it ->> 'id') ->> 'result' end) order by o)
    into v_rows
  from pg_catalog.jsonb_array_elements(coalesce(v_step -> 'items', '[]'::jsonb)) with ordinality as t(it, o);
  v_rows := coalesce(v_rows, '[]'::jsonb);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id', r ->> 'id',
           'n', coalesce(nullif(pg_catalog.substring(r ->> 'id', '^q([1-9][0-9]{0,2})$'), '')::int, (r ->> 'ord')::int),
           'stem', r ->> 'stem', 'given', r ->> 'given',
           'retry', (select pg_catalog.jsonb_build_object('text', x.answer) from english.item_retries x where x.attempt_id = v_t.id and x.item_id = r ->> 'id'),
           'can_retry', not v_test and not exists (select 1 from english.item_retries x where x.attempt_id = v_t.id and x.item_id = r ->> 'id'))
         order by (r ->> 'ord')::int), '[]'::jsonb)
    into v_look
  from pg_catalog.jsonb_array_elements(v_rows) r where r ->> 'res' in ('incorrect', 'blank');
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id', r ->> 'id',
           'n', coalesce(nullif(pg_catalog.substring(r ->> 'id', '^q([1-9][0-9]{0,2})$'), '')::int, (r ->> 'ord')::int),
           'stem', r ->> 'stem', 'given', r ->> 'given') order by (r ->> 'ord')::int), '[]'::jsonb)
    into v_open
  from pg_catalog.jsonb_array_elements(v_rows) r where r ->> 'res' is null;
  select exists (select 1 from pg_catalog.jsonb_array_elements(v_rows) r where r ->> 'res' = 'correct') into v_others;

  return pg_catalog.jsonb_build_object(
    'attempt_no', v_t.attempt_no, 'submitted_at', v_t.submitted_at, 'is_test', v_test,
    'look', v_look, 'open', v_open, 'others_fine', v_others);
end
$$;
revoke execute on function english.eng_my_result_view(uuid) from public, anon, service_role;
grant execute on function english.eng_my_result_view(uuid) to authenticated;

-- 3c. Con gửi MỘT lần thử lại cho một câu. Chỉ bài luyện tập; lần làm mới nhất; câu sai / bỏ trống (hoặc người lớn đã chấm Sai); một lần mỗi câu.
create or replace function english.eng_my_retry_item(p_activity uuid, p_item text, p_answer text, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_learner uuid;
  v_act english.activity_instances%rowtype;
  v_inst english.inquiry_instances%rowtype;
  v_t english.attempts%rowtype;
  v_checks jsonb;
  v_step jsonb;
  v_res text;
  v_text text := pg_catalog.btrim(coalesce(p_answer, ''));
  v_old english.item_retries%rowtype;
  v_id uuid;
begin
  select m.id, l.id into v_member, v_learner
  from english.members m join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if v_member is null then
    raise exception 'eng_my_retry_item: only the learner may retry (not signed in as a student)' using errcode = '42501';
  end if;
  if p_activity is null or p_item is null or p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) not between 8 and 100 then
    raise exception 'eng_my_retry_item: activity, item and client id (8..100 characters) are required' using errcode = '22004';
  end if;
  select a.* into v_act from english.activity_instances a where a.id = p_activity and a.learner_id = v_learner;
  if not found or not english.eng_activity_released(p_activity) then
    raise exception 'eng_my_retry_item: activity not found (not_found)' using errcode = 'P0002';
  end if;
  if pg_catalog.length(v_text) not between 1 and 500 then
    raise exception 'eng_my_retry_item: the new answer is 1 to 500 characters (bad_answer)' using errcode = '22023';
  end if;

  -- Gửi lại cùng client_id: cùng biên nhận; khác nội dung → 23505.
  select * into v_old from english.item_retries r where r.learner_id = v_learner and r.client_id = p_client_id;
  if found then
    if v_old.activity_id <> p_activity or v_old.item_id <> p_item or v_old.answer <> v_text then
      raise exception 'eng_my_retry_item: client_id was already used for another retry (client_id_reused)' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_old.id, 'replayed', true);
  end if;

  if english.eng_work_is_test(p_activity) then
    raise exception 'eng_my_retry_item: a test has no retry (test_no_retry)' using errcode = '23514';
  end if;
  select t.* into v_t from english.attempts t where t.activity_instance_id = p_activity order by t.attempt_no desc limit 1;
  if not found then
    raise exception 'eng_my_retry_item: send the work first (not_sent)' using errcode = '23514';
  end if;
  select c.checks into v_checks from english.attempt_auto_checks c where c.attempt_id = v_t.id;
  select * into v_inst from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  select x into v_step from pg_catalog.jsonb_array_elements(v_inst.snapshot -> 'steps') as x where (x ->> 'step_no')::int = v_act.step_no;
  if v_checks is null
     or not exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(v_step -> 'items', '[]'::jsonb)) it where it ->> 'id' = p_item) then
    raise exception 'eng_my_retry_item: this item is not part of the step (bad_item)' using errcode = '22023';
  end if;
  v_res := v_checks -> 'items' -> p_item ->> 'result';
  if v_res = 'needs_person' then
    v_res := (select d.result from english.item_decisions d where d.attempt_id = v_t.id and d.item_id = p_item);
  end if;
  if v_res is null or v_res not in ('incorrect', 'blank') then
    raise exception 'eng_my_retry_item: this item is not one to look at again (not_retryable)' using errcode = '23514';
  end if;
  if exists (select 1 from english.item_retries r where r.attempt_id = v_t.id and r.item_id = p_item) then
    raise exception 'eng_my_retry_item: this item was already retried (already_retried)' using errcode = '23505';
  end if;

  insert into english.item_retries(learner_id, attempt_id, activity_id, item_id, answer, client_id)
  values (v_learner, v_t.id, p_activity, p_item, v_text, p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;
revoke execute on function english.eng_my_retry_item(uuid, text, text, text) from public, anon, service_role;
grant execute on function english.eng_my_retry_item(uuid, text, text, text) to authenticated;

-- 3d. Người lớn đọc các lần thử lại của một em (mới nhất trước): đề, câu con viết, lần thử lại. Chỉ đọc; chưa có "đã xem" (xem PROGRESS: câu hỏi mở).
create or replace function english.eng_item_retries(p_learner uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id', r.id, 'activity_id', r.activity_id, 'attempt_id', r.attempt_id, 'item_id', r.item_id, 'retry', r.answer, 'at', r.created_at,
           'title', i.snapshot -> 'template' ->> 'title_vi',
           'stem', (select it ->> 'stem' from pg_catalog.jsonb_array_elements(coalesce(
                      (select x -> 'items' from pg_catalog.jsonb_array_elements(i.snapshot -> 'steps') x where (x ->> 'step_no')::int = a.step_no), '[]'::jsonb)) it
                    where it ->> 'id' = r.item_id),
           'given', coalesce((select av.content -> 'answers' ->> r.item_id from english.artifact_versions av
                              where av.attempt_id = r.attempt_id and av.kind = 'answers' order by av.version desc limit 1), ''))
         order by r.created_at desc, r.id), '[]'::jsonb)
  from english.item_retries r
  join english.activity_instances a on a.id = r.activity_id
  join english.inquiry_instances i on i.id = a.inquiry_instance_id
  where r.learner_id = p_learner
$$;
revoke execute on function english.eng_item_retries(uuid) from public, anon, authenticated;
grant execute on function english.eng_item_retries(uuid) to service_role;

-- 3e. Người lớn: lần thử lại CHƯA có người lớn làm gì sau đó (cho Chờ duyệt "Con thử lại n câu" và màn xem). Cùng kiểu eng_studio_pending:
--     người thao tác (p_by) là phụ huynh của gia đình / gia sư còn hiệu lực của em; em thật chỉ khi p_allow_real.
--     "Người lớn làm gì đó với lần làm này" = góp ý bài (feedback_notes), quyết định một câu (item_decisions), Kết quả bài (results),
--     quyết định duyệt (validation_decisions của episode). Lần thử lại hết chờ khi có việc như vậy MUỘN HƠN nó; không có bảng "đã xem" mới.
create or replace function english.eng_retry_pending(p_by uuid, p_allow_real boolean default false) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with ls as (
    select l.id, l.alias, l.is_test
    from english.learners l
    join english.members m on m.id = p_by and m.role in ('tutor', 'parent')
    where english.eng_actor_may_manage(p_by, l.id) and (l.is_test or p_allow_real)
  ),
  att as (
    select t.id as attempt_id, t.learner_id, t.activity_instance_id, t.submitted_at, ls.alias, ls.is_test,
           i.snapshot, a.step_no,
           (select pg_catalog.max(x.at) from (
              select f.created_at as at from english.feedback_notes f where f.source_attempt_id = t.id
              union all select d.at from english.item_decisions d where d.attempt_id = t.id
              union all select r.created_at from english.results r where r.attempt_id = t.id
              union all select v.created_at from english.validation_decisions v join english.episodes e on e.id = v.episode_id where e.attempt_id = t.id
            ) x) as last_action,
           (select av.content -> 'answers' from english.artifact_versions av
            where av.attempt_id = t.id and av.kind = 'answers' order by av.version desc limit 1) as answers
    from english.attempts t
    join ls on ls.id = t.learner_id
    join english.activity_instances a on a.id = t.activity_instance_id
    join english.inquiry_instances i on i.id = a.inquiry_instance_id
    where exists (select 1 from english.item_retries r where r.attempt_id = t.id)
  ),
  waiting as (
    select att.attempt_id, r.item_id, r.answer, r.created_at as at, q.x, q.o
    from att
    join english.item_retries r on r.attempt_id = att.attempt_id and (att.last_action is null or r.created_at > att.last_action)
    cross join lateral (
      select st.s from pg_catalog.jsonb_array_elements(att.snapshot -> 'steps') as st(s) where (st.s ->> 'step_no')::int = att.step_no
    ) step
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(step.s -> 'items', '[]'::jsonb)) with ordinality as q(x, o)
    where q.x ->> 'id' = r.item_id
  )
  select pg_catalog.jsonb_build_object(
    'count', (select pg_catalog.count(*) from waiting),
    'items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'attempt_id', att.attempt_id, 'learner_id', att.learner_id, 'alias', att.alias, 'is_test', att.is_test,
      'activity_id', att.activity_instance_id, 'title', att.snapshot -> 'template' ->> 'title_vi', 'submitted_at', att.submitted_at,
      'since', (select pg_catalog.min(w.at) from waiting w where w.attempt_id = att.attempt_id),
      'retries', (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                 'item_id', w.item_id,
                 'n', coalesce(nullif(pg_catalog.substring(w.item_id, '^q([1-9][0-9]{0,2})$'), '')::int, w.o::int),
                 'stem', w.x ->> 'stem', 'given', coalesce(att.answers ->> w.item_id, ''), 'retry', w.answer, 'at', w.at)
               order by w.o)
        from waiting w where w.attempt_id = att.attempt_id))
      order by (select pg_catalog.min(w.at) from waiting w where w.attempt_id = att.attempt_id), att.attempt_id), '[]'::jsonb))
  from att
  where exists (select 1 from waiting w where w.attempt_id = att.attempt_id)
$$;
revoke execute on function english.eng_retry_pending(uuid, boolean) from public, anon, authenticated;
grant execute on function english.eng_retry_pending(uuid, boolean) to service_role;

-- 5. Q3: con không còn lấy được "Nên là / Vì sao". Hàm giữ nguyên thân (0024) cho người xem lại; không ai gọi được từ trình duyệt.
revoke execute on function english.eng_my_studio_review(uuid) from public, anon, authenticated, service_role;


-- 6. Xóa dữ liệu một em: = bản 0033 + item_retries, work_test_marks (xóa TRƯỚC attempts / submissions / activity_instances / assignments).
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
  n_assignment_units int := 0;
  n_session_marks int := 0;
  n_session_absences int := 0;
  n_roadmap_milestones int := 0;
  n_roadmap_main_curriculum int := 0;
  n_submission_feedback int := 0;
  n_item_retries int := 0;
  n_work_test_marks int := 0;
  n_files int := 0;
  n_upload_tickets int := 0;
  n_reading_reports int := 0;
  n_level_decisions int := 0;
  n_external_results int := 0;
  n_feedback_notes int := 0;
  n_revision_marks int := 0;
  n_revision_checks int := 0;
  n_mastery_decisions int := 0;
  n_competency_state int := 0;
  n_episode_marks int := 0;
  n_item_decisions int := 0;
  n_accepted_additions int := 0;
  n_studio_item_meta int := 0;
  n_studio_drafts int := 0;
  n_studio_step_sources int := 0;
  n_studio_sources int := 0;
  n_studio_template_keys int := 0;
  n_studio_templates int := 0;
  n_studio_frames int := 0;
  n_teaching_notes int := 0;
  n_learner_intake int := 0;
  n_curricula int := 0;
  n_curriculum_versions int := 0;
  n_curriculum_units int := 0;
  n_curriculum_unit_points int := 0;
  n_curriculum_unit_events int := 0;
  n_lesson_note_units int := 0;
  n_point_state int := 0;
  n_point_decisions int := 0;
  n_import_batches int := 0;
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
  -- S7a: trạng thái kỹ năng (bảng dẫn xuất, trỏ tới mastery_decisions) rồi sổ quyết định kỹ năng (tự trỏ responds_to: xóa một lệnh), rồi dấu "chủ đề mới" (trỏ episodes).
  -- W3: trạng thái điểm trước sổ điểm (khóa ngoại), cả hai trước attempts (bằng chứng chỉ là chữ, không khóa ngoại).
  delete from english.point_state ps where ps.learner_id = p_learner_id;
  get diagnostics n_point_state = row_count;

  delete from english.point_decisions pd where pd.learner_id = p_learner_id;
  get diagnostics n_point_decisions = row_count;

  delete from english.competency_state cs where cs.learner_id = p_learner_id;
  get diagnostics n_competency_state = row_count;

  delete from english.mastery_decisions md where md.learner_id = p_learner_id;
  get diagnostics n_mastery_decisions = row_count;

  delete from english.episode_marks em where em.learner_id = p_learner_id;
  get diagnostics n_episode_marks = row_count;

  -- W1: ghi chú dạy học và hồ sơ đầu vào (chỉ trỏ tới learners).
  delete from english.teaching_notes tn where tn.learner_id = p_learner_id;
  get diagnostics n_teaching_notes = row_count;

  delete from english.learner_intake li where li.learner_id = p_learner_id;
  get diagnostics n_learner_intake = row_count;

  -- 0029: Unit của bài giao trỏ tới curriculum_units/curricula nên xóa TRƯỚC giáo trình (và trước assignments).
  delete from english.assignment_units au where au.learner_id = p_learner_id;
  get diagnostics n_assignment_units = row_count;

  -- 0031: mốc lộ trình (tự trỏ supersedes_id: một câu lệnh) và giáo trình chính trỏ tới giáo trình → TRƯỚC giáo trình.
  delete from english.roadmap_milestones rm where rm.learner_id = p_learner_id;
  get diagnostics n_roadmap_milestones = row_count;
  delete from english.roadmap_main_curriculum rc where rc.learner_id = p_learner_id;
  get diagnostics n_roadmap_main_curriculum = row_count;

  -- W2: giáo trình. Con trước, cha sau: Unit đã dạy và sự kiện Unit (trỏ tới lesson_notes → TRƯỚC lesson_notes), nối, Unit, phiên bản
  -- (trỏ tới files → TRƯỚC files), giáo trình.
  delete from english.lesson_note_units lnu where lnu.learner_id = p_learner_id;
  get diagnostics n_lesson_note_units = row_count;

  delete from english.curriculum_unit_events cue where cue.learner_id = p_learner_id;
  get diagnostics n_curriculum_unit_events = row_count;

  delete from english.curriculum_unit_points cup where cup.learner_id = p_learner_id;
  get diagnostics n_curriculum_unit_points = row_count;

  delete from english.curriculum_units cu where cu.learner_id = p_learner_id;
  get diagnostics n_curriculum_units = row_count;

  delete from english.curriculum_versions cv where cv.learner_id = p_learner_id;
  get diagnostics n_curriculum_versions = row_count;

  delete from english.curricula cc where cc.learner_id = p_learner_id;
  get diagnostics n_curricula = row_count;

  -- 0034: lần thử lại của con (trỏ tới attempts) và cờ "Bài kiểm tra" (trỏ tới activity_instances / assignments): xóa trước các bảng đó.
  delete from english.item_retries ir where ir.learner_id = p_learner_id;
  get diagnostics n_item_retries = row_count;

  delete from english.work_test_marks wtm where wtm.learner_id = p_learner_id;
  get diagnostics n_work_test_marks = row_count;

  -- Studio B1: Đúng/Sai của người lớn và đáp án chấp nhận (trỏ tới attempts → trước attempts; đáp án chấp nhận trỏ tới nhãn câu),
  -- nhãn của từng câu, bản nháp đề (trỏ tới files và mẫu → trước files). Mẫu Studio của em: sau inquiry_instances (bên dưới).
  delete from english.item_decisions idc where idc.learner_id = p_learner_id;
  get diagnostics n_item_decisions = row_count;

  delete from english.accepted_additions aa where aa.learner_id = p_learner_id;
  get diagnostics n_accepted_additions = row_count;

  delete from english.studio_item_meta sim where sim.learner_id = p_learner_id;
  get diagnostics n_studio_item_meta = row_count;

  -- W3: bài nạp trỏ tới files, lần làm và mẫu 'imported' → trước cả ba.
  delete from english.import_batches ib where ib.learner_id = p_learner_id;
  get diagnostics n_import_batches = row_count;

  delete from english.studio_drafts sd where sd.learner_id = p_learner_id;
  get diagnostics n_studio_drafts = row_count;

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

  -- SM-2: sổ quyết định cấp và mốc thi ngoài (external_results trỏ tới files → xóa TRƯỚC files). File thật: deleteLearnerFolder.
  delete from english.level_decisions ld where ld.learner_id = p_learner_id;
  get diagnostics n_level_decisions = row_count;

  delete from english.external_results er where er.learner_id = p_learner_id;
  get diagnostics n_external_results = row_count;

  -- S6: đánh giá bài sửa, đánh dấu của em, góp ý (trỏ tới attempts / activity_instances → xóa TRƯỚC chúng; đánh dấu trỏ tới góp ý).
  delete from english.revision_checks rc where rc.learner_id = p_learner_id;
  get diagnostics n_revision_checks = row_count;

  delete from english.revision_marks rm where rm.learner_id = p_learner_id;
  get diagnostics n_revision_marks = row_count;

  delete from english.feedback_notes fn where fn.learner_id = p_learner_id;
  get diagnostics n_feedback_notes = row_count;

  -- S5b-1 PR B (bài luyện và file): bài nộp, sự kiện của bài giao, bài giao (kết quả trỏ tới bài giao nên đã xóa ở trên), rồi file.
  -- Các file thật nằm ở kho Storage, ngoài database: xóa bằng deleteLearnerFolder (lib/storage) - xem docs/PROGRESS.md.
  -- 0033: góp ý cho bài nộp trỏ tới submissions và assignments (tự trỏ supersedes_id: một câu lệnh) → TRƯỚC submissions.
  delete from english.submission_feedback sfb where sfb.learner_id = p_learner_id;
  get diagnostics n_submission_feedback = row_count;

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

  -- 0030: loại buổi trỏ tới ghi chú và buổi nghỉ → marks trước, absences sau (dòng "bỏ" trỏ tới dòng cùng em: một câu lệnh), cả hai trước lesson_notes.
  delete from english.session_marks sm where sm.learner_id = p_learner_id;
  get diagnostics n_session_marks = row_count;
  delete from english.session_absences sa where sa.learner_id = p_learner_id;
  get diagnostics n_session_absences = row_count;

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

  -- Studio B1: mẫu Studio của em (đã công bố — chỉ xóa được ở đây, eng_purge_allows_studio): nối nguồn, bài đọc, khóa, rồi mẫu.
  delete from english.template_step_sources tss
  where exists (select 1 from english.inquiry_templates t
                where t.id = tss.template_id and t.version = tss.template_version and t.kind = 'studio' and t.learner_id = p_learner_id);
  get diagnostics n_studio_step_sources = row_count;

  delete from english.sources so
  where so.id like 'ST-%'
    and exists (select 1 from english.inquiry_templates t
                where t.kind = 'studio' and t.learner_id = p_learner_id and so.id like ('ST-' || t.id || '-%'));
  get diagnostics n_studio_sources = row_count;

  delete from english.template_item_keys tik
  where exists (select 1 from english.inquiry_templates t
                where t.id = tik.template_id and t.version = tik.template_version and t.kind in ('studio', 'imported') and t.learner_id = p_learner_id);
  get diagnostics n_studio_template_keys = row_count;

  delete from english.inquiry_templates it where it.kind in ('studio', 'imported') and it.learner_id = p_learner_id;
  get diagnostics n_studio_templates = row_count;

  -- Khung đề giấy của đề Studio (kết quả, bài giao và nháp trỏ tới khung đã xóa ở trên).
  delete from english.test_frames tf where tf.learner_id = p_learner_id;
  get diagnostics n_studio_frames = row_count;

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
      'level_decisions', n_level_decisions,
      'external_results', n_external_results,
      'feedback_notes', n_feedback_notes,
      'revision_marks', n_revision_marks,
      'revision_checks', n_revision_checks,
      'mastery_decisions', n_mastery_decisions,
      'competency_state', n_competency_state,
      'episode_marks', n_episode_marks,
      'item_decisions', n_item_decisions,
      'accepted_additions', n_accepted_additions,
      'studio_item_meta', n_studio_item_meta,
      'studio_drafts', n_studio_drafts,
      'studio_step_sources', n_studio_step_sources,
      'studio_sources', n_studio_sources,
      'studio_template_keys', n_studio_template_keys,
      'studio_templates', n_studio_templates,
      'studio_frames', n_studio_frames,
      'teaching_notes', n_teaching_notes,
      'learner_intake', n_learner_intake,
      'login_names', n_login_names,
      'learners', 1,
      'members', n_members
    -- jsonb_build_object takes at most 100 arguments: keys added from 0026 on go into a second object.
    ) || pg_catalog.jsonb_build_object(
      'curricula', n_curricula,
      'curriculum_versions', n_curriculum_versions,
      'curriculum_units', n_curriculum_units,
      'curriculum_unit_points', n_curriculum_unit_points,
      'curriculum_unit_events', n_curriculum_unit_events,
      'lesson_note_units', n_lesson_note_units
    ) || pg_catalog.jsonb_build_object(
      'point_decisions', n_point_decisions,
      'point_state', n_point_state,
      'import_batches', n_import_batches
    ) || pg_catalog.jsonb_build_object(
      'assignment_units', n_assignment_units
    ) || pg_catalog.jsonb_build_object(
      'session_marks', n_session_marks,
      'session_absences', n_session_absences
    ) || pg_catalog.jsonb_build_object(
      'roadmap_milestones', n_roadmap_milestones,
      'roadmap_main_curriculum', n_roadmap_main_curriculum
    ) || pg_catalog.jsonb_build_object(
      'submission_feedback', n_submission_feedback
    ) || pg_catalog.jsonb_build_object(
      'item_retries', n_item_retries,
      'work_test_marks', n_work_test_marks
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

-- Đếm trước khi xóa = bản 0033 + 2 bảng (cùng khóa với biên nhận).
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
      'level_decisions', (select pg_catalog.count(*) from english.level_decisions x where x.learner_id = p_learner),
      'external_results', (select pg_catalog.count(*) from english.external_results x where x.learner_id = p_learner),
      'feedback_notes', (select pg_catalog.count(*) from english.feedback_notes x where x.learner_id = p_learner),
      'revision_marks', (select pg_catalog.count(*) from english.revision_marks x where x.learner_id = p_learner),
      'revision_checks', (select pg_catalog.count(*) from english.revision_checks x where x.learner_id = p_learner),
      'mastery_decisions', (select pg_catalog.count(*) from english.mastery_decisions x where x.learner_id = p_learner),
      'competency_state', (select pg_catalog.count(*) from english.competency_state x where x.learner_id = p_learner),
      'episode_marks', (select pg_catalog.count(*) from english.episode_marks x where x.learner_id = p_learner),
      'item_decisions', (select pg_catalog.count(*) from english.item_decisions x where x.learner_id = p_learner),
      'accepted_additions', (select pg_catalog.count(*) from english.accepted_additions x where x.learner_id = p_learner),
      'studio_item_meta', (select pg_catalog.count(*) from english.studio_item_meta x where x.learner_id = p_learner),
      'studio_drafts', (select pg_catalog.count(*) from english.studio_drafts x where x.learner_id = p_learner),
      'studio_templates', (select pg_catalog.count(*) from english.inquiry_templates x where x.kind in ('studio', 'imported') and x.learner_id = p_learner),
      'studio_frames', (select pg_catalog.count(*) from english.test_frames x where x.learner_id = p_learner),
      'teaching_notes', (select pg_catalog.count(*) from english.teaching_notes x where x.learner_id = p_learner),
      'learner_intake', (select pg_catalog.count(*) from english.learner_intake x where x.learner_id = p_learner),
      -- (the receipt of the purge lists these three too, and the dry run must report exactly the same keys)
      'studio_step_sources', (select pg_catalog.count(*) from english.template_step_sources x
        where exists (select 1 from english.inquiry_templates t where t.id = x.template_id and t.version = x.template_version and t.kind = 'studio' and t.learner_id = p_learner)),
      'studio_sources', (select pg_catalog.count(*) from english.sources x
        where x.id like 'ST-%' and exists (select 1 from english.inquiry_templates t where t.kind = 'studio' and t.learner_id = p_learner and x.id like ('ST-' || t.id || '-%'))),
      'studio_template_keys', (select pg_catalog.count(*) from english.template_item_keys x
        where exists (select 1 from english.inquiry_templates t where t.id = x.template_id and t.version = x.template_version and t.kind in ('studio', 'imported') and t.learner_id = p_learner)),
      'login_names', (select pg_catalog.count(*) from english.login_names x where x.auth_user_id = v_user),
      'learners', 1,
      'members', (select pg_catalog.count(*) from english.members x where x.id = v_l.member_id and x.role = 'student'))
    -- jsonb_build_object takes at most 100 arguments: keys added from 0026 on go into a second object.
    || pg_catalog.jsonb_build_object(
      'curricula', (select pg_catalog.count(*) from english.curricula x where x.learner_id = p_learner),
      'curriculum_versions', (select pg_catalog.count(*) from english.curriculum_versions x where x.learner_id = p_learner),
      'curriculum_units', (select pg_catalog.count(*) from english.curriculum_units x where x.learner_id = p_learner),
      'curriculum_unit_points', (select pg_catalog.count(*) from english.curriculum_unit_points x where x.learner_id = p_learner),
      'curriculum_unit_events', (select pg_catalog.count(*) from english.curriculum_unit_events x where x.learner_id = p_learner),
      'lesson_note_units', (select pg_catalog.count(*) from english.lesson_note_units x where x.learner_id = p_learner))
    -- W3: keys added from 0027 on go into a third object.
    || pg_catalog.jsonb_build_object(
      'point_decisions', (select pg_catalog.count(*) from english.point_decisions x where x.learner_id = p_learner),
      'point_state', (select pg_catalog.count(*) from english.point_state x where x.learner_id = p_learner),
      'import_batches', (select pg_catalog.count(*) from english.import_batches x where x.learner_id = p_learner))
    -- 0029
    || pg_catalog.jsonb_build_object(
      'assignment_units', (select pg_catalog.count(*) from english.assignment_units x where x.learner_id = p_learner))
    -- 0030
    || pg_catalog.jsonb_build_object(
      'session_marks', (select pg_catalog.count(*) from english.session_marks x where x.learner_id = p_learner),
      'session_absences', (select pg_catalog.count(*) from english.session_absences x where x.learner_id = p_learner))
    -- 0031
    || pg_catalog.jsonb_build_object(
      'roadmap_milestones', (select pg_catalog.count(*) from english.roadmap_milestones x where x.learner_id = p_learner),
      'roadmap_main_curriculum', (select pg_catalog.count(*) from english.roadmap_main_curriculum x where x.learner_id = p_learner))
    -- 0033
    || pg_catalog.jsonb_build_object(
      'submission_feedback', (select pg_catalog.count(*) from english.submission_feedback x where x.learner_id = p_learner))
    -- 0034
    || pg_catalog.jsonb_build_object(
      'item_retries', (select pg_catalog.count(*) from english.item_retries x where x.learner_id = p_learner),
      'work_test_marks', (select pg_catalog.count(*) from english.work_test_marks x where x.learner_id = p_learner)));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0034') on conflict do nothing;
