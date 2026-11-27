import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { aiSettingsCopy, levelLabels, pdfPickCopy, pendingCopy, playerCopy, resultCopy, studioAssignedCopy, studioInboxCopy, work } from "@/lib/copy/vi";
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
/** D35 / D39: a Studio practice result (marks present) never shows a/b, a percentage, "điểm" or "đúng n" / "sai n" (dates are <time> and set aside). */
const NO_TOTALS = /(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])|%|(^|[^\p{L}])điểm(?!\p{L})|đúng\s+\d|\bsai\s+\d/iu;

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
  await page.getByTestId("quick-assign").click();
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
  // 22/11: no tutor inside a work (TUTOR_IN_WORK unset = off): no "Hỏi", no dimmed slot; the hints route answers 404 tutor_off.
  await expect(page.getByTestId("ask-tutor")).toHaveCount(0);
  await expect(page.getByTestId("tutor-ask")).toHaveCount(0);
  const off = await page.request.post(`/api/student/activities/${activityId}/hints`, { data: {} });
  expect(off.status()).toBe(404);
  expect((await off.json()).error).toBe("tutor_off");
  await doTheTest(page, {
    q1: { v: "B. had", choice: true }, q2: { v: "B. can't", choice: true }, q3: { v: "A. off", choice: true }, q4: { v: "C. A visit that changed Lan's plans", choice: true },
    q6: { v: "happyness" }, q7: { v: "I wish I could" }, q8: { v: "is said to be a" },
  });
  await expect(page.getByTestId("result-view")).toBeVisible();
  // D39: a practice work shows a ✓ / ✗ on each question (colour + words), never a total, and no answer before a retry / "Xem đáp án"
  for (const id of ["q1", "q3", "q4"]) await expect(page.getByTestId(`result-mark-${id}`)).toHaveAttribute("data-mark", "right");
  for (const id of ["q2", "q5", "q6"]) await expect(page.getByTestId(`result-mark-${id}`)).toHaveAttribute("data-mark", "wrong");
  for (const id of ["q7", "q8"]) await expect(page.getByTestId(`result-mark-${id}`)).toHaveAttribute("data-mark", "waiting");
  await expect(page.getByTestId("mark-chip-q2")).toContainText(resultCopy.markWrong);
  await expect(page.getByTestId("mark-chip-q1")).toContainText(resultCopy.markRight);
  await expect(page.getByTestId("reveal-q2")).toBeVisible();
  // the marks are really there, and the visible text of the result still has no a/b, %, "điểm", "đúng n"
  await expect(page.locator('[data-testid^="mark-chip-"]')).toHaveCount(8);
  const text = await studentVisibleText(page, "result-view");
  expect(text).toContain(resultCopy.markRight);
  expect(text).toContain(resultCopy.markWrong);
  expect(text).not.toMatch(NO_TOTALS);
  expect(text).not.toContain("A. must"); // the model answer: not before a retry or "Xem đáp án"
  expect(text).not.toContain("happiness");
  expect(text).not.toContain("Nên là");
});

