import { describe, expect, it } from "vitest";
import { PAPER_JPEG_QUALITY, PAPER_MAX_SIDE, paperKind, paperTargetSize } from "@/lib/practice/image";

describe("paper picture size", () => {
  it("keeps a small picture as it is and never enlarges", () => {
    expect(paperTargetSize(1200, 1600, 0)).toEqual({ width: 1200, height: 1600 });
    expect(paperTargetSize(100, 50, 0)).toEqual({ width: 100, height: 50 });
  });

  it("cuts the longest side to 2400 px and keeps the shape (an iPad photo 4032 x 3024)", () => {
    expect(PAPER_MAX_SIDE).toBe(2400);
    const s = paperTargetSize(4032, 3024, 0);
    expect(s).toEqual({ width: 2400, height: 1800 });
    expect(paperTargetSize(3024, 4032, 0)).toEqual({ width: 1800, height: 2400 });
  });

  it("a quarter turn swaps width and height, then fits", () => {
    expect(paperTargetSize(4032, 3024, 1)).toEqual({ width: 1800, height: 2400 });
    expect(paperTargetSize(4032, 3024, 3)).toEqual({ width: 1800, height: 2400 });
    expect(paperTargetSize(4032, 3024, 2)).toEqual({ width: 2400, height: 1800 });
    expect(paperTargetSize(1000, 500, 1)).toEqual({ width: 500, height: 1000 });
  });

  it("never gives a side of 0 for an extremely thin picture", () => {
    const s = paperTargetSize(10000, 3, 0);
    expect(s.width).toBe(2400);
    expect(s.height).toBeGreaterThanOrEqual(1);
  });

  it("encodes JPEG at 0.85", () => {
    expect(PAPER_JPEG_QUALITY).toBe(0.85);
  });

  it("tells pictures, HEIC, PDF and anything else apart (HEIC may come with no type at all)", () => {
    expect(paperKind("image/jpeg", "a.jpg")).toBe("image");
    expect(paperKind("image/png", "a.png")).toBe("image");
    expect(paperKind("image/heic", "IMG_1.HEIC")).toBe("heic");
    expect(paperKind("", "IMG_2.heif")).toBe("heic");
    expect(paperKind("application/pdf", "x.pdf")).toBe("pdf");
    expect(paperKind("", "x.txt")).toBe("other");
    expect(paperKind("image/gif", "x.gif")).toBe("other");
    expect(paperKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x.docx")).toBe("other");
  });
});
