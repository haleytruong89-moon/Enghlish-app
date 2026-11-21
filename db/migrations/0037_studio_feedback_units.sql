-- 0037_studio_feedback_units.sql
-- Bản rà luồng Studio 21/11, #4 và #10 (kế hoạch docs/superpowers/plans/2026-11-21-studio-feedback-units.md; phụ huynh duyệt 21/11 "ok đề xuất"):
--   1. studio_feedback (chỉ thêm): câu khen (≤ 400) + tối đa 3 điều cần sửa (≤ 300 mỗi điều) của thầy/cô HOẶC phụ huynh cho MỘT lần làm bài Studio
--      (inquiry_templates.kind = 'studio'); sửa = dòng mới trỏ supersedes_id (một lần, chỉ tác giả); chữ dạng điểm bị từ chối ở DB (như S6 / W4c1).
--      Không yêu cầu sửa bài, không mở bước mới, không chặn con làm lại. Học sinh không đọc bảng (chỉ qua eng_my_seen).
--   2. eng_write_studio_feedback (service_role sau requireAccess; tự kiểm lại người thao tác) · eng_studio_feedback (người lớn đọc, service_role).
--   3. eng_student_done: "đã được xem" của một lần làm có thêm nguồn góp ý Studio; eng_my_seen: lời góp ý Studio (câu khen + điều cần sửa, không điểm,
--      không tên người viết). Thân = bản 0033 + đúng các nhánh nói trên. KHÔNG sửa 0033.
--   4. studio_assignment_units (chỉ thêm): Unit của giáo trình ĐÃ DUYỆT mà một bài Studio được giao kèm (theo bước, cùng luật với 0029).
--      eng_assign_studio_v3 = eng_assign_studio_v2 (0034, không đổi) + Unit trong cùng giao dịch; gửi lại cùng client_id phải cùng Unit.
--      Không tự đổi trạng thái Unit: app chỉ ĐỀ XUẤT "Đang học" khi con đã nộp (DOMAIN §5.1), người lớn bấm (eng_set_unit_status, 0026).
--   5. eng_purge_learner / eng_purge_preview: chép NGUYÊN thân 0036 + hai bảng mới (xóa trước attempts / activity_instances / giáo trình).
-- Idempotent; chỉ thêm. Không đụng schema public. Cần 0036 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations s where s.version = '0036') then
    raise exception '0037 cần 0036 đã áp (missing_0036)' using errcode = 'P0001';
  end if;
end
$guard$;

