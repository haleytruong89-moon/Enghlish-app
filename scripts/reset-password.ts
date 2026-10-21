/**
 * npm run db:reset-password → đặt lại mật khẩu cho MỘT thành viên của gia đình (qua Supabase Admin API).
 *
 * Vì sao: tài khoản dùng chung với Study Launcher; app không có "quên mật khẩu". Mật khẩu Launcher cũng đổi theo.
 *
 * Env:
 *   DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (bắt buộc)
 *   RESET_LOGIN      tên đăng nhập ngắn (english.login_names, vd. an) HOẶC email
 *   RESET_PASSWORD   mật khẩu mới, ≥ 12 ký tự (không bao giờ được in ra)
 *   RESET_FAMILY     real hoặc test (bắt buộc, không có mặc định)
 *
 * Thứ tự: kiểm tra đầu vào → đọc (chỉ đọc) tìm tài khoản → từ chối nếu không phải thành viên (english.members) của gia đình đã chọn
 * hoặc tên đăng nhập đã bị tắt → begin → ghi 1 dòng english.audit_log (account.password_reset; không email, không mật khẩu)
 * → đặt mật khẩu → commit. Đặt mật khẩu lỗi thì rollback (không có dòng nhật ký giả).
 * Mã thoát: 0 xong · 1 chưa xong (hoặc có thể chưa đổi, xem dòng báo lỗi) · 3 mật khẩu ĐÃ đổi nhưng commit nhật ký lỗi.
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { fetchAllAuthUsers } from "./lib/authUsers";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";
import { runReset, validateResetInput, type AuthDirectory } from "./lib/resetPassword";

async function main(): Promise<number> {
  const parsed = validateResetInput({
    login: process.env.RESET_LOGIN,
    password: process.env.RESET_PASSWORD,
    family: process.env.RESET_FAMILY,
  });
  if (!parsed.ok) {
    for (const e of parsed.errors) console.error(e);
    return 1;
  }
  const input = parsed.value;

  const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await db.connect();
  try {
    const byEmail = await fetchAllAuthUsers((params) => admin.auth.admin.listUsers(params));
    const byId = new Map([...byEmail.values()].map((u) => [u.id, { id: u.id, email: u.email }]));
    const auth: AuthDirectory = {
      byEmail: (email) => {
        const u = byEmail.get(email);
        return u ? { id: u.id, email: u.email } : null;
      },
      byId: (id) => byId.get(id) ?? null,
    };
    return await runReset(
      db,
      input,
      auth,
      async (userId, password) => {
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        return { error };
      },
      undefined,
      { runId: process.env.GITHUB_RUN_ID },
    );
  } finally {
    try {
      await db.end();
    } catch {
      // closing a broken connection must not hide the result
    }
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  },
);
