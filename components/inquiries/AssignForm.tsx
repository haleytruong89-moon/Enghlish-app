"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { inquiriesPage } from "@/lib/copy/vi";

/**
 * "Giao bài" for one template. The request id is created when the form opens and renewed whenever a value
 * changes (and after a success), so a double click or a retry after a lost answer never assigns the same
 * inquiry twice (idempotent API) while a changed due date is a new request. After a success the button stays
 * disabled until the due date changes: the same values are never submitted twice.
 */
export function AssignForm({
  learnerId,
  templateId,
  version,
  defaultDue,
  minDue,
  maxDue,
}: {
  learnerId: string;
  templateId: string;
  version: number;
  defaultDue: string;
  /** Allowed window for the due date: today - 7 .. today + 120 (Asia/Ho_Chi_Minh). */
  minDue: string;
  maxDue: string;
}) {
  const router = useRouter();
  const [due, setDue] = useState(defaultDue);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const requestId = useRef<string>(crypto.randomUUID());
  const inputId = `due-${templateId}-${version}`;

  function changeDue(value: string) {
    setDue(value);
    requestId.current = crypto.randomUUID();
    setState((prev) => (prev === "done" || prev === "error" ? "idle" : prev));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy" || state === "done") return;
    setState("busy");
    try {
      const res = await fetch(`/api/learners/${learnerId}/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: templateId, version, due_on: due, client_request_id: requestId.current }),
      });
      if (!res.ok) throw new Error(String(res.status));
      requestId.current = crypto.randomUUID();
      setState("done");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm text-muted">
          {inquiriesPage.dueLabel}
        </label>
        <input
          id={inputId}
          type="date"
          required
          value={due}
          min={minDue}
          max={maxDue}
          onChange={(e) => changeDue(e.target.value)}
          className="min-h-11 rounded-lg border border-line bg-white px-3"
        />
      </div>
      <button
        type="submit"
        disabled={state === "busy" || state === "done"}
        className="min-h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {state === "busy" ? inquiriesPage.assigning : inquiriesPage.assignButton}
      </button>
      <p role="status" className="w-full text-sm text-muted">
        {state === "done" ? inquiriesPage.assignDone : state === "error" ? inquiriesPage.assignError : ""}
      </p>
    </form>
  );
}
