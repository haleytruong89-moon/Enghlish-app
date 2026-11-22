-- 0040_tutor_passage_items.sql
-- E1 tiếp (hub Q4, phụ huynh đồng ý 22/11): câu có bài đọc. Gia sư AI ở E1 chỉ nhận đề câu, không nhận bài đọc, nên dễ đoán nội dung
-- bài. eng_tutor_context = thân 0039 + một trường 'has_passage' (câu có passage_ref trong bản nháp Studio đã duyệt). Máy chủ thấy
-- has_passage thì không gọi AI, trả câu gợi ý cách làm cố định (lib/tutor/policy.ts, fixed_code 'passage'). Tới E2 (gửi được bài đọc)
-- thì bỏ.
-- Idempotent; chỉ thay một hàm (cùng chữ ký, cùng quyền). Không đụng schema public. Cần 0039 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations s where s.version = '0039') then
    raise exception '0040 cần 0039 đã áp (missing_0039)' using errcode = 'P0001';
  end if;
end
$guard$;

create or replace function english.eng_tutor_context(p_user uuid, p_activity uuid, p_item text, p_client_id text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_act english.activity_instances%rowtype;
  v_inst english.inquiry_instances%rowtype;
  v_l english.learners%rowtype;
  v_item jsonb;
  v_part jsonb;
  v_key text;
  v_kind text;
  v_prev english.tutor_turns%rowtype;
  v_hints int;
  v_today int;
  v_limit int;
begin
  if p_user is null or p_activity is null or p_item is null or p_client_id is null then
    raise exception 'eng_tutor_context: user, step, item and client id are required' using errcode = '22004';
  end if;
  select m.id into v_member from english.members m where m.user_id = p_user and m.role = 'student';
  select a.* into v_act from english.activity_instances a join english.learners l on l.id = a.learner_id
  where a.id = p_activity and v_member is not null and l.member_id = v_member;
  if not found or not english.eng_activity_released(p_activity) then
    raise exception 'eng_tutor_context: step not found (not_found)' using errcode = 'P0002';
  end if;
  select * into v_l from english.learners l where l.id = v_act.learner_id;
  select * into v_inst from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  if not exists (select 1 from english.inquiry_templates tp where tp.id = v_inst.template_id and tp.version = v_inst.template_version and tp.kind = 'studio') then
    raise exception 'eng_tutor_context: the tutor is for Studio practice (not_studio)' using errcode = 'P0002';
  end if;
  -- L2: không gia sư AI ở bài kiểm tra (cờ Bài kiểm tra hoặc bước INDEPENDENT_CHECK).
  if english.eng_work_is_test(p_activity) then
    raise exception 'eng_tutor_context: no tutor on a test (test_work)' using errcode = '42501';
  end if;
  -- Cùng client_id đã ghi: trả lượt cũ (không gọi AI lần hai), trước mọi kiểm "đã nộp" (lượt đó có thể ghi ngay trước khi nộp).
  select * into v_prev from english.tutor_turns t where t.learner_id = v_l.id and t.client_id = p_client_id;
  if found and (v_prev.activity_id <> p_activity or v_prev.item_id <> p_item) then
    raise exception 'eng_tutor_context: client id used for another question (client_id_reused)' using errcode = '22023';
  end if;
  if found then
    return pg_catalog.jsonb_build_object('replay', pg_catalog.jsonb_build_object(
      'id', v_prev.id, 'item_id', v_prev.item_id, 'kind', v_prev.kind, 'level', v_prev.level, 'shown_text', v_prev.shown_text, 'fixed_code', v_prev.fixed_code));
  end if;
  -- P-E1-3: chỉ khi đang làm, trước khi nộp (sau khi nộp có luồng thử lại / Xem đáp án).
  if exists (select 1 from english.attempts t where t.activity_instance_id = p_activity) then
    raise exception 'eng_tutor_context: the work was already sent (sent)' using errcode = '23514';
  end if;
  select x into v_item
  from pg_catalog.jsonb_array_elements(v_inst.snapshot -> 'steps') st, pg_catalog.jsonb_array_elements(st -> 'items') x
  where (st ->> 'step_no')::int = v_act.step_no and x ->> 'id' = p_item
  limit 1;
  if v_item is null then
    raise exception 'eng_tutor_context: question not found (not_found)' using errcode = 'P0002';
  end if;
  -- Phần của câu (E0); không có thì null (G8: máy chủ không gọi AI).
  select pg_catalog.jsonb_build_object('key', m.part, 'name', coalesce(p.e ->> 'name', m.part), 'instructions', coalesce(p.e ->> 'instructions', ''))
    into v_part
  from english.studio_item_meta m
  left join lateral (
    select x.e from english.studio_drafts d, pg_catalog.jsonb_array_elements(d.payload -> 'parts') as x(e)
    where d.template_id = v_inst.template_id and d.template_version = v_inst.template_version and d.status = 'approved' and x.e ->> 'key' = m.part
    limit 1) p on true
  where m.template_id = v_inst.template_id and m.template_version = v_inst.template_version and m.item_id = p_item and not m.out_of_app;
  select k.answer, k.kind into v_key, v_kind from english.instance_item_keys k where k.inquiry_instance_id = v_inst.id and k.item_id = p_item;
  select pg_catalog.count(*) into v_hints from english.tutor_turns t
  where t.learner_id = v_l.id and t.activity_id = p_activity and t.item_id = p_item and t.kind = 'hint';
  select pg_catalog.count(*) into v_today from english.tutor_turns t
  -- Lượt có gọi AI hôm nay (giờ Việt Nam): lượt gợi ý / câu hỏi, và cả lượt AI lỗi (đã gọi model, có thể đã tốn tiền).
  where t.learner_id = v_l.id and (t.kind <> 'fixed' or t.fixed_code = 'ai_error') and (t.created_at at time zone 'Asia/Ho_Chi_Minh')::date = english.eng_today_vn();
  v_limit := coalesce((english.eng_track_setting(v_l.track_id, 'tutor_daily_limit') #>> '{}')::int, 40);
  return pg_catalog.jsonb_build_object(
    'learner_id', v_l.id, 'family_id', v_l.family_id, 'track_id', v_l.track_id,
    'item', pg_catalog.jsonb_build_object('id', v_item ->> 'id', 'kind', v_item ->> 'kind', 'stem', v_item ->> 'stem', 'options', coalesce(v_item -> 'options', '[]'::jsonb)),
    'part', v_part,
    -- 0040 (hub Q4): câu dựa vào một bài đọc (passage_ref trong bản nháp đã duyệt). Gia sư AI chưa nhận bài đọc → máy chủ không gọi AI.
    'has_passage', exists (
      select 1 from english.studio_item_meta m2
      join english.studio_drafts d on d.template_id = m2.template_id and d.template_version = m2.template_version and d.status = 'approved'
      cross join lateral pg_catalog.jsonb_array_elements(d.payload -> 'items') as x(e)
      where m2.template_id = v_inst.template_id and m2.template_version = v_inst.template_version and m2.item_id = p_item
        and (x.e ->> 'n')::int = m2.n and pg_catalog.btrim(coalesce(x.e ->> 'passage_ref', '')) <> ''),
    -- Đáp án: CHỈ để máy chủ kiểm L1 và nhắc model tránh. Trắc nghiệm: chữ cái. Câu khác: các đáp án ngăn bằng " / " + đáp án thầy/cô thêm sau.
    'answers', coalesce((
      select pg_catalog.jsonb_agg(distinct a) from (
        select pg_catalog.btrim(x) as a from pg_catalog.regexp_split_to_table(coalesce(case when v_kind = 'answer' then v_key end, ''), ' / ') x
        union all
        select pg_catalog.btrim(aa.answer) from english.accepted_additions aa
        where aa.template_id = v_inst.template_id and aa.template_version = v_inst.template_version and aa.item_id = p_item) s
      where s.a <> ''), '[]'::jsonb),
    -- Văn bản đồng ý mới nhất mà phụ huynh đã bấm cho em (ai_text): gia sư AI chỉ chạy khi đó là bản có nói về gia sư AI (máy chủ so).
    'consent_version', (select c.notice_version from english.consents c where c.learner_id = v_l.id and c.scope = 'ai_text' and c.granted
                        order by c.at desc, c.id desc limit 1),
    'hints_used', v_hints,
    'turns_today', v_today,
    'daily_limit', v_limit,
    'language', english.eng_track_setting(v_l.track_id, 'tutor_language') #>> '{}',
    'band', english.eng_track_setting(v_l.track_id, 'tutor_band') #>> '{}',
    'previous', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', t.kind, 'level', t.level, 'child_text', t.child_text, 'shown_text', t.shown_text) order by t.created_at)
      from (select * from english.tutor_turns t where t.learner_id = v_l.id and t.activity_id = p_activity and t.item_id = p_item
            order by t.created_at desc limit 4) t), '[]'::jsonb));
end
$$;

revoke execute on function english.eng_tutor_context(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function english.eng_tutor_context(uuid, uuid, text, text) to service_role;

insert into english.schema_migrations(version) values ('0040') on conflict do nothing;
