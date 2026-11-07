// components/review/ReviewTabs.tsx
import Link from "next/link";
import { skillStateCopy, studioInboxCopy } from "@/lib/copy/vi";

type Tab = "work" | "skills" | "studio";

/**
 * Hộp duyệt: "Bài làm" (/review, S5), "Kỹ năng" (/review/skills, S7a), "Cần thầy/cô xem" (/review/studio, Studio B1).
 * A count is null when it could not be read (e.g. before its migration): the tab shows without a number.
 */
export function ReviewTabs({ active, skillsCount, studioCount = null }: { active: Tab; skillsCount: number | null; studioCount?: number | null }) {
  const tab = (key: Tab, href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      data-testid={`review-tab-${key}`}
      className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm ${active === key ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );
  const withCount = (label: string, n: number | null) => (n === null ? label : `${label} ${skillStateCopy.tabCount(n)}`);
  return (
    <nav aria-label={skillStateCopy.tabsLabel} className="mt-4 flex flex-wrap gap-2 border-b border-line">
      {tab("work", "/review", skillStateCopy.tabWork)}
      {tab("skills", "/review/skills", withCount(skillStateCopy.tabSkills, skillsCount))}
      {tab("studio", "/review/studio", withCount(studioInboxCopy.tab, studioCount))}
    </nav>
  );
}
