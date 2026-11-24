/**
 * E2a · learner-style IPA from ipa-dict (MIT, pinned commit, checked by sha256 when loaded). Pure. The AI never writes IPA (spec L3):
 * the card shows what this file builds from the `ipa_lexicon` table, or no line at all.
 */
export const IPA_SOURCE = {
  repo: "open-dict-data/ipa-dict",
  commit: "972cd67dd5f96bc5660e28070cde26e3928abcd7",
  files: {
    uk: { path: "data/en_UK.txt", sha256: "221394caef0cf723b4f2df81a98ac33191293257b88aed5b1fb89466d3a0dc77" },
    us: { path: "data/en_US.txt", sha256: "2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67" },
  },
} as const;
export type Accent = keyof typeof IPA_SOURCE.files;

// English onsets written with the symbols ipa-dict uses (after ɹ → r). Tried longest first.
const ONSETS = [
  "spr", "str", "skr", "spl", "skw", "pr", "br", "tr", "dr", "kr", "gr", "ɡr", "fr", "θr", "ʃr", "pl", "bl", "kl", "gl", "ɡl", "fl", "sl",
  "sp", "st", "sk", "sm", "sn", "sw", "tw", "dw", "kw", "gw", "θw", "pj", "bj", "tj", "dj", "kj", "gj", "mj", "nj", "fj", "vj", "hj", "lj", "sj",
  "tʃ", "dʒ", "p", "b", "t", "d", "k", "g", "ɡ", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "m", "n", "l", "r", "w", "j",
].sort((a, b) => b.length - a.length);

/**
 * ipa-dict puts the stress mark before the vowel (/vɒlkˈeɪnəʊ/); learners' dictionaries put it before the syllable (/vɒlˈkeɪnəʊ/):
 * each mark moves back over the longest English onset right before it. ɹ → r; ɐ → ʌ when stressed, else ə; no spaces.
 */
export function normalizeIpa(raw: string): string {
  const s = raw.trim().replace(/^\/|\/$/g, "").replace(/\s+/g, "").replace(/ɹ/g, "r");
  let out = "";
  for (const ch of s) {
    if (ch !== "ˈ" && ch !== "ˌ") {
      out += ch;
      continue;
    }
    const on = ONSETS.find((o) => out.endsWith(o));
    out = on ? out.slice(0, out.length - on.length) + ch + on : out + ch;
  }
  const fixed = out.replace(/([ˈˌ][^aeiouæɑɒɔəɛɜɪʊʌɐ]*)ɐ/g, "$1ʌ").replace(/ɐ/g, "ə");
  return `/${fixed}/`;
}

/** One line of an ipa-dict file: "word<TAB>/ipa/, /ipa2/". */
export function parseIpaLine(line: string): { word: string; ipa: string[] } | null {
  const tab = line.indexOf("\t");
  if (tab <= 0) return null;
  const word = line.slice(0, tab).trim().toLowerCase();
  const ipa = line
    .slice(tab + 1)
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.startsWith("/") && x.endsWith("/") && x.length > 2);
  return word && ipa.length ? { word, ipa } : null;
}

/** "/ˈmeɪk ˈfrendz/" from already-normalized single words (first variant of each); null when any word is missing (spec §5.1). */
export function phraseIpa(words: string[], lookup: Map<string, string[]>): string | null {
  const parts: string[] = [];
  for (const w of words) {
    const v = lookup.get(w.toLowerCase())?.[0];
    if (!v) return null;
    parts.push(v.replace(/^\/|\/$/g, ""));
  }
  return parts.length ? `/${parts.join(" ")}/` : null;
}
