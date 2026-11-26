"use client";

import { BusyButton } from "@/components/ui/BusyButton";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { curriculumCopy } from "@/lib/copy/vi";
import { curriculumErrorText, sendJson } from "@/lib/curriculum/client";

/**
 * 27/11 "Xóa giáo trình này": on a card that never had an approved table of contents and whose AI read failed. It gives up the
 * open draft (the existing "Bỏ nháp", tutor or parent); a curriculum with only given-up versions leaves every list (`isRemovedCurriculum`).
 * Nothing is deleted from the database, and nothing of the child points to such a curriculum.
 */
export function RemoveCurriculumButton({ versionId, title, curriculumId }: { versionId: string; title: string; curriculumId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function go() {
    if (!window.confirm(curriculumCopy.removeConfirm(title))) return;
    setBusy(true);
    const r = await sendJson(`/api/curricula/versions/${versionId}/discard`, "POST");
    setBusy(false);
    if (!r.ok) return setProblem(curriculumErrorText(r.error));
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col">
      <BusyButton busy={busy} busyLabel={curriculumCopy.removing} type="button" onClick={() => void go()} data-testid={`curriculum-remove-${curriculumId}`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-[#8A1C12] underline disabled:opacity-60">
        {curriculumCopy.remove}
      </BusyButton>
      {problem ? <span role="alert" className="text-xs text-[#8A1C12]">{problem}</span> : null}
    </span>
  );
}
