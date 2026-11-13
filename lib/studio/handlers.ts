/**
 * Framework-free handlers of the Studio B1 routes. Same order everywhere: requireAccess / requireStaff FIRST (401 / 404 outside scope /
 * 403 wrong role), then the body (400), then the injectable stores (service-role functions that check the actor again). A tutor never
 * receives AI cost or the month's spend (spec §7). Stored file paths never leave the server.
 */
import { sameInstant } from "./instant";
import { AccessError, requireAccess, requireStaff, type AccessDeps, type AccessGrant, type AccessUser, type Action, type Member } from "@/lib/auth/requireAccess";
import { parseGate, refusalStatus } from "@/lib/ai/cap";
import { AI_NOTICE_VERSION } from "@/lib/ai/config";
import type { CallOptions, ToolCall, ToolResult } from "@/lib/ai/request";
import { apiErrors } from "@/lib/copy/vi";
import type { EngineHook } from "@/lib/engine/runner";
import { allowRealLearners } from "@/lib/env";
import { ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { buildPath, checkFile, type AllowedMime, type FileKind } from "@/lib/storage/rules";
import type { FileDownloader, FileStorage } from "@/lib/storage/types";
import { overPageLimit } from "@/lib/storage/serverPages";
import { FILE_ERRORS, verifyStoredFile } from "@/lib/storage/verify";
import { buildStudioBuild } from "./buildTemplate";
import type { StudioContext } from "./context";
import { runExtraction, type ExtractStore, type RunLog } from "./extract";
import {
  aiSettingsBodySchema, approveBodySchema, assignStudioBodySchema, createDraftBodySchema, decideBodySchema, editBodySchema, saveDraftBodySchema,
  studioUploadBodySchema, type FileMetaBody,
} from "./requests";
import type { StudioDraft } from "./schema";
import { parseAiSettings, parseDraft, parseDraftList, parsePending } from "./shape";
import { summarizeDraft } from "./summary";
import { blockingIssues, validateDraft } from "./validate";

export interface StudioStore {
  getDraftLearnerId(draftId: string): Promise<string | null>;
  getAttemptLearnerId(attemptId: string): Promise<string | null>;
  issueUploadTicket(a: { learnerId: string; byMemberId: string }): Promise<unknown>;
  aiGate(learnerId: string): Promise<unknown>;
  aiReserve(a: { learnerId: string; estimateUsd: number; draftId: string; model: string; byMemberId: string }): Promise<unknown>;
  aiSettings(byMemberId: string): Promise<unknown>;
  setAiSettings(a: { enabled: boolean; noticeVersion: string; byMemberId: string }): Promise<unknown>;
  logAiRun(r: RunLog): Promise<string>;
  createDraft(a: { learnerId: string; title: string; testFile: FileMetaBody | null; keyFile: FileMetaBody | null; extract: boolean; byMemberId: string; clientId: string }): Promise<unknown>;
  editDraft(a: { draftId: string; byMemberId: string; clientId: string }): Promise<unknown>;
  draft(draftId: string): Promise<unknown>;
  drafts(learnerId: string): Promise<unknown>;
  saveDraft(a: { draftId: string; title: string; payload: StudioDraft; base: string; byMemberId: string }): Promise<unknown>;
  finishExtraction(a: { draftId: string; payload: StudioDraft; runId: string }): Promise<unknown>;
  failExtraction(a: { draftId: string; errorCode: string; runId: string | null }): Promise<unknown>;
  discardDraft(a: { draftId: string; byMemberId: string }): Promise<unknown>;
  approveDraft(a: { draftId: string; base: string; build: unknown; byMemberId: string }): Promise<unknown>;
  assign(a: { draftId: string; startOn: string; dueOn: string; byMemberId: string; clientId: string }): Promise<unknown>;
  pending(a: { byMemberId: string; allowReal: boolean }): Promise<unknown>;
  /** Writes the Kết quả bài of submitted Studio attempts that have no pending item and no result yet (idempotent; returns how many). */
  retryResults(a: { byMemberId: string; allowReal: boolean }): Promise<unknown>;
  decide(a: { attemptId: string; items: { item_id: string; result: string }[]; byMemberId: string; clientId: string }): Promise<unknown>;
}

export type StudioAi = { call: (c: ToolCall, o?: CallOptions) => Promise<ToolResult>; model: string; toolChoice: "tool" | "auto"; prompt: { text: string; version: string } };
export type StudioDeps = {
  user: AccessUser;
  store: StudioStore;
  storage: FileStorage & FileDownloader;
  access?: Partial<AccessDeps>;
  /** Runs work after the answer was sent (Next `after()` in the route; tests collect the jobs). */
  schedule: (job: () => Promise<void>) => void;
  /** Tags (± 1 level), reading tags and skills of a learner (lib/studio/load.ts). */
  loadContext: (learnerId: string, trackId: string) => Promise<StudioContext>;
  /** Built only when a route needs the AI (reads the prompt file). */
  getAi: () => StudioAi;
  docxToText: (bytes: Uint8Array) => Promise<string>;
  afterWrite?: EngineHook;
  log?: (err: unknown) => Promise<void>;
  newId?: () => string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type FailStatus = 400 | 401 | 403 | 404 | 409 | 429;
const fail = (status: FailStatus, error: string, extra: Record<string, unknown> = {}): HandlerResult => ({ status, body: { error, message: apiErrors[status], ...extra } });
type Guard = { ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult };

async function guard(deps: StudioDeps, learnerId: string, action: Action): Promise<Guard> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}
async function guardDraft(deps: StudioDeps, draftId: string, action: Action): Promise<Guard> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(draftId)) return { ok: false, result: fail(404, "not_found") };
  const learnerId = await deps.store.getDraftLearnerId(draftId);
  if (!learnerId) return { ok: false, result: fail(404, "not_found") };
  return guard(deps, learnerId, action);
}
async function staff(deps: StudioDeps): Promise<{ ok: true; member: Member } | { ok: false; result: HandlerResult }> {
  try {
    return { ok: true, member: await requireStaff(deps.user, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** Database errors → HTTP. The "(tag)" at the end of a message becomes the error code the screens explain (lib/copy/vi.ts studioErrors). */
export function fromStudioDbError(err: unknown): HandlerResult {
  if (err instanceof ReviewDbError) {
    const tag = /\(([a-z_]+)\)\s*$/.exec(err.detail)?.[1] ?? null;
    switch (err.code) {
      case "42501":
        return fail(403, tag === "parent_only" ? "parent_only" : "forbidden");
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

const extractStoreOf = (s: StudioStore): ExtractStore => ({
  gate: async (l) => parseGate(await s.aiGate(l)),
  reserve: async (a) => parseGate(await s.aiReserve(a)),
  logRun: (r) => s.logAiRun(r),
  finish: async (draftId, payload, runId) => (await s.finishExtraction({ draftId, payload, runId })) as { applied: boolean },
  fail: async (draftId, errorCode, runId) => (await s.failExtraction({ draftId, errorCode, runId })) as { applied: boolean },
});

// ---- Files ---------------------------------------------------------------------------------------------------------------------
export async function handleStudioUploadUrl(deps: StudioDeps, learnerId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "studio:write");
  if (!g.ok) return g.result;
  const p = studioUploadBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const c = checkFile(p.data.purpose, p.data.mime, p.data.bytes);
  if (!c.ok) return fail(400, FILE_ERRORS[c.reason]);
  try {
    await deps.store.issueUploadTicket({ learnerId: g.grant.learner.id, byMemberId: g.grant.member.id });
  } catch (err) {
    return fromStudioDbError(err);
  }
  const fileId = (deps.newId ?? (() => crypto.randomUUID()))();
  const mime = p.data.mime as AllowedMime;
  const { url } = await deps.storage.createUpload(buildPath({ familyId: g.grant.learner.familyId, learnerId: g.grant.learner.id, fileId, mime }));
  return { status: 201, body: { file_id: fileId, upload_url: url, mime } };
}

// ---- Drafts --------------------------------------------------------------------------------------------------------------------
export async function handleListDrafts(deps: StudioDeps, learnerId: string): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "studio:read");
  if (!g.ok) return g.result;
  return { status: 200, body: { drafts: parseDraftList(await deps.store.drafts(learnerId)) } };
}

export async function handleCreateDraft(deps: StudioDeps, learnerId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "studio:write");
  if (!g.ok) return g.result;
  const p = createDraftBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const b = p.data;
  const { learner, member } = g.grant;
  if (b.mode === "ai" && !b.test_file) return fail(400, "test_file_required");
  const owner = { familyId: learner.familyId, learnerId: learner.id };
  for (const [kind, f] of [["studio_test", b.test_file], ["studio_key", b.key_file]] as [FileKind, FileMetaBody | null][]) {
    if (!f) continue;
    const bad = await verifyStoredFile(deps.storage, owner, kind, { id: f.id, mime: f.mime as AllowedMime, bytes: f.bytes });
    if (bad) return fail(400, bad);
  }
  if (b.mode === "ai" && (await overPageLimit(deps, owner, "studio", b.test_file, b.key_file))) return fail(400, "pages_too_long");
  let ctx: StudioContext | null = null;
  if (b.mode === "ai") {
    const gate = parseGate(await deps.store.aiGate(learner.id));
    if (!gate.allowed && gate.reason) {
      await deps.store.logAiRun({
        familyId: learner.familyId, draftId: null, model: null, promptVersion: null, inputTokens: 0, outputTokens: 0, costUsd: 0,
        status: refusalStatus(gate.reason), errorCode: gate.reason, byMemberId: member.id, releasesRunId: null,
      });
      return fail(409, `ai_${gate.reason}`);
    }
    ctx = await deps.loadContext(learner.id, learner.trackId); // read in the request: the background job has no session
  }
  let made: { id: string; status: string; replayed: boolean };
  try {
    made = (await deps.store.createDraft({
      learnerId: learner.id, title: b.title, testFile: b.test_file, keyFile: b.key_file, extract: b.mode === "ai", byMemberId: member.id, clientId: b.client_id,
    })) as typeof made;
  } catch (err) {
    return fromStudioDbError(err);
  }
  if (made.status === "extracting" && !made.replayed && ctx && b.test_file) {
    const ai = deps.getAi();
    const path = (f: FileMetaBody) => ({ path: buildPath({ ...owner, fileId: f.id, mime: f.mime as AllowedMime }), mime: f.mime });
    const job = {
      draftId: made.id, familyId: learner.familyId, learnerId: learner.id, byMemberId: member.id,
      testFile: path(b.test_file), keyFile: b.key_file ? path(b.key_file) : null,
    };
    const context = ctx;
    deps.schedule(async () => {
      try {
        await runExtraction(
          { store: extractStoreOf(deps.store), download: (p2) => deps.storage.download(p2), docxToText: deps.docxToText, context: async () => context, call: ai.call, model: ai.model, toolChoice: ai.toolChoice, prompt: ai.prompt },
          job,
        );
      } catch (err) {
        await deps.log?.(err);
        await deps.store.failExtraction({ draftId: made.id, errorCode: "ai_failed", runId: null }).catch(() => undefined);
      }
    });
  }
  return { status: made.replayed ? 200 : 201, body: { id: made.id, status: made.status } };
}

export async function handleGetDraft(deps: StudioDeps, draftId: string, opts: { view?: "status" } = {}): Promise<HandlerResult> {
  const g = await guardDraft(deps, draftId, "studio:read");
  if (!g.ok) return g.result;
  const showCost = g.grant.member.role === "parent";
  let { view } = parseDraft(await deps.store.draft(draftId), { showCost });
  if (view.stale) {
    await deps.store.failExtraction({ draftId, errorCode: "timeout", runId: null });
    ({ view } = parseDraft(await deps.store.draft(draftId), { showCost }));
  }
  if (opts.view === "status") return { status: 200, body: { status: view.status, error_code: view.errorCode } };
  const context = await deps.loadContext(g.grant.learner.id, g.grant.learner.trackId);
  const issues = validateDraft(view.payload, context);
  return {
    status: 200,
    body: {
      draft: view,
      context,
      issues,
      summary: summarizeDraft(view.payload, issues),
      can_approve: view.status === "draft" && blockingIssues(issues).length === 0,
      gate: showCost ? parseGate(await deps.store.aiGate(g.grant.learner.id)) : null,
    },
  };
}

export async function handleSaveDraft(deps: StudioDeps, draftId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardDraft(deps, draftId, "studio:write");
  if (!g.ok) return g.result;
  const p = saveDraftBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.saveDraft({ draftId, title: p.data.title, payload: p.data.payload, base: p.data.base_updated_at, byMemberId: g.grant.member.id })) as { updated_at: string };
    return { status: 200, body: { updated_at: r.updated_at } };
  } catch (err) {
    return fromStudioDbError(err);
  }
}

export async function handleApprove(deps: StudioDeps, draftId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardDraft(deps, draftId, "studio:write");
  if (!g.ok) return g.result;
  const p = approveBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const { view } = parseDraft(await deps.store.draft(draftId), { showCost: false });
  if (!sameInstant(view.updatedAt, p.data.base_updated_at)) return fail(409, "draft_changed");
  if (view.status !== "draft") return fail(400, "not_draft");
  const blocking = blockingIssues(validateDraft(view.payload, await deps.loadContext(g.grant.learner.id, g.grant.learner.trackId)));
  if (blocking.length > 0) return fail(400, "blocked", { issues: blocking });
  try {
    const r = (await deps.store.approveDraft({ draftId, base: view.updatedAt, build: buildStudioBuild(view.payload), byMemberId: g.grant.member.id })) as { template_id: string; version: number };
    return { status: 200, body: { template_id: r.template_id, version: r.version } };
  } catch (err) {
    return fromStudioDbError(err);
  }
}

export async function handleAssign(deps: StudioDeps, draftId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardDraft(deps, draftId, "studio:write");
  if (!g.ok) return g.result;
  const p = assignStudioBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.assign({ draftId, startOn: p.data.start_on, dueOn: p.data.due_on, byMemberId: g.grant.member.id, clientId: p.data.client_id })) as { instance_id: string; activity_id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: r };
  } catch (err) {
    return fromStudioDbError(err);
  }
}

