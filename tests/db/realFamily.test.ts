import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMigrations } from "../../scripts/lib/migrate";
import {
  checkPrerequisites,
  checkRealFamilyEmails,
  findAuthUsersTriggersWritingPublic,
} from "../../scripts/lib/realFamilyPrecheck";
import {
  checkRealFamilyConflicts,
  createRealFamily,
  REAL_CONSENT_VERSION,
  REAL_FAMILY_ID,
  REAL_LEARNER_AN_ID,
  REAL_LEARNER_NGUYEN_ID,
  type RealFamilyUsers,
} from "../../scripts/lib/realFamily";
import { createAuthUser, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const NAMES = { tutorAn: "Cô Lan", tutorNguyen: "Thầy Minh" };
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TSX = `${ROOT}node_modules/.bin/tsx`;

describe("S1b: create the real family", () => {
  let db: TestDb;
  let test: Seeded; // the TEST family must never be touched
  let users: RealFamilyUsers;

  const q = async <R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.client.query<R>(sql, params)).rows;
  const n = async (sql: string, params: unknown[] = []) => ((await q<{ n: number }>(sql, params))[0] as { n: number }).n;

  /** Everything in the english schema that belongs to a family, as comparable rows. */
  const snapshot = async (familyId: string) => ({
    families: await q("select * from english.families where id = $1 order by id", [familyId]),
    members: await q("select * from english.members where family_id = $1 order by user_id", [familyId]),
    learners: await q("select id, alias, track_id, is_test, ai_enabled, status, member_id from english.learners where family_id = $1 order by id", [familyId]),
    relationships: await q(
      "select r.member_id, r.learner_id, r.relation, r.valid_to from english.relationships r join english.learners l on l.id = r.learner_id where l.family_id = $1 order by 1,2,3",
      [familyId],
    ),
    consents: await q("select c.* from english.consents c join english.learners l on l.id = c.learner_id where l.family_id = $1 order by c.id", [familyId]),
    targetSets: await q("select t.* from english.target_sets t join english.learners l on l.id = t.learner_id where l.family_id = $1 order by t.learner_id, t.seq", [familyId]),
  });
  const auditCount = () => n("select count(*)::int as n from english.audit_log");

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    test = await seed(db.client);
    users = {
      parent: await createAuthUser(db.client, "bo-me@example.com"),
      studentAn: await createAuthUser(db.client, "an@example.com"),
      studentNguyen: await createAuthUser(db.client, "nguyen@example.com"),
      tutorAn: await createAuthUser(db.client, "co-lan@example.com"),
      tutorNguyen: await createAuthUser(db.client, "thay-minh@example.com"),
    };
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("refuses without touching anything when a person already belongs to another family (transaction)", async () => {
    const before = await auditCount();
    await expect(createRealFamily(db.client, { ...users, parent: test.users.parent }, NAMES)).rejects.toThrow(/gia đình\/vai trò khác/);
    await expect(createRealFamily(db.client, { ...users, studentAn: test.users.studentNguyen }, NAMES)).rejects.toThrow(/khác/);
    expect(await n("select count(*)::int as n from english.families where id = $1", [REAL_FAMILY_ID])).toBe(0);
    expect(await n("select count(*)::int as n from english.members where family_id = $1", [REAL_FAMILY_ID])).toBe(0);
    expect(await auditCount()).toBe(before);
    // the pre-check used by the CLI before it creates any auth user says the same
    await expect(checkRealFamilyConflicts(db.client, { parent: test.users.parent })).rejects.toThrow(/khác/);
    // a person cannot hold two roles
    await expect(checkRealFamilyConflicts(db.client, { parent: users.parent, tutorAn: users.parent })).rejects.toThrow(/riêng/);
  });

  it("rolls back everything written so far when a later statement fails", async () => {
    // Occupy the learner's external_ref in the test family: the learner insert (after family + members) violates a unique key.
    await db.client.query("update english.learners set external_ref = 'skillgrow:child:an' where id = $1", [test.learners.an]);
    try {
      await expect(createRealFamily(db.client, users, NAMES)).rejects.toThrow();
    } finally {
      await db.client.query("update english.learners set external_ref = 'skillgrow:child:an:test' where id = $1", [test.learners.an]);
    }
    expect(await n("select count(*)::int as n from english.families where id = $1", [REAL_FAMILY_ID])).toBe(0);
    expect(await n("select count(*)::int as n from english.members where family_id = $1", [REAL_FAMILY_ID])).toBe(0);
    expect(await n("select count(*)::int as n from english.consents where learner_id in ($1, $2)", [REAL_LEARNER_AN_ID, REAL_LEARNER_NGUYEN_ID])).toBe(0);
  });

  it("creates exactly the expected rows, leaves the test family and auth.users alone", async () => {
    const testBefore = await snapshot(test.familyId);
    const authBefore = await q("select * from auth.users order by id");
    const publicBefore = await q("select id from public.profiles order by id");

    const res = await createRealFamily(db.client, users, NAMES);
    expect(res.familyId).toBe(REAL_FAMILY_ID);
    expect(res.inserted).toBeGreaterThan(0);

    const real = await snapshot(REAL_FAMILY_ID);
    expect(real.families).toHaveLength(1);
    expect(real.members.map((m) => [m.role, m.display_name, m.color]).sort()).toEqual(
      [
        ["parent", "Phụ huynh", null],
        ["student", "An", "#9A4A15"],
        ["student", "Nguyên", "#2F5D9E"],
        ["tutor", "Cô Lan", null],
        ["tutor", "Thầy Minh", null],
      ].sort(),
    );
    expect(real.learners.map((l) => [l.id, l.alias, l.track_id, l.is_test, l.ai_enabled, l.status])).toEqual([
      [REAL_LEARNER_AN_ID, "An", "A", false, false, "active"],
      [REAL_LEARNER_NGUYEN_ID, "Nguyên", "B", false, false, "active"],
    ]);
    // each learner is bound to its own student member
    expect(real.learners.map((l) => l.member_id)).toEqual([res.members.studentAn, res.members.studentNguyen]);

    // parent -> both learners; each tutor -> only their own learner; all active
    const rels = real.relationships.map((r) => `${r.relation}:${r.member_id}:${r.learner_id}:${r.valid_to}`).sort();
    expect(rels).toEqual(
      [
        `parent:${res.members.parent}:${REAL_LEARNER_AN_ID}:null`,
        `parent:${res.members.parent}:${REAL_LEARNER_NGUYEN_ID}:null`,
        `tutor:${res.members.tutorAn}:${REAL_LEARNER_AN_ID}:null`,
        `tutor:${res.members.tutorNguyen}:${REAL_LEARNER_NGUYEN_ID}:null`,
      ].sort(),
    );

    // one `data` consent per learner, subject = recorded_by = the parent; no AI consent
    expect(real.consents.map((c) => [c.learner_id, c.subject_member_id, c.recorded_by, c.notice_version, c.scope, c.granted]).sort()).toEqual(
      [
        [REAL_LEARNER_AN_ID, res.members.parent, res.members.parent, REAL_CONSENT_VERSION, "data", true],
        [REAL_LEARNER_NGUYEN_ID, res.members.parent, res.members.parent, REAL_CONSENT_VERSION, "data", true],
      ].sort(),
    );

    // target sets A-v1 / B-v1, one each
    expect(real.targetSets.map((t) => [t.learner_id, t.definition_id])).toEqual([
      [REAL_LEARNER_AN_ID, "A-v1"],
      [REAL_LEARNER_NGUYEN_ID, "B-v1"],
    ]);

    // no inquiries given automatically
    expect(await n("select count(*)::int as n from english.inquiry_instances where learner_id in ($1, $2)", [REAL_LEARNER_AN_ID, REAL_LEARNER_NGUYEN_ID])).toBe(0);

    // exactly one audit row, with no email or name in the payload
    const audit = await q<{ payload: unknown }>("select payload from english.audit_log where action = 'family.create_real'");
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]?.payload)).not.toMatch(/@|Lan|Minh/);

    // the test family, the auth users and the Launcher side are untouched
    expect(await snapshot(test.familyId)).toEqual(testBefore);
    expect(await q("select * from auth.users order by id")).toEqual(authBefore);
    expect(await q("select id from public.profiles order by id")).toEqual(publicBefore);
    expect(await n("select count(*)::int as n from english.learners where is_test = false")).toBe(2);
  });

  it("is idempotent: a second run (even with other tutor names) writes nothing", async () => {
    const before = await snapshot(REAL_FAMILY_ID);
    const audits = await auditCount();
    const again = await createRealFamily(db.client, users, { tutorAn: "Tên khác", tutorNguyen: "Tên khác nữa" });
    expect(again.inserted).toBe(0);
    expect(await snapshot(REAL_FAMILY_ID)).toEqual(before);
    expect(await auditCount()).toBe(audits);
  });

  it("refuses to swap a tutor, a parent or a student already in place", async () => {
    const other = await createAuthUser(db.client, "co-khac@example.com");
    const before = await snapshot(REAL_FAMILY_ID);
    await expect(createRealFamily(db.client, { ...users, tutorAn: other }, NAMES)).rejects.toThrow(/gia sư của An đã có người khác/);
    await expect(createRealFamily(db.client, { ...users, parent: other }, NAMES)).rejects.toThrow(/phụ huynh khác/);
    await expect(createRealFamily(db.client, { ...users, studentNguyen: other }, NAMES)).rejects.toThrow(/Nguyên đã gắn/);
    expect(await snapshot(REAL_FAMILY_ID)).toEqual(before);
  });

  it("RLS: each real tutor sees only their learner; the parent sees both; nothing leaks to or from the test family", async () => {
    const ids = (user: string) =>
      rowsAs<{ id: string }>(db.client, "authenticated", user, "select id from english.learners order by alias").then((r) => r.map((x) => x.id));
    expect(await ids(users.tutorAn)).toEqual([REAL_LEARNER_AN_ID]);
    expect(await ids(users.tutorNguyen)).toEqual([REAL_LEARNER_NGUYEN_ID]);
    expect(await rowsAs(db.client, "authenticated", users.tutorAn, "select id from english.learners where id = $1", [REAL_LEARNER_NGUYEN_ID])).toEqual([]);
    expect(await ids(users.studentAn)).toEqual([REAL_LEARNER_AN_ID]);
    expect(await ids(users.studentNguyen)).toEqual([REAL_LEARNER_NGUYEN_ID]);
    expect((await ids(users.parent)).sort()).toEqual([REAL_LEARNER_AN_ID, REAL_LEARNER_NGUYEN_ID].sort());
    // the test family cannot see the real one, and the real parent cannot see the test one
    expect(await ids(test.users.parent)).toEqual([test.learners.an, test.learners.nguyen]);
    expect(await ids(test.users.tutorAn)).toEqual([test.learners.an]);
    // consents only for the real parent
    expect((await rowsAs(db.client, "authenticated", users.parent, "select id from english.consents")).length).toBe(2);
    expect(await rowsAs(db.client, "authenticated", users.tutorAn, "select id from english.consents")).toEqual([]);
  });

  it("a learner without a student account stops the run with a clear message", async () => {
    await db.client.query("update english.learners set member_id = null where id = $1", [REAL_LEARNER_AN_ID]);
    try {
      await expect(checkRealFamilyConflicts(db.client, {})).rejects.toThrow(/chưa gắn với tài khoản học sinh/);
      await expect(createRealFamily(db.client, users, NAMES)).rejects.toThrow(/chưa gắn với tài khoản học sinh/);
    } finally {
      await db.client.query("update english.learners set member_id = (select id from english.members where user_id = $2) where id = $1", [
        REAL_LEARNER_AN_ID,
        users.studentAn,
      ]);
    }
  });

  it("email pre-check: an email that differs from the person already in a slot is refused; the same email passes", async () => {
    const emailOfUser = async (id: string) =>
      ((await q<{ email: string }>("select email from auth.users where id = $1", [id]))[0]?.email ?? null)?.toLowerCase() ?? null;
    const same = {
      parent: "bo-me@example.com",
      studentAn: "an@example.com",
      studentNguyen: "nguyen@example.com",
      tutorAn: "co-lan@example.com",
      tutorNguyen: "thay-minh@example.com",
    };
    await expect(checkRealFamilyEmails(db.client, same, emailOfUser)).resolves.toBeUndefined();
    // a brand-new email (no account anywhere) for each filled slot
    for (const slot of Object.keys(same) as (keyof typeof same)[]) {
      await expect(checkRealFamilyEmails(db.client, { ...same, [slot]: "new-person@example.com" }, emailOfUser)).rejects.toThrow(
        /đã có người, nhưng email bạn nhập khác/,
      );
    }
  });

  it("re-run never moves a learner back to A-v1/B-v1 after a later target set was assigned", async () => {
    // a later set for Track B (clone of B-v1; definitions are immutable once published, so this stays in this throwaway DB)
    await db.client.query(
      `insert into english.target_set_definitions(id, track_id, version, descriptor_version, catalogue_version, target_ids, tracking_only, source_hash, published_at)
       select 'B-v2', track_id, 2, descriptor_version, catalogue_version, target_ids, tracking_only, 'test-hash-b-v2', now()
       from english.target_set_definitions where id = 'B-v1'`,
    );
    await db.client.query("select english.eng_assign_target_set($1, 'B-v2')", [REAL_LEARNER_NGUYEN_ID]);
    const before = await snapshot(REAL_FAMILY_ID);
    const again = await createRealFamily(db.client, users, NAMES);
    expect(again.inserted).toBe(0);
    expect(again.kept).toContain("Bộ kỹ năng của Nguyên: không đổi (đã có lịch sử, đang theo bộ khác).");
    expect(await snapshot(REAL_FAMILY_ID)).toEqual(before);
    const current = await q<{ definition_id: string }>(
      "select definition_id from english.target_sets where learner_id = $1 order by effective_from desc, seq desc limit 1",
      [REAL_LEARNER_NGUYEN_ID],
    );
    expect(current[0]?.definition_id).toBe("B-v2");
  });

  it("re-run leaves a tutor relationship with history alone (ended, or a different tutor) and reports it", async () => {
    await db.client.query(
      "update english.relationships set valid_to = now() + interval '1 second' where learner_id = $1 and relation = 'tutor'",
      [REAL_LEARNER_AN_ID],
    );
    const tutorRows = () =>
      q("select member_id, valid_to is not null as ended from english.relationships where learner_id = $1 and relation = 'tutor'", [REAL_LEARNER_AN_ID]);
    const before = await tutorRows();
    expect(before).toHaveLength(1);

    // same tutor, relationship ended: not re-created
    const same = await createRealFamily(db.client, users, NAMES);
    expect(same.inserted).toBe(0);
    expect(same.kept).toContain("Gia sư của An: không đổi (đã có lịch sử).");
    expect(await tutorRows()).toEqual(before);

    // another tutor requested for the same learner: the slot counts as filled by the ended row -> refused, nothing inserted
    const newTutor = await createAuthUser(db.client, "co-moi@example.com");
    const members = () => n("select count(*)::int as n from english.members where family_id = $1", [REAL_FAMILY_ID]);
    const membersBefore = await members();
    await expect(createRealFamily(db.client, { ...users, tutorAn: newTutor }, NAMES)).rejects.toThrow(/gia sư của An đã có người khác/);
    expect(await members()).toBe(membersBefore);
    expect(await tutorRows()).toEqual(before);
    expect(await n("select count(*)::int as n from english.relationships where learner_id = $1 and relation = 'tutor'", [REAL_LEARNER_AN_ID])).toBe(1);
  });

  it("email pre-check: the tutor slot is filled by an ended or future-dated tutor relationship too", async () => {
    const emailOfUser = async (id: string) =>
      ((await q<{ email: string }>("select email from auth.users where id = $1", [id]))[0]?.email ?? null)?.toLowerCase() ?? null;
    const emails = {
      parent: "bo-me@example.com",
      studentAn: "an@example.com",
      studentNguyen: "nguyen@example.com",
      tutorAn: "co-lan@example.com",
      tutorNguyen: "thay-minh@example.com",
    };
    // the previous test left An's tutor relationship ended; make Nguyên's one end in the future
    await db.client.query(
      "update english.relationships set valid_to = now() + interval '1 day' where learner_id = $1 and relation = 'tutor'",
      [REAL_LEARNER_NGUYEN_ID],
    );
    await expect(checkRealFamilyEmails(db.client, emails, emailOfUser)).resolves.toBeUndefined();
    await expect(checkRealFamilyEmails(db.client, { ...emails, tutorAn: "co-moi@example.com" }, emailOfUser)).rejects.toThrow(
      /đã có người, nhưng email bạn nhập khác/,
    );
    await expect(checkRealFamilyEmails(db.client, { ...emails, tutorNguyen: "thay-moi@example.com" }, emailOfUser)).rejects.toThrow(
      /đã có người, nhưng email bạn nhập khác/,
    );
  });
});

