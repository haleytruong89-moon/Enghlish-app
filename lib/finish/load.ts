import "server-only";
import { feedbackWaiting } from "@/lib/desk/pending";
import type { SubmissionFeedbackView } from "@/lib/practice/types";
import { loadEpisode, loadItemDecisions } from "@/lib/review/load";
import type { ItemMeta } from "@/lib/results/score";
import { isStudioTemplateId, type StudioAssignedRow } from "@/lib/studio/assigned";
import { loadStudioAssigned } from "@/lib/studio/assignedLoad";
import { loadStudioFeedback } from "@/lib/studio/feedbackLoad";
import { loadRetryPending, loadStudioPending } from "@/lib/studio/load";
import type { RetryAttempt } from "@/lib/studio/types";
import { newestAt } from "@/lib/studio/view";
import { createUserClient } from "@/lib/supabase/server";
import { buildFinishQueue, type QueueEntry } from "./queue";
import { buildFinishParts, type FinishPart } from "./view";

export type FinishData = {
  attemptId: string;
  episodeId: string;
  learnerId: string;
  alias: string;
  title: string;
  submittedAt: string;
  counted: boolean;
  parts: FinishPart[];
  /** The live feedback on this attempt (null = none yet). */
  feedback: SubmissionFeedbackView | null;
  /** false before 0037 (the form cannot be sent). */
  feedbackReady: boolean;
  /** false when the feedback lookup failed: the form must not send (it could not edit what is already there). */
  feedbackKnown: boolean;
  /** Feedback goes on the child's latest attempt only (0037): an older one is checked here, its feedback is given on the latest. */
  latestAttemptId: string;
  /** Skills of this work still to score (thang 1–4), on the old review page. */
  skillsLeft: number;
  /** Newest retry not looked at yet: "Xong bài" marks the retries seen up to it. null = none. */
  retrySeenThrough: string | null;
  retryCount: number;
  queue: QueueEntry[];
  /** false = one of the lists behind the queue could not be read: the queue may be short, never say "nothing left". */
  queueKnown: boolean;
};

type MetaRow = { item_id: string; n: number; part: string | null; tag_key: string | null; reading_skill_key: string | null; out_of_app: boolean };
type DraftRow = { parts: { key?: string; name?: string }[] | null };

/** The child's submissions still needing an adult, oldest first. Each source fails soft (it is then simply left out). */
export async function loadFinishQueue(
  learnerId: string, memberId: string, todayIso: string,
  pre: { retries?: RetryAttempt[] | null; assigned?: StudioAssignedRow[] | null } = {},
): Promise<QueueEntry[]> {
  const [pending, rets, assigned] = await Promise.all([
    loadStudioPending(memberId).catch(() => null),
    pre.retries !== undefined ? Promise.resolve(pre.retries) : loadRetryPending(memberId).then((r) => r?.attempts ?? null).catch(() => null),
    pre.assigned !== undefined ? Promise.resolve(pre.assigned) : loadStudioAssigned(learnerId, todayIso).catch(() => null),
  ]);
  return buildFinishQueue({ learnerId, pending: pending?.attempts ?? [], retries: rets ?? [], feedback: feedbackWaiting(assigned ?? [], learnerId) });
}

/**
 * Everything the "Xong một bài" screen shows for one attempt of this child (call after the page gate). null = not this child's attempt
 * (or not reviewed into an episode yet); "not_studio" = another kind of work (the page sends the adult to the old review page).
 */
export async function loadFinish(learnerId: string, attemptId: string, memberId: string, todayIso: string): Promise<FinishData | null | { notStudio: string } | { unavailable: true }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId)) return null;
  const db = await createUserClient();
  const ep = await db.from("episodes").select("id, is_first_attempt").eq("learner_id", learnerId).eq("attempt_id", attemptId).order("is_first_attempt", { ascending: false }).limit(1).returns<{ id: string; is_first_attempt: boolean }[]>();
  // A database fault is "try again", never "does not exist".
  if (ep.error) return { unavailable: true };
  const episode = ep.data?.[0];
  if (!episode) return null;
  const view = await loadEpisode(episode.id).catch(() => undefined);
  if (view === undefined) return { unavailable: true };
  if (!view || view.learner.id !== learnerId) return null;
  if (!isStudioTemplateId(view.tech.templateId)) return { notStudio: episode.id };

  const [decisions, meta, drafts, retries, feedback, assigned, pending] = await Promise.all([
    loadItemDecisions(attemptId),
    db.from("studio_item_meta").select("item_id, n, part, tag_key, reading_skill_key, out_of_app").eq("learner_id", learnerId).eq("template_id", view.tech.templateId).eq("template_version", view.tech.templateVersion).returns<MetaRow[]>(),
    db.from("studio_drafts").select("parts:payload->parts").eq("learner_id", learnerId).eq("template_id", view.tech.templateId).eq("template_version", view.tech.templateVersion).eq("status", "approved").limit(1).returns<DraftRow[]>(),
    loadRetryPending(memberId).catch(() => null),
    loadStudioFeedback(learnerId, attemptId).catch(() => undefined),
    loadStudioAssigned(learnerId, todayIso).catch(() => null),
    loadStudioPending(memberId).catch(() => null),
  ]);
  const metaMap = new Map<string, ItemMeta>((meta.error ? [] : (meta.data ?? [])).map((m) => [m.item_id, { n: m.n, part: m.part, tag: m.tag_key ?? m.reading_skill_key, outOfApp: m.out_of_app }]));
  const partNames = new Map<string, string>();
  for (const p of (drafts.error ? null : drafts.data?.[0]?.parts) ?? []) if (p?.key && p.name) partNames.set(p.key, p.name);
  const mine = retries?.attempts.find((a) => a.attemptId === attemptId) ?? null;
  const content = view.artifact?.content ?? {};
  const answers = content.answers && typeof content.answers === "object" ? (content.answers as Record<string, unknown>) : {};
  const row = assigned?.find((r) => r.lastAttemptId === attemptId || r.firstAttemptId === attemptId);
  const queue = buildFinishQueue({ learnerId, pending: pending?.attempts ?? [], retries: retries?.attempts ?? [], feedback: feedbackWaiting(assigned ?? [], learnerId) });

  return {
    attemptId, episodeId: episode.id, learnerId, alias: view.learner.alias,
    title: row?.title ?? queue.find((q) => q.attemptId === attemptId)?.title ?? view.inquiry.titleVi,
    submittedAt: view.attempt.submittedAt,
    counted: episode.is_first_attempt,
    parts: buildFinishParts({ items: view.step.items, answers, checks: view.autoChecks, keys: view.keys, decisions: decisions ?? {}, meta: metaMap, partNames, retries: mine?.retries ?? [] }),
    feedback: (feedback ?? []).find((f) => f.live && f.submissionId === attemptId) ?? null,
    feedbackReady: feedback !== null,
    feedbackKnown: feedback !== undefined,
    latestAttemptId: row?.lastAttemptId ?? attemptId,
    skillsLeft: view.targets.filter((t) => t.isTarget && t.scorable && t.current === null).length,
    retrySeenThrough: mine ? (newestAt(mine.retries.map((r) => r.at)) ?? mine.since) : null,
    retryCount: mine?.retries.length ?? 0,
    queue,
    queueKnown: pending !== null && retries !== null && assigned !== null,
  };
}
