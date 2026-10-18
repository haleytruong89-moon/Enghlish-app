import { describe, expect, it } from "vitest";
import {
  checkBackupRecipient,
  checkDataApi,
  checkDbConnect,
  checkEnv,
  checkStoragePolicies,
  checkWorkBucket,
  checkLearnerCounts,
  checkMigrations,
  checkPgVersion,
  checkPublicClean,
  checkRls,
  checkSignupDisabled,
  exitCode,
  formatMarkdown,
  formatText,
  maskSecrets,
  runDoctor,
  safeHost,
  type CheckResult,
  type DbHandle,
  type Env,
  type FetchLike,
  type Query,
} from "@/lib/ops/doctor";

const URL_ = "https://abcd1234.supabase.co";
const ANON = "anon-key-AAAAAAAAAAAA";
const SERVICE = "service-key-SSSSSSSSSSSS";
const DB_URL = "postgres://postgres.abcd1234:s3cretPassw0rd@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";

const GOOD_ENV: Env = {
  NEXT_PUBLIC_SUPABASE_URL: URL_,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
  DATABASE_URL: DB_URL,
};

/** Fake query: first matching [regex, rows | Error] wins. */
function fakeDb(routes: Array<[RegExp, Record<string, unknown>[] | Error]>): DbHandle {
  const query: Query = async (sql) => {
    for (const [re, out] of routes) {
      if (re.test(sql)) {
        if (out instanceof Error) throw out;
        return { rows: out };
      }
    }
    return { rows: [] };
  };
  return { query };
}

