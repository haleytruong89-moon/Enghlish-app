/**
 * The background job of "Cho AI đọc đề" (spec §3 step 2, §5): check the gate again, read the files (PDF as a document, .docx as text),
 * call the AI at most 3 times (logging EVERY call in ai_runs with its estimated cost), normalise the answer into a draft and save it — or
 * mark the draft ai_failed with the last error code so the screen offers "Soạn tay". Never sends anything about the child. Framework-free.
 */
import { refusalStatus, type GateState } from "@/lib/ai/cap";
import { estimateCostUsd, isPricedModel } from "@/lib/ai/pricing";
import { AiCallError, estimateInputTokens, type AiDocument, type CallOptions, type ToolCall, type ToolResult, type Usage } from "@/lib/ai/request";
import type { StudioContext } from "./context";
import { DocxError } from "./docx";
import { buildExtractCall, KEY_DOC_TITLE, TEST_DOC_TITLE } from "./extractTool";
import { normalizeExtract } from "./normalize";
import { aiExtractSchema, type StudioDraft } from "./schema";
import { DOCX_MIME } from "@/lib/storage/rules";

export type RunLog = {
  familyId: string; draftId: string | null; model: string | null; promptVersion: string | null; inputTokens: number; outputTokens: number;
  costUsd: number; status: "ok" | "error" | "refused_cap" | "refused_off" | "refused_model"; errorCode: string | null; byMemberId: string;
  /** The reservation (worst-case price) this run settles; it stops counting once this row exists. */
  releasesRunId: string | null;
};
export interface ExtractStore {
  gate(learnerId: string): Promise<GateState>;
  /** Under the family lock: refuse when spent + the worst-case price of this call reaches the hard cap, else write the reservation. */
  reserve(a: { learnerId: string; estimateUsd: number; draftId: string; model: string; byMemberId: string }): Promise<GateState>;
  logRun(r: RunLog): Promise<string>;
  finish(draftId: string, payload: StudioDraft, runId: string): Promise<{ applied: boolean }>;
  fail(draftId: string, errorCode: string, runId: string | null): Promise<{ applied: boolean }>;
}
export type StoredFile = { path: string; mime: string };
export type ExtractJob = { draftId: string; familyId: string; learnerId: string; byMemberId: string; testFile: StoredFile; keyFile: StoredFile | null };
export type ExtractDeps = {
  store: ExtractStore;
  download: (path: string) => Promise<Uint8Array>;
  docxToText: (bytes: Uint8Array) => Promise<string>;
  context: () => Promise<StudioContext>;
  call: (c: ToolCall, o?: CallOptions) => Promise<ToolResult>;
  model: string;
  toolChoice: "tool" | "auto";
  prompt: { text: string; version: string };
  maxTries?: number;
  /** Whole-job budget (the route's maxDuration is 300 s). */
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};
export type ExtractOutcome = { status: "ok" | "failed" | "refused"; code: string | null; tries: number };

const BACKOFF_MS = [1_000, 3_000];
/** No call is started with less than this left of the budget; a call never runs into the last 20 s. */
const MIN_CALL_MS = 60_000;
const MARGIN_MS = 20_000;
const MAX_CALL_MS = 240_000;
/** Errors that may have cost money without a usage report: the input was probably read, so its estimated price is logged (not 0). */
const COSTS_INPUT = new Set(["timeout", "http_5xx", "network"]);

async function toDocument(deps: ExtractDeps, f: StoredFile, title: string): Promise<AiDocument> {
  const bytes = await deps.download(f.path);
  if (f.mime === DOCX_MIME) return { kind: "text", title, text: await deps.docxToText(bytes) };
  return { kind: "pdf", title, base64: Buffer.from(bytes).toString("base64") };
}

