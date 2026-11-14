import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";
import { assignPage, practiceStudent, resultPage, tagPicker, unitPickerCopy } from "@/lib/copy/vi";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { todayVn } from "@/lib/inquiries/dates";
import { LEARNER_IDS, loginAs } from "./helpers";

// S5b-1 PR B: the tutor gives a PDF, the child downloads it and sends a picture, the tutor reads the picture beside "Nhập nhanh",
// records the result with tags, and the weak point appears - while the child never sees a score. Needs Supabase STORAGE in the local
// stack (supabase/config.toml [storage] enabled = true): the files really go to the private bucket "english-work".
// Everything is about Nguyên (thử) and his tutor; each run gives NEW work (unique titles), so it can be repeated.

const NG = LEARNER_IDS.nguyen;
const AN = LEARNER_IDS.an;
// "3/4" or "14/20" - but not a date such as 17/10/2026
const SCORE_PATTERN = /(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])|điểm|đúng|sai\b/i;

// A minimal, valid one-page PDF and a valid 2x2 PNG (so the browser can really decode it).
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4//8/AxBAKAAy2wX7iosRtAAAAABJRU5ErkJggg==", "base64");

/** Other specs may have approved a curriculum for the child (the form then keeps the manual items under "+ Thêm mục kiến thức khác"): open it. */
async function openExtraItems(page: Page) {
  const extra = page.getByTestId("assign-extra-items");
  if ((await extra.count()) > 0) await extra.locator("summary").click();
}

/** The id of the assignment row with this title on the Giao bài page. */
async function assignmentIdOf(page: Page, title: string): Promise<string> {
  const row = page.locator('li[data-testid^="assignment-"]', { hasText: title }).first();
  await expect(row).toBeVisible();
  const id = (await row.getAttribute("data-testid"))?.replace("assignment-", "");
  if (!id) throw new Error("assignment row has no id");
  return id;
}

