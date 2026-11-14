/** Session statistics types (pure data; no I/O). One buổi = one VN calendar day with at least one current lesson note written by a TUTOR (DOMAIN §5.6); days with only parent notes are listed but not counted. */
export type NoteRow = { id: string; sessionDate: string; supersedesId: string | null; authorRole: "tutor" | "parent"; published: boolean; createdAt: string };
/** A "dấu" on a lesson note chain (3B, table session_marks). */
export type MarkRow = { id: string; noteId: string; kind: "regular" | "makeup" | "not_counted"; makeupFor: string | null; reason: string | null; createdAt: string };
/** A row of session_absences (3B). `cancelsId` set = a "Bỏ ghi nghỉ" row (its `note` is the reason). */
export type AbsenceRow = { id: string; absentOn: string; requestedBy: "student" | "tutor" | "other"; billable: boolean; cancelsId: string | null; note: string | null; createdAt: string };
export type TaughtRow = { noteId: string; curriculumId: string; unitCode: string };
/** Client-safe: no ids (the page passes these objects to client components). */
export type DayUnit = { code: string; title: string | null };
export type SessionDay = {
  date: string;
  /** Sessions on that day (U18): 1 for a regular tutor note + 1 for a makeup tutor note; 0 for a parent-only day (shown, not counted). */
  sessions: number;
  /** A tutor wrote a current "Thường" note / a current "Học bù" note that day (a "Không tính" note is in neither). */
  regular: boolean;
  makeup: boolean;
  /** Absences (ids of session_absences) that the makeup notes of the day point to. */
  makeupFor: string[];
  /** Two or more current notes of the SAME kind on the same day (counted once, flagged). */
  sameDay: boolean;
  units: DayUnit[];
  authors: ("tutor" | "parent")[];
  /** Only parent-written current notes that day: shown with its own mark and NOT counted (parent to confirm). */
  parentOnly: boolean;
  /** Every note of the day is private (not shared): the content and the Units are never shown to the parent. */
  privateOnly: boolean;
};
/** Billable sessions of a month (rule S-1, U19). No money: only counts. */
export type MonthBilling = {
  /** Sessions held (regular + makeup). */
  sessions: number;
  makeups: number;
  /** Live absences of the month by who asked. */
  absences: { student: number; tutor: number; other: number };
  absenceTotal: number;
  /** = sessions + billable absences - makeups that point to a billable absence. */
  billable: number;
  /** Session days (dd) and absence days of the month, ISO dates. */
  dates: string[];
  absenceDates: { date: string; requestedBy: "student" | "tutor" | "other"; billable: boolean }[];
  /** Days of the month with a live absence AND a counted session (one of the two is probably a mistake). */
  clashDates: string[];
};
export type MonthSummary = { month: string; sessions: number; days: SessionDay[]; billing: MonthBilling };
export type SessionStats = { total: number; thisMonth: number; perWeek: number | null; last: string | null };
export type WeekCell = { date: string; future: boolean; day: SessionDay | null; absence: { requestedBy: "student" | "tutor" | "other"; billable: boolean } | null; clash: boolean };
export type WeekRow = { weekStart: string; cells: WeekCell[] };
