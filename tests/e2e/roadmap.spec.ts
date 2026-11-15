import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { journeyCopy, roadmapCopy } from "@/lib/copy/vi";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { emailFor, LEARNER_IDS, loginAs } from "./helpers";

// W4a · Lộ trình mốc (the child's tutor) and Hành trình (the child) end to end on the TEST family. Serial: each step builds on the previous one.
test.describe.configure({ mode: "serial" });
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to prepare an approved curriculum");

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
const memberOf = async (key: Parameters<typeof emailFor>[0]) =>
  (await q<{ id: string }>("select m.id from english.members m join auth.users u on u.id = m.user_id where u.email = $1", [emailFor(key)]))[0]!.id;

/** An approved curriculum (6 Units, a "Progress Test 1" row after Unit 4) for Nguyên, with U1 done and U2 in progress. */
async function prepareCurriculum(): Promise<void> {
  const tutor = await memberOf("tutorNguyen");
  const unit = (n: number) => ({ code: `U${n}`, title: `Unit ${n}`, section: null, page: 10 * n, skipped: false, points: [], missing_points: [], needs_review: false, review_reason: null, flags: [], origin: "manual", ai_index: null, dropped: false, edit_reason: null });
  const units = Array.from({ length: 6 }, (_, i) => unit(i + 1));
  const payload = { units, ignored: [{ label: "Progress Test 1", page: 45, reason: "test" }] };
  const c = (await q<{ r: { curriculum_id: string; version_id: string } }>("select english.eng_create_curriculum($1,'Roadmap e2e',null,null,false,$2,$3) as r", [NGUYEN, tutor, randomUUID()]))[0]!.r;
  const at = async () => (await q<{ t: string }>("select updated_at::text as t from english.curriculum_versions where id = $1", [c.version_id]))[0]!.t;
  await q("select english.eng_save_curriculum_draft($1,$2::jsonb,$3,$4)", [c.version_id, JSON.stringify(payload), await at(), tutor]);
  await q("select english.eng_approve_curriculum_version($1,$2,$3::jsonb,null,$4)", [
    c.version_id, await at(), JSON.stringify(units.map((u) => ({ code: u.code, title: u.title, section: null, page: u.page, skipped: false, points: [] }))), tutor,
  ]);
  for (const [code, status] of [["U1", "done"], ["U2", "in_progress"]] as const) {
    await q("select english.eng_set_unit_status($1,$2,$3,null,$4,$5)", [c.curriculum_id, code, status, tutor, randomUUID()]);
  }
  // Make this curriculum the main one even when other specs left a curriculum with a newer event.
  await q("select english.eng_roadmap_set_main($1,$2,$3,$4)", [NGUYEN, c.curriculum_id, tutor, randomUUID()]);
}

test("setup: an approved curriculum for Nguyên", async () => {
  await prepareCurriculum();
});

test("the tutor sees the app's proposals, confirms 'Progress Test 1', and Lộ trình lights up in the sidebar", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.getByTestId("nav-roadmap").click();
  await expect(page).toHaveURL(new RegExp(`/learners/${NGUYEN}/roadmap$`));
  await expect(page.getByTestId("nav-roadmap")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("roadmap-page")).toBeVisible();
  const pt = page.locator('[data-testid="proposal"][data-key^="pt:"]');
  await expect(pt).toContainText("Progress Test 1");
  await expect(pt).toContainText("Sau U4");
  await pt.getByTestId("proposal-confirm").click();
  await expect(page.locator('[data-testid^="ms-"][data-status="confirmed"]').filter({ hasText: "Progress Test 1" })).toBeVisible();
  await expect(page.locator('[data-testid="proposal"][data-key^="pt:"]')).toHaveCount(0);
});

test("the child sees the flag, the Units in their own state and counts (no score); the summit has no name yet", async ({ page }) => {
  await loginAs(page, "studentNguyen");
  await page.getByTestId("nav-journey").click();
  await expect(page).toHaveURL(/\/journey$/);
  await expect(page.getByTestId("journey-page")).toBeVisible();
  await expect(page.getByTestId("mt-unit-U1")).toHaveAttribute("aria-label", new RegExp(journeyCopy.unitStatus.done));
  await expect(page.getByTestId("mt-unit-U2")).toHaveAttribute("aria-label", new RegExp(journeyCopy.unitStatus.in_progress));
  await expect(page.locator('[data-testid^="mt-flag-"]')).toHaveAttribute("aria-label", /Progress Test 1/);
  await expect(page.getByTestId("journey-summary")).toContainText("Progress Test 1");
  await expect(page.getByTestId("journey-summit-unnamed")).toHaveText(journeyCopy.summitUnnamed);
  await page.getByTestId("journey-list-toggle").locator("summary").click();
  await expect(page.getByTestId("path-list")).toContainText(journeyCopy.here);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/%|(^|[^\p{L}])điểm(?!\p{L})|\d\s*\/\s*4\s*·|đúng\s+\d/iu);
  expect(text).not.toContain("⚑ Cần xem lại");
});

