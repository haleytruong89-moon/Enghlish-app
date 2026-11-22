import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStudioBuild } from "../../lib/studio/buildTemplate";
import type { StudioDraft, StudioItem } from "../../lib/studio/schema";
import { asCommit, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** E1 (migration 0039): the server side of the "Hỏi" button. Rules L2 (no tutor on a test), P-E1-3 (before sending only), levels, ledger. */
describe("tutor hints (migration 0039)", () => {
  let db: TestDb;
  let s: Seeded;
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
  const item = (n: number, part: string, over: Partial<StudioItem> = {}): StudioItem => ({
    n, part, kind: "gap", out_of_app: false, stem: `Sentence ${n} ____.`, options: [], passage_ref: null, key: `k${n}`, accepted: [],
    tag_key: "dang-tu", target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: false, review_reason: null, ...over,
  });
  const PAPER: StudioDraft = {
    parts: [{ key: "A", name: "A · Places", instructions: "Complete with a suitable place. Places: museum, art gallery, zoo" }],
    passages: [],
    items: [item(1, "A", { key: "art gallery", accepted: ["art-gallery"] }), item(2, "A", { kind: "mcq", key: "B", options: [{ letter: "A", text: "temple" }, { letter: "B", text: "museum" }] })],
  };
  let k = 0;
  const assign = async (isTest = false, paper: StudioDraft = PAPER) => {
    k += 1;
    const by = s.members.tutorNguyen;
    const made = await svc<{ id: string }>("select english.eng_create_studio_draft($1, $2, null, null, false, $3, $4) as r", [s.learners.nguyen, `Tutor ${k}`, by, `th-${k}-aaaaaaaa`]);
    const cur = await svc<{ updated_at: string }>("select english.eng_studio_draft($1) as r", [made.id]);
    const saved = await svc<{ updated_at: string }>("select english.eng_save_studio_draft($1, $2, $3::jsonb, $4, $5) as r", [made.id, `Tutor ${k}`, JSON.stringify(paper), cur.updated_at, by]);
    await svc("select english.eng_approve_studio_draft($1, $2, $3::jsonb, $4) as r", [made.id, saved.updated_at, JSON.stringify(buildStudioBuild(paper)), by]);
    return (await svc<{ activity_id: string }>("select english.eng_assign_studio_v2($1, current_date, current_date + 3, $2, $3, $4) as r", [made.id, isTest, by, `as-${randomUUID()}`])).activity_id;
  };
  type Ctx = { has_passage?: boolean; item: { id: string; kind: string }; part: { name: string; instructions: string } | null; answers: string[]; hints_used: number; turns_today: number; daily_limit: number; language: string; band: string; previous: unknown[]; replay?: { shown_text: string } };
  const ctx = (activity: string, itemId = "q1", clientId = randomUUID(), user = s.users.studentNguyen) =>
    svc<Ctx>("select english.eng_tutor_context($1, $2, $3, $4) as r", [user, activity, itemId, clientId]);
  const record = (activity: string, o: { kind?: string; item?: string; clientId?: string; text?: string; guard?: string; fixed?: string | null; user?: string } = {}) =>
    svc<{ id: string; level: number; replayed: boolean; shown_text: string }>(
      "select english.eng_record_tutor_turn($1, $2, $3, $4, null, $5, $6, '{}'::text[], '{}'::text[], $7, 'tutor-hint.v1', 'claude-sonnet-5-5', '{}'::uuid[], 0.012, $8) as r",
      [o.user ?? s.users.studentNguyen, activity, o.item ?? "q1", o.kind ?? "hint", o.text ?? "Think about paintings.", o.guard ?? (o.kind === "fixed" ? "fixed" : "pass"), o.fixed ?? (o.kind === "fixed" ? "max_level" : null), o.clientId ?? randomUUID()]);

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("the child's own practice step: the question, its part (E0), the answers for the server only, settings of the track", async () => {
    const act = await assign();
    const c = await ctx(act);
    expect(c.item).toMatchObject({ id: "q1", kind: "gap" });
    expect(c.part).toEqual({ key: "A", name: "A · Places", instructions: "Complete with a suitable place. Places: museum, art gallery, zoo" });
    expect([...c.answers].sort()).toEqual(["art gallery", "art-gallery"]);
    expect((await ctx(act, "q2")).answers).toEqual(["B"]);
    expect(c).toMatchObject({ hints_used: 0, turns_today: 0, daily_limit: 40, language: "en_first", band: "B2-C1" });
  });

  it("0040 (hub Q4): has_passage is true only for a question that rests on a reading passage", async () => {
    const withText: StudioDraft = {
      ...PAPER,
      passages: [{ ref: "P1", title: "A short text", text: "Mia visited the art gallery on Sunday and saw paintings." }],
      items: [...PAPER.items, item(3, "A", { kind: "mcq", key: "A", passage_ref: "P1", stem: "Where did Mia go?", options: [{ letter: "A", text: "an art gallery" }, { letter: "B", text: "a zoo" }] })],
    };
    const act = await assign(false, withText);
    expect((await ctx(act, "q3")).has_passage).toBe(true);
    expect((await ctx(act, "q1")).has_passage).toBe(false);
    expect((await ctx(await assign())).has_passage).toBe(false);
  });

  it("L2: a test gives 42501 test_work and nothing is recorded; not the child's step / another child / a missing question: not_found", async () => {
    const test = await assign(true);
    await fail(ctx(test), "42501", /test_work/);
    await fail(record(test), "42501", /test_work/);
    const act = await assign();
    await fail(ctx(act, "q1", randomUUID(), s.users.studentAn), "P0002", /not_found/); // S.14
    await fail(ctx(act, "q1", randomUUID(), s.users.tutorNguyen), "P0002", /not_found/);
    await fail(ctx(act, "q9"), "P0002", /not_found/);
    await fail(asUser(s.users.studentNguyen, "select english.eng_tutor_context($1, $2, 'q1', 'cid-aaaaaaaa') as r", [s.users.studentNguyen, act]), "42501");
  });

  it("levels are the server's: 1, 2, 3, then 3 again; a question keeps the level; a replay returns the same turn (no second call)", async () => {
    const act = await assign();
    expect((await record(act)).level).toBe(1);
    expect((await record(act)).level).toBe(2);
    expect((await record(act, { kind: "question" })).level).toBe(2);
    expect((await record(act)).level).toBe(3);
    expect((await record(act)).level).toBe(3); // S.2
    const cid = randomUUID();
    const first = await record(act, { clientId: cid, text: "First text." });
    expect(await record(act, { clientId: cid, text: "Other text." })).toMatchObject({ id: first.id, replayed: true, shown_text: "First text." });
    expect((await ctx(act, "q1", cid)).replay).toMatchObject({ shown_text: "First text." }); // S.3: the context gives it back before any model call
    // review 21/11: the same client id for another question is refused (never shows an old turn under a new question)
    await fail(record(act, { clientId: cid, item: "q2" }), "22023", /client_id_reused/);
    const c = await ctx(act);
    expect(c.hints_used).toBe(5);
    expect(c.previous).toHaveLength(4);
    expect(c.turns_today).toBeGreaterThanOrEqual(6);
  });

  it("fixed answers (no AI) are recorded but do not count toward the daily limit; an AI error does", async () => {
    const act = await assign();
    const before = (await ctx(act)).turns_today;
    await record(act, { kind: "fixed", text: "Bạn thử trả lời nhé." });
    expect((await ctx(act)).turns_today).toBe(before);
    // review 21/11: an AI error turn called the model, so it counts
    await record(act, { kind: "fixed", fixed: "ai_error", text: "Gia sư chưa trả lời được." });
    expect((await ctx(act)).turns_today).toBe(before + 1);
  });

  it("P-E1-3: after the work is sent there is no tutor (sent)", async () => {
    const act = await assign();
    await asUser(s.users.studentNguyen, "select english.eng_submit_attempt($1, $2, $3::jsonb, $4::text[], 'in_app') as r", [act, randomUUID(), JSON.stringify({ answers: { q1: "x" } }), ["none"]]);
    await fail(ctx(act), "23514", /sent/);
  });

  it("the child never reads tutor_turns; the child's adults do; the table is append-only", async () => {
    const act = await assign();
    await record(act);
    const sql = "select id from english.tutor_turns where activity_id = $1";
    expect(await rowsAs(db.client, "authenticated", s.users.studentNguyen, sql, [act])).toEqual([]);
    expect((await rowsAs(db.client, "authenticated", s.users.tutorNguyen, sql, [act])).length).toBe(1);
    expect((await rowsAs(db.client, "authenticated", s.users.parent, sql, [act])).length).toBe(1);
    expect(await rowsAs(db.client, "authenticated", s.users.tutorAn, sql, [act])).toEqual([]);
    await fail(q1("update english.tutor_turns set shown_text = 'x'"), "42501");
  });

  it("P1: the parent sets a cap up to 50 and a warning up to the cap; tutors cannot; the settings show tutor turns per child", async () => {
    const st = await svc<{ monthly_cap_usd: number; soft_cap_usd: number; learners: { tutor_today: number; tutor_month: number }[] }>("select english.eng_set_ai_cap(20, 18, $1) as r", [s.members.parent]);
    expect(Number(st.monthly_cap_usd)).toBe(20);
    expect(Number(st.soft_cap_usd)).toBe(18);
    expect(st.learners.some((l) => l.tutor_today > 0 && l.tutor_month >= l.tutor_today)).toBe(true);
    await fail(svc("select english.eng_set_ai_cap(60, 18, $1) as r", [s.members.parent]), "22023", /bad_cap/);
    await fail(svc("select english.eng_set_ai_cap(20, 25, $1) as r", [s.members.parent]), "22023", /bad_cap/);
    await fail(svc("select english.eng_set_ai_cap(20, 18, $1) as r", [s.members.tutorNguyen]), "42501", /parent_only/);
  });

  it("the AI ledger takes the two new purposes (reserve, then log the real call releasing it)", async () => {
    await svc("select english.eng_set_ai_settings(true, 'pilot-2026-10', $1) as r", [s.members.parent]);
    const g = await svc<{ allowed: boolean; reservation_id: string }>("select english.eng_ai_gate($1, 0.05, true, null, 'claude-sonnet-5-5', null, 'tutor_hint') as r", [s.learners.nguyen]);
    expect(g.allowed).toBe(true);
    const fam = (await q1<{ family_id: string }>("select family_id from english.learners where id = $1", [s.learners.nguyen]))[0]!.family_id;
    // The reservation is for tutor_hint: the Haiku run cannot release it (lib/tutor/turn.ts releases with the last Sonnet run).
    await fail(svc("select english.eng_log_ai_run($1, null, 'claude-haiku-5-5', 'tutor-check.v2', 900, 60, 0.0001, 'ok', null, null, $2, 'tutor_check') as r", [fam, g.reservation_id]), "23514", /bad_release/);
    const run = await svc<string>("select english.eng_log_ai_run($1, null, 'claude-sonnet-5-5', 'tutor-hint.v1', 1500, 800, 0.011, 'ok', null, null, $2, 'tutor_hint') as r", [fam, g.reservation_id]);
    expect(run).toBeTruthy();
    expect(await svc("select english.eng_log_ai_run($1, null, 'claude-haiku-5-5', 'tutor-check.v1', 900, 60, 0.0001, 'ok', null, null, null, 'tutor_check') as r", [fam])).toBeTruthy();
  });

  it("purge counts tutor_turns; the migration can run again", async () => {
    const dry = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [s.learners.nguyen]);
    expect(dry.counts.tutor_turns).toBeGreaterThan(0);
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(new URL("../../db/migrations/0039_tutor_hints.sql", import.meta.url), "utf8");
    await db.client.query(sql);
    await db.client.query(sql);
  });
});
