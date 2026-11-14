-- 0030_session_billing.sql
-- UX vòng 3 · PR 3B (kế hoạch docs/superpowers/plans/2026-11-14-ux-round3.md, Phân tích 4–5, U15–U22):
--   1. session_absences (chỉ thêm): buổi nghỉ của một em — ngày, bên báo nghỉ, có tính phí không. Ghi nhầm → dòng "bỏ" (cancels_id).
--   2. session_marks (chỉ thêm): loại của một ghi chú buổi học — regular | makeup (có thể trỏ buổi nghỉ được bù) | not_counted (lý do).
--      Dấu áp cho CẢ CHUỖI sửa (lesson_notes.supersedes_id); dấu mới nhất thắng — dẫn xuất ở lib/sessions/count.ts, không lưu.
--   3. Hàm ghi (service_role sau requireAccess; tự kiểm lại người thao tác = thầy/cô của em hoặc phụ huynh của gia đình;
--      idempotent theo client_id; khác nội dung → 23505).
--   4. eng_write_lesson_note_v4 = v3 (0026, không đổi) + loại buổi, cùng giao dịch.
--   5. RLS: thầy/cô của em + phụ huynh đọc (eng_is_staff_of); học sinh không; không ai ghi trực tiếp (kể cả service_role).
--   6. eng_purge_learner / eng_purge_preview: chép NGUYÊN thân 0029 + 2 bảng (marks rồi absences, trước lesson_notes).
-- KHÔNG có chốt tháng (phụ huynh quyết 14/11). Không có số tiền. Idempotent; chỉ thêm. Không đụng schema public.
-- Cần 0026 + 0029 đã áp.

-- 1. Bảng ------------------------------------------------------------------------------------------------------------------
create table if not exists english.session_absences (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  absent_on date not null,
  requested_by text not null check (requested_by in ('student', 'tutor', 'other')),
  billable boolean not null,
  note text check (note is null or pg_catalog.length(note) between 1 and 300),
  cancels_id uuid references english.session_absences(id),
  by_member uuid not null,                       -- english.members.id, no FK (like lesson_notes.tutor_member_id)
  by_role text not null check (by_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  check (cancels_id is null or note is not null)          -- a cancel row carries its reason in note
);
create unique index if not exists session_absences_cancel_once on english.session_absences(cancels_id) where cancels_id is not null;
create index if not exists session_absences_learner_idx on english.session_absences(learner_id, absent_on);

create table if not exists english.session_marks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  lesson_note_id uuid not null references english.lesson_notes(id),
  kind text not null check (kind in ('regular', 'makeup', 'not_counted')),
  makeup_for uuid references english.session_absences(id),
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 5 and 300),
  by_member uuid not null,
  by_role text not null check (by_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 110),  -- v4 uses '<note client_id>:kind'
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  check (makeup_for is null or kind = 'makeup'),
  check (kind <> 'not_counted' or reason is not null)
);
create index if not exists session_marks_note_idx on english.session_marks(lesson_note_id);
create index if not exists session_marks_learner_idx on english.session_marks(learner_id);

-- 2. Chỉ thêm (đầu 0004) + RLS ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['session_absences', 'session_marks'] loop
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

-- 3. Người thao tác: thầy/cô còn quan hệ hoặc phụ huynh của gia đình (eng_actor_may_manage, 0007) -------------------------------
create or replace function english.eng_session_actor(p_by uuid, p_learner uuid, p_fn text) returns english.members
language plpgsql stable security definer set search_path = ''
as $$
declare v_m english.members%rowtype;
begin
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception '%: this member may not record sessions of this learner (staff_only)', p_fn using errcode = '42501';
  end if;
  return v_m;
end
$$;
revoke execute on function english.eng_session_actor(uuid, uuid, text) from public, anon, authenticated, service_role;