describe("S1b: prerequisites and Launcher trigger pre-checks (read-only)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db?.drop();
  });
  const versions = async () => (await listMigrations()).map((m) => m.version);

  it("refuses a database without the english schema or with migrations missing", async () => {
    await expect(checkPrerequisites(db.client, await versions())).rejects.toThrow(/chưa áp đủ migration \(còn thiếu: 0001/);
    await migrate(db.client);
    await db.client.query("delete from english.schema_migrations where version = (select max(version) from english.schema_migrations)");
    await expect(checkPrerequisites(db.client, await versions())).rejects.toThrow(/chưa áp đủ migration/);
    await migrate(db.client);
    await expect(checkPrerequisites(db.client, await versions())).resolves.toBeUndefined();
  });

  it("refuses when A-v1 / B-v1 are not published", async () => {
    await db.client.query("alter table english.target_set_definitions disable trigger user");
    try {
      await db.client.query("update english.target_set_definitions set published_at = null where id = 'B-v1'");
      await expect(checkPrerequisites(db.client, await versions())).rejects.toThrow(/B-v1 chưa được công bố/);
    } finally {
      await db.client.query("update english.target_set_definitions set published_at = now() where id = 'B-v1'");
      await db.client.query("alter table english.target_set_definitions enable trigger user");
    }
    await expect(checkPrerequisites(db.client, await versions())).resolves.toBeUndefined();
  });

  it("reports triggers on auth.users that write to schema public, and ignores others", async () => {
    expect(await findAuthUsersTriggersWritingPublic(db.client)).toEqual([]);
    await db.client.query(`
      create schema other_app;
      create function other_app.harmless() returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger harmless_t after insert on auth.users for each row execute function other_app.harmless();`);
    expect(await findAuthUsersTriggersWritingPublic(db.client)).toEqual([]);
    await db.client.query(`
      create function other_app.make_profile() returns trigger language plpgsql as $$
      begin insert into public.audit_log(actor, action) values (new.id, 'new_user'); return new; end $$;
      create trigger make_profile_t after insert on auth.users for each row execute function other_app.make_profile();`);
    const found = await findAuthUsersTriggersWritingPublic(db.client);
    expect(found.map((f) => f.trigger)).toEqual(["make_profile_t"]);
  });
});

