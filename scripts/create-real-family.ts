/**
 * npm run db:create-family               → Supabase thật: tìm tài khoản theo email (dùng chung Launcher), tạo thêm
 *                                          tài khoản còn thiếu qua Admin API, rồi tạo gia đình THẬT trong schema english.
 * npm run db:create-family -- --auth=stub → DB local/CI có auth stub: chèn thẳng auth.users (chỉ để thử).
 *
 * Idempotent. Tài khoản đã có KHÔNG bị sửa gì (không đổi mật khẩu, không ghi đè metadata).
 * Không giao bài (phụ huynh giao ở trang "Giao bài"). Không bao giờ in mật khẩu.
 *
 * Env:
 *   DATABASE_URL                                   (bắt buộc)
 *   PARENT_EMAIL, AN_EMAIL, NGUYEN_EMAIL,
 *   TUTOR_AN_EMAIL, TUTOR_AN_NAME,
 *   TUTOR_NGUYEN_EMAIL, TUTOR_NGUYEN_NAME          (bắt buộc)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (chế độ supabase)
 *   NEW_ACCOUNT_TEMP_PASSWORD                      (≥ 12 ký tự; chỉ cần khi có tài khoản phải tạo mới)
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";
import { checkRealFamilyConflicts, createRealFamily, REAL_CONSENT_VERSION, type RealFamilyUsers } from "./lib/realFamily";
import { checkTempPassword, validateRealFamilyInput, type RealFamilyInput } from "./lib/realFamilyInput";

const KEYS = ["parent", "tutorAn", "tutorNguyen", "studentAn", "studentNguyen"] as const satisfies readonly (keyof RealFamilyUsers)[];

const ROLE_TEXT: Record<keyof RealFamilyUsers, string> = {
  parent: "Phụ huynh",
  studentAn: "An",
  studentNguyen: "Nguyên",
  tutorAn: "Gia sư của An",
  tutorNguyen: "Gia sư của Nguyên",
};

function emailsOf(input: RealFamilyInput): Record<keyof RealFamilyUsers, string> {
  return {
    parent: input.parentEmail,
    studentAn: input.anEmail,
    studentNguyen: input.nguyenEmail,
    tutorAn: input.tutorAnEmail,
    tutorNguyen: input.tutorNguyenEmail,
  };
}

/** Which of the five emails already have an auth user (lower-case lookup). Returns ids of existing ones only. */
type Resolver = {
  existing: Partial<RealFamilyUsers>;
  /** Create every missing account. Called only after the conflict pre-check passed. */
  createMissing: () => Promise<RealFamilyUsers>;
};

async function stubResolver(db: Client, emails: Record<keyof RealFamilyUsers, string>): Promise<Resolver> {
  const real = await db.query(
    `select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users' and column_name = 'aud'`,
  );
  if (real.rowCount) {
    throw new Error("--auth=stub is only for the local/CI stub database, not a real Supabase project");
  }
  const existing: Partial<RealFamilyUsers> = {};
  for (const key of KEYS) {
    const r = await db.query<{ id: string }>("select id from auth.users where lower(email) = $1", [emails[key]]);
    if (r.rows[0]) existing[key] = r.rows[0].id;
  }
  return {
    existing,
    createMissing: async () => {
      const out = { ...existing } as RealFamilyUsers;
      for (const key of KEYS) {
        if (out[key]) continue;
        const r = await db.query<{ id: string }>("insert into auth.users(email) values ($1) returning id", [emails[key]]);
        out[key] = (r.rows[0] as { id: string }).id;
      }
      return out;
    },
  };
}

async function supabaseResolver(emails: Record<keyof RealFamilyUsers, string>): Promise<Resolver> {
  const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const byEmail = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 200) break;
  }

  const existing: Partial<RealFamilyUsers> = {};
  for (const key of KEYS) {
    const id = byEmail.get(emails[key]);
    if (id) existing[key] = id;
  }
  return {
    existing,
    createMissing: async () => {
      const missing = KEYS.filter((k) => !existing[k]);
      const problem = checkTempPassword(process.env.NEW_ACCOUNT_TEMP_PASSWORD, missing.length);
      if (problem) throw new Error(problem);
      const password = process.env.NEW_ACCOUNT_TEMP_PASSWORD as string;
      const out = { ...existing } as RealFamilyUsers;
      for (const key of missing) {
        const { data, error } = await admin.auth.admin.createUser({
          email: emails[key],
          password,
          email_confirm: true,
          user_metadata: { app: "learning-os" },
        });
        if (error || !data.user) throw new Error(`createUser (${ROLE_TEXT[key]}) failed: ${error?.message ?? "no user returned"}`);
        out[key] = data.user.id;
      }
      return out;
    },
  };
}

async function main() {
  const mode = process.argv.find((a) => a.startsWith("--auth="))?.split("=")[1] ?? "supabase";
  const parsed = validateRealFamilyInput({
    parentEmail: process.env.PARENT_EMAIL,
    anEmail: process.env.AN_EMAIL,
    nguyenEmail: process.env.NGUYEN_EMAIL,
    tutorAnEmail: process.env.TUTOR_AN_EMAIL,
    tutorAnName: process.env.TUTOR_AN_NAME,
    tutorNguyenEmail: process.env.TUTOR_NGUYEN_EMAIL,
    tutorNguyenName: process.env.TUTOR_NGUYEN_NAME,
  });
  if (!parsed.ok) {
    for (const e of parsed.errors) console.error(e);
    process.exit(1);
  }
  const input = parsed.value;
  const emails = emailsOf(input);

  const db = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await db.connect();
  try {
    const resolver = mode === "stub" ? await stubResolver(db, emails) : await supabaseResolver(emails);
    const needNew = KEYS.filter((k) => !resolver.existing[k]);
    const pwProblem = mode === "stub" ? null : checkTempPassword(process.env.NEW_ACCOUNT_TEMP_PASSWORD, needNew.length);
    if (pwProblem) throw new Error(pwProblem);

    // Nothing is written anywhere until this passes (so a refusal never leaves new auth users behind).
    await checkRealFamilyConflicts(db, resolver.existing);

    const users = await resolver.createMissing();
    const result = await createRealFamily(db, users, { tutorAn: input.tutorAnName, tutorNguyen: input.tutorNguyenName });

    console.log(
      result.inserted > 0
        ? `Đã tạo gia đình THẬT (${result.inserted} dòng mới). Phiên bản thông báo đồng ý: ${REAL_CONSENT_VERSION}.`
        : "Gia đình THẬT đã có đủ từ trước — lần chạy này không đổi gì.",
    );
    for (const key of KEYS) {
      const label = ROLE_TEXT[key].padEnd(18);
      const created = mode === "stub" ? "tạo mới (stub)" : "tạo mới — mật khẩu tạm = secret NEW_ACCOUNT_TEMP_PASSWORD";
      const status = resolver.existing[key] ? "đã có tài khoản (dùng chung Launcher)" : created;
      console.log(`  ${label} ${emails[key]}  ${status}`);
    }
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
