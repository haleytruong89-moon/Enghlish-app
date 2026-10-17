import type { ClientBase } from "pg";

/**
 * Short login names (english.login_names, migration 0013). Used by the family tools; idempotent; never moves a name
 * from one account to another and never gives an account a second name.
 */

export type LoginNameEntry = {
  /** Wording for messages, e.g. "An" / "gia sư của Nguyên". */
  label: string;
  name: string;
  /** The auth user the name must point at; null = that account does not exist yet (so no row for the name may exist either). */
  userId: string | null;
};

export type LoginNameCheck = { ok: true } | { ok: false; errors: string[] };

/** Read-only. Run BEFORE any account is created: a name that points at someone else, or an account that already has another name, stops the run. */
export async function checkLoginNames(client: ClientBase, entries: readonly LoginNameEntry[]): Promise<LoginNameCheck> {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.name)) errors.push(`Tên đăng nhập "${e.name}" bị dùng cho hai người — mỗi người một tên riêng.`);
    seen.add(e.name);
  }

  const reg = await client.query<{ ok: boolean }>("select to_regclass('english.login_names') is not null as ok");
  if (!reg.rows[0]?.ok) {
    return { ok: false, errors: [...errors, "Database chưa có bảng tên đăng nhập (migration 0013) — áp migration trước. Chưa tạo gì."] };
  }

  for (const e of entries) {
    const byName = await client.query<{ auth_user_id: string }>("select auth_user_id from english.login_names where login_name = $1", [e.name]);
    const holder = byName.rows[0]?.auth_user_id;
    if (holder && holder !== e.userId) {
      errors.push(`Tên đăng nhập "${e.name}" đã dùng cho một tài khoản khác — dừng, chưa tạo gì. Chọn tên khác cho ${e.label}.`);
    }
    if (e.userId) {
      const byUser = await client.query<{ login_name: string }>("select login_name from english.login_names where auth_user_id = $1", [e.userId]);
      const mine = byUser.rows[0]?.login_name;
      if (mine && mine !== e.name) {
        errors.push(`Tài khoản của ${e.label} đã có tên đăng nhập khác ("${mine}") — dừng, không đổi tên qua công cụ này.`);
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export type LoginNameResult = { inserted: string[]; existing: string[]; skipped: string[] };

/**
 * Insert the missing names; names already pointing at the same account are left as they are.
 * Call after the accounts exist. `onConflict: "throw"` (default, the real family) stops on a name or account that is already used
 * for something else; `"skip"` (test data) leaves that name out and lists it in `skipped` as a warning text.
 */
export async function upsertLoginNames(
  client: ClientBase,
  entries: readonly (LoginNameEntry & { userId: string })[],
  options: { onConflict?: "throw" | "skip" } = {},
): Promise<LoginNameResult> {
  const out: LoginNameResult = { inserted: [], existing: [], skipped: [] };
  for (const e of entries) {
    const res = await client.query(
      "insert into english.login_names(login_name, auth_user_id) values ($1, $2) on conflict do nothing",
      [e.name, e.userId],
    );
    if (res.rowCount) {
      out.inserted.push(e.name);
      continue;
    }
    // Nothing inserted: it must be the very same pairing (the pre-check normally stops anything else; this is the safety net).
    const same = await client.query("select 1 from english.login_names where login_name = $1 and auth_user_id = $2", [e.name, e.userId]);
    if (!same.rowCount) {
      const why = `Không gán được tên đăng nhập "${e.name}" cho ${e.label}: tên hoặc tài khoản đã được dùng cho việc khác.`;
      if (options.onConflict === "skip") {
        out.skipped.push(why);
        continue;
      }
      throw new Error(why);
    }
    out.existing.push(e.name);
  }
  return out;
}
