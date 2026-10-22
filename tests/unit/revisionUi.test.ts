import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExcerptText } from "@/components/revision/ExcerptText";
import { FeedbackPanel } from "@/components/revision/FeedbackPanel";
import { findLeaf } from "@/components/revision/LeafPicker";
import { DiffView } from "@/components/revision/DiffView";
import { RevisionForm } from "@/components/revision/RevisionForm";
import { RevisionList } from "@/components/revision/RevisionList";
import { RevisionReview } from "@/components/revision/RevisionReview";
import { ScoringPanel } from "@/components/review/ScoringPanel";
import { ActivityNote } from "@/components/student/FeedbackBox";
import { StudentHome } from "@/components/student/StudentHome";
import { feedbackCopy, reviewPage, revisionCopy, revisionReviewCopy, tutorHonorific, work } from "@/lib/copy/vi";
import type { FeedbackPanelView, MyRevisionView, RevisionView } from "@/lib/revision/types";
import { fixtureMap } from "./fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));

const TEXT = "Some volcanoes explode because the magma is thick. Other volcanoes let lava flow gently.";
const ATT = "c0000000-0000-4000-8000-000000000001";
const panel = (over: Partial<FeedbackPanelView> = {}): FeedbackPanelView => ({ eligible: true, canGive: true, text: TEXT, live: null, history: [], ...over });
const live = (over: Partial<NonNullable<FeedbackPanelView["live"]>> = {}): NonNullable<FeedbackPanelView["live"]> => ({
  id: "f1", praise: "Con giải thích rõ vì sao núi lửa phun.",
  items: [{ n: 1, text: "Thêm câu kết.", excerpt: "Other volcanoes let lava flow gently.", leaf: { kind: "tag", refKey: "tu-noi-lap-luan" } }, { n: 2, text: "Dùng từ nối.", excerpt: null, leaf: null }],
  requiresRevision: true, round: 1, revisionActivityId: "r1", authorName: "Thầy/cô của An (thử)", authorIsMe: true, createdAt: "2026-10-22T02:00:00Z",
  editable: true, revisionState: "todo", revisionEpisodeId: null, ...over,
});
const render = (p: FeedbackPanelView) => renderToStaticMarkup(createElement(FeedbackPanel, { attemptId: ATT, panel: p, map: fixtureMap() }));

describe("Góp ý cho con (review screen)", () => {
  it("a reviewer with nothing sent yet gets the form: praise, one item with excerpt + 'Lấy đoạn đang chọn' + skill, 'Yêu cầu con sửa bài' chosen", () => {
    const html = render(panel());
    expect(html).toContain('data-testid="feedback-form"');
    expect(html).toContain(feedbackCopy.praiseLabel);
    expect(html).toContain('data-testid="feedback-item-1-text"');
    expect(html).toContain(feedbackCopy.takeSelection);
    expect(html).toContain('data-testid="feedback-item-1-leaf-domain"');
    expect(html).toMatch(/data-testid="feedback-require"[^>]*checked|checked[^>]*data-testid="feedback-require"/);
    expect(html).toContain(feedbackCopy.noteOnly);
    expect(html).toContain(feedbackCopy.send);
    expect(html).not.toContain('data-testid="feedback-live"');
  });

  it("a sent note shows praise, numbered items, the excerpt and the skill NAME (never its key), its state and 'Sửa góp ý' while allowed", () => {
    const html = render(panel({ canGive: false, live: live(), history: [{ id: "f0", praise: "Bản cũ", items: [{ n: 1, text: "Cũ", excerpt: null, leaf: null }], createdAt: "2026-10-22T01:00:00Z", authorName: null }] }));
    expect(html).toContain('data-testid="feedback-live"');
    expect(html).toContain("Con giải thích rõ vì sao núi lửa phun.");
    expect(html).toContain('data-testid="feedback-item-1"');
    expect(html).toContain("“Other volcanoes let lava flow gently.”");
    expect(html).toContain(findLeaf(fixtureMap(), { kind: "tag", refKey: "tu-noi-lap-luan" })!.label);
    expect(html).toContain(feedbackCopy.revisionState.todo);
    expect(html).toContain('data-testid="feedback-edit"');
    expect(html).toContain(feedbackCopy.history(1));
    expect(html).not.toContain('data-testid="feedback-form"');
  });

  it("no 'Sửa góp ý' once the child started (or for someone else's note); a link to the revision once it is in", () => {
    const started = render(panel({ canGive: false, live: live({ editable: false, revisionState: "started" }) }));
    expect(started).not.toContain('data-testid="feedback-edit"');
    expect(started).toContain(feedbackCopy.revisionState.started);
    const sent = render(panel({ canGive: false, live: live({ editable: false, revisionState: "submitted", revisionEpisodeId: "e9" }) }));
    expect(sent).toContain('href="/review/e9"');
    expect(sent).toContain(feedbackCopy.openRevision);
  });

  it("nothing on paper work / questions; a parent on an in-session test reads 'chỉ thầy/cô góp ý được'", () => {
    expect(render(panel({ eligible: false, canGive: false, text: null }))).toBe("");
    const ro = render(panel({ canGive: false }));
    expect(ro).toContain('data-testid="feedback-read-only"');
    expect(ro).toContain(tutorHonorific);
    expect(ro).not.toContain('data-testid="feedback-form"');
  });

  it("findLeaf names a leaf of the map and its group; an unknown leaf has no name", () => {
    expect(findLeaf(fixtureMap(), { kind: "target", refKey: "B-T7-ARGUE" })).toEqual({ groupKey: "th-argue", label: "B-T7-ARGUE" });
    expect(findLeaf(fixtureMap(), { kind: "tag", refKey: "x-dao-ngu-hardly" })).toBeNull(); // no group: cannot be chosen (D16)
  });
});

