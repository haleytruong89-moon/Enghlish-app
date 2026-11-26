import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { shellCopy } from "@/lib/copy/vi";
import { planTabs } from "@/lib/shell/tabs";

describe("Kế hoạch tabs", () => {
  it("Giáo trình · Lộ trình, about this child", () => {
    expect(planTabs("L1")).toEqual([
      { key: "curricula", label: shellCopy.planTabs.curricula, href: "/learners/L1/curricula" },
      { key: "roadmap", label: shellCopy.planTabs.roadmap, href: "/learners/L1/roadmap" },
    ]);
  });
  it("renders links, marks the current one only, ≥ 44 px", () => {
    const h = renderToStaticMarkup(createElement(SectionTabs, { label: "Kế hoạch", tabs: planTabs("L1"), current: "roadmap" }));
    expect(h.match(/aria-current="page"/g)).toHaveLength(1);
    expect(h).toMatch(/aria-current="page"[^>]*data-testid="section-tab-roadmap"/);
    expect(h).toContain("min-h-11");
  });
});