-- 1. Bảng --------------------------------------------------------------------------------------------------------------------------
create table if not exists english.studio_feedback (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  attempt_id uuid not null references english.attempts(id),
  activity_id uuid not null references english.activity_instances(id),
  praise text check (praise is null or (pg_catalog.length(pg_catalog.btrim(praise)) between 1 and 400 and not english.eng_has_score_words(praise))),
  -- [{n: 1..3, text}]: bảng chỉ chặn số phần tử (≤ 3) và chữ dạng điểm; độ dài chữ và đánh số lại do eng_write_studio_feedback giữ (người ghi duy nhất).
  items jsonb not null default '[]'::jsonb
    check (pg_catalog.jsonb_typeof(items) = 'array' and pg_catalog.jsonb_array_length(items) <= 3 and english.eng_feedback_texts_ok(items)),
  supersedes_id uuid references english.studio_feedback(id),
  -- id của english.members, KHÔNG có khóa ngoại (xóa tài khoản không làm hỏng lịch sử).
  author_member uuid not null,
  author_role text not null check (author_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint studio_feedback_something check (praise is not null or pg_catalog.jsonb_array_length(items) >= 1)
);
create unique index if not exists studio_feedback_supersedes_once on english.studio_feedback(supersedes_id) where supersedes_id is not null;
create unique index if not exists studio_feedback_first_once on english.studio_feedback(attempt_id) where supersedes_id is null;
create index if not exists studio_feedback_learner_idx on english.studio_feedback(learner_id, created_at desc);

create table if not exists english.studio_assignment_units (
  activity_id uuid not null references english.activity_instances(id),
  inquiry_instance_id uuid not null references english.inquiry_instances(id),
  learner_id uuid not null references english.learners(id),
  curriculum_id uuid not null references english.curricula(id),
  version_id uuid not null,
  unit_code text not null,
  ord smallint not null check (ord between 1 and 30),
  created_at timestamptz not null default clock_timestamp(),
  primary key (activity_id, curriculum_id, unit_code),
  foreign key (version_id, unit_code) references english.curriculum_units(version_id, code)
);
create index if not exists studio_assignment_units_learner_idx on english.studio_assignment_units(learner_id);
create index if not exists studio_assignment_units_curriculum_idx on english.studio_assignment_units(curriculum_id, unit_code);

-- Chỉ thêm (đầu 0004) + RLS: người lớn của em đọc; học sinh không SELECT; không ai ghi trực tiếp (kể cả service_role) -------------------
do $$
declare
  t text;
begin
  foreach t in array array['studio_feedback', 'studio_assignment_units'] loop
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

-- 2. Góp ý của người lớn cho một lần làm bài Studio -----------------------------------------------------------------------------------
-- p_items = [{text}] (0 đến 3 điều, đánh số lại 1..k theo thứ tự); p_praise có thể trống nếu có điều cần sửa. Ít nhất một trong hai.
-- Người gửi: thầy/cô còn quan hệ với em hoặc phụ huynh của gia đình em (eng_actor_may_manage); hàm tự kiểm lại, KHÔNG tin tầng trên.
-- Chỉ lần làm của bước thuộc bài Studio. Sửa = dòng mới (p_supersedes = dòng đang hiệu lực của ĐÚNG lần làm này), chỉ tác giả.
create or replace function english.eng_write_studio_feedback(
  p_attempt uuid,
  p_praise text,
  p_items jsonb,
  p_supersedes uuid,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_att english.attempts%rowtype;
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_praise text := nullif(pg_catalog.btrim(coalesce(p_praise, '')), '');
  v_items jsonb := '[]'::jsonb;
  v_x jsonb;
  v_text text;
  v_old english.studio_feedback%rowtype;
  v_prev english.studio_feedback%rowtype;
  v_id uuid;
begin
  if p_attempt is null or p_items is null or p_by is null or p_client_id is null then
    raise exception 'eng_write_studio_feedback: work, items, actor and client id are required' using errcode = '22004';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_write_studio_feedback: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select * into v_att from english.attempts t where t.id = p_attempt;
  if not found then
    raise exception 'eng_write_studio_feedback: work not found (not_found)' using errcode = 'P0002';
  end if;
  select * into v_l from english.learners l where l.id = v_att.learner_id;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, v_att.learner_id) then
    raise exception 'eng_write_studio_feedback: this member may not give feedback for this learner' using errcode = '42501';
  end if;
  -- Chỉ bài Studio (đề do thầy/cô duyệt trong app). Bài chủ đề / bài nạp / bài khác: như không có.
  if not exists (
    select 1 from english.activity_instances a
    join english.inquiry_instances i on i.id = a.inquiry_instance_id
    join english.inquiry_templates tp on tp.id = i.template_id and tp.version = i.template_version
    where a.id = v_att.activity_instance_id and tp.kind = 'studio') then
    raise exception 'eng_write_studio_feedback: feedback here is for Studio tests (not_studio)' using errcode = '23514';
  end if;

  -- Khóa bước của bài: hai góp ý cùng lúc cho một bài xếp hàng; mọi câu hỏi "đã có góp ý chưa" bên dưới đọc SAU khóa.
  perform 1 from english.activity_instances a where a.id = v_att.activity_instance_id for no key update;

  if pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) > 3 then
    raise exception 'eng_write_studio_feedback: items must be a list of at most 3 (bad_items)' using errcode = '22023';
  end if;
  for v_x in select x from pg_catalog.jsonb_array_elements(p_items) with ordinality as t(x, ord) order by ord loop
    if pg_catalog.jsonb_typeof(v_x) <> 'object' or pg_catalog.jsonb_typeof(v_x -> 'text') is distinct from 'string' then
      raise exception 'eng_write_studio_feedback: each item needs a text (bad_items)' using errcode = '22023';
    end if;
    v_text := pg_catalog.btrim(v_x ->> 'text');
    if pg_catalog.length(v_text) not between 1 and 300 then
      raise exception 'eng_write_studio_feedback: an item is 1 to 300 characters (bad_items)' using errcode = '22023';
    end if;
    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('n', pg_catalog.jsonb_array_length(v_items) + 1, 'text', v_text));
  end loop;
  if v_praise is not null and pg_catalog.length(v_praise) > 400 then
    raise exception 'eng_write_studio_feedback: the praise is at most 400 characters (bad_praise)' using errcode = '22023';
  end if;
  if v_praise is null and pg_catalog.jsonb_array_length(v_items) = 0 then
    raise exception 'eng_write_studio_feedback: write a praise or at least one thing to fix (empty_feedback)' using errcode = '23514';
  end if;
  if (v_praise is not null and english.eng_has_score_words(v_praise))
     or exists (select 1 from pg_catalog.jsonb_array_elements(v_items) y where english.eng_has_score_words(y ->> 'text')) then
    raise exception 'eng_write_studio_feedback: no scores in feedback for the child (score_words)' using errcode = '23514';
  end if;

  -- Gửi lại (mạng chập chờn): cùng client_id + cùng nội dung + cùng người → trả lại dòng cũ; khác → 23505.
  select * into v_old from english.studio_feedback f where f.learner_id = v_att.learner_id and f.client_id = p_client_id;
  if found then
    if v_old.attempt_id = p_attempt and v_old.praise is not distinct from v_praise and v_old.items = v_items
       and v_old.supersedes_id is not distinct from p_supersedes and v_old.author_member = p_by then
      return pg_catalog.jsonb_build_object('id', v_old.id, 'replayed', true);
    end if;
    raise exception 'eng_write_studio_feedback: this client id was already used for other feedback (client_id_reused)' using errcode = '23505';
  end if;

  if p_supersedes is null then
    if exists (select 1 from english.studio_feedback f where f.attempt_id = p_attempt and f.supersedes_id is null) then
      raise exception 'eng_write_studio_feedback: this work already has feedback; edit it instead (already_given)' using errcode = '23505';
    end if;
  else
    select f.* into v_prev from english.studio_feedback f where f.id = p_supersedes and f.attempt_id = p_attempt;
    if not found then
      raise exception 'eng_write_studio_feedback: the feedback to edit was not found (not_found)' using errcode = 'P0002';
    end if;
    if v_prev.author_member <> p_by then
      raise exception 'eng_write_studio_feedback: only the author may edit feedback (author_only)' using errcode = '42501';
    end if;
    if exists (select 1 from english.studio_feedback f2 where f2.supersedes_id = v_prev.id) then
      raise exception 'eng_write_studio_feedback: this feedback was already edited (already_superseded)' using errcode = '23505';
    end if;
  end if;

  insert into english.studio_feedback(learner_id, attempt_id, activity_id, praise, items, supersedes_id, author_member, author_role, client_id)
  values (v_att.learner_id, p_attempt, v_att.activity_instance_id, v_praise, v_items, p_supersedes, p_by, v_member.role, p_client_id)
  returning id into v_id;

  -- Nhật ký: không chép chữ góp ý (chỉ số điều cần sửa).
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, case when p_supersedes is null then 'studio_feedback.given' else 'studio_feedback.edited' end, v_l.family_id, v_l.id,
          pg_catalog.jsonb_build_object('feedback', v_id, 'attempt', p_attempt, 'activity', v_att.activity_instance_id,
                                        'items', pg_catalog.jsonb_array_length(v_items), 'supersedes', p_supersedes));
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;
revoke execute on function english.eng_write_studio_feedback(uuid, text, jsonb, uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_write_studio_feedback(uuid, text, jsonb, uuid, uuid, text) to service_role;

-- Người lớn đọc: mọi bản góp ý Studio của một em (p_attempt trống = mọi lần làm; mới nhất trước), kèm `live` và tên người gửi.
-- Cùng hình dạng với eng_submission_feedback (submission_id = lần làm, assignment_id = bước) để app đọc chung. Chỉ service_role (máy chủ gọi SAU requireAccess).
create or replace function english.eng_studio_feedback(p_learner uuid, p_attempt uuid default null) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', f.id, 'submission_id', f.attempt_id, 'assignment_id', f.activity_id, 'praise', f.praise, 'items', f.items, 'supersedes_id', f.supersedes_id,
    'author_member', f.author_member, 'author_role', f.author_role,
    'author_name', (select m.display_name from english.members m where m.id = f.author_member),
    'created_at', f.created_at,
    'live', not exists (select 1 from english.studio_feedback f2 where f2.supersedes_id = f.id)) order by f.created_at desc, f.id), '[]'::jsonb)
  from english.studio_feedback f
  where f.learner_id = p_learner and (p_attempt is null or f.attempt_id = p_attempt)
