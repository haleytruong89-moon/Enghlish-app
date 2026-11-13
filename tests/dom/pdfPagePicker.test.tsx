import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PageGuidance, PdfPagePicker, pagesBlock, type PdfPick } from "@/components/ui/PdfPagePicker";
import { pdfPickCopy } from "@/lib/copy/vi";
import { KEY_RECOMMEND, PAGE_LIMITS } from "@/lib/pdf/limits";

const pdfInfo = vi.fn();
const cutPdf = vi.fn();
vi.mock("@/lib/pdf/cut", () => ({ pdfInfo: (...a: unknown[]) => pdfInfo(...a), cutPdf: (...a: unknown[]) => cutPdf(...a) }));
afterEach(cleanup);
beforeEach(() => {
  pdfInfo.mockReset();
  cutPdf.mockReset();
  cutPdf.mockImplementation(async (_f: File, _p: number[], name: string) => new File(["x"], name, { type: "application/pdf" }));
});

const pdf = (name = "de.pdf", size = 1024) => new File([new Uint8Array(size)], name, { type: "application/pdf" });

/** A tiny Studio-like form: one main picker + one answer picker and a send button that follows the rules. */
function Form({ flow = "studio" as "studio" | "import" | "toc" }) {
  const [main, setMain] = useState<PdfPick>({ file: null, pages: null, pending: false });
  const [other, setOther] = useState<PdfPick>({ file: null, pages: null, pending: false });
  const off = !main.file || pagesBlock(flow, main.pages, other.pages, main.pending || other.pending);
  return (
    <div>
      <PdfPagePicker flow={flow} role="main" testId="main" accept="application/pdf" ariaLabel="Đề" onChange={setMain} />
      <PdfPagePicker flow={flow} role="other" testId="other" accept="application/pdf" ariaLabel="Đáp án" onChange={setOther} />
      <PageGuidance flow={flow} main={main.pages} other={other.pages} />
      <button type="button" data-testid="send" disabled={off}>send</button>
      <span data-testid="sent-name">{main.file?.name ?? ""}</span>
    </div>
  );
}
const choose = async (testId: string, f: File) => {
  fireEvent.change(screen.getByTestId(testId), { target: { files: [f] } });
  await waitFor(() => expect(screen.getByTestId(`${testId}-picker`).textContent).toBeTruthy());
};
const sendOff = () => (screen.getByTestId("send") as HTMLButtonElement).disabled;

