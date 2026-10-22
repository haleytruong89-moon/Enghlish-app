/** content/skill_map/SM-1.json: zod schema + reader. Node only (tests); the app reads the published map from the database. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CONTENT_DIR } from "../config/content";
import { CEFR_LEVELS, DOMAIN_KEYS, GROUP_KEY_RE, LEVEL_BANDS } from "./types";

const cefr = z.enum(CEFR_LEVELS);
const task = z.number().int().min(1).max(4);
const text = (max: number) => z.string().trim().min(1).max(max);

const leaf = z.strictObject({
  kind: z.enum(["tag", "target"]),
  track: z.enum(["A", "B"]),
  ref: text(100),
  level_from: cefr.optional(),
  level_to: cefr.optional(),
  task_from: task.optional(),
  task_to: task.optional(),
  level_note: text(200).optional(),
  core: z.boolean().optional(),
  hidden_in_picker: z.boolean().optional(),
  related: z.array(text(100)).min(1).optional(),
});
const group = z.strictObject({
  key: z.string().regex(GROUP_KEY_RE),
  name_vi: text(80),
  desc: z.record(z.string(), z.string().min(1).nullable()),
  leaves: z.array(leaf),
});
const domain = z.strictObject({
  key: z.enum(DOMAIN_KEYS),
  name_vi: text(60),
  scale: z.enum(["cefr", "task_level"]),
  groups: z.array(group).min(1),
});
const assumed = z.strictObject({ grammar: cefr, vocab: cefr, reading: cefr, listening: cefr, writing: cefr, speaking: cefr, thinking: task });

export const skillMapFileSchema = z.strictObject({
  id: z.string().regex(/^SM-\d{1,3}$/),
  title_vi: text(120),
  catalogue_version: text(40),
  spec: text(200),
  note: text(1000),
  levels: z.array(cefr),
  level_bands: z.array(z.enum(LEVEL_BANDS)),
  task_levels: z.array(task),
  assumed: z.strictObject({ A: assumed, B: assumed }),
  domains: z.array(domain).length(7),
});
export type SkillMapFile = z.infer<typeof skillMapFileSchema>;

export const SKILL_MAP_PATH = path.join("skill_map", "SM-1.json");

export function readSkillMapFile(dir: string = CONTENT_DIR): { raw: unknown; file: SkillMapFile } {
  const raw = JSON.parse(readFileSync(path.join(dir, SKILL_MAP_PATH), "utf8")) as unknown;
  return { raw, file: skillMapFileSchema.parse(raw) };
}