$$;
revoke execute on function english.eng_studio_feedback(uuid, uuid) from public, anon, authenticated;
grant execute on function english.eng_studio_feedback(uuid, uuid) to service_role;

-- 4. Giao bài Studio v3 = v2 (0034, không đổi) + Unit trong cùng giao dịch ------------------------------------------------------------
create or replace function english.eng_assign_studio_v3(
  p_draft uuid, p_start date, p_due date, p_is_test boolean, p_by uuid, p_client_id text,
  p_units jsonb   -- [{curriculum_id, unit_code}], 0..30, mỗi (curriculum, unit) một lần
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_learner uuid;
  v_rows jsonb := '[]'::jsonb;  -- [{curriculum_id, version_id, unit_code, ord}]
  v_r jsonb;
  v_act uuid;
begin
  if p_draft is null or p_by is null then
    raise exception 'eng_assign_studio_v3: draft and actor are required' using errcode = '22004';
  end if;
  select d.learner_id into v_learner from english.studio_drafts d where d.id = p_draft;
  if v_learner is null then
    raise exception 'eng_assign_studio_v3: draft not found (not_found)' using errcode = 'P0002';
  end if;
  -- Quyền TRƯỚC mọi kiểm Unit (người không có quyền luôn nhận 42501, không lộ Unit nào hợp lệ).
  if not exists (select 1 from english.members m where m.id = p_by and m.role in ('tutor', 'parent'))
     or not english.eng_actor_may_manage(p_by, v_learner) then
    raise exception 'eng_assign_studio_v3: this member may not give work to this learner' using errcode = '42501';
  end if;
  if p_units is null or pg_catalog.jsonb_typeof(p_units) <> 'array' or pg_catalog.jsonb_array_length(p_units) > 30 then
    raise exception 'eng_assign_studio_v3: units must be an array of at most 30 (bad_units)' using errcode = '22023';
  end if;

  v_r := english.eng_assign_studio_v2(p_draft, p_start, p_due, p_is_test, p_by, p_client_id);   -- người thao tác, bản đã duyệt, ngày, cờ
  v_act := (v_r ->> 'activity_id')::uuid;
  if (v_r ->> 'replayed')::boolean then
    -- Gửi lại: so Unit yêu cầu với Unit ĐÃ LƯU (không với bản giáo trình đang dùng, vì giáo trình có thể đã lên bản mới).
    if (select coalesce(pg_catalog.jsonb_agg(a.curriculum_id::text || '/' || a.unit_code order by a.curriculum_id, a.unit_code), '[]'::jsonb)
          from english.studio_assignment_units a where a.activity_id = v_act)
       <> (select coalesce(pg_catalog.jsonb_agg((r ->> 'curriculum_id')::uuid::text || '/' || (r ->> 'unit_code')
                 order by (r ->> 'curriculum_id')::uuid, r ->> 'unit_code'), '[]'::jsonb)
             from pg_catalog.jsonb_array_elements(p_units) r) then
      raise exception 'eng_assign_studio_v3: client_id was already used for a test with other units (client_id_reused)' using errcode = '23505';
    end if;
    return v_r || pg_catalog.jsonb_build_object('units', pg_catalog.jsonb_array_length(p_units));
  end if;

  -- Bài mới. Mỗi Unit: giáo trình của ĐÚNG em này, phiên bản ĐANG DÙNG = đã duyệt, Unit có trong phiên bản và không bị bỏ qua (như 0029).
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'curriculum_id', c.id, 'version_id', v.id, 'unit_code', u.code, 'ord', x.ord) order by x.ord), '[]'::jsonb)
    into v_rows
  from pg_catalog.jsonb_array_elements(p_units) with ordinality as x(e, ord)
  join english.curricula c on c.id = (x.e ->> 'curriculum_id')::uuid and c.learner_id = v_learner
  join english.curriculum_versions v on v.curriculum_id = c.id and v.status = 'approved'
  join english.curriculum_units u on u.version_id = v.id and u.code = x.e ->> 'unit_code' and not u.skipped;
  if pg_catalog.jsonb_array_length(v_rows) <> pg_catalog.jsonb_array_length(p_units) then
    raise exception 'eng_assign_studio_v3: a unit is not in an approved curriculum of this learner (bad_units)' using errcode = '22023';
  end if;
  if (select pg_catalog.count(distinct (r ->> 'curriculum_id') || '/' || (r ->> 'unit_code')) from pg_catalog.jsonb_array_elements(v_rows) r)
     <> pg_catalog.jsonb_array_length(v_rows) then
    raise exception 'eng_assign_studio_v3: a unit is listed twice (bad_units)' using errcode = '22023';
  end if;
  insert into english.studio_assignment_units(activity_id, inquiry_instance_id, learner_id, curriculum_id, version_id, unit_code, ord)
  select v_act, (v_r ->> 'instance_id')::uuid, v_learner, (r ->> 'curriculum_id')::uuid, (r ->> 'version_id')::uuid, r ->> 'unit_code', (r ->> 'ord')::smallint
  from pg_catalog.jsonb_array_elements(v_rows) r;
  return v_r || pg_catalog.jsonb_build_object('units', pg_catalog.jsonb_array_length(v_rows));
