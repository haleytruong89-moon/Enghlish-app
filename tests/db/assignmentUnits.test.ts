import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** UX round 2B · Giao theo Unit (migration 0029). One database. */
describe("assignment_units + eng_create_assignment_v2 (migration 0029)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  const unitRow = (n: number, points: string[] = [], extra: Record<string, unknown> = {}) => ({
    code: `U${n}`, title: `Unit ${n}`, section: "Grammar", page: 6 * n, skipped: false, points,
    missing_points: [], needs_review: false, review_reason: null, origin: "ai", dropped: false, edit_reason: null, ...extra,
  });
  const updatedAt = async (v: string) => (await q1<{ t: string }>("select updated_at::text as t from english.curriculum_versions where id = $1", [v]))[0]!.t;
  /** A fresh approved curriculum (v1) for a learner; returns ids. */
  async function approved(learner: string, by: string, units = [unitRow(1, ["cum-dong-tu"]), unitRow(2, ["thanh-ngu"]), unitRow(3, [], { skipped: true })]) {
    const c = await svc<{ curriculum_id: string; version_id: string }>(
      "select english.eng_create_curriculum($1,$2,null,null,false,$3,$4) as r", [learner, `Giáo trình ${randomUUID().slice(0, 4)}`, by, randomUUID()]);
    await svc("select english.eng_save_curriculum_draft($1,$2::jsonb,$3,$4) as r", [c.version_id, JSON.stringify({ units, ignored: [] }), await updatedAt(c.version_id), by]);
    const fin = units.filter((u) => !u.dropped).map((u) => ({ code: u.code, title: u.title, section: u.section, page: u.page, skipped: u.skipped, points: u.points }));
    await svc("select english.eng_approve_curriculum_version($1,$2,$3::jsonb,null,$4) as r", [c.version_id, await updatedAt(c.version_id), JSON.stringify(fin), by]);
    return c;
  }
  type Made = { id: string; replayed?: boolean; units?: number };
  const make = (o: { learner?: string; by?: string; tags?: string[]; units?: unknown[]; clientId?: string; title?: string } = {}) =>
    svc<Made>("select english.eng_create_assignment_v2($1,'link','https://example.com/x',$2,$3::text[],null,null,null,$4,$5,$6::jsonb) as r", [
      o.learner ?? NG(), o.title ?? "Unit 1–2", o.tags ?? [], o.by ?? M().tutorNguyen, o.clientId ?? randomUUID(), JSON.stringify(o.units ?? []),
    ]);
  const n = async (a: string) => (await q1<{ n: number }>("select count(*)::int as n from english.assignment_units where assignment_id = $1", [a]))[0]!.n;

  let cur: { curriculum_id: string; version_id: string };

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    cur = await approved(NG(), M().tutorNguyen);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("table exists, refuses direct writes even from service_role, and is append-only", async () => {
    await fail(svc("insert into english.assignment_units(assignment_id, learner_id, curriculum_id, version_id, unit_code, ord) values ($1,$2,$3,$4,'U1',1) returning 1 as r",
      [randomUUID(), NG(), cur.curriculum_id, cur.version_id]), "42501");
    const a = await make({ units: [{ curriculum_id: cur.curriculum_id, unit_code: "U1" }] });
    await fail(q1("update english.assignment_units set ord = 2 where assignment_id = $1", [a.id]), "42501");
    await fail(q1("delete from english.assignment_units where assignment_id = $1", [a.id]), "42501");
  });

  it("the child's tutor and the parent read; the other tutor and students read nothing", async () => {
    const a = await make({ units: [{ curriculum_id: cur.curriculum_id, unit_code: "U2" }] });
    const cnt = async (uid: string) =>
      (await rowsAs<{ n: number }>(db.client, "authenticated", uid, "select count(*)::int as n from english.assignment_units where assignment_id = $1", [a.id]))[0]!.n;
    expect(await cnt(s.users.tutorNguyen)).toBe(1);
    expect(await cnt(s.users.parent)).toBe(1);
    expect(await cnt(s.users.tutorAn)).toBe(0);
    expect(await cnt(s.users.studentNguyen)).toBe(0);
  });

  it("v2 stores the units in order; the 3-tag cap applies to tag_keys only", async () => {
    const a = await make({ units: [{ curriculum_id: cur.curriculum_id, unit_code: "U2" }, { curriculum_id: cur.curriculum_id, unit_code: "U1" }] });
    expect(a.units).toBe(2);
    expect(await q1("select unit_code, ord from english.assignment_units where assignment_id = $1 order by ord", [a.id])).toEqual([
      { unit_code: "U2", ord: 1 }, { unit_code: "U1", ord: 2 }]);
    // 5 units from 5 curricula-free copies: reuse a bigger curriculum
    const big = await approved(NG(), M().tutorNguyen, Array.from({ length: 6 }, (_, i) => unitRow(i + 1)));
    const b = await make({ units: Array.from({ length: 5 }, (_, i) => ({ curriculum_id: big.curriculum_id, unit_code: `U${i + 1}` })) });
    expect(await n(b.id)).toBe(5);
    await fail(make({ tags: ["a-1", "b-2", "c-3", "d-4"] }), "23514");
    expect(await make({ units: [] })).not.toHaveProperty("units", 1);
  });

  it("units of a draft, a superseded version, a skipped unit, another learner's curriculum or a missing unit are refused (bad_units) and no assignment is created", async () => {
    const before = (await q1<{ n: number }>("select count(*)::int as n from english.assignments"))[0]!.n;
    const draft = await svc<{ curriculum_id: string; version_id: string }>("select english.eng_create_curriculum($1,'Nháp',null,null,false,$2,$3) as r", [NG(), M().tutorNguyen, randomUUID()]);
    await fail(make({ units: [{ curriculum_id: draft.curriculum_id, unit_code: "U1" }] }), "22023", /bad_units/);
    await fail(make({ units: [{ curriculum_id: cur.curriculum_id, unit_code: "U3" }] }), "22023", /bad_units/); // skipped
    await fail(make({ units: [{ curriculum_id: cur.curriculum_id, unit_code: "U99" }] }), "22023", /bad_units/);
    const other = await approved(s.learners.an, M().tutorAn, [unitRow(1), unitRow(2)]);
    await fail(make({ units: [{ curriculum_id: other.curriculum_id, unit_code: "U1" }] }), "22023", /bad_units/);
    await fail(make({ units: "nope" as unknown as unknown[] }), "22023", /bad_units/);
    // superseded: approve a new version of cur, then the old version's units are no longer the current ones
    const c2 = await approved(NG(), M().tutorNguyen);
    const v2 = await svc<{ version_id: string }>("select english.eng_add_curriculum_version($1,null,false,$2,$3) as r", [c2.curriculum_id, M().tutorNguyen, randomUUID()]);
    await svc("select english.eng_save_curriculum_draft($1,$2::jsonb,$3,$4) as r",
      [v2.version_id, JSON.stringify({ units: [unitRow(1), unitRow(5)], ignored: [] }), await updatedAt(v2.version_id), M().tutorNguyen]);
    await svc("select english.eng_approve_curriculum_version($1,$2,$3::jsonb,null,$4) as r", [v2.version_id, await updatedAt(v2.version_id),
      JSON.stringify([unitRow(1), unitRow(5)].map((u) => ({ code: u.code, title: u.title, section: u.section, page: u.page, skipped: false, points: [] }))), M().tutorNguyen]);
    // U2 existed only in the superseded version
    await fail(make({ units: [{ curriculum_id: c2.curriculum_id, unit_code: "U2" }] }), "22023", /bad_units/);
    const ok = await make({ units: [{ curriculum_id: c2.curriculum_id, unit_code: "U5" }] });
    expect((await q1<{ version_id: string }>("select version_id from english.assignment_units where assignment_id = $1", [ok.id]))[0]!.version_id).toBe(v2.version_id);
    const after = (await q1<{ n: number }>("select count(*)::int as n from english.assignments"))[0]!.n;
    expect(after).toBe(before + 1);
  });

  it("a unit listed twice is refused", async () => {
    const u = { curriculum_id: cur.curriculum_id, unit_code: "U1" };
    await fail(make({ units: [u, u] }), "22023", /bad_units/);
  });

  it("replay with the same client_id and units returns replayed without new rows; other units give 23505", async () => {
    const clientId = `cl-${randomUUID()}`;
    const u = [{ curriculum_id: cur.curriculum_id, unit_code: "U1" }];
    const a = await make({ units: u, clientId });
    const again = await make({ units: u, clientId });
    expect(again).toMatchObject({ id: a.id, replayed: true });
    expect(await n(a.id)).toBe(1);
    await fail(make({ units: [{ curriculum_id: cur.curriculum_id, unit_code: "U2" }], clientId }), "23505");
    await fail(make({ units: [], clientId }), "23505");
  });

  it("students and a tutor outside the relationship are refused by the v1 permission check", async () => {
    const u = [{ curriculum_id: cur.curriculum_id, unit_code: "U1" }];
    await fail(make({ units: u, by: M().studentNguyen }), "42501");
    await fail(make({ units: u, by: M().tutorAn }), "42501");
    await fail(make({ units: [], by: M().tutorAn }), "42501");
  });

  it("purge: the dry run and the receipt count assignment_units; afterwards there are no rows", async () => {
    const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử xóa 2B','B',true,'active') returning id", [s.familyId]))[0]!.id;
    await q1("insert into english.relationships(member_id, learner_id, relation) values ($1,$2,'tutor')", [M().tutorNguyen, L]);
    const c = await approved(L, M().tutorNguyen);
    const a = await make({ learner: L, units: [{ curriculum_id: c.curriculum_id, unit_code: "U1" }, { curriculum_id: c.curriculum_id, unit_code: "U2" }] });
    const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
    expect(dry.counts).toMatchObject({ assignment_units: 2, assignments: 1 });
    const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
    expect(receipt.deleted).toMatchObject({ assignment_units: 2, assignments: 1 });
    expect(Object.keys(receipt.deleted).sort()).toEqual(Object.keys(dry.counts).sort());
    expect(await n(a.id)).toBe(0);
  });

  it("the migration can run again without error", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(new URL("../../db/migrations/0029_assignment_units.sql", import.meta.url), "utf8");
    await db.client.query(sql);
    await db.client.query(sql);
  });
});
