"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { roadmapCopy } from "@/lib/copy/vi";
import { roadmapFailText } from "@/lib/roadmap/client";
import { clientIdBook } from "@/lib/roadmap/clientId";
import type { RoadmapCurriculum } from "@/lib/roadmap/shape";
import { postJson } from "@/lib/tutorwork/client";

/** Which approved curriculum the child's mountain follows. Not chosen = the default of Q9 (said in words). */
export function MainCurriculumPicker({ learnerId, curricula, mainId, chosen, canWrite }: {
  learnerId: string; curricula: RoadmapCurriculum[]; mainId: string | null; chosen: boolean; canWrite: boolean;
}) {
  const router = useRouter();
  const [pick, setPick] = useState(mainId ?? "");
  const [error, setError] = useState<string | null>(null);
  const book = useRef(clientIdBook());
  const { state, track } = useSaveStatus(pick);
  if (curricula.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-white p-4" data-testid="roadmap-main-none">
        <h2 className="text-lg font-semibold">{roadmapCopy.main.title}</h2>
        <p className="mt-1 text-sm">{roadmapCopy.main.none}</p>
        <Link href={`/learners/${learnerId}/curricula`} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent underline">{roadmapCopy.main.openCurricula}</Link>
      </section>
    );
  }
  async function save() {
    setError(null);
    const body = { curriculum_id: pick };
    const r = await track(() => postJson(`/api/learners/${learnerId}/roadmap/main`, { client_id: book.current.idFor(body), ...body }));
    book.current.settle(r);
    if (!r.ok) return setError(roadmapFailText(r));
    router.refresh();
  }
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4" aria-labelledby="main-title" data-testid="roadmap-main">
      <h2 id="main-title" className="text-lg font-semibold">{roadmapCopy.main.title}</h2>
      <p className="text-sm text-muted">{chosen ? roadmapCopy.main.chosenNote : roadmapCopy.main.autoNote}</p>
      {canWrite && curricula.length > 1 ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{roadmapCopy.main.choose}</span>
            <select value={pick} onChange={(e) => setPick(e.target.value)} data-testid="roadmap-main-select" className="min-h-11 rounded-lg border border-line bg-white px-3">
              {curricula.map((c) => <option key={c.id} value={c.id}>{c.title}{c.id === mainId ? ` · ${roadmapCopy.main.current}` : ""}</option>)}
            </select>
          </label>
          <button type="button" onClick={save} disabled={pick === mainId} data-testid="roadmap-main-save" className="min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-50">{roadmapCopy.main.save}</button>
          <SaveStatus state={state} />
        </div>
      ) : (
        <p className="text-sm font-medium">{curricula.find((c) => c.id === mainId)?.title}</p>
      )}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
