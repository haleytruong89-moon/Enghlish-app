import { z } from "zod";
import type { ReadingReportEdit, ReadingSkillsView } from "./types";

const intOrNull = z.number().int().nullable();
const skillsSchema = z.object({
  min_questions: z.number().int(),
  weak_pct: z.number().int(),
  latest_month: z.string().nullable(),
  latest_source: z.string().nullable(),
  previous_month: z.string().nullable(),
  skills: z.array(z.object({
    tag_key: z.string(),
    label_vi: z.string(),
    questions: intOrNull,
    correct_pct: intOrNull,
    prev_questions: intOrNull,
    prev_correct_pct: intOrNull,
    status: z.enum(["none", "thin", "weak", "ok"]),
    wrong_6w: z.number().int(),
  })),
});

export function parseReadingSkills(raw: unknown): ReadingSkillsView {
  const v = skillsSchema.parse(raw);
  return {
    minQuestions: v.min_questions,
    weakPct: v.weak_pct,
    latestMonth: v.latest_month,
    latestSource: v.latest_source,
    previousMonth: v.previous_month,
    skills: v.skills.map((s) => ({
      tagKey: s.tag_key, label: s.label_vi, questions: s.questions, correctPct: s.correct_pct,
      prevQuestions: s.prev_questions, prevCorrectPct: s.prev_correct_pct, status: s.status, wrong6w: s.wrong_6w,
    })),
  };
}

const reportRow = z.object({
  id: z.string(),
  month: z.string(),
  source: z.string(),
  note: z.string().nullable(),
  rows: z.array(z.object({ tag_key: z.string(), questions: z.number().int(), correct_pct: z.number().int() })),
});
export function parseReadingReport(raw: unknown): ReadingReportEdit | null {
  if (raw === null || raw === undefined) return null;
  const r = reportRow.parse(raw);
  return { id: r.id, month: r.month, source: r.source, note: r.note, rows: r.rows.map((x) => ({ tagKey: x.tag_key, questions: x.questions, correctPct: x.correct_pct })) };
}
