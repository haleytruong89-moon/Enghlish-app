-- 0027_points_import.sql
-- W3 · Mức điểm kiến thức (PP-0.1) + Bản đồ kiến thức + Nạp bài đã làm
-- (spec docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md §4 W3, §5, §6 W3, §8; luật docs/DOMAIN.md §2, §3, §4, §5.2, §5.3,
--  §6, §7, §8, §9, §13 D-W1/D-W3/D-W5/D-W6/D-W7/D-W8, §14 R1/R2/R5/R8).
--   1. attempts: taken_on (ngày làm thật), support_level (tu_lam/tu_lam_chua/lam_cung_co), source_hash (mã băm file bài, chống trùng);
--      provenance thêm 'imported'. inquiry_templates.kind thêm 'imported' (mẫu riêng của MỘT em, id A-IM-/B-IM-).
--   2. point_policies (RỖNG ở đây; PP-0.1 seed ở 0028 bằng gen:config). point_decisions (chỉ thêm, song song mastery_decisions, khóa
--      theo tag_key) + point_state (dẫn xuất). Engine điểm thuần ở lib/engine/points; hàm SQL kiểm lại mọi luật trước khi ghi.
--   3. import_batches (bài nạp: file bài + file đáp án + ngày + mức hỗ trợ + mã băm + payload AI đọc). eng_create_import (gia sư HOẶC
--      phụ huynh tải — R8) / eng_confirm_import (CHỈ gia sư của em: dựng mẫu imported + 1 lần làm + attempt_auto_checks — R8).
--   4. ai_runs.purpose thêm 'read_answers'; eng_ai_gate / eng_log_ai_run nới purpose.
--   5. eng_purge_learner + eng_purge_preview thêm point_decisions, point_state, import_batches (lần làm imported đã nằm trong attempts).
-- Idempotent; chỉ thêm (expand). Không đụng schema public. Cần 0025 và 0026 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations where version = '0026') then
    raise exception '0027 cần 0026_curriculum.sql: hãy áp 0025, 0026 trước rồi áp lại 0027 (missing_0026)' using errcode = 'P0001';
  end if;
end
$guard$;

-- 1. attempts: ngày làm thật, mức hỗ trợ, mã băm file; provenance 'imported' ------------------------------------------------------------
alter table english.attempts add column if not exists taken_on date;
alter table english.attempts add column if not exists support_level text
  check (support_level is null or support_level in ('tu_lam', 'tu_lam_chua', 'lam_cung_co'));
alter table english.attempts add column if not exists source_hash text
  check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$');
-- CHECK inline của 0009 có tên mặc định attempts_provenance_check: thay bằng bản rộng hơn (giữ mọi giá trị cũ + 'imported').
alter table english.attempts drop constraint if exists attempts_provenance_check;
alter table english.attempts add constraint attempts_provenance_check check (
  provenance in ('in_app', 'pasted', 'manual_import', 'tutor_live', 'imported'));
-- Bài nạp bắt buộc có ngày + mức hỗ trợ; bài khác không có hai cột này.
alter table english.attempts drop constraint if exists attempts_imported_shape;
alter table english.attempts add constraint attempts_imported_shape check (
  (provenance = 'imported') = (taken_on is not null and support_level is not null));
create index if not exists attempts_source_hash_idx on english.attempts(learner_id, source_hash) where source_hash is not null;

-- inquiry_templates: thêm kind 'imported' (mẫu riêng MỘT em; id A-IM-/B-IM-; bắt buộc family_id + learner_id như 'studio').
alter table english.inquiry_templates drop constraint if exists inquiry_templates_kind_check;
alter table english.inquiry_templates add constraint inquiry_templates_kind_check check (kind in ('topic', 'studio', 'imported'));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_studio_owner;
alter table english.inquiry_templates add constraint inquiry_templates_studio_owner
  check ((kind in ('studio', 'imported')) = (family_id is not null and learner_id is not null));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_id_check;
alter table english.inquiry_templates add constraint inquiry_templates_id_check check (
  (kind = 'topic' and id ~ '^[AB]-W[0-9]+-[A-Z0-9-]+$')
  or (kind = 'studio' and id ~ '^[AB]-ST-[0-9]{6}$')
  or (kind = 'imported' and id ~ '^[AB]-IM-[0-9]{6}$'));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_target_ids_check;
alter table english.inquiry_templates add constraint inquiry_templates_target_ids_check check (kind in ('studio', 'imported') or cardinality(target_ids) > 0);
create sequence if not exists english.import_template_seq;
revoke all on sequence english.import_template_seq from public, anon, authenticated;

-- 2. Chính sách mức điểm (song song assessment_policies). Bất biến khi đã published. RỖNG ở 0027; PP-0.1 seed ở 0028 (gen:config).
create table if not exists english.point_policies (
  version text primary key check (pg_catalog.length(pg_catalog.btrim(version)) > 0),
  config jsonb not null check (pg_catalog.jsonb_typeof(config) = 'object'),
  source_hash text not null,
  published_at timestamptz
);
drop trigger if exists point_policies_immutable on english.point_policies;
create trigger point_policies_immutable before update or delete on english.point_policies
  for each row execute function english.eng_forbid_published_change('self');
drop trigger if exists point_policies_immutable_truncate on english.point_policies;
create trigger point_policies_immutable_truncate before truncate on english.point_policies
  for each statement execute function english.eng_forbid_published_change();
alter table english.point_policies enable row level security;
revoke all on english.point_policies from public, anon, authenticated, service_role;
grant select on english.point_policies to service_role;

-- Dòng chính sách điểm đang dùng = bản published mới nhất. NULL = chưa seed (engine điểm chưa chạy).
create or replace function english.eng_point_policy() returns text
language sql stable security definer set search_path = ''
as $$
  select p.version from english.point_policies p where p.published_at is not null order by p.published_at desc, p.version desc limit 1
$$;
revoke execute on function english.eng_point_policy() from public, anon, authenticated;
grant execute on function english.eng_point_policy() to service_role;

-- Bậc của trạng thái điểm (dùng chung tên trạng thái với S7a để gia sư chỉ học một luật). 0=NOT_OBSERVED … 4=TRANSFERABLE (0023).
create or replace function english.eng_point_level(p_state text) returns int
language sql immutable set search_path = ''
as $$ select english.eng_skill_level(p_state) $$;
revoke execute on function english.eng_point_level(text) from public, anon;
grant execute on function english.eng_point_level(text) to authenticated, service_role;

-- Ngày lịch Việt Nam (UTC+7) của một thời điểm, dạng số ngày kể từ 1970-01-01 (khớp vnDay trong lib/engine/days.ts).
create or replace function english.eng_vn_day(p_ts timestamptz) returns int
language sql immutable set search_path = ''
as $$ select pg_catalog.floor((pg_catalog.date_part('epoch', p_ts) + 7 * 3600) / 86400)::int $$;
revoke execute on function english.eng_vn_day(timestamptz) from public, anon, authenticated;

