-- 0031_roadmap_milestones.sql
-- W4a · Lộ trình mốc (thầy/cô) + Hành trình (con). Kế hoạch docs/superpowers/plans/2026-11-14-w4-student-desk.md (PR W4a, mục 3.3–3.4, 3.9).
--   1. roadmap_milestones (chỉ thêm): mỗi lần ghi một mốc = MỘT dòng phiên bản mới (version + 1, supersedes_id = dòng trước); trạng thái
--      draft / confirmed / removed (bỏ bắt buộc lý do 5..300). Con thấy bản hiện hành nếu confirmed; draft → bản confirmed gần nhất trước nó; removed → không thấy.
--   2. roadmap_main_curriculum (chỉ thêm): giáo trình chính của núi (dòng mới nhất thắng; chưa chọn → mặc định theo Q9, tính ở eng_roadmap_main_id).
--   3. track_settings: roadmap_goal_label (A "Lên B1", B "Lên C1") — dữ liệu, không rẽ nhánh theo track.
--   4. Hàm ghi (service_role sau requireAccess): eng_roadmap_write, eng_roadmap_set_main. CHỈ thầy/cô còn quan hệ với em ghi (phụ huynh 42501);
--      hàm tự kiểm lại người thao tác TRƯỚC mọi kiểm khác; idempotent theo client_id (khác nội dung → 23505 client_id_reused).
--   5. Đọc: eng_roadmap (người lớn, service_role), eng_my_roadmap (con, authenticated; KHÔNG trả nháp / đã bỏ / lý do / phiên bản / khóa đề xuất /
--      trang sách / mục kiến thức / điểm), eng_roadmap_main_id (nội bộ).
--   6. RLS: người lớn của em đọc (eng_is_staff_of); học sinh không SELECT bảng nào (chỉ qua eng_my_roadmap); không ai ghi trực tiếp (kể cả service_role).
--   7. eng_purge_learner / eng_purge_preview: chép NGUYÊN thân 0030 + 2 bảng (trước giáo trình vì khóa ngoại).
-- Chỉ thêm, idempotent. Không đụng schema public. Cần 0026 + 0030 đã áp.

-- 1. Bảng ------------------------------------------------------------------------------------------------------------------
create table if not exists english.roadmap_milestones (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null,                       -- = id của phiên bản 1
  learner_id uuid not null references english.learners(id),
  version int not null check (version between 1 and 999),
  supersedes_id uuid references english.roadmap_milestones(id),
  kind text not null check (kind in ('progress_test', 'mock_exam', 'exam', 'goal', 'other')),
  role text not null check (role in ('flag', 'summit', 'beyond')),
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 80),
  curriculum_id uuid references english.curricula(id),
  after_unit text check (after_unit is null or after_unit ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
  target_month date check (target_month is null or pg_catalog.date_part('day', target_month) = 1),
  approx boolean not null default false,
  status text not null check (status in ('draft', 'confirmed', 'removed')),
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 5 and 300),
  proposal_key text check (proposal_key is null or proposal_key ~ '^(pt|goal|track):[a-z0-9:_-]{1,140}$'),
  by_member uuid not null,                          -- english.members.id, no FK (like lesson_notes.tutor_member_id)
  by_role text not null check (by_role = 'tutor'),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (milestone_id, version),
  unique (learner_id, client_id),
  check ((version = 1) = (supersedes_id is null)),
  check (version <> 1 or milestone_id = id),
  check (after_unit is null or curriculum_id is not null),
  check (role = 'flag' or after_unit is null),
  check (not approx or target_month is not null),
  check (status <> 'removed' or reason is not null)
);
create unique index if not exists roadmap_milestones_supersedes_once on english.roadmap_milestones(supersedes_id) where supersedes_id is not null;
create unique index if not exists roadmap_milestones_proposal_once on english.roadmap_milestones(learner_id, proposal_key) where version = 1 and proposal_key is not null;
create index if not exists roadmap_milestones_learner_idx on english.roadmap_milestones(learner_id, milestone_id, version desc);

