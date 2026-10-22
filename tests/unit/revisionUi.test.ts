import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExcerptText } from "@/components/revision/ExcerptText";
import { FeedbackPanel } from "@/components/revision/FeedbackPanel";
import { findLeaf } from "@/components/revision/LeafPicker";
import { RevisionForm } from "@/components/revision/RevisionForm";
import { ActivityNote } from "@/components/student/FeedbackBox";
import { StudentHome } from "@/components/student/StudentHome";
import { feedbackCopy, revisionCopy, tutorHonorific, work } from "@/lib/copy/vi";
import type { FeedbackPanelView, MyRevisionView } from "@/lib/revision/types";
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
    activityId: "r1", instanceId: "i1", titleVi: "Núi lửa", bigQuestionEn: "Why do volcanoes erupt?", round: 1, praise: "Con giải thích rõ vì sao núi lửa phun.",
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

// (Task 9 adds its describe blocks here)
