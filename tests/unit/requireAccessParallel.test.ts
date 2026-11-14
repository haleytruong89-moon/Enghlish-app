import { describe, expect, it } from "vitest";
import { AccessError, requireAccess, type AccessStore, type Learner, type Member, type Relationship } from "@/lib/auth/requireAccess";

const L = "a0000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-13T08:00:00Z");
const tutor: Member = { id: "m-t", userId: "u-t", familyId: "f", role: "tutor", displayName: "T" };
const learner: Learner = { id: L, familyId: "f", memberId: null, alias: "An", trackId: "A", isTest: true, status: "active" };
const rel: Relationship = { memberId: "m-t", learnerId: L, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function store(over: { learner?: Learner | null; rels?: Relationship[] } = {}): AccessStore {
  return {
    getMemberByUserId: async () => tutor,
    getLearner: async () => {
      await wait(50);
      return over.learner === undefined ? learner : over.learner;
    },
    getRelationships: async () => {
      await wait(50);
      return over.rels ?? [rel];
    },
  };
}
const run = (s: AccessStore) => requireAccess({ id: "u-t" }, L, "learner:read", { store: s, allowRealLearners: false, now: NOW });

describe("requireAccess reads the learner and a tutor's relationships together", () => {
  it("finishes in about one read time, not two", async () => {
    const t0 = Date.now();
    await run(store());
    expect(Date.now() - t0).toBeLessThan(90);
  });
  it("still 404 when the learner is missing or the tutor has no relationship", async () => {
    await expect(run(store({ learner: null }))).rejects.toMatchObject({ status: 404 });
    await expect(run(store({ rels: [] }))).rejects.toBeInstanceOf(AccessError);
    await expect(run(store({ rels: [{ ...rel, validTo: new Date("2026-02-01") }] }))).rejects.toMatchObject({ status: 404 });
  });
});
