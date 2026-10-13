import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONTENT_DIR } from "@/lib/config/content";
import { LOCK_FILE, loadContentItems } from "@/lib/config/versions";
import type { InquiryTemplate } from "@/lib/config/schemas";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";
import { buildSeedSql } from "../../scripts/lib/configSql";
import { checkConfig, generateNew, type ConfigPaths } from "../../scripts/lib/configLock";

let tmp = "";
let paths: ConfigPaths;

const tplFile = (id: string) => path.join(paths.contentDir, "inquiries", `${id}.json`);
const readTpl = (id: string) => JSON.parse(readFileSync(tplFile(id), "utf8")) as InquiryTemplate;
const writeTpl = (id: string, t: unknown) => writeFileSync(tplFile(id), JSON.stringify(t, null, 2) + "\n");
const migrations = () => readdirSync(paths.migrationsDir).filter((f) => f.endsWith(".sql")).sort();

/** A copy of A-W1 under a new id (a "new week"). */
function addTemplate(id: string, patch: (t: InquiryTemplate) => void = () => undefined) {
  const t = structuredClone(readTpl("A-W1-VOLCANOES"));
  t.id = id;
  t.status = "published";
  t.sources = t.sources.map((s, i) => ({ ...s, id: `${id}-S${i + 1}` }));
  patch(t);
  writeTpl(id, t);
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "inq-seed-"));
  paths = { contentDir: path.join(tmp, "content"), migrationsDir: path.join(tmp, "migrations") };
  cpSync(CONTENT_DIR, paths.contentDir, { recursive: true });
  cpSync(MIGRATIONS_DIR, paths.migrationsDir, { recursive: true });
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("inquiry templates in the version lock", () => {
  it("the six published templates are locked into 0008, the four draft ones are not locked or seeded", () => {
    const lock = JSON.parse(readFileSync(path.join(CONTENT_DIR, LOCK_FILE), "utf8")) as { inquiryTemplates: Record<string, { sha256: string; migration: string }> };
    expect(Object.keys(lock.inquiryTemplates)).toEqual([
      "A-W0-BASELINE@1", "A-W1-VOLCANOES@1", "A-W2-WATERCYCLE@1", "A-W3-EARTHQUAKES@1", "A-W4-PLANETS@1", "B-W0-BASELINE@1",
    ]);
    for (const e of Object.values(lock.inquiryTemplates)) {
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.migration).toBe("0008_seed_inquiries_pilot_v1.sql");
    }
    const sql = readFileSync(path.join(MIGRATIONS_DIR, "0008_seed_inquiries_pilot_v1.sql"), "utf8");
    for (const draft of ["B-W1-HOMEWORK", "B-W2-PHONES", "B-W3-TRANSPORT", "B-W4-AI-HOMEWORK"]) expect(sql).not.toContain(draft);
  });

  it("check passes on the untouched copy; a re-run of --new has nothing to do", async () => {
    expect(await checkConfig(paths)).toEqual({ problems: [], unlocked: [] });
    expect(await generateNew(paths)).toBeNull();
  });

  it("fails when a published template changes (English + Vietnamese message)", async () => {
    const t = readTpl("A-W2-WATERCYCLE");
    t.title_vi = "Tuần 2 - đổi tên";
    writeTpl("A-W2-WATERCYCLE", t);
    const { problems } = await checkConfig(paths);
    const msg = problems.find((p) => p.includes("A-W2-WATERCYCLE@1"));
    expect(msg).toContain("published version inquiry template A-W2-WATERCYCLE@1 changed — create a new version instead");
    expect(msg).toContain("hãy tạo phiên bản mới");
    await expect(generateNew(paths)).rejects.toThrow(/inquiry template A-W2-WATERCYCLE@1 changed/);
  });

  it("fails when a published template is turned back into a draft, or its file disappears", async () => {
    const t = readTpl("A-W3-EARTHQUAKES");
    t.status = "draft";
    writeTpl("A-W3-EARTHQUAKES", t);
    expect((await checkConfig(paths)).problems.some((p) => p.includes("inquiry template A-W3-EARTHQUAKES@1 changed"))).toBe(true);
    rmSync(tplFile("A-W3-EARTHQUAKES"));
    expect((await checkConfig(paths)).problems.some((p) => p.includes("A-W3-EARTHQUAKES@1") && p.includes("never delete"))).toBe(true);
  });

  it("fails when 0008 is edited by hand", async () => {
    const file = path.join(paths.migrationsDir, "0008_seed_inquiries_pilot_v1.sql");
    writeFileSync(file, readFileSync(file, "utf8") + "\n-- hand edit\n");
    const { problems } = await checkConfig(paths);
    expect(problems.some((p) => p.includes("0008_seed_inquiries_pilot_v1.sql differs from the generator output"))).toBe(true);
  });

  it("a new published template is reported until --new puts it, alone, into the next migration", async () => {
    addTemplate("A-W5-NEWWEEK");
    const before = await checkConfig(paths);
    expect(before.unlocked).toEqual(["inquiry template A-W5-NEWWEEK@1"]);
    const res = await generateNew(paths);
    expect(res).toEqual({ file: "0010_seed_a_w5_newweek_1.sql", ids: ["A-W5-NEWWEEK@1"] });
    const sql = readFileSync(path.join(paths.migrationsDir, "0010_seed_a_w5_newweek_1.sql"), "utf8");
    expect(sql).toContain("Inquiry template A-W5-NEWWEEK v1");
    expect(sql).not.toContain("A-W1-VOLCANOES");
    expect(sql.trim().endsWith("values ('0010') on conflict do nothing;")).toBe(true);
    expect(await checkConfig(paths)).toEqual({ problems: [], unlocked: [] });
    expect(migrations().filter((f) => f.startsWith("0008"))).toEqual(["0008_seed_inquiries_pilot_v1.sql"]);
  });

  it("--name sets the readable part of the file name and refuses odd characters", async () => {
    addTemplate("A-W5-NEWWEEK");
    await expect(generateNew(paths, undefined, "Bad Name!")).rejects.toThrow(/--name/);
    const res = await generateNew(paths, undefined, "week5");
    expect(res?.file).toBe("0010_seed_week5.sql");
  });

  it("a published template that breaks the evidence-task whitelist is a generator error and a check error", async () => {
    addTemplate("A-W6-BADTASK", (t) => {
      const step = t.steps.find((s) => s.activity_type === "ACT-WRITE" && s.target_ids.includes("A-L3-CAUSE-W"));
      if (!step) throw new Error("fixture step missing");
      step.activity_type = "ACT-SPEAK-MONO"; // A-L3-CAUSE-W is evidenced by writing only
    });
    const { problems } = await checkConfig(paths);
    expect(problems.some((p) => p.includes("A-W6-BADTASK@1") && p.includes("is not an evidence task of A-L3-CAUSE-W"))).toBe(true);
    await expect(generateNew(paths)).rejects.toThrow(/breaks catalogue rules[\s\S]*not an evidence task of A-L3-CAUSE-W/);
    expect(migrations()).not.toContain("0010_seed_a_w6_badtask_1.sql");
    // …the same content as a draft is just a draft: no error, never seeded
    const t = readTpl("A-W6-BADTASK");
    t.status = "draft";
    writeTpl("A-W6-BADTASK", t);
    expect(await checkConfig(paths)).toEqual({ problems: [], unlocked: [] });
    expect(await generateNew(paths)).toBeNull();
  });

  it("a template file with the wrong name, bad schema or unknown catalogue is refused when loading", () => {
    const t = readTpl("A-W1-VOLCANOES");
    writeFileSync(path.join(paths.contentDir, "inquiries", "A-W7-OTHER.json"), JSON.stringify(t));
    expect(() => loadContentItems(paths.contentDir)).toThrow(/file name must be A-W1-VOLCANOES\.json/);
    rmSync(path.join(paths.contentDir, "inquiries", "A-W7-OTHER.json"));

    t.catalogue_version = "9.9";
    writeTpl("A-W1-VOLCANOES", t);
    expect(() => loadContentItems(paths.contentDir)).toThrow(/needs catalogue 9\.9/);
  });

  it("two different templates may not share a source id; the error names both, loading and the generator stop", async () => {
    const clash = structuredClone(readTpl("A-W1-VOLCANOES"));
    clash.id = "A-W6-CLASH"; // keeps A-W1's source ids on purpose
    clash.status = "published";
    writeTpl("A-W6-CLASH", clash);
    const message = /source id A-W1-VOLCANOES-S1 is used by two inquiry templates: A-W1-VOLCANOES@1 .* and A-W6-CLASH@1 .*/;
    expect(() => loadContentItems(paths.contentDir)).toThrow(message);
    await expect(checkConfig(paths)).rejects.toThrow(message);
    await expect(generateNew(paths)).rejects.toThrow(message);
    // a draft counts too (it is the same namespace)
    clash.status = "draft";
    writeTpl("A-W6-CLASH", clash);
    expect(() => loadContentItems(paths.contentDir)).toThrow(message);
  });

  it("the same source id twice inside one template is refused; a new version of the same template may keep its ids", () => {
    const dup = structuredClone(readTpl("A-W1-VOLCANOES"));
    dup.sources = [...dup.sources, structuredClone(dup.sources[0])!];
    writeTpl("A-W1-VOLCANOES", dup);
    expect(() => loadContentItems(paths.contentDir)).toThrow(/source id A-W1-VOLCANOES-S1 is used twice in inquiry template A-W1-VOLCANOES@1/);

    const original = JSON.parse(readFileSync(path.join(CONTENT_DIR, "inquiries", "A-W1-VOLCANOES.json"), "utf8")) as InquiryTemplate;
    writeTpl("A-W1-VOLCANOES", original);
    const v2 = structuredClone(original);
    v2.version = 2;
    writeFileSync(path.join(paths.contentDir, "inquiries", "A-W1-VOLCANOES.v2.json"), JSON.stringify(v2, null, 2));
    expect(() => loadContentItems(paths.contentDir)).not.toThrow();
  });

  it("the generated SQL fills children before it publishes the parent and guards against a second run", () => {
    const items = loadContentItems(paths.contentDir);
    const first = items.inquiryTemplates[1];
    if (!first) throw new Error("no template");
    const sql = buildSeedSql({ file: "0099_x.sql", catalogues: [], policies: [], targetSets: [], inquiryTemplates: [first], allCatalogues: items.catalogues });
    const order = [
      "insert into english.sources",
      "insert into english.source_transcripts",
      "update english.sources set published_at",
      "insert into english.inquiry_templates",
      "insert into english.template_item_keys",
      "update english.inquiry_templates set status = 'published'",
    ].map((m) => sql.indexOf(m));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // children are skipped once the parent is published
    expect(sql.match(/it\.published_at is not null/g)?.length).toBeGreaterThanOrEqual(3);
    // the SQL carries no answer for the student-visible columns: those are separate literals
    const stepsLiteral = /r->'steps', r->'sources'/.test(sql);
    expect(stepsLiteral).toBe(true);
  });
});