end
$$;
revoke execute on function english.eng_assign_studio_v3(uuid, date, date, boolean, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function english.eng_assign_studio_v3(uuid, date, date, boolean, uuid, text, jsonb) to service_role;

-- 3. Phía con: hai hàm cũ thay bằng bản có thêm góp ý Studio (thân = bản 0033 + đúng các nhánh đánh dấu 0037) -------------------------
-- eng_student_done: "đã được xem" của một lần làm = mốc sớm nhất trong (góp ý S6, Đúng/Sai của người lớn, quyết định, đánh giá bài sửa, góp ý Studio).
create or replace function english.eng_student_done(p_learner uuid)
returns table (
  src text, ref uuid, activity_id uuid, assignment_id uuid, title text, kind text, step_no int, activity_type text,
  submitted_at timestamptz, is_first boolean, used_hint boolean, offline boolean, seen_at timestamptz, retracted boolean)
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
       union all select v.created_at from english.validation_decisions v join english.episodes e on e.id = v.episode_id where e.attempt_id = t.id
       union all select c.created_at from english.revision_checks c where c.attempt_id = t.id
       -- 0037: góp ý cho bài Studio
       union all select stf.created_at from english.studio_feedback stf where stf.attempt_id = t.id
     ) x),
    false
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
    (select pg_catalog.min(x.at) from (
       select r.created_at as at from english.results r where r.assignment_id = g.id and r.created_at >= s.created_at
       union all select sf.created_at from english.submission_feedback sf where sf.submission_id = s.id) x),
    exists (select 1 from english.assignment_events e where e.assignment_id = g.id and e.kind = 'retracted')
  from english.submissions s
  join english.assignments g on g.id = s.assignment_id
  where s.learner_id = p_learner
    and not exists (select 1 from english.submissions s2 where s2.supersedes_id = s.id)
