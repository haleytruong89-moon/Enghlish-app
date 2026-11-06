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
  status text not null check (status in ('ok', 'error', 'refused_cap', 'refused_off', 'refused_model', 'reserved')),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,40}$'),
  by_member uuid,
  -- 'reserved' = the worst-case price of a call, written under the family lock BEFORE the call; the row that logs the real cost points back
  -- at it (releases_run_id) and the reservation then stops counting. A reservation nobody released (crash) keeps counting: the cap errs on the safe side.
  releases_run_id uuid references english.ai_runs(id),
  at timestamptz not null default clock_timestamp(),
  constraint ai_runs_refused_free check (status not in ('refused_cap', 'refused_off', 'refused_model') or (cost_usd = 0 and input_tokens = 0 and output_tokens = 0))
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

-- 2. Đọc mẫu Studio, tự chấm, đầu vào engine, đăng ký file ---------------------------------------------------------------------

-- 2a. Mẫu Studio (và khóa, nối nguồn, bài đọc của nó): CHỈ phụ huynh và gia sư của chính em đó (spec §7). Mẫu chủ đề tuần: như 0007.
drop policy if exists inquiry_templates_select on english.inquiry_templates;
create policy inquiry_templates_select on english.inquiry_templates
  for select to authenticated
  using (published_at is not null and ((kind = 'topic' and english.eng_staff_has_track(track_id)) or (kind = 'studio' and english.eng_is_staff_of(learner_id))));

create or replace function english.eng_staff_may_read_template(p_id text, p_version int) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from english.inquiry_templates t
    where t.id = p_id and t.version = p_version
      and t.published_at is not null
      and ((t.kind = 'topic' and english.eng_staff_has_track(t.track_id))
           or (t.kind = 'studio' and english.eng_is_staff_of(t.learner_id))))
$$;

create or replace function english.eng_staff_may_read_source(p_id text, p_version int) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from english.inquiry_templates t
    where t.published_at is not null
      and t.sources @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', p_id, 'version', p_version))
      and ((t.kind = 'topic' and english.eng_staff_has_track(t.track_id))
           or (t.kind = 'studio' and english.eng_is_staff_of(t.learner_id))))
$$;
revoke execute on function english.eng_staff_may_read_template(text, int) from public, anon;
revoke execute on function english.eng_staff_may_read_source(text, int) from public, anon;
grant execute on function english.eng_staff_may_read_template(text, int) to authenticated, service_role;
grant execute on function english.eng_staff_may_read_source(text, int) to authenticated, service_role;

-- 2b. Tự chấm. Nhánh của mẫu chủ đề tuần = đúng bản 0009. CHỈ mẫu Studio: transform / short có đáp án → so như gap (eng_norm_answer) với
-- đáp án (" / ") ∪ đáp án chấp nhận của mẫu (accepted_additions, áp cho lần làm SAU khi được thêm); không khớp → 'needs_person'
-- (người lớn Đúng/Sai). open: để trống → 'blank', còn lại 'needs_person'. Không bao giờ ra điểm 0–4.
create or replace function english.eng_compute_auto_checks(p_instance uuid, p_step jsonb, p_answers jsonb) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  v_item jsonb;
  v_id text;
  v_kind text;
  v_opts jsonb;
  v_key text;
  v_given text;
  v_res text;
  v_ki int;
  v_gi int;
  v_items jsonb := '{}'::jsonb;
  v_total int := 0;
  v_checked int := 0;
  v_correct int := 0;
  v_studio boolean := false;
  v_tpl text;
  v_ver int;
begin
  select t.kind = 'studio', t.id, t.version into v_studio, v_tpl, v_ver
  from english.inquiry_instances i
  join english.inquiry_templates t on t.id = i.template_id and t.version = i.template_version
  where i.id = p_instance;
  v_studio := coalesce(v_studio, false);

  for v_item in select x from pg_catalog.jsonb_array_elements(coalesce(p_step -> 'items', '[]'::jsonb)) as x loop
    v_id := v_item ->> 'id';
    v_kind := v_item ->> 'kind';
    v_opts := coalesce(v_item -> 'options', '[]'::jsonb);
    v_given := coalesce(p_answers ->> v_id, '');
    v_total := v_total + 1;
    v_res := 'needs_person';

    if v_kind in ('mcq', 'gap', 'word_form') then
      select k.answer into v_key
      from english.instance_item_keys k
      where k.inquiry_instance_id = p_instance and k.item_id = v_id and k.kind = 'answer';

      if v_key is not null and pg_catalog.btrim(v_key) <> '' then
        if pg_catalog.jsonb_array_length(v_opts) > 0 then
          v_ki := english.eng_resolve_option(v_opts, v_key);
          if v_ki is not null then
            v_gi := english.eng_resolve_option(v_opts, v_given);
            v_res := case when english.eng_clean_text(v_given) = '' then 'blank'
                          when v_gi is not null and v_gi = v_ki then 'correct'
                          else 'incorrect' end;
          end if;
        else
          v_res := case
            when english.eng_clean_text(v_given) = '' then 'blank'
            when exists (
              select 1 from pg_catalog.regexp_split_to_table(english.eng_clean_text(v_key), ' / ') as a
              where english.eng_norm_answer(a) = english.eng_norm_answer(v_given)) then 'correct'
            else 'incorrect' end;
        end if;
      end if;
    elsif v_studio and v_kind in ('transform', 'short') then
      select k.answer into v_key
      from english.instance_item_keys k
      where k.inquiry_instance_id = p_instance and k.item_id = v_id and k.kind = 'answer';
      if v_key is not null and pg_catalog.btrim(v_key) <> '' then
        v_res := case
          when english.eng_clean_text(v_given) = '' then 'blank'
          when exists (
            select 1 from pg_catalog.regexp_split_to_table(english.eng_clean_text(v_key), ' / ') as a
            where english.eng_norm_answer(a) = english.eng_norm_answer(v_given))
            or exists (
              select 1 from english.accepted_additions aa
              where aa.template_id = v_tpl and aa.template_version = v_ver and aa.item_id = v_id
                and english.eng_norm_answer(aa.answer) = english.eng_norm_answer(v_given)) then 'correct'
          else 'needs_person' end;
      end if;
    elsif v_studio and v_kind = 'open' and english.eng_clean_text(v_given) = '' then
      v_res := 'blank';
    end if;

    if v_res <> 'needs_person' then
      v_checked := v_checked + 1;
      if v_res = 'correct' then v_correct := v_correct + 1; end if;
    end if;
    v_items := v_items || pg_catalog.jsonb_build_object(v_id, pg_catalog.jsonb_build_object('kind', v_kind, 'result', v_res));
  end loop;

  return pg_catalog.jsonb_build_object('version', 1, 'total', v_total, 'checked', v_checked, 'correct', v_correct, 'items', v_items);
end
$$;
revoke execute on function english.eng_compute_auto_checks(uuid, jsonb, jsonb) from public, anon, authenticated, service_role;

