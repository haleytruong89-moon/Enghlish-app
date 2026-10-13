import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScoreButtons } from "@/components/review/ScoreButtons";
import { ScoringPanel, type PanelTarget } from "@/components/review/ScoringPanel";
import { SupportForm } from "@/components/review/SupportForm";
import { WorkPanel } from "@/components/review/WorkPanel";
import { concepts, fallbackLabels, formatScore, notesPage, offlineForm, reviewPage, scoreLabels, tutorHonorific, weekdayNames } from "@/lib/copy/vi";
import { formatWhen, skillLabel } from "@/lib/review/format";
import { cursorToParam, parseCursor, parseFilter } from "@/lib/review/inbox";
import { SUPPORT_NOTE_MAX, type ReviewDecision, type ReviewEpisodeView } from "@/lib/review/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const dec = (over: Partial<ReviewDecision>): ReviewDecision => ({
  id: "d1", decision: "AGREE", finalScore: 3, finalNotObserved: false, validatorRole: "tutor", validatorName: "Cô của An (thử)", reason: null, supersedesId: null,
  at: "2026-10-14T02:00:00Z", current: true, criteriaResults: null, rationale: null, blind: false, ...over,
});

const target = (over: Partial<PanelTarget>): PanelTarget => ({
  key: "A-L3-CAUSE-W", isTarget: true, scorable: true, lockedReason: null, titleVi: "Viết có từ nối", dimensionNameVi: "Tổ chức", rubricVi: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
  criteria: [{ id: "c1", checkVi: "Dùng ít nhất 2 từ nối", method: "text_count", computable: true }, { id: "c2", checkVi: "Nối đúng chiều", method: "rater", computable: false }],
  opportunityRule: null, decisions: [], current: null, label: "Viết \"vì sao – nên\"", ...over,
});

const panel = (over: Partial<Parameters<typeof ScoringPanel>[0]>) =>
  renderToStaticMarkup(createElement(ScoringPanel, { episodeId: "e1", alias: "An (thử)", viewerRole: "tutor", canDecide: true, observedDirectly: false, targets: [target({})], ...over }));

/** Visible text: markup without the collapsed technical-information blocks. */
const visibleText = (html: string) =>
  html
    .replace(/<details[^>]*>(?:(?!<\/details>)[\s\S])*?<\/details>/g, (m) => (m.includes("Thông tin kỹ thuật") ? "" : m))
    .replace(/<[^>]*>/g, " ");
const textOf = (html: string, testId: string) => {
  const m = html.match(new RegExp(`data-testid="${testId}"[^>]*>([\\s\\S]*?)</(?:p|section)>`));
  return m ? (m[1] ?? "").replace(/<[^>]*>/g, " ") : "";
};

describe("S5 copy", () => {
  it("scores are always shown as 'N/4 · label', NULL has its own sentence and is not 0", () => {
    expect(formatScore(3)).toBe("3/4 · Đạt yêu cầu");
    expect(formatScore(0)).toBe("0/4 · Chưa thể hiện");
    expect(formatScore(null)).toBe("Bài này không có cơ hội thể hiện");
    expect(formatScore(null)).not.toBe(formatScore(0));
  });

  it("the S5 copy blocks name the tutor only through the single honorific", () => {
    const all: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") all.push(v);
      else if (typeof v === "function") all.push(String((v as (...a: never[]) => unknown)(...(["x", "y", "z"] as never[]))));
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(reviewPage);
    walk(offlineForm);
    walk(notesPage);
    for (const s of all) {
      if (s === concepts.blindReview.staff) continue; // fixed sentence from the UX guide
      expect(s, s).not.toMatch(/(^|[\s"(])(cô|thầy)(\s|$|[,."?!)])/i);
      expect(s, s).not.toMatch(/ACT-|A-L\d|B-L\d|AP-0\./);
    }
    expect(reviewPage.waitingTutor).toContain(tutorHonorific);
  });
});