-- 3. Sổ quyết định điểm (chỉ thêm) + trạng thái dẫn xuất -------------------------------------------------------------------------------
-- Song song mastery_decisions (0023) nhưng khóa theo tag_key (error_tags.key) và bằng chứng là CÂU (template:item:attempt), không phải episode.
create table if not exists english.point_decisions (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  learner_id uuid not null references english.learners(id),
  tag_key text not null check (tag_key ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  kind text not null check (kind in ('AUTO', 'PROPOSED', 'CONFIRMED', 'REJECTED', 'MANUAL', 'FLAG')),
  from_state text not null check (english.eng_point_level(from_state) is not null),
  to_state text not null check (english.eng_point_level(to_state) is not null),
  conditions jsonb not null default '[]'::jsonb check (pg_catalog.jsonb_typeof(conditions) = 'array'),
  evidence_item_refs text[] not null default '{}' check (cardinality(evidence_item_refs) <= 400),
  evidence_key text check (evidence_key is null or evidence_key ~ '^[0-9]{1,6}-[0-9a-f]{16}$'),
  policy_version text not null references english.point_policies(version),
  engine_version text check (engine_version is null or engine_version ~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$'),
  decided_by_member uuid,
  decided_role text check (decided_role is null or decided_role = 'tutor'),
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 3 and 300),
  responds_to uuid references english.point_decisions(id),
  client_id text check (client_id is null or pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  constraint point_decisions_actor check (
    (kind in ('AUTO', 'PROPOSED', 'FLAG') and decided_by_member is null and decided_role is null and client_id is null
       and responds_to is null and engine_version is not null and evidence_key is not null)
    or (kind in ('CONFIRMED', 'REJECTED', 'MANUAL') and decided_by_member is not null and decided_role = 'tutor' and client_id is not null)),
  constraint point_decisions_levels check (
    (kind = 'AUTO' and english.eng_point_level(to_state) between 1 and 2 and english.eng_point_level(to_state) > english.eng_point_level(from_state))
    or (kind = 'PROPOSED' and english.eng_point_level(to_state) between 3 and 4 and english.eng_point_level(to_state) > english.eng_point_level(from_state))
    or (kind = 'FLAG' and to_state = from_state and english.eng_point_level(from_state) >= 2)
    or (kind = 'CONFIRMED' and responds_to is not null)
    or (kind = 'REJECTED' and responds_to is not null and to_state = from_state and reason is not null)
    or (kind = 'MANUAL' and to_state in ('SUPPORTED', 'DEVELOPING') and to_state <> from_state and reason is not null))
);
create unique index if not exists point_decisions_answered_once on english.point_decisions(responds_to) where responds_to is not null;
create unique index if not exists point_decisions_evidence_once on english.point_decisions(learner_id, tag_key, to_state, evidence_key) where kind = 'PROPOSED';
create unique index if not exists point_decisions_flag_once on english.point_decisions(learner_id, tag_key, evidence_key) where kind = 'FLAG';
create unique index if not exists point_decisions_client_once on english.point_decisions(learner_id, client_id, tag_key) where client_id is not null;
create index if not exists point_decisions_learner_idx on english.point_decisions(learner_id, tag_key, seq desc);

drop trigger if exists point_decisions_forbid_mutation on english.point_decisions;
create trigger point_decisions_forbid_mutation
  before update or delete on english.point_decisions
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists point_decisions_forbid_truncate on english.point_decisions;
create trigger point_decisions_forbid_truncate
  before truncate on english.point_decisions
  for each statement execute function english.eng_forbid_mutation();

-- Một dòng / (em, điểm): mức hiện hành, ⚑ đang mở, đề xuất đang mở (suy ra từ sổ) + điều kiện mới nhất engine tính. Bảng dẫn xuất.
create table if not exists english.point_state (
  learner_id uuid not null references english.learners(id),
  tag_key text not null check (tag_key ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  state text not null default 'NOT_OBSERVED' check (english.eng_point_level(state) is not null),
  state_since timestamptz,
  state_decision_id uuid references english.point_decisions(id),
  flag_decision_id uuid references english.point_decisions(id),
  proposal_decision_id uuid references english.point_decisions(id),
  conditions jsonb not null default '[]'::jsonb check (pg_catalog.jsonb_typeof(conditions) = 'array'),
  evaluated_at timestamptz,
  inputs_at timestamptz,
  policy_version text,
  engine_version text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (learner_id, tag_key)
);

alter table english.point_decisions enable row level security;
alter table english.point_state enable row level security;
revoke all on english.point_decisions, english.point_state from public, anon, authenticated;
revoke insert, update, delete, truncate on english.point_decisions, english.point_state from public, anon, authenticated, service_role;
grant select on english.point_decisions, english.point_state to authenticated;
drop policy if exists point_decisions_select on english.point_decisions;
create policy point_decisions_select on english.point_decisions
  for select to authenticated using (english.eng_is_staff_of(learner_id));
drop policy if exists point_state_select on english.point_state;
create policy point_state_select on english.point_state
  for select to authenticated using (english.eng_is_staff_of(learner_id));

-- point_state của một (em, điểm) từ sổ - cùng luật với lib/engine/points/project.ts.
create or replace function english.eng_project_point_state(p_learner uuid, p_tag text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_state english.point_decisions%rowtype;
  v_flag uuid;
  v_prop uuid;
begin
  select d.* into v_state from english.point_decisions d
  where d.learner_id = p_learner and d.tag_key = p_tag and d.kind in ('AUTO', 'CONFIRMED', 'MANUAL')
  order by d.seq desc limit 1;
  select d.id into v_flag from english.point_decisions d
  where d.learner_id = p_learner and d.tag_key = p_tag and d.kind = 'FLAG'
    and not exists (select 1 from english.point_decisions a where a.responds_to = d.id)
  order by d.seq desc limit 1;
  select d.id into v_prop from english.point_decisions d
  where d.learner_id = p_learner and d.tag_key = p_tag and d.kind = 'PROPOSED'
    and not exists (select 1 from english.point_decisions a where a.responds_to = d.id)
  order by d.seq desc limit 1;
  insert into english.point_state(learner_id, tag_key, state, state_since, state_decision_id, flag_decision_id, proposal_decision_id, updated_at)
  values (p_learner, p_tag, coalesce(v_state.to_state, 'NOT_OBSERVED'), v_state.created_at, v_state.id, v_flag, v_prop, pg_catalog.clock_timestamp())
  on conflict (learner_id, tag_key) do update
    set state = excluded.state, state_since = excluded.state_since, state_decision_id = excluded.state_decision_id,
        flag_decision_id = excluded.flag_decision_id, proposal_decision_id = excluded.proposal_decision_id, updated_at = excluded.updated_at;
end
$$;
revoke execute on function english.eng_project_point_state(uuid, text) from public, anon, authenticated, service_role;

-- 4. Engine điểm: đọc bằng chứng (service_role, sau requireAccess) ------------------------------------------------------------------
-- "Câu được tính" của một điểm = câu ĐÓNG đã chấm (tự chấm hoặc Đúng/Sai của người lớn; 'needs_person' chưa phán KHÔNG tính; 'blank' = để trống = SAI),
-- gắn đúng điểm đó (studio_item_meta.tag_key hoặc reading_skill_key - H4), LẦN LÀM ĐẦU của em (không phải sửa bài / giao lại bước), KHÔNG hỗ trợ
-- (declared_assistance = {none}). day = ngày lịch Việt Nam của ngày làm thật (attempts.taken_on nếu có, không thì submitted_at). source_id = mẫu đề.
-- supported_* = cùng điều kiện nhưng CÓ hỗ trợ: chỉ nâng tới mức 2 (supportCapLevel), không bao giờ tính cho mức 3.
create or replace function english.eng_point_inputs(p_learner uuid, p_tags text[] default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_policy text := english.eng_point_policy();
  v_map text := english.eng_current_skill_map();
begin
  if p_learner is null then
    raise exception 'eng_point_inputs: learner id is required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_point_inputs: learner not found' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object(
    'learner_id', p_learner,
    'now', pg_catalog.clock_timestamp(),
    'policy', case when v_policy is null then null else pg_catalog.jsonb_build_object(
      'version', v_policy,
      'config', (select p.config from english.point_policies p where p.version = v_policy)) end,
    'points', coalesce((
      with q as (
        select coalesce(m.tag_key, m.reading_skill_key) as tag,
               m.template_id || ':' || m.item_id || ':' || t.id::text as ref,
               case when t.taken_on is not null then (t.taken_on - date '1970-01-01') else english.eng_vn_day(t.submitted_at) end as day,
               m.template_id as source_id,
               t.submitted_at as at,
               t.id as attempt_id,
               -- Thứ tự trong CÙNG ngày/lần làm: số của mảng ("Part II" → 2), rồi chữ của mảng, rồi SỐ câu (không phải chữ: q2 < q10).
               coalesce(nullif(pg_catalog.regexp_replace(coalesce(m.part, ''), '[^0-9]', '', 'g'), ''), '0')::int as part_no,
               coalesce(m.part, '') as part,
               m.n as qn,
               (t.declared_assistance = array['none']) as unsupported,
               -- Câu để trống (đã có cơ hội làm) tính là SAI, như eng_record_studio_result và S7a; câu chỉ ở giấy (out_of_app) đã bị loại ở dưới.
               case when (case when (c.checks -> 'items' -> m.item_id ->> 'result') = 'needs_person'
                                 then (select d.result from english.item_decisions d where d.attempt_id = t.id and d.item_id = m.item_id)
                               else c.checks -> 'items' -> m.item_id ->> 'result' end) = 'blank' then 'incorrect'
                    else case when (c.checks -> 'items' -> m.item_id ->> 'result') = 'needs_person'
                                then (select d.result from english.item_decisions d where d.attempt_id = t.id and d.item_id = m.item_id)
                              else c.checks -> 'items' -> m.item_id ->> 'result' end end as res
        from english.studio_item_meta m
        join english.inquiry_instances i on i.learner_id = p_learner and i.template_id = m.template_id and i.template_version = m.template_version
        join english.activity_instances a on a.inquiry_instance_id = i.id and a.step_no = 1
        join english.attempts t on t.activity_instance_id = a.id and t.learner_id = p_learner
        join english.episodes e on e.attempt_id = t.id and e.is_first_attempt
        join english.attempt_auto_checks c on c.attempt_id = t.id
        where m.learner_id = p_learner and not m.out_of_app
          and (p_tags is null or coalesce(m.tag_key, m.reading_skill_key) = any (p_tags))
          and not english.eng_is_step_repeat(t.id)
      ),
      tags as (
        select x.tag from (
          select m.tag from (select coalesce(sm.tag_key, sm.reading_skill_key) as tag from english.studio_item_meta sm where sm.learner_id = p_learner) m
          union
          select up.tag_key from english.curriculum_unit_points up where up.learner_id = p_learner
          union
          select d.tag_key from english.point_decisions d where d.learner_id = p_learner) x
        where p_tags is null or x.tag = any (p_tags)
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'tag_key', g.tag,
               'title_vi', (select et.label_vi from english.error_tags et
                            where et.track_id = v_l.track_id and et.key = g.tag and (et.family_id is null or et.family_id = v_l.family_id) limit 1),
               'group_key', coalesce(
                 (select sl.group_key from english.skill_leaves sl where sl.map_id = v_map and sl.kind = 'tag' and sl.track_id = v_l.track_id and sl.ref_key = g.tag),
                 (select et.group_key from english.error_tags et
                  where et.track_id = v_l.track_id and et.key = g.tag and (et.family_id is null or et.family_id = v_l.family_id) limit 1)),
               'taught_unit', exists (
                 select 1 from english.curriculum_unit_points up
                 join english.curriculum_units u on u.version_id = up.version_id and u.code = up.code
                 where up.learner_id = p_learner and up.tag_key = g.tag
                   -- Mức 1 từ Unit cần "đã dạy ở một buổi" = có ghi chú buổi học gắn Unit đó (không chỉ đánh dấu "Đang học").
                   and exists (select 1 from english.lesson_note_units ln
                               where ln.learner_id = p_learner and ln.curriculum_id = u.curriculum_id and ln.unit_code = u.code)),
               'counted', coalesce((
                 select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                          'ref', q.ref, 'day', q.day, 'correct', q.res = 'correct', 'source_id', q.source_id, 'first', true)
                        order by q.day, q.at, q.attempt_id, q.part_no, q.part, q.qn, q.ref)
                 from q where q.tag = g.tag and q.unsupported and q.res in ('correct', 'incorrect')), '[]'::jsonb),
               'supported_correct', (select pg_catalog.count(*) from q where q.tag = g.tag and not q.unsupported and q.res = 'correct')::int,
               'supported_attempted', (select pg_catalog.count(*) from q where q.tag = g.tag and not q.unsupported and q.res in ('correct', 'incorrect'))::int,
               'decisions', coalesce((
                 select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                          'id', d.id, 'seq', d.seq, 'kind', d.kind, 'from_state', d.from_state, 'to_state', d.to_state,
                          'evidence_key', d.evidence_key, 'responds_to', d.responds_to, 'created_at', d.created_at)
                        order by d.seq)
                 from english.point_decisions d where d.learner_id = p_learner and d.tag_key = g.tag), '[]'::jsonb))
             order by g.tag)
      from tags g), '[]'::jsonb));
end
$$;
revoke execute on function english.eng_point_inputs(uuid, text[]) from public, anon, authenticated;
grant execute on function english.eng_point_inputs(uuid, text[]) to service_role;

-- Bằng chứng lưu trong sổ: tối đa 400 câu GẦN NHẤT (mảng đã xếp cũ → mới); bản đầy đủ luôn dựng lại được từ eng_point_inputs.
create or replace function english.eng_bounded_refs(p_arr jsonb) returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array(
    select z.r from (
      select t.r, t.o from pg_catalog.jsonb_array_elements_text(
        case when pg_catalog.jsonb_typeof(coalesce(p_arr, 'null'::jsonb)) = 'array' then p_arr else '[]'::jsonb end) with ordinality as t(r, o)
      order by t.o desc limit 400) z
    order by z.o), '{}'::text[])
$$;
revoke execute on function english.eng_bounded_refs(jsonb) from public, anon, authenticated, service_role;

