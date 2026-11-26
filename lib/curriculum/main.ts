import type { CurriculumCard } from "./shape";

/** The main curriculum of a child (where "Unit N" in a title counts, L2): the one the database names, else the only one with progress. Pure. */
export function mainCurriculum(cards: readonly CurriculumCard[], mainId: string | null): CurriculumCard | undefined {
  return cards.find((c) => c.id === mainId) ?? (cards.filter((c) => c.progress).length === 1 ? cards.find((c) => c.progress) : undefined);
}
