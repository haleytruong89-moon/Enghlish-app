"use client";

import { useState } from "react";
import { reviewItemCopy as c } from "@/lib/copy/vi";
import { onlyToCheck, orderByStatus, STATUS_TONE, type ItemStatus } from "@/lib/review/itemStatus";

export type WorkItemRow = {
  id: string; n: number; stem: string; given: string; status: ItemStatus; blank: boolean; keyLine: string | null;
};

/** The items of one piece of work for the tutor: green = right, red = wrong, orange = waiting; wrong and waiting first; a filter. */
export function WorkItems({ rows, givenLabel, blankLabel }: { rows: WorkItemRow[]; givenLabel: string; blankLabel: string }) {
  const [filter, setFilter] = useState<"all" | "check">("all");
  const ordered = orderByStatus(rows);
  const shown = filter === "check" ? onlyToCheck(ordered) : ordered;
  return (
    <div className="flex flex-col gap-3" data-testid="work-items" data-filter={filter}>
      <div role="group" aria-label={c.filterLabel} className="flex flex-wrap gap-2">
        {(["all", "check"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} data-testid={`items-filter-${f}`} onClick={() => setFilter(f)}
            className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${filter === f ? "border-accent bg-[#E3ECE8] text-[#1F4439]" : "border-line bg-white"}`}>
            {f === "all" ? c.filterAll : c.filterToCheck}
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted" data-testid="items-none">{c.noneToCheck}</p> : null}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {shown.map((r) => (
          <li key={r.id} data-testid={`item-${r.id}`} data-status={r.status} className={`rounded-lg border-2 px-3 py-2 ${STATUS_TONE[r.status].box}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-muted">{c.questionLabel(r.n)}</span>
              <span data-testid={`item-chip-${r.id}`} className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[r.status].chip}`}>
                {r.status === "right" ? c.right : r.status === "wrong" ? (r.blank ? c.blank : c.wrong) : c.waiting}
              </span>
            </div>
            <p lang="en" className="mt-1 text-sm font-medium">{r.stem}</p>
            <p lang="en" className="mt-1 text-sm">{givenLabel}: <b>{r.given.trim() ? r.given : blankLabel}</b></p>
            {r.keyLine ? <p lang="en" className="mt-1 text-xs text-muted">{r.keyLine}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
