-- 0044_unit_progress_auto.sql
-- L2 · "Tiến độ tự chạy" (26/11, phụ huynh duyệt cách B: "ok"). Kế hoạch docs/superpowers/plans/2026-11-26-l2-tien-do-tu-chay.md.
--   Luật mới (DOMAIN §5.1, bản 0.11): con nộp bài của một Unit đang "Chưa bắt đầu" → Unit đó là "Đang học" (app đặt theo bài nộp).
--   "Đã học" vẫn chỉ do người lớn đặt (độ phủ chỉ đếm "Đã học"); app không bao giờ hạ; người lớn đổi sau bài nộp thì người lớn thắng,
--   tới khi con nộp bài mới của Unit đó.
--   1. eng_unit_auto_events(learner): DẪN XUẤT, không lưu — mỗi Unit (giáo trình đã duyệt, không bỏ qua) có bài con đã nộp, lúc nộp mới
--      nhất, chỉ khi trạng thái người lớn đặt tới lúc đó là "chưa có" hoặc "Chưa bắt đầu". Unit của bài: Unit giao kèm bài Studio (0037),
--      Unit giao kèm bài link / PDF (0029), hoặc — bài Studio không gắn Unit — "Unit N" trong tên bài → mã UN của giáo trình chính
--      (cùng luật trang Kết quả: không tính "Review n", "Progress Test n", "Unit 1–2").
--   2. eng_unit_auto(learner): đọc cho người lớn của em (authenticated; ngoài phạm vi = rỗng).
--   3. eng_my_roadmap() = thân 0031 + trạng thái tự chạy (núi của con lên theo bài nộp). Không điểm, không số.
-- Idempotent; chỉ thêm hàm (không bảng mới). Không đụng schema public. Cần 0043 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations s where s.version = '0043') then
    raise exception '0044 cần 0043 đã áp (missing_0043)' using errcode = 'P0001';
  end if;
end
$guard$;

-- 1. Trạng thái "Đang học" do app đặt (dẫn xuất) --------------------------------------------------------------------------------
create or replace function english.eng_unit_auto_events(p_learner uuid)
returns table (curriculum_id uuid, unit_code text, at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with main as (select english.eng_roadmap_main_id(p_learner) as id),
  skipped_step as (
    select ai.id from english.activity_instances ai
    where ai.learner_id = p_learner
      and coalesce((select e.kind = 'skip' from english.activity_instance_events e
                    where e.activity_instance_id = ai.id and e.kind in ('skip', 'unskip') order by e.at desc, e.id desc limit 1), false)
  ),
  sent as (
    -- (a) Studio tests given with Units (0037)
    select su.curriculum_id, su.unit_code, t.submitted_at
    from english.studio_assignment_units su
    join english.attempts t on t.activity_instance_id = su.activity_id
    where su.learner_id = p_learner and su.activity_id not in (select id from skipped_step)
    union all
    -- (b) link / PDF work given with Units (0029), not retracted
    select au.curriculum_id, au.unit_code, sb.created_at
    from english.assignment_units au
    join english.submissions sb on sb.assignment_id = au.assignment_id
    where au.learner_id = p_learner
      and not exists (select 1 from english.assignment_events ev where ev.assignment_id = au.assignment_id and ev.kind = 'retracted')
    union all
    -- (c) Studio tests given WITHOUT Units: "Unit N" in the title → UN of the main curriculum (rule of lib/results/score.ts unitKeyOf)
    select m.id, 'U' || ((pg_catalog.regexp_match(pg_catalog.lower(i.snapshot -> 'template' ->> 'title_vi'), '\munits?\s*(\d{1,2})\y(?!\s*[–-]\s*\d)'))[1])::int::text,
           t.submitted_at
    from main m
    join english.inquiry_instances i on i.learner_id = p_learner
    join english.inquiry_templates tp on tp.id = i.template_id and tp.version = i.template_version and tp.kind = 'studio'
    join english.activity_instances ai on ai.inquiry_instance_id = i.id
    join english.attempts t on t.activity_instance_id = ai.id
    where m.id is not null
      and ai.id not in (select id from skipped_step)
      and not exists (select 1 from english.studio_assignment_units su where su.inquiry_instance_id = i.id)
      and pg_catalog.lower(coalesce(i.snapshot -> 'template' ->> 'title_vi', '')) !~ '\mreview\s*\d'
      and pg_catalog.lower(coalesce(i.snapshot -> 'template' ->> 'title_vi', '')) !~ '\mprogress test\s*\d'
      and pg_catalog.regexp_match(pg_catalog.lower(coalesce(i.snapshot -> 'template' ->> 'title_vi', '')), '\munits?\s*(\d{1,2})\y(?!\s*[–-]\s*\d)') is not null
  ),
  latest as (select s.curriculum_id, s.unit_code, pg_catalog.max(s.submitted_at) as at from sent s group by s.curriculum_id, s.unit_code)
  select l.curriculum_id, l.unit_code, l.at
  from latest l
  join english.curricula c on c.id = l.curriculum_id and c.learner_id = p_learner
  join english.curriculum_versions v on v.curriculum_id = l.curriculum_id and v.status = 'approved'
  join english.curriculum_units cu on cu.version_id = v.id and cu.code = l.unit_code and not cu.skipped
  -- Only up from "nothing" / "Chưa bắt đầu" as the adult had left it when the work was sent: never down, never over the adult.
  where coalesce((select e.status from english.curriculum_unit_events e
                  where e.curriculum_id = l.curriculum_id and e.unit_code = l.unit_code and e.created_at <= l.at
                  order by e.created_at desc, e.id desc limit 1), 'not_started') = 'not_started'
$$;
revoke execute on function english.eng_unit_auto_events(uuid) from public, anon, authenticated, service_role;

-- 2. Đọc cho người lớn của em (user client; ngoài phạm vi: rỗng) -----------------------------------------------------------------
create or replace function english.eng_unit_auto(p_learner uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('curriculum_id', a.curriculum_id, 'unit_code', a.unit_code, 'at', a.at)
                                       order by a.at, a.unit_code), '[]'::jsonb)
  from english.eng_unit_auto_events(p_learner) a
  where english.eng_is_staff_of(p_learner)