test("Nguyên retries one question once; he is told it went to the tutor, no score; the tutor sees the retry beside the first answer", async ({ page, browser }) => {
  await loginAs(page, "studentNguyen");
  await page.goto(`/activities/${activityId}`);
  await page.getByTestId("retry-open-q2").click();
  await page.getByTestId("retry-box-q2").getByLabel("A. must", { exact: true }).check(); // a multiple-choice item retries with the choices
  await page.getByTestId("retry-send-q2").click();
  await expect(page.getByTestId("retry-sent-q2")).toBeVisible();
  await expect(page.getByTestId("retry-mark-q2")).toContainText(resultCopy.retryRight); // D39: whether the retry matches, then the answer
  await expect(page.getByTestId("answer-q2")).toContainText("A. must");
  await expect(page.getByTestId("retry-open-q2")).toHaveCount(0); // one retry per question
  // "Xem đáp án" on another wrong item gives up its retry and opens the answer
  await page.getByTestId("reveal-q6").click();
  await expect(page.getByTestId("answer-q6")).toContainText("happiness");
  await expect(page.getByTestId("retry-open-q6")).toHaveCount(0);
  // after any answer was shown there is no "Làm lại cả bài"
  await expect(page.getByTestId("result-redo")).toHaveCount(0);
  // ... and the server refuses it too: the SAME call the Player makes (route, all-valid answers, in_app, "none") reaches the trigger -> 409 answers_shown, never a generic 400
  const redo = await page.request.post("/api/attempts", {
    data: { activity_id: activityId, client_submission_id: randomUUID(), content: { answers: { q1: "B. had", q2: "B. can't" } }, assistance: ["none"], provenance: "in_app" },
  });
  expect(redo.status()).toBe(409);
  expect(await redo.json()).toMatchObject({ error: "answers_shown" });
  const text = await studentVisibleText(page, "result-view");
  expect(text).toContain(resultCopy.markWrong);
  expect(text).not.toMatch(NO_TOTALS); // answers and "Vì sao" are now shown for q2 / q6, still no totals
  await page.reload();
  await expect(page.getByTestId("retry-sent-q2")).toBeVisible();
  await expect(page.getByTestId("answer-q6")).toContainText("happiness");
  await expect(page.getByTestId("retry-open-q2")).toHaveCount(0);

  const tutor = await (await browser.newContext()).newPage();
  await loginAs(tutor, "tutorNguyen");
  await tutor.goto(`/learners/${NGUYEN}/inbox`);
  const attemptId = (await q<{ id: string }>("select id from english.attempts where activity_instance_id = $1 order by attempt_no desc limit 1", [activityId]))[0]!.id;
  // Q2 (audit 25/11): the retries of a submission share ONE row with its other parts (skill scoring, feedback): "attempt-<id>" when
  // merged, "retry-<id>" when the retry is the only part. The retry text may be lower-cased when it is not the first part.
  const row = tutor.locator(`[data-testid="pending-row-attempt-${attemptId}"], [data-testid="pending-row-retry-${attemptId}"]`);
  const lc = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  await expect(row).toContainText(lc(pendingCopy.need.retry(1)));
  await expect(row).toContainText(lc(pendingCopy.need.reveal(1)));
  // L1: the row opens "Xong một bài": the retry beside the first answer, and the feedback form, on one screen.
  await expect(row.locator(`a[href="/learners/${NGUYEN}/finish/${attemptId}"]`)).toHaveCount(1);
  await tutor.goto(`/learners/${NGUYEN}/finish/${attemptId}`);
  await expect(tutor.getByTestId("finish-page")).toBeVisible();
  await expect(tutor.getByTestId("finish-retry-q2")).toContainText("A. must");
  await expect(tutor.getByTestId("finish-feedback")).toBeVisible();
  await tutor.goto(`/review/studio?learner=${NGUYEN}#retry-${attemptId}`);
  const card = tutor.getByTestId(`retry-card-${attemptId}`);
  // the card has two items (q2 retried, q6 gave up): every locator is scoped to its own item
  const q2 = card.getByTestId(`retry-item-${attemptId}-q2`);
  const q6 = card.getByTestId(`retry-item-${attemptId}-q6`);
  await expect(q2.getByTestId("retry-given")).toHaveText("B. can't");
  await expect(q2.getByTestId("retry-text")).toHaveText("A. must");
  await expect(q2.getByTestId("retry-revealed")).toHaveCount(0);
  await expect(q6.getByTestId("retry-revealed")).toBeVisible(); // q6: the child chose Xem đáp án
  await expect(q6.getByTestId("retry-text")).toHaveCount(0);
  // Only "Đã xem" clears the row (with an optional note the child does not see).
  await card.getByTestId(`retry-note-${attemptId}`).fill("Câu 2 con tự sửa được.");
  await card.getByTestId(`retry-seen-${attemptId}`).click();
  await expect(tutor.getByTestId(`retry-card-${attemptId}`)).toHaveCount(0);
  await tutor.goto(`/learners/${NGUYEN}/inbox`);
  await expect(tutor.getByTestId("pending-table")).toBeVisible();
  await expect(tutor.getByTestId(`pending-row-retry-${attemptId}`)).toHaveCount(0);
  await expect(tutor.getByTestId("pending-table")).not.toContainText(lc(pendingCopy.need.retry(1)));
  // the child never sees the note
  await page.reload();
  expect(await studentVisibleText(page)).not.toContain("tự sửa được");
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
  await expect(page.getByTestId("result-mark-q7")).not.toHaveAttribute("data-mark", "waiting");
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
    await expect(page.getByTestId("result-marks")).toHaveCount(0); // a test: no ✓ / ✗, no answers
    await expect(page.locator('[data-testid^="reveal-"], [data-testid^="answer-"]')).toHaveCount(0);
    const text = await studentVisibleText(page, "result-view");
    expect(text).not.toMatch(SCORE);
    expect(text).not.toMatch(/đúng\s+\d|Nên là|Vì sao/i);
  });
});

