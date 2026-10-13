import { expect, test, type Page } from "@playwright/test";
import { loadConfig } from "../../lib/config/content";
import { learnerWithTrack, levelLabels, targetsPage } from "@/lib/copy/vi";
import { LEARNER_IDS, loginAs, type AccountKey } from "./helpers";

const AN = "An (thử)";
const NGUYEN = "Nguyên (thử)";
const targetsUrl = (who: "an" | "nguyen") => `/learners/${LEARNER_IDS[who]}/targets`;

const cfg = loadConfig();
const dimensionName = (id: string) => cfg.catalogue.dimensions.find((d) => d.id === id)?.name_vi ?? `?${id}`;

/** What the tracking-only section must show per learner (UX copy: short names for aggregates). */
const EXPECTED_TRACKING: Record<"an" | "nguyen", string[]> = {
  an: ["A1", "A3", "A5"].map(dimensionName),
  nguyen: ["Điểm đề thử tháng", "Lỗi ngữ pháp hay gặp"],
};

async function expectTargetsPage(page: Page, who: "an" | "nguyen") {
  const alias = who === "an" ? AN : NGUYEN;
  await expect(page.getByRole("heading", { level: 1, name: targetsPage.title(alias) })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: targetsPage.count(12) })).toBeVisible();
  // 12 tracked skills, each with the "not enough work yet" level (no states exist in S1)
  await expect(page.getByText(levelLabels.NOT_OBSERVED.label, { exact: true })).toHaveCount(12);
  // tracking-only section, apart from (and not counted in) the 12
  await expect(page.getByRole("heading", { level: 2, name: targetsPage.trackingOnlyTitle })).toBeVisible();
  for (const label of EXPECTED_TRACKING[who]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
}

async function notFound(page: Page, url: string) {
  const res = await page.goto(url);
  expect(res?.status(), url).toBe(404);
}

test.describe("parent: tracked skills of both learners", () => {
  for (const [who, alias, track] of [
    ["an", AN, "A"],
    ["nguyen", NGUYEN, "B"],
  ] as const) {
    test(`opens the page for ${alias} from the home card`, async ({ page }) => {
      await loginAs(page, "parent");
      const card = page.getByRole("listitem").filter({ hasText: learnerWithTrack(alias, track) });
      await card.getByRole("link", { name: targetsPage.link }).click();
      await expect(page).toHaveURL(new RegExp(`${targetsUrl(who)}$`));
      await expectTargetsPage(page, who);
    });
  }
});

test.describe("tutors only reach their own learner's tracked skills", () => {
  const tutors: { key: AccountKey; own: "an" | "nguyen"; other: "an" | "nguyen" }[] = [
    { key: "tutorAn", own: "an", other: "nguyen" },
    { key: "tutorNguyen", own: "nguyen", other: "an" },
  ];
  for (const t of tutors) {
    test(`${t.key}: own page OK, the other learner's page is 404`, async ({ page }) => {
      await loginAs(page, t.key);
      const res = await page.goto(targetsUrl(t.own));
      expect(res?.status()).toBe(200);
      await expectTargetsPage(page, t.own);

      await notFound(page, targetsUrl(t.other));
      // must not reveal that the other learner exists
      const body = await page.locator("body").innerText();
      expect(body).not.toContain(t.other === "an" ? AN : NGUYEN);
    });
  }
});

test.describe("students never get this page", () => {
  for (const [key, own, other] of [
    ["studentAn", "an", "nguyen"],
    ["studentNguyen", "nguyen", "an"],
  ] as const) {
    test(`${key}: no link on the home page, own and other URL are 404`, async ({ page }) => {
      await loginAs(page, key);
      await expect(page.getByRole("link", { name: targetsPage.link })).toHaveCount(0);
      await notFound(page, targetsUrl(own));
      await notFound(page, targetsUrl(other));
    });
  }
});