const reply =
  (status: number, body: unknown): FetchLike =>
  async () => ({ status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

const throwingFetch: FetchLike = async () => {
  throw new Error("getaddrinfo ENOTFOUND abcd1234.supabase.co");
};

describe("checkEnv", () => {
  it("ok when all required vars exist; service key is optional (info)", () => {
    const r = checkEnv(GOOD_ENV);
    expect(r.find((x) => x.id === "env")?.status).toBe("ok");
    expect(r.find((x) => x.id === "env-leak")?.status).toBe("skip");
    expect(r.find((x) => x.id === "env-service")?.status).toBe("info");
  });

  it("fails and lists missing names (empty string counts as missing)", () => {
    const r = checkEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: "  " });
    const env = r.find((x) => x.id === "env");
    expect(env?.status).toBe("fail");
    expect(env?.detail).toBe("NEXT_PUBLIC_SUPABASE_ANON_KEY, DATABASE_URL");
    expect(env?.hint).toBeTruthy();
  });

  it("fails when a NEXT_PUBLIC_* value equals the service role key, without printing the key", () => {
    const r = checkEnv({ ...GOOD_ENV, SUPABASE_SERVICE_ROLE_KEY: SERVICE, NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE });
    const leak = r.find((x) => x.id === "env-leak");
    expect(leak?.status).toBe("fail");
    expect(leak?.detail).toBe("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(JSON.stringify(r)).not.toContain(SERVICE);
  });

  it("ok when service key differs from public vars", () => {
    const r = checkEnv({ ...GOOD_ENV, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
    expect(r.find((x) => x.id === "env-leak")?.status).toBe("ok");
    expect(r.find((x) => x.id === "env-service")?.detail).toBe("đã có");
  });

  it("shows ALLOW_REAL_LEARNERS as info", () => {
    expect(checkEnv({ ...GOOD_ENV, ALLOW_REAL_LEARNERS: "false" }).find((x) => x.id === "env-real")).toMatchObject({
      status: "info",
      detail: "false",
    });
    expect(checkEnv(GOOD_ENV).find((x) => x.id === "env-real")?.status).toBe("info");
  });
});

describe("checkDbConnect", () => {
  it("ok / fail / skip", async () => {
    expect((await checkDbConnect(fakeDb([]), "h:5432")).status).toBe("ok");
    expect((await checkDbConnect(fakeDb([[/select 1/, new Error("boom")]]), "h")).status).toBe("fail");
    expect((await checkDbConnect({ error: "ECONNREFUSED" }, "h")).status).toBe("fail");
    expect((await checkDbConnect(null, "?")).status).toBe("skip");
  });
});

describe("checkMigrations", () => {
  const files = ["0001", "0002", "0003", "0004"];
  it("ok when all files are recorded", async () => {
    const db = fakeDb([
      [/to_regclass/, [{ exists: true }]],
      [/schema_migrations/, files.map((version) => ({ version }))],
    ]);
    expect((await checkMigrations(db, files)).status).toBe("ok");
  });
  it("fails listing missing versions (also future 0005+)", async () => {
    const db = fakeDb([
      [/to_regclass/, [{ exists: true }]],
      [/schema_migrations/, [{ version: "0001" }, { version: "0002" }]],
    ]);
    const r = await checkMigrations(db, [...files, "0005"]);
    expect(r.status).toBe("fail");
    expect(r.detail).toBe("còn thiếu: 0003, 0004, 0005");
    expect(r.hint).toContain("db:apply");
  });
  it("fails when the tracking table does not exist", async () => {
    const r = await checkMigrations(fakeDb([[/to_regclass/, [{ exists: false }]]]), files);
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("0001");
  });
  it("skips without db", async () => {
    expect((await checkMigrations(null, files)).status).toBe("skip");
    expect((await checkMigrations({ error: "x" }, files)).status).toBe("skip");
  });
});

describe("checkRls", () => {
  it("ok / fail (offenders) / skip", async () => {
    expect((await checkRls(fakeDb([[/relrowsecurity/, []]]))).status).toBe("ok");
    const bad = await checkRls(fakeDb([[/relrowsecurity/, [{ relname: "notes" }, { relname: "logs" }]]]));
    expect(bad.status).toBe("fail");
    expect(bad.detail).toContain("notes, logs");
    expect((await checkRls(null)).status).toBe("skip");
  });
});

describe("checkPublicClean", () => {
  it("ok when nothing found", async () => {
    expect((await checkPublicClean(fakeDb([]))).status).toBe("ok");
  });
  it("fails on eng_ functions and on our tables in public", async () => {
    const r = await checkPublicClean(
      fakeDb([
        [/pg_proc/, [{ proname: "eng_is_parent" }]],
        [/pg_class/, [{ relname: "learners" }]],
      ]),
    );
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("eng_is_parent");
    expect(r.detail).toContain("learners");
  });
  it("skips without db", async () => {
    expect((await checkPublicClean(null)).status).toBe("skip");
  });
});

describe("checkPgVersion", () => {
  const ver = (n: string) => fakeDb([[/server_version_num/, [{ server_version_num: n }]]]);
  it("ok for 16 and 17", async () => {
    expect((await checkPgVersion(ver("160004"))).status).toBe("ok");
    expect((await checkPgVersion(ver("170002"))).detail).toBe("Postgres 17");
  });
  it("fails for 18 with hint to backup.yml", async () => {
    const r = await checkPgVersion(ver("180001"));
    expect(r.status).toBe("fail");
    expect(r.hint).toContain("backup.yml");
  });
  it("fails on garbage, skips without db", async () => {
    expect((await checkPgVersion(ver("abc"))).status).toBe("fail");
    expect((await checkPgVersion(null)).status).toBe("skip");
  });
});

describe("checkDataApi", () => {
  it("ok on 200 and sends schema profile + anon headers", async () => {
    let seen: { url: string; headers?: Record<string, string> } | undefined;
    const f: FetchLike = async (url, init) => {
      seen = { url, headers: init?.headers };
      return { status: 200, text: async () => "[]" };
    };
    expect((await checkDataApi({ ...GOOD_ENV, NEXT_PUBLIC_SUPABASE_URL: `${URL_}/` }, f)).status).toBe("ok");
    expect(seen?.url).toBe(`${URL_}/rest/v1/learners?select=id&limit=1`);
    expect(seen?.headers).toMatchObject({ apikey: ANON, Authorization: `Bearer ${ANON}`, "Accept-Profile": "english" });
  });
  it("fails with the Exposed schemas hint on PGRST106", async () => {
    const r = await checkDataApi(
      GOOD_ENV,
      reply(406, { code: "PGRST106", message: "The schema must be one of the following: public" }),
    );
    expect(r.status).toBe("fail");
    expect(r.hint).toContain("Exposed schemas");
    expect(r.hint).toContain("english");
  });
  it("detects 'schema must be one of' without a code", async () => {
    expect((await checkDataApi(GOOD_ENV, reply(406, "Invalid schema: english. schema must be one of: public"))).status).toBe("fail");
  });
  it("ok when schema is exposed but anon is denied (42501)", async () => {
    const r = await checkDataApi(GOOD_ENV, reply(403, { code: "42501", message: "permission denied for schema english" }));
    expect(r.status).toBe("ok");
  });
  it("fails on missing table (migrations not applied) and on bad key", async () => {
    expect((await checkDataApi(GOOD_ENV, reply(404, { code: "PGRST205" }))).status).toBe("fail");
    const bad = await checkDataApi(GOOD_ENV, reply(401, { message: "Invalid API key" }));
    expect(bad.status).toBe("fail");
    expect(bad.hint).toContain("API Keys");
  });
  it("fails on network error, skips when url or key is missing", async () => {
    expect((await checkDataApi(GOOD_ENV, throwingFetch)).status).toBe("fail");
    expect((await checkDataApi({ ...GOOD_ENV, NEXT_PUBLIC_SUPABASE_URL: "" }, reply(200, "[]"))).status).toBe("skip");
    expect((await checkDataApi({ ...GOOD_ENV, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }, reply(200, "[]"))).status).toBe("skip");
  });
});

describe("checkSignupDisabled", () => {
  it("ok when disable_signup is true", async () => {
    expect((await checkSignupDisabled(GOOD_ENV, reply(200, { disable_signup: true }))).status).toBe("ok");
  });
  it("fails when signups are open or the field is missing", async () => {
    const open = await checkSignupDisabled(GOOD_ENV, reply(200, { disable_signup: false }));
    expect(open.status).toBe("fail");
    expect(open.hint).toContain("Allow new users to sign up");
    expect((await checkSignupDisabled(GOOD_ENV, reply(200, {}))).status).toBe("fail");
  });
  it("fails on HTTP error, bad JSON and network error", async () => {
    expect((await checkSignupDisabled(GOOD_ENV, reply(500, "x"))).status).toBe("fail");
    expect((await checkSignupDisabled(GOOD_ENV, reply(200, "<html>"))).status).toBe("fail");
    expect((await checkSignupDisabled(GOOD_ENV, throwingFetch)).status).toBe("fail");
  });
  it("skips without url/key", async () => {
    expect((await checkSignupDisabled({}, reply(200, { disable_signup: true }))).status).toBe("skip");
  });
});

describe("checkLearnerCounts", () => {
  it("info with test/real counts", async () => {
    const r = await checkLearnerCounts(fakeDb([[/english\.learners/, [{ test: 2, real: 0 }]]]));
    expect(r).toMatchObject({ status: "info", detail: "2 learner thử · 0 learner thật" });
  });
  it("skips when table missing or no db", async () => {
    expect((await checkLearnerCounts(fakeDb([[/learners/, new Error("relation does not exist")]]))).status).toBe("skip");
    expect((await checkLearnerCounts(null)).status).toBe("skip");
  });
});

describe("checkBackupRecipient", () => {
  it("ok for age1…, never prints the value", () => {
    const v = "age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    const r = checkBackupRecipient({ BACKUP_AGE_RECIPIENT: v });
    expect(r.status).toBe("ok");
    expect(JSON.stringify(r)).not.toContain(v);
  });
  it("fails when missing or wrong prefix, without echoing the value", () => {
    expect(checkBackupRecipient({}).status).toBe("fail");
    const secretKey = "AGE-SECRET-KEY-1XXXXXXXXXXXXXXXXXXXXXXX";
    const r = checkBackupRecipient({ BACKUP_AGE_RECIPIENT: secretKey });
    expect(r.status).toBe("fail");
    expect(JSON.stringify(r)).not.toContain(secretKey);
  });
});

describe("masking", () => {
  it("masks user:password in URLs and exact secret values", () => {
    const out = maskSecrets(`connect failed for ${DB_URL} with key ${SERVICE}`, [SERVICE]);
    expect(out).not.toContain("s3cretPassw0rd");
    expect(out).not.toContain("postgres.abcd1234");
    expect(out).not.toContain(SERVICE);
    expect(out).toContain("aws-0-ap-southeast-1.pooler.supabase.com");
  });
  it("safeHost returns host:port only", () => {
    expect(safeHost(DB_URL)).toBe("aws-0-ap-southeast-1.pooler.supabase.com:5432");
    expect(safeHost("not a url")).toBe("?");
    expect(safeHost(undefined)).toBe("?");
  });
  it("runDoctor never leaks secrets even if a lower layer echoes them", async () => {
    const env: Env = { ...GOOD_ENV, SUPABASE_SERVICE_ROLE_KEY: SERVICE, BACKUP_AGE_RECIPIENT: "age1abcdefgh" };
    const leaky = new Error(`password authentication failed for ${DB_URL} key=${SERVICE} anon=${ANON}`);
    const results = await runDoctor({
      env,
      db: fakeDb([[/select 1/, leaky]]),
      fetch: throwingFetch,
      migrationVersions: ["0001"],
      includeBackupKey: true,
    });
    const dump = formatText(results) + formatMarkdown(results) + JSON.stringify(results);
    for (const s of [SERVICE, ANON, "s3cretPassw0rd", "postgres.abcd1234", "age1abcdefgh"]) {
      expect(dump).not.toContain(s);
    }
    expect(dump).toContain("***");
  });
});

describe("storage checks (shared project: policies without a bucket condition, and the private bucket)", () => {
  const withStorage: [RegExp, Record<string, unknown>[] | Error] = [/information_schema\.tables/, [{ n: 2 }]];
  it("policies: ok when none lack a bucket condition, or when there is no Storage at all; fail naming them otherwise", async () => {
    expect((await checkStoragePolicies(fakeDb([withStorage, [/pg_policies/, []]]))).status).toBe("ok");
    expect((await checkStoragePolicies(fakeDb([[/information_schema\.tables/, [{ n: 0 }]]]))).status).toBe("ok");
    const bad = await checkStoragePolicies(fakeDb([withStorage, [/pg_policies/, [{ policyname: "Anyone can read", cmd: "SELECT" }]]]));
    expect(bad).toMatchObject({ id: "storage-policies", status: "fail", label: "Không có policy nào trên storage.objects thiếu điều kiện bucket" });
    expect(bad.detail).toContain("Anyone can read (SELECT)");
    expect(bad.hint).toContain("bucket_id");
    expect((await checkStoragePolicies(fakeDb([withStorage, [/pg_policies/, new Error("boom")]]))).status).toBe("fail");
    expect((await checkStoragePolicies(null)).status).toBe("skip");
  });

  it("bucket: ok when it exists and is private; fail when missing or public; skip without Storage", async () => {
    expect((await checkWorkBucket(fakeDb([withStorage, [/storage\.buckets/, [{ public: false }]]]))).status).toBe("ok");
    const pub = await checkWorkBucket(fakeDb([withStorage, [/storage\.buckets/, [{ public: true }]]]));
    expect(pub.status).toBe("fail");
    expect(pub.detail).toContain("CÔNG KHAI");
    const missing = await checkWorkBucket(fakeDb([withStorage, [/storage\.buckets/, []]]));
    expect(missing).toMatchObject({ status: "fail", label: "Bucket english-work tồn tại và riêng tư" });
    expect((await checkWorkBucket(fakeDb([[/information_schema\.tables/, [{ n: 0 }]]]))).status).toBe("skip");
    expect((await checkWorkBucket(null)).status).toBe("skip");
  });
});

describe("runDoctor / exit code / formatting", () => {
  const goodDb = fakeDb([
    [/to_regclass/, [{ exists: true }]],
    [/schema_migrations/, [{ version: "0001" }]],
    [/server_version_num/, [{ server_version_num: "170002" }]],
    [/english\.learners/, [{ test: 2, real: 0 }]],
  ]);
  const goodFetch: FetchLike = async (url) =>
    url.includes("/auth/v1/settings")
      ? { status: 200, text: async () => JSON.stringify({ disable_signup: true }) }
      : { status: 200, text: async () => "[]" };

  it("all good → exit 0, table has no ✗", async () => {
    const results = await runDoctor({ env: GOOD_ENV, db: goodDb, fetch: goodFetch, migrationVersions: ["0001"] });
    expect(results.filter((r) => r.status === "fail")).toEqual([]);
    expect(exitCode(results)).toBe(0);
    expect(formatText(results)).toContain("ĐẠT");
    expect(formatMarkdown(results)).toContain("| ✓ |");
    expect(results.some((r) => r.id === "backup-key")).toBe(false);
  });

  it("one failing check → exit 1 and hint is shown", async () => {
    const results = await runDoctor({
      env: GOOD_ENV,
      db: goodDb,
      fetch: reply(406, { code: "PGRST106" }),
      migrationVersions: ["0001"],
    });
    expect(exitCode(results)).toBe(1);
    expect(formatText(results)).toContain("→ Cách sửa:");
    expect(formatMarkdown(results)).toContain("**Cách sửa:**");
  });

  it("nothing configured → env fails, network/db checks skip (not fail)", async () => {
    const results = await runDoctor({ env: {}, db: null, fetch: throwingFetch, migrationVersions: ["0001"] });
    const byId = (id: string) => results.find((r) => r.id === id) as CheckResult;
    expect(byId("env").status).toBe("fail");
    for (const id of ["db", "migrations", "rls", "public-clean", "pg-version", "data-api", "signup", "storage-policies", "storage-bucket", "learners"]) {
      expect(byId(id).status, id).toBe("skip");
    }
    expect(exitCode(results)).toBe(1);
  });

  it("includes the backup key check only when asked", async () => {
    const withKey = await runDoctor({
      env: { ...GOOD_ENV, BACKUP_AGE_RECIPIENT: "age1xyz" },
      db: goodDb,
      fetch: goodFetch,
      migrationVersions: ["0001"],
      includeBackupKey: true,
    });
    expect(withKey.find((r) => r.id === "backup-key")?.status).toBe("ok");
  });

  it("exitCode: skip/info never fail", () => {
    expect(exitCode([{ id: "a", status: "skip", label: "a" }, { id: "b", status: "info", label: "b" }])).toBe(0);
    expect(exitCode([{ id: "a", status: "fail", label: "a" }])).toBe(1);
  });
});
