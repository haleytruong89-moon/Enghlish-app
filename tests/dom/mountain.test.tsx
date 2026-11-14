import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { JourneyView } from "@/components/student/journey/JourneyView";
import { journeyCopy } from "@/lib/copy/vi";
import { buildJourney, type JourneyUnitInput } from "@/lib/journey/path";
import type { ChildMilestone } from "@/lib/roadmap/types";

afterEach(cleanup);
const unit = (n: number, status: JourneyUnitInput["status"] = "not_started", skipped = false): JourneyUnitInput => ({ code: `U${n}`, ord: n, title: `Unit ${n}`, skipped, status, doneOn: status === "done" ? "2026-11-01" : null });
const flag = (afterUnit: string): ChildMilestone => ({ id: "m1", kind: "progress_test", role: "flag", title: "Progress Test 1", curriculumId: "c1", afterUnit, targetMonth: null, approx: false });
const summit: ChildMilestone = { id: "s1", kind: "goal", role: "summit", title: "Lên C1", curriculumId: null, afterUnit: null, targetMonth: "2027-06-01", approx: false };
const journey = (milestones: ChildMilestone[] = []) =>
  buildJourney({
    main: { id: "c1", title: "Destination B2" }, others: [{ id: "c2", title: "Grammar", done: 2, total: 10 }], milestones,
    units: [unit(1, "done"), unit(2, "done"), unit(3, "in_progress"), unit(4), unit(5, "not_started", true), unit(6)],
  });

describe("Hành trình · the mountain", () => {
  it("every Unit and flag has a 44 px target whose words carry the name AND the state (not colour alone)", () => {
    render(<JourneyView journey={journey([flag("U4")])} />);
    const u3 = screen.getByTestId("mt-unit-U3");
    expect(u3.getAttribute("aria-label")).toBe(`Unit 3. ${journeyCopy.here} · ${journeyCopy.unitStatus.in_progress}`);
    expect(u3.className).toContain("size-11");
    expect(screen.getByTestId("mt-unit-U1").getAttribute("aria-label")).toContain(journeyCopy.unitStatus.done);
    expect(screen.getByTestId("mt-unit-U4").getAttribute("aria-label")).toContain(journeyCopy.unitStatus.not_started);
    expect(screen.getByTestId("mt-unit-U5").getAttribute("aria-label")).toContain(journeyCopy.unitStatus.skipped);
    expect(screen.getByTestId("mt-flag-m1").getAttribute("aria-label")).toBe(`Progress Test 1. ${journeyCopy.remainToFlag(2)}`);
  });
  it("tapping a dot shows its name and state under the picture", () => {
    render(<JourneyView journey={journey()} />);
    fireEvent.click(screen.getByTestId("mt-unit-U2"));
    expect(screen.getByTestId("mountain-detail").textContent).toContain("Unit 2");
    expect(screen.getByTestId("mountain-detail").textContent).toContain(journeyCopy.unitStatus.done);
  });
  it("the list view has the same Units with words for each state, and 'Bạn đang ở đây' on the climber's Unit only", () => {
    render(<JourneyView journey={journey([flag("U4")])} />);
    const list = screen.getByTestId("path-list");
    expect(within(list).getAllByText(journeyCopy.here)).toHaveLength(1);
    expect(screen.getByTestId("path-unit-U3").textContent).toContain(journeyCopy.here);
    expect(screen.getByTestId("path-unit-U5").textContent).toContain(journeyCopy.unitStatus.skipped);
    expect(screen.getByTestId("path-flag-m1").textContent).toContain(journeyCopy.remainToFlag(2));
    expect(screen.getByTestId("path-unit-U1").getAttribute("data-status")).toBe("done");
  });
  it("summary counts Units only: 'Đã xong 2/5 Unit · còn 2 Unit tới Progress Test 1'", () => {
    render(<JourneyView journey={journey([flag("U4")])} />);
    expect(screen.getByTestId("journey-summary").textContent).toBe(journeyCopy.summary.toMilestone(2, 5, 2, "Progress Test 1"));
  });
  it("summit unconfirmed: 'Đỉnh của bạn — thầy/cô sẽ đặt tên'; confirmed: its name and month", () => {
    const { unmount } = render(<JourneyView journey={journey()} />);
    expect(screen.getByTestId("journey-summit-unnamed").textContent).toBe(journeyCopy.summitUnnamed);
    expect(screen.getByTestId("path-summit").textContent).toContain(journeyCopy.summitUnnamed);
    unmount();
    render(<JourneyView journey={journey([summit])} />);
    expect(screen.queryByTestId("journey-summit-unnamed")).toBeNull();
    expect(screen.getByTestId("path-summit").textContent).toContain("Lên C1");
    expect(screen.getByTestId("path-summit").textContent).toContain("06/2027");
  });
  it("no curriculum: an empty mountain with the soft line, no list toggle", () => {
    render(<JourneyView journey={buildJourney({ main: null, units: [], others: [], milestones: [] })} />);
    expect(screen.getByTestId("mountain-detail").textContent).toBe(journeyCopy.emptyMountain);
    expect(screen.queryByTestId("journey-list-toggle")).toBeNull();
    expect(screen.queryByTestId("journey-summary")).toBeNull();
  });
  it("other curricula show counts of Units; milestones off the mountain go to 'Mốc khác'", () => {
    render(<JourneyView journey={journey([flag("U99")])} />);
    expect(screen.getByTestId("journey-others").textContent).toContain(journeyCopy.otherDone(2, 10));
    expect(screen.getByTestId("journey-other-milestones").textContent).toContain("Progress Test 1");
  });
  it("no score-like text anywhere on the page: no %, no 'điểm', no 'x/4', no 'đúng/sai'", () => {
    const { container } = render(<JourneyView journey={journey([flag("U4"), summit])} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/%|(^|[^\p{L}])điểm(?!\p{L})|\/\s*4\b|đúng|sai\b|cấp\b/iu);
    // the only "a/b" in the page are counts of work (Units), inside a data-count element (months like 06/2027 are dates, not counts)
    const slashes = [...container.querySelectorAll("*")].filter((el) => el.children.length === 0 && /(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])/.test(el.textContent ?? ""));
    for (const el of slashes) expect(el.closest("[data-count='work']"), el.textContent ?? "").not.toBeNull();
  });
});
