/**
 * Framework-free handlers for the S5b-1 PR B routes (give practice, upload and view files, student practice). Same shape as the
 * other handler files:
 *   1. requireAccess first (401 / 404 outside scope / 403 wrong role) - before reading any body;
 *   2. then validate the body (400);
 *   3. then talk to injectable stores: the database (security-definer functions) and the file storage.
 *
 * Files: the browser uploads straight to Supabase Storage through a one-time link for ONE path that this server built from ids
 * (family / learner / new file id) - the browser never chooses a path. When the work is registered, the server asks storage what it
 * actually holds at that path (type and size) and refuses a mismatch, so a file that was not uploaded, or is not what was claimed,
 * never becomes a row. The service role is used only inside the stores, only after the access check here.
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser, type Action, type Role } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, ReviewDbError, type HandlerResult } from "@/lib/review/handlers";
import { checkFile, buildPath, safeDownloadName, type AllowedMime, type FileKind } from "@/lib/storage/rules";
import type { FileStorage } from "@/lib/storage/types";
import { parseHttpsUrl } from "./link";
import {
  createAssignmentBodySchema,
  retractBodySchema,
  staffSubmitBodySchema,
  staffUploadBodySchema,
  studentSubmitBodySchema,
  studentUploadBodySchema,
  type FileMeta,
  type SubmitCore,
} from "./schemas";
import { parseAssignments, parseReviewPoints, parseStudentFile, parseStudentPractice } from "./shape";
import type { AssignmentView } from "./types";

export interface PracticeStore {
  /** The signed-in user's member role and (for a student) their learner id. Null = not a member. */
  getOwnProfile(userId: string): Promise<{ role: Role; learnerId: string | null } | null>;
  /** Which learner an assignment belongs to (service role, read-only), or null. */
  getAssignmentLearnerId(assignmentId: string): Promise<string | null>;
  /** A registered file (service role, read-only), or null. */
  getFile(fileId: string): Promise<{ learnerId: string | null; path: string; mime: string; kind: string } | null>;
  /** english.eng_assignment_overview (service role; call only after requireAccess). */
  overview(learnerId: string, assignmentId: string | null): Promise<unknown>;
  createAssignment(args: {
    learnerId: string; kind: "link" | "pdf"; url: string | null; title: string; tags: string[]; dueOn: string | null; frameId: string | null;
    files: { main: FileMeta; answer: FileMeta | null } | null; byMemberId: string; clientId: string;
  }): Promise<unknown>;
  retractAssignment(args: { assignmentId: string; reason: string | null; byMemberId: string }): Promise<unknown>;
  submit(args: {
    assignmentId: string; byMemberId: string; clientId: string; attempt: string; usedHint: boolean; linkUrl: string | null; files: FileMeta[];
  }): Promise<unknown>;
  /** english.eng_my_practice / eng_my_practice_file / eng_my_review_points as the signed-in student (they check auth.uid() themselves). */
  myPractice(): Promise<unknown>;
  myPracticeFile(assignmentId: string): Promise<unknown>;
  myReviewPoints(): Promise<unknown>;
}

