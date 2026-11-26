import { describe, expect, it } from "vitest";
import { aiSettingsCopy, purgePage, shellCopy } from "@/lib/copy/vi";
import { buildNav, QUICK_KEYS, SECTION_KEYS } from "@/lib/shell/nav";

const NG = "b0000000-0000-4000-8000-000000000002";
const AN = "a0000000-0000-4000-8000-000000000001";
const F = { revisionsReady: true };
const hrefs = (n: ReturnType<typeof buildNav>) =>
  [...n.quick.map((q) => q.href), ...n.sections.flatMap((s) => [s.href, ...s.children.map((c) => c.href)]), ...n.parent.map((p) => p.href)].filter((h): h is string => h !== null);

describe("staff sidebar model (hướng B, 26/11)", () => {
  it("3 quick buttons first: Chấm bài · Giao bài · Ghi buổi học", () => {
    const n = buildNav("tutor", NG, F);
    expect(n.quick.map((q) => q.key)).toEqual([...QUICK_KEYS]);
    expect(n.quick.map((q) => [q.label, q.href])).toEqual([
      [shellCopy.quick.grade, `/learners/${NG}/finish`],
      [shellCopy.quick.assign, `/learners/${NG}/assign`],
      [shellCopy.quick.note, `/learners/${NG}/notes/new`],
    ]);
  });

  it("5 sections then Hồ sơ học sinh, with the agreed labels", () => {
    const n = buildNav("tutor", NG, F);
    expect(n.sections.map((s) => s.key)).toEqual(["desk", "work", "sessions", "progress", "plan", "profile"]);
    expect(n.sections.map((s) => s.key)).toEqual([...SECTION_KEYS]);
    expect(n.sections.map((s) => s.label)).toEqual(["Hôm nay", "Bài tập", "Buổi học", "Tiến bộ", "Kế hoạch", "Hồ sơ học sinh"]);
    for (const s of n.sections) expect(s.label).toBe(shellCopy.sections[s.key]);
  });

  it("section roots", () => {
    const n = buildNav("tutor", NG, F);
    const root = (k: string) => n.sections.find((s) => s.key === k)!.href;
    expect(root("desk")).toBe(`/?learner=${NG}`);
    expect(root("work")).toBe(`/learners/${NG}/assigned`);
    expect(root("sessions")).toBe(`/learners/${NG}/notes`);
    expect(root("progress")).toBe(`/learners/${NG}/progress`);
    expect(root("plan")).toBe(`/learners/${NG}/curricula`);
    expect(root("profile")).toBe(`/learners/${NG}/profile`);
  });

  it("only Hồ sơ học sinh has sub-pages (Đầu vào và ghi chú · Con hỏi Gia sư · Nhập kỹ năng đọc); Tiến bộ and Kế hoạch use tabs", () => {
    const n = buildNav("tutor", NG, F);
    const kids = (k: string) => n.sections.find((s) => s.key === k)!.children.map((c) => c.key);
    expect(kids("profile")).toEqual(["profile", "tutorAsks", "reading"]);
    for (const k of ["desk", "work", "sessions", "progress", "plan"]) expect(kids(k), k).toEqual([]);
  });

  it("no 'Chờ duyệt', 'Giao bài', 'Bài đã giao', 'Ghi kết quả' section any more", () => {
    const keys = buildNav("tutor", NG, F).sections.map((s) => s.key as string);
    for (const gone of ["inbox", "assign", "assigned", "results", "curricula", "roadmap", "knowledge"]) expect(keys).not.toContain(gone);
  });

  it("every link is about the chosen child and no other", () => {
    const all = hrefs(buildNav("parent", NG, F));
    for (const h of all) {
      expect(h, h).not.toContain(AN);
      expect(h.includes(NG) || h.startsWith("/settings/ai"), h).toBe(true);
    }
  });

  it("only the parent gets the 'Phụ huynh' group", () => {
    expect(buildNav("tutor", NG, F).parent).toEqual([]);
    expect(buildNav("parent", NG, F).parent.map((x) => [x.key, x.label])).toEqual([["aiSettings", aiSettingsCopy.navLink], ["delete", purgePage.link]]);
  });

  it("with no child yet: no quick buttons, only the desk has a link", () => {
    const n = buildNav("tutor", null, F);
    expect(n.quick).toEqual([]);
    expect(n.sections.find((s) => s.key === "desk")!.href).toBe("/");
    for (const s of n.sections.filter((x) => x.key !== "desk")) expect([s.href, s.children], s.key).toEqual([null, []]);
  });
});
