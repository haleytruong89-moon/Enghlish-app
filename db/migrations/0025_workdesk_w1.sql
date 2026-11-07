-- 0025_workdesk_w1.sql
-- W1 · Ghi chú dạy học + hồ sơ đầu vào + góp ý về app (spec docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md §4 W1;
-- luật docs/DOMAIN.md §2, §3 tầng C, §4, §6, §7, §13 D-W8, §14 R8).
--   1. english.teaching_notes (append-only): 4 ô — focus / explain / errors / avoid. Bản hiện hành = dòng mới nhất của từng ô.
--   2. english.learner_intake (append-only): hồ sơ đầu vào (mục tiêu + mạnh/yếu ban đầu theo mảng). Bản hiện hành = dòng mới nhất.
--   3. english.app_feedback + english.app_feedback_events (append-only, theo GIA ĐÌNH, không có learner_id): góp ý về app của
--      thầy/cô hoặc phụ huynh; trạng thái = sự kiện mới nhất (new → in_progress → done | wont_do).
--   4. Ghi: eng_write_teaching_note / eng_write_intake (CHỈ gia sư của em), eng_send_app_feedback (người lớn trong gia đình),
--      eng_update_app_feedback (CHỈ phụ huynh). Học sinh không đọc được bảng nào.
--   5. eng_purge_learner + eng_purge_preview thêm teaching_notes, learner_intake.
-- Idempotent; chỉ thêm (expand). Không đụng schema public.

create table if not exists english.teaching_notes (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  field text not null check (field in ('focus', 'explain', 'errors', 'avoid')),
  text text not null check (pg_catalog.length(text) <= 600),
  author_member uuid not null,
  author_role text not null check (author_role = 'tutor'),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id, field)
);
create index if not exists teaching_notes_learner_idx on english.teaching_notes(learner_id, field, created_at desc);

create table if not exists english.learner_intake (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  -- {goals:[{title,due}], strengths:{domain:text}, weaknesses:{domain:text}, note}; hình dạng kiểm ở hàm ghi + zod.
  content jsonb not null check (pg_catalog.jsonb_typeof(content) = 'object'),
  author_member uuid not null,
  author_role text not null check (author_role = 'tutor'),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create index if not exists learner_intake_learner_idx on english.learner_intake(learner_id, created_at desc);

create table if not exists english.app_feedback (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references english.families(id),
  by_member uuid not null,
  by_role text not null check (by_role in ('tutor', 'parent')),
  kind text not null check (kind in ('bug', 'hard_to_use', 'suggestion', 'question')),
  screen text not null check (pg_catalog.length(pg_catalog.btrim(screen)) between 1 and 80),
  text text not null check (pg_catalog.length(pg_catalog.btrim(text)) between 1 and 1000),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (family_id, client_id)
);
create index if not exists app_feedback_family_idx on english.app_feedback(family_id, created_at desc);

create table if not exists english.app_feedback_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references english.app_feedback(id),
  status text not null check (status in ('new', 'in_progress', 'done', 'wont_do')),
  reply text check (reply is null or pg_catalog.length(pg_catalog.btrim(reply)) between 1 and 600),
  by_member uuid not null,
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (feedback_id, client_id)
);
create index if not exists app_feedback_events_idx on english.app_feedback_events(feedback_id, created_at desc);

-- triggers: row + truncate (bảng có learner_id dùng eng_forbid_mutation('learner_id') để purge đi qua được)
drop trigger if exists teaching_notes_forbid_mutation on english.teaching_notes;
create trigger teaching_notes_forbid_mutation before update or delete on english.teaching_notes for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists teaching_notes_forbid_truncate on english.teaching_notes;
create trigger teaching_notes_forbid_truncate before truncate on english.teaching_notes for each statement execute function english.eng_forbid_mutation();
drop trigger if exists learner_intake_forbid_mutation on english.learner_intake;
create trigger learner_intake_forbid_mutation before update or delete on english.learner_intake for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists learner_intake_forbid_truncate on english.learner_intake;
create trigger learner_intake_forbid_truncate before truncate on english.learner_intake for each statement execute function english.eng_forbid_mutation();
drop trigger if exists app_feedback_forbid_mutation on english.app_feedback;
create trigger app_feedback_forbid_mutation before update or delete on english.app_feedback for each row execute function english.eng_forbid_mutation();
drop trigger if exists app_feedback_forbid_truncate on english.app_feedback;
create trigger app_feedback_forbid_truncate before truncate on english.app_feedback for each statement execute function english.eng_forbid_mutation();
drop trigger if exists app_feedback_events_forbid_mutation on english.app_feedback_events;
create trigger app_feedback_events_forbid_mutation before update or delete on english.app_feedback_events for each row execute function english.eng_forbid_mutation();
drop trigger if exists app_feedback_events_forbid_truncate on english.app_feedback_events;
create trigger app_feedback_events_forbid_truncate before truncate on english.app_feedback_events for each statement execute function english.eng_forbid_mutation();

