/**
 * Tutor review screens (D39 B): each item is right (green), wrong (red) or waiting for an adult (orange). Pure.
 * Wrong and waiting items come first; inside a group the original order stays (the question number stays visible).
 */
export type ItemStatus = "right" | "wrong" | "waiting";

/** The auto-check result of an item: correct → right, incorrect / blank → wrong, needs_person (or unknown) → waiting. */
export function itemStatus(result: string | null | undefined): ItemStatus {
  if (result === "correct") return "right";
  if (result === "incorrect" || result === "blank") return "wrong";
  return "waiting";
}

const RANK: Record<ItemStatus, number> = { wrong: 0, waiting: 1, right: 2 };

export function orderByStatus<T extends { status: ItemStatus; n: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => RANK[a.status] - RANK[b.status] || a.n - b.n);
}

export function onlyToCheck<T extends { status: ItemStatus }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.status !== "right");
}

export const STATUS_TONE: Record<ItemStatus, { box: string; chip: string }> = {
  right: { box: "border-[#2B6B47] bg-[#F3FAF6]", chip: "bg-[#DDF0E4] text-[#1B4D31]" },
  wrong: { box: "border-[#B3261E] bg-[#FFF6F4]", chip: "bg-[#FADBD6] text-[#8A1C12]" },
  waiting: { box: "border-[#B26A00] bg-[#FFFAF0]", chip: "bg-[#FBF1DC] text-[#6B4600]" },
};
