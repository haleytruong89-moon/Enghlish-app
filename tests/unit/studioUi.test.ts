import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { AiSoftCapBox } from "@/components/settings/AiSoftCapBox";
import { DraftList } from "@/components/studio/DraftList";
import { aiSettingsCopy, studioCopy } from "@/lib/copy/vi";

const S = { enabled: true, monthlyCapUsd: 10, softCapUsd: 8, spentUsd: 8.5, runsMonth: 9, softReached: true, updatedAt: null, learners: [] };

describe("AI soft cap box (parent home)", () => {
  it("shows only at the soft cap, with the amounts", () => {
    expect(renderToStaticMarkup(createElement(AiSoftCapBox, { settings: { ...S, softReached: false, spentUsd: 2 } }))).toBe("");
    expect(renderToStaticMarkup(createElement(AiSoftCapBox, { settings: S }))).toContain(aiSettingsCopy.softWarning("$8.50", "$10.00"));
    expect(renderToStaticMarkup(createElement(AiSoftCapBox, { settings: { ...S, spentUsd: 10 } }))).toContain(aiSettingsCopy.capReached);
  });
});

describe("Studio draft list", () => {
  it("empty text; an approved draft shows its status and how often it was assigned, and links to its page", () => {
    expect(renderToStaticMarkup(createElement(DraftList, { drafts: [] }))).toContain(studioCopy.draftsEmpty);
    const html = renderToStaticMarkup(
      createElement(DraftList, { drafts: [{ id: "d-1", title: "Unit 5", status: "approved", updatedAt: "x", templateId: "B-ST-000001", templateVersion: 1, superseded: false, assigned: 1 }] }),
    );
    expect(html).toContain("Đã duyệt · Đã giao 1 lần");
    expect(html).toContain('href="/studio/drafts/d-1"');
  });
});
