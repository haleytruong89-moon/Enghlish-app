/**
 * Framework-free handlers of the curriculum routes (W2). Same order everywhere: requireAccess FIRST (401 / 404 outside scope / 403 wrong
 * role), then the body (400), then the injectable store (service-role functions that check the actor again). A tutor never receives the
 * AI cost (Studio rule). Stored file paths never leave the server. Approving is the child's tutor only (D-W8): a parent gets 403.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser, type Action } from "@/lib/auth/requireAccess";
import { parseGate, refusalStatus } from "@/lib/ai/cap";
import type { CallOptions, ToolCall, ToolResult } from "@/lib/ai/request";
import { apiErrors } from "@/lib/copy/vi";
import type { PointHook } from "@/lib/engine/points/runner";
import { ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { buildPath, checkFile, type AllowedMime } from "@/lib/storage/rules";
import type { FileDownloader, FileStorage } from "@/lib/storage/types";
import { overPageLimit } from "@/lib/storage/serverPages";
import { FILE_ERRORS, verifyStoredFile } from "@/lib/storage/verify";
import type { RunLog } from "@/lib/studio/extract";
import { sameInstant } from "@/lib/studio/instant";
import type { TocContext } from "./context";
import { editStats } from "./editStats";
import { runTocExtraction, type TocExtractStore } from "./extract";
import {
  addVersionBodySchema, approveCurriculumBodySchema, createCurriculumBodySchema, editCurriculumBodySchema, saveCurriculumBodySchema, tocUploadBodySchema,
  unitStatusBodySchema, type CurriculumPayload, type FileMeta,
} from "./schema";
import { parseVersion, type VersionPageData } from "./shape";
import { finalUnits, rowsToResolve, validateCurriculum } from "./validate";

export interface CurriculumStore {
  getCurriculum(curriculumId: string): Promise<{ learner_id: string; title: string; level_note: string | null } | null>;
  getVersionLearnerId(versionId: string): Promise<string | null>;
  issueUploadTicket(a: { learnerId: string; byMemberId: string }): Promise<unknown>;
  aiGate(learnerId: string): Promise<unknown>;
  aiReserve(a: { learnerId: string; estimateUsd: number; versionId: string; model: string; byMemberId: string }): Promise<unknown>;
  logAiRun(r: RunLog): Promise<string>;
  create(a: { learnerId: string; title: string; levelNote: string | null; tocFile: FileMeta | null; extract: boolean; byMemberId: string; clientId: string }): Promise<unknown>;
  addVersion(a: { curriculumId: string; tocFile: FileMeta | null; extract: boolean; byMemberId: string; clientId: string }): Promise<unknown>;
  edit(a: { curriculumId: string; byMemberId: string; clientId: string }): Promise<unknown>;
  /** {version: row, curriculum: row, ai_cost_usd} */
  version(versionId: string): Promise<unknown>;
  save(a: { versionId: string; payload: CurriculumPayload; base: string; byMemberId: string }): Promise<unknown>;
  finish(a: { versionId: string; payload: CurriculumPayload; runId: string }): Promise<unknown>;
  fail(a: { versionId: string; errorCode: string; runId: string | null }): Promise<unknown>;
  discard(a: { versionId: string; byMemberId: string }): Promise<unknown>;
  approve(a: { versionId: string; base: string; units: unknown; review: unknown; byMemberId: string }): Promise<unknown>;
  setUnitStatus(a: { curriculumId: string; unitCode: string; status: string; lessonNoteId: string | null; byMemberId: string; clientId: string }): Promise<unknown>;
}

