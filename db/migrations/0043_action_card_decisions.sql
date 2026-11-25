-- 0043_action_card_decisions.sql
-- "Việc nên làm" (26/11, PR-B): thầy/cô bấm "Đã làm" hoặc "Bỏ qua" (có lý do) trên một thẻ; phụ huynh thấy thẻ nào đã được xử lý, khi nào.
-- Kế hoạch docs/superpowers/plans/2026-11-26-ket-qua-viec-nen-lam.md (phần PR-B).
--   1. action_card_decisions (chỉ thêm): một dòng mỗi lần bấm. Thẻ tự sinh từ kết quả bài (lib/results/actions.ts, luật cố định); bảng chỉ ghi
--      khóa thẻ + loại + quyết định. Thẻ hiện lại khi có bài mới của cùng nội dung sau lần bấm (tầng app so ngày).
--   2. eng_decide_action_card: thầy/cô của em hoặc phụ huynh (eng_actor_may_manage); "Bỏ qua" cần lý do 3–300 ký tự; gửi lại cùng client_id
--      = trả dòng cũ. Thẻ "chấm bài" không bấm được (tự hết khi chấm xong).
--   3. eng_purge_learner / eng_purge_preview = thân 0041 + bảng mới.
-- Idempotent; chỉ thêm. Không đụng schema public. Cần 0042 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations s where s.version = '0042') then
    raise exception '0043 cần 0042 đã áp (missing_0042)' using errcode = 'P0001';
  end if;
end
$guard$;

-- 1. Bảng --------------------------------------------------------------------------------------------------------------------------
create table if not exists english.action_card_decisions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  card_key text not null check (pg_catalog.length(pg_catalog.btrim(card_key)) between 1 and 200),
  kind text not null check (kind in ('fix_together', 'unit_review', 'practise', 'praise')),
  -- Câu tiêu đề của thẻ lúc bấm (để phụ huynh đọc lại đúng việc đó, kể cả khi thẻ không còn được sinh ra).
  label text not null check (pg_catalog.length(pg_catalog.btrim(label)) between 1 and 300),
  -- Lúc nộp bài mới nhất đứng sau thẻ (để biết thầy/cô xử lý sau bao lâu; có bài mới sau lúc bấm thì thẻ hiện lại).
  evidence_at timestamptz,
  decision text not null check (decision in ('done', 'skipped')),
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 3 and 300),
  -- id của english.members, KHÔNG có khóa ngoại (xóa tài khoản không làm hỏng lịch sử).
  by_member uuid not null,
  by_role text not null check (by_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint action_card_decisions_reason check (decision <> 'skipped' or reason is not null)
);
create index if not exists action_card_decisions_learner_idx on english.action_card_decisions(learner_id, card_key, at desc);

-- Chỉ thêm (đầu 0004) + RLS: người lớn của em đọc; học sinh không SELECT; không ai ghi trực tiếp (kể cả service_role).
do $$
declare
  t text := 'action_card_decisions';
begin
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
end
$$;

-- 2. Ghi một lần bấm ------------------------------------------------------------------------------------------------------------------
create or replace function english.eng_decide_action_card(
  p_learner uuid,
  p_card_key text,
  p_kind text,
  p_label text,
  p_evidence_at timestamptz,
  p_decision text,
  p_reason text,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_member english.members%rowtype;
  v_old english.action_card_decisions%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_id uuid;
  v_at timestamptz;
begin
  if p_learner is null or p_card_key is null or p_kind is null or p_label is null or p_decision is null or p_by is null or p_client_id is null then
    raise exception 'eng_decide_action_card: learner, card, kind, label, decision, actor and client id are required' using errcode = '22004';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_label)) not between 1 and 300 then
    raise exception 'eng_decide_action_card: the card label is 1 to 300 characters (bad_label)' using errcode = '22023';
  end if;
  if p_evidence_at is not null and p_evidence_at > clock_timestamp() + interval '1 day' then
    raise exception 'eng_decide_action_card: the evidence time is in the future (bad_evidence)' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_decide_action_card: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  perform 1 from english.learners l where l.id = p_learner for no key update;   -- one writer per child (a double tap replays, never collides)
  if not found then
    raise exception 'eng_decide_action_card: learner not found (not_found)' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_decide_action_card: this member may not act for this learner' using errcode = '42501';
  end if;
  if p_kind not in ('fix_together', 'unit_review', 'practise', 'praise') then
    raise exception 'eng_decide_action_card: this card cannot be marked (bad_kind)' using errcode = '22023';
  end if;
  if p_decision not in ('done', 'skipped') then
    raise exception 'eng_decide_action_card: unknown decision (bad_decision)' using errcode = '22023';
  end if;
  if p_decision = 'skipped' and (v_reason is null or pg_catalog.length(v_reason) < 3) then
    raise exception 'eng_decide_action_card: skipping needs a reason of at least 3 characters (reason_required)' using errcode = '22023';
  end if;
  if v_reason is not null and pg_catalog.length(v_reason) > 300 then
    raise exception 'eng_decide_action_card: the reason is at most 300 characters (reason_too_long)' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_card_key)) not between 1 and 200 then
    raise exception 'eng_decide_action_card: bad card key (bad_card)' using errcode = '22023';
  end if;

  select * into v_old from english.action_card_decisions d where d.learner_id = p_learner and d.client_id = pg_catalog.btrim(p_client_id);
  if found then
    if v_old.card_key <> pg_catalog.btrim(p_card_key) or v_old.kind <> p_kind or v_old.decision <> p_decision or v_old.reason is distinct from v_reason then
      raise exception 'eng_decide_action_card: client_id was already used for another mark (client_id_reused)' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_old.id, 'at', v_old.at, 'replayed', true);
  end if;

  insert into english.action_card_decisions(learner_id, card_key, kind, label, evidence_at, decision, reason, by_member, by_role, client_id)
  values (p_learner, pg_catalog.btrim(p_card_key), p_kind, pg_catalog.btrim(p_label), p_evidence_at, p_decision, v_reason, p_by, v_member.role, pg_catalog.btrim(p_client_id))
  returning id, at into v_id, v_at;
  return pg_catalog.jsonb_build_object('id', v_id, 'at', v_at, 'replayed', false);
