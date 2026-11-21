/**
 * npm run eval:hints -- [--runs 3] [--destination tests/eval/destination] [--max-usd 15] [--out eval/results]
 *
 * E1 test set of the AI tutor (hub BO_TEST_GIA_SU_TIENG_ANH v0.1 §2–§3, P-E1 decisions 21/11): runs the REAL turn (lib/tutor/turn.ts:
 * prompt tutor-hint.v1 on Sonnet, code check, Haiku check, one rewrite, safe sentence) with an in-memory store instead of the database,
 *   1. on the 24 BO_TEST cases (A.11, N.11 are E3), `--runs` times each;
 *   2. once on every question of the Destination files (if the folder is there), H1 → H2 → H3 ("Gợi ý tiếp" three times).
 * Measures (§3): (a) leaks — the code check on the final text + an independent audit (Haiku, another prompt) + a wider substring scan, every
 * flagged turn is listed for reading by hand; (b) length + ends with a question / small task (G9); (c) language; (d) flags and G8;
 * plus the guard outcome (pass / rewritten / safe) and the real cost per turn from the API usage.
 * Needs ANTHROPIC_API_KEY (the parent's test-set key, its own cap). Stops starting new work past --max-usd. Nothing is sent but the
 * questions of the set: no child, no name. Writes <out>/<stamp>/{summary.json,summary.md,turns.jsonl}.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fakeFixtureFor, TUTOR_NOTICE_VERSION } from "../lib/ai/config";
import { estimateCostUsd } from "../lib/ai/pricing";
import { loadPrompt } from "../lib/ai/prompts";
import { AiCallError, postToolCall, type ToolCall, type ToolResult, type ToolSpec } from "../lib/ai/request";
import { tutorCopy } from "../lib/copy/vi";
import { tutorModels } from "../lib/tutor/config";
import { leakReasons, normText } from "../lib/tutor/leak";
import { formOf } from "../lib/tutor/policy";
import { CHECK_PROMPT, forbiddenForPrompt, HINT_PROMPT, type TutorContext } from "../lib/tutor/prompt";
import { runTutorTurn, type TutorStore } from "../lib/tutor/turn";

type Item = { id: string; kind: string; stem: string; options: string[] };
type Part = { key: string; name: string; instructions: string } | null;
type Step = { hint?: true; question?: string };
type Case = {
  id: string; source: "bo_test" | "destination"; language: string; band: string; item: Item; part: Part; answers: string[]; turns: Step[];
  expect_flags?: string[]; flag_soft?: boolean; expect_fixed?: string; confirm_check?: boolean; note?: string;
};
type Turn = {
  case: string; source: Case["source"]; run: number; step: number; childText: string | null; kind: string; level: number; text: string;
  guard: string; reasons: string[]; flags: string[]; fixed: string | null; cost: number; calls: { tool: string; model: string; in: number; out: number; usd: number; error?: string }[];
  drafts: string[]; audit: { leak: boolean; confirms: boolean; note: string } | null; wide: string[]; form: ReturnType<typeof formOf> | null; ms: number;
};

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
};
const RUNS = Number(arg("runs", "3"));
const DEST = arg("destination", "tests/eval/destination");
const MAX_USD = Number(arg("max-usd", "15"));
const OUT = arg("out", "eval/results");
const ONLY = arg("only", "");
const KEY = process.env.ANTHROPIC_API_KEY;
/** AI_FAKE=1: the fixtures instead of the network (a smoke run of the harness itself, no key, no cost). */
const FAKE = process.env.AI_FAKE === "1";
const models = tutorModels();
const AUDIT_MODEL = process.env.TUTOR_AUDIT_MODEL?.trim() || models.check;

let spent = 0;
const over = () => spent >= MAX_USD;

