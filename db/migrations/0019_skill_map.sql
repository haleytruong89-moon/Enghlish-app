-- 0019_skill_map.sql
-- SM-1 · Bản đồ kỹ năng (spec docs/superpowers/specs/2026-10-21-skill-map-levels-design.md §2, §6):
--   1. Bốn bảng cấu hình có phiên bản: skill_maps (bản đồ; công bố = bất biến), skill_domains (7 mảng), skill_groups (40 nhóm, mô tả
--      theo cấp), skill_leaves (lá = nhãn có sẵn theo track hoặc kỹ năng danh mục; cấp; core; ẩn khỏi ô chọn; liên quan).
--   2. Seed SM-1 = đúng nội dung content/skill_map/SM-1.json (test so khớp JSON + sha256), kiểm từng lá, rồi công bố.
--   3. error_tags.group_key (nullable, chỉ nhãn riêng) + eng_add_error_tag_v2 (bắt buộc nhóm của bản đồ hiện hành)
--      + eng_set_tag_group (xếp nhóm cho nhãn riêng cũ chưa có nhóm). eng_add_error_tag của 0014 vẫn chạy (expand).
--   4. eng_skill_map(p_learner): bản đồ hiện hành cho một em (mảng → nhóm → lá; nhãn theo track + nhãn riêng của gia đình;
--      mọi kỹ năng danh mục có cờ "trong bộ"; mục "chưa xếp mảng").
-- Đổi bản đồ = phiên bản mới (SM-2, migration mới), phụ huynh duyệt. Mọi hàm gọi được: security definer, search_path = '',
-- chỉ service_role (server gọi SAU requireAccess). Không đụng schema public. Idempotent; chỉ thêm.

-- 1. Bảng ------------------------------------------------------------------------------------------------------------------------------
create table if not exists english.skill_maps (
  id text primary key check (id ~ '^SM-[0-9]{1,3}$'),
  title_vi text not null check (pg_catalog.length(pg_catalog.btrim(title_vi)) between 1 and 120),
  catalogue_version text not null references english.catalogue_versions(version),
  -- Cấp giả định theo track: {"A": {"grammar": "A2", …, "thinking": 1}, "B": {…}}. Cấu hình (SM-2 hiện "giả định"), không phải dữ liệu của em.
  assumed jsonb not null check (pg_catalog.jsonb_typeof(assumed) = 'object'),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz
);

create table if not exists english.skill_domains (
  map_id text not null references english.skill_maps(id),
  key text not null check (key in ('grammar', 'vocab', 'reading', 'listening', 'writing', 'speaking', 'thinking')),
  ord int not null check (ord between 1 and 7),
  name_vi text not null check (pg_catalog.length(pg_catalog.btrim(name_vi)) between 1 and 60),
  scale text not null check (scale in ('cefr', 'task_level')),
  primary key (map_id, key),
  unique (map_id, ord)
);

create table if not exists english.skill_groups (
  map_id text not null,
  key text not null check (key ~ '^[a-z]{2}-[a-z-]{2,30}$'),
  domain_key text not null,
  ord int not null check (ord between 1 and 99),
  name_vi text not null check (pg_catalog.length(pg_catalog.btrim(name_vi)) between 1 and 80),
  -- Mảng CEFR: {"A1-A2","B1","B2","C1-C2"} → chữ hoặc null; mảng task_level: {"low","high"}.
  descriptions jsonb not null check (pg_catalog.jsonb_typeof(descriptions) = 'object'),
  primary key (map_id, key),
  unique (map_id, domain_key, ord),
  foreign key (map_id, domain_key) references english.skill_domains(map_id, key)
);

create table if not exists english.skill_leaves (
  map_id text not null,
  kind text not null check (kind in ('tag', 'target')),
  track_id text not null references english.tracks(id),
  -- tag: error_tags.key (nhãn có sẵn, family_id null) của track_id; target: targets.id của danh mục của bản đồ.
  ref_key text not null check (pg_catalog.length(ref_key) between 1 and 100),
  group_key text not null,
  ord int not null check (ord between 1 and 999),
  level_from text check (level_from in ('A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2')),
  level_to text check (level_to in ('A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2')),
  task_from int check (task_from between 1 and 4),
  task_to int check (task_to between 1 and 4),
  level_note text check (level_note is null or pg_catalog.length(level_note) <= 200),
  core boolean not null default false,
  hidden_in_picker boolean not null default false,
  -- Mã kỹ năng danh mục "liên quan" (nhãn ↔ kỹ năng gần nghĩa, spec §2 quy tắc 4).
  related text[] not null default '{}',
  primary key (map_id, kind, track_id, ref_key),
  unique (map_id, group_key, ord),
  foreign key (map_id, group_key) references english.skill_groups(map_id, key),
  constraint skill_leaves_level_pairs check ((level_from is null) = (level_to is null) and (task_from is null) = (task_to is null)),
  constraint skill_leaves_one_scale check (level_from is null or task_from is null),
  constraint skill_leaves_task_order check (task_from is null or task_from <= task_to)
);