end
$$;
revoke execute on function english.eng_decide_action_card(uuid, text, text, text, timestamptz, text, text, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_decide_action_card(uuid, text, text, text, timestamptz, text, text, uuid, text) to service_role;

-- 3. Xóa dữ liệu một em = bản 0041 + action_card_decisions ---------------------------
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
  n_studio_feedback int := 0;
  n_studio_assignment_units int := 0;
  n_tutor_turns int := 0;
  n_tutor_ask_ratings int := 0;
  n_notebook_item_events int := 0;
  n_action_card_decisions int := 0;
  n_notebook_items int := 0;
  n_tutor_asks int := 0;
  n_tutor_asks_again int := 0;
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

  -- 0037: Unit của bài Studio trỏ tới curriculum_units/curricula và activity_instances / inquiry_instances → trước giáo trình (và trước các bước).
  delete from english.studio_assignment_units sau where sau.learner_id = p_learner_id;
  get diagnostics n_studio_assignment_units = row_count;

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

  -- 0037: góp ý Studio trỏ tới attempts / activity_instances → trước attempts.
  delete from english.studio_feedback stf where stf.learner_id = p_learner_id;
  get diagnostics n_studio_feedback = row_count;

  -- 0043: việc đã xử lý trên thẻ "Việc nên làm".
  delete from english.action_card_decisions acd where acd.learner_id = p_learner_id;
  get diagnostics n_action_card_decisions = row_count;

  -- 0041: Gia sư + Sổ tay (bảng con trước: chấm → lượt hỏi; sự kiện → mục). Thẻ dùng chung (vocab_cards) không có gì của em: giữ.
  delete from english.tutor_ask_ratings tar where tar.learner_id = p_learner_id;
  get diagnostics n_tutor_ask_ratings = row_count;

  delete from english.notebook_item_events nie where nie.learner_id = p_learner_id;
  get diagnostics n_notebook_item_events = row_count;

  delete from english.notebook_items nbi where nbi.learner_id = p_learner_id;
  get diagnostics n_notebook_items = row_count;

  -- "again" trỏ tới lượt gốc của cùng em: xóa lượt "again" trước.
  delete from english.tutor_asks tas where tas.learner_id = p_learner_id and tas.parent_ask is not null;
  get diagnostics n_tutor_asks_again = row_count;
  delete from english.tutor_asks tas where tas.learner_id = p_learner_id;
  get diagnostics n_tutor_asks = row_count;
  n_tutor_asks := n_tutor_asks + n_tutor_asks_again;

  -- 0039: lượt hỏi gia sư AI (trỏ tới activity_instances) → trước các bước.
  delete from english.tutor_turns ttn where ttn.learner_id = p_learner_id;
  get diagnostics n_tutor_turns = row_count;

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
    ) || pg_catalog.jsonb_build_object(
      'studio_feedback', n_studio_feedback,
      'studio_assignment_units', n_studio_assignment_units
    ) || pg_catalog.jsonb_build_object(
      'tutor_turns', n_tutor_turns
    ) || pg_catalog.jsonb_build_object(
      'tutor_asks', n_tutor_asks,
      'tutor_ask_ratings', n_tutor_ask_ratings,
      'notebook_items', n_notebook_items,
      'notebook_item_events', n_notebook_item_events
    ) || pg_catalog.jsonb_build_object(
      'action_card_decisions', n_action_card_decisions
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

-- Đếm trước khi xóa = bản 0039 + 4 bảng của 0041.
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
      'then_now_picks', (select pg_catalog.count(*) from english.then_now_picks x where x.learner_id = p_learner))
    -- 0037
    || pg_catalog.jsonb_build_object(
      'studio_feedback', (select pg_catalog.count(*) from english.studio_feedback x where x.learner_id = p_learner),
      'studio_assignment_units', (select pg_catalog.count(*) from english.studio_assignment_units x where x.learner_id = p_learner))
    -- 0039
    || pg_catalog.jsonb_build_object(
      'tutor_turns', (select pg_catalog.count(*) from english.tutor_turns x where x.learner_id = p_learner))
    -- 0041
    || pg_catalog.jsonb_build_object(
      'tutor_asks', (select pg_catalog.count(*) from english.tutor_asks x where x.learner_id = p_learner),
      'tutor_ask_ratings', (select pg_catalog.count(*) from english.tutor_ask_ratings x where x.learner_id = p_learner),
      'notebook_items', (select pg_catalog.count(*) from english.notebook_items x where x.learner_id = p_learner),
      'notebook_item_events', (select pg_catalog.count(*) from english.notebook_item_events x where x.learner_id = p_learner))
    -- 0043
    || pg_catalog.jsonb_build_object(
      'action_card_decisions', (select pg_catalog.count(*) from english.action_card_decisions x where x.learner_id = p_learner)));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0043') on conflict do nothing;
