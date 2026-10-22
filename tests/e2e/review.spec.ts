import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { feedbackCopy, formatScore, notesPage, offlineForm, reviewPage, revisionCopy, revisionReviewCopy, scoreLabels, work } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { LEARNER_IDS, loginAs } from "./helpers";

// S5: review inbox, scores per skill, who may decide (D15), work recorded outside the app, lesson notes.
// The dev seed gives An the week-4 inquiry (A-W4-PLANETS) with one writing practice (step 7) already submitted in the app.
// Steps 1-8 of that inquiry are open. Every test that needs fresh work records its own paper/live attempt on a PRACTICE
// step (those can be repeated), so the file can be run again on the same database.
// Nothing here touches A-W1 steps 3 or 6 (the student spec submits them) or the one-time checks.

const AN = "An (thử)";
const WRITE_STEP = 7; // ACT-WRITE practice: A-L3-CAUSE-W + A-L2-CHUNKS
const SPEAK_STEP = 6; // ACT-SPEAK-MONO practice: A-L3-CAUSE-S + A-L2-CHUNKS (recorded live by the tutor)
const SCORE_PATTERN = /\d\s*\/\s*4\s*·/;

type ApiInquiries = { inquiries: { templateId: string; steps: { activityId: string; stepNo: number }[] }[] };

async function activityIdOf(page: Page, stepNo: number): Promise<string> {
  const res = await page.request.get(`/api/learners/${LEARNER_IDS.an}/inquiries`);
  expect(res.status()).toBe(200);
  const data = (await res.json()) as ApiInquiries;
  const step = data.inquiries.find((q) => q.templateId === "A-W4-PLANETS")?.steps.find((s) => s.stepNo === stepNo);
  expect(step, `A-W4-PLANETS step ${stepNo}`).toBeTruthy();
  return step!.activityId;
}

