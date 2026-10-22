import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { resultPage, sessionNotePage, tagPicker, todayPage, weakPage } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { LEARNER_IDS, loginAs } from "./helpers";

// S5b-1 PR A: "Hôm nay", "Ghi kết quả bài" (framed + quick), "Chờ gắn nhãn", "Ghi buổi học", "Điểm cần chú ý".
// The dev seed imports the Destination U1-12 frame into the test family (60 items, 7 parts, a scale) and gives Nguyên track B tags (0015).
// Everything here is about Nguyên (thử) and his tutor; each run records NEW results and notes (new client ids), so it can be repeated.

const NG = LEARNER_IDS.nguyen;

async function notFound(page: Page, target: string) {
  const res = await page.goto(target);
  expect(res?.status(), target).toBe(404);
}

test.describe.serial("S5b-1 tutor work", () => {
  test("the tutor's home is 'Hôm nay' with the two main actions for the child", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^${todayPage.titlePrefix}`) })).toBeVisible();
    await expect(page.getByTestId(`action-note-${NG}`)).toContainText(todayPage.noteAction);
    await expect(page.getByTestId(`action-result-${NG}`)).toContainText(todayPage.resultAction);
    await expect(page.getByTestId(`attention-${NG}`)).toBeVisible();
    await page.getByTestId(`action-result-${NG}`).click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/results/new`));
  });

  test("framed result: click wrong items, see the total and the band update, save", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/results/new`);
    await expect(page.getByTestId("frame-grid")).toBeVisible();
    await expect(page.locator('[data-testid^="item-"]')).toHaveCount(60);
    await expect(page.getByTestId("frame-score")).toHaveText(resultPage.scoreOf(60, 60));
    for (const n of [1, 2, 13]) await page.getByTestId(`item-${n}`).click();
    await expect(page.getByTestId("frame-score")).toHaveText(resultPage.scoreOf(57, 60));
    await expect(page.getByTestId("frame-band")).toContainText(resultPage.scaleLine("Rất tốt"));
    await expect(page.getByTestId("frame-tags").locator("li").first()).toBeVisible();
    await page.getByTestId("grid-clear").click();
    await expect(page.getByTestId("frame-score")).toHaveText(resultPage.scoreOf(60, 60));
    for (const n of [1, 2, 13, 55]) await page.getByTestId(`item-${n}`).click();
    await page.getByTestId("result-save").click();
    await expect(page.getByTestId("result-saved")).toContainText(resultPage.saved(0));
    // saved: the form is read-only until "Ghi bài khác" - a second click cannot record the same work twice
    await expect(page.getByTestId("result-save")).toBeDisabled();
    await page.getByTestId("result-another").click();
    await expect(page.getByTestId("result-save")).toBeEnabled();
  });

  test("quick result: a tag for one wrong item, the other waits in 'Chờ gắn nhãn' and is tagged there", async ({ page }) => {
    const title = `Bài link thử ${Date.now()}`;
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/results/new`);
    await page.getByTestId("mode-quick").click();
    await page.getByTestId("quick-title").fill(title);
    await page.getByTestId("quick-total").fill("10");
    await page.getByTestId("quick-correct").fill("8");
    await page.getByTestId("quick-wrong").fill("4, 7");
    await page.getByTestId("quick-tag-4").selectOption("cau-dieu-kien-dao-ngu");
    // a count that does not match is refused before anything is sent
    await page.getByTestId("quick-correct").fill("9");
    await page.getByTestId("result-save").click();
    await expect(page.getByTestId("result-error")).toHaveText(resultPage.wrongCountMismatch);
    await page.getByTestId("quick-correct").fill("8");
    await page.getByTestId("attempt-first").click();
    await page.getByTestId("hint-yes").click();
    await page.getByTestId("result-save").click();
    await expect(page.getByTestId("result-saved")).toContainText(resultPage.saved(1));

    const pending = page.getByTestId("pending-tags").locator('[data-testid^="pending-"]', { hasText: title }).first();
    await expect(pending).toBeVisible();
    await pending.locator("select").first().selectOption("dang-tu");
    await pending.getByRole("button", { name: resultPage.pendingSave }).click();
    await expect(page.getByTestId("pending-saved")).toBeVisible();
    await expect(pending).toHaveCount(0); // fully tagged: gone from the list after the refresh
  });

  test("a family tag: '+ nhãn khác' on the session screen creates it and ticks it", async ({ page }) => {
    const label = `Đảo ngữ thử ${Date.now()}`;
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/notes/new`);
    await page.getByTestId("add-tag-input").fill(label);
    await page.getByTestId("add-tag-domain").selectOption("grammar");
    await page.getByTestId("add-tag-group").selectOption("gr-emphasis");
    await page.getByTestId("add-tag-button").click();
    await expect(page.getByText(tagPicker.added(label))).toBeVisible();
    await expect(page.getByRole("checkbox", { name: new RegExp(label) })).toHaveAttribute("aria-checked", "true");
  });

  test("session note: tags (max 3), message, note for the parent - the parent reads it, the child's page for it is closed to the student", async ({ page }) => {
    const studied = `Buổi thử ${Date.now()}`;
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/notes/new`);
    await expect(page.getByRole("heading", { level: 1, name: sessionNotePage.title("Nguyên (thử)") })).toBeVisible();
    await page.getByTestId("session-studied").fill(studied);
    // "practised today" (optional) - logged as an exposure. Only the open tab's panel counts (the others are hidden).
    await page.getByTestId("session-practised").getByRole("tabpanel").locator('button[data-testid^="session-practised-"]').first().click();
    await page.getByTestId("tab-session-tags-vocab").click();
    await page.getByTestId("tag-chip-dang-tu").click();
    await page.getByTestId("tag-chip-cum-dong-tu").click();
    await page.getByTestId("tab-session-tags-speaking").click();
    await page.getByTestId("tag-chip-phat-am").click();
    await page.getByTestId("tab-session-tags-vocab").click();
    await expect(page.getByTestId("tag-chip-thanh-ngu")).toBeDisabled(); // 4th is not allowed
    await expect(page.getByTestId("session-tags-chosen")).toContainText("Dạng từ");
    await page.getByTestId("session-message").fill("Ôn lại dạng từ và cụm động từ nhé.");
    await page.getByTestId("session-parent-note").fill("Em hiểu bài, cần luyện thêm cụm động từ.");
    await page.getByTestId("session-save").click();
    await expect(page.getByTestId("session-saved")).toBeVisible();

    await page.context().clearCookies();
    await loginAs(page, "parent");
    await page.goto(`/learners/${NG}/notes`);
    await expect(page.getByText(studied)).toBeVisible();
    await expect(page.getByTestId("note-for-parent").filter({ hasText: "cụm động từ" }).first()).toBeVisible();
  });

  test("Điểm cần chú ý: the table for the child, with windows; the parent sees it too", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/weak?weeks=all`);
    await expect(page.getByRole("heading", { level: 1, name: weakPage.title("Nguyên (thử)") })).toBeVisible();
    await expect(page.getByTestId("weak-tile-vocab")).toBeVisible();
    await page.getByTestId("weak-tile-all").click();
    await expect(page).toHaveURL(/domain=all/);
    await expect(page.getByTestId("weak-table")).toBeVisible();
    await expect(page.locator('[data-testid^="weak-row-"]').first()).toBeVisible();
    await expect(page.getByTestId("weak-window-4")).toHaveText(weakPage.windows["4"] ?? "");
    await page.getByTestId("weak-window-4").click();
    await expect(page).toHaveURL(/weeks=4/);
    await page.context().clearCookies();
    await loginAs(page, "parent");
    await page.goto(`/learners/${NG}/weak`);
    await expect(page.getByTestId("weak-page")).toBeVisible();
  });

  test("work done in the session: only the tutor (the form hides it for a parent; the API says tutor_only)", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/results/new`);
    await expect(page.getByTestId("context-class")).toBeVisible();
    await page.context().clearCookies();
    await loginAs(page, "parent");
    await page.goto(`/learners/${NG}/results/new`);
    await expect(page.getByTestId("context-class")).toHaveCount(0);
    await expect(page.getByText(resultPage.contextClassTutorOnly)).toBeVisible();
    const res = await page.request.post(`/api/learners/${NG}/results`, {
      data: {
        client_id: randomUUID(), mode: "quick", title: "Trong buổi", total_items: 5, correct: 4, wrong_items: [2], tags: [],
        context: "class", attempt: "first", used_hint: false, taken_on: todayVn(),
      },
    });
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("tutor_only");
  });

  test("the other child's tutor and the students get nothing", async ({ page }) => {
    await loginAs(page, "tutorAn");
    for (const p of ["results/new", "notes/new", "weak"]) await notFound(page, `/learners/${NG}/${p}`);
    const other = await page.request.post(`/api/learners/${NG}/results`, {
      data: { client_id: randomUUID(), mode: "quick", title: "x", total_items: 5, correct: 5, wrong_items: [], context: "home", attempt: "first", used_hint: false, taken_on: todayVn() },
    });
    expect(other.status()).toBe(404);

    await page.context().clearCookies();
    await loginAs(page, "studentNguyen");
    for (const p of ["results/new", "notes/new", "weak"]) await notFound(page, `/learners/${NG}/${p}`);
    const mine = await page.request.post(`/api/learners/${NG}/results`, {
      data: { client_id: randomUUID(), mode: "quick", title: "x", total_items: 5, correct: 5, wrong_items: [], context: "home", attempt: "first", used_hint: false, taken_on: todayVn() },
    });
    expect(mine.status()).toBe(403);
    const tags = await page.request.post(`/api/learners/${NG}/tags`, { data: { label: "Nhãn lạ" } });
    expect(tags.status()).toBe(403);
  });
});
