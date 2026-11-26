import Link from "next/link";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { levelCopy, resultsCopy, targetsPage, weakPage } from "@/lib/copy/vi";
import { progressTabs } from "@/lib/shell/tabs";

export type ProgressTab = "overview" | "unit" | "tag" | "levels";
export type LevelsSub = "levels" | "weak" | "targets";
const SUB: readonly { key: LevelsSub; label: string }[] = [
  { key: "levels", label: levelCopy.link },
  { key: "weak", label: weakPage.link },
  { key: "targets", label: targetsPage.link },
];

/** Tiến bộ's tab row on its five pages; on "Cấp và kỹ năng" a second row links its three pages (hướng B). */
export function ProgressTabs({ learnerId, current, sub }: { learnerId: string; current: ProgressTab; sub?: LevelsSub }) {
  return (
    <>
      <SectionTabs label={resultsCopy.tabsLabel} tabs={progressTabs(learnerId)} current={current} />
      {sub ? (
        <nav aria-label={resultsCopy.tabs.levels} className="mt-1 flex flex-wrap gap-x-4 text-sm print:hidden" data-testid="levels-sub">
          {SUB.map((s) => (
            <Link key={s.key} href={`/learners/${learnerId}/${s.key}`} data-testid={`levels-sub-${s.key}`} aria-current={s.key === sub ? "page" : undefined}
              className={`inline-flex min-h-11 items-center ${s.key === sub ? "font-semibold text-ink no-underline" : "text-accent underline"}`}>
              {s.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}
