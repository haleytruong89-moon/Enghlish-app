/**
 * npm run db:apply [-- --dry-run]
 *
 * Applies db/migrations/NNNN_*.sql that are not yet in english.schema_migrations,
 * in order, each in its own transaction. Uses DATABASE_URL (never NEXT_PUBLIC_*).
 * Does NOT use `supabase db push` (DESIGN §2 rule 3).
 */
import { Client } from "pg";
import { applyMigrations, appliedVersions, listMigrations } from "./lib/migrate";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await client.connect();
  try {
    const files = await listMigrations();
    const before = await appliedVersions(client);
    console.log(
      `migrations on disk: ${files.length}, already applied: ${before.size}${dryRun ? " (dry run)" : ""}`,
    );
    const applied = await applyMigrations(client, { dryRun, log: (m) => console.log(m) });
    if (!dryRun) console.log(`done — applied ${applied.length} file(s)`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  // Message only — never dump connection strings or data.
  console.error((err as Error).message);
  process.exit(1);
});
