"use client";

import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { blockImplicitSubmit } from "@/lib/forms/enter";
import { PdfPagePicker, type PdfPick } from "@/components/ui/PdfPagePicker";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { UnitPicker } from "@/components/curriculum/UnitPicker";
import { TagChips } from "@/components/tutor/TagChips";
import { useTags } from "@/components/tutor/useTags";
import { assignPage, prefillCopy, sourceLabels, unitPickerCopy } from "@/lib/copy/vi";
import { autoTitle, emptyPicker, selectedUnits, stateFromCodes, type PickerState, type UnitChoice } from "@/lib/curriculum/unitPicker";
import { formatRange, type Prefill } from "@/lib/prefill";
import { codeOf, nextAttempt, practiceErrorText, uploadAll, type SendAttempt, type UploadCache } from "@/lib/practice/client";
import { detectLinkSource } from "@/lib/practice/link";
import { addDays } from "@/lib/inquiries/dates";
import type { SkillMapView } from "@/lib/skillmap/types";
import { prepareFile, type Prepared } from "@/lib/storage/clientUpload";
import { postJson } from "@/lib/tutorwork/client";
import type { FrameView, TagInfo } from "@/lib/tutorwork/types";

/**
 * "Giao bài luyện": a link (the app recognises the source) or a PDF (uploaded to the private bucket, the student downloads it).
 * The PDF goes straight to storage through a one-time link; this form then registers the assignment with the uploaded file.
 */
