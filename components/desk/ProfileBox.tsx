import Link from "next/link";
import { deskCopy, levelCopy, shellCopy, todayPage } from "@/lib/copy/vi";
import { strongestWeakest } from "@/lib/levels/scale";
import type { LevelProfile } from "@/lib/levels/types";
import { boxValue, profileSummary } from "@/lib/levels/view";
import type { WeakPoint } from "@/lib/tutorwork/types";

export const BOX = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-white p-5";
export const BOX_LINK = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline";

export function ProfileBox({ learnerId, alias, profile, weak }: { learnerId: string; alias: string; profile: LevelProfile | null; weak: WeakPoint[] }) {
  const sw = profile ? strongestWeakest(profile.domains) : null;
  return (
    <section data-testid="desk-profile" className={BOX}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{shellCopy.sections.profile}</h2>
        <Link href={`/learners/${learnerId}/levels`} className={BOX_LINK}>{deskCopy.seeAll}</Link>
      </div>
      {profile && sw ? (
        <>
          <p className="text-sm">{profileSummary(alias, profile)}</p>
          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{levelCopy.strongest}</dt><dd>{sw.even ? levelCopy.even : boxValue(sw.strongest)}</dd>
            <dt className="text-muted">{levelCopy.focus}</dt><dd>{sw.even ? levelCopy.even : boxValue(sw.weakest)}</dd>
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted" data-testid="desk-profile-unavailable">{deskCopy.profileUnavailable}</p>
      )}
      <div>
        <h3 className="text-sm font-semibold">{todayPage.attentionTitle}</h3>
        {weak.length === 0 ? (
          <p className="text-sm text-muted">{deskCopy.attentionNone}</p>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {weak.slice(0, 3).map((w) => <li key={w.tagKey}>{w.label} · <span className="text-muted">{todayPage.repeatBadge(w.sources)}</span></li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
