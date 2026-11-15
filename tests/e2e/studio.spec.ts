import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { aiSettingsCopy, levelLabels, pdfPickCopy, pendingCopy, playerCopy, resultCopy, retryCopy, studioInboxCopy, work } from "@/lib/copy/vi";
import { KEY_RECOMMEND, PAGE_LIMITS } from "@/lib/pdf/limits";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { makeDocx } from "../unit/fixtures/docx";
import { LEARNER_IDS, loginAs, studentVisibleText } from "./helpers";

// Studio B1 end to end on the TEST family with AI_FAKE=1 (CI). Serial: each step builds on the previous one.
test.describe.configure({ mode: "serial" });
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL for the read-only checks");

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
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
let draftUrl = "";
let activityId = "";
const SCORE = /\d+\s*\/\s*\d+|%/;

test("the parent turns AI on (one ai_text consent per child)", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/settings/ai");
  // curriculum.spec (W2) may already have turned AI on in an earlier project: only click when it is still off.
  await expect(page.getByTestId("ai-enable").or(page.getByTestId("ai-disable"))).toBeVisible();
  if (await page.getByTestId("ai-enable").isVisible()) await page.getByTestId("ai-enable").click();
  await expect(page.getByTestId("ai-state")).toHaveText(aiSettingsCopy.on);
  expect((await q("select 1 from english.consents where scope = 'ai_text' and granted and learner_id = $1", [NGUYEN])).length).toBeGreaterThan(0);
});

test("Nguyên's tutor uploads a PDF + a Word key, the AI draft is blocked by item 8, fixing it allows Duyệt, then Giao", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.getByTestId("nav-assign").click();
  await page.getByTestId("way-choose-studio").click();
  await page.getByTestId("studio-title").fill("Destination B1 — Unit 5 (e2e)");
  await expect(page.getByTestId("page-guidance")).toContainText(pdfPickCopy.guidance.studio(PAGE_LIMITS.studio, KEY_RECOMMEND));
  await page.getByTestId("studio-test-file").setInputFiles({ name: "de.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByTestId("studio-key-file").setInputFiles({
    name: "dap-an.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: makeDocx(["1B 2A 3A 4C 5B"]),
  });
  await page.getByTestId("studio-start-ai").click();
  await expect(page).toHaveURL(/\/studio\/drafts\/[0-9a-f-]{36}$/);
  draftUrl = page.url();
  await expect(page.getByTestId("studio-draft")).toHaveAttribute("data-status", "draft", { timeout: 30_000 });
  await expect(page.getByTestId("issue-8-missing_key")).toBeVisible();
  await expect(page.getByTestId("studio-approve")).toBeDisabled();
  await expect(page.getByTestId("side-ai-cost")).toHaveCount(0); // a tutor never sees AI cost
  await page.getByTestId("item-8-key").fill("is said to be");
  await expect(page.getByTestId("studio-approve")).toBeEnabled();
  await page.getByTestId("studio-approve").click();
  await expect(page.getByTestId("approved-box")).toBeVisible();
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("assigned-list").locator("li")).toHaveCount(1);
  const row = await q<{ id: string }>(
    `select a.id from english.activity_instances a join english.inquiry_instances i on i.id = a.inquiry_instance_id
     join english.inquiry_templates t on t.id = i.template_id and t.version = i.template_version
     where t.kind = 'studio' and a.learner_id = $1 order by i.assigned_at desc limit 1`, [NGUYEN]);
  activityId = row[0]!.id;
});

async function answer(page: Page, id: string, value: string, choice = false) {
  const box = page.getByTestId(`question-${id}`);
  if (choice) await box.getByLabel(value, { exact: true }).check();
  else await box.getByRole("textbox").fill(value);
}

/** W4c2: the questions come one at a time. Walk q1..q8, answer the ones given, then "Xem lại và nộp", declare no help and send. */
async function doTheTest(page: Page, answers: Record<string, { v: string; choice?: boolean }>) {
  for (const id of ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"]) {
    const a = answers[id];
    if (a) await answer(page, id, a.v, a.choice);
    if (id === "q8") await page.getByTestId("player-to-review").click();
    else await page.getByTestId("player-next").click();
  }
  await page.getByTestId("help-declaration").getByLabel(work.help.none).check();
  await page.getByTestId("player-submit").click();
}

