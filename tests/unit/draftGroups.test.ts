import { describe, expect, it } from "vitest";
import { draftBoard, groupDraftsByUnit, openDrafts } from "@/lib/assigned/draftGroups";
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

describe("groupDraftsByUnit (v2: Review together, Đã học last)", () => {
  const drafts = [d("1", "Unit 16 · Idioms"), d("2", "Unit 15 · Part 2"), d("3", "Unit 15 · Part 10"), d("4", "Review 4"), d("5", "Mixed practice"), d("6", "Unit 14 · Phrases"), d("7", "Progress Test 2 (Units 13–26)"), d("8", "Review 13 (Units 25–26)")];

  it("Kế tiếp first; open Units in order; Review + Progress Test together; Units Đã học next to last; no Unit last", () => {
    const g = groupDraftsByUnit(drafts, { U14: "done", U15: "in_progress", U16: "not_started" });
    expect(g.map((x) => [x.key, x.next, x.closed])).toEqual([["U15", true, false], ["U16", false, false], ["review", false, false], ["U14", false, true], ["other", false, false]]);
    expect(g[0]!.status).toBe("in_progress");
    expect(g.find((x) => x.key === "review")!.drafts.map((x) => x.id)).toEqual(["4", "8", "7"]);
  });
  it("drafts inside a group in natural title order (Part 2 before Part 10)", () => {
    expect(groupDraftsByUnit(drafts, {}).find((x) => x.key === "U15")!.drafts.map((x) => x.id)).toEqual(["2", "3"]);
  });
  it("statuses known but empty: the lowest Unit is next; skipped Units are never next and go with the closed ones", () => {
    expect(groupDraftsByUnit(drafts, {})[0]!.key).toBe("U14");
    const g = groupDraftsByUnit(drafts, { U14: "skipped" });
    expect(g[0]!.key).toBe("U15");
    expect(g.find((x) => x.key === "U14")!.closed).toBe(true);
  });
  it("statuses unknown (no main curriculum / unreadable): Unit order, nothing claimed as next", () => {
    const g = groupDraftsByUnit(drafts, null);
    expect(g.map((x) => x.key)).toEqual(["U14", "U15", "U16", "review", "other"]);
    expect(g.some((x) => x.next)).toBe(false);
  });
  it("no Unit drafts: nothing is marked next; no drafts: no groups", () => {
    expect(groupDraftsByUnit([d("4", "Review 4")], {}).map((x) => x.next)).toEqual([false]);
    expect(groupDraftsByUnit([], null)).toEqual([]);
  });
});

describe("draftBoard: approved drafts first ('Sẵn sàng giao')", () => {
  it("approved and not given → ready, in Unit order; everything else grouped; given or discarded left out", () => {
    const b = draftBoard([
      d("pt", "Progress Test 2 · Phần 2"), d("u15", "Unit 15 · 1 · Adjective"), d("u16", "Unit 16 · 2", { status: "draft" }),
      d("gone", "Unit 15 · 9", { assigned: 1 }), d("x", "Unit 15 · 3", { status: "discarded" }),
    ], { U15: "in_progress" });
    expect(b.ready.map((x) => x.id)).toEqual(["u15", "pt"]);
    expect(b.groups.map((g) => [g.key, g.drafts.map((x) => x.id)])).toEqual([["U16", ["u16"]]]);
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
