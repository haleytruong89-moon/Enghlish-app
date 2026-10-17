-- 0014_tutor_work.sql
-- S5b-1 (PR A, bước 2): bài của gia sư — nhãn lỗi, khung đề, kết quả bài, dấu nhãn (tag_marks), ghi buổi học v2 (nhãn cần củng cố,
-- lời nhắn, kiểm tra lại), nhãn cho bài viết, và "Điểm cần chú ý" (docs/plans/s5b1-tutor-work.md).
--
-- Quy tắc đo lường (ép trong DB):
--  1. Kết quả bài / bài luyện là TÍN HIỆU, không phải bằng chứng: KHÔNG ghi gì vào observations / validation_decisions; engine (S7) bỏ qua.
--  2. Chỉ LẦN LÀM ĐẦU của một bài vào "Điểm cần chú ý". Làm lại ghi attempt = 'retry' (counts = false). Dòng bị thay (supersedes) không tính.
--  3. Bài làm TRONG BUỔI (context = 'class'): chỉ gia sư còn quan hệ hiệu lực ghi được (kiểu D15). Phụ huynh bị chặn trong DB.
--  4. Học sinh KHÔNG đọc bảng nào ở đây (RLS chỉ cho phụ huynh/gia sư trong phạm vi) và không có hàm nào cho học sinh trong PR này.
--  5. "Đến hạn kiểm tra lại" = lần ghi nhãn gần nhất + delayedMinDaysFromLastExposure của chính sách đánh giá của em (assessment_policies),
--     KHÔNG viết cứng số ngày.
--  6. Không lưu chữ đề thi: khung đề chỉ có số câu → phần → nhãn.
-- Ghi chỉ qua hàm security definer (service_role sau requireAccess; hàm kiểm lại người thao tác). Bảng ghi lịch sử là append-only.
-- Không đụng schema public. Idempotent. Chỉ THÊM (expand): lesson_notes chỉ thêm cột / nới NOT NULL của support_level.

-- Nhãn lỗi ------------------------------------------------------------------------------------------------------------------------------
-- key: chữ thường không dấu, duy nhất trong một track (nhãn riêng của gia đình bắt đầu bằng "x-" nên không đụng nhãn có sẵn).
-- family_id NULL = nhãn có sẵn (seed, migration 0015); có giá trị = nhãn gia đình tự thêm (origin 'custom').
create table if not exists english.error_tags (
  id uuid primary key default gen_random_uuid(),
  track_id text not null references english.tracks(id),
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  label_vi text not null check (pg_catalog.length(pg_catalog.btrim(label_vi)) between 1 and 120),
  group_vi text check (group_vi is null or pg_catalog.length(pg_catalog.btrim(group_vi)) between 1 and 60),
  family_id uuid references english.families(id),
  origin text not null check (origin in ('seed', 'custom')),
  -- id của english.members, KHÔNG có khóa ngoại (xóa tài khoản không làm hỏng lịch sử).
  created_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  constraint error_tags_origin_shape check (
    (origin = 'seed' and family_id is null and key !~ '^x-') or (origin = 'custom' and family_id is not null and key ~ '^x-'))
);
create unique index if not exists error_tags_key_once on english.error_tags(track_id, key);
-- Chỉ nhãn còn dùng: nhãn đã nghỉ dùng (retired_at) không chặn việc tạo lại nhãn cùng tên.
create unique index if not exists error_tags_label_once on english.error_tags(track_id, coalesce(family_id, '00000000-0000-0000-0000-000000000000'::uuid), pg_catalog.lower(label_vi))
  where retired_at is null;

-- Khung đề -------------------------------------------------------------------------------------------------------------------------------
-- parts: [{key, name, from, to}]; items: [{n, part, tag_key}] (đủ 1..total_items, mỗi số đúng một lần); scale: null hoặc
-- [{min, max, label}] (thang của đề, vd. 54–60 "Rất tốt"). Không có chữ đề thi. Chỉ thêm; bản mới trỏ supersedes_id.
create table if not exists english.test_frames (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references english.families(id),
  track_id text not null references english.tracks(id),
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 200),
  total_items int not null check (total_items between 1 and 300),
  parts jsonb not null,
  items jsonb not null,
  scale jsonb,
  supersedes_id uuid references english.test_frames(id),
  created_by uuid,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists test_frames_supersedes_once on english.test_frames(supersedes_id) where supersedes_id is not null;
create unique index if not exists test_frames_first_once on english.test_frames(family_id, track_id, pg_catalog.lower(title)) where supersedes_id is null;

-- Nhãn có dùng được cho track + gia đình này không (chưa nghỉ dùng). Hàm nội bộ.
create or replace function english.eng_tag_exists(p_track text, p_family uuid, p_key text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from english.error_tags t
    where t.track_id = p_track and t.key = p_key and t.retired_at is null and (t.family_id is null or t.family_id = p_family))
$$;

-- Kiểm khung đề: đủ 1..N đúng một lần, phần hợp lệ, nhãn có trong track, thang không chồng nhau.
create or replace function english.eng_check_test_frame() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_n int;
begin
  if pg_catalog.jsonb_typeof(new.parts) is distinct from 'array' or pg_catalog.jsonb_array_length(new.parts) not between 1 and 30 then
    raise exception 'test_frames: parts must be a list of 1 to 30 parts' using errcode = '23514';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(new.parts) x
    where pg_catalog.jsonb_typeof(x) <> 'object'
       or pg_catalog.jsonb_typeof(x -> 'key') is distinct from 'string' or pg_catalog.jsonb_typeof(x -> 'name') is distinct from 'string'
       or (x ->> 'from') is null or (x ->> 'from') !~ '^[0-9]+$' or (x ->> 'to') is null or (x ->> 'to') !~ '^[0-9]+$'
       or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(x)) <> 4) then
    raise exception 'test_frames: each part is {key, name, from, to}' using errcode = '23514';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(new.parts) x
    where pg_catalog.length(pg_catalog.btrim(x ->> 'key')) not between 1 and 20
       or pg_catalog.length(pg_catalog.btrim(x ->> 'name')) not between 1 and 120
       or (x ->> 'from')::int < 1 or (x ->> 'to')::int > new.total_items or (x ->> 'from')::int > (x ->> 'to')::int) then
    raise exception 'test_frames: a part has an empty name or a range outside 1..total_items' using errcode = '23514';
  end if;
  if (select pg_catalog.count(distinct x ->> 'key') from pg_catalog.jsonb_array_elements(new.parts) x) <> pg_catalog.jsonb_array_length(new.parts) then
    raise exception 'test_frames: part keys must be different' using errcode = '23514';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(new.parts) a, pg_catalog.jsonb_array_elements(new.parts) b
    where a ->> 'key' < b ->> 'key'
      and (a ->> 'from')::int <= (b ->> 'to')::int and (b ->> 'from')::int <= (a ->> 'to')::int) then
    raise exception 'test_frames: parts must not overlap' using errcode = '23514';
  end if;

  if pg_catalog.jsonb_typeof(new.items) is distinct from 'array' or pg_catalog.jsonb_array_length(new.items) <> new.total_items then
    raise exception 'test_frames: items must list every item 1..total_items exactly once' using errcode = '23514';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(new.items) x
    where pg_catalog.jsonb_typeof(x) <> 'object'
       or pg_catalog.jsonb_typeof(x -> 'part') is distinct from 'string' or pg_catalog.jsonb_typeof(x -> 'tag_key') is distinct from 'string'
       or (x ->> 'n') is null or (x ->> 'n') !~ '^[0-9]+$'
       or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(x)) <> 3) then
    raise exception 'test_frames: each item is {n, part, tag_key}' using errcode = '23514';
  end if;
  select pg_catalog.count(distinct (x ->> 'n')::int) into v_n from pg_catalog.jsonb_array_elements(new.items) x
  where (x ->> 'n')::int between 1 and new.total_items;
  if v_n <> new.total_items then
    raise exception 'test_frames: items must cover 1..total_items exactly once' using errcode = '23514';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(new.items) x
    where not exists (
      select 1 from pg_catalog.jsonb_array_elements(new.parts) p
      where p ->> 'key' = x ->> 'part' and (x ->> 'n')::int between (p ->> 'from')::int and (p ->> 'to')::int)) then
    raise exception 'test_frames: every item must sit in a part whose range contains it' using errcode = '23514';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(new.items) x
    where not english.eng_tag_exists(new.track_id, new.family_id, x ->> 'tag_key')) then
    raise exception 'test_frames: a tag does not exist for this track' using errcode = '23514';
  end if;

  if new.scale is not null then
    if pg_catalog.jsonb_typeof(new.scale) is distinct from 'array' or pg_catalog.jsonb_array_length(new.scale) not between 1 and 12 then
      raise exception 'test_frames: scale must be a list of 1 to 12 bands' using errcode = '23514';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(new.scale) x
      where pg_catalog.jsonb_typeof(x) <> 'object'
         or pg_catalog.jsonb_typeof(x -> 'label') is distinct from 'string'
         or (x ->> 'min') is null or (x ->> 'min') !~ '^[0-9]+$' or (x ->> 'max') is null or (x ->> 'max') !~ '^[0-9]+$'
         or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(x)) <> 3) then
      raise exception 'test_frames: each scale band is {min, max, label}' using errcode = '23514';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(new.scale) x
      where pg_catalog.length(pg_catalog.btrim(x ->> 'label')) not between 1 and 60
         or (x ->> 'min')::int > (x ->> 'max')::int or (x ->> 'max')::int > new.total_items) then
      raise exception 'test_frames: a scale band is empty, has no label or goes past total_items' using errcode = '23514';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(new.scale) with ordinality a(x, i),
                    pg_catalog.jsonb_array_elements(new.scale) with ordinality b(y, j)
      where i < j and (x ->> 'min')::int <= (y ->> 'max')::int and (y ->> 'min')::int <= (x ->> 'max')::int) then
      raise exception 'test_frames: scale bands must not overlap' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
