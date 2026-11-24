/**
 * E2a · what the child typed in "Tra từ" (spec §4.2, A4): one English word or phrase of 1–4 words, ≤ 40 characters; an optional sentence
 * with the word (≤ 200). Pure. The blocked list is checked BEFORE any model call and never sent anywhere.
 */
export type LookupInputError = "empty" | "too_long" | "not_english" | "too_many_words";
export type LookupInputOk = { ok: true; headword: string; words: string[]; context: string | null };

export const WORD_MAX = 40;
export const CONTEXT_MAX = 200;
export const WORDS_MAX = 4;

const clean = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

export function checkLookupInput(word: string, context?: string | null): LookupInputOk | { ok: false; code: LookupInputError } {
  const w = clean(word).toLowerCase();
  if (!w) return { ok: false, code: "empty" };
  if (w.length > WORD_MAX) return { ok: false, code: "too_long" };
  if (!/^[a-z' -]+$/.test(w) || !/[a-z]/.test(w)) return { ok: false, code: "not_english" };
  const words = w.split(" ").filter(Boolean);
  if (words.length > WORDS_MAX) return { ok: false, code: "too_many_words" };
  const c = context ? clean(context).slice(0, CONTEXT_MAX).trim() : "";
  return { ok: true, headword: words.join(" "), words, context: c || null };
}

// Words this page never explains (rude / adult). Matched per word of the phrase, after removing * . _ inside the word.
const BLOCKED = new Set([
  "fuck", "fucking", "fucked", "fucker", "shit", "shitty", "bitch", "bitches", "bastard", "asshole", "arsehole", "cunt", "dick", "dickhead",
  "cock", "pussy", "slut", "whore", "porn", "porno", "pornography", "nude", "nudes", "naked", "sex", "sexy", "horny", "boobs", "tits", "wank",
  "dildo", "orgasm", "erotic", "hentai", "milf", "rape", "raped", "suicide", "cocaine", "heroin", "meth",
]);

export function isBlocked(headword: string): boolean {
  return headword
    .toLowerCase()
    .split(/[\s-]+/)
    .map((w) => w.replace(/[*._']/g, ""))
    .some((w) => BLOCKED.has(w));
}
