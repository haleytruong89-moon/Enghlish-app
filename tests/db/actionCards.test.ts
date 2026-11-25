import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

/** "Việc nên làm" PR-B (migration 0043): a tutor / the parent marks a card done or skipped; who reads what; append-only; purge. */
describe("action_card_decisions (migration 0043)", () => {
  let db: TestDb;
  let s: Seeded;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const asUser = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", user, async (q) => (await q(sql, params)).rows as T);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  type D = { id: string; at: string; replayed: boolean };
  const decide = (o: { learner?: string; key?: string; kind?: string; label?: string; evidenceAt?: string | null; decision?: string; reason?: string | null; by?: string; clientId?: string } = {}) =>
    svc<D>("select english.eng_decide_action_card($1, $2, $3, $4, $5, $6, $7, $8, $9) as r", [
      o.learner ?? s.learners.nguyen, o.key ?? "fix-i1-E", o.kind ?? "fix_together", o.label ?? "Chữa bài cùng con: Unit 15 · phần E", o.evidenceAt === undefined ? "2026-11-20T03:00:00Z" : o.evidenceAt, o.decision ?? "done", o.reason === undefined ? null : o.reason,
      o.by ?? s.members.tutorNguyen, o.clientId ?? randomUUID(),
    ]);

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("the child's tutor marks a card done; the same client id gives the same row", async () => {
    const cid = randomUUID();
    const a = await decide({ clientId: cid });
    expect(a.replayed).toBe(false);
    const b = await decide({ clientId: cid });
    expect(b).toMatchObject({ id: a.id, replayed: true });
    // The same id for ANOTHER mark is refused (a mistake, never a silent replay).
    await fail(decide({ clientId: cid, decision: "skipped", reason: "khác" }), "23505", /client_id_reused/);
    await fail(decide({ clientId: cid, key: "fix-i2-A" }), "23505", /client_id_reused/);
  });

  it("skipping needs a reason (≥ 3 characters); the grading card and unknown kinds / decisions are refused", async () => {
    await fail(decide({ decision: "skipped" }), "22023", /reason_required/);
    await fail(decide({ decision: "skipped", reason: " a " }), "22023", /reason_required/);
    await fail(decide({ kind: "grade" }), "22023", /bad_kind/);
    await fail(decide({ decision: "later" }), "22023", /bad_decision/);
    await fail(decide({ reason: "x".repeat(301) }), "22023", /reason_too_long/);
    await fail(decide({ label: "  " }), "22023", /bad_label/);
    await fail(decide({ evidenceAt: "2099-01-01T00:00:00Z" }), "22023", /bad_evidence/);
    const ok = await decide({ decision: "skipped", reason: "Đã chữa trong buổi 24/11" });
    expect(ok.replayed).toBe(false);
  });

  it("the parent may mark; the other child's tutor and a student may not", async () => {
    expect((await decide({ by: s.members.parent, key: "tag-dang-tu", kind: "practise" })).replayed).toBe(false);
    await fail(decide({ by: s.members.tutorAn }), "42501");
    await fail(decide({ by: s.members.studentNguyen }), "42501");
  });

  it("reading: the child's tutor and the parent see the rows; the other tutor and the student see none", async () => {
    const sql = "select card_key, decision, by_role from english.action_card_decisions where learner_id = $1";
    expect((await asUser<unknown[]>(s.users.tutorNguyen, sql, [s.learners.nguyen])).length).toBeGreaterThanOrEqual(3);
    expect((await asUser<unknown[]>(s.users.parent, sql, [s.learners.nguyen])).length).toBeGreaterThanOrEqual(3);
    expect(await asUser<unknown[]>(s.users.tutorAn, sql, [s.learners.nguyen])).toEqual([]);
    await fail(asUser(s.users.studentNguyen, sql, [s.learners.nguyen]), "42501").catch(async () => {
      expect(await asUser<unknown[]>(s.users.studentNguyen, sql, [s.learners.nguyen])).toEqual([]);
    });
  });

  it("append-only: no update, no delete, no direct insert (even service_role); the table owner is stopped by the trigger", async () => {
    await fail(svc("update english.action_card_decisions set decision = 'skipped' returning 1 as r"), "42501");
    await fail(svc("delete from english.action_card_decisions returning 1 as r"), "42501");
    await fail(db.client.query("update english.action_card_decisions set decision = 'skipped'"), "42501", /append-only/);
    await fail(db.client.query("delete from english.action_card_decisions"), "42501", /append-only/);
    await fail(
      svc("insert into english.action_card_decisions(learner_id, card_key, kind, label, decision, by_member, by_role, client_id) values ($1, 'k', 'praise', 'x', 'done', $2, 'tutor', 'cccccccc') returning 1 as r", [s.learners.nguyen, s.members.tutorNguyen]),
      "42501",
    );
  });

  it("purge preview counts the rows; purge removes them; the other child keeps hers", async () => {
    await decide({ learner: s.learners.an, by: s.members.tutorAn, key: "unit-U3", kind: "unit_review" });
    const n = Number((await db.client.query("select count(*) from english.action_card_decisions where learner_id = $1", [s.learners.nguyen])).rows[0].count);
    expect(n).toBeGreaterThanOrEqual(3);
    const preview = await svc<Record<string, unknown>>("select english.eng_purge_preview($1) as r", [s.learners.nguyen]);
    expect(JSON.stringify(preview)).toContain(`"action_card_decisions":${n}`);
    const receipt = await svc<{ deleted: Record<string, number> }>("select english.eng_purge_learner($1, null) as r", [s.learners.nguyen]);
    expect(receipt.deleted.action_card_decisions).toBe(n);
    const left = (await db.client.query<{ learner_id: string }>("select learner_id from english.action_card_decisions")).rows;
    expect(left.every((r) => r.learner_id === s.learners.an)).toBe(true);
    expect(left.length).toBe(1);
  });
});
