-- =============================================================================
-- Supabase-like stub — CHỈ dùng cho test local và CI. KHÔNG BAO GIỜ áp vào
-- project Supabase thật (ở đó các đối tượng này đã có sẵn).
--
-- Tạo:
--   1. Role anon / authenticated / service_role (giống Supabase).
--   2. Schema auth với auth.users + auth.uid() đọc request.jwt.claim.sub.
--   3. Bản giả lập tối thiểu của Study Launcher trong schema public
--      (public.families, public.profiles, public.audit_log, public.auth_family_id(),
--      public.auth_role()) để chứng minh schema english không va chạm.
-- Idempotent: chạy lại nhiều lần không lỗi.
-- =============================================================================

-- 1. Roles (cluster-wide) -----------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- 2. auth schema ----------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);
grant select on auth.users to service_role;

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- 3. Study Launcher stub (schema public) ----------------------------------------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id),
  role text not null check (role in ('parent', 'child')),
  display_name text not null
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  at timestamptz not null default now()
);

create or replace function public.auth_family_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select family_id from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_role() returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists launcher_families_read on public.families;
create policy launcher_families_read on public.families
  for select to authenticated using (id = public.auth_family_id());

drop policy if exists launcher_profiles_read on public.profiles;
create policy launcher_profiles_read on public.profiles
  for select to authenticated using (family_id = public.auth_family_id());

drop policy if exists launcher_audit_read on public.audit_log;
create policy launcher_audit_read on public.audit_log
  for select to authenticated using (public.auth_role() = 'parent');

grant usage on schema public to anon, authenticated, service_role;
grant select on public.families, public.profiles, public.audit_log to authenticated;
grant all on public.families, public.profiles, public.audit_log to service_role;
