// components/points/PointProposalCard.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { pointStateCopy } from "@/lib/copy/vi";
import { clientIdAfter, describedBy } from "@/lib/levels/form";
import { dayLabel } from "@/lib/levels/view";
import { POINT_REASON_MAX, POINT_REASON_MIN, type PointInboxItem } from "@/lib/points/types";
import { pointConditionsFor, pointConditionText, pointTitle } from "@/lib/points/view";
import { failText, postJson } from "@/lib/tutorwork/client";

const button = "min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-60";

/**
 * One open point proposal or ⚑ of the "Kỹ năng" tab (R1). Decided ONE AT A TIME (no "confirm all", H5): the child's tutor taps Xác nhận / Chưa (reason),
 * or Giữ mức on a ⚑. The parent reads it with "Chờ thầy/cô xác nhận". The server and the database check the actor again.
 */
export function PointProposalCard({ item }: { item: PointInboxItem }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [lowering, setLowering] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const flag = item.kind === "FLAG";
  const msgId = `point-msg-${item.id}`;

  async function send(action: "confirm" | "reject" | "lower") {
    setMsg(null);
    if (action !== "confirm" && reason.trim().length < POINT_REASON_MIN) return setMsg(pointStateCopy.reasonRequired);
    setBusy(true);
    const r = await postJson(`/api/review/points/${item.id}`, { client_id: clientId, action, ...(action !== "confirm" ? { reason: reason.trim() } : {}) });
    setBusy(false);
    setClientId(clientIdAfter(r, clientId));
    if (!r.ok) return setMsg(failText(r));
    router.refresh();
  }

  return (
    <li id={`point-${item.id}`} className="scroll-mt-4 rounded-xl border border-line bg-white px-5 py-4" data-testid={`point-proposal-${item.tagKey}`} data-kind={item.kind}>
      <p className="font-semibold" data-testid="point-proposal-title">
        {pointTitle(item)}
      </p>
      <p className="mt-1 text-sm text-muted">{pointStateCopy.createdOn(dayLabel(item.createdAt))}</p>
      <details className="mt-2" data-testid="point-conditions">
        <summary className="min-h-11 cursor-pointer py-2 text-sm text-accent underline">{pointStateCopy.conditionsToggle}</summary>
        {pointConditionsFor(item).length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {pointConditionsFor(item).map((c) => (
              <li key={c.id} data-testid={`point-condition-${c.id}`} data-met={c.met ? "true" : "false"}>
                <span aria-hidden="true" className={c.met ? "font-semibold text-accent" : "font-semibold text-[#7a2a0c]"}>
                  {c.met ? "✓" : "✗"}
                </span>{" "}
                {pointConditionText(c)}
              </li>
            ))}
          </ul>
        ) : null}
        <h3 className="mt-3 text-sm font-semibold">{pointStateCopy.evidenceTitle}</h3>
        {item.evidence.length === 0 ? (
          <p className="text-sm text-muted">{pointStateCopy.evidenceNone}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {item.evidence.map((e) => (
              <li key={e.ref}>{pointStateCopy.evidenceLine(e.titleVi ?? e.item, dayLabel(e.at))}</li>
            ))}
          </ul>
        )}
      </details>

      {!item.canDecide ? (
        <p className="mt-3 inline-block rounded-full border border-line px-3 py-1 text-xs" data-testid="point-waiting">
          {pointStateCopy.waitingTutor}
        </p>
      ) : flag && lowering ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{pointStateCopy.lowerReason}</span>
            <textarea
              data-testid="point-lower-reason"
              value={reason}
              maxLength={POINT_REASON_MAX}
              rows={2}
              placeholder={pointStateCopy.lowerHint}
              aria-describedby={describedBy(msg && msgId)}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-line bg-white px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => send("lower")} data-testid="point-lower-send" className={`${button} bg-accent text-white`}>
              {busy ? pointStateCopy.saving : pointStateCopy.lowerSend}
            </button>
            <button type="button" onClick={() => setLowering(false)} className={`${button} border border-line`}>
              {pointStateCopy.cancel}
            </button>
          </div>
        </div>
      ) : flag ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => send("confirm")} data-testid="point-keep" aria-describedby={describedBy(msg && msgId)} className={`${button} bg-accent text-white`}>
            {busy ? pointStateCopy.saving : pointStateCopy.keep}
          </button>
          <button type="button" onClick={() => setLowering(true)} data-testid="point-lower-open" className={`${button} border border-accent text-accent`}>
            {pointStateCopy.lower}
          </button>
        </div>
      ) : rejecting ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{pointStateCopy.rejectReason}</span>
            <textarea
              data-testid="point-reject-reason"
              value={reason}
              maxLength={POINT_REASON_MAX}
              rows={2}
              placeholder={pointStateCopy.rejectHint}
              aria-describedby={describedBy(msg && msgId)}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-line bg-white px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => send("reject")} data-testid="point-reject-send" className={`${button} bg-accent text-white`}>
              {busy ? pointStateCopy.saving : pointStateCopy.rejectSend}
            </button>
            <button type="button" onClick={() => setRejecting(false)} className={`${button} border border-line`}>
              {pointStateCopy.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => send("confirm")} data-testid="point-confirm" aria-describedby={describedBy(msg && msgId)} className={`${button} bg-accent text-white`}>
            {busy ? pointStateCopy.saving : pointStateCopy.confirm}
          </button>
          <button type="button" onClick={() => setRejecting(true)} data-testid="point-reject-open" className={`${button} border border-accent text-accent`}>
            {pointStateCopy.reject}
          </button>
        </div>
      )}
      {msg ? (
        <p id={msgId} role="alert" data-testid="point-msg" className="mt-2 font-medium text-[#7a2a0c]">
          {msg}
        </p>
      ) : null}
    </li>
  );
}
