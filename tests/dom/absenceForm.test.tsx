import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AbsenceForm } from "@/components/sessions/AbsenceForm";
import { absenceCopy } from "@/lib/copy/vi";
import type { AbsenceRow } from "@/lib/sessions/types";

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
const bodyOf = (f: ReturnType<typeof fetchMock>, i = 0) => JSON.parse((f.mock.calls[i] as unknown as [string, { body: string }])[1].body) as Record<string, unknown>;
const urlOf = (f: ReturnType<typeof fetchMock>, i = 0) => (f.mock.calls[i] as unknown as [string])[0];
const abs = (id: string, on: string, o: Partial<AbsenceRow> = {}): AbsenceRow => ({ id, absentOn: on, requestedBy: "student", billable: false, cancelsId: null, note: null, createdAt: `${on}T08:00:00Z`, ...o });
const mount = (absences: AbsenceRow[] = []) => render(<AbsenceForm learnerId="L1" absences={absences} today="2026-11-14" minDate="2026-07-16" maxDate="2027-01-13" />);

describe("Ghi buổi nghỉ", () => {
  it("has the date (with the window), who asked (Con / Thầy/cô / Khác), billable (no default) and a note", () => {
    mount();
    const date = screen.getByTestId("absence-date") as HTMLInputElement;
    expect([date.min, date.max, date.value]).toEqual(["2026-07-16", "2027-01-13", "2026-11-14"]);
    expect(screen.getByTestId("absence-by-student").textContent).toBe(absenceCopy.byStudent);
    expect(screen.getByTestId("absence-by-tutor").textContent).toBe(absenceCopy.byTutor);
    expect(screen.getByTestId("absence-by-other").textContent).toBe(absenceCopy.byOther);
    expect(screen.getByTestId("absence-billable-yes").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("absence-billable-no").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("absence-none").textContent).toBe(absenceCopy.none);
  });
  it("billable must be chosen by hand; nothing is sent before", async () => {
    const f = fetchMock(201, { id: "x", replayed: false });
    mount();
    fireEvent.click(screen.getByTestId("absence-save"));
    expect(screen.getByTestId("absence-error").textContent).toBe(absenceCopy.billableChoose);
    expect(f).not.toHaveBeenCalled();
  });
  it("sends only the facts (no counts, no money) and refreshes", async () => {
    const f = fetchMock(201, { id: "x", replayed: false });
    mount();
    fireEvent.change(screen.getByTestId("absence-date"), { target: { value: "2026-11-19" } });
    fireEvent.click(screen.getByTestId("absence-by-other"));
    fireEvent.click(screen.getByTestId("absence-billable-yes"));
    fireEvent.change(screen.getByTestId("absence-note"), { target: { value: " Lễ " } });
    fireEvent.click(screen.getByTestId("absence-save"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(urlOf(f)).toBe("/api/learners/L1/sessions/absences");
    const b = bodyOf(f);
    expect(b).toMatchObject({ absent_on: "2026-11-19", requested_by: "other", billable: true, note: "Lễ" });
    expect(Object.keys(b).sort()).toEqual(["absent_on", "billable", "client_id", "note", "requested_by"]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("an error from the server is shown in words and the form stays", async () => {
    fetchMock(400, { error: "bad_date" });
    mount();
    fireEvent.click(screen.getByTestId("absence-billable-no"));
    fireEvent.click(screen.getByTestId("absence-save"));
    await waitFor(() => expect(screen.getByTestId("absence-error").textContent).toBe(absenceCopy.errors.bad_date));
  });
  it("lists live absences only; 'Bỏ ghi nghỉ' asks for a reason, then posts to the cancel route", async () => {
    const f = fetchMock(201, { id: "c", replayed: false });
    mount([abs("a1", "2026-11-19"), abs("a2", "2026-11-12", { requestedBy: "tutor", billable: true }), abs("c2", "2026-11-12", { cancelsId: "a2", note: "nhầm" })]);
    // a2 is cancelled by c2: only a1 is live
    expect(screen.queryByTestId("absence-a2")).toBeNull();
    expect(screen.getByTestId("absence-a1").textContent).toContain("19/11 · con, không tính phí");
    fireEvent.click(screen.getByTestId("absence-cancel-a1"));
    fireEvent.change(screen.getByTestId("absence-cancel-reason-a1"), { target: { value: "ghi nhầm ngày" } });
    fireEvent.click(screen.getByTestId("absence-cancel-go-a1"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(urlOf(f)).toBe("/api/learners/L1/sessions/absences/a1/cancel");
    expect(bodyOf(f)).toMatchObject({ reason: "ghi nhầm ngày" });
  });
});
