import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Player } from "@/components/student/player/Player";
import { playerCopy, work } from "@/lib/copy/vi";
import type { SupportedActivityView } from "@/lib/work/types";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The reading step of the e2e (W1-R1 choice, W1-R2 short answer, W1-R3 next), a test (INDEPENDENT_CHECK).
const base: SupportedActivityView = {
  supported: true, activityId: "act1", instanceId: "i1", stepNo: 3, activityType: "ACT-SOURCE-QA", mode: "INDEPENDENT_CHECK", purpose: [], date: "2026-11-15", titleVi: "Núi lửa",
  bigQuestionEn: "", bigQuestionVi: "", shape: "answers", canSubmit: true,
  step: {
    promptEn: "p", timeMin: null, selfCheckVi: [],
    items: [
      { id: "W1-R1", kind: "mcq", stem: "Main idea?", options: ["a) x", "b) y"] },
      { id: "W1-R2", kind: "short", stem: "What is magma?", options: [] },
      { id: "W1-R3", kind: "short", stem: "Third", options: [] },
    ],
  },
  attempts: [], draft: null, sources: [],
};

/** A fake draft endpoint with a slow first reply: edits made while it is in flight must still reach the server. */
function fakeServer(slowFirst: boolean) {
  const stored: { answers: Record<string, string> }[] = [];
  let calls = 0;
  const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
    calls += 1;
    const body = JSON.parse(init?.body ?? "{}") as { content: { answers: Record<string, string> } };
    if (slowFirst && calls === 1) await new Promise((r) => setTimeout(r, 60));
    stored.push({ answers: body.content.answers });
    return { ok: true, status: 200, json: async () => ({ draft: { revision: calls, otherTabChanged: false } }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { stored, last: () => stored[stored.length - 1]?.answers ?? {} };
}

describe("the player stores every answer (the e2e reload scenario)", () => {
  it("a radio choice followed at once by a typed answer: the last stored draft has both, and 'saved' is not shown before that", async () => {
    const srv = fakeServer(true);
    render(<Player activity={base} isTest initialResult={null} />);
    fireEvent.click(screen.getByLabelText("b) y")); // save #1 starts (slow)
    fireEvent.click(screen.getByTestId("player-next"));
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "Melted rock" } });
    fireEvent.blur(box); // blocked by the running save: must be saved right after it, not lost
    fireEvent.click(screen.getByTestId("player-next"));
    expect(screen.getByTestId("save-status").textContent).not.toContain(playerCopy.saved);
    await waitFor(() => expect(srv.last()).toEqual({ "W1-R1": "b) y", "W1-R2": "Melted rock" }));
    await waitFor(() => expect(screen.getByTestId("save-status").textContent).toBe(playerCopy.saved));
  });

  it("the choice itself is in the first save (the snapshot is built from the new value, not from the last render)", async () => {
    const srv = fakeServer(false);
    render(<Player activity={base} isTest initialResult={null} />);
    fireEvent.click(screen.getByLabelText("a) x"));
    await waitFor(() => expect(srv.last()).toEqual({ "W1-R1": "a) x" }));
  });

  it("after a reload with a draft holding R1 and R2 the player opens on R3", () => {
    const withDraft = { ...base, draft: { content: { answers: { "W1-R1": "b) y", "W1-R2": "Melted rock" } }, revision: 2, updatedAt: "2026-11-15T01:00:00Z" } };
    render(<Player activity={withDraft} isTest initialResult={null} />);
    expect(screen.getByTestId("question-W1-R3")).toBeTruthy();
    expect(screen.getByTestId("test-line")).toBeTruthy();
    expect(screen.getByTestId("save-status").textContent).toBe(playerCopy.saved);
  });

  it("a server draft after an attempt is a redo in progress: the questions open with its answers, not the old result or receipt", () => {
    const redo = { ...base, attempts: [{ attemptNo: 1, submittedAt: "2026-11-15T02:00:00Z", provenance: "in_app" }] as never, draft: { content: { answers: { "W1-R1": "b) y" } }, revision: 4, updatedAt: "2026-11-15T03:00:00Z" } };
    const oldResult = { attemptNo: 1, submittedAt: "2026-11-15T02:00:00Z", isTest: false, othersFine: true, look: [], open: [] };
    render(<Player activity={redo} isTest={false} initialResult={oldResult} sentAt="2026-11-15T02:00:00Z" />);
    expect(screen.queryByTestId("result-view")).toBeNull();
    expect(screen.queryByTestId("receipt")).toBeNull();
    expect(screen.getByTestId("question-W1-R2")).toBeTruthy(); // R1 is answered in the draft
  });

  it("a failed submit does not let autosave recreate a draft (the reply may have been lost)", { timeout: 15000 }, async () => {
    const f = vi.fn(async (url: string) => (url === "/api/attempts" ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ draft: { revision: 1, otherTabChanged: false } }) }));
    vi.stubGlobal("fetch", f);
    render(<Player activity={base} isTest initialResult={null} />);
    fireEvent.click(screen.getByLabelText("b) y"));
    await waitFor(() => expect(f.mock.calls.filter((c) => String(c[0]).startsWith("/api/drafts")).length).toBe(1));
    fireEvent.click(screen.getByTestId("player-submit-top"));
    fireEvent.click(screen.getByLabelText(work.help.none));
    fireEvent.click(screen.getByTestId("player-submit"));
    await waitFor(() => expect(screen.getByTestId("problem")).toBeTruthy());
    const drafts = () => f.mock.calls.filter((c) => String(c[0]).startsWith("/api/drafts")).length;
    const before = drafts();
    fireEvent.click(screen.getByLabelText(work.help.notes)); // an edit after the failure
    await new Promise((r) => setTimeout(r, 6000)); // longer than the autosave tick
    expect(drafts()).toBe(before);
  });

  describe("D39: after the answers were shown the whole work is not redone", () => {
    const practice = { ...base, mode: "PRACTICE" as const, attempts: [{ attemptNo: 1, submittedAt: "2026-11-15T02:00:00Z", provenance: "in_app" }] as never };
    const mark = { id: "W1-R2", n: 2, stem: "What is magma?", given: "x", mark: "wrong" as const, retry: null, revealed: true, canRetry: false, canReveal: false, answer: "Melted rock", why: "Vì" };
    const shown = { marks: [mark], attemptNo: 1, submittedAt: "2026-11-15T02:00:00Z", isTest: false, look: [], open: [], othersFine: false };

    it("a draft left by another tab is ignored when the result already shows an answer: the result opens, not the questions, and there is no 'Làm lại cả bài'", () => {
      const withDraft = { ...practice, draft: { content: { answers: { "W1-R1": "b) y" } }, revision: 4, updatedAt: "2026-11-15T03:00:00Z" } };
      render(<Player activity={withDraft} isTest={false} initialResult={shown} sentAt="2026-11-15T02:00:00Z" />);
      expect(screen.getByTestId("result-view")).toBeTruthy();
      expect(screen.queryByTestId("player")).toBeNull();
      expect(screen.queryByTestId("result-redo")).toBeNull();
    });

    it("a redo refused by the server (409 answers_shown, e.g. another tab showed an answer) opens the result with the answers", async () => {
      const f = vi.fn(async (url: string) => {
        if (url === "/api/attempts") return { ok: false, status: 409, json: async () => ({ error: "answers_shown" }) };
        if (String(url).endsWith("/result")) return { ok: true, status: 200, json: async () => ({ result: shown }) };
        return { ok: true, status: 200, json: async () => ({ draft: { revision: 1, otherTabChanged: false } }) };
      });
      vi.stubGlobal("fetch", f);
      render(<Player activity={practice} isTest={false} initialResult={null} sentAt="2026-11-15T02:00:00Z" />);
      fireEvent.click(screen.getByTestId("receipt-redo")); // the receipt cannot know that an answer was shown
      fireEvent.click(screen.getByLabelText("b) y"));
      fireEvent.click(screen.getByTestId("player-submit-top"));
      fireEvent.click(screen.getByLabelText(work.help.none));
      fireEvent.click(screen.getByTestId("player-submit"));
      await waitFor(() => expect(screen.getByTestId("result-view")).toBeTruthy());
      expect(screen.getByTestId("answer-W1-R2").textContent).toContain("Melted rock");
      expect(screen.queryByTestId("result-redo")).toBeNull();
      expect(screen.queryByTestId("problem")).toBeNull();
    });

    it("when the result cannot be read either, the child gets the plain message (never the generic 'already submitted')", async () => {
      const f = vi.fn(async (url: string) => {
        if (url === "/api/attempts") return { ok: false, status: 409, json: async () => ({ error: "answers_shown" }) };
        if (String(url).endsWith("/result")) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ draft: { revision: 1, otherTabChanged: false } }) };
      });
      vi.stubGlobal("fetch", f);
      render(<Player activity={practice} isTest={false} initialResult={null} sentAt="2026-11-15T02:00:00Z" />);
      fireEvent.click(screen.getByTestId("receipt-redo"));
      fireEvent.click(screen.getByLabelText("b) y"));
      fireEvent.click(screen.getByTestId("player-submit-top"));
      fireEvent.click(screen.getByLabelText(work.help.none));
      fireEvent.click(screen.getByTestId("player-submit"));
      await waitFor(() => expect(screen.getByTestId("problem").textContent).toBe(work.answersShown));
    });
  });
});
