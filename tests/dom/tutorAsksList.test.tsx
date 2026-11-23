import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TutorAsksList } from "@/components/tutor/TutorAsksList";
import { tutorPageCopy } from "@/lib/copy/vi";
import type { TutorAskRow } from "@/lib/notebook/adultLoad";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
afterEach(cleanup);
const row = (o: Partial<TutorAskRow>): TutorAskRow => ({ id: "a1", at: "2026-11-23T12:42:00Z", kind: "lookup", childText: "make", contextText: null, headword: "make", cardId: "c1", fixedCode: null, guard: "pass", saved: false, rating: null, ...o });

describe("Con hỏi Gia sư (adults, D-G8)", () => {
  it("time in Vietnam, what the child typed with the sentence, the card link, saved, rating", () => {
    render(<TutorAsksList learnerId="l1" rows={[row({ contextText: "It makes me happy.", saved: true, rating: "confused" })]} />);
    const tr = screen.getByTestId("ask-a1");
    expect(tr.textContent).toContain("23/11 19:42");
    expect(tr.textContent).toContain("It makes me happy.");
    expect(tr.querySelector("a")?.getAttribute("href")).toBe("/learners/l1/tutor-asks/card/c1");
    expect(tr.textContent).toContain("Đã lưu");
    expect(tr.textContent).toContain("😕");
  });
  it("a refused ask shows why; a cached one is marked; no rating → no face", () => {
    render(<TutorAsksList learnerId="l1" rows={[row({ id: "a2", fixedCode: "blocked", cardId: null, headword: null, guard: "fixed" }), row({ id: "a3", guard: "cache" })]} />);
    expect(screen.getByTestId("ask-a2").textContent).toContain(tutorPageCopy.fixed.blocked);
    expect(screen.getByTestId("ask-a3").textContent).toContain("thẻ có sẵn");
    expect(screen.getByTestId("ask-a3").textContent).not.toMatch(/😊|😐|😕/);
  });
  it("empty", () => {
    render(<TutorAsksList learnerId="l1" rows={[]} />);
    expect(screen.getByTestId("tutor-asks-empty")).toBeTruthy();
  });
});
