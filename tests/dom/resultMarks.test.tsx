import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResultView } from "@/components/student/player/ResultView";
import { resultCopy, retryCopy } from "@/lib/copy/vi";
import type { ResultMark, ResultView as ResultData } from "@/lib/student/result";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const wrong: ResultMark = { id: "q2", n: 2, stem: "She ___ be at home.", given: "B. can't", mark: "wrong", retry: null, revealed: false, canRetry: true, canReveal: true, answer: null, why: null };
const result = (...marks: ResultMark[]): ResultData => ({ marks, attemptNo: 1, submittedAt: "2026-11-15T03:00:00Z", isTest: false, look: [], open: [], othersFine: false });
const items = [{ id: "q2", kind: "mcq", options: ["A. must", "B. can't"] }];
const show = (marks: ResultMark[], onRefresh: () => Promise<boolean | void> | boolean | void) =>
  render(<ResultView activityId="act1" title="Unit 5" result={result(...marks)} items={items} canRedo onRedo={() => {}} onRefresh={onRefresh} />);
const respond = (status: number, body: unknown = {}) => {
  const f = vi.fn(async (_url: string, _init?: { body?: string }) => ({ ok: status < 300, status, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
};
const post = (f: ReturnType<typeof respond>, i = 0) => {
  const [url, init] = f.mock.calls[i] as unknown as [string, { body: string }];
  return { url, body: JSON.parse(init.body) as Record<string, unknown> };
};

describe("'Xem đáp án' on a wrong item", () => {
  it("posts the item and a client id, then re-reads the result (the answer comes from the server, not from here)", async () => {
    const f = respond(201, { ok: true });
    const refresh = vi.fn(async () => true);
    show([wrong], refresh);
    fireEvent.click(screen.getByTestId("reveal-q2"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(post(f).url).toBe("/api/student/activities/act1/reveal");
    expect(post(f).body).toEqual({ item_id: "q2", client_id: expect.stringMatching(/.{8,}/) });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("answer-q2")).toBeNull(); // nothing is shown until the server sends it
  });

  it("a 409 (already given up elsewhere, or retried) re-reads the result instead of showing an error", async () => {
    respond(409, { error: "already_revealed" });
    const refresh = vi.fn(async () => true);
    show([wrong], refresh);
    fireEvent.click(screen.getByTestId("reveal-q2"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a failure shows 'revealFailed' and does not re-read; the button works again", async () => {
    respond(500);
    const refresh = vi.fn(async () => true);
    show([wrong], refresh);
    fireEvent.click(screen.getByTestId("reveal-q2"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(resultCopy.revealFailed));
    expect(refresh).not.toHaveBeenCalled();
    expect((screen.getByTestId("reveal-q2") as HTMLButtonElement).disabled).toBe(false);
  });

  it("recorded but the result could not be re-read: the child is told, never left with nothing", async () => {
    respond(201);
    show([wrong], async () => false);
    fireEvent.click(screen.getByTestId("reveal-q2"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(resultCopy.revealReload));
  });
});

describe("'Thử lại câu này' in the marks path", () => {
  const sendRetry = async () => {
    fireEvent.click(screen.getByTestId("retry-open-q2"));
    fireEvent.click(screen.getByLabelText("A. must"));
    fireEvent.click(screen.getByTestId("retry-send-q2"));
  };

  it("sent, then the result is re-read", async () => {
    const f = respond(201, { ok: true });
    const refresh = vi.fn(async () => true);
    show([wrong], refresh);
    await sendRetry();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(post(f).url).toBe("/api/student/activities/act1/retry");
    expect(post(f).body).toMatchObject({ item_id: "q2", answer: "A. must" });
  });

  it("sent but the re-read fails: the child still sees 'Đã gửi' with the retry, plus the reload note", async () => {
    respond(201, { ok: true });
    show([wrong], async () => false);
    await sendRetry();
    await waitFor(() => expect(screen.getByTestId("retry-sent-q2")).toBeTruthy());
    expect(screen.getByTestId("retry-sent-q2").textContent).toContain("A. must");
    expect(screen.getByTestId("retry-sent-q2").textContent).toContain(retryCopy.sent);
    expect(screen.queryByTestId("retry-open-q2")).toBeNull(); // one retry only
    expect(screen.getByTestId("mark-problem-q2").textContent).toBe(resultCopy.revealReload);
  });

  it("a 409 re-reads the result (the marks path has no old 'look' list to find the stored retry in)", async () => {
    const f = respond(409, { error: "already_retried" });
    const refresh = vi.fn(async () => true);
    show([wrong], refresh);
    await sendRetry();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(f.mock.calls.every((c) => String(c[0]).endsWith("/retry"))).toBe(true); // no separate fetch of /result here
    expect(screen.queryByText(retryCopy.refused)).toBeNull();
  });

  it("a 409 whose re-read fails says the item was already retried", async () => {
    respond(409, { error: "already_retried" });
    show([wrong], async () => false);
    await sendRetry();
    await waitFor(() => expect(screen.getByText(retryCopy.refused)).toBeTruthy());
  });
});

describe("what a revealed item shows", () => {
  it("the answer and 'Vì sao' only where the server sent them; a right item keeps a collapsed 'Vì sao'; no buttons after reveal", () => {
    const revealed: ResultMark = { ...wrong, revealed: true, canRetry: false, canReveal: false, answer: "A. must", why: "Vì đoán chắc chắn." };
    const right: ResultMark = { ...wrong, id: "q1", n: 1, mark: "right", canRetry: false, canReveal: false, why: "Vì thế." };
    show([right, revealed], async () => true);
    expect(screen.getByTestId("answer-q2").textContent).toContain("A. must");
    expect(screen.getByTestId("why-q2").textContent).toContain("Vì đoán chắc chắn.");
    expect(screen.getByTestId("why-q1").tagName).toBe("DETAILS");
    expect(screen.queryByTestId("answer-q1")).toBeNull();
    expect(screen.queryByTestId("reveal-q2")).toBeNull();
    expect(screen.queryByTestId("retry-open-q2")).toBeNull();
  });
});
