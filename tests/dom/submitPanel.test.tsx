import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResultForm } from "@/components/tutor/ResultForm";
import { SubmitPanel } from "@/components/practice/SubmitPanel";
import { practiceStudent, resultPage } from "@/lib/copy/vi";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const postJson = vi.fn();
vi.mock("@/lib/tutorwork/client", async (orig) => ({ ...(await orig<typeof import("@/lib/tutorwork/client")>()), postJson: (...a: unknown[]) => postJson(...a) }));

beforeEach(() => {
  postJson.mockReset();
  postJson.mockResolvedValue({ ok: true, status: 201, body: { id: "s1", replayed: false } });
});
afterEach(cleanup);

const A = "c0000000-0000-4000-8000-000000000002";
const L = "a0000000-0000-4000-8000-000000000001";
const pressed = (id: string) => screen.getByTestId(id).getAttribute("aria-pressed");

describe("'Nộp thay' by a grown-up never invents an answer", () => {
  it("starts with nothing chosen, asks for first / retry, and sends NULL when the hint answer stays 'Không rõ'", async () => {
    render(<SubmitPanel learnerId={L} assignmentId={A} kind="link" />);
    const p = `submit-${A}`;
    expect(pressed(`${p}-first-yes`)).toBe("false");
    expect(pressed(`${p}-first-no`)).toBe("false");
    expect(pressed(`${p}-hint-yes`)).toBe("false");
    expect(pressed(`${p}-hint-no`)).toBe("false");
    expect(pressed(`${p}-hint-unknown`)).toBe("true");
    fireEvent.change(screen.getByTestId(`${p}-link`), { target: { value: "https://example.com/r" } });
    fireEvent.click(screen.getByTestId(`${p}-send`));
    expect(screen.getByTestId(`${p}-error`).textContent).toBe(practiceStudent.needFirstAnswer);
    expect(postJson).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId(`${p}-first-no`));
    fireEvent.click(screen.getByTestId(`${p}-send`));
    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson.mock.calls[0]![1]).toMatchObject({ attempt: "retry", used_hint: null, link_url: "https://example.com/r" });
  });
  it("an adult who picks 'Có' sends true", async () => {
    render(<SubmitPanel learnerId={L} assignmentId={A} kind="link" />);
    const p = `submit-${A}`;
    fireEvent.change(screen.getByTestId(`${p}-link`), { target: { value: "https://example.com/r" } });
    fireEvent.click(screen.getByTestId(`${p}-first-yes`));
    fireEvent.click(screen.getByTestId(`${p}-hint-yes`));
    fireEvent.click(screen.getByTestId(`${p}-send`));
    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson.mock.calls[0]![1]).toMatchObject({ attempt: "first", used_hint: true });
  });
});

describe("the result form does not pre-fill the hint answer from an unknown one", () => {
  const assignment = (usedHint: boolean | null) =>
    ({
      id: A, kind: "link", title: "Bài link", sourceKey: null, url: "https://example.com", hasFile: false, dueOn: null, createdAt: "2026-11-10T00:00:00Z", retractedAt: null, frameId: null,
      status: "open", units: [], extraItems: [], feedback: [],
      submission: { id: "s1", submittedAt: "2026-11-11T00:00:00Z", attempt: "first", usedHint, linkUrl: null, byRole: "tutor", files: [] },
    }) as never;
  const form = (usedHint: boolean | null) =>
    render(<ResultForm learnerId={L} frames={[]} tags={[]} map={{ domains: [], groups: [], tags: [] } as never} canClass today="2026-11-12" minDate="2026-10-01" assignments={[assignment(usedHint)]} initialAssignmentId={A} />);
  it("unknown (null): neither Có nor Không is chosen, and saving asks the grown-up to choose", () => {
    form(null);
    expect(pressed("hint-yes")).toBe("false");
    expect(pressed("hint-no")).toBe("false");
    fireEvent.submit(screen.getByTestId("hint-yes").closest("form")!);
    expect(screen.getByText(resultPage.needHint)).toBeTruthy();
    expect(postJson).not.toHaveBeenCalled();
  });
  it("a recorded answer is carried over as before", () => {
    form(true);
    expect(pressed("hint-yes")).toBe("true");
    expect(pressed("hint-no")).toBe("false");
  });
});
