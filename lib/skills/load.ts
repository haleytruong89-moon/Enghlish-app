// lib/skills/load.ts
import "server-only";
import { isMissingFunction } from "@/lib/engine/runner";
import { allowRealLearners } from "@/lib/env";
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
