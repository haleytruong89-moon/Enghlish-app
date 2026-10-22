import Link from "next/link";
import { levelCopy, weakPage } from "@/lib/copy/vi";
import { bandOf } from "@/lib/levels/scale";
import type { DomainLevel } from "@/lib/levels/types";
import { dayLabel, domainSentence, levelText } from "@/lib/levels/view";
import type { SkillGroup } from "@/lib/skillmap/types";
import type { WeakPoint } from "@/lib/tutorwork/types";

const linkClass = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline";

/**
 * The detail of one domain (D14): a plain sentence, what the current level covers (group descriptions of SM-1 for that band), the
 * three boxes that need skill states (honest empty state until S7, D3), and up to 5 weak points of the domain. The tutor also gets
 * "Xác nhận cấp khởi điểm" (assumed) or "Điều chỉnh cấp" (confirmed).
 */
export function DomainDetail({
  alias,
  domain,
  groups,
  weak,
  learnerId,
  canDecide,
}: {
  alias: string;
  domain: DomainLevel;
  groups: SkillGroup[];
  weak: WeakPoint[];
  learnerId: string;
  canDecide: boolean;
}) {
  const band = bandOf(domain.scale, domain.current);
  const content = groups.flatMap((g) => {
    const text = band ? g.descriptions[band] : null;
    return text ? [{ key: g.key, name: g.name, text }] : [];
  });
  const points = weak.filter((p) => p.status !== "ok").slice(0, 5);
  const assumed = domain.status === "assumed";
  const decideHref = assumed ? `/learners/${learnerId}/levels/baseline` : `/learners/${learnerId}/levels/adjust?domain=${domain.key}`;
  return (
    <section aria-labelledby="level-detail-title" className="mt-6 rounded-xl border border-line bg-white p-5" data-testid={`level-detail-${domain.key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="level-detail-title" className="text-xl font-semibold">
          {levelCopy.detailTitle(domain.name)}
        </h2>
        {canDecide ? (
          <Link href={decideHref} className={linkClass} data-testid="level-decide-link">
            {assumed ? levelCopy.confirmLink : levelCopy.adjustLink}
          </Link>
        ) : null}
      </div>
      <p className="mt-2">{domainSentence(alias, domain)}</p>
      <p className="text-sm text-muted">{!assumed && domain.decidedAt ? levelCopy.confirmedOn(dayLabel(domain.decidedAt), domain.decidedBy) : levelCopy.assumed}</p>

      {content.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold">{levelCopy.contentTitle(levelText(domain.scale, domain.current))}</h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm" data-testid="level-content">
            {content.map((c) => (
              <li key={c.key}>
                <b className="font-semibold">{c.name}:</b> {c.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="level-mastery">
        {[levelCopy.solidTitle, levelCopy.practisingTitle, levelCopy.nextTitle].map((t) => (
          <div key={t} className="rounded-lg border border-dashed border-line px-3 py-2">
            <h3 className="text-sm font-semibold">{t}</h3>
            <p className="text-sm text-muted">{levelCopy.notYet}</p>
          </div>
        ))}
      </div>

      <div className="mt-4" data-testid="level-weak">
        <h3 className="text-base font-semibold">{levelCopy.weakTitle}</h3>
        {points.length === 0 ? (
          <p className="text-sm text-muted">{levelCopy.weakNone}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {points.map((p) => (
              <li key={p.tagKey}>
                {p.label} · {p.status === "repeat" ? weakPage.statusRepeat : weakPage.statusWatch}
              </li>
            ))}
          </ul>
        )}
        <Link href={`/learners/${learnerId}/weak?domain=${domain.key}`} className={linkClass}>
          {levelCopy.weakMore}
        </Link>
      </div>
    </section>
  );
}