test.describe.serial("S5b-1 practice: a PDF out, a picture back, a result with tags", () => {
  const title = `Đề PDF thử ${Date.now()}`;
  let assignmentId = "";
  let fileId = "";

  test("the tutor gives a PDF (uploaded straight to the private bucket) and can open it", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/assign?way=pdf`);
    await expect(page.getByTestId("assign-page")).toBeVisible();
    await page.getByTestId("pdf-input").setInputFiles({ name: "de-thu.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByTestId("pdf-chosen")).toContainText("de-thu.pdf");
    await page.getByTestId("assign-title").fill(title);
    await openExtraItems(page);
    await page.getByTestId("tab-assign-tags-vocab").click();
    await page.getByTestId("tag-chip-thanh-ngu").click();
    await page.getByTestId("assign-due").fill(todayVn());
    await page.getByTestId("assign-submit").click();
    await expect(page.getByTestId("assign-done")).toContainText(assignPage.done);

    assignmentId = await assignmentIdOf(page, title);
    await expect(page.getByTestId(`status-${assignmentId}`)).toHaveText(assignPage.statusNotDone);
    const open = page.getByTestId(`assignment-${assignmentId}`).locator('a[href^="/api/files/"]').first();
    const href = await open.getAttribute("href");
    fileId = (href ?? "").replace("/api/files/", "");
    expect(fileId).toMatch(/^[0-9a-f-]{36}$/);
    const res = await page.request.get(href as string); // follows the redirect to a fresh signed link
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("pdf");
    expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("switching from the link way to the PDF way through the strip gives a PDF assignment (no stale kind)", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/assign?way=link`);
    await expect(page.getByTestId("assign-url")).toBeVisible();
    await page.getByTestId("strip-pdf").click();
    await expect(page).toHaveURL(/way=pdf/);
    await expect(page.getByTestId("pdf-input")).toBeVisible();
    await expect(page.getByTestId("assign-url")).toHaveCount(0);
    const t = `Đề đổi cách ${Date.now()}`;
    await page.getByTestId("pdf-input").setInputFiles({ name: "doi-cach.pdf", mimeType: "application/pdf", buffer: PDF });
    await page.getByTestId("assign-title").fill(t);
    await openExtraItems(page);
    await page.getByTestId("tab-assign-tags-vocab").click();
    await page.getByTestId("tag-chip-thanh-ngu").click();
    await page.getByTestId("assign-due").fill(todayVn());
    await page.getByTestId("assign-submit").click();
    await expect(page.getByTestId("assign-done")).toContainText(assignPage.done);
    const id = await assignmentIdOf(page, t);
    // A PDF assignment has a file to open; a link one would not.
    await expect(page.getByTestId(`assignment-${id}`).locator('a[href^="/api/files/"]').first()).toBeVisible();
  });

  test("a link is recognised by its source and a non-https link is refused", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/assign?way=link`);
    await page.getByTestId("assign-url").fill("https://notebooklm.google.com/notebook/abc");
    await expect(page.getByTestId("assign-source")).toContainText(assignPage.sourceDetected("NotebookLM"));
    await page.getByTestId("assign-url").fill("http://example.com/x");
    await expect(page.getByTestId("assign-source")).toContainText(assignPage.linkInvalid);
    await page.getByTestId("assign-title").fill("Link thử");
    await page.getByTestId("assign-submit").click();
    await expect(page.getByTestId("assign-error")).toHaveText(assignPage.needLink);
  });

  test("the tutor picks three knowledge items across tabs and through the search box (Enter never gives the assignment)", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/assign?way=link`);
    await page.getByTestId("assign-title").fill(`Ba mục thử ${Date.now()}`);
    await page.getByTestId("assign-url").fill("https://notebooklm.google.com/notebook/abc");
    await openExtraItems(page);
    await page.getByTestId("tab-assign-tags-vocab").click();
    await page.getByTestId("tag-chip-thanh-ngu").click();
    await page.getByTestId("search-assign-tags").fill("phat am");
    await page.getByTestId("search-assign-tags").press("Enter");
    await expect(page.getByTestId("assign-done")).toHaveCount(0);
    await expect(page.getByTestId("assign-tags")).toContainText(tagPicker.selected(2, 3));
    await page.getByTestId("search-assign-tags").fill("");
    await page.getByTestId("tab-assign-tags-vocab").click();
    await page.getByTestId("tag-chip-dang-tu").click();
    await expect(page.getByTestId("assign-tags")).toContainText(tagPicker.maxReached(3));
    await expect(page.getByTestId("assign-tags-chosen")).toContainText("Thành ngữ");
  });

  test("the child downloads the PDF through the app, sends a picture, and sees no score", async ({ page }) => {
    await loginAs(page, "studentNguyen");
    await page.goto("/practice");
    const card = page.locator(`[data-assignment="${assignmentId}"]`);
    await expect(card).toContainText(title);
    const href = await card.getByTestId("download-pdf").getAttribute("href");
    expect(href).toBe(`/api/student/practice/${assignmentId}/file`);
    const pdf = await page.request.get(href as string);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    await card.getByTestId(`submit-${assignmentId}-picker-input`).setInputFiles({ name: "bai-lam.png", mimeType: "image/png", buffer: PNG });
    await expect(card.getByTestId(`submit-${assignmentId}-picker-item`)).toHaveCount(1);
    await card.getByTestId(`submit-${assignmentId}-first-yes`).click();
    await card.getByTestId(`submit-${assignmentId}-send`).click();
    await expect(page.getByTestId(`sent-${assignmentId}`)).toBeVisible();

    expect(await page.locator("body").innerText()).not.toMatch(SCORE_PATTERN);
  });

  test("the tutor sees 'Em đã gửi', opens Nhập nhanh from it, reads the picture and records the result with a tag", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto("/");
    await expect(page.getByTestId(`attention-${NG}`).locator(`a[href$="results/new?assignment=${assignmentId}"]`)).toBeVisible();
    await page.goto(`/learners/${NG}/assign`);
    await expect(page.getByTestId(`status-${assignmentId}`)).toHaveText(assignPage.statusSent);
    await page.getByTestId(`record-${assignmentId}`).click();
    await expect(page).toHaveURL(new RegExp(`results/new\\?assignment=${assignmentId}`));

    // The picture the child sent is shown beside the quick form (no AI reads it: the tutor types the numbers).
    const image = page.getByTestId("submission-image").first();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByTestId("submission-preview")).toContainText(resultPage.sentFirst);
    await expect(page.getByTestId("assignment-pick")).toHaveValue(assignmentId);
    await expect(page.getByTestId("quick-title")).toHaveValue(title);

    await page.getByTestId("quick-total").fill("5");
    await page.getByTestId("quick-correct").fill("4");
    await page.getByTestId("quick-wrong").fill("2");
    await page.getByTestId("quick-tag-2").selectOption("thanh-ngu");
    await page.getByTestId("result-save").click();
    await expect(page.getByTestId("result-saved")).toContainText(resultPage.saved(0));

    await page.goto(`/learners/${NG}/weak?weeks=all&domain=vocab`);
    await expect(page.getByTestId("weak-row-thanh-ngu")).toBeVisible();
    await page.goto(`/learners/${NG}/assign`);
    await expect(page.getByTestId(`status-${assignmentId}`)).toHaveText(assignPage.statusRecorded);
  });

  test("'Sửa kết quả' opens the recorded result filled in and replaces it; a second FIRST result for the same assignment is refused", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/assign`);
    await expect(page.getByTestId(`record-${assignmentId}`)).toHaveText(assignPage.editResult);
    await page.getByTestId(`record-${assignmentId}`).click();
    await expect(page.getByTestId("supersede-notice")).toBeVisible();
    await expect(page.getByTestId("quick-title")).toHaveValue(title);
    await expect(page.getByTestId("quick-total")).toHaveValue("5");
    await expect(page.getByTestId("quick-wrong")).toHaveValue("2");
    await page.getByTestId("quick-correct").fill("3");
    await page.getByTestId("quick-wrong").fill("2, 4");
    await page.getByTestId("quick-tag-2").selectOption("thanh-ngu");
    await page.getByTestId("result-save").click();
    await expect(page.getByTestId("result-saved")).toContainText(resultPage.saved(1));

    // recording it again as a plain new FIRST result (not a replacement) is a conflict
    const again = await page.request.post(`/api/learners/${NG}/results`, {
      data: {
        client_id: randomUUID(), mode: "quick", title, total_items: 5, correct: 5, wrong_items: [], context: "home", attempt: "first", used_hint: false,
        taken_on: todayVn(), assignment_id: assignmentId,
      },
    });
    expect(again.status()).toBe(409);
    expect(((await again.json()) as { error: string }).error).toBe("duplicate_first");
  });

  test("an upload link works once: a second PUT to the same link is refused by storage", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    const ticket = await page.request.post(`/api/learners/${NG}/files`, { data: { purpose: "assignment_pdf", mime: "application/pdf", bytes: PDF.length } });
    expect(ticket.status()).toBe(201);
    const { upload_url: url } = (await ticket.json()) as { upload_url: string };
    // the same request the app makes from the browser (FormData with an empty-named part, x-upsert false)
    const put = () =>
      page.evaluate(
        async ([u, b64]) => {
          const bytes = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0));
          const form = new FormData();
          form.append("cacheControl", "3600");
          form.append("", new Blob([bytes], { type: "application/pdf" }));
          const res = await fetch(u as string, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
          return res.status;
        },
        [url, PDF.toString("base64")],
      );
    expect(await put()).toBeLessThan(300);
    expect(await put()).toBeGreaterThanOrEqual(400);
  });

  test("the child still sees no score, no tags - and cannot open the staff file route", async ({ page }) => {
    await loginAs(page, "studentNguyen");
    await page.goto("/practice");
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(SCORE_PATTERN);
    expect(text).not.toMatch(/Thành ngữ/); // the tag name is for the grown-ups; the child gets only what the tutor writes as "Việc cần ôn"
    expect((await page.request.get(`/api/files/${fileId}`, { maxRedirects: 0 })).status()).toBe(403);
    expect((await page.request.get(`/api/learners/${NG}/assignments`)).status()).toBe(403);
    const forged = await page.request.post(`/api/learners/${NG}/assignments`, {
      data: { client_id: randomUUID(), kind: "link", title: "x", url: "https://example.com/x" },
    });
    expect(forged.status()).toBe(403);
    // the student's own file route never serves anything but a PDF handed to her, and not an assignment that is not hers
    expect((await page.request.get(`/api/student/practice/${randomUUID()}/file`, { maxRedirects: 0 })).status()).toBe(404);
  });

  test("the other child's account and tutor get nothing of Nguyên's practice", async ({ page }) => {
    await loginAs(page, "studentAn");
    expect((await page.request.get(`/api/student/practice/${assignmentId}/file`, { maxRedirects: 0 })).status()).toBe(404);
    // not in her scope at all: it looks as if the file does not exist
    expect((await page.request.get(`/api/files/${fileId}`, { maxRedirects: 0 })).status()).toBe(404);
    await page.context().clearCookies();
    await loginAs(page, "tutorAn");
    expect((await page.request.get(`/api/files/${fileId}`, { maxRedirects: 0 })).status()).toBe(404);
    const res = await page.goto(`/learners/${NG}/assign`);
    expect(res?.status()).toBe(404);
    expect((await page.request.get(`/api/learners/${NG}/assignments`)).status()).toBe(404);
  });

  test("a retracted assignment disappears for the child and cannot be sent to", async ({ page }) => {
    const gone = `Bài rút thử ${Date.now()}`;
    await loginAs(page, "parent");
    await page.goto(`/learners/${AN}/assign?way=link`);
    await page.getByTestId("assign-url").fill("https://www.test-english.com/grammar-points/a2/x");
    await page.getByTestId("assign-title").fill(gone);
    await page.getByTestId("assign-submit").click();
    await expect(page.getByTestId("assign-done")).toBeVisible();
    const id = await assignmentIdOf(page, gone);
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId(`retract-${id}`).click();
    await expect(page.getByTestId(`status-${id}`)).toHaveText(assignPage.statusRetracted);

    await page.context().clearCookies();
    await loginAs(page, "studentAn");
    await page.goto("/practice");
    await expect(page.getByTestId("practice-page")).toBeVisible();
    await expect(page.getByText(gone)).toHaveCount(0);
    const send = await page.request.post("/api/student/submissions", {
      data: { assignment_id: id, client_id: randomUUID(), attempt: "first", used_hint: false, link_url: "https://example.com/r", files: [] },
    });
    expect(send.status()).toBe(404);
    await expect(page.getByText(practiceStudent.title)).toBeVisible();
  });
});

// On a phone (390 px) nothing may make the page scroll sideways. These tests only read pages, so they do not depend on the serial flow above
// (which shares one seeded database with the other spec files running at the same time).
test.describe("no sideways scrolling on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  test("the student's home and 'Bài luyện' page, with the two-link navigation", async ({ page }) => {
    await loginAs(page, "studentNguyen");
    await expect(page.getByTestId("student-nav")).toBeVisible();
    expect(await fits(page)).toBe(true);
    await page.getByTestId("nav-practice").click();
    await expect(page.getByTestId("practice-page")).toBeVisible();
    await expect(page.getByTestId("student-nav")).toBeVisible();
    expect(await fits(page)).toBe(true);
  });

  test("the tutor's 'Giao bài luyện' page", async ({ page }) => {
    await loginAs(page, "tutorNguyen");
    await page.goto(`/learners/${NG}/assign?way=pdf`);
    await expect(page.getByTestId("assign-page")).toBeVisible();
    expect(await fits(page)).toBe(true);
  });
});

// 2B · Giao theo Unit: needs its own approved curriculum (built with the SQL functions as the table owner, like the DB tests), so it does not
// depend on the order of the other specs.
test("the tutor gives an assignment by Unit: the title fills itself, the row shows the Units and the derived items", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to prepare an approved curriculum");
  const db = new Client(pgConfigFromUrl(process.env.DATABASE_URL as string));
  await db.connect();
  const bookTitle = `Giáo trình Unit thử ${Date.now()}`;
  try {
    const tutor = (await db.query<{ id: string }>("select member_id as id from english.relationships where learner_id = $1 and relation = 'tutor' limit 1", [NG])).rows[0]!.id;
    const unit = (n: number, points: string[]) => ({ code: `U${n}`, title: `Unit ${n}`, section: "Grammar", page: 6 * n, skipped: false, points, missing_points: [], needs_review: false, review_reason: null, origin: "ai", dropped: false, edit_reason: null });
    const units = [unit(1, []), unit(2, ["cum-dong-tu"]), unit(3, ["cum-dong-tu", "thanh-ngu"])];
    const c = (await db.query<{ r: { version_id: string } }>("select english.eng_create_curriculum($1,$2,null,null,false,$3,$4) as r", [NG, bookTitle, tutor, randomUUID()])).rows[0]!.r;
    const stamp = async () => (await db.query<{ t: string }>("select updated_at::text as t from english.curriculum_versions where id = $1", [c.version_id])).rows[0]!.t;
    await db.query("select english.eng_save_curriculum_draft($1,$2::jsonb,$3,$4)", [c.version_id, JSON.stringify({ units, ignored: [] }), await stamp(), tutor]);
    await db.query("select english.eng_approve_curriculum_version($1,$2,$3::jsonb,null,$4)", [c.version_id, await stamp(),
      JSON.stringify(units.map((u) => ({ code: u.code, title: u.title, section: u.section, page: u.page, skipped: false, points: u.points }))), tutor]);
  } finally {
    await db.end();
  }
  await loginAs(page, "tutorNguyen");
  await page.goto(`/learners/${NG}/assign?way=link`);
  await expect(page.getByTestId("assign-by-unit")).toBeVisible();
  await expect(page.getByTestId("assign-extra-items")).toBeVisible();
  const list = page.getByTestId("unit-picker").locator("details", { hasText: bookTitle });
  const row2 = list.getByTestId(/^unit-.*-U2$/);
  await row2.check();
  await list.getByTestId(/^unit-.*-U3$/).check();
  await expect(page.getByTestId("assign-title")).toHaveValue(`${bookTitle} · Unit 2–3`);
  await expect(page.getByTestId("unit-picker-derived")).toContainText(unitPickerCopy.derived(2, "", 0).slice(0, 18));
  await page.getByTestId("assign-url").fill("https://notebooklm.google.com/notebook/units");
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("assign-done")).toContainText(assignPage.done);
  const item = page.locator('li[data-testid^="assignment-"]', { hasText: bookTitle }).first();
  await expect(item).toContainText("Unit 2–3");
  await expect(item).toContainText("2 mục");
});


// UX vòng 3A · one 'Giao bài' page: the chooser carries the prefill from the curriculum into the way that is chosen.
test("the chooser carries the 'from the book' prefill into the link way", async ({ page }) => {
  await loginAs(page, "tutorNguyen");
  await page.goto(`/learners/${NG}/assign?title=${encodeURIComponent("Sách thử · Review 2")}&pages=34`);
  await expect(page.getByTestId("way-cards")).toBeVisible();
  await expect(page.getByTestId("ways-from-book")).toContainText("Sách thử · Review 2");
  await expect(page.getByTestId("way-studio")).toHaveAttribute("data-recommended", "true");
  await page.getByTestId("way-choose-link").click();
  await expect(page).toHaveURL(/way=link/);
  await expect(page.getByTestId("assign-title")).toHaveValue("Sách thử · Review 2");
  await expect(page.getByTestId("kind-pdf")).toHaveCount(0);
  await expect(page.getByTestId("ways-strip")).toBeVisible();
});
