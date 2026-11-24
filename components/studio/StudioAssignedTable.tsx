import Link from "next/link";
import { studioAssignedCopy as c } from "@/lib/copy/vi";
import { formatDay } from "@/lib/review/format";
import type { StudioAssignedRow, StudioAssignedStatus } from "@/lib/studio/assigned";
import { formatHm } from "@/lib/work/view";
import { todayVn } from "@/lib/inquiries/dates";
import { RemoveAssignedButton } from "./RemoveAssignedButton";

const TONE: Record<StudioAssignedStatus, string> = {
  not_yet: "bg-[#EFEDE7] text-muted",
  todo: "bg-[#E3ECE8] text-[#1F4439]",
  overdue: "bg-[#FBF1DC] text-[#6B4600]",
  skipped: "bg-[#EFEDE7] text-muted",
  waiting: "bg-[#FBF1DC] text-[#6B4600]",
  checked: "bg-[#E3ECE8] text-[#1F4439]",
};

/** "Bài làm trên app đã giao": each Studio test with its status and a way to see the whole work. Adults only (staff pages). */
export function StudioAssignedTable({ rows, title = c.title }: { rows: StudioAssignedRow[] | null; title?: string }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="studio-assigned-title" id="studio-assigned" data-testid="studio-assigned">
      <h2 id="studio-assigned-title" className="text-lg font-semibold">{title}</h2>
      {rows === null ? (
        <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted">{c.unavailable}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted" data-testid="studio-assigned-empty">{c.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.instanceId} data-testid={`studio-assigned-${r.instanceId}`} data-status={r.status} data-late-days={r.lateDays ?? undefined} className="flex flex-col gap-1.5 rounded-xl border border-line bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{r.title}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${TONE[r.status]}`} data-testid={`studio-assigned-status-${r.instanceId}`}>
                  {r.status === "overdue" && r.lateDays !== null ? c.overdueDays(r.lateDays) : c.status[r.status]}
                </span>
              </div>
              <p className="text-sm text-muted">
                {c.dates(r.startOn ? formatDay(r.startOn) : null, formatDay(r.dueOn))} · {c.items(r.items)}
                {r.lastSubmittedAt ? ` · ${c.sent(`${formatHm(r.lastSubmittedAt)} ${formatDay(todayVn(new Date(r.lastSubmittedAt)))}`, r.attempts)}` : ""}
                {r.firstResult ? ` · ${c.firstResult(r.firstResult.correct, r.firstResult.total)}` : ""}
                {r.units.length > 0 ? <span data-testid={`studio-assigned-units-${r.instanceId}`}>{` · ${c.units(r.units)}`}</span> : null}
                {r.feedbackGiven ? <span data-testid={`studio-assigned-fb-${r.instanceId}`}>{` · ${c.feedbackGiven}`}</span> : null}
              </p>
              {r.removedReason ? (
                <p className="text-sm text-muted" data-testid={`studio-assigned-reason-${r.instanceId}`}>
                  {c.removedReason(r.removedReason)}
                </p>
              ) : null}
              {/* Gỡ bài only before anything was sent; Khôi phục for every removed test, even one with work sent before the removal. */}
              {r.status === "skipped" || r.lastAttemptId === null ? (
                <div className="flex flex-wrap gap-2">
                  <RemoveAssignedButton activityId={r.activityId} removed={r.status === "skipped"} title={r.title} />
                </div>
              ) : null}
              {r.lastAttemptId ? (
                <p className="flex flex-wrap gap-x-5 text-sm">
                  {r.episodeId ? (
                    <Link href={`/review/${r.episodeId}`} data-testid={`studio-assigned-open-${r.instanceId}`} className="inline-flex min-h-11 items-center font-semibold text-accent underline">
                      {r.feedbackReady ? c.openWorkFeedback : c.openWork}
                    </Link>
                  ) : null}
                  {r.status === "waiting" ? (
                    <Link href={`/review/studio#studio-${r.lastAttemptId}`} data-testid={`studio-assigned-check-${r.instanceId}`} className="inline-flex min-h-11 items-center text-accent underline">
                      {c.checkItems}
                    </Link>
                  ) : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
