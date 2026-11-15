import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { HistoryList } from "@/components/student/desk/HistoryList";
import { SeenList } from "@/components/student/desk/SeenList";
import { StudentTabs } from "@/components/student/desk/StudentTabs";
import { studentDeskCopy } from "@/lib/copy/vi";
import { seenMemoKey } from "@/lib/student/seenMemo";
import type { HistoryRow, SeenRow } from "@/lib/student/types";

vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { ...p, href: p.href }, p.children) }));

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const KID = "kid-1";
const seen = (o: Partial<SeenRow>): SeenRow => ({
  ref: "r1", activityId: "a1", assignmentId: null, title: "Đoạn viết: Núi lửa", kind: "app", stepNo: 6, activityType: "ACT-WRITE", submittedAt: "2026-11-10T03:00:00Z",
  seenAt: "2026-11-14T03:00:00Z", praise: "Câu mở đoạn rõ.", notes: [{ n: 1, text: "Thêm câu kết.", excerpt: "the magma" }], state: "todo", revisionActivityId: "rev1", closingNote: null, ...o,
});

describe("Đã xem", () => {
  it("shows praise, the fix list with its excerpt and a 'Sửa bài' button when a revision is open; no score", () => {
    render(<SeenList rows={[seen({})]} learnerId={KID} olderHref={null} />);
    const card = screen.getByTestId("seen-card");
    expect(within(card).getByTestId("seen-praise").textContent).toContain("Câu mở đoạn rõ.");
    expect(within(card).getByTestId("seen-fix").textContent).toContain("Thêm câu kết.");
    expect(within(card).getByTestId("seen-fix").textContent).toContain("the magma");
    const revise = within(card).getByTestId("seen-revise");
    expect(revise.getAttribute("href")).toBe("/activities/rev1");
    expect(revise.className).toContain("min-h-12");
    const clone = card.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("time").forEach((t) => t.remove());
    expect(clone.textContent).not.toMatch(/điểm|đúng|sai\b|%|\d\s*\/\s*\d/i);
  });

  it("states in words: sent revision, plain note ('không cần nộp lại'), a row with no message ('đã xem bài này')", () => {
    render(<SeenList rows={[seen({ ref: "a", state: "revised", revisionActivityId: null }), seen({ ref: "b", state: "note", revisionActivityId: null }), seen({ ref: "c", praise: null, notes: [], state: null, revisionActivityId: null })]} learnerId={KID} olderHref="/seen?before=x" />);
    const cards = screen.getAllByTestId("seen-card");
    expect(cards[0]!.textContent).toContain(studentDeskCopy.revised);
    expect(cards[1]!.textContent).toContain(studentDeskCopy.noRevision);
    expect(within(cards[2]!).getByTestId("seen-plain").textContent).toBe(studentDeskCopy.viewedOnly);
    expect(screen.getByTestId("seen-older").getAttribute("href")).toBe("/seen?before=x");
  });

  it("'Mới' is remembered on this device only: new marks show against the stored time, and leaving the page stores the visit", () => {
    window.localStorage.setItem(seenMemoKey(KID), "2026-11-12T00:00:00Z");
    const { unmount } = render(<SeenList rows={[seen({ ref: "n", seenAt: "2026-11-14T03:00:00Z" }), seen({ ref: "o", seenAt: "2026-11-11T03:00:00Z" })]} learnerId={KID} olderHref={null} />);
    const cards = screen.getAllByTestId("seen-card");
    expect(cards.map((c) => c.getAttribute("data-new"))).toEqual(["yes", "no"]);
    expect(screen.getAllByTestId("seen-new")).toHaveLength(1);
    expect(window.localStorage.getItem(seenMemoKey(KID))).toBe("2026-11-12T00:00:00Z"); // still the old time during the visit
    unmount();
    expect(Date.parse(window.localStorage.getItem(seenMemoKey(KID))!)).toBeGreaterThan(Date.parse("2026-11-14T03:00:00Z"));
  });

  it("empty: the polite line", () => {
    render(<SeenList rows={[]} learnerId={KID} olderHref={null} />);
    expect(screen.getByTestId("seen-empty").textContent).toBe(studentDeskCopy.seenEmpty);
  });
});

