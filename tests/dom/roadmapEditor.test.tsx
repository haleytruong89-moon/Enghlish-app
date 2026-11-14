import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MilestoneList } from "@/components/roadmap/MilestoneList";
import { ProposalList } from "@/components/roadmap/ProposalList";
import { roadmapCopy } from "@/lib/copy/vi";
import type { RoadmapCurriculum } from "@/lib/roadmap/shape";
import type { MilestoneVersion, Proposal } from "@/lib/roadmap/types";
import { buildCards } from "@/lib/roadmap/visible";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));
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

const curricula: RoadmapCurriculum[] = [{ id: "c1", title: "Destination B2", units: [{ code: "U1", ord: 1, title: "Unit 1", skipped: false }, { code: "U2", ord: 2, title: "Unit 2", skipped: false }], unitStates: { U1: "done", U2: "not_started" } }];
const ver = (over: Partial<MilestoneVersion>): MilestoneVersion => ({
  id: "r1", milestoneId: "m1", version: 1, kind: "mock_exam", role: "flag", title: "Thi thử vào 10", curriculumId: "c1", afterUnit: "U2", targetMonth: "2027-03-01", approx: false,
  status: "confirmed", reason: null, proposalKey: null, createdAt: "2026-11-10T00:00:00Z", ...over,
});
const list = (rows: MilestoneVersion[], canWrite = true) => render(<MilestoneList learnerId="L1" cards={buildCards(rows)} curricula={curricula} mainId="c1" canWrite={canWrite} orphanIds={[]} />);

