import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
import { BadgeSeed } from "@/components/shell/BadgeSeed";
import { GradeButton } from "@/components/shell/GradeButton";
import { resetBadge, seedBadge } from "@/components/shell/badgeStore";

const reply = (work: string | null, count: string | null = "9") => vi.fn(async () => ({ ok: true, json: async () => ({ count, work }) }));
const btn = (id: string) => <GradeButton learnerId={id} href={`/learners/${id}/finish`} label="Chấm bài" />;
beforeEach(() => { pathname = "/"; resetBadge(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("GradeButton (hướng B): the number of submissions waiting", () => {
  it("red with the number and an accessible label", async () => {
    vi.stubGlobal("fetch", reply("5"));
    render(btn("A"));
    const el = await screen.findByLabelText("5 bài con đã nộp đang chờ chấm");
    expect(el.textContent).toBe("5");
    expect(screen.getByTestId("quick-grade").getAttribute("data-waiting")).toBe("yes");
  });
  it("shows '≥ 5'", async () => {
    vi.stubGlobal("fetch", reply("≥ 5"));
    render(btn("A"));
    expect((await screen.findByTestId("grade-badge")).textContent).toBe("≥ 5");
  });
  it.each([["0"], [null]])("plain, no number, for %s", async (w) => {
    const f = reply(w);
    vi.stubGlobal("fetch", f);
    render(btn("A"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.queryByTestId("grade-badge")).toBeNull();
    expect(screen.getByTestId("quick-grade").getAttribute("data-waiting")).toBe("no");
  });
  it("plain on a network error", async () => {
    const f = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("fetch", f);
    render(btn("A"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.queryByTestId("grade-badge")).toBeNull();
  });
  it("does not read again on a page change within 30 s; does after leaving a grading page; does for another child", async () => {
    const f = reply("2");
    vi.stubGlobal("fetch", f);
    const { rerender } = render(btn("A"));
    await screen.findByTestId("grade-badge");
    pathname = "/learners/A/weak";
    rerender(btn("A"));
    expect(f).toHaveBeenCalledTimes(1);
    pathname = "/learners/A/finish/x1";
    rerender(btn("A"));
    expect(f).toHaveBeenCalledTimes(1);
    pathname = "/learners/A/weak";
    rerender(btn("A"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    rerender(btn("B"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(3));
  });
  it("numbers seeded by the page are shown without asking the route; the memory is per child", async () => {
    const f = reply("9");
    vi.stubGlobal("fetch", f);
    render(<>{btn("A")}<BadgeSeed learnerId="A" count="4" work="3" /></>);
    expect((await screen.findByTestId("grade-badge")).textContent).toBe("3");
    expect(f).not.toHaveBeenCalled();
    cleanup();
    render(btn("B"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    cleanup();
    seedBadge("A", { count: "4", work: "3" });
    render(btn("A"));
    expect((await screen.findByTestId("grade-badge")).textContent).toBe("3");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
