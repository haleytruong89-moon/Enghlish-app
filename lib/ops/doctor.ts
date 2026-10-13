/**
 * Setup doctor — pure checks for the cloud setup (PROGRESS "Phụ huynh cần làm").
 *
 * Everything here takes injected `query` / `fetch`, so it is unit-testable and has
 * no side effects. Output is Vietnamese (ops tool for the parent, not app UI).
 * Rules: never return secret values; hosts are shown without user/password.
 */

export type Status = "ok" | "fail" | "skip" | "info";

export type CheckResult = {
  id: string;
  status: Status;
  label: string;
  /** Short, secret-free detail (e.g. list of offenders). */
  detail?: string;
  /** One-line fix hint, shown for fail. */
  hint?: string;
};

export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{ status: number; text: () => Promise<string> }>;

export type Env = Record<string, string | undefined>;

/** Highest Postgres major version that the backup workflow's pg_dump can read. */
export const MAX_PG_MAJOR = 17;

/** Tables that exist in Launcher's `public` on purpose, even though we use the same names. */
export const LAUNCHER_OWN_TABLES = ["families", "audit_log", "profiles"];

const present = (v: string | undefined): v is string => typeof v === "string" && v.trim() !== "";

// ---------------------------------------------------------------------------
// Masking
// ---------------------------------------------------------------------------

/**
 * Remove secrets from any text before it is shown: exact secret values, and the
 * user:password part of any URL (`scheme://user:pass@host` → `scheme://***@host`).
 */
export function maskSecrets(text: string, secrets: Array<string | undefined> = []): string {
  let out = text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, "$1***@");
  for (const s of secrets) {
    if (present(s) && s.length >= 4) out = out.split(s).join("***");
  }
  return out;
}

/** Host (and port) of a connection string, without user/password. Never throws. */
export function safeHost(databaseUrl: string | undefined): string {
  if (!present(databaseUrl)) return "?";
  try {
    return new URL(databaseUrl).host || "?";
  } catch {
    return "?";
  }
}

/** Secret values in `env` that must never be printed. */
export function secretValues(env: Env): string[] {
  return [
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.DATABASE_URL,
    env.BACKUP_AGE_RECIPIENT,
    env.SEED_DEV_PASSWORD,
    env.DATABASE_CA_CERT,
  ].filter(present);
}

// ---------------------------------------------------------------------------
// 1. Environment
// ---------------------------------------------------------------------------

export const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "DATABASE_URL"] as const;

export function checkEnv(env: Env): CheckResult[] {
  const results: CheckResult[] = [];

  const missing = REQUIRED_ENV.filter((k) => !present(env[k]));
  results.push(
    missing.length === 0
      ? { id: "env", status: "ok", label: "Có đủ 3 biến môi trường cần thiết" }
      : {
          id: "env",
          status: "fail",
          label: "Thiếu biến môi trường",
          detail: missing.join(", "),
          hint: "Thêm các dòng này vào file .env.local (hoặc Variables/Secrets của repo trên GitHub) — xem PROGRESS bước 5, 7.",
        },
  );

  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (present(service)) {
    const leaked = Object.keys(env)
      .filter((k) => k.startsWith("NEXT_PUBLIC_") && env[k] === service)
      .sort();
    results.push(
      leaked.length === 0
        ? { id: "env-leak", status: "ok", label: "Khóa service_role không nằm trong biến NEXT_PUBLIC_*" }
        : {
            id: "env-leak",
            status: "fail",
            label: "Khóa service_role bị đặt vào biến công khai",
            detail: leaked.join(", "),
            hint: "Biến NEXT_PUBLIC_* phải là khóa anon; đổi (rotate) service_role key trên Supabase vì nó đã lộ.",
          },
    );
  } else {
    results.push({
      id: "env-leak",
      status: "skip",
      label: "Khóa service_role không bị lộ vào NEXT_PUBLIC_*",
      detail: "chưa có SUPABASE_SERVICE_ROLE_KEY (không bắt buộc)",
    });
  }

  results.push({
    id: "env-service",
    status: "info",
    label: "SUPABASE_SERVICE_ROLE_KEY (không bắt buộc)",
    detail: present(service) ? "đã có" : "chưa có — chỉ cần khi chạy db:seed-dev hoặc chạy app",
  });

  results.push({
    id: "env-real",
    status: "info",
    label: "ALLOW_REAL_LEARNERS",
    detail: present(env.ALLOW_REAL_LEARNERS) ? env.ALLOW_REAL_LEARNERS : "chưa đặt (mặc định: chỉ learner thử)",
  });

  return results;
}

