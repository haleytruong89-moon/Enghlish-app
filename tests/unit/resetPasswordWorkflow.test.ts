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
    expect(yml).toMatch(/not-confirmed:[\s\S]*timeout-minutes: \d+/);
  });

  it("re-checks the confirmation with exact case in the first step (the job-level if is case-insensitive)", () => {
    expect(yml).toContain("CONFIRM: ${{ inputs.confirm }}");
    expect(yml).toContain('if [ "$CONFIRM" != "RESET" ]; then');
    expect(yml.indexOf('"$CONFIRM" != "RESET"')).toBeLessThan(yml.indexOf("actions/checkout@v5"));
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
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    for (const b of bodies) expect(b).not.toContain("${{");
    // inputs.* appear only on the env lines and in the job-level if
    const uses = lines.filter((l) => l.includes("inputs.") && !l.trimStart().startsWith("#"));
    for (const l of uses) expect(l, l).toMatch(/^\s+(RESET_LOGIN|RESET_FAMILY|CONFIRM): \$\{\{ inputs\.\w+ \}\}$|^\s+if: \$\{\{ inputs\.confirm [=!]= 'RESET' \}\}$/);
  });

  it("never echoes a secret: the presence check prints names only, output is filtered, nothing prints the password", () => {
    const bodies = runBodies().join("\n");
    expect(bodies).not.toMatch(/echo[^\n]*(\$RESET_PASSWORD|\$\{RESET_PASSWORD|\$DATABASE_URL|\$SUPABASE_SERVICE_ROLE_KEY|\$\{!v\})/);
    expect(bodies).not.toMatch(/\bset -x\b/);
    expect(bodies).toContain('test -n "${!v}" || missing="$missing $v"');
    expect(bodies).toContain('grep -v -i "postgres://\\|postgresql://\\|sb_secret_\\|eyJ"');
    expect(yml).not.toMatch(/ACTIONS_STEP_DEBUG/);
  });

  it("also drops any output line that contains the password itself, and guards an empty password", () => {
    const bodies = runBodies().join("\n");
    expect(bodies).toContain('grep -vF -f "$pwfile"');
    // an empty password must give an empty pattern file (a file with one empty line would match, and drop, every line)
    expect(bodies).toContain("grep -v '^$' > \"$pwfile\"");
    // both the summary and the raw output go through the filter
    expect((bodies.match(/scrub </g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("tells 'not changed' from 'maybe not changed' from 'changed' using the markers and exit code 3", () => {
    expect(yml).toContain('grep -q "^Đang gửi yêu cầu đổi mật khẩu"');
    expect(yml).toContain('grep -q "^Đã đổi mật khẩu"');
    expect(yml).toContain('"$status" -eq 3');
    expect(yml).not.toContain('"^Cảnh báo"');
    expect(yml).toContain("Có thể chưa đổi — thử đăng nhập bằng mật khẩu mới trước khi chạy lại.");
    expect(yml).toContain("Mật khẩu chưa đổi. Sửa theo dòng báo lỗi");
    expect(yml).toContain("không bị đăng xuất");
  });

  it("writes a Vietnamese summary that reminds the parent to delete the RESET_PASSWORD secret", () => {
    expect(yml).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(yml).toContain("## Đã đặt lại mật khẩu");
    expect(yml).toContain("## Chưa đặt lại được mật khẩu");
    expect(yml).toContain("## Chưa chắc đã đổi được mật khẩu");
    expect(yml).toMatch(/xóa secret \\`RESET_PASSWORD\\`/);
    expect(yml).toContain("mật khẩu bên Launcher cũng đổi");
  });
});
