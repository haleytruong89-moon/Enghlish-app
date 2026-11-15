import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { LinkSubmit } from "@/components/student/submit/LinkSubmit";
import { PaperSubmit } from "@/components/student/submit/PaperSubmit";
import { linkSubmitCopy, paperSubmitCopy, submitScreenCopy as copy } from "@/lib/copy/vi";
import type { StudentPracticeItem } from "@/lib/practice/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { href: p.href, "data-testid": p["data-testid"], className: p.className as string }, p.children) }));

// jsdom cannot decode or draw pictures: the picture step is replaced by one that keeps the file as it is (its own tests are the pure ones + the browser e2e).
const prepare = vi.fn();
const render90 = vi.fn();
vi.mock("@/lib/practice/image", async (orig) => ({ ...(await orig<typeof import("@/lib/practice/image")>()), preparePaperFile: (...a: unknown[]) => prepare(...a), renderPaperImage: (...a: unknown[]) => render90(...a) }));
const uploadAll = vi.fn();
vi.mock("@/lib/practice/client", async (orig) => ({ ...(await orig<typeof import("@/lib/practice/client")>()), uploadAll: (...a: unknown[]) => uploadAll(...a) }));
const postJson = vi.fn();
vi.mock("@/lib/tutorwork/client", async (orig) => ({ ...(await orig<typeof import("@/lib/tutorwork/client")>()), postJson: (...a: unknown[]) => postJson(...a) }));

