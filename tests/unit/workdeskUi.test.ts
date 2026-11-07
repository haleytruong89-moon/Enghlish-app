import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IntakeCard } from "@/components/workdesk/IntakeCard";
import { TeachingNotesCard } from "@/components/workdesk/TeachingNotesCard";
import { intakeCopy, teachingNotes, tutorHonorific } from "@/lib/copy/vi";
import type { IntakeView, TeachingNotesView } from "@/lib/workdesk/types";

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
    expect(html(filled, false)).not.toMatch(/\bcô\b/);
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
