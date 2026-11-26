import { AccessError, requireAccess, type AccessUser } from "@/lib/auth/requireAccess";
import { apiErrors } from "@/lib/copy/vi";
import type { loadPendingRows } from "./load";
import { pendingView } from "./pending";

export type PendingCountBody = { count: string | null; work: string | null };
type Failure = { error: string; message: string };

export type PendingCountDeps = { user: AccessUser; access: typeof requireAccess; load: typeof loadPendingRows; need: (learnerId: string) => Promise<number | null> };

/**
 * Read-only: the numbers of the sidebar. `work` = the "Cần chấm" tab of Bài tập (on "Chấm bài"); `count` = everything waiting. Same function and same `pendingView` as the "Chờ duyệt" page, so the two
 * can never disagree; only the number leaves the server (no titles, no ids). A source that failed gives `null` (never a false "0").
 */
export async function handlePendingCount(deps: PendingCountDeps, learnerId: string): Promise<{ status: number; body: PendingCountBody | Failure }> {
  try {
    const { member, learner } = await deps.access(deps.user, learnerId, "work:review");
    await deps.access(deps.user, learnerId, "goals:read");
    const [pending, need] = await Promise.all([deps.load(member.id, member.role === "parent" ? "parent" : "tutor", learner.id), deps.need(learner.id).catch(() => null)]);
    return { status: 200, body: { count: pendingView(pending).count, work: need === null ? null : String(need) } };
  } catch (err) {
    if (err instanceof AccessError) {
      // A student (403) learns nothing: same answer as "not found".
      const status = err.status === 403 ? 404 : err.status;
      return { status, body: { error: status === 404 ? "not_found" : err.message, message: apiErrors[status as 401 | 404] ?? apiErrors[404] } };
    }
    throw err;
  }
}
