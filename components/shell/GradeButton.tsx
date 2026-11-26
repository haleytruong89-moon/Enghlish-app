"use client";
import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { shellCopy } from "@/lib/copy/vi";
import { useBadgeCounts } from "./badgeStore";
import { NavIcon } from "./NavIcon";

const BASE = "flex min-h-12 shrink-0 items-center gap-2.5 rounded-xl px-3.5 text-[15px] font-bold no-underline";

/** "Chấm bài": red with the number of submissions waiting; plain when none or unknown (never a false 0). */
export function GradeButton({ learnerId, href, label, onClick }: { learnerId: string; href: string; label: string; onClick?: () => void }) {
  const { work } = useBadgeCounts(learnerId);
  const waiting = work !== null && work !== "0";
  return (
    <Link href={href} onClick={onClick} data-testid="quick-grade" data-waiting={waiting ? "yes" : "no"}
      className={`${BASE} ${waiting ? "bg-[#b4402c] text-white shadow-[0_2px_0_#8a2f20] hover:bg-[#9c3624]" : "border-2 border-line bg-white text-ink hover:border-accent"}`}>
      <NavIcon name="grade" />
      {label}
      {waiting ? (
        <span data-testid="grade-badge" aria-label={shellCopy.gradeBadge(work)} className="ml-auto min-w-6 rounded-full bg-white px-2 py-0.5 text-center text-xs font-bold text-[#b4402c]">
          {work}
        </span>
      ) : null}
    </Link>
  );
}
