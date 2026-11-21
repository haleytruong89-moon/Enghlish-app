import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStudioBuild } from "../../lib/studio/buildTemplate";
import { removeItem, removePart } from "../../lib/studio/editOps";
import type { StudioDraft, StudioItem } from "../../lib/studio/schema";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** 21/11: a test cut down on "Duyệt đề" (whole parts or single questions removed) must still be approved, assigned and done. */
describe("Studio draft cut down by the tutor (edit operations + migration 0024)", () => {
  let db: TestDb;
  let s: Seeded;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const svc = async <T = unknown>(sql: string, params: unknown[] = []) => asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const asStudent = async <T = unknown>(sql: string, params: unknown[] = []) => asCommit(db.client, "authenticated", s.users.studentNguyen, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const item = (n: number, part: string, over: Partial<StudioItem> = {}): StudioItem => ({
    n, part, kind: "gap", out_of_app: false, stem: `Sentence ${n} ____.`, options: [], passage_ref: null, key: `k${n}`, accepted: [],
    tag_key: "dang-tu", target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: false, review_reason: null, ...over,
  });
  const FOUR: StudioDraft = {
    parts: ["M", "N", "O", "P"].map((key) => ({ key, name: `${key} · Word formation`, instructions: `Do ${key}.` })),
    passages: [{ ref: "P1", title: "Einstein", text: "Text (1) ____ (BROAD)" }],
    items: [item(1, "M"), item(2, "M"), item(3, "N", { passage_ref: "P1" }), item(4, "N", { passage_ref: "P1" }), item(5, "O"), item(6, "O"), item(7, "P"), item(8, "P")],
  };
  let k = 0;
  const approveAndAssign = async (payload: StudioDraft) => {
    k += 1;
    const title = `Word formation ${k}`;
    const made = await svc<{ id: string }>("select english.eng_create_studio_draft($1, $2, null, null, false, $3, $4) as r", [s.learners.nguyen, title, s.members.tutorNguyen, `eo-${k}-aaaaaaaa`]);
    const cur = await svc<{ updated_at: string }>("select english.eng_studio_draft($1) as r", [made.id]);
    const saved = await svc<{ updated_at: string }>("select english.eng_save_studio_draft($1, $2, $3::jsonb, $4, $5) as r", [made.id, title, JSON.stringify(payload), cur.updated_at, s.members.tutorNguyen]);
    const ok = await svc<{ template_id: string; frame_id: string }>("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [made.id, saved.updated_at, JSON.stringify(buildStudioBuild(payload)), s.members.tutorNguyen]);
    const act = await svc<{ activity_id: string }>("select english.eng_assign_studio($1, current_date, current_date + 3, $2, $3) as r", [made.id, s.members.tutorNguyen, `as-${randomUUID()}`]);
    return { ...ok, activityId: act.activity_id };
  };

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("the gap left by removed parts made the database refuse the frame; the renumbered draft is approved, assigned and done", async () => {
    // What the old screen produced: questions 3, 4, 7, 8 (parts M and O deleted question by question).
    const gapped: StudioDraft = { ...FOUR, items: FOUR.items.filter((i) => i.part === "N" || i.part === "P") };
    const err = await approveAndAssign(gapped).then(() => null, (e: Error) => e);
    expect(err?.message).toMatch(/outside 1\.\.total_items/);

    const cut = removePart(removePart(FOUR, "M"), "O");
    const r = await approveAndAssign(cut);
    const frame = (await q1<{ total_items: number; parts: { key: string; from: number; to: number }[] }>("select total_items, parts from english.test_frames where id = $1", [r.frame_id]))[0]!;
    expect(frame.total_items).toBe(4);
    expect(frame.parts.map((p) => [p.key, p.from, p.to])).toEqual([["N", 1, 2], ["P", 3, 4]]);
    const view = await asStudent<{ step: { prompt_en: string; items: { id: string; stem: string }[] } }>("select english.eng_my_activity($1) as r", [r.activityId]);
    expect(view.step.items.map((i) => [i.id, i.stem])).toEqual([["q1", "Sentence 3 ____."], ["q2", "Sentence 4 ____."], ["q3", "Sentence 7 ____."], ["q4", "Sentence 8 ____."]]);
    expect(view.step.prompt_en).not.toMatch(/Do M|Do O/); // instructions of removed parts are gone
    // the old keys follow their questions
    const att = await asStudent<{ attempt_id: string }>("select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [r.activityId, randomUUID(), JSON.stringify({ answers: { q1: "k3", q2: "k4", q3: "k7", q4: "wrong" } }), ["none"]]);
    expect((await q1("select total_items, correct, wrong_items from english.results where attempt_id = $1", [att.attempt_id]))[0]).toEqual({ total_items: 4, correct: 3, wrong_items: [4] });
  });

  it("a part emptied question by question does not block: it is left out of the child's task and of the frame", async () => {
    const cut = FOUR.items.filter((i) => i.part === "N").reduce((d, i) => removeItem(d, d.items.find((x) => x.stem === i.stem)!), FOUR);
    expect(cut.parts).toHaveLength(4);
    const r = await approveAndAssign(cut);
    const frame = (await q1<{ parts: { key: string }[] }>("select parts from english.test_frames where id = $1", [r.frame_id]))[0]!;
    expect(frame.parts.map((p) => p.key)).toEqual(["M", "O", "P"]);
    // the reading text belonged to the removed questions only: the child gets no reading text
    expect(await q1("select 1 from english.template_step_sources where template_id = $1", [r.template_id])).toEqual([]);
  });

  it("Bài làm trên app đã giao: the child's tutor and the parent read the rows the list is built from (RLS); the other tutor and the child do not", async () => {
    const r = await approveAndAssign(removePart(FOUR, "O"));
    const att = await asStudent<{ attempt_id: string }>("select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [r.activityId, randomUUID(), JSON.stringify({ answers: { q1: "k1" } }), ["none"]]);
    const reads = [
      ["select id from english.inquiry_instances where template_id = $1", [r.template_id]],
      ["select id from english.activity_instances where id = $1", [r.activityId]],
      ["select id from english.attempts where id = $1", [att.attempt_id]],
      ["select id from english.episodes where attempt_id = $1", [att.attempt_id]],
      ["select id from english.results where attempt_id = $1", [att.attempt_id]],
    ] as const;
    for (const [sql, params] of reads) {
      expect((await rowsAs(db.client, "authenticated", s.users.tutorNguyen, sql, [...params])).length, sql).toBe(1);
      expect((await rowsAs(db.client, "authenticated", s.users.parent, sql, [...params])).length, sql).toBe(1);
      expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, sql, [...params]), sql).toEqual([]);
    }
    expect(await rowsAs(db.client, "authenticated", s.users.studentNguyen, "select id from english.episodes where attempt_id = $1", [att.attempt_id])).toEqual([]);
    expect(await rowsAs(db.client, "authenticated", s.users.studentNguyen, "select id from english.results where attempt_id = $1", [att.attempt_id])).toEqual([]);
  });
});

