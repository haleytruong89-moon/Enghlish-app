import { practiceStudent, sourceLabels } from "@/lib/copy/vi";
import { formatDateVi, safeExternalUrl } from "@/lib/inquiries/format";
import { PracticeSubmitArea } from "@/components/practice/PracticeSubmitArea";
import type { ReviewPoints, StudentPracticeItem } from "@/lib/practice/types";

function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

function Card({ item }: { item: StudentPracticeItem }) {
  const due = item.dueOn ? formatDateVi(item.dueOn) : null;
  const href = item.kind === "link" ? safeExternalUrl(item.url) : null;
  const kindLine =
    item.kind === "link"
      ? practiceStudent.linkKind(sourceLabels[item.sourceKey ?? "other"], due)
      : practiceStudent.pdfKind(formatDateVi(item.assignedOn), due);
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5"
      aria-label={item.title}
      data-testid="practice-card"
      data-assignment={item.assignmentId}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] text-muted">{kindLine}</span>
          <b className="text-lg font-semibold">{item.title}</b>
        </span>
        {item.kind === "link" && href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="open-link"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 font-semibold text-white no-underline"
          >
            {practiceStudent.openLink} <ExternalIcon />
          </a>
        ) : null}
        {item.kind === "pdf" && item.hasFile ? (
          <a
            href={`/api/student/practice/${item.assignmentId}/file`}
            data-testid="download-pdf"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent px-4 font-semibold text-accent no-underline"
          >
            {practiceStudent.downloadPdf}
          </a>
        ) : null}
      </div>
      <PracticeSubmitArea item={item} />
    </section>
  );
}

/**
 * "Bài luyện của bạn": open the link / download the PDF, send the result screenshot (or photos of the paper work) with two taps, and see
 * "Việc cần ôn" + the tutor's message. Only what the student functions return: no score, no count of wrong items, no tags beyond the
 * review labels (D28).
 */
export function StudentPractice({ items, review }: { items: StudentPracticeItem[]; review: ReviewPoints | null }) {
  return (
    <main className="mx-auto flex max-w-5xl flex-wrap items-start gap-6 px-5 py-6" data-testid="practice-page">
      <div className="flex min-w-0 flex-[999_1_34rem] flex-col gap-5">
        <h1 className="text-2xl font-bold">{practiceStudent.title}</h1>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-line bg-white p-4" data-testid="practice-empty">
            {practiceStudent.empty}
          </p>
        ) : (
          items.map((i) => <Card key={i.assignmentId} item={i} />)
        )}
      </div>
      <aside className="flex min-w-0 flex-[1_1_18rem] flex-col gap-4 sm:pt-12" aria-label={practiceStudent.reviewTitle}>
        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5" data-testid="review-labels">
          <h2 className="text-lg font-semibold">{practiceStudent.reviewTitle}</h2>
          {review && review.labels.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {review.labels.map((l) => (
                <li key={l} className="rounded-xl bg-[#f6e9df] px-3 py-2 text-[#5a2a0c]">
                  {l}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{practiceStudent.reviewNone}</p>
          )}
        </section>
        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5" data-testid="review-message">
          <h2 className="text-lg font-semibold">{practiceStudent.messageTitle}</h2>
          {review?.message ? <p>“{review.message}”</p> : <p className="text-muted">{practiceStudent.messageNone}</p>}
        </section>
      </aside>
    </main>
  );
}