-- 5. Ghi kết quả engine điểm ----------------------------------------------------------------------------------------------------------
-- KIỂM LẠI mọi luật trước khi ghi (máy chủ có lỗi cũng không hạ mức được), giống eng_apply_engine_results (0023):
--   AUTO     chỉ mức 1–2, chỉ đi lên;
--   PROPOSED chỉ mức 3–4, cao hơn mức hiện tại, mức 4 chỉ từ "Tự làm được", không có đề xuất đang mở, chưa từng đề xuất cùng (mức, khóa);
--   AUTO và PROPOSED dừng khi mức hiện tại do gia sư sửa tay trên đúng bằng chứng này (B2);
--   FLAG     chỉ khi mức ≥ 2, không có ⚑ đang mở, chưa từng gắn cờ cùng khóa bằng chứng; mức giữ nguyên.
create or replace function english.eng_apply_point_results(p_learner uuid, p_results jsonb, p_engine_version text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_policy text;
  v_r jsonb;
  v_key text;
  v_cur english.point_state%rowtype;
  v_to text;
  v_basis timestamptz;
  v_held boolean;
  v_auto int := 0;
  v_proposed int := 0;
  v_flagged int := 0;
  v_failed int := 0;
  v_s_auto int;
  v_s_proposed int;
  v_s_flagged int;
begin
  if p_learner is null or p_results is null or p_engine_version is null then
    raise exception 'eng_apply_point_results: learner, results and engine version are required' using errcode = '22004';
  end if;
  if pg_catalog.jsonb_typeof(p_results) <> 'array' or p_engine_version !~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$' then
    raise exception 'eng_apply_point_results: results must be an array and the engine version a short name (bad_results)' using errcode = '22023';
  end if;
  perform 1 from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_apply_point_results: learner not found' using errcode = 'P0002';
  end if;
  v_policy := english.eng_point_policy();
  if v_policy is null then
    raise exception 'eng_apply_point_results: the point policy is not installed yet (no_point_policy)' using errcode = 'P0002';
  end if;

  for v_r in select x from pg_catalog.jsonb_array_elements(p_results) as x loop
    v_key := v_r ->> 'tag_key';
    if v_key is null or v_key !~ '^[a-z0-9][a-z0-9-]{1,79}$' then
      raise exception 'eng_apply_point_results: a point key is malformed (bad_results)' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(coalesce(v_r -> 'conditions', 'null'::jsonb)) <> 'array'
       or coalesce(v_r ->> 'evidence_key', '') !~ '^[0-9]{1,6}-[0-9a-f]{16}$' then
      raise exception 'eng_apply_point_results: conditions must be an array and the evidence key well-formed (bad_results)' using errcode = '22023';
    end if;
    v_basis := coalesce((v_r ->> 'computed_at')::timestamptz, pg_catalog.clock_timestamp());
    -- Một điểm lỗi (ghi sổ bị từ chối…) không làm hỏng cả vòng: điểm đó được bỏ qua (khôi phục điểm bắt đầu), các điểm khác vẫn được ghi.
    v_s_auto := v_auto; v_s_proposed := v_proposed; v_s_flagged := v_flagged;
    begin
    perform english.eng_project_point_state(p_learner, v_key);
    select * into v_cur from english.point_state c where c.learner_id = p_learner and c.tag_key = v_key;
    v_held := exists (select 1 from english.point_decisions m
                      where m.id = v_cur.state_decision_id and m.kind = 'MANUAL' and m.evidence_key is not null and m.evidence_key = v_r ->> 'evidence_key');

    -- (1) Mức 1–2: app tự cập nhật, chỉ đi lên.
    v_to := v_r ->> 'auto';
    if not v_held and v_to is not null and english.eng_point_level(v_to) between 1 and 2
       and english.eng_point_level(v_to) > english.eng_point_level(v_cur.state) then
      insert into english.point_decisions(learner_id, tag_key, kind, from_state, to_state, conditions, evidence_item_refs, evidence_key, policy_version, engine_version)
      values (p_learner, v_key, 'AUTO', v_cur.state, v_to, v_r -> 'conditions',
              english.eng_bounded_refs(v_r -> 'evidence' -> 'auto'),
              v_r ->> 'evidence_key', v_policy, p_engine_version);
      v_auto := v_auto + 1;
      perform english.eng_project_point_state(p_learner, v_key);
      select * into v_cur from english.point_state c where c.learner_id = p_learner and c.tag_key = v_key;
    end if;

    -- (2) Mức 3–4: chỉ đề xuất. Khóa = bằng chứng mà điều kiện của mức đó thực sự dùng; "đã đề xuất rồi" tính theo (mức, khóa).
    v_to := v_r ->> 'propose';
    if not v_held and v_to is not null and english.eng_point_level(v_to) between 3 and 4
       and coalesce(v_r ->> 'propose_key', '') ~ '^[0-9]{1,6}-[0-9a-f]{16}$'
       and english.eng_point_level(v_to) > english.eng_point_level(v_cur.state)
       and (v_to <> 'TRANSFERABLE' or v_cur.state = 'INDEPENDENT')
       and v_cur.proposal_decision_id is null
       and not exists (select 1 from english.point_decisions d
                       where d.learner_id = p_learner and d.tag_key = v_key and d.kind = 'PROPOSED' and d.to_state = v_to
                         and d.evidence_key = v_r ->> 'propose_key') then
      insert into english.point_decisions(learner_id, tag_key, kind, from_state, to_state, conditions, evidence_item_refs, evidence_key, policy_version, engine_version)
      values (p_learner, v_key, 'PROPOSED', v_cur.state, v_to, v_r -> 'conditions',
              english.eng_bounded_refs(v_r -> 'evidence' -> 'propose'),
              v_r ->> 'propose_key', v_policy, p_engine_version);
      v_proposed := v_proposed + 1;
      perform english.eng_project_point_state(p_learner, v_key);
      select * into v_cur from english.point_state c where c.learner_id = p_learner and c.tag_key = v_key;
    end if;

    -- (3) ⚑ "Cần thầy/cô xem lại": mức giữ nguyên.
    if coalesce((v_r ->> 'raise_flag')::boolean, false)
       and coalesce(v_r ->> 'flag_key', '') ~ '^[0-9]{1,6}-[0-9a-f]{16}$'
       and english.eng_point_level(v_cur.state) >= 2
       and v_cur.flag_decision_id is null
       and not exists (select 1 from english.point_decisions d
                       where d.learner_id = p_learner and d.tag_key = v_key and d.kind = 'FLAG' and d.evidence_key = v_r ->> 'flag_key') then
      insert into english.point_decisions(learner_id, tag_key, kind, from_state, to_state, conditions, evidence_item_refs, evidence_key, policy_version, engine_version)
      values (p_learner, v_key, 'FLAG', v_cur.state, v_cur.state, v_r -> 'conditions',
              english.eng_bounded_refs(v_r -> 'evidence' -> 'flag'),
              v_r ->> 'flag_key', v_policy, p_engine_version);
      v_flagged := v_flagged + 1;
      perform english.eng_project_point_state(p_learner, v_key);
    end if;

    -- (4) Điều kiện mới nhất (cho "Còn cần"), lúc tính. Lần tính chậm đọc bằng chứng cũ không ghi đè điều kiện mới hơn (N2).
    update english.point_state c
    set conditions = v_r -> 'conditions', evaluated_at = pg_catalog.clock_timestamp(), inputs_at = v_basis,
        policy_version = v_policy, engine_version = p_engine_version
    where c.learner_id = p_learner and c.tag_key = v_key and (c.inputs_at is null or c.inputs_at <= v_basis);
    exception when others then
      v_auto := v_s_auto; v_proposed := v_s_proposed; v_flagged := v_s_flagged;
      v_failed := v_failed + 1;
    end;
  end loop;

  return pg_catalog.jsonb_build_object('auto', v_auto, 'proposed', v_proposed, 'flagged', v_flagged, 'failed', v_failed, 'policy_version', v_policy);
end
$$;

-- "Tính lại từ đầu": xóa point_state của em rồi dựng lại từ sổ (mọi điểm có trong sổ hoặc có bằng chứng). Máy chủ chạy lại engine ngay sau.
create or replace function english.eng_reset_point_states(p_learner uuid, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_key text;
  v_n int := 0;
begin
  if p_learner is null or p_by is null then
    raise exception 'eng_reset_point_states: learner and actor are required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_reset_point_states: learner not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_reset_point_states: only a tutor of this learner or the family''s parent rebuilds (staff_only)' using errcode = '42501';
  end if;

  delete from english.point_state c where c.learner_id = p_learner;
  for v_key in
    select d.tag_key from english.point_decisions d where d.learner_id = p_learner
    union
    select x ->> 'tag_key' from pg_catalog.jsonb_array_elements(english.eng_point_inputs(p_learner, null) -> 'points') as x
    order by 1
  loop
    perform english.eng_project_point_state(p_learner, v_key);
    v_n := v_n + 1;
  end loop;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'point_states.rebuilt', v_l.family_id, p_learner, pg_catalog.jsonb_build_object('points', v_n));
  return pg_catalog.jsonb_build_object('points', v_n);
end
$$;

revoke execute on function english.eng_apply_point_results(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function english.eng_apply_point_results(uuid, jsonb, text) to service_role;
revoke execute on function english.eng_reset_point_states(uuid, uuid) from public, anon, authenticated;
grant execute on function english.eng_reset_point_states(uuid, uuid) to service_role;

-- 6. Gia sư của em trả lời một đề xuất điểm; hộp duyệt; Bản đồ kiến thức -------------------------------------------------------------------
-- Chỉ gia sư còn quan hệ hiệu lực với em (R1/D15); phụ huynh xem. Từng điểm một (H5): không có hàm "xác nhận tất cả" cho điểm.
-- p_action: confirm (xác nhận đề xuất / "Giữ mức" một ⚑) · reject ("Chưa", cần lý do) · lower (CHỈ cho ⚑: gia sư hạ mức xuống "Đang tiến bộ" bằng một dòng MANUAL
-- có lý do, trả lời đúng ⚑ đó; p_evidence_key = khóa bằng chứng gia sư đang xem để engine không tự nâng lại cùng bằng chứng, B2). Sổ chỉ thêm; phụ huynh chỉ xem.
drop function if exists english.eng_decide_point(uuid, text, text, uuid, text);
create or replace function english.eng_decide_point(p_decision uuid, p_action text, p_reason text, p_by uuid, p_client_id text, p_evidence_key text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_d english.point_decisions%rowtype;
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_prev english.point_decisions%rowtype;
  v_cur english.point_state%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_kind text;
  v_to text;
  v_id uuid;
begin
  if p_decision is null or p_action is null or p_by is null or p_client_id is null then
    raise exception 'eng_decide_point: decision, action, actor and client id are required' using errcode = '22004';
  end if;
  if p_action not in ('confirm', 'reject', 'lower') then
    raise exception 'eng_decide_point: action must be confirm, reject or lower (bad_action)' using errcode = '22023';
  end if;
  select * into v_d from english.point_decisions d where d.id = p_decision;
  if not found then
    raise exception 'eng_decide_point: proposal not found' using errcode = 'P0002';
  end if;
  select * into v_l from english.learners l where l.id = v_d.learner_id for update;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'tutor' or not english.eng_actor_may_manage(p_by, v_d.learner_id) then
    raise exception 'eng_decide_point: only a tutor of this learner confirms a point level (tutor_only)' using errcode = '42501';
  end if;
  v_kind := case p_action when 'confirm' then 'CONFIRMED' when 'lower' then 'MANUAL' else 'REJECTED' end;

  select * into v_prev from english.point_decisions a where a.responds_to = p_decision;
  if found then
    if v_prev.client_id = p_client_id and v_prev.kind = v_kind and v_prev.decided_by_member = p_by then
      return pg_catalog.jsonb_build_object('id', v_prev.id, 'tag_key', v_prev.tag_key, 'replayed', true);
    end if;
    raise exception 'eng_decide_point: this proposal was already answered (already_answered)' using errcode = '23505';
  end if;
  if v_d.kind not in ('PROPOSED', 'FLAG') then
    raise exception 'eng_decide_point: only a proposal or a flag can be answered (not_a_proposal)' using errcode = '22023';
  end if;
  if v_d.kind = 'FLAG' and p_action = 'reject' then
    raise exception 'eng_decide_point: a flag is kept ("Giữ mức") or lowered ("Hạ mức"), never rejected (flag_keep_or_edit)' using errcode = '22023';
  end if;
  if p_action = 'lower' and v_d.kind <> 'FLAG' then
    raise exception 'eng_decide_point: only a flag can be answered by lowering the level (not_a_flag)' using errcode = '22023';
  end if;
  if p_evidence_key is not null and p_evidence_key !~ '^[0-9]{1,6}-[0-9a-f]{16}$' then
    raise exception 'eng_decide_point: the evidence key is malformed (bad_results)' using errcode = '22023';
  end if;
  if v_reason is not null and pg_catalog.length(v_reason) > 300 then
    raise exception 'eng_decide_point: the reason is too long (reason_too_long)' using errcode = '22023';
  end if;
  if p_action in ('reject', 'lower') and (v_reason is null or pg_catalog.length(v_reason) < 3) then
    raise exception 'eng_decide_point: this answer needs a reason (reason_required)' using errcode = '23514';
  end if;

  perform english.eng_project_point_state(v_d.learner_id, v_d.tag_key);
  select * into v_cur from english.point_state c where c.learner_id = v_d.learner_id and c.tag_key = v_d.tag_key;
  if v_d.kind = 'PROPOSED' and p_action = 'confirm' and v_d.to_state = 'TRANSFERABLE' and v_cur.state <> 'INDEPENDENT' then
    raise exception 'eng_decide_point: the level changed since this proposal; reload the page (stale_proposal)' using errcode = '23514';
  end if;
  if p_action = 'lower' then
    if english.eng_point_level(v_cur.state) < 3 then
      raise exception 'eng_decide_point: the level changed since this flag; reload the page (stale_proposal)' using errcode = '23514';
    end if;
    v_to := 'DEVELOPING';
  else
    v_to := case when v_d.kind = 'PROPOSED' and p_action = 'confirm' then v_d.to_state else v_cur.state end;
  end if;
  insert into english.point_decisions(learner_id, tag_key, kind, from_state, to_state, conditions, evidence_item_refs, evidence_key, policy_version,
                                      decided_by_member, decided_role, reason, responds_to, client_id)
  values (v_d.learner_id, v_d.tag_key, v_kind, v_cur.state, v_to, v_d.conditions, v_d.evidence_item_refs, case when p_action = 'lower' then p_evidence_key end,
          coalesce(english.eng_point_policy(), v_d.policy_version), p_by, 'tutor', v_reason, p_decision, p_client_id)
  returning id into v_id;
  perform english.eng_project_point_state(v_d.learner_id, v_d.tag_key);

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, case v_kind when 'CONFIRMED' then 'point.confirmed' when 'MANUAL' then 'point.lowered' else 'point.rejected' end, v_l.family_id, v_d.learner_id,
          pg_catalog.jsonb_build_object('decision', v_id, 'responds_to', p_decision, 'tag_key', v_d.tag_key, 'answered', v_d.kind, 'to_state', v_to));
  return pg_catalog.jsonb_build_object('id', v_id, 'tag_key', v_d.tag_key, 'replayed', false);
end
$$;

-- Hộp duyệt → tab "Kỹ năng" (R1): đề xuất / ⚑ điểm đang mở của mọi em trong phạm vi của p_by. can_decide = p_by là gia sư của em đó.
-- Không có điểm số thô; không có tên người học thật khi p_allow_real = false (preview).
create or replace function english.eng_point_inbox(p_by uuid, p_allow_real boolean default false) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
begin
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') then
    raise exception 'eng_point_inbox: staff only (staff_only)' using errcode = '42501';
  end if;
  return (
    with pending as (
      select d.*, l.alias, l.is_test, l.track_id, l.family_id
      from english.point_decisions d
      join english.learners l on l.id = d.learner_id
      where english.eng_actor_may_manage(p_by, l.id) and (p_allow_real or l.is_test)
        and d.kind in ('PROPOSED', 'FLAG')
        and not exists (select 1 from english.point_decisions a where a.responds_to = d.id)
    )
    select pg_catalog.jsonb_build_object(
      'open', (select pg_catalog.count(*) from pending)::int,
      'decidable', case when v_m.role = 'tutor' then (select pg_catalog.count(*) from pending)::int else 0 end,
      'items', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                 'id', p.id, 'kind', p.kind, 'learner_id', p.learner_id, 'alias', p.alias, 'is_test', p.is_test,
                 'tag_key', p.tag_key,
                 'title_vi', (select et.label_vi from english.error_tags et
                              where et.track_id = p.track_id and et.key = p.tag_key and (et.family_id is null or et.family_id = p.family_id) limit 1),
                 'from_state', p.from_state, 'to_state', p.to_state,
                 'current_state', coalesce((select c.state from english.point_state c where c.learner_id = p.learner_id and c.tag_key = p.tag_key), 'NOT_OBSERVED'),
                 'conditions', p.conditions,
                 'evidence', coalesce((
                   select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                            'ref', r.ref, 'item', pg_catalog.split_part(r.ref, ':', 2),
                            'title_vi', (select tp.title_vi from english.inquiry_templates tp where tp.id = pg_catalog.split_part(r.ref, ':', 1) order by tp.version desc limit 1),
                            'at', (select coalesce(pg_catalog.to_char(t.taken_on, 'YYYY-MM-DD'), pg_catalog.to_char(t.submitted_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'))
                                   from english.attempts t where t.id::text = pg_catalog.split_part(r.ref, ':', 3)))
                          order by r.o)
                   from unnest(p.evidence_item_refs) with ordinality as r(ref, o)), '[]'::jsonb),
                 'created_at', p.created_at,
                 'can_decide', v_m.role = 'tutor')
               order by p.alias, p.seq)
        from pending p), '[]'::jsonb)));
