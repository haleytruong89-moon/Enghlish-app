-- 0036_then_now.sql
-- W4e (kế hoạch docs/superpowers/plans/2026-11-14-w4-student-desk.md, PR W4e; phụ huynh duyệt 16/11 "như đề xuất": S-5, Q2(b, c), Q16, Q17, Q18, Q19):
--   1. then_now_picks (chỉ thêm): thầy/cô của em CHỌN hai bài viết trên app của chính em ("ngày ấy" nộp trước "bây giờ") + một lời nhắn ≤ 200 ký tự
--      (không chữ dạng điểm); dòng mới nhất của em thắng; status 'hidden' = ẩn thẻ. Học sinh không SELECT bảng (chỉ qua eng_my_then_now); phụ huynh xem.
--   2. Ghi: eng_pick_then_now (service_role sau requireAccess "teaching:write"; CHỈ thầy/cô của em, phụ huynh bị 42501). Idempotent theo client_id.
--      Hai lần nộp phải là của ĐÚNG em, bước ACT-WRITE (không phải bài sửa), nộp trên app / dán / người lớn gõ lại bài giấy (manual_import), có chữ;
--      KHÔNG phải bài ghi trong buổi (tutor_live) hay bài nạp (imported); "ngày ấy" phải trước "bây giờ" ít nhất một ngày (giờ Việt Nam).
--   3. Đọc của người lớn: eng_then_now_candidates (service_role): các bài viết của em để chọn + dòng chọn hiện hành.
--   4. Đọc của con (authenticated, nhận diện bằng auth.uid(), chỉ chữ + tên + ngày):
--        eng_my_levels()   tên cấp CEFR đã được thầy/cô xác nhận theo mảng (mảng có thang CEFR; KHÔNG mảng Tư duy; KHÔNG cấp giả định; không số, không bậc 1–4);
--        eng_my_cando()    "những điều mình đã làm được": kỹ năng / mục kiến thức ở mức 3–4 mà dòng quyết định MỚI NHẤT là thầy/cô XÁC NHẬN (bị hạ → không trả);
--        eng_my_then_now() cặp bài viết đang hiện + lời nhắn (ẩn / chưa có → null).
--      Không bao giờ trả: điểm, mức / bậc dạng số, ⚑, đề xuất, bằng chứng, dữ liệu của em kia.
--   5. eng_purge_learner / eng_purge_preview: chép NGUYÊN thân 0035 + bảng then_now_picks (xóa trước attempts).
-- Idempotent; chỉ thêm. Không đụng schema public. Cần 0035 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations s where s.version = '0035') then
    raise exception '0036 cần 0035 đã áp (missing_0035)' using errcode = 'P0001';
  end if;
end
$guard$;

-- 1. Sổ "Ngày ấy – bây giờ" ---------------------------------------------------------------------------------------------------------
create table if not exists english.then_now_picks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  then_attempt_id uuid not null references english.attempts(id),
  now_attempt_id uuid not null references english.attempts(id),
  note text check (note is null or (pg_catalog.length(pg_catalog.btrim(note)) between 1 and 200 and not english.eng_has_score_words(note))),
  status text not null check (status in ('shown', 'hidden')),
  by_member uuid not null,                       -- english.members.id, no FK (like weekly_goals.by_member)
  by_role text not null check (by_role = 'tutor'),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint then_now_picks_two_pieces check (then_attempt_id <> now_attempt_id)
);
create index if not exists then_now_picks_learner_idx on english.then_now_picks(learner_id, created_at desc);

-- 2. Chỉ thêm (đầu 0004) + RLS: người lớn của em đọc; học sinh không SELECT; không ai ghi trực tiếp -------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['then_now_picks'] loop
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

