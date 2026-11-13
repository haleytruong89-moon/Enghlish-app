"use client";

import { PageGuidance, PdfPagePicker, pagesBlock, type PdfPick } from "@/components/ui/PdfPagePicker";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { GateReason } from "@/lib/ai/cap";
import { importCopy } from "@/lib/copy/vi";
import { importErrorText, sendJson, sha256Hex, uploadImportFile } from "@/lib/import/client";
import { SUPPORT_LEVELS, IMPORT_LIMITS, type SupportLevel } from "@/lib/import/types";
import { todayVn } from "@/lib/inquiries/dates";

const field = "min-h-11 rounded-lg border border-line px-3 font-normal";

/**
 * "Nạp bài đã làm": name of the test, the work (photo / PDF), the key, the real day and the support level, then "Cho AI đọc". The files go straight to
 * storage; the server checks them again. Nothing is created when the AI cannot be used (the AI is the only reader). On success the tutor goes to the
 * review screen, which waits for the AI.
 */
export function ImportForm({ learnerId, aiAllowed, aiReason }: { learnerId: string; aiAllowed: boolean; aiReason: GateReason | null }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [workPick, setWorkPick] = useState<PdfPick>({ file: null, pages: null, pending: false });
  const [keyPick, setKeyPick] = useState<PdfPick>({ file: null, pages: null, pending: false });
  const work = workPick.file;
  const key = keyPick.file;
  const pending = workPick.pending || keyPick.pending;
  const tooLong = pagesBlock("import", workPick.pages, keyPick.pages, false);
  const [takenOn, setTakenOn] = useState("");
  const [support, setSupport] = useState<SupportLevel | "">("");
  const [allowOther, setAllowOther] = useState(false);
  const [dup, setDup] = useState(false);
  const [busy, setBusy] = useState<"upload" | "send" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const today = todayVn(new Date());
  const ready = title.trim().length > 0 && work !== null && key !== null && takenOn !== "" && support !== "";

  async function start(manual: boolean) {
    if (!ready || !work || !key) return setProblem(importCopy.missing);
    if (takenOn > today) return setProblem(importCopy.dateFuture);
    setProblem(null);
    setBusy("upload");
    const [w, k, hash] = await Promise.all([uploadImportFile(learnerId, "import_work", work), uploadImportFile(learnerId, "import_key", key), sha256Hex(work)]);
    if (!w.ok) {
      setBusy(null);
      return setProblem(importErrorText(w.error));
    }
    if (!k.ok) {
      setBusy(null);
      return setProblem(importErrorText(k.error));
    }
    setBusy("send");
    const r = await sendJson<{ import_id: string }>(`/api/learners/${learnerId}/imports`, "POST", {
      title: title.trim(), work_file: w.file, key_file: k.file, taken_on: takenOn, support_level: support, source_hash: hash, allow_other: allowOther, manual, client_id: clientId.current,
    });
    setBusy(null);
    if (!r.ok) {
      if (r.error === "duplicate_import") setDup(true);
      // A new client id for the next try: this one may already be bound to a refused request.
      clientId.current = crypto.randomUUID();
      return setProblem(importErrorText(r.error));
    }
    router.push(`/imports/${r.body.import_id}`);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate data-testid="import-form">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {importCopy.bookTitle}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={IMPORT_LIMITS.title} placeholder={importCopy.bookTitleHint} data-testid="import-title" className={field} />
      </label>
      <p className="rounded-xl bg-[#FBF1DC] px-3.5 py-2 text-sm text-[#6B4600]" data-testid="import-cover-note">
        {importCopy.coverNote}
      </p>
      <p className="text-sm text-muted" data-testid="import-photo-note">
        {importCopy.photoNote}
      </p>
      <div className="flex flex-col gap-1 text-sm font-semibold">
        {importCopy.workFile}
        <PdfPagePicker flow="import" role="main" testId="import-work" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" onChange={setWorkPick} ariaLabel={importCopy.workFile} />
      </div>
      <div className="flex flex-col gap-1 text-sm font-semibold">
        {importCopy.keyFile}
        <PdfPagePicker
          flow="import"
          role="other"
          testId="import-key"
          accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={setKeyPick}
          ariaLabel={importCopy.keyFile}
        />
      </div>
      <PageGuidance flow="import" main={workPick.pages} other={keyPick.pages} />
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {importCopy.takenOn}
        <input type="date" value={takenOn} max={today} onChange={(e) => setTakenOn(e.target.value)} data-testid="import-date" className={`${field} max-w-[14rem]`} />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">{importCopy.support}</legend>
        {SUPPORT_LEVELS.map((s) => (
          <label key={s} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="support" value={s} checked={support === s} onChange={() => setSupport(s)} data-testid={`import-support-${s}`} />
            {importCopy.supports[s]}
          </label>
        ))}
        <span className="text-xs text-muted">{importCopy.supportHint}</span>
      </fieldset>
      {dup ? (
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold" data-testid="import-dup-box">
          <input type="checkbox" checked={allowOther} onChange={(e) => setAllowOther(e.target.checked)} data-testid="import-allow-other" />
          {importCopy.dupOther}
        </label>
      ) : null}
      {!aiAllowed ? (
        <p role="status" data-testid="import-ai-unavailable" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {importCopy.errors[`ai_${aiReason ?? "off"}`] ?? importCopy.errors.ai_off}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" data-testid="import-problem" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy !== null || !aiAllowed || !ready || pending || tooLong} onClick={() => void start(false)} data-testid="import-start" className="min-h-12 rounded-xl bg-accent px-5 font-bold text-white disabled:opacity-60">
          {busy === "upload" ? importCopy.uploading : busy === "send" ? importCopy.starting : importCopy.create}
        </button>
        <button type="button" disabled={busy !== null || !ready || pending} onClick={() => void start(true)} data-testid="import-manual" className="min-h-12 rounded-xl border border-accent px-5 font-bold text-accent disabled:opacity-60">
          {importCopy.manual}
        </button>
      </div>
      <p className="text-xs text-muted">{importCopy.manualHint}</p>
    </form>
  );
}
