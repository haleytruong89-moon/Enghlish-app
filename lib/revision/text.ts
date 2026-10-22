/**
 * Same clean-up as english.eng_clean_text (migration 0009): NFC; odd spaces → " "; zero-width characters removed; curly quotes →
 * straight; runs of white space → one space; trimmed. Used to test excerpts and "the text did not change" exactly as the database does.
 */
export function cleanText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[   -  　]/g, " ")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** The revision changed no word (spacing does not count) - then every item must be "Giữ nguyên" with a reason (spec §2.4). */
export function isUnchanged(before: string, after: string): boolean {
  return cleanText(before) === cleanText(after);
}
