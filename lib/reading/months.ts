/** "YYYY-MM" minus n months (calendar arithmetic, no time zones involved). */
export function monthsBack(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) - n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
