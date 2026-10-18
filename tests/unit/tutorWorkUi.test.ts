import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LearnerCard } from "@/components/LearnerCard";
import { PendingTags } from "@/components/tutor/PendingTags";
import { ResultForm } from "@/components/tutor/ResultForm";
import { SessionNoteForm } from "@/components/tutor/SessionNoteForm";
import { TagChips } from "@/components/tutor/TagChips";
import { WeakTable } from "@/components/tutor/WeakTable";
import { WritingTags } from "@/components/tutor/WritingTags";
import { fallbackLabels, resultPage, sessionNotePage, todayPage, weakPage } from "@/lib/copy/vi";
import { frameFileSchema, normalizeFrame } from "@/lib/frames/frame";
import type { TodayData } from "@/lib/tutorwork/load";
import type { FrameView, TagInfo, UntaggedItem, WeakPoint, WeakPointsView } from "@/lib/tutorwork/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const LEARNER = "a0000000-0000-4000-8000-000000000001";
const tags: TagInfo[] = [
  { key: "dang-tu", label: "Dạng từ", group: "Từ vựng", custom: false },
  { key: "cum-dong-tu", label: "Cụm động từ", group: "Từ vựng", custom: false },
  { key: "cau-dieu-kien-dao-ngu", label: "Câu điều kiện & đảo ngữ", group: "Ngữ pháp", custom: false },
  { key: "x-dao-ngu-hardly", label: "Đảo ngữ với hardly", group: "Nhãn riêng", custom: true },
];
const destination = frameFileSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "content", "frames", "destination-c1-c2-progress-test-u1-12.json"), "utf8")));
const frame = (): FrameView => {
  const n = normalizeFrame(destination);
  return { id: "33333333-3333-4333-8333-333333333333", title: n.title, totalItems: n.total, parts: n.parts, items: n.items.map((i) => ({ n: i.n, part: i.part, tagKey: i.tag_key })), scale: n.scale };
};

const weakTag = (over: Partial<WeakPoint> = {}): WeakPoint => ({
  tagKey: "cau-dieu-kien-dao-ngu", label: "Câu điều kiện & đảo ngữ", group: "Ngữ pháp", sources: 3,
  bySource: { test: 1, lesson: 1, writing: 1, practice: 0 }, itemsWrong: { test: 4, practice: 0 }, asked: 8, askedWrong: 4,
  lastSeen: "2026-10-16", recheckDueOn: "2026-10-30", recheckDue: false, lastRecheck: null, status: "repeat",
  events: [{ date: "2026-10-16", source: "test", sourceId: "s1", items: [4, 5], title: "Destination", usedHint: true, inClass: true }], ...over,
});
const weakView = (t: WeakPoint[], policyDays: number | null = 14): WeakPointsView => ({ policyDays, since: null, today: "2026-10-17", tags: t });

