import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { FeedbackForm } from "@/components/workdesk/FeedbackForm";
import { FeedbackList } from "@/components/workdesk/FeedbackList";
import { appFeedback, reviewPage } from "@/lib/copy/vi";
import { authorizeStaffPage } from "@/lib/review/access";
import { createUserClient } from "@/lib/supabase/server";
import { loadAppFeedback } from "@/lib/workdesk/load";

export const dynamic = "force-dynamic";

/** "Góp ý về app": tutor and parent of the family (students and outsiders get a plain 404, like the other adult pages). */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ screen?: string | string[] }> }) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = await authorizeStaffPage(user);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();

  const sp = await searchParams;
  const raw = Array.isArray(sp.screen) ? sp.screen[0] : sp.screen;
  const screen = raw && raw.trim() ? raw.trim().slice(0, 80) : appFeedback.screenDefault;
  const items = await loadAppFeedback();
  const role = access.member.role === "parent" ? "parent" : "tutor";

  return (
    <>
      <AppHeader name={access.member.displayName} />
      <main className="mx-auto max-w-3xl px-4 py-10" data-testid="feedback-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {reviewPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{appFeedback.title}</h1>
        <p className="mt-1 text-sm text-muted">{appFeedback.intro}</p>
        <FeedbackForm defaultScreen={screen} />
        <h2 className="mt-8 text-lg font-semibold">{appFeedback.all}</h2>
        <FeedbackList items={items} role={role} />
      </main>
    </>
  );
}
