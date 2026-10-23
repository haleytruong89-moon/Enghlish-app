import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { RebuildButton } from "@/components/skills/RebuildButton";
import { SkillRow } from "@/components/skills/SkillRow";
import { app, learnerWithTrack, skillStateCopy, targetsPage } from "@/lib/copy/vi";
import { loadSkillStatesSoft } from "@/lib/skills/load";
import { createUserClient } from "@/lib/supabase/server";
import { authorizeTargetsPage } from "@/lib/targets/access";
import { loadTargetsView } from "@/lib/targets/loadTargets";

export const dynamic = "force-dynamic";

/**
 * Tracked skills of one learner — the learner's current target set (PRD §3.1/§3.2).
 * Parent and tutor only; outside their scope the page is a plain 404 (requireAccess).
 * Read-only: nothing here edits configuration.
 */
export default async function TargetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access = await authorizeTargetsPage(user, id);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();

  const { member, learner } = access.grant;
  const [view, { skills, failed }] = await Promise.all([loadTargetsView(learner.id), loadSkillStatesSoft(learner.id, "GET /learners/[id]/targets")]);
  const stateOf = new Map((skills?.rows ?? []).map((r) => [r.targetKey, r]));
  const isTutor = member.role === "tutor";

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {targetsPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{targetsPage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>

        {view === null ? (
          <p className="mt-6 rounded-xl border border-line bg-white px-5 py-4">{targetsPage.noSet}</p>
        ) : (
          <>
            <p className="mt-4 text-muted">{targetsPage.intro}</p>
            {failed ? (
              <p role="status" data-testid="skills-unavailable" className="mt-3 rounded-xl border border-line bg-white px-5 py-3 text-sm text-muted">
                {skillStateCopy.statesUnavailable}
              </p>
            ) : null}
            <h2 className="mt-6 text-lg font-semibold">{targetsPage.count(view.rows.length)}</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {view.rows.map((row) => (
                <SkillRow
                  key={row.id}
                  id={row.id}
                  title={row.title}
                  dimensionName={row.dimensionName}
                  state={stateOf.get(row.id) ?? null}
                  learnerId={learner.id}
                  canEdit={isTutor && skills !== null}
                  showCode={isTutor}
                />
              ))}
            </ul>
            {skills !== null ? <RebuildButton learnerId={learner.id} /> : null}

            <h2 className="mt-8 text-base font-semibold text-muted">{targetsPage.trackingOnlyTitle}</h2>
            {view.trackingOnly.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{targetsPage.trackingOnlyEmpty}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {view.trackingOnly.map((item) => (
                  <li key={item.id} className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted">
                    {item.label}
                  </li>
                ))}
              </ul>
            )}

            <details className="mt-8 text-sm text-muted">
              <summary className="min-h-11 cursor-pointer py-2">{app.techInfo}</summary>
              <p className="mt-2">
                {targetsPage.techInfoSet}: {view.setId}
              </p>
              <p>
                {targetsPage.techInfoCatalogue}: {view.catalogueVersion}
              </p>
              <p className="mt-2">{targetsPage.techInfoCodes}:</p>
              <ul className="mt-1 list-disc pl-5">
                {view.rows.map((row) => (
                  <li key={row.id}>{row.id}</li>
                ))}
                {view.trackingOnly.map((item) => (
                  <li key={item.id}>{item.id}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </main>
    </>
  );
}