-- 3. Chữ gốc của một lần nộp (lần ghi đầu của chữ) — nội bộ -------------------------------------------------------------------------
create or replace function english.eng_attempt_text(p_attempt uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select av.content ->> 'text'
  from english.artifact_versions av
  where av.attempt_id = p_attempt and av.kind = 'text'
  order by av.version
  limit 1
$$;
revoke execute on function english.eng_attempt_text(uuid) from public, anon, authenticated, service_role;

-- Một lần nộp "chọn được": của đúng em, bước ACT-WRITE (không phải bài sửa), nộp trên app / dán / người lớn gõ lại bài giấy, có chữ. Không phải bài ghi trong buổi
-- (tutor_live) hay bài nạp (imported). Trả lúc nộp, hoặc null nếu không chọn được.
create or replace function english.eng_pickable_write(p_learner uuid, p_attempt uuid) returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select t.submitted_at
  from english.attempts t
  join english.activity_instances a on a.id = t.activity_instance_id
  where t.id = p_attempt and t.learner_id = p_learner
    and a.activity_type = 'ACT-WRITE' and a.mode <> 'REVISION'
    and t.provenance in ('in_app', 'pasted', 'manual_import')
    and pg_catalog.btrim(coalesce(english.eng_attempt_text(t.id), '')) <> ''
$$;
revoke execute on function english.eng_pickable_write(uuid, uuid) from public, anon, authenticated, service_role;

-- 4. Thầy/cô của em chọn cặp bài (hoặc ẩn thẻ) ---------------------------------------------------------------------------------------
create or replace function english.eng_pick_then_now(p_learner uuid, p_then uuid, p_now uuid, p_note text, p_status text, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
  v_l english.learners%rowtype;
  v_note text;
  v_old english.then_now_picks%rowtype;
  v_then_at timestamptz;
  v_now_at timestamptz;
  v_id uuid;
begin
  if p_learner is null or p_then is null or p_now is null or p_status is null or p_by is null or p_client_id is null then
    raise exception 'eng_pick_then_now: learner, both pieces, status, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if not found or v_m.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_pick_then_now: only the tutor of this learner picks the pieces (tutor_only)' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_client_id)) not between 8 and 100 then
    raise exception 'eng_pick_then_now: client_id must be 8..100 characters (bad_client_id)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for no key update;   -- one writer per child
  v_note := nullif(pg_catalog.btrim(p_note), '');

  select * into v_old from english.then_now_picks k where k.learner_id = p_learner and k.client_id = p_client_id;
  if found then
    if v_old.then_attempt_id <> p_then or v_old.now_attempt_id <> p_now or v_old.status <> p_status or v_old.note is distinct from v_note then
      raise exception 'eng_pick_then_now: client_id was already used for another pick (client_id_reused)' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_old.id, 'replayed', true);
  end if;

  if p_status not in ('shown', 'hidden') then
    raise exception 'eng_pick_then_now: the status is shown or hidden (bad_status)' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 200 then
    raise exception 'eng_pick_then_now: the note is at most 200 characters (too_long)' using errcode = '22023';
  end if;
  if v_note is not null and english.eng_has_score_words(v_note) then
    raise exception 'eng_pick_then_now: the note must not look like a score (score_words)' using errcode = '22023';
  end if;

  v_then_at := english.eng_pickable_write(p_learner, p_then);
  v_now_at := english.eng_pickable_write(p_learner, p_now);
  if p_then = p_now or v_then_at is null or v_now_at is null or english.eng_vn_day(v_then_at) >= english.eng_vn_day(v_now_at) then
    raise exception 'eng_pick_then_now: two own pieces of writing on the app, the first on an earlier day (bad_pick)' using errcode = '22023';
  end if;

  insert into english.then_now_picks(learner_id, then_attempt_id, now_attempt_id, note, status, by_member, by_role, client_id)
  values (p_learner, p_then, p_now, v_note, p_status, p_by, 'tutor', p_client_id)
  returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'then_now.picked', v_l.family_id, p_learner, pg_catalog.jsonb_build_object('pick', v_id, 'status', p_status));   -- no text
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;
revoke execute on function english.eng_pick_then_now(uuid, uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_pick_then_now(uuid, uuid, uuid, text, text, uuid, text) to service_role;

-- 5. Người lớn đọc: các bài viết để chọn (60 bài gần nhất) + dòng chọn hiện hành (route gọi SAU requireAccess) ------------------------------
create or replace function english.eng_then_now_candidates(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_learner is null then
    raise exception 'eng_then_now_candidates: learner id is required' using errcode = '22004';
  end if;
  if not exists (select 1 from english.learners l where l.id = p_learner) then
    raise exception 'eng_then_now_candidates: learner not found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object(
    'candidates', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', x.id, 'at', x.submitted_at, 'title', x.title, 'preview', pg_catalog.left(x.txt, 300))
                                  order by x.submitted_at desc, x.id)
      from (
        select t.id, t.submitted_at, i.snapshot -> 'template' ->> 'title_vi' as title, english.eng_attempt_text(t.id) as txt
        from english.attempts t
        join english.activity_instances a on a.id = t.activity_instance_id
        join english.inquiry_instances i on i.id = a.inquiry_instance_id
        where english.eng_pickable_write(p_learner, t.id) is not null
          and t.learner_id = p_learner
        order by t.submitted_at desc, t.id
        limit 60) x), '[]'::jsonb),
    'current', (
      select pg_catalog.jsonb_build_object('id', k.id, 'then_attempt', k.then_attempt_id, 'now_attempt', k.now_attempt_id, 'note', k.note, 'status', k.status, 'created_at', k.created_at)
      from english.then_now_picks k where k.learner_id = p_learner order by k.created_at desc, k.id desc limit 1));
