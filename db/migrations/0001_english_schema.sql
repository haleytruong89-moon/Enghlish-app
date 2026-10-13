-- 0001_english_schema.sql
-- Schema riêng `english` cho Learning OS (DESIGN §2). Không tạo gì trong `public`.
-- Idempotent. Áp bằng `npm run db:apply` hoặc dán vào Supabase SQL Editor.

create schema if not exists english;

comment on schema english is
  'Learning OS (Family Edition). Mọi đối tượng của app nằm ở đây; schema public thuộc Study Launcher.';

-- Bảng theo dõi migration riêng (không dùng supabase_migrations của Launcher).
create table if not exists english.schema_migrations (
  version text primary key check (version ~ '^[0-9]{4}$'),
  applied_at timestamptz not null default now()
);

alter table english.schema_migrations enable row level security;
-- Không policy nào: chỉ service_role / chủ sở hữu đọc được.

-- Quyền trên schema --------------------------------------------------------------
-- anon: không gì cả. authenticated: chỉ usage (quyền đọc từng bảng cấp ở 0003).
revoke all on schema english from public;
revoke all on schema english from anon;
grant usage on schema english to authenticated;
grant usage on schema english to service_role;

-- Quyền mặc định cho đối tượng tạo sau này (bởi role đang chạy migration).
-- Hàm mới KHÔNG tự cấp execute cho PUBLIC; bảng mới không tự cấp cho anon/authenticated.
alter default privileges in schema english revoke execute on functions from public;
alter default privileges in schema english revoke all on tables from anon, authenticated;
alter default privileges in schema english revoke all on sequences from anon, authenticated;
alter default privileges in schema english revoke execute on functions from anon, authenticated;
alter default privileges in schema english grant select, insert, update, delete on tables to service_role;
alter default privileges in schema english grant usage, select on sequences to service_role;

revoke all on english.schema_migrations from public, anon, authenticated;
grant select on english.schema_migrations to service_role;

insert into english.schema_migrations(version) values ('0001') on conflict do nothing;