test("Nguyên does the test one question at a time: he sees which ones to look at again and the ones his tutor will read - never a score, never the right answer", async ({ page }) => {
  await loginAs(page, "studentNguyen");
  await page.goto(`/activities/${activityId}`);
  await expect(page.getByTestId("ask-tutor")).toBeVisible(); // practice work: the dimmed slot
  await doTheTest(page, {
    q1: { v: "B. had", choice: true }, q2: { v: "B. can't", choice: true }, q3: { v: "A. off", choice: true }, q4: { v: "C. A visit that changed Lan's plans", choice: true },
    q6: { v: "happyness" }, q7: { v: "I wish I could" }, q8: { v: "is said to be a" },
  });
  await expect(page.getByTestId("result-view")).toBeVisible();
  for (const id of ["q2", "q5", "q6"]) await expect(page.getByTestId(`result-look-${id}`)).toBeVisible();
  for (const id of ["q7", "q8"]) await expect(page.getByTestId(`result-open-${id}`)).toBeVisible();
  await expect(page.getByTestId("result-others-fine")).toContainText(resultCopy.othersFine);
  const text = await studentVisibleText(page);
  expect(text).not.toMatch(SCORE);
  expect(text).not.toContain("A. must"); // the model answer
  expect(text).not.toContain("happiness");
  expect(text).not.toContain("Nên là");
  expect(text).not.toMatch(/đúng\s+\d/);
});

test("Nguyên retries one question once; he is told it went to the tutor, no score; the tutor sees the retry beside the first answer", async ({ page, browser }) => {
  await loginAs(page, "studentNguyen");
  await page.goto(`/activities/${activityId}`);
  await page.getByTestId("retry-open-q2").click();
  await page.getByTestId("retry-box-q2").getByLabel("A. must", { exact: true }).check(); // a multiple-choice item retries with the choices
  await page.getByTestId("retry-send-q2").click();
  await expect(page.getByTestId("retry-sent-q2")).toContainText(retryCopy.sent);
  await expect(page.getByTestId("retry-open-q2")).toHaveCount(0); // one retry per question
  const text = await studentVisibleText(page, "result-view");
  expect(text).not.toMatch(SCORE);
  expect(text).not.toMatch(/đúng\s+\d|Nên là|Vì sao|đáp án đúng/i);
  await page.reload();
  await expect(page.getByTestId("retry-sent-q2")).toBeVisible();
  await expect(page.getByTestId("retry-open-q2")).toHaveCount(0);

  const tutor = await (await browser.newContext()).newPage();
  await loginAs(tutor, "tutorNguyen");
  await tutor.goto(`/learners/${NGUYEN}/inbox`);
  const attemptId = (await q<{ id: string }>("select id from english.attempts where activity_instance_id = $1 order by attempt_no desc limit 1", [activityId]))[0]!.id;
  await expect(tutor.getByTestId(`pending-row-retry-${attemptId}`)).toContainText(pendingCopy.need.retry(1));
  await tutor.getByTestId(`pending-open-retry-${attemptId}`).click();
  const card = tutor.getByTestId(`retry-card-${attemptId}`);
  await expect(card.getByTestId("retry-given")).toHaveText("B. can't");
  await expect(card.getByTestId("retry-text")).toHaveText("A. must");
});

