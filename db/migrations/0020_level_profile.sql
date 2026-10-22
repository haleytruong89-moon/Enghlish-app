-- 0020_level_profile.sql
-- SM-2 · Hồ sơ cấp đang học (spec docs/superpowers/specs/2026-10-21-skill-map-levels-design.md §1 P2-a..P2-d, P4-c, §3, §5, §6):
--   1. english.level_decisions (append-only): sổ quyết định cấp từng mảng. Cấp hiện tại = dòng gần nhất của mảng; chưa có dòng nào →
--      cấp giả định của track (skill_maps.assumed — cấu hình của bản đồ, không phải dữ liệu của em).
--   2. english.external_results (append-only): mốc thi ngoài (KET/PET/FCE/CAE/CPE/đề thử vào 10/trường/khác), file kèm trong kho
--      english-work. Mốc ngoài KHÔNG tự đổi cấp. Sửa = dòng mới có supersedes_id (như results.supersedes_id, 0014).
--   3. files.kind thêm 'external_result' (nới ràng buộc: chỉ thêm, không bỏ loại nào).
--   4. Ghi: eng_record_level (baseline / adjust — CHỈ gia sư còn quan hệ hiệu lực với em; level_up để dành cho S7),
--      eng_record_external_result (gia sư hoặc phụ huynh của em).
--   5. Đọc: eng_level_profile (7 mảng + lịch sử + mốc ngoài), eng_recent_level_changes (ô "Thay đổi cấp gần đây" của phụ huynh),
--      eng_my_review_by_domain (trang chủ của em: tên điểm cần ôn + tên mảng; không cấp, không điểm, không ngày).
--   6. eng_purge_learner + eng_purge_preview thêm hai sổ mới.
-- Học sinh không đọc được hai sổ (RLS chỉ cho người lớn trong phạm vi; hàm ghi/đọc chỉ service_role). Không đụng schema public.
-- Idempotent; chỉ thêm (expand).

-- 1. Hai sổ (append-only) ------------------------------------------------------------------------------------------------------------
create table if not exists english.level_decisions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  domain_key text not null check (domain_key in ('grammar', 'vocab', 'reading', 'listening', 'writing', 'speaking', 'thinking')),
  map_id text not null references english.skill_maps(id),
  -- CEFR 9 nấc, hoặc bậc nhiệm vụ '1'..'4' cho mảng có thang task_level (thang của mảng trong bản đồ quyết định; hàm ghi kiểm).
  from_level text not null check (from_level in ('A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2', '1', '2', '3', '4')),
  to_level text not null check (to_level in ('A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2', '1', '2', '3', '4')),
  kind text not null check (kind in ('baseline', 'level_up', 'adjust')),
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 1 and 300),
  -- baseline / adjust: do hàm ghi điền ({basis, assumed_level, latest_external_result_id}); level_up (S7): bằng chứng của đề xuất.
  evidence jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(evidence) = 'object'),
  policy_version text,
  -- id của english.members, KHÔNG có khóa ngoại (xóa tài khoản không làm hỏng lịch sử).
  decided_by_member uuid not null,
  decided_role text not null check (decided_role = 'tutor'),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  decided_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id, domain_key),
  constraint level_decisions_adjust_reason check (kind <> 'adjust' or reason is not null)
);
create index if not exists level_decisions_learner_idx on english.level_decisions(learner_id, domain_key, decided_at desc);

create table if not exists english.external_results (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  exam text not null check (exam in ('KET', 'PET', 'FCE', 'CAE', 'CPE', 'VAO10_MOCK', 'SCHOOL', 'OTHER')),
  taken_on date not null,
  score_text text not null check (pg_catalog.length(pg_catalog.btrim(score_text)) between 1 and 60),
  domains text[] not null check (
    pg_catalog.cardinality(domains) between 1 and 7
    and domains <@ array['grammar', 'vocab', 'reading', 'listening', 'writing', 'speaking', 'thinking']::text[]),
  file_id uuid references english.files(id),
  note text check (note is null or pg_catalog.length(note) <= 300),
  recorded_by_member uuid not null,
  recorded_role text not null check (recorded_role in ('tutor', 'parent')),
  -- Sửa = dòng mới thay dòng cũ (không xóa, không sửa dòng cũ); mỗi dòng bị thay tối đa một lần.
  supersedes_id uuid references english.external_results(id),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create unique index if not exists external_results_file_once on english.external_results(file_id) where file_id is not null;
create unique index if not exists external_results_superseded_once on english.external_results(supersedes_id) where supersedes_id is not null;
create index if not exists external_results_learner_idx on english.external_results(learner_id, taken_on desc, recorded_at desc);

drop trigger if exists level_decisions_forbid_mutation on english.level_decisions;
create trigger level_decisions_forbid_mutation
  before update or delete on english.level_decisions
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists level_decisions_forbid_truncate on english.level_decisions;
create trigger level_decisions_forbid_truncate
  before truncate on english.level_decisions
  for each statement execute function english.eng_forbid_mutation();
drop trigger if exists external_results_forbid_mutation on english.external_results;
create trigger external_results_forbid_mutation
  before update or delete on english.external_results
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists external_results_forbid_truncate on english.external_results;
create trigger external_results_forbid_truncate
  before truncate on english.external_results
  for each statement execute function english.eng_forbid_mutation();

-- 2. RLS: phụ huynh / gia sư trong phạm vi đọc; học sinh không bao giờ (eng_is_staff_of). Không ai ghi trực tiếp.
alter table english.level_decisions enable row level security;
alter table english.external_results enable row level security;
revoke all on english.level_decisions, english.external_results from public, anon, authenticated;
revoke insert, update, delete, truncate on english.level_decisions, english.external_results from public, anon, authenticated, service_role;
grant select on english.level_decisions, english.external_results to authenticated;
drop policy if exists level_decisions_select on english.level_decisions;
create policy level_decisions_select on english.level_decisions
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists external_results_select on english.external_results;
create policy external_results_select on english.external_results
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- 3. File phiếu điểm thi ngoài: thêm loại 'external_result' (PDF hoặc ảnh). Thay hai CHECK bằng bản rộng hơn (không bỏ loại nào).
alter table english.files drop constraint if exists files_kind_check;
alter table english.files add constraint files_kind_check
  check (kind in ('assignment_pdf', 'answer_key', 'result_image', 'work_photo', 'external_result'));
alter table english.files drop constraint if exists files_kind_mime;
alter table english.files add constraint files_kind_mime check (
  (kind = 'assignment_pdf' and mime = 'application/pdf')
  or kind in ('answer_key', 'work_photo', 'external_result')
  or (kind = 'result_image' and mime <> 'application/pdf'));

-- 6. Purge: thêm level_decisions + external_results (giữ nguyên mọi dòng của 0018; có test đối chiếu từng dòng).
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

-- Đếm trước khi xóa: thêm level_decisions + external_results (giữ nguyên mọi dòng của 0018).
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
      'login_names', (select pg_catalog.count(*) from english.login_names x where x.auth_user_id = v_user),
      'learners', 1,
      'members', (select pg_catalog.count(*) from english.members x where x.id = v_l.member_id and x.role = 'student')));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0020') on conflict do nothing;
