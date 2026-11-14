import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { WayCards } from "@/components/assign/WayCards";
import { WaysStrip } from "@/components/assign/WaysStrip";
import { assignWaysCopy, inquiriesPage } from "@/lib/copy/vi";
import { wayHref } from "@/lib/assign/ways";

afterEach(cleanup);
const L = "a0000000-0000-4000-8000-000000000001";
const P = { title: "Destination C1 · Review 2", pages: "34", units: ["U3", "U4"] };

describe("WayCards", () => {
  it("four cards in order; Studio first, recommended and highlighted", () => {
    render(<WayCards learnerId={L} />);
    const items = screen.getAllByRole("listitem").filter((li) => li.getAttribute("data-testid")?.startsWith("way-"));
    expect(items.map((i) => i.getAttribute("data-testid"))).toEqual(["way-studio", "way-link", "way-pdf", "way-topic"]);
    expect(items[0]!.getAttribute("data-recommended")).toBe("true");
    expect(items[0]!.className).toContain("border-accent");
    expect(within(items[0]!).getByText(assignWaysCopy.recommended)).toBeTruthy();
    for (const i of items.slice(1)) expect(i.getAttribute("data-recommended")).toBe("false");
  });
  it("each card has one 'Chọn cách này →' link to its wayHref, with and without a prefill", () => {
    const { rerender } = render(<WayCards learnerId={L} />);
    for (const w of ["studio", "link", "pdf", "topic"] as const) {
      const a = screen.getByTestId(`way-choose-${w}`);
      expect(a.textContent).toBe(assignWaysCopy.choose);
      expect(a.getAttribute("href")).toBe(wayHref(L, w));
    }
    rerender(<WayCards learnerId={L} prefill={P} />);
    expect(screen.getByTestId("way-choose-link").getAttribute("href")).toBe(wayHref(L, "link", P));
    expect(screen.getByTestId("way-choose-topic").getAttribute("href")).toBe(`/learners/${L}/inquiries`);
    expect(screen.getByTestId("ways-from-book").textContent).toContain("Review 2");
  });
  it("topic card shows the approved intro with its own feedback link, never an <a> inside an <a>", () => {
    const { container } = render(<WayCards learnerId={L} />);
    const intro = screen.getByTestId("way-topic-intro");
    expect(intro.textContent).toContain(inquiriesPage.intro.before.slice(0, 30));
    expect(within(intro).getByText(inquiriesPage.intro.link).getAttribute("href")).toBe(inquiriesPage.introHref(L));
    expect(container.querySelectorAll("a a")).toHaveLength(0);
  });
});

describe("WaysStrip", () => {
  it("four buttons, the current way is aria-current and prefill is carried", () => {
    render(<WaysStrip learnerId={L} current="pdf" prefill={P} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(screen.getByTestId("strip-pdf").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("strip-link").getAttribute("aria-current")).toBeNull();
    expect(screen.getByTestId("strip-link").getAttribute("href")).toBe(wayHref(L, "link", P));
  });
});
