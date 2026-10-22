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
-- Chữ của người lớn có dạng điểm (phụ huynh duyệt 22/10, G2; Claude đề xuất cách chốt luật, phụ huynh xem lại) - đúng năm loại, không loại nào khác:
--   1. phân số kiểu điểm a/b (cho phép khoảng trắng quanh "/"): b là số nguyên 1–10 và 0 ≤ a ≤ b ("3/4", "7 / 10", "1/2"). KHÔNG tính là điểm khi:
--      đứng ngay sau (chỉ cách khoảng trắng) một trong các chữ ngày: ngày, hôm, từ, đến, tới, trước, sau, hạn, tháng ("hôm 5/10");
--      hoặc theo sau là "/số" nữa (ngày đầy đủ "1/10/2026"); hoặc theo sau là chữ "trang" ("1/2 trang"). "22/10", "12/20" thì được vì a > b.
--   2. con số đi sát chữ "điểm", "diem" hoặc "đ" (mọi kiểu hoa thường, chuẩn NFC), cách nhau tối đa một chữ, thứ tự nào cũng được:
--      "8đ", "8 đ", "6 điểm", "điểm 7", "được 8 điểm", "8 diem" ("điểm mạnh", "điểm cần chú ý", "điểm yếu" thì được).
--   3. "N trên M" với M là số nguyên 1–10 ("8 trên 10").
--   4. dấu % đứng sau một con số ("80%", "80 %").
--   5. đúng các nhãn thang 0–4 trong UX_COPY_GUIDE 3.1 (không phân biệt hoa thường): "Chưa thể hiện", "Còn thiếu nhiều", "Được một phần", "Đạt yêu cầu", "Vững, rõ ràng".
-- Trước khi so khớp: chuẩn NFC và đổi khoảng trắng lạ (U+00A0, U+202F, U+3000) thành khoảng trắng thường.
-- Dùng ở bảng (CHECK) và trong các hàm ghi - chỉ cho chữ của người lớn, không bao giờ cho chữ của em. Có danh sách mẫu chung với lib/revision/scoreWords.ts (tests/unit/fixtures/scoreWords.ts).
-- Ký tự ngăn cách = khoảng trắng, dấu câu ASCII và “ ” ‘ ’ … – — (cùng tập với bản TypeScript). Chữ hoa/thường viết thẳng bằng [xX] vì locale C không đổi chữ có dấu.
create or replace function english.eng_has_score_words(p_text text) returns boolean
language sql immutable set search_path = ''
as $$
  select exists (
           select 1
           from pg_catalog.regexp_matches(x.t, '((?<![^[:space:]!-/:-@[-`{-~“”‘’…–—])(?:[nN][gG][àÀ][yY]|[hH][ôÔ][mM]|[tT][ừỪ]|[đĐ][ếẾ][nN]|[tT][ớỚ][iI]|[tT][rR][ưƯ][ớỚ][cC]|[sS][aA][uU]|[hH][ạẠ][nN]|[tT][hH][áÁ][nN][gG])[[:space:]]*)?(?<![0-9])([0-9]+)[[:space:]]*/[[:space:]]*([0-9]+)(?![0-9])(?:([[:space:]]*/[[:space:]]*[0-9])|([[:space:]]*[tT][rR][aA][nN][gG](?![^[:space:]!-/:-@[-`{-~“”‘’…–—])))?', 'g') m
           where m[1] is null and m[4] is null and m[5] is null and m[3] ~ '^0*(10|[1-9])$' and m[2]::numeric <= m[3]::numeric)
      or x.t ~ '[0-9][[:space:]!-/:-@[-`{-~“”‘’…–—]*(?:[^[:space:]!-/:-@[-`{-~“”‘’…–—0-9]+[[:space:]!-/:-@[-`{-~“”‘’…–—]+)?(?:[đĐ][iI][ểỂ][mM]|[dD][iI][eE][mM]|[đĐ](?![^[:space:]!-/:-@[-`{-~“”‘’…–—]))'
      or x.t ~ '(?:[đĐ][iI][ểỂ][mM]|[dD][iI][eE][mM]|[đĐ](?![^[:space:]!-/:-@[-`{-~“”‘’…–—]))[[:space:]!-/:-@[-`{-~“”‘’…–—]*(?:[^[:space:]!-/:-@[-`{-~“”‘’…–—0-9]+[[:space:]!-/:-@[-`{-~“”‘’…–—]+)?[0-9]'
      or x.t ~ '[0-9][[:space:]]*[tT][rR][êÊ][nN][[:space:]]*0*(10|[1-9])(?![0-9])'
      or x.t ~ '[0-9][[:space:]]*%'
      or x.t ~ '[cC][hH][ưƯ][aA],?[[:space:]]+[tT][hH][ểỂ],?[[:space:]]+[hH][iI][ệỆ][nN]|[cC][òÒ][nN],?[[:space:]]+[tT][hH][iI][ếẾ][uU],?[[:space:]]+[nN][hH][iI][ềỀ][uU]|[đĐ][ưƯ][ợỢ][cC],?[[:space:]]+[mM][ộỘ][tT],?[[:space:]]+[pP][hH][ầẦ][nN]|[đĐ][ạẠ][tT],?[[:space:]]+[yY][êÊ][uU],?[[:space:]]+[cC][ầẦ][uU]|[vV][ữỮ][nN][gG],?[[:space:]]+[rR][õÕ],?[[:space:]]+[rR][àÀ][nN][gG]'
  from (select pg_catalog.translate(normalize(coalesce(p_text, ''), nfc), pg_catalog.chr(160) || pg_catalog.chr(8239) || pg_catalog.chr(12288), '   ') as t) x
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

