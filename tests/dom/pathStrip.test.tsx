import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PathStrip } from "@/components/roadmap/PathStrip";
import { roadmapCopy } from "@/lib/copy/vi";
import type { RoadmapCurriculum } from "@/lib/roadmap/shape";
import { buildStrip } from "@/lib/roadmap/strip";
import type { MilestoneVersion } from "@/lib/roadmap/types";
import { buildCards } from "@/lib/roadmap/visible";

vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));
afterEach(cleanup);

const cur: RoadmapCurriculum = {
  id: "c1", title: "Destination B2",
  units: [1, 2, 3].map((n) => ({ code: `U${n}`, ord: n, title: `Unit ${n}`, skipped: false })),
  unitStates: { U1: "done", U2: "in_progress", U3: "not_started" },
};
const v = (over: Partial<MilestoneVersion>): MilestoneVersion => ({
  id: "r", milestoneId: "m", version: 1, kind: "progress_test", role: "flag", title: "PT1", curriculumId: "c1", afterUnit: "U2", targetMonth: null, approx: false,
  status: "confirmed", reason: null, proposalKey: null, createdAt: "2026-11-10T00:00:00Z", ...over,
});

describe("PathStrip", () => {
  it("draws the Units by state, flags solid / dashed, the summit, the source note and the link to the Giáo trình", () => {
    const strip = buildStrip("c1", [cur], buildCards([v({ id: "r1", milestoneId: "m1" }), v({ id: "r2", milestoneId: "m2", afterUnit: "U3", status: "draft", title: "Thi thử" }), v({ id: "r3", milestoneId: "m3", role: "summit", title: "Lên C1", curriculumId: null, afterUnit: null })]));
    const { container } = render(<PathStrip strip={strip} curriculaHref="/learners/L1/curricula" />);
    expect(screen.getByTestId("strip-unit-U1").getAttribute("data-state")).toBe("done");
    expect(screen.getByTestId("strip-unit-U2").getAttribute("data-state")).toBe("in_progress");
    expect(screen.getByTestId("strip-flag-m1").getAttribute("data-draft")).toBe("0");
    expect(screen.getByTestId("strip-flag-m2").getAttribute("data-draft")).toBe("1");
    expect(screen.getByTestId("strip-flag-m2").getAttribute("title")).toContain(roadmapCopy.strip.draftWord);
    expect(screen.getByTestId("strip-summit").textContent).toContain(roadmapCopy.strip.summit);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(roadmapCopy.strip.aria(3, 1, 1, 0, 2));
    expect(container.textContent).toContain(roadmapCopy.strip.source);
    expect(screen.getByRole("link", { name: roadmapCopy.strip.openCurricula }).getAttribute("href")).toBe("/learners/L1/curricula");
    // view only: nothing to press on the strip
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("no main curriculum: a plain sentence, no strip", () => {
    render(<PathStrip strip={null} curriculaHref="/x" />);
    expect(screen.getByTestId("path-strip-empty").textContent).toContain(roadmapCopy.strip.noCurriculum);
    expect(screen.queryByTestId("path-strip")).toBeNull();
  });
});
