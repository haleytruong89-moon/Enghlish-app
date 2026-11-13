import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { aiSettingsCopy, levelLabels, pdfPickCopy, studioInboxCopy, studioStudentCopy, work } from "@/lib/copy/vi";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { makeDocx } from "../unit/fixtures/docx";
import { LEARNER_IDS, loginAs } from "./helpers";

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
  await page.getByTestId("nav-assign-studio").click();
  await page.getByTestId("studio-title").fill("Destination B1 — Unit 5 (e2e)");
  await expect(page.getByTestId("page-guidance")).toContainText(pdfPickCopy.guidance.studio);
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

test("Nguyên does the test: closed items are checked, he sees the wrong ones with the right answer and the waiting ones — never a score", async ({ page }) => {
  await loginAs(page, "studentNguyen");
  await page.goto(`/activities/${activityId}`);
  await answer(page, "q1", "B. had", true);
  await answer(page, "q2", "B. can't", true);
  await answer(page, "q3", "A. off", true);
  await answer(page, "q4", "C. A visit that changed Lan's plans", true);
  await answer(page, "q6", "happyness");
  await answer(page, "q7", "I wish I could");
  await answer(page, "q8", "is said to be a");
  await page.getByTestId("help-declaration").getByLabel(work.help.none).check();
  await page.getByRole("button", { name: work.submit }).click();
  await expect(page.getByTestId("studio-review")).toBeVisible();
  for (const n of [2, 5, 6]) await expect(page.getByTestId(`studio-wrong-${n}`)).toBeVisible();
  await expect(page.getByTestId("studio-wrong-2")).toContainText("A. must");
  await expect(page.getByTestId("studio-pending")).toContainText(studioStudentCopy.pending(2));
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(SCORE);
  expect(text).not.toContain("đúng ");
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
  // Điểm cần chú ý shows the new tag; the skill page shows a level reached through the app's own checks (route 2)
  const label = (await q<{ label_vi: string }>("select label_vi from english.error_tags where key = 'dang-tu' and track_id = 'B'"))[0]!.label_vi;
  await page.goto(`/learners/${NGUYEN}/weak`);
  await expect(page.locator("main")).toContainText(label);
  await page.goto(`/learners/${NGUYEN}/targets`);
  await expect(page.getByTestId("skill-row-B-L2-CLOZE")).toContainText(new RegExp(`${levelLabels.SUPPORTED.label}|${levelLabels.DEVELOPING.label}`));
});

test("after the verdicts the child sees no waiting box; the parent sees the AI cost on the approved test", async ({ page, browser }) => {
  await loginAs(page, "studentNguyen");
  await page.goto(`/activities/${activityId}`);
  await expect(page.getByTestId("studio-review")).toBeVisible();
  await expect(page.getByTestId("studio-pending")).toHaveCount(0);
  const parent = await (await browser.newContext()).newPage();
  await loginAs(parent, "parent");
  await parent.goto(draftUrl);
  await expect(parent.getByTestId("side-ai-cost")).toBeVisible();
});
