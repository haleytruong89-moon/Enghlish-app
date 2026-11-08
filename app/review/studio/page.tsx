// app/review/studio/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffShell } from "@/components/shell/StaffShell";
import { requireShell } from "@/lib/shell/load";
import { firstParam } from "@/lib/shell/shell";
import { ReviewTabs } from "@/components/review/ReviewTabs";
import { StudioPendingCard } from "@/components/review/StudioPendingCard";
import { reviewPage, studioInboxCopy } from "@/lib/copy/vi";
import { authorizeStaffPage } from "@/lib/review/access";
import { loadSkillInbox } from "@/lib/skills/load";
import { loadPointInbox } from "@/lib/points/load";
import { combinedTabCount } from "@/lib/points/view";
import { loadStudioPending } from "@/lib/studio/load";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Hộp duyệt → "Cần thầy/cô xem" (board 21): Studio items the app could not check. The child's tutor or parent decides. Students: 404. */
export default async function ReviewStudioPage({ searchParams }: { searchParams: Promise<{ learner?: string | string[] }> }) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = await authorizeStaffPage(user);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();
  const shell = await requireShell(firstParam((await searchParams).learner));
  const [pending, skillInbox, pointInbox] = await Promise.all([
    loadStudioPending(access.member.id),
    loadSkillInbox(access.member.id).catch(() => null),
    loadPointInbox(access.member.id).catch(() => null),
  ]);
  return (
    <StaffShell shell={shell}>
      <div className="mx-auto max-w-3xl" data-testid="studio-inbox">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {reviewPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{studioInboxCopy.title}</h1>
        <p className="mt-1 text-sm text-muted">{studioInboxCopy.intro}</p>
        <ReviewTabs active="studio" skillsCount={combinedTabCount(skillInbox, pointInbox, access.member.role)} studioCount={pending?.count ?? null} />
        {pending === null ? (
          <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4">{studioInboxCopy.notReady}</p>
        ) : pending.attempts.length === 0 ? (
          <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="studio-inbox-empty">{studioInboxCopy.empty}</p>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {pending.attempts.map((a) => (
              <StudioPendingCard key={a.attemptId} attempt={a} />
            ))}
          </ul>
        )}
      </div>
    </StaffShell>
  );
}
