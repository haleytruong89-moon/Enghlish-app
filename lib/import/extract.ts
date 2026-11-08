/**
 * The background job of "Cho AI đọc bài" (W3): check the gate again, download the two files (the student's work: PDF or photo; the key:
 * PDF, photo or Word), call the AI at most 3 times (EVERY call logged in ai_runs with purpose read_answers, its prompt version and its
 * estimated cost, after a worst-case reservation under the family lock), compare the answers in code and save the draft payload — or mark
 * the batch ai_failed (the screen then says so; nothing is invented). Sends nothing typed by a person and nothing about the child.
 * Same loop as lib/curriculum/extract.ts. Framework-free.
 */
import { refusalStatus, type GateState } from "@/lib/ai/cap";
import { estimateCostUsd, isPricedModel } from "@/lib/ai/pricing";
import { AiCallError, estimateInputTokens, type AiDocument, type CallOptions, type ImageMediaType, type ToolCall, type ToolResult, type Usage } from "@/lib/ai/request";
import { DOCX_MIME } from "@/lib/storage/rules";
import type { RunLog } from "@/lib/studio/extract";
import type { ReadContext } from "./context";
import { normalizeRead } from "./normalize";
import { buildReadCall, KEY_DOC_TITLE, WORK_DOC_TITLE } from "./readTool";
import { aiReadSchema } from "./schema";
import type { ReadPayload } from "./types";

export interface ReadExtractStore {
  gate(learnerId: string): Promise<GateState>;
  /** Under the family lock: refuse when spent + the worst-case price of this call reaches the hard cap, else write the reservation. */
  reserve(a: { learnerId: string; estimateUsd: number; batchId: string; model: string; byMemberId: string }): Promise<GateState>;
  /** RunLog.draftId carries the batch id (ai_runs.draft_id has no foreign key). */
  logRun(r: RunLog): Promise<string>;
  finish(batchId: string, payload: ReadPayload, runId: string): Promise<{ applied: boolean }>;
  fail(batchId: string, errorCode: string, runId: string | null): Promise<{ applied: boolean }>;
}
export type StoredFile = { path: string; mime: string };
export type ReadJob = { batchId: string; familyId: string; learnerId: string; byMemberId: string; workFile: StoredFile; keyFile: StoredFile };
export type ReadDeps = {
  store: ReadExtractStore;
  download: (path: string) => Promise<Uint8Array>;
  docxToText: (bytes: Uint8Array) => Promise<string>;
  context: () => Promise<ReadContext>;
  call: (c: ToolCall, o?: CallOptions) => Promise<ToolResult>;
  model: string;
  toolChoice: "tool" | "auto";
  prompt: { text: string; version: string };
  maxTries?: number;
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};
export type ReadOutcome = { status: "ok" | "failed" | "refused"; code: string | null; tries: number };

const BACKOFF_MS = [1_000, 3_000];
const MIN_CALL_MS = 60_000;
const MARGIN_MS = 20_000;
const MAX_CALL_MS = 240_000;
const COSTS_INPUT = new Set(["timeout", "http_5xx", "network"]);
const IMAGE_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

async function toDocument(deps: ReadDeps, f: StoredFile, title: string): Promise<AiDocument> {
  const bytes = await deps.download(f.path);
  if (f.mime === DOCX_MIME) return { kind: "text", title, text: await deps.docxToText(bytes) };
  if (IMAGE_TYPES.includes(f.mime)) return { kind: "image", title, mediaType: f.mime as ImageMediaType, base64: Buffer.from(bytes).toString("base64") };
  return { kind: "pdf", title, base64: Buffer.from(bytes).toString("base64") };
}

