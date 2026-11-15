import Link from "next/link";
import { streakCopy } from "@/lib/copy/vi";

/** "🔥 n tuần liền" on Hôm nay (PRD D34). Shown from the first week of the streak on; the child's own streak only. A tap opens Hành trình. */
export function GoalChip({ streak }: { streak: number }) {
  if (streak < 1) return null;
  return (
    <Link
      href="/journey"
      aria-label={streakCopy.chipAria(streak)}
      data-testid="streak-chip"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-4 text-[15px] font-semibold text-amber-900 no-underline"
    >
      <span data-count="work">{streakCopy.chip(streak)}</span>
    </Link>
  );
}
