import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { levelCopy, resultPage, studentReviewCopy, sessionNotePage, tagPicker, todayPage, weakPage, deskCopy } from "@/lib/copy/vi";
import { addDays, todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";
import { LEARNER_IDS, loginAs } from "./helpers";

// S5b-1 PR A: "Hôm nay", "Ghi kết quả bài" (framed + quick), "Chờ gắn nhãn", "Ghi buổi học", "Điểm cần chú ý".
// The dev seed imports the Destination U1-12 frame into the test family (60 items, 7 parts, a scale) and gives Nguyên track B tags (0015).
// Everything here is about Nguyên (thử) and his tutor; each run records NEW results and notes (new client ids), so it can be repeated.

const NG = LEARNER_IDS.nguyen;

async function notFound(page: Page, target: string) {
  const res = await page.goto(target);
  expect(res?.status(), target).toBe(404);
}

test.describe.serial("S5b-1 tutor work", () => {
  test("the tutor's home is 'Hôm nay' with the two main actions for the child", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^${deskCopy.titlePrefix}`) })).toBeVisible();
    await expect(page.getByTestId(`action-note-${NG}`)).toContainText(todayPage.noteAction);
    await expect(page.getByTestId(`action-result-${NG}`)).toContainText(todayPage.resultAction);
    await expect(page.getByTestId(`attention-${NG}`)).toBeVisible();
    await page.getByTestId(`action-result-${NG}`).click();
    await expect(page).toHaveURL(new RegExp(`/learners/${NG}/results/new`));
  });

  test("framed result: click wrong items, see the total and the band update, save", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    // The framed grid is no longer offered on the screen (UX round 1); the old link still opens it.
    await page.goto(`/learners/${NG}/results/new?mode=frame`);
    await expect(page.getByTestId("mode-frame")).toHaveCount(0);
    await expect(page.getByTestId("frame-grid")).toBeVisible();
    await expect(page.locator('[data-testid^="item-"]')).toHaveCount(60);
    await expect(page.getByTestId("frame-score")).toHaveText(resultPage.scoreOf(60, 60));
    for (const n of [1, 2, 13]) await page.getByTestId(`item-${n}`).click();
    await expect(page.getByTestId("frame-score")).toHaveText(resultPage.scoreOf(57, 60));
    await expect(page.getByTestId("frame-band")).toContainText(resultPage.scaleLine("Rất tốt"));
    await expect(page.getByTestId("frame-tags").locator("li").first()).toBeVisible();
    await page.getByTestId("grid-clear").click();
    await expect(page.getByTestId("frame-score")).toHaveText(resultPage.scoreOf(60, 60));
    for (const n of [1, 2, 13, 55]) await page.getByTestId(`item-${n}`).click();
    await page.getByTestId("result-save").click();
    await expect(page.getByTestId("result-saved")).toContainText(resultPage.saved(0));
    // saved: the form is read-only until "Ghi bài khác" - a second click cannot record the same work twice
    await expect(page.getByTestId("result-save")).toBeDisabled();
    await page.getByTestId("result-another").click();
    await expect(page.getByTestId("result-save")).toBeEnabled();
  });

  test("quick result by part: two parts, the overall is added up, wrong items are numbered inside each part", async ({ page }) => {
    const title = `Bài hai phần ${Date.now()}`;
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/results/new`);
    await page.getByTestId("quick-title").fill(title);
    await page.getByTestId("quick-total").fill("10");
    await page.getByTestId("quick-correct").fill("9");
    await page.getByTestId("quick-wrong").fill("3");
    await page.getByTestId("quick-part-add").click();
    await page.getByTestId("quick-part-name").fill("Nghe");
    await page.getByTestId("quick-part-name-2").fill("Đọc");
    await page.getByTestId("quick-total-2").fill("15");
    await page.getByTestId("quick-correct-2").fill("14");
    await page.getByTestId("quick-wrong-2").fill("2");
    await expect(page.getByTestId("quick-overall")).toHaveText(resultPage.overall(23, 25));
    await page.getByTestId("result-save").click();
    await expect(page.getByTestId("result-saved")).toContainText(resultPage.saved(2));
  });

  test("quick result: a tag for one wrong item, the other waits in 'Chờ gắn nhãn' and is tagged there", async ({ page }) => {
    const title = `Bài link thử ${Date.now()}`;
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/results/new`);
    await expect(page.getByTestId("mode-frame")).toHaveCount(0);
    await expect(page.getByTestId("quick-entry")).toBeVisible();
    await page.getByTestId("quick-title").fill(title);
    await page.getByTestId("quick-total").fill("10");
    await page.getByTestId("quick-correct").fill("8");
    await page.getByTestId("quick-wrong").fill("4, 7");
    await page.getByTestId("quick-tag-4").selectOption("cau-dieu-kien-dao-ngu");
    // a count that does not match is refused before anything is sent
    await page.getByTestId("quick-correct").fill("9");
    await page.getByTestId("result-save").click();
    await expect(page.getByTestId("result-error")).toHaveText(resultPage.wrongCountMismatch);
    await page.getByTestId("quick-correct").fill("8");
    await page.getByTestId("attempt-first").click();
    await page.getByTestId("hint-yes").click();
    await page.getByTestId("result-save").click();
    await expect(page.getByTestId("result-saved")).toContainText(resultPage.saved(1));

    const pending = page.getByTestId("pending-tags").locator('[data-testid^="pending-"]', { hasText: title }).first();
    await expect(pending).toBeVisible();
    await pending.locator("select").first().selectOption("dang-tu");
    await pending.getByRole("button", { name: resultPage.pendingSave }).click();
    await expect(page.getByTestId("pending-saved")).toBeVisible();
    await expect(pending).toHaveCount(0); // fully tagged: gone from the list after the refresh
  });

  test("a family tag: '+ nhãn khác' on the session screen creates it and ticks it", async ({ page }) => {
    const label = `Đảo ngữ thử ${Date.now()}`;
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/notes/new`);
    await page.getByTestId("add-tag-input").fill(label);
    await page.getByTestId("add-tag-domain").selectOption("grammar");
    await page.getByTestId("add-tag-group").selectOption("gr-emphasis");
    await page.getByTestId("add-tag-button").click();
    await expect(page.getByText(tagPicker.added(label))).toBeVisible();
    await expect(page.getByRole("checkbox", { name: new RegExp(label) })).toHaveAttribute("aria-checked", "true");
  });

  test("session note: an unaccented search finds the tag, and the count of chosen skills shows", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/notes/new`);
    await page.getByTestId("search-session-tags").fill("dang tu");
    await page.getByTestId("tag-chip-dang-tu").click();
    await expect(page.getByTestId("session-tags-chosen")).toContainText("Dạng từ");
    await page.getByTestId("session-practised").getByRole("tabpanel").locator('button[data-testid^="session-practised-"]').first().click();
    await expect(page.getByTestId("session-practised-count")).toHaveText(sessionNotePage.practisedChosen(1));
  });

  test("session note: tags (max 3), message, note for the parent - the parent reads it, the child's page for it is closed to the student", async ({ page }) => {
    const studied = `Buổi thử ${Date.now()}`;
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/notes/new`);
    await expect(page.getByRole("heading", { level: 1, name: sessionNotePage.title("Nguyên (thử)") })).toBeVisible();
    await page.getByTestId("session-studied").fill(studied);
    // "practised today" (optional) - logged as an exposure. Only the open tab's panel counts (the others are hidden).
    await page.getByTestId("session-practised").getByRole("tabpanel").locator('button[data-testid^="session-practised-"]').first().click();
    await page.getByTestId("tab-session-tags-vocab").click();
    await page.getByTestId("tag-chip-dang-tu").click();
    await page.getByTestId("tag-chip-cum-dong-tu").click();
    await page.getByTestId("tab-session-tags-speaking").click();
    await page.getByTestId("tag-chip-phat-am").click();
    await page.getByTestId("tab-session-tags-vocab").click();
    await expect(page.getByTestId("tag-chip-thanh-ngu")).toBeDisabled(); // 4th is not allowed
    await expect(page.getByTestId("session-tags-chosen")).toContainText("Dạng từ");
    await page.getByTestId("session-message").fill("Ôn lại dạng từ và cụm động từ nhé.");
    await page.getByTestId("session-parent-note").fill("Em hiểu bài, cần luyện thêm cụm động từ.");
    await page.getByTestId("session-save").click();
    await expect(page.getByTestId("session-saved")).toBeVisible();

    await page.context().clearCookies();
    await loginAs(page, "parent");
    await page.goto(`/learners/${NG}/notes`);
    await expect(page.getByText(studied)).toBeVisible();
    await expect(page.getByTestId("note-for-parent").filter({ hasText: "cụm động từ" }).first()).toBeVisible();
  });

  test("UX vòng 3A: two session notes on two days show up as two sessions (calendar, month sheet), the same for the parent", async ({ page }) => {
    const vnDaysAgo = (n: number) => new Date(Date.now() + 7 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);
    const days = [vnDaysAgo(100), vnDaysAgo(101)];
    await loginAs(page, "tutorNguyen");
    for (const d of days) {
      await page.goto(`/learners/${NG}/notes/new`);
      await page.getByTestId("session-date").fill(d);
      await page.getByTestId("session-studied").fill(`Buổi đếm ${d}`);
      await page.getByTestId("session-save").click();
      await expect(page.getByTestId("session-saved")).toBeVisible();
    }
    const check = async () => {
      await page.goto(`/learners/${NG}/notes`);
      await expect(page.getByTestId("session-stats")).toBeVisible();
      for (const m of new Set(days.map((d) => d.slice(0, 7)))) await expect(page.getByTestId(`month-row-${m}`), m).toBeVisible();
      for (const d of days) {
        await page.goto(`/learners/${NG}/notes/month/${d.slice(0, 7)}`);
        await expect(page.getByTestId("month-sheet")).toBeVisible();
        await expect(page.getByTestId(`sheet-row-${d}`)).toBeVisible();
      }
    };
    await check();
    await page.context().clearCookies();
    await loginAs(page, "parent");
    await check();
  });

  test("UX vòng 3B: a billable absence adds a billable session; a makeup note for it shows 'học bù'; 'Không tính' takes a note out; the child sees nothing", async ({ page }) => {
    // Two days of one month in the past (the 10th and 11th, two months back): same month for both, inside the 120-day window, never today.
    const vn = new Date(Date.now() + 7 * 3_600_000);
    const back = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() - 2, 10));
    const absentOn = back.toISOString().slice(0, 10);
    const makeupOn = new Date(back.getTime() + 86_400_000).toISOString().slice(0, 10);
    const billableOf = async (day: string) => {
      await page.goto(`/learners/${NG}/notes/month/${day.slice(0, 7)}`);
      return Number((await page.getByTestId("month-billable").textContent())?.match(/\d+/)?.[0] ?? "NaN");
    };
    await loginAs(page, "tutorNguyen");
    const before = await billableOf(absentOn);
    await page.goto(`/learners/${NG}/notes`);
    await page.getByTestId("absence-date").fill(absentOn);
    await page.getByTestId("absence-by-student").click();
    await page.getByTestId("absence-billable-yes").click();
    await page.getByTestId("absence-save").click();
    await expect(page.getByTestId("absence-list")).toContainText(`${absentOn.slice(8, 10)}/${absentOn.slice(5, 7)}`);
    expect(await billableOf(absentOn)).toBe(before + 1);
    await expect(page.getByTestId("month-absence-list")).toContainText(`${absentOn.slice(8, 10)}/${absentOn.slice(5, 7)}`);

    // a makeup note that points to the absence
    await page.goto(`/learners/${NG}/notes/new`);
    await page.getByTestId("session-date").fill(makeupOn);
    await page.getByTestId("session-studied").fill(`Học bù ${makeupOn}`);
    await page.getByTestId("session-kind-makeup").click();
    await page.getByTestId("session-makeup-for").selectOption({ label: `${absentOn.slice(8, 10)}/${absentOn.slice(5, 7)} · con, có tính phí` });
    await page.getByTestId("session-save").click();
    await expect(page.getByTestId("session-saved")).toBeVisible();
    await page.goto(`/learners/${NG}/notes/month/${makeupOn.slice(0, 7)}`);
    await expect(page.getByTestId(`sheet-row-${makeupOn}`)).toContainText("học bù");

    // "Không tính": the note leaves the count
    await page.goto(`/learners/${NG}/notes`);
    const li = page.locator('[data-testid^="note-"]').filter({ hasText: `Học bù ${makeupOn}` }).first();
    await li.getByRole("button", { name: /Đánh dấu/ }).click();
    await page.getByTestId("note-mark-kind-not_counted").click();
    await page.getByTestId("note-mark-reason").fill("ghi nhầm em");
    await page.getByTestId("note-mark-save").click();
    await expect(page.locator('[data-testid^="note-not-counted-"]').first()).toBeVisible();
    await page.goto(`/learners/${NG}/notes/month/${makeupOn.slice(0, 7)}`);
    await expect(page.getByTestId(`sheet-row-${makeupOn}`)).toHaveCount(0);

    // the parent sees the same page; the child cannot write
    await page.context().clearCookies();
    await loginAs(page, "parent");
    await page.goto(`/learners/${NG}/notes/month/${absentOn.slice(0, 7)}`);
    await expect(page.getByTestId("month-absence-list")).toBeVisible();
    await page.context().clearCookies();
    await loginAs(page, "studentNguyen");
    const res = await page.request.post(`/api/learners/${NG}/sessions/absences`, { data: { client_id: "client-e2e-0001", absent_on: absentOn, requested_by: "student", billable: true } });
    expect(res.status()).toBe(403);
    expect((await page.goto(`/learners/${NG}/notes`))?.status()).toBe(404);
  });

  test("Điểm cần chú ý: the table for the child, with windows; the parent sees it too", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/weak?weeks=all`);
    await expect(page.getByRole("heading", { level: 1, name: weakPage.title("Nguyên (thử)") })).toBeVisible();
    await expect(page.getByTestId("weak-tile-vocab")).toBeVisible();
    await page.getByTestId("weak-tile-all").click();
    await expect(page).toHaveURL(/domain=all/);
    await expect(page.getByTestId("weak-table")).toBeVisible();
    await expect(page.locator('[data-testid^="weak-row-"]').first()).toBeVisible();
    await expect(page.getByTestId("weak-window-4")).toHaveText(weakPage.windows["4"] ?? "");
    await page.getByTestId("weak-window-4").click();
    await expect(page).toHaveURL(/weeks=4/);
    await page.context().clearCookies();
    await loginAs(page, "parent");
    await page.goto(`/learners/${NG}/weak`);
    await expect(page.getByTestId("weak-page")).toBeVisible();
  });

  test("work done in the session: only the tutor (the form hides it for a parent; the API says tutor_only)", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/results/new`);
    await expect(page.getByTestId("context-class")).toBeVisible();
    await page.context().clearCookies();
    await loginAs(page, "parent");
    await page.goto(`/learners/${NG}/results/new`);
    await expect(page.getByTestId("context-class")).toHaveCount(0);
    await expect(page.getByText(resultPage.contextClassTutorOnly)).toBeVisible();
    const res = await page.request.post(`/api/learners/${NG}/results`, {
      data: {
        client_id: randomUUID(), mode: "quick", title: "Trong buổi", total_items: 5, correct: 4, wrong_items: [2], tags: [],
        context: "class", attempt: "first", used_hint: false, taken_on: todayVn(),
      },
    });
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("tutor_only");
  });

  test("the other child's tutor and the students get nothing", async ({ page }) => {
    await loginAs(page, "tutorAn");
    for (const p of ["results/new", "notes/new", "weak", "levels", "levels/baseline"]) await notFound(page, `/learners/${NG}/${p}`);
    const other = await page.request.post(`/api/learners/${NG}/results`, {
      data: { client_id: randomUUID(), mode: "quick", title: "x", total_items: 5, correct: 5, wrong_items: [], context: "home", attempt: "first", used_hint: false, taken_on: todayVn() },
    });
    expect(other.status()).toBe(404);

    await page.context().clearCookies();
    await loginAs(page, "studentNguyen");
    for (const p of ["results/new", "notes/new", "weak", "levels", "levels/baseline"]) await notFound(page, `/learners/${NG}/${p}`);
    const mine = await page.request.post(`/api/learners/${NG}/results`, {
      data: { client_id: randomUUID(), mode: "quick", title: "x", total_items: 5, correct: 5, wrong_items: [], context: "home", attempt: "first", used_hint: false, taken_on: todayVn() },
    });
    expect(mine.status()).toBe(403);
    const tags = await page.request.post(`/api/learners/${NG}/tags`, { data: { label: "Nhãn lạ" } });
    expect(tags.status()).toBe(403);
  });

  test("Hồ sơ cấp: the tutor confirms the starting levels; the parent reads them, sees the change on her home, adds an exam result, and may not decide", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/levels`);
    await expect(page.getByTestId("level-summary")).toContainText(levelCopy.whereTitle("Nguyên (thử)"));
    await expect(page.locator('[data-testid^="level-bar-"]')).toHaveCount(7);
    await page.goto(`/learners/${NG}/levels/baseline`);
    // A re-run on the same database finds every domain already confirmed: then there is no form, only the "đã xác nhận" note.
    if ((await page.getByTestId("baseline-form").count()) > 0) {
      await page.getByTestId("baseline-grammar").selectOption("B2+");
      await page.getByTestId("baseline-save").click();
      await page.waitForURL(`**/learners/${NG}/levels`);
    }
    await page.goto(`/learners/${NG}/levels?domain=grammar`);
    await expect(page.getByTestId("level-bar-grammar")).toHaveAttribute("data-status", "confirmed");
    await expect(page.getByTestId("level-detail-grammar")).toContainText(levelCopy.adjustLink);

    await page.context().clearCookies();
    await loginAs(page, "parent");
    await expect(page.getByTestId("recent-levels")).toContainText(levelCopy.kindLabels.baseline!);
    const denied = await page.request.post(`/api/learners/${NG}/levels`, {
      data: { client_id: randomUUID(), kind: "adjust", levels: { grammar: "C1" }, reason: "thử" },
    });
    expect(denied.status()).toBe(403);
    await notFound(page, `/learners/${NG}/levels/baseline`);
    await page.goto(`/learners/${NG}/levels/external/new`);
    await page.getByTestId("external-exam").selectOption("FCE");
    const wrongScore = `165 · ${randomUUID().slice(0, 6)}`;
    const rightScore = `172 · ${randomUUID().slice(0, 6)}`;
    await page.getByTestId("external-score").fill(wrongScore);
    await page.getByTestId("external-domain-reading").check();
    await page.getByTestId("external-save").click();
    await page.waitForURL(`**/learners/${NG}/levels`);
    await expect(page.getByTestId("milestones")).toContainText(wrongScore);
    // A2: a wrong entry is corrected by a replacement; the profile then lists only the new score (the old one stays as "đã sửa").
    const examLabel = "FCE (B2 First)";
    const line = (score: string) => levelCopy.externalLine(examLabel, formatDateVi(todayVn()), score);
    await page.getByText(line(wrongScore), { exact: true }).locator("xpath=..").getByRole("link", { name: levelCopy.editExternal }).click();
    await expect(page.getByTestId("external-form")).toHaveAttribute("data-editing", /.+/);
    await page.getByTestId("external-score").fill(rightScore);
    await page.getByTestId("external-save").click();
    await page.waitForURL(`**/learners/${NG}/levels`);
    await expect(page.getByText(line(rightScore), { exact: true })).toHaveCount(1);
    await expect(page.getByText(line(wrongScore), { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("milestones")).toContainText(levelCopy.corrected(wrongScore));
    expect(await page.locator("body").innerText()).not.toMatch(/tomo/i);
  });
  test("Việc cần ôn: a tag whose re-check is due shows on the student's home, grouped by domain, with no level or score", async ({ page }) => {
    // 20 days ago, one wrong item with a tag: after the 14-day policy it is due for a re-check (the same case as the DB test)
    await loginAs(page, "tutorNguyen");
    const saved = await page.request.post(`/api/learners/${NG}/results`, {
      data: {
        client_id: randomUUID(), mode: "quick", title: "Ôn tập cũ", total_items: 5, correct: 4, wrong_items: [1], tags: [{ n: 1, tag_key: "modal-suy-doan" }],
        context: "home", attempt: "first", used_hint: false, taken_on: addDays(todayVn(), -20),
      },
    });
    expect(saved.status()).toBe(201);
    await page.context().clearCookies();
    await loginAs(page, "studentNguyen");
    const box = page.getByTestId("review-by-domain");
    await expect(box).toContainText(studentReviewCopy.title);
    await expect(box).not.toContainText(/\b[ABC][12]\b|\/\d|bậc/);
    await expect(page.getByTestId("review-by-domain").locator("li").first()).toBeVisible();
  });
});
