/**
 * SPIKE (throwaway, never merged): can Claude turn a tutor's test + answer key into an in-app exercise?
 * Measures, against spike/gold.json: items found, part/kind, answer key (incl. accepted alternatives),
 * MCQ options, tag suggestion agreement, review flags, tokens, latency.
 *
 * Privacy: sends ONLY the blank test and the tutor's answer key (no child's answers, no names).
 * Run: ANTHROPIC_API_KEY=... SPIKE_MODEL=claude-sonnet-5-5 SPIKE_FORMAT=pdf|text tsx spike/studio-extract.ts
 */
import { readFileSync, appendFileSync } from "node:fs";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SPIKE_MODEL ?? "claude-sonnet-5-5";
const FORMAT = (process.env.SPIKE_FORMAT ?? "pdf") as "pdf" | "text";
const PRICE_IN = Number(process.env.PRICE_IN_PER_MTOK ?? "NaN"); // USD per million input tokens (optional)
const PRICE_OUT = Number(process.env.PRICE_OUT_PER_MTOK ?? "NaN");
if (!KEY) {
  console.log("::error::ANTHROPIC_API_KEY chưa có (GitHub → Settings → Secrets → Actions)");
  process.exit(1);
}

type Gold = { n: number; part: string; kind: string; key: string; accepted: string[]; tag_key: string };
const gold: Gold[] = JSON.parse(readFileSync("spike/gold.json", "utf8")).items;

// Track B tag set, read from the applied seed so the spike uses the real list.
const seed = readFileSync("db/migrations/0015_seed_tags.sql", "utf8");
const tags = [...seed.matchAll(/\('B', '([^']+)', '([^']+)', '([^']+)'\)/g)].map((m) => ({ key: m[1], label: m[2] }));

const kinds = ["mcq", "gap", "transform", "wordform", "other"] as const;
const tool = {
  name: "save_exercise",
  description: "Save the structured exercise extracted from the test and its answer key.",
  input_schema: {
    type: "object",
    required: ["title", "parts", "items"],
    properties: {
      title: { type: "string" },
      parts: {
        type: "array",
        items: {
          type: "object",
          required: ["key", "name", "instructions"],
          properties: { key: { type: "string" }, name: { type: "string" }, instructions: { type: "string" } },
        },
      },
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["n", "part", "kind", "stem", "key", "accepted", "tag_key", "tag_confidence", "explanation_vi", "needs_review"],
          properties: {
            n: { type: "integer" },
            part: { type: "string", description: "Part letter A–G as printed in the test" },
            kind: { type: "string", enum: kinds },
            stem: { type: "string", description: "Question text with the gap as ____ ; for cloze/word formation: the sentence containing the gap; include the given KEY WORD or CAPITALS word" },
            options: {
              type: "array",
              items: { type: "object", required: ["letter", "text"], properties: { letter: { type: "string" }, text: { type: "string" } } },
            },
            key: { type: "string", description: "Correct answer: the option letter for mcq, otherwise the exact words" },
            accepted: { type: "array", items: { type: "string" }, description: "Other answers the key explicitly accepts" },
            tag_key: { type: ["string", "null"], enum: [...tags.map((t) => t.key), null] },
            tag_confidence: { type: "string", enum: ["high", "low"] },
            explanation_vi: { type: "string", description: "One short Vietnamese sentence (max ~25 words) explaining why the key is right, for a grade-9 student" },
            needs_review: { type: "boolean" },
            review_reason: { type: "string" },
          },
        },
      },
    },
  },
};

const instructions = `Bạn giúp gia sư tiếng Anh biến một đề kiểm tra + đáp án thành bài làm trong app.
- Trích ĐỦ mọi câu có số (kể cả câu nằm trong đoạn văn điền từ như "(13)"), giữ đúng số câu và phần (A, B, C…).
- kind: mcq = chọn A/B/C/D; gap = điền 1 từ (open cloze, phrasal verbs, idioms); transform = viết lại câu với từ cho sẵn; wordform = dạng từ từ chữ IN HOA; other = khác.
- key lấy từ ĐÁP ÁN của gia sư, không tự giải. Nếu đáp án ghi "chấp nhận X" thì đưa X vào accepted. Nếu đáp án thiếu hoặc mâu thuẫn với đề: needs_review = true và ghi review_reason.
- tag_key: chọn 1 nhãn điểm yếu phù hợp nhất trong danh sách; không chắc thì tag_confidence = "low".
- explanation_vi: 1 câu tiếng Việt ngắn, dễ hiểu, không nhắc điểm số.
- needs_review = true cũng khi: có nhiều đáp án hợp lý, câu cần người chấm (viết lại câu có nhiều cách), hoặc chữ trong đề khó đọc.
Danh sách nhãn (key — tên): ${tags.map((t) => `${t.key} — ${t.label}`).join("; ")}.
Gọi tool save_exercise đúng một lần.`;