describe("PdfPagePicker", () => {
  it("a 40-page PDF in Studio: the page box is empty, the send button is off and the guidance is shown", async () => {
    pdfInfo.mockResolvedValue({ ok: true, pageCount: 40 });
    render(<Form />);
    expect(screen.getByTestId("page-guidance").textContent).toContain(pdfPickCopy.guidance.studio(PAGE_LIMITS.studio, KEY_RECOMMEND));
    await choose("main", pdf("sach.pdf", 3 * 1024 * 1024));
    await waitFor(() => expect(screen.getByTestId("main-info").textContent).toBe(pdfPickCopy.info(40, "3.0")));
    expect((screen.getByTestId("main-pages") as HTMLInputElement).value).toBe("");
    expect(sendOff()).toBe(true);
    expect(screen.getByTestId("main-pending").textContent).toBe(pdfPickCopy.needPick);
  });

  it("typing 5–10 gives an amber warning and the button turns on after 'Dùng các trang này'", async () => {
    pdfInfo.mockResolvedValue({ ok: true, pageCount: 40 });
    render(<Form />);
    await choose("main", pdf("sach.pdf"));
    await screen.findByTestId("main-info");
    fireEvent.change(screen.getByTestId("main-pages"), { target: { value: "5–10" } });
    fireEvent.click(screen.getByTestId("main-use"));
    await screen.findByTestId("main-ready");
    expect(screen.getByTestId("main-ready").textContent).toMatch(/^Sẽ gửi 6 trang/);
    expect(screen.getByTestId("page-guidance").getAttribute("data-level")).toBe("ok"); // 6 pages is still the recommended length
    fireEvent.change(screen.getByTestId("main-pages"), { target: { value: "5–11" } });
    expect(sendOff()).toBe(true); // changed after applying: choose again
    fireEvent.click(screen.getByTestId("main-use"));
    await screen.findByTestId("main-ready");
    expect(screen.getByTestId("page-guidance-warn").textContent).toBe(pdfPickCopy.warn.studio);
    expect(sendOff()).toBe(false);
  });

  it("1–12 is red: the button stays off", async () => {
    pdfInfo.mockResolvedValue({ ok: true, pageCount: 40 });
    render(<Form />);
    await choose("main", pdf());
    await screen.findByTestId("main-info");
    fireEvent.change(screen.getByTestId("main-pages"), { target: { value: "1-12" } });
    fireEvent.click(screen.getByTestId("main-use"));
    await screen.findByTestId("main-ready");
    expect(screen.getByTestId("page-guidance-block").textContent).toBe(pdfPickCopy.block.studio(PAGE_LIMITS.studio));
    expect(sendOff()).toBe(true);
  });

  it("'Dùng các trang này' cuts exactly those pages (0-based) and names the new file", async () => {
    pdfInfo.mockResolvedValue({ ok: true, pageCount: 40 });
    render(<Form />);
    const src = pdf("sach.pdf");
    await choose("main", src);
    await screen.findByTestId("main-info");
    fireEvent.change(screen.getByTestId("main-pages"), { target: { value: "5–10" } });
    fireEvent.click(screen.getByTestId("main-use"));
    await screen.findByTestId("main-ready");
    expect(cutPdf).toHaveBeenCalledWith(src, [4, 5, 6, 7, 8, 9], "sach (tr. 5–10).pdf");
    expect(screen.getByTestId("sent-name").textContent).toBe("sach (tr. 5–10).pdf");
  });

  it("a 3-page PDF is sent whole with no warning and no cutting", async () => {
    pdfInfo.mockResolvedValue({ ok: true, pageCount: 3 });
    render(<Form />);
    await choose("main", pdf("de.pdf"));
    await screen.findByTestId("main-ready");
    expect(cutPdf).not.toHaveBeenCalled();
    expect(sendOff()).toBe(false);
    expect(screen.queryByTestId("page-guidance-warn")).toBeNull();
  });

  it("bad page text and pages outside the file are explained", async () => {
    pdfInfo.mockResolvedValue({ ok: true, pageCount: 40 });
    render(<Form />);
    await choose("main", pdf());
    await screen.findByTestId("main-info");
    fireEvent.change(screen.getByTestId("main-pages"), { target: { value: "abc" } });
    fireEvent.click(screen.getByTestId("main-use"));
    expect((await screen.findByTestId("main-error")).textContent).toBe(pdfPickCopy.errors.syntax);
    fireEvent.change(screen.getByTestId("main-pages"), { target: { value: "50" } });
    fireEvent.click(screen.getByTestId("main-use"));
    await waitFor(() => expect(screen.getByTestId("main-error").textContent).toBe(pdfPickCopy.errors.range(40)));
  });

  it("a locked PDF (owner password / no editing) is sent whole with a warning that it cannot be cut", async () => {
    pdfInfo.mockResolvedValue({ ok: false, reason: "encrypted" });
    render(<Form />);
    await choose("main", pdf("khoa.pdf"));
    expect((await screen.findByTestId("main-error")).textContent).toBe(pdfPickCopy.errors.encrypted);
    await waitFor(() => expect(sendOff()).toBe(false));
    expect(screen.getByTestId("sent-name").textContent).toBe("khoa.pdf");
  });

  it("an answer key of 14 pages next to a Word file still counts against the total", async () => {
    pdfInfo.mockResolvedValue({ ok: true, pageCount: 14 });
    render(<Form />);
    await choose("other", pdf("dap-an.pdf"));
    fireEvent.change(await screen.findByTestId("other-pages"), { target: { value: "1-13" } });
    fireEvent.click(screen.getByTestId("other-use"));
    await waitFor(() => expect(screen.getByTestId("page-guidance").getAttribute("data-level")).toBe("block"));
  });

  it("a PDF the browser cannot open still goes through whole (the server judges it, as before)", async () => {
    pdfInfo.mockResolvedValue({ ok: false, reason: "unreadable" });
    render(<Form />);
    await choose("main", pdf("loi.pdf"));
    await waitFor(() => expect(sendOff()).toBe(false));
  });

  it("Enter in the page box applies the pages and never submits an outer form", async () => {
    pdfInfo.mockResolvedValue({ ok: true, pageCount: 40 });
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={submit}><Form /></form>);
    await choose("main", pdf());
    await screen.findByTestId("main-info");
    fireEvent.change(screen.getByTestId("main-pages"), { target: { value: "1-3" } });
    expect(fireEvent.keyDown(screen.getByTestId("main-pages"), { key: "Enter" })).toBe(false);
    await screen.findByTestId("main-ready");
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("Giao bài PDF has no page limit", () => {
  it("a 500-page PDF is sent whole, only the file size is limited", async () => {
    pdfInfo.mockResolvedValue({ ok: true, pageCount: 500 });
    const seen: PdfPick[] = [];
    render(<PdfPagePicker flow="assignment" role="main" testId="a" accept="application/pdf" ariaLabel="PDF" onChange={(p) => seen.push(p)} />);
    fireEvent.change(screen.getByTestId("a"), { target: { files: [pdf("big.pdf")] } });
    await screen.findByTestId("a-ready");
    expect(seen.at(-1)).toMatchObject({ pages: 500, pending: false });
    expect(seen.at(-1)?.file?.name).toBe("big.pdf");
  });
});