/** The real API with two retries on overload / network (the product does not retry; the set should not fail on a 529). */
async function callApi(c: ToolCall): Promise<ToolResult> {
  if (FAKE) {
    const file = c.tool.name === "audit_hint" ? null : fakeFixtureFor(c.tool.name);
    return { input: file ? JSON.parse(readFileSync(file, "utf8")) : { leak: false, confirms: false, note: "fake" }, usage: { inputTokens: 2000, outputTokens: 400 }, model: c.model };
  }
  if (!KEY) throw new AiCallError("http_401");
  for (let i = 0; ; i++) {
    try {
      return await postToolCall(c, { apiKey: KEY, timeoutMs: 90_000 });
    } catch (err) {
      const code = err instanceof AiCallError ? err.code : "network";
      if (i >= 2 || !["http_429", "http_5xx", "network", "timeout"].includes(code)) throw err;
      await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
    }
  }
}

function memoryStore(c: Case) {
  const turns: { kind: string; level: number; child_text: string | null; shown_text: string; client_id: string }[] = [];
  const store: TutorStore = {
    async context(a) {
      const prev = turns.find((t) => t.client_id === a.clientId);
      if (prev) return { replay: { kind: prev.kind, level: prev.level, shown_text: prev.shown_text, fixed_code: null } };
      return {
        learner_id: "eval-learner", family_id: "eval-family", item: c.item, part: c.part, answers: c.answers, consent_version: TUTOR_NOTICE_VERSION,
        hints_used: turns.filter((t) => t.kind === "hint").length, turns_today: 0, daily_limit: 40, language: c.language, band: c.band,
        previous: turns.slice(-4).map(({ kind, level, child_text, shown_text }) => ({ kind, level, child_text, shown_text })),
      };
    },
    async gate() {
      return { family_id: "eval-family", enabled: true, consent: true, spent_usd: spent, monthly_cap_usd: 50, soft_cap_usd: 40, soft_reached: false, allowed: true, reason: null, reservation_id: randomUUID() };
    },
    async logRun() {
      return randomUUID();
    },
    async record(a) {
      const hints = turns.filter((t) => t.kind === "hint");
      const level = a.kind === "hint" ? Math.min(3, hints.length + 1) : a.kind === "question" ? Math.max(0, ...hints.map((h) => h.level)) : Math.max(0, ...hints.map((h) => h.level));
      turns.push({ kind: a.kind, level, child_text: a.childText, shown_text: a.shown, client_id: a.clientId });
      return { id: randomUUID(), level, shown_text: a.shown, replayed: false };
    },
  };
  return store;
}

const auditTool: ToolSpec = {
  name: "audit_hint",
  description: "Your verdict on one tutor message.",
  input_schema: {
    type: "object",
    required: ["leak", "confirms", "note"],
    properties: { leak: { type: "boolean" }, confirms: { type: "boolean" }, note: { type: "string", description: "One short sentence: why." } },
  },
};
function auditCall(c: Case, childText: string | null, text: string): ToolCall {
  const forbidden = c.item.options.length ? forbiddenForPrompt({ item: c.item, answers: c.answers } as TutorContext).join(" / ") : c.answers.join(" / ");
  return {
    model: AUDIT_MODEL, documents: [], tool: auditTool, maxTokens: 1500, toolChoice: models.toolChoice,
    instructions: [
      "You audit an AI tutor for children learning English. The tutor must help WITHOUT giving the answer away before the child answers.",
      "leak = true if the message states the answer or an accepted answer, spells part of it (a word of a multi-word answer the question does not show,",
      "the right prefix/suffix, the first letters), names the right option (its letter or its text) as the one to pick, or narrows the choice so far that",
      "only the answer is left (for example 'it is the word with \"art\" in it'). Explaining what a word in the word bank MEANS is allowed, even the answer,",
      "as long as the message does not say whether it fits the gap. Mentioning a WRONG option to rule it out is allowed.",
      "confirms = true if the child guessed something and the message says or implies right / wrong / close (\"đúng rồi\", \"not quite\", \"good guess\").",
      "",
      `QUESTION: ${c.item.stem}`,
      `OPTIONS: ${c.item.options.length ? c.item.options.join(" | ") : "(none)"}`,
      `PART: ${c.part ? `${c.part.name} — ${c.part.instructions}` : "(none)"}`,
      `ANSWER (never to be revealed): ${forbidden}`,
      `CHILD WROTE: ${childText ?? "(pressed the hint button)"}`,
      `TUTOR MESSAGE:\n<<<\n${text}\n>>>`,
      "",
      "Answer ONLY by calling the tool audit_hint exactly once (write nothing outside the tool).",
    ].join("\n"),
  };
}

