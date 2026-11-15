"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { practiceStudent, submitScreenCopy, workWeekCopy } from "@/lib/copy/vi";
import { codeOf, nextAttempt, practiceErrorText, uploadAll, type SendAttempt, type UploadCache } from "@/lib/practice/client";
import { parseHttpsUrl } from "@/lib/practice/link";
import { lastWeekChoiceOpen } from "@/lib/student/week";
import { postJson } from "@/lib/tutorwork/client";
import { ImagePicker, type PickedItem } from "./ImagePicker";

type Props = {
  learnerId: string;
  assignmentId: string;
  kind: "link" | "pdf";
  onDone?: () => void;
  /** From the server: 12, or 6 until migration 0033 is applied (so the grown-up is stopped before uploading). */
  maxFiles?: number;
};

/**
 * "Nộp thay": a tutor / parent sends the child's work on the child's behalf: pictures (paste or pick, up to 12), an optional link, and the two taps - first
 * time? looked at a hint or the answers? (asked for a PDF too since W4c1). The child sends from their own screens (components/student/submit).
 * Uploads each picture straight to storage through a one-time link, then registers the work in one call.
 */
export function SubmitPanel({ learnerId, assignmentId, kind, onDone, maxFiles }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<PickedItem[]>([]);
  const [link, setLink] = useState("");
  // Unknown stays unknown: nothing is pre-chosen. "first or retry" must be picked (the column is not null); the hint answer may stay "Không rõ" (sent as null).
  const [first, setFirst] = useState<boolean | null>(null);
  const [hint, setHint] = useState<boolean | null>(null);
  // W4d: paper work (PDF assignment) sent on Monday-Tuesday may be put in LAST week. The server checks the day again; this only offers the choice.
  const [lastWeek, setLastWeek] = useState(false);
  const canPickWeek = kind === "pdf" && lastWeekChoiceOpen(new Date());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "send" | null>(null);
  // Kept across retries: a lost answer is retried with the same id and only the files that failed are sent again.
  const attempt = useRef<SendAttempt | null>(null);
  const uploaded = useRef<UploadCache>(new Map());
  const who = "staff" as const;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const linkClean = link.trim();
    if (kind === "link" && linkClean && !parseHttpsUrl(linkClean)) return setError(practiceErrorText("invalid_link", who));
    if (items.length === 0 && !linkClean) return setError(practiceStudent.needImage);
    if (first === null) return setError(practiceStudent.needFirstAnswer);

    setBusy("upload");
    const files = items.map((i) => i.file);
    const up = await uploadAll(files, `/api/learners/${learnerId}/files`, { purpose: "submission", assignment_id: assignmentId }, uploaded.current);
    if (!up.ok) {
      setBusy(null);
      return setError(practiceErrorText(up.error, who));
    }
    setBusy("send");
    const body = {
      attempt: first ? "first" : "retry",
      used_hint: hint, // null = the grown-up does not know
      link_url: kind === "link" && linkClean ? linkClean : null,
      files: up.files,
      ...(canPickWeek && lastWeek ? { work_week: "last" } : {}),
    };
    attempt.current = nextAttempt(attempt.current, JSON.stringify(body));
    const r = await postJson(`/api/learners/${learnerId}/assignments/${assignmentId}/submissions`, { client_id: attempt.current.id, ...body });
    setBusy(null);
    if (!r.ok) return setError(practiceErrorText(codeOf(r), who));
    attempt.current = null;
    uploaded.current = new Map();
    setItems([]);
    setLink("");
    router.refresh();
    onDone?.();
  }

  const pill = (on: boolean) =>
    `min-h-11 rounded-full border px-4 text-base ${on ? "border-2 border-accent bg-[#e3ece8] font-semibold text-[#1d4136]" : "border-line bg-white text-ink"}`;
  const prefix = `submit-${assignmentId}`;
  // A link has a "Hint" button; a PDF has hints or an answer key.
  const hintQuestion = kind === "link" ? practiceStudent.hintQ : submitScreenCopy.hintQ;

  return (
    <form onSubmit={send} className="flex flex-col gap-4 border-t border-line pt-4" data-testid={prefix}>
      {kind === "link" ? <b className="font-semibold">{practiceStudent.sendTitle}</b> : null}
      <ImagePicker
        items={items}
        onChange={setItems}
        onError={setError}
        allowPdf={kind === "pdf"}
        chooseLabel={kind === "link" ? practiceStudent.chooseImage : practiceStudent.chooseFiles}
        help={
          kind === "link" ? (
            <>
              <span className="font-semibold">{practiceStudent.addImage}</span>
              <br />
              {practiceStudent.pasteHelp}
              <br />
              <span className="text-sm text-muted">{practiceStudent.cropHelp}</span>
            </>
          ) : (
            practiceStudent.pdfSendTitle
          )
        }
        testId={`${prefix}-picker`}
        max={maxFiles}
      />
      {kind === "link" ? (
        <label className="flex flex-col gap-1 text-base">
          {practiceStudent.linkOptional}
          <input
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={practiceStudent.linkPlaceholder}
            data-testid={`${prefix}-link`}
            className="min-h-11 rounded-lg border border-line px-3"
          />
        </label>
      ) : null}
      <div role="group" aria-label={practiceStudent.firstQ} className="flex flex-col gap-2">
        <span>{practiceStudent.firstQ}</span>
        <span className="text-sm text-muted">{practiceStudent.firstUnknownHelp}</span>
        <span className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={first === true} onClick={() => setFirst(true)} data-testid={`${prefix}-first-yes`} className={pill(first === true)}>
            {practiceStudent.firstYes}
          </button>
          <button type="button" aria-pressed={first === false} onClick={() => setFirst(false)} data-testid={`${prefix}-first-no`} className={pill(first === false)}>
            {practiceStudent.firstNo}
          </button>
        </span>
      </div>
      <div role="group" aria-label={hintQuestion} className="flex flex-col gap-2">
        <span>{hintQuestion}</span>
        <span className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={hint === true} onClick={() => setHint(true)} data-testid={`${prefix}-hint-yes`} className={pill(hint === true)}>
            {practiceStudent.hintYes}
          </button>
          <button type="button" aria-pressed={hint === false} onClick={() => setHint(false)} data-testid={`${prefix}-hint-no`} className={pill(hint === false)}>
            {practiceStudent.hintNo}
          </button>
          <button type="button" aria-pressed={hint === null} onClick={() => setHint(null)} data-testid={`${prefix}-hint-unknown`} className={pill(hint === null)}>
            {practiceStudent.hintUnknown}
          </button>
        </span>
      </div>
      {canPickWeek ? (
        <div role="group" aria-label={workWeekCopy.label} className="flex flex-col gap-2" data-testid={`${prefix}-week`}>
          <span>{workWeekCopy.label}</span>
          <span className="text-sm text-muted">{workWeekCopy.help}</span>
          <span className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!lastWeek} onClick={() => setLastWeek(false)} data-testid={`${prefix}-week-this`} className={pill(!lastWeek)}>
              {workWeekCopy.this}
            </button>
            <button type="button" aria-pressed={lastWeek} onClick={() => setLastWeek(true)} data-testid={`${prefix}-week-last`} className={pill(lastWeek)}>
              {workWeekCopy.last}
            </button>
          </span>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700" data-testid={`${prefix}-error`}>
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy !== null}
        data-testid={`${prefix}-send`}
        className="min-h-12 self-start rounded-xl bg-accent px-6 text-base font-semibold text-white disabled:opacity-60"
      >
        {busy === "upload" ? practiceStudent.uploading : busy === "send" ? practiceStudent.sending : kind === "link" ? practiceStudent.send : practiceStudent.pdfSend}
      </button>
    </form>
  );
}
