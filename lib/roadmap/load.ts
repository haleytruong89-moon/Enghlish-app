import "server-only";
import { ReviewDbError } from "@/lib/review/handlers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "./errors";
import { parseRoadmap, type RoadmapView } from "./shape";

export type RoadmapLoad = { kind: "ok"; view: RoadmapView } | { kind: "unavailable" };

/**
 * The roadmap of one child for the tutor page, the desk and "Chờ duyệt". Call ONLY after the page gate of that child ("roadmap:read"):
 * it reads with the admin client. Migration 0031 not applied → { kind: "unavailable" } (the page says so in words, no error).
 */
export async function loadRoadmap(learnerId: string): Promise<RoadmapLoad> {
  const { data, error } = await createAdminClient().rpc("eng_roadmap", { p_learner: learnerId });
  if (error) {
    if (isMissingFunction(error.code)) return { kind: "unavailable" };
    throw new ReviewDbError(error.code ?? "unknown", `eng_roadmap: ${error.message ?? "error"}`);
  }
  return { kind: "ok", view: parseRoadmap(data) };
}
