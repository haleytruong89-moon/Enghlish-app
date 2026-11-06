import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { AiSoftCapBox } from "@/components/settings/AiSoftCapBox";
import { ReviewTabs } from "@/components/review/ReviewTabs";
import { StudioPendingCard } from "@/components/review/StudioPendingCard";
import { StudioReview } from "@/components/student/StudioReview";
import { ItemCard } from "@/components/studio/ItemCard";
import { SidePanel } from "@/components/studio/SidePanel";
import { DraftList } from "@/components/studio/DraftList";
import { aiSettingsCopy, studioCopy, studioIssueText, studioStudentCopy } from "@/lib/copy/vi";
import { isStudioStep } from "@/lib/studio/view";
import { normalizeExtract } from "@/lib/studio/normalize";
import { aiExtractSchema } from "@/lib/studio/schema";
import { summarizeDraft } from "@/lib/studio/summary";
import { validateDraft } from "@/lib/studio/validate";
import { CTX_B, FAKE_EXTRACT } from "./fixtures/studio";

const S = { enabled: true, monthlyCapUsd: 10, softCapUsd: 8, spentUsd: 8.5, runsMonth: 9, softReached: true, updatedAt: null, learners: [] };

describe("AI soft cap box (parent home)", () => {
  it("shows only at the soft cap, with the amounts", () => {
    expect(renderToStaticMarkup(createElement(AiSoftCapBox, { settings: { ...S, softReached: false, spentUsd: 2 } }))).toBe("");
    expect(renderToStaticMarkup(createElement(AiSoftCapBox, { settings: S }))).toContain(aiSettingsCopy.softWarning("$8.50", "$10.00"));
    expect(renderToStaticMarkup(createElement(AiSoftCapBox, { settings: { ...S, spentUsd: 10 } }))).toContain(aiSettingsCopy.capReached);
  });
});

describe("Studio draft list", () => {
  it("empty text; an approved draft shows its status and how often it was assigned, and links to its page", () => {
    expect(renderToStaticMarkup(createElement(DraftList, { drafts: [] }))).toContain(studioCopy.draftsEmpty);
    const html = renderToStaticMarkup(
      createElement(DraftList, { drafts: [{ id: "d-1", title: "Unit 5", status: "approved", updatedAt: "x", templateId: "B-ST-000001", templateVersion: 1, superseded: false, assigned: 1 }] }),
    );
    expect(html).toContain("Đã duyệt · Đã giao 1 lần");
    expect(html).toContain('href="/studio/drafts/d-1"');
  });
});

describe("Studio review screen pieces (board 19)", () => {
  const draft = normalizeExtract(aiExtractSchema.parse(FAKE_EXTRACT), CTX_B);
  const issues = validateDraft(draft, CTX_B);
  it("side panel: no AI cost line for a tutor; the parent sees this run and the month", () => {
    const summary = summarizeDraft(draft, issues);
    expect(renderToStaticMarkup(createElement(SidePanel, { summary, aiCostUsd: null, gate: null }))).not.toContain("side-ai-cost");
    const gate = { familyId: "f", enabled: true, consent: true, spentUsd: 1.5, monthlyCapUsd: 10, softCapUsd: 8, softReached: false, allowed: true, reason: null };
    const html = renderToStaticMarkup(createElement(SidePanel, { summary, aiCostUsd: 0.12, gate }));
    expect(html).toContain("$0.12");
    expect(html).toContain("Tháng này: $1.50 / $10.00");
  });
  it("item 8 (no key) shows its blocking chip", () => {
    const item = draft.items.find((i) => i.n === 8)!;
    const html = renderToStaticMarkup(
      createElement(ItemCard, { item, parts: draft.parts, passages: draft.passages, context: CTX_B, issues: issues.filter((i) => i.n === 8), onChange: () => undefined, onRemove: () => undefined }),
    );
    expect(html).toContain(studioIssueText.missing_key);
    expect(html).toContain('data-testid="issue-8-missing_key"');
  });
});

describe("Hộp duyệt - Cần thầy/cô xem (board 21)", () => {
  it("the third tab shows its count, or the plain label when unreadable", () => {
    expect(renderToStaticMarkup(createElement(ReviewTabs, { active: "work", skillsCount: null, studioCount: 2 }))).toContain("Cần thầy/cô xem (2)");
    const plain = renderToStaticMarkup(createElement(ReviewTabs, { active: "work", skillsCount: null, studioCount: null }));
    expect(plain).toContain("Cần thầy/cô xem");
    expect(plain).not.toContain("Cần thầy/cô xem (");
  });
  it("a card shows the waiting days, the expected and accepted answers and who wrote it", () => {
    const html = renderToStaticMarkup(
      createElement(StudioPendingCard, {
        attempt: {
          attemptId: "a-1", learnerId: "l-1", alias: "Nguyên", isTest: true, activityId: "x", title: "Unit 5", submittedAt: "2026-11-02T03:00:00Z", attemptNo: 1, waitingDays: 3,
          items: [{ itemId: "q7", n: 7, kind: "transform", stem: "I ____ speak French.", expected: "wish I could", accepted: ["wished I could"], given: "wish I can" }],
        },
      }),
    );
    expect(html).toContain("chờ 3 ngày");
    expect(html).toContain("wish I could");
    expect(html).toContain("wished I could");
    expect(html).toContain("Nguyên viết");
  });
});


describe("Câu cần xem lại (board 20)", () => {
  const review = {
    attemptNo: 1, submittedAt: "2026-11-05T03:00:00Z",
    wrong: [
      { n: 2, stem: "The lights are on. She ____ be at home.", given: "B. can't", expected: "A. must", explanationVi: "Có bằng chứng chắc chắn nên dùng must." },
      { n: 5, stem: "Why did Lan change her mind?", given: "", expected: "B. The robot room was interesting", explanationVi: null },
    ],
    pending: [7, 8],
  };
  it("shows wrong items, the right answer, why, and the waiting numbers — never a score or a count of right items", () => {
    const html = renderToStaticMarkup(createElement(StudioReview, { review }, null));
    expect(html).toContain(studioStudentCopy.title);
    expect(html).toContain("A. must");
    expect(html).toContain(studioStudentCopy.blank);
    expect(html).toContain(studioStudentCopy.pending(2));
    expect(html).toContain("Câu 7, 8");
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\d+\s*\/\s*\d+|%|điểm|đúng\s+\d/i);
  });
});

describe("isStudioStep", () => {
  it("only q<n> items make a Studio step", () => {
    expect(isStudioStep([{ id: "q1" }, { id: "q12" }])).toBe(true);
    expect(isStudioStep([{ id: "W4-R1" }])).toBe(false);
    expect(isStudioStep([])).toBe(false);
  });
});
