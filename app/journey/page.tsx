import { notFound, redirect } from "next/navigation";
import { StudentDeskShell } from "@/components/student/desk/StudentDeskShell";
import { JourneyView } from "@/components/student/journey/JourneyView";
import { journeyCopy } from "@/lib/copy/vi";
import { loadDeskBase } from "@/lib/student/desk";
import { loadJourneyPage } from "@/lib/student/load";
import { candoTimes } from "@/lib/student/cando";
import { loadMyGrowth } from "@/lib/student/growthLoad";
import { loadMyWeekView } from "@/lib/student/weekLoad";
import { buildAchievements } from "@/lib/student/weekView";

export const dynamic = "force-dynamic";

/** "Hành trình" of the signed-in student (W4a). Staff, and a real child on a preview (ALLOW_REAL_LEARNERS=false), get a plain 404. */
export default async function JourneyPage() {
  const [base, data, week, growth] = await Promise.all([loadDeskBase(), loadJourneyPage(), loadMyWeekView(), loadMyGrowth()]);
  if (base.kind === "login" || data.kind === "login") redirect("/login");
  if (base.kind !== "ok" || data.kind === "not-found") notFound();
  return (
    <StudentDeskShell active="journey" learnerId={base.learnerId} seenTimes={(base.seenFirst ?? []).map((r) => r.newsAt)} showTestBadge={base.isTest}>
      {data.kind === "ok" ? (
        <JourneyView
          journey={data.journey}
          week={week?.view ?? null}
          achievements={week ? buildAchievements(week.facts, data.units, data.journey.nodes.flatMap((n) => n.flags.map((f) => ({ id: f.id, title: f.title, afterUnit: f.afterUnit }))), growth.cando ? candoTimes(growth.cando) : [], growth.candoEver) : null}
          levels={growth.levels}
          cando={growth.cando}
          thenNow={growth.thenNow}
        />
      ) : (
        <div className="mx-auto max-w-xl py-8">
          <h1 className="text-3xl font-bold">{journeyCopy.title}</h1>
          <p className="mt-4 text-lg" data-testid="journey-unavailable">{journeyCopy.unavailable}</p>
        </div>
      )}
    </StudentDeskShell>
  );
}