-- 2c. Đầu vào engine = bản 0023, chỉ đổi khối 'auto': câu 'needs_person' lấy Đúng/Sai của người lớn (item_decisions); chưa có thì bỏ qua câu đó. Hình JSON không đổi.
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
               'context_id', e.context_id, 'is_first_attempt', e.is_first_attempt, 'step_repeat', english.eng_is_step_repeat(t.id), 'mode', t.mode,
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
               'is_first_attempt', e.is_first_attempt, 'step_repeat', english.eng_is_step_repeat(t.id), 'mode', t.mode, 'facets', e.facets,
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
                 'item_id', x ->> 'id', 'target_key', x ->> 'target_id', 'result', r.res)
               order by x ->> 'id') as items
        from pg_catalog.jsonb_array_elements(i.snapshot -> 'steps') as st
        cross join lateral pg_catalog.jsonb_array_elements(coalesce(st -> 'items', '[]'::jsonb)) as x
        cross join lateral (
          select case
                   when (c.checks -> 'items' -> (x ->> 'id') ->> 'result') = 'needs_person'
                     then (select d.result from english.item_decisions d where d.attempt_id = c.attempt_id and d.item_id = x ->> 'id')
                   else c.checks -> 'items' -> (x ->> 'id') ->> 'result'
                 end as res) r
        where (st ->> 'step_no')::int = a.step_no
          and x ->> 'target_id' = any (v_keys)
          and r.res in ('correct', 'incorrect', 'blank')) it
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
revoke execute on function english.eng_engine_inputs(uuid, text[]) from public, anon, authenticated;
grant execute on function english.eng_engine_inputs(uuid, text[]) to service_role;

-- 2d. Đăng ký file = bản 0016 + Word .docx (chỉ cho đề / đáp án Studio).
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
  if v_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and p_kind not in ('studio_test', 'studio_key') then
    raise exception 'eng_register_file: a Word file is accepted only for a Studio test or answer key' using errcode = '22023';
  end if;
  if p_kind in ('studio_test', 'studio_key') and v_mime not in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception 'eng_register_file: a Studio test or answer key must be a PDF or a .docx file' using errcode = '22023';
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

-- 3. Ghi: AI, bản nháp, Duyệt, Giao (service_role sau requireAccess; hàm kiểm lại người thao tác) ------------------------------------

-- 3a. Chi phí AI tháng này (tháng lịch Việt Nam) của một gia đình. Nội bộ.
create or replace function english.eng_ai_month_spent(p_family uuid) returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(r.cost_usd), 0)::numeric
  from english.ai_runs r
  where r.family_id = p_family
    and not exists (select 1 from english.ai_runs x where x.releases_run_id = r.id)
    and r.at >= (pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')
$$;
revoke execute on function english.eng_ai_month_spent(uuid) from public, anon, authenticated, service_role;

-- 3b. Cổng AI cho một em: công tắc của gia đình + đồng ý ai_text mới nhất của em + chi phí tháng < trần. Không có dòng cài đặt = tắt.
create or replace function english.eng_ai_gate(
  p_learner uuid, p_estimate numeric default 0, p_reserve boolean default false, p_draft uuid default null, p_model text default null, p_by uuid default null
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
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_ai_gate: learner not found' using errcode = 'P0002';
  end if;
  -- One family spends one call at a time through this check: the lock is held until the end of this transaction, and a reservation row
  -- is written inside it, so a second caller sees the first one's worst-case price (no overshoot of the hard cap by parallel calls).
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
    values (v_l.family_id, 'studio_extract', p_draft, p_model, 0, 0, v_est, 'reserved', 'reserved', p_by)
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

-- 3c. Màn Cài đặt AI (chỉ phụ huynh của gia đình).
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
               'ai_text', (select c.granted from english.consents c where c.learner_id = l.id and c.scope = 'ai_text' order by c.at desc, c.id desc limit 1))
             order by l.track_id, l.alias)
      from english.learners l where l.family_id = v_m.family_id), '[]'::jsonb));
end
$$;

-- 3d. Bật / tắt AI (chỉ phụ huynh): một dòng cài đặt + một dòng đồng ý ai_text (granted = bật hay tắt) cho MỖI em của gia đình.
create or replace function english.eng_set_ai_settings(p_enabled boolean, p_notice_version text, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
begin
  if p_enabled is null or p_by is null then
    raise exception 'eng_set_ai_settings: enabled and actor are required' using errcode = '22004';
  end if;
  if p_notice_version is null or p_notice_version !~ '^[a-z0-9._-]{1,40}$' then
    raise exception 'eng_set_ai_settings: notice version must be a short code' using errcode = '22023';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'parent' then
    raise exception 'eng_set_ai_settings: only a parent changes the AI settings (parent_only)' using errcode = '42501';
  end if;
  insert into english.ai_settings(family_id, enabled, updated_by_member, updated_at)
  values (v_m.family_id, p_enabled, p_by, pg_catalog.clock_timestamp())
  on conflict (family_id) do update set enabled = excluded.enabled, updated_by_member = excluded.updated_by_member, updated_at = excluded.updated_at;
  insert into english.consents(learner_id, subject_member_id, notice_version, scope, granted, recorded_by)
  select l.id, p_by, p_notice_version, 'ai_text', p_enabled, p_by
  from english.learners l where l.family_id = v_m.family_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, payload)
  values (v_m.user_id, v_m.role, 'ai.settings_changed', v_m.family_id,
          pg_catalog.jsonb_build_object('enabled', p_enabled, 'notice_version', p_notice_version));
  return english.eng_ai_settings(p_by);
end
$$;

