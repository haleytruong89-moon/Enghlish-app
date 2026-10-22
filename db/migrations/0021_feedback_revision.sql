-- 0021_feedback_revision.sql
-- S6 · Góp ý cho con + Sửa bài (trước–sau) (spec docs/superpowers/specs/2026-10-22-s6-feedback-revision-design.md §1–§4;
-- kế hoạch docs/superpowers/plans/2026-10-22-s6-feedback-revision.md):
--   1. attempts.revises_attempt_id: bài sửa trỏ về bài được góp ý. Luật (CHECK + trigger): chế độ REVISION, không bao giờ là lần 1, lần trước
--      = bài được góp ý, cùng em và cùng gia đình học tập với bài đó (đi xuyên bước). Episode của một lần REVISION không bao giờ là lần đầu.
--   2. english.track_settings: cài đặt theo track (revision_reason_required: A = false, B = true; revision_target_key: kỹ năng "Sửa bài" A3).
--   3. Sổ append-only: feedback_notes (góp ý / nhận xét kết; sửa = dòng mới thay dòng cũ, chỉ trước khi con bắt đầu sửa; tối đa 2 vòng),
--      revision_marks (em đánh dấu Đã sửa / Giữ nguyên + lý do), revision_checks (người duyệt đánh giá từng góp ý).
--   4. Góp ý "yêu cầu sửa" mở bước sửa: bước REVISION của chủ đề nếu là bước sửa kế tiếp, không thì một bước sửa riêng (step_no 1001+).
--   5. Điểm "Sửa bài" (A3) và điểm kỹ năng ngôn ngữ trên bài sửa đi qua đường chấm S5 (eng_episode_targets thêm kỹ năng của bài gốc;
--      D15 theo bài gốc). Hộp duyệt: bài sửa xong khi người duyệt bấm Xong hoặc Mở vòng 2.
--   6. Học sinh đọc qua eng_my_feedback / eng_my_revision (không điểm, không quan sát, không quyết định, không đánh giá), ghi qua
--      eng_save_revision_draft / eng_submit_revision. Chữ của người lớn có dạng điểm bị từ chối ở DB (eng_has_score_words).
--   7. eng_purge_learner + eng_purge_preview thêm 3 sổ mới.
-- Không đụng schema public. Idempotent; chỉ thêm (expand).

-- 1. Bài sửa trỏ về bài được góp ý ---------------------------------------------------------------------------------------------------
alter table english.attempts add column if not exists revises_attempt_id uuid references english.attempts(id);
create index if not exists attempts_revises_idx on english.attempts(revises_attempt_id) where revises_attempt_id is not null;
alter table english.attempts drop constraint if exists attempts_revision_shape;
alter table english.attempts add constraint attempts_revision_shape check (
  revises_attempt_id is null
  or (mode = 'REVISION' and attempt_no > 1 and parent_attempt_id = revises_attempt_id and revises_attempt_id <> id));

-- Cùng em, cùng gia đình học tập với bài được góp ý (phải đọc dòng khác → trigger, không CHECK).
create or replace function english.eng_check_revision_attempt() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_src english.attempts%rowtype;
begin
  if new.revises_attempt_id is null then
    return new;
  end if;
  select a.* into v_src from english.attempts a where a.id = new.revises_attempt_id;
  if not found or v_src.learner_id <> new.learner_id or v_src.learning_family_id <> new.learning_family_id then
    raise exception 'english.attempts: a revision stays with the same learner and in the learning family of the work it revises'
      using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function english.eng_check_revision_attempt() from public, anon, authenticated, service_role;
drop trigger if exists attempts_revision_check on english.attempts;
create trigger attempts_revision_check
  before insert on english.attempts
  for each row execute function english.eng_check_revision_attempt();

-- FR-14a: một lần nộp chế độ REVISION (bài sửa theo góp ý hay bài sửa ghi ngoài app) không bao giờ là "lần đầu".
create or replace function english.eng_check_revision_episode() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.is_first_attempt and exists (
    select 1 from english.attempts a where a.id = new.attempt_id and (a.mode = 'REVISION' or a.revises_attempt_id is not null)) then
    raise exception 'english.episodes: a revision is never a first attempt (FR-14a)' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function english.eng_check_revision_episode() from public, anon, authenticated, service_role;
