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

  it("dumps public + english and, separately, the two login tables", () => {
    expect(yml).toContain("--schema=public --schema=english");
    expect(yml).toContain("--table=auth.users --table=auth.identities");
    expect(yml).toContain("learning-os-auth-");
  });

  it("restores into a throwaway Postgres 17 service container BEFORE encrypting, and fails the job on a count mismatch", () => {
    expect(yml).toContain("image: postgres:17");
    expect(yml).toContain('PG_MAJOR: "17"');
    expect(at("Restore check - restore both dumps")).toBeGreaterThan(at("id: dump"));
    expect(at("Restore check - restore both dumps")).toBeLessThan(at("name: Encrypt with age"));
    for (const t of ["english.learners", "english.members", "auth.users"]) expect(yml, t).toContain(t);
    expect(yml).toContain("exit 1");
    expect(yml).toContain("restore check failed: row counts differ");
    // the encrypted copy is kept even when the check fails (the job still goes red), so a good backup is never lost
    expect(yml).toMatch(/Encrypt with age\s+id: encrypt\s+if: \$\{\{ always\(\) && steps\.dump\.outcome == 'success' \}\}/);
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

  it("prints counts only: no table content, no dump text, no secret", () => {
    // nothing selects row data; the only SELECTs are count(*) and the error text of pg_restore is never echoed except object-name errors
    const selects = [...yml.matchAll(/select [^\n"]*/g)].map((m) => m[0]);
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) expect(s, s).toMatch(/count\(\*\)|null::|^select 1/);
    expect(yml).toContain("count only, text not shown");
    expect(yml).not.toMatch(/echo[^\n]*\$\{?DATABASE_URL|echo[^\n]*\$\{?BACKUP_AGE_RECIPIENT|set -x/);
    expect(yml).toContain("POSTGRES_PASSWORD: throwaway-inside-this-job");
  });
});