-- 5. S5 cho bài sửa ----------------------------------------------------------------------------------------------------------------------
-- Bài chỉ gia sư duyệt (D15): bài kiểm tra trong buổi hoặc bài quan sát trực tiếp - và từ S6 cả bài sửa của những bài đó (D14).
create or replace function english.eng_episode_restricted(p_episode uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((e.facets ->> 'checkpoint')::boolean, false) or e.observed_directly
         or coalesce((
           select coalesce((re.facets ->> 'checkpoint')::boolean, false) or re.observed_directly
           from english.attempts a
           join english.episodes re on re.attempt_id = english.eng_revision_root(a.id)
           where a.id = e.attempt_id and a.revises_attempt_id is not null), false)
  from english.episodes e
  where e.id = p_episode
$$;
revoke execute on function english.eng_episode_restricted(uuid) from public, anon, authenticated, service_role;

-- Ai được duyệt một episode (D15) - như 0010, chỉ thay "bài bị giới hạn" bằng eng_episode_restricted (bài sửa theo bài gốc).
create or replace function english.eng_review_role(p_episode uuid, p_member uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when m.role = 'tutor' and english.eng_actor_may_manage(m.id, e.learner_id) then 'tutor'
    when m.role = 'parent' and english.eng_actor_may_manage(m.id, e.learner_id)
         and not english.eng_episode_restricted(e.id) then 'parent'
    else null
  end
  from english.episodes e
  join english.members m on m.id = p_member
  where e.id = p_episode
$$;
revoke execute on function english.eng_review_role(uuid, uuid) from public, anon, authenticated, service_role;

-- Kỹ năng chấm được của một episode - như 0010; bài sửa còn có các kỹ năng của bài gốc, xếp sau kỹ năng của bước sửa (3-b, D5).
create or replace function english.eng_episode_targets(p_episode uuid)
returns table (target_key text, ord int, is_target boolean, live_only boolean, scorable boolean)
language sql stable security definer set search_path = ''
as $$
  select u.k, min(u.o)::int,
         bool_or(t.id is not null),
         coalesce(bool_or(not exists (select 1 from pg_catalog.jsonb_array_elements(t.success_criteria) c where c ->> 'method' <> 'tutor_live')), false),
         coalesce(bool_or(t.id is not null
                          and (e.observed_directly
                               or exists (select 1 from pg_catalog.jsonb_array_elements(t.success_criteria) c where c ->> 'method' <> 'tutor_live'))), false)
  from english.episodes e
  join english.attempts at on at.id = e.attempt_id
  join english.activity_instances a on a.id = at.activity_instance_id
  join english.inquiry_instances i on i.id = a.inquiry_instance_id
  cross join lateral (
    select x.k, x.o from unnest(a.target_ids) with ordinality as x(k, o)
    union all
    select y.k, 1000 + y.o
    from english.attempts ra
    join english.activity_instances rai on rai.id = ra.activity_instance_id
    cross join lateral unnest(rai.target_ids) with ordinality as y(k, o)
    where at.revises_attempt_id is not null and ra.id = english.eng_revision_root(at.id)
  ) u(k, o)
  left join english.targets t on t.id = u.k and t.descriptor_version = i.snapshot -> 'template' ->> 'descriptor_version'
  where e.id = p_episode
  group by u.k
$$;
revoke execute on function english.eng_episode_targets(uuid) from public, anon, authenticated, service_role;

-- 5b. D14 trọn vẹn: gắn nhãn bài viết và màn xem bài cũng theo eng_episode_restricted (bài sửa của bài kiểm tra trong buổi / quan sát trực tiếp chỉ gia sư).
-- Thân hàm = bản của 0014 (eng_tag_episode) và 0010 (eng_review_episode); chỉ thay phép kiểm tra "bài bị giới hạn" tại chỗ bằng eng_episode_restricted. Quyền giữ nguyên.
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
  if v_member.role <> 'tutor' and english.eng_episode_restricted(v_e.id) then
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

create or replace function english.eng_review_episode(p_episode uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_e english.episodes%rowtype;
  v_at english.attempts%rowtype;
  v_a english.activity_instances%rowtype;
  v_i english.inquiry_instances%rowtype;
  v_l english.learners%rowtype;
  v_me english.members%rowtype;
  v_step jsonb;
  v_desc text;
  v_restricted boolean;
begin
  select e.* into v_e from english.episodes e where e.id = p_episode;
  if not found or not english.eng_is_staff_of(v_e.learner_id) then
    return null;
  end if;
  select * into v_at from english.attempts t where t.id = v_e.attempt_id;
  select * into v_a from english.activity_instances a where a.id = v_at.activity_instance_id;
  select * into v_i from english.inquiry_instances i where i.id = v_a.inquiry_instance_id;
  select * into v_l from english.learners l where l.id = v_e.learner_id;
  select * into v_me from english.members m where m.id = english.eng_current_member_id();
  v_desc := v_i.snapshot -> 'template' ->> 'descriptor_version';
  v_restricted := english.eng_episode_restricted(v_e.id);
  select x into v_step from pg_catalog.jsonb_array_elements(v_i.snapshot -> 'steps') as x
  where (x ->> 'step_no')::int = v_a.step_no;

  return pg_catalog.jsonb_build_object(
    'episode', pg_catalog.jsonb_build_object(
      'id', v_e.id,
      'is_first_attempt', v_e.is_first_attempt,
      'observed_directly', v_e.observed_directly,
      'facets', v_e.facets,
      'restricted', v_restricted),
    'learner', pg_catalog.jsonb_build_object('id', v_l.id, 'alias', v_l.alias, 'track_id', v_l.track_id, 'is_test', v_l.is_test),
    'viewer', pg_catalog.jsonb_build_object(
      'role', v_me.role,
      'can_decide', english.eng_review_role(v_e.id, v_me.id) is not null,
      'restricted', v_restricted),
    'attempt', pg_catalog.jsonb_build_object(
      'id', v_at.id,
      'attempt_no', v_at.attempt_no,
      'mode', v_at.mode,
      'provenance', v_at.provenance,
      'submitted_at', v_at.submitted_at,
      'declared_assistance', pg_catalog.to_jsonb(v_at.declared_assistance),
      'recorded_by_name', (select m.display_name from english.artifact_versions av
                           join english.members m on m.id = av.created_by
                           where av.attempt_id = v_at.id and v_at.provenance in ('tutor_live', 'manual_import')
                           order by av.version limit 1)),
    'artifact', (select pg_catalog.jsonb_build_object('kind', av.kind, 'content', av.content, 'is_raw', av.is_raw)
                 from english.artifact_versions av where av.attempt_id = v_at.id order by av.version limit 1),
    'activity', pg_catalog.jsonb_build_object(
      'id', v_a.id, 'step_no', v_a.step_no, 'activity_type', v_a.activity_type, 'mode', v_a.mode,
      'purpose', pg_catalog.to_jsonb(v_a.purpose), 'time_min', (v_step ->> 'time_min')::int),
    'inquiry', pg_catalog.jsonb_build_object(
      'id', v_i.id,
      'title_vi', v_i.snapshot -> 'template' ->> 'title_vi',
      'big_question_en', v_i.snapshot -> 'template' ->> 'big_question_en',
      'big_question_vi', v_i.snapshot -> 'template' ->> 'big_question_vi'),
    'step', pg_catalog.jsonb_build_object(
      'prompt_en', v_step ->> 'prompt_en',
      'items', (select coalesce(pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object('id', x ->> 'id', 'kind', x ->> 'kind', 'stem', x ->> 'stem',
                                                'options', coalesce(x -> 'options', '[]'::jsonb))
                  order by o), '[]'::jsonb)
                from pg_catalog.jsonb_array_elements(coalesce(v_step -> 'items', '[]'::jsonb)) with ordinality as t(x, o))),
    'sources', (select coalesce(pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object('id', s.id, 'title', s.title, 'modality', s.modality) order by ss.position, s.id), '[]'::jsonb)
                from english.template_step_sources ss
                join english.sources s on s.id = ss.source_id and s.version = ss.source_version
                where ss.template_id = v_i.template_id and ss.template_version = v_i.template_version and ss.step_no = v_a.step_no),
    'auto_checks', (select c.checks from english.attempt_auto_checks c where c.attempt_id = v_at.id),
    'keys', (select coalesce(pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object('item_id', k.item_id, 'kind', k.kind, 'answer', k.answer, 'explanation_vi', k.explanation_vi)
               order by k.item_id), '[]'::jsonb)
             from english.instance_item_keys k where k.inquiry_instance_id = v_i.id and k.step_no = v_a.step_no),
    'assistance', (select coalesce(pg_catalog.jsonb_agg(
                     pg_catalog.jsonb_build_object(
                       'id', s.id, 'kind', s.kind, 'detail', s.detail, 'verification', s.verification,
                       'affects', pg_catalog.to_jsonb(s.affects_target_keys), 'at', s.at, 'note', s.note,
                       'by_name', m.display_name)
                     order by s.at, s.id), '[]'::jsonb)
                   from english.assistance_events s
                   left join english.members m on m.id = s.recorded_by
                   where s.attempt_id = v_at.id),
    'targets', (select coalesce(pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'key', t.target_key,
                    'is_target', t.is_target,
                    'scorable', t.scorable,
                    'locked_reason', case when not t.is_target then 'not_a_skill'
                                          when not t.scorable then 'needs_live' else null end,
                    'title_vi', tg.title_vi,
                    'dimension', case when dm.id is null then null else
                      pg_catalog.jsonb_build_object('id', dm.id, 'name_vi', dm.name_vi, 'rubric_vi', dm.rubric_vi) end,
                    'criteria', coalesce((select pg_catalog.jsonb_agg(
                                  pg_catalog.jsonb_build_object(
                                    'id', c ->> 'id', 'check_vi', c ->> 'check_vi', 'method', c ->> 'method',
                                    'computable', coalesce((c ->> 'computable')::boolean, false))
                                  order by co)
                                from pg_catalog.jsonb_array_elements(tg.success_criteria) with ordinality as cc(c, co)), '[]'::jsonb),
                    'opportunity_rule', tg.opportunity_rule,
                    'decisions', (select coalesce(pg_catalog.jsonb_agg(
                                    pg_catalog.jsonb_build_object(
                                      'id', d.id,
                                      'decision', d.decision,
                                      'final_score', d.final_score,
                                      'final_not_observed', d.final_not_observed,
                                      'validator_role', d.validator_role,
                                      'validator_name', vm.display_name,
                                      'reason', d.reason,
                                      'supersedes_id', d.supersedes_id,
                                      'at', d.created_at,
                                      'current', not exists (select 1 from english.validation_decisions d2 where d2.supersedes_id = d.id),
                                      'criteria_results', o.criteria_results,
                                      'rationale', o.rationale,
                                      'blind', o.blind)
                                    order by d.created_at, d.id), '[]'::jsonb)
                                  from english.validation_decisions d
                                  left join english.observations o on o.id = d.observation_id
                                  left join english.members vm on vm.id = d.validator_member_id
                                  where d.episode_id = v_e.id and d.target_key = t.target_key))
                  order by t.ord), '[]'::jsonb)
                from english.eng_episode_targets(v_e.id) t
                left join english.targets tg on tg.id = t.target_key and tg.descriptor_version = v_desc
                left join english.dimensions dm on dm.id = tg.dimension_id and dm.catalogue_version = tg.catalogue_version),
    'tech', pg_catalog.jsonb_build_object(
      'template_id', v_i.template_id,
      'template_version', v_i.template_version,
      'catalogue_version', v_i.snapshot -> 'template' ->> 'catalogue_version',
      'descriptor_version', v_desc,
      'policy_version', v_i.snapshot -> 'template' ->> 'assessment_policy_version')
  );
end
$$;

revoke execute on function english.eng_tag_episode(uuid, text[], uuid) from public, anon, authenticated;
grant execute on function english.eng_tag_episode(uuid, text[], uuid) to service_role;
revoke execute on function english.eng_review_episode(uuid) from public, anon, service_role;
grant execute on function english.eng_review_episode(uuid) to authenticated;

