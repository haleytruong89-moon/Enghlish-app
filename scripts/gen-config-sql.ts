/**
 * npm run gen:config             → same as --check
 * npm run gen:config -- --check  → exit 1 when a published version changed, a seed migration drifted,
 *                                  or content exists that is not in any migration yet (CI)
 * npm run gen:config -- --new    → put NEW (not yet locked) versions into the next free migration
 *                                  NNNN_seed_<slug>.sql and add them to content/config.lock.json.
 *                                  Never overwrites a migration; refuses if a locked version changed.
 *                                  Optional: --name=<a_z0_9> sets the file-name part (0008_seed_<name>.sql).
 */
import { checkConfig, generateNew } from "./lib/configLock";

async function main() {
  if (process.argv.includes("--new")) {
    const name = process.argv.find((a) => a.startsWith("--name="))?.split("=")[1];
    const res = await generateNew(undefined, undefined, name);
    if (!res) {
      console.log("nothing new: every version in content/ is already in a seed migration");
      return;
    }
    console.log(`wrote db/migrations/${res.file} for ${res.ids.join(", ")} and updated content/config.lock.json — commit both`);
    return;
  }

  const { problems } = await checkConfig();
  if (problems.length) {
    for (const p of problems) console.error(`ERROR: ${p}`);
    process.exit(1);
  }
  console.log("config content, lock and seed migrations are consistent");
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