const untagged: UntaggedItem = { resultId: "r1", recordedByMember: "m-tutor", recordedRole: "tutor", own: false, title: "Unless, even if…", takenOn: "2026-10-08", createdAt: "2026-10-08T01:00:00Z", source: "practice", usedHint: false, inClass: false, items: [4, 7] };
const today = (over: Partial<TodayData> = {}): TodayData => {
  const w = weakView([weakTag(), weakTag({ tagKey: "cum-dong-tu", label: "Cụm động từ", sources: 1, status: "watch", recheckDue: true, recheckDueOn: "2026-10-16" })]);
  return {
    weak: w, repeats: w.tags.filter((t) => t.status === "repeat"), due: w.tags.filter((t) => t.recheckDue), untagged: [untagged],
    lastNote: { id: "n1", sessionDate: "2026-10-15", studied: "Unit 7", weakTagKeys: ["cau-dieu-kien-dao-ngu", "x-gone"], message: "Had it not been for + N", authorRole: "tutor" },
    recent: { id: "r0", title: "Destination U1-12", takenOn: "2026-10-16", total: 60, correct: 50 },
    practice: [],
    tagLabels: { "cau-dieu-kien-dao-ngu": "Câu điều kiện & đảo ngữ", "cum-dong-tu": "Cụm động từ" }, ...over,
  };
};
const learner = { id: LEARNER, alias: "Nguyên", trackId: "B" as const, status: "active" as const, isTest: true, color: "#2f5d9e" };
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("S5b-1 'Hôm nay' card", () => {
  it("tutor: two main actions, attention rows (repeat, waiting for a tag, due for re-check), last session", () => {
    const html = render(createElement(LearnerCard, { learner, today: today(), role: "tutor" }));
    expect(html).toContain(`href="/learners/${LEARNER}/notes/new"`);
    expect(html).toContain(`href="/learners/${LEARNER}/results/new"`);
    expect(html).toContain(todayPage.noteAction);
    expect(html).toContain(todayPage.resultAction);
    expect(html).toContain(todayPage.repeatBadge(3));
    expect(html).toContain(todayPage.untaggedBadge);
    expect(html).toContain(todayPage.recheckBadge);
    expect(html).toContain(todayPage.untaggedTutorLine("Unless, even if…", "08/10/2026", "4, 7"));
    expect(html).toContain("Had it not been for + N");
    expect(html).toContain("15/10/2026");
    expect(html).toContain(todayPage.lastResultLine("Destination U1-12", "16/10/2026"));
  });
  it("parent: the same card, but untagged items are worded as waiting for the tutor", () => {
    const html = render(createElement(LearnerCard, { learner, today: today(), role: "parent" }));
    expect(html).toContain(todayPage.untaggedParentBadge);
    expect(html).toContain(todayPage.untaggedParentLine("Unless, even if…", "08/10/2026", "4, 7"));
    expect(html).not.toContain(todayPage.untaggedTutorLine("Unless, even if…", "08/10/2026", "4, 7"));
  });
  it("parent: items she recorded herself are not 'waiting for the tutor'", () => {
    const own = { ...untagged, recordedByMember: "m-parent", recordedRole: "parent" as const, own: true };
    const html = render(createElement(LearnerCard, { learner, today: today({ untagged: [own] }), role: "parent" }));
    expect(html).toContain(todayPage.untaggedBadge);
    expect(html).not.toContain(todayPage.untaggedParentBadge);
    expect(html).toContain(todayPage.untaggedTutorLine("Unless, even if…", "08/10/2026", "4, 7"));
  });
  it("a tag that is a repeat AND due for a re-check shows once (the repeat row wins)", () => {
    const both = weakTag({ recheckDue: true });
    const w = weakView([both]);
    const html = render(createElement(LearnerCard, { learner, today: today({ weak: w, repeats: [both], due: [both], untagged: [], lastNote: null }), role: "tutor" }));
    expect(html.match(/Câu điều kiện &amp; đảo ngữ/g)).toHaveLength(1);
    expect(html).not.toContain(todayPage.recheckBadge);
  });
  it("never shows a raw tag key: an unknown tag gets a neutral word", () => {
    const html = render(createElement(LearnerCard, { learner, today: today(), role: "tutor" }));
    expect(html).not.toContain("x-gone");
    expect(html).not.toContain("cau-dieu-kien-dao-ngu");
    expect(html).toContain(fallbackLabels.tag);
  });
  it("when the numbers could not be loaded the card still has its actions and links", () => {
    const html = render(createElement(LearnerCard, { learner, today: null, role: "tutor" }));
    expect(html).toContain(`href="/learners/${LEARNER}/notes/new"`);
    expect(html).toContain(`href="/learners/${LEARNER}/weak"`);
    expect(html).toContain(`href="/learners/${LEARNER}/targets"`);
    expect(html).not.toContain(todayPage.attentionTitle);
  });
  it("no problems yet: says so, and offers the full list", () => {
    const html = render(createElement(LearnerCard, { learner, today: today({ repeats: [], due: [], untagged: [], lastNote: null, recent: null }), role: "tutor" }));
    expect(html).toContain(todayPage.attentionEmpty);
    expect(html).toContain(todayPage.lastSessionNone);
  });
});

