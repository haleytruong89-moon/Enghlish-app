"use client";
import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { shellCopy } from "@/lib/copy/vi";
import { useBadgeCounts } from "./badgeStore";

const BASE = "flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-xl px-3 text-[15px] font-semibold no-underline";

/** "Chấm bài": red with the number of submissions waiting; plain when none or unknown (never a false 0). */
export function GradeButton({ learnerId, href, label, onClick }: { learnerId: string; href: string; label: string; onClick?: () => void }) {
  const { work } = useBadgeCounts(learnerId);
  const waiting = work !== null && work !== "0";
  return (
    <Link href={href} onClick={onClick} data-testid="quick-grade" data-waiting={waiting ? "yes" : "no"}
      className={`${BASE} ${waiting ? "bg-[#b4402c] text-white hover:bg-[#9c3624]" : "border border-line bg-white text-ink hover:border-accent"}`}>
      {label}
      {waiting ? (
        <span data-testid="grade-badge" aria-label={shellCopy.gradeBadge(work)} className="min-w-6 rounded-full bg-white px-2 py-0.5 text-center text-xs font-bold text-[#b4402c]">
          {work}
        </span>
      ) : null}
    </Link>
  );
}
