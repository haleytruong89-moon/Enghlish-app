/**
 * Which sidebar entry a URL belongs to, and the screen name sent with "Góp ý về app" (pure, unit-tested). One table: the order
 * matters (specific paths before /review/[id]). Paths of later slices (W3 knowledge / imports, W5 roadmap) are registered already
 * so their pages light up the right entry as soon as they exist.
 */
import { appFeedback, curriculumCopy, shellCopy } from "@/lib/copy/vi";
import { learnerQuery, SECTIONS, type SectionKey } from "./nav";

export type ActiveKey = SectionKey | "aiSettings" | "delete" | "feedback";
export type Active = { section: ActiveKey | null; child: string | null; screen: string };

const S = appFeedback.screens;
const lp = (rest: string) => new RegExp(`^/learners/[^/]+${rest}$`);
type Rule = { re: RegExp; section: ActiveKey; child: string | null; screen: string };

const RULES: readonly Rule[] = [
  { re: /^\/$/, section: "desk", child: null, screen: S.home },
  { re: lp("/levels/baseline"), section: "profile", child: "levels", screen: S.baseline },
  { re: lp("/levels/adjust"), section: "profile", child: "levels", screen: S.adjust },
  { re: lp("/levels/external/new"), section: "profile", child: "levels", screen: S.external },
  { re: lp("/levels"), section: "profile", child: "levels", screen: S.levels },
  { re: lp("/weak"), section: "profile", child: "weak", screen: S.weak },
  { re: lp("/targets"), section: "profile", child: "targets", screen: S.targets },
  { re: lp("/reading/new"), section: "profile", child: "reading", screen: S.reading },
  { re: lp("/knowledge(/.*)?"), section: "knowledge", child: null, screen: shellCopy.sections.knowledge },
  { re: lp("/roadmap(/.*)?"), section: "roadmap", child: null, screen: shellCopy.sections.roadmap },
  { re: lp("/notes/new"), section: "sessions", child: "notesNew", screen: S.notesNew },
  { re: lp("/notes"), section: "sessions", child: "notes", screen: S.notes },
  { re: lp("/assign"), section: "assign", child: "assign", screen: S.assign },
  { re: /^\/studio\/new$/, section: "assign", child: "studio", screen: S.studioNew },
  { re: /^\/studio\/drafts\/[^/]+$/, section: "assign", child: "studio", screen: S.studioDraft },
  { re: lp("/inquiries"), section: "assign", child: "inquiries", screen: S.inquiries },
  { re: lp("/results/new"), section: "assign", child: "results", screen: S.resultsNew },
  { re: lp("/imports(/.*)?"), section: "assign", child: null, screen: shellCopy.sections.assign },
  { re: lp("/curricula(/[^/]+)?"), section: "curricula", child: null, screen: curriculumCopy.screenLabel },
  { re: /^\/curricula\/versions\/[^/]+$/, section: "curricula", child: null, screen: curriculumCopy.screenLabel },
  { re: lp("/inbox"), section: "inbox", child: "all", screen: S.inbox },
  { re: /^\/review$/, section: "inbox", child: "work", screen: S.review },
  { re: /^\/review\/skills$/, section: "inbox", child: "skills", screen: S.reviewSkills },
  { re: /^\/review\/studio$/, section: "inbox", child: "studio", screen: S.reviewStudio },
  { re: /^\/review\/[^/]+$/, section: "inbox", child: "work", screen: S.reviewEpisode },
  { re: lp("/revisions"), section: "inbox", child: "revisions", screen: S.revisions },
  { re: lp("/revisions/[^/]+"), section: "inbox", child: "revisions", screen: S.revisionOne },
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
  if (a.section === "delete") return `/learners/${to}/delete`;
  const def = SECTIONS.find((s) => s.key === a.section);
  if (!def || def.status !== "live") return `/${learnerQuery(to)}`;
  const child = a.child ? def.children(to, { revisionsReady: true }).find((c) => c.key === a.child) : undefined;
  return child?.href ?? def.root(to);
}

export function feedbackHref(pathname: string, learnerId: string | null): string {
  return `/feedback?screen=${encodeURIComponent(activeFor(pathname).screen)}${learnerId ? `&learner=${learnerId}` : ""}`;
}

/** Link to the desk of one child. A bare "/" opens the parent's default child, so per-child pages must use this. */
export const deskHref = (learnerId: string): string => `/${learnerQuery(learnerId)}`;
