import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { applyMigrations } from "../../scripts/lib/migrate";
import { pgConfigFromUrl } from "../../scripts/lib/pg";
import { seedTestFamily, type SeedResult, type SeedUsers } from "../../scripts/lib/seed";

/** Admin connection to a throwaway Postgres (local or CI service). */
export const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

const STUB_SQL = fileURLToPath(new URL("../../db/stub/supabase_stub.sql", import.meta.url));

export type TestDb = {
  name: string;
  url: string;
  client: Client;
  drop: () => Promise<void>;
};

/** Create a fresh database with the Supabase + Launcher stub (no english schema yet). */
export async function createTestDb(): Promise<TestDb> {
  const name = `los_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new Client(pgConfigFromUrl(ADMIN_URL));
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Cannot reach Postgres at TEST_DATABASE_URL (${new URL(ADMIN_URL).host}). ` +
        "Start a local postgres:16 (see docs/PROGRESS.md) or run `npm run test:unit` only.",
      { cause: err },
    );
  }
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const client = new Client(pgConfigFromUrl(url.toString()));
  await client.connect();
  await client.query(await readFile(STUB_SQL, "utf8"));

  return {
    name,
    url: url.toString(),
    client,
    drop: async () => {
      await client.end();
      const a = new Client(pgConfigFromUrl(ADMIN_URL));
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

export async function migrate(client: Client, all = false) {
  return applyMigrations(client, { all });
}

/** Insert a stub auth user and return its id. */
export async function createAuthUser(client: Client, email: string): Promise<string> {
  const res = await client.query<{ id: string }>(
    "insert into auth.users(email) values ($1) returning id",
    [email],
  );
  return (res.rows[0] as { id: string }).id;
}

export type Seeded = SeedResult & { users: SeedUsers };

export async function seed(client: Client): Promise<Seeded> {
  const users: SeedUsers = {
    parent: await createAuthUser(client, "parent@test.local"),
    tutorAn: await createAuthUser(client, "tutor-an@test.local"),
    tutorNguyen: await createAuthUser(client, "tutor-nguyen@test.local"),
    studentAn: await createAuthUser(client, "an@test.local"),
    studentNguyen: await createAuthUser(client, "nguyen@test.local"),
  };
  const result = await seedTestFamily(client, users);
  return { ...result, users };
}

type Role = "anon" | "authenticated" | "service_role";

/**
 * Run `fn` inside a transaction as a Supabase role, with auth.uid() = userId.
 * Always rolls back, so tests never leak state.
 */
export async function as<T>(
  client: Client,
  role: Role,
  userId: string | null,
  fn: (q: Client["query"]) => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    await client.query(`set local role ${role}`);
    return await fn(client.query.bind(client) as Client["query"]);
  } finally {
    await client.query("rollback");
  }
}

/** Convenience: run a single query as a role and return rows. */
export async function rowsAs<R extends Record<string, unknown> = Record<string, unknown>>(
  client: Client,
  role: Role,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return as(client, role, userId, async () => {
    const res = await client.query<R>(sql, params);
    return res.rows;
  });
}

/** Run a query as a role and return the error (or null if it succeeded). */
export async function errorAs(
  client: Client,
  role: Role,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<(Error & { code?: string }) | null> {
  try {
    await as(client, role, userId, async () => client.query(sql, params));
    return null;
  } catch (err) {
    return err as Error & { code?: string };
  }
}