describe("S5 scoring panel: criteria heard live", () => {
  const live = target({
    key: "B-L4-EXPLAIN-S",
    criteria: [{ id: "c1", checkVi: "Nói trôi chảy", method: "tutor_live", computable: false }, { id: "c2", checkVi: "Có ví dụ", method: "rater", computable: false }],
  });
  it("on work that was not watched live the heard-live criterion has no checkbox (only the rater one does); watched live it has", () => {
    const boxes = (html: string) => (html.match(/type="checkbox"/g) ?? []).length;
    const unwatched = panel({ targets: [live], observedDirectly: false });
    expect(boxes(unwatched)).toBe(1);
    expect(visibleText(unwatched)).toContain(reviewPage.criteriaLiveLocked);
    const watched = panel({ targets: [live], observedDirectly: true });
    expect(boxes(watched)).toBe(2);
    expect(visibleText(watched)).toContain(reviewPage.criteriaLive);
  });
});

describe("S5 support form", () => {
  it("the note input stops at the same 300 characters as the database and shows a count", () => {
    const html = renderToStaticMarkup(createElement(SupportForm, { attemptId: "a1", skills: [{ key: "A-L3-CAUSE-W", label: "Viết" }], initialOpen: true }));
    expect(html).toMatch(/id="support-note"[^>]*maxLength="300"/);
    expect(html).toContain(reviewPage.supportNoteCount(0, 300));
    expect(SUPPORT_NOTE_MAX).toBe(300);
  });
});

describe("S5 inbox helpers (the filtering and paging are done by the database)", () => {
  const ID = "6f1b0c7e-3a54-4a52-9e0e-0d9d5b1b7c11";
  it("the cursor survives the URL and a bad one means the first page", () => {
    const c = { at: "2026-10-14T04:35:03.123456+00:00", id: ID };
    expect(parseCursor(cursorToParam(c))).toEqual(c);
    for (const bad of [undefined, "", "x", `2026-10-14|${ID}`, `nonsense|${ID}`, "2026-10-14T04:35:03+00:00|not-a-uuid", `2026-10-14T04:35:03+00:00|${ID}|extra`]) {
      expect(parseCursor(bad), String(bad)).toBeNull();
    }
  });
  it("an unknown filter falls back to the default", () => {
    expect(parseFilter("nonsense")).toBe("todo");
    expect(parseFilter(undefined)).toBe("todo");
    expect(parseFilter(["done"])).toBe("done");
  });
  it("times are Vietnam time with the weekday", () => {
    expect(formatWhen("2026-10-14T08:05:00Z")).toBe(`${weekdayNames[3]} 14/10, 15:05`);
    expect(formatWhen("x")).toBe("x");
    expect(skillLabel("A-L3-CAUSE-W", "Tên trong danh mục")).toBe('Viết "vì sao – nên"');
    expect(skillLabel("B-L1-COMPLEX-W", "Câu phức")).toBe("Câu phức");
    expect(skillLabel("X", null)).toBe(fallbackLabels.skill);
  });
});

describe("S5 score buttons", () => {
  it("six buttons, each with its words; the NULL one says it is not a zero", () => {
    const html = renderToStaticMarkup(createElement(ScoreButtons, { label: "Kỹ năng", testKey: "k", value: 3, onChange: () => undefined }));
    expect((html.match(/<button/g) ?? []).length).toBe(6);
    for (const k of ["0", "1", "2", "3", "4", "null"] as const) expect(html).toContain(scoreLabels[k].short);
    expect(html).toContain(scoreLabels.null.short);
    expect(html).toMatch(/data-testid="score-k-3"[^>]*>|aria-pressed="true"[^>]*data-testid="score-k-3"/);
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect(html).toContain('data-testid="score-k-na"');
  });
});

