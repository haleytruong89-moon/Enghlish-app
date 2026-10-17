/**
 * Test frames (S5b-1): "khung đề" = item number → part → tag, plus an optional scale. NO question text (copyright).
 * Pure helpers shared by the import script and the unit tests; the database re-checks everything (trigger
 * english.eng_check_test_frame), so this file only gives early, readable (Vietnamese) messages.
 */
import { z } from "zod";

const int = z.number().int();

export const frameFileSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  /** Track id the frame is for ("A" | "B"). Data, not logic. */
  track: z.string().trim().min(1).max(8),
  total: int.min(1).max(300),
  parts: z
    .array(
      z.strictObject({
        key: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(120),
        from: int.min(1),
        to: int.min(1),
      }),
    )
    .min(1)
    .max(30),
  items: z.array(z.strictObject({ n: int.min(1), part: z.string().trim().min(1).max(20), tag_key: z.string().trim().min(1).max(61) })).min(1).max(300),
  scale: z.array(z.strictObject({ min: int.min(0), max: int.min(0), label: z.string().trim().min(1).max(60) })).min(1).max(12).nullable().optional(),
  /** Free text for the file's reader (where the labels came from). Not stored. */
  note: z.string().max(1000).optional(),
});
export type FrameFile = z.infer<typeof frameFileSchema>;

export type FrameCheck = { ok: true; frame: FrameFile } | { ok: false; errors: string[] };

/**
 * Parse and check a frame. `knownTags` = the tag keys usable for the frame's track (seed tags + the family's own).
 * Reports every problem at once, in Vietnamese.
 */
export function checkFrame(raw: unknown, knownTags: ReadonlySet<string>): FrameCheck {
  const parsed = frameFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `File khung đề sai ở "${i.path.join(".") || "(gốc)"}": ${i.message}`) };
  }
  const f = parsed.data;
  const errors: string[] = [];

  if (f.items.length !== f.total) errors.push(`Khung nói có ${f.total} câu nhưng liệt kê ${f.items.length} câu.`);
  const seen = new Map<number, number>();
  for (const it of f.items) seen.set(it.n, (seen.get(it.n) ?? 0) + 1);
  const missing: number[] = [];
  for (let n = 1; n <= f.total; n++) if (!seen.has(n)) missing.push(n);
  const repeated = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);
  const outside = [...seen.keys()].filter((n) => n < 1 || n > f.total);
  if (missing.length) errors.push(`Thiếu câu số ${missing.join(", ")}.`);
  if (repeated.length) errors.push(`Câu số ${repeated.join(", ")} bị liệt kê hai lần.`);
  if (outside.length) errors.push(`Câu số ${outside.join(", ")} nằm ngoài 1–${f.total}.`);

  const partKeys = new Set<string>();
  for (const p of f.parts) {
    if (partKeys.has(p.key)) errors.push(`Phần "${p.key}" bị trùng.`);
    partKeys.add(p.key);
    if (p.from > p.to || p.to > f.total) errors.push(`Phần "${p.key}" có khoảng câu không hợp lệ (${p.from}–${p.to}).`);
  }
  for (let i = 0; i < f.parts.length; i++) {
    for (let j = i + 1; j < f.parts.length; j++) {
      const a = f.parts[i];
      const b = f.parts[j];
      if (a && b && a.from <= b.to && b.from <= a.to) errors.push(`Phần "${a.key}" và "${b.key}" chồng nhau.`);
    }
  }
  for (const it of f.items) {
    const p = f.parts.find((x) => x.key === it.part);
    if (!p) errors.push(`Câu ${it.n} thuộc phần "${it.part}" không có trong danh sách phần.`);
    else if (it.n < p.from || it.n > p.to) errors.push(`Câu ${it.n} nằm ngoài khoảng ${p.from}–${p.to} của phần "${p.key}".`);
  }
  const unknown = [...new Set(f.items.map((i) => i.tag_key).filter((k) => !knownTags.has(k)))];
  if (unknown.length) errors.push(`Nhãn chưa có cho track ${f.track}: ${unknown.join(", ")}.`);

  if (f.scale) {
    for (const b of f.scale) {
      if (b.min > b.max || b.max > f.total) errors.push(`Thang "${b.label}" có khoảng điểm không hợp lệ (${b.min}–${b.max}).`);
    }
    for (let i = 0; i < f.scale.length; i++) {
      for (let j = i + 1; j < f.scale.length; j++) {
        const a = f.scale[i];
        const b = f.scale[j];
        if (a && b && a.min <= b.max && b.min <= a.max) errors.push(`Thang "${a.label}" và "${b.label}" chồng nhau.`);
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, frame: f };
}

/** The same frame in a fixed shape (items by number), as stored. `note` is dropped. */
export function normalizeFrame(f: FrameFile) {
  return {
    title: f.title,
    total: f.total,
    parts: f.parts.map((p) => ({ key: p.key, name: p.name, from: p.from, to: p.to })),
    items: [...f.items].sort((a, b) => a.n - b.n).map((i) => ({ n: i.n, part: i.part, tag_key: i.tag_key })),
    scale: f.scale ? f.scale.map((b) => ({ min: b.min, max: b.max, label: b.label })) : null,
  };
}

/** Band of the frame's own scale for a number of right answers, or null. */
export function scaleBand(scale: readonly { min: number; max: number; label: string }[] | null | undefined, correct: number): string | null {
  return scale?.find((b) => correct >= b.min && correct <= b.max)?.label ?? null;
}
