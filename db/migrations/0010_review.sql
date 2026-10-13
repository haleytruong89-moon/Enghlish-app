-- 0010_review.sql
-- S5: hộp duyệt của gia sư / phụ huynh — chấm theo từng kỹ năng (0–4 hoặc "không có cơ hội thể hiện"), duyệt theo vai trò (D15),
-- sửa quyết định có lịch sử, ghi nhận bài làm NGOÀI app (nói trực tiếp với gia sư, bài trên giấy), ghi chú buổi học
-- (DESIGN §6, §7, §8 "Quy tắc đếm", §13; PRD Family D15, D16, FR-13, FR-20; plan docs/plans/s5-review.md).
--
-- Nguyên tắc an toàn:
--  * Học sinh KHÔNG thấy gì mới: observations / validation_decisions / lesson_notes không có policy nào cho học sinh, và hai hàm đọc
--    (eng_review_inbox, eng_review_episode) trả NULL / rỗng nếu người gọi không phải phụ huynh hoặc gia sư của em.
--  * Hai lớp điểm riêng: 1 "người chấm" = 1 dòng observations (điểm 0–4 hoặc not_observed; NULL ≠ 0) + 1 dòng validation_decisions (AGREE).
--    Đổi quyết định = dòng MODIFY mới trỏ supersedes_id, bắt buộc có lý do. Cả hai bảng chỉ thêm (eng_forbid_mutation).
--  * D15 nằm Ở ĐÂY (không tin route): bài kiểm tra trong buổi (facet checkpoint) và bài quan sát trực tiếp (observed_directly) → chỉ
--    GIA SƯ còn quan hệ hiệu lực; bài còn lại → gia sư hoặc phụ huynh của gia đình. Học sinh không bao giờ.
--  * Mức hỗ trợ tách khỏi điểm: ghi hỗ trợ quan sát được là hành động riêng, dòng assistance_events riêng; không bao giờ đổi điểm.
--  * Bài làm ngoài app dùng CHUNG luật đếm với S4 (eng_attempt_slot + eng_record_attempt_effects): số lần, gia đình học tập, lần đầu,
--    bài tự làm chỉ một lần, lần tiếp xúc, facet baseline/checkpoint/delayed/transfer. Không có âm thanh ở bất kỳ đâu.
--  * Ghi chỉ qua hàm security definer (service_role sau requireAccess; hàm kiểm lại người thao tác). Không ai ghi trực tiếp bảng.
-- Không đụng schema public. Idempotent. Grant theo từng bảng.

-- Hàm nhỏ dùng chung --------------------------------------------------------------------------------------------------------------

