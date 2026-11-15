import { describe, expect, it } from "vitest";
import { scrubPdf } from "@/lib/pdf/cut";

// What a grown-up's PDF loses before it leaves the device (and the child's, W4c1). Pictures INSIDE the PDF are not rewritten (documented residual risk).
describe("scrubPdf", () => {
  it("blanks title / author / subject / keywords / creator / producer and drops the XMP stream; the pages stay", async () => {
    const { PDFDocument, PDFName, PDFRawStream } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    doc.addPage([200, 200]);
    doc.setTitle("Bài của Nguyên");
    doc.setAuthor("Nguyễn Văn A");
    doc.setSubject("secret subject");
    doc.setKeywords(["k1", "k2"]);
    doc.setCreator("My Scanner");
    doc.setProducer("My Producer");
    const xmp = doc.context.register(PDFRawStream.of(doc.context.obj({ Type: "Metadata", Subtype: "XML" }), new TextEncoder().encode("<x:xmpmeta>owner</x:xmpmeta>")));
    doc.catalog.set(PDFName.of("Metadata"), xmp);
    const source = new Blob([new Uint8Array(await doc.save())], { type: "application/pdf" });

    const out = await scrubPdf(source);
    expect(out).not.toBeNull();
    const text = Buffer.from(await out!.arrayBuffer()).toString("latin1");
    for (const secret of ["Bài của Nguyên", "Nguy", "secret subject", "k1", "My Scanner", "My Producer", "owner", "xmpmeta"]) expect(text, secret).not.toContain(secret);
    const back = await PDFDocument.load(new Uint8Array(await out!.arrayBuffer()), { updateMetadata: false });
    expect(back.getPageCount()).toBe(2);
    expect(back.getTitle() ?? "").toBe("");
    expect(back.getAuthor() ?? "").toBe("");
    expect(back.getCreator() ?? "").toBe("");
    expect(back.getProducer() ?? "").toBe("");
    expect(back.catalog.get(PDFName.of("Metadata"))).toBeUndefined();
  });
  it("a file that is not a PDF gives null (nothing is sent)", async () => {
    expect(await scrubPdf(new Blob(["not a pdf"]))).toBeNull();
  });
});