-- 6. Góp ý cho con ----------------------------------------------------------------------------------------------------------------------
-- 1–3 góp ý: {text 1..200, không điểm; excerpt? ≤ 120, phải có trong bài (so sau khi làm sạch khoảng trắng / nháy); leaf? = 1 lá của bản đồ
-- hiện hành cho track của em, hoặc nhãn riêng của gia đình đã có nhóm}. Trả mảng chuẩn [{n, text, excerpt?, leaf?}], n = 1..k theo thứ tự.
create or replace function english.eng_clean_feedback_items(p_items jsonb, p_text text, p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_map text := english.eng_current_skill_map();
  v_x jsonb;
  v_i int := 0;
  v_text text;
  v_ex text;
  v_leaf jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) not between 1 and 3 then
    raise exception 'feedback: 1 to 3 items (bad_items)' using errcode = '22023';
  end if;
  select * into v_l from english.learners l where l.id = p_learner;
  for v_x in select x from pg_catalog.jsonb_array_elements(p_items) as x loop
    v_i := v_i + 1;
    if pg_catalog.jsonb_typeof(v_x) <> 'object'
       or exists (select 1 from pg_catalog.jsonb_object_keys(v_x) k where k not in ('text', 'excerpt', 'leaf'))
       or pg_catalog.jsonb_typeof(v_x -> 'text') is distinct from 'string'
       or (v_x ? 'excerpt' and pg_catalog.jsonb_typeof(v_x -> 'excerpt') not in ('string', 'null'))
       or (v_x ? 'leaf' and pg_catalog.jsonb_typeof(v_x -> 'leaf') not in ('object', 'null')) then
      raise exception 'feedback: each item is {text, excerpt?, leaf?} (bad_items)' using errcode = '22023';
    end if;
    v_text := pg_catalog.btrim(v_x ->> 'text');
    if pg_catalog.length(v_text) not between 1 and 200 then
      raise exception 'feedback: each item is 1 to 200 characters (bad_items)' using errcode = '22023';
    end if;
    if english.eng_has_score_words(v_text) then
      raise exception 'feedback: no scores in feedback for the child (score_words)' using errcode = '23514';
    end if;
    v_ex := nullif(pg_catalog.btrim(coalesce(v_x ->> 'excerpt', '')), '');
    if v_ex is not null then
      if pg_catalog.length(v_ex) > 120 then
        raise exception 'feedback: an excerpt is at most 120 characters (excerpt_too_long)' using errcode = '22023';
      end if;
      if pg_catalog.strpos(english.eng_clean_text(p_text), english.eng_clean_text(v_ex)) = 0 then
        raise exception 'feedback: the excerpt is not in the work (excerpt_not_found)' using errcode = '23514';
      end if;
    end if;
    v_leaf := case when pg_catalog.jsonb_typeof(v_x -> 'leaf') = 'object' then v_x -> 'leaf' end;
    if v_leaf is not null then
      if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_leaf)) <> 2
         or coalesce(v_leaf ->> 'kind', '') not in ('tag', 'target') or coalesce(v_leaf ->> 'ref_key', '') = '' then
        raise exception 'feedback: a leaf is {kind, ref_key} (bad_items)' using errcode = '22023';
      end if;
      if not exists (select 1 from english.skill_leaves sl
                     where sl.map_id = v_map and sl.kind = v_leaf ->> 'kind' and sl.track_id = v_l.track_id and sl.ref_key = v_leaf ->> 'ref_key')
         and not (v_leaf ->> 'kind' = 'tag' and exists (
                     select 1 from english.error_tags et
                     where et.family_id = v_l.family_id and et.track_id = v_l.track_id and et.key = v_leaf ->> 'ref_key'
                       and et.group_key is not null and et.retired_at is null)) then
        raise exception 'feedback: the skill is not a leaf of the map for this child (unknown_leaf)' using errcode = '23514';
      end if;
    end if;
    v_out := v_out || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('n', v_i, 'text', v_text)
      || case when v_ex is null then '{}'::jsonb else pg_catalog.jsonb_build_object('excerpt', v_ex) end
      || case when v_leaf is null then '{}'::jsonb
              else pg_catalog.jsonb_build_object('leaf', pg_catalog.jsonb_build_object('kind', v_leaf ->> 'kind', 'ref_key', v_leaf ->> 'ref_key')) end);
  end loop;
  return v_out;
end
$$;
revoke execute on function english.eng_clean_feedback_items(jsonb, text, uuid) from public, anon, authenticated, service_role;

-- Bước sửa cho một bài (spec PA, D1–D3): bước REVISION của chủ đề nếu còn trống, không thì bước sửa riêng (1001+) mở hôm nay.
create or replace function english.eng_open_revision_step(p_source_attempt uuid, p_by uuid) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_src english.attempts%rowtype;
  v_act english.activity_instances%rowtype;
  v_step uuid;
  v_eff date;
  v_no int;
  v_target text;
begin
  select * into v_src from english.attempts t where t.id = p_source_attempt;
  select * into v_act from english.activity_instances a where a.id = v_src.activity_instance_id;

  select a.id into v_step
  from english.activity_instances a
  where a.inquiry_instance_id = v_act.inquiry_instance_id and a.mode = 'REVISION'
    and a.step_no > v_act.step_no and a.step_no <= 1000
    -- D1: không có bước viết nào khác giữa bài và bước sửa (spec "ngay sau"; Spec gap G1).
    -- G1 (phụ huynh duyệt 22/10: theo D1; bước tự xem lại xen giữa không chặn). Bản đọc đúng từng chữ, KHÔNG bật: and a.step_no = v_act.step_no + 1
    and not exists (
      select 1 from english.activity_instances w
      where w.inquiry_instance_id = a.inquiry_instance_id and w.activity_type = 'ACT-WRITE'
        and w.step_no > v_act.step_no and w.step_no < a.step_no)
  order by a.step_no
  limit 1;

  -- D2: chỉ dùng lại khi bước còn trống (chưa có lần nộp nào, chưa là bước sửa của bài khác) và không bị bỏ; dời về hôm nay nếu còn ở tương lai.
  if v_step is not null
     and not exists (select 1 from english.attempts t where t.activity_instance_id = v_step)
     and not exists (select 1 from english.feedback_notes f where f.revision_activity_id = v_step and f.source_attempt_id <> p_source_attempt) then
    v_eff := english.eng_step_effective_date(v_step);
    if v_eff is not null then
      if v_eff > english.eng_today_vn() then
        insert into english.activity_instance_events(activity_instance_id, learner_id, kind, new_date, reason, by_member)
        values (v_step, v_src.learner_id, 'reschedule', english.eng_today_vn(), 'Mở bước sửa bài theo góp ý', p_by);
      end if;
      return v_step;
    end if;
  end if;

  -- D3: bước sửa riêng, sau các bước của mẫu, trên kỹ năng "Sửa bài" (A3) của track. Khóa chủ đề: hai bước tự tạo không trùng số.
  perform 1 from english.inquiry_instances i where i.id = v_act.inquiry_instance_id for no key update;
  select coalesce(max(a.step_no), 1000) + 1 into v_no
  from english.activity_instances a where a.inquiry_instance_id = v_act.inquiry_instance_id and a.step_no > 1000;
  v_target := english.eng_track_setting((select l.track_id from english.learners l where l.id = v_src.learner_id), 'revision_target_key') #>> '{}';
  if v_target is null then
    raise exception 'eng_open_revision_step: the track has no revision skill (revision_target_key)' using errcode = 'P0002';
  end if;
  insert into english.activity_instances(inquiry_instance_id, learner_id, step_no, activity_type, mode, purpose, target_ids, scheduled_for)
  values (v_act.inquiry_instance_id, v_src.learner_id, v_no, 'ACT-REVISE', 'REVISION', '{}', array[v_target], english.eng_today_vn())
  returning id into v_step;
  return v_step;
end
$$;
revoke execute on function english.eng_open_revision_step(uuid, uuid) from public, anon, authenticated, service_role;

-- Gửi / sửa góp ý cho một bài (người duyệt bài đó - Q1, D15). p_supersedes = dòng đang hiệu lực khi "Sửa góp ý" (1-c).
-- Vòng 2 (bài nguồn là bài sửa vòng 1) chỉ đi qua eng_finish_revision ("Mở vòng 2"), sau khi đã đánh giá đủ mọi góp ý.
create or replace function english.eng_write_feedback(
  p_source_attempt uuid,
  p_praise text,
  p_items jsonb,
  p_requires_revision boolean,
  p_supersedes uuid,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_src english.attempts%rowtype;
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_ep uuid;
  v_role text;
  v_kind text;
  v_text text;
  v_praise text := pg_catalog.btrim(coalesce(p_praise, ''));
  v_items jsonb;
  v_round int := 1;
  v_root uuid;
  v_prev_round english.feedback_notes%rowtype;
  v_old english.feedback_notes%rowtype;
  v_prev english.feedback_notes%rowtype;
  v_rev uuid;
  v_id uuid;
begin
  if p_source_attempt is null or p_items is null or p_requires_revision is null or p_by is null or p_client_id is null then
    raise exception 'eng_write_feedback: work, items, requires_revision, actor and client id are required' using errcode = '22004';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_write_feedback: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select * into v_src from english.attempts t where t.id = p_source_attempt;
  if not found then
    raise exception 'eng_write_feedback: work not found (not_found)' using errcode = 'P0002';
  end if;
  -- Khóa bước của bài: hai người góp ý cùng lúc cho một bài xếp hàng.
  perform 1 from english.activity_instances a where a.id = v_src.activity_instance_id for no key update;
  select * into v_l from english.learners l where l.id = v_src.learner_id;
  select * into v_member from english.members m where m.id = p_by;
  select e.id into v_ep from english.episodes e where e.attempt_id = v_src.id;

  v_role := english.eng_review_role(v_ep, p_by);
  if v_role is null then
    raise exception 'eng_write_feedback: this member may not give feedback on this work (D15)' using errcode = '42501';
  end if;

  -- Q4 / D8: bài viết làm trong app.
  select av.kind, av.content ->> 'text' into v_kind, v_text
  from english.artifact_versions av where av.attempt_id = v_src.id order by av.version limit 1;
  if v_kind is distinct from 'text' or v_text is null or v_src.provenance not in ('in_app', 'pasted') then
    raise exception 'eng_write_feedback: feedback is for writing done in the app (not_writing)' using errcode = '23514';
  end if;

  if pg_catalog.length(v_praise) not between 1 and 160 then
    raise exception 'eng_write_feedback: one specific praise of 1 to 160 characters (praise_required)' using errcode = '23514';
  end if;
  if english.eng_has_score_words(v_praise) then
    raise exception 'eng_write_feedback: no scores in feedback for the child (score_words)' using errcode = '23514';
  end if;
  v_items := english.eng_clean_feedback_items(p_items, v_text, v_l.id);

  -- Gửi lại (mạng chập chờn): cùng client_id + cùng nội dung + cùng người → trả lại dòng cũ; khác → 23505.
  select * into v_old from english.feedback_notes f where f.learner_id = v_l.id and f.client_id = p_client_id;
  if found then
    if v_old.kind = 'feedback' and v_old.source_attempt_id = p_source_attempt and v_old.praise = v_praise and v_old.items = v_items
       and v_old.requires_revision = p_requires_revision and v_old.supersedes_id is not distinct from p_supersedes and v_old.author_member = p_by then
      return pg_catalog.jsonb_build_object('id', v_old.id, 'round', v_old.round, 'revision_activity_id', v_old.revision_activity_id, 'replayed', true);
    end if;
    raise exception 'eng_write_feedback: this client id was already used for other feedback' using errcode = '23505';
  end if;

  -- Vòng (2-a): 1 cho bài gốc; 2 cho bài sửa vòng 1, luôn yêu cầu sửa, sau khi đã đánh giá đủ mọi góp ý; không bao giờ 3.
  v_root := english.eng_revision_root(v_src.id);
  if v_src.revises_attempt_id is not null then
    select f.* into v_prev_round from english.feedback_notes f
    where f.source_attempt_id = v_src.revises_attempt_id and f.kind = 'feedback' and english.eng_feedback_is_live(f.id);
    v_round := coalesce(v_prev_round.round, 2) + 1;
    if v_round > 2 then
      raise exception 'eng_write_feedback: at most 2 rounds of revision (max_rounds)' using errcode = '23514';
    end if;
    if not p_requires_revision then
      raise exception 'eng_write_feedback: a second round always asks for a revision; a closing note goes with Xong (bad_items)' using errcode = '22023';
    end if;
    if exists (select 1 from english.feedback_notes c where c.source_attempt_id = v_src.id and c.kind = 'closing') then
      raise exception 'eng_write_feedback: this revision was already closed (already_finished)' using errcode = '23505';
    end if;
    if exists (select 1 from pg_catalog.jsonb_array_elements(v_prev_round.items) x
               where not exists (select 1 from english.revision_checks c where c.attempt_id = v_src.id and c.item_n = (x ->> 'n')::int)) then
      raise exception 'eng_write_feedback: give a verdict on every item first (checks_incomplete)' using errcode = '23514';
    end if;
  end if;

  if p_supersedes is null then
    if exists (select 1 from english.feedback_notes f where f.source_attempt_id = p_source_attempt and f.kind = 'feedback') then
      raise exception 'eng_write_feedback: this work already has feedback; edit it instead (already_given)' using errcode = '23505';
    end if;
  else
    -- 1-c: sửa = dòng mới thay dòng đang hiệu lực, cùng bài, cùng người gửi, khi con chưa bắt đầu sửa.
    select f.* into v_prev from english.feedback_notes f
    where f.id = p_supersedes and f.source_attempt_id = p_source_attempt and f.kind = 'feedback';
    if not found then
      raise exception 'eng_write_feedback: the feedback to edit was not found (not_found)' using errcode = 'P0002';
    end if;
    if v_prev.author_member <> p_by then
      raise exception 'eng_write_feedback: only the author may edit feedback (author_only)' using errcode = '42501';
    end if;
    if not english.eng_feedback_is_live(v_prev.id) then
      raise exception 'eng_write_feedback: this feedback was already edited (already_superseded)' using errcode = '23505';
    end if;
    if english.eng_revision_started(v_prev.id) then
      raise exception 'eng_write_feedback: the child already started the revision (revision_started)' using errcode = '23514';
    end if;
  end if;

  -- Bước sửa: bước mà góp ý của bài này đã mở trước đó (mọi bản); vòng 2 dùng lại bước của vòng 1 (D7); không thì mở bước (D1–D3).
  if p_requires_revision then
    v_rev := coalesce(
      (select f.revision_activity_id from english.feedback_notes f
       where f.source_attempt_id = p_source_attempt and f.kind = 'feedback' and f.revision_activity_id is not null
       order by f.created_at desc limit 1),
      v_prev_round.revision_activity_id,
      english.eng_open_revision_step(p_source_attempt, p_by));
  end if;

  insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, requires_revision,
                                     revision_activity_id, supersedes_id, author_member, author_role, client_id)
  values (v_l.id, p_source_attempt, v_root, v_round, 'feedback', v_praise, v_items, p_requires_revision,
          v_rev, p_supersedes, p_by, v_role, p_client_id)
  returning id into v_id;

  -- Nhật ký: không chép chữ góp ý (chỉ số góp ý, vòng, có yêu cầu sửa không).
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, case when p_supersedes is null then 'feedback.given' else 'feedback.edited' end, v_l.family_id, v_l.id,
          pg_catalog.jsonb_build_object('feedback', v_id, 'attempt', p_source_attempt, 'round', v_round, 'items', pg_catalog.jsonb_array_length(v_items),
                                        'requires_revision', p_requires_revision, 'supersedes', p_supersedes));
  return pg_catalog.jsonb_build_object('id', v_id, 'round', v_round, 'revision_activity_id', v_rev, 'replayed', false);
