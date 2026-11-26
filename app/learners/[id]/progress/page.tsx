import Link from "next/link";
import { ProgressTabs } from "@/components/progress/ProgressTabs";
import { parseResultTab, ResultsView } from "@/components/results/ResultsView";
import { learnerWithTrack, resultsCopy as c } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { loadResults, type ResultsData } from "@/lib/results/load";
import { buildOverview } from "@/lib/results/overview";
import { loadTags } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";
import { deskHref } from "@/lib/shell/paths";

export const dynamic = "force-dynamic";

/** "Tiến bộ" (hướng B; was "Kết quả", 26/11): what the child got right, by test / Unit / knowledge item. "Việc nên làm" lives on Hôm nay (one line points there). The child's tutor or the parent. */
export default async function ProgressPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { learner } = await requireLearnerPage(id, "studio:read");
  const tab = parseResultTab(Array.isArray(sp.tab) ? sp.tab[0] : sp.tab);
  const [data, tags] = await Promise.all([
    loadResults(learner.id, todayVn()).catch((): ResultsData | null => null),
    loadTags(learner.trackId).catch(() => []),
  ]);
  const tagLabels = Object.fromEntries(tags.map((t) => [t.key, t.label]));
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5" data-testid="progress-page">
      <div>
        <h1 className="text-2xl font-bold">{c.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)} · {c.intro}</p>
        <ProgressTabs learnerId={learner.id} current={tab} />
        {tab === "tag" ? (
          <Link href={`/learners/${learner.id}/knowledge`} data-testid="results-knowledge-link" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">
            {c.knowledgeLink}
          </Link>
        ) : null}
      </div>
      {data && data.allActions.length > 0 ? (
        <Link href={`${deskHref(learner.id)}#viec-nen-lam`} data-testid="progress-actions-line" className="inline-flex min-h-11 items-center self-start rounded-xl bg-[#FBF1DC] px-4 text-sm font-semibold text-[#6B4600] no-underline">
          {c.overview.actionsLine(data.allActions.length)}
        </Link>
      ) : null}
      {data === null ? (
        <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted" data-testid="results-unavailable">{c.unavailable}</p>
      ) : (
        <ResultsView learnerId={learner.id} tab={tab} works={data.works} units={data.units} tags={data.tags} tagLabels={tagLabels} overview={buildOverview(data.works, data.tags, data.main, todayVn())} />
      )}
    </div>
  );
}
