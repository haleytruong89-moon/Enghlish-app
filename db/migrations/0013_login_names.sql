-- 0013_login_names.sql
-- S5b-1 (PR A, bước 1): tên đăng nhập ngắn (an, nguyen, giasu-an, giasu-nguyen) thay cho việc gõ email dài.
-- Mỗi tên trỏ tới ĐÚNG MỘT tài khoản đăng nhập (auth.users). Màn đăng nhập đổi tên → email Ở PHÍA SERVER (service role) rồi
-- đăng nhập như thường: email không bao giờ được gửi xuống trình duyệt.
--
-- An toàn:
--  * Bảng bật RLS, KHÔNG có policy và KHÔNG grant cho anon/authenticated/service_role: không ai đọc/ghi trực tiếp qua API.
--    Chỉ chủ sở hữu (migration, script tạo gia đình qua DATABASE_URL) ghi được.
--  * eng_login_email(tên) là hàm security definer, CHỈ service_role được gọi; trả email của tên đang bật, ngược lại NULL.
--    Tên không có và mật khẩu sai trả CÙNG một câu lỗi ở màn đăng nhập (xem app/login).
-- Không đụng schema public. Idempotent.

create table if not exists english.login_names (
  login_name text primary key check (login_name ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  -- id của auth.users. Không có khóa ngoại: xóa tài khoản bên Supabase không bị chặn bởi bảng này (tên mồ côi chỉ trả NULL).
  auth_user_id uuid not null unique,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp()
);

alter table english.login_names enable row level security;
revoke all on english.login_names from public, anon, authenticated, service_role;

-- Email đăng nhập của một tên đang bật (viết thường, bỏ khoảng trắng đầu/cuối). Tên lạ / đã tắt / tài khoản đã xóa → NULL.
create or replace function english.eng_login_email(p_name text) returns text
language sql stable security definer set search_path = ''
as $$
  select u.email::text
  from english.login_names n
  join auth.users u on u.id = n.auth_user_id
  where n.login_name = pg_catalog.lower(pg_catalog.btrim(coalesce(p_name, ''))) and n.active
$$;

revoke execute on function english.eng_login_email(text) from public, anon, authenticated;
grant execute on function english.eng_login_email(text) to service_role;

insert into english.schema_migrations(version) values ('0013') on conflict do nothing;
