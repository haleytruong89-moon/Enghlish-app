import { describe, expect, it } from "vitest";
import { BADGE_TTL_MS, isDecisionPath, shouldFetch } from "@/lib/shell/badgeMemo";

const memo = { learnerId: "A", at: 1000 };
describe("shouldFetch", () => {
  it("fetches when nothing is remembered", () => expect(shouldFetch(null, "A", 1000, null)).toBe(true));
  it("fetches for the other child", () => expect(shouldFetch(memo, "B", 1001, null)).toBe(true));
  it("does not fetch within 30 s on an ordinary page change", () => expect(shouldFetch(memo, "A", 1000 + BADGE_TTL_MS, "/learners/A/weak")).toBe(false));
  it("fetches after 30 s", () => expect(shouldFetch(memo, "A", 1000 + BADGE_TTL_MS + 1, null)).toBe(true));
  it("fetches after leaving a decision page", () => {
    for (const p of ["/review", "/review/skills", "/review/e1", "/studio/drafts/d1", "/imports/b1", "/curricula/versions/v1", "/learners/A/inbox"]) {
      expect(shouldFetch(memo, "A", 1001, p), p).toBe(true);
    }
    expect(isDecisionPath("/learners/A/weak")).toBe(false);
    expect(isDecisionPath("/studio/new")).toBe(false);
  });
});
