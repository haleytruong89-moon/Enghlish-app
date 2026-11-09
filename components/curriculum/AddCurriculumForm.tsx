"use client";

import { FilePicker } from "@/components/ui/FilePicker";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { GateReason } from "@/lib/ai/cap";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson, uploadTocFile } from "@/lib/curriculum/client";
import { CURRICULUM_LIMITS } from "@/lib/curriculum/types";

/**
 * "Thêm giáo trình" (title + level note + PDF) or, with `curriculumId`, "Nạp mục lục" for an existing curriculum (file only). Then
 * "Cho AI đọc mục lục" (when the gate allows) or "Soạn tay". The file goes straight to storage; the server checks it again.
 */
export function AddCurriculumForm({
  learnerId,
  curriculumId = null,
  aiAllowed,
  aiReason,
}: {
  learnerId: string;
  curriculumId?: string | null;
  aiAllowed: boolean;
  aiReason: GateReason | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [levelNote, setLevelNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"ai" | "manual" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const tid = curriculumId ? `load-toc-${curriculumId}` : "add-curriculum";

  async function start(mode: "ai" | "manual") {
    if (!curriculumId && !title.trim()) return setProblem(curriculumErrorText("bad_title"));
    if (mode === "ai" && !file) return setProblem(curriculumErrorText("toc_file_required"));
    setBusy(mode);
    setProblem(null);
    const up = file ? await uploadTocFile(learnerId, file) : ({ ok: true as const, file: null });
    if (!up.ok) {
      setBusy(null);
      return setProblem(curriculumErrorText(up.error));
    }
    const r = curriculumId
      ? await sendJson<{ version_id: string }>(`/api/curricula/${curriculumId}/versions`, "POST", { mode, toc_file: up.file, client_id: clientId.current })
      : await sendJson<{ version_id: string }>(`/api/learners/${learnerId}/curricula`, "POST", {
          title: title.trim(), level_note: levelNote.trim() || null, mode, toc_file: up.file, client_id: clientId.current,
        });
    setBusy(null);
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    router.push(`/curricula/versions/${r.body.version_id}`);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate data-testid={tid}>
      {curriculumId ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {curriculumCopy.bookTitle}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={CURRICULUM_LIMITS.title} placeholder={curriculumCopy.bookTitlePlaceholder} data-testid={`${tid}-title`} className="min-h-11 rounded-lg border border-line px-3 font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {curriculumCopy.levelNote}
            <input value={levelNote} onChange={(e) => setLevelNote(e.target.value)} maxLength={CURRICULUM_LIMITS.levelNote} placeholder={curriculumCopy.levelNotePlaceholder} data-testid={`${tid}-level`} className="min-h-11 rounded-lg border border-line px-3 font-normal" />
            <span className="text-xs font-normal text-muted">{curriculumCopy.levelNoteHint}</span>
          </label>
        </div>
      )}
      <div className="flex flex-col gap-1 text-sm font-semibold">
        {curriculumCopy.tocFile}
        <FilePicker testId={`${tid}-file`} accept="application/pdf,.pdf" name={file?.name ?? null} onPick={(f) => setFile(f ?? null)} ariaLabel={curriculumCopy.tocFile} />
        <span className="text-xs font-normal text-muted">{curriculumCopy.tocHint}</span>
      </div>
      {!aiAllowed && aiReason ? (
        <p role="status" data-testid={`${tid}-ai-unavailable`} className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {curriculumCopy.aiUnavailable[`ai_${aiReason}`]}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" data-testid={`${tid}-problem`} className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {aiAllowed ? (
          <button type="button" disabled={busy !== null} onClick={() => void start("ai")} data-testid={`${tid}-ai`} className="min-h-12 rounded-xl bg-accent px-5 font-bold text-white disabled:opacity-60">
            {busy === "ai" ? curriculumCopy.uploading : curriculumCopy.startAi}
          </button>
        ) : null}
        <button type="button" disabled={busy !== null} onClick={() => void start("manual")} data-testid={`${tid}-manual`} className="min-h-12 rounded-xl border border-line bg-white px-5 font-semibold disabled:opacity-60">
          {busy === "manual" ? curriculumCopy.uploading : curriculumCopy.manual}
        </button>
      </div>
      <p className="text-xs text-muted">{curriculumCopy.manualHint}</p>
    </form>
  );
}
