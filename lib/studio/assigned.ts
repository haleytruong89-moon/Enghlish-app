/**
 * "Bài làm trên app đã giao" (21/11): every Studio test assigned to one child, with what the adult needs to act — not open yet, to do,
 * overdue, sent and waiting for the tutor's verdicts, or checked — and where to see the whole work. Pure; rows are read through RLS.
 */
import type { InquiryView } from "@/lib/inquiries/view";

/** Studio templates are named <track>-ST-nnnnnn by english.eng_approve_studio_draft (0024). */
export const isStudioTemplateId = (id: string): boolean => /^[A-Z]-ST-\d{6}$/.test(id);

export type AttemptRow = { id: string; activity_instance_id: string; attempt_no: number; submitted_at: string };
export type EpisodeRow = { id: string; attempt_id: string };
/** One Studio result as it stands now: `correct`/`total_items`/`not_in_app_items` come from the latest correction of it, if any. */
export type ResultRow = { attempt_id: string; correct: number; total_items: number; not_in_app_items: readonly number[]; attempt: string };

export type StudioAssignedStatus = "not_yet" | "todo" | "overdue" | "skipped" | "waiting" | "checked";
export type StudioAssignedRow = {
  instanceId: string;
  activityId: string;
  title: string;
  items: number;
  startOn: string | null;
  dueOn: string;
  assignedAt: string;
  status: StudioAssignedStatus;
  attempts: number;
  lastAttemptId: string | null;
  lastSubmittedAt: string | null;
  /** The review page of the latest attempt ("Xem bài làm"). */
  episodeId: string | null;
  /** The latest attempt has feedback from an adult (0037). */
  feedbackGiven: boolean;
  /** Feedback can be given (0037 applied): the link reads "Xem cả bài làm · góp ý". */
  feedbackReady: boolean;
  /** Units given with the test (0037), e.g. ["U13", "U14"]. */
  units: string[];
  /** The first attempt's count over the questions done in the app (paper-only ones left out); null until it is checked, or when the
   *  first result of this step is itself recorded as a retry (the same test given again). */
  firstResult: { correct: number; total: number } | null;
};

export function buildStudioAssigned(
  inquiries: readonly InquiryView[],
  attempts: readonly AttemptRow[],
  episodes: readonly EpisodeRow[],
  results: readonly ResultRow[],
  todayIso: string,
  extra: { feedbackAttempts?: ReadonlySet<string>; unitsOf?: ReadonlyMap<string, string[]> } = {},
): StudioAssignedRow[] {
  const episodeOf = new Map(episodes.map((e) => [e.attempt_id, e.id]));
  const resultOf = new Map(results.map((r) => [r.attempt_id, r]));
  const out: StudioAssignedRow[] = [];
  for (const q of inquiries) {
    if (!isStudioTemplateId(q.templateId)) continue;
    const step = q.steps[0];
    if (!step) continue;
    const mine = attempts.filter((a) => a.activity_instance_id === step.activityId).sort((a, b) => a.attempt_no - b.attempt_no);
    const last = mine[mine.length - 1] ?? null;
    const first = mine[0] ?? null;
    const firstRes = first ? resultOf.get(first.id) : undefined;
    const counted = firstRes && firstRes.attempt === "first" ? firstRes : undefined;
    const startOn = step.schedule.date;
    let status: StudioAssignedStatus;
    if (last) status = resultOf.has(last.id) ? "checked" : "waiting";
    else if (step.schedule.skipped) status = "skipped";
    else if (startOn && startOn > todayIso) status = "not_yet";
    else status = q.dueOn < todayIso ? "overdue" : "todo";
    out.push({
      instanceId: q.id,
      activityId: step.activityId,
      title: q.titleVi,
      items: step.itemCount,
      startOn,
      dueOn: q.dueOn,
      assignedAt: q.assignedAt,
      status,
      attempts: mine.length,
      lastAttemptId: last?.id ?? null,
      lastSubmittedAt: last?.submitted_at ?? null,
      episodeId: last ? (episodeOf.get(last.id) ?? null) : null,
      feedbackGiven: last ? (extra.feedbackAttempts?.has(last.id) ?? false) : false,
      feedbackReady: extra.feedbackAttempts !== undefined,
      units: extra.unitsOf?.get(step.activityId) ?? [],
      firstResult: counted ? { correct: counted.correct, total: counted.total_items - counted.not_in_app_items.length } : null,
    });
  }
  return out;
}

/** Tests past their due day with nothing sent (the desk's "Cần chú ý"). A skipped test is not overdue. */
export const studioOverdueCount = (rows: readonly StudioAssignedRow[]): number => rows.filter((r) => r.status === "overdue").length;

export type RawResultRow = {
  id: string;
  attempt_id: string | null;
  correct: number;
  total_items: number;
  not_in_app_items: number[] | null;
  attempt: string;
  supersedes_id: string | null;
};

/**
 * One row per Studio attempt, as it stands now. A correction (eng_record_result with supersedes_id) carries no attempt_id, so the
 * attempt is taken from the original row and the counts from the end of the correction chain.
 */
export function currentStudioResults(rows: readonly RawResultRow[]): ResultRow[] {
  const next = new Map<string, RawResultRow>();
  for (const r of rows) if (r.supersedes_id) next.set(r.supersedes_id, r);
  const out: ResultRow[] = [];
  for (const r of rows) {
    if (!r.attempt_id) continue;
    let cur: RawResultRow = r;
    const seen = new Set<string>([cur.id]);
    for (let n = next.get(cur.id); n && !seen.has(n.id); n = next.get(cur.id)) {
      seen.add(n.id);
      cur = n;
    }
    out.push({ attempt_id: r.attempt_id, correct: cur.correct, total_items: cur.total_items, not_in_app_items: cur.not_in_app_items ?? [], attempt: r.attempt });
  }
  return out;
}
