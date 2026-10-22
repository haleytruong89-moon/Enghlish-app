import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FeedbackPanel } from "@/components/revision/FeedbackPanel";
import { findLeaf } from "@/components/revision/LeafPicker";
import { feedbackCopy, tutorHonorific } from "@/lib/copy/vi";
import type { FeedbackPanelView } from "@/lib/revision/types";
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

// (Tasks 8 and 9 add their describe blocks here)