-- Hôm nay theo giờ Việt Nam (cùng cách tính với S2/S4).
create or replace function english.eng_today_vn() returns date
language sql stable set search_path = ''
as $$ select (pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

-- Thời điểm của một buổi / một bài làm ngoài app: hôm nay → bây giờ; ngày cũ hơn → 12:00 trưa giờ Việt Nam của ngày đó
-- (đủ để luật "≥ 14 ngày từ lần luyện gần nhất" tính đúng ngày thật, không phải ngày nhập).
create or replace function english.eng_session_ts(p_date date) returns timestamptz
language sql volatile set search_path = ''
as $$
  select case when p_date >= english.eng_today_vn() then pg_catalog.clock_timestamp()
              else ((p_date + time '12:00') at time zone 'Asia/Ho_Chi_Minh') end
$$;

-- Mọi phần tử đều dài từ p_min đến p_max ký tự (sau khi bỏ khoảng trắng đầu/cuối).
create or replace function english.eng_all_len_between(p_arr text[], p_min int, p_max int) returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(bool_and(x is not null and pg_catalog.length(pg_catalog.btrim(x)) between p_min and p_max and pg_catalog.length(x) <= p_max), true)
  from unnest(p_arr) as x
$$;

-- Bảng mới -------------------------------------------------------------------------------------------------------------------------

-- Ghi chú buổi học (FR-20 light). Chỉ thêm; sửa = dòng mới trỏ supersedes_id. Gia sư viết; phụ huynh chỉ đọc bản ĐÃ công bố hiện hành.
create table if not exists english.lesson_notes (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  -- id của english.members, KHÔNG có khóa ngoại (xóa tài khoản gia sư không được làm hỏng lịch sử), như assigned_by của S2.
  tutor_member_id uuid not null,
  session_date date not null,
  goals text check (goals is null or pg_catalog.length(goals) <= 1000),
  observed text check (observed is null or pg_catalog.length(observed) <= 2000),
  support_level text not null check (support_level in ('none', 'light', 'moderate', 'heavy')),
  next_actions text[] not null default '{}'
    check (cardinality(next_actions) <= 3 and english.eng_all_len_between(next_actions, 1, 200)),
  practised_target_ids text[] not null default '{}' check (english.eng_all_len_between(practised_target_ids, 1, 100)),
  published boolean not null default false,
  supersedes_id uuid references english.lesson_notes(id),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create unique index if not exists lesson_notes_supersedes_once on english.lesson_notes(supersedes_id) where supersedes_id is not null;
create index if not exists lesson_notes_learner_idx on english.lesson_notes(learner_id, session_date desc);

-- observations: lớp "người chấm" (AI sẽ thêm ở S11 bằng scorer = 'ai'). NULL (not_observed) ≠ 0.
create table if not exists english.observations (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references english.episodes(id),
  learner_id uuid not null references english.learners(id),
  target_key text not null check (pg_catalog.length(pg_catalog.btrim(target_key)) > 0),
  scorer text not null check (scorer in ('ai', 'tutor', 'parent')),
  scorer_member_id uuid,
  status text not null check (status in ('PROPOSED', 'ABSTAIN')),
  score smallint check (score is null or score between 0 and 4),
  not_observed boolean not null default false,
  criteria_results jsonb check (criteria_results is null or pg_catalog.jsonb_typeof(criteria_results) = 'object'),
  rationale text check (rationale is null or pg_catalog.length(rationale) <= 2000),
  blind boolean not null,
  rubric_version text not null check (pg_catalog.length(pg_catalog.btrim(rubric_version)) > 0),
  client_id text check (client_id is null or pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  constraint observations_score_shape check (
    (status = 'PROPOSED' and ((score is not null) <> not_observed))
    or (status = 'ABSTAIN' and score is null and not not_observed)),
  constraint observations_human_scores check (scorer = 'ai' or (status = 'PROPOSED' and scorer_member_id is not null))
);
create unique index if not exists observations_client_once on english.observations(episode_id, target_key, client_id) where client_id is not null;
create index if not exists observations_episode_idx on english.observations(episode_id);
create index if not exists observations_learner_idx on english.observations(learner_id);

-- validation_decisions: lớp "quyết định". Quyết định hiện hành của (episode, kỹ năng) = dòng không bị dòng nào khác thay thế.
create table if not exists english.validation_decisions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references english.episodes(id),
  learner_id uuid not null references english.learners(id),
  target_key text not null check (pg_catalog.length(pg_catalog.btrim(target_key)) > 0),
  observation_id uuid references english.observations(id),
  decision text not null check (decision in ('AGREE', 'MODIFY', 'INSUFFICIENT', 'REQUEST_MORE')),
  final_score smallint check (final_score is null or final_score between 0 and 4),
  final_not_observed boolean not null default false,
  validator_member_id uuid not null,
  validator_role text not null check (validator_role in ('tutor', 'parent')),
  reason text check (reason is null or pg_catalog.length(reason) <= 1000),
  supersedes_id uuid references english.validation_decisions(id),
  client_id text check (client_id is null or pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  constraint validation_decisions_final_shape check (
    (decision in ('AGREE', 'MODIFY') and ((final_score is not null) <> final_not_observed))
    or (decision in ('INSUFFICIENT', 'REQUEST_MORE') and final_score is null and not final_not_observed)),
  -- Chuỗi sửa: AGREE là quyết định đầu (không thay ai); MODIFY luôn thay một quyết định và phải có lý do.
  constraint validation_decisions_chain check (
    (decision = 'AGREE' and supersedes_id is null) or (decision = 'MODIFY' and supersedes_id is not null) or decision in ('INSUFFICIENT', 'REQUEST_MORE')),
  constraint validation_decisions_modify_reason check (decision <> 'MODIFY' or pg_catalog.length(pg_catalog.btrim(coalesce(reason, ''))) >= 3)
);
-- Chuỗi tuyến tính: mỗi quyết định chỉ bị thay MỘT lần; mỗi (episode, kỹ năng) chỉ có MỘT quyết định đầu.
create unique index if not exists validation_decisions_supersedes_once on english.validation_decisions(supersedes_id) where supersedes_id is not null;
create unique index if not exists validation_decisions_first_once on english.validation_decisions(episode_id, target_key) where supersedes_id is null;
create unique index if not exists validation_decisions_client_once on english.validation_decisions(episode_id, target_key, client_id) where client_id is not null;
create index if not exists validation_decisions_learner_idx on english.validation_decisions(learner_id);

-- Cột thêm cho bảng S4 (chỉ THÊM cột có thể null; dữ liệu cũ giữ nguyên) ------------------------------------------------------------
-- assistance_events: hỗ trợ do GIA SƯ / PHỤ HUYNH ghi (quan sát được hoặc khai lại), kèm ghi chú ngắn.
alter table english.assistance_events add column if not exists note text check (note is null or pg_catalog.length(note) between 1 and 300);
alter table english.assistance_events add column if not exists recorded_by uuid;
alter table english.assistance_events add column if not exists client_id text check (client_id is null or pg_catalog.length(client_id) between 8 and 100);
create unique index if not exists assistance_events_client_once on english.assistance_events(attempt_id, client_id) where client_id is not null;

-- exposure_log: lần tiếp xúc từ buổi học (source = 'lesson') nhớ ghi chú đã tạo ra nó.
alter table english.exposure_log add column if not exists lesson_note_id uuid references english.lesson_notes(id);

-- attempts.declared_assistance: thêm giá trị 'unknown' ("chưa rõ em đã dùng gì") CHO BÀI GHI NGOÀI APP. Học sinh vẫn chỉ nộp được 5 giá
-- trị cũ (eng_submit_attempt kiểm riêng). 'unknown' không bao giờ được hiểu là "không dùng gì" (UAT-06: verification = unknown).
alter table english.attempts drop constraint if exists attempts_declared_assistance_check;
alter table english.attempts add constraint attempts_declared_assistance_check check (
  cardinality(declared_assistance) > 0
  and declared_assistance <@ array['none', 'notes', 'dictionary', 'asked_someone', 'ai_outside', 'unknown']
  and (('none' <> all (declared_assistance) and 'unknown' <> all (declared_assistance)) or cardinality(declared_assistance) = 1));

-- Append-only (theo hướng dẫn đầu 0004) --------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['observations', 'validation_decisions', 'lesson_notes'] loop
    execute format('drop trigger if exists %I on english.%I', t || '_forbid_mutation', t);
    execute format(
      'create trigger %I before update or delete on english.%I for each row execute function english.eng_forbid_mutation(%L)',
      t || '_forbid_mutation', t, 'learner_id');
    execute format('drop trigger if exists %I on english.%I', t || '_forbid_truncate', t);
    execute format(
      'create trigger %I before truncate on english.%I for each statement execute function english.eng_forbid_mutation()',
      t || '_forbid_truncate', t);
  end loop;
end
$$;

-- Luật đếm dùng chung với S4 -------------------------------------------------------------------------------------------------------
-- (Chỉ gọi từ các hàm security definer bên dưới và eng_submit_attempt; không ai khác có quyền execute.)

-- Số thứ tự, lần trước, gia đình học tập và "lần đầu" của lần nộp KẾ TIẾP của một bước. Người gọi phải đã khóa dòng bước.
-- Bài tự làm (INDEPENDENT_CHECK) chỉ một lần: đã có lần nào (trong app hay ngoài app) thì 23505.
create or replace function english.eng_attempt_slot(p_activity uuid, p_mode text, p_new_id uuid, p_caller text)
returns table (o_no int, o_parent uuid, o_family uuid, o_first boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_last english.attempts%rowtype;
begin
  select t.* into v_last from english.attempts t
  where t.activity_instance_id = p_activity order by t.attempt_no desc limit 1;
  if found then
    if p_mode = 'INDEPENDENT_CHECK' then
      raise exception '%: this step is a one-time check and was already submitted', p_caller using errcode = '23505';
    end if;
    return query select v_last.attempt_no + 1, v_last.id, v_last.learning_family_id, false;
  else
    -- DESIGN §8: lần đầu = attempt_no 1 trong gia đình học tập và không phải sửa bài.
    return query select 1, null::uuid, p_new_id, p_mode <> 'REVISION';
  end if;
end
$$;

-- Lần tiếp xúc (practice / retry) + episode (kèm facet baseline / checkpoint / delayed_check / transfer_check) của một lần nộp.
create or replace function english.eng_record_attempt_effects(
  p_attempt uuid, p_learner uuid, p_target_ids text[], p_purpose text[], p_context text,
  p_no int, p_first boolean, p_at timestamptz, p_observed_directly boolean
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  insert into english.exposure_log(learner_id, target_key, at, source, attempt_id)
  select distinct p_learner, k, p_at, case when p_no > 1 then 'retry' else 'practice' end, p_attempt
  from unnest(p_target_ids) as k;

  insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id, observed_directly, facets)
  values (p_attempt, p_learner, p_first, p_context, p_observed_directly,
          pg_catalog.jsonb_build_object(
            'baseline', p_purpose @> array['baseline'],
            'checkpoint', p_purpose @> array['checkpoint'],
            'delayed_check', p_purpose @> array['delayed_check'],
            'transfer_check', p_purpose @> array['transfer_check']));
end
$$;

-- Ai được duyệt một episode (D15). 'tutor' | 'parent' | NULL (không ai).
--  * gia sư còn quan hệ hiệu lực với em → luôn được;
--  * phụ huynh của gia đình → CHỈ khi không phải bài kiểm tra trong buổi (checkpoint) và không phải bài quan sát trực tiếp;
--  * học sinh, gia sư hết hạn / của em khác, phụ huynh gia đình khác → không.
create or replace function english.eng_review_role(p_episode uuid, p_member uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when m.role = 'tutor' and english.eng_actor_may_manage(m.id, e.learner_id) then 'tutor'
    when m.role = 'parent' and english.eng_actor_may_manage(m.id, e.learner_id)
         and not (coalesce((e.facets ->> 'checkpoint')::boolean, false) or e.observed_directly) then 'parent'
    else null
  end
  from english.episodes e
  join english.members m on m.id = p_member
  where e.id = p_episode
$$;

-- Các kỹ năng của bước mà episode này thuộc về, theo thứ tự của bước. is_target = có trong danh mục (chỉ số tổng hợp như
-- AGG-B-EXAM-MOCK thì không); live_only = mọi tiêu chí của kỹ năng là "gia sư nghe trực tiếp" (vd. nói trôi chảy); scorable = chấm được
-- từ bài này (kỹ năng "gia sư nghe trực tiếp" chỉ chấm được khi bài được quan sát trực tiếp).
create or replace function english.eng_episode_targets(p_episode uuid)
returns table (target_key text, ord int, is_target boolean, live_only boolean, scorable boolean)
language sql stable security definer set search_path = ''
as $$
  select u.k, min(u.o)::int,
         bool_or(t.id is not null),
         coalesce(bool_or(not exists (select 1 from pg_catalog.jsonb_array_elements(t.success_criteria) c where c ->> 'method' <> 'tutor_live')), false),
         coalesce(bool_or(t.id is not null
                          and (e.observed_directly
                               or exists (select 1 from pg_catalog.jsonb_array_elements(t.success_criteria) c where c ->> 'method' <> 'tutor_live'))), false)
  from english.episodes e
  join english.attempts at on at.id = e.attempt_id
  join english.activity_instances a on a.id = at.activity_instance_id
  join english.inquiry_instances i on i.id = a.inquiry_instance_id
  cross join lateral unnest(a.target_ids) with ordinality as u(k, o)
  left join english.targets t on t.id = u.k and t.descriptor_version = i.snapshot -> 'template' ->> 'descriptor_version'
  where e.id = p_episode
  group by u.k
$$;

create or replace function english.eng_lesson_note_is_current(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select not exists (select 1 from english.lesson_notes n where n.supersedes_id = p_id) $$;

revoke execute on function english.eng_today_vn() from public, anon, authenticated, service_role;
revoke execute on function english.eng_session_ts(date) from public, anon, authenticated, service_role;
revoke execute on function english.eng_all_len_between(text[], int, int) from public, anon;
grant execute on function english.eng_all_len_between(text[], int, int) to authenticated, service_role;
revoke execute on function english.eng_attempt_slot(uuid, text, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function english.eng_record_attempt_effects(uuid, uuid, text[], text[], text, int, boolean, timestamptz, boolean) from public, anon, authenticated, service_role;
revoke execute on function english.eng_review_role(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_episode_targets(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_lesson_note_is_current(uuid) from public, anon;
grant execute on function english.eng_lesson_note_is_current(uuid) to authenticated, service_role;

-- Nộp bài (S4) viết lại chỉ để dùng chung luật đếm; hành vi không đổi (test S4 vẫn xanh).
create or replace function english.eng_submit_attempt(
  p_activity uuid,
  p_client_id uuid,
  p_content jsonb,
  p_assistance text[],
  p_provenance text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member uuid;
  v_role text;
  v_act english.activity_instances%rowtype;
  v_learner english.learners%rowtype;
  v_snapshot jsonb;
  v_step jsonb;
  v_shape text;
  v_assist text[];
  v_hash text;
  v_existing english.attempts%rowtype;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_no int;
  v_parent uuid;
  v_family uuid;
  v_first boolean;
  v_at timestamptz := pg_catalog.clock_timestamp();
  v_item text;
begin
  if v_uid is null then
    raise exception 'eng_submit_attempt: not signed in' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'eng_submit_attempt: client_submission_id is required' using errcode = '22004';
  end if;
  select m.id, m.role into v_member, v_role from english.members m where m.user_id = v_uid;
  if v_member is null then
    raise exception 'eng_submit_attempt: activity not found' using errcode = 'P0002';
  end if;
  if v_role <> 'student' then
    raise exception 'eng_submit_attempt: only the learner may submit work' using errcode = '42501';
  end if;

  -- Khóa dòng bước: hai lần nộp cùng lúc của một bước xếp hàng (không tạo đôi, không vượt giới hạn 1 lần của bài tự làm).
  select a.* into v_act
  from english.activity_instances a
  join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member
  for no key update of a;
  if not found then
    raise exception 'eng_submit_attempt: activity not found' using errcode = 'P0002';
  end if;
  select * into v_learner from english.learners l where l.id = v_act.learner_id;

  -- Khai báo hỗ trợ: bắt buộc, giá trị hợp lệ, "none" đứng một mình.
  select coalesce(array_agg(distinct x order by x), '{}') into v_assist from unnest(p_assistance) as x;
  if cardinality(v_assist) = 0
     or not (v_assist <@ array['none', 'notes', 'dictionary', 'asked_someone', 'ai_outside'])
     or ('none' = any (v_assist) and cardinality(v_assist) > 1) then
    raise exception 'eng_submit_attempt: declare the help used (or "none")' using errcode = '22023';
  end if;
  if p_provenance is null or p_provenance not in ('in_app', 'pasted') then
    raise exception 'eng_submit_attempt: provenance must be in_app or pasted' using errcode = '22023';
  end if;
  if p_content is null then
    raise exception 'eng_submit_attempt: content is required' using errcode = '22023';
  end if;

  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_content::text, 'UTF8')), 'hex');

  -- Gửi lại: cùng biên nhận.
  select t.* into v_existing from english.attempts t
  where t.learner_id = v_act.learner_id and t.client_submission_id = p_client_id;
  if found then
    if v_existing.activity_instance_id <> p_activity
       or v_existing.content_hash <> v_hash
       or v_existing.declared_assistance is distinct from v_assist
       or v_existing.provenance is distinct from p_provenance then
      raise exception 'eng_submit_attempt: client_submission_id was already used for a different submission'
        using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'attempt_id', v_existing.id, 'attempt_no', v_existing.attempt_no,
      'submitted_at', v_existing.submitted_at, 'hash', v_existing.content_hash, 'replayed', true);
  end if;

  if not english.eng_activity_released(p_activity) then
    raise exception 'eng_submit_attempt: activity not found' using errcode = 'P0002';
  end if;
  if not english.eng_step_supported(v_act.activity_type, v_act.mode) then
    raise exception 'eng_submit_attempt: this step cannot be done in the app yet' using errcode = '22023';
  end if;

  select i.snapshot into v_snapshot from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  select x into v_step
  from pg_catalog.jsonb_array_elements(v_snapshot -> 'steps') as x
  where (x ->> 'step_no')::int = v_act.step_no;
  perform english.eng_check_work_content(v_step, p_content, true);
  v_shape := english.eng_step_shape(v_step);

  -- Luật đếm dùng chung với bài làm ngoài app (eng_attempt_slot): số lần, lần trước, gia đình học tập, "lần đầu"; bài tự làm chỉ một lần.
  select s.o_no, s.o_parent, s.o_family, s.o_first into v_no, v_parent, v_family, v_first
  from english.eng_attempt_slot(p_activity, v_act.mode, v_id, 'eng_submit_attempt') s;

  insert into english.attempts(
    id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance,
    declared_assistance, submitted_at, content_hash, client_submission_id)
  values (v_id, p_activity, v_act.learner_id, v_no, v_parent, v_family, v_act.mode, p_provenance,
          v_assist, v_at, v_hash, p_client_id);

  insert into english.artifact_versions(attempt_id, learner_id, kind, version, content, is_raw, created_by)
  values (v_id, v_act.learner_id, v_shape, 1, p_content, true, v_member);

  if v_shape = 'answers' then
    insert into english.attempt_auto_checks(attempt_id, learner_id, checks)
    values (v_id, v_act.learner_id,
            english.eng_compute_auto_checks(v_act.inquiry_instance_id, v_step, p_content -> 'answers'));
  end if;

  -- Hỗ trợ đã khai báo: mỗi mục một dòng, ảnh hưởng mọi kỹ năng của bước.
  foreach v_item in array v_assist loop
    if v_item <> 'none' then
      insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification)
      values (v_act.learner_id, v_id, case when v_item = 'notes' then 'notes' else 'external_declared' end,
              v_item, v_act.target_ids, 'declared');
    end if;
  end loop;
  if p_provenance = 'pasted' then
    insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification)
    values (v_act.learner_id, v_id, 'external_declared', 'pasted', v_act.target_ids, 'declared');
  end if;

  perform english.eng_record_attempt_effects(
    v_id, v_act.learner_id, v_act.target_ids, v_act.purpose, v_snapshot -> 'template' ->> 'id', v_no, v_first, v_at, false);

  delete from english.working_drafts d where d.activity_instance_id = p_activity and d.learner_id = v_act.learner_id;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_uid, v_role, 'attempt.submitted', v_learner.family_id, v_act.learner_id,
          pg_catalog.jsonb_build_object('attempt', v_id, 'attempt_no', v_no, 'activity_instance', p_activity));

  return pg_catalog.jsonb_build_object(
    'attempt_id', v_id, 'attempt_no', v_no, 'submitted_at', v_at, 'hash', v_hash, 'replayed', false);
end
$$;

revoke execute on function english.eng_submit_attempt(uuid, uuid, jsonb, text[], text) from public, anon, service_role;
grant execute on function english.eng_submit_attempt(uuid, uuid, jsonb, text[], text) to authenticated;

-- Ghi điểm theo từng kỹ năng ---------------------------------------------------------------------------------------------------------

-- Một người chấm cho MỘT kỹ năng của một episode: 1 dòng observations + 1 dòng validation_decisions (AGREE) trong một transaction.
-- p_score 0..4 XOR p_not_observed (NULL ≠ 0). Idempotent theo (episode, kỹ năng, client_id): gửi lại y hệt → cùng kết quả; khác → 23505.
-- Đã có quyết định đầu cho kỹ năng này → 23505 (dùng eng_modify_decision).
create or replace function english.eng_record_review(
  p_episode uuid,
  p_target text,
  p_score smallint,
  p_not_observed boolean,
  p_criteria jsonb,
  p_rationale text,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ep english.episodes%rowtype;
  v_role text;
  v_tgt record;
  v_template jsonb;
  v_rationale text := nullif(pg_catalog.btrim(coalesce(p_rationale, '')), '');
  v_obs english.observations%rowtype;
  v_dec_id uuid;
  v_obs_id uuid;
  v_user uuid;
  v_urole text;
  v_family uuid;
begin
  if p_episode is null or p_target is null or p_by is null or p_not_observed is null then
    raise exception 'eng_record_review: episode, target, actor and not_observed are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_record_review: client_id must be 8..100 characters' using errcode = '22023';
  end if;

  -- Khóa dòng episode: hai người cùng duyệt một bài xếp hàng.
  select e.* into v_ep from english.episodes e where e.id = p_episode for no key update;
  if not found then
    raise exception 'eng_record_review: episode not found' using errcode = 'P0002';
  end if;

  v_role := english.eng_review_role(p_episode, p_by);
  if v_role is null then
    raise exception 'eng_record_review: this member may not review this episode (D15)' using errcode = '42501';
  end if;

  select * into v_tgt from english.eng_episode_targets(p_episode) t where t.target_key = p_target;
  if not found or not v_tgt.scorable then
    raise exception 'eng_record_review: "%" cannot be scored from this work', p_target using errcode = '23514';
  end if;

  if p_not_observed then
    if p_score is not null then
      raise exception 'eng_record_review: a score and "no opportunity" cannot both be given' using errcode = '22023';
    end if;
  elsif p_score is null or p_score < 0 or p_score > 4 then
    raise exception 'eng_record_review: give a score from 0 to 4, or "no opportunity to show it"' using errcode = '22023';
  end if;

  if v_rationale is not null and pg_catalog.length(v_rationale) > 2000 then
    raise exception 'eng_record_review: the note is too long' using errcode = '22023';
  end if;

  select i.snapshot -> 'template' into v_template
  from english.attempts at
  join english.activity_instances a on a.id = at.activity_instance_id
  join english.inquiry_instances i on i.id = a.inquiry_instance_id
  where at.id = v_ep.attempt_id;

  if p_criteria is not null then
    if pg_catalog.jsonb_typeof(p_criteria) <> 'object' then
      raise exception 'eng_record_review: criteria must be an object' using errcode = '22023';
    end if;
    if exists (select 1 from pg_catalog.jsonb_each(p_criteria) kv where pg_catalog.jsonb_typeof(kv.value) <> 'boolean') then
      raise exception 'eng_record_review: each criterion is true or false' using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_object_keys(p_criteria) k
      where not exists (
        select 1 from english.targets t, pg_catalog.jsonb_array_elements(t.success_criteria) c
        where t.id = p_target and t.descriptor_version = v_template ->> 'descriptor_version' and c ->> 'id' = k)) then
      raise exception 'eng_record_review: unknown criterion for this skill' using errcode = '22023';
    end if;
  end if;

  -- Gửi lại: cùng kết quả (không tạo dòng mới).
  select o.* into v_obs from english.observations o
  where o.episode_id = p_episode and o.target_key = p_target and o.client_id = p_client_id;
  if found then
    if v_obs.scorer_member_id is distinct from p_by
       or v_obs.score is distinct from p_score
       or v_obs.not_observed <> p_not_observed then
      raise exception 'eng_record_review: client_id was already used for a different score' using errcode = '23505';
    end if;
    select d.id into v_dec_id from english.validation_decisions d where d.observation_id = v_obs.id;
    return pg_catalog.jsonb_build_object('observation_id', v_obs.id, 'decision_id', v_dec_id, 'replayed', true);
  end if;

  if exists (select 1 from english.validation_decisions d
             where d.episode_id = p_episode and d.target_key = p_target and d.supersedes_id is null) then
    raise exception 'eng_record_review: this skill already has a decision - use eng_modify_decision' using errcode = '23505';
  end if;

  insert into english.observations(
    episode_id, learner_id, target_key, scorer, scorer_member_id, status, score, not_observed,
    criteria_results, rationale, blind, rubric_version, client_id)
  values (
    p_episode, v_ep.learner_id, p_target, v_role, p_by, 'PROPOSED', p_score, p_not_observed,
    p_criteria, v_rationale,
    -- Chưa có điểm AI ở S5; bài kiểm tra trong buổi vẫn ghi cờ "chấm mù" để so sánh AI với người ở lát sau (D16).
    coalesce((v_ep.facets ->> 'checkpoint')::boolean, false),
    v_template ->> 'catalogue_version', p_client_id)
  returning id into v_obs_id;

  insert into english.validation_decisions(
    episode_id, learner_id, target_key, observation_id, decision, final_score, final_not_observed,
    validator_member_id, validator_role, client_id)
  values (p_episode, v_ep.learner_id, p_target, v_obs_id, 'AGREE', p_score, p_not_observed, p_by, v_role, p_client_id)
  returning id into v_dec_id;

  select m.user_id, m.role, m.family_id into v_user, v_urole, v_family from english.members m where m.id = p_by;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_user, v_urole, 'review.decided', v_family, v_ep.learner_id,
          pg_catalog.jsonb_build_object('episode', p_episode, 'target', p_target, 'decision', v_dec_id, 'validator_role', v_role));

  return pg_catalog.jsonb_build_object('observation_id', v_obs_id, 'decision_id', v_dec_id, 'replayed', false);
end
$$;

-- Chấm nhiều kỹ năng của một episode trong MỘT transaction (nút "Lưu và duyệt"). p_items: mảng
-- {target_key, score | null, not_observed, criteria?, rationale?}. Cùng client_id cho cả lượt (mỗi kỹ năng một dòng riêng).
create or replace function english.eng_record_reviews(p_episode uuid, p_items jsonb, p_by uuid, p_client_id text) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_n int;
  v_distinct int;
begin
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception 'eng_record_reviews: items must be an array' using errcode = '22023';
  end if;
  v_n := pg_catalog.jsonb_array_length(p_items);
  if v_n < 1 or v_n > 30 then
    raise exception 'eng_record_reviews: 1 to 30 items' using errcode = '22023';
  end if;
  select count(distinct x ->> 'target_key') into v_distinct from pg_catalog.jsonb_array_elements(p_items) as x;
  if v_distinct <> v_n then
    raise exception 'eng_record_reviews: each skill can appear once' using errcode = '22023';
  end if;
  for v_item in select x from pg_catalog.jsonb_array_elements(p_items) as x loop
    v_out := v_out || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('target_key', v_item ->> 'target_key') ||
      english.eng_record_review(
        p_episode,
        v_item ->> 'target_key',
        (v_item ->> 'score')::smallint,
        coalesce((v_item ->> 'not_observed')::boolean, false),
        case when pg_catalog.jsonb_typeof(v_item -> 'criteria') = 'object' then v_item -> 'criteria' else null end,
        v_item ->> 'rationale',
        p_by,
        p_client_id));
  end loop;
  return v_out;
end
$$;

-- Đổi quyết định hiện hành của một kỹ năng: dòng MODIFY mới thay dòng cũ; lý do bắt buộc (≥ 3 ký tự); lịch sử còn nguyên.
-- Cùng luật người duyệt (D15) với lúc chấm. Chỉ đổi được quyết định HIỆN HÀNH (đã bị thay rồi → 23505).
create or replace function english.eng_modify_decision(
  p_decision uuid,
  p_score smallint,
  p_not_observed boolean,
  p_reason text,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old english.validation_decisions%rowtype;
  v_new english.validation_decisions%rowtype;
  v_role text;
  v_scorable boolean;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_id uuid;
  v_user uuid;
  v_urole text;
  v_family uuid;
begin
  if p_decision is null or p_by is null or p_not_observed is null then
    raise exception 'eng_modify_decision: decision, actor and not_observed are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_modify_decision: client_id must be 8..100 characters' using errcode = '22023';
  end if;

  select d.* into v_old from english.validation_decisions d where d.id = p_decision;
  if not found then
    raise exception 'eng_modify_decision: decision not found' using errcode = 'P0002';
  end if;
  -- Khóa episode (cùng khóa với eng_record_review) rồi mới xét "đã bị thay chưa".
  perform 1 from english.episodes e where e.id = v_old.episode_id for no key update;

  v_role := english.eng_review_role(v_old.episode_id, p_by);
  if v_role is null then
    raise exception 'eng_modify_decision: this member may not review this episode (D15)' using errcode = '42501';
  end if;

  select t.scorable into v_scorable from english.eng_episode_targets(v_old.episode_id) t where t.target_key = v_old.target_key;
  if not coalesce(v_scorable, false) then
    raise exception 'eng_modify_decision: "%" cannot be scored from this work', v_old.target_key using errcode = '23514';
  end if;

  if p_not_observed then
    if p_score is not null then
      raise exception 'eng_modify_decision: a score and "no opportunity" cannot both be given' using errcode = '22023';
    end if;
  elsif p_score is null or p_score < 0 or p_score > 4 then
    raise exception 'eng_modify_decision: give a score from 0 to 4, or "no opportunity to show it"' using errcode = '22023';
  end if;
  if pg_catalog.length(v_reason) < 3 then
    raise exception 'eng_modify_decision: a reason (at least 3 characters) is required' using errcode = '23514';
  end if;
  if pg_catalog.length(v_reason) > 1000 then
    raise exception 'eng_modify_decision: the reason is too long' using errcode = '22023';
  end if;

  select d.* into v_new from english.validation_decisions d where d.supersedes_id = p_decision;
  if found then
    if v_new.client_id = p_client_id and v_new.validator_member_id = p_by
       and v_new.final_score is not distinct from p_score and v_new.final_not_observed = p_not_observed then
      return pg_catalog.jsonb_build_object('decision_id', v_new.id, 'supersedes_id', p_decision, 'replayed', true);
    end if;
    raise exception 'eng_modify_decision: this decision was already replaced' using errcode = '23505';
  end if;

  if v_old.final_score is not distinct from p_score and v_old.final_not_observed = p_not_observed then
    raise exception 'eng_modify_decision: the new value is the same as the current one' using errcode = '23514';
  end if;

  insert into english.validation_decisions(
    episode_id, learner_id, target_key, observation_id, decision, final_score, final_not_observed,
    validator_member_id, validator_role, reason, supersedes_id, client_id)
  values (v_old.episode_id, v_old.learner_id, v_old.target_key, null, 'MODIFY', p_score, p_not_observed,
          p_by, v_role, v_reason, p_decision, p_client_id)
  returning id into v_id;

  select m.user_id, m.role, m.family_id into v_user, v_urole, v_family from english.members m where m.id = p_by;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_user, v_urole, 'review.modified', v_family, v_old.learner_id,
          pg_catalog.jsonb_build_object('episode', v_old.episode_id, 'target', v_old.target_key, 'decision', v_id, 'supersedes', p_decision, 'validator_role', v_role));

  return pg_catalog.jsonb_build_object('decision_id', v_id, 'supersedes_id', p_decision, 'replayed', false);
end
$$;

-- Hỗ trợ QUAN SÁT ĐƯỢC do gia sư / phụ huynh ghi cho một lần nộp (vd. "cô nhắc dùng từ nối"). Hành động riêng, dòng riêng trong
-- assistance_events (verification = observed); KHÔNG đổi điểm nào. Cùng luật người duyệt (D15) với episode của lần nộp.
create or replace function english.eng_record_observed_support(
  p_attempt uuid,
  p_targets text[],
  p_kind text,
  p_note text,
  p_by uuid,
  p_client_id text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ep english.episodes%rowtype;
  v_act_targets text[];
  v_targets text[];
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_existing english.assistance_events%rowtype;
  v_id bigint;
  v_user uuid;
  v_urole text;
  v_family uuid;
begin
  if p_attempt is null or p_by is null then
    raise exception 'eng_record_observed_support: attempt and actor are required' using errcode = '22004';
  end if;
  if p_client_id is not null and (pg_catalog.length(p_client_id) < 8 or pg_catalog.length(p_client_id) > 100) then
    raise exception 'eng_record_observed_support: client_id must be 8..100 characters' using errcode = '22023';
  end if;

  select e.* into v_ep from english.episodes e where e.attempt_id = p_attempt for no key update;
  if not found then
    raise exception 'eng_record_observed_support: attempt not found' using errcode = 'P0002';
  end if;
  if english.eng_review_role(v_ep.id, p_by) is null then
    raise exception 'eng_record_observed_support: this member may not review this episode (D15)' using errcode = '42501';
  end if;

  if p_kind is null or p_kind not in ('tutor_prompt', 'frame', 'notes', 'model_answer', 'accessibility') then
    raise exception 'eng_record_observed_support: unknown kind' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 300 then
    raise exception 'eng_record_observed_support: the note is too long' using errcode = '22023';
  end if;

  select a.target_ids into v_act_targets
  from english.attempts at join english.activity_instances a on a.id = at.activity_instance_id
  where at.id = p_attempt;
  select coalesce(array_agg(k order by k), '{}') into v_targets from (select distinct k from unnest(coalesce(p_targets, '{}')) as k) s;
  if cardinality(v_targets) = 0 or not (v_targets <@ v_act_targets) then
    raise exception 'eng_record_observed_support: choose skills of this step' using errcode = '23514';
  end if;

  if p_client_id is not null then
    select s.* into v_existing from english.assistance_events s where s.attempt_id = p_attempt and s.client_id = p_client_id;
    if found then
      if v_existing.kind = p_kind and v_existing.recorded_by is not distinct from p_by
         and v_existing.affects_target_keys = v_targets and v_existing.note is not distinct from v_note then
        return pg_catalog.jsonb_build_object('id', v_existing.id, 'replayed', true);
      end if;
      raise exception 'eng_record_observed_support: client_id was already used for different support' using errcode = '23505';
    end if;
  end if;

  insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification, note, recorded_by, client_id)
  values (v_ep.learner_id, p_attempt, p_kind, null, v_targets, 'observed', v_note, p_by, p_client_id)
  returning id into v_id;

  select m.user_id, m.role, m.family_id into v_user, v_urole, v_family from english.members m where m.id = p_by;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_user, v_urole, 'review.support_observed', v_family, v_ep.learner_id,
          pg_catalog.jsonb_build_object('attempt', p_attempt, 'kind', p_kind));

  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- Bài làm NGOÀI app ------------------------------------------------------------------------------------------------------------------
