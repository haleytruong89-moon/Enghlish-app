"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { studioCopy } from "@/lib/copy/vi";
import { formatDay } from "@/lib/review/format";
import { sendJson } from "@/lib/studio/client";
import { studioErrorText } from "@/lib/studio/view";
import { todayVn } from "@/lib/inquiries/dates";

/** "Bản nháp đã bỏ": a closed list; Khôi phục makes a new draft with the same questions and opens it. Adults only. */
export function DiscardedDrafts({ drafts }: { drafts: { id: string; title: string; updatedAt: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (drafts.length === 0) return null;
  async function restore(id: string) {
    setBusy(id);
    setMsg(null);
    const r = await sendJson<{ id: string }>(`/api/studio/drafts/${id}/restore`, "POST", {});
    setBusy(null);
    if (!r.ok) return setMsg(studioErrorText(r.error));
    router.push(`/studio/drafts/${r.body.id}`);
  }
  return (
    <details className="mt-4" data-testid="discarded-drafts">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-muted">{studioCopy.discardedTitle(drafts.length)}</summary>
      <p className="text-sm text-muted">{studioCopy.discardedNote}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-2">
            <span>
              <span className="font-semibold">{d.title}</span>
              <span className="text-sm text-muted"> · {studioCopy.discardedOn(formatDay(todayVn(new Date(d.updatedAt))))}</span>
            </span>
            <button type="button" disabled={busy !== null} onClick={() => void restore(d.id)} data-testid={`restore-${d.id}`} className="min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-60">
              {busy === d.id ? studioCopy.restoring : studioCopy.restore}
            </button>
          </li>
        ))}
      </ul>
      {msg ? <p role="alert" className="mt-2 text-sm text-[#8A1C12]">{msg}</p> : null}
    </details>
  );
}
