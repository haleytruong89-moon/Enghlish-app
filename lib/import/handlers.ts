/**
 * Framework-free handlers of "Nạp bài đã làm" (W3). Same order everywhere: requireAccess FIRST (401 / 404 outside scope / 403 wrong role), then
 * the body (400), then the injectable store (service-role functions that check the actor again). A tutor or a parent uploads and starts the AI
 * read; ONLY the child's tutor confirms the result (R8). The AI is asked only after the gate says yes; without AI nothing is created (the screen
 * says why). Stored file paths and AI cost never leave the server. The student never sees any of this.
 */
import { createHash } from "node:crypto";
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser, type Action } from "@/lib/auth/requireAccess";
import { parseGate, refusalStatus } from "@/lib/ai/cap";
import type { CallOptions, ToolCall, ToolResult } from "@/lib/ai/request";
import { apiErrors } from "@/lib/copy/vi";
import type { EngineHook } from "@/lib/engine/runner";
import type { PointHook } from "@/lib/engine/points/runner";
import { ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { buildPath, checkFile, type AllowedMime } from "@/lib/storage/rules";
import type { FileDownloader, FileStorage } from "@/lib/storage/types";
import { FILE_ERRORS, verifyStoredFile } from "@/lib/storage/verify";
import type { RunLog } from "@/lib/studio/extract";
import { sameInstant } from "@/lib/studio/instant";
import { buildImport } from "./build";
import type { ReadContext } from "./context";
import { runReadExtraction, type ReadExtractStore } from "./extract";
import { confirmImportBodySchema, createImportBodySchema, importUploadBodySchema, retryImportBodySchema, type FileMeta } from "./schema";
import { parseImport, type ImportPageData } from "./shape";
import type { ReadPayload } from "./types";

export interface ImportStore {
  getImportLearnerId(batchId: string): Promise<string | null>;
  issueUploadTicket(a: { learnerId: string; byMemberId: string }): Promise<unknown>;
  aiGate(learnerId: string): Promise<unknown>;
  aiReserve(a: { learnerId: string; estimateUsd: number; batchId: string; model: string; byMemberId: string }): Promise<unknown>;
  logAiRun(r: RunLog): Promise<string>;
  create(a: {
    learnerId: string; title: string; workFile: FileMeta; keyFile: FileMeta; takenOn: string; supportLevel: string; sourceHash: string; allowOther: boolean;
    byMemberId: string; clientId: string; manual: boolean;
  }): Promise<unknown>;
  /** The two stored files of a batch (server only: paths never leave the server). */
  files(batchId: string): Promise<{ work: { path: string; mime: string }; key: { path: string; mime: string } } | null>;
  /** english.eng_import_pending: unfinished imports of the children this member may manage. */
  pending(a: { byMemberId: string; allowReal: boolean }): Promise<unknown>;
  /** english.eng_retry_import_read: ai_failed → reading (retry) or → draft (manual). */
  retry(a: { batchId: string; to: "reading" | "draft"; byMemberId: string }): Promise<unknown>;
  /** english.eng_import_batch (one row as jsonb). */
  batch(batchId: string): Promise<unknown>;
  finish(a: { batchId: string; payload: ReadPayload; runId: string }): Promise<unknown>;
  fail(a: { batchId: string; errorCode: string; runId: string | null }): Promise<unknown>;
  discard(a: { batchId: string; byMemberId: string }): Promise<unknown>;
  confirm(a: { batchId: string; base: string; build: unknown; byMemberId: string; clientId: string }): Promise<unknown>;
}

export type ImportAi = { call: (c: ToolCall, o?: CallOptions) => Promise<ToolResult>; model: string; toolChoice: "tool" | "auto"; prompt: { text: string; version: string } };
export type ImportDeps = {
  user: AccessUser;
  store: ImportStore;
  storage: FileStorage & FileDownloader;
  access?: Partial<AccessDeps>;
  /** Runs work after the answer was sent (Next `after()` in the route; tests collect the jobs). */
  schedule: (job: () => Promise<void>) => void;
  /** The closed list of a learner (lib/import/load.ts). */
  loadContext: (learnerId: string, trackId: string) => Promise<ReadContext>;
  getAi: () => ImportAi;
  docxToText: (bytes: Uint8Array) => Promise<string>;
  /** After a confirmed import: recompute the child's points (W3) and skills (S7a). Fail-soft hooks; the confirmation already succeeded. */
  afterPoints?: PointHook;
  afterSkills?: EngineHook;
  log?: (err: unknown) => Promise<void>;
  newId?: () => string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type FailStatus = 400 | 401 | 403 | 404 | 409 | 429;
const fail = (status: FailStatus, error: string, extra: Record<string, unknown> = {}): HandlerResult => ({ status, body: { error, message: apiErrors[status], ...extra } });
type Guard = { ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult };

async function guard(deps: ImportDeps, learnerId: string, action: Action): Promise<Guard> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}
async function guardImport(deps: ImportDeps, batchId: string, action: Action): Promise<Guard> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(batchId)) return { ok: false, result: fail(404, "not_found") };
  const learnerId = await deps.store.getImportLearnerId(batchId);
  if (!learnerId) return { ok: false, result: fail(404, "not_found") };
  return guard(deps, learnerId, action);
}

