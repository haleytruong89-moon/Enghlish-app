import { describe, expect, it } from "vitest";
import { pickNextTask, stepState } from "@/lib/work/nextTask";
import type { HomeInquiry, HomeStep, HomeView } from "@/lib/work/types";

const step = (over: Partial<HomeStep> & Pick<HomeStep, "stepNo">): HomeStep => ({
  activityId: `act-${over.stepNo}`,
  activityType: "ACT-SOURCE-QA",
  mode: "PRACTICE",
  purpose: [],
  timeMin: 10,
  date: "2026-10-14",
  attempts: 0,
  ...over,
});
const inquiry = (id: string, steps: HomeStep[]): HomeInquiry => ({
  instanceId: id,
  titleVi: id,
  bigQuestionEn: "q",
  bigQuestionVi: "q",
  dueOn: "2026-10-20",
  steps,
});
const home = (...inquiries: HomeInquiry[]): HomeView => ({ inquiries });

describe("pickNextTask", () => {
  it("is null when nothing is released or everything is done", () => {
    expect(pickNextTask(home())).toBeNull();
    expect(pickNextTask(home(inquiry("i", [step({ stepNo: 2, attempts: 1 })])))).toBeNull();
  });

  it("takes the earliest date, then the lowest step number", () => {
    const h = home(inquiry("i", [step({ stepNo: 6, date: "2026-10-15", activityType: "ACT-WRITE" }), step({ stepNo: 3, date: "2026-10-14" }), step({ stepNo: 2, date: "2026-10-14" })]));
    expect(pickNextTask(h)?.step.stepNo).toBe(2);
  });

  it("skips what is submitted and what the app cannot do yet", () => {
    const h = home(
      inquiry("i", [
        step({ stepNo: 1, activityType: "ACT-SPEAK-LIVE" }),
        step({ stepNo: 2, attempts: 1 }),
        step({ stepNo: 4, activityType: "ACT-CANVAS-BASIC" }),
        step({ stepNo: 13, activityType: "ACT-REVISE", mode: "REVISION" }),
        step({ stepNo: 11, activityType: "ACT-WRITE", mode: "REVISION" }),
        step({ stepNo: 6, activityType: "ACT-WRITE", date: "2026-10-16" }),
      ]),
    );
    expect(pickNextTask(h)?.step.stepNo).toBe(6);
  });

  it("an older date in a later inquiry wins over a newer date in the first", () => {
    const h = home(
      inquiry("new", [step({ stepNo: 2, date: "2026-10-14", activityId: "n2" })]),
      inquiry("old", [step({ stepNo: 3, date: "2026-10-12", activityId: "o3" })]),
    );
    expect(pickNextTask(h)?.step.activityId).toBe("o3");
  });

  it("stepState: done / now / later", () => {
    const a = step({ stepNo: 2 });
    const b = step({ stepNo: 3 });
    const c = step({ stepNo: 4, attempts: 2 });
    const h = home(inquiry("i", [a, b, c]));
    const next = pickNextTask(h);
    expect(stepState(a, next)).toBe("now");
    expect(stepState(b, next)).toBe("later");
    expect(stepState(c, next)).toBe("done");
  });
});
