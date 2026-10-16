/** Input validation for `npm run db:create-family` (pure: no database, no network). */

export type RealFamilyInput = {
  parentEmail: string;
  anEmail: string;
  nguyenEmail: string;
  tutorAnEmail: string;
  tutorAnName: string;
  tutorNguyenEmail: string;
  tutorNguyenName: string;
};

export type RealFamilyRawInput = { [K in keyof RealFamilyInput]?: string | undefined };

const FIELD_LABELS: Record<keyof RealFamilyInput, string> = {
  parentEmail: "email phụ huynh",
  anEmail: "email của An",
  nguyenEmail: "email của Nguyên",
  tutorAnEmail: "email gia sư của An",
  tutorAnName: "tên gia sư của An",
  tutorNguyenEmail: "email gia sư của Nguyên",
  tutorNguyenName: "tên gia sư của Nguyên",
};

const EMAIL_KEYS = ["parentEmail", "anEmail", "nguyenEmail", "tutorAnEmail", "tutorNguyenEmail"] as const;
const NAME_KEYS = ["tutorAnName", "tutorNguyenName"] as const;

// Deliberately simple: one "@", no spaces, a dot in the domain. Supabase does the real check.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
export const MAX_NAME_LENGTH = 60;
export const MIN_PASSWORD_LENGTH = 12;

export type ValidationResult =
  | { ok: true; value: RealFamilyInput }
  | { ok: false; errors: string[] };

/** Trim, lower-case the emails, and report every problem at once (Vietnamese, for the workflow summary). */
export function validateRealFamilyInput(raw: RealFamilyRawInput): ValidationResult {
  const errors: string[] = [];
  const value = {} as RealFamilyInput;

  for (const key of EMAIL_KEYS) {
    const v = (raw[key] ?? "").trim().toLowerCase();
    if (!v) errors.push(`Thiếu ${FIELD_LABELS[key]}.`);
    else if (v.length > 254 || !EMAIL_RE.test(v)) errors.push(`${FIELD_LABELS[key]} không đúng dạng email.`);
    value[key] = v;
  }

  for (const key of NAME_KEYS) {
    const v = (raw[key] ?? "").trim().replace(/\s+/g, " ");
    if (!v) errors.push(`Thiếu ${FIELD_LABELS[key]}.`);
    else if (v.length > MAX_NAME_LENGTH) errors.push(`${FIELD_LABELS[key]} dài quá ${MAX_NAME_LENGTH} ký tự.`);
    else if (CONTROL_CHARS.test(v)) errors.push(`${FIELD_LABELS[key]} có ký tự không hợp lệ.`);
    value[key] = v;
  }

  const filled = EMAIL_KEYS.map((k) => value[k]).filter(Boolean);
  if (new Set(filled).size !== filled.length) {
    errors.push("5 email phải khác nhau (mỗi người một tài khoản riêng).");
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/** The temporary password is only needed when at least one account has to be created. */
export function checkTempPassword(password: string | undefined, accountsToCreate: number): string | null {
  if (accountsToCreate === 0) return null;
  if (!password) return "Cần secret NEW_ACCOUNT_TEMP_PASSWORD vì có tài khoản phải tạo mới.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `NEW_ACCOUNT_TEMP_PASSWORD phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  }
  return null;
}
