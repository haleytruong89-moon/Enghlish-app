import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReadingReportForm } from "@/components/tutor/ReadingReportForm";
import { ReadingSkillsTable } from "@/components/tutor/ReadingSkillsTable";
import { readingPage } from "@/lib/copy/vi";
import type { ReadingSkillsView } from "@/lib/reading/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const LEARNER = "b0000000-0000-4000-8000-000000000001";
const tags = [{ key: "doc-cause-effect", label: "Cause and Effect — Nguyên nhân – kết quả" }, { key: "doc-sequence", label: "Chronology/Sequence — Trình tự thời gian / sự kiện" }];
const view: ReadingSkillsView = {
  minQuestions: 4, weakPct: 60, latestMonth: "2026-10-01", latestSource: "TOMO", previousMonth: "2026-09-01",
  skills: [
    { tagKey: "doc-cause-effect", label: tags[0]!.label, questions: 5, correctPct: 40, prevQuestions: 4, prevCorrectPct: 75, status: "weak", wrong6w: 2 },
    { tagKey: "doc-sequence", label: tags[1]!.label, questions: 1, correctPct: 0, prevQuestions: null, prevCorrectPct: null, status: "thin", wrong6w: 0 },
  ],
};

describe("reading UI", () => {
  it("the form has one row per skill with two number inputs, and says when the month is being corrected", () => {
    const html = renderToStaticMarkup(createElement(ReadingReportForm, { learnerId: LEARNER, tags, month: "2026-10-01", existing: null }));
    expect(html).toContain('data-testid="reading-q-doc-cause-effect"');
    expect(html).toContain('data-testid="reading-pct-doc-sequence"');
    expect(html).toContain(readingPage.save);
    const edit = renderToStaticMarkup(createElement(ReadingReportForm, {
      learnerId: LEARNER, tags, month: "2026-10-01",
      existing: { id: "11111111-1111-4111-8111-111111111111", month: "2026-10-01", source: "TOMO", note: null, rows: [{ tagKey: "doc-sequence", questions: 1, correctPct: 0 }] },
    }));
    expect(edit).toContain(readingPage.saveCorrection);
    expect(edit).toContain('value="1"');
  });

  it("the table shows status words (thin sample is not red), this month vs last month, and the rule", () => {
    const html = renderToStaticMarkup(createElement(ReadingSkillsTable, { view, learnerId: LEARNER }));
    expect(html).toContain(readingPage.status.weak);
    expect(html).toContain(readingPage.status.thin);
    expect(html).toContain(readingPage.pctLine(40, 5));
    expect(html).toContain(readingPage.pctLine(75, 4));
    expect(html).toContain(readingPage.rule(4, 60));
    expect(html).toContain('data-testid="reading-status-doc-sequence"');
    expect(html).not.toMatch(/data-testid="reading-status-doc-sequence"[^>]*bg-\[#7a4a00\]/);
  });
});
