import "server-only";
import { getAuthUser } from "@/lib/auth/session";
import type { MyActivityNote, MyFeedbackItem, MyRevisionView } from "@/lib/revision/types";
import { handleStudentActivity, handleStudentActivityNote, handleStudentHome, handleStudentRevision, handleStudentStudioReview } from "./handlers";
import { createSupabaseWorkStore } from "./supabaseStore";
import type { ReviewItem } from "@/lib/levels/types";
import type { StudioReviewView } from "@/lib/studio/types";
import type { ActivityView, HomeView } from "./types";

export type StudentHomeData =
  | { kind: "ok"; alias: string; home: HomeView; review: ReviewItem[] | null; feedback: MyFeedbackItem[] | null }
  | { kind: "login" }
  | { kind: "not-found" };

export type ActivityPageData = { kind: "ok"; activity: ActivityView; note: MyActivityNote | null } | { kind: "login" } | { kind: "not-found" };

async function currentUser() {
  const user = await getAuthUser();
  return user;
}

/** The pages call the same handlers as the API routes (one access path), without an HTTP round trip. */
export async function loadStudentHome(): Promise<StudentHomeData> {
  const user = await currentUser();
  const res = await handleStudentHome({ user, store: createSupabaseWorkStore() });
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  const body = res.body as { learner: { alias: string }; review?: ReviewItem[] | null; feedback?: MyFeedbackItem[] | null } & HomeView;
  return { kind: "ok", alias: body.learner.alias, home: { inquiries: body.inquiries }, review: body.review ?? null, feedback: body.feedback ?? null };
}

export async function loadActivityPage(activityId: string): Promise<ActivityPageData> {
  const user = await currentUser();
  const res = await handleStudentActivity({ user, store: createSupabaseWorkStore() }, activityId);
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  const activity = (res.body as { activity: ActivityView }).activity;
  // G4: the "Chỉ góp ý" note of this activity; a failed lookup (e.g. 0021 not applied yet) leaves it out.
  const noteRes = activity.supported ? await handleStudentActivityNote({ user, store: createSupabaseWorkStore() }, activityId).catch(() => null) : null;
  return { kind: "ok", activity, note: (noteRes?.body as { note?: MyActivityNote | null } | undefined)?.note ?? null };
}

export type RevisionPageData = { kind: "ok"; revision: MyRevisionView } | { kind: "login" } | { kind: "not-found" };

/** The child's revision page for a REVISION step (S6): same access path as the API route. */
export async function loadRevisionPage(activityId: string): Promise<RevisionPageData> {
  const user = await currentUser();
  const res = await handleStudentRevision({ user, store: createSupabaseWorkStore() }, activityId);
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  return { kind: "ok", revision: (res.body as { revision: MyRevisionView }).revision };
}

/** Board 20 data of a Studio step for the signed-in child; null for weekly topics, before the first submission, or on any error. */
export async function loadStudioReview(activityId: string): Promise<StudioReviewView | null> {
  const user = await currentUser();
  const res = await handleStudentStudioReview({ user, store: createSupabaseWorkStore() }, activityId).catch(() => null);
  return (res?.body as { review?: StudioReviewView | null } | undefined)?.review ?? null;
}
