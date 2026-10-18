-- 0017_readiness.sql
-- S5c (Sẵn sàng dùng thật): sửa những chỗ không sửa lại được sau khi dữ liệu thật vào (docs/plans/s5c-readiness.md, docs/AUDIT_2026-10-18.md).
--  1. "Ghi buổi học" mẫu mới ghi được "kỹ năng đã luyện" -> exposure_log (như mẫu cũ).
--  2. Hai kết quả "lần đầu" cho cùng một bài nhập nhanh (không gắn bài giao) bị chặn.
--  3. Cài đặt "Hỏi lại điểm yếu" (số ngày) tách khỏi chính sách đánh giá.
--  4. Bài nhập từ phiếu giấy pilot: được lùi ngày làm bài tới 14 ngày trước ngày giao, kèm lý do.
-- Chỉ THÊM / thay hàm (create or replace). Không sửa migration 0001-0016. Không đụng schema public. Idempotent.

-- 1. Ghi buổi học v2 + kỹ năng đã luyện ---------------------------------------------------------------------------------------------------
-- Hàm cũ (10 tham số) bị thay bằng hàm 11 tham số (p_practised_target_ids ở CUỐI, mặc định rỗng) nên mọi lời gọi cũ vẫn chạy.
-- Kỹ năng đã luyện: bỏ trùng, phải thuộc track của em (như mẫu v1), tối đa 30; mỗi kỹ năng MỚI của bản này ghi một dòng exposure_log
-- (source 'lesson', vào ngày của buổi); sửa ghi chú (supersedes) chỉ ghi kỹ năng mới so với bản trước và KHÔNG được bỏ kỹ năng đã ghi.
drop function if exists english.eng_write_lesson_note_v2(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text);

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
  p_client_id text,
  -- Kỹ năng (targets.id) đã luyện trong buổi; mặc định rỗng.
  p_practised_target_ids text[] default '{}'
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
  v_practised text[];
  v_new_targets text[];
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

  -- Kỹ năng đã luyện: bỏ trùng (giữ thứ tự), tối đa 30, phải thuộc track của em.
  select coalesce(array_agg(k order by mo), '{}') into v_practised
  from (select pg_catalog.btrim(x) as k, min(o) as mo
        from unnest(coalesce(p_practised_target_ids, '{}')) with ordinality as t(x, o)
        where pg_catalog.btrim(coalesce(x, '')) <> '' group by pg_catalog.btrim(x)) s;
  if cardinality(v_practised) > 30 then
    raise exception 'eng_write_lesson_note_v2: at most 30 practised skills' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(v_practised) k
    where not exists (select 1 from english.targets t where t.id = k and t.track_id = v_learner.track_id)) then
    raise exception 'eng_write_lesson_note_v2: a practised skill is not a skill of this learner''s track' using errcode = '23514';
  end if;

  if v_studied is null and v_message is null and v_parent is null and cardinality(v_weak) = 0 and pg_catalog.jsonb_array_length(v_rechecks) = 0
     and cardinality(v_practised) = 0 then
    raise exception 'eng_write_lesson_note_v2: write at least one thing (what was studied, a skill, a tag, a message, a note or a recheck)' using errcode = '23514';
  end if;

  -- Gửi lại: cùng ghi chú.
  select n.* into v_existing from english.lesson_notes n where n.learner_id = p_learner and n.client_id = p_client_id;
  if found then
    if v_existing.tutor_member_id <> p_by or v_existing.session_date <> p_session_date or v_existing.goals is distinct from v_studied
       or v_existing.weak_tag_keys <> v_weak or v_existing.message_to_learner is distinct from v_message
       or v_existing.note_for_parent is distinct from v_parent or v_existing.supersedes_id is distinct from p_supersedes
       or v_existing.practised_target_ids <> v_practised
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
    if not (v_prev.practised_target_ids <@ v_practised) then
      raise exception 'eng_write_lesson_note_v2: skills already logged as practised cannot be removed' using errcode = '23514';
    end if;
  end if;

  -- tutor_member_id giữ tên cũ nhưng là NGƯỜI VIẾT (gia sư hoặc phụ huynh): author_role cho biết vai.
  insert into english.lesson_notes(
    learner_id, tutor_member_id, session_date, goals, observed, support_level, next_actions, practised_target_ids, published,
    supersedes_id, client_id, weak_tag_keys, message_to_learner, note_for_parent, author_role)
  values (p_learner, p_by, p_session_date, v_studied, null, null, '{}', v_practised, true,
          p_supersedes, p_client_id, v_weak, v_message, v_parent, v_member.role)
  returning id into v_id;

  insert into english.tag_marks(learner_id, tag_key, source, source_id, item_no, counts, marked_on, recorded_by_member)
  select p_learner, k, 'lesson', v_id, null, true, p_session_date, p_by from unnest(v_weak) k;

  -- Lần tiếp xúc cho kỹ năng MỚI của bản này (bản trước đã ghi phần còn lại) - cùng luật với mẫu cũ (v1).
  select coalesce(array_agg(k order by k), '{}') into v_new_targets
  from unnest(v_practised) k
  where p_supersedes is null or not (k = any (v_prev.practised_target_ids));
  if cardinality(v_new_targets) > 0 then
    insert into english.exposure_log(learner_id, target_key, at, source, attempt_id, lesson_note_id)
    select p_learner, k, english.eng_session_ts(p_session_date), 'lesson', null, v_id from unnest(v_new_targets) k;
  end if;

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