test.describe("Bài đã giao: Gỡ bài (24/11)", () => {
  test("the tutor gives the test a third time, warned it is a duplicate, removes it with a reason; the child no longer sees it; Khôi phục brings it back", async ({ page, browser }) => {
    const tutor = await (await browser.newContext()).newPage();
    await loginAs(tutor, "tutorNguyen");
    await tutor.goto(draftUrl);
    await tutor.getByTestId("assign-submit").click();
    await expect(tutor.getByTestId("assigned-list").locator("li")).toHaveCount(3);
    // the new copy is open (nothing sent): the draft page now warns that giving it again makes a duplicate
    await tutor.reload();
    await expect(tutor.getByTestId("assign-duplicate")).toBeVisible();
    const row = await q<{ id: string }>(
      `select a.id from english.activity_instances a join english.inquiry_instances i on i.id = a.inquiry_instance_id
       where a.learner_id = $1 and not exists (select 1 from english.attempts t where t.activity_instance_id = a.id)
         and i.template_id ~ '^B-ST-' order by i.assigned_at desc limit 1`, [NGUYEN]);
    const fresh = row[0]!.id;

    await tutor.goto(`/learners/${NGUYEN}/assigned?tab=doing`);
    await expect(tutor.getByTestId("board-tab-doing")).toHaveAttribute("aria-current", "page");
    await tutor.getByTestId(`remove-${fresh}`).click();
    await tutor.getByLabel(studioAssignedCopy.reasonLabel).fill("Giao thử e2e");
    await tutor.getByTestId(`remove-form-${fresh}`).getByRole("button", { name: studioAssignedCopy.confirmRemove }).click();
    // the refreshed page moves the row to "Đã gỡ": the form (and the row) leave "Con đang làm" only after the event is written
    await expect(tutor.locator(`[data-testid="remove-form-${fresh}"], [data-testid="remove-${fresh}"]`)).toHaveCount(0);
    await tutor.goto(`/learners/${NGUYEN}/assigned?tab=removed`);
    await expect(tutor.getByTestId(`restore-${fresh}`)).toBeVisible();
    await expect(tutor.getByText(studioAssignedCopy.removedReason("Giao thử e2e"))).toBeVisible();

    await loginAs(page, "studentNguyen");
    await page.goto("/");
    await expect(page.getByTestId("today-view")).toBeVisible();
    await expect(page.locator(`a[href="/activities/${fresh}"]`)).toHaveCount(0);
    expect((await page.goto(`/activities/${fresh}`))?.status()).toBe(404);

    await tutor.getByTestId(`restore-${fresh}`).click();
    await expect(tutor.getByTestId(`restore-${fresh}`)).toHaveCount(0);
    await page.goto("/");
    await expect(page.locator(`a[href="/activities/${fresh}"]`)).not.toHaveCount(0);
  });
});

test("27/11 · Cách dùng AI: the 3-step bar, the AI tour from its button, and the guide page", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.goto(`/studio/new?learner=${LEARNER_IDS.nguyen}`);
  await expect(page.getByTestId("studio-steps")).toHaveAttribute("data-stage", "upload");
  await expect(page.getByTestId("studio-step-1")).toHaveAttribute("aria-current", "step");
  await page.getByTestId("ai-tour-open").click();
  await expect(page.getByTestId("tour-step-ai-intro")).toBeVisible();
  await page.getByTestId("tour-next").click();
  await expect(page.getByTestId("tour-step-ai-name")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("ai-guide-link").click();
  await expect(page).toHaveURL(new RegExp(`/learners/${LEARNER_IDS.nguyen}/help/ai$`));
  await expect(page.getByTestId("ai-guide")).toBeVisible();
});
