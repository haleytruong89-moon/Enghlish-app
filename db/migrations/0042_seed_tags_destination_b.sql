-- 0042_seed_tags_destination_b.sql
-- Destination C1&C2 · 23 nhãn ngữ pháp / từ vựng có sẵn cho Track B (hub HANDOVER_NHAN_DESTINATION_B_2026-11-24, phụ huynh chọn cách A).
--   Mã CỐ ĐỊNH mãi mãi: file bài soạn ngoài app (STUDIO_IMPORT_FORMAT v1) dùng đúng các mã này. 8 nhãn B cũ (0015) giữ nguyên.
--   SM-1 đã công bố (bất biến) nên không thêm lá. Nhóm của nhãn nằm ở cột MỚI error_tags.seed_group_key (chỉ nhãn có sẵn, chỉ khi
--   chưa có group_key). Không dùng group_key như nhãn nghe của 0026: chạy lại 0026 dựng lại luật error_tags_group_key_shape bản 0026
--   (chỉ 'nghe-…') và sẽ vỡ vì các dòng này.
--   Hai hàm đọc nhóm của nhãn được định nghĩa lại, giống hệt bản trước, chỉ thay "group_key" bằng coalesce(group_key, seed_group_key):
--     eng_skill_map (bản 0026) → Bản đồ kiến thức / ô chọn nhãn đặt nhãn vào đúng nhóm;
--     eng_point_inputs (bản 0027) → mức điểm kiến thức (và eng_point_map, đọc từ nó) biết mảng của nhãn.
-- Idempotent; chỉ thêm. Không đụng schema public.

-- 1. Cột nhóm cho nhãn có sẵn ra đời sau SM-1 ------------------------------------------------------------------------------------------
alter table english.error_tags add column if not exists seed_group_key text;
alter table english.error_tags drop constraint if exists error_tags_seed_group_key_shape;
alter table english.error_tags add constraint error_tags_seed_group_key_shape check (
  seed_group_key is null
  or (seed_group_key ~ '^[a-z]{2}-[a-z-]{2,30}$' and origin = 'seed' and family_id is null and group_key is null));

-- 2. 23 nhãn. Nguồn: content/tags/destination_B.json (test đối chiếu từng dòng). Thứ tự = created_at cách nhau 1 ms.
insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin, seed_group_key, created_at)
select v.track_id, v.key, v.label_vi, v.group_vi, null, 'seed', v.group_key,
  pg_catalog.clock_timestamp() + v.ord * interval '1 millisecond'