end
$$;

-- Bản đồ kiến thức của một em (service_role sau requireAccess): mọi điểm có bằng chứng / được dạy / có trong sổ, với mức, ⚑, đề xuất và bằng chứng
-- TỪNG CÂU (đúng / sai / có hỗ trợ - KHÔNG có số điểm thô). Mảng + nhóm theo SM-1; giáo trình nào dạy điểm đó.
create or replace function english.eng_point_map(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_map text := english.eng_current_skill_map();
begin
  if p_learner is null then
    raise exception 'eng_point_map: learner id is required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_point_map: learner not found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object(
    'learner_id', p_learner,
    'policy_version', english.eng_point_policy(),
    'points', coalesce((
      with inp as (
        select x ->> 'tag_key' as tag, x ->> 'title_vi' as title, x ->> 'group_key' as group_key
        from pg_catalog.jsonb_array_elements(english.eng_point_inputs(p_learner, null) -> 'points') as x
      ),
      qa as (
        select coalesce(m.tag_key, m.reading_skill_key) as tag,
               m.template_id || ':' || m.item_id || ':' || t.id::text as ref,
               (select tp.title_vi from english.inquiry_templates tp where tp.id = m.template_id and tp.version = m.template_version) as title,
               coalesce(pg_catalog.to_char(t.taken_on, 'YYYY-MM-DD'), pg_catalog.to_char(t.submitted_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')) as at,
               t.submitted_at as ts,
               t.id as attempt_id,
               coalesce(nullif(pg_catalog.regexp_replace(coalesce(m.part, ''), '[^0-9]', '', 'g'), ''), '0')::int as part_no,
               coalesce(m.part, '') as part,
               m.n as qn,
               (t.declared_assistance <> array['none']) as support,
               -- Câu để trống (đã có cơ hội làm) tính là SAI, như eng_record_studio_result và S7a; câu chỉ ở giấy (out_of_app) đã bị loại ở dưới.
               case when (case when (c.checks -> 'items' -> m.item_id ->> 'result') = 'needs_person'
                                 then (select d.result from english.item_decisions d where d.attempt_id = t.id and d.item_id = m.item_id)
                               else c.checks -> 'items' -> m.item_id ->> 'result' end) = 'blank' then 'incorrect'
                    else case when (c.checks -> 'items' -> m.item_id ->> 'result') = 'needs_person'
                                then (select d.result from english.item_decisions d where d.attempt_id = t.id and d.item_id = m.item_id)
                              else c.checks -> 'items' -> m.item_id ->> 'result' end end as res
        from english.studio_item_meta m
        join english.inquiry_instances i on i.learner_id = p_learner and i.template_id = m.template_id and i.template_version = m.template_version
        join english.activity_instances a on a.inquiry_instance_id = i.id and a.step_no = 1
        join english.attempts t on t.activity_instance_id = a.id and t.learner_id = p_learner
        join english.episodes e on e.attempt_id = t.id and e.is_first_attempt
        join english.attempt_auto_checks c on c.attempt_id = t.id
        where m.learner_id = p_learner and not m.out_of_app and not english.eng_is_step_repeat(t.id)
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'tag_key', i.tag,
               'title_vi', i.title,
               'group_key', i.group_key,
               'group_vi', g.name_vi,
               'domain_key', g.domain_key,
               'domain_vi', dm.name_vi,
               'state', coalesce(s.state, 'NOT_OBSERVED'),
               'state_since', s.state_since,
               'state_kind', sd.kind,
               'flag', case when f.id is null then null else pg_catalog.jsonb_build_object('id', f.id, 'at', f.created_at) end,
               'proposal', case when pr.id is null then null else pg_catalog.jsonb_build_object('id', pr.id, 'to_state', pr.to_state, 'at', pr.created_at) end,
               'conditions', coalesce(s.conditions, '[]'::jsonb),
               'curricula', coalesce((
                 select pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object('id', cu.id, 'title', cu.title))
                 from english.curriculum_unit_points up
                 join english.curriculum_versions v on v.id = up.version_id and v.status = 'approved'
                 join english.curricula cu on cu.id = v.curriculum_id
                 where up.learner_id = p_learner and up.tag_key = i.tag), '[]'::jsonb),
               'answers', coalesce((
                 select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                          'ref', q.ref, 'title', q.title, 'at', q.at, 'correct', q.res = 'correct', 'support', q.support)
                        order by q.ts, q.attempt_id, q.part_no, q.part, q.qn, q.ref)
                 from qa q where q.tag = i.tag and q.res in ('correct', 'incorrect')), '[]'::jsonb))
             order by dm.ord nulls last, g.ord nulls last, i.tag)
      from inp i
      left join english.skill_groups g on g.map_id = v_map and g.key = i.group_key
      left join english.skill_domains dm on dm.map_id = g.map_id and dm.key = g.domain_key
      left join english.point_state s on s.learner_id = p_learner and s.tag_key = i.tag
      left join english.point_decisions sd on sd.id = s.state_decision_id
      left join english.point_decisions f on f.id = s.flag_decision_id
      left join english.point_decisions pr on pr.id = s.proposal_decision_id), '[]'::jsonb));
