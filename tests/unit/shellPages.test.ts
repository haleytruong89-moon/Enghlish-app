import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
function filesUnder(rel: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (keep(name)) out.push(path.relative(root, p));
    }
  };
  walk(path.join(root, rel));
  return out;
}
const pagesUnder = (rel: string) => filesUnder(rel, (n) => n === "page.tsx");

describe("workdesk shell wiring", () => {
  it("pages of one child render no AppHeader and no <main> (app/learners/[id]/layout.tsx gives both)", () => {
    const files = pagesUnder("app/learners/[id]");
    expect(files.length).toBeGreaterThanOrEqual(17);
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/AppHeader/);
      expect(src, f).not.toMatch(/<main\b/);
    }
  });
  it("student pages never import the staff shell", () => {
    const files = [...pagesUnder("app/practice"), ...pagesUnder("app/activities"), ...filesUnder("components/student", (n) => /\.tsx?$/.test(n))];
    for (const f of files) expect(read(f), f).not.toMatch(/components\/shell/);
  });
});
