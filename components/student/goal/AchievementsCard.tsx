import { achievementsCopy as c } from "@/lib/copy/vi";
import type { AchievementItem } from "@/lib/student/achievements";
import { ddmm } from "@/lib/student/week";
import type { ShownAchievements } from "@/lib/student/weekView";

/** The words of an achievement (name / what is still missing). Pure text: the copy lives in lib/copy/vi.ts. */
export function achievementName(i: AchievementItem): string {
  switch (i.kind) {
    case "first_work": return c.name.first_work;
    case "units": return c.name.units(i.n as number);
    case "units_all": return c.name.units_all;
    case "streak": return c.name.streak(i.n as number);
    case "weeks": return c.name.weeks(i.n as number);
    case "writing": return c.name.writing(i.n as number);
    case "topic_first": return c.name.topic_first;
    case "revision_first": return c.name.revision_first;
    case "milestone": return i.title ?? "";
    case "cando": return c.name.cando(i.n as number);
  }
}
export function achievementNeed(i: AchievementItem): string {
  const k = i.need - i.have;
  switch (i.kind) {
    case "first_work": return c.need.first_work;
    case "units": return c.need.units(k);
    case "units_all": return c.need.units_all(k);
    case "streak": return c.need.streak(i.n as number);
    case "weeks": return c.need.weeks(k);
    case "writing": return c.need.writing(k, i.have);
    case "topic_first": return c.need.topic_first;
    case "revision_first": return c.need.revision_first;
    case "milestone": return c.need.milestone(k);
    case "cando": return c.need.cando(k, i.have);
  }
}

function Item({ item }: { item: AchievementItem }) {
  const emoji = c.emoji[item.kind];
  return (
    <li className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${item.earned ? "border-accent/40 bg-[#F1F6F3]" : "border-dashed border-line bg-white"}`} data-testid={`achievement-${item.key}`} data-earned={item.earned ? "yes" : "no"}>
      <span aria-hidden="true" className={`text-2xl leading-none ${item.earned ? "" : "opacity-40"}`}>{emoji}</span>
      <div className="min-w-0">
        <p className="font-semibold leading-snug">{achievementName(item)}</p>
        <p className="text-sm text-muted">
          {item.earned ? (
            item.date ? <>{c.gotLabel} <time dateTime={item.date}>{ddmm(item.date)}</time></> : c.gotNoDate
          ) : (
            achievementNeed(item)
          )}
        </p>
      </div>
    </li>
  );
}

/** "Bộ sưu tập thành tích": everything earned + the three closest. No coins, no points, no comparison. */
export function AchievementsCard({ shown }: { shown: ShownAchievements }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5" aria-labelledby="achievements-title" data-testid="achievements-card">
      <h2 id="achievements-title" className="text-lg font-semibold">{c.title}</h2>
      <p className="text-sm text-muted">{c.note}</p>
      {shown.earned.length === 0 && shown.nearly.length === 0 ? <p className="mt-3 text-sm text-muted">{c.empty}</p> : null}
      {shown.earned.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label={c.earnedTitle}>
          {shown.earned.map((i) => <Item key={i.key} item={i} />)}
        </ul>
      ) : null}
      {shown.nearly.length > 0 ? (
        <>
          <h3 className="mt-4 text-[15px] font-semibold text-muted">{c.nearlyTitle}</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label={c.nearlyTitle}>
            {shown.nearly.map((i) => <Item key={i.key} item={i} />)}
          </ul>
        </>
      ) : null}
    </section>
  );
}