-- Gia sư / phụ huynh nhập bài một bước đã mở của một em: 'tutor_live' (chỉ gia sư; bài làm ngay trong buổi, gia sư quan sát → episode
-- observed_directly) hoặc 'manual_import' (gia sư hoặc phụ huynh; bài trên giấy / ngoài app). Nội dung = chữ gõ / dán hoặc ghi chú ngắn
-- (≤ 20000 ký tự), kèm tùy chọn thời lượng và số từ. Không âm thanh. Luật đếm = của S4 (eng_attempt_slot + eng_record_attempt_effects).
-- Idempotent theo (em, client_id) như eng_submit_attempt.
create or replace function english.eng_record_offline_attempt(
  p_activity uuid,
  p_provenance text,
  p_text text,
  p_duration_sec int,
  p_word_count int,
  p_session_date date,
  p_assistance text[],
  p_by uuid,
  p_client_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_act english.activity_instances%rowtype;
  v_member english.members%rowtype;
  v_learner english.learners%rowtype;
  v_snapshot jsonb;
  v_assigned date;
  v_last_date date;
  v_assist text[];
  v_content jsonb;
  v_hash text;
  v_existing english.attempts%rowtype;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_no int;
  v_parent uuid;
  v_family uuid;
  v_first boolean;
  v_at timestamptz;
  v_item text;
  v_episode uuid;
  v_verification text;
begin
  if p_activity is null or p_by is null or p_client_id is null or p_session_date is null then
    raise exception 'eng_record_offline_attempt: activity, actor, client id and date are required' using errcode = '22004';
  end if;
  if p_provenance is null or p_provenance not in ('tutor_live', 'manual_import') then
    raise exception 'eng_record_offline_attempt: provenance must be tutor_live or manual_import' using errcode = '22023';
  end if;
  if p_text is null or pg_catalog.btrim(p_text) = '' or pg_catalog.length(p_text) > 20000 then
    raise exception 'eng_record_offline_attempt: the text must be 1 to 20000 characters' using errcode = '22023';
  end if;
  if p_duration_sec is not null and (p_duration_sec < 0 or p_duration_sec > 7200) then
    raise exception 'eng_record_offline_attempt: duration must be 0 to 7200 seconds' using errcode = '22023';
  end if;
  if p_word_count is not null and (p_word_count < 0 or p_word_count > 20000) then
    raise exception 'eng_record_offline_attempt: word count must be 0 to 20000' using errcode = '22023';
  end if;

  -- Gợi ý đã dùng: bắt buộc nói rõ. 'none' (không dùng gì) và 'unknown' (chưa rõ) đứng một mình.
  select coalesce(array_agg(distinct x order by x), '{}') into v_assist from unnest(p_assistance) as x;
  if cardinality(v_assist) = 0
     or not (v_assist <@ array['none', 'notes', 'dictionary', 'asked_someone', 'ai_outside', 'unknown'])
     or (('none' = any (v_assist) or 'unknown' = any (v_assist)) and cardinality(v_assist) > 1) then
    raise exception 'eng_record_offline_attempt: say which help was used (or none / unknown)' using errcode = '22023';
  end if;

  -- Khóa dòng bước: hai lần ghi cùng lúc xếp hàng; cùng khóa với eng_submit_attempt của học sinh.
  select a.* into v_act from english.activity_instances a where a.id = p_activity for no key update;
  if not found then
    raise exception 'eng_record_offline_attempt: activity not found' using errcode = 'P0002';
  end if;
  select * into v_learner from english.learners l where l.id = v_act.learner_id;
  select * into v_member from english.members m where m.id = p_by;

  if v_member.id is null or not english.eng_actor_may_manage(p_by, v_act.learner_id)
     or (p_provenance = 'tutor_live' and v_member.role <> 'tutor') then
    raise exception 'eng_record_offline_attempt: this member may not record this work' using errcode = '42501';
  end if;
  -- D15 cho bài ghi ngoài app (chặt hơn, phụ huynh có thể nới sau): bước kiểm tra trong buổi (purpose có checkpoint) hoặc bước nói trực
  -- tiếp với gia sư (ACT-SPEAK-LIVE) CHỈ gia sư còn quan hệ hiệu lực ghi được; bước nói trực tiếp chỉ nhận provenance 'tutor_live'.
  if (v_act.purpose @> array['checkpoint'] or v_act.activity_type = 'ACT-SPEAK-LIVE') and v_member.role <> 'tutor' then
    raise exception 'eng_record_offline_attempt: only a tutor may record this step (D15)' using errcode = '42501';
  end if;
  if v_act.activity_type = 'ACT-SPEAK-LIVE' and p_provenance <> 'tutor_live' then
    raise exception 'eng_record_offline_attempt: a live speaking step is recorded as tutor_live only' using errcode = '22023';
  end if;

  v_content := pg_catalog.jsonb_build_object('text', p_text, 'session_date', p_session_date)
    || case when p_duration_sec is not null then pg_catalog.jsonb_build_object('duration_sec', p_duration_sec) else '{}'::jsonb end
    || case when p_word_count is not null then pg_catalog.jsonb_build_object('word_count', p_word_count) else '{}'::jsonb end;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_content::text, 'UTF8')), 'hex');

  -- Gửi lại: cùng biên nhận.
  select t.* into v_existing from english.attempts t
  where t.learner_id = v_act.learner_id and t.client_submission_id = p_client_id;
  if found then
    if v_existing.activity_instance_id <> p_activity
       or v_existing.content_hash <> v_hash
       or v_existing.declared_assistance is distinct from v_assist
       or v_existing.provenance is distinct from p_provenance then
      raise exception 'eng_record_offline_attempt: client id was already used for a different record' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'attempt_id', v_existing.id, 'episode_id', (select e.id from english.episodes e where e.attempt_id = v_existing.id),
      'attempt_no', v_existing.attempt_no, 'submitted_at', v_existing.submitted_at, 'hash', v_existing.content_hash, 'replayed', true);
  end if;

  if not english.eng_activity_released(p_activity) then
    raise exception 'eng_record_offline_attempt: this step is not open (not yet due, or skipped)' using errcode = '23514';
  end if;

  select i.snapshot, (i.assigned_at at time zone 'Asia/Ho_Chi_Minh')::date into v_snapshot, v_assigned
  from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  if p_session_date > english.eng_today_vn() or p_session_date < v_assigned - 1 then
    raise exception 'eng_record_offline_attempt: the date must be from the day before the inquiry was assigned until today' using errcode = '23514';
  end if;
  -- Ngày của buổi phải khớp với bước: bước đã mở vào ngày đó (ngày hiệu lực của bước <= ngày ghi) ...
  if english.eng_step_effective_date(p_activity) > p_session_date then
    raise exception 'eng_record_offline_attempt: the step was not open on that date (step_not_open_on_date)' using errcode = '23514';
  end if;
  -- ... và không được lùi trước lần làm gần nhất của chính bước này (kể cả bài em nộp trong app): thứ tự lần làm phải theo thời gian thật,
  -- vì "≥ 14 ngày kể từ lần luyện gần nhất" và số lần dựa vào đó.
  select (max(t.submitted_at) at time zone 'Asia/Ho_Chi_Minh')::date into v_last_date from english.attempts t where t.activity_instance_id = p_activity;
  if v_last_date is not null and p_session_date < v_last_date then
    raise exception 'eng_record_offline_attempt: the date is earlier than the last recorded attempt of this step (date_before_last_attempt)' using errcode = '23514';
  end if;

  select s.o_no, s.o_parent, s.o_family, s.o_first into v_no, v_parent, v_family, v_first
  from english.eng_attempt_slot(p_activity, v_act.mode, v_id, 'eng_record_offline_attempt') s;
  v_at := english.eng_session_ts(p_session_date);

  insert into english.attempts(
    id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance,
    declared_assistance, submitted_at, content_hash, client_submission_id)
  values (v_id, p_activity, v_act.learner_id, v_no, v_parent, v_family, v_act.mode, p_provenance,
          v_assist, v_at, v_hash, p_client_id);

  insert into english.artifact_versions(attempt_id, learner_id, kind, version, content, is_raw, created_by)
  values (v_id, v_act.learner_id, 'text', 1, v_content, true, p_by);

  -- Hỗ trợ: gia sư thấy tận mắt trong buổi → 'observed'; bài trên giấy do người khác kể lại → 'declared'; chưa rõ → 'unknown'.
  v_verification := case when p_provenance = 'tutor_live' then 'observed' else 'declared' end;
  foreach v_item in array v_assist loop
    if v_item = 'unknown' then
      insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification, recorded_by)
      values (v_act.learner_id, v_id, 'external_declared', null, v_act.target_ids, 'unknown', p_by);
    elsif v_item <> 'none' then
      insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification, recorded_by)
      values (v_act.learner_id, v_id, case when v_item = 'notes' then 'notes' else 'external_declared' end,
              v_item, v_act.target_ids, v_verification, p_by);
    end if;
  end loop;

  perform english.eng_record_attempt_effects(
    v_id, v_act.learner_id, v_act.target_ids, v_act.purpose, v_snapshot -> 'template' ->> 'id', v_no, v_first, v_at,
    p_provenance = 'tutor_live');
  select e.id into v_episode from english.episodes e where e.attempt_id = v_id;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'attempt.recorded_offline', v_learner.family_id, v_act.learner_id,
          pg_catalog.jsonb_build_object('attempt', v_id, 'attempt_no', v_no, 'activity_instance', p_activity, 'provenance', p_provenance));

  return pg_catalog.jsonb_build_object(
    'attempt_id', v_id, 'episode_id', v_episode, 'attempt_no', v_no, 'submitted_at', v_at, 'hash', v_hash, 'replayed', false);
