import { saveStatusCopy } from "@/lib/copy/vi";
import { formatHm } from "@/lib/work/view";

/** The one save-status pattern of the adult screens (pure part): "Đang lưu…" · "● Có thay đổi chưa lưu" · "✓ Đã lưu lúc hh:mm" (Vietnam time). */
export type SaveState = { phase: "idle" | "saving" | "saved" | "error"; savedAt: string | null; baseline: string; current: string };

/** JSON with sorted keys, so the same data always gives the same text whatever the order its keys were built in. */
export function snapshot(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object") {
      return Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, val]) => [k, norm(val)]));
    }
    return x;
  };
  return JSON.stringify(norm(v)) ?? "undefined";
}

export function isDirty(s: SaveState): boolean {
  return s.current !== s.baseline && s.phase !== "saving";
}

export function statusLine(s: SaveState): { text: string; tone: "muted" | "ok" | "warn" | "error" } | null {
  if (s.phase === "saving") return { text: saveStatusCopy.saving, tone: "muted" };
  if (s.phase === "error") return { text: saveStatusCopy.error, tone: "error" };
  if (isDirty(s)) return { text: saveStatusCopy.dirty, tone: "warn" };
  if (s.savedAt) {
    const hm = formatHm(s.savedAt);
    if (hm) return { text: saveStatusCopy.savedAt(hm), tone: "ok" };
  }
  return null;
}
