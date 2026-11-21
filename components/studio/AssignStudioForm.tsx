// components/studio/AssignStudioForm.tsx
"use client";

import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { BusyButton } from "@/components/ui/BusyButton";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { busyCopy, studioCopy, testMarkCopy } from "@/lib/copy/vi";
import { addDays } from "@/lib/inquiries/dates";
import { sendJson } from "@/lib/studio/client";
import { studioErrorText } from "@/lib/studio/view";
import { UnitPicker } from "@/components/curriculum/UnitPicker";
import { emptyPicker, selectedUnits, type PickerState, type UnitChoice } from "@/lib/curriculum/unitPicker";

/**
 * Giao bài (spec §3 step 4): ngày làm + hạn nộp → the child sees it in "Việc tiếp theo" from ngày làm.
 * 0037: optional Units of the test; once the child has sent it, Giáo trình proposes "Đang học" for them (never automatic).
 */
export function AssignStudioForm({ draftId, today, learnerId, unitChoices = [] }: { draftId: string; today: string; learnerId?: string; unitChoices?: UnitChoice[] }) {
  const router = useRouter();
  const [start, setStart] = useState(today);
  const [due, setDue] = useState(addDays(today, 7));
  const [isTest, setIsTest] = useState(false);
  const [units, setUnits] = useState<PickerState>(emptyPicker);
  const picked = selectedUnits(unitChoices, units);
  const [busy, setBusy] = useState(false);
  const { state: saveState, track } = useSaveStatus({ start, due, isTest, units: picked.map((u) => `${u.curriculum_id}/${u.unit_code}`) });
  const [msg, setMsg] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const sigRef = useRef("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // One client id per (dates, kind): a changed kind or date is another request, never a replay of the first one.
    const sig = `${start}|${due}|${isTest}|${picked.map((u) => `${u.curriculum_id}/${u.unit_code}`).join(",")}`;
    if (sigRef.current !== sig) {
      sigRef.current = sig;
      clientId.current = crypto.randomUUID();
    }
    setBusy(true);
    const r = await track(() => sendJson(`/api/studio/drafts/${draftId}/assign`, "POST", { start_on: start, due_on: due, client_id: clientId.current, ...(isTest ? { is_test: true } : {}), ...(picked.length > 0 ? { units: picked } : {}) }));
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
      <fieldset className="m-0 flex flex-col border-0 p-0" data-testid="assign-kind">
        <legend className="text-xs font-semibold">{testMarkCopy.label}</legend>
        <div className="flex gap-2">
          {([false, true] as const).map((t) => (
            <label key={String(t)} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-[#E3ECE8]">
              <input type="radio" name="work-kind" data-testid={t ? "assign-kind-test" : "assign-kind-practice"} checked={isTest === t} onChange={() => setIsTest(t)} />
              {t ? testMarkCopy.test : testMarkCopy.practice}
            </label>
          ))}
        </div>
        <span className="mt-1 max-w-xs text-xs text-muted">{isTest ? testMarkCopy.hintTest : testMarkCopy.hintPractice}</span>
      </fieldset>
      {learnerId && unitChoices.length > 0 ? (
        <details className="w-full rounded-xl border border-line px-3" data-testid="assign-units">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{studioCopy.assignUnits(picked.map((u) => u.unit_code))}</summary>
          <div className="pb-3">
            <UnitPicker learnerId={learnerId} choices={unitChoices} state={units} onChange={setUnits} compact help={studioCopy.assignUnitsHelp} testId="assign-unit-picker" />
          </div>
        </details>
      ) : null}
      <SaveStatus state={saveState} />
      <BusyButton busy={busy} busyLabel={busyCopy.saving} type="submit"  data-testid="assign-submit" className="min-h-12 rounded-xl bg-accent px-5 font-bold text-white">{studioCopy.assign}</BusyButton>
      {msg ? <p role="alert" className="w-full text-sm text-[#8A1C12]">{msg}</p> : null}
    </form>
  );
}
