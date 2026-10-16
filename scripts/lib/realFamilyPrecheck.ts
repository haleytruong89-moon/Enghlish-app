import type { ClientBase } from "pg";
import { REAL_FAMILY_ID, REAL_LEARNER_AN_ID, REAL_LEARNER_NGUYEN_ID, REAL_TARGET_SETS } from "./realFamily";
import { SLOT_LABEL, type Slot } from "./realFamilyInput";

/**
 * Read-only checks the CLI runs BEFORE it creates any auth account. Nothing here writes anywhere.
 */

/**
 * The database must be ready: every migration file on disk recorded in english.schema_migrations (this includes 0005,
 * which defines eng_assign_target_set, and the newest one), the function itself present, and the target sets the real
 * learners get (A-v1 / B-v1) published. Otherwise creating the family would fail halfway, after accounts were created.
 */
export async function checkPrerequisites(client: ClientBase, migrationVersionsOnDisk: readonly string[]): Promise<void> {
  const reg = await client.query<{ exists: boolean }>("select to_regclass('english.schema_migrations') is not null as exists");
  const applied = new Set<string>();
  if (reg.rows[0]?.exists) {
    const res = await client.query<{ version: string }>("select version from english.schema_migrations");
    for (const r of res.rows) applied.add(String(r.version));
  }
  const missing = migrationVersionsOnDisk.filter((v) => !applied.has(v));
  if (missing.length) {
    throw new Error(
      `Database chưa áp đủ migration (còn thiếu: ${missing.join(", ")}) — chạy workflow "Apply migrations" (hoặc \`npm run db:apply\`) trước. Chưa tạo gì.`,
    );
  }

  const fn = await client.query<{ ok: boolean }>(
    "select to_regprocedure('english.eng_assign_target_set(uuid,text)') is not null as ok",
  );
  if (!fn.rows[0]?.ok) throw new Error("Database chưa có hàm gán bộ kỹ năng (migration 0005) — áp migration trước. Chưa tạo gì.");

  const sets = await client.query<{ id: string }>(
    "select id from english.target_set_definitions where id = any($1::text[]) and published_at is not null",
    [REAL_TARGET_SETS],
  );
  const have = new Set(sets.rows.map((r) => r.id));
  const absent = REAL_TARGET_SETS.filter((id) => !have.has(id));
  if (absent.length) {
    throw new Error(`Bộ kỹ năng ${absent.join(", ")} chưa được công bố trong database (migration 0006) — áp migration trước. Chưa tạo gì.`);
  }
}

/**
 * For every slot that is ALREADY filled in the real family (parent, each learner's student account, each learner's
 * tutor: ANY tutor relationship row counts, active, ended or with a future valid_to): the requested email must be the email of the person in place. A different email is refused even when
 * that email has no account yet — otherwise a new auth account would be created for someone who then could never be
 * placed. `emailOfUser` returns the current login email (lower-case) of an auth user id, or null when unknown.
 */
export async function checkRealFamilyEmails(
  client: ClientBase,
  requested: Record<Slot, string>,
  emailOfUser: (userId: string) => Promise<string | null>,
): Promise<void> {
  const bound: Record<Slot, string[]> = { parent: [], studentAn: [], studentNguyen: [], tutorAn: [], tutorNguyen: [] };

  const parents = await client.query<{ user_id: string }>(
    "select user_id from english.members where family_id = $1 and role = 'parent'",
    [REAL_FAMILY_ID],
  );
  bound.parent = parents.rows.map((r) => r.user_id);

  const learners = [
    { id: REAL_LEARNER_AN_ID, student: "studentAn", tutor: "tutorAn" },
    { id: REAL_LEARNER_NGUYEN_ID, student: "studentNguyen", tutor: "tutorNguyen" },
  ] as const;
  for (const l of learners) {
    const student = await client.query<{ user_id: string | null }>(
      "select m.user_id from english.learners l join english.members m on m.id = l.member_id where l.id = $1",
      [l.id],
    );
    bound[l.student] = student.rows.map((r) => r.user_id).filter((u): u is string => !!u);
    const tutors = await client.query<{ user_id: string }>(
      `select m.user_id from english.relationships r join english.members m on m.id = r.member_id
       where r.learner_id = $1 and r.relation = 'tutor'`,
      [l.id],
    );
    bound[l.tutor] = tutors.rows.map((r) => r.user_id);
  }

  for (const slot of Object.keys(bound) as Slot[]) {
    if (!bound[slot].length) continue;
    const emails = await Promise.all(bound[slot].map(emailOfUser));
    if (!emails.some((e) => e === requested[slot])) {
      throw new Error(
        `Chỗ của ${SLOT_LABEL[slot]} trong gia đình thật đã có người, nhưng email bạn nhập khác email của người đó — dừng, chưa tạo tài khoản nào. Đổi người làm riêng, không qua công cụ này.`,
      );
    }
  }
}

export type AuthTriggerWarning = { trigger: string; reason: string };

/**
 * Triggers on auth.users that write to schema public (typically a Launcher "profile" row per new account).
 * Only reads the catalogs. A trigger counts when its function lives in schema public or its body mentions `public.`.
 * Triggers that belong to Supabase itself (functions in auth/extensions/supabase_* schemas, no mention of public) are ignored.
 */
export async function findAuthUsersTriggersWritingPublic(client: ClientBase): Promise<AuthTriggerWarning[]> {
  const reg = await client.query<{ exists: boolean }>("select to_regclass('auth.users') is not null as exists");
  if (!reg.rows[0]?.exists) return [];
  const res = await client.query<{ tgname: string; fn_schema: string; fn_name: string; def: string }>(
    `select t.tgname, n.nspname as fn_schema, p.proname as fn_name, p.prosrc as def
     from pg_trigger t
     join pg_proc p on p.oid = t.tgfoid
     join pg_namespace n on n.oid = p.pronamespace
     where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
     order by t.tgname`,
  );
  const out: AuthTriggerWarning[] = [];
  for (const r of res.rows) {
    if (r.fn_schema === "public") out.push({ trigger: r.tgname, reason: "hàm nằm trong schema public" });
    else if (/\bpublic\s*\./i.test(r.def)) out.push({ trigger: r.tgname, reason: "hàm có ghi/đọc bảng trong schema public" });
  }
  return out;
}

export const LAUNCHER_PROFILE_WARNING = "Launcher có thể tự tạo hồ sơ cho tài khoản mới";
