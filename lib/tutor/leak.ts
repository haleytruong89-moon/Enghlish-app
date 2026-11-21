/**
 * E1 · L1 / G1–G3: does a hint give the answer away? Pure; runs on EVERY text the child could see, before the Haiku check
 * (BO_TEST_GIA_SU_TIENG_ANH v0.1 §1 "Cách code kiểm G1–G3"). A false alarm costs one rewrite or the safe sentence, never a leak:
 * when in doubt, flag. Rules are fixed by the parent: a flag that turns out wrong on reading is fixed HERE, never by loosening the rule.
 */
export type LeakItem = {
  kind: string;
  stem: string;
  /** "A. temple" … for a choice question. */
  options: readonly string[];
  /** Every accepted answer (choice: the letter). */
  answers: readonly string[];
};
export type LeakReason = "answer" | "answer_part" | "answer_letter" | "answer_phrase" | "answer_affix" | "answer_next_to_blank";

/** Lower case, NFC, curly quotes straight, hyphens and runs of spaces as one space. */
export function normText(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‘’‛`]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[‐-―-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// Apostrophes are not word characters here: "'I had studied'" in quotes must still match; "I'd" keeps its letters on both sides.
const WORD = "\\p{L}\\p{N}";
const has = (text: string, phrase: string) => phrase !== "" && new RegExp(`(?<![${WORD}])${esc(phrase)}(?![${WORD}])`, "u").test(text);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const letters = (s: string) => s.replace(/[^\p{L}]/gu, "").length;
const words = (s: string) => normText(s).split(" ").filter(Boolean);
const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "at", "is", "are", "was", "be", "and", "or", "it", "i", "you", "he", "she", "we", "they"]);

/** The text of the correct option of a choice question ("B. museum" → "museum"); null when the key is not a listed letter. */
function correctOption(it: LeakItem): string | null {
  const letter = it.answers[0]?.trim().toUpperCase();
  const o = it.options.find((x) => x.trim().toUpperCase().startsWith(`${letter}.`));
  return o ? o.trim().slice(2).trim() : null;
}

/** The words just before and after the blank ("My house is ____ front of" → is / front); none when the stem has no blank. */
function blankNeighbours(stem: string): string[] {
  const m = /([\p{L}']+)?[\s(]*_{2,}[\s)]*([\p{L}']+)?/u.exec(stem.normalize("NFC"));
  return m ? [m[1], m[2]].filter((x): x is string => !!x).map((x) => x.toLowerCase()) : [];
}

/** The word in capitals the child must change ("(DEPEND)" → "depend"), for word-formation questions. */
function rootWord(stem: string): string | null {
  const m = /\b([A-Z]{3,})\b/.exec(stem);
  return m ? m[1]!.toLowerCase() : null;
}

export function leakReasons(text: string, it: LeakItem): LeakReason[] {
  const t = normText(text);
  const stem = normText(it.stem);
  const out = new Set<LeakReason>();
  const isChoice = it.kind === "mcq" || it.options.length > 0;

  // G3: the letter of the right choice named as the answer ("đáp án B", "đáp án đúng là B", "(B)", "the answer is B", "B is correct").
  // Matched on a copy where only a lone capital A–H keeps its case, so the article "a" ("answer with a verb") is never a letter.
  if (isChoice) {
    const letter = it.answers[0]?.trim().toUpperCase();
    if (letter && /^[A-H]$/.test(letter)) {
      const tc = text.normalize("NFC").replace(/[‘’‛`]/g, "'").replace(/\s+/g, " ").replace(/\p{L}+/gu, (w) => (/^[A-H]$/.test(w) ? w : w.toLowerCase()));
      const L = `\\(?${letter}\\)?(?![\\p{L}\\p{N}])`;
      // Cue, up to two words ("đáp án đúng là", "the right answer is"), then the letter.
      const cue = `(?:đáp án|chọn|câu|option|answer|letter|choice|pick|it's|it is|là)(?:\\s+[\\p{L}']+){0,2}?\\s*[:-]?\\s*${L}`;
      // The letter first, then a verdict ("B đúng", "B is correct / right", "B nhé").
      const after = `(?<![\\p{L}\\p{N}])${letter}\\)?\\s+(?:là\\s+)?(?:đúng|chính xác|is (?:the )?(?:correct|right)|is the answer|nhé)`;
      if (new RegExp(cue, "u").test(tc) || new RegExp(after, "u").test(tc) || new RegExp(`\\(${letter}\\)`, "u").test(tc)) out.add("answer_letter");
    }
  }
  const answers = isChoice ? [correctOption(it)].filter((x): x is string => !!x) : [...it.answers];

  for (const raw of answers) {
    const a = normText(raw);
    if (!a) continue;
    const aw = words(a);
    if (letters(a) >= 4 || aw.length > 1) {
      // G1: the answer itself (word boundaries, any case, hyphen = space).
      if (has(t, a)) out.add("answer");
    } else {
      // Short answer (in, at, has…): only next to a word that sits by the blank ("in front", "good at"), or by a stem word when there is no blank.
      const near = blankNeighbours(it.stem);
      const around = near.length > 0 ? near : words(it.stem).filter((w) => w.length >= 3 && !STOP.has(w));
      for (const n of around) if (has(t, `${a} ${n}`) || has(t, `${n} ${a}`)) out.add("answer_next_to_blank");
    }
    // G2: a word of a short multi-word answer that the question does not already show ("art" of "art gallery"). Sentence transformations
    // use the three-word rule below instead (BO_TEST §1): a single word such as "had" is part of the method, not the answer.
    if (aw.length > 1 && aw.length <= 3 && it.kind !== "transform") {
      for (const w of aw) if (letters(w) >= 3 && !STOP.has(w) && !has(stem, w) && has(t, w)) out.add("answer_part");
    }
    // Transformations: any three words in a row of the answer that the question does not show ("had studied harder").
    if (aw.length >= 3) {
      for (let i = 0; i + 3 <= aw.length; i++) {
        const tri = aw.slice(i, i + 3).join(" ");
        if (!has(stem, tri) && has(t, tri)) out.add("answer_phrase");
      }
    }
    // G2 for word formation: the affix glued to the root ("in + dependent", "in-dependent", "independ…").
    const root = it.kind === "word_form" ? rootWord(it.stem) : null;
    if (root && aw.length === 1 && a !== root) {
      const glued = text.normalize("NFC").toLowerCase().replace(/\s*\+\s*/g, "").replace(/(\p{L})[-‐–](\p{L})/gu, "$1$2");
      const at = a.indexOf(root);
      const stub = at > 0 ? a.slice(0, at + root.length) : a.slice(0, Math.max(root.length + 1, a.length - 3));
      if (new RegExp(`(?<![${WORD}])${esc(stub)}`, "u").test(glued)) out.add("answer_affix");
    }
  }
  return [...out];
}
