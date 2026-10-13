-- 0004_append_only.sql
-- Hạ tầng append-only + đường purge có kiểm soát (DESIGN §6, FR-21).
-- Idempotent.
--
-- CÁCH GẮN CHO BẢNG MỚI (các lát sau: attempts, artifact_versions, speech_metrics,
-- assistance_events, exposure_log, episodes, observations, validation_decisions,
-- mastery_decisions, published_reports, ai_runs):
--
--   drop trigger if exists <t>_forbid_mutation on english.<t>;
--   create trigger <t>_forbid_mutation
--     before update or delete on english.<t>
--     for each row execute function english.eng_forbid_mutation('learner_id');
--   drop trigger if exists <t>_forbid_truncate on english.<t>;
--   create trigger <t>_forbid_truncate
--     before truncate on english.<t>
--     for each statement execute function english.eng_forbid_mutation();
--   revoke update, delete, truncate on english.<t> from public, anon, authenticated, service_role;
--
-- Tham số trigger = tên cột chứa learner_id của dòng (mặc định 'learner_id').
-- Bảng không có cột learner_id (vd observations → episode) truyền '*' : khi đó trigger
-- chỉ kiểm "đang ở trong eng_purge_learner" và hàm purge tự giới hạn phạm vi xóa.
-- Đồng thời bổ sung lệnh xóa bảng đó vào english.eng_purge_learner() (đúng thứ tự khóa ngoại).

-- Trigger function ------------------------------------------------------------------
create or replace function english.eng_forbid_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_purge text := nullif(current_setting('app.purge_learner', true), '');
  v_col text := coalesce(tg_argv[0], 'learner_id');
  v_owner text;
  v_row_learner text;
begin
  -- TRUNCATE: không bao giờ được phép (purge chỉ xóa dữ liệu của một learner).
  if tg_op = 'TRUNCATE' then
    raise exception 'english.%: TRUNCATE is forbidden on append-only tables', tg_table_name
      using errcode = '42501';
  end if;

  -- UPDATE/DELETE chỉ được khi đang chạy bên trong english.eng_purge_learner():
  --   (1) app.purge_learner đã được đặt (set_config local trong hàm), và
  --   (2) current_user là chủ sở hữu hàm purge (security definer) — người khác tự
  --       `set app.purge_learner = …` rồi xóa vẫn bị chặn, và
  --   (3) dòng bị sửa/xóa thuộc đúng learner đang purge (trừ khi tham số = '*').
  if v_purge is not null then
    select r.rolname into v_owner
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = pg_catalog.to_regprocedure('english.eng_purge_learner(uuid,uuid)');

    if v_owner is not null and current_user = v_owner then
      if v_col = '*' then
        if tg_op = 'DELETE' then return old; end if;
        return new;
      end if;
      v_row_learner := pg_catalog.to_jsonb(old) ->> v_col;
      if v_row_learner is not null and v_row_learner = v_purge then
        if tg_op = 'DELETE' then return old; end if;
        return new;
      end if;
    end if;
  end if;

  raise exception 'english.%: % is forbidden on append-only tables (use english.eng_purge_learner)',
    tg_table_name, tg_op
    using errcode = '42501';
end
$$;

revoke execute on function english.eng_forbid_mutation() from public, anon, authenticated;

-- Purge (FR-21) -------------------------------------------------------------------------
-- Chỉ route server (service role) gọi. Xóa dữ liệu của MỘT learner trong schema english,
-- ghi biên nhận vào audit_log (chỉ có số dòng, không có nội dung đã xóa).
-- Không xóa auth.users (phụ huynh xóa tài khoản trong Supabase Dashboard nếu cần).
-- Backup cũ tự hết hạn sau 30 ngày (DESIGN §14).
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
  n_consents int := 0;
  n_relationships int := 0;
  n_members int := 0;
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

  -- Thứ tự: bảng append-only của các lát sau sẽ được thêm VÀO ĐÂY (trước learners).
  delete from english.audit_log a where a.learner_id = p_learner_id;
  get diagnostics n_audit = row_count;

  delete from english.consents c where c.learner_id = p_learner_id;
  get diagnostics n_consents = row_count;

  delete from english.relationships r where r.learner_id = p_learner_id;
  get diagnostics n_relationships = row_count;

  delete from english.learners l where l.id = p_learner_id;

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
      'consents', n_consents,
      'relationships', n_relationships,
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

-- Gắn cho audit_log (bảng append-only duy nhất có ở S0) --------------------------------
drop trigger if exists audit_log_forbid_mutation on english.audit_log;
create trigger audit_log_forbid_mutation
  before update or delete on english.audit_log
  for each row execute function english.eng_forbid_mutation('learner_id');

drop trigger if exists audit_log_forbid_truncate on english.audit_log;
create trigger audit_log_forbid_truncate
  before truncate on english.audit_log
  for each statement execute function english.eng_forbid_mutation();

revoke update, delete, truncate on english.audit_log from public, anon, authenticated, service_role;

insert into english.schema_migrations(version) values ('0004') on conflict do nothing;
