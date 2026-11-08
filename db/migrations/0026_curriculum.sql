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

-- 4. Ghi (service_role sau requireAccess; hàm kiểm lại người thao tác) ------------------------------------------------------------------

-- Nội bộ: người lớn được làm việc giáo trình của em (gia sư còn quan hệ hoặc phụ huynh của gia đình). Trả member, không thì 42501.
create or replace function english.eng_curriculum_actor(p_by uuid, p_learner uuid, p_fn text) returns english.members
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_m english.members%rowtype;
begin
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception '%: this member may not change the curricula of this learner', p_fn using errcode = '42501';
  end if;
  return v_m;
end
$$;
revoke execute on function english.eng_curriculum_actor(uuid, uuid, text) from public, anon, authenticated, service_role;

-- 4a. Thêm giáo trình + phiên bản 1 (gia sư HOẶC phụ huynh của em). p_extract = true → 'extracting' (máy chủ đã qua cổng AI; cần file
-- mục lục), false → nháp trống ("Soạn tay"). Gửi lại cùng client_id = cùng giáo trình.
create or replace function english.eng_create_curriculum(
  p_learner uuid, p_title text, p_level_note text, p_toc_file jsonb, p_extract boolean, p_by uuid, p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_m english.members%rowtype;
  v_title text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  v_note text := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_level_note, '')), '\s+', ' ', 'g'), '');
  v_prev english.curricula%rowtype;
  v_file uuid;
  v_cid uuid;
  v_vid uuid;
  v_status text;
begin
  if p_learner is null or p_extract is null or p_by is null then
    raise exception 'eng_create_curriculum: learner, mode and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_create_curriculum: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if pg_catalog.length(v_title) not between 1 and 160 then
    raise exception 'eng_create_curriculum: a title of 1..160 characters is required (bad_title)' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 200 then
    raise exception 'eng_create_curriculum: the level note is at most 200 characters (bad_level_note)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_create_curriculum: learner not found' using errcode = 'P0002';
  end if;
  v_m := english.eng_curriculum_actor(p_by, p_learner, 'eng_create_curriculum');
  select * into v_prev from english.curricula c where c.learner_id = p_learner and c.client_id = p_client_id;
  if found then
    if v_prev.title <> v_title then
      raise exception 'eng_create_curriculum: client_id was already used for another curriculum' using errcode = '23505';
    end if;
    select v.id, v.status into v_vid, v_status from english.curriculum_versions v where v.curriculum_id = v_prev.id and v.version = 1;
    return pg_catalog.jsonb_build_object('curriculum_id', v_prev.id, 'version_id', v_vid, 'status', v_status, 'replayed', true);
  end if;
  if p_extract and p_toc_file is null then
    raise exception 'eng_create_curriculum: AI needs the table of contents (toc_file_required)' using errcode = '22023';
  end if;
  if p_toc_file is not null then
    v_file := english.eng_register_file(v_l.family_id, p_learner, 'curriculum_toc', p_toc_file, p_by);
  end if;
  insert into english.curricula(family_id, learner_id, track_id, title, level_note, created_by_member, client_id)
  values (v_l.family_id, p_learner, v_l.track_id, v_title, v_note, p_by, p_client_id)
  returning id into v_cid;
  v_status := case when p_extract then 'extracting' else 'draft' end;
  insert into english.curriculum_versions(curriculum_id, learner_id, version, source, status, toc_file_id, created_by_member, updated_by_member, client_id)
  values (v_cid, p_learner, 1, case when p_extract then 'ai' else 'manual' end, v_status, v_file, p_by, p_by, p_client_id)
  returning id into v_vid;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'curriculum.created', v_l.family_id, p_learner,
          pg_catalog.jsonb_build_object('curriculum', v_cid, 'version', v_vid, 'extract', p_extract));
  return pg_catalog.jsonb_build_object('curriculum_id', v_cid, 'version_id', v_vid, 'status', v_status, 'replayed', false);
