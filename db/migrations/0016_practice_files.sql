-- 0016_practice_files.sql
-- S5b-1 (PR B, bước 6): giao bài luyện (link hoặc đề PDF), em gửi ảnh kết quả / bài làm, kho file riêng tư "english-work"
-- (docs/plans/s5b1-tutor-work.md).
--
-- KHO FILE (Supabase Storage) - cái duy nhất migration này tạo trong schema `storage`:
--   * MỘT bucket tên `english-work`: riêng tư (public = false), tối đa 15 MB mỗi file, chỉ pdf / png / jpeg / webp.
--   * KHÔNG tạo policy nào trên storage.objects: không tài khoản nào (kể cả đã đăng nhập) đọc hay ghi trực tiếp được.
--     Máy chủ của app kiểm quyền ở phía english TRƯỚC, rồi mới dùng service role (chỉ ở máy chủ) để cấp
--     (a) link TẢI LÊN dùng một lần cho đúng một đường dẫn, (b) link TẢI XUỐNG sống 300 giây.
--   * Chỉ tạo khi schema/bảng storage có sẵn (CI chỉ có Postgres trơn thì bỏ qua). Không đụng bucket nào khác, không đụng schema public.
--   * Đường dẫn: {family_id}/{learner_id | shared}/{file_id}.{pdf|png|jpg|webp}, do CHECK của bảng files ép đúng dạng này.
--   * File tải lên KHÔNG nằm trong bản sao lưu hằng tuần (pg_dump chỉ lấy bảng; quyết định của phụ huynh 17/10/2026).
--
-- Quy tắc (ép trong DB):
--  1. Học sinh KHÔNG đọc trực tiếp bảng nào ở đây (RLS chỉ cho phụ huynh / gia sư trong phạm vi). Em chỉ gọi eng_my_practice(),
--     eng_my_practice_file(), eng_my_review_points(): không có điểm, số câu sai, nhãn hay khung đề.
--  2. Chỉ link https; nguồn (test-english / NotebookLM / Gemini / khác) do DB tự nhận ra từ tên miền.
--  3. Một bài nộp = link và/hoặc 1-6 file của CHÍNH em đó; file không dùng lại cho bài nộp khác. Nộp lại = dòng mới thay dòng cũ.
--  4. Bài đã rút (assignment_events) không hiện cho em và không nộp được.
--  5. Gia sư / phụ huynh có thể "nộp thay" cho em (ghi rõ vai người nộp).
--  6. Ghi chỉ qua hàm security definer (service_role sau requireAccess; hàm kiểm lại người thao tác). Mọi bảng ở đây chỉ thêm.
-- Idempotent. Chỉ THÊM (expand). Không dùng grant hàng loạt.

