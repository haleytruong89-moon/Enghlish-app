import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffShell } from "@/components/shell/StaffShell";
import { requireShell } from "@/lib/shell/load";
import { firstParam } from "@/lib/shell/shell";
import { FeedbackForm } from "@/components/workdesk/FeedbackForm";
import { FeedbackList } from "@/components/workdesk/FeedbackList";
import { appFeedback, reviewPage } from "@/lib/copy/vi";
import { authorizeStaffPage } from "@/lib/review/access";
import { getAuthUser } from "@/lib/auth/session";
import { allowRealLearners } from "@/lib/env";
import { feedbackAllowedHere } from "@/lib/workdesk/guard";
import { loadAppFeedback } from "@/lib/workdesk/load";
import { createSupabaseWorkdeskStore } from "@/lib/workdesk/supabaseStore";

export const dynamic = "force-dynamic";

/** "Góp ý về app": tutor and parent of the family (students and outsiders get a plain 404, like the other adult pages). */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ screen?: string | string[]; learner?: string | string[] }> }) {
  const user = await getAuthUser();
  const access = await authorizeStaffPage(user);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();

  // Preview guard (M4): while real learners are not allowed, a family that has one gets a plain 404, like the API routes.
  if (!(await feedbackAllowedHere(allowRealLearners(), access.member.familyId, (f) => createSupabaseWorkdeskStore().familyHasRealLearner(f)))) notFound();

  const sp = await searchParams;
  const shell = await requireShell(firstParam(sp.learner));
  const raw = Array.isArray(sp.screen) ? sp.screen[0] : sp.screen;
  const screen = raw && raw.trim() ? raw.trim().slice(0, 80) : appFeedback.screenDefault;
  const loaded = await loadAppFeedback();
  const role = access.member.role === "parent" ? "parent" : "tutor";

  return (
    <StaffShell shell={shell}>
      <div className="mx-auto max-w-3xl" data-testid="feedback-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {reviewPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{appFeedback.title}</h1>
        <p className="mt-1 text-sm text-muted">{appFeedback.intro}</p>
        {loaded.available ? (
          <>
            <FeedbackForm defaultScreen={screen} />
            <h2 className="mt-8 text-lg font-semibold">{role === "parent" ? appFeedback.all : appFeedback.allMine}</h2>
            <FeedbackList items={loaded.data} role={role} />
          </>
        ) : (
          <p role="status" data-testid="feedback-unavailable" className="mt-6 rounded-xl border border-line bg-white px-5 py-3 text-sm text-muted">
            {appFeedback.unavailable}
          </p>
        )}
      </div>
    </StaffShell>
  );
}
