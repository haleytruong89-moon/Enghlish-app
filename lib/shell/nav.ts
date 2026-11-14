/**
 * The staff sidebar as data (pure, unit-tested). Sections follow the agreed workdesk prototype (spec §3). A section that a later
 * slice builds is "soon": shown, never a link, until that slice flips its status here. No track branching: the same model for every
 * child; only the learner id differs.
 */
import { aiSettingsCopy, importCopy, levelCopy, notesPage, purgePage, readingPage, resultPage, revisionReviewCopy, sessionNotePage, shellCopy, skillStateCopy, studioInboxCopy, targetsPage, weakPage } from "@/lib/copy/vi";

export const SECTION_KEYS = ["desk", "profile", "knowledge", "roadmap", "sessions", "assign", "results", "curricula", "inbox"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type NavStatus = "live" | "soon";
export type NavRole = "tutor" | "parent";
export type NavFlags = { revisionsReady: boolean };
export type NavLink = { key: string; label: string; href: string };
export type NavSection = { key: SectionKey; label: string; status: NavStatus; lane: string | null; href: string | null; children: NavLink[] };
export type NavModel = { sections: NavSection[]; parent: NavLink[] };

export type SectionDef = {
  key: SectionKey;
  status: NavStatus;
  /** The slice that builds a "soon" section (shown to nobody; for the plan and the tests). */
  lane: string | null;
  root: (learnerId: string) => string;
  children: (learnerId: string, flags: NavFlags) => NavLink[];
};

const L = (id: string) => `/learners/${id}`;
export const learnerQuery = (id: string) => `?learner=${id}`;

export const SECTIONS: readonly SectionDef[] = [
  { key: "desk", status: "live", lane: null, root: (id) => `/${learnerQuery(id)}`, children: () => [] },
  {
    key: "profile", status: "live", lane: null, root: (id) => `${L(id)}/levels`,
    children: (id) => [
      { key: "levels", label: levelCopy.link, href: `${L(id)}/levels` },
      { key: "weak", label: weakPage.link, href: `${L(id)}/weak` },
      { key: "targets", label: targetsPage.link, href: `${L(id)}/targets` },
      { key: "reading", label: readingPage.link, href: `${L(id)}/reading/new` },
    ],
  },
  { key: "knowledge", status: "live", lane: null, root: (id) => `${L(id)}/knowledge`, children: () => [] },
  { key: "roadmap", status: "live", lane: null, root: (id) => `${L(id)}/roadmap`, children: () => [] },
  {
    key: "sessions", status: "live", lane: null, root: (id) => `${L(id)}/notes`,
    children: (id) => [
      { key: "notesNew", label: sessionNotePage.link, href: `${L(id)}/notes/new` },
      { key: "notes", label: notesPage.link, href: `${L(id)}/notes` },
    ],
  },
  { key: "assign", status: "live", lane: null, root: (id) => `${L(id)}/assign`, children: () => [] },
  {
    key: "results", status: "live", lane: null, root: (id) => `${L(id)}/imports/new`,
    children: (id) => [
      { key: "import", label: importCopy.link, href: `${L(id)}/imports/new` },
      { key: "results", label: resultPage.link, href: `${L(id)}/results/new` },
    ],
  },
  { key: "curricula", status: "live", lane: null, root: (id) => `${L(id)}/curricula`, children: () => [] },
  {
    key: "inbox", status: "live", lane: null, root: (id) => `${L(id)}/inbox`,
    children: (id, f) => [
      { key: "all", label: shellCopy.inboxAll, href: `${L(id)}/inbox` },
      { key: "work", label: skillStateCopy.tabWork, href: `/review${learnerQuery(id)}` },
      { key: "skills", label: skillStateCopy.tabSkills, href: `/review/skills${learnerQuery(id)}` },
      { key: "studio", label: studioInboxCopy.tab, href: `/review/studio${learnerQuery(id)}` },
      ...(f.revisionsReady ? [{ key: "revisions", label: revisionReviewCopy.link, href: `${L(id)}/revisions` }] : []),
    ],
  },
];

export function buildNav(role: NavRole, learnerId: string | null, flags: NavFlags): NavModel {
  const sections = SECTIONS.map((s): NavSection => {
    const live = s.status === "live" && learnerId !== null;
    return {
      key: s.key,
      label: shellCopy.sections[s.key],
      status: s.status,
      lane: s.lane,
      href: s.key === "desk" ? (learnerId ? s.root(learnerId) : "/") : live && learnerId ? s.root(learnerId) : null,
      children: live && learnerId ? s.children(learnerId, flags) : [],
    };
  });
  const parent: NavLink[] =
    role === "parent"
      ? [
          { key: "aiSettings", label: aiSettingsCopy.navLink, href: `/settings/ai${learnerId ? learnerQuery(learnerId) : ""}` },
          ...(learnerId ? [{ key: "delete", label: purgePage.link, href: `${L(learnerId)}/delete` }] : []),
        ]
      : [];
  return { sections, parent };
}
