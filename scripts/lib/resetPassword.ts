import type { ClientBase } from "pg";
import { REAL_FAMILY_ID } from "./realFamily";
import { TEST_FAMILY_ID } from "./seed";

/**
 * Pure helpers + small DB helpers for `npm run db:reset-password` (one family member's password).
 * Nothing here ever prints or stores the password or the full email.
 */

export const MIN_PASSWORD_LENGTH = 12;
export const AUDIT_ACTION = "account.password_reset";

export type LoginKind = "short" | "email";
export type ResetFamily = "real" | "test";

/** Same shape as the check on english.login_names.login_name (migration 0013). */
const SHORT_LOGIN = /^[a-z0-9][a-z0-9-]{1,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

export const RESET_TEXT = {
  loginMissing: "Thiếu tên đăng nhập hoặc email của tài khoản cần đặt lại mật khẩu.",
  loginInvalid: "Tên đăng nhập hoặc email không hợp lệ — tên ngắn chỉ gồm chữ thường, số và dấu gạch ngang (vd. an), hoặc nhập email đầy đủ.",
  passwordShort: `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`,
  passwordSpaces: "Mật khẩu mới không được có khoảng trắng ở đầu hoặc cuối.",
  familyMissing: "Thiếu RESET_FAMILY — phải là real (thật) hoặc test (thử).",
  familyInvalid: "Gia đình phải là real (thật) hoặc test (thử).",
  notFound: "Không tìm thấy tài khoản với tên đăng nhập hoặc email này — không đổi gì.",
  notMember: "Tài khoản này không thuộc gia đình đã chọn trong app — dừng, không đặt lại mật khẩu cho người ngoài (có thể là tài khoản chỉ dùng Launcher).",
  inactive: "Tên đăng nhập của tài khoản này đã bị tắt — dừng, không đặt lại mật khẩu.",
  auditFailed: "Không ghi được dòng nhật ký (audit_log) nên chưa gửi yêu cầu đổi mật khẩu — mật khẩu chưa đổi.",
  supabaseError: "Supabase không đặt lại được mật khẩu",
  maybeNotChanged: "Có thể chưa đổi — thử đăng nhập bằng mật khẩu mới trước khi chạy lại.",
  auditWarning: "Cảnh báo: mật khẩu đã đổi nhưng chưa ghi được dòng nhật ký (audit_log) — báo dev.",
} as const;

/** Printed just BEFORE the Supabase call (the workflow uses it to tell "failed before" from "may have failed during"). */
export const SENDING_MARKER = "Đang gửi yêu cầu đổi mật khẩu lên Supabase…";
/** Printed right AFTER Supabase confirmed. The workflow looks for a line starting with "Đã đổi mật khẩu". */
export const CHANGED_MARKER = "Đã đổi mật khẩu (Supabase đã xác nhận).";

/** Exit codes of `runReset`: 0 done, 1 not done (or maybe not done), 3 password changed but the audit row was not saved. */
export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_CHANGED_NOT_LOGGED = 3;

const ROLE_VI: Record<string, string> = { parent: "phụ huynh", tutor: "gia sư", student: "học sinh" };
export function roleLabel(role: string): string {
  return ROLE_VI[role] ?? role;
}

export function successText(role: string, maskedEmail: string): string {
  return (
    `Đã đặt lại mật khẩu cho ${roleLabel(role)} (${maskedEmail}). ` +
    "Lưu ý: tài khoản dùng chung Study Launcher nên mật khẩu Launcher cũng đổi. Xóa secret RESET_PASSWORD sau khi dùng."
  );
}

/** "email" when the value contains "@", otherwise a short login name. */
export function resolveKind(login: string): LoginKind {
  return login.includes("@") ? "email" : "short";
}

/** "hanh.truong@gmail.com" -> "ha***@gmail.com". Never returns the full local part. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const keep = local.length > 2 ? 2 : 1;
  return `${local.slice(0, keep)}***${domain}`;
}

export function familyIdOf(family: ResetFamily): string {
  return family === "test" ? TEST_FAMILY_ID : REAL_FAMILY_ID;
}

export type ResetInput = {
  /** Normalised: trimmed; lower-case for both kinds (emails are matched case-insensitively). */
  login: string;
  kind: LoginKind;
  password: string;
  family: ResetFamily;
  familyId: string;
};

export type ResetInputCheck = { ok: true; value: ResetInput } | { ok: false; errors: string[] };

export function validateResetInput(raw: { login?: string; password?: string; family?: string }): ResetInputCheck {
  const errors: string[] = [];

  const login = (raw.login ?? "").trim().toLowerCase();
  const kind = resolveKind(login);
  if (!login) errors.push(RESET_TEXT.loginMissing);
  else if (kind === "email" ? !EMAIL.test(login) : !SHORT_LOGIN.test(login)) errors.push(RESET_TEXT.loginInvalid);

  const password = raw.password ?? "";
  if (password.length < MIN_PASSWORD_LENGTH) errors.push(RESET_TEXT.passwordShort);
  else if (password !== password.trim()) errors.push(RESET_TEXT.passwordSpaces);

  const family = (raw.family ?? "").trim().toLowerCase();
  if (family === "") errors.push(RESET_TEXT.familyMissing);
  else if (family !== "real" && family !== "test") errors.push(RESET_TEXT.familyInvalid);

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { login, kind, password, family: family as ResetFamily, familyId: familyIdOf(family as ResetFamily) } };
}

