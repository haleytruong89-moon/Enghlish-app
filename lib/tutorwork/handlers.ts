/**
 * Framework-free handlers for the S5b-1 routes (record a result, tag its wrong items, add a family tag, tag a piece of writing,
 * write a v2 session note). Same shape as lib/review/handlers.ts:
 *   1. requireAccess first (401 / 404 outside scope / 403 wrong role) - before reading any body;
 *   2. then validate the body (400);
 *   3. then call an injectable store (security-definer functions, service role, actor passed as `p_by`).
 * "Class" work is tutor-only (D15 style): the database refuses a parent and the handler turns it into 403 "tutor_only".
 */
import { AccessError, requireAccess, type AccessDeps, type AccessGrant, type AccessUser, type Action } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, type HandlerResult } from "@/lib/review/handlers";
import { addTagBodySchema, resultBodySchema, sessionNoteBodySchema, tagItemsBodySchema, writingTagsBodySchema } from "./schemas";
import { customTagKey } from "./frameScore";

export interface TutorWorkStore {
  /** Which learner a result / episode belongs to (service role, read-only), or null. */
  getResultLearnerId(resultId: string): Promise<string | null>;
  getEpisodeLearnerId(episodeId: string): Promise<string | null>;
  recordResult(args: {
    learnerId: string;
    mode: string;
    frameId: string | null;
    title: string | null;
    total: number | null;
    correct: number | null;
    wrong: number[];
    tags: { n: number; tag_key: string | null }[];
    context: string;
    attempt: string;
    usedHint: boolean;
    takenOn: string;
    supersedes: string | null;
    byMemberId: string;
    clientId: string;
  }): Promise<unknown>;
  tagResultItems(args: { resultId: string; items: { n: number; tag_key: string }[]; byMemberId: string }): Promise<unknown>;
  addTag(args: { learnerId: string; key: string; label: string; byMemberId: string }): Promise<unknown>;
  tagEpisode(args: { episodeId: string; tags: string[]; byMemberId: string }): Promise<unknown>;
  writeSessionNote(args: {
    learnerId: string;
    sessionDate: string;
    studied: string | null;
    weakTags: string[];
    message: string | null;
    noteForParent: string | null;
    rechecks: { tag_key: string; result: string }[];
    supersedes: string | null;
    byMemberId: string;
    clientId: string;
  }): Promise<unknown>;
}

export type TutorWorkDeps = {
  user: AccessUser;
  store: TutorWorkStore;
  access?: Partial<AccessDeps>;
};

const fail = (status: 400 | 401 | 403 | 404 | 409, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(deps: TutorWorkDeps, learnerId: string, action: Action): Promise<{ ok: true; grant: AccessGrant } | { ok: false; result: HandlerResult }> {
  try {
    return {
      ok: true,
      grant: await requireAccess(deps.user, learnerId, action, deps.access),
    };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, result: fail(err.status, err.message) };
    throw err;
  }
}

async function guardByRef(deps: TutorWorkDeps, id: string, lookup: (id: string) => Promise<string | null>, action: Action) {
  if (!deps.user?.id) return { ok: false as const, result: fail(401, "unauthenticated") };
  if (!UUID_RE.test(id)) return { ok: false as const, result: fail(404, "not_found") };
  const learnerId = await lookup(id);
  if (!learnerId) return { ok: false as const, result: fail(404, "not_found") };
  return guard(deps, learnerId, action);
}

export async function handleRecordResult(deps: TutorWorkDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "tutorwork:write");
  if (!g.ok) return g.result;
  const parsed = resultBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  try {
    const r = (await deps.store.recordResult({
      learnerId: g.grant.learner.id,
      mode: b.mode,
      frameId: b.frame_id ?? null,
      title: b.title ?? null,
      total: b.total_items ?? null,
      correct: b.correct ?? null,
      wrong: b.wrong_items,
      tags: b.tags,
      context: b.context,
      attempt: b.attempt,
      usedHint: b.used_hint,
      takenOn: b.taken_on,
      supersedes: b.supersedes_id ?? null,
      byMemberId: g.grant.member.id,
      clientId: b.client_id,
    })) as { id: string; replayed: boolean; untagged: number };
    return {
      status: r.replayed ? 200 : 201,
      body: { id: r.id, replayed: r.replayed, untagged: r.untagged },
    };
  } catch (err) {
    return fromDbError(err);
  }
}

export async function handleTagResultItems(deps: TutorWorkDeps, resultId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardByRef(deps, resultId, (id) => deps.store.getResultLearnerId(id), "tutorwork:write");
  if (!g.ok) return g.result;
  const parsed = tagItemsBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.tagResultItems({
      resultId,
      items: parsed.data.items,
      byMemberId: g.grant.member.id,
    })) as { tagged: number; replayed: boolean };
    return {
      status: r.replayed ? 200 : 201,
      body: { tagged: r.tagged, replayed: r.replayed },
    };
  } catch (err) {
    return fromDbError(err);
  }
}

/** The "+ nhãn khác" box: the key is made from the label here (never typed by hand). Same name as an existing tag → that tag. */
export async function handleAddTag(deps: TutorWorkDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "tutorwork:write");
  if (!g.ok) return g.result;
  const parsed = addTagBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const key = customTagKey(parsed.data.label);
  if (!key) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.addTag({
      learnerId: g.grant.learner.id,
      key,
      label: parsed.data.label,
      byMemberId: g.grant.member.id,
    })) as {
      key: string;
      label_vi: string;
      created: boolean;
    };
    return {
      status: r.created ? 201 : 200,
      body: { key: r.key, label: r.label_vi, created: r.created },
    };
  } catch (err) {
    return fromDbError(err);
  }
}

export async function handleTagEpisode(deps: TutorWorkDeps, episodeId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guardByRef(deps, episodeId, (id) => deps.store.getEpisodeLearnerId(id), "work:review");
  if (!g.ok) return g.result;
  const parsed = writingTagsBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.tagEpisode({
      episodeId,
      tags: parsed.data.tags,
      byMemberId: g.grant.member.id,
    })) as { added: number; replayed: boolean };
    return {
      status: r.replayed ? 200 : 201,
      body: { added: r.added, replayed: r.replayed },
    };
  } catch (err) {
    return fromDbError(err);
  }
}

export async function handleWriteSessionNote(deps: TutorWorkDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "tutorwork:write");
  if (!g.ok) return g.result;
  const parsed = sessionNoteBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const b = parsed.data;
  try {
    const r = (await deps.store.writeSessionNote({
      learnerId: g.grant.learner.id,
      sessionDate: b.session_date,
      studied: b.studied ?? null,
      weakTags: b.weak_tags,
      message: b.message ?? null,
      noteForParent: b.note_for_parent ?? null,
      rechecks: b.rechecks,
      supersedes: b.supersedes_id ?? null,
      byMemberId: g.grant.member.id,
      clientId: b.client_id,
    })) as { id: string; replayed: boolean };
    return {
      status: r.replayed ? 200 : 201,
      body: { id: r.id, replayed: r.replayed },
    };
  } catch (err) {
    return fromDbError(err);
  }
}
