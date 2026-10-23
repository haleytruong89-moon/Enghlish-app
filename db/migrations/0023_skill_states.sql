-- 0023_skill_states.sql
-- S7a · Trạng thái từng kỹ năng (spec docs/superpowers/specs/2026-10-23-s7a-skill-states-design.md §1–§5;
-- kế hoạch docs/superpowers/plans/2026-10-23-s7a-skill-states.md):
--   1. english.engine_policy_map: danh mục → chính sách engine dùng (0.2.1-draft → AP-0.3, seed ở 0022). Danh mục đã khóa không đổi.
--   2. english.mastery_decisions (append-only): AUTO (bậc 1–2, app tự cập nhật) · PROPOSED (bậc 3–4) · FLAG (⚑ giữ bậc) · CONFIRMED /
--      REJECTED (gia sư của em trả lời) · MANUAL (gia sư sửa tay bậc 1–2, có lý do). english.competency_state: bảng dẫn xuất, dựng lại được.
--   3. Engine chạy bằng TypeScript (lib/engine): đọc bằng chứng qua eng_engine_inputs, ghi kết quả qua eng_apply_engine_results — hàm SQL
--      kiểm lại mọi luật: không bao giờ hạ bậc, một đề xuất mở mỗi (em, kỹ năng), cùng bằng chứng không đề xuất / gắn cờ lại.
--   4. Gia sư của em: eng_decide_skill (Xác nhận / Chưa), eng_confirm_skill_proposals (Xác nhận tất cả — chỉ đề xuất lên bậc),
--      eng_set_skill_state (sửa tay bậc 1–2). Gia sư / phụ huynh: eng_reset_skill_states (tính lại từ đầu). Đọc: eng_skill_states, eng_skill_inbox.
--   5. eng_has_score_words bản mới (sửa đổi A): chỉ còn chặn 2 nhãn "Đạt yêu cầu" và "Vững, rõ ràng".
--   6. english.episode_marks (append-only, G4 phụ huynh 23/10): gia sư đánh dấu "Bài này ở chủ đề / nguồn mới (vận dụng)" trên trang duyệt bài
--      → engine coi như bước transfer_check (bậc 4). Không sửa episodes.facets (episodes bất biến). eng_mark_episode_transfer ghi.
--   7. eng_purge_learner + eng_purge_preview thêm 3 bảng mới.
-- Học sinh không đọc được bảng nào mới và không có hàm nào mới. Không đụng schema public. Idempotent; chỉ thêm (expand).
-- Cần 0019 (bản đồ kỹ năng), 0021 (bài sửa) và 0022 (AP-0.3) đã áp.

-- 0. Thiếu 0022 thì dừng ngay, nói rõ cần làm gì (thay vì lỗi khóa ngoại khó hiểu ở dưới).
do $guard$
begin
  if not exists (select 1 from english.assessment_policies p where p.version = 'AP-0.3') then
    raise exception '0023 cần chính sách AP-0.3: hãy áp 0022_seed_ap_0_3.sql trước, rồi áp lại 0023_skill_states.sql (missing_ap_0_3)' using errcode = 'P0001';
  end if;
end
$guard$;

-- 1. Chính sách engine dùng (D2) ---------------------------------------------------------------------------------------------------
-- Dòng mới nhất của một danh mục thắng; đổi = thêm dòng (không sửa, không xóa). Không ai đọc thẳng: chỉ qua eng_engine_policy.
create table if not exists english.engine_policy_map (
  id bigint generated always as identity primary key,
  catalogue_version text not null references english.catalogue_versions(version),
  policy_version text not null references english.assessment_policies(version),
  note text not null check (pg_catalog.length(pg_catalog.btrim(note)) between 1 and 300),
  set_at timestamptz not null default clock_timestamp()
);
create unique index if not exists engine_policy_map_once on english.engine_policy_map(catalogue_version, policy_version);
insert into english.engine_policy_map(catalogue_version, policy_version, note)
values ('0.2.1-draft', 'AP-0.3', 'S7a: engine dùng AP-0.3 (thêm P3-b) cho bộ A-v1 / B-v1; danh mục 0.2.1-draft đã khóa vẫn ghi AP-0.2-pilot')
on conflict (catalogue_version, policy_version) do nothing;
drop trigger if exists engine_policy_map_immutable on english.engine_policy_map;
create trigger engine_policy_map_immutable
  before update or delete on english.engine_policy_map
  for each row execute function english.eng_forbid_row_change();
drop trigger if exists engine_policy_map_immutable_truncate on english.engine_policy_map;
create trigger engine_policy_map_immutable_truncate
  before truncate on english.engine_policy_map
  for each statement execute function english.eng_forbid_row_change();
alter table english.engine_policy_map enable row level security;
revoke all on english.engine_policy_map from public, anon, authenticated, service_role;

-- Chính sách engine của một em: dòng map mới nhất của danh mục của bộ kỹ năng hiện tại; không có thì chính sách của danh mục. NULL = chưa có bộ.
create or replace function english.eng_engine_policy(p_learner uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
           (select m.policy_version from english.engine_policy_map m where m.catalogue_version = d.catalogue_version order by m.id desc limit 1),
           c.assessment_policy_version)
  from english.target_sets ts
  join english.target_set_definitions d on d.id = ts.definition_id
  join english.catalogue_versions c on c.version = d.catalogue_version
  where ts.learner_id = p_learner and ts.effective_from <= pg_catalog.clock_timestamp()
  order by ts.effective_from desc, ts.seq desc
  limit 1
$$;

-- Phạm vi của engine = các kỹ năng của bộ hiện tại (D11). NULL = chưa có bộ.
create or replace function english.eng_engine_scope(p_learner uuid) returns text[]
language sql stable security definer set search_path = ''
as $$
  select d.target_ids
  from english.target_sets ts
  join english.target_set_definitions d on d.id = ts.definition_id
  where ts.learner_id = p_learner and ts.effective_from <= pg_catalog.clock_timestamp()
  order by ts.effective_from desc, ts.seq desc
  limit 1
