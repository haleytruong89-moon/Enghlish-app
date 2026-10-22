"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { revisionCopy, work } from "@/lib/copy/vi";
import { checkMarks, marksToSend } from "@/lib/revision/rules";
import { isUnchanged } from "@/lib/revision/text";
import { REASON_MAX, type MarkChoice, type MarkDraft, type MyRevisionView, type RevisionDraftContent } from "@/lib/revision/types";
import { ASSISTANCE_VALUES, type Assistance } from "@/lib/work/types";
import { baseRevisionOf, formatHm, wordsOf } from "@/lib/work/view";
import { ExcerptText } from "./ExcerptText";

const AUTOSAVE_MS = 5000;
type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * "Sửa bài" (spec §2 step 4): the praise, the numbered items (excerpts marked in the old text), the editor filled with the old text,
 * "Xem bài cũ", a mark per item (Đã sửa / Giữ nguyên + reason as the track requires), the help declaration. Autosaves like S4 (every ~5 s
 * and on blur). One client_submission_id per content; the reply is a receipt. Nothing here shows a score, a verdict or a skill code.
 */
export function RevisionForm({ revision }: { revision: MyRevisionView }) {
  const initial: RevisionDraftContent = revision.draft?.content ?? {};
  const [text, setText] = useState(initial.text ?? revision.oldText);
  const [marks, setMarks] = useState<Record<string, MarkDraft>>(initial.marks ?? {});
  const [pasted, setPasted] = useState(initial.pasted ?? false);
  const [assist, setAssist] = useState<Assistance[]>(initial.assistance ?? []);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(revision.draft?.updatedAt ?? null);
  const [otherTab, setOtherTab] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ submittedAt: string } | null>(null);

  const dirty = useRef(false);
  const closed = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);
  const base = useRef<number>(baseRevisionOf(revision.draft));
  const pending = useRef<{ id: string; sig: string } | null>(null);
  const contentRef = useRef<RevisionDraftContent>({});
  useEffect(() => {
    contentRef.current = { text, marks, pasted, assistance: assist };
  });

  function touch() {
    dirty.current = true;
    setProblem(null);
  }
  function setMark(n: number, patch: { choice?: MarkChoice; reason?: string }) {
    touch();
    setMarks((m) => ({ ...m, [String(n)]: { ...m[String(n)], ...patch } }));
  }

  async function saveNow(): Promise<void> {
    if (closed.current) return;
    if (inflight.current) await inflight.current;
    if (!dirty.current || closed.current) return;
    const snapshot = contentRef.current;
    dirty.current = false;
    const run = (async () => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/student/revisions/${revision.activityId}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: snapshot, base_revision: base.current }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { draft: { revision: number; savedAt: string; otherTabChanged: boolean } };
        base.current = json.draft.revision;
        setSavedAt(json.draft.savedAt);
        setOtherTab(json.draft.otherTabChanged);
        setSaveState("saved");
      } catch {
        dirty.current = true;
        setSaveState("error");
      }
    })();
    inflight.current = run;
    await run;
    if (inflight.current === run) inflight.current = null;
  }
  const saveRef = useRef(saveNow);
  useEffect(() => {
    saveRef.current = saveNow;
  });
  useEffect(() => {
    const timer = setInterval(() => void saveRef.current(), AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, []);

  function toggleHelp(value: Assistance, on: boolean) {
    touch();
    setAssist((prev) => (!on ? prev.filter((v) => v !== value) : value === "none" ? ["none"] : [...prev.filter((v) => v !== "none"), value]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || receipt) return;
    if (text.trim() === "") return setProblem(revisionCopy.problems.need_text ?? null);
    const p = checkMarks(revision.items, marks, revision.reasonRequired, isUnchanged(revision.oldText, text));
    if (p) return setProblem(revisionCopy.problems[p] ?? null);
    if (assist.length === 0) return setProblem(work.needHelp);
    setBusy(true);
    setProblem(null);
    if (inflight.current) await inflight.current;
    const body = { text, marks: marksToSend(revision.items, marks), assistance: assist, provenance: pasted ? "pasted" : "in_app" };
    const sig = JSON.stringify(body);
    if (!pending.current || pending.current.sig !== sig) pending.current = { id: crypto.randomUUID(), sig };
    try {
      const res = await fetch(`/api/student/revisions/${revision.activityId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, client_submission_id: pending.current.id }),
      });
      if (res.status === 409) {
        setProblem(revisionCopy.submitConflict);
        pending.current = null;
        return;
      }
      if (res.status === 400) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setProblem((j.error && revisionCopy.problems[j.error]) || revisionCopy.submitError);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { receipt: { submittedAt: string } };
      closed.current = true;
      dirty.current = false;
      pending.current = null;
      setReceipt(json.receipt);
    } catch {
      setProblem(revisionCopy.submitError);
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <section aria-live="polite" data-testid="revision-receipt" className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
        <h2 role="status" className="text-xl font-bold text-accent">
          {revisionCopy.receiptTitle}
        </h2>
        <p className="text-[15px]">{revisionCopy.receiptLine}</p>
        <Link href="/" className="flex min-h-12 items-center self-start rounded-xl bg-accent px-5 text-base font-bold text-white">
          {work.homeLink}
        </Link>
      </section>
    );
  }

  const savedLine = saveState === "saving" ? work.saving : saveState === "error" ? work.notSaved : savedAt ? work.savedAt(formatHm(savedAt)) : "";

  return (
    <form
      onSubmit={submit}
      onBlur={() => void saveNow()}
      onPasteCapture={() => {
        setPasted(true);
        touch();
      }}
      className="flex flex-col gap-3.5"
      data-testid="revision-form"
      noValidate
    >
      {revision.round > 1 ? <p className="text-sm font-semibold text-[#6B4600]">{revisionCopy.secondRound}</p> : null}

      <section aria-labelledby="praise" className="rounded-2xl bg-[#E3ECE8] p-4 text-[#1F4439]" data-testid="revision-praise">
        <h2 id="praise" className="text-sm font-semibold">
          {revisionCopy.praiseTitle}
        </h2>
        <p className="text-[15px]">{revision.praise}</p>
      </section>

      <section aria-labelledby="items" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
        <h2 id="items" className="text-sm font-semibold text-muted">
          {revisionCopy.itemsTitle}
        </h2>
        <ol className="flex flex-col gap-3">
          {revision.items.map((it) => {
            const m = marks[String(it.n)] ?? {};
            return (
              <li key={it.n} className="flex flex-col gap-2" data-testid={`revision-item-${it.n}`}>
                <p className="text-[15px]">
                  <b>{revisionCopy.itemLabel(it.n)}.</b> {it.text}
                </p>
                {it.excerpt ? (
                  <p className="text-sm text-muted">
                    {revisionCopy.inYourText} <span lang="en" className="rounded bg-[#FBF1DC] px-1 text-[#3D2A00] underline">{it.excerpt}</span>
                  </p>
                ) : null}
                <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
                  <legend className="sr-only">{revisionCopy.marksTitle}</legend>
                  {(["changed", "kept"] as const).map((c) => (
                    <label key={c} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-[15px] has-[:checked]:border-accent has-[:checked]:bg-[#E3ECE8]">
                      <input type="radio" name={`mark-${it.n}`} checked={m.choice === c} onChange={() => setMark(it.n, { choice: c })}
                        data-testid={`revision-mark-${it.n}-${c}`} className="h-5 w-5 accent-[#2B5D4F]" />
                      {c === "changed" ? revisionCopy.changed : revisionCopy.kept}
                    </label>
                  ))}
                </fieldset>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">{revisionCopy.reasonLabel(revision.reasonRequired)}</span>
                  <input type="text" maxLength={REASON_MAX} value={m.reason ?? ""} placeholder={revisionCopy.reasonHint}
                    onChange={(e) => setMark(it.n, { reason: e.target.value })} data-testid={`revision-reason-${it.n}`}
                    className="min-h-11 rounded-lg border border-line bg-white px-3" />
                </label>
              </li>
            );
          })}
        </ol>
      </section>

      <details className="rounded-2xl border border-line bg-white p-4" data-testid="revision-old">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">{revisionCopy.showOld}</summary>
        <ExcerptText text={revision.oldText} items={revision.items} />
      </details>

      <section aria-labelledby="edit" className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
        <h2 id="edit" className="text-sm font-semibold text-muted">
          {revisionCopy.editorTitle}
        </h2>
        <textarea aria-label={revisionCopy.editorLabel} rows={10} value={text} maxLength={20000} lang="en"
          onChange={(e) => { touch(); setText(e.target.value); }} data-testid="revision-editor"
          className="min-h-48 rounded-lg border border-line bg-white px-3 py-2 text-base leading-relaxed" />
        <span className="text-[13px] text-muted">{work.wordCount(wordsOf(text))}</span>
      </section>

      <fieldset data-testid="revision-help" className="m-0 flex flex-col gap-1 rounded-2xl border border-line bg-white px-4 py-3">
        <legend className="px-1 text-sm font-semibold text-muted">{work.helpTitle}</legend>
        <p className="mb-1 text-[13px] leading-snug text-muted">{work.helpHint}</p>
        {ASSISTANCE_VALUES.map((v) => (
          <label key={v} className="flex min-h-11 items-center gap-2.5 text-sm">
            <input type="checkbox" checked={assist.includes(v)} onChange={(e) => toggleHelp(v, e.target.checked)} className="h-[22px] w-[22px] accent-[#2B5D4F]" />
            {work.help[v]}
          </label>
        ))}
        {pasted ? <p className="text-[13px] text-muted">{work.pastedNote}</p> : null}
      </fieldset>

      {problem ? (
        <p role="alert" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]" data-testid="revision-problem">
          {problem}
        </p>
      ) : null}
      {otherTab ? (
        <p role="status" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {work.otherTab}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <button type="submit" disabled={busy} data-testid="revision-submit" className="min-h-[52px] rounded-[14px] bg-accent text-base font-bold text-white disabled:opacity-60">
          {busy ? revisionCopy.submitting : revisionCopy.submit}
        </button>
        <span className="text-center text-xs text-muted" aria-live="polite" data-testid="revision-save-status">
          {savedLine}
        </span>
      </div>
    </form>
  );
}
