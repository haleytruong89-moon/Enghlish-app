import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
});

describe("S1b: CLI with the stub auth (reuses existing accounts, never touches them)", () => {
  let db: TestDb;
  let test: Seeded;

  const env = (extra: Record<string, string> = {}): Record<string, string> => ({
    PATH: process.env.PATH ?? "",
    DATABASE_URL: db.url,
    PARENT_EMAIL: "Bo.Me@Example.com", // typed with capitals: the lookup is case-insensitive
    AN_EMAIL: "an@example.com",
    NGUYEN_EMAIL: "nguyen@example.com",
    TUTOR_AN_EMAIL: "co-lan@example.com",
    TUTOR_AN_NAME: "Cô Lan",
    TUTOR_NGUYEN_EMAIL: "thay-minh@example.com",
    TUTOR_NGUYEN_NAME: "Thầy Minh",
    NEW_ACCOUNT_TEMP_PASSWORD: "super-secret-temp-pw-123",
    ...extra,
  });
  const run = (extra: Record<string, string> = {}) =>
    spawnSync(TSX, ["scripts/create-real-family.ts", "--auth=stub"], { cwd: ROOT, env: env(extra) as NodeJS.ProcessEnv, encoding: "utf8" });
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
    expect(out).not.toContain("super-secret-temp-pw-123");
    expect(out).toMatch(/Phụ huynh\s+bo\.me@example\.com\s+đã có tài khoản/);
    expect(out).toMatch(/An\s+an@example\.com\s+đã có tài khoản/);
    expect(out).toMatch(/Nguyên\s+nguyen@example\.com\s+tạo mới/);

    const after = await authRows();
    expect(after.length).toBe(before.length + 3);
    for (const row of before) expect(after).toContainEqual(row); // existing accounts: same id, same email
    expect((await db.client.query("select count(*)::int as n from english.members where family_id = $1", [REAL_FAMILY_ID])).rows[0]).toEqual({ n: 5 });
    expect((await db.client.query("select count(*)::int as n from english.learners where is_test = false")).rows[0]).toEqual({ n: 2 });
    expect(test.familyId).not.toBe(REAL_FAMILY_ID);
  });

  it("running it again changes nothing", async () => {
    const before = await authRows();
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("không đổi gì");
    expect(await authRows()).toEqual(before);
    expect((await db.client.query("select count(*)::int as n from english.audit_log where action = 'family.create_real'")).rows[0]).toEqual({ n: 1 });
  });
});
