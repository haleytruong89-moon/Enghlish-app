import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, errorAs, migrate, seed, type Seeded, type TestDb } from "./helpers";

describe("append-only audit_log + controlled purge (DESIGN §6, FR-21)", () => {
  let db: TestDb;
  let s: Seeded;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    await db.client.query(
      `insert into english.audit_log(action, family_id, learner_id, payload) values
        ('test.an', $1, $2, '{}'), ('test.nguyen', $1, $3, '{}')`,
      [s.familyId, s.learners.an, s.learners.nguyen],
    );
    // A non-owner role that HAS table privileges, to prove the trigger (not grants) blocks it.
    await db.client.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'eng_test_writer') then
          create role eng_test_writer nologin bypassrls;
        end if;
      end $$;
      alter role eng_test_writer nologin bypassrls;
      grant usage on schema english to eng_test_writer;
      grant select, update, delete, truncate on english.audit_log to eng_test_writer;`);
  });
  afterAll(async () => {
    if (db) {
      await db.client.query("revoke all on english.audit_log from eng_test_writer; revoke all on schema english from eng_test_writer;");
      await db.drop();
    }
  });

  it("service_role can INSERT into audit_log", async () => {
    const n = await as(db.client, "service_role", null, async (q) => {
      await q("insert into english.audit_log(action, family_id) values ('svc.insert', $1)", [s.familyId]);
      return (await q("select count(*)::int as n from english.audit_log where action = 'svc.insert'")).rows[0].n;
    });
    expect(n).toBe(1);
  });

  it("service_role has no UPDATE/DELETE/TRUNCATE privilege", async () => {
    for (const sql of [
      "update english.audit_log set action = 'x'",
      "delete from english.audit_log",
      "truncate english.audit_log",
    ]) {
      expect((await errorAs(db.client, "service_role", null, sql))?.code, sql).toBe("42501");
    }
  });

  it("trigger rejects UPDATE / DELETE / TRUNCATE even for the table owner", async () => {
    for (const [sql, msg] of [
      ["update english.audit_log set action = 'x' where action = 'test.an'", /UPDATE is forbidden/],
      ["delete from english.audit_log where action = 'test.an'", /DELETE is forbidden/],
      ["truncate english.audit_log", /TRUNCATE is forbidden/],
    ] as const) {
      await db.client.query("begin");
      await expect(db.client.query(sql), sql).rejects.toThrow(msg);
      await db.client.query("rollback");
    }
  });

  it("setting app.purge_learner by hand does not open the door", async () => {
    await db.client.query("begin");
    try {
      await db.client.query("set local role eng_test_writer");
      await db.client.query("select set_config('app.purge_learner', $1, true)", [s.learners.an]);
      await expect(
        db.client.query("delete from english.audit_log where learner_id = $1", [s.learners.an]),
      ).rejects.toThrow(/DELETE is forbidden/);
    } finally {
      await db.client.query("rollback");
    }
    await db.client.query("begin");
    try {
      await db.client.query("set local role eng_test_writer");
      await db.client.query("select set_config('app.purge_learner', $1, true)", [s.learners.an]);
      await expect(db.client.query("truncate english.audit_log")).rejects.toThrow(/TRUNCATE is forbidden/);
    } finally {
      await db.client.query("rollback");
    }
  });

  it("authenticated and anon cannot execute eng_purge_learner", async () => {
    const e1 = await errorAs(db.client, "authenticated", s.users.parent,
      "select english.eng_purge_learner($1)", [s.learners.an]);
    expect(e1?.code).toBe("42501");
    const e2 = await errorAs(db.client, "anon", null, "select english.eng_purge_learner($1)", [s.learners.an]);
    expect(e2?.code).toBe("42501");
  });

  it("purge via the function (service_role) removes one learner's data and writes a receipt", async () => {
    const result = await as(db.client, "service_role", null, async (q) => {
      const receipt = (await q("select english.eng_purge_learner($1, $2) as r", [s.learners.an, s.users.parent]))
        .rows[0].r;
      const guc = (await q("select coalesce(current_setting('app.purge_learner', true), '') as v")).rows[0].v;
      const counts = (await q(
        `select
          (select count(*)::int from english.learners where id = $1) as an_learner,
          (select count(*)::int from english.learners where id = $2) as nguyen_learner,
          (select count(*)::int from english.relationships where learner_id = $1) as an_rels,
          (select count(*)::int from english.consents where learner_id = $1) as an_consents,
          (select count(*)::int from english.audit_log where learner_id = $1 and action <> 'learner.purged') as an_audit,
          (select count(*)::int from english.audit_log where learner_id = $2) as nguyen_audit,
          (select count(*)::int from english.members where id = $3) as an_member,
          (select count(*)::int from english.audit_log where learner_id = $1 and action = 'learner.purged') as receipts`,
        [s.learners.an, s.learners.nguyen, s.members.studentAn],
      )).rows[0];
      return { receipt, guc, counts };
    });
    expect(result.guc).toBe(""); // door closed again before returning
    expect(result.counts).toEqual({
      an_learner: 0, nguyen_learner: 1, an_rels: 0, an_consents: 0,
      // Nguyên keeps 2 rows: the test-seed audit row + the S1 `target_set.assigned` receipt.
      an_audit: 0, nguyen_audit: 2, an_member: 0, receipts: 1,
    });
    expect(result.receipt).toMatchObject({
      learner_id: s.learners.an,
      was_test: true,
      deleted: { learners: 1, consents: 1, relationships: 2, members: 1, target_sets: 1 },
    });
  });

  it("purge of an unknown learner fails", async () => {
    const err = await errorAs(db.client, "service_role", null,
      "select english.eng_purge_learner('00000000-0000-4000-8000-000000000000')");
    expect(err?.message).toMatch(/not found/);
  });

  it("the purge receipt itself is append-only", async () => {
    await db.client.query("select english.eng_purge_learner($1)", [s.learners.nguyen]);
    await db.client.query("begin");
    await expect(
      db.client.query("delete from english.audit_log where action = 'learner.purged'"),
    ).rejects.toThrow(/DELETE is forbidden/);
    await db.client.query("rollback");
  });
});