test("editing a confirmed milestone as a draft: the child still sees the old name; the tutor is told", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.goto(`/learners/${NGUYEN}/roadmap`);
  const row = page.locator('[data-testid^="ms-"][data-status="confirmed"]').filter({ hasText: "Progress Test 1" });
  await row.getByRole("button", { name: roadmapCopy.row.edit }).click();
  await page.getByTestId("ms-title").fill("Progress Test 1 (đổi tên)");
  await page.getByTestId("ms-save-draft").click();
  await expect(page.locator('[data-testid^="ms-"][data-status="draft"]').filter({ hasText: "Progress Test 1 (đổi tên)" })).toContainText("con đang thấy bản đã xác nhận");
  await loginAs(page, "studentNguyen");
  await page.goto("/journey");
  await expect(page.locator('[data-testid^="mt-flag-"]')).toHaveAttribute("aria-label", /^Progress Test 1\. /);
  await expect(page.locator("body")).not.toContainText("(đổi tên)");
});

test("removing a milestone needs a reason; afterwards the child does not see it, the history keeps it", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.goto(`/learners/${NGUYEN}/roadmap`);
  const row = page.locator('[data-testid^="ms-"][data-status="draft"]').filter({ hasText: "Progress Test 1" });
  await row.getByRole("button", { name: roadmapCopy.row.remove }).click();
  await row.getByRole("button", { name: roadmapCopy.row.removeGo }).click();
  await expect(row.getByRole("alert")).toHaveText(roadmapCopy.errors.reason_required!);
  await row.locator('input[type="text"]').fill("lịch thi đổi");
  await row.getByRole("button", { name: roadmapCopy.row.removeGo }).click();
  await expect(page.getByTestId("ms-removed")).toBeVisible();
  const gone = await q<{ status: string; reason: string }>("select status, reason from english.roadmap_milestones where learner_id = $1 and title like 'Progress Test 1%' order by version desc limit 1", [NGUYEN]);
  expect(gone).toEqual([{ status: "removed", reason: "lịch thi đổi" }]);
  await loginAs(page, "studentNguyen");
  await page.goto("/journey");
  await expect(page.locator('[data-testid^="mt-flag-"]')).toHaveCount(0);
});

test("the parent reads the roadmap but has no button, and the API refuses a parent's write", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto(`/learners/${NGUYEN}/roadmap`);
  await expect(page.getByTestId("roadmap-readonly")).toHaveText(roadmapCopy.readOnly);
  await expect(page.getByTestId("roadmap-page").getByRole("button")).toHaveCount(0);
  const res = await page.request.post(`/api/learners/${NGUYEN}/roadmap/milestones`, {
    data: { client_id: randomUUID(), status: "confirmed", fields: { kind: "goal", role: "summit", title: "Parent summit" } },
  });
  expect(res.status()).toBe(403);
});

test("An (another child) sees none of it; adults get 404 on /journey; a student cannot open the tutor page or write", async ({ page }) => {
  await loginAs(page, "studentAn");
  await page.goto("/journey");
  await expect(page.getByTestId("journey-page")).toBeVisible();
  await expect(page.locator('[data-testid^="mt-flag-"]')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Roadmap e2e");
  await expect(page.getByTestId("journey-summit-unnamed")).toHaveText(journeyCopy.summitUnnamed);
  expect((await page.request.get(`/learners/${NGUYEN}/roadmap`)).status()).toBe(404);
  expect((await page.request.post(`/api/learners/${NGUYEN}/roadmap/milestones`, { data: { client_id: randomUUID(), status: "draft", fields: { kind: "goal", role: "summit", title: "x" } } })).status()).toBe(404);
  await loginAs(page, "tutorNguyen");
  expect((await page.request.get("/journey")).status()).toBe(404);
});