beforeEach(() => {
  let n = 0;
  prepare.mockReset();
  prepare.mockImplementation(async (f: File) => {
    n += 1;
    return f.type === "application/pdf" ? { ok: true, file: { blob: f, mime: f.type, bytes: 10, name: f.name } } : { ok: true, file: { blob: f, mime: "image/jpeg", bytes: 10 + n, name: f.name } };
  });
  render90.mockReset();
  render90.mockImplementation(async (b: Blob, q: number, name: string) => ({ ok: true, file: { blob: b, mime: "image/jpeg", bytes: 99, name: `${name}@${q}` } }));
  uploadAll.mockReset();
  uploadAll.mockImplementation(async (files: { name: string; bytes: number }[]) => ({ ok: true, files: files.map((f, i) => ({ id: `file-${i}-${f.name}`, mime: "image/jpeg", bytes: f.bytes })) }));
  postJson.mockReset();
  postJson.mockResolvedValue({ ok: true, status: 201, body: { id: "s1", replayed: false } });
  refresh.mockReset();
  let k = 0;
  URL.createObjectURL = vi.fn(() => `blob:p${++k}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const base: StudentPracticeItem = {
  assignmentId: "c0000000-0000-4000-8000-000000000002", kind: "pdf", title: "Đề 3", sourceKey: null, url: null, hasFile: true, dueOn: "2026-11-20", assignedOn: "2026-11-14",
  reviewed: false, submission: null,
};
const jpg = (name: string) => new File([name], name, { type: "image/jpeg" });
const pick = async (files: File[], testId = "paper-file-input") => {
  fireEvent.change(screen.getByTestId(testId), { target: { files } });
  await waitFor(() => expect(screen.getAllByTestId(testId.startsWith("link") ? "link-page" : "paper-page")).toHaveLength(files.length));
};

describe("Nộp bài giấy (PaperSubmit)", () => {
  it("camera + file inputs: the camera one asks the back camera, the other takes many pictures and PDFs", () => {
    render(<PaperSubmit item={base} />);
    const cam = screen.getByTestId("paper-camera-input") as HTMLInputElement;
    expect(cam.getAttribute("capture")).toBe("environment");
    expect(cam.accept).toBe("image/*");
    const file = screen.getByTestId("paper-file-input") as HTMLInputElement;
    expect(file.multiple).toBe(true);
    expect(file.accept).toContain("application/pdf");
    expect(screen.getByTestId("paper-download").getAttribute("href")).toBe(`/api/student/practice/${base.assignmentId}/file`);
  });

  it("every page says 'Trang n' and its buttons name the page; all buttons are at least 44 px", async () => {
    render(<PaperSubmit item={base} />);
    await pick([jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")]);
    const items = screen.getAllByTestId("paper-page");
    items.forEach((li, i) => {
      expect(within(li).getByTestId("paper-label").textContent).toBe(copy.page(i + 1));
      expect(within(li).getByLabelText(copy.toolAria.turn(i + 1))).toBeTruthy();
      expect(within(li).getByLabelText(copy.toolAria.remove(i + 1))).toBeTruthy();
      expect(within(li).getByLabelText(copy.toolAria.up(i + 1))).toBeTruthy();
      expect(within(li).getByLabelText(copy.toolAria.down(i + 1))).toBeTruthy();
      for (const b of within(li).getAllByRole("button")) expect(b.className, b.textContent ?? "").toMatch(/min-h-1[12]/);
    });
    for (const id of ["paper-camera", "paper-choose", "submit-send"]) expect(screen.getByTestId(id).className).toMatch(/min-h-12/);
    for (const id of ["ask-first-yes", "ask-hint-no"]) expect(screen.getByTestId(id).className).toMatch(/min-h-12/);
    expect(screen.getByTestId("paper-count").textContent).toBe(copy.countPages(3));
  });

  it("Lên / Xuống / Xoay / Xóa work on the right page; the first page cannot go up, the last cannot go down", async () => {
    render(<PaperSubmit item={base} />);
    await pick([jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")]);
    const li = (n: number) => screen.getAllByTestId("paper-page")[n - 1]!;
    expect((within(li(1)).getByTestId("paper-up") as HTMLButtonElement).disabled).toBe(true);
    expect((within(li(3)).getByTestId("paper-down") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(li(3)).getByTestId("paper-up")); // c moves before b
    fireEvent.click(within(li(1)).getByTestId("paper-turn")); // a is turned a quarter
    expect(screen.getAllByTestId("paper-page").map((x) => x.getAttribute("data-quarter"))).toEqual(["1", "0", "0"]);
    fireEvent.click(within(li(2)).getByTestId("paper-remove")); // c is deleted
    expect(screen.getAllByTestId("paper-page")).toHaveLength(2);
    expect(screen.getByTestId("paper-count").textContent).toBe(copy.countPages(2));
    expect(screen.getAllByTestId("paper-label").map((x) => x.textContent)).toEqual([copy.page(1), copy.page(2)]);
  });

  it("a PDF page has no turn button; at most 12 pages, and it says so when more are added", async () => {
    render(<PaperSubmit item={base} />);
    fireEvent.change(screen.getByTestId("paper-file-input"), { target: { files: [new File(["p"], "bai.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getAllByTestId("paper-page")).toHaveLength(1));
    expect(within(screen.getByTestId("paper-page")).queryByTestId("paper-turn")).toBeNull();
    const eleven = Array.from({ length: 11 }, (_, i) => jpg(`x${i}.jpg`));
    fireEvent.change(screen.getByTestId("paper-file-input"), { target: { files: eleven } });
    await waitFor(() => expect(screen.getAllByTestId("paper-page")).toHaveLength(12));
    fireEvent.change(screen.getByTestId("paper-file-input"), { target: { files: [jpg("y.jpg"), jpg("z.jpg")] } });
    await waitFor(() => expect(screen.getByTestId("paper-notice").textContent).toBe((copy.errors.tooMany as (m: number) => string)(12)));
    expect(screen.getAllByTestId("paper-page")).toHaveLength(12);
    // a page removed makes room for one more; two more than the room say how many fitted
    fireEvent.click(within(screen.getAllByTestId("paper-page")[11]!).getByTestId("paper-remove"));
    fireEvent.change(screen.getByTestId("paper-file-input"), { target: { files: [jpg("y.jpg"), jpg("z.jpg")] } });
    await waitFor(() => expect(screen.getByTestId("paper-notice").textContent).toBe((copy.errors.dropped as (a: number, m: number) => string)(1, 12)));
    expect(screen.getAllByTestId("paper-page")).toHaveLength(12);
  });

  it("a picture the browser cannot open gives the kind sentence and adds nothing", async () => {
    prepare.mockResolvedValueOnce({ ok: false, reason: "unreadable" });
    render(<PaperSubmit item={base} />);
    fireEvent.change(screen.getByTestId("paper-file-input"), { target: { files: [new File(["h"], "IMG_1.HEIC", { type: "image/heic" })] } });
    await waitFor(() => expect(screen.getByTestId("paper-notice").textContent).toBe(copy.errors.unreadable));
    expect(screen.queryAllByTestId("paper-page")).toHaveLength(0);
  });

  it("'Nộp' is off and 'Còn thiếu' names what is missing, until there is a page and BOTH questions are answered (nothing is pre-chosen)", async () => {
    render(<PaperSubmit item={base} />);
    const send = screen.getByTestId("submit-send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByTestId("submit-missing").textContent).toBe(copy.missing([copy.missingPart.pages, copy.missingPart.questions]));
    expect(screen.getByTestId("ask-first-yes").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("ask-hint-no").getAttribute("aria-checked")).toBe("false");
    await pick([jpg("a.jpg")]);
    fireEvent.click(screen.getByTestId("ask-first-no"));
    expect(screen.getByTestId("submit-missing").textContent).toBe(copy.missing([copy.missingPart.hint]));
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("ask-hint-yes"));
    expect(screen.queryByTestId("submit-missing")).toBeNull();
    expect(send.disabled).toBe(false);
  });

  it("sends the pages in the order shown, with the turn applied, the answers, and no link; then says it is sent", async () => {
    render(<PaperSubmit item={base} />);
    await pick([jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")]);
    const li = (n: number) => screen.getAllByTestId("paper-page")[n - 1]!;
    fireEvent.click(within(li(3)).getByTestId("paper-up")); // a c b
    fireEvent.click(within(li(1)).getByTestId("paper-turn")); // a turned
    fireEvent.click(screen.getByTestId("ask-first-yes"));
    fireEvent.click(screen.getByTestId("ask-hint-no"));
    fireEvent.click(screen.getByTestId("submit-send"));
    await waitFor(() => expect(screen.getByTestId("submit-done")).toBeTruthy());
    const sentFiles = uploadAll.mock.calls[0]![0] as { name: string }[];
    expect(sentFiles.map((f) => f.name)).toEqual(["a.jpg@1", "c.jpg", "b.jpg"]);
    expect(uploadAll.mock.calls[0]![1]).toBe("/api/student/files");
    expect(uploadAll.mock.calls[0]![2]).toEqual({ assignment_id: base.assignmentId });
    const [url, body] = postJson.mock.calls[0]! as [string, { files: { id: string }[]; attempt: string; used_hint: boolean; link_url: null; assignment_id: string }];
    expect(url).toBe("/api/student/submissions");
    expect(body).toMatchObject({ assignment_id: base.assignmentId, attempt: "first", used_hint: false, link_url: null });
    expect(body.files.map((f) => f.id)).toEqual(["file-0-a.jpg@1", "file-1-c.jpg", "file-2-b.jpg"]);
    expect(refresh).toHaveBeenCalled();
  });

  it("a failed send keeps the pages and the answers, says why in plain words, and a second try uses the same client id", async () => {
    postJson.mockResolvedValueOnce({ ok: false, status: 0, error: "error" });
    render(<PaperSubmit item={base} />);
    await pick([jpg("a.jpg")]);
    fireEvent.click(screen.getByTestId("ask-first-yes"));
    fireEvent.click(screen.getByTestId("ask-hint-no"));
    fireEvent.click(screen.getByTestId("submit-send"));
    await waitFor(() => expect(screen.getByTestId("submit-error")).toBeTruthy());
    expect(screen.getByTestId("submit-error").textContent).toMatch(/mạng/);
    expect(screen.getAllByTestId("paper-page")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("submit-send"));
    await waitFor(() => expect(screen.getByTestId("submit-done")).toBeTruthy());
    const ids = postJson.mock.calls.map((c) => (c[1] as { client_id: string }).client_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("an item an adult has already looked at cannot be sent again; one sent before shows when, and can be sent again", () => {
    const { unmount } = render(<PaperSubmit item={{ ...base, reviewed: true }} />);
    expect(screen.getByTestId("submit-reviewed")).toBeTruthy();
    expect(screen.queryByTestId("paper-submit")).toBeNull();
    unmount();
    render(<PaperSubmit item={{ ...base, submission: { submittedAt: "2026-11-15T03:00:00Z", attempt: "first", usedHint: false, fileCount: 2, hasLink: false } }} />);
    expect(screen.getByTestId("paper-resend-note")).toBeTruthy();
    expect(screen.getByTestId("paper-submit")).toBeTruthy();
  });

  it("no score words on the screen, the tutor is 'thầy/cô', the child 'bạn'", () => {
    render(<PaperSubmit item={base} />);
    const text = screen.getByTestId("paper-submit").textContent ?? "";
    expect(text).toContain(paperSubmitCopy.how);
    expect(text).not.toMatch(/điểm|đúng|sai\b|%|kỹ năng/i);
    expect(text.replace(/thầy\/cô/g, "")).not.toMatch(/(^|[^\p{L}])(cô|thầy)(?!\p{L})/iu);
  });
});

describe("Nộp bài link (LinkSubmit)", () => {
  const link: StudentPracticeItem = { ...base, assignmentId: "c0000000-0000-4000-8000-000000000001", kind: "link", title: "Unless", sourceKey: "test-english", url: "https://www.test-english.com/x", hasFile: false };

  it("step 1 opens the exercise in a new tab; the result pictures are locked until 'Xong rồi'; 'Chưa' keeps the work in Hôm nay", () => {
    render(<LinkSubmit item={link} />);
    const a = screen.getByTestId("link-open");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByTestId("link-locked").textContent).toBe(linkSubmitCopy.step3Locked);
    expect(screen.queryByTestId("link-file-input")).toBeNull();
    fireEvent.click(screen.getByTestId("link-finished-no"));
    expect(screen.getByTestId("link-not-yet").textContent).toContain(linkSubmitCopy.notYetNote);
    expect(screen.getByTestId("link-back-today").getAttribute("href")).toBe("/");
    expect(screen.queryByTestId("link-file-input")).toBeNull();
    expect(postJson).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("link-finished-yes"));
    expect(screen.queryByTestId("link-not-yet")).toBeNull();
    expect((screen.getByTestId("link-file-input") as HTMLInputElement).accept).toBe("image/*"); // pictures only
  });

  it("the result pictures are 'Ảnh n', can be arranged, and are sent with the two answers", async () => {
    render(<LinkSubmit item={link} />);
    fireEvent.click(screen.getByTestId("link-finished-yes"));
    await pick([jpg("r1.jpg"), jpg("r2.jpg")], "link-file-input");
    expect(screen.getAllByTestId("link-label").map((x) => x.textContent)).toEqual([copy.photo(1), copy.photo(2)]);
    expect(screen.getByTestId("submit-missing").textContent).toBe(copy.missing([copy.missingPart.questions]));
    fireEvent.click(within(screen.getAllByTestId("link-page")[1]!).getByTestId("link-up"));
    fireEvent.click(screen.getByTestId("ask-first-yes"));
    fireEvent.click(screen.getByTestId("ask-hint-yes"));
    fireEvent.click(screen.getByTestId("submit-send"));
    await waitFor(() => expect(screen.getByTestId("submit-done")).toBeTruthy());
    expect((uploadAll.mock.calls[0]![0] as { name: string }[]).map((f) => f.name)).toEqual(["r2.jpg", "r1.jpg"]);
    expect(postJson.mock.calls[0]![1]).toMatchObject({ assignment_id: link.assignmentId, attempt: "first", used_hint: true, link_url: null });
  });

  it("a PDF is refused here with a clear sentence", async () => {
    render(<LinkSubmit item={link} />);
    fireEvent.click(screen.getByTestId("link-finished-yes"));
    fireEvent.change(screen.getByTestId("link-file-input"), { target: { files: [new File(["p"], "x.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByTestId("link-notice").textContent).toBe(copy.errors.pdfNotHere));
    expect(screen.queryAllByTestId("link-page")).toHaveLength(0);
  });
});
