-- 0041_tutor_notebook.sql
-- E2a · Gia sư (tra từ) + Sổ tay (Từ vựng) — spec docs/superpowers/specs/2026-11-22-gia-su-so-tay-design.md (bản 0.2, phụ huynh duyệt 23/11),
-- plan docs/superpowers/plans/2026-11-23-e2a-gia-su-so-tay.md.
--   1. ai_runs.purpose + eng_ai_gate + eng_log_ai_run nhận thêm vocab_card / vocab_check / vocab_sense / vocab_again. Thân = bản 0039.
--      Chung MỘT trần tháng của gia đình.
--   2. track_settings: tutor_lookup_daily_limit (60, tính cả thẻ có sẵn), tutor_lookup_ai_daily_limit (30, lượt có gọi AI). A1.
--   3. ipa_lexicon: phiên âm Anh–Anh / Anh–Mỹ (ipa-dict, MIT, nạp bằng scripts/seed-ipa.ts). Dữ liệu tham chiếu, không của con. L3.
--   4. vocab_cards (chỉ thêm, có phiên bản qua supersedes): thẻ dùng chung theo (headword, band, language). Không có gì của con.
--   5. tutor_asks / tutor_ask_ratings (chỉ thêm): lượt con hỏi Gia sư + 😊😐😕. Con KHÔNG đọc bảng; mẹ + thầy/cô của em đọc qua hàm (D-G8).
--   6. notebook_items / notebook_item_events (chỉ thêm): Sổ tay; trạng thái = sự kiện mới nhất (dữ liệu dẫn xuất).
--   7. Hàm: máy chủ (service_role, p_user do máy chủ lấy từ phiên): eng_lookup_context, eng_vocab_card_find, eng_vocab_card_by_id,
--      eng_save_vocab_card, eng_record_tutor_ask. Con (auth.uid()): eng_my_tutor_status, eng_my_recent_lookups, eng_my_vocab_card,
--      eng_my_notebook, eng_notebook_save, eng_notebook_set, eng_rate_tutor_ask. Người lớn: eng_tutor_asks_for. Chung: eng_ipa_for.
--   8. eng_purge_learner / eng_purge_preview = thân 0039 + 4 bảng của em (vocab_cards, ipa_lexicon không có gì của em).
-- Idempotent; chỉ thêm. Không đụng schema public. Cần 0040 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations s where s.version = '0040') then
    raise exception '0041 cần 0040 đã áp (missing_0040)' using errcode = 'P0001';
  end if;
end
$guard$;

-- 1. Việc AI mới -----------------------------------------------------------------------------------------------------------------------
alter table english.ai_runs drop constraint if exists ai_runs_purpose_check;
alter table english.ai_runs add constraint ai_runs_purpose_check
  check (purpose in ('studio_extract', 'curriculum_toc', 'read_answers', 'tutor_hint', 'tutor_check', 'vocab_card', 'vocab_check', 'vocab_sense', 'vocab_again'));


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
  if p_purpose is null or p_purpose not in ('studio_extract', 'curriculum_toc', 'read_answers', 'tutor_hint', 'tutor_check', 'vocab_card', 'vocab_check', 'vocab_sense', 'vocab_again') then
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
  if p_purpose is null or p_purpose not in ('studio_extract', 'curriculum_toc', 'read_answers', 'tutor_hint', 'tutor_check', 'vocab_card', 'vocab_check', 'vocab_sense', 'vocab_again') then
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

-- 2. Cấu hình theo track (A1) -------------------------------------------------------------------------------------------------------------
insert into english.track_settings(track_id, key, value) values
  ('A', 'tutor_lookup_daily_limit', '60'::jsonb),
  ('B', 'tutor_lookup_daily_limit', '60'::jsonb),
  ('A', 'tutor_lookup_ai_daily_limit', '30'::jsonb),
  ('B', 'tutor_lookup_ai_daily_limit', '30'::jsonb)
