import Link from "next/link";
import { assignedBoardCopy as c, studioCopy } from "@/lib/copy/vi";
import type { DraftGroup } from "@/lib/assigned/draftGroups";

/** Bài tập › Bản nháp: one fold per Unit, the next Unit open and first. Links only (reviewing and giving happen on the draft page). */
export function DraftGroups({ groups }: { groups: DraftGroup[] }) {
  if (groups.length === 0) return <p className="rounded-xl border border-dashed border-line bg-white px-4 py-5 text-muted" data-testid="board-empty">{c.empty.drafts}</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="board-drafts">
      {groups.map((g) => (
        <details key={g.key} open={g.next} data-testid={`draft-group-${g.key}`} className={`rounded-xl border bg-white ${g.next ? "border-accent" : "border-line"}`}>
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 px-4 py-2">
            <b>{c.draftGroup(g.key)}</b>
            {g.next ? <span data-testid="draft-next" className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">{c.draftNext}</span> : null}
            {g.status ? <span className="text-sm text-muted">{c.unitStatus[g.status]}</span> : null}
            <span className="ml-auto text-sm text-muted">{c.draftCount(g.drafts.length)}</span>
          </summary>
          <ul className="flex flex-col gap-1 border-t border-line px-2 py-2">
            {g.drafts.map((d) => (
              <li key={d.id}>
                <Link href={`/studio/drafts/${d.id}`} data-testid={`draft-${d.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg px-2 no-underline hover:bg-[#f3f4ef]">
                  <span className="font-medium text-ink">{d.title}</span>
                  <span className="text-sm text-muted">{studioCopy.statusLabels[d.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
