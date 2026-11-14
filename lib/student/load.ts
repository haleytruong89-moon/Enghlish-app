import "server-only";
import { getAuthUser, getMemberByUserId } from "@/lib/auth/session";
import { buildJourney, type Journey } from "@/lib/journey/path";
import { parseMyRoadmap } from "@/lib/journey/shape";
import { createUserClient } from "@/lib/supabase/server";

export type JourneyPageData = { kind: "ok"; journey: Journey } | { kind: "unavailable" } | { kind: "login" } | { kind: "not-found" };

/**
 * The child's own Hành trình. Reads through the USER client (eng_my_roadmap identifies the child by auth.uid()); staff and anyone who is not
 * a student get "not-found". Migration 0032 not applied → "unavailable" (one soft line, no error).
 */
export async function loadJourneyPage(): Promise<JourneyPageData> {
  const user = await getAuthUser();
  if (!user) return { kind: "login" };
  const member = await getMemberByUserId(user.id);
  if (!member || member.role !== "student") return { kind: "not-found" };
  const { data, error } = await (await createUserClient()).rpc("eng_my_roadmap");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { kind: "unavailable" };
    throw new Error(`eng_my_roadmap failed: ${error.code ?? "error"}`);
  }
  return { kind: "ok", journey: buildJourney(parseMyRoadmap(data)) };
}
