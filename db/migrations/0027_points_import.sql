-- 0027_points_import.sql
-- W3 · Mức điểm kiến thức (PP-0.1) + Bản đồ kiến thức + Nạp bài đã làm
-- (spec docs/superpowers/specs/2026-11-08-tutor-workdesk-design.md §4 W3, §5, §6 W3, §8; luật docs/DOMAIN.md §2, §3, §4, §5.2, §5.3,
--  §6, §7, §8, §9, §13 D-W1/D-W3/D-W5/D-W6/D-W7/D-W8, §14 R1/R2/R5/R8).
--   1. attempts: taken_on (ngày làm thật), support_level (tu_lam/tu_lam_chua/lam_cung_co), source_hash (mã băm file bài, chống trùng);
--      provenance thêm 'imported'. inquiry_templates.kind thêm 'imported' (mẫu riêng của MỘT em, id A-IM-/B-IM-).
--   2. point_policies (RỖNG ở đây; PP-0.1 seed ở 0028 bằng gen:config). point_decisions (chỉ thêm, song song mastery_decisions, khóa
--      theo tag_key) + point_state (dẫn xuất). Engine điểm thuần ở lib/engine/points; hàm SQL kiểm lại mọi luật trước khi ghi.
--   3. import_batches (bài nạp: file bài + file đáp án + ngày + mức hỗ trợ + mã băm + payload AI đọc). eng_create_import (gia sư HOẶC
--      phụ huynh tải — R8) / eng_confirm_import (CHỈ gia sư của em: dựng mẫu imported + 1 lần làm + attempt_auto_checks — R8).
--   4. ai_runs.purpose thêm 'read_answers'; eng_ai_gate / eng_log_ai_run nới purpose.
--   5. eng_purge_learner + eng_purge_preview thêm point_decisions, point_state, import_batches (lần làm imported đã nằm trong attempts).
-- Idempotent; chỉ thêm (expand). Không đụng schema public. Cần 0025 và 0026 đã áp.

do $guard$
begin
  if not exists (select 1 from english.schema_migrations where version = '0026') then
    raise exception '0027 cần 0026_curriculum.sql: hãy áp 0025, 0026 trước rồi áp lại 0027 (missing_0026)' using errcode = 'P0001';
  end if;
end
$guard$;

-- 1. attempts: ngày làm thật, mức hỗ trợ, mã băm file; provenance 'imported' ------------------------------------------------------------
alter table english.attempts add column if not exists taken_on date;
alter table english.attempts add column if not exists support_level text
  check (support_level is null or support_level in ('tu_lam', 'tu_lam_chua', 'lam_cung_co'));
alter table english.attempts add column if not exists source_hash text
  check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$');
-- CHECK inline của 0009 có tên mặc định attempts_provenance_check: thay bằng bản rộng hơn (giữ mọi giá trị cũ + 'imported').
alter table english.attempts drop constraint if exists attempts_provenance_check;
alter table english.attempts add constraint attempts_provenance_check check (
  provenance in ('in_app', 'pasted', 'manual_import', 'tutor_live', 'imported'));
-- Bài nạp bắt buộc có ngày + mức hỗ trợ; bài khác không có hai cột này.
alter table english.attempts drop constraint if exists attempts_imported_shape;
alter table english.attempts add constraint attempts_imported_shape check (
  (provenance = 'imported') = (taken_on is not null and support_level is not null));
create index if not exists attempts_source_hash_idx on english.attempts(learner_id, source_hash) where source_hash is not null;

-- inquiry_templates: thêm kind 'imported' (mẫu riêng MỘT em; id A-IM-/B-IM-; bắt buộc family_id + learner_id như 'studio').
alter table english.inquiry_templates drop constraint if exists inquiry_templates_kind_check;
alter table english.inquiry_templates add constraint inquiry_templates_kind_check check (kind in ('topic', 'studio', 'imported'));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_studio_owner;
alter table english.inquiry_templates add constraint inquiry_templates_studio_owner
  check ((kind in ('studio', 'imported')) = (family_id is not null and learner_id is not null));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_id_check;
alter table english.inquiry_templates add constraint inquiry_templates_id_check check (
  (kind = 'topic' and id ~ '^[AB]-W[0-9]+-[A-Z0-9-]+$')
  or (kind = 'studio' and id ~ '^[AB]-ST-[0-9]{6}$')
  or (kind = 'imported' and id ~ '^[AB]-IM-[0-9]{6}$'));
alter table english.inquiry_templates drop constraint if exists inquiry_templates_target_ids_check;
alter table english.inquiry_templates add constraint inquiry_templates_target_ids_check check (kind in ('studio', 'imported') or cardinality(target_ids) > 0);
create sequence if not exists english.import_template_seq;
revoke all on sequence english.import_template_seq from public, anon, authenticated;

insert into english.schema_migrations(version) values ('0027') on conflict do nothing;
