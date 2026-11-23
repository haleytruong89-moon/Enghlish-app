import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AiCallError, type ToolCall } from "@/lib/ai/request";
import { ReviewDbError } from "@/lib/review/handlers";
import type { CardContent } from "@/lib/notebook/card";
import { runAgain, runLookup, type LookupDeps, type LookupStore } from "@/lib/notebook/lookup";

const CARD = (JSON.parse(readFileSync("tests/fixtures/notebook/fake-card.json", "utf8")) as { card: CardContent }).card;
const AGAIN = JSON.parse(readFileSync("tests/fixtures/notebook/fake-again.json", "utf8"));
const V3 = "ai-studio-tutor-v3";
const CTX = { learner_id: "l1", family_id: "f1", language: "vi", band: "A2-B1", lookups_today: 0, lookup_limit: 60, ai_lookups_today: 0, ai_lookup_limit: 30, consent_version: V3, ask: null };
const BAD = { ...CARD, examples: [{ en: "I bake bread.", vi: "x" }, CARD.examples[0]!] };

type Opts = {
  ctx?: Record<string, unknown>; cached?: CardContent | null; cards?: unknown[]; checks?: boolean[]; sense?: number | "error"; callError?: boolean; gateAllowed?: boolean;
  ipa?: { word: string; accent: string; ipa: string[] }[];
};
function setup(o: Opts = {}) {
  const cards = [...(o.cards ?? [{ status: "ok", card: CARD }])];
  const checks = [...(o.checks ?? [true, true])];
  const calls: ToolCall[] = [];
  const store = {
    context: vi.fn(async (_a: Parameters<LookupStore["context"]>[0]) => (o.ctx ?? CTX) as unknown),
    findCard: vi.fn(async () => (o.cached ? { id: "card-old", content: o.cached } : null)),
    cardById: vi.fn(async (id: string) => ({ id, content: CARD })),
    saveCard: vi.fn(async (_a: Parameters<LookupStore["saveCard"]>[0]) => "card-new"),
    ipa: vi.fn(async () => o.ipa ?? [{ word: "make", accent: "uk", ipa: ["/ˈmeɪk/"] }, { word: "make", accent: "us", ipa: ["/ˈmeɪk/"] }]),
    gate: vi.fn(async (_a: Parameters<LookupStore["gate"]>[0]) => ({ family_id: "f1", enabled: true, consent: true, spent_usd: 1, monthly_cap_usd: 20, soft_cap_usd: 18, soft_reached: false, allowed: o.gateAllowed ?? true, reason: o.gateAllowed === false ? "cap" : null, reservation_id: o.gateAllowed === false ? null : "res-1" })),
    logRun: vi.fn(async (_a: Parameters<LookupStore["logRun"]>[0]) => `run-${calls.length}`),
    record: vi.fn(async (_a: Parameters<LookupStore["record"]>[0]) => ({ id: "ask-1", replayed: false })),
  } satisfies LookupStore;
  const deps: LookupDeps = {
    store,
    noticeVersion: V3,
    call: vi.fn(async (c: ToolCall) => {
      calls.push(c);
      if (o.callError) throw new AiCallError("network");
      if (c.tool.name === "save_vocab_card") return { input: cards.shift() ?? { status: "ok", card: CARD }, usage: { inputTokens: 2000, outputTokens: 2500 }, model: c.model };
      if (c.tool.name === "pick_sense") {
        if (o.sense === "error") throw new AiCallError("http_5xx", { inputTokens: 5, outputTokens: 0 });
        return { input: { index: o.sense ?? 0 }, usage: { inputTokens: 300, outputTokens: 10 }, model: c.model };
      }
      if (c.tool.name === "explain_again") return { input: AGAIN, usage: { inputTokens: 900, outputTokens: 600 }, model: c.model };
      return { input: { pass: checks.shift() ?? true, reasons: [] }, usage: { inputTokens: 1500, outputTokens: 40 }, model: c.model };
    }),
    prompts: { card: "CARD {{WORD}} {{CONTEXT}} {{REWRITE}}", check: "CHECK {{CARD}}", sense: "SENSE {{SENSES}} {{CONTEXT}}", again: "AGAIN {{CARD}} {{REWRITE}}" },
    models: { card: "claude-sonnet-5-5", check: "claude-haiku-5-5" },
  };
  return { deps, store, calls };
}
const go = (deps: LookupDeps, word = "make", context: string | null = null) => runLookup(deps, { userId: "u1", word, context, clientId: "client-0001" });
const tools = (calls: ToolCall[]) => calls.map((c) => c.tool.name);