describe("Lộ trình · milestones", () => {
  it("the parent sees the milestones but no button at all", () => {
    list([ver({})], false);
    expect(screen.getByTestId("ms-m1").textContent).toContain("Thi thử vào 10");
    expect(screen.getByTestId("ms-m1").textContent).toContain("Sau U2 · Unit 2");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("a draft over a confirmed version says the child still sees the old one", () => {
    list([ver({}), ver({ id: "r2", version: 2, status: "draft", createdAt: "2026-11-12T00:00:00Z" })]);
    expect(screen.getByTestId("ms-m1").textContent).toContain(roadmapCopy.status.draftChildSeesOld("10/11/2026"));
    expect(screen.getByTestId("ms-confirm-m1")).toBeTruthy();
  });
  it("removing asks for a reason (≥ 5 characters) and posts a removed version on the current one", async () => {
    const f = fetchMock(201, { milestone_id: "m1", version: 2, replayed: false });
    list([ver({})]);
    fireEvent.click(screen.getByTestId("ms-remove-m1"));
    fireEvent.change(screen.getByTestId("ms-remove-reason-m1"), { target: { value: "lịch thi đổi" } });
    fireEvent.click(screen.getByTestId("ms-remove-go-m1"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(urlOf(f)).toBe("/api/learners/L1/roadmap/milestones");
    expect(bodyOf(f)).toMatchObject({ milestone_id: "m1", base_version: 1, status: "removed", reason: "lịch thi đổi" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("a missing or too-short reason is refused in words before anything is sent", async () => {
    const f = fetchMock(400, { error: "reason_required" });
    list([ver({})]);
    fireEvent.click(screen.getByTestId("ms-remove-m1"));
    fireEvent.click(screen.getByTestId("ms-remove-go-m1"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(roadmapCopy.errors.reason_required));
    fireEvent.change(screen.getByTestId("ms-remove-reason-m1"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("ms-remove-go-m1"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(roadmapCopy.errors.reason_required));
    expect(f).not.toHaveBeenCalled();
  });
  it("adding a summit: 'Đã có đỉnh' names the existing summit", async () => {
    fetchMock(400, { error: "summit_exists" });
    list([ver({ role: "beyond", curriculumId: null, afterUnit: null, title: "Sau" })]);
    fireEvent.click(screen.getByTestId("ms-add-summit"));
    fireEvent.change(screen.getByTestId("ms-title"), { target: { value: "Lên C1" } });
    fireEvent.click(screen.getByTestId("ms-save-confirm"));
    await waitFor(() => expect(screen.getByTestId("ms-error").textContent).toContain(roadmapCopy.errors.summit_exists));
  });
  it("the form sends the month as YYYY-MM, a flag with its curriculum and Unit, and refuses a bad month before sending", async () => {
    const f = fetchMock(201, { milestone_id: "m9", version: 1, replayed: false });
    list([]);
    fireEvent.click(screen.getByTestId("ms-add-flag"));
    fireEvent.change(screen.getByTestId("ms-title"), { target: { value: "Progress Test 1" } });
    fireEvent.change(screen.getByTestId("ms-unit"), { target: { value: "U1" } });
    fireEvent.change(screen.getByTestId("ms-month"), { target: { value: "13/2027" } });
    fireEvent.click(screen.getByTestId("ms-save-draft"));
    await waitFor(() => expect(screen.getByTestId("ms-error").textContent).toBe(roadmapCopy.errors.bad_fields));
    expect(f).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("ms-month"), { target: { value: "03/2027" } });
    fireEvent.click(screen.getByTestId("ms-save-draft"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(bodyOf(f)).toMatchObject({ status: "draft", fields: { kind: "progress_test", role: "flag", title: "Progress Test 1", curriculum_id: "c1", after_unit: "U1", target_month: "2027-03" } });
    expect(bodyOf(f)).not.toHaveProperty("milestone_id");
  });
});

describe("Lộ trình · proposals", () => {
  const p: Proposal = { key: "pt:c1:progress-test-1", kind: "progress_test", role: "flag", title: "Progress Test 1", curriculumId: "c1", afterUnit: "U2", targetMonth: null, approx: false, source: "progress_test" };
  const mount = (canWrite = true) => render(<ProposalList learnerId="L1" proposals={[p]} curricula={curricula} mainId="c1" canWrite={canWrite} summitTitle={null} />);
  it("nothing to show when there is no proposal; the parent gets no button", () => {
    const { container, unmount } = render(<ProposalList learnerId="L1" proposals={[]} curricula={curricula} mainId="c1" canWrite summitTitle={null} />);
    expect(container.textContent).toBe("");
    unmount();
    mount(false);
    expect(screen.getByTestId("proposal").textContent).toContain("Progress Test 1");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("Xác nhận posts a confirmed new milestone with the proposal key", async () => {
    const f = fetchMock(201, { milestone_id: "m1", version: 1, replayed: false });
    mount();
    fireEvent.click(screen.getByTestId("proposal-confirm"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(bodyOf(f)).toMatchObject({ status: "confirmed", proposal_key: p.key, fields: { title: "Progress Test 1", after_unit: "U2", curriculum_id: "c1" } });
    expect(bodyOf(f)).not.toHaveProperty("milestone_id");
  });
  it("Bỏ đề xuất needs a reason and posts a removed v1 that carries the key (so it never comes back)", async () => {
    const f = fetchMock(201, { milestone_id: "m1", version: 1, replayed: false });
    mount();
    fireEvent.click(screen.getByTestId("proposal-dismiss"));
    fireEvent.change(screen.getByTestId("proposal-dismiss-reason"), { target: { value: "không làm đề này" } });
    fireEvent.click(screen.getByTestId("proposal-dismiss-go"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(bodyOf(f)).toMatchObject({ status: "removed", reason: "không làm đề này", proposal_key: p.key });
  });
});

describe("Lộ trình · idempotency id (client_id)", () => {
  const p: Proposal = { key: "pt:c1:progress-test-1", kind: "progress_test", role: "flag", title: "Progress Test 1", curriculumId: "c1", afterUnit: "U2", targetMonth: null, approx: false, source: "progress_test" };
  const seq = (...answers: (number | "network")[]) => {
    const f = vi.fn(async () => {
      const a = answers.shift() ?? 201;
      if (a === "network") throw new Error("offline");
      return { ok: a < 300, status: a, json: async () => ({ error: a === 400 ? "bad_fields" : "x", milestone_id: "m1", version: 1, replayed: false }) };
    });
    vi.stubGlobal("fetch", f);
    return f;
  };
  const idOf = (f: ReturnType<typeof seq>, i: number) => bodyOf(f as unknown as ReturnType<typeof fetchMock>, i).client_id;
  const mount = () => render(<ProposalList learnerId="L1" proposals={[p]} curricula={curricula} mainId="c1" canWrite summitTitle={null} />);

  it("a network error or a 5xx keeps the id (the retry is the same intent); a definite 4xx rotates it", async () => {
    const f = seq("network", 500, 400, 201);
    mount();
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByTestId("proposal-confirm"));
      await waitFor(() => expect(f).toHaveBeenCalledTimes(i + 1));
      await waitFor(() => expect(screen.getByTestId("proposal-confirm")).toBeTruthy());
    }
    expect(idOf(f, 1)).toBe(idOf(f, 0)); // after the network error
    expect(idOf(f, 2)).toBe(idOf(f, 0)); // after the 500
    expect(idOf(f, 3)).not.toBe(idOf(f, 0)); // after the 400 the next try is a new intent
  });
  it("a success rotates the id; changing the content (the reason) also gets a new id", async () => {
    const f = seq(500, 500, 201);
    render(<MilestoneList learnerId="L1" cards={buildCards([ver({})])} curricula={curricula} mainId="c1" canWrite orphanIds={[]} />);
    fireEvent.click(screen.getByTestId("ms-remove-m1"));
    const reason = screen.getByTestId("ms-remove-reason-m1");
    fireEvent.change(reason, { target: { value: "lịch thi đổi" } });
    fireEvent.click(screen.getByTestId("ms-remove-go-m1"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByTestId("ms-remove-go-m1") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(reason, { target: { value: "đề đổi lịch, bỏ mốc này" } });
    fireEvent.click(screen.getByTestId("ms-remove-go-m1"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    expect(idOf(f, 1)).not.toBe(idOf(f, 0));
  });
});
