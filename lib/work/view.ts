import { activityLabels, weekdayNames, work } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { isDoneInApp } from "./types";

/** "2026-10-14T08:05:00Z" → "15:05" in Vietnam time (the app's one clock). */
export function formatHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" })
    .format(d)
    .replace(/ | /g, " ");
}

/** "Thứ Tư 14/10" for today in Vietnam. */
export function todayLine(now: Date = new Date()): string {
  const iso = todayVn(now);
  const weekday = weekdayNames[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
  return work.todayLine(weekday, `${iso.slice(8, 10)}/${iso.slice(5, 7)}`);
}

/** The label of a step that the app cannot do yet (no submit button): with the tutor, or still on paper. */
export function unsupportedLabel(activityType: string): string {
  return activityType === "ACT-SPEAK-LIVE" ? work.withTutor : work.noAppYet;
}

/** Row text for the checklist. */
export function stepTitle(activityType: string): string {
  return activityLabels[activityType] ?? activityType;
}

export function doableInApp(activityType: string, mode: string): boolean {
  return isDoneInApp(activityType, mode);
}


/** Words in a text (any run of non-space characters), for the writing editor's counter. */
export function wordsOf(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

/** Only the answers that have something in them (an empty box is "not answered", not an answer). */
export function nonEmptyAnswers(answers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim() !== ""));
}

/**
 * Source titles in the content carry a staff note in a trailing bracket ("… (bài đọc VOL-R)", "… (cloze passage, MINI-20 Q10-15)").
 * A child sees the plain title only.
 */
export function sourceTitle(title: string): string {
  const cleaned = title.replace(/\s*\((?=[^)]*(?:bài đọc|bài nghe|file |MINI-|cloze|reading|listening script|exam-style))[^)]*\)\s*$/i, "");
  return cleaned.trim() === "" ? title : cleaned;
}
