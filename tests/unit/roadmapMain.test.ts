import { describe, expect, it } from "vitest";
import { pickMainCurriculum, type MainCandidate } from "@/lib/roadmap/mainCurriculum";

const c = (id: string, createdAt: string, approved = true, lastEventAt: string | null = null): MainCandidate => ({ id, createdAt, approved, lastEventAt, lastEventId: lastEventAt ? `e-${id}` : null });
describe("pickMainCurriculum (Q9)", () => {
  it("the tutor's choice wins when it has an approved version", () => {
    expect(pickMainCurriculum([c("a", "2026-01-01"), c("b", "2026-02-01", true, "2026-11-01")], "a")).toBe("a");
  });
  it("a choice without an approved version is ignored", () => {
    expect(pickMainCurriculum([c("a", "2026-01-01", false), c("b", "2026-02-01")], "a")).toBe("b");
  });
  it("else the most recent Unit event, else the earliest created", () => {
    expect(pickMainCurriculum([c("a", "2026-01-01", true, "2026-10-01"), c("b", "2026-02-01", true, "2026-11-01")], null)).toBe("b");
    expect(pickMainCurriculum([c("b", "2026-02-01"), c("a", "2026-01-01")], null)).toBe("a");
  });
  it("nothing approved: null", () => {
    expect(pickMainCurriculum([c("a", "2026-01-01", false)], null)).toBeNull();
    expect(pickMainCurriculum([], null)).toBeNull();
  });
});
