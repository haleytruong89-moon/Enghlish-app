import "server-only";
import { getAuthUser } from "@/lib/auth/session";
import type { MyActivityNote, MyFeedbackItem, MyRevisionView } from "@/lib/revision/types";
import { handleStudentActivity, handleStudentActivityNote, handleStudentHome, handleStudentResultView, handleStudentRevision, handleStudentTestMarks } from "./handlers";
import { createSupabaseWorkStore } from "./supabaseStore";
import type { ReviewItem } from "@/lib/levels/types";
import type { ResultView } from "@/lib/student/result";
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

/** The screen after submitting (S-10) for the signed-in child; null before the first submission, for a step without auto-check, before 0034, or on any error. */
export async function loadResultView(activityId: string): Promise<ResultView | null> {
  const user = await currentUser();
  const res = await handleStudentResultView({ user, store: createSupabaseWorkStore() }, activityId).catch(() => null);
  return res?.body.result ?? null;
}

/** Is this work a "Bài kiểm tra" (flag at assigning, or a self-check step)? Unreadable / before 0034 → only the step's own mode decides. */
export async function loadIsTest(activityId: string, mode: string): Promise<boolean> {
  if (mode === "INDEPENDENT_CHECK") return true;
  const user = await currentUser();
  const res = await handleStudentTestMarks({ user, store: createSupabaseWorkStore() }).catch(() => null);
  return !!res?.body.activityIds.includes(activityId);
}
