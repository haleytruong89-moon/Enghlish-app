import { levelsStudentCopy as c } from "@/lib/copy/vi";
import { latestLevelDate, type LevelsView } from "@/lib/student/levels";
import { ddmm } from "@/lib/student/week";

/**
 * "Cấp hiện tại theo mảng" (W4e · S-5): the NAME of the level the tutor confirmed for each domain ("B2", "B1+"), plus "Hướng tới" = the summit
 * the tutor named on the mountain (if any). Never a number, a score or a comparison; a domain not confirmed yet says so; no Tư duy domain (Q18).
 */
export function LevelsCard({ view, summitTitle }: { view: LevelsView; summitTitle: string | null }) {
  if (view.tiles.length === 0) return null;
  const date = latestLevelDate(view);
  return (
    <section className="rounded-2xl border border-line bg-white p-5" aria-labelledby="levels-card-title" data-testid="levels-card">
      <h2 id="levels-card-title" className="text-lg font-semibold">{c.title}</h2>
      <p className="text-sm text-muted">
        {date ? <>{c.noteDated} <time dateTime={date}>{ddmm(date)}</time></> : c.noneYet}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {view.tiles.map((t) => (
          <li key={t.key} className="rounded-xl border border-line bg-white px-3.5 py-3" data-testid={`level-tile-${t.key}`} data-confirmed={t.level ? "yes" : "no"}>
            <p className="text-[13.5px] text-muted">{t.name}</p>
            {t.level ? (
              <p className="text-[22px] font-bold leading-tight" data-testid={`level-name-${t.key}`}>{t.level}</p>
            ) : (
              <p className="text-sm font-medium text-muted">{c.waiting}</p>
            )}
          </li>
        ))}
      </ul>
      {summitTitle ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-[#F1F6F3] px-3.5 py-3" data-testid="levels-target">
          <div>
            <p className="text-[13.5px] text-muted">{c.target}</p>
            <p className="text-lg font-bold text-[#1F4439]">{summitTitle}</p>
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-sm text-muted">{c.foot}</p>
    </section>
  );
}
