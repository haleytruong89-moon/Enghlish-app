import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientBase } from "pg";
import { checkFrame, normalizeFrame } from "../../lib/frames/frame";
import { REAL_FAMILY_ID } from "./realFamily";
import { TEST_FAMILY_ID } from "./seed";

/** Frame files live here and nowhere else (the workflow cannot be pointed at another path). */
export const FRAMES_DIR = fileURLToPath(new URL("../../content/frames", import.meta.url));

/** The first frame: Destination C1 & C2 · Progress Test Units 1–12 (60 items, Track B). */
export const DESTINATION_FRAME_FILE = "destination-c1-c2-progress-test-u1-12.json";

/** `real` / `test` / a family id → the family id, or null when the text is none of those. */
export function resolveFamily(text: string | undefined): string | null {
  const v = (text ?? "").trim().toLowerCase();
  if (v === "real") return REAL_FAMILY_ID;
  if (v === "test") return TEST_FAMILY_ID;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) ? v : null;
}

/**
 * A frame file inside content/frames (a bare name like `destination.json`, or `content/frames/destination.json`).
 * Anything with a directory part other than that, `..`, an absolute path or another extension is refused.
 */
export function resolveFrameFile(input: string, dir = FRAMES_DIR): string {
  const v = input.trim().replace(/\\/g, "/").replace(/^content\/frames\//, "");
  if (!/^[a-z0-9][a-z0-9._-]*\.json$/i.test(v) || v.includes("..")) {
    throw new Error("Tên file khung đề không hợp lệ — chỉ nhận file .json nằm trong content/frames/.");
  }
  const full = path.join(dir, v);
  if (path.dirname(full) !== path.resolve(dir)) throw new Error("File khung đề phải nằm trong content/frames/.");
  return full;
}

export type ImportAction = "created" | "unchanged" | "new_version";
export type ImportResult = { action: ImportAction; id: string; title: string; total: number; track: string };

/**
 * Put one frame (already parsed JSON) into a family. Idempotent: the same content again changes nothing; a changed
 * file becomes a NEW version that supersedes the current one (frames are append-only, results keep pointing at the version used).
 * Needs a privileged connection (DATABASE_URL owner). The database trigger re-checks the frame (items cover 1..N once, tags exist).
 */
export async function importFrame(client: ClientBase, familyId: string, raw: unknown): Promise<ImportResult> {
  const reg = await client.query<{ ok: boolean }>("select to_regclass('english.test_frames') is not null as ok");
  if (!reg.rows[0]?.ok) throw new Error("Database chưa có bảng khung đề (migration 0014) — áp migration trước. Chưa nhập gì.");

  const fam = await client.query("select 1 from english.families where id = $1", [familyId]);
  if (!fam.rowCount) throw new Error("Gia đình này chưa có trong database — tạo gia đình trước (workflow Create real family / Seed test family). Chưa nhập gì.");

  const track = (raw as { track?: unknown } | null)?.track;
  if (typeof track !== "string") throw new Error('File khung đề thiếu "track".');
  const known = await client.query<{ key: string }>(
    `select key from english.error_tags
     where track_id = $1 and retired_at is null and (family_id is null or family_id = $2)`,
    [track, familyId],
  );
  const checked = checkFrame(raw, new Set(known.rows.map((r) => r.key)));
  if (!checked.ok) throw new Error(checked.errors.join("\n"));
  const frame = checked.frame;
  const norm = normalizeFrame(frame);

  const tr = await client.query("select 1 from english.tracks where id = $1", [frame.track]);
  if (!tr.rowCount) throw new Error(`Track "${frame.track}" không có trong database.`);

  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`frame:${familyId}:${frame.track}:${frame.title.toLowerCase()}`]);
    const current = await client.query<{ id: string; same: boolean }>(
      `select f.id,
              (f.total_items = $4 and f.parts = $5::jsonb and f.items = $6::jsonb and f.scale is not distinct from $7::jsonb) as same
       from english.test_frames f
       where f.family_id = $1 and f.track_id = $2 and lower(f.title) = lower($3)
         and not exists (select 1 from english.test_frames f2 where f2.supersedes_id = f.id)`,
      [familyId, frame.track, frame.title, norm.total, JSON.stringify(norm.parts), JSON.stringify(norm.items), norm.scale === null ? null : JSON.stringify(norm.scale)],
    );
    const cur = current.rows[0];
    if (cur?.same) {
      await client.query("commit");
      return { action: "unchanged", id: cur.id, title: frame.title, total: frame.total, track: frame.track };
    }
    const ins = await client.query<{ id: string }>(
      `insert into english.test_frames(family_id, track_id, title, total_items, parts, items, scale, supersedes_id)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8) returning id`,
      [familyId, frame.track, frame.title, norm.total, JSON.stringify(norm.parts), JSON.stringify(norm.items), norm.scale === null ? null : JSON.stringify(norm.scale), cur?.id ?? null],
    );
    const id = (ins.rows[0] as { id: string }).id;
    await client.query(
      `insert into english.audit_log(action, family_id, payload)
       values ('frame.imported', $1, jsonb_build_object('frame', $2::uuid, 'total_items', $3::int, 'new_version', $4::boolean))`,
      [familyId, id, frame.total, !!cur],
    );
    await client.query("commit");
    return { action: cur ? "new_version" : "created", id, title: frame.title, total: frame.total, track: frame.track };
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

/** Read a frame file from content/frames and import it. */
export async function importFrameFile(client: ClientBase, familyId: string, file: string, dir = FRAMES_DIR): Promise<ImportResult> {
  let text: string;
  try {
    text = await readFile(resolveFrameFile(file, dir), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Không thấy file khung đề "${file}" trong content/frames/.`);
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`File khung đề "${file}" không phải JSON hợp lệ.`);
  }
  return importFrame(client, familyId, raw);
}
