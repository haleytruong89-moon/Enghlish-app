"use client";

import Link from "next/link";
import { useState } from "react";
import { fallbackLabels, purgePage } from "@/lib/copy/vi";
import { nameMatches } from "@/lib/purge/name";
import { postJson } from "@/lib/tutorwork/client";

type Done = { filesRemoved: number | null; filesOk: boolean };

/**
 * "Xóa dữ liệu của em": the numbers come from the dry run; the parent types the child's name (and, for a real child, ticks a second
 * confirmation) before the button works. The server checks both again.
 */
export function PurgeForm({
  learnerId,
  alias,
  isTest,
  counts,
}: {
  learnerId: string;
  alias: string;
  isTest: boolean;
  counts: Record<string, number>;
}) {
  const [typed, setTyped] = useState("");
  const [real, setReal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const rows = Object.entries(counts).filter(([key, n]) => n > 0 && key !== "learners" && key !== "audit_log");
  const ready = nameMatches(typed, alias) && (isTest || real);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const r = await postJson<{ files_removed: number | null; files_ok: boolean }>(`/api/learners/${learnerId}/purge`, {
      confirm_name: typed,
      ...(isTest ? {} : { confirm_real: real }),
    });
    setBusy(false);
    if (!r.ok) return setError(r.status === 0 ? purgePage.errors.offline : ((purgePage.errors as Record<string, string | undefined>)[r.error] ?? purgePage.errors.generic));
    setDone({ filesRemoved: r.body.files_removed, filesOk: r.body.files_ok });
  }

  if (done) {
    return (
      <div role="status" className="mt-6 flex flex-col gap-2 rounded-xl border border-accent bg-white p-4" data-testid="purge-done">
        <p className="font-semibold text-accent">{purgePage.done}</p>
        {done.filesOk ? <p className="text-sm">{purgePage.doneFiles(done.filesRemoved ?? 0)}</p> : <p className="text-sm text-red-700">{purgePage.filesLeft}</p>}
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline">
          {purgePage.homeLink}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-5" data-testid="purge-form">
      <section className="rounded-xl border border-line bg-white p-4" data-testid="purge-counts">
        <h2 className="text-base font-semibold">{purgePage.countsTitle}</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{purgePage.countsNone}</p>
        ) : (
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {rows.map(([key, n]) => (
              <li key={key} data-testid={`purge-count-${key}`}>
                {purgePage.countLine(purgePage.countLabels[key] ?? fallbackLabels.record, n)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isTest ? (
        <p className="text-sm text-muted">{purgePage.testNote}</p>
      ) : (
        <label className="flex items-start gap-3 rounded-xl border border-red-300 bg-white p-4 text-sm" data-testid="purge-real">
          <input type="checkbox" className="mt-1 size-5" checked={real} onChange={(e) => setReal(e.target.checked)} data-testid="purge-real-check" />
          <span>
            <b className="block text-red-700">{purgePage.realTitle}</b>
            {purgePage.realConfirm}
          </span>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{purgePage.nameLabel(alias)}</span>
        <input
          type="text"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          data-testid="purge-name"
          className="min-h-11 max-w-md rounded-lg border border-line bg-white px-3"
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-red-700" data-testid="purge-error">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!ready || busy}
        data-testid="purge-submit"
        className="min-h-12 self-start rounded-xl bg-red-700 px-6 text-base font-bold text-white disabled:opacity-50"
      >
        {busy ? purgePage.submitting : purgePage.submit}
      </button>
    </form>
  );
}