on conflict (track_id, key) do nothing;

-- 3. Phiên âm (tham chiếu) -------------------------------------------------------------------------------------------------------------
create table if not exists english.ipa_lexicon (
  word text not null check (pg_catalog.length(word) between 1 and 60),
  accent text not null check (accent in ('uk', 'us')),
  ipa text[] not null check (cardinality(ipa) between 1 and 4),
  source text not null check (pg_catalog.length(source) between 1 and 120),
  primary key (word, accent)
);
alter table english.ipa_lexicon enable row level security;
revoke all on english.ipa_lexicon from public, anon, authenticated;
grant select on english.ipa_lexicon to authenticated, service_role;
drop policy if exists ipa_lexicon_select on english.ipa_lexicon;
create policy ipa_lexicon_select on english.ipa_lexicon for select to authenticated, service_role using (true);

-- 4. Thẻ từ dùng chung ------------------------------------------------------------------------------------------------------------------
create table if not exists english.vocab_cards (
  id uuid primary key default gen_random_uuid(),
  headword text not null check (headword ~ '^[a-z'' -]{1,40}$'),
  forms text[] not null check (cardinality(forms) between 1 and 12),
  band text not null check (pg_catalog.length(band) between 1 and 20),
  language text not null check (language in ('vi', 'en_first')),
  content jsonb not null check (pg_catalog.jsonb_typeof(content) = 'object'),
  prompt_version text not null check (prompt_version ~ '^[a-z0-9_.-]{1,60}$'),
  model text not null check (pg_catalog.length(model) between 1 and 100),
  supersedes uuid references english.vocab_cards(id),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists vocab_cards_key_idx on english.vocab_cards(headword, band, language, created_at desc);
create index if not exists vocab_cards_forms_idx on english.vocab_cards using gin (forms);
create unique index if not exists vocab_cards_one_successor on english.vocab_cards(supersedes) where supersedes is not null;

-- 5. Lượt hỏi Gia sư -------------------------------------------------------------------------------------------------------------------
-- guard: 'cache' (thẻ có sẵn, có thể đã dùng Haiku chọn nghĩa) | 'pass' | 'rewritten' (viết lại 1 lần rồi đạt) | 'fixed' (câu cố định, fixed_code).
create table if not exists english.tutor_asks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  kind text not null check (kind in ('lookup', 'again')),
  child_text text not null check (pg_catalog.length(child_text) between 1 and 40),
  context_text text check (context_text is null or pg_catalog.length(context_text) between 1 and 200),
  card_id uuid references english.vocab_cards(id),
  sense smallint check (sense is null or sense between 0 and 2),
  parent_ask uuid references english.tutor_asks(id),
  shown_text text check (shown_text is null or pg_catalog.length(shown_text) between 1 and 4000),
  guard text not null check (guard in ('cache', 'pass', 'rewritten', 'fixed')),
  reasons text[] not null default '{}',
  flags text[] not null default '{}' check (flags <@ array['injection_attempt', 'off_topic']),
  fixed_code text check (fixed_code is null or fixed_code ~ '^[a-z_]{1,40}$'),
  used_ai boolean not null default false,
  prompt_version text check (prompt_version is null or prompt_version ~ '^[a-z0-9_.-]{1,60}$'),
  model text check (model is null or pg_catalog.length(model) between 1 and 100),
  run_ids uuid[] not null default '{}',
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint tutor_asks_fixed_shape check ((guard = 'fixed') = (fixed_code is not null)),
  constraint tutor_asks_card_shape check (guard = 'fixed' or card_id is not null),
  constraint tutor_asks_again_shape check ((kind = 'again') = (parent_ask is not null))
);
create index if not exists tutor_asks_learner_idx on english.tutor_asks(learner_id, created_at desc);

