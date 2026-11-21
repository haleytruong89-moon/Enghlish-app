-- 0039_tutor_hints.sql
-- E1 · Gia sư AI tiếng Anh: nút "Hỏi" trong bài luyện Studio (plan docs/superpowers/plans/2026-11-21-e1-ask-hints.md, DOMAIN bản 0.9;
-- phụ huynh duyệt 21/11: P-E1-1…6, P1, G5; bộ test BO_TEST_GIA_SU_TIENG_ANH v0.1).
--   1. ai_runs.purpose + eng_ai_gate + eng_log_ai_run nhận thêm 'tutor_hint' (Sonnet trả lời) và 'tutor_check' (Haiku kiểm). Thân = bản 0027.
--      Chung MỘT trần tháng của gia đình với Studio / Giáo trình / Nạp bài.
--   2. ai_settings: nới trần tối đa 10 → 50 USD (P1; không đổi giá trị đang có). eng_set_ai_cap (chỉ phụ huynh) đặt trần + ngưỡng báo.
--      eng_ai_settings = bản 0024 + số lượt gia sư AI hôm nay / tháng này của từng em (P-E1-5: phụ huynh xem) + phiên bản văn bản đồng ý mới nhất.
--   3. track_settings: tutor_language (A 'vi', B 'en_first'), tutor_band, tutor_daily_limit (40, P-E1-5).
--   4. tutor_turns (chỉ thêm): một lượt hỏi của con (mức, chữ con gõ ≤ 200, chữ đã gửi con SAU kiểm, kết quả kiểm, cờ, chi phí, lần chạy AI).
--      Con KHÔNG đọc (kể cả chữ của chính mình); người lớn của em đọc (RLS). Không bao giờ chứa đáp án ngoài chữ đã qua kiểm.
--   5. eng_tutor_context (service_role sau khi máy chủ biết người dùng là con): con là chủ bước, bước đã mở, bài Studio, KHÔNG phải bài kiểm tra
--      (L2), chưa nộp (P-E1-3), câu có trong bước → câu, phần (E0), đáp án + đáp án chấp nhận (chỉ máy chủ), mức tiếp, lượt hôm nay, lượt trước của câu;
--      cùng client_id đã ghi → trả lượt cũ (không gọi AI lần 2).
--      eng_record_tutor_turn: ghi lượt; mức do hàm tính lại dưới khóa (không tin tầng trên); idempotent theo client_id.
--   6. eng_purge_learner / eng_purge_preview = thân 0037 + tutor_turns.
-- Idempotent; chỉ thêm. Không đụng schema public. Cần 0038 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations s where s.version = '0038') then
    raise exception '0039 cần 0038 đã áp (missing_0038)' using errcode = 'P0001';
  end if;
end
$guard$;

-- 1. Việc AI mới ----------------------------------------------------------------------------------------------------------------------
alter table english.ai_runs drop constraint if exists ai_runs_purpose_check;
alter table english.ai_runs add constraint ai_runs_purpose_check
  check (purpose in ('studio_extract', 'curriculum_toc', 'read_answers', 'tutor_hint', 'tutor_check'));

-- 1b. Cổng AI + sổ chạy AI = bản 0027 (cùng chữ ký) với hai việc mới ---------------------------------------------------------------------
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
  if p_purpose is null or p_purpose not in ('studio_extract', 'curriculum_toc', 'read_answers', 'tutor_hint', 'tutor_check') then
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
  if p_purpose is null or p_purpose not in ('studio_extract', 'curriculum_toc', 'read_answers', 'tutor_hint', 'tutor_check') then
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

