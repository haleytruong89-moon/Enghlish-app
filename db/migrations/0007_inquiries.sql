-- 0007_inquiries.sql
-- S2: nguồn, mẫu chủ đề (inquiry template) có version, bài được giao kèm snapshot, lịch từng bước
-- (DESIGN §4, §5, §7; plan docs/plans/s2-inquiries.md). Dữ liệu 10 mẫu nằm ở file sinh tự động
-- 0008 (từ content/inquiries/*.json).
--
-- Nguyên tắc an toàn:
--  * Học sinh KHÔNG BAO GIỜ đọc được đáp án / lời giải / kịch bản của gia sư — kể cả gọi REST trực tiếp:
--    những thứ đó nằm ở bảng riêng (template_item_keys, instance_item_keys, source_transcripts) chỉ
--    phụ huynh / gia sư đọc được; phần học sinh đọc được (steps, snapshot) bị CHECK chặn không cho
--    chứa các khóa answer / explanation_vi / prompt_vi.
--  * Mẫu và nguồn đã công bố thì bất biến; bài đã giao (instances) chỉ thêm, không sửa.
--  * Ghi dữ liệu chỉ qua eng_assign_inquiry / eng_activity_event (service role sau requireAccess).
-- Không đụng schema public. Idempotent. Grant theo từng bảng.

-- Hàm quyền bổ sung ----------------------------------------------------------------------------
-- Phụ huynh, hoặc gia sư còn ít nhất một quan hệ hiệu lực (không phải học sinh).
create or replace function english.eng_is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select
      m.role = 'parent'
      or (m.role = 'tutor' and exists (
        select 1 from english.relationships r
        where r.member_id = m.id
          and r.valid_from <= now()
          and (r.valid_to is null or r.valid_to > now())))
    from english.members m where m.user_id = auth.uid()
  ), false)
$$;

-- Phụ huynh / gia sư được phép đọc learner này (học sinh thì không bao giờ).
create or replace function english.eng_is_staff_of(p_learner_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select english.eng_is_staff() and english.eng_can_read_learner(p_learner_id)
$$;

revoke execute on function english.eng_is_staff() from public, anon;
revoke execute on function english.eng_is_staff_of(uuid) from public, anon;
grant execute on function english.eng_is_staff() to authenticated, service_role;
grant execute on function english.eng_is_staff_of(uuid) to authenticated, service_role;

-- Nội bộ cho các hàm ghi: member này có quyền giao bài / đổi lịch cho learner này không?
-- Phụ huynh của gia đình learner, hoặc gia sư có quan hệ còn hiệu lực với learner. Học sinh: không.
create or replace function english.eng_actor_may_manage(p_member uuid, p_learner uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from english.members m
    join english.learners l on l.id = p_learner
    where m.id = p_member
      and (
        (m.role = 'parent' and m.family_id = l.family_id)
        or (m.role = 'tutor' and exists (
          select 1 from english.relationships r
          where r.member_id = m.id
            and r.learner_id = l.id
            and r.relation = 'tutor'
            and r.valid_from <= now()
            and (r.valid_to is null or r.valid_to > now())))
      )
  )
$$;
revoke execute on function english.eng_actor_may_manage(uuid, uuid) from public, anon, authenticated;

-- Phạm vi theo track: người gọi là phụ huynh (của gia đình) hoặc gia sư (quan hệ còn hiệu lực) của ÍT NHẤT MỘT
-- learner thuộc track này. Dùng cho RLS của mẫu / nguồn / khóa đáp án của mẫu: gia sư của một em Track A không
-- đọc được khóa, lời thoại hay bài đọc của mẫu Track B (và ngược lại); phụ huynh gia đình khác thì không đọc gì.
-- Học sinh: không bao giờ.
create or replace function english.eng_staff_has_track(p_track text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from english.members m
    join english.learners l on l.track_id = p_track
    where m.user_id = auth.uid()
      and (
        (m.role = 'parent' and l.family_id = m.family_id)
        or (m.role = 'tutor' and exists (
          select 1 from english.relationships r
          where r.member_id = m.id
            and r.learner_id = l.id
            and r.valid_from <= now()
            and (r.valid_to is null or r.valid_to > now())))
      )
  )
$$;

revoke execute on function english.eng_staff_has_track(text) from public, anon;
grant execute on function english.eng_staff_has_track(text) to authenticated, service_role;

-- sources: bất biến theo (id, version) -------------------------------------------------------
-- body: bài đọc (chỉ phụ huynh/gia sư đọc được qua bảng này; học sinh nhận bài đọc ở S3 qua đường phát hành theo ngày).
-- Bài nghe: lời thoại nằm ở source_transcripts (chỉ phụ huynh/gia sư).
-- Video: chỉ là liên kết (O-F1 mặc định) — app không nhúng trình phát.
create table if not exists english.sources (
  id text not null check (id ~ '^[A-Za-z0-9_.-]+$'),
  version int not null check (version > 0),
  title text not null check (length(btrim(title)) > 0),
  url text check (url is null or url ~ '^https?://\S+$'),
  author text not null check (length(btrim(author)) > 0),
  rights_note text not null check (length(btrim(rights_note)) > 0),
  modality text not null check (modality in ('text', 'audio', 'video')),
  body text,
  source_hash text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (id, version),
  constraint sources_body_only_for_text check (
    (modality = 'text' and body is not null and length(btrim(body)) > 0) or (modality <> 'text' and body is null)),
  constraint sources_video_is_a_link check (modality <> 'video' or url is not null)
);

create table if not exists english.source_transcripts (
  source_id text not null,
  source_version int not null,
  transcript text not null check (length(btrim(transcript)) > 0),
  primary key (source_id, source_version),
  foreign key (source_id, source_version) references english.sources(id, version)
);

-- inquiry_templates: bất biến sau khi công bố -------------------------------------------------------
-- steps / sources: phần học sinh được thấy (không đáp án). Đáp án nằm ở template_item_keys.
create table if not exists english.inquiry_templates (
  id text not null check (id ~ '^[AB]-W[0-9]+-[A-Z0-9-]+$'),
  version int not null check (version > 0),
  track_id text not null references english.tracks(id),
  title_vi text not null check (length(btrim(title_vi)) > 0),
  big_question_en text not null check (length(btrim(big_question_en)) > 0),
  big_question_vi text not null check (length(btrim(big_question_vi)) > 0),
  week int not null check (week >= 0),
  date_from date not null,
  date_to date not null,
  domain_bucket text not null check (length(btrim(domain_bucket)) > 0),
  target_ids text[] not null check (cardinality(target_ids) > 0),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) > 0),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  catalogue_version text not null references english.catalogue_versions(version),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  source_hash text not null,
  created_at timestamptz not null default now(),
  primary key (id, version),
  constraint inquiry_templates_dates check (date_to >= date_from),
  constraint inquiry_templates_status check ((status = 'published') = (published_at is not null)),
  constraint inquiry_templates_student_safe check (
    not jsonb_path_exists(steps, '$.**.answer')
    and not jsonb_path_exists(steps, '$.**.explanation_vi')
    and not jsonb_path_exists(steps, '$.**.prompt_vi')
    and not jsonb_path_exists(steps, '$.**.review_note')
    and not jsonb_path_exists(sources, '$.**.text')
    and not jsonb_path_exists(sources, '$.**.body')
    and not jsonb_path_exists(sources, '$.**.transcript'))
);
create index if not exists inquiry_templates_track_idx on english.inquiry_templates(track_id, week);

-- template_item_keys: STAFF-ONLY. kind: answer (câu đóng, S3 tự chấm), sealed (đáp án mẫu câu mở — chỉ
-- cho gia sư xem SAU khi học sinh làm; S5 thực thi), note (kịch bản / gợi ý của gia sư cho cả bước).
create table if not exists english.template_item_keys (
  template_id text not null,
  template_version int not null,
  item_id text not null check (item_id ~ '^[A-Za-z0-9_.:-]+$'),
  step_no int not null check (step_no > 0),
  kind text not null check (kind in ('answer', 'sealed', 'note')),
  answer text,
  explanation_vi text,
  primary key (template_id, template_version, item_id),
  foreign key (template_id, template_version) references english.inquiry_templates(id, version),
  constraint template_item_keys_answer_needed check (kind <> 'answer' or (answer is not null and length(btrim(answer)) > 0)),
  constraint template_item_keys_note_shape check ((kind = 'note') = (item_id like '%:note'))
);

-- Bất biến sau khi công bố ---------------------------------------------------------------------
-- (đã có english.eng_forbid_published_change ở 0005: 'self' = dòng có published_at)
drop trigger if exists sources_immutable on english.sources;
create trigger sources_immutable
  before update or delete on english.sources
  for each row execute function english.eng_forbid_published_change('self');

drop trigger if exists inquiry_templates_immutable on english.inquiry_templates;
create trigger inquiry_templates_immutable
  before update or delete on english.inquiry_templates
  for each row execute function english.eng_forbid_published_change('self');

-- Bảng con: cấm thêm/sửa/xóa khi bảng cha đã công bố.
create or replace function english.eng_forbid_published_parent_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text := tg_argv[0];
  v_id text;
  v_ver int;
  v_published boolean;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'english.%: TRUNCATE is forbidden on versioned content', tg_table_name
      using errcode = '42501';
  end if;

  if v_kind = 'template' then
    if tg_op = 'INSERT' then
      v_id := new.template_id; v_ver := new.template_version;
    else
      v_id := old.template_id; v_ver := old.template_version;
    end if;
    select t.published_at is not null into v_published
    from english.inquiry_templates t where t.id = v_id and t.version = v_ver;
  else
    if tg_op = 'INSERT' then
      v_id := new.source_id; v_ver := new.source_version;
    else
      v_id := old.source_id; v_ver := old.source_version;
    end if;
    select s.published_at is not null into v_published
    from english.sources s where s.id = v_id and s.version = v_ver;
  end if;

  if coalesce(v_published, false) then
    raise exception 'english.%: % is forbidden once the parent % %/% is published (publish a new version instead)',
      tg_table_name, tg_op, v_kind, v_id, v_ver
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
revoke execute on function english.eng_forbid_published_parent_change() from public, anon, authenticated;

drop trigger if exists source_transcripts_immutable on english.source_transcripts;
create trigger source_transcripts_immutable
  before insert or update or delete on english.source_transcripts
  for each row execute function english.eng_forbid_published_parent_change('source');

drop trigger if exists template_item_keys_immutable on english.template_item_keys;
create trigger template_item_keys_immutable
  before insert or update or delete on english.template_item_keys
  for each row execute function english.eng_forbid_published_parent_change('template');

do $$
declare
  t text;
begin
  foreach t in array array['sources', 'source_transcripts', 'inquiry_templates', 'template_item_keys'] loop
    execute format('drop trigger if exists %I on english.%I', t || '_immutable_truncate', t);
    execute format(
      'create trigger %I before truncate on english.%I for each statement execute function english.eng_forbid_published_change()',
      t || '_immutable_truncate', t);
  end loop;
end
$$;

-- Kiểm một mẫu khi tạo / sửa / công bố ------------------------------------------------------------
-- Luôn: kỹ năng (target hoặc chỉ số tổng hợp) có thật và đúng track; loại hoạt động có thật và dùng được
-- cho track; mode hợp lệ. Khi công bố: danh mục đã công bố; mọi target của bước nằm trong danh sách
-- "bài được tính" (evidence_tasks) của danh mục; nguồn có thật và đã công bố; mỗi câu hỏi có khóa đáp án.
create or replace function english.eng_check_inquiry_template() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_desc text;
  v_bad text;
begin
  select cv.descriptor_version into v_desc
  from english.catalogue_versions cv where cv.version = new.catalogue_version;

  if (select count(distinct x) from unnest(new.target_ids) as x) <> cardinality(new.target_ids) then
    raise exception 'inquiry template %/%: duplicate target ids', new.id, new.version using errcode = '23514';
  end if;

  select x into v_bad
  from unnest(new.target_ids) as x
  where not (
    exists (select 1 from english.targets t
            where t.id = x and t.descriptor_version = v_desc and t.track_id = new.track_id)
    or exists (select 1 from english.aggregate_indicators a
               where a.id = x and a.catalogue_version = new.catalogue_version and a.track_id = new.track_id))
  limit 1;
  if v_bad is not null then
    raise exception 'inquiry template %/%: % is not a target or tracking indicator of track % in catalogue %',
      new.id, new.version, v_bad, new.track_id, new.catalogue_version using errcode = '23514';
  end if;

  select x into v_bad
  from jsonb_array_elements(new.steps) as s, jsonb_array_elements_text(s -> 'target_ids') as x
  where not (
    exists (select 1 from english.targets t
            where t.id = x and t.descriptor_version = v_desc and t.track_id = new.track_id)
    or exists (select 1 from english.aggregate_indicators a
               where a.id = x and a.catalogue_version = new.catalogue_version and a.track_id = new.track_id))
  limit 1;
  if v_bad is not null then
    raise exception 'inquiry template %/%: step target % is not a target or tracking indicator of track % in catalogue %',
      new.id, new.version, v_bad, new.track_id, new.catalogue_version using errcode = '23514';
  end if;

  select s ->> 'activity_type' into v_bad
  from jsonb_array_elements(new.steps) as s
  where not exists (
    select 1 from english.activity_templates a
    where a.id = s ->> 'activity_type' and new.track_id = any (a.track_ids))
  limit 1;
  if v_bad is not null then
    raise exception 'inquiry template %/%: activity type % does not exist or is not used by track %',
      new.id, new.version, v_bad, new.track_id using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(new.steps) as s
    where coalesce(s ->> 'mode', '') not in ('PRACTICE', 'INDEPENDENT_CHECK', 'REVISION')
  ) then
    raise exception 'inquiry template %/%: every step needs mode PRACTICE, INDEPENDENT_CHECK or REVISION',
      new.id, new.version using errcode = '23514';
  end if;

  if new.published_at is not null then
    if not exists (
      select 1 from english.catalogue_versions cv
      where cv.version = new.catalogue_version and cv.published_at is not null
    ) then
      raise exception 'inquiry template %/%: catalogue % is not published yet', new.id, new.version, new.catalogue_version
        using errcode = '23514';
    end if;

    -- Danh sách "bài được tính" (evidence_tasks) của danh mục. Cách đọc một dòng (cùng luật với
    -- lib/config/inquiries.ts, parseEvidenceTask):
    --   "ACT-SOURCE-QA (reading)"                 → ACT-SOURCE-QA (bỏ chú thích trong ngoặc)
    --   "ACT-SOURCE-QA -> ACT-WRITE"              → ACT-WRITE (chuỗi: tính theo hoạt động CUỐI)
    --   "any activity tagged as transfer check"   → mọi hoạt động, nhưng chỉ ở bước có purpose transfer_check
    select (s ->> 'step_no') || ': ' || (s ->> 'activity_type') || ' / ' || x into v_bad
    from jsonb_array_elements(new.steps) as s, jsonb_array_elements_text(s -> 'target_ids') as x
    where exists (select 1 from english.targets t
                  where t.id = x and t.descriptor_version = v_desc and t.track_id = new.track_id)
      and not exists (
        select 1 from english.targets t, jsonb_array_elements_text(t.raw -> 'evidence_tasks') as e
        where t.id = x and t.descriptor_version = v_desc
          and (
            substring(regexp_replace(e, '\s*\([^)]*\)', '', 'g') from '.*(ACT-[A-Z0-9-]+)') = s ->> 'activity_type'
            or (e ~* '^\s*any activity tagged as transfer check'
                and coalesce(s -> 'purpose', '[]'::jsonb) @> '"transfer_check"'::jsonb)))
    limit 1;
    if v_bad is not null then
      raise exception 'inquiry template %/%: step % is not an evidence task of that target in the catalogue',
        new.id, new.version, v_bad using errcode = '23514';
    end if;

    select r ->> 'id' into v_bad
    from jsonb_array_elements(new.sources) as r
    where not exists (
      select 1 from english.sources s
      where s.id = r ->> 'id' and s.version = (r ->> 'version')::int and s.published_at is not null)
    limit 1;
    if v_bad is not null then
      raise exception 'inquiry template %/%: source % does not exist or is not published', new.id, new.version, v_bad
        using errcode = '23514';
    end if;

    select i ->> 'id' into v_bad
    from jsonb_array_elements(new.steps) as s, jsonb_array_elements(coalesce(s -> 'items', '[]'::jsonb)) as i
    where not exists (
      select 1 from english.template_item_keys k
      where k.template_id = new.id and k.template_version = new.version and k.item_id = i ->> 'id')
    limit 1;
    if v_bad is not null then
      raise exception 'inquiry template %/%: item % has no answer key row', new.id, new.version, v_bad
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;
revoke execute on function english.eng_check_inquiry_template() from public, anon, authenticated;

drop trigger if exists inquiry_templates_check on english.inquiry_templates;
create trigger inquiry_templates_check
  before insert or update on english.inquiry_templates
  for each row execute function english.eng_check_inquiry_template();

-- Bài được giao (append-only) ------------------------------------------------------------------------
-- assigned_by: id của english.members, KHÔNG có khóa ngoại (xóa tài khoản gia sư không được làm hỏng/chặn lịch sử).
create table if not exists english.inquiry_instances (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  template_id text not null,
  template_version int not null,
  snapshot jsonb not null,
  assigned_by uuid not null,
  assigned_at timestamptz not null default clock_timestamp(),
  due_on date not null,
  client_request_id text not null check (length(btrim(client_request_id)) >= 8),
  foreign key (template_id, template_version) references english.inquiry_templates(id, version),
  unique (learner_id, client_request_id),
  constraint inquiry_instances_snapshot_safe check (
    jsonb_typeof(snapshot) = 'object'
    and not jsonb_path_exists(snapshot, '$.**.answer')
    and not jsonb_path_exists(snapshot, '$.**.explanation_vi')
    and not jsonb_path_exists(snapshot, '$.**.prompt_vi')
    and not jsonb_path_exists(snapshot, '$.**.review_note')
    and not jsonb_path_exists(snapshot, '$.**.text')
    and not jsonb_path_exists(snapshot, '$.**.body')
    and not jsonb_path_exists(snapshot, '$.**.transcript'))
);
create index if not exists inquiry_instances_learner_idx on english.inquiry_instances(learner_id, assigned_at desc);

create table if not exists english.activity_instances (
  id uuid primary key default gen_random_uuid(),
  inquiry_instance_id uuid not null references english.inquiry_instances(id),
  learner_id uuid not null references english.learners(id),
  step_no int not null check (step_no > 0),
  activity_type text not null references english.activity_templates(id),
  mode text not null check (mode in ('PRACTICE', 'INDEPENDENT_CHECK', 'REVISION')),
  purpose text[] not null default '{}' check (purpose <@ array['baseline', 'checkpoint', 'delayed_check', 'transfer_check']),
  target_ids text[] not null default '{}',
  scheduled_for date,
  unique (inquiry_instance_id, step_no)
);
create index if not exists activity_instances_learner_idx on english.activity_instances(learner_id, scheduled_for);

-- Khóa đáp án chụp lúc giao (STAFF-ONLY).
create table if not exists english.instance_item_keys (
  inquiry_instance_id uuid not null references english.inquiry_instances(id),
  learner_id uuid not null references english.learners(id),
  item_id text not null,
  step_no int not null check (step_no > 0),
  kind text not null check (kind in ('answer', 'sealed', 'note')),
  answer text,
  explanation_vi text,
  primary key (inquiry_instance_id, item_id)
);
create index if not exists instance_item_keys_learner_idx on english.instance_item_keys(learner_id);

-- Đổi ngày / bỏ bước / hoàn lại: luôn có lý do. Lịch hiệu lực = sự kiện mới nhất (at, id).
create table if not exists english.activity_instance_events (
  id bigint generated always as identity primary key,
  activity_instance_id uuid not null references english.activity_instances(id),
  learner_id uuid not null references english.learners(id),
  kind text not null check (kind in ('reschedule', 'skip', 'unskip')),
  new_date date,
  reason text not null check (length(btrim(reason)) >= 3),
  by_member uuid not null,
  at timestamptz not null default clock_timestamp(),
  constraint activity_events_date_shape check ((kind = 'reschedule') = (new_date is not null))
);
create index if not exists activity_events_activity_idx on english.activity_instance_events(activity_instance_id, at, id);
create index if not exists activity_events_learner_idx on english.activity_instance_events(learner_id);

-- Append-only (theo hướng dẫn đầu 0004) -------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['inquiry_instances', 'activity_instances', 'instance_item_keys', 'activity_instance_events'] loop
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

-- Giao bài (chỉ service role, SAU requireAccess) ----------------------------------------------------------
-- Idempotent theo (learner, client_request_id). Kiểm lại người thao tác ở đây (không tin route):
-- phụ huynh của gia đình, hoặc gia sư có quan hệ còn hiệu lực. Chụp snapshot + các bước + khóa đáp án
-- trong MỘT transaction.
create or replace function english.eng_assign_inquiry(
  p_learner uuid,
  p_template text,
  p_version int,
  p_due date,
  p_by uuid,
  p_client_request_id text
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_track text;
  v_existing_id uuid;
  v_existing_template text;
  v_existing_version int;
  v_tpl english.inquiry_templates%rowtype;
  v_user uuid;
  v_role text;
  v_id uuid;
begin
  if p_learner is null or p_template is null or p_version is null or p_due is null or p_by is null then
    raise exception 'eng_assign_inquiry: learner, template, version, due date and actor are required'
      using errcode = '22004';
  end if;
  if p_client_request_id is null or length(btrim(p_client_request_id)) < 8 or length(p_client_request_id) > 100 then
    raise exception 'eng_assign_inquiry: client_request_id must be 8..100 characters' using errcode = '22023';
  end if;

  -- Khóa dòng learner: hai yêu cầu cùng lúc với cùng client_request_id xếp hàng, không tạo đôi.
  select l.family_id, l.track_id into v_family, v_track
  from english.learners l where l.id = p_learner
  for update;
  if v_family is null then
    raise exception 'eng_assign_inquiry: learner % not found', p_learner using errcode = 'P0002';
  end if;

  if not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_assign_inquiry: member % may not assign inquiries to learner %', p_by, p_learner
      using errcode = '42501';
  end if;

  select i.id, i.template_id, i.template_version
  into v_existing_id, v_existing_template, v_existing_version
  from english.inquiry_instances i
  where i.learner_id = p_learner and i.client_request_id = p_client_request_id;
  if v_existing_id is not null then
    if v_existing_template <> p_template or v_existing_version <> p_version then
      raise exception 'eng_assign_inquiry: client_request_id was already used for another template'
        using errcode = '23505';
    end if;
    return v_existing_id;
  end if;

  select * into v_tpl
  from english.inquiry_templates t
  where t.id = p_template and t.version = p_version and t.published_at is not null;
  if not found then
    raise exception 'eng_assign_inquiry: template %/% not found or not published', p_template, p_version
      using errcode = 'P0002';
  end if;
  if v_tpl.track_id <> v_track then
    raise exception 'eng_assign_inquiry: template % belongs to another track than the learner', p_template
      using errcode = '23514';
  end if;

  insert into english.inquiry_instances(learner_id, template_id, template_version, snapshot, assigned_by, due_on, client_request_id)
  values (
    p_learner, v_tpl.id, v_tpl.version,
    pg_catalog.jsonb_build_object(
      'schema_version', 1,
      'template', pg_catalog.jsonb_build_object(
        'id', v_tpl.id,
        'version', v_tpl.version,
        'track_id', v_tpl.track_id,
        'title_vi', v_tpl.title_vi,
        'big_question_en', v_tpl.big_question_en,
        'big_question_vi', v_tpl.big_question_vi,
        'week', v_tpl.week,
        'date_from', v_tpl.date_from,
        'date_to', v_tpl.date_to,
        'domain_bucket', v_tpl.domain_bucket,
        'catalogue_version', v_tpl.catalogue_version,
        'source_hash', v_tpl.source_hash),
      'target_ids', pg_catalog.to_jsonb(v_tpl.target_ids),
      'sources', v_tpl.sources,
      'steps', v_tpl.steps),
    p_by, p_due, p_client_request_id)
  returning id into v_id;

  insert into english.activity_instances(inquiry_instance_id, learner_id, step_no, activity_type, mode, purpose, target_ids, scheduled_for)
  select v_id, p_learner, (s ->> 'step_no')::int, s ->> 'activity_type', s ->> 'mode',
    array(select e from jsonb_array_elements_text(s -> 'purpose') with ordinality as t(e, n) order by n),
    array(select e from jsonb_array_elements_text(s -> 'target_ids') with ordinality as t(e, n) order by n),
    nullif(s ->> 'planned_date', '')::date
  from jsonb_array_elements(v_tpl.steps) as s;

  insert into english.instance_item_keys(inquiry_instance_id, learner_id, item_id, step_no, kind, answer, explanation_vi)
  select v_id, p_learner, k.item_id, k.step_no, k.kind, k.answer, k.explanation_vi
  from english.template_item_keys k
  where k.template_id = v_tpl.id and k.template_version = v_tpl.version;

  select m.user_id, m.role into v_user, v_role from english.members m where m.id = p_by;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_user, v_role, 'inquiry.assigned', v_family, p_learner,
          pg_catalog.jsonb_build_object('inquiry_instance', v_id, 'template', v_tpl.id, 'version', v_tpl.version, 'due_on', p_due));

  return v_id;
end
$$;

revoke execute on function english.eng_assign_inquiry(uuid, text, int, date, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_assign_inquiry(uuid, text, int, date, uuid, text) to service_role;

-- Đổi ngày / bỏ bước / hoàn lại bước (chỉ service role, SAU requireAccess) -------------------------------
create or replace function english.eng_activity_event(
  p_activity uuid,
  p_kind text,
  p_new_date date,
  p_reason text,
  p_by uuid
) returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_learner uuid;
  v_family uuid;
  v_last text;
  v_user uuid;
  v_role text;
  v_id bigint;
begin
  if p_activity is null or p_kind is null or p_by is null then
    raise exception 'eng_activity_event: activity, kind and actor are required' using errcode = '22004';
  end if;

  select a.learner_id into v_learner from english.activity_instances a where a.id = p_activity;
  if v_learner is null then
    raise exception 'eng_activity_event: activity % not found', p_activity using errcode = 'P0002';
  end if;

  -- Khóa learner: các sự kiện của cùng một em xếp hàng, kiểm "đã bỏ / chưa bỏ" không bị đua.
  select l.family_id into v_family from english.learners l where l.id = v_learner for update;

  if not english.eng_actor_may_manage(p_by, v_learner) then
    raise exception 'eng_activity_event: member % may not change this learner''s schedule', p_by
      using errcode = '42501';
  end if;

  if p_kind not in ('reschedule', 'skip', 'unskip') then
    raise exception 'eng_activity_event: unknown kind %', p_kind using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'eng_activity_event: a reason (at least 3 characters) is required' using errcode = '23514';
  end if;
  if (p_kind = 'reschedule') <> (p_new_date is not null) then
    raise exception 'eng_activity_event: reschedule needs a new date, skip/unskip must not have one'
      using errcode = '23514';
  end if;

  select e.kind into v_last
  from english.activity_instance_events e
  where e.activity_instance_id = p_activity and e.kind in ('skip', 'unskip')
  order by e.at desc, e.id desc
  limit 1;
  if p_kind = 'skip' and v_last = 'skip' then
    raise exception 'eng_activity_event: this step is already skipped' using errcode = '23514';
  end if;
  if p_kind = 'unskip' and v_last is distinct from 'skip' then
    raise exception 'eng_activity_event: this step is not skipped' using errcode = '23514';
  end if;

  insert into english.activity_instance_events(activity_instance_id, learner_id, kind, new_date, reason, by_member)
  values (p_activity, v_learner, p_kind, p_new_date, btrim(p_reason), p_by)
  returning id into v_id;

  select m.user_id, m.role into v_user, v_role from english.members m where m.id = p_by;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_user, v_role, 'activity.' || p_kind, v_family, v_learner,
          pg_catalog.jsonb_build_object('activity_instance', p_activity, 'event', v_id));

  return v_id;
end
$$;

revoke execute on function english.eng_activity_event(uuid, text, date, text, uuid) from public, anon, authenticated;
grant execute on function english.eng_activity_event(uuid, text, date, text, uuid) to service_role;

-- Purge: thêm các bảng của S2 (con trước, cha sau). Thân hàm = bản của 0005 + các dòng S2 (không bỏ dòng nào). --
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
  n_events int := 0;
  n_instance_keys int := 0;
  n_activities int := 0;
  n_instances int := 0;
  n_target_sets int := 0;
  n_consents int := 0;
  n_relationships int := 0;
  n_members int := 0;
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

-- Mẫu đã công bố, thuộc track nằm trong phạm vi của người gọi.
create or replace function english.eng_staff_may_read_template(p_id text, p_version int) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from english.inquiry_templates t
    where t.id = p_id and t.version = p_version
      and t.published_at is not null
      and english.eng_staff_has_track(t.track_id))
$$;

-- Nguồn được một mẫu đã công bố (track trong phạm vi) dùng đến. Nguồn không thuộc mẫu nào: không ai đọc.
create or replace function english.eng_staff_may_read_source(p_id text, p_version int) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from english.inquiry_templates t
    where t.published_at is not null
      and t.sources @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', p_id, 'version', p_version))
      and english.eng_staff_has_track(t.track_id))
$$;

revoke execute on function english.eng_staff_may_read_template(text, int) from public, anon;
revoke execute on function english.eng_staff_may_read_source(text, int) from public, anon;
grant execute on function english.eng_staff_may_read_template(text, int) to authenticated, service_role;
grant execute on function english.eng_staff_may_read_source(text, int) to authenticated, service_role;

-- RLS ---------------------------------------------------------------------------------------------------
alter table english.sources enable row level security;
alter table english.source_transcripts enable row level security;
alter table english.inquiry_templates enable row level security;
alter table english.template_item_keys enable row level security;
alter table english.inquiry_instances enable row level security;
alter table english.activity_instances enable row level security;
alter table english.instance_item_keys enable row level security;
alter table english.activity_instance_events enable row level security;

-- Mẫu, nguồn, lời thoại, khóa đáp án của mẫu: CHỈ phụ huynh / gia sư, và chỉ mẫu thuộc track của một em
-- trong phạm vi của họ (eng_staff_has_track). Học sinh KHÔNG đọc mẫu: các bước của mẫu chứa câu hỏi của
-- cả tuần, nên học sinh chỉ nhận bước đã đến ngày qua english.eng_my_released_steps (không đọc tắt được).
drop policy if exists sources_select on english.sources;
create policy sources_select on english.sources
  for select to authenticated
  using (published_at is not null and english.eng_staff_may_read_source(id, version));

drop policy if exists inquiry_templates_select on english.inquiry_templates;
create policy inquiry_templates_select on english.inquiry_templates
  for select to authenticated
  using (published_at is not null and english.eng_staff_has_track(track_id));

drop policy if exists source_transcripts_select on english.source_transcripts;
create policy source_transcripts_select on english.source_transcripts
  for select to authenticated
  using (english.eng_staff_may_read_source(source_id, source_version));

drop policy if exists template_item_keys_select on english.template_item_keys;
create policy template_item_keys_select on english.template_item_keys
  for select to authenticated
  using (english.eng_staff_may_read_template(template_id, template_version));

-- Bài đã giao: ai đọc được learner thì đọc được (học sinh: chỉ của mình).
drop policy if exists inquiry_instances_select on english.inquiry_instances;
create policy inquiry_instances_select on english.inquiry_instances
  for select to authenticated
  using (english.eng_can_read_learner(learner_id));

drop policy if exists activity_instances_select on english.activity_instances;
create policy activity_instances_select on english.activity_instances
  for select to authenticated
  using (english.eng_can_read_learner(learner_id));

drop policy if exists activity_instance_events_select on english.activity_instance_events;
create policy activity_instance_events_select on english.activity_instance_events
  for select to authenticated
  using (english.eng_can_read_learner(learner_id));

-- Khóa đáp án của bài đã giao: CHỈ phụ huynh / gia sư của learner đó. Học sinh và anon: không bao giờ.
drop policy if exists instance_item_keys_select on english.instance_item_keys;
create policy instance_item_keys_select on english.instance_item_keys
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- Grant theo từng bảng (không dùng "on all tables") -----------------------------------------------------
grant select on
  english.sources, english.source_transcripts, english.inquiry_templates, english.template_item_keys,
  english.inquiry_instances, english.activity_instances, english.instance_item_keys,
  english.activity_instance_events
  to authenticated;

-- Ghi chỉ qua hàm eng_assign_inquiry / eng_activity_event (security definer) và migration (chủ sở hữu).
revoke insert, update, delete, truncate on
  english.sources, english.source_transcripts, english.inquiry_templates, english.template_item_keys,
  english.inquiry_instances, english.activity_instances, english.instance_item_keys,
  english.activity_instance_events
  from public, anon, authenticated, service_role;
revoke all on
  english.sources, english.source_transcripts, english.inquiry_templates, english.template_item_keys,
  english.inquiry_instances, english.activity_instances, english.instance_item_keys,
  english.activity_instance_events
  from anon;

insert into english.schema_migrations(version) values ('0007') on conflict do nothing;
