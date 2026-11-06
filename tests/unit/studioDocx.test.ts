import { describe, expect, it } from "vitest";
import { DocxError, docxToText } from "@/lib/studio/docx";
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
