/**
 * npm run db:seed-dev            → Supabase thật: tạo 5 tài khoản THỬ qua Admin API + dữ liệu english
 * npm run db:seed-dev -- --auth=stub → DB local/CI có auth stub: chèn thẳng auth.users
 *
 * Chỉ tạo gia đình THỬ (is_test = true). Không bao giờ tạo learner thật.
 *
 * Env:
 *   DATABASE_URL                     (bắt buộc)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_DEV_PASSWORD (chế độ supabase)
 *   SEED_EMAIL_DOMAIN                (tùy chọn, mặc định example.com)
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { DESTINATION_FRAME_FILE, importFrameFile } from "./lib/frameImport";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";
import { assignDevInquiries, SEED_ACCOUNTS, seedDevReviewWork, seedTestFamily, type SeedUsers } from "./lib/seed";

const domain = process.env.SEED_EMAIL_DOMAIN || "example.com";
const emailFor = (local: string) => `eng-test-${local}@${domain}`;
const keys = Object.keys(SEED_ACCOUNTS) as (keyof SeedUsers)[];

async function stubUsers(db: Client): Promise<SeedUsers> {
  const real = await db.query(
    `select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users' and column_name = 'aud'`,
  );
  if (real.rowCount) {
    throw new Error("--auth=stub is only for the local/CI stub database, not a real Supabase project");
  }
  const out = {} as SeedUsers;
  for (const key of keys) {
    const email = emailFor(SEED_ACCOUNTS[key].emailLocal);
    const res = await db.query<{ id: string }>(
      `insert into auth.users(email) values ($1)
       on conflict (email) do update set email = excluded.email returning id`,
      [email],
    );
    out[key] = (res.rows[0] as { id: string }).id;
  }
  return out;
}

async function supabaseUsers(): Promise<SeedUsers> {
  const password = requireEnv("SEED_DEV_PASSWORD");
  if (password.length < 12) throw new Error("SEED_DEV_PASSWORD must be at least 12 characters");
  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const byEmail = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 200) break;
  }

  const out = {} as SeedUsers;
  for (const key of keys) {
    const email = emailFor(SEED_ACCOUNTS[key].emailLocal);
    const existing = byEmail.get(email.toLowerCase());
    if (existing) {
      out[key] = existing;
      continue;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { app: "learning-os", is_test: true },
    });
    if (error || !data.user) throw new Error(`createUser ${email} failed: ${error?.message}`);
    out[key] = data.user.id;
  }
  return out;
}

async function main() {
  const mode = process.argv.find((a) => a.startsWith("--auth="))?.split("=")[1] ?? "supabase";
  const db = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await db.connect();
  try {
    const users = mode === "stub" ? await stubUsers(db) : await supabaseUsers();
    const result = await seedTestFamily(db, users);
    console.log("Đã tạo gia đình THỬ:", result.familyId);
    for (const r of await assignDevInquiries(db, result)) {
      console.log(
        r.instanceId
          ? `  Đã giao ${r.template} cho em thử (${r.learner})`
          : `  Chưa giao ${r.template} (${r.skipped ?? "bỏ qua"})`,
      );
    }
    const review = await seedDevReviewWork(db, result, users);
    console.log(
      review.attemptId
        ? "  An (thử) đã nộp 1 bài viết luyện tập (A-W4-PLANETS, bước 7) để thử màn Duyệt bài"
        : `  Chưa tạo bài mẫu để duyệt (${review.skipped ?? "bỏ qua"})`,
    );
    // S5b-1: the Destination U1–12 test frame (no question text), so "Ghi kết quả bài → Đề có khung" can be tried on the preview.
    try {
      const frame = await importFrameFile(db, result.familyId, DESTINATION_FRAME_FILE);
      console.log(`  Khung đề mẫu cho Nguyên (thử): ${frame.title} (${frame.action === "unchanged" ? "đã có" : "đã nhập"})`);
    } catch (err) {
      console.log(`  Chưa nhập khung đề mẫu (${(err as Error).message.split("\n")[0]})`);
    }
    for (const key of keys) {
      console.log(
        `  ${SEED_ACCOUNTS[key].role.padEnd(7)} ${emailFor(SEED_ACCOUNTS[key].emailLocal)}  (tên đăng nhập: ${SEED_ACCOUNTS[key].loginName})`,
      );
    }
    if (mode !== "stub") console.log("Mật khẩu: giá trị SEED_DEV_PASSWORD bạn đã đặt (không in ra đây).");
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
