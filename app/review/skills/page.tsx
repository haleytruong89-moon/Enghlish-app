import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffShell } from "@/components/shell/StaffShell";
import { requireShell } from "@/lib/shell/load";
import { firstParam } from "@/lib/shell/shell";
import { ReviewTabs } from "@/components/review/ReviewTabs";
import { loadStudioPending } from "@/lib/studio/load";
import { ConfirmAllButton } from "@/components/skills/ConfirmAllButton";
import { SkillProposalCard } from "@/components/skills/SkillProposalCard";
import { pointStateCopy, reviewPage, skillStateCopy } from "@/lib/copy/vi";
import { authorizeStaffPage } from "@/lib/review/access";
import { PointProposalCard } from "@/components/points/PointProposalCard";
import { loadPointInbox } from "@/lib/points/load";
import { combinedTabCount, groupPointInbox, mergeInboxGroups } from "@/lib/points/view";
import { loadSkillInbox } from "@/lib/skills/load";
import { groupInbox } from "@/lib/skills/view";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Hộp duyệt → tab "Kỹ năng" (spec §5): open proposals and ⚑ per child. The child's tutor decides; the parent reads. Students: 404. */
export default async function ReviewSkillsPage({ searchParams }: { searchParams: Promise<{ learner?: string | string[] }> }) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = await authorizeStaffPage(user);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();
  const shell = await requireShell(firstParam((await searchParams).learner));

  const [inbox, pointInbox, studioPending] = await Promise.all([
    loadSkillInbox(access.member.id),
    loadPointInbox(access.member.id).catch(() => null),
    loadStudioPending(access.member.id).catch(() => null),
  ]);
  const groups = mergeInboxGroups(inbox ? groupInbox(inbox.items) : [], pointInbox ? groupPointInbox(pointInbox.items) : []);

  return (
    <StaffShell shell={shell}>
      <div className="mx-auto max-w-3xl" data-testid="skills-inbox">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {reviewPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{skillStateCopy.title}</h1>
        <p className="mt-1 text-sm text-muted">{skillStateCopy.intro}</p>
        {access.member.role === "parent" ? <p className="mt-1 text-sm text-muted">{skillStateCopy.parentNote}</p> : null}
        <ReviewTabs active="skills" skillsCount={combinedTabCount(inbox, pointInbox, access.member.role)} studioCount={studioPending?.count ?? null} />

        {inbox !== null && pointInbox === null ? (
          <p className="mt-4 rounded-xl border border-line bg-white px-5 py-3 text-sm text-muted" data-testid="points-not-ready">
            {pointStateCopy.notReady}
          </p>
        ) : null}
        {inbox === null && pointInbox === null ? (
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
                  {skillStateCopy.groupTitle(g.alias, g.total)}
                </h2>
                {g.skills && g.skills.proposalIds.length > 1 ? <ConfirmAllButton learnerId={g.learnerId} ids={g.skills.proposalIds} /> : null}
              </div>
              {g.skills ? (
                <ul className="mt-3 flex flex-col gap-3">
                  {g.skills.items.map((i) => (
                    <SkillProposalCard key={i.id} item={i} />
                  ))}
                </ul>
              ) : null}
              {g.points ? (
                <div data-testid={`points-group-${g.learnerId}`}>
                  <h3 className="mt-4 text-base font-semibold">{pointStateCopy.sectionTitle}</h3>
                  <ul className="mt-2 flex flex-col gap-3">
                    {g.points.items.map((i) => (
                      <PointProposalCard key={i.id} item={i} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ))
        )}
      </div>
    </StaffShell>
  );
}
