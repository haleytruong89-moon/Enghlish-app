import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * These tests EXECUTE scripts/ops/restore-check.sh and compare-counts.sh (the code the backup workflow runs), with stub `psql` and
 * `pg_restore` programs in place of the throwaway Postgres. They prove the exit code: a count mismatch or an english/auth restore
 * error must exit non-zero (the earlier version set the flag inside a piped sub-shell and the job never failed).
 */
const root = process.cwd();
const script = path.join(root, "scripts", "ops", "restore-check.sh");
const compare = path.join(root, "scripts", "ops", "compare-counts.sh");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "restore-check-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const w = (name: string, text: string) => {
  const f = path.join(dir, name);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, text);
  return f;
};

function stubBin() {
  const bin = path.join(dir, "bin");
  w("bin/psql", `#!/usr/bin/env bash
case "$*" in
  *"create database"*) exit 0 ;;
  *counts-english.sql*) cat "$STUB_RESTORED_ENGLISH" ;;
  *counts-auth.sql*) cat "$STUB_RESTORED_AUTH" ;;
  *) cat > /dev/null ;;
esac
`);
  w("bin/pg_restore", `#!/usr/bin/env bash
if [ "$1" = "-l" ]; then
  printf '%s\\n' '1; 1259 1 TABLE auth users owner' '2; 2620 2 TRIGGER auth users t owner'
  exit 0
fi
last="\${@: -1}"
case "$(basename "$last")" in
  auth.dump) [ -n "\${STUB_ERR_AUTH:-}" ] && printf '%s\\n' "$STUB_ERR_AUTH" >&2 ;;
  main.dump) [ -n "\${STUB_ERR_MAIN:-}" ] && printf '%s\\n' "$STUB_ERR_MAIN" >&2 ;;
esac
exit 0
`);
  chmodSync(path.join(bin, "psql"), 0o755);
  chmodSync(path.join(bin, "pg_restore"), 0o755);
  return bin;
}

const live = "english.learners 5\nenglish.members 7\nenglish.results 40\n";

