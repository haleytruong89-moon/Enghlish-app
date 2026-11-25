/**
 * E0 (21/11): what the child sees above a question of a Studio test = the lead of ITS OWN part only (name, instruction, word bank as
 * chips), never every part's instructions run together. The parts come from eng_my_task_parts (migration 0038: the approved draft's
 * parts + which questions each holds); before that is applied the screen falls back to the task text (promptParts.ts). Pure.
 *
 * Careful by design: the instruction text is never rewritten (line breaks kept, nothing inside it dropped). Only a title that just
 * repeats the instruction is left out, and only lists that clearly are word banks become chips.
 */
import { z } from "zod";

export type TaskPart = { key: string; name: string; instructions: string; items: string[] };
export type WordBank = { label: string; words: string[] };
export type PartLead = { title: string | null; text: string; banks: WordBank[] };

/** Labels that announce a word list. Anything else is a bank only when its line speaks of a box / list / given words. */
const BANK_LABELS = new Set([
  "box", "box a", "box b", "box c", "word box", "word bank", "words", "word list", "places", "adjectives", "adverbs", "verbs", "nouns", "phrases", "phrasal verbs",
  "prepositions", "idioms", "từ gợi ý", "từ cho sẵn", "các từ",
]);
/** Labels that are never a bank, whatever follows ("Note: …", "Example: big, bigger, biggest"). */
const NOT_BANKS = new Set(["note", "notes", "example", "examples", "e.g", "remember", "time", "write", "options", "answer", "answers", "tip", "hint"]);
const MENTIONS_LIST = /\b(box|list|words? (given|below|from|in))\b|từ cho sẵn|trong khung/i;
/** A label (1–3 words, first letter capital, any script) right after the start of the line or the end of a sentence, then ": items". */
const LABEL = /(?:^|(?<=[.!?:])\s+)(\p{Lu}[\p{L}'-]*(?: [\p{L}'-]+){0,2}):\s*/gu;
/** Item separators: middle dot, comma, bar, semicolon, or a slash / dash with spaces around it ("and/or" stays one word). */
const SEP = /\s*[·,|;]\s*|\s+[/–-]\s+/;

function bankOf(label: string, rest: string, before: string): WordBank | null {
  const l = label.toLowerCase();
  if (NOT_BANKS.has(l)) return null;
  if (!BANK_LABELS.has(l) && !MENTIONS_LIST.test(before)) return null;
  const words = rest.replace(/[.;]\s*$/, "").split(SEP).map((w) => w.trim()).filter(Boolean);
  if (words.length < 2) return null;
  if (words.some((w) => w.length > 30 || w.split(/\s+/).length > 4 || /[.!?:]/.test(w))) return null;
  return { label, words };
}

/** Word lists at the end of a line ("… gap. Box: a · b · c", "Places: museum, art gallery, zoo") come out as chips; the rest is kept as is. */
export function splitBanks(text: string): { text: string; banks: WordBank[] } {
  const banks: WordBank[] = [];
  const lines = text.split("\n").map((line) => {
    // Every candidate label on the line, the last accepted one wins ("Directions: Use the words in the box. Box: a · b · c").
    let cut: { at: number; bank: WordBank } | null = null;
    for (const m of line.matchAll(LABEL)) {
      const at = m.index ?? 0;
      const bank = bankOf(m[1]!, line.slice(at + m[0].length), line.slice(0, at));
      if (bank) cut = { at, bank };
    }
    if (!cut) {
      // 26/11: a list in brackets closing a line that speaks of a box / given words ("… the words in the box. (demanding, few, funny)")
      // is a word bank too — the Destination U15 test hid its words this way and the child did not use them.
      const paren = /\s*\(([^()]+)\)\s*\.?\s*$/.exec(line);
      const before = paren ? line.slice(0, paren.index) : "";
      const cand = paren && MENTIONS_LIST.test(before) ? bankOf("Box", paren[1]!, before) : null;
      // Only a real list of words: ≥ 3 items of 1–2 words, no digits, no option letters ("A, B or C"), no note ("one word is extra").
      const bank = cand && cand.words.length >= 3 && cand.words.every((w) => w.split(/\s+/).length <= 2 && !/\d/.test(w) && !/^\p{Lu}$/u.test(w)) ? cand : null;
      if (!paren || !bank) return line;
      banks.push(bank);
      return before.trimEnd();
    }
    banks.push(cut.bank);
    return line.slice(0, cut.at).trimEnd();
  });
  return { text: lines.map((l) => l.trimEnd()).join("\n").trim(), banks };
}

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** The lead of one part: the instruction as written, the title only when it adds something, word banks apart. */
export function leadOf(part: TaskPart): PartLead {
  const split = splitBanks(part.instructions.trim());
  // A whole line written twice in a row (≥ 4 words) shows once; nothing else inside the instruction is touched.
  const lines: string[] = [];
  for (const l of split.text.split("\n")) {
    const prev = lines[lines.length - 1];
    if (prev !== undefined && words(l) >= 4 && norm(prev) === norm(l)) continue;
    lines.push(l);
  }
  let text = lines.join("\n").trim();
  const name = part.name.trim();
  // "A · Places" → "Places" only when the prefix is this part's key (a code such as "TV:" stays).
  const keyPrefix = new RegExp(`^\\s*${part.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[·.):-]\\s+`);
  const titleNorm = norm(name.replace(keyPrefix, ""));
  const bare = titleNorm === "" || norm(name) === norm(part.key);
  const repeats = titleNorm !== "" && (norm(text).startsWith(titleNorm) || split.banks.some((b) => norm(b.label) === titleNorm));
  let title: string | null = bare || repeats ? null : name;
  // The instruction written in the name and nothing else: show it as the instruction, not as a small grey title.
  if (!text && title) {
    text = title;
    title = null;
  }
  return { title, text, banks: split.banks };
}

export function partForItem(parts: readonly TaskPart[], itemId: string): TaskPart | null {
  return parts.find((p) => p.items.includes(itemId)) ?? null;
}

/** Text with Vietnamese letters is read with the Vietnamese voice (VoiceOver); English exercise text with the English one. */
export const langOf = (s: string): "vi" | "en" => (/[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i.test(s) ? "vi" : "en");

const rowSchema = z.object({ key: z.string(), name: z.string(), instructions: z.string(), items: z.array(z.string()) });

/** eng_my_task_parts → parts, or null (missing function, not a Studio test, or anything unexpected: the screen uses the task text). */
export function taskPartsFromRaw(raw: unknown): TaskPart[] | null {
  const r = z.array(rowSchema).min(1).safeParse(raw);
  return r.success ? r.data.map((p) => ({ key: p.key, name: p.name, instructions: p.instructions, items: p.items })) : null;
}
