/** The four ways of giving work as data (pure). Display order is the parent's decision of 14/11: Studio first, and recommended. */
import { buildPrefill } from "@/lib/prefill";

export const WAYS = ["studio", "link", "pdf", "topic"] as const;
export type Way = (typeof WAYS)[number];
export const RECOMMENDED: Way = "studio";
type Prefill = Parameters<typeof buildPrefill>[0];

export function parseWay(v: string | string[] | undefined): Way | null {
  const x = Array.isArray(v) ? v[0] : v;
  return (WAYS as readonly string[]).includes(x ?? "") ? (x as Way) : null;
}

const withQuery = (base: string, sp: URLSearchParams) => (sp.toString() ? `${base}${base.includes("?") ? "&" : "?"}${sp.toString()}` : base);

export function wayHref(learnerId: string, way: Way, prefill?: Prefill): string {
  const sp = buildPrefill(prefill ?? {});
  switch (way) {
    case "studio":
      return withQuery(`/studio/new?learner=${learnerId}`, sp);
    case "link":
    case "pdf":
      return withQuery(`/learners/${learnerId}/assign?way=${way}`, sp);
    case "topic":
      return `/learners/${learnerId}/inquiries`; // not by the book: the prefill is dropped
  }
}

export function chooserHref(learnerId: string, prefill?: Prefill): string {
  return withQuery(`/learners/${learnerId}/assign`, buildPrefill(prefill ?? {}));
}
