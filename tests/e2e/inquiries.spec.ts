import { expect, test, type Page } from "@playwright/test";
import { inquiriesPage, learnerWithTrack } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";
import { LEARNER_IDS, loginAs } from "./helpers";

const AN = "An (thử)";
const NGUYEN = "Nguyên (thử)";
// Dates are relative to today (Asia/Ho_Chi_Minh): assign and reschedule dates must lie in [today - 7, today + 120].
const RESCHEDULE_TO = addDays(todayVn(), 5);
const RESCHEDULE_API = addDays(todayVn(), 6);
const TOO_FAR = addDays(todayVn(), 200);
const url = (who: "an" | "nguyen") => `/learners/${LEARNER_IDS[who]}/inquiries`;

async function notFound(page: Page, target: string) {
  const res = await page.goto(target);
  expect(res?.status(), target).toBe(404);
}

type ApiInquiries = { inquiries: { templateId: string; steps: { activityId: string; stepNo: number }[] }[] };

async function activityIdOf(page: Page, who: "an" | "nguyen", templateId: string, stepNo: number): Promise<string> {
  const res = await page.request.get(`/api/learners/${LEARNER_IDS[who]}/inquiries`);
  expect(res.status()).toBe(200);
  const text = await res.text();
  // answer keys, model answers, tutor scripts and transcripts never travel through this route
  for (const forbidden of ['"answer"', "explanation_vi", "prompt_vi", "review_note", "transcript"]) {
    expect(text).not.toContain(forbidden);
  }
  const data = JSON.parse(text) as ApiInquiries;
  const step = data.inquiries.find((q) => q.templateId === templateId)?.steps.find((s) => s.stepNo === stepNo);
  expect(step, `${templateId} step ${stepNo}`).toBeTruthy();
  return step!.activityId;
}

test.describe("parent: assign and schedule", () => {
  test("opens An's page from the home card, sees the seeded inquiry, and assigns another one", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto(`/?learner=${LEARNER_IDS.an}`);
    await expect(page.getByTestId(`learner-option-${LEARNER_IDS.an}`)).toContainText(learnerWithTrack(AN, "A"));
    await page.getByTestId("nav-assign").click();
    await page.getByTestId("nav-assign-inquiries").click();
    await expect(page).toHaveURL(new RegExp(`${url("an")}$`));
    await expect(page.getByRole("heading", { level: 1, name: inquiriesPage.title(AN) })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: inquiriesPage.availableTitle })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: inquiriesPage.assignedTitle, exact: true })).toBeVisible();

    // seed-dev already assigned A-W1 to An (thử)
    await expect(page.getByTestId("inquiry-A-W1-VOLCANOES").first()).toBeVisible();

    // Track A templates only
    await expect(page.getByTestId("template-A-W2-WATERCYCLE")).toBeVisible();
    await expect(page.getByTestId("template-B-W0-BASELINE")).toHaveCount(0);

    const assignButton = page.getByTestId("template-A-W2-WATERCYCLE").getByRole("button", { name: inquiriesPage.assignButton, exact: true });
    await assignButton.click();
    await expect(page.getByTestId("inquiry-A-W2-WATERCYCLE").first()).toBeVisible();
    // the confirmation stays and the same values cannot be submitted twice; a new due date re-enables the button
    await expect(page.getByTestId("template-A-W2-WATERCYCLE").getByText(inquiriesPage.assignDone)).toBeVisible();
    await expect(assignButton).toBeDisabled();
    const dueInput = page.getByTestId("template-A-W2-WATERCYCLE").getByLabel(inquiriesPage.dueLabel);
    await dueInput.fill(addDays(await dueInput.inputValue(), 1));
    await expect(assignButton).toBeEnabled();
    await expect(page.getByTestId("inquiry-A-W2-WATERCYCLE").first().getByRole("listitem").first()).toBeVisible();
  });

  test("Nguyên's page offers Track B templates only", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto(url("nguyen"));
    await expect(page.getByRole("heading", { level: 1, name: inquiriesPage.title(NGUYEN) })).toBeVisible();
    await expect(page.getByTestId("template-B-W0-BASELINE")).toBeVisible();
    await expect(page.getByTestId("template-A-W1-VOLCANOES")).toHaveCount(0);
  });

  test("reschedule needs a reason (UI and API); skip and unskip work and show the effective date", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto(url("an"));
    const step1 = page.getByTestId("step-A-W1-VOLCANOES-1").first();

    // UI: no reason → blocked, no request leaves the browser
    let sent = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/events")) sent += 1;
    });
    await step1.getByRole("button", { name: inquiriesPage.reschedule, exact: true }).click();
    await step1.getByLabel(inquiriesPage.newDate).fill(RESCHEDULE_TO);
    await step1.getByRole("button", { name: inquiriesPage.save, exact: true }).click();
    await expect(step1.getByRole("alert")).toHaveText(inquiriesPage.reasonRequired);
    expect(sent).toBe(0);

    // UI: with a reason → saved, shown as the effective date, reason visible
    await step1.getByLabel(inquiriesPage.reasonLabel).fill("Em có lịch học thêm");
    await step1.getByRole("button", { name: inquiriesPage.save, exact: true }).click();
    await expect(step1.getByText(inquiriesPage.scheduledFor(formatDateVi(RESCHEDULE_TO)))).toBeVisible();
    await expect(step1.getByText(inquiriesPage.lastReason("Em có lịch học thêm"))).toBeVisible();

    // API: missing / blank reason → 400, nothing recorded
    const activityId = await activityIdOf(page, "an", "A-W1-VOLCANOES", 1);
    for (const body of [
      { kind: "reschedule", new_date: RESCHEDULE_API },
      { kind: "reschedule", new_date: RESCHEDULE_API, reason: "   " },
      { kind: "skip", reason: "" },
      { kind: "reschedule", new_date: TOO_FAR, reason: "Ngày xa quá" }, // outside [today - 7, today + 120]
    ]) {
      const res = await page.request.post(`/api/activities/${activityId}/events`, { data: body });
      expect(res.status(), JSON.stringify(body)).toBe(400);
    }

    // skip / unskip on step 2
    const step2 = page.getByTestId("step-A-W1-VOLCANOES-2").first();
    await step2.getByRole("button", { name: inquiriesPage.skip, exact: true }).click();
    await step2.getByLabel(inquiriesPage.reasonLabel).fill("Nghỉ lễ");
    await step2.getByRole("button", { name: inquiriesPage.save, exact: true }).click();
    await expect(step2.getByText(inquiriesPage.skippedTag, { exact: true })).toBeVisible();
    await step2.getByRole("button", { name: inquiriesPage.unskip, exact: true }).click();
    await step2.getByLabel(inquiriesPage.reasonLabel).fill("Học bù tuần sau");
    await step2.getByRole("button", { name: inquiriesPage.save, exact: true }).click();
    await expect(step2.getByText(inquiriesPage.skippedTag, { exact: true })).toHaveCount(0);
  });
});

