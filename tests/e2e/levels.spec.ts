import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { candoCopy, levelsStudentCopy, thenNowCopy, thenNowPickerCopy } from "@/lib/copy/vi";
import { LEARNER_IDS, loginAs, studentVisibleText } from "./helpers";

// W4e: the child sees the NAME of each level the tutor confirmed (no assumed level, no number, no Tư duy), the "điều mình đã làm được" cards and the
// "Ngày ấy – bây giờ" pair the tutor picked. The parent only reads. Two pieces of writing on two different days cannot be made in one e2e run:
// the pick itself (days, order, who, the note) is covered by tests/db/thenNow.test.ts and tests/dom/growthCards.test.tsx; here the screens, the
// permissions and the refusals are checked.
test.describe.configure({ mode: "serial" });
const NG = LEARNER_IDS.nguyen;
const CEFR = /^(A1|A2|B1|B2|C1|C2)\+?$/;

test.describe("W4e levels, can-do, then-now", () => {
  test("the tutor confirms the starting level; the child sees its NAME in Hành trình, 'xác nhận' wording, no Tư duy, no number", async ({ browser }) => {
    test.setTimeout(120_000);
    const tutorCtx = await browser.newContext();
    const tp = await tutorCtx.newPage();
    await loginAs(tp, "tutorNguyen");
    await tp.goto(`/learners/${NG}/levels/baseline`);
    // A re-run on the same database finds every domain already confirmed: then there is no form.
    if ((await tp.getByTestId("baseline-form").count()) > 0) {
      await tp.getByTestId("baseline-grammar").selectOption("B2+");
      await tp.getByTestId("baseline-save").click();
      await tp.waitForURL(`**/learners/${NG}/levels`);
    }
    await tutorCtx.close();

    const childCtx = await browser.newContext();
    const cp = await childCtx.newPage();
    await loginAs(cp, "studentNguyen");
    await cp.goto("/journey");
    const card = cp.getByTestId("levels-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText(levelsStudentCopy.note);
    const grammar = cp.getByTestId("level-tile-grammar");
    await expect(grammar).toHaveAttribute("data-confirmed", "yes");
    expect(((await cp.getByTestId("level-name-grammar").textContent()) ?? "").trim()).toMatch(CEFR);
    // the domains the tutor has not confirmed say so (never an assumed level); the Tư duy domain is never there
    for (const tile of await cp.locator('[data-testid^="level-tile-"][data-confirmed="no"]').all()) await expect(tile).toContainText(levelsStudentCopy.waiting);
    await expect(cp.getByTestId("level-tile-thinking")).toHaveCount(0);
    expect(await card.innerText()).not.toContain("Tư duy");
    // words and CEFR names only: no number level 1–4, no score, no ratio, no "giả định"
    const text = await studentVisibleText(cp, "levels-card");
    expect(text).not.toMatch(/(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])|%|(^|[^\p{L}])điểm(?!\p{L})|giả định|ước lượng|⚑/iu);
    expect(text).not.toMatch(/(^|\s)[1-4](\s|$)/);
    await childCtx.close();
  });

  test("Hành trình: the can-do card exists with its soft wording; the then-now card is absent until a pick; no page shows a score", async ({ browser }) => {
    const ctx = await browser.newContext();
    const cp = await ctx.newPage();
    await loginAs(cp, "studentNguyen");
    await cp.goto("/journey");
    const cando = cp.getByTestId("cando-card");
    await expect(cando).toBeVisible();
    await expect(cando).toContainText(candoCopy.title);
    for (const item of await cp.getByTestId("cando-item").all()) await expect(item).toContainText(candoCopy.lead);
    if ((await cp.getByTestId("then-now-card").count()) === 0) await expect(cp.getByText(thenNowCopy.title)).toHaveCount(0);
    const text = await studentVisibleText(cp);
    expect(text).not.toMatch(/(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])|%|(^|[^\p{L}])điểm(?!\p{L})|đúng\s+\d|xếp hạng|streak|quá hạn/iu);
    expect(text).not.toMatch(/INDEPENDENT|TRANSFERABLE|DEVELOPING|SUPPORTED|chờ xác nhận/);
    expect(await cp.content()).not.toMatch(/"verdict"|ref_key|tag_key|level_num/);
    await ctx.close();
  });

  test("the tutor sees the picker on Hồ sơ cấp; the parent only reads it; the other child's tutor cannot reach it", async ({ browser }) => {
    const tCtx = await browser.newContext();
    const tp = await tCtx.newPage();
    await loginAs(tp, "tutorNguyen");
    await tp.goto(`/learners/${NG}/levels`);
    const picker = tp.getByTestId("then-now-picker");
    await expect(picker).toBeVisible();
    await expect(picker).toContainText(thenNowPickerCopy.title);
    // with two pieces of writing on the app the form is there; with fewer there is the explanation
    expect((await tp.getByTestId("then-now-form").count()) + (await tp.getByTestId("then-now-empty").count())).toBe(1);
    await tCtx.close();

    const pCtx = await browser.newContext();
    const pp = await pCtx.newPage();
    await loginAs(pp, "parent");
    await pp.goto(`/learners/${NG}/levels`);
    await expect(pp.getByTestId("then-now-picker")).toBeVisible();
    await expect(pp.getByTestId("then-now-form")).toHaveCount(0);
    await expect(pp.getByTestId("then-now-picker")).toContainText(thenNowPickerCopy.parentReadOnly);
    const body = { then_id: randomUUID(), now_id: randomUUID(), note: null, status: "shown", client_id: randomUUID() };
    expect((await pp.request.post(`/api/learners/${NG}/then-now`, { data: body })).status()).toBe(403);
    await pCtx.close();

    const oCtx = await browser.newContext();
    const op = await oCtx.newPage();
    await loginAs(op, "tutorAn");
    expect((await op.request.post(`/api/learners/${NG}/then-now`, { data: body })).status()).toBe(404);
    await oCtx.close();
  });

  test("the tutor's refusals: a note that looks like a score (400), pieces that are not the child's (400 bad_pick), a student cannot call it", async ({ browser }) => {
    const tCtx = await browser.newContext();
    const tp = await tCtx.newPage();
    await loginAs(tp, "tutorNguyen");
    const id = () => randomUUID();
    const scored = await tp.request.post(`/api/learners/${NG}/then-now`, { data: { then_id: id(), now_id: id(), note: "Con được 8/10", status: "shown", client_id: id() } });
    expect(scored.status()).toBe(400);
    expect((await scored.json()).error).toBe("score_words");
    const unknown = await tp.request.post(`/api/learners/${NG}/then-now`, { data: { then_id: id(), now_id: id(), note: null, status: "shown", client_id: id() } });
    expect(unknown.status()).toBe(400);
    expect((await unknown.json()).error).toBe("bad_pick");
    await tCtx.close();

    const sCtx = await browser.newContext();
    const sp = await sCtx.newPage();
    await loginAs(sp, "studentNguyen");
    const asChild = await sp.request.post(`/api/learners/${NG}/then-now`, { data: { then_id: id(), now_id: id(), note: null, status: "shown", client_id: id() } });
    expect([403, 404]).toContain(asChild.status());
    await sCtx.close();
  });
});
