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

-- 4. Ghi ------------------------------------------------------------------------------------------------------------------------------
-- Xác nhận cấp khởi điểm (baseline, 1..7 mảng một lần) hoặc điều chỉnh (adjust, đúng 1 mảng, bắt buộc lý do). CHỈ gia sư còn quan hệ
-- hiệu lực với em (kiểu D15; phụ huynh xem, không ghi). level_up không đi qua đây (S7: xác nhận đề xuất). Cấp cũ (from_level) do hàm
-- tính: dòng gần nhất của mảng, chưa có thì cấp giả định của track. Gửi lại cùng client_id + cùng nội dung = trả lại (replayed).
create or replace function english.eng_record_level(
  p_learner uuid,
  p_kind text,
  p_levels jsonb,
  p_reason text,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_map english.skill_maps%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_n int;
  v_policy text;
  v_item record;
  v_prev english.level_decisions%rowtype;
  v_from text;
  v_new jsonb;
  v_old jsonb;
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  if p_learner is null or p_kind is null or p_levels is null or p_by is null or p_client_id is null then
    raise exception 'eng_record_level: learner, kind, levels, actor and client id are required' using errcode = '22004';
  end if;
  if p_kind = 'level_up' then
    raise exception 'eng_record_level: a level-up is confirmed from a proposal, not recorded here (level_up_reserved)' using errcode = '22023';
  end if;
  if p_kind not in ('baseline', 'adjust') then
    raise exception 'eng_record_level: kind must be baseline or adjust (bad_level)' using errcode = '22023';
  end if;
  -- Khóa dòng em: hai lần ghi cùng lúc xếp hàng (một mảng không thể được xác nhận hai lần).
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_record_level: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_record_level: only a tutor of this learner records levels (tutor_only)' using errcode = '42501';
  end if;
  if v_reason is not null and pg_catalog.length(v_reason) > 300 then
    raise exception 'eng_record_level: the reason is too long (reason_too_long)' using errcode = '22023';
  end if;
  if p_kind = 'adjust' and v_reason is null then
    raise exception 'eng_record_level: an adjustment needs a reason (reason_required)' using errcode = '23514';
  end if;
  if pg_catalog.jsonb_typeof(p_levels) <> 'object' then
    raise exception 'eng_record_level: levels must be {domain: level} (bad_level)' using errcode = '22023';
  end if;
  select pg_catalog.count(*)::int into v_n from pg_catalog.jsonb_object_keys(p_levels);
  if v_n not between 1 and 7 or (p_kind = 'adjust' and v_n <> 1) then
    raise exception 'eng_record_level: a baseline names 1 to 7 domains, an adjustment exactly one (bad_level)' using errcode = '22023';
  end if;
  select * into v_map from english.skill_maps m where m.published_at is not null order by m.published_at desc, m.id desc limit 1;
  if not found then
    raise exception 'eng_record_level: no published skill map' using errcode = 'P0002';
  end if;
  -- Mỗi khóa là một mảng của bản đồ; mỗi giá trị là một nấc của THANG CỦA MẢNG ĐÓ.
  if exists (
    select 1 from pg_catalog.jsonb_each(p_levels) x
    left join english.skill_domains d on d.map_id = v_map.id and d.key = x.key
    where d.key is null
       or pg_catalog.jsonb_typeof(x.value) <> 'string'
       or (d.scale = 'cefr' and (x.value #>> '{}') not in ('A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2'))
       or (d.scale = 'task_level' and (x.value #>> '{}') not in ('1', '2', '3', '4'))) then
    raise exception 'eng_record_level: each domain needs a level of its own scale (bad_level)' using errcode = '22023';
  end if;

  -- Gửi lại (mạng chập chờn): cùng client_id + cùng nội dung + cùng người → trả lại các dòng cũ.
  select pg_catalog.jsonb_object_agg(x.key, x.value #>> '{}') into v_new from pg_catalog.jsonb_each(p_levels) x;
  if exists (select 1 from english.level_decisions d where d.learner_id = p_learner and d.client_id = p_client_id) then
    select pg_catalog.jsonb_object_agg(d.domain_key, d.to_level) into v_old
    from english.level_decisions d where d.learner_id = p_learner and d.client_id = p_client_id;
    if v_old = v_new and not exists (
      select 1 from english.level_decisions d
      where d.learner_id = p_learner and d.client_id = p_client_id
        and (d.kind <> p_kind or d.decided_by_member <> p_by or d.reason is distinct from v_reason)) then
      return pg_catalog.jsonb_build_object(
        'ids', (select pg_catalog.jsonb_agg(d.id order by d.domain_key) from english.level_decisions d where d.learner_id = p_learner and d.client_id = p_client_id),
        'replayed', true);
    end if;
    raise exception 'eng_record_level: this client id was already used for other levels' using errcode = '23505';
  end if;

  -- Chính sách đánh giá của bộ kỹ năng hiện tại của em (để S7 đọc lại; NULL nếu em chưa có bộ kỹ năng).
  select c.assessment_policy_version into v_policy
  from english.target_sets ts
  join english.target_set_definitions d on d.id = ts.definition_id
  join english.catalogue_versions c on c.version = d.catalogue_version
  where ts.learner_id = p_learner
  order by ts.effective_from desc, ts.seq desc
  limit 1;

  for v_item in select x.key, x.value #>> '{}' as lvl from pg_catalog.jsonb_each(p_levels) x order by x.key loop
    select * into v_prev from english.level_decisions d
    where d.learner_id = p_learner and d.domain_key = v_item.key
    order by d.decided_at desc, d.id desc
    limit 1;
    if p_kind = 'baseline' and v_prev.id is not null then
      raise exception 'eng_record_level: this domain was already confirmed; adjust it instead (already_confirmed)' using errcode = '23505';
    end if;
    if p_kind = 'adjust' and v_prev.id is null then
      raise exception 'eng_record_level: confirm the starting level of this domain first (needs_baseline)' using errcode = '23514';
    end if;
    v_from := coalesce(v_prev.to_level, v_map.assumed -> v_l.track_id ->> v_item.key);
    if v_from is null then
      raise exception 'eng_record_level: the map has no assumed level for this track' using errcode = 'P0002';
    end if;
    if p_kind = 'adjust' and v_from = v_item.lvl then
      raise exception 'eng_record_level: the new level is the current one (same_level)' using errcode = '23514';
    end if;
    insert into english.level_decisions(learner_id, domain_key, map_id, from_level, to_level, kind, reason, evidence, policy_version,
                                        decided_by_member, decided_role, client_id)
    values (p_learner, v_item.key, v_map.id, v_from, v_item.lvl, p_kind, v_reason,
            pg_catalog.jsonb_build_object(
              'basis', 'tutor_judgement',
              'assumed_level', v_map.assumed -> v_l.track_id ->> v_item.key,
              'latest_external_result_id', (
                select e.id from english.external_results e
                where e.learner_id = p_learner and v_item.key = any (e.domains)
                  and not exists (select 1 from english.external_results s where s.supersedes_id = e.id)
                order by e.taken_on desc, e.recorded_at desc limit 1)),
            v_policy, p_by, 'tutor', p_client_id)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'level.recorded', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('kind', p_kind, 'map_id', v_map.id,
                                        'domains', (select pg_catalog.jsonb_agg(k order by k) from pg_catalog.jsonb_object_keys(p_levels) k)));
  return pg_catalog.jsonb_build_object('ids', pg_catalog.to_jsonb(v_ids), 'replayed', false);
end
$$;

-- Một kết quả thi ngoài (gia sư hoặc phụ huynh của em). File kèm (nếu có) đã được máy chủ kiểm có thật trong kho trước khi gọi;
-- hàm ghi dòng files loại 'external_result' (đường dẫn tính từ id). Mốc ngoài KHÔNG đổi cấp.
-- Sửa một kết quả = ghi dòng MỚI có p_supersedes (dòng cũ của chính em này, chưa bị thay): không xóa, không sửa dòng cũ.
create or replace function english.eng_record_external_result(
  p_learner uuid,
  p_exam text,
  p_taken_on date,
  p_score_text text,
  p_domains text[],
  p_note text,
  p_file jsonb,
  p_by uuid,
  p_client_id text,
  p_supersedes uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_today date := english.eng_today_vn();
  v_score text := pg_catalog.btrim(coalesce(p_score_text, ''));
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_domains text[];
  v_has_file boolean := p_file is not null and p_file <> 'null'::jsonb;
  v_old english.external_results%rowtype;
  v_file uuid;
  v_id uuid;
  v_target english.external_results%rowtype;
begin
  if p_learner is null or p_exam is null or p_taken_on is null or p_domains is null or p_by is null or p_client_id is null then
    raise exception 'eng_record_external_result: learner, exam, date, domains, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_record_external_result: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_record_external_result: this member may not record results for this learner' using errcode = '42501';
  end if;
  if p_exam not in ('KET', 'PET', 'FCE', 'CAE', 'CPE', 'VAO10_MOCK', 'SCHOOL', 'OTHER') then
    raise exception 'eng_record_external_result: unknown exam (bad_exam)' using errcode = '22023';
  end if;
  if p_taken_on > v_today or p_taken_on < v_today - 3660 then
    raise exception 'eng_record_external_result: the date must be today or earlier, within 10 years (bad_date)' using errcode = '23514';
  end if;
  if pg_catalog.length(v_score) not between 1 and 60 then
    raise exception 'eng_record_external_result: the score must be 1 to 60 characters' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 300 then
    raise exception 'eng_record_external_result: the note is too long (note_too_long)' using errcode = '22023';
  end if;
  if pg_catalog.cardinality(p_domains) = 0 or exists (
    select 1 from unnest(p_domains) d
    where d is null or d not in ('grammar', 'vocab', 'reading', 'listening', 'writing', 'speaking', 'thinking')) then
    raise exception 'eng_record_external_result: name 1 to 7 known domains (bad_domains)' using errcode = '22023';
  end if;
  v_domains := array(select distinct d from unnest(p_domains) d order by d);

  select * into v_old from english.external_results e where e.learner_id = p_learner and e.client_id = p_client_id;
  if found then
    if v_old.exam = p_exam and v_old.taken_on = p_taken_on and v_old.score_text = v_score and v_old.domains = v_domains
       and v_old.note is not distinct from v_note and v_old.recorded_by_member = p_by
       and v_old.supersedes_id is not distinct from p_supersedes
       and v_old.file_id::text is not distinct from (case when v_has_file then pg_catalog.lower(p_file ->> 'id') end) then
      return pg_catalog.jsonb_build_object('id', v_old.id, 'replayed', true);
    end if;
    raise exception 'eng_record_external_result: this client id was already used for another result' using errcode = '23505';
  end if;

  -- Sửa: dòng cũ phải là của chính em này và chưa bị thay (gửi lại cùng client_id đã trả ở trên, nên không vướng chỗ này).
  if p_supersedes is not null then
    select * into v_target from english.external_results e where e.id = p_supersedes and e.learner_id = p_learner;
    if not found then
      raise exception 'eng_record_external_result: the result to correct was not found (not_found)' using errcode = 'P0002';
    end if;
    if exists (select 1 from english.external_results s where s.supersedes_id = p_supersedes) then
      raise exception 'eng_record_external_result: this result was already corrected (already_superseded)' using errcode = '23505';
    end if;
  end if;

  if v_has_file then
    v_file := english.eng_register_file(v_l.family_id, p_learner, 'external_result', p_file, p_by);
  end if;
  insert into english.external_results(learner_id, exam, taken_on, score_text, domains, file_id, note, recorded_by_member, recorded_role,
                                       supersedes_id, client_id)
  values (p_learner, p_exam, p_taken_on, v_score, v_domains, v_file, v_note, p_by, v_member.role, p_supersedes, p_client_id)
  returning id into v_id;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role,
          case when p_supersedes is null then 'external_result.recorded' else 'external_result.corrected' end, v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('result_id', v_id, 'exam', p_exam, 'domains', pg_catalog.to_jsonb(v_domains), 'has_file', v_file is not null)
            || case when p_supersedes is null then '{}'::jsonb else pg_catalog.jsonb_build_object('supersedes_id', p_supersedes) end);
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

revoke execute on function english.eng_record_level(uuid, text, jsonb, text, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_record_level(uuid, text, jsonb, text, uuid, text) to service_role;
revoke execute on function english.eng_record_external_result(uuid, text, date, text, text[], text, jsonb, uuid, text, uuid) from public, anon, authenticated;
grant execute on function english.eng_record_external_result(uuid, text, date, text, text[], text, jsonb, uuid, text, uuid) to service_role;

-- 5. Đọc ------------------------------------------------------------------------------------------------------------------------------
-- Hồ sơ cấp của một em (gia sư / phụ huynh; máy chủ gọi sau requireAccess). Cấp hiện tại = dòng gần nhất của mảng, chưa có thì cấp giả
-- định của track (status 'assumed'). Báo cáo kỹ năng đọc tháng hiện như mốc ngoài của mảng Đọc: chỉ tháng + số kỹ năng, KHÔNG tên nguồn.
create or replace function english.eng_level_profile(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_map english.skill_maps%rowtype;
begin
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_level_profile: learner not found' using errcode = 'P0002';
  end if;
  select * into v_map from english.skill_maps m where m.published_at is not null order by m.published_at desc, m.id desc limit 1;
  if not found then
    raise exception 'eng_level_profile: no published skill map' using errcode = 'P0002';
  end if;

  return (
    with latest as (
      select distinct on (d.domain_key) d.*
      from english.level_decisions d
      where d.learner_id = p_learner
      order by d.domain_key, d.decided_at desc, d.id desc
    ),
    ext as (
      select distinct on (x.dk) x.dk, e.id, e.exam, e.taken_on, e.score_text
      from english.external_results e
      cross join lateral unnest(e.domains) as x(dk)
      where e.learner_id = p_learner
        and not exists (select 1 from english.external_results s where s.supersedes_id = e.id)
      order by x.dk, e.taken_on desc, e.recorded_at desc
    )
    select pg_catalog.jsonb_build_object(
      'map_id', v_map.id,
      'track_id', v_l.track_id,
      'domains', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'key', dm.key, 'name_vi', dm.name_vi, 'scale', dm.scale, 'ord', dm.ord,
            'assumed_level', v_map.assumed -> v_l.track_id ->> dm.key,
            'current_level', coalesce(lt.to_level, v_map.assumed -> v_l.track_id ->> dm.key),
            'status', case when lt.id is null then 'assumed' else 'confirmed' end,
            'last_kind', lt.kind,
            'decided_at', lt.decided_at,
            'decided_by_name', mb.display_name,
            'external', case when ex.id is null then null
                             else pg_catalog.jsonb_build_object('id', ex.id, 'exam', ex.exam, 'taken_on', ex.taken_on, 'score_text', ex.score_text) end)
          order by dm.ord)
        from english.skill_domains dm
        left join latest lt on lt.domain_key = dm.key
        left join english.members mb on mb.id = lt.decided_by_member
        left join ext ex on ex.dk = dm.key
        where dm.map_id = v_map.id),
      'history', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', h.id, 'domain_key', h.domain_key, 'from_level', h.from_level, 'to_level', h.to_level, 'kind', h.kind,
            'reason', h.reason, 'decided_at', h.decided_at, 'decided_by_name', hm.display_name)
          order by h.decided_at desc, h.id desc)
        from (select * from english.level_decisions d where d.learner_id = p_learner order by d.decided_at desc, d.id desc limit 30) h
        left join english.members hm on hm.id = h.decided_by_member), '[]'::jsonb),
      'external_results', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', e.id, 'exam', e.exam, 'taken_on', e.taken_on, 'score_text', e.score_text, 'domains', pg_catalog.to_jsonb(e.domains),
            'note', e.note, 'file_id', e.file_id, 'recorded_by_name', em.display_name, 'recorded_role', e.recorded_role, 'recorded_at', e.recorded_at,
            -- sửa = dòng mới thay dòng cũ: chỉ dòng còn hiệu lực được liệt kê; dòng cũ hiện kèm ("đã sửa", điểm cũ, phiếu cũ)
            'replaces', case when old.id is null then null
                             else pg_catalog.jsonb_build_object('id', old.id, 'exam', old.exam, 'taken_on', old.taken_on,
                                                                'score_text', old.score_text, 'file_id', old.file_id) end)
          order by e.taken_on desc, e.recorded_at desc)
        from (select * from english.external_results x
              where x.learner_id = p_learner and not exists (select 1 from english.external_results s where s.supersedes_id = x.id)
              order by x.taken_on desc, x.recorded_at desc limit 30) e
        left join english.members em on em.id = e.recorded_by_member
        left join english.external_results old on old.id = e.supersedes_id), '[]'::jsonb),
      'reading_reports', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('month', rr.month, 'skills', pg_catalog.jsonb_array_length(rr.rows))
                                    order by rr.month desc, rr.recorded_at desc)
        from (select * from english.reading_reports x
              where x.learner_id = p_learner and not exists (select 1 from english.reading_reports x2 where x2.supersedes_id = x.id)
              order by x.month desc, x.recorded_at desc limit 6) rr), '[]'::jsonb)
    )
  );
