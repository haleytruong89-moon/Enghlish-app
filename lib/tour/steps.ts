/**
 * The tour of the adult pages (27/11, parent: "tour khi cô mở app"). Each step points at one place of the shell by its test id and
 * says in one or two sentences what it is for. Pure: the component finds the element; a step whose element is not on screen
 * (phone, menu folded) is shown in the middle without a highlight.
 */
import { tourCopy } from "@/lib/copy/vi";

export type TourStep = { key: string; target: string; title: string; body: string };

export const TOUR_VERSION = "v1";
/** Remembered on this device only (no SQL): a new device shows the tour once again. */
export const TOUR_SEEN_KEY = `eos.tour.${TOUR_VERSION}.seen`;

export function tourSteps(alias: string): TourStep[] {
  const s = tourCopy.steps;
  return [
    { key: "welcome", target: "staff-topbar", title: s.welcome.title, body: s.welcome.body(alias) },
    { key: "grade", target: "quick-grade", title: s.grade.title, body: s.grade.body },
    { key: "assign", target: "quick-assign", title: s.assign.title, body: s.assign.body },
    { key: "note", target: "quick-note", title: s.note.title, body: s.note.body },
    { key: "desk", target: "nav-desk", title: s.desk.title, body: s.desk.body },
    { key: "work", target: "nav-work", title: s.work.title, body: s.work.body },
    { key: "sessions", target: "nav-sessions", title: s.sessions.title, body: s.sessions.body },
    { key: "progress", target: "nav-progress", title: s.progress.title, body: s.progress.body },
    { key: "plan", target: "nav-plan", title: s.plan.title, body: s.plan.body },
    { key: "start", target: "tour-open", title: s.start.title, body: s.start.body(alias) },
  ];
}
