import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { LearnerCard } from "@/components/LearnerCard";
import { home } from "@/lib/copy/vi";
import { loadHome } from "@/lib/home/loadHome";
import { safeColor } from "@/lib/home/visible";

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
    return (
      <>
        <AppHeader showTestBadge={anyTest} />
        <main className="mx-auto max-w-xl px-4 py-12">
          <h1 className="text-4xl font-bold" style={{ color: safeColor(me?.color) }}>
            {home.studentGreeting(alias)}
          </h1>
          <p className="mt-4 text-lg">{home.studentEmpty}</p>
        </main>
      </>
    );
  }

  const isParent = data.kind === "parent";
  return (
    <>
      <AppHeader name={data.displayName} showTestBadge={anyTest} />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold">{isParent ? home.parentTitle : home.tutorTitle}</h1>
        {isParent ? <p className="mt-2 text-muted">{home.parentSummary(data.learners.length)}</p> : null}
        {data.learners.length === 0 && !isParent ? <p className="mt-4 text-muted">{home.tutorEmpty}</p> : null}
        <ul className="mt-6 flex flex-col gap-3">
          {data.learners.map((l) => (
            <LearnerCard key={l.id} learner={l} />
          ))}
        </ul>
      </main>
    </>
  );
}
