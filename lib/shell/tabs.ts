/** Tabs of the option B sections that group existing pages (pure). A tab is a link to one existing page. */
import { shellCopy } from "@/lib/copy/vi";

export type TabLink = { key: string; label: string; href: string };
const L = (id: string) => `/learners/${id}`;

export const planTabs = (id: string): TabLink[] => [
  { key: "curricula", label: shellCopy.planTabs.curricula, href: `${L(id)}/curricula` },
  { key: "roadmap", label: shellCopy.planTabs.roadmap, href: `${L(id)}/roadmap` },
];
