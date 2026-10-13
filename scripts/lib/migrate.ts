import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientBase } from "pg";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../db/migrations", import.meta.url));

const FILE_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;

export type MigrationFile = { version: string; name: string; file: string };

export async function listMigrations(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const entries = await readdir(dir);
  const files = entries
    .filter((f) => FILE_RE.test(f))
    .sort()
    .map((name) => ({
      version: name.slice(0, 4),
      name,
      file: path.join(dir, name),
    }));

  const seen = new Set<string>();
  for (const m of files) {
    if (seen.has(m.version)) throw new Error(`Duplicate migration version ${m.version}`);
    seen.add(m.version);
  }
  return files;
}

export async function appliedVersions(client: ClientBase): Promise<Set<string>> {
  const { rows } = await client.query<{ exists: boolean }>(
    "select to_regclass('english.schema_migrations') is not null as exists",
  );
  if (!rows[0]?.exists) return new Set();
  const res = await client.query<{ version: string }>(
    "select version from english.schema_migrations",
  );
  return new Set(res.rows.map((r) => r.version));
}

export type ApplyOptions = {
  /** Re-run every file even if recorded (used to prove idempotency). */
  all?: boolean;
  dryRun?: boolean;
  dir?: string;
  log?: (msg: string) => void;
};

/**
 * Apply pending migrations in version order, each in its own transaction.
 * Each file must record its own version in english.schema_migrations.
 */
export async function applyMigrations(
  client: ClientBase,
  opts: ApplyOptions = {},
): Promise<string[]> {
  const log = opts.log ?? (() => {});
  const files = await listMigrations(opts.dir);
  const done = await appliedVersions(client);
  const pending = opts.all ? files : files.filter((m) => !done.has(m.version));
  const applied: string[] = [];

  for (const m of pending) {
    if (opts.dryRun) {
      log(`[dry-run] would apply ${m.name}`);
      continue;
    }
    const sql = await readFile(m.file, "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      const check = await client.query(
        "select 1 from english.schema_migrations where version = $1",
        [m.version],
      );
      if (check.rowCount !== 1) {
        throw new Error(
          `${m.name} did not record version ${m.version} in english.schema_migrations`,
        );
      }
      await client.query("commit");
      applied.push(m.version);
      log(`applied ${m.name}`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`, { cause: err });
    }
  }
  if (pending.length === 0) log("nothing to apply — database is up to date");
  return applied;
}
