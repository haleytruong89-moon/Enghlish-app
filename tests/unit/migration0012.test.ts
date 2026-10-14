import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "@/lib/config/content";
import { loadContentItems } from "@/lib/config/versions";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0012_track_b_step_sources.sql"), "utf8");
const items = loadContentItems(CONTENT_DIR);
const templates = new Map(items.inquiryTemplates.map((i) => [i.data.id, i.data]));

const rows = [...sql.matchAll(/^\s*\('([^']+)', (\d+), '([^']+)', (\d+)\)/gm)].map((m) => ({
  template: m[1] as string,
  step: Number(m[2]),
  source: m[3] as string,
  position: Number(m[4]),
}));

describe("0012_track_b_step_sources.sql", () => {
  it("is idempotent and ends with its schema_migrations row", () => {
    expect(sql).toContain("on conflict do nothing;");
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0012') on conflict do nothing;")).toBe(true);
    expect(sql).toMatch(/insert into english\.template_step_sources/);
  });

  it("has 31 rows, only for B-W1..B-W4, each pointing at a real step and a real source of the same template", () => {
    expect(rows).toHaveLength(31);
    const weeks = new Set(["B-W1-HOMEWORK", "B-W2-PHONES", "B-W3-TRANSPORT", "B-W4-AI-HOMEWORK"]);
    for (const r of rows) {
      expect(weeks.has(r.template), r.template).toBe(true);
      const t = templates.get(r.template);
      expect(t, r.template).toBeDefined();
      expect(t?.steps.some((s) => s.step_no === r.step), `${r.template}#${r.step}`).toBe(true);
      expect(t?.sources.some((s) => s.id === r.source), `${r.template} ${r.source}`).toBe(true);
    }
  });

  it("has no duplicate (template, step, source) and positions run 1..n within a step", () => {
    const keys = rows.map((r) => `${r.template}#${r.step}#${r.source}`);
    expect(new Set(keys).size).toBe(keys.length);
    const byStep = new Map<string, number[]>();
    for (const r of rows) byStep.set(`${r.template}#${r.step}`, [...(byStep.get(`${r.template}#${r.step}`) ?? []), r.position]);
    for (const [k, pos] of byStep) expect(pos, k).toEqual(pos.map((_, i) => i + 1));
  });

  it("matches the prompts: 'Read Sources A and B' / 'Sources A and B open' steps carry S3 + S4; the speak-live 'Read Source X' steps carry that one", () => {
    for (const [id, t] of templates) {
      if (!id.startsWith("B-W") || id === "B-W0-BASELINE") continue;
      for (const s of t.steps) {
        const mine = rows.filter((r) => r.template === id && r.step === s.step_no).map((r) => r.source);
        const wantsBoth = /Read Sources A and B|Sources A and B open/.test(s.prompt_en);
        if (wantsBoth) expect(mine, `${id}#${s.step_no}`).toEqual([`${id}-S3`, `${id}-S4`]);
        const single = /Read Source ([ABC])\b/.exec(s.prompt_en);
        if (single && !wantsBoth) expect(mine, `${id}#${s.step_no}`).toEqual([`${id}-S${({ A: 3, B: 4, C: 5 } as Record<string, number>)[single[1] as string]}`]);
        // steps that have no clear source get no row
        if (["ACT-REVISE", "ACT-CANVAS-ADV"].includes(s.activity_type) || (s.items.length > 0 && s.items.every((i) => i.kind === "transform"))) {
          expect(mine, `${id}#${s.step_no}`).toEqual([]);
        }
      }
      // B-W2: the trust step (split from step 4) reads the same two sources as step 4
      if (id === "B-W2-PHONES") {
        expect(rows.filter((r) => r.template === id && r.step === 5).map((r) => r.source)).toEqual(["B-W2-PHONES-S3", "B-W2-PHONES-S4"]);
      }
    }
  });
});
