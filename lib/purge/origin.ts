/**
 * Same-origin check for the one destructive route. The session cookie would be sent with a request from another site, so the browser's
 * own headers are checked as well: `Origin` must name this very host. Without `Origin` (old clients) the browser's `Sec-Fetch-Site` must
 * say same-origin. Anything else is refused (403). This is on top of requireAccess, never instead of it.
 */
export function isSameOrigin(headers: { get(name: string): string | null }): boolean {
  const origin = headers.get("origin");
  const hosts = [headers.get("host"), headers.get("x-forwarded-host")].filter((h): h is string => !!h).map((h) => h.toLowerCase());
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return false; // "null" (sandboxed frames, some redirects) and garbage
    }
    return hosts.includes(originHost);
  }
  return headers.get("sec-fetch-site") === "same-origin";
}