// The S4/S5 score pattern ("3/4 ·") plus words that would leak scoring; not a bare "d/d" (the home header shows today's date "22/10").
const SCORE = /\d\s*\/\s*4\s*·|điểm|verdict|improved|not_yet|reason_ok/i;

describe("Sửa bài (the child)", () => {
  const rev = (over: Partial<MyRevisionView> = {}): MyRevisionView => ({
    activityId: "r1", instanceId: "i1", feedbackId: "f1", titleVi: "Núi lửa", bigQuestionEn: "Why do volcanoes erupt?", round: 1, praise: "Con giải thích rõ vì sao núi lửa phun.",
    items: [{ n: 1, text: "Thêm câu kết.", excerpt: "Other volcanoes let lava flow gently." }, { n: 2, text: "Dùng từ nối.", excerpt: null }],
    oldText: TEXT, reasonRequired: false, state: "todo", submittedAt: null, closingNote: null, draft: null, ...over,
  });

  it("the page shows the praise, the numbered items, the old text with the excerpt highlighted, the editor filled with the old text, a mark per item", () => {
    const html = renderToStaticMarkup(createElement(RevisionForm, { revision: rev() }));
    expect(html).toContain(revisionCopy.praiseTitle);
    expect(html).toContain("Con giải thích rõ vì sao núi lửa phun.");
    expect(html).toContain('data-testid="revision-item-2"');
    expect(html).toContain('data-testid="excerpt-1"');
    expect(html).toContain(revisionCopy.showOld);
    expect(html).toMatch(/data-testid="revision-editor"[^>]*>Some volcanoes explode/);
    expect(html).toContain('data-testid="revision-mark-1-changed"');
    expect(html).toContain('data-testid="revision-mark-2-kept"');
    expect(html).toContain(revisionCopy.reasonLabel(false));
    expect(html).toContain(work.helpTitle);
    expect(html).not.toMatch(SCORE);
  });

  it("Track B (reason required) says so; a saved draft wins over the old text", () => {
    const html = renderToStaticMarkup(createElement(RevisionForm, { revision: rev({ reasonRequired: true, round: 2,
      draft: { content: { text: "Draft text here.", marks: { "1": { choice: "changed", reason: "I added an ending." } } }, revision: 3, updatedAt: "2026-10-22T03:00:00Z" } }) }));
    expect(html).toContain(revisionCopy.reasonLabel(true));
    expect(html).toContain(revisionCopy.secondRound);
    expect(html).toMatch(/data-testid="revision-editor"[^>]*>Draft text here\./);
    expect(html).toContain("I added an ending.");
  });

  it("excerpts are marked and numbered in the old text", () => {
    const html = renderToStaticMarkup(createElement(ExcerptText, { text: TEXT, items: [{ n: 1, excerpt: "the magma is thick" }] }));
    expect(html).toMatch(/<mark[^>]*data-testid="excerpt-1"[^>]*>the magma is thick/);
  });

  it("G4: the 'Chỉ góp ý' note on its own activity page shows praise and items, no score; nothing without a note", () => {
    const html = renderToStaticMarkup(createElement(ActivityNote, { note: { feedbackId: "f3", praise: "Câu mở đoạn rõ.", notes: [{ n: 1, text: "Thêm ví dụ.", excerpt: "lava flow" }] } }));
    expect(html).toContain('data-testid="activity-note"');
    expect(html).toContain(revisionCopy.boxTitle);
    expect(html).toContain("Câu mở đoạn rõ.");
    expect(html).toContain("lava flow");
    expect(html).not.toMatch(SCORE);
    expect(renderToStaticMarkup(createElement(ActivityNote, { note: null }))).toBe("");
  });

  it("home: 'Sửa bài' rows come first, above Việc tiếp theo; 'đã xem' and notes in the box; no score anywhere", () => {
    const html = renderToStaticMarkup(createElement(StudentHome, {
      alias: "An (thử)", color: "#9A4A15", data: { inquiries: [] }, review: null,
      feedback: [
        { feedbackId: "f1", activityId: "r1", titleVi: "Núi lửa", round: 1, itemsCount: 2, state: "todo", seenAt: null, closingNote: null, praise: null, notes: null },
        { feedbackId: "f2", activityId: "r2", titleVi: "Vòng tuần hoàn nước", round: 1, itemsCount: 1, state: "seen", seenAt: "2026-10-22T03:00:00Z", closingNote: "Bài sửa rõ hơn nhiều!", praise: null, notes: null },
        { feedbackId: "f3", activityId: "a3", titleVi: "Hành tinh", round: 1, itemsCount: 1, state: "note", seenAt: null, closingNote: null, praise: "Câu mở đoạn rõ.", notes: [{ n: 1, text: "Thêm ví dụ.", excerpt: null }] },
      ],
    }));
    expect(html.indexOf('data-testid="revision-rows"')).toBeGreaterThan(-1);
    expect(html).toContain(revisionCopy.rowTitle("Núi lửa"));
    expect(html).toContain(revisionCopy.rowLine(2));
    expect(html).toContain('href="/activities/r1"');
    expect(html).toContain(revisionCopy.seenTitle);
    expect(html).toContain("Bài sửa rõ hơn nhiều!");
    expect(html).toContain("Câu mở đoạn rõ.");
    expect(html).not.toMatch(SCORE);
  });
});

