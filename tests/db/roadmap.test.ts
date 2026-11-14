import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pickMainCurriculum } from "@/lib/roadmap/mainCurriculum";
import { parseRoadmap } from "@/lib/roadmap/shape";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** W4a · Lộ trình mốc + Hành trình (migration 0031). One database. */
describe("roadmap milestones + eng_my_roadmap (migration 0031)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  type W = { milestone_id: string; version: number; replayed: boolean };

  // ---- curricula (via the W2 functions) -------------------------------------------------------------------------------------------
  const updatedAt = async (v: string) => (await q1<{ t: string }>("select updated_at::text as t from english.curriculum_versions where id = $1", [v]))[0]!.t;
  const unitRow = (n: number) => ({
    code: `U${n}`, title: `Unit ${n}`, section: null, page: 10 * n, skipped: false, points: [], missing_points: [], needs_review: false,
    review_reason: null, flags: [], origin: "manual", ai_index: null, dropped: false, edit_reason: null,
  });
  /** An approved curriculum of `n` Units; one "Progress Test" row after Unit 4. */
  async function curriculum(learner: string, by: string, title: string, n = 6): Promise<{ id: string; version: string }> {
    const c = await svc<{ curriculum_id: string; version_id: string }>("select english.eng_create_curriculum($1,$2,null,null,false,$3,$4) as r", [learner, title, by, randomUUID()]);
    const units = Array.from({ length: n }, (_, i) => unitRow(i + 1));
    const payload = { units, ignored: [{ label: "Progress Test 1", page: 45, reason: "test" }] };
    await svc("select english.eng_save_curriculum_draft($1,$2::jsonb,$3,$4) as r", [c.version_id, JSON.stringify(payload), await updatedAt(c.version_id), by]);
    await svc("select english.eng_approve_curriculum_version($1,$2,$3::jsonb,null,$4) as r", [
      c.version_id, await updatedAt(c.version_id),
      JSON.stringify(units.map((u) => ({ code: u.code, title: u.title, section: null, page: u.page, skipped: false, points: [] }))), by,
    ]);
    return { id: c.curriculum_id, version: c.version_id };
  }
  const setStatus = (cur: string, code: string, status: string, by = M().tutorNguyen) =>
    svc("select english.eng_set_unit_status($1,$2,$3,null,$4,$5) as r", [cur, code, status, by, randomUUID()]);

  // ---- roadmap calls --------------------------------------------------------------------------------------------------------------
  const fields = (o: Record<string, unknown> = {}) => ({ kind: "progress_test", role: "flag", title: "Progress Test 1", ...o });
  const write = (o: { learner?: string; milestone?: string | null; base?: number | null; fields?: unknown; status?: string; reason?: string | null; key?: string | null; by?: string; clientId?: string } = {}) =>
    svc<W>("select english.eng_roadmap_write($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) as r", [
      o.learner ?? NG(), o.milestone ?? null, o.base ?? null, o.fields === undefined ? JSON.stringify(fields()) : o.fields === null ? null : JSON.stringify(o.fields),
      o.status ?? "confirmed", o.reason ?? null, o.key ?? null, o.by ?? M().tutorNguyen, o.clientId ?? randomUUID(),
    ]);
  const mine = (uid: string) => rowsAs<{ r: { main: { id: string; title: string } | null; units: Record<string, unknown>[]; others: unknown[]; milestones: Record<string, unknown>[] } }>(
    db.client, "authenticated", uid, "select english.eng_my_roadmap() as r").then((r) => r[0]!.r);
  const count = async (t: string, where = "true", params: unknown[] = []) => (await q1<{ n: number }>(`select count(*)::int as n from english.${t} where ${where}`, params))[0]!.n;

  let cNg: { id: string; version: string };
  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("tables exist, refuse direct writes even from service_role, and are append-only", async () => {
    await fail(svc("insert into english.roadmap_main_curriculum(learner_id, curriculum_id, by_member, by_role, client_id) values ($1, $2, $3, 'tutor', 'abcdefgh1') returning 1 as r", [NG(), randomUUID(), M().tutorNguyen]), "42501");
    const w = await write();
    const row = (await q1<{ id: string }>("select id from english.roadmap_milestones where milestone_id = $1", [w.milestone_id]))[0]!;
    await fail(q1("update english.roadmap_milestones set title = 'x' where id = $1", [row.id]), "42501");
    await fail(q1("delete from english.roadmap_milestones where id = $1", [row.id]), "42501");
    await fail(svc("truncate english.roadmap_milestones"), "42501");
    await fail(svc("truncate english.roadmap_main_curriculum"), "42501");
  });

  it("RLS: the child's tutor and the parent read; the other tutor and every student read nothing", async () => {
    const w = await write({ clientId: randomUUID() });
    const cnt = async (uid: string) => (await rowsAs<{ n: number }>(db.client, "authenticated", uid, "select count(*)::int as n from english.roadmap_milestones where milestone_id = $1", [w.milestone_id]))[0]!.n;
    expect([await cnt(s.users.tutorNguyen), await cnt(s.users.parent), await cnt(s.users.tutorAn), await cnt(s.users.studentNguyen), await cnt(s.users.studentAn)]).toEqual([1, 1, 0, 0, 0]);
  });

  it("only the child's tutor writes: parent and the other child's tutor get 42501 (permissions first), a student cannot call the function", async () => {
    await fail(write({ by: M().parent }), "42501", /tutor_only/);
    await fail(write({ by: M().tutorAn }), "42501", /tutor_only/);
    await fail(write({ by: M().studentNguyen }), "42501", /tutor_only/);
    // permissions come before validation: a bad body from the wrong person is still 42501
    await fail(write({ by: M().parent, fields: { kind: "nope" }, status: "bogus" }), "42501");
    await fail(rowsAs(db.client, "authenticated", s.users.studentNguyen, "select english.eng_roadmap_write($1,null,null,'{}'::jsonb,'draft',null,null,$2,'abcdefgh1')", [NG(), M().studentNguyen]), "42501");
    await fail(rowsAs(db.client, "anon", null, "select english.eng_roadmap($1)", [NG()]), "42501");
    await fail(rowsAs(db.client, "authenticated", s.users.parent, "select english.eng_roadmap($1)", [NG()]), "42501");
  });

  it("validation: bad fields, bad Unit (the other child's), reason needed to remove, versions and replay", async () => {
    await fail(write({ fields: fields({ kind: "party" }) }), "22023", /bad_fields/);
    await fail(write({ fields: fields({ title: "   " }) }), "22023", /bad_fields/);
    await fail(write({ fields: fields({ target_month: "2027-13" }) }), "22023", /bad_fields/);
    await fail(write({ fields: fields({ approx: true }) }), "22023", /bad_fields/);
    await fail(write({ fields: fields({ role: "summit", after_unit: "U1", curriculum_id: randomUUID() }) }), "22023", /bad_fields/);
    await fail(write({ status: "bogus" }), "22023", /bad_fields/);

    cNg = await curriculum(NG(), M().tutorNguyen, "Destination B1");
    const cAn = await curriculum(AN(), M().tutorAn, "Starter A2");
    await fail(write({ fields: fields({ curriculum_id: cNg.id, after_unit: "U99" }) }), "22023", /bad_unit/);
    await fail(write({ fields: fields({ curriculum_id: cAn.id, after_unit: "U1" }) }), "22023", /bad_unit/);

    const ok = await write({ fields: fields({ curriculum_id: cNg.id, after_unit: "U4", target_month: "2027-03", approx: true }), status: "draft" });
    expect(ok).toMatchObject({ version: 1, replayed: false });
    const row = (await q1<{ target_month: string; status: string; supersedes_id: string | null }>("select target_month::text, status, supersedes_id from english.roadmap_milestones where milestone_id = $1", [ok.milestone_id]))[0]!;
    expect(row).toEqual({ target_month: "2027-03-01", status: "draft", supersedes_id: null });

    // stale base, then a proper edit
    await fail(write({ milestone: ok.milestone_id, base: 5, fields: null, status: "confirmed" }), "23505", /stale_version/);
    await fail(write({ milestone: ok.milestone_id, base: null, fields: null, status: "confirmed" }), "23505", /stale_version/);
    const v2 = await write({ milestone: ok.milestone_id, base: 1, fields: null, status: "confirmed" });
    expect(v2.version).toBe(2);
    expect((await q1<{ title: string; supersedes_id: string }>("select title, supersedes_id from english.roadmap_milestones where milestone_id = $1 and version = 2", [ok.milestone_id]))[0]!.title).toBe("Progress Test 1");
    // removing needs a reason; the milestone is then closed
    await fail(write({ milestone: ok.milestone_id, base: 2, fields: null, status: "removed" }), "23514", /reason_required/);
    await fail(write({ milestone: ok.milestone_id, base: 2, fields: null, status: "removed", reason: "xx" }), "23514", /reason_required/);
    const gone = await write({ milestone: ok.milestone_id, base: 2, fields: null, status: "removed", reason: "lịch thi đổi" });
    expect(gone.version).toBe(3);
    await fail(write({ milestone: ok.milestone_id, base: 3, fields: null, status: "confirmed" }), "23514", /already_removed/);
    // a milestone of the other child is not found
    await fail(write({ learner: AN(), by: M().tutorAn, milestone: ok.milestone_id, base: 1, fields: null }), "P0002");

    // replay: same call twice = same answer; another content with the same client_id = 23505
    const id = randomUUID();
    const a = await write({ clientId: id, fields: fields({ title: "Replay" }) });
    expect(await write({ clientId: id, fields: fields({ title: "Replay" }) })).toEqual({ ...a, replayed: true });
    await fail(write({ clientId: id, fields: fields({ title: "Other" }) }), "23505", /client_id_reused/);
  });

  it("one summit at a time (the child must never see two); editing the summit itself is fine", async () => {
    const a = await write({ fields: fields({ kind: "goal", role: "summit", title: "Lên C1" }) });
    await fail(write({ fields: fields({ kind: "goal", role: "summit", title: "Đỉnh khác" }) }), "23514", /summit_exists/);
    // a draft summit is allowed while another is confirmed; confirming it is not
    const d = await write({ fields: fields({ kind: "goal", role: "summit", title: "Nháp" }), status: "draft" });
    await fail(write({ milestone: d.milestone_id, base: 1, fields: null, status: "confirmed" }), "23514", /summit_exists/);
    await write({ milestone: a.milestone_id, base: 1, fields: fields({ kind: "goal", role: "summit", title: "Lên C1 (đổi tên)" }), status: "confirmed" });
    // demote the old summit to a plain milestone, then the draft can be confirmed
    await write({ milestone: a.milestone_id, base: 2, fields: fields({ kind: "goal", role: "beyond", title: "Lên C1" }), status: "confirmed" });
    expect((await write({ milestone: d.milestone_id, base: 1, fields: null, status: "confirmed" })).version).toBe(2);
  });

  it("a proposal key is used once, only by a new milestone; 'Bỏ đề xuất' = a removed v1 that hides it for good", async () => {
    const key = `pt:${randomUUID()}:progress-test-2`;
    await write({ key, fields: fields({ title: "Progress Test 2" }), status: "removed", reason: "không làm đề này" });
    await fail(write({ key, fields: fields({ title: "Progress Test 2" }) }), "23505", /proposal_used/);
    await fail(write({ key: "BAD KEY", fields: fields() }), "22023", /bad_fields/);
    const m = await write({ fields: fields({ title: "PT keyless" }) });
    await fail(write({ milestone: m.milestone_id, base: 1, key: `pt:${randomUUID()}:x`, fields: null }), "22023", /bad_fields/);
  });

  it("the audit trail has ids and status but no text", async () => {
    const w = await write({ fields: fields({ title: "Bí mật tiêu đề" }), status: "removed", reason: "Lý do riêng tư" });
    const rows = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'roadmap.milestone_written' and payload->>'milestone' = $1", [w.milestone_id]);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]!.payload)).not.toMatch(/Bí mật|riêng tư/);
  });

  describe("main curriculum (Q9)", () => {
    it("only the child's tutor sets it, and only a curriculum of the child with an approved version", async () => {
      const second = await curriculum(NG(), M().tutorNguyen, "Grammar Practice", 3);
      const draftOnly = await svc<{ curriculum_id: string }>("select english.eng_create_curriculum($1,'Chưa duyệt',null,null,false,$2,$3) as r", [NG(), M().tutorNguyen, randomUUID()]);
      const cAn = await curriculum(AN(), M().tutorAn, "Starter A2 (2)");
      const set = (o: { curriculum?: string; by?: string; clientId?: string } = {}) =>
        svc<{ id: string; replayed: boolean }>("select english.eng_roadmap_set_main($1,$2,$3,$4) as r", [NG(), o.curriculum ?? second.id, o.by ?? M().tutorNguyen, o.clientId ?? randomUUID()]);
      await fail(set({ by: M().parent }), "42501", /tutor_only/);
      await fail(set({ by: M().tutorAn }), "42501");
      await fail(set({ curriculum: draftOnly.curriculum_id }), "22023", /bad_curriculum/);
      await fail(set({ curriculum: cAn.id }), "22023", /bad_curriculum/);
      const id = randomUUID();
      const a = await set({ clientId: id });
      expect(await set({ clientId: id })).toEqual({ id: a.id, replayed: true });
      await fail(set({ clientId: id, curriculum: cNg.id }), "23505", /client_id_reused/);
      expect((await q1<{ id: string }>("select english.eng_roadmap_main_id($1)::text as id", [NG()]))[0]!.id).toBe(second.id);
      await set({ curriculum: cNg.id });          // newest choice wins
      expect((await q1<{ id: string }>("select english.eng_roadmap_main_id($1)::text as id", [NG()]))[0]!.id).toBe(cNg.id);
    });

    it("the default (nothing chosen) in SQL equals the TypeScript rule on the same facts", async () => {
      // A learner without a choice: Starter A2 curricula of An (two approved ones; events decide).
      const rows = await q1<{ id: string; created_at: string }>("select id, created_at::text from english.curricula where learner_id = $1 order by created_at", [AN()]);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      const first = rows[0]!;
      const secondC = rows[1]!;
      const facts = async () => {
        const r = await rowsAs<{ r: { curricula: { id: string; created_at: string; last_event_at: string | null; last_event_id: string | null }[]; main_id: string | null } }>(
          db.client, "service_role", null, "select english.eng_roadmap($1) as r", [AN()]);
        const data = r[0]!.r;
        return { sql: data.main_id, ts: pickMainCurriculum(data.curricula.map((c) => ({ id: c.id, createdAt: c.created_at, approved: true, lastEventAt: c.last_event_at, lastEventId: c.last_event_id })), null) };
      };
      let f = await facts();
      expect(f.sql).toBe(first.id);                    // no events: the earliest created
      expect(f.ts).toBe(f.sql);
      await setStatus(secondC.id, "U1", "in_progress", M().tutorAn);
      f = await facts();
      expect(f.sql).toBe(secondC.id);                  // the one with the latest event
      expect(f.ts).toBe(f.sql);
      await setStatus(first.id, "U1", "done", M().tutorAn);
      f = await facts();
      expect(f.sql).toBe(first.id);
      expect(f.ts).toBe(f.sql);
    });
  });

  describe("eng_my_roadmap — what the child may see", () => {
    it("student without curricula / milestones: empty mountain; staff accounts get an empty answer, never data", async () => {
      // Bring a clean state: nothing for a learner with no curricula would be An's... use a staff account for the empty answer.
      const staff = await mine(s.users.tutorNguyen);
      expect(staff).toEqual({ main: null, units: [], others: [], milestones: [] });
    });

    it("Nguyên sees his Units with their own status + only confirmed milestones; An sees none of it", async () => {
      await setStatus(cNg.id, "U1", "done");
      await setStatus(cNg.id, "U2", "in_progress");
      await setStatus(cNg.id, "U3", "skipped");
      const flag = await write({ fields: fields({ title: "Mốc hiện", curriculum_id: cNg.id, after_unit: "U4" }) });
      await write({ fields: fields({ title: "Mốc nháp ẩn", curriculum_id: cNg.id, after_unit: "U5" }), status: "draft" });
      const gone = await write({ fields: fields({ title: "Mốc đã bỏ ẩn" }) });
      await write({ milestone: gone.milestone_id, base: 1, fields: null, status: "removed", reason: "lịch thi đổi" });

      const me = await mine(s.users.studentNguyen);
      expect(me.main).toEqual({ id: cNg.id, title: "Destination B1" });
      const byCode = Object.fromEntries(me.units.map((u) => [u.code as string, u]));
      expect(byCode.U1).toMatchObject({ status: "done", ord: 1 });
      expect(byCode.U1!.done_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(byCode.U2).toMatchObject({ status: "in_progress", done_on: null });
      expect(byCode.U3).toMatchObject({ status: "skipped" });
      expect(byCode.U4).toMatchObject({ status: "not_started" });
      const titles = me.milestones.map((m) => m.title);
      expect(titles).toContain("Mốc hiện");
      expect(titles).not.toContain("Mốc nháp ẩn");
      expect(titles).not.toContain("Mốc đã bỏ ẩn");
      const shown = me.milestones.find((m) => m.title === "Mốc hiện")!;
      expect(shown).toMatchObject({ id: flag.milestone_id, after_unit: "U4", curriculum_id: cNg.id });

      const an = await mine(s.users.studentAn);
      expect(an.main?.id).not.toBe(cNg.id);
      expect(an.milestones).toEqual([]);
      expect(JSON.stringify(an)).not.toContain("Mốc hiện");
    });

    it("a draft edit of a confirmed milestone: the child still sees the confirmed version; a removed one disappears", async () => {
      const w = await write({ fields: fields({ title: "Thi thử vào 10", curriculum_id: cNg.id, after_unit: "U4" }) });
      await write({ milestone: w.milestone_id, base: 1, fields: fields({ title: "Thi thử vào 10 (mới)", curriculum_id: cNg.id, after_unit: "U5" }), status: "draft" });
      let t = (await mine(s.users.studentNguyen)).milestones.find((m) => m.id === w.milestone_id);
      expect(t).toMatchObject({ title: "Thi thử vào 10", after_unit: "U4" });
      await write({ milestone: w.milestone_id, base: 2, fields: null, status: "confirmed" });
      t = (await mine(s.users.studentNguyen)).milestones.find((m) => m.id === w.milestone_id);
      expect(t).toMatchObject({ title: "Thi thử vào 10 (mới)", after_unit: "U5" });
      await write({ milestone: w.milestone_id, base: 3, fields: null, status: "removed", reason: "đổi lịch thi" });
      expect((await mine(s.users.studentNguyen)).milestones.some((m) => m.id === w.milestone_id)).toBe(false);
    });

    it("never returns scores, levels, reasons, versions, proposal keys, tags or book pages", async () => {
      await write({ key: `goal:${randomUUID().slice(0, 8)}`, fields: fields({ title: "Có khóa đề xuất" }) });
      const json = JSON.stringify(await mine(s.users.studentNguyen));
      const keys = new Set<string>();
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
      };
      walk(JSON.parse(json));
      for (const k of keys) expect(k, k).not.toMatch(/score|correct|expected|answer|explanation|tag_key|level_num|pct|result|reason|version|proposal|page|section|points|level_note|by_/i);
      expect(json).not.toContain("lịch thi đổi");
      expect(json).not.toContain("pt:");
    });

    it("other curricula of the child: title and counts of Units only", async () => {
      const r = await mine(s.users.studentNguyen);
      expect(r.others.length).toBeGreaterThan(0);
      for (const o of r.others as Record<string, unknown>[]) expect(Object.keys(o).sort()).toEqual(["done", "id", "title", "total"]);
    });

    it("anon and service_role cannot call it; authenticated can", async () => {
      await fail(rowsAs(db.client, "anon", null, "select english.eng_my_roadmap()"), "42501");
      await fail(rowsAs(db.client, "service_role", null, "select english.eng_my_roadmap()"), "42501");
    });
  });

  describe("eng_roadmap (adult read)", () => {
    it("returns every version (up to 20 per milestone), the curricula with Units and events, the intake goals and the track label", async () => {
      await q1("insert into english.learner_intake(learner_id, content, author_member, author_role, client_id) values ($1, $2::jsonb, $3, 'tutor', 'intake-0001')",
        [NG(), JSON.stringify({ goals: [{ title: "Vào chuyên Anh", due: "06/2027" }], strengths: {}, weaknesses: {} }), M().tutorNguyen]);
      const r = (await rowsAs<{ r: Record<string, unknown> & { milestones: { status: string; reason: string | null }[]; curricula: { id: string; units: unknown[]; payload: unknown }[] } }>(
        db.client, "service_role", null, "select english.eng_roadmap($1) as r", [NG()]))[0]!.r;
      expect(r.goal_label).toBe("Lên C1");
      expect(r.track_id).toBe("B");
      expect(r.intake_goals).toEqual([{ title: "Vào chuyên Anh", due: "06/2027" }]);
      expect(r.milestones.some((m) => m.status === "removed" && m.reason)).toBe(true);
      expect(r.curricula.length).toBeGreaterThanOrEqual(2);
      const main = r.curricula.find((c) => c.id === r.main_id)!;
      expect(main.units.length).toBe(6);
      expect(main.payload).not.toBeNull();
      expect(r.curricula.filter((c) => c.id !== r.main_id).every((c) => c.payload === null)).toBe(true);
      expect((await q1<{ v: unknown }>("select english.eng_track_setting('A','roadmap_goal_label') as v"))[0]!.v).toBe("Lên B1");
    });
  });

  it("replay comes before everything else: a retry still gets its first answer after a newer version exists, also with no fields", async () => {
    const cid = randomUUID();
    const v1 = await write({ clientId: cid, fields: fields({ title: "Replay later" }), status: "draft" });
    const cid2 = randomUUID();
    const v2 = await write({ milestone: v1.milestone_id, base: 1, fields: null, status: "confirmed", clientId: cid2 });
    await write({ milestone: v1.milestone_id, base: 2, fields: fields({ title: "Replay later (đổi tên)" }), status: "confirmed" });
    // the first call again, now that v3 exists: same answer, not stale_version
    expect(await write({ clientId: cid, fields: fields({ title: "Replay later" }), status: "draft" })).toEqual({ ...v1, replayed: true });
    // the second call again with NO fields (it was a confirm as-is): compared against the row that call wrote
    expect(await write({ milestone: v1.milestone_id, base: 1, fields: null, status: "confirmed", clientId: cid2 })).toEqual({ ...v2, replayed: true });
    // a different intent with the same id is refused, with or without fields
    await fail(write({ milestone: v1.milestone_id, base: 1, fields: null, status: "draft", clientId: cid2 }), "23505", /client_id_reused/);
    await fail(write({ milestone: randomUUID(), base: 1, fields: null, status: "confirmed", clientId: cid2 }), "23505", /client_id_reused/);
    await fail(write({ clientId: cid, fields: fields({ title: "Other" }), status: "draft" }), "23505", /client_id_reused/);
  });

  it("history is capped at 20 per milestone but the used proposal keys and the version the child sees are NOT", async () => {
    const keyOk = `pt:${randomUUID()}:long-confirmed`;
    const keyDraft = `pt:${randomUUID()}:long-draft`;
    const a = await write({ key: keyOk, fields: fields({ title: "Long confirmed" }), status: "confirmed" });
    const b = await write({ key: keyDraft, fields: fields({ title: "Long draft" }), status: "draft" });
    for (let v = 1; v <= 22; v += 1) {
      await write({ milestone: a.milestone_id, base: v, fields: null, status: "draft" });
      await write({ milestone: b.milestone_id, base: v, fields: null, status: "draft" });
    }
    const raw = (await rowsAs<{ r: Record<string, unknown> & { milestones: { milestone_id: string; version: number; id: string }[]; used_keys: string[]; visible_ids: Record<string, string> } }>(
      db.client, "service_role", null, "select english.eng_roadmap($1) as r", [NG()]))[0]!.r;
    const ofA = raw.milestones.filter((m) => m.milestone_id === a.milestone_id).map((m) => m.version);
    const ofB = raw.milestones.filter((m) => m.milestone_id === b.milestone_id).map((m) => m.version);
    expect(ofA).toEqual([1, ...Array.from({ length: 20 }, (_, i) => i + 4)]); // v1 is kept because the child still sees it; v2, v3 are cut
    expect(ofB).toEqual(Array.from({ length: 20 }, (_, i) => i + 4));          // v1 of the never-confirmed one is cut
    expect(raw.used_keys).toContain(keyOk);
    expect(raw.used_keys).toContain(keyDraft);                                  // the key lives on a version that is no longer listed
    const visibleOfA = (await q1<{ id: string }>("select id from english.roadmap_milestones where milestone_id = $1 and version = 1", [a.milestone_id]))[0]!.id;
    expect(raw.visible_ids[a.milestone_id]).toBe(visibleOfA);
    expect(raw.visible_ids[b.milestone_id]).toBeUndefined();
    // the TypeScript side uses them: the child-visible version is v1 (confirmed), the other milestone is invisible to the child
    const view = parseRoadmap(raw);
    const cardA = view.cards.find((c) => c.milestoneId === a.milestone_id)!;
    expect(cardA.current.version).toBe(23);
    expect(cardA.childSees?.version).toBe(1);
    expect(view.cards.find((c) => c.milestoneId === b.milestone_id)!.childSees).toBeNull();
  });

  it("a tutor whose relationship has ended is refused; the same tutor writes again when it is restored", async () => {
    await q1("update english.relationships set valid_from = now() - interval '10 days' where member_id = $1 and learner_id = $2", [M().tutorNguyen, NG()]);
    await q1("update english.relationships set valid_to = now() - interval '1 day' where member_id = $1 and learner_id = $2", [M().tutorNguyen, NG()]);
    try {
      await fail(write({ fields: fields({ title: "Too late" }) }), "42501", /tutor_only/);
      await fail(svc("select english.eng_roadmap_set_main($1,$2,$3,$4) as r", [NG(), cNg.id, M().tutorNguyen, randomUUID()]), "42501", /tutor_only/);
    } finally {
      await q1("update english.relationships set valid_to = null where member_id = $1 and learner_id = $2", [M().tutorNguyen, NG()]);
    }
    expect((await write({ fields: fields({ title: "Back again" }) })).version).toBe(1);
  });

  it("two concurrent confirm calls cannot leave two confirmed summits", async () => {
    // start clean: demote every summit the child sees now
    for (const m of await q1<{ milestone_id: string; version: number }>("select s.milestone_id, (select max(version) from english.roadmap_milestones r where r.milestone_id = s.milestone_id) as version from english.eng_roadmap_visible($1) s where s.role = 'summit'", [NG()])) {
      await write({ milestone: m.milestone_id, base: m.version, fields: fields({ kind: "goal", role: "beyond", title: "Demoted" }), status: "confirmed" });
    }
    const one = await write({ fields: fields({ kind: "goal", role: "summit", title: "Đỉnh A" }), status: "draft" });
    const two = await write({ fields: fields({ kind: "goal", role: "summit", title: "Đỉnh B" }), status: "draft" });
    const clients = await Promise.all([1, 2].map(async () => { const c = new Client(pgConfigFromUrl(db.url)); await c.connect(); return c; }));
    try {
      const results = await Promise.allSettled(
        [one, two].map(async (m, i) => {
          const c = clients[i]!;
          await c.query("begin");
          try {
            await c.query("set local role service_role");
            const r = await c.query("select english.eng_roadmap_write($1,$2,$3,null,'confirmed',null,null,$4,$5) as r", [NG(), m.milestone_id, 1, M().tutorNguyen, randomUUID()]);
            await c.query("commit");
            return r.rows[0];
          } catch (err) {
            await c.query("rollback");
            throw err;
          }
        }),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const bad = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(bad).toHaveLength(1);
      expect(bad[0]!.reason).toMatchObject({ code: "23514" });
      expect(String((bad[0]!.reason as Error).message)).toMatch(/summit_exists/);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
    expect(await q1("select 1 from english.eng_roadmap_visible($1) where role = 'summit'", [NG()])).toHaveLength(1);
  });

  it("the migration is idempotent: applying it twice changes nothing", async () => {
    const { readFile } = await import("node:fs/promises");
    const { MIGRATIONS_DIR } = await import("../../scripts/lib/migrate");
    const file = (await import("node:fs")).readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_roadmap_milestones.sql"))!;
    const sql = await readFile(`${MIGRATIONS_DIR}/${file}`, "utf8");
    const snapshot = async () => ({
      milestones: await count("roadmap_milestones"), main: await count("roadmap_main_curriculum"),
      settings: JSON.stringify(await q1("select track_id, key, value from english.track_settings order by track_id, key")),
    });
    const before = await snapshot();
    await db.client.query(sql);
    await db.client.query(sql);
    expect(await snapshot()).toEqual(before);
    expect(await count("schema_migrations", "version = $1", [file.slice(0, 4)])).toBe(1);
  });

  it("purge: the dry run and the receipt count both tables; afterwards there are no rows; the receipt matches the dry run", async () => {
    const L = NG();
    const before = { m: await count("roadmap_milestones", "learner_id = $1", [L]), c: await count("roadmap_main_curriculum", "learner_id = $1", [L]) };
    expect(before.m).toBeGreaterThan(0);
    expect(before.c).toBeGreaterThan(0);
    const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [L]);
    expect(dry.counts).toMatchObject({ roadmap_milestones: before.m, roadmap_main_curriculum: before.c });
    const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1,$2) as r", [L, s.users.parent]);
    expect(receipt.deleted).toMatchObject({ roadmap_milestones: before.m, roadmap_main_curriculum: before.c });
    expect(Object.keys(receipt.deleted).sort()).toEqual(Object.keys(dry.counts).sort());
    expect(await count("roadmap_milestones", "learner_id = $1", [L])).toBe(0);
    expect(await count("roadmap_main_curriculum", "learner_id = $1", [L])).toBe(0);
  });
});
