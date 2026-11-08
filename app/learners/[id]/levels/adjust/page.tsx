import Link from "next/link";
import { AdjustForm } from "@/components/levels/AdjustForm";
import { learnerWithTrack, levelCopy, levelFormCopy } from "@/lib/copy/vi";
import { loadLevelProfile } from "@/lib/levels/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Điều chỉnh cấp" (?domain=): the child's tutor only. Without a confirmed domain chosen it lists the confirmed ones. */
export default async function AdjustPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ domain?: string }> }) {
  const { id } = await params;
  const { domain } = await searchParams;
  const { learner } = await requireLearnerPage(id, "levels:decide");
  const profile = await loadLevelProfile(learner.id);
  const confirmed = profile.domains.filter((d) => d.status === "confirmed");
  const chosen = confirmed.find((d) => d.key === domain) ?? null;
  const link = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline";
  return (
    <>
      <div className="mx-auto max-w-2xl" data-testid="adjust-page">
        <Link href={`/learners/${learner.id}/levels`} className={link}>
          {levelFormCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{levelFormCopy.adjustTitle(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{levelFormCopy.adjustIntro}</p>
        {chosen ? (
          <AdjustForm key={chosen.key} learnerId={learner.id} domain={{ key: chosen.key, name: chosen.name, scale: chosen.scale, current: chosen.current }} />
        ) : confirmed.length === 0 ? (
          <p className="mt-4" data-testid="adjust-none">
            {levelFormCopy.pickNone}{" "}
            <Link href={`/learners/${learner.id}/levels/baseline`} className={link}>
              {levelCopy.confirmLink}
            </Link>
          </p>
        ) : (
          <nav aria-label={levelFormCopy.pickDomain} className="mt-4">
            <h2 className="text-lg font-semibold">{levelFormCopy.pickDomain}</h2>
            <ul className="mt-2 flex flex-col gap-1">
              {confirmed.map((d) => (
                <li key={d.key}>
                  <Link href={`/learners/${learner.id}/levels/adjust?domain=${d.key}`} className={link} data-testid={`adjust-pick-${d.key}`}>
                    {d.name} · {levelCopy.levelName(d.scale, d.current)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </>
  );
}