-- 4a. Ghi buổi nghỉ ----------------------------------------------------------------------------------------------------------
create or replace function english.eng_record_absence(
  p_learner uuid, p_absent_on date, p_requested_by text, p_billable boolean, p_note text, p_by uuid, p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_prev english.session_absences%rowtype;
  v_id uuid;
begin
  if p_learner is null or p_absent_on is null or p_requested_by is null or p_billable is null or p_by is null then
    raise exception 'eng_record_absence: learner, date, party, billable and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_record_absence: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then raise exception 'eng_record_absence: learner not found' using errcode = 'P0002'; end if;
  v_m := english.eng_session_actor(p_by, p_learner, 'eng_record_absence');          -- permissions first (2B lesson)
  if p_requested_by not in ('student', 'tutor', 'other') then
    raise exception 'eng_record_absence: unknown party (bad_party)' using errcode = '22023';
  end if;
  if p_absent_on < english.eng_today_vn() - 120 or p_absent_on > english.eng_today_vn() + 60 then
    raise exception 'eng_record_absence: the date must be within 120 days back and 60 days ahead (bad_date)' using errcode = '23514';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 300 then
    raise exception 'eng_record_absence: the note is too long (too_long)' using errcode = '22023';
  end if;
  select * into v_prev from english.session_absences a where a.learner_id = p_learner and a.client_id = p_client_id;
  if found then
    if v_prev.cancels_id is not null or v_prev.absent_on <> p_absent_on or v_prev.requested_by <> p_requested_by
       or v_prev.billable <> p_billable or v_prev.note is distinct from v_note then
      raise exception 'eng_record_absence: client_id was already used for another record (client_id_reused)' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true);
  end if;
  insert into english.session_absences(learner_id, absent_on, requested_by, billable, note, by_member, by_role, client_id)
  values (p_learner, p_absent_on, p_requested_by, p_billable, v_note, p_by, v_m.role, p_client_id)
  returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'session_absence.recorded', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('absence', v_id, 'billable', p_billable, 'requested_by', p_requested_by));   -- no note text
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- 4b. Bỏ ghi nghỉ (ghi nhầm): dòng mới chép ngày / bên / tính phí, note = lý do (5..300) --------------------------------------
create or replace function english.eng_cancel_absence(p_absence uuid, p_reason text, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_a english.session_absences%rowtype;
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_prev english.session_absences%rowtype;
  v_id uuid;
begin
  if p_absence is null or p_by is null then
    raise exception 'eng_cancel_absence: absence and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_cancel_absence: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select * into v_a from english.session_absences a where a.id = p_absence;
  if not found then raise exception 'eng_cancel_absence: absence not found' using errcode = 'P0002'; end if;
  select * into v_l from english.learners l where l.id = v_a.learner_id;
  v_m := english.eng_session_actor(p_by, v_a.learner_id, 'eng_cancel_absence');
  if v_a.cancels_id is not null then
    raise exception 'eng_cancel_absence: a cancel row cannot be cancelled (bad_absence)' using errcode = '22023';
  end if;
  if v_reason is null or pg_catalog.length(v_reason) < 5 or pg_catalog.length(v_reason) > 300 then
    raise exception 'eng_cancel_absence: a reason of 5..300 characters is required (reason_required)' using errcode = '23514';
  end if;
  select * into v_prev from english.session_absences a where a.learner_id = v_a.learner_id and a.client_id = p_client_id;
  if found then
    if v_prev.cancels_id is distinct from p_absence or v_prev.note <> v_reason then
      raise exception 'eng_cancel_absence: client_id was already used for another record (client_id_reused)' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true);
  end if;
  if exists (select 1 from english.session_absences a where a.cancels_id = p_absence) then
    raise exception 'eng_cancel_absence: already cancelled (already_cancelled)' using errcode = '23505';
  end if;
  insert into english.session_absences(learner_id, absent_on, requested_by, billable, note, cancels_id, by_member, by_role, client_id)
  values (v_a.learner_id, v_a.absent_on, v_a.requested_by, v_a.billable, v_reason, p_absence, p_by, v_m.role, p_client_id)
  returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'session_absence.cancelled', v_l.family_id, v_a.learner_id, pg_catalog.jsonb_build_object('absence', p_absence, 'row', v_id));
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- 4c. Đánh dấu loại buổi của một ghi chú HIỆN HÀNH -------------------------------------------------------------------------
create or replace function english.eng_mark_session(
  p_note uuid, p_kind text, p_makeup_for uuid, p_reason text, p_by uuid, p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n english.lesson_notes%rowtype;
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_prev english.session_marks%rowtype;
  v_id uuid;
begin
  if p_note is null or p_kind is null or p_by is null then
    raise exception 'eng_mark_session: note, kind and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 110 then
    raise exception 'eng_mark_session: client_id must be 8..110 characters' using errcode = '22023';
  end if;
  select * into v_n from english.lesson_notes n where n.id = p_note;
  if not found then raise exception 'eng_mark_session: lesson note not found' using errcode = 'P0002'; end if;
  select * into v_l from english.learners l where l.id = v_n.learner_id;
  v_m := english.eng_session_actor(p_by, v_n.learner_id, 'eng_mark_session');
  if p_kind not in ('regular', 'makeup', 'not_counted') then
    raise exception 'eng_mark_session: unknown kind (bad_kind)' using errcode = '22023';
  end if;
  if p_kind = 'not_counted' and (v_reason is null or pg_catalog.length(v_reason) < 5) then
    raise exception 'eng_mark_session: a reason of at least 5 characters is required (reason_required)' using errcode = '23514';
  end if;
  if v_reason is not null and pg_catalog.length(v_reason) > 300 then
    raise exception 'eng_mark_session: the reason is too long (too_long)' using errcode = '22023';
  end if;
  if p_makeup_for is not null and (p_kind <> 'makeup' or not exists (
       select 1 from english.session_absences a
       where a.id = p_makeup_for and a.learner_id = v_n.learner_id and a.cancels_id is null
         and not exists (select 1 from english.session_absences c where c.cancels_id = a.id))) then
    raise exception 'eng_mark_session: the absence is not a live absence of this learner (bad_absence)' using errcode = '23514';
  end if;
  select * into v_prev from english.session_marks s where s.learner_id = v_n.learner_id and s.client_id = p_client_id;
  if found then
    if v_prev.lesson_note_id <> p_note or v_prev.kind <> p_kind or v_prev.makeup_for is distinct from p_makeup_for
       or v_prev.reason is distinct from v_reason then
      raise exception 'eng_mark_session: client_id was already used for another mark (client_id_reused)' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true);
  end if;
  if exists (select 1 from english.lesson_notes n2 where n2.supersedes_id = p_note) then
    raise exception 'eng_mark_session: mark the newest version of the note (not_current)' using errcode = '23514';
  end if;
  insert into english.session_marks(learner_id, lesson_note_id, kind, makeup_for, reason, by_member, by_role, client_id)
  values (v_n.learner_id, p_note, p_kind, p_makeup_for, v_reason, p_by, v_m.role, p_client_id)
  returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'session.marked', v_l.family_id, v_n.learner_id, pg_catalog.jsonb_build_object('note', p_note, 'kind', p_kind));
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- 5. Ghi buổi v4 = v3 (không đổi) + loại buổi. Chỉ cho bản MỚI (p_supersedes null); đổi loại của ghi chú đã có = eng_mark_session.
create or replace function english.eng_write_lesson_note_v4(
  p_learner uuid, p_session_date date, p_studied text, p_weak_tags text[], p_message text, p_note_for_parent text,
  p_rechecks jsonb, p_supersedes uuid, p_by uuid, p_client_id text,
  p_practised_target_ids text[] default '{}', p_taught_units jsonb default '[]'::jsonb,
  p_session_kind text default 'regular', p_makeup_for uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_r jsonb;
  v_note uuid;
  v_mark english.session_marks%rowtype;
begin
  perform english.eng_session_actor(p_by, p_learner, 'eng_write_lesson_note_v4');     -- permissions first
  if p_session_kind is null or p_session_kind not in ('regular', 'makeup') then
    raise exception 'eng_write_lesson_note_v4: kind must be regular or makeup (bad_kind)' using errcode = '22023';
  end if;
  if p_supersedes is not null and (p_session_kind <> 'regular' or p_makeup_for is not null) then
    raise exception 'eng_write_lesson_note_v4: change the kind of an existing note with eng_mark_session (kind_on_edit)' using errcode = '22023';
  end if;
  if p_makeup_for is not null and p_session_kind <> 'makeup' then
    raise exception 'eng_write_lesson_note_v4: makeup_for needs kind makeup (bad_absence)' using errcode = '22023';
  end if;
  -- v3 checks the actor again, the units, everything of v2, and the client_id replay of the note itself.
  v_r := english.eng_write_lesson_note_v3(p_learner, p_session_date, p_studied, p_weak_tags, p_message, p_note_for_parent,
                                          p_rechecks, p_supersedes, p_by, p_client_id, p_practised_target_ids, p_taught_units);
  v_note := (v_r ->> 'id')::uuid;
  select * into v_mark from english.session_marks s where s.learner_id = p_learner and s.client_id = p_client_id || ':kind';
  if coalesce((v_r ->> 'replayed')::boolean, false) then
    if (p_session_kind = 'regular' and v_mark.id is not null)
       or (p_session_kind = 'makeup' and (v_mark.id is null or v_mark.makeup_for is distinct from p_makeup_for)) then
      raise exception 'eng_write_lesson_note_v4: client_id was already used for a note of another kind (client_id_reused)' using errcode = '23505';
    end if;
    return v_r;
  end if;
  if p_session_kind = 'makeup' then
    -- eng_mark_session re-checks the actor and the absence (a bad absence rolls the whole note back: one transaction).
    perform english.eng_mark_session(v_note, 'makeup', p_makeup_for, null, p_by, p_client_id || ':kind');
  end if;
  return v_r || pg_catalog.jsonb_build_object('kind', p_session_kind);
end
$$;

-- 6. Quyền thực thi ----------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'eng_record_absence(uuid, date, text, boolean, text, uuid, text)',
    'eng_cancel_absence(uuid, text, uuid, text)',
    'eng_mark_session(uuid, text, uuid, text, uuid, text)',
    'eng_write_lesson_note_v4(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text, text[], jsonb, text, uuid)'
  ] loop
    execute 'revoke execute on function english.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function english.' || f || ' to service_role';
  end loop;
end
$$;

-- 7. Xóa dữ liệu một em: = bản 0029 + 2 bảng (session_marks trước session_absences, cả hai trước lesson_notes).
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

-- Đếm trước khi xóa = bản 0029 + 2 bảng (cùng khóa với biên nhận).
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
      'session_absences', (select pg_catalog.count(*) from english.session_absences x where x.learner_id = p_learner)));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0030') on conflict do nothing;
