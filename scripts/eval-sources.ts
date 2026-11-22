/**
 * npm run eval:sources -- upload <dir>     (once: put the test-set question files into the private bucket)
 * npm run eval:sources -- download <dir>   (each run of the test set: fetch them)
 * npm run eval:sources -- list
 *
 * Book material used by the AI tutor test set (Destination U14 + R7, 21 JSON files) is kept OUT of git (hub Q1, 22/11): it lives in
 * the private Storage bucket `eval-sources` of the app's own Supabase project, the same project that already keeps what tutors upload.
 * Only the folder `destination/` is used. Not the bucket `english-work` (its orphan clean-up would see these files as orphans).
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (GitHub secret / .env.local); nothing secret is printed.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./lib/pg";

export const EVAL_BUCKET = "eval-sources";
const FOLDER = "destination";
/** Only plain JSON question files go up or come down; nothing else is touched. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}\.json$/;

async function main() {
  const [cmd, dir] = process.argv.slice(2);
  if (!cmd || !["upload", "download", "list"].includes(cmd) || (cmd !== "list" && !dir)) {
    console.error("usage: npm run eval:sources -- upload <dir> | download <dir> | list");
    process.exit(2);
  }
  const sb = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = sb.storage.from(EVAL_BUCKET);
  const { data: existing } = await sb.storage.getBucket(EVAL_BUCKET);
  // Every command refuses a public bucket (book material). Storage policies that forget bucket_id are caught by `npm run doctor`.
  if (existing?.public) throw new Error(`bucket ${EVAL_BUCKET} is public: refusing to touch book material there`);

  if (cmd === "upload") {
    if (!existing) {
      const { error } = await sb.storage.createBucket(EVAL_BUCKET, { public: false, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: ["application/json"] });
      if (error) throw new Error(`could not create bucket ${EVAL_BUCKET} (${error.message})`);
      console.log(`created private bucket ${EVAL_BUCKET}`);
    }
    const all = readdirSync(dir!).sort();
    const files = all.filter((f) => NAME.test(f));
    const skipped = all.filter((f) => !NAME.test(f));
    if (skipped.length) throw new Error(`unexpected file name(s), nothing uploaded: ${skipped.join(", ")}`);
    if (files.length === 0) throw new Error(`no question files in ${dir}`);
    for (const f of files) {
      const body = readFileSync(path.join(dir!, f));
      JSON.parse(body.toString("utf8")); // a broken file is never uploaded
      const { error } = await bucket.upload(`${FOLDER}/${f}`, body, { contentType: "application/json", upsert: true });
      if (error) throw new Error(`could not upload ${f} (${error.message})`);
    }
    console.log(`uploaded ${files.length} file(s) to ${EVAL_BUCKET}/${FOLDER}/`);
    return;
  }

  const { data, error } = await bucket.list(FOLDER, { limit: 1000 });
  if (error) throw new Error(`could not list ${EVAL_BUCKET}/${FOLDER} (${error.message})`);
  const names = (data ?? []).map((e) => e.name).filter((n) => NAME.test(n)).sort();
  if (cmd === "list") {
    console.log(`${names.length} file(s) in ${EVAL_BUCKET}/${FOLDER}/`);
    for (const n of names) console.log(`  ${n}`);
    return;
  }
  if (names.length === 0) throw new Error(`no question files in ${EVAL_BUCKET}/${FOLDER}/ (run the "Move eval sources" workflow first)`);
  mkdirSync(dir!, { recursive: true });
  for (const n of names) {
    const { data: blob, error: e } = await bucket.download(`${FOLDER}/${n}`);
    if (e || !blob) throw new Error(`could not download ${n} (${e?.message ?? "empty"})`);
    writeFileSync(path.join(dir!, n), Buffer.from(await blob.arrayBuffer()));
  }
  console.log(`downloaded ${names.length} file(s) into ${dir}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
