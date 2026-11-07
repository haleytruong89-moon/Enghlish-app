/**
 * Two timestamp strings from Postgres name the same instant? The text of a timestamptz depends on the session TimeZone ("…+00:00" vs
 * "…+07:00"), so the optimistic lock compares instants (seconds + the full fractional part), never the raw text. Pure.
 */
function key(s: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(s.trim());
  if (!m) return null;
  const off = m[4] === "Z" ? "Z" : m[4]!.length === 3 ? `${m[4]}:00` : m[4]!.includes(":") ? m[4]! : `${m[4]!.slice(0, 3)}:${m[4]!.slice(3)}`;
  const ms = Date.parse(`${m[1]}T${m[2]}${off}`);
  return Number.isNaN(ms) ? null : `${ms / 1000}.${(m[3] ?? "").padEnd(6, "0").slice(0, 6)}`;
}
export function sameInstant(a: string, b: string): boolean {
  const ka = key(a);
  const kb = key(b);
  return ka !== null && kb !== null && ka === kb;
}
