import { revisionCopy } from "@/lib/copy/vi";
import type { MyActivityNote, MyFeedbackItem } from "@/lib/revision/types";

/** "Góp ý của thầy/cô": "Thầy/cô đã xem bài sửa của bạn" + the closing note, and "Chỉ góp ý" notes (14 days). Never a score or a verdict. */
export function FeedbackBox({ items }: { items: MyFeedbackItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="feedback-box-title" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" data-testid="feedback-box">
      <h2 id="feedback-box-title" className="text-[15px] font-bold">
        {revisionCopy.boxTitle}
      </h2>
      {items.map((i) =>
        i.state === "seen" ? (
          <div key={i.feedbackId} data-testid={`feedback-seen-${i.feedbackId}`} className="flex flex-col gap-1 rounded-xl bg-[#E3ECE8] px-3 py-2 text-[#1F4439]">
            <span className="text-sm font-semibold">{revisionCopy.seenTitle} · {i.titleVi}</span>
            {i.closingNote ? (
              <span className="text-sm">
                {revisionCopy.closingLabel}: {i.closingNote}
              </span>
            ) : null}
          </div>
        ) : (
          <details key={i.feedbackId} data-testid={`feedback-note-${i.feedbackId}`} className="rounded-xl border border-line px-3 py-2 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">{revisionCopy.noteTitle(i.titleVi)}</summary>
            {i.praise ? <p className="mb-1">{i.praise}</p> : null}
            <ol className="flex list-decimal flex-col gap-1 pl-5">
              {(i.notes ?? []).map((n) => (
                <li key={n.n}>
                  {n.text}
                  {n.excerpt ? <span lang="en" className="ml-1 rounded bg-[#FBF1DC] px-1 underline">{n.excerpt}</span> : null}
                </li>
              ))}
            </ol>
          </details>
        ),
      )}
    </section>
  );
}

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