$$;
revoke execute on function english.eng_engine_policy(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_engine_scope(uuid) from public, anon, authenticated, service_role;

-- 2. Sổ quyết định kỹ năng + trạng thái dẫn xuất --------------------------------------------------------------------------------------
-- Bậc của một trạng thái (UX_COPY_GUIDE §3.2): 0..4; NULL = không phải trạng thái. Dùng trong CHECK.
create or replace function english.eng_skill_level(p_state text) returns int
language sql immutable set search_path = ''
as $$
  select case p_state
    when 'NOT_OBSERVED' then 0 when 'SUPPORTED' then 1 when 'DEVELOPING' then 2
    when 'INDEPENDENT' then 3 when 'TRANSFERABLE' then 4 end
$$;
revoke execute on function english.eng_skill_level(text) from public, anon;
grant execute on function english.eng_skill_level(text) to authenticated, service_role;

-- AUTO / PROPOSED / FLAG: do app ghi (không có người); CONFIRMED / REJECTED: gia sư trả lời đúng một đề xuất (responds_to); MANUAL: gia sư sửa tay
-- bậc 1–2 (có thể đóng một ⚑ đang mở). seq = thứ tự ghi (dùng cho "mới nhất"). evidence_key = khóa bằng chứng (D13).
create table if not exists english.mastery_decisions (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  learner_id uuid not null references english.learners(id),
  target_key text not null check (pg_catalog.length(pg_catalog.btrim(target_key)) between 1 and 100),
  kind text not null check (kind in ('AUTO', 'PROPOSED', 'CONFIRMED', 'REJECTED', 'MANUAL', 'FLAG')),
  from_state text not null check (english.eng_skill_level(from_state) is not null),
  to_state text not null check (english.eng_skill_level(to_state) is not null),
  route smallint check (route in (1, 2)),
  conditions jsonb not null default '[]'::jsonb check (pg_catalog.jsonb_typeof(conditions) = 'array'),
  evidence_episode_ids uuid[] not null default '{}' check (cardinality(evidence_episode_ids) <= 200),
  evidence_key text check (evidence_key is null or evidence_key ~ '^[0-9]{1,6}-[0-9a-f]{16}$'),
  policy_version text not null references english.assessment_policies(version),
  engine_version text check (engine_version is null or engine_version ~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$'),
  -- id của english.members, KHÔNG có khóa ngoại (như level_decisions.decided_by_member).
  decided_by_member uuid,
  decided_role text check (decided_role is null or decided_role = 'tutor'),
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 3 and 300),
  responds_to uuid references english.mastery_decisions(id),
  client_id text check (client_id is null or pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  constraint mastery_decisions_actor check (
    (kind in ('AUTO', 'PROPOSED', 'FLAG') and decided_by_member is null and decided_role is null and client_id is null
       and responds_to is null and engine_version is not null and evidence_key is not null)
    or (kind in ('CONFIRMED', 'REJECTED', 'MANUAL') and decided_by_member is not null and decided_role = 'tutor' and client_id is not null)),
  constraint mastery_decisions_levels check (
    (kind = 'AUTO' and english.eng_skill_level(to_state) between 1 and 2 and english.eng_skill_level(to_state) > english.eng_skill_level(from_state))
    or (kind = 'PROPOSED' and english.eng_skill_level(to_state) between 3 and 4 and english.eng_skill_level(to_state) > english.eng_skill_level(from_state))
    or (kind = 'FLAG' and to_state = from_state and english.eng_skill_level(from_state) >= 2)
    or (kind = 'CONFIRMED' and responds_to is not null)
    or (kind = 'REJECTED' and responds_to is not null and to_state = from_state and reason is not null)
    or (kind = 'MANUAL' and to_state in ('SUPPORTED', 'DEVELOPING') and to_state <> from_state and reason is not null))
);
create unique index if not exists mastery_decisions_answered_once on english.mastery_decisions(responds_to) where responds_to is not null;
-- Cùng bằng chứng không đề xuất hai lần CHO CÙNG MỘT BẬC (B1: bậc 3 và bậc 4 nhìn bằng chứng khác nhau) và không gắn cờ hai lần (D12, D13).
create unique index if not exists mastery_decisions_evidence_once on english.mastery_decisions(learner_id, target_key, to_state, evidence_key) where kind = 'PROPOSED';
create unique index if not exists mastery_decisions_flag_once on english.mastery_decisions(learner_id, target_key, evidence_key) where kind = 'FLAG';
create unique index if not exists mastery_decisions_client_once on english.mastery_decisions(learner_id, client_id, target_key) where client_id is not null;
create index if not exists mastery_decisions_learner_idx on english.mastery_decisions(learner_id, target_key, seq desc);

drop trigger if exists mastery_decisions_forbid_mutation on english.mastery_decisions;
create trigger mastery_decisions_forbid_mutation
  before update or delete on english.mastery_decisions
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists mastery_decisions_forbid_truncate on english.mastery_decisions;
create trigger mastery_decisions_forbid_truncate
  before truncate on english.mastery_decisions
  for each statement execute function english.eng_forbid_mutation();

-- Một dòng / (em, kỹ năng): bậc hiện hành, ⚑ đang mở, đề xuất đang mở (đều suy ra từ sổ) + điều kiện mới nhất engine tính (cho "Còn cần").
-- Bảng dẫn xuất (DESIGN §6 "projection"): xóa đi tính lại được (eng_reset_skill_states). Chỉ các hàm của file này ghi.
create table if not exists english.competency_state (
  learner_id uuid not null references english.learners(id),
  target_key text not null check (pg_catalog.length(pg_catalog.btrim(target_key)) between 1 and 100),
  state text not null default 'NOT_OBSERVED' check (english.eng_skill_level(state) is not null),
  state_since timestamptz,
  state_decision_id uuid references english.mastery_decisions(id),
  flag_decision_id uuid references english.mastery_decisions(id),
  proposal_decision_id uuid references english.mastery_decisions(id),
  route smallint check (route in (1, 2)),
  conditions jsonb not null default '[]'::jsonb check (pg_catalog.jsonb_typeof(conditions) = 'array'),
  evaluated_at timestamptz,
  -- Lúc engine ĐỌC bằng chứng cho các điều kiện trên (eng_engine_inputs.now): lần tính chậm hơn, đọc sớm hơn, không ghi đè điều kiện mới hơn (N2).
  inputs_at timestamptz,
  policy_version text,
  engine_version text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (learner_id, target_key)
);

-- G4: đánh dấu của người duyệt trên một episode. Chỉ thêm dòng; dòng mới nhất (seq) của (episode, mark) có hiệu lực (bỏ tick = dòng value = false).
-- Chỉ mark 'transfer_check' (bài ở chủ đề / nguồn mới - C7: là bài chuyển giao, không phải kiểm tra trễ). Chỉ ghi qua eng_mark_episode_transfer.
create table if not exists english.episode_marks (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  episode_id uuid not null references english.episodes(id),
  learner_id uuid not null references english.learners(id),
  mark text not null check (mark in ('transfer_check')),
  value boolean not null,
  -- id của english.members, KHÔNG có khóa ngoại (như level_decisions.decided_by_member).
  set_by_member uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists episode_marks_episode_idx on english.episode_marks(episode_id, mark, seq desc);
create index if not exists episode_marks_learner_idx on english.episode_marks(learner_id);
drop trigger if exists episode_marks_forbid_mutation on english.episode_marks;
create trigger episode_marks_forbid_mutation
  before update or delete on english.episode_marks
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists episode_marks_forbid_truncate on english.episode_marks;
create trigger episode_marks_forbid_truncate
  before truncate on english.episode_marks
  for each statement execute function english.eng_forbid_mutation();

-- RLS: phụ huynh / gia sư trong phạm vi đọc; học sinh không bao giờ. Không ai (kể cả service_role) ghi trực tiếp.
alter table english.mastery_decisions enable row level security;
alter table english.competency_state enable row level security;
alter table english.episode_marks enable row level security;
revoke all on english.mastery_decisions, english.competency_state, english.episode_marks from public, anon, authenticated;
revoke insert, update, delete, truncate on english.mastery_decisions, english.competency_state, english.episode_marks from public, anon, authenticated, service_role;
grant select on english.mastery_decisions, english.competency_state, english.episode_marks to authenticated;
drop policy if exists episode_marks_select on english.episode_marks;
create policy episode_marks_select on english.episode_marks
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists mastery_decisions_select on english.mastery_decisions;
create policy mastery_decisions_select on english.mastery_decisions
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists competency_state_select on english.competency_state;
create policy competency_state_select on english.competency_state
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- 3. Hàm nhỏ dùng chung (nội bộ) ---------------------------------------------------------------------------------------------------
-- Mảng id (jsonb) → uuid[] không trùng, có thứ tự.
create or replace function english.eng_uuid_array(p jsonb) returns uuid[]
language sql immutable set search_path = ''
as $$
  select coalesce(array(select distinct x::uuid from pg_catalog.jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) as t(x) order by 1), '{}'::uuid[])
$$;

-- Các dòng hỗ trợ của một lần làm (D4), kèm kỹ năng bị ảnh hưởng.
create or replace function english.eng_attempt_assistance(p_attempt uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'kind', s.kind, 'verification', s.verification, 'targets', pg_catalog.to_jsonb(s.affects_target_keys)) order by s.id), '[]'::jsonb)
  from english.assistance_events s
  where s.attempt_id = p_attempt
