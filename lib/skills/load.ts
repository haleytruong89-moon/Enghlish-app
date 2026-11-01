// lib/skills/load.ts
import "server-only";
import { isMissingFunction } from "@/lib/engine/runner";
import { allowRealLearners } from "@/lib/env";
import { logAppError } from "@/lib/ops/logAppError";
import { parseSkillInbox, parseSkillStates } from "./shape";
import { createSupabaseSkillStore } from "./supabaseStore";
import type { SkillInbox, SkillStates } from "./types";

/** Skill states of one child (service role). Call only after requireLearnerPage / requireAccess. null = migration 0023 not applied yet. */
export async function loadSkillStates(learnerId: string): Promise<SkillStates | null> {
  try {
    return parseSkillStates(await createSupabaseSkillStore().states(learnerId));
  } catch (err) {
    if (isMissingFunction(err)) return null;
    throw err;
  }
}

/** Open proposals / ⚑ for this staff member. Call only after authorizeStaffPage. null = migration 0023 not applied yet. */
export async function loadSkillInbox(memberId: string): Promise<SkillInbox | null> {
  try {
    return parseSkillInbox(await createSupabaseSkillStore().inbox({ byMemberId: memberId, allowReal: allowRealLearners() }));
  } catch (err) {
    if (isMissingFunction(err)) return null;
    throw err;
  }
}

export type SkillStatesSoft = { skills: SkillStates | null; failed: boolean };

/**
 * N3: for pages that show skill states beside other things (Hồ sơ cấp, Kỹ năng đang theo dõi). Any error is logged and the page still renders without
 * the states, plus a neutral line (failed = true); never a 500. null without failed = migration 0023 not applied yet.
 */
export async function loadSkillStatesSoft(
  learnerId: string,
  route: string,
  load: (learnerId: string) => Promise<SkillStates | null> = loadSkillStates,
  log: (entry: { route: string; code: string; error: unknown }) => Promise<void> = logAppError,
): Promise<SkillStatesSoft> {
  try {
    return { skills: await load(learnerId), failed: false };
  } catch (err) {
    await log({ route, code: "skill_states_load_failed", error: err }).catch(() => {});
    return { skills: null, failed: true };
  }
}
