// lib/studio/load.ts
import "server-only";
import { parseGate, type GateReason } from "@/lib/ai/cap";
import { allowRealLearners } from "@/lib/env";
import { loadPickerMap } from "@/lib/skillmap/load";
import { createFileStorage } from "@/lib/storage/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { getAuthUser, getMemberByUserId } from "@/lib/auth/session";
import { loadTags } from "@/lib/tutorwork/load";
import { buildStudioContext, type StudioContext } from "./context";
import { docxToText } from "./docx";
import { handleGetDraft, type StudioDeps } from "./handlers";
import { parseAiSettings, parseDraftList, parsePending, parseRetryPending } from "./shape";
import { createSupabaseStudioStore } from "./supabaseStore";
import type { AiSettingsView, DraftListItem, DraftPageData, PendingInbox, RetryInbox } from "./types";

/** Review context of one child (call only after requireAccess / authorizeLearnerPage): the map + current levels, the track's tags, the Studio skills. */
export async function loadStudioContext(learnerId: string, trackId: string): Promise<StudioContext> {
  const [map, tags, skills] = await Promise.all([
    loadPickerMap(learnerId),
    loadTags(trackId),
    createAdminClient()
      .rpc("eng_studio_skills", { p_learner: learnerId })
      .then(({ data, error }) => {
        if (error) throw new Error(`eng_studio_skills failed: ${error.code ?? "error"}`);
        return (data ?? []) as { id: string; title_vi: string }[];
      }),
  ]);
  return buildStudioContext(map, tags, skills);
}

/** The family's AI settings for the parent (call only after authorizeStaffPage + role parent). null when unreadable (e.g. 0024 not applied). */
export async function loadAiSettings(memberId: string): Promise<AiSettingsView | null> {
  const { data, error } = await createAdminClient().rpc("eng_ai_settings", { p_by: memberId });
  if (error) return null;
  return parseAiSettings(data);
}


/** Whether "Cho AI đọc đề" is offered, and why not. Never the cost (a tutor reads this page). */
export async function loadStudioGate(learnerId: string): Promise<{ allowed: boolean; reason: GateReason | null }> {
  const { data, error } = await createAdminClient().rpc("eng_ai_gate", { p_learner: learnerId });
  if (error) return { allowed: false, reason: "off" };
  const g = parseGate(data);
  return { allowed: g.allowed, reason: g.reason };
}
export async function loadDraftList(learnerId: string): Promise<DraftListItem[]> {
  const { data, error } = await createAdminClient().rpc("eng_studio_drafts", { p_learner: learnerId });
  if (error) throw new Error(`eng_studio_drafts failed: ${error.code ?? "error"}`);
  return parseDraftList(data);
}

/** Discarded drafts of one child, newest first (Khôi phục). USER client: RLS lets only the child's tutor or parent read them. */
export async function loadDiscardedDrafts(learnerId: string): Promise<{ id: string; title: string; updatedAt: string }[]> {
  const db = await createUserClient();
  const { data, error } = await db
    .from("studio_drafts")
    .select("id, title, updated_at")
    .eq("learner_id", learnerId)
    .eq("status", "discarded")
    .is("supersedes_draft_id", null)
    .order("updated_at", { ascending: false })
    .limit(20)
    .returns<{ id: string; title: string; updated_at: string }[]>();
  if (error) throw new Error(`studio_drafts lookup: ${error.code ?? "error"}`);
  return (data ?? []).map((d) => ({ id: d.id, title: d.title, updatedAt: d.updated_at }));
}

/** The page calls the same handler as GET /api/studio/drafts/:id (one access path). No AI and no background job from a page. */
export async function loadDraftPage(draftId: string): Promise<{ kind: "ok"; data: DraftPageData; isParent: boolean } | { kind: "login" } | { kind: "not-found" }> {
  const user = await getAuthUser();
  // Warm the per-request member cache while the guard looks up the record's child; requireAccess then reuses the same read.
  if (user) void getMemberByUserId(user.id).catch(() => undefined);
  const deps: StudioDeps = {
    user,
    store: createSupabaseStudioStore(),
    storage: createFileStorage(),
    schedule: () => undefined,
    loadContext: loadStudioContext,
    getAi: () => {
      throw new Error("no AI from a page");
    },
    docxToText,
  };
  const res = await handleGetDraft(deps, draftId);
  if (res.status === 401) return { kind: "login" };
  if (res.status !== 200) return { kind: "not-found" };
  const data = res.body as DraftPageData;
  return { kind: "ok", data, isParent: data.gate !== null };
}


/** "Cần thầy/cô xem" of this member (call after authorizeStaffPage). null = unreadable (e.g. 0024 not applied). */
export async function loadStudioPending(memberId: string): Promise<PendingInbox | null> {
  // The automatic Kết quả bài write may have failed once: write it now (idempotent, fail-soft).
  await createAdminClient().rpc("eng_studio_retry_results", { p_by: memberId, p_allow_real: allowRealLearners() });
  const { data, error } = await createAdminClient().rpc("eng_studio_pending", { p_by: memberId, p_allow_real: allowRealLearners() });
  if (error) return null;
  return parsePending(data);
}

/**
 * Retries of the child's work that no adult has acted on since (W4c2, migration 0034). Before 0034 the function does not exist: that is
 * "nothing waiting", not an error. null = unreadable for another reason.
 */
export async function loadRetryPending(memberId: string): Promise<RetryInbox | null> {
  const { data, error } = await createAdminClient().rpc("eng_retry_pending", { p_by: memberId, p_allow_real: allowRealLearners() });
  if (error) return error.code === "PGRST202" || error.code === "42883" ? { count: 0, attempts: [] } : null;
  return parseRetryPending(data);
}
