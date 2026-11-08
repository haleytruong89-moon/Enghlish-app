import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ImportConfirm } from "@/components/import/ImportConfirm";
import { ImportWaiting } from "@/components/import/ImportWaiting";
import { StaffShell } from "@/components/shell/StaffShell";
import { importCopy } from "@/lib/copy/vi";
import { loadImportPage } from "@/lib/import/load";
import { requireShell } from "@/lib/shell/load";

export const dynamic = "force-dynamic";

/** Xem và xác nhận bài nạp (W3): waiting while the AI reads, the review table, or the end state. The child's tutor or parent; others 404. Wide page. */
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadImportPage(id);
  if (r.kind === "login") redirect("/login");
  if (r.kind === "not-found") notFound();
  const shell = await requireShell(r.data.import.learnerId);
  const { import: b } = r.data;
  const learnerId = b.learnerId;
  return (
    <StaffShell shell={shell}>
      <div className="mx-auto max-w-[1100px]" data-testid="import-page" data-status={b.status}>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{importCopy.confirmTitle}</h1>
          <Link href={`/learners/${learnerId}/knowledge`} data-testid="import-close" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold">
            {importCopy.closed}
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">{b.title}</p>
        {b.status === "reading" ? <ImportWaiting importId={b.id} /> : null}
        {b.status === "ai_failed" ? (
          <section role="alert" data-testid="import-ai-failed" className="mt-4 rounded-2xl border border-[#E9C46A] bg-[#FBF1DC] p-4 text-[#6B4600]">
            <p className="font-semibold">{importCopy.readFailed}</p>
            {b.errorCode && importCopy.failReasons[b.errorCode] ? <p className="text-sm">{importCopy.readFailedWhy(importCopy.failReasons[b.errorCode]!)}</p> : null}
            <Link href={`/learners/${learnerId}/imports/new`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline">
              {importCopy.tryAgain}
            </Link>
          </section>
        ) : null}
        {b.status === "draft" && b.payload ? <ImportConfirm data={r.data} learnerId={learnerId} /> : null}
        {b.status === "confirmed" ? (
          <p className="mt-4 font-semibold text-accent" data-testid="import-confirmed">
            {importCopy.confirmed}{" "}
            <Link href={`/learners/${learnerId}/knowledge`} className="font-normal underline">
              {importCopy.confirmedGo}
            </Link>
          </p>
        ) : null}
        {b.status === "discarded" ? <p className="mt-4 text-muted">{importCopy.discarded}</p> : null}
      </div>
    </StaffShell>
  );
}
