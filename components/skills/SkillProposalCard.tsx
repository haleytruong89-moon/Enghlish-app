// components/skills/SkillProposalCard.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fallbackLabels, skillStateCopy } from "@/lib/copy/vi";
import { clientIdAfter, describedBy } from "@/lib/levels/form";
import { dayLabel } from "@/lib/levels/view";
import { REASON_MAX, REASON_MIN, type SkillInboxItem } from "@/lib/skills/types";
import { conditionsFor, proposalTitle, routeLabel } from "@/lib/skills/view";
import { failText, postJson } from "@/lib/tutorwork/client";
import { ConditionList } from "./ConditionList";

const button = "min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-60";

/**
 * One open proposal or ⚑ of the "Kỹ năng" tab (spec §5). The child's tutor: Xác nhận / Chưa (reason) for a level-up; Giữ bậc / Sửa bậc for a ⚑.
 * Everyone else (the parent) reads it with "Chờ thầy/cô xác nhận". The server and the database check the actor again.
 */
export function SkillProposalCard({ item }: { item: SkillInboxItem }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const flag = item.kind === "FLAG";
  const msgId = `skill-msg-${item.id}`;
  const meta = [routeLabel(item.route), skillStateCopy.createdOn(dayLabel(item.createdAt))].filter(Boolean).join(" · ");

  async function send(action: "confirm" | "reject") {
    setMsg(null);
    if (action === "reject" && reason.trim().length < REASON_MIN) return setMsg(skillStateCopy.reasonRequired);
    setBusy(true);
    const r = await postJson(`/api/skills/decisions/${item.id}`, { client_id: clientId, action, ...(action === "reject" ? { reason: reason.trim() } : {}) });
    setBusy(false);
    setClientId(clientIdAfter(r, clientId));
    if (!r.ok) return setMsg(failText(r));
    router.refresh();
  }

  return (
    <li id={`skill-${item.id}`} className="scroll-mt-4 rounded-xl border border-line bg-white px-5 py-4" data-testid={`skill-proposal-${item.targetKey}`} data-kind={item.kind}>
      <p className="font-semibold" data-testid="skill-proposal-title">
        {proposalTitle(item)}
      </p>
      <p className="mt-1 text-sm text-muted">{meta}</p>
      <details className="mt-2" data-testid="skill-conditions">
        <summary className="min-h-11 cursor-pointer py-2 text-sm text-accent underline">{skillStateCopy.conditionsToggle}</summary>
        <ConditionList conditions={conditionsFor(item)} />
        <h3 className="mt-3 text-sm font-semibold">{skillStateCopy.evidenceTitle}</h3>
        {item.evidence.length === 0 ? (
          <p className="text-sm text-muted">{skillStateCopy.evidenceNone}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {item.evidence.map((e) => (
              <li key={e.episodeId}>
                <Link href={`/review/${e.episodeId}`} data-testid="skill-evidence-link" className="inline-flex min-h-11 items-center text-accent underline">
                  {skillStateCopy.evidenceLine(e.titleVi ?? fallbackLabels.activity, e.stepNo, dayLabel(e.at))}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </details>

      {!item.canDecide ? (
        <p className="mt-3 inline-block rounded-full border border-line px-3 py-1 text-xs" data-testid="skill-waiting">
          {skillStateCopy.waitingTutor}
        </p>
      ) : flag ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => send("confirm")} data-testid="skill-keep" aria-describedby={describedBy(msg && msgId)} className={`${button} bg-accent text-white`}>
            {busy ? skillStateCopy.saving : skillStateCopy.keep}
          </button>
          <Link href={`/learners/${item.learnerId}/targets#skill-${item.targetKey}`} data-testid="skill-edit-level" className={`${button} inline-flex items-center border border-accent text-accent`}>
            {skillStateCopy.editLevel}
          </Link>
        </div>
      ) : rejecting ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{skillStateCopy.rejectReason}</span>
            <textarea
              data-testid="skill-reject-reason"
              value={reason}
              maxLength={REASON_MAX}
              rows={2}
              placeholder={skillStateCopy.rejectHint}
              aria-describedby={describedBy(msg && msgId)}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-line bg-white px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => send("reject")} data-testid="skill-reject-send" className={`${button} bg-accent text-white`}>
              {busy ? skillStateCopy.saving : skillStateCopy.rejectSend}
            </button>
            <button type="button" onClick={() => setRejecting(false)} className={`${button} border border-line`}>
              {skillStateCopy.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => send("confirm")} data-testid="skill-confirm" aria-describedby={describedBy(msg && msgId)} className={`${button} bg-accent text-white`}>
            {busy ? skillStateCopy.saving : skillStateCopy.confirm}
          </button>
          <button type="button" onClick={() => setRejecting(true)} data-testid="skill-reject-open" className={`${button} border border-accent text-accent`}>
            {skillStateCopy.reject}
          </button>
        </div>
      )}
      {msg ? (
        <p id={msgId} role="alert" data-testid="skill-msg" className="mt-2 font-medium text-[#7a2a0c]">
          {msg}
        </p>
      ) : null}
    </li>
  );
}
