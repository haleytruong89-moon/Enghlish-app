/**
 * The staff sidebar as data (pure, unit-tested). Hướng B (26/11, docs/superpowers/specs/2026-11-26-ia-huong-b-design.md): three quick
 * buttons for the daily work, five sections, then Hồ sơ học sinh. No track branching: the same model for every child.
 */
import { aiSettingsCopy, profilePage, purgePage, readingPage, shellCopy, tutorAsksCopy } from "@/lib/copy/vi";

export const SECTION_KEYS = ["desk", "work", "sessions", "progress", "plan", "profile"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const QUICK_KEYS = ["grade", "assign", "note"] as const;
export type QuickKey = (typeof QUICK_KEYS)[number];
export type NavStatus = "live" | "soon";
export type NavRole = "tutor" | "parent";
export type NavFlags = { revisionsReady: boolean };
export type NavLink = { key: string; label: string; href: string };
export type NavQuick = { key: QuickKey; label: string; href: string };
export type NavSection = { key: SectionKey; label: string; status: NavStatus; lane: string | null; href: string | null; children: NavLink[] };
export type NavModel = { quick: NavQuick[]; sections: NavSection[]; parent: NavLink[] };

export type SectionDef = {
  key: SectionKey;
  status: NavStatus;
  lane: string | null;
  root: (learnerId: string) => string;
  children: (learnerId: string, flags: NavFlags) => NavLink[];
};

const L = (id: string) => `/learners/${id}`;
export const learnerQuery = (id: string) => `?learner=${id}`;

export const QUICK: readonly { key: QuickKey; href: (id: string) => string }[] = [
  { key: "grade", href: (id) => `${L(id)}/finish` },
  { key: "assign", href: (id) => `${L(id)}/assign` },
  { key: "note", href: (id) => `${L(id)}/notes/new` },
];

export const SECTIONS: readonly SectionDef[] = [
  { key: "desk", status: "live", lane: null, root: (id) => `/${learnerQuery(id)}`, children: () => [] },
  { key: "work", status: "live", lane: null, root: (id) => `${L(id)}/assigned`, children: () => [] },
  { key: "sessions", status: "live", lane: null, root: (id) => `${L(id)}/notes`, children: () => [] },
  { key: "progress", status: "live", lane: null, root: (id) => `${L(id)}/progress`, children: () => [] },
  { key: "plan", status: "live", lane: null, root: (id) => `${L(id)}/curricula`, children: () => [] },
  {
    key: "profile", status: "live", lane: null, root: (id) => `${L(id)}/profile`,
    children: (id) => [
      { key: "profile", label: profilePage.link, href: `${L(id)}/profile` },
      { key: "tutorAsks", label: tutorAsksCopy.link, href: `${L(id)}/tutor-asks` },
      { key: "reading", label: readingPage.link, href: `${L(id)}/reading/new` },
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
  const quick: NavQuick[] = learnerId ? QUICK.map((q) => ({ key: q.key, label: shellCopy.quick[q.key], href: q.href(learnerId) })) : [];
  const parent: NavLink[] =
    role === "parent"
      ? [
          { key: "aiSettings", label: aiSettingsCopy.navLink, href: `/settings/ai${learnerId ? learnerQuery(learnerId) : ""}` },
          ...(learnerId ? [{ key: "delete", label: purgePage.link, href: `${L(learnerId)}/delete` }] : []),
        ]
      : [];
  return { quick, sections, parent };
}
