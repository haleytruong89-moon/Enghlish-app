import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { createFileStorage } from "@/lib/storage/server";
import { handleStudentPractice } from "./handlers";
import { createSupabasePracticeStore } from "./supabaseStore";
import { attachAssignmentUnits, parseAssignments } from "./shape";
import type { AssignmentView, ReviewPoints, StudentPracticeItem } from "./types";

/**
 * Loaders for the PR B pages. The staff loader is for pages that already ran authorizeLearnerPage/requireAccess (the function is
 * service-role only); the student loader goes through the same handler as the API route, so there is one access path.
 */

function fail(what: string, err: { code?: string; message?: string }): never {
  throw new Error(`${what} failed: ${err.code ?? err.message ?? "error"}`);
}

/** Every assignment of one learner, newest first (including retracted ones; callers filter). */
export async function loadAssignments(learnerId: string, opts: { units?: boolean } = {}): Promise<AssignmentView[]> {
  const { data, error } = await createAdminClient().rpc("eng_assignment_overview", { p_learner: learnerId, p_assignment: null });
  if (error) fail("eng_assignment_overview", error);
  const list = parseAssignments(data);
  return opts.units === false ? list : withUnits(learnerId, list);
}

const UNIT_CHUNK = 100;

/**
 * The units of each assignment + the knowledge items derived from them (0029). Read as the signed-in adult (RLS: adults of that child).
 * Before 0029 is applied the table is missing: the list simply has no units (assignments still show).
 */
async function withUnits(learnerId: string, list: AssignmentView[]): Promise<AssignmentView[]> {
  if (list.length === 0) return list;
  try {
    const db = await createUserClient();
    // Only the listed assignments (not "every row of the learner": the API caps a response at 1000 rows), in chunks to keep the URL short.
    const ids = list.map((a) => a.id);
    const rows: { assignment_id: string; curriculum_id: string; version_id: string; unit_code: string; ord: number }[] = [];
    for (let i = 0; i < ids.length; i += UNIT_CHUNK) {
      const { data, error } = await db
        .from("assignment_units")
        .select("assignment_id, curriculum_id, version_id, unit_code, ord")
        .eq("learner_id", learnerId)
        .in("assignment_id", ids.slice(i, i + UNIT_CHUNK));
      if (error) return list;
      rows.push(...(data ?? []));
    }
    if (rows.length === 0) return list;
    const versionIds = [...new Set(rows.map((r) => r.version_id as string))];
    const curriculumIds = [...new Set(rows.map((r) => r.curriculum_id as string))];
    const [cur, pts] = await Promise.all([
      db.from("curricula").select("id, title").in("id", curriculumIds),
      db.from("curriculum_unit_points").select("version_id, code, tag_key, ord").in("version_id", versionIds),
    ]);
    if (cur.error || pts.error) return list;
    return attachAssignmentUnits(list, rows, cur.data, pts.data);
  } catch {
    return list;
  }
}

export type StudentPracticeData =
  | { kind: "ok"; alias: string; items: StudentPracticeItem[]; review: ReviewPoints | null }
  | { kind: "login" }
  | { kind: "not-found" };

export async function loadStudentPractice(): Promise<StudentPracticeData> {
  const user = await getAuthUser();
  const res = await handleStudentPractice({ user, store: createSupabasePracticeStore(), storage: createFileStorage() });
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  const body = res.body as { learner: { alias: string }; items: StudentPracticeItem[]; review: ReviewPoints | null };
  return { kind: "ok", alias: body.learner.alias, items: body.items, review: body.review };
}
