import { resultPage } from "@/lib/copy/vi";
import { safeExternalUrl } from "@/lib/inquiries/format";
import type { AssignmentView } from "@/lib/practice/types";

/**
 * What the student sent for an assignment, shown beside the result form. The tutor (or parent) READS the picture and types the
 * numbers and tags herself: the app does not read the image (parent decision: no AI). Images come through /api/files/<id>,
 * which checks access and redirects to a 5-minute link.
 */
export function SubmissionPreview({ assignment }: { assignment: AssignmentView }) {
  const sub = assignment.submission;
  const link = sub?.linkUrl ? safeExternalUrl(sub.linkUrl) : null;
  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 lg:sticky lg:top-4" data-testid="submission-preview" aria-label={resultPage.sentTitle}>
      <h2 className="text-lg font-semibold">{resultPage.sentTitle}</h2>
      {!sub ? (
        <p className="text-sm text-muted" data-testid="submission-none">
          {resultPage.sentNone}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">{resultPage.sentNote}</p>
          <ul className="flex flex-col gap-0.5 text-sm" data-testid="submission-claims">
            <li>{sub.attempt === "first" ? resultPage.sentFirst : resultPage.sentRetry}</li>
            <li>{sub.usedHint === null ? resultPage.sentHintNA : sub.usedHint ? resultPage.sentHint : resultPage.sentNoHint}</li>
            {resultPage.sentBy(sub.byRole) ? <li>{resultPage.sentBy(sub.byRole)}</li> : null}
          </ul>
          <p className="text-xs text-muted">{resultPage.sentConfirm}</p>
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center break-all text-sm font-medium text-accent underline">
              {resultPage.sentLink}
            </a>
          ) : null}
          <ul className="flex flex-col gap-3">
            {sub.files.map((f, i) => {
              const href = `/api/files/${f.id}`;
              return f.mime.startsWith("image/") ? (
                <li key={f.id} className="flex flex-col gap-1" data-testid={`submission-file-${i + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a private, short-lived redirect, not an optimisable static image */}
                  <img src={href} alt={resultPage.sentImage(i + 1)} className="max-h-[70vh] w-full rounded-lg border border-line object-contain" data-testid="submission-image" />
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">
                    {resultPage.sentBig}
                  </a>
                </li>
              ) : (
                <li key={f.id} data-testid={`submission-file-${i + 1}`}>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">
                    {resultPage.sentFile(i + 1)}
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </aside>
  );
}
