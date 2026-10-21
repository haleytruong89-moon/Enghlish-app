import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const yml = readFileSync(path.join(process.cwd(), ".github", "workflows", "reset-password.yml"), "utf8");
const lines = yml.split("\n");

/** Bodies of every `run: |` block (the shell scripts). */
function runBodies(): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run: \|\s*$/.exec(lines[i] as string);
    if (!m) continue;
    const indent = (m[1] as string).length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j] as string;
      if (l.trim() !== "" && l.length - l.trimStart().length <= indent) break;
      body.push(l);
    }
    out.push(body.join("\n"));
  }
  return out;
}

describe("reset-password workflow", () => {
  it("is manual only (workflow_dispatch), with read-only permissions", () => {
    const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
    expect(on).toContain("workflow_dispatch:");
    expect(on).not.toMatch(/\b(push|pull_request|schedule|workflow_run|repository_dispatch):/);
    expect(yml).toMatch(/permissions:\s+contents: read/);
  });

  it("has the confirm / login / family inputs, family a real|test choice defaulting to real", () => {
    expect(yml).toContain("Gõ RESET để xác nhận");
    expect(yml).toContain("Tên đăng nhập ngắn (vd. an) hoặc email");
    expect(yml).toMatch(/family:[\s\S]*?type: choice\s+default: real\s+options:\s+- real\s+- test/);
  });

  it("only runs when the confirm input is RESET, otherwise a not-confirmed job fails with a message", () => {
    expect(yml).toContain("if: ${{ inputs.confirm == 'RESET' }}");
    expect(yml).toContain("if: ${{ inputs.confirm != 'RESET' }}");
    expect(yml).toContain("ô xác nhận phải là RESET");
  });

  it("uses the same pinned actions as the family workflow", () => {
    expect(yml).toContain("actions/checkout@v5");
    expect(yml).toContain("actions/setup-node@v5");
    expect(yml).toContain("npm ci");
    expect(yml).toContain("npm run db:reset-password");
  });

  it("takes the three secrets and the Supabase URL variable", () => {
    for (const s of ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESET_PASSWORD"]) {
      expect(yml).toContain(`${s}: \${{ secrets.${s} }}`);
    }
    expect(yml).toContain("NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}");
  });

  it("passes the inputs through env only: no ${{ }} expression inside any shell script", () => {
    expect(yml).toContain("RESET_LOGIN: ${{ inputs.login }}");
    expect(yml).toContain("RESET_FAMILY: ${{ inputs.family }}");
    const bodies = runBodies();
    expect(bodies.length).toBeGreaterThanOrEqual(3);
    for (const b of bodies) expect(b).not.toContain("${{");
    // inputs.* appear only on the env lines and in the job-level if
    const uses = lines.filter((l) => l.includes("inputs.") && !l.trimStart().startsWith("#"));
    for (const l of uses) expect(l, l).toMatch(/^\s+(RESET_LOGIN|RESET_FAMILY): \$\{\{ inputs\.\w+ \}\}$|^\s+if: \$\{\{ inputs\.confirm [=!]= 'RESET' \}\}$/);
  });

  it("never echoes a secret: the presence check prints names only, output is filtered, nothing prints the password", () => {
    const bodies = runBodies().join("\n");
    expect(bodies).not.toMatch(/echo[^\n]*(\$RESET_PASSWORD|\$\{RESET_PASSWORD|\$DATABASE_URL|\$SUPABASE_SERVICE_ROLE_KEY|\$\{!v\})/);
    expect(bodies).not.toMatch(/\bset -x\b/);
    expect(bodies).toContain('test -n "${!v}" || missing="$missing $v"');
    expect(bodies).toContain('grep -v -i "postgres://\\|postgresql://\\|sb_secret_\\|eyJ"');
    expect(yml).not.toMatch(/ACTIONS_STEP_DEBUG/);
  });

  it("writes a Vietnamese summary that reminds the parent to delete the RESET_PASSWORD secret", () => {
    expect(yml).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(yml).toContain("## Đã đặt lại mật khẩu");
    expect(yml).toContain("## Chưa đặt lại được mật khẩu");
    expect(yml).toMatch(/xóa secret \\`RESET_PASSWORD\\`/);
    expect(yml).toContain("mật khẩu bên Launcher cũng đổi");
  });
});