create table if not exists english.roadmap_main_curriculum (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  curriculum_id uuid not null references english.curricula(id),
  by_member uuid not null,
  by_role text not null check (by_role = 'tutor'),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create index if not exists roadmap_main_curriculum_learner_idx on english.roadmap_main_curriculum(learner_id, created_at desc);

-- 2. Cấu hình theo track (dữ liệu; mã không rẽ nhánh theo track) ---------------------------------------------------------------
insert into english.track_settings(track_id, key, value) values
  ('A', 'roadmap_goal_label', '"Lên B1"'::jsonb),
  ('B', 'roadmap_goal_label', '"Lên C1"'::jsonb)
on conflict (track_id, key) do nothing;

-- 3. Chỉ thêm (đầu 0004) + RLS ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['roadmap_milestones', 'roadmap_main_curriculum'] loop
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

-- 4. Nội bộ ---------------------------------------------------------------------------------------------------------------------
-- Chỉ thầy/cô còn quan hệ với em (không phụ huynh): trả member, không thì 42501 (tutor_only).
create or replace function english.eng_roadmap_actor(p_by uuid, p_learner uuid, p_fn text) returns english.members
language plpgsql stable security definer set search_path = ''
as $$
declare v_m english.members%rowtype;
begin
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception '%: only the tutor of this learner writes the roadmap (tutor_only)', p_fn using errcode = '42501';
  end if;
  return v_m;
end
$$;
revoke execute on function english.eng_roadmap_actor(uuid, uuid, text) from public, anon, authenticated, service_role;

-- Bản của mỗi mốc mà CON được thấy (plan 3.4): hiện hành confirmed → nó; hiện hành draft → confirmed gần nhất trước nó; removed → không.
create or replace function english.eng_roadmap_visible(p_learner uuid) returns setof english.roadmap_milestones
language sql stable security definer set search_path = ''
as $$
  with cur as (
    select distinct on (r.milestone_id) r.* from english.roadmap_milestones r where r.learner_id = p_learner order by r.milestone_id, r.version desc
  )
  select v.* from cur c
  join english.roadmap_milestones v on v.id = case
    when c.status = 'confirmed' then c.id
    when c.status = 'draft' then (select o.id from english.roadmap_milestones o where o.milestone_id = c.milestone_id and o.version < c.version and o.status = 'confirmed' order by o.version desc limit 1)
    else null end
$$;
revoke execute on function english.eng_roadmap_visible(uuid) from public, anon, authenticated, service_role;

-- Giáo trình chính (Q9): lựa chọn mới nhất của thầy/cô nếu giáo trình đó có bản đã duyệt; không thì giáo trình đã duyệt có sự kiện Unit gần nhất;
-- không thì giáo trình đã duyệt tạo sớm nhất. Cùng luật với lib/roadmap/mainCurriculum.ts (test so).
create or replace function english.eng_roadmap_main_id(p_learner uuid) returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_chosen uuid;
  v_id uuid;
begin
  select m.curriculum_id into v_chosen from english.roadmap_main_curriculum m where m.learner_id = p_learner order by m.created_at desc, m.id desc limit 1;
  if v_chosen is not null and exists (select 1 from english.curriculum_versions v where v.curriculum_id = v_chosen and v.status = 'approved') then
    return v_chosen;
  end if;
  select c.id into v_id
  from english.curricula c
  join lateral (select e.created_at, e.id from english.curriculum_unit_events e where e.curriculum_id = c.id order by e.created_at desc, e.id desc limit 1) le on true
  where c.learner_id = p_learner and exists (select 1 from english.curriculum_versions v where v.curriculum_id = c.id and v.status = 'approved')
  order by le.created_at desc, le.id::text desc, c.id
  limit 1;
  if v_id is not null then return v_id; end if;
  select c.id into v_id from english.curricula c
  where c.learner_id = p_learner and exists (select 1 from english.curriculum_versions v where v.curriculum_id = c.id and v.status = 'approved')
  order by c.created_at, c.id limit 1;
  return v_id;
end
$$;
revoke execute on function english.eng_roadmap_main_id(uuid) from public, anon, authenticated, service_role;

-- 5a. Ghi một mốc (mốc mới: p_milestone null; sửa / xác nhận / bỏ: p_milestone + p_base_version = phiên bản hiện hành) ------------------
-- p_fields = {kind, role, title, curriculum_id?, after_unit?, target_month? ('YYYY-MM' hoặc 'YYYY-MM-01'), approx?}; null = giữ nguyên trường của bản trước.
create or replace function english.eng_roadmap_write(
  p_learner uuid, p_milestone uuid, p_base_version int, p_fields jsonb, p_status text, p_reason text, p_proposal_key text, p_by uuid, p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
  v_l english.learners%rowtype;
  v_prev english.roadmap_milestones%rowtype;
  v_row english.roadmap_milestones%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_kind text; v_role text; v_title text; v_curr uuid; v_unit text; v_month date; v_approx boolean;
  v_month_txt text;
  v_id uuid;
  v_mid uuid;
  v_version int;
  v_replay boolean;
begin
  if p_learner is null or p_by is null then
    raise exception 'eng_roadmap_write: learner and actor are required' using errcode = '22004';
  end if;
  v_m := english.eng_roadmap_actor(p_by, p_learner, 'eng_roadmap_write');                 -- permissions first (2B lesson)
  select * into v_l from english.learners l where l.id = p_learner for no key update;          -- one writer per child (versions + the single summit stay consistent); FK inserts elsewhere are not blocked
  if not found then raise exception 'eng_roadmap_write: learner not found' using errcode = 'P0002'; end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_roadmap_write: client_id must be 8..100 characters (bad_fields)' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('draft', 'confirmed', 'removed') then
    raise exception 'eng_roadmap_write: unknown status (bad_fields)' using errcode = '22023';
  end if;

  -- Replay first (7): the same client_id is looked up before anything is derived, so a retry still gets its first answer after a newer version exists.
  select * into v_row from english.roadmap_milestones r where r.learner_id = p_learner and r.client_id = p_client_id;
  v_replay := found;

  -- Fields: the new ones, or the previous version's when p_fields is null.
  if p_milestone is not null and not v_replay then
    select * into v_prev from english.roadmap_milestones r where r.learner_id = p_learner and r.milestone_id = p_milestone order by r.version desc limit 1;
    if not found then raise exception 'eng_roadmap_write: milestone not found' using errcode = 'P0002'; end if;
  elsif p_milestone is null and p_fields is null then
    raise exception 'eng_roadmap_write: fields are required for a new milestone (bad_fields)' using errcode = '22023';
  end if;
  if p_fields is not null then
    if pg_catalog.jsonb_typeof(p_fields) <> 'object' then
      raise exception 'eng_roadmap_write: fields must be an object (bad_fields)' using errcode = '22023';
    end if;
    v_kind := p_fields ->> 'kind';
    v_role := p_fields ->> 'role';
    v_title := nullif(pg_catalog.btrim(coalesce(p_fields ->> 'title', '')), '');
    v_curr := nullif(p_fields ->> 'curriculum_id', '')::uuid;
    v_unit := nullif(p_fields ->> 'after_unit', '');
    v_month_txt := nullif(p_fields ->> 'target_month', '');
    v_approx := coalesce((p_fields ->> 'approx')::boolean, false);
    if v_month_txt is not null then
      if v_month_txt !~ '^\d{4}-(0[1-9]|1[0-2])(-01)?$' then
        raise exception 'eng_roadmap_write: the month must be YYYY-MM (bad_fields)' using errcode = '22023';
      end if;
      v_month := (pg_catalog.left(v_month_txt, 7) || '-01')::date;
    end if;
  elsif v_replay then
    -- no new fields on a replay: compare against what that call wrote
    v_kind := v_row.kind; v_role := v_row.role; v_title := v_row.title; v_curr := v_row.curriculum_id; v_unit := v_row.after_unit;
    v_month := v_row.target_month; v_approx := v_row.approx;
  else
    v_kind := v_prev.kind; v_role := v_prev.role; v_title := v_prev.title; v_curr := v_prev.curriculum_id; v_unit := v_prev.after_unit;
    v_month := v_prev.target_month; v_approx := v_prev.approx;
  end if;
  if v_kind is null or v_kind not in ('progress_test', 'mock_exam', 'exam', 'goal', 'other')
     or v_role is null or v_role not in ('flag', 'summit', 'beyond')
     or v_title is null or pg_catalog.length(v_title) > 80
     or (v_unit is not null and v_unit !~ '^[A-Z0-9][A-Z0-9-]{0,19}$')
     or (v_unit is not null and v_curr is null)
     or (v_role <> 'flag' and v_unit is not null)
     or (v_approx and v_month is null) then
    raise exception 'eng_roadmap_write: kind, role, title, month or unit is not valid (bad_fields)' using errcode = '22023';
  end if;

  -- Replay of the same client_id: same content → the first answer; other content → 23505.
  if v_replay then
    if (p_milestone is not null and v_row.milestone_id <> p_milestone) or v_row.status <> p_status
       or v_row.reason is distinct from (case when p_status = 'removed' then v_reason else null end)
       or v_row.proposal_key is distinct from p_proposal_key
       or v_row.kind <> v_kind or v_row.role <> v_role or v_row.title <> v_title or v_row.curriculum_id is distinct from v_curr
       or v_row.after_unit is distinct from v_unit or v_row.target_month is distinct from v_month or v_row.approx <> v_approx then
      raise exception 'eng_roadmap_write: client_id was already used for another record (client_id_reused)' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('milestone_id', v_row.milestone_id, 'version', v_row.version, 'replayed', true);
  end if;

  if p_milestone is null then
    if p_base_version is not null then
      raise exception 'eng_roadmap_write: a new milestone has no base version (bad_fields)' using errcode = '22023';
    end if;
    v_version := 1;
  else
    if p_base_version is distinct from v_prev.version then
      raise exception 'eng_roadmap_write: the milestone changed since you opened it (stale_version)' using errcode = '23505';
    end if;
    if v_prev.status = 'removed' then
      raise exception 'eng_roadmap_write: a removed milestone cannot be changed (already_removed)' using errcode = '23514';
    end if;
    v_version := v_prev.version + 1;
  end if;

  -- The curriculum and the Unit must be the child's own (a removed version keeps whatever it had).
  if p_status <> 'removed' then
    if v_curr is not null and not exists (select 1 from english.curricula c where c.id = v_curr and c.learner_id = p_learner) then
      raise exception 'eng_roadmap_write: the curriculum is not this learner''s (bad_unit)' using errcode = '22023';
    end if;
    if v_unit is not null and not exists (
      select 1 from english.curriculum_versions v join english.curriculum_units u on u.version_id = v.id
      where v.curriculum_id = v_curr and v.status = 'approved' and u.code = v_unit
    ) then
      raise exception 'eng_roadmap_write: the Unit is not in the approved version of this curriculum (bad_unit)' using errcode = '22023';
    end if;
  end if;
  if p_status = 'removed' and (v_reason is null or pg_catalog.length(v_reason) < 5 or pg_catalog.length(v_reason) > 300) then
    raise exception 'eng_roadmap_write: a reason of 5..300 characters is required to remove a milestone (reason_required)' using errcode = '23514';
  end if;
  if p_status <> 'removed' and v_reason is not null and pg_catalog.length(v_reason) > 300 then
    raise exception 'eng_roadmap_write: the reason is too long (bad_fields)' using errcode = '22023';
  end if;
  -- One summit at a time: the child must never see two.
  if p_status = 'confirmed' and v_role = 'summit' and exists (
    select 1 from english.eng_roadmap_visible(p_learner) s where s.role = 'summit' and s.milestone_id is distinct from p_milestone
  ) then
    raise exception 'eng_roadmap_write: there is already a summit (summit_exists)' using errcode = '23514';
  end if;
  if p_proposal_key is not null then
    if p_milestone is not null or p_proposal_key !~ '^(pt|goal|track):[a-z0-9:_-]{1,140}$' then
      raise exception 'eng_roadmap_write: a proposal key belongs to a new milestone only (bad_fields)' using errcode = '22023';
    end if;
    if exists (select 1 from english.roadmap_milestones r where r.learner_id = p_learner and r.proposal_key = p_proposal_key and r.version = 1) then
      raise exception 'eng_roadmap_write: this proposal was already used (proposal_used)' using errcode = '23505';
    end if;
  end if;

  v_id := gen_random_uuid();
  v_mid := coalesce(p_milestone, v_id);
  insert into english.roadmap_milestones(id, milestone_id, learner_id, version, supersedes_id, kind, role, title, curriculum_id, after_unit, target_month, approx,
                                         status, reason, proposal_key, by_member, by_role, client_id)
  values (v_id, v_mid, p_learner, v_version, case when v_version = 1 then null else v_prev.id end, v_kind, v_role, v_title, v_curr, v_unit, v_month, v_approx,
          p_status, case when p_status = 'removed' then v_reason else null end, p_proposal_key, p_by, 'tutor', p_client_id);
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'roadmap.milestone_written', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('milestone', v_mid, 'version', v_version, 'status', p_status));          -- no text
  return pg_catalog.jsonb_build_object('milestone_id', v_mid, 'version', v_version, 'replayed', false);
end
$$;

-- 5b. Chọn giáo trình chính của núi -------------------------------------------------------------------------------------------
create or replace function english.eng_roadmap_set_main(p_learner uuid, p_curriculum uuid, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
  v_l english.learners%rowtype;
  v_prev english.roadmap_main_curriculum%rowtype;
  v_id uuid;
begin
  if p_learner is null or p_curriculum is null or p_by is null then
    raise exception 'eng_roadmap_set_main: learner, curriculum and actor are required' using errcode = '22004';
  end if;
  v_m := english.eng_roadmap_actor(p_by, p_learner, 'eng_roadmap_set_main');
  select * into v_l from english.learners l where l.id = p_learner for no key update;
  if not found then raise exception 'eng_roadmap_set_main: learner not found' using errcode = 'P0002'; end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_roadmap_set_main: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select * into v_prev from english.roadmap_main_curriculum r where r.learner_id = p_learner and r.client_id = p_client_id;
  if found then
    if v_prev.curriculum_id <> p_curriculum then
      raise exception 'eng_roadmap_set_main: client_id was already used for another record (client_id_reused)' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true);
  end if;
  if not exists (
    select 1 from english.curricula c join english.curriculum_versions v on v.curriculum_id = c.id and v.status = 'approved'
    where c.id = p_curriculum and c.learner_id = p_learner
  ) then
    raise exception 'eng_roadmap_set_main: the curriculum is not this learner''s or has no approved version (bad_curriculum)' using errcode = '22023';
  end if;
  insert into english.roadmap_main_curriculum(learner_id, curriculum_id, by_member, by_role, client_id)
  values (p_learner, p_curriculum, p_by, 'tutor', p_client_id) returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'roadmap.main_set', v_l.family_id, p_learner, pg_catalog.jsonb_build_object('curriculum', p_curriculum));
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- 6a. Đọc của người lớn (service_role sau requireAccess "roadmap:read") ------------------------------------------------------------
create or replace function english.eng_roadmap(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_main uuid;
  v_chosen uuid;
begin
  if p_learner is null then raise exception 'eng_roadmap: learner id is required' using errcode = '22004'; end if;
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then raise exception 'eng_roadmap: learner not found' using errcode = 'P0002'; end if;
  v_main := english.eng_roadmap_main_id(p_learner);
  select m.curriculum_id into v_chosen from english.roadmap_main_curriculum m where m.learner_id = p_learner order by m.created_at desc, m.id desc limit 1;
  return pg_catalog.jsonb_build_object(
    'track_id', v_l.track_id,
    'goal_label', english.eng_track_setting(v_l.track_id, 'roadmap_goal_label'),
    'main_id', v_main,
    'chosen_id', v_chosen,
    'intake_goals', coalesce((select i.content -> 'goals' from english.learner_intake i where i.learner_id = p_learner order by i.created_at desc, i.id desc limit 1), '[]'::jsonb),
    'milestones', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', q.id, 'milestone_id', q.milestone_id, 'version', q.version, 'kind', q.kind, 'role', q.role, 'title', q.title,
        'curriculum_id', q.curriculum_id, 'after_unit', q.after_unit, 'target_month', q.target_month, 'approx', q.approx,
        'status', q.status, 'reason', q.reason, 'proposal_key', q.proposal_key, 'created_at', q.created_at) order by q.milestone_created, q.milestone_id, q.version)
      from (
        select r.*, pg_catalog.first_value(r.created_at) over (partition by r.milestone_id order by r.version) as milestone_created,
               pg_catalog.row_number() over (partition by r.milestone_id order by r.version desc) as rn
        from english.roadmap_milestones r where r.learner_id = p_learner
      ) q where q.rn <= 20 or q.id in (select s.id from english.eng_roadmap_visible(p_learner) s)), '[]'::jsonb),
    -- Not capped (5): every proposal key in use, and which version of each milestone the child sees.
    'used_keys', coalesce((select pg_catalog.jsonb_agg(distinct r.proposal_key) from english.roadmap_milestones r where r.learner_id = p_learner and r.proposal_key is not null), '[]'::jsonb),
    'visible_ids', coalesce((select pg_catalog.jsonb_object_agg(s.milestone_id::text, s.id) from english.eng_roadmap_visible(p_learner) s), '{}'::jsonb),
    'curricula', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id, 'title', c.title, 'created_at', c.created_at,
        'version_id', v.id,
        'last_event_at', (select e.created_at from english.curriculum_unit_events e where e.curriculum_id = c.id order by e.created_at desc, e.id desc limit 1),
        'last_event_id', (select e.id from english.curriculum_unit_events e where e.curriculum_id = c.id order by e.created_at desc, e.id desc limit 1),
        'units', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', u.code, 'ord', u.ord, 'title', u.title, 'skipped', u.skipped) order by u.ord)
                           from english.curriculum_units u where u.version_id = v.id), '[]'::jsonb),
        'events', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', e.id, 'unit_code', e.unit_code, 'status', e.status, 'at', e.created_at) order by e.created_at, e.id)
                            from english.curriculum_unit_events e where e.curriculum_id = c.id), '[]'::jsonb),
        'payload', case when c.id = v_main then v.payload else null end) order by c.created_at, c.id)
      from english.curricula c join english.curriculum_versions v on v.curriculum_id = c.id and v.status = 'approved'
      where c.learner_id = p_learner), '[]'::jsonb)
  );
