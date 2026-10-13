"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { app, formatScore, reviewPage, scoreLabels, type Score } from "@/lib/copy/vi";
import { formatWhen } from "@/lib/review/format";
import type { ReviewDecision, ReviewTarget } from "@/lib/review/types";
import { ModifyForm } from "./ModifyForm";
import { choiceToScore, ScoreButtons, type Choice } from "./ScoreButtons";

export type PanelTarget = ReviewTarget & { label: string };

const show = (d: ReviewDecision) => formatScore(d.finalNotObserved ? null : (d.finalScore as Score));

/**
 * Per-skill scoring. Skills not decided yet get the six buttons (when the viewer may decide); decided skills show the current
 * decision, the history, and "Sửa quyết định". One primary button: "Lưu và duyệt", enabled when every open skill has a choice.
 * D15 is enforced by the database; this only mirrors it (viewer.canDecide) so a parent is not offered buttons that would be refused.
 */
export function ScoringPanel({
  episodeId,
  alias,
  viewerRole,
  canDecide,
  observedDirectly,
  targets,
}: {
  episodeId: string;
  alias: string;
  viewerRole: "tutor" | "parent";
  canDecide: boolean;
  /** The tutor watched this work live: only then may the "heard live" criteria be ticked (the database refuses them otherwise). */
  observedDirectly: boolean;
  targets: PanelTarget[];
}) {
  const router = useRouter();
  const scorable = targets.filter((t) => t.scorable);
  const open = scorable.filter((t) => t.current === null);
  const [choices, setChoices] = useState<Record<string, Choice | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [criteria, setCriteria] = useState<Record<string, Record<string, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());

  const remaining = open.filter((t) => choices[t.key] === undefined).length;
  const canSave = canDecide && open.length > 0 && remaining === 0 && !busy;
  const chosenText = viewerRole === "tutor" ? reviewPage.chosen : reviewPage.chosenParent;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const items = open.map((t) => {
        const c = choices[t.key] as Choice;
        const crit = criteria[t.key];
        const note = (notes[t.key] ?? "").trim();
        return {
          target_id: t.key,
          ...choiceToScore(c),
          ...(crit && Object.keys(crit).length ? { criteria: crit } : {}),
          ...(note ? { rationale: note } : {}),
        };
      });
      const res = await fetch(`/api/review/episodes/${episodeId}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId.current, items }),
      });
      if (res.status === 409) {
        router.refresh();
        return setError(reviewPage.saveConflict);
      }
      if (res.status === 403) return setError(reviewPage.tutorOnlyDenied);
      if (!res.ok) throw new Error(String(res.status));
      clientId.current = crypto.randomUUID();
      setChoices({});
      setSaved(true);
      router.refresh();
    } catch {
      setError(reviewPage.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="score-title" className="flex flex-col gap-3" data-testid="scoring-panel">
      <h3 id="score-title" className="text-base font-bold">
        {reviewPage.scoreTitle}
      </h3>

      {!canDecide ? (
        <p role="note" className="rounded-lg bg-[#FBF1DC] px-4 py-3 text-sm text-[#6B4600]" data-testid="read-only-note">
          {reviewPage.readOnlyTutorOnly}
        </p>
      ) : null}

      <div aria-label={reviewPage.scaleLegend} className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs sm:grid-cols-5">
        {(["0", "1", "2", "3", "4"] as const).map((k) => (
          <span key={k} className={k === "3" ? "font-semibold text-accent" : undefined}>
            <b>{k}</b> {scoreLabels[k].short}
          </span>
        ))}
      </div>

      {targets.map((t) => {
        const decided = t.current;
        const choice = choices[t.key];
        return (
          <div key={t.key} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4" data-testid={`target-${t.key}`}>
            <p className="text-base font-bold">{t.label}</p>

            {!t.scorable ? (
              <p className="text-sm text-muted" data-testid={`locked-${t.key}`}>
                {t.lockedReason === "needs_live" ? reviewPage.liveOnly(alias) : reviewPage.notASkill}
              </p>
            ) : (
              <>
                {t.criteria.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold text-muted">{reviewPage.criteriaTitle}</p>
                    {t.criteria.map((c) => (
                      <label key={c.id} className="flex items-start gap-2 text-sm">
                        {canDecide && decided === null && !(c.method === "tutor_live" && !observedDirectly) ? (
                          <input
                            type="checkbox"
                            className="mt-1 size-4"
                            checked={criteria[t.key]?.[c.id] ?? false}
                            onChange={(e) => setCriteria((p) => ({ ...p, [t.key]: { ...p[t.key], [c.id]: e.target.checked } }))}
                          />
                        ) : null}
                        <span>
                          {c.checkVi}{" "}
                          <span className="text-muted">
                            · {c.method === "tutor_live" ? (observedDirectly ? reviewPage.criteriaLive : reviewPage.criteriaLiveLocked) : c.computable ? reviewPage.criteriaMachine : reviewPage.criteriaPerson}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}

                {t.rubricVi ? (
                  <details className="text-sm">
                    <summary className="min-h-11 cursor-pointer py-3">{reviewPage.levelsDetails}</summary>
                    <ul className="flex flex-col gap-1 text-muted">
                      {(["0", "1", "2", "3", "4"] as const).map((k) => (
                        <li key={k}>
                          <b>{formatScore(Number(k) as Score)}</b>: {t.rubricVi?.[k]}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {decided === null && canDecide ? (
                  <>
                    <ScoreButtons label={t.label} testKey={t.key} value={choice} onChange={(v) => setChoices((p) => ({ ...p, [t.key]: v }))} />
                    <p className={`text-base font-bold ${choice === undefined || choice === "na" ? "text-[#8A3B0B]" : "text-accent"}`} data-testid={`result-${t.key}`}>
                      {choice === undefined ? reviewPage.notChosen : chosenText(formatScore(choice === "na" ? null : choice))}
                    </p>
                    <details className="text-sm">
                      <summary className="min-h-11 cursor-pointer py-3">{reviewPage.noteOptional}</summary>
                      <textarea
                        aria-label={reviewPage.noteOptional}
                        rows={2}
                        maxLength={2000}
                        value={notes[t.key] ?? ""}
                        onChange={(e) => setNotes((p) => ({ ...p, [t.key]: e.target.value }))}
                        className="w-full rounded-lg border border-line px-3 py-2"
                      />
                    </details>
                  </>
                ) : null}

                {decided === null && !canDecide ? <p className="text-sm text-muted">{reviewPage.waitingTutor}</p> : null}

                {decided !== null ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-base font-bold text-accent" data-testid={`decided-${t.key}`}>
                      {reviewPage.decided(
                        show(decided),
                        decided.validatorName ?? reviewPage.decidedBy[decided.validatorRole] ?? decided.validatorRole,
                        formatWhen(decided.at),
                      )}
                    </p>
                    {decided.rationale ? <p className="text-sm text-muted">{decided.rationale}</p> : null}
                    {t.decisions.length > 1 ? (
                      <details className="text-sm" data-testid={`history-${t.key}`}>
                        <summary className="min-h-11 cursor-pointer py-3">{reviewPage.history(t.decisions.length)}</summary>
                        <ol className="flex flex-col gap-2">
                          {t.decisions.map((d) => (
                            <li key={d.id} className="rounded-lg border border-line px-3 py-2" data-testid={`history-item-${t.key}`}>
                              <p>
                                <b>{d.supersedesId ? reviewPage.historyModified : reviewPage.historyFirst}</b>: {show(d)} ·{" "}
                                {d.validatorName ?? reviewPage.decidedBy[d.validatorRole]}, {formatWhen(d.at)} ·{" "}
                                {d.current ? reviewPage.historyCurrent : reviewPage.historyReplaced}
                              </p>
                              {d.reason ? <p className="text-muted">{reviewPage.historyReason(d.reason)}</p> : null}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                    {canDecide ? (
                      <ModifyForm
                        decisionId={decided.id}
                        skill={t.label}
                        testKey={t.key}
                        currentScore={decided.finalScore}
                        currentNotObserved={decided.finalNotObserved}
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            )}

            <details className="text-xs text-muted">
              <summary className="min-h-11 cursor-pointer py-3">{app.techInfo}</summary>
              <p>
                {reviewPage.techInfoCodes}: {t.key}
              </p>
            </details>
          </div>
        );
      })}

      <section aria-labelledby="sum-title" className="rounded-xl border-2 border-accent bg-white p-4" data-testid="summary">
        <h4 id="sum-title" className="text-base font-bold">
          {reviewPage.summaryTitle}
        </h4>
        <ul className="mt-2 flex flex-col gap-1">
          {scorable.map((t) => {
            const c = choices[t.key];
            const text = t.current
              ? show(t.current)
              : c !== undefined
                ? formatScore(c === "na" ? null : c)
                : reviewPage.summaryNone;
            return (
              <li key={t.key} className="flex justify-between gap-3 border-b border-line pb-1 text-sm">
                <span>{t.label}</span>
                <span className="whitespace-nowrap font-bold">{text}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {canDecide && open.length > 0 ? (
        <div className="flex flex-col gap-2">
          {error ? (
            <p role="alert" className="text-sm text-red-700" data-testid="save-error">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            data-testid="save-review"
            className="min-h-12 self-start rounded-xl bg-accent px-6 text-base font-bold text-white disabled:bg-[#C9CEC5] disabled:text-[#3F4541]"
          >
            {busy ? reviewPage.saving : remaining > 0 ? reviewPage.saveRemaining(remaining) : reviewPage.save}
          </button>
        </div>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm font-semibold text-accent" data-testid="saved-note">
          {reviewPage.saved}
        </p>
      ) : null}
    </section>
  );
}