end
$$;
revoke execute on function english.eng_then_now_candidates(uuid) from public, anon, authenticated;
grant execute on function english.eng_then_now_candidates(uuid) to service_role;

-- 6. CON đọc: tên cấp đã xác nhận theo mảng CEFR ---------------------------------------------------------------------------------------
-- Mảng chọn theo THANG (scale = 'cefr'), không theo tên: mảng Tư duy (thang 1–4, giống điểm) không bao giờ có mặt. level = null khi thầy/cô chưa xác nhận
-- (cấp giả định của track KHÔNG bao giờ được trả). Chỉ chữ + ngày xác nhận.
create or replace function english.eng_my_levels() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_learner uuid;
  v_map text;
begin
  select l.id into v_learner
  from english.members m join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if v_learner is null then return null; end if;
  v_map := english.eng_current_skill_map();
  return pg_catalog.jsonb_build_object('domains', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'key', dm.key, 'name', dm.name_vi, 'scale', dm.scale,
        'level', case when lt.to_level ~ '^(A1|A2|B1|B2|C1|C2)\+?$' then lt.to_level else null end,
        'on', case when lt.to_level ~ '^(A1|A2|B1|B2|C1|C2)\+?$' then lt.decided_at else null end)
      order by dm.ord)
    from english.skill_domains dm
    left join lateral (
      select d.to_level, d.decided_at from english.level_decisions d
      where d.learner_id = v_learner and d.domain_key = dm.key
      order by d.decided_at desc, d.id desc limit 1) lt on true
    where dm.map_id = v_map and dm.scale = 'cefr'), '[]'::jsonb));
end
$$;
revoke execute on function english.eng_my_levels() from public, anon, service_role;
grant execute on function english.eng_my_levels() to authenticated;

-- 7. CON đọc: những điều đã làm được -----------------------------------------------------------------------------------------------------
-- Kỹ năng đang ở bậc 3–4 mà dòng quyết định bậc MỚI NHẤT là thầy/cô XÁC NHẬN (AUTO bậc 1–2, sửa tay, bị hạ → không trả), và mục kiến thức
-- (điểm) ở mức 3–4 theo cùng luật. Chỉ tên + lúc xác nhận; "code" chỉ là mã kỹ năng để máy tìm tên cho học sinh (không hiện ra màn).
create or replace function english.eng_my_cando() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_learner uuid;
  v_track text;
  v_family uuid;
begin
  select l.id, l.track_id, l.family_id into v_learner, v_track, v_family
  from english.members m join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if v_learner is null then return null; end if;
  return pg_catalog.jsonb_build_object(
    'now', pg_catalog.now(),
    'items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', z.code, 'name', z.name, 'at', z.at) order by z.at desc, z.name)
      from (
        select * from (
          select cs.target_key as code,
                 (select t.title_vi from english.targets t where t.id = cs.target_key and t.track_id = v_track order by t.descriptor_version desc limit 1) as name,
                 md.created_at as at
          from english.competency_state cs
          join english.mastery_decisions md on md.id = cs.state_decision_id
          where cs.learner_id = v_learner and cs.state in ('INDEPENDENT', 'TRANSFERABLE')
            and md.kind = 'CONFIRMED' and md.to_state = cs.state
          union all
          select null::text,
                 (select et.label_vi from english.error_tags et
                   where et.track_id = v_track and et.key = ps.tag_key and (et.family_id is null or et.family_id = v_family) limit 1),
                 pd.created_at
          from english.point_state ps
          join english.point_decisions pd on pd.id = ps.state_decision_id
          where ps.learner_id = v_learner and ps.state in ('INDEPENDENT', 'TRANSFERABLE')
            and pd.kind = 'CONFIRMED' and pd.to_state = ps.state
        ) u
        where u.name is not null
        order by u.at desc, u.name
        limit 60) z), '[]'::jsonb));
end
$$;
revoke execute on function english.eng_my_cando() from public, anon, service_role;
grant execute on function english.eng_my_cando() to authenticated;

-- 8. CON đọc: cặp bài "Ngày ấy – bây giờ" đang hiện ---------------------------------------------------------------------------------------
create or replace function english.eng_my_then_now() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_learner uuid;
  v_k english.then_now_picks%rowtype;
  v_then_at timestamptz;
  v_now_at timestamptz;
begin
  select l.id into v_learner
  from english.members m join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if v_learner is null then return null; end if;
  select * into v_k from english.then_now_picks k where k.learner_id = v_learner order by k.created_at desc, k.id desc limit 1;
  if not found or v_k.status <> 'shown' then return null; end if;
  v_then_at := english.eng_pickable_write(v_learner, v_k.then_attempt_id);
  v_now_at := english.eng_pickable_write(v_learner, v_k.now_attempt_id);
  if v_then_at is null or v_now_at is null then return null; end if;
  return pg_catalog.jsonb_build_object(
    'then', pg_catalog.jsonb_build_object('on', v_then_at, 'text', english.eng_attempt_text(v_k.then_attempt_id)),
    'now', pg_catalog.jsonb_build_object('on', v_now_at, 'text', english.eng_attempt_text(v_k.now_attempt_id)),
    'note', v_k.note);
