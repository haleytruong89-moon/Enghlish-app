import { describe, expect, it } from "vitest";
import { buildDraftList, type DraftRow } from "@/lib/studio/shape";

const row = (i: number, o: Partial<DraftRow> = {}): DraftRow => ({
  id: `d${String(i).padStart(3, "0")}`, title: `Destination · Unit ${i}`, status: "draft", updated_at: new Date(Date.UTC(2026, 10, 24, 5, 0, i)).toISOString(),
  template_id: null, template_version: null, supersedes_draft_id: null, ...o,
});

describe("Studio drafts list (fix 26/11: no 30-draft cut)", () => {
  it("keeps every draft of a whole book imported at once, newest first; discarded ones left out", () => {
    const rows = [...Array.from({ length: 71 }, (_, i) => row(i + 1)), row(99, { status: "discarded" })];
    const list = buildDraftList(rows, []);
    expect(list).toHaveLength(71);
    expect(list[0]!.id).toBe("d071");
    expect(list.at(-1)!.id).toBe("d001");
    expect(list.some((d) => d.id === "d099")).toBe(false);
  });
  it("superseded = an approved draft replaces it; assigned = times its test was given to this child", () => {
    const list = buildDraftList(
      [row(1, { status: "approved", template_id: "X-ST-000001", template_version: 1 }), row(2, { status: "approved", template_id: "X-ST-000001", template_version: 2, supersedes_draft_id: "d001" }), row(3)],
      [{ template_id: "X-ST-000001", template_version: 1 }, { template_id: "X-ST-000001", template_version: 1 }, { template_id: "X-ST-000001", template_version: 2 }],
    );
    const by = Object.fromEntries(list.map((d) => [d.id, d]));
    expect(by.d001).toMatchObject({ superseded: true, assigned: 2 });
    expect(by.d002).toMatchObject({ superseded: false, assigned: 1 });
    expect(by.d003).toMatchObject({ superseded: false, assigned: 0, templateId: null });
  });
});