drop trigger if exists episodes_revision_not_first on english.episodes;
create trigger episodes_revision_not_first
  before insert on english.episodes
  for each row execute function english.eng_check_revision_episode();

-- 2. Cài đặt theo track (cấu hình; không ai đọc thẳng, chỉ qua hàm) ------------------------------------------------------------------
create table if not exists english.track_settings (
  track_id text not null references english.tracks(id),
  key text not null check (key ~ '^[a-z][a-z_]{2,59}$'),
  value jsonb not null,
  primary key (track_id, key)
);
insert into english.track_settings(track_id, key, value) values
  ('A', 'revision_reason_required', 'false'::jsonb),
  ('B', 'revision_reason_required', 'true'::jsonb),
  ('A', 'revision_target_key', '"A-A3-REDRAFT"'::jsonb),
  ('B', 'revision_target_key', '"B-A3-REVISE"'::jsonb)
on conflict (track_id, key) do nothing;
alter table english.track_settings enable row level security;
revoke all on english.track_settings from public, anon, authenticated, service_role;

create or replace function english.eng_track_setting(p_track text, p_key text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select s.value from english.track_settings s where s.track_id = p_track and s.key = p_key
$$;
revoke execute on function english.eng_track_setting(text, text) from public, anon, authenticated, service_role;

-- 3. Ba sổ mới (append-only) ---------------------------------------------------------------------------------------------------------
-- Chữ của người lớn có dạng điểm (phụ huynh duyệt 22/10, G2: thu hẹp luật) — đúng ba loại, không loại nào khác:
--   1. phân số kiểu điểm a/b (cho phép khoảng trắng quanh "/"): b là số nguyên 1–10 và 0 ≤ a ≤ b ("3/4", "7 / 10"; "22/10", "12/20" thì được).
--   2. chữ "điểm" (mọi kiểu hoa thường, chuẩn NFC) đi sát một con số, cách nhau tối đa một chữ: "6 điểm", "điểm 7", "được 8 điểm", "điểm: 9"
--      ("điểm mạnh", "điểm cần chú ý", "điểm yếu" thì được).
--   3. dấu % đứng sau một con số ("80%", "80 %").
-- Dùng ở bảng (CHECK) và trong các hàm ghi. Có danh sách mẫu chung với lib/revision/scoreWords.ts (tests/unit/fixtures/scoreWords.ts).
-- Ký tự ngăn cách = khoảng trắng, dấu câu ASCII và “ ” ‘ ’ … – — (cùng tập với bản TypeScript).
create or replace function english.eng_has_score_words(p_text text) returns boolean
language sql immutable set search_path = ''
as $$
  select exists (
           select 1
           from pg_catalog.regexp_matches(normalize(coalesce(p_text, ''), nfc), '(?<![0-9])([0-9]+)[[:space:]]*/[[:space:]]*([0-9]+)(?![0-9])', 'g') m
           where m[2] ~ '^0*(10|[1-9])$' and m[1]::numeric <= m[2]::numeric)
      or normalize(coalesce(p_text, ''), nfc) ~ '[0-9][[:space:]!-/:-@[-`{-~“”‘’…–—]*([^[:space:]!-/:-@[-`{-~“”‘’…–—0-9]+[[:space:]!-/:-@[-`{-~“”‘’…–—]+)?[đĐ][iI][ểỂ][mM]'
      or normalize(coalesce(p_text, ''), nfc) ~ '[đĐ][iI][ểỂ][mM][[:space:]!-/:-@[-`{-~“”‘’…–—]*([^[:space:]!-/:-@[-`{-~“”‘’…–—0-9]+[[:space:]!-/:-@[-`{-~“”‘’…–—]+)?[0-9]'
      or normalize(coalesce(p_text, ''), nfc) ~ '[0-9][[:space:]]*%'
$$;
-- Chỉ kiểm chữ góp ý (text), không kiểm trích đoạn (đó là chữ tiếng Anh của em, vd. "3/4 of the water").
create or replace function english.eng_feedback_texts_ok(p_items jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select pg_catalog.jsonb_typeof(p_items) = 'array'
     and not exists (select 1 from pg_catalog.jsonb_array_elements(p_items) x where english.eng_has_score_words(x ->> 'text'))
$$;
revoke execute on function english.eng_has_score_words(text) from public, anon;
grant execute on function english.eng_has_score_words(text) to authenticated, service_role;
revoke execute on function english.eng_feedback_texts_ok(jsonb) from public, anon;
grant execute on function english.eng_feedback_texts_ok(jsonb) to authenticated, service_role;

-- Góp ý (kind feedback: câu khen + 1–3 ưu tiên) và nhận xét kết (kind closing: câu cho con, có thể trống). Sửa = dòng mới trỏ supersedes_id.
-- round: 1 = góp ý cho bài gốc, 2 = góp ý cho bài sửa vòng 1. revision_activity_id = bước sửa mà góp ý này mở (D3).
create table if not exists english.feedback_notes (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  source_attempt_id uuid not null references english.attempts(id),
  root_attempt_id uuid not null references english.attempts(id),
  round smallint not null check (round in (1, 2)),
  kind text not null check (kind in ('feedback', 'closing')),
  praise text check (praise is null or (pg_catalog.length(pg_catalog.btrim(praise)) between 1 and 300 and not english.eng_has_score_words(praise))),
  items jsonb not null default '[]'::jsonb
    check (pg_catalog.jsonb_typeof(items) = 'array' and pg_catalog.jsonb_array_length(items) <= 3 and english.eng_feedback_texts_ok(items)),
  requires_revision boolean not null default false,
  revision_activity_id uuid references english.activity_instances(id),
  supersedes_id uuid references english.feedback_notes(id),
  -- id của english.members, KHÔNG có khóa ngoại (xóa tài khoản không làm hỏng lịch sử).
  author_member uuid not null,
  author_role text not null check (author_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (learner_id, client_id),
  constraint feedback_notes_shape check (
    (kind = 'feedback' and praise is not null and pg_catalog.length(praise) <= 160 and pg_catalog.jsonb_array_length(items) between 1 and 3)
    or (kind = 'closing' and pg_catalog.jsonb_array_length(items) = 0 and not requires_revision and supersedes_id is null)),
  constraint feedback_notes_revision_step check (requires_revision = (revision_activity_id is not null)),
  constraint feedback_notes_round check (
    (kind = 'feedback' and (round = 1) = (source_attempt_id = root_attempt_id))
    or (kind = 'closing' and source_attempt_id <> root_attempt_id))
);
create unique index if not exists feedback_notes_supersedes_once on english.feedback_notes(supersedes_id) where supersedes_id is not null;
create unique index if not exists feedback_notes_first_once on english.feedback_notes(source_attempt_id, kind) where supersedes_id is null;
create index if not exists feedback_notes_learner_idx on english.feedback_notes(learner_id, created_at desc);
create index if not exists feedback_notes_revision_activity_idx on english.feedback_notes(revision_activity_id) where revision_activity_id is not null;

-- Em đánh dấu từng góp ý khi nộp bài sửa: changed (Đã sửa) / kept (Giữ nguyên) + lý do (bắt buộc hay không: track_settings).
create table if not exists english.revision_marks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  attempt_id uuid not null references english.attempts(id),
  feedback_id uuid not null references english.feedback_notes(id),
  item_n smallint not null check (item_n between 1 and 3),
  choice text not null check (choice in ('changed', 'kept')),
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 1 and 300),
  created_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, item_n)
);
create index if not exists revision_marks_learner_idx on english.revision_marks(learner_id);

