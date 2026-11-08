import { describe, expect, it } from "vitest";
import { deskCopy, pendingCopy, shellCopy, tutorHonorific } from "@/lib/copy/vi";

const strings = (o: unknown): string[] =>
  typeof o === "string" ? [o] : typeof o === "function" ? [String((o as (...a: unknown[]) => unknown)(1, 2, 3))] : o && typeof o === "object" ? Object.values(o).flatMap(strings) : [];

describe("workdesk shell copy", () => {
  const all = [...strings(shellCopy), ...strings(pendingCopy), ...strings(deskCopy)];
  it("never hard-codes 'cô' / 'thầy' alone: the tutor is tutorHonorific", () => {
    for (const s of all) expect(s.replaceAll(tutorHonorific, ""), s).not.toMatch(/(^|[^\p{L}])(cô|thầy)([^\p{L}]|$)/iu);
  });
  it("no track code, no provider name", () => {
    for (const s of all) {
      expect(s, s).not.toMatch(/Track [AB]/);
      expect(s, s).not.toMatch(/Claude|Anthropic|OpenAI/);
    }
  });
});
