import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPaperImage } from "@/lib/practice/image";

// A phone photo "orientation 6" is stored sideways and shown upright. The size the page reads (600 x 800 upright) and the resized bitmap must agree;
// a browser that resizes the SIDEWAYS pixels to the upright size would stretch the picture, so the plain open is used instead.
const redrawn = new Blob(["x"], { type: "image/jpeg" });
let closed: number[] = [];

beforeEach(() => {
  closed = [];
  vi.stubGlobal("Image", class {
    naturalWidth = 600;
    naturalHeight = 800;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) { queueMicrotask(() => this.onload?.()); }
  });
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(), set fillStyle(_v: string) {} } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(((cb: (b: Blob | null) => void) => cb(redrawn)) as unknown as HTMLCanvasElement["toBlob"]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const bitmap = (width: number, height: number, id: number) => ({ width, height, close: () => closed.push(id) });

describe("opening a photo that carries a turn (orientation 6)", () => {
  it("a resized bitmap of the wrong shape is closed and the picture is opened again without resizing", async () => {
    const calls: unknown[][] = [];
    vi.stubGlobal("createImageBitmap", vi.fn(async (...a: unknown[]) => {
      calls.push(a);
      const opts = a[1] as { resizeWidth?: number } | undefined;
      return opts?.resizeWidth ? bitmap(600, 450, 1) : bitmap(600, 800, 2); // resize path ignored the turn: sideways shape
    }));
    const r = await renderPaperImage(new Blob(["jpeg"]), 0, "p.jpg");
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]![1]).toMatchObject({ imageOrientation: "from-image", resizeWidth: 600, resizeHeight: 800 });
    expect((calls[1]![1] as Record<string, unknown>).resizeWidth).toBeUndefined();
    expect(closed).toContain(1); // the wrong one was released
  });
  it("a resized bitmap of the right shape is used as it is (one decode only)", async () => {
    const create = vi.fn(async () => bitmap(600, 800, 3));
    vi.stubGlobal("createImageBitmap", create);
    const r = await renderPaperImage(new Blob(["jpeg"]), 0, "p.jpg");
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