end
$$;
revoke execute on function english.eng_write_feedback(uuid, text, jsonb, boolean, uuid, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_write_feedback(uuid, text, jsonb, boolean, uuid, uuid, text) to service_role;

-- 7. Phía em: đọc góp ý, nháp, nộp bài sửa ------------------------------------------------------------------------------------------
-- Đánh dấu của em cho đúng các góp ý của vòng: {"1": {choice, reason?}, …} → [{n, choice, reason}] theo thứ tự góp ý.
-- Lý do bắt buộc khi track yêu cầu (Q3); bài không đổi chữ nào → mọi góp ý phải là "Giữ nguyên" có lý do (spec §2.4).
create or replace function english.eng_clean_revision_marks(p_marks jsonb, p_items jsonb, p_reason_required boolean, p_unchanged boolean) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_item jsonb;
  v_n int;
  v_m jsonb;
  v_choice text;
  v_reason text;
  v_out jsonb := '[]'::jsonb;
begin
  if p_marks is null or pg_catalog.jsonb_typeof(p_marks) <> 'object'
     or exists (select 1 from pg_catalog.jsonb_object_keys(p_marks) k
                where not exists (select 1 from pg_catalog.jsonb_array_elements(p_items) x where x ->> 'n' = k)) then
    raise exception 'revision: one mark per feedback item (marks_incomplete)' using errcode = '23514';
  end if;
  for v_item in select x from pg_catalog.jsonb_array_elements(p_items) x order by (x ->> 'n')::int loop
    v_n := (v_item ->> 'n')::int;
    v_m := p_marks -> (v_n::text);
    if v_m is null or pg_catalog.jsonb_typeof(v_m) <> 'object'
       or exists (select 1 from pg_catalog.jsonb_object_keys(v_m) k where k not in ('choice', 'reason'))
       or coalesce(v_m ->> 'choice', '') not in ('changed', 'kept') then
      raise exception 'revision: mark every item "changed" or "kept" (marks_incomplete)' using errcode = '23514';
    end if;
    if v_m ? 'reason' and pg_catalog.jsonb_typeof(v_m -> 'reason') not in ('string', 'null') then
      raise exception 'revision: a reason is text (marks_incomplete)' using errcode = '23514';
    end if;
    v_choice := v_m ->> 'choice';
    v_reason := nullif(pg_catalog.btrim(coalesce(v_m ->> 'reason', '')), '');
    if v_reason is not null and pg_catalog.length(v_reason) > 300 then
      raise exception 'revision: a reason is at most 300 characters (reason_too_long)' using errcode = '22023';
    end if;
    if p_reason_required and v_reason is null then
      raise exception 'revision: a reason is needed for every item (reason_required)' using errcode = '23514';
    end if;
    if p_unchanged and (v_choice <> 'kept' or v_reason is null) then
      raise exception 'revision: the text did not change, so every item is "kept" with a reason (unchanged_needs_reason)' using errcode = '23514';
    end if;
    v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('n', v_n, 'choice', v_choice, 'reason', v_reason));
  end loop;
  return v_out;
end
$$;
revoke execute on function english.eng_clean_revision_marks(jsonb, jsonb, boolean, boolean) from public, anon, authenticated, service_role;

-- Trang chủ của em: các góp ý còn hiệu lực. Chỉ câu khen / góp ý / trích đoạn (với "Chỉ góp ý"), số góp ý, trạng thái và nhận xét kết.
-- KHÔNG điểm, quan sát, quyết định, đánh giá từng góp ý, lá kỹ năng. "Đã xem" và "Chỉ góp ý" giữ 14 ngày (D10, D12).
create or replace function english.eng_my_feedback() returns jsonb
language sql stable security definer set search_path = ''
as $$
  with me as (
    select l.id from english.members m join english.learners l on l.member_id = m.id
    where m.user_id = auth.uid() and m.role = 'student'
  ),
  fb as (
    select f.id, f.created_at, f.round, f.requires_revision, f.praise, f.items,
           coalesce(f.revision_activity_id, sa.activity_instance_id) as activity_id,
           i.snapshot -> 'template' ->> 'title_vi' as title_vi,
           rv.id as revision_id,
           (select c.praise from english.feedback_notes c where c.source_attempt_id = rv.id and c.kind = 'closing') as closing_note,
           (select min(x.created_at) from english.feedback_notes x where x.source_attempt_id = rv.id) as seen_at
    from english.feedback_notes f
    join me on me.id = f.learner_id
    join english.attempts sa on sa.id = f.source_attempt_id
    join english.activity_instances a on a.id = sa.activity_instance_id
    join english.inquiry_instances i on i.id = a.inquiry_instance_id
    left join lateral (
      select t.id from english.attempts t where t.revises_attempt_id = f.source_attempt_id order by t.submitted_at limit 1) rv on true
    where f.kind = 'feedback' and english.eng_feedback_is_live(f.id)
  ),
  st as (
    select fb.*, case when not fb.requires_revision then 'note'
                      when fb.revision_id is null then 'todo'
                      when fb.seen_at is null then 'submitted'
                      else 'seen' end as state
    from fb
  )
  select pg_catalog.jsonb_build_object('items', coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'feedback_id', r.id,
      'activity_id', r.activity_id,
      'title_vi', r.title_vi,
      'round', r.round,
      'items_count', pg_catalog.jsonb_array_length(r.items),
      'state', r.state,
      'seen_at', r.seen_at,
      'closing_note', r.closing_note,
      'praise', case when r.state = 'note' then r.praise end,
      'notes', case when r.state = 'note' then (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', (x ->> 'n')::int, 'text', x ->> 'text', 'excerpt', x ->> 'excerpt')
                                    order by (x ->> 'n')::int)
        from pg_catalog.jsonb_array_elements(r.items) x) end)
    order by case r.state when 'todo' then 0 when 'submitted' then 1 else 2 end, r.created_at desc), '[]'::jsonb))
  from st r
  where r.state in ('todo', 'submitted')
     or coalesce(r.seen_at, case when r.state = 'note' then r.created_at end) >= pg_catalog.now() - pg_catalog.make_interval(days => 14)
