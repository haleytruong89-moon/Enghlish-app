"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";
import type { WorkProposal } from "@/lib/curriculum/workProposal";

/**
 * Bản rà 21/11 #10: "Con đã nộp bài của U14 → đặt U14 là “Đang học”?" for each Unit of sent work that has not started (DOMAIN §5.1).
 * The app only proposes; the adult clicks (the same unit-events call as the session note's proposal). Never "Đã học".
 */
export function WorkUnitProposal({ curriculumId, proposals }: { curriculumId: string; proposals: WorkProposal[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (proposals.length === 0) return null;
  async function set(code: string) {
    setBusy(code);
    setProblem(null);
    const r = await sendJson(`/api/curricula/${curriculumId}/unit-events`, "POST", { unit_code: code, status: "in_progress", lesson_note_id: null, client_id: crypto.randomUUID() });
    setBusy(null);
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    router.refresh();
  }
  return (
    <section className="mt-4 flex flex-col gap-2 rounded-xl border border-accent bg-white p-4" data-testid="work-unit-proposal">
      <h2 className="text-base font-semibold">{curriculumCopy.workProposeTitle}</h2>
      <p className="text-xs text-muted">{curriculumCopy.proposeHelp}</p>
      <ul className="flex flex-col gap-2">
        {proposals.map((p) => (
          <li key={p.code} className="flex flex-wrap items-center gap-3" data-testid={`work-propose-${p.code}`}>
            <span className="text-sm">{curriculumCopy.workProposeLine(p.code, p.titles)}</span>
            <button type="button" disabled={busy !== null} onClick={() => void set(p.code)} data-testid={`work-propose-${p.code}-set`}
              className="min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-60">
              {curriculumCopy.proposeButton(p.code)}
            </button>
          </li>
        ))}
      </ul>
      {problem ? <p role="alert" className="text-sm text-[#8A1C12]">{problem}</p> : null}
    </section>
  );
}