const PASSWORDS = {
  NEW_PASSWORD_PARENT: "parent-secret-pw-001",
  NEW_PASSWORD_AN: "an-secret-pw-0000002",
  NEW_PASSWORD_NGUYEN: "nguyen-secret-pw-003",
  NEW_PASSWORD_TUTOR_AN: "tutor-an-secret-pw-04",
  NEW_PASSWORD_TUTOR_NGUYEN: "tutor-nguyen-secret-5",
};
const ALL_PASSWORD_VALUES = Object.values(PASSWORDS);

function cliEnv(db: TestDb, extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    DATABASE_URL: db.url,
    PARENT_EMAIL: "Bo.Me@Example.com", // typed with capitals: the lookup is case-insensitive
    AN_EMAIL: "an@example.com",
    NGUYEN_EMAIL: "nguyen@example.com",
    TUTOR_AN_EMAIL: "co-lan@example.com",
    TUTOR_AN_NAME: "Cô Lan",
    TUTOR_NGUYEN_EMAIL: "thay-minh@example.com",
    TUTOR_NGUYEN_NAME: "Thầy Minh",
    ...PASSWORDS,
    ...extra,
  };
}
function runCli(db: TestDb, extra: Record<string, string> = {}) {
  return spawnSync(TSX, ["scripts/create-real-family.ts", "--auth=stub"], { cwd: ROOT, env: cliEnv(db, extra) as NodeJS.ProcessEnv, encoding: "utf8" });
}
const noPasswordLeak = (r: { stdout: string; stderr: string }) => {
  for (const v of ALL_PASSWORD_VALUES) {
    expect(r.stdout).not.toContain(v);
    expect(r.stderr).not.toContain(v);
  }
};

