import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkLoginNames, upsertLoginNames } from "../../scripts/lib/loginNames";
import { REAL_FAMILY_ID } from "../../scripts/lib/realFamily";
import { createAuthUser, createTestDb, errorAs, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TSX = `${ROOT}node_modules/.bin/tsx`;

describe("S5b-1 step 1: login names (0013)", () => {
  let db: TestDb;
  let s: Seeded;
  let userA: string;
  let userB: string;
  const q = async <R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.client.query<R>(sql, params)).rows;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client); // the test family also gets its thu-* names
    userA = await createAuthUser(db.client, "Ten.Day.Du+a@Gmail.com");
    userB = await createAuthUser(db.client, "ten.day.du+b@gmail.com");
    await db.client.query("insert into english.login_names(login_name, auth_user_id) values ('abc', $1)", [userA]);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("the table is closed to the API: RLS on, no policy, no grant to anon / authenticated / service_role", async () => {
    const t = (await q<{ rls: boolean; a: boolean; u: boolean; sr: boolean }>(
      `select c.relrowsecurity as rls,
              has_table_privilege('anon', c.oid, 'select,insert,update,delete') as a,
              has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as u,
              has_table_privilege('service_role', c.oid, 'select,insert,update,delete') as sr
       from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'english' and c.relname = 'login_names'`,
    ))[0];
    expect(t).toEqual({ rls: true, a: false, u: false, sr: false });
    expect(await q("select * from pg_policies where schemaname = 'english' and tablename = 'login_names'")).toEqual([]);
    for (const [role, user] of [["authenticated", s.users.studentAn], ["authenticated", s.users.parent], ["anon", null]] as const) {
      const e = await errorAs(db.client, role, user, "select * from english.login_names");
      expect(e?.code, `${role} read`).toBe("42501");
      const w = await errorAs(db.client, role, user, "insert into english.login_names(login_name, auth_user_id) values ('hack', gen_random_uuid())");
      expect(w?.code, `${role} write`).toBe("42501");
    }
  });

  it("eng_login_email can be called by service_role only", async () => {
    for (const [role, user] of [["authenticated", s.users.parent], ["authenticated", s.users.studentAn], ["anon", null]] as const) {
      const e = await errorAs(db.client, role, user, "select english.eng_login_email('abc')");
      expect(e?.code, role).toBe("42501");
    }
    const rows = await rowsAs<{ e: string }>(db.client, "service_role", null, "select english.eng_login_email('abc') as e");
    expect(rows[0]?.e).toBe("Ten.Day.Du+a@Gmail.com");
  });

  it("resolves an active name (case- and space-insensitive); unknown, inactive and orphan names give NULL", async () => {
    const email = async (name: string | null) =>
      (await rowsAs<{ e: string | null }>(db.client, "service_role", null, "select english.eng_login_email($1) as e", [name]))[0]?.e;
    expect(await email("  ABC ")).toBe("Ten.Day.Du+a@Gmail.com");
    expect(await email("thu-an")).toBe("an@test.local");
    expect(await email("khong-co")).toBeNull();
    expect(await email("")).toBeNull();
    expect(await email(null)).toBeNull();
    await db.client.query("update english.login_names set active = false where login_name = 'abc'");
    expect(await email("abc")).toBeNull();
    await db.client.query("update english.login_names set active = true where login_name = 'abc'");
    // an account deleted on the Supabase side leaves an orphan name: it resolves to nothing
    await db.client.query("insert into english.login_names(login_name, auth_user_id) values ('orphan', gen_random_uuid())");
    expect(await email("orphan")).toBeNull();
  });

  it("the table itself enforces the name shape and one name per account", async () => {
    for (const bad of ["a", "-ab", "Ab", "a b", "a_b", "x".repeat(32), "@ab"]) {
      await expect(db.client.query("insert into english.login_names(login_name, auth_user_id) values ($1, gen_random_uuid())", [bad]), bad).rejects.toThrow(/check/i);
    }
    await expect(db.client.query("insert into english.login_names(login_name, auth_user_id) values ('abd', $1)", [userA])).rejects.toThrow(/unique|duplicate/i);
    await expect(db.client.query("insert into english.login_names(login_name, auth_user_id) values ('abc', gen_random_uuid())")).rejects.toThrow(/unique|duplicate|primary/i);
  });

  it("the test family got thu-* names, one per account", async () => {
    const rows = await q<{ login_name: string }>("select login_name from english.login_names where login_name like 'thu-%' order by 1");
    expect(rows.map((r) => r.login_name)).toEqual(["thu-an", "thu-giasu-an", "thu-giasu-nguyen", "thu-nguyen", "thu-phuhuynh"]);
  });

  it("pre-check: a name that points at another account, or an account that has another name, is refused; same pairing is fine", async () => {
    expect(await checkLoginNames(db.client, [{ label: "An", name: "abc", userId: userA }])).toEqual({ ok: true });
    const other = await checkLoginNames(db.client, [{ label: "An", name: "abc", userId: userB }]);
    expect(other.ok).toBe(false);
    // the account does not exist yet but the name is taken
    expect((await checkLoginNames(db.client, [{ label: "An", name: "abc", userId: null }])).ok).toBe(false);
    const second = await checkLoginNames(db.client, [{ label: "An", name: "xyz", userId: userA }]);
    expect(!second.ok && second.errors.join()).toMatch(/đã có tên đăng nhập khác \("abc"\)/);
    // a free name for an account to be created is fine; the same name for two people is not
    expect(await checkLoginNames(db.client, [{ label: "Mới", name: "moi-1", userId: null }])).toEqual({ ok: true });
    expect((await checkLoginNames(db.client, [{ label: "A", name: "dup-1", userId: null }, { label: "B", name: "dup-1", userId: userB }])).ok).toBe(false);
  });

  it("upsert adds missing names, is idempotent, and never moves a name", async () => {
    const first = await upsertLoginNames(db.client, [{ label: "B", name: "bbb", userId: userB }, { label: "A", name: "abc", userId: userA }]);
    expect(first).toEqual({ inserted: ["bbb"], existing: ["abc"] });
    const again = await upsertLoginNames(db.client, [{ label: "B", name: "bbb", userId: userB }]);
    expect(again).toEqual({ inserted: [], existing: ["bbb"] });
    await expect(upsertLoginNames(db.client, [{ label: "B", name: "abc", userId: userB }])).rejects.toThrow(/đã được dùng/);
    expect((await q("select auth_user_id from english.login_names where login_name = 'abc'"))[0]).toEqual({ auth_user_id: userA });
  });
});