end
$$;

revoke execute on function english.eng_decide_point(uuid, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function english.eng_decide_point(uuid, text, text, uuid, text, text) to service_role;
revoke execute on function english.eng_point_inbox(uuid, boolean) from public, anon, authenticated;
grant execute on function english.eng_point_inbox(uuid, boolean) to service_role;
revoke execute on function english.eng_point_map(uuid) from public, anon, authenticated;
grant execute on function english.eng_point_map(uuid) to service_role;

-- 7. Bài nạp ------------------------------------------------------------------------------------------------------------------------------
-- 7a. Hai loại file mới: bài con đã làm (ảnh / PDF) và file đáp án (PDF / ảnh / Word).
alter table english.files drop constraint if exists files_kind_check;
alter table english.files add constraint files_kind_check
  check (kind in ('assignment_pdf', 'answer_key', 'result_image', 'work_photo', 'external_result', 'studio_test', 'studio_key', 'curriculum_toc', 'import_work', 'import_key'));
alter table english.files drop constraint if exists files_kind_mime;
alter table english.files add constraint files_kind_mime check (
  (kind = 'assignment_pdf' and mime = 'application/pdf')
  or (kind in ('answer_key', 'work_photo', 'external_result') and mime <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  or (kind = 'result_image' and mime in ('image/png', 'image/jpeg', 'image/webp'))
  or (kind in ('studio_test', 'studio_key') and mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
  or (kind = 'curriculum_toc' and mime = 'application/pdf')
  or (kind = 'import_work' and mime in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp'))
  or (kind = 'import_key' and mime in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')));


-- Đăng ký file = bản 0026 + bài nạp (import_work: pdf / ảnh; import_key: pdf / ảnh / Word).
create or replace function english.eng_register_file(p_family uuid, p_learner uuid, p_kind text, p_file jsonb, p_by uuid) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_mime text;
  v_bytes int;
  v_ext text;
begin
  if pg_catalog.jsonb_typeof(p_file) is distinct from 'object'
     or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_file)) <> 3
     or (p_file ->> 'id') is null or (p_file ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or pg_catalog.jsonb_typeof(p_file -> 'mime') is distinct from 'string'
     or (p_file ->> 'bytes') is null or (p_file ->> 'bytes') !~ '^[0-9]{1,9}$' then
    raise exception 'eng_register_file: each file is {id, mime, bytes}' using errcode = '22023';
  end if;
  v_id := (p_file ->> 'id')::uuid;
  v_mime := p_file ->> 'mime';
  v_bytes := (p_file ->> 'bytes')::int;
  if v_mime not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception 'eng_register_file: only pdf, png, jpeg, webp and docx files are accepted' using errcode = '22023';
  end if;
  if v_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and p_kind not in ('studio_test', 'studio_key', 'import_key') then
    raise exception 'eng_register_file: a Word file is accepted only for a Studio test, a Studio answer key or an import answer key' using errcode = '22023';
  end if;
  if p_kind in ('studio_test', 'studio_key') and v_mime not in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception 'eng_register_file: a Studio test or answer key must be a PDF or a .docx file' using errcode = '22023';
  end if;
  if p_kind = 'curriculum_toc' and v_mime <> 'application/pdf' then
    raise exception 'eng_register_file: a table of contents must be a PDF (toc_pdf_only)' using errcode = '22023';
  end if;
  if p_kind = 'import_work' and v_mime not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp') then
    raise exception 'eng_register_file: the work to import must be a PDF or an image (import_work_type)' using errcode = '22023';
  end if;
  if v_bytes < 1 or v_bytes > 15728640 then
    raise exception 'eng_register_file: a file must be between 1 byte and 15 MB' using errcode = '22023';
  end if;
  if p_kind = 'assignment_pdf' and v_mime <> 'application/pdf' then
    raise exception 'eng_register_file: an assignment file must be a PDF' using errcode = '22023';
  end if;
  if p_kind = 'result_image' and v_mime = 'application/pdf' then
    raise exception 'eng_register_file: a result screenshot must be an image' using errcode = '22023';
  end if;
  v_ext := case v_mime when 'application/pdf' then 'pdf' when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx' else 'webp' end;
  insert into english.files(id, family_id, learner_id, kind, path, mime, bytes, uploaded_by_member)
  values (v_id, p_family, p_learner, p_kind, p_family::text || '/' || coalesce(p_learner::text, 'shared') || '/' || v_id::text || '.' || v_ext, v_mime, v_bytes, p_by);
  return v_id;
end
$$;
revoke execute on function english.eng_register_file(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;


-- 7b. Bài nạp: file bài + file đáp án + ngày làm thật + mức hỗ trợ + mã băm (chống nạp trùng) + kết quả AI đọc (payload).
-- payload = {items:[{n, part, student_answer, key_answer, tag, out_of_app, confidence, result}]}; result do CODE tính (AI chỉ đọc chữ).
create table if not exists english.import_batches (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references english.families(id),
  learner_id uuid not null references english.learners(id),
  track_id text not null references english.tracks(id),
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 160),
  work_file_id uuid not null references english.files(id),
  key_file_id uuid not null references english.files(id),
  taken_on date not null,
  support_level text not null check (support_level in ('tu_lam', 'tu_lam_chua', 'lam_cung_co')),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  allow_other boolean not null default false,
  status text not null default 'reading' check (status in ('reading', 'ai_failed', 'draft', 'confirmed', 'discarded')),
  payload jsonb not null default '{"items": []}'::jsonb,
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,40}$'),
  ai_run_id uuid references english.ai_runs(id),
  created_by_member uuid not null,
  updated_by_member uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  approved_by_member uuid,
  approved_at timestamptz,
  template_id text,
  template_version int,
  attempt_id uuid references english.attempts(id),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  foreign key (template_id, template_version) references english.inquiry_templates(id, version),
  constraint import_batches_payload_shape check (
    pg_catalog.jsonb_typeof(payload) = 'object' and pg_catalog.jsonb_typeof(payload -> 'items') = 'array'
    and pg_catalog.jsonb_array_length(payload -> 'items') <= 300 and pg_catalog.length(payload::text) <= 1000000),
  constraint import_batches_confirmed_shape check (
    (status = 'confirmed') = (approved_at is not null and approved_by_member is not null and template_id is not null
                              and template_version is not null and attempt_id is not null))
);
create index if not exists import_batches_learner_idx on english.import_batches(learner_id, created_at desc);
create index if not exists import_batches_hash_idx on english.import_batches(learner_id, source_hash);

-- Sửa khi còn đọc / nháp; đã xác nhận hoặc đã bỏ thì bất biến; xóa chỉ trong purge.
create or replace function english.eng_guard_import_batch() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_purge text := nullif(pg_catalog.current_setting('app.purge_learner', true), '');
  v_owner text;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'english.import_batches: TRUNCATE is forbidden' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if v_purge is not null and old.learner_id::text = v_purge then
      select r.rolname into v_owner
      from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
      where p.oid = pg_catalog.to_regprocedure('english.eng_purge_learner(uuid,uuid)');
      if v_owner is not null and current_user = v_owner then return old; end if;
    end if;
    raise exception 'english.import_batches: DELETE is forbidden (discard the batch instead)' using errcode = '42501';
  end if;
  if new.id <> old.id or new.family_id <> old.family_id or new.learner_id <> old.learner_id or new.track_id <> old.track_id
     or new.work_file_id <> old.work_file_id or new.key_file_id <> old.key_file_id or new.taken_on <> old.taken_on
     or new.support_level <> old.support_level or new.source_hash <> old.source_hash or new.created_by_member <> old.created_by_member
     or new.created_at <> old.created_at or new.client_id <> old.client_id or new.allow_other <> old.allow_other then
    raise exception 'english.import_batches: owner, files, date, support level and hash never change' using errcode = '42501';
  end if;
  if old.status in ('confirmed', 'discarded') then
    raise exception 'english.import_batches: a confirmed or discarded batch cannot change' using errcode = '42501';
  end if;
  if not (new.status = old.status
          or (old.status = 'reading' and new.status in ('draft', 'ai_failed', 'discarded'))
          or (old.status = 'ai_failed' and new.status in ('reading', 'draft', 'discarded'))
          or (old.status = 'draft' and new.status in ('confirmed', 'discarded'))) then
    raise exception 'english.import_batches: % → % is not allowed', old.status, new.status using errcode = '23514';
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;
revoke execute on function english.eng_guard_import_batch() from public, anon, authenticated, service_role;
drop trigger if exists import_batches_guard on english.import_batches;
create trigger import_batches_guard before update or delete on english.import_batches
  for each row execute function english.eng_guard_import_batch();
drop trigger if exists import_batches_guard_truncate on english.import_batches;
create trigger import_batches_guard_truncate before truncate on english.import_batches
  for each statement execute function english.eng_guard_import_batch();

alter table english.import_batches enable row level security;
revoke all on english.import_batches from public, anon, authenticated;
revoke insert, update, delete, truncate on english.import_batches from service_role;
grant select on english.import_batches to authenticated;
drop policy if exists import_batches_select on english.import_batches;
create policy import_batches_select on english.import_batches
  for select to authenticated using (english.eng_is_staff_of(learner_id));

-- 7c. Tạo bài nạp: gia sư CỦA EM HOẶC phụ huynh tải (R8); xác nhận kết quả thì chỉ gia sư (eng_confirm_import).
-- Trùng: cùng mã băm file bài, HOẶC cùng tên đề + ngày làm — của cùng em, bài chưa bỏ — bị chặn (duplicate_import) trừ khi p_allow_other
-- ("Đây là lần làm khác"). Ngày làm không ở tương lai (D-W5: quá khứ thì không giới hạn).
-- p_manual = "Soạn tay" (DOMAIN §6/§8; hết trần AI → làm thủ công): bài nạp vào thẳng 'draft' với danh sách câu trống, gia sư tự gõ từng câu.
drop function if exists english.eng_create_import(uuid, text, jsonb, jsonb, date, text, text, uuid, text, boolean);
create or replace function english.eng_create_import(
  p_learner uuid, p_title text, p_work_file jsonb, p_key_file jsonb, p_taken_on date, p_support text, p_source_hash text,
  p_by uuid, p_client_id text, p_allow_other boolean default false, p_manual boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_title text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  v_prev english.import_batches%rowtype;
  v_work uuid;
  v_key uuid;
  v_id uuid;
begin
  if p_learner is null or p_taken_on is null or p_by is null or p_work_file is null or p_key_file is null then
    raise exception 'eng_create_import: learner, files, date and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_create_import: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if pg_catalog.length(v_title) not between 1 and 160 then
    raise exception 'eng_create_import: a title of 1..160 characters is required (bad_title)' using errcode = '22023';
  end if;
  if p_support is null or p_support not in ('tu_lam', 'tu_lam_chua', 'lam_cung_co') then
    raise exception 'eng_create_import: the support level must be tu_lam, tu_lam_chua or lam_cung_co (bad_support)' using errcode = '22023';
  end if;
  if p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'eng_create_import: the file hash must be a sha256 (bad_hash)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_create_import: learner not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_create_import: this member may not import work of this learner (staff_only)' using errcode = '42501';
  end if;
  select * into v_prev from english.import_batches b where b.learner_id = p_learner and b.client_id = p_client_id;
  if found then
    if v_prev.source_hash <> p_source_hash then
      raise exception 'eng_create_import: client_id was already used for another import' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_prev.id, 'status', v_prev.status, 'replayed', true);
  end if;
  if p_taken_on > english.eng_today_vn() then
    raise exception 'eng_create_import: the day the work was done cannot be in the future (date_future)' using errcode = '23514';
  end if;
  if not coalesce(p_allow_other, false) and (
       exists (select 1 from english.import_batches b where b.learner_id = p_learner and b.status <> 'discarded' and b.source_hash = p_source_hash)
       or exists (select 1 from english.import_batches b where b.learner_id = p_learner and b.status <> 'discarded' and b.taken_on = p_taken_on
                  and pg_catalog.lower(b.title) = pg_catalog.lower(v_title))) then
    raise exception 'eng_create_import: this work may already be imported (duplicate_import)' using errcode = '23505';
  end if;

  v_work := english.eng_register_file(v_l.family_id, p_learner, 'import_work', p_work_file, p_by);
  v_key := english.eng_register_file(v_l.family_id, p_learner, 'import_key', p_key_file, p_by);
  insert into english.import_batches(family_id, learner_id, track_id, title, work_file_id, key_file_id, taken_on, support_level, source_hash,
                                     allow_other, created_by_member, updated_by_member, client_id, status)
  values (v_l.family_id, p_learner, v_l.track_id, v_title, v_work, v_key, p_taken_on, p_support, p_source_hash,
          coalesce(p_allow_other, false), p_by, p_by, p_client_id, case when coalesce(p_manual, false) then 'draft' else 'reading' end)
  returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'import.created', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('batch', v_id, 'taken_on', p_taken_on, 'support_level', p_support, 'manual', coalesce(p_manual, false)));
  return pg_catalog.jsonb_build_object('id', v_id, 'status', case when coalesce(p_manual, false) then 'draft' else 'reading' end, 'replayed', false);
end
$$;

-- 7d. Kết thúc phần AI (máy chủ, chạy nền): chỉ đổi bài nạp còn 'reading'.
create or replace function english.eng_finish_import_read(p_batch uuid, p_payload jsonb, p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n int;
begin
  update english.import_batches set payload = p_payload, status = 'draft', ai_run_id = p_run, error_code = null
  where id = p_batch and status = 'reading';
  get diagnostics v_n = row_count;
  return pg_catalog.jsonb_build_object('applied', v_n = 1);
end
$$;

create or replace function english.eng_fail_import_read(p_batch uuid, p_error text, p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n int;
begin
  if p_error is null or p_error !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'eng_fail_import_read: error code required' using errcode = '22023';
  end if;
  update english.import_batches set status = 'ai_failed', error_code = p_error, ai_run_id = coalesce(p_run, ai_run_id)
  where id = p_batch and status = 'reading';
  get diagnostics v_n = row_count;
  return pg_catalog.jsonb_build_object('applied', v_n = 1);
end
$$;

-- 7d2. Sau khi AI đọc hỏng: "Thử lại" (ai_failed → reading, cùng bài nạp, không tạo bài trùng) hoặc "Soạn tay" (ai_failed → draft, danh sách trống).
-- Gia sư CỦA EM hoặc phụ huynh (như tải lên). Trả applied=false nếu bài không còn ở ai_failed (đã đổi trong lúc đó).
create or replace function english.eng_retry_import_read(p_batch uuid, p_by uuid, p_to text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_b english.import_batches%rowtype;
  v_m english.members%rowtype;
  v_l english.learners%rowtype;
begin
  if p_batch is null or p_by is null or p_to is null or p_to not in ('reading', 'draft') then
    raise exception 'eng_retry_import_read: batch, actor and a target of reading or draft are required (bad_target)' using errcode = '22023';
  end if;
  select * into v_b from english.import_batches b where b.id = p_batch for update;
  if not found then
    raise exception 'eng_retry_import_read: import not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, v_b.learner_id) then
    raise exception 'eng_retry_import_read: this member may not change this import (staff_only)' using errcode = '42501';
  end if;
  if v_b.status <> 'ai_failed' then
    return pg_catalog.jsonb_build_object('id', p_batch, 'status', v_b.status, 'applied', false);
  end if;
  update english.import_batches set status = p_to, error_code = null, updated_by_member = p_by where id = p_batch;
  select * into v_l from english.learners l where l.id = v_b.learner_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, case p_to when 'reading' then 'import.retried' else 'import.manual' end, v_l.family_id, v_b.learner_id,
          pg_catalog.jsonb_build_object('batch', p_batch));
  return pg_catalog.jsonb_build_object('id', p_batch, 'status', p_to, 'applied', true);
end
$$;

-- 7d3. Bài nạp chưa xong của các em trong phạm vi p_by (cho "Chờ duyệt" của từng em): chỉ liên kết, không quyết gì. Không có tên người học thật khi p_allow_real = false.
create or replace function english.eng_import_pending(p_by uuid, p_allow_real boolean default false) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
begin
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') then
    raise exception 'eng_import_pending: staff only (staff_only)' using errcode = '42501';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'id', b.id, 'learner_id', b.learner_id, 'title', b.title, 'status', b.status, 'taken_on', b.taken_on,
             'updated_at', b.updated_at, 'can_confirm', v_m.role = 'tutor') order by b.created_at, b.id)
    from english.import_batches b join english.learners l on l.id = b.learner_id
    where b.status in ('reading', 'draft', 'ai_failed') and english.eng_actor_may_manage(p_by, l.id) and (p_allow_real or l.is_test)), '[]'::jsonb);
end
$$;

-- 7e. Bỏ bài nạp chưa xác nhận: gia sư HOẶC phụ huynh (phụ huynh không xác nhận thay, chỉ được bỏ).
create or replace function english.eng_discard_import(p_batch uuid, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_b english.import_batches%rowtype;
  v_m english.members%rowtype;
  v_l english.learners%rowtype;
begin
  select * into v_b from english.import_batches b where b.id = p_batch for update;
  if not found then
    raise exception 'eng_discard_import: import not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, v_b.learner_id) then
    raise exception 'eng_discard_import: this member may not discard this import (staff_only)' using errcode = '42501';
  end if;
  if v_b.status not in ('reading', 'ai_failed', 'draft') then
    raise exception 'eng_discard_import: only an import that is not confirmed can be discarded (not_open)' using errcode = '23514';
  end if;
  update english.import_batches set status = 'discarded', updated_by_member = p_by where id = p_batch;
  select * into v_l from english.learners l where l.id = v_b.learner_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'import.discarded', v_l.family_id, v_b.learner_id, pg_catalog.jsonb_build_object('batch', p_batch));
  return pg_catalog.jsonb_build_object('id', p_batch, 'status', 'discarded');
end
$$;

-- 7f. Đọc một bài nạp / danh sách (service_role sau requireAccess). updated_at trả dạng chữ (khóa lạc quan khi xác nhận).
create or replace function english.eng_import_batch(p_batch uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', b.id, 'learner_id', b.learner_id, 'track_id', b.track_id, 'title', b.title, 'taken_on', b.taken_on,
    'support_level', b.support_level, 'status', b.status, 'payload', b.payload, 'error_code', b.error_code,
    'work_file_id', b.work_file_id, 'key_file_id', b.key_file_id, 'allow_other', b.allow_other,
    'template_id', b.template_id, 'attempt_id', b.attempt_id,
    'updated_at', b.updated_at::text, 'touched_at', b.updated_at, 'created_at', b.created_at)
  from english.import_batches b where b.id = p_batch
$$;

revoke execute on function english.eng_create_import(uuid, text, jsonb, jsonb, date, text, text, uuid, text, boolean, boolean) from public, anon, authenticated;
grant execute on function english.eng_create_import(uuid, text, jsonb, jsonb, date, text, text, uuid, text, boolean, boolean) to service_role;
revoke execute on function english.eng_retry_import_read(uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_retry_import_read(uuid, uuid, text) to service_role;
revoke execute on function english.eng_import_pending(uuid, boolean) from public, anon, authenticated;
grant execute on function english.eng_import_pending(uuid, boolean) to service_role;
revoke execute on function english.eng_finish_import_read(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function english.eng_finish_import_read(uuid, jsonb, uuid) to service_role;
revoke execute on function english.eng_fail_import_read(uuid, text, uuid) from public, anon, authenticated;
grant execute on function english.eng_fail_import_read(uuid, text, uuid) to service_role;
revoke execute on function english.eng_discard_import(uuid, uuid) from public, anon, authenticated;
grant execute on function english.eng_discard_import(uuid, uuid) to service_role;
revoke execute on function english.eng_import_batch(uuid) from public, anon, authenticated;
grant execute on function english.eng_import_batch(uuid) to service_role;

-- 8. Xác nhận bài nạp → mẫu 'imported' + một lần làm 'imported' + kết quả câu (CHỈ gia sư CỦA EM, R8) ------------------------------------------------
-- p_build (máy chủ dựng từ bản nháp AI đã được gia sư xem; đây là lưới an toàn):
--   template {prompt_en, time_min, items:[{id,kind,stem,options,target_id}]}  - chỉ câu làm được trong app (không out_of_app)
--   keys     [{item_id, kind:'answer', answer, explanation_vi}]                 - một dòng cho mỗi câu trong app
--   meta     [{n, part, tag_key, reading_skill_key, out_of_app}]                - mỗi câu của đề (cả câu chỉ ở giấy), đúng MỘT nhãn mỗi câu
--   results  [{item_id, result:'correct'|'incorrect'|'blank'}]                  - kết quả đã chốt cho mỗi câu trong app
-- Mẫu 'imported' là mẫu riêng của em, không phải bước của bài giao nào khác → KHÔNG BAO GIỜ là "lần làm đầu" của một bước đã giao (R2): trạng thái
-- kỹ năng S7a (cách 2) không đổi, trừ khi chính câu của bài nạp gắn kỹ năng (bài nạp không gắn kỹ năng nào: target_id luôn null).
create or replace function english.eng_confirm_import(p_batch uuid, p_base text, p_build jsonb, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_b english.import_batches%rowtype;
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_cat text;
  v_tid text;
  v_inst uuid;
  v_act uuid;
  v_att uuid := pg_catalog.gen_random_uuid();
  v_at timestamptz;
  v_today date := english.eng_today_vn();
  v_items jsonb := p_build -> 'template' -> 'items';
  v_meta jsonb := p_build -> 'meta';
  v_results jsonb := p_build -> 'results';
  v_mode text;
  v_assist text[];
  v_total int;
  v_checks jsonb;
  v_counted int;
  v_correct int;
  v_tags text[];
begin
  if p_batch is null or p_base is null or p_build is null or p_by is null or p_client_id is null then
    raise exception 'eng_confirm_import: batch, base, build, actor and client id are required' using errcode = '22004';
  end if;
  select * into v_b from english.import_batches b where b.id = p_batch for update;
  if not found then
    raise exception 'eng_confirm_import: import not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'tutor' or not english.eng_actor_may_manage(p_by, v_b.learner_id) then
    raise exception 'eng_confirm_import: only a tutor of this learner confirms the result of imported work (tutor_only)' using errcode = '42501';
  end if;
  if v_b.status = 'confirmed' then
    return pg_catalog.jsonb_build_object('template_id', v_b.template_id, 'version', v_b.template_version, 'attempt_id', v_b.attempt_id, 'replayed', true,
                                         'counted', 0, 'tags', '[]'::jsonb);
  end if;
  if v_b.status <> 'draft' then
    raise exception 'eng_confirm_import: only a read import can be confirmed (not_draft)' using errcode = '23514';
  end if;
  if not english.eng_same_instant(v_b.updated_at, p_base) then
    raise exception 'eng_confirm_import: the import changed in the meantime (draft_changed)' using errcode = '23505';
  end if;
  -- Hình của p_build.
  if pg_catalog.jsonb_typeof(v_items) is distinct from 'array' or pg_catalog.jsonb_typeof(v_meta) is distinct from 'array'
     or pg_catalog.jsonb_typeof(v_results) is distinct from 'array' or pg_catalog.jsonb_typeof(p_build -> 'keys') is distinct from 'array' then
    raise exception 'eng_confirm_import: the build is malformed (bad_build)' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(v_items) = 0 then
    raise exception 'eng_confirm_import: no item can be counted (no_app_items)' using errcode = '23514';
  end if;
  v_total := pg_catalog.jsonb_array_length(v_meta);
  if v_total > 300
     or exists (select 1 from pg_catalog.jsonb_array_elements(v_items) x where coalesce(x ->> 'id', '') !~ '^q[1-9][0-9]{0,2}$' or x ? 'answer' or x ? 'explanation_vi')
     or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p_build -> 'keys')) <> pg_catalog.jsonb_array_length(v_items)
     or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(v_results)) <> pg_catalog.jsonb_array_length(v_items)
     or exists (select 1 from pg_catalog.jsonb_array_elements(v_items) x
                where (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p_build -> 'keys') k where k ->> 'item_id' = x ->> 'id') <> 1
                   or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(v_results) r where r ->> 'item_id' = x ->> 'id') <> 1)
     or exists (select 1 from pg_catalog.jsonb_array_elements(v_results) r where coalesce(r ->> 'result', '') not in ('correct', 'incorrect', 'blank'))
     or exists (select 1 from pg_catalog.jsonb_array_elements(v_meta) x
                where coalesce(x ->> 'n', '') !~ '^[0-9]{1,3}$' or ((x ->> 'tag_key') is null) = ((x ->> 'reading_skill_key') is null))
     or (select pg_catalog.count(distinct (x ->> 'n')) from pg_catalog.jsonb_array_elements(v_meta) x) <> v_total
     -- mỗi câu trong app (items) khớp đúng một dòng meta không out_of_app, và ngược lại
     or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(v_meta) x where not (x ->> 'out_of_app')::boolean) <> pg_catalog.jsonb_array_length(v_items)
     or exists (select 1 from pg_catalog.jsonb_array_elements(v_items) i
                where not exists (select 1 from pg_catalog.jsonb_array_elements(v_meta) x
                                  where 'q' || (x ->> 'n') = i ->> 'id' and not (x ->> 'out_of_app')::boolean)) then
    raise exception 'eng_confirm_import: the build does not match its own items (bad_build)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = v_b.learner_id;
  -- Mỗi nhãn là nhãn đang dùng của track em (có sẵn hoặc của gia đình): danh sách đóng (D-W1).
  if exists (select 1 from pg_catalog.jsonb_array_elements(v_meta) x
             where not exists (select 1 from english.error_tags et
                               where et.track_id = v_l.track_id and et.key = coalesce(x ->> 'tag_key', x ->> 'reading_skill_key')
                                 and et.retired_at is null and (et.family_id is null or et.family_id = v_l.family_id))) then
    raise exception 'eng_confirm_import: a point is not an open tag of this learner (bad_tag)' using errcode = '22023';
  end if;
  select d.catalogue_version into v_cat
  from english.target_sets ts join english.target_set_definitions d on d.id = ts.definition_id
  where ts.learner_id = v_l.id and ts.effective_from <= pg_catalog.clock_timestamp()
  order by ts.effective_from desc, ts.seq desc limit 1;
  if v_cat is null then
    raise exception 'eng_confirm_import: the learner has no skill set yet (no_target_set)' using errcode = '23514';
  end if;

  v_tid := v_l.track_id || '-IM-' || pg_catalog.lpad(pg_catalog.nextval('english.import_template_seq')::text, 6, '0');
  v_mode := case when v_b.support_level = 'lam_cung_co' then 'PRACTICE' else 'INDEPENDENT_CHECK' end;
  v_assist := case when v_b.support_level = 'lam_cung_co' then array['asked_someone'] else array['none'] end;

  insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket,
                                        target_ids, steps, sources, catalogue_version, status, source_hash, kind, family_id, learner_id)
  values (v_tid, 1, v_l.track_id, v_b.title, v_b.title, v_b.title, 0, v_b.taken_on, v_b.taken_on, 'imported', '{}',
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'step_no', 1, 'activity_type', 'ACT-SOURCE-QA', 'mode', v_mode, 'purpose', '[]'::jsonb, 'target_ids', '[]'::jsonb,
            'prompt_en', coalesce(nullif(pg_catalog.btrim(p_build -> 'template' ->> 'prompt_en'), ''), 'Imported work.'),
            'time_min', 5, 'planned_date', v_b.taken_on, 'self_check_vi', '[]'::jsonb, 'items', v_items)),
          '[]'::jsonb, v_cat, 'draft', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_build::text, 'UTF8')), 'hex'),
          'imported', v_l.family_id, v_l.id);

  insert into english.template_item_keys(template_id, template_version, item_id, step_no, kind, answer, explanation_vi)
  select v_tid, 1, k ->> 'item_id', 1, 'answer', nullif(pg_catalog.btrim(coalesce(k ->> 'answer', '')), ''), nullif(pg_catalog.btrim(coalesce(k ->> 'explanation_vi', '')), '')
  from pg_catalog.jsonb_array_elements(p_build -> 'keys') as k;

  update english.inquiry_templates set status = 'published', published_at = pg_catalog.clock_timestamp() where id = v_tid and version = 1;

  insert into english.studio_item_meta(template_id, template_version, item_id, learner_id, n, part, tag_key, reading_skill_key, out_of_app)
  select v_tid, 1, 'q' || (x ->> 'n'), v_l.id, (x ->> 'n')::int, pg_catalog.left(coalesce(nullif(pg_catalog.btrim(x ->> 'part'), ''), '-'), 20),
         x ->> 'tag_key', x ->> 'reading_skill_key', (x ->> 'out_of_app')::boolean
  from pg_catalog.jsonb_array_elements(v_meta) as x;

  -- Giao cho em (hạn = hôm nay) để có inquiry_instance + activity_instance; em KHÔNG thấy bài này (eng_my_* bỏ qua mẫu 'imported').
  v_inst := english.eng_assign_inquiry(v_l.id, v_tid, 1, v_today, p_by, 'imp-' || p_batch::text);
  select a.id into v_act from english.activity_instances a where a.inquiry_instance_id = v_inst and a.step_no = 1;

  v_at := english.eng_session_ts(v_b.taken_on);
  insert into english.attempts(id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance,
                               declared_assistance, submitted_at, content_hash, client_submission_id, taken_on, support_level, source_hash)
  values (v_att, v_act, v_l.id, 1, null, v_att, v_mode, 'imported', v_assist, v_at,
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_results::text, 'UTF8')), 'hex'), p_batch,
          v_b.taken_on, v_b.support_level, v_b.source_hash);
  if v_b.support_level = 'lam_cung_co' then
    insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification, recorded_by)
    values (v_l.id, v_att, 'external_declared', 'asked_someone', '{}', 'declared', p_by);
  end if;
  perform english.eng_record_attempt_effects(v_att, v_l.id, '{}'::text[], '{}'::text[], v_tid, 1, true, v_at, false);

  select pg_catalog.jsonb_object_agg(r ->> 'item_id', pg_catalog.jsonb_build_object('kind', 'short', 'result', r ->> 'result')),
         pg_catalog.count(*) filter (where r ->> 'result' in ('correct', 'incorrect')),
         pg_catalog.count(*) filter (where r ->> 'result' = 'correct')
  into v_checks, v_counted, v_correct
  from pg_catalog.jsonb_array_elements(v_results) as r;
  insert into english.attempt_auto_checks(attempt_id, learner_id, checks)
  values (v_att, v_l.id, pg_catalog.jsonb_build_object('version', 1, 'total', pg_catalog.jsonb_array_length(v_items), 'checked', v_counted,
                                                         'correct', v_correct, 'items', v_checks));

  select coalesce(array_agg(distinct coalesce(x ->> 'tag_key', x ->> 'reading_skill_key') order by coalesce(x ->> 'tag_key', x ->> 'reading_skill_key')), '{}'::text[])
  into v_tags from pg_catalog.jsonb_array_elements(v_meta) as x;

  update english.import_batches
  set status = 'confirmed', approved_by_member = p_by, approved_at = pg_catalog.clock_timestamp(), template_id = v_tid, template_version = 1,
      attempt_id = v_att, updated_by_member = p_by
  where id = p_batch;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'import.confirmed', v_l.family_id, v_l.id,
          pg_catalog.jsonb_build_object('batch', p_batch, 'template', v_tid, 'attempt', v_att, 'counted', v_counted, 'client', p_client_id));
  return pg_catalog.jsonb_build_object('template_id', v_tid, 'version', 1, 'attempt_id', v_att, 'counted', v_counted,
                                       'tags', pg_catalog.to_jsonb(v_tags), 'replayed', false);