$$;
revoke execute on function english.eng_unit_auto(uuid) from public, anon;
grant execute on function english.eng_unit_auto(uuid) to authenticated, service_role;

-- 3. Núi của con: = thân 0031 + trạng thái tự chạy ----------------------------------------------------------------------------
create or replace function english.eng_my_roadmap() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_learner uuid;
  v_main uuid;
  v_ver uuid;
begin
  select l.id into v_learner
  from english.members m join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if v_learner is null then
    return pg_catalog.jsonb_build_object('main', null, 'units', '[]'::jsonb, 'others', '[]'::jsonb, 'milestones', '[]'::jsonb);
  end if;
  v_main := english.eng_roadmap_main_id(v_learner);
  select v.id into v_ver from english.curriculum_versions v where v.curriculum_id = v_main and v.status = 'approved';
  return pg_catalog.jsonb_build_object(
    'main', (select pg_catalog.jsonb_build_object('id', c.id, 'title', c.title) from english.curricula c where c.id = v_main),
    'units', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'code', u.code, 'ord', u.ord, 'title', u.title, 'skipped', u.skipped,
        'status', coalesce(le.status, 'not_started'),
        'done_on', case when le.status = 'done' then (le.created_at at time zone 'Asia/Ho_Chi_Minh')::date else null end) order by u.ord)
      from english.curriculum_units u
      -- 0044 (L2): the adult's events AND the app's "Đang học" from work the child sent (eng_unit_auto_events); the latest wins.
      left join lateral (select x.status, x.created_at from (
                           select e.status, e.created_at, e.id::text as k from english.curriculum_unit_events e
                           where e.curriculum_id = v_main and e.unit_code = u.code
                           union all
                           select 'in_progress', a.at, 'auto' from english.eng_unit_auto_events(v_learner) a
                           where a.curriculum_id = v_main and a.unit_code = u.code
                         ) x order by x.created_at desc, x.k desc limit 1) le on true
      where u.version_id = v_ver), '[]'::jsonb),
    'others', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', o.id, 'title', o.title, 'done', o.done, 'total', o.total) order by o.created_at, o.id)
      from (
        select c.id, c.title, c.created_at,
          (select pg_catalog.count(*) from english.curriculum_units u
            left join lateral (select e.status from english.curriculum_unit_events e where e.curriculum_id = c.id and e.unit_code = u.code order by e.created_at desc, e.id desc limit 1) le on true
            where u.version_id = v.id and not u.skipped and coalesce(le.status, '') = 'done')::int as done,
          (select pg_catalog.count(*) from english.curriculum_units u
            left join lateral (select e.status from english.curriculum_unit_events e where e.curriculum_id = c.id and e.unit_code = u.code order by e.created_at desc, e.id desc limit 1) le on true
            where u.version_id = v.id and not u.skipped and coalesce(le.status, '') <> 'skipped')::int as total
        from english.curricula c join english.curriculum_versions v on v.curriculum_id = c.id and v.status = 'approved'
        where c.learner_id = v_learner and c.id is distinct from v_main
      ) o), '[]'::jsonb),
    'milestones', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', s.milestone_id, 'kind', s.kind, 'role', s.role, 'title', s.title, 'curriculum_id', s.curriculum_id,
        'after_unit', s.after_unit, 'target_month', s.target_month, 'approx', s.approx) order by s.created_at, s.milestone_id)
      from english.eng_roadmap_visible(v_learner) s), '[]'::jsonb)
  );
end
$$;
revoke execute on function english.eng_my_roadmap() from public, anon, service_role;
grant execute on function english.eng_my_roadmap() to authenticated;

insert into english.schema_migrations(version) values ('0044') on conflict do nothing;
