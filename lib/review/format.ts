import { fallbackLabels, skillNames, weekdayNames } from "@/lib/copy/vi";

const VN_OFFSET_MS = 7 * 3_600_000;

/** "Thứ Hai 16/11, 14:35" for a timestamp, in Asia/Ho_Chi_Minh (UX guide §4.7: no ISO dates). Unparseable → as given. */
export function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t + VN_OFFSET_MS);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${weekdayNames[d.getUTCDay()]} ${dd}/${mm}, ${hh}:${mi}`;
}

/** Skill name for staff: UX guide §3.4 when it has one, else the catalogue's Vietnamese title, else a neutral word (never the code). */
export function skillLabel(key: string, titleVi: string | null): string {
  return skillNames[key]?.staff ?? titleVi ?? fallbackLabels.skill;
}

/** "Thứ Bảy 17/10" for a calendar date "YYYY-MM-DD" (no time zone involved). */
export function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${weekdayNames[d.getUTCDay()]} ${m[3]}/${m[2]}`;
}
