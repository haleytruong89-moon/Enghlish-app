/**
 * Pure helpers that turn database rows into what the staff pages and routes show.
 * Never touches answer keys: the only inputs are the student-safe snapshot, activity rows and events.
 */
import type { SafeStep, SourceRef } from "@/lib/config/inquiries";

export type EventRow = {
  id: number;
  activity_instance_id: string;
  kind: "reschedule" | "skip" | "unskip";
  new_date: string | null;
  reason: string;
  at: string;
};

export type ActivityRow = {
  id: string;
  inquiry_instance_id: string;
  step_no: number;
  activity_type: string;
  mode: string;
  purpose: string[];
  target_ids: string[];
  scheduled_for: string | null;
};

export type InstanceRow = {
  id: string;
  template_id: string;
  template_version: number;
  snapshot: {
    template: {
      title_vi: string;
      big_question_en: string;
      big_question_vi: string;
      week: number;
      date_from: string;
      date_to: string;
    };
    sources: SourceRef[];
    steps: SafeStep[];
  };
  assigned_at: string;
  due_on: string;
};

export type Schedule = {
  /** Date after the latest reschedule; the planned date when never rescheduled. */
  date: string | null;
  plannedDate: string | null;
  skipped: boolean;
  /** Reason of the latest event, if any. */
  lastReason: string | null;
};

/** Order events as the DB defines "latest": by time, then id. */
const byTimeThenId = (a: EventRow, b: EventRow) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id);

export function effectiveSchedule(planned: string | null, events: readonly EventRow[]): Schedule {
  const sorted = [...events].sort(byTimeThenId);
  let date = planned;
  let skipped = false;
  for (const e of sorted) {
    if (e.kind === "reschedule") date = e.new_date;
    else skipped = e.kind === "skip";
  }
  return { date, plannedDate: planned, skipped, lastReason: sorted.length ? sorted[sorted.length - 1]!.reason : null };
}

export type StepView = {
  activityId: string;
  stepNo: number;
  activityType: string;
  mode: string;
  purpose: string[];
  targetIds: string[];
  timeMin: number | null;
  promptEn: string;
  itemCount: number;
  schedule: Schedule;
};

export type SourceView = { id: string; title: string; modality: string; url: string | null };

export type InquiryView = {
  id: string;
  templateId: string;
  templateVersion: number;
  titleVi: string;
  bigQuestionEn: string;
  bigQuestionVi: string;
  week: number;
  dateFrom: string;
  dateTo: string;
  assignedAt: string;
  dueOn: string;
  sources: SourceView[];
  steps: StepView[];
};

export function buildInquiryViews(
  instances: readonly InstanceRow[],
  activities: readonly ActivityRow[],
  events: readonly EventRow[],
): InquiryView[] {
  const eventsByActivity = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = eventsByActivity.get(e.activity_instance_id) ?? [];
    list.push(e);
    eventsByActivity.set(e.activity_instance_id, list);
  }
  const activitiesByInstance = new Map<string, ActivityRow[]>();
  for (const a of activities) {
    const list = activitiesByInstance.get(a.inquiry_instance_id) ?? [];
    list.push(a);
    activitiesByInstance.set(a.inquiry_instance_id, list);
  }

  return [...instances]
    .sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : a.assigned_at > b.assigned_at ? -1 : 0))
    .map((inst) => {
      const snap = inst.snapshot;
      const stepsByNo = new Map(snap.steps.map((s) => [s.step_no, s]));
      const rows = [...(activitiesByInstance.get(inst.id) ?? [])].sort((a, b) => a.step_no - b.step_no);
      const steps: StepView[] = rows.map((a) => {
        const s = stepsByNo.get(a.step_no);
        return {
          activityId: a.id,
          stepNo: a.step_no,
          activityType: a.activity_type,
          mode: a.mode,
          purpose: a.purpose,
          targetIds: a.target_ids,
          timeMin: s?.time_min ?? null,
          promptEn: s?.prompt_en ?? "",
          itemCount: s?.items.length ?? 0,
          schedule: effectiveSchedule(a.scheduled_for, eventsByActivity.get(a.id) ?? []),
        };
      });
      return {
        id: inst.id,
        templateId: inst.template_id,
        templateVersion: inst.template_version,
        titleVi: snap.template.title_vi,
        bigQuestionEn: snap.template.big_question_en,
        bigQuestionVi: snap.template.big_question_vi,
        week: snap.template.week,
        dateFrom: snap.template.date_from,
        dateTo: snap.template.date_to,
        assignedAt: inst.assigned_at,
        dueOn: inst.due_on,
        sources: snap.sources.map((s) => ({ id: s.id, title: s.title, modality: s.modality, url: s.url })),
        steps,
      };
    });
}

export type TemplateRow = {
  id: string;
  version: number;
  title_vi: string;
  big_question_en: string;
  big_question_vi: string;
  week: number;
  date_from: string;
  date_to: string;
  domain_bucket: string;
  steps: unknown[];
};

export type TemplateView = {
  id: string;
  version: number;
  titleVi: string;
  bigQuestionEn: string;
  bigQuestionVi: string;
  week: number;
  dateFrom: string;
  dateTo: string;
  stepCount: number;
};

/** Newest published version of each template, ordered by week then id. */
export function buildTemplateViews(rows: readonly TemplateRow[]): TemplateView[] {
  const latest = new Map<string, TemplateRow>();
  for (const r of rows) {
    const cur = latest.get(r.id);
    if (!cur || r.version > cur.version) latest.set(r.id, r);
  }
  return [...latest.values()]
    .sort((a, b) => a.week - b.week || a.id.localeCompare(b.id))
    .map((r) => ({
      id: r.id,
      version: r.version,
      titleVi: r.title_vi,
      bigQuestionEn: r.big_question_en,
      bigQuestionVi: r.big_question_vi,
      week: r.week,
      dateFrom: r.date_from,
      dateTo: r.date_to,
      stepCount: r.steps.length,
    }));
}

/**
 * Imported work (W3, template ids A-IM-/B-IM-nnnnnn, the only shape the database allows for kind 'imported') is a RECORD of paper work, never assigned
 * work: it must not appear in "Bài đã giao", in step actions or in the offline form. Pure.
 */
export const isImportedTemplateId = (id: string): boolean => /^[AB]-IM-\d{6}$/.test(id);
export function withoutImported(d: { instances: InstanceRow[]; activities: ActivityRow[]; events: EventRow[] }): { instances: InstanceRow[]; activities: ActivityRow[]; events: EventRow[] } {
  const instances = d.instances.filter((i) => !isImportedTemplateId(i.template_id));
  const keep = new Set(instances.map((i) => i.id));
  const activities = d.activities.filter((a) => keep.has(a.inquiry_instance_id));
  const acts = new Set(activities.map((a) => a.id));
  return { instances, activities, events: d.events.filter((e) => acts.has(e.activity_instance_id)) };
}
