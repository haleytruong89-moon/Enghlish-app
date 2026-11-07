import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { loadAssignments } from "@/lib/practice/load";
import type { AssignmentView } from "@/lib/practice/types";
import { parseFrames, parseLastNote, parseRecentResult, parseResultEdit, parseTags, parseUntagged, parseWeakPoints } from "./shape";
import { type FrameView, type LastNote, type RecentResult, type ResultEdit, type TagInfo, type UntaggedItem, type WeakPointsView } from "./types";
import type { WeakWindow } from "./schemas";
import { filterUntagged, windowSince } from "./window";

/**
 * Loaders for the S5b-1 pages. Call them only after authorizeLearnerPage/requireAccess: reads of plain tables use the USER client (RLS
 * keeps them staff-only and in scope); the weak-point functions are service-role only, so they use the admin client.
 */

function fail(what: string, err: { code?: string; message?: string }): never {
  throw new Error(`${what} failed: ${err.code ?? err.message ?? "error"}`);
}

/** Tags a learner's track may use: the seed set plus the family's own, newest custom last. */
export async function loadTags(trackId: string): Promise<TagInfo[]> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("error_tags")
    .select("key, label_vi, group_vi, origin, group_key")
    .eq("track_id", trackId)
    .is("retired_at", null)
    .order("origin", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) fail("error_tags lookup", error);
  return parseTags(data);
}

/** Frames (newest version of each) the family has for this track, plus this child's own Studio frames. */
export async function loadFrames(trackId: string, learnerId: string): Promise<FrameView[]> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("test_frames")
    .select("id, title, total_items, parts, items, scale, supersedes_id")
    .eq("track_id", trackId)
    // family frames (learner_id null) + Studio frames of THIS child only (a parent can read every child's Studio frames)
    .or(`learner_id.is.null,learner_id.eq.${learnerId}`)
    .order("created_at", { ascending: true });
  if (error) fail("test_frames lookup", error);
  const rows = (data ?? []) as { id: string; supersedes_id: string | null }[];
  const replaced = new Set(rows.map((r) => r.supersedes_id).filter((x): x is string => x !== null));
  return parseFrames(rows.filter((r) => !replaced.has(r.id)));
}

export async function loadWeakPoints(learnerId: string, window: WeakWindow = "all"): Promise<WeakPointsView> {
  const { data, error } = await createAdminClient().rpc("eng_weak_points", {
    p_learner: learnerId,
    p_since: windowSince(window),
  });
  if (error) fail("eng_weak_points", error);
  return parseWeakPoints(data);
}

/**
 * Wrong items still waiting for a tag, as this viewer may see them: the tutor sees all; the parent sees her own at once and the
 * tutor's only after PARENT_TAG_WAIT_DAYS (the tutor tags first, the parent is the fallback). Filtered here, on the server.
 */
export async function loadUntagged(learnerId: string, viewer: { role: "tutor" | "parent"; memberId: string }, now: Date = new Date()): Promise<UntaggedItem[]> {
  const { data, error } = await createAdminClient().rpc("eng_untagged_queue", {
    p_learner: learnerId,
  });
  if (error) fail("eng_untagged_queue", error);
  return filterUntagged(parseUntagged(data), viewer, now);
}

/** One result of this learner, in the shape the form needs to open it for correction (RLS: staff in scope only). Null when not found. */
export async function loadResultForEdit(learnerId: string, resultId: string): Promise<ResultEdit | null> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("results")
    .select("id, mode, frame_id, context, attempt, source, used_hint, title, total_items, correct, wrong_items, item_tags, taken_on, assignment_id")
    .eq("learner_id", learnerId)
    .eq("id", resultId)
    .maybeSingle();
  if (error) fail("results lookup", error);
  return parseResultEdit(data);
}

/** The newest result that no later result replaced. */
export async function loadRecentResult(learnerId: string): Promise<RecentResult | null> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("results")
    .select("id, title, taken_on, total_items, correct, supersedes_id")
    .eq("learner_id", learnerId)
    .order("taken_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) fail("results lookup", error);
  const rows = (data ?? []) as { id: string; supersedes_id: string | null }[];
  const replaced = new Set(rows.map((r) => r.supersedes_id).filter((x): x is string => x !== null));
  return parseRecentResult(rows.filter((r) => !replaced.has(r.id)));
}

/** The newest session note that is not replaced by a later version (RLS: parents see shared ones only). */
export async function loadLastNote(learnerId: string): Promise<LastNote | null> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("lesson_notes")
    .select("id, session_date, goals, weak_tag_keys, practised_target_ids, message_to_learner, author_role, supersedes_id")
    .eq("learner_id", learnerId)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) fail("lesson_notes lookup", error);
  const rows = (data ?? []) as { id: string; supersedes_id: string | null }[];
  const replaced = new Set(rows.map((r) => r.supersedes_id).filter((x): x is string => x !== null));
  return parseLastNote(rows.filter((r) => !replaced.has(r.id)));
}

/** Tag keys already given to one piece of writing (the review screen shows them as chosen). */
export async function loadWritingTagKeys(learnerId: string, episodeId: string): Promise<string[]> {
  const db = await createUserClient();
  const { data, error } = await db.from("tag_marks").select("tag_key").eq("learner_id", learnerId).eq("source", "writing").eq("source_id", episodeId);
  if (error) fail("tag_marks lookup", error);
  return ((data ?? []) as { tag_key: string }[]).map((r) => r.tag_key);
}

export type TodayData = {
  weak: WeakPointsView;
  repeats: WeakPointsView["tags"];
  due: WeakPointsView["tags"];
  untagged: UntaggedItem[];
  lastNote: LastNote | null;
  recent: RecentResult | null;
  /** Assignments given in the app that are not retracted and have no result yet (what the student still owes, or what waits for the tutor). */
  practice: AssignmentView[];
  tagLabels: Record<string, string>;
};

/** Everything the "Hôm nay" card of one learner needs. */
export async function loadToday(learnerId: string, trackId: string, viewer: { role: "tutor" | "parent"; memberId: string }): Promise<TodayData> {
  const [weak, untagged, lastNote, recent, tags, assignments] = await Promise.all([
    loadWeakPoints(learnerId, "all"),
    loadUntagged(learnerId, viewer),
    loadLastNote(learnerId),
    loadRecentResult(learnerId),
    loadTags(trackId),
    loadAssignments(learnerId),
  ]);
  return {
    weak,
    repeats: weak.tags.filter((t) => t.status === "repeat").slice(0, 3),
    due: weak.tags.filter((t) => t.recheckDue).slice(0, 3),
    untagged,
    lastNote,
    recent,
    practice: assignments.filter((a) => !a.retractedAt && a.resultId === null),
    tagLabels: Object.fromEntries(tags.map((t) => [t.key, t.label])),
  };
}
