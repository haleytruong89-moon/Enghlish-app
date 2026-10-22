/** The child's home with feedback (pure): which rows go first, which go to the box, which revision steps are open. */
import { doableInApp } from "@/lib/work/view";
import type { HomeStep } from "@/lib/work/types";
import { AUTO_REVISION_STEP_BASE, type MyFeedbackItem } from "./types";

export function splitFeedback(items: MyFeedbackItem[]): { rows: MyFeedbackItem[]; box: MyFeedbackItem[]; openActivityIds: Set<string> } {
  return {
    rows: items.filter((i) => i.state === "todo" || i.state === "submitted"),
    box: items.filter((i) => i.state === "seen" || i.state === "note"),
    openActivityIds: new Set(items.filter((i) => i.state === "todo").map((i) => i.activityId)),
  };
}

/**
 * Does this step count in "Xong x/y bước"? The app can do it (reading / writing), or it is a revision step that is open now, or a revision
 * step that already has a revision (a reused template REVISION step stays counted - and done - after the child sent the revision).
 */
export function countsInApp(step: HomeStep, openActivityIds: Set<string>): boolean {
  return doableInApp(step.activityType, step.mode) || openActivityIds.has(step.activityId) || (step.mode === "REVISION" && step.attempts > 0);
}

/** A revision step the app added (1001+) is shown only while the child has something to revise there (D3); template steps stay. */
export function homeSteps(steps: HomeStep[], openActivityIds: Set<string>): HomeStep[] {
  return steps.filter((s) => s.stepNo <= AUTO_REVISION_STEP_BASE || openActivityIds.has(s.activityId));
}