-- Người duyệt đánh giá từng góp ý của bài sửa: improved (Cải thiện thật) / not_yet (Chưa) / reason_ok (Lý do hợp lý). Một lần, không sửa.
create table if not exists english.revision_checks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references english.learners(id),
  attempt_id uuid not null references english.attempts(id),
  item_n smallint not null check (item_n between 1 and 3),
  verdict text not null check (verdict in ('improved', 'not_yet', 'reason_ok')),
  checker_member uuid not null,
  checker_role text not null check (checker_role in ('tutor', 'parent')),
  client_id text not null check (pg_catalog.length(pg_catalog.btrim(client_id)) between 8 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique (attempt_id, item_n)
);
create index if not exists revision_checks_learner_idx on english.revision_checks(learner_id);

drop trigger if exists feedback_notes_forbid_mutation on english.feedback_notes;
create trigger feedback_notes_forbid_mutation
  before update or delete on english.feedback_notes
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists feedback_notes_forbid_truncate on english.feedback_notes;
create trigger feedback_notes_forbid_truncate
  before truncate on english.feedback_notes
  for each statement execute function english.eng_forbid_mutation();
drop trigger if exists revision_marks_forbid_mutation on english.revision_marks;
create trigger revision_marks_forbid_mutation
  before update or delete on english.revision_marks
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists revision_marks_forbid_truncate on english.revision_marks;
create trigger revision_marks_forbid_truncate
  before truncate on english.revision_marks
  for each statement execute function english.eng_forbid_mutation();
