import "server-only";
import { allowRealLearners } from "@/lib/env";
import { loadTargetsView } from "@/lib/targets/loadTargets";
import { parseEpisode, parseInbox, parseNotes } from "./shape";
import { createSupabaseReviewStore } from "./supabaseStore";
import type { InboxItem, LessonNoteView, ReviewEpisodeView } from "./types";

/** Inbox for the signed-in staff member (the database scopes it; ALLOW_REAL_LEARNERS filters on top). Call authorizeStaffPage first. */
export async function loadInbox(): Promise<InboxItem[]> {
  return parseInbox(await createSupabaseReviewStore().inbox(allowRealLearners()));
}

/** How many pieces of work this person still has to decide (skills left to score, and allowed to). */
export function countToDecide(items: InboxItem[]): number {
  return items.filter((i) => i.canDecide && i.targetsDecided < i.targetsTotal).length;
}

/** One piece of work for review, or null (outside scope). The learner is looked up first so requireAccess can decide. */
export async function findEpisodeLearner(episodeId: string): Promise<string | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(episodeId)) return null;
  return createSupabaseReviewStore().getEpisodeLearnerId(episodeId);
}

export async function loadEpisode(episodeId: string): Promise<ReviewEpisodeView | null> {
  const raw = await createSupabaseReviewStore().episode(episodeId);
  return raw === null || raw === undefined ? null : parseEpisode(raw);
}

export async function loadNotesPage(learnerId: string): Promise<{
  notes: LessonNoteView[];
  targets: { id: string; title: string }[];
}> {
  const [rawNotes, targets] = await Promise.all([createSupabaseReviewStore().listNotes(learnerId), loadTargetsView(learnerId)]);
  return { notes: parseNotes(rawNotes), targets: (targets?.rows ?? []).map((r) => ({ id: r.id, title: r.title })) };
}
