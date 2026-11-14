"use client";
import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { assignWaysCopy } from "@/lib/copy/vi";
import { WAYS, wayHref, type Way } from "@/lib/assign/ways";
import type { Prefill } from "@/lib/prefill";

/** The strip "Cách giao" at the top of the four pages: the way in use is lit; switching keeps the prefill and asks before losing unsaved work. */
export function WaysStrip({ learnerId, current, prefill }: { learnerId: string; current: Way; prefill?: Prefill }) {
  return (
    <nav aria-label={assignWaysCopy.stripLabel} data-testid="ways-strip" className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted">{assignWaysCopy.stripLabel}</span>
      {WAYS.map((w) => (
        <Link
          key={w}
          href={wayHref(learnerId, w, prefill)}
          data-testid={`strip-${w}`}
          aria-current={w === current ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm no-underline ${w === current ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-ink hover:border-accent"}`}
        >
          {assignWaysCopy.ways[w].title}
        </Link>
      ))}
    </nav>
  );
}
