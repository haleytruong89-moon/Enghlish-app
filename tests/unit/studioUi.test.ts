import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { AiSoftCapBox } from "@/components/settings/AiSoftCapBox";
import { aiSettingsCopy } from "@/lib/copy/vi";

const S = { enabled: true, monthlyCapUsd: 10, softCapUsd: 8, spentUsd: 8.5, runsMonth: 9, softReached: true, updatedAt: null, learners: [] };

describe("AI soft cap box (parent home)", () => {
  it("shows only at the soft cap, with the amounts", () => {
    expect(renderToStaticMarkup(createElement(AiSoftCapBox, { settings: { ...S, softReached: false, spentUsd: 2 } }))).toBe("");
    expect(renderToStaticMarkup(createElement(AiSoftCapBox, { settings: S }))).toContain(aiSettingsCopy.softWarning("$8.50", "$10.00"));
    expect(renderToStaticMarkup(createElement(AiSoftCapBox, { settings: { ...S, spentUsd: 10 } }))).toContain(aiSettingsCopy.capReached);
  });
});
