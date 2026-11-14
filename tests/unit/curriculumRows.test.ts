import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { editStats } from "@/lib/curriculum/editStats";
import { normalizeToc } from "@/lib/curriculum/normalize";
import { isProgressTest, moveToNonUnit, moveToUnit, relatedUnits, restoreUnit } from "@/lib/curriculum/rows";
import { aiTocSchema, curriculumPayloadSchema, type CurriculumPayload } from "@/lib/curriculum/schema";
import { validateCurriculum } from "@/lib/curriculum/validate";

const FAKE = aiTocSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/curriculum/fake-toc.json"), "utf8")));
const ctx = { tags: ["tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "dang-tu", "cau-dieu-kien-dao-ngu"].map((key) => ({ key, label: key, domain: null, group: null, custom: false })) };
const base = (): CurriculumPayload => normalizeToc(FAKE, ctx);
const idx = (p: CurriculumPayload, code: string) => p.units.findIndex((u) => u.code === code);
const ign = (p: CurriculumPayload, label: string) => p.ignored.findIndex((r) => r.label.startsWith(label));

describe("the fixture", () => {
  it("is Destination: 26 Units and 20 rows that are not Units", () => {
    const p = base();
    expect(p.units).toHaveLength(26);
    expect(p.ignored).toHaveLength(20);
  });
});

describe("moveToNonUnit", () => {
  it("an AI row stays in the draft as dropped (for the edit count) and the list that is not a Unit grows by one", () => {
    const p = base();
    const i = idx(p, "U5");
    const q = moveToNonUnit(p, i, "review");
    expect(q.units).toHaveLength(26);
    expect(q.units[i]).toMatchObject({ dropped: true, edit_reason: "not_a_unit" });
    expect(q.ignored).toHaveLength(21);
    expect(q.ignored.at(-1)).toMatchObject({ label: p.units[i]!.title, page: 38, reason: "review" });
    expect(curriculumPayloadSchema.safeParse(q).success).toBe(true);
    expect(editStats(p, q)!.dropped).toBe(editStats(p, p)!.dropped + 1);
    expect(editStats(p, q)!.reasons.not_a_unit).toBe(1);
  });
  it("a row typed by hand is removed instead", () => {
    const p = moveToUnit(base(), ign(base(), "Review 2"));
    const i = idx(p, p.units.find((u) => u.origin === "manual")!.code);
    const q = moveToNonUnit(p, i, "other");
    expect(q.units.some((u) => u.origin === "manual")).toBe(false);
    expect(q.ignored.some((r) => r.label.startsWith("Review 2"))).toBe(true);
  });
  it("does nothing for a missing or dropped row", () => {
    const p = base();
    expect(moveToNonUnit(p, 99, "other")).toBe(p);
    const q = moveToNonUnit(p, 0, "other");
    expect(moveToNonUnit(q, 0, "other")).toBe(q);
  });
});

describe("moveToUnit", () => {
  it("'Review 2' becomes a manual Unit that needs a look, in book order, with a free code", () => {
    const p = base();
    const q = moveToUnit(p, ign(p, "Review 2"));
    expect(q.ignored).toHaveLength(19);
    const u = q.units.find((x) => x.title.startsWith("Review 2"))!;
    expect(u).toMatchObject({ origin: "manual", needs_review: true, dropped: false, ai_index: null, page: 36, points: [] });
    expect(new Set(q.units.map((x) => x.code)).size).toBe(q.units.length);
    // page 36 sits after U4 (28) and before U5 (38)
    const order = q.units.map((x) => x.code);
    expect(order.indexOf(u.code)).toBe(order.indexOf("U5") - 1);
    expect(validateCurriculum(q, ctx).some((i) => i.code === u.code && i.issue === "needs_review" && i.blocking)).toBe(true);
    expect(curriculumPayloadSchema.safeParse(q).success).toBe(true);
  });
  it("a row that was just marked 'not a Unit' comes back as it was", () => {
    const p = base();
    const i = idx(p, "U5");
    const there = moveToNonUnit(p, i, "reference");
    const back = moveToUnit(there, there.ignored.length - 1);
    expect(back).toEqual(p);
  });
  it("two rows with the same name get different codes", () => {
    let p = base();
    p = { ...p, ignored: [...p.ignored, { label: "Review 2 · Units 3 and 4", page: 36, reason: "review" }] };
    p = moveToUnit(p, ign(p, "Review 2"));
    p = moveToUnit(p, ign(p, "Review 2"));
    expect(new Set(p.units.map((u) => u.code)).size).toBe(p.units.length);
  });
});

describe("isProgressTest", () => {
  it("true for a 'test' row and for a Progress Test filed under 'review'", () => {
    expect(isProgressTest({ label: "Progress Test 1 · Units 1–12", reason: "test" })).toBe(true);
    expect(isProgressTest({ label: "Progress Test 1", reason: "review" })).toBe(true);
    expect(isProgressTest({ label: "Kiểm tra tiến độ 2", reason: "other" })).toBe(true);
    expect(isProgressTest({ label: "Review 1", reason: "review" })).toBe(false);
  });
});

describe("relatedUnits", () => {
  const p = base();
  it("Review 1 revises U1 and U2; Review 2 revises U3 and U4", () => {
    expect(relatedUnits(p, ign(p, "Review 1"))).toEqual(["U1", "U2"]);
    expect(relatedUnits(p, ign(p, "Review 2"))).toEqual(["U3", "U4"]);
  });
  it("a Progress Test revises the whole stretch since the previous test", () => {
    expect(relatedUnits(p, ign(p, "Progress Test 1"))).toEqual(Array.from({ length: 12 }, (_, k) => `U${k + 1}`));
    expect(relatedUnits(p, ign(p, "Progress Test 2"))).toEqual(Array.from({ length: 14 }, (_, k) => `U${k + 13}`));
  });
  it("no page → nothing; dropped Units are left out; a Unit without a page takes the page of the one before", () => {
    expect(relatedUnits({ ...p, ignored: [{ label: "Review x", page: null, reason: "review" }] }, 0)).toEqual([]);
    const q = moveToNonUnit(p, idx(p, "U2"), "other");
    expect(relatedUnits(q, ign(q, "Review 1"))).toEqual(["U1"]);
    const noPage = { ...p, units: p.units.map((u) => (u.code === "U2" ? { ...u, page: null } : u)) };
    expect(relatedUnits(noPage, ign(noPage, "Review 1"))).toEqual(["U1", "U2"]);
  });
});

describe("restoreUnit and identity matching", () => {
  it("'Lấy lại dòng' removes the twin in 'Không phải Unit' and clears edit_reason", () => {
    const p = base();
    const i = idx(p, "U5");
    const q = moveToNonUnit(p, i, "review");
    expect(q.ignored.at(-1)!.from_ai_index).toBe(p.units[i]!.ai_index);
    const r = restoreUnit(q, i);
    expect(r).toEqual(p);
  });
  it("a title edited after the move still comes back by identity (and a long title is not a mismatch)", () => {
    const p = base();
    const i = idx(p, "U5");
    const q = moveToNonUnit(p, i, "reference");
    const edited = { ...q, units: q.units.map((u, k) => (k === i ? { ...u, title: u.title + " x".repeat(100) } : u)) };
    const back = moveToUnit(edited, edited.ignored.length - 1);
    expect(back.units).toHaveLength(26);
    expect(back.units[i]).toMatchObject({ dropped: false, edit_reason: null });
  });
  it("a full 'Không phải Unit' list refuses the move instead of dropping the row", () => {
    const p = base();
    const full = { ...p, ignored: Array.from({ length: 100 }, (_, k) => ({ label: `r${k}`, page: null, reason: "other" as const })) };
    expect(moveToNonUnit(full, 0, "other")).toBe(full);
  });
});
