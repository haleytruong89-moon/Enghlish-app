import { expect, test } from "@playwright/test";
import { goalDeskCopy, weeklyGoalCopy } from "@/lib/copy/vi";
import { deskHref } from "@/lib/shell/paths";
import { LEARNER_IDS, loginAs, studentVisibleText } from "./helpers";

// W4d: the child proposes a weekly goal, the child's tutor adjusts it, the child then sees it "from next week". The parent only reads (Q19).
// The ledger is append-only, so the test starts by taking back a waiting proposal left by an earlier run.
test.describe.configure({ mode: "serial" });
const NG = LEARNER_IDS.nguyen;

test.describe("W4d weekly goal", () => {
  test("child proposes 4, tutor adjusts to 6, the child sees it starts next week; the chip and the page show no score words", async ({ browser }) => {
    const child = await browser.newContext();
    const cp = await child.newPage();
    await loginAs(cp, "studentNguyen");
    await cp.goto("/goal");
    if (await cp.getByTestId("goal-waiting").count()) {
      await cp.getByTestId("goal-withdraw").click();
      await expect(cp.getByTestId("goal-picker")).toBeVisible();
    }
    await expect(cp.getByRole("radiogroup")).toBeVisible();
    await cp.getByTestId("goal-option-4").click();
    await cp.getByTestId("goal-send").click();
    await expect(cp.getByTestId("goal-waiting")).toContainText(weeklyGoalCopy.waitingTag);

    const tutor = await browser.newContext();
    const tp = await tutor.newPage();
    await loginAs(tp, "tutorNguyen");
    await tp.goto(deskHref(NG));
    const box = tp.getByTestId("goal-box");
    await expect(box).toBeVisible();
    await expect(box.getByTestId("goal-accept")).toContainText("4");
    await box.getByTestId("goal-adjust").click();
    await box.getByTestId("goal-adjust-input").fill("6");
    await box.getByTestId("goal-adjust-save").click();
    await expect(tp.getByTestId("goal-box-pending")).toHaveCount(0);
    await expect(box.getByTestId("goal-box-upcoming")).toContainText(goalDeskCopy.upcoming(6, "").split("6")[0]!.trim());

    await cp.goto("/goal");
    await expect(cp.getByTestId("goal-agreed")).toHaveText(weeklyGoalCopy.agreed(6, "adjust"));
    for (const path of ["/goal", "/", "/journey"]) {
      await cp.goto(path);
      const text = await studentVisibleText(cp);
      expect(text, path).not.toMatch(/(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])/);
      expect(text, path).not.toMatch(/%|(^|[^\p{L}])điểm(?!\p{L})|quá hạn|streak|xếp hạng/iu);
      expect(text, path).not.toContain("An (thử)");
    }
    await child.close();
    await tutor.close();
  });

  test("the parent reads the goal but has no buttons; the child of the other tutor is out of reach", async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginAs(p, "parent");
    await p.goto(deskHref(NG));
    await expect(p.getByTestId("goal-box")).toBeVisible();
    await expect(p.getByTestId("goal-accept")).toHaveCount(0);
    await expect(p.getByTestId("goal-adjust")).toHaveCount(0);
    const res = await p.request.post(`/api/learners/${NG}/goals/00000000-0000-0000-0000-000000000000`, { data: { action: "accept", client_id: "e2e-parent-goal-1" } });
    expect(res.status()).toBe(403);
    await ctx.close();

    const other = await browser.newContext();
    const t = await other.newPage();
    await loginAs(t, "tutorAn");
    const res2 = await t.request.post(`/api/learners/${NG}/goals/00000000-0000-0000-0000-000000000000`, { data: { action: "accept", client_id: "e2e-other-goal-1" } });
    expect(res2.status()).toBe(404);
    await other.close();
  });
});