describe("S5b-1 'Điểm cần chú ý' table", () => {
  it("shows tag × source counts, the status, and a detail with the timeline and the re-check rule from the policy", () => {
    const html = render(createElement(WeakTable, { view: weakView([weakTag()]) }));
    expect(html).toContain("Câu điều kiện &amp; đảo ngữ");
    for (const col of ["Bài kiểm tra", "Buổi học", "Bài viết", "Bài luyện"]) expect(html).toContain(col);
    expect(html).toContain(weakPage.statusRepeat);
    expect(html).toContain(weakPage.statusLine(3));
    expect(html).toContain(weakPage.recheckRule(14));
    expect(html).toContain(weakPage.recheckWaiting("30/10/2026"));
    expect(html).toContain(weakPage.hintTag);
    expect(html).toContain(weakPage.classTag);
    expect(html).toContain(weakPage.summary(4, 8));
    expect(html).toContain(weakPage.legend);
  });
  it("a tag that is due says so; a learner without a skill set says the due date cannot be worked out; no raw keys", () => {
    const due = render(createElement(WeakTable, { view: weakView([weakTag({ recheckDue: true, recheckDueOn: "2026-10-16" })]) }));
    expect(due).toContain(weakPage.recheckDue("16/10/2026"));
    const none = render(createElement(WeakTable, { view: weakView([weakTag()], null) }));
    expect(none).toContain(weakPage.recheckNoPolicy);
    expect(none).not.toContain("cau-dieu-kien-dao-ngu</");
  });
  it("empty window", () => {
    expect(render(createElement(WeakTable, { view: weakView([]) }))).toContain(weakPage.empty);
  });
});

describe("S5b-1 'Ghi kết quả bài'", () => {
  const props = { learnerId: LEARNER, tags, today: "2026-10-17", minDate: "2026-06-19" };
  it("framed mode: one button per item (60), every part with its score, the scale band, and 'in class' for a tutor", () => {
    const html = render(createElement(ResultForm, { ...props, frames: [frame()], canClass: true }));
    expect((html.match(/data-testid="item-\d+"/g) ?? []).length).toBe(60);
    for (const p of ["A", "B", "C", "D", "E", "F", "G"]) expect(html).toContain(`data-testid="part-${p}"`);
    expect(html).toContain(`data-testid="part-score-A">${resultPage.scoreOf(12, 12)}`);
    expect(html).toContain(resultPage.scoreOf(60, 60));
    expect(html).toContain(resultPage.scaleLine("Rất tốt"));
    expect(html).toContain('data-testid="context-class"');
    expect(html).toContain(resultPage.gridHelp);
  });
  it("quick entry asks 'Bài kiểm tra | Bài luyện' and starts on 'Bài luyện'", () => {
    const html = render(createElement(ResultForm, { learnerId: LEARNER, tags, today: "2026-10-17", minDate: "2026-06-19", frames: [], canClass: true }));
    const btn = (id: string) => html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? "";
    expect(btn("source-practice")).toContain('aria-pressed="true"');
    expect(btn("source-test")).toContain('aria-pressed="false"');
    expect(html).toContain(resultPage.kind);
  });
  it("a parent does not get the 'in class' option (D15), and is told why", () => {
    const html = render(createElement(ResultForm, { ...props, frames: [frame()], canClass: false }));
    expect(html).not.toContain('data-testid="context-class"');
    expect(html).toContain(resultPage.contextClassTutorOnly);
  });
  it("no frame yet: opens in quick entry with the fields; framed mode would say there is none", () => {
    const html = render(createElement(ResultForm, { ...props, frames: [], canClass: true }));
    expect(html).toContain('data-testid="quick-entry"');
    for (const id of ["quick-title", "quick-total", "quick-correct", "quick-wrong"]) expect(html).toContain(`data-testid="${id}"`);
    expect(html).not.toContain('data-testid="frame-grid"');
  });
  it("saving is explained: only the first attempt counts, a hint is kept, nothing changes a level", () => {
    const html = render(createElement(ResultForm, { ...props, frames: [], canClass: true }));
    for (const rule of resultPage.rules) expect(html).toContain(rule);
  });
});

