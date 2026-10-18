"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { assignPage, fallbackLabels, sourceLabels } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi, safeExternalUrl } from "@/lib/inquiries/format";
import { postJson } from "@/lib/tutorwork/client";
import { codeOf, practiceErrorText } from "@/lib/practice/client";
import type { AssignmentView } from "@/lib/practice/types";
import { formatHm } from "@/lib/work/view";
import { SubmitPanel } from "./SubmitPanel";

export function statusOf(a: AssignmentView): "retracted" | "recorded" | "sent" | "notDone" {
  if (a.retractedAt) return "retracted";
  if (a.resultId) return "recorded";
  if (a.submission) return "sent";
  return "notDone";
}

/** "Bài luyện đã giao": what was given, what the student sent back, and the actions (record the result, submit for the student, retract). */
export function AssignmentTable({ learnerId, assignments, tagLabels }: { learnerId: string; assignments: AssignmentView[]; tagLabels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retract(a: AssignmentView) {
    if (!window.confirm(assignPage.retractConfirm)) return;
    setError(null);
    setBusy(a.id);
    const r = await postJson(`/api/learners/${learnerId}/assignments/${a.id}/retract`, {});
    setBusy(null);
    if (!r.ok) return setError(practiceErrorText(codeOf(r), "staff"));
    router.refresh();
  }

  if (assignments.length === 0) {
    return (
      <p className="text-sm text-muted" data-testid="assignments-empty">
        {assignPage.listEmpty}
      </p>
    );
  }
  const statusText = { retracted: assignPage.statusRetracted, recorded: assignPage.statusRecorded, sent: assignPage.statusSent, notDone: assignPage.statusNotDone };
  const linkClass = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline";
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-red-700" data-testid="assignments-error">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3" data-testid="assignments">
        {assignments.map((a) => {
          const status = statusOf(a);
          const sub = a.submission;
          const when = sub ? `${formatDateVi(todayVn(new Date(sub.createdAt)))} ${formatHm(sub.createdAt)}` : "";
          const href = a.kind === "link" ? safeExternalUrl(a.url) : null;
          return (
            <li
              key={a.id}
              data-testid={`assignment-${a.id}`}
              data-status={status}
              className={`flex flex-col gap-2 rounded-xl border border-line p-4 ${status === "retracted" ? "bg-paper text-muted" : "bg-white"}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted">{assignPage.kindLabel(a.kind, a.sourceKey ? sourceLabels[a.sourceKey] : null)}</span>
                  <b className="font-semibold">{a.title}</b>
                </span>
                <span className="rounded-full bg-paper px-3 py-0.5 text-sm font-semibold" data-testid={`status-${a.id}`}>
                  {statusText[status]}
                </span>
              </div>
              <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">{assignPage.colTags}</dt>
                <dd>{a.tagKeys.length > 0 ? a.tagKeys.map((k) => tagLabels[k] ?? fallbackLabels.tag).join("; ") : assignPage.nothingSent}</dd>
                <dt className="text-muted">{assignPage.colDue}</dt>
                <dd>{a.dueOn ? formatDateVi(a.dueOn) : assignPage.nothingSent}</dd>
                <dt className="text-muted">{assignPage.colSent}</dt>
                <dd data-testid={`sent-${a.id}`}>
                  {sub ? assignPage.sentLine(when, sub.attempt === "first", sub.usedHint, sub.files.length, sub.byRole) : assignPage.nothingSent}
                </dd>
              </dl>
              <div className="flex flex-wrap gap-x-4">
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {assignPage.openLink}
                  </a>
                ) : null}
                {a.file ? (
                  <a href={`/api/files/${a.file.id}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {assignPage.openFile}
                  </a>
                ) : null}
                {a.answerFile ? (
                  <a href={`/api/files/${a.answerFile.id}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {assignPage.openAnswerKey}
                  </a>
                ) : null}
                {status !== "retracted" ? (
                  <>
                    <Link href={`/learners/${learnerId}/results/new?assignment=${a.id}`} data-testid={`record-${a.id}`} className={linkClass}>
                      {status === "recorded" ? assignPage.editResult : assignPage.recordResult}
                    </Link>
                    <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} data-testid={`submit-for-${a.id}`} className={`${linkClass} bg-transparent`}>
                      {assignPage.submitFor}
                    </button>
                    <button type="button" disabled={busy === a.id} onClick={() => void retract(a)} data-testid={`retract-${a.id}`} className={`${linkClass} bg-transparent`}>
                      {busy === a.id ? assignPage.retracting : assignPage.retract}
                    </button>
                  </>
                ) : null}
              </div>
              {open === a.id && status !== "retracted" ? (
                <div className="mt-2 flex flex-col gap-2 rounded-xl bg-paper p-4">
                  <h3 className="font-semibold">{assignPage.submitForTitle(a.title)}</h3>
                  <p className="text-sm text-muted">{assignPage.submitForHelp}</p>
                  <SubmitPanel variant="staff" learnerId={learnerId} assignmentId={a.id} kind={a.kind} onDone={() => setOpen(null)} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
