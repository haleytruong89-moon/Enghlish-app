import { account } from "@/lib/copy/vi";

export const MIN_NEW_PASSWORD_LENGTH = 12;

export type PasswordCheck = { ok: true } | { ok: false; error: string };

/** The "Đổi mật khẩu" form: the new password twice, at least 12 characters (the same rule as the creation tool). */
export function validateNewPassword(password: string, confirm: string): PasswordCheck {
  if (password.length < MIN_NEW_PASSWORD_LENGTH) return { ok: false, error: account.errorShort };
  if (password !== confirm) return { ok: false, error: account.errorMismatch };
  return { ok: true };
}

/** Friendly text for an error returned by `supabase.auth.updateUser`. Never repeats the raw message (it may echo input). */
export function passwordChangeErrorText(error: { code?: string; status?: number } | null | undefined): string {
  switch (error?.code) {
    case "same_password":
      return account.errorSame;
    case "weak_password":
      return account.errorWeak;
    case "session_not_found":
    case "refresh_token_not_found":
    case "user_not_found":
      return account.errorSession;
    default:
      return error?.status === 401 || error?.status === 403 ? account.errorSession : account.errorGeneric;
  }
}
