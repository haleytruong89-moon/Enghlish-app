import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { createFileStorage } from "@/lib/storage/server";
import { handleStudentPractice } from "./handlers";
import { createSupabasePracticeStore } from "./supabaseStore";
import { parseAssignments } from "./shape";
import type { AssignmentView, ReviewPoints, StudentPracticeItem } from "./types";

/**
 * Loaders for the PR B pages. The staff loader is for pages that already ran authorizeLearnerPage/requireAccess (the function is
 * service-role only); the student loader goes through the same handler as the API route, so there is one access path.
 */

function fail(what: string, err: { code?: string; message?: string }): never {
  throw new Error(`${what} failed: ${err.code ?? err.message ?? "error"}`);
}

/** Every assignment of one learner, newest first (including retracted ones; callers filter). */
export async function loadAssignments(learnerId: string): Promise<AssignmentView[]> {
  const { data, error } = await createAdminClient().rpc("eng_assignment_overview", { p_learner: learnerId, p_assignment: null });
  if (error) fail("eng_assignment_overview", error);
  return parseAssignments(data);
}

export type StudentPracticeData =
  | { kind: "ok"; alias: string; items: StudentPracticeItem[]; review: ReviewPoints | null }
  | { kind: "login" }
  | { kind: "not-found" };

export async function loadStudentPractice(): Promise<StudentPracticeData> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const res = await handleStudentPractice({ user, store: createSupabasePracticeStore(), storage: createFileStorage() });
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  const body = res.body as { learner: { alias: string }; items: StudentPracticeItem[]; review: ReviewPoints | null };
  return { kind: "ok", alias: body.learner.alias, items: body.items, review: body.review };
}
