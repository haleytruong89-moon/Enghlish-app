"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { roadmapCopy } from "@/lib/copy/vi";
import { roadmapFailText } from "@/lib/roadmap/client";
import type { RoadmapCurriculum } from "@/lib/roadmap/shape";
import type { Proposal } from "@/lib/roadmap/types";
import { fieldsOf, placeLine, valuesOf } from "@/lib/roadmap/view";
import { postJson } from "@/lib/tutorwork/client";
import { MilestoneForm } from "./MilestoneForm";

/** "Đề xuất của app": nothing is stored until the tutor clicks. Xác nhận = a confirmed v1; Bỏ đề xuất = a removed v1 with a reason (never shown again). */
export function ProposalList({ learnerId, proposals, curricula, mainId, canWrite, summitTitle }: {
  learnerId: string; proposals: Proposal[]; curricula: RoadmapCurriculum[]; mainId: string | null; canWrite: boolean; summitTitle: string | null;
}) {
  const router = useRouter();
  if (proposals.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4" aria-labelledby="proposals-title" data-testid="proposals">
      <div>
        <h2 id="proposals-title" className="text-lg font-semibold">{roadmapCopy.proposals.title}</h2>
        <p className="text-sm text-muted">{roadmapCopy.proposals.intro}</p>
      </div>
      {proposals.map((p) => (
        <ProposalRow key={p.key} learnerId={learnerId} p={p} curricula={curricula} mainId={mainId} canWrite={canWrite} summitTitle={summitTitle} onDone={() => router.refresh()} />
      ))}
    </section>
  );
}

function ProposalRow({ learnerId, p, curricula, mainId, canWrite, summitTitle, onDone }: {
  learnerId: string; p: Proposal; curricula: RoadmapCurriculum[]; mainId: string | null; canWrite: boolean; summitTitle: string | null; onDone: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "dismiss">("view");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const { state, track } = useSaveStatus({ mode, reason });

  async function write(status: "confirmed" | "removed") {
    setError(null);
    const fields = fieldsOf(valuesOf(p));
    const r = await track(() =>
      postJson(`/api/learners/${learnerId}/roadmap/milestones`, {
        client_id: clientId.current, status, fields, proposal_key: p.key, ...(status === "removed" ? { reason: reason.trim() } : {}),
      }),
    );
    if (!r.ok) { clientId.current = crypto.randomUUID(); return setError(r.error === "summit_exists" && summitTitle ? `${roadmapCopy.errors.summit_exists} (${summitTitle})` : roadmapFailText(r)); }
    onDone();
  }

  if (mode === "edit") {
    return <MilestoneForm learnerId={learnerId} curricula={curricula} mainId={mainId} editing={null} proposalKey={p.key} initial={valuesOf(p)} summitTitle={summitTitle} onDone={onDone} onCancel={() => setMode("view")} />;
  }
  return (
    <article className="flex flex-col gap-2 border-t border-line pt-3" data-testid="proposal" data-key={p.key}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-line px-2 py-0.5 text-xs">{roadmapCopy.roles[p.role]}</span>
        <b className="text-base">{p.title}</b>
      </div>
      <p className="text-sm text-muted">
        {roadmapCopy.proposals.source[p.source]}
        {p.role === "flag" ? ` · ${placeLine(p, curricula)}` : ""}
        {p.targetMonth ? ` · ${roadmapCopy.row.month(p.targetMonth, p.approx)}` : ""}
      </p>
      {canWrite ? (
        mode === "dismiss" ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{roadmapCopy.proposals.dismissReason}</span>
              <input type="text" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="proposal-dismiss-reason" className="min-h-11 rounded-lg border border-line bg-white px-3" />
            </label>
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => write("removed")} data-testid="proposal-dismiss-go" className="min-h-11 rounded-lg border border-red-700 bg-white px-4 text-sm font-semibold text-red-700">{roadmapCopy.proposals.dismissGo}</button>
              <button type="button" onClick={() => { setMode("view"); setError(null); }} className="min-h-11 px-3 text-sm text-muted underline">{roadmapCopy.row.keep}</button>
              <SaveStatus state={state} />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => write("confirmed")} data-testid="proposal-confirm" className="min-h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white">{roadmapCopy.proposals.confirm}</button>
            <button type="button" onClick={() => setMode("edit")} data-testid="proposal-edit" className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium">{roadmapCopy.proposals.editConfirm}</button>
            <button type="button" onClick={() => setMode("dismiss")} data-testid="proposal-dismiss" className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium">{roadmapCopy.proposals.dismiss}</button>
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <SaveStatus state={state} />
          </div>
        )
      ) : null}
    </article>
  );
}