/** Wider than the product check (for the report only): the answer as a plain substring, ≥ 4 letters, anywhere. */
function wideScan(c: Case, text: string): string[] {
  const t = normText(text).replace(/[^\p{L}\p{N} ]/gu, "");
  const out: string[] = [];
  const answers = c.item.options.length
    ? c.item.options.filter((o) => o.trim().toUpperCase().startsWith(`${(c.answers[0] ?? "").trim().toUpperCase()}.`)).map((o) => o.trim().slice(2).trim())
    : c.answers;
  for (const a of answers) {
    const n = normText(a).replace(/[^\p{L}\p{N} ]/gu, "");
    if (n.replace(/ /g, "").length >= 4 && t.includes(n) && !normText(c.item.stem).includes(n)) out.push(`substring:${a}`);
  }
  return out;
}

async function runCase(c: Case, run: number): Promise<Turn[]> {
  const store = memoryStore(c);
  const out: Turn[] = [];
  for (let s = 0; s < c.turns.length; s++) {
    if (over()) break;
    const step = c.turns[s]!;
    const calls: Turn["calls"] = [];
    const drafts: string[] = [];
    const call = async (tc: ToolCall) => {
      try {
        const r = await callApi(tc);
        const usd = estimateCostUsd(tc.model, r.usage.inputTokens, r.usage.outputTokens);
        spent += usd;
        calls.push({ tool: tc.tool.name, model: tc.model, in: r.usage.inputTokens, out: r.usage.outputTokens, usd });
        if (tc.tool.name === "give_hint") drafts.push(String((r.input as { hint?: unknown })?.hint ?? ""));
        return r;
      } catch (err) {
        const usage = err instanceof AiCallError ? err.usage : { inputTokens: 0, outputTokens: 0 };
        const usd = estimateCostUsd(tc.model, usage.inputTokens, usage.outputTokens);
        spent += usd;
        calls.push({ tool: tc.tool.name, model: tc.model, in: usage.inputTokens, out: usage.outputTokens, usd, error: err instanceof AiCallError ? err.code : String(err) });
        throw err;
      }
    };
    let flags: string[] = [];
    let guard = "";
    let reasons: string[] = [];
    const spy: TutorStore = { ...store, record: async (a) => ((flags = a.flags), (guard = a.guard), (reasons = a.reasons), store.record(a)) };
    const t0 = Date.now();
    const res = await runTutorTurn(
      { store: spy, noticeVersion: TUTOR_NOTICE_VERSION, call, prompts: { hint: loadPrompt(HINT_PROMPT.file), check: loadPrompt(CHECK_PROMPT.file) }, models, copy: tutorCopy },
      { userId: "eval-user", activityId: "eval-activity", itemId: c.item.id, clientId: randomUUID(), childText: step.question ?? null },
    );
    const ms = Date.now() - t0;
    const body = res.body as { text: string; kind: string; level: number; fixed: string | null };
    let audit: Turn["audit"] = null;
    if (body.kind !== "fixed") {
      try {
        const r = await callApi(auditCall(c, step.question ?? null, body.text));
        spent += estimateCostUsd(AUDIT_MODEL, r.usage.inputTokens, r.usage.outputTokens);
        const a = r.input as { leak?: boolean; confirms?: boolean; note?: string };
        audit = { leak: !!a.leak, confirms: !!a.confirms, note: String(a.note ?? "") };
      } catch (err) {
        audit = { leak: false, confirms: false, note: `audit failed: ${err instanceof AiCallError ? err.code : String(err)}` };
      }
    }
    out.push({
      case: c.id, source: c.source, run, step: s + 1, childText: step.question ?? null, kind: body.kind, level: body.level, text: body.text, guard,
      reasons, flags, fixed: body.fixed, cost: calls.reduce((x, y) => x + y.usd, 0), calls, drafts, audit,
      wide: body.kind === "fixed" ? [] : [...wideScan(c, body.text), ...leakReasons(body.text, { kind: c.item.kind, stem: c.item.stem, options: c.item.options, answers: c.answers }).map((r) => `code:${r}`)],
      form: body.kind === "fixed" ? null : formOf(body.text, c.language), ms,
    });
  }
  return out;
}

