import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { deskCopy, fallbackLabels, todayPage } from "@/lib/copy/vi";
import { deskAlerts, type DeskAlertInput } from "@/lib/desk/alerts";
import type { TodayData } from "@/lib/tutorwork/load";
import type { UntaggedItem, WeakPoint, WeakPointsView } from "@/lib/tutorwork/types";
import type { AssignmentView } from "@/lib/practice/types";

vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
import { DeskAlerts } from "@/components/desk/DeskAlerts";

const L = "a0000000-0000-4000-8000-000000000001";
const weakTag = (over: Partial<WeakPoint> = {}): WeakPoint => ({
  tagKey: "cau-dieu-kien-dao-ngu", label: "Câu điều kiện & đảo ngữ", group: "Ngữ pháp", sources: 3,
  bySource: { test: 1, lesson: 1, writing: 1, practice: 0 }, itemsWrong: { test: 4, practice: 0 }, asked: 8, askedWrong: 4,
  lastSeen: "2026-10-16", recheckDueOn: "2026-10-30", recheckDue: false, lastRecheck: null, status: "repeat",
  events: [{ date: "2026-10-16", source: "test", sourceId: "s1", items: [4, 5], title: "Destination", usedHint: true, inClass: true }], ...over,
} as WeakPoint);
const weakView = (t: WeakPoint[]): WeakPointsView => ({ policyDays: 14, since: null, today: "2026-10-17", tags: t } as WeakPointsView);
const untagged: UntaggedItem = { resultId: "r1", recordedByMember: "m-tutor", recordedRole: "tutor", own: false, title: "Unless, even if…", takenOn: "2026-10-08", createdAt: "2026-10-08T01:00:00Z", source: "practice", usedHint: false, inClass: false, items: [4, 7] } as UntaggedItem;
const today = (over: Partial<TodayData> = {}): TodayData => {
  const w = weakView([weakTag(), weakTag({ tagKey: "cum-dong-tu", label: "Cụm động từ", sources: 1, status: "watch", recheckDue: true, recheckDueOn: "2026-10-16" })]);
  return { weak: w, repeats: w.tags.filter((t) => t.status === "repeat"), due: w.tags.filter((t) => t.recheckDue), untagged: [untagged], lastNote: null, recent: null, practice: [], tagLabels: { "cau-dieu-kien-dao-ngu": "Câu điều kiện & đảo ngữ" }, ...over };
};
const input = (over: Partial<DeskAlertInput> = {}): DeskAlertInput => ({ learnerId: L, role: "tutor", todayIso: "2026-10-18", today: today(), intakeMissing: false, curriculaCount: 1, flagCount: 0, ...over });
const html = (i: DeskAlertInput) => renderToStaticMarkup(createElement(DeskAlerts, { learnerId: L, items: deskAlerts(i) }));
const late = { id: "c1", kind: "link", title: "Bài 1", url: null, sourceKey: null, tagKeys: [], units: [], unitItems: [], dueOn: "2026-10-10", frameId: null, createdAt: "2026-10-01T00:00:00Z", retractedAt: null, file: null, answerFile: null, submission: null, resultId: null } as AssignmentView;

describe("desk alerts (was the attention part of the learner card)", () => {
  it("tutor: repeat, waiting for a tag, due for re-check — with the old wording and links", () => {
    const h = html(input());
    expect(h).toContain(`data-testid="attention-${L}"`);
    expect(h).toContain(todayPage.repeatBadge(3));
    expect(h).toContain(todayPage.untaggedBadge);
    expect(h).toContain(todayPage.recheckBadge);
    expect(h).toContain(todayPage.untaggedTutorLine("Unless, even if…", "08/10/2026", "4, 7"));
    expect(h).toContain(`href="/learners/${L}/weak"`);
    expect(h).toContain(`href="/learners/${L}/results/new#pending"`);
  });
  it("parent: untagged items are worded as waiting for the tutor; her own entries are not", () => {
    const h = html(input({ role: "parent" }));
    expect(h).toContain(todayPage.untaggedParentBadge);
    expect(h).toContain(todayPage.untaggedParentLine("Unless, even if…", "08/10/2026", "4, 7"));
    const own = html(input({ role: "parent", today: today({ untagged: [{ ...untagged, own: true, recordedRole: "parent" }] }) }));
    expect(own).toContain(todayPage.untaggedBadge);
    expect(own).not.toContain(todayPage.untaggedParentBadge);
  });
  it("a tag that is a repeat AND due shows once (the repeat wins)", () => {
    const both = weakTag({ recheckDue: true });
    const h = html(input({ today: today({ weak: weakView([both]), repeats: [both], due: [both], untagged: [] }) }));
    expect(h.match(/Câu điều kiện &amp; đảo ngữ/g)).toHaveLength(1);
    expect(h).not.toContain(todayPage.recheckBadge);
  });
  it("never a raw tag key: an unknown tag gets the neutral word", () => {
    const d = weakTag({ tagKey: "x-gone", label: "x", status: "watch", recheckDue: true });
    const h = html(input({ today: today({ weak: weakView([d]), repeats: [], due: [d], untagged: [], tagLabels: {} }) }));
    expect(h).not.toContain("x-gone");
    expect(h).toContain(fallbackLabels.tag);
  });
  it("nothing to show: the empty line and the link to all weak points", () => {
    const h = html(input({ today: today({ repeats: [], due: [], untagged: [] }) }));
    expect(h).toContain(todayPage.attentionEmpty);
    expect(h).toContain(todayPage.seeAll);
  });
  it("new: missing intake (tutor / parent wording), no curriculum, overdue practice, ⚑ flags", () => {
    const t = deskAlerts(input({ intakeMissing: true, curriculaCount: 0, flagCount: 2, today: today({ repeats: [], due: [], untagged: [], practice: [late] }) }));
    expect(t.map((a) => a.key)).toEqual(["intake", "curricula", "overdue", "flags"]);
    expect(t[0]).toMatchObject({ line: deskCopy.alerts.intakeLineTutor, href: `/learners/${L}/levels#intake` });
    expect(t[2]).toMatchObject({ title: deskCopy.alerts.overdueTitle(1), href: `/learners/${L}/assign#assigned-list` });
    expect(t[3]).toMatchObject({ title: deskCopy.alerts.flagsTitle(2), href: `/learners/${L}/inbox?f=skills` });
    expect(deskAlerts(input({ role: "parent", intakeMissing: true }))[0]!.line).toBe(deskCopy.alerts.intakeLineParent);
  });
  it("unknown (null) intake / curricula and no numbers: no guess", () => {
    expect(deskAlerts(input({ intakeMissing: null, curriculaCount: null, today: null }))).toEqual([]);
  });
});

describe("level baseline alert", () => {
  it("tutor sees 'Chưa xác nhận cấp khởi điểm' linking to the baseline page while any domain is assumed", () => {
    const a = deskAlerts(input({ levelsAssumed: true })).find((x) => x.key === "levels");
    expect(a?.title).toBe("Chưa xác nhận cấp khởi điểm");
    expect(a?.href).toBe(`/learners/${L}/levels/baseline`);
  });
  it("no alert when confirmed, unknown, or for a parent", () => {
    expect(deskAlerts(input({ levelsAssumed: false })).some((x) => x.key === "levels")).toBe(false);
    expect(deskAlerts(input({ levelsAssumed: null })).some((x) => x.key === "levels")).toBe(false);
    expect(deskAlerts(input({ role: "parent", levelsAssumed: true })).some((x) => x.key === "levels")).toBe(false);
  });
});
