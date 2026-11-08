import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
import { ImportConfirm } from "@/components/import/ImportConfirm";
import { ImportForm } from "@/components/import/ImportForm";
import { PointMap } from "@/components/points/PointMap";
import { PointProposalCard } from "@/components/points/PointProposalCard";
import { importCopy, pendingCopy, pointMapCopy, pointStateCopy } from "@/lib/copy/vi";
import { buildPendingRows } from "@/lib/desk/pending";
import { isOpen, openCount, sortForReview, summaryOf, toConfirmRows, toReviewRows } from "@/lib/import/review";
import type { ImportPageData } from "@/lib/import/shape";
import type { ReadPayload } from "@/lib/import/types";
import type { PointInboxItem, PointMap as PointMapData } from "@/lib/points/types";
import { combinedTabCount, groupPointMap, mergeInboxGroups, groupPointInbox, pointScaleCells } from "@/lib/points/view";

const L = "b0000000-0000-4000-8000-000000000001";
const proposal = (over: Partial<PointInboxItem> = {}): PointInboxItem => ({
  id: "d1", kind: "PROPOSED", learnerId: L, alias: "Nguyên", isTest: true, tagKey: "cum-dong-tu", titleVi: "Cụm động từ", fromState: "DEVELOPING", toState: "INDEPENDENT",
  currentState: "DEVELOPING", conditions: [{ id: "l3_counted", level: 3, have: 5, need: 4, met: true }, { id: "l3_accuracy", level: 3, have: 80, need: 75, met: true }, { id: "l2_correct", level: 2, have: 3, need: 1, met: true }],
  evidence: [{ ref: "B-IM-000001:q50:a1", item: "q50", titleVi: "Progress Test", at: "2026-10-23" }], createdAt: "2026-11-08T10:00:00+07:00", canDecide: true, ...over,
});

describe("PointProposalCard", () => {
  it("names the point and the move; the child's tutor sees Xác nhận and Chưa; no bulk button anywhere", () => {
    const html = renderToStaticMarkup(createElement(PointProposalCard, { item: proposal() }));
    expect(html).toContain("Cụm động từ");
    expect(html).toContain("Đang tiến bộ → Tự làm được");
    expect(html).toContain('data-testid="point-confirm"');
    expect(html).toContain('data-testid="point-reject-open"');
    expect(html).not.toMatch(/tất cả/i);
    expect(html).toContain("Tỉ lệ câu đúng: 80 % / 75 %");
    expect(html).not.toContain("Câu đúng (đủ để lên mức");
  });
  it("a parent (canDecide false) only reads: waiting note, no buttons; a ⚑ offers 'Giữ mức' only", () => {
    const html = renderToStaticMarkup(createElement(PointProposalCard, { item: proposal({ canDecide: false }) }));
    expect(html).toContain(pointStateCopy.waitingTutor);
    expect(html).not.toContain('data-testid="point-confirm"');
    const flag = renderToStaticMarkup(createElement(PointProposalCard, { item: proposal({ kind: "FLAG", toState: "INDEPENDENT", fromState: "INDEPENDENT", currentState: "INDEPENDENT" }) }));
    expect(flag).toContain('data-testid="point-keep"');
    expect(flag).not.toContain('data-testid="point-reject-open"');
  });
});

const MAP: PointMapData = {
  learnerId: L, policyVersion: "PP-0.1",
  points: [
    { tagKey: "cum-dong-tu", titleVi: "Cụm động từ", groupKey: "vo-colloc-idiom", groupVi: "Kết hợp từ", domainKey: "vocab", domainVi: "Từ vựng", state: "DEVELOPING", stateSince: "2026-10-23T12:00:00+07:00", stateKind: "AUTO", flag: null,
      proposal: { id: "d1", toState: "INDEPENDENT", at: "2026-11-08T10:00:00+07:00" }, conditions: [], curricula: [{ id: "c1", title: "Destination C1&C2" }],
      answers: [{ ref: "r1", title: "Progress Test", at: "2026-10-23", correct: true, support: false }, { ref: "r2", title: "Progress Test", at: "2026-10-23", correct: false, support: true }] },
    { tagKey: "thanh-ngu", titleVi: "Thành ngữ", groupKey: "vo-colloc-idiom", groupVi: "Kết hợp từ", domainKey: "vocab", domainVi: "Từ vựng", state: "NOT_OBSERVED", stateSince: null, stateKind: null, flag: null, proposal: null, conditions: [], curricula: [], answers: [] },
    { tagKey: "modal-suy-doan", titleVi: "Động từ khuyết thiếu", groupKey: "gr-modal", groupVi: "Động từ khuyết thiếu", domainKey: "grammar", domainVi: "Ngữ pháp", state: "INDEPENDENT", stateSince: "2026-11-01T09:00:00+07:00", stateKind: "CONFIRMED", flag: null, proposal: null, conditions: [], curricula: [], answers: [] },
  ],
};

