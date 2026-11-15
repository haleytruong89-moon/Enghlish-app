import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { JourneyView } from "@/components/student/journey/JourneyView";
import { journeyCopy } from "@/lib/copy/vi";
import { loadHome } from "@/lib/home/loadHome";
import { loadJourneyPage } from "@/lib/student/load";

export const dynamic = "force-dynamic";

/** "Hành trình" of the signed-in student (W4a). Staff, and a real child on a preview (ALLOW_REAL_LEARNERS=false), get a plain 404. */
export default async function JourneyPage() {
  const home = await loadHome();
  if (home.kind === "signed-out") redirect("/login");
  if (home.kind !== "student" || home.learners.length === 0) notFound();
  const data = await loadJourneyPage();
  if (data.kind === "login") redirect("/login");
  if (data.kind === "not-found") notFound();
  const anyTest = home.learners.some((l) => l.isTest);
  return (
    <>
      <AppHeader showTestBadge={anyTest} studentNav="journey" />
      {data.kind === "ok" ? (
        <JourneyView journey={data.journey} />
      ) : (
        <main className="mx-auto max-w-xl px-5 py-12">
          <h1 className="text-3xl font-bold">{journeyCopy.title}</h1>
          <p className="mt-4 text-lg" data-testid="journey-unavailable">{journeyCopy.unavailable}</p>
        </main>
      )}
    </>
  );
}
