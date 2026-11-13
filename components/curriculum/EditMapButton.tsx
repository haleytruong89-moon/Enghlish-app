"use client";

import { BusyButton } from "@/components/ui/BusyButton";
import { busyCopy } from "@/lib/copy/vi";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";

/** "Sửa mục lục / bảng nối": makes (or reopens) the draft of the next version, copied from the version in use. */
export function EditMapButton({ curriculumId }: { curriculumId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  async function go() {
    setBusy(true);
    const r = await sendJson<{ version_id: string }>(`/api/curricula/${curriculumId}/edit`, "POST", { client_id: clientId.current });
    setBusy(false);
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    router.push(`/curricula/versions/${r.body.version_id}`);
  }
  return (
    <span className="inline-flex flex-col">
      <BusyButton busy={busy} busyLabel={busyCopy.saving} type="button"  onClick={() => void go()} title={curriculumCopy.editHint} data-testid={`curriculum-edit-${curriculumId}`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline disabled:opacity-60">
        {curriculumCopy.editMap}
      </BusyButton>
      {problem ? <span role="alert" className="text-xs text-[#8A1C12]">{problem}</span> : null}
    </span>
  );
}
