import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESTINATION_FRAME_FILE, FRAMES_DIR, importFrame, importFrameFile } from "../../scripts/lib/frameImport";
import { createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TSX = `${ROOT}node_modules/.bin/tsx`;

describe("S5b-1 step 3: importing a test frame", () => {
  let db: TestDb;
  let s: Seeded;
  const q = async <R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const n = async (sql: string, params: unknown[] = []) => ((await q<{ n: number }>(sql, params))[0] as { n: number }).n;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("imports the Destination U1–12 frame into a family, once", async () => {
    const r = await importFrameFile(db.client, s.familyId, DESTINATION_FRAME_FILE);
    expect(r).toMatchObject({ action: "created", title: "Destination C1 & C2 · Progress Test Units 1–12", total: 60, track: "B" });
    const f = (await q<{ total_items: number; family_id: string; track_id: string; items: { n: number; tag_key: string }[]; parts: unknown[]; scale: { label: string }[]; supersedes_id: string | null }>(
      "select * from english.test_frames where id = $1", [r.id]))[0];
    expect(f).toMatchObject({ total_items: 60, family_id: s.familyId, track_id: "B", supersedes_id: null });
    expect(f?.items).toHaveLength(60);
    expect(f?.parts).toHaveLength(7);
    expect(f?.scale.map((b) => b.label)).toEqual(["Rất tốt", "Tốt", "Trung bình", "Cần ôn kỹ"]);
    expect(f?.items.find((i) => i.n === 25)?.tag_key).toBe("cau-dieu-kien-dao-ngu");
    expect(await n("select count(*)::int as n from english.audit_log where action = 'frame.imported'")).toBe(1);
  });

  it("the same file again changes nothing (no new frame, no new audit row)", async () => {
    const before = [await n("select count(*)::int as n from english.test_frames"), await n("select count(*)::int as n from english.audit_log")];
    const again = await importFrameFile(db.client, s.familyId, DESTINATION_FRAME_FILE);
    expect(again.action).toBe("unchanged");
    expect([await n("select count(*)::int as n from english.test_frames"), await n("select count(*)::int as n from english.audit_log")]).toEqual(before);
  });

  it("an edited file becomes a NEW version that supersedes the current one; the old row stays", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "frames-"));
    const raw = JSON.parse(await readFile(path.join(FRAMES_DIR, DESTINATION_FRAME_FILE), "utf8")) as { items: { n: number; tag_key: string }[] };
    raw.items = raw.items.map((i) => (i.n === 1 ? { ...i, tag_key: "wish-would-rather" } : i));
    await writeFile(path.join(dir, "edited.json"), JSON.stringify(raw));
    const r = await importFrameFile(db.client, s.familyId, "edited.json", dir);
    expect(r.action).toBe("new_version");
    const rows = await q<{ id: string; supersedes_id: string | null }>("select id, supersedes_id from english.test_frames order by created_at");
    expect(rows).toHaveLength(2);
    expect(rows[1]?.supersedes_id).toBe(rows[0]?.id);
    // the edited content again is "unchanged" now; the original content would be yet another version
    expect((await importFrameFile(db.client, s.familyId, "edited.json", dir)).action).toBe("unchanged");
  });

  it("refuses a bad frame before writing anything, with Vietnamese messages", async () => {
    const before = await n("select count(*)::int as n from english.test_frames");
    const raw = JSON.parse(await readFile(path.join(FRAMES_DIR, DESTINATION_FRAME_FILE), "utf8")) as { items: { n: number; tag_key: string }[] };
    raw.items = raw.items.slice(0, 59);
    raw.items[3] = { ...(raw.items[3] as { n: number; tag_key: string }), tag_key: "khong-co" };
    await expect(importFrame(db.client, s.familyId, raw)).rejects.toThrow(/Thiếu câu số 60[\s\S]*Nhãn chưa có/);
    await expect(importFrame(db.client, s.familyId, { ...raw, track: "Z" })).rejects.toThrow();
    await expect(importFrame(db.client, "00000000-0000-4000-8000-000000000000", raw)).rejects.toThrow(/chưa có trong database/);
    await expect(importFrame(db.client, s.familyId, { nothing: true })).rejects.toThrow(/thiếu "track"/);
    await expect(importFrameFile(db.client, s.familyId, "khong-co-file.json")).rejects.toThrow(/Không thấy file/);
    await expect(importFrameFile(db.client, s.familyId, "../package.json")).rejects.toThrow(/không hợp lệ/);
    expect(await n("select count(*)::int as n from english.test_frames")).toBe(before);
  });

  it("a Track A tag on the Track B frame is refused (tags are per track)", async () => {
    const raw = JSON.parse(await readFile(path.join(FRAMES_DIR, DESTINATION_FRAME_FILE), "utf8")) as { items: { n: number; tag_key: string }[] };
    raw.items = raw.items.map((i) => (i.n === 2 ? { ...i, tag_key: "hien-tai-don" } : i));
    await expect(importFrame(db.client, s.familyId, raw)).rejects.toThrow(/Nhãn chưa có cho track B: hien-tai-don/);
  });

  it("the CLI imports into the test family and prints a plain sentence; wrong arguments are explained", async () => {
    const env = { PATH: process.env.PATH ?? "", DATABASE_URL: db.url } as unknown as NodeJS.ProcessEnv;
    const none = spawnSync(TSX, ["scripts/import-frame.ts", DESTINATION_FRAME_FILE], { cwd: ROOT, env, encoding: "utf8" });
    expect(none.status).toBe(1);
    expect(none.stderr).toMatch(/--family/);
    const ok = spawnSync(TSX, ["scripts/import-frame.ts", DESTINATION_FRAME_FILE, "--family=test"], { cwd: ROOT, env, encoding: "utf8" });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/Khung đề đã có đúng nội dung này|Nội dung đã đổi|Đã nhập khung đề mới/);
    expect(ok.stdout).toContain("60 câu");
    const noFamily = spawnSync(TSX, ["scripts/import-frame.ts", DESTINATION_FRAME_FILE, "--family=real"], { cwd: ROOT, env, encoding: "utf8" });
    expect(noFamily.status).toBe(1);
    expect(noFamily.stderr).toMatch(/chưa có trong database/); // the real family has not been created in this database
  });
});
