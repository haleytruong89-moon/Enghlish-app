import { skillNames, weekdayNames } from "@/lib/copy/vi";

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

/** Skill name for staff: UX guide §3.4 when it has one, else the catalogue's Vietnamese title, else the code. */
export function skillLabel(key: string, titleVi: string | null): string {
  return skillNames[key]?.staff ?? titleVi ?? key;
}
