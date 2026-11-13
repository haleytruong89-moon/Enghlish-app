// components/studio/AssignStudioForm.tsx
"use client";

import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { BusyButton } from "@/components/ui/BusyButton";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { busyCopy, studioCopy } from "@/lib/copy/vi";
import { addDays } from "@/lib/inquiries/dates";
import { sendJson } from "@/lib/studio/client";
import { studioErrorText } from "@/lib/studio/view";

/** Giao bài (spec §3 step 4): ngày làm + hạn nộp → the child sees it in "Việc tiếp theo" from ngày làm. */
export function AssignStudioForm({ draftId, today }: { draftId: string; today: string }) {
  const router = useRouter();
  const [start, setStart] = useState(today);
  const [due, setDue] = useState(addDays(today, 7));
  const [busy, setBusy] = useState(false);
  const { state: saveState, track } = useSaveStatus({ start, due });
  const [msg, setMsg] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await track(() => sendJson(`/api/studio/drafts/${draftId}/assign`, "POST", { start_on: start, due_on: due, client_id: clientId.current }));
    setBusy(false);
    if (!r.ok) return setMsg(studioErrorText(r.error));
    clientId.current = crypto.randomUUID();
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3" data-testid="assign-form">
      <h3 className="w-full font-semibold">{studioCopy.assignTitle}</h3>
      <label className="flex flex-col text-xs font-semibold">
        {studioCopy.startOn}
        <input type="date" data-testid="assign-start" value={start} onChange={(e) => setStart(e.target.value)} className="min-h-11 rounded-lg border border-line px-3" />
      </label>
      <label className="flex flex-col text-xs font-semibold">
        {studioCopy.dueOn}
        <input type="date" data-testid="assign-due" value={due} onChange={(e) => setDue(e.target.value)} className="min-h-11 rounded-lg border border-line px-3" />
      </label>
      <SaveStatus state={saveState} />
      <BusyButton busy={busy} busyLabel={busyCopy.saving} type="submit"  data-testid="assign-submit" className="min-h-12 rounded-xl bg-accent px-5 font-bold text-white">{studioCopy.assign}</BusyButton>
      {msg ? <p role="alert" className="w-full text-sm text-[#8A1C12]">{msg}</p> : null}
    </form>
  );
}