revoke execute on function english.eng_check_test_frame() from public, anon, authenticated;

drop trigger if exists test_frames_check on english.test_frames;
create trigger test_frames_check before insert on english.test_frames for each row execute function english.eng_check_test_frame();

-- Danh sách số câu hợp lệ: không NULL, không trùng, trong 1..total.
create or replace function english.eng_valid_item_list(p_arr int[], p_total int) returns boolean
language sql immutable set search_path = ''
as $$
  select p_arr is not null and p_total is not null
     and not exists (select 1 from unnest(p_arr) x where x is null or x < 1 or x > p_total)
     and (select pg_catalog.count(distinct x) from unnest(p_arr) x) = cardinality(p_arr)
$$;

-- Gốc của một chuỗi phiên bản khung đề (mọi phiên bản của cùng một đề có cùng gốc). Hàm nội bộ.
create or replace function english.eng_frame_root(p_frame uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  with recursive up(id, supersedes_id) as (
    select f.id, f.supersedes_id from english.test_frames f where f.id = p_frame
    union all
    select f.id, f.supersedes_id from english.test_frames f join up on f.id = up.supersedes_id
  )
  select up.id from up where up.supersedes_id is null
$$;

-- Kết quả một bài ------------------------------------------------------------------------------------------------------------------------
-- mode 'frame': câu → nhãn lấy từ khung đề; 'quick': điểm + số câu sai + nhãn từng câu sai (câu chưa có nhãn = chờ gắn nhãn).
-- item_tags chỉ chứa CÁC CÂU SAI: [{n, tag_key | null}]. Chỉ thêm; sửa = dòng mới trỏ supersedes_id.
create table if not exists english.results (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  -- PR B (0016) gắn khóa ngoại tới bài được giao; ở PR A luôn NULL (bài trên giấy / không có bài giao).
  assignment_id uuid,
  frame_id uuid references english.test_frames(id),
  mode text not null check (mode in ('frame', 'quick')),
  context text not null check (context in ('home', 'class')),
  attempt text not null check (attempt in ('first', 'retry')),
  -- Nguồn của dấu nhãn: 'test' (bài kiểm tra) hoặc 'practice' (bài luyện). Đề có khung luôn là 'test'; nhập nhanh do người ghi chọn (mặc định 'practice').
  source text not null default 'practice' check (source in ('test', 'practice')),
  used_hint boolean not null default false,
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 200),
  total_items int not null check (total_items between 1 and 500),
  correct int not null,
  wrong_items int[] not null default '{}',
  item_tags jsonb not null default '[]'::jsonb check (pg_catalog.jsonb_typeof(item_tags) = 'array'),
  taken_on date not null,
  recorded_by_member uuid not null,
  recorded_role text not null check (recorded_role in ('tutor', 'parent')),
  supersedes_id uuid references english.results(id),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint results_counts check (
    correct between 0 and total_items
    and cardinality(wrong_items) = total_items - correct
    and english.eng_valid_item_list(wrong_items, total_items)),
  constraint results_mode_frame check ((mode = 'frame') = (frame_id is not null)),
  constraint results_source_frame check (mode <> 'frame' or source = 'test')
);
create unique index if not exists results_supersedes_once on english.results(supersedes_id) where supersedes_id is not null;
create index if not exists results_learner_idx on english.results(learner_id, taken_on desc);

-- Dấu nhãn: mỗi dòng = "nhãn này sai/cần củng cố ở nguồn này". counts = false cho làm lại (retry). Dòng của nguồn đã bị thay thế KHÔNG tính
-- (hàm đọc loại ra). source_id trỏ tới results.id / lesson_notes.id / episodes.id tùy source (nên không có khóa ngoại).
create table if not exists english.tag_marks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  tag_key text not null check (pg_catalog.length(pg_catalog.btrim(tag_key)) > 0),
  source text not null check (source in ('test', 'practice', 'lesson', 'writing')),
  source_id uuid not null,
  item_no int check (item_no is null or item_no >= 1),
  counts boolean not null,
  -- Ngày của sự việc (ngày làm bài / ngày buổi học), để tính "đến hạn kiểm tra lại" theo ngày thật chứ không theo ngày nhập.
  marked_on date not null,
  recorded_by_member uuid,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists tag_marks_once on english.tag_marks(source, source_id, tag_key, coalesce(item_no, 0));
create index if not exists tag_marks_learner_idx on english.tag_marks(learner_id, tag_key, marked_on desc);
create index if not exists tag_marks_source_idx on english.tag_marks(source_id);

-- Ghi chú buổi học: thêm cột (ghi buổi học v2) --------------------------------------------------------------------------------------------
alter table english.lesson_notes add column if not exists weak_tag_keys text[] not null default '{}'
  check (cardinality(weak_tag_keys) <= 3);
alter table english.lesson_notes add column if not exists message_to_learner text
  check (message_to_learner is null or pg_catalog.length(message_to_learner) <= 500);
alter table english.lesson_notes add column if not exists note_for_parent text
  check (note_for_parent is null or pg_catalog.length(note_for_parent) <= 1000);
alter table english.lesson_notes add column if not exists author_role text not null default 'tutor'
  check (author_role in ('tutor', 'parent'));
-- Ghi buổi học v2 không có ô "mức hỗ trợ": nới NOT NULL (hàm cũ vẫn luôn truyền giá trị; ràng buộc giá trị hợp lệ giữ nguyên).
alter table english.lesson_notes alter column support_level drop not null;

