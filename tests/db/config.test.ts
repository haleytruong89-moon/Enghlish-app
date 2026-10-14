import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../lib/config/content";
import { listMigrations } from "../../scripts/lib/migrate";
import { as, createAuthUser, createTestDb, errorAs, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

const cfg = loadConfig();
const CV = cfg.catalogue.meta.version;
const CONFIG_TABLES = [
  "tracks", "assessment_policies", "catalogue_versions", "dimensions", "targets",
  "aggregate_indicators", "activity_templates", "target_set_definitions", "target_sets",
] as const;

describe("S1 configuration (DESIGN §4, §8)", () => {
  let db: TestDb;
  let s: Seeded;
  let launcherOnlyUser: string;

  const count = async (sql: string) => (await db.client.query<{ n: number }>(sql)).rows[0]?.n;

  /** Run owner-level statements and expect a failure; the transaction is always rolled back. */
  const ownerError = async (sql: string, params: unknown[] = []) => {
    await db.client.query("begin");
    try {
      await db.client.query(sql, params);
      return null;
    } catch (err) {
      return err as Error & { code?: string };
    } finally {
      await db.client.query("rollback");
    }
  };

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    launcherOnlyUser = await createAuthUser(db.client, "launcher-only@test.local");
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("migrations 0005 + 0006", () => {
    it("are recorded, and a second full apply is a no-op that keeps the same data", async () => {
      const files = await listMigrations();
      expect(files.map((f) => f.version)).toEqual(["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010", "0011", "0012"]);
      expect(await migrate(db.client)).toEqual([]);
      expect(await migrate(db.client, true)).toEqual(files.map((f) => f.version));
      expect(await count("select count(*)::int as n from english.targets")).toBe(70);
      expect(await count("select count(*)::int as n from english.target_sets")).toBe(2);
    });

    it("seed row counts match the JSON files", async () => {
      expect(await count("select count(*)::int as n from english.tracks")).toBe(2);
      expect(await count("select count(*)::int as n from english.dimensions")).toBe(cfg.catalogue.dimensions.length);
      expect(await count("select count(*)::int as n from english.targets")).toBe(cfg.catalogue.targets.length);
      expect(await count("select count(*)::int as n from english.aggregate_indicators")).toBe(
        cfg.catalogue.aggregate_indicators.length,
      );
      expect(await count("select count(*)::int as n from english.activity_templates")).toBe(8);
      expect(await count("select count(*)::int as n from english.target_set_definitions")).toBe(cfg.targetSets.length);
      expect(await count("select count(*)::int as n from english.assessment_policies")).toBe(1);
    });

    it("catalogue and policy are published and keep the content hash", async () => {
      const cat = await db.client.query(
        "select version, descriptor_version, assessment_policy_version, source_hash, published_at is not null as published from english.catalogue_versions",
      );
      expect(cat.rows).toEqual([
        {
          version: CV,
          descriptor_version: cfg.catalogue.meta.descriptor_version,
          assessment_policy_version: "AP-0.2-pilot",
          source_hash: cfg.hashes.catalogue,
          published: true,
        },
      ]);
      const pol = await db.client.query("select version, config, published_at is not null as published from english.assessment_policies");
      expect(pol.rows).toEqual([{ version: "AP-0.2-pilot", config: cfg.policy.config, published: true }]);
    });

    it("targets keep the whole catalogue row in raw and the typed columns agree with it", async () => {
      const { rows } = await db.client.query<{ id: string; raw: { title_vi: string }; title_vi: string; track_id: string }>(
        "select id, raw, title_vi, track_id from english.targets",
      );
      expect(rows).toHaveLength(70);
      for (const r of rows) expect(r.raw.title_vi).toBe(r.title_vi);
    });

    it("tracks: both active with Reviewer + Coach", async () => {
      const { rows } = await db.client.query("select id, status, ai_modes from english.tracks order by id");
      expect(rows).toEqual([
        { id: "A", status: "active", ai_modes: ["reviewer", "coach"] },
        { id: "B", status: "active", ai_modes: ["reviewer", "coach"] },
      ]);
    });

    it("every target of every target set exists in targets for that track; 12 each", async () => {
      const missing = await db.client.query(`
        select d.id, x as target_id
        from english.target_set_definitions d, unnest(d.target_ids) as x
        where not exists (select 1 from english.targets t
          where t.id = x and t.descriptor_version = d.descriptor_version and t.track_id = d.track_id)`);
      expect(missing.rows).toEqual([]);
      const sizes = await db.client.query("select id, cardinality(target_ids)::int as n from english.target_set_definitions order by id");
      expect(sizes.rows).toEqual([{ id: "A-v1", n: 12 }, { id: "B-v1", n: 12 }]);
      const set = await db.client.query<{ target_ids: string[] }>("select target_ids from english.target_set_definitions where id = 'A-v1'");
      expect(set.rows[0]?.target_ids).toEqual(cfg.targetSets[0]?.target_ids); // order preserved
    });

    it("no aggregate indicator is inside a target set, and none can be a mastery gate", async () => {
      const inSet = await db.client.query(`
        select 1 from english.target_set_definitions d, unnest(d.target_ids) as x
        where x in (select id from english.aggregate_indicators)`);
      expect(inSet.rowCount).toBe(0);
      expect(await count("select count(*)::int as n from english.aggregate_indicators where mastery_gate")).toBe(0);
      const err = await ownerError(
        "update english.aggregate_indicators set mastery_gate = true", []);
      expect(err).not.toBeNull(); // immutable (and the check would reject it anyway)
    });

    it("creates nothing in schema public", async () => {
      const { rows } = await db.client.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('targets','tracks','dimensions','target_sets')");
      expect(rows[0]?.n).toBe(0);
    });
  });

  describe("published rows are immutable", () => {
    const cases: [string, string][] = [
      ["UPDATE target", "update english.targets set title_vi = 'x' where id = 'A-L3-CAUSE-S'"],
      ["DELETE target", "delete from english.targets where id = 'A-L3-CAUSE-S'"],
      ["INSERT target into a published catalogue", `insert into english.targets(id, descriptor_version, catalogue_version, track_id, dimension_id, title_en, title_vi, target_demand, output_modality, success_criteria, opportunity_rule, ai_may_propose, core, status, raw)
        values ('A-NEW', '${CV}', '${CV}', 'A', 'L1', 't', 't', 'A2 / x', 'writing', '[]', 'r', true, true, 'active', '{}')`],
      ["TRUNCATE targets", "truncate english.targets cascade"],
      ["UPDATE dimension", "update english.dimensions set name_vi = 'x' where id = 'L1'"],
      ["DELETE dimension", "delete from english.dimensions where id = 'L1'"],
      ["TRUNCATE dimensions", "truncate english.dimensions cascade"],
      ["UPDATE aggregate", "update english.aggregate_indicators set definition = 'x'"],
      ["DELETE aggregate", "delete from english.aggregate_indicators"],
      ["UPDATE catalogue_versions", "update english.catalogue_versions set published_at = null"],
      ["DELETE catalogue_versions", "delete from english.catalogue_versions"],
      ["TRUNCATE catalogue_versions", "truncate english.catalogue_versions cascade"],
      ["UPDATE policy", "update english.assessment_policies set config = '{}'"],
      ["DELETE policy", "delete from english.assessment_policies"],
      ["TRUNCATE policies", "truncate english.assessment_policies cascade"],
      ["UPDATE target set definition", "update english.target_set_definitions set target_ids = '{A-X1-TURN}' where id = 'A-v1'"],
      ["DELETE target set definition", "delete from english.target_set_definitions where id = 'A-v1'"],
      ["TRUNCATE target set definitions", "truncate english.target_set_definitions cascade"],
    ];
    for (const [name, sql] of cases) {
      it(`rejects ${name} even for the table owner`, async () => {
        const err = await ownerError(sql);
        expect(err?.code, err?.message).toBe("42501");
      });
    }

    it("a draft (unpublished) catalogue version can be built up, then is locked once published", async () => {
      await db.client.query("begin");
      try {
        await db.client.query(
          `insert into english.catalogue_versions(version, descriptor_version, assessment_policy_version, source_hash, meta)
           values ('9.9-test', '9.9-test', 'AP-0.2-pilot', 'h', '{}')`,
        );
        await db.client.query(
          `insert into english.dimensions(id, catalogue_version, dim_group, name_en, name_vi, ai_scorable, cefr_applicable, extension, track_ids, rubric, rubric_vi, raw)
           values ('L1', '9.9-test', 'language', 'g', 'g', true, true, false, '{A}', '{}', '{}', '{}')`,
        );
        await db.client.query("update english.dimensions set name_vi = 'edited' where catalogue_version = '9.9-test'");
        await db.client.query("update english.catalogue_versions set published_at = now() where version = '9.9-test'");
        await db.client.query("savepoint locked");
        await expect(
          db.client.query("update english.dimensions set name_vi = 'again' where catalogue_version = '9.9-test'"),
        ).rejects.toThrow(/published configuration row/);
      } finally {
        await db.client.query("rollback");
      }
    });

    it("a target set cannot be created with a missing, duplicated or other-track target", async () => {
      const insert = (ids: string, track = "A") =>
        `insert into english.target_set_definitions(id, track_id, version, descriptor_version, catalogue_version, target_ids, source_hash, published_at)
         values ('T-bad', '${track}', 99, '${cfg.catalogue.meta.descriptor_version}', '${CV}', '${ids}', 'h', now())`;
      expect((await ownerError(insert("{A-DOES-NOT-EXIST}")))?.message).toMatch(/does not exist/);
      expect((await ownerError(insert("{A-X1-TURN,A-X1-TURN}")))?.message).toMatch(/duplicate/);
      expect((await ownerError(insert("{B-T1-EXAM-R}")))?.message).toMatch(/does not exist/);
      expect((await ownerError(insert("{AGG-A-RET-DELAYED}")))?.message).toMatch(/does not exist/);
    });
  });

  describe("target set definition integrity (insert AND update)", () => {
    it("the checks also run on UPDATE of an unpublished definition", async () => {
      await db.client.query("begin");
      try {
        await db.client.query(
          `insert into english.target_set_definitions(id, track_id, version, descriptor_version, catalogue_version, target_ids, source_hash)
           values ('T-draft', 'A', 98, '${cfg.catalogue.meta.descriptor_version}', '${CV}', '{A-X1-TURN}', 'h')`,
        );
        await expect(
          db.client.query("update english.target_set_definitions set target_ids = '{A-DOES-NOT-EXIST}' where id = 'T-draft'"),
        ).rejects.toThrow(/does not exist/);
      } finally {
        await db.client.query("rollback");
      }
    });

    it("a definition cannot be published against an unpublished catalogue version", async () => {
      await db.client.query("begin");
      try {
        await db.client.query(
          `insert into english.catalogue_versions(version, descriptor_version, assessment_policy_version, source_hash, meta)
           values ('9.8-draft', '${cfg.catalogue.meta.descriptor_version}', 'AP-0.2-pilot', 'h', '{}')`,
        );
        // as a draft it is fine ...
        await db.client.query(
          `insert into english.target_set_definitions(id, track_id, version, descriptor_version, catalogue_version, target_ids, source_hash)
           values ('T-draft', 'A', 97, '${cfg.catalogue.meta.descriptor_version}', '9.8-draft', '{A-X1-TURN}', 'h')`,
        );
        // ... publishing it is not
        await db.client.query("savepoint s0");
        await expect(
          db.client.query("update english.target_set_definitions set published_at = now() where id = 'T-draft'"),
        ).rejects.toThrow(/catalogue version 9\.8-draft is not published yet/);
        await db.client.query("rollback to savepoint s0");
        await expect(
          db.client.query(
            `insert into english.target_set_definitions(id, track_id, version, descriptor_version, catalogue_version, target_ids, source_hash, published_at)
             values ('T-pub', 'A', 96, '${cfg.catalogue.meta.descriptor_version}', '9.8-draft', '{A-X1-TURN}', 'h', now())`,
          ),
        ).rejects.toThrow(/not published yet/);
      } finally {
        await db.client.query("rollback");
      }
    });
  });

  describe("RLS and grants", () => {
    const reads = (user: string, table: string) =>
      rowsAs(db.client, "authenticated", user, `select * from english.${table}`);

    it("every family member reads the published config; counts match", async () => {
      for (const user of [s.users.studentAn, s.users.studentNguyen, s.users.tutorAn, s.users.parent]) {
        expect((await reads(user, "targets")).length).toBe(70);
        expect((await reads(user, "dimensions")).length).toBe(18);
        expect((await reads(user, "aggregate_indicators")).length).toBe(21);
        expect((await reads(user, "tracks")).length).toBe(2);
        expect((await reads(user, "activity_templates")).length).toBe(8);
        expect((await reads(user, "assessment_policies")).length).toBe(1);
        expect((await reads(user, "catalogue_versions")).length).toBe(1);
        expect((await reads(user, "target_set_definitions")).length).toBe(2);
      }
    });

    it("an account with no english.members row (e.g. Launcher-only) reads nothing", async () => {
      for (const table of CONFIG_TABLES) {
        expect(await reads(launcherOnlyUser, table), table).toEqual([]);
      }
    });

    it("anon cannot read any config table", async () => {
      for (const table of CONFIG_TABLES) {
        const err = await errorAs(db.client, "anon", null, `select * from english.${table}`);
        expect(err?.code, table).toBe("42501");
      }
    });

    it("unpublished config is invisible to members", async () => {
      await db.client.query("begin");
      try {
        await db.client.query(
          `insert into english.assessment_policies(version, config, source_hash) values ('AP-draft', '{}', 'h')`,
        );
        await db.client.query(
          `insert into english.catalogue_versions(version, descriptor_version, assessment_policy_version, source_hash, meta)
           values ('9.9-draft', '9.9-draft', 'AP-draft', 'h', '{}')`,
        );
        await db.client.query(
          `insert into english.dimensions(id, catalogue_version, dim_group, name_en, name_vi, ai_scorable, cefr_applicable, extension, track_ids, rubric, rubric_vi, raw)
           values ('L1', '9.9-draft', 'language', 'g', 'g', true, true, false, '{A}', '{}', '{}', '{}')`,
        );
        await db.client.query("select set_config('request.jwt.claim.sub', $1, true)", [s.users.parent]);
        await db.client.query("set local role authenticated");
        const pol = await db.client.query("select version from english.assessment_policies order by 1");
        const cat = await db.client.query("select version from english.catalogue_versions order by 1");
        const dim = await db.client.query("select 1 from english.dimensions where catalogue_version = '9.9-draft'");
        expect(pol.rows.map((r) => r.version)).toEqual(["AP-0.2-pilot"]);
        expect(cat.rows.map((r) => r.version)).toEqual([CV]);
        expect(dim.rowCount).toBe(0);
      } finally {
        await db.client.query("rollback");
      }
    });

    it("authenticated and service_role cannot write any config table", async () => {
      for (const table of CONFIG_TABLES) {
        for (const role of ["authenticated", "service_role"] as const) {
          for (const sql of [
            `insert into english.${table} default values`,
            `update english.${table} set ${table === "assessment_policies" || table === "catalogue_versions" ? "version" : "id"} = null`,
            `delete from english.${table}`,
            `truncate english.${table}`,
          ]) {
            const user = role === "authenticated" ? s.users.parent : null;
            const err = await errorAs(db.client, role, user, sql);
            expect(err?.code, `${role}: ${sql}`).toBe("42501");
          }
        }
      }
    });

    it("target_sets: each student sees only their own", async () => {
      const an = await rowsAs<{ learner_id: string; definition_id: string }>(db.client, "authenticated", s.users.studentAn,
        "select learner_id, definition_id from english.target_sets");
      expect(an).toEqual([{ learner_id: s.learners.an, definition_id: "A-v1" }]);
      const ng = await rowsAs<{ learner_id: string; definition_id: string }>(db.client, "authenticated", s.users.studentNguyen,
        "select learner_id, definition_id from english.target_sets");
      expect(ng).toEqual([{ learner_id: s.learners.nguyen, definition_id: "B-v1" }]);
    });

    it("target_sets: tutor of An cannot read Nguyên's, and vice versa; parent sees both", async () => {
      const ids = async (user: string) =>
        (await rowsAs<{ learner_id: string }>(db.client, "authenticated", user, "select learner_id from english.target_sets order by 1"))
          .map((r) => r.learner_id);
      expect(await ids(s.users.tutorAn)).toEqual([s.learners.an]);
      expect(await ids(s.users.tutorNguyen)).toEqual([s.learners.nguyen]);
      expect((await ids(s.users.parent)).sort()).toEqual([s.learners.an, s.learners.nguyen].sort());
      const direct = await rowsAs(db.client, "authenticated", s.users.tutorAn,
        "select 1 from english.target_sets where learner_id = $1", [s.learners.nguyen]);
      expect(direct).toEqual([]);
    });
  });

  describe("learners.track_id → tracks", () => {
    it("has a validated foreign key, and an unknown track is rejected", async () => {
      const fk = await db.client.query(
        "select convalidated from pg_constraint where conname = 'learners_track_id_fkey' and contype = 'f'",
      );
      expect(fk.rows).toEqual([{ convalidated: true }]);
      const err = await ownerError(
        `insert into english.learners(family_id, alias, track_id) values ($1, 'X', 'C')`, [s.familyId]);
      expect(err?.code).toMatch(/^23(503|514)$/);
    });
  });

  describe("learners.track_id after a target set was assigned", () => {
    it("cannot be changed once the learner has a target_sets row", async () => {
      const err = await ownerError("update english.learners set track_id = 'B' where id = $1", [s.learners.an]);
      expect(err?.code).toBe("23514");
      expect(err?.message).toMatch(/track change after a target set was assigned is not supported/);
    });

    it("can still be changed (and set to the same value) for a learner without any target set", async () => {
      await db.client.query("begin");
      try {
        const id = (await db.client.query<{ id: string }>(
          "insert into english.learners(family_id, alias, track_id) values ($1, 'Em mới', 'A') returning id", [s.familyId])).rows[0]?.id;
        await db.client.query("update english.learners set track_id = 'B' where id = $1", [id]);
        await db.client.query("update english.learners set track_id = 'B' where id = $1", [id]);
        expect((await db.client.query("select track_id from english.learners where id = $1", [id])).rows).toEqual([{ track_id: "B" }]);
      } finally {
        await db.client.query("rollback");
      }
    });

    it("an update that does not touch track_id is fine for a learner with a set", async () => {
      await db.client.query("begin");
      try {
        await db.client.query("update english.learners set track_id = track_id where id = $1", [s.learners.an]);
      } finally {
        await db.client.query("rollback");
      }
    });
  });

  describe("eng_assign_target_set", () => {
    it("rejects a set from another track", async () => {
      const err = await ownerError("select english.eng_assign_target_set($1, 'B-v1')", [s.learners.an]);
      expect(err?.code).toBe("23514");
      expect(err?.message).toMatch(/another track/);
    });

    it("rejects unknown learner / unknown set", async () => {
      expect((await ownerError("select english.eng_assign_target_set('00000000-0000-4000-8000-000000000000', 'A-v1')"))?.code).toBe("P0002");
      expect((await ownerError("select english.eng_assign_target_set($1, 'A-v9')", [s.learners.an]))?.code).toBe("P0002");
    });

    it("is not executable by authenticated or anon, but is by service_role", async () => {
      for (const [role, user] of [["authenticated", s.users.parent], ["anon", null]] as const) {
        const err = await errorAs(db.client, role, user, "select english.eng_assign_target_set($1, 'A-v1')", [s.learners.an]);
        expect(err?.code, role).toBe("42501");
      }
      const id = await as(db.client, "service_role", null, async (q) =>
        (await q("select english.eng_assign_target_set($1, 'A-v1') as id", [s.learners.an])).rows[0].id);
      expect(id).toBeTruthy();
    });

    it("is idempotent for the current set and writes one audit receipt per real change", async () => {
      const before = await count("select count(*)::int as n from english.target_sets");
      await db.client.query("select english.eng_assign_target_set($1, 'A-v1')", [s.learners.an]);
      expect(await count("select count(*)::int as n from english.target_sets")).toBe(before);

      const audit = await db.client.query(
        "select action, learner_id, payload from english.audit_log where action = 'target_set.assigned' order by learner_id");
      expect(audit.rows).toHaveLength(2);
      expect(audit.rows.map((r) => r.payload.target_set).sort()).toEqual(["A-v1", "B-v1"]);
      expect(JSON.stringify(audit.rows)).not.toMatch(/alias|An \(thử\)/); // no names in the receipt
    });

    it("a new version is a new definition + new assignment; the old rows stay", async () => {
      await db.client.query("begin");
      try {
        await db.client.query(
          `insert into english.target_set_definitions(id, track_id, version, descriptor_version, catalogue_version, target_ids, tracking_only, source_hash, published_at)
           select 'A-v2', track_id, 2, descriptor_version, catalogue_version, target_ids[1:11], tracking_only, 'h', now()
           from english.target_set_definitions where id = 'A-v1'`,
        );
        await db.client.query("select english.eng_assign_target_set($1, 'A-v2')", [s.learners.an]);
        const rows = await db.client.query(
          "select definition_id from english.target_sets where learner_id = $1 order by effective_from desc, created_at desc", [s.learners.an]);
        expect(rows.rows.map((r) => r.definition_id)).toEqual(["A-v2", "A-v1"]);
      } finally {
        await db.client.query("rollback");
      }
    });

    it("two assignments in ONE transaction: the second is the current set (deterministic order)", async () => {
      await db.client.query("begin");
      try {
        await db.client.query(
          `insert into english.target_set_definitions(id, track_id, version, descriptor_version, catalogue_version, target_ids, tracking_only, source_hash, published_at)
           select 'B-v2-test', track_id, 2, descriptor_version, catalogue_version, target_ids[1:11], tracking_only, 'h', now()
           from english.target_set_definitions where id = 'B-v1'`,
        );
        const current = async () =>
          (await db.client.query<{ definition_id: string }>(
            "select definition_id from english.target_sets where learner_id = $1 order by effective_from desc, seq desc limit 1",
            [s.learners.nguyen])).rows[0]?.definition_id;
        await db.client.query("select english.eng_assign_target_set($1, 'B-v2-test')", [s.learners.nguyen]);
        expect(await current()).toBe("B-v2-test");
        // going back to B-v1 inside the same transaction is a real change (not "already current") and wins
        await db.client.query("select english.eng_assign_target_set($1, 'B-v1')", [s.learners.nguyen]);
        expect(await current()).toBe("B-v1");
        // and assigning B-v1 again is idempotent even though now() has not moved
        const n = await count("select count(*)::int as n from english.target_sets");
        await db.client.query("select english.eng_assign_target_set($1, 'B-v1')", [s.learners.nguyen]);
        expect(await count("select count(*)::int as n from english.target_sets")).toBe(n);
        const seqs = (await db.client.query<{ seq: string }>(
          "select seq from english.target_sets where learner_id = $1 order by seq", [s.learners.nguyen])).rows.map((r) => Number(r.seq));
        expect(new Set(seqs).size).toBe(seqs.length);
        expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
      } finally {
        await db.client.query("rollback");
      }
    });

    it("target_sets is append-only, even for the owner", async () => {
      for (const [sql, msg] of [
        ["update english.target_sets set definition_id = definition_id", /UPDATE is forbidden/],
        ["delete from english.target_sets", /DELETE is forbidden/],
        ["truncate english.target_sets", /TRUNCATE is forbidden/],
      ] as const) {
        expect((await ownerError(sql))?.message, sql).toMatch(msg);
      }
    });
  });

  describe("purge", () => {
    it("removes the learner's target_sets (and only theirs)", async () => {
      const receipt = await as(db.client, "service_role", null, async (q) => {
        const r = (await q("select english.eng_purge_learner($1, $2) as r", [s.learners.an, s.users.parent])).rows[0].r;
        const left = (await q("select learner_id from english.target_sets")).rows;
        return { r, left };
      });
      expect(receipt.r.deleted.target_sets).toBe(1);
      expect(receipt.left).toEqual([{ learner_id: s.learners.nguyen }]);
    });
  });
});
