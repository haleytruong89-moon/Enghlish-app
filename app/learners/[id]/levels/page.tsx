import Link from "next/link";
import { DomainDetail } from "@/components/levels/DomainDetail";
import { LevelBars } from "@/components/levels/LevelBars";
import { LevelSummaryCard } from "@/components/levels/LevelSummaryCard";
import { IntakeCard } from "@/components/workdesk/IntakeCard";
import { TeachingNotesCard } from "@/components/workdesk/TeachingNotesCard";
import { Milestones } from "@/components/levels/Milestones";
import { learnerWithTrack, levelCopy, skillStateCopy, teachingNotes } from "@/lib/copy/vi";
import { loadLevelProfile } from "@/lib/levels/load";
import { strongestWeakest } from "@/lib/levels/scale";
import { groupWeakPoints } from "@/lib/skillmap/group";
import { loadSkillMap } from "@/lib/skillmap/load";
import { loadSkillStatesSoft } from "@/lib/skills/load";
import { domainSkills, solidByDomain } from "@/lib/skills/view";
import { loadWeakPoints } from "@/lib/tutorwork/load";
import { loadIntake, loadTeachingNotes } from "@/lib/workdesk/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/**
 * "Hồ sơ cấp" of one child (parent and tutor; students get 404): where the child is, 7 bars, the detail of one domain (?domain=,
 * default the "Cần tập trung" domain, else Ngữ pháp), external milestones and the history of level decisions.
 */
export default async function LevelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ domain?: string }> }) {
  const { id } = await params;
  const { domain } = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  const [profile, map, weak, { skills, failed }, notes, intake] = await Promise.all([
    loadLevelProfile(learner.id),
    loadSkillMap(learner.id),
    loadWeakPoints(learner.id, "8"),
    loadSkillStatesSoft(learner.id, "GET /learners/[id]/levels"),
    loadTeachingNotes(learner.id),
    loadIntake(learner.id),
  ]);
  const focus = strongestWeakest(profile.domains).weakest[0]?.key;
  const active = profile.domains.find((d) => d.key === domain) ?? profile.domains.find((d) => d.key === focus) ?? profile.domains[0]!;
  const groups = map.domains.find((d) => d.key === active.key)?.groups ?? [];
  const tile = groupWeakPoints(map, weak.tags).find((t) => t.key === active.key);
  const canDecide = member.role === "tutor";

  return (
    <>
      <div className="mx-auto max-w-4xl" data-testid="levels-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {levelCopy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{levelCopy.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{levelCopy.intro}</p>
        {intake.available && notes.available ? (
          <>
            <IntakeCard learnerId={learner.id} view={intake.data} canEdit={canDecide} domains={profile.domains.map((d) => ({ key: d.key, name: d.name }))} />
            <TeachingNotesCard learnerId={learner.id} alias={learner.alias} view={notes.data} canEdit={canDecide} />
          </>
        ) : (
          <p role="status" data-testid="workdesk-unavailable" className="mt-6 rounded-xl border border-line bg-white px-5 py-3 text-sm text-muted">
            {teachingNotes.unavailable}
          </p>
        )}
        <LevelSummaryCard alias={learner.alias} profile={profile} />
        {failed ? (
          <p role="status" data-testid="skills-unavailable" className="mt-4 rounded-xl border border-line bg-white px-5 py-3 text-sm text-muted">
            {skillStateCopy.statesUnavailable}
          </p>
        ) : null}
        <LevelBars profile={profile} learnerId={learner.id} active={active.key} solid={skills ? solidByDomain(skills.rows) : null} />
        <DomainDetail alias={learner.alias} domain={active} groups={groups} weak={tile?.points ?? []} learnerId={learner.id} canDecide={canDecide} skills={skills ? domainSkills(skills.rows, active.key) : null} />
        <Milestones profile={profile} learnerId={learner.id} />
      </div>
    </>
  );
}
