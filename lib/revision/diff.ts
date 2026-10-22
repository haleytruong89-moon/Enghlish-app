/** Word-level before–after diff for the "Bài sửa lại" view (pure, unit-tested). Spaces never count as a change. */
export type DiffOp = "same" | "del" | "add";
export type DiffToken = { op: DiffOp; text: string };

/** Beyond this many cells (words × words) the diff stops and shows "all removed / all added", so a huge text cannot freeze the page. */
export const DIFF_MAX_CELLS = 4_000_000;

/** Words with the white space that follows them ("magma " / "rises.\n"); leading white space is its own token. */
function tokensOf(s: string): string[] {
  return s.match(/\s+|\S+\s*/g) ?? [];
}
const word = (t: string) => t.trim();

export function diffWords(before: string, after: string): DiffToken[] {
  const a = tokensOf(before);
  const b = tokensOf(after);
  const out: DiffToken[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  if (a.length * b.length > DIFF_MAX_CELLS) {
    if (before) push("del", before);
    if (after) push("add", after);
    return out;
  }
  // lcs[i][j] = longest common word run of a[i..] and b[j..]
  const lcs: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = word(a[i]!) === word(b[j]!) ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (word(a[i]!) === word(b[j]!)) {
      push("same", b[j]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push("del", a[i]!);
      i++;
    } else {
      push("add", b[j]!);
      j++;
    }
  }
  while (i < a.length) push("del", a[i++]!);
  while (j < b.length) push("add", b[j++]!);
  return out;
}

/** How many words were added / removed (for the one-line summary above the diff). */
export function changeCount(tokens: DiffToken[]): { added: number; removed: number } {
  const words = (s: string) => (s.match(/\S+/g) ?? []).length;
  return {
    added: tokens.filter((t) => t.op === "add").reduce((n, t) => n + words(t.text), 0),
    removed: tokens.filter((t) => t.op === "del").reduce((n, t) => n + words(t.text), 0),
  };
}
