import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DraftEditor } from "@/components/studio/DraftEditor";
import { studioCopy } from "@/lib/copy/vi";
import { parseDraft } from "@/lib/studio/shape";
import type { StudioDraft, StudioItem } from "@/lib/studio/schema";
import { summarizeDraft } from "@/lib/studio/summary";
import { validateDraft } from "@/lib/studio/validate";
import { CTX_B } from "../unit/fixtures/studio";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const q = (n: number, part: string, over: Partial<StudioItem> = {}): StudioItem => ({
  n, part, kind: "gap", out_of_app: false, stem: `Sentence ${n} ____.`, options: [], passage_ref: null, key: `k${n}`, accepted: [],
  tag_key: "dang-tu", target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: false, review_reason: null, ...over,
});
/** The tutor's file in small: M 1–2, N 3–4, O 5–6, P 7–8. */
const FOUR: StudioDraft = {
  parts: ["M", "N", "O", "P"].map((key) => ({ key, name: `${key} · Word formation`, instructions: "" })),
  passages: [],
  items: [q(1, "M"), q(2, "M"), q(3, "N"), q(4, "N"), q(5, "O"), q(6, "O"), q(7, "P"), q(8, "P")],
};
function open(payload: StudioDraft) {
  const raw = {
    id: "d1", learner_id: "l1", family_id: "f1", track_id: "B", title: "Word formation (M–P)", status: "draft", error_code: null, payload,
    updated_at: "2026-11-20 07:00:00.123456+00", created_at: "2026-11-20T07:00:00Z", approved_at: null, approved_by_member: null,
    template_id: null, template_version: null, frame_id: null, supersedes_draft_id: null, superseded_by: null, stale: false,
    test_file: null, key_file: null, ai_cost_usd: 0, assigned: [],
  };
  const { view } = parseDraft(raw, { showCost: false });
  const issues = validateDraft(payload, CTX_B);
  render(<DraftEditor initial={{ draft: view, context: CTX_B, issues, summary: summarizeDraft(payload, issues), can_approve: true, gate: null }} />);
}
const stemsOnScreen = () => screen.getAllByTestId(/^item-\d+$/).map((li) => `${li.getAttribute("data-testid")!.slice(5)}:${(within(li).getByLabelText(studioCopy.stem) as HTMLTextAreaElement).value}`);
const fetchOk = (body: unknown = { updated_at: "2026-11-20 07:05:00.000001+00" }) => {
  const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
};

describe("Duyệt đề · xóa phần, tự đánh số lại", () => {
  it("Xóa phần asks first; after yes the part and its questions are gone, the rest is 1..N and Duyệt stays possible", async () => {
    open(FOUR);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByTestId("part-M-remove"));
    expect(confirm).toHaveBeenCalledWith(studioCopy.removePartConfirm("M", 2));
    expect(screen.getAllByTestId(/^item-\d+$/)).toHaveLength(8);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("part-M-remove"));
    fireEvent.click(screen.getByTestId("part-O-remove"));
    expect(screen.queryByTestId("part-M")).toBeNull();
    expect(screen.queryByTestId("part-O")).toBeNull();
    expect(stemsOnScreen()).toEqual(["1:Sentence 3 ____.", "2:Sentence 4 ____.", "3:Sentence 7 ____.", "4:Sentence 8 ____."]);
    expect(screen.queryByTestId("approve-blocked")).toBeNull();
    expect((screen.getByTestId("studio-approve") as HTMLButtonElement).disabled).toBe(false);
    // what is saved is the renumbered draft
    const f = fetchOk();
    fireEvent.click(screen.getByTestId("studio-save"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { payload: StudioDraft };
    expect(sent.payload.parts.map((p) => p.key)).toEqual(["N", "P"]);
    expect(sent.payload.items.map((i) => [i.n, i.part, i.key])).toEqual([[1, "N", "k3"], [2, "N", "k4"], [3, "P", "k7"], [4, "P", "k8"]]);
  });

  it("Xóa câu closes the gap; + Câu in a middle part lands at the end of that part; a moved question goes to the end of its new part", () => {
    open(FOUR);
    fireEvent.click(screen.getByTestId("item-3-remove"));
    expect(stemsOnScreen().slice(0, 4)).toEqual(["1:Sentence 1 ____.", "2:Sentence 2 ____.", "3:Sentence 4 ____.", "4:Sentence 5 ____."]);
    fireEvent.click(screen.getByTestId("part-M-add"));
    expect(within(screen.getByTestId("part-M")).getAllByTestId(/^item-\d+$/).map((li) => li.getAttribute("data-testid"))).toEqual(["item-1", "item-2", "item-3"]); // book order: the new question is last of its part
    expect(screen.queryByTestId("issue-draft-part_not_contiguous")).toBeNull();
    expect(screen.queryByTestId("issue-draft-numbering")).toBeNull();
    fireEvent.click(screen.getByTestId("item-3-remove"));
    fireEvent.change(within(screen.getByTestId("item-1")).getByLabelText(studioCopy.part), { target: { value: "P" } });
    expect(within(screen.getByTestId("part-P")).getAllByTestId(/^item-\d+$/).map((li) => (within(li).getByLabelText(studioCopy.stem) as HTMLTextAreaElement).value)).toEqual(["Sentence 7 ____.", "Sentence 8 ____.", "Sentence 1 ____."]);
    expect(screen.queryByTestId("approve-blocked")).toBeNull();
  });

  it("a draft that arrives with broken numbers offers Đánh số lại; an edit never writes to two questions with the same number", () => {
    open({ ...FOUR, items: [q(1, "M"), q(2, "M"), q(2, "N", { stem: "the other two" }), q(9, "P")] });
    expect(screen.getByTestId("issue-draft-numbering")).toBeTruthy();
    const cards = screen.getAllByTestId("item-2");
    fireEvent.change(within(cards[0]!).getByLabelText(studioCopy.stem), { target: { value: "changed" } });
    expect(screen.getAllByTestId("item-2").map((li) => (within(li).getByLabelText(studioCopy.stem) as HTMLTextAreaElement).value).sort()).toEqual(["changed", "the other two"]);
    fireEvent.click(screen.getByTestId("studio-renumber"));
    expect(screen.queryByTestId("issue-draft-numbering")).toBeNull();
    expect(stemsOnScreen()).toEqual(["1:Sentence 1 ____.", "2:changed", "3:the other two", "4:Sentence 9 ____."]);
  });

  it("typing in a question keeps the keyboard in the field; + Phần and + Câu stop at the limits of a draft", () => {
    open(FOUR);
    const stem = within(screen.getByTestId("item-4")).getByLabelText(studioCopy.stem) as HTMLTextAreaElement;
    stem.focus();
    fireEvent.change(stem, { target: { value: "Sentence 4 changed" } });
    expect(document.activeElement).toBe(stem);
    expect(stem.isConnected).toBe(true);
    cleanup();
    open({ ...FOUR, parts: Array.from({ length: 30 }, (_, k) => ({ key: `K${k}`, name: "x", instructions: "" })), items: Array.from({ length: 300 }, (_, k) => q(k + 1, "K0")) });
    expect((screen.getByTestId("studio-add-part") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("part-K0-add") as HTMLButtonElement).disabled).toBe(true);
  });

  it("+ Phần never reuses a letter", () => {
    open({ ...FOUR, parts: ["A", "B", "D"].map((key) => ({ key, name: key, instructions: "" })), items: [q(1, "A")] });
    fireEvent.click(screen.getByTestId("studio-add-part"));
    expect(screen.getByTestId("part-C")).toBeTruthy();
    expect(screen.queryByTestId("issue-draft-duplicate_part")).toBeNull();
  });
});

