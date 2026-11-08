import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TocContext } from "@/lib/curriculum/context";
import { editStats, tooManyEdits } from "@/lib/curriculum/editStats";
import { compareGolden, type Golden } from "@/lib/curriculum/golden";
import { normalizeToc, unitCodeOf } from "@/lib/curriculum/normalize";
import { aiTocSchema, curriculumPayloadSchema, type CurriculumPayload } from "@/lib/curriculum/schema";
import { canApprove, finalUnits, reviewOrder, rowsToResolve, validateCurriculum } from "@/lib/curriculum/validate";

const read = (f: string) => JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/curriculum", f), "utf8")) as unknown;
const FAKE = aiTocSchema.parse(read("fake-toc.json"));
const GOLDEN = read("destination-c1c2.golden.json") as Golden;
/** The closed list of "Nguyên (thử)" that the fixture uses (track B seed tags). */
const CTX_B: TocContext = {
  tags: ["cau-dieu-kien-dao-ngu", "wish-would-rather", "modal-suy-doan", "bi-dong-nho-tuong-thuat", "dang-tu", "tu-vung-ngu-canh", "cum-dong-tu", "thanh-ngu", "tu-noi-lap-luan", "phat-am"]
    .map((key) => ({ key, label: key, domain: null, group: null, custom: false })),
};

describe("normalizeToc (Destination C1&C2 fixture = golden set)", () => {
  const draft = normalizeToc(FAKE, CTX_B);
  it("gives the 26 units in book order with stable codes, titles and pages; 20 contents rows are not units", () => {
    expect(curriculumPayloadSchema.parse(draft)).toEqual(draft);
    expect(compareGolden(draft, GOLDEN)).toMatchObject({ ok: true, expected: 26, got: 26, orderOk: true });
    expect(draft.ignored).toHaveLength(GOLDEN.ignored_count);
    expect(draft.ignored.filter((r) => r.reason === "test").map((r) => r.page)).toEqual([102, 218]);
  });
  it("the AI's uncertain rows come first in the review and block Duyệt until resolved", () => {
    const issues = validateCurriculum(draft, CTX_B);
    expect(draft.units.filter((u) => u.needs_review).map((u) => u.code)).toEqual(["U1", "U3", "U5", "U15", "U17", "U19", "U21", "U23"]);
    expect(rowsToResolve(issues)).toBe(8);
    expect(canApprove(issues)).toBe(false);
    expect(reviewOrder(draft, issues).slice(0, 2).map((u) => u.code)).toEqual(["U1", "U3"]);
    const resolved: CurriculumPayload = { ...draft, units: draft.units.map((u) => ({ ...u, needs_review: false })) };
    expect(canApprove(validateCurriculum(resolved, CTX_B))).toBe(true);
    expect(finalUnits(resolved)).toHaveLength(26);
  });
});

describe("normalizeToc checks (code, not the AI)", () => {
  const row = (number: string, points: string[] = [], extra: Record<string, unknown> = {}) => ({ number, title: `T${number}`, points, missing_points: [], needs_review: false, ...extra });
  it("unit codes: printed numbers → U<n>; words → X-…; nothing → flagged", () => {
    expect([unitCodeOf("7"), unitCodeOf("Unit 12"), unitCodeOf("Starter"), unitCodeOf("Bài ôn tập"), unitCodeOf(" ")]).toEqual(["U7", "U12", "X-STARTER", "X-BAI-ON-TAP", null]);
  });
  it("a gap in the numbering, a duplicate number and an unknown point are flagged 'cần xem'; unknown keys never become links", () => {
    const d = normalizeToc(aiTocSchema.parse({ units: [row("1"), row("2", ["cum-dong-tu", "xyz-khong-co"]), row("2"), row("4")] }), CTX_B);
    expect(d.units.map((u) => [u.code, u.flags])).toEqual([
      ["U1", []], ["U2", ["unknown_point"]], ["U2-2", ["duplicate_code"]], ["U4", ["numbering_gap"]],
    ]);
    expect(d.units[1]).toMatchObject({ points: ["cum-dong-tu"], missing_points: ["xyz-khong-co"], needs_review: true });
  });
});

describe("edit count (spec §8: % of AI rows the tutor had to change)", () => {
  it("kept / edited / dropped / added are counted by code; > 20 % raises the stop sign", () => {
    const ai = normalizeToc(FAKE, CTX_B);
    const final: CurriculumPayload = {
      ...ai,
      units: [
        ...ai.units.map((u, i) =>
          i === 0 ? { ...u, points: ["x-thi-hien-tai"], needs_review: false, edit_reason: "missing_points" as const }
          : i === 1 ? { ...u, dropped: true, edit_reason: "not_a_unit" as const }
          : { ...u, needs_review: false }),
        { ...ai.units[0]!, code: "U27", title: "Extra", origin: "manual" as const, ai_index: null, flags: [] },
      ],
    };
    expect(editStats(ai, final)).toEqual({ ai_rows: 26, kept: 24, edited: 1, dropped: 1, added: 1, edited_pct: 8, reasons: { missing_points: 1, not_a_unit: 1 } });
    expect(tooManyEdits(editStats(ai, final))).toBe(false);
    expect(editStats(null, final)).toBeNull();
  });
});
