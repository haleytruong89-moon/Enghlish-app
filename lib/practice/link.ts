/**
 * Links in assignments and submissions: https only, and the source (test-english / NotebookLM / Gemini / other) is recognised from the
 * host name. The database applies the SAME rules (english.eng_link_source_key and the CHECK on assignments.url), so the checks here
 * only answer faster; a test runs both on the same list of addresses.
 */

export const SOURCE_KEYS = ["test-english", "notebooklm", "gemini", "other"] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

export const MAX_URL_LENGTH = 2000;

// Same shape as the CHECK in migration 0016: https, a plain host name (no user:password@, no spaces), optional port, optional path.
const HTTPS_RE = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#]\S*)?$/i;

const HOSTS: { key: Exclude<SourceKey, "other">; hosts: string[] }[] = [
  { key: "test-english", hosts: ["test-english.com"] },
  { key: "notebooklm", hosts: ["notebooklm.google.com", "notebook.google.com"] },
  { key: "gemini", hosts: ["gemini.google.com", "share.gemini.google"] },
];

/** The trimmed address when it is an acceptable https link, else null. */
export function parseHttpsUrl(input: string): string | null {
  const url = input.trim();
  if (url.length === 0 || url.length > MAX_URL_LENGTH) return null;
  return HTTPS_RE.test(url) ? url : null;
}

/** The host of an address that passed parseHttpsUrl (lower case, no port). */
export function hostOf(url: string): string | null {
  const m = /^https:\/\/([^/?#:@]+)/i.exec(url);
  return m ? (m[1] as string).toLowerCase() : null;
}

/** test-english.com (and subdomains) -> test-english; NotebookLM; Gemini; any other https address -> other; not https -> null. */
export function detectLinkSource(input: string): SourceKey | null {
  const url = parseHttpsUrl(input);
  if (!url) return null;
  const host = hostOf(url);
  if (!host) return null;
  for (const s of HOSTS) {
    if (s.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return s.key;
  }
  return "other";
}