$$;

-- competency_state của một (em, kỹ năng) từ sổ (D15) - cùng luật với lib/engine/project.ts: bậc = AUTO / CONFIRMED / MANUAL mới nhất theo seq;
-- ⚑ / đề xuất đang mở = FLAG / PROPOSED chưa có dòng nào trả lời. Giữ nguyên điều kiện / đường / lúc tính của engine.
create or replace function english.eng_project_skill_state(p_learner uuid, p_target text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_state english.mastery_decisions%rowtype;
  v_flag uuid;
  v_prop uuid;
begin
  select d.* into v_state from english.mastery_decisions d
  where d.learner_id = p_learner and d.target_key = p_target and d.kind in ('AUTO', 'CONFIRMED', 'MANUAL')
  order by d.seq desc limit 1;
  select d.id into v_flag from english.mastery_decisions d
  where d.learner_id = p_learner and d.target_key = p_target and d.kind = 'FLAG'
    and not exists (select 1 from english.mastery_decisions a where a.responds_to = d.id)
  order by d.seq desc limit 1;
  select d.id into v_prop from english.mastery_decisions d
  where d.learner_id = p_learner and d.target_key = p_target and d.kind = 'PROPOSED'
    and not exists (select 1 from english.mastery_decisions a where a.responds_to = d.id)
  order by d.seq desc limit 1;
  insert into english.competency_state(learner_id, target_key, state, state_since, state_decision_id, flag_decision_id, proposal_decision_id, updated_at)
  values (p_learner, p_target, coalesce(v_state.to_state, 'NOT_OBSERVED'), v_state.created_at, v_state.id, v_flag, v_prop, pg_catalog.clock_timestamp())
  on conflict (learner_id, target_key) do update
    set state = excluded.state, state_since = excluded.state_since, state_decision_id = excluded.state_decision_id,
        flag_decision_id = excluded.flag_decision_id, proposal_decision_id = excluded.proposal_decision_id, updated_at = excluded.updated_at;
end
$$;

revoke execute on function english.eng_uuid_array(jsonb) from public, anon, authenticated, service_role;
revoke execute on function english.eng_attempt_assistance(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_project_skill_state(uuid, text) from public, anon, authenticated, service_role;

-- 7. Luật chữ dạng điểm, sửa đổi A (phụ huynh 23/10/2026): bản 0021 + bỏ 3 nhãn thấp ("Chưa thể hiện", "Còn thiếu nhiều", "Được một phần").
-- Danh sách mẫu chung với lib/revision/scoreWords.ts: tests/unit/fixtures/scoreWords.ts.
create or replace function english.eng_has_score_words(p_text text) returns boolean
language sql immutable set search_path = ''
as $$
  select exists (
           select 1
           from pg_catalog.regexp_matches(x.t, '((?<![^[:space:]!-/:-@[-`{-~“”‘’…–—])(?:[nN][gG][àÀ][yY]|[hH][ôÔ][mM]|[tT][ừỪ]|[đĐ][ếẾ][nN]|[tT][ớỚ][iI]|[tT][rR][ưƯ][ớỚ][cC]|[sS][aA][uU]|[hH][ạẠ][nN]|[tT][hH][áÁ][nN][gG])[[:space:]]*)?(?<![0-9])([0-9]+)[[:space:]]*/[[:space:]]*([0-9]+)(?![0-9])(?:([[:space:]]*/[[:space:]]*[0-9])|([[:space:]]*[tT][rR][aA][nN][gG](?![^[:space:]!-/:-@[-`{-~“”‘’…–—])))?', 'g') m
           where m[1] is null and m[4] is null and m[5] is null and m[3] ~ '^0*(10|[1-9])$' and m[2]::numeric <= m[3]::numeric)
      or x.t ~ '[0-9][[:space:]!-/:-@[-`{-~“”‘’…–—]*(?:[^[:space:]!-/:-@[-`{-~“”‘’…–—0-9]+[[:space:]!-/:-@[-`{-~“”‘’…–—]+)?(?:[đĐ][iI][ểỂ][mM]|[dD][iI][eE][mM]|[đĐ](?![^[:space:]!-/:-@[-`{-~“”‘’…–—]))'
      or x.t ~ '(?:[đĐ][iI][ểỂ][mM]|[dD][iI][eE][mM]|[đĐ](?![^[:space:]!-/:-@[-`{-~“”‘’…–—]))[[:space:]!-/:-@[-`{-~“”‘’…–—]*(?:[^[:space:]!-/:-@[-`{-~“”‘’…–—0-9]+[[:space:]!-/:-@[-`{-~“”‘’…–—]+)?[0-9]'
      or x.t ~ '[0-9][[:space:]]*[tT][rR][êÊ][nN][[:space:]]*0*(10|[1-9])(?![0-9])'
      or x.t ~ '[0-9][[:space:]]*%'
      or x.t ~ '[đĐ][ạẠ][tT],?[[:space:]]+[yY][êÊ][uU],?[[:space:]]+[cC][ầẦ][uU]|[vV][ữỮ][nN][gG],?[[:space:]]+[rR][õÕ],?[[:space:]]+[rR][àÀ][nN][gG]'
  from (select pg_catalog.translate(normalize(coalesce(p_text, ''), nfc), pg_catalog.chr(160) || pg_catalog.chr(8239) || pg_catalog.chr(12288), '   ') as t) x
$$;

-- 4. Engine: đọc bằng chứng, ghi kết quả (service_role; máy chủ gọi sau requireAccess, hoặc ngay sau một lần ghi đã qua requireAccess) -----
-- Bằng chứng của các kỹ năng trong bộ hiện tại của em (p_targets = chỉ một phần của bộ; mã ngoài bộ bị bỏ qua, D11):
--   episodes  = bài có quyết định duyệt hiện hành (AGREE / MODIFY chưa bị thay) cho ít nhất một kỹ năng đó (§2 "chỉ bằng chứng đã duyệt");
--   auto      = câu đóng app tự chấm (correct / incorrect / blank; needs_person không tính) gắn kỹ năng đó trong ảnh chụp bài giao (P3-b);
--   exposures = lần luyện (cho khoảng cách "≥ 14 ngày"); decisions = sổ quyết định kỹ năng.
-- Không đọc results / tag_marks / reading_reports / recheck_events (tín hiệu, D32).
create or replace function english.eng_engine_inputs(p_learner uuid, p_targets text[] default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_policy text;
  v_map text := english.eng_current_skill_map();
  v_keys text[];
begin
  if p_learner is null then
    raise exception 'eng_engine_inputs: learner id is required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_engine_inputs: learner not found' using errcode = 'P0002';
  end if;
  v_policy := english.eng_engine_policy(p_learner);
  v_keys := array(
    select u.k from unnest(coalesce(english.eng_engine_scope(p_learner), '{}'::text[])) with ordinality as u(k, o)
    where p_targets is null or u.k = any (p_targets)
    order by u.o);

  return pg_catalog.jsonb_build_object(
    'learner_id', p_learner,
    'now', pg_catalog.clock_timestamp(),
    'policy', case when v_policy is null then null else pg_catalog.jsonb_build_object(
      'version', v_policy,
      'config', (select p.config from english.assessment_policies p where p.version = v_policy)) end,
    'targets', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'key', u.k,
               'domain', (select g.domain_key from english.skill_leaves sl
                          join english.skill_groups g on g.map_id = sl.map_id and g.key = sl.group_key
                          where sl.map_id = v_map and sl.kind = 'target' and sl.track_id = v_l.track_id and sl.ref_key = u.k))
             order by u.o)
      from unnest(v_keys) with ordinality as u(k, o)), '[]'::jsonb),
    'episodes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'episode_id', e.id, 'attempt_id', t.id, 'activity_id', t.activity_instance_id, 'at', t.submitted_at,
               'context_id', e.context_id, 'is_first_attempt', e.is_first_attempt, 'mode', t.mode,
               'observed_directly', e.observed_directly, 'facets', e.facets,
               -- G4: dòng mới nhất của dấu "chủ đề / nguồn mới" (episode_marks) quyết định; không có dòng = false.
               'transfer_marked', coalesce((select m.value from english.episode_marks m where m.episode_id = e.id and m.mark = 'transfer_check'
                                            order by m.seq desc limit 1), false),
               -- id của dòng dấu đang có hiệu lực (bỏ tick rồi tick lại = dòng mới = bằng chứng mới, B1); null = không đang tick.
               'transfer_mark_id', (select m.id from english.episode_marks m
                                    where m.value and m.id = (select l.id from english.episode_marks l where l.episode_id = e.id and l.mark = 'transfer_check'
                                                              order by l.seq desc limit 1)),
               'declared_unknown', 'unknown' = any (t.declared_assistance),
               'assistance', english.eng_attempt_assistance(t.id),
               'scores', sc.scores)
             order by t.submitted_at, e.id)
      from english.episodes e
      join english.attempts t on t.id = e.attempt_id
      cross join lateral (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                 'target_key', vd.target_key, 'decision_id', vd.id, 'decided_at', vd.created_at, 'score', vd.final_score, 'not_observed', vd.final_not_observed)
               order by vd.target_key) as scores
        from english.validation_decisions vd
        where vd.episode_id = e.id and vd.target_key = any (v_keys) and vd.decision in ('AGREE', 'MODIFY')
          and not exists (select 1 from english.validation_decisions s where s.supersedes_id = vd.id)) sc
      where e.learner_id = p_learner and sc.scores is not null), '[]'::jsonb),
    'auto', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'attempt_id', t.id, 'episode_id', e.id, 'activity_id', t.activity_instance_id, 'at', t.submitted_at,
               'is_first_attempt', e.is_first_attempt, 'mode', t.mode, 'facets', e.facets,
               'declared_unknown', 'unknown' = any (t.declared_assistance),
               'assistance', english.eng_attempt_assistance(t.id),
               'items', it.items)
             order by t.submitted_at, t.id)
      from english.attempt_auto_checks c
      join english.attempts t on t.id = c.attempt_id
      join english.episodes e on e.attempt_id = t.id
      join english.activity_instances a on a.id = t.activity_instance_id
      join english.inquiry_instances i on i.id = a.inquiry_instance_id
      cross join lateral (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                 'item_id', x ->> 'id', 'target_key', x ->> 'target_id', 'result', c.checks -> 'items' -> (x ->> 'id') ->> 'result')
               order by x ->> 'id') as items
        from pg_catalog.jsonb_array_elements(i.snapshot -> 'steps') as st
        cross join lateral pg_catalog.jsonb_array_elements(coalesce(st -> 'items', '[]'::jsonb)) as x
        where (st ->> 'step_no')::int = a.step_no
          and x ->> 'target_id' = any (v_keys)
          and (c.checks -> 'items' -> (x ->> 'id') ->> 'result') in ('correct', 'incorrect', 'blank')) it
      where c.learner_id = p_learner and it.items is not null), '[]'::jsonb),
    'exposures', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'target_key', x.target_key, 'at', x.at, 'attempt_id', x.attempt_id, 'context_id', e.context_id)
             order by x.at, x.id)
      from english.exposure_log x
      left join english.episodes e on e.attempt_id = x.attempt_id
      where x.learner_id = p_learner and x.target_key = any (v_keys)), '[]'::jsonb),
    'decisions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', d.id, 'seq', d.seq, 'target_key', d.target_key, 'kind', d.kind, 'from_state', d.from_state, 'to_state', d.to_state,
               'evidence_key', d.evidence_key, 'responds_to', d.responds_to, 'created_at', d.created_at)
             order by d.seq)
      from english.mastery_decisions d
      where d.learner_id = p_learner and d.target_key = any (v_keys)), '[]'::jsonb));
