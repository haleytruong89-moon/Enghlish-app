-- 0026_curriculum.sql
-- W2 · Giáo trình (spec docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md §4 W2, §6 W2; luật docs/DOMAIN.md §3 tầng B, §4,
-- §5.1, §6, §7, §8, §9.2, §13 D-W1 D-W2 D-W8, §14 R3 R4 R7; kế hoạch docs/superpowers/plans/2026-11-08-w2-curriculum.md):
--   1. files.kind thêm 'curriculum_toc' (CHỈ PDF) + eng_register_file nhận loại mới.
--   2. Bảng: curricula (của MỘT em, không có kind — R4), curriculum_versions (nháp → đã duyệt → thay bằng vN+1; đã duyệt bất biến),
--      curriculum_units + curriculum_unit_points (chỉ sinh lúc Duyệt; mã Unit ổn định qua các phiên bản; mỗi dòng nối = đúng MỘT nhãn
--      của track / gia đình), curriculum_unit_events (chỉ thêm: chưa học / đang học / đã học / bỏ qua), lesson_note_units (Unit đã dạy
--      trong một buổi, chỉ thêm).
--   3. Bảo vệ (chỉ thêm, phiên bản đã duyệt bất biến) + RLS (eng_is_staff_of; học sinh không đọc gì).
--   4. Ghi (service_role sau requireAccess; hàm kiểm lại người thao tác): tạo giáo trình / nạp mục lục (gia sư HOẶC phụ huynh), lưu / bỏ
--      nháp (gia sư hoặc phụ huynh), DUYỆT (chỉ gia sư của em — D-W8), sửa sau duyệt = phiên bản mới, đặt trạng thái Unit.
--   5. ai_runs.purpose thêm 'curriculum_toc'; eng_ai_gate / eng_log_ai_run thêm tham số CUỐI p_purpose (mặc định 'studio_extract':
--      mọi lời gọi cũ chạy y như trước).
--   6. Nhãn dạng câu NGHE (R7): nhãn có sẵn mới mang group_key mảng Nghe của SM-1 (SM-1 đã công bố nên không thêm lá); CHECK
--      error_tags_group_key_shape nới cho riêng các nhãn 'nghe-…' có sẵn; eng_skill_map đặt chúng vào nhóm như nhãn riêng.
--   7. Ghi buổi v3 = v2 + Unit đã dạy. eng_write_lesson_note_v2 và v1 giữ nguyên.
--   8. eng_purge_learner + eng_purge_preview thêm 6 bảng mới (jsonb_build_object nhận tối đa 100 tham số: khóa mới ở object thứ hai).
-- Idempotent; chỉ thêm (expand). Không đụng schema public. Cần 0025 đã áp.

-- 1. File mục lục ------------------------------------------------------------------------------------------------------------------
alter table english.files drop constraint if exists files_kind_check;
alter table english.files add constraint files_kind_check
  check (kind in ('assignment_pdf', 'answer_key', 'result_image', 'work_photo', 'external_result', 'studio_test', 'studio_key', 'curriculum_toc'));
