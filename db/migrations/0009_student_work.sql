-- 0009_student_work.sql
-- S4: bài làm của học sinh — nháp tự lưu, bài nộp BẤT BIẾN kèm biên nhận, hỗ trợ đã khai báo, lần tiếp xúc,
-- episode, kết quả tự chấm (chỉ phụ huynh/gia sư thấy) (DESIGN §5, §6, §8 "Quy tắc đếm", §9; plan docs/plans/s4-student-work.md).
--
-- Nguyên tắc an toàn:
--  * Học sinh KHÔNG BAO GIỜ thấy điểm, kết quả tự chấm, đúng/sai, đáp án, lời thoại bài nghe, prompt_vi, ghi chú
--    — kể cả gọi REST trực tiếp. Kết quả tự chấm nằm ở bảng riêng attempt_auto_checks (chỉ phụ huynh/gia sư đọc);
--    episodes / exposure_log / assistance_events cũng chỉ phụ huynh/gia sư đọc (có mã kỹ năng bên trong).
--  * KHÔNG ai ghi trực tiếp vào các bảng này: chỉ qua hai hàm của học sinh (eng_save_draft, eng_submit_attempt),
--    mỗi hàm kiểm "người gọi chính là học sinh của bài này" bằng auth.uid(). Phụ huynh / gia sư gọi → từ chối.
--  * Bảng bài nộp là append-only (eng_forbid_mutation) và có trong eng_purge_learner. working_drafts là bảng
--    DUY NHẤT được sửa đè (FR-10).
--  * Học sinh đọc bài chỉ qua các hàm eng_my_* (bài đã đến ngày, của chính em): không SELECT được mẫu / nguồn / khóa.
-- Không đụng schema public. Idempotent. Grant theo từng bảng.

-- Hàm nội bộ (chỉ các hàm security definer bên dưới gọi; không ai khác có quyền execute) -------------------------------

-- Ngày hiệu lực của một bước = ngày của lần đổi ngày mới nhất, không thì ngày kế hoạch; NULL nếu bước đang ở trạng thái "bỏ".
-- Cùng luật với english.eng_my_released_steps (0007) — có test đối chiếu hai hàm.
create or replace function english.eng_step_effective_date(p_activity uuid) returns date
language sql stable security definer set search_path = ''
as $$
  select case when s.skipped then null else s.eff end
  from (
    select
      coalesce(
        (select e.new_date from english.activity_instance_events e
          where e.activity_instance_id = a.id and e.kind = 'reschedule'
          order by e.at desc, e.id desc limit 1),
        a.scheduled_for) as eff,
      coalesce(
        (select e.kind = 'skip' from english.activity_instance_events e
          where e.activity_instance_id = a.id and e.kind in ('skip', 'unskip')
          order by e.at desc, e.id desc limit 1),
        false) as skipped
    from english.activity_instances a
    where a.id = p_activity
  ) s
$$;

