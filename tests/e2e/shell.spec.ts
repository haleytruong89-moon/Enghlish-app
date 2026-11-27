import { expect, test, type Page } from "@playwright/test";
import { deskCopy, pendingCopy } from "@/lib/copy/vi";
import { buildNav, type NavRole } from "@/lib/shell/nav";
import { LEARNER_IDS, loginAs, type AccountKey } from "./helpers";

const AN = LEARNER_IDS.an;
const NG = LEARNER_IDS.nguyen;
const allHrefs = (role: NavRole, id: string) => {
  const n = buildNav(role, id, { revisionsReady: true });
  return [...n.quick.map((q) => q.href), ...n.sections.flatMap((s) => [s.href, ...s.children.map((c) => c.href)]), ...n.parent.map((p) => p.href)].filter((h): h is string => h !== null);
};
const childScoped = (h: string) => h.startsWith("/learners/") || h.startsWith("/studio/new");
// Many links per test: ask for the status without rendering/waiting for "load" (the cold server made two tests hit the 30 s limit).
async function status(page: Page, href: string) { return (await page.request.get(href)).status(); }

test.describe("workdesk shell", () => {
  test("the tutor lands on Hôm nay with the sidebar; quick buttons and Chờ duyệt are above the fold at 1366×768", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await loginAs(page, "tutorNguyen");
    await expect(page.getByTestId("staff-sidebar")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: deskCopy.title("Nguyên (thử)") })).toBeVisible();
    await expect(page.getByTestId("nav-desk")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-plan")).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("quick-grade")).toBeVisible();
    await expect(page.getByTestId("learner-switcher")).toHaveCount(0);
    await expect(page.getByTestId("shell-learner")).toContainText("Nguyên (thử)");
    await expect(page.locator("#desk-inbox-title")).toContainText(pendingCopy.deskTitleUnknown);
    const box = await page.getByTestId("desk-inbox").boundingBox();
    expect(box && box.y + 40).toBeLessThan(768);
    // "Góp ý về app" sits at the bottom of the left column: with the quick buttons it may sit under the fold, but it is reachable.
    await page.getByTestId("feedback-link").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("feedback-link")).toBeInViewport();
  });

  test("hướng B: 3 quick buttons + 6 sections; Bài tập has the result buttons; the Chấm bài number appears after the page", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await expect(page.getByTestId("staff-sidebar")).toBeVisible();
    for (const k of ["grade", "assign", "note"]) await expect(page.getByTestId(`quick-${k}`), k).toBeVisible();
    for (const k of ["desk", "work", "sessions", "progress", "plan", "profile"]) await expect(page.getByTestId(`nav-${k}`), k).toBeVisible();
    await page.getByTestId("quick-assign").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/assign$`));
    await expect(page.getByTestId("way-cards")).toBeVisible();
    await expect(page.getByTestId("nav-work")).toHaveAttribute("aria-current", "page");
    await page.getByTestId("nav-work").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/assigned$`));
    await page.getByTestId("board-tab-drafts").click();
    await expect(page.getByTestId("assigned-board")).toHaveAttribute("data-tab", "drafts");
    await page.getByTestId("board-import").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/imports/new$`));
    await expect(page.getByTestId("nav-work")).toHaveAttribute("aria-current", "page");
    await page.getByTestId("nav-plan").click();
    await page.getByTestId("section-tab-roadmap").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/roadmap$`));
    // Other specs run in parallel and may change the number, so assert only the format, after a fresh page load (never a false or empty badge).
    const res = await page.request.get(`/api/learners/${NG}/pending-count`);
    expect(res.status()).toBe(200);
    expect(Object.keys(await res.json()).sort()).toEqual(["count", "work"]);
    await page.reload();
    await expect(page.getByTestId("staff-sidebar")).toBeVisible();
    const badge = page.getByTestId("grade-badge");
    if ((await badge.count()) > 0) await expect(badge).toHaveText(/^(≥ )?[1-9]\d*$/);
  });

  test("hướng B: Tiến bộ opens Tổng quan (4 tiles); its tabs reach Theo Unit, Bản đồ kiến thức and Hồ sơ cấp; Hồ sơ học sinh holds the notes", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.getByTestId("nav-progress").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/progress$`));
    await expect(page.getByTestId("action-cards")).toHaveCount(0); // Việc nên làm lives only on Hôm nay
    const view = page.getByTestId("results-view");
    if ((await page.getByTestId("results-unavailable").count()) === 0) {
      await expect(view).toHaveAttribute("data-tab", "overview");
      for (const id of ["tile-sent", "tile-firsttry", "tile-waiting", "tile-unit"]) await expect(page.getByTestId(id), id).toBeVisible();
    }
    await page.goto(`/learners/${NG}/progress?tab=work`); // the old tab opens Tổng quan
    if ((await page.getByTestId("results-unavailable").count()) === 0) await expect(page.getByTestId("results-view")).toHaveAttribute("data-tab", "overview");
    await page.getByTestId("section-tab-unit").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/progress\\?tab=unit$`));
    await page.getByTestId("section-tab-tag").click();
    await page.getByTestId("results-knowledge-link").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/knowledge$`));
    await expect(page.getByTestId("section-tab-tag")).toHaveAttribute("aria-current", "page");
    await page.getByTestId("section-tab-levels").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/levels$`));
    await page.getByTestId("nav-profile").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/profile$`));
    await expect(page.getByTestId("profile-page")).toBeVisible();
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
    await expect(page.getByTestId("nav-progress")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("levels-sub-weak")).toHaveAttribute("aria-current", "page");
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
    for (const h of ["/review", "/review/skills", "/review/studio", `/learners/${NG}/levels`, `/learners/${NG}/weak`, `/learners/${NG}/notes/new`, `/learners/${NG}/assign`, `/learners/${NG}/inbox`, `/learners/${NG}/knowledge`, `/learners/${NG}/curricula`, `/learners/${NG}/roadmap`, `/learners/${NG}/progress`, `/learners/${NG}/progress?tab=work`, `/learners/${NG}/profile`, `/studio/new?learner=${NG}`, "/feedback"]) {
      expect(await status(page, h), h).toBe(200);
      await expect(page.getByTestId("staff-shell"), h).toBeVisible();
    }
  });

  test("Chờ duyệt (from Hôm nay): a compact table with no button; a row opens the existing review page", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.getByTestId("desk-inbox-open").click();
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
    await expect(page.getByTestId("quick-grade")).toBeVisible();
    await expect(page.getByTestId("staff-sidebar")).toBeHidden();
    const toggle = page.getByTestId("nav-menu-toggle");
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await toggle.click();
    await expect(page.getByTestId("nav-profile")).toBeVisible();
    expect((await page.getByTestId("nav-profile").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId("feedback-link-phone")).toBeVisible();
  });
});

test.describe("27/11 · Hướng dẫn + Bắt đầu với …", () => {
  test("the tutor opens the tour from the top bar, walks it, and Hôm nay shows the first six things with links", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await loginAs(page, "tutorNguyen");
    // Under automation the tour never opens by itself (it would cover the page); the button opens it.
    await expect(page.getByTestId("tour")).toHaveCount(0);
    await page.getByTestId("tour-open").click();
    await expect(page.getByTestId("tour-step-welcome")).toBeVisible();
    await page.getByTestId("tour-next").click();
    await expect(page.getByTestId("tour-step-grade")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tour")).toHaveCount(0);
    const start = page.getByTestId("start-checklist");
    if (await start.count()) {
      await expect(start.locator('[data-testid^="start-"][data-done]')).toHaveCount(6);
    }
  });
});
