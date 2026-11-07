import { MAX_WEAK_TAGS_PER_NOTE, type LastNote } from "./types";

export type SameAsLastResult = {
  practised: string[];
  weak: string[];
  /** Skills of the previous note that are no longer in the learner's skill set. */
  skippedSkills: number;
  /** Weak points that are no longer available, or that did not fit under the cap. */
  skippedWeak: number;
};

/** "Như buổi trước": what to pre-fill from the previous note. Only skills / tags that still exist; weak points capped. Nothing else is copied. */
export function applySameAsLast(
  previous: Pick<LastNote, "practisedTargetIds" | "weakTagKeys">,
  skillIds: string[],
  tagKeys: string[],
  maxWeak: number = MAX_WEAK_TAGS_PER_NOTE,
): SameAsLastResult {
  const skillSet = new Set(skillIds);
  const tagSet = new Set(tagKeys);
  const practised = [...new Set(previous.practisedTargetIds)].filter((id) => skillSet.has(id));
  const weakAvailable = [...new Set(previous.weakTagKeys)].filter((k) => tagSet.has(k));
  const weak = weakAvailable.slice(0, maxWeak);
  return {
    practised,
    weak,
    skippedSkills: new Set(previous.practisedTargetIds).size - practised.length,
    skippedWeak: new Set(previous.weakTagKeys).size - weak.length,
  };
}
