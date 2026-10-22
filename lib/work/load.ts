import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import { handleStudentActivity, handleStudentHome } from "./handlers";
import { createSupabaseWorkStore } from "./supabaseStore";
import type { ReviewItem } from "@/lib/levels/types";
import type { ActivityView, HomeView } from "./types";

export type StudentHomeData =
  | { kind: "ok"; alias: string; home: HomeView; review: ReviewItem[] | null }
  | { kind: "login" }
  | { kind: "not-found" };

export type ActivityPageData = { kind: "ok"; activity: ActivityView } | { kind: "login" } | { kind: "not-found" };

async function currentUser() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The pages call the same handlers as the API routes (one access path), without an HTTP round trip. */
export async function loadStudentHome(): Promise<StudentHomeData> {
  const user = await currentUser();
  const res = await handleStudentHome({ user, store: createSupabaseWorkStore() });
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  const body = res.body as { learner: { alias: string }; review?: ReviewItem[] | null } & HomeView;
  return { kind: "ok", alias: body.learner.alias, home: { inquiries: body.inquiries }, review: body.review ?? null };
}

export async function loadActivityPage(activityId: string): Promise<ActivityPageData> {
  const user = await currentUser();
  const res = await handleStudentActivity({ user, store: createSupabaseWorkStore() }, activityId);
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  return { kind: "ok", activity: (res.body as { activity: ActivityView }).activity };
}
