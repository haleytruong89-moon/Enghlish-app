// lib/points/load.ts
import "server-only";
import { isMissingFunction } from "@/lib/engine/runner";
import { allowRealLearners } from "@/lib/env";
import { parsePointInbox, parsePointMap } from "./shape";
import { createSupabasePointsStore } from "./supabaseStore";
import type { PointInbox, PointMap } from "./types";

/** Knowledge-point map of one child (service role). Call only after requireLearnerPage / requireAccess. null = migration 0027 not applied yet. */
export async function loadPointMap(learnerId: string): Promise<PointMap | null> {
  try {
    return parsePointMap(await createSupabasePointsStore().map(learnerId));
  } catch (err) {
    if (isMissingFunction(err)) return null;
    throw err;
  }
}

/** Open point proposals / ⚑ for this staff member. Call only after authorizeStaffPage. null = migration 0027 not applied yet. */
export async function loadPointInbox(memberId: string): Promise<PointInbox | null> {
  try {
    return parsePointInbox(await createSupabasePointsStore().inbox({ byMemberId: memberId, allowReal: allowRealLearners() }));
  } catch (err) {
    if (isMissingFunction(err)) return null;
    throw err;
  }
}