$$;
revoke execute on function english.eng_student_done(uuid) from public, anon, authenticated, service_role;

-- eng_my_seen: lần làm bài Studio được xem có thể kèm lời góp ý Studio (câu khen + điều cần sửa; không điểm, không ai viết, không trích đoạn).
create or replace function english.eng_my_seen(p_before timestamptz default null, p_before_ref uuid default null, p_limit int default 20) returns jsonb
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
        -- when the shown feedback was written (a later edit of the feedback is news even though seen_at is the first look)
        'fb_at', coalesce(fb.created_at, sf.created_at, stf.created_at),
        'praise', coalesce(fb.praise, sf.praise, stf.praise),
        'notes', case when fb.id is null and sf.id is null and stf.id is null then null else (
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', (x ->> 'n')::int, 'text', x ->> 'text', 'excerpt', x ->> 'excerpt')
                                      order by (x ->> 'n')::int)
          from pg_catalog.jsonb_array_elements(case when fb.id is not null then fb.items when sf.id is not null then sf.items else stf.items end) x) end,
        'fb_state', case
          when fb.id is null then case when sf.id is not null or stf.id is not null then 'note' end
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
      ) order by h.seen_at desc, h.ref desc)
    from (
      select d.* from english.eng_student_done(v_learner) d
      where d.seen_at is not null
        and (p_before is null or (d.seen_at, d.ref) < (p_before, coalesce(p_before_ref, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
      order by d.seen_at desc, d.ref desc
      limit v_limit) h
    left join lateral (
      select f.* from english.feedback_notes f
      where h.src = 'attempt' and f.source_attempt_id = h.ref and f.kind = 'feedback' and english.eng_feedback_is_live(f.id)
      order by f.created_at desc limit 1) fb on true
    left join lateral (
      select f.* from english.submission_feedback f
      where h.src = 'submission' and f.submission_id = h.ref
        and not exists (select 1 from english.submission_feedback f2 where f2.supersedes_id = f.id)
      order by f.created_at desc limit 1) sf on true
    -- 0037: góp ý cho bài Studio (lần làm này), bản chưa bị sửa
    left join lateral (
      select f.* from english.studio_feedback f
      where h.src = 'attempt' and f.attempt_id = h.ref
        and not exists (select 1 from english.studio_feedback f2 where f2.supersedes_id = f.id)
      order by f.created_at desc limit 1) stf on true), '[]'::jsonb));