describe("S1b: CLI with the stub auth (reuses existing accounts, never touches them)", () => {
  let db: TestDb;
  let test: Seeded;

  const run = (extra: Record<string, string> = {}) => runCli(db, extra);
  const authRows = async () => (await db.client.query("select id, email from auth.users order by email")).rows;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    test = await seed(db.client);
    // the parent and An already have a login (as in the Launcher)
    await db.client.query("insert into auth.users(email) values ('bo.me@example.com'), ('an@example.com')");
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("stops on invalid input before any database work", () => {
    const r = run({ NGUYEN_EMAIL: "an@example.com", TUTOR_AN_NAME: "" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/khác nhau/);
    expect(r.stderr).toMatch(/tên gia sư của An/);
  });

  it("stops before creating any account when a needed password is missing, short or shared", async () => {
    const before = await authRows();
    const missing = run({ NEW_PASSWORD_TUTOR_NGUYEN: "" });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("NEW_PASSWORD_TUTOR_NGUYEN");
    const short = run({ NEW_PASSWORD_NGUYEN: "short" });
    expect(short.status).toBe(1);
    expect(short.stderr).toMatch(/NEW_PASSWORD_NGUYEN phải có ít nhất 12/);
    // one shared password for both tutors would let one log in as the other
    const shared = run({ NEW_PASSWORD_TUTOR_NGUYEN: PASSWORDS.NEW_PASSWORD_TUTOR_AN });
    expect(shared.status).toBe(1);
    expect(shared.stderr).toMatch(/NEW_PASSWORD_TUTOR_AN và NEW_PASSWORD_TUTOR_NGUYEN đang giống nhau/);
    for (const r of [missing, short, shared]) noPasswordLeak(r);
    expect(await authRows()).toEqual(before);
    expect(await db.client.query("select 1 from english.families where id = $1", [REAL_FAMILY_ID])).toHaveProperty("rowCount", 0);
  });

  it("stops before creating any account when an existing login belongs to another family", async () => {
    const before = await authRows();
    const r = run({ PARENT_EMAIL: "PARENT@test.local" }); // the TEST family's parent login
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/gia đình\/vai trò khác/);
    expect(await authRows()).toEqual(before); // no new auth user was left behind
    expect(await db.client.query("select 1 from english.families where id = $1", [REAL_FAMILY_ID])).toHaveProperty("rowCount", 0);
  });

  it("reuses the existing accounts (case-insensitive), creates only the missing ones, prints no password", async () => {
    const before = await authRows();
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toContain("Đã tạo gia đình THẬT");
    expect(out).toContain(REAL_CONSENT_VERSION);
    noPasswordLeak(r);
    expect(out).toMatch(/Phụ huynh\s+bo\.me@example\.com\s+đã có sẵn \(dùng chung Launcher\)/);
    expect(out).toMatch(/An\s+an@example\.com\s+đã có sẵn \(dùng chung Launcher\)/);
    expect(out).toMatch(/Nguyên\s+nguyen@example\.com\s+tài khoản tạo mới ở lần chạy này — mật khẩu tạm = secret NEW_PASSWORD_NGUYEN/);
    expect(out).toMatch(/Gia sư của An\s+co-lan@example\.com\s+tài khoản tạo mới ở lần chạy này — mật khẩu tạm = secret NEW_PASSWORD_TUTOR_AN/);

    const after = await authRows();
    expect(after.length).toBe(before.length + 3);
    for (const row of before) expect(after).toContainEqual(row); // existing accounts: same id, same email
    expect((await db.client.query("select count(*)::int as n from english.members where family_id = $1", [REAL_FAMILY_ID])).rows[0]).toEqual({ n: 5 });
    expect((await db.client.query("select count(*)::int as n from english.learners where is_test = false")).rows[0]).toEqual({ n: 2 });
    expect(test.familyId).not.toBe(REAL_FAMILY_ID);
  });

  it("running it again changes nothing (and needs no password: every account exists)", async () => {
    const before = await authRows();
    const r = run(Object.fromEntries(Object.keys(PASSWORDS).map((k) => [k, ""])));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("không đổi gì");
    expect(r.stdout).toMatch(/Gia sư của An\s+co-lan@example\.com\s+tạo bởi công cụ này|đã có sẵn/);
    expect(await authRows()).toEqual(before);
    expect((await db.client.query("select count(*)::int as n from english.audit_log where action = 'family.create_real'")).rows[0]).toEqual({ n: 1 });
  });

  it("refuses a NEW email for a slot already filled, and creates no auth user", async () => {
    const before = await authRows();
    for (const [name, email] of [
      ["TUTOR_AN_EMAIL", "co-moi@example.com"],
      ["TUTOR_NGUYEN_EMAIL", "thay-moi@example.com"],
      ["PARENT_EMAIL", "me-moi@example.com"],
      ["AN_EMAIL", "an-moi@example.com"],
      ["NGUYEN_EMAIL", "nguyen-moi@example.com"],
    ] as const) {
      const r = run({ [name]: email });
      expect(r.status, name).toBe(1);
      expect(r.stderr, name).toMatch(/đã có người, nhưng email bạn nhập khác/);
      noPasswordLeak(r);
    }
    expect(await authRows()).toEqual(before);
    expect((await db.client.query("select count(*)::int as n from english.members where family_id = $1", [REAL_FAMILY_ID])).rows[0]).toEqual({ n: 5 });
  });

  it("refuses a NEW tutor email when the learner's tutor relationship has ENDED: no auth user, no member row", async () => {
    await db.client.query(
      "update english.relationships set valid_to = now() + interval '1 second' where learner_id = $1 and relation = 'tutor'",
      [REAL_LEARNER_AN_ID],
    );
    try {
      const before = await authRows();
      const r = run({ TUTOR_AN_EMAIL: "co-moi@example.com" });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/đã có người, nhưng email bạn nhập khác/);
      noPasswordLeak(r);
      expect(await authRows()).toEqual(before);
      expect((await db.client.query("select count(*)::int as n from english.members where family_id = $1", [REAL_FAMILY_ID])).rows[0]).toEqual({ n: 5 });
    } finally {
      await db.client.query("update english.relationships set valid_to = null where learner_id = $1 and relation = 'tutor'", [REAL_LEARNER_AN_ID]);
    }
  });
});

