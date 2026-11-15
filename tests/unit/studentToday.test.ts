import { describe, expect, it } from "vitest";
import { parseToday } from "@/lib/student/shape";
import { pickContinue, sortTasks, summarize, taskHref } from "@/lib/student/today";
import type { Task } from "@/lib/student/types";

const task = (o: Partial<Task>): Task => ({
  kind: "topic", activityId: "a", assignmentId: null, stepNo: 1, activityType: "ACT-SOURCE-QA", title: "T", dueOn: null, opensOn: "2026-11-10",
  timeMin: null, doable: true, practice: true, offLabel: null, hasDraft: false, draftAt: null, filled: null, total: null, mode: null, purpose: [], ...o,
});

describe("Hôm nay order (plan 3.1)", () => {
  const revision = task({ kind: "revision", activityId: "rev", title: "Sửa bài", dueOn: null });
  const studio = task({ kind: "app", activityId: "unit5", title: "Unit 5 luyện tập", dueOn: "2026-11-20", hasDraft: true, draftAt: "2026-11-14T10:00:00Z", filled: 12, total: 30, timeMin: 25 });
  const link = task({ kind: "link", activityId: null, assignmentId: "lnk", title: "Bài link", dueOn: "2026-11-16" });

  it("revision → work with a draft → due date; the example of the plan", () => {
    expect(sortTasks([link, studio, revision]).map((t) => t.title)).toEqual(["Sửa bài", "Unit 5 luyện tập", "Bài link"]);
  });
  it("no due date goes last; then opening date, then title", () => {
    const a = task({ activityId: "1", title: "B", dueOn: null, opensOn: "2026-11-01" });
    const b = task({ activityId: "2", title: "A", dueOn: "2026-12-01" });
    const c = task({ activityId: "3", title: "C", dueOn: "2026-12-01", opensOn: "2026-11-02" });
    expect(sortTasks([a, b, c]).map((t) => t.activityId)).toEqual(["3", "2", "1"]);
  });
  it("the newest draft first", () => {
    const old = task({ activityId: "o", hasDraft: true, draftAt: "2026-11-10T00:00:00Z" });
    const fresh = task({ activityId: "n", hasDraft: true, draftAt: "2026-11-14T00:00:00Z" });
    expect(sortTasks([old, fresh]).map((t) => t.activityId)).toEqual(["n", "o"]);
  });
  it("does not change the input", () => {
    const input = [link, studio];
    sortTasks(input);
    expect(input[0]).toBe(link);
  });
});

describe("Làm tiếp / Việc tiếp theo", () => {
  it("a draft makes it 'Làm tiếp' even when a revision exists (the revision stays first in the list)", () => {
    const studio = task({ kind: "app", activityId: "u5", hasDraft: true, draftAt: "2026-11-14T10:00:00Z", filled: 12, total: 30 });
    const rev = task({ kind: "revision", activityId: "rev" });
    expect(pickContinue([rev, studio])).toEqual({ task: studio, resume: true });
  });
  it("no draft: the first openable task; a step with the tutor is never picked", () => {
    const speak = task({ activityId: "s", doable: false, offLabel: "with_tutor", dueOn: "2026-11-01" });
    const read = task({ activityId: "r", dueOn: "2026-11-09" });
    expect(pickContinue([speak, read])).toEqual({ task: read, resume: false });
    expect(pickContinue([speak])).toBeNull();
    expect(pickContinue([])).toBeNull();
  });
  it("link / PDF work can be the next task (it opens in its own card)", () => {
    const l = task({ kind: "link", activityId: null, assignmentId: "x" });
    expect(pickContinue([l])).toEqual({ task: l, resume: false });
    expect(taskHref(l)).toBe("#task-x");
  });
  it("hrefs: app steps open /activities/[id]; off-app steps open nothing", () => {
    expect(taskHref(task({ activityId: "abc" }))).toBe("/activities/abc");
    expect(taskHref(task({ doable: false }))).toBeNull();
  });
});

describe("the summary line", () => {
  it("counts every task and adds the minutes that are known (link / PDF have none)", () => {
    expect(summarize([task({ timeMin: 10 }), task({ timeMin: 18 }), task({ kind: "link", timeMin: null })])).toEqual({ count: 3, minutes: 28 });
  });
  it("no minutes known → null (the line drops '· khoảng m phút')", () => {
    expect(summarize([task({ kind: "link" })])).toEqual({ count: 1, minutes: null });
    expect(summarize([])).toEqual({ count: 0, minutes: null });
  });
});

describe("parseToday", () => {
  it("maps the SQL shape and ignores any key it does not know", () => {
    const [t] = parseToday({ items: [{ kind: "app", activity_id: "a", title: "U5", due_on: "2026-11-20", opens_on: "2026-11-10", time_min: 25, doable: true, has_draft: true, draft_at: "x", items_filled: 12, items_total: 30, score: 9 }] });
    expect(t).toMatchObject({ kind: "app", activityId: "a", filled: 12, total: 30, hasDraft: true });
    expect(t).not.toHaveProperty("score");
  });
});
