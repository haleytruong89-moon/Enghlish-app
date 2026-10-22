"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { externalCopy } from "@/lib/copy/vi";
import { EXAMS, NOTE_MAX, SCORE_MAX, type Exam } from "@/lib/levels/types";
import { practiceErrorText, uploadAll, type UploadCache } from "@/lib/practice/client";
import type { DomainKey } from "@/lib/skillmap/types";
import { prepareFile, type Prepared } from "@/lib/storage/clientUpload";
import { failText, postJson } from "@/lib/tutorwork/client";

/**
 * "Thêm kết quả thi ngoài" (D9): exam, date, score (free text), related domains, note, an optional sheet (PDF or image, sent straight
 * to the private store through a one-time link). Tutor or parent. It never changes a level.
 */
export function ExternalResultForm({
  learnerId,
  domains,
  today,
  minDate,
  edit,
}: {
  learnerId: string;
  domains: { key: DomainKey; name: string }[];
  today: string;
  minDate: string;
  /** A2: the entry being corrected. The form starts from its values and saves a NEW entry that replaces it. */
  edit?: { id: string; exam: Exam; takenOn: string; scoreText: string; domains: DomainKey[]; note: string | null };
}) {
  const router = useRouter();
  const [exam, setExam] = useState<Exam>(edit?.exam ?? EXAMS[0]);
  const [takenOn, setTakenOn] = useState(edit?.takenOn ?? today);
  const [score, setScore] = useState(edit?.scoreText ?? "");
  const [picked, setPicked] = useState<DomainKey[]>(edit?.domains ?? []);
  const [note, setNote] = useState(edit?.note ?? "");
  const [file, setFile] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState<null | "upload" | "save">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [clientId] = useState(() => crypto.randomUUID());
  const [cache] = useState<UploadCache>(() => new Map());

  async function pick(f: File | undefined) {
    setMsg(null);
    if (!f) return setFile(null);
    const r = await prepareFile(f, "phieu-diem");
    if (!r.ok) {
      setFile(null);
      return setMsg(practiceErrorText(r.reason === "type" ? "file_type" : r.reason === "too_big" ? "file_too_big" : "unreadable", "staff"));
    }
    setFile(r.file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!score.trim()) return setMsg(externalCopy.needScore);
    if (picked.length === 0) return setMsg(externalCopy.needDomain);
    let sheet: { id: string; mime: string; bytes: number } | null = null;
    if (file) {
      setBusy("upload");
      const up = await uploadAll([file], `/api/learners/${learnerId}/files`, { purpose: "external_result" }, cache);
      if (!up.ok) {
        setBusy(null);
        return setMsg(practiceErrorText(up.error, "staff"));
      }
      sheet = up.files[0] ?? null;
    }
    setBusy("save");
    const r = await postJson(`/api/learners/${learnerId}/external-results`, {
      client_id: clientId,
      exam,
      taken_on: takenOn,
      score_text: score.trim(),
      domains: picked,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(sheet ? { file: sheet } : {}),
      ...(edit ? { supersedes_id: edit.id } : {}),
    });
    setBusy(null);
    if (!r.ok) return setMsg(r.error.startsWith("file_") ? practiceErrorText(r.error, "staff") : failText(r));
    router.push(`/learners/${learnerId}/levels`);
    router.refresh();
  }

  const field = "min-h-11 rounded-lg border border-line bg-white px-3";
  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-4" data-testid="external-form" data-editing={edit ? edit.id : undefined}>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{externalCopy.exam}</span>
        <select value={exam} onChange={(e) => setExam(e.target.value as Exam)} data-testid="external-exam" className={`${field} max-w-72`}>
          {EXAMS.map((x) => (
            <option key={x} value={x}>
              {externalCopy.examLabels[x] ?? x}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{externalCopy.takenOn}</span>
        <input type="date" min={minDate} max={today} value={takenOn} onChange={(e) => setTakenOn(e.target.value)} data-testid="external-date" className={`${field} max-w-56`} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{externalCopy.score}</span>
        <input type="text" maxLength={SCORE_MAX} placeholder={externalCopy.scoreHint} value={score} onChange={(e) => setScore(e.target.value)} data-testid="external-score" className={field} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-muted">{externalCopy.domains}</legend>
        <p className="text-xs text-muted">{externalCopy.domainsHelp}</p>
        <div className="flex flex-wrap gap-2">
          {domains.map((d) => (
            <label key={d.key} className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm">
              <input
                type="checkbox"
                checked={picked.includes(d.key)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, d.key] : picked.filter((k) => k !== d.key))}
                data-testid={`external-domain-${d.key}`}
              />
              {d.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{externalCopy.note}</span>
        <textarea value={note} maxLength={NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} data-testid="external-note" className="rounded-lg border border-line bg-white px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{externalCopy.file}</span>
        {edit ? <span className="text-xs text-muted">{externalCopy.editFileHint}</span> : null}
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => void pick(e.target.files?.[0])}
          data-testid="external-file"
          className="min-h-11 text-sm"
        />
      </label>
      {msg ? (
        <p role="alert" data-testid="external-msg" className="font-medium text-[#7a2a0c]">
          {msg}
        </p>
      ) : null}
      <button type="submit" disabled={busy !== null} data-testid="external-save" className="min-h-12 rounded-xl bg-accent px-5 text-base font-semibold text-white disabled:opacity-60">
        {busy === "upload" ? externalCopy.uploading : busy === "save" ? externalCopy.saving : externalCopy.save}
      </button>
    </form>
  );
}
