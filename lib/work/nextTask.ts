import { isDoneInApp, type HomeInquiry, type HomeStep, type HomeView } from "./types";

export type StepState = "done" | "now" | "later";

export type NextTask = { inquiry: HomeInquiry; step: HomeStep };

/**
 * "Việc tiếp theo": the earliest released, not-yet-submitted step the student can do in the app
 * (reading/listening questions or writing). Ties: earlier step number, then the inquiry listed first.
 * Steps the app cannot do yet (speaking, canvas, self-review, revision) never become the next task.
 */
export function pickNextTask(home: HomeView): NextTask | null {
  let best: NextTask | null = null;
  for (const inquiry of home.inquiries) {
    for (const step of inquiry.steps) {
      if (step.attempts > 0 || !isDoneInApp(step.activityType, step.mode)) continue;
      if (
        !best ||
        step.date < best.step.date ||
        (step.date === best.step.date && inquiry.instanceId === best.inquiry.instanceId && step.stepNo < best.step.stepNo)
      ) {
        best = { inquiry, step };
      }
    }
  }
  return best;
}

/** done = submitted at least once; now = the next task; later = everything else that is open. */
export function stepState(step: HomeStep, next: NextTask | null): StepState {
  if (step.attempts > 0) return "done";
  return next?.step.activityId === step.activityId ? "now" : "later";
}