describe("PointMap", () => {
  it("groups by area then group, shows a level in words, the waiting proposal and every counted answer as Đúng/Sai with no raw score", () => {
    const html = renderToStaticMarkup(createElement(PointMap, { map: MAP }));
    expect(html).toContain('data-testid="point-domain-vocab"');
    expect(html).toContain('data-testid="point-group-vo-colloc-idiom"');
    expect(html).toContain("Đang tiến bộ");
    expect(html).toContain(pointMapCopy.pendingTo("Tự làm được"));
    expect(html).toContain(pointMapCopy.autoNote);
    expect(html).toContain(pointMapCopy.confirmedNote);
    expect(html).toContain("Destination C1&amp;C2");
    expect(html.match(/data-testid="point-answer"/g)).toHaveLength(2);
    expect(html).toContain(">Đúng<");
    expect(html).toContain(">Sai<");
    expect(html).toContain(pointMapCopy.support);
    expect(html).not.toMatch(/\d+\/\d+ điểm|điểm số/i);
  });
  it("an empty map says so; grouping keeps the database order; the scale fills up to the level", () => {
    expect(renderToStaticMarkup(createElement(PointMap, { map: { ...MAP, points: [] } }))).toContain(pointMapCopy.empty);
    expect(groupPointMap(MAP.points).map((d) => [d.key, d.groups.map((g) => g.points.length)])).toEqual([["vocab", [2]], ["grammar", [1]]]);
    expect(pointScaleCells("INDEPENDENT").map((c) => c.filled)).toEqual([true, true, true, false]);
    expect(pointScaleCells("NOT_OBSERVED").map((c) => c.filled)).toEqual([false, false, false, false]);
  });
});

describe("Kỹ năng tab merges both kinds", () => {
  it("one group per child, skills first; the tab number adds both; null only when neither could be read", () => {
    const merged = mergeInboxGroups(
      [{ learnerId: L, alias: "Nguyên", isTest: true, canDecide: true, items: [{} as never], proposalIds: ["s1"] }],
      groupPointInbox([proposal(), proposal({ id: "d2", learnerId: "other", alias: "An" })]),
    );
    expect(merged.map((g) => [g.alias, g.total])).toEqual([["Nguyên", 2], ["An", 1]]);
    expect(combinedTabCount({ open: 2, decidable: 1, items: [] }, { open: 3, decidable: 2, items: [] }, "tutor")).toBe(3);
    expect(combinedTabCount({ open: 2, decidable: 1, items: [] }, { open: 3, decidable: 2, items: [] }, "parent")).toBe(5);
    expect(combinedTabCount(null, { open: 3, decidable: 2, items: [] }, "tutor")).toBe(2);
    expect(combinedTabCount(null, null, "tutor")).toBeNull();
  });
});

describe("ImportForm", () => {
  it("has every field and the start button is disabled until the form is complete; no AI → says why", () => {
    const html = renderToStaticMarkup(createElement(ImportForm, { learnerId: L, aiAllowed: true, aiReason: null }));
    for (const id of ["import-title", "import-work", "import-key", "import-date", "import-support-tu_lam", "import-support-tu_lam_chua", "import-support-lam_cung_co", "import-start"]) expect(html).toContain(`data-testid="${id}"`);
    expect(html).toMatch(/data-testid="import-start"[^>]*disabled|disabled=""[^>]*data-testid="import-start"/);
    expect(html).toContain(importCopy.supports.lam_cung_co);
    const off = renderToStaticMarkup(createElement(ImportForm, { learnerId: L, aiAllowed: false, aiReason: "off" }));
    expect(off).toContain(importCopy.errors.ai_off);
  });
});