revoke execute on function english.eng_write_lesson_note_v2(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text, text[]) from public, anon, authenticated;
grant execute on function english.eng_write_lesson_note_v2(uuid, date, text, text[], text, text, jsonb, uuid, uuid, text, text[]) to service_role;

-- 2. Nhập nhanh không gắn bài giao: một "lần đầu" ----------------------------------------------------------------------------------------
-- Thân hàm = bản của 0014 + MỘT khối thêm (có test): hai kết quả nhập nhanh "lần đầu" còn hiệu lực của cùng một em, cùng tên đã chuẩn hóa
-- (không phân biệt hoa/thường và khoảng trắng thừa), cùng ngày làm bài, đều không gắn bài giao / khung đề -> 23505 duplicate_first,
-- trừ khi kết quả mới thay chính bản đã ghi (supersedes). Gia sư và phụ huynh cùng nhập một đề không còn đếm "lần đầu" hai lần.
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

  -- S5c: nhập nhanh không gắn bài giao cũng chỉ có MỘT lần làm đầu hiện hành cho mỗi (em, tên đề, ngày làm bài).
  if p_mode = 'quick' and p_attempt = 'first' and p_assignment is null and exists (
    select 1 from english.results r2
    where r2.learner_id = p_learner and r2.mode = 'quick' and r2.attempt = 'first' and r2.assignment_id is null
      and r2.taken_on = p_taken_on
      and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(r2.title), '\s+', ' ', 'g'))
          = pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(v_title), '\s+', ' ', 'g'))
      and not exists (select 1 from english.results r3 where r3.supersedes_id = r2.id)
      and r2.id is distinct from p_supersedes) then
    raise exception 'eng_record_result: this quick result already has a first attempt (duplicate_first)' using errcode = '23505';
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


