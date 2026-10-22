/** Plain-language text for the level screens (spec §1 "Cách gọi": "đang học B1", never "đạt"). Pure; every word from lib/copy/vi.ts. */
import { levelCopy, studentReviewCopy } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { formatDateVi } from "@/lib/inquiries/format";
import { stepIndex } from "./scale";
import { RECENT_MAX, REVIEW_MAX, type DomainLevel, type LevelProfile, type RecentChange, type ReviewItem, type Scale } from "./types";

export function levelText(scale: Scale, level: string): string {
  return levelCopy.levelName(scale, level);
}

/** "Nguyên đang học từ B1+ đến B2+, tuỳ mảng. Thầy/cô đã xác nhận 2/7 mảng." (conclusion first, UX guide §4.1). */
export function profileSummary(alias: string, p: LevelProfile): string {
  const cefr = p.domains
    .filter((d) => d.scale === "cefr" && stepIndex("cefr", d.current) !== null)
    .map((d) => d.current)
    .sort((a, b) => (stepIndex("cefr", a) ?? 0) - (stepIndex("cefr", b) ?? 0));
  const confirmed = p.domains.filter((d) => d.status === "confirmed").length;
  const range = cefr.length > 0 ? levelCopy.summaryRange(alias, cefr[0]!, cefr[cefr.length - 1]!) : "";
  const conf = confirmed === 0 ? levelCopy.summaryNoneConfirmed(alias) : levelCopy.summaryConfirmed(confirmed, p.domains.length);
  return [range, conf].filter(Boolean).join(" ");
}

export function domainSentence(alias: string, d: DomainLevel): string {
  const lv = levelText(d.scale, d.current);
  return d.status === "confirmed" ? levelCopy.sentenceConfirmed(alias, d.name, lv) : levelCopy.sentenceAssumed(alias, d.name, lv);
}

/** "Đọc, Nghe · B2+" (domains tied on the same level). */
export function boxValue(list: DomainLevel[]): string {
  const first = list[0];
  return first ? levelCopy.boxLine(list.map((d) => d.name).join(", "), levelText(first.scale, first.current)) : levelCopy.even;
}

/** D12: at most 3 labels, grouped under their domain in the order they come; a label without a domain goes under "Khác". */
export function groupReview(items: ReviewItem[]): { name: string; labels: string[] }[] {
  const out: { name: string; labels: string[] }[] = [];
  for (const it of items.slice(0, REVIEW_MAX)) {
    const name = it.domainName ?? studentReviewCopy.otherDomain;
    const g = out.find((x) => x.name === name);
    if (g) g.labels.push(it.label);
    else out.push({ name, labels: [it.label] });
  }
  return out;
}

/** "2026-10-01" → "10/2026". */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  return m ? `${m[2]}/${m[1]}` : month;
}

/** A timestamp → its calendar day in Vietnam, "22/10/2026". */
export function dayLabel(ts: string): string {
  return formatDateVi(todayVn(new Date(ts)));
}

/**
 * D11 + S2: the changes of every child for the parent home, at most RECENT_MAX lines. Adjustments and level-ups come first (newest
 * first), then baselines (newest first); two or more baselines one tutor saved for one child on the same day collapse into one line
 * (`collapsed` = how many), so confirming 7 domains cannot push an adjustment out. null when no child could be read (never a false "no change").
 */
export function mergeRecentChanges(per: (RecentChange[] | null)[]): RecentChange[] | null {
  if (per.length > 0 && per.every((x) => x === null)) return null;
  const newestFirst = (a: RecentChange, b: RecentChange) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt);
  const all = per.flatMap((x) => x ?? []).sort(newestFirst);
  const decisions = all.filter((c) => c.kind !== "baseline");
  const groups = new Map<string, RecentChange[]>();
  for (const c of all.filter((x) => x.kind === "baseline")) {
    const key = [c.learnerId, c.decidedBy ?? "", dayLabel(c.decidedAt)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const baselines = [...groups.values()].map((g) => (g.length > 1 ? { ...g[0]!, collapsed: g.length } : g[0]!)).sort(newestFirst);
  return [...decisions, ...baselines].slice(0, RECENT_MAX);
}
