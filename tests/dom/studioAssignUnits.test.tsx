import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssignStudioForm } from "@/components/studio/AssignStudioForm";
import { WorkUnitProposal } from "@/components/curriculum/WorkUnitProposal";
import type { UnitChoice } from "@/lib/curriculum/unitPicker";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const studioSend = vi.fn();
vi.mock("@/lib/studio/client", () => ({ sendJson: (...a: unknown[]) => studioSend(...a) }));
const curSend = vi.fn();
vi.mock("@/lib/curriculum/client", async (orig) => ({ ...(await orig<typeof import("@/lib/curriculum/client")>()), sendJson: (...a: unknown[]) => curSend(...a) }));

beforeEach(() => {
  studioSend.mockReset().mockResolvedValue({ ok: true, status: 201, body: { instance_id: "i", activity_id: "a", replayed: false } });
  curSend.mockReset().mockResolvedValue({ ok: true, status: 201, body: { id: "e1" } });
  refresh.mockReset();
});
afterEach(cleanup);

const CUR = "c1000000-0000-4000-8000-000000000001";
const CHOICES: UnitChoice[] = [{
  curriculumId: CUR, title: "Destination B2",
  units: [{ kind: "unit", code: "U13", title: "Unreal time", status: "done", points: [] }, { kind: "unit", code: "U14", title: "Idioms", status: "not_started", points: [] }],
  reviews: [],
}];

describe("Giao bài Studio with Units (0037)", () => {
  it("no Unit ticked: the body has no units; ticked Units are sent with the assignment", async () => {
    render(<AssignStudioForm draftId="d1" today="2026-11-21" learnerId="l1" unitChoices={CHOICES} />);
    expect(screen.getByTestId("assign-units").textContent).toMatch(/không bắt buộc/);
    fireEvent.click(screen.getByTestId("assign-submit"));
    await waitFor(() => expect(studioSend).toHaveBeenCalledTimes(1));
    expect(studioSend.mock.calls[0]![2]).not.toHaveProperty("units");
    fireEvent.click(screen.getByTestId(`unit-${CUR}-U14`));
    expect(screen.getByTestId("assign-units").textContent).toMatch(/Unit của bài: U14/);
    fireEvent.click(screen.getByTestId("assign-submit"));
    await waitFor(() => expect(studioSend).toHaveBeenCalledTimes(2));
    const body = studioSend.mock.calls[1]![2] as { units: unknown; client_id: string };
    expect(body.units).toEqual([{ curriculum_id: CUR, unit_code: "U14" }]);
    expect(body.client_id).not.toBe((studioSend.mock.calls[0]![2] as { client_id: string }).client_id);
  });
  it("no approved curriculum: no Unit block at all", () => {
    render(<AssignStudioForm draftId="d1" today="2026-11-21" learnerId="l1" unitChoices={[]} />);
    expect(screen.queryByTestId("assign-units")).toBeNull();
  });
});

describe("Đang học proposal from sent work", () => {
  it("one button per Unit; a click writes the unit event (no lesson note) and reloads", async () => {
    render(<WorkUnitProposal curriculumId={CUR} proposals={[{ code: "U14", titles: ["Unit 14 · Idioms"], lastSentAt: "2026-11-21T02:00:00Z" }]} />);
    expect(screen.getByTestId("work-propose-U14").textContent).toMatch(/U14 · Unit 14 · Idioms/);
    fireEvent.click(screen.getByTestId("work-propose-U14-set"));
    await waitFor(() => expect(curSend).toHaveBeenCalledTimes(1));
    expect(curSend.mock.calls[0]![0]).toBe(`/api/curricula/${CUR}/unit-events`);
    expect(curSend.mock.calls[0]![2]).toMatchObject({ unit_code: "U14", status: "in_progress", lesson_note_id: null });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("nothing to propose: nothing shown", () => {
    const { container } = render(<WorkUnitProposal curriculumId={CUR} proposals={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
