"use client";

import { useState } from "react";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";
import { proposeInProgress } from "@/lib/curriculum/progress";
import type { TaughtUnit } from "@/lib/curriculum/schema";
import type { TaughtChoice } from "@/lib/curriculum/shape";

/** After the note is saved: "Đặt U14 là “Đang học”" for each taught unit that had not started (DOMAIN §5.1). Never automatic. */
export function UnitProposal({ choices, taught, lessonNoteId }: { choices: TaughtChoice[]; taught: TaughtUnit[]; lessonNoteId: string }) {
  const [done, setDone] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const items = choices.flatMap((c) =>
    proposeInProgress(taught.filter((t) => t.curriculum_id === c.curriculumId).map((t) => t.unit_code), c.statusOf).map((code) => ({ curriculumId: c.curriculumId, code })),
  );
  if (items.length === 0) return null;
  async function set(curriculumId: string, code: string) {
    const r = await sendJson(`/api/curricula/${curriculumId}/unit-events`, "POST", { unit_code: code, status: "in_progress", lesson_note_id: lessonNoteId, client_id: crypto.randomUUID() });
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    setDone((d) => [...d, `${curriculumId}/${code}`]);
  }
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-accent bg-white p-4" data-testid="unit-proposal">
      <h2 className="text-base font-semibold">{curriculumCopy.proposeTitle}</h2>
      <p className="text-xs text-muted">{curriculumCopy.proposeHelp}</p>
      {items.map((it) =>
        done.includes(`${it.curriculumId}/${it.code}`) ? (
          <p key={`${it.curriculumId}/${it.code}`} role="status" className="text-sm text-accent">
            {curriculumCopy.proposeDone(it.code)}
          </p>
        ) : (
          <button key={`${it.curriculumId}/${it.code}`} type="button" onClick={() => void set(it.curriculumId, it.code)} data-testid={`propose-${it.code}`}
            className="min-h-11 self-start rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent">
            {curriculumCopy.proposeButton(it.code)}
          </button>
        ),
      )}
      {problem ? <p role="alert" className="text-sm text-[#8A1C12]">{problem}</p> : null}
    </section>
  );
}