-- Kết quả kiểm tra lại một nhãn trong buổi học: ok / còn sai / chưa hỏi. Chỉ thêm.
create table if not exists english.recheck_events (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  tag_key text not null check (pg_catalog.length(pg_catalog.btrim(tag_key)) > 0),
  lesson_note_id uuid not null references english.lesson_notes(id),
  result text not null check (result in ('ok', 'still_wrong', 'not_asked')),
  recorded_by_member uuid,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists recheck_events_once on english.recheck_events(lesson_note_id, tag_key);
create index if not exists recheck_events_learner_idx on english.recheck_events(learner_id, tag_key, created_at desc);

-- Append-only (theo hướng dẫn đầu 0004) --------------------------------------------------------------------------------------------------
do $$
declare
  t text;
  col text;
begin
  foreach t in array array['results', 'tag_marks', 'recheck_events', 'test_frames'] loop
    -- test_frames không có learner_id (khung đề thuộc gia đình): '*' = chỉ cho phép trong eng_purge_learner, và hàm đó không xóa khung đề.
    col := case when t = 'test_frames' then '*' else 'learner_id' end;
    execute format('drop trigger if exists %I on english.%I', t || '_forbid_mutation', t);
    execute format(
      'create trigger %I before update or delete on english.%I for each row execute function english.eng_forbid_mutation(%L)',
      t || '_forbid_mutation', t, col);
    execute format('drop trigger if exists %I on english.%I', t || '_forbid_truncate', t);
    execute format(
      'create trigger %I before truncate on english.%I for each statement execute function english.eng_forbid_mutation()',
      t || '_forbid_truncate', t);
  end loop;
end
$$;

-- Hàm ghi ---------------------------------------------------------------------------------------------------------------------------------

-- Thêm nhãn riêng của gia đình (ô "+ nhãn khác"). Gia sư hoặc phụ huynh của em; nhãn thuộc track của em.
-- p_key là PHẦN ĐẦU "x-<tên-không-dấu>" do máy chủ làm từ tên nhãn; hàm TỰ THÊM đuôi ngẫu nhiên 5 ký tự để key luôn duy nhất toàn cục
-- (hai gia đình, hoặc hai tên gần giống nhau như "Đảo ngữ" / "Dao ngu!", không bao giờ đụng nhau) và không để lộ nhãn của gia đình khác.
-- Cùng tên (không phân biệt hoa/thường và khoảng trắng thừa) trong gia đình (hoặc trùng nhãn có sẵn) → trả nhãn đang dùng, không tạo thêm.
-- Nhãn đã nghỉ dùng không được trả lại: tạo nhãn mới còn dùng.
create or replace function english.eng_add_error_tag(p_learner uuid, p_key text, p_label text, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_learner english.learners%rowtype;
  v_label text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  v_existing english.error_tags%rowtype;
  v_key text;
  v_try int := 0;
begin
  if p_learner is null or p_key is null or p_by is null then
    raise exception 'eng_add_error_tag: learner, key and actor are required' using errcode = '22004';
  end if;
  select * into v_learner from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_add_error_tag: learner not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from english.members m where m.id = p_by and m.role in ('tutor', 'parent')) or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_add_error_tag: this member may not add tags for this learner' using errcode = '42501';
  end if;
  if p_key !~ '^x-[a-z0-9][a-z0-9-]{0,44}$' or pg_catalog.length(v_label) not between 2 and 120 then
    raise exception 'eng_add_error_tag: key must look like x-name and the label be 2 to 120 characters' using errcode = '22023';
  end if;

  -- Hai lần thêm cùng tên cùng lúc trong một gia đình xếp hàng (khóa theo gia đình + tên).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('error_tag:' || v_learner.family_id::text || ':' || v_learner.track_id || ':' || pg_catalog.lower(v_label), 0));
  select * into v_existing from english.error_tags t
  where t.track_id = v_learner.track_id and (t.family_id is null or t.family_id = v_learner.family_id)
    and t.retired_at is null and pg_catalog.lower(t.label_vi) = pg_catalog.lower(v_label)
  order by t.family_id nulls first limit 1;
  if found then
    return pg_catalog.jsonb_build_object('key', v_existing.key, 'label_vi', v_existing.label_vi, 'created', false);
  end if;

  loop
    v_try := v_try + 1;
    v_key := p_key || '-' || pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::text || pg_catalog.clock_timestamp()::text || v_try::text), 1, 5);
    begin
      insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin, created_by)
      values (v_learner.track_id, v_key, v_label, 'Nhãn riêng', v_learner.family_id, 'custom', p_by);
      exit;
    exception when unique_violation then
      -- Chỉ có thể là key trùng (cùng tên đã được khóa ở trên): thử đuôi khác, không báo lỗi để lộ nhãn của nhà khác.
      if v_try >= 10 then
        raise exception 'eng_add_error_tag: could not make a unique key, try again' using errcode = 'P0001';
      end if;
    end;
  end loop;
  return pg_catalog.jsonb_build_object('key', v_key, 'label_vi', v_label, 'created', true);
end
$$;

