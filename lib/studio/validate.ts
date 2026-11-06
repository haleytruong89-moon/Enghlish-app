/**
 * Checks of a Studio draft (spec §5.4, §6; plan P2). Runs after the AI (to flag items) and again on "Duyệt" (blocking issues refuse it).
 * Blocking = the app would check an item wrongly, the paper frame could not be built, or a child could read a score-like text.
 * Not blocking = the AI asked for a second look (needs_review). Pure.
 */
import { resolveMcqAnswer } from "@/lib/config/inquiries";
import { hasScoreWords } from "@/lib/revision/scoreWords";
import { tagOf, type StudioContext } from "./context";
import { CLOSED_STUDIO_KINDS, type StudioDraft, type StudioItem } from "./schema";

export const ISSUE_CODES = [
  "numbering", "part_not_contiguous", "unknown_part", "no_app_items",
  "empty_stem", "missing_key", "mcq_options", "mcq_key", "options_not_mcq",
  "no_tag", "two_tags", "unknown_tag", "unknown_skill", "score_words", "unknown_passage",
  "ai_review",
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];
export type Issue = { n: number | null; code: IssueCode; blocking: boolean };

const isClosed = (i: StudioItem) => (CLOSED_STUDIO_KINDS as readonly string[]).includes(i.kind);
const optionStrings = (i: StudioItem) => i.options.map((o) => `${o.letter}. ${o.text}`);

export function validateDraft(d: StudioDraft, ctx: StudioContext): Issue[] {
  const out: Issue[] = [];
  const block = (n: number | null, code: IssueCode) => out.push({ n, code, blocking: true });
  const nums = d.items.map((i) => i.n).sort((a, b) => a - b);
  if (nums.length > 0 && (nums.some((v, k) => v !== k + 1) || new Set(nums).size !== nums.length)) block(null, "numbering");
  const partKeys = new Set(d.parts.map((p) => p.key));
  for (const p of d.parts) {
    const ns = d.items.filter((i) => i.part === p.key).map((i) => i.n);
    if (ns.length === 0) continue;
    const lo = Math.min(...ns);
    const hi = Math.max(...ns);
    if (d.items.some((i) => i.part !== p.key && i.n >= lo && i.n <= hi)) {
      block(null, "part_not_contiguous");
      break;
    }
  }
  if (!d.items.some((i) => !i.out_of_app)) block(null, "no_app_items");
  const passageRefs = new Set(d.passages.map((p) => p.ref));
  const skillIds = new Set(ctx.skills.map((s) => s.id));

  for (const i of [...d.items].sort((a, b) => a.n - b.n)) {
    if (!partKeys.has(i.part)) block(i.n, "unknown_part");
    // exactly one tag: reading skill (reading tags only) or a tag of the list (non-reading)
    if (i.tag_key === null && i.reading_skill_key === null) block(i.n, "no_tag");
    else if (i.tag_key !== null && i.reading_skill_key !== null) block(i.n, "two_tags");
    else if (i.tag_key !== null && !(tagOf(ctx, i.tag_key) && !tagOf(ctx, i.tag_key)?.reading)) block(i.n, "unknown_tag");
    else if (i.reading_skill_key !== null && !tagOf(ctx, i.reading_skill_key)?.reading) block(i.n, "unknown_tag");
    if (hasScoreWords(i.explanation_vi)) block(i.n, "score_words");
    if (i.passage_ref !== null && !passageRefs.has(i.passage_ref)) block(i.n, "unknown_passage");
    if (i.needs_review) out.push({ n: i.n, code: "ai_review", blocking: false });
    if (i.out_of_app) continue; // paper only: no key, no skill, not checked by the app
    if (!i.stem.trim()) block(i.n, "empty_stem");
    if (i.kind !== "mcq" && i.options.length > 0) block(i.n, "options_not_mcq");
    if (i.target_id !== null && !skillIds.has(i.target_id)) block(i.n, "unknown_skill");
    if (isClosed(i) && !(i.key ?? "").trim()) {
      block(i.n, "missing_key");
      continue;
    }
    if (i.kind === "mcq") {
      if (i.options.length < 2 || new Set(i.options.map((o) => o.letter)).size !== i.options.length) block(i.n, "mcq_options");
      else if (!/^[A-H]$/.test((i.key ?? "").trim()) || resolveMcqAnswer(optionStrings(i), (i.key ?? "").trim()) === null) block(i.n, "mcq_key");
    }
  }
  return out;
}

export const blockingIssues = (issues: Issue[]) => issues.filter((i) => i.blocking);
export const canApprove = (issues: Issue[]) => blockingIssues(issues).length === 0;
