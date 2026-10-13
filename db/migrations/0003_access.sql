-- 0003_access.sql
-- Hàm quyền + RLS + grant (DESIGN §3 "Hàm quyền", §7).
-- Mọi hàm: security definer, stable, search_path = '' → mọi tên phải ghi đủ schema.
-- Idempotent.

-- Hàm trợ giúp --------------------------------------------------------------------
create or replace function english.eng_current_member_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id from english.members m where m.user_id = auth.uid()
$$;

create or replace function english.eng_member_role() returns text
language sql stable security definer set search_path = ''
as $$
  select m.role from english.members m where m.user_id = auth.uid()
$$;

create or replace function english.eng_member_family_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.family_id from english.members m where m.user_id = auth.uid()
$$;

create or replace function english.eng_is_parent() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select m.role = 'parent' from english.members m where m.user_id = auth.uid()),
    false
  )
$$;

-- Đọc được learner khi: là chính học sinh đó; HOẶC có relationship còn hiệu lực;
-- HOẶC là phụ huynh cùng gia đình (DESIGN §7: phụ huynh thấy mọi learner trong gia đình).
create or replace function english.eng_can_read_learner(p_learner_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  with me as (
    select m.id, m.role, m.family_id from english.members m where m.user_id = auth.uid()
  )
  select coalesce((
    select
      -- học sinh: learner gắn với tài khoản của mình
      (me.role = 'student' and l.member_id = me.id)
      -- gia sư / phụ huynh: quan hệ còn hiệu lực
      or (me.role in ('tutor', 'parent') and exists (
            select 1 from english.relationships r
            where r.learner_id = l.id
              and r.member_id = me.id
              and r.valid_from <= now()
              and (r.valid_to is null or r.valid_to > now())))
      -- phụ huynh: cùng gia đình
      or (me.role = 'parent' and l.family_id = me.family_id)
    from english.learners l, me
    where l.id = p_learner_id
  ), false)
$$;

-- Phụ huynh của gia đình chứa learner này (dùng cho consents).
create or replace function english.eng_is_parent_of(p_learner_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select m.role = 'parent' and m.family_id = l.family_id
    from english.members m, english.learners l
    where m.user_id = auth.uid() and l.id = p_learner_id
  ), false)
$$;

-- Hàm quyền: chỉ authenticated + service_role được gọi (cần cho biểu thức policy).
revoke execute on function english.eng_current_member_id() from public, anon;
revoke execute on function english.eng_member_role() from public, anon;
revoke execute on function english.eng_member_family_id() from public, anon;
revoke execute on function english.eng_is_parent() from public, anon;
revoke execute on function english.eng_can_read_learner(uuid) from public, anon;
revoke execute on function english.eng_is_parent_of(uuid) from public, anon;
grant execute on function english.eng_current_member_id() to authenticated, service_role;
grant execute on function english.eng_member_role() to authenticated, service_role;
grant execute on function english.eng_member_family_id() to authenticated, service_role;
grant execute on function english.eng_is_parent() to authenticated, service_role;
grant execute on function english.eng_can_read_learner(uuid) to authenticated, service_role;
grant execute on function english.eng_is_parent_of(uuid) to authenticated, service_role;

-- RLS: bật cho MỌI bảng ---------------------------------------------------------------
alter table english.schema_migrations enable row level security;
alter table english.families enable row level security;
alter table english.members enable row level security;
alter table english.learners enable row level security;
alter table english.relationships enable row level security;
alter table english.consents enable row level security;
alter table english.audit_log enable row level security;
alter table english.app_errors enable row level security;

-- families: thành viên đọc gia đình của mình.
drop policy if exists families_select on english.families;
create policy families_select on english.families
  for select to authenticated
  using (id = english.eng_member_family_id());

-- members: dòng của chính mình; phụ huynh thấy cả gia đình;
-- ai đọc được learner thì đọc được tài khoản học sinh của learner đó (tên hiển thị, màu).
drop policy if exists members_select on english.members;
create policy members_select on english.members
  for select to authenticated
  using (
    user_id = auth.uid()
    or (english.eng_is_parent() and family_id = english.eng_member_family_id())
    or exists (
      select 1 from english.learners l
      where l.member_id = members.id and english.eng_can_read_learner(l.id)
    )
  );

-- learners
drop policy if exists learners_select on english.learners;
create policy learners_select on english.learners
  for select to authenticated
  using (english.eng_can_read_learner(id));

-- relationships: của chính mình; phụ huynh thấy mọi quan hệ trong gia đình.
drop policy if exists relationships_select on english.relationships;
create policy relationships_select on english.relationships
  for select to authenticated
  using (
    member_id = english.eng_current_member_id()
    or english.eng_is_parent_of(learner_id)
  );

-- consents: CHỈ phụ huynh (gia sư, học sinh không thấy).
drop policy if exists consents_select on english.consents;
create policy consents_select on english.consents
  for select to authenticated
  using (english.eng_is_parent_of(learner_id));

-- audit_log: chỉ phụ huynh, trong gia đình mình.
drop policy if exists audit_log_select on english.audit_log;
create policy audit_log_select on english.audit_log
  for select to authenticated
  using (english.eng_is_parent() and family_id = english.eng_member_family_id());

-- app_errors, schema_migrations: không policy → authenticated không đọc được.

-- Grant -------------------------------------------------------------------------------
-- anon: không gì. authenticated: chỉ SELECT (ghi qua route server dùng service role).
revoke all on all tables in schema english from public, anon, authenticated;
revoke all on all sequences in schema english from public, anon, authenticated;

grant select on english.families, english.members, english.learners,
  english.relationships, english.consents, english.audit_log
  to authenticated;

-- service_role (route server): đọc/ghi. Bảng append-only bị thu hồi update/delete/truncate ở 0004+.
-- Migration sau KHÔNG dùng grant hàng loạt kiểu này nữa (sẽ cấp lại quyền đã thu hồi) — grant theo từng bảng.
grant select, insert, update, delete on all tables in schema english to service_role;
grant usage, select on all sequences in schema english to service_role;

insert into english.schema_migrations(version) values ('0003') on conflict do nothing;
