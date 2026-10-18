import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const yml = readFileSync(path.join(process.cwd(), ".github", "workflows", "backup.yml"), "utf8");
const at = (needle: string) => {
  const i = yml.indexOf(needle);
  if (i < 0) throw new Error(`not in backup.yml: ${needle}`);
  return i;
};

describe("backup workflow (S5c: login tables + verified restore)", () => {
  it("stays weekly and manual-runnable, with read-only permissions", () => {
    expect(yml).toContain('cron: "17 19 * * 6"');
    expect(yml).toContain("workflow_dispatch:");
    expect(yml).toMatch(/permissions:\s+contents: read/);
  });

  it("restores into a throwaway Postgres 17 service container BEFORE encrypting, by calling the tested script", () => {
    expect(yml).toContain("image: postgres:17");
    expect(yml).toContain('PG_MAJOR: "17"');
    expect(yml).toContain("actions/checkout@v5"); // the script lives in the repo
    expect(at("id: restore_check")).toBeGreaterThan(at("id: main_dump"));
    expect(at("id: restore_check")).toBeGreaterThan(at("id: auth_dump"));
    expect(at("id: restore_check")).toBeLessThan(at("id: encrypt"));
    expect(yml).toContain("bash scripts/ops/restore-check.sh");
    // the pass/fail decision is NOT in a piped sub-shell any more (it was, and the job could never fail): no `| tee` around a flag
    expect(yml).not.toMatch(/failed=1/);
    expect(yml).not.toMatch(/\|\s*tee\s+-a/);
    // the encrypted copy is kept even when the check fails (the job still goes red), so a good backup is never lost
    expect(yml).toMatch(/Encrypt with age\s+id: encrypt\s+if: \$\{\{ always\(\) && steps\.main_dump\.outcome == 'success' \}\}/);
  });

  it("dumps public + english first in its own step; the login tables are a separate step that may fail without stopping the upload, and turns the run red at the end", () => {
    expect(yml).toContain("--schema=public --schema=english");
    expect(yml).toContain("--table=auth.users --table=auth.identities");
    expect(at("id: main_dump")).toBeLessThan(at("id: auth_dump"));
    expect(yml).toMatch(/id: auth_dump\s+continue-on-error: true/);
    expect(yml).toMatch(/if: \$\{\{ always\(\) && steps\.auth_dump\.outcome == 'failure' \}\}/);
    expect(at("Mark the run red")).toBeGreaterThan(at("name: Upload encrypted artifact"));
    // the encrypt step takes the login dump only if it exists
    expect(yml).toContain('if [ -f "$PLAIN_DIR/auth.dump" ]');
  });

  it("keeps encryption: plain dumps only in RAM-backed temp, only *.dump.age uploaded, plain files shredded", () => {
    expect(yml).toContain("mktemp -d -p /dev/shm");
    expect(yml).toContain("age --encrypt --recipient");
    expect(yml).toContain("path: backup/*.dump.age");
    expect(yml).not.toMatch(/path:[^\n]*\.dump(?!\.age)/);
    const upload = yml.slice(at("uses: actions/upload-artifact@v4"), at("name: Remove the plain dumps"));
    expect(upload).not.toContain("PLAIN_DIR");
    expect(upload).not.toContain("/dev/shm");
    expect(yml).toContain("shred -u");
    expect(yml).toMatch(/Remove the plain dumps\s+if: \$\{\{ always\(\) \}\}/);
    // the age recipient is still a secret, checked to be a PUBLIC key
    expect(yml).toContain("secrets.BACKUP_AGE_RECIPIENT");
    expect(yml).toContain("age1*)");
  });

  it("prints counts only: the SQL files select counts, the workflow echoes no secret", () => {
    for (const f of ["counts-english.sql", "counts-auth.sql"]) {
      const sql = readFileSync(path.join(process.cwd(), "scripts", "ops", f), "utf8").replace(/^--.*$/gm, "");
      expect(sql, f).toMatch(/count\(\*\)/);
      expect(sql, f).not.toMatch(/select\s+\*|email|password|encrypted_password|identity_data/i);
    }
    const script = readFileSync(path.join(process.cwd(), "scripts", "ops", "restore-check.sh"), "utf8");
    expect(script).toContain("Error text and row data are never shown.");
    expect(script).not.toMatch(/cat\s+"?\$work\/(main|auth)\.err/);
    expect(yml).not.toMatch(/echo[^\n]*\$\{?DATABASE_URL|echo[^\n]*\$\{?BACKUP_AGE_RECIPIENT|set -x/);
    expect(yml).toContain("POSTGRES_PASSWORD: throwaway-inside-this-job");
  });
});