export async function handleDiscard(deps: StudioDeps, draftId: string): Promise<HandlerResult> {
  const g = await guardDraft(deps, draftId, "studio:write");
  if (!g.ok) return g.result;
  try {
    return { status: 200, body: await deps.store.discardDraft({ draftId, byMemberId: g.grant.member.id }) };
  } catch (err) {
    return fromStudioDbError(err);
  }
}

export async function handleEditApproved(deps: StudioDeps, draftId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardDraft(deps, draftId, "studio:write");
  if (!g.ok) return g.result;
  const p = editBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.editDraft({ draftId, byMemberId: g.grant.member.id, clientId: p.data.client_id })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id } };
  } catch (err) {
    return fromStudioDbError(err);
  }
}

// ---- AI settings (parent) ----------------------------------------------------------------------------------------------------
export async function handleAiSettings(deps: StudioDeps): Promise<HandlerResult> {
  const s = await staff(deps);
  if (!s.ok) return s.result;
  if (s.member.role !== "parent") return fail(403, "parent_only");
  return { status: 200, body: { settings: parseAiSettings(await deps.store.aiSettings(s.member.id)) } };
}

export async function handleSetAiSettings(deps: StudioDeps, raw: unknown): Promise<HandlerResult> {
  const s = await staff(deps);
  if (!s.ok) return s.result;
  if (s.member.role !== "parent") return fail(403, "parent_only");
  const p = aiSettingsBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  // Preview isolation: with ALLOW_REAL_LEARNERS=false, AI (consent rows, spend) is switched on only for a family of test learners.
  if (p.data.enabled && !(deps.access?.allowRealLearners ?? allowRealLearners())) {
    const current = parseAiSettings(await deps.store.aiSettings(s.member.id));
    if (current.learners.some((l) => !l.isTest)) return fail(409, "real_learners_blocked");
  }
  try {
    return { status: 200, body: { settings: parseAiSettings(await deps.store.setAiSettings({ enabled: p.data.enabled, noticeVersion: AI_NOTICE_VERSION, byMemberId: s.member.id })) } };
  } catch (err) {
    return fromStudioDbError(err);
  }
}