drop trigger if exists revision_checks_forbid_mutation on english.revision_checks;
create trigger revision_checks_forbid_mutation
  before update or delete on english.revision_checks
  for each row execute function english.eng_forbid_mutation('learner_id');
drop trigger if exists revision_checks_forbid_truncate on english.revision_checks;
create trigger revision_checks_forbid_truncate
  before truncate on english.revision_checks
  for each statement execute function english.eng_forbid_mutation();

-- RLS: phụ huynh / gia sư trong phạm vi đọc; học sinh không bao giờ (em đọc qua eng_my_feedback / eng_my_revision). Không ai ghi trực tiếp.
alter table english.feedback_notes enable row level security;
alter table english.revision_marks enable row level security;
alter table english.revision_checks enable row level security;
revoke all on english.feedback_notes, english.revision_marks, english.revision_checks from public, anon, authenticated;
revoke insert, update, delete, truncate on english.feedback_notes, english.revision_marks, english.revision_checks from public, anon, authenticated, service_role;
grant select on english.feedback_notes, english.revision_marks, english.revision_checks to authenticated;
drop policy if exists feedback_notes_select on english.feedback_notes;
create policy feedback_notes_select on english.feedback_notes
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists revision_marks_select on english.revision_marks;
create policy revision_marks_select on english.revision_marks
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));
drop policy if exists revision_checks_select on english.revision_checks;
create policy revision_checks_select on english.revision_checks
  for select to authenticated
  using (english.eng_is_staff_of(learner_id));