end
$$;
revoke execute on function english.eng_my_then_now() from public, anon, service_role;
grant execute on function english.eng_my_then_now() to authenticated;

-- 9. Xóa dữ liệu một em: = bản 0035 + then_now_picks (xóa trước attempts) ----------------------------------------------------------------
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
  n_submission_feedback int := 0;
  n_item_retries int := 0;
  n_retry_seen int := 0;
  n_item_reveals int := 0;
  n_work_test_marks int := 0;
  n_weekly_goals int := 0;
  n_submission_work_weeks int := 0;
  n_then_now_picks int := 0;
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

  -- 0034: lần thử lại của con (trỏ tới attempts) và cờ "Bài kiểm tra" (trỏ tới activity_instances / assignments): xóa trước các bảng đó.
  delete from english.item_reveals ivl where ivl.learner_id = p_learner_id;
  get diagnostics n_item_reveals = row_count;

  delete from english.retry_seen rs where rs.learner_id = p_learner_id;
  get diagnostics n_retry_seen = row_count;

  delete from english.item_retries ir where ir.learner_id = p_learner_id;
  get diagnostics n_item_retries = row_count;

  delete from english.work_test_marks wtm where wtm.learner_id = p_learner_id;
  get diagnostics n_work_test_marks = row_count;

  -- 0035: mục tiêu tuần (chỉ trỏ tới learners và tới chính nó): xóa cả em một lượt.
  delete from english.weekly_goals wg where wg.learner_id = p_learner_id;
  get diagnostics n_weekly_goals = row_count;

  -- 0036: "Ngày ấy – bây giờ" trỏ tới attempts → trước attempts.
  delete from english.then_now_picks tnp where tnp.learner_id = p_learner_id;
  get diagnostics n_then_now_picks = row_count;

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
  -- 0033: góp ý cho bài nộp trỏ tới submissions và assignments (tự trỏ supersedes_id: một câu lệnh) → TRƯỚC submissions.
  delete from english.submission_feedback sfb where sfb.learner_id = p_learner_id;
  get diagnostics n_submission_feedback = row_count;

  delete from english.submission_work_weeks sww where sww.learner_id = p_learner_id;   -- 0035: trỏ tới submissions → trước submissions
  get diagnostics n_submission_work_weeks = row_count;
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
    ) || pg_catalog.jsonb_build_object(
      'submission_feedback', n_submission_feedback
    ) || pg_catalog.jsonb_build_object(
      'item_retries', n_item_retries,
      'retry_seen', n_retry_seen,
      'item_reveals', n_item_reveals,
      'work_test_marks', n_work_test_marks
    ) || pg_catalog.jsonb_build_object(
      'weekly_goals', n_weekly_goals,
      'submission_work_weeks', n_submission_work_weeks
    ) || pg_catalog.jsonb_build_object(
      'then_now_picks', n_then_now_picks
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

-- Đếm trước khi xóa = bản 0035 + then_now_picks (cùng khóa với biên nhận).
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
      'roadmap_main_curriculum', (select pg_catalog.count(*) from english.roadmap_main_curriculum x where x.learner_id = p_learner))
    -- 0033
    || pg_catalog.jsonb_build_object(
      'submission_feedback', (select pg_catalog.count(*) from english.submission_feedback x where x.learner_id = p_learner))
    -- 0034
    || pg_catalog.jsonb_build_object(
      'item_retries', (select pg_catalog.count(*) from english.item_retries x where x.learner_id = p_learner),
      'retry_seen', (select pg_catalog.count(*) from english.retry_seen x where x.learner_id = p_learner),
      'item_reveals', (select pg_catalog.count(*) from english.item_reveals x where x.learner_id = p_learner),
      'work_test_marks', (select pg_catalog.count(*) from english.work_test_marks x where x.learner_id = p_learner))
    -- 0035
    || pg_catalog.jsonb_build_object(
      'weekly_goals', (select pg_catalog.count(*) from english.weekly_goals x where x.learner_id = p_learner),
      'submission_work_weeks', (select pg_catalog.count(*) from english.submission_work_weeks x where x.learner_id = p_learner))
    -- 0036
    || pg_catalog.jsonb_build_object(
      'then_now_picks', (select pg_catalog.count(*) from english.then_now_picks x where x.learner_id = p_learner)));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0036') on conflict do nothing;