-- Ghi kết quả một bài (xem chú thích bảng results). Trả {id, replayed, untagged}.
create or replace function english.eng_record_result(
  p_learner uuid,
  p_mode text,
  p_frame uuid,
  p_title text,
  p_total int,
  p_correct int,
  p_wrong int[],
  p_tags jsonb,
  p_context text,
  p_attempt text,
  p_used_hint boolean,
  p_taken_on date,
  p_assignment uuid,
  p_supersedes uuid,
  p_by uuid,
  p_client_id text,
  -- 'test' | 'practice' cho nhập nhanh (NULL = 'practice'); đề có khung luôn là 'test'.
  p_source text default null
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_learner english.learners%rowtype;
  v_member english.members%rowtype;
  v_frame english.test_frames%rowtype;
  v_old english.results%rowtype;
  v_src text;
  v_existing english.results%rowtype;
  v_title text := nullif(pg_catalog.btrim(coalesce(p_title, '')), '');
  v_total int;
  v_correct int;
  v_wrong int[];
  v_tags jsonb;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_source text;
  v_untagged int;
  v_given int;
begin
  if p_learner is null or p_mode is null or p_context is null or p_attempt is null or p_used_hint is null or p_taken_on is null or p_by is null then
    raise exception 'eng_record_result: learner, mode, context, attempt, hint, date and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_record_result: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if p_mode not in ('frame', 'quick') or p_context not in ('home', 'class') or p_attempt not in ('first', 'retry') then
    raise exception 'eng_record_result: unknown mode, context or attempt' using errcode = '22023';
  end if;
  if p_source is not null and p_source not in ('test', 'practice') then
    raise exception 'eng_record_result: unknown source' using errcode = '22023';
  end if;
  if p_mode = 'frame' and p_source is not null and p_source <> 'test' then
    raise exception 'eng_record_result: a framed result is always a test' using errcode = '22023';
  end if;
  v_src := case when p_mode = 'frame' then 'test' else coalesce(p_source, 'practice') end;

  -- Khóa dòng em: hai lần ghi cùng lúc xếp hàng.
  select * into v_learner from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_record_result: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_record_result: this member may not record results for this learner' using errcode = '42501';
  end if;
  -- Kiểu D15: bài làm trong buổi chỉ gia sư còn quan hệ hiệu lực ghi.
  if p_context = 'class' and v_member.role <> 'tutor' then
    raise exception 'eng_record_result: only a tutor may record work done in the session (D15)' using errcode = '42501';
  end if;
  if p_taken_on > english.eng_today_vn() or p_taken_on < english.eng_today_vn() - 120 then
    raise exception 'eng_record_result: the date must be within the last 120 days, not in the future' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(coalesce(p_wrong, '{}')) x where x is null) then
    raise exception 'eng_record_result: wrong item numbers must be numbers' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_wrong from unnest(coalesce(p_wrong, '{}')) x;
  if cardinality(v_wrong) <> cardinality(coalesce(p_wrong, '{}')) then
    raise exception 'eng_record_result: a wrong item number appears twice' using errcode = '22023';
  end if;

  if p_mode = 'frame' then
    if p_frame is null then
      raise exception 'eng_record_result: a framed result needs a frame' using errcode = '22004';
    end if;
    select * into v_frame from english.test_frames f where f.id = p_frame;
    if not found or v_frame.family_id <> v_learner.family_id or v_frame.track_id <> v_learner.track_id
       or exists (select 1 from english.test_frames f2 where f2.supersedes_id = v_frame.id) then
      raise exception 'eng_record_result: this frame is not available for this learner' using errcode = '23514';
    end if;
    if p_tags is not null and pg_catalog.jsonb_typeof(p_tags) = 'array' and pg_catalog.jsonb_array_length(p_tags) > 0 then
      raise exception 'eng_record_result: a framed result takes its tags from the frame' using errcode = '22023';
    end if;
    v_total := v_frame.total_items;
    if not english.eng_valid_item_list(v_wrong, v_total) then
      raise exception 'eng_record_result: wrong item numbers must be inside the test' using errcode = '23514';
    end if;
    v_correct := v_total - cardinality(v_wrong);
    v_title := coalesce(v_title, v_frame.title);
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', (x ->> 'n')::int, 'tag_key', x ->> 'tag_key') order by (x ->> 'n')::int), '[]'::jsonb)
      into v_tags
    from pg_catalog.jsonb_array_elements(v_frame.items) x
    where (x ->> 'n')::int = any (v_wrong);
  else
    if p_frame is not null then
      raise exception 'eng_record_result: a quick result has no frame' using errcode = '22023';
    end if;
    if p_total is null or p_correct is null or p_total not between 1 and 500 or p_correct not between 0 and p_total then
      raise exception 'eng_record_result: give the number of items and how many were right' using errcode = '22023';
    end if;
    v_total := p_total;
    v_correct := p_correct;
    if cardinality(v_wrong) <> v_total - v_correct or not english.eng_valid_item_list(v_wrong, v_total) then
      raise exception 'eng_record_result: list exactly the wrong items (as many as total minus right), each inside the test' using errcode = '23514';
    end if;
    if v_title is null then
      raise exception 'eng_record_result: a quick result needs a title' using errcode = '22004';
    end if;
    if p_tags is not null and pg_catalog.jsonb_typeof(p_tags) <> 'array' then
      raise exception 'eng_record_result: tags must be a list' using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) x
      where pg_catalog.jsonb_typeof(x) <> 'object' or (x ->> 'n') is null or (x ->> 'n') !~ '^[0-9]+$'
         or (pg_catalog.jsonb_typeof(x -> 'tag_key') not in ('string', 'null') and (x -> 'tag_key') is not null)) then
      raise exception 'eng_record_result: each tag is {n, tag_key}' using errcode = '22023';
    end if;
    select pg_catalog.count(*) into v_given from pg_catalog.jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) x;
    if v_given <> (select pg_catalog.count(distinct (x ->> 'n')::int) from pg_catalog.jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) x)
       or exists (
         select 1 from pg_catalog.jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) x
         where not ((x ->> 'n')::int = any (v_wrong))) then
      raise exception 'eng_record_result: tags must be for wrong items, once each' using errcode = '23514';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) x
      where (x ->> 'tag_key') is not null and not english.eng_tag_exists(v_learner.track_id, v_learner.family_id, x ->> 'tag_key')) then
      raise exception 'eng_record_result: a tag does not exist for this learner''s track' using errcode = '23514';
    end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', w.n, 'tag_key', t.tag_key) order by w.n), '[]'::jsonb)
      into v_tags
    from unnest(v_wrong) as w(n)
    left join lateral (
      select x ->> 'tag_key' as tag_key from pg_catalog.jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) x where (x ->> 'n')::int = w.n limit 1
    ) t on true;
  end if;
  if pg_catalog.length(v_title) > 200 then
    raise exception 'eng_record_result: the title is too long' using errcode = '23514';
  end if;

  -- Gửi lại: cùng kết quả.
  select r.* into v_existing from english.results r where r.learner_id = p_learner and r.client_id = p_client_id;
  if found then
    if v_existing.mode <> p_mode or v_existing.frame_id is distinct from p_frame or v_existing.context <> p_context
       or v_existing.attempt <> p_attempt or v_existing.source <> v_src or v_existing.used_hint <> p_used_hint or v_existing.taken_on <> p_taken_on
       or v_existing.total_items <> v_total or v_existing.wrong_items <> v_wrong or v_existing.item_tags <> v_tags
       or v_existing.recorded_by_member <> p_by or v_existing.supersedes_id is distinct from p_supersedes then
      raise exception 'eng_record_result: client_id was already used for a different result' using errcode = '23505';
    end if;
    select pg_catalog.count(*) into v_untagged from pg_catalog.jsonb_array_elements(v_existing.item_tags) x where (x ->> 'tag_key') is null;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'replayed', true, 'untagged', v_untagged);
  end if;

  -- Một bài kiểm tra có khung chỉ có MỘT lần làm đầu hiện hành cho mỗi em (mọi phiên bản của khung đề): lần nữa phải là "làm lại"
  -- hoặc thay chính bản đã ghi (supersedes). Thông báo có (duplicate_first) để máy chủ trả mã riêng.
  if p_mode = 'frame' and p_attempt = 'first' and exists (
    select 1 from english.results r2
    where r2.learner_id = p_learner and r2.mode = 'frame' and r2.attempt = 'first'
      and english.eng_frame_root(r2.frame_id) = english.eng_frame_root(p_frame)
      and not exists (select 1 from english.results r3 where r3.supersedes_id = r2.id)
      and r2.id is distinct from p_supersedes) then
    raise exception 'eng_record_result: this test already has a first attempt (duplicate_first)' using errcode = '23505';
  end if;

  -- Thay một kết quả: cùng em, CHỈ người đã ghi bản gốc được thay; bản gốc làm trong buổi (class) chỉ gia sư (D15).
  if p_supersedes is not null then
    select * into v_old from english.results r where r.id = p_supersedes and r.learner_id = p_learner;
    if not found then
      raise exception 'eng_record_result: the result to replace was not found' using errcode = 'P0002';
    end if;
    if v_old.recorded_by_member <> p_by then
      raise exception 'eng_record_result: only the member who recorded a result may replace it' using errcode = '42501';
    end if;
    if v_old.context = 'class' and v_member.role <> 'tutor' then
      raise exception 'eng_record_result: only a tutor may replace work done in the session (D15)' using errcode = '42501';
    end if;
    if exists (select 1 from english.results r where r.supersedes_id = p_supersedes) then
      raise exception 'eng_record_result: that result was already replaced' using errcode = '23505';
    end if;
  end if;

  insert into english.results(
    id, learner_id, assignment_id, frame_id, mode, context, attempt, source, used_hint, title, total_items, correct, wrong_items, item_tags,
    taken_on, recorded_by_member, recorded_role, supersedes_id, client_id)
  values (v_id, p_learner, p_assignment, case when p_mode = 'frame' then p_frame else null end, p_mode, p_context, p_attempt, v_src, p_used_hint,
          v_title, v_total, v_correct, v_wrong, v_tags, p_taken_on, p_by, v_member.role, p_supersedes, p_client_id);

  -- Dấu nhãn cho các câu sai ĐÃ có nhãn. counts = false cho làm lại. Đề có khung = "bài kiểm tra"; nhập nhanh theo lựa chọn (mặc định "bài luyện").
  v_source := v_src;
  insert into english.tag_marks(learner_id, tag_key, source, source_id, item_no, counts, marked_on, recorded_by_member)
  select p_learner, x ->> 'tag_key', v_source, v_id, (x ->> 'n')::int, p_attempt = 'first', p_taken_on, p_by
  from pg_catalog.jsonb_array_elements(v_tags) x
  where (x ->> 'tag_key') is not null;

  select pg_catalog.count(*) into v_untagged from pg_catalog.jsonb_array_elements(v_tags) x where (x ->> 'tag_key') is null;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'result.recorded', v_learner.family_id, p_learner,
          pg_catalog.jsonb_build_object('result', v_id, 'mode', p_mode, 'context', p_context, 'attempt', p_attempt, 'supersedes', p_supersedes));

  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false, 'untagged', v_untagged);
end
$$;

-- Gắn nhãn cho các câu sai CHƯA có nhãn của một kết quả (gia sư trước, phụ huynh dự phòng). p_items: [{n, tag_key}].
-- Câu đã gắn cùng nhãn → bỏ qua (gửi lại); đã gắn nhãn khác → 23505. Không đổi dòng kết quả (append-only): chỉ thêm tag_marks.
create or replace function english.eng_tag_result_items(p_result uuid, p_items jsonb, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_r english.results%rowtype;
  v_learner english.learners%rowtype;
  v_member english.members%rowtype;
  v_source text;
  v_item jsonb;
  v_n int;
  v_key text;
  v_old text;
  v_added int := 0;
begin
  if p_result is null or p_by is null or p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception 'eng_tag_result_items: result, actor and a list of {n, tag_key} are required' using errcode = '22004';
  end if;
  if pg_catalog.jsonb_array_length(p_items) not between 1 and 200 then
    raise exception 'eng_tag_result_items: 1 to 200 items' using errcode = '22023';
  end if;
  select * into v_r from english.results r where r.id = p_result;
  if not found then
    raise exception 'eng_tag_result_items: result not found' using errcode = 'P0002';
  end if;
  select * into v_learner from english.learners l where l.id = v_r.learner_id for update;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, v_r.learner_id) then
    raise exception 'eng_tag_result_items: this member may not tag results of this learner' using errcode = '42501';
  end if;
  if exists (select 1 from english.results r2 where r2.supersedes_id = v_r.id) then
    raise exception 'eng_tag_result_items: this result was replaced by a newer one' using errcode = '23505';
  end if;
  v_source := v_r.source;

  for v_item in select x from pg_catalog.jsonb_array_elements(p_items) x loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' or (v_item ->> 'n') is null or (v_item ->> 'n') !~ '^[0-9]+$'
       or pg_catalog.jsonb_typeof(v_item -> 'tag_key') is distinct from 'string' then
      raise exception 'eng_tag_result_items: each item is {n, tag_key}' using errcode = '22023';
    end if;
    v_n := (v_item ->> 'n')::int;
    v_key := v_item ->> 'tag_key';
    if not exists (select 1 from pg_catalog.jsonb_array_elements(v_r.item_tags) e where (e ->> 'n')::int = v_n) then
      raise exception 'eng_tag_result_items: item % is not a wrong item of this result', v_n using errcode = '23514';
    end if;
    if exists (select 1 from pg_catalog.jsonb_array_elements(v_r.item_tags) e where (e ->> 'n')::int = v_n and (e ->> 'tag_key') is not null) then
      raise exception 'eng_tag_result_items: item % already has a tag from the frame or the first entry', v_n using errcode = '23505';
    end if;
    if not english.eng_tag_exists(v_learner.track_id, v_learner.family_id, v_key) then
      raise exception 'eng_tag_result_items: a tag does not exist for this learner''s track' using errcode = '23514';
    end if;
    select m.tag_key into v_old from english.tag_marks m where m.source = v_source and m.source_id = v_r.id and m.item_no = v_n;
    if found then
      if v_old <> v_key then
        raise exception 'eng_tag_result_items: item % was already tagged', v_n using errcode = '23505';
      end if;
      continue;
    end if;
    insert into english.tag_marks(learner_id, tag_key, source, source_id, item_no, counts, marked_on, recorded_by_member)
    values (v_r.learner_id, v_key, v_source, v_r.id, v_n, v_r.attempt = 'first', v_r.taken_on, p_by);
    v_added := v_added + 1;
  end loop;

  if v_added > 0 then
    insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
    values (v_member.user_id, v_member.role, 'result.tagged', v_learner.family_id, v_r.learner_id,
            pg_catalog.jsonb_build_object('result', v_r.id, 'items', v_added));
  end if;
  return pg_catalog.jsonb_build_object('tagged', v_added, 'replayed', v_added = 0);
