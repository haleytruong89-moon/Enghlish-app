-- 0024_studio_b1.sql
-- Studio B1 · đề PDF/Word → bài trong app (spec docs/superpowers/specs/2026-11-05-studio-b1-design.md;
-- kế hoạch docs/superpowers/plans/2026-11-05-studio-b1.md):
--   1. Bảng mới: ai_settings (công tắc + trần của gia đình), ai_runs (sổ chi phí, chỉ thêm, không có nội dung), studio_drafts (bản nháp
--      đề, sửa được tới khi Duyệt), studio_item_meta (nhãn của từng câu, chỉ người lớn đọc), accepted_additions ("Đúng" cho câu lạ → áp
--      cho lần làm sau), item_decisions (Đúng/Sai của người lớn cho câu app không tự chấm). Nới CHECK (chỉ rộng hơn): inquiry_templates
--      (loại 'studio'), results (attempt_id, câu chỉ làm trên giấy), files (.docx cho đề / đáp án Studio), bucket english-work.
--   2. Mẫu Studio: chỉ phụ huynh và gia sư CỦA EM đọc; tự chấm transform/short theo đáp án ∪ đáp án chấp nhận (chỉ mẫu Studio);
--      eng_engine_inputs nhận Đúng/Sai của người lớn (hình JSON không đổi → lib/engine không đổi).
--   3. Ghi: cài đặt AI + đồng ý ai_text, cổng chi phí, sổ chạy AI, bản nháp, Duyệt (mẫu + nguồn + khóa + nhãn + khung đề), Giao.
--   4. Kết quả bài + dấu nhãn tự động, Đúng/Sai của người lớn, đọc cho Hộp duyệt và cho con (chỉ câu sai: không điểm, không tổng).
--   5. eng_purge_learner + eng_purge_preview thêm các bảng Studio.
-- Không đụng schema public. Idempotent; chỉ thêm (expand). Cần 0022 + 0023 đã áp.

-- 1. Bảng, CHECK, bảo vệ, RLS ----------------------------------------------------------------------------------------------------

-- 1a. Cài đặt AI của gia đình: một dòng mỗi gia đình, sửa được, chỉ qua eng_set_ai_settings (phụ huynh). Trần ≤ $10 (spec §5.5).
create table if not exists english.ai_settings (
  family_id uuid primary key references english.families(id),
  enabled boolean not null default false,
  monthly_cap_usd numeric(8, 2) not null default 10 check (monthly_cap_usd > 0 and monthly_cap_usd <= 10),
  soft_cap_usd numeric(8, 2) not null default 8 check (soft_cap_usd > 0),
  -- id của english.members, KHÔNG có khóa ngoại (như các bảng khác).
  updated_by_member uuid,
  updated_at timestamptz not null default clock_timestamp(),
  constraint ai_settings_soft_below_cap check (soft_cap_usd <= monthly_cap_usd)
);

-- 1b. Sổ chạy AI: chỉ thêm, KHÔNG có nội dung đề, đáp án hay bài làm. draft_id không có khóa ngoại: sổ chi phí còn sau khi xóa dữ liệu
-- một em (chi phí tháng phải đúng). Không có learner_id nên eng_forbid_mutation chặn mọi sửa / xóa, kể cả trong purge.
create table if not exists english.ai_runs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references english.families(id),
  purpose text not null check (purpose in ('studio_extract')),
  draft_id uuid,
  model text check (model is null or pg_catalog.length(model) between 1 and 100),
  prompt_version text check (prompt_version is null or prompt_version ~ '^[a-z0-9_.-]{1,60}$'),
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  status text not null check (status in ('ok', 'error', 'refused_cap', 'refused_off')),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,40}$'),
  by_member uuid,
  at timestamptz not null default clock_timestamp(),
  constraint ai_runs_refused_free check (status not in ('refused_cap', 'refused_off') or (cost_usd = 0 and input_tokens = 0 and output_tokens = 0))
);
create index if not exists ai_runs_family_at_idx on english.ai_runs(family_id, at desc);
create index if not exists ai_runs_draft_idx on english.ai_runs(draft_id);

