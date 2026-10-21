/**
 * npm run db:reset-password → đặt lại mật khẩu cho MỘT thành viên của gia đình (qua Supabase Admin API).
 *
 * Vì sao: tài khoản dùng chung với Study Launcher; app không có "quên mật khẩu". Mật khẩu Launcher cũng đổi theo.
 *
 * Env:
 *   DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (bắt buộc)
 *   RESET_LOGIN      tên đăng nhập ngắn (english.login_names, vd. an) HOẶC email
 *   RESET_PASSWORD   mật khẩu mới, ≥ 12 ký tự (không bao giờ được in ra)
 *   RESET_FAMILY     real (mặc định) hoặc test
 *
 * Thứ tự: kiểm tra đầu vào → đọc (chỉ đọc) tìm tài khoản → từ chối nếu không phải thành viên (english.members) của gia đình đã chọn
 * → đặt mật khẩu → ghi 1 dòng english.audit_log (account.password_reset; không email, không mật khẩu).
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { fetchAllAuthUsers } from "./lib/authUsers";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";
import { maskEmail, RESET_TEXT, resolveAccount, successText, validateResetInput, writePasswordResetAudit, type AuthDirectory } from "./lib/resetPassword";

async function main() {
  const parsed = validateResetInput({
    login: process.env.RESET_LOGIN,
    password: process.env.RESET_PASSWORD,
    family: process.env.RESET_FAMILY,
  });
  if (!parsed.ok) {
    for (const e of parsed.errors) console.error(e);
    process.exit(1);
  }
  const input = parsed.value;

  const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await db.connect();
  try {
    // ---- read-only phase ----
    const byEmail = await fetchAllAuthUsers((params) => admin.auth.admin.listUsers(params));
    const byId = new Map([...byEmail.values()].map((u) => [u.id, { id: u.id, email: u.email }]));
    const auth: AuthDirectory = {
      byEmail: (email) => {
        const u = byEmail.get(email);
        return u ? { id: u.id, email: u.email } : null;
      },
      byId: (id) => byId.get(id) ?? null,
    };

    const found = await resolveAccount(db, input, auth);
    if (!found.ok) {
      console.error(found.message);
      process.exit(1);
    }
    console.log(`Tìm thấy: ${found.role} (${maskEmail(found.email)}) — thuộc gia đình ${input.family === "test" ? "THỬ" : "THẬT"}.`);

    // ---- write phase ----
    const { error } = await admin.auth.admin.updateUserById(found.userId, { password: input.password });
    if (error) {
      console.error(`${RESET_TEXT.supabaseError}: ${error.message}`);
      process.exit(1);
    }

    try {
      await writePasswordResetAudit(db, input.familyId, found.role, input.kind);
    } catch {
      console.error(RESET_TEXT.auditWarning);
    }
    console.log(successText(found.role, maskEmail(found.email)));
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
