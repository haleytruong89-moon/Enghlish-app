import { describe, expect, it } from "vitest";
import { aiExtractSchema, EMPTY_DRAFT, studioDraftSchema, STUDIO_LIMITS } from "@/lib/studio/schema";
import { FAKE_EXTRACT } from "./fixtures/studio";

describe("studioDraftSchema (spec §4.4)", () => {
  it("parses the fixture shape and the empty draft; strict: unknown keys are refused", () => {
    const raw = FAKE_EXTRACT as { parts: unknown[]; passages: unknown[]; items: unknown[] };
    expect(studioDraftSchema.safeParse({ parts: raw.parts, passages: raw.passages, items: raw.items }).success).toBe(true);
    expect(studioDraftSchema.parse(EMPTY_DRAFT)).toEqual({ parts: [], passages: [], items: [] });
    const item = { ...(raw.items[0] as object), tag_confidence: "high" };
    expect(studioDraftSchema.safeParse({ parts: raw.parts, passages: raw.passages, items: [item] }).success).toBe(false);
  });

  it("limits: item numbers 1..300, at most 8 options with letters A-H, kinds of the app only", () => {
    const raw = FAKE_EXTRACT as { parts: unknown[]; passages: unknown[]; items: Record<string, unknown>[] };
    const one = (patch: Record<string, unknown>) => studioDraftSchema.safeParse({ parts: raw.parts, passages: raw.passages, items: [{ ...raw.items[0], ...patch }] }).success;
    expect(one({ n: 0 })).toBe(false);
    expect(one({ n: STUDIO_LIMITS.items + 1 })).toBe(false);
    expect(one({ kind: "wordform" })).toBe(false);
    expect(one({ options: [{ letter: "Z", text: "x" }] })).toBe(false);
    expect(one({ explanation_vi: "x".repeat(STUDIO_LIMITS.explanation + 1) })).toBe(false);
  });

  it("aiExtractSchema is lenient: drops unknown keys, accepts the spike's kind names, fills missing arrays", () => {
    const r = aiExtractSchema.parse({
      title: "T",
      parts: [{ key: "A", name: "A", instructions: "" }],
      items: [{ n: 1, part: "A", kind: "wordform", stem: "x (HAPPY)", key: "happiness", tag_confidence: "low", extra: 1 }],
    });
    expect(r.passages).toEqual([]);
    expect(r.items[0]).toMatchObject({ n: 1, kind: "wordform", options: [], accepted: [] });
    expect("extra" in (r.items[0] as object)).toBe(false);
  });
});
