"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { studioFeedbackCopy, submissionFeedbackCopy } from "@/lib/copy/vi";
import { MAX_FEEDBACK_ITEM, MAX_FEEDBACK_PRAISE } from "@/lib/practice/schemas";
import type { SubmissionFeedbackView } from "@/lib/practice/types";
import { formatWhen } from "@/lib/review/format";
import { hasScoreWords } from "@/lib/revision/scoreWords";
import { postJson, failText } from "@/lib/tutorwork/client";

/** What a form can say about a draft before it is sent (the server and the database check the same rules again). */
const copy = submissionFeedbackCopy;

export function checkSubmissionFeedback(praise: string, items: string[]): keyof typeof copy.errors | null {
  const p = praise.trim();
  const texts = items.map((t) => t.trim()).filter((t) => t !== "");
  if (p === "" && texts.length === 0) return "empty_feedback";
  if (p.length > MAX_FEEDBACK_PRAISE) return "praise_too_long";
  if (texts.some((t) => t.length > MAX_FEEDBACK_ITEM)) return "item_too_long";
  if (texts.length > 3) return "items_invalid";
  if (hasScoreWords(p) || texts.some(hasScoreWords)) return "score_words";
  return null;
}

const box = "min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-[15px]";

function Shown({ f }: { f: SubmissionFeedbackView }) {
  return (
    <div className="flex flex-col gap-2" data-testid={`sfb-shown-${f.id}`}>
      <p className="text-xs text-muted">{copy.byLine(f.authorName ?? copy.roles[f.authorRole] ?? "", formatWhen(f.createdAt))}</p>
      {f.praise ? (
        <p className="rounded-lg bg-[#E3ECE8] px-3 py-2 text-[#1F4439]" data-testid="sfb-shown-praise">
          <b>{copy.praiseShown}:</b> {f.praise}
        </p>
      ) : null}
      {f.items.length > 0 ? (
        <ol className="flex flex-col gap-1 rounded-lg bg-[#FBF1DC] px-3 py-2 text-sm text-[#6B4600]">
          {f.items.map((it) => (
            <li key={it.n} data-testid={`sfb-shown-item-${it.n}`}>
              <b>{copy.fixShown} {it.n}.</b> {it.text}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/**
 * "Góp ý cho con" on a paper / link submission (W4c1; the child's tutor OR a parent): one praise and up to 3 things to fix, no scores. The child sees it
 * in "Đã xem" at once; it never asks the child to send again. After sending: the note, "Sửa góp ý" for the author, older versions.
 */
export function SubmissionFeedbackForm({
  learnerId,
  assignmentId,
  submissionId,
  feedback,
  viewerMemberId,
  studio = false,
}: {
  learnerId: string;
  /** For a Studio test (studio): the step (activity) id; it only names the test ids of the form. */
  assignmentId: string;
  /** For a Studio test (studio): the lần làm (attempt) id. */
  submissionId: string;
  /** 0037: the form on one lần làm of a Studio test (another endpoint, another intro). */
  studio?: boolean;
  /** All versions of the feedback of this assignment, newest first. */
  feedback: SubmissionFeedbackView[];
  viewerMemberId: string;
}) {
  const router = useRouter();
  const intro = studio ? studioFeedbackCopy.intro : copy.intro;
  const errors: Record<string, string> = studio ? { ...copy.errors, ...studioFeedbackCopy.errors } : copy.errors;
  const endpoint = studio
    ? `/api/learners/${learnerId}/studio/attempts/${submissionId}/feedback`
    : `/api/learners/${learnerId}/assignments/${assignmentId}/submissions/${submissionId}/feedback`;
  // Only notes on the CURRENT submission can be edited / are "live"; older ones belong to a submission that was replaced.
  const live = feedback.find((f) => f.live && f.submissionId === submissionId) ?? null;
  const history = feedback.filter((f) => f.submissionId === submissionId && f !== live);
  const [open, setOpen] = useState(false);
  const [praise, setPraise] = useState("");
  const [items, setItems] = useState<string[]>([""]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());
  const editing = live !== null;

  function start() {
    setPraise(live?.praise ?? "");
    setItems(live && live.items.length > 0 ? live.items.map((i) => i.text) : [""]);
    clientId.current = crypto.randomUUID();
    setProblem(null);
    setOpen(true);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const p = checkSubmissionFeedback(praise, items);
    if (p) return setProblem(errors[p] ?? null);
    setBusy(true);
    setProblem(null);
    const r = await postJson(endpoint, {
      client_id: clientId.current,
      ...(praise.trim() ? { praise: praise.trim() } : {}),
      items: items.map((t) => t.trim()).filter((t) => t !== "").map((text) => ({ text })),
      ...(editing && live ? { supersedes_id: live.id } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 409) clientId.current = crypto.randomUUID();
      return setProblem(errors[r.error] ?? failText(r));
    }
    clientId.current = crypto.randomUUID();
    setOpen(false);
    router.refresh();
  }

  return (
    <section aria-label={copy.title} className="mt-2 flex flex-col gap-2 rounded-xl bg-paper p-3" data-testid={`sfb-${assignmentId}`}>
      <h3 className="text-sm font-semibold">{live ? copy.liveTitle : copy.title}</h3>
      {live && !open ? (
        <>
          <Shown f={live} />
          {live.authorMember === viewerMemberId ? (
            <button type="button" onClick={start} data-testid={`sfb-edit-${assignmentId}`} className="min-h-11 self-start rounded-lg border border-line bg-white px-4 text-sm font-semibold">
              {copy.edit}
            </button>
          ) : null}
          {history.length > 0 ? (
            <details className="text-sm" data-testid={`sfb-history-${assignmentId}`}>
              <summary className="min-h-11 cursor-pointer py-2">{copy.history(history.length)}</summary>
              {history.map((h) => (
                <div key={h.id} className="mt-2 border-t border-line pt-2">
                  <Shown f={h} />
                </div>
              ))}
            </details>
          ) : null}
        </>
      ) : null}
      {!live && !open ? (
        <button type="button" onClick={start} data-testid={`sfb-open-${assignmentId}`} className="min-h-11 self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent">
          {copy.open}
        </button>
      ) : null}
      {open ? (
        <form onSubmit={send} className="flex flex-col gap-3" data-testid={`sfb-form-${assignmentId}`}>
          <p className="text-sm text-muted">{intro}</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{copy.praiseLabel}</span>
            <span className="text-muted">{copy.praiseHint}</span>
            <textarea rows={2} maxLength={MAX_FEEDBACK_PRAISE} value={praise} onChange={(e) => setPraise(e.target.value)} data-testid="sfb-praise" className={box} />
          </label>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="text-sm font-semibold">{copy.fixLabel}</legend>
            {items.map((t, i) => (
              <div key={i} className="flex flex-col gap-1">
                <textarea
                  aria-label={copy.itemLabel(i + 1)}
                  rows={2}
                  maxLength={MAX_FEEDBACK_ITEM}
                  placeholder={copy.itemHint}
                  value={t}
                  onChange={(e) => setItems(items.map((x, k) => (k === i ? e.target.value : x)))}
                  data-testid={`sfb-item-${i + 1}`}
                  className={box}
                />
                {items.length > 1 ? (
                  <button type="button" onClick={() => setItems(items.filter((_, k) => k !== i))} className="min-h-11 self-start text-sm text-accent underline">
                    {copy.removeItem}
                  </button>
                ) : null}
              </div>
            ))}
            {items.length < 3 ? (
              <button type="button" onClick={() => setItems([...items, ""])} data-testid="sfb-add" className="min-h-11 self-start rounded-lg border border-line bg-white px-4 text-sm font-semibold">
                {copy.addItem}
              </button>
            ) : null}
          </fieldset>
          {problem ? (
            <p role="alert" className="text-sm text-red-700" data-testid="sfb-error">
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} data-testid="sfb-send" className="min-h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? copy.sending : editing ? copy.sendEdit : copy.send}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm">
              {copy.cancel}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
