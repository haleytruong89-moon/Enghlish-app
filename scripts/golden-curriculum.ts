/**
 * npm run golden:curriculum -- <path/to/contents.pdf> [golden.json]
 *
 * Golden set of "Đọc mục lục" (spec §5): runs the CURRENT prompt (prompts/curriculum-toc.v1.md) and model on a real table of contents and
 * compares the normalized draft with tests/fixtures/curriculum/destination-c1c2.golden.json (default). Run by hand after every change of
 * prompt or model, BEFORE switching it on. Needs ANTHROPIC_API_KEY; costs one call (about $0.05). The PDF is NOT in the repo (copyright):
 * use the contents pages (scan pages 6–7) of the tutor's copy. Uses the Track B seed tags of content/tags as the closed list.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { studioModel } from "../lib/ai/config";
import { estimateCostUsd } from "../lib/ai/pricing";
import { CURRICULUM_PROMPT, loadPrompt } from "../lib/ai/prompts";
import { postToolCall } from "../lib/ai/request";
import type { TocContext } from "../lib/curriculum/context";
import { compareGolden, type Golden } from "../lib/curriculum/golden";
import { normalizeToc } from "../lib/curriculum/normalize";
import { aiTocSchema } from "../lib/curriculum/schema";
import { buildTocCall, TOC_DOC_TITLE } from "../lib/curriculum/tocTool";

async function main() {
  const [pdfPath, goldenPath = "tests/fixtures/curriculum/destination-c1c2.golden.json"] = process.argv.slice(2);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!pdfPath || !key) {
    console.error("usage: ANTHROPIC_API_KEY=… npm run golden:curriculum -- <contents.pdf> [golden.json]");
    process.exit(2);
  }
  const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as Golden;
  const tagFile = (f: string) => (JSON.parse(readFileSync(path.join("content", "tags", f), "utf8")) as { tags: { key: string; label_vi: string }[] }).tags;
  const ctx: TocContext = {
    tags: ["tags_B.json", "reading_B.json", "listening_B.json"].flatMap(tagFile).map((t) => ({ key: t.key, label: t.label_vi, domain: null, group: null, custom: false })),
  };
  const model = studioModel();
  const call = buildTocCall({
    model, toolChoice: "tool", prompt: loadPrompt(CURRICULUM_PROMPT.file), ctx, book: { title: "Destination C1 & C2 Grammar and Vocabulary", levelNote: "C1–C2" },
    doc: { kind: "pdf", title: TOC_DOC_TITLE, base64: readFileSync(pdfPath).toString("base64") },
  });
  const r = await postToolCall(call, { apiKey: key });
  const draft = normalizeToc(aiTocSchema.parse(r.input), ctx);
  const report = compareGolden(draft, golden);
  console.log(JSON.stringify({ prompt: CURRICULUM_PROMPT.version, model, cost_usd: estimateCostUsd(model, r.usage.inputTokens, r.usage.outputTokens), needs_review: draft.units.filter((u) => u.needs_review).length, ...report }, null, 2));
  process.exit(report.ok ? 0 : 1);
}
main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