revoke execute on function english.eng_record_result(uuid, text, uuid, text, int, int, int[], jsonb, text, text, boolean, date, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function english.eng_record_result(uuid, text, uuid, text, int, int, int[], jsonb, text, text, boolean, date, uuid, uuid, uuid, text, text) to service_role;

-- 3. Cài đặt riêng cho "Hỏi lại điểm yếu" (A10) ---------------------------------------------------------------------------------------------
-- "Hỏi lại điểm yếu" (theo NHÃN lỗi, trong buổi học) KHÁC "Bài ôn lại sau 2 tuần" (theo KỸ NĂNG, chính sách đánh giá). Trước đây hai việc dùng chung
-- một con số (delayedMinDaysFromLastExposure). Giờ số ngày hỏi lại nằm ở bảng cài đặt riêng của phần gia sư; đổi một bên không kéo theo bên kia.
-- Bảng cài đặt: một dòng cho mỗi khóa, chung cho cả ứng dụng. RLS bật, KHÔNG có policy và KHÔNG grant cho authenticated: đọc qua hàm
-- eng_tutorwork_settings (nhân viên), ghi qua eng_set_tutorwork_setting (chỉ phụ huynh); cả hai chỉ service_role gọi được sau requireAccess.
create table if not exists english.tutorwork_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  value jsonb not null,
  updated_at timestamptz not null default clock_timestamp(),
  -- id của english.members, KHÔNG có khóa ngoại (xóa tài khoản không làm hỏng lịch sử); NULL = giá trị gieo sẵn.
  updated_by uuid
);
insert into english.tutorwork_settings(key, value) values ('recheck_days', '14'::jsonb) on conflict do nothing;

alter table english.tutorwork_settings enable row level security;
revoke all on english.tutorwork_settings from public, anon, authenticated, service_role;

