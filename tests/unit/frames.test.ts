import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "@/lib/config/content";
import { checkFrame, normalizeFrame, scaleBand, type FrameFile } from "@/lib/frames/frame";
import { DESTINATION_FRAME_FILE, FRAMES_DIR, resolveFamily, resolveFrameFile } from "../../scripts/lib/frameImport";
import { REAL_FAMILY_ID } from "../../scripts/lib/realFamily";
import { TEST_FAMILY_ID } from "../../scripts/lib/seed";

const tagsB = new Set((JSON.parse(readFileSync(path.join(CONTENT_DIR, "tags", "tags_B.json"), "utf8")) as { tags: { key: string }[] }).tags.map((t) => t.key));
const destination = () => JSON.parse(readFileSync(path.join(FRAMES_DIR, DESTINATION_FRAME_FILE), "utf8")) as FrameFile;

describe("Destination C1 & C2 · Progress Test Units 1–12 frame (content/frames)", () => {
  it("is a valid 60-item Track B frame whose tags all exist in tags_B.json", () => {
    const r = checkFrame(destination(), tagsB);
    expect(r.ok, r.ok ? "" : r.errors.join("\n")).toBe(true);
  });

  it("has the agreed parts, scale and per-item tags", () => {
    const f = destination();
    expect(f.title).toBe("Destination C1 & C2 · Progress Test Units 1–12");
    expect(f.track).toBe("B");
    expect(f.total).toBe(60);
    expect(f.parts.map((p) => [p.key, p.name, p.from, p.to])).toEqual([
      ["A", "Trắc nghiệm ngữ pháp", 1, 12],
      ["B", "Điền từ vào đoạn văn", 13, 22],
      ["C", "Viết lại câu", 23, 30],
      ["D", "Dạng từ", 31, 38],
      ["E", "Trắc nghiệm từ vựng", 39, 46],
      ["F", "Cụm động từ", 47, 53],
      ["G", "Thành ngữ", 54, 60],
    ]);
    const byTag = (tag: string) => f.items.filter((i) => i.tag_key === tag).map((i) => i.n);
    expect(byTag("cau-dieu-kien-dao-ngu")).toEqual([4, 5, 6, 11, 12, 17, 18, 20, 25]);
    expect(byTag("wish-would-rather")).toEqual([3, 21, 22, 27, 28]);
    expect(byTag("modal-suy-doan")).toEqual([8, 9, 10, 15, 26, 30]);
    const passive = byTag("bi-dong-nho-tuong-thuat");
    expect(passive).toEqual(Array.from({ length: 30 }, (_, i) => i + 1).filter((n) => ![4, 5, 6, 11, 12, 17, 18, 20, 25, 3, 21, 22, 27, 28, 8, 9, 10, 15, 26, 30].includes(n)));
    expect(byTag("dang-tu")).toEqual([31, 32, 33, 34, 35, 36, 37, 38]);
    expect(byTag("tu-vung-ngu-canh")).toEqual([39, 40, 41, 42, 43, 44, 45, 46]);
    expect(byTag("cum-dong-tu")).toEqual([47, 48, 49, 50, 51, 52, 53]);
    expect(byTag("thanh-ngu")).toEqual([54, 55, 56, 57, 58, 59, 60]);
    // part of each item agrees with the part ranges
    for (const it of f.items) expect(f.parts.find((p) => p.key === it.part && it.n >= p.from && it.n <= p.to), `item ${it.n}`).toBeTruthy();
  });

  it("scale: 54–60 Rất tốt, 45–53 Tốt, 36–44 Trung bình, below 36 Cần ôn kỹ", () => {
    const { scale } = destination();
    expect([60, 54, 53, 45, 44, 36, 35, 0].map((n) => scaleBand(scale, n))).toEqual(["Rất tốt", "Rất tốt", "Tốt", "Tốt", "Trung bình", "Trung bình", "Cần ôn kỹ", "Cần ôn kỹ"]);
  });

  it("holds no question text: only these keys, short ids, no sentences", () => {
    const f = destination() as unknown as Record<string, unknown>;
    expect(Object.keys(f).sort()).toEqual(["items", "note", "parts", "scale", "title", "total", "track"]);
    for (const it of destination().items) expect(Object.keys(it).sort()).toEqual(["n", "part", "tag_key"]);
    expect(JSON.stringify(f.items)).not.toMatch(/\?|___|\.\s/);
  });
});

