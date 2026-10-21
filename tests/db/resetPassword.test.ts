import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REAL_FAMILY_ID } from "../../scripts/lib/realFamily";
import {
  AUDIT_ACTION,
  RESET_TEXT,
  resolveAccount,
  validateResetInput,
  writePasswordResetAudit,
  type AuthDirectory,
  type ResetInput,
} from "../../scripts/lib/resetPassword";
import { TEST_FAMILY_ID } from "../../scripts/lib/seed";
import { createAuthUser, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

/** Auth directory backed by the stub auth.users (the real script reads Supabase Admin API instead). */
async function stubDirectory(db: TestDb): Promise<AuthDirectory> {
  const rows = (await db.client.query<{ id: string; email: string }>("select id, lower(email) as email from auth.users")).rows;
  return {
    byEmail: (email) => rows.find((r) => r.email === email) ?? null,
    byId: (id) => rows.find((r) => r.id === id) ?? null,
  };
}

function input(login: string, family: "real" | "test" = "test"): ResetInput {
  const r = validateResetInput({ login, password: "a-long-enough-pw", family });
  if (!r.ok) throw new Error(r.errors.join(" / "));
  return r.value;
}

describe("db:reset-password: membership check and audit row", () => {
  let db: TestDb;
  let s: Seeded;
  let launcherOnly: string;
  let realParent: string;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client); // test family; its members have login names thu-*
    launcherOnly = await createAuthUser(db.client, "Launcher.Only@gmail.com");
    await db.client.query("insert into english.login_names(login_name, auth_user_id) values ('only', $1)", [launcherOnly]);
    // a member of the REAL family (not the test one)
    realParent = await createAuthUser(db.client, "real.parent@gmail.com");
    await db.client.query("insert into english.families(id, name) values ($1, 'Gia đình') on conflict do nothing", [REAL_FAMILY_ID]);
    await db.client.query("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'parent', 'Phụ huynh')", [realParent, REAL_FAMILY_ID]);
    await db.client.query("insert into english.login_names(login_name, auth_user_id) values ('bo-me', $1)", [realParent]);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("resolves a member by email (case-insensitive) with their role", async () => {
    const auth = await stubDirectory(db);
    const r = await resolveAccount(db.client, input("AN@test.local"), auth);
    expect(r).toEqual({ ok: true, userId: s.users.studentAn, email: "an@test.local", role: "student" });
    const t = await resolveAccount(db.client, input("tutor-an@test.local"), auth);
    expect(t.ok && t.role).toBe("tutor");
  });

  it("resolves a member by short login name", async () => {
    const auth = await stubDirectory(db);
    const r = await resolveAccount(db.client, input("thu-phuhuynh"), auth);
    expect(r.ok && r.userId).toBe(s.users.parent);
    expect(r.ok && r.role).toBe("parent");
  });

  it("refuses an account that is not a member of any family (Launcher-only), by email and by short name", async () => {
    const auth = await stubDirectory(db);
    const byEmail = await resolveAccount(db.client, input("launcher.only@gmail.com"), auth);
    expect(byEmail).toEqual({ ok: false, reason: "not_member", message: RESET_TEXT.notMember });
    const byName = await resolveAccount(db.client, input("only"), auth);
    expect(byName).toEqual({ ok: false, reason: "not_member", message: RESET_TEXT.notMember });
  });

  it("refuses a member of the OTHER family", async () => {
    const auth = await stubDirectory(db);
    // the test family's parent is not in the real family, and the real parent is not in the test family
    expect((await resolveAccount(db.client, input("parent@test.local", "real"), auth)).ok).toBe(false);
    const other = await resolveAccount(db.client, input("real.parent@gmail.com", "test"), auth);
    expect(other).toEqual({ ok: false, reason: "not_member", message: RESET_TEXT.notMember });
    const otherByName = await resolveAccount(db.client, input("bo-me", "test"), auth);
    expect(otherByName.ok).toBe(false);
    // ...and is resolved in their own family
    const own = await resolveAccount(db.client, input("bo-me", "real"), auth);
    expect(own.ok && own.userId).toBe(realParent);
  });

  it("reports not found for an unknown email, an unknown name, an inactive name and an orphan name", async () => {
    const auth = await stubDirectory(db);
    const notFound = { ok: false, reason: "not_found", message: RESET_TEXT.notFound };
    expect(await resolveAccount(db.client, input("nobody@gmail.com"), auth)).toEqual(notFound);
    expect(await resolveAccount(db.client, input("khong-co"), auth)).toEqual(notFound);
    await db.client.query("update english.login_names set active = false where login_name = 'thu-an'");
    expect(await resolveAccount(db.client, input("thu-an"), auth)).toEqual(notFound);
    await db.client.query("insert into english.login_names(login_name, auth_user_id) values ('mo-coi', gen_random_uuid())");
    expect(await resolveAccount(db.client, input("mo-coi"), auth)).toEqual(notFound);
  });

  it("resolving is read-only and writes one audit row with role + login_kind only", async () => {
    const before = (await db.client.query("select count(*)::int as n from english.audit_log")).rows[0].n;
    await resolveAccount(db.client, input("an@test.local"), await stubDirectory(db));
    expect((await db.client.query("select count(*)::int as n from english.audit_log")).rows[0].n).toBe(before);

    await writePasswordResetAudit(db.client, TEST_FAMILY_ID, "student", "email");
    await writePasswordResetAudit(db.client, TEST_FAMILY_ID, "parent", "short");
    const rows = (
      await db.client.query<{ action: string; family_id: string; payload: Record<string, unknown>; actor_user_id: string | null }>(
        "select action, family_id, payload, actor_user_id from english.audit_log where action = $1 order by id",
        [AUDIT_ACTION],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ action: "account.password_reset", family_id: TEST_FAMILY_ID, payload: { role: "student", login_kind: "email" }, actor_user_id: null });
    expect(rows[1]?.payload).toEqual({ role: "parent", login_kind: "short" });
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toMatch(/@|password/i);
  });
});