end
$$;

-- Nhãn cho bài viết (màn Duyệt bài): tối đa 3 nhãn cho một lần nộp bài viết; chỉ bài ACT-WRITE / ACT-REVISE. Chỉ lần làm đầu tính (counts).
-- Gọi lại với nhãn đã có → bỏ qua (không bỏ nhãn được: bảng chỉ thêm).
create or replace function english.eng_tag_episode(p_episode uuid, p_tags text[], p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_e english.episodes%rowtype;
  v_learner english.learners%rowtype;
  v_member english.members%rowtype;
  v_type text;
  v_at timestamptz;
  v_keys text[];
  v_have int;
  v_added int := 0;
  k text;
begin
  if p_episode is null or p_by is null or p_tags is null then
    raise exception 'eng_tag_episode: episode, tags and actor are required' using errcode = '22004';
  end if;
  select pg_catalog.array_agg(distinct pg_catalog.btrim(x) order by pg_catalog.btrim(x)) into v_keys from unnest(p_tags) x where pg_catalog.btrim(coalesce(x, '')) <> '';
  v_keys := coalesce(v_keys, '{}');
  select * into v_e from english.episodes e where e.id = p_episode for no key update;
  if not found then
    raise exception 'eng_tag_episode: episode not found' using errcode = 'P0002';
  end if;
  select * into v_learner from english.learners l where l.id = v_e.learner_id;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, v_e.learner_id) then
    raise exception 'eng_tag_episode: this member may not tag work of this learner' using errcode = '42501';
  end if;
  -- D15: bài kiểm tra trong buổi (checkpoint) và bài quan sát trực tiếp: chỉ gia sư gắn nhãn (cùng luật với duyệt bài).
  if v_member.role <> 'tutor' and (coalesce((v_e.facets ->> 'checkpoint')::boolean, false) or v_e.observed_directly) then
    raise exception 'eng_tag_episode: only a tutor may tag work checked in the session or watched live (D15)' using errcode = '42501';
  end if;
  select a.activity_type, t.submitted_at into v_type, v_at
  from english.attempts t join english.activity_instances a on a.id = t.activity_instance_id where t.id = v_e.attempt_id;
  if v_type not in ('ACT-WRITE', 'ACT-REVISE') then
    raise exception 'eng_tag_episode: only written work can be tagged here' using errcode = '23514';
  end if;
  -- Tổng số nhãn của bài viết này (đã có + mới) không quá 3.
  select pg_catalog.count(*) into v_have from english.tag_marks m where m.source = 'writing' and m.source_id = p_episode;
  if v_have + (select pg_catalog.count(*) from unnest(v_keys) x
               where not exists (select 1 from english.tag_marks m where m.source = 'writing' and m.source_id = p_episode and m.tag_key = x)) > 3 then
    raise exception 'eng_tag_episode: at most 3 tags for one piece of writing' using errcode = '23514';
  end if;
  foreach k in array v_keys loop
    if not english.eng_tag_exists(v_learner.track_id, v_learner.family_id, k) then
      raise exception 'eng_tag_episode: a tag does not exist for this learner''s track' using errcode = '23514';
    end if;
    insert into english.tag_marks(learner_id, tag_key, source, source_id, item_no, counts, marked_on, recorded_by_member)
    values (v_e.learner_id, k, 'writing', p_episode, null, v_e.is_first_attempt, (v_at at time zone 'Asia/Ho_Chi_Minh')::date, p_by)
    on conflict do nothing;
    if found then
      v_added := v_added + 1;
    end if;
  end loop;
  if v_added > 0 then
    insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
    values (v_member.user_id, v_member.role, 'writing.tagged', v_learner.family_id, v_e.learner_id,
            pg_catalog.jsonb_build_object('episode', p_episode, 'tags', v_added));
  end if;
  return pg_catalog.jsonb_build_object('added', v_added, 'replayed', v_added = 0);
end
$$;