-- 3e. Một lần gọi AI (hoặc một lần bị từ chối): chỉ số, không nội dung.
create or replace function english.eng_log_ai_run(
  p_family uuid, p_draft uuid, p_model text, p_prompt_version text, p_input int, p_output int, p_cost numeric, p_status text, p_error text, p_by uuid,
  p_release uuid default null
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_family is null or p_status is null then
    raise exception 'eng_log_ai_run: family and status are required' using errcode = '22004';
  end if;
  insert into english.ai_runs(family_id, purpose, draft_id, model, prompt_version, input_tokens, output_tokens, cost_usd, status, error_code, by_member, releases_run_id)
  values (p_family, 'studio_extract', p_draft, p_model, p_prompt_version, coalesce(p_input, 0), coalesce(p_output, 0), coalesce(p_cost, 0), p_status, p_error, p_by, p_release)
  returning id into v_id;
  return v_id;
end
$$;

-- 3f. Kỹ năng gắn được cho câu của đề Studio (P1): bộ kỹ năng hiện hành của em ∩ kỹ năng mà danh mục tính "ACT-SOURCE-QA" là bài được
-- tính (cùng cách đọc evidence_tasks với eng_check_inquiry_template, 0007). Kỹ năng khác sẽ bị trigger công bố mẫu từ chối.
create or replace function english.eng_studio_skills(p_learner uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with cur as (
    select d.target_ids, d.descriptor_version
    from english.target_sets ts
    join english.target_set_definitions d on d.id = ts.definition_id
    where ts.learner_id = p_learner and ts.effective_from <= pg_catalog.clock_timestamp()
    order by ts.effective_from desc, ts.seq desc
    limit 1
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', t.id, 'title_vi', t.title_vi) order by u.o), '[]'::jsonb)
  from cur
  cross join lateral unnest(cur.target_ids) with ordinality as u(k, o)
  join english.targets t on t.id = u.k and t.descriptor_version = cur.descriptor_version
  where exists (
    select 1 from pg_catalog.jsonb_array_elements_text(t.raw -> 'evidence_tasks') as e
    where substring(pg_catalog.regexp_replace(e, '\s*\([^)]*\)', '', 'g') from '.*(ACT-[A-Z0-9-]+)') = 'ACT-SOURCE-QA')
$$;

-- 3g. Tạo bản nháp (gia sư hoặc phụ huynh của em). p_extract = true → 'extracting' (máy chủ đã qua cổng AI), false → nháp trống (Soạn tay).
-- File: {id, mime, bytes} đã kiểm ở máy chủ; đường dẫn do eng_register_file tính. Gửi lại cùng client_id = cùng bản nháp.
create or replace function english.eng_create_studio_draft(
  p_learner uuid, p_title text, p_test_file jsonb, p_key_file jsonb, p_extract boolean, p_by uuid, p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_title text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  v_existing english.studio_drafts%rowtype;
  v_test uuid;
  v_key uuid;
  v_id uuid;
begin
  if p_learner is null or p_extract is null or p_by is null then
    raise exception 'eng_create_studio_draft: learner, mode and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_create_studio_draft: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if pg_catalog.length(v_title) not between 1 and 160 then
    raise exception 'eng_create_studio_draft: a title of 1..160 characters is required (bad_title)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_create_studio_draft: learner not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_create_studio_draft: this member may not make tests for this learner' using errcode = '42501';
  end if;
  select * into v_existing from english.studio_drafts d where d.learner_id = p_learner and d.client_id = p_client_id;
  if found then
    if v_existing.title <> v_title then
      raise exception 'eng_create_studio_draft: client_id was already used for another draft' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'replayed', true);
  end if;
  if p_extract and p_test_file is null then
    raise exception 'eng_create_studio_draft: AI needs the test file (test_file_required)' using errcode = '22023';
  end if;
  if p_test_file is not null then
    v_test := english.eng_register_file(v_l.family_id, p_learner, 'studio_test', p_test_file, p_by);
  end if;
  if p_key_file is not null then
    v_key := english.eng_register_file(v_l.family_id, p_learner, 'studio_key', p_key_file, p_by);
  end if;
  insert into english.studio_drafts(family_id, learner_id, track_id, title, test_file_id, key_file_id, status, created_by_member, updated_by_member, client_id)
  values (v_l.family_id, p_learner, v_l.track_id, v_title, v_test, v_key, case when p_extract then 'extracting' else 'draft' end, p_by, p_by, p_client_id)
  returning id into v_id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'studio.draft_created', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('draft', v_id, 'extract', p_extract));
  return pg_catalog.jsonb_build_object('id', v_id, 'status', case when p_extract then 'extracting' else 'draft' end, 'replayed', false);
end
$$;

-- 3h. "Sửa đề đã duyệt": nháp mới thay bản đã duyệt (chép tên, nội dung, file). Đã có nháp đang mở thay bản này → trả nháp đó.
create or replace function english.eng_edit_studio_draft(p_draft uuid, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_d english.studio_drafts%rowtype;
  v_m english.members%rowtype;
  v_open uuid;
  v_id uuid;
begin
  if p_draft is null or p_by is null or p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) not between 8 and 100 then
    raise exception 'eng_edit_studio_draft: draft, actor and client_id are required' using errcode = '22004';
  end if;
  select * into v_d from english.studio_drafts d where d.id = p_draft for update;
  if not found then
    raise exception 'eng_edit_studio_draft: draft not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, v_d.learner_id) then
    raise exception 'eng_edit_studio_draft: this member may not edit tests of this learner' using errcode = '42501';
  end if;
  if v_d.status <> 'approved' then
    raise exception 'eng_edit_studio_draft: only an approved test is edited this way (not_approved)' using errcode = '23514';
  end if;
  select d.id into v_open from english.studio_drafts d where d.supersedes_draft_id = p_draft and d.status <> 'discarded';
  if v_open is not null then
    return pg_catalog.jsonb_build_object('id', v_open, 'replayed', true);
  end if;
  insert into english.studio_drafts(family_id, learner_id, track_id, title, test_file_id, key_file_id, status, payload, created_by_member, updated_by_member,
                                    supersedes_draft_id, client_id)
  values (v_d.family_id, v_d.learner_id, v_d.track_id, v_d.title, v_d.test_file_id, v_d.key_file_id, 'draft', v_d.payload, p_by, p_by, p_draft, p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- 3i. Lưu bản nháp (nội dung đã được zod kiểm ở máy chủ). Khóa lạc quan theo updated_at (dạng chữ, micro giây).
create or replace function english.eng_save_studio_draft(p_draft uuid, p_title text, p_payload jsonb, p_base text, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_d english.studio_drafts%rowtype;
  v_title text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  v_at timestamptz;
begin
  if p_draft is null or p_payload is null or p_base is null or p_by is null then
    raise exception 'eng_save_studio_draft: draft, payload, base and actor are required' using errcode = '22004';
  end if;
  select * into v_d from english.studio_drafts d where d.id = p_draft for update;
  if not found then
    raise exception 'eng_save_studio_draft: draft not found' using errcode = 'P0002';
  end if;
  if not english.eng_actor_may_manage(p_by, v_d.learner_id) then
    raise exception 'eng_save_studio_draft: this member may not edit tests of this learner' using errcode = '42501';
  end if;
  if v_d.status not in ('draft', 'ai_failed') then
    raise exception 'eng_save_studio_draft: this draft cannot be edited now (not_editable)' using errcode = '23514';
  end if;
  if v_d.updated_at::text <> p_base then
    raise exception 'eng_save_studio_draft: the draft changed in the meantime (draft_changed)' using errcode = '23505';
  end if;
  if pg_catalog.length(v_title) not between 1 and 160 then
    raise exception 'eng_save_studio_draft: a title of 1..160 characters is required (bad_title)' using errcode = '22023';
  end if;
  update english.studio_drafts set title = v_title, payload = p_payload, status = 'draft', error_code = null, updated_by_member = p_by
  where id = p_draft
  returning updated_at into v_at;
  return pg_catalog.jsonb_build_object('updated_at', v_at::text);
end
$$;

-- 3j. Kết thúc phần AI (máy chủ, chạy nền). Chỉ đổi bản nháp còn đang 'extracting' (đã bỏ / đã quá giờ thì không đè).
create or replace function english.eng_finish_studio_extraction(p_draft uuid, p_payload jsonb, p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n int;
begin
  update english.studio_drafts set payload = p_payload, status = 'draft', ai_run_id = p_run, error_code = null
  where id = p_draft and status = 'extracting';
  get diagnostics v_n = row_count;
  return pg_catalog.jsonb_build_object('applied', v_n = 1);
end
$$;

create or replace function english.eng_fail_studio_extraction(p_draft uuid, p_error text, p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n int;
begin
  if p_error is null or p_error !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'eng_fail_studio_extraction: error code required' using errcode = '22023';
  end if;
  update english.studio_drafts set status = 'ai_failed', error_code = p_error, ai_run_id = coalesce(p_run, ai_run_id)
  where id = p_draft and status = 'extracting';
  get diagnostics v_n = row_count;
  return pg_catalog.jsonb_build_object('applied', v_n = 1);
end
$$;

create or replace function english.eng_discard_studio_draft(p_draft uuid, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_d english.studio_drafts%rowtype;
begin
  select * into v_d from english.studio_drafts d where d.id = p_draft for update;
  if not found then
    raise exception 'eng_discard_studio_draft: draft not found' using errcode = 'P0002';
  end if;
  if not english.eng_actor_may_manage(p_by, v_d.learner_id) then
    raise exception 'eng_discard_studio_draft: this member may not change tests of this learner' using errcode = '42501';
  end if;
  if v_d.status in ('approved', 'discarded') then
    raise exception 'eng_discard_studio_draft: this draft is already final (not_editable)' using errcode = '23514';
  end if;
  update english.studio_drafts set status = 'discarded', updated_by_member = p_by where id = p_draft;
  return pg_catalog.jsonb_build_object('id', p_draft, 'status', 'discarded');
end
$$;

-- 3k. Duyệt: mẫu Studio (1 bước ACT-SOURCE-QA, PRACTICE) + bài đọc + khóa + nhãn câu + khung đề giấy, một transaction. Máy chủ dựng
-- p_build từ chính nội dung đã lưu (lib/studio/buildTemplate.ts) sau khi kiểm (validate.ts); ở đây kiểm hình, người thao tác, khóa lạc quan;
-- các trigger sẵn có của mẫu / khóa / khung đề kiểm phần còn lại (không đáp án trong bước, kỹ năng hợp lệ, đủ khóa, đủ câu 1..N, nhãn có thật).
create or replace function english.eng_approve_studio_draft(p_draft uuid, p_base text, p_build jsonb, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_d english.studio_drafts%rowtype;
  v_prev english.studio_drafts%rowtype;
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_cat text;
  v_tid text;
  v_ver int;
  v_prev_frame uuid;
  v_frame uuid;
  v_today date := english.eng_today_vn();
  v_items jsonb := p_build -> 'template' -> 'items';
  v_passages jsonb := coalesce(p_build -> 'passages', '[]'::jsonb);
  v_sources jsonb;
begin
  if p_draft is null or p_base is null or p_build is null or p_by is null then
    raise exception 'eng_approve_studio_draft: draft, base, build and actor are required' using errcode = '22004';
  end if;
  select * into v_d from english.studio_drafts d where d.id = p_draft for update;
  if not found then
    raise exception 'eng_approve_studio_draft: draft not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, v_d.learner_id) then
    raise exception 'eng_approve_studio_draft: this member may not approve tests of this learner' using errcode = '42501';
  end if;
  if v_d.status <> 'draft' then
    raise exception 'eng_approve_studio_draft: only a saved draft can be approved (not_draft)' using errcode = '23514';
  end if;
  if v_d.updated_at::text <> p_base then
    raise exception 'eng_approve_studio_draft: the draft changed in the meantime (draft_changed)' using errcode = '23505';
  end if;
  -- Hình của p_build (máy chủ dựng; đây là lưới an toàn).
  if pg_catalog.jsonb_typeof(v_items) is distinct from 'array' or pg_catalog.jsonb_array_length(v_items) = 0 then
    raise exception 'eng_approve_studio_draft: no item can be done in the app (no_app_items)' using errcode = '23514';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(v_items) x where coalesce(x ->> 'id', '') !~ '^q[1-9][0-9]{0,2}$')
     or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p_build -> 'keys')) <> pg_catalog.jsonb_array_length(v_items)
     or exists (select 1 from pg_catalog.jsonb_array_elements(v_items) x
                where (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p_build -> 'keys') k where k ->> 'item_id' = x ->> 'id') <> 1)
     or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(p_build -> 'meta')) <> (p_build -> 'frame' ->> 'total')::int
     or exists (select 1 from pg_catalog.jsonb_array_elements(v_passages) p where coalesce(p ->> 'ref', '') !~ '^[A-Za-z0-9]{1,10}$') then
    raise exception 'eng_approve_studio_draft: the build does not match its own items (bad_build)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = v_d.learner_id;
  select d.catalogue_version into v_cat
  from english.target_sets ts join english.target_set_definitions d on d.id = ts.definition_id
  where ts.learner_id = v_l.id and ts.effective_from <= pg_catalog.clock_timestamp()
  order by ts.effective_from desc, ts.seq desc limit 1;
  if v_cat is null then
    raise exception 'eng_approve_studio_draft: the learner has no skill set yet (no_target_set)' using errcode = '23514';
  end if;
  if v_d.supersedes_draft_id is not null then
    select * into v_prev from english.studio_drafts d where d.id = v_d.supersedes_draft_id;
    v_tid := v_prev.template_id;
    v_prev_frame := v_prev.frame_id;
    select max(t.version) + 1 into v_ver from english.inquiry_templates t where t.id = v_tid;
  else
    v_tid := v_l.track_id || '-ST-' || pg_catalog.lpad(pg_catalog.nextval('english.studio_template_seq')::text, 6, '0');
    v_ver := 1;
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id', 'ST-' || v_tid || '-' || (p ->> 'ref'), 'version', v_ver, 'title', p ->> 'title', 'modality', 'text', 'url', null) order by o), '[]'::jsonb)
  into v_sources
  from pg_catalog.jsonb_array_elements(v_passages) with ordinality as x(p, o);

  insert into english.sources(id, version, title, url, author, rights_note, modality, body, source_hash, published_at)
  select 'ST-' || v_tid || '-' || (p ->> 'ref'), v_ver, p ->> 'title', null, 'Thầy/cô', 'Tài liệu của thầy/cô, chỉ dùng trong gia đình', 'text', p ->> 'text',
         pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p ->> 'text', 'UTF8')), 'hex'), pg_catalog.clock_timestamp()
  from pg_catalog.jsonb_array_elements(v_passages) as p;

  insert into english.inquiry_templates(id, version, track_id, title_vi, big_question_en, big_question_vi, week, date_from, date_to, domain_bucket,
                                        target_ids, steps, sources, catalogue_version, status, source_hash, kind, family_id, learner_id)
  values (v_tid, v_ver, v_l.track_id, v_d.title, v_d.title, v_d.title, 0, v_today, v_today, 'studio',
          array(select pg_catalog.jsonb_array_elements_text(coalesce(p_build -> 'template' -> 'target_ids', '[]'::jsonb))),
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'step_no', 1, 'activity_type', 'ACT-SOURCE-QA', 'mode', 'PRACTICE', 'purpose', '[]'::jsonb,
            'target_ids', coalesce(p_build -> 'template' -> 'target_ids', '[]'::jsonb),
            'prompt_en', p_build -> 'template' ->> 'prompt_en',
            'time_min', (p_build -> 'template' ->> 'time_min')::int,
            'planned_date', v_today,
            'self_check_vi', '[]'::jsonb,
            'items', v_items)),
          v_sources, v_cat, 'draft',
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_build::text, 'UTF8')), 'hex'),
          'studio', v_l.family_id, v_l.id);

  insert into english.template_step_sources(template_id, template_version, step_no, source_id, source_version, position)
  select v_tid, v_ver, 1, 'ST-' || v_tid || '-' || (p ->> 'ref'), v_ver, o::int
  from pg_catalog.jsonb_array_elements(v_passages) with ordinality as x(p, o);

  insert into english.template_item_keys(template_id, template_version, item_id, step_no, kind, answer, explanation_vi)
  select v_tid, v_ver, k ->> 'item_id', 1, k ->> 'kind', nullif(pg_catalog.btrim(coalesce(k ->> 'answer', '')), ''), nullif(pg_catalog.btrim(coalesce(k ->> 'explanation_vi', '')), '')
  from pg_catalog.jsonb_array_elements(p_build -> 'keys') as k;

  update english.inquiry_templates set status = 'published', published_at = pg_catalog.clock_timestamp()
  where id = v_tid and version = v_ver;

  insert into english.studio_item_meta(template_id, template_version, item_id, learner_id, n, part, tag_key, reading_skill_key, out_of_app)
  select v_tid, v_ver, 'q' || (x ->> 'n'), v_l.id, (x ->> 'n')::int, x ->> 'part', x ->> 'tag_key', x ->> 'reading_skill_key', (x ->> 'out_of_app')::boolean
  from pg_catalog.jsonb_array_elements(p_build -> 'meta') as x;

  insert into english.test_frames(family_id, track_id, title, total_items, parts, items, scale, supersedes_id, created_by)
  values (v_l.family_id, v_l.track_id, pg_catalog.left(v_d.title, 160) || ' (' || v_tid || ')', (p_build -> 'frame' ->> 'total')::int,
          p_build -> 'frame' -> 'parts', p_build -> 'frame' -> 'items', null,
          case when v_prev_frame is not null and not exists (select 1 from english.test_frames f where f.supersedes_id = v_prev_frame)
               then v_prev_frame else null end,
          p_by)
  returning id into v_frame;

  update english.studio_drafts
  set status = 'approved', approved_by_member = p_by, approved_at = pg_catalog.clock_timestamp(), template_id = v_tid, template_version = v_ver,
      frame_id = v_frame, updated_by_member = p_by
  where id = p_draft;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'studio.approved', v_l.family_id, v_l.id,
          pg_catalog.jsonb_build_object('draft', p_draft, 'template', v_tid, 'version', v_ver, 'frame', v_frame));
  return pg_catalog.jsonb_build_object('template_id', v_tid, 'version', v_ver, 'frame_id', v_frame);
