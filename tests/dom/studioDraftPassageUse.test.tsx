import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DraftEditor } from "@/components/studio/DraftEditor";
import { parseDraft } from "@/lib/studio/shape";
import type { StudioDraft, StudioItem } from "@/lib/studio/schema";
import { summarizeDraft } from "@/lib/studio/summary";
import { validateDraft } from "@/lib/studio/validate";
import { CTX_B } from "../unit/fixtures/studio";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(cleanup);

const q = (n: number, passage_ref: string | null): StudioItem => ({
  n, part: "A", kind: "word_form", out_of_app: false, stem: `Sentence ${n} ____ (HIGH).`, options: [], passage_ref, key: "highlights", accepted: [],
  tag_key: "dang-tu", target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: false, review_reason: null,
});
const payload: StudioDraft = {
  parts: [{ key: "A", name: "A · Review 7: word formation · tr.120", instructions: "Use the word given." }],
  passages: [{ ref: "P1", title: "Credit card debt", text: "A recent report (1) ____ (HIGH) …" }, { ref: "P2", title: "Spare", text: "…" }],
  items: [q(1, "P1"), q(2, "P1"), q(3, "P1"), q(4, null)],
};
const raw = {
  id: "d1", learner_id: "l1", family_id: "f1", track_id: "B", title: "Review 7", status: "draft", error_code: null, payload,
  updated_at: "2026-11-16 03:00:00.123456+00", created_at: "2026-11-16T03:00:00Z", approved_at: null, approved_by_member: null,
  template_id: null, template_version: null, frame_id: null, supersedes_draft_id: null, superseded_by: null, stale: false,
  test_file: null, key_file: null, ai_cost_usd: 0, assigned: [],
};

describe("DraftEditor · which questions use each passage", () => {
  it("lists the questions of a passage, warns on an unused one, and follows edits", () => {
    const { view } = parseDraft(raw, { showCost: false });
    const issues = validateDraft(payload, CTX_B);
    render(<DraftEditor initial={{ draft: view, context: CTX_B, issues, summary: summarizeDraft(payload, issues), can_approve: true, gate: null }} />);
    expect(screen.getByTestId("passage-P1-use").textContent).toBe("P1 · Dùng cho câu 1–3");
    expect(screen.getByTestId("passage-P2-use").textContent).toContain("Chưa có câu nào dùng bài đọc này");
    // link question 4 to P1 in its own card
    const card = screen.getByTestId("item-4");
    const select = within(card).getByLabelText("Bài đọc của câu") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "P1" } });
    expect(screen.getByTestId("passage-P1-use").textContent).toBe("P1 · Dùng cho câu 1–4");
    expect(screen.getByTestId("item-4-passage").textContent).toBe("📖 Bài đọc P1");
  });
});