$$;

-- Màn sửa bài của em (một bước REVISION đã mở, có góp ý còn hiệu lực yêu cầu sửa): câu khen, góp ý đánh số + trích đoạn, bài cũ của chính em,
-- lý do có bắt buộc không, trạng thái, nhận xét kết, bản nháp. NULL nếu không phải của em / chưa mở / không có góp ý.
create or replace function english.eng_my_revision(p_activity uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_act english.activity_instances%rowtype;
  v_f english.feedback_notes%rowtype;
  v_inst english.inquiry_instances%rowtype;
  v_old text;
  v_sub english.attempts%rowtype;
  v_draft jsonb;
  v_seen timestamptz;
begin
  select l.* into v_l from english.members m join english.learners l on l.member_id = m.id
  where m.user_id = auth.uid() and m.role = 'student';
  if not found then return null; end if;
  select a.* into v_act from english.activity_instances a where a.id = p_activity and a.learner_id = v_l.id and a.mode = 'REVISION';
  if not found or not english.eng_activity_released(p_activity) then return null; end if;
  select f.* into v_f from english.feedback_notes f
  where f.revision_activity_id = p_activity and f.kind = 'feedback' and f.requires_revision and english.eng_feedback_is_live(f.id)
  order by f.round desc, f.created_at desc limit 1;
  if not found then return null; end if;
  select * into v_inst from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  select av.content ->> 'text' into v_old from english.artifact_versions av where av.attempt_id = v_f.source_attempt_id order by av.version limit 1;
  select t.* into v_sub from english.attempts t where t.revises_attempt_id = v_f.source_attempt_id order by t.submitted_at limit 1;
  if v_sub.id is null then
    select pg_catalog.jsonb_build_object('content', d.content, 'revision', d.revision, 'updated_at', d.updated_at) into v_draft
    from english.working_drafts d where d.activity_instance_id = p_activity and d.learner_id = v_l.id;
  else
    select min(x.created_at) into v_seen from english.feedback_notes x where x.source_attempt_id = v_sub.id;
  end if;
  return pg_catalog.jsonb_build_object(
    'activity_id', v_act.id,
    'instance_id', v_inst.id,
    'title_vi', v_inst.snapshot -> 'template' ->> 'title_vi',
    'big_question_en', v_inst.snapshot -> 'template' ->> 'big_question_en',
    'round', v_f.round,
    'praise', v_f.praise,
    'items', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', (x ->> 'n')::int, 'text', x ->> 'text', 'excerpt', x ->> 'excerpt')
                                          order by (x ->> 'n')::int)
              from pg_catalog.jsonb_array_elements(v_f.items) x),
    'old_text', v_old,
    'reason_required', coalesce(english.eng_track_setting(v_l.track_id, 'revision_reason_required') = 'true'::jsonb, false),
    'state', case when v_sub.id is null then 'todo' when v_seen is null then 'submitted' else 'seen' end,
    'submitted_at', v_sub.submitted_at,
    'closing_note', (select c.praise from english.feedback_notes c where c.source_attempt_id = v_sub.id and c.kind = 'closing'),
    'draft', v_draft);
end
$$;

-- Nháp tự lưu của bài sửa (cùng bảng working_drafts, cùng cảnh báo "tab khác vừa lưu" như eng_save_draft). Chỉ khi bước sửa đang mở.
create or replace function english.eng_save_revision_draft(p_activity uuid, p_content jsonb, p_base_revision int default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member uuid;
  v_role text;
  v_act english.activity_instances%rowtype;
  v_cur int;
  v_rev int;
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'eng_save_revision_draft: not signed in' using errcode = '42501';
  end if;
  select m.id, m.role into v_member, v_role from english.members m where m.user_id = v_uid;
  if v_member is null then
    raise exception 'eng_save_revision_draft: activity not found' using errcode = 'P0002';
  end if;
  if v_role <> 'student' then
    raise exception 'eng_save_revision_draft: only the learner may save a draft' using errcode = '42501';
  end if;
  select a.* into v_act from english.activity_instances a join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member and a.mode = 'REVISION'
  for no key update of a;
  if not found or not english.eng_activity_released(p_activity) then
    raise exception 'eng_save_revision_draft: activity not found' using errcode = 'P0002';
  end if;
  if not english.eng_revision_open(p_activity) then
    raise exception 'eng_save_revision_draft: there is no revision to do on this step (revision_not_open)' using errcode = '22023';
  end if;

  if p_content is null or pg_catalog.jsonb_typeof(p_content) <> 'object' or pg_catalog.length(p_content::text) > 200000
     or exists (select 1 from pg_catalog.jsonb_object_keys(p_content) k where k not in ('text', 'marks', 'pasted', 'assistance'))
     or (p_content ? 'text' and (pg_catalog.jsonb_typeof(p_content -> 'text') <> 'string' or pg_catalog.length(p_content ->> 'text') > 20000))
     or (p_content ? 'pasted' and pg_catalog.jsonb_typeof(p_content -> 'pasted') <> 'boolean')
     or (p_content ? 'assistance' and (pg_catalog.jsonb_typeof(p_content -> 'assistance') <> 'array'
         or exists (select 1 from pg_catalog.jsonb_array_elements(p_content -> 'assistance') x
                    where pg_catalog.jsonb_typeof(x) <> 'string' or (x #>> '{}') not in ('none', 'notes', 'dictionary', 'asked_someone', 'ai_outside'))))
     or (p_content ? 'marks' and (pg_catalog.jsonb_typeof(p_content -> 'marks') <> 'object'
         or exists (select 1 from pg_catalog.jsonb_each(p_content -> 'marks') kv
                    where kv.key !~ '^[1-3]$' or pg_catalog.jsonb_typeof(kv.value) <> 'object'
                       or exists (select 1 from pg_catalog.jsonb_object_keys(kv.value) k2 where k2 not in ('choice', 'reason'))
                       or (kv.value ? 'choice' and coalesce(kv.value ->> 'choice', '') not in ('changed', 'kept'))
                       or (kv.value ? 'reason' and (pg_catalog.jsonb_typeof(kv.value -> 'reason') <> 'string'
                                                    or pg_catalog.length(kv.value ->> 'reason') > 300))))) then
    raise exception 'eng_save_revision_draft: the draft is {text, marks, pasted, assistance}' using errcode = '22023';
  end if;

  select d.revision into v_cur from english.working_drafts d where d.activity_instance_id = p_activity and d.learner_id = v_act.learner_id;
  insert into english.working_drafts as d(activity_instance_id, learner_id, content, revision, updated_at)
  values (p_activity, v_act.learner_id, p_content, 1, pg_catalog.clock_timestamp())
  on conflict (activity_instance_id, learner_id) do update
    set content = excluded.content, revision = d.revision + 1, updated_at = excluded.updated_at
  returning d.revision, d.updated_at into v_rev, v_at;
  return pg_catalog.jsonb_build_object(
    'revision', v_rev, 'saved_at', v_at,
    'other_tab_changed', p_base_revision is not null and v_cur is not null and p_base_revision <> v_cur);
end
$$;

-- Nộp bài sửa (spec §2.4): một transaction tạo attempt (REVISION, không bao giờ lần đầu, lần trước = bài được góp ý, cùng gia đình học tập),
-- nội dung, đánh dấu từng góp ý, khai báo trợ giúp, một trợ giúp "góp ý" quan sát được (bằng chứng có hỗ trợ - D5), lần luyện "retry"
-- cho mọi kỹ năng của cặp, episode (facets.revision). Idempotent theo (em, client_submission_id) như eng_submit_attempt.
create or replace function english.eng_submit_revision(
  p_activity uuid,
  p_client_id uuid,
  p_text text,
  p_marks jsonb,
  p_assistance text[],
  p_provenance text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member uuid;
  v_role text;
  v_act english.activity_instances%rowtype;
  v_l english.learners%rowtype;
  v_f english.feedback_notes%rowtype;
  v_src english.attempts%rowtype;
  v_src_text text;
  v_assist text[];
  v_marks jsonb;
  v_content jsonb;
  v_hash text;
  v_existing english.attempts%rowtype;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_no int;
  v_at timestamptz := pg_catalog.clock_timestamp();
  v_targets text[];
  v_item text;
  v_context text;
begin
  if v_uid is null then
    raise exception 'eng_submit_revision: not signed in' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'eng_submit_revision: client_submission_id is required' using errcode = '22004';
  end if;
  select m.id, m.role into v_member, v_role from english.members m where m.user_id = v_uid;
  if v_member is null then
    raise exception 'eng_submit_revision: activity not found' using errcode = 'P0002';
  end if;
  if v_role <> 'student' then
    raise exception 'eng_submit_revision: only the learner may submit a revision' using errcode = '42501';
  end if;
  -- Khóa dòng bước: hai lần nộp cùng lúc xếp hàng.
  select a.* into v_act from english.activity_instances a join english.learners l on l.id = a.learner_id
  where a.id = p_activity and l.member_id = v_member and a.mode = 'REVISION'
  for no key update of a;
  if not found then
    raise exception 'eng_submit_revision: activity not found' using errcode = 'P0002';
  end if;
  select * into v_l from english.learners l where l.id = v_act.learner_id;

  select coalesce(array_agg(distinct x order by x), '{}') into v_assist from unnest(p_assistance) as x;
  if cardinality(v_assist) = 0
     or not (v_assist <@ array['none', 'notes', 'dictionary', 'asked_someone', 'ai_outside'])
     or ('none' = any (v_assist) and cardinality(v_assist) > 1) then
    raise exception 'eng_submit_revision: declare the help used (or "none")' using errcode = '22023';
  end if;
  if p_provenance is null or p_provenance not in ('in_app', 'pasted') then
    raise exception 'eng_submit_revision: provenance must be in_app or pasted' using errcode = '22023';
  end if;
  if p_text is null or pg_catalog.btrim(p_text) = '' or pg_catalog.length(p_text) > 20000 then
    raise exception 'eng_submit_revision: the text must be 1 to 20000 characters' using errcode = '22023';
  end if;

  select f.* into v_f from english.feedback_notes f
  where f.revision_activity_id = p_activity and f.kind = 'feedback' and f.requires_revision and english.eng_feedback_is_live(f.id)
  order by f.round desc, f.created_at desc limit 1;
  if not found or not english.eng_activity_released(p_activity) then
    raise exception 'eng_submit_revision: there is no revision to do on this step (revision_not_open)' using errcode = '22023';
  end if;
  select * into v_src from english.attempts t where t.id = v_f.source_attempt_id;
  select av.content ->> 'text' into v_src_text from english.artifact_versions av where av.attempt_id = v_src.id order by av.version limit 1;
  v_marks := english.eng_clean_revision_marks(
    p_marks, v_f.items,
    coalesce(english.eng_track_setting(v_l.track_id, 'revision_reason_required') = 'true'::jsonb, false),
    english.eng_clean_text(p_text) = english.eng_clean_text(v_src_text));
  v_content := pg_catalog.jsonb_build_object('text', p_text);
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('text', p_text, 'marks', v_marks)::text, 'UTF8')), 'hex');

  -- Gửi lại: cùng biên nhận; cùng id mà khác bước / chữ / đánh dấu / khai báo / nguồn gốc → 23505.
  select t.* into v_existing from english.attempts t where t.learner_id = v_act.learner_id and t.client_submission_id = p_client_id;
  if found then
    if v_existing.activity_instance_id <> p_activity or v_existing.content_hash <> v_hash
       or v_existing.declared_assistance is distinct from v_assist or v_existing.provenance is distinct from p_provenance then
      raise exception 'eng_submit_revision: client_submission_id was already used for a different submission' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('attempt_id', v_existing.id, 'attempt_no', v_existing.attempt_no,
      'submitted_at', v_existing.submitted_at, 'hash', v_existing.content_hash, 'replayed', true);
  end if;
  if exists (select 1 from english.attempts t where t.revises_attempt_id = v_src.id) then
    raise exception 'eng_submit_revision: this revision was already submitted (already_submitted)' using errcode = '23505';
  end if;

  -- D6: số lần = lớn nhất trong gia đình học tập / trên bước này + 1; lần trước = bài được góp ý; gia đình của bài đó.
  v_no := greatest(
    (select coalesce(max(t.attempt_no), 0) from english.attempts t where t.learning_family_id = v_src.learning_family_id),
    (select coalesce(max(t.attempt_no), 0) from english.attempts t where t.activity_instance_id = p_activity)) + 1;
  insert into english.attempts(id, activity_instance_id, learner_id, attempt_no, parent_attempt_id, learning_family_id, mode, provenance,
                               declared_assistance, submitted_at, content_hash, client_submission_id, revises_attempt_id)
  values (v_id, p_activity, v_act.learner_id, v_no, v_src.id, v_src.learning_family_id, 'REVISION', p_provenance, v_assist, v_at, v_hash, p_client_id, v_src.id);
  insert into english.artifact_versions(attempt_id, learner_id, kind, version, content, is_raw, created_by)
  values (v_id, v_act.learner_id, 'text', 1, v_content, true, v_member);
  insert into english.revision_marks(learner_id, attempt_id, feedback_id, item_n, choice, reason)
  select v_act.learner_id, v_id, v_f.id, (x ->> 'n')::smallint, x ->> 'choice', x ->> 'reason'
  from pg_catalog.jsonb_array_elements(v_marks) x;

  -- Kỹ năng của cặp: của bước sửa, rồi của bài gốc (cùng thứ tự với eng_episode_targets).
  select coalesce(array_agg(z.k order by z.o), '{}') into v_targets
  from (
    select s.k, min(s.o) as o from (
      select u.k, u.o from unnest(v_act.target_ids) with ordinality as u(k, o)
      union all
      select u.k, 1000 + u.o
      from english.attempts r
      join english.activity_instances ra on ra.id = r.activity_instance_id
      cross join lateral unnest(ra.target_ids) with ordinality as u(k, o)
      where r.id = english.eng_revision_root(v_src.id)
    ) s group by s.k
  ) z;

  foreach v_item in array v_assist loop
    if v_item <> 'none' then
      insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification)
      values (v_act.learner_id, v_id, case when v_item = 'notes' then 'notes' else 'external_declared' end, v_item, v_targets, 'declared');
    end if;
  end loop;
  if p_provenance = 'pasted' then
    insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification)
    values (v_act.learner_id, v_id, 'external_declared', 'pasted', v_targets, 'declared');
  end if;
  -- D5: góp ý là một trợ giúp quan sát được → bài sửa luôn là bằng chứng "có hỗ trợ", không bao giờ "tự làm được".
  insert into english.assistance_events(learner_id, attempt_id, kind, detail, affects_target_keys, verification, note, recorded_by)
  values (v_act.learner_id, v_id, 'tutor_prompt', null, v_targets, 'observed', pg_catalog.format('Góp ý vòng %s', v_f.round), v_f.author_member);

  insert into english.exposure_log(learner_id, target_key, at, source, attempt_id)
  select distinct v_act.learner_id, k, v_at, 'retry', v_id from unnest(v_targets) as k;

  select i.snapshot -> 'template' ->> 'id' into v_context from english.inquiry_instances i where i.id = v_act.inquiry_instance_id;
  insert into english.episodes(attempt_id, learner_id, is_first_attempt, context_id, observed_directly, facets)
  values (v_id, v_act.learner_id, false, v_context, false,
          pg_catalog.jsonb_build_object('baseline', false, 'checkpoint', false, 'delayed_check', false, 'transfer_check', false, 'revision', true));

  delete from english.working_drafts d where d.activity_instance_id = p_activity and d.learner_id = v_act.learner_id;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_uid, v_role, 'revision.submitted', v_l.family_id, v_act.learner_id,
          pg_catalog.jsonb_build_object('attempt', v_id, 'feedback', v_f.id, 'round', v_f.round));
  return pg_catalog.jsonb_build_object('attempt_id', v_id, 'attempt_no', v_no, 'submitted_at', v_at, 'hash', v_hash, 'replayed', false);