/** Database errors → HTTP. The "(tag)" at the end of a message becomes the error code the screens explain (importErrors in vi.ts). */
export function fromImportDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    const tag = /\(([a-z_]+)\)\s*$/.exec(err.detail)?.[1] ?? null;
    switch (err.code) {
      case "42501":
        return fail(403, tag === "tutor_only" ? "tutor_only" : "forbidden");
      case "P0002":
        return fail(404, "not_found");
      case "23505":
        return fail(409, tag ?? "conflict");
      case "54000":
        return fail(429, "upload_limit");
      case "23514":
      case "22023":
      case "22004":
      case "22P02":
        return fail(400, tag ?? "invalid");
    }
  }
  throw err;
}

const extractStoreOf = (s: ImportStore): ReadExtractStore => ({
  gate: async (l) => parseGate(await s.aiGate(l)),
  reserve: async (a) => parseGate(await s.aiReserve(a)),
  logRun: (r) => s.logAiRun(r),
  finish: async (batchId, payload, runId) => (await s.finish({ batchId, payload, runId })) as { applied: boolean },
  fail: async (batchId, errorCode, runId) => (await s.fail({ batchId, errorCode, runId })) as { applied: boolean },
});

// ---- Files -----------------------------------------------------------------------------------------------------------------------
export async function handleImportUploadUrl(deps: ImportDeps, learnerId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "import:upload");
  if (!g.ok) return g.result;
  const p = importUploadBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const c = checkFile(p.data.purpose, p.data.mime, p.data.bytes);
  if (!c.ok) return fail(400, FILE_ERRORS[c.reason]);
  try {
    await deps.store.issueUploadTicket({ learnerId: g.grant.learner.id, byMemberId: g.grant.member.id });
  } catch (err) {
    return fromImportDbError(err);
  }
  const fileId = (deps.newId ?? (() => crypto.randomUUID()))();
  const mime = p.data.mime as AllowedMime;
  const { url } = await deps.storage.createUpload(buildPath({ familyId: g.grant.learner.familyId, learnerId: g.grant.learner.id, fileId, mime }));
  return { status: 201, body: { file_id: fileId, upload_url: url, mime } };
}

type ReadJobInput = Parameters<typeof runReadExtraction>[1];
/** Schedule the background AI read of one batch (shared by create and retry). Any crash marks the batch ai_failed. */
function startRead(deps: ImportDeps, job: ReadJobInput, context: ReadContext, ai: ImportAi): void {
  deps.schedule(async () => {
    try {
      await runReadExtraction(
        {
          store: extractStoreOf(deps.store), download: (path) => deps.storage.download(path), docxToText: deps.docxToText, context: async () => context,
          call: ai.call, model: ai.model, toolChoice: ai.toolChoice, prompt: ai.prompt,
        },
        job,
      );
    } catch (err) {
      await deps.log?.(err);
      await deps.store.fail({ batchId: job.batchId, errorCode: "ai_failed", runId: null }).catch(() => undefined);
    }
  });
}

