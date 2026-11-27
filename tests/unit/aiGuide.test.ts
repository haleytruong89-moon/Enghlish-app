import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/studio/new" }));

import { StudioSteps, type StudioStage } from "@/components/studio/StudioSteps";
import { UploadForm } from "@/components/studio/UploadForm";
import { aiGuideCopy, tourCopy } from "@/lib/copy/vi";
import { aiTourSteps } from "@/lib/tour/aiSteps";

const L = "b0000000-0000-4000-8000-000000000001";

describe("27/11 · Cách dùng AI: the tour points at places Tạo bài từ đề really has", () => {
  it("every on-page step has its element in the upload form or the step bar; Duyệt / Giao are told in the middle", () => {
    const form = renderToStaticMarkup(createElement(UploadForm, { learnerId: L, aiAllowed: true, aiReason: null }));
    const bar = renderToStaticMarkup(createElement(StudioSteps, { stage: "upload", learnerId: L }));
    const steps = aiTourSteps(true);
    expect(steps).toHaveLength(8);
    for (const s of steps.filter((x) => x.target !== "-")) expect(form + bar, s.key).toContain(`data-testid="${s.target}"`);
    expect(steps.filter((x) => x.target === "-").map((x) => x.key)).toEqual(["ai-review", "ai-give"]);
  });
  it("AI off (no consent / over the cap): the start step points at “Soạn tay”", () => {
    const form = renderToStaticMarkup(createElement(UploadForm, { learnerId: L, aiAllowed: false, aiReason: "consent" as never }));
    const start = aiTourSteps(false).find((s) => s.key === "ai-start")!;
    expect(start.target).toBe("studio-manual");
    expect(form).toContain('data-testid="studio-manual"');
  });
  it("the app tour's Giao bài step tells where the AI help is", () => {
    expect(tourCopy.steps.assign.body).toContain(aiGuideCopy.open);
  });
});

describe("27/11 · the three-step bar", () => {
  const at = (stage: StudioStage) => renderToStaticMarkup(createElement(StudioSteps, { stage, learnerId: L }));
  it.each([
    ["upload", "now", "later", "later"], ["extracting", "done", "now", "later"], ["draft", "done", "now", "later"], ["failed", "done", "now", "later"],
    ["approved", "done", "done", "now"], ["assigned", "done", "done", "done"],
  ] as const)("%s: step states %s / %s / %s, its own line, the guide link", (stage, a, b, c) => {
    const h = at(stage);
    expect(h).toMatch(new RegExp(`data-testid="studio-step-1" data-state="${a}"`));
    expect(h).toMatch(new RegExp(`data-testid="studio-step-2" data-state="${b}"`));
    expect(h).toMatch(new RegExp(`data-testid="studio-step-3" data-state="${c}"`));
    expect(h).toContain(aiGuideCopy.bar[stage]);
    expect(h).toContain(`href="/learners/${L}/help/ai"`);
  });
});