end
$$;

revoke execute on function english.eng_my_feedback() from public, anon, service_role;
revoke execute on function english.eng_my_revision(uuid) from public, anon, service_role;
revoke execute on function english.eng_save_revision_draft(uuid, jsonb, int) from public, anon, service_role;
revoke execute on function english.eng_submit_revision(uuid, uuid, text, jsonb, text[], text) from public, anon, service_role;
grant execute on function english.eng_my_feedback() to authenticated;
grant execute on function english.eng_my_revision(uuid) to authenticated;
grant execute on function english.eng_save_revision_draft(uuid, jsonb, int) to authenticated;
grant execute on function english.eng_submit_revision(uuid, uuid, text, jsonb, text[], text) to authenticated;

-- G4 (phụ huynh duyệt 22/10): một ghi chú "Chỉ góp ý" còn hiện ở trang của chính bài đó (không hết hạn 14 ngày như ô ở trang chủ), miễn là
-- bước còn thấy được. Chỉ câu khen + góp ý + trích đoạn của em; không điểm, không lá kỹ năng, không tên người góp ý. NULL nếu không có.
create or replace function english.eng_my_activity_note(p_activity uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select (
    select pg_catalog.jsonb_build_object(
      'feedback_id', f.id,
      'praise', f.praise,
      'created_at', f.created_at,
      'notes', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', (x ->> 'n')::int, 'text', x ->> 'text', 'excerpt', x ->> 'excerpt')
                                            order by (x ->> 'n')::int)
                from pg_catalog.jsonb_array_elements(f.items) x))
    from english.feedback_notes f
    join english.attempts sa on sa.id = f.source_attempt_id
    join english.activity_instances a on a.id = sa.activity_instance_id
    join english.learners l on l.id = a.learner_id
    join english.members m on m.id = l.member_id
    where a.id = p_activity and m.user_id = auth.uid() and m.role = 'student'
      and f.kind = 'feedback' and not f.requires_revision and english.eng_feedback_is_live(f.id)
      and english.eng_activity_released(p_activity)
    order by f.created_at desc
    limit 1)
$$;
revoke execute on function english.eng_my_activity_note(uuid) from public, anon, service_role;
grant execute on function english.eng_my_activity_note(uuid) to authenticated;