export type CurriculumAi = { call: (c: ToolCall, o?: CallOptions) => Promise<ToolResult>; model: string; toolChoice: "tool" | "auto"; prompt: { text: string; version: string } };
export type CurriculumDeps = {
  user: AccessUser;
  store: CurriculumStore;
  storage: FileStorage & FileDownloader;
  access?: Partial<AccessDeps>;
  /** Runs work after the answer was sent (Next `after()` in the route; tests collect the jobs). */
  schedule: (job: () => Promise<void>) => void;
  /** The closed list of a learner (lib/curriculum/load.ts). */
  loadContext: (learnerId: string, trackId: string) => Promise<TocContext>;
  getAi: () => CurriculumAi;
  /** After an approved version or a Unit status change: recompute the child's knowledge points (W3). Fail-soft. */
  afterPoints?: PointHook;
  log?: (err: unknown) => Promise<void>;
  newId?: () => string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type FailStatus = 400 | 401 | 403 | 404 | 409 | 429;
const fail = (status: FailStatus, error: string, extra: Record<string, unknown> = {}): HandlerResult => ({ status, body: { error, message: apiErrors[status], ...extra } });
type Guard = { ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult };

async function guard(deps: CurriculumDeps, learnerId: string, action: Action): Promise<Guard> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}
async function guardVersion(deps: CurriculumDeps, versionId: string, action: Action): Promise<Guard> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(versionId)) return { ok: false, result: fail(404, "not_found") };
  const learnerId = await deps.store.getVersionLearnerId(versionId);
  if (!learnerId) return { ok: false, result: fail(404, "not_found") };
  return guard(deps, learnerId, action);
}
async function guardCurriculum(deps: CurriculumDeps, curriculumId: string, action: Action): Promise<(Guard & { ok: true; book: { title: string; levelNote: string | null } }) | { ok: false; result: HandlerResult }> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(curriculumId)) return { ok: false, result: fail(404, "not_found") };
  const c = await deps.store.getCurriculum(curriculumId);
  if (!c) return { ok: false, result: fail(404, "not_found") };
  const g = await guard(deps, c.learner_id, action);
  return g.ok ? { ...g, book: { title: c.title, levelNote: c.level_note } } : g;
}