describe("S5 scoring panel", () => {
  it("tutor with open skills: buttons, the criteria, a disabled save that says how many are left, no codes in view", () => {
    const html = panel({ targets: [target({}), target({ key: "A-L2-CHUNKS", label: "Dùng từ mới của chủ đề" })] });
    expect(html).toContain('data-testid="score-A-L3-CAUSE-W-3"');
    expect(html).toContain('data-testid="score-A-L2-CHUNKS-na"');
    expect(html).toMatch(/data-testid="save-review"[^>]*disabled|disabled=""[^>]*data-testid="save-review"/);
    expect(html).toContain(reviewPage.saveRemaining(2));
    expect(html).toContain(reviewPage.notChosen);
    expect(html).toContain("Dùng ít nhất 2 từ nối");
    expect(visibleText(html)).not.toMatch(/A-L3-CAUSE-W|A-L2-CHUNKS/);
    expect(html).toContain(reviewPage.techInfoCodes);
  });

  it("parent on a tutor-only piece of work: read-only, no buttons, no save, says why", () => {
    const html = panel({ viewerRole: "parent", canDecide: false, targets: [target({})] });
    expect(html).toContain('data-testid="read-only-note"');
    expect(html).toContain(reviewPage.readOnlyTutorOnly);
    expect(html).not.toContain("score-A-L3-CAUSE-W-");
    expect(html).not.toContain('data-testid="save-review"');
    expect(html).toContain(reviewPage.waitingTutor);
  });

  it("a decided skill shows 'N/4 · label', who and when, the history and 'Sửa quyết định'; NULL shows its own sentence", () => {
    const first = dec({ id: "d1", finalScore: 4, current: false, validatorRole: "parent", validatorName: null });
    const second = dec({ id: "d2", decision: "MODIFY", finalScore: 2, supersedesId: "d1", reason: "Chưa đủ ví dụ", current: true });
    const html = panel({ targets: [target({ decisions: [first, second], current: second })] });
    expect(html).toContain("Đã duyệt: 2/4 · Được một phần");
    expect(html).toContain(reviewPage.history(2));
    expect(html).toContain("4/4 · Vững, rõ ràng");
    expect(html).toContain(reviewPage.historyReason("Chưa đủ ví dụ"));
    expect(html).toContain(reviewPage.historyCurrent);
    expect(html).toContain(reviewPage.historyReplaced);
    expect(html).toContain(reviewPage.modify);
    expect(html).not.toContain('data-testid="save-review"'); // nothing left to decide

    const nul = dec({ finalScore: null, finalNotObserved: true });
    const html2 = panel({ targets: [target({ decisions: [nul], current: nul })] });
    expect(html2).toContain(`Đã duyệt: ${scoreLabels.null.short}`);
    expect(textOf(html2, "decided-A-L3-CAUSE-W")).not.toContain("0/4");
    expect(textOf(html2, "summary")).not.toContain("0/4");
  });

  it("a viewer who may not decide still sees the history but gets no modify button", () => {
    const d = dec({});
    const html = panel({ viewerRole: "parent", canDecide: false, targets: [target({ decisions: [d], current: d })] });
    expect(html).toContain("Đã duyệt: 3/4 · Đạt yêu cầu");
    expect(html).not.toContain(reviewPage.modify);
  });

  it("a skill only the tutor can hear live is locked with the reason; an indicator is not a skill", () => {
    const html = panel({ targets: [target({ key: "A-X1-TURN", label: "Nói trôi chảy", scorable: false, lockedReason: "needs_live" }), target({ key: "AGG-B-EXAM-MOCK", label: "Điểm đề thử", scorable: false, lockedReason: "not_a_skill", isTarget: false })] });
    expect(html).toContain(reviewPage.liveOnly("An (thử)"));
    expect(html).toContain(reviewPage.notASkill);
    expect(html).not.toContain("score-A-X1-TURN-");
  });

  it("the summary lists every scorable skill with its current words", () => {
    const d = dec({ finalScore: 1 });
    const html = panel({ targets: [target({ decisions: [d], current: d }), target({ key: "A-L2-CHUNKS", label: "Từ mới" })] });
    const summary = html.slice(html.indexOf('data-testid="summary"'));
    expect(summary).toContain("1/4 · Còn thiếu nhiều");
    expect(summary).toContain(reviewPage.summaryNone);
  });
});

