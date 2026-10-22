/** Excerpts of feedback items, found in the child's text for highlighting (pure). The database checks the excerpt the same way (cleaned text). */
import { cleanText } from "./text";

const escapeRe = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A straight quote in the (cleaned) excerpt matches a straight or curly one in the text. */
const QUOTE: Record<string, string> = { "'": "['‘’‛]", '"': '["“”]' };
const SPACE = "[\\s\\u00A0\\u202F\\u2000-\\u200A\\u205F\\u3000]+";

/** Where the excerpt sits in the text, ignoring differences in spacing and quote style; null when it is not there. */
export function findExcerpt(text: string, excerpt: string): { start: number; end: number } | null {
  const words = cleanText(excerpt).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const pattern = words.map((w) => Array.from(w).map((ch) => QUOTE[ch] ?? escapeRe(ch)).join("")).join(SPACE);
  const m = new RegExp(pattern).exec(text);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

export type Segment = { text: string; n: number | null };

/** The text cut into plain parts and the excerpts of the numbered items (first place of each; an excerpt overlapping an earlier one is skipped). */
export function segmentsFor(text: string, items: { n: number; excerpt: string | null }[]): Segment[] {
  const spans = items
    .flatMap((it) => {
      if (!it.excerpt) return [];
      const at = findExcerpt(text, it.excerpt);
      return at ? [{ ...at, n: it.n }] : [];
    })
    .sort((x, y) => x.start - y.start || x.n - y.n);
  const out: Segment[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue;
    if (s.start > pos) out.push({ text: text.slice(pos, s.start), n: null });
    out.push({ text: text.slice(s.start, s.end), n: s.n });
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), n: null });
  return out;
}