-- 1c. Mẫu chủ đề: thêm loại 'studio' = mẫu riêng của MỘT em, sinh lúc Duyệt (không nằm trong content/ hay config.lock.json).
alter table english.inquiry_templates add column if not exists kind text not null default 'topic';
alter table english.inquiry_templates add column if not exists family_id uuid references english.families(id);
alter table english.inquiry_templates add column if not exists learner_id uuid references english.learners(id);
alter table english.inquiry_templates drop constraint if exists inquiry_templates_kind_check;
alter table english.inquiry_templates add constraint inquiry_templates_kind_check check (kind in ('topic', 'studio'));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_studio_owner;
alter table english.inquiry_templates add constraint inquiry_templates_studio_owner
  check ((kind = 'studio') = (family_id is not null and learner_id is not null));
-- Nới (chỉ rộng hơn): mẫu chủ đề giữ đúng luật cũ; mẫu Studio có mã riêng và được phép không có kỹ năng nào (đề chỉ có nhãn).
alter table english.inquiry_templates drop constraint if exists inquiry_templates_id_check;
alter table english.inquiry_templates add constraint inquiry_templates_id_check check (
  (kind = 'topic' and id ~ '^[AB]-W[0-9]+-[A-Z0-9-]+$') or (kind = 'studio' and id ~ '^[AB]-ST-[0-9]{6}$'));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_target_ids_check;
alter table english.inquiry_templates add constraint inquiry_templates_target_ids_check check (kind = 'studio' or cardinality(target_ids) > 0);
create index if not exists inquiry_templates_learner_idx on english.inquiry_templates(learner_id) where learner_id is not null;
create sequence if not exists english.studio_template_seq;
revoke all on sequence english.studio_template_seq from public, anon, authenticated;

-- 1d. Bản nháp đề. Sửa được khi status ∈ (extracting, ai_failed, draft); đã duyệt / đã bỏ thì bất biến (eng_guard_studio_draft).
-- "Sửa đề đã duyệt" = nháp mới có supersedes_draft_id → mẫu phiên bản mới (bài đã giao giữ phiên bản cũ).
create table if not exists english.studio_drafts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references english.families(id),
  learner_id uuid not null references english.learners(id),
  track_id text not null references english.tracks(id),
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 160),
  test_file_id uuid references english.files(id),
  key_file_id uuid references english.files(id),
  status text not null default 'draft' check (status in ('extracting', 'ai_failed', 'draft', 'approved', 'discarded')),
  payload jsonb not null default '{"parts": [], "passages": [], "items": []}'::jsonb,
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,40}$'),
  ai_run_id uuid references english.ai_runs(id),
  created_by_member uuid not null,
  updated_by_member uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  approved_by_member uuid,
  approved_at timestamptz,
  template_id text,
  template_version int,
  frame_id uuid references english.test_frames(id),
  supersedes_draft_id uuid references english.studio_drafts(id),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  foreign key (template_id, template_version) references english.inquiry_templates(id, version),
  constraint studio_drafts_payload_shape check (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and pg_catalog.jsonb_typeof(payload -> 'parts') = 'array'
    and pg_catalog.jsonb_typeof(payload -> 'passages') = 'array'
    and pg_catalog.jsonb_typeof(payload -> 'items') = 'array'
    and pg_catalog.length(payload::text) <= 1000000),
  constraint studio_drafts_approved_shape check (
    (status = 'approved') = (approved_at is not null and approved_by_member is not null and template_id is not null
                             and template_version is not null and frame_id is not null))
);
create index if not exists studio_drafts_learner_idx on english.studio_drafts(learner_id, updated_at desc);
create unique index if not exists studio_drafts_supersedes_once on english.studio_drafts(supersedes_draft_id)
  where supersedes_draft_id is not null and status <> 'discarded';

