// components/studio/EditApprovedButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { studioCopy } from "@/lib/copy/vi";
import { sendJson } from "@/lib/studio/client";

/** "Sửa đề đã duyệt": a new draft that will become version n+1; assigned work keeps its version. */
export function EditApprovedButton({ draftId }: { draftId: string }) {
  const router = useRouter();
  const clientId = useRef(crypto.randomUUID());
  return (
    <button type="button" className="mt-4 min-h-11 text-sm text-accent underline" data-testid="edit-approved"
      onClick={async () => {
        const r = await sendJson<{ id: string }>(`/api/studio/drafts/${draftId}/edit`, "POST", { client_id: clientId.current });
        if (r.ok) router.push(`/studio/drafts/${r.body.id}`);
      }}>
      {studioCopy.editApproved}
    </button>
  );
}
