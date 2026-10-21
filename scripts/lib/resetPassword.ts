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
  familyInvalid: "Gia đình phải là real (thật) hoặc test (thử).",
  notFound: "Không tìm thấy tài khoản với tên đăng nhập hoặc email này — không đổi gì.",
  notMember: "Tài khoản này không thuộc gia đình đã chọn trong app — dừng, không đặt lại mật khẩu cho người ngoài (có thể là tài khoản chỉ dùng Launcher).",
  supabaseError: "Supabase không đặt lại được mật khẩu",
  auditWarning: "Cảnh báo: mật khẩu đã đổi nhưng chưa ghi được dòng nhật ký (audit_log).",
} as const;

export function successText(role: string, maskedEmail: string): string {
  return (
    `Đã đặt lại mật khẩu cho ${role} (${maskedEmail}). ` +
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

  const familyText = (raw.family ?? "").trim().toLowerCase();
  const family = familyText === "" ? "real" : familyText;
  if (family !== "real" && family !== "test") errors.push(RESET_TEXT.familyInvalid);

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
  | { ok: false; reason: "not_found" | "not_member"; message: string };

/** Auth user id behind an ACTIVE short login name (english.login_names, migration 0013), or null. */
export async function findUserIdByShortLogin(client: ClientBase, name: string): Promise<string | null> {
  const res = await client.query<{ auth_user_id: string }>(
    "select auth_user_id from english.login_names where login_name = $1 and active",
    [name],
  );
  return res.rows[0]?.auth_user_id ?? null;
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
  return { ok: true, userId: user.id, email: user.email, role };
}

/** One audit row. Payload has the role and how the person was named — no email, no password, no user id. */
export async function writePasswordResetAudit(client: ClientBase, familyId: string, role: string, kind: LoginKind): Promise<void> {
  await client.query(
    `insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
     values (null, null, $1, $2, null, $3::jsonb)`,
    [AUDIT_ACTION, familyId, JSON.stringify({ role, login_kind: kind })],
  );
}