describe("checkFrame", () => {
  const base = (): FrameFile => ({
    title: "T",
    track: "B",
    total: 4,
    parts: [{ key: "A", name: "One", from: 1, to: 2 }, { key: "B", name: "Two", from: 3, to: 4 }],
    items: [{ n: 1, part: "A", tag_key: "dang-tu" }, { n: 2, part: "A", tag_key: "dang-tu" }, { n: 3, part: "B", tag_key: "thanh-ngu" }, { n: 4, part: "B", tag_key: "thanh-ngu" }],
    scale: [{ min: 3, max: 4, label: "Good" }, { min: 0, max: 2, label: "Work" }],
  });
  const errs = (f: unknown) => {
    const r = checkFrame(f, tagsB);
    return r.ok ? [] : r.errors;
  };

  it("accepts a valid frame, with or without a scale", () => {
    expect(errs(base())).toEqual([]);
    expect(errs({ ...base(), scale: null })).toEqual([]);
    const noScale: Partial<FrameFile> = base();
    delete noScale.scale;
    expect(errs(noScale)).toEqual([]);
  });

  it("reports missing, repeated and outside items, in Vietnamese, all at once", () => {
    const f = base();
    f.items = [{ n: 1, part: "A", tag_key: "dang-tu" }, { n: 1, part: "A", tag_key: "dang-tu" }, { n: 3, part: "B", tag_key: "thanh-ngu" }, { n: 9, part: "B", tag_key: "thanh-ngu" }];
    const e = errs(f).join("\n");
    expect(e).toMatch(/Thiếu câu số 2, 4/);
    expect(e).toMatch(/Câu số 1 bị liệt kê hai lần/);
    expect(e).toMatch(/Câu số 9 nằm ngoài/);
  });

  it("reports unknown tags, unknown parts, items outside their part and overlapping parts/scales", () => {
    const f = base();
    f.items[0] = { n: 1, part: "A", tag_key: "khong-co" };
    f.items[1] = { n: 2, part: "Z", tag_key: "dang-tu" };
    f.items[2] = { n: 3, part: "A", tag_key: "thanh-ngu" };
    const e = errs(f).join("\n");
    expect(e).toMatch(/Nhãn chưa có cho track B: khong-co/);
    expect(e).toMatch(/phần "Z" không có/);
    expect(e).toMatch(/Câu 3 nằm ngoài khoảng 1–2/);
    expect(errs({ ...base(), parts: [{ key: "A", name: "One", from: 1, to: 3 }, { key: "B", name: "Two", from: 3, to: 4 }] }).join()).toMatch(/chồng nhau/);
    expect(errs({ ...base(), scale: [{ min: 0, max: 3, label: "A" }, { min: 3, max: 4, label: "B" }] }).join()).toMatch(/Thang "A" và "B" chồng nhau/);
    expect(errs({ ...base(), scale: [{ min: 0, max: 9, label: "Far" }] }).join()).toMatch(/không hợp lệ/);
  });

  it("refuses unknown keys (so question text cannot slip in) and wrong shapes", () => {
    const f = base() as unknown as { items: Record<string, unknown>[] };
    f.items[0] = { n: 1, part: "A", tag_key: "dang-tu", stem: "Choose the correct answer" };
    expect(errs(f).join()).toMatch(/File khung đề sai/);
    expect(errs({ ...base(), total: "4" }).join()).toMatch(/File khung đề sai/);
    expect(errs(null).join()).toMatch(/File khung đề sai/);
  });

  it("normalizeFrame sorts items by number and drops the note", () => {
    const f = { ...base(), note: "x", items: [...base().items].reverse() };
    const n = normalizeFrame(f);
    expect(n.items.map((i) => i.n)).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(n)).not.toContain('"note"');
  });
});

describe("frame import paths and families", () => {
  it("accepts a bare file name or content/frames/<file>.json, and nothing that leaves the folder", () => {
    expect(resolveFrameFile("destination-c1-c2-progress-test-u1-12.json")).toBe(path.join(FRAMES_DIR, DESTINATION_FRAME_FILE));
    expect(resolveFrameFile(`content/frames/${DESTINATION_FRAME_FILE}`)).toBe(path.join(FRAMES_DIR, DESTINATION_FRAME_FILE));
    for (const bad of ["../x.json", "content/other/x.json", "/etc/passwd", "a/b.json", "x.txt", "x", "", "..\\x.json", "x.json; rm -rf", ".hidden.json"]) {
      expect(() => resolveFrameFile(bad), bad).toThrow(/không hợp lệ|nằm trong/);
    }
  });

  it("families: real, test or a uuid; anything else is refused", () => {
    expect(resolveFamily("real")).toBe(REAL_FAMILY_ID);
    expect(resolveFamily(" TEST ")).toBe(TEST_FAMILY_ID);
    expect(resolveFamily("11111111-2222-4333-8444-555555555555")).toBe("11111111-2222-4333-8444-555555555555");
    for (const bad of [undefined, "", "all", "11111111", "x'; drop table"]) expect(resolveFamily(bad), String(bad)).toBeNull();
  });
});
