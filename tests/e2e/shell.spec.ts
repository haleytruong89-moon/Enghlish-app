import { expect, test, type Page } from "@playwright/test";
import { deskCopy } from "@/lib/copy/vi";
import { buildNav, type NavRole } from "@/lib/shell/nav";
import { LEARNER_IDS, loginAs, type AccountKey } from "./helpers";

const AN = LEARNER_IDS.an;
const NG = LEARNER_IDS.nguyen;
const allHrefs = (role: NavRole, id: string) => {
  const n = buildNav(role, id, { revisionsReady: true });
  return [...n.sections.flatMap((s) => [s.href, ...s.children.map((c) => c.href)]), ...n.parent.map((p) => p.href)].filter((h): h is string => h !== null);
};
const childScoped = (h: string) => h.startsWith("/learners/") || h.startsWith("/studio/new");
// Many links per test: ask for the status without rendering/waiting for "load" (the cold server made two tests hit the 30 s limit).
async function status(page: Page, href: string) { return (await page.request.get(href)).status(); }

test.describe("workdesk shell", () => {
  test("the tutor lands on Bàn làm việc with the sidebar; Chờ duyệt is above the fold at 1366×768", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await loginAs(page, "tutorNguyen");
    await expect(page.getByTestId("staff-sidebar")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: deskCopy.title("Nguyên (thử)") })).toBeVisible();
    await expect(page.getByTestId("nav-desk")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-roadmap")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("learner-switcher")).toHaveCount(0);
    await expect(page.getByTestId("shell-learner")).toContainText("Nguyên (thử)");
    const box = await page.getByTestId("desk-inbox").boundingBox();
    expect(box && box.y + 40).toBeLessThan(768);
    await expect(page.getByTestId("feedback-link")).toBeVisible();
  });

  test("UX vòng 3A: 9 sections (Giao bài has no sub-pages; Ghi kết quả is a group); the pending number appears after the page", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await expect(page.getByTestId("staff-sidebar")).toBeVisible();
    for (const k of ["desk", "profile", "knowledge", "roadmap", "sessions", "assign", "results", "curricula", "inbox"]) await expect(page.getByTestId(`nav-${k}`), k).toBeVisible();
    await page.getByTestId("nav-assign").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/assign$`));
    await expect(page.getByTestId("way-cards")).toBeVisible();
    await expect(page.locator('[data-testid^="nav-assign-"]')).toHaveCount(0);
    await page.getByTestId("nav-results").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/imports/new$`));
    await expect(page.getByTestId("nav-results-import")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-results-results")).toBeVisible();
    await page.getByTestId("nav-results-results").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/results/new$`));
    // The number comes from the read-only route (other specs may leave nothing waiting: then no badge at all, never a false one).
    const res = await page.request.get(`/api/learners/${NG}/pending-count`);
    expect(res.status()).toBe(200);
    const { count } = (await res.json()) as { count: string | null };
    if (count !== null && count !== "0") await expect(page.getByTestId("inbox-badge")).toHaveText(count);
  });

  for (const t of [{ key: "tutorNguyen", own: NG, other: AN }, { key: "tutorAn", own: AN, other: NG }] as const) {
    test(`${t.key}: every sidebar link opens (200); the same links for the other child are 404; parent-only pages are 404`, async ({ page }) => {
      test.setTimeout(120_000);
      await loginAs(page, t.key as AccountKey);
      for (const h of allHrefs("tutor", t.own)) expect(await status(page, h), h).toBe(200);
      for (const h of allHrefs("tutor", t.other).filter(childScoped)) expect(await status(page, h), h).toBe(404);
      expect(await status(page, "/settings/ai")).toBe(404);
      expect(await status(page, `/learners/${t.own}/delete`)).toBe(404);
    });
  }

  test("parent: every link of both children opens; the switcher keeps the open part", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "parent");
    for (const id of [AN, NG]) for (const h of allHrefs("parent", id)) expect(await status(page, h), h).toBe(200);
    await page.goto(`/learners/${AN}/weak`);
    await expect(page.getByTestId("learner-switcher")).toBeVisible();
    await page.getByTestId(`learner-option-${NG}`).click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/weak$`));
    await expect(page.getByTestId("nav-profile-weak")).toHaveAttribute("aria-current", "page");
  });

  for (const key of ["studentAn", "studentNguyen"] as const) {
    test(`${key}: the child's home is unchanged (no shell) and every staff link is 404`, async ({ page }) => {
      await loginAs(page, key);
      await expect(page.getByTestId("student-nav")).toBeVisible();
      for (const id of ["staff-shell", "staff-sidebar", "learner-switcher", "feedback-link", "nav-desk"]) await expect(page.getByTestId(id), id).toHaveCount(0);
      const own = key === "studentAn" ? AN : NG;
      for (const h of allHrefs("parent", own).filter((x) => !x.startsWith("/?"))) expect(await status(page, h), h).toBe(404);
    });
  }

  test("old deep links still open, inside the shell", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    for (const h of ["/review", "/review/skills", "/review/studio", `/learners/${NG}/levels`, `/learners/${NG}/weak`, `/learners/${NG}/notes/new`, `/learners/${NG}/assign`, `/studio/new?learner=${NG}`, "/feedback"]) {
      expect(await status(page, h), h).toBe(200);
      await expect(page.getByTestId("staff-shell"), h).toBeVisible();
    }
  });

  test("Chờ duyệt: a compact table with no button; a row opens the existing review page", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.getByTestId("nav-inbox").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${AN}/inbox$`));
    await expect(page.getByTestId("pending-page")).toBeVisible();
    await expect(page.getByTestId("pending-table").getByRole("button")).toHaveCount(0);
    // Other specs run in parallel and may decide the seeded work, so the list can be empty: then the empty line shows.
    const open = page.locator('[data-testid^="pending-open-"]');
    if ((await open.count()) === 0) {
      await expect(page.getByTestId("pending-empty")).toBeVisible();
      return;
    }
    await open.first().click();
    await expect(page).toHaveURL(/\/(review\/[0-9a-f-]{36}|review\/(skills|studio)(\?.*)?(#.*)?|studio\/drafts\/[0-9a-f-]{36}|curricula\/versions\/[0-9a-f-]{36})$/);
  });

  test("phone 390px: no sideways scroll, a 44px menu button opens the sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "tutorNguyen");
    for (const h of ["/", `/learners/${NG}/inbox`, `/learners/${NG}/levels`, `/learners/${NG}/curricula`, `/learners/${NG}/assign`]) {
      await page.goto(h);
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(sw, h).toBeLessThanOrEqual(cw);
    }
    await page.goto("/");
    await expect(page.getByTestId("staff-sidebar")).toBeHidden();
    const toggle = page.getByTestId("nav-menu-toggle");
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await toggle.click();
    await expect(page.getByTestId("nav-profile")).toBeVisible();
    expect((await page.getByTestId("nav-profile").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId("feedback-link-phone")).toBeVisible();
  });
});
