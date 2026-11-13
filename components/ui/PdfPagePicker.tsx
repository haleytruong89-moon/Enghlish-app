"use client";

import { useEffect, useRef, useState } from "react";
import { FilePicker } from "@/components/ui/FilePicker";
import { pdfPickCopy } from "@/lib/copy/vi";
import { cutPdf, pdfInfo } from "@/lib/pdf/cut";
import { BIG_SOURCE_BYTES, checkPages, type PdfFlow } from "@/lib/pdf/limits";
import { formatPages, parsePages } from "@/lib/pdf/pages";

/** What the form needs to know: the file to send (null until a long PDF has its pages chosen), how many pages it has, and whether a choice is still due. */
export type PdfPick = { file: File | null; pages: number | null; pending: boolean };

const OTHER_RECOMMEND = 3; // answer keys: 1–3 pages
const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/**
 * File picker that knows PDFs: it counts the pages in the browser (nothing is uploaded), and for a long PDF the person types the pages to send
 * ("1–3, 7"); the cut file is made in the browser too. A PDF within the recommended length is sent whole. Other files (Word, pictures) pass through.
 * `resetKey` clears the choice (a form that starts over).
 */
export function PdfPagePicker({
  flow,
  role,
  testId,
  nameTestId,
  accept,
  ariaLabel,
  onChange,
  disabled = false,
  resetKey = 0,
}: {
  flow: PdfFlow;
  role: "main" | "other";
  testId: string;
  nameTestId?: string;
  accept: string;
  ariaLabel: string;
  onChange: (pick: PdfPick) => void;
  disabled?: boolean;
  resetKey?: number;
}) {
  const [seen, setSeen] = useState(resetKey);
  const [src, setSrc] = useState<File | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [applied, setApplied] = useState<{ file: File; pages: number; text: string } | null>(null);
  const [plain, setPlain] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = useRef(0);

  if (seen !== resetKey) {
    setSeen(resetKey);
    setSrc(null);
    setCount(null);
    setText("");
    setApplied(null);
    setPlain(null);
    setError(null);
  }
  // A reset also cancels any read or cut still running.
  useEffect(() => {
    token.current += 1;
  }, [resetKey]);

  const report = (p: PdfPick) => onChange(p);

  async function pick(f: File | undefined) {
    if (!f) return;
    const mine = ++token.current;
    setError(null);
    setApplied(null);
    setPlain(null);
    setSrc(null);
    setCount(null);
    setText("");
    if (!isPdf(f)) {
      setPlain(f);
      return report({ file: f, pages: null, pending: false });
    }
    setBusy(true);
    // Until the file has been read the form must not send: mark the choice as still due.
    report({ file: null, pages: null, pending: true });
    const info = await pdfInfo(f);
    if (mine !== token.current) return;
    setBusy(false);
    if (!info.ok) {
      if (info.reason === "encrypted") {
        setError(pdfPickCopy.errors.encrypted);
        return report({ file: null, pages: null, pending: false });
      }
      // Not a PDF this browser can open: let the server judge the whole file, as before.
      setError(pdfPickCopy.errors.unreadable);
      setPlain(f);
      return report({ file: f, pages: null, pending: false });
    }
    setSrc(f);
    setCount(info.pageCount);
    const whole = flow === "assignment" || (role === "main" ? checkPages(flow, info.pageCount, 0).level === "ok" : info.pageCount <= OTHER_RECOMMEND);
    if (whole) {
      const all = formatPages(Array.from({ length: info.pageCount }, (_, i) => i));
      setText(all);
      setApplied({ file: f, pages: info.pageCount, text: all });
      return report({ file: f, pages: info.pageCount, pending: false });
    }
    report({ file: null, pages: null, pending: true });
  }

  async function use() {
    if (!src || count === null) return;
    const parsed = parsePages(text, count);
    if (!parsed.ok) {
      setError(parsed.reason === "range" ? pdfPickCopy.errors.range(count) : pdfPickCopy.errors[parsed.reason]);
      return;
    }
    setError(null);
    const label = formatPages(parsed.pages);
    const whole = parsed.pages.length === count;
    const mine = ++token.current;
    setBusy(true);
    try {
      const out = whole ? src : await cutPdf(src, parsed.pages, pdfPickCopy.cutName(src.name.replace(/\.pdf$/i, ""), label));
      if (mine !== token.current) return;
      setApplied({ file: out, pages: parsed.pages.length, text });
      report({ file: out, pages: parsed.pages.length, pending: false });
    } catch {
      if (mine === token.current) setError(pdfPickCopy.errors.cutFailed);
    } finally {
      if (mine === token.current) setBusy(false);
    }
  }

  function edit(next: string) {
    setText(next);
    if (applied && next !== applied.text) {
      setApplied(null);
      report({ file: null, pages: null, pending: true });
    }
  }

  const shown = applied?.file ?? plain;
  const pending = src !== null && applied === null;
  return (
    <div className="flex flex-col gap-2" data-testid={`${testId}-picker`}>
      <FilePicker testId={testId} nameTestId={nameTestId} accept={accept} name={shown?.name ?? src?.name ?? null} onPick={(f) => void pick(f)} ariaLabel={ariaLabel} disabled={disabled || busy} />
      {src && count !== null ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-[#fbfbf8] p-3 font-normal">
          <p className="text-sm" data-testid={`${testId}-info`}>
            {pdfPickCopy.info(count, mb(src.size))}
          </p>
          {src.size > BIG_SOURCE_BYTES ? <p className="text-xs text-muted">{pdfPickCopy.bigSource}</p> : null}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{pdfPickCopy.pagesLabel}</span>
              <input
                value={text}
                onChange={(e) => edit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void use();
                  }
                }}
                placeholder={pdfPickCopy.pagesHint}
                disabled={disabled || busy}
                data-testid={`${testId}-pages`}
                className="min-h-11 w-48 rounded-lg border border-line bg-white px-3"
              />
            </label>
            <button
              type="button"
              onClick={() => void use()}
              disabled={disabled || busy}
              data-testid={`${testId}-use`}
              className="min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-60"
            >
              {busy ? pdfPickCopy.cutting : pdfPickCopy.use}
            </button>
          </div>
          {applied ? (
            <p className="text-sm font-medium text-accent" data-testid={`${testId}-ready`} role="status">
              {pdfPickCopy.willSend(applied.pages, mb(applied.file.size))}
            </p>
          ) : pending ? (
            <p className="text-sm text-muted" data-testid={`${testId}-pending`}>
              {text.trim() === "" ? pdfPickCopy.needPick : pdfPickCopy.pendingChange}
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[#8A1C12]" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Guidance under the file pickers of an AI flow: always visible; turns amber when long, red (button must be off) when too long. */
export function PageGuidance({ flow, main, other, testId = "page-guidance" }: { flow: Exclude<PdfFlow, "assignment">; main: number | null; other: number | null; testId?: string }) {
  const check = main === null ? { level: "ok" as const } : checkPages(flow, main, other ?? 0);
  return (
    <div className="flex flex-col gap-2" data-testid={testId} data-level={check.level}>
      <p className="text-xs text-muted">{pdfPickCopy.guidance[flow]}</p>
      {check.level === "warn" ? (
        <p role="status" data-testid={`${testId}-warn`} className="rounded-xl bg-[#FBF1DC] px-3.5 py-2 text-sm text-[#6B4600]">
          {pdfPickCopy.warn[flow]}
        </p>
      ) : null}
      {check.level === "block" ? (
        <p role="alert" data-testid={`${testId}-block`} className="rounded-xl border border-[#E9C46A] bg-[#FBF1DC] px-3.5 py-2 text-sm font-semibold text-[#8A1C12]">
          {pdfPickCopy.block[flow]}
        </p>
      ) : null}
    </div>
  );
}

/** True when the form must not send: a long PDF still waits for its pages, or the chosen pages are too many. */
export function pagesBlock(flow: Exclude<PdfFlow, "assignment">, main: number | null, other: number | null, pending: boolean): boolean {
  return pending || (main !== null && checkPages(flow, main, other ?? 0).level === "block");
}