// ---- Create (+ the background read) ----------------------------------------------------------------------------------------------
export async function handleCreateImport(deps: ImportDeps, learnerId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "import:upload");
  if (!g.ok) return g.result;
  const p = createImportBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const b = p.data;
  const { learner, member } = g.grant;
  const owner = { familyId: learner.familyId, learnerId: learner.id };
  for (const [kind, f] of [["import_work", b.work_file], ["import_key", b.key_file]] as const) {
    const bad = await verifyStoredFile(deps.storage, owner, kind, { id: f.id, mime: f.mime as AllowedMime, bytes: f.bytes });
    if (bad) return fail(400, bad);
  }
  // The "same paper again?" fingerprint is what the browser computed. The file went straight to storage, so check it against the stored bytes:
  // a wrong or forged hash would otherwise defeat (or abuse) the duplicate check.
  const stored = await deps.storage.download(buildPath({ ...owner, fileId: b.work_file.id, mime: b.work_file.mime as AllowedMime })).catch(() => null);
  if (!stored || createHash("sha256").update(stored).digest("hex") !== b.source_hash) return fail(400, "bad_hash");
  const manual = b.manual === true;
  // Without "Soạn tay" the AI is the only way to read the paper: no AI (off, no consent, cap) → nothing is created and the screen says why
  // (and offers "Soạn tay"). A manual import never calls the AI and never needs the gate.
  if (!manual) {
    const gate = parseGate(await deps.store.aiGate(learner.id));
    if (!gate.allowed && gate.reason) {
      await deps.store.logAiRun({
        familyId: learner.familyId, draftId: null, model: null, promptVersion: null, inputTokens: 0, outputTokens: 0, costUsd: 0,
        status: refusalStatus(gate.reason), errorCode: gate.reason, byMemberId: member.id, releasesRunId: null,
      });
      return fail(409, `ai_${gate.reason}`);
    }
  }
  const context = manual ? null : await deps.loadContext(learner.id, learner.trackId); // read in the request: the background job has no session
  let made: { id: string; status: string; replayed: boolean };
  try {
    made = (await deps.store.create({
      learnerId: learner.id, title: b.title, workFile: b.work_file, keyFile: b.key_file, takenOn: b.taken_on, supportLevel: b.support_level,
      sourceHash: b.source_hash, allowOther: b.allow_other ?? false, byMemberId: member.id, clientId: b.client_id, manual,
    })) as { id: string; status: string; replayed: boolean };
  } catch (err) {
    return fromImportDbError(err);
  }
  if (made.status === "reading" && !made.replayed && context) {
    const ai = deps.getAi();
    startRead(deps, {
      batchId: made.id, familyId: learner.familyId, learnerId: learner.id, byMemberId: member.id,
      workFile: { path: buildPath({ ...owner, fileId: b.work_file.id, mime: b.work_file.mime as AllowedMime }), mime: b.work_file.mime },
      keyFile: { path: buildPath({ ...owner, fileId: b.key_file.id, mime: b.key_file.mime as AllowedMime }), mime: b.key_file.mime },
    }, context, ai);
  }
  return { status: made.replayed ? 200 : 201, body: { import_id: made.id, status: made.status } };
}

// ---- Read one / status -----------------------------------------------------------------------------------------------------------
export async function handleGetImport(deps: ImportDeps, batchId: string, opts: { view?: "status" } = {}): Promise<HandlerResult> {
  const g = await guardImport(deps, batchId, "import:upload");
  if (!g.ok) return g.result;
  let view = parseImport(await deps.store.batch(batchId));
  if (view.stale) {
    await deps.store.fail({ batchId, errorCode: "timeout", runId: null });
    view = parseImport(await deps.store.batch(batchId));
  }
  if (opts.view === "status") return { status: 200, body: { status: view.status, error_code: view.errorCode } };
  const context = await deps.loadContext(g.grant.learner.id, g.grant.learner.trackId);
  const body: ImportPageData = {
    import: view,
    context: { tags: context.tags.map((t) => ({ key: t.key, label: t.label, domain: t.domain, group: t.group, reading: t.reading })) },
    is_tutor: g.grant.member.role === "tutor",
  };
  return { status: 200, body };
}