/** Database errors → HTTP. The "(tag)" at the end of a message becomes the error code the screens explain (curriculumErrors in vi.ts). */
export function fromCurriculumDbError(err: unknown): HandlerResult {
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

const extractStoreOf = (s: CurriculumStore): TocExtractStore => ({
  gate: async (l) => parseGate(await s.aiGate(l)),
  reserve: async (a) => parseGate(await s.aiReserve(a)),
  logRun: (r) => s.logAiRun(r),
  finish: async (versionId, payload, runId) => (await s.finish({ versionId, payload, runId })) as { applied: boolean },
  fail: async (versionId, errorCode, runId) => (await s.fail({ versionId, errorCode, runId })) as { applied: boolean },
});

/** Shared by "Thêm giáo trình" and "Nạp mục lục": file checks, AI gate, then the background job when the version is 'extracting'. */
async function startVersion(
  deps: CurriculumDeps,
  grant: AccessGrant,
  body: { mode: "ai" | "manual"; toc_file: FileMeta | null },
  write: () => Promise<{ versionId: string; status: string; replayed: boolean; extra: Record<string, unknown> }>,
  book: { title: string; levelNote: string | null },
): Promise<HandlerResult> {
  const { learner, member } = grant;
  if (body.mode === "ai" && !body.toc_file) return fail(400, "toc_file_required");
  const owner = { familyId: learner.familyId, learnerId: learner.id };
  if (body.toc_file) {
    const bad = await verifyStoredFile(deps.storage, owner, "curriculum_toc", { id: body.toc_file.id, mime: body.toc_file.mime as AllowedMime, bytes: body.toc_file.bytes });
    if (bad) return fail(400, bad);
  }
  if (body.mode === "ai" && (await overPageLimit(deps, owner, "toc", body.toc_file, null))) return fail(400, "pages_too_long");
  let ctx: TocContext | null = null;
  if (body.mode === "ai") {
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
  let made: Awaited<ReturnType<typeof write>>;
  try {
    made = await write();
  } catch (err) {
    return fromCurriculumDbError(err);
  }
  if (made.status === "extracting" && !made.replayed && ctx && body.toc_file) {
    const ai = deps.getAi();
    const context = ctx;
    const job = {
      versionId: made.versionId, familyId: learner.familyId, learnerId: learner.id, byMemberId: member.id,
      tocPath: buildPath({ ...owner, fileId: body.toc_file.id, mime: body.toc_file.mime as AllowedMime }), book,
    };
    deps.schedule(async () => {
      try {
        await runTocExtraction(
          { store: extractStoreOf(deps.store), download: (p) => deps.storage.download(p), context: async () => context, call: ai.call, model: ai.model, toolChoice: ai.toolChoice, prompt: ai.prompt },
          job,
        );
      } catch (err) {
        await deps.log?.(err);
        await deps.store.fail({ versionId: made.versionId, errorCode: "ai_failed", runId: null }).catch(() => undefined);
      }
    });
  }
  return { status: made.replayed ? 200 : 201, body: { version_id: made.versionId, status: made.status, ...made.extra } };
}

// ---- Files -----------------------------------------------------------------------------------------------------------------------
export async function handleTocUploadUrl(deps: CurriculumDeps, learnerId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = tocUploadBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const c = checkFile("curriculum_toc", p.data.mime, p.data.bytes);
  if (!c.ok) return fail(400, FILE_ERRORS[c.reason]);
  try {
    await deps.store.issueUploadTicket({ learnerId: g.grant.learner.id, byMemberId: g.grant.member.id });
  } catch (err) {
    return fromCurriculumDbError(err);
  }
  const fileId = (deps.newId ?? (() => crypto.randomUUID()))();
  const mime = p.data.mime as AllowedMime;
  const { url } = await deps.storage.createUpload(buildPath({ familyId: g.grant.learner.familyId, learnerId: g.grant.learner.id, fileId, mime }));
  return { status: 201, body: { file_id: fileId, upload_url: url, mime } };
}

// ---- Curricula and versions ------------------------------------------------------------------------------------------------------
export async function handleCreateCurriculum(deps: CurriculumDeps, learnerId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = createCurriculumBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const b = p.data;
  const levelNote = b.level_note && b.level_note.length > 0 ? b.level_note : null;
  return startVersion(deps, g.grant, b, async () => {
    const r = (await deps.store.create({
      learnerId: g.grant.learner.id, title: b.title, levelNote, tocFile: b.toc_file, extract: b.mode === "ai", byMemberId: g.grant.member.id, clientId: b.client_id,
    })) as { curriculum_id: string; version_id: string; status: string; replayed: boolean };
    return { versionId: r.version_id, status: r.status, replayed: r.replayed, extra: { curriculum_id: r.curriculum_id } };
  }, { title: b.title, levelNote });
}

export async function handleAddVersion(deps: CurriculumDeps, curriculumId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardCurriculum(deps, curriculumId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = addVersionBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const b = p.data;
  return startVersion(deps, g.grant, b, async () => {
    const r = (await deps.store.addVersion({ curriculumId, tocFile: b.toc_file, extract: b.mode === "ai", byMemberId: g.grant.member.id, clientId: b.client_id })) as {
      version_id: string; status: string; replayed: boolean;
    };
    return { versionId: r.version_id, status: r.status, replayed: r.replayed, extra: {} };
  }, g.book);
}

export async function handleEditCurriculum(deps: CurriculumDeps, curriculumId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardCurriculum(deps, curriculumId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = editCurriculumBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.edit({ curriculumId, byMemberId: g.grant.member.id, clientId: p.data.client_id })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { version_id: r.id } };
  } catch (err) {
    return fromCurriculumDbError(err);
  }
}

export async function handleGetVersion(deps: CurriculumDeps, versionId: string, opts: { view?: "status" } = {}): Promise<HandlerResult> {
  const g = await guardVersion(deps, versionId, "curriculum:read");
  if (!g.ok) return g.result;
  const showCost = g.grant.member.role === "parent";
  let view = parseVersion(await deps.store.version(versionId), { showCost });
  if (view.stale) {
    await deps.store.fail({ versionId, errorCode: "timeout", runId: null });
    view = parseVersion(await deps.store.version(versionId), { showCost });
  }
  if (opts.view === "status") return { status: 200, body: { status: view.status, error_code: view.errorCode } };
  const context = await deps.loadContext(g.grant.learner.id, g.grant.learner.trackId);
  const issues = validateCurriculum(view.payload, context);
  const toResolve = rowsToResolve(issues);
  const body: VersionPageData = {
      version: view,
      track_id: g.grant.learner.trackId,
      context,
      issues,
      rows_to_resolve: toResolve,
      can_approve: view.status === "draft" && toResolve === 0 && g.grant.member.role === "tutor",
      is_tutor: g.grant.member.role === "tutor",
      stats: view.status === "draft" ? editStats(view.aiPayload, view.payload) : (view.review?.stats ?? null),
  };
  return { status: 200, body };
}

export async function handleSaveVersion(deps: CurriculumDeps, versionId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardVersion(deps, versionId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = saveCurriculumBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.save({ versionId, payload: p.data.payload, base: p.data.base_updated_at, byMemberId: g.grant.member.id })) as { updated_at: string };
    return { status: 200, body: { updated_at: r.updated_at } };
  } catch (err) {
    return fromCurriculumDbError(err);
  }
}

export async function handleApproveVersion(deps: CurriculumDeps, versionId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardVersion(deps, versionId, "curriculum:approve");
  if (!g.ok) return g.result.status === 403 ? fail(403, "tutor_only") : g.result;
  const p = approveCurriculumBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  const view = parseVersion(await deps.store.version(versionId), { showCost: false });
  if (!sameInstant(view.updatedAt, p.data.base_updated_at)) return fail(409, "draft_changed");
  if (view.status !== "draft") return fail(400, "not_draft");
  const issues = validateCurriculum(view.payload, await deps.loadContext(g.grant.learner.id, g.grant.learner.trackId));
  if (rowsToResolve(issues) > 0) return fail(400, "blocked", { issues: issues.filter((i) => i.blocking) });
  const review = { stats: editStats(view.aiPayload, view.payload), quality: p.data.quality, quality_note: p.data.quality_note || null };
  try {
    const r = (await deps.store.approve({ versionId, base: view.updatedAt, units: finalUnits(view.payload), review, byMemberId: g.grant.member.id })) as { version: number; units: number };
    await deps.afterPoints?.(g.grant.learner.id, null);
    return { status: 200, body: { version: r.version, units: r.units } };
  } catch (err) {
    return fromCurriculumDbError(err);
  }
}

export async function handleDiscardVersion(deps: CurriculumDeps, versionId: string): Promise<HandlerResult> {
  const g = await guardVersion(deps, versionId, "curriculum:write");
  if (!g.ok) return g.result;
  try {
    return { status: 200, body: await deps.store.discard({ versionId, byMemberId: g.grant.member.id }) };
  } catch (err) {
    return fromCurriculumDbError(err);
  }
}

// ---- Unit status -------------------------------------------------------------------------------------------------------------------
export async function handleSetUnitStatus(deps: CurriculumDeps, curriculumId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guardCurriculum(deps, curriculumId, "curriculum:write");
  if (!g.ok) return g.result;
  const p = unitStatusBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.setUnitStatus({
      curriculumId, unitCode: p.data.unit_code, status: p.data.status, lessonNoteId: p.data.lesson_note_id, byMemberId: g.grant.member.id, clientId: p.data.client_id,
    })) as { id: string; replayed: boolean };
    if (!r.replayed) await deps.afterPoints?.(g.grant.learner.id, null);
    return { status: r.replayed ? 200 : 201, body: { id: r.id } };
  } catch (err) {
    return fromCurriculumDbError(err);
  }
}