end
$$;

-- "Thay đổi cấp gần đây" (trang chủ phụ huynh): quyết định cấp của một em trong p_days ngày qua (1..365), mới nhất trước, tối đa 10.
create or replace function english.eng_recent_level_changes(p_learner uuid, p_days int) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('changes', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', d.id, 'domain_key', d.domain_key, 'domain_name', dm.name_vi, 'scale', dm.scale,
        'from_level', d.from_level, 'to_level', d.to_level, 'kind', d.kind, 'reason', d.reason,
        'decided_at', d.decided_at, 'decided_by_name', m.display_name)
      order by d.decided_at desc, d.id desc)
    from (select * from english.level_decisions x
          where x.learner_id = p_learner
            and x.decided_at >= pg_catalog.now() - pg_catalog.make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
          order by x.decided_at desc, x.id desc
          limit 10) d
    left join english.skill_domains dm on dm.map_id = d.map_id and dm.key = d.domain_key
    left join english.members m on m.id = d.decided_by_member), '[]'::jsonb))
$$;

-- "Việc cần ôn" theo mảng cho trang chủ của EM: tối đa 3 điểm đã đến hạn hỏi lại (thứ tự của "Điểm cần chú ý": nặng trước), mỗi điểm chỉ
-- tên và tên mảng. Người gọi nhận diện bằng auth.uid() (chỉ học sinh có hồ sơ); người khác nhận danh sách rỗng.
create or replace function english.eng_my_review_by_domain() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_map text;
  v_weak jsonb;