-- 2b. Cài đặt AI của phụ huynh = bản 0024 + số lượt gia sư AI của từng em.
create or replace function english.eng_ai_settings(p_by uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
  v_s english.ai_settings%rowtype;
  v_spent numeric;
begin
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'parent' then
    raise exception 'eng_ai_settings: only a parent reads the AI settings (parent_only)' using errcode = '42501';
  end if;
  select * into v_s from english.ai_settings s where s.family_id = v_m.family_id;
  v_spent := english.eng_ai_month_spent(v_m.family_id);
  return pg_catalog.jsonb_build_object(
    'enabled', coalesce(v_s.enabled, false),
    'monthly_cap_usd', coalesce(v_s.monthly_cap_usd, 10),
    'soft_cap_usd', coalesce(v_s.soft_cap_usd, 8),
    'spent_usd', v_spent,
    'soft_reached', v_spent >= coalesce(v_s.soft_cap_usd, 8),
    'runs_month', (select pg_catalog.count(*) from english.ai_runs r where r.family_id = v_m.family_id and r.status in ('ok', 'error')
                     and r.at >= (pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')),
    'updated_at', v_s.updated_at,
    'learners', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', l.id, 'alias', l.alias, 'is_test', l.is_test,
               'ai_text', (select c.granted from english.consents c where c.learner_id = l.id and c.scope = 'ai_text' order by c.at desc, c.id desc limit 1),
               'ai_text_version', (select c.notice_version from english.consents c where c.learner_id = l.id and c.scope = 'ai_text' order by c.at desc, c.id desc limit 1),
               -- 0039: lượt hỏi gia sư AI (có gọi AI) hôm nay / tháng này, giờ Việt Nam (P-E1-5)
               'tutor_today', (select pg_catalog.count(*) from english.tutor_turns t where t.learner_id = l.id and (t.kind <> 'fixed' or t.fixed_code = 'ai_error')
                                 and (t.created_at at time zone 'Asia/Ho_Chi_Minh')::date = english.eng_today_vn()),
               'tutor_month', (select pg_catalog.count(*) from english.tutor_turns t where t.learner_id = l.id and (t.kind <> 'fixed' or t.fixed_code = 'ai_error')
                                 and t.created_at >= (pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')))
             order by l.track_id, l.alias)
      from english.learners l where l.family_id = v_m.family_id), '[]'::jsonb));
end
$$;
revoke execute on function english.eng_ai_settings(uuid) from public, anon, authenticated;
grant execute on function english.eng_ai_settings(uuid) to service_role;

-- 2. Trần tháng: tối đa 50 USD (P1); phụ huynh đặt ----------------------------------------------------------------------------------
-- Tên ràng buộc lấy từ catalog (PostgreSQL tự đặt ở 0024), không đoán.
do $$
declare
  c record;
begin
  for c in
    select con.conname from pg_catalog.pg_constraint con
    where con.conrelid = 'english.ai_settings'::regclass and con.contype = 'c'
      and pg_catalog.pg_get_constraintdef(con.oid) ~ 'monthly_cap_usd <= \(?10'
  loop
    execute pg_catalog.format('alter table english.ai_settings drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_catalog.pg_constraint con where con.conrelid = 'english.ai_settings'::regclass and con.conname = 'ai_settings_cap_max50') then
    alter table english.ai_settings add constraint ai_settings_cap_max50 check (monthly_cap_usd > 0 and monthly_cap_usd <= 50);
  end if;
end
$$;

-- Chỉ phụ huynh. Ngưỡng báo ≤ trần (ràng buộc ai_settings_soft_below_cap đã có). Không có dòng cài đặt thì tạo (AI vẫn tắt).
create or replace function english.eng_set_ai_cap(p_cap numeric, p_soft numeric, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
begin
  if p_cap is null or p_soft is null or p_by is null then
    raise exception 'eng_set_ai_cap: cap, warning and actor are required' using errcode = '22004';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'parent' then
    raise exception 'eng_set_ai_cap: only a parent changes the AI cap (parent_only)' using errcode = '42501';
  end if;
  if p_cap <= 0 or p_cap > 50 or p_soft <= 0 or p_soft > p_cap then
    raise exception 'eng_set_ai_cap: the cap is 0–50 USD and the warning is at most the cap (bad_cap)' using errcode = '22023';
  end if;
  insert into english.ai_settings(family_id, enabled, monthly_cap_usd, soft_cap_usd, updated_by_member, updated_at)
  values (v_m.family_id, false, p_cap, p_soft, p_by, pg_catalog.clock_timestamp())
  on conflict (family_id) do update set monthly_cap_usd = excluded.monthly_cap_usd, soft_cap_usd = excluded.soft_cap_usd,
    updated_by_member = excluded.updated_by_member, updated_at = excluded.updated_at;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, payload)
  values (v_m.user_id, v_m.role, 'ai.cap_changed', v_m.family_id, pg_catalog.jsonb_build_object('cap', p_cap, 'soft', p_soft));
  return english.eng_ai_settings(p_by);
end
$$;
revoke execute on function english.eng_set_ai_cap(numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function english.eng_set_ai_cap(numeric, numeric, uuid) to service_role;

-- 3. Cấu hình theo track ---------------------------------------------------------------------------------------------------------------
insert into english.track_settings(track_id, key, value) values
  ('A', 'tutor_language', '"vi"'::jsonb),
  ('B', 'tutor_language', '"en_first"'::jsonb),
  ('A', 'tutor_band', '"A2-B1"'::jsonb),
  ('B', 'tutor_band', '"B2-C1"'::jsonb),
  ('A', 'tutor_daily_limit', '40'::jsonb),
  ('B', 'tutor_daily_limit', '40'::jsonb)
on conflict (track_id, key) do nothing;

-- 4. Lượt hỏi gia sư AI ----------------------------------------------------------------------------------------------------------------
-- kind: 'hint' (Hỏi / Gợi ý tiếp; có mức 1–3), 'question' (con gõ câu hỏi về câu đang làm; giữ mức hiện có), 'fixed' (không gọi AI: hết lượt
-- trong ngày, hết mức, thiếu dữ liệu phần, AI tắt / hết trần, lỗi). guard: 'pass' | 'rewritten' (viết lại 1 lần rồi đạt) | 'safe' (câu an toàn) | 'fixed'.
create table if not exists english.tutor_turns (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  activity_id uuid not null references english.activity_instances(id),
  item_id text not null check (item_id ~ '^q[1-9][0-9]{0,2}$'),
  kind text not null check (kind in ('hint', 'question', 'fixed')),
  level smallint not null check (level between 0 and 3),
  child_text text check (child_text is null or pg_catalog.length(child_text) between 1 and 200),
  shown_text text not null check (pg_catalog.length(pg_catalog.btrim(shown_text)) between 1 and 1500),
  guard text not null check (guard in ('pass', 'rewritten', 'safe', 'fixed')),
  reasons text[] not null default '{}',
  flags text[] not null default '{}' check (flags <@ array['injection_attempt', 'off_topic', 'frustrated', 'asked_answer', 'word_meaning']),
  fixed_code text check (fixed_code is null or fixed_code ~ '^[a-z_]{1,40}$'),
  prompt_version text check (prompt_version is null or prompt_version ~ '^[a-z0-9_.-]{1,60}$'),
  model text check (model is null or pg_catalog.length(model) between 1 and 100),
  run_ids uuid[] not null default '{}',
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint tutor_turns_level_shape check (kind <> 'hint' or level between 1 and 3),
  constraint tutor_turns_fixed_shape check ((kind = 'fixed') = (guard = 'fixed') and ((kind = 'fixed') = (fixed_code is not null)))
);
create index if not exists tutor_turns_item_idx on english.tutor_turns(learner_id, activity_id, item_id, created_at);
create index if not exists tutor_turns_learner_idx on english.tutor_turns(learner_id, created_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['tutor_turns'] loop
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

-- 5a. Ngữ cảnh một lượt. p_user = auth.users.id mà MÁY CHỦ lấy từ phiên đăng nhập (không bao giờ từ yêu cầu). Chỉ con chủ bước.
-- Lỗi có nhãn: not_found (P0002), not_studio (P0002), test_work (42501), sent (23514).
create or replace function english.eng_tutor_context(p_user uuid, p_activity uuid, p_item text, p_client_id text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_act english.activity_instances%rowtype;
  v_inst english.inquiry_instances%rowtype;
  v_l english.learners%rowtype;
  v_item jsonb;
  v_part jsonb;
  v_key text;
  v_kind text;
  v_prev english.tutor_turns%rowtype;
  v_hints int;
  v_today int;
  v_limit int;
begin
  if p_user is null or p_activity is null or p_item is null or p_client_id is null then
    raise exception 'eng_tutor_context: user, step, item and client id are required' using errcode = '22004';
  end if;
  select m.id into v_member from english.members m where m.user_id = p_user and m.role = 'student';
  select a.* into v_act from english.activity_instances a join english.learners l on l.id = a.learner_id
  where a.id = p_activity and v_member is not null and l.member_id = v_member;
  if not found or not english.eng_activity_released(p_activity) then
    raise exception 'eng_tutor_context: step not found (not_found)' using errcode = 'P0002';
  end if;
  select * into v_l from english.learners l where l.id = v_act.learner_id;
  select * into v_inst from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  if not exists (select 1 from english.inquiry_templates tp where tp.id = v_inst.template_id and tp.version = v_inst.template_version and tp.kind = 'studio') then
    raise exception 'eng_tutor_context: the tutor is for Studio practice (not_studio)' using errcode = 'P0002';
  end if;
  -- L2: không gia sư AI ở bài kiểm tra (cờ Bài kiểm tra hoặc bước INDEPENDENT_CHECK).
  if english.eng_work_is_test(p_activity) then
    raise exception 'eng_tutor_context: no tutor on a test (test_work)' using errcode = '42501';
  end if;
  -- Cùng client_id đã ghi: trả lượt cũ (không gọi AI lần hai), trước mọi kiểm "đã nộp" (lượt đó có thể ghi ngay trước khi nộp).
  select * into v_prev from english.tutor_turns t where t.learner_id = v_l.id and t.client_id = p_client_id;
  if found and (v_prev.activity_id <> p_activity or v_prev.item_id <> p_item) then
    raise exception 'eng_tutor_context: client id used for another question (client_id_reused)' using errcode = '22023';
  end if;
  if found then
    return pg_catalog.jsonb_build_object('replay', pg_catalog.jsonb_build_object(
      'id', v_prev.id, 'item_id', v_prev.item_id, 'kind', v_prev.kind, 'level', v_prev.level, 'shown_text', v_prev.shown_text, 'fixed_code', v_prev.fixed_code));
  end if;
  -- P-E1-3: chỉ khi đang làm, trước khi nộp (sau khi nộp có luồng thử lại / Xem đáp án).
  if exists (select 1 from english.attempts t where t.activity_instance_id = p_activity) then
    raise exception 'eng_tutor_context: the work was already sent (sent)' using errcode = '23514';
  end if;
  select x into v_item
  from pg_catalog.jsonb_array_elements(v_inst.snapshot -> 'steps') st, pg_catalog.jsonb_array_elements(st -> 'items') x
  where (st ->> 'step_no')::int = v_act.step_no and x ->> 'id' = p_item
  limit 1;
  if v_item is null then
    raise exception 'eng_tutor_context: question not found (not_found)' using errcode = 'P0002';
  end if;
  -- Phần của câu (E0); không có thì null (G8: máy chủ không gọi AI).
  select pg_catalog.jsonb_build_object('key', m.part, 'name', coalesce(p.e ->> 'name', m.part), 'instructions', coalesce(p.e ->> 'instructions', ''))
    into v_part
  from english.studio_item_meta m
  left join lateral (
    select x.e from english.studio_drafts d, pg_catalog.jsonb_array_elements(d.payload -> 'parts') as x(e)
    where d.template_id = v_inst.template_id and d.template_version = v_inst.template_version and d.status = 'approved' and x.e ->> 'key' = m.part
    limit 1) p on true
  where m.template_id = v_inst.template_id and m.template_version = v_inst.template_version and m.item_id = p_item and not m.out_of_app;
  select k.answer, k.kind into v_key, v_kind from english.instance_item_keys k where k.inquiry_instance_id = v_inst.id and k.item_id = p_item;
  select pg_catalog.count(*) into v_hints from english.tutor_turns t
  where t.learner_id = v_l.id and t.activity_id = p_activity and t.item_id = p_item and t.kind = 'hint';
  select pg_catalog.count(*) into v_today from english.tutor_turns t
  -- Lượt có gọi AI hôm nay (giờ Việt Nam): lượt gợi ý / câu hỏi, và cả lượt AI lỗi (đã gọi model, có thể đã tốn tiền).
  where t.learner_id = v_l.id and (t.kind <> 'fixed' or t.fixed_code = 'ai_error') and (t.created_at at time zone 'Asia/Ho_Chi_Minh')::date = english.eng_today_vn();
  v_limit := coalesce((english.eng_track_setting(v_l.track_id, 'tutor_daily_limit') #>> '{}')::int, 40);
  return pg_catalog.jsonb_build_object(
    'learner_id', v_l.id, 'family_id', v_l.family_id, 'track_id', v_l.track_id,
    'item', pg_catalog.jsonb_build_object('id', v_item ->> 'id', 'kind', v_item ->> 'kind', 'stem', v_item ->> 'stem', 'options', coalesce(v_item -> 'options', '[]'::jsonb)),
    'part', v_part,
    -- Đáp án: CHỈ để máy chủ kiểm L1 và nhắc model tránh. Trắc nghiệm: chữ cái. Câu khác: các đáp án ngăn bằng " / " + đáp án thầy/cô thêm sau.
    'answers', coalesce((
      select pg_catalog.jsonb_agg(distinct a) from (
        select pg_catalog.btrim(x) as a from pg_catalog.regexp_split_to_table(coalesce(case when v_kind = 'answer' then v_key end, ''), ' / ') x
        union all
        select pg_catalog.btrim(aa.answer) from english.accepted_additions aa
        where aa.template_id = v_inst.template_id and aa.template_version = v_inst.template_version and aa.item_id = p_item) s
      where s.a <> ''), '[]'::jsonb),
    -- Văn bản đồng ý mới nhất mà phụ huynh đã bấm cho em (ai_text): gia sư AI chỉ chạy khi đó là bản có nói về gia sư AI (máy chủ so).
    'consent_version', (select c.notice_version from english.consents c where c.learner_id = v_l.id and c.scope = 'ai_text' and c.granted
                        order by c.at desc, c.id desc limit 1),
    'hints_used', v_hints,
    'turns_today', v_today,
    'daily_limit', v_limit,
    'language', english.eng_track_setting(v_l.track_id, 'tutor_language') #>> '{}',
    'band', english.eng_track_setting(v_l.track_id, 'tutor_band') #>> '{}',
    'previous', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', t.kind, 'level', t.level, 'child_text', t.child_text, 'shown_text', t.shown_text) order by t.created_at)
      from (select * from english.tutor_turns t where t.learner_id = v_l.id and t.activity_id = p_activity and t.item_id = p_item
            order by t.created_at desc limit 4) t), '[]'::jsonb));
end
$$;
revoke execute on function english.eng_tutor_context(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function english.eng_tutor_context(uuid, uuid, text, text) to service_role;

-- 5b. Ghi một lượt. Kiểm lại người dùng / bước như 5a (không tin tầng trên), khóa dòng của em, tính lại mức của lượt gợi ý.
create or replace function english.eng_record_tutor_turn(
  p_user uuid, p_activity uuid, p_item text, p_kind text, p_child_text text, p_shown text, p_guard text, p_reasons text[], p_flags text[],
  p_fixed_code text, p_prompt_version text, p_model text, p_runs uuid[], p_cost numeric, p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_act english.activity_instances%rowtype;
  v_prev english.tutor_turns%rowtype;
  v_level int := 0;
  v_id uuid;
begin
  if p_user is null or p_activity is null or p_item is null or p_kind is null or p_shown is null or p_guard is null or p_client_id is null then
    raise exception 'eng_record_tutor_turn: user, step, item, kind, text, guard and client id are required' using errcode = '22004';
  end if;
  select m.id into v_member from english.members m where m.user_id = p_user and m.role = 'student';
  select a.* into v_act from english.activity_instances a join english.learners l on l.id = a.learner_id
  where a.id = p_activity and v_member is not null and l.member_id = v_member;
  if not found then
    raise exception 'eng_record_tutor_turn: step not found (not_found)' using errcode = 'P0002';
  end if;
  if english.eng_work_is_test(p_activity) then
    raise exception 'eng_record_tutor_turn: no tutor on a test (test_work)' using errcode = '42501';
  end if;
  perform 1 from english.learners l where l.id = v_act.learner_id for no key update;
  select * into v_prev from english.tutor_turns t where t.learner_id = v_act.learner_id and t.client_id = p_client_id;
  if found and (v_prev.activity_id <> p_activity or v_prev.item_id <> p_item) then
    raise exception 'eng_record_tutor_turn: client id used for another question (client_id_reused)' using errcode = '22023';
  end if;
  if found then
    return pg_catalog.jsonb_build_object('id', v_prev.id, 'level', v_prev.level, 'shown_text', v_prev.shown_text, 'replayed', true);
  end if;
  if p_kind = 'hint' then
    select least(3, pg_catalog.count(*)::int + 1) into v_level from english.tutor_turns t
    where t.learner_id = v_act.learner_id and t.activity_id = p_activity and t.item_id = p_item and t.kind = 'hint';
  elsif p_kind = 'question' then
    select coalesce(pg_catalog.max(t.level), 0) into v_level from english.tutor_turns t
    where t.learner_id = v_act.learner_id and t.activity_id = p_activity and t.item_id = p_item and t.kind = 'hint';
  end if;
  insert into english.tutor_turns(learner_id, activity_id, item_id, kind, level, child_text, shown_text, guard, reasons, flags, fixed_code,
                                  prompt_version, model, run_ids, cost_usd, client_id)
  values (v_act.learner_id, p_activity, p_item, p_kind, v_level, nullif(pg_catalog.btrim(coalesce(p_child_text, '')), ''), p_shown, p_guard,
          coalesce(p_reasons, '{}'), coalesce(p_flags, '{}'), p_fixed_code, p_prompt_version, p_model, coalesce(p_runs, '{}'), coalesce(p_cost, 0), p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'level', v_level, 'shown_text', p_shown, 'replayed', false);
end
$$;
revoke execute on function english.eng_record_tutor_turn(uuid, uuid, text, text, text, text, text, text[], text[], text, text, text, uuid[], numeric, text) from public, anon, authenticated;
grant execute on function english.eng_record_tutor_turn(uuid, uuid, text, text, text, text, text, text[], text[], text, text, text, uuid[], numeric, text) to service_role;

-- 6. Xóa dữ liệu một em: = bản 0037 + tutor_turns (trước activity_instances) ------------------------------------------------------
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

-- Đếm trước khi xóa = bản 0037 + tutor_turns.
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
      'tutor_turns', (select pg_catalog.count(*) from english.tutor_turns x where x.learner_id = p_learner)));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0039') on conflict do nothing;
