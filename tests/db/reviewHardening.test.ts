import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import type { InquiryTemplate } from "../../lib/config/schemas";
import { addDays, daysBetween, todayVn } from "../../lib/inquiries/dates";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

/**
 * S5 hardening after the Opus review: who may record work outside the app, the inbox at scale, backdated records, what the student
 * can read, tutor-live criteria, the support-note limit, and the races between two people acting on the same piece of work.
 * (The broad S5 behaviour is in review.test.ts; this file has its own database so it can add many rows.)
 */
const TODAY = todayVn();

const template = (id: string): InquiryTemplate =>
  JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", `${id}.json`), "utf8")) as InquiryTemplate;
function dueReleasingAll(id: string): string {
  const t = template(id);
  const last = t.steps.map((s) => s.planned_date ?? "").sort().at(-1) ?? "";
  return addDays(TODAY, daysBetween(last, t.dates.to));
}

describe("S5 hardening (Opus review)", () => {
  let db: TestDb;
  let s: Seeded;
  const M = () => s.members;

  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const count = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  let seq = 0;
  async function assign(who: "an" | "nguyen", templateId: string): Promise<string> {
    const r = await q1<{ id: string }>("select english.eng_assign_inquiry($1, $2, 1, $3, $4, $5) as id", [
      s.learners[who], templateId, dueReleasingAll(templateId), s.members.parent, `s5h-${(seq += 1)}-${templateId}`,
    ]);
    return (r[0] as { id: string }).id;
  }
  async function activity(instance: string, stepNo: number): Promise<string> {
    return ((await q1<{ id: string }>("select id from english.activity_instances where inquiry_instance_id = $1 and step_no = $2", [instance, stepNo]))[0] as { id: string }).id;
  }
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  type Offline = { attempt_id: string; episode_id: string; attempt_no: number; submitted_at: string; replayed: boolean };
  const offline = (by: string, activityId: string, provenance: string, text: string, opts: { date?: string; assistance?: string[]; clientId?: string } = {}) =>
    svc<Offline>("select english.eng_record_offline_attempt($1, $2, $3, null, null, $4::date, $5::text[], $6, $7) as r", [
      activityId, provenance, text, opts.date ?? TODAY, opts.assistance ?? ["none"], by, opts.clientId ?? randomUUID(),
    ]);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  let aW0: string; // An, baseline
  let aW1: string; // An, volcanoes

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    aW0 = await assign("an", "A-W0-BASELINE");
    aW1 = await assign("an", "A-W1-VOLCANOES");
  });
  afterAll(async () => {
    await db?.drop();
  });

  // -------------------------------------------------------------------------------------------------------------
  describe("work recorded outside the app on a checkpoint step or a live speaking step is the tutor's alone", () => {
    it("a parent cannot record A-W0 step 8 (live speaking, baseline) or A-W1 step 8 (checkpoint) - with either kind of record", async () => {
      for (const act of [await activity(aW0, 8), await activity(aW1, 8)]) {
        await fail(offline(M().parent, act, "manual_import", "Paper note"), "42501", /D15/);
        await fail(offline(M().parent, act, "tutor_live", "I watched"), "42501");
        expect(await count("select count(*)::int as n from english.attempts where activity_instance_id = $1", [act])).toBe(0);
      }
    });

    it("the tutor records them: a live speaking step only as tutor_live; a checkpoint on paper is allowed for the tutor", async () => {
      const w0s8 = await activity(aW0, 8); // ACT-SPEAK-LIVE
      await fail(offline(M().tutorAn, w0s8, "manual_import", "Paper note"), "22023", /tutor_live/);
      const live = await offline(M().tutorAn, w0s8, "tutor_live", "An answered three questions in a row");
      expect(live).toMatchObject({ attempt_no: 1, replayed: false });
      expect(await q1("select observed_directly from english.episodes where attempt_id = $1", [live.attempt_id])).toEqual([{ observed_directly: true }]);

      const w1s8 = await activity(aW1, 8); // ACT-SPEAK-MONO + checkpoint, not a live step
      const onPaper = await offline(M().tutorAn, w1s8, "manual_import", "Paper retelling, 6 sentences");
      expect(onPaper.attempt_no).toBe(1);
      expect(await q1("select observed_directly, facets->>'checkpoint' as cp from english.episodes where attempt_id = $1", [onPaper.attempt_id])).toEqual([{ observed_directly: false, cp: "true" }]);
    });

    it("a parent can still record ordinary paper work (not a checkpoint, not a live step)", async () => {
      const act = await activity(aW1, 6); // ACT-WRITE practice
      const r = await offline(M().parent, act, "manual_import", "Paper writing");
      expect(r.attempt_no).toBe(1);
    });

    it("an expired tutor relationship cannot record these steps either", async () => {
      const act = await activity(aW0, 10); // ACT-SPEAK-LIVE
      await db.client.query("update english.relationships set valid_from = now() - interval '10 days' where member_id = $1", [M().tutorAn]);
      await db.client.query("update english.relationships set valid_to = now() - interval '1 day' where member_id = $1", [M().tutorAn]);
      try {
        await fail(offline(M().tutorAn, act, "tutor_live", "x"), "42501");
      } finally {
        await db.client.query("update english.relationships set valid_to = null where member_id = $1", [M().tutorAn]);
      }
    });
  });
});