describe("Bài sửa lại (before–after) and Bài đã sửa", () => {
  const view = (over: Partial<RevisionView> = {}): RevisionView => ({
    attemptId: "r", episodeId: "e", learnerId: "l", alias: "An (thử)", round: 1, titleVi: "Núi lửa", submittedAt: "2026-10-22T03:00:00Z",
    before: { attemptId: "o", episodeId: "eo", text: "The gas stays inside. The pressure grows.", submittedAt: "2026-10-21T03:00:00Z" },
    after: { text: "The gas stays inside, so the pressure grows a lot." },
    feedback: { id: "f", praise: "Con giải thích rõ.", items: [{ n: 1, text: "Dùng từ nối chỉ kết quả.", excerpt: null, leaf: null }, { n: 2, text: "Thêm ví dụ.", excerpt: null, leaf: null }],
      authorName: "Thầy/cô của An (thử)", createdAt: "2026-10-21T04:00:00Z" },
    marks: [{ n: 1, choice: "changed", reason: "Mình thêm so." }, { n: 2, choice: "kept", reason: null }],
    checks: [], closing: null, nextRound: null, reasonRequired: false, canFinish: true, canOpenRound2: true, ...over,
  });

  it("the diff strikes removed words in the old text and marks added words in the new one, with words for screen readers", () => {
    const html = renderToStaticMarkup(createElement(DiffView, { before: "a b c", after: "a x c" }));
    expect(html).toMatch(/data-testid="diff-before"[\s\S]*<del[^>]*>[\s\S]*b [\s\S]*<\/del>/);
    expect(html).toMatch(/data-testid="diff-after"[\s\S]*<ins[^>]*>[\s\S]*x [\s\S]*<\/ins>/);
    expect(html).toContain(revisionReviewCopy.deletedLabel);
    expect(html).toContain(revisionReviewCopy.addedLabel);
    expect(renderToStaticMarkup(createElement(DiffView, { before: "same", after: "same" }))).toContain(revisionReviewCopy.noChange);
  });

  it("one verdict pair per item fits the child's choice; Xong waits for every verdict; round 2 only in round 1", () => {
    const html = renderToStaticMarkup(createElement(RevisionReview, { view: view(), map: null }));
    expect(html).toContain(revisionReviewCopy.title(1));
    expect(html).toContain('data-testid="verdict-1-improved"');
    expect(html).toContain('data-testid="verdict-1-not_yet"');
    expect(html).not.toContain('data-testid="verdict-1-reason_ok"');
    expect(html).toContain('data-testid="verdict-2-reason_ok"');
    expect(html).toContain(revisionReviewCopy.childChose("kept"));
    expect(html).toContain(revisionReviewCopy.noReason);
    expect(html).toMatch(/<button(?=[^>]*data-testid="revision-finish")(?=[^>]*disabled)[^>]*>/); // any attribute order
    expect(html).toContain(revisionReviewCopy.needVerdicts(2));
    expect(html).toContain('data-testid="revision-round2-open"');
    expect(renderToStaticMarkup(createElement(RevisionReview, { view: view({ round: 2, canOpenRound2: false }), map: null }))).not.toContain('data-testid="revision-round2-open"');
  });

  it("read-only (parent viewer, or after Xong): the verdicts and the closing note, no buttons", () => {
    const done = view({ canFinish: false, canOpenRound2: false, checks: [{ n: 1, verdict: "improved", checkerName: "Thầy/cô", createdAt: "2026-10-22T05:00:00Z" }, { n: 2, verdict: "not_yet", checkerName: null, createdAt: "2026-10-22T05:00:00Z" }],
      closing: { note: "Bài sửa rõ hơn nhiều!", authorName: null, createdAt: "2026-10-22T05:00:00Z" } });
    const html = renderToStaticMarkup(createElement(RevisionReview, { view: done, map: null }));
    expect(html).toContain('data-testid="revision-done"');
    expect(html).toContain(revisionReviewCopy.verdicts.improved!);
    expect(html).toContain("Bài sửa rõ hơn nhiều!");
    expect(html).not.toContain('data-testid="revision-finish"');
    expect(renderToStaticMarkup(createElement(RevisionReview, { view: view(), map: null, readOnly: true }))).not.toContain('data-testid="revision-finish"');
  });

  it("'Bài đã sửa': one row per pair with round, items, state and the verdict summary with its denominator; an empty list says so", () => {
    const html = renderToStaticMarkup(createElement(RevisionList, { learnerId: "l", items: [
      { attemptId: "r", episodeId: "e", titleVi: "Núi lửa", round: 1, submittedAt: "2026-10-22T03:00:00Z", itemsCount: 2, state: "done", good: 1, notYet: 1 },
    ] }));
    expect(html).toContain('href="/learners/l/revisions/r"');
    expect(html).toContain(revisionReviewCopy.listLine(1, 2));
    expect(html).toContain(revisionReviewCopy.verdictSummary(1, 2));
    expect(renderToStaticMarkup(createElement(RevisionList, { learnerId: "l", items: [] }))).toContain('data-testid="revisions-empty"');
  });

  it("scoring on a revision is optional: no 'còn n kỹ năng' counter", () => {
    const t = { key: "A-A3-REDRAFT", isTarget: true, scorable: true, lockedReason: null, titleVi: "Viết lại bài theo ưu tiên phản hồi", dimensionNameVi: null, rubricVi: null,
      criteria: [], opportunityRule: null, decisions: [], current: null, label: "Sửa bài" };
    const html = renderToStaticMarkup(createElement(ScoringPanel, { episodeId: "e", alias: "An", viewerRole: "tutor", canDecide: true, observedDirectly: false, targets: [t, { ...t, key: "A-L3-CAUSE-W" }], optional: true }));
    expect(html).toContain(reviewPage.save);
    expect(html).not.toContain(reviewPage.saveRemaining(2));
  });
});
