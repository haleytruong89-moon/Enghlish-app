-- 0002_identity.sql
-- Danh tính, quan hệ, consent, nhật ký (DESIGN §3, §6 audit_log/app_errors, §14).
-- Idempotent.

-- families ------------------------------------------------------------------------
create table if not exists english.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now()
);

-- members: vai trò trong app NÀY (không dùng public.profiles của Launcher) ---------
create table if not exists english.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  family_id uuid not null references english.families(id) on delete restrict,
  role text not null check (role in ('parent', 'tutor', 'student')),
  display_name text not null check (length(btrim(display_name)) > 0),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);
create index if not exists members_family_idx on english.members(family_id);

-- learners -------------------------------------------------------------------------
-- track_id là text 'A'|'B' ở S0; S1 thêm english.tracks và khóa ngoại.
create table if not exists english.learners (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references english.families(id) on delete restrict,
  member_id uuid unique references english.members(id) on delete set null,
  alias text not null check (length(btrim(alias)) > 0),
  track_id text not null check (track_id in ('A', 'B')),
  external_ref text unique,
  is_test boolean not null default false,
  ai_enabled boolean not null default false,
  status text not null default 'draft' check (status in ('active', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists learners_family_idx on english.learners(family_id);

-- relationships: quyền theo quan hệ có thời hạn (FR-01, FR-01b) ---------------------
create table if not exists english.relationships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references english.members(id) on delete cascade,
  learner_id uuid not null references english.learners(id) on delete cascade,
  relation text not null check (relation in ('parent', 'tutor')),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  constraint relationships_valid_range check (valid_to is null or valid_to > valid_from)
);
create index if not exists relationships_member_idx on english.relationships(member_id, learner_id);
create index if not exists relationships_learner_idx on english.relationships(learner_id);

-- consents: có version; đổi = thêm dòng mới, dòng mới nhất theo (learner, subject, scope) là hiệu lực
create table if not exists english.consents (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id) on delete cascade,
  subject_member_id uuid not null references english.members(id) on delete cascade,
  notice_version text not null check (length(btrim(notice_version)) > 0),
  scope text not null check (scope in ('data', 'ai_text')),
  granted boolean not null,
  recorded_by uuid references english.members(id) on delete set null,
  at timestamptz not null default now()
);
create index if not exists consents_lookup_idx on english.consents(learner_id, scope, at desc);

-- audit_log: append-only (trigger ở 0004). payload KHÔNG chứa nội dung bài làm/PII.
-- learner_id/family_id cố ý không có khóa ngoại: biên nhận purge phải còn sau khi xóa learner.
create table if not exists english.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_user_id uuid,
  actor_role text,
  action text not null check (length(btrim(action)) > 0),
  family_id uuid,
  learner_id uuid,
  payload jsonb not null default '{}'::jsonb,
  correlation_id text
);
create index if not exists audit_log_learner_idx on english.audit_log(learner_id);
create index if not exists audit_log_family_at_idx on english.audit_log(family_id, at desc);

-- app_errors: thay cho dịch vụ log bên thứ ba (DESIGN §14). Không ghi bài làm/transcript.
create table if not exists english.app_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  route text,
  code text,
  message text,
  user_id uuid,
  correlation_id text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists app_errors_at_idx on english.app_errors(at desc);

-- Toàn vẹn chéo bảng ---------------------------------------------------------------
-- learners.member_id phải là tài khoản 'student' cùng gia đình.
create or replace function english.eng_check_learner_member() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role text;
  v_family uuid;
begin
  new.updated_at := now();
  if new.member_id is null then
    return new;
  end if;
  select m.role, m.family_id into v_role, v_family
  from english.members m where m.id = new.member_id;
  if v_role is distinct from 'student' or v_family is distinct from new.family_id then
    raise exception 'learners.member_id must be a student member of the same family'
      using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists learners_member_check on english.learners;
create trigger learners_member_check
  before insert or update on english.learners
  for each row execute function english.eng_check_learner_member();

-- relationships: relation khớp vai trò của member, cùng gia đình với learner.
create or replace function english.eng_check_relationship() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role text;
  v_member_family uuid;
  v_learner_family uuid;
begin
  select m.role, m.family_id into v_role, v_member_family
  from english.members m where m.id = new.member_id;
  select l.family_id into v_learner_family
  from english.learners l where l.id = new.learner_id;
  if v_role is distinct from new.relation then
    raise exception 'relationship.relation (%) must match member role (%)', new.relation, v_role
      using errcode = '23514';
  end if;
  if v_member_family is distinct from v_learner_family then
    raise exception 'relationship member and learner must be in the same family'
      using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists relationships_check on english.relationships;
create trigger relationships_check
  before insert or update on english.relationships
  for each row execute function english.eng_check_relationship();

revoke execute on function english.eng_check_learner_member() from public, anon, authenticated;
revoke execute on function english.eng_check_relationship() from public, anon, authenticated;

insert into english.schema_migrations(version) values ('0002') on conflict do nothing;