describe("Duyệt đề · chặn Duyệt nói rõ lỗi, Bỏ bản nháp hỏi lại", () => {
  it("lists what blocks Duyệt with the question number; fixing it clears the list", () => {
    open({ ...FOUR, items: [q(1, "M"), q(2, "M", { key: null }), q(3, "N", { tag_key: null })] });
    const box = screen.getByTestId("approve-blocked");
    expect(box.textContent).toContain(studioCopy.approveBlocked(2));
    expect(screen.getByTestId("blocked-2-missing_key").textContent).toBe("Câu 2: Thiếu đáp án");
    expect(screen.getByTestId("blocked-3-no_tag").textContent).toBe("Câu 3: Chọn một nhãn cho câu này.");
    expect((screen.getByTestId("studio-approve") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("blocked-2-missing_key")); // scrolls (must not throw where scrollIntoView is missing) and moves the keyboard to the question
    expect(screen.getByTestId("item-2").contains(document.activeElement)).toBe(true);
    fireEvent.change(screen.getByTestId("item-2-key"), { target: { value: "height" } });
    fireEvent.change(screen.getByTestId("item-3-tag"), { target: { value: "dang-tu" } });
    expect(screen.queryByTestId("approve-blocked")).toBeNull();
  });

  it("more than eight blocking issues: the first eight and a count of the rest", () => {
    open({ ...FOUR, parts: [FOUR.parts[0]!], items: Array.from({ length: 11 }, (_, k) => q(k + 1, "M", { key: null })) });
    expect(screen.getAllByTestId(/^blocked-\d+-missing_key$/)).toHaveLength(8);
    expect(screen.getByTestId("approve-blocked").textContent).toContain(studioCopy.blockedMore(3));
  });

  it("Bỏ bản nháp asks first and only then discards", async () => {
    open(FOUR);
    const f = fetchOk({});
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByTestId("studio-discard"));
    expect(confirm).toHaveBeenCalledWith(studioCopy.discardConfirm);
    expect(f).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("studio-discard"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toBe("/api/studio/drafts/d1/discard");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("Lên / Xuống change the order inside a part; the list stays in book order while a question is being fixed", () => {
    open({ ...FOUR, items: [q(1, "M"), q(2, "M", { key: null }), q(3, "N"), q(4, "N")] });
    expect(screen.getAllByTestId(/^item-\d+$/).map((li) => li.getAttribute("data-testid"))).toEqual(["item-1", "item-2", "item-3", "item-4"]);
    expect((screen.getByTestId("item-1-up") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("item-2-down") as HTMLButtonElement).disabled).toBe(true); // last of M: never into N
    fireEvent.click(screen.getByTestId("item-2-up"));
    expect(stemsOnScreen().slice(0, 2)).toEqual(["1:Sentence 2 ____.", "2:Sentence 1 ____."]);
    fireEvent.click(screen.getByTestId("only-flagged"));
    expect(screen.queryByTestId("item-1-up")).toBeNull(); // no moving inside a filtered list
  });
});