describe("tab badge", () => {
  it("counts what was seen after the last opening on this device, in words (aria-label) not colour; none on the 'Đã xem' tab itself", () => {
    window.localStorage.setItem(seenMemoKey(KID), "2026-11-12T00:00:00Z");
    const times = ["2026-11-14T03:00:00Z", "2026-11-13T03:00:00Z", "2026-11-01T03:00:00Z"];
    const { unmount } = render(<StudentTabs active="today" learnerId={KID} seenTimes={times} />);
    const badge = screen.getByTestId("seen-new-badge");
    expect(badge.getAttribute("aria-label")).toBe(studentDeskCopy.newCountAria(2));
    expect(badge.textContent).toBe(`2 ${studentDeskCopy.newBadge}`);
    expect(screen.getByTestId("tab-today").getAttribute("aria-current")).toBe("page");
    unmount();
    render(<StudentTabs active="seen" learnerId={KID} seenTimes={times} />);
    expect(screen.queryByTestId("seen-new-badge")).toBeNull();
  });
});

describe("Đã làm", () => {
  const row = (ref: string, seenFlag: boolean, o: Partial<HistoryRow> = {}): HistoryRow => ({
    src: "attempt", ref, activityId: ref, assignmentId: null, title: `Bài ${ref}`, kind: "app", stepNo: 2, activityType: "ACT-SOURCE-QA", submittedAt: "2026-11-10T03:00:00Z",
    first: true, usedHint: null, offline: false, retracted: false, seen: seenFlag, ...o,
  });
  it("filters wait / seen; counts only of the child's own sent work; status in words", () => {
    render(<HistoryList rows={[row("a", false), row("b", true), row("c", false, { kind: "link", src: "submission", assignmentId: "x", activityId: null, usedHint: true, first: false, offline: true })]} olderHref={null} total={3} waiting={2} />);
    expect(screen.getByTestId("filter-all").textContent).toBe(studentDeskCopy.filterAll(3));
    expect(screen.getByTestId("filter-waiting").textContent).toBe(studentDeskCopy.filterWaiting(2));
    expect(screen.getAllByTestId("history-row")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("filter-seen"));
    expect(screen.getAllByTestId("history-row")).toHaveLength(1);
    expect(screen.getByTestId("history-status").textContent).toBe(studentDeskCopy.statusSeen);
    fireEvent.click(screen.getByTestId("filter-waiting"));
    const rows = screen.getAllByTestId("history-row");
    expect(rows).toHaveLength(2);
    expect(rows[1]!.textContent).toContain(studentDeskCopy.again);
    expect(rows[1]!.textContent).toContain(studentDeskCopy.hint.yes);
    expect(rows[1]!.textContent).toContain(studentDeskCopy.offline);
    expect(rows[1]!.querySelector("a")!.getAttribute("href")).toBe("/done/x");
    expect(rows[0]!.querySelector("a")!.getAttribute("href")).toBe("/activities/a");
    expect(screen.getAllByTestId("history-status").every((s) => s.textContent === studentDeskCopy.statusWaiting)).toBe(true);
  });
  it("empty states", () => {
    const { unmount } = render(<HistoryList rows={[]} olderHref={null} total={0} waiting={0} />);
    expect(screen.getByTestId("history-empty").textContent).toBe(studentDeskCopy.doneEmpty);
    unmount();
    render(<HistoryList rows={[row("a", false)]} olderHref={null} total={1} waiting={1} />);
    fireEvent.click(screen.getByTestId("filter-seen"));
    expect(screen.getByTestId("history-filter-empty").textContent).toBe(studentDeskCopy.filterNone);
    // with older pages left, an empty filter says it only looked at the loaded page
    cleanup();
    render(<HistoryList rows={[row("a", false)]} olderHref="/done?before=x" total={30} waiting={1} />);
    fireEvent.click(screen.getByTestId("filter-seen"));
    expect(screen.getByTestId("history-filter-empty").textContent).toBe(studentDeskCopy.filterNoneMore);
  });
});
