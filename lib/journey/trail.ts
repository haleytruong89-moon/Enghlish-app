/**
 * Geometry of the mountain path (viewBox 400 × 780): a zig-zag trail from the foot to just under the summit, drawn as switchbacks.
 * Pure and deterministic (the SVG is static: no animation). Ported from the reference design, with the same numbers.
 */
export const MT_W = 400;
export const MT_H = 780;
export const MT_OY = 40;
export const SUMMIT_XY: readonly [number, number] = [200, 92 + MT_OY];

const LEGS: readonly (readonly [number, number])[] = [[340, 30], [62, 29], [330, 29], [80, 28], [312, 28], [104, 28], [280, 27], [140, 27], [228, 26]];

export type Pt = readonly [number, number];

function build(): { pts: Pt[]; len: number[]; total: number } {
  let x = 120;
  let y = 712;
  const pts: Pt[] = [[x, y]];
  for (const [lx, r] of LEGS) {
    const dir = lx > x ? 1 : -1;
    x = lx;
    y -= 10;
    pts.push([x, y]);
    for (let k = 1; k <= 16; k += 1) {
      const a = Math.PI / 2 - (k * Math.PI) / 16;
      pts.push([x + dir * r * Math.cos(a), y - r + r * Math.sin(a)]);
    }
    y -= 2 * r;
  }
  pts.push([204, 106]);
  const shifted = pts.map((q): Pt => [q[0], q[1] + MT_OY]);
  const len = [0];
  for (let i = 1; i < shifted.length; i += 1) len.push((len[i - 1] as number) + Math.hypot(shifted[i]![0] - shifted[i - 1]![0], shifted[i]![1] - shifted[i - 1]![1]));
  return { pts: shifted, len, total: len[len.length - 1] as number };
}

export const TRAIL = build();

/** The point at distance `s` along the trail (clamped to its ends). */
export function pointAt(s: number): Pt {
  const { pts, len } = TRAIL;
  if (s <= 0) return pts[0] as Pt;
  if (s >= TRAIL.total) return pts[pts.length - 1] as Pt;
  let i = 1;
  while (i < len.length - 1 && (len[i] as number) < s) i += 1;
  const t = (s - (len[i - 1] as number)) / (((len[i] as number) - (len[i - 1] as number)) || 1);
  const a = pts[i - 1] as Pt;
  const b = pts[i] as Pt;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** SVG path `d` of the trail between distances a and b. */
export function pathBetween(a: number, b: number): string {
  const { pts, len } = TRAIL;
  const out: Pt[] = [pointAt(a)];
  for (let i = 0; i < pts.length; i += 1) if ((len[i] as number) > a && (len[i] as number) < b) out.push(pts[i] as Pt);
  out.push(pointAt(b));
  return out.map((q, k) => `${k ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join("");
}

/** Distances of `n` items spread evenly along the trail, leaving a gap before the first and after the last. */
export function spread(n: number): number[] {
  const step = TRAIL.total / (n + 1);
  return Array.from({ length: n }, (_, k) => step * (k + 1));
}