// ---- After a failed read: "Thử lại" (same batch, no duplicate) or "Soạn tay" (empty draft) ---------------------------------------------
export async function handleRetryImport(deps: ImportDeps, batchId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardImport(deps, batchId, "import:upload");
  if (!g.ok) return g.result;
  const p = retryImportBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  let view = parseImport(await deps.store.batch(batchId));
  if (view.stale) {
    await deps.store.fail({ batchId, errorCode: "timeout", runId: null });
    view = parseImport(await deps.store.batch(batchId));
  }
  if (view.status !== "ai_failed") return fail(409, "not_failed");
  const { learner, member } = g.grant;
  let context: ReadContext | null = null;
  if (p.data.mode === "retry") {
    const gate = parseGate(await deps.store.aiGate(learner.id));
    if (!gate.allowed && gate.reason) return fail(409, `ai_${gate.reason}`);
    context = await deps.loadContext(learner.id, learner.trackId);
  }
  try {
    const r = (await deps.store.retry({ batchId, to: p.data.mode === "retry" ? "reading" : "draft", byMemberId: member.id })) as { status: string; applied: boolean };
    if (r.applied && p.data.mode === "retry" && context) {
      const files = await deps.store.files(batchId);
      if (!files) {
        // The batch is already "reading": do not leave it there for the stale timer; say that the files are missing.
        await deps.store.fail({ batchId, errorCode: "file_missing", runId: null }).catch(() => {});
        return fail(404, "not_found");
      }
      startRead(deps, { batchId, familyId: learner.familyId, learnerId: learner.id, byMemberId: member.id, workFile: files.work, keyFile: files.key }, context, deps.getAi());
    }
    return { status: 200, body: { import_id: batchId, status: r.status } };
  } catch (err) {
    return fromImportDbError(err);
  }
}

// ---- Confirm (the child's tutor only) --------------------------------------------------------------------------------------------
export async function handleConfirmImport(deps: ImportDeps, batchId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardImport(deps, batchId, "import:confirm");
  if (!g.ok) return g.result.status === 403 ? fail(403, "tutor_only") : g.result;
  const p = confirmImportBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const view = parseImport(await deps.store.batch(batchId));
  if (view.status === "confirmed" && view.templateId) return { status: 200, body: { template_id: view.templateId, replayed: true } };
  if (view.status !== "draft") return fail(400, "not_draft");
  if (!sameInstant(view.updatedAt, p.data.base_updated_at)) return fail(409, "draft_changed");
  const context = await deps.loadContext(g.grant.learner.id, g.grant.learner.trackId);
  const built = buildImport(p.data.rows, context);
  if (!built.ok) return fail(400, built.error);
  try {
    const r = (await deps.store.confirm({ batchId, base: view.updatedAt, build: built.build, byMemberId: g.grant.member.id, clientId: p.data.client_id })) as {
      template_id: string; attempt_id: string; counted: number; tags: string[]; replayed: boolean;
    };
    if (!r.replayed) {
      await deps.afterPoints?.(g.grant.learner.id, r.tags);
      await deps.afterSkills?.(g.grant.learner.id, null);
    }
    return { status: r.replayed ? 200 : 201, body: { template_id: r.template_id, counted: r.counted, replayed: r.replayed } };
  } catch (err) {
    return fromImportDbError(err);
  }
}

// ---- Discard (tutor or parent) ---------------------------------------------------------------------------------------------------
export async function handleDiscardImport(deps: ImportDeps, batchId: string): Promise<HandlerResult> {
  const g = await guardImport(deps, batchId, "import:upload");
  if (!g.ok) return g.result;
  try {
    return { status: 200, body: await deps.store.discard({ batchId, byMemberId: g.grant.member.id }) };
  } catch (err) {
    return fromImportDbError(err);
  }
}
