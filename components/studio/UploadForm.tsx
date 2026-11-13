// components/studio/UploadForm.tsx
"use client";

import { PageGuidance, PdfPagePicker, pagesBlock, type PdfPick } from "@/components/ui/PdfPagePicker";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { GateReason } from "@/lib/ai/cap";
import { studioCopy } from "@/lib/copy/vi";
import { sendJson, uploadStudioFile } from "@/lib/studio/client";
import { studioErrorText } from "@/lib/studio/view";

const ACCEPT = "application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx";

/** Title + test file + answer file → "Cho AI đọc đề" (when the gate allows) or "Soạn tay". Files go straight to storage. */
export function UploadForm({ learnerId, aiAllowed, aiReason }: { learnerId: string; aiAllowed: boolean; aiReason: GateReason | null }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [testPick, setTestPick] = useState<PdfPick>({ file: null, pages: null, pending: false });
  const [keyPick, setKeyPick] = useState<PdfPick>({ file: null, pages: null, pending: false });
  const test = testPick.file;
  const key = keyPick.file;
  const pending = testPick.pending || keyPick.pending;
  const tooLong = pagesBlock("studio", testPick.pages, keyPick.pages, false);
  const [busy, setBusy] = useState<"ai" | "manual" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());

  async function start(mode: "ai" | "manual") {
    if (!title.trim()) return setProblem(studioErrorText("invalid_body"));
    if (mode === "ai" && !test) return setProblem(studioErrorText("test_file_required"));
    setBusy(mode);
    setProblem(null);
    const up = async (f: File | null, purpose: "studio_test" | "studio_key") => (f ? uploadStudioFile(learnerId, purpose, f) : { ok: true as const, file: null });
    const t = await up(test, "studio_test");
    const k = t.ok ? await up(key, "studio_key") : t;
    if (!t.ok || !k.ok) {
      setBusy(null);
      return setProblem(studioErrorText(!t.ok ? t.error : !k.ok ? k.error : null));
    }
    const r = await sendJson<{ id: string; status: string }>(`/api/learners/${learnerId}/studio/drafts`, "POST", {
      title: title.trim(), mode, test_file: t.file, key_file: k.file, client_id: clientId.current,
    });
    setBusy(null);
    if (!r.ok) return setProblem(studioErrorText(r.error));
    router.push(`/studio/drafts/${r.body.id}`);
  }

  return (
    <form className="mt-5 flex flex-col gap-4 rounded-2xl border border-line bg-white p-5" onSubmit={(e) => e.preventDefault()} noValidate>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {studioCopy.titleLabel}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={studioCopy.titlePlaceholder} data-testid="studio-title" className="min-h-11 rounded-lg border border-line px-3 font-normal" />
      </label>
      {(["test", "key"] as const).map((which) => (
        <div key={which} className="flex flex-col gap-1 text-sm font-semibold">
          {which === "test" ? studioCopy.testFile : studioCopy.keyFile}
          <PdfPagePicker
            flow="studio"
            role={which === "test" ? "main" : "other"}
            testId={`studio-${which}-file`}
            accept={ACCEPT}
            onChange={which === "test" ? setTestPick : setKeyPick}
            ariaLabel={which === "test" ? studioCopy.testFile : studioCopy.keyFile}
          />
          <span className="text-xs font-normal text-muted">{studioCopy.fileHint}</span>
        </div>
      ))}
      <PageGuidance flow="studio" main={testPick.pages} other={keyPick.pages} />
      {!aiAllowed && aiReason ? (
        <p role="status" data-testid="ai-unavailable" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {studioCopy.aiUnavailable[`ai_${aiReason}`]}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" data-testid="studio-problem" className="rounded-xl bg-[#FBF1DC] px-3.5 py-3 text-sm text-[#6B4600]">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {aiAllowed ? (
          <button type="button" disabled={busy !== null || pending || tooLong} onClick={() => void start("ai")} data-testid="studio-start-ai" className="min-h-12 rounded-xl bg-accent px-5 font-bold text-white disabled:opacity-60">
            {busy === "ai" ? studioCopy.uploading : studioCopy.startAi}
          </button>
        ) : null}
        <button type="button" disabled={busy !== null || pending} onClick={() => void start("manual")} data-testid="studio-manual" className="min-h-12 rounded-xl border border-line bg-white px-5 font-semibold disabled:opacity-60">
          {busy === "manual" ? studioCopy.uploading : studioCopy.manual}
        </button>
      </div>
      <p className="text-xs text-muted">{studioCopy.manualHint}</p>
    </form>
  );
}
