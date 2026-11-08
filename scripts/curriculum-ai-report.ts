/**
 * npm run report:curriculum-ai
 *
 * READ-ONLY. Prints, as a Markdown table for docs/PROGRESS.md (spec §8), every curriculum version the AI read: calls, tokens, cost (from
 * ai_runs, purpose curriculum_toc, reservations excluded), the share of AI rows the tutor edited (review.stats) and the rating. No book
 * content and no child name is printed (alias is not selected). Needs DATABASE_URL (.env.local).
 */
import { Client } from "pg";
import { formatAiReport, type AiReportRow } from "../lib/curriculum/report";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";

async function main() {
  const db = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await db.connect();
  try {
    const { rows } = await db.query<AiReportRow>(`
      select c.title, v.version, v.approved_at::text as approved_at,
             count(r.id)::int as runs, coalesce(sum(r.input_tokens), 0)::int as input_tokens, coalesce(sum(r.output_tokens), 0)::int as output_tokens,
             coalesce(sum(r.cost_usd), 0)::float8 as cost_usd,
             (v.review -> 'stats' ->> 'ai_rows')::int as ai_rows, (v.review -> 'stats' ->> 'edited_pct')::int as edited_pct, v.review ->> 'quality' as quality
      from english.curriculum_versions v
      join english.curricula c on c.id = v.curriculum_id
      left join english.ai_runs r on r.draft_id = v.id and r.purpose = 'curriculum_toc' and r.status in ('ok', 'error')
      where v.source = 'ai'
      group by c.title, v.id, v.version, v.approved_at, v.review, v.created_at
      order by v.created_at`);
    console.log(formatAiReport(rows));
  } finally {
    await db.end();
  }
}
main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
