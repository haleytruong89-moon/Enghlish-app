/** Studio 1A - monthly reading-skill reports (TOMO-style). Staff only; a signal, never evidence. */
export const READING_MAX_ROWS = 20;
export const READING_NOTE_MAX = 300;
export const READING_SOURCE_MAX = 40;
/** How far back a monthly report may be dated (the database rule is the same: 24 months). */
export const READING_MONTHS_BACK = 24;

export type ReadingStatus = "none" | "thin" | "weak" | "ok";

export type ReadingSkill = {
  tagKey: string;
  label: string;
  questions: number | null;
  correctPct: number | null;
  prevQuestions: number | null;
  prevCorrectPct: number | null;
  status: ReadingStatus;
  wrong6w: number;
};

export type ReadingSkillsView = {
  minQuestions: number;
  weakPct: number;
  latestMonth: string | null;
  latestSource: string | null;
  previousMonth: string | null;
  skills: ReadingSkill[];
};

export type ReadingReportEdit = {
  id: string;
  month: string;
  source: string;
  note: string | null;
  rows: { tagKey: string; questions: number; correctPct: number }[];
};
