import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
  it("there is none: a route-level loading boundary streams the page, so a gated page's notFound()/redirect becomes a 200 and a student could see the staff skeleton", () => {
    expect(loadingFilesUnder("app")).toEqual([]);
  });
});
