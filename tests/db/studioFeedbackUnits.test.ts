import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStudioBuild } from "../../lib/studio/buildTemplate";
import type { StudioDraft, StudioItem } from "../../lib/studio/schema";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** Bản rà 21/11 #4 + #10 (migration 0037): feedback on a Studio attempt (the child reads it in "Đã xem") and Units given with a Studio test. */
describe("studio_feedback + studio_assignment_units (migration 0037)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const asUser = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  const item = (n: number): StudioItem => ({
    n, part: "A", kind: "gap", out_of_app: false, stem: `Sentence ${n} ____.`, options: [], passage_ref: null, key: `k${n}`, accepted: [],
    tag_key: "dang-tu", target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: false, review_reason: null,
  });
  const PAPER: StudioDraft = { parts: [{ key: "A", name: "A · Word formation", instructions: "Fill in." }], passages: [], items: [item(1), item(2)] };
  let k = 0;
  /** An approved Studio draft of a learner (not assigned yet). */
  const approvedDraft = async (learner = NG(), by = M().tutorNguyen) => {
    k += 1;
    const title = `Unit test ${k}`;
    const made = await svc<{ id: string }>("select english.eng_create_studio_draft($1, $2, null, null, false, $3, $4) as r", [learner, title, by, `fb-${k}-aaaaaaaa`]);
    const cur = await svc<{ updated_at: string }>("select english.eng_studio_draft($1) as r", [made.id]);
    const saved = await svc<{ updated_at: string }>("select english.eng_save_studio_draft($1, $2, $3::jsonb, $4, $5) as r", [made.id, title, JSON.stringify(PAPER), cur.updated_at, by]);
    await svc("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [made.id, saved.updated_at, JSON.stringify(buildStudioBuild(PAPER)), by]);
    return made.id;
  };
  type Assigned = { instance_id: string; activity_id: string; replayed: boolean; units?: number };
  const assignV3 = (draft: string, units: unknown[], o: { by?: string; clientId?: string } = {}) =>
    svc<Assigned>("select english.eng_assign_studio_v3($1, current_date, current_date + 3, false, $2, $3, $4::jsonb) as r", [
      draft, o.by ?? M().tutorNguyen, o.clientId ?? `as-${randomUUID()}`, JSON.stringify(units),
    ]);
  const submit = (activity: string, user = s.users.studentNguyen) =>
    asUser<{ attempt_id: string }>(user, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [
      activity, randomUUID(), JSON.stringify({ answers: { q1: "k1", q2: "k2" } }), ["none"],
    ]);
  type Fb = { id: string; replayed: boolean };
  const feedback = (attempt: string, o: { praise?: string | null; items?: unknown[]; supersedes?: string | null; by?: string; clientId?: string } = {}) =>
    svc<Fb>("select english.eng_write_studio_feedback($1, $2, $3::jsonb, $4, $5, $6) as r", [
      attempt, o.praise === undefined ? "Bạn chia dạng từ rất chắc." : o.praise, JSON.stringify(o.items ?? [{ text: "Xem lại hậu tố -ness ở câu 2." }]),
      o.supersedes ?? null, o.by ?? M().tutorNguyen, o.clientId ?? randomUUID(),
    ]);
  const seen = async () => (await asUser<{ items: Record<string, unknown>[] }>(s.users.studentNguyen, "select english.eng_my_seen(null, null, 50) as r")).items;

  const unitRow = (n: number, extra: Record<string, unknown> = {}) => ({
    code: `U${n}`, title: `Unit ${n}`, section: "Grammar", page: 6 * n, skipped: false, points: [],
    missing_points: [], needs_review: false, review_reason: null, origin: "ai", dropped: false, edit_reason: null, ...extra,
  });
  const updatedAt = async (v: string) => (await q1<{ t: string }>("select updated_at::text as t from english.curriculum_versions where id = $1", [v]))[0]!.t;
  async function curriculum(learner: string, by: string) {
    const units = [unitRow(13), unitRow(14), unitRow(15, { skipped: true })];
    const c = await svc<{ curriculum_id: string; version_id: string }>(
      "select english.eng_create_curriculum($1,$2,null,null,false,$3,$4) as r", [learner, `Destination ${randomUUID().slice(0, 4)}`, by, randomUUID()]);
    await svc("select english.eng_save_curriculum_draft($1,$2::jsonb,$3,$4) as r", [c.version_id, JSON.stringify({ units, ignored: [] }), await updatedAt(c.version_id), by]);
    const fin = units.map((u) => ({ code: u.code, title: u.title, section: u.section, page: u.page, skipped: u.skipped, points: u.points }));
    await svc("select english.eng_approve_curriculum_version($1,$2,$3::jsonb,null,$4) as r", [c.version_id, await updatedAt(c.version_id), JSON.stringify(fin), by]);
    return c;
  }

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("feedback on a Studio attempt", () => {
    let attempt: string;
    let activity: string;
    beforeAll(async () => {
      const a = await assignV3(await approvedDraft(), []);
      activity = a.activity_id;
      attempt = (await submit(activity)).attempt_id;
    });

    it("the child's tutor gives it; the child reads praise + things to fix in Đã xem (no author, no score); a replay gives the same row", async () => {
      const before = await seen();
      expect(before.some((x) => x.ref === attempt)).toBe(false); // auto-checked and nothing else: never "seen" before 0037
      const cid = randomUUID();
      const f = await feedback(attempt, { clientId: cid });
      expect(f.replayed).toBe(false);
      expect(await feedback(attempt, { clientId: cid })).toEqual({ id: f.id, replayed: true });
      const mine = (await seen()).find((x) => x.ref === attempt)!;
      expect(mine).toMatchObject({ src: "attempt", kind: "app", praise: "Bạn chia dạng từ rất chắc.", fb_state: "note", notes: [{ n: 1, text: "Xem lại hậu tố -ness ở câu 2.", excerpt: null }] });
      expect(JSON.stringify(mine)).not.toMatch(/author|tutorNguyen|display_name/);
    });

    it("only one live note per attempt; the author edits it once; another adult cannot edit it", async () => {
      await fail(feedback(attempt), "23505", /already_given/);
      const [live] = await svc<{ id: string; live: boolean }[]>("select english.eng_studio_feedback($1, $2) as r", [NG(), attempt]);
      await fail(feedback(attempt, { supersedes: live!.id, by: M().parent }), "42501", /author_only/);
      const edited = await feedback(attempt, { supersedes: live!.id, praise: "Bạn làm đúng dạng từ ở cả hai câu.", items: [] });
      await fail(feedback(attempt, { supersedes: live!.id }), "23505", /already_superseded/);
      const all = await svc<{ id: string; live: boolean; submission_id: string; assignment_id: string; author_role: string }[]>("select english.eng_studio_feedback($1) as r", [NG()]);
      expect(all.filter((x) => x.submission_id === attempt).map((x) => [x.id === edited.id, x.live])).toEqual([[true, true], [false, false]]);
      expect(all[0]).toMatchObject({ assignment_id: activity, author_role: "tutor" });
      expect((await seen()).find((x) => x.ref === attempt)).toMatchObject({ praise: "Bạn làm đúng dạng từ ở cả hai câu.", notes: null, fb_state: "note" });
    });

    it("refuses scores, empty notes, too many items, the other tutor and anyone calling it from the browser", async () => {
      const other = (await submit(activity)).attempt_id;
      await fail(feedback(other, { praise: "Được 8 điểm" }), "23514", /score_words/);
      await fail(feedback(other, { praise: null, items: [] }), "23514", /empty_feedback/);
      await fail(feedback(other, { items: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }] }), "22023", /bad_items/);
      await fail(feedback(other, { by: M().tutorAn }), "42501");
      await fail(asUser(s.users.tutorNguyen, "select english.eng_write_studio_feedback($1, 'x', '[]'::jsonb, null, $2, $3) as r", [other, M().tutorNguyen, randomUUID()]), "42501");
      await fail(asUser(s.users.studentNguyen, "select english.eng_studio_feedback($1) as r", [NG()]), "42501");
      // the parent may give it too (as for paper / link work)
      expect((await feedback(other, { by: M().parent })).replayed).toBe(false);
      // the child sent the test again: no new note on the older attempt (as for a replaced submission)
      await fail(feedback(attempt, { clientId: randomUUID(), supersedes: null }), "23505", /attempt_replaced/);
    });

    it("the table is append-only and read only by the child's adults (RLS)", async () => {
      await fail(q1("update english.studio_feedback set praise = 'x'"), "42501");
      const sql = "select id from english.studio_feedback where attempt_id = $1";
      expect((await rowsAs(db.client, "authenticated", s.users.tutorNguyen, sql, [attempt])).length).toBe(2);
      expect((await rowsAs(db.client, "authenticated", s.users.parent, sql, [attempt])).length).toBe(2);
      expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, sql, [attempt])).toEqual([]);
      expect(await rowsAs(db.client, "authenticated", s.users.studentNguyen, sql, [attempt])).toEqual([]);
    });
  });

  describe("Units given with a Studio test", () => {
    it("are saved with the step; a replay with the same Units returns the same test, other Units are refused", async () => {
      const c = await curriculum(NG(), M().tutorNguyen);
      const draft = await approvedDraft();
      const units = [{ curriculum_id: c.curriculum_id, unit_code: "U14" }, { curriculum_id: c.curriculum_id, unit_code: "U13" }];
      const cid = `as-${randomUUID()}`;
      const a = await assignV3(draft, units, { clientId: cid });
      expect(a).toMatchObject({ replayed: false, units: 2 });
      expect(await q1("select unit_code, ord from english.studio_assignment_units where activity_id = $1 order by ord", [a.activity_id])).toEqual([
        { unit_code: "U14", ord: 1 }, { unit_code: "U13", ord: 2 },
      ]);
      expect(await assignV3(draft, [...units].reverse(), { clientId: cid })).toMatchObject({ activity_id: a.activity_id, replayed: true });
      await fail(assignV3(draft, [units[0]], { clientId: cid }), "23505", /client_id_reused/);
      // read by the child's adults only
      const sql = "select unit_code from english.studio_assignment_units where activity_id = $1";
      expect((await rowsAs(db.client, "authenticated", s.users.tutorNguyen, sql, [a.activity_id])).length).toBe(2);
      expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, sql, [a.activity_id])).toEqual([]);
      expect(await rowsAs(db.client, "authenticated", s.users.studentNguyen, sql, [a.activity_id])).toEqual([]);
    });

    it("a skipped, missing, duplicated or other child's Unit is refused and no test is given; the other tutor gets 42501 first", async () => {
      const c = await curriculum(NG(), M().tutorNguyen);
      const other = await curriculum(s.learners.an, M().tutorAn);
      const draft = await approvedDraft();
      const count = async () => (await q1<{ n: number }>("select count(*)::int as n from english.inquiry_instances i join english.studio_drafts d on d.template_id = i.template_id where d.id = $1", [draft]))[0]!.n;
      await fail(assignV3(draft, [{ curriculum_id: c.curriculum_id, unit_code: "U15" }]), "22023", /bad_units/);
      await fail(assignV3(draft, [{ curriculum_id: c.curriculum_id, unit_code: "U99" }]), "22023", /bad_units/);
      await fail(assignV3(draft, [{ curriculum_id: other.curriculum_id, unit_code: "U13" }]), "22023", /bad_units/);
      await fail(assignV3(draft, [{ curriculum_id: c.curriculum_id, unit_code: "U13" }, { curriculum_id: c.curriculum_id, unit_code: "U13" }]), "22023", /bad_units/);
      await fail(assignV3(draft, [{ curriculum_id: c.curriculum_id, unit_code: "U99" }], { by: M().tutorAn }), "42501");
      expect(await count()).toBe(0);
    });
  });

  it("a replay with another kind of work (test flag) is refused even with the same Units", async () => {
    const c = await curriculum(NG(), M().tutorNguyen);
    const draft = await approvedDraft();
    const units = [{ curriculum_id: c.curriculum_id, unit_code: "U13" }];
    const cid = `as-${randomUUID()}`;
    await assignV3(draft, units, { clientId: cid });
    await fail(svc("select english.eng_assign_studio_v3($1, current_date, current_date + 3, true, $2, $3, $4::jsonb) as r", [draft, M().tutorNguyen, cid, JSON.stringify(units)]), "23505", /client_id_reused/);
  });

  it("sent work: Units of Studio tests the child sent and of link work with a submission; not a skipped step, not retracted work, not unsent work", async () => {
    const c = await curriculum(NG(), M().tutorNguyen);
    const u = (code: string) => [{ curriculum_id: c.curriculum_id, unit_code: code }];
    const sent = await assignV3(await approvedDraft(), u("U13"));
    await submit(sent.activity_id);
    await assignV3(await approvedDraft(), u("U14")); // given, not sent
    const skipped = await assignV3(await approvedDraft(), u("U14"));
    await submit(skipped.activity_id);
    await q1("insert into english.activity_instance_events(activity_instance_id, learner_id, kind, reason, by_member) values ($1, $2, 'skip', 'không làm', $3)", [skipped.activity_id, NG(), M().tutorNguyen]);
    const link = async (code: string, title: string) => {
      const a = await svc<{ id: string }>("select english.eng_create_assignment_v2($1,'link','https://example.com/x',$2,'{}'::text[],null,null,null,$3,$4,$5::jsonb) as r", [NG(), title, M().tutorNguyen, randomUUID(), JSON.stringify(u(code))]);
      await q1("insert into english.submissions(assignment_id, learner_id, attempt, link_url, submitted_by_member, submitted_by_role, client_id) values ($1, $2, 'first', 'https://example.com/r', $3, 'student', $4)", [a.id, NG(), M().studentNguyen, randomUUID()]);
      return a.id;
    };
    await link("U13", "Link U13");
    const gone = await link("U14", "Link U14 (rút)");
    await svc("select english.eng_retract_assignment($1, null, $2) as r", [gone, M().tutorNguyen]);
    const rows = (await svc<{ curriculum_id: string; unit_code: string; title: string }[]>("select english.eng_sent_work_units($1) as r", [NG()])).filter((r) => r.curriculum_id === c.curriculum_id);
    expect(rows.map((r) => `${r.unit_code}:${r.title}`).sort()).toEqual(["U13:Link U13", `U13:Unit test ${k - 2}`]);
    await fail(asUser(s.users.tutorNguyen, "select english.eng_sent_work_units($1) as r", [NG()]), "42501");
  });

  it("purge: the dry run and the receipt count both tables; afterwards there are no rows", async () => {
    const L = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1,'Em thử xóa 0037','B',true,'active') returning id", [s.familyId]))[0]!.id;
    await q1("insert into english.relationships(member_id, learner_id, relation) values ($1,$2,'tutor')", [M().tutorNguyen, L]);
    await q1("select english.eng_assign_target_set($1, 'B-v1')", [L]);
    const c = await curriculum(L, M().tutorNguyen);
    await assignV3(await approvedDraft(L), [{ curriculum_id: c.curriculum_id, unit_code: "U13" }]);
    const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
    expect(dry.counts).toMatchObject({ studio_assignment_units: 1, studio_feedback: 0 });
    const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
    expect(receipt.deleted).toMatchObject({ studio_assignment_units: 1, studio_feedback: 0 });
    expect(Object.keys(receipt.deleted).sort()).toEqual(Object.keys(dry.counts).sort());
    expect(await q1("select 1 from english.studio_assignment_units where learner_id = $1", [L])).toEqual([]);
  });

  it("the migration can run again without error", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(new URL("../../db/migrations/0037_studio_feedback_units.sql", import.meta.url), "utf8");
    await db.client.query(sql);
    await db.client.query(sql);
  });
});