end
$$;

-- Ghi chú buổi học ----------------------------------------------------------------------------------------------------------------------
-- Chỉ GIA SƯ (còn quan hệ hiệu lực) viết. ≤ 3 việc tiếp theo. practised_target_ids phải thuộc track của em; mỗi kỹ năng MỚI được ghi
-- một dòng exposure_log (source = 'lesson') vào ngày của buổi. Sửa = bản mới trỏ supersedes_id (cùng người viết, bản hiện hành); các kỹ năng
-- đã ghi của bản trước KHÔNG bỏ được (lần tiếp xúc đã ghi là lịch sử, không rút lại).
create or replace function english.eng_write_lesson_note(
  p_learner uuid,
  p_session_date date,
  p_goals text,
  p_observed text,
  p_support_level text,
  p_next_actions text[],
  p_practised text[],
  p_published boolean,
  p_supersedes uuid,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_learner english.learners%rowtype;
  v_member english.members%rowtype;
  v_goals text := nullif(pg_catalog.btrim(coalesce(p_goals, '')), '');
  v_observed text := nullif(pg_catalog.btrim(coalesce(p_observed, '')), '');
  v_actions text[];
  v_practised text[];
  v_prev english.lesson_notes%rowtype;
  v_existing english.lesson_notes%rowtype;
  v_id uuid;
  v_new_targets text[];
  v_at timestamptz;
begin
  if p_learner is null or p_session_date is null or p_by is null or p_published is null or p_support_level is null then
    raise exception 'eng_write_lesson_note: learner, date, actor, support level and published are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_write_lesson_note: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if p_support_level not in ('none', 'light', 'moderate', 'heavy') then
    raise exception 'eng_write_lesson_note: unknown support level' using errcode = '22023';
  end if;

  select * into v_learner from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_write_lesson_note: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_write_lesson_note: only a tutor of this learner may write a lesson note' using errcode = '42501';
  end if;

  if p_session_date > english.eng_today_vn() or p_session_date < english.eng_today_vn() - 120 then
    raise exception 'eng_write_lesson_note: the session date must be within the last 120 days, not in the future' using errcode = '23514';
  end if;
  if (v_goals is not null and pg_catalog.length(v_goals) > 1000) or (v_observed is not null and pg_catalog.length(v_observed) > 2000) then
    raise exception 'eng_write_lesson_note: the text is too long' using errcode = '22023';
  end if;

  -- Việc tiếp theo: bỏ dòng trống, tối đa 3, mỗi việc 1..200 ký tự.
  select coalesce(array_agg(pg_catalog.btrim(x) order by o), '{}') into v_actions
  from unnest(coalesce(p_next_actions, '{}')) with ordinality as t(x, o)
  where pg_catalog.btrim(coalesce(x, '')) <> '';
  if cardinality(v_actions) > 3 or not english.eng_all_len_between(v_actions, 1, 200) then
    raise exception 'eng_write_lesson_note: at most 3 next actions of up to 200 characters' using errcode = '23514';
  end if;
  if v_goals is null and v_observed is null and cardinality(v_actions) = 0 then
    raise exception 'eng_write_lesson_note: write at least one of goals, what was observed, or a next action' using errcode = '23514';
  end if;

  -- Kỹ năng đã luyện: bỏ trùng (giữ thứ tự), phải thuộc track của em.
  select coalesce(array_agg(k order by mo), '{}') into v_practised
  from (select pg_catalog.btrim(x) as k, min(o) as mo
        from unnest(coalesce(p_practised, '{}')) with ordinality as t(x, o)
        where pg_catalog.btrim(coalesce(x, '')) <> '' group by pg_catalog.btrim(x)) s;
  if exists (
    select 1 from unnest(v_practised) k
    where not exists (select 1 from english.targets t where t.id = k and t.track_id = v_learner.track_id)) then
    raise exception 'eng_write_lesson_note: a practised skill is not a skill of this learner''s track' using errcode = '23514';
  end if;

  -- Gửi lại: cùng ghi chú.
  select n.* into v_existing from english.lesson_notes n where n.learner_id = p_learner and n.client_id = p_client_id;
  if found then
    if v_existing.tutor_member_id <> p_by or v_existing.session_date <> p_session_date
       or v_existing.goals is distinct from v_goals or v_existing.observed is distinct from v_observed
       or v_existing.support_level <> p_support_level or v_existing.next_actions <> v_actions
       or v_existing.practised_target_ids <> v_practised or v_existing.published <> p_published
       or v_existing.supersedes_id is distinct from p_supersedes then
      raise exception 'eng_write_lesson_note: client_id was already used for a different note' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'replayed', true);
  end if;

  if p_supersedes is not null then
    select n.* into v_prev from english.lesson_notes n where n.id = p_supersedes and n.learner_id = p_learner;
    if not found then
      raise exception 'eng_write_lesson_note: the note to replace was not found' using errcode = 'P0002';
    end if;
    if v_prev.tutor_member_id <> p_by then
      raise exception 'eng_write_lesson_note: only the author may edit a note' using errcode = '42501';
    end if;
    if not english.eng_lesson_note_is_current(p_supersedes) then
      raise exception 'eng_write_lesson_note: the note was already replaced by a newer version' using errcode = '23505';
    end if;
    if not (v_prev.practised_target_ids <@ v_practised) then
      raise exception 'eng_write_lesson_note: skills already logged as practised cannot be removed' using errcode = '23514';
    end if;
  end if;

  insert into english.lesson_notes(
    learner_id, tutor_member_id, session_date, goals, observed, support_level, next_actions,
    practised_target_ids, published, supersedes_id, client_id)
  values (p_learner, p_by, p_session_date, v_goals, v_observed, p_support_level, v_actions,
          v_practised, p_published, p_supersedes, p_client_id)
  returning id into v_id;

  -- Lần tiếp xúc cho kỹ năng MỚI của bản này (bản trước đã ghi phần còn lại).
  select coalesce(array_agg(k order by k), '{}') into v_new_targets
  from unnest(v_practised) k
  where p_supersedes is null or not (k = any (v_prev.practised_target_ids));
  if cardinality(v_new_targets) > 0 then
    v_at := english.eng_session_ts(p_session_date);
    insert into english.exposure_log(learner_id, target_key, at, source, attempt_id, lesson_note_id)
    select p_learner, k, v_at, 'lesson', null, v_id from unnest(v_new_targets) k;
  end if;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'lesson_note.written', v_learner.family_id, p_learner,
          pg_catalog.jsonb_build_object('note', v_id, 'published', p_published, 'supersedes', p_supersedes));

  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

