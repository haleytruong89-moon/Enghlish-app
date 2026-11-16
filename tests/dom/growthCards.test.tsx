import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CandoCard } from "@/components/student/journey/CandoCard";
import { LevelsCard } from "@/components/student/journey/LevelsCard";
import { ThenNowCard } from "@/components/student/journey/ThenNowCard";
import { ThenNowPicker } from "@/components/workdesk/ThenNowPicker";
import { buildCando } from "@/lib/student/cando";
import { buildLevelsView } from "@/lib/student/levels";
import type { ThenNowCandidates } from "@/lib/student/growthShape";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); refresh.mockReset(); });

/** Text outside the dates and the counts of the child's own work: nothing score-like may be there. */
const outside = (el: Element): string => {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll('[data-count="work"], time').forEach((n) => n.remove());
  return c.textContent ?? "";
};
const NO_SCORE = /\d\s*\/\s*\d|%|(^|[^\p{L}])điểm(?!\p{L})|đúng\s+\d|xếp hạng|streak|đạt/iu;

describe("LevelsCard", () => {
  const view = buildLevelsView([
    { key: "grammar", name: "Ngữ pháp", scale: "cefr", level: "B2", on: "2026-11-07T03:00:00Z" },
    { key: "vocab", name: "Từ vựng", scale: "cefr", level: null, on: null },
    { key: "thinking", name: "Tư duy", scale: "task_level", level: "3", on: "2026-11-07T03:00:00Z" },
  ]);
  it("shows the confirmed level name, says 'not confirmed' for the rest, never the Tư duy domain, no 'Hướng tới' block", () => {
    const { container } = render(<LevelsCard view={view} />);
    expect(screen.getByTestId("level-name-grammar").textContent).toBe("B2");
    expect(screen.getByTestId("level-tile-vocab").textContent).toMatch(/chưa xác nhận/);
    expect(screen.queryByTestId("level-tile-thinking")).toBeNull();
    expect(container.textContent).not.toContain("Tư duy");
    expect(screen.queryByTestId("levels-target")).toBeNull();
    expect(container.textContent).not.toContain("Hướng tới");
    expect(outside(container)).not.toMatch(NO_SCORE);
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-07");
  });
  it("no domains at all → the card is left out", () => {
    const { container } = render(<LevelsCard view={buildLevelsView([])} />);
    expect(container.innerHTML).toBe("");
  });
  it("nothing confirmed yet: one soft line, every tile says the tutor has not confirmed", () => {
    const { container } = render(<LevelsCard view={buildLevelsView([{ key: "grammar", name: "Ngữ pháp", scale: "cefr", level: null, on: null }])} />);
    expect(container.textContent).toMatch(/chưa xác nhận cấp nào/);
    expect(screen.getByTestId("level-tile-grammar").getAttribute("data-confirmed")).toBe("no");
  });
});

