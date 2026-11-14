"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { roadmapCopy } from "@/lib/copy/vi";
import { roadmapFailText } from "@/lib/roadmap/client";
import { clientIdBook } from "@/lib/roadmap/clientId";
import type { RoadmapCurriculum } from "@/lib/roadmap/shape";
import type { MilestoneCard } from "@/lib/roadmap/types";
import { dateOf, placeLine, valuesOf } from "@/lib/roadmap/view";
import { postJson } from "@/lib/tutorwork/client";
import { MilestoneForm } from "./MilestoneForm";
import { MilestoneHistory } from "./MilestoneHistory";

/** The milestones of one child, in three groups (summit · after the summit · on the road). Only the tutor sees buttons. */
export function MilestoneList({
  learnerId, cards, curricula, mainId, canWrite, orphanIds,
}: {
  learnerId: string; cards: MilestoneCard[]; curricula: RoadmapCurriculum[]; mainId: string | null; canWrite: boolean; orphanIds: string[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState<"summit" | "beyond" | "flag" | null>(null);
  const live = cards.filter((c) => c.current.status !== "removed");
  const removed = cards.filter((c) => c.current.status === "removed");
  // Titles of what the child sees as the summit, for the "Đã có đỉnh" message.
  const summitTitle = cards.map((c) => c.childSees).find((v) => v && v.role === "summit")?.title ?? null;
  // The child may still see an older confirmed summit while the current version is a draft flag: "Đặt đỉnh" must not offer a second one.
  const hasSummit = summitTitle !== null || live.some((c) => c.current.role === "summit");
  const done = () => { setAdding(null); router.refresh(); };
  const group = (role: "summit" | "beyond" | "flag", title: string, none: string, addLabel: string, hint?: string) => {
    const items = live.filter((c) => c.current.role === role);
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4" aria-label={title} data-testid={`ms-group-${role}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}{hint ? <span className="ml-2 text-sm font-normal text-muted">({hint})</span> : null}</h2>
          {canWrite && adding !== role && (role !== "summit" || !hasSummit) ? (
            <button type="button" onClick={() => setAdding(role)} data-testid={`ms-add-${role}`} className="min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent">{addLabel}</button>
          ) : null}
        </div>
        {adding === role ? (
          <MilestoneForm
            learnerId={learnerId} curricula={curricula} mainId={mainId} editing={null} summitTitle={summitTitle} onDone={done} onCancel={() => setAdding(null)}
            initial={{ kind: role === "flag" ? "progress_test" : "goal", role, title: "", curriculumId: null, afterUnit: null, month: "", approx: false }}
          />
        ) : null}
        {items.length === 0 && adding !== role ? <p className="text-sm text-muted">{none}</p> : null}
        {role === "summit" && summitTitle === null ? <p className="text-sm text-muted" data-testid="ms-summit-unnamed">{roadmapCopy.summit.unnamedForChild}</p> : null}
        {items.map((c) => (
          <MilestoneRow key={c.milestoneId} learnerId={learnerId} card={c} curricula={curricula} mainId={mainId} canWrite={canWrite} orphan={orphanIds.includes(c.milestoneId)} summitTitle={summitTitle} onChanged={() => router.refresh()} />
        ))}
      </section>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      {group("summit", roadmapCopy.summit.title, roadmapCopy.summit.none, roadmapCopy.summit.set)}
      {group("beyond", roadmapCopy.beyond.title, roadmapCopy.beyond.none, roadmapCopy.beyond.add, roadmapCopy.beyond.hint)}
      {group("flag", roadmapCopy.flags.title, roadmapCopy.flags.none, roadmapCopy.flags.add)}
      {removed.length > 0 ? (
        <details className="rounded-2xl border border-line bg-white p-4" data-testid="ms-removed">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium">{roadmapCopy.history.removedTitle(removed.length)}</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {removed.map((c) => (
              <li key={c.milestoneId} className="flex flex-wrap gap-x-2">
                <time className="text-muted">{dateOf(c.current.createdAt)}</time>
                <b>{c.current.title}</b>
                <span className="text-muted">{roadmapCopy.history.reason(c.current.reason ?? "")}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-sm text-muted">{roadmapCopy.history.note}</p>
    </div>
  );
}

function MilestoneRow({
  learnerId, card, curricula, mainId, canWrite, orphan, summitTitle, onChanged,
}: {
  learnerId: string; card: MilestoneCard; curricula: RoadmapCurriculum[]; mainId: string | null; canWrite: boolean; orphan: boolean; summitTitle: string | null; onChanged: () => void;
}) {
  const v = card.current;
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const book = useRef(clientIdBook());
  const { state, track } = useSaveStatus({ mode, reason });

  async function write(status: "confirmed" | "removed") {
    setError(null);
    const body = { milestone_id: v.milestoneId, base_version: v.version, status, ...(status === "removed" ? { reason: reason.trim() } : {}) };
    const r = await track(() => postJson(`/api/learners/${learnerId}/roadmap/milestones`, { client_id: book.current.idFor(body), ...body }));
    book.current.settle(r);
    if (!r.ok) { return setError(r.error === "summit_exists" && summitTitle ? `${roadmapCopy.errors.summit_exists} (${summitTitle})` : roadmapFailText(r)); }
    setMode("view");
    onChanged();
  }

  if (mode === "edit") {
    return <MilestoneForm learnerId={learnerId} curricula={curricula} mainId={mainId} editing={v} initial={valuesOf(v)} summitTitle={summitTitle} onDone={() => { setMode("view"); onChanged(); }} onCancel={() => setMode("view")} />;
  }
  const statusText = v.status === "confirmed" ? roadmapCopy.status.confirmed : card.childSeesOlder && card.childSees ? roadmapCopy.status.draftChildSeesOld(dateOf(card.childSees.createdAt)) : roadmapCopy.status.draft;
  return (
    <article className="flex flex-col gap-2 border-t border-line pt-3" data-testid={`ms-${v.milestoneId}`} data-status={v.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-line px-2 py-0.5 text-xs">{roadmapCopy.kinds[v.kind]}</span>
        <b className="text-base">{v.title}</b>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${v.status === "confirmed" ? "bg-[#e3ece8] text-accent" : "bg-[#f6e9df] text-[#6e3410]"}`}>{statusText}</span>
      </div>
      <p className="text-sm">
        {v.role === "flag" ? <span>{placeLine(v, curricula)}</span> : null}
        {v.role === "flag" ? " · " : null}
        <span className="text-muted">{v.targetMonth ? roadmapCopy.row.month(v.targetMonth, v.approx) : roadmapCopy.row.noMonth}</span>
      </p>
      {orphan ? <p className="text-sm font-medium text-[#8a4b0f]" data-testid="ms-orphan">{roadmapCopy.row.afterGone(v.afterUnit ?? "")}</p> : null}
      {canWrite ? (
        mode === "remove" ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{roadmapCopy.row.removeReason}</span>
              <input type="text" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-testid={`ms-remove-reason-${v.milestoneId}`} className="min-h-11 rounded-lg border border-line bg-white px-3" />
              <span className="text-xs text-muted">{roadmapCopy.row.removeHint}</span>
            </label>
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => write("removed")} data-testid={`ms-remove-go-${v.milestoneId}`} className="min-h-11 rounded-lg border border-red-700 bg-white px-4 text-sm font-semibold text-red-700">{roadmapCopy.row.removeGo}</button>
              <button type="button" onClick={() => { setMode("view"); setError(null); }} className="min-h-11 px-3 text-sm text-muted underline">{roadmapCopy.row.keep}</button>
              <SaveStatus state={state} />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {v.status === "draft" ? <button type="button" onClick={() => write("confirmed")} data-testid={`ms-confirm-${v.milestoneId}`} className="min-h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white">{roadmapCopy.row.confirm}</button> : null}
            <button type="button" onClick={() => setMode("edit")} data-testid={`ms-edit-${v.milestoneId}`} className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium">{roadmapCopy.row.edit}</button>
            <button type="button" onClick={() => setMode("remove")} data-testid={`ms-remove-${v.milestoneId}`} className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium">{roadmapCopy.row.remove}</button>
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <SaveStatus state={state} />
          </div>
        )
      ) : null}
      <MilestoneHistory history={card.history} />
    </article>
  );
}