end
$$;

-- Ghi kết quả của engine cho một em (lib/engine/runner.ts). Hàm KIỂM LẠI mọi luật trước khi ghi (máy chủ có lỗi cũng không hạ bậc được):
--   AUTO     chỉ bậc 1–2, chỉ đi lên (§1 mục 1);
--   PROPOSED chỉ bậc 3–4, cao hơn bậc hiện tại, bậc 4 chỉ từ "Tự làm được", không có đề xuất đang mở, chưa từng đề xuất cùng (bậc, khóa bằng chứng) (D13, B1);
--   AUTO và PROPOSED đều dừng khi bậc hiện tại do gia sư sửa tay trên đúng bằng chứng này (B2: chỉ bằng chứng MỚI mới làm engine đi tiếp);
--   FLAG     chỉ khi bậc ≥ 2, không có ⚑ đang mở, chưa từng gắn cờ cùng khóa bằng chứng (D12); bậc giữ nguyên.
-- Rồi cập nhật competency_state (bậc, ⚑, đề xuất từ sổ; điều kiện / đường / lúc tính từ engine). Khóa dòng em: hai lần tính cùng lúc xếp hàng.
create or replace function english.eng_apply_engine_results(p_learner uuid, p_results jsonb, p_engine_version text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_policy text;
  v_scope text[];
  v_r jsonb;
  v_key text;
  v_cur english.competency_state%rowtype;
  v_to text;
  v_route smallint;
  v_auto_route smallint;
  v_basis timestamptz;
  v_held boolean;
  v_auto int := 0;
  v_proposed int := 0;
  v_flagged int := 0;
begin
  if p_learner is null or p_results is null or p_engine_version is null then
    raise exception 'eng_apply_engine_results: learner, results and engine version are required' using errcode = '22004';
  end if;
  if pg_catalog.jsonb_typeof(p_results) <> 'array' or p_engine_version !~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$' then
    raise exception 'eng_apply_engine_results: results must be an array and the engine version a short name (bad_results)' using errcode = '22023';
  end if;
  perform 1 from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_apply_engine_results: learner not found' using errcode = 'P0002';
  end if;
  v_policy := english.eng_engine_policy(p_learner);
  v_scope := english.eng_engine_scope(p_learner);
  if v_policy is null or v_scope is null then
    raise exception 'eng_apply_engine_results: this learner has no skill set yet (no_target_set)' using errcode = 'P0002';
  end if;

  for v_r in select x from pg_catalog.jsonb_array_elements(p_results) as x loop
    v_key := v_r ->> 'target_key';
    if v_key is null or not (v_key = any (v_scope)) then
      raise exception 'eng_apply_engine_results: % is not a skill of this learner''s set (not_in_set)', coalesce(v_key, 'null') using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(coalesce(v_r -> 'conditions', 'null'::jsonb)) <> 'array'
       or coalesce(v_r ->> 'evidence_key', '') !~ '^[0-9]{1,6}-[0-9a-f]{16}$'
       or coalesce(v_r ->> 'route', '1') not in ('1', '2') then
      raise exception 'eng_apply_engine_results: conditions must be an array, the evidence key well-formed and the route 1 or 2 (bad_results)' using errcode = '22023';
    end if;
    v_route := (v_r ->> 'route')::smallint;
    v_auto_route := coalesce((v_r ->> 'auto_route')::smallint, v_route);
    if v_auto_route is not null and v_auto_route not in (1, 2) then
      raise exception 'eng_apply_engine_results: the auto route must be 1 or 2 (bad_results)' using errcode = '22023';
    end if;
    v_basis := coalesce((v_r ->> 'computed_at')::timestamptz, pg_catalog.clock_timestamp());
    perform english.eng_project_skill_state(p_learner, v_key);
    select * into v_cur from english.competency_state c where c.learner_id = p_learner and c.target_key = v_key;
    -- B2: a level a tutor set by hand stands until there is NEW evidence: while the evidence key is the one stored on the latest state
    -- row (when that row is a MANUAL), the engine writes neither AUTO nor PROPOSED for this skill.
    v_held := exists (select 1 from english.mastery_decisions m
                      where m.id = v_cur.state_decision_id and m.kind = 'MANUAL' and m.evidence_key is not null and m.evidence_key = v_r ->> 'evidence_key');

    -- (1) Bậc 1–2: app tự cập nhật, chỉ đi lên.
    v_to := v_r ->> 'auto';
    if not v_held and v_to is not null and english.eng_skill_level(v_to) between 1 and 2
       and english.eng_skill_level(v_to) > english.eng_skill_level(v_cur.state) then
      insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, route, conditions, evidence_episode_ids,
                                            evidence_key, policy_version, engine_version)
      values (p_learner, v_key, 'AUTO', v_cur.state, v_to, v_auto_route, v_r -> 'conditions', english.eng_uuid_array(v_r -> 'evidence' -> 'auto'),
              v_r ->> 'evidence_key', v_policy, p_engine_version);
      v_auto := v_auto + 1;
      perform english.eng_project_skill_state(p_learner, v_key);
      select * into v_cur from english.competency_state c where c.learner_id = p_learner and c.target_key = v_key;
    end if;

    -- (2) Bậc 3–4: chỉ đề xuất. Khóa = bằng chứng mà điều kiện của bậc đó thực sự dùng (S3); "đã đề xuất rồi" tính theo (bậc, khóa) (B1).
    v_to := v_r ->> 'propose';
    if not v_held and v_to is not null and english.eng_skill_level(v_to) between 3 and 4
       and coalesce(v_r ->> 'propose_key', '') ~ '^[0-9]{1,6}-[0-9a-f]{16}$'
       and english.eng_skill_level(v_to) > english.eng_skill_level(v_cur.state)
       and (v_to <> 'TRANSFERABLE' or v_cur.state = 'INDEPENDENT')
       and v_cur.proposal_decision_id is null
       and not exists (select 1 from english.mastery_decisions d
                       where d.learner_id = p_learner and d.target_key = v_key and d.kind = 'PROPOSED' and d.to_state = v_to
                         and d.evidence_key = v_r ->> 'propose_key') then
      insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, route, conditions, evidence_episode_ids,
                                            evidence_key, policy_version, engine_version)
      values (p_learner, v_key, 'PROPOSED', v_cur.state, v_to, v_route, v_r -> 'conditions', english.eng_uuid_array(v_r -> 'evidence' -> 'propose'),
              v_r ->> 'propose_key', v_policy, p_engine_version);
      v_proposed := v_proposed + 1;
      perform english.eng_project_skill_state(p_learner, v_key);
      select * into v_cur from english.competency_state c where c.learner_id = p_learner and c.target_key = v_key;
    end if;

    -- (3) ⚑ "Cần thầy/cô xem lại": bậc giữ nguyên.
    if coalesce((v_r ->> 'raise_flag')::boolean, false)
       and coalesce(v_r ->> 'flag_key', '') ~ '^[0-9]{1,6}-[0-9a-f]{16}$'
       and english.eng_skill_level(v_cur.state) >= 2
       and v_cur.flag_decision_id is null
       and not exists (select 1 from english.mastery_decisions d
                       where d.learner_id = p_learner and d.target_key = v_key and d.kind = 'FLAG' and d.evidence_key = v_r ->> 'flag_key') then
      insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, route, conditions, evidence_episode_ids,
                                            evidence_key, policy_version, engine_version)
      values (p_learner, v_key, 'FLAG', v_cur.state, v_cur.state, null, v_r -> 'conditions', english.eng_uuid_array(v_r -> 'evidence' -> 'flag'),
              v_r ->> 'flag_key', v_policy, p_engine_version);
      v_flagged := v_flagged + 1;
      perform english.eng_project_skill_state(p_learner, v_key);
    end if;

    -- (4) Điều kiện mới nhất (cho "Còn cần"), đường, lúc tính.
    -- N2: a slower computation that READ older evidence never overwrites the conditions of a newer one (the level guards above are unchanged).
    update english.competency_state c
    set conditions = v_r -> 'conditions', route = v_route, evaluated_at = pg_catalog.clock_timestamp(), inputs_at = v_basis,
        policy_version = v_policy, engine_version = p_engine_version
    where c.learner_id = p_learner and c.target_key = v_key and (c.inputs_at is null or c.inputs_at <= v_basis);
  end loop;

  return pg_catalog.jsonb_build_object('auto', v_auto, 'proposed', v_proposed, 'flagged', v_flagged, 'policy_version', v_policy);