-- 1e. Nhãn của từng câu của mẫu Studio (chỉ người lớn đọc; con không thấy nhãn). Đúng MỘT nhãn mỗi câu: câu đọc dùng
-- reading_skill_key (nhóm "Kỹ năng đọc"), câu khác dùng tag_key. Câu out_of_app chỉ nằm ở khung đề giấy.
create table if not exists english.studio_item_meta (
  template_id text not null,
  template_version int not null,
  item_id text not null check (item_id ~ '^q[1-9][0-9]{0,2}$'),
  learner_id uuid not null references english.learners(id),
  n int not null check (n between 1 and 300),
  part text not null check (pg_catalog.length(pg_catalog.btrim(part)) between 1 and 20),
  tag_key text check (tag_key is null or pg_catalog.length(tag_key) between 1 and 80),
  reading_skill_key text check (reading_skill_key is null or pg_catalog.length(reading_skill_key) between 1 and 80),
  out_of_app boolean not null,
  primary key (template_id, template_version, item_id),
  unique (template_id, template_version, n),
  foreign key (template_id, template_version) references english.inquiry_templates(id, version),
  constraint studio_item_meta_one_tag check ((tag_key is null) <> (reading_skill_key is null)),
  constraint studio_item_meta_id_is_n check (item_id = 'q' || n::text)
);
create index if not exists studio_item_meta_learner_idx on english.studio_item_meta(learner_id);

-- 1f. "Đúng" của người lớn cho một câu lạ (transform / short) → đáp án chấp nhận thêm của mẫu, áp cho các lần làm SAU (không chấm lại).
create table if not exists english.accepted_additions (
  id uuid primary key default gen_random_uuid(),
  template_id text not null,
  template_version int not null,
  item_id text not null,
  learner_id uuid not null references english.learners(id),
  answer text not null check (pg_catalog.length(pg_catalog.btrim(answer)) between 1 and 2000),
  by_member uuid not null,
  at timestamptz not null default clock_timestamp(),
  from_attempt_id uuid references english.attempts(id),
  foreign key (template_id, template_version, item_id) references english.studio_item_meta(template_id, template_version, item_id)
);
create unique index if not exists accepted_additions_once
  on english.accepted_additions(template_id, template_version, item_id, english.eng_norm_answer(answer));
create index if not exists accepted_additions_learner_idx on english.accepted_additions(learner_id);

-- 1g. Đúng/Sai của người lớn: chỉ cho câu 'needs_person' của một lần làm bài Studio (eng_check_item_decision), một lần mỗi câu.
create table if not exists english.item_decisions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references english.attempts(id),
  learner_id uuid not null references english.learners(id),
  item_id text not null check (item_id ~ '^q[1-9][0-9]{0,2}$'),
  result text not null check (result in ('correct', 'incorrect')),
  by_member uuid not null,
  by_role text not null check (by_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  at timestamptz not null default clock_timestamp(),
  unique (attempt_id, item_id)
);
create index if not exists item_decisions_learner_idx on english.item_decisions(learner_id);

-- 1h. Kết quả bài: lần làm Studio (attempt_id, mỗi lần làm tối đa một kết quả) và câu chỉ làm trên giấy (không tính đúng, không tính sai).
alter table english.results add column if not exists attempt_id uuid references english.attempts(id);
alter table english.results add column if not exists not_in_app_items int[] not null default '{}';
create unique index if not exists results_attempt_once on english.results(attempt_id) where attempt_id is not null;
alter table english.results drop constraint if exists results_counts;
alter table english.results add constraint results_counts check (
  correct between 0 and total_items
  and cardinality(wrong_items) + cardinality(not_in_app_items) = total_items - correct
  and english.eng_valid_item_list(wrong_items, total_items)
  and english.eng_valid_item_list(not_in_app_items, total_items)
  and not (wrong_items && not_in_app_items));