revoke execute on function english.eng_record_review(uuid, text, smallint, boolean, jsonb, text, uuid, text) from public, anon, authenticated;
revoke execute on function english.eng_record_reviews(uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke execute on function english.eng_modify_decision(uuid, smallint, boolean, text, uuid, text) from public, anon, authenticated;
revoke execute on function english.eng_record_observed_support(uuid, text[], text, text, uuid, text) from public, anon, authenticated;
revoke execute on function english.eng_record_offline_attempt(uuid, text, text, int, int, date, text[], uuid, uuid) from public, anon, authenticated;
revoke execute on function english.eng_write_lesson_note(uuid, date, text, text, text, text[], text[], boolean, uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_record_review(uuid, text, smallint, boolean, jsonb, text, uuid, text) to service_role;
grant execute on function english.eng_record_reviews(uuid, jsonb, uuid, text) to service_role;
grant execute on function english.eng_modify_decision(uuid, smallint, boolean, text, uuid, text) to service_role;
grant execute on function english.eng_record_observed_support(uuid, text[], text, text, uuid, text) to service_role;
grant execute on function english.eng_record_offline_attempt(uuid, text, text, int, int, date, text[], uuid, uuid) to service_role;
grant execute on function english.eng_write_lesson_note(uuid, date, text, text, text, text[], text[], boolean, uuid, uuid, text) to service_role;

-- Đường ĐỌC của phụ huynh / gia sư (người gọi nhận diện bằng auth.uid(); học sinh và người ngoài nhận NULL / rỗng) -------------------
-- Hộp duyệt: mọi bài đã nộp (trong app hoặc ngoài app) của các em trong phạm vi, có ít nhất một kỹ năng chấm được. LỌC và PHÂN TRANG Ở ĐÂY
-- (không cắt cứng rồi lọc ở route): bộ lọc 'todo' (mặc định = chưa duyệt xong hết kỹ năng) / 'tutor' / 'independent' / 'baseline' /
-- 'practice' (cũng chỉ bài chưa duyệt xong) / 'done' (đã duyệt xong); cũ nhất lên đầu; con trỏ (p_after_at, p_after_id) = dòng cuối của trang
-- trước. Trả {items, next, counts}: next = null khi hết; counts = số bài của TỪNG bộ lọc + to_decide (chưa duyệt xong và người gọi được duyệt).
-- p_allow_real = false → chỉ em THỬ (ALLOW_REAL_LEARNERS=false trên preview).
create or replace function english.eng_review_inbox(
  p_allow_real boolean default false,
  p_filter text default 'todo',
  p_limit int default 50,
  p_after_at timestamptz default null,
  p_after_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_me uuid := english.eng_current_member_id();
begin
  if p_filter is null or p_filter not in ('todo', 'tutor', 'independent', 'baseline', 'practice', 'done') then
    raise exception 'eng_review_inbox: unknown filter' using errcode = '22023';
  end if;
  if (p_after_at is null) <> (p_after_id is null) then
    raise exception 'eng_review_inbox: the cursor needs both a time and an id' using errcode = '22023';
  end if;

  return (
    with base as (
      select e.id as episode_id, at.submitted_at,
        x.total, x.decided,
        (x.decided >= x.total) as is_done,
        case
          when x.restricted then 'tutor'
          when coalesce((e.facets ->> 'baseline')::boolean, false) then 'baseline'
          when a.mode = 'INDEPENDENT_CHECK' then 'independent'
          else 'practice' end as category,
        english.eng_review_role(e.id, v_me) is not null as can_decide,
        pg_catalog.jsonb_build_object(
          'episode_id', e.id,
          'attempt_id', at.id,
          'learner_id', l.id,
          'alias', l.alias,
          'is_test', l.is_test,
          'title_vi', i.snapshot -> 'template' ->> 'title_vi',
          'step_no', a.step_no,
          'activity_type', a.activity_type,
          'mode', a.mode,
          'purpose', pg_catalog.to_jsonb(a.purpose),
          'provenance', at.provenance,
          'attempt_no', at.attempt_no,
          'is_first_attempt', e.is_first_attempt,
          'submitted_at', at.submitted_at,
          'restricted', x.restricted,
          'targets_total', x.total,
          'targets_decided', x.decided) as obj
      from english.episodes e
      join english.learners l on l.id = e.learner_id
      join english.attempts at on at.id = e.attempt_id
      join english.activity_instances a on a.id = at.activity_instance_id
      join english.inquiry_instances i on i.id = a.inquiry_instance_id
      cross join lateral (
        select count(*) filter (where t.scorable)::int as total,
               count(*) filter (where t.scorable and exists (
                 select 1 from english.validation_decisions d
                 where d.episode_id = e.id and d.target_key = t.target_key and d.supersedes_id is null))::int as decided,
               (coalesce((e.facets ->> 'checkpoint')::boolean, false) or e.observed_directly) as restricted
        from english.eng_episode_targets(e.id) t
      ) x
      where english.eng_is_staff_of(e.learner_id)
        and (p_allow_real or l.is_test)
        and x.total > 0
    ),
    counts as (
      select pg_catalog.jsonb_build_object(
        'todo', count(*) filter (where not b.is_done),
        'tutor', count(*) filter (where not b.is_done and b.category = 'tutor'),
        'independent', count(*) filter (where not b.is_done and b.category = 'independent'),
        'baseline', count(*) filter (where not b.is_done and b.category = 'baseline'),
        'practice', count(*) filter (where not b.is_done and b.category = 'practice'),
        'done', count(*) filter (where b.is_done),
        'to_decide', count(*) filter (where not b.is_done and b.can_decide)) as c
      from base b
    ),
    picked as (
      select b.*
      from base b
      where (case p_filter
               when 'done' then b.is_done
               when 'todo' then not b.is_done
               else not b.is_done and b.category = p_filter end)
        and (p_after_at is null or (b.submitted_at, b.episode_id) > (p_after_at, p_after_id))
      order by b.submitted_at, b.episode_id
      limit v_limit + 1
    ),
    page as (
      select p.*, row_number() over (order by p.submitted_at, p.episode_id) as rn from picked p
    )
    select pg_catalog.jsonb_build_object(
      'items', coalesce((select pg_catalog.jsonb_agg(
                           pg_catalog.jsonb_build_object('category', p.category, 'can_decide', p.can_decide) || p.obj
                           order by p.rn)
                         from page p where p.rn <= v_limit), '[]'::jsonb),
      'next', (select pg_catalog.jsonb_build_object('at', p.submitted_at, 'id', p.episode_id)
               from page p where p.rn = v_limit and exists (select 1 from page q where q.rn = v_limit + 1)),
      'counts', (select c from counts))
  );
end
$$;

-- Một bài để duyệt: bài làm gốc, đề, kết quả máy chấm, khóa đáp án / ý chính / kịch bản (chỉ hiện từ khi em đã làm), rubric từng kỹ năng,
-- quyết định hiện hành + lịch sử, hỗ trợ đã khai báo / quan sát được. NULL nếu không phải phụ huynh / gia sư của em này.
create or replace function english.eng_review_episode(p_episode uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_e english.episodes%rowtype;
  v_at english.attempts%rowtype;
  v_a english.activity_instances%rowtype;
  v_i english.inquiry_instances%rowtype;
  v_l english.learners%rowtype;
  v_me english.members%rowtype;
  v_step jsonb;
  v_desc text;
  v_restricted boolean;
begin
  select e.* into v_e from english.episodes e where e.id = p_episode;
  if not found or not english.eng_is_staff_of(v_e.learner_id) then
    return null;
  end if;
  select * into v_at from english.attempts t where t.id = v_e.attempt_id;
  select * into v_a from english.activity_instances a where a.id = v_at.activity_instance_id;
  select * into v_i from english.inquiry_instances i where i.id = v_a.inquiry_instance_id;
  select * into v_l from english.learners l where l.id = v_e.learner_id;
  select * into v_me from english.members m where m.id = english.eng_current_member_id();
  v_desc := v_i.snapshot -> 'template' ->> 'descriptor_version';
  v_restricted := coalesce((v_e.facets ->> 'checkpoint')::boolean, false) or v_e.observed_directly;
  select x into v_step from pg_catalog.jsonb_array_elements(v_i.snapshot -> 'steps') as x
  where (x ->> 'step_no')::int = v_a.step_no;

  return pg_catalog.jsonb_build_object(
    'episode', pg_catalog.jsonb_build_object(
      'id', v_e.id,
      'is_first_attempt', v_e.is_first_attempt,
      'observed_directly', v_e.observed_directly,
      'facets', v_e.facets,
      'restricted', v_restricted),
    'learner', pg_catalog.jsonb_build_object('id', v_l.id, 'alias', v_l.alias, 'track_id', v_l.track_id, 'is_test', v_l.is_test),
    'viewer', pg_catalog.jsonb_build_object(
      'role', v_me.role,
      'can_decide', english.eng_review_role(v_e.id, v_me.id) is not null,
      'restricted', v_restricted),
    'attempt', pg_catalog.jsonb_build_object(
      'id', v_at.id,
      'attempt_no', v_at.attempt_no,
      'mode', v_at.mode,
      'provenance', v_at.provenance,
      'submitted_at', v_at.submitted_at,
      'declared_assistance', pg_catalog.to_jsonb(v_at.declared_assistance),
      'recorded_by_name', (select m.display_name from english.artifact_versions av
                           join english.members m on m.id = av.created_by
                           where av.attempt_id = v_at.id and v_at.provenance in ('tutor_live', 'manual_import')
                           order by av.version limit 1)),
    'artifact', (select pg_catalog.jsonb_build_object('kind', av.kind, 'content', av.content, 'is_raw', av.is_raw)
                 from english.artifact_versions av where av.attempt_id = v_at.id order by av.version limit 1),
    'activity', pg_catalog.jsonb_build_object(
      'id', v_a.id, 'step_no', v_a.step_no, 'activity_type', v_a.activity_type, 'mode', v_a.mode,
      'purpose', pg_catalog.to_jsonb(v_a.purpose), 'time_min', (v_step ->> 'time_min')::int),
    'inquiry', pg_catalog.jsonb_build_object(
      'id', v_i.id,
      'title_vi', v_i.snapshot -> 'template' ->> 'title_vi',
      'big_question_en', v_i.snapshot -> 'template' ->> 'big_question_en',
      'big_question_vi', v_i.snapshot -> 'template' ->> 'big_question_vi'),
    'step', pg_catalog.jsonb_build_object(
      'prompt_en', v_step ->> 'prompt_en',
      'items', (select coalesce(pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object('id', x ->> 'id', 'kind', x ->> 'kind', 'stem', x ->> 'stem',
                                                'options', coalesce(x -> 'options', '[]'::jsonb))
                  order by o), '[]'::jsonb)
                from pg_catalog.jsonb_array_elements(coalesce(v_step -> 'items', '[]'::jsonb)) with ordinality as t(x, o))),
    'sources', (select coalesce(pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object('id', s.id, 'title', s.title, 'modality', s.modality) order by ss.position, s.id), '[]'::jsonb)
                from english.template_step_sources ss
                join english.sources s on s.id = ss.source_id and s.version = ss.source_version
                where ss.template_id = v_i.template_id and ss.template_version = v_i.template_version and ss.step_no = v_a.step_no),
    'auto_checks', (select c.checks from english.attempt_auto_checks c where c.attempt_id = v_at.id),
    'keys', (select coalesce(pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object('item_id', k.item_id, 'kind', k.kind, 'answer', k.answer, 'explanation_vi', k.explanation_vi)
               order by k.item_id), '[]'::jsonb)
             from english.instance_item_keys k where k.inquiry_instance_id = v_i.id and k.step_no = v_a.step_no),
    'assistance', (select coalesce(pg_catalog.jsonb_agg(
                     pg_catalog.jsonb_build_object(
                       'id', s.id, 'kind', s.kind, 'detail', s.detail, 'verification', s.verification,
                       'affects', pg_catalog.to_jsonb(s.affects_target_keys), 'at', s.at, 'note', s.note,
                       'by_name', m.display_name)
                     order by s.at, s.id), '[]'::jsonb)
                   from english.assistance_events s
                   left join english.members m on m.id = s.recorded_by
                   where s.attempt_id = v_at.id),
    'targets', (select coalesce(pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'key', t.target_key,
                    'is_target', t.is_target,
                    'scorable', t.scorable,
                    'locked_reason', case when not t.is_target then 'not_a_skill'
                                          when not t.scorable then 'needs_live' else null end,
                    'title_vi', tg.title_vi,
                    'dimension', case when dm.id is null then null else
                      pg_catalog.jsonb_build_object('id', dm.id, 'name_vi', dm.name_vi, 'rubric_vi', dm.rubric_vi) end,
                    'criteria', coalesce((select pg_catalog.jsonb_agg(
                                  pg_catalog.jsonb_build_object(
                                    'id', c ->> 'id', 'check_vi', c ->> 'check_vi', 'method', c ->> 'method',
                                    'computable', coalesce((c ->> 'computable')::boolean, false))
                                  order by co)
                                from pg_catalog.jsonb_array_elements(tg.success_criteria) with ordinality as cc(c, co)), '[]'::jsonb),
                    'opportunity_rule', tg.opportunity_rule,
                    'decisions', (select coalesce(pg_catalog.jsonb_agg(
                                    pg_catalog.jsonb_build_object(
                                      'id', d.id,
                                      'decision', d.decision,
                                      'final_score', d.final_score,
                                      'final_not_observed', d.final_not_observed,
                                      'validator_role', d.validator_role,
                                      'validator_name', vm.display_name,
                                      'reason', d.reason,
                                      'supersedes_id', d.supersedes_id,
                                      'at', d.created_at,
                                      'current', not exists (select 1 from english.validation_decisions d2 where d2.supersedes_id = d.id),
                                      'criteria_results', o.criteria_results,
                                      'rationale', o.rationale,
                                      'blind', o.blind)
                                    order by d.created_at, d.id), '[]'::jsonb)
                                  from english.validation_decisions d
                                  left join english.observations o on o.id = d.observation_id
                                  left join english.members vm on vm.id = d.validator_member_id
                                  where d.episode_id = v_e.id and d.target_key = t.target_key))
                  order by t.ord), '[]'::jsonb)
                from english.eng_episode_targets(v_e.id) t
                left join english.targets tg on tg.id = t.target_key and tg.descriptor_version = v_desc
                left join english.dimensions dm on dm.id = tg.dimension_id and dm.catalogue_version = tg.catalogue_version),
    'tech', pg_catalog.jsonb_build_object(
      'template_id', v_i.template_id,
      'template_version', v_i.template_version,
      'catalogue_version', v_i.snapshot -> 'template' ->> 'catalogue_version',
      'descriptor_version', v_desc,
      'policy_version', v_i.snapshot -> 'template' ->> 'assessment_policy_version')
  );