end
$$;
revoke execute on function english.eng_confirm_import(uuid, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_confirm_import(uuid, text, jsonb, uuid, text) to service_role;

-- 8b. Mẫu 'imported' đọc/xóa như mẫu Studio: người lớn CỦA EM đọc; xóa dữ liệu một em xóa luôn mẫu. Con không thấy (eng_my_* bỏ qua).
drop policy if exists inquiry_templates_select on english.inquiry_templates;
create policy inquiry_templates_select on english.inquiry_templates
  for select to authenticated
  using (published_at is not null and ((kind = 'topic' and english.eng_staff_has_track(track_id)) or (kind in ('studio', 'imported') and english.eng_is_staff_of(learner_id))));

create or replace function english.eng_staff_may_read_template(p_id text, p_version int) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from english.inquiry_templates t
    where t.id = p_id and t.version = p_version
      and t.published_at is not null
      and ((t.kind = 'topic' and english.eng_staff_has_track(t.track_id))
           or (t.kind in ('studio', 'imported') and english.eng_is_staff_of(t.learner_id))))
$$;
revoke execute on function english.eng_staff_may_read_template(text, int) from public, anon;
grant execute on function english.eng_staff_may_read_template(text, int) to authenticated, service_role;

create or replace function english.eng_check_studio_instance() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (
    select 1 from english.inquiry_templates t
    where t.id = new.template_id and t.version = new.template_version and t.kind in ('studio', 'imported') and t.learner_id <> new.learner_id) then
    raise exception 'inquiry_instances: a Studio or imported template belongs to one learner (studio_other_learner)' using errcode = '23514';
  end if;
  return new;