-- Ghi buổi học v2: ngày, hôm nay học, ≤ 3 nhãn cần củng cố, lời nhắn cho em (≤ 500), ghi chú cho phụ huynh (≤ 1000), kết quả kiểm tra lại.
-- Gia sư HOẶC phụ huynh của em. Luôn chia sẻ với bố mẹ (published) vì có ô "ghi chú cho phụ huynh". Hàm v1 (eng_write_lesson_note) giữ nguyên.
-- p_rechecks: [{tag_key, result}] result ∈ ok | still_wrong | not_asked; 'still_wrong' ghi thêm một dấu nhãn tính điểm (nguồn 'lesson').
create or replace function english.eng_write_lesson_note_v2(
  p_learner uuid,
  p_session_date date,
  p_studied text,
  p_weak_tags text[],
  p_message text,
  p_note_for_parent text,
  p_rechecks jsonb,
  p_supersedes uuid,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_learner english.learners%rowtype;
  v_member english.members%rowtype;
  v_studied text := nullif(pg_catalog.btrim(coalesce(p_studied, '')), '');
  v_message text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
  v_parent text := nullif(pg_catalog.btrim(coalesce(p_note_for_parent, '')), '');
  v_weak text[];
  v_prev english.lesson_notes%rowtype;
  v_existing english.lesson_notes%rowtype;
  v_rechecks jsonb := coalesce(p_rechecks, '[]'::jsonb);
  v_id uuid;
  v_item jsonb;
  v_key text;
begin
  if p_learner is null or p_session_date is null or p_by is null then
    raise exception 'eng_write_lesson_note_v2: learner, date and actor are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_write_lesson_note_v2: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select * into v_learner from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_write_lesson_note_v2: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_write_lesson_note_v2: this member may not write a lesson note for this learner' using errcode = '42501';
  end if;
  if p_session_date > english.eng_today_vn() or p_session_date < english.eng_today_vn() - 120 then
    raise exception 'eng_write_lesson_note_v2: the session date must be within the last 120 days, not in the future' using errcode = '23514';
  end if;
  if (v_studied is not null and pg_catalog.length(v_studied) > 300)
     or (v_message is not null and pg_catalog.length(v_message) > 500)
     or (v_parent is not null and pg_catalog.length(v_parent) > 1000) then
    raise exception 'eng_write_lesson_note_v2: the text is too long' using errcode = '22023';
  end if;

  -- Nhãn cần củng cố: bỏ trống/trùng, tối đa 3, phải thuộc track của em.
  select coalesce(array_agg(k order by mo), '{}') into v_weak
  from (select pg_catalog.btrim(x) as k, min(o) as mo
        from unnest(coalesce(p_weak_tags, '{}')) with ordinality as t(x, o)
        where pg_catalog.btrim(coalesce(x, '')) <> '' group by pg_catalog.btrim(x)) s;
  if cardinality(v_weak) > 3 then
    raise exception 'eng_write_lesson_note_v2: at most 3 tags to reinforce' using errcode = '23514';
  end if;
  foreach v_key in array v_weak loop
    if not english.eng_tag_exists(v_learner.track_id, v_learner.family_id, v_key) then
      raise exception 'eng_write_lesson_note_v2: a tag does not exist for this learner''s track' using errcode = '23514';
    end if;
  end loop;

  if pg_catalog.jsonb_typeof(v_rechecks) <> 'array' or pg_catalog.jsonb_array_length(v_rechecks) > 30 then
    raise exception 'eng_write_lesson_note_v2: rechecks must be a list of at most 30' using errcode = '22023';
  end if;
  for v_item in select x from pg_catalog.jsonb_array_elements(v_rechecks) x loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' or pg_catalog.jsonb_typeof(v_item -> 'tag_key') is distinct from 'string'
       or (v_item ->> 'result') is null or (v_item ->> 'result') not in ('ok', 'still_wrong', 'not_asked') then
      raise exception 'eng_write_lesson_note_v2: each recheck is {tag_key, result}' using errcode = '22023';
    end if;
    if not english.eng_tag_exists(v_learner.track_id, v_learner.family_id, v_item ->> 'tag_key') then
      raise exception 'eng_write_lesson_note_v2: a tag does not exist for this learner''s track' using errcode = '23514';
    end if;
  end loop;
  if (select pg_catalog.count(distinct x ->> 'tag_key') from pg_catalog.jsonb_array_elements(v_rechecks) x) <> pg_catalog.jsonb_array_length(v_rechecks) then
    raise exception 'eng_write_lesson_note_v2: a tag can be rechecked once per note' using errcode = '22023';
  end if;
  -- Một nhãn không thể vừa "cần củng cố" vừa "hỏi lại: ổn" trong cùng ghi chú (mâu thuẫn).
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_rechecks) x
    where x ->> 'result' = 'ok' and (x ->> 'tag_key') = any (v_weak)) then
    raise exception 'eng_write_lesson_note_v2: a tag cannot be both to reinforce and re-checked as ok' using errcode = '23514';
  end if;

  if v_studied is null and v_message is null and v_parent is null and cardinality(v_weak) = 0 and pg_catalog.jsonb_array_length(v_rechecks) = 0 then
    raise exception 'eng_write_lesson_note_v2: write at least one thing (what was studied, a tag, a message, a note or a recheck)' using errcode = '23514';
  end if;

  -- Gửi lại: cùng ghi chú.
  select n.* into v_existing from english.lesson_notes n where n.learner_id = p_learner and n.client_id = p_client_id;
  if found then
    if v_existing.tutor_member_id <> p_by or v_existing.session_date <> p_session_date or v_existing.goals is distinct from v_studied
       or v_existing.weak_tag_keys <> v_weak or v_existing.message_to_learner is distinct from v_message
       or v_existing.note_for_parent is distinct from v_parent or v_existing.supersedes_id is distinct from p_supersedes
       or (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tag_key', e.tag_key, 'result', e.result) order by e.tag_key), '[]'::jsonb)
           from english.recheck_events e where e.lesson_note_id = v_existing.id)
          <> (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tag_key', x ->> 'tag_key', 'result', x ->> 'result') order by x ->> 'tag_key'), '[]'::jsonb)
              from pg_catalog.jsonb_array_elements(v_rechecks) x) then
      raise exception 'eng_write_lesson_note_v2: client_id was already used for a different note' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'replayed', true);
  end if;

  if p_supersedes is not null then
    select n.* into v_prev from english.lesson_notes n where n.id = p_supersedes and n.learner_id = p_learner;
    if not found then
      raise exception 'eng_write_lesson_note_v2: the note to replace was not found' using errcode = 'P0002';
    end if;
    if v_prev.tutor_member_id <> p_by then
      raise exception 'eng_write_lesson_note_v2: only the author may edit a note' using errcode = '42501';
    end if;
    if exists (select 1 from english.lesson_notes n where n.supersedes_id = p_supersedes) then
      raise exception 'eng_write_lesson_note_v2: the note was already replaced by a newer version' using errcode = '23505';
    end if;
  end if;

  -- tutor_member_id giữ tên cũ nhưng là NGƯỜI VIẾT (gia sư hoặc phụ huynh): author_role cho biết vai.
  insert into english.lesson_notes(
    learner_id, tutor_member_id, session_date, goals, observed, support_level, next_actions, practised_target_ids, published,
    supersedes_id, client_id, weak_tag_keys, message_to_learner, note_for_parent, author_role)
  values (p_learner, p_by, p_session_date, v_studied, null, null, '{}', '{}', true,
          p_supersedes, p_client_id, v_weak, v_message, v_parent, v_member.role)
  returning id into v_id;

  insert into english.tag_marks(learner_id, tag_key, source, source_id, item_no, counts, marked_on, recorded_by_member)
  select p_learner, k, 'lesson', v_id, null, true, p_session_date, p_by from unnest(v_weak) k;

  for v_item in select x from pg_catalog.jsonb_array_elements(v_rechecks) x loop
    insert into english.recheck_events(learner_id, tag_key, lesson_note_id, result, recorded_by_member)
    values (p_learner, v_item ->> 'tag_key', v_id, v_item ->> 'result', p_by);
    if v_item ->> 'result' = 'still_wrong' and not ((v_item ->> 'tag_key') = any (v_weak)) then
      insert into english.tag_marks(learner_id, tag_key, source, source_id, item_no, counts, marked_on, recorded_by_member)
      values (p_learner, v_item ->> 'tag_key', 'lesson', v_id, null, true, p_session_date, p_by);
    end if;
  end loop;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'lesson_note.written', v_learner.family_id, p_learner,
          pg_catalog.jsonb_build_object('note', v_id, 'published', true, 'supersedes', p_supersedes, 'version', 2));

  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

