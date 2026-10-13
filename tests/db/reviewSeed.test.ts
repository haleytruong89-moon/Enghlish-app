import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_REVIEW_WORK, seedDevReviewWork } from "../../scripts/lib/seed";
import { as, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

describe("S5 dev seed: something to review on a preview", () => {
  let db: TestDb;
  let s: Seeded;
  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("gives An the week-4 inquiry and one submitted writing practice; a second run changes nothing", async () => {
    const first = await seedDevReviewWork(db.client, s, s.users);
    expect(first.skipped).toBeUndefined();
    expect(first.attemptId).toBeTruthy();
    const second = await seedDevReviewWork(db.client, s, s.users);
    expect(second).toEqual(first);
    const n = async (sql: string) => ((await db.client.query<{ n: number }>(sql)).rows[0] as { n: number }).n;
    expect(await n("select count(*)::int as n from english.attempts")).toBe(1);
    expect(await n("select count(*)::int as n from english.inquiry_instances")).toBe(1);
    const [row] = (await db.client.query<{ template_id: string; step_no: number; provenance: string; client_submission_id: string }>(
      "select i.template_id, a.step_no, t.provenance, t.client_submission_id from english.attempts t join english.activity_instances a on a.id = t.activity_instance_id join english.inquiry_instances i on i.id = a.inquiry_instance_id",
    )).rows;
    expect(row).toEqual({ template_id: DEV_REVIEW_WORK.template, step_no: DEV_REVIEW_WORK.stepNo, provenance: "in_app", client_submission_id: DEV_REVIEW_WORK.submissionId });
  });

  it("the test tutor and the test parent find it in the inbox, to score; Nguyên's tutor does not", async () => {
    const inbox = async (uid: string) =>
      as(db.client, "authenticated", uid, async (q) => ((await q("select english.eng_review_inbox(false) as r")).rows[0] as { r: { items: { learner_id: string; targets_total: number; targets_decided: number; can_decide: boolean; category: string }[] } }).r.items);
    for (const uid of [s.users.tutorAn, s.users.parent]) {
      const rows = await inbox(uid);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ learner_id: s.learners.an, targets_total: 2, targets_decided: 0, can_decide: true, category: "practice" });
    }
    expect(await inbox(s.users.tutorNguyen)).toEqual([]);
    expect(await inbox(s.users.studentAn)).toEqual([]);
  });
});
