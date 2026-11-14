/** What the "Giao theo Unit" picker offers for one child: curricula with an approved version, their Units and Review rows. Pure. */
import { curriculumPayloadSchema } from "./schema";
import { isProgressTest, relatedUnits } from "./rows";
import type { CurriculumCard } from "./shape";
import type { UnitChoice } from "./unitPicker";

/**
 * `payloads`: the stored payload of each curriculum's approved version (by version id). A payload that does not parse gives the
 * curriculum with its Units but no Review rows (the picker still works).
 */
export function buildUnitChoices(cards: CurriculumCard[], payloads: Record<string, unknown>): UnitChoice[] {
  return cards.flatMap((c) => {
    if (!c.current || !c.progress) return [];
    const statusOf = c.progress.statusOf;
    const units = c.current.units
      .filter((u) => !u.skipped && statusOf[u.code] !== "skipped")
      .map((u) => ({ kind: "unit" as const, code: u.code, title: u.title, status: statusOf[u.code] ?? "not_started", points: u.points }));
    const offered = new Set(units.map((u) => u.code));
    const parsed = curriculumPayloadSchema.safeParse(payloads[c.current.versionId]);
    const reviews = parsed.success
      ? parsed.data.ignored.flatMap((r, k) =>
          r.reason === "review" || r.reason === "test" || isProgressTest(r)
            ? [{ kind: "review" as const, id: `r${k}`, label: r.label, progressTest: isProgressTest(r), related: relatedUnits(parsed.data, k).filter((code) => offered.has(code)) }]
            : [],
        )
      : [];
    return [{ curriculumId: c.id, title: c.title, units, reviews }];
  });
}
