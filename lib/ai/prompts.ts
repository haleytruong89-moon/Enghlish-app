// lib/ai/prompts.ts
/** Versioned prompts live in prompts/<name>.v<N>.md (DESIGN §11): changing the wording = a new file + a new version string. */
import { readFileSync } from "node:fs";
import path from "node:path";

export const STUDIO_PROMPT = { file: "studio-extract.v1", version: "studio-extract.v1" } as const;
export const CURRICULUM_PROMPT = { file: "curriculum-toc.v1", version: "curriculum-toc.v1" } as const;

export function loadPrompt(file: string, root: string = process.cwd()): string {
  if (!/^[a-z0-9-]+\.v[0-9]+$/.test(file)) throw new Error("loadPrompt: bad prompt name");
  return readFileSync(path.join(root, "prompts", `${file}.md`), "utf8");
}