export function AssignForm({
  learnerId,
  alias,
  tags: initialTags,
  frames,
  today,
  map,
  prefill,
  unitChoices = [],
  fixedKind,
}: {
  learnerId: string;
  alias: string;
  tags: TagInfo[];
  frames: FrameView[];
  today: string;
  map: SkillMapView;
  /** From a Review / Progress Test row of the curriculum: the name of the bài, the pages in the book, the Units it revises. */
  prefill?: Prefill;
  /** Units of the approved curricula (none = the form keeps its old shape: only the manual items). */
  unitChoices?: UnitChoice[];
  /** "Giao bằng link" / "PDF để con tải về" pages fix the kind (no switch button). Without it the form keeps its two-button switch. */
  fixedKind?: "link" | "pdf";
}) {
  const router = useRouter();
  const { tags, add, setGroup } = useTags(learnerId, initialTags);
  const [pickedKind, setKind] = useState<"link" | "pdf">("link");
  // A fixed kind always wins, even when the page soft-navigates between ways and this component is reused.
  const kind = fixedKind ?? pickedKind;
  const [url, setUrl] = useState("");
  const [pdf, setPdf] = useState<Prepared | null>(null);
  const [answer, setAnswer] = useState<Prepared | null>(null);
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [units, setUnits] = useState<PickerState>(() => stateFromCodes(unitChoices, prefill?.units ?? []));
  // Once the tutor edits the name by hand (or it came prefilled from the book link), ticking Units no longer rewrites it.
  const [titleTouched, setTitleTouched] = useState(Boolean(prefill?.title));
  const byUnit = unitChoices.length > 0;
  function changeUnits(next: PickerState) {
    setUnits(next);
    // Auto-filled name follows the ticks, including back to empty when everything is unticked; a typed or prefilled name is never touched.
    if (!titleTouched) setTitle(autoTitle(unitChoices, next));
  }
  const [due, setDue] = useState("");
  const [frameId, setFrameId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState<"upload" | "save" | null>(null);
  const [round, setRound] = useState(0);
  const { state: saveState, track } = useSaveStatus({ kind, url, title, picked, units: units.units.map((u) => `${u.curriculumId}/${u.code}`), due, frameId, pdf: pdf?.name ?? null, answer: answer?.name ?? null }, { resetKey: round });
  const attempt = useRef<SendAttempt | null>(null);
  const uploaded = useRef<UploadCache>(new Map());

  const tagLabels = Object.fromEntries(tags.map((t) => [t.key, t.label]));
  const source = kind === "link" && url.trim() ? detectLinkSource(url) : null;

  const [pdfPending, setPdfPending] = useState(false);
  async function pick(sel: PdfPick, set: (p: Prepared | null) => void) {
    setError(null);
    const file = sel.file;
    if (!file) return set(null);
    const r = await prepareFile(file);
    if (!r.ok) return setError(practiceErrorText(r.reason === "type" ? "file_type" : r.reason === "too_big" ? "file_too_big" : "unreadable", "staff"));
    set(r.file);
  }

  function reset() {
    setRound((n) => n + 1);
    setUrl("");
    setPdf(null);
    setAnswer(null);
    setTitle("");
    setPicked([]);
    setUnits(emptyPicker);
    setTitleTouched(false);
    setDue("");
    setFrameId("");
    setError(null);
    setDone(false);
    attempt.current = null;
    uploaded.current = new Map();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError(assignPage.needTitle);
    if (kind === "link" && !source) return setError(assignPage.needLink);
    if (kind === "pdf" && !pdf) return setError(assignPage.needPdf);
    if (kind === "pdf" && pdf?.mime !== "application/pdf") return setError(practiceErrorText("file_type", "staff"));

    const body: Record<string, unknown> = {
      kind,
      title: title.trim(),
      tags: picked,
      units: selectedUnits(unitChoices, units),
      due_on: due || null,
      frame_id: frameId || null,
    };
    if (kind === "link") {
      body.url = url.trim();
    } else {
      setBusy("upload");
      // Files already uploaded on an earlier try stay in storage (see uploaded): only the missing ones are sent now.
      const main = await uploadAll([pdf as Prepared], `/api/learners/${learnerId}/files`, { purpose: "assignment_pdf" }, uploaded.current);
      if (!main.ok) {
        setBusy(null);
        return setError(practiceErrorText(main.error, "staff"));
      }
      body.file = main.files[0];
      if (answer) {
        const key = await uploadAll([answer], `/api/learners/${learnerId}/files`, { purpose: "answer_key" }, uploaded.current);
        if (!key.ok) {
          setBusy(null);
          return setError(practiceErrorText(key.error, "staff"));
        }
        body.answer_file = key.files[0];
      }
    }
    // A retry of the same work (a lost answer) reuses the client id; changing anything makes it new work.
    attempt.current = nextAttempt(attempt.current, JSON.stringify(body));
    body.client_id = attempt.current.id;
    setBusy("save");
    const r = await track(() => postJson(`/api/learners/${learnerId}/assignments`, body));
    setBusy(null);
    if (!r.ok) return setError(practiceErrorText(codeOf(r), "staff"));
    setDone(true);
    router.refresh();
  }

  const field = "min-h-11 rounded-lg border border-line bg-white px-3";
  const seg = (on: boolean) =>
    `min-h-11 px-4 text-sm ${on ? "bg-accent font-semibold text-white" : "bg-white text-ink"}`;

  return (
    <form onSubmit={submit} onKeyDown={blockImplicitSubmit} className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-5" data-testid="assign-form">
      <fieldset disabled={done} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
        {fixedKind ? null : (
        <div role="group" aria-label={assignPage.kind} className="flex flex-col gap-1.5 text-sm font-medium">
          {assignPage.kind}
          <span className="flex self-start overflow-hidden rounded-xl border border-line">
            <button type="button" aria-pressed={kind === "link"} data-testid="kind-link" onClick={() => setKind("link")} className={seg(kind === "link")}>
              {assignPage.kindLink}
            </button>
            <button type="button" aria-pressed={kind === "pdf"} data-testid="kind-pdf" onClick={() => setKind("pdf")} className={seg(kind === "pdf")}>
              {assignPage.kindPdf}
            </button>
          </span>
        </div>
        )}
        {prefill && (prefill.pages || prefill.units.length > 0) ? (
          <p className="rounded-xl bg-[#eef3ef] px-3.5 py-2 text-sm" data-testid="assign-prefill">
            {prefillCopy.fromBook} {prefill.pages ? prefillCopy.pages(prefill.pages) : ""}
            {prefill.pages && prefill.units.length > 0 ? unitPickerCopy.sep : ""}
            {prefill.units.length > 0 ? prefillCopy.units(formatRange(prefill.units)) : ""}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5" data-testid="assign-by-unit">
          <span className="text-sm font-medium">{unitPickerCopy.title}</span>
          <UnitPicker learnerId={learnerId} choices={unitChoices} state={units} onChange={changeUnits} tagLabels={tagLabels} />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {assignPage.titleLabel}
          <input
            type="text"
            maxLength={200}
            value={title}
            onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
            placeholder={assignPage.titlePlaceholder}
            data-testid="assign-title"
            className={`${field} text-base font-normal`}
          />
        </label>

        {kind === "link" ? (
          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {assignPage.linkLabel}
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={assignPage.linkPlaceholder}
                data-testid="assign-url"
                className={`${field} text-base font-normal`}
              />
            </label>
            <p className="text-sm text-muted" aria-live="polite" data-testid="assign-source">
              {url.trim() ? (source ? assignPage.sourceDetected(sourceLabels[source]) : assignPage.linkInvalid) : assignPage.linkHelp}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              {assignPage.pdfLabel}
              <PdfPagePicker flow="assignment" role="main" testId="pdf-input" nameTestId="pdf-chosen" accept="application/pdf" resetKey={round} onChange={(s) => { setPdfPending(s.pending); void pick(s, setPdf); }} ariaLabel={assignPage.pdfLabel} />
              <span className="text-sm font-normal text-muted">{assignPage.pdfHelp}</span>
            </div>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              {assignPage.answerLabel}
              <PdfPagePicker flow="assignment" role="other" testId="answer-input" nameTestId="answer-chosen" accept="application/pdf,image/png,image/jpeg,image/webp" resetKey={round} onChange={(s) => void pick(s, setAnswer)} ariaLabel={assignPage.answerLabel} />
              <span className="text-sm font-normal text-muted">{assignPage.answerHelp}</span>
            </div>
          </div>
        )}

        {byUnit ? (
          <details className="rounded-xl border border-line px-3 py-2" data-testid="assign-extra-items">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
              {unitPickerCopy.moreItems}
              {picked.length > 0 ? ` (${picked.length})` : ""}
            </summary>
            <div className="flex flex-col gap-1.5 pb-2">
              <span className="text-sm font-medium">{assignPage.tagsLabelExtra}</span>
              <p className="text-sm text-muted">{assignPage.tagsHelp}</p>
              <TagChips tags={tags} map={map} selected={picked} onChange={setPicked} max={3} onAdd={add} onSetGroup={setGroup} testId="assign-tags" />
            </div>
          </details>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{assignPage.tagsLabel}</span>
            <p className="text-sm text-muted">{assignPage.tagsHelp}</p>
            <TagChips tags={tags} map={map} selected={picked} onChange={setPicked} max={3} onAdd={add} onSetGroup={setGroup} testId="assign-tags" />
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {assignPage.dueLabel}
            <input type="date" min={today} max={addDays(today, 365)} value={due} onChange={(e) => setDue(e.target.value)} data-testid="assign-due" className={`${field} font-normal`} />
          </label>
          {frames.length > 0 ? (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {assignPage.frameLabel}
              <select value={frameId} onChange={(e) => setFrameId(e.target.value)} data-testid="assign-frame" className={`${field} font-normal`}>
                <option value="">{assignPage.frameNone}</option>
                {frames.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <p className="text-sm text-muted">{assignPage.studentSends}</p>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-red-700" data-testid="assign-error">
          {error}
        </p>
      ) : null}
      {done ? (
        <div role="status" className="flex flex-wrap items-center gap-3 text-sm font-semibold text-accent" data-testid="assign-done">
          <span>{assignPage.done}</span>
          <button type="button" onClick={reset} className="min-h-11 rounded-lg border border-accent bg-white px-4 font-semibold text-accent" data-testid="assign-another">
            {assignPage.giveAnother}
          </button>
        </div>
      ) : null}
      <div>
        <SaveStatus state={saveState} />
        <button
          type="submit"
          disabled={busy !== null || done || pdfPending}
          data-testid="assign-submit"
          className="min-h-12 rounded-xl bg-accent px-6 text-base font-bold text-white disabled:opacity-60"
        >
          {busy === "upload" ? assignPage.uploading : busy === "save" ? assignPage.submitting : assignPage.submit(alias)}
        </button>
      </div>
    </form>
  );
}
