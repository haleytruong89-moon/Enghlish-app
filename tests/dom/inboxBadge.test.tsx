import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
import { InboxBadge, resetInboxBadge } from "@/components/shell/InboxBadge";

const reply = (count: string | null) => vi.fn(async () => ({ ok: true, json: async () => ({ count }) }));
beforeEach(() => { pathname = "/"; resetInboxBadge(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("InboxBadge", () => {
  it("shows the number with an accessible label", async () => {
    vi.stubGlobal("fetch", reply("5"));
    render(<InboxBadge learnerId="A" />);
    const el = await screen.findByLabelText("5 việc đang chờ duyệt");
    expect(el.textContent).toBe("5");
  });
  it("shows '≥ 5'", async () => {
    vi.stubGlobal("fetch", reply("≥ 5"));
    render(<InboxBadge learnerId="A" />);
    expect((await screen.findByTestId("inbox-badge")).textContent).toBe("≥ 5");
  });
  it.each([["0"], [null]])("shows nothing for %s", async (c) => {
    const f = reply(c);
    vi.stubGlobal("fetch", f);
    render(<InboxBadge learnerId="A" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.queryByTestId("inbox-badge")).toBeNull();
  });
  it("shows nothing on a network error", async () => {
    const f = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("fetch", f);
    render(<InboxBadge learnerId="A" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.queryByTestId("inbox-badge")).toBeNull();
  });
  it("does not read again on a page change within 30 s; does after leaving /review; does for another child", async () => {
    const f = reply("2");
    vi.stubGlobal("fetch", f);
    const { rerender } = render(<InboxBadge learnerId="A" />);
    await screen.findByTestId("inbox-badge");
    pathname = "/learners/A/weak";
    rerender(<InboxBadge learnerId="A" />);
    expect(f).toHaveBeenCalledTimes(1);
    pathname = "/review";
    rerender(<InboxBadge learnerId="A" />);
    expect(f).toHaveBeenCalledTimes(1);
    pathname = "/learners/A/weak";
    rerender(<InboxBadge learnerId="A" />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    rerender(<InboxBadge learnerId="B" />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(3));
  });
});
