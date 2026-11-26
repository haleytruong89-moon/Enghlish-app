// lib/curriculum/load.ts
import "server-only";
import { loadPickerMap } from "@/lib/skillmap/load";
import { createFileStorage } from "@/lib/storage/server";
import { getAuthUser, getMemberByUserId } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTags } from "@/lib/tutorwork/load";
import { buildTocContext, type TocContext } from "./context";
import { handleGetVersion, type CurriculumDeps } from "./handlers";
import { buildCards, taughtChoices, type CurriculumCard, type TaughtChoice, type VersionPageData } from "./shape";
import { createSupabaseCurriculumStore } from "./supabaseStore";
import { buildUnitChoices } from "./unitChoices";
import type { UnitChoice } from "./unitPicker";
import type { SentWorkUnit } from "./workProposal";

/** The closed list of one child (call only after requireAccess / requireLearnerPage). */
export async function loadTocContext(learnerId: string, trackId: string): Promise<TocContext> {
  const [map, tags] = await Promise.all([loadPickerMap(learnerId), loadTags(trackId)]);
  return buildTocContext(map, tags);
}

/**
 * L2 (0044): the app's "Đang học" from work the child sent (english.eng_unit_auto, USER client: the child's adults only, else empty).
 * Before 0044 / on any error: none (statuses stay as the adults set them).
 */
export type UnitAuto = { mainId: string | null; events: { curriculum_id: string; unit_code: string; at: string }[] };
export async function loadUnitAuto(learnerId: string): Promise<UnitAuto> {
  try {
    const db = await createUserClient();
    const { data, error } = await db.rpc("eng_unit_auto", { p_learner: learnerId });
    const d = data as { main_id?: unknown; events?: unknown } | null;
    if (error || !d || !Array.isArray(d.events)) return { mainId: null, events: [] };
    return { mainId: typeof d.main_id === "string" ? d.main_id : null, events: d.events as UnitAuto["events"] };
  } catch {
    return { mainId: null, events: [] };
  }
}

/** Every curriculum of one child with the version in use, its units, points and unit events (RLS: adults of that child only). */
export async function loadCurriculumCards(learnerId: string, auto?: UnitAuto): Promise<CurriculumCard[]> {
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
  return buildCards({ curricula, versions, units, points, events, auto: (auto ?? (await loadUnitAuto(learnerId))).events });
}

/** "Unit đã dạy hôm nay" of the session note. [] when 0026 is not applied yet (the session note must still open). */
export async function loadTaughtChoices(learnerId: string): Promise<TaughtChoice[]> {
  try {
    return taughtChoices(await loadCurriculumCards(learnerId));
  } catch {
    return [];
  }
}

/**
 * "Giao theo Unit": curricula with an approved version, their Units and Review rows (the stored payload of the version in use gives the
 * Review rows and which Units each one revises). [] when 0026 is missing or nothing is approved (the form then shows the old picker).
 */
export async function loadUnitChoices(learnerId: string): Promise<UnitChoice[]> {
  try {
    const cards = await loadCurriculumCards(learnerId);
    const ids = cards.flatMap((c) => (c.current ? [c.current.versionId] : []));
    if (ids.length === 0) return [];
    const { data, error } = await (await createUserClient()).from("curriculum_versions").select("id, payload").in("id", ids);
    if (error) return buildUnitChoices(cards, {});
    return buildUnitChoices(cards, Object.fromEntries((data ?? []).map((v) => [v.id as string, v.payload])));
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

/**
 * Units of work the child has sent (Studio tests given with Units; link / PDF work given with Units, not retracted; Studio steps not
 * skipped), for the "Đang học" proposal: english.eng_sent_work_units (0037), one SQL read (no row cap on whole tables).
 * Service role: call ONLY after the page checked access. Before 0037 / on any error: no rows (the page still opens, with no proposal).
 */
export async function loadSentWorkUnits(learnerId: string): Promise<SentWorkUnit[]> {
  try {
    const { data, error } = await createAdminClient().rpc("eng_sent_work_units", { p_learner: learnerId });
    if (error) return [];
    return ((data ?? []) as { curriculum_id: string; unit_code: string; title: string; sent_at: string }[]).map((r) => ({
      curriculumId: r.curriculum_id, unitCode: r.unit_code, title: r.title, sentAt: r.sent_at,
    }));
  } catch {
    return [];
  }
}
