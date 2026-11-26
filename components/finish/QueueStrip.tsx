import Link from "next/link";
import { finishCopy as c } from "@/lib/copy/vi";
import { finishHref } from "@/lib/finish/paths";

export type StripEntry = { attemptId: string; title: string; waited: number };

/**
 * Bản 3 (26/11): the whole queue at the top of "Chấm và góp ý", impossible to miss — how many submissions still wait for the adult,
 * one chip per submission (oldest first; the open one filled), and a strong "Bài sau ›". Nothing waiting: one green line.
 */
export function QueueStrip({ learnerId, entries, currentId, nextHref }: { learnerId: string; entries: StripEntry[]; currentId: string; nextHref: string | null }) {
  if (entries.length === 0) {
    return <p role="status" data-testid="finish-queue-empty" className="rounded-2xl border-2 border-[#2f7d4f] bg-[#eaf4ee] px-4 py-3 font-semibold text-[#1f5a36]">{c.queueEmpty}</p>;
  }
  return (
    <nav aria-label={c.queueLabel} data-testid="finish-queue" className="flex flex-col gap-2.5 rounded-2xl border-2 border-[#b4402c] bg-[#fbe9e4] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold text-[#7d2a1b]" data-testid="finish-queue-title">{c.queueTitle(entries.length)}</h2>
        <span className="text-sm text-[#7d2a1b]">{c.queueWhy}</span>
        {nextHref ? (
          <Link href={nextHref} data-testid="finish-next-top" className="ml-auto inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-bold text-white no-underline shadow-[0_2px_0_#1f4439] hover:bg-[#1f4439]">{c.next}</Link>
        ) : null}
      </div>
      <ol className="flex flex-wrap gap-2">
        {entries.map((e, i) => {
          const on = e.attemptId === currentId;
          return (
            <li key={e.attemptId}>
              <Link href={finishHref(learnerId, e.attemptId)} aria-current={on ? "page" : undefined} title={e.title} data-testid={`finish-queue-${e.attemptId}`}
                className={`flex min-h-11 max-w-[15rem] flex-col justify-center rounded-xl px-3 py-1 text-[13px] font-bold no-underline ${on ? "bg-[#b4402c] text-white" : "border-[1.5px] border-[#b4402c] bg-white text-[#7d2a1b] hover:bg-[#fff6f3]"}`}>
                <span className="truncate">{i + 1} · {e.title}</span>
                <span className="font-medium">{on ? c.queueOpen(e.waited) : c.queueWaited(e.waited)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