-- Hàm ghi chú buổi học CŨ (v1) của 0010, giữ nguyên từng dòng + MỘT kiểm tra thêm: không thay một ghi chú v2 (có test đối chiếu từng dòng).
create or replace function english.eng_write_lesson_note(
  p_learner uuid,
  p_session_date date,
  p_goals text,
  p_observed text,
  p_support_level text,
  p_next_actions text[],
  p_practised text[],
  p_published boolean,
  p_supersedes uuid,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_learner english.learners%rowtype;
  v_member english.members%rowtype;
  v_goals text := nullif(pg_catalog.btrim(coalesce(p_goals, '')), '');
  v_observed text := nullif(pg_catalog.btrim(coalesce(p_observed, '')), '');
  v_actions text[];
  v_practised text[];
  v_prev english.lesson_notes%rowtype;
  v_existing english.lesson_notes%rowtype;
  v_id uuid;
  v_new_targets text[];
  v_at timestamptz;
begin
  if p_learner is null or p_session_date is null or p_by is null or p_published is null or p_support_level is null then
    raise exception 'eng_write_lesson_note: learner, date, actor, support level and published are required' using errcode = '22004';
  end if;
  if p_client_id is null or pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_write_lesson_note: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  if p_support_level not in ('none', 'light', 'moderate', 'heavy') then
    raise exception 'eng_write_lesson_note: unknown support level' using errcode = '22023';
  end if;

  select * into v_learner from english.learners l where l.id = p_learner for update;
  if not found then
    raise exception 'eng_write_lesson_note: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role <> 'tutor' or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_write_lesson_note: only a tutor of this learner may write a lesson note' using errcode = '42501';
  end if;

  if p_session_date > english.eng_today_vn() or p_session_date < english.eng_today_vn() - 120 then
    raise exception 'eng_write_lesson_note: the session date must be within the last 120 days, not in the future' using errcode = '23514';
  end if;
  if (v_goals is not null and pg_catalog.length(v_goals) > 1000) or (v_observed is not null and pg_catalog.length(v_observed) > 2000) then
    raise exception 'eng_write_lesson_note: the text is too long' using errcode = '22023';
  end if;

  -- Việc tiếp theo: bỏ dòng trống, tối đa 3, mỗi việc 1..200 ký tự.
  select coalesce(array_agg(pg_catalog.btrim(x) order by o), '{}') into v_actions
  from unnest(coalesce(p_next_actions, '{}')) with ordinality as t(x, o)
  where pg_catalog.btrim(coalesce(x, '')) <> '';
  if cardinality(v_actions) > 3 or not english.eng_all_len_between(v_actions, 1, 200) then
    raise exception 'eng_write_lesson_note: at most 3 next actions of up to 200 characters' using errcode = '23514';
  end if;
  if v_goals is null and v_observed is null and cardinality(v_actions) = 0 then
    raise exception 'eng_write_lesson_note: write at least one of goals, what was observed, or a next action' using errcode = '23514';
  end if;

  -- Kỹ năng đã luyện: bỏ trùng (giữ thứ tự), phải thuộc track của em.
  select coalesce(array_agg(k order by mo), '{}') into v_practised
  from (select pg_catalog.btrim(x) as k, min(o) as mo
        from unnest(coalesce(p_practised, '{}')) with ordinality as t(x, o)
        where pg_catalog.btrim(coalesce(x, '')) <> '' group by pg_catalog.btrim(x)) s;
  if exists (
    select 1 from unnest(v_practised) k
    where not exists (select 1 from english.targets t where t.id = k and t.track_id = v_learner.track_id)) then
    raise exception 'eng_write_lesson_note: a practised skill is not a skill of this learner''s track' using errcode = '23514';
  end if;

  -- Gửi lại: cùng ghi chú.
  select n.* into v_existing from english.lesson_notes n where n.learner_id = p_learner and n.client_id = p_client_id;
  if found then
    if v_existing.tutor_member_id <> p_by or v_existing.session_date <> p_session_date
       or v_existing.goals is distinct from v_goals or v_existing.observed is distinct from v_observed
       or v_existing.support_level <> p_support_level or v_existing.next_actions <> v_actions
       or v_existing.practised_target_ids <> v_practised or v_existing.published <> p_published
       or v_existing.supersedes_id is distinct from p_supersedes then
      raise exception 'eng_write_lesson_note: client_id was already used for a different note' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'replayed', true);
  end if;

  if p_supersedes is not null then
    select n.* into v_prev from english.lesson_notes n where n.id = p_supersedes and n.learner_id = p_learner;
    if not found then
      raise exception 'eng_write_lesson_note: the note to replace was not found' using errcode = 'P0002';
    end if;
    if v_prev.tutor_member_id <> p_by then
      raise exception 'eng_write_lesson_note: only the author may edit a note' using errcode = '42501';
    end if;
    -- S5b-1: ghi chú viết bằng "Ghi buổi học" (v2: không có mức hỗ trợ, có nhãn / lời nhắn / ghi chú cho phụ huynh) không sửa được bằng
    -- mẫu cũ - mẫu cũ sẽ làm mất các trường của v2. (author_role luôn có giá trị nên không dùng để nhận biết; support_level NULL là dấu của v2.)
    if v_prev.support_level is null or v_prev.author_role <> 'tutor' or cardinality(v_prev.weak_tag_keys) > 0
       or v_prev.message_to_learner is not null or v_prev.note_for_parent is not null then
      raise exception 'eng_write_lesson_note: a note written with the session form (v2) cannot be edited with this form' using errcode = '23514';
    end if;
    if exists (select 1 from english.lesson_notes n where n.supersedes_id = p_supersedes) then
      raise exception 'eng_write_lesson_note: the note was already replaced by a newer version' using errcode = '23505';
    end if;
    if not (v_prev.practised_target_ids <@ v_practised) then
      raise exception 'eng_write_lesson_note: skills already logged as practised cannot be removed' using errcode = '23514';
    end if;
  end if;

  insert into english.lesson_notes(
    learner_id, tutor_member_id, session_date, goals, observed, support_level, next_actions,
    practised_target_ids, published, supersedes_id, client_id)
  values (p_learner, p_by, p_session_date, v_goals, v_observed, p_support_level, v_actions,
          v_practised, p_published, p_supersedes, p_client_id)
  returning id into v_id;

  -- Lần tiếp xúc cho kỹ năng MỚI của bản này (bản trước đã ghi phần còn lại).
  select coalesce(array_agg(k order by k), '{}') into v_new_targets
  from unnest(v_practised) k
  where p_supersedes is null or not (k = any (v_prev.practised_target_ids));
  if cardinality(v_new_targets) > 0 then
    v_at := english.eng_session_ts(p_session_date);
    insert into english.exposure_log(learner_id, target_key, at, source, attempt_id, lesson_note_id)
    select p_learner, k, v_at, 'lesson', null, v_id from unnest(v_new_targets) k;
  end if;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'lesson_note.written', v_learner.family_id, p_learner,
          pg_catalog.jsonb_build_object('note', v_id, 'published', p_published, 'supersedes', p_supersedes));

  return pg_catalog.jsonb_build_object('id', v_id, 'replayed', false);
end
$$;

revoke execute on function english.eng_write_lesson_note(uuid, date, text, text, text, text[], text[], boolean, uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_write_lesson_note(uuid, date, text, text, text, text[], text[], boolean, uuid, uuid, text) to service_role;

-- Hàm đọc (server gọi bằng service_role SAU requireAccess; p_learner phải đã được cấp quyền) ----------------------------------------------

-- Số ngày "kiểm tra lại" của chính sách đánh giá của em (delayedMinDaysFromLastExposure), hoặc NULL nếu em chưa có bộ kỹ năng.
create or replace function english.eng_recheck_days(p_learner uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select (p.config -> 'transferable' ->> 'delayedMinDaysFromLastExposure')::int
  from english.target_sets ts
  join english.target_set_definitions d on d.id = ts.definition_id
  join english.catalogue_versions c on c.version = d.catalogue_version
  join english.assessment_policies p on p.version = c.assessment_policy_version
  where ts.learner_id = p_learner
  order by ts.effective_from desc, ts.seq desc
  limit 1
$$;

-- Một dấu nhãn còn "sống": tính điểm (counts) và nguồn của nó chưa bị bản mới thay thế.
create or replace function english.eng_mark_is_live(p_source text, p_source_id uuid, p_counts boolean) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_counts and case
    when p_source in ('test', 'practice') then not exists (select 1 from english.results r2 where r2.supersedes_id = p_source_id)
    when p_source = 'lesson' then not exists (select 1 from english.lesson_notes n2 where n2.supersedes_id = p_source_id)
    else true end
$$;

-- Điểm cần chú ý của một em. p_since = null → từ đầu. Mỗi nhãn: số dấu theo nguồn, số nguồn khác nhau, lần cuối, hạn kiểm tra lại, trạng thái
-- ('repeat' ≥ 2 nguồn | 'watch' 1 nguồn | 'ok' đã hỏi lại ổn hoặc làm đúng hết) và dòng thời gian. Nguồn = từng bài / buổi học / bài viết.
-- Chỉ lần làm đầu (counts) và nguồn chưa bị thay thế. Hạn kiểm tra lại = lần gần nhất + số ngày của chính sách.
create or replace function english.eng_weak_points(p_learner uuid, p_since date default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_learner english.learners%rowtype;
  v_days int;
  v_today date := english.eng_today_vn();
  v_out jsonb;
begin
  select * into v_learner from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_weak_points: learner not found' using errcode = 'P0002';
  end if;
  v_days := english.eng_recheck_days(p_learner);

  with live as (
    select m.* from english.tag_marks m
    where m.learner_id = p_learner and english.eng_mark_is_live(m.source, m.source_id, m.counts)
  ),
  win as (
    select l.* from live l where p_since is null or l.marked_on >= p_since
  ),
  last_all as (
    select l.tag_key, max(l.marked_on) as last_seen from live l group by l.tag_key
  ),
  -- Lần hỏi lại gần nhất theo NGÀY CỦA BUỔI HỌC (không phải ngày nhập), bỏ các lần ghi trong ghi chú đã bị bản mới thay thế.
  last_recheck as (
    select distinct on (e.tag_key) e.tag_key, e.result, n.session_date as on_date
    from english.recheck_events e
    join english.lesson_notes n on n.id = e.lesson_note_id
    where e.learner_id = p_learner
      and not exists (select 1 from english.lesson_notes n2 where n2.supersedes_id = n.id)
    order by e.tag_key, n.session_date desc, e.created_at desc, e.id desc
  ),
  seen as (
    select i.tag_key, count(*)::int as asked, (count(*) filter (where i.n = any (r.wrong_items)))::int as wrong
    from english.results r
    join english.test_frames f on f.id = r.frame_id
    cross join lateral pg_catalog.jsonb_to_recordset(f.items) as i(n int, part text, tag_key text)
    where r.learner_id = p_learner and r.mode = 'frame' and r.attempt = 'first'
      and not exists (select 1 from english.results r2 where r2.supersedes_id = r.id)
      and (p_since is null or r.taken_on >= p_since)
    group by i.tag_key
  ),
  per_source as (
    select w.tag_key, w.source, w.source_id, max(w.marked_on) as on_date,
           (array_agg(w.item_no order by w.item_no) filter (where w.item_no is not null)) as items
    from win w group by w.tag_key, w.source, w.source_id
  ),
  agg as (
    select s.tag_key,
           count(*)::int as sources,
           (count(*) filter (where s.source = 'test'))::int as n_test,
           (count(*) filter (where s.source = 'practice'))::int as n_practice,
           (count(*) filter (where s.source = 'lesson'))::int as n_lesson,
           (count(*) filter (where s.source = 'writing'))::int as n_writing,
           coalesce(sum(cardinality(s.items)) filter (where s.source = 'test'), 0)::int as items_test,
           coalesce(sum(cardinality(s.items)) filter (where s.source = 'practice'), 0)::int as items_practice,
           max(s.on_date) as last_in_window,
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'date', s.on_date, 'source', s.source, 'source_id', s.source_id, 'items', coalesce(pg_catalog.to_jsonb(s.items), '[]'::jsonb),
               'title', coalesce(r.title, ln.goals), 'used_hint', coalesce(r.used_hint, false), 'in_class', coalesce(r.context = 'class', false))
             order by s.on_date desc, s.source) as events
    from per_source s
    left join english.results r on s.source in ('test', 'practice') and r.id = s.source_id
    left join english.lesson_notes ln on s.source = 'lesson' and ln.id = s.source_id
    group by s.tag_key
  ),
  tkeys as (
    select tag_key from agg
    union select tag_key from seen
    union select tag_key from last_recheck where result = 'ok' and (p_since is null or on_date >= p_since)
  ),
  rws as (
    select k.tag_key,
           coalesce(g.sources, 0) as sources,
           g.last_in_window,
           la.last_seen,
           lr.result as recheck_result, lr.on_date as recheck_on,
           (lr.result = 'ok' and la.last_seen is not null and lr.on_date >= la.last_seen) as resolved,
           case when la.last_seen is not null and v_days is not null then la.last_seen + v_days end as due_on,
           g.n_test, g.n_practice, g.n_lesson, g.n_writing, g.items_test, g.items_practice, g.events,
           coalesce(s.asked, 0) as asked, coalesce(s.wrong, 0) as seen_wrong,
           t.label_vi, t.group_vi
    from tkeys k
    left join agg g on g.tag_key = k.tag_key
    left join last_all la on la.tag_key = k.tag_key
    left join last_recheck lr on lr.tag_key = k.tag_key
    left join seen s on s.tag_key = k.tag_key
    left join english.error_tags t on t.track_id = v_learner.track_id and t.key = k.tag_key
  )
  select pg_catalog.jsonb_build_object(
    'policy_days', v_days,
    'since', p_since,
    'today', v_today,
    'tags', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'tag_key', r.tag_key,
          'label_vi', coalesce(r.label_vi, r.tag_key),
          'group_vi', r.group_vi,
          'sources', r.sources,
          'by_source', pg_catalog.jsonb_build_object(
            'test', coalesce(r.n_test, 0), 'practice', coalesce(r.n_practice, 0), 'lesson', coalesce(r.n_lesson, 0), 'writing', coalesce(r.n_writing, 0)),
          'items_wrong', pg_catalog.jsonb_build_object('test', coalesce(r.items_test, 0), 'practice', coalesce(r.items_practice, 0)),
          'asked_correct', pg_catalog.jsonb_build_object('asked', r.asked, 'wrong', r.seen_wrong),
          'last_seen', r.last_seen,
          'recheck_due_on', r.due_on,
          'recheck_due', (r.due_on is not null and r.due_on <= v_today and not coalesce(r.resolved, false)),
          'last_recheck', case when r.recheck_result is null then null
                               else pg_catalog.jsonb_build_object('result', r.recheck_result, 'on', r.recheck_on) end,
          'status', case when coalesce(r.resolved, false) then 'ok' when r.sources >= 2 then 'repeat' when r.sources = 1 then 'watch' else 'ok' end,
          'events', coalesce(r.events, '[]'::jsonb))
        order by
          case when coalesce(r.resolved, false) then 3 when r.sources >= 2 then 0 when r.sources = 1 then 1 else 2 end,
          r.sources desc, r.last_seen desc nulls last, r.tag_key)
      from rws r), '[]'::jsonb))
  into v_out;
  return v_out;