describe("one turn of Tra từ (E2a)", () => {
  it("a cached card, no sentence: no model, no gate; IPA from the table (code)", async () => {
    const { deps, store, calls } = setup({ cached: CARD });
    const r = await go(deps);
    expect(r).toMatchObject({ status: 201, body: { kind: "card", card: { cardId: "card-old", headword: "make", ipa: { uk: "/ˈmeɪk/", us: "/ˈmeɪk/" }, sense: null } } });
    expect(calls).toEqual([]);
    expect(store.gate).not.toHaveBeenCalled();
    expect(store.record.mock.calls[0]![0]).toMatchObject({ guard: "cache", usedAi: false, cardId: "card-old" });
  });

  it("a cached card + the child's sentence: Haiku only picks the sense; the sense reservation is released by that run", async () => {
    const { deps, store, calls } = setup({ cached: CARD, sense: 1 });
    const r = await go(deps, "make", "It makes me happy.");
    expect(r.body).toMatchObject({ kind: "card", card: { sense: 1 } });
    expect(tools(calls)).toEqual(["pick_sense"]);
    expect(store.gate.mock.calls[0]![0]).toMatchObject({ purpose: "vocab_sense" });
    expect(store.logRun.mock.calls[0]![0]).toMatchObject({ purpose: "vocab_sense", release: "res-1" });
    expect(store.record.mock.calls[0]![0]).toMatchObject({ guard: "cache", usedAi: true, sense: 1 });
  });

  it("sense -1: a new version of the card with that meaning first, replacing the old one", async () => {
    const { deps, store, calls } = setup({ cached: CARD, sense: -1 });
    await go(deps, "make", "She made her bed.");
    expect(tools(calls)).toEqual(["pick_sense", "save_vocab_card", "check_vocab_card"]);
    expect(calls[1]!.instructions).toContain("She made her bed.");
    expect(store.saveCard.mock.calls[0]![0]).toMatchObject({ supersedes: "card-old" });
  });

  it("a Haiku failure on the sense shows the cached card without a sense (no new card bought)", async () => {
    const { deps, store, calls } = setup({ cached: CARD, sense: "error" });
    expect((await go(deps, "make", "x y")).body).toMatchObject({ kind: "card", card: { sense: null } });
    expect(tools(calls)).toEqual(["pick_sense"]);
    expect(store.saveCard).not.toHaveBeenCalled();
  });

  it("a new word: Sonnet → code → Haiku → saved once; the ledger is written at the end, the card run releases the reservation", async () => {
    const { deps, store, calls } = setup();
    const r = await go(deps);
    expect(r).toMatchObject({ status: 201, body: { kind: "card", card: { cardId: "card-new" } } });
    expect(tools(calls)).toEqual(["save_vocab_card", "check_vocab_card"]);
    expect(store.saveCard).toHaveBeenCalledTimes(1);
    expect(store.logRun.mock.calls.map((c) => [c[0].purpose, c[0].release])).toEqual([["vocab_card", "res-1"], ["vocab_check", null]]);
    expect(store.record.mock.calls[0]![0]).toMatchObject({ guard: "pass", usedAi: true, promptVersion: "vocab-card.v1" });
    expect(store.record.mock.calls[0]![0].cost).toBeGreaterThan(0);
  });

  it("a card refused by code is rewritten once (the reasons go back to the model)", async () => {
    const { deps, store, calls } = setup({ cards: [{ status: "ok", card: BAD }, { status: "ok", card: CARD }] });
    await go(deps);
    expect(tools(calls)).toEqual(["save_vocab_card", "save_vocab_card", "check_vocab_card"]);
    expect(calls[1]!.instructions).toContain("example_missing_word");
    expect(store.record.mock.calls[0]![0]).toMatchObject({ guard: "rewritten" });
  });

  it("refused twice (Haiku) → fixed card_failed, no card saved; a Haiku network error counts as a refusal", async () => {
    const { deps, store } = setup({ checks: [false, false] });
    expect((await go(deps)).body).toMatchObject({ kind: "fixed", fixed: "card_failed" });
    expect(store.saveCard).not.toHaveBeenCalled();
    const b = setup({ callError: true });
    expect((await go(b.deps)).body).toMatchObject({ kind: "fixed", fixed: "card_failed" });
    expect(b.store.record.mock.calls[0]![0]).toMatchObject({ usedAi: true });
  });

  it("an `ipa` field written by the model is refused like a bad card (L3)", async () => {
    const { deps, calls } = setup({ cards: [{ status: "ok", card: { ...CARD, ipa: "/meɪk/" } }, { status: "ok", card: CARD }] });
    await go(deps);
    expect(tools(calls)).toEqual(["save_vocab_card", "save_vocab_card", "check_vocab_card"]);
  });

  it("not_word: spelling suggestions only, symbols and blocked words filtered", async () => {
    const { deps, store } = setup({ cards: [{ status: "not_word", suggestions: ["Receive", "m4ke", "porn"] }] });
    expect((await go(deps, "recieve")).body).toMatchObject({ kind: "not_word", suggestions: ["receive"] });
    expect(store.record.mock.calls[0]![0]).toMatchObject({ guard: "fixed", fixedCode: "not_word", shown: "receive" });
  });

  it("consent before v3: a new word is not looked up (ai_off), a cached word still is", async () => {
    const old = { ...CTX, consent_version: "ai-studio-tutor-v2" };
    const a = setup({ ctx: old });
    expect((await go(a.deps)).body).toMatchObject({ kind: "fixed", fixed: "ai_off" });
    expect(a.calls).toEqual([]);
    const b = setup({ ctx: old, cached: CARD });
    expect((await go(b.deps)).body).toMatchObject({ kind: "card" });
  });

  it("limits: 60 lookups a day (even cached), 30 with AI; the family gate", async () => {
    const a = setup({ ctx: { ...CTX, lookups_today: 60 }, cached: CARD });
    expect((await go(a.deps)).body).toMatchObject({ fixed: "daily_limit" });
    const b = setup({ ctx: { ...CTX, ai_lookups_today: 30 } });
    expect((await go(b.deps)).body).toMatchObject({ fixed: "ai_daily_limit" });
    expect(b.calls).toEqual([]);
    const c = setup({ gateAllowed: false });
    expect((await go(c.deps)).body).toMatchObject({ fixed: "ai_off" });
  });

  it("blocked words and bad input never reach the store or a model", async () => {
    const a = setup();
    expect((await go(a.deps, "porn")).body).toMatchObject({ fixed: "blocked" });
    expect(a.store.findCard).not.toHaveBeenCalled();
    const b = setup();
    expect(await go(b.deps, "núi lửa")).toEqual({ status: 400, body: { error: "not_english" } });
    expect(b.store.context).not.toHaveBeenCalled();
  });

  it("the same client id: the earlier ask comes back, no model", async () => {
    const { deps, calls } = setup({ ctx: { replay: { id: "ask-0", kind: "lookup", card_id: "card-x", sense: null, guard: "pass", shown_text: null, fixed_code: null } } });
    expect(await go(deps)).toMatchObject({ status: 200, body: { kind: "card", askId: "ask-0", replayed: true, card: { cardId: "card-x" } } });
    expect(calls).toEqual([]);
  });

  it("a phrase with a word missing from the IPA table has no IPA line", async () => {
    const { deps } = setup({ cached: { ...CARD, headword: "make friends", forms: ["make friends"] }, ipa: [{ word: "make", accent: "uk", ipa: ["/ˈmeɪk/"] }] });
    expect((await go(deps, "make friends")).body).toMatchObject({ card: { ipa: { uk: null, us: null } } });
  });

  it("not a child (the database says so) → 404; the prompt never carries a name", async () => {
    const a = setup();
    a.store.context.mockRejectedValueOnce(new ReviewDbError("42501", "eng_lookup_context: only a child asks the tutor (not_child)"));
    expect(await go(a.deps)).toEqual({ status: 404, body: { error: "not_found" } });
    const b = setup({ ctx: { ...CTX, alias: "An" } });
    await go(b.deps);
    expect(b.calls[0]!.instructions).not.toMatch(/\bAn\b/);
  });
});

describe("Chưa hiểu, giải thích cách khác", () => {
  it("on the child's own lookup: one AI turn checked like a card, recorded as again with its parent", async () => {
    const { deps, store, calls } = setup({ ctx: { ...CTX, ask: { id: "ask-0", card_id: "card-old" } } });
    const r = await runAgain(deps, { userId: "u1", askId: "ask-0", clientId: "client-0002" });
    expect(r.body).toMatchObject({ kind: "again", again: { angle: "picture" } });
    expect(tools(calls)).toEqual(["explain_again", "check_vocab_card"]);
    expect(store.gate.mock.calls[0]![0]).toMatchObject({ purpose: "vocab_again" });
    expect(store.record.mock.calls[0]![0]).toMatchObject({ kind: "again", parentAsk: "ask-0", cardId: "card-old", guard: "pass" });
  });
  it("not the child's ask → 404, no model", async () => {
    const { deps, calls } = setup();
    expect(await runAgain(deps, { userId: "u1", askId: "ask-9", clientId: "client-0002" })).toEqual({ status: 404, body: { error: "not_found" } });
    expect(calls).toEqual([]);
  });
});
