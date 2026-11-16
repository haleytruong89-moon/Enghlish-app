import { levelsStudentCopy as c } from "@/lib/copy/vi";
import { latestLevelDate, type LevelsView } from "@/lib/student/levels";
import { ddmm } from "@/lib/student/week";

/**
 * "Cấp hiện tại theo mảng" (W4e · S-5): the NAME of the level the tutor confirmed for each domain ("B2", "B1+"). Never a number, a score or a comparison; a domain not confirmed yet says so; no Tư duy domain (Q18).
 */
export function LevelsCard({ view }: { view: LevelsView }) {
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
      <p className="mt-3 text-sm text-muted">{c.foot}</p>
    </section>
  );
}
