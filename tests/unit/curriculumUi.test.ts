import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => createElement("a", { href: p.href }, p.children) }));
import { CurriculumCard } from "@/components/curriculum/CurriculumCard";
import { curriculumCopy } from "@/lib/copy/vi";
import { buildCards, taughtChoices } from "@/lib/curriculum/shape";
import { TaughtUnitsPicker } from "@/components/curriculum/TaughtUnitsPicker";
import { MapTable } from "@/components/curriculum/MapTable";

const L = "b0000000-0000-4000-8000-000000000001";
const C = "c0000000-0000-4000-8000-0000000000c1";
const units = Array.from({ length: 26 }, (_, i) => ({ version_id: "v1", code: `U${i + 1}`, ord: i + 1, title: `Unit ${i + 1}`, section: null, page: null, skipped: false }));
const ev = (code: string, status: string, n: number) => ({ id: `e${String(n).padStart(3, "0")}`, curriculum_id: C, unit_code: code, status, created_at: `2026-11-0${1 + Math.floor(n / 10)}T0${n % 10}:00:00Z` });
const rows = {
  curricula: [{ id: C, title: "Destination C1&C2", level_note: "C1–C2", created_at: "2026-11-08T00:00:00Z" }],
  versions: [{ id: "v1", curriculum_id: C, version: 1, status: "approved", error_code: null }],
  units,
  points: [{ version_id: "v1", code: "U7", tag_key: "bi-dong-nho-tuong-thuat", ord: 1 }],
  events: [...Array.from({ length: 12 }, (_, i) => ev(`U${i + 1}`, "done", i + 1)), ev("U3", "skipped", 13), ev("U13", "in_progress", 14)],
};

describe("Giáo trình screens", () => {
  const card = buildCards(rows)[0]!;
  it("the card shows the level note, 'đang học đến' U13 and coverage 11/25 · 44 %, and links to the map and unit statuses", () => {
    const html = renderToStaticMarkup(createElement(CurriculumCard, { card, learnerId: L, aiAllowed: true, aiReason: null }));
    expect(html).toContain("C1–C2");
    expect(html).toContain(curriculumCopy.currentLine("U13", "Unit 13"));
    expect(html).toContain(curriculumCopy.coverage(11, 25, 44));
    expect(html).toContain(`href="/curricula/versions/v1"`);
    expect(html).toContain(`href="/learners/${L}/curricula/${C}"`);
    expect(html).toContain(curriculumCopy.loadToc);
  });
  it("the map table lists points by name", () => {
    const html = renderToStaticMarkup(createElement(MapTable, {
      units: [{ code: "U7", title: "Passives and causatives", section: "Grammar", page: 54, skipped: false, points: ["bi-dong-nho-tuong-thuat"], missing_points: [], needs_review: false, review_reason: null, flags: [], origin: "ai", ai_index: 6, dropped: false, edit_reason: null }],
      labelOf: { "bi-dong-nho-tuong-thuat": "Bị động, nhờ ai làm, tường thuật" },
    }));
    expect(html).toContain("Bị động, nhờ ai làm, tường thuật");
  });
  it("the session chooser offers the current unit and the next one as chips, the rest in a select (skipped U3 not offered)", () => {
    const html = renderToStaticMarkup(createElement(TaughtUnitsPicker, { choices: taughtChoices([card]), value: [], onChange: () => undefined }));
    expect(html).toContain(`data-testid="taught-${C}-U13"`);
    expect(html).toContain(`data-testid="taught-${C}-U14"`);
    expect(html).not.toContain(`data-testid="taught-${C}-U12"`);
    expect(html).not.toContain(">U3 · Unit 3<");
  });
});

describe("27/11: a curriculum that never had an approved table of contents can be removed", () => {
  const C2 = "c0000000-0000-4000-8000-0000000000c2";
  const C3 = "c0000000-0000-4000-8000-0000000000c3";
  const extra = {
    ...rows,
    curricula: [...rows.curricula, { id: C2, title: "Global english", level_note: null, created_at: "2026-11-26T00:00:00Z" }, { id: C3, title: "Global English 6", level_note: null, created_at: "2026-11-26T01:00:00Z" }],
    versions: [
      ...rows.versions,
      { id: "v2", curriculum_id: C2, version: 1, status: "ai_failed", error_code: "http_400" },
      { id: "v3", curriculum_id: C3, version: 1, status: "discarded", error_code: "http_400" },
    ],
  };
  it("a curriculum whose every version was given up leaves the list; the failed one stays until removed", () => {
    expect(buildCards(extra).map((c) => c.id)).toEqual([C, C2]);
  });
  it("the failed card has 'Xóa giáo trình này'; a card with an approved table of contents never has it", () => {
    const [ok, failed] = buildCards(extra);
    const f = renderToStaticMarkup(createElement(CurriculumCard, { card: failed!, learnerId: L, aiAllowed: true, aiReason: null }));
    expect(f).toContain(`data-testid="curriculum-remove-${C2}"`);
    expect(f).toContain(curriculumCopy.remove);
    const o = renderToStaticMarkup(createElement(CurriculumCard, { card: ok!, learnerId: L, aiAllowed: true, aiReason: null }));
    expect(o).not.toContain("curriculum-remove-");
  });
  it("the button never shows while the AI reads, on a hand-made draft, or beside an approved version with a draft open", () => {
    const card = (status: string, approved: boolean) => {
      const c = { ...extra, versions: [...(approved ? [{ id: "va", curriculum_id: C2, version: 1, status: "approved", error_code: null }] : []), { id: "vb", curriculum_id: C2, version: approved ? 2 : 1, status, error_code: null }] };
      return renderToStaticMarkup(createElement(CurriculumCard, { card: buildCards(c).find((x) => x.id === C2)!, learnerId: L, aiAllowed: true, aiReason: null }));
    };
    expect(card("extracting", false)).not.toContain("curriculum-remove-");
    expect(card("draft", false)).not.toContain("curriculum-remove-");
    expect(card("draft", true)).not.toContain("curriculum-remove-");
    expect(card("ai_failed", false)).toContain("curriculum-remove-");
  });
  it("isRemovedCurriculum: all discarded (at least one) only", async () => {
    const { isRemovedCurriculum } = await import("@/lib/curriculum/shape");
    expect(isRemovedCurriculum(["discarded", "discarded"])).toBe(true);
    expect(isRemovedCurriculum(["discarded", "draft"])).toBe(false);
    expect(isRemovedCurriculum(["superseded", "discarded"])).toBe(false);
    expect(isRemovedCurriculum([])).toBe(false);
  });
});
