/** Session statistics types (pure data; no I/O). One buổi = one VN calendar day with at least one current lesson note written by a TUTOR (DOMAIN §5.6); days with only parent notes are listed but not counted. */
export type NoteRow = { id: string; sessionDate: string; supersedesId: string | null; authorRole: "tutor" | "parent"; published: boolean; createdAt: string };
export type TaughtRow = { noteId: string; curriculumId: string; unitCode: string };
/** Client-safe: no ids (the page passes these objects to client components). */
export type DayUnit = { code: string; title: string | null };
export type SessionDay = {
  date: string;
  /** Sessions on that day: 1 when a tutor wrote a current note, 0 for a parent-only day (shown, not counted). 3B adds makeup sessions. */
  sessions: number;
  /** Two or more current notes on the same day (counted as one session, flagged). */
  sameDay: boolean;
  units: DayUnit[];
  authors: ("tutor" | "parent")[];
  /** Only parent-written current notes that day: shown with its own mark and NOT counted (parent to confirm). */
  parentOnly: boolean;
  /** Every note of the day is private (not shared): the content and the Units are never shown to the parent. */
  privateOnly: boolean;
};
export type MonthSummary = { month: string; sessions: number; days: SessionDay[] };
export type SessionStats = { total: number; thisMonth: number; perWeek: number | null; last: string | null };
export type WeekRow = { weekStart: string; cells: { date: string; future: boolean; day: SessionDay | null }[] };