test("the tutor decides the two waiting items; the result, the tag marks and the skills are updated", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.goto("/review/studio");
  await expect(page.getByTestId("review-tab-studio")).toContainText(studioInboxCopy.tab);
  const card = page.locator('[data-testid^="studio-card-"]').first();
  const attemptId = ((await card.getAttribute("data-testid")) ?? "").replace("studio-card-", "");
  await page.getByTestId(`verdict-${attemptId}-q7-correct`).click();
  await page.getByTestId(`verdict-${attemptId}-q8-correct`).click();
  await page.getByTestId(`studio-save-${attemptId}`).click();
  await expect(page.getByTestId(`studio-line-${attemptId}`)).toContainText(studioInboxCopy.doneLine("Nguyên (thử)", 5, 8));
  const marks = await q<{ tag_key: string }>("select tag_key from english.tag_marks where learner_id = $1 and source = 'practice' order by item_no", [NGUYEN]);
  expect(marks.map((m) => m.tag_key)).toEqual(expect.arrayContaining(["modal-suy-doan", "doc-inference", "dang-tu"]));
  // An item decision after the retry clears the "Con thử lại" row by itself.
  await page.goto(`/learners/${NGUYEN}/inbox`);
  await expect(page.getByTestId("pending-table")).toBeVisible();
  await expect(page.getByTestId(`pending-row-retry-${attemptId}`)).toHaveCount(0);
  // Điểm cần chú ý shows the new tag; the skill page shows a level reached through the app's own checks (route 2)
  const label = (await q<{ label_vi: string }>("select label_vi from english.error_tags where key = 'dang-tu' and track_id = 'B'"))[0]!.label_vi;
  await page.goto(`/learners/${NGUYEN}/weak`);
  await expect(page.locator("main")).toContainText(label);
  // The skill levels are recomputed after the response (after()): poll with a reload instead of reading once.
  await expect(async () => {
    await page.goto(`/learners/${NGUYEN}/targets`);
    await expect(page.getByTestId("skill-row-B-L2-CLOZE")).toContainText(new RegExp(`${levelLabels.SUPPORTED.label}|${levelLabels.DEVELOPING.label}`), { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
});

test("after the verdicts the child sees no waiting box; the parent sees the AI cost on the approved test", async ({ page, browser }) => {
  await loginAs(page, "studentNguyen");
  await page.goto(`/activities/${activityId}`);
  await expect(page.getByTestId("result-view")).toBeVisible();
  await expect(page.getByTestId("result-open-q7")).toHaveCount(0);
  const parent = await (await browser.newContext()).newPage();
  await loginAs(parent, "parent");
  await parent.goto(draftUrl);
  await expect(parent.getByTestId("side-ai-cost")).toBeVisible();
});

test.describe("the Bài kiểm tra flag on a Studio work", () => {
  test("a Studio work given as Bài kiểm tra: no hint slot, no retry, and the child is told the tutor will go through it with him", async ({ page, browser }) => {
    const tutor = await (await browser.newContext()).newPage();
    await loginAs(tutor, "tutorNguyen");
    await tutor.goto(draftUrl);
    await tutor.getByTestId("assign-kind-test").check();
    await tutor.getByTestId("assign-submit").click();
    await expect(tutor.getByTestId("assigned-list").locator("li")).toHaveCount(2);
    const row2 = await q<{ id: string }>(
      `select a.id from english.activity_instances a join english.inquiry_instances i on i.id = a.inquiry_instance_id
       join english.work_test_marks m on m.activity_id = a.id where a.learner_id = $1 order by i.assigned_at desc limit 1`, [NGUYEN]);
    const testId = row2[0]!.id;

    await loginAs(page, "studentNguyen");
    await page.goto(`/activities/${testId}`);
    await expect(page.getByTestId("work-kind")).toHaveText(playerCopy.testTag);
    await expect(page.getByTestId("ask-tutor")).toHaveCount(0);
    await doTheTest(page, { q1: { v: "B. had", choice: true }, q2: { v: "B. can't", choice: true }, q6: { v: "happyness" } });
    await expect(page.getByTestId("result-view")).toHaveAttribute("data-test", "yes");
    await expect(page.getByTestId("result-test-note")).toBeVisible();
    await expect(page.locator('[data-testid^="retry-open-"]')).toHaveCount(0);
    const text = await studentVisibleText(page, "result-view");
    expect(text).not.toMatch(SCORE);
    expect(text).not.toMatch(/đúng\s+\d|Nên là|Vì sao/i);
  });
});
