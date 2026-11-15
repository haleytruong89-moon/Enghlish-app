import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareFile } from "@/lib/storage/clientUpload";

// What a grown-up's upload does to a photo or a PDF before it leaves the device: pictures are always drawn again (no GPS / camera details), PDFs lose their document details.
const redrawn = new Blob(["redrawn"], { type: "image/jpeg" });
const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(redrawn));

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn(), set fillStyle(_v: string) {} } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(toBlob as unknown as HTMLCanvasElement["toBlob"]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  toBlob.mockClear();
});

describe("prepareFile with stripMetadata", () => {
  it("a small JPEG is sent as it is by default, but is always drawn again when metadata must go", async () => {
    const jpeg = new File([new Uint8Array(1000)], "p.jpg", { type: "image/jpeg" });
    const plain = await prepareFile(jpeg);
    expect(plain.ok && plain.file.blob).toBe(jpeg);
    expect(toBlob).not.toHaveBeenCalled();
    const clean = await prepareFile(jpeg, "p", { stripMetadata: true });
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(clean.ok && clean.file.blob).toBe(redrawn);
  });
  it("WebP becomes JPEG and PNG stays PNG, both drawn again", async () => {
    const webp = await prepareFile(new File([new Uint8Array(10)], "p.webp", { type: "image/webp" }), "p", { stripMetadata: true });
    expect(webp.ok && webp.file.mime).toBe("image/jpeg");
    const png = await prepareFile(new File([new Uint8Array(10)], "p.png", { type: "image/png" }), "p", { stripMetadata: true });
    expect(png.ok && png.file.mime).toBe("image/png");
    expect(toBlob).toHaveBeenCalledTimes(2);
  });
});