-- 4. Hàm nhỏ dùng chung (nội bộ: chỉ các hàm security definer của file này gọi) -------------------------------------------------------
-- Bài gốc của một chuỗi sửa: đi ngược revises_attempt_id tới bài không sửa bài nào (bài thường trả về chính nó).
create or replace function english.eng_revision_root(p_attempt uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  with recursive up(id, rev, depth) as (
    select a.id, a.revises_attempt_id, 0 from english.attempts a where a.id = p_attempt
    union all
    select a.id, a.revises_attempt_id, u.depth + 1
    from up u join english.attempts a on a.id = u.rev
    where u.depth < 5
  )
  select u.id from up u where u.rev is null order by u.depth desc limit 1
$$;

-- Dòng góp ý còn hiệu lực = chưa bị dòng nào thay.
create or replace function english.eng_feedback_is_live(p_feedback uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from english.feedback_notes s where s.supersedes_id = p_feedback)
$$;

-- Vòng của một bài sửa (1 / 2); NULL nếu không phải bài sửa.
create or replace function english.eng_revision_round(p_attempt uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select f.round::int
  from english.attempts a
  join english.feedback_notes f on f.source_attempt_id = a.revises_attempt_id and f.kind = 'feedback' and f.requires_revision
  where a.id = p_attempt and english.eng_feedback_is_live(f.id)
  limit 1
$$;

-- Con đã bắt đầu sửa theo góp ý này chưa: đã có bản nháp ở bước sửa, hoặc đã nộp bài sửa. Góp ý không yêu cầu sửa → không bao giờ (D10).
create or replace function english.eng_revision_started(p_feedback uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select exists (select 1 from english.attempts t where t.revises_attempt_id = f.source_attempt_id)
        or (f.revision_activity_id is not null
            and exists (select 1 from english.working_drafts d where d.activity_instance_id = f.revision_activity_id and d.learner_id = f.learner_id))
    from english.feedback_notes f where f.id = p_feedback), false)
$$;

-- Góp ý đang chờ con sửa ở một bước sửa (còn hiệu lực, yêu cầu sửa, chưa có bài sửa), hoặc NULL.
create or replace function english.eng_revision_feedback(p_activity uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select f.id from english.feedback_notes f
  where f.revision_activity_id = p_activity and f.kind = 'feedback' and f.requires_revision
    and english.eng_feedback_is_live(f.id)
    and not exists (select 1 from english.attempts t where t.revises_attempt_id = f.source_attempt_id)
  order by f.round desc, f.created_at desc
  limit 1
$$;

-- Spec §3 "Mở mode REVISION": một bước REVISION chỉ làm được trong app khi có góp ý còn hiệu lực yêu cầu sửa (D20).
-- eng_step_supported (0009) giữ nguyên: các đường S4 vẫn từ chối bước REVISION.
create or replace function english.eng_revision_open(p_activity uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select english.eng_revision_feedback(p_activity) is not null
$$;

revoke execute on function english.eng_revision_root(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_feedback_is_live(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_revision_round(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_revision_started(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_revision_feedback(uuid) from public, anon, authenticated, service_role;
revoke execute on function english.eng_revision_open(uuid) from public, anon, authenticated, service_role;

-- 9. Purge: thêm feedback_notes + revision_marks + revision_checks (giữ nguyên mọi dòng của 0020; có test đối chiếu từng dòng).
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
  n_submissions int := 0;
  n_assignment_events int := 0;
  n_assignments int := 0;
  n_files int := 0;
  n_upload_tickets int := 0;
  n_reading_reports int := 0;
  n_level_decisions int := 0;
  n_external_results int := 0;
  n_feedback_notes int := 0;
  n_revision_marks int := 0;
  n_revision_checks int := 0;
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

  -- SM-2: sổ quyết định cấp và mốc thi ngoài (external_results trỏ tới files → xóa TRƯỚC files). File thật: deleteLearnerFolder.
  delete from english.level_decisions ld where ld.learner_id = p_learner_id;
  get diagnostics n_level_decisions = row_count;

  delete from english.external_results er where er.learner_id = p_learner_id;
  get diagnostics n_external_results = row_count;

  -- S6: đánh giá bài sửa, đánh dấu của em, góp ý (trỏ tới attempts / activity_instances → xóa TRƯỚC chúng; đánh dấu trỏ tới góp ý).
  delete from english.revision_checks rc where rc.learner_id = p_learner_id;
  get diagnostics n_revision_checks = row_count;

  delete from english.revision_marks rm where rm.learner_id = p_learner_id;
  get diagnostics n_revision_marks = row_count;

  delete from english.feedback_notes fn where fn.learner_id = p_learner_id;
  get diagnostics n_feedback_notes = row_count;

  -- S5b-1 PR B (bài luyện và file): bài nộp, sự kiện của bài giao, bài giao (kết quả trỏ tới bài giao nên đã xóa ở trên), rồi file.
  -- Các file thật nằm ở kho Storage, ngoài database: xóa bằng deleteLearnerFolder (lib/storage) - xem docs/PROGRESS.md.
  delete from english.submissions sb where sb.learner_id = p_learner_id;
  get diagnostics n_submissions = row_count;

  delete from english.assignment_events ae where ae.learner_id = p_learner_id;
  get diagnostics n_assignment_events = row_count;

  delete from english.assignments asg where asg.learner_id = p_learner_id;
  get diagnostics n_assignments = row_count;

  delete from english.files fl where fl.learner_id = p_learner_id;
  get diagnostics n_files = row_count;

  delete from english.upload_tickets ut where ut.learner_id = p_learner_id;
  get diagnostics n_upload_tickets = row_count;
  -- Studio 1A: báo cáo kỹ năng đọc tháng (không trỏ tới bảng nào khác của em ngoài learners).
  delete from english.reading_reports rr where rr.learner_id = p_learner_id;
  get diagnostics n_reading_reports = row_count;

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
      'submissions', n_submissions,
      'assignment_events', n_assignment_events,
      'assignments', n_assignments,
      'files', n_files,
      'upload_tickets', n_upload_tickets,
      'reading_reports', n_reading_reports,
      'level_decisions', n_level_decisions,
      'external_results', n_external_results,
      'feedback_notes', n_feedback_notes,
      'revision_marks', n_revision_marks,
      'revision_checks', n_revision_checks,
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

-- Đếm trước khi xóa: thêm feedback_notes + revision_marks + revision_checks (giữ nguyên mọi dòng của 0020).
create or replace function english.eng_purge_preview(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_user uuid;
begin
  if p_learner is null then
    raise exception 'eng_purge_preview: learner id is required' using errcode = '22004';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_purge_preview: learner not found' using errcode = 'P0002';
  end if;
  select m.user_id into v_user from english.members m where m.id = v_l.member_id and m.role = 'student';

  return pg_catalog.jsonb_build_object(
    'learner_id', p_learner,
    'alias', v_l.alias,
    'is_test', v_l.is_test,
    'counts', pg_catalog.jsonb_build_object(
      'audit_log', (select pg_catalog.count(*) from english.audit_log x where x.learner_id = p_learner),
      'target_sets', (select pg_catalog.count(*) from english.target_sets x where x.learner_id = p_learner),
      'inquiry_instances', (select pg_catalog.count(*) from english.inquiry_instances x where x.learner_id = p_learner),
      'activity_instances', (select pg_catalog.count(*) from english.activity_instances x where x.learner_id = p_learner),
      'instance_item_keys', (select pg_catalog.count(*) from english.instance_item_keys x where x.learner_id = p_learner),
      'activity_instance_events', (select pg_catalog.count(*) from english.activity_instance_events x where x.learner_id = p_learner),
      'consents', (select pg_catalog.count(*) from english.consents x where x.learner_id = p_learner),
      'relationships', (select pg_catalog.count(*) from english.relationships x where x.learner_id = p_learner),
      'attempt_auto_checks', (select pg_catalog.count(*) from english.attempt_auto_checks x where x.learner_id = p_learner),
      'episodes', (select pg_catalog.count(*) from english.episodes x where x.learner_id = p_learner),
      'exposure_log', (select pg_catalog.count(*) from english.exposure_log x where x.learner_id = p_learner),
      'assistance_events', (select pg_catalog.count(*) from english.assistance_events x where x.learner_id = p_learner),
      'artifact_versions', (select pg_catalog.count(*) from english.artifact_versions x where x.learner_id = p_learner),
      'attempts', (select pg_catalog.count(*) from english.attempts x where x.learner_id = p_learner),
      'working_drafts', (select pg_catalog.count(*) from english.working_drafts x where x.learner_id = p_learner),
      'validation_decisions', (select pg_catalog.count(*) from english.validation_decisions x where x.learner_id = p_learner),
      'observations', (select pg_catalog.count(*) from english.observations x where x.learner_id = p_learner),
      'lesson_notes', (select pg_catalog.count(*) from english.lesson_notes x where x.learner_id = p_learner),
      'tag_marks', (select pg_catalog.count(*) from english.tag_marks x where x.learner_id = p_learner),
      'recheck_events', (select pg_catalog.count(*) from english.recheck_events x where x.learner_id = p_learner),
      'results', (select pg_catalog.count(*) from english.results x where x.learner_id = p_learner),
      'submissions', (select pg_catalog.count(*) from english.submissions x where x.learner_id = p_learner),
      'assignment_events', (select pg_catalog.count(*) from english.assignment_events x where x.learner_id = p_learner),
      'assignments', (select pg_catalog.count(*) from english.assignments x where x.learner_id = p_learner),
      'files', (select pg_catalog.count(*) from english.files x where x.learner_id = p_learner),
      'upload_tickets', (select pg_catalog.count(*) from english.upload_tickets x where x.learner_id = p_learner),
      'reading_reports', (select pg_catalog.count(*) from english.reading_reports x where x.learner_id = p_learner),
      'level_decisions', (select pg_catalog.count(*) from english.level_decisions x where x.learner_id = p_learner),
      'external_results', (select pg_catalog.count(*) from english.external_results x where x.learner_id = p_learner),
      'feedback_notes', (select pg_catalog.count(*) from english.feedback_notes x where x.learner_id = p_learner),
      'revision_marks', (select pg_catalog.count(*) from english.revision_marks x where x.learner_id = p_learner),
      'revision_checks', (select pg_catalog.count(*) from english.revision_checks x where x.learner_id = p_learner),
      'login_names', (select pg_catalog.count(*) from english.login_names x where x.auth_user_id = v_user),
      'learners', 1,
      'members', (select pg_catalog.count(*) from english.members x where x.id = v_l.member_id and x.role = 'student')));
end
$$;

revoke execute on function english.eng_purge_preview(uuid) from public, anon, authenticated;
grant execute on function english.eng_purge_preview(uuid) to service_role;

insert into english.schema_migrations(version) values ('0021') on conflict do nothing;
