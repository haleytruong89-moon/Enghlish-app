// lib/curriculum/load.ts
import "server-only";
import { loadPickerMap } from "@/lib/skillmap/load";
import { createFileStorage } from "@/lib/storage/server";
import { getAuthUser, getMemberByUserId } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { loadTags } from "@/lib/tutorwork/load";
import { buildTocContext, type TocContext } from "./context";
import { handleGetVersion, type CurriculumDeps } from "./handlers";
import { buildCards, taughtChoices, type CurriculumCard, type TaughtChoice, type VersionPageData } from "./shape";
import { createSupabaseCurriculumStore } from "./supabaseStore";

/** The closed list of one child (call only after requireAccess / requireLearnerPage). */
export async function loadTocContext(learnerId: string, trackId: string): Promise<TocContext> {
  const [map, tags] = await Promise.all([loadPickerMap(learnerId), loadTags(trackId)]);
  return buildTocContext(map, tags);
}

/** Every curriculum of one child with the version in use, its units, points and unit events (RLS: adults of that child only). */
export async function loadCurriculumCards(learnerId: string): Promise<CurriculumCard[]> {
  const db = await createUserClient();
  const q = async (table: string, columns: string) => {
    const { data, error } = await db.from(table).select(columns).eq("learner_id", learnerId);
    if (error) throw new Error(`${table} lookup failed: ${error.code ?? "error"}`);
    return data ?? [];
  };
  const [curricula, versions, units, points, events] = await Promise.all([
    q("curricula", "id, title, level_note, created_at"),
    q("curriculum_versions", "id, curriculum_id, version, status, error_code"),
    q("curriculum_units", "version_id, code, ord, title, section, page, skipped"),
    q("curriculum_unit_points", "version_id, code, tag_key, ord"),
    q("curriculum_unit_events", "id, curriculum_id, unit_code, status, created_at"),
  ]);
  return buildCards({ curricula, versions, units, points, events });
}

/** "Unit đã dạy hôm nay" of the session note. [] when 0026 is not applied yet (the session note must still open). */
export async function loadTaughtChoices(learnerId: string): Promise<TaughtChoice[]> {
  try {
    return taughtChoices(await loadCurriculumCards(learnerId));
  } catch {
    return [];
  }
}

/** The page calls the same handler as GET /api/curricula/versions/:id (one access path). No AI and no background job from a page. */
export async function loadVersionPage(versionId: string): Promise<{ kind: "ok"; data: VersionPageData } | { kind: "login" } | { kind: "not-found" }> {
  const user = await getAuthUser();
  // Warm the per-request member cache while the guard looks up the record's child; requireAccess then reuses the same read.
  if (user) void getMemberByUserId(user.id).catch(() => undefined);
  const deps: CurriculumDeps = {
    user,
    store: createSupabaseCurriculumStore(),
    storage: createFileStorage(),
    schedule: () => undefined,
    loadContext: loadTocContext,
    getAi: () => {
      throw new Error("no AI from a page");
    },
  };
  const res = await handleGetVersion(deps, versionId);
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  return { kind: "ok", data: res.body as VersionPageData };
}
