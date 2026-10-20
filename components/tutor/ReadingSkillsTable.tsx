import Link from "next/link";
import { formatDateVi } from "@/lib/inquiries/format";
import { readingPage } from "@/lib/copy/vi";
import type { ReadingSkillsView, ReadingStatus } from "@/lib/reading/types";

const badge: Record<ReadingStatus, string> = {
  weak: "bg-[#7a4a00] text-white",
  thin: "bg-paper text-muted border border-line",
  ok: "bg-[#e5efe9] text-accent",
  none: "bg-paper text-muted border border-line",
};
const monthLabel = (iso: string | null) => (iso ? formatDateVi(iso).replace(/^\d{2}\//, "") : null);

/** "Kỹ năng đọc" on the weak-points page: latest monthly report vs the previous one, plus wrong items of the last 6 weeks. Staff only. */
export function ReadingSkillsTable({ view, learnerId }: { view: ReadingSkillsView; learnerId: string }) {
  return (
    <section className="mt-8" aria-label={readingPage.sectionTitle} data-testid="reading-section">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{readingPage.sectionTitle}</h2>
        <Link href={`/learners/${learnerId}/reading/new`} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline" data-testid="reading-enter">
          {readingPage.enter}
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">{readingPage.sectionIntro(monthLabel(view.latestMonth), view.latestSource)}</p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-2 font-medium">{readingPage.colSkill}</th>
              <th className="px-4 py-2 font-medium">{readingPage.colLatest}</th>
              <th className="px-4 py-2 font-medium">{readingPage.colPrev}</th>
              <th className="px-4 py-2 font-medium">{readingPage.colWrong6w}</th>
            </tr>
          </thead>
          <tbody>
            {view.skills.map((s) => (
              <tr key={s.tagKey} className="border-b border-line last:border-0">
                <td className="px-4 py-2">{s.label}</td>
                <td className="px-4 py-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge[s.status]}`} data-testid={`reading-status-${s.tagKey}`}>
                      {readingPage.status[s.status]}
                    </span>
                    {s.questions !== null && s.correctPct !== null ? <span>{readingPage.pctLine(s.correctPct, s.questions)}</span> : null}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted">{s.prevQuestions !== null && s.prevCorrectPct !== null ? readingPage.pctLine(s.prevCorrectPct, s.prevQuestions) : "—"}</td>
                <td className="px-4 py-2">{s.wrong6w > 0 ? s.wrong6w : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">{readingPage.rule(view.minQuestions, view.weakPct)}</p>
    </section>
  );
}
