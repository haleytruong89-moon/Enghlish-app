import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RetryPendingCard } from "@/components/review/RetryPendingCard";
import { studioInboxCopy } from "@/lib/copy/vi";
import type { RetryAttempt } from "@/lib/studio/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
});

const attempt: RetryAttempt = {
  attemptId: "att-1", learnerId: "L1", alias: "Nguyên (thử)", isTest: true, activityId: "act", title: "Unit 5", submittedAt: "2026-11-15T03:00:00Z", since: "2026-11-15T04:00:00Z",
  retries: [{ itemId: "q2", n: 2, stem: "She ___ be at home.", given: "B. can't", retry: "A. must", at: "2026-11-15T04:00:00Z" }],
};
const fetchMock = (status: number, body: unknown = {}) => {
  const f = vi.fn(async () => ({ ok: status < 300, status, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
};
const sent = (f: ReturnType<typeof fetchMock>, i = 0) => {
  const [url, init] = f.mock.calls[i] as unknown as [string, { body: string }];
  return { url, body: JSON.parse(init.body) as Record<string, unknown> };
};

describe("the retry card (Đã xem)", () => {
  it("shows the first answer beside the retry, and the note says only adults see it", () => {
    fetchMock(201);
    render(<RetryPendingCard attempt={attempt} />);
    expect(screen.getByTestId("retry-given").textContent).toBe("B. can't");
    expect(screen.getByTestId("retry-text").textContent).toBe("A. must");
    expect(screen.getByText(studioInboxCopy.retryNoteHint)).toBeTruthy();
    expect(screen.getByTestId("retry-seen-att-1").textContent).toContain(studioInboxCopy.retrySeen);
  });

  it("posts the note (trimmed; none = omitted), then leaves the list and refreshes", async () => {
    const f = fetchMock(201, { id: "s", replayed: false });
    render(<RetryPendingCard attempt={attempt} />);
    fireEvent.change(screen.getByTestId("retry-note-att-1"), { target: { value: "  Ổn rồi  " } });
    fireEvent.click(screen.getByTestId("retry-seen-att-1"));
    await waitFor(() => expect(screen.queryByTestId("retry-card-att-1")).toBeNull());
    expect(sent(f).url).toBe("/api/review/studio/attempts/att-1/retry-seen");
    expect(sent(f).body).toMatchObject({ note: "Ổn rồi", client_id: expect.stringMatching(/.{8,}/) });
    expect(refresh).toHaveBeenCalled();
  });

  it("a network failure keeps the card and the same client id for the retry; success rotates it", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "s", replayed: false }) });
    vi.stubGlobal("fetch", f);
    render(<RetryPendingCard attempt={attempt} />);
    fireEvent.click(screen.getByTestId("retry-seen-att-1"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByTestId("retry-seen-att-1"));
    await waitFor(() => expect(screen.queryByTestId("retry-card-att-1")).toBeNull());
    const ids = f.mock.calls.map((c) => (JSON.parse((c as unknown as [string, { body: string }])[1].body) as { client_id: string }).client_id);
    expect(ids[0]).toBe(ids[1]);
  });
});