describe("CandoCard", () => {
  const items = buildCando([{ code: null, name: "Thì hiện tại hoàn thành (since / for)", at: "2026-11-15T03:00:00Z" }, { code: null, name: "Viết đoạn nêu ý kiến", at: "2026-10-01T03:00:00Z" }], "2026-11-16T03:00:00Z");
  it("one card per item (knowledge item: 'Mình đã nắm chắc:'; skill: 'Mình đã tự làm được:'), the newest marked 'Mới', words and dates only", () => {
    const { container } = render(<CandoCard items={items} />);
    const cards = screen.getAllByTestId("cando-item");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain("Mình đã nắm chắc:");
    expect(cards[0]!.textContent).not.toContain("Mình đã tự làm được:");
    expect(cards[0]!.textContent).toContain("Mới");
    expect(cards[1]!.textContent).not.toContain("Mới");
    expect(cards[0]!.getAttribute("data-new")).toBe("yes");
    expect(screen.getByTestId("cando-count").textContent).toBe("2 điều");
    expect(outside(container)).not.toMatch(NO_SCORE);
    expect(container.textContent).not.toMatch(/INDEPENDENT|TRANSFERABLE|⚑|chờ xác nhận/i);
  });
  it("a knowledge item says 'Mình đã nắm chắc:', a skill says 'Mình đã tự làm được:'", () => {
    const mixed = buildCando([{ code: "A-T1-TEXT-R", name: "Đọc hiểu bài ngắn", at: "2026-11-15T03:00:00Z" }, { code: null, name: "Hiện tại đơn", at: "2026-11-14T03:00:00Z" }], "2026-11-16T03:00:00Z");
    render(<CandoCard items={mixed} />);
    const [skill, point] = screen.getAllByTestId("cando-item");
    expect(skill!.textContent).toContain("Mình đã tự làm được:");
    expect(point!.textContent).toContain("Mình đã nắm chắc:");
    expect(point!.textContent).not.toContain("tự làm được");
  });
  it("no cards: a soft invitation, no count", () => {
    render(<CandoCard items={[]} />);
    expect(screen.getByTestId("cando-empty")).toBeTruthy();
    expect(screen.queryByTestId("cando-count")).toBeNull();
  });
});

describe("ThenNowCard", () => {
  it("two pieces side by side with their dates and the tutor's note", () => {
    const { container } = render(<ThenNowCard view={{ then: { on: "2026-09-15", text: "I like cat." }, now: { on: "2026-11-13", text: "In my opinion, cats are useful." }, note: "Câu dài hơn nhiều." }} />);
    expect(screen.getByTestId("then-piece").textContent).toContain("I like cat.");
    expect(screen.getByTestId("now-piece").textContent).toContain("In my opinion");
    expect(screen.getByTestId("then-now-note").textContent).toContain("Câu dài hơn nhiều.");
    expect(outside(container)).not.toMatch(/\d\s*\/\s*\d|%|đạt/i);
  });
  it("no note → no note line", () => {
    render(<ThenNowCard view={{ then: { on: "2026-09-15", text: "A" }, now: { on: "2026-11-13", text: "B" }, note: null }} />);
    expect(screen.queryByTestId("then-now-note")).toBeNull();
  });
});

