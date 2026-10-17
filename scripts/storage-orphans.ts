/**
 * npm run storage:orphans [-- --delete --confirm]
 *
 * Lists the files in the private bucket `english-work` that no row of english.files points to and that are older than 1 day
 * (uploaded but never sent). READ-ONLY by default. Deleting needs BOTH `--delete --confirm`. Run by hand; there is no schedule.
 * Only the bucket english-work is touched. Needs DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local);
 * nothing secret is printed.
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { findOrphans, mayDelete, parseOrphanArgs, type StoredObject } from "../lib/storage/orphans";
import { BUCKET } from "../lib/storage/rules";
import { pgConfigFromUrl, requireEnv } from "./lib/pg";

type Entry = { id: string | null; name: string; created_at?: string | null; metadata?: { size?: number } | null };

async function main() {
  const args = parseOrphanArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(`${args.error}\nusage: npm run storage:orphans [-- --delete --confirm]`);
    process.exit(2);
  }
  const sb = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = sb.storage.from(BUCKET);

  // Walk {family}/{learner|shared}/{file} - folders have id = null.
  async function listAll(folder: string): Promise<Entry[]> {
    const out: Entry[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(folder, { limit: 100, offset });
      if (error) throw new Error(`could not list ${folder || "/"} (${error.message})`);
      const page = (data ?? []) as Entry[];
      out.push(...page);
      if (page.length < 100) return out;
    }
  }
  const objects: StoredObject[] = [];
  for (const fam of (await listAll("")).filter((e) => e.id === null)) {
    for (const sub of (await listAll(fam.name)).filter((e) => e.id === null)) {
      for (const f of (await listAll(`${fam.name}/${sub.name}`)).filter((e) => e.id !== null)) {
        objects.push({ path: `${fam.name}/${sub.name}/${f.name}`, bytes: f.metadata?.size ?? null, createdAt: f.created_at ? new Date(f.created_at) : null });
      }
    }
  }

  const db = new Client(pgConfigFromUrl(requireEnv("DATABASE_URL")));
  await db.connect();
  let registered: Set<string>;
  try {
    registered = new Set((await db.query<{ path: string }>("select path from english.files")).rows.map((r) => r.path));
  } finally {
    await db.end();
  }

  const report = findOrphans(objects, registered, new Date());
  console.log(`objects in ${BUCKET}: ${objects.length} · registered: ${report.registered} · too new (< 1 day): ${report.tooNew} · unrecognised (never deleted): ${report.unrecognised.length}`);
  for (const o of report.orphans) console.log(`orphan  ${o.path}  ${o.bytes ?? "?"} bytes  ${o.createdAt?.toISOString() ?? ""}`);
  for (const o of report.unrecognised) console.log(`skipped ${o.path} (not a path this app builds, or age unknown)`);
  console.log(`orphans (no english.files row, older than 1 day): ${report.orphans.length}`);

  if (report.orphans.length === 0) return;
  if (!mayDelete(args)) {
    console.log(args.delete ? "Nothing deleted: add --confirm as well (npm run storage:orphans -- --delete --confirm)." : "Dry run: nothing deleted. To delete: npm run storage:orphans -- --delete --confirm");
    return;
  }
  let removed = 0;
  for (let i = 0; i < report.orphans.length; i += 100) {
    const batch = report.orphans.slice(i, i + 100).map((o) => o.path);
    const { error } = await bucket.remove(batch);
    if (error) throw new Error(`delete failed after ${removed} file(s) (${error.message})`);
    removed += batch.length;
  }
  console.log(`deleted ${removed} orphan file(s)`);
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
