import Link from "next/link";
import { assignedBoardCopy as c } from "@/lib/copy/vi";
import { WORK_TABS, type WorkTab } from "@/lib/assigned/board";

/** The four tabs of Bài tập (hướng B) as plain links (?tab=): works without JS and keeps the tab in the URL for links from "Bàn làm việc". */
export function BoardTabs({ learnerId, tab, counts }: { learnerId: string; tab: WorkTab; counts: Record<WorkTab, number> }) {
  return (
    <nav aria-label={c.tabsLabel} className="flex flex-wrap gap-2" data-testid="board-tabs">
      {WORK_TABS.map((t) => {
        const on = t === tab;
        const warn = t === "need" && counts.need > 0 && !on;
        return (
          <Link
            key={t}
            href={`/learners/${learnerId}/assigned?tab=${t}`}
            aria-current={on ? "page" : undefined}
            data-testid={`board-tab-${t}`}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-semibold ${
              on ? "border-accent bg-accent text-white" : warn ? "border-[#e2c98f] bg-[#FBF1DC] text-[#6B4600]" : "border-line bg-white text-ink"
            }`}
          >
            {c.tabCount(c.tab[t], counts[t])}
          </Link>
        );
      })}
    </nav>
  );
}
