/**
 * E0 (21/11): what the child sees above a question of a Studio test = the lead of ITS OWN part only (name, instruction, word bank as
 * chips), never every part's instructions run together. The parts come from eng_my_task_parts (migration 0038: the approved draft's
 * parts + which questions each holds); before that is applied the screen falls back to the task text (promptParts.ts). Pure.
 */
import { z } from "zod";

export type TaskPart = { key: string; name: string; instructions: string; items: string[] };
export type WordBank = { label: string; words: string[] };
export type PartLead = { title: string | null; text: string; banks: WordBank[] };

/** Labels that announce a word list even with two words ("Box: debt · share"). Any other label needs three or more short items. */
const BOX_LABELS = new Set(["box", "word bank", "words", "word box"]);
const BANK = /(?:^|(?<=[.!?:])\s+)([A-Z][A-Za-z]*(?: [a-z]+)?):\s*(\S.*)$/;
const SEP = /\s*[·,|/]\s*/;

function bankOf(label: string, rest: string): WordBank | null {
  const words = rest.split(SEP).map((w) => w.trim()).filter(Boolean);
  const min = BOX_LABELS.has(label.toLowerCase()) ? 2 : 3;
  if (words.length < min) return null;
  if (words.some((w) => w.length > 30 || w.split(/\s+/).length > 4 || /[.!?;]$/.test(w))) return null;
  return { label, words };
}

/** Word lists at the end of a line ("… gap. Box: a · b · c", "Places: museum, art gallery, zoo") come out as chips. */
export function splitBanks(text: string): { text: string; banks: WordBank[] } {
  const banks: WordBank[] = [];
  const lines = text.split("\n").map((line) => {
    const m = BANK.exec(line);
    const bank = m ? bankOf(m[1]!, m[2]!) : null;
    if (!m || !bank) return line;
    banks.push(bank);
    return line.slice(0, m.index).trim();
  });
  return { text: lines.map((l) => l.trim()).filter(Boolean).join("\n"), banks };
}

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
/** "A · Places" → "Places"; "B) Adjectives" → "Adjectives". */
const withoutKey = (name: string) => name.replace(/^\s*[A-Z0-9]{1,3}\s*[·.):-]\s+/, "").trim();

/** The lead of one part: the title only when it says something the instruction does not; each sentence once; word banks apart. */
export function leadOf(part: TaskPart): PartLead {
  const { text, banks } = splitBanks(part.instructions.trim());
  const sentences: string[] = [];
  for (const s of text.split(/(?<=[.!?:])\s+|\n+/).map((x) => x.trim()).filter(Boolean)) {
    if (!sentences.some((x) => norm(x) === norm(s))) sentences.push(s);
  }
  const name = part.name.trim();
  const titleNorm = norm(withoutKey(name));
  const bare = name === part.key || titleNorm === "" || norm(name) === norm(part.key);
  const repeated = sentences.some((s) => norm(s) === titleNorm) || norm(sentences.join(" ")) === titleNorm;
  return { title: bare || repeated ? null : name, text: sentences.join(" "), banks };
}

export function partForItem(parts: readonly TaskPart[], itemId: string): TaskPart | null {
  return parts.find((p) => p.items.includes(itemId)) ?? null;
}

const rowSchema = z.object({ key: z.string(), name: z.string(), instructions: z.string(), items: z.array(z.string()) });

/** eng_my_task_parts → parts, or null (missing function, not a Studio test, or anything unexpected: the screen uses the task text). */
export function taskPartsFromRaw(raw: unknown): TaskPart[] | null {
  const r = z.array(rowSchema).min(1).safeParse(raw);
  return r.success ? r.data.map((p) => ({ key: p.key, name: p.name, instructions: p.instructions, items: p.items })) : null;
}
