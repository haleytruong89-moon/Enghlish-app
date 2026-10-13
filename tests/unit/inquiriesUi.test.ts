import { describe, expect, it } from "vitest";
import { loadConfig } from "../../lib/config/content";
import { ACTIVITY_TYPE_IDS, STEP_PURPOSES } from "@/lib/config/schemas";
import { activityLabels, inquiriesPage, modeLabels, purposeLabels, tutorHonorific } from "@/lib/copy/vi";
import { authorizeInquiriesPage } from "@/lib/inquiries/access";
import { formatDateVi, safeExternalUrl } from "@/lib/inquiries/format";

describe("inquiries page copy and helpers", () => {
  it("has a Vietnamese label for every activity type, mode and purpose, and no code leaks into labels", () => {
    const catalogueTypes = loadConfig().catalogue.meta.activity_types.items.map((a) => a.id);
    expect([...catalogueTypes].sort()).toEqual([...ACTIVITY_TYPE_IDS].sort());
    for (const id of ACTIVITY_TYPE_IDS) {
      expect(activityLabels[id], id).toBeTruthy();
      expect(activityLabels[id]).not.toMatch(/ACT-/);
    }
    for (const p of STEP_PURPOSES) expect(purposeLabels[p], p).toBeTruthy();
    for (const m of ["PRACTICE", "INDEPENDENT_CHECK", "REVISION"] as const) expect(modeLabels[m].staff).toBeTruthy();
  });

  it("staff copy names the tutor through the single configurable honorific, and the restore action has its agreed label", () => {
    expect(tutorHonorific).toBe("thầy/cô");
    expect(activityLabels["ACT-SPEAK-LIVE"]).toBe(`Nói chuyện trực tiếp với ${tutorHonorific}`);
    for (const label of Object.values(activityLabels)) expect(label).not.toMatch(/(^|\s)cô(\s|$)/i);
    expect(inquiriesPage.unskip).toBe("Khôi phục bước");
  });

  it("formats dates as dd/mm/yyyy and ignores time parts", () => {
    expect(formatDateVi("2026-10-19")).toBe("19/10/2026");
    expect(formatDateVi("2026-10-19T23:30:00+00:00")).toBe("19/10/2026");
    expect(formatDateVi(null)).toBe("");
  });

  it("only http(s) links are rendered", () => {
    expect(safeExternalUrl("https://www.youtube.com/watch?v=x")).toContain("youtube.com");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,x")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });

  it("the video label says it opens elsewhere (link only, no player)", () => {
    expect(inquiriesPage.videoLink).toMatch(/trang ngoài/);
  });

  it("page access: no session → login; student and unknown learner → not-found", async () => {
    const store = {
      getMemberByUserId: async (u: string) =>
        u === "s" ? { id: "m1", userId: "s", familyId: "f", role: "student" as const, displayName: "s" } : null,
      getLearner: async () => ({ id: "a0000000-0000-4000-8000-000000000001", familyId: "f", memberId: "m1", alias: "An", trackId: "A" as const, isTest: true, status: "active" as const }),
      getRelationships: async () => [],
    };
    const L = "a0000000-0000-4000-8000-000000000001";
    const deps = { store, allowRealLearners: false };
    expect((await authorizeInquiriesPage(null, L, deps)).kind).toBe("login");
    expect((await authorizeInquiriesPage({ id: "s" }, L, deps)).kind).toBe("not-found");
    expect((await authorizeInquiriesPage({ id: "nobody" }, L, deps)).kind).toBe("not-found");
  });
});