const payload: ReadPayload = {
  items: [
    { n: 1, part: "A", student_answer: "B", key_answer: "B", tag: "cum-dong-tu", out_of_app: false, confidence: "high", result: "correct" },
    { n: 2, part: "A", student_answer: null, key_answer: "C", tag: null, out_of_app: false, confidence: "low", result: "needs_person" },
    { n: 3, part: "B", student_answer: "x", key_answer: "y", tag: "thanh-ngu", out_of_app: false, confidence: "high", result: "incorrect" },
    { n: 4, part: "C", student_answer: null, key_answer: null, tag: "thanh-ngu", out_of_app: true, confidence: "high", result: "needs_person" },
  ],
};
const page = (isTutor: boolean): ImportPageData => ({
  import: { id: "i1", learnerId: L, trackId: "B", title: "Progress Test", takenOn: "2026-10-23", supportLevel: "tu_lam", status: "draft", payload, errorCode: null, workFileId: "w", keyFileId: "k", templateId: null, updatedAt: "2026-11-08 03:00:00+00", stale: false },
  context: { tags: [{ key: "cum-dong-tu", label: "Cụm động từ", domain: null, group: null, reading: false }, { key: "thanh-ngu", label: "Thành ngữ", domain: null, group: null, reading: false }] },
  is_tutor: isTutor,
});

describe("ImportConfirm", () => {
  it("'Cần xem' rows come first; the confirm button stays off while rows are open; a parent has no confirm button", () => {
    const html = renderToStaticMarkup(createElement(ImportConfirm, { data: page(true), learnerId: L }));
    expect(html.indexOf('data-testid="import-row-2"')).toBeLessThan(html.indexOf('data-testid="import-row-1"'));
    expect(html).toContain(importCopy.left(1));
    expect(html).toMatch(/data-testid="import-confirm-btn"[^>]*disabled/);
    expect(html).toContain(importCopy.needsPerson);
    const parent = renderToStaticMarkup(createElement(ImportConfirm, { data: page(false), learnerId: L }));
    expect(parent).not.toContain('data-testid="import-confirm-btn"');
    expect(parent).toContain(importCopy.parentNote);
  });
  it("review state: open rows, summary of counted answers, and the confirmation body", () => {
    const rows = toReviewRows(payload.items);
    expect(rows.filter((r) => isOpen(r, rows)).map((r) => r.n)).toEqual([2]); // row 4 is paper-only: it needs no mark
    expect(sortForReview(rows).map((r) => r.n)).toEqual([2, 1, 3, 4]);
    expect(openCount(rows)).toBe(1);
    expect(summaryOf(rows)).toEqual({ correct: 1, counted: 2 });
    const fixed = rows.map((r) => (r.n === 2 ? { ...r, result: "incorrect" as const, tag: "cum-dong-tu" } : r));
    expect(openCount(fixed)).toBe(0);
    expect(toConfirmRows(fixed).map((r) => [r.n, r.result, r.out_of_app])).toEqual([[1, "correct", false], [2, "incorrect", false], [3, "incorrect", false], [4, "blank", true]]);
    expect(toConfirmRows(fixed.map((r) => (r.n === 3 ? { ...r, dropped: true } : r))).map((r) => r.n)).toEqual([1, 2, 4]);
  });
});

describe("Chờ duyệt of one child lists point proposals as links only", () => {
  it("a point row goes to the Kỹ năng tab (no approve button there), belongs to the skills group and is waiting for the tutor when the viewer is a parent", () => {
    const rows = buildPendingRows({
      learnerId: L, role: "parent", work: [], studio: [], skills: [], drafts: [], curricula: [],
      points: [proposal({ canDecide: false }), proposal({ id: "d2", kind: "FLAG", tagKey: "thanh-ngu", titleVi: "Thành ngữ", canDecide: false }), proposal({ id: "d3", learnerId: "other" })],
    });
    expect(rows.map((r) => [r.kind, r.group, r.href, r.waitingTutor])).toEqual([
      ["point", "skills", "/review/skills#point-d1", true],
      ["flag", "skills", "/review/skills#point-d2", true],
    ]);
    expect(rows[0]!.label).toBe(pendingCopy.kinds.point);
  });
});
