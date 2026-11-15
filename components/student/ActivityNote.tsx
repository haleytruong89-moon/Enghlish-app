import { revisionCopy } from "@/lib/copy/vi";
import type { MyActivityNote } from "@/lib/revision/types";

/** G4: the "Chỉ góp ý" note shown on the page of its own activity, for as long as the activity is visible. Never a score. */
export function ActivityNote({ note }: { note: MyActivityNote | null }) {
  if (!note) return null;
  return (
    <section aria-labelledby="activity-note-title" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" data-testid="activity-note">
      <h2 id="activity-note-title" className="text-[15px] font-bold">
        {revisionCopy.boxTitle}
      </h2>
      <p className="rounded-xl bg-[#E3ECE8] px-3 py-2 text-sm text-[#1F4439]">{note.praise}</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        {note.notes.map((n) => (
          <li key={n.n}>
            {n.text}
            {n.excerpt ? <span lang="en" className="ml-1 rounded bg-[#FBF1DC] px-1 underline">{n.excerpt}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