alter table english.results drop constraint if exists results_source_frame;
alter table english.results add constraint results_source_frame check (mode <> 'frame' or source = 'test' or attempt_id is not null);
alter table english.results drop constraint if exists results_studio_shape;
alter table english.results add constraint results_studio_shape check (attempt_id is not null or cardinality(not_in_app_items) = 0);

-- 1i. File: đề và đáp án Studio (PDF hoặc Word .docx). .docx CHỈ cho hai loại này. Bản cũ của mỗi CHECK là trường hợp riêng của bản mới.
alter table english.files drop constraint if exists files_kind_check;
alter table english.files add constraint files_kind_check
  check (kind in ('assignment_pdf', 'answer_key', 'result_image', 'work_photo', 'external_result', 'studio_test', 'studio_key'));
alter table english.files drop constraint if exists files_mime_check;
alter table english.files add constraint files_mime_check check (mime in (
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
alter table english.files drop constraint if exists files_kind_mime;
alter table english.files add constraint files_kind_mime check (
  (kind = 'assignment_pdf' and mime = 'application/pdf')
  or (kind in ('answer_key', 'work_photo', 'external_result') and mime <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  or (kind = 'result_image' and mime in ('image/png', 'image/jpeg', 'image/webp'))
  or (kind in ('studio_test', 'studio_key') and mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')));
alter table english.files drop constraint if exists files_path_shape;
alter table english.files add constraint files_path_shape check (
  path = family_id::text || '/' || coalesce(learner_id::text, 'shared') || '/' || id::text ||
    case mime
      when 'application/pdf' then '.pdf'
      when 'image/png' then '.png'
      when 'image/jpeg' then '.jpg'
      when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then '.docx'
      else '.webp' end);

-- Kho file: thêm .docx vào danh sách loại file của bucket english-work (chỉ bucket này; CI chỉ có Postgres trơn thì bỏ qua).
do $$
begin
  if pg_catalog.to_regclass('storage.buckets') is not null then
    begin
      update storage.buckets
        set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
                                       'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        where id = 'english-work';
    exception when others then
      raise warning 'english-work bucket MIME list was not updated here (%): the app sets it when it (re)creates the bucket', sqlerrm;
    end;
  end if;
end
$$;

-- 1j. Chỉ thêm (theo hướng dẫn đầu 0004). ai_runs không có learner_id: không bao giờ sửa / xóa được.
do $$
declare
  t text;
begin
  foreach t in array array['ai_runs', 'studio_item_meta', 'accepted_additions', 'item_decisions'] loop
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

-- 1k. Bản nháp: sửa khi còn là nháp, đúng các bước chuyển; xóa chỉ trong eng_purge_learner (cùng "cửa" với eng_forbid_mutation).
create or replace function english.eng_guard_studio_draft() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_purge text := nullif(pg_catalog.current_setting('app.purge_learner', true), '');
  v_owner text;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'english.studio_drafts: TRUNCATE is forbidden' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if v_purge is not null and old.learner_id::text = v_purge then
      select r.rolname into v_owner
      from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
      where p.oid = pg_catalog.to_regprocedure('english.eng_purge_learner(uuid,uuid)');
      if v_owner is not null and current_user = v_owner then return old; end if;
    end if;
    raise exception 'english.studio_drafts: DELETE is forbidden (discard the draft instead)' using errcode = '42501';
  end if;
  if old.status in ('approved', 'discarded') then
    raise exception 'english.studio_drafts: an approved or discarded draft cannot change (make a new draft instead)' using errcode = '42501';
  end if;
  if new.id <> old.id or new.family_id <> old.family_id or new.learner_id <> old.learner_id or new.track_id <> old.track_id
     or new.created_by_member <> old.created_by_member or new.created_at <> old.created_at or new.client_id <> old.client_id
     or new.test_file_id is distinct from old.test_file_id or new.key_file_id is distinct from old.key_file_id
     or new.supersedes_draft_id is distinct from old.supersedes_draft_id then
    raise exception 'english.studio_drafts: owner, files, origin and client id of a draft never change' using errcode = '42501';
  end if;
  if not (new.status = old.status
          or (old.status = 'extracting' and new.status in ('draft', 'ai_failed', 'discarded'))
          or (old.status in ('ai_failed', 'draft') and new.status in ('draft', 'approved', 'discarded'))) then
    raise exception 'english.studio_drafts: % → % is not allowed', old.status, new.status using errcode = '23514';
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;
drop trigger if exists studio_drafts_guard on english.studio_drafts;
create trigger studio_drafts_guard before update or delete on english.studio_drafts
  for each row execute function english.eng_guard_studio_draft();
drop trigger if exists studio_drafts_guard_truncate on english.studio_drafts;
create trigger studio_drafts_guard_truncate before truncate on english.studio_drafts
  for each statement execute function english.eng_guard_studio_draft();

-- 1l. Đúng/Sai chỉ cho câu 'needs_person' của chính lần làm bài Studio đó.
create or replace function english.eng_check_item_decision() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1
    from english.attempt_auto_checks c
    join english.attempts t on t.id = c.attempt_id
    join english.activity_instances a on a.id = t.activity_instance_id
    join english.inquiry_instances i on i.id = a.inquiry_instance_id
    join english.inquiry_templates tp on tp.id = i.template_id and tp.version = i.template_version
    where c.attempt_id = new.attempt_id and t.learner_id = new.learner_id and tp.kind = 'studio'
      and c.checks -> 'items' -> new.item_id ->> 'result' = 'needs_person') then
    raise exception 'item_decisions: only an item waiting for a person in a Studio attempt can be decided (not_pending_item)'
      using errcode = '23514';
  end if;
  return new;
end
$$;
drop trigger if exists item_decisions_check on english.item_decisions;
create trigger item_decisions_check before insert on english.item_decisions
  for each row execute function english.eng_check_item_decision();

-- 1m. Một mẫu Studio chỉ giao được cho chính em của nó (B1: muốn dùng cho em khác thì tải lại cho em đó).
create or replace function english.eng_check_studio_instance() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (
    select 1 from english.inquiry_templates t
    where t.id = new.template_id and t.version = new.template_version and t.kind = 'studio' and t.learner_id <> new.learner_id) then
    raise exception 'inquiry_instances: a Studio template belongs to one learner (studio_other_learner)' using errcode = '23514';
  end if;
  return new;
end
$$;
drop trigger if exists inquiry_instances_studio_owner on english.inquiry_instances;
create trigger inquiry_instances_studio_owner before insert on english.inquiry_instances
  for each row execute function english.eng_check_studio_instance();

-- 1n. Xóa dữ liệu một em cũng xóa mẫu Studio của em (đã công bố). Bốn trigger "đã công bố / chỉ thêm" của mẫu, nguồn, khóa và nối nguồn
-- được trỏ sang hàm mới: y hệt hàm cũ (cùng thông báo, cùng mã lỗi), chỉ thêm một ngoại lệ — DELETE bên trong eng_purge_learner, cho dòng
-- thuộc mẫu Studio của đúng em đang xóa. Mẫu chủ đề tuần không bao giờ xóa được. Ba hàm dùng chung của 0005/0007/0009 không đổi.
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
    when 'inquiry_templates' then coalesce(p_old ->> 'kind' = 'studio' and p_old ->> 'learner_id' = v_purge, false)
    when 'template_item_keys' then exists (
      select 1 from english.inquiry_templates t
      where t.id = p_old ->> 'template_id' and t.version = (p_old ->> 'template_version')::int
        and t.kind = 'studio' and t.learner_id::text = v_purge)
    when 'template_step_sources' then exists (
      select 1 from english.inquiry_templates t
      where t.id = p_old ->> 'template_id' and t.version = (p_old ->> 'template_version')::int
        and t.kind = 'studio' and t.learner_id::text = v_purge)
    when 'sources' then exists (
      select 1 from english.inquiry_templates t
      where t.kind = 'studio' and t.learner_id::text = v_purge and (p_old ->> 'id') like ('ST-' || t.id || '-%'))
    else false
  end;
end
$$;

-- = eng_forbid_published_change('self') (0005) + ngoại lệ purge Studio.
create or replace function english.eng_forbid_published_change_studio() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'english.%: TRUNCATE is forbidden on versioned configuration', tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then return new; end if;
  if tg_op = 'DELETE' and english.eng_purge_allows_studio(tg_table_name, pg_catalog.to_jsonb(old)) then return old; end if;
  if old.published_at is not null then
    raise exception 'english.%: % is forbidden on a published configuration row (publish a new version instead)', tg_table_name, tg_op
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

-- = eng_forbid_published_parent_change('template') (0007) + ngoại lệ purge Studio.
create or replace function english.eng_forbid_published_parent_change_studio() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_id text;
  v_ver int;
  v_published boolean;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'english.%: TRUNCATE is forbidden on versioned content', tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and english.eng_purge_allows_studio(tg_table_name, pg_catalog.to_jsonb(old)) then return old; end if;
  if tg_op = 'INSERT' then
    v_id := new.template_id; v_ver := new.template_version;
  else
    v_id := old.template_id; v_ver := old.template_version;
  end if;
  select t.published_at is not null into v_published from english.inquiry_templates t where t.id = v_id and t.version = v_ver;
  if coalesce(v_published, false) then
    raise exception 'english.%: % is forbidden once the parent % %/% is published (publish a new version instead)',
      tg_table_name, tg_op, 'template', v_id, v_ver using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

-- = eng_forbid_row_change() (0009) + ngoại lệ purge Studio.
create or replace function english.eng_forbid_row_change_studio() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and english.eng_purge_allows_studio(tg_table_name, pg_catalog.to_jsonb(old)) then return old; end if;
  raise exception 'english.%: % is forbidden (rows are insert-only)', tg_table_name, tg_op using errcode = '42501';
end
$$;

drop trigger if exists inquiry_templates_immutable on english.inquiry_templates;
create trigger inquiry_templates_immutable
  before update or delete on english.inquiry_templates
  for each row execute function english.eng_forbid_published_change_studio();
drop trigger if exists sources_immutable on english.sources;
create trigger sources_immutable
  before update or delete on english.sources
  for each row execute function english.eng_forbid_published_change_studio();
drop trigger if exists template_item_keys_immutable on english.template_item_keys;
create trigger template_item_keys_immutable
  before insert or update or delete on english.template_item_keys
  for each row execute function english.eng_forbid_published_parent_change_studio();
drop trigger if exists template_step_sources_immutable on english.template_step_sources;
create trigger template_step_sources_immutable
  before update or delete on english.template_step_sources
  for each row execute function english.eng_forbid_row_change_studio();

revoke execute on function english.eng_purge_allows_studio(text, jsonb) from public, anon, authenticated, service_role;
revoke execute on function english.eng_forbid_published_change_studio() from public, anon, authenticated, service_role;
revoke execute on function english.eng_forbid_published_parent_change_studio() from public, anon, authenticated, service_role;
revoke execute on function english.eng_forbid_row_change_studio() from public, anon, authenticated, service_role;
revoke execute on function english.eng_guard_studio_draft() from public, anon, authenticated, service_role;
revoke execute on function english.eng_check_item_decision() from public, anon, authenticated, service_role;
revoke execute on function english.eng_check_studio_instance() from public, anon, authenticated, service_role;

-- 1o. RLS: nháp, nhãn câu, đáp án chấp nhận, Đúng/Sai — phụ huynh và gia sư CỦA EM đọc (gia sư em khác, học sinh: không). Bảng AI: không
-- vai nào của app đọc thẳng (chỉ qua hàm, chỉ phụ huynh). Không ai (kể cả service_role) ghi thẳng: chỉ các hàm security definer.
alter table english.ai_settings enable row level security;
alter table english.ai_runs enable row level security;
alter table english.studio_drafts enable row level security;
alter table english.studio_item_meta enable row level security;
alter table english.accepted_additions enable row level security;
alter table english.item_decisions enable row level security;
revoke all on english.ai_settings, english.ai_runs, english.studio_drafts, english.studio_item_meta, english.accepted_additions, english.item_decisions from public, anon, authenticated;
revoke insert, update, delete, truncate on english.ai_settings, english.ai_runs, english.studio_drafts, english.studio_item_meta, english.accepted_additions, english.item_decisions from service_role;
grant select on english.studio_drafts, english.studio_item_meta, english.accepted_additions, english.item_decisions to authenticated;
drop policy if exists studio_drafts_select on english.studio_drafts;
create policy studio_drafts_select on english.studio_drafts
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists studio_item_meta_select on english.studio_item_meta;
create policy studio_item_meta_select on english.studio_item_meta
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists accepted_additions_select on english.accepted_additions;
create policy accepted_additions_select on english.accepted_additions
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists item_decisions_select on english.item_decisions;
create policy item_decisions_select on english.item_decisions
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- 5. Purge: thêm các bảng Studio (giữ nguyên mọi dòng của 0023; có test đối chiếu từng dòng).
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

  -- Studio B1: Đúng/Sai của người lớn và đáp án chấp nhận (trỏ tới attempts → trước attempts; đáp án chấp nhận trỏ tới nhãn câu),
  -- nhãn của từng câu, bản nháp đề (trỏ tới files và mẫu → trước files). Mẫu Studio của em: sau inquiry_instances (bên dưới).
  delete from english.item_decisions idc where idc.learner_id = p_learner_id;
  get diagnostics n_item_decisions = row_count;

  delete from english.accepted_additions aa where aa.learner_id = p_learner_id;
  get diagnostics n_accepted_additions = row_count;

  delete from english.studio_item_meta sim where sim.learner_id = p_learner_id;
  get diagnostics n_studio_item_meta = row_count;

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
                where t.id = tik.template_id and t.version = tik.template_version and t.kind = 'studio' and t.learner_id = p_learner_id);
  get diagnostics n_studio_template_keys = row_count;

  delete from english.inquiry_templates it where it.kind = 'studio' and it.learner_id = p_learner_id;
  get diagnostics n_studio_templates = row_count;

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

-- Đếm trước khi xóa: thêm các bảng Studio B1 (giữ nguyên mọi dòng của 0023).
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
      'studio_templates', (select pg_catalog.count(*) from english.inquiry_templates x where x.kind = 'studio' and x.learner_id = p_learner),
      -- (the receipt of the purge lists these three too, and the dry run must report exactly the same keys)
      'studio_step_sources', (select pg_catalog.count(*) from english.template_step_sources x
        where exists (select 1 from english.inquiry_templates t where t.id = x.template_id and t.version = x.template_version and t.kind = 'studio' and t.learner_id = p_learner)),
      'studio_sources', (select pg_catalog.count(*) from english.sources x
        where x.id like 'ST-%' and exists (select 1 from english.inquiry_templates t where t.kind = 'studio' and t.learner_id = p_learner and x.id like ('ST-' || t.id || '-%'))),
      'studio_template_keys', (select pg_catalog.count(*) from english.template_item_keys x
        where exists (select 1 from english.inquiry_templates t where t.id = x.template_id and t.version = x.template_version and t.kind = 'studio' and t.learner_id = p_learner)),
      'login_names', (select pg_catalog.count(*) from english.login_names x where x.auth_user_id = v_user),
      'learners', 1,
      'members', (select pg_catalog.count(*) from english.members x where x.id = v_l.member_id and x.role = 'student')));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0024') on conflict do nothing;
