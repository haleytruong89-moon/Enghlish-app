/**
 * Adult text that looks like a score (spec §6, narrowed by the parent on 22/10/2026 - G2; the exact wording of the rule below is Claude's
 * proposal, for the parent to review). Exactly five kinds, nothing else:
 *  1. a fraction a/b (spaces around "/" allowed) with b an integer 1-10 and 0 <= a <= b: "3/4", "7 / 10", "1/2".
 *     NOT a score when it directly follows (spaces only) a date word - ngày, hôm, từ, đến, tới, trước, sau, hạn, tháng ("hôm 5/10") -
 *     or is followed by another "/digits" (a full date, "1/10/2026") or by the word "trang" ("1/2 trang"). "22/10" and "12/20" pass (a > b).
 *  2. a number next to "điểm", "diem" or "đ", at most one word apart, either order: "8đ", "8 đ", "6 điểm", "điểm 7", "8 diem"
 *     ("điểm mạnh", "điểm cần chú ý", "điểm yếu" pass).
 *  3. "N trên M" with M an integer 1-10: "8 trên 10".
 *  4. a percent sign that follows a number: "80%", "80 %".
 *  5. the 0-4 rubric labels of UX_COPY_GUIDE 3.1, in any letter case: "Chưa thể hiện", "Còn thiếu nhiều", "Được một phần", "Đạt yêu cầu", "Vững, rõ ràng".
 * Before matching: NFC, and NBSP / U+202F / U+3000 become a normal space.
 * Mirror of english.eng_has_score_words (migration 0021); both are tested on tests/unit/fixtures/scoreWords.ts.
 * Only for the text of adults (feedback, closing note) - never for the child's text, excerpts or reasons.
 */
// Separators = white space, ASCII punctuation (not digits) and “ ” ‘ ’ … – — (the same set as the SQL function).
const SEP = "[\\s!-/:-@[-\\x60{-~“”‘’…–—]";
const NOT_SEP = "[^\\s!-/:-@[-\\x60{-~“”‘’…–—]";
const WORD = "[^\\s!-/:-@[-\\x60{-~“”‘’…–—0-9]+";

/** "đạt" -> "[đĐ][aA]..." - the SQL side writes both cases by hand because the C locale does not fold accented letters. */
const ci = (w: string): string =>
  [...w]
    .map((c) => {
      const lo = c.toLowerCase();
      const up = c.toUpperCase();
      return lo === up ? c : `[${lo}${up}]`;
    })
    .join("");

const DATE_WORDS = ["ngày", "hôm", "từ", "đến", "tới", "trước", "sau", "hạn", "tháng"].map(ci).join("|");
export const RUBRIC_PHRASES = ["chưa thể hiện", "còn thiếu nhiều", "được một phần", "đạt yêu cầu", "vững rõ ràng"];
const RUBRIC = RUBRIC_PHRASES.map((p) =>
  p
    .split(" ")
    .map(ci)
    .join(",?\\s+"),
).join("|");

const DIEM = `(?:[đĐ][iI][ểỂ][mM]|[dD][iI][eE][mM]|[đĐ](?!${NOT_SEP}))`;
const NUMBER_THEN_DIEM = new RegExp(`[0-9]${SEP}*(?:${WORD}${SEP}+)?${DIEM}`);
const DIEM_THEN_NUMBER = new RegExp(`${DIEM}${SEP}*(?:${WORD}${SEP}+)?[0-9]`);
const OUT_OF = new RegExp(`[0-9]\\s*${ci("trên")}\\s*0*(?:10|[1-9])(?![0-9])`);
const RUBRIC_RE = new RegExp(RUBRIC);
// 1 = date word before, 2 = a, 3 = b, 4 = "/digit" after (a full date), 5 = "trang" after
const FRACTION = new RegExp(
  `((?<!${NOT_SEP})(?:${DATE_WORDS})\\s*)?(?<![0-9])([0-9]+)\\s*/\\s*([0-9]+)(?![0-9])(?:(\\s*/\\s*[0-9])|(\\s*${ci("trang")}(?!${NOT_SEP})))?`,
  "g",
);

export function normalizeAdultText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFC").replace(/[  　]/g, " ");
}

export function hasScoreWords(s: string | null | undefined): boolean {
  const t = normalizeAdultText(s);
  for (const m of t.matchAll(FRACTION)) {
    if (m[1] === undefined && m[4] === undefined && m[5] === undefined && /^0*(10|[1-9])$/.test(m[3]!) && BigInt(m[2]!) <= BigInt(m[3]!)) return true;
  }
  return NUMBER_THEN_DIEM.test(t) || DIEM_THEN_NUMBER.test(t) || OUT_OF.test(t) || /[0-9]\s*%/.test(t) || RUBRIC_RE.test(t);
}