end
$$;

-- "Tính lại từ đầu" (§3 bước 6), phần cơ sở dữ liệu: xóa competency_state của em rồi dựng lại từ sổ (mọi kỹ năng của bộ + mọi kỹ năng có trong sổ).
-- Máy chủ chạy lại engine ngay sau (lib/engine/runner.ts rebuildLearner) để điền điều kiện; luật của eng_apply_engine_results làm cho việc này
-- không tạo đề xuất trùng. Gia sư của em hoặc phụ huynh của gia đình.
create or replace function english.eng_reset_skill_states(p_learner uuid, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_key text;
  v_n int := 0;
begin
  if p_learner is null or p_by is null then
    raise exception 'eng_reset_skill_states: learner and actor are required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_reset_skill_states: learner not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_reset_skill_states: only a tutor of this learner or the family''s parent rebuilds (staff_only)' using errcode = '42501';
  end if;

  delete from english.competency_state c where c.learner_id = p_learner;
  for v_key in
    select k from unnest(coalesce(english.eng_engine_scope(p_learner), '{}'::text[])) as k
    union
    select d.target_key from english.mastery_decisions d where d.learner_id = p_learner
    order by 1
  loop
    perform english.eng_project_skill_state(p_learner, v_key);
    v_n := v_n + 1;
  end loop;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'skill_states.rebuilt', v_l.family_id, p_learner, pg_catalog.jsonb_build_object('targets', v_n));
  return pg_catalog.jsonb_build_object('targets', v_n);
end
$$;

