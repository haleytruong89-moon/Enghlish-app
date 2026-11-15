import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { parseWeekFacts } from "./weekShape";
import { buildWeekView, type WeekFacts, type WeekView } from "./weekView";

const MISSING = new Set(["PGRST202", "42883"]);

/**
 * The child's own week facts (eng_my_week). Read through the USER client: the database function identifies the child by auth.uid().
 * Never throws: migration 0035 not applied, or any fault → null (the screens show nothing / one soft line, never an error page).
 */
export async function loadMyWeek(): Promise<WeekFacts | null> {
  try {
    const { data, error } = await (await createUserClient()).rpc("eng_my_week");
    if (error) return null;
    return parseWeekFacts(data);
  } catch {
    return null;
  }
}

/**
 * The week facts of one child for an adult (eng_week_facts, service role). Call ONLY after the page gate of that child
 * ("goals:read" / "tutorwork:read"). Never throws: null = not applied / unreadable.
 */
export async function loadWeekFactsFor(learnerId: string): Promise<WeekFacts | null> {
  try {
    const { data, error } = await createAdminClient().rpc("eng_week_facts", { p_learner: learnerId });
    if (error) return null;
    return parseWeekFacts(data);
  } catch {
    return null;
  }
}

/** The week of the signed-in child as the screens draw it (null = not available: migration 0035 not applied or unreadable). */
export async function loadMyWeekView(): Promise<{ facts: WeekFacts; view: WeekView } | null> {
  const facts = await loadMyWeek();
  return facts ? { facts, view: buildWeekView(facts) } : null;
}

export type WeekFactsResult = { kind: "ok"; facts: WeekFacts } | { kind: "unavailable" };

/**
 * Like loadWeekFactsFor, but tells "migration 0035 is not applied" ({ kind: "unavailable" }, not a fault) from a real fault (throws), so
 * "Chờ duyệt" does not call its count unknown just because the weekly goal is not there yet. Call ONLY after the page gate of that child.
 */
export async function loadWeekFactsResult(learnerId: string): Promise<WeekFactsResult> {
  const { data, error } = await createAdminClient().rpc("eng_week_facts", { p_learner: learnerId });
  if (error) {
    if (error.code && MISSING.has(error.code)) return { kind: "unavailable" };
    throw new Error(`eng_week_facts failed: ${error.code ?? "error"}`);
  }
  const facts = parseWeekFacts(data);
  return facts ? { kind: "ok", facts } : { kind: "unavailable" };
}
