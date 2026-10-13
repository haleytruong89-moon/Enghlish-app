/**
 * The optional checklist of a skill ("Để đạt 3/4 cần: ...").
 *
 * How it is stored (one model, used by the panel, the API and the database):
 *   - only criteria the reviewer TOUCHED are sent: ticked = true; ticked and then unticked = false (an explicit "no");
 *   - a criterion never touched is left out of criteria_results = "not assessed" (it is NOT recorded as false);
 *   - if nothing was touched, no criteria_results at all (the checklist was not used).
 * Criteria heard live by the tutor cannot be touched on work that was not watched live.
 */
export type CriterionLike = { id: string; method: string };

export function criteriaToSend(touched: Record<string, boolean> | undefined): Record<string, boolean> | undefined {
  if (!touched) return undefined;
  const out = Object.fromEntries(Object.entries(touched).filter(([, v]) => typeof v === "boolean"));
  return Object.keys(out).length > 0 ? out : undefined;
}

export type Choice = 0 | 1 | 2 | 3 | 4 | "na";
export type CriteriaWarning = "ticks_missing_for_pass" | "all_ticked_below_pass" | "ticked_but_no_opportunity";

/**
 * A gentle check between the ticks and the chosen level. It only ever WARNS (the reviewer's judgement wins); it never blocks saving.
 * Silent when the checklist was not used at all.
 */
export function criteriaWarning(
  choice: Choice | undefined,
  criteria: CriterionLike[],
  touched: Record<string, boolean> | undefined,
  observedDirectly: boolean,
): CriteriaWarning | null {
  if (choice === undefined) return null;
  const usable = criteria.filter((c) => c.method !== "tutor_live" || observedDirectly);
  const used = usable.filter((c) => touched?.[c.id] !== undefined);
  if (used.length === 0) return null;
  const allTicked = usable.length > 0 && usable.every((c) => touched?.[c.id] === true);
  if (choice === "na") return used.some((c) => touched?.[c.id] === true) ? "ticked_but_no_opportunity" : null;
  if (choice >= 3 && !allTicked) return "ticks_missing_for_pass";
  if (choice < 3 && allTicked) return "all_ticked_below_pass";
  return null;
}
