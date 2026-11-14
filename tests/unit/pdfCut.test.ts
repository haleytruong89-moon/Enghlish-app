import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { cutPdf, pdfInfo } from "@/lib/pdf/cut";

async function makePdf(n: number): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) doc.addPage().drawText(`page ${i}`, { x: 40, y: 700, font, size: 18 });
  return new Blob([new Uint8Array(await doc.save())], { type: "application/pdf" });
}
const sha = async (f: Blob) => createHash("sha256").update(Buffer.from(await f.arrayBuffer())).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("pdfInfo / cutPdf", () => {
  it("counts the pages and cuts the wanted ones", async () => {
    const src = await makePdf(10);
    expect(await pdfInfo(src)).toEqual({ ok: true, pageCount: 10 });
    const cut = await cutPdf(src, [1, 2, 3], "x.pdf");
    expect(cut.name).toBe("x.pdf");
    expect(cut.type).toBe("application/pdf");
    expect(await pdfInfo(cut)).toEqual({ ok: true, pageCount: 3 });
  });

  it("cutting the same pages twice, a second apart, gives the same bytes (so the duplicate check by hash keeps working)", async () => {
    const src = await makePdf(10);
    const a = await cutPdf(src, [0, 4, 5], "a.pdf");
    await sleep(1100);
    const b = await cutPdf(src, [0, 4, 5], "b.pdf");
    expect(await sha(a)).toBe(await sha(b));
  });

  it("a file that is not a PDF is 'unreadable'", async () => {
    expect(await pdfInfo(new Blob([new Uint8Array([1, 2, 3, 4])]))).toEqual({ ok: false, reason: "unreadable" });
  });

  it("a password-protected PDF is 'encrypted' (skipped when the fixture file is missing)", async () => {
    let bytes: Uint8Array;
    try {
      const { readFileSync } = await import("node:fs");
      bytes = readFileSync("tests/fixtures/pdf/encrypted.pdf");
    } catch {
      return; // no qpdf on this machine to make the fixture
    }
    expect(await pdfInfo(new Blob([new Uint8Array(bytes)]))).toEqual({ ok: false, reason: "encrypted" });
  });
});
