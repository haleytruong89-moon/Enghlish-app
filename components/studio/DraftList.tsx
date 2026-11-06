// components/studio/DraftList.tsx
import Link from "next/link";
import { studioCopy } from "@/lib/copy/vi";
import type { DraftListItem } from "@/lib/studio/types";

export function DraftList({ drafts }: { drafts: DraftListItem[] }) {
  return (
    <section className="mt-8" aria-labelledby="drafts-title">
      <h2 id="drafts-title" className="text-lg font-semibold">{studioCopy.draftsTitle}</h2>
      {drafts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{studioCopy.draftsEmpty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link href={`/studio/drafts/${d.id}`} data-testid={`draft-${d.id}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-2 no-underline hover:border-accent">
                <span className="font-semibold text-ink">{d.title}</span>
                <span className="text-sm text-muted">
                  {studioCopy.statusLabels[d.status]}
                  {d.status === "approved" ? ` · ${studioCopy.assignedCount(d.assigned)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
