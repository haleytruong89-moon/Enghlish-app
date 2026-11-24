/**
 * npm run eval:cards -- [--max-usd 5] [--out eval/results] [--only W01,S01]
 *
 * E2a test set of the tutor's word cards (spec §11): runs the REAL lookup turn (lib/notebook/lookup.ts: vocab-card.v1 on Sonnet, code
 * checks, Haiku check, one rewrite) with an in-memory store (no cache, consent v3), then an independent audit of each card (Haiku,
 * prompts/vocab-audit.v1.md) on the §4.5 template. Hard rules: the expected outcome, lemma / sense / typo expectations, nothing personal
 * from the child's sentence. Needs ANTHROPIC_API_KEY (the test-set key). AI_FAKE=1 → fixtures (smoke run, no cost).
 * Writes <out>/<stamp>/{summary.public.md,results.jsonl}: only self-written words, no child data.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fakeFixtureFor, TUTOR_NOTICE_VERSION } from "../lib/ai/config";
import { estimateCostUsd } from "../lib/ai/pricing";
import { loadPrompt } from "../lib/ai/prompts";
import { AiCallError, postToolCall, type ToolCall, type ToolResult, type ToolSpec } from "../lib/ai/request";
import type { CardContent } from "../lib/notebook/card";
import { runLookup, type LookupStore } from "../lib/notebook/lookup";
import { AGAIN_PROMPT, CARD_CHECK_PROMPT, CARD_PROMPT, SENSE_PROMPT } from "../lib/notebook/prompt";
import { notebookModels } from "../lib/tutor/config";
import { AUDIT_KEYS, caseProblems, casesFileSchema, summarize, type Audit, type CardCase, type CardResult } from "./lib/evalCards";

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const MAX_USD = Number(arg("max-usd", "5"));
const OUT = arg("out", "eval/results");
const ONLY = new Set(arg("only", "").split(",").filter(Boolean));
const KEY = process.env.ANTHROPIC_API_KEY;
const FAKE = process.env.AI_FAKE === "1";
const models = notebookModels();
let spent = 0;
/** API errors by code (e.g. http_429, http_400 when the test-set key has no credit left): printed at the end. */
const errors = new Map<string, number>();

const auditTool: ToolSpec = {
  name: "audit_card",
  description: "The parent's independent audit of one word card.",
  input_schema: {
    type: "object",
    required: [...AUDIT_KEYS, "notes"],
    properties: { ...Object.fromEntries(AUDIT_KEYS.map((k) => [k, { type: "boolean" }])), notes: { type: "string" } },
  },
};

async function callApi(c: ToolCall, timeoutMs = 45_000): Promise<ToolResult> {
  if (FAKE) {
    const input = c.tool.name === "audit_card" ? { ...Object.fromEntries(AUDIT_KEYS.map((k) => [k, true])), notes: "" } : JSON.parse(readFileSync(fakeFixtureFor(c.tool.name), "utf8"));
    return { input, usage: { inputTokens: 2000, outputTokens: 400 }, model: c.model };
  }
  if (!KEY) throw new AiCallError("http_401");
  for (let i = 0; ; i++) {
    try {
      const r = await postToolCall(c, { apiKey: KEY, timeoutMs });
      spent += estimateCostUsd(c.model, r.usage.inputTokens, r.usage.outputTokens);
      return r;
    } catch (err) {
      const code = err instanceof AiCallError ? err.code : "network";
      errors.set(code, (errors.get(code) ?? 0) + 1);
      if (i >= 2 || !["http_429", "http_5xx"].includes(code)) throw err;
      await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
    }
  }
}

function memoryStore(c: CardCase) {
  const saved: { id: string; content: CardContent }[] = [];
  let recorded: Parameters<LookupStore["record"]>[0] | null = null;
  const store: LookupStore = {
    async context() {
      return { learner_id: "eval", family_id: "eval", language: c.language, band: c.band, lookups_today: 0, lookup_limit: 60, ai_lookups_today: 0, ai_lookup_limit: 30, consent_version: TUTOR_NOTICE_VERSION, ask: null };
    },
    async findCard() { return null; },
    async cardById(id) { const s = saved.find((x) => x.id === id); return s ? { id: s.id, content: s.content } : null; },
    async saveCard(a) { const id = randomUUID(); saved.push({ id, content: a.content }); return id; },
    async ipa() { return []; },
    async gate() { return { family_id: "eval", enabled: true, consent: true, spent_usd: spent, monthly_cap_usd: 50, soft_cap_usd: 40, soft_reached: false, allowed: true, reason: null, reservation_id: randomUUID() }; },
    async logRun() { return randomUUID(); },
    async record(a) { recorded = a; return { id: randomUUID(), replayed: false }; },
  };
  return { store, saved, recorded: () => recorded };
}

