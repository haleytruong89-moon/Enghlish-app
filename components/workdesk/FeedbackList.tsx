"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appFeedback } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { failText, postJson } from "@/lib/tutorwork/client";
import { FEEDBACK_REPLY_MAX, FEEDBACK_STATUSES, type AppFeedbackView, type FeedbackStatus } from "@/lib/workdesk/types";

/** The family's app feedback. Everyone sees the status; only the parent gets the status select + reply box. */
export function FeedbackList({ items, role }: { items: AppFeedbackView[]; role: "parent" | "tutor" }) {
  if (items.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted" data-testid="fb-empty">
        {appFeedback.empty}
      </p>
    );
  }
  return (
    <ul className="mt-4 flex flex-col gap-3" data-testid="fb-list">
      {items.map((f) => (
        <li key={f.id} className="rounded-xl border border-line bg-white p-4" data-testid={`fb-${f.id}`}>
          <p className="text-xs text-muted">{appFeedback.from(f.byName, appFeedback.kinds[f.kind], f.screen, formatDateVi(f.at))}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{f.text}</p>
          <p className="mt-2 text-sm" data-testid={`fb-state-${f.id}`}>
            <span className="text-muted">{appFeedback.status}: </span>
            <span className="font-medium">{appFeedback.statuses[f.status]}</span>
          </p>
          {f.reply ? (
            <p className="mt-1 rounded-lg bg-[#e3ece8] px-3 py-2 text-sm" data-testid={`fb-reply-${f.id}`}>
              <span className="text-muted">{appFeedback.replyLabel}: </span>
              {f.reply}
            </p>
          ) : null}
          {role === "parent" ? <UpdateRow item={f} /> : null}
        </li>
      ))}
    </ul>
  );
}

function UpdateRow({ item }: { item: AppFeedbackView }) {
  const router = useRouter();
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function update(e: React.FormEvent) {
    e.preventDefault();
    if (status === "wont_do" && !reply.trim()) return setMsg({ ok: false, text: appFeedback.replyRequired });
    setBusy(true);
    setMsg(null);
    const r = await postJson(`/api/feedback/${item.id}`, { status, reply: reply.trim() || undefined, client_id: crypto.randomUUID() });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: failText(r) });
    setReply("");
    setMsg({ ok: true, text: appFeedback.updated });
    router.refresh();
  }

  return (
    <form onSubmit={update} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{appFeedback.status}</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} data-testid={`fb-status-${item.id}`} className="min-h-11 rounded-lg border border-line bg-white px-2">
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {appFeedback.statuses[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
        <span className="text-muted">{appFeedback.reply}{status === "wont_do" ? " *" : ""}</span>
        <input value={reply} maxLength={FEEDBACK_REPLY_MAX} placeholder={appFeedback.replyHint} onChange={(e) => setReply(e.target.value)} data-testid={`fb-replybox-${item.id}`} className="min-h-11 rounded-lg border border-line bg-white px-3" />
      </label>
      <button type="submit" disabled={busy} data-testid={`fb-update-${item.id}`} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? appFeedback.updating : appFeedback.update}
      </button>
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={`basis-full text-sm font-medium ${msg.ok ? "text-accent" : "text-[#7a2a0c]"}`}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}
