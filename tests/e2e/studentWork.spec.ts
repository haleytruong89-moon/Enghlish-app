import { expect, test, type Page } from "@playwright/test";
import { playerCopy, studentDeskCopy, work } from "@/lib/copy/vi";
import { LEARNER_IDS, loginAs, studentVisibleText } from "./helpers";

// S4: the child's side. The dev seed starts the test learners' week 3 days ago, so An has steps 1-7 of A-W1-VOLCANOES
// released (step 3 = reading + questions, step 6 = writing, step 4 = canvas which is still on paper) and Nguyên has all of
// B-W0-BASELINE (step 1 reading, step 5 writing, step 6 live speaking). The S2 spec reschedules / skips An's steps 1 and 2,
// so this file never depends on them.

type ApiHome = { learner: { alias: string }; inquiries: { titleVi: string; steps: { activityId: string; stepNo: number; activityType: string; attempts: number }[] }[] };

/** Steps of the inquiry whose title contains `title` (An may get other inquiries from the S2 spec; they are not this file's business). */
async function homeSteps(page: Page, title: string): Promise<Map<number, { activityId: string; activityType: string; attempts: number }>> {
  const res = await page.request.get("/api/student/home");
  expect(res.status()).toBe(200);
  const data = (await res.json()) as ApiHome;
  const map = new Map<number, { activityId: string; activityType: string; attempts: number }>();
  for (const q of data.inquiries.filter((i) => i.titleVi.includes(title))) for (const s of q.steps) map.set(s.stepNo, s);
  return map;
}

const AN_TITLE = "Núi lửa";
const NGUYEN_TITLE = "Baseline";
/** A task of Hôm nay: step `stepNo` of the weekly topic called `title`. */
const row = (page: Page, title: string, stepNo: number) => page.locator(`[data-testid="task-row"][data-step="${stepNo}"]`).filter({ hasText: title });

const FORBIDDEN_KEYS = ["auto_check", "autoCheck", "explanation_vi", "prompt_vi", "transcript", "review_note", "target_id", "target_ids", '"answer"', "needs_person", "incorrect", "score"];

function expectNoResults(text: string) {
  for (const k of FORBIDDEN_KEYS) expect(text, k).not.toContain(k);
}