// ---------------------------------------------------------------------------
// 2–6, 9. Database
// ---------------------------------------------------------------------------

/** A live connection, a connection error (already masked), or null when DATABASE_URL is missing. */
export type DbHandle = { query: Query } | { error: string } | null;

const skip = (id: string, label: string, why: string): CheckResult => ({ id, status: "skip", label, detail: why });

function queryOf(db: DbHandle): { q: Query } | { why: string } {
  if (db === null) return { why: "chưa có DATABASE_URL" };
  if ("error" in db) return { why: "chưa kết nối được database" };
  return { q: db.query };
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const CONNECT_HINT =
  "Dùng chuỗi Session pooler (cổng 5432) ở Supabase → Project Settings → Database; kiểm tra lại mật khẩu.";

export async function checkDbConnect(db: DbHandle, host: string): Promise<CheckResult> {
  const label = "Kết nối được database";
  if (db === null) return skip("db", label, "chưa có DATABASE_URL");
  if ("error" in db) return { id: "db", status: "fail", label, detail: db.error, hint: CONNECT_HINT };
  try {
    await db.query("select 1");
    return { id: "db", status: "ok", label, detail: `máy chủ ${host}` };
  } catch (err) {
    return { id: "db", status: "fail", label, detail: errText(err), hint: CONNECT_HINT };
  }
}

export async function checkMigrations(db: DbHandle, fileVersions: string[]): Promise<CheckResult> {
  const label = `Đã áp đủ migration (${fileVersions.length} file)`;
  const h = queryOf(db);
  if ("why" in h) return skip("migrations", label, h.why);
  try {
    const reg = await h.q("select to_regclass('english.schema_migrations') is not null as exists");
    let applied = new Set<string>();
    if (reg.rows[0]?.exists === true) {
      const res = await h.q("select version from english.schema_migrations");
      applied = new Set(res.rows.map((r) => String(r.version)));
    }
    const missing = fileVersions.filter((v) => !applied.has(v));
    return missing.length === 0
      ? { id: "migrations", status: "ok", label }
      : {
          id: "migrations",
          status: "fail",
          label,
          detail: `còn thiếu: ${missing.join(", ")}`,
          hint: "Chạy `npm run db:apply` (hoặc dán file SQL tương ứng vào SQL Editor) — xem PROGRESS bước 6.",
        };
  } catch (err) {
    return { id: "migrations", status: "fail", label, detail: errText(err), hint: "Chạy `npm run db:apply`." };
  }
}

export async function checkRls(db: DbHandle): Promise<CheckResult> {
  const label = "Mọi bảng trong schema english đều bật RLS";
  const h = queryOf(db);
  if ("why" in h) return skip("rls", label, h.why);
  try {
    const res = await h.q(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'english' and c.relkind in ('r','p') and not c.relrowsecurity
       order by 1`,
    );
    const bad = res.rows.map((r) => String(r.relname));
    return bad.length === 0
      ? { id: "rls", status: "ok", label }
      : {
          id: "rls",
          status: "fail",
          label,
          detail: `chưa bật RLS: ${bad.join(", ")}`,
          hint: "Chạy `alter table english.<tên bảng> enable row level security;` rồi nhờ dev thêm policy (đừng để bảng mở).",
        };
  } catch (err) {
    return { id: "rls", status: "fail", label, detail: errText(err), hint: "Kiểm tra đã áp migration chưa (`npm run db:apply`)." };
  }
}

export async function checkPublicClean(db: DbHandle): Promise<CheckResult> {
  const label = "Không có hàm/bảng của app này nằm trong schema public (an toàn cho Launcher)";
  const h = queryOf(db);
  if ("why" in h) return skip("public-clean", label, h.why);
  try {
    const fns = await h.q(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'eng\\_%' order by 1`,
    );
    // A table of ours = same name as a table in english, except names Launcher owns on purpose.
    const tabs = await h.q(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r','p')
         and c.relname in (
           select e.relname from pg_class e join pg_namespace en on en.oid = e.relnamespace
           where en.nspname = 'english' and e.relkind in ('r','p'))
         and not (c.relname = any($1::text[]))
       order by 1`,
      [LAUNCHER_OWN_TABLES],
    );
    const parts: string[] = [];
    if (fns.rows.length) parts.push(`hàm: ${fns.rows.map((r) => String(r.proname)).join(", ")}`);
    if (tabs.rows.length) parts.push(`bảng: ${tabs.rows.map((r) => String(r.relname)).join(", ")}`);
    return parts.length === 0
      ? { id: "public-clean", status: "ok", label }
      : {
          id: "public-clean",
          status: "fail",
          label,
          detail: `trong public có ${parts.join("; ")}`,
          hint: "Có migration lỡ tạo đồ trong public. Dừng lại và nhờ dev xem — đừng tự xóa (Launcher dùng schema này).",
        };
  } catch (err) {
    return { id: "public-clean", status: "fail", label, detail: errText(err), hint: "Thử chạy lại; nếu vẫn lỗi, nhờ dev xem." };
  }
}

export async function checkPgVersion(db: DbHandle): Promise<CheckResult> {
  const label = `Phiên bản Postgres ≤ ${MAX_PG_MAJOR} (để sao lưu bằng pg_dump ${MAX_PG_MAJOR} chạy được)`;
  const h = queryOf(db);
  if ("why" in h) return skip("pg-version", label, h.why);
  try {
    const res = await h.q("show server_version_num");
    const num = Number(Object.values(res.rows[0] ?? {})[0]);
    if (!Number.isFinite(num) || num <= 0) {
      return { id: "pg-version", status: "fail", label, detail: "không đọc được phiên bản", hint: "Thử chạy lại." };
    }
    const major = Math.floor(num / 10000);
    return major <= MAX_PG_MAJOR
      ? { id: "pg-version", status: "ok", label, detail: `Postgres ${major}` }
      : {
          id: "pg-version",
          status: "fail",
          label,
          detail: `Postgres ${major}`,
          hint: `Nâng PG_MAJOR trong .github/workflows/backup.yml lên ${major} (và MAX_PG_MAJOR trong lib/ops/doctor.ts), nếu không sao lưu đêm sẽ hỏng.`,
        };
  } catch (err) {
    return { id: "pg-version", status: "fail", label, detail: errText(err), hint: "Thử chạy lại." };
  }
}

export async function checkLearnerCounts(db: DbHandle): Promise<CheckResult> {
  const label = "Số learner trong database";
  const h = queryOf(db);
  if ("why" in h) return skip("learners", label, h.why);
  try {
    const res = await h.q(
      `select count(*) filter (where is_test)::int as test,
              count(*) filter (where not is_test)::int as real
       from english.learners`,
    );
    const row = res.rows[0] ?? {};
    return {
      id: "learners",
      status: "info",
      label,
      detail: `${Number(row.test ?? 0)} learner thử · ${Number(row.real ?? 0)} learner thật`,
    };
  } catch {
    return skip("learners", label, "chưa đọc được english.learners (chưa áp migration?)");
  }
}

// ---------------------------------------------------------------------------
// 7–8. Supabase HTTP
// ---------------------------------------------------------------------------

const trimSlash = (u: string) => u.replace(/\/+$/, "");
const MISSING_HTTP_ENV = "thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY";

export async function checkDataApi(env: Env, doFetch: FetchLike): Promise<CheckResult> {
  const label = "Data API đã mở schema english";
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!present(url) || !present(key)) return skip("data-api", label, MISSING_HTTP_ENV);
  const fixExposed = "Supabase → Project Settings → Data API → Exposed schemas → thêm english (giữ public) → Save.";
  try {
    const res = await doFetch(`${trimSlash(url)}/rest/v1/learners?select=id&limit=1`, {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "english" },
    });
    const body = await res.text();
    if (res.status === 200) return { id: "data-api", status: "ok", label };
    if (/PGRST106/.test(body) || /schema must be one of/i.test(body)) {
      return { id: "data-api", status: "fail", label, detail: "schema english chưa được mở", hint: fixExposed };
    }
    // Schema is exposed but `anon` has no rights on it — exactly the design (anon sees nothing).
    if ((res.status === 401 || res.status === 403) && /42501|permission denied/i.test(body)) {
      return { id: "data-api", status: "ok", label, detail: "schema đã mở; khách (anon) bị chặn đúng thiết kế" };
    }
    if (res.status === 404 || /PGRST205|PGRST202/.test(body)) {
      return {
        id: "data-api",
        status: "fail",
        label,
        detail: `HTTP ${res.status}: không thấy bảng learners`,
        hint: "Chưa áp migration hoặc API chưa nạp lại: chạy `npm run db:apply`, rồi Project Settings → Data API → Save.",
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        id: "data-api",
        status: "fail",
        label,
        detail: `HTTP ${res.status}`,
        hint: "Khóa anon sai hoặc không khớp project: chép lại từ Project Settings → API Keys.",
      };
    }
    return { id: "data-api", status: "fail", label, detail: `HTTP ${res.status}`, hint: fixExposed };
  } catch (err) {
    return {
      id: "data-api",
      status: "fail",
      label,
      detail: errText(err),
      hint: "Không gọi được Supabase: kiểm tra NEXT_PUBLIC_SUPABASE_URL (dạng https://<mã>.supabase.co) và mạng.",
    };
  }
}

export async function checkSignupDisabled(env: Env, doFetch: FetchLike): Promise<CheckResult> {
  const label = "Đã tắt tự đăng ký (sign-up)";
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!present(url) || !present(key)) return skip("signup", label, MISSING_HTTP_ENV);
  const fix = "Supabase → Authentication → Sign In / Providers → tắt Allow new users to sign up.";
  try {
    const res = await doFetch(`${trimSlash(url)}/auth/v1/settings`, { method: "GET", headers: { apikey: key } });
    const body = await res.text();
    if (res.status !== 200) {
      return {
        id: "signup",
        status: "fail",
        label,
        detail: `HTTP ${res.status}`,
        hint: "Không đọc được cấu hình Auth: kiểm tra URL và khóa anon.",
      };
    }
    let json: { disable_signup?: unknown };
    try {
      json = JSON.parse(body) as { disable_signup?: unknown };
    } catch {
      return { id: "signup", status: "fail", label, detail: "phản hồi không phải JSON", hint: fix };
    }
    return json.disable_signup === true
      ? { id: "signup", status: "ok", label }
      : { id: "signup", status: "fail", label, detail: "ai cũng tự đăng ký được", hint: fix };
  } catch (err) {
    return {
      id: "signup",
      status: "fail",
      label,
      detail: errText(err),
      hint: "Không gọi được Supabase: kiểm tra NEXT_PUBLIC_SUPABASE_URL và mạng.",
    };
  }
}

// ---------------------------------------------------------------------------
// 10. Backup key (workflow only) — never prints the value
// ---------------------------------------------------------------------------

export function checkBackupRecipient(env: Env): CheckResult {
  const label = "Có khóa công khai sao lưu BACKUP_AGE_RECIPIENT (age1…)";
  const v = env.BACKUP_AGE_RECIPIENT;
  if (!present(v)) {
    return {
      id: "backup-key",
      status: "fail",
      label,
      detail: "chưa đặt",
      hint: "Repo → Settings → Secrets and variables → Actions → Secrets → thêm BACKUP_AGE_RECIPIENT (PROGRESS bước 10–11).",
    };
  }
  return v.trim().startsWith("age1")
    ? { id: "backup-key", status: "ok", label }
    : {
        id: "backup-key",
        status: "fail",
        label,
        detail: "giá trị không bắt đầu bằng age1",
        hint: "Dán dòng `Public key: age1…` (khóa công khai), không dán khóa bí mật AGE-SECRET-KEY.",
      };
}

// ---------------------------------------------------------------------------
// Orchestration + formatting
// ---------------------------------------------------------------------------

export type DoctorDeps = {
  env: Env;
  db: DbHandle;
  fetch: FetchLike;
  /** Versions of db/migrations/NNNN_*.sql on disk. */
  migrationVersions: string[];
  /** Run check 10 (only in the GitHub workflow). */
  includeBackupKey?: boolean;
};

export async function runDoctor(deps: DoctorDeps): Promise<CheckResult[]> {
  const { env, db } = deps;
  const results: CheckResult[] = [
    ...checkEnv(env),
    await checkDbConnect(db, safeHost(env.DATABASE_URL)),
    await checkMigrations(db, deps.migrationVersions),
    await checkRls(db),
    await checkPublicClean(db),
    await checkPgVersion(db),
    await checkDataApi(env, deps.fetch),
    await checkSignupDisabled(env, deps.fetch),
    await checkLearnerCounts(db),
  ];
  if (deps.includeBackupKey) results.push(checkBackupRecipient(env));

  // Last line of defence: nothing secret may leave this function.
  const secrets = secretValues(env);
  return results.map((r) => ({
    ...r,
    label: maskSecrets(r.label, secrets),
    detail: r.detail === undefined ? undefined : maskSecrets(r.detail, secrets),
    hint: r.hint === undefined ? undefined : maskSecrets(r.hint, secrets),
  }));
}

export function exitCode(results: CheckResult[]): 0 | 1 {
  return results.some((r) => r.status === "fail") ? 1 : 0;
}

const ICON: Record<Status, string> = { ok: "✓", fail: "✗", skip: "–", info: "ℹ" };

export function summarize(results: CheckResult[]): string {
  const n = (s: Status) => results.filter((r) => r.status === s).length;
  const fails = n("fail");
  return fails === 0
    ? `Kết quả: ĐẠT (${n("ok")} ✓, ${n("skip")} bỏ qua)`
    : `Kết quả: CÒN ${fails} MỤC CHƯA ĐẠT (${n("ok")} ✓, ${fails} ✗, ${n("skip")} bỏ qua)`;
}

export function formatText(results: CheckResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    lines.push(`${ICON[r.status]} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.status === "fail" && r.hint) lines.push(`    → Cách sửa: ${r.hint}`);
  }
  lines.push("", summarize(results));
  return lines.join("\n");
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function formatMarkdown(results: CheckResult[]): string {
  const rows = results.map((r) => {
    const note = [r.detail, r.status === "fail" && r.hint ? `**Cách sửa:** ${r.hint}` : undefined]
      .filter(Boolean)
      .join(" — ");
    return `| ${ICON[r.status]} | ${cell(r.label)} | ${cell(note)} |`;
  });
  return [
    "## Kiểm tra cài đặt (Setup doctor)",
    "",
    "| | Mục | Ghi chú / cách sửa |",
    "|---|---|---|",
    ...rows,
    "",
    `**${summarize(results)}**`,
    "",
  ].join("\n");
}
