import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VocabCard } from "@/components/student/tutor/VocabCard";
import type { CardView } from "@/lib/notebook/card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const CONTENT = JSON.parse(readFileSync("tests/fixtures/notebook/fake-card.json", "utf8")).card;
const CARD: CardView = { ...CONTENT, cardId: "c1", ipa: { uk: "/ˈmeɪk/", us: "/ˈmeɪk/" }, sense: null };

function stubFetch(reply: Record<string, unknown> = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push({ url: String(url), body: JSON.parse(init?.body ?? "{}") });
    return { ok: true, status: 200, json: async () => reply };
  }));
  return calls;
}

describe("word card (§4.5)", () => {
  it("guess first: nothing else before a pick; a wrong pick shows ✗ + why, then everything is open", () => {
    render(<VocabCard card={CARD} askId="a1" />);
    expect(screen.getByTestId("card-guess")).toBeTruthy();
    expect(screen.queryByTestId("card-core")).toBeNull();
    fireEvent.click(screen.getByTestId("guess-1"));
    expect(screen.getByTestId("guess-result").textContent).toContain("✗");
    expect(screen.getByTestId("guess-result").textContent).toContain(CARD.guess.no);
    expect(screen.getByTestId("card-core").textContent).toBe(CARD.core);
  });
  it("'Xem luôn' opens it without a pick; Vì sao and Liên quan are open with no further press", () => {
    render(<VocabCard card={CARD} askId="a1" />);
    fireEvent.click(screen.getByTestId("guess-skip"));
    expect(screen.getByTestId("card-why").textContent).toContain(CARD.trap);
    expect(screen.getByTestId("card-related").textContent).toContain("make friends");
    expect(document.querySelector("details")).toBeNull();
  });
  it("self-check: ✓ / ✗ and why; the card never shows a total or a score", () => {
    render(<VocabCard card={CARD} askId="a1" />);
    fireEvent.click(screen.getByTestId("guess-0"));
    fireEvent.click(screen.getByTestId("check-0").querySelectorAll("button")[0]!);
    expect(screen.getByTestId("check-note-0").textContent).toContain("✓");
    const text = screen.getByTestId("vocab-card").textContent ?? "";
    expect(text).not.toMatch(/điểm|%|\d\s*\/\s*\d/);
  });
  it("related words call the lookup; the IPA lines come from the card view (code)", () => {
    const onLookup = vi.fn();
    render(<VocabCard card={CARD} askId="a1" onLookup={onLookup} />);
    expect(screen.getByTestId("ipa-uk").textContent).toContain("/ˈmeɪk/");
    fireEvent.click(screen.getByTestId("guess-0"));
    fireEvent.click(screen.getByTestId("related-do"));
    expect(onLookup).toHaveBeenCalledWith("do");
  });
  it("no IPA → no line; opened from Sổ tay (no ask) → no 'Chưa hiểu' and no 😊", () => {
    render(<VocabCard card={{ ...CARD, ipa: { uk: null, us: null } }} askId={null} saved />);
    expect(screen.queryByTestId("ipa-uk")).toBeNull();
    fireEvent.click(screen.getByTestId("guess-skip"));
    expect(screen.queryByTestId("card-again-button")).toBeNull();
    expect(screen.queryByTestId("rate-good")).toBeNull();
    expect(screen.getByTestId("card-save").textContent).toContain("Đã có trong Sổ tay");
  });
  it("save, explain again and rate call the child's routes", async () => {
    const calls = stubFetch({ item_id: "i1", already: false });
    render(<VocabCard card={CARD} askId="a1" />);
    fireEvent.click(screen.getByTestId("guess-skip"));
    fireEvent.click(screen.getByTestId("card-save"));
    await waitFor(() => expect(screen.getByTestId("card-save").textContent).toContain("Đã lưu"));
    expect(calls[0]).toMatchObject({ url: "/api/student/notebook", body: { card_id: "c1" } });
    fireEvent.click(screen.getByTestId("rate-confused"));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/student/tutor/asks/a1/rate" && c.body.rating === "confused")).toBe(true));
    vi.unstubAllGlobals();
    stubFetch({ kind: "again", askId: "a2", again: { angle: "picture", core: "Hai bàn tay nặn ra thứ mới.", examples: [{ en: "We make a boat.", vi: "x" }, { en: "Mum makes soup.", vi: "y" }], task: "Viết một câu." }, replayed: false });
    fireEvent.click(screen.getByTestId("card-again-button"));
    await waitFor(() => expect(screen.getByTestId("card-again").textContent).toContain("Hai bàn tay"));
  });
});