end
$$;

revoke execute on function english.eng_review_inbox(boolean, text, int, timestamptz, uuid) from public, anon, service_role;
revoke execute on function english.eng_review_episode(uuid) from public, anon, service_role;
grant execute on function english.eng_review_inbox(boolean, text, int, timestamptz, uuid) to authenticated;
grant execute on function english.eng_review_episode(uuid) to authenticated;

-- Purge: thêm các bảng của S5. Thân hàm = bản của 0009 + các dòng S5 (chỉ THÊM dòng, không bỏ dòng nào; có test đối chiếu từng dòng).
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

-- RLS ---------------------------------------------------------------------------------------------------------------------------------
alter table english.observations enable row level security;
alter table english.validation_decisions enable row level security;
alter table english.lesson_notes enable row level security;

-- Điểm và quyết định: CHỈ phụ huynh / gia sư trong phạm vi (có mã kỹ năng bên trong). Học sinh: không bao giờ.
drop policy if exists observations_select on english.observations;
create policy observations_select on english.observations
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

drop policy if exists validation_decisions_select on english.validation_decisions;
create policy validation_decisions_select on english.validation_decisions
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- Ghi chú buổi học: gia sư của em đọc mọi bản; phụ huynh chỉ đọc bản ĐÃ công bố và còn hiện hành. Học sinh: không.
drop policy if exists lesson_notes_select on english.lesson_notes;
create policy lesson_notes_select on english.lesson_notes
  for select to authenticated
  using (
    english.eng_is_staff_of(learner_id)
    and (english.eng_member_role() = 'tutor' or (published and english.eng_lesson_note_is_current(id)))
  );