-- Bất biến sau công bố ------------------------------------------------------------------------------------------------------------------
-- skill_maps dùng lại eng_forbid_published_change('self') của 0005. Dòng con của một bản đồ ĐÃ công bố không thêm / sửa / xóa được.
create or replace function english.eng_forbid_skill_map_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_map text;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'english.%: TRUNCATE is forbidden on versioned configuration', tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    v_map := new.map_id;
  else
    v_map := old.map_id;
  end if;
  if exists (select 1 from english.skill_maps m where m.id = v_map and m.published_at is not null) then
    raise exception 'english.%: % is forbidden on a published skill map (publish a new version instead)', tg_table_name, tg_op
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;
revoke execute on function english.eng_forbid_skill_map_change() from public, anon, authenticated;

drop trigger if exists skill_maps_immutable on english.skill_maps;
create trigger skill_maps_immutable
  before update or delete on english.skill_maps
  for each row execute function english.eng_forbid_published_change('self');

do $$
declare
  t text;
begin
  foreach t in array array['skill_domains', 'skill_groups', 'skill_leaves'] loop
    execute format('drop trigger if exists %I on english.%I', t || '_immutable', t);
    execute format(
      'create trigger %I before insert or update or delete on english.%I for each row execute function english.eng_forbid_skill_map_change()',
      t || '_immutable', t);
  end loop;
  foreach t in array array['skill_maps', 'skill_domains', 'skill_groups', 'skill_leaves'] loop
    execute format('drop trigger if exists %I on english.%I', t || '_immutable_truncate', t);
    execute format(
      'create trigger %I before truncate on english.%I for each statement execute function english.eng_forbid_published_change()',
      t || '_immutable_truncate', t);
  end loop;
end
$$;

-- RLS: thành viên app đọc bản đồ ĐÃ công bố (như cấu hình ở 0005). Không có policy ghi; ghi chỉ bằng migration.
alter table english.skill_maps enable row level security;
alter table english.skill_domains enable row level security;
alter table english.skill_groups enable row level security;
alter table english.skill_leaves enable row level security;

drop policy if exists skill_maps_select on english.skill_maps;
create policy skill_maps_select on english.skill_maps
  for select to authenticated
  using (published_at is not null and english.eng_current_member_id() is not null);

drop policy if exists skill_domains_select on english.skill_domains;
create policy skill_domains_select on english.skill_domains
  for select to authenticated
  using (english.eng_current_member_id() is not null
         and exists (select 1 from english.skill_maps m where m.id = skill_domains.map_id and m.published_at is not null));

drop policy if exists skill_groups_select on english.skill_groups;
create policy skill_groups_select on english.skill_groups
  for select to authenticated
  using (english.eng_current_member_id() is not null
         and exists (select 1 from english.skill_maps m where m.id = skill_groups.map_id and m.published_at is not null));

drop policy if exists skill_leaves_select on english.skill_leaves;
create policy skill_leaves_select on english.skill_leaves
  for select to authenticated
  using (english.eng_current_member_id() is not null
         and exists (select 1 from english.skill_maps m where m.id = skill_leaves.map_id and m.published_at is not null));

grant select on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves to authenticated;
revoke insert, update, delete, truncate on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves from public, anon, authenticated, service_role;
revoke all on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves from anon;