test.describe("tutors only reach their own learner", () => {
  test("tutor of Nguyên: own page OK, An's page and API are 404 without revealing An", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    const res = await page.goto(url("nguyen"));
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("inquiry-B-W0-BASELINE").first()).toBeVisible();

    await notFound(page, url("an"));
    expect(await page.locator("body").innerText()).not.toContain(AN);

    for (const path of [
      `/api/learners/${LEARNER_IDS.an}/inquiries`,
      `/api/learners/${LEARNER_IDS.an}/templates`,
    ]) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
    const post = await page.request.post(`/api/learners/${LEARNER_IDS.an}/inquiries`, {
      data: { template_id: "A-W3-EARTHQUAKES", version: 1, due_on: addDays(todayVn(), 10), client_request_id: "e2e-tutor-outside-scope" },
    });
    expect(post.status()).toBe(404);
  });

  test("tutor of An can open An's page; Nguyên's is 404", async ({ page }) => {
    await loginAs(page, "tutorAn");
    expect((await page.goto(url("an")))?.status()).toBe(200);
    await notFound(page, url("nguyen"));
  });
});

test.describe("students never get this page or these routes", () => {
  for (const [key, own, other] of [
    ["studentAn", "an", "nguyen"],
    ["studentNguyen", "nguyen", "an"],
  ] as const) {
    test(`${key}: no link, pages are 404, routes refuse`, async ({ page }) => {
      await loginAs(page, key);
      await expect(page.getByRole("link", { name: inquiriesPage.link, exact: true })).toHaveCount(0);
      await notFound(page, url(own));
      await notFound(page, url(other));

      expect((await page.request.get(`/api/learners/${LEARNER_IDS[own]}/inquiries`)).status()).toBe(403);
      expect((await page.request.get(`/api/learners/${LEARNER_IDS[own]}/templates`)).status()).toBe(403);
      expect((await page.request.get(`/api/learners/${LEARNER_IDS[other]}/inquiries`)).status()).toBe(404);
      const assign = await page.request.post(`/api/learners/${LEARNER_IDS[own]}/inquiries`, {
        data: { template_id: "A-W3-EARTHQUAKES", version: 1, due_on: addDays(todayVn(), 10), client_request_id: "e2e-student-assign-1" },
      });
      expect(assign.status()).toBe(403);
    });
  }
});

test.describe("anonymous", () => {
  test("pages redirect to login and routes answer 401", async ({ page, request }) => {
    await page.goto(url("an"));
    await expect(page).toHaveURL(/\/login/);
    expect((await request.get(`/api/learners/${LEARNER_IDS.an}/inquiries`)).status()).toBe(401);
    expect((await request.get(`/api/learners/${LEARNER_IDS.an}/templates`)).status()).toBe(401);
  });
});
