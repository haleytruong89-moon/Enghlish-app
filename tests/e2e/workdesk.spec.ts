import { expect, test } from "@playwright/test";
import { appFeedback, teachingNotes } from "@/lib/copy/vi";
import { LEARNER_IDS, loginAs } from "./helpers";

// W1: "Ghi chú dạy học" on the level profile page. The tutor of Nguyên (thử) writes; the parent reads but cannot edit.
const NG = LEARNER_IDS.nguyen;

test.describe.serial("W1 teaching notes", () => {
  const text = `Đảo ngữ và câu điều kiện hỗn hợp ${Date.now()}`;

  test("the tutor edits the 'focus' field and sees it saved", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/levels`);
    await page.getByTestId("notes-edit").click();
    await page.locator("#tn_focus").fill(text);
    await page.getByTestId("notes-save").click();
    await expect(page.getByTestId("notes-msg")).toContainText(teachingNotes.saved);
    await expect(page.getByTestId("note-focus")).toContainText(text);
  });

  test("the parent reads the note but has no edit button", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto(`/learners/${NG}/levels`);
    await expect(page.getByTestId("note-focus")).toContainText(text);
    await expect(page.getByTestId("notes-edit")).toHaveCount(0);
  });

  test("the student cannot open the profile page", async ({ page }) => {
    await loginAs(page, "studentNguyen");
    const res = await page.goto(`/learners/${NG}/levels`);
    expect(res?.status()).toBe(404);
  });
});

test.describe.serial("W1 app feedback", () => {
  const text = `Chọn kỹ năng phải cuộn lâu ${Date.now()}`;
  let id = "";

  test("the tutor sends feedback and sees it as 'Mới'", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.getByTestId("feedback-link").click();
    await expect(page).toHaveURL(/\/feedback/);
    await page.getByTestId("fb-kind-suggestion").click();
    await page.locator("#fb_text").fill(text);
    await page.getByTestId("fb-send").click();
    await expect(page.getByTestId("fb-msg")).toContainText(appFeedback.sent);
    const li = page.locator('li[data-testid^="fb-"]', { hasText: text }).first();
    await expect(li).toBeVisible();
    id = ((await li.getAttribute("data-testid")) ?? "").replace("fb-", "");
    await expect(page.getByTestId(`fb-state-${id}`)).toContainText(appFeedback.statuses.new);
  });

  test("the parent sets 'Đang sửa' with a reply; the tutor sees both after reloading", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto("/feedback");
    await page.getByTestId(`fb-status-${id}`).selectOption("in_progress");
    await page.getByTestId(`fb-replybox-${id}`).fill("Bản sau sẽ sửa");
    await page.getByTestId(`fb-update-${id}`).click();
    await expect(page.getByTestId(`fb-state-${id}`)).toContainText(appFeedback.statuses.in_progress);
  });

  test("the tutor sees the status and the reply", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto("/feedback");
    await expect(page.getByTestId(`fb-state-${id}`)).toContainText(appFeedback.statuses.in_progress);
    await expect(page.getByTestId(`fb-reply-${id}`)).toContainText("Bản sau sẽ sửa");
    await expect(page.getByTestId(`fb-status-${id}`)).toHaveCount(0);
  });

  test("the student cannot open the page", async ({ page }) => {
    await loginAs(page, "studentNguyen");
    expect((await page.goto("/feedback"))?.status()).toBe(404);
  });
});