export async function runExtraction(deps: ExtractDeps, job: ExtractJob): Promise<ExtractOutcome> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();
  // Priced by the REQUESTED model, never by what the reply says.
  const log = (status: RunLog["status"], errorCode: string | null, usage: Usage, model: string | null, releasesRunId: string | null = null) =>
    deps.store.logRun({
      familyId: job.familyId, draftId: job.draftId, model, promptVersion: deps.prompt.version, inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens, costUsd: model ? estimateCostUsd(model, usage.inputTokens, usage.outputTokens) : 0, status, errorCode,
      byMemberId: job.byMemberId, releasesRunId,
    });

  if (!isPricedModel(deps.model)) {
    await log("refused_model", "ai_model", { inputTokens: 0, outputTokens: 0 }, null);
    await deps.store.fail(job.draftId, "ai_model", null);
    return { status: "refused", code: "ai_model", tries: 0 };
  }

  const gate = await deps.store.gate(job.learnerId);
  if (!gate.allowed && gate.reason) {
    await log(refusalStatus(gate.reason), gate.reason, { inputTokens: 0, outputTokens: 0 }, null);
    await deps.store.fail(job.draftId, `ai_${gate.reason}`, null);
    return { status: "refused", code: `ai_${gate.reason}`, tries: 0 };
  }

  let docs: AiDocument[];
  try {
    docs = [await toDocument(deps, job.testFile, TEST_DOC_TITLE)];
    if (job.keyFile) docs.push(await toDocument(deps, job.keyFile, KEY_DOC_TITLE));
  } catch (err) {
    const code = err instanceof DocxError ? err.code : "file_unreadable";
    await deps.store.fail(job.draftId, code, null);
    return { status: "failed", code, tries: 0 };
  }
  const ctx = await deps.context();

  const maxTries = deps.maxTries ?? 3;
  let toolChoice = deps.toolChoice;
  let lastCode = "ai_failed";
  let lastRun: string | null = null;
  let tries = 0;
  for (let t = 1; t <= maxTries; t += 1) {
    if (t > 1) await sleep(BACKOFF_MS[t - 2] ?? 3_000);
    const remaining = (deps.budgetMs ?? 280_000) - (now() - started);
    if (remaining < MIN_CALL_MS) {
      lastCode = "timeout";
      break;
    }
    const toolCall = buildExtractCall({ model: deps.model, toolChoice, prompt: deps.prompt.text, ctx, docs });
    const inputEstimate = estimateInputTokens(toolCall);
    // Every iteration (retries and tool_choice switches included) re-checks the hard cap with the worst-case price of THIS call.
    const g = await deps.store.reserve({
      learnerId: job.learnerId, estimateUsd: estimateCostUsd(deps.model, inputEstimate, toolCall.maxTokens), draftId: job.draftId, model: deps.model, byMemberId: job.byMemberId,
    });
    if (!g.allowed && g.reason) {
      await log(refusalStatus(g.reason), g.reason, { inputTokens: 0, outputTokens: 0 }, null);
      lastCode = `ai_${g.reason}`;
      break;
    }
    const reservation = g.reservationId ?? null;
    tries = t;
    try {
      const r = await deps.call(toolCall, { timeoutMs: Math.min(MAX_CALL_MS, remaining - MARGIN_MS) });
      const parsed = aiExtractSchema.safeParse(r.input);
      if (!parsed.success) {
        lastRun = await log("error", "bad_output", r.usage, deps.model, reservation);
        lastCode = "bad_output";
        continue;
      }
      const runId = await log("ok", null, r.usage, deps.model, reservation);
      await deps.store.finish(job.draftId, normalizeExtract(parsed.data, ctx), runId);
      return { status: "ok", code: null, tries: t };
    } catch (err) {
      const e = err instanceof AiCallError ? err : new AiCallError("network");
      const usage = e.usage.inputTokens === 0 && e.usage.outputTokens === 0 && COSTS_INPUT.has(e.code) ? { inputTokens: inputEstimate, outputTokens: 0 } : e.usage;
      lastRun = await log("error", e.code, usage, deps.model, reservation);
      lastCode = e.code;
      if (e.code === "tool_choice" && toolChoice === "tool") {
        toolChoice = "auto";
        continue;
      }
      if (e.code === "http_401" || e.code === "http_400") break; // retrying cannot help
    }
  }
  await deps.store.fail(job.draftId, lastCode, lastRun);
  return { status: "failed", code: lastCode, tries };
}
