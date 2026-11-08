import { deskHref } from "@/lib/shell/paths";
import Link from "next/link";
import { PurgeForm } from "@/components/admin/PurgeForm";
import { learnerWithTrack, purgePage } from "@/lib/copy/vi";
import { PurgeNeedsMigrationError } from "@/lib/purge/shape";
import { loadPurgePreview } from "@/lib/purge/supabaseStore";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Xóa dữ liệu của em": parent only (tutors and students get a plain 404). Shows what would be deleted, then asks for the child's name. */
export default async function DeleteLearnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { learner } = await requireLearnerPage(id, "admin");
  // Before migration 0017 is applied the dry-run function does not exist: say so in plain words instead of a 500.
  let preview: Awaited<ReturnType<typeof loadPurgePreview>> | null = null;
  try {
    preview = await loadPurgePreview(learner.id);
  } catch (err) {
    if (!(err instanceof PurgeNeedsMigrationError)) throw err;
  }

  return (
    <>
      <div className="mx-auto max-w-3xl" data-testid="purge-page">
        <Link href={deskHref(learner.id)} className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {purgePage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{purgePage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3">{purgePage.intro}</p>
        <p className="mt-2 text-sm text-muted">{purgePage.keepsAccount}</p>
        <p className="mt-1 text-sm text-muted">{purgePage.backupNote}</p>
        {preview ? (
          <PurgeForm learnerId={learner.id} alias={learner.alias} isTest={learner.isTest} counts={preview.counts} />
        ) : (
          <p role="alert" className="mt-6 rounded-lg border border-line bg-white p-4" data-testid="purge-needs-migration">
            {purgePage.needsMigration}
          </p>
        )}
      </div>
    </>
  );
}
