const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/**
 * Order-free key of a set of evidence ids (D13): "<count>-<FNV-1a 64 hex>". The same set gives the same key; one id more gives another key.
 * Stored in mastery_decisions.evidence_key (CHECK ^[0-9]{1,6}-[0-9a-f]{16}$). Not a security hash: it only tells "the same evidence".
 */
export function evidenceKeyOf(ids: readonly string[]): string {
  const sorted = [...new Set(ids)].sort();
  let h = OFFSET;
  for (const byte of new TextEncoder().encode(sorted.join("|"))) h = ((h ^ BigInt(byte)) * PRIME) & MASK;
  return `${sorted.length}-${h.toString(16).padStart(16, "0")}`;
}
