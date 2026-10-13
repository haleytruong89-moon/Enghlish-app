/**
 * npm run doctor [-- --with-backup-key]
 *
 * One-shot check of the cloud setup (PROGRESS "Phụ huynh cần làm"). Prints a ✓/✗ list in
 * Vietnamese with a one-line fix per ✗. Exit code 1 if anything failed.
 * In GitHub Actions the same table is appended to $GITHUB_STEP_SUMMARY.
 * Never prints secrets (see lib/ops/doctor.ts maskSecrets).
 */
import { appendFileSync } from "node:fs";
import { Client } from "pg";
import {
  exitCode,
  formatMarkdown,
  formatText,
  maskSecrets,
  runDoctor,
  secretValues,
  type DbHandle,
  type FetchLike,
} from "../lib/ops/doctor";
import { listMigrations } from "./lib/migrate";
import { pgConfigFromUrl } from "./lib/pg";

const realFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  return { status: res.status, text: () => res.text() };
};

async function main() {
  const env = process.env;
  const secrets = secretValues(env);
  const migrationVersions = (await listMigrations()).map((m) => m.version);

  let client: Client | null = null;
  let db: DbHandle = null;
  if (env.DATABASE_URL) {
    try {
      const c = new Client(pgConfigFromUrl(env.DATABASE_URL));
      c.on("error", () => {}); // connection drops are reported by the checks themselves
      await c.connect();
      client = c;
      db = { query: (sql, params) => c.query(sql, params) };
    } catch (err) {
      db = { error: maskSecrets((err as Error).message, secrets) };
    }
  }

  try {
    const results = await runDoctor({
      env,
      db,
      fetch: realFetch,
      migrationVersions,
      includeBackupKey: process.argv.includes("--with-backup-key"),
    });
    console.log(formatText(results));
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, formatMarkdown(results));
    process.exitCode = exitCode(results);
  } finally {
    await client?.end().catch(() => {});
  }
}

main().catch((err: unknown) => {
  console.error(maskSecrets((err as Error).message, secretValues(process.env)));
  process.exit(1);
});
