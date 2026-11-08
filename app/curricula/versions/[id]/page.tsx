import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffShell } from "@/components/shell/StaffShell";
import { requireShell } from "@/lib/shell/load";
import { MapTable } from "@/components/curriculum/MapTable";
import { TocWaiting } from "@/components/curriculum/TocWaiting";
import { VersionReview } from "@/components/curriculum/VersionReview";
import { curriculumCopy, studioCopy } from "@/lib/copy/vi";
import { loadVersionPage } from "@/lib/curriculum/load";
import { loadPickerMap } from "@/lib/skillmap/load";
import { loadTags } from "@/lib/tutorwork/load";

export const dynamic = "force-dynamic";

/** Duyệt mục lục (draft) or the read-only Bảng nối (approved / superseded). The child's tutor or parent; others 404. Wide page (spec §5.1). */
export default async function CurriculumVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadVersionPage(id);
  if (r.kind === "login") redirect("/login");
  if (r.kind === "not-found") notFound();
  const shell = await requireShell(r.data.version.learnerId);
  const { version: v, stats } = r.data;
  const back = `/learners/${v.learnerId}/curricula`;
  const editable = v.status === "draft" || v.status === "ai_failed";
  const [map, tags] = editable ? await Promise.all([loadPickerMap(v.learnerId), loadTags(r.data.track_id)]) : [null, null];
  const labelOf = Object.fromEntries(r.data.context.tags.map((t) => [t.key, t.label]));
  return (
    <StaffShell shell={shell}>
      <div className="mx-auto max-w-[1240px]" data-testid="curriculum-version" data-status={v.status}>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{editable || v.status === "extracting" ? curriculumCopy.reviewTitle(v.title, v.version) : curriculumCopy.mapTitle(v.title, v.version)}</h1>
          <Link href={back} data-testid="version-close" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold">
            {curriculumCopy.close}
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">{curriculumCopy.statusLabels[v.status]}</p>
        {v.aiCostUsd !== null && v.source === "ai" ? (
          <p className="mt-1 text-sm text-muted" data-testid="version-ai-cost">{curriculumCopy.aiCost(`$${v.aiCostUsd.toFixed(4)}`)}</p>
        ) : null}
        {v.status === "extracting" ? <TocWaiting versionId={v.id} /> : null}
        {v.status === "ai_failed" ? (
          <section role="alert" data-testid="toc-ai-failed" className="mt-4 rounded-2xl border border-[#E9C46A] bg-[#FBF1DC] p-4 text-[#6B4600]">
            <p className="font-semibold">{curriculumCopy.aiFailedTitle}</p>
            <p className="text-sm">
              {(v.errorCode && (studioCopy.aiFailedReason as Record<string, string>)[v.errorCode]) ?? ""} {curriculumCopy.aiFailedNext}
            </p>
          </section>
        ) : null}
        {editable && map && tags ? <div className="mt-4"><VersionReview initial={r.data} map={map} tags={tags} learnerId={v.learnerId} /></div> : null}
        {v.status === "approved" || v.status === "superseded" ? (
          <>
            {v.status === "approved" ? (
              <p className="mt-4 font-semibold text-accent" data-testid="version-approved">
                {curriculumCopy.approvedTitle} <span className="font-normal text-muted">{curriculumCopy.approvedNote}</span>
              </p>
            ) : null}
            {stats ? <p className="mt-1 text-sm" data-testid="review-stats">{curriculumCopy.stats(stats)}</p> : null}
            <MapTable units={v.payload.units} labelOf={labelOf} />
          </>
        ) : null}
        {v.status === "discarded" ? <p className="mt-4 text-muted">{curriculumCopy.statusLabels.discarded}</p> : null}
      </div>
    </StaffShell>
  );
}