end
$$;

-- Purge: mẫu / khóa của mẫu 'imported' đi qua được như mẫu Studio (= bản 0024 + 'imported').
create or replace function english.eng_purge_allows_studio(p_table text, p_old jsonb) returns boolean
language plpgsql stable set search_path = ''
as $$
declare
  v_purge text := nullif(pg_catalog.current_setting('app.purge_learner', true), '');
  v_owner text;
begin
  if v_purge is null then return false; end if;
  select r.rolname into v_owner
  from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
  where p.oid = pg_catalog.to_regprocedure('english.eng_purge_learner(uuid,uuid)');
  if v_owner is null or current_user <> v_owner then return false; end if;
  return case p_table
    when 'inquiry_templates' then coalesce(p_old ->> 'kind' in ('studio', 'imported') and p_old ->> 'learner_id' = v_purge, false)
    when 'template_item_keys' then exists (
      select 1 from english.inquiry_templates t
      where t.id = p_old ->> 'template_id' and t.version = (p_old ->> 'template_version')::int
        and t.kind in ('studio', 'imported') and t.learner_id::text = v_purge)
    when 'template_step_sources' then exists (
      select 1 from english.inquiry_templates t
      where t.id = p_old ->> 'template_id' and t.version = (p_old ->> 'template_version')::int
        and t.kind in ('studio', 'imported') and t.learner_id::text = v_purge)
    when 'sources' then exists (
      select 1 from english.inquiry_templates t
      where t.kind = 'studio' and t.learner_id::text = v_purge and (p_old ->> 'id') like ('ST-' || t.id || '-%'))
    else false
  end;
