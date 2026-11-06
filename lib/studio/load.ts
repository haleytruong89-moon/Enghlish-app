// lib/studio/load.ts
import "server-only";
import { loadPickerMap } from "@/lib/skillmap/load";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTags } from "@/lib/tutorwork/load";
import { buildStudioContext, type StudioContext } from "./context";
import { parseAiSettings } from "./shape";
import type { AiSettingsView } from "./types";

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