end
$$;

-- 3l. Giao đề đã duyệt (P10): giao với hạn nộp, rồi dời bước tới ngày làm (nếu khác) — sự kiện có lý do, chỉ người lớn thấy.
create or replace function english.eng_assign_studio(p_draft uuid, p_start date, p_due date, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_d english.studio_drafts%rowtype;
  v_replay boolean;
  v_inst uuid;
  v_act uuid;
begin
  if p_draft is null or p_start is null or p_due is null or p_by is null or p_client_id is null then
    raise exception 'eng_assign_studio: draft, dates, actor and client_id are required' using errcode = '22004';
  end if;
  select * into v_d from english.studio_drafts d where d.id = p_draft;
  if not found then
    raise exception 'eng_assign_studio: draft not found' using errcode = 'P0002';
  end if;
  if not english.eng_actor_may_manage(p_by, v_d.learner_id) then
    raise exception 'eng_assign_studio: this member may not assign work to this learner' using errcode = '42501';
  end if;
  if v_d.status <> 'approved' then
    raise exception 'eng_assign_studio: approve the test first (not_approved)' using errcode = '23514';
  end if;
  if p_start > p_due then
    raise exception 'eng_assign_studio: the start day is after the due day (start_after_due)' using errcode = '23514';
  end if;
  v_replay := exists (select 1 from english.inquiry_instances i where i.learner_id = v_d.learner_id and i.client_request_id = p_client_id);
  v_inst := english.eng_assign_inquiry(v_d.learner_id, v_d.template_id, v_d.template_version, p_due, p_by, p_client_id);
  select a.id into v_act from english.activity_instances a where a.inquiry_instance_id = v_inst and a.step_no = 1;
  if not v_replay and p_start <> p_due then
    perform english.eng_activity_event(v_act, 'reschedule', p_start, 'Studio: ngày làm do người giao chọn', p_by);
  end if;
  return pg_catalog.jsonb_build_object('instance_id', v_inst, 'activity_id', v_act, 'replayed', v_replay);
end
$$;

-- 3m. Đọc bản nháp / danh sách (service_role sau requireAccess). updated_at trả dạng chữ (dùng lại làm khóa lạc quan).
create or replace function english.eng_studio_draft(p_draft uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', d.id, 'learner_id', d.learner_id, 'family_id', d.family_id, 'track_id', d.track_id, 'title', d.title, 'status', d.status,
    'error_code', d.error_code, 'payload', d.payload, 'updated_at', d.updated_at::text, 'created_at', d.created_at,
    -- AI đang đọc mà không đổi gì quá 6 phút = coi như hỏng (máy chủ đánh dấu 'timeout' khi đọc, §10 mục 4).
    'stale', d.status = 'extracting' and d.updated_at < pg_catalog.clock_timestamp() - interval '6 minutes',
    'approved_at', d.approved_at, 'approved_by_member', d.approved_by_member, 'template_id', d.template_id, 'template_version', d.template_version,
    'frame_id', d.frame_id, 'supersedes_draft_id', d.supersedes_draft_id,
    'superseded_by', (select n.id from english.studio_drafts n where n.supersedes_draft_id = d.id and n.status <> 'discarded'),
    'test_file', (select pg_catalog.jsonb_build_object('id', f.id, 'mime', f.mime, 'path', f.path) from english.files f where f.id = d.test_file_id),
    'key_file', (select pg_catalog.jsonb_build_object('id', f.id, 'mime', f.mime, 'path', f.path) from english.files f where f.id = d.key_file_id),
    'ai_cost_usd', (select coalesce(sum(r.cost_usd), 0) from english.ai_runs r where r.draft_id = d.id),
    'assigned', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'instance_id', i.id, 'activity_id', a.id, 'due_on', i.due_on, 'start_on', english.eng_step_effective_date(a.id), 'assigned_at', i.assigned_at)
             order by i.assigned_at)
      from english.inquiry_instances i
      join english.activity_instances a on a.inquiry_instance_id = i.id and a.step_no = 1
      where i.template_id = d.template_id and i.template_version = d.template_version), '[]'::jsonb))
  from english.studio_drafts d where d.id = p_draft