alter table english.files drop constraint if exists files_kind_mime;
alter table english.files add constraint files_kind_mime check (
  (kind = 'assignment_pdf' and mime = 'application/pdf')
  or (kind in ('answer_key', 'work_photo', 'external_result') and mime <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  or (kind = 'result_image' and mime in ('image/png', 'image/jpeg', 'image/webp'))
  or (kind in ('studio_test', 'studio_key') and mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
  or (kind = 'curriculum_toc' and mime = 'application/pdf'));

-- Đăng ký file = bản 0024 + mục lục giáo trình (chỉ PDF).
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
  if p_kind = 'curriculum_toc' and v_mime <> 'application/pdf' then
    raise exception 'eng_register_file: a table of contents must be a PDF (toc_pdf_only)' using errcode = '22023';
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


-- 2. Bảng giáo trình -------------------------------------------------------------------------------------------------------------------

-- 2a. Giáo trình: một quyển / nguồn mà gia sư dạy cho MỘT em (D-W2). Không có `kind` (R4). Bất biến sau khi tạo (chỉ thêm).
create table if not exists english.curricula (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references english.families(id),
  learner_id uuid not null references english.learners(id),
  track_id text not null references english.tracks(id),
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 160),
  -- vd "Quyển 3 ≈ B1+": ghi chú cấp của sách, không phải cấp của em.
  level_note text check (level_note is null or pg_catalog.length(pg_catalog.btrim(level_note)) between 1 and 200),
  -- id của english.members, KHÔNG có khóa ngoại (như các bảng khác).
  created_by_member uuid not null,
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create index if not exists curricula_learner_idx on english.curricula(learner_id, created_at);

-- 2b. Phiên bản giáo trình: nháp (sửa tự do, payload) → đã duyệt (bất biến; Unit + nối sinh ra lúc Duyệt) → thay bằng vN+1.
-- payload = {units:[{code,title,section,page,skipped,points[],missing_points[],needs_review,review_reason,origin,dropped,edit_reason}],
--            ignored:[{label,page,reason}]}; hình chi tiết do zod (lib/curriculum/schema.ts) kiểm ở máy chủ.
-- ai_payload = bản AI soạn (chép một lần khi AI xong, không đổi) để đếm % dòng gia sư sửa (spec §8).
create table if not exists english.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references english.curricula(id),
  learner_id uuid not null references english.learners(id),
  version int not null check (version between 1 and 999),
  source text not null check (source in ('ai', 'manual', 'edit')),
  status text not null check (status in ('extracting', 'ai_failed', 'draft', 'approved', 'superseded', 'discarded')),
  toc_file_id uuid references english.files(id),
  payload jsonb not null default '{"units": [], "ignored": []}'::jsonb,
  ai_payload jsonb,
  ai_run_id uuid references english.ai_runs(id),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,40}$'),
  supersedes_version_id uuid references english.curriculum_versions(id),
  created_by_member uuid not null,
  updated_by_member uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  approved_by_member uuid,
  approved_at timestamptz,
  -- {stats:{ai_rows,kept,edited,dropped,added,edited_pct,reasons}, quality:'good'|'ok'|'needs_work'|null, quality_note}
  review jsonb check (review is null or (pg_catalog.jsonb_typeof(review) = 'object' and pg_catalog.length(review::text) <= 4000)),
  superseded_at timestamptz,
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (curriculum_id, version),
  unique (learner_id, client_id),
  constraint curriculum_versions_payload_shape check (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and pg_catalog.jsonb_typeof(payload -> 'units') = 'array'
    and pg_catalog.jsonb_typeof(payload -> 'ignored') = 'array'
    and pg_catalog.jsonb_array_length(payload -> 'units') <= 300
    and pg_catalog.length(payload::text) <= 300000),
  constraint curriculum_versions_approved_shape check (
    (status in ('approved', 'superseded')) = (approved_at is not null and approved_by_member is not null)),
  constraint curriculum_versions_superseded_shape check ((status = 'superseded') = (superseded_at is not null)),
  constraint curriculum_versions_ai_has_file check (source <> 'ai' or toc_file_id is not null)
);
create index if not exists curriculum_versions_curriculum_idx on english.curriculum_versions(curriculum_id, version desc);
create index if not exists curriculum_versions_learner_idx on english.curriculum_versions(learner_id);
-- Một nháp đang mở và một bản đang dùng cho mỗi giáo trình.
create unique index if not exists curriculum_versions_one_open on english.curriculum_versions(curriculum_id)
  where status in ('extracting', 'ai_failed', 'draft');
create unique index if not exists curriculum_versions_one_current on english.curriculum_versions(curriculum_id) where status = 'approved';

-- 2c. Unit của một phiên bản ĐÃ DUYỆT (chỉ sinh trong eng_approve_curriculum_version). Mã Unit ổn định qua các phiên bản (U7 ở v1 = U7
-- ở v2); "bỏ qua" vẫn giữ dòng, chỉ đánh dấu.
create table if not exists english.curriculum_units (
  version_id uuid not null references english.curriculum_versions(id),
  curriculum_id uuid not null references english.curricula(id),
  learner_id uuid not null references english.learners(id),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
  ord int not null check (ord between 1 and 300),
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 160),
  section text check (section is null or pg_catalog.length(pg_catalog.btrim(section)) between 1 and 40),
  page int check (page is null or page between 1 and 3000),
  skipped boolean not null default false,
  primary key (version_id, code),
  unique (version_id, ord)
);
create index if not exists curriculum_units_curriculum_idx on english.curriculum_units(curriculum_id);
create index if not exists curriculum_units_learner_idx on english.curriculum_units(learner_id);

