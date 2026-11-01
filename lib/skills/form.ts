import type { SkillState } from "@/lib/engine/types";
import { MANUAL_STATES } from "./types";

export type ManualState = (typeof MANUAL_STATES)[number];

/** The levels a tutor can set by hand for a skill now at `current`: 1–2, never the level it already has. */
export const manualChoices = (current: SkillState): ManualState[] => MANUAL_STATES.filter((s) => s !== current);

/**
 * The level the form's select shows: what the tutor picked while it is still a valid choice, else the first choice. The engine can move the
 * level under an open form (router.refresh after an AUTO), and a pick equal to the new level would be refused as "same_state" (S4).
 */
export function pickManualState(picked: ManualState, current: SkillState): ManualState {
  const choices = manualChoices(current);
  return choices.includes(picked) ? picked : (choices[0] ?? "SUPPORTED");
}
