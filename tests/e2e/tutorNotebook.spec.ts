import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { aiSettingsCopy, tutorAsksCopy, tutorPageCopy } from "@/lib/copy/vi";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { LEARNER_IDS, loginAs } from "./helpers";

// E2a end to end on the TEST family with AI_FAKE=1 (CI): Gia sư (tra từ) → Sổ tay → the adults read the asks. Serial.
test.describe.configure({ mode: "serial" });
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL for the read-only checks");

const NGUYEN = LEARNER_IDS.nguyen;
async function q<R extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<R[]> {
  const db = new Client(pgConfigFromUrl(process.env.DATABASE_URL as string));
  await db.connect();
  try {
    return (await db.query<R>(sql, params)).rows;
  } finally {
    await db.end();
  }
}
const cardRuns = async () => Number((await q<{ n: string }>("select count(*) as n from english.ai_runs where purpose = 'vocab_card'"))[0]!.n);

test("the parent turns AI on with the v3 text (Gia sư is its own page, questions are kept)", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/settings/ai");
  await expect(page.getByTestId("ai-enable").or(page.getByTestId("ai-disable"))).toBeVisible();
  if (await page.getByTestId("ai-enable").isVisible()) await page.getByTestId("ai-enable").click();
  if (await page.getByTestId("ai-reconsent-button").isVisible()) await page.getByTestId("ai-reconsent-button").click();
  await expect(page.getByTestId("ai-state")).toHaveText(aiSettingsCopy.on);
  const v = await q<{ notice_version: string }>("select notice_version from english.consents where scope = 'ai_text' and granted and learner_id = $1 order by at desc, id desc limit 1", [NGUYEN]);
  expect(v[0]?.notice_version).toBe("ai-studio-tutor-v3");
});

test("Nguyên looks up a word: guess first, then Vì sao and Liên quan already open; he saves it to Sổ tay", async ({ page }) => {
  await loginAs(page, "studentNguyen");
  await page.goto("/tutor");
  await expect(page.getByTestId("nav-tutor")).toBeVisible();
  await expect(page.getByTestId("nav-notebook")).toBeVisible();
  await expect(page.getByTestId("tutor-watched")).toHaveText(tutorPageCopy.watched);
  const before = await cardRuns();
  await page.getByTestId("lookup-word").fill("make");
  await page.getByTestId("lookup-send").click();
  const card = page.getByTestId("vocab-card").first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId("card-core")).toHaveCount(0);
  await card.getByTestId("guess-0").click();
  await expect(card.getByTestId("card-why")).toBeVisible();
  await expect(card.getByTestId("card-related")).toBeVisible();
  expect(await cardRuns()).toBe(before + 1);
  await card.getByTestId("card-save").click();
  await expect(card.getByTestId("card-save")).toContainText("Đã lưu");

  // the same word again comes from the shared card: no new card bought
  await page.getByTestId("lookup-word").fill("make");
  await page.getByTestId("lookup-send").click();
  await expect(page.getByTestId("vocab-card")).toHaveCount(2);
  expect(await cardRuns()).toBe(before + 1);

  // Vietnamese in the word box: told to type a short English word
  await page.getByTestId("lookup-word").fill("núi lửa");
  await page.getByTestId("lookup-send").click();
  await expect(page.getByTestId("lookup-problem")).toHaveText(tutorPageCopy.errors.not_english!);
});

test("Sổ tay: the word is there; remove asks first, then Đã bỏ (1); Thêm lại brings it back", async ({ page }) => {
  await loginAs(page, "studentNguyen");
  await page.goto("/notebook");
  await expect(page.getByTestId("nb-make")).toBeVisible();
  await page.getByTestId("nb-remove-make").click();
  await page.getByTestId("nb-yes-make").click();
  await expect(page.getByTestId("notebook-removed")).toContainText("Đã bỏ (1)");
  await page.getByTestId("notebook-removed").locator("summary").click();
  await page.getByTestId("nb-restore-make").click();
  await expect(page.getByTestId("nb-make")).toBeVisible();
  await page.getByTestId("nb-make").locator("a").click();
  await expect(page.getByTestId("card-page")).toBeVisible();
});

test("the parent and Nguyên's tutor read what he asked; the other tutor cannot", async ({ page, browser }) => {
  await loginAs(page, "parent");
  await page.goto(`/learners/${NGUYEN}/tutor-asks`);
  await expect(page.getByTestId("tutor-asks")).toContainText("make");
  await expect(page.getByTestId("tutor-asks")).toContainText(tutorAsksCopy.cache);
  const other = await (await browser.newContext()).newPage();
  await loginAs(other, "tutorAn");
  const res = await other.goto(`/learners/${NGUYEN}/tutor-asks`);
  expect(res?.status()).toBe(404);
});

test("a practice work still has no tutor inside (22/11)", async ({ page }) => {
  await loginAs(page, "studentNguyen");
  await page.goto("/");
  await expect(page.getByTestId("tutor-ask")).toHaveCount(0);
  await expect(page.getByTestId("ask-tutor")).toHaveCount(0);
});
