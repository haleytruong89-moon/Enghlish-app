import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

type ListeningFile = { track: string; group_vi: string; tags: { key: string; label_vi: string; group_key: string }[] };
const read = (f: string) => JSON.parse(readFileSync(path.join(CONTENT_DIR, "tags", f), "utf8")) as ListeningFile;
const sm1 = JSON.parse(readFileSync(path.join(CONTENT_DIR, "skill_map", "SM-1.json"), "utf8")) as { domains: { key: string; groups: { key: string }[] }[] };
const sql = readFileSync(path.join(MIGRATIONS_DIR, "0026_curriculum.sql"), "utf8");

describe("listening question-type tags (W2, R7)", () => {
  const files = ["listening_A.json", "listening_B.json"].map(read);
  it("Track A has 5 and Track B 8, group 'Kỹ năng nghe', every group_key a group of the Nghe domain of SM-1", () => {
    const listening = new Set(sm1.domains.find((d) => d.key === "listening")!.groups.map((g) => g.key));
    expect(files.map((f) => [f.track, f.group_vi, f.tags.length])).toEqual([["A", "Kỹ năng nghe", 5], ["B", "Kỹ năng nghe", 8]]);
    for (const f of files) for (const t of f.tags) {
      expect(t.key).toMatch(/^nghe-[a-z0-9-]+$/);
      expect(listening.has(t.group_key), t.key).toBe(true);
      expect(t.label_vi).toMatch(/^Nghe · [A-Z][^—]+ — \S/);
    }
  });
  it("migration 0026 seeds exactly these rows, in this order", () => {
    const rows = [...sql.matchAll(/\('([AB])', (\d+), '(nghe-[a-z0-9-]+)', '((?:[^']|'')+)', '([a-z-]+)'\)/g)].map((m) => ({
      track: m[1], ord: Number(m[2]), key: m[3], label_vi: m[4]!.replace(/''/g, "'"), group_key: m[5],
    }));
    const want = files.flatMap((f) => f.tags.map((t, i) => ({ track: f.track, ord: i + 1, ...t })));
    expect(rows).toEqual(want);
  });
});
