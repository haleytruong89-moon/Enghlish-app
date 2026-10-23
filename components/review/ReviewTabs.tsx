// components/review/ReviewTabs.tsx
import Link from "next/link";
import { skillStateCopy } from "@/lib/copy/vi";

/** Hộp duyệt has two parts (D19): "Bài làm" (/review, S5) and "Kỹ năng" (/review/skills, S7a). The count is null before migration 0023. */
export function ReviewTabs({ active, skillsCount }: { active: "work" | "skills"; skillsCount: number | null }) {
  const tab = (key: "work" | "skills", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      data-testid={`review-tab-${key}`}
      className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm ${active === key ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label={skillStateCopy.tabsLabel} className="mt-4 flex gap-2 border-b border-line">
      {tab("work", "/review", skillStateCopy.tabWork)}
      {tab("skills", "/review/skills", skillsCount === null ? skillStateCopy.tabSkills : `${skillStateCopy.tabSkills} ${skillStateCopy.tabCount(skillsCount)}`)}
    </nav>
  );
}
