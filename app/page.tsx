import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { LearnerCard } from "@/components/LearnerCard";
import { StudentHome } from "@/components/student/StudentHome";
import Link from "next/link";
import { home, reviewPage } from "@/lib/copy/vi";
import { loadHome } from "@/lib/home/loadHome";
import { countToDecide } from "@/lib/review/load";
import { safeColor } from "@/lib/home/visible";
import { loadStudentHome } from "@/lib/work/load";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await loadHome();
  if (data.kind === "signed-out") redirect("/login");

  if (data.kind === "no-member") {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-xl px-4 py-12">
          <h1 className="text-2xl font-bold">{home.noAccessTitle}</h1>
          <p className="mt-3 text-muted">{home.noAccessBody}</p>
        </main>
      </>
    );
  }

  const anyTest = data.learners.some((l) => l.isTest);

  if (data.kind === "student") {
    const me = data.learners[0];
    const alias = me?.alias ?? data.displayName;
    const color = safeColor(me?.color);
    const work = await loadStudentHome();
    if (work.kind === "login") redirect("/login");
    return (
      <>
        <AppHeader showTestBadge={anyTest} />
        {work.kind === "ok" ? (
          <StudentHome alias={alias} color={color} data={work.home} />
        ) : (
          <main className="mx-auto max-w-xl px-5 py-12">
            <h1 className="text-4xl font-bold" style={{ color }}>
              {home.studentGreeting(alias)}
            </h1>
            <p className="mt-4 text-lg">{home.studentEmpty}</p>
          </main>
        )}
      </>
    );
  }

  const isParent = data.kind === "parent";
  // How much work waits for this person. A failed lookup must not take the whole home page down: show the link without a number.
  let toDecide: number | null = null;
  try {
    toDecide = await countToDecide();
  } catch {
    toDecide = null;
  }
  return (
    <>
      <AppHeader name={data.displayName} showTestBadge={anyTest} />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold">{isParent ? home.parentTitle : home.tutorTitle}</h1>
        {isParent ? <p className="mt-2 text-muted">{home.parentSummary(data.learners.length)}</p> : null}
        {data.learners.length === 0 && !isParent ? <p className="mt-4 text-muted">{home.tutorEmpty}</p> : null}
        <Link
          href="/review"
          data-testid="review-link"
          className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-accent px-5 text-base font-semibold text-white"
        >
          {toDecide === null ? reviewPage.link : reviewPage.linkCount(toDecide)}
        </Link>
        <ul className="mt-6 flex flex-col gap-3">
          {data.learners.map((l) => (
            <LearnerCard key={l.id} learner={l} />
          ))}
        </ul>
      </main>
    </>
  );
}