end
$$;

-- 4b. "Nạp mục lục" cho giáo trình đã có (bản 1 đã bỏ, hoặc đọc lại cả mục lục): phiên bản mới vN+1 từ PDF (AI) hoặc trống (Soạn tay).
-- Đã có nháp mở → trả nháp đó. Bản đang dùng (nếu có) vẫn dùng cho tới khi bản mới được duyệt.
create or replace function english.eng_add_curriculum_version(p_curriculum uuid, p_toc_file jsonb, p_extract boolean, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_c english.curricula%rowtype;
  v_prev english.curriculum_versions%rowtype;
  v_open english.curriculum_versions%rowtype;
  v_file uuid;
  v_id uuid;
  v_status text;
begin
  if p_curriculum is null or p_extract is null or p_by is null then
    raise exception 'eng_add_curriculum_version: curriculum, mode and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_add_curriculum_version: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select * into v_c from english.curricula c where c.id = p_curriculum for update;
  if not found then
    raise exception 'eng_add_curriculum_version: curriculum not found' using errcode = 'P0002';
  end if;
  perform english.eng_curriculum_actor(p_by, v_c.learner_id, 'eng_add_curriculum_version');
  select * into v_prev from english.curriculum_versions v where v.learner_id = v_c.learner_id and v.client_id = p_client_id;
  if found then
    if v_prev.curriculum_id <> p_curriculum then
      raise exception 'eng_add_curriculum_version: client_id was already used for another curriculum' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('version_id', v_prev.id, 'status', v_prev.status, 'replayed', true);
  end if;
  select * into v_open from english.curriculum_versions v where v.curriculum_id = p_curriculum and v.status in ('extracting', 'ai_failed', 'draft');
  if found then
    return pg_catalog.jsonb_build_object('version_id', v_open.id, 'status', v_open.status, 'replayed', true);
  end if;
  if p_extract and p_toc_file is null then
    raise exception 'eng_add_curriculum_version: AI needs the table of contents (toc_file_required)' using errcode = '22023';
  end if;
  if p_toc_file is not null then
    v_file := english.eng_register_file(v_c.family_id, v_c.learner_id, 'curriculum_toc', p_toc_file, p_by);
  end if;
  v_status := case when p_extract then 'extracting' else 'draft' end;
  insert into english.curriculum_versions(curriculum_id, learner_id, version, source, status, toc_file_id, supersedes_version_id, created_by_member, updated_by_member, client_id)
  values (p_curriculum, v_c.learner_id, (select pg_catalog.max(v.version) + 1 from english.curriculum_versions v where v.curriculum_id = p_curriculum),
          case when p_extract then 'ai' else 'manual' end, v_status, v_file,
          (select v.id from english.curriculum_versions v where v.curriculum_id = p_curriculum and v.status = 'approved'), p_by, p_by, p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('version_id', v_id, 'status', v_status, 'replayed', false);
end
$$;

-- 4c. "Sửa mục lục / bảng nối" sau khi duyệt = nháp phiên bản mới, chép từ bản đang dùng (mã Unit giữ nguyên). Đã có nháp mở → trả nháp đó.
create or replace function english.eng_edit_curriculum(p_curriculum uuid, p_by uuid, p_client_id text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_c english.curricula%rowtype;
  v_cur english.curriculum_versions%rowtype;
  v_open uuid;
  v_id uuid;
  v_payload jsonb;
begin
  if p_curriculum is null or p_by is null or p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) not between 8 and 100 then
    raise exception 'eng_edit_curriculum: curriculum, actor and client_id are required' using errcode = '22004';
  end if;
  select * into v_c from english.curricula c where c.id = p_curriculum for update;
  if not found then
    raise exception 'eng_edit_curriculum: curriculum not found' using errcode = 'P0002';
  end if;
  perform english.eng_curriculum_actor(p_by, v_c.learner_id, 'eng_edit_curriculum');
  select v.id into v_open from english.curriculum_versions v
  where v.curriculum_id = p_curriculum and v.status in ('extracting', 'ai_failed', 'draft');
  if v_open is not null then
    return pg_catalog.jsonb_build_object('id', v_open, 'replayed', true);
  end if;
  select * into v_cur from english.curriculum_versions v where v.curriculum_id = p_curriculum and v.status = 'approved';
  if not found then
    raise exception 'eng_edit_curriculum: there is no approved version to edit (not_approved)' using errcode = '23514';
  end if;
  v_payload := pg_catalog.jsonb_build_object(
    'units', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'code', u.code, 'title', u.title, 'section', u.section, 'page', u.page, 'skipped', u.skipped,
               'points', coalesce((select pg_catalog.jsonb_agg(p.tag_key order by p.ord) from english.curriculum_unit_points p
                                   where p.version_id = u.version_id and p.code = u.code), '[]'::jsonb),
               'missing_points', '[]'::jsonb, 'needs_review', false, 'review_reason', null, 'origin', 'kept', 'dropped', false, 'edit_reason', null)
             order by u.ord)
      from english.curriculum_units u where u.version_id = v_cur.id), '[]'::jsonb),
    'ignored', '[]'::jsonb);
  insert into english.curriculum_versions(curriculum_id, learner_id, version, source, status, payload, supersedes_version_id, created_by_member, updated_by_member, client_id)
  values (p_curriculum, v_c.learner_id, (select pg_catalog.max(v.version) + 1 from english.curriculum_versions v where v.curriculum_id = p_curriculum),
          'edit', 'draft', v_payload, v_cur.id, p_by, p_by, p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- 4d. Lưu nháp (nội dung đã được zod kiểm ở máy chủ). Khóa lạc quan theo updated_at (eng_same_instant của 0024).
create or replace function english.eng_save_curriculum_draft(p_version uuid, p_payload jsonb, p_base text, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_v english.curriculum_versions%rowtype;
  v_at timestamptz;
begin
  if p_version is null or p_payload is null or p_base is null or p_by is null then
    raise exception 'eng_save_curriculum_draft: version, payload, base and actor are required' using errcode = '22004';
  end if;
  select * into v_v from english.curriculum_versions v where v.id = p_version for update;
  if not found then
    raise exception 'eng_save_curriculum_draft: version not found' using errcode = 'P0002';
  end if;
  perform english.eng_curriculum_actor(p_by, v_v.learner_id, 'eng_save_curriculum_draft');
  if v_v.status not in ('draft', 'ai_failed') then
    raise exception 'eng_save_curriculum_draft: this version cannot be edited now (not_editable)' using errcode = '23514';
  end if;
  if not english.eng_same_instant(v_v.updated_at, p_base) then
    raise exception 'eng_save_curriculum_draft: the draft changed in the meantime (draft_changed)' using errcode = '23505';
  end if;
  update english.curriculum_versions set payload = p_payload, status = 'draft', error_code = null, updated_by_member = p_by
  where id = p_version
  returning updated_at into v_at;
  return pg_catalog.jsonb_build_object('updated_at', v_at::text);
end
$$;

-- 4e. Kết thúc phần AI (máy chủ, chạy nền). Chỉ đổi phiên bản còn 'extracting'. ai_payload = bản AI, giữ để đếm % dòng bị sửa.
create or replace function english.eng_finish_curriculum_extraction(p_version uuid, p_payload jsonb, p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n int;
begin
  update english.curriculum_versions set payload = p_payload, ai_payload = p_payload, status = 'draft', ai_run_id = p_run, error_code = null
  where id = p_version and status = 'extracting';
  get diagnostics v_n = row_count;
  return pg_catalog.jsonb_build_object('applied', v_n = 1);
end
$$;

create or replace function english.eng_fail_curriculum_extraction(p_version uuid, p_error text, p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n int;
begin
  if p_error is null or p_error !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'eng_fail_curriculum_extraction: error code required' using errcode = '22023';
  end if;
  update english.curriculum_versions set status = 'ai_failed', error_code = p_error, ai_run_id = coalesce(p_run, ai_run_id)
  where id = p_version and status = 'extracting';
  get diagnostics v_n = row_count;
  return pg_catalog.jsonb_build_object('applied', v_n = 1);
end
$$;

-- 4f. Bỏ nháp: gia sư HOẶC phụ huynh (D-W8: phụ huynh không duyệt thay, chỉ được bỏ; gia sư đã nghỉ không bỏ được — §8).
create or replace function english.eng_discard_curriculum_draft(p_version uuid, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_v english.curriculum_versions%rowtype;
begin
  select * into v_v from english.curriculum_versions v where v.id = p_version for update;
  if not found then
    raise exception 'eng_discard_curriculum_draft: version not found' using errcode = 'P0002';
  end if;
  perform english.eng_curriculum_actor(p_by, v_v.learner_id, 'eng_discard_curriculum_draft');
  if v_v.status not in ('extracting', 'ai_failed', 'draft') then
    raise exception 'eng_discard_curriculum_draft: this version is already final (not_editable)' using errcode = '23514';
  end if;
  update english.curriculum_versions set status = 'discarded', updated_by_member = p_by where id = p_version;
  return pg_catalog.jsonb_build_object('id', p_version, 'status', 'discarded');
end
$$;

-- 4g. DUYỆT (chỉ gia sư của em — D-W8). p_units = danh sách Unit cuối (máy chủ dựng từ nháp đã lưu, bỏ dòng "Bỏ"):
-- [{code, title, section, page, skipped, points:[tag_key]}]. Kiểm lại ở đây: mã, thứ tự, nhãn trong danh sách đóng; nháp không còn dòng
-- "cần xem". Sinh Unit + nối; bản đang dùng (nếu có) → 'superseded'.
create or replace function english.eng_approve_curriculum_version(p_version uuid, p_base text, p_units jsonb, p_review jsonb, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_v english.curriculum_versions%rowtype;
  v_c english.curricula%rowtype;
  v_m english.members%rowtype;
  v_u jsonb;
  v_o int;
  v_key text;
  v_n int;
begin
  if p_version is null or p_base is null or p_units is null or p_by is null then
    raise exception 'eng_approve_curriculum_version: version, base, units and actor are required' using errcode = '22004';
  end if;
  select * into v_v from english.curriculum_versions v where v.id = p_version for update;
  if not found then
    raise exception 'eng_approve_curriculum_version: version not found' using errcode = 'P0002';
  end if;
  select * into v_c from english.curricula c where c.id = v_v.curriculum_id for update;
  select * into v_m from english.members m where m.id = p_by;
  if v_m.id is null or v_m.role <> 'tutor' or not english.eng_actor_may_manage(p_by, v_v.learner_id) then
    raise exception 'eng_approve_curriculum_version: only a tutor of this learner approves a curriculum (tutor_only)' using errcode = '42501';
  end if;
  if v_v.status <> 'draft' then
    raise exception 'eng_approve_curriculum_version: only a saved draft is approved (not_draft)' using errcode = '23514';
  end if;
  if not english.eng_same_instant(v_v.updated_at, p_base) then
    raise exception 'eng_approve_curriculum_version: the draft changed in the meantime (draft_changed)' using errcode = '23505';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(v_v.payload -> 'units') x
             where coalesce((x ->> 'needs_review')::boolean, false) and not coalesce((x ->> 'dropped')::boolean, false)) then
    raise exception 'eng_approve_curriculum_version: some rows still need a look (needs_review_left)' using errcode = '23514';
  end if;
  if pg_catalog.jsonb_typeof(p_units) <> 'array' or pg_catalog.jsonb_array_length(p_units) not between 1 and 300 then
    raise exception 'eng_approve_curriculum_version: 1..300 units are required (bad_units)' using errcode = '22023';
  end if;
  if p_review is not null and (pg_catalog.jsonb_typeof(p_review) <> 'object' or pg_catalog.length(p_review::text) > 4000) then
    raise exception 'eng_approve_curriculum_version: review must be a small object (bad_review)' using errcode = '22023';
  end if;
  for v_u, v_o in select x, o from pg_catalog.jsonb_array_elements(p_units) with ordinality as t(x, o) loop
    if pg_catalog.jsonb_typeof(v_u) <> 'object'
       or coalesce(v_u ->> 'code', '') !~ '^[A-Z0-9][A-Z0-9-]{0,19}$'
       or pg_catalog.length(pg_catalog.btrim(coalesce(v_u ->> 'title', ''))) not between 1 and 160
       or (v_u -> 'page' is not null and pg_catalog.jsonb_typeof(v_u -> 'page') <> 'null'
           and (pg_catalog.jsonb_typeof(v_u -> 'page') <> 'number' or (v_u ->> 'page') !~ '^[0-9]{1,4}$'))
       or pg_catalog.jsonb_typeof(v_u -> 'skipped') is distinct from 'boolean'
       or pg_catalog.jsonb_typeof(v_u -> 'points') is distinct from 'array'
       or pg_catalog.jsonb_array_length(v_u -> 'points') > 12 then
      raise exception 'eng_approve_curriculum_version: unit % is not {code, title, section, page, skipped, points}', v_o using errcode = '22023';
    end if;
    if (select pg_catalog.count(distinct x) from pg_catalog.jsonb_array_elements_text(v_u -> 'points') x) <> pg_catalog.jsonb_array_length(v_u -> 'points') then
      raise exception 'eng_approve_curriculum_version: a point appears twice in unit % (duplicate_point)', v_u ->> 'code' using errcode = '23514';
    end if;
    for v_key in select x from pg_catalog.jsonb_array_elements_text(v_u -> 'points') x loop
      if not english.eng_tag_exists(v_c.track_id, v_c.family_id, v_key) then
        raise exception 'eng_approve_curriculum_version: a point of unit % is not in the list (unknown_point)', v_u ->> 'code' using errcode = '23514';
      end if;
    end loop;
  end loop;
  if (select pg_catalog.count(distinct x ->> 'code') from pg_catalog.jsonb_array_elements(p_units) x) <> pg_catalog.jsonb_array_length(p_units) then
    raise exception 'eng_approve_curriculum_version: unit codes must be unique (duplicate_code)' using errcode = '23514';
  end if;

  insert into english.curriculum_units(version_id, curriculum_id, learner_id, code, ord, title, section, page, skipped)
  select p_version, v_v.curriculum_id, v_v.learner_id, x ->> 'code', o::int, pg_catalog.btrim(x ->> 'title'),
         nullif(pg_catalog.btrim(coalesce(x ->> 'section', '')), ''), (x ->> 'page')::int, (x ->> 'skipped')::boolean
  from pg_catalog.jsonb_array_elements(p_units) with ordinality as t(x, o);
  insert into english.curriculum_unit_points(version_id, code, learner_id, tag_key, ord)
  select p_version, x ->> 'code', v_v.learner_id, k, ko::int
  from pg_catalog.jsonb_array_elements(p_units) as t(x)
  cross join lateral pg_catalog.jsonb_array_elements_text(x -> 'points') with ordinality as p(k, ko);

  update english.curriculum_versions set status = 'superseded', superseded_at = pg_catalog.clock_timestamp()
  where curriculum_id = v_v.curriculum_id and status = 'approved';
  update english.curriculum_versions
  set status = 'approved', approved_by_member = p_by, approved_at = pg_catalog.clock_timestamp(), review = p_review, updated_by_member = p_by
  where id = p_version;
  select pg_catalog.jsonb_array_length(p_units) into v_n;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_m.user_id, v_m.role, 'curriculum.approved', v_c.family_id, v_v.learner_id,
          pg_catalog.jsonb_build_object('curriculum', v_c.id, 'version', v_v.version, 'units', v_n));
  return pg_catalog.jsonb_build_object('version_id', p_version, 'version', v_v.version, 'units', v_n);
end
$$;

-- 4h. Đặt trạng thái một Unit (gia sư hoặc phụ huynh): một sự kiện mới, không xóa sự kiện cũ (§8 "sửa nhầm → đặt lại").
-- Mã Unit phải có trong phiên bản đang dùng. p_lesson_note: buổi học đã đề xuất việc này (tùy chọn, phải của em).
create or replace function english.eng_set_unit_status(
  p_curriculum uuid, p_unit_code text, p_status text, p_lesson_note uuid, p_by uuid, p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_c english.curricula%rowtype;
  v_m english.members%rowtype;
  v_cur uuid;
  v_prev english.curriculum_unit_events%rowtype;
  v_id uuid;
begin
  if p_curriculum is null or p_unit_code is null or p_status is null or p_by is null then
    raise exception 'eng_set_unit_status: curriculum, unit, status and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_set_unit_status: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if p_status not in ('not_started', 'in_progress', 'done', 'skipped') then
    raise exception 'eng_set_unit_status: unknown status (bad_status)' using errcode = '22023';
  end if;
  select * into v_c from english.curricula c where c.id = p_curriculum;
  if not found then
    raise exception 'eng_set_unit_status: curriculum not found' using errcode = 'P0002';
  end if;
  v_m := english.eng_curriculum_actor(p_by, v_c.learner_id, 'eng_set_unit_status');
  select * into v_prev from english.curriculum_unit_events e where e.learner_id = v_c.learner_id and e.client_id = p_client_id;
  if found then
    if v_prev.curriculum_id <> p_curriculum or v_prev.unit_code <> p_unit_code or v_prev.status <> p_status then
      raise exception 'eng_set_unit_status: client_id was already used for another change' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_prev.id, 'replayed', true);
  end if;
  select v.id into v_cur from english.curriculum_versions v where v.curriculum_id = p_curriculum and v.status = 'approved';
  if v_cur is null then
    raise exception 'eng_set_unit_status: the curriculum has no approved version yet (not_approved)' using errcode = '23514';
  end if;
  if not exists (select 1 from english.curriculum_units u where u.version_id = v_cur and u.code = p_unit_code) then
    raise exception 'eng_set_unit_status: the unit is not in the current version (unknown_unit)' using errcode = '23514';
  end if;
  if p_lesson_note is not null and not exists (select 1 from english.lesson_notes n where n.id = p_lesson_note and n.learner_id = v_c.learner_id) then
    raise exception 'eng_set_unit_status: lesson note not found' using errcode = 'P0002';
  end if;
  insert into english.curriculum_unit_events(curriculum_id, learner_id, unit_code, status, lesson_note_id, by_member, by_role, client_id)
  values (p_curriculum, v_c.learner_id, p_unit_code, p_status, p_lesson_note, p_by, v_m.role, p_client_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'eng_create_curriculum(uuid, text, text, jsonb, boolean, uuid, text)',
    'eng_add_curriculum_version(uuid, jsonb, boolean, uuid, text)',
    'eng_edit_curriculum(uuid, uuid, text)',
    'eng_save_curriculum_draft(uuid, jsonb, text, uuid)',
    'eng_finish_curriculum_extraction(uuid, jsonb, uuid)',
    'eng_fail_curriculum_extraction(uuid, text, uuid)',
    'eng_discard_curriculum_draft(uuid, uuid)',
    'eng_approve_curriculum_version(uuid, text, jsonb, jsonb, uuid)',
    'eng_set_unit_status(uuid, text, text, uuid, uuid, text)'
  ] loop
    execute format('revoke execute on function english.%s from public, anon, authenticated', f);
    execute format('grant execute on function english.%s to service_role', f);
  end loop;
end
$$;

insert into english.schema_migrations(version) values ('0026') on conflict do nothing;