async function main() {
  if (!KEY && !FAKE) {
    console.error("ANTHROPIC_API_KEY is required (the test-set key).");
    process.exit(1);
  }
  const file = casesFileSchema.parse(JSON.parse(readFileSync("tests/eval/cards/cases.json", "utf8")));
  const prompts = { card: loadPrompt(CARD_PROMPT.file), check: loadPrompt(CARD_CHECK_PROMPT.file), sense: loadPrompt(SENSE_PROMPT.file), again: loadPrompt(AGAIN_PROMPT.file) };
  const audit = loadPrompt("vocab-audit.v1");
  const results: CardResult[] = [];
  const full: unknown[] = [];
  for (const c of file.cases) {
    if (ONLY.size && !ONLY.has(c.id)) continue;
    if (spent >= MAX_USD) {
      console.log(`stop: spent ${spent.toFixed(2)} ≥ ${MAX_USD}`);
      break;
    }
    const t0 = Date.now();
    const mem = memoryStore(c);
    let outcome: CardResult["outcome"] = "error";
    let fixed: string | null = null;
    let card: CardContent | null = null;
    let suggestions: string[] = [];
    try {
      const r = await runLookup({ store: mem.store, noticeVersion: TUTOR_NOTICE_VERSION, call: (x, o) => callApi(x, o?.timeoutMs), prompts, models }, { userId: "eval", word: c.word, context: c.context ?? null, clientId: randomUUID() });
      const b = r.body as { kind?: string; fixed?: string; card?: CardContent; suggestions?: string[] };
      if (b.kind === "card") { outcome = "card"; card = b.card ?? null; }
      else if (b.kind === "not_word") { outcome = "not_word"; suggestions = b.suggestions ?? []; }
      else if (b.kind === "fixed") { outcome = b.fixed === "blocked" ? "blocked" : "fixed"; fixed = b.fixed ?? null; }
    } catch (err) {
      fixed = (err as Error).message.slice(0, 80);
    }
    let auditOut: Audit | null = null;
    if (card) {
      const a = await callApi({
        model: models.check, documents: [], tool: auditTool, maxTokens: 1500, toolChoice: models.toolChoice,
        instructions: audit.replace("{{BAND}}", c.band).replace("{{LANGUAGE}}", c.language).replace("{{WORD}}", c.word).replace("{{CONTEXT}}", c.context ?? "").replace("{{CARD}}", JSON.stringify(card)),
      }).catch(() => null);
      auditOut = a ? (a.input as Audit) : null;
    }
    const rec = mem.recorded();
    const problems = caseProblems(c, { outcome, headword: card?.headword, firstSense: card?.senses[0]?.meaning_vi, suggestions, cardText: card ? JSON.stringify(card) : "" });
    results.push({ id: c.id, expect: c.expect, outcome, fixed, guard: rec?.guard ?? null, cost: rec?.cost ?? 0, ms: Date.now() - t0, problems, audit: auditOut });
    full.push({ case: c, outcome, fixed, card, suggestions, record: rec, audit: auditOut });
    const failedAudit = auditOut ? AUDIT_KEYS.filter((k) => !auditOut![k]) : [];
    // Reasons are codes only (no card text): safe for the public log, and they say why a card was refused.
    console.log(`${c.id} ${outcome}${fixed ? ` (${fixed})` : ""} ${problems.join(",")}${rec?.reasons?.length ? ` reasons=${rec.reasons.join("|")}` : ""}${failedAudit.length ? ` audit=${failedAudit.join("|")}` : ""}`);
  }
  const dir = path.join(OUT, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "summary.public.md"), summarize(file.version, results, spent));
  writeFileSync(path.join(dir, "results.jsonl"), full.map((x) => JSON.stringify(x)).join("\n") + "\n");
  console.log(`written ${dir} · spent ${spent.toFixed(3)} USD · API errors ${JSON.stringify(Object.fromEntries(errors))}`);
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