-- Bucket -----------------------------------------------------------------------------------------------------------------------------
do $$
begin
  if pg_catalog.to_regclass('storage.buckets') is not null then
    begin
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('english-work', 'english-work', false, 15728640, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
      on conflict (id) do update
        set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    exception when others then
      -- Không để việc tạo kho làm hỏng cả migration: app tự tạo bucket này ở lần dùng đầu tiên nếu thiếu.
      raise warning 'english-work bucket was not created here (%): the app creates it on first use', sqlerrm;
    end;
  end if;
end
$$;

-- File ---------------------------------------------------------------------------------------------------------------------------------
-- learner_id NULL = file dùng chung của gia đình (chưa dùng ở PR này; thư viện nguồn S5b-2). Dòng chỉ thêm; xóa chỉ qua eng_purge_learner.
create table if not exists english.files (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references english.families(id),
  learner_id uuid references english.learners(id),
  kind text not null check (kind in ('assignment_pdf', 'answer_key', 'result_image', 'work_photo')),
  path text not null unique,
  mime text not null check (mime in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  bytes int not null check (bytes between 1 and 15728640),
  -- id của english.members, KHÔNG có khóa ngoại (xóa tài khoản không làm hỏng lịch sử).
  uploaded_by_member uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint files_path_shape check (
    path = family_id::text || '/' || coalesce(learner_id::text, 'shared') || '/' || id::text ||
      case mime when 'application/pdf' then '.pdf' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else '.webp' end),
  constraint files_kind_mime check (
    (kind = 'assignment_pdf' and mime = 'application/pdf') or kind in ('answer_key', 'work_photo') or (kind = 'result_image' and mime <> 'application/pdf'))
);
create index if not exists files_learner_idx on english.files(learner_id);

-- Bài được giao ----------------------------------------------------------------------------------------------------------------------
create table if not exists english.assignments (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  kind text not null check (kind in ('link', 'pdf')),
  url text check (url is null or (pg_catalog.length(url) <= 2000 and url ~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')),
  -- Nguồn nhận ra từ tên miền (eng_link_source_key). Chữ hiển thị nằm trong lib/copy/vi.ts.
  source_key text check (source_key is null or source_key in ('test-english', 'notebooklm', 'gemini', 'other')),
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 200),
  tag_keys text[] not null default '{}' check (cardinality(tag_keys) <= 3),
  due_on date,
  frame_id uuid references english.test_frames(id),
  file_id uuid references english.files(id),
  answer_file_id uuid references english.files(id),
  assigned_by_member uuid not null,
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint assignments_shape check (
    (kind = 'link' and url is not null and source_key is not null and file_id is null and answer_file_id is null)
    or (kind = 'pdf' and url is null and source_key is null and file_id is not null))
);
create index if not exists assignments_learner_idx on english.assignments(learner_id, created_at desc);

-- Sự kiện của bài giao: hiện chỉ có "rút bài" (kind = 'retracted'), tối đa một lần.
create table if not exists english.assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references english.assignments(id),
  learner_id uuid not null references english.learners(id),
  kind text not null check (kind in ('retracted')),
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 1 and 300),
  by_member uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists assignment_events_retract_once on english.assignment_events(assignment_id) where kind = 'retracted';

-- Bài em gửi (hoặc gia sư nộp thay). attempt / used_hint là lời KHAI của em ("lần đầu?", "có bấm Hint?"); gia sư xác nhận khi ghi kết quả.
create table if not exists english.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references english.assignments(id),
  learner_id uuid not null references english.learners(id),
  attempt text not null check (attempt in ('first', 'retry')),
  used_hint boolean not null,
  link_url text check (link_url is null or (pg_catalog.length(link_url) <= 2000 and link_url ~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')),
  -- Không có khóa ngoại cho từng phần tử mảng: eng_submit_practice kiểm từng file (của đúng em, đúng loại, chưa dùng).
  file_ids uuid[] not null default '{}' check (cardinality(file_ids) <= 6),
  submitted_by_member uuid not null,
  submitted_by_role text not null check (submitted_by_role in ('student', 'tutor', 'parent')),
  supersedes_id uuid references english.submissions(id),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint submissions_something check (link_url is not null or cardinality(file_ids) >= 1)
);
create unique index if not exists submissions_supersedes_once on english.submissions(supersedes_id) where supersedes_id is not null;
create index if not exists submissions_assignment_idx on english.submissions(assignment_id, created_at desc);

-- Kết quả bài (0014) nay có khóa ngoại tới bài được giao + phải cùng một em.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'results_assignment_fk' and conrelid = 'english.results'::regclass) then
    alter table english.results add constraint results_assignment_fk foreign key (assignment_id) references english.assignments(id);
  end if;
end
$$;

create or replace function english.eng_check_result_assignment() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.assignment_id is not null
     and not exists (select 1 from english.assignments a where a.id = new.assignment_id and a.learner_id = new.learner_id) then
    raise exception 'results: the assignment does not belong to this learner' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function english.eng_check_result_assignment() from public, anon, authenticated;
drop trigger if exists results_check_assignment on english.results;
create trigger results_check_assignment before insert on english.results for each row execute function english.eng_check_result_assignment();

-- Append-only (theo hướng dẫn đầu 0004) --------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['files', 'assignments', 'assignment_events', 'submissions'] loop
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

-- Hàm nhỏ -----------------------------------------------------------------------------------------------------------------------------

-- Nguồn của một link https theo tên miền (chính nó hoặc tên miền con). NULL nếu không phải https.
-- test-english.com -> test-english · notebooklm.google.com / notebook.google.com -> notebooklm · gemini.google.com / share.gemini.google -> gemini · còn lại -> other.
create or replace function english.eng_link_source_key(p_url text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_url !~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' or h.host is null then null
    when exists (select 1 from (values ('test-english.com')) d(x) where h.host = d.x or h.host like '%.' || d.x) then 'test-english'
    when exists (select 1 from (values ('notebooklm.google.com'), ('notebook.google.com')) d(x) where h.host = d.x or h.host like '%.' || d.x) then 'notebooklm'
    when exists (select 1 from (values ('gemini.google.com'), ('share.gemini.google')) d(x) where h.host = d.x or h.host like '%.' || d.x) then 'gemini'
    else 'other'
  end
  from (select pg_catalog.lower(pg_catalog.substring(p_url, '^[Hh][Tt][Tt][Pp][Ss]://([^/?#:@]+)')) as host) h
$$;

-- Một dòng files hợp lệ từ phần mô tả máy chủ gửi lên {id, mime, bytes}: tính đường dẫn từ id (không tin đường dẫn do người dùng gửi).
-- Hàm nội bộ. Trả id của dòng mới.
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
  if v_mime not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp') then
    raise exception 'eng_register_file: only pdf, png, jpeg and webp files are accepted' using errcode = '22023';
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
  v_ext := case v_mime when 'application/pdf' then 'pdf' when 'image/png' then 'png' when 'image/jpeg' then 'jpg' else 'webp' end;
  insert into english.files(id, family_id, learner_id, kind, path, mime, bytes, uploaded_by_member)
  values (v_id, p_family, p_learner, p_kind, p_family::text || '/' || coalesce(p_learner::text, 'shared') || '/' || v_id::text || '.' || v_ext, v_mime, v_bytes, p_by);
  return v_id;
end
$$;

-- Giao bài ---------------------------------------------------------------------------------------------------------------------------

-- Giao một bài luyện: link (p_url) hoặc đề PDF (p_files = {"main": {id,mime,bytes}, "answer": {…}|null}). Máy chủ đã kiểm file đã được
-- tải lên đúng kích thước / loại trước khi gọi. Gia sư hoặc phụ huynh của em. Idempotent theo (em, client_id). Trả {id, replayed}.
create or replace function english.eng_create_assignment(
  p_learner uuid,
  p_kind text,
  p_url text,
  p_title text,
  p_tag_keys text[],
  p_due_on date,
  p_frame uuid,
  p_files jsonb,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_learner english.learners%rowtype;
  v_member english.members%rowtype;
  v_title text := nullif(pg_catalog.btrim(coalesce(p_title, '')), '');
  v_url text := nullif(pg_catalog.btrim(coalesce(p_url, '')), '');
  v_tags text[];
  v_existing english.assignments%rowtype;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_file uuid;
  v_answer uuid;
  v_source text;
  k text;
begin
  if p_learner is null or p_kind is null or p_by is null then
    raise exception 'eng_create_assignment: learner, kind and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_create_assignment: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if p_kind not in ('link', 'pdf') then
    raise exception 'eng_create_assignment: kind is link or pdf' using errcode = '22023';
  end if;
  select * into v_learner from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_create_assignment: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_create_assignment: this member may not give work to this learner' using errcode = '42501';
  end if;
  if v_title is null or pg_catalog.length(v_title) > 200 then
    raise exception 'eng_create_assignment: the title is 1 to 200 characters' using errcode = '22023';
  end if;
  if p_due_on is not null and (p_due_on < english.eng_today_vn() or p_due_on > english.eng_today_vn() + 365) then
    raise exception 'eng_create_assignment: the due date must be from today to one year ahead' using errcode = '23514';
  end if;

  -- Nhãn "Luyện điểm": bỏ trống / trùng, tối đa 3, phải thuộc track của em.
  select coalesce(array_agg(k2 order by mo), '{}') into v_tags
  from (select pg_catalog.btrim(x) as k2, min(o) as mo
        from unnest(coalesce(p_tag_keys, '{}')) with ordinality as t(x, o)
        where pg_catalog.btrim(coalesce(x, '')) <> '' group by pg_catalog.btrim(x)) s;
  if cardinality(v_tags) > 3 then
    raise exception 'eng_create_assignment: at most 3 tags' using errcode = '23514';
  end if;
  foreach k in array v_tags loop
    if not english.eng_tag_exists(v_learner.track_id, v_learner.family_id, k) then
      raise exception 'eng_create_assignment: a tag does not exist for this learner''s track' using errcode = '23514';
    end if;
  end loop;
  if p_frame is not null and not exists (
    select 1 from english.test_frames f
    where f.id = p_frame and f.family_id = v_learner.family_id and f.track_id = v_learner.track_id
      and not exists (select 1 from english.test_frames f2 where f2.supersedes_id = f.id)) then
    raise exception 'eng_create_assignment: this frame is not available for this learner' using errcode = '23514';
  end if;

  if p_kind = 'link' then
    if v_url is null or v_url !~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' or pg_catalog.length(v_url) > 2000 then
      raise exception 'eng_create_assignment: a link must be a valid https address' using errcode = '22023';
    end if;
    if p_files is not null and pg_catalog.jsonb_typeof(p_files) <> 'null' then
      raise exception 'eng_create_assignment: a link assignment has no files' using errcode = '22023';
    end if;
    v_source := english.eng_link_source_key(v_url);
  else
    if v_url is not null then
      raise exception 'eng_create_assignment: a PDF assignment has no link' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(p_files) is distinct from 'object' or pg_catalog.jsonb_typeof(p_files -> 'main') is distinct from 'object'
       or exists (select 1 from pg_catalog.jsonb_object_keys(p_files) kk where kk not in ('main', 'answer')) then
      raise exception 'eng_create_assignment: a PDF assignment needs {main, answer?} files' using errcode = '22023';
    end if;
  end if;

  -- Gửi lại: cùng bài.
  select a.* into v_existing from english.assignments a where a.learner_id = p_learner and a.client_id = p_client_id;
  if found then
    if v_existing.kind <> p_kind or v_existing.url is distinct from v_url or v_existing.title <> v_title or v_existing.tag_keys <> v_tags
       or v_existing.due_on is distinct from p_due_on or v_existing.frame_id is distinct from p_frame
       or v_existing.assigned_by_member <> p_by
       or (p_kind = 'pdf' and v_existing.file_id is distinct from (p_files -> 'main' ->> 'id')::uuid) then
      raise exception 'eng_create_assignment: client_id was already used for a different assignment' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'replayed', true);
  end if;

  if p_kind = 'pdf' then
    v_file := english.eng_register_file(v_learner.family_id, p_learner, 'assignment_pdf', p_files -> 'main', p_by);
    if pg_catalog.jsonb_typeof(p_files -> 'answer') = 'object' then
      v_answer := english.eng_register_file(v_learner.family_id, p_learner, 'answer_key', p_files -> 'answer', p_by);
    elsif (p_files -> 'answer') is not null and pg_catalog.jsonb_typeof(p_files -> 'answer') <> 'null' then
      raise exception 'eng_create_assignment: answer must be a file or null' using errcode = '22023';
    end if;
  end if;

  insert into english.assignments(id, learner_id, kind, url, source_key, title, tag_keys, due_on, frame_id, file_id, answer_file_id, assigned_by_member, client_id)
  values (v_id, p_learner, p_kind, v_url, v_source, v_title, v_tags, p_due_on, p_frame, v_file, v_answer, p_by, p_client_id);

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'assignment.created', v_learner.family_id, p_learner,
          pg_catalog.jsonb_build_object('assignment', v_id, 'kind', p_kind));

  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- Rút một bài đã giao: em không còn thấy và không nộp được. Gọi lại → bỏ qua. Gia sư hoặc phụ huynh của em.
create or replace function english.eng_retract_assignment(p_assignment uuid, p_reason text, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_a english.assignments%rowtype;
  v_learner english.learners%rowtype;
  v_member english.members%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  if p_assignment is null or p_by is null then
    raise exception 'eng_retract_assignment: assignment and actor are required' using errcode = '22004';
  end if;
  select * into v_a from english.assignments a where a.id = p_assignment;
  if not found then
    raise exception 'eng_retract_assignment: assignment not found' using errcode = 'P0002';
  end if;
  select * into v_learner from english.learners l where l.id = v_a.learner_id for update;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, v_a.learner_id) then
    raise exception 'eng_retract_assignment: this member may not change work of this learner' using errcode = '42501';
  end if;
  if v_reason is not null and pg_catalog.length(v_reason) > 300 then
    raise exception 'eng_retract_assignment: the reason is too long' using errcode = '22023';
  end if;
  if exists (select 1 from english.assignment_events e where e.assignment_id = p_assignment and e.kind = 'retracted') then
    return pg_catalog.jsonb_build_object('id', p_assignment, 'replayed', true);
  end if;
  insert into english.assignment_events(assignment_id, learner_id, kind, reason, by_member)
  values (p_assignment, v_a.learner_id, 'retracted', v_reason, p_by);
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'assignment.retracted', v_learner.family_id, v_a.learner_id,
          pg_catalog.jsonb_build_object('assignment', p_assignment));
  return pg_catalog.jsonb_build_object('id', p_assignment, 'replayed', false);
end
$$;

-- Nộp bài ---------------------------------------------------------------------------------------------------------------------------

-- Em nộp bài của chính mình, hoặc gia sư / phụ huynh nộp thay. p_files = [{id, mime, bytes}] (máy chủ đã kiểm file có thật, đúng loại, đúng cỡ).
-- Link bài: cần ảnh kết quả (result_image) và/hoặc link đã làm; đề PDF: cần ảnh / file bài làm (work_photo), không có link.
-- Nộp lại = dòng mới thay dòng hiện hành; em không nộp lại được khi gia sư đã ghi kết quả cho bài này. Idempotent theo (em, client_id).
create or replace function english.eng_submit_practice(
  p_assignment uuid,
  p_by uuid,
  p_client_id text,
  p_attempt text,
  p_used_hint boolean,
  p_link_url text,
  p_files jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_a english.assignments%rowtype;
  v_learner english.learners%rowtype;
  v_member english.members%rowtype;
  v_link text := nullif(pg_catalog.btrim(coalesce(p_link_url, '')), '');
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_head english.submissions%rowtype;
  v_existing english.submissions%rowtype;
  v_ids uuid[] := '{}';
  v_kind text;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_file jsonb;
  v_fid uuid;
begin
  if p_assignment is null or p_by is null or p_attempt is null or p_used_hint is null then
    raise exception 'eng_submit_practice: assignment, actor, attempt and hint are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_submit_practice: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if p_attempt not in ('first', 'retry') then
    raise exception 'eng_submit_practice: attempt is first or retry' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(v_files) <> 'array' or pg_catalog.jsonb_array_length(v_files) > 6 then
    raise exception 'eng_submit_practice: files must be a list of at most 6' using errcode = '22023';
  end if;

  select * into v_a from english.assignments a where a.id = p_assignment;
  if not found then
    raise exception 'eng_submit_practice: assignment not found' using errcode = 'P0002';
  end if;
  select * into v_learner from english.learners l where l.id = v_a.learner_id for update;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null then
    raise exception 'eng_submit_practice: assignment not found' using errcode = 'P0002';
  end if;
  -- Em: chỉ bài của CHÍNH em (tài khoản học sinh gắn với learner). Gia sư / phụ huynh: nộp thay cho em trong phạm vi.
  if v_member.role = 'student' then
    if v_learner.member_id is distinct from v_member.id then
      raise exception 'eng_submit_practice: assignment not found' using errcode = 'P0002';
    end if;
  elsif v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, v_a.learner_id) then
    raise exception 'eng_submit_practice: this member may not submit for this learner' using errcode = '42501';
  end if;
  if exists (select 1 from english.assignment_events e where e.assignment_id = p_assignment and e.kind = 'retracted') then
    raise exception 'eng_submit_practice: assignment not found' using errcode = 'P0002';
  end if;

  if v_link is not null and (v_link !~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' or pg_catalog.length(v_link) > 2000) then
    raise exception 'eng_submit_practice: a link must be a valid https address' using errcode = '22023';
  end if;
  if v_a.kind = 'pdf' and v_link is not null then
    raise exception 'eng_submit_practice: work on a PDF is sent as photos or files, not a link' using errcode = '22023';
  end if;
  if v_link is null and pg_catalog.jsonb_array_length(v_files) = 0 then
    raise exception 'eng_submit_practice: send a screenshot, a photo or a link' using errcode = '23514';
  end if;
  v_kind := case v_a.kind when 'link' then 'result_image' else 'work_photo' end;

  -- Gửi lại: cùng bài nộp (cùng bài, khai báo, link và tập file).
  select s.* into v_existing from english.submissions s where s.learner_id = v_a.learner_id and s.client_id = p_client_id;
  if found then
    if v_existing.assignment_id <> p_assignment or v_existing.attempt <> p_attempt or v_existing.used_hint <> p_used_hint
       or v_existing.link_url is distinct from v_link or v_existing.submitted_by_member <> p_by
       or (select coalesce(array_agg(x order by x), '{}') from unnest(v_existing.file_ids) x)
          is distinct from (select coalesce(array_agg((f ->> 'id')::uuid order by (f ->> 'id')::uuid), '{}')
                            from pg_catalog.jsonb_array_elements(v_files) f where (f ->> 'id') ~ '^[0-9a-f-]{36}$') then
      raise exception 'eng_submit_practice: client_id was already used for a different submission' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'replayed', true);
  end if;

  -- Bài hiện hành của bài giao này (chưa bị thay).
  select s.* into v_head from english.submissions s
  where s.assignment_id = p_assignment and not exists (select 1 from english.submissions s2 where s2.supersedes_id = s.id)
  order by s.created_at desc limit 1;
  -- Gia sư đã ghi kết quả cho bài này thì em không sửa nữa (gia sư / phụ huynh vẫn nộp thay được).
  if v_member.role = 'student' and exists (select 1 from english.results r where r.assignment_id = p_assignment) then
    raise exception 'eng_submit_practice: this work was already looked at (already_reviewed)' using errcode = '23505';
  end if;

  for v_file in select f from pg_catalog.jsonb_array_elements(v_files) f loop
    if exists (select 1 from english.files f0 where f0.id::text = v_file ->> 'id') then
      raise exception 'eng_submit_practice: a file can only be used once' using errcode = '23505';
    end if;
    v_fid := english.eng_register_file(v_learner.family_id, v_a.learner_id, v_kind, v_file, p_by);
    v_ids := v_ids || v_fid;
  end loop;
  if (select pg_catalog.count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
    raise exception 'eng_submit_practice: a file appears twice' using errcode = '22023';
  end if;

  insert into english.submissions(id, assignment_id, learner_id, attempt, used_hint, link_url, file_ids, submitted_by_member, submitted_by_role, supersedes_id, client_id)
  values (v_id, p_assignment, v_a.learner_id, p_attempt, p_used_hint, v_link, v_ids, p_by, v_member.role, v_head.id, p_client_id);

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'practice.submitted', v_learner.family_id, v_a.learner_id,
          pg_catalog.jsonb_build_object('assignment', p_assignment, 'submission', v_id, 'files', cardinality(v_ids), 'supersedes', v_head.id));

  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- Đọc cho gia sư / phụ huynh ---------------------------------------------------------------------------------------------------------

-- Các bài đã giao của một em (mới nhất trước, tối đa 200), mỗi bài kèm: file, bài em gửi hiện hành (kèm các file), kết quả đã ghi (nếu có),
-- ngày rút (nếu có). Chỉ service_role (máy chủ gọi SAU requireAccess). p_assignment: lấy một bài.
create or replace function english.eng_assignment_overview(p_learner uuid, p_assignment uuid default null) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(t.obj order by t.created_at desc, t.id), '[]'::jsonb)
  from (
    select a.id, a.created_at,
      pg_catalog.jsonb_build_object(
        'id', a.id, 'kind', a.kind, 'title', a.title, 'url', a.url, 'source_key', a.source_key,
        'tag_keys', pg_catalog.to_jsonb(a.tag_keys), 'due_on', a.due_on, 'frame_id', a.frame_id, 'created_at', a.created_at,
        'retracted_at', (select e.created_at from english.assignment_events e where e.assignment_id = a.id and e.kind = 'retracted'),
        'file', (select pg_catalog.jsonb_build_object('id', f.id, 'mime', f.mime, 'bytes', f.bytes) from english.files f where f.id = a.file_id),
        'answer_file', (select pg_catalog.jsonb_build_object('id', f.id, 'mime', f.mime, 'bytes', f.bytes) from english.files f where f.id = a.answer_file_id),
        'submission', (
          select pg_catalog.jsonb_build_object(
            'id', s.id, 'created_at', s.created_at, 'attempt', s.attempt, 'used_hint', s.used_hint, 'link_url', s.link_url,
            'by_role', s.submitted_by_role,
            'files', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', f.id, 'mime', f.mime, 'bytes', f.bytes) order by u.ord)
                               from unnest(s.file_ids) with ordinality as u(fid, ord) join english.files f on f.id = u.fid), '[]'::jsonb))
          from english.submissions s
          where s.assignment_id = a.id and not exists (select 1 from english.submissions s2 where s2.supersedes_id = s.id)
          order by s.created_at desc limit 1),
        'result_id', (
          select r.id from english.results r
          where r.assignment_id = a.id and not exists (select 1 from english.results r2 where r2.supersedes_id = r.id)
          order by r.created_at desc limit 1)
      ) as obj
    from english.assignments a
    where a.learner_id = p_learner and (p_assignment is null or a.id = p_assignment)
    order by a.created_at desc, a.id
    limit 200
  ) t
