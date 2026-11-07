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

create or replace function english.eng_send_app_feedback(p_kind text, p_screen text, p_text text, p_by uuid, p_client_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_member english.members%rowtype; v_prev english.app_feedback%rowtype; v_id uuid;
begin
  if p_kind is null or p_screen is null or p_text is null or p_by is null or p_client_id is null then
    raise exception 'eng_send_app_feedback: kind, screen, text, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') then
    raise exception 'eng_send_app_feedback: only a tutor or parent sends app feedback (staff_only)' using errcode = '42501';
  end if;
  if p_kind not in ('bug', 'hard_to_use', 'suggestion', 'question') then
    raise exception 'eng_send_app_feedback: unknown kind (bad_kind)' using errcode = '22023';
  end if;
  select * into v_prev from english.app_feedback f where f.family_id = v_member.family_id and f.client_id = p_client_id;
  if found then return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true); end if;
  insert into english.app_feedback(family_id, by_member, by_role, kind, screen, text, client_id)
  values (v_member.family_id, p_by, v_member.role, p_kind, pg_catalog.btrim(p_screen), pg_catalog.btrim(p_text), p_client_id) returning id into v_id;
  insert into english.app_feedback_events(feedback_id, status, reply, by_member, client_id) values (v_id, 'new', null, p_by, p_client_id || ':new');
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end $$;
revoke all on function english.eng_send_app_feedback(text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_send_app_feedback(text, text, text, uuid, text) to service_role;

create or replace function english.eng_update_app_feedback(p_feedback uuid, p_status text, p_reply text, p_by uuid, p_client_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_member english.members%rowtype; v_fb english.app_feedback%rowtype; v_prev english.app_feedback_events%rowtype; v_id uuid;
begin
  if p_feedback is null or p_status is null or p_by is null or p_client_id is null then
    raise exception 'eng_update_app_feedback: feedback, status, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  select * into v_fb from english.app_feedback f where f.id = p_feedback;
  if v_fb.id is null then raise exception 'eng_update_app_feedback: feedback not found' using errcode = 'P0002'; end if;
  if v_member.id is null or v_member.role <> 'parent' or v_member.family_id <> v_fb.family_id then
    raise exception 'eng_update_app_feedback: only a parent of the family updates feedback (parent_only)' using errcode = '42501';
  end if;
  if p_status not in ('new', 'in_progress', 'done', 'wont_do') then
    raise exception 'eng_update_app_feedback: unknown status (bad_status)' using errcode = '22023';
  end if;
  select * into v_prev from english.app_feedback_events e where e.feedback_id = p_feedback and e.client_id = p_client_id;
  if found then return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true); end if;
  insert into english.app_feedback_events(feedback_id, status, reply, by_member, client_id)
  values (p_feedback, p_status, nullif(pg_catalog.btrim(coalesce(p_reply, '')), ''), p_by, p_client_id) returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end $$;
revoke all on function english.eng_update_app_feedback(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_update_app_feedback(uuid, text, text, uuid, text) to service_role;

-- 5. Purge: thêm teaching_notes, learner_intake (giữ nguyên mọi dòng của 0024).
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

  -- Studio B1: Đúng/Sai của người lớn và đáp án chấp nhận (trỏ tới attempts → trước attempts; đáp án chấp nhận trỏ tới nhãn câu),
  -- nhãn của từng câu, bản nháp đề (trỏ tới files và mẫu → trước files). Mẫu Studio của em: sau inquiry_instances (bên dưới).
  delete from english.item_decisions idc where idc.learner_id = p_learner_id;
  get diagnostics n_item_decisions = row_count;

  delete from english.accepted_additions aa where aa.learner_id = p_learner_id;
  get diagnostics n_accepted_additions = row_count;

  delete from english.studio_item_meta sim where sim.learner_id = p_learner_id;
  get diagnostics n_studio_item_meta = row_count;

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
                where t.id = tik.template_id and t.version = tik.template_version and t.kind = 'studio' and t.learner_id = p_learner_id);
  get diagnostics n_studio_template_keys = row_count;

  delete from english.inquiry_templates it where it.kind = 'studio' and it.learner_id = p_learner_id;
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

-- Đếm trước khi xóa: thêm các bảng Studio B1 (giữ nguyên mọi dòng của 0023).
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
      'studio_templates', (select pg_catalog.count(*) from english.inquiry_templates x where x.kind = 'studio' and x.learner_id = p_learner),
      'studio_frames', (select pg_catalog.count(*) from english.test_frames x where x.learner_id = p_learner),
      'teaching_notes', (select pg_catalog.count(*) from english.teaching_notes x where x.learner_id = p_learner),
      'learner_intake', (select pg_catalog.count(*) from english.learner_intake x where x.learner_id = p_learner),
      -- (the receipt of the purge lists these three too, and the dry run must report exactly the same keys)
      'studio_step_sources', (select pg_catalog.count(*) from english.template_step_sources x
        where exists (select 1 from english.inquiry_templates t where t.id = x.template_id and t.version = x.template_version and t.kind = 'studio' and t.learner_id = p_learner)),
      'studio_sources', (select pg_catalog.count(*) from english.sources x
        where x.id like 'ST-%' and exists (select 1 from english.inquiry_templates t where t.kind = 'studio' and t.learner_id = p_learner and x.id like ('ST-' || t.id || '-%'))),
      'studio_template_keys', (select pg_catalog.count(*) from english.template_item_keys x
        where exists (select 1 from english.inquiry_templates t where t.id = x.template_id and t.version = x.template_version and t.kind = 'studio' and t.learner_id = p_learner)),
      'login_names', (select pg_catalog.count(*) from english.login_names x where x.auth_user_id = v_user),
      'learners', 1,
      'members', (select pg_catalog.count(*) from english.members x where x.id = v_l.member_id and x.role = 'student')));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0025') on conflict do nothing;
