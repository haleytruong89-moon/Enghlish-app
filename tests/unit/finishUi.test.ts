import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

import { FinishWork, type FinishWorkProps } from "@/components/finish/FinishWork";
import { finishCopy as c } from "@/lib/copy/vi";
import { buildFinishParts } from "@/lib/finish/view";
import type { ItemMeta } from "@/lib/results/score";

const L = "b0000000-0000-4000-8000-000000000001";
const A = "c0000000-0000-4000-8000-000000000001";
const R = (result: string) => ({ kind: "mcq", result: result as "correct" });
const parts = buildFinishParts({
  items: ["q1", "q2", "q3", "q4", "q5"].map((id) => ({ id, stem: `Stem ${id}` })),
  answers: { q1: "so", q2: "had", q3: "I wish I can swim.", q4: "more easy", q5: "" },
  checks: { total: 5, checked: 3, correct: 1, items: { q1: R("correct"), q2: R("incorrect"), q3: R("needs_person"), q4: R("incorrect"), q5: R("needs_person") } },
  keys: [{ itemId: "q4", kind: "answer", answer: "easier", explanationVi: null }],
  decisions: {},
  meta: new Map<string, ItemMeta>([
    ["q1", { n: 1, part: "A", tag: null, outOfApp: false }],
    ["q2", { n: 2, part: "A", tag: null, outOfApp: false }],
    ["q3", { n: 3, part: "C", tag: null, outOfApp: false }],
    ["q4", { n: 4, part: "E", tag: null, outOfApp: false }],
    ["q5", { n: 5, part: "E", tag: null, outOfApp: true }],
  ]),
  partNames: new Map([["E", "E · So sánh"]]),
  retries: [{ itemId: "q2", n: 2, stem: "", given: "had", retry: "had had", kind: "retry", at: "2026-11-24T05:00:00Z" }],
});
const props = (o: Partial<FinishWorkProps> = {}): FinishWorkProps => ({
  learnerId: L, attemptId: A, parts, feedback: null, feedbackReady: true, retrySeenThrough: "2026-11-24T05:00:00Z", retryCount: 1, done: false,
  next: { href: `/learners/${L}/finish/x`, title: "Unit 14 · Word formation" }, backHref: `/learners/${L}`, oldPageHref: "/review/e1", ...o,
});
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const render = (o: Partial<FinishWorkProps> = {}) => renderToStaticMarkup(createElement(FinishWork, props(o)));

describe("L1 · Xong một bài screen", () => {
  it("shows the questions worth a look first, with the child's answer, the key and how each stands", () => {
    const h = render();
    expect(h).not.toContain('data-testid="finish-item-q1"'); // right: hidden by the default filter
    expect(h).toContain('data-testid="finish-item-q2"');
    expect(h).toContain(esc(c.retried("had had")));
    expect(h).toContain("easier");
    expect(h).toContain(c.pills.waiting);
    expect(h).toContain(c.pills.incorrect);
  });
  it("only a question waiting for a person has Đúng / Sai; Xong is blocked while one waits and no feedback is written", () => {
    const h = render();
    expect(h).toContain('data-testid="finish-correct-q3"');
    expect(h).not.toContain('data-testid="finish-correct-q2"');
    expect(h).not.toContain('data-testid="finish-correct-q5"'); // paper only
    expect(h).toMatch(/data-testid="finish-submit"[^>]*disabled/);
    expect(h).toContain(c.finishBlocked);
    expect(h).toContain(c.readyGrade(1));
    expect(h).toContain(esc(c.retriesNote(1)));
  });
  it("score box: provisional while a question waits; the weakest part; never shown to the child (adults' page)", () => {
    const h = render();
    expect(h).toContain("1/3");
    expect(h).toContain(c.scoreProvisional(1));
    expect(h).toContain(c.weakest("E · So sánh", "0/1"));
  });
  it("app-made suggestions are buttons (no AI); a live feedback is shown and pre-fills the form", () => {
    const h = render();
    expect(h).toContain('data-testid="finish-suggestions"');
    expect(h).toContain("Phần E · So sánh: xem lại câu 4.");
    const live = render({ feedback: { id: "f1", submissionId: A, assignmentId: "x", praise: "Chữ rõ ràng.", items: [{ n: 1, text: "Xem lại câu 4." }], authorMember: "m", authorRole: "tutor", authorName: null, createdAt: "2026-11-25T03:00:00Z", live: true } });
    expect(live).toContain('data-testid="finish-live-feedback"');
    expect(live).toContain("Chữ rõ ràng.");
    expect(live).toContain('value="Xem lại câu 4."');
  });
  it("done: the banner with the next submission; or back to the desk when none is left", () => {
    const h = render({ done: true });
    expect(h).toContain('data-testid="finish-done"');
    expect(h).toContain(c.goNext("Unit 14 · Word formation"));
    expect(render({ done: true, next: null })).toContain(c.backWhenEmpty);
  });
  it("before 0037, or when the feedback could not be read, nothing is sent: Xong stays off", () => {
    expect(render({ feedbackReady: false })).toMatch(/data-testid="finish-submit"[^>]*disabled/);
    expect(render({ feedbackKnown: false })).toContain('data-testid="finish-feedback-unknown"');
  });
  it("an older attempt: no feedback form here, a link to the latest; Xong needs only the grading", () => {
    const h = render({ latestHref: `/learners/${L}/finish/new` });
    expect(h).toContain('data-testid="finish-not-latest"');
    expect(h).not.toContain('data-testid="finish-feedback"');
    expect(h).toContain(`href="/learners/${L}/finish/new"`);
    expect(h).toContain(c.readyFeedback(true));
  });
  it("skills still to score are said up front, with the old page; a repeat attempt is never called official", () => {
    expect(render({ skillsLeft: 2 })).toContain(c.skillsLeft(2));
    expect(render({ done: true, counted: false })).toContain("lần làm lại");
    expect(render({ done: true, skillsLeft: 1 })).toContain(c.doneBodySkills);
  });
  it("feedback written by another adult is read-only and counts as given", () => {
    const fb = { id: "f1", submissionId: A, assignmentId: "x", praise: "Tốt lắm.", items: [], authorMember: "m-tutor", authorRole: "tutor" as const, authorName: "Cô Hà", createdAt: "2026-11-25T03:00:00Z", live: true };
    const h = render({ feedback: fb, viewerMemberId: "m-parent" });
    expect(h).toMatch(/<textarea[^>]*readOnly=""[^>]*data-testid="finish-praise"/);
    expect(h).toContain(c.readyFeedback(true));
    expect(h).not.toContain('data-testid="finish-suggestions"');
  });
  it("nothing decided yet: a dash, never 0/0", () => {
    const allWaiting = buildFinishParts({ items: [{ id: "q1", stem: "x" }], answers: {}, checks: { total: 1, checked: 0, correct: 0, items: { q1: R("needs_person") } }, keys: [], decisions: {}, meta: new Map(), partNames: new Map(), retries: [] });
    const h = render({ parts: allWaiting });
    expect(h).not.toContain("0/0");
    expect(h).toContain(c.scoreEmpty);
  });
});

describe("Bản 3: each part has the anchor the session cards link to", () => {
  it("part E is `#part-E`, the same id `partAnchor` gives the card", async () => {
    const { partAnchor } = await import("@/lib/finish/paths");
    const h = render();
    expect(h).toContain(`id="${partAnchor("E")}"`);
    expect(h).toContain('id="part-A"');
  });
});
