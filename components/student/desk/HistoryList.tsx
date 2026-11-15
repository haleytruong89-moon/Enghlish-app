"use client";

import Link from "next/link";
import { useState } from "react";
import { studentDeskCopy as c } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";
import { filterHistory, historyCounts, type HistoryFilter } from "@/lib/student/history";
import type { HistoryRow } from "@/lib/student/types";
import { activityLabels, fallbackLabels } from "@/lib/copy/vi";

function title(r: HistoryRow): string {
  return r.kind === "topic" && r.activityType ? `${r.title} · ${activityLabels[r.activityType] ?? fallbackLabels.activity}` : r.title;
}

function Item({ r }: { r: HistoryRow }) {
  const href = r.assignmentId ? (r.retracted ? null : `/done/${r.assignmentId}`) : r.activityId ? `/activities/${r.activityId}` : null;
  const day = todayVn(new Date(r.submittedAt));
  const parts: (string | null)[] = [
    c.kinds[r.kind],
    r.kind === "revision" ? null : r.first ? c.firstTime : c.again,
    r.usedHint === null ? null : r.usedHint ? c.hint.yes : c.hint.no,
  ];
  return (
    <li data-testid="history-row" data-seen={r.seen ? "yes" : "no"} data-kind={r.kind} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{title(r)}</span>
        <span className="text-[13px] text-muted">
          <time dateTime={day}>{c.submittedOn(formatDateVi(day))}</time> · {parts.filter(Boolean).join(" · ")}
          {r.offline ? ` · ${c.offline}` : ""}
        </span>
      </span>
      <span
        data-testid="history-status"
        className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold ${r.seen ? "bg-[#e3ece8] text-[#1d4136]" : "bg-[#f1efe9] text-ink"}`}
      >
        {r.seen ? c.statusSeen : c.statusWaiting}
      </span>
      {href ? (
        <Link href={href} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-accent no-underline hover:border-accent">
          {c.openSubmitted}
        </Link>
      ) : null}
    </li>
  );
}

/** "Đã làm": everything the child sent, with a filter (the numbers are counts of the child's own sent work, never of right answers). */
export function HistoryList({ rows, total, waiting, olderHref }: { rows: HistoryRow[]; total: number; waiting: number; olderHref: string | null }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const counts = historyCounts(total, waiting);
  const shown = filterHistory(rows, filter);
  const tabs: { key: HistoryFilter; label: string; count: boolean }[] = [
    { key: "all", label: c.filterAll(counts.all), count: true },
    { key: "waiting", label: c.filterWaiting(counts.waiting), count: true },
    { key: "seen", label: c.filterSeen, count: false },
  ];
  return (
    <>
      <div role="group" aria-label={c.filterLabel} className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={filter === t.key}
            data-testid={`filter-${t.key}`}
            onClick={() => setFilter(t.key)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${filter === t.key ? "border-accent bg-[#e3ece8] font-semibold text-accent" : "border-line bg-white"}`}
          >
            {t.count ? <span data-count="work">{t.label}</span> : t.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white p-4 text-muted" data-testid="history-empty">{c.doneEmpty}</p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white p-4 text-muted" data-testid="history-filter-empty">{olderHref ? c.filterNoneMore : c.filterNone}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="history-list">
          {shown.map((r) => (
            <Item key={r.ref} r={r} />
          ))}
        </ul>
      )}
      {olderHref ? (
        <Link href={olderHref} data-testid="history-older" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-white px-5 font-medium text-accent no-underline">
          {c.older}
        </Link>
      ) : null}
    </>
  );
}
