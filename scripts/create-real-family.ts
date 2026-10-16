/**
 * npm run db:create-family               → Supabase thật: tìm tài khoản theo email (dùng chung Launcher), tạo thêm
 *                                          tài khoản còn thiếu qua Admin API, rồi tạo gia đình THẬT trong schema english.
 * npm run db:create-family -- --auth=stub → DB local/CI có auth stub: chèn thẳng auth.users (chỉ để thử).
 *
 * Idempotent. Tài khoản đã có KHÔNG bị sửa gì (không đổi mật khẩu, không ghi đè metadata).
 * Không giao bài (phụ huynh giao ở trang "Giao bài"). Không bao giờ in mật khẩu.
 *
 * Thứ tự: kiểm tra đầu vào → đọc tài khoản đã có → kiểm tra mật khẩu → kiểm tra database sẵn sàng → kiểm tra xung đột
 * và email khớp người đã có chỗ → (chỉ khi tất cả qua) tạo tài khoản thiếu → tạo gia đình trong 1 transaction.
 *
 * Env:
 *   DATABASE_URL                                   (bắt buộc)
 *   PARENT_EMAIL, AN_EMAIL, NGUYEN_EMAIL,
 *   TUTOR_AN_EMAIL, TUTOR_AN_NAME,
 *   TUTOR_NGUYEN_EMAIL, TUTOR_NGUYEN_NAME          (bắt buộc)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (chế độ supabase)
 *   NEW_PASSWORD_PARENT, NEW_PASSWORD_AN, NEW_PASSWORD_NGUYEN,
 *   NEW_PASSWORD_TUTOR_AN, NEW_PASSWORD_TUTOR_NGUYEN
 *                                                  (mỗi cái ≥ 12 ký tự, đôi một khác nhau; chỉ bắt buộc cho người PHẢI tạo mới)
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { fetchAllAuthUsers } from "./lib/authUsers";
import { listMigrations } from "./lib/migrate";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";
import { checkRealFamilyConflicts, createRealFamily, REAL_CONSENT_VERSION, REAL_FAMILY_ID, type RealFamilyUsers } from "./lib/realFamily";
import {
  checkPrerequisites,
  checkRealFamilyEmails,
  findAuthUsersTriggersWritingPublic,
  LAUNCHER_PROFILE_WARNING,
} from "./lib/realFamilyPrecheck";
import {
  checkSlotPasswords,
  PASSWORD_ENV,
  passwordsFromEnv,
  SLOT_LABEL,
  SLOTS,
  validateRealFamilyInput,
  type RealFamilyInput,
  type Slot,
  type SlotPasswords,
} from "./lib/realFamilyInput";

const ROLE_TEXT: Record<Slot, string> = {
  parent: "Phụ huynh",
  studentAn: "An",
  studentNguyen: "Nguyên",
  tutorAn: "Gia sư của An",
  tutorNguyen: "Gia sư của Nguyên",
};

const APP_TAG = "learning-os";

function emailsOf(input: RealFamilyInput): Record<Slot, string> {
  return {
    parent: input.parentEmail,
    studentAn: input.anEmail,
    studentNguyen: input.nguyenEmail,
    tutorAn: input.tutorAnEmail,
    tutorNguyen: input.tutorNguyenEmail,
  };
}

/** An account that already exists in auth, and whether this tool made it (user_metadata.app = learning-os). */
type Existing = { id: string; madeByTool: boolean };

type Resolver = {
  existing: Partial<Record<Slot, Existing>>;
  /** Current login email (lower-case) of an auth user id. */
  emailOfUser: (id: string) => Promise<string | null>;
  /** Create the given accounts one by one, calling `onCreated` after each success. Called only after every pre-check passed. */
  create: (slots: Slot[], passwords: SlotPasswords, onCreated: (slot: Slot, id: string) => void) => Promise<void>;
};

async function stubResolver(db: Client, emails: Record<Slot, string>): Promise<Resolver> {
  const real = await db.query(
    `select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users' and column_name = 'aud'`,
  );
  if (real.rowCount) {
    throw new Error("--auth=stub is only for the local/CI stub database, not a real Supabase project");
  }
  // The stub has no metadata column unless a test adds one (same name as the real column).
  const meta = await db.query(
    `select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users' and column_name = 'raw_user_meta_data'`,
  );
  const hasMeta = !!meta.rowCount;

  const existing: Partial<Record<Slot, Existing>> = {};
  for (const slot of SLOTS) {
    const r = await db.query<{ id: string; app: string | null }>(
      hasMeta
        ? "select id, raw_user_meta_data->>'app' as app from auth.users where lower(email) = $1"
        : "select id, null::text as app from auth.users where lower(email) = $1",
      [emails[slot]],
    );
    if (r.rows[0]) existing[slot] = { id: r.rows[0].id, madeByTool: r.rows[0].app === APP_TAG };
  }
  return {
    existing,
    emailOfUser: async (id) => {
      const r = await db.query<{ email: string | null }>("select email from auth.users where id = $1", [id]);
      return r.rows[0]?.email?.toLowerCase() ?? null;
    },
    create: async (slots, _passwords, onCreated) => {
      for (const slot of slots) {
        const r = hasMeta
          ? await db.query<{ id: string }>(
              `insert into auth.users(email, raw_user_meta_data) values ($1, jsonb_build_object('app', $2::text)) returning id`,
              [emails[slot], APP_TAG],
            )
          : await db.query<{ id: string }>("insert into auth.users(email) values ($1) returning id", [emails[slot]]);
        onCreated(slot, (r.rows[0] as { id: string }).id);
      }
    },
  };
}

