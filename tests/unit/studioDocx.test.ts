import { describe, expect, it } from "vitest";
import { DocxError, declaredUnzippedBytes, docxToText, MAX_DOCX_TEXT, MAX_DOCX_UNZIPPED_BYTES } from "@/lib/studio/docx";
import { makeDocx } from "./fixtures/docx";

describe("docxToText (spec §5.2: .docx → text on the server)", () => {
  it("returns the paragraphs as plain text", async () => {
    const text = await docxToText(makeDocx(["1. I wish I ____ more time. (A) have (B) had", "Đáp án: 1B"]));
    expect(text).toContain("1. I wish I ____ more time. (A) have (B) had");
    expect(text).toContain("Đáp án: 1B");
  });
  it("refuses an empty document and a file that is not a .docx", async () => {
    await expect(docxToText(makeDocx([]))).rejects.toMatchObject({ code: "docx_empty" });
    await expect(docxToText(new TextEncoder().encode("not a zip"))).rejects.toBeInstanceOf(DocxError);
  });
});

describe("docxToText guards (no silent cut, zip-bomb guard)", () => {
  it("a text longer than the AI limit is refused, not cut", async () => {
    await expect(docxToText(makeDocx(["x".repeat(MAX_DOCX_TEXT + 1)]))).rejects.toMatchObject({ code: "docx_too_long" });
    await expect(docxToText(makeDocx(["x".repeat(1000)]))).resolves.toHaveLength(1000);
  });
  it("the declared unzipped size is read from the zip directory; over 20 MB is refused before mammoth runs", async () => {
    const small = makeDocx(["hello"]);
    expect(declaredUnzippedBytes(small)).toBeGreaterThan(100);
    expect(declaredUnzippedBytes(small)).toBeLessThan(MAX_DOCX_UNZIPPED_BYTES);
    const big = Buffer.from(small);
    const eocd = big.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cd = big.readUInt32LE(eocd + 16);
    big.writeUInt32LE(MAX_DOCX_UNZIPPED_BYTES + 1, cd + 24); // the first entry now claims to unpack to 20 MB + 1
    await expect(docxToText(big)).rejects.toMatchObject({ code: "docx_too_big" });
    expect(() => declaredUnzippedBytes(new TextEncoder().encode("not a zip at all, not even close"))).toThrow(DocxError);
  });
});
