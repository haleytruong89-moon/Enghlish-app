import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FeedbackForm } from "@/components/workdesk/FeedbackForm";
import { parseFeedbackKind } from "@/lib/workdesk/kind";
import { inquiriesPage, tutorHonorific, tutorHonorificCap } from "@/lib/copy/vi";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(cleanup);

describe("feedback ?kind=", () => {
  it("parseFeedbackKind accepts only the 4 known kinds", () => {
    expect(parseFeedbackKind("suggestion")).toBe("suggestion");
    expect(parseFeedbackKind(["bug", "question"])).toBe("bug");
    expect(parseFeedbackKind("nope")).toBeUndefined();
    expect(parseFeedbackKind(undefined)).toBeUndefined();
  });
  it("FeedbackForm preselects initialKind, default hard_to_use", () => {
    render(<FeedbackForm defaultScreen="x" initialKind="suggestion" />);
    expect(screen.getByTestId("fb-kind-suggestion").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("fb-kind-hard_to_use").getAttribute("aria-pressed")).toBe("false");
    cleanup();
    render(<FeedbackForm defaultScreen="x" />);
    expect(screen.getByTestId("fb-kind-hard_to_use").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("inquiriesPage.intro", () => {
  it("says family-made topic lessons, honorific rule, link text and href", () => {
    const n = inquiriesPage.intro;
    expect(n.before).toContain("do gia đình/phụ huynh soạn");
    expect(n.before).toContain(`${tutorHonorificCap} giao xen`);
    expect(n.before).toContain(`${tutorHonorific}`);
    expect(n.link).toBe("Góp ý về app");
    expect(n.after).toContain("loại Đề xuất");
    expect(n.after).toContain("tự bổ sung bài (sắp có)");
    expect(inquiriesPage.introHref("l1")).toBe("/feedback?learner=l1&screen=inquiries&kind=suggestion");
  });
});
