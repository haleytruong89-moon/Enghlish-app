/**
 * npm run gen:config             → (re)write db/migrations/0006_seed_config_v0_2_1.sql from content/*.json
 * npm run gen:config -- --check  → exit 1 when the checked-in file differs from the generator output (CI)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../lib/config/content";
import { MIGRATIONS_DIR } from "./lib/migrate";
import { buildConfigSql, SEED_MIGRATION_FILE } from "./lib/configSql";

async function main() {
  const check = process.argv.includes("--check");
  const target = path.join(MIGRATIONS_DIR, SEED_MIGRATION_FILE);
  const sql = buildConfigSql(loadConfig());

  if (check) {
    let current: string | null = null;
    try {
      current = await readFile(target, "utf8");
    } catch {
      current = null;
    }
    if (current !== sql) {
      console.error(
        `${SEED_MIGRATION_FILE} is out of date with content/*.json — run \`npm run gen:config\` and commit the result.`,
      );
      process.exit(1);
    }
    console.log(`${SEED_MIGRATION_FILE} is up to date`);
    return;
  }

  await writeFile(target, sql, "utf8");
  console.log(`wrote ${SEED_MIGRATION_FILE} (${Buffer.byteLength(sql)} bytes)`);
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
