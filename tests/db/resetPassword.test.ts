import type { ClientBase } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { REAL_FAMILY_ID } from "../../scripts/lib/realFamily";
import {
  AUDIT_ACTION,
  CHANGED_MARKER,
  EXIT_CHANGED_NOT_LOGGED,
  RESET_TEXT,
  resolveAccount,
  runReset,
  SENDING_MARKER,
  validateResetInput,
  writePasswordResetAudit,
  type AuthDirectory,
  type ResetInput,
  type ResetLog,
  type UpdatePassword,
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

const PW = "a-long-enough-pw";

function capture() {
  const lines: { kind: "info" | "error"; line: string }[] = [];
  const log: ResetLog = { info: (line) => lines.push({ kind: "info", line }), error: (line) => lines.push({ kind: "error", line }) };
  return { lines, log, text: () => lines.map((l) => l.line).join("\n") };
}

/** A db handle that throws when the SQL matches, otherwise passes through (to simulate a failing audit insert / commit). */
function failingOn(client: ClientBase, pattern: RegExp): ClientBase {
  return {
    query: (sql: string, ...rest: unknown[]) => {
      if (typeof sql === "string" && pattern.test(sql)) return Promise.reject(new Error("simulated failure"));
      return (client.query as (...a: unknown[]) => Promise<unknown>)(sql, ...rest);
    },
  } as unknown as ClientBase;
}

function input(login: string, family: "real" | "test" = "test"): ResetInput {
  const r = validateResetInput({ login, password: PW, family });
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

  it("reports not found for an unknown email, an unknown name and an orphan name", async () => {
    const auth = await stubDirectory(db);
    const notFound = { ok: false, reason: "not_found", message: RESET_TEXT.notFound };
    expect(await resolveAccount(db.client, input("nobody@gmail.com"), auth)).toEqual(notFound);
    expect(await resolveAccount(db.client, input("khong-co"), auth)).toEqual(notFound);
    await db.client.query("insert into english.login_names(login_name, auth_user_id) values ('mo-coi', gen_random_uuid())");
    expect(await resolveAccount(db.client, input("mo-coi"), auth)).toEqual(notFound);
  });

  it("refuses an account whose login name is switched off, whether found by that name or by email", async () => {
    const auth = await stubDirectory(db);
    await db.client.query("update english.login_names set active = false where login_name = 'thu-nguyen'");
    try {
      const inactive = { ok: false, reason: "inactive", message: RESET_TEXT.inactive };
      expect(await resolveAccount(db.client, input("thu-nguyen"), auth)).toEqual(inactive);
      expect(await resolveAccount(db.client, input("nguyen@test.local"), auth)).toEqual(inactive);
    } finally {
      await db.client.query("update english.login_names set active = true where login_name = 'thu-nguyen'");
    }
    expect((await resolveAccount(db.client, input("nguyen@test.local"), auth)).ok).toBe(true);
  });

  it("resolving is read-only; the audit writer stores role + login_kind (and the run id) only", async () => {
    const before = (await db.client.query("select count(*)::int as n from english.audit_log")).rows[0].n;
    await resolveAccount(db.client, input("an@test.local"), await stubDirectory(db));
    expect((await db.client.query("select count(*)::int as n from english.audit_log")).rows[0].n).toBe(before);

    await writePasswordResetAudit(db.client, TEST_FAMILY_ID, "student", "email");
    await writePasswordResetAudit(db.client, TEST_FAMILY_ID, "parent", "short", "run-42");
    const rows = (
      await db.client.query<{ action: string; family_id: string; payload: Record<string, unknown>; actor_user_id: string | null; correlation_id: string | null }>(
        "select action, family_id, payload, actor_user_id, correlation_id from english.audit_log where action = $1 order by id",
        [AUDIT_ACTION],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ action: "account.password_reset", family_id: TEST_FAMILY_ID, payload: { role: "student", login_kind: "email" }, actor_user_id: null, correlation_id: null });
    expect(rows[1]?.payload).toEqual({ role: "parent", login_kind: "short" });
    expect(rows[1]?.correlation_id).toBe("run-42");
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toMatch(/@|password/i);
  });

  describe("runReset (Supabase call injected)", () => {
    const auditCount = async () =>
      (await db.client.query<{ n: number }>("select count(*)::int as n from english.audit_log where action = $1", [AUDIT_ACTION])).rows[0]?.n as number;
    const ok: UpdatePassword = async () => ({ error: null });

    it("not_found / not_member / inactive: the update is never called, nothing is written, exit 1", async () => {
      const auth = await stubDirectory(db);
      const before = await auditCount();
      for (const login of ["nobody@gmail.com", "launcher.only@gmail.com", "khong-co"]) {
        const update = vi.fn(ok);
        const c = capture();
        expect(await runReset(db.client, input(login), auth, update, c.log), login).toBe(1);
        expect(update, login).not.toHaveBeenCalled();
        expect(c.lines.every((l) => l.kind === "error")).toBe(true);
      }
      await db.client.query("update english.login_names set active = false where login_name = 'thu-an'");
      try {
        const update = vi.fn(ok);
        expect(await runReset(db.client, input("thu-an"), auth, update, capture().log)).toBe(1);
        expect(update).not.toHaveBeenCalled();
      } finally {
        await db.client.query("update english.login_names set active = true where login_name = 'thu-an'");
      }
      expect(await auditCount()).toBe(before);
    });

    it("update error: no audit row (rolled back), exit 1, says it may not have changed, and the transaction is closed", async () => {
      const auth = await stubDirectory(db);
      const before = await auditCount();
      const update = vi.fn<UpdatePassword>(async () => ({ error: { message: `weak password ${PW}` } }));
      const c = capture();
      expect(await runReset(db.client, input("an@test.local"), auth, update, c.log)).toBe(1);
      expect(update).toHaveBeenCalledTimes(1);
      expect(await auditCount()).toBe(before);
      const out = c.text();
      expect(out).toContain(SENDING_MARKER);
      expect(out).not.toContain(CHANGED_MARKER);
      expect(out).toContain(RESET_TEXT.maybeNotChanged);
      expect(out).not.toContain(PW); // the password is scrubbed out of the API message
      // no transaction left open on the connection
      await db.client.query("select 1");
      expect((await db.client.query("select txid_current_if_assigned() as t")).rows[0].t).toBeNull();
    });

    it("update that throws (network) is treated like an error: rolled back, exit 1", async () => {
      const auth = await stubDirectory(db);
      const before = await auditCount();
      const update: UpdatePassword = async () => {
        throw new Error("socket hang up");
      };
      const c = capture();
      expect(await runReset(db.client, input("an@test.local"), auth, update, c.log)).toBe(1);
      expect(await auditCount()).toBe(before);
      expect(c.text()).toContain(RESET_TEXT.maybeNotChanged);
    });

    it("audit insert fails: the password is never touched, exit 1, says it did not change", async () => {
      const auth = await stubDirectory(db);
      const before = await auditCount();
      const update = vi.fn(ok);
      const c = capture();
      expect(await runReset(failingOn(db.client, /insert into english\.audit_log/), input("an@test.local"), auth, update, c.log)).toBe(1);
      expect(update).not.toHaveBeenCalled();
      expect(c.text()).toContain(RESET_TEXT.auditFailed);
      expect(c.text()).not.toContain(SENDING_MARKER);
      expect(await auditCount()).toBe(before);
    });

    it("commit fails after a successful update: warning, exit code 3, the changed marker was printed", async () => {
      const auth = await stubDirectory(db);
      const before = await auditCount();
      const update = vi.fn(ok);
      const c = capture();
      const code = await runReset(failingOn(db.client, /^commit$/), input("an@test.local"), auth, update, c.log);
      expect(code).toBe(EXIT_CHANGED_NOT_LOGGED);
      expect(code).toBe(3);
      expect(update).toHaveBeenCalledTimes(1);
      expect(c.text()).toContain(CHANGED_MARKER);
      expect(c.lines.at(-1)).toEqual({ kind: "error", line: RESET_TEXT.auditWarning });
      expect(await auditCount()).toBe(before); // rolled back
    });

    it("success: exactly one audit row, the update called once with the right user id and password, exit 0", async () => {
      const auth = await stubDirectory(db);
      const before = await auditCount();
      const update = vi.fn(ok);
      const c = capture();
      expect(await runReset(db.client, input("thu-giasu-an", "test"), auth, update, c.log, { runId: "9001" })).toBe(0);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith(s.users.tutorAn, PW);
      expect(await auditCount()).toBe(before + 1);
      const row = (
        await db.client.query<{ payload: unknown; correlation_id: string; family_id: string }>(
          "select payload, correlation_id, family_id from english.audit_log where action = $1 order by id desc limit 1",
          [AUDIT_ACTION],
        )
      ).rows[0];
      expect(row).toEqual({ payload: { role: "tutor", login_kind: "short" }, correlation_id: "9001", family_id: TEST_FAMILY_ID });
      const out = c.text();
      expect(out).toContain(SENDING_MARKER);
      expect(out).toContain(CHANGED_MARKER);
      expect(out).toContain("Đã đặt lại mật khẩu cho gia sư (tu***@test.local)");
      expect(out).not.toContain(PW);
      expect(out).not.toContain("tutor-an@test.local");
      expect(c.lines.some((l) => l.kind === "error")).toBe(false);
      // order: found → sending → changed → success
      expect(out.indexOf(SENDING_MARKER)).toBeLessThan(out.indexOf(CHANGED_MARKER));
    });
  });
});
