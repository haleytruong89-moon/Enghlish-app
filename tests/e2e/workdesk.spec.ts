import { expect, test } from "@playwright/test";
import { teachingNotes } from "@/lib/copy/vi";
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