export async function runReadExtraction(deps: ReadDeps, job: ReadJob): Promise<ReadOutcome> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();
  const log = (status: RunLog["status"], errorCode: string | null, usage: Usage, model: string | null, releasesRunId: string | null = null) =>
    deps.store.logRun({
      familyId: job.familyId, draftId: job.batchId, model, promptVersion: deps.prompt.version, inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens, costUsd: model ? estimateCostUsd(model, usage.inputTokens, usage.outputTokens) : 0, status, errorCode,
      byMemberId: job.byMemberId, releasesRunId,
    });
  const none: Usage = { inputTokens: 0, outputTokens: 0 };

  if (!isPricedModel(deps.model)) {
    await log("refused_model", "ai_model", none, null);
    await deps.store.fail(job.batchId, "ai_model", null);
    return { status: "refused", code: "ai_model", tries: 0 };
  }
  const gate = await deps.store.gate(job.learnerId);
  if (!gate.allowed && gate.reason) {
    await log(refusalStatus(gate.reason), gate.reason, none, null);
    await deps.store.fail(job.batchId, `ai_${gate.reason}`, null);
    return { status: "refused", code: `ai_${gate.reason}`, tries: 0 };
  }
  let docs: AiDocument[];
  try {
    docs = [await toDocument(deps, job.workFile, WORK_DOC_TITLE), await toDocument(deps, job.keyFile, KEY_DOC_TITLE)];
  } catch {
    await deps.store.fail(job.batchId, "file_unreadable", null);
    return { status: "failed", code: "file_unreadable", tries: 0 };
  }
  const ctx = await deps.context();

  let toolChoice = deps.toolChoice;
  let lastCode = "ai_failed";
  let lastRun: string | null = null;
  let tries = 0;
  for (let t = 1; t <= (deps.maxTries ?? 3); t += 1) {
    if (t > 1) await sleep(BACKOFF_MS[t - 2] ?? 3_000);
    const remaining = (deps.budgetMs ?? 280_000) - (now() - started);
    if (remaining < MIN_CALL_MS) {
      lastCode = "timeout";
      break;
    }
    const call = buildReadCall({ model: deps.model, toolChoice, prompt: deps.prompt.text, ctx, docs });
    const inputEstimate = estimateInputTokens(call);
    const g = await deps.store.reserve({
      learnerId: job.learnerId, estimateUsd: estimateCostUsd(deps.model, inputEstimate, call.maxTokens), batchId: job.batchId, model: deps.model, byMemberId: job.byMemberId,
    });
    if (!g.allowed && g.reason) {
      await log(refusalStatus(g.reason), g.reason, none, null);
      lastCode = `ai_${g.reason}`;
      break;
    }
    const reservation = g.reservationId ?? null;
    tries = t;
    try {
      const r = await deps.call(call, { timeoutMs: Math.min(MAX_CALL_MS, remaining - MARGIN_MS) });
      const parsed = aiReadSchema.safeParse(r.input);
      if (!parsed.success || parsed.data.questions.length === 0) {
        lastRun = await log("error", "bad_output", r.usage, deps.model, reservation);
        lastCode = "bad_output";
        continue;
      }
      const runId = await log("ok", null, r.usage, deps.model, reservation);
      await deps.store.finish(job.batchId, normalizeRead(parsed.data, ctx), runId);
      return { status: "ok", code: null, tries: t };
    } catch (err) {
      const e = err instanceof AiCallError ? err : new AiCallError("network");
      const usage = e.usage.inputTokens === 0 && e.usage.outputTokens === 0 && COSTS_INPUT.has(e.code) ? { inputTokens: inputEstimate, outputTokens: call.maxTokens } : e.usage;
      lastRun = await log("error", e.code, usage, deps.model, reservation);
      lastCode = e.code;
      if (e.code === "tool_choice" && toolChoice === "tool") {
        toolChoice = "auto";
        continue;
      }
      if (e.code === "http_401" || e.code === "http_400") break;
    }
  }
  await deps.store.fail(job.batchId, lastCode, lastRun);
  return { status: "failed", code: lastCode, tries };
}