function run(opts: {
  restored?: string; restoredAuth?: string; auth?: boolean; errMain?: string; errAuth?: string;
  before?: string; after?: string;
}) {
  const plain = path.join(dir, "plain");
  mkdirSync(plain, { recursive: true });
  writeFileSync(path.join(plain, "main.dump"), "x");
  writeFileSync(path.join(plain, "counts.before"), opts.before ?? live);
  writeFileSync(path.join(plain, "counts.after"), opts.after ?? live);
  const auth = opts.auth ?? true;
  if (auth) {
    writeFileSync(path.join(plain, "auth.dump"), "x");
    writeFileSync(path.join(plain, "auth.counts.before"), "auth.users 3\n");
    writeFileSync(path.join(plain, "auth.counts.after"), "auth.users 3\n");
  }
  const res = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PLAIN_DIR: plain,
      PG_BIN: stubBin(),
      RC_PASSWORD: "x",
      STUB_RESTORED_ENGLISH: w("restored.en", opts.restored ?? live),
      STUB_RESTORED_AUTH: w("restored.au", opts.restoredAuth ?? "auth.users 3\n"),
      STUB_ERR_MAIN: opts.errMain ?? "",
      STUB_ERR_AUTH: opts.errAuth ?? "",
    },
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}`, summary: readFileSync(path.join(plain, "restore-summary.md"), "utf8") };
}

describe("restore-check.sh (executed)", () => {
  it("exits 0 and says PASSED when every english table and auth.users match", () => {
    const r = run({});
    expect(r.code).toBe(0);
    expect(r.summary).toContain("Restore check PASSED");
    expect(r.summary).toContain("| english.results | 40 / 40 | 40 | OK |");
    expect(r.summary).toContain("| auth.users | 3 / 3 | 3 | OK |");
  });

  it("exits NON-ZERO on a forced count mismatch in a table the old check did not even look at", () => {
    const r = run({ restored: "english.learners 5\nenglish.members 7\nenglish.results 39\n" });
    expect(r.code).not.toBe(0);
    expect(r.summary).toContain("| english.results | 40 / 40 | 39 | MISMATCH |");
    expect(r.summary).toContain("Restore check FAILED");
    expect(r.out).toContain("::error::restore check failed");
  });

  it("exits NON-ZERO when a table is missing from the restored copy, or auth.users differs", () => {
    expect(run({ restored: "english.learners 5\nenglish.members 7\n" }).code).not.toBe(0);
    const a = run({ restoredAuth: "auth.users 2\n" });
    expect(a.code).not.toBe(0);
    expect(a.summary).toContain("| auth.users | 3 / 3 | 2 | MISMATCH |");
  });

  it("tolerates rows written while the dump ran (restored between the before and after counts)", () => {
    const r = run({ before: "english.learners 5\nenglish.members 7\nenglish.results 40\n", after: "english.learners 5\nenglish.members 7\nenglish.results 42\n", restored: "english.learners 5\nenglish.members 7\nenglish.results 41\n" });
    expect(r.code).toBe(0);
    expect(r.summary).toContain("| english.results | 40 / 42 | 41 | OK |");
  });

  it("exits NON-ZERO when pg_restore reports an error that names schema english or auth, even if the counts match", () => {
    const e1 = run({ errMain: 'pg_restore: error: could not execute query: ERROR:  relation "english.results" already exists\nCommand was: CREATE TABLE english.results (id uuid);' });
    expect(e1.code).not.toBe(0);
    expect(e1.summary).toContain("Restore errors that name schema english or auth (public + english dump): 1");
    const e2 = run({ errAuth: 'pg_restore: error: could not execute query: ERROR:  type "x" does not exist\nCommand was: CREATE TABLE auth.users (id uuid);' });
    expect(e2.code).not.toBe(0);
    expect(e2.summary).toContain("Restore errors in the login tables (auth): 1");
  });

  it("counts errors in the Launcher's public schema without failing, and never prints the error text", () => {
    const r = run({ errMain: 'pg_restore: error: could not execute query: ERROR:  function "public.secret_fn" does not exist\nCommand was: CREATE VIEW public.v AS select \'CONFIDENTIAL-ROW\';\npg_restore: warning: errors ignored on restore: 1' });
    expect(r.code).toBe(0);
    expect(r.summary).toContain("(number only, not failing): 1");
    expect(r.out).not.toContain("CONFIDENTIAL-ROW");
    expect(r.out).not.toContain("secret_fn");
  });

  it("works without the login-table dump: checks public + english, says auth was NOT checked", () => {
    const r = run({ auth: false });
    expect(r.code).toBe(0);
    expect(r.summary).toContain("auth was NOT checked");
    expect(r.summary).toContain("PASSED for public + english only");
    expect(r.summary).not.toContain("auth.users |");
  });

  it("fails when main.dump is missing", () => {
    const res = spawnSync("bash", [script], { encoding: "utf8", env: { ...process.env, PLAIN_DIR: path.join(dir, "none"), PG_BIN: dir, RC_PASSWORD: "x" } });
    expect(res.status).not.toBe(0);
  });
});

describe("compare-counts.sh", () => {
  const out = () => path.join(dir, "out.md");
  const cmp = (b: string, a: string, r: string) => {
    try {
      execFileSync("bash", [compare, w("b", b), w("a", a), w("r", r), out()], { stdio: "pipe" });
      return 0;
    } catch (e) {
      return (e as { status: number }).status;
    }
  };
  it("is OK only when restored lies within [before, after] for every table", () => {
    expect(cmp("t 1\n", "t 3\n", "t 2\n")).toBe(0);
    expect(cmp("t 1\n", "t 3\n", "t 4\n")).toBe(1);
    expect(cmp("t 3\n", "t 1\n", "t 2\n")).toBe(0); // the order of before/after does not matter
  });
  it("fails when nothing was compared", () => {
    expect(cmp("", "", "")).toBe(1);
  });
});
