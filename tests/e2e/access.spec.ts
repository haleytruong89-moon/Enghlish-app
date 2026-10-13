import { expect, test } from "@playwright/test";
import { LEARNER_IDS, loginAs, type AccountKey } from "./helpers";

type Who = "an" | "nguyen";

/** account → [learner → expected status of GET /api/learners/:id] */
const matrix: { key: AccountKey; expected: Record<Who, number> }[] = [
  { key: "studentAn", expected: { an: 200, nguyen: 404 } },
  { key: "tutorAn", expected: { an: 200, nguyen: 404 } },
  { key: "studentNguyen", expected: { an: 404, nguyen: 200 } },
  { key: "tutorNguyen", expected: { an: 404, nguyen: 200 } },
  { key: "parent", expected: { an: 200, nguyen: 200 } },
];

test.describe("GET /api/learners/:id respects learner scope", () => {
  for (const { key, expected } of matrix) {
    test(`${key}: an=${expected.an}, nguyen=${expected.nguyen}`, async ({ page }) => {
      await loginAs(page, key);
      for (const who of ["an", "nguyen"] as const) {
        const res = await page.request.get(`/api/learners/${LEARNER_IDS[who]}`);
        expect(res.status(), `${key} → ${who}`).toBe(expected[who]);
        if (expected[who] === 404) {
          // Must not reveal that the learner exists.
          const body = JSON.stringify(await res.json());
          expect(body).not.toContain(LEARNER_IDS[who]);
          expect(body).not.toMatch(/Nguyên|An \(thử\)/);
        }
      }
    });
  }

  test("students never get the track code from the API, staff do", async ({ page, browser }) => {
    await loginAs(page, "studentAn");
    const student = await (await page.request.get(`/api/learners/${LEARNER_IDS.an}`)).json();
    expect(student).not.toHaveProperty("trackId");

    const ctx = await browser.newContext();
    const staffPage = await ctx.newPage();
    await loginAs(staffPage, "tutorAn");
    const staff = await (await staffPage.request.get(`/api/learners/${LEARNER_IDS.an}`)).json();
    expect(staff).toMatchObject({ trackId: "A" });
    await ctx.close();
  });
});
