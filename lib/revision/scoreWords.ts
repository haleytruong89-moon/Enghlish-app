/**
 * Adult text that looks like a score (spec §6, narrowed by the parent on 22/10/2026 - G2). Exactly three kinds, nothing else:
 *  1. a fraction a/b (spaces around "/" allowed) with b an integer 1-10 and 0 <= a <= b: "3/4", "7 / 10" (dates like "22/10" and "12/20" pass;
 *     "1/2" is ambiguous and IS refused);
 *  2. the word "điểm" next to a number, in either order, at most one word apart: "6 điểm", "điểm 7", "được 8 điểm", "điểm: 9"
 *     ("điểm mạnh", "điểm cần chú ý", "điểm yếu" pass);
 *  3. a percent sign that follows a number: "80%", "80 %".
 * Mirror of english.eng_has_score_words (migration 0021); both are tested on tests/unit/fixtures/scoreWords.ts.
 * Never applied to the child's excerpt or reasons.
 */
// Separators = white space, ASCII punctuation (not digits) and “ ” ‘ ’ … – — (the same set as the SQL function).
const SEP = "[\\s!-/:-@[-\\x60{-~“”‘’…–—]";
const WORD = "[^\\s!-/:-@[-\\x60{-~“”‘’…–—0-9]+";
const DIEM = "[đĐ][iI][ểỂ][mM]";
const NUMBER_THEN_DIEM = new RegExp(`[0-9]${SEP}*(?:${WORD}${SEP}+)?${DIEM}`);
const DIEM_THEN_NUMBER = new RegExp(`${DIEM}${SEP}*(?:${WORD}${SEP}+)?[0-9]`);
const FRACTION = /(?<![0-9])([0-9]+)\s*\/\s*([0-9]+)(?![0-9])/g;

export function hasScoreWords(s: string | null | undefined): boolean {
  const t = (s ?? "").normalize("NFC");
  for (const m of t.matchAll(FRACTION)) {
    if (/^0*(10|[1-9])$/.test(m[2]!) && BigInt(m[1]!) <= BigInt(m[2]!)) return true;
  }
  return NUMBER_THEN_DIEM.test(t) || DIEM_THEN_NUMBER.test(t) || /[0-9]\s*%/.test(t);
}