-- Số ngày chờ trước khi một điểm yếu "đến hạn hỏi lại". Tham số p_learner giữ lại cho khớp bản cũ (số ngày chung cho mọi em).
create or replace function english.eng_recheck_days(p_learner uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select (s.value #>> '{}')::int from english.tutorwork_settings s where s.key = 'recheck_days'
$$;

-- Đọc cài đặt (gia sư hoặc phụ huynh). Trả {recheck_days: int}.
create or replace function english.eng_tutorwork_settings(p_by uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_by is null then
    raise exception 'eng_tutorwork_settings: actor is required' using errcode = '22004';
  end if;
  if not exists (select 1 from english.members m where m.id = p_by and m.role in ('tutor', 'parent')) then
    raise exception 'eng_tutorwork_settings: only a tutor or a parent may read the settings' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object('recheck_days', english.eng_recheck_days(null));
end
$$;

-- Đổi cài đặt (chỉ phụ huynh). Chỉ khóa đã biết; recheck_days là số nguyên 1..180. Ghi audit_log.
create or replace function english.eng_set_tutorwork_setting(p_key text, p_value jsonb, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_member english.members%rowtype;
  v_old jsonb;
begin
  if p_key is null or p_value is null or p_by is null then
    raise exception 'eng_set_tutorwork_setting: key, value and actor are required' using errcode = '22004';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role <> 'parent' then
    raise exception 'eng_set_tutorwork_setting: only a parent may change the settings' using errcode = '42501';
  end if;
  if p_key <> 'recheck_days' then
    raise exception 'eng_set_tutorwork_setting: unknown setting' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') !~ '^[0-9]{1,3}$' or (p_value #>> '{}')::int not between 1 and 180 then
    raise exception 'eng_set_tutorwork_setting: recheck_days must be a whole number of days from 1 to 180' using errcode = '22023';
  end if;
  select s.value into v_old from english.tutorwork_settings s where s.key = p_key for update;
  insert into english.tutorwork_settings(key, value, updated_at, updated_by)
  values (p_key, p_value, pg_catalog.clock_timestamp(), p_by)
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, payload)
  values (v_member.user_id, v_member.role, 'tutorwork_setting.changed', v_member.family_id,
          pg_catalog.jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value));
  return pg_catalog.jsonb_build_object('key', p_key, 'value', p_value);
end
$$;

revoke execute on function english.eng_tutorwork_settings(uuid) from public, anon, authenticated;
revoke execute on function english.eng_set_tutorwork_setting(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function english.eng_tutorwork_settings(uuid) to service_role;
grant execute on function english.eng_set_tutorwork_setting(text, jsonb, uuid) to service_role;

-- 4. Bài nhập từ phiếu giấy pilot: lùi ngày làm bài tới 14 ngày trước ngày giao (A2) -------------------------------------------------------
-- Pilot giấy chạy 17-19/10 trước khi gia đình thật có trong app: bài làm xảy ra TRƯỚC ngày giao. Luật cũ chỉ cho ngày >= ngày giao - 1.
-- Giờ, với 'manual_import' và có LÝ DO (5-200 ký tự, p_backdate_reason), ngày làm bài được lùi tới 14 ngày trước ngày giao và bước không
-- cần "đã mở vào ngày đó". Các luật khác giữ nguyên: ngày <= hôm nay, không sớm hơn lần làm gần nhất của bước (date_before_last_attempt),
-- bước phải đang mở hôm nay. Lý do nằm trong nội dung bài (và dấu băm), trong audit_log; hàm cũ (9 tham số) bị thay bằng hàm 10 tham số
-- (p_backdate_reason ở CUỐI, mặc định NULL) nên mọi lời gọi cũ vẫn chạy.
drop function if exists english.eng_record_offline_attempt(uuid, text, text, int, int, date, text[], uuid, uuid);

create or replace function english.eng_record_offline_attempt(
  p_activity uuid,
  p_provenance text,
  p_text text,
  p_duration_sec int,
  p_word_count int,
  p_session_date date,
  p_assistance text[],
  p_by uuid,
  p_client_id uuid,
  -- Lý do khi bài làm có ngày TRƯỚC ngày giao (bài trên phiếu giấy); chỉ với manual_import.
  p_backdate_reason text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_act english.activity_instances%rowtype;
  v_member english.members%rowtype;
  v_learner english.learners%rowtype;
  v_snapshot jsonb;
  v_assigned date;
  v_last_date date;
  v_assist text[];
  v_content jsonb;
  v_hash text;
  v_existing english.attempts%rowtype;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_no int;
  v_parent uuid;
  v_family uuid;
  v_first boolean;
  v_at timestamptz;
  v_item text;
  v_episode uuid;
  v_verification text;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_backdate_reason, '')), '');
  v_backdated boolean := false;
begin
  if p_activity is null or p_by is null or p_client_id is null or p_session_date is null then
    raise exception 'eng_record_offline_attempt: activity, actor, client id and date are required' using errcode = '22004';
  end if;
  if p_provenance is null or p_provenance not in ('tutor_live', 'manual_import') then
    raise exception 'eng_record_offline_attempt: provenance must be tutor_live or manual_import' using errcode = '22023';
  end if;
  if p_text is null or pg_catalog.btrim(p_text) = '' or pg_catalog.length(p_text) > 20000 then
    raise exception 'eng_record_offline_attempt: the text must be 1 to 20000 characters' using errcode = '22023';
  end if;
  if p_duration_sec is not null and (p_duration_sec < 0 or p_duration_sec > 7200) then
    raise exception 'eng_record_offline_attempt: duration must be 0 to 7200 seconds' using errcode = '22023';
  end if;
  if p_word_count is not null and (p_word_count < 0 or p_word_count > 20000) then
    raise exception 'eng_record_offline_attempt: word count must be 0 to 20000' using errcode = '22023';
  end if;

  if v_reason is not null and pg_catalog.length(v_reason) not between 5 and 200 then
    raise exception 'eng_record_offline_attempt: the reason for an earlier date must be 5 to 200 characters' using errcode = '22023';
  end if;
  if v_reason is not null and p_provenance <> 'manual_import' then
    raise exception 'eng_record_offline_attempt: only work on paper (manual_import) can be dated before the inquiry' using errcode = '22023';
  end if;

  -- Gợi ý đã dùng: bắt buộc nói rõ. 'none' (không dùng gì) và 'unknown' (chưa rõ) đứng một mình.
  select coalesce(array_agg(distinct x order by x), '{}') into v_assist from unnest(p_assistance) as x;
  if cardinality(v_assist) = 0
     or not (v_assist <@ array['none', 'notes', 'dictionary', 'asked_someone', 'ai_outside', 'unknown'])
     or (('none' = any (v_assist) or 'unknown' = any (v_assist)) and cardinality(v_assist) > 1) then
    raise exception 'eng_record_offline_attempt: say which help was used (or none / unknown)' using errcode = '22023';
  end if;

  -- Khóa dòng bước: hai lần ghi cùng lúc xếp hàng; cùng khóa với eng_submit_attempt của học sinh.
  select a.* into v_act from english.activity_instances a where a.id = p_activity for no key update;
  if not found then
    raise exception 'eng_record_offline_attempt: activity not found' using errcode = 'P0002';
  end if;
  select * into v_learner from english.learners l where l.id = v_act.learner_id;
  select * into v_member from english.members m where m.id = p_by;

  if v_member.id is null or not english.eng_actor_may_manage(p_by, v_act.learner_id)
     or (p_provenance = 'tutor_live' and v_member.role <> 'tutor') then
    raise exception 'eng_record_offline_attempt: this member may not record this work' using errcode = '42501';
  end if;
  -- D15 cho bài ghi ngoài app (chặt hơn, phụ huynh có thể nới sau): bước kiểm tra trong buổi (purpose có checkpoint) hoặc bước nói trực
  -- tiếp với gia sư (ACT-SPEAK-LIVE) CHỈ gia sư còn quan hệ hiệu lực ghi được; bước nói trực tiếp chỉ nhận provenance 'tutor_live'.
  if (v_act.purpose @> array['checkpoint'] or v_act.activity_type = 'ACT-SPEAK-LIVE') and v_member.role <> 'tutor' then
    raise exception 'eng_record_offline_attempt: only a tutor may record this step (D15)' using errcode = '42501';
  end if;
  if v_act.activity_type = 'ACT-SPEAK-LIVE' and p_provenance <> 'tutor_live' then
    raise exception 'eng_record_offline_attempt: a live speaking step is recorded as tutor_live only' using errcode = '22023';
  end if;

  v_content := pg_catalog.jsonb_build_object('text', p_text, 'session_date', p_session_date)
    || case when p_duration_sec is not null then pg_catalog.jsonb_build_object('duration_sec', p_duration_sec) else '{}'::jsonb end
    || case when p_word_count is not null then pg_catalog.jsonb_build_object('word_count', p_word_count) else '{}'::jsonb end
    || case when v_reason is not null then pg_catalog.jsonb_build_object('backdate_reason', v_reason) else '{}'::jsonb end;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_content::text, 'UTF8')), 'hex');

  -- Gửi lại: cùng biên nhận.
  select t.* into v_existing from english.attempts t
  where t.learner_id = v_act.learner_id and t.client_submission_id = p_client_id;
  if found then
    if v_existing.activity_instance_id <> p_activity
       or v_existing.content_hash <> v_hash
       or v_existing.declared_assistance is distinct from v_assist
       or v_existing.provenance is distinct from p_provenance then
      raise exception 'eng_record_offline_attempt: client id was already used for a different record' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'attempt_id', v_existing.id, 'episode_id', (select e.id from english.episodes e where e.attempt_id = v_existing.id),
      'attempt_no', v_existing.attempt_no, 'submitted_at', v_existing.submitted_at, 'hash', v_existing.content_hash, 'replayed', true);
  end if;

  if not english.eng_activity_released(p_activity) then
    raise exception 'eng_record_offline_attempt: this step is not open (not yet due, or skipped)' using errcode = '23514';
  end if;

  select i.snapshot, (i.assigned_at at time zone 'Asia/Ho_Chi_Minh')::date into v_snapshot, v_assigned
  from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  -- S5c: có lý do (bài trên giấy) thì ngày được lùi tới 14 ngày trước ngày giao, và bước không cần "đã mở vào ngày đó".
  v_backdated := v_reason is not null and (p_session_date < v_assigned - 1 or english.eng_step_effective_date(p_activity) > p_session_date);
  if p_session_date > english.eng_today_vn() or (not v_backdated and p_session_date < v_assigned - 1) then
    raise exception 'eng_record_offline_attempt: the date must be from the day before the inquiry was assigned until today' using errcode = '23514';
  end if;
  if v_backdated and p_session_date < v_assigned - 14 then
    raise exception 'eng_record_offline_attempt: the date may be at most 14 days before the inquiry was assigned (backdate_too_early)' using errcode = '23514';
  end if;
  -- Ngày của buổi phải khớp với bước: bước đã mở vào ngày đó (ngày hiệu lực của bước <= ngày ghi) ...
  if not v_backdated and english.eng_step_effective_date(p_activity) > p_session_date then
    raise exception 'eng_record_offline_attempt: the step was not open on that date (step_not_open_on_date)' using errcode = '23514';
  end if;
  -- ... và không được lùi trước lần làm gần nhất của chính bước này (kể cả bài em nộp trong app): thứ tự lần làm phải theo thời gian thật,
  -- vì "≥ 14 ngày kể từ lần luyện gần nhất" và số lần dựa vào đó.
  select (max(t.submitted_at) at time zone 'Asia/Ho_Chi_Minh')::date into v_last_date from english.attempts t where t.activity_instance_id = p_activity;
  if v_last_date is not null and p_session_date < v_last_date then
    raise exception 'eng_record_offline_attempt: the date is earlier than the last recorded attempt of this step (date_before_last_attempt)' using errcode = '23514';
  end if;

  select s.o_no, s.o_parent, s.o_family, s.o_first into v_no, v_parent, v_family, v_first
  from english.eng_attempt_slot(p_activity, v_act.mode, v_id, 'eng_record_offline_attempt') s;
  v_at := english.eng_session_ts(p_session_date);

  insert into english.attempts(
    id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance,
    declared_assistance, submitted_at, content_hash, client_submission_id)
  values (v_id, p_activity, v_act.learner_id, v_no, v_parent, v_family, v_act.mode, p_provenance,
          v_assist, v_at, v_hash, p_client_id);

  insert into english.artifact_versions(attempt_id, learner_id, kind, version, content, is_raw, created_by)
  values (v_id, v_act.learner_id, 'text', 1, v_content, true, p_by);

  -- Hỗ trợ: gia sư thấy tận mắt trong buổi → 'observed'; bài trên giấy do người khác kể lại → 'declared'; chưa rõ → 'unknown'.
  v_verification := case when p_provenance = 'tutor_live' then 'observed' else 'declared' end;
  foreach v_item in array v_assist loop
    if v_item = 'unknown' then
      insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification, recorded_by)
      values (v_act.learner_id, v_id, 'external_declared', null, v_act.target_ids, 'unknown', p_by);
    elsif v_item <> 'none' then
      insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification, recorded_by)
      values (v_act.learner_id, v_id, case when v_item = 'notes' then 'notes' else 'external_declared' end,
              v_item, v_act.target_ids, v_verification, p_by);
    end if;
  end loop;

  perform english.eng_record_attempt_effects(
    v_id, v_act.learner_id, v_act.target_ids, v_act.purpose, v_snapshot -> 'template' ->> 'id', v_no, v_first, v_at,
    p_provenance = 'tutor_live');
  select e.id into v_episode from english.episodes e where e.attempt_id = v_id;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'attempt.recorded_offline', v_learner.family_id, v_act.learner_id,
          pg_catalog.jsonb_build_object('attempt', v_id, 'attempt_no', v_no, 'activity_instance', p_activity, 'provenance', p_provenance)
          || case when v_backdated then pg_catalog.jsonb_build_object('backdated', true, 'backdate_reason', v_reason) else '{}'::jsonb end);

  return pg_catalog.jsonb_build_object(
    'attempt_id', v_id, 'episode_id', v_episode, 'attempt_no', v_no, 'submitted_at', v_at, 'hash', v_hash, 'replayed', false);
end
$$;


revoke execute on function english.eng_record_offline_attempt(uuid, text, text, int, int, date, text[], uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_record_offline_attempt(uuid, text, text, int, int, date, text[], uuid, uuid, text) to service_role;

insert into english.schema_migrations(version) values ('0017') on conflict do nothing;
