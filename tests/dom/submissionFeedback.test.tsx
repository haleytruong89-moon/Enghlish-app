import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SubmissionFeedbackForm, checkSubmissionFeedback } from "@/components/practice/SubmissionFeedbackForm";
import { submissionFeedbackCopy as copy } from "@/lib/copy/vi";
import type { SubmissionFeedbackView } from "@/lib/practice/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const postJson = vi.fn();
vi.mock("@/lib/tutorwork/client", async (orig) => ({ ...(await orig<typeof import("@/lib/tutorwork/client")>()), postJson: (...a: unknown[]) => postJson(...a) }));

beforeEach(() => {
  postJson.mockReset();
  postJson.mockResolvedValue({ ok: true, status: 201, body: { id: "f1", replayed: false } });
  refresh.mockReset();
});
afterEach(cleanup);

const L = "a0000000-0000-4000-8000-000000000001";
const A = "c0000000-0000-4000-8000-000000000002";
const S = "e0000000-0000-4000-8000-000000000001";
const fb = (o: Partial<SubmissionFeedbackView> = {}): SubmissionFeedbackView => ({
  id: "f0000000-0000-4000-8000-000000000001", submissionId: S, assignmentId: A, praise: "Chữ rõ.", items: [{ n: 1, text: "Xem lại câu 38." }],
  authorMember: "m-tutor", authorRole: "tutor", authorName: "Thầy Hùng", createdAt: "2026-11-15T03:00:00Z", live: true, ...o,
});
const show = (feedback: SubmissionFeedbackView[] = [], viewer = "m-tutor") =>
  render(<SubmissionFeedbackForm learnerId={L} assignmentId={A} submissionId={S} feedback={feedback} viewerMemberId={viewer} />);

describe("checkSubmissionFeedback (the rules the form checks before sending)", () => {
  it("needs a praise or one thing to fix; no scores in any of them; length limits", () => {
    expect(checkSubmissionFeedback("", [""])).toBe("empty_feedback");
    expect(checkSubmissionFeedback("   ", ["  "])).toBe("empty_feedback");
    expect(checkSubmissionFeedback("Tốt", [""])).toBeNull();
    expect(checkSubmissionFeedback("", ["Câu 3"])).toBeNull();
    expect(checkSubmissionFeedback("Được 8 điểm", [""])).toBe("score_words");
    expect(checkSubmissionFeedback("Tốt", ["đúng 3/4 câu"])).toBe("score_words");
    expect(checkSubmissionFeedback("Bài ngày 5/10", ["Điểm mạnh là chữ rõ"])).toBeNull();
    expect(checkSubmissionFeedback("x".repeat(401), [""])).toBe("praise_too_long");
    expect(checkSubmissionFeedback("", ["y".repeat(301)])).toBe("item_too_long");
    expect(checkSubmissionFeedback("", ["a", "b", "c", "d"])).toBe("items_invalid");
  });
});

