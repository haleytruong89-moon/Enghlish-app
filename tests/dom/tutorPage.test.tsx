import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LookupForm } from "@/components/student/tutor/LookupForm";
import { tutorPageCopy } from "@/lib/copy/vi";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const CONTENT = JSON.parse(readFileSync("tests/fixtures/notebook/fake-card.json", "utf8")).card;

function stub(replies: { ok?: boolean; body: Record<string, unknown> }[]) {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: { body?: string }) => {
    calls.push(JSON.parse(init?.body ?? "{}"));
    const r = replies.shift()!;
    return { ok: r.ok ?? true, status: r.ok === false ? 400 : 201, json: async () => r.body };
  }));
  return calls;
}
const send = (word: string, context = "") => {
  fireEvent.change(screen.getByTestId("lookup-word"), { target: { value: word } });
  if (context) fireEvent.change(screen.getByTestId("lookup-context"), { target: { value: context } });
  fireEvent.click(screen.getByTestId("lookup-send"));
};

describe("Gia sư · Tra từ", () => {
  it("a card comes back with the word and the sentence sent; a client id per press", async () => {
    const calls = stub([{ body: { kind: "card", askId: "a1", card: { ...CONTENT, cardId: "c1", ipa: { uk: null, us: null }, sense: 0 }, replayed: false } }]);
    render(<LookupForm off={false} />);
    send("make", "It makes me happy.");
    await waitFor(() => expect(screen.getByTestId("vocab-card")).toBeTruthy());
    expect(calls[0]).toMatchObject({ word: "make", context: "It makes me happy." });
    expect(String(calls[0]!.client_id).length).toBeGreaterThan(8);
  });
  it("input refused by the server, a fixed sentence, spelling suggestions that look up again", async () => {
    const calls = stub([
      { ok: false, body: { error: "not_english" } },
      { body: { kind: "fixed", askId: "a2", fixed: "daily_limit", replayed: false } },
      { body: { kind: "not_word", askId: "a3", suggestions: ["receive"], replayed: false } },
      { body: { kind: "fixed", askId: "a4", fixed: "blocked", replayed: false } },
    ]);
    render(<LookupForm off={false} />);
    send("núi lửa");
    await waitFor(() => expect(screen.getByTestId("lookup-problem").textContent).toBe(tutorPageCopy.errors.not_english));
    send("make");
    await waitFor(() => expect(screen.getByTestId("lookup-fixed").textContent).toBe(tutorPageCopy.fixed.daily_limit));
    send("recieve");
    await waitFor(() => expect(screen.getByTestId("suggest-receive")).toBeTruthy());
    fireEvent.click(screen.getByTestId("suggest-receive"));
    await waitFor(() => expect(calls[3]).toMatchObject({ word: "receive" }));
  });
  it("the tutor off line when consent / AI is not on", () => {
    render(<LookupForm off />);
    expect(screen.getByTestId("tutor-off").textContent).toBe(tutorPageCopy.off);
  });
});

describe("Gia sư · one paid turn per press", () => {
  it("two submits in the same tick send one request", async () => {
    const calls = stub([{ body: { kind: "fixed", askId: "a1", fixed: "daily_limit", replayed: false } }, { body: { kind: "fixed", askId: "a2", fixed: "daily_limit", replayed: false } }]);
    render(<LookupForm off={false} />);
    fireEvent.change(screen.getByTestId("lookup-word"), { target: { value: "make" } });
    fireEvent.submit(screen.getByTestId("lookup-form"));
    fireEvent.submit(screen.getByTestId("lookup-form"));
    await waitFor(() => expect(screen.getByTestId("lookup-fixed")).toBeTruthy());
    expect(calls).toHaveLength(1);
  });
});
