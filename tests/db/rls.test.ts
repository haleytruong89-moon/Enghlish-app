import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, createTestDb, errorAs, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const ENGLISH_TABLES = ["families", "members", "learners", "relationships", "consents", "audit_log"];

describe("RLS — cross-learner isolation (FR-01, UAT-01)", () => {
  let db: TestDb;
  let s: Seeded;
  let launcherOnlyUser: string;

  const learnerIds = (role: "authenticated", user: string) =>
    rowsAs<{ id: string }>(db.client, role, user, "select id from english.learners order by alias").then((r) =>
      r.map((x) => x.id),
    );

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);

    // A Launcher user: has public.profiles, NO english.members row.
    launcherOnlyUser = await createAuthUser(db.client, "launcher-parent@test.local");
    await db.client.query(`
      with f as (insert into public.families(name) values ('Launcher family') returning id)
      insert into public.profiles(id, family_id, role, display_name)
      select $1, f.id, 'parent', 'Launcher parent' from f`, [launcherOnlyUser]);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("seed created only test learners", async () => {
    const { rows } = await db.client.query("select alias, track_id, is_test from english.learners order by alias");
    expect(rows).toEqual([
      { alias: "An (thử)", track_id: "A", is_test: true },
      { alias: "Nguyên (thử)", track_id: "B", is_test: true },
    ]);
  });

  it("tutor of An sees An only, never Nguyên", async () => {
    expect(await learnerIds("authenticated", s.users.tutorAn)).toEqual([s.learners.an]);
    const direct = await rowsAs(db.client, "authenticated", s.users.tutorAn,
      "select id from english.learners where id = $1", [s.learners.nguyen]);
    expect(direct).toEqual([]);
    const fn = await rowsAs<{ ok: boolean }>(db.client, "authenticated", s.users.tutorAn,
      "select english.eng_can_read_learner($1) as ok", [s.learners.nguyen]);
    expect(fn[0]?.ok).toBe(false);
  });

  it("tutor of Nguyên sees Nguyên only, never An", async () => {
    expect(await learnerIds("authenticated", s.users.tutorNguyen)).toEqual([s.learners.nguyen]);
    const direct = await rowsAs(db.client, "authenticated", s.users.tutorNguyen,
      "select id from english.learners where id = $1", [s.learners.an]);
    expect(direct).toEqual([]);
  });

  it("each student sees only their own learner row", async () => {
    expect(await learnerIds("authenticated", s.users.studentAn)).toEqual([s.learners.an]);
    expect(await learnerIds("authenticated", s.users.studentNguyen)).toEqual([s.learners.nguyen]);
    const cross = await rowsAs(db.client, "authenticated", s.users.studentAn,
      "select id from english.learners where id = $1", [s.learners.nguyen]);
    expect(cross).toEqual([]);
  });

  it("parent sees both learners of the family", async () => {
    expect(await learnerIds("authenticated", s.users.parent)).toEqual([s.learners.an, s.learners.nguyen]);
  });

  it("helper functions report the caller's role", async () => {
    const r = await rowsAs<{ role: string; parent: boolean }>(db.client, "authenticated", s.users.tutorAn,
      "select english.eng_member_role() as role, english.eng_is_parent() as parent");
    expect(r[0]).toEqual({ role: "tutor", parent: false });
    const p = await rowsAs<{ role: string; parent: boolean }>(db.client, "authenticated", s.users.parent,
      "select english.eng_member_role() as role, english.eng_is_parent() as parent");
    expect(p[0]).toEqual({ role: "parent", parent: true });
  });

  it("consents are readable by the parent only", async () => {
    const parent = await rowsAs(db.client, "authenticated", s.users.parent, "select id from english.consents");
    expect(parent.length).toBe(2);
    for (const u of [s.users.tutorAn, s.users.tutorNguyen, s.users.studentAn, s.users.studentNguyen]) {
      expect(await rowsAs(db.client, "authenticated", u, "select id from english.consents")).toEqual([]);
    }
  });

  it("audit_log is readable by the parent only", async () => {
    expect((await rowsAs(db.client, "authenticated", s.users.parent, "select id from english.audit_log")).length)
      .toBeGreaterThan(0);
    expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, "select id from english.audit_log")).toEqual([]);
    expect(await rowsAs(db.client, "authenticated", s.users.studentAn, "select id from english.audit_log")).toEqual([]);
  });

  it("tutor sees only own relationships; student sees the other learner's member row nowhere", async () => {
    const rels = await rowsAs<{ learner_id: string }>(db.client, "authenticated", s.users.tutorAn,
      "select learner_id from english.relationships");
    expect(rels.map((r) => r.learner_id)).toEqual([s.learners.an]);
    const members = await rowsAs<{ id: string }>(db.client, "authenticated", s.users.studentAn,
      "select id from english.members");
    expect(members.map((m) => m.id)).toEqual([s.members.studentAn]);
  });

  it("an expired relationship removes access (FR-01b)", async () => {
    await db.client.query(
      `update english.relationships set valid_from = now() - interval '30 days', valid_to = now() - interval '1 day'
       where member_id = $1`, [s.members.tutorAn]);
    try {
      expect(await learnerIds("authenticated", s.users.tutorAn)).toEqual([]);
    } finally {
      await db.client.query(
        "update english.relationships set valid_to = null where member_id = $1", [s.members.tutorAn]);
    }
    expect(await learnerIds("authenticated", s.users.tutorAn)).toEqual([s.learners.an]);
  });

  it("anon can read nothing (no schema usage)", async () => {
    for (const t of [...ENGLISH_TABLES, "app_errors", "schema_migrations"]) {
      const err = await errorAs(db.client, "anon", null, `select * from english.${t}`);
      expect(err?.code, t).toBe("42501");
    }
    const fn = await errorAs(db.client, "anon", null, "select english.eng_member_role()");
    expect(fn?.code).toBe("42501");
  });

  it("a Launcher-only user (no english.members row) reads nothing in english", async () => {
    // Sanity: the stub Launcher policies do work for this user.
    const prof = await rowsAs(db.client, "authenticated", launcherOnlyUser, "select id from public.profiles");
    expect(prof.length).toBe(1);
    for (const t of ENGLISH_TABLES) {
      expect(await rowsAs(db.client, "authenticated", launcherOnlyUser, `select * from english.${t}`), t).toEqual([]);
    }
    const r = await rowsAs<{ role: string | null; parent: boolean }>(db.client, "authenticated", launcherOnlyUser,
      "select english.eng_member_role() as role, english.eng_is_parent() as parent");
    expect(r[0]).toEqual({ role: null, parent: false });
  });

  it("an English-only tutor sees nothing on the Launcher side (other direction)", async () => {
    for (const t of ["families", "profiles", "audit_log"]) {
      expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, `select * from public.${t}`), t).toEqual([]);
    }
  });

  it("authenticated users cannot write any english table directly", async () => {
    const attempts = [
      ["insert into english.learners(family_id, alias, track_id) values ($1, 'X', 'A')", [s.familyId]],
      ["update english.learners set alias = 'X' where id = $1", [s.learners.an]],
      ["delete from english.relationships where learner_id = $1", [s.learners.an]],
      ["insert into english.audit_log(action) values ('x')", []],
      ["insert into english.consents(learner_id, subject_member_id, notice_version, scope, granted) values ($1, $2, 'v', 'data', true)",
        [s.learners.an, s.members.parent]],
    ] as const;
    for (const [sql, params] of attempts) {
      const err = await errorAs(db.client, "authenticated", s.users.parent, sql, [...params]);
      expect(err?.code, sql).toBe("42501");
    }
  });

  it("integrity: a tutor relationship cannot be attached to a parent member", async () => {
    await expect(db.client.query(
      "insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'tutor')",
      [s.members.parent, s.learners.an],
    )).rejects.toThrow(/must match member role/);
  });
});