end
$$;

-- Các câu sai chưa có nhãn ("chờ gắn nhãn") của một em: chỉ lần làm đầu, kết quả chưa bị thay. Trả {items: [{result_id, title, taken_on,
-- created_at, source, used_hint, items: [số câu]}]}. Phụ huynh chỉ nên thấy mục cũ hơn 2 ngày: việc lọc đó là của giao diện.
create or replace function english.eng_untagged_queue(p_learner uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'result_id', r.id, 'title', r.title, 'taken_on', r.taken_on, 'created_at', r.created_at,
        'source', r.source, 'recorded_by_member', r.recorded_by_member, 'recorded_role', r.recorded_role,
        'used_hint', r.used_hint, 'in_class', r.context = 'class', 'items', x.items)
      order by r.created_at)
    from english.results r
    cross join lateral (
      select pg_catalog.jsonb_agg((e ->> 'n')::int order by (e ->> 'n')::int) as items
      from pg_catalog.jsonb_array_elements(r.item_tags) e
      where (e ->> 'tag_key') is null
        and not exists (
          select 1 from english.tag_marks m
          where m.source in ('test', 'practice') and m.source_id = r.id and m.item_no = (e ->> 'n')::int)
    ) x
    where r.learner_id = p_learner and r.attempt = 'first'
      and not exists (select 1 from english.results r2 where r2.supersedes_id = r.id)
      and x.items is not null), '[]'::jsonb))
$$;

-- Quyền thực thi: chỉ service_role (server gọi SAU requireAccess). Hàm nội bộ: không ai ngoài các hàm khác.
revoke execute on function english.eng_tag_exists(text, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function english.eng_valid_item_list(int[], int) from public, anon, authenticated, service_role;
revoke execute on function english.eng_frame_root(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_recheck_days(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_mark_is_live(text, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function english.eng_valid_item_list(int[], int) to service_role;
revoke execute on function english.eng_add_error_tag(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function english.eng_record_result(uuid, text, uuid, text, int, int, int[], jsonb, text, text, boolean, date, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function english.eng_tag_result_items(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function english.eng_tag_episode(uuid, text[], uuid) from public, anon, authenticated;
revoke execute on function english.eng_write_lesson_note_v2(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function english.eng_weak_points(uuid, date) from public, anon, authenticated;
revoke execute on function english.eng_untagged_queue(uuid) from public, anon, authenticated;
grant execute on function english.eng_add_error_tag(uuid, text, text, uuid) to service_role;
grant execute on function english.eng_record_result(uuid, text, uuid, text, int, int, int[], jsonb, text, text, boolean, date, uuid, uuid, uuid, text, text) to service_role;
grant execute on function english.eng_tag_result_items(uuid, jsonb, uuid) to service_role;
grant execute on function english.eng_tag_episode(uuid, text[], uuid) to service_role;
grant execute on function english.eng_write_lesson_note_v2(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text) to service_role;
grant execute on function english.eng_weak_points(uuid, date) to service_role;
grant execute on function english.eng_untagged_queue(uuid) to service_role;

-- Purge: thêm các bảng của S5b-1. Thân hàm = bản của 0010 + các dòng mới (chỉ THÊM dòng, không bỏ dòng nào; có test đối chiếu từng dòng).
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
alter table english.error_tags enable row level security;
alter table english.test_frames enable row level security;
alter table english.results enable row level security;
alter table english.tag_marks enable row level security;
alter table english.recheck_events enable row level security;

-- Nhãn và khung đề: phụ huynh / gia sư của gia đình (nhãn có sẵn: mọi nhân viên). Học sinh: không bao giờ.
drop policy if exists error_tags_select on english.error_tags;
create policy error_tags_select on english.error_tags
  for select to authenticated
  using (english.eng_is_staff() and (family_id is null or family_id = english.eng_member_family_id()));

drop policy if exists test_frames_select on english.test_frames;
create policy test_frames_select on english.test_frames
  for select to authenticated
  using (english.eng_is_staff() and family_id = english.eng_member_family_id());

-- Kết quả, dấu nhãn, kiểm tra lại: phụ huynh / gia sư trong phạm vi của em. Học sinh: không bao giờ.
drop policy if exists results_select on english.results;
create policy results_select on english.results
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

drop policy if exists tag_marks_select on english.tag_marks;
create policy tag_marks_select on english.tag_marks
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

drop policy if exists recheck_events_select on english.recheck_events;
create policy recheck_events_select on english.recheck_events
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- Grant theo từng bảng (không dùng "on all tables"); ghi chỉ qua hàm security definer ở trên (và migration / script của chủ sở hữu).
grant select on english.error_tags, english.test_frames, english.results, english.tag_marks, english.recheck_events to authenticated;
revoke insert, update, delete, truncate on
  english.error_tags, english.test_frames, english.results, english.tag_marks, english.recheck_events
  from public, anon, authenticated, service_role;
revoke all on english.error_tags, english.test_frames, english.results, english.tag_marks, english.recheck_events from anon;

insert into english.schema_migrations(version) values ('0014') on conflict do nothing;
