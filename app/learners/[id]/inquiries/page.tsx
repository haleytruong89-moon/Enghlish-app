import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AssignForm } from "@/components/inquiries/AssignForm";
import { StepActions } from "@/components/inquiries/StepActions";
import { activityLabels, app, inquiriesPage, learnerWithTrack, modeLabels, purposeLabels, type Mode } from "@/lib/copy/vi";
import { authorizeInquiriesPage } from "@/lib/inquiries/access";
import { formatDateVi, safeExternalUrl } from "@/lib/inquiries/format";
import { loadInquiriesPage } from "@/lib/inquiries/load";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Assign inquiries and see what was assigned — parent and tutor only (outside their scope, and for
 * students, the page is a plain 404). Answer keys are never loaded here. Video is a plain link.
 */
export default async function InquiriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access = await authorizeInquiriesPage(user, id);
  if (access.kind === "login") redirect("/login");
  if (access.kind === "not-found") notFound();

  const { member, learner } = access.grant;
  const { templates, inquiries } = await loadInquiriesPage(learner.id, learner.trackId);

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {inquiriesPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{inquiriesPage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>

        <h2 className="mt-8 text-lg font-semibold">{inquiriesPage.availableTitle}</h2>
        {templates.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-white px-5 py-4">{inquiriesPage.availableEmpty}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {templates.map((t) => (
              <li key={`${t.id}@${t.version}`} className="rounded-xl border border-line bg-white px-5 py-4" data-testid={`template-${t.id}`}>
                <p className="font-semibold">{t.titleVi}</p>
                <p className="mt-1 text-sm">{t.bigQuestionVi}</p>
                <p className="mt-1 text-sm text-muted">
                  {inquiriesPage.weekRange(t.week, formatDateVi(t.dateFrom), formatDateVi(t.dateTo))} ·{" "}
                  {inquiriesPage.stepCount(t.stepCount)}
                </p>
                <AssignForm learnerId={learner.id} templateId={t.id} version={t.version} defaultDue={t.dateTo} />
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-10 text-lg font-semibold">{inquiriesPage.assignedTitle}</h2>
        {inquiries.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-white px-5 py-4">{inquiriesPage.assignedEmpty}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {inquiries.map((q) => (
              <li key={q.id} className="rounded-xl border border-line bg-white px-5 py-4" data-testid={`inquiry-${q.templateId}`}>
                <p className="text-lg font-semibold">{q.titleVi}</p>
                <p className="mt-1 text-sm">{q.bigQuestionVi}</p>
                <p className="mt-1 text-sm text-muted">
                  {inquiriesPage.assignedOn(formatDateVi(q.assignedAt))} · {inquiriesPage.dueOn(formatDateVi(q.dueOn))}
                </p>

                {q.sources.length > 0 ? (
                  <div className="mt-3">
                    <h3 className="text-sm font-semibold text-muted">{inquiriesPage.sourcesTitle}</h3>
                    <ul className="mt-1 flex flex-col gap-1 text-sm">
                      {q.sources.map((s) => {
                        const href = s.modality === "video" ? safeExternalUrl(s.url) : null;
                        return (
                          <li key={s.id}>
                            {inquiriesPage.sourceModality[s.modality] ?? s.modality}: {s.title}
                            {href ? (
                              <>
                                {" · "}
                                <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent underline">
                                  {inquiriesPage.videoLink}
                                </a>
                              </>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                <ol className="mt-4 flex flex-col gap-3">
                  {q.steps.map((s) => (
                    <li key={s.activityId} className="rounded-lg border border-line px-4 py-3" data-testid={`step-${q.templateId}-${s.stepNo}`}>
                      <p className="font-medium">
                        {inquiriesPage.stepLabel(s.stepNo)} · {activityLabels[s.activityType] ?? s.activityType}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {modeLabels[s.mode as Mode]?.staff ?? s.mode}
                        {s.timeMin ? ` · ${inquiriesPage.minutes(s.timeMin)}` : ""}
                        {s.purpose.length ? ` · ${s.purpose.map((p) => purposeLabels[p] ?? p).join(", ")}` : ""}
                      </p>
                      <p className="mt-1 text-sm">
                        {s.schedule.date ? inquiriesPage.scheduledFor(formatDateVi(s.schedule.date)) : inquiriesPage.noDate}
                        {s.schedule.skipped ? (
                          <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs">{inquiriesPage.skippedTag}</span>
                        ) : null}
                      </p>
                      {s.schedule.plannedDate && s.schedule.plannedDate !== s.schedule.date ? (
                        <p className="text-xs text-muted">{inquiriesPage.originalDate(formatDateVi(s.schedule.plannedDate))}</p>
                      ) : null}
                      {s.schedule.lastReason ? (
                        <p className="text-xs text-muted">{inquiriesPage.lastReason(s.schedule.lastReason)}</p>
                      ) : null}
                      <StepActions activityId={s.activityId} skipped={s.schedule.skipped} currentDate={s.schedule.date} />
                      <details className="mt-2 text-xs text-muted">
                        <summary className="min-h-11 cursor-pointer py-3">{app.techInfo}</summary>
                        <p>
                          {inquiriesPage.techInfoCodes}: {s.activityType}
                          {s.targetIds.length ? ` · ${s.targetIds.join(", ")}` : ""}
                        </p>
                      </details>
                    </li>
                  ))}
                </ol>

                <details className="mt-3 text-xs text-muted">
                  <summary className="min-h-11 cursor-pointer py-3">{app.techInfo}</summary>
                  <p>
                    {inquiriesPage.techInfoTemplate}: {q.templateId}@{q.templateVersion}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