// ---- "Cần thầy/cô xem" -----------------------------------------------------------------------------------------------------------
export async function handlePending(deps: StudioDeps): Promise<HandlerResult> {
  const s = await staff(deps);
  if (!s.ok) return s.result;
  const allowReal = deps.access?.allowRealLearners ?? allowRealLearners();
  await deps.store.retryResults({ byMemberId: s.member.id, allowReal }).catch(async (err: unknown) => deps.log?.(err)); // fail-soft: the inbox must still open
  return { status: 200, body: parsePending(await deps.store.pending({ byMemberId: s.member.id, allowReal })) };
}

export async function handleDecide(deps: StudioDeps, attemptId: string, raw: unknown): Promise<HandlerResult> {
  if (!deps.user?.id) return fail(401, "unauthenticated");
  if (!UUID_RE.test(attemptId)) return fail(404, "not_found");
  const learnerId = await deps.store.getAttemptLearnerId(attemptId);
  if (!learnerId) return fail(404, "not_found");
  const g = await guard(deps, learnerId, "studio:write");
  if (!g.ok) return g.result;
  const p = decideBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  let r: { decided: number; pending: number; result: { recorded: boolean; correct?: number; in_app?: number } };
  try {
    r = (await deps.store.decide({ attemptId, items: p.data.items, byMemberId: g.grant.member.id, clientId: p.data.client_id })) as typeof r;
  } catch (err) {
    return fromStudioDbError(err);
  }
  if (r.decided > 0) await deps.afterWrite?.(learnerId, null);
  return {
    status: 200,
    body: { decided: r.decided, pending: r.pending, result: { recorded: r.result.recorded, correct: r.result.correct ?? null, in_app: r.result.in_app ?? null } },
  };
}
