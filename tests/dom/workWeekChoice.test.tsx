import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SubmitPanel } from "@/components/practice/SubmitPanel";
import { workWeekCopy } from "@/lib/copy/vi";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
// jsdom cannot read files: the preparation step keeps the file as it is.
vi.mock("@/lib/storage/clientUpload", async (orig) => ({ ...(await orig<typeof import("@/lib/storage/clientUpload")>()), prepareFile: async (f: File) => ({ ok: true, file: { blob: f, mime: f.type, bytes: 10, name: f.name } }) }));
const postJson = vi.fn();
const uploadAll = vi.fn();
vi.mock("@/lib/tutorwork/client", async (orig) => ({ ...(await orig<typeof import("@/lib/tutorwork/client")>()), postJson: (...a: unknown[]) => postJson(...a) }));
vi.mock("@/lib/practice/client", async (orig) => ({ ...(await orig<typeof import("@/lib/practice/client")>()), uploadAll: (...a: unknown[]) => uploadAll(...a) }));

const A = "c0000000-0000-4000-8000-000000000002";
const L = "a0000000-0000-4000-8000-000000000001";
const at = (iso: string) => vi.setSystemTime(new Date(iso));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  postJson.mockReset();
  postJson.mockResolvedValue({ ok: true, status: 201, body: { id: "s1", replayed: false } });
  uploadAll.mockReset();
  uploadAll.mockResolvedValue({ ok: true, files: [{ id: "f1", mime: "application/pdf", bytes: 10 }] });
  URL.createObjectURL = vi.fn(() => "blob:x");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("'Tuần làm bài' when an adult sends paper work", () => {
  it("Monday and Tuesday (Vietnam time) offer 'Tuần này' (default) and 'Tuần trước' for a PDF assignment", () => {
    at("2026-11-15T17:00:00Z"); // Monday 00:00 VN
    render(<SubmitPanel learnerId={L} assignmentId={A} kind="pdf" />);
    expect(screen.getByTestId(`submit-${A}-week`).textContent).toContain(workWeekCopy.label);
    expect(screen.getByTestId(`submit-${A}-week-this`).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId(`submit-${A}-week-last`).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId(`submit-${A}-week-last`));
    expect(screen.getByTestId(`submit-${A}-week-last`).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId(`submit-${A}-week-last`).className).toContain("min-h-11");
  });
  it("Tuesday 23:59 VN still offers it; Wednesday 00:00 VN and Sunday do not", () => {
    at("2026-11-17T16:59:00Z");
    const { unmount } = render(<SubmitPanel learnerId={L} assignmentId={A} kind="pdf" />);
    expect(screen.queryByTestId(`submit-${A}-week`)).not.toBeNull();
    unmount();
    at("2026-11-17T17:00:00Z");
    const w = render(<SubmitPanel learnerId={L} assignmentId={A} kind="pdf" />);
    expect(screen.queryByTestId(`submit-${A}-week`)).toBeNull();
    w.unmount();
    at("2026-11-15T16:59:00Z");
    render(<SubmitPanel learnerId={L} assignmentId={A} kind="pdf" />);
    expect(screen.queryByTestId(`submit-${A}-week`)).toBeNull();
  });
  it("a link assignment never offers it (a link sent by an adult does not count)", () => {
    at("2026-11-16T05:00:00Z");
    render(<SubmitPanel learnerId={L} assignmentId={A} kind="link" />);
    expect(screen.queryByTestId(`submit-${A}-week`)).toBeNull();
  });

  it("the POST carries work_week 'last' when it was chosen, and still does after Tuesday midnight (the choice is decided once; the server refuses it if it is too late)", async () => {
    at("2026-11-17T16:00:00Z"); // Tuesday 23:00 VN
    render(<SubmitPanel learnerId={L} assignmentId={A} kind="pdf" />);
    fireEvent.click(screen.getByTestId(`submit-${A}-week-last`));
    fireEvent.change(screen.getByTestId(`submit-${A}-picker-input`), { target: { files: [new File(["p"], "bai.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByTestId(`submit-${A}-first-yes`));
    await waitFor(() => expect(screen.getByTestId(`submit-${A}-picker-item`)).toBeTruthy());
    at("2026-11-17T17:30:00Z"); // Wednesday 00:30 VN: the panel was already open
    expect(screen.getByTestId(`submit-${A}-week`)).toBeTruthy();
    fireEvent.click(screen.getByTestId(`submit-${A}-send`));
    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson.mock.calls[0]![1]).toMatchObject({ work_week: "last", attempt: "first" });
  });
  it("without the choice the body has no work_week at all", async () => {
    at("2026-11-16T05:00:00Z");
    render(<SubmitPanel learnerId={L} assignmentId={A} kind="pdf" />);
    fireEvent.change(screen.getByTestId(`submit-${A}-picker-input`), { target: { files: [new File(["p"], "bai.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByTestId(`submit-${A}-first-yes`));
    await waitFor(() => expect(screen.getByTestId(`submit-${A}-picker-item`)).toBeTruthy());
    fireEvent.click(screen.getByTestId(`submit-${A}-send`));
    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson.mock.calls[0]![1]).not.toHaveProperty("work_week");
  });
});
