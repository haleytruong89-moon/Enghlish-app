/**
 * Framework-free handlers of the Studio B1 routes. Same order everywhere: requireAccess / requireStaff FIRST (401 / 404 outside scope /
 * 403 wrong role), then the body (400), then the injectable stores (service-role functions that check the actor again). A tutor never
 * receives AI cost or the month's spend (spec §7). Stored file paths never leave the server.
 */
import { createHash } from "node:crypto";
import { instantMs, sameInstant } from "./instant";
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
  aiSettingsBodySchema, approveBodySchema, assignStudioBodySchema, createDraftBodySchema, decideBodySchema, editBodySchema, importDraftBodySchema, retrySeenBodySchema,
  saveDraftBodySchema, studioUploadBodySchema, type FileMetaBody,
} from "./requests";
import { studioImportFileSchema } from "./importFile";
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
  /** The draft a client id made for this child (id + status), or null. Read-only; used by "Nhập bài soạn sẵn" after a title clash. */
  draftByClientId(a: { learnerId: string; clientId: string }): Promise<{ id: string; status: string } | null>;
  editDraft(a: { draftId: string; byMemberId: string; clientId: string }): Promise<unknown>;
  draft(draftId: string): Promise<unknown>;
  drafts(learnerId: string): Promise<unknown>;
  saveDraft(a: { draftId: string; title: string; payload: StudioDraft; base: string; byMemberId: string }): Promise<unknown>;
  finishExtraction(a: { draftId: string; payload: StudioDraft; runId: string }): Promise<unknown>;
  failExtraction(a: { draftId: string; errorCode: string; runId: string | null }): Promise<unknown>;
  discardDraft(a: { draftId: string; byMemberId: string }): Promise<unknown>;
  approveDraft(a: { draftId: string; base: string; build: unknown; byMemberId: string }): Promise<unknown>;
  /** With Units (0037) the call goes through eng_assign_studio_v3; without, as before (v2 for a test, v1 otherwise). */
  assign(a: { draftId: string; startOn: string; dueOn: string; byMemberId: string; clientId: string; isTest: boolean; units?: { curriculum_id: string; unit_code: string }[] }): Promise<unknown>;
  pending(a: { byMemberId: string; allowReal: boolean }): Promise<unknown>;
  /** Writes the Kết quả bài of submitted Studio attempts that have no pending item and no result yet (idempotent; returns how many). */
  retryResults(a: { byMemberId: string; allowReal: boolean }): Promise<unknown>;
  /** english.eng_mark_retry_seen (0034): the adult has read the child's retries of one attempt (note optional, adult-only). */
  markRetrySeen(a: { attemptId: string; note: string | null; seenThrough: string; byMemberId: string; clientId: string; allowReal: boolean }): Promise<unknown>;
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
export function fromStudioDbError(err: unknown, opts: { /** The error tag when the function is missing (migration 0034 not applied); anything else with a missing function is a real fault. */ missing?: string } = {}): HandlerResult {
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
      case "PGRST202":
      case "42883":
        // Only the calls that name a tag need 0034 (the "Bài kiểm tra" flag, "Đã xem"); a missing function elsewhere is a real fault (rethrown below).
        if (opts.missing) return fail(409, opts.missing);
        break;
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
    const units = p.data.units ?? [];
    const r = (await deps.store.assign({
      draftId, startOn: p.data.start_on, dueOn: p.data.due_on, byMemberId: g.grant.member.id, clientId: p.data.client_id, isTest: p.data.is_test === true,
      ...(units.length > 0 ? { units } : {}),
    })) as { instance_id: string; activity_id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: r };
  } catch (err) {
    // A missing function: v3 (Units, 0037) or v2 (the test flag, 0034) is not applied yet.
    return fromStudioDbError(err, (p.data.units?.length ?? 0) > 0 ? { missing: "units_need_update" } : p.data.is_test === true ? { missing: "needs_update" } : {});
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

// ---- Nhập bài soạn sẵn (a draft made outside the app; no AI, no SQL) -------------------------------------------------------
/** A file imported, discarded and imported again gets a fresh draft under `imp-<hash>-<k>`; after this many the server stops. */
export const IMPORT_MAX_TRIES = 9;

export async function handleImportDraft(deps: StudioDeps, learnerId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "studio:write");
  if (!g.ok) return g.result;
  const body = importDraftBodySchema.safeParse(raw);
  if (!body.success) return fail(400, "invalid_body");
  const parsed = studioImportFileSchema.safeParse(body.data.file);
  if (!parsed.success) return fail(400, "import_bad_file");
  const file = parsed.data;
  const { learner, member } = g.grant;
  if (file.track !== learner.trackId) return fail(400, "import_wrong_track", { file_track: file.track, learner_track: learner.trackId });
  const issues = validateDraft(file.payload, await deps.loadContext(learner.id, learner.trackId));
  const report = {
    title: file.title,
    items: file.payload.items.length,
    needs_review: file.payload.items.filter((i) => i.needs_review).length,
    blocking: blockingIssues(issues).length,
  };
  // Same content → same client id → eng_create_studio_draft replays the same draft (double click, retry, a second import).
  const hash = createHash("sha256").update(JSON.stringify(file)).digest("hex").slice(0, 32);
  try {
    const r = await createFilled(deps, { learnerId: learner.id, memberId: member.id, title: file.title, payload: file.payload, clientBase: `imp-${hash}` });
    if (r.kind === "renamed") return fail(409, "import_renamed", r.id ? { id: r.id } : {});
    if (r.kind === "too_many") return fail(409, "import_too_many");
    return { status: r.replayed ? 200 : 201, body: { id: r.id, status: r.status, replayed: r.replayed, ...report } };
  } catch (err) {
    return fromStudioDbError(err);
  }
}

