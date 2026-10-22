/**
 * One list for the app check (lib/revision/scoreWords.ts) and the database check (english.eng_has_score_words): [text, has a score].
 * Rule (parent decision G2, 22/10/2026), exactly three kinds and nothing else:
 *  1. a/b with b an integer 1-10 and 0 <= a <= b ("3/4", "7 / 10"; dates and "12/20" are fine; "1/2" is ambiguous and IS refused);
 *  2. "điểm" next to a number, at most one word apart, either order ("6 điểm", "điểm 7", "điểm: 9"; "điểm mạnh" is fine);
 *  3. a percent sign that follows a number ("80%", "80 %").
 */
export const SCORE_WORD_SAMPLES: readonly (readonly [string, boolean])[] = [
  // 1. fractions that look like a score
  ["Bài được 3/4", true],
  ["được 3 / 4 câu", true],
  ["7 / 10", true],
  ["10/10", true],
  ["0/4", true],
  ["09/10", true],
  ["1/2", true],
  // ...and fractions that do not
  ["như hôm 22/10", false],
  ["12/20", false],
  ["5/4", false],
  ["3/11", false],
  ["ngày 3/12", false],
  ["10/2026", false],
  ["1/0", false],
  // 2. "điểm" next to a number
  ["con được 6 điểm", true],
  ["điểm 7", true],
  ["được 8 điểm", true],
  ["Điểm: 9", true],
  ["được 8 ĐIỂM", true],
  ["điểm là 9", true],
  ["Điểm 5/ nhé", true],
  // ...and "điểm" without a number
  ["Điểm cao lắm", false],
  ["ĐIỂM", false],
  ["con được điểm tốt", false],
  ["Điểm mạnh của bài là ví dụ rõ", false],
  ["điểm cần chú ý", false],
  ["Điểm yếu là câu kết", false],
  ["diem", false],
  ["Lần 2 con viết rõ hơn", false],
  // 3. percent sign after a number
  ["đúng 80% rồi", true],
  ["80 %", true],
  ["một phần trăm %", false],
  // other text
  ["Con dùng “because” đúng chỗ", false],
  ["Câu mở đoạn rõ ràng, có ví dụ", false],
  ["Thêm một câu kết cho đoạn văn", false],
] as const;