revoke execute on function english.eng_engine_inputs(uuid, text[]) from public, anon, authenticated;
grant execute on function english.eng_engine_inputs(uuid, text[]) to service_role;
revoke execute on function english.eng_apply_engine_results(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function english.eng_apply_engine_results(uuid, jsonb, text) to service_role;
revoke execute on function english.eng_reset_skill_states(uuid, uuid) from public, anon, authenticated;
grant execute on function english.eng_reset_skill_states(uuid, uuid) to service_role;


-- 5. Gia sư của em trả lời (Xác nhận / Chưa / Xác nhận tất cả) hoặc sửa tay bậc 1–2 -------------------------------------------------------
-- Chỉ gia sư còn quan hệ hiệu lực với em (§1 mục 2, kiểu D15); phụ huynh xem. Lỗi có thẻ (tag) cuối câu để màn hình giải thích.
-- Một đề xuất / ⚑ chỉ được trả lời một lần (chỉ mục duy nhất responds_to). Gửi lại cùng client id + cùng việc = trả lại dòng cũ.
create or replace function english.eng_decide_skill(p_decision uuid, p_action text, p_reason text, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_d english.mastery_decisions%rowtype;
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_prev english.mastery_decisions%rowtype;
  v_cur english.competency_state%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_kind text;
  v_to text;
  v_id uuid;
begin
  if p_decision is null or p_action is null or p_by is null or p_client_id is null then
    raise exception 'eng_decide_skill: decision, action, actor and client id are required' using errcode = '22004';
  end if;
  if p_action not in ('confirm', 'reject') then
    raise exception 'eng_decide_skill: action must be confirm or reject (bad_action)' using errcode = '22023';
  end if;
  select * into v_d from english.mastery_decisions d where d.id = p_decision;
  if not found then
    raise exception 'eng_decide_skill: proposal not found' using errcode = 'P0002';
  end if;
  select * into v_l from english.learners l where l.id = v_d.learner_id for update;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'tutor' or not english.eng_actor_may_manage(p_by, v_d.learner_id) then
    raise exception 'eng_decide_skill: only a tutor of this learner confirms a skill level (tutor_only)' using errcode = '42501';
  end if;
  v_kind := case p_action when 'confirm' then 'CONFIRMED' else 'REJECTED' end;

  select * into v_prev from english.mastery_decisions a where a.responds_to = p_decision;
  if found then
    if v_prev.client_id = p_client_id and v_prev.kind = v_kind and v_prev.decided_by_member = p_by then
      return pg_catalog.jsonb_build_object('id', v_prev.id, 'target_key', v_prev.target_key, 'replayed', true);
    end if;
    raise exception 'eng_decide_skill: this proposal was already answered (already_answered)' using errcode = '23505';
  end if;
  if v_d.kind not in ('PROPOSED', 'FLAG') then
    raise exception 'eng_decide_skill: only a proposal or a flag can be answered (not_a_proposal)' using errcode = '22023';
  end if;
  if v_d.kind = 'FLAG' and p_action = 'reject' then
    raise exception 'eng_decide_skill: a flag is kept ("Giữ bậc") or the level is set by hand, never rejected (flag_keep_or_edit)' using errcode = '22023';
  end if;
  if v_reason is not null and pg_catalog.length(v_reason) > 300 then
    raise exception 'eng_decide_skill: the reason is too long (reason_too_long)' using errcode = '22023';
  end if;
  if p_action = 'reject' and (v_reason is null or pg_catalog.length(v_reason) < 3) then
    raise exception 'eng_decide_skill: "Chưa" needs a reason (reason_required)' using errcode = '23514';
  end if;

  perform english.eng_project_skill_state(v_d.learner_id, v_d.target_key);
  select * into v_cur from english.competency_state c where c.learner_id = v_d.learner_id and c.target_key = v_d.target_key;
  if v_d.kind = 'PROPOSED' and p_action = 'confirm' and v_d.to_state = 'TRANSFERABLE' and v_cur.state <> 'INDEPENDENT' then
    raise exception 'eng_decide_skill: the level changed since this proposal; reload the page (stale_proposal)' using errcode = '23514';
  end if;
  -- Xác nhận đề xuất → bậc mới; xác nhận ⚑ ("Giữ bậc") hoặc "Chưa" → bậc giữ nguyên.
  v_to := case when v_d.kind = 'PROPOSED' and p_action = 'confirm' then v_d.to_state else v_cur.state end;
  insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, route, conditions, evidence_episode_ids, policy_version,
                                        decided_by_member, decided_role, reason, responds_to, client_id)
  values (v_d.learner_id, v_d.target_key, v_kind, v_cur.state, v_to, v_d.route, v_d.conditions, v_d.evidence_episode_ids,
          coalesce(english.eng_engine_policy(v_d.learner_id), v_d.policy_version), p_by, 'tutor', v_reason, p_decision, p_client_id)
  returning id into v_id;
  perform english.eng_project_skill_state(v_d.learner_id, v_d.target_key);

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, case v_kind when 'CONFIRMED' then 'skill.confirmed' else 'skill.rejected' end, v_l.family_id, v_d.learner_id,
          pg_catalog.jsonb_build_object('decision', v_id, 'responds_to', p_decision, 'target_key', v_d.target_key, 'answered', v_d.kind, 'to_state', v_to));
  return pg_catalog.jsonb_build_object('id', v_id, 'target_key', v_d.target_key, 'replayed', false);
end
$$;

-- "Xác nhận tất cả" (§3 bước 4): đúng các đề xuất lên bậc mà màn hình đã hiện (p_ids), cùng một lần; ⚑ không bao giờ đi cùng. Tất cả hoặc không.
create or replace function english.eng_confirm_skill_proposals(p_learner uuid, p_ids uuid[], p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_d english.mastery_decisions%rowtype;
  v_cur english.competency_state%rowtype;
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  if p_learner is null or p_ids is null or p_by is null or p_client_id is null then
    raise exception 'eng_confirm_skill_proposals: learner, ids, actor and client id are required' using errcode = '22004';
  end if;
  if cardinality(p_ids) not between 1 and 50 or cardinality(p_ids) <> (select pg_catalog.count(distinct x) from unnest(p_ids) as x) then
    raise exception 'eng_confirm_skill_proposals: 1 to 50 different proposals (bad_ids)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_confirm_skill_proposals: learner not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_confirm_skill_proposals: only a tutor of this learner confirms skill levels (tutor_only)' using errcode = '42501';
  end if;

  if exists (select 1 from english.mastery_decisions a where a.learner_id = p_learner and a.client_id = p_client_id) then
    if not exists (select 1 from english.mastery_decisions a
                   where a.learner_id = p_learner and a.client_id = p_client_id and (a.kind <> 'CONFIRMED' or a.decided_by_member <> p_by))
       and (select array_agg(a.responds_to order by a.responds_to) from english.mastery_decisions a where a.learner_id = p_learner and a.client_id = p_client_id)
           = (select array_agg(x order by x) from unnest(p_ids) as x) then
      return pg_catalog.jsonb_build_object(
        'ids', (select pg_catalog.jsonb_agg(a.id order by a.seq) from english.mastery_decisions a where a.learner_id = p_learner and a.client_id = p_client_id),
        'replayed', true);
    end if;
    raise exception 'eng_confirm_skill_proposals: this client id was already used for other decisions (client_reused)' using errcode = '23505';
  end if;
  if exists (select 1 from unnest(p_ids) as x where not exists (select 1 from english.mastery_decisions d where d.id = x and d.learner_id = p_learner)) then
    raise exception 'eng_confirm_skill_proposals: a proposal of this learner was not found (not_found)' using errcode = 'P0002';
  end if;
  if exists (select 1 from english.mastery_decisions d where d.id = any (p_ids) and d.kind = 'FLAG') then
    raise exception 'eng_confirm_skill_proposals: a flag is looked at one by one, never confirmed in bulk (flag_not_bulk)' using errcode = '22023';
  end if;
  if exists (select 1 from english.mastery_decisions d where d.id = any (p_ids) and d.kind <> 'PROPOSED') then
    raise exception 'eng_confirm_skill_proposals: only proposals can be confirmed (not_a_proposal)' using errcode = '22023';
  end if;
  if exists (select 1 from english.mastery_decisions a where a.responds_to = any (p_ids)) then
    raise exception 'eng_confirm_skill_proposals: a proposal was already answered (already_answered)' using errcode = '23505';
  end if;

  for v_d in select d.* from english.mastery_decisions d where d.id = any (p_ids) order by d.seq loop
    perform english.eng_project_skill_state(p_learner, v_d.target_key);
    select * into v_cur from english.competency_state c where c.learner_id = p_learner and c.target_key = v_d.target_key;
    if v_d.to_state = 'TRANSFERABLE' and v_cur.state <> 'INDEPENDENT' then
      raise exception 'eng_confirm_skill_proposals: a level changed since the proposal; reload the page (stale_proposal)' using errcode = '23514';
    end if;
    insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, route, conditions, evidence_episode_ids, policy_version,
                                          decided_by_member, decided_role, responds_to, client_id)
    values (p_learner, v_d.target_key, 'CONFIRMED', v_cur.state, v_d.to_state, v_d.route, v_d.conditions, v_d.evidence_episode_ids,
            coalesce(english.eng_engine_policy(p_learner), v_d.policy_version), p_by, 'tutor', v_d.id, p_client_id)
    returning id into v_id;
    v_ids := v_ids || v_id;
    perform english.eng_project_skill_state(p_learner, v_d.target_key);
  end loop;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'skill.confirmed_all', v_l.family_id, p_learner, pg_catalog.jsonb_build_object('count', cardinality(v_ids)));
  return pg_catalog.jsonb_build_object('ids', pg_catalog.to_jsonb(v_ids), 'replayed', false);