end
$$;
revoke execute on function english.eng_purge_allows_studio(text, jsonb) from public, anon, authenticated, service_role;

-- 8c. Con không thấy bài nạp: eng_my_inquiries / eng_my_home (0009) bỏ qua mọi bài của mẫu 'imported'.
create or replace function english.eng_my_inquiries() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'instance_id', i.id,
      'title_vi', i.snapshot -> 'template' ->> 'title_vi',
      'big_question_en', i.snapshot -> 'template' ->> 'big_question_en',
      'big_question_vi', i.snapshot -> 'template' ->> 'big_question_vi',
      'due_on', i.due_on)
    order by i.assigned_at desc, i.id), '[]'::jsonb)
  from english.members m
  join english.learners l on l.member_id = m.id
  join english.inquiry_instances i on i.learner_id = l.id
  where m.user_id = auth.uid() and m.role = 'student'
    and not exists (select 1 from english.inquiry_templates t where t.id = i.template_id and t.version = i.template_version and t.kind = 'imported')
$$;

create or replace function english.eng_my_home() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('inquiries', coalesce(pg_catalog.jsonb_agg(q.obj order by q.assigned_at desc, q.id), '[]'::jsonb))
  from (
    select i.id, i.assigned_at,
      pg_catalog.jsonb_build_object(
        'instance_id', i.id,
        'title_vi', i.snapshot -> 'template' ->> 'title_vi',
        'big_question_en', i.snapshot -> 'template' ->> 'big_question_en',
        'big_question_vi', i.snapshot -> 'template' ->> 'big_question_vi',
        'due_on', i.due_on,
        'steps', (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'activity_id', a.id,
              'step_no', a.step_no,
              'activity_type', a.activity_type,
              'mode', a.mode,
              'purpose', (select coalesce(pg_catalog.jsonb_agg(p order by p), '[]'::jsonb)
                          from unnest(a.purpose) as p where p in ('delayed_check', 'transfer_check')),
              'time_min', (select (x ->> 'time_min')::int
                           from pg_catalog.jsonb_array_elements(i.snapshot -> 'steps') as x
                           where (x ->> 'step_no')::int = a.step_no),
              'date', english.eng_step_effective_date(a.id),
              'attempts', (select count(*)::int from english.attempts t where t.activity_instance_id = a.id))
            order by a.step_no)
          from english.activity_instances a
          where a.inquiry_instance_id = i.id and english.eng_activity_released(a.id))
      ) as obj
    from english.members m
    join english.learners l on l.member_id = m.id
    join english.inquiry_instances i on i.learner_id = l.id
    where m.user_id = auth.uid() and m.role = 'student'
      and not exists (select 1 from english.inquiry_templates t where t.id = i.template_id and t.version = i.template_version and t.kind = 'imported')
      and exists (select 1 from english.activity_instances a2
                  where a2.inquiry_instance_id = i.id and english.eng_activity_released(a2.id))
  ) q
$$;

-- 9. AI: việc mới "đọc bài làm" ---------------------------------------------------------------------------------------------------------
alter table english.ai_runs drop constraint if exists ai_runs_purpose_check;
alter table english.ai_runs add constraint ai_runs_purpose_check check (purpose in ('studio_extract', 'curriculum_toc', 'read_answers'));

-- Cổng AI = bản 0026 (cùng chữ ký, create or replace) với p_purpose nhận thêm 'read_answers'; p_purpose là tham số cuối, mặc định 'studio_extract'.
create or replace function english.eng_ai_gate(
  p_learner uuid, p_estimate numeric default 0, p_reserve boolean default false, p_draft uuid default null, p_model text default null, p_by uuid default null,
  p_purpose text default 'studio_extract'
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_s english.ai_settings%rowtype;
  v_consent boolean;
  v_spent numeric;
  v_cap numeric;
  v_soft numeric;
  v_est numeric := coalesce(p_estimate, 0);
  v_reason text;
  v_run uuid;
begin
  if v_est < 0 then
    raise exception 'eng_ai_gate: the estimate cannot be negative' using errcode = '22023';
  end if;
  if p_purpose is null or p_purpose not in ('studio_extract', 'curriculum_toc', 'read_answers') then
    raise exception 'eng_ai_gate: unknown purpose (bad_purpose)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_ai_gate: learner not found' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('eng_ai_gate:' || v_l.family_id::text, 0));
  select * into v_s from english.ai_settings s where s.family_id = v_l.family_id;
  select c.granted into v_consent from english.consents c
  where c.learner_id = p_learner and c.scope = 'ai_text' order by c.at desc, c.id desc limit 1;
  v_spent := english.eng_ai_month_spent(v_l.family_id);
  v_cap := coalesce(v_s.monthly_cap_usd, 10);
  v_soft := coalesce(v_s.soft_cap_usd, 8);
  v_reason := case when not coalesce(v_s.enabled, false) then 'off'
                   when not coalesce(v_consent, false) then 'no_consent'
                   when v_spent + v_est >= v_cap then 'cap'
                   else null end;
  if v_reason is null and p_reserve then
    insert into english.ai_runs(family_id, purpose, draft_id, model, input_tokens, output_tokens, cost_usd, status, error_code, by_member)
    values (v_l.family_id, p_purpose, p_draft, p_model, 0, 0, v_est, 'reserved', 'reserved', p_by)
    returning id into v_run;
  end if;
  return pg_catalog.jsonb_build_object(
    'family_id', v_l.family_id,
    'enabled', coalesce(v_s.enabled, false),
    'consent', coalesce(v_consent, false),
    'spent_usd', v_spent,
    'monthly_cap_usd', v_cap,
    'soft_cap_usd', v_soft,
    'soft_reached', v_spent >= v_soft,
    'allowed', v_reason is null,
    'reason', v_reason,
    'reservation_id', v_run);
end
$$;
revoke execute on function english.eng_ai_gate(uuid, numeric, boolean, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_ai_gate(uuid, numeric, boolean, uuid, text, uuid, text) to service_role;

-- Sổ chạy AI = bản 0026 (nới p_purpose). Dòng trả giữ chỗ phải cùng việc với dòng giữ chỗ.
create or replace function english.eng_log_ai_run(
  p_family uuid, p_draft uuid, p_model text, p_prompt_version text, p_input int, p_output int, p_cost numeric, p_status text, p_error text, p_by uuid,
  p_release uuid default null, p_purpose text default 'studio_extract'
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_family is null or p_status is null then
    raise exception 'eng_log_ai_run: family and status are required' using errcode = '22004';
  end if;
  if p_purpose is null or p_purpose not in ('studio_extract', 'curriculum_toc', 'read_answers') then
    raise exception 'eng_log_ai_run: unknown purpose (bad_purpose)' using errcode = '22023';
  end if;
  if p_release is not null then
    perform 1 from english.ai_runs r
    where r.id = p_release and r.family_id = p_family and r.status = 'reserved' and r.purpose = p_purpose
      and not exists (select 1 from english.ai_runs x where x.releases_run_id = r.id)
    for update;
    if not found then
      raise exception 'eng_log_ai_run: p_release must be an unreleased reservation of this family (bad_release)' using errcode = '23514';
    end if;
  end if;
  insert into english.ai_runs(family_id, purpose, draft_id, model, prompt_version, input_tokens, output_tokens, cost_usd, status, error_code, by_member, releases_run_id)
  values (p_family, p_purpose, p_draft, p_model, p_prompt_version, coalesce(p_input, 0), coalesce(p_output, 0), coalesce(p_cost, 0), p_status, p_error, p_by, p_release)
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function english.eng_log_ai_run(uuid, uuid, text, text, int, int, numeric, text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_log_ai_run(uuid, uuid, text, text, int, int, numeric, text, text, uuid, uuid, text) to service_role;


-- 10. Xóa dữ liệu một em: = bản 0026 + point_decisions, point_state, import_batches (giữ nguyên mọi dòng của 0026). Lần làm 'imported' nằm trong
-- attempts (đã xóa); mẫu 'imported' và khóa của mẫu đi cùng đường với mẫu Studio.
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

-- Đếm trước khi xóa = bản 0026 + 3 bảng W3 (cùng khóa với biên nhận).
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
      'import_batches', (select pg_catalog.count(*) from english.import_batches x where x.learner_id = p_learner)));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;


insert into english.schema_migrations(version) values ('0027') on conflict do nothing;
