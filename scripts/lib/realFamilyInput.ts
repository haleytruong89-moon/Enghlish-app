/** Input validation for `npm run db:create-family` (pure: no database, no network). */
import { normalizeLoginName } from "../../lib/auth/loginName";

export type RealFamilyInput = {
  parentEmail: string;
  anEmail: string;
  nguyenEmail: string;
  tutorAnEmail: string;
  tutorAnName: string;
  tutorNguyenEmail: string;
  tutorNguyenName: string;
};

/** The five people (slots) of the real family. */
export type Slot = "parent" | "tutorAn" | "tutorNguyen" | "studentAn" | "studentNguyen";
export const SLOTS: readonly Slot[] = ["parent", "tutorAn", "tutorNguyen", "studentAn", "studentNguyen"];

export const SLOT_LABEL: Record<Slot, string> = {
  parent: "phụ huynh",
  studentAn: "An",
  studentNguyen: "Nguyên",
  tutorAn: "gia sư của An",
  tutorNguyen: "gia sư của Nguyên",
};

/**
 * One temporary-password secret PER slot. A shared password would let one new tutor log in as another, so every
 * account that has to be created needs its own secret, and no two provided secrets may be equal.
 */
export const PASSWORD_ENV: Record<Slot, string> = {
  parent: "NEW_PASSWORD_PARENT",
  studentAn: "NEW_PASSWORD_AN",
  studentNguyen: "NEW_PASSWORD_NGUYEN",
  tutorAn: "NEW_PASSWORD_TUTOR_AN",
  tutorNguyen: "NEW_PASSWORD_TUTOR_NGUYEN",
};

/** Short login names per slot (optional workflow inputs). null = this person gets no login name (the parent by default). */
export type RealFamilyLogins = Record<Slot, string | null>;

export const DEFAULT_LOGIN_NAMES: Record<Slot, string | null> = {
  parent: null,
  studentAn: "an",
  studentNguyen: "nguyen",
  tutorAn: "giasu-an",
  tutorNguyen: "giasu-nguyen",
};

/** Environment variable of each slot's login name. */
export const LOGIN_ENV: Record<Slot, string> = {
  parent: "LOGIN_PARENT",
  studentAn: "LOGIN_AN",
  studentNguyen: "LOGIN_NGUYEN",
  tutorAn: "LOGIN_TUTOR_AN",
  tutorNguyen: "LOGIN_TUTOR_NGUYEN",
};

export type LoginsResult = { ok: true; value: RealFamilyLogins } | { ok: false; errors: string[] };

/**
 * Optional login names. Empty/missing = the default of that slot (the parent has none by default). A name is trimmed and
 * lower-cased and must look like `an` / `giasu-an` (letters, digits, "-"; 2–31 characters). Two people cannot share a name.
 */
export function validateLoginNames(raw: Partial<Record<Slot, string | undefined>>): LoginsResult {
  const errors: string[] = [];
  const value = {} as RealFamilyLogins;
  for (const slot of SLOTS) {
    const typed = (raw[slot] ?? "").trim().toLowerCase();
    if (!typed) {
      value[slot] = DEFAULT_LOGIN_NAMES[slot];
      continue;
    }
    const name = normalizeLoginName(typed);
    if (!name) errors.push(`Tên đăng nhập của ${SLOT_LABEL[slot]} chưa đúng dạng: dùng chữ thường không dấu, số và dấu "-", dài 2–31 ký tự (ví dụ: giasu-an).`);
    value[slot] = name;
  }
  const filled = SLOTS.map((s) => value[s]).filter((v): v is string => !!v);
  if (new Set(filled).size !== filled.length) errors.push("Mỗi người một tên đăng nhập riêng — hai người đang trùng tên.");
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function loginsFromEnv(env: Record<string, string | undefined>): Partial<Record<Slot, string | undefined>> {
  const out: Partial<Record<Slot, string | undefined>> = {};
  for (const slot of SLOTS) out[slot] = env[LOGIN_ENV[slot]] || undefined;
  return out;
}

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

export type SlotPasswords = Partial<Record<Slot, string | undefined>>;

/** Read the per-slot secrets from the environment (empty string = not provided, as GitHub passes unset secrets). */
export function passwordsFromEnv(env: Record<string, string | undefined>): SlotPasswords {
  const out: SlotPasswords = {};
  for (const slot of SLOTS) out[slot] = env[PASSWORD_ENV[slot]] || undefined;
  return out;
}

/**
 * Temporary passwords. A slot's secret is required only when that slot's account must be created; every provided
 * secret must have at least 12 characters, and all provided secrets must differ from each other.
 * Messages name the secret (env name), never its value.
 */
export function checkSlotPasswords(passwords: SlotPasswords, slotsToCreate: readonly Slot[]): string[] {
  const errors: string[] = [];
  for (const slot of slotsToCreate) {
    if (!passwords[slot]) errors.push(`Cần secret ${PASSWORD_ENV[slot]} vì tài khoản của ${SLOT_LABEL[slot]} phải tạo mới.`);
  }
  const provided = SLOTS.filter((s) => passwords[s]);
  for (const slot of provided) {
    if ((passwords[slot] as string).length < MIN_PASSWORD_LENGTH) {
      errors.push(`${PASSWORD_ENV[slot]} phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
    }
  }
  for (let i = 0; i < provided.length; i++) {
    for (let j = i + 1; j < provided.length; j++) {
      const a = provided[i] as Slot;
      const b = provided[j] as Slot;
      if (passwords[a] === passwords[b]) {
        errors.push(`${PASSWORD_ENV[a]} và ${PASSWORD_ENV[b]} đang giống nhau — mỗi người một mật khẩu tạm riêng.`);
      }
    }
  }
  return errors;
}
