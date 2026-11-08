import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { levelLabels, purgePage, reviewPage, skillStateCopy } from "@/lib/copy/vi";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { seedThrowawayLearner, TEST_LEARNER_AN_ID, TEST_LEARNER_NGUYEN_ID } from "../../scripts/lib/seed";
import { E2E_SKILLS, insertValidatedEpisode, seedSkillEvidenceLearner, type SkillEvidenceLearner } from "../../scripts/lib/skillEvidence";
import { loginAs } from "./helpers";

// S5c: "Xóa dữ liệu của em" (parent only). Each test makes its own throwaway TEST learner - never An (thử) / Nguyên (thử) - and deletes it.
// Runs in its own Playwright project after all other specs (see playwright.config.ts). Needs DATABASE_URL (the CI job has it).

test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to create a throwaway learner");

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client(pgConfigFromUrl(process.env.DATABASE_URL as string));
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}
const exists = (learnerId: string) =>
  withDb(async (db) => ((await db.query("select 1 from english.learners where id = $1", [learnerId])).rowCount ?? 0) > 0);
const authUsers = () => withDb(async (db) => Number((await db.query("select count(*)::int as n from auth.users")).rows[0]?.n));

test.describe("S5c purge screen", () => {
  test("the parent sees what would go, must type the name, and then the learner is gone - the logins stay", async ({ page }) => {
    const t = await withDb((db) => seedThrowawayLearner(db));
    const usersBefore = await authUsers();

    await loginAs(page, "parent");
    await page.goto(`/?learner=${t.learnerId}`);
    await page.getByTestId("nav-delete").click();
    await expect(page).toHaveURL(new RegExp(`/learners/${t.learnerId}/delete$`));
    await expect(page.getByRole("heading", { level: 1, name: purgePage.title(t.alias) })).toBeVisible();
    // the dry run: the one result and the one lesson note of the throwaway learner are listed, nothing deleted yet
    await expect(page.getByTestId("purge-count-results")).toHaveText(purgePage.countLine(purgePage.countLabels.results ?? "", 1));
    await expect(page.getByTestId("purge-count-lesson_notes")).toBeVisible();
    expect(await exists(t.learnerId)).toBe(true);

    const submit = page.getByTestId("purge-submit");
    await expect(submit).toBeDisabled();
    await page.getByTestId("purge-name").fill("Em khác");
    await expect(submit).toBeDisabled();
    await page.getByTestId("purge-name").fill(t.alias.toUpperCase());
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByTestId("purge-done")).toContainText(purgePage.done);

    expect(await exists(t.learnerId)).toBe(false);
    expect(await authUsers()).toBe(usersBefore); // never deletes a login account
    // the two seeded test children are untouched
    expect(await exists(TEST_LEARNER_AN_ID)).toBe(true);
    expect(await exists(TEST_LEARNER_NGUYEN_ID)).toBe(true);
    // the page of a purged learner is a plain 404
    expect((await page.goto(`/learners/${t.learnerId}/delete`))?.status()).toBe(404);
  });

  test("a wrong name deletes nothing; a tutor and a student get no page and no API; a request from another site gets 403", async ({ page }) => {
    const t = await withDb((db) => seedThrowawayLearner(db));
    // The purge route refuses requests that do not say they come from this site (Origin); the screen's own fetch always does.
    const same = { origin: new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").origin };
    try {
      await loginAs(page, "parent");
      const wrong = await page.request.post(`/api/learners/${t.learnerId}/purge`, { data: { confirm_name: "không đúng" }, headers: same });
      expect(wrong.status()).toBe(400);
      expect(((await wrong.json()) as { error: string }).error).toBe("name_mismatch");
      expect(await exists(t.learnerId)).toBe(true);

      await page.context().clearCookies();
      await loginAs(page, "tutorAn");
      expect((await page.goto(`/learners/${t.learnerId}/delete`))?.status()).toBe(404);
      expect((await page.request.post(`/api/learners/${t.learnerId}/purge`, { data: { confirm_name: t.alias }, headers: same })).status()).toBe(404);
      await expect(page.getByTestId("nav-delete")).toHaveCount(0); // no parent group for a tutor
      await page.context().clearCookies();
      await loginAs(page, "studentAn");
      expect((await page.goto(`/learners/${TEST_LEARNER_AN_ID}/delete`))?.status()).toBe(404);
      expect((await page.request.post(`/api/learners/${TEST_LEARNER_AN_ID}/purge`, { data: { confirm_name: "An (thử)", client: randomUUID() }, headers: same })).status()).toBe(403);
      expect(await exists(TEST_LEARNER_AN_ID)).toBe(true);
      expect(await exists(t.learnerId)).toBe(true);
      // a cross-site request is refused before anything else, even for the right parent with the right name
      await page.context().clearCookies();
      await loginAs(page, "parent");
      const cross = await page.request.post(`/api/learners/${t.learnerId}/purge`, { data: { confirm_name: t.alias }, headers: { origin: "https://evil.example" } });
      expect(cross.status()).toBe(403);
      expect(await exists(t.learnerId)).toBe(true);
    } finally {
      // always clean up the throwaway learner, whatever happened above
      await withDb((db) => db.query("select english.eng_purge_learner($1, null)", [t.learnerId]));
    }
  });
});

