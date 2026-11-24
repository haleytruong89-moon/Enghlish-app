import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RemoveAssignedButton } from "@/components/studio/RemoveAssignedButton";
import { studioAssignedCopy as c } from "@/lib/copy/vi";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 1 }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Gỡ bài / Khôi phục (skip / unskip of the step)", () => {
  it("asks for a reason first; a too-short reason is refused without a request", async () => {
    render(<RemoveAssignedButton activityId="a1" removed={false} title="Destination C1 C2" />);
    fireEvent.click(screen.getByRole("button", { name: c.remove }));
    expect(screen.getByText(c.removeHelp)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: c.confirmRemove }));
    expect((await screen.findByRole("alert")).textContent).toBe(c.reasonRequired);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends skip with the trimmed reason, then refreshes the page", async () => {
    render(<RemoveAssignedButton activityId="a1" removed={false} title="Destination C1 C2" />);
    fireEvent.click(screen.getByRole("button", { name: c.remove }));
    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: "  Giao trùng bài  " } });
    fireEvent.click(screen.getByRole("button", { name: c.confirmRemove }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/activities/a1/events", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ kind: "skip", reason: "Giao trùng bài" });
  });

  it("Thôi closes the form without a request", () => {
    render(<RemoveAssignedButton activityId="a1" removed={false} title="X" />);
    fireEvent.click(screen.getByRole("button", { name: c.remove }));
    fireEvent.click(screen.getByRole("button", { name: c.cancel }));
    expect(screen.queryByLabelText(c.reasonLabel)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a removed test has one button: Khôi phục sends unskip with a fixed reason", async () => {
    render(<RemoveAssignedButton activityId="a2" removed title="Unit 14 · Idioms (L)" />);
    expect(screen.queryByRole("button", { name: c.remove })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: c.restore }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ kind: "unskip", reason: c.restoreReason });
  });

  it("409 (sent meanwhile / already removed by someone else) or 400: says the page was reloaded and refreshes it", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "has_work" }) });
    render(<RemoveAssignedButton activityId="a1" removed={false} title="X" />);
    fireEvent.click(screen.getByRole("button", { name: c.remove }));
    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: "Giao thử" } });
    fireEvent.click(screen.getByRole("button", { name: c.confirmRemove }));
    expect((await screen.findByRole("alert")).textContent).toBe(c.stale);
    expect(refresh).toHaveBeenCalled();
  });

  it("after a success the buttons stay disabled until the page replaces the row (no duplicate event)", async () => {
    render(<RemoveAssignedButton activityId="a2" removed title="X" />);
    fireEvent.click(screen.getByRole("button", { name: c.restore }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const b = screen.getByTestId("restore-a2") as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the reason field is focused on open, capped at 300, and names the form", () => {
    render(<RemoveAssignedButton activityId="a1" removed={false} title="Destination C1 C2" />);
    fireEvent.click(screen.getByRole("button", { name: c.remove }));
    const input = screen.getByLabelText(c.reasonLabel) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.maxLength).toBe(300);
    expect(screen.getByRole("form", { name: c.removeTitle("Destination C1 C2") })).toBeTruthy();
  });

  it("a failed request shows an error and keeps the form open", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "server" }) });
    render(<RemoveAssignedButton activityId="a1" removed={false} title="X" />);
    fireEvent.click(screen.getByRole("button", { name: c.remove }));
    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: "Giao thử" } });
    fireEvent.click(screen.getByRole("button", { name: c.confirmRemove }));
    expect((await screen.findByRole("alert")).textContent).toBe(c.failed);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText(c.reasonLabel)).toBeTruthy();
  });
});