export type PracticeDeps = {
  user: AccessUser;
  store: PracticeStore;
  storage: FileStorage;
  access?: Partial<AccessDeps>;
  /** New file ids (injectable for tests). */
  newId?: () => string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type FailStatus = 400 | 401 | 403 | 404 | 409;
const fail = (status: FailStatus, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

type Guard = { ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult };

async function guard(deps: PracticeDeps, learnerId: string, action: Action): Promise<Guard> {
  try {
    return { ok: true, grant: await requireAccess(deps.user, learnerId, action, deps.access) };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

/** The learner behind the signed-in student (their own); staff get 403, outsiders 404. */
async function ownLearner(deps: PracticeDeps): Promise<Guard> {
  if (!deps.user?.id) return { ok: false, result: fail(401, "unauthenticated") };
  const profile = await deps.store.getOwnProfile(deps.user.id);
  if (!profile) return { ok: false, result: fail(404, "not_found") };
  if (profile.role !== "student") return { ok: false, result: fail(403, "forbidden") };
  if (!profile.learnerId) return { ok: false, result: fail(404, "not_found") };
  return guard(deps, profile.learnerId, "work:submit");
}

const FILE_ERRORS = {
  type: "file_type",
  empty: "file_empty",
  too_big: "file_too_big",
  kind: "file_type",
} as const;

/** A file's path is built from ids, never read from the request. */
function pathFor(grant: AccessGrant, fileId: string, mime: AllowedMime): string {
  return buildPath({ familyId: grant.learner.familyId, learnerId: grant.learner.id, fileId, mime });
}

/** Does storage really hold this file, with the type and size the browser claimed? Returns an error code, or null when it does. */
async function verifyStored(deps: PracticeDeps, grant: AccessGrant, kind: FileKind, meta: FileMeta): Promise<string | null> {
  const c = checkFile(kind, meta.mime, meta.bytes);
  if (!c.ok) return FILE_ERRORS[c.reason];
  const stat = await deps.storage.stat(pathFor(grant, meta.id, meta.mime));
  if (!stat) return "file_missing";
  if (stat.bytes !== meta.bytes || stat.mime !== meta.mime) return "file_mismatch";
  return null;
}

function fileKindOf(assignmentKind: "link" | "pdf"): FileKind {
  return assignmentKind === "link" ? "result_image" : "work_photo";
}

/** One upload target for a file of the given purpose. */
async function makeUpload(deps: PracticeDeps, grant: AccessGrant, kind: FileKind, mime: AllowedMime, bytes: number): Promise<HandlerResult> {
  const c = checkFile(kind, mime, bytes);
  if (!c.ok) return fail(400, FILE_ERRORS[c.reason]);
  const fileId = (deps.newId ?? (() => crypto.randomUUID()))();
  const { url } = await deps.storage.createUpload(pathFor(grant, fileId, mime));
  return { status: 201, body: { file_id: fileId, upload_url: url, mime } };
}

async function submitCore(
  deps: PracticeDeps,
  grant: AccessGrant,
  assignment: { id: string; kind: "link" | "pdf" },
  body: SubmitCore,
): Promise<HandlerResult> {
  const linkRaw = body.link_url?.trim() ? body.link_url : null;
  let link: string | null = null;
  if (linkRaw !== null) {
    link = parseHttpsUrl(linkRaw);
    if (!link) return fail(400, "invalid_link");
  }
  if (assignment.kind === "pdf" && link) return fail(400, "invalid");
  if (!link && body.files.length === 0) return fail(400, "empty_submission");
  const kind = fileKindOf(assignment.kind);
  for (const f of body.files) {
    const bad = await verifyStored(deps, grant, kind, f);
    if (bad) return fail(400, bad);
  }
  try {
    const r = (await deps.store.submit({
      assignmentId: assignment.id,
      byMemberId: grant.member.id,
      clientId: body.client_id,
      attempt: body.attempt,
      usedHint: body.used_hint,
      linkUrl: link,
      files: body.files,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    if (err instanceof ReviewDbError && err.code === "23505" && /\(already_reviewed\)/.test(err.detail)) return fail(409, "already_reviewed");
    return fromDbError(err);
  }
}

/** The assignments of one learner as the staff sees them (one lookup, parsed). */
async function loadOverview(deps: PracticeDeps, learnerId: string, assignmentId: string | null): Promise<AssignmentView[]> {
  return parseAssignments(await deps.store.overview(learnerId, assignmentId));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Tutor / parent
// ---------------------------------------------------------------------------------------------------------------------------------

/** POST /api/learners/:id/files - an upload target for an assignment sheet, an answer key, or a photo submitted on the student's behalf. */
export async function handleStaffUploadUrl(deps: PracticeDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "practice:write");
  if (!g.ok) return g.result;
  const parsed = staffUploadBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  let kind: FileKind;
  if (b.purpose === "submission") {
    const [a] = await loadOverview(deps, g.grant.learner.id, b.assignment_id as string);
    if (!a || a.retractedAt) return fail(404, "not_found");
    kind = fileKindOf(a.kind);
  } else {
    kind = b.purpose;
  }
  return makeUpload(deps, g.grant, kind, b.mime, b.bytes);
}

/** POST /api/learners/:id/assignments - give a link or a PDF (already uploaded) to the learner. */
export async function handleCreateAssignment(deps: PracticeDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "practice:write");
  if (!g.ok) return g.result;
  const parsed = createAssignmentBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  let url: string | null = null;
  if (b.kind === "link") {
    url = parseHttpsUrl(b.url ?? "");
    if (!url) return fail(400, "invalid_link");
  }
  let files: { main: FileMeta; answer: FileMeta | null } | null = null;
  if (b.kind === "pdf" && b.file) {
    const bad = (await verifyStored(deps, g.grant, "assignment_pdf", b.file)) ?? (b.answer_file ? await verifyStored(deps, g.grant, "answer_key", b.answer_file) : null);
    if (bad) return fail(400, bad);
    files = { main: b.file, answer: b.answer_file ?? null };
  }
  try {
    const r = (await deps.store.createAssignment({
      learnerId: g.grant.learner.id,
      kind: b.kind,
      url,
      title: b.title,
      tags: b.tags,
      dueOn: b.due_on ?? null,
      frameId: b.frame_id ?? null,
      files,
      byMemberId: g.grant.member.id,
      clientId: b.client_id,
    })) as { id: string; replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: r.id, replayed: r.replayed } };
  } catch (err) {
    return fromDbError(err);
  }
}

async function guardAssignment(deps: PracticeDeps, learnerId: string, assignmentId: string, action: Action): Promise<Guard> {
  const g = await guard(deps, learnerId, action);
  if (!g.ok) return g;
  if (!UUID_RE.test(assignmentId)) return { ok: false, result: fail(404, "not_found") };
  // The assignment must be this learner's: a mismatch looks exactly like "does not exist".
  if ((await deps.store.getAssignmentLearnerId(assignmentId)) !== g.grant.learner.id) return { ok: false, result: fail(404, "not_found") };
  return g;
}

/** POST /api/learners/:id/assignments/:aid/retract */
export async function handleRetractAssignment(deps: PracticeDeps, learnerId: string, assignmentId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardAssignment(deps, learnerId, assignmentId, "practice:write");
  if (!g.ok) return g.result;
  const parsed = retractBodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.retractAssignment({ assignmentId, reason: parsed.data.reason ?? null, byMemberId: g.grant.member.id })) as { replayed: boolean };
    return { status: r.replayed ? 200 : 201, body: { id: assignmentId, replayed: r.replayed } };
  } catch (err) {
    return fromDbError(err);
  }
}

/** POST /api/learners/:id/assignments/:aid/submissions - "nộp thay": the tutor or parent sends what the student could not. */
export async function handleStaffSubmit(deps: PracticeDeps, learnerId: string, assignmentId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardAssignment(deps, learnerId, assignmentId, "practice:write");
  if (!g.ok) return g.result;
  const parsed = staffSubmitBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const [a] = await loadOverview(deps, g.grant.learner.id, assignmentId);
  if (!a || a.retractedAt) return fail(404, "not_found");
  return submitCore(deps, g.grant, { id: a.id, kind: a.kind }, parsed.data);
}

/** GET /api/files/:id - a fresh 5-minute link to a stored file of a learner the caller may see (the route redirects to it). */
export async function handleStaffFile(deps: PracticeDeps, fileId: string): Promise<HandlerResult> {
  if (!deps.user?.id) return fail(401, "unauthenticated");
  if (!UUID_RE.test(fileId)) return fail(404, "not_found");
  const file = await deps.store.getFile(fileId);
  // Files that belong to no child have no screen yet, so nobody opens them here.
  if (!file || !file.learnerId) return fail(404, "not_found");
  const g = await guard(deps, file.learnerId, "practice:read");
  if (!g.ok) return g.result;
  return { status: 200, body: { url: await deps.storage.createDownload(file.path) } };
}

/** The assignments of one learner (the Giao bài page and the "Ghi kết quả bài" screen). */
export async function handleAssignmentsList(deps: PracticeDeps, learnerId: string): Promise<HandlerResult<{ assignments: AssignmentView[] } | unknown>> {
  const g = await guard(deps, learnerId, "practice:read");
  if (!g.ok) return g.result;
  return { status: 200, body: { assignments: await loadOverview(deps, g.grant.learner.id, null) } };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------------------------------------------------------------

/** GET /api/student/practice - the student's open practice plus "Việc cần ôn" and the tutor's message. Nothing numeric. */
export async function handleStudentPractice(deps: PracticeDeps): Promise<HandlerResult> {
  const g = await ownLearner(deps);
  if (!g.ok) return g.result;
  const [items, review] = await Promise.all([deps.store.myPractice(), deps.store.myReviewPoints()]);
  return {
    status: 200,
    body: { learner: { alias: g.grant.learner.alias }, items: parseStudentPractice(items), review: parseReviewPoints(review) },
  };
}

/** POST /api/student/files - an upload target for a screenshot or photo for one of the student's assignments. */
export async function handleStudentUploadUrl(deps: PracticeDeps, rawBody: unknown): Promise<HandlerResult> {
  const g = await ownLearner(deps);
  if (!g.ok) return g.result;
  const parsed = studentUploadBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const item = parseStudentPractice(await deps.store.myPractice()).find((i) => i.assignmentId === parsed.data.assignment_id);
  if (!item) return fail(404, "not_found");
  if (item.reviewed) return fail(409, "already_reviewed");
  return makeUpload(deps, g.grant, fileKindOf(item.kind), parsed.data.mime, parsed.data.bytes);
}

/** POST /api/student/submissions - the student sends the screenshot / photos (+ two taps) for one assignment. */
export async function handleStudentSubmit(deps: PracticeDeps, rawBody: unknown): Promise<HandlerResult> {
  const g = await ownLearner(deps);
  if (!g.ok) return g.result;
  const parsed = studentSubmitBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const item = parseStudentPractice(await deps.store.myPractice()).find((i) => i.assignmentId === parsed.data.assignment_id);
  if (!item) return fail(404, "not_found");
  return submitCore(deps, g.grant, { id: item.assignmentId, kind: item.kind }, parsed.data);
}

/** GET /api/student/practice/:aid/file - a fresh 5-minute link to the PDF of one of the student's assignments (never the answer key). */
export async function handleStudentFile(deps: PracticeDeps, assignmentId: string): Promise<HandlerResult> {
  const g = await ownLearner(deps);
  if (!g.ok) return g.result;
  if (!UUID_RE.test(assignmentId)) return fail(404, "not_found");
  const file = parseStudentFile(await deps.store.myPracticeFile(assignmentId));
  if (!file) return fail(404, "not_found");
  const mime = file.mime as AllowedMime;
  return { status: 200, body: { url: await deps.storage.createDownload(file.path, { downloadName: safeDownloadName(file.title, mime) }) } };
}