-- Học sinh KHÔNG đọc được bài do gia sư / phụ huynh ghi giúp (tutor_live, manual_import): chữ của người lớn ghi lại, hỗ trợ họ quan sát,
-- người ghi. Học sinh chỉ thấy bài CỦA MÌNH (in_app, pasted) qua REST; bài ghi ngoài app chỉ hiện cho em như một trạng thái trung tính
-- "đã làm cùng thầy/cô / trên giấy" (eng_my_home / eng_my_activity trả số lần và loại, không có chữ). Phụ huynh / gia sư đọc như cũ.
-- (Thay chính sách của 0009; 0009 giữ nguyên.)
drop policy if exists attempts_select on english.attempts;
create policy attempts_select on english.attempts
  for select to authenticated
  using (
    english.eng_can_read_learner(learner_id)
    and (provenance in ('in_app', 'pasted') or english.eng_is_staff_of(learner_id))
  );

drop policy if exists artifact_versions_select on english.artifact_versions;
create policy artifact_versions_select on english.artifact_versions
  for select to authenticated
  using (
    english.eng_can_read_learner(learner_id)
    and (
      english.eng_is_staff_of(learner_id)
      or exists (select 1 from english.attempts t where t.id = attempt_id and t.provenance in ('in_app', 'pasted'))
    )
  );

-- Grant theo từng bảng (không dùng "on all tables") ------------------------------------------------------------------------------------
grant select on english.observations, english.validation_decisions, english.lesson_notes to authenticated;

-- Ghi chỉ qua các hàm security definer ở trên (và migration, chủ sở hữu).
revoke insert, update, delete, truncate on english.observations, english.validation_decisions, english.lesson_notes
  from public, anon, authenticated, service_role;
revoke all on english.observations, english.validation_decisions, english.lesson_notes from anon;

insert into english.schema_migrations(version) values ('0010') on conflict do nothing;
