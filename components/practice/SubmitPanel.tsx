"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { practiceStudent } from "@/lib/copy/vi";
import { codeOf, nextAttempt, practiceErrorText, uploadAll, type SendAttempt, type UploadCache } from "@/lib/practice/client";
import { parseHttpsUrl } from "@/lib/practice/link";
import { postJson } from "@/lib/tutorwork/client";
import { ImagePicker, type PickedItem } from "./ImagePicker";

type Props = {
  /** "student": the child sends their own work. "staff": a tutor / parent sends it on the child's behalf ("nộp thay"). */
  variant: "student" | "staff";
  learnerId?: string;
  assignmentId: string;
  kind: "link" | "pdf";
  /** When the student sends again, start from what they said before. */
  initial?: { attempt: "first" | "retry"; usedHint: boolean | null };
  onDone?: () => void;
};

/**
 * The "send" form of one assignment: pictures (paste or pick), an optional link, and the two taps - first time? pressed Hint?
 * Uploads each picture straight to storage through a one-time link, then registers the work in one call.
 */
export function SubmitPanel({ variant, learnerId, assignmentId, kind, initial, onDone }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<PickedItem[]>([]);
  const [link, setLink] = useState("");
  const [first, setFirst] = useState(initial ? initial.attempt === "first" : true);
  const [hint, setHint] = useState(initial?.usedHint ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "send" | null>(null);
  // Kept across retries: a lost answer is retried with the same id and only the files that failed are sent again.
  const attempt = useRef<SendAttempt | null>(null);
  const uploaded = useRef<UploadCache>(new Map());
  const who = variant;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const linkClean = link.trim();
    if (kind === "link" && linkClean && !parseHttpsUrl(linkClean)) return setError(practiceErrorText("invalid_link", who));
    if (items.length === 0 && !linkClean) return setError(practiceStudent.needImage);

    setBusy("upload");
    const files = items.map((i) => i.file);
    const up =
      variant === "student"
        ? await uploadAll(files, "/api/student/files", { assignment_id: assignmentId }, uploaded.current)
        : await uploadAll(files, `/api/learners/${learnerId}/files`, { purpose: "submission", assignment_id: assignmentId }, uploaded.current);
    if (!up.ok) {
      setBusy(null);
      return setError(practiceErrorText(up.error, who));
    }
    setBusy("send");
    const body = {
      attempt: first ? "first" : "retry",
      // The Hint question exists only for link assignments; a PDF sends null.
      used_hint: kind === "link" ? hint : null,
      link_url: kind === "link" && linkClean ? linkClean : null,
      files: up.files,
    };
    attempt.current = nextAttempt(attempt.current, JSON.stringify(body));
    const common = { client_id: attempt.current.id, ...body };
    const r =
      variant === "student"
        ? await postJson("/api/student/submissions", { assignment_id: assignmentId, ...common })
        : await postJson(`/api/learners/${learnerId}/assignments/${assignmentId}/submissions`, common);
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
        <span className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={first} onClick={() => setFirst(true)} data-testid={`${prefix}-first-yes`} className={pill(first)}>
            {practiceStudent.firstYes}
          </button>
          <button type="button" aria-pressed={!first} onClick={() => setFirst(false)} data-testid={`${prefix}-first-no`} className={pill(!first)}>
            {practiceStudent.firstNo}
          </button>
        </span>
      </div>
      {kind === "link" ? (
        <div role="group" aria-label={practiceStudent.hintQ} className="flex flex-col gap-2">
          <span>{practiceStudent.hintQ}</span>
          <span className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={hint} onClick={() => setHint(true)} data-testid={`${prefix}-hint-yes`} className={pill(hint)}>
              {practiceStudent.hintYes}
            </button>
            <button type="button" aria-pressed={!hint} onClick={() => setHint(false)} data-testid={`${prefix}-hint-no`} className={pill(!hint)}>
              {practiceStudent.hintNo}
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
