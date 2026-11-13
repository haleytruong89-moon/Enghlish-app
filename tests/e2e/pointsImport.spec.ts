import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { importCopy, pdfPickCopy } from "@/lib/copy/vi";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { LEARNER_IDS, loginAs } from "./helpers";

// W3 · Nạp bài đã làm → mức điểm → Bản đồ kiến thức on the TEST family with AI_FAKE=1 (CI): the fake answer is
// tests/fixtures/import/fake-read-answers.json (Progress Test 1-12, 60 questions, 3 of them "Cần xem"). Serial: each step builds on the previous one.
test.describe.configure({ mode: "serial" });
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL for the read-only checks");

const NGUYEN = LEARNER_IDS.nguyen;
const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n% ${tag}\ntrailer<<>>\n%%EOF\n`);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const RUN = Date.now().toString(36);

async function q<R extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<R[]> {
  const db = new Client(pgConfigFromUrl(process.env.DATABASE_URL as string));
  await db.connect();
  try {
    return (await db.query<R>(sql, params)).rows;
  } finally {
    await db.end();
  }
}

/** Fills the form and starts the AI read. Returns after the review screen shows the draft. */
async function startImport(page: Page, o: { title: string; day: string; tag: string }) {
  await page.goto(`/learners/${NGUYEN}/imports/new`);
  await page.getByTestId("import-title").fill(o.title);
  await expect(page.getByTestId("page-guidance")).toContainText(pdfPickCopy.guidance.import);
  await page.getByTestId("import-work").setInputFiles({ name: "bai-lam.pdf", mimeType: "application/pdf", buffer: pdf(`work ${o.tag}`) });
  await page.getByTestId("import-key").setInputFiles({ name: "dap-an.pdf", mimeType: "application/pdf", buffer: pdf(`key ${o.tag}`) });
  await page.getByTestId("import-date").fill(o.day);
  await page.getByTestId("import-support-tu_lam_chua").check();
  await page.getByTestId("import-start").click();
}

/** Deals with every open row (marks a "Cần xem" answer, picks a tag from the closed list) and confirms. */
async function resolveAndConfirm(page: Page) {
  await expect(page.getByTestId("import-page")).toHaveAttribute("data-status", "draft", { timeout: 60_000 });
  await expect(page.locator('[data-testid^="import-row-"]')).toHaveCount(60);
  const open = page.locator('[data-testid^="import-row-"][data-open="true"]');
  while ((await open.count()) > 0) {
    const row = open.first();
    const n = (await row.getAttribute("data-testid"))!.replace("import-row-", "");
    const tag = page.getByTestId(`import-tag-${n}`);
    if ((await tag.inputValue()) === "") await tag.selectOption({ index: 1 });
    const mark = page.getByTestId(`import-mark-${n}-correct`);
    if ((await mark.count()) > 0 && (await mark.getAttribute("aria-pressed")) !== "true") await mark.click();
  }
  await expect(page.getByTestId("import-left")).toHaveText(importCopy.left(0));
  await page.getByTestId("import-confirm-btn").click();
  await expect(page.getByTestId("import-done")).toBeVisible();
}

test("AI is on for the test family (parent)", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/settings/ai");
  if (await page.getByTestId("ai-enable").isVisible()) await page.getByTestId("ai-enable").click();
  await expect(page.getByTestId("ai-disable")).toBeVisible();
});

test("Nguyên's tutor imports the Progress Test: 60 rows, the unsure ones first, Xác nhận is off until every row is dealt with", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await startImport(page, { title: `Progress Test 1-12 (${RUN} a)`, day: daysAgo(2), tag: `${RUN}a` });
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("import-page")).toHaveAttribute("data-status", "draft", { timeout: 60_000 });
  await expect(page.locator('[data-testid^="import-row-"]')).toHaveCount(60);
  await expect(page.getByTestId("import-confirm-btn")).toBeDisabled();
  await expect(page.locator('[data-testid^="import-row-"]').first()).toHaveAttribute("data-open", "true");
  await resolveAndConfirm(page);
  const done = await q<{ status: string; provenance: string; runs: string }>(
    `select b.status, a.provenance, (select count(*) from english.ai_runs r where r.draft_id = b.id and r.purpose = 'read_answers' and r.status = 'ok')::text as runs
       from english.import_batches b join english.attempts a on a.id = b.attempt_id
      where b.learner_id = $1 and b.title = $2`, [NGUYEN, `Progress Test 1-12 (${RUN} a)`]);
  expect(done).toEqual([{ status: "confirmed", provenance: "imported", runs: "1" }]);
});

test("the same paper again is stopped as a possible duplicate", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await startImport(page, { title: `Progress Test 1-12 (${RUN} a)`, day: daysAgo(2), tag: `${RUN}a` });
  await expect(page.getByTestId("import-problem")).toHaveText(importCopy.errors.duplicate_import!);
  await expect(page.getByTestId("import-dup-box")).toBeVisible();
});

test("a second occasion on another day gives the engine enough days: a point proposal waits in the Kỹ năng tab and is confirmed one by one", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await startImport(page, { title: `Progress Test 1-12 (${RUN} b)`, day: daysAgo(1), tag: `${RUN}b` });
  await resolveAndConfirm(page);
  const group = page.getByTestId(`points-group-${NGUYEN}`);
  // The levels are recomputed after the response (after()): poll with a reload instead of reading once.
  await expect(async () => {
    await page.goto("/review/skills");
    await expect(group).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const cards = group.locator('li[data-testid^="point-proposal-"]');
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(page.getByTestId("point-confirm-all")).toHaveCount(0); // one at a time (H5)
  const before = await cards.count();
  await cards.first().getByTestId("point-confirm").click();
  await expect(cards).toHaveCount(before - 1);
  const states = await q<{ state: string }>("select state from english.point_state where learner_id = $1 and state = 'INDEPENDENT'", [NGUYEN]);
  expect(states.length).toBeGreaterThan(0);
  // The same proposal shows up in "Chờ duyệt" of the child as a link only.
  await page.goto(`/learners/${NGUYEN}/inbox`);
  await expect(page.getByRole("button", { name: /^Xác nhận/ })).toHaveCount(0);
});

test("Bản đồ kiến thức shows the point at 'Tự làm được' with every answer as Đúng/Sai", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.goto(`/learners/${NGUYEN}/knowledge`);
  await expect(page.getByTestId("knowledge-page")).toBeVisible();
  const confirmed = page.locator('[data-testid^="point-row-"][data-level="3"]').first();
  await expect(confirmed).toContainText("Tự làm được");
  await confirmed.locator("summary").click();
  await expect(confirmed.getByTestId("point-answer").first()).toBeVisible();
  await expect(page.getByTestId("knowledge-page")).not.toContainText(/điểm số/i);
});

test("the parent reads the map and the proposals but cannot confirm; the student sees none of it", async ({ page, browser }) => {
  await loginAs(page, "parent");
  await page.goto(`/learners/${NGUYEN}/knowledge`);
  await expect(page.getByTestId("point-map")).toBeVisible();
  await page.goto(`/learners/${NGUYEN}/imports/new`);
  await expect(page.getByTestId("import-form")).toBeVisible(); // the parent may upload and start the read
  const decisions = await q<{ id: string }>("select id from english.point_decisions where learner_id = $1 and kind = 'PROPOSED' order by created_at desc limit 1", [NGUYEN]);
  const res = await page.request.post(`/api/review/points/${decisions[0]!.id}`, { data: { action: "confirm", client_id: `parent-try-${RUN}` } });
  expect(res.status()).toBe(403);
  const batch = (await q<{ id: string; updated_at: string }>("select id, updated_at::text from english.import_batches where learner_id = $1 order by created_at desc limit 1", [NGUYEN]))[0]!;
  const conf = await page.request.post(`/api/imports/${batch.id}/confirm`, { data: { base_updated_at: batch.updated_at, rows: [], client_id: `parent-try2-${RUN}` } });
  expect([400, 403]).toContain(conf.status());
  const child = await (await browser.newContext()).newPage();
  await loginAs(child, "studentNguyen");
  expect((await child.goto(`/learners/${NGUYEN}/knowledge`))?.status()).toBe(404);
  expect((await child.goto(`/learners/${NGUYEN}/imports/new`))?.status()).toBe(404);
  expect((await child.goto(`/imports/${batch.id}`))?.status()).toBe(404);
});
