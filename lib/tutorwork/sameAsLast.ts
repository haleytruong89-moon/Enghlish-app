import { MAX_PRACTISED_PER_NOTE, MAX_WEAK_TAGS_PER_NOTE, type LastNote } from "./types";

export type SameAsLastResult = {
  /** Current picks plus what could be added from the previous note (current first, deduped, capped). */
  practised: string[];
  weak: string[];
  /** Skills / weak points newly added by this action. */
  addedSkills: number;
  addedWeak: number;
  /** Items of the previous note that were not added: no longer available (or hidden in the picker), or over the cap. Items already chosen are not counted. */
  skippedSkills: number;
  skippedWeak: number;
};

function merge(current: string[], previous: string[], available: Set<string>, max: number) {
  const out = [...new Set(current)];
  const candidates = [...new Set(previous)].filter((x) => !out.includes(x));
  let added = 0;
  for (const x of candidates) {
    if (!available.has(x) || out.length >= max) continue;
    out.push(x);
    added += 1;
  }
  return { out, added, skipped: candidates.length - added };
}

/**
 * "Như buổi trước": ADD the previous note's skills and weak points to what is already picked. Only skills / tags that still exist
 * (and, for tags, are not hidden in the picker) are added; both lists are capped. Nothing else is copied.
 */
export function applySameAsLast(
  previous: Pick<LastNote, "practisedTargetIds" | "weakTagKeys">,
  current: { practised: string[]; weak: string[] },
  skillIds: string[],
  tagKeys: string[],
  hiddenTagKeys: string[] = [],
  caps: { maxWeak?: number; maxPractised?: number } = {},
): SameAsLastResult {
  const hidden = new Set(hiddenTagKeys);
  const p = merge(current.practised, previous.practisedTargetIds, new Set(skillIds), caps.maxPractised ?? MAX_PRACTISED_PER_NOTE);
  const w = merge(current.weak, previous.weakTagKeys, new Set(tagKeys.filter((k) => !hidden.has(k))), caps.maxWeak ?? MAX_WEAK_TAGS_PER_NOTE);
  return { practised: p.out, weak: w.out, addedSkills: p.added, addedWeak: w.added, skippedSkills: p.skipped, skippedWeak: w.skipped };
}
