import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { shellCopy } from "@/lib/copy/vi";
import { planTabs, progressTabs } from "@/lib/shell/tabs";

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

describe("Tiến bộ tabs", () => {
  it("Tổng quan · Theo Unit · Mục kiến thức · Cấp và kỹ năng", () => {
    expect(progressTabs("L1").map((t) => [t.key, t.href])).toEqual([
      ["overview", "/learners/L1/progress"], ["unit", "/learners/L1/progress?tab=unit"], ["tag", "/learners/L1/progress?tab=tag"], ["levels", "/learners/L1/levels"],
    ]);
    expect(progressTabs("L1").map((t) => t.label)).toEqual(["Tổng quan", "Theo Unit", "Mục kiến thức", "Cấp và kỹ năng"]);
  });
  it("Cấp và kỹ năng has a second row of its three pages", async () => {
    const { ProgressTabs } = await import("@/components/progress/ProgressTabs");
    const h = renderToStaticMarkup(createElement(ProgressTabs, { learnerId: "L1", current: "levels", sub: "weak" }));
    for (const k of ["levels", "weak", "targets"]) expect(h).toContain(`href="/learners/L1/${k}"`);
    expect(h).toMatch(/data-testid="levels-sub-weak"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="levels-sub-weak"/);
    expect(h).toMatch(/aria-current="page"[^>]*data-testid="section-tab-levels"/);
  });
});