from (values
  ('B', 1, 'thi-hien-tai', 'Thì hiện tại', 'Ngữ pháp', 'gr-tense'),
  ('B', 2, 'thi-qua-khu', 'Thì quá khứ (cả used to / would)', 'Ngữ pháp', 'gr-tense'),
  ('B', 3, 'thi-tuong-lai', 'Thì tương lai & các cách nói tương lai', 'Ngữ pháp', 'gr-tense'),
  ('B', 4, 'modal-bat-buoc-cho-phep', 'Động từ khuyết thiếu (bắt buộc, cho phép, cần) & semi-modals', 'Ngữ pháp', 'gr-modal'),
  ('B', 5, 'tinh-tu-trang-tu', 'Tính từ & trạng từ (vị trí, so sánh, tính từ ghép)', 'Ngữ pháp', 'gr-compare-prep'),
  ('B', 6, 'menh-de-quan-he-phan-tu', 'Mệnh đề quan hệ & mệnh đề phân từ', 'Ngữ pháp', 'gr-clause'),
  ('B', 7, 'cau-phuc', 'Câu phức: liên từ, mệnh đề trạng ngữ, nhấn mạnh', 'Ngữ pháp', 'gr-clause'),
  ('B', 8, 'cum-danh-tu-mao-tu', 'Cụm danh từ, mạo từ, lượng từ', 'Ngữ pháp', 'gr-noun-det'),
  ('B', 9, 'dong-tu-bo-ngu', 'Động từ + V-ing / to V / mệnh đề', 'Ngữ pháp', 'gr-verb-pattern'),
  ('B', 10, 'ket-hop-tu', 'Kết hợp từ & cấu trúc cố định (collocations, patterns)', 'Từ vựng', 'vo-colloc-idiom'),
  ('B', 11, 'chu-de-tu-duy-hoc-tap', 'Chủ đề: Tư duy & học tập', 'Từ vựng', 'vo-topic'),
  ('B', 12, 'chu-de-thay-doi-cong-nghe', 'Chủ đề: Thay đổi & công nghệ', 'Từ vựng', 'vo-topic'),
  ('B', 13, 'chu-de-thoi-gian-cong-viec', 'Chủ đề: Thời gian & công việc', 'Từ vựng', 'vo-topic'),
  ('B', 14, 'chu-de-di-chuyen-giao-thong', 'Chủ đề: Di chuyển & giao thông', 'Từ vựng', 'vo-topic'),
  ('B', 15, 'chu-de-giao-tiep-truyen-thong', 'Chủ đề: Giao tiếp & truyền thông', 'Từ vựng', 'vo-topic'),
  ('B', 16, 'chu-de-co-hoi-thien-nhien', 'Chủ đề: Cơ hội & thiên nhiên', 'Từ vựng', 'vo-topic'),
  ('B', 17, 'chu-de-so-luong-tien-bac', 'Chủ đề: Số lượng & tiền bạc', 'Từ vựng', 'vo-topic'),
  ('B', 18, 'chu-de-vat-lieu-xay-dung', 'Chủ đề: Vật liệu & môi trường xây dựng', 'Từ vựng', 'vo-topic'),
  ('B', 19, 'chu-de-cam-xuc-suc-khoe', 'Chủ đề: Cảm xúc, phản ứng & sức khỏe', 'Từ vựng', 'vo-topic'),
  ('B', 20, 'chu-de-quyen-luc-xa-hoi', 'Chủ đề: Quyền lực & vấn đề xã hội', 'Từ vựng', 'vo-topic'),
  ('B', 21, 'chu-de-chat-luong-nghe-thuat', 'Chủ đề: Chất lượng & nghệ thuật', 'Từ vựng', 'vo-topic'),
  ('B', 22, 'chu-de-quan-he-con-nguoi', 'Chủ đề: Các mối quan hệ & con người', 'Từ vựng', 'vo-topic'),
  ('B', 23, 'chu-de-so-thich-giai-tri', 'Chủ đề: Sở thích & giải trí', 'Từ vựng', 'vo-topic')
) as v(track_id, ord, key, label_vi, group_vi, group_key)
on conflict (track_id, key) do nothing;

