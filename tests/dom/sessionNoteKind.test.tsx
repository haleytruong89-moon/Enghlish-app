import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionNoteForm } from "@/components/tutor/SessionNoteForm";
import { absenceCopy, sessionKindCopy } from "@/lib/copy/vi";
import { levelledMap } from "../unit/fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(choices: { id: string; label: string }[] = []) {
  return render(
    <SessionNoteForm learnerId="l1" tags={[]} skills={[]} due={[]} previous={null} today="2026-11-14" minDate="2026-07-14" map={levelledMap()} makeupChoices={choices} />,
  );
}
const fetchMock = (status: number, body: unknown) => {
  const f = vi.fn(async () => ({ ok: status < 300, status, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
};

describe("Ghi buổi: Loại buổi (3B)", () => {
  it("shows Thường / Học bù, Thường selected by default, and no absence choice yet", () => {
    mount([{ id: "a1", label: "19/11 · con, không tính phí" }]);
    expect(screen.getByText(sessionKindCopy.label)).toBeTruthy();
    expect(screen.getByTestId("session-kind-regular").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("session-kind-makeup").getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByTestId("session-makeup-for")).toBeNull();
  });
  it("Học bù shows the live absences without a makeup (optional)", () => {
    mount([{ id: "a1", label: "19/11 · con, không tính phí" }]);
    fireEvent.click(screen.getByTestId("session-kind-makeup"));
    const sel = screen.getByTestId("session-makeup-for") as HTMLSelectElement;
    expect(sel.value).toBe("");
    expect([...sel.options].map((o) => o.text)).toEqual([sessionKindCopy.makeupForNone, "19/11 · con, không tính phí"]);
  });
  it("no absence to choose from: Học bù still works without the list", () => {
    mount([]);
    fireEvent.click(screen.getByTestId("session-kind-makeup"));
    expect(screen.queryByTestId("session-makeup-for")).toBeNull();
  });
  it("a regular note sends no kind (the unchanged payload); a makeup note sends session_kind and makeup_for", async () => {
    const f = fetchMock(201, { id: "n1", replayed: false });
    mount([{ id: "a1", label: "19/11" }]);
    fireEvent.change(screen.getByTestId("session-studied"), { target: { value: "Unit 13" } });
    fireEvent.click(screen.getByTestId("session-save"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    const first = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body) as Record<string, unknown>;
    expect(first).not.toHaveProperty("session_kind");
    cleanup();
    const g = fetchMock(201, { id: "n2", replayed: false });
    mount([{ id: "a1", label: "19/11" }]);
    fireEvent.click(screen.getByTestId("session-kind-makeup"));
    fireEvent.change(screen.getByTestId("session-makeup-for"), { target: { value: "a1" } });
    fireEvent.change(screen.getByTestId("session-studied"), { target: { value: "Bù Unit 13" } });
    fireEvent.click(screen.getByTestId("session-save"));
    await waitFor(() => expect(g).toHaveBeenCalled());
    const second = JSON.parse((g.mock.calls[0] as unknown as [string, { body: string }])[1].body) as Record<string, unknown>;
    expect(second).toMatchObject({ session_kind: "makeup", makeup_for: "a1", studied: "Bù Unit 13" });
  });
  it("Học bù while 0030 is not applied: words, and the typed note stays", async () => {
    fetchMock(409, { error: "sessions_unavailable" });
    mount();
    fireEvent.click(screen.getByTestId("session-kind-makeup"));
    fireEvent.change(screen.getByTestId("session-studied"), { target: { value: "Bù Unit 13" } });
    fireEvent.click(screen.getByTestId("session-save"));
    await waitFor(() => expect(screen.getByTestId("session-error").textContent).toBe(absenceCopy.errors.sessions_unavailable));
    expect((screen.getByTestId("session-studied") as HTMLInputElement).value).toBe("Bù Unit 13");
    expect(screen.queryByTestId("session-saved")).toBeNull();
  });
});
