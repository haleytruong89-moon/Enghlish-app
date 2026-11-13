import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { overPageLimit } from "@/lib/storage/serverPages";

async function pdfOf(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage();
  return new Uint8Array(await doc.save());
}
const U = (c: string) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`;
const owner = { familyId: U("1"), learnerId: U("2") };
const [A, K, T, W] = [U("a"), U("b"), U("c"), U("d")];
const storageOf = (files: Record<string, Uint8Array>) => ({
  download: vi.fn(async (path: string) => {
    const hit = Object.entries(files).find(([id]) => path.includes(id));
    if (!hit) throw new Error("missing");
    return hit[1];
  }),
});
const pdf = (id: string) => ({ id, mime: "application/pdf" });
const docx = { id: W, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

describe("overPageLimit (server side)", () => {
  it("a short Studio test passes; an 11-page one is refused", async () => {
    expect(await overPageLimit({ storage: storageOf({ [A]: await pdfOf(5) }) }, owner, "studio", pdf(A), null)).toBeNull();
    expect(await overPageLimit({ storage: storageOf({ [A]: await pdfOf(11) }) }, owner, "studio", pdf(A), null)).toBe("pages_too_long");
  });
  it("an answer-key PDF counts even when the test is a Word file", async () => {
    const storage = storageOf({ [K]: await pdfOf(13) });
    expect(await overPageLimit({ storage }, owner, "studio", docx, pdf(K))).toBe("pages_too_long");
  });
  it("the total counts: 9 + 4 pages in Studio is over 12", async () => {
    const storage = storageOf({ [A]: await pdfOf(9), [K]: await pdfOf(4) });
    expect(await overPageLimit({ storage }, owner, "studio", pdf(A), pdf(K))).toBe("pages_too_long");
  });
  it("a Giáo trình TOC over 8 pages is refused", async () => {
    expect(await overPageLimit({ storage: storageOf({ [T]: await pdfOf(9) }) }, owner, "toc", pdf(T), null)).toBe("pages_too_long");
  });
  it("a file whose pages cannot be counted is allowed through and logged", async () => {
    const log = vi.fn(async () => undefined);
    const storage = { download: vi.fn(async () => new Uint8Array([1, 2, 3])) };
    expect(await overPageLimit({ storage, log }, owner, "studio", pdf(A), null)).toBeNull();
    expect(log).toHaveBeenCalledOnce();
  });
  it("a Word file alone has no page count and passes", async () => {
    expect(await overPageLimit({ storage: storageOf({}) }, owner, "studio", docx, null)).toBeNull();
  });
});