-- 3. Bản đồ cho một em (bản 0026 + seed_group_key) --------------------------------------------------------------------------------------
create or replace function english.eng_skill_map(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_map english.skill_maps%rowtype;
  v_set text[];
begin
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_skill_map: learner not found' using errcode = 'P0002';
  end if;
  select * into v_map from english.skill_maps m where m.published_at is not null order by m.published_at desc, m.id desc limit 1;
  if not found then
    raise exception 'eng_skill_map: no published skill map' using errcode = 'P0002';
  end if;
  select d.target_ids into v_set
  from english.target_sets ts
  join english.target_set_definitions d on d.id = ts.definition_id
  where ts.learner_id = p_learner and ts.effective_from <= pg_catalog.now()
  order by ts.effective_from desc, ts.seq desc
  limit 1;
  v_set := coalesce(v_set, '{}'::text[]);

  return (
    with leaves as (
      -- nhãn có sẵn của track em (kể cả lá ẩn khỏi ô chọn và nhãn đã nghỉ dùng: dấu nhãn cũ vẫn cần tên và mảng)
      select lf.group_key, 0 as o1, lf.ord as o2, t.label_vi as o3,
             pg_catalog.jsonb_build_object(
               'kind', 'tag', 'track_id', lf.track_id, 'ref_key', lf.ref_key, 'label_vi', t.label_vi,
               'level_from', lf.level_from, 'level_to', lf.level_to, 'task_from', lf.task_from, 'task_to', lf.task_to,
               'core', lf.core, 'hidden_in_picker', lf.hidden_in_picker, 'related', pg_catalog.to_jsonb(lf.related),
               'custom', false, 'in_set', false) as leaf
      from english.skill_leaves lf
      join english.error_tags t on t.track_id = lf.track_id and t.key = lf.ref_key and t.family_id is null
      where lf.map_id = v_map.id and lf.kind = 'tag' and lf.track_id = v_l.track_id
      union all
      -- nhãn có nhóm riêng (group_key): nhãn riêng của gia đình (kể cả đã nghỉ dùng; ô chọn tự bỏ nhãn đã nghỉ) và, từ 0026, nhãn có sẵn
      -- ra đời sau SM-1 (nhãn nghe 'nghe-…'): nhãn có sẵn trước, theo thứ tự tạo
      select coalesce(t.group_key, t.seed_group_key), 1, case when t.origin = 'seed' then 0 else 1 end, t.label_vi,
             pg_catalog.jsonb_build_object(
               'kind', 'tag', 'track_id', t.track_id, 'ref_key', t.key, 'label_vi', t.label_vi,
               'level_from', null, 'level_to', null, 'task_from', null, 'task_to', null,
               'core', false, 'hidden_in_picker', false, 'related', '[]'::jsonb, 'custom', t.origin = 'custom', 'in_set', false)
      from english.error_tags t
      where (t.family_id = v_l.family_id or (t.family_id is null and t.origin = 'seed')) and t.track_id = v_l.track_id and coalesce(t.group_key, t.seed_group_key) is not null
        and exists (select 1 from english.skill_groups g where g.map_id = v_map.id and g.key = coalesce(t.group_key, t.seed_group_key))
      union all
      -- mọi kỹ năng danh mục của bản đồ; "trong bộ" = trong bộ kỹ năng hiện tại của em
      select lf.group_key, case when lf.ref_key = any (v_set) then 2 else 3 end, lf.ord, tg.title_vi,
             pg_catalog.jsonb_build_object(
               'kind', 'target', 'track_id', lf.track_id, 'ref_key', lf.ref_key, 'label_vi', tg.title_vi,
               'level_from', lf.level_from, 'level_to', lf.level_to, 'task_from', lf.task_from, 'task_to', lf.task_to,
               'core', lf.core, 'hidden_in_picker', lf.hidden_in_picker, 'related', pg_catalog.to_jsonb(lf.related),
               'custom', false, 'in_set', lf.ref_key = any (v_set))
      from english.skill_leaves lf
      join english.targets tg on tg.id = lf.ref_key and tg.descriptor_version = v_map.catalogue_version
      where lf.map_id = v_map.id and lf.kind = 'target'
    ),
    loose as (
      -- nhãn đang dùng của track em (có sẵn hoặc của gia đình) chưa có nhóm trong bản đồ
      select t.created_at, t.label_vi,
             pg_catalog.jsonb_build_object(
               'kind', 'tag', 'track_id', t.track_id, 'ref_key', t.key, 'label_vi', t.label_vi,
               'level_from', null, 'level_to', null, 'task_from', null, 'task_to', null,
               'core', false, 'hidden_in_picker', false, 'related', '[]'::jsonb, 'custom', t.origin = 'custom', 'in_set', false) as leaf
      from english.error_tags t
      where t.track_id = v_l.track_id and t.retired_at is null and (t.family_id is null or t.family_id = v_l.family_id)
        and not exists (select 1 from english.skill_leaves lf
                        where lf.map_id = v_map.id and lf.kind = 'tag' and lf.track_id = t.track_id and lf.ref_key = t.key)
        and not (coalesce(t.group_key, t.seed_group_key) is not null
                 and exists (select 1 from english.skill_groups g where g.map_id = v_map.id and g.key = coalesce(t.group_key, t.seed_group_key)))
    )
    select pg_catalog.jsonb_build_object(
      'map_id', v_map.id,
      'track_id', v_l.track_id,
      'assumed', coalesce(v_map.assumed -> v_l.track_id, '{}'::jsonb),
      'domains', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'key', d.key, 'name_vi', d.name_vi, 'scale', d.scale,
            'groups', (
              select coalesce(pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'key', g.key, 'name_vi', g.name_vi, 'desc', g.descriptions,
                  'leaves', (select coalesce(pg_catalog.jsonb_agg(x.leaf order by x.o1, x.o2, x.o3), '[]'::jsonb)
                             from leaves x where x.group_key = g.key))
                order by g.ord), '[]'::jsonb)
              from english.skill_groups g where g.map_id = v_map.id and g.domain_key = d.key))
          order by d.ord)
        from english.skill_domains d where d.map_id = v_map.id),
      'unassigned', (select coalesce(pg_catalog.jsonb_agg(u.leaf order by u.created_at, u.label_vi), '[]'::jsonb) from loose u))
  );