// S7a (D23): skill states on a throwaway TEST learner with three backdated validated checkpoints (level 3 needs ≥ 7 days of work,
// which one run cannot produce live). One learner for the whole serial suite; purged at the end.
test.describe.serial("S7a skill states", () => {
  let t: SkillEvidenceLearner;
  const [CAUSE, PARA] = E2E_SKILLS;
  const targets = () => `/learners/${t.learnerId}/targets`;
  const row = (page: Page, k: string) => page.getByTestId(`skill-row-${k}`);
  const card = (page: Page, k: string) => page.getByTestId(`skills-group-${t.learnerId}`).getByTestId(`skill-proposal-${k}`);
  const openProposals = () =>
    withDb(async (db) =>
      (
        await db.query<{ id: string }>(
          `select d.id from english.mastery_decisions d where d.learner_id = $1 and d.kind = 'PROPOSED'
             and not exists (select 1 from english.mastery_decisions a where a.responds_to = d.id) order by d.target_key`,
          [t.learnerId],
        )
      ).rows.map((r) => r.id),
    );
  async function rebuild(page: Page, proposed: number) {
    await page.getByTestId("skills-rebuild").click();
    await expect(page.getByTestId("skills-rebuild-msg")).toHaveText(skillStateCopy.rebuildDone(proposed));
  }

  test.beforeAll(async () => {
    t = await withDb((db) => seedSkillEvidenceLearner(db));
  });
  test.afterAll(async () => {
    if (t) await withDb((db) => db.query("select english.eng_purge_learner($1, null)", [t.learnerId]));
  });

  test("An's tutor: 'Tính lại từ đầu' turns three checkpoints into 'Đang tiến bộ' + two proposals 'Tự làm được'; a second run adds none", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.goto(targets());
    await expect(page.getByTestId(/^skill-row-/)).toHaveCount(12);
    await rebuild(page, 2);
    for (const k of E2E_SKILLS) {
      await expect(row(page, k).getByTestId("skill-scale")).toHaveAttribute("data-level", "2");
      await expect(row(page, k).getByTestId("skill-pending")).toHaveText(skillStateCopy.pending(levelLabels.INDEPENDENT.label));
      await expect(row(page, k).getByTestId("skill-auto")).toBeVisible();
    }
    await rebuild(page, 0);
  });

  test("the parent: tab 'Kỹ năng' shows both proposals read-only; her confirm is refused (403); no manual form for her", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto("/review");
    await page.getByTestId("review-tab-skills").click();
    await expect(page).toHaveURL(/\/review\/skills$/);
    const group = page.getByTestId(`skills-group-${t.learnerId}`);
    await expect(group.getByTestId(/^skill-proposal-[A-Z]/)).toHaveCount(2); // the cards, not "skill-proposal-title"
    await expect(group.getByTestId("skill-waiting")).toHaveCount(2);
    await expect(group.getByTestId("skill-confirm")).toHaveCount(0);
    await expect(page.getByTestId(`skill-confirm-all-${t.learnerId}`)).toHaveCount(0);
    const ids = await openProposals();
    expect(ids).toHaveLength(2);
    expect((await page.request.post(`/api/learners/${t.learnerId}/skills/confirm-all`, { data: { client_id: randomUUID(), ids } })).status()).toBe(403);
    expect((await page.request.post(`/api/skills/decisions/${ids[0]}`, { data: { client_id: randomUUID(), action: "confirm" } })).status()).toBe(403);
    expect(await openProposals()).toEqual(ids);
    await page.goto(targets());
    await expect(page.getByTestId(/^skill-manual-/)).toHaveCount(0);
    await expect(page.getByTestId("skills-rebuild")).toBeVisible(); // the parent may rebuild (D18)
  });

  test("Nguyên's tutor sees nothing of this child: page and API 404, no group in the tab", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    expect((await page.goto(targets()))?.status()).toBe(404);
    expect((await page.request.get(`/api/learners/${t.learnerId}/skills`)).status()).toBe(404);
    expect((await page.request.post(`/api/learners/${t.learnerId}/skills/rebuild`, { data: {} })).status()).toBe(404);
    await page.goto("/review/skills");
    await expect(page.getByTestId(`skills-group-${t.learnerId}`)).toHaveCount(0);
  });

  test("An's tutor: conditions and the three pieces of work open; 'Chưa' needs a reason; a rejected proposal does not come back on a rebuild", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.goto("/review/skills");
    const cause = card(page, CAUSE);
    await cause.getByTestId("skill-conditions").locator("summary").click();
    await expect(cause.getByTestId("condition-r1_first_attempts")).toBeVisible();
    const links = cause.getByTestId("skill-evidence-link");
    await expect(links).toHaveCount(3);
    expect((await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).sort()).toEqual(t.episodes.map((e) => `/review/${e}`).sort());

    await cause.getByTestId("skill-reject-open").click();
    await cause.getByTestId("skill-reject-send").click();
    await expect(cause.getByTestId("skill-msg")).toHaveText(skillStateCopy.reasonRequired);
    await cause.getByTestId("skill-reject-reason").fill("Bài thứ ba vẫn dựa nhiều vào câu mẫu.");
    await cause.getByTestId("skill-reject-send").click();
    await expect(card(page, CAUSE)).toHaveCount(0);
    await expect(card(page, PARA)).toHaveCount(1);

    // a piece of work the proposal cites opens for the tutor
    expect((await page.goto(`/review/${t.episodes[0]}`))?.status()).toBe(200);

    // G4: the tutor can tick "Bài này ở chủ đề / nguồn mới (vận dụng)" on a first attempt; it is kept after a reload; untick restores it
    const mark = page.getByTestId("transfer-mark-input");
    await expect(page.getByTestId("transfer-mark")).toContainText(reviewPage.transferMark);
    await expect(mark).not.toBeChecked();
    await mark.check();
    await expect(page.getByTestId("transfer-mark-msg")).toHaveText(reviewPage.transferMarkSaved);
    await page.reload();
    await expect(mark).toBeChecked();
    await mark.uncheck();
    await expect(page.getByTestId("transfer-mark-msg")).toHaveText(reviewPage.transferMarkSaved);
    await page.reload();
    await expect(mark).not.toBeChecked();

    await page.goto(targets());
    await expect(row(page, CAUSE).getByTestId("skill-pending")).toHaveCount(0);
    await expect(row(page, CAUSE).getByTestId("skill-scale")).toHaveAttribute("data-level", "2"); // "Chưa" never lowers the level
    await rebuild(page, 0);
    await expect(row(page, CAUSE).getByTestId("skill-pending")).toHaveCount(0);
  });

  test("new work after 'Chưa' brings the proposal back; 'Xác nhận tất cả (2)' makes both 'Tự làm được'; Hồ sơ cấp counts them", async ({ page }) => {
    await withDb((db) => insertValidatedEpisode(db, t.learnerId, t.tutorMemberId, { activityId: t.steps.extra, daysAgo: 2, scores: { [CAUSE]: 3 }, facets: ["checkpoint"] }));
    await loginAs(page, "tutorAn");
    await page.goto(targets());
    await rebuild(page, 1);

    await page.goto("/review/skills");
    const all = page.getByTestId(`skill-confirm-all-${t.learnerId}`);
    await expect(all).toHaveText(skillStateCopy.confirmAll(2));
    await all.click();
    await expect(page.getByTestId(`skills-group-${t.learnerId}`)).toHaveCount(0);

    await page.goto(targets());
    for (const k of E2E_SKILLS) {
      await expect(row(page, k).getByTestId("skill-scale")).toHaveAttribute("data-level", "3");
      await expect(row(page, k).getByTestId("skill-pending")).toHaveCount(0);
      await expect(row(page, k).getByTestId("skill-auto")).toHaveCount(0); // level 3 came from a person, not the app
    }
    await page.goto(`/learners/${t.learnerId}/levels?domain=writing`);
    await expect(page.getByTestId("level-solid-writing")).toHaveText(/^2\/\d+ điểm đã vững$/);
    await expect(page.getByTestId("level-solid")).toContainText(/2\/\d+ điểm đã vững/);
  });
});