-- 2. Seed SM-1 (nội dung = content/skill_map/SM-1.json; đã công bố thì chạy lại không đụng gì) ------------------------------------------
do $seed$
declare
  j constant jsonb := $j${
  "id": "SM-1",
  "title_vi": "Bản đồ kỹ năng A1–C2",
  "catalogue_version": "0.2.1-draft",
  "spec": "docs/superpowers/specs/2026-10-21-skill-map-levels-design.md",
  "note": "Nguồn sự thật của bản đồ kỹ năng SM-1 (seed bằng migration 0019; đã công bố thì không sửa — đổi = SM-2). core = false cho mọi lá (điểm cốt lõi theo cấp đến với nội dung v0.3). Cấp của nhãn ngữ pháp/từ vựng: tham khảo English Profile, gia sư kiểm lại.",
  "levels": ["A1","A2","A2+","B1","B1+","B2","B2+","C1","C2"],
  "level_bands": ["A1-A2","B1","B2","C1-C2"],
  "task_levels": [1,2,3,4],
  "assumed": {"A":{"grammar":"A2","vocab":"A2","reading":"A2","listening":"A2","writing":"A2","speaking":"A2","thinking":1},"B":{"grammar":"B2","vocab":"B2","reading":"B2","listening":"B2","writing":"B2","speaking":"B2","thinking":2}},
  "domains": [
    {
      "key": "grammar", "name_vi": "Ngữ pháp", "scale": "cefr",
      "groups": [
        {
          "key": "gr-tense", "name_vi": "Thì",
          "desc": {"A1-A2":"HT đơn/tiếp diễn, QK đơn, going to","B1":"HT hoàn thành, QK tiếp diễn, used to","B2":"QK hoàn thành, hoàn thành tiếp diễn, TL hoàn thành","C1-C2":"Thì để nói lịch sự, giữ khoảng cách"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"hien-tai-don","level_from":"A1","level_to":"A1","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"tag","track":"A","ref":"hien-tai-don-s-es","level_from":"A1","level_to":"A1","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"tag","track":"A","ref":"qua-khu-don","level_from":"A2","level_to":"A2","level_note":"tham khảo English Profile — gia sư kiểm lại","related":["A-L1-PAST-W"]},
            {"kind":"target","track":"A","ref":"A-L1-PAST-W","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"A","ref":"A-L1-PRESPERF-W","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"A","ref":"A-L1-FUTURE-W","level_from":"A2","level_to":"A2"}
          ]
        },
        {
          "key": "gr-modal", "name_vi": "Động từ khuyết thiếu",
          "desc": {"A1-A2":"can, must, should","B1":"have to, might, could","B2":"must have (suy đoán quá khứ), needn't have","C1-C2":"Sắc thái tinh: be bound to…"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"modal-suy-doan","level_from":"B2","level_to":"B2","level_note":"tham khảo English Profile — gia sư kiểm lại"}
          ]
        },
        {
          "key": "gr-conditional", "name_vi": "Câu điều kiện & giả định",
          "desc": {"A1-A2":"If loại 0/1","B1":"Loại 2, wish hiện tại","B2":"Loại 3, wish quá khứ, would rather","C1-C2":"Hỗn hợp, đảo ngữ (Had I known), giả định"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"cau-dieu-kien-dao-ngu","level_from":"B1","level_to":"C1","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"tag","track":"B","ref":"wish-would-rather","level_from":"B1","level_to":"B2","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"target","track":"B","ref":"B-L1-HYPO-W","level_from":"B2","level_to":"B2"}
          ]
        },
        {
          "key": "gr-passive-report", "name_vi": "Bị động, tường thuật, nhờ",
          "desc": {"A1-A2":null,"B1":"Bị động đơn giản, tường thuật câu kể","B2":"Bị động mọi thì, have sth done, tường thuật câu hỏi","C1-C2":"It is said that…, động từ tường thuật đa dạng"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"bi-dong-nho-tuong-thuat","level_from":"B1","level_to":"B2","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"target","track":"A","ref":"A-L1-PASSIVE-W","level_from":"B1","level_to":"B1"},
            {"kind":"target","track":"B","ref":"B-L1-REPORT-W","level_from":"B2","level_to":"B2"}
          ]
        },
        {
          "key": "gr-clause", "name_vi": "Mệnh đề & nối câu",
          "desc": {"A1-A2":"and, but, because, when","B1":"Mệnh đề quan hệ, although, unless","B2":"Quan hệ không xác định, rút gọn mệnh đề","C1-C2":"Mệnh đề phân từ, câu nhiều tầng"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L1-SENT-W","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"B","ref":"B-L1-COMPLEX-W","level_from":"B2","level_to":"B2"}
          ]
        },
        {
          "key": "gr-noun-det", "name_vi": "Danh từ, mạo từ, lượng từ",
          "desc": {"A1-A2":"a/the, some/any","B1":"few/little, đại từ","B2":"Mạo từ với danh từ trừu tượng","C1-C2":"Danh hóa, cụm danh từ học thuật"},
          "leaves": []
        },
        {
          "key": "gr-compare-prep", "name_vi": "So sánh, tính từ, giới từ",
          "desc": {"A1-A2":"So sánh hơn/nhất, in/on/at","B1":"as…as, too/enough","B2":"the more… the more","C1-C2":"nowhere near as…"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"gioi-tu-thoi-gian","level_from":"A1","level_to":"A2","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"tag","track":"A","ref":"so-sanh","level_from":"A2","level_to":"A2","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"target","track":"A","ref":"A-L1-COMP-W","level_from":"A2","level_to":"A2"}
          ]
        },
        {
          "key": "gr-verb-pattern", "name_vi": "V-ing / to V",
          "desc": {"A1-A2":"like doing, want to","B1":"Động từ thường gặp","B2":"stop/remember/try (đổi nghĩa)","C1-C2":"Phân từ hoàn thành"},
          "leaves": []
        },
        {
          "key": "gr-emphasis", "name_vi": "Nhấn mạnh & đảo ngữ",
          "desc": {"A1-A2":null,"B1":"Câu hỏi đuôi","B2":"Câu chẻ, Not only…","C1-C2":"Đảo ngữ phủ định, lược bỏ"},
          "leaves": []
        },
        {
          "key": "gr-transform", "name_vi": "Tổng hợp & biến đổi câu",
          "desc": {"A1-A2":null,"B1":"Tìm lỗi sai","B2":"Viết lại câu giữ nghĩa","C1-C2":"Biến đổi phức"},
          "leaves": [
            {"kind":"target","track":"B","ref":"B-L1-TRANSFORM-W","level_from":"B1","level_to":"B2"}
          ]
        }
      ]
    },
    {
      "key": "vocab", "name_vi": "Từ vựng", "scale": "cefr",
      "groups": [
        {
          "key": "vo-topic", "name_vi": "Từ theo chủ đề",
          "desc": {"A1-A2":"Gia đình, trường, thời tiết","B1":"Môi trường, công nghệ, sức khỏe","B2":"Xã hội, khoa học, truyền thông","C1-C2":"Chủ đề trừu tượng, chuyên sâu"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"tu-vung-chu-de"},
            {"kind":"target","track":"A","ref":"A-L2-CHUNKS","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"A","ref":"A-L2-PRECISE","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"B","ref":"B-L2-PRECISE","level_from":"B2+","level_to":"B2+"}
          ]
        },
        {
          "key": "vo-word-form", "name_vi": "Dạng từ",
          "desc": {"A1-A2":"-er, -ful","B1":"un-, dis-","B2":"Đủ họ từ danh/động/tính/trạng","C1-C2":"Từ hiếm, từ ghép"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"dang-tu","level_from":"B1","level_to":"B2","level_note":"tham khảo English Profile — gia sư kiểm lại"}
          ]
        },
        {
          "key": "vo-colloc-idiom", "name_vi": "Kết hợp từ, cụm động từ, thành ngữ",
          "desc": {"A1-A2":"make/do, get up","B1":"give up, heavy rain","B2":"Cụm động từ nhiều nghĩa, thành ngữ thông dụng","C1-C2":"Thành ngữ, ẩn dụ"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"cum-dong-tu","level_from":"B1","level_to":"B2","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"tag","track":"B","ref":"thanh-ngu","level_from":"B2","level_to":"C1","level_note":"tham khảo English Profile — gia sư kiểm lại"}
          ]
        },
        {
          "key": "vo-context", "name_vi": "Nghĩa trong ngữ cảnh",
          "desc": {"A1-A2":"Đồng nghĩa dễ","B1":"Đoán nghĩa từ ngữ cảnh","B2":"Phân biệt từ gần nghĩa","C1-C2":"Sắc thái, hàm ý"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"tu-vung-ngu-canh"},
            {"kind":"target","track":"B","ref":"B-L2-CLOZE","level_from":"B1","level_to":"B2"}
          ]
        },
        {
          "key": "vo-register", "name_vi": "Văn phong & từ học thuật",
          "desc": {"A1-A2":null,"B1":"Thân mật / trang trọng","B2":"Từ học thuật phổ biến","C1-C2":"Đổi văn phong linh hoạt"},
          "leaves": [
            {"kind":"target","track":"B","ref":"B-L2-STANCE","level_from":"C1","level_to":"C1"}
          ]
        }
      ]
    },
    {
      "key": "reading", "name_vi": "Đọc", "scale": "cefr",
      "groups": [
        {
          "key": "re-gist-detail", "name_vi": "Ý chính & chi tiết",
          "desc": {"A1-A2":"Biển báo, tin nhắn, đoạn ngắn","B1":"Bài báo đơn giản","B2":"Bài dài, tóm tắt","C1-C2":"Văn bản phức, rất dài"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"doc-main-idea","related":["A-T1-TEXT-R"]},
            {"kind":"tag","track":"A","ref":"doc-details"},
            {"kind":"tag","track":"A","ref":"doc-hieu","hidden_in_picker":true},
            {"kind":"tag","track":"B","ref":"doc-main-idea"},
            {"kind":"tag","track":"B","ref":"doc-summarize"},
            {"kind":"target","track":"A","ref":"A-T1-TEXT-R"},
            {"kind":"target","track":"B","ref":"B-T1-EXAM-R"}
          ]
        },
        {
          "key": "re-inference", "name_vi": "Suy luận & dự đoán",
          "desc": {"A1-A2":"Suy luận dễ","B1":"Rút ra kết luận","B2":"Giả định, hàm ý","C1-C2":"Ẩn ý nhiều tầng"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"doc-inference"},
            {"kind":"tag","track":"B","ref":"doc-inference","related":["B-T2-ASSUME-R"]},
            {"kind":"tag","track":"B","ref":"doc-conclusions","related":["B-T11-QUALIFY"]},
            {"kind":"tag","track":"B","ref":"doc-prediction"},
            {"kind":"target","track":"A","ref":"A-T2-INFER-R"},
            {"kind":"target","track":"B","ref":"B-T2-ASSUME-R"}
          ]
        },
        {
          "key": "re-purpose-tone", "name_vi": "Mục đích, thái độ, giọng điệu",
          "desc": {"A1-A2":"Văn bản để làm gì","B1":"Ý kiến người viết","B2":"Thái độ, giọng điệu","C1-C2":"Mỉa mai, thiên kiến"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"doc-author-purpose"},
            {"kind":"tag","track":"B","ref":"doc-author-purpose"}
          ]
        },
        {
          "key": "re-structure", "name_vi": "Cấu trúc & lập luận của bài",
          "desc": {"A1-A2":"Trình tự","B1":"Nguyên nhân–kết quả","B2":"Luận điểm, sự kiện vs ý kiến, chứng cứ","C1-C2":"Lập luận phức, sắp xếp đoạn"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"doc-sequence"},
            {"kind":"tag","track":"B","ref":"doc-sequence"},
            {"kind":"tag","track":"B","ref":"doc-cause-effect"},
            {"kind":"tag","track":"B","ref":"doc-compare-contrast"},
            {"kind":"tag","track":"B","ref":"doc-fact-opinion","related":["B-T5-DATAOP"]},
            {"kind":"tag","track":"B","ref":"doc-evidence","related":["B-T7-ARGUE"]},
            {"kind":"target","track":"B","ref":"B-T1-ARG-R"}
          ]
        },
        {
          "key": "re-word-ref", "name_vi": "Từ & tham chiếu trong bài",
          "desc": {"A1-A2":"Đoán từ dễ","B1":"Gợi ý ngữ cảnh","B2":"Đồng/trái nghĩa, it/this chỉ gì","C1-C2":"Ngôn ngữ hình ảnh"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"doc-context-clues"},
            {"kind":"tag","track":"B","ref":"doc-context-clues"},
            {"kind":"tag","track":"B","ref":"doc-synonyms"},
            {"kind":"tag","track":"B","ref":"doc-antonyms"}
          ]
        },
        {
          "key": "re-strategy", "name_vi": "Chiến lược & đọc rộng",
          "desc": {"A1-A2":"Tìm thông tin","B1":"Đọc lướt, đọc tìm","B2":"Đọc nhanh bài dài","C1-C2":"Đọc rộng nhiều thể loại, văn học"},
          "leaves": []
        }
      ]
    },
    {
      "key": "listening", "name_vi": "Nghe", "scale": "cefr",
      "groups": [
        {
          "key": "li-gist-detail", "name_vi": "Ý chính & chi tiết",
          "desc": {"A1-A2":"Thông báo, số, tên","B1":"Clip, radio ngắn","B2":"Bài dài, tốc độ tự nhiên","C1-C2":"Bài giảng, nhiều giọng"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"nghe","related":["A-T1-TEXT-L"]},
            {"kind":"target","track":"A","ref":"A-T1-TEXT-L"}
          ]
        },
        {
          "key": "li-attitude", "name_vi": "Thái độ & hàm ý người nói",
          "desc": {"A1-A2":null,"B1":"Cảm xúc","B2":"Quan điểm, thái độ","C1-C2":"Hàm ý, mỉa mai"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-T2-INFER-L"}
          ]
        },
        {
          "key": "li-argument-notes", "name_vi": "Theo dõi lập luận & ghi chép",
          "desc": {"A1-A2":null,"B1":"Theo trình tự","B2":"Ghi ý chính","C1-C2":"Bài giảng, tranh luận"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-T1-PROCESS-L"},
            {"kind":"target","track":"B","ref":"B-T1-ARG-L"}
          ]
        },
        {
          "key": "li-sound", "name_vi": "Âm & giọng",
          "desc": {"A1-A2":"Nhận âm, số","B1":"Nối âm","B2":"Nhiều giọng khác nhau","C1-C2":"Nói nhanh, khẩu ngữ"},
          "leaves": []
        }
      ]
    },
    {
      "key": "writing", "name_vi": "Viết", "scale": "cefr",
      "groups": [
        {
          "key": "wr-sentence-mech", "name_vi": "Câu, chính tả, dấu câu",
          "desc": {"A1-A2":"Câu đúng trật tự, chính tả","B1":"Câu ghép, câu phức","B2":"Đa dạng kiểu câu","C1-C2":"Câu trau chuốt"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"viet-cau","related":["A-L3-PARA-W"]}
          ]
        },
        {
          "key": "wr-paragraph", "name_vi": "Đoạn & bố cục",
          "desc": {"A1-A2":"Đoạn 5–6 câu","B1":"Mở – thân – kết","B2":"Bài nhiều đoạn","C1-C2":"Bố cục linh hoạt"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L3-PARA-W","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"B","ref":"B-L3-ESSAY-W","level_from":"B2","level_to":"B2"}
          ]
        },
        {
          "key": "wr-cohesion", "name_vi": "Liên kết & mạch lạc",
          "desc": {"A1-A2":"and, because","B1":"first, however","B2":"Từ nối đa dạng, tham chiếu","C1-C2":"Liên kết tinh tế"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"tu-noi-lap-luan","related":["B-T7-ARGUE"]},
            {"kind":"target","track":"A","ref":"A-L3-CAUSE-W","level_from":"A2+","level_to":"A2+"}
          ]
        },
        {
          "key": "wr-genre", "name_vi": "Thể loại",
          "desc": {"A1-A2":"Tin nhắn, email ngắn, kể chuyện","B1":"Thư, truyện, bài nhận xét","B2":"Bài luận, báo cáo, bài báo","C1-C2":"Đề xuất, phê bình, tóm tắt học thuật"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L4-DESC-W","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"A","ref":"A-L8-MESSAGE-W","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"B","ref":"B-L8-EMAIL-W","level_from":"B2","level_to":"B2"}
          ]
        },
        {
          "key": "wr-register", "name_vi": "Văn phong & độ rõ",
          "desc": {"A1-A2":null,"B1":"Thân mật / trang trọng","B2":"Hợp người đọc","C1-C2":"Giọng văn thuyết phục"},
          "leaves": [
            {"kind":"target","track":"B","ref":"B-L4-CLEAR-W","level_from":"B2+","level_to":"B2+"}
          ]
        }
      ]
    },
    {
      "key": "speaking", "name_vi": "Nói", "scale": "cefr",
      "groups": [
        {
          "key": "sp-pron", "name_vi": "Phát âm & ngữ điệu",
          "desc": {"A1-A2":"Âm cuối, trọng âm từ","B1":"Nối âm","B2":"Ngữ điệu, nhấn câu","C1-C2":"Nhấn để tạo nghĩa"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"phat-am"},
            {"kind":"tag","track":"B","ref":"phat-am"},
            {"kind":"target","track":"A","ref":"A-X2-INTELL","level_from":"B1","level_to":"B1"}
          ]
        },
        {
          "key": "sp-fluency", "name_vi": "Trôi chảy & xoay xở",
          "desc": {"A1-A2":"Lượt ngắn, xoay khi thiếu từ","B1":"Nói liền ~1 phút","B2":"Ít ngập ngừng","C1-C2":"Tự nhiên"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-X1-TURN","level_from":"B1","level_to":"B1"},
            {"kind":"target","track":"A","ref":"A-L2-COMPENSATE-S","level_from":"B1","level_to":"B1"}
          ]
        },
        {
          "key": "sp-present", "name_vi": "Trình bày & giải thích",
          "desc": {"A1-A2":"Mô tả, kể","B1":"Giải thích quá trình, lý do","B2":"Trình bày quan điểm có cấu trúc","C1-C2":"Giải thích ý phức tạp"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L3-SEQ-S","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"A","ref":"A-L3-CAUSE-S","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"A","ref":"A-L4-DESC-S","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"A","ref":"A-L4-PROCESS-S","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"B","ref":"B-L3-TALK-S","level_from":"B2","level_to":"B2"},
            {"kind":"target","track":"B","ref":"B-L4-EXPLAIN-S","level_from":"B2+","level_to":"B2+"}
          ]
        },
        {
          "key": "sp-interact", "name_vi": "Tương tác & thảo luận",
          "desc": {"A1-A2":"Hỏi – đáp, đáp lời phù hợp","B1":"Đồng ý / phản đối","B2":"Thảo luận, nối ý người khác","C1-C2":"Tranh luận, thương lượng"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L8-EXCHANGE-S","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"A","ref":"A-L8-DISCUSS-S","level_from":"B1","level_to":"B1"},
            {"kind":"target","track":"B","ref":"B-L8-DISCUSS-S","level_from":"B2","level_to":"B2"}
          ]
        }
      ]
    },
    {
      "key": "thinking", "name_vi": "Tư duy & tự học", "scale": "task_level",
      "groups": [
        {
          "key": "th-cause", "name_vi": "Nguyên nhân & giải thích",
          "desc": {"low":"Nêu 1 nguyên nhân","high":"chuỗi nhiều nguyên nhân có điều kiện"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-T4-CAUSE","task_from":2,"task_to":2},
            {"kind":"target","track":"A","ref":"A-T4-PREDICT","task_from":2,"task_to":2},
            {"kind":"target","track":"B","ref":"B-T4-MECH","task_from":3,"task_to":3},
            {"kind":"target","track":"B","ref":"B-T4-ALT","task_from":4,"task_to":4}
          ]
        },
        {
          "key": "th-argue", "name_vi": "Lập luận & kết luận",
          "desc": {"low":"Nêu ý kiến có lý do","high":"lập luận từ nguồn, kết luận có điều kiện"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-T7-OPINION","task_from":2,"task_to":2},
            {"kind":"target","track":"B","ref":"B-T7-ARGUE","task_from":3,"task_to":3},
            {"kind":"target","track":"B","ref":"B-T7-COUNTER","task_from":4,"task_to":4},
            {"kind":"target","track":"B","ref":"B-T11-QUALIFY","task_from":4,"task_to":4},
            {"kind":"target","track":"B","ref":"B-T11-WEIGH","task_from":4,"task_to":4}
          ]
        },
        {
          "key": "th-evaluate", "name_vi": "Đánh giá nguồn & bằng chứng",
          "desc": {"low":"Phân biệt sự kiện/ý kiến","high":"đánh giá độ tin cậy, giới hạn"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-T5-FACTOP-R","task_from":1,"task_to":1},
            {"kind":"target","track":"B","ref":"B-T5-DATAOP","task_from":3,"task_to":3},
            {"kind":"target","track":"B","ref":"B-T5-SOURCE","task_from":3,"task_to":3},
            {"kind":"target","track":"B","ref":"B-T5-SUPPORT","task_from":3,"task_to":4}
          ]
        },
        {
          "key": "th-synthesis", "name_vi": "Tổng hợp & chuyển tải",
          "desc": {"low":"Kể lại một nguồn","high":"tổng hợp nhiều nguồn, giải thích số liệu, chuyển ý từ tiếng Việt"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L7-RETELL-S"},
            {"kind":"target","track":"A","ref":"A-L7-SUMMARY-W"},
            {"kind":"target","track":"A","ref":"A-T9-COMPARE","task_from":2,"task_to":2},
            {"kind":"target","track":"B","ref":"B-L7-RELAY-W"},
            {"kind":"target","track":"B","ref":"B-L7-DATA"},
            {"kind":"target","track":"B","ref":"B-L7-XLING"},
            {"kind":"target","track":"B","ref":"B-T9-SYNTH","task_from":3,"task_to":3}
          ]
        },
        {
          "key": "th-exam", "name_vi": "Chiến lược làm bài thi",
          "desc": {"low":"Biết dạng đề","high":"quản lý thời gian, loại trừ đáp án"},
          "leaves": []
        },
        {
          "key": "th-self", "name_vi": "Tự học",
          "desc": {"low":"Tự làm không cần nhắc","high":"tự sửa bài, tự đánh giá đúng, dùng được ở chủ đề mới"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-A1-SELFASSESS"},
            {"kind":"target","track":"A","ref":"A-A3-HINTFIX"},
            {"kind":"target","track":"A","ref":"A-A3-REDRAFT"},
            {"kind":"target","track":"A","ref":"A-A5-REUSE"},
            {"kind":"target","track":"B","ref":"B-A1-PLAN"},
            {"kind":"target","track":"B","ref":"B-A3-REVISE"},
            {"kind":"target","track":"B","ref":"B-A5-REUSE"}
          ]
        }
      ]
    }
  ]
}$j$::jsonb;
  v_hash constant text := '22548cc5ce2313eeba7f1b8707192340bde7c7f1405d4ed54e4caa1df76c7030';