/** Record a piece of paper work for An through the API (signed-in page) and return its episode id. */
async function recordPaperWork(page: Page, stepNo: number, provenance: "manual_import" | "tutor_live"): Promise<string> {
  const res = await page.request.post(`/api/learners/${LEARNER_IDS.an}/offline-attempts`, {
    data: {
      client_id: randomUUID(),
      activity_id: await activityIdOf(page, stepNo),
      provenance,
      text: "The planets stay in orbit because the Sun pulls them. As a result, they keep going around it.",
      session_date: todayVn(),
      assistance: ["none"],
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { episode_id: string }).episode_id;
}

async function notFound(page: Page, target: string) {
  const res = await page.goto(target);
  expect(res?.status(), target).toBe(404);
}

// The tests share what earlier ones created (an episode id), so they run in order, in one worker.
test.describe.serial("S5 review", () => {
  let seededEpisode = ""; // An's work submitted in the app (from the dev seed)
  let scoredEpisode = ""; // fresh paper work that the tutor scores and then corrects
  let liveEpisode = ""; // work the tutor watched live: tutor-only (D15)

  test("An's tutor: the inbox lists An's submitted work, and opening it shows the work next to the skills, without deciding", async ({ page }) => {
    await loginAs(page, "tutorAn");
    const link = page.getByTestId("review-link");
    await expect(link).toBeVisible();
    await expect(link).toContainText(reviewPage.link);

    await link.click();
    await expect(page).toHaveURL(/\/review$/);
    await expect(page.getByRole("heading", { level: 1, name: reviewPage.inboxTitle })).toBeVisible();
    const items = page.getByTestId("inbox-list").locator('[data-testid^="inbox-item-"]');
    await expect(items.first()).toBeVisible();
    // every item is An's; the seeded one is the in-app writing practice of step 7
    for (const text of await items.allInnerTexts()) {
      expect(text).toContain(AN);
      expect(text).not.toContain("`"); // B1: a stray markdown fence once rendered on every row
    }
    await expect(page.getByTestId("inbox-list")).not.toContainText("`");
    const seeded = items.filter({ hasText: reviewPage.stepOf(AN, WRITE_STEP) }).filter({ hasText: "Đã chấm 0/2" }).first();
    await expect(seeded).toBeVisible();
    const id = (await seeded.getAttribute("data-testid"))!.replace("inbox-item-", "");
    seededEpisode = id;

    await seeded.getByRole("link", { name: reviewPage.open }).click();
    await expect(page).toHaveURL(new RegExp(`/review/${id}$`));
    await expect(page.getByTestId("review-page")).toBeVisible();
    await expect(page.getByTestId("work-text")).toContainText("The planets stay in orbit");
    // the 6 labelled buttons per skill; the "no opportunity" button is not a 0
    const panel = page.getByTestId("target-A-L3-CAUSE-W");
    for (const v of ["0", "1", "2", "3", "4"] as const) {
      await expect(panel.getByTestId(`score-A-L3-CAUSE-W-${v}`)).toContainText(scoreLabels[v].short);
    }
    await expect(panel.getByTestId("score-A-L3-CAUSE-W-na")).toContainText(scoreLabels.null.short);
    // nothing chosen yet: save is disabled and says how many skills are left
    await expect(page.getByTestId("save-review")).toBeDisabled();
    await expect(page.getByTestId("save-review")).toHaveText(reviewPage.saveRemaining(2));
    // skill codes live only in the collapsed technical block
    await expect(page.getByTestId("review-page").locator("p, h1, h2, h3, label, span").filter({ hasText: /^A-L3-CAUSE-W$/ })).toHaveCount(0);
  });

  test("An's tutor: scores 2 skills (one 'no opportunity'), then corrects one with a reason and sees the history", async ({ page }) => {
    await loginAs(page, "tutorAn");
    scoredEpisode = await recordPaperWork(page, WRITE_STEP, "manual_import");
    await page.goto(`/review/${scoredEpisode}`);

    await page.getByTestId("score-A-L3-CAUSE-W-2").click();
    await expect(page.getByTestId("result-A-L3-CAUSE-W")).toContainText(formatScore(2));
    await expect(page.getByTestId("save-review")).toBeDisabled(); // one skill still open
    await page.getByTestId("score-A-L2-CHUNKS-na").click();
    await expect(page.getByTestId("save-review")).toBeEnabled();
    await page.getByTestId("save-review").click();
    await expect(page.getByTestId("saved-note")).toBeVisible();

    await expect(page.getByTestId("decided-A-L3-CAUSE-W")).toContainText(`Đã duyệt: ${formatScore(2)}`);
    await expect(page.getByTestId("decided-A-L2-CHUNKS")).toContainText(`Đã duyệt: ${scoreLabels.null.short}`);
    await expect(page.getByTestId("decided-A-L2-CHUNKS")).not.toContainText("0/4");

    // correct the first one: needs a different mark and a reason
    await page.getByTestId("modify-open-A-L3-CAUSE-W").click();
    await page.getByTestId("score-A-L3-CAUSE-W-new-3").click();
    await page.getByTestId("modify-save-A-L3-CAUSE-W").click();
    await expect(page.getByRole("alert").filter({ hasText: reviewPage.modifyReasonRequired })).toBeVisible();
    await page.getByTestId("modify-reason-A-L3-CAUSE-W").fill("Có đủ từ nối ở cả hai câu");
    await page.getByTestId("modify-save-A-L3-CAUSE-W").click();

    await expect(page.getByTestId("decided-A-L3-CAUSE-W")).toContainText(`Đã duyệt: ${formatScore(3)}`);
    const history = page.getByTestId("history-A-L3-CAUSE-W");
    await history.locator("summary").click();
    await expect(history.getByTestId("history-item-A-L3-CAUSE-W")).toHaveCount(2);
    await expect(history).toContainText(formatScore(2));
    await expect(history).toContainText(reviewPage.historyReason("Có đủ từ nối ở cả hai câu"));
    await expect(history).toContainText(reviewPage.historyCurrent);
    await expect(history).toContainText(reviewPage.historyReplaced);
    // the untouched skill has no history of change
    await expect(page.getByTestId("history-A-L2-CHUNKS")).toHaveCount(0);

    // after a reload the numbers are the same (they come from the database, not from the page)
    await page.reload();
    await expect(page.getByTestId("decided-A-L3-CAUSE-W")).toContainText(formatScore(3));
    await expect(page.getByTestId("decided-A-L2-CHUNKS")).toContainText(scoreLabels.null.short);
  });

  test("An's tutor: records a live speaking attempt from the learner's page (text only) and can open it to score", async ({ page }) => {
    await loginAs(page, "tutorAn");
    const activityId = await activityIdOf(page, SPEAK_STEP);
    await page.goto(`/learners/${LEARNER_IDS.an}/inquiries`);
    const step = page.getByTestId(`step-A-W4-PLANETS-${SPEAK_STEP}`).first();
    await step.getByTestId(`offline-open-${activityId}`).click();

    // no text, no "help" answer → blocked with a sentence, nothing sent
    await step.getByTestId(`offline-save-${activityId}`).click();
    await expect(step.getByTestId(`offline-error-${activityId}`)).toHaveText(offlineForm.textRequired);
    await step.getByTestId(`offline-text-${activityId}`).fill("The planets keep moving because of gravity. So they do not fly away.");
    await step.getByTestId(`offline-save-${activityId}`).click();
    await expect(step.getByTestId(`offline-error-${activityId}`)).toHaveText(offlineForm.helpRequired);
    await step.getByTestId(`offline-help-${activityId}-none`).check();
    await step.getByTestId(`offline-save-${activityId}`).click();

    const done = step.getByTestId(`offline-done-${activityId}`);
    await expect(done).toBeVisible();
    await done.getByRole("link", { name: offlineForm.openReview }).click();
    await expect(page).toHaveURL(/\/review\/[0-9a-f-]{36}$/);
    liveEpisode = page.url().split("/").pop()!;

    // the tutor watched it live → the tutor may score it
    await expect(page.getByTestId("read-only-note")).toHaveCount(0);
    await expect(page.getByTestId("score-A-L3-CAUSE-S-3")).toBeVisible();
    await expect(page.getByTestId("work-text")).toContainText("gravity");
  });

  test("a parent can read work the tutor watched live but cannot decide it (read-only page and API 403)", async ({ page }) => {
    expect(liveEpisode, "the previous test records the live work").not.toBe("");
    await loginAs(page, "parent");

    await page.goto(`/review/${liveEpisode}`);
    await expect(page.getByTestId("work-text")).toContainText("gravity");
    await expect(page.getByTestId("read-only-note")).toContainText(reviewPage.readOnlyTutorOnly);
    await expect(page.getByTestId("scoring-panel").locator('[data-testid^="score-"]')).toHaveCount(0);
    await expect(page.getByTestId("support-open")).toHaveCount(0); // a parent who cannot decide is not offered "add support" either
    await expect(page.getByTestId("save-review")).toHaveCount(0);

    await page.goto("/review?f=tutor");
    const item = page.getByTestId(`inbox-item-${liveEpisode}`);
    await expect(item).toBeVisible();
    await expect(item.getByTestId("waiting-tutor")).toHaveText(reviewPage.waitingTutor);

    // the database says no, whatever the page shows
    const res = await page.request.post(`/api/review/episodes/${liveEpisode}/decisions`, {
      data: { client_id: randomUUID(), items: [{ target_id: "A-L3-CAUSE-S", score: 3, not_observed: false }] },
    });
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("tutor_only");
    // and nothing was recorded
    const after = await page.request.get(`/api/review/episodes/${liveEpisode}`);
    expect(after.status()).toBe(200);
    const view = ((await after.json()) as { review: { viewer: { canDecide: boolean }; targets: { decisions: unknown[] }[] } }).review;
    expect(view.viewer.canDecide).toBe(false);
    for (const t of view.targets) expect(t.decisions).toEqual([]);
  });

  test("a parent can decide ordinary work (paper work she recorded herself)", async ({ page }) => {
    await loginAs(page, "parent");
    const episode = await recordPaperWork(page, WRITE_STEP, "manual_import");
    // she may not claim "watched live"
    const live = await page.request.post(`/api/learners/${LEARNER_IDS.an}/offline-attempts`, {
      data: {
        client_id: randomUUID(),
        activity_id: await activityIdOf(page, WRITE_STEP),
        provenance: "tutor_live",
        text: "x",
        session_date: todayVn(),
        assistance: ["none"],
      },
    });
    expect(live.status()).toBe(403);

    await page.goto(`/review/${episode}`);
    await page.getByTestId("score-A-L3-CAUSE-W-4").click();
    await page.getByTestId("score-A-L2-CHUNKS-1").click();
    await page.getByTestId("save-review").click();
    await expect(page.getByTestId("saved-note")).toBeVisible();
    await expect(page.getByTestId("decided-A-L3-CAUSE-W")).toContainText(formatScore(4));
    await expect(page.getByTestId("decided-A-L2-CHUNKS")).toContainText(formatScore(1));
  });

  test("a parent cannot record a checkpoint step or a live speaking step: the page shows a note instead of the form and the API says tutor-only", async ({ page }) => {
    await loginAs(page, "parent");
    const checkpointStep = 2; // A-W4 step 2: source Q&A, a checkpoint (open from the start)
    const activityId = await activityIdOf(page, checkpointStep);
    await page.goto(`/learners/${LEARNER_IDS.an}/inquiries`);
    const step = page.getByTestId(`step-A-W4-PLANETS-${checkpointStep}`).first();
    await expect(step.getByTestId(`offline-tutor-only-${activityId}`)).toHaveText(offlineForm.tutorOnlyNote);
    await expect(step.getByTestId(`offline-open-${activityId}`)).toHaveCount(0);
    const res = await page.request.post(`/api/learners/${LEARNER_IDS.an}/offline-attempts`, {
      data: { client_id: randomUUID(), activity_id: activityId, provenance: "manual_import", text: "x", session_date: todayVn(), assistance: ["none"] },
    });
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("tutor_only");
  });

  test("paper pilot import: a parent can date paper work before the assignment, but only with a reason", async ({ page }) => {
    await loginAs(page, "parent");
    const res = await page.request.get(`/api/learners/${LEARNER_IDS.an}/inquiries`);
    expect(res.status()).toBe(200);
    const data = (await res.json()) as { inquiries: { templateId: string; assignedAt: string; steps: { activityId: string; stepNo: number }[] }[] };
    const q = data.inquiries.find((i) => i.templateId === "A-W4-PLANETS");
    const activityId = q?.steps.find((s) => s.stepNo === 8)?.activityId; // ACT-SELF-REVIEW practice, not a checkpoint
    expect(activityId, "A-W4-PLANETS step 8").toBeTruthy();
    const earlier = addDays(todayVn(new Date(q!.assignedAt)), -5);

    await page.goto(`/learners/${LEARNER_IDS.an}/inquiries`);
    const step = page.getByTestId("step-A-W4-PLANETS-8").first();
    await step.getByTestId(`offline-open-${activityId}`).click();
    await expect(step.getByTestId(`offline-backdate-${activityId}`)).toHaveCount(0); // today: no reason needed
    await step.getByTestId(`offline-date-${activityId}`).fill(earlier);
    await expect(step.getByTestId(`offline-backdate-${activityId}`)).toBeVisible();
    await step.getByTestId(`offline-text-${activityId}`).fill("I checked my writing. I added because and so.");
    await step.getByTestId(`offline-help-${activityId}-none`).check();
    await step.getByTestId(`offline-save-${activityId}`).click();
    await expect(step.getByTestId(`offline-error-${activityId}`)).toHaveText(offlineForm.backdateRequired);
    await step.getByTestId(`offline-backdate-reason-${activityId}`).fill("Nhập từ phiếu giấy pilot 17–19/10");
    await step.getByTestId(`offline-save-${activityId}`).click();
    await expect(step.getByTestId(`offline-done-${activityId}`)).toBeVisible();
  });

  test("a lesson note with 3 next actions; the parent sees it only when shared", async ({ page }) => {
    const marker = `Buổi thử ${Date.now()}`;
    await loginAs(page, "tutorAn");
    await page.goto(`/learners/${LEARNER_IDS.an}/notes`);
    await expect(page.getByRole("heading", { level: 1, name: notesPage.title(AN) })).toBeVisible();

    await page.getByTestId("note-goals").fill(marker);
    await page.getByTestId("note-observed").fill("Em nói được hai câu có từ nối.");
    for (const [i, text] of ["Luyện thêm từ nối", "Viết lại đoạn ngắn", "Đọc to bài mẫu"].entries()) {
      await page.getByTestId(`note-action-${i + 1}`).fill(text);
    }
    await page.locator('[data-testid^="note-practised-"]').first().check();
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("note-saved")).toBeVisible();

    const note = page.getByTestId("notes-list").locator('[data-testid^="note-"]').filter({ hasText: marker }).first();
    await expect(note).toBeVisible();
    await expect(note.getByTestId("note-actions").locator("li")).toHaveCount(3);
    await expect(note).toContainText(notesPage.privateTag);

    // not shared → the parent does not see it
    await page.context().clearCookies();
    await loginAs(page, "parent");
    await page.goto(`/learners/${LEARNER_IDS.an}/notes`);
    await expect(page.getByText(marker)).toHaveCount(0);
    await expect(page.getByTestId("note-save")).toHaveCount(0); // parents do not write notes
  });

  test("a lesson note shared with the parent: the parent reads it, cannot write; a fourth action is refused", async ({ page }) => {
    const marker = `Buổi chia sẻ ${Date.now()}`;
    await loginAs(page, "tutorAn");
    // API: more than 3 next actions → 400, nothing saved
    const tooMany = await page.request.post(`/api/learners/${LEARNER_IDS.an}/lesson-notes`, {
      data: {
        client_id: randomUUID(),
        session_date: todayVn(),
        goals: marker,
        support_level: "light",
        next_actions: ["a", "b", "c", "d"],
        practised_target_ids: [],
        published: true,
      },
    });
    expect(tooMany.status()).toBe(400);
    const ok = await page.request.post(`/api/learners/${LEARNER_IDS.an}/lesson-notes`, {
      data: {
        client_id: randomUUID(),
        session_date: todayVn(),
        goals: marker,
        support_level: "light",
        next_actions: ["a", "b", "c"],
        practised_target_ids: [],
        published: true,
      },
    });
    expect(ok.status(), await ok.text()).toBe(201);

    await page.context().clearCookies();
    await loginAs(page, "parent");
    await page.goto(`/learners/${LEARNER_IDS.an}/notes`);
    await expect(page.getByText(marker)).toBeVisible();
    await expect(page.getByTestId("note-save")).toHaveCount(0);
    const write = await page.request.post(`/api/learners/${LEARNER_IDS.an}/lesson-notes`, {
      data: { client_id: randomUUID(), session_date: todayVn(), goals: "x", support_level: "none", next_actions: [], practised_target_ids: [], published: true },
    });
    expect(write.status()).toBe(403);
  });

  test("Nguyên's tutor sees none of An's work, notes or routes", async ({ page }) => {
    expect(seededEpisode && scoredEpisode && liveEpisode, "earlier tests create the episodes").toBeTruthy();
    await loginAs(page, "tutorNguyen");
    await page.goto("/review");
    await expect(page.getByRole("heading", { level: 1, name: reviewPage.inboxTitle })).toBeVisible();
    for (const f of ["todo", "tutor", "independent", "baseline", "practice", "done"]) {
      await page.goto(f === "todo" ? "/review" : `/review?f=${f}`);
      await expect(page.getByText(AN)).toHaveCount(0);
    }
    const inbox = await page.request.get("/api/review/inbox");
    expect(inbox.status()).toBe(200);
    expect(await inbox.text()).not.toContain(AN);
    expect(((await inbox.json()) as { items: unknown[] }).items).toEqual([]);

    for (const ep of [seededEpisode, scoredEpisode, liveEpisode]) {
      await notFound(page, `/review/${ep}`);
      expect((await page.request.get(`/api/review/episodes/${ep}`)).status()).toBe(404);
      const post = await page.request.post(`/api/review/episodes/${ep}/decisions`, {
        data: { client_id: randomUUID(), items: [{ target_id: "A-L3-CAUSE-W", score: 3, not_observed: false }] },
      });
      expect(post.status()).toBe(404);
    }
    await notFound(page, `/learners/${LEARNER_IDS.an}/notes`);
    expect((await page.request.get(`/api/learners/${LEARNER_IDS.an}/lesson-notes`)).status()).toBe(404);
    const offline = await page.request.post(`/api/learners/${LEARNER_IDS.an}/offline-attempts`, {
      data: {
        client_id: randomUUID(),
        activity_id: randomUUID(),
        provenance: "manual_import",
        text: "x",
        session_date: todayVn(),
        assistance: ["none"],
      },
    });
    expect(offline.status()).toBe(404);
  });

  for (const key of ["studentAn", "studentNguyen"] as const) {
    test(`${key}: no inbox link, no review or note pages, API refuses, and the child's home shows no score`, async ({ page }) => {
      await loginAs(page, key);
      await expect(page.getByTestId("review-link")).toHaveCount(0);
      await expect(page.getByRole("link", { name: reviewPage.link })).toHaveCount(0);
      await expect(page.getByRole("link", { name: notesPage.link })).toHaveCount(0);

      await notFound(page, "/review");
      for (const ep of [seededEpisode, scoredEpisode, liveEpisode]) {
        await notFound(page, `/review/${ep}`);
        expect([403, 404], `GET episode ${ep}`).toContain((await page.request.get(`/api/review/episodes/${ep}`)).status());
        const post = await page.request.post(`/api/review/episodes/${ep}/decisions`, {
          data: { client_id: randomUUID(), items: [{ target_id: "A-L3-CAUSE-W", score: 4, not_observed: false }] },
        });
        expect([403, 404], `POST decision ${ep}`).toContain(post.status());
      }
      expect((await page.request.get("/api/review/inbox")).status()).toBe(403);
      for (const learnerId of Object.values(LEARNER_IDS)) {
        await notFound(page, `/learners/${learnerId}/notes`);
        expect([403, 404]).toContain((await page.request.get(`/api/learners/${learnerId}/lesson-notes`)).status());
        const write = await page.request.post(`/api/learners/${learnerId}/lesson-notes`, {
          data: { client_id: randomUUID(), session_date: todayVn(), goals: "x", support_level: "none", next_actions: [], practised_target_ids: [], published: false },
        });
        expect([403, 404]).toContain(write.status());
      }

      // what the child can read stays free of marks, decisions, observations and notes
      const home = await page.request.get("/api/student/home");
      expect(home.status()).toBe(200);
      const text = await home.text();
      expect(text).not.toMatch(SCORE_PATTERN);
      for (const k of ["decision", "observation", "lesson_note", "validator", "next_actions", "rationale"]) expect(text, k).not.toContain(k);
      expect(await page.locator("body").innerText()).not.toMatch(SCORE_PATTERN);
    });
  }
});

// S6: feedback → revision → before–after → "đã xem" → "Bài đã sửa". Fresh work on A-W4 step 7 (practice, repeatable) every run.
test.describe.serial("S6 feedback and revision", () => {
  const PLANETS = "Sao Kim";
  const TEXT = "Venus is hotter than Mars because it has a thick atmosphere. Mars is cold because its air is thin.";
  let workAttempt = "";
  let revisionActivity = "";
  let revisionAttempt = "";

  /** The inbox episode of one attempt (the inbox pages through the database; oldest first). */
  async function episodeOfAttempt(page: Page, attemptId: string): Promise<string> {
    let after = "";
    for (let i = 0; i < 20; i++) {
      const res = await page.request.get(`/api/review/inbox?filter=todo&limit=100${after}`);
      expect(res.status()).toBe(200);
      const data = (await res.json()) as { items: { episodeId: string; attemptId: string }[]; next: { at: string; id: string } | null };
      const hit = data.items.find((x) => x.attemptId === attemptId);
      if (hit) return hit.episodeId;
      if (!data.next) break;
      after = `&after_at=${encodeURIComponent(data.next.at)}&after_id=${data.next.id}`;
    }
    throw new Error(`no inbox item for attempt ${attemptId}`);
  }

  test("An writes a new practice paragraph in the app (A-W4 step 7)", async ({ page }) => {
    await loginAs(page, "studentAn");
    const home = (await (await page.request.get("/api/student/home")).json()) as { inquiries: { titleVi: string; steps: { activityId: string; stepNo: number }[] }[] };
    const step7 = home.inquiries.find((q) => q.titleVi.includes(PLANETS))?.steps.find((s) => s.stepNo === 7);
    expect(step7, "A-W4-PLANETS step 7").toBeTruthy();
    const res = await page.request.post("/api/attempts", {
      data: { activity_id: step7!.activityId, client_submission_id: randomUUID(), content: { text: TEXT }, assistance: ["none"], provenance: "in_app" },
    });
    expect(res.status(), await res.text()).toBe(201);
    workAttempt = ((await res.json()) as { receipt: { attemptId: string } }).receipt.attemptId;
  });

  test("An's tutor: a score in the praise is refused; praise + one item with an excerpt is sent; 'Sửa góp ý' works before An starts", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.goto(`/review/${await episodeOfAttempt(page, workAttempt)}`);
    const panel = page.getByTestId("feedback-panel");
    await panel.getByTestId("feedback-praise").fill("Bài được 3/4");
    await panel.getByTestId("feedback-item-1-text").fill("Thêm một câu kết cho đoạn văn.");
    await panel.getByTestId("feedback-send").click();
    await expect(panel.getByTestId("feedback-problem")).toHaveText(feedbackCopy.errors.score_words!);
    await panel.getByTestId("feedback-praise").fill("Con so sánh rõ Sao Kim và Sao Hỏa.");
    await panel.getByTestId("feedback-item-1-excerpt").fill("its air is thin");
    await expect(panel.getByTestId("feedback-require")).toBeChecked();
    const [sent] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/review/attempts/${workAttempt}/feedback`) && r.request().method() === "POST"),
      panel.getByTestId("feedback-send").click(),
    ]);
    expect(sent.status(), await sent.text()).toBe(201);
    revisionActivity = ((await sent.json()) as { revision_activity_id: string }).revision_activity_id;
    await expect(panel.getByTestId("feedback-live")).toContainText("Con so sánh rõ Sao Kim và Sao Hỏa.");

    await panel.getByTestId("feedback-edit").click();
    await panel.getByTestId("feedback-item-1-text").fill("Thêm một câu kết nói hành tinh nào nóng hơn.");
    await panel.getByTestId("feedback-send").click();
    await expect(panel.getByTestId("feedback-live")).toContainText("Thêm một câu kết nói hành tinh nào nóng hơn.");
    await expect(panel.getByTestId("feedback-history")).toBeVisible();
    // the server refuses a score before the database
    const bad = await page.request.post(`/api/review/attempts/${workAttempt}/feedback`, {
      data: { client_id: randomUUID(), praise: "Được 80%", items: [{ text: "x" }], requires_revision: false },
    });
    expect(bad.status()).toBe(400);
  });

  test("Nguyên's tutor cannot give feedback on An's work (404)", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    const res = await page.request.post(`/api/review/attempts/${workAttempt}/feedback`, {
      data: { client_id: randomUUID(), praise: "Tốt", items: [{ text: "x" }], requires_revision: true },
    });
    expect(res.status()).toBe(404);
  });

  test("An: 'Sửa bài' sits above Việc tiếp theo; the page shows praise and the marked excerpt; An revises, marks the item, gets a receipt - no score", async ({ page }) => {
    await loginAs(page, "studentAn");
    const row = page.getByTestId(`revision-row-${revisionActivity}`);
    await expect(row).toContainText(revisionCopy.rowTitle(""));
    const rowsBox = await page.getByTestId("revision-rows").boundingBox();
    const nextBox = await page.locator('[data-testid="next-task"], [data-testid="no-next-task"]').first().boundingBox();
    expect(rowsBox!.y).toBeLessThan(nextBox!.y);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/activities/${revisionActivity}$`));
    await expect(page.getByTestId("revision-praise")).toContainText("Con so sánh rõ Sao Kim và Sao Hỏa.");
    await page.getByText(revisionCopy.showOld).click();
    await expect(page.getByTestId("excerpt-1")).toHaveText(/its air is thin/);
    const editor = page.getByTestId("revision-editor");
    await expect(editor).toHaveValue(TEXT);
    await editor.fill(`${TEXT} So Venus is the hottest planet.`);
    await page.getByTestId("revision-mark-1-changed").check();
    await page.getByLabel(revisionCopy.reasonLabel(false)).first().fill("Mình thêm câu kết.");
    await page.getByLabel(work.help.none).check(); // same help declaration as S4
    const [sent] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/student/revisions/${revisionActivity}`) && r.request().method() === "POST"),
      page.getByTestId("revision-submit").click(),
    ]);
    expect(sent.status(), await sent.text()).toBe(201);
    revisionAttempt = ((await sent.json()) as { receipt: { attemptId: string } }).receipt.attemptId;
    await expect(page.getByTestId("revision-receipt")).toContainText(revisionCopy.receiptTitle);
    expect(await page.locator("body").innerText()).not.toMatch(SCORE_PATTERN);
  });

  test("An's tutor: 'Bài sửa lại (vòng 1)' shows before-after, Xong waits for the verdict, then closes with a note", async ({ page }) => {
    await loginAs(page, "tutorAn");
    await page.goto(`/review/${await episodeOfAttempt(page, revisionAttempt)}`);
    const r = page.getByTestId("revision-review");
    await expect(r).toContainText(revisionReviewCopy.title(1));
    await expect(page.getByText(revisionReviewCopy.supportedTag)).toBeVisible();
    await expect(r.getByTestId("diff-after").locator("ins")).not.toHaveCount(0);
    await expect(r.getByTestId("revision-finish")).toBeDisabled();
    await r.getByTestId("verdict-1-improved").click();
    await r.getByTestId("revision-closing").fill("Câu kết rất rõ!");
    await r.getByTestId("revision-finish").click();
    await expect(r.getByTestId("revision-done")).toContainText("Câu kết rất rõ!");
  });

  test("An sees 'Thầy/cô đã xem bài sửa của bạn' with the note - still no score", async ({ page }) => {
    await loginAs(page, "studentAn");
    const box = page.getByTestId("feedback-box");
    await expect(box).toContainText(revisionCopy.seenTitle);
    await expect(box).toContainText("Câu kết rất rõ!");
    expect(await page.locator("body").innerText()).not.toMatch(SCORE_PATTERN);
  });

  test("the parent reads the pair under 'Bài đã sửa' (no buttons); the child cannot open that page", async ({ page, browser }) => {
    await loginAs(page, "parent");
    await page.getByTestId(`revisions-link-${LEARNER_IDS.an}`).click();
    const pair = page.getByTestId(`revision-pair-${revisionAttempt}`);
    await expect(pair).toContainText(revisionReviewCopy.stateDone);
    await pair.getByRole("link").click();
    await expect(page.getByTestId("revision-review")).toBeVisible();
    await expect(page.getByTestId("revision-finish")).toHaveCount(0);
    const kid = await browser.newPage();
    await loginAs(kid, "studentAn");
    await notFound(kid, `/learners/${LEARNER_IDS.an}/revisions`);
    await kid.close();
  });
});