describe("ThenNowPicker (the tutor; the parent reads)", () => {
  const view: ThenNowCandidates = {
    candidates: [
      { id: "n", on: "2026-11-13", title: "Technology", preview: "In my opinion, technology is useful.", provenance: "in_app" },
      { id: "o", on: "2026-09-15", title: null, preview: "I think technology is good for student.", provenance: "in_app" },
      { id: "m", on: "2026-11-13", title: null, preview: "Same day as the new one.", provenance: "pasted" },
    ],
    current: null,
  };
  const ok = () => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "p", replayed: false }), { status: 201 }));

  it("the parent only reads: no form, a line that says only the tutor picks", () => {
    render(<ThenNowPicker learnerId="L" alias="Nguyên" view={view} canEdit={false} />);
    expect(screen.queryByTestId("then-now-form")).toBeNull();
    expect(screen.getByTestId("then-now-picker").textContent).toMatch(/Phụ huynh chỉ xem/);
  });
  it("fewer than two pieces: an explanation instead of the form", () => {
    render(<ThenNowPicker learnerId="L" alias="Nguyên" view={{ candidates: [view.candidates[0]!], current: null }} canEdit />);
    expect(screen.getByTestId("then-now-empty")).toBeTruthy();
    expect(screen.queryByTestId("then-now-form")).toBeNull();
  });
  it("saving needs two pieces on different days, old first; a wrong order says why and stays disabled", () => {
    render(<ThenNowPicker learnerId="L" alias="Nguyên" view={view} canEdit />);
    const save = screen.getByTestId("then-now-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("then-select"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("now-select"), { target: { value: "o" } });
    expect(screen.getByTestId("then-now-order")).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("now-select"), { target: { value: "m" } }); // same day as "then"
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("then-select"), { target: { value: "o" } });
    fireEvent.change(screen.getByTestId("now-select"), { target: { value: "n" } });
    expect(screen.queryByTestId("then-now-order")).toBeNull();
    expect(save.disabled).toBe(false);
  });
  it("sends the pair, the note and a client id; the same unchanged retry reuses the id; success refreshes the page", async () => {
    const f = ok();
    render(<ThenNowPicker learnerId="L" alias="Nguyên" view={view} canEdit />);
    fireEvent.change(screen.getByTestId("then-select"), { target: { value: "o" } });
    fireEvent.change(screen.getByTestId("now-select"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("then-now-note-input"), { target: { value: "  Hai tháng đấy!  " } });
    fireEvent.click(screen.getByTestId("then-now-save"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/learners/L/then-now");
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent).toMatchObject({ then_id: "o", now_id: "n", note: "Hai tháng đấy!", status: "shown" });
    expect(String(sent.client_id).length).toBeGreaterThanOrEqual(8);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByTestId("then-now-msg").textContent).toMatch(/Đã lưu/);
  });
  it("a refusal from the server is shown in words (score-like note), nothing refreshes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "score_words" }), { status: 400 }));
    render(<ThenNowPicker learnerId="L" alias="Nguyên" view={view} canEdit />);
    fireEvent.change(screen.getByTestId("then-select"), { target: { value: "o" } });
    fireEvent.change(screen.getByTestId("now-select"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("then-now-note-input"), { target: { value: "8/10" } });
    fireEvent.click(screen.getByTestId("then-now-save"));
    await waitFor(() => expect(screen.getByTestId("then-now-msg").textContent).toMatch(/không được ghi điểm/));
    expect(refresh).not.toHaveBeenCalled();
  });
  it("a shown pick has a 'hide' button that sends the same pair with status hidden", async () => {
    const f = ok();
    render(<ThenNowPicker learnerId="L" alias="Nguyên" view={{ ...view, current: { id: "p", thenId: "o", nowId: "n", note: "Nhắn", status: "shown", at: "2026-11-14T03:00:00Z" } }} canEdit />);
    expect(screen.getByTestId("then-now-state").textContent).toMatch(/Em đang thấy/);
    fireEvent.click(screen.getByTestId("then-now-hide"));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(JSON.parse(String((f.mock.calls[0] as [string, RequestInit])[1].body))).toMatchObject({ then_id: "o", now_id: "n", note: "Nhắn", status: "hidden" });
  });
  it("a retyped paper piece is labelled and offered only as the old piece, never as the new one", () => {
    const withPaper: ThenNowCandidates = { candidates: [...view.candidates, { id: "p", on: "2026-08-01", title: null, preview: "Typed from paper.", provenance: "manual_import" }], current: null };
    render(<ThenNowPicker learnerId="L" alias="Nguyên" view={withPaper} canEdit />);
    const thenOpts = Array.from(screen.getByTestId("then-select").querySelectorAll("option")).map((o) => o.textContent ?? "");
    const nowOpts = Array.from(screen.getByTestId("now-select").querySelectorAll("option")).map((o) => o.textContent ?? "");
    expect(thenOpts.some((t) => t.includes("bài giấy gõ lại"))).toBe(true);
    expect(nowOpts.some((t) => t.includes("bài giấy gõ lại"))).toBe(false);
  });
  it("tap targets are at least 44px (min-h-11)", () => {
    render(<ThenNowPicker learnerId="L" alias="Nguyên" view={{ ...view, current: { id: "p", thenId: "o", nowId: "n", note: null, status: "shown", at: "2026-11-14T03:00:00Z" } }} canEdit />);
    for (const id of ["then-now-save", "then-now-hide", "then-select", "now-select"]) expect(screen.getByTestId(id).className, id).toContain("min-h-11");
  });
});