-- Bước đã mở = có ngày hiệu lực và ngày đó <= hôm nay (giờ Việt Nam).
create or replace function english.eng_activity_released(p_activity uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    english.eng_step_effective_date(p_activity) <= (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    false)
$$;

-- Bước nào học sinh làm được trong app (S4): đọc/nghe + trả lời, viết; không phải sửa bài.
create or replace function english.eng_step_supported(p_activity_type text, p_mode text) returns boolean
language sql immutable set search_path = ''
as $$
  select p_activity_type in ('ACT-SOURCE-QA', 'ACT-WRITE') and p_mode <> 'REVISION'
$$;

-- Nhãn trung tính cho bước chưa làm trong app: khóa chữ (lib/copy/vi.ts), không phải nội dung bước.
create or replace function english.eng_step_status_label(p_activity_type text, p_mode text) returns text
language sql immutable set search_path = ''
as $$
  select case when p_activity_type = 'ACT-SPEAK-LIVE' then 'with_tutor' else 'on_paper' end
$$;

-- Chọn đáp án nào trong danh sách? Cùng luật với resolveMcqAnswer (lib/config/inquiries.ts): đúng nguyên văn lựa chọn
-- (bỏ khoảng trắng đầu/cuối, không phân biệt hoa thường); hoặc một chữ cái — nhãn "b)" / "h." nếu MỌI lựa chọn đều có nhãn,
-- không thì thứ tự chữ cái (D → lựa chọn thứ 4). Trả vị trí (từ 0) hoặc NULL.
create or replace function english.eng_resolve_option(p_options jsonb, p_answer text) returns int
language plpgsql immutable set search_path = ''
as $$
declare
  a text := pg_catalog.btrim(coalesce(p_answer, ''));
  n int := case when pg_catalog.jsonb_typeof(p_options) = 'array' then pg_catalog.jsonb_array_length(p_options) else 0 end;
  v_idx int;
  v_labelled boolean;
  v_pos int;
begin
  if a = '' or n = 0 then return null; end if;

  select (t.ord - 1)::int into v_idx
  from pg_catalog.jsonb_array_elements_text(p_options) with ordinality as t(o, ord)
  where pg_catalog.lower(pg_catalog.btrim(t.o)) = pg_catalog.lower(a)
  order by t.ord
  limit 1;
  if v_idx is not null then return v_idx; end if;

  if a !~ '^[A-Za-z]$' then return null; end if;

  select pg_catalog.bool_and(substring(pg_catalog.btrim(t.o) from '^([A-Za-z])[.)]\s') is not null)
  into v_labelled
  from pg_catalog.jsonb_array_elements_text(p_options) as t(o);

  if coalesce(v_labelled, false) then
    select (t.ord - 1)::int into v_idx
    from pg_catalog.jsonb_array_elements_text(p_options) with ordinality as t(o, ord)
    where pg_catalog.lower(substring(pg_catalog.btrim(t.o) from '^([A-Za-z])[.)]\s')) = pg_catalog.lower(a)
    order by t.ord
    limit 1;
    return v_idx;
  end if;

  v_pos := pg_catalog.ascii(pg_catalog.lower(a)) - 97;
  return case when v_pos >= 0 and v_pos < n then v_pos else null end;
end
$$;

-- Làm sạch chữ trước khi so: Unicode NFC; khoảng trắng "lạ" (NBSP U+00A0, U+202F, các khoảng U+2000–200A, U+205F, U+3000) → dấu cách;
-- ký tự rộng-0 (U+200B–U+200D, U+FEFF) → bỏ; nháy cong (U+2018, U+2019, U+201B) → ', nháy kép cong (U+201C, U+201D) → ";
-- gộp khoảng trắng; bỏ khoảng trắng đầu/cuối.
create or replace function english.eng_clean_text(p_text text) returns text
language sql immutable set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              normalize(coalesce(p_text, ''), nfc),
              '[\u200B-\u200D\uFEFF]', '', 'g'),
            '[\u00A0\u202F\u2000-\u200A\u205F\u3000]', ' ', 'g'),
          '[\u2018\u2019\u201B]', '''', 'g'),
        '[\u201C\u201D]', '"', 'g'),
      '\s+', ' ', 'g'))
$$;

-- So khớp chữ: làm sạch như trên, bỏ dấu chấm / chấm than / chấm hỏi ở cuối câu, không phân biệt hoa thường.
create or replace function english.eng_norm_answer(p_text text) returns text
language sql immutable set search_path = ''
as $$
  select pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(english.eng_clean_text(p_text), '[.!?]+\s*$', '')))
$$;

-- Hình dạng nội dung của một bước: 'text' (một bài viết tự do: ACT-WRITE không có câu hỏi, hoặc chỉ một câu "open")
-- hoặc 'answers' (trả lời theo mã câu hỏi).
create or replace function english.eng_step_shape(p_step jsonb) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_step ->> 'activity_type' = 'ACT-WRITE'
     and (pg_catalog.jsonb_array_length(coalesce(p_step -> 'items', '[]'::jsonb)) = 0
          or (pg_catalog.jsonb_array_length(p_step -> 'items') = 1 and p_step -> 'items' -> 0 ->> 'kind' = 'open'))
    then 'text'
    else 'answers'
  end
$$;

-- Kiểm nội dung (nháp: nới; nộp: chặt). Mọi lỗi → 22023 (invalid_parameter_value) → 400.
create or replace function english.eng_check_work_content(p_step jsonb, p_content jsonb, p_final boolean) returns void
language plpgsql immutable set search_path = ''
as $$
declare
  v_shape text := english.eng_step_shape(p_step);
  v_key text;
  v_val jsonb;
  v_item jsonb;
  v_kind text;
  v_opts jsonb;
  v_any boolean := false;
  v_txt text;
  v_max int;
  v_allowed text[];
begin
  if p_content is null or pg_catalog.jsonb_typeof(p_content) <> 'object' then
    raise exception 'work content must be a JSON object' using errcode = '22023';
  end if;
  if pg_catalog.length(p_content::text) > 200000 then
    raise exception 'work content is too large' using errcode = '22023';
  end if;

  v_allowed := case when p_final then array[v_shape] else array['text', 'answers', 'pasted', 'assistance'] end;
  for v_key in select k from pg_catalog.jsonb_object_keys(p_content) as k loop
    if not (v_key = any (v_allowed)) then
      raise exception 'work content: unknown key %', v_key using errcode = '22023';
    end if;
  end loop;
  if p_final and not (p_content ? v_shape) then
    raise exception 'work content: this step expects "%"', v_shape using errcode = '22023';
  end if;

  if p_content ? 'text' then
    if pg_catalog.jsonb_typeof(p_content -> 'text') <> 'string' or pg_catalog.length(p_content ->> 'text') > 20000 then
      raise exception 'work content: text must be a string of at most 20000 characters' using errcode = '22023';
    end if;
    if p_final and pg_catalog.btrim(p_content ->> 'text') = '' then
      raise exception 'work content: the text is empty' using errcode = '22023';
    end if;
  end if;

  if p_content ? 'pasted' and pg_catalog.jsonb_typeof(p_content -> 'pasted') <> 'boolean' then
    raise exception 'work content: pasted must be true or false' using errcode = '22023';
  end if;

  if p_content ? 'assistance' then
    if pg_catalog.jsonb_typeof(p_content -> 'assistance') <> 'array'
       or exists (select 1 from pg_catalog.jsonb_array_elements(p_content -> 'assistance') x
                  where pg_catalog.jsonb_typeof(x) <> 'string'
                     or (x #>> '{}') not in ('none', 'notes', 'dictionary', 'asked_someone', 'ai_outside')) then
      raise exception 'work content: unknown assistance value' using errcode = '22023';
    end if;
  end if;

  if p_content ? 'answers' then
    if pg_catalog.jsonb_typeof(p_content -> 'answers') <> 'object' then
      raise exception 'work content: answers must be an object' using errcode = '22023';
    end if;
    for v_key, v_val in select k, v from pg_catalog.jsonb_each(p_content -> 'answers') as t(k, v) loop
      select x into v_item
      from pg_catalog.jsonb_array_elements(coalesce(p_step -> 'items', '[]'::jsonb)) as x
      where x ->> 'id' = v_key;
      if v_item is null then
        raise exception 'work content: "%" is not a question of this step', v_key using errcode = '22023';
      end if;
      if pg_catalog.jsonb_typeof(v_val) <> 'string' then
        raise exception 'work content: the answer to "%" must be a string', v_key using errcode = '22023';
      end if;
      v_txt := v_val #>> '{}';
      v_kind := v_item ->> 'kind';
      v_opts := coalesce(v_item -> 'options', '[]'::jsonb);
      v_max := case when v_kind = 'open' then 20000 else 2000 end;
      if pg_catalog.jsonb_array_length(v_opts) > 0 and v_kind in ('mcq', 'gap', 'word_form') then
        -- câu chọn: chỉ nhận đúng một lựa chọn đang hiển thị (hoặc để trống)
        if v_txt <> '' and not exists (select 1 from pg_catalog.jsonb_array_elements_text(v_opts) o where o = v_txt) then
          raise exception 'work content: the answer to "%" is not one of the options', v_key using errcode = '22023';
        end if;
      elsif pg_catalog.length(v_txt) > v_max then
        raise exception 'work content: the answer to "%" is too long', v_key using errcode = '22023';
      end if;
      if pg_catalog.btrim(v_txt) <> '' then v_any := true; end if;
    end loop;
    if p_final and not v_any then
      raise exception 'work content: no answer given' using errcode = '22023';
    end if;
  end if;
end
$$;

-- Tự chấm (CHỈ phụ huynh/gia sư thấy kết quả). mcq / gap / word_form có khóa: chọn đúng lựa chọn, hoặc (chữ tự do) khớp
-- không phân biệt hoa thường / khoảng trắng / nháy cong / dấu câu cuối (english.eng_norm_answer) với một trong các đáp án chấp nhận, cách nhau bởi " / ". transform / short /
-- open: "needs_person". Không bao giờ ra điểm 0–4.
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
begin
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

revoke execute on function english.eng_step_effective_date(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_activity_released(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_step_supported(text, text) from public, anon, authenticated, service_role;
revoke execute on function english.eng_step_status_label(text, text) from public, anon, authenticated, service_role;
revoke execute on function english.eng_resolve_option(jsonb, text) from public, anon, authenticated, service_role;
revoke execute on function english.eng_clean_text(text) from public, anon, authenticated, service_role;
revoke execute on function english.eng_norm_answer(text) from public, anon, authenticated, service_role;
revoke execute on function english.eng_step_shape(jsonb) from public, anon, authenticated, service_role;
revoke execute on function english.eng_check_work_content(jsonb, jsonb, boolean) from public, anon, authenticated, service_role;
revoke execute on function english.eng_compute_auto_checks(uuid, jsonb, jsonb) from public, anon, authenticated, service_role;

-- Bài đọc / bài nghe nào thuộc bước nào ------------------------------------------------------------------------------------
-- Mẫu chủ đề chỉ liệt kê nguồn của cả tuần; nội dung (content/inquiries) chưa ghi nguồn nào dùng cho bước nào. Học sinh chỉ nhận
-- nguồn của bước đang làm (bài nghe tự làm không được kèm bài đọc). Bảng này nối rõ ràng (mẫu, bước) → nguồn; bước nào chưa có
-- dòng thì học sinh KHÔNG nhận nguồn nào (đóng khi thiếu). Chỉ thêm, không sửa/xóa. Phụ huynh / gia sư đọc được; học sinh không.
create table if not exists english.template_step_sources (
  template_id text not null,
  template_version int not null,
  step_no int not null check (step_no > 0),
  source_id text not null,
  source_version int not null,
  position int not null default 1 check (position > 0),
  primary key (template_id, template_version, step_no, source_id),
  foreign key (template_id, template_version) references english.inquiry_templates(id, version),
  foreign key (source_id, source_version) references english.sources(id, version),
  constraint template_step_sources_same_version check (source_version = template_version)
);

create or replace function english.eng_forbid_row_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'english.%: % is forbidden (rows are insert-only)', tg_table_name, tg_op using errcode = '42501';
end
$$;
revoke execute on function english.eng_forbid_row_change() from public, anon, authenticated;

drop trigger if exists template_step_sources_immutable on english.template_step_sources;
create trigger template_step_sources_immutable
  before update or delete on english.template_step_sources
  for each row execute function english.eng_forbid_row_change();
drop trigger if exists template_step_sources_immutable_truncate on english.template_step_sources;
create trigger template_step_sources_immutable_truncate
  before truncate on english.template_step_sources
  for each statement execute function english.eng_forbid_row_change();

-- Bước nào đọc / nghe gì (suy ra từ lời nhắc của từng bước: "Read the text…" → bài đọc, "Listen…" → bài nghe; bài đầu vào Track B:
-- bước 1 hai đoạn của đề rút gọn, bước 2 bài nghị luận, bước 3 số liệu, bước 4 bài nghe, bước 6 bài đọc ngắn). Chờ phụ huynh xác nhận.
insert into english.template_step_sources(template_id, template_version, step_no, source_id, source_version, position)
select m.template_id, 1, m.step_no, m.source_id, 1, m.position
from (values
  ('A-W0-BASELINE', 1, 'A-W0-BASELINE-S1', 1),
  ('A-W0-BASELINE', 2, 'A-W0-BASELINE-S2', 1),
  ('A-W1-VOLCANOES', 2, 'A-W1-VOLCANOES-S2', 1),
  ('A-W1-VOLCANOES', 3, 'A-W1-VOLCANOES-S1', 1),
  ('A-W2-WATERCYCLE', 2, 'A-W2-WATERCYCLE-S2', 1),
  ('A-W2-WATERCYCLE', 4, 'A-W2-WATERCYCLE-S1', 1),
  ('A-W3-EARTHQUAKES', 2, 'A-W3-EARTHQUAKES-S1', 1),
  ('A-W3-EARTHQUAKES', 4, 'A-W3-EARTHQUAKES-S2', 1),
  ('A-W4-PLANETS', 2, 'A-W4-PLANETS-S2', 1),
  ('A-W4-PLANETS', 4, 'A-W4-PLANETS-S1', 1),
  ('B-W0-BASELINE', 1, 'B-W0-BASELINE-S1', 1),
  ('B-W0-BASELINE', 1, 'B-W0-BASELINE-S2', 2),
  ('B-W0-BASELINE', 2, 'B-W0-BASELINE-S3', 1),
  ('B-W0-BASELINE', 3, 'B-W0-BASELINE-S4', 1),
  ('B-W0-BASELINE', 4, 'B-W0-BASELINE-S5', 1),
  ('B-W0-BASELINE', 6, 'B-W0-BASELINE-S6', 1)
) as m(template_id, step_no, source_id, position)
where exists (select 1 from english.sources s where s.id = m.source_id and s.version = 1)
  and exists (select 1 from english.inquiry_templates t where t.id = m.template_id and t.version = 1)
on conflict do nothing;

-- Bảng bài làm của học sinh ---------------------------------------------------------------------------------------------------

-- working_drafts: bảng DUY NHẤT được sửa đè (FR-10). revision tăng mỗi lần lưu để phát hiện hai tab cùng sửa (chỉ cảnh báo).
create table if not exists english.working_drafts (
  activity_instance_id uuid not null references english.activity_instances(id),
  learner_id uuid not null references english.learners(id),
  content jsonb not null,
  revision int not null default 1 check (revision > 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (activity_instance_id, learner_id)
);
create index if not exists working_drafts_learner_idx on english.working_drafts(learner_id);

-- attempts: bất biến. learning_family_id = id của lần đầu tiên của bước này (lần 1 trỏ về chính nó).
create table if not exists english.attempts (
  id uuid primary key default gen_random_uuid(),
  activity_instance_id uuid not null references english.activity_instances(id),
  learner_id uuid not null references english.learners(id),
  attempt_no int not null check (attempt_no > 0),
  parent_attempt_id uuid references english.attempts(id),
  learning_family_id uuid not null references english.attempts(id),
  mode text not null check (mode in ('PRACTICE', 'INDEPENDENT_CHECK', 'REVISION')),
  provenance text not null check (provenance in ('in_app', 'pasted', 'manual_import', 'tutor_live')),
  -- Điều học sinh khai báo trước khi nộp. 'none' = "không dùng gì" (khác với chưa được hỏi).
  declared_assistance text[] not null check (
    cardinality(declared_assistance) > 0
    and declared_assistance <@ array['none', 'notes', 'dictionary', 'asked_someone', 'ai_outside']
    and ('none' <> all (declared_assistance) or cardinality(declared_assistance) = 1)),
  submitted_at timestamptz not null default clock_timestamp(),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  client_submission_id uuid not null,
  unique (activity_instance_id, attempt_no),
  unique (learner_id, client_submission_id),
  constraint attempts_lineage check ((attempt_no = 1) = (parent_attempt_id is null)),
  constraint attempts_first_is_own_family check (attempt_no <> 1 or learning_family_id = id)
);
create index if not exists attempts_learner_idx on english.attempts(learner_id, submitted_at desc);

create table if not exists english.artifact_versions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references english.attempts(id),
  learner_id uuid not null references english.learners(id),
  kind text not null check (kind in ('text', 'transcript', 'canvas', 'answers')),
  version int not null default 1 check (version > 0),
  content jsonb not null,
  is_raw boolean not null default true,
  created_by uuid not null,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, kind, version)
);
create index if not exists artifact_versions_learner_idx on english.artifact_versions(learner_id);

create table if not exists english.assistance_events (
  id bigint generated always as identity primary key,
  learner_id uuid not null references english.learners(id),
  attempt_id uuid not null references english.attempts(id),
  kind text not null check (kind in (
    'ai_coach', 'ai_clarifier', 'ai_challenger', 'tutor_prompt', 'frame', 'notes', 'model_answer',
    'source_open', 'transcript_open', 'external_declared', 'accessibility')),
  -- Chi tiết điều học sinh khai (kind = external_declared): dictionary | asked_someone | ai_outside | pasted.
  detail text check (detail is null or detail in ('notes', 'dictionary', 'asked_someone', 'ai_outside', 'pasted')),
  affects_target_keys text[] not null default '{}',
  verification text not null check (verification in ('observed', 'declared', 'unknown')),
  at timestamptz not null default clock_timestamp()
);
create index if not exists assistance_events_attempt_idx on english.assistance_events(attempt_id);
create index if not exists assistance_events_learner_idx on english.assistance_events(learner_id);

create table if not exists english.exposure_log (
  id bigint generated always as identity primary key,
  learner_id uuid not null references english.learners(id),
  target_key text not null check (length(btrim(target_key)) > 0),
  at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('practice', 'lesson', 'retry')),
  attempt_id uuid references english.attempts(id)
);
create index if not exists exposure_log_learner_idx on english.exposure_log(learner_id, target_key, at desc);

-- episodes: một lần nộp = tối đa một episode. Chưa chấm gì ở đây (observations nằm ở S5/S7).
create table if not exists english.episodes (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references english.attempts(id),
  learner_id uuid not null references english.learners(id),
  is_first_attempt boolean not null,
  context_id text not null check (length(btrim(context_id)) > 0),
  observed_directly boolean not null default false,
  facets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists episodes_learner_idx on english.episodes(learner_id);

-- Kết quả tự chấm: bảng riêng, CHỈ phụ huynh / gia sư đọc (học sinh và các role dùng chung không thể bị chặn theo cột).
create table if not exists english.attempt_auto_checks (
  attempt_id uuid primary key references english.attempts(id),
  learner_id uuid not null references english.learners(id),
  checks jsonb not null,
  checked_at timestamptz not null default clock_timestamp()
);
create index if not exists attempt_auto_checks_learner_idx on english.attempt_auto_checks(learner_id);

-- Append-only (theo hướng dẫn đầu 0004) --------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['attempts', 'artifact_versions', 'assistance_events', 'exposure_log', 'episodes', 'attempt_auto_checks'] loop
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

-- Hàm của học sinh (authenticated; mỗi hàm kiểm auth.uid() là học sinh của bài) ------------------------------------------

-- Nháp tự lưu. Trả {revision, saved_at, other_tab_changed}: nếu p_base_revision khác revision đang lưu (tab khác vừa lưu)
-- thì VẪN lưu nhưng báo other_tab_changed (chỉ cảnh báo — PRD FR-10).
create or replace function english.eng_save_draft(p_activity uuid, p_content jsonb, p_base_revision int default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member uuid;
  v_role text;
  v_act english.activity_instances%rowtype;
  v_snapshot jsonb;
  v_step jsonb;
  v_cur int;
  v_rev int;
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'eng_save_draft: not signed in' using errcode = '42501';
  end if;
  select m.id, m.role into v_member, v_role from english.members m where m.user_id = v_uid;
  if v_member is null then
    raise exception 'eng_save_draft: activity not found' using errcode = 'P0002';
  end if;
  if v_role <> 'student' then
    raise exception 'eng_save_draft: only the learner may save a draft' using errcode = '42501';
  end if;

  select a.* into v_act
  from english.activity_instances a
  join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member
  for no key update of a;
  if not found or not english.eng_activity_released(p_activity) then
    raise exception 'eng_save_draft: activity not found' using errcode = 'P0002';
  end if;
  if not english.eng_step_supported(v_act.activity_type, v_act.mode) then
    raise exception 'eng_save_draft: this step cannot be done in the app yet' using errcode = '22023';
  end if;
  if v_act.mode = 'INDEPENDENT_CHECK'
     and exists (select 1 from english.attempts t where t.activity_instance_id = p_activity) then
    raise exception 'eng_save_draft: already submitted' using errcode = '23505';
  end if;

  select i.snapshot into v_snapshot from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  select x into v_step
  from pg_catalog.jsonb_array_elements(v_snapshot -> 'steps') as x
  where (x ->> 'step_no')::int = v_act.step_no;
  perform english.eng_check_work_content(v_step, p_content, false);

  select d.revision into v_cur
  from english.working_drafts d where d.activity_instance_id = p_activity and d.learner_id = v_act.learner_id;

  insert into english.working_drafts as d(activity_instance_id, learner_id, content, revision, updated_at)
  values (p_activity, v_act.learner_id, p_content, 1, pg_catalog.clock_timestamp())
  on conflict (activity_instance_id, learner_id) do update
    set content = excluded.content, revision = d.revision + 1, updated_at = excluded.updated_at
  returning d.revision, d.updated_at into v_rev, v_at;

  return pg_catalog.jsonb_build_object(
    'revision', v_rev,
    'saved_at', v_at,
    'other_tab_changed', p_base_revision is not null and v_cur is not null and p_base_revision <> v_cur);
end
$$;

-- Nộp bài: một transaction tạo attempt + bản nội dung + khai báo hỗ trợ + lần tiếp xúc + episode + kết quả tự chấm. Idempotent theo
-- (học sinh, client_submission_id): gửi lại y hệt → cùng biên nhận; cùng id mà khác nội dung / khác bước → 23505 (409).
create or replace function english.eng_submit_attempt(
  p_activity uuid,
  p_client_id uuid,
  p_content jsonb,
  p_assistance text[],
  p_provenance text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member uuid;
  v_role text;
  v_act english.activity_instances%rowtype;
  v_learner english.learners%rowtype;
  v_snapshot jsonb;
  v_step jsonb;
  v_shape text;
  v_assist text[];
  v_hash text;
  v_existing english.attempts%rowtype;
  v_last english.attempts%rowtype;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_no int;
  v_parent uuid;
  v_family uuid;
  v_first boolean;
  v_at timestamptz := pg_catalog.clock_timestamp();
  v_source text;
  v_item text;
begin
  if v_uid is null then
    raise exception 'eng_submit_attempt: not signed in' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'eng_submit_attempt: client_submission_id is required' using errcode = '22004';
  end if;
  select m.id, m.role into v_member, v_role from english.members m where m.user_id = v_uid;
  if v_member is null then
    raise exception 'eng_submit_attempt: activity not found' using errcode = 'P0002';
  end if;
  if v_role <> 'student' then
    raise exception 'eng_submit_attempt: only the learner may submit work' using errcode = '42501';
  end if;

  -- Khóa dòng bước: hai lần nộp cùng lúc của một bước xếp hàng (không tạo đôi, không vượt giới hạn 1 lần của bài tự làm).
  select a.* into v_act
  from english.activity_instances a
  join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member
  for no key update of a;
  if not found then
    raise exception 'eng_submit_attempt: activity not found' using errcode = 'P0002';
  end if;
  select * into v_learner from english.learners l where l.id = v_act.learner_id;

  -- Khai báo hỗ trợ: bắt buộc, giá trị hợp lệ, "none" đứng một mình.
  select coalesce(array_agg(distinct x order by x), '{}') into v_assist from unnest(p_assistance) as x;
  if cardinality(v_assist) = 0
     or not (v_assist <@ array['none', 'notes', 'dictionary', 'asked_someone', 'ai_outside'])
     or ('none' = any (v_assist) and cardinality(v_assist) > 1) then
    raise exception 'eng_submit_attempt: declare the help used (or "none")' using errcode = '22023';
  end if;
  if p_provenance is null or p_provenance not in ('in_app', 'pasted') then
    raise exception 'eng_submit_attempt: provenance must be in_app or pasted' using errcode = '22023';
  end if;
  if p_content is null then
    raise exception 'eng_submit_attempt: content is required' using errcode = '22023';
  end if;

  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_content::text, 'UTF8')), 'hex');

  -- Gửi lại: cùng biên nhận.
  select t.* into v_existing from english.attempts t
  where t.learner_id = v_act.learner_id and t.client_submission_id = p_client_id;
  if found then
    if v_existing.activity_instance_id <> p_activity or v_existing.content_hash <> v_hash then
      raise exception 'eng_submit_attempt: client_submission_id was already used for a different submission'
        using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'attempt_id', v_existing.id, 'attempt_no', v_existing.attempt_no,
      'submitted_at', v_existing.submitted_at, 'hash', v_existing.content_hash, 'replayed', true);
  end if;

  if not english.eng_activity_released(p_activity) then
    raise exception 'eng_submit_attempt: activity not found' using errcode = 'P0002';
  end if;
  if not english.eng_step_supported(v_act.activity_type, v_act.mode) then
    raise exception 'eng_submit_attempt: this step cannot be done in the app yet' using errcode = '22023';
  end if;

  select i.snapshot into v_snapshot from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  select x into v_step
  from pg_catalog.jsonb_array_elements(v_snapshot -> 'steps') as x
  where (x ->> 'step_no')::int = v_act.step_no;
  perform english.eng_check_work_content(v_step, p_content, true);
  v_shape := english.eng_step_shape(v_step);

  select t.* into v_last from english.attempts t
  where t.activity_instance_id = p_activity order by t.attempt_no desc limit 1;
  if found then
    if v_act.mode = 'INDEPENDENT_CHECK' then
      raise exception 'eng_submit_attempt: this step is a one-time check and was already submitted' using errcode = '23505';
    end if;
    v_no := v_last.attempt_no + 1;
    v_parent := v_last.id;
    v_family := v_last.learning_family_id;
  else
    v_no := 1;
    v_parent := null;
    v_family := v_id;
  end if;
  -- DESIGN §8: lần đầu = attempt_no 1 trong gia đình học tập và không phải sửa bài.
  v_first := v_no = 1 and v_act.mode <> 'REVISION';

  insert into english.attempts(
    id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance,
    declared_assistance, submitted_at, content_hash, client_submission_id)
  values (v_id, p_activity, v_act.learner_id, v_no, v_parent, v_family, v_act.mode, p_provenance,
          v_assist, v_at, v_hash, p_client_id);

  insert into english.artifact_versions(attempt_id, learner_id, kind, version, content, is_raw, created_by)
  values (v_id, v_act.learner_id, v_shape, 1, p_content, true, v_member);

  if v_shape = 'answers' then
    insert into english.attempt_auto_checks(attempt_id, learner_id, checks)
    values (v_id, v_act.learner_id,
            english.eng_compute_auto_checks(v_act.inquiry_instance_id, v_step, p_content -> 'answers'));
  end if;

  -- Hỗ trợ đã khai báo: mỗi mục một dòng, ảnh hưởng mọi kỹ năng của bước.
  foreach v_item in array v_assist loop
    if v_item <> 'none' then
      insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification)
      values (v_act.learner_id, v_id, case when v_item = 'notes' then 'notes' else 'external_declared' end,
              v_item, v_act.target_ids, 'declared');
    end if;
  end loop;
  if p_provenance = 'pasted' then
    insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification)
    values (v_act.learner_id, v_id, 'external_declared', 'pasted', v_act.target_ids, 'declared');
  end if;

  v_source := case when v_no > 1 then 'retry' else 'practice' end;
  insert into english.exposure_log(learner_id, target_key, at, source, attempt_id)
  select distinct v_act.learner_id, k, v_at, v_source, v_id from unnest(v_act.target_ids) as k;

  insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id, observed_directly, facets)
  values (v_id, v_act.learner_id, v_first, v_snapshot -> 'template' ->> 'id', false,
          pg_catalog.jsonb_build_object(
            'baseline', v_act.purpose @> array['baseline'],
            'checkpoint', v_act.purpose @> array['checkpoint'],
            'delayed_check', v_act.purpose @> array['delayed_check'],
            'transfer_check', v_act.purpose @> array['transfer_check']));

  delete from english.working_drafts d where d.activity_instance_id = p_activity and d.learner_id = v_act.learner_id;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_uid, v_role, 'attempt.submitted', v_learner.family_id, v_act.learner_id,
          pg_catalog.jsonb_build_object('attempt', v_id, 'attempt_no', v_no, 'activity_instance', p_activity));

  return pg_catalog.jsonb_build_object(
    'attempt_id', v_id, 'attempt_no', v_no, 'submitted_at', v_at, 'hash', v_hash, 'replayed', false);
end
$$;

-- Đường đọc của học sinh: chỉ bài của CHÍNH em, chỉ bước đã đến ngày ---------------------------------------------------------------
-- Danh sách bài được giao (id, tiêu đề, câu hỏi lớn, hạn) để trang chủ biết instance_id.
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
$$;

-- Trang chủ: các bước đã mở của từng bài (không có đề, đáp án, mã kỹ năng). done = đã nộp ít nhất một lần.
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
      and exists (select 1 from english.activity_instances a2
                  where a2.inquiry_instance_id = i.id and english.eng_activity_released(a2.id))
  ) q
$$;

-- Một bước đã mở: đề (không mã kỹ năng, không lời nhắc của gia sư), bản nháp, các lần đã nộp. NULL nếu không phải bước của em
-- hoặc chưa đến ngày.
create or replace function english.eng_my_activity(p_activity uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_act english.activity_instances%rowtype;
  v_inst english.inquiry_instances%rowtype;
  v_step jsonb;
  v_attempts jsonb;
  v_draft jsonb;
  v_count int;
begin
  select m.id into v_member from english.members m where m.user_id = auth.uid() and m.role = 'student';
  if v_member is null then return null; end if;

  select a.* into v_act
  from english.activity_instances a
  join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member;
  if not found or not english.eng_activity_released(p_activity) then return null; end if;

  select * into v_inst from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;

  -- Bước app chưa làm được (nói với thầy/cô, vẽ, tự xem lại, sửa bài…): chỉ trả mã bước + nhãn trung tính. KHÔNG trả đề, câu hỏi,
  -- gợi ý tự kiểm, lần nộp hay nháp — học sinh không nhận gì của bước đó qua app.
  if not english.eng_step_supported(v_act.activity_type, v_act.mode) then
    return pg_catalog.jsonb_build_object(
      'activity_id', v_act.id,
      'instance_id', v_inst.id,
      'step_no', v_act.step_no,
      'activity_type', v_act.activity_type,
      'mode', v_act.mode,
      'supported', false,
      'can_submit', false,
      'date', english.eng_step_effective_date(v_act.id),
      'title_vi', v_inst.snapshot -> 'template' ->> 'title_vi',
      'status_label_key', english.eng_step_status_label(v_act.activity_type, v_act.mode));
  end if;

  select x into v_step
  from pg_catalog.jsonb_array_elements(v_inst.snapshot -> 'steps') as x
  where (x ->> 'step_no')::int = v_act.step_no;

  select coalesce(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object('attempt_no', t.attempt_no, 'submitted_at', t.submitted_at, 'provenance', t.provenance)
           order by t.attempt_no), '[]'::jsonb),
         count(*)::int
  into v_attempts, v_count
  from english.attempts t where t.activity_instance_id = p_activity;

  select pg_catalog.jsonb_build_object('content', d.content, 'revision', d.revision, 'updated_at', d.updated_at)
  into v_draft
  from english.working_drafts d where d.activity_instance_id = p_activity and d.learner_id = v_act.learner_id;

  return pg_catalog.jsonb_build_object(
    'activity_id', v_act.id,
    'instance_id', v_inst.id,
    'step_no', v_act.step_no,
    'activity_type', v_act.activity_type,
    'mode', v_act.mode,
    'purpose', (select coalesce(pg_catalog.jsonb_agg(p order by p), '[]'::jsonb)
                from unnest(v_act.purpose) as p where p in ('delayed_check', 'transfer_check')),
    'date', english.eng_step_effective_date(v_act.id),
    'title_vi', v_inst.snapshot -> 'template' ->> 'title_vi',
    'big_question_en', v_inst.snapshot -> 'template' ->> 'big_question_en',
    'big_question_vi', v_inst.snapshot -> 'template' ->> 'big_question_vi',
    'shape', english.eng_step_shape(v_step),
    'supported', true,
    'can_submit', v_act.mode = 'PRACTICE' or v_count = 0,
    'step', pg_catalog.jsonb_build_object(
      'prompt_en', v_step ->> 'prompt_en',
      'time_min', (v_step ->> 'time_min')::int,
      'self_check_vi', coalesce(v_step -> 'self_check_vi', '[]'::jsonb),
      'items', (select coalesce(pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'id', x ->> 'id', 'kind', x ->> 'kind', 'stem', x ->> 'stem',
                    'options', coalesce(x -> 'options', '[]'::jsonb))
                  order by o), '[]'::jsonb)
                from pg_catalog.jsonb_array_elements(coalesce(v_step -> 'items', '[]'::jsonb)) with ordinality as t(x, o))),
    'attempts', v_attempts,
    'draft', v_draft);
end
$$;

-- Bài đọc / bài nghe của một bước đã mở: tiêu đề, tác giả, bản quyền, loại, liên kết, chữ (CHỈ bài đọc). Không bao giờ trả lời
-- thoại bài nghe, khóa, prompt_vi hay ghi chú. Bước chưa có dòng trong template_step_sources → danh sách rỗng.
create or replace function english.eng_my_step_sources(p_activity uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_act english.activity_instances%rowtype;
  v_inst english.inquiry_instances%rowtype;
begin
  select m.id into v_member from english.members m where m.user_id = auth.uid() and m.role = 'student';
  if v_member is null then return null; end if;

  select a.* into v_act
  from english.activity_instances a
  join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member;
  if not found or not english.eng_activity_released(p_activity) then return null; end if;

  -- Bước app chưa làm được: không phát nguồn nào, chỉ mã bước + nhãn trung tính (cùng nội dung với eng_my_activity).
  if not english.eng_step_supported(v_act.activity_type, v_act.mode) then
    return pg_catalog.jsonb_build_object(
      'activity_id', v_act.id,
      'activity_type', v_act.activity_type,
      'mode', v_act.mode,
      'supported', false,
      'status_label_key', english.eng_step_status_label(v_act.activity_type, v_act.mode));
  end if;

  select * into v_inst from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;

  return (
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'author', s.author,
        'rights_note', s.rights_note,
        'modality', s.modality,
        'url', s.url,
        'text', case when s.modality = 'text' then s.body else null end)
      order by ss.position, s.id), '[]'::jsonb)
    from english.template_step_sources ss
    join english.sources s on s.id = ss.source_id and s.version = ss.source_version and s.published_at is not null
    where ss.template_id = v_inst.template_id
      and ss.template_version = v_inst.template_version
      and ss.step_no = v_act.step_no
      and (v_inst.snapshot -> 'sources') @> pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('id', ss.source_id, 'version', ss.source_version)));
end
$$;

-- Đường đọc cũ của S2 (0007) trả NGUYÊN bước trong snapshot — kể cả mã kỹ năng (target_ids, target_id của câu hỏi) và mục đích bước
-- (purpose: baseline / checkpoint…) — và cho cả bước app chưa làm được. Học sinh không được thấy những thứ đó (kể cả khi gọi thẳng RPC).
-- Thay bằng bản chỉ trả: phần đầu bài + các bước ĐÃ MỞ, mỗi bước chỉ có mã bước, loại, chế độ, ngày hiệu lực, cờ "supported"; riêng bước
-- app làm được (đọc/nghe + trả lời, viết) mới kèm đề (prompt_en, thời lượng, gợi ý tự kiểm, câu hỏi: id/loại/đề/lựa chọn — không đáp án,
-- không mã kỹ năng, không mục đích). Bước chưa làm được trong app: không có đề, câu hỏi hay gợi ý nào, chỉ nhãn trung tính.
-- Phụ huynh / gia sư không dùng hàm này (họ đọc thẳng snapshot, RLS theo learner) nên không mất gì.
create or replace function english.eng_my_released_steps(p_instance uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with me as (
    select m.id from english.members m where m.user_id = auth.uid() and m.role = 'student'
  ),
  inst as (
    select i.id, i.snapshot, i.due_on
    from english.inquiry_instances i
    join english.learners l on l.id = i.learner_id
    join me on l.member_id = me.id
    where i.id = p_instance
  ),
  released as (
    select a.id as activity_id, a.step_no, a.activity_type, a.mode,
           english.eng_step_effective_date(a.id) as eff_date,
           english.eng_step_supported(a.activity_type, a.mode) as supported
    from english.activity_instances a
    join inst on a.inquiry_instance_id = inst.id
    where english.eng_activity_released(a.id)
  )
  select pg_catalog.jsonb_build_object(
    'instance_id', inst.id,
    'title_vi', inst.snapshot -> 'template' ->> 'title_vi',
    'big_question_en', inst.snapshot -> 'template' ->> 'big_question_en',
    'big_question_vi', inst.snapshot -> 'template' ->> 'big_question_vi',
    'due_on', inst.due_on,
    'steps', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'activity_id', r.activity_id,
          'step_no', r.step_no,
          'activity_type', r.activity_type,
          'mode', r.mode,
          'planned_date', r.eff_date,
          'supported', r.supported)
        || case
             when r.supported then (
               select pg_catalog.jsonb_build_object(
                 'prompt_en', st.x ->> 'prompt_en',
                 'time_min', (st.x ->> 'time_min')::int,
                 'self_check_vi', coalesce(st.x -> 'self_check_vi', '[]'::jsonb),
                 'items', (select coalesce(pg_catalog.jsonb_agg(
                             pg_catalog.jsonb_build_object(
                               'id', it ->> 'id', 'kind', it ->> 'kind', 'stem', it ->> 'stem',
                               'options', coalesce(it -> 'options', '[]'::jsonb))
                             order by o), '[]'::jsonb)
                           from pg_catalog.jsonb_array_elements(coalesce(st.x -> 'items', '[]'::jsonb)) with ordinality as t(it, o)))
               from (select x from pg_catalog.jsonb_array_elements(inst.snapshot -> 'steps') as x
                     where (x ->> 'step_no')::int = r.step_no) st)
             else pg_catalog.jsonb_build_object('status_label_key', english.eng_step_status_label(r.activity_type, r.mode))
           end
        order by r.step_no)
      from released r
    ), '[]'::jsonb))
  from inst
$$;
revoke execute on function english.eng_my_released_steps(uuid) from public, anon;
grant execute on function english.eng_my_released_steps(uuid) to authenticated;

-- Quyền thực thi: CHỈ authenticated (người gọi được nhận diện bằng auth.uid() bên trong hàm); không anon, không public.
revoke execute on function english.eng_save_draft(uuid, jsonb, int) from public, anon, service_role;
revoke execute on function english.eng_submit_attempt(uuid, uuid, jsonb, text[], text) from public, anon, service_role;
revoke execute on function english.eng_my_inquiries() from public, anon, service_role;
revoke execute on function english.eng_my_home() from public, anon, service_role;
revoke execute on function english.eng_my_activity(uuid) from public, anon, service_role;
revoke execute on function english.eng_my_step_sources(uuid) from public, anon, service_role;
grant execute on function english.eng_save_draft(uuid, jsonb, int) to authenticated;
grant execute on function english.eng_submit_attempt(uuid, uuid, jsonb, text[], text) to authenticated;
grant execute on function english.eng_my_inquiries() to authenticated;
grant execute on function english.eng_my_home() to authenticated;
grant execute on function english.eng_my_activity(uuid) to authenticated;
grant execute on function english.eng_my_step_sources(uuid) to authenticated;


-- Purge: thêm các bảng của S4 (con trước, cha sau). Thân hàm = bản của 0007 + các dòng S4 (chỉ THÊM dòng, không bỏ dòng nào;
-- có test đối chiếu từng dòng). --
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
  delete from english.attempt_auto_checks c where c.learner_id = p_learner_id;
  get diagnostics n_auto_checks = row_count;

  delete from english.episodes e where e.learner_id = p_learner_id;
  get diagnostics n_episodes = row_count;

  delete from english.exposure_log x where x.learner_id = p_learner_id;
  get diagnostics n_exposure = row_count;

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

-- RLS ---------------------------------------------------------------------------------------------------------------------------
alter table english.template_step_sources enable row level security;
alter table english.working_drafts enable row level security;
alter table english.attempts enable row level security;
alter table english.artifact_versions enable row level security;
alter table english.assistance_events enable row level security;
alter table english.exposure_log enable row level security;
alter table english.episodes enable row level security;
alter table english.attempt_auto_checks enable row level security;

drop policy if exists template_step_sources_select on english.template_step_sources;
create policy template_step_sources_select on english.template_step_sources
  for select to authenticated
  using (english.eng_staff_may_read_template(template_id, template_version));

-- Nháp, bài nộp và nội dung bài nộp: chính học sinh đó + phụ huynh / gia sư trong phạm vi (DESIGN §7). Không có cột kết quả tự chấm ở đây.
drop policy if exists working_drafts_select on english.working_drafts;
create policy working_drafts_select on english.working_drafts
  for select to authenticated
  using (english.eng_can_read_learner(learner_id));

drop policy if exists attempts_select on english.attempts;
create policy attempts_select on english.attempts
  for select to authenticated
  using (english.eng_can_read_learner(learner_id));

drop policy if exists artifact_versions_select on english.artifact_versions;
create policy artifact_versions_select on english.artifact_versions
  for select to authenticated
  using (english.eng_can_read_learner(learner_id));

-- Kết quả tự chấm, hỗ trợ đã khai báo (có mã kỹ năng), lần tiếp xúc, episode: CHỈ phụ huynh / gia sư. Học sinh: không bao giờ.
drop policy if exists assistance_events_select on english.assistance_events;
create policy assistance_events_select on english.assistance_events
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

drop policy if exists exposure_log_select on english.exposure_log;
create policy exposure_log_select on english.exposure_log
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

drop policy if exists episodes_select on english.episodes;
create policy episodes_select on english.episodes
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

drop policy if exists attempt_auto_checks_select on english.attempt_auto_checks;
create policy attempt_auto_checks_select on english.attempt_auto_checks
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- Grant theo từng bảng (không dùng "on all tables") -----------------------------------------------------------------------------
grant select on
  english.template_step_sources, english.working_drafts, english.attempts, english.artifact_versions,
  english.assistance_events, english.exposure_log, english.episodes, english.attempt_auto_checks
  to authenticated;

-- Ghi chỉ qua eng_save_draft / eng_submit_attempt (security definer) và migration (chủ sở hữu).
revoke insert, update, delete, truncate on
  english.template_step_sources, english.working_drafts, english.attempts, english.artifact_versions,
  english.assistance_events, english.exposure_log, english.episodes, english.attempt_auto_checks
  from public, anon, authenticated, service_role;
revoke all on
  english.template_step_sources, english.working_drafts, english.attempts, english.artifact_versions,
  english.assistance_events, english.exposure_log, english.episodes, english.attempt_auto_checks
  from anon;

insert into english.schema_migrations(version) values ('0009') on conflict do nothing;
