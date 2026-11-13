import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadingCopy } from "@/lib/copy/vi";

const STAFF = ["app/learners/[id]", "app/review", "app/curricula/versions/[id]", "app/studio/drafts/[id]", "app/studio/new", "app/imports/[id]"];

function loadingFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...loadingFilesUnder(p));
    else if (name === "loading.tsx") out.push(p);
  }
  return out;
}

describe("loading.tsx", () => {
  it("exists for the six staff routes and renders the skeleton with 'Đang tải…'", async () => {
    for (const d of STAFF) {
      const file = path.join(d, "loading.tsx");
      expect(existsSync(file), file).toBe(true);
      const mod = (await import(`@/${d}/loading`)) as { default: () => React.ReactElement };
      const html = renderToStaticMarkup(createElement(mod.default));
      expect(html, file).toContain('data-testid="page-skeleton"');
      expect(html, file).toContain(loadingCopy.page);
      expect(html, file).toContain('role="status"');
    }
  });
  it("is never at the app root nor under the child's own screens (the student home lives at /)", () => {
    expect(existsSync("app/loading.tsx")).toBe(false);
    for (const d of ["app/practice", "app/activities"]) if (existsSync(d)) expect(loadingFilesUnder(d)).toEqual([]);
  });
});
