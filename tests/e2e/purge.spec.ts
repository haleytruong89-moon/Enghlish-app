import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { purgePage } from "@/lib/copy/vi";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { seedThrowawayLearner, TEST_LEARNER_AN_ID, TEST_LEARNER_NGUYEN_ID } from "../../scripts/lib/seed";
import { loginAs } from "./helpers";

// S5c: "Xóa dữ liệu của em" (parent only). Each test makes its own throwaway TEST learner - never An (thử) / Nguyên (thử) - and deletes it.
// Runs in its own Playwright project after all other specs (see playwright.config.ts). Needs DATABASE_URL (the CI job has it).

test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to create a throwaway learner");

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client(pgConfigFromUrl(process.env.DATABASE_URL as string));
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}
const exists = (learnerId: string) =>
  withDb(async (db) => ((await db.query("select 1 from english.learners where id = $1", [learnerId])).rowCount ?? 0) > 0);
const authUsers = () => withDb(async (db) => Number((await db.query("select count(*)::int as n from auth.users")).rows[0]?.n));

test.describe("S5c purge screen", () => {
  test("the parent sees what would go, must type the name, and then the learner is gone - the logins stay", async ({ page }) => {
    const t = await withDb((db) => seedThrowawayLearner(db));
    const usersBefore = await authUsers();

    await loginAs(page, "parent");
    await page.getByTestId(`delete-link-${t.learnerId}`).click();
    await expect(page).toHaveURL(new RegExp(`/learners/${t.learnerId}/delete$`));
    await expect(page.getByRole("heading", { level: 1, name: purgePage.title(t.alias) })).toBeVisible();
    // the dry run: the one result and the one lesson note of the throwaway learner are listed, nothing deleted yet
    await expect(page.getByTestId("purge-count-results")).toHaveText(purgePage.countLine(purgePage.countLabels.results ?? "", 1));
    await expect(page.getByTestId("purge-count-lesson_notes")).toBeVisible();
    expect(await exists(t.learnerId)).toBe(true);

    const submit = page.getByTestId("purge-submit");
    await expect(submit).toBeDisabled();
    await page.getByTestId("purge-name").fill("Em khác");
    await expect(submit).toBeDisabled();
    await page.getByTestId("purge-name").fill(t.alias.toUpperCase());
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByTestId("purge-done")).toContainText(purgePage.done);

    expect(await exists(t.learnerId)).toBe(false);
    expect(await authUsers()).toBe(usersBefore); // never deletes a login account
    // the two seeded test children are untouched
    expect(await exists(TEST_LEARNER_AN_ID)).toBe(true);
    expect(await exists(TEST_LEARNER_NGUYEN_ID)).toBe(true);
    // the page of a purged learner is a plain 404
    expect((await page.goto(`/learners/${t.learnerId}/delete`))?.status()).toBe(404);
  });

  test("a wrong name deletes nothing; a tutor and a student get no page and no API; a request from another site gets 403", async ({ page }) => {
    const t = await withDb((db) => seedThrowawayLearner(db));
    // The purge route refuses requests that do not say they come from this site (Origin); the screen's own fetch always does.
    const same = { origin: new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").origin };
    try {
      await loginAs(page, "parent");
      const wrong = await page.request.post(`/api/learners/${t.learnerId}/purge`, { data: { confirm_name: "không đúng" }, headers: same });
      expect(wrong.status()).toBe(400);
      expect(((await wrong.json()) as { error: string }).error).toBe("name_mismatch");
      expect(await exists(t.learnerId)).toBe(true);

      await page.context().clearCookies();
      await loginAs(page, "tutorAn");
      expect((await page.goto(`/learners/${t.learnerId}/delete`))?.status()).toBe(404);
      expect((await page.request.post(`/api/learners/${t.learnerId}/purge`, { data: { confirm_name: t.alias }, headers: same })).status()).toBe(404);
      await expect(page.getByTestId(`delete-link-${TEST_LEARNER_AN_ID}`)).toHaveCount(0); // no link on a tutor's card
      await page.context().clearCookies();
      await loginAs(page, "studentAn");
      expect((await page.goto(`/learners/${TEST_LEARNER_AN_ID}/delete`))?.status()).toBe(404);
      expect((await page.request.post(`/api/learners/${TEST_LEARNER_AN_ID}/purge`, { data: { confirm_name: "An (thử)", client: randomUUID() }, headers: same })).status()).toBe(403);
      expect(await exists(TEST_LEARNER_AN_ID)).toBe(true);
      expect(await exists(t.learnerId)).toBe(true);
      // a cross-site request is refused before anything else, even for the right parent with the right name
      await page.context().clearCookies();
      await loginAs(page, "parent");
      const cross = await page.request.post(`/api/learners/${t.learnerId}/purge`, { data: { confirm_name: t.alias }, headers: { origin: "https://evil.example" } });
      expect(cross.status()).toBe(403);
      expect(await exists(t.learnerId)).toBe(true);
    } finally {
      // always clean up the throwaway learner, whatever happened above
      await withDb((db) => db.query("select english.eng_purge_learner($1, null)", [t.learnerId]));
    }
  });
});