test.describe("An (thử): reading step, writing step, receipts", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 390, height: 844 } });

  test("home shows the next task, answers a reading step, declares help, submits and sees a receipt without any result", async ({ page }) => {
    await loginAs(page, "studentAn");
    await expect(page.getByTestId("continue-card")).toBeVisible();
    await expect(page.getByTestId("continue-card").getByRole("link").first()).toBeVisible();
    await expect(page.getByTestId("today-lead")).toContainText(studentDeskCopy.leadStart);
    // no sideways scrolling on a phone
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // steps that are not in the app yet have a neutral label and no link
    await expect(row(page, AN_TITLE, 4)).toContainText(work.noAppYet);
    await expect(row(page, AN_TITLE, 4).getByRole("link")).toHaveCount(0);

    await row(page, AN_TITLE, 3).getByRole("link").click();
    await expect(page).toHaveURL(/\/activities\/[0-9a-f-]{36}$/);
    // a one-time check is a test for the child: one question at a time, no hint slot
    await expect(page.getByTestId("test-line")).toBeVisible();
    await expect(page.getByTestId("ask-tutor")).toHaveCount(0);
    await expect(page.getByTestId("source-text")).toContainText("Deep under the ground");
    const dotButtons = page.getByTestId("question-dots").getByRole("button");

    // answer: one multiple-choice, one short answer
    await page.getByTestId("question-W1-R1").getByLabel("b) why volcanoes erupt, and why eruptions are different", { exact: true }).check();
    await page.getByTestId("player-next").click();
    const short = page.getByTestId("question-W1-R2").getByRole("textbox");
    await short.fill("Melted rock under the ground.");
    await short.press("Tab"); // leaving the field saves the draft
    await page.getByTestId("player-next").click(); // moving on saves too
    await expect(page.getByTestId("save-status")).toContainText(playerCopy.saved);

    // the draft survives a reload and the player opens on the first question without an answer (question 3)
    await page.reload();
    await expect(page.getByTestId("question-W1-R3")).toBeVisible();
    await dotButtons.nth(1).click();
    await expect(page.getByTestId("question-W1-R2").getByRole("textbox")).toHaveValue("Melted rock under the ground.");
    await dotButtons.nth(0).click();
    await expect(page.getByTestId("question-W1-R1").getByLabel("b) why volcanoes erupt, and why eruptions are different", { exact: true })).toBeChecked();

    // help must be declared first
    await page.getByTestId("player-submit-top").click();
    await expect(page.getByTestId("player-missing")).toBeVisible();
    await page.getByTestId("player-submit").click();
    await expect(page.getByTestId("problem")).toHaveText(work.needHelp);
    await page.getByLabel(work.help.none).check();
    const [sent] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/attempts") && r.request().method() === "POST"),
      page.getByTestId("player-submit").click(),
    ]);
    expect(sent.status(), `POST /api/attempts answered: ${await sent.text()}`).toBe(201);

    // S-10: the result screen (a test: no retry), never a score, an answer or a right / wrong count
    const resultScreen = page.getByTestId("result-view");
    await expect(resultScreen).toBeVisible();
    await expect(resultScreen).toHaveAttribute("data-test", "yes");
    await expect(page.getByTestId("result-test-note")).toBeVisible();
    await expect(page.locator('[data-testid^="retry-open-"]')).toHaveCount(0);
    const html = await page.content();
    expectNoResults(html);
    expect(html).not.toMatch(/\d\s*\/\s*4\s*·/);
    expect(await studentVisibleText(page)).not.toMatch(/Đúng|Chưa đúng|Sai rồi|đáp án đúng|Nên là|Vì sao/i);

    // back on the home page the step is done and the next task moved on
    await page.getByTestId("result-home").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(row(page, AN_TITLE, 3)).toHaveCount(0); // a sent step is no longer a task…
    await page.reload();
    await expect(row(page, AN_TITLE, 3)).toHaveCount(0);
    await page.goto("/done"); // …it is in "Đã làm", waiting for the tutor
    const sentRow = page.getByTestId("history-row").filter({ hasText: AN_TITLE }).first();
    await expect(sentRow).toBeVisible();
    await expect(sentRow.getByTestId("history-status")).toHaveText(studentDeskCopy.statusWaiting);
  });

  test("a one-time check cannot be done twice: the page has no form any more and the API says 409", async ({ page }) => {
    await loginAs(page, "studentAn");
    const steps = await homeSteps(page, AN_TITLE);
    const step3 = steps.get(3)!;
    expect(step3.attempts).toBe(1);
    await page.goto(`/activities/${step3.activityId}`);
    await expect(page.getByTestId("already-submitted")).toContainText("Bạn đã nộp bài này lúc");
    await expect(page.getByRole("button", { name: work.submit, exact: true })).toHaveCount(0);

    const res = await page.request.post("/api/attempts", {
      data: {
        activity_id: step3.activityId,
        client_submission_id: "6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a",
        content: { answers: { "W1-R2": "Another try." } },
        assistance: ["none"],
        provenance: "in_app",
      },
    });
    expect(res.status()).toBe(409);
    const text = await (await page.request.get(`/api/student/activities/${step3.activityId}`)).text();
    expectNoResults(text);
    expect(JSON.parse(text).activity.attempts).toHaveLength(1);
  });

  test("writing step: word count, autosave, a pasted text is declared, the receipt arrives; retry is allowed in practice", async ({ page }) => {
    await loginAs(page, "studentAn");
    const steps = await homeSteps(page, AN_TITLE);
    const step6 = steps.get(6)!;
    await page.goto(`/activities/${step6.activityId}`);
    await expect(page.getByTestId("mode-banner")).toContainText("Luyện tập");

    const editor = page.getByLabel(work.writeLabel, { exact: true });
    await editor.fill("Magma is melted rock under the ground, but lava is magma that comes out of a volcano.");
    await expect(page.getByTestId("word-count")).toHaveText(work.wordCount(17));
    await editor.press("Tab");
    await expect(page.getByTestId("save-status")).toContainText("Đã tự lưu lúc");

    await editor.dispatchEvent("paste");
    await expect(page.getByText(work.pastedNote)).toBeVisible();
    await expect(page.getByLabel(work.pastedLabel)).toBeChecked();
    await expect(page.getByLabel(work.pastedLabel)).toBeDisabled();

    await page.getByLabel(work.help.dictionary).check();
    await page.getByRole("button", { name: work.submit, exact: true }).click();
    await expect(page.getByTestId("receipt").getByRole("status")).toHaveText(/^Đã nộp lúc \d{2}:\d{2}$/);

    // the attempt is recorded as pasted; the child's view has no result of any kind
    const body = await (await page.request.get(`/api/student/activities/${step6.activityId}`)).text();
    expectNoResults(body);
    const activity = JSON.parse(body).activity as { attempts: { attemptNo: number; provenance: string }[]; canSubmit: boolean };
    expect(activity.attempts).toEqual([expect.objectContaining({ attemptNo: 1, provenance: "pasted" })]);
    expect(activity.canSubmit).toBe(true); // practice: may be done again

    await page.getByRole("button", { name: work.retry }).click();
    await expect(page.getByRole("button", { name: work.submitAgain, exact: true })).toBeVisible();
  });

  test("API: the same submission twice gives the same receipt; the same id with other content is 409; a retry is attempt 2", async ({ page }) => {
    await loginAs(page, "studentAn");
    const step6 = (await homeSteps(page, AN_TITLE)).get(6)!;
    const id = "7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b";
    const post = (clientId: string, text: string) =>
      page.request.post("/api/attempts", {
        data: { activity_id: step6.activityId, client_submission_id: clientId, content: { text }, assistance: ["none"], provenance: "in_app" },
      });
    const first = await post(id, "First version of my paragraph.");
    expect(first.status()).toBe(201);
    const receipt1 = (await first.json()).receipt;
    expect(receipt1.attemptNo).toBe(2); // the UI test above made attempt 1
    const again = await post(id, "First version of my paragraph.");
    expect(again.status()).toBe(200);
    expect((await again.json()).receipt).toMatchObject({ attemptId: receipt1.attemptId, attemptNo: 2, hash: receipt1.hash, replayed: true });
    expect((await post(id, "A different paragraph.")).status()).toBe(409);
    const third = await post("8c8c8c8c-8c8c-4c8c-8c8c-8c8c8c8c8c8c", "Third try.");
    expect(third.status()).toBe(201);
    expect((await third.json()).receipt.attemptNo).toBe(3);
    // bad bodies
    for (const data of [
      { activity_id: step6.activityId, client_submission_id: "9d9d9d9d-9d9d-4d9d-8d9d-9d9d9d9d9d9d", content: { text: "x" }, assistance: [], provenance: "in_app" },
      { activity_id: step6.activityId, client_submission_id: "9d9d9d9d-9d9d-4d9d-8d9d-9d9d9d9d9d9d", content: { score: 4 }, assistance: ["none"], provenance: "in_app" },
    ]) {
      expect((await page.request.post("/api/attempts", { data })).status()).toBe(400);
    }
  });

  test("a step the app cannot do yet shows a neutral line and has no submit; the API refuses a submit", async ({ page }) => {
    await loginAs(page, "studentAn");
    const step4 = (await homeSteps(page, AN_TITLE)).get(4)!;
    expect(step4.activityType).toBe("ACT-CANVAS-BASIC");
    await page.goto(`/activities/${step4.activityId}`);
    await expect(page.getByTestId("not-in-app")).toHaveText(work.noAppYet);
    await expect(page.getByRole("button", { name: work.submit })).toHaveCount(0);
    // only the neutral label: no prompt, questions, sources or self-check on the page or in the API
    await expect(page.getByTestId("source-text")).toHaveCount(0);
    await expect(page.getByTestId("mode-banner")).toHaveCount(0);
    const raw = await (await page.request.get(`/api/student/activities/${step4.activityId}`)).text();
    expect(JSON.parse(raw).activity).toMatchObject({ supported: false, statusLabelKey: "on_paper", activityType: "ACT-CANVAS-BASIC" });
    for (const k of ["promptEn", "prompt_en", "items", "selfCheck", "sources", "bigQuestion", "attempts", "draft", "purpose"]) expect(raw, k).not.toContain(k);
    expectNoResults(raw);
    const res = await page.request.post("/api/attempts", {
      data: { activity_id: step4.activityId, client_submission_id: "aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae", content: { text: "x" }, assistance: ["none"], provenance: "in_app" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("Nguyên (thử)", () => {
  test("home shows the baseline reading step; live speaking is labelled with the tutor", async ({ page }) => {
    await loginAs(page, "studentNguyen");
    await expect(page.getByTestId("continue-card")).toBeVisible();
    await expect(row(page, NGUYEN_TITLE, 6)).toContainText(work.withTutor);
    await expect(row(page, NGUYEN_TITLE, 6).getByRole("link")).toHaveCount(0);

    await row(page, NGUYEN_TITLE, 1).getByRole("link").click();
    await expect(page.getByTestId("source-text").first()).toBeVisible();
    await expect(page.getByTestId("work-kind")).toBeVisible();
    // the technical code of the activity never shows
    expect(await page.locator("body").innerText()).not.toMatch(/ACT-|baseline|INDEPENDENT_CHECK/);

    const live = (await homeSteps(page, NGUYEN_TITLE)).get(6)!;
    await page.goto(`/activities/${live.activityId}`);
    await expect(page.getByTestId("not-in-app")).toHaveText(work.withTutor);
    // the baseline reading turned over (live speaking) hands over no text through the API either
    const raw = await (await page.request.get(`/api/student/activities/${live.activityId}`)).text();
    expect(JSON.parse(raw).activity).toMatchObject({ supported: false, statusLabelKey: "with_tutor" });
    for (const k of ["promptEn", "items", "selfCheck", "sources", "text"]) expect(raw, k).not.toContain(k);
  });
});

test.describe("who can reach what", () => {
  test("Nguyên cannot open, save into or submit An's step (404), An cannot open Nguyên's", async ({ page, browser }) => {
    const ctx = await browser.newContext();
    const anPage = await ctx.newPage();
    await loginAs(anPage, "studentAn");
    const anStep3 = (await homeSteps(anPage, AN_TITLE)).get(3)!;
    await loginAs(page, "studentNguyen");
    const ngStep1 = (await homeSteps(page, NGUYEN_TITLE)).get(1)!;

    const res = await page.goto(`/activities/${anStep3.activityId}`);
    expect(res?.status()).toBe(404);
    expect(await page.locator("body").innerText()).not.toContain("Deep under the ground");
    expect((await page.request.get(`/api/student/activities/${anStep3.activityId}`)).status()).toBe(404);
    expect((await page.request.put(`/api/drafts/${anStep3.activityId}`, { data: { content: { text: "x" } } })).status()).toBe(404);
    expect(
      (
        await page.request.post("/api/attempts", {
          data: { activity_id: anStep3.activityId, client_submission_id: "bfbfbfbf-bfbf-4fbf-8fbf-bfbfbfbfbfbf", content: { text: "x" }, assistance: ["none"], provenance: "in_app" },
        })
      ).status(),
    ).toBe(404);
    expect((await anPage.request.get(`/api/student/activities/${ngStep1.activityId}`)).status()).toBe(404);
    expect((await anPage.goto(`/activities/${ngStep1.activityId}`))?.status()).toBe(404);
    await ctx.close();
  });

  test("staff cannot use the student routes (403) and see no student page (404)", async ({ browser }) => {
    const ctx = await browser.newContext();
    const anPage = await ctx.newPage();
    await loginAs(anPage, "studentAn");
    const anStep3 = (await homeSteps(anPage, AN_TITLE)).get(3)!;
    await ctx.close();

    for (const key of ["tutorAn", "parent"] as const) {
      const ctx2 = await browser.newContext();
      const p = await ctx2.newPage();
      await loginAs(p, key);
      expect((await p.request.get("/api/student/home")).status(), `${key} home`).toBe(403);
      expect((await p.request.get(`/api/student/activities/${anStep3.activityId}`)).status(), `${key} activity`).toBe(403);
      expect((await p.request.put(`/api/drafts/${anStep3.activityId}`, { data: { content: { text: "x" } } })).status(), `${key} draft`).toBe(403);
      const submit = await p.request.post("/api/attempts", {
        data: { activity_id: anStep3.activityId, client_submission_id: "cfcfcfcf-cfcf-4fcf-8fcf-cfcfcfcfcfcf", content: { text: "x" }, assistance: ["none"], provenance: "in_app" },
      });
      expect(submit.status(), `${key} submit`).toBe(403);
      expect((await p.goto(`/activities/${anStep3.activityId}`))?.status(), `${key} page`).toBe(404);
      await ctx2.close();
    }
  });

  test("tutor of Nguyên: An's activity is 404 for the API too", async ({ page, browser }) => {
    const ctx = await browser.newContext();
    const anPage = await ctx.newPage();
    await loginAs(anPage, "studentAn");
    const anStep3 = (await homeSteps(anPage, AN_TITLE)).get(3)!;
    await ctx.close();
    await loginAs(page, "tutorNguyen");
    expect((await page.request.get(`/api/student/activities/${anStep3.activityId}`)).status()).toBe(404);
    expect((await page.request.get(`/api/student/home`)).status()).toBe(403);
  });

  test("anonymous: routes answer 401", async ({ request }) => {
    expect((await request.get("/api/student/home")).status()).toBe(401);
    expect((await request.get("/api/student/activities/11111111-1111-4111-8111-111111111111")).status()).toBe(401);
    expect((await request.put("/api/drafts/11111111-1111-4111-8111-111111111111", { data: { content: {} } })).status()).toBe(401);
    expect((await request.post("/api/attempts", { data: {} })).status()).toBe(401);
  });
});

test("learner ids used here are the seeded test learners", () => {
  expect(LEARNER_IDS.an).not.toBe(LEARNER_IDS.nguyen);
});