describe("S5b-1 'Chờ gắn nhãn' and 'Ghi buổi học' and writing tags", () => {
  it("pending items list the wrong items with a tag select each; parents get the fallback wording", () => {
    const tutorHtml = render(createElement(PendingTags, { learnerId: LEARNER, items: [untagged], tags, isParent: false }));
    expect(tutorHtml).toContain('data-testid="pending-tag-r1-4"');
    expect(tutorHtml).toContain('data-testid="pending-tag-r1-7"');
    expect(tutorHtml).toContain(resultPage.pendingIntro(false));
    const parentHtml = render(createElement(PendingTags, { learnerId: LEARNER, items: [untagged], tags, isParent: true }));
    expect(parentHtml).toContain(resultPage.pendingIntro(true));
    expect(render(createElement(PendingTags, { learnerId: LEARNER, items: [], tags, isParent: false }))).toContain(resultPage.pendingEmpty);
  });

  const note = { learnerId: LEARNER, tags, skills: [{ id: "B-W-1", title: "Viết đoạn lập luận" }], previous: null, today: "2026-10-17", minDate: "2026-06-19" };
  it("session note: fields with the real limits, the three answers for each tag due, links to the result screen", () => {
    const html = render(createElement(SessionNoteForm, { ...note, due: [weakTag({ tagKey: "cum-dong-tu", label: "Cụm động từ", recheckDue: true })] }));
    expect(html).toContain('maxLength="500"');
    expect(html).toContain('maxLength="1000"');
    expect(html).toContain('data-testid="recheck-cum-dong-tu-ok"');
    expect(html).toContain('data-testid="recheck-cum-dong-tu-still_wrong"');
    expect(html).toContain('data-testid="recheck-cum-dong-tu-not_asked"');
    expect(html).toContain(sessionNotePage.recheckOptions.still_wrong);
    expect(html).toContain(`href="/learners/${LEARNER}/results/new"`);
    expect(html).toContain(sessionNotePage.previousNone);
    // "practised today" chips: skills of the current target set, optional
    expect(html).toContain(sessionNotePage.practisedTitle);
    expect(html).toContain('data-testid="session-practised-B-W-1"');
    expect(html).toContain("Viết đoạn lập luận");
    expect(render(createElement(SessionNoteForm, { ...note, skills: [], due: [] }))).toContain(sessionNotePage.practisedNone);
  });
  it("session note without anything due says so; the previous session shows tag labels, never keys", () => {
    const html = render(
      createElement(SessionNoteForm, {
        ...note, due: [],
        previous: { id: "n1", sessionDate: "2026-10-15", studied: "Unit 7", weakTagKeys: ["dang-tu", "x-gone"], message: "Ôn nhé", authorRole: "tutor" },
      }),
    );
    expect(html).toContain(sessionNotePage.recheckNone);
    expect(html).toContain("Dạng từ");
    expect(html).not.toContain("x-gone");
  });
  it("tag chips: at most `max` can be chosen - the rest are disabled once full; saved tags stay ticked and locked", () => {
    const html = render(createElement(TagChips, { tags, selected: ["dang-tu", "cum-dong-tu"], onChange: vi.fn(), max: 2, onAdd: vi.fn() }));
    expect(html).toContain('data-testid="tag-chip-dang-tu"');
    const chip = (key: string) => html.match(new RegExp(`<button[^>]*data-testid="tag-chip-${key}"[^>]*>`))?.[0] ?? "";
    expect(chip("dang-tu")).toContain('aria-checked="true"');
    expect(chip("cau-dieu-kien-dao-ngu")).toContain("disabled");
    expect(html).toContain("(nhãn riêng)");
    const locked = render(createElement(TagChips, { tags, selected: ["dang-tu"], onChange: vi.fn(), max: 3, locked: ["dang-tu"], onAdd: vi.fn() }));
    expect(locked.match(/<button[^>]*data-testid="tag-chip-dang-tu"[^>]*>/)?.[0]).toContain("disabled");
  });
  it("writing tags: chips, a save button, and the note that saved tags cannot be removed", () => {
    const html = render(createElement(WritingTags, { learnerId: LEARNER, episodeId: "e1", tags, saved: ["dang-tu"] }));
    expect(html).toContain('data-testid="writing-tags"');
    expect(html).toContain('data-testid="writing-tags-save"');
    expect(html).toContain('data-testid="tag-chip-dang-tu"');
  });
});
