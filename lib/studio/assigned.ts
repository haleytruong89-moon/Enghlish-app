/**
 * "Bài làm trên app đã giao" (21/11): every Studio test assigned to one child, with what the adult needs to act — not open yet, to do,
 * overdue, sent and waiting for the tutor's verdicts, or checked — and where to see the whole work. Pure; rows are read through RLS.
 */
import type { InquiryView } from "@/lib/inquiries/view";

/** Studio templates are named <track>-ST-nnnnnn by english.eng_approve_studio_draft (0024). */
export const isStudioTemplateId = (id: string): boolean => /^[A-Z]-ST-\d{6}$/.test(id);

export type AttemptRow = { id: string; activity_instance_id: string; attempt_no: number; submitted_at: string };
export type EpisodeRow = { id: string; attempt_id: string };
export type ResultRow = { attempt_id: string; correct: number; total_items: number; attempt: string };

export type StudioAssignedStatus = "not_yet" | "todo" | "overdue" | "waiting" | "checked";
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
  /** The first attempt's count (the one that counts); null until it is checked. */
  firstResult: { correct: number; total: number } | null;
};

export function buildStudioAssigned(
  inquiries: readonly InquiryView[],
  attempts: readonly AttemptRow[],
  episodes: readonly EpisodeRow[],
  results: readonly ResultRow[],
  todayIso: string,
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
    const startOn = step.schedule.date;
    let status: StudioAssignedStatus;
    if (last) status = resultOf.has(last.id) ? "checked" : "waiting";
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
      firstResult: firstRes ? { correct: firstRes.correct, total: firstRes.total_items } : null,
    });
  }
  return out;
}

/** Tests past their due day with nothing sent (the desk's "Cần chú ý"). */
export const studioOverdueCount = (rows: readonly StudioAssignedRow[]): number => rows.filter((r) => r.status === "overdue").length;
