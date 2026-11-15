import { practiceStudent, sourceLabels } from "@/lib/copy/vi";
import { PracticeSubmitArea } from "@/components/practice/PracticeSubmitArea";
import { formatDateVi, safeExternalUrl } from "@/lib/inquiries/format";
import type { StudentPracticeItem } from "@/lib/practice/types";

function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

/**
 * The card of one link / PDF assignment (open the link or download the PDF, send the result photos with two taps). It is the former "Bài luyện"
 * card, now shown inside Hôm nay (and /done/[ref]); nothing about how work is sent changed. No score, no count of wrong items (D28).
 */
export function PracticeCard({ item }: { item: StudentPracticeItem }) {
  const due = item.dueOn ? formatDateVi(item.dueOn) : null;
  const href = item.kind === "link" ? safeExternalUrl(item.url) : null;
  const kindLine =
    item.kind === "link"
      ? practiceStudent.linkKind(sourceLabels[item.sourceKey ?? "other"], due)
      : practiceStudent.pdfKind(formatDateVi(item.assignedOn), due);
  return (
    <section
      id={`task-${item.assignmentId}`}
      className="flex scroll-mt-4 flex-col gap-4 rounded-2xl border border-line bg-white p-5"
      aria-label={item.title}
      data-testid="practice-card"
      data-assignment={item.assignmentId}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] text-muted">
            {kindLine.split(" · ").map((part, i) => (
              <span key={i}>
                {i > 0 ? " · " : ""}
                {/\d/.test(part) ? <time dateTime={part.includes("hạn") ? item.dueOn ?? undefined : item.assignedOn}>{part}</time> : part}
              </span>
            ))}
          </span>
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