end
$$;
revoke execute on function english.eng_skill_map(uuid) from public, anon, authenticated;
grant execute on function english.eng_skill_map(uuid) to service_role;

-- 4. Đầu vào mức điểm kiến thức (bản 0027 + seed_group_key) -----------------------------------------------------------------------------
create or replace function english.eng_point_inputs(p_learner uuid, p_tags text[] default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_policy text := english.eng_point_policy();
  v_map text := english.eng_current_skill_map();
begin
  if p_learner is null then
    raise exception 'eng_point_inputs: learner id is required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_point_inputs: learner not found' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object(
    'learner_id', p_learner,
    'now', pg_catalog.clock_timestamp(),
    'policy', case when v_policy is null then null else pg_catalog.jsonb_build_object(
      'version', v_policy,
      'config', (select p.config from english.point_policies p where p.version = v_policy)) end,
    'points', coalesce((
      with q as (
        select coalesce(m.tag_key, m.reading_skill_key) as tag,
               m.template_id || ':' || m.item_id || ':' || t.id::text as ref,
               case when t.taken_on is not null then (t.taken_on - date '1970-01-01') else english.eng_vn_day(t.submitted_at) end as day,
               m.template_id as source_id,
               t.submitted_at as at,
               t.id as attempt_id,
               -- Thứ tự trong CÙNG ngày/lần làm: số của mảng ("Part II" → 2), rồi chữ của mảng, rồi SỐ câu (không phải chữ: q2 < q10).
               coalesce(nullif(pg_catalog.left(pg_catalog.regexp_replace(coalesce(m.part, ''), '[^0-9]', '', 'g'), 9), ''), '0')::int as part_no,
               coalesce(m.part, '') as part,
               m.n as qn,
               (t.declared_assistance = array['none']) as unsupported,
               -- Câu để trống (đã có cơ hội làm) tính là SAI, như eng_record_studio_result và S7a; câu chỉ ở giấy (out_of_app) đã bị loại ở dưới.
               case when (case when (c.checks -> 'items' -> m.item_id ->> 'result') = 'needs_person'
                                 then (select d.result from english.item_decisions d where d.attempt_id = t.id and d.item_id = m.item_id)
                               else c.checks -> 'items' -> m.item_id ->> 'result' end) = 'blank' then 'incorrect'
                    else case when (c.checks -> 'items' -> m.item_id ->> 'result') = 'needs_person'
                                then (select d.result from english.item_decisions d where d.attempt_id = t.id and d.item_id = m.item_id)
                              else c.checks -> 'items' -> m.item_id ->> 'result' end end as res
        from english.studio_item_meta m
        join english.inquiry_instances i on i.learner_id = p_learner and i.template_id = m.template_id and i.template_version = m.template_version
        join english.activity_instances a on a.inquiry_instance_id = i.id and a.step_no = 1
        join english.attempts t on t.activity_instance_id = a.id and t.learner_id = p_learner
        join english.episodes e on e.attempt_id = t.id and e.is_first_attempt
        join english.attempt_auto_checks c on c.attempt_id = t.id
        where m.learner_id = p_learner and not m.out_of_app
          and (p_tags is null or coalesce(m.tag_key, m.reading_skill_key) = any (p_tags))
          and not english.eng_is_step_repeat(t.id)
      ),
      tags as (
        select x.tag from (
          select m.tag from (select coalesce(sm.tag_key, sm.reading_skill_key) as tag from english.studio_item_meta sm where sm.learner_id = p_learner) m
          union
          select up.tag_key from english.curriculum_unit_points up
          join english.curriculum_versions cv on cv.id = up.version_id and cv.status = 'approved'
          where up.learner_id = p_learner
          union
          select d.tag_key from english.point_decisions d where d.learner_id = p_learner) x
        where p_tags is null or x.tag = any (p_tags)
      )
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'tag_key', g.tag,
               'title_vi', (select et.label_vi from english.error_tags et
                            where et.track_id = v_l.track_id and et.key = g.tag and (et.family_id is null or et.family_id = v_l.family_id) limit 1),
               'group_key', coalesce(
                 (select sl.group_key from english.skill_leaves sl where sl.map_id = v_map and sl.kind = 'tag' and sl.track_id = v_l.track_id and sl.ref_key = g.tag),
                 (select coalesce(et.group_key, et.seed_group_key) from english.error_tags et
                  where et.track_id = v_l.track_id and et.key = g.tag and (et.family_id is null or et.family_id = v_l.family_id) limit 1)),
               'taught_unit', exists (
                 select 1 from english.curriculum_unit_points up
                 join english.curriculum_versions cv on cv.id = up.version_id and cv.status = 'approved'
                 join english.curriculum_units u on u.version_id = up.version_id and u.code = up.code
                 where up.learner_id = p_learner and up.tag_key = g.tag
                   -- Mức 1 từ Unit cần "đã dạy ở một buổi" = có ghi chú buổi học gắn Unit đó (không chỉ đánh dấu "Đang học").
                   and exists (select 1 from english.lesson_note_units ln
                               where ln.learner_id = p_learner and ln.curriculum_id = u.curriculum_id and ln.unit_code = u.code)),
               'counted', coalesce((
                 select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                          'ref', q.ref, 'day', q.day, 'correct', q.res = 'correct', 'source_id', q.source_id, 'first', true)
                        order by q.day, q.at, q.attempt_id, q.part_no, q.part, q.qn, q.ref)
                 from q where q.tag = g.tag and q.unsupported and q.res in ('correct', 'incorrect')), '[]'::jsonb),
               'supported_correct', (select pg_catalog.count(*) from q where q.tag = g.tag and not q.unsupported and q.res = 'correct')::int,
               'supported_attempted', (select pg_catalog.count(*) from q where q.tag = g.tag and not q.unsupported and q.res in ('correct', 'incorrect'))::int,
               'decisions', coalesce((
                 select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                          'id', d.id, 'seq', d.seq, 'kind', d.kind, 'from_state', d.from_state, 'to_state', d.to_state,
                          'evidence_key', d.evidence_key, 'responds_to', d.responds_to, 'created_at', d.created_at)
                        order by d.seq)
                 from english.point_decisions d where d.learner_id = p_learner and d.tag_key = g.tag), '[]'::jsonb))
             order by g.tag)
      from tags g), '[]'::jsonb));
end
$$;
revoke execute on function english.eng_point_inputs(uuid, text[]) from public, anon, authenticated;
grant execute on function english.eng_point_inputs(uuid, text[]) to service_role;

insert into english.schema_migrations(version) values ('0042') on conflict do nothing;