type Filled = { kind: "done"; id: string; status: string; replayed: boolean } | { kind: "renamed"; id: string | null } | { kind: "too_many" };

/**
 * A manual draft (no AI) holding `payload`, under client id `<clientBase>` (then `-2` … `-9` when the earlier one was discarded): the same
 * call twice gives the same draft; one that stopped between "create" and "save" is filled now; one the tutor emptied on purpose is left alone.
 */
async function createFilled(
  deps: StudioDeps,
  a: { learnerId: string; memberId: string; title: string; payload: StudioDraft; clientBase: string },
): Promise<Filled> {
  for (let k = 1; k <= IMPORT_MAX_TRIES; k++) {
    const clientId = k === 1 ? a.clientBase : `${a.clientBase}-${k}`;
    let made: { id: string; status: string; replayed: boolean };
    try {
      made = (await deps.store.createDraft({
        learnerId: a.learnerId, title: a.title, testFile: null, keyFile: null, extract: false, byMemberId: a.memberId, clientId,
      })) as typeof made;
    } catch (err) {
      if (dbTag(err) !== "conflict") throw err;
      // The same client id under another title: that draft was renamed since. Discarded → try the next id; else it is the one.
      const old = await deps.store.draftByClientId({ learnerId: a.learnerId, clientId });
      if (old?.status === "discarded") continue;
      return { kind: "renamed", id: old?.id ?? null };
    }
    if (made.replayed && made.status === "discarded") continue;
    const raw = await deps.store.draft(made.id);
    const { view } = parseDraft(raw, { showCost: false });
    if (!(view.status === "draft" && view.payload.items.length === 0 && neverSaved(raw, view.updatedAt))) return { kind: "done", id: made.id, status: view.status, replayed: true };
    try {
      await deps.store.saveDraft({ draftId: made.id, title: a.title, payload: a.payload, base: view.updatedAt, byMemberId: a.memberId });
    } catch (err) {
      if (dbTag(err) !== "draft_changed") throw err;
      // The same call twice at once: the other request filled it first.
      const again = parseDraft(await deps.store.draft(made.id), { showCost: false }).view;
      return { kind: "done", id: made.id, status: again.status, replayed: true };
    }
    return { kind: "done", id: made.id, status: "draft", replayed: false };
  }
  return { kind: "too_many" };
}

/**
 * "Khôi phục" a discarded draft (21/11): a NEW manual draft with the same title and questions (a discarded draft itself never comes back,
 * 0024 has no way back). Restoring twice opens the same copy. The copy is a test of its own, even when the discarded one edited an approved test.
 */
export async function handleRestoreDraft(deps: StudioDeps, draftId: string): Promise<HandlerResult> {
  const g = await guardDraft(deps, draftId, "studio:write");
  if (!g.ok) return g.result;
  const { view } = parseDraft(await deps.store.draft(draftId), { showCost: false });
  if (view.status !== "discarded") return fail(400, "not_discarded");
  // A discarded "Sửa đề đã duyệt" copy would come back as a separate test without the original's files: edit the test again instead.
  if (view.supersedesDraftId) return fail(400, "restore_edit");
  // Nothing to bring back (the AI read failed before any question was saved).
  if (view.payload.items.length === 0) return fail(400, "restore_empty");
  try {
    const r = await createFilled(deps, { learnerId: g.grant.learner.id, memberId: g.grant.member.id, title: view.title, payload: view.payload, clientBase: `rs-${draftId}` });
    if (r.kind === "too_many") return fail(409, "restore_too_many");
    if (r.kind === "renamed") return r.id ? { status: 200, body: { id: r.id, status: "draft", replayed: true } } : fail(409, "conflict");
    return { status: r.replayed ? 200 : 201, body: { id: r.id, status: r.status, replayed: r.replayed } };
  } catch (err) {
    return fromStudioDbError(err);
  }
}

/** The error code fromStudioDbError would give a database error ("conflict", "draft_changed", …); null for anything else. */
function dbTag(err: unknown): string | null {
  if (!(err instanceof ReviewDbError)) return null;
  try {
    return ((fromStudioDbError(err).body as { error?: string }).error ?? null);
  } catch {
    return null;
  }
}

/** Created and never saved since (a save moves updated_at by far more than this). Guards a draft the tutor emptied on purpose. */
function neverSaved(raw: unknown, updatedAt: string): boolean {
  const created = (raw as { created_at?: unknown } | null)?.created_at;
  if (typeof created !== "string") return false;
  const a = instantMs(created);
  const b = instantMs(updatedAt);
  return a !== null && b !== null && Math.abs(b - a) < 1000;
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

/** POST /api/review/studio/attempts/:id/retry-seen - "Đã xem" on the child's retries of one attempt (the same people who may decide its items). */
export async function handleMarkRetrySeen(deps: StudioDeps, attemptId: string, raw: unknown): Promise<HandlerResult> {
  if (!deps.user?.id) return fail(401, "unauthenticated");
  if (!UUID_RE.test(attemptId)) return fail(404, "not_found");
  const learnerId = await deps.store.getAttemptLearnerId(attemptId);
  if (!learnerId) return fail(404, "not_found");
  const g = await guard(deps, learnerId, "studio:write");
  if (!g.ok) return g.result;
  const p = retrySeenBodySchema.safeParse(raw);
  if (!p.success) return fail(400, "invalid_body");
  try {
    const allowReal = deps.access?.allowRealLearners ?? allowRealLearners();
    const r = (await deps.store.markRetrySeen({ attemptId, note: p.data.note ?? null, seenThrough: p.data.seen_through, byMemberId: g.grant.member.id, clientId: p.data.client_id, allowReal })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: r };
  } catch (err) {
    return fromStudioDbError(err, { missing: "retry_needs_update" });
  }
}