end
$$;

-- 6b. Đọc của CON (authenticated). Trả ĐÚNG những gì con được thấy: Unit + trạng thái + mốc đã xác nhận. Không điểm, không nháp, không lý do. -----
create or replace function english.eng_my_roadmap() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_learner uuid;
  v_main uuid;
  v_ver uuid;
begin
  select l.id into v_learner
  from english.members m join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if v_learner is null then
    return pg_catalog.jsonb_build_object('main', null, 'units', '[]'::jsonb, 'others', '[]'::jsonb, 'milestones', '[]'::jsonb);
  end if;
  v_main := english.eng_roadmap_main_id(v_learner);
  select v.id into v_ver from english.curriculum_versions v where v.curriculum_id = v_main and v.status = 'approved';
  return pg_catalog.jsonb_build_object(
    'main', (select pg_catalog.jsonb_build_object('id', c.id, 'title', c.title) from english.curricula c where c.id = v_main),
    'units', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'code', u.code, 'ord', u.ord, 'title', u.title, 'skipped', u.skipped,
        'status', coalesce(le.status, 'not_started'),
        'done_on', case when le.status = 'done' then (le.created_at at time zone 'Asia/Ho_Chi_Minh')::date else null end) order by u.ord)
      from english.curriculum_units u
      left join lateral (select e.status, e.created_at from english.curriculum_unit_events e
                         where e.curriculum_id = v_main and e.unit_code = u.code order by e.created_at desc, e.id desc limit 1) le on true
      where u.version_id = v_ver), '[]'::jsonb),
    'others', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', o.id, 'title', o.title, 'done', o.done, 'total', o.total) order by o.created_at, o.id)
      from (
        select c.id, c.title, c.created_at,
          (select pg_catalog.count(*) from english.curriculum_units u
            left join lateral (select e.status from english.curriculum_unit_events e where e.curriculum_id = c.id and e.unit_code = u.code order by e.created_at desc, e.id desc limit 1) le on true
            where u.version_id = v.id and not u.skipped and coalesce(le.status, '') = 'done')::int as done,
          (select pg_catalog.count(*) from english.curriculum_units u
            left join lateral (select e.status from english.curriculum_unit_events e where e.curriculum_id = c.id and e.unit_code = u.code order by e.created_at desc, e.id desc limit 1) le on true
            where u.version_id = v.id and not u.skipped and coalesce(le.status, '') <> 'skipped')::int as total
        from english.curricula c join english.curriculum_versions v on v.curriculum_id = c.id and v.status = 'approved'
        where c.learner_id = v_learner and c.id is distinct from v_main
      ) o), '[]'::jsonb),
    'milestones', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', s.milestone_id, 'kind', s.kind, 'role', s.role, 'title', s.title, 'curriculum_id', s.curriculum_id,
        'after_unit', s.after_unit, 'target_month', s.target_month, 'approx', s.approx) order by s.created_at, s.milestone_id)
      from english.eng_roadmap_visible(v_learner) s), '[]'::jsonb)
  );
end
$$;

-- 7. Quyền thực thi -----------------------------------------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'eng_roadmap_write(uuid, uuid, int, jsonb, text, text, text, uuid, text)',
    'eng_roadmap_set_main(uuid, uuid, uuid, text)',
    'eng_roadmap(uuid)'
  ] loop
    execute 'revoke execute on function english.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function english.' || f || ' to service_role';
  end loop;
end
$$;
revoke execute on function english.eng_my_roadmap() from public, anon, service_role;
grant execute on function english.eng_my_roadmap() to authenticated;

-- 8. Xóa dữ liệu một em: = bản 0030 + 2 bảng (roadmap_milestones, roadmap_main_curriculum: trước giáo trình vì khóa ngoại).
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

-- Đếm trước khi xóa = bản 0030 + 2 bảng (cùng khóa với biên nhận).
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
      'roadmap_main_curriculum', (select pg_catalog.count(*) from english.roadmap_main_curriculum x where x.learner_id = p_learner)));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0031') on conflict do nothing;