-- RLS
alter table english.teaching_notes enable row level security;
alter table english.learner_intake enable row level security;
alter table english.app_feedback enable row level security;
alter table english.app_feedback_events enable row level security;
revoke all on english.teaching_notes, english.learner_intake, english.app_feedback, english.app_feedback_events from public, anon, authenticated;
revoke insert, update, delete, truncate on english.teaching_notes, english.learner_intake, english.app_feedback, english.app_feedback_events from public, anon, authenticated, service_role;
grant select on english.teaching_notes, english.learner_intake, english.app_feedback, english.app_feedback_events to authenticated;
drop policy if exists teaching_notes_select on english.teaching_notes;
create policy teaching_notes_select on english.teaching_notes for select to authenticated using (english.eng_is_staff_of(learner_id));
drop policy if exists learner_intake_select on english.learner_intake;
create policy learner_intake_select on english.learner_intake for select to authenticated using (english.eng_is_staff_of(learner_id));
-- góp ý về app: người lớn (tutor/parent) cùng gia đình đọc; học sinh không
drop policy if exists app_feedback_select on english.app_feedback;
create policy app_feedback_select on english.app_feedback for select to authenticated
  using (exists (select 1 from english.members m where m.user_id = auth.uid() and m.family_id = app_feedback.family_id and m.role in ('tutor', 'parent')));
drop policy if exists app_feedback_events_select on english.app_feedback_events;
create policy app_feedback_events_select on english.app_feedback_events for select to authenticated
  using (exists (select 1 from english.app_feedback f join english.members m on m.family_id = f.family_id
                 where f.id = app_feedback_events.feedback_id and m.user_id = auth.uid() and m.role in ('tutor', 'parent')));

create or replace function english.eng_write_teaching_note(p_learner uuid, p_field text, p_text text, p_by uuid, p_client_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_member english.members%rowtype; v_text text := coalesce(p_text, ''); v_prev english.teaching_notes%rowtype; v_id uuid;
begin
  if p_learner is null or p_field is null or p_by is null or p_client_id is null then
    raise exception 'eng_write_teaching_note: learner, field, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_write_teaching_note: only a tutor of this learner writes teaching notes (tutor_only)' using errcode = '42501';
  end if;
  if p_field not in ('focus', 'explain', 'errors', 'avoid') then
    raise exception 'eng_write_teaching_note: unknown field (bad_field)' using errcode = '22023';
  end if;
  if pg_catalog.length(v_text) > 600 then
    raise exception 'eng_write_teaching_note: text over 600 characters (too_long)' using errcode = '22023';
  end if;
  select * into v_prev from english.teaching_notes t where t.learner_id = p_learner and t.client_id = p_client_id and t.field = p_field;
  if found then return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true); end if;
  insert into english.teaching_notes(learner_id, field, text, author_member, author_role, client_id)
  values (p_learner, p_field, v_text, p_by, 'tutor', p_client_id) returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'teaching_note.written', v_member.family_id, p_learner, pg_catalog.jsonb_build_object('field', p_field));
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end $$;
revoke all on function english.eng_write_teaching_note(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_write_teaching_note(uuid, text, text, uuid, text) to service_role;

create or replace function english.eng_write_intake(p_learner uuid, p_content jsonb, p_by uuid, p_client_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_member english.members%rowtype; v_prev english.learner_intake%rowtype; v_id uuid;
  v_domains text[] := array['grammar','vocab','reading','listening','writing','speaking','thinking'];
begin
  if p_learner is null or p_content is null or p_by is null or p_client_id is null then
    raise exception 'eng_write_intake: learner, content, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_write_intake: only a tutor of this learner writes the intake profile (tutor_only)' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_content) <> 'object'
     or pg_catalog.jsonb_typeof(p_content -> 'goals') is distinct from 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_content -> 'strengths', '{}'::jsonb)) <> 'object'
     or pg_catalog.jsonb_typeof(coalesce(p_content -> 'weaknesses', '{}'::jsonb)) <> 'object'
     or exists (select 1 from pg_catalog.jsonb_object_keys(coalesce(p_content -> 'strengths', '{}'::jsonb)) k where not (k = any (v_domains)))
     or exists (select 1 from pg_catalog.jsonb_object_keys(coalesce(p_content -> 'weaknesses', '{}'::jsonb)) k where not (k = any (v_domains)))
     or pg_catalog.length(p_content::text) > 6000 then
    raise exception 'eng_write_intake: content must be {goals:[], strengths:{domain}, weaknesses:{domain}, note} (bad_content)' using errcode = '22023';
  end if;
  select * into v_prev from english.learner_intake i where i.learner_id = p_learner and i.client_id = p_client_id;
  if found then return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true); end if;
  insert into english.learner_intake(learner_id, content, author_member, author_role, client_id)
  values (p_learner, p_content, p_by, 'tutor', p_client_id) returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'intake.written', v_member.family_id, p_learner, '{}'::jsonb);
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end $$;
revoke all on function english.eng_write_intake(uuid, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_write_intake(uuid, jsonb, uuid, text) to service_role;

insert into english.schema_migrations(version) values ('0025') on conflict do nothing;
