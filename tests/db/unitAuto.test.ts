import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStudioBuild } from "../../lib/studio/buildTemplate";
import type { StudioDraft, StudioItem } from "../../lib/studio/schema";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** L2 (migration 0044): "Đang học" set by the app from work the child sent; the adult's choice wins; never down; the child's mountain follows. */
describe("eng_unit_auto_events / eng_unit_auto / eng_my_roadmap (migration 0044)", () => {
  let db: TestDb;
  let s: Seeded;
  let cur: string;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const asUser = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const item = (n: number): StudioItem => ({
    n, part: "A", kind: "gap", out_of_app: false, stem: `Sentence ${n} ____.`, options: [], passage_ref: null, key: `k${n}`, accepted: [],
    tag_key: "dang-tu", target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: false, review_reason: null,
  });
  const PAPER: StudioDraft = { parts: [{ key: "A", name: "A", instructions: "Fill in." }], passages: [], items: [item(1), item(2)] };
  const test = async (title: string, units: unknown[] = []) => {
    const by = M().tutorNguyen;
    const made = await svc<{ id: string }>("select english.eng_create_studio_draft($1, $2, null, null, false, $3, $4) as r", [NG(), title, by, `ua-${randomUUID()}`]);
    const c0 = await svc<{ updated_at: string }>("select english.eng_studio_draft($1) as r", [made.id]);
    const saved = await svc<{ updated_at: string }>("select english.eng_save_studio_draft($1, $2, $3::jsonb, $4, $5) as r", [made.id, title, JSON.stringify(PAPER), c0.updated_at, by]);
    await svc("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [made.id, saved.updated_at, JSON.stringify(buildStudioBuild(PAPER)), by]);
    const a = await svc<{ activity_id: string }>("select english.eng_assign_studio_v3($1, current_date, current_date + 3, false, $2, $3, $4::jsonb) as r", [made.id, by, `as-${randomUUID()}`, JSON.stringify(units)]);
    return a.activity_id;
  };
  const submit = (activity: string) =>
    asUser(s.users.studentNguyen, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [activity, randomUUID(), JSON.stringify({ answers: { q1: "k1", q2: "k2" } }), ["none"]]);
  const setStatus = (code: string, status: string) =>
    svc("select english.eng_set_unit_status($1,$2,$3,null,$4,$5) as r", [cur, code, status, M().tutorNguyen, randomUUID()]);
  const auto = async (user = s.users.tutorNguyen) => (await asUser<{ main_id: string | null; events: { unit_code: string; curriculum_id: string; at: string }[] }>(user, "select english.eng_unit_auto($1) as r", [NG()])).events.map((a) => a.unit_code).sort();
  const mountain = async () =>
    Object.fromEntries((await asUser<{ units: { code: string; status: string }[] }>(s.users.studentNguyen, "select english.eng_my_roadmap() as r")).units.map((u) => [u.code, u.status]));
  const updatedAt = async (v: string) => (await db.client.query<{ t: string }>("select updated_at::text as t from english.curriculum_versions where id = $1", [v])).rows[0]!.t;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    const by = M().tutorNguyen;
    const units = [13, 14, 15, 16, 17].map((n) => ({
      code: `U${n}`, title: `Unit ${n}`, section: "Grammar", page: 6 * n, skipped: n === 17, points: [], missing_points: [], needs_review: false, review_reason: null, origin: "ai", dropped: false, edit_reason: null,
    }));
    const c = await svc<{ curriculum_id: string; version_id: string }>("select english.eng_create_curriculum($1,$2,null,null,false,$3,$4) as r", [NG(), "Destination C1&C2", by, randomUUID()]);
    await svc("select english.eng_save_curriculum_draft($1,$2::jsonb,$3,$4) as r", [c.version_id, JSON.stringify({ units, ignored: [] }), await updatedAt(c.version_id), by]);
    const fin = units.map((u) => ({ code: u.code, title: u.title, section: u.section, page: u.page, skipped: u.skipped, points: u.points }));
    await svc("select english.eng_approve_curriculum_version($1,$2,$3::jsonb,null,$4) as r", [c.version_id, await updatedAt(c.version_id), JSON.stringify(fin), by]);
    cur = c.curriculum_id;
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("a test named 'Unit 14' sent by the child makes U14 'Đang học' for the adults and on the child's mountain", async () => {
    expect(await auto()).toEqual([]);
    await submit(await test("Destination C1&C2 · Unit 14 · Word formation (M–P)"));
    expect(await auto()).toEqual(["U14"]);
    expect((await mountain()).U14).toBe("in_progress");
  });

  it("Reviews, Progress Tests, ranges and skipped Units never move; a Unit given with the test is used before the title", async () => {
    await submit(await test("Destination · Review 7 (Units 13–14)"));
    await submit(await test("Destination · Progress Test 2 (Units 13–26)"));
    await submit(await test("Destination · Units 15–16 mixed"));
    await submit(await test("Destination · Unit 17 · Word formation"));
    expect(await auto()).toEqual(["U14"]);
    await submit(await test("Destination · Unit 13 · grammar", [{ curriculum_id: cur, unit_code: "U16" }]));
    expect(await auto()).toEqual(["U14", "U16"]); // the Unit given with the test (U16), not the title (U13)
  });

  it("a title with a non-breaking space still counts", async () => {
    await submit(await test("Destination · Unit\u00a013 · pasted"));
    expect(await auto()).toContain("U13");
  });

  it("never down: a Unit the adult marked Đã học stays so when more work comes in", async () => {
    await setStatus("U15", "done");
    await submit(await test("Destination · Unit 15 · listening"));
    expect(await auto()).not.toContain("U15");
    expect((await mountain()).U15).toBe("done");
  });

  it("the adult wins after the work: set back to Chưa bắt đầu it stays so until the child sends new work of that Unit", async () => {
    await setStatus("U14", "not_started");
    expect((await mountain()).U14).toBe("not_started");
    await submit(await test("Destination · Unit 14 · Phrases"));
    expect((await mountain()).U14).toBe("in_progress");
  });

  it("only the child's adults read it (outsiders and the child get nothing); anon cannot call it", async () => {
    expect(await auto(s.users.parent)).toEqual(["U13", "U14", "U16"]);
    expect(await auto(s.users.tutorAn)).toEqual([]);
    expect(await auto(s.users.studentNguyen)).toEqual([]);
    expect((await asUser<{ main_id: string | null }>(s.users.tutorNguyen, "select english.eng_unit_auto($1) as r", [NG()])).main_id).toBe(cur);
    expect((await asUser<{ main_id: string | null }>(s.users.tutorAn, "select english.eng_unit_auto($1) as r", [NG()])).main_id).toBeNull();
    const err = await rowsAs(db.client, "anon", null, "select english.eng_unit_auto($1)", [NG()]).then(() => null, (e: { code?: string }) => e);
    expect(err?.code).toBe("42501");
    const inner = await rowsAs(db.client, "authenticated", s.users.tutorNguyen, "select * from english.eng_unit_auto_events($1)", [NG()]).then(() => null, (e: { code?: string }) => e);
    expect(inner?.code).toBe("42501");
  });
});