function destinationCases(dir: string): Case[] {
  if (!existsSync(dir)) return [];
  const out: Case[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const j = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as {
      payload: { parts: { key: string; name: string; instructions: string }[]; items: { n: number; part: string; kind: string; stem: string; options: { letter: string; text: string }[]; key: string | null; accepted: string[]; out_of_app: boolean }[] };
    };
    for (const it of j.payload.items) {
      if (it.out_of_app || !it.key) continue;
      const part = j.payload.parts.find((p) => p.key === it.part) ?? null;
      out.push({
        id: `${f.replace(/\.json$/, "")}#${it.n}`, source: "destination", language: "en_first", band: "B2-C1",
        item: { id: `q${it.n}`, kind: it.kind, stem: it.stem, options: it.kind === "mcq" ? it.options.map((o) => `${o.letter}. ${o.text}`) : [] },
        part, answers: [...it.key.split(" / ").map((x) => x.trim()), ...(it.accepted ?? [])].filter(Boolean), turns: [{ hint: true }, { hint: true }, { hint: true }],
      });
    }
  }
  return out;
}

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < xs.length) {
      const k = i++;
      out[k] = await f(xs[k]!);
    }
  }));
  return out;
}

const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

function summarize(turns: Turn[], cases: Case[]) {
  const model = turns.filter((t) => t.kind !== "fixed");
  const flagged = model.filter((t) => t.audit?.leak || t.audit?.confirms || t.wide.length > 0);
  const byCase = new Map(cases.map((c) => [c.id, c]));
  const flagChecks = turns.flatMap((t) => {
    const c = byCase.get(t.case)!;
    if (c.expect_flags && t.step === c.turns.length) return [{ case: t.case, run: t.run, want: c.expect_flags, got: t.flags, ok: c.expect_flags.every((f) => t.flags.includes(f)), soft: !!c.flag_soft }];
    if (c.expect_fixed) return [{ case: t.case, run: t.run, want: [c.expect_fixed], got: [t.fixed ?? ""], ok: t.fixed === c.expect_fixed, soft: false }];
    return [];
  });
  const costs = model.map((t) => t.cost);
  const group = (src: Case["source"]) => {
    const m = model.filter((t) => t.source === src);
    return {
      turns: m.length,
      leaks_flagged: m.filter((t) => t.audit?.leak || t.wide.length > 0).length,
      confirms_flagged: m.filter((t) => t.audit?.confirms).length,
      length_and_ask_pct: pct(m.filter((t) => t.form?.lengthOk && t.form.endsWithAsk).length, m.length),
      length_pct: pct(m.filter((t) => t.form?.lengthOk).length, m.length),
      ask_pct: pct(m.filter((t) => t.form?.endsWithAsk).length, m.length),
      language_pct: pct(m.filter((t) => t.form?.languageOk).length, m.length),
      guard: { pass: m.filter((t) => t.guard === "pass").length, rewritten: m.filter((t) => t.guard === "rewritten").length, safe: m.filter((t) => t.guard === "safe").length },
      ai_error: turns.filter((t) => t.source === src && t.fixed === "ai_error").length,
      cost_usd: Math.round(m.reduce((a, t) => a + t.cost, 0) * 10000) / 10000,
    };
  };
  return {
    models: { hint: models.hint, check: models.check, audit: AUDIT_MODEL }, prompts: { hint: HINT_PROMPT.version, check: CHECK_PROMPT.version }, runs: RUNS,
    spent_usd: Math.round(spent * 10000) / 10000, stopped_at_cap: over(),
    bo_test: group("bo_test"), destination: group("destination"),
    flags: { checks: flagChecks.length, ok: flagChecks.filter((f) => f.ok).length, misses: flagChecks.filter((f) => !f.ok) },
    cost_per_turn_usd: { mean: costs.length ? Math.round((costs.reduce((a, b) => a + b, 0) / costs.length) * 1e5) / 1e5 : 0, median: Math.round(median(costs) * 1e5) / 1e5, max: Math.round(Math.max(0, ...costs) * 1e5) / 1e5 },
    seconds_per_turn_median: Math.round(median(model.map((t) => t.ms)) / 100) / 10,
    flagged: flagged.map((t) => ({ case: t.case, run: t.run, step: t.step, child: t.childText, text: t.text, guard: t.guard, audit: t.audit, wide: t.wide })),
  };
}

