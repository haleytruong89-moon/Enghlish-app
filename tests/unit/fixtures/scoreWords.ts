/**
 * One list for the app check (lib/revision/scoreWords.ts) and the database check (english.eng_has_score_words): [text, has a score].
 * Rule (parent decision G2, 22/10/2026; Claude's proposal for the exact wording, for the parent to review). Adult text only - never the child's.
 *  1. a/b with b an integer 1-10 and 0 <= a <= b ("3/4", "7 / 10", "1/2") - unless it directly follows a date word
 *     (ngày|hôm|từ|đến|tới|trước|sau|hạn|tháng), or is followed by another "/digits" (a full date), or by the word "trang";
 *  2. a number next to "điểm", "diem" or "đ", at most one word apart, either order ("8đ", "6 điểm", "điểm 7");
 *  3. "N trên M" with M 1-10 ("8 trên 10");
 *  4. a percent sign that follows a number ("80%", "80 %");
 *  5. the two upper 0-4 rubric labels (case-insensitive): Đạt yêu cầu, Vững, rõ ràng (S7a amendment A, 23/10/2026: the three lower labels are ordinary words again).
 * Odd spaces (NBSP, U+202F, U+3000) count as a normal space.
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
  ["1/2 điểm", true],
  ["còn 3/4 nữa", true],
  // ...and fractions that do not: a > b, b > 10, b = 0
  ["như 22/10", false],
  ["12/20", false],
  ["5/4", false],
  ["3/11", false],
  ["10/2026", false],
  ["1/0", false],
  // ...a date word right before (spaces only), a full date, or "trang" right after
  ["hôm 5/10", false],
  ["Hôm  5 / 10", false],
  ["ngày 3/4", false],
  ["từ 1/9 đến 5/9", false],
  ["tháng 2/5", false],
  ["trước 3/4", false],
  ["hạn 7/10", false],
  ["ngày 1/10/2026", false],
  ["1/10/2026", false],
  ["3 / 4 / 2026", false],
  ["1/2 trang", false],
  ["viết 1/2 trang giấy", false],
  ["2/9 trang", false],
  ["1/2 TRANG", false],
  // ...but the date word must be right before the fraction (spaces only)
  ["hôm qua 5/10", true],
  ["hôm nay con làm 3/4", true],
  ["thử 3/4", true],
  // 2. "điểm" / "diem" / "đ" next to a number
  ["con được 6 điểm", true],
  ["điểm 7", true],
  ["được 8 điểm", true],
  ["Điểm: 9", true],
  ["được 8 ĐIỂM", true],
  ["điểm là 9", true],
  ["Điểm 5/ nhé", true],
  ["8đ", true],
  ["8 đ", true],
  ["được 8Đ rồi", true],
  ["8 diem", true],
  ["diem 8", true],
  ["Diem: 9", true],
  // ...and those without a number, or "đ" that starts a word
  ["Điểm cao lắm", false],
  ["ĐIỂM", false],
  ["con được điểm tốt", false],
  ["Điểm mạnh của bài là ví dụ rõ", false],
  ["điểm cần chú ý", false],
  ["Điểm yếu là câu kết", false],
  ["diem", false],
  ["Lần 2 con viết rõ hơn", false],
  ["5 đã làm", false],
  ["mua 3 đồng hồ", false],
  ["đến 5 giờ", false],
  // 3. N trên M
  ["8 trên 10", true],
  ["được 3 trên 4", true],
  ["8 TRÊN 10", true],
  ["8 trên 10 điểm", true],
  ["9 trên 10", true],
  ["8 trên 11", false],
  ["trên 10 câu", false],
  ["8 trên cùng", false],
  // 4. percent sign after a number
  ["đúng 80% rồi", true],
  ["80 %", true],
  ["một phần trăm %", false],
  // 5. the rubric labels, any letter case
  ["Đạt yêu cầu", true],
  ["đạt yêu cầu rồi", true],
  ["ĐẠT YÊU CẦU", true],
  ["Con ở mức Chưa thể hiện", false],
  ["Còn thiếu nhiều ý", false],
  ["Được một phần", false],
  ["con làm được một phần", false],
  ["chưa thể hiện rõ ý chính", false],
  ["Vững, rõ ràng", true],
  ["vững rõ ràng", true],
  ["Con đạt  yêu cầu", true],
  ["Con đạt rồi", false],
  ["bài rõ ràng", false],
  ["yêu cầu của đề", false],
  // odd spaces become a normal space
  ["được 3 / 4", true],
  ["được 3 / 4", true],
  ["hôm 5/10", false],
  ["hôm　5/10", false],
  ["1/2 trang", false],
  ["8 trên 10", true],
  ["Đạt yêu　cầu", true],
  ["8 đ", true],
  // other text
  ["Con dùng “because” đúng chỗ", false],
  ["Câu mở đoạn rõ ràng, có ví dụ", false],
  ["Thêm một câu kết cho đoạn văn", false],
  ["như hôm 22/10", false],
  ["22/10", false],
] as const;