end
$$;
revoke execute on function english.eng_my_seen(timestamptz, uuid, int) from public, anon, service_role;
grant execute on function english.eng_my_seen(timestamptz, uuid, int) to authenticated;

-- 5. Xóa dữ liệu một em: = bản 0036 + studio_feedback + studio_assignment_units (xóa trước attempts / activity_instances / giáo trình) --------
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
  n_retry_seen int := 0;
  n_item_reveals int := 0;
  n_work_test_marks int := 0;
  n_weekly_goals int := 0;
  n_submission_work_weeks int := 0;
  n_then_now_picks int := 0;
  n_studio_feedback int := 0;
  n_studio_assignment_units int := 0;
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

  -- 0037: Unit của bài Studio trỏ tới curriculum_units/curricula và activity_instances / inquiry_instances → trước giáo trình (và trước các bước).
  delete from english.studio_assignment_units sau where sau.learner_id = p_learner_id;
  get diagnostics n_studio_assignment_units = row_count;

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
  delete from english.item_reveals ivl where ivl.learner_id = p_learner_id;
  get diagnostics n_item_reveals = row_count;

  delete from english.retry_seen rs where rs.learner_id = p_learner_id;
  get diagnostics n_retry_seen = row_count;

  delete from english.item_retries ir where ir.learner_id = p_learner_id;
  get diagnostics n_item_retries = row_count;

  delete from english.work_test_marks wtm where wtm.learner_id = p_learner_id;
  get diagnostics n_work_test_marks = row_count;

  -- 0035: mục tiêu tuần (chỉ trỏ tới learners và tới chính nó): xóa cả em một lượt.
  delete from english.weekly_goals wg where wg.learner_id = p_learner_id;
  get diagnostics n_weekly_goals = row_count;

  -- 0036: "Ngày ấy – bây giờ" trỏ tới attempts → trước attempts.
  delete from english.then_now_picks tnp where tnp.learner_id = p_learner_id;
  get diagnostics n_then_now_picks = row_count;

  -- 0037: góp ý Studio trỏ tới attempts / activity_instances → trước attempts.
  delete from english.studio_feedback stf where stf.learner_id = p_learner_id;
  get diagnostics n_studio_feedback = row_count;

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

  delete from english.submission_work_weeks sww where sww.learner_id = p_learner_id;   -- 0035: trỏ tới submissions → trước submissions
  get diagnostics n_submission_work_weeks = row_count;
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
      'retry_seen', n_retry_seen,
      'item_reveals', n_item_reveals,
      'work_test_marks', n_work_test_marks
    ) || pg_catalog.jsonb_build_object(
      'weekly_goals', n_weekly_goals,
      'submission_work_weeks', n_submission_work_weeks
    ) || pg_catalog.jsonb_build_object(
      'then_now_picks', n_then_now_picks
    ) || pg_catalog.jsonb_build_object(
      'studio_feedback', n_studio_feedback,
      'studio_assignment_units', n_studio_assignment_units
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

-- Đếm trước khi xóa = bản 0036 + hai bảng mới (cùng khóa với biên nhận).
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
      'retry_seen', (select pg_catalog.count(*) from english.retry_seen x where x.learner_id = p_learner),
      'item_reveals', (select pg_catalog.count(*) from english.item_reveals x where x.learner_id = p_learner),
      'work_test_marks', (select pg_catalog.count(*) from english.work_test_marks x where x.learner_id = p_learner))
    -- 0035
    || pg_catalog.jsonb_build_object(
      'weekly_goals', (select pg_catalog.count(*) from english.weekly_goals x where x.learner_id = p_learner),
      'submission_work_weeks', (select pg_catalog.count(*) from english.submission_work_weeks x where x.learner_id = p_learner))
    -- 0036
    || pg_catalog.jsonb_build_object(
      'then_now_picks', (select pg_catalog.count(*) from english.then_now_picks x where x.learner_id = p_learner))
    -- 0037
    || pg_catalog.jsonb_build_object(
      'studio_feedback', (select pg_catalog.count(*) from english.studio_feedback x where x.learner_id = p_learner),
      'studio_assignment_units', (select pg_catalog.count(*) from english.studio_assignment_units x where x.learner_id = p_learner)));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0037') on conflict do nothing;