describe("S1b: CLI on a database that is not ready", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb(); // stub only: no english schema
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("refuses before creating any account when migrations are missing", async () => {
    const r = runCli(db);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/chưa áp đủ migration/);
    expect(r.stderr).not.toMatch(/CẢNH BÁO/);
    expect((await db.client.query("select count(*)::int as n from auth.users")).rows[0]).toEqual({ n: 0 });
  });

  it("refuses when the target sets A-v1 / B-v1 are not published", async () => {
    await migrate(db.client);
    await db.client.query("alter table english.target_set_definitions disable trigger user");
    await db.client.query("update english.target_set_definitions set published_at = null where id = 'A-v1'");
    const r = runCli(db);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/A-v1 chưa được công bố/);
    expect((await db.client.query("select count(*)::int as n from auth.users")).rows[0]).toEqual({ n: 0 });
  });
});

describe("S1b: CLI summary wording, Launcher trigger warning, failure after accounts were created", () => {
  let db: TestDb;
  let test: Seeded;
  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    test = await seed(db.client);
    // The real Supabase column that holds user_metadata; the stub has none until a test adds it.
    await db.client.query("alter table auth.users add column raw_user_meta_data jsonb");
    // A tutor account made by an earlier run of this tool (not in the family yet) and a Launcher login without metadata.
    await db.client.query(
      "insert into auth.users(email, raw_user_meta_data) values ('co-lan@example.com', '{\"app\":\"learning-os\"}'), ('bo.me@example.com', '{}')",
    );
    // Like the Launcher's "profile for every new user" trigger.
    await db.client.query(`
      create function public.make_profile() returns trigger language plpgsql as $$
      begin insert into public.audit_log(actor, action) values (new.id, 'new_user'); return new; end $$;
      create trigger make_profile_t after insert on auth.users for each row execute function public.make_profile();`);
  });
  afterAll(async () => {
    await db?.drop();
  });
  const authCount = async () => ((await db.client.query("select count(*)::int as n from auth.users")).rows[0] as { n: number }).n;

  it("a failure AFTER accounts were created says so (and the database stays rolled back)", async () => {
    await db.client.query("update english.learners set external_ref = 'skillgrow:child:an' where id = $1", [test.learners.an]);
    const before = await authCount();
    const r = runCli(db);
    await db.client.query("update english.learners set external_ref = 'skillgrow:child:an:test' where id = $1", [test.learners.an]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^CẢNH BÁO: đã tạo 3 tài khoản đăng nhập/m);
    expect(await authCount()).toBe(before + 3);
    noPasswordLeak(r);
    expect((await db.client.query("select count(*)::int as n from english.members where family_id = $1", [REAL_FAMILY_ID])).rows[0]).toEqual({ n: 0 });
    // the accounts stay; the next run reuses them (no duplicates)
    await db.client.query("delete from auth.users where email in ('an@example.com', 'nguyen@example.com', 'thay-minh@example.com')");
  });

  it("tells apart: new in this run / made by this tool earlier / existing Launcher login; warns about the Launcher trigger", async () => {
    const r = runCli(db);
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout;
    noPasswordLeak(r);
    expect(out).toMatch(/Lưu ý: Launcher có thể tự tạo hồ sơ cho tài khoản mới \(trigger make_profile_t/);
    expect(out).toMatch(/Phụ huynh\s+bo\.me@example\.com\s+đã có sẵn \(dùng chung Launcher\)/);
    expect(out).toMatch(/Gia sư của An\s+co-lan@example\.com\s+tạo ở lần chạy trước bởi công cụ này \(metadata app=learning-os, chưa có trong gia đình\)/);
    expect(out).toMatch(/Nguyên\s+nguyen@example\.com\s+tài khoản tạo mới ở lần chạy này/);
    expect(out).toMatch(/Gia sư của Nguyên\s+thay-minh@example\.com\s+tài khoản tạo mới ở lần chạy này/);
  });

  it("on the next run the tool-made tutor is reported as already in the family", () => {
    const r = runCli(db);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Gia sư của An\s+co-lan@example\.com\s+tạo bởi công cụ này ở lần chạy trước, đã có trong gia đình/);
    expect(r.stdout).toContain("không đổi gì");
    expect(r.stdout).not.toContain("Lưu ý: Launcher"); // nothing to create → nothing to warn about
  });
});
