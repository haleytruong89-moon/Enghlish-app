import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { curriculumCopy } from "@/lib/copy/vi";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { LEARNER_IDS, loginAs } from "./helpers";

// W2 · Giáo trình end to end on the TEST family with AI_FAKE=1 (CI): the fake answer is tests/fixtures/curriculum/fake-toc.json
// (Destination C1&C2, 26 units, 8 rows "cần xem"). Serial: each step builds on the previous one.
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
let versionUrl = "";
let curriculumId = "";

test("AI is on for the test family (parent)", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/settings/ai");
  if (await page.getByTestId("ai-enable").isVisible()) await page.getByTestId("ai-enable").click();
  await expect(page.getByTestId("ai-disable")).toBeVisible();
});

test("Nguyên's tutor adds Destination, the AI draft has 26 units with 8 to look at, Duyệt is blocked until they are resolved", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.getByTestId("nav-curricula").click();
  await page.getByTestId("add-curriculum-title").fill("Destination C1&C2 (e2e)");
  await page.getByTestId("add-curriculum-level").fill("C1–C2");
  await page.getByTestId("add-curriculum-file").setInputFiles({ name: "contents.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByTestId("add-curriculum-ai").click();
  await expect(page).toHaveURL(/\/curricula\/versions\/[0-9a-f-]{36}$/);
  versionUrl = page.url();
  await expect(page.getByTestId("curriculum-version")).toHaveAttribute("data-status", "draft", { timeout: 30_000 });
  await expect(page.getByTestId("review-left")).toHaveText(curriculumCopy.barLeft(8));
  await expect(page.getByTestId("review-approve")).toBeDisabled();
  await expect(page.getByTestId("version-ai-cost")).toHaveCount(0); // a tutor never sees AI cost
  const seen = page.locator('[data-testid$="-seen"]');
  while ((await seen.count()) > 0) await seen.first().click();
  await expect(page.getByTestId("review-left")).toHaveText(curriculumCopy.barLeft(0));
  await page.getByTestId("review-quality-ok").click();
  await page.getByTestId("review-approve").click();
  await expect(page.getByTestId("version-approved")).toBeVisible();
  await expect(page.getByTestId("curriculum-map-table").locator("tbody tr")).toHaveCount(26);
  const runs = await q<{ purpose: string; prompt_version: string }>(
    "select purpose, prompt_version from english.ai_runs where draft_id = $1::uuid and status = 'ok'", [versionUrl.split("/").pop()]);
  expect(runs).toEqual([{ purpose: "curriculum_toc", prompt_version: "curriculum-toc.v1" }]);
});

test("unit statuses drive 'đang học đến'; the session note offers the units and proposes 'Đang học' (tutor clicks)", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.goto(`/learners/${NGUYEN}/curricula`);
  curriculumId = (await q<{ id: string }>("select id from english.curricula where learner_id = $1 and title = 'Destination C1&C2 (e2e)' order by created_at desc limit 1", [NGUYEN]))[0]!.id;
  await expect(page.getByTestId(`curriculum-current-${curriculumId}`)).toContainText(curriculumCopy.notStarted);
  await page.getByTestId(`curriculum-units-${curriculumId}`).click();
  await page.getByTestId("unit-U1-done").click();
  await page.getByTestId("unit-U2-in_progress").click();
  await expect(page.getByTestId("units-current")).toHaveText(curriculumCopy.currentLine("U2", "Thinking and learning"));
  await page.goto(`/learners/${NGUYEN}/notes/new`);
  await page.getByTestId(`taught-${curriculumId}-U3`).click();
  await page.getByTestId("session-save").click();
  await expect(page.getByTestId("session-saved")).toBeVisible();
  await page.getByTestId("propose-U3").click();
  await expect(page.getByTestId("unit-proposal")).toContainText(curriculumCopy.proposeDone("U3"));
  const ev = await q<{ status: string; has_note: boolean }>(
    "select status, lesson_note_id is not null as has_note from english.curriculum_unit_events where curriculum_id = $1 and unit_code = 'U3'", [curriculumId]);
  expect(ev).toEqual([{ status: "in_progress", has_note: true }]);
});

test("listening question-type tags can be picked in the session note", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.goto(`/learners/${NGUYEN}/notes/new`);
  await page.getByTestId("tab-session-tags-listening").click();
  await expect(page.getByTestId("panel-session-tags-listening")).toContainText("Nghe · Main idea — Ý chính");
});

test("the parent sees the map and the AI cost but cannot approve; the student cannot open the page", async ({ page, browser }) => {
  await loginAs(page, "parent");
  await page.goto(versionUrl);
  await expect(page.getByTestId("version-ai-cost")).toBeVisible();
  const res = await page.request.post(`/api/curricula/versions/${versionUrl.split("/").pop()}/approve`, { data: { base_updated_at: "2026-11-08 00:00:00+00", quality: null, quality_note: null } });
  expect(res.status()).toBe(403);
  const child = await (await browser.newContext()).newPage();
  await loginAs(child, "studentNguyen");
  const r = await child.goto(`/learners/${NGUYEN}/curricula`);
  expect(r?.status()).toBe(404);
});
