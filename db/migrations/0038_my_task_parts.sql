-- 0038_my_task_parts.sql
-- E0 (bàn giao "Gia sư AI tiếng Anh" 21/11, phụ lục B): ô Đề bài gộp lời dặn của mọi phần. Con cần biết câu nào thuộc phần nào để
-- mỗi câu chỉ hiện lời dặn + word bank của phần đó. Dữ liệu đã có từ 0024: studio_item_meta (phần của từng câu) và bản nháp đã duyệt
-- (tên + lời dặn của từng phần), nhưng con không đọc được hai bảng đó.
--   1. eng_my_task_parts(p_activity) — CON đọc (authenticated, nhận diện bằng auth.uid()): bước đã mở của CHÍNH con thuộc bài Studio →
--      [{key, name, instructions, items: ['q1', …]}] theo thứ tự câu. Chỉ chữ đã có trên đề (tên phần, lời dặn); KHÔNG đáp án, đáp án chấp
--      nhận, giải thích, nhãn, kỹ năng, câu làm trên giấy. Bài khác / bước chưa mở / không phải của con → null.
-- Chỉ thêm (một hàm đọc), idempotent. Không đụng schema public. Không sửa bài đã duyệt. Cần 0037 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations s where s.version = '0037') then
    raise exception '0038 cần 0037 đã áp (missing_0037)' using errcode = 'P0001';
  end if;
end
$guard$;

create or replace function english.eng_my_task_parts(p_activity uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_act english.activity_instances%rowtype;
  v_inst english.inquiry_instances%rowtype;
  v_parts jsonb;
  v_items text[];
begin
  select m.id into v_member from english.members m where m.user_id = auth.uid() and m.role = 'student';
  if v_member is null then return null; end if;
  select a.* into v_act
  from english.activity_instances a
  join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member;
  if not found or not english.eng_activity_released(p_activity) then return null; end if;
  select * into v_inst from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  if not exists (select 1 from english.inquiry_templates tp
                 where tp.id = v_inst.template_id and tp.version = v_inst.template_version and tp.kind = 'studio') then
    return null;
  end if;

  -- Chỉ câu của ĐÚNG bước này (ảnh chụp bước trong bài đã giao), không câu của bước khác cùng bài (vd. bước sửa bài).
  select array(select x ->> 'id' from pg_catalog.jsonb_array_elements(st -> 'items') x) into v_items
  from pg_catalog.jsonb_array_elements(v_inst.snapshot -> 'steps') st
  where (st ->> 'step_no')::int = v_act.step_no
  limit 1;
  if v_items is null or cardinality(v_items) = 0 then return null; end if;

  -- Phần của từng câu làm trên app (studio_item_meta, đúng phiên bản bài đã giao); tên + lời dặn từ bản nháp đã duyệt ra đúng phiên bản đó
  -- (phần không còn trong bản nháp: tên = mã phần, lời dặn trống).
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'key', g.part,
           'name', coalesce(p.e ->> 'name', g.part),
           'instructions', coalesce(p.e ->> 'instructions', ''),
           'items', g.items) order by g.first_n)
    into v_parts
  from (
    select m.part, pg_catalog.min(m.n) as first_n, pg_catalog.jsonb_agg(m.item_id order by m.n) as items
    from english.studio_item_meta m
    where m.template_id = v_inst.template_id and m.template_version = v_inst.template_version and not m.out_of_app
      and m.item_id = any(v_items)
    group by m.part
  ) g
  left join lateral (
    select x.e
    from english.studio_drafts d, pg_catalog.jsonb_array_elements(d.payload -> 'parts') as x(e)
    where d.template_id = v_inst.template_id and d.template_version = v_inst.template_version and d.status = 'approved'
      and x.e ->> 'key' = g.part
    limit 1
  ) p on true;
  return v_parts;
end
$$;
revoke execute on function english.eng_my_task_parts(uuid) from public, anon, service_role;
grant execute on function english.eng_my_task_parts(uuid) to authenticated;

insert into english.schema_migrations(version) values ('0038') on conflict do nothing;