$$;

create or replace function english.eng_studio_drafts(p_learner uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id', d.id, 'title', d.title, 'status', d.status, 'updated_at', d.updated_at, 'template_id', d.template_id,
           'template_version', d.template_version, 'superseded', exists (select 1 from english.studio_drafts n where n.supersedes_draft_id = d.id and n.status = 'approved'),
           'assigned', (select pg_catalog.count(*) from english.inquiry_instances i where i.template_id = d.template_id and i.template_version = d.template_version))
         order by d.updated_at desc), '[]'::jsonb)
  from (select * from english.studio_drafts x where x.learner_id = p_learner and x.status <> 'discarded' order by x.updated_at desc limit 30) d
$$;

revoke execute on function english.eng_ai_gate(uuid, numeric, boolean, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function english.eng_ai_settings(uuid) from public, anon, authenticated;
revoke execute on function english.eng_set_ai_settings(boolean, text, uuid) from public, anon, authenticated;
revoke execute on function english.eng_log_ai_run(uuid, uuid, text, text, int, int, numeric, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function english.eng_studio_skills(uuid) from public, anon, authenticated;
revoke execute on function english.eng_create_studio_draft(uuid, text, jsonb, jsonb, boolean, uuid, text) from public, anon, authenticated;
revoke execute on function english.eng_edit_studio_draft(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function english.eng_save_studio_draft(uuid, text, jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function english.eng_finish_studio_extraction(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function english.eng_fail_studio_extraction(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function english.eng_discard_studio_draft(uuid, uuid) from public, anon, authenticated;
revoke execute on function english.eng_approve_studio_draft(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function english.eng_assign_studio(uuid, date, date, uuid, text) from public, anon, authenticated;
revoke execute on function english.eng_studio_draft(uuid) from public, anon, authenticated;
revoke execute on function english.eng_studio_drafts(uuid) from public, anon, authenticated;
grant execute on function english.eng_ai_gate(uuid, numeric, boolean, uuid, text, uuid) to service_role;
grant execute on function english.eng_ai_settings(uuid) to service_role;
grant execute on function english.eng_set_ai_settings(boolean, text, uuid) to service_role;
grant execute on function english.eng_log_ai_run(uuid, uuid, text, text, int, int, numeric, text, text, uuid, uuid) to service_role;
grant execute on function english.eng_studio_skills(uuid) to service_role;
grant execute on function english.eng_create_studio_draft(uuid, text, jsonb, jsonb, boolean, uuid, text) to service_role;
grant execute on function english.eng_edit_studio_draft(uuid, uuid, text) to service_role;
grant execute on function english.eng_save_studio_draft(uuid, text, jsonb, text, uuid) to service_role;
grant execute on function english.eng_finish_studio_extraction(uuid, jsonb, uuid) to service_role;
grant execute on function english.eng_fail_studio_extraction(uuid, text, uuid) to service_role;
grant execute on function english.eng_discard_studio_draft(uuid, uuid) to service_role;
grant execute on function english.eng_approve_studio_draft(uuid, text, jsonb, uuid) to service_role;
grant execute on function english.eng_assign_studio(uuid, date, date, uuid, text) to service_role;
grant execute on function english.eng_studio_draft(uuid) to service_role;
grant execute on function english.eng_studio_drafts(uuid) to service_role;

-- 4. Kết quả, Đúng/Sai, Hộp duyệt, phần con xem lại ------------------------------------------------------------------------------

-- 4a. Kết quả bài + dấu nhãn của MỘT lần làm bài Studio, khi mọi câu đã có đúng / sai / bỏ trống (câu chờ đã được người lớn xử).
-- Nguồn 'practice' (Studio · Luyện), khung đề của mẫu, lần đầu (episode.is_first_attempt) → dấu nhãn counts = true, làm lại → false.
-- Câu chỉ làm trên giấy: not_in_app_items (không đúng, không sai). Người ghi (P5): người Đúng/Sai cuối cùng, không có thì người Duyệt đề.
-- Gọi lại = trả kết quả đã có (một kết quả mỗi lần làm). Nội bộ.
create or replace function english.eng_record_studio_result(p_attempt uuid, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_t english.attempts%rowtype;
  v_i english.inquiry_instances%rowtype;
  v_tpl english.inquiry_templates%rowtype;
  v_d english.studio_drafts%rowtype;
  v_f english.test_frames%rowtype;
  v_existing english.results%rowtype;
  v_checks jsonb;
  v_first boolean;
  v_pending int;
  v_wrong int[];
  v_skip int[];
  v_tags jsonb;
  v_by uuid;
  v_role text;
  v_on date;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_correct int;
begin
  select * into v_t from english.attempts t where t.id = p_attempt for update;
  if not found then
    return pg_catalog.jsonb_build_object('recorded', false, 'reason', 'not_found');
  end if;
  select * into v_existing from english.results r where r.attempt_id = p_attempt;
  if found then
    return pg_catalog.jsonb_build_object('recorded', true, 'replayed', true, 'result_id', v_existing.id, 'correct', v_existing.correct,
      'in_app', v_existing.total_items - cardinality(v_existing.not_in_app_items), 'tags', pg_catalog.jsonb_array_length(v_existing.item_tags));
  end if;
  select i.* into v_i from english.activity_instances a join english.inquiry_instances i on i.id = a.inquiry_instance_id where a.id = v_t.activity_instance_id;
  select * into v_tpl from english.inquiry_templates t where t.id = v_i.template_id and t.version = v_i.template_version;
  if v_tpl.kind is distinct from 'studio' then
    return pg_catalog.jsonb_build_object('recorded', false, 'reason', 'not_studio');
  end if;
  select c.checks into v_checks from english.attempt_auto_checks c where c.attempt_id = p_attempt;
  select e.is_first_attempt into v_first from english.episodes e where e.attempt_id = p_attempt;
  if v_checks is null or v_first is null then
    return pg_catalog.jsonb_build_object('recorded', false, 'reason', 'not_ready');
  end if;
  select pg_catalog.count(*)::int into v_pending
  from pg_catalog.jsonb_each(v_checks -> 'items') as e(k, v)
  where e.v ->> 'result' = 'needs_person'
    and not exists (select 1 from english.item_decisions d where d.attempt_id = p_attempt and d.item_id = e.k);
  if v_pending > 0 then
    return pg_catalog.jsonb_build_object('recorded', false, 'reason', 'pending', 'pending', v_pending);
  end if;
  select * into v_d from english.studio_drafts d where d.template_id = v_tpl.id and d.template_version = v_tpl.version and d.status = 'approved';
  select * into v_f from english.test_frames f where f.id = v_d.frame_id;
  if v_f.id is null then
    raise exception 'eng_record_studio_result: the test has no paper frame' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(m.n order by m.n), '{}') into v_wrong
  from english.studio_item_meta m
  cross join lateral (
    select case
             when v_checks -> 'items' -> m.item_id ->> 'result' = 'needs_person'
               then (select d.result from english.item_decisions d where d.attempt_id = p_attempt and d.item_id = m.item_id)
             else v_checks -> 'items' -> m.item_id ->> 'result'
           end as res) r
  where m.template_id = v_tpl.id and m.template_version = v_tpl.version and not m.out_of_app and r.res in ('incorrect', 'blank');
  select coalesce(array_agg(m.n order by m.n), '{}') into v_skip
  from english.studio_item_meta m
  where m.template_id = v_tpl.id and m.template_version = v_tpl.version and m.out_of_app;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', m.n, 'tag_key', coalesce(m.tag_key, m.reading_skill_key)) order by m.n), '[]'::jsonb)
  into v_tags
  from english.studio_item_meta m
  where m.template_id = v_tpl.id and m.template_version = v_tpl.version and m.n = any (v_wrong);

  v_by := coalesce(p_by,
                   (select d.by_member from english.item_decisions d where d.attempt_id = p_attempt order by d.at desc, d.id desc limit 1),
                   v_d.approved_by_member);
  select m.role into v_role from english.members m where m.id = v_by;
  if v_role is null or v_role not in ('tutor', 'parent') then
    v_by := v_d.approved_by_member;
    select m.role into v_role from english.members m where m.id = v_by;
  end if;
  if v_role is null or v_role not in ('tutor', 'parent') then
    raise exception 'eng_record_studio_result: no adult to record the result' using errcode = '23514';
  end if;
  v_on := (v_t.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date;
  v_correct := v_f.total_items - cardinality(v_wrong) - cardinality(v_skip);

  insert into english.results(
    id, learner_id, assignment_id, frame_id, mode, context, attempt, source, used_hint, title, total_items, correct, wrong_items, not_in_app_items,
    item_tags, taken_on, recorded_by_member, recorded_role, supersedes_id, client_id, attempt_id)
  values (v_id, v_t.learner_id, null, v_f.id, 'frame', 'home', case when v_first then 'first' else 'retry' end, 'practice', false, v_f.title,
          v_f.total_items, v_correct, v_wrong, v_skip, v_tags, v_on, v_by, v_role, null, 'studio:' || p_attempt::text, p_attempt);

  insert into english.tag_marks(learner_id, tag_key, source, source_id, item_no, counts, marked_on, recorded_by_member)
  select v_t.learner_id, x ->> 'tag_key', 'practice', v_id, (x ->> 'n')::int, v_first, v_on, v_by
  from pg_catalog.jsonb_array_elements(v_tags) as x;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (null, 'system', 'studio.result_recorded', v_tpl.family_id, v_t.learner_id,
          pg_catalog.jsonb_build_object('result', v_id, 'attempt', p_attempt, 'first', v_first));

  return pg_catalog.jsonb_build_object('recorded', true, 'replayed', false, 'result_id', v_id, 'correct', v_correct,
    'in_app', v_f.total_items - cardinality(v_skip), 'tags', pg_catalog.jsonb_array_length(v_tags));
end
$$;
revoke execute on function english.eng_record_studio_result(uuid, uuid) from public, anon, authenticated, service_role;

-- 4b. Nộp bài Studio không còn câu chờ → ghi kết quả ngay. Chạy sau khi episode được ghi (dòng cuối của eng_submit_attempt, sau phần tự chấm).
-- KHÔNG BAO GIỜ làm hỏng lần nộp của con: lỗi ghi vào app_errors; eng_decide_studio_items gọi lại cùng hàm (idempotent).
create or replace function english.eng_studio_after_episode() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from english.attempt_auto_checks c where c.attempt_id = new.attempt_id) then
    begin
      perform english.eng_record_studio_result(new.attempt_id, null);
    exception when others then
      insert into english.app_errors(route, code, message, details)
      values ('db:episodes', 'studio_result', pg_catalog.left(sqlstate || ': ' || sqlerrm, 300), pg_catalog.jsonb_build_object('attempt', new.attempt_id));
    end;
  end if;
  return null;
end
$$;
revoke execute on function english.eng_studio_after_episode() from public, anon, authenticated, service_role;
drop trigger if exists episodes_studio_result on english.episodes;
create trigger episodes_studio_result
  after insert on english.episodes
  for each row execute function english.eng_studio_after_episode();

-- 4c. "Cần thầy/cô xem": Đúng / Sai cho câu chờ của một lần làm (gia sư hoặc phụ huynh của em — bài Luyện, D15). Một lần mỗi câu;
-- gửi lại cùng kết quả = bỏ qua. "Đúng" cho transform / short → đáp án chấp nhận của mẫu (lần làm SAU tự chấm đúng; bài này không chấm lại).
-- Hết câu chờ → Kết quả bài + dấu nhãn. Engine chạy lại ở máy chủ (hook S7a) sau khi hàm này trả về.
create or replace function english.eng_decide_studio_items(p_attempt uuid, p_items jsonb, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_t english.attempts%rowtype;
  v_m english.members%rowtype;
  v_i english.inquiry_instances%rowtype;
  v_tpl english.inquiry_templates%rowtype;
  v_checks jsonb;
  v_step jsonb;
  v_answers jsonb;
  v_x jsonb;
  v_item text;
  v_res text;
  v_prev text;
  v_kind text;
  v_given text;
  v_n int := 0;
  v_pending int;
  v_out jsonb;
begin
  if p_attempt is null or p_items is null or p_by is null then
    raise exception 'eng_decide_studio_items: attempt, items and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) not between 8 and 100 then
    raise exception 'eng_decide_studio_items: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_items) is distinct from 'array' or pg_catalog.jsonb_array_length(p_items) not between 1 and 300 then
    raise exception 'eng_decide_studio_items: items must be a list of 1..300 verdicts (bad_items)' using errcode = '22023';
  end if;
  if (select pg_catalog.count(distinct x ->> 'item_id') from pg_catalog.jsonb_array_elements(p_items) x) <> pg_catalog.jsonb_array_length(p_items) then
    raise exception 'eng_decide_studio_items: an item appears twice (duplicate_item)' using errcode = '22023';
  end if;
  select * into v_t from english.attempts t where t.id = p_attempt for update;
  if not found then
    raise exception 'eng_decide_studio_items: attempt not found' using errcode = 'P0002';
  end if;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, v_t.learner_id) then
    raise exception 'eng_decide_studio_items: this member may not check work of this learner' using errcode = '42501';
  end if;
  select i.* into v_i from english.activity_instances a join english.inquiry_instances i on i.id = a.inquiry_instance_id where a.id = v_t.activity_instance_id;
  select * into v_tpl from english.inquiry_templates t where t.id = v_i.template_id and t.version = v_i.template_version;
  if v_tpl.kind is distinct from 'studio' then
    raise exception 'eng_decide_studio_items: this is not a Studio test (not_studio)' using errcode = '23514';
  end if;
  select c.checks into v_checks from english.attempt_auto_checks c where c.attempt_id = p_attempt;
  select x into v_step from pg_catalog.jsonb_array_elements(v_i.snapshot -> 'steps') as x
  where (x ->> 'step_no')::int = (select a.step_no from english.activity_instances a where a.id = v_t.activity_instance_id);
  select av.content -> 'answers' into v_answers from english.artifact_versions av
  where av.attempt_id = p_attempt and av.kind = 'answers' order by av.version desc limit 1;

  for v_x in select x from pg_catalog.jsonb_array_elements(p_items) as x loop
    v_item := v_x ->> 'item_id';
    v_res := v_x ->> 'result';
    if v_item is null or v_res is null or v_res not in ('correct', 'incorrect') then
      raise exception 'eng_decide_studio_items: each verdict is {item_id, result: correct|incorrect} (bad_items)' using errcode = '22023';
    end if;
    if (v_checks -> 'items' -> v_item ->> 'result') is distinct from 'needs_person' then
      raise exception 'eng_decide_studio_items: item % is not waiting for a person (not_pending_item)', v_item using errcode = '23514';
    end if;
    select d.result into v_prev from english.item_decisions d where d.attempt_id = p_attempt and d.item_id = v_item;
    if v_prev is not null then
      if v_prev <> v_res then
        raise exception 'eng_decide_studio_items: item % already has another verdict (already_decided)', v_item using errcode = '23505';
      end if;
      continue;
    end if;
    insert into english.item_decisions(attempt_id, learner_id, item_id, result, by_member, by_role, client_id)
    values (p_attempt, v_t.learner_id, v_item, v_res, p_by, v_m.role, p_client_id);
    v_n := v_n + 1;
    if v_res = 'correct' then
      select it ->> 'kind' into v_kind from pg_catalog.jsonb_array_elements(coalesce(v_step -> 'items', '[]'::jsonb)) as it where it ->> 'id' = v_item;
      v_given := english.eng_clean_text(coalesce(v_answers ->> v_item, ''));
      if v_kind in ('transform', 'short') and v_given <> '' and pg_catalog.length(v_given) <= 2000 then
        insert into english.accepted_additions(template_id, template_version, item_id, learner_id, answer, by_member, from_attempt_id)
        values (v_tpl.id, v_tpl.version, v_item, v_t.learner_id, v_given, p_by, p_attempt)
        on conflict do nothing;
      end if;
    end if;
  end loop;

  if v_n > 0 then
    insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
    values (v_m.user_id, v_m.role, 'studio.items_decided', v_tpl.family_id, v_t.learner_id,
            pg_catalog.jsonb_build_object('attempt', p_attempt, 'count', v_n));
  end if;
  v_out := english.eng_record_studio_result(p_attempt, p_by);
  select pg_catalog.count(*)::int into v_pending
  from pg_catalog.jsonb_each(v_checks -> 'items') as e(k, v)
  where e.v ->> 'result' = 'needs_person'
    and not exists (select 1 from english.item_decisions d where d.attempt_id = p_attempt and d.item_id = e.k);
  return pg_catalog.jsonb_build_object('decided', v_n, 'pending', v_pending, 'result', v_out);
end
$$;
revoke execute on function english.eng_decide_studio_items(uuid, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_decide_studio_items(uuid, jsonb, uuid, text) to service_role;

-- 4d. Hộp duyệt → "Cần thầy/cô xem": mọi lần làm bài Studio còn câu chờ của các em mà người này quản lý (gia sư của em / phụ huynh).
-- Mỗi câu: số câu, đề, đáp án (phần trước " / " đầu tiên), các đáp án chấp nhận (phần còn lại + accepted_additions), câu em viết.
create or replace function english.eng_studio_pending(p_by uuid, p_allow_real boolean default false) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with ls as (
    select l.id, l.alias, l.is_test
    from english.learners l
    join english.members m on m.id = p_by and m.role in ('tutor', 'parent')
    where english.eng_actor_may_manage(p_by, l.id) and (l.is_test or p_allow_real)
  ),
  att as (
    select t.id as attempt_id, t.learner_id, t.activity_instance_id, t.submitted_at, t.attempt_no,
           i.id as instance_id, i.template_id, i.template_version, i.snapshot, a.step_no, c.checks, ls.alias, ls.is_test,
           (select av.content -> 'answers' from english.artifact_versions av
            where av.attempt_id = t.id and av.kind = 'answers' order by av.version desc limit 1) as answers
    from english.attempts t
    join ls on ls.id = t.learner_id
    join english.activity_instances a on a.id = t.activity_instance_id
    join english.inquiry_instances i on i.id = a.inquiry_instance_id
    join english.inquiry_templates tp on tp.id = i.template_id and tp.version = i.template_version and tp.kind = 'studio'
    join english.attempt_auto_checks c on c.attempt_id = t.id
  ),
  waiting as (
    select att.attempt_id, q.x, q.o
    from att
    cross join lateral (
      select st.s from pg_catalog.jsonb_array_elements(att.snapshot -> 'steps') as st(s) where (st.s ->> 'step_no')::int = att.step_no
    ) step
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(step.s -> 'items', '[]'::jsonb)) with ordinality as q(x, o)
    where att.checks -> 'items' -> (q.x ->> 'id') ->> 'result' = 'needs_person'
      and not exists (select 1 from english.item_decisions d where d.attempt_id = att.attempt_id and d.item_id = q.x ->> 'id')
  )
  select pg_catalog.jsonb_build_object(
    'count', (select pg_catalog.count(*) from waiting),
    'items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'attempt_id', att.attempt_id, 'learner_id', att.learner_id, 'alias', att.alias, 'is_test', att.is_test,
      'activity_id', att.activity_instance_id, 'title', att.snapshot -> 'template' ->> 'title_vi',
      'submitted_at', att.submitted_at, 'attempt_no', att.attempt_no,
      'waiting_days', english.eng_today_vn() - (att.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date,
      'items', (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                 'item_id', w.x ->> 'id', 'n', substring(w.x ->> 'id' from 2)::int, 'kind', w.x ->> 'kind', 'stem', w.x ->> 'stem',
                 'expected', nullif(pg_catalog.split_part(english.eng_clean_text(coalesce(k.answer, '')), ' / ', 1), ''),
                 'accepted',
                   (select coalesce(pg_catalog.jsonb_agg(p.alt order by p.ord), '[]'::jsonb)
                    from pg_catalog.regexp_split_to_table(english.eng_clean_text(coalesce(k.answer, '')), ' / ') with ordinality as p(alt, ord)
                    where p.ord > 1)
                   || (select coalesce(pg_catalog.jsonb_agg(aa.answer order by aa.at), '[]'::jsonb)
                       from english.accepted_additions aa
                       where aa.template_id = att.template_id and aa.template_version = att.template_version and aa.item_id = w.x ->> 'id'),
                 'given', coalesce(att.answers ->> (w.x ->> 'id'), ''))
               order by w.o)
        from waiting w
        left join english.instance_item_keys k on k.inquiry_instance_id = att.instance_id and k.item_id = w.x ->> 'id'
        where w.attempt_id = att.attempt_id))
      order by att.submitted_at, att.attempt_id), '[]'::jsonb))
  from att
  where exists (select 1 from waiting w where w.attempt_id = att.attempt_id)
$$;
revoke execute on function english.eng_studio_pending(uuid, boolean) from public, anon, authenticated;
grant execute on function english.eng_studio_pending(uuid, boolean) to service_role;

-- 4e. Con xem lại bài Studio vừa nộp (màn 20): chỉ CÂU SAI (tự chấm sai / bỏ trống / người lớn chấm Sai) của lần nộp gần nhất — đề, câu em
-- viết, đáp án đúng (phần trước " / " đầu tiên; trắc nghiệm = chữ của lựa chọn), giải thích — và số in trên đề của câu còn chờ.
-- KHÔNG có số câu đúng, tổng câu, tỉ lệ, nhãn, kỹ năng. Bài chủ đề tuần / chưa nộp: {}. Không phải bài của người gọi / chưa mở: null.
create or replace function english.eng_my_studio_review(p_activity uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_act english.activity_instances%rowtype;
  v_inst english.inquiry_instances%rowtype;
  v_kind text;
  v_t english.attempts%rowtype;
  v_checks jsonb;
  v_answers jsonb;
  v_step jsonb;
begin
  select m.id into v_member from english.members m where m.user_id = auth.uid() and m.role = 'student';
  if v_member is null then return null; end if;
  select a.* into v_act
  from english.activity_instances a
  join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member;
  if not found or not english.eng_activity_released(p_activity) then return null; end if;
  select * into v_inst from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  select t.kind into v_kind from english.inquiry_templates t where t.id = v_inst.template_id and t.version = v_inst.template_version;
  if v_kind is distinct from 'studio' then return '{}'::jsonb; end if;
  select t.* into v_t from english.attempts t where t.activity_instance_id = p_activity order by t.attempt_no desc limit 1;
  if not found then return '{}'::jsonb; end if;
  select c.checks into v_checks from english.attempt_auto_checks c where c.attempt_id = v_t.id;
  if v_checks is null then return '{}'::jsonb; end if;
  select av.content -> 'answers' into v_answers from english.artifact_versions av
  where av.attempt_id = v_t.id and av.kind = 'answers' order by av.version desc limit 1;
  select x into v_step from pg_catalog.jsonb_array_elements(v_inst.snapshot -> 'steps') as x where (x ->> 'step_no')::int = v_act.step_no;

  return pg_catalog.jsonb_build_object(
    'attempt_no', v_t.attempt_no,
    'submitted_at', v_t.submitted_at,
    'wrong', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'n', substring(it ->> 'id' from 2)::int,
               'stem', it ->> 'stem',
               'given', coalesce(v_answers ->> (it ->> 'id'), ''),
               'expected', case
                 when it ->> 'kind' = 'mcq' then (
                   select o.opt from pg_catalog.jsonb_array_elements_text(coalesce(it -> 'options', '[]'::jsonb)) with ordinality as o(opt, ord)
                   where o.ord - 1 = english.eng_resolve_option(coalesce(it -> 'options', '[]'::jsonb), k.answer))
                 else nullif(pg_catalog.split_part(english.eng_clean_text(coalesce(k.answer, '')), ' / ', 1), '') end,
               'explanation_vi', k.explanation_vi)
             order by substring(it ->> 'id' from 2)::int)
      from pg_catalog.jsonb_array_elements(coalesce(v_step -> 'items', '[]'::jsonb)) as it
      left join english.instance_item_keys k on k.inquiry_instance_id = v_inst.id and k.item_id = it ->> 'id'
      cross join lateral (
        select case
                 when v_checks -> 'items' -> (it ->> 'id') ->> 'result' = 'needs_person'
                   then (select d.result from english.item_decisions d where d.attempt_id = v_t.id and d.item_id = it ->> 'id')
                 else v_checks -> 'items' -> (it ->> 'id') ->> 'result'
               end as res) r
      where r.res in ('incorrect', 'blank')), '[]'::jsonb),
    'pending', coalesce((
      select pg_catalog.jsonb_agg(substring(e.k from 2)::int order by substring(e.k from 2)::int)
      from pg_catalog.jsonb_each(v_checks -> 'items') as e(k, v)
      where e.v ->> 'result' = 'needs_person'
        and not exists (select 1 from english.item_decisions d where d.attempt_id = v_t.id and d.item_id = e.k)), '[]'::jsonb));
end
$$;
revoke execute on function english.eng_my_studio_review(uuid) from public, anon, service_role;
grant execute on function english.eng_my_studio_review(uuid) to authenticated;

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
