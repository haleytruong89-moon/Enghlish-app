import Link from "next/link";
import { pendingCopy, reviewPage } from "@/lib/copy/vi";
import { PENDING_GROUPS, pendingView, type PendingGroup, type PendingRow } from "@/lib/desk/pending";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";

const GRID = "md:grid-cols-[200px_minmax(0,1fr)_100px_180px_96px]";
const pill = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";

/** Spec §5 rule 4: one line per item — Loại · Nội dung · Từ ngày · Cần làm · Mở; filter by type; oldest first; fixed-width action column. */
export function PendingTable({ learnerId, rows, group, counts, partial = false, showEmpty = true }: { learnerId: string; rows: PendingRow[]; group: PendingGroup; counts: Record<PendingGroup, number>; partial?: boolean; showEmpty?: boolean }) {
  const base = `/learners/${learnerId}/inbox`;
  const c = pendingCopy.cols;
  return (
    <>
      <nav aria-label={pendingCopy.filtersLabel} className="flex flex-wrap gap-2">
        {PENDING_GROUPS.map((g) => (
          <Link key={g} href={g === "all" ? base : `${base}?f=${g}`} aria-current={g === group ? "true" : undefined} data-testid={`pending-filter-${g}`}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm no-underline ${g === group ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-ink hover:border-accent"}`}>
            {pendingCopy.groupCount(pendingCopy.groups[g], counts[g], partial)}
          </Link>
        ))}
      </nav>
      <section className="mt-4 rounded-xl border border-line bg-white" data-testid="pending-table">
        <div aria-hidden="true" className={`hidden gap-3 border-b border-line px-4 py-2 text-xs font-semibold text-muted md:grid ${GRID}`}>
          <span>{c.kind}</span><span>{c.content}</span><span>{c.since}</span><span>{c.need}</span><span />
        </div>
        {rows.length === 0 ? (
          showEmpty ? <p className="px-4 py-4 text-sm text-muted" data-testid="pending-empty">{group === "all" ? pendingCopy.empty : pendingCopy.emptyGroup}</p> : null
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.key} data-testid={`pending-row-${r.key}`} className={`grid gap-1 border-b border-[#eceee8] px-4 py-3 text-sm last:border-b-0 md:items-center md:gap-3 ${GRID}`}>
                <span><span className="md:sr-only">{c.kind}: </span><span className={`${pill} ${r.group === "work" ? "bg-[#eceee8] text-[#3d433f]" : "bg-[#e4ebf5] text-[#1f3f6e]"}`}>{r.label}</span></span>
                <span className="min-w-0 break-words"><span className="md:sr-only">{c.content}: </span>{r.title}</span>
                <span className="tabular-nums"><span className="md:sr-only">{c.since}: </span>{r.since ? formatDateVi(todayVn(new Date(r.since))) : pendingCopy.noDate}</span>
                <span>
                  <span className="md:sr-only">{c.need}: </span>{r.need}
                  {r.waitingTutor ? <span className={`ml-2 ${pill} border border-line`}>{reviewPage.waitingTutor}</span> : null}
                </span>
                <span className="md:justify-self-end">
                  <Link href={r.href} data-testid={`pending-open-${r.key}`} className="inline-flex min-h-11 w-24 items-center justify-center rounded-lg border border-accent text-sm font-semibold text-accent no-underline hover:bg-accent hover:text-white">
                    {pendingCopy.open}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
