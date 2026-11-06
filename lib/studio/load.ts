// lib/studio/load.ts
import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import { createFileStorage } from "@/lib/storage/server";
import { docxToText } from "./docx";
import { handleGetDraft, type StudioDeps } from "./handlers";
import { createSupabaseStudioStore } from "./supabaseStore";
import type { DraftPageData } from "./types";
import { parseGate, type GateReason } from "@/lib/ai/cap";
import { loadPickerMap } from "@/lib/skillmap/load";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTags } from "@/lib/tutorwork/load";
import { buildStudioContext, type StudioContext } from "./context";
import { parseAiSettings, parseDraftList } from "./shape";
import type { AiSettingsView, DraftListItem } from "./types";

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

/** The page calls the same handler as GET /api/studio/drafts/:id (one access path). No AI and no background job from a page. */
export async function loadDraftPage(draftId: string): Promise<{ kind: "ok"; data: DraftPageData; isParent: boolean } | { kind: "login" } | { kind: "not-found" }> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