describe("Góp ý cho con (SubmissionFeedbackForm)", () => {
  it("with no feedback yet: a button opens the form (praise + one item); a second item can be added up to 3", () => {
    show();
    fireEvent.click(screen.getByTestId(`sfb-open-${A}`));
    expect(screen.getByTestId("sfb-praise")).toBeTruthy();
    expect(screen.getByTestId("sfb-item-1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("sfb-add"));
    fireEvent.click(screen.getByTestId("sfb-add"));
    expect(screen.getByTestId("sfb-item-3")).toBeTruthy();
    expect(screen.queryByTestId("sfb-add")).toBeNull();
    for (const b of screen.getAllByRole("button")) expect(b.className, b.textContent ?? "").toMatch(/min-h-1[12]/);
  });

  it("sends praise + items with a client id for THIS submission, and refreshes the page", async () => {
    show();
    fireEvent.click(screen.getByTestId(`sfb-open-${A}`));
    fireEvent.change(screen.getByTestId("sfb-praise"), { target: { value: "Chữ viết rõ." } });
    fireEvent.change(screen.getByTestId("sfb-item-1"), { target: { value: "Câu 38–40: xem lại." } });
    fireEvent.click(screen.getByTestId("sfb-send"));
    await waitFor(() => expect(postJson).toHaveBeenCalled());
    const [url, body] = postJson.mock.calls[0]! as [string, Record<string, unknown>];
    expect(url).toBe(`/api/learners/${L}/assignments/${A}/submissions/${S}/feedback`);
    expect(body).toMatchObject({ praise: "Chữ viết rõ.", items: [{ text: "Câu 38–40: xem lại." }] });
    expect(String(body.client_id).length).toBeGreaterThanOrEqual(8);
    expect(body).not.toHaveProperty("supersedes_id");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("refuses a score before anything is sent, with the sentence of the guide", () => {
    show();
    fireEvent.click(screen.getByTestId(`sfb-open-${A}`));
    fireEvent.change(screen.getByTestId("sfb-praise"), { target: { value: "Con được 8 điểm." } });
    fireEvent.click(screen.getByTestId("sfb-send"));
    expect(screen.getByTestId("sfb-error").textContent).toBe(copy.errors.score_words);
    expect(postJson).not.toHaveBeenCalled();
  });

  it("an empty note is refused; a server error is shown in plain words and the same client id is kept for a retry after a network loss", async () => {
    postJson.mockResolvedValueOnce({ ok: false, status: 0, error: "error" });
    show();
    fireEvent.click(screen.getByTestId(`sfb-open-${A}`));
    fireEvent.click(screen.getByTestId("sfb-send"));
    expect(screen.getByTestId("sfb-error").textContent).toBe(copy.errors.empty_feedback);
    fireEvent.change(screen.getByTestId("sfb-praise"), { target: { value: "Tốt." } });
    fireEvent.click(screen.getByTestId("sfb-send"));
    await waitFor(() => expect(screen.getByTestId("sfb-error").textContent).toMatch(/mạng/i));
    fireEvent.click(screen.getByTestId("sfb-send"));
    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(2));
    expect((postJson.mock.calls[0]![1] as { client_id: string }).client_id).toBe((postJson.mock.calls[1]![1] as { client_id: string }).client_id);
  });

  it("shows the live note; only its author sees 'Sửa góp ý', and an edit names the note it replaces; older versions are listed", async () => {
    const old = fb({ id: "f0000000-0000-4000-8000-000000000000", live: false, praise: "Cũ." });
    const { unmount } = show([fb(), old], "m-tutor");
    const liveBox = within(screen.getByTestId("sfb-shown-f0000000-0000-4000-8000-000000000001"));
    expect(liveBox.getByTestId("sfb-shown-praise").textContent).toContain("Chữ rõ.");
    expect(liveBox.getByTestId("sfb-shown-item-1").textContent).toContain("Xem lại câu 38.");
    expect(within(screen.getByTestId(`sfb-history-${A}`)).getByText(copy.history(1))).toBeTruthy();
    fireEvent.click(screen.getByTestId(`sfb-edit-${A}`));
    expect((screen.getByTestId("sfb-praise") as HTMLTextAreaElement).value).toBe("Chữ rõ.");
    fireEvent.change(screen.getByTestId("sfb-praise"), { target: { value: "Chữ rất rõ." } });
    fireEvent.click(screen.getByTestId("sfb-send"));
    await waitFor(() => expect(postJson).toHaveBeenCalled());
    expect(postJson.mock.calls[0]![1]).toMatchObject({ praise: "Chữ rất rõ.", supersedes_id: "f0000000-0000-4000-8000-000000000001" });
    unmount();
    show([fb()], "m-parent");
    expect(screen.queryByTestId(`sfb-edit-${A}`)).toBeNull();
  });

  it("a note on an older (replaced) submission is not 'live' for the current one: the form offers a fresh note", () => {
    show([fb({ submissionId: "e0000000-0000-4000-8000-000000000099" })]);
    expect(screen.getByTestId(`sfb-open-${A}`)).toBeTruthy();
    expect(screen.queryByTestId("sfb-shown-praise")).toBeNull();
  });
});

describe("the same form on a Studio attempt (0037)", () => {
  it("posts to the Studio endpoint with the attempt id and says it is only a note", async () => {
    render(<SubmissionFeedbackForm studio learnerId={L} assignmentId={A} submissionId={S} feedback={[]} viewerMemberId="m-tutor" />);
    fireEvent.click(screen.getByTestId(`sfb-open-${A}`));
    expect(screen.getByText(/không yêu cầu con làm lại bài/)).toBeTruthy();
    fireEvent.change(screen.getByTestId("sfb-praise"), { target: { value: "Bạn chia dạng từ chắc." } });
    fireEvent.click(screen.getByTestId("sfb-send"));
    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson.mock.calls[0]![0]).toBe(`/api/learners/${L}/studio/attempts/${S}/feedback`);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("before 0037 the error names the update to apply", async () => {
    postJson.mockResolvedValue({ ok: false, status: 409, error: "feedback_unavailable" });
    render(<SubmissionFeedbackForm studio learnerId={L} assignmentId={A} submissionId={S} feedback={[]} viewerMemberId="m-tutor" />);
    fireEvent.click(screen.getByTestId(`sfb-open-${A}`));
    fireEvent.change(screen.getByTestId("sfb-praise"), { target: { value: "Tốt." } });
    fireEvent.click(screen.getByTestId("sfb-send"));
    await waitFor(() => expect(screen.getByTestId("sfb-error").textContent).toMatch(/0037/));
  });
});