begin
  if exists (select 1 from english.skill_maps m where m.id = j ->> 'id' and m.published_at is not null) then
    return;
  end if;

  insert into english.skill_maps(id, title_vi, catalogue_version, assumed, source_hash)
  values (j ->> 'id', j ->> 'title_vi', j ->> 'catalogue_version', j -> 'assumed', v_hash)
  on conflict (id) do nothing;

  insert into english.skill_domains(map_id, key, ord, name_vi, scale)
  select j ->> 'id', d.d ->> 'key', d.ord::int, d.d ->> 'name_vi', d.d ->> 'scale'
  from pg_catalog.jsonb_array_elements(j -> 'domains') with ordinality as d(d, ord)
  on conflict do nothing;

  insert into english.skill_groups(map_id, key, domain_key, ord, name_vi, descriptions)
  select j ->> 'id', g.g ->> 'key', d.d ->> 'key', g.ord::int, g.g ->> 'name_vi', g.g -> 'desc'
  from pg_catalog.jsonb_array_elements(j -> 'domains') as d(d)
  cross join lateral pg_catalog.jsonb_array_elements(d.d -> 'groups') with ordinality as g(g, ord)
  on conflict do nothing;

  insert into english.skill_leaves(map_id, kind, track_id, ref_key, group_key, ord, level_from, level_to, task_from, task_to,
                                   level_note, core, hidden_in_picker, related)
  select j ->> 'id', l.l ->> 'kind', l.l ->> 'track', l.l ->> 'ref', g.g ->> 'key', l.ord::int,
         l.l ->> 'level_from', l.l ->> 'level_to', (l.l ->> 'task_from')::int, (l.l ->> 'task_to')::int, l.l ->> 'level_note',
         coalesce((l.l ->> 'core')::boolean, false), coalesce((l.l ->> 'hidden_in_picker')::boolean, false),
         array(select r.v from pg_catalog.jsonb_array_elements_text(coalesce(l.l -> 'related', '[]'::jsonb)) with ordinality as r(v, n) order by r.n)
  from pg_catalog.jsonb_array_elements(j -> 'domains') as d(d)
  cross join lateral pg_catalog.jsonb_array_elements(d.d -> 'groups') as g(g)
  cross join lateral pg_catalog.jsonb_array_elements(g.g -> 'leaves') with ordinality as l(l, ord)
  on conflict do nothing;

  -- Kiểm trước khi công bố (lỗi = cả migration dừng, không có bản đồ nửa vời).
  if exists (
    select 1 from english.skill_leaves lf
    where lf.map_id = j ->> 'id' and lf.kind = 'target'
      and not exists (select 1 from english.targets t
                      where t.id = lf.ref_key and t.descriptor_version = j ->> 'catalogue_version' and t.track_id = lf.track_id)) then
    raise exception '0019: SM-1 names a catalogue skill that does not exist in catalogue %', j ->> 'catalogue_version';
  end if;
  if exists (
    select 1 from english.skill_leaves lf
    where lf.map_id = j ->> 'id' and lf.kind = 'tag'
      and not exists (select 1 from english.error_tags t
                      where t.track_id = lf.track_id and t.key = lf.ref_key and t.family_id is null)) then
    raise exception '0019: SM-1 names a seed tag that does not exist (apply 0015 and 0018 first)';
  end if;
  if exists (
    select 1 from english.skill_leaves lf
    join english.skill_groups g on g.map_id = lf.map_id and g.key = lf.group_key
    join english.skill_domains dm on dm.map_id = g.map_id and dm.key = g.domain_key
    where lf.map_id = j ->> 'id'
      and ((dm.scale = 'cefr' and lf.task_from is not null) or (dm.scale = 'task_level' and lf.level_from is not null))) then
    raise exception '0019: a leaf uses the other scale than its domain';
  end if;

  update english.skill_maps set published_at = pg_catalog.now()
    where id = j ->> 'id' and published_at is null;
end
$seed$;

insert into english.schema_migrations(version) values ('0019') on conflict do nothing;
