/**
 * Framework-free handler for "Xóa dữ liệu của em" (parent only, action "admin"):
 *   1. requireAccess first (401 / 404 outside scope / 403 for tutors and students) - before reading the body;
 *   2. the typed name must match the child's name; a REAL child (not a test one) also needs the second confirmation;
 *   3. eng_purge_learner (database rows, audit receipt, short login name; NEVER the auth account), then the stored files of that child.
 * The database is purged first: if removing the files fails, nothing is lost that was still wanted, and the leftover files are found
 * by `npm run storage:orphans` (their rows are gone, so they count as orphans).
 */
import { AccessError, requireAccess, type AccessDeps, type AccessUser } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import { fromDbError, type HandlerResult } from "@/lib/review/handlers";
import { nameMatches } from "./name";
import { purgeBodySchema } from "./schemas";

export interface PurgeStore {
  /** The deleted-row counts the database reports (eng_purge_learner receipt). */
  purge(args: { learnerId: string; actorUserId: string }): Promise<unknown>;
  /** Remove the child's folder in the private bucket; returns how many files were removed. */
  removeFiles(args: { familyId: string; learnerId: string }): Promise<number>;
  /** Write the number of removed files to the audit log (after a finished purge). */
  auditFiles(args: { familyId: string; learnerId: string; actorUserId: string; removed: number }): Promise<void>;
}

export type PurgeDeps = { user: AccessUser; store: PurgeStore; access?: Partial<AccessDeps> };

const fail = (status: 400 | 401 | 403 | 404, error: string): HandlerResult => ({ status, body: { error, message: apiErrors[status] } });

export async function handlePurgeLearner(deps: PurgeDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  let grant;
  try {
    grant = await requireAccess(deps.user, learnerId, "admin", deps.access);
  } catch (err) {
    if (err instanceof AccessError) return fail(err.status, err.message);
    throw err;
  }
  const parsed = purgeBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const { learner, member } = grant;
  if (!nameMatches(parsed.data.confirm_name, learner.alias)) return fail(400, "name_mismatch");
  if (!learner.isTest && parsed.data.confirm_real !== true) return fail(400, "real_needs_confirmation");

  let receipt: { deleted?: Record<string, number> };
  try {
    receipt = (await deps.store.purge({ learnerId: learner.id, actorUserId: member.userId })) as { deleted?: Record<string, number> };
  } catch (err) {
    return fromDbError(err);
  }

  let filesRemoved: number | null = null;
  try {
    filesRemoved = await deps.store.removeFiles({ familyId: learner.familyId, learnerId: learner.id });
  } catch {
    // The rows are already gone. Say so, and let the screen tell the parent how the leftover files are cleaned.
    filesRemoved = null;
  }
  // Writing the "files deleted" line of the audit log is a separate matter: if it fails AFTER the files were removed, the files ARE gone
  // (do not say they are not) - report the removal and a warning that the audit note is missing.
  let auditOk = true;
  if (filesRemoved !== null) {
    try {
      await deps.store.auditFiles({ familyId: learner.familyId, learnerId: learner.id, actorUserId: member.userId, removed: filesRemoved });
    } catch {
      auditOk = false;
    }
  }
  return {
    status: 200,
    body: { deleted: receipt.deleted ?? {}, files_removed: filesRemoved, files_ok: filesRemoved !== null, audit_ok: auditOk },
  };
}
