/**
 * npm run db:seed-ipa
 *
 * E2a · loads english.ipa_lexicon (reference data, not a child's data) from ipa-dict at the PINNED commit of lib/notebook/ipa.ts:
 * downloads en_UK / en_US, refuses if a sha256 differs, normalizes every variant (learner-style stress, r, ə/ʌ) and upserts in batches.
 * Running it again is safe (same rows). Needs DATABASE_URL and migration 0041. Usually run by the workflow "Seed IPA lexicon".
 */
import { createHash } from "node:crypto";
import { Client } from "pg";
import { IPA_SOURCE, normalizeIpa, parseIpaLine, type Accent } from "../lib/notebook/ipa";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";

const BATCH = 1000;

async function download(accent: Accent): Promise<string> {
  const f = IPA_SOURCE.files[accent];
  const url = `https://raw.githubusercontent.com/${IPA_SOURCE.repo}/${IPA_SOURCE.commit}/${f.path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${accent}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== f.sha256) throw new Error(`download ${accent}: sha256 ${sha} ≠ pinned ${f.sha256} (refused)`);
  return buf.toString("utf8");
}

export function rowsOf(text: string): { word: string; ipa: string[] }[] {
  const out = new Map<string, string[]>();
  for (const line of text.split(/\r?\n/)) {
    const p = parseIpaLine(line);
    if (!p || p.word.length > 60) continue;
    const ipa = [...new Set(p.ipa.map(normalizeIpa))].slice(0, 4);
    if (!out.has(p.word)) out.set(p.word, ipa);
  }
  return [...out].map(([word, ipa]) => ({ word, ipa }));
}

async function main() {
  const client = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await client.connect();
  try {
    const has = await client.query("select to_regclass('english.ipa_lexicon') is not null as ok");
    if (!has.rows[0]?.ok) throw new Error("Cần áp 0041 trước (english.ipa_lexicon chưa có)");
    const source = `${IPA_SOURCE.repo}@${IPA_SOURCE.commit.slice(0, 12)}`;
    for (const accent of Object.keys(IPA_SOURCE.files) as Accent[]) {
      const rows = rowsOf(await download(accent));
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        await client.query(
          `insert into english.ipa_lexicon(word, accent, ipa, source)
           select x.word, $2, x.ipa, $3 from jsonb_to_recordset($1::jsonb) as x(word text, ipa text[])
           on conflict (word, accent) do update set ipa = excluded.ipa, source = excluded.source`,
          [JSON.stringify(chunk), accent, source],
        );
      }
      console.log(`${accent}: ${rows.length} words`);
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("seed-ipa.ts")) {
  main().catch((err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
