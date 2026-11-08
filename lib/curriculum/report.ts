/**
 * The line docs/PROGRESS.md gets after each real "Đọc mục lục" (spec §8 "Thử AI bằng dùng thật"): book, version, date, AI calls, cost,
 * share of AI rows the tutor had to edit, rating — and STOP when more than 20 % were edited. Pure (scripts/curriculum-ai-report.ts feeds it).
 */
import { EDIT_WARN_PCT } from "./types";

export type AiReportRow = {
  title: string;
  version: number;
  approved_at: string | null;
  runs: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  ai_rows: number | null;
  edited_pct: number | null;
  quality: string | null;
};

export function formatAiReport(rows: AiReportRow[]): string {
  const head = "| Giáo trình | Bản | Duyệt ngày | Lần gọi AI | Token vào / ra | Chi phí | Dòng AI | Phải sửa | Đánh giá | Kết luận |\n|---|---|---|---|---|---|---|---|---|---|";
  const lines = rows.map((r) => {
    const verdict = r.edited_pct === null ? "chưa duyệt" : r.edited_pct > EDIT_WARN_PCT ? "DỪNG: chỉnh công thức" : "đạt";
    return `| ${r.title} | v${r.version} | ${r.approved_at ? r.approved_at.slice(0, 10) : "—"} | ${r.runs} | ${r.input_tokens} / ${r.output_tokens} | $${r.cost_usd.toFixed(4)} | ${r.ai_rows ?? "—"} | ${r.edited_pct === null ? "—" : `${r.edited_pct} %`} | ${r.quality ?? "—"} | ${verdict} |`;
  });
  return [head, ...lines].join("\n");
}
