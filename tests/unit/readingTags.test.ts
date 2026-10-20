import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";

type ReadingFile = { track: string; group_vi: string; tags: { key: string; label_vi: string }[] };
const read = (f: string) => JSON.parse(readFileSync(path.join(CONTENT_DIR, "tags", f), "utf8")) as ReadingFile;

describe("reading-skill tags (Studio 1A)", () => {
  it("Track B has the 14 TOMO skills in the report's order, bilingual labels", () => {
    const b = read("reading_B.json");
    expect(b.track).toBe("B");
    expect(b.group_vi).toBe("Kỹ năng đọc");
    expect(b.tags.map((t) => t.key)).toEqual([
      "doc-author-purpose", "doc-compare-contrast", "doc-cause-effect", "doc-sequence", "doc-conclusions", "doc-fact-opinion",
      "doc-main-idea", "doc-inference", "doc-prediction", "doc-summarize", "doc-evidence", "doc-antonyms", "doc-context-clues", "doc-synonyms",
    ]);
    for (const t of b.tags) expect(t.label_vi).toMatch(/^[A-Z][^—]+ — \S/);
  });

  it("Track A has the short set of 6, sharing keys and labels with Track B where they overlap", () => {
    const a = read("reading_A.json");
    const b = new Map(read("reading_B.json").tags.map((t) => [t.key, t.label_vi]));
    expect(a.track).toBe("A");
    expect(a.tags.map((t) => t.key)).toEqual(["doc-main-idea", "doc-details", "doc-inference", "doc-author-purpose", "doc-context-clues", "doc-sequence"]);
    for (const t of a.tags) if (b.has(t.key)) expect(t.label_vi).toBe(b.get(t.key));
  });

  it("keys match the error_tags key rule and never start with x- (custom tags)", () => {
    for (const f of ["reading_A.json", "reading_B.json"]) for (const t of read(f).tags) expect(t.key).toMatch(/^doc-[a-z0-9-]{2,57}$/);
  });
});
