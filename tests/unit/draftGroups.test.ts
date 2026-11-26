import { describe, expect, it } from "vitest";
import { groupDraftsByUnit, openDrafts } from "@/lib/assigned/draftGroups";
import { mainCurriculum } from "@/lib/curriculum/main";
import type { CurriculumCard } from "@/lib/curriculum/shape";
import type { DraftListItem } from "@/lib/studio/types";

const d = (id: string, title: string, over: Partial<DraftListItem> = {}): DraftListItem => ({
  id, title, status: "approved", updatedAt: "2026-11-20T00:00:00Z", templateId: `t-${id}`, templateVersion: 1, superseded: false, assigned: 0, ...over,
});

describe("openDrafts: drafts not given yet", () => {
  it("drops discarded, replaced and already given drafts", () => {
    const out = openDrafts([d("a", "Unit 14 A"), d("b", "Unit 14 B", { status: "discarded" }), d("c", "Unit 14 C", { superseded: true }), d("e", "Unit 14 E", { assigned: 1 })]);
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("groupDraftsByUnit", () => {
  const drafts = [d("1", "Unit 16 · Idioms"), d("2", "Unit 15 · Part 2"), d("3", "Unit 15 · Part 10"), d("4", "Review 4"), d("5", "Mixed practice"), d("6", "Unit 14 · Phrases")];

  it("the next Unit = the first Unit (by number) with open drafts and not 'Đã học'; it comes first", () => {
    const g = groupDraftsByUnit(drafts, { U14: "done", U15: "in_progress", U16: "not_started" });
    expect(g.map((x) => [x.key, x.next])).toEqual([["U15", true], ["U14", false], ["U16", false], ["Review 4", false], ["other", false]]);
    expect(g[0]!.status).toBe("in_progress");
  });
  it("drafts inside a group in natural title order (Part 2 before Part 10)", () => {
    const g = groupDraftsByUnit(drafts, {});
    expect(g.find((x) => x.key === "U15")!.drafts.map((x) => x.id)).toEqual(["2", "3"]);
  });
  it("statuses known but empty: the lowest Unit is next; skipped Units are never next", () => {
    expect(groupDraftsByUnit(drafts, {})[0]!.key).toBe("U14");
    expect(groupDraftsByUnit(drafts, { U14: "skipped" })[0]!.key).toBe("U15");
  });
  it("statuses unknown (no main curriculum / unreadable): Unit order, nothing claimed as next", () => {
    const g = groupDraftsByUnit(drafts, null);
    expect(g.map((x) => x.key)).toEqual(["U14", "U15", "U16", "Review 4", "other"]);
    expect(g.some((x) => x.next)).toBe(false);
  });
  it("no Unit drafts: nothing is marked next; no drafts: no groups", () => {
    expect(groupDraftsByUnit([d("4", "Review 4")], {}).map((x) => x.next)).toEqual([false]);
    expect(groupDraftsByUnit([], null)).toEqual([]);
  });
});

describe("mainCurriculum", () => {
  const card = (id: string, withProgress: boolean) => ({ id, progress: withProgress ? { statusOf: {} } : null }) as unknown as CurriculumCard;
  it("the one named by the database, else the only one with progress, else none", () => {
    expect(mainCurriculum([card("a", true), card("b", true)], "b")!.id).toBe("b");
    expect(mainCurriculum([card("a", true), card("b", false)], null)!.id).toBe("a");
    expect(mainCurriculum([card("a", true), card("b", true)], null)).toBeUndefined();
  });
});