function doc(path: string, title: string) {
  if (FORMAT === "pdf") {
    return {
      type: "document",
      title,
      source: { type: "base64", media_type: "application/pdf", data: readFileSync(path + ".pdf").toString("base64") },
    };
  }
  return { type: "document", title, source: { type: "text", media_type: "text/plain", data: readFileSync(path + ".txt", "utf8") } };
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();

async function main() {
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 32000,
      tools: [tool],
      tool_choice: { type: "tool", name: "save_exercise" },
      messages: [
        {
          role: "user",
          content: [doc("spike/fixtures/test_blank", "ĐỀ"), doc("spike/fixtures/key", "ĐÁP ÁN của gia sư"), { type: "text", text: instructions }],
        },
      ],
    }),
  });
  const ms = Date.now() - t0;
  const body = await res.json();
  if (!res.ok) {
    console.log(`::error::API ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
    process.exit(1);
  }
  const use = body.content?.find((c: { type: string }) => c.type === "tool_use");
  const out = use?.input as { items: Array<Record<string, unknown>> } | undefined;
  const items = (out?.items ?? []) as Array<{
    n: number; part: string; kind: string; stem: string; options?: { letter: string; text: string }[];
    key: string; accepted: string[]; tag_key: string | null; tag_confidence: string; explanation_vi: string; needs_review: boolean; review_reason?: string;
  }>;
  const byN = new Map(items.map((i) => [i.n, i]));

  const c = { found: 0, part: 0, kind: 0, key: 0, accepted: 0, acceptedTotal: 0, options: 0, mcq: 0, tag: 0, tagHighWrong: 0, flagged: 0, flaggedWrong: 0, wrongTotal: 0, stem: 0 };
  const misses: string[] = [];
  for (const g of gold) {
    const x = byN.get(g.n);
    if (!x) { misses.push(`${g.n}: thiếu câu`); continue; }
    c.found++;
    if (String(x.part).trim().toUpperCase() === g.part) c.part++;
    if (x.kind === g.kind) c.kind++; else misses.push(`${g.n}: dạng ${x.kind} ≠ ${g.kind}`);
    const keyOk = norm(x.key) === norm(g.key);
    if (keyOk) c.key++; else misses.push(`${g.n}: đáp án "${x.key}" ≠ "${g.key}"`);
    const got = new Set([x.key, ...(x.accepted ?? [])].map(norm));
    for (const a of g.accepted) { c.acceptedTotal++; if (got.has(norm(a))) c.accepted++; else misses.push(`${g.n}: thiếu đáp án chấp nhận "${a}"`); }
    if (g.kind === "mcq") { c.mcq++; if ((x.options ?? []).length === 4) c.options++; else misses.push(`${g.n}: ${(x.options ?? []).length} lựa chọn`); }
    if ((x.stem ?? "").length > 8) c.stem++;
    const tagOk = x.tag_key === g.tag_key;
    if (tagOk) c.tag++; else if (x.tag_confidence === "high") c.tagHighWrong++;
    if (x.needs_review) c.flagged++;
    if (!keyOk) { c.wrongTotal++; if (x.needs_review) c.flaggedWrong++; }
  }
  const extra = items.filter((i) => !gold.some((g) => g.n === i.n)).length;
  const u = body.usage ?? {};
  const cost = Number.isFinite(PRICE_IN) && Number.isFinite(PRICE_OUT)
    ? ((u.input_tokens ?? 0) * PRICE_IN + (u.output_tokens ?? 0) * PRICE_OUT) / 1e6 : null;
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");

  const lines = [
    `## Spike Studio · ${MODEL} · ${FORMAT.toUpperCase()}`,
    "",
    "| Chỉ số | Kết quả |",
    "|---|---|",
    `| Tìm đủ câu | ${c.found}/60 (${pct(c.found, 60)})${extra ? ` · thừa ${extra}` : ""} |`,
    `| Đúng phần | ${pct(c.part, c.found)} |`,
    `| Đúng dạng câu | ${pct(c.kind, c.found)} |`,
    `| **Đáp án đúng** | **${c.key}/60 (${pct(c.key, 60)})** |`,
    `| Đáp án "chấp nhận" giữ được | ${c.accepted}/${c.acceptedTotal} |`,
    `| Trắc nghiệm đủ 4 lựa chọn | ${c.options}/${c.mcq} |`,
    `| Có nội dung câu | ${c.stem}/60 |`,
    `| Nhãn trùng khung gia đình | ${c.tag}/60 (${pct(c.tag, 60)}) · sai mà "chắc chắn": ${c.tagHighWrong} |`,
    `| Câu AI đánh dấu "cần xem" | ${c.flagged} · trong số câu sai đáp án, được đánh dấu: ${c.flaggedWrong}/${c.wrongTotal} |`,
    `| Token vào / ra | ${u.input_tokens ?? "?"} / ${u.output_tokens ?? "?"} |`,
    `| Ước tính chi phí | ${cost === null ? "xem Console → Usage" : `$${cost.toFixed(4)}`} |`,
    `| Thời gian | ${(ms / 1000).toFixed(1)} s |`,
    "",
    "**Lệch so với đáp án mẫu:** " + (misses.length ? misses.join(" · ") : "không có"),
    "",
    "**5 giải thích mẫu (để gia sư đánh giá chất lượng):**",
    ...[4, 16, 28, 41, 56].map((n) => `- Câu ${n}: ${byN.get(n)?.explanation_vi ?? "—"}`),
    "",
  ];
  const md = lines.join("\n");
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  console.log(`::notice title=${MODEL} ${FORMAT}::found ${c.found}/60 · key ${c.key}/60 · accepted ${c.accepted}/${c.acceptedTotal} · kind ${c.kind} · tag ${c.tag}/60 · flagged ${c.flagged} (wrong flagged ${c.flaggedWrong}/${c.wrongTotal}) · tokens ${u.input_tokens}/${u.output_tokens} · ${(ms / 1000).toFixed(0)}s${cost === null ? "" : ` · $${cost.toFixed(4)}`}`);
  if (misses.length) console.log(`::warning title=${MODEL} ${FORMAT} lệch::${misses.slice(0, 40).join(" | ")}`);
  console.log(`::notice title=${MODEL} ${FORMAT} giải thích::${[4, 16, 28, 41, 56].map((n) => `${n}: ${byN.get(n)?.explanation_vi ?? "—"}`).join(" | ")}`);
}

main().catch((e) => { console.log(`::error::${String(e).slice(0, 300)}`); process.exit(1); });
