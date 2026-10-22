import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdjustForm } from "@/components/levels/AdjustForm";
import { BaselineForm } from "@/components/levels/BaselineForm";
import { ExternalResultForm } from "@/components/levels/ExternalResultForm";
import { clientIdAfter, describedBy } from "@/lib/levels/form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const L = "b0000000-0000-4000-8000-000000000001";

describe("clientIdAfter", () => {
  const fresh = () => "new-id-0000";
  it("a 409 gives the next try a new client id; success, other errors and a lost answer keep it", () => {
    expect(clientIdAfter({ ok: false, status: 409, error: "conflict" }, "old-id-0000", fresh)).toBe("new-id-0000");
    expect(clientIdAfter({ ok: false, status: 409, error: "already_confirmed" }, "old-id-0000", fresh)).toBe("new-id-0000");
    for (const status of [0, 400, 403, 404, 500]) expect(clientIdAfter({ ok: false, status, error: "x" }, "old-id-0000", fresh)).toBe("old-id-0000");
    expect(clientIdAfter({ ok: true, status: 201, body: {} }, "old-id-0000", fresh)).toBe("old-id-0000");
  });
});

describe("describedBy", () => {
  it("joins the ids that exist", () => {
    expect(describedBy("a", false, "b", null, undefined, "")).toBe("a b");
    expect(describedBy(false, null)).toBeUndefined();
  });
});

describe("forms point their help text at the field (aria-describedby)", () => {
  it("adjust: the reason field is described by its hint", () => {
    const html = render(createElement(AdjustForm, { learnerId: L, domain: { key: "writing", name: "Viết", scale: "cefr", current: "B1+" } }));
    expect(html).toMatch(/<textarea[^>]*aria-describedby="adjust-reason-hint"/);
    expect(html).toContain('id="adjust-reason-hint"');
  });

  it("baseline: each domain select is described by its 'ước lượng' line", () => {
    const html = render(createElement(BaselineForm, { learnerId: L, rows: [{ key: "grammar", name: "Ngữ pháp", scale: "cefr", assumed: "B2" }] }));
    expect(html).toMatch(/data-testid="baseline-grammar"[^>]*aria-describedby="baseline-grammar-hint"|aria-describedby="baseline-grammar-hint"[^>]*data-testid="baseline-grammar"/);
    expect(html).toContain('id="baseline-grammar-hint"');
  });

  it("external: the domain group is described by its help line; the score by its hint; the sheet by the correction hint when editing", () => {
    const base = { learnerId: L, domains: [{ key: "reading" as const, name: "Đọc" }], today: "2026-10-22", minDate: "2016-10-25" };
    const html = render(createElement(ExternalResultForm, base));
    expect(html).toMatch(/<fieldset[^>]*aria-describedby="external-domains-help"/);
    expect(html).toContain('id="external-domains-help"');
    expect(html).toMatch(/aria-describedby="external-score-hint"/);
    expect(html).toContain('id="external-score-hint"');
    expect(html).not.toContain("external-file-hint");
    const edit = render(createElement(ExternalResultForm, { ...base, edit: { id: "e1", exam: "FCE", takenOn: "2026-09-12", scoreText: "165", domains: ["reading"], note: null } }));
    expect(edit).toMatch(/data-testid="external-file"[^>]*aria-describedby="external-file-hint"|aria-describedby="external-file-hint"[^>]*data-testid="external-file"/);
    expect(edit).toContain('id="external-file-hint"');
  });
});
