import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/AppHeader";
import { FeedbackForm } from "@/components/workdesk/FeedbackForm";
import { FeedbackList } from "@/components/workdesk/FeedbackList";
import { IntakeCard } from "@/components/workdesk/IntakeCard";
import { TeachingNotesCard } from "@/components/workdesk/TeachingNotesCard";
import { appFeedback, intakeCopy, teachingNotes, tutorHonorific } from "@/lib/copy/vi";
import type { AppFeedbackView, IntakeView, TeachingNotesView } from "@/lib/workdesk/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const LEARNER = "b0000000-0000-4000-8000-000000000001";
const empty: TeachingNotesView = { fields: { focus: null, explain: null, errors: null, avoid: null }, updatedAt: null };
const filled: TeachingNotesView = {
  fields: { focus: { text: "Đảo ngữ", at: "2026-11-05T00:00:00Z", authorName: "Cô Lan" }, explain: null, errors: null, avoid: null },
  updatedAt: "2026-11-05T00:00:00Z",
};
const domains = [
  { key: "grammar", name: "Ngữ pháp" },
  { key: "vocab", name: "Từ vựng" },
] as const;
const intake: IntakeView = { goals: [{ title: "Thi vào 10", due: "06/2027" }], strengths: { vocab: "Từ vựng khá" }, weaknesses: { grammar: "Đảo ngữ" }, note: "", at: "2026-11-01T00:00:00Z", authorName: "Cô Lan" };

describe("TeachingNotesCard", () => {
  const html = (view: TeachingNotesView, canEdit: boolean) => renderToStaticMarkup(createElement(TeachingNotesCard, { learnerId: LEARNER, alias: "Nguyên", view, canEdit }));
  it("shows the 4 field labels, a dash for empty ones and the value of a filled one", () => {
    const h = html(filled, true);
    for (const l of Object.values(teachingNotes.fields)) expect(h).toContain(l);
    expect(h).toContain("Đảo ngữ");
    expect(h).toContain(teachingNotes.empty);
    expect(html(empty, false)).not.toContain("Đảo ngữ");
  });
  it("the edit button only for the tutor; the parent sees the read-only line", () => {
    expect(html(filled, true)).toContain('data-testid="notes-edit"');
    const parent = html(filled, false);
    expect(parent).not.toContain('data-testid="notes-edit"');
    expect(parent).toContain(teachingNotes.readOnly);
  });
  it("never writes the tutor's title by hand", () => {
    const BARE_CO = /(^|[^\p{L}])cô([^\p{L}]|$)/iu;
    // negative self-check: the pattern really catches a hand-written "cô" (also in Vietnamese text, where \b fails on accents)
    expect(BARE_CO.test("Nhờ cô xem giúp")).toBe(true);
    expect(BARE_CO.test("Cô Lan")).toBe(true);
    expect(BARE_CO.test("cô")).toBe(true);
    expect(BARE_CO.test("côn trùng")).toBe(false);
    // (author names are data, so render without one)
    const anon: TeachingNotesView = { ...filled, fields: { ...filled.fields, focus: { text: "Đảo ngữ", at: "2026-11-05T00:00:00Z", authorName: "" } } };
    // the one allowed spelling is the shared honorific "thầy/cô"; once that is taken out, no bare "cô" may remain
    const noHonorific = (h: string) => h.replaceAll(tutorHonorific, "");
    expect(BARE_CO.test(noHonorific("Nhờ cô xem"))).toBe(true);
    expect(noHonorific(html(anon, false))).not.toMatch(BARE_CO);
    expect(noHonorific(html(anon, true))).not.toMatch(BARE_CO);
    expect(noHonorific(teachingNotes.intro("Nguyên"))).not.toMatch(BARE_CO);
    expect(teachingNotes.intro("Nguyên")).toContain(tutorHonorific);
  });
});

describe("IntakeCard", () => {
  const html = (view: IntakeView | null, canEdit: boolean) => renderToStaticMarkup(createElement(IntakeCard, { learnerId: LEARNER, view, canEdit, domains: [...domains] }));
  it("empty profile shows the explanation; a filled one lists goals, strengths and weaknesses", () => {
    expect(html(null, true)).toContain(intakeCopy.empty);
    const h = html(intake, false);
    expect(h).toContain("Thi vào 10 · 06/2027");
    expect(h).toContain("Từ vựng khá");
    expect(h).toContain("Đảo ngữ");
    expect(h).not.toContain('data-testid="intake-edit"');
    expect(html(intake, true)).toContain('data-testid="intake-edit"');
  });
});

describe("FeedbackList", () => {
  const item = (id: string, status: AppFeedbackView["status"], reply: string | null = null): AppFeedbackView => ({
    id, kind: "hard_to_use", screen: "Ghi buổi học", text: "Chọn kỹ năng phải cuộn lâu", byName: "Cô Lan", byRole: "tutor", at: "2026-11-05T00:00:00Z", status, reply, statusAt: "2026-11-05T00:00:00Z",
  });
  const html = (role: "parent" | "tutor", items = [item("a", "new"), item("b", "in_progress", "Bản sau sẽ sửa")]) => renderToStaticMarkup(createElement(FeedbackList, { items, role }));
  it("the parent gets a status select and a reply box per item", () => {
    const h = html("parent");
    expect(h).toContain('data-testid="fb-status-a"');
    expect(h).toContain('data-testid="fb-replybox-b"');
  });
  it("the tutor sees only the status label and the reply", () => {
    const h = html("tutor");
    expect(h).not.toContain("fb-status-");
    expect(h).toContain(appFeedback.statuses.in_progress);
    expect(h).toContain("Bản sau sẽ sửa");
  });
  it("keeps the order it is given (the loader sorts 'new' first) and shows the empty line", () => {
    const h = html("tutor");
    expect(h.indexOf("fb-a")).toBeLessThan(h.indexOf("fb-b"));
    expect(html("tutor", [])).toContain(appFeedback.empty);
  });
});

describe("FeedbackForm and the header link", () => {
  it("renders the 4 kinds as toggle buttons", () => {
    const h = renderToStaticMarkup(createElement(FeedbackForm, { defaultScreen: "Hộp duyệt" }));
    for (const k of Object.values(appFeedback.kinds)) expect(h).toContain(k);
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain("Hộp duyệt");
  });
  it("the header shows the link only when a screen label is given, and carries it", () => {
    expect(renderToStaticMarkup(createElement(AppHeader, {}))).not.toContain("feedback-link");
    const h = renderToStaticMarkup(createElement(AppHeader, { feedbackScreen: "Hộp duyệt" }));
    expect(h).toContain(appFeedback.link);
    expect(h).toContain(`/feedback?screen=${encodeURIComponent("Hộp duyệt")}`);
  });
});