-- 8. Phía người duyệt -----------------------------------------------------------------------------------------------------------------
-- Đánh giá từng góp ý + Xong (nhận xét kết, tùy chọn) hoặc Mở vòng 2 (góp ý mới) trong MỘT transaction (D11). Đánh giá phải đủ mọi góp ý và
-- hợp với lựa chọn của con: Đã sửa → improved / not_yet; Giữ nguyên → reason_ok / not_yet (3-a). Người duyệt = người được duyệt bài sửa (D14).
create or replace function english.eng_finish_revision(
  p_attempt uuid,
  p_action text,
  p_checks jsonb,
  p_closing text,
  p_praise text,
  p_items jsonb,
  p_by uuid,
  p_client_id text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_a english.attempts%rowtype;
  v_l english.learners%rowtype;
  v_member english.members%rowtype;
  v_f english.feedback_notes%rowtype;
  v_ep uuid;
  v_role text;
  v_closing text := nullif(pg_catalog.btrim(coalesce(p_closing, '')), '');
  v_c jsonb;
  v_n int;
  v_choice text;
  v_closing_id uuid;
  v_next jsonb;
begin
  if p_attempt is null or p_action is null or p_checks is null or p_by is null or p_client_id is null then
    raise exception 'eng_finish_revision: revision, action, checks, actor and client id are required' using errcode = '22004';
  end if;
  if p_action not in ('close', 'round2') then
    raise exception 'eng_finish_revision: action is close or round2 (bad_action)' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_client_id)) < 8 or pg_catalog.length(p_client_id) > 100 then
    raise exception 'eng_finish_revision: client_id must be 8..100 characters' using errcode = '22023';
  end if;
  select t.* into v_a from english.attempts t where t.id = p_attempt and t.revises_attempt_id is not null;
  if not found then
    raise exception 'eng_finish_revision: revision not found (not_found)' using errcode = 'P0002';
  end if;
  -- Khóa bước sửa: hai người bấm Xong cùng lúc xếp hàng.
  perform 1 from english.activity_instances a where a.id = v_a.activity_instance_id for no key update;
  select * into v_l from english.learners l where l.id = v_a.learner_id;
  select * into v_member from english.members m where m.id = p_by;
  select e.id into v_ep from english.episodes e where e.attempt_id = p_attempt;
  v_role := english.eng_review_role(v_ep, p_by);
  if v_role is null then
    raise exception 'eng_finish_revision: this member may not review this revision (D15)' using errcode = '42501';
  end if;
  select f.* into v_f from english.feedback_notes f
  where f.source_attempt_id = v_a.revises_attempt_id and f.kind = 'feedback' and f.requires_revision and english.eng_feedback_is_live(f.id);

  -- Gửi lại: đánh giá của lần bấm này đã có → trả lại kết quả cũ.
  if exists (select 1 from english.revision_checks c where c.attempt_id = p_attempt and c.client_id = p_client_id) then
    return pg_catalog.jsonb_build_object(
      'closing_id', (select c.id from english.feedback_notes c where c.source_attempt_id = p_attempt and c.kind = 'closing'),
      'feedback_id', (select x.id from english.feedback_notes x where x.source_attempt_id = p_attempt and x.kind = 'feedback' and x.supersedes_id is null),
      'revision_activity_id', (select x.revision_activity_id from english.feedback_notes x where x.source_attempt_id = p_attempt and x.kind = 'feedback' and x.supersedes_id is null),
      'replayed', true);
  end if;
  if exists (select 1 from english.feedback_notes x where x.source_attempt_id = p_attempt)
     or exists (select 1 from english.revision_checks c where c.attempt_id = p_attempt) then
    raise exception 'eng_finish_revision: this revision was already looked at (already_finished)' using errcode = '23505';
  end if;
  if p_action = 'round2' and v_f.round >= 2 then
    raise exception 'eng_finish_revision: at most 2 rounds of revision (max_rounds)' using errcode = '23514';
  end if;

  if pg_catalog.jsonb_typeof(p_checks) <> 'array' then
    raise exception 'eng_finish_revision: checks are [{n, verdict}] (bad_verdict)' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_checks) <> pg_catalog.jsonb_array_length(v_f.items)
     or (select pg_catalog.count(distinct x ->> 'n') from pg_catalog.jsonb_array_elements(p_checks) x) <> pg_catalog.jsonb_array_length(v_f.items) then
    raise exception 'eng_finish_revision: give one verdict for every feedback item (checks_incomplete)' using errcode = '23514';
  end if;
  for v_c in select x from pg_catalog.jsonb_array_elements(p_checks) x loop
    if pg_catalog.jsonb_typeof(v_c) <> 'object' or coalesce(v_c ->> 'n', '') !~ '^[1-3]$' then
      raise exception 'eng_finish_revision: checks are [{n, verdict}] (bad_verdict)' using errcode = '22023';
    end if;
    v_n := (v_c ->> 'n')::int;
    select m.choice into v_choice from english.revision_marks m where m.attempt_id = p_attempt and m.item_n = v_n;
    if v_choice is null then
      raise exception 'eng_finish_revision: give one verdict for every feedback item (checks_incomplete)' using errcode = '23514';
    end if;
    if not ((v_choice = 'changed' and v_c ->> 'verdict' in ('improved', 'not_yet'))
            or (v_choice = 'kept' and v_c ->> 'verdict' in ('reason_ok', 'not_yet'))) then
      raise exception 'eng_finish_revision: this verdict does not fit the child''s choice (bad_verdict)' using errcode = '22023';
    end if;
    insert into english.revision_checks(learner_id, attempt_id, item_n, verdict, checker_member, checker_role, client_id)
    values (v_a.learner_id, p_attempt, v_n, v_c ->> 'verdict', p_by, v_role, p_client_id);
  end loop;

  if p_action = 'close' then
    if v_closing is not null and pg_catalog.length(v_closing) > 300 then
      raise exception 'eng_finish_revision: the closing note is at most 300 characters (closing_too_long)' using errcode = '22023';
    end if;
    if english.eng_has_score_words(v_closing) then
      raise exception 'eng_finish_revision: no scores in the closing note (score_words)' using errcode = '23514';
    end if;
    insert into english.feedback_notes(learner_id, source_attempt_id, root_attempt_id, round, kind, praise, items, requires_revision,
                                       author_member, author_role, client_id)
    values (v_a.learner_id, p_attempt, v_f.root_attempt_id, v_f.round, 'closing', v_closing, '[]'::jsonb, false, p_by, v_role, p_client_id)
    returning id into v_closing_id;
  else
    v_next := english.eng_write_feedback(p_attempt, p_praise, p_items, true, null, p_by, p_client_id);
  end if;

  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'revision.checked', v_l.family_id, v_l.id,
          pg_catalog.jsonb_build_object('attempt', p_attempt, 'action', p_action, 'round', v_f.round, 'checks', pg_catalog.jsonb_array_length(p_checks)));
  return pg_catalog.jsonb_build_object('closing_id', v_closing_id, 'feedback_id', v_next ->> 'id',
                                       'revision_activity_id', v_next ->> 'revision_activity_id', 'replayed', false);
end
$$;

-- Khung "Góp ý cho con" ở màn duyệt (người duyệt; máy chủ gọi sau requireAccess): bài có góp ý được không (D8), người này góp ý được không,
-- chữ của bài (để chọn trích đoạn), góp ý đang hiệu lực (+ còn sửa được không, con đã tới đâu), các bản cũ.
create or replace function english.eng_feedback_panel(p_attempt uuid, p_by uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_a english.attempts%rowtype;
  v_ep uuid;
  v_kind text;
  v_text text;
  v_role text;
  v_eligible boolean;
  v_live english.feedback_notes%rowtype;
  v_rev english.attempts%rowtype;
begin
  select * into v_a from english.attempts t where t.id = p_attempt;
  if not found then return null; end if;
  select e.id into v_ep from english.episodes e where e.attempt_id = p_attempt;
  select av.kind, av.content ->> 'text' into v_kind, v_text
  from english.artifact_versions av where av.attempt_id = p_attempt order by av.version limit 1;
  v_eligible := v_kind = 'text' and v_text is not null and v_a.provenance in ('in_app', 'pasted');
  v_role := english.eng_review_role(v_ep, p_by);
  select f.* into v_live from english.feedback_notes f
  where f.source_attempt_id = p_attempt and f.kind = 'feedback' and english.eng_feedback_is_live(f.id);
  select t.* into v_rev from english.attempts t where t.revises_attempt_id = p_attempt order by t.submitted_at limit 1;
  return pg_catalog.jsonb_build_object(
    'eligible', coalesce(v_eligible, false),
    -- Góp ý mới: chỉ cho bài gốc. Bài sửa nhận góp ý vòng 2 qua "Mở vòng 2" (eng_finish_revision).
    'can_give', coalesce(v_eligible, false) and v_role is not null and v_live.id is null and v_a.revises_attempt_id is null,
    'text', case when v_eligible then v_text end,
    'live', case when v_live.id is null then null else pg_catalog.jsonb_build_object(
      'id', v_live.id, 'praise', v_live.praise, 'items', v_live.items, 'requires_revision', v_live.requires_revision, 'round', v_live.round,
      'revision_activity_id', v_live.revision_activity_id,
      'author_name', (select m.display_name from english.members m where m.id = v_live.author_member),
      'author_is_me', v_live.author_member = p_by,
      'created_at', v_live.created_at,
      'editable', v_live.author_member = p_by and v_role is not null and not english.eng_revision_started(v_live.id),
      'revision_state', case when not v_live.requires_revision then null
                             when v_rev.id is not null then
                               case when exists (select 1 from english.feedback_notes x where x.source_attempt_id = v_rev.id) then 'seen' else 'submitted' end
                             when english.eng_revision_started(v_live.id) then 'started'
                             else 'todo' end,
      'revision_episode_id', (select e.id from english.episodes e where e.attempt_id = v_rev.id)) end,
    'history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', h.id, 'praise', h.praise, 'items', h.items, 'created_at', h.created_at,
                                                                'author_name', m.display_name) order by h.created_at, h.id)
      from english.feedback_notes h left join english.members m on m.id = h.author_member
      where h.source_attempt_id = p_attempt and h.kind = 'feedback' and not english.eng_feedback_is_live(h.id)), '[]'::jsonb));
end
$$;

