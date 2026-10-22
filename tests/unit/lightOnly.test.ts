import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("always-light theme", () => {
  it("declares only-light in the viewport (meta color-scheme)", () => {
    expect(read("app/layout.tsx")).toMatch(/colorScheme:\s*"only light"/);
  });
  it("declares only-light on :root and keeps form controls light", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*only light/);
    // inside @layer base, so utilities such as bg-white / bg-paper still override it
    expect(css).toMatch(/@layer base\s*\{\s*input,\s*select,\s*textarea\s*\{[^}]*background-color:\s*#ffffff/);
  });
  it("has no dark-mode variants anywhere in app/ or components/", () => {
    // Guard: nobody adds dark: classes or a prefers-color-scheme: dark block later.
    const out = execSync("grep -rlE 'dark:|prefers-color-scheme:\\s*dark' app components || true", { encoding: "utf8" });
    expect(out.trim()).toBe("");
  });
});