end
$$;

-- Gia sư sửa tay bậc 1–2 (§3 bước 5; G3): có lý do; đóng ⚑ đang mở của kỹ năng đó. Không bao giờ đặt bậc 3–4 bằng tay (chỉ qua đề xuất).
create or replace function english.eng_set_skill_state(p_learner uuid, p_target text, p_state text, p_reason text, p_by uuid, p_client_id text, p_evidence_key text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_prev english.mastery_decisions%rowtype;
  v_cur english.competency_state%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  if p_learner is null or p_target is null or p_state is null or p_by is null or p_client_id is null then
    raise exception 'eng_set_skill_state: learner, skill, state, actor and client id are required' using errcode = '22004';
  end if;
  if p_state not in ('SUPPORTED', 'DEVELOPING') then
    raise exception 'eng_set_skill_state: a level is set by hand only to 1 or 2 (manual_levels_1_2)' using errcode = '22023';
  end if;
  if p_evidence_key is not null and p_evidence_key !~ '^[0-9]{1,6}-[0-9a-f]{16}$' then
    raise exception 'eng_set_skill_state: the evidence key is not well-formed (bad_evidence_key)' using errcode = '22023';
  end if;
  if v_reason is not null and pg_catalog.length(v_reason) > 300 then
    raise exception 'eng_set_skill_state: the reason is too long (reason_too_long)' using errcode = '22023';
  end if;
  if v_reason is null or pg_catalog.length(v_reason) < 3 then
    raise exception 'eng_set_skill_state: a level set by hand needs a reason (reason_required)' using errcode = '23514';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_set_skill_state: learner not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_set_skill_state: only a tutor of this learner sets a skill level (tutor_only)' using errcode = '42501';
  end if;
  if not (p_target = any (coalesce(english.eng_engine_scope(p_learner), '{}'::text[]))) then
    raise exception 'eng_set_skill_state: this skill is not in the learner''s set (not_in_set)' using errcode = '22023';
  end if;

  select * into v_prev from english.mastery_decisions a where a.learner_id = p_learner and a.client_id = p_client_id and a.target_key = p_target;
  if found then
    if v_prev.kind = 'MANUAL' and v_prev.to_state = p_state and v_prev.decided_by_member = p_by then
      return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true);
    end if;
    raise exception 'eng_set_skill_state: this client id was already used (client_reused)' using errcode = '23505';
  end if;
  perform english.eng_project_skill_state(p_learner, p_target);
  select * into v_cur from english.competency_state c where c.learner_id = p_learner and c.target_key = p_target;
  if v_cur.state = p_state then
    raise exception 'eng_set_skill_state: the new level is the current one (same_state)' using errcode = '23514';
  end if;

  -- B2: p_evidence_key = the engine's key of the evidence the tutor was looking at (lib/engine/runner.ts evidenceKeyFor). The engine writes
  -- nothing for this skill until the key changes, i.e. until there is new evidence.
  insert into english.mastery_decisions(learner_id, target_key, kind, from_state, to_state, evidence_key, policy_version, decided_by_member, decided_role,
                                        reason, responds_to, client_id)
  values (p_learner, p_target, 'MANUAL', v_cur.state, p_state, p_evidence_key, coalesce(english.eng_engine_policy(p_learner), 'AP-0.3'), p_by, 'tutor',
          v_reason, v_cur.flag_decision_id, p_client_id)
  returning id into v_id;
  perform english.eng_project_skill_state(p_learner, p_target);

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'skill.manual', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('decision', v_id, 'target_key', p_target, 'from_state', v_cur.state, 'to_state', p_state));
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- G4 (phụ huynh 23/10): gia sư đánh dấu "Bài này ở chủ đề / nguồn mới (vận dụng)" trên một bài. CHỈ gia sư của em (quan hệ còn hiệu lực; S1,
-- "thầy/cô tick"): phụ huynh chỉ xem. Chỉ lần làm đầu và không phải bài sửa.
-- Ghi thêm dòng episode_marks (không sửa episodes.facets); dòng mới nhất quyết định. Gửi lại cùng giá trị = không ghi (replayed).
create or replace function english.eng_mark_episode_transfer(p_episode uuid, p_value boolean, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_e english.episodes%rowtype;
  v_a english.attempts%rowtype;
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_role text;
  v_last boolean;
  v_id uuid;
begin
  if p_episode is null or p_value is null or p_by is null then
    raise exception 'eng_mark_episode_transfer: episode, value and actor are required' using errcode = '22004';
  end if;
  select * into v_e from english.episodes e where e.id = p_episode for share;
  if not found then
    raise exception 'eng_mark_episode_transfer: episode not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  v_role := english.eng_review_role(p_episode, p_by);
  if v_m.id is null or v_role is null then
    raise exception 'eng_mark_episode_transfer: only someone who may review this work marks it (not_reviewer)' using errcode = '42501';
  end if;
  -- S1: the mark decides what counts as a transfer (level 4), so only the child's tutor sets it; the parent sees it, never sets it (D18).
  if v_role <> 'tutor' then
    raise exception 'eng_mark_episode_transfer: only the child''s tutor marks work as a new topic / source (tutor_only) (D15)' using errcode = '42501';
  end if;
  select * into v_a from english.attempts t where t.id = v_e.attempt_id;
  if not v_e.is_first_attempt or v_a.revises_attempt_id is not null or v_a.mode = 'REVISION' then
    raise exception 'eng_mark_episode_transfer: only a first attempt that is not a revision can be marked (first_attempt_only)' using errcode = '22023';
  end if;
  select m.value into v_last from english.episode_marks m where m.episode_id = p_episode and m.mark = 'transfer_check' order by m.seq desc limit 1;
  if coalesce(v_last, false) = p_value then
    return pg_catalog.jsonb_build_object('value', p_value, 'replayed', true);
  end if;
  select * into v_l from english.learners l where l.id = v_e.learner_id;
  insert into english.episode_marks(episode_id, learner_id, mark, value, set_by_member)
  values (p_episode, v_e.learner_id, 'transfer_check', p_value, p_by)
  returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'episode.transfer_marked', v_l.family_id, v_e.learner_id,
          pg_catalog.jsonb_build_object('episode', p_episode, 'mark', v_id, 'value', p_value));
  return pg_catalog.jsonb_build_object('value', p_value, 'replayed', false);
