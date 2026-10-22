import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
};

describe("no stray markdown fences in JSX", () => {
  it("no .tsx file has a line made only of backticks (it would render on screen)", () => {
    const bad: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of walk(join(root, dir))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (/^\s*`{1,3}\s*$/.test(line)) bad.push(`${file}:${i + 1}`);
          });
      }
    }
    expect(bad).toEqual([]);
  });
});
