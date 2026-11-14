import { journeyCopy } from "@/lib/copy/vi";
import type { Journey } from "@/lib/journey/path";

/** "Giáo trình khác": name + "n/N Unit đã xong" (counts of the child's own Units), and the milestones that are not on the mountain. */
export function OtherCurricula({ journey }: { journey: Journey }) {
  const hasOthers = journey.others.length > 0 && journey.mainTitle !== null;
  if (!hasOthers && journey.otherMilestones.length === 0) return null;
  return (
    <>
      {hasOthers ? (
        <section className="rounded-2xl border border-line bg-white p-5" aria-labelledby="journey-others" data-testid="journey-others">
          <h2 id="journey-others" className="text-lg font-semibold">{journeyCopy.otherTitle}</h2>
          <p className="mt-1 text-sm text-muted">{journeyCopy.otherNote(journey.mainTitle as string)}</p>
          <ul className="mt-3 flex flex-col gap-3">
            {journey.others.map((o) => (
              <li key={o.id} className="flex flex-col gap-1">
                <span className="font-medium">{o.title}</span>
                <span className="text-sm text-muted" data-count="work">{journeyCopy.otherDone(o.done, o.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {journey.otherMilestones.length > 0 ? (
        <section className="rounded-2xl border border-line bg-white p-5" aria-labelledby="journey-other-ms" data-testid="journey-other-milestones">
          <h2 id="journey-other-ms" className="text-lg font-semibold">{journeyCopy.otherMilestones}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {journey.otherMilestones.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{m.title}</span>
                {m.targetMonth ? <span className="text-sm text-muted">{journeyCopy.month(m.targetMonth, m.approx)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
