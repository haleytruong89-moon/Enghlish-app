import Link from "next/link";
import { assignedBoardCopy as c, studioCopy } from "@/lib/copy/vi";
import type { DraftBoard, DraftGroup } from "@/lib/assigned/draftGroups";
import type { DraftListItem } from "@/lib/studio/types";

const ROW = "flex min-h-12 flex-wrap items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[#f2f7f4] focus-within:bg-[#f2f7f4]";
const GIVE = "inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-[15px] font-bold text-white no-underline shadow-[0_2px_0_#1f4439] hover:bg-[#1f4439]";
const REVIEW = "inline-flex min-h-11 items-center rounded-xl border-2 border-accent bg-white px-3.5 text-sm font-bold text-accent no-underline hover:bg-[#eef5f1]";

/** One draft: the button on the right opens it and says what to do next (Duyệt a draft, Mở one still being read). One link per row. */
function DraftRow({ d }: { d: DraftListItem }) {
  const action = d.status === "draft" ? c.reviewAction : c.openAction;
  return (
    <li className={ROW} data-testid={`draft-${d.id}`}>
      <span className="min-w-0 flex-1 basis-72 font-medium text-ink">{d.title}</span>
      <span className="text-sm text-[#7a5f17]">{studioCopy.statusLabels[d.status]}</span>
      <Link href={`/studio/drafts/${d.id}`} aria-label={c.actionLabel(action, d.title)} data-testid={`draft-action-${d.id}`} className={REVIEW}>{action}</Link>
    </li>
  );
}

function Group({ g }: { g: DraftGroup }) {
  return (
    <details open={g.next} data-testid={`draft-group-${g.key}`} className={`group rounded-2xl border bg-white ${g.next ? "border-2 border-accent" : "border-line"}`}>
      {/* 27/11: a visible ▸ and "Xem n bài" so a closed group reads as something to open (the native marker is hidden by flex). */}
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-2 hover:bg-[#f2f7f4]">
        <span aria-hidden="true" className="text-accent transition-transform group-open:rotate-90">▸</span>
        <span className="flex min-w-0 flex-col">
          <b className={g.closed ? "text-muted" : ""}>{c.draftGroup(g.key)}</b>
          {g.key === "other" ? <span className="text-xs text-muted" data-testid="draft-other-hint">{c.draftOtherHint}</span> : null}
        </span>
        {g.next ? <span data-testid="draft-next" className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-white">{c.draftNext}</span> : null}
        {g.status ? <span className="text-sm text-muted">{c.unitStatus[g.status]}</span> : null}
        <span className="ml-auto text-sm font-semibold text-accent underline group-open:hidden" data-testid={`draft-group-open-${g.key}`}>{c.draftOpen(g.drafts.length)}</span>
        <span className="ml-auto hidden text-sm text-muted group-open:inline">{c.draftClose}</span>
      </summary>
      <ul className="flex flex-col gap-0.5 border-t border-line px-2 py-2">{g.drafts.map((d) => <DraftRow key={d.id} d={d} />)}</ul>
    </details>
  );
}

/**
 * The drafts not given yet (Giao bài and Bài tập › Bản nháp, hướng B v2): "Sẵn sàng giao" first with a strong "Giao →" (it opens
 * the draft page at its giving form: dates are chosen there), then the drafts by Unit, "Kế tiếp" open and first. Links only.
 */
export function DraftGroups({ board }: { board: DraftBoard }) {
  const rest = board.groups.reduce((n, g) => n + g.drafts.length, 0);
  if (board.ready.length === 0 && rest === 0) return <p className="rounded-xl border border-dashed border-line bg-white px-4 py-5 text-muted" data-testid="board-empty">{c.empty.drafts}</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="board-drafts">
      {board.ready.length > 0 ? (
        <section aria-labelledby="drafts-ready-title" data-testid="drafts-ready" className="rounded-2xl border-2 border-accent bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="drafts-ready-title" className="text-lg font-bold text-[#1f4439]">{c.readyTitle(board.ready.length)}</h2>
            <span className="rounded-full bg-[#e3eee9] px-2.5 py-0.5 text-xs font-semibold text-[#1f4439]">{c.readyBadge}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted">{c.readyHint}</p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {board.ready.map(({ draft: d, next, status }) => (
              <li key={d.id} className={`${ROW} border-t border-[#eceee8]`} data-testid={`draft-${d.id}`}>
                <span className="min-w-0 flex-1 basis-72">
                  <span className="font-semibold text-ink">{d.title}</span>
                  {next || status ? (
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                      {next ? <span data-testid="ready-next" className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">{c.draftNext}</span> : null}
                      {status ? <span>{c.unitStatus[status]}</span> : null}
                    </span>
                  ) : null}
                </span>
                <Link href={`/studio/drafts/${d.id}#assign`} aria-label={c.giveLabel(d.title)} data-testid={`draft-give-${d.id}`} className={GIVE}>{c.giveAction}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rest > 0 ? <h2 className="mt-2 text-lg font-semibold">{c.groupsTitle(rest)}</h2> : null}
      {board.groups.map((g) => <Group key={g.key} g={g} />)}
    </div>
  );
}