$$;

-- Đường đọc của học sinh ---------------------------------------------------------------------------------------------------------------
-- Chỉ bài của CHÍNH em, chỉ bài chưa rút. Không trả: nhãn, khung đề, kết quả, số câu sai, file đáp án. Có "reviewed" (đã được xem) để em biết
-- không nộp lại được nữa - không kèm con số nào.
create or replace function english.eng_my_practice() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(t.obj order by t.created_at desc, t.id), '[]'::jsonb)
  from (
    select a.id, a.created_at,
      pg_catalog.jsonb_build_object(
        'assignment_id', a.id,
        'kind', a.kind,
        'title', a.title,
        'source_key', a.source_key,
        'url', a.url,
        'has_file', a.file_id is not null,
        'due_on', a.due_on,
        'assigned_on', (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
        'reviewed', exists (select 1 from english.results r where r.assignment_id = a.id),
        'submission', (
          select pg_catalog.jsonb_build_object(
            'submitted_at', s.created_at, 'attempt', s.attempt, 'used_hint', s.used_hint,
            'file_count', cardinality(s.file_ids), 'has_link', s.link_url is not null)
          from english.submissions s
          where s.assignment_id = a.id and not exists (select 1 from english.submissions s2 where s2.supersedes_id = s.id)
          order by s.created_at desc limit 1)
      ) as obj
    from english.members m
    join english.learners l on l.member_id = m.id
    join english.assignments a on a.learner_id = l.id
    where m.user_id = auth.uid() and m.role = 'student'
      and not exists (select 1 from english.assignment_events e where e.assignment_id = a.id and e.kind = 'retracted')
    order by a.created_at desc, a.id
    limit 40
  ) t
$$;

-- Đề PDF của một bài của em (để máy chủ cấp link tải 300 giây). NULL nếu không phải bài của em, đã rút, hoặc không phải bài PDF.
-- Không bao giờ trả file đáp án.
create or replace function english.eng_my_practice_file(p_assignment uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('file_id', f.id, 'path', f.path, 'mime', f.mime, 'title', a.title)
  from english.members m
  join english.learners l on l.member_id = m.id
  join english.assignments a on a.learner_id = l.id
  join english.files f on f.id = a.file_id and f.kind = 'assignment_pdf'
  where m.user_id = auth.uid() and m.role = 'student'
    and a.id = p_assignment
    and not exists (select 1 from english.assignment_events e where e.assignment_id = a.id and e.kind = 'retracted')
$$;

-- "Việc cần ôn" + lời nhắn của em: từ ghi chú buổi học mới nhất (chưa bị thay) có nhãn hoặc lời nhắn. Chỉ tên nhãn (label_vi) và lời nhắn;
-- không ghi chú cho phụ huynh, không điểm, không số lần. NULL nếu chưa có.
create or replace function english.eng_my_review_points() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'session_date', n.session_date,
    'message', n.message_to_learner,
    'labels', coalesce((
      select pg_catalog.jsonb_agg(coalesce(t.label_vi, k.key) order by k.ord)
      from unnest(n.weak_tag_keys) with ordinality as k(key, ord)
      left join english.error_tags t on t.track_id = l.track_id and t.key = k.key and (t.family_id is null or t.family_id = l.family_id)
    ), '[]'::jsonb))
  from english.members m
  join english.learners l on l.member_id = m.id
  join english.lesson_notes n on n.learner_id = l.id
  where m.user_id = auth.uid() and m.role = 'student'
    and (cardinality(n.weak_tag_keys) > 0 or n.message_to_learner is not null)
    and not exists (select 1 from english.lesson_notes n2 where n2.supersedes_id = n.id)
  order by n.session_date desc, n.created_at desc
  limit 1
$$;

-- Quyền thực thi ---------------------------------------------------------------------------------------------------------------------
-- Hàm nội bộ: không ai gọi trực tiếp.
revoke execute on function english.eng_register_file(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_link_source_key(text) from public, anon, authenticated;
grant execute on function english.eng_link_source_key(text) to service_role;
-- Hàm ghi và đọc của gia sư / phụ huynh: chỉ service_role (máy chủ gọi SAU requireAccess).
revoke execute on function english.eng_create_assignment(uuid, text, text, text, text[], date, uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke execute on function english.eng_retract_assignment(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function english.eng_submit_practice(uuid, uuid, text, text, boolean, text, jsonb) from public, anon, authenticated;
revoke execute on function english.eng_assignment_overview(uuid, uuid) from public, anon, authenticated;
grant execute on function english.eng_create_assignment(uuid, text, text, text, text[], date, uuid, jsonb, uuid, text) to service_role;
grant execute on function english.eng_retract_assignment(uuid, text, uuid) to service_role;
grant execute on function english.eng_submit_practice(uuid, uuid, text, text, boolean, text, jsonb) to service_role;
grant execute on function english.eng_assignment_overview(uuid, uuid) to service_role;
-- Hàm đọc của học sinh: CHỈ authenticated (người gọi nhận diện bằng auth.uid() bên trong hàm); không anon, không public, không service_role.
revoke execute on function english.eng_my_practice() from public, anon, service_role;
revoke execute on function english.eng_my_practice_file(uuid) from public, anon, service_role;
revoke execute on function english.eng_my_review_points() from public, anon, service_role;
grant execute on function english.eng_my_practice() to authenticated;
grant execute on function english.eng_my_practice_file(uuid) to authenticated;
grant execute on function english.eng_my_review_points() to authenticated;

-- Purge: thêm các bảng của S5b-1 PR B. Thân hàm = bản của 0014 + các dòng mới (chỉ THÊM dòng, không bỏ dòng nào; có test đối chiếu từng dòng).
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

-- RLS ------------------------------------------------------------------------------------------------------------------------------------
alter table english.files enable row level security;
alter table english.assignments enable row level security;
alter table english.assignment_events enable row level security;
alter table english.submissions enable row level security;

-- Phụ huynh / gia sư trong phạm vi của em. Học sinh: không bao giờ (em đọc qua eng_my_*). File dùng chung (learner_id NULL): nhân viên của gia đình.
drop policy if exists files_select on english.files;
create policy files_select on english.files
  for select to authenticated
  using ((learner_id is not null and english.eng_is_staff_of(learner_id))
         or (learner_id is null and english.eng_is_staff() and family_id = english.eng_member_family_id()));

drop policy if exists assignments_select on english.assignments;
create policy assignments_select on english.assignments
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

drop policy if exists assignment_events_select on english.assignment_events;
create policy assignment_events_select on english.assignment_events
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

drop policy if exists submissions_select on english.submissions;
create policy submissions_select on english.submissions
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- Grant theo từng bảng; ghi chỉ qua hàm security definer ở trên (và migration / script của chủ sở hữu).
grant select on english.files, english.assignments, english.assignment_events, english.submissions to authenticated;
revoke insert, update, delete, truncate on
  english.files, english.assignments, english.assignment_events, english.submissions
  from public, anon, authenticated, service_role;
revoke all on english.files, english.assignments, english.assignment_events, english.submissions from anon;

insert into english.schema_migrations(version) values ('0016') on conflict do nothing;
