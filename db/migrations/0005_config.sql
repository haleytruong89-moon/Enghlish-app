-- 0005_config.sql
-- Cấu hình có version, bất biến sau khi công bố (DESIGN §4, §8; S1 plan).
-- Bảng: tracks, assessment_policies, catalogue_versions, dimensions, targets,
--       aggregate_indicators, activity_templates, target_set_definitions, target_sets.
-- Dữ liệu danh mục/ngưỡng/target set nằm ở 0006 (sinh từ content/*.json).
-- Không đụng schema public. Idempotent.

-- tracks ---------------------------------------------------------------------------
create table if not exists english.tracks (
  id text primary key check (length(btrim(id)) > 0),
  name text not null check (length(btrim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'draft')),
  -- Chưa có quy định trong PRD/DESIGN → để trống, không tự đặt giá trị.
  scaffold_level text,
  canvas_template text,
  domain_mix jsonb not null default '{}'::jsonb,
  thinking_task_levels text[] not null default '{}',
  ai_modes text[] not null default '{}'
);

-- Hai track đều active (PRD v1.1, D24). AI: Reviewer + Coach cho cả hai;
-- Clarifier/Challenger của Track B chỉ từ hè 2027 (PRD §2.1) nên chưa có ở đây.
insert into english.tracks(id, name, status, canvas_template, domain_mix, thinking_task_levels, ai_modes)
values
  ('A', 'Track A', 'active', 'ACT-CANVAS-BASIC',
   '{"description": "science/nature-heavy; no fixed ratio"}'::jsonb,
   '{TL1,TL2}', '{reviewer,coach}'),
  ('B', 'Track B', 'active', 'ACT-CANVAS-ADV',
   '{"description": "until the grade-10 exam: about 60% exam-aligned and 40% thinking/argument; from summer 2027: 70% social/humanities, 30% natural science"}'::jsonb,
   '{TL3,TL4}', '{reviewer,coach}')
on conflict (id) do nothing;

-- assessment_policies ----------------------------------------------------------------
create table if not exists english.assessment_policies (
  version text primary key check (length(btrim(version)) > 0),
  config jsonb not null,
  source_hash text not null,
  published_at timestamptz
);

-- catalogue_versions + nội dung -----------------------------------------------------
create table if not exists english.catalogue_versions (
  version text primary key check (length(btrim(version)) > 0),
  descriptor_version text not null,
  assessment_policy_version text not null references english.assessment_policies(version),
  source_hash text not null,
  meta jsonb not null,
  published_at timestamptz
);

create table if not exists english.dimensions (
  id text not null,
  catalogue_version text not null references english.catalogue_versions(version),
  dim_group text not null check (dim_group in ('language', 'thinking', 'autonomy', 'extension')),
  name_en text not null,
  name_vi text not null,
  ai_scorable boolean not null,
  cefr_applicable boolean not null,
  extension boolean not null,
  track_ids text[] not null,
  rubric jsonb not null,
  rubric_vi jsonb not null,
  raw jsonb not null,
  primary key (id, catalogue_version)
);

create table if not exists english.targets (
  id text not null,
  descriptor_version text not null,
  catalogue_version text not null,
  track_id text not null references english.tracks(id),
  dimension_id text not null,
  title_en text not null,
  title_vi text not null,
  target_demand text not null,
  input_modality text check (input_modality is null or input_modality in ('reading', 'listening', 'source_any')),
  output_modality text not null check (output_modality in ('writing', 'speaking', 'any')),
  success_criteria jsonb not null,
  opportunity_rule text not null,
  ai_may_propose boolean not null,
  core boolean not null,
  status text not null check (status in ('active', 'draft', 'retired')),
  raw jsonb not null,
  primary key (id, descriptor_version),
  foreign key (dimension_id, catalogue_version) references english.dimensions(id, catalogue_version)
);
create index if not exists targets_track_idx on english.targets(track_id, catalogue_version);

-- Chỉ số tổng hợp: chỉ để theo dõi, KHÔNG BAO GIỜ là cổng mastery (quyết định 4 của plan S1).
create table if not exists english.aggregate_indicators (
  id text not null,
  catalogue_version text not null references english.catalogue_versions(version),
  track_id text not null references english.tracks(id),
  dimension_id text,
  definition text not null,
  definition_vi text not null,
  use text not null check (use = 'diagnostic_only'),
  mastery_gate boolean not null check (mastery_gate = false),
  raw jsonb not null,
  primary key (id, catalogue_version),
  foreign key (dimension_id, catalogue_version) references english.dimensions(id, catalogue_version)
);

-- activity_templates (8 loại, D19). `schema` do các lát sau điền (S2/S4) → không đóng băng.
create table if not exists english.activity_templates (
  id text primary key check (id ~ '^ACT-[A-Z0-9-]+$'),
  track_ids text[] not null,
  description text not null default '',
  schema jsonb not null default '{}'::jsonb
);

-- target_set_definitions: bộ target đã công bố, bất biến (A-v1, B-v1, …) ---------------
create table if not exists english.target_set_definitions (
  id text primary key check (length(btrim(id)) > 0),
  track_id text not null references english.tracks(id),
  version int not null check (version > 0),
  descriptor_version text not null,
  catalogue_version text not null references english.catalogue_versions(version),
  target_ids text[] not null check (cardinality(target_ids) > 0),
  -- {"dimensions": [...], "aggregates": [...]} — hiển thị, KHÔNG nằm trong mẫu số.
  tracking_only jsonb not null default '{"dimensions": [], "aggregates": []}'::jsonb,
  source_hash text not null,
  published_at timestamptz,
  unique (track_id, version)
);

-- target_sets: learner nào đang theo bộ nào (append-only).
-- Bộ HIỆN HÀNH = dòng có (effective_from desc, seq desc) đầu tiên. `seq` tăng đơn điệu nên hai lần gán
-- trong CÙNG một transaction vẫn có thứ tự rõ ràng (now() đứng yên trong transaction, clock_timestamp() thì không).
create table if not exists english.target_sets (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  learner_id uuid not null references english.learners(id),
  definition_id text not null references english.target_set_definitions(id),
  effective_from timestamptz not null default clock_timestamp(),
  assigned_by uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists target_sets_learner_idx on english.target_sets(learner_id, effective_from desc, seq desc);

-- learners.track_id → tracks (expand: giữ nguyên check cũ) -------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'learners_track_id_fkey' and conrelid = 'english.learners'::regclass
  ) then
    alter table english.learners
      add constraint learners_track_id_fkey foreign key (track_id) references english.tracks(id) not valid;
  end if;
end
$$;
alter table english.learners validate constraint learners_track_id_fkey;

-- Bất biến sau khi công bố ------------------------------------------------------------------
-- Tham số 'self'     : dòng có cột published_at; đã có giá trị → cấm UPDATE/DELETE.
-- Tham số 'catalogue': dòng thuộc catalogue_version; version đó đã công bố → cấm INSERT/UPDATE/DELETE.
-- TRUNCATE luôn bị cấm. (Công bố = UPDATE published_at từ NULL, chỉ làm được khi chưa công bố.)
create or replace function english.eng_forbid_published_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mode text := coalesce(tg_argv[0], 'self');
  v_version text;
  v_published boolean;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'english.%: TRUNCATE is forbidden on versioned configuration', tg_table_name
      using errcode = '42501';
  end if;

  if v_mode = 'self' then
    if tg_op = 'INSERT' then
      return new;
    end if;
    v_published := old.published_at is not null;
  else
    if tg_op = 'INSERT' then
      v_version := new.catalogue_version;
    else
      v_version := old.catalogue_version;
    end if;
    select exists (
      select 1 from english.catalogue_versions cv
      where cv.version = v_version and cv.published_at is not null
    ) into v_published;
  end if;

  if v_published then
    raise exception 'english.%: % is forbidden on a published configuration row (publish a new version instead)',
      tg_table_name, tg_op
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke execute on function english.eng_forbid_published_change() from public, anon, authenticated;

drop trigger if exists catalogue_versions_immutable on english.catalogue_versions;
create trigger catalogue_versions_immutable
  before update or delete on english.catalogue_versions
  for each row execute function english.eng_forbid_published_change('self');

drop trigger if exists assessment_policies_immutable on english.assessment_policies;
create trigger assessment_policies_immutable
  before update or delete on english.assessment_policies
  for each row execute function english.eng_forbid_published_change('self');

drop trigger if exists target_set_definitions_immutable on english.target_set_definitions;
create trigger target_set_definitions_immutable
  before update or delete on english.target_set_definitions
  for each row execute function english.eng_forbid_published_change('self');

drop trigger if exists dimensions_immutable on english.dimensions;
create trigger dimensions_immutable
  before insert or update or delete on english.dimensions
  for each row execute function english.eng_forbid_published_change('catalogue');

drop trigger if exists targets_immutable on english.targets;
create trigger targets_immutable
  before insert or update or delete on english.targets
  for each row execute function english.eng_forbid_published_change('catalogue');

drop trigger if exists aggregate_indicators_immutable on english.aggregate_indicators;
create trigger aggregate_indicators_immutable
  before insert or update or delete on english.aggregate_indicators
  for each row execute function english.eng_forbid_published_change('catalogue');

do $$
declare
  t text;
begin
  foreach t in array array[
    'catalogue_versions', 'assessment_policies', 'target_set_definitions',
    'dimensions', 'targets', 'aggregate_indicators'
  ] loop
    execute format('drop trigger if exists %I on english.%I', t || '_immutable_truncate', t);
    execute format(
      'create trigger %I before truncate on english.%I for each statement execute function english.eng_forbid_published_change()',
      t || '_immutable_truncate', t);
  end loop;
end
$$;

-- Kiểm tra một target set khi tạo/sửa: danh mục của nó đã công bố (nếu bộ được công bố), target thuộc
-- đúng track + descriptor_version, không trùng, mục "theo dõi" có thật.
-- (Không có khóa ngoại cho mảng nên kiểm bằng trigger.)
create or replace function english.eng_check_target_set_definition() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_bad text;
begin
  if new.published_at is not null and not exists (
    select 1 from english.catalogue_versions cv
    where cv.version = new.catalogue_version and cv.published_at is not null
  ) then
    raise exception 'target set %: catalogue version % is not published yet', new.id, new.catalogue_version
      using errcode = '23514';
  end if;

  if (select count(distinct x) from unnest(new.target_ids) as x) <> cardinality(new.target_ids) then
    raise exception 'target set %: duplicate target ids', new.id using errcode = '23514';
  end if;

  select x into v_bad
  from unnest(new.target_ids) as x
  where not exists (
    select 1 from english.targets t
    where t.id = x and t.descriptor_version = new.descriptor_version and t.track_id = new.track_id
  )
  limit 1;
  if v_bad is not null then
    raise exception 'target set %: target % does not exist for track % in descriptor version %',
      new.id, v_bad, new.track_id, new.descriptor_version using errcode = '23514';
  end if;

  select x into v_bad
  from jsonb_array_elements_text(coalesce(new.tracking_only -> 'dimensions', '[]'::jsonb)) as x
  where not exists (
    select 1 from english.dimensions d where d.id = x and d.catalogue_version = new.catalogue_version
  )
  limit 1;
  if v_bad is not null then
    raise exception 'target set %: unknown tracking-only dimension %', new.id, v_bad using errcode = '23514';
  end if;

  select x into v_bad
  from jsonb_array_elements_text(coalesce(new.tracking_only -> 'aggregates', '[]'::jsonb)) as x
  where not exists (
    select 1 from english.aggregate_indicators a
    where a.id = x and a.catalogue_version = new.catalogue_version and a.track_id = new.track_id
  )
  limit 1;
  if v_bad is not null then
    raise exception 'target set %: unknown tracking-only aggregate %', new.id, v_bad using errcode = '23514';
  end if;

  return new;
end
$$;

revoke execute on function english.eng_check_target_set_definition() from public, anon, authenticated;

drop trigger if exists target_set_definitions_check on english.target_set_definitions;
create trigger target_set_definitions_check
  before insert or update on english.target_set_definitions
  for each row execute function english.eng_check_target_set_definition();

-- Đổi track của một em sau khi đã gán bộ kỹ năng: chưa hỗ trợ trong pilot -------------------------
create or replace function english.eng_forbid_track_change_after_assignment() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from english.target_sets ts where ts.learner_id = new.id) then
    raise exception 'learner %: track change after a target set was assigned is not supported in the pilot — create a new learner for the other track and assign its set instead',
      new.id using errcode = '23514';
  end if;
  return new;
end
$$;

revoke execute on function english.eng_forbid_track_change_after_assignment() from public, anon, authenticated;

drop trigger if exists learners_track_change on english.learners;
create trigger learners_track_change
  before update of track_id on english.learners
  for each row when (old.track_id is distinct from new.track_id)
  execute function english.eng_forbid_track_change_after_assignment();

-- target_sets: append-only (theo hướng dẫn đầu 0004) ------------------------------------------
drop trigger if exists target_sets_forbid_mutation on english.target_sets;
create trigger target_sets_forbid_mutation
  before update or delete on english.target_sets
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists target_sets_forbid_truncate on english.target_sets;
create trigger target_sets_forbid_truncate
  before truncate on english.target_sets
  for each statement execute function english.eng_forbid_mutation();

-- Gán bộ target cho một learner (chỉ service role / SQL Editor) ---------------------------------
-- Idempotent: nếu bộ hiện hành đã là p_set thì không thêm dòng mới.
create or replace function english.eng_assign_target_set(p_learner uuid, p_set text) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_track text;
  v_family uuid;
  v_set_track text;
  v_current_id uuid;
  v_current_def text;
  v_id uuid;
  v_actor uuid := auth.uid();
  v_actor_role text;
begin
  select l.track_id, l.family_id into v_track, v_family
  from english.learners l where l.id = p_learner
  for update;
  if v_family is null then
    raise exception 'eng_assign_target_set: learner % not found', p_learner using errcode = 'P0002';
  end if;

  select d.track_id into v_set_track
  from english.target_set_definitions d
  where d.id = p_set and d.published_at is not null;
  if v_set_track is null then
    raise exception 'eng_assign_target_set: target set % not found or not published', p_set using errcode = 'P0002';
  end if;

  if v_set_track <> v_track then
    raise exception 'eng_assign_target_set: set % belongs to another track than the learner', p_set
      using errcode = '23514';
  end if;

  select ts.id, ts.definition_id into v_current_id, v_current_def
  from english.target_sets ts
  where ts.learner_id = p_learner and ts.effective_from <= pg_catalog.clock_timestamp()
  order by ts.effective_from desc, ts.seq desc
  limit 1;
  if v_current_id is not null and v_current_def = p_set then
    return v_current_id;
  end if;

  insert into english.target_sets(learner_id, definition_id, assigned_by, effective_from, created_at)
  values (p_learner, p_set, v_actor, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp())
  returning id into v_id;

  select m.role into v_actor_role from english.members m where m.user_id = v_actor;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_actor, v_actor_role, 'target_set.assigned', v_family, p_learner,
          pg_catalog.jsonb_build_object('target_set', p_set, 'previous', v_current_def));

  return v_id;
end
$$;

revoke execute on function english.eng_assign_target_set(uuid, text) from public, anon, authenticated;
grant execute on function english.eng_assign_target_set(uuid, text) to service_role;

-- Purge: thêm target_sets (trước learners). Thân hàm = 0004 + dòng target_sets. -------------------
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
  n_target_sets int := 0;
  n_consents int := 0;
  n_relationships int := 0;
  n_members int := 0;
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
  delete from english.target_sets ts where ts.learner_id = p_learner_id;
  get diagnostics n_target_sets = row_count;

  delete from english.audit_log a where a.learner_id = p_learner_id;
  get diagnostics n_audit = row_count;

  delete from english.consents c where c.learner_id = p_learner_id;
  get diagnostics n_consents = row_count;

  delete from english.relationships r where r.learner_id = p_learner_id;
  get diagnostics n_relationships = row_count;

  delete from english.learners l where l.id = p_learner_id;

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
      'consents', n_consents,
      'relationships', n_relationships,
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

-- RLS ----------------------------------------------------------------------------------------
-- Đọc: thành viên app này (có dòng trong english.members) đọc được cấu hình ĐÃ CÔNG BỐ.
-- Không có policy INSERT/UPDATE/DELETE nào cho authenticated/anon.
alter table english.tracks enable row level security;
alter table english.assessment_policies enable row level security;
alter table english.catalogue_versions enable row level security;
alter table english.dimensions enable row level security;
alter table english.targets enable row level security;
alter table english.aggregate_indicators enable row level security;
alter table english.activity_templates enable row level security;
alter table english.target_set_definitions enable row level security;
alter table english.target_sets enable row level security;

drop policy if exists tracks_select on english.tracks;
create policy tracks_select on english.tracks
  for select to authenticated
  using (english.eng_current_member_id() is not null);

drop policy if exists activity_templates_select on english.activity_templates;
create policy activity_templates_select on english.activity_templates
  for select to authenticated
  using (english.eng_current_member_id() is not null);

drop policy if exists assessment_policies_select on english.assessment_policies;
create policy assessment_policies_select on english.assessment_policies
  for select to authenticated
  using (published_at is not null and english.eng_current_member_id() is not null);

drop policy if exists catalogue_versions_select on english.catalogue_versions;
create policy catalogue_versions_select on english.catalogue_versions
  for select to authenticated
  using (published_at is not null and english.eng_current_member_id() is not null);

drop policy if exists target_set_definitions_select on english.target_set_definitions;
create policy target_set_definitions_select on english.target_set_definitions
  for select to authenticated
  using (published_at is not null and english.eng_current_member_id() is not null);

drop policy if exists dimensions_select on english.dimensions;
create policy dimensions_select on english.dimensions
  for select to authenticated
  using (
    english.eng_current_member_id() is not null
    and exists (
      select 1 from english.catalogue_versions cv
      where cv.version = dimensions.catalogue_version and cv.published_at is not null)
  );

drop policy if exists targets_select on english.targets;
create policy targets_select on english.targets
  for select to authenticated
  using (
    english.eng_current_member_id() is not null
    and exists (
      select 1 from english.catalogue_versions cv
      where cv.version = targets.catalogue_version and cv.published_at is not null)
  );

drop policy if exists aggregate_indicators_select on english.aggregate_indicators;
create policy aggregate_indicators_select on english.aggregate_indicators
  for select to authenticated
  using (
    english.eng_current_member_id() is not null
    and exists (
      select 1 from english.catalogue_versions cv
      where cv.version = aggregate_indicators.catalogue_version and cv.published_at is not null)
  );

-- target_sets: ai đọc được learner thì đọc được bộ target của learner đó.
drop policy if exists target_sets_select on english.target_sets;
create policy target_sets_select on english.target_sets
  for select to authenticated
  using (english.eng_can_read_learner(learner_id));

-- Grant theo từng bảng (không dùng "on all tables") ---------------------------------------------
grant select on
  english.tracks, english.assessment_policies, english.catalogue_versions, english.dimensions,
  english.targets, english.aggregate_indicators, english.activity_templates,
  english.target_set_definitions, english.target_sets
  to authenticated;

-- Cấu hình chỉ do migration (chủ sở hữu) ghi. Thu quyền ghi mặc định của service_role;
-- target_sets chỉ ghi qua english.eng_assign_target_set.
revoke insert, update, delete, truncate on
  english.tracks, english.assessment_policies, english.catalogue_versions, english.dimensions,
  english.targets, english.aggregate_indicators, english.activity_templates,
  english.target_set_definitions, english.target_sets
  from public, anon, authenticated, service_role;

insert into english.schema_migrations(version) values ('0005') on conflict do nothing;