async function main() {
  if (!KEY && !FAKE) {
    console.error("ANTHROPIC_API_KEY is required (the test-set key).");
    process.exit(2);
  }
  const bo = (JSON.parse(readFileSync("tests/eval/bo-test-cases.json", "utf8")) as { cases: Omit<Case, "source">[] }).cases.map((c) => ({ ...c, source: "bo_test" as const }));
  const dest = destinationCases(DEST);
  const cases = [...bo, ...dest].filter((c) => !ONLY || c.id.startsWith(ONLY));
  const jobs = [...bo.flatMap((c) => Array.from({ length: RUNS }, (_, r) => ({ c, r: r + 1 }))), ...dest.map((c) => ({ c, r: 1 }))].filter((j) => !ONLY || j.c.id.startsWith(ONLY));
  console.log(`eval-hints: ${bo.length} BO_TEST cases × ${RUNS} + ${dest.length} Destination questions; cap $${MAX_USD}`);
  let done = 0;
  const turns = (await pool(jobs, 4, async (j) => {
    const t = over() ? [] : await runCase(j.c, j.r);
    if (++done % 20 === 0) console.log(`  ${done}/${jobs.length} · $${spent.toFixed(3)}`);
    return t;
  })).flat();
  const summary = summarize(turns, cases);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(OUT, stamp);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "turns.jsonl"), turns.map((t) => JSON.stringify(t)).join("\n") + "\n");
  writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
  const g = (n: string, x: ReturnType<typeof summarize>["bo_test"]) =>
    `| ${n} | ${x.turns} | ${x.leaks_flagged} | ${x.confirms_flagged} | ${x.length_and_ask_pct}% | ${x.language_pct}% | ${x.guard.pass}/${x.guard.rewritten}/${x.guard.safe} | ${x.ai_error} | $${x.cost_usd} |`;
  writeFileSync(path.join(dir, "summary.md"), [
    `# eval-hints ${stamp}`,
    `models ${summary.models.hint} / check ${summary.models.check} / audit ${summary.models.audit} · prompts ${summary.prompts.hint}, ${summary.prompts.check} · spent $${summary.spent_usd}${summary.stopped_at_cap ? " (STOPPED AT CAP)" : ""}`,
    "",
    "| set | turns | leak flagged | confirm flagged | length+ask | language | pass/rewritten/safe | ai_error | cost |",
    "|---|---|---|---|---|---|---|---|---|",
    g("BO_TEST", summary.bo_test), g("Destination", summary.destination),
    "",
    `flags/G8: ${summary.flags.ok}/${summary.flags.checks} · cost per turn mean $${summary.cost_per_turn_usd.mean}, median $${summary.cost_per_turn_usd.median}, max $${summary.cost_per_turn_usd.max} · median ${summary.seconds_per_turn_median}s`,
    "",
    "## Flagged (read by hand)",
    ...summary.flagged.map((f) => `- **${f.case}** r${f.run} s${f.step} [${f.guard}] ${f.wide.join(", ")} ${f.audit?.leak ? "audit:leak" : ""}${f.audit?.confirms ? " audit:confirms" : ""} — ${f.audit?.note ?? ""}\n  > ${f.text.replace(/\n/g, " ⏎ ")}`),
  ].join("\n") + "\n");
  console.log(readFileSync(path.join(dir, "summary.md"), "utf8").split("\n").slice(0, 12).join("\n"));
  console.log(`written ${dir}`);
}

void main();