/** Reads the auth users (email lookups are case-insensitive: callers pass the lower-case key). */
export type AuthDirectory = {
  byEmail: (email: string) => { id: string; email: string } | null;
  byId: (id: string) => { id: string; email: string } | null;
};

export type Resolution =
  | { ok: true; userId: string; email: string; role: string }
  | { ok: false; reason: "not_found" | "not_member" | "inactive"; message: string };

/** Auth user id behind a short login name (english.login_names, migration 0013), active or not, or null. */
export async function findUserIdByShortLogin(client: ClientBase, name: string): Promise<string | null> {
  const res = await client.query<{ auth_user_id: string }>("select auth_user_id from english.login_names where login_name = $1", [name]);
  return res.rows[0]?.auth_user_id ?? null;
}

/** True when this account has a short login name that has been switched off (active = false). */
export async function hasInactiveLoginName(client: ClientBase, userId: string): Promise<boolean> {
  const res = await client.query("select 1 from english.login_names where auth_user_id = $1 and not active", [userId]);
  return (res.rowCount ?? 0) > 0;
}

/** Role of the user inside THIS family, or null when they are not a member of it (including members of another family). */
export async function findRoleInFamily(client: ClientBase, userId: string, familyId: string): Promise<string | null> {
  const res = await client.query<{ role: string }>("select role from english.members where user_id = $1 and family_id = $2", [userId, familyId]);
  return res.rows[0]?.role ?? null;
}

/** Read-only: who is this login, and are they a member of the chosen family? */
export async function resolveAccount(client: ClientBase, input: ResetInput, auth: AuthDirectory): Promise<Resolution> {
  const notFound: Resolution = { ok: false, reason: "not_found", message: RESET_TEXT.notFound };

  let user: { id: string; email: string } | null;
  if (input.kind === "email") {
    user = auth.byEmail(input.login);
  } else {
    const id = await findUserIdByShortLogin(client, input.login);
    user = id ? auth.byId(id) : null;
  }
  if (!user) return notFound;

  const role = await findRoleInFamily(client, user.id, input.familyId);
  if (!role) return { ok: false, reason: "not_member", message: RESET_TEXT.notMember };
  // A switched-off login name means the account was deliberately closed: refuse however the account was looked up.
  if (await hasInactiveLoginName(client, user.id)) return { ok: false, reason: "inactive", message: RESET_TEXT.inactive };
  return { ok: true, userId: user.id, email: user.email, role };
}

/** One audit row. Payload has the role and how the person was named — no email, no password, no user id. */
export async function writePasswordResetAudit(
  client: ClientBase,
  familyId: string,
  role: string,
  kind: LoginKind,
  correlationId: string | null = null,
): Promise<void> {
  await client.query(
    `insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload, correlation_id)
     values (null, null, $1, $2, null, $3::jsonb, $4)`,
    [AUDIT_ACTION, familyId, JSON.stringify({ role, login_kind: kind }), correlationId],
  );
}

export type UpdatePassword = (userId: string, password: string) => Promise<{ error: { message: string } | null }>;
export type ResetLog = { info: (line: string) => void; error: (line: string) => void };

async function rollbackQuietly(client: ClientBase): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    // the connection may already be gone; nothing else to undo
  }
}

/**
 * The whole reset, with the Supabase call injected so it can be tested:
 *   resolve (read-only) → begin → audit row → update password → commit.
 * The audit row goes in first, inside the transaction: if the update fails the row is rolled back (no false entry),
 * and if the audit cannot be written the password is never touched. Only a failed COMMIT after a successful update
 * leaves the password changed without a log row (exit 3).
 * Returns the process exit code (0 / 1 / 3). Never logs the password or the full email.
 */
export async function runReset(
  db: ClientBase,
  input: ResetInput,
  auth: AuthDirectory,
  updatePassword: UpdatePassword,
  log: ResetLog = { info: (l) => console.log(l), error: (l) => console.error(l) },
  opts: { runId?: string | null } = {},
): Promise<number> {
  const found = await resolveAccount(db, input, auth);
  if (!found.ok) {
    log.error(found.message);
    return EXIT_FAILED;
  }
  const masked = maskEmail(found.email);
  log.info(`Tìm thấy: ${roleLabel(found.role)} (${masked}) — thuộc gia đình ${input.family === "test" ? "THỬ" : "THẬT"}.`);

  try {
    await db.query("begin");
    await writePasswordResetAudit(db, input.familyId, found.role, input.kind, opts.runId || null);
  } catch {
    await rollbackQuietly(db);
    log.error(RESET_TEXT.auditFailed);
    return EXIT_FAILED;
  }

  log.info(SENDING_MARKER);
  let failure: string | null = null;
  try {
    const { error } = await updatePassword(found.userId, input.password);
    if (error) failure = error.message;
  } catch (err) {
    failure = (err as Error).message;
  }
  if (failure !== null) {
    await rollbackQuietly(db);
    log.error(`${RESET_TEXT.supabaseError}: ${failure.split(input.password).join("***")}`);
    log.error(RESET_TEXT.maybeNotChanged);
    return EXIT_FAILED;
  }
  log.info(CHANGED_MARKER);

  try {
    await db.query("commit");
  } catch {
    await rollbackQuietly(db);
    log.error(RESET_TEXT.auditWarning);
    return EXIT_CHANGED_NOT_LOGGED;
  }
  log.info(successText(found.role, masked));
  return EXIT_OK;
}
