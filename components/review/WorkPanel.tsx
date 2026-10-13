import { assistanceLabels, fallbackLabels, reviewPage, supportKindLabels, verificationLabels } from "@/lib/copy/vi";
import { formatDateVi } from "@/lib/inquiries/format";
import { formatWhen } from "@/lib/review/format";
import type { ReviewEpisodeView } from "@/lib/review/types";

const text = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The work itself, beside the keys and the machine check (staff only): answers per question, or the text, and the help used. */
export function WorkPanel({ view }: { view: ReviewEpisodeView }) {
  const alias = view.learner.alias;
  const content = view.artifact?.content ?? {};
  const answers = content.answers && typeof content.answers === "object" ? (content.answers as Record<string, unknown>) : null;
  const body = text(content.text);
  const sessionDate = text(content.session_date);
  const dw = reviewPage.durationWords(num(content.duration_sec), num(content.word_count));
  const keyByItem = new Map(view.keys.map((k) => [k.itemId, k]));
  const auto = view.autoChecks;
  const needsPerson = auto ? Object.values(auto.items).filter((i) => i.result === "needs_person").length : 0;

  return (
    <section aria-labelledby="work-title" className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4" data-testid="work-panel">
      <h3 id="work-title" className="text-base font-bold">
        {reviewPage.workTitle(alias)}
      </h3>

      {view.attempt.provenance === "tutor_live" || view.attempt.provenance === "manual_import" ? (
        <p className="text-sm text-muted">
          {view.attempt.recordedByName ? `${reviewPage.recordedBy(view.attempt.recordedByName)}` : null}
          {sessionDate ? ` · ${reviewPage.sessionDate(formatDateVi(sessionDate))}` : null}
          {dw ? ` · ${dw}` : null}
        </p>
      ) : null}

      {view.step.promptEn ? (
        <p lang="en" className="text-sm text-muted">
          {view.step.promptEn}
        </p>
      ) : null}

      {answers ? (
        <>
          {auto && auto.checked > 0 ? (
            <p className="text-sm font-semibold" data-testid="auto-summary">
              {reviewPage.autoSummary(auto.correct, auto.checked)}
              {needsPerson > 0 ? ` · ${reviewPage.autoNeedsPerson(needsPerson)}` : ""}
            </p>
          ) : null}
          <ol className="flex flex-col gap-3">
            {view.step.items.map((it) => {
              const given = text(answers[it.id]);
              const res = auto?.items[it.id]?.result;
              const key = keyByItem.get(it.id);
              return (
                <li key={it.id} className="rounded-lg border border-line px-3 py-2" data-testid={`item-${it.id}`}>
                  <p lang="en" className="text-sm font-medium">
                    {it.stem}
                  </p>
                  <p lang="en" className="mt-1 text-sm">
                    {reviewPage.itemGiven(alias)}: <b>{given && given.trim() ? given : reviewPage.itemBlank}</b>
                    {res ? (
                      <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs">{reviewPage.autoResult[res] ?? fallbackLabels.autoResult}</span>
                    ) : null}
                  </p>
                  {key && (key.answer || key.explanationVi) ? (
                    <p lang="en" className="mt-1 text-xs text-muted">
                      {reviewPage.keyKinds[key.kind] ?? fallbackLabels.keyKind}: {key.answer ?? ""}
                      {key.explanationVi ? ` · ${key.explanationVi}` : ""}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      ) : body !== null ? (
        <p lang="en" className="whitespace-pre-wrap text-[15px] leading-7" data-testid="work-text">
          {body}
        </p>
      ) : (
        <p className="text-sm text-muted">{reviewPage.noWork}</p>
      )}

      {view.keys.filter((k) => k.kind !== "answer").length > 0 && !answers ? (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-3">{reviewPage.keysTitle}</summary>
          <ul className="flex flex-col gap-1 text-muted">
            {view.keys
              .filter((k) => k.kind !== "answer" || k.answer)
              .map((k) => (
                <li key={k.itemId} lang="en">
                  {reviewPage.keyKinds[k.kind] ?? fallbackLabels.keyKind}: {k.answer ?? ""}
                  {k.explanationVi ? ` · ${k.explanationVi}` : ""}
                </li>
              ))}
          </ul>
        </details>
      ) : null}

      {view.sources.length > 0 ? (
        <p className="text-xs text-muted">
          {reviewPage.sourcesTitle}: {view.sources.map((s) => s.title).join("; ")}
        </p>
      ) : null}

      <div className="border-t border-line pt-3" data-testid="assistance">
        <h4 className="text-sm font-bold">{reviewPage.supportTitle}</h4>
        {view.assistance.length === 0 && view.attempt.declaredAssistance.every((a) => a === "none") ? (
          <p className="mt-1 text-sm">{reviewPage.supportNone}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {view.assistance.map((a) => (
              <li key={String(a.id)}>
                {a.detail ? (assistanceLabels[a.detail] ?? fallbackLabels.help) : (supportKindLabels[a.kind] ?? fallbackLabels.supportKind)}
                {" · "}
                {a.verification === "declared"
                  ? verificationLabels.declared(alias)
                  : a.verification === "observed"
                    ? verificationLabels.observed
                    : verificationLabels.unknown}
                {a.note ? ` · ${a.note}` : ""}
                {a.byName ? ` · ${a.byName}` : ""}
                <span className="text-muted"> · {formatWhen(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