async function supabaseResolver(emails: Record<Slot, string>): Promise<Resolver> {
  const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const byEmail = await fetchAllAuthUsers((params) => admin.auth.admin.listUsers(params));
  const emailById = new Map([...byEmail.values()].map((u) => [u.id, u.email]));

  const existing: Partial<Record<Slot, Existing>> = {};
  for (const slot of SLOTS) {
    const u = byEmail.get(emails[slot]);
    if (u) existing[slot] = { id: u.id, madeByTool: u.app === APP_TAG };
  }
  return {
    existing,
    emailOfUser: async (id) => emailById.get(id) ?? null,
    create: async (slots, passwords, onCreated) => {
      for (const slot of slots) {
        const { data, error } = await admin.auth.admin.createUser({
          email: emails[slot],
          password: passwords[slot] as string,
          email_confirm: true,
          user_metadata: { app: APP_TAG },
        });
        if (error || !data.user) throw new Error(`createUser (${ROLE_TEXT[slot]}) failed: ${error?.message ?? "no user returned"}`);
        onCreated(slot, data.user.id);
      }
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
  const passwords = passwordsFromEnv(process.env);

  // Accounts this run created. If anything fails after the first one, the message below says so (they stay).
  const createdIds: Partial<Record<Slot, string>> = {};
  const created = () => SLOTS.filter((s) => createdIds[s]);

  const db = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await db.connect();
  try {
    // ---- read-only phase: nothing is written anywhere until all of this passes ----
    const resolver = mode === "stub" ? await stubResolver(db, emails) : await supabaseResolver(emails);
    const toCreate = SLOTS.filter((s) => !resolver.existing[s]);

    const pwErrors = checkSlotPasswords(passwords, toCreate);
    if (pwErrors.length) throw new Error(pwErrors.join("\n"));

    await checkPrerequisites(
      db,
      (await listMigrations()).map((m) => m.version),
    );

    const existingIds: Partial<RealFamilyUsers> = {};
    for (const slot of SLOTS) {
      const e = resolver.existing[slot];
      if (e) existingIds[slot] = e.id;
    }
    await checkRealFamilyConflicts(db, existingIds);
    await checkRealFamilyEmails(db, emails, resolver.emailOfUser);
    const inFamilyBefore = new Set(
      (await db.query<{ user_id: string }>("select user_id from english.members where family_id = $1", [REAL_FAMILY_ID])).rows.map(
        (r) => r.user_id,
      ),
    );

    if (toCreate.length) {
      try {
        const triggers = await findAuthUsersTriggersWritingPublic(db);
        if (triggers.length) {
          console.log(
            `Lưu ý: ${LAUNCHER_PROFILE_WARNING} (trigger ${triggers.map((t) => `${t.trigger}: ${t.reason}`).join("; ")} trên auth.users). ` +
              "Công cụ này không đụng vào schema public — kiểm tra bên Launcher sau khi chạy.",
          );
        }
      } catch {
        console.log("Lưu ý: chưa kiểm tra được trigger trên auth.users — nếu Launcher có hồ sơ riêng cho từng tài khoản, kiểm tra bên Launcher sau khi chạy.");
      }
    }

    // ---- write phase ----
    await resolver.create(toCreate, passwords, (slot, id) => {
      createdIds[slot] = id;
    });
    const users = {} as RealFamilyUsers;
    for (const slot of SLOTS) users[slot] = (resolver.existing[slot]?.id ?? createdIds[slot]) as string;

    const result = await createRealFamily(db, users, { tutorAn: input.tutorAnName, tutorNguyen: input.tutorNguyenName });

    console.log(
      result.inserted > 0
        ? `Đã tạo gia đình THẬT (${result.inserted} dòng mới). Phiên bản thông báo đồng ý: ${REAL_CONSENT_VERSION}.`
        : "Gia đình THẬT đã có đủ từ trước — lần chạy này không đổi gì.",
    );
    for (const note of result.kept) console.log(`  ${note}`);

    for (const slot of SLOTS) {
      const label = ROLE_TEXT[slot].padEnd(18);
      const e = resolver.existing[slot];
      let status: string;
      if (!e) status = `tài khoản tạo mới ở lần chạy này — mật khẩu tạm = secret ${PASSWORD_ENV[slot]}`;
      else if (e.madeByTool && !inFamilyBefore.has(e.id)) {
        status = "tạo ở lần chạy trước bởi công cụ này (metadata app=learning-os, chưa có trong gia đình) — mật khẩu tạm = secret của lần chạy trước";
      } else if (e.madeByTool) status = "tạo bởi công cụ này ở lần chạy trước, đã có trong gia đình";
      else status = "đã có sẵn (dùng chung Launcher)";
      console.log(`  ${label} ${emails[slot]}  ${status}`);
    }
  } catch (err) {
    if (created().length) {
      console.error(
        `CẢNH BÁO: đã tạo ${created().length} tài khoản đăng nhập (${created().map((s) => SLOT_LABEL[s]).join(", ")}) trước khi gặp lỗi. ` +
          "Các tài khoản này vẫn còn; chạy lại sẽ dùng lại chúng, không tạo trùng.",
      );
    }
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