-- Trước–sau của một bài sửa (màn "Bài sửa lại" và "Bài đã sửa"): bài cũ, bài sửa, góp ý, đánh dấu của con, đánh giá, nhận xét kết / vòng 2,
-- người xem có được đánh giá không. NULL nếu không phải bài sửa.
create or replace function english.eng_revision_view(p_attempt uuid, p_by uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_a english.attempts%rowtype;
  v_f english.feedback_notes%rowtype;
  v_l english.learners%rowtype;
  v_ep uuid;
  v_role text;
  v_done boolean;
  v_title text;
begin
  select t.* into v_a from english.attempts t where t.id = p_attempt and t.revises_attempt_id is not null;
  if not found then return null; end if;
  select f.* into v_f from english.feedback_notes f
  where f.source_attempt_id = v_a.revises_attempt_id and f.kind = 'feedback' and f.requires_revision and english.eng_feedback_is_live(f.id);
  select * into v_l from english.learners l where l.id = v_a.learner_id;
  select e.id into v_ep from english.episodes e where e.attempt_id = p_attempt;
  select i.snapshot -> 'template' ->> 'title_vi' into v_title
  from english.activity_instances a join english.inquiry_instances i on i.id = a.inquiry_instance_id where a.id = v_a.activity_instance_id;
  v_role := english.eng_review_role(v_ep, p_by);
  v_done := exists (select 1 from english.feedback_notes x where x.source_attempt_id = p_attempt);
  return pg_catalog.jsonb_build_object(
    'attempt_id', v_a.id, 'episode_id', v_ep, 'learner_id', v_l.id, 'alias', v_l.alias, 'round', v_f.round, 'title_vi', v_title,
    'submitted_at', v_a.submitted_at,
    'before', pg_catalog.jsonb_build_object(
      'attempt_id', v_a.revises_attempt_id,
      'episode_id', (select e.id from english.episodes e where e.attempt_id = v_a.revises_attempt_id),
      'text', (select av.content ->> 'text' from english.artifact_versions av where av.attempt_id = v_a.revises_attempt_id order by av.version limit 1),
      'submitted_at', (select t.submitted_at from english.attempts t where t.id = v_a.revises_attempt_id)),
    'after', pg_catalog.jsonb_build_object(
      'text', (select av.content ->> 'text' from english.artifact_versions av where av.attempt_id = p_attempt order by av.version limit 1)),
    'feedback', pg_catalog.jsonb_build_object(
      'id', v_f.id, 'praise', v_f.praise, 'items', v_f.items, 'created_at', v_f.created_at,
      'author_name', (select m.display_name from english.members m where m.id = v_f.author_member)),
    'marks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', m.item_n, 'choice', m.choice, 'reason', m.reason) order by m.item_n)
                       from english.revision_marks m where m.attempt_id = p_attempt), '[]'::jsonb),
    'checks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('n', c.item_n, 'verdict', c.verdict, 'checker_name', mb.display_name,
                                                                                  'created_at', c.created_at) order by c.item_n)
                        from english.revision_checks c left join english.members mb on mb.id = c.checker_member where c.attempt_id = p_attempt), '[]'::jsonb),
    'closing', (select pg_catalog.jsonb_build_object('note', c.praise, 'author_name', mb.display_name, 'created_at', c.created_at)
                from english.feedback_notes c left join english.members mb on mb.id = c.author_member
                where c.source_attempt_id = p_attempt and c.kind = 'closing'),
    'next_round', (select pg_catalog.jsonb_build_object('feedback_id', x.id, 'created_at', x.created_at)
                   from english.feedback_notes x where x.source_attempt_id = p_attempt and x.kind = 'feedback' and x.supersedes_id is null),
    'reason_required', coalesce(english.eng_track_setting(v_l.track_id, 'revision_reason_required') = 'true'::jsonb, false),
    'can_finish', v_role is not null and not v_done,
    'can_open_round2', v_role is not null and not v_done and v_f.round < 2);
end
$$;

-- "Bài đã sửa" của một em (phụ huynh, gia sư): các cặp trước–sau, mới nhất trước, tối đa 50.
create or replace function english.eng_revision_list(p_learner uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('items', coalesce(pg_catalog.jsonb_agg(x.obj order by x.at desc, x.id desc), '[]'::jsonb))
  from (
    select t.id, t.submitted_at as at, pg_catalog.jsonb_build_object(
      'attempt_id', t.id,
      'episode_id', e.id,
      'title_vi', i.snapshot -> 'template' ->> 'title_vi',
      'round', english.eng_revision_round(t.id),
      'submitted_at', t.submitted_at,
      'items_count', (select pg_catalog.count(*) from english.revision_marks m where m.attempt_id = t.id),
      'state', case when exists (select 1 from english.feedback_notes x where x.source_attempt_id = t.id) then 'done' else 'waiting' end,
      'good', (select pg_catalog.count(*) from english.revision_checks c where c.attempt_id = t.id and c.verdict in ('improved', 'reason_ok')),
      'not_yet', (select pg_catalog.count(*) from english.revision_checks c where c.attempt_id = t.id and c.verdict = 'not_yet')) as obj
    from english.attempts t
    join english.episodes e on e.attempt_id = t.id
    join english.activity_instances a on a.id = t.activity_instance_id
    join english.inquiry_instances i on i.id = a.inquiry_instance_id
    where t.learner_id = p_learner and t.revises_attempt_id is not null
    order by t.submitted_at desc, t.id desc
    limit 50
  ) x
$$;

revoke execute on function english.eng_finish_revision(uuid, text, jsonb, text, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function english.eng_finish_revision(uuid, text, jsonb, text, text, jsonb, uuid, text) to service_role;
revoke execute on function english.eng_feedback_panel(uuid, uuid) from public, anon, authenticated;
grant execute on function english.eng_feedback_panel(uuid, uuid) to service_role;
revoke execute on function english.eng_revision_view(uuid, uuid) from public, anon, authenticated;
grant execute on function english.eng_revision_view(uuid, uuid) to service_role;
revoke execute on function english.eng_revision_list(uuid) from public, anon, authenticated;
grant execute on function english.eng_revision_list(uuid) to service_role;

-- Hộp duyệt (0010) - giữ nguyên mọi luật, thêm cho bài sửa: XONG khi người duyệt đã bấm Xong / Mở vòng 2 (điểm trên bài sửa là tùy chọn - D15),
-- nhãn vòng ('revision_round'), "chỉ gia sư" theo bài gốc (eng_episode_restricted - D14).
create or replace function english.eng_review_inbox(
  p_allow_real boolean default false,
  p_filter text default 'todo',
  p_limit int default 50,
  p_after_at timestamptz default null,
  p_after_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_me uuid := english.eng_current_member_id();
begin
  if p_filter is null or p_filter not in ('todo', 'tutor', 'independent', 'baseline', 'practice', 'done') then
    raise exception 'eng_review_inbox: unknown filter' using errcode = '22023';
  end if;
  if (p_after_at is null) <> (p_after_id is null) then
    raise exception 'eng_review_inbox: the cursor needs both a time and an id' using errcode = '22023';
  end if;

  return (
    with base as (
      select e.id as episode_id, at.submitted_at,
        x.total, x.decided,
        case when rv.round is null then x.decided >= x.total else rv.finished end as is_done,
        case
          when x.restricted then 'tutor'
          when coalesce((e.facets ->> 'baseline')::boolean, false) then 'baseline'
          when a.mode = 'INDEPENDENT_CHECK' then 'independent'
          else 'practice' end as category,
        english.eng_review_role(e.id, v_me) is not null as can_decide,
        pg_catalog.jsonb_build_object(
          'episode_id', e.id,
          'attempt_id', at.id,
          'learner_id', l.id,
          'alias', l.alias,
          'is_test', l.is_test,
          'title_vi', i.snapshot -> 'template' ->> 'title_vi',
          'step_no', a.step_no,
          'activity_type', a.activity_type,
          'mode', a.mode,
          'purpose', pg_catalog.to_jsonb(a.purpose),
          'provenance', at.provenance,
          'attempt_no', at.attempt_no,
          'is_first_attempt', e.is_first_attempt,
          'submitted_at', at.submitted_at,
          'restricted', x.restricted,
          'targets_total', x.total,
          'targets_decided', x.decided,
          'revision_round', rv.round) as obj
      from english.episodes e
      join english.learners l on l.id = e.learner_id
      join english.attempts at on at.id = e.attempt_id
      join english.activity_instances a on a.id = at.activity_instance_id
      join english.inquiry_instances i on i.id = a.inquiry_instance_id
      cross join lateral (
        select count(*) filter (where t.scorable)::int as total,
               count(*) filter (where t.scorable and exists (
                 select 1 from english.validation_decisions d
                 where d.episode_id = e.id and d.target_key = t.target_key and d.supersedes_id is null))::int as decided,
               english.eng_episode_restricted(e.id) as restricted
        from english.eng_episode_targets(e.id) t
      ) x
      cross join lateral (
        select english.eng_revision_round(at.id) as round,
               exists (select 1 from english.feedback_notes f where f.source_attempt_id = at.id) as finished
      ) rv
      where english.eng_is_staff_of(e.learner_id)
        and (p_allow_real or l.is_test)
        and x.total > 0
    ),
    counts as (
      select pg_catalog.jsonb_build_object(
        'todo', count(*) filter (where not b.is_done),
        'tutor', count(*) filter (where not b.is_done and b.category = 'tutor'),
        'independent', count(*) filter (where not b.is_done and b.category = 'independent'),
        'baseline', count(*) filter (where not b.is_done and b.category = 'baseline'),
        'practice', count(*) filter (where not b.is_done and b.category = 'practice'),
        'done', count(*) filter (where b.is_done),
        'to_decide', count(*) filter (where not b.is_done and b.can_decide)) as c
      from base b
    ),
    picked as (
      select b.*
      from base b
      where (case p_filter
               when 'done' then b.is_done
               when 'todo' then not b.is_done
               else not b.is_done and b.category = p_filter end)
        and (p_after_at is null or (b.submitted_at, b.episode_id) > (p_after_at, p_after_id))
      order by b.submitted_at, b.episode_id
      limit v_limit + 1
    ),
    page as (
      select p.*, row_number() over (order by p.submitted_at, p.episode_id) as rn from picked p
    )
    select pg_catalog.jsonb_build_object(
      'items', coalesce((select pg_catalog.jsonb_agg(
                           pg_catalog.jsonb_build_object('category', p.category, 'can_decide', p.can_decide) || p.obj
                           order by p.rn)
                         from page p where p.rn <= v_limit), '[]'::jsonb),
      'next', (select pg_catalog.jsonb_build_object('at', p.submitted_at, 'id', p.episode_id)
               from page p where p.rn = v_limit and exists (select 1 from page q where q.rn = v_limit + 1)),
      'counts', (select c from counts))
  );
end
$$;
revoke execute on function english.eng_review_inbox(boolean, text, int, timestamptz, uuid) from public, anon, service_role;
grant execute on function english.eng_review_inbox(boolean, text, int, timestamptz, uuid) to authenticated;

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