begin
  select l.* into v_l
  from english.members m
  join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if not found then
    return pg_catalog.jsonb_build_object('items', '[]'::jsonb);
  end if;
  v_map := english.eng_current_skill_map();
  v_weak := english.eng_weak_points(v_l.id, null);
  return pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('domain_key', p.domain_key, 'domain_name', p.domain_name, 'label', p.label) order by p.ord)
    from (
      select x.ord, x.tag ->> 'label_vi' as label, dm.key as domain_key, dm.name_vi as domain_name
      from pg_catalog.jsonb_array_elements(coalesce(v_weak -> 'tags', '[]'::jsonb)) with ordinality as x(tag, ord)
      left join english.error_tags et on et.track_id = v_l.track_id and et.key = x.tag ->> 'tag_key'
      left join english.skill_leaves lf on lf.map_id = v_map and lf.kind = 'tag' and lf.track_id = v_l.track_id and lf.ref_key = x.tag ->> 'tag_key'
      left join english.skill_groups g on g.map_id = v_map and g.key = coalesce(et.group_key, lf.group_key)
      left join english.skill_domains dm on dm.map_id = g.map_id and dm.key = g.domain_key
      where coalesce((x.tag ->> 'recheck_due')::boolean, false)
      order by x.ord
      limit 3
    ) p), '[]'::jsonb));
end
$$;

revoke execute on function english.eng_level_profile(uuid) from public, anon, authenticated;
grant execute on function english.eng_level_profile(uuid) to service_role;
revoke execute on function english.eng_recent_level_changes(uuid, int) from public, anon, authenticated;
grant execute on function english.eng_recent_level_changes(uuid, int) to service_role;
revoke execute on function english.eng_my_review_by_domain() from public, anon, service_role;
grant execute on function english.eng_my_review_by_domain() to authenticated;


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
