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
    const files = [...pagesUnder("app/activities"), ...filesUnder("components/student", (n) => /\.tsx?$/.test(n))];
    for (const f of files) expect(read(f), f).not.toMatch(/components\/shell/);
  });
  it("staff pages outside /learners/[id] use the shell and no AppHeader", () => {
    for (const f of [
      "app/review/page.tsx", "app/review/[episodeId]/page.tsx", "app/review/skills/page.tsx", "app/review/studio/page.tsx", "app/imports/[id]/page.tsx",
      "app/studio/new/page.tsx", "app/studio/drafts/[id]/page.tsx", "app/curricula/versions/[id]/page.tsx", "app/feedback/page.tsx", "app/settings/ai/page.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toMatch(/StaffShell/);
      expect(src, f).toMatch(/requireShell\(|withShell\(/);
      expect(src, f).not.toMatch(/AppHeader/);
      expect(src, f).not.toMatch(/<main\b/);
    }
  });
  it("the home page keeps its student branch (the child's desk: StudentDeskShell + TodayView)", () => {
    const src = read("app/page.tsx");
    expect(src).toMatch(/<StudentDeskShell\b/);
    expect(src).toMatch(/<TodayView\b/);
  });
  it("every page of the child's desk uses the desk frame and never the staff shell", () => {
    for (const f of ["app/page.tsx", "app/seen/page.tsx", "app/done/page.tsx", "app/done/[ref]/page.tsx", "app/journey/page.tsx", "app/goal/page.tsx", "app/submit/[assignmentId]/page.tsx"]) {
      expect(read(f), f).toMatch(/<StudentDeskShell\b/);
    }
    for (const f of [...pagesUnder("app/seen"), ...pagesUnder("app/done"), ...pagesUnder("app/journey"), ...pagesUnder("app/goal"), ...pagesUnder("app/submit"), ...filesUnder("components/student", (n) => /\.tsx?$/.test(n))]) {
      expect(read(f), f).not.toMatch(/components\/shell/);
    }
  });
  it("/practice only redirects to the desk", () => {
    expect(read("app/practice/page.tsx")).toMatch(/redirect\("\/"\)/);
  });
});

describe("detail pages read the shell in parallel with their own record", () => {
  it("never wait for the record and then call requireShell after it", () => {
    for (const f of ["app/curricula/versions/[id]/page.tsx", "app/studio/drafts/[id]/page.tsx", "app/imports/[id]/page.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/withShell\(/);
      expect(src, f).not.toMatch(/await requireShell\(/);
    }
  });
  it("the gate and the shell of the other staff pages start together (Promise.all)", () => {
    for (const f of ["app/review/page.tsx", "app/review/skills/page.tsx", "app/review/studio/page.tsx", "app/studio/new/page.tsx"]) {
      expect(read(f), f).toMatch(/Promise\.all\(\[authorize\w+\([^\n]*requireShell\(/);
    }
  });
});
