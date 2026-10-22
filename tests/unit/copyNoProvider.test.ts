import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("no provider name in UI text", () => {
  it("lib/copy/vi.ts never says TOMO", () => {
    const vi = readFileSync(new URL("../../lib/copy/vi.ts", import.meta.url), "utf8");
    expect(vi).not.toMatch(/tomo/i);
  });
  it("no component or page renders a literal TOMO", () => {
    const out = execSync("grep -rIl --include=*.tsx -i 'tomo' app components || true", { encoding: "utf8" });
    expect(out.trim()).toBe("");
  });
});