describe("S5 work panel", () => {
  const base: ReviewEpisodeView = {
    episode: { id: "e1", restricted: false, observedDirectly: false, isFirstAttempt: true, facets: {} },
    learner: { id: "l1", alias: "An (thử)", trackId: "A", isTest: true },
    viewer: { role: "tutor", canDecide: true, restricted: false },
    attempt: { id: "a1", attemptNo: 1, mode: "INDEPENDENT_CHECK", provenance: "in_app", submittedAt: "2026-10-14T01:00:00Z", declaredAssistance: ["none"], recordedByName: null },
    artifact: { kind: "answers", content: { answers: { "W1-R1": "b) why volcanoes erupt", "W1-R2": "" } } },
    activity: { id: "act", stepNo: 3, activityType: "ACT-SOURCE-QA", mode: "INDEPENDENT_CHECK", purpose: [], timeMin: 20 },
    inquiry: { id: "i", titleVi: "Núi lửa", bigQuestionEn: "Why?", bigQuestionVi: null },
    step: { promptEn: "Read the text.", items: [{ id: "W1-R1", kind: "mcq", stem: "What is it about?", options: ["a", "b"] }, { id: "W1-R2", kind: "short", stem: "What is magma?", options: [] }] },
    sources: [{ id: "s1", title: "Deep under the ground", modality: "text" }],
    autoChecks: { total: 2, checked: 1, correct: 1, items: { "W1-R1": { kind: "mcq", result: "correct" }, "W1-R2": { kind: "short", result: "needs_person" } } },
    keys: [{ itemId: "W1-R1", kind: "answer", answer: "b) why volcanoes erupt", explanationVi: "Ý chính." }, { itemId: "W1-R2", kind: "sealed", answer: null, explanationVi: "Phải nói được đá nóng chảy." }],
    assistance: [],
    targets: [],
    tech: { templateId: "A-W1-VOLCANOES", templateVersion: 1, catalogueVersion: "0.2.1-draft", descriptorVersion: "A-v1", policyVersion: "AP-0.2-pilot" },
  };
  const render = (v: ReviewEpisodeView) => renderToStaticMarkup(createElement(WorkPanel, { view: v }));

  it("answers per question, the machine check, the keys for staff, and 'no help' as a fact", () => {
    const html = render(base);
    expect(html).toContain("An (thử) trả lời");
    expect(html).toContain(reviewPage.autoSummary(1, 1));
    expect(html).toContain(reviewPage.autoNeedsPerson(1));
    expect(html).toContain(reviewPage.autoResult.correct);
    expect(html).toContain(reviewPage.itemBlank);
    expect(html).toContain("Phải nói được đá nóng chảy.");
    expect(html).toContain(reviewPage.supportNone);
    expect(html).not.toMatch(/AP-0\.2|A-W1-VOLCANOES/);
  });

  it("a typed text is shown as written; a recorded-outside piece shows who recorded it and the date", () => {
    const html = render({
      ...base,
      artifact: { kind: "text", content: { text: "Volcanoes erupt because magma rises.", session_date: "2026-10-13", duration_sec: 95, word_count: 5 } },
      attempt: { ...base.attempt, provenance: "tutor_live", recordedByName: "Cô của An (thử)" },
      keys: [],
      autoChecks: null,
    });
    expect(html).toContain("Volcanoes erupt because magma rises.");
    expect(html).toContain(reviewPage.recordedBy("Cô của An (thử)"));
    expect(html).toContain("13/10/2026");
    expect(html).toContain("95 giây · 5 từ");
  });

  it("declared and observed help are told apart and never as a score", () => {
    const html = render({
      ...base,
      assistance: [
        { id: 1, kind: "external_declared", detail: "dictionary", verification: "declared", affects: [], at: "2026-10-14T01:00:00Z", note: null, byName: null },
        { id: 2, kind: "frame", detail: null, verification: "observed", affects: [], at: "2026-10-14T02:00:00Z", note: "Câu mẫu because", byName: "Cô" },
      ],
    });
    expect(html).toContain("Dùng từ điển");
    expect(html).toContain("An (thử) tự khai");
    expect(html).toContain("Câu mẫu");
    expect(html).toContain("thấy tận mắt");
    expect(html).not.toMatch(/\d\/4/);
  });
});
