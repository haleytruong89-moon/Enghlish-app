import { describe, expect, it } from "vitest";
import { TOC_MAX_TOKENS } from "@/lib/curriculum/tocTool";
import { READ_MAX_TOKENS } from "@/lib/import/readTool";
import { EXTRACT_MAX_TOKENS } from "@/lib/studio/extractTool";
import { AI_BASIS, checkPages } from "@/lib/pdf/limits";

describe("limits follow the code", () => {
  it("the token caps used to derive the page limits are the real ones", () => {
    expect(AI_BASIS.studioMaxTokens).toBe(EXTRACT_MAX_TOKENS);
    expect(AI_BASIS.readMaxTokens).toBe(READ_MAX_TOKENS);
    expect(AI_BASIS.tocMaxTokens).toBe(TOC_MAX_TOKENS);
  });
});

describe("checkPages", () => {
  const lvl = (...a: Parameters<typeof checkPages>) => checkPages(...a).level;
  it("Studio: up to 6 + 3 is fine; longer warns; far too long is blocked", () => {
    expect(lvl("studio", 6, 3)).toBe("ok");
    expect(lvl("studio", 7, 2)).toBe("warn");
    expect(lvl("studio", 6, 4)).toBe("warn");
    expect(lvl("studio", 10, 2)).toBe("warn");
    expect(lvl("studio", 11, 0)).toBe("block");
    expect(lvl("studio", 8, 5)).toBe("block");
  });
  it("Nạp bài: 8 pages of work is fine, 8 + 3 warns", () => {
    expect(lvl("import", 8, 2)).toBe("ok");
    expect(lvl("import", 8, 3)).toBe("warn");
    expect(lvl("import", 13, 0)).toBe("block");
    expect(lvl("import", 10, 6)).toBe("block");
  });
  it("Giáo trình: only the table of contents (1–4 pages)", () => {
    expect(lvl("toc", 4, 0)).toBe("ok");
    expect(lvl("toc", 5, 0)).toBe("warn");
    expect(lvl("toc", 9, 0)).toBe("block");
  });
  it("Giao bài PDF has no page limit", () => {
    expect(lvl("assignment", 500, 0)).toBe("ok");
  });
  it("the message key names the flow and the level", () => {
    expect(checkPages("studio", 11, 0).messageKey).toBe("studio_block");
  });
});
