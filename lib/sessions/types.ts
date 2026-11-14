/** Session statistics types (pure data; no I/O). One buổi = one VN calendar day with at least one current lesson note (DOMAIN §5.6). */
export type NoteRow = { id: string; sessionDate: string; supersedesId: string | null; authorRole: "tutor" | "parent"; published: boolean; createdAt: string };
export type TaughtRow = { noteId: string; curriculumId: string; unitCode: string };
export type DayUnit = { curriculumId: string; code: string; title: string | null };
export type SessionDay = {
  date: string;
  noteIds: string[];
  /** Sessions on that day (1 in 3A; 3B adds makeup sessions). */
  sessions: number;
  /** Two or more current notes on the same day (counted as one session, flagged). */
  sameDay: boolean;
  units: DayUnit[];
  authors: ("tutor" | "parent")[];
  /** Every note of the day is private (not shared): the content and the Units are never shown to the parent. */
  privateOnly: boolean;
};
export type MonthSummary = { month: string; sessions: number; days: SessionDay[] };
export type SessionStats = { total: number; thisMonth: number; perWeek: number | null; last: string | null };
export type WeekRow = { weekStart: string; cells: { date: string; future: boolean; day: SessionDay | null }[] };
