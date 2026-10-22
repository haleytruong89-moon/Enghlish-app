import Link from "next/link";
import { fallbackLabels, levelCopy } from "@/lib/copy/vi";
import type { RecentChange } from "@/lib/levels/types";
import { dayLabel, levelText } from "@/lib/levels/view";

/** Parent home (D11): level decisions of the last 30 days for every child, newest first. This is how the parent "is told" (no email / push). */
export function RecentLevelChanges({ items }: { items: RecentChange[] }) {
  return (
    <section aria-labelledby="recent-levels-title" className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="recent-levels">
      <h2 id="recent-levels-title" className="text-lg font-semibold">
        {levelCopy.recentTitle}
      </h2>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{levelCopy.recentNone}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((c) => (
            <li key={c.id} data-testid={`recent-level-${c.id}`}>
              <Link
                href={c.collapsed ? `/learners/${c.learnerId}/levels` : `/learners/${c.learnerId}/levels?domain=${c.domainKey}`}
                className="flex min-h-11 flex-col gap-0.5 rounded-lg bg-paper px-4 py-3 text-ink no-underline hover:bg-[#E3ECE8]"
              >
                <span className="font-semibold">
                  {c.collapsed
                    ? levelCopy.recentBaselines(c.alias, c.collapsed)
                    : levelCopy.recentLine(c.alias, c.domainName, levelText(c.scale, c.from), levelText(c.scale, c.to))}
                </span>
                <span className="text-sm text-muted">{levelCopy.historyMeta(levelCopy.kindLabels[c.kind] ?? fallbackLabels.levelKind, dayLabel(c.decidedAt), c.decidedBy)}</span>
                {c.reason && !c.collapsed ? <span className="text-sm">“{c.reason}”</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
