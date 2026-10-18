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

insert into english.schema_migrations(version) values ('0017') on conflict do nothing;