end
$$;

revoke execute on function english.eng_decide_skill(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_decide_skill(uuid, text, text, uuid, text) to service_role;
revoke execute on function english.eng_confirm_skill_proposals(uuid, uuid[], uuid, text) from public, anon, authenticated;
grant execute on function english.eng_confirm_skill_proposals(uuid, uuid[], uuid, text) to service_role;
revoke execute on function english.eng_set_skill_state(uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function english.eng_set_skill_state(uuid, text, text, text, uuid, text, text) to service_role;

-- 6. Đọc (phụ huynh / gia sư; máy chủ gọi sau requireAccess / requireStaff) -----------------------------------------------------------
-- Trạng thái mọi kỹ năng của bộ hiện tại, theo thứ tự của bộ (Kỹ năng đang theo dõi, Hồ sơ cấp). Kỹ năng chưa có dòng = "Chưa đủ bài".
create or replace function english.eng_skill_states(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_def english.target_set_definitions%rowtype;
  v_map text := english.eng_current_skill_map();
begin
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_skill_states: learner not found' using errcode = 'P0002';
  end if;
  select d.* into v_def
  from english.target_sets ts join english.target_set_definitions d on d.id = ts.definition_id
  where ts.learner_id = p_learner and ts.effective_from <= pg_catalog.clock_timestamp()
  order by ts.effective_from desc, ts.seq desc limit 1;

  return pg_catalog.jsonb_build_object(
    'policy_version', english.eng_engine_policy(p_learner),
    'set_id', v_def.id,
    'rows', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'target_key', u.k,
               'title_vi', t.title_vi,
               'domain_key', (select g.domain_key from english.skill_leaves sl
                              join english.skill_groups g on g.map_id = sl.map_id and g.key = sl.group_key
                              where sl.map_id = v_map and sl.kind = 'target' and sl.track_id = v_l.track_id and sl.ref_key = u.k),
               'state', coalesce(c.state, 'NOT_OBSERVED'),
               'state_kind', sd.kind,
               'state_since', c.state_since,
               'flag', case when f.id is null then null else pg_catalog.jsonb_build_object('id', f.id, 'at', f.created_at) end,
               'proposal', case when pr.id is null then null
                                else pg_catalog.jsonb_build_object('id', pr.id, 'to_state', pr.to_state, 'route', pr.route, 'at', pr.created_at) end,
               'conditions', coalesce(c.conditions, '[]'::jsonb),
               'route', c.route,
               'evaluated_at', c.evaluated_at,
               'updated_at', c.updated_at)
             order by u.o)
      from unnest(coalesce(v_def.target_ids, '{}'::text[])) with ordinality as u(k, o)
      left join english.targets t on t.id = u.k and t.descriptor_version = v_def.descriptor_version
      left join english.competency_state c on c.learner_id = p_learner and c.target_key = u.k
      left join english.mastery_decisions sd on sd.id = c.state_decision_id
      left join english.mastery_decisions f on f.id = c.flag_decision_id
      left join english.mastery_decisions pr on pr.id = c.proposal_decision_id), '[]'::jsonb));
end
$$;

-- Hộp duyệt → tab "Kỹ năng": đề xuất / ⚑ đang mở của mọi em trong phạm vi của p_by (phụ huynh: cả gia đình; gia sư: em còn quan hệ hiệu lực).
-- can_decide = p_by là gia sư của em đó. Không có điểm, không có tên người học thật khi p_allow_real = false (preview).
create or replace function english.eng_skill_inbox(p_by uuid, p_allow_real boolean default false) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
begin
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') then
    raise exception 'eng_skill_inbox: staff only (staff_only)' using errcode = '42501';
  end if;
  return (
    with pending as (
      select d.*, l.alias, l.is_test
      from english.mastery_decisions d
      join english.learners l on l.id = d.learner_id
      where english.eng_actor_may_manage(p_by, l.id) and (p_allow_real or l.is_test)
        and d.kind in ('PROPOSED', 'FLAG')
        and not exists (select 1 from english.mastery_decisions a where a.responds_to = d.id)
        and d.target_key = any (coalesce(english.eng_engine_scope(d.learner_id), '{}'::text[]))
    )
    select pg_catalog.jsonb_build_object(
      'open', (select pg_catalog.count(*) from pending)::int,
      'decidable', case when v_m.role = 'tutor' then (select pg_catalog.count(*) from pending)::int else 0 end,
      'items', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                 'id', p.id, 'kind', p.kind, 'learner_id', p.learner_id, 'alias', p.alias, 'is_test', p.is_test,
                 'target_key', p.target_key,
                 'title_vi', (select t.title_vi from english.targets t where t.id = p.target_key order by t.descriptor_version desc limit 1),
                 'from_state', p.from_state, 'to_state', p.to_state,
                 'current_state', coalesce((select c.state from english.competency_state c where c.learner_id = p.learner_id and c.target_key = p.target_key), 'NOT_OBSERVED'),
                 'route', p.route, 'conditions', p.conditions,
                 'evidence', coalesce((
                   select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                            'episode_id', e.id, 'title_vi', i.snapshot -> 'template' ->> 'title_vi', 'step_no', a.step_no, 'at', t.submitted_at)
                          order by t.submitted_at, e.id)
                   from english.episodes e
                   join english.attempts t on t.id = e.attempt_id
                   join english.activity_instances a on a.id = t.activity_instance_id
                   join english.inquiry_instances i on i.id = a.inquiry_instance_id
                   where e.id = any (p.evidence_episode_ids)), '[]'::jsonb),
                 'created_at', p.created_at,
                 'can_decide', v_m.role = 'tutor')
               order by p.alias, p.seq)
        from pending p), '[]'::jsonb)));
end
$$;

revoke execute on function english.eng_skill_states(uuid) from public, anon, authenticated;
grant execute on function english.eng_skill_states(uuid) to service_role;
revoke execute on function english.eng_skill_inbox(uuid, boolean) from public, anon, authenticated;
grant execute on function english.eng_skill_inbox(uuid, boolean) to service_role;
revoke execute on function english.eng_mark_episode_transfer(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function english.eng_mark_episode_transfer(uuid, boolean, uuid) to service_role;

-- 8. Purge: thêm competency_state + mastery_decisions (giữ nguyên mọi dòng của 0021; có test đối chiếu từng dòng).
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

-- Đếm trước khi xóa: thêm mastery_decisions + competency_state + episode_marks (giữ nguyên mọi dòng của 0021).
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
      'login_names', (select pg_catalog.count(*) from english.login_names x where x.auth_user_id = v_user),
      'learners', 1,
      'members', (select pg_catalog.count(*) from english.members x where x.id = v_l.member_id and x.role = 'student')));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0023') on conflict do nothing;
