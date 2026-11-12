import Link from "next/link";
import { levelCopy } from "@/lib/copy/vi";
import { barFraction } from "@/lib/levels/scale";
import type { LevelProfile } from "@/lib/levels/types";
import { levelsAction, levelsHref, levelText } from "@/lib/levels/view";
import { CEFR_LEVELS, type DomainKey } from "@/lib/skillmap/types";
import { solidLine } from "@/lib/skills/view";

/** Striped fill of an assumed level (with a dashed border and words: never colour alone, UX guide §4.3). */
const STRIPES = "repeating-linear-gradient(45deg, #CFE0D8 0 6px, #F4F8F5 6px 12px)";

/**
 * 7 horizontal bars (D5): the 6 CEFR domains on one A1 → C2 scale, the thinking domain on its own 1 → 4 scale with the same width.
 * Each bar opens the detail of its domain (?domain=). Staff only.
 */
export function LevelBars({ profile, learnerId, active, solid, canDecide = false }: { profile: LevelProfile; learnerId: string; active: string; canDecide?: boolean; solid?: Partial<Record<DomainKey, { n: number; total: number }>> | null }) {
  return (
    <section aria-labelledby="level-bars-title" className="mt-6 rounded-xl border border-line bg-white p-5" data-testid="level-bars">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="level-bars-title" className="text-lg font-semibold">
          {levelCopy.barsTitle}
        </h2>
        <span className="text-xs text-muted">{levelCopy.scaleCefr}</span>
      </div>
      {canDecide ? (
        <Link
          href={levelsHref(learnerId, levelsAction(profile.domains))}
          data-testid="levels-action"
          className="mt-3 inline-flex min-h-12 items-center rounded-xl bg-accent px-5 text-base font-semibold text-white no-underline"
        >
          {levelsAction(profile.domains) === "confirm" ? levelCopy.confirmAllAction(profile.domains.filter((d) => d.status === "assumed").length) : levelCopy.adjustAction}
        </Link>
      ) : null}
      <ul className="mt-3 flex flex-col gap-2">
        {profile.domains.map((d) => {
          const pct = Math.round(barFraction(d.scale, d.current) * 100);
          const on = d.key === active;
          const assumed = d.status === "assumed";
          return (
            <li key={d.key}>
              <Link
                href={`/learners/${learnerId}/levels?domain=${d.key}`}
                aria-current={on ? "true" : undefined}
                data-testid={`level-bar-${d.key}`}
                data-status={d.status}
                className={`grid min-h-11 grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-ink no-underline sm:grid-cols-[9rem_minmax(0,1fr)_12rem] ${on ? "bg-[#E3ECE8]" : "hover:bg-paper"}`}
              >
                <span className="text-sm font-medium">{d.name}</span>
                <span className="relative h-4 rounded-full bg-[#EEF1EC]" aria-hidden="true">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${assumed ? "border-2 border-dashed border-accent" : "bg-accent"}`}
                    style={assumed ? { width: `${pct}%`, backgroundImage: STRIPES } : { width: `${pct}%` }}
                  />
                </span>
                <span className="col-span-2 text-sm sm:col-span-1">
                  <b className="font-semibold">{levelText(d.scale, d.current)}</b>
                  {d.scale === "task_level" ? <span className="text-muted"> · {levelCopy.scaleTask}</span> : null}
                  {assumed ? (
                    <span className="block text-xs text-muted" data-testid={`level-assumed-${d.key}`}>
                      {levelCopy.assumed}
                    </span>
                  ) : null}
                  {solidLine(solid?.[d.key]) ? (
                    <span className="block text-xs text-muted" data-testid={`level-solid-${d.key}`}>
                      {solidLine(solid?.[d.key])}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 hidden grid-cols-9 text-center text-[11px] text-muted sm:ml-[9.75rem] sm:mr-[12.75rem] sm:grid" aria-hidden="true">
        {CEFR_LEVELS.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </p>
    </section>
  );
}
