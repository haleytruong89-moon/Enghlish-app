import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ReviewTabs } from "@/components/review/ReviewTabs";
import { loadStudioPending } from "@/lib/studio/load";
import { ConfirmAllButton } from "@/components/skills/ConfirmAllButton";
import { SkillProposalCard } from "@/components/skills/SkillProposalCard";
import { reviewPage, skillStateCopy } from "@/lib/copy/vi";
import { authorizeStaffPage } from "@/lib/review/access";
import { loadSkillInbox } from "@/lib/skills/load";
import { groupInbox, skillTabCount } from "@/lib/skills/view";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Hộp duyệt → tab "Kỹ năng" (spec §5): open proposals and ⚑ per child. The child's tutor decides; the parent reads. Students: 404. */
export default async function ReviewSkillsPage() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = await authorizeStaffPage(user);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();

  const inbox = await loadSkillInbox(access.member.id);
  const studioPending = await loadStudioPending(access.member.id).catch(() => null);
  const groups = inbox ? groupInbox(inbox.items) : [];

  return (
    <>
      <AppHeader name={access.member.displayName} showTestBadge={groups.some((g) => g.isTest)} />
      <main className="mx-auto max-w-3xl px-4 py-10" data-testid="skills-inbox">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {reviewPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{skillStateCopy.title}</h1>
        <p className="mt-1 text-sm text-muted">{skillStateCopy.intro}</p>
        {access.member.role === "parent" ? <p className="mt-1 text-sm text-muted">{skillStateCopy.parentNote}</p> : null}
        <ReviewTabs active="skills" skillsCount={skillTabCount(inbox, access.member.role)} studioCount={studioPending?.count ?? null} />

        {inbox === null ? (
          <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="skills-not-ready">
            {skillStateCopy.notReady}
          </p>
        ) : groups.length === 0 ? (
          <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4" data-testid="skills-empty">
            {skillStateCopy.empty}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.learnerId} className="mt-6" data-testid={`skills-group-${g.learnerId}`} aria-labelledby={`skills-group-title-${g.learnerId}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 id={`skills-group-title-${g.learnerId}`} className="text-lg font-semibold">
                  {skillStateCopy.groupTitle(g.alias, g.items.length)}
                </h2>
                {g.proposalIds.length > 1 ? <ConfirmAllButton learnerId={g.learnerId} ids={g.proposalIds} /> : null}
              </div>
              <ul className="mt-3 flex flex-col gap-3">
                {g.items.map((i) => (
                  <SkillProposalCard key={i.id} item={i} />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </>
  );
}
