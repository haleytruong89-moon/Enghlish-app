import Link from "next/link";
import { pendingCopy } from "@/lib/copy/vi";
import type { PendingRowsResult } from "@/lib/desk/load";

export function DeskInbox({ learnerId, pending }: { learnerId: string; pending: PendingRowsResult }) {
  const rows = pending.rows;
  return (
    <section data-testid="desk-inbox" aria-labelledby="desk-inbox-title" className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#2f5d9e] bg-[#eef3fa] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="desk-inbox-title" className="text-lg font-semibold">{pendingCopy.deskTitle(rows.length)}</h2>
        <Link href={`/learners/${learnerId}/inbox`} data-testid="desk-inbox-open" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">{pendingCopy.deskOpenAll}</Link>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted">{pendingCopy.empty}</p> : null}
      {rows.slice(0, 3).map((r) => (
        <Link key={r.key} href={r.href} data-testid={`desk-inbox-row-${r.key}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2 text-ink no-underline hover:outline hover:outline-1 hover:outline-[#2f5d9e]">
          <span className="rounded-full bg-[#e4ebf5] px-2.5 py-0.5 text-xs font-semibold text-[#1f3f6e]">{r.label}</span>
          <span className="min-w-0 flex-1 text-sm">{r.title}</span>
          <span className="text-sm text-muted">{r.need}</span>
        </Link>
      ))}
      {rows.length > 3 ? <p className="text-sm text-muted">{pendingCopy.deskMore(rows.length - 3)}</p> : null}
      {pending.failed.length > 0 ? <p className="text-xs text-muted">{pendingCopy.deskPartial}</p> : null}
    </section>
  );
}