-- 2d. Nối Unit → điểm: mỗi dòng = đúng MỘT nhãn (error_tags.key) của track em, có sẵn hoặc của gia đình (danh sách đóng, D-W1).
create table if not exists english.curriculum_unit_points (
  version_id uuid not null,
  code text not null,
  learner_id uuid not null references english.learners(id),
  tag_key text not null check (pg_catalog.length(tag_key) between 1 and 80),
  ord int not null check (ord between 1 and 12),
  primary key (version_id, code, tag_key),
  unique (version_id, code, ord),
  foreign key (version_id, code) references english.curriculum_units(version_id, code)
);
create index if not exists curriculum_unit_points_learner_idx on english.curriculum_unit_points(learner_id);

-- 2e. Trạng thái Unit: chỉ thêm; trạng thái hiện tại = sự kiện mới nhất của mã Unit đó (DOMAIN §5.1). Theo GIÁO TRÌNH + mã Unit (không
-- theo phiên bản) để "đang học đến" đi theo sang phiên bản mới.
create table if not exists english.curriculum_unit_events (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references english.curricula(id),
  learner_id uuid not null references english.learners(id),
  unit_code text not null check (unit_code ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
  status text not null check (status in ('not_started', 'in_progress', 'done', 'skipped')),
  -- Đặt từ đề xuất sau khi ghi buổi (gia sư bấm) thì trỏ tới buổi đó.
  lesson_note_id uuid references english.lesson_notes(id),
  by_member uuid not null,
  by_role text not null check (by_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id)
);
create index if not exists curriculum_unit_events_idx on english.curriculum_unit_events(curriculum_id, created_at, id);
create index if not exists curriculum_unit_events_learner_idx on english.curriculum_unit_events(learner_id);

-- 2f. Unit đã dạy trong một buổi (eng_write_lesson_note_v3). Trỏ tới Unit của phiên bản đang dùng LÚC GHI.
create table if not exists english.lesson_note_units (
  lesson_note_id uuid not null references english.lesson_notes(id),
  learner_id uuid not null references english.learners(id),
  curriculum_id uuid not null references english.curricula(id),
  version_id uuid not null,
  unit_code text not null,
  primary key (lesson_note_id, curriculum_id, unit_code),
  foreign key (version_id, unit_code) references english.curriculum_units(version_id, code)
);
create index if not exists lesson_note_units_learner_idx on english.lesson_note_units(learner_id);
create index if not exists lesson_note_units_curriculum_idx on english.lesson_note_units(curriculum_id);

-- 3. Bảo vệ -------------------------------------------------------------------------------------------------------------------------------

-- 3a. Chỉ thêm (theo hướng dẫn đầu 0004): purge đi qua được nhờ 'learner_id'.
do $$
declare
  t text;
begin
  foreach t in array array['curricula', 'curriculum_units', 'curriculum_unit_points', 'curriculum_unit_events', 'lesson_note_units'] loop
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

-- 3b. Unit và dòng nối chỉ thêm được vào phiên bản ĐANG được duyệt (status 'draft' trong eng_approve_curriculum_version); phiên bản
-- đã duyệt không nhận thêm dòng nào (bất biến DOMAIN §7.2).
create or replace function english.eng_check_curriculum_row() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (
    select 1 from english.curriculum_versions v
    where v.id = new.version_id and v.status = 'draft' and v.learner_id = new.learner_id
      and (tg_table_name <> 'curriculum_units' or v.curriculum_id = (pg_catalog.to_jsonb(new) ->> 'curriculum_id')::uuid)) then
    raise exception 'english.%: rows are added only while their version is being approved', tg_table_name using errcode = '42501';
  end if;
  return new;
end
$$;
revoke execute on function english.eng_check_curriculum_row() from public, anon, authenticated, service_role;
drop trigger if exists curriculum_units_check_row on english.curriculum_units;
create trigger curriculum_units_check_row before insert on english.curriculum_units for each row execute function english.eng_check_curriculum_row();
drop trigger if exists curriculum_unit_points_check_row on english.curriculum_unit_points;
create trigger curriculum_unit_points_check_row before insert on english.curriculum_unit_points for each row execute function english.eng_check_curriculum_row();

-- 3c. Phiên bản: sửa khi còn là nháp, đúng các bước chuyển; đã duyệt chỉ được chuyển sang "thay bằng vN+1"; xóa chỉ trong purge.
create or replace function english.eng_guard_curriculum_version() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_purge text := nullif(pg_catalog.current_setting('app.purge_learner', true), '');
  v_owner text;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'english.curriculum_versions: TRUNCATE is forbidden' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if v_purge is not null and old.learner_id::text = v_purge then
      select r.rolname into v_owner
      from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
      where p.oid = pg_catalog.to_regprocedure('english.eng_purge_learner(uuid,uuid)');
      if v_owner is not null and current_user = v_owner then return old; end if;
    end if;
    raise exception 'english.curriculum_versions: DELETE is forbidden (discard the draft instead)' using errcode = '42501';
  end if;
  if new.id <> old.id or new.curriculum_id <> old.curriculum_id or new.learner_id <> old.learner_id or new.version <> old.version
     or new.source <> old.source or new.toc_file_id is distinct from old.toc_file_id or new.created_by_member <> old.created_by_member
     or new.created_at <> old.created_at or new.client_id <> old.client_id or new.supersedes_version_id is distinct from old.supersedes_version_id
     or (old.ai_payload is not null and new.ai_payload is distinct from old.ai_payload) then
    raise exception 'english.curriculum_versions: owner, file, origin, version number and the AI draft never change' using errcode = '42501';
  end if;
  if old.status in ('superseded', 'discarded') then
    raise exception 'english.curriculum_versions: a superseded or discarded version cannot change' using errcode = '42501';
  end if;
  if old.status = 'approved' then
    if new.status <> 'superseded' or new.payload is distinct from old.payload or new.review is distinct from old.review
       or new.approved_at is distinct from old.approved_at or new.approved_by_member is distinct from old.approved_by_member
       or new.ai_run_id is distinct from old.ai_run_id then
      raise exception 'english.curriculum_versions: an approved version is immutable (make a new version instead)' using errcode = '42501';
    end if;
    return new;
  end if;
  if not (new.status = old.status
          or (old.status = 'extracting' and new.status in ('draft', 'ai_failed', 'discarded'))
          or (old.status in ('ai_failed', 'draft') and new.status in ('draft', 'approved', 'discarded'))) then
    raise exception 'english.curriculum_versions: % → % is not allowed', old.status, new.status using errcode = '23514';
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;
revoke execute on function english.eng_guard_curriculum_version() from public, anon, authenticated, service_role;
drop trigger if exists curriculum_versions_guard on english.curriculum_versions;
create trigger curriculum_versions_guard before update or delete on english.curriculum_versions
  for each row execute function english.eng_guard_curriculum_version();
drop trigger if exists curriculum_versions_guard_truncate on english.curriculum_versions;
create trigger curriculum_versions_guard_truncate before truncate on english.curriculum_versions
  for each statement execute function english.eng_guard_curriculum_version();

-- 3d. RLS: người lớn của ĐÚNG em đọc (eng_is_staff_of); học sinh không đọc gì; không ai ghi thẳng.
alter table english.curricula enable row level security;
alter table english.curriculum_versions enable row level security;
alter table english.curriculum_units enable row level security;
alter table english.curriculum_unit_points enable row level security;
alter table english.curriculum_unit_events enable row level security;
alter table english.lesson_note_units enable row level security;
revoke all on english.curricula, english.curriculum_versions, english.curriculum_units, english.curriculum_unit_points,
  english.curriculum_unit_events, english.lesson_note_units from public, anon, authenticated;
revoke insert, update, delete, truncate on english.curricula, english.curriculum_versions, english.curriculum_units, english.curriculum_unit_points,
  english.curriculum_unit_events, english.lesson_note_units from service_role;
grant select on english.curricula, english.curriculum_versions, english.curriculum_units, english.curriculum_unit_points,
  english.curriculum_unit_events, english.lesson_note_units to authenticated;
do $$
declare
  t text;
begin
  foreach t in array array['curricula', 'curriculum_versions', 'curriculum_units', 'curriculum_unit_points', 'curriculum_unit_events', 'lesson_note_units'] loop
    execute format('drop policy if exists %I on english.%I', t || '_select', t);
    execute format('create policy %I on english.%I for select to authenticated using (english.eng_is_staff_of(learner_id))', t || '_select', t);
  end loop;
end
$$;

insert into english.schema_migrations(version) values ('0026') on conflict do nothing;