create table if not exists english.tutor_ask_ratings (
  id uuid primary key default gen_random_uuid(),
  ask_id uuid not null references english.tutor_asks(id),
  learner_id uuid not null references english.learners(id),
  rating text not null check (rating in ('good', 'ok', 'confused')),
  at timestamptz not null default clock_timestamp()
);
create index if not exists tutor_ask_ratings_ask_idx on english.tutor_ask_ratings(ask_id, at desc);

-- 6. Sổ tay -----------------------------------------------------------------------------------------------------------------------------
create table if not exists english.notebook_items (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  kind text not null check (kind in ('word')),
  card_id uuid not null references english.vocab_cards(id),
  headword text not null check (headword ~ '^[a-z'' -]{1,40}$'),
  source text not null check (source in ('lookup')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create index if not exists notebook_items_learner_idx on english.notebook_items(learner_id, kind, headword);

create table if not exists english.notebook_item_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references english.notebook_items(id),
  learner_id uuid not null references english.learners(id),
  action text not null check (action in ('remove', 'restore')),
  at timestamptz not null default clock_timestamp()
);
create index if not exists notebook_item_events_item_idx on english.notebook_item_events(item_id, at desc);

do $$
declare
  t text;
begin
  foreach t in array array['tutor_asks', 'tutor_ask_ratings', 'notebook_items', 'notebook_item_events'] loop
    execute pg_catalog.format('drop trigger if exists %I on english.%I', t || '_forbid_mutation', t);
    execute pg_catalog.format('create trigger %I before update or delete on english.%I for each row execute function english.eng_forbid_mutation(%L)', t || '_forbid_mutation', t, 'learner_id');
    execute pg_catalog.format('drop trigger if exists %I on english.%I', t || '_forbid_truncate', t);
    execute pg_catalog.format('create trigger %I before truncate on english.%I for each statement execute function english.eng_forbid_mutation()', t || '_forbid_truncate', t);
    execute pg_catalog.format('alter table english.%I enable row level security', t);
    execute pg_catalog.format('revoke all on english.%I from public, anon, authenticated', t);
    execute pg_catalog.format('revoke insert, update, delete, truncate on english.%I from service_role', t);
  end loop;
  -- Thẻ dùng chung: không có learner_id; chỉ thêm, không bao giờ sửa / xóa (kể cả khi xóa dữ liệu một em).
  drop trigger if exists vocab_cards_forbid_mutation on english.vocab_cards;
  create trigger vocab_cards_forbid_mutation before update or delete on english.vocab_cards for each row execute function english.eng_forbid_mutation('*');
  drop trigger if exists vocab_cards_forbid_truncate on english.vocab_cards;
  create trigger vocab_cards_forbid_truncate before truncate on english.vocab_cards for each statement execute function english.eng_forbid_mutation();
  alter table english.vocab_cards enable row level security;
  revoke all on english.vocab_cards from public, anon, authenticated;
  revoke insert, update, delete, truncate on english.vocab_cards from service_role;
end
$$;


-- 7a. Máy chủ (service_role). p_user = auth.users.id mà MÁY CHỦ lấy từ phiên đăng nhập; chỉ một con (role student) có em.
-- Lỗi có nhãn: not_child (42501).
create or replace function english.eng_lookup_context(p_user uuid, p_client_id text, p_ask uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_prev english.tutor_asks%rowtype;
  v_ask jsonb;
begin
  if p_user is null or p_client_id is null then
    raise exception 'eng_lookup_context: user and client id are required' using errcode = '22004';
  end if;
  select l.* into v_l from english.members m join english.learners l on l.member_id = m.id where m.user_id = p_user and m.role = 'student';
  if not found then
    raise exception 'eng_lookup_context: only a child asks the tutor (not_child)' using errcode = '42501';
  end if;
  select * into v_prev from english.tutor_asks a where a.learner_id = v_l.id and a.client_id = p_client_id;
  if found then
    return pg_catalog.jsonb_build_object('replay', pg_catalog.jsonb_build_object(
      'id', v_prev.id, 'kind', v_prev.kind, 'card_id', v_prev.card_id, 'sense', v_prev.sense, 'guard', v_prev.guard,
      'shown_text', v_prev.shown_text, 'fixed_code', v_prev.fixed_code));
  end if;
  if p_ask is not null then
    select pg_catalog.jsonb_build_object('id', a.id, 'card_id', a.card_id) into v_ask
    from english.tutor_asks a where a.id = p_ask and a.learner_id = v_l.id and a.kind = 'lookup' and a.card_id is not null;
  end if;
  return pg_catalog.jsonb_build_object(
    'learner_id', v_l.id, 'family_id', v_l.family_id,
    'language', english.eng_track_setting(v_l.track_id, 'tutor_language') #>> '{}',
    'band', english.eng_track_setting(v_l.track_id, 'tutor_band') #>> '{}',
    'lookups_today', (select pg_catalog.count(*) from english.tutor_asks a
                      where a.learner_id = v_l.id and coalesce(a.fixed_code, '') not in ('daily_limit', 'ai_daily_limit')
                        and (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date = english.eng_today_vn()),
    'lookup_limit', coalesce((english.eng_track_setting(v_l.track_id, 'tutor_lookup_daily_limit') #>> '{}')::int, 60),
    'ai_lookups_today', (select pg_catalog.count(*) from english.tutor_asks a
                         where a.learner_id = v_l.id and a.used_ai and (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date = english.eng_today_vn()),
    'ai_lookup_limit', coalesce((english.eng_track_setting(v_l.track_id, 'tutor_lookup_ai_daily_limit') #>> '{}')::int, 30),
    -- Văn bản đồng ý mới nhất mà phụ huynh đã bấm cho em (ai_text): máy chủ so với bản v3 (Gia sư là mục riêng, câu hỏi được lưu).
    'consent_version', (select c.notice_version from english.consents c where c.learner_id = v_l.id and c.scope = 'ai_text' and c.granted
                        order by c.at desc, c.id desc limit 1),
    'ask', v_ask);
end
$$;
revoke execute on function english.eng_lookup_context(uuid, text, uuid) from public, anon, authenticated;
grant execute on function english.eng_lookup_context(uuid, text, uuid) to service_role;

-- Bản hiện hành của một thẻ = bản không có bản kế tiếp. Tìm theo từ gốc hoặc một dạng của từ; từ gốc trùng đúng được ưu tiên.
create or replace function english.eng_vocab_card_find(p_word text, p_band text, p_language text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('id', v.id, 'content', v.content)
  from english.vocab_cards v
  where v.band = p_band and v.language = p_language
    and (v.headword = pg_catalog.lower(p_word) or pg_catalog.lower(p_word) = any(v.forms))
    and not exists (select 1 from english.vocab_cards n where n.supersedes = v.id)
  order by (v.headword = pg_catalog.lower(p_word)) desc, v.created_at desc
  limit 1
$$;
revoke execute on function english.eng_vocab_card_find(text, text, text) from public, anon, authenticated;
grant execute on function english.eng_vocab_card_find(text, text, text) to service_role;

create or replace function english.eng_vocab_card_by_id(p_card uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('id', v.id, 'content', v.content) from english.vocab_cards v where v.id = p_card
$$;
revoke execute on function english.eng_vocab_card_by_id(uuid) from public, anon, authenticated;
grant execute on function english.eng_vocab_card_by_id(uuid) to service_role;

-- Lưu một thẻ đã qua kiểm (code + Haiku ở máy chủ). Chưa có thẻ cùng khóa mà p_supersedes null → thêm; đã có (hai em tra cùng lúc)
-- → trả thẻ hiện hành, không thêm bản thứ hai. p_supersedes phải là bản hiện hành cùng khóa (bad_supersedes).
create or replace function english.eng_save_vocab_card(
  p_band text, p_language text, p_content jsonb, p_prompt_version text, p_model text, p_supersedes uuid default null
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_head text := pg_catalog.lower(pg_catalog.btrim(p_content ->> 'headword'));
  v_forms text[];
  v_id uuid;
begin
  if p_band is null or p_language is null or p_content is null or v_head is null then
    raise exception 'eng_save_vocab_card: band, language and content with a headword are required' using errcode = '22004';
  end if;
  select coalesce(pg_catalog.array_agg(distinct pg_catalog.lower(pg_catalog.btrim(f))), '{}') into v_forms
  from pg_catalog.jsonb_array_elements_text(coalesce(p_content -> 'forms', '[]'::jsonb)) f;
  if not (v_head = any(v_forms)) then v_forms := v_forms || v_head; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vocab_card:' || v_head || ':' || p_band || ':' || p_language, 0));
  if p_supersedes is null then
    select v.id into v_id from english.vocab_cards v
    where v.headword = v_head and v.band = p_band and v.language = p_language
      and not exists (select 1 from english.vocab_cards n where n.supersedes = v.id)
    order by v.created_at desc limit 1;
    if v_id is not null then return v_id; end if;
  elsif not exists (select 1 from english.vocab_cards v
                    where v.id = p_supersedes and v.headword = v_head and v.band = p_band and v.language = p_language
                      and not exists (select 1 from english.vocab_cards n where n.supersedes = v.id)) then
    raise exception 'eng_save_vocab_card: only the current card of the same word can be replaced (bad_supersedes)' using errcode = '23514';
  end if;
  insert into english.vocab_cards(headword, forms, band, language, content, prompt_version, model, supersedes)
  values (v_head, v_forms, p_band, p_language, p_content, p_prompt_version, p_model, p_supersedes)
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function english.eng_save_vocab_card(text, text, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function english.eng_save_vocab_card(text, text, jsonb, text, text, uuid) to service_role;

-- Ghi một lượt; idempotent theo (em, client_id).
create or replace function english.eng_record_tutor_ask(
  p_user uuid, p_kind text, p_child_text text, p_context_text text, p_card uuid, p_sense smallint, p_parent_ask uuid, p_shown_text text,
  p_guard text, p_reasons text[], p_flags text[], p_fixed_code text, p_used_ai boolean, p_prompt_version text, p_model text, p_runs uuid[],
  p_cost numeric, p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_learner uuid;
  v_id uuid;
begin
  select l.id into v_learner from english.members m join english.learners l on l.member_id = m.id where m.user_id = p_user and m.role = 'student';
  if v_learner is null then
    raise exception 'eng_record_tutor_ask: only a child asks the tutor (not_child)' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tutor_ask:' || v_learner::text || ':' || coalesce(p_client_id, ''), 0));
  select a.id into v_id from english.tutor_asks a where a.learner_id = v_learner and a.client_id = p_client_id;
  if v_id is not null then
    return pg_catalog.jsonb_build_object('id', v_id, 'replayed', true);
  end if;
  if p_parent_ask is not null and not exists (select 1 from english.tutor_asks a where a.id = p_parent_ask and a.learner_id = v_learner) then
    raise exception 'eng_record_tutor_ask: the first ask is not this child''s (not_found)' using errcode = 'P0002';
  end if;
  insert into english.tutor_asks(learner_id, kind, child_text, context_text, card_id, sense, parent_ask, shown_text, guard, reasons, flags, fixed_code,
                                 used_ai, prompt_version, model, run_ids, cost_usd, client_id)
  values (v_learner, p_kind, p_child_text, nullif(pg_catalog.btrim(coalesce(p_context_text, '')), ''), p_card, p_sense, p_parent_ask, p_shown_text, p_guard,
          coalesce(p_reasons, '{}'), coalesce(p_flags, '{}'), p_fixed_code, coalesce(p_used_ai, false), p_prompt_version, p_model,
          coalesce(p_runs, '{}'), coalesce(p_cost, 0), p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;
revoke execute on function english.eng_record_tutor_ask(uuid, text, text, text, uuid, smallint, uuid, text, text, text[], text[], text, boolean, text, text, uuid[], numeric, text) from public, anon, authenticated;
grant execute on function english.eng_record_tutor_ask(uuid, text, text, text, uuid, smallint, uuid, text, text, text[], text[], text, boolean, text, text, uuid[], numeric, text) to service_role;

-- Phiên âm của các từ (dữ liệu tham chiếu chung).
create or replace function english.eng_ipa_for(p_words text[]) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('word', x.word, 'accent', x.accent, 'ipa', pg_catalog.to_jsonb(x.ipa))), '[]'::jsonb)
  from english.ipa_lexicon x
  where x.word = any(select pg_catalog.lower(w) from pg_catalog.unnest(coalesce(p_words, '{}'::text[])) w)
    and cardinality(coalesce(p_words, '{}'::text[])) <= 8
$$;
revoke execute on function english.eng_ipa_for(text[]) from public, anon;
grant execute on function english.eng_ipa_for(text[]) to authenticated, service_role;

-- 7b. Con (auth.uid()) --------------------------------------------------------------------------------------------------------------------
create or replace function english.eng_my_learner_for_tutor() returns english.learners
language sql stable security definer set search_path = ''
as $$
  select l.* from english.members m join english.learners l on l.member_id = m.id where m.user_id = auth.uid() and m.role = 'student' limit 1
$$;
revoke execute on function english.eng_my_learner_for_tutor() from public, anon, authenticated, service_role;

create or replace function english.eng_my_tutor_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
begin
  v_l := english.eng_my_learner_for_tutor();
  if v_l.id is null then return null; end if;
  return pg_catalog.jsonb_build_object(
    'language', english.eng_track_setting(v_l.track_id, 'tutor_language') #>> '{}',
    'band', english.eng_track_setting(v_l.track_id, 'tutor_band') #>> '{}',
    'lookups_today', (select pg_catalog.count(*) from english.tutor_asks a
                      where a.learner_id = v_l.id and coalesce(a.fixed_code, '') not in ('daily_limit', 'ai_daily_limit')
                        and (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date = english.eng_today_vn()),
    'lookup_limit', coalesce((english.eng_track_setting(v_l.track_id, 'tutor_lookup_daily_limit') #>> '{}')::int, 60),
    'consent_version', (select c.notice_version from english.consents c where c.learner_id = v_l.id and c.scope = 'ai_text' and c.granted
                        order by c.at desc, c.id desc limit 1),
    'ai_enabled', coalesce((select s.enabled from english.ai_settings s where s.family_id = v_l.family_id), false));
end
$$;

create or replace function english.eng_my_recent_lookups(p_limit int default 5) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
begin
  v_l := english.eng_my_learner_for_tutor();
  if v_l.id is null then return '[]'::jsonb; end if;
  -- Mỗi thẻ một dòng (lượt tra gần nhất của thẻ đó), mới nhất trước.
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ask_id', r.id, 'headword', v.headword, 'card_id', r.card_id, 'at', r.created_at) order by r.created_at desc)
    from (
      select d.* from (
        select distinct on (a.card_id) a.id, a.card_id, a.created_at
        from english.tutor_asks a
        where a.learner_id = v_l.id and a.kind = 'lookup' and a.card_id is not null
        order by a.card_id, a.created_at desc) d
      order by d.created_at desc
      limit least(greatest(coalesce(p_limit, 5), 1), 20)) r
    join english.vocab_cards v on v.id = r.card_id), '[]'::jsonb);
end
$$;

-- Một thẻ: luôn trả BẢN HIỆN HÀNH của chuỗi (§9). Mọi thành viên đã đăng nhập (con, người lớn) đọc được: thẻ không có gì của em.
create or replace function english.eng_my_vocab_card(p_card uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cur uuid := p_card;
  v_next uuid;
  v_row english.vocab_cards%rowtype;
begin
  if not exists (select 1 from english.members m where m.user_id = auth.uid()) then return null; end if;
  if not exists (select 1 from english.vocab_cards v where v.id = p_card) then return null; end if;
  loop
    select n.id into v_next from english.vocab_cards n where n.supersedes = v_cur;
    exit when v_next is null;
    v_cur := v_next;
    v_next := null;
  end loop;
  select * into v_row from english.vocab_cards v where v.id = v_cur;
  return pg_catalog.jsonb_build_object('id', v_row.id, 'requested', p_card, 'headword', v_row.headword, 'content', v_row.content);
end
$$;

create or replace function english.eng_my_notebook(p_kind text default 'word') returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
begin
  v_l := english.eng_my_learner_for_tutor();
  if v_l.id is null then return null; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'item_id', i.id, 'card_id', i.card_id, 'headword', i.headword,
             'meaning', v.content #>> '{senses,0,meaning_vi}', 'saved_at', i.created_at,
             'state', case when e.action = 'remove' then 'removed' else 'active' end) order by i.created_at desc)
    from english.notebook_items i
    join english.vocab_cards v on v.id = i.card_id
    left join lateral (select ev.action from english.notebook_item_events ev where ev.item_id = i.id order by ev.at desc, ev.id desc limit 1) e on true
    where i.learner_id = v_l.id and i.kind = coalesce(p_kind, 'word')), '[]'::jsonb);
end
$$;

-- Lưu một thẻ vào Sổ tay. Đã có mục cùng từ: đang trong Sổ tay → already; đã bỏ → thêm lại (sự kiện restore). Idempotent theo client_id.
create or replace function english.eng_notebook_save(p_card uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_head text;
  v_item uuid;
  v_state text;
begin
  v_l := english.eng_my_learner_for_tutor();
  if v_l.id is null then
    raise exception 'eng_notebook_save: only a child has a notebook (not_child)' using errcode = '42501';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 then
    raise exception 'eng_notebook_save: client id is required' using errcode = '22004';
  end if;
  select v.headword into v_head from english.vocab_cards v where v.id = p_card;
  if v_head is null then
    raise exception 'eng_notebook_save: card not found (not_found)' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('notebook:' || v_l.id::text || ':' || v_head, 0));
  select i.id into v_item from english.notebook_items i where i.learner_id = v_l.id and i.client_id = p_client_id;
  if v_item is not null then
    return pg_catalog.jsonb_build_object('item_id', v_item, 'already', true, 'state', 'active');
  end if;
  select i.id into v_item from english.notebook_items i where i.learner_id = v_l.id and i.kind = 'word' and i.headword = v_head
  order by i.created_at desc limit 1;
  if v_item is not null then
    select ev.action into v_state from english.notebook_item_events ev where ev.item_id = v_item order by ev.at desc, ev.id desc limit 1;
    if v_state = 'remove' then
      insert into english.notebook_item_events(item_id, learner_id, action) values (v_item, v_l.id, 'restore');
      return pg_catalog.jsonb_build_object('item_id', v_item, 'already', false, 'state', 'active');
    end if;
    return pg_catalog.jsonb_build_object('item_id', v_item, 'already', true, 'state', 'active');
  end if;
  insert into english.notebook_items(learner_id, kind, card_id, headword, source, client_id)
  values (v_l.id, 'word', p_card, v_head, 'lookup', p_client_id) returning id into v_item;
  return pg_catalog.jsonb_build_object('item_id', v_item, 'already', false, 'state', 'active');
end
$$;

create or replace function english.eng_notebook_set(p_item uuid, p_action text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_state text;
begin
  v_l := english.eng_my_learner_for_tutor();
  if p_action is null or p_action not in ('remove', 'restore') then
    raise exception 'eng_notebook_set: action is remove or restore' using errcode = '22023';
  end if;
  if v_l.id is null or not exists (select 1 from english.notebook_items i where i.id = p_item and i.learner_id = v_l.id) then
    raise exception 'eng_notebook_set: not this child''s item (forbidden)' using errcode = '42501';
  end if;
  select ev.action into v_state from english.notebook_item_events ev where ev.item_id = p_item order by ev.at desc, ev.id desc limit 1;
  if coalesce(v_state, 'restore') <> p_action then
    insert into english.notebook_item_events(item_id, learner_id, action) values (p_item, v_l.id, p_action);
  end if;
  return pg_catalog.jsonb_build_object('item_id', p_item, 'state', case when p_action = 'remove' then 'removed' else 'active' end);
end
$$;

create or replace function english.eng_rate_tutor_ask(p_ask uuid, p_rating text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
begin
  v_l := english.eng_my_learner_for_tutor();
  if p_rating is null or p_rating not in ('good', 'ok', 'confused') then
    raise exception 'eng_rate_tutor_ask: rating is good, ok or confused' using errcode = '22023';
  end if;
  if v_l.id is null or not exists (select 1 from english.tutor_asks a where a.id = p_ask and a.learner_id = v_l.id) then
    raise exception 'eng_rate_tutor_ask: not this child''s ask (forbidden)' using errcode = '42501';
  end if;
  insert into english.tutor_ask_ratings(ask_id, learner_id, rating) values (p_ask, v_l.id, p_rating);
  return pg_catalog.jsonb_build_object('ask_id', p_ask, 'rating', p_rating);
end
$$;

-- 7c. Người lớn của em (phụ huynh, thầy/cô có quan hệ còn hiệu lực): đọc lượt hỏi (D-G8). Mới nhất trước, trang theo p_before.
create or replace function english.eng_tutor_asks_for(p_learner uuid, p_before timestamptz default null, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not english.eng_is_staff_of(p_learner) then
    raise exception 'eng_tutor_asks_for: not an adult of this child (forbidden)' using errcode = '42501';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'id', a.id, 'at', a.created_at, 'kind', a.kind, 'child_text', a.child_text, 'context_text', a.context_text,
             'headword', v.headword, 'card_id', a.card_id, 'fixed_code', a.fixed_code, 'guard', a.guard,
             'saved', exists (select 1 from english.notebook_items i where i.learner_id = a.learner_id and i.kind = 'word' and i.headword = v.headword),
             'rating', (select r.rating from english.tutor_ask_ratings r where r.ask_id = a.id order by r.at desc, r.id desc limit 1))
           order by a.created_at desc)
    from (select * from english.tutor_asks t
          where t.learner_id = p_learner and (p_before is null or t.created_at < p_before)
          order by t.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) a
    left join english.vocab_cards v on v.id = a.card_id), '[]'::jsonb);
end
$$;

do $$
declare
  f text;
begin
  foreach f in array array['eng_my_tutor_status()', 'eng_my_recent_lookups(int)', 'eng_my_vocab_card(uuid)', 'eng_my_notebook(text)',
                           'eng_notebook_save(uuid, text)', 'eng_notebook_set(uuid, text)', 'eng_rate_tutor_ask(uuid, text)',
                           'eng_tutor_asks_for(uuid, timestamptz, int)'] loop
    execute pg_catalog.format('revoke execute on function english.%s from public, anon, service_role', f);
    execute pg_catalog.format('grant execute on function english.%s to authenticated', f);
  end loop;
end
$$;


-- 8. Xóa dữ liệu một em = bản 0039 + tutor_asks / tutor_ask_ratings / notebook_items / notebook_item_events ---------------------------
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
      'notebook_item_events', (select pg_catalog.count(*) from english.notebook_item_events x where x.learner_id = p_learner)));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0041') on conflict do nothing;
