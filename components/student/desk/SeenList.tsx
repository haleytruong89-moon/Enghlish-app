"use client";

import Link from "next/link";
import { useEffect } from "react";
import { studentDeskCopy as c } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { todayVn } from "@/lib/inquiries/dates";
import { hasMessage } from "@/lib/student/history";
import { isNew, writeOpened } from "@/lib/student/seenMemo";
import { useLastOpened } from "./useLastOpened";
import type { SeenRow } from "@/lib/student/types";

function SeenCard({ row, fresh }: { row: SeenRow; fresh: boolean }) {
  const open = row.assignmentId ? `/done/${row.assignmentId}` : row.activityId ? `/activities/${row.activityId}` : null;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4" data-testid="seen-card" data-new={fresh ? "yes" : "no"} data-kind={row.kind}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{row.title}</h2>
        {fresh ? <span className="rounded-full bg-[#b4531c] px-2.5 py-0.5 text-xs font-bold text-white" data-testid="seen-new">{c.newBadge}</span> : null}
        <span className="basis-full text-[13px] text-muted">
          {c.kinds[row.kind]} · <time dateTime={row.seenAt.slice(0, 10)}>{c.seenOn(formatDateVi(todayVn(new Date(row.seenAt))))}</time>
        </span>
      </header>
      {row.praise ? (
        <div className="rounded-xl bg-[#e3ece8] px-3 py-2 text-[#1d4136]" data-testid="seen-praise">
          <p className="text-[13px] font-semibold">{c.praise}</p>
          <p>{row.praise}</p>
        </div>
      ) : null}
      {row.notes.length > 0 ? (
        <div className="rounded-xl bg-[#fbf1dc] px-3 py-2" data-testid="seen-fix">
          <p className="text-[13px] font-semibold text-[#6b4600]">{c.fix}</p>
          <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5">
            {row.notes.map((n) => (
              <li key={n.n}>
                {n.text}
                {n.excerpt ? (
                  <span className="mt-0.5 block text-sm text-muted">
                    {c.inYourText} <span lang="en" className="rounded bg-white px-1 underline">{n.excerpt}</span>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {row.closingNote ? (
        <p className="rounded-xl bg-[#e3ece8] px-3 py-2 text-[#1d4136]" data-testid="seen-closing">
          <b>{c.closingLabel}:</b> {row.closingNote}
        </p>
      ) : null}
      {!hasMessage(row) ? <p className="text-muted" data-testid="seen-plain">{c.viewedOnly}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        {row.state === "todo" && row.revisionActivityId ? (
          <Link href={`/activities/${row.revisionActivityId}`} data-testid="seen-revise" className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 font-bold text-white no-underline">
            {c.reviseCta}
          </Link>
        ) : null}
        {row.state === "revised" ? <span className="rounded-xl bg-[#e3ece8] px-3 py-2 text-sm font-semibold text-[#1d4136]">{c.revised}</span> : null}
        {row.state === "closed" ? <span className="text-sm text-muted">{c.revisionClosed}</span> : null}
        {row.state === "note" ? <span className="text-sm text-muted">{c.noRevision}</span> : null}
        {open ? (
          <Link href={open} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-accent no-underline hover:border-accent">
            {c.viewSubmitted}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

/** "Đã xem": newest first. Opening this tab remembers the time ON THIS DEVICE (localStorage) so the next visit can show which cards are "Mới". */
export function SeenList({ rows, learnerId, olderHref }: { rows: SeenRow[]; learnerId: string; olderHref: string | null }) {
  const last = useLastOpened(learnerId);
  // Remember the visit when the child leaves (not at once, so the "Mới" marks stay for the whole visit).
  useEffect(() => {
    const remember = () => writeOpened(window.localStorage, learnerId);
    window.addEventListener("pagehide", remember);
    return () => {
      window.removeEventListener("pagehide", remember);
      remember();
    };
  }, [learnerId]);
  return (
    <>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white p-4 text-muted" data-testid="seen-empty">{c.seenEmpty}</p>
      ) : (
        <div className="flex flex-col gap-3" data-testid="seen-list">
          {rows.map((r) => (
            <SeenCard key={r.ref} row={r} fresh={last !== undefined && isNew(r.seenAt, last)} />
          ))}
        </div>
      )}
      {olderHref ? (
        <Link href={olderHref} data-testid="seen-older" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-white px-5 font-medium text-accent no-underline">
          {c.older}
        </Link>
      ) : null}
    </>
  );
}
