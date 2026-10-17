import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "@/lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const read = (file: string) => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

/** The text of `create or replace function english.<name>(…)` up to the closing marker. */
function fnText(sql: string, name: string, endMarker: string): string[] {
  const start = sql.indexOf(`create or replace function english.${name}(`);
  const end = sql.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`${name} not found`);
  return sql.slice(start, end + endMarker.length).split("\n");
}
const PURGE_END = "grant execute on function english.eng_purge_learner(uuid, uuid) to service_role;";
const isSubsequence = (old: string[], now: string[]) => {
  let i = 0;
  for (const line of now) if (i < old.length && line === old[i]) i++;
  return { i, ok: i === old.length };
};

describe("0014_tutor_work.sql", () => {
  const sql = read("0014_tutor_work.sql");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("eng_purge_learner keeps EVERY line of the 0010 version (0014 only adds), and deletes the new tables before lesson_notes and learners", () => {
    const old = fnText(read("0010_review.sql"), "eng_purge_learner", PURGE_END);
    const now = fnText(sql, "eng_purge_learner", PURGE_END);
    const r = isSubsequence(old, now);
    expect(r.ok, `lost line: ${old[r.i]}`).toBe(true);
    expect(now.length).toBeGreaterThan(old.length);

    const body = now.join("\n");
    const order = ["tag_marks", "recheck_events", "results", "lesson_notes", "learners"].map((t) => body.indexOf(`delete from english.${t} `));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // children before parents
    for (const key of ["tag_marks", "recheck_events", "results"]) expect(body, key).toContain(`'${key}'`);
  });

  it("eng_write_lesson_note (v1) keeps EVERY line of the 0010 version; 0014 adds only the check that refuses to replace a v2 note", () => {
    const end = "\nend\n$$;";
    const old = fnText(read("0010_review.sql"), "eng_write_lesson_note", end);
    const now = fnText(sql, "eng_write_lesson_note", end);
    const r = isSubsequence(old, now);
    expect(r.ok, `lost line: ${old[r.i]}`).toBe(true);
    const added = now.filter((l) => !old.includes(l)).join("\n");
    expect(added).toContain("v_prev.support_level is null");
    expect(added).toContain("(v2) cannot be edited with this form");
    expect(added.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).length).toBeLessThanOrEqual(8);
  });

  it("is expand-only: no drop of a table or column, no data deletes outside the purge function", () => {
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)/i);
    const withoutPurge = code.replace(/create or replace function english\.eng_purge_learner[\s\S]*?\n\$\$;/, "");
    expect(withoutPurge).not.toMatch(/\bdelete\s+from\b/i);
    // the only ALTER on an existing table touches lesson_notes: new columns + relaxing NOT NULL on support_level
    const alters = [...code.matchAll(/alter table (\S+) (add column|alter column)[^;]*;/gi)].map((m) => `${m[1]} ${m[2]}`);
    expect(new Set(alters)).toEqual(new Set(["english.lesson_notes add column", "english.lesson_notes alter column"]));
    expect(code).toContain("alter column support_level drop not null");
  });

  it("never touches schema public, and every new function is closed to anon and authenticated except where it is meant to be read", () => {
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
    for (const fn of ["eng_add_error_tag", "eng_record_result", "eng_tag_result_items", "eng_tag_episode", "eng_write_lesson_note_v2", "eng_weak_points", "eng_untagged_queue"]) {
      expect(code, fn).toMatch(new RegExp(`revoke execute on function english\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
      expect(code, fn).toMatch(new RegExp(`grant execute on function english\\.${fn}\\([^)]*\\) to service_role;`));
    }
    // every security definer function pins search_path
    for (const m of code.matchAll(/create or replace function english\.(\w+)\(([\s\S]*?)\n\$\$;/g)) {
      expect(m[0], `${m[1]} search_path`).toMatch(/set search_path = ''/);
    }
  });

  it("the append-only triggers are attached to the four history tables", () => {
    expect(code).toContain("array['results', 'tag_marks', 'recheck_events', 'test_frames']");
    expect(code).toContain("eng_forbid_mutation");
  });

  it("reads the recheck wait from the assessment policy (no number of days written in the functions)", () => {
    expect(code).toContain("delayedMinDaysFromLastExposure");
    expect(code).not.toMatch(/\+\s*14\b|interval\s+'14/);
  });
});

describe("0015_seed_tags.sql", () => {
  const sql = read("0015_seed_tags.sql");
  const json = (file: string) =>
    JSON.parse(readFileSync(path.join(CONTENT_DIR, "tags", file), "utf8")) as { track: string; tags: { key: string; label_vi: string; group_vi: string }[] };

  it("is exactly the two JSON files (tags_A.json, tags_B.json), row by row", () => {
    const expected = [json("tags_A.json"), json("tags_B.json")].flatMap((f) => f.tags.map((t) => [f.track, t.key, t.label_vi, t.group_vi].join("|")));
    const rows = [...sql.matchAll(/^\s*\('([AB])', '([^']+)', '([^']+)', '([^']+)'\),?$/gm)].map((m) => [m[1], m[2], m[3], m[4]].join("|"));
    expect(rows).toEqual(expected);
    expect(rows).toHaveLength(20);
  });

  it("matches the agreed Track B and Track A tag sets", () => {
    expect(json("tags_B.json").tags.map((t) => [t.key, t.label_vi])).toEqual([
      ["cau-dieu-kien-dao-ngu", "Câu điều kiện & đảo ngữ"],
      ["wish-would-rather", "Wish / would rather / had better"],
      ["modal-suy-doan", "Động từ khuyết thiếu (suy đoán, khả năng)"],
      ["bi-dong-nho-tuong-thuat", "Bị động, nhờ ai làm, tường thuật"],
      ["dang-tu", "Dạng từ"],
      ["tu-vung-ngu-canh", "Từ vựng theo ngữ cảnh"],
      ["cum-dong-tu", "Cụm động từ"],
      ["thanh-ngu", "Thành ngữ"],
      ["tu-noi-lap-luan", "Từ nối & lập luận"],
      ["phat-am", "Phát âm"],
    ]);
    expect(json("tags_A.json").tags.map((t) => [t.key, t.label_vi])).toEqual([
      ["hien-tai-don", "Hiện tại đơn"],
      ["hien-tai-don-s-es", "Hiện tại đơn: thêm -s / -es"],
      ["gioi-tu-thoi-gian", "Giới từ chỉ thời gian: in / on / at"],
      ["qua-khu-don", "Quá khứ đơn"],
      ["so-sanh", "So sánh"],
      ["tu-vung-chu-de", "Từ vựng theo chủ đề"],
      ["doc-hieu", "Đọc hiểu (KET Reading)"],
      ["viet-cau", "Viết câu / đoạn ngắn"],
      ["nghe", "Nghe"],
      ["phat-am", "Phát âm"],
    ]);
  });

  it("is idempotent and records its version", () => {
    expect(sql).toContain("on conflict do nothing;");
    expect(sql.trim().endsWith("values ('0015') on conflict do nothing;")).toBe(true);
  });
});
