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

  type Added = { key: string; label_vi: string; group_key: string | null; created: boolean };
  type Grouped = { key: string; group_key: string; changed: boolean };
  type Leaf = { kind: string; track_id: string; ref_key: string; label_vi: string; level_from: string | null; level_to: string | null;
    task_from: number | null; task_to: number | null; core: boolean; hidden_in_picker: boolean; related: string[]; custom: boolean; in_set: boolean };
  type MapJson = { map_id: string; track_id: string; assumed: Record<string, string | number>;
    domains: { key: string; name_vi: string; scale: string; groups: { key: string; name_vi: string; desc: Record<string, string | null>; leaves: Leaf[] }[] }[];
    unassigned: Leaf[] };
  const addV2 = (learner: string, label: string, group: string | null, by: string) =>
    svc<Added>("select english.eng_add_error_tag_v2($1, $2, $3, $4, $5) as r", [learner, customTagKey(label), label, group, by]);
  const addV1 = (learner: string, label: string, by: string) =>
    svc<Added>("select english.eng_add_error_tag($1, $2, $3, $4) as r", [learner, customTagKey(label), label, by]);
  const setGroup = (learner: string, key: string, group: string, by: string) =>
    svc<Grouped>("select english.eng_set_tag_group($1, $2, $3, $4) as r", [learner, key, group, by]);
  const mapOf = (learner: string) => svc<MapJson>("select english.eng_skill_map($1) as r", [learner]);
  const leavesOf = (m: MapJson) => m.domains.flatMap((d) => d.groups.flatMap((g) => g.leaves.map((l) => ({ ...l, group: g.key }))));
  let oldKey = "";
  let grouped = "";

  describe("2. a new family tag needs a group of the map (v2); the old function still works", () => {
    it("staff add a tag into a group; the row keeps its group; the same label again returns it", async () => {
      const a = await addV2(NG(), "Đảo ngữ phủ định", "gr-emphasis", M().tutorNguyen);
      expect(a).toMatchObject({ label_vi: "Đảo ngữ phủ định", group_key: "gr-emphasis", created: true });
      expect(a.key).toMatch(/^x-dao-ngu-phu-dinh-[0-9a-f]{5}$/);
      grouped = a.key;
      expect(await q1("select group_key, group_vi, origin from english.error_tags where key = $1", [a.key])).toEqual([{ group_key: "gr-emphasis", group_vi: "Nhãn riêng", origin: "custom" }]);
      expect(await addV2(NG(), " đảo ngữ  phủ định ", "gr-tense", M().parent)).toMatchObject({ key: a.key, group_key: "gr-emphasis", created: false });
    });

    it("a seed label returns the seed tag, whose group stays in the map (never in error_tags)", async () => {
      expect(await addV2(NG(), "Dạng từ", "vo-word-form", M().tutorNguyen)).toEqual({ key: "dang-tu", label_vi: "Dạng từ", group_key: null, created: false });
      await fail(db.client.query("update english.error_tags set group_key = 'vo-word-form' where track_id = 'B' and key = 'dang-tu'"), "23514");
    });

    it("refuses a group outside the map, a missing group, a bad key; the old function still adds an ungrouped tag", async () => {
      await fail(addV2(NG(), "Nhãn lạ", "gr-nope", M().tutorNguyen), "23514", /\(unknown_group\)/);
      await fail(addV2(NG(), "Nhãn lạ", "Ngữ pháp", M().tutorNguyen), "23514", /\(unknown_group\)/);
      await fail(addV2(NG(), "Nhãn lạ", null, M().tutorNguyen), "22004");
      await fail(svc("select english.eng_add_error_tag_v2($1, 'khong-x', 'Nhãn', 'gr-tense', $2) as r", [NG(), M().tutorNguyen]), "22023");
      const old = await addV1(NG(), "Lỗi chính tả thử", M().tutorNguyen);
      expect(old.created).toBe(true);
      oldKey = old.key;
      expect(await q1("select group_key from english.error_tags where key = $1", [oldKey])).toEqual([{ group_key: null }]);
    });

    it("only staff of this child: a student, the other child's tutor and another family are refused", async () => {
      for (const who of [M().studentNguyen, M().tutorAn, parent2Member]) await fail(addV2(NG(), "Không được", "gr-tense", who), "42501");
      await fail(addV2(randomUUID(), "Không có em", "gr-tense", M().tutorNguyen), "P0002");
    });
  });

  describe("3. 'Xếp vào nhóm' for an old family tag", () => {
    it("the parent groups it once; the same group again is a replay; another group is refused; an audit row is written", async () => {
      expect(await setGroup(NG(), oldKey, "wr-sentence-mech", M().parent)).toEqual({ key: oldKey, group_key: "wr-sentence-mech", changed: true });
      expect(await setGroup(NG(), oldKey, "wr-sentence-mech", M().tutorNguyen)).toEqual({ key: oldKey, group_key: "wr-sentence-mech", changed: false });
      await fail(setGroup(NG(), oldKey, "wr-genre", M().tutorNguyen), "23514", /\(already_grouped\)/);
      const log = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'error_tag.grouped' order by id desc limit 1");
      expect(log[0]?.payload).toEqual({ tag_key: oldKey, group_key: "wr-sentence-mech", map_id: "SM-1" });
    });

    it("a seed tag, another family's tag and an unknown key look the same: not found", async () => {
      const other = await addV1(learner2, "Nhãn nhà khác", parent2Member);
      await fail(setGroup(NG(), "dang-tu", "gr-tense", M().tutorNguyen), "P0002");
      await fail(setGroup(NG(), other.key, "gr-tense", M().tutorNguyen), "P0002");
      await fail(setGroup(NG(), "x-khong-co-abcde", "gr-tense", M().tutorNguyen), "P0002");
    });

    it("refuses an unknown group, and anyone who is not staff of this child", async () => {
      const t = await addV1(NG(), "Nhãn chưa xếp hai", M().tutorNguyen);
      await fail(setGroup(NG(), t.key, "gr-nope", M().tutorNguyen), "23514", /\(unknown_group\)/);
      for (const who of [M().studentNguyen, M().tutorAn, parent2Member]) await fail(setGroup(NG(), t.key, "gr-tense", who), "42501");
    });
  });

  describe("4. eng_skill_map", () => {
    it("Nguyên (B): 7 domains, 40 groups, the 24 B tags + the family's grouped tags, all 70 skills with the 12 of B-v1 flagged", async () => {
      const m = await mapOf(NG());
      expect([m.map_id, m.track_id]).toEqual(["SM-1", "B"]);
      expect(m.assumed).toEqual({ grammar: "B2", vocab: "B2", reading: "B2", listening: "B2", writing: "B2", speaking: "B2", thinking: 2 });
      expect(m.domains.map((d) => d.key)).toEqual(["grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking"]);
      expect(m.domains.flatMap((d) => d.groups)).toHaveLength(40);
      const all = leavesOf(m);
      const tags = all.filter((l) => l.kind === "tag");
      expect(tags.filter((l) => !l.custom)).toHaveLength(24);
      expect(tags.every((l) => l.track_id === m.track_id)).toBe(true);
      expect(tags.filter((l) => l.custom).map((l) => [l.ref_key, l.group]).sort()).toEqual([[grouped, "gr-emphasis"], [oldKey, "wr-sentence-mech"]].sort());
      const targets = all.filter((l) => l.kind === "target");
      expect(targets).toHaveLength(70);
      expect(targets.filter((l) => l.in_set).map((l) => l.ref_key).sort()).toEqual([
        "B-L1-COMPLEX-W", "B-L1-TRANSFORM-W", "B-L2-CLOZE", "B-L2-PRECISE", "B-L4-EXPLAIN-S", "B-T11-QUALIFY", "B-T1-ARG-R", "B-T1-EXAM-R",
        "B-T2-ASSUME-R", "B-T5-DATAOP", "B-T5-SOURCE", "B-T7-ARGUE",
      ].sort());
      expect(all.find((l) => l.ref_key === "B-L1-TRANSFORM-W")).toMatchObject({ label_vi: "Viết lại câu giữ nguyên nghĩa", level_from: "B1", level_to: "B2", group: "gr-transform" });
      expect(all.find((l) => l.ref_key === "doc-fact-opinion")).toMatchObject({ related: ["B-T5-DATAOP"], group: "re-structure", custom: false });
      // inside a group: seed tags, then family tags, then skills of the set, then the other skills
      const conditional = m.domains[0]!.groups.find((g) => g.key === "gr-conditional")!.leaves.map((l) => l.ref_key);
      expect(conditional).toEqual(["cau-dieu-kien-dao-ngu", "wish-would-rather", "B-L1-HYPO-W"]);
      // the still-ungrouped tag of the family is the only thing in "Chưa xếp mảng"
      expect(m.unassigned.map((l) => [l.ref_key, l.custom])).toEqual([[expect.stringMatching(/^x-nhan-chua-xep-hai-/), true]]);
    });

    it("An (A): 16 tags incl. the hidden 'Đọc hiểu (KET Reading)', the 12 skills of A-v1 flagged, no family tag of track B", async () => {
      const m = await mapOf(AN());
      expect(m.assumed).toEqual({ grammar: "A2", vocab: "A2", reading: "A2", listening: "A2", writing: "A2", speaking: "A2", thinking: 1 });
      const all = leavesOf(m);
      expect(all.filter((l) => l.kind === "tag")).toHaveLength(16);
      expect(all.filter((l) => l.hidden_in_picker).map((l) => [l.ref_key, l.label_vi, l.group])).toEqual([["doc-hieu", "Đọc hiểu (KET Reading)", "re-gist-detail"]]);
      expect(all.filter((l) => l.in_set)).toHaveLength(12);
      expect(all.some((l) => l.custom)).toBe(false);
      expect(m.unassigned).toEqual([]);
    });

    it("another family sees its own tags only; an unknown learner is not found", async () => {
      const m = await mapOf(learner2);
      expect(m.unassigned.map((l) => l.label_vi)).toEqual(["Nhãn nhà khác"]);
      expect(leavesOf(m).some((l) => l.custom)).toBe(false);
      expect(leavesOf(m).filter((l) => l.in_set)).toHaveLength(0); // no target set assigned
      await fail(mapOf(randomUUID()), "P0002");
    });

    it("the three functions are closed to everyone but service_role; the internal helper to everyone", async () => {
      const acl = await q1<{ proname: string; anon: boolean; auth: boolean; svc: boolean }>(`
        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
               has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'english' and p.proname in ('eng_add_error_tag_v2', 'eng_set_tag_group', 'eng_skill_map', 'eng_current_skill_map')
        order by p.proname`);
      expect(acl.map((a) => [a.proname, a.anon, a.auth, a.svc])).toEqual([
        ["eng_add_error_tag_v2", false, false, true],
        ["eng_current_skill_map", false, false, false],
        ["eng_set_tag_group", false, false, true],
        ["eng_skill_map", false, false, true],
      ]);
    });
  });
});