describe("S5b-1 step 1: create-real-family writes the login names", () => {
  let db: TestDb;
  const cliEnv = (extra: Record<string, string> = {}) => ({
    PATH: process.env.PATH ?? "",
    DATABASE_URL: db.url,
    PARENT_EMAIL: "bo.me@example.com",
    AN_EMAIL: "an@example.com",
    NGUYEN_EMAIL: "nguyen@example.com",
    TUTOR_AN_EMAIL: "co-lan@example.com",
    TUTOR_AN_NAME: "Cô Lan",
    TUTOR_NGUYEN_EMAIL: "thay-minh@example.com",
    TUTOR_NGUYEN_NAME: "Thầy Minh",
    NEW_PASSWORD_PARENT: "parent-secret-pw-001",
    NEW_PASSWORD_AN: "an-secret-pw-0000002",
    NEW_PASSWORD_NGUYEN: "nguyen-secret-pw-003",
    NEW_PASSWORD_TUTOR_AN: "tutor-an-secret-pw-04",
    NEW_PASSWORD_TUTOR_NGUYEN: "tutor-nguyen-secret-5",
    ...extra,
  });
  const run = (extra: Record<string, string> = {}) =>
    spawnSync(TSX, ["scripts/create-real-family.ts", "--auth=stub"], { cwd: ROOT, env: cliEnv(extra) as unknown as NodeJS.ProcessEnv, encoding: "utf8" });
  const names = async () =>
    (await db.client.query<{ login_name: string; email: string }>(
      "select n.login_name, u.email from english.login_names n join auth.users u on u.id = n.auth_user_id order by 1",
    )).rows;
  const accounts = async () => (await db.client.query("select id, email from auth.users order by email")).rows;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("an invalid name stops the run before anything is created", async () => {
    const r = run({ LOGIN_AN: "An An" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/chưa đúng dạng/);
    expect(await accounts()).toEqual([]);
  });

  it("a name already pointing at someone else stops the run in the pre-check: no account, no family", async () => {
    const stranger = await createAuthUser(db.client, "stranger@example.com");
    await db.client.query("insert into english.login_names(login_name, auth_user_id) values ('giasu-an', $1)", [stranger]);
    const before = await accounts();
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/"giasu-an" đã dùng cho một tài khoản khác/);
    expect(await accounts()).toEqual(before); // nothing created
    expect((await db.client.query("select 1 from english.families where id = $1", [REAL_FAMILY_ID])).rowCount).toBe(0);
    await db.client.query("delete from english.login_names where login_name = 'giasu-an'");
    await db.client.query("delete from auth.users where id = $1", [stranger]);
  });

  it("default names are written for the four slots; the parent gets none", async () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Tên đăng nhập ngắn: đã thêm 4/);
    expect(await names()).toEqual([
      { login_name: "an", email: "an@example.com" },
      { login_name: "giasu-an", email: "co-lan@example.com" },
      { login_name: "giasu-nguyen", email: "thay-minh@example.com" },
      { login_name: "nguyen", email: "nguyen@example.com" },
    ]);
  });

  it("running again changes nothing (names and accounts)", async () => {
    const before = { names: await names(), accounts: await accounts() };
    const r = run(Object.fromEntries(["NEW_PASSWORD_PARENT", "NEW_PASSWORD_AN", "NEW_PASSWORD_NGUYEN", "NEW_PASSWORD_TUTOR_AN", "NEW_PASSWORD_TUTOR_NGUYEN"].map((k) => [k, ""])));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Tên đăng nhập ngắn: đã có đủ từ trước/);
    expect({ names: await names(), accounts: await accounts() }).toEqual(before);
  });

  it("asking for a different name for an account that already has one stops before anything is written", async () => {
    const before = { names: await names(), accounts: await accounts() };
    const r = run({ LOGIN_AN: "an-moi" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/đã có tên đăng nhập khác \("an"\)/);
    expect({ names: await names(), accounts: await accounts() }).toEqual(before);
  });
});
