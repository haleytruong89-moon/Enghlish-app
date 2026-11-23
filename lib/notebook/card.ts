/**
 * E2a · the word card (spec §4.5 answer template + §5.1 parts). The model fills it through ONE tool; zod (strict: an `ipa` field or any
 * unknown field is refused, L3) then the code checks below run before the Haiku check. Pure.
 */
import { z } from "zod";

const line = (max: number) => z.string().trim().min(1).max(max);

export const cardContentSchema = z.strictObject({
  headword: line(40),
  forms: z.array(line(40)).min(1).max(12),
  pos: line(30),
  lemma_note: line(120).nullable(),
  senses: z.array(z.strictObject({ meaning_vi: line(120), meaning_en: line(160).nullable() })).min(1).max(3),
  guess: z.strictObject({
    q: line(240),
    options: z.tuple([line(160), line(160)]),
    right: z.union([z.literal(0), z.literal(1)]),
    yes: line(200),
    no: line(200),
  }),
  core: line(160),
  examples: z.array(z.strictObject({ en: line(160), vi: line(160) })).min(2).max(3),
  why: line(600),
  vn: line(300),
  trap: line(300),
  stress_tip: line(160),
  family: z.array(z.strictObject({ form: line(40), pos: line(20) })).max(5),
  collocations: z.array(line(60)).min(3).max(5),
  related: z.array(line(40)).min(3).max(5),
  checks: z
    .array(z.strictObject({ q: line(200), options: z.array(line(80)).min(2).max(4), right: z.number().int().min(0).max(3), note: line(200) }))
    .min(1)
    .max(3),
  task: line(200),
});
export type CardContent = z.infer<typeof cardContentSchema>;

export const cardToolOutputSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ok"), card: cardContentSchema }),
  z.strictObject({ status: z.literal("not_word"), suggestions: z.array(z.string()).max(5) }),
]);
export type CardToolOutput = z.infer<typeof cardToolOutputSchema>;

/** What the browser gets: the card + IPA built by code from ipa_lexicon + the sense the child's sentence points to. */
export type CardView = CardContent & { cardId: string; ipa: { uk: string | null; us: string | null }; sense: number | null };

/** Lines allowed for "Vì sao" per explanation language (track configuration, never the track id). */
export const WHY_MAX_LINES: Record<string, number> = { vi: 4, en_first: 5 };
const CHARS_PER_LINE = 110;

export const linesOf = (text: string): number =>
  text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.trim().length / CHARS_PER_LINE)), 0);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text: string, w: string) => new RegExp(`(^|[^a-z'])${esc(w.toLowerCase())}($|[^a-z'])`, "i").test(text.toLowerCase());

function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}

const VI_MARK = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
// "/…/" holding an IPA-only symbol: the model wrote a transcription (L3).
const IPA_LIKE = /\/[^/\n]*[ˈˌəɪʊʌɒɔæɑɜθðʃʒŋː][^/\n]*\//;

export type CardReason =
  | "example_missing_word"
  | "forms_missing_headword"
  | "check_right_out_of_range"
  | "options_not_distinct"
  | "has_url"
  | "has_ipa"
  | "too_many_lines"
  | "missing_vietnamese";

export function cardCodeReasons(card: CardContent, opts: { headword: string; language: string }): CardReason[] {
  const r = new Set<CardReason>();
  const head = card.headword.toLowerCase();
  const forms = new Set([head, opts.headword.toLowerCase(), ...card.forms.map((f) => f.toLowerCase()), ...card.family.map((f) => f.form.toLowerCase())]);
  for (const ex of card.examples) if (![...forms].some((f) => hasWord(ex.en, f))) r.add("example_missing_word");
  if (!card.forms.some((f) => f.toLowerCase() === head)) r.add("forms_missing_headword");
  const distinct = (xs: readonly string[]) => new Set(xs.map((x) => x.trim().toLowerCase())).size === xs.length;
  if (!distinct(card.guess.options)) r.add("options_not_distinct");
  for (const c of card.checks) {
    if (c.right >= c.options.length) r.add("check_right_out_of_range");
    if (!distinct(c.options)) r.add("options_not_distinct");
  }
  const strings = allStrings(card);
  if (strings.some((s) => /https?:|www\.|\.com\b/i.test(s))) r.add("has_url");
  if (strings.some((s) => IPA_LIKE.test(s))) r.add("has_ipa");
  if (linesOf(card.why) > (WHY_MAX_LINES[opts.language] ?? WHY_MAX_LINES.vi!)) r.add("too_many_lines");
  if (opts.language === "vi" && !card.senses.some((s) => VI_MARK.test(s.meaning_vi))) r.add("missing_vietnamese");
  return [...r];
}
