import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImportForm } from "@/components/studio/ImportForm";
import { studioImportCopy } from "@/lib/copy/vi";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
});
const fetchMock = (status: number, body: unknown) => {
  const f = vi.fn(async () => ({ ok: status < 300, status, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
};
const json = (name: string, text: string) => new File([text], name, { type: "application/json" });
const pick = (files: File[]) => fireEvent.change(screen.getByTestId("studio-import-file"), { target: { files } });

describe("Nhập bài soạn sẵn", () => {
  it("sends each readable file once, shows one row per file, refreshes the draft list", async () => {
    const f = fetchMock(201, { id: "d1", status: "draft", replayed: false, title: "Unit 14 · Idioms (L)", items: 12, needs_review: 2, blocking: 0 });
    render(<ImportForm learnerId="L1" />);
    pick([json("U14-4.json", JSON.stringify({ format: "learning-os.studio-draft" })), json("broken.json", "not json")]);
    expect(screen.getByTestId("studio-import-file-name").textContent).toBe(studioImportCopy.chosen(2));
    fireEvent.click(screen.getByTestId("studio-import-start"));
    await waitFor(() => expect(screen.getByTestId("studio-import-row-1")).toBeTruthy());
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/learners/L1/studio/imports");
    expect(JSON.parse(init.body)).toEqual({ file: { format: "learning-os.studio-draft" } });
    expect(screen.getByTestId("studio-import-row-0").textContent).toContain("✓ Unit 14 · Idioms (L) · 12 câu");
    expect(screen.getByTestId("studio-import-row-0").textContent).toContain("2 câu cần xem");
    expect(screen.getByTestId("studio-import-row-0").querySelector("a")?.getAttribute("href")).toBe("/studio/drafts/d1");
    expect(screen.getByTestId("studio-import-row-1").textContent).toContain(studioImportCopy.errors.not_json);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("explains a file of the other track and a second import of the same file", async () => {
    fetchMock(400, { error: "import_wrong_track", file_track: "B", learner_track: "A" });
    render(<ImportForm learnerId="L1" />);
    pick([json("x.json", "{}")]);
    fireEvent.click(screen.getByTestId("studio-import-start"));
    await waitFor(() => expect(screen.getByTestId("studio-import-row-0").textContent).toContain("File soạn cho Track B, em này học Track A."));
    cleanup();
    fetchMock(200, { id: "d1", status: "draft", replayed: true, title: "T", items: 3, needs_review: 0, blocking: 0 });
    render(<ImportForm learnerId="L1" />);
    pick([json("x.json", "{}")]);
    fireEvent.click(screen.getByTestId("studio-import-start"));
    await waitFor(() => expect(screen.getByTestId("studio-import-row-0").textContent).toContain(studioImportCopy.rowAgain));
  });

  it("the button waits for a file", () => {
    render(<ImportForm learnerId="L1" />);
    expect((screen.getByTestId("studio-import-start") as HTMLButtonElement).disabled).toBe(true);
  });
});
