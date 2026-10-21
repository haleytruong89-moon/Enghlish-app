import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customTagKey } from "../../lib/tutorwork/frameScore";
import { asCommit, createAuthUser, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** SM-1 (migration 0019): the skill map. One database for the whole file. */
describe("SM-1 skill map (migration 0019)", () => {
  let db: TestDb;
  let s: Seeded;
  let family2: string;
  let parent2Member: string;
  let learner2: string;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const n = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    const parent2User = await createAuthUser(db.client, "parent2@test.local");
    family2 = (await q1<{ id: string }>("insert into english.families(name) values ('Other family') returning id"))[0]!.id;
    parent2Member = (await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'parent', 'Other parent') returning id", [parent2User, family2]))[0]!.id;
    learner2 = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Other child', 'B', true, 'active') returning id", [family2]))[0]!.id;
    await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [parent2Member, learner2]);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. the published map", () => {
    it("SM-1 is published with 7 domains, 40 groups, 110 leaves (40 tags + 70 skills)", async () => {
      expect(await q1("select id, catalogue_version, published_at is not null as published from english.skill_maps")).toEqual([
        { id: "SM-1", catalogue_version: "0.2.1-draft", published: true },
      ]);
      expect((await q1<{ key: string }>("select key from english.skill_domains where map_id = 'SM-1' order by ord")).map((r) => r.key)).toEqual([
        "grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking",
      ]);
      expect(await n("select count(*)::int as n from english.skill_groups where map_id = 'SM-1'")).toBe(40);
      expect(await q1("select kind, count(*)::int as n from english.skill_leaves where map_id = 'SM-1' group by kind order by kind")).toEqual([
        { kind: "tag", n: 40 },
        { kind: "target", n: 70 },
      ]);
    });

    it("every seed tag still in use has exactly one leaf, and A's doc-hieu is hidden from the picker", async () => {
      expect(await n(`select count(*)::int as n from english.error_tags t where t.family_id is null and t.retired_at is null
                      and not exists (select 1 from english.skill_leaves lf where lf.map_id = 'SM-1' and lf.kind = 'tag' and lf.track_id = t.track_id and lf.ref_key = t.key)`)).toBe(0);
      expect(await q1("select track_id, ref_key, group_key from english.skill_leaves where hidden_in_picker")).toEqual([
        { track_id: "A", ref_key: "doc-hieu", group_key: "re-gist-detail" },
      ]);
      expect(await q1("select ref_key, level_from, level_to, task_from, task_to from english.skill_leaves where ref_key in ('B-L1-TRANSFORM-W', 'B-T5-SUPPORT', 'B-L7-DATA') order by ref_key")).toEqual([
        { ref_key: "B-L1-TRANSFORM-W", level_from: "B1", level_to: "B2", task_from: null, task_to: null },
        { ref_key: "B-L7-DATA", level_from: null, level_to: null, task_from: null, task_to: null },
        { ref_key: "B-T5-SUPPORT", level_from: null, level_to: null, task_from: 3, task_to: 4 },
      ]);
      expect(await q1("select related from english.skill_leaves where kind = 'tag' and track_id = 'B' and ref_key = 'doc-fact-opinion'")).toEqual([{ related: ["B-T5-DATAOP"] }]);
    });

    it("is immutable: no insert, update, delete or truncate on any of the four tables, even for the owner", async () => {
      const tries = [
        "update english.skill_maps set title_vi = 'x'",
        "delete from english.skill_maps",
        "update english.skill_groups set name_vi = 'x' where key = 'gr-tense'",
        "delete from english.skill_domains where key = 'thinking'",
        "update english.skill_leaves set core = true",
        "insert into english.skill_leaves(map_id, kind, track_id, ref_key, group_key, ord) values ('SM-1', 'tag', 'B', 'x-new', 'gr-tense', 999)",
        "truncate english.skill_leaves",
      ];
      for (const sql of tries) {
        const err = await db.client.query(sql).then(() => null, (e: unknown) => e as { code?: string });
        expect(err?.code, sql).toBe("42501");
      }
      // the other three are referenced by foreign keys (a plain TRUNCATE fails earlier); each still has its truncate guard
      expect(await n(`select count(*)::int as n from pg_trigger where not tgisinternal and tgname in
                      ('skill_maps_immutable_truncate', 'skill_domains_immutable_truncate', 'skill_groups_immutable_truncate', 'skill_leaves_immutable_truncate')`)).toBe(4);
    });

    it("running every migration again changes nothing", async () => {
      const before = await q1("select (select count(*) from english.skill_leaves)::int as l, (select published_at from english.skill_maps) as p");
      await migrate(db.client, true);
      expect(await q1("select (select count(*) from english.skill_leaves)::int as l, (select published_at from english.skill_maps) as p")).toEqual(before);
    });

    it("members read the published map; anon reads nothing", async () => {
      expect((await rowsAs<{ n: number }>(db.client, "authenticated", s.users.tutorNguyen, "select count(*)::int as n from english.skill_groups"))[0]?.n).toBe(40);
      const anon = await q1<{ t: string; ok: boolean }>(`select t, has_table_privilege('anon', ('english.' || t)::regclass, 'select') as ok
                    from unnest(array['skill_maps', 'skill_domains', 'skill_groups', 'skill_leaves']) as t`);
      expect(anon.every((r) => !r.ok)).toBe(true);
    });
  });
});
