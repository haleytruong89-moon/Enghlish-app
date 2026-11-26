/**
 * Which sidebar entry a URL belongs to, and the screen name sent with "Góp ý về app" (pure, unit-tested). One table: the order
 * matters (specific paths before /review/[id]). Paths of later slices (W3 knowledge / imports, W4a roadmap) are registered already
 * so their pages light up the right entry as soon as they exist.
 */
import { appFeedback, curriculumCopy } from "@/lib/copy/vi";
import { learnerQuery, SECTIONS, type SectionKey } from "./nav";

export type ActiveKey = SectionKey | "aiSettings" | "delete" | "feedback";
export type Active = { section: ActiveKey | null; child: string | null; screen: string };

const S = appFeedback.screens;
const lp = (rest: string) => new RegExp(`^/learners/[^/]+${rest}$`);
type Rule = { re: RegExp; section: ActiveKey; child: string | null; screen: string; switchTo?: (to: string) => string };

const L = (to: string) => `/learners/${to}`;
/** The same page for the other child (when it is not the section root). */
const same = (path: (to: string) => string) => ({ switchTo: path });

/** Hướng B (26/11): every adult page lights one of the six sections (spec "Đường dẫn"); no page was removed. */
const RULES: readonly Rule[] = [
  { re: /^\/$/, section: "desk", child: null, screen: S.home },
  // Hồ sơ học sinh (PR2 moves levels / weak / targets to Tiến bộ)
  { re: lp("/levels/baseline"), section: "profile", child: "levels", screen: S.baseline },
  { re: lp("/levels/adjust"), section: "profile", child: "levels", screen: S.adjust },
  { re: lp("/levels/external/new"), section: "profile", child: "levels", screen: S.external },
  { re: lp("/levels"), section: "profile", child: "levels", screen: S.levels },
  { re: lp("/weak"), section: "profile", child: "weak", screen: S.weak },
  { re: lp("/targets"), section: "profile", child: "targets", screen: S.targets },
  { re: lp("/reading/new"), section: "profile", child: "reading", screen: S.reading },
  { re: lp("/tutor-asks(/.*)?"), section: "profile", child: "tutorAsks", screen: S.tutorAsks },
  // Buổi học
  { re: lp("/notes/new"), section: "sessions", child: null, screen: S.notesNew, ...same((to) => `${L(to)}/notes/new`) },
  { re: lp("/notes(/month/[^/]+)?"), section: "sessions", child: null, screen: S.notes },
  // Bài tập
  { re: lp("/assign"), section: "work", child: null, screen: S.assign, ...same((to) => `${L(to)}/assign`) },
  { re: lp("/assigned"), section: "work", child: null, screen: S.assigned },
  { re: lp("/finish(/[^/]+)?"), section: "work", child: null, screen: S.finish, ...same((to) => `${L(to)}/finish`) },
  { re: /^\/studio\/new$/, section: "work", child: null, screen: S.studioNew, ...same((to) => `/studio/new${learnerQuery(to)}`) },
  { re: /^\/studio\/drafts\/[^/]+$/, section: "work", child: null, screen: S.studioDraft, ...same((to) => `${L(to)}/assigned?tab=drafts`) },
  { re: lp("/inquiries"), section: "work", child: null, screen: S.inquiries, ...same((to) => `${L(to)}/inquiries`) },
  { re: lp("/results/new"), section: "work", child: null, screen: S.resultsNew, ...same((to) => `${L(to)}/results/new`) },
  { re: lp("/imports/new"), section: "work", child: null, screen: S.importNew, ...same((to) => `${L(to)}/imports/new`) },
  { re: lp("/imports(/.*)?"), section: "work", child: null, screen: S.importNew, ...same((to) => `${L(to)}/imports/new`) },
  { re: /^\/imports\/[^/]+$/, section: "work", child: null, screen: S.importConfirm },
  // The review pages list every child; ?learner only picks the sidebar: switching keeps the page.
  { re: /^\/review$/, section: "work", child: null, screen: S.review, ...same((to) => `/review${learnerQuery(to)}`) },
  { re: /^\/review\/studio$/, section: "work", child: null, screen: S.reviewStudio, ...same((to) => `/review/studio${learnerQuery(to)}`) },
  { re: /^\/review\/skills$/, section: "desk", child: null, screen: S.reviewSkills, ...same((to) => `/review/skills${learnerQuery(to)}`) },
  { re: /^\/review\/[^/]+$/, section: "work", child: null, screen: S.reviewEpisode },
  { re: lp("/revisions"), section: "work", child: null, screen: S.revisions, ...same((to) => `${L(to)}/revisions`) },
  { re: lp("/revisions/[^/]+"), section: "work", child: null, screen: S.revisionOne, ...same((to) => `${L(to)}/revisions`) },
  // Tiến bộ (PR2 drops the children)
  { re: lp("/progress"), section: "progress", child: "results", screen: S.progress },
  { re: lp("/knowledge(/.*)?"), section: "progress", child: "knowledge", screen: S.knowledgeMap },
  // Kế hoạch
  { re: lp("/curricula(/[^/]+)?"), section: "plan", child: null, screen: curriculumCopy.screenLabel },
  { re: /^\/curricula\/versions\/[^/]+$/, section: "plan", child: null, screen: curriculumCopy.screenLabel },
  { re: lp("/roadmap(/.*)?"), section: "plan", child: null, screen: S.roadmap, ...same((to) => `${L(to)}/roadmap`) },
  // Việc khác (the old Chờ duyệt list; reached from Hôm nay)
  { re: lp("/inbox"), section: "desk", child: null, screen: S.inbox, ...same((to) => `${L(to)}/inbox`) },
  { re: /^\/settings\/ai$/, section: "aiSettings", child: null, screen: S.settingsAi },
  { re: lp("/delete"), section: "delete", child: null, screen: S.delete },
  { re: /^\/feedback$/, section: "feedback", child: null, screen: S.feedback },
];

export function activeFor(pathname: string): Active {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const r = RULES.find((x) => x.re.test(p));
  return r ? { section: r.section, child: r.child, screen: r.screen } : { section: null, child: null, screen: appFeedback.screenDefault };
}

export function switchHref(pathname: string, to: string): string {
  const a = activeFor(pathname);
  if (a.section === "feedback") return `/feedback${learnerQuery(to)}`;
  if (a.section === "aiSettings") return `/settings/ai${learnerQuery(to)}`;
  // Switching child must never land on another child's delete screen: go to that child's desk instead.
  if (a.section === "delete") return `/${learnerQuery(to)}`;
  const rule = RULES.find((x) => x.re.test(pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname));
  if (rule?.switchTo) return rule.switchTo(to);
  const def = SECTIONS.find((s) => s.key === a.section);
  if (!def || def.status !== "live") return `/${learnerQuery(to)}`;
  const child = a.child ? def.children(to, { revisionsReady: true }).find((c) => c.key === a.child) : undefined;
  return child?.href ?? def.root(to);
}

export function feedbackHref(pathname: string, learnerId: string | null): string {
  return `/feedback?screen=${encodeURIComponent(activeFor(pathname).screen)}${learnerId ? `&learner=${learnerId}` : ""}`;
}

/** The roadmap (Lộ trình) page of one child. */
export const roadmapHref = (learnerId: string): string => `/learners/${learnerId}/roadmap`;

/** Link to the desk of one child. A bare "/" opens the parent's default child, so per-child pages must use this. */
export const deskHref = (learnerId: string): string => `/${learnerQuery(learnerId)}`;
