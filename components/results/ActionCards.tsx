import Link from "next/link";
import { fallbackLabels, resultsCopy as c } from "@/lib/copy/vi";
import { isDecidable, type ActionCard, type ActionTone } from "@/lib/results/actions";
import { deskHref } from "@/lib/shell/paths";
import { CardDecision } from "./CardDecision";
import { UnitDoneButton } from "./UnitDoneButton";

const TONE: Record<ActionTone, { box: string; badge: string }> = {
  red: { box: "border-[#b4402c] bg-[#fbe9e6]", badge: "bg-[#b4402c] text-white" },
  amber: { box: "border-[#b7791f] bg-[#fbf1dc]", badge: "bg-[#6b4600] text-white" },
  info: { box: "border-line bg-white", badge: "bg-[#e4ebf5] text-[#1f3f6e]" },
  good: { box: "border-[#2f7d4f] bg-[#e7f3ec]", badge: "bg-[#2f7d4f] text-white" },
};

/** The words of one card, from its kind and facts (every text comes from resultsCopy). */
export function cardText(card: ActionCard, tagLabels: Readonly<Record<string, string>>): { title: string; line: string; button: string } {
  const f = card.facts;
  const n = (x: number | undefined) => x ?? 0;
  switch (card.kind) {
    case "grade":
      return { title: c.cards.grade.title(n(f.works), n(f.oldestDays)), line: c.cards.grade.line(n(f.pendingItems), n(f.feedbackMissing)), button: c.cards.grade.button };
    case "fix_together":
      return { title: c.cards.fix_together.title(f.title ?? "", f.part ?? null), line: c.cards.fix_together.line(n(f.correct), n(f.decided), n(f.percent)), button: c.cards.fix_together.button };
    case "unit_review":
      return { title: c.cards.unit_review.title(f.unit ?? ""), line: c.cards.unit_review.line(n(f.correct), n(f.decided), n(f.percent), n(f.works)), button: c.cards.unit_review.button };
    case "practise":
      return { title: c.cards.practise.title(tagLabels[f.tag ?? ""] ?? fallbackLabels.tag), line: c.cards.practise.line(n(f.correct), n(f.decided), n(f.percent), n(f.works)), button: c.cards.practise.button };
    case "unit_ready":
      return { title: c.cards.unit_ready.title(f.unit ?? "", f.title ?? null), line: c.cards.unit_ready.line(n(f.correct), n(f.decided), n(f.percent), n(f.works)), button: c.cards.unit_ready.button };
    case "praise":
      return { title: c.cards.praise.title(f.title ?? "", f.part ?? null), line: c.cards.praise.line(n(f.correct), n(f.decided), n(f.percent)), button: c.cards.praise.button };
  }
}

/**
 * "Việc nên làm": the cards that turn results into action, coloured by urgency, each with one button. The tutor acts; the parent sees
 * the same cards without action buttons (she reminds the tutor). Bản 3: a fix-together card also links to the work itself (read only,
 * opens for both roles), so anyone sitting with the child can open the weak part. `cards === null` = the results could not be read (said, never hidden).
 */
export function ActionCards({ learnerId, cards, tagLabels, role, title = c.actionsTitle, id = "viec-nen-lam", buttons = true, decisionsReady = true, handledThisWeek = 0 }: {
  learnerId: string; cards: ActionCard[] | null; tagLabels: Readonly<Record<string, string>>; role: "tutor" | "parent"; title?: string; id?: string;
  /** false on the session page itself (its buttons would only lead back to it). The "Đã làm" / "Bỏ qua" marks stay. */
  buttons?: boolean;
  /** false before migration 0043: no marks (said once to the tutor). */
  decisionsReady?: boolean;
  /** Cards marked in the last 7 days: one line linking to the list on Hôm nay. */
  handledThisWeek?: number;
}) {
  const parent = role === "parent";
  return (
    <section id={id} data-testid={id === "viec-nen-lam" ? "action-cards" : `action-cards-${id}`} aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
        <Link href={`/learners/${learnerId}/progress`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">{c.seeAll}</Link>
      </div>
      {parent ? <p className="text-sm text-muted">{c.parentNote}</p> : null}
      {handledThisWeek > 0 ? (
        <p className="text-sm" data-testid="handled-week">
          {c.handled.weekLine(handledThisWeek)} · <Link href={`${deskHref(learnerId)}#da-xu-ly`} className="font-semibold text-accent underline">{c.handled.see}</Link>
        </p>
      ) : null}
      {!parent && !decisionsReady && (cards ?? []).some((x) => isDecidable(x.kind)) ? <p className="text-xs text-muted" data-testid="decisions-unavailable">{c.handled.unavailable}</p> : null}
      {cards === null ? <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted">{c.actionsUnavailable}</p> : null}
      {cards !== null && cards.length === 0 ? <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted" data-testid="action-cards-empty">{c.actionsEmpty}</p> : null}
      {(cards ?? []).map((card) => {
        const t = cardText(card, tagLabels);
        const tone = TONE[card.tone];
        return (
          <article key={card.key} data-testid={`action-card-${card.kind}`} data-tone={card.tone} className={`flex flex-wrap items-center gap-3 rounded-xl border-2 px-4 py-3 ${tone.box}`}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone.badge}`}>{c.tone[card.tone]}</span>
                <span className="font-semibold">{t.title}</span>
              </p>
              <p className="mt-1 text-sm">{t.line}</p>
            </div>
            {card.workHref ? (
              <Link href={card.workHref} data-testid={`action-open-${card.key}`}
                className={buttons && !parent ? "inline-flex min-h-11 items-center rounded-xl border-2 border-accent bg-white px-4 text-sm font-bold text-accent no-underline" : "inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-white no-underline shadow-[0_2px_0_#1f4439]"}>
                {c.openFix(card.facts.partKey ?? null)}
              </Link>
            ) : null}
            {parent || !buttons ? null : (
              <Link href={card.href} data-testid={`action-button-${card.kind}`} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-white no-underline">
                {t.button}
              </Link>
            )}
            {!parent && card.kind === "unit_ready" && card.facts.curriculumId && card.facts.unit ? <UnitDoneButton curriculumId={card.facts.curriculumId} unit={card.facts.unit} /> : null}
            {!parent && decisionsReady && isDecidable(card.kind) ? <CardDecision learnerId={learnerId} cardKey={card.key} kind={card.kind} label={t.title} evidenceAt={card.evidenceAt} /> : null}
          </article>
        );
      })}
    </section>
  );
}
