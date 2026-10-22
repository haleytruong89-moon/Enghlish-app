# SM-1 · Bản đồ kỹ năng (skill map) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every tag and every catalogue skill sits in exactly one group of one of 7 fixed domains (map `SM-1`, 40 groups); tutors and the parent pick tags and "skills practised today" by domain tabs instead of a flat list, a new family tag must be given a domain + group, and "Điểm cần chú ý" opens with 7 domain tiles (the "Kỹ năng đọc" table moves inside the Đọc tile).

**Architecture:** `content/skill_map/SM-1.json` is the source of truth (7 domains → 40 groups with short per-level descriptions → 110 leaves = 40 seed tags + 70 catalogue targets, levels, `hidden_in_picker`, `related`, assumed start level per track). One migration `0019_skill_map.sql` adds four versioned config tables (`skill_maps`, `skill_domains`, `skill_groups`, `skill_leaves`, immutable once published), seeds SM-1 from the JSON embedded verbatim (unit test compares it byte-for-byte as JSON + sha256), adds `error_tags.group_key` (custom tags only), `eng_add_error_tag_v2` (group required), `eng_set_tag_group` (group an old custom tag) and the read function `eng_skill_map(p_learner)`. The app gets a pure `lib/skillmap/` module (types, zod shape, loader, `groupTags` / `groupTargets` / `groupWeakPoints`), a reusable `DomainTabs` component, and switches every picker and the weak-points page to it. Level ±1 filtering, the level profile and every student screen are SM-2 — not here.

**Tech Stack:** Next.js App Router + TypeScript strict + Tailwind, Supabase Postgres (schema `english`), zod 4, Vitest (unit + DB tests on local Postgres), Playwright (CI only).

**Spec:** `docs/superpowers/specs/2026-10-21-skill-map-levels-design.md` (SM-1 = §2, the SM-1 rows of §5 and §6, §7, §8).

## Global Constraints

- Everything lives in schema `english`; never create or change anything in schema `public`; never `supabase db push` / `db reset --linked`.
- Migration `0019_skill_map.sql` is idempotent, expand-only, and its LAST line is `insert into english.schema_migrations(version) values ('0019') on conflict do nothing;`. Never edit 0001–0018, `content/catalogue_v0.2.json`, `content/target_sets_v1.json`, `content/tags/*.json` or `content/config.lock.json`.
- Every callable new function: `security definer`, `set search_path = ''`, `revoke execute … from public, anon, authenticated; grant execute … to service_role;`. Routes call them only after `requireAccess` (outside scope → 404). Internal helpers are revoked from `service_role` too.
- Published configuration is immutable: the four skill tables refuse INSERT/UPDATE/DELETE once their map is published and always refuse TRUNCATE. Changing the map = new version `SM-2` (new file + new migration), parent approves.
- No grant `on all tables`; RLS on for every new table.
- All UI text from `lib/copy/vi.ts` (rules: `docs/UX_COPY_GUIDE.md`). Track is configuration: no `=== "A"` / `=== "B"` anywhere (ESLint `no-restricted-syntax` blocks it, tests included).
- Students see nothing new in SM-1 (no level, no score, no skill map screen).
- Picker filtering by "current level ± 1", the level profile, `level_decisions`, `external_results` and student screens are SM-2. Core points (`core = true`) arrive with content v0.3: every SM-1 leaf has `core = false`.
- No usage counter exists today for tags, so the spec's "hay dùng lên đầu" is NOT built in SM-1 (see "Deviations").
- Before the PR: `npm run typecheck && npm run lint && npm test && npm run gen:config` green; Opus `reviewer`; PR description in Vietnamese with "SQL cần áp: 0019 (áp TRƯỚC khi thử preview hoặc gộp)".
- Commits end with the session's `Co-Authored-By` / `Claude-Session` lines.

## Deviations from the spec (decided here, reported to the parent in the PR)

| Spec | Plan | Why |
|---|---|---|
| §6 leaf column `task_level` | `task_from` / `task_to` (1–4), mirroring `level_from` / `level_to` | One catalogue skill spans two task levels (`B-T5-SUPPORT` = TL3–TL4); a single number would lose it. |
| §2 rule 2 "lá có cấp" | Catalogue skills of dimension L7 (in Tư duy & tự học) keep `task_*` empty; T1/T2 skills (in Đọc / Nghe) keep `level_*` empty | The domain's scale decides the field: L7 skills have only a CEFR reference, T1/T2 only a TL. Filled when content v0.3 gives them the other scale. |
| §5 "hay dùng lên đầu" | Not built | No usage data exists for tags; computing it needs a new query over `tag_marks` — left for SM-2 with the ±1 filter. |
| §6 "khóa phiên bản như cấu hình khác" | SM-1 is not added to `content/config.lock.json` / `gen:config`; it is locked by `skill_maps.source_hash` + a unit test that compares the JSON embedded in 0019 with the file | `gen:config` only knows catalogues, policies, target sets and inquiry templates; extending its generator for one file is out of proportion. Editing SM-1.json after 0019 is applied turns the test red → SM-2. |
| (not in spec) | A line "Đang chọn: …" above the tabs of a multi-select picker | A chosen chip may sit in another tab; the line keeps the choice visible. |
| §5 weak page "bấm ra bảng chi tiết" | Tiles always shown; the detail table appears under them for `?domain=<key>`; a last tile "Xem tất cả" (`?domain=all`) shows the full table as before | Keeps the old full table one tap away for the tutor. |

---

## File Structure

| File | Responsibility |
|---|---|
| `content/skill_map/SM-1.json` | Source of truth of the map (domains, groups + descriptions, leaves, levels, hidden, related, assumed start levels) |
| `lib/skillmap/types.ts` | Constants (`DOMAIN_KEYS`, `CEFR_LEVELS`, `LEVEL_BANDS`, `GROUP_KEY_RE`, `UNASSIGNED`) + view types |
| `lib/skillmap/file.ts` | zod schema of SM-1.json + `readSkillMapFile()` (Node only: tests) |
| `lib/skillmap/shape.ts` | `parseSkillMap(raw)` — `eng_skill_map` jsonb → `SkillMapView` |
| `lib/skillmap/load.ts` | `loadSkillMap(learnerId)` (server only, admin client) |
| `lib/skillmap/group.ts` | Pure: `placeOfGroup`, `placeOfTag`, `placeOfTarget`, `domainOfGroup`, `groupTags`, `groupTargets`, `groupWeakPoints`, `firstTab` |
| `db/migrations/0019_skill_map.sql` | 4 tables + immutability + RLS + SM-1 seed; `error_tags.group_key`; `eng_current_skill_map`, `eng_add_error_tag_v2`, `eng_set_tag_group`, `eng_skill_map` |
| `lib/tutorwork/{types,schemas,shape,handlers,supabaseStore,client,load}.ts` | `TagInfo.groupKey`; add-tag body needs `group_key`; `handleSetTagGroup`; store calls v2 + set-group; error words |
| `app/api/learners/[id]/tags/group/route.ts` | POST "Xếp vào nhóm" |
| `components/tutor/DomainTabs.tsx` | Generic: 7 tabs (+ "Chưa xếp mảng"), group headings, quick search |
| `components/tutor/GroupPicker.tsx` | Domain select → group select |
| `components/tutor/SetGroupControl.tsx` | "Xếp vào nhóm" for an old family tag |
| `components/tutor/{AddTag,TagChips,TagSelect,useTags}.tsx/.ts` | Grouped pickers; new tag needs domain + group |
| `components/tutor/{SessionNoteForm,WritingTags,PendingTags,ResultForm}.tsx`, `components/practice/AssignForm.tsx` | Pass the map; "Kỹ năng đã luyện hôm nay" by domain |
| `components/tutor/DomainTiles.tsx` | 7 (+1) tiles on "Điểm cần chú ý" |
| `app/learners/[id]/{notes/new,results/new,assign,weak}/page.tsx`, `app/review/[episodeId]/page.tsx` | Load the map; weak page tiles + `?domain=` |
| `components/tutor/ReadingReportForm.tsx` | After saving, go to `/weak?domain=reading` |
| `lib/copy/vi.ts` | `skillMapCopy`, weak-page tile words, two error words |
| Tests | `tests/unit/skillMapContent.test.ts`, `tests/unit/migration0019.test.ts`, `tests/db/skillMap.test.ts`, `tests/db/migrations.test.ts` (table lists), `tests/unit/skillMap.test.ts`, `tests/unit/fixtures/skillMap.ts`, `tests/unit/skillMapUi.test.ts`, `tests/unit/tutorWork.test.ts`, `tests/unit/tutorWorkUi.test.ts`, `tests/unit/practiceUi.test.ts`, `tests/e2e/{tutorWork,practice,reading}.spec.ts` |
| Docs | `docs/PROGRESS.md` (SM-1 section), `CLAUDE.md` (status + next migration 0020), `docs/DESIGN.md` (§19.7) |

Task order: 0 (gate) → 1 content → 2 migration part 1 → 3 migration part 2 → 4 `lib/skillmap` → 5 API → 6 DomainTabs / GroupPicker → 7 pickers → 8 weak page → 9 e2e selectors → 10 docs + verification + review. Tasks 1–5 may start before the gate; Tasks 6–9 wait for it.

---

### Task 0: Gate — mockups approved (parent, not for the builder)

- [ ] The 4 mockup boards of spec §5 (Hồ sơ cấp, Duyệt lên cấp, **Chọn nhãn theo mảng**, Trang chủ của em) are on the canvas "Màn gia sư — S5b + Studio" and the parent wrote "duyệt". For SM-1 the board that matters is "Chọn nhãn theo mảng"; the weak-page tiles (Task 8) have no board in the spec — show the parent a screenshot of the preview before merging.
- [ ] Until this box is ticked, the builder does Tasks 1–5 only.

---

### Task 1: SM-1 content file + integrity tests

**Files:**
- Create: `content/skill_map/SM-1.json`, `lib/skillmap/types.ts`, `lib/skillmap/file.ts`
- Test: `tests/unit/skillMapContent.test.ts`

**Interfaces:**
- Consumes: `content/catalogue_v0.2.json`, `content/target_sets_v1.json`, `content/tags/{tags_A,tags_B,reading_A,reading_B}.json`, `CONTENT_DIR` from `lib/config/content.ts`.
- Produces:
  - `DOMAIN_KEYS = ["grammar","vocab","reading","listening","writing","speaking","thinking"] as const`, `type DomainKey`
  - `CEFR_LEVELS = ["A1","A2","A2+","B1","B1+","B2","B2+","C1","C2"] as const`, `type CefrLevel`
  - `LEVEL_BANDS = ["A1-A2","B1","B2","C1-C2"] as const`
  - `GROUP_KEY_RE = /^[a-z]{2}-[a-z-]{2,30}$/`, `UNASSIGNED = "unassigned"`, `type BucketKey = DomainKey | typeof UNASSIGNED`, `isDomainKey(k: string): k is DomainKey`
  - `type SkillLeaf = { kind: "tag" | "target"; trackId: string; refKey: string; label: string; levelFrom: CefrLevel | null; levelTo: CefrLevel | null; taskFrom: number | null; taskTo: number | null; core: boolean; hiddenInPicker: boolean; related: string[]; custom: boolean; inSet: boolean }`
  - `type SkillGroup = { key: string; name: string; descriptions: Record<string, string | null>; leaves: SkillLeaf[] }`
  - `type SkillDomain = { key: DomainKey; name: string; scale: "cefr" | "task_level"; groups: SkillGroup[] }`
  - `type SkillMapView = { mapId: string; trackId: string; assumed: Record<string, string | number>; domains: SkillDomain[]; unassigned: SkillLeaf[] }`
  - `skillMapFileSchema`, `type SkillMapFile`, `SKILL_MAP_PATH`, `readSkillMapFile(dir?: string): { raw: unknown; file: SkillMapFile }`
  - JSON leaf shape (file): `{ kind, track, ref, level_from?, level_to?, task_from?, task_to?, level_note?, core?, hidden_in_picker?, related? }` — absent = `null` / `false` / `[]` in the database.

- [ ] **Step 1: Write the failing test** — `tests/unit/skillMapContent.test.ts`

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR } from "../../lib/config/content";
import { readSkillMapFile, type SkillMapFile } from "../../lib/skillmap/file";
import { CEFR_LEVELS, DOMAIN_KEYS } from "../../lib/skillmap/types";

type Leaf = SkillMapFile["domains"][number]["groups"][number]["leaves"][number];
type Target = {
  id: string; track: string; dimension_id: string; input_modality: string | null; output_modality: string; target_demand: string;
  cefr_ref: { level: string } | null;
};

const { file: map } = readSkillMapFile();
const json = (...p: string[]) => JSON.parse(readFileSync(path.join(CONTENT_DIR, ...p), "utf8")) as unknown;
const catalogue = json("catalogue_v0.2.json") as { targets: Target[] };
const sets = json("target_sets_v1.json") as { id: string; track: string; target_ids: string[] }[];
const tagFiles = ["tags_A.json", "tags_B.json", "reading_A.json", "reading_B.json"].map((f) => json("tags", f) as { track: string; tags: { key: string }[] });

const placed = map.domains.flatMap((d) => d.groups.flatMap((g) => g.leaves.map((leaf) => ({ domain: d.key, scale: d.scale, group: g.key, leaf }))));
const id = (l: Leaf) => `${l.kind}:${l.track}:${l.ref}`;

const GROUP_KEYS = [
  "gr-tense", "gr-modal", "gr-conditional", "gr-passive-report", "gr-clause", "gr-noun-det", "gr-compare-prep", "gr-verb-pattern", "gr-emphasis", "gr-transform",
  "vo-topic", "vo-word-form", "vo-colloc-idiom", "vo-context", "vo-register",
  "re-gist-detail", "re-inference", "re-purpose-tone", "re-structure", "re-word-ref", "re-strategy",
  "li-gist-detail", "li-attitude", "li-argument-notes", "li-sound",
  "wr-sentence-mech", "wr-paragraph", "wr-cohesion", "wr-genre", "wr-register",
  "sp-pron", "sp-fluency", "sp-present", "sp-interact",
  "th-cause", "th-argue", "th-evaluate", "th-synthesis", "th-exam", "th-self",
];

// Spec §2 rule 3: L1 → grammar · L2 → vocab · L3/L4/L8/X1/X2 → writing or speaking by output · T1–T2 → reading or listening by input ·
// L7, T4 and up, A* → thinking. Only exception: A-L2-COMPENSATE-S → speaking (P1-b).
const BY_DIMENSION: Record<string, string> = {
  L1: "grammar", L2: "vocab", L7: "thinking", T4: "thinking", T5: "thinking", T7: "thinking", T9: "thinking", T11: "thinking",
  A1: "thinking", A3: "thinking", A5: "thinking",
};
const BY_OUTPUT: Record<string, string> = { writing: "writing", speaking: "speaking" };
const BY_INPUT: Record<string, string> = { reading: "reading", listening: "listening" };
function expectedDomain(t: Target): string | undefined {
  if (t.id === "A-L2-COMPENSATE-S") return "speaking";
  if (["L3", "L4", "L8", "X1", "X2"].includes(t.dimension_id)) return BY_OUTPUT[t.output_modality];
  if (["T1", "T2"].includes(t.dimension_id)) return BY_INPUT[t.input_modality ?? ""];
  return BY_DIMENSION[t.dimension_id];
}
function expectedLevels(t: Target, scale: string): Record<string, string | number> {
  if (scale === "cefr") {
    const lv = t.cefr_ref?.level;
    if (!lv) return {};
    const [from, to] = lv.split("-");
    return { level_from: from!, level_to: to ?? from! };
  }
  const m = /^TL(\d)(?:-TL(\d))?\b/.exec(t.target_demand);
  return m ? { task_from: Number(m[1]), task_to: Number(m[2] ?? m[1]) } : {};
}
// Reference bands of the grammar / vocabulary tags (English Profile; the tutor re-checks them).
const LEVELLED_TAGS: Record<string, [string, string]> = {
  "hien-tai-don": ["A1", "A1"], "hien-tai-don-s-es": ["A1", "A1"], "gioi-tu-thoi-gian": ["A1", "A2"], "qua-khu-don": ["A2", "A2"], "so-sanh": ["A2", "A2"],
  "modal-suy-doan": ["B2", "B2"], "wish-would-rather": ["B1", "B2"], "cau-dieu-kien-dao-ngu": ["B1", "C1"], "bi-dong-nho-tuong-thuat": ["B1", "B2"],
  "dang-tu": ["B1", "B2"], "cum-dong-tu": ["B1", "B2"], "thanh-ngu": ["B2", "C1"],
};
const RELATED: string[][] = [
  ["A", "qua-khu-don", "A-L1-PAST-W"], ["A", "doc-main-idea", "A-T1-TEXT-R"], ["A", "nghe", "A-T1-TEXT-L"], ["A", "viet-cau", "A-L3-PARA-W"],
  ["B", "doc-fact-opinion", "B-T5-DATAOP"], ["B", "doc-evidence", "B-T7-ARGUE"], ["B", "doc-conclusions", "B-T11-QUALIFY"],
  ["B", "doc-inference", "B-T2-ASSUME-R"], ["B", "tu-noi-lap-luan", "B-T7-ARGUE"],
];

describe("content/skill_map/SM-1.json (spec §2)", () => {
  it("has the 7 fixed domains in order and the 40 groups of the spec, each once", () => {
    expect(map.id).toBe("SM-1");
    expect(map.catalogue_version).toBe("0.2.1-draft");
    expect(map.domains.map((d) => d.key)).toEqual([...DOMAIN_KEYS]);
    expect(map.domains.map((d) => d.name_vi)).toEqual(["Ngữ pháp", "Từ vựng", "Đọc", "Nghe", "Viết", "Nói", "Tư duy & tự học"]);
    expect(map.domains.map((d) => d.scale)).toEqual(["cefr", "cefr", "cefr", "cefr", "cefr", "cefr", "task_level"]);
    expect(map.domains.flatMap((d) => d.groups.map((g) => g.key))).toEqual(GROUP_KEYS);
  });

  it("describes every group per level band (CEFR domains) or low → high (thinking)", () => {
    for (const d of map.domains)
      for (const g of d.groups) {
        if (d.scale === "cefr") expect(Object.keys(g.desc), g.key).toEqual(["A1-A2", "B1", "B2", "C1-C2"]);
        else expect([Object.keys(g.desc), Boolean(g.desc.low && g.desc.high)], g.key).toEqual([["low", "high"], true]);
        expect(Object.values(g.desc).some((v) => v !== null), g.key).toBe(true);
      }
  });

  it("every seed tag of content/tags/*.json is exactly one leaf, and there is no other tag leaf", () => {
    const want = tagFiles.flatMap((f) => f.tags.map((t) => `tag:${f.track}:${t.key}`)).sort();
    const have = placed.filter((p) => p.leaf.kind === "tag").map((p) => id(p.leaf)).sort();
    expect(want).toHaveLength(40);
    expect(have).toEqual(want);
  });

  it("every catalogue target is exactly one leaf of its own track, in the domain rule 3 gives", () => {
    const targets = placed.filter((p) => p.leaf.kind === "target");
    expect(targets).toHaveLength(70);
    expect(new Set(targets.map((p) => p.leaf.ref)).size).toBe(70);
    for (const t of catalogue.targets) {
      const p = targets.find((x) => x.leaf.ref === t.id);
      expect(p, t.id).toBeDefined();
      expect([p?.leaf.track, p?.domain], t.id).toEqual([t.track, expectedDomain(t)]);
    }
  });

  it("levels: targets copy the catalogue on their domain's scale; tags carry a reference band only where listed", () => {
    const byId = new Map(catalogue.targets.map((t) => [t.id, t]));
    const order = (l: string) => (CEFR_LEVELS as readonly string[]).indexOf(l);
    for (const { scale, leaf } of placed) {
      const lv = Object.fromEntries(
        Object.entries({ level_from: leaf.level_from, level_to: leaf.level_to, task_from: leaf.task_from, task_to: leaf.task_to }).filter(([, v]) => v !== undefined),
      );
      if (leaf.kind === "target") expect(lv, leaf.ref).toEqual(expectedLevels(byId.get(leaf.ref)!, scale));
      else {
        const band = LEVELLED_TAGS[leaf.ref];
        expect(lv, id(leaf)).toEqual(band ? { level_from: band[0], level_to: band[1] } : {});
        expect(leaf.level_note, id(leaf)).toBe(band ? "tham khảo English Profile — gia sư kiểm lại" : undefined);
      }
      if (leaf.level_from && leaf.level_to) expect(order(leaf.level_from) <= order(leaf.level_to), id(leaf)).toBe(true);
      if (leaf.task_from && leaf.task_to) expect(leaf.task_from <= leaf.task_to, id(leaf)).toBe(true);
      if (scale === "cefr") expect(leaf.task_from, id(leaf)).toBeUndefined();
      else expect(leaf.level_from, id(leaf)).toBeUndefined();
    }
  });

  it("'related' holds exactly the spec's pairs, each to an existing target of the same track", () => {
    const trackOf = new Map(catalogue.targets.map((t) => [t.id, t.track]));
    const rel = placed.flatMap((p) => (p.leaf.related ?? []).map((r) => [p.leaf.track, p.leaf.ref, r]));
    expect([...rel].sort()).toEqual([...RELATED].sort());
    for (const [track, , target] of rel) expect(trackOf.get(target!), target).toBe(track);
    for (const p of placed) if (p.leaf.kind === "target") expect(p.leaf.related, p.leaf.ref).toBeUndefined();
  });

  it("only An's old 'Đọc hiểu (KET Reading)' is hidden from the picker (Đọc · Ý chính & chi tiết); no core point yet", () => {
    const hidden = placed.filter((p) => p.leaf.hidden_in_picker);
    expect(hidden.map((p) => [id(p.leaf), p.group])).toEqual([["tag:A:doc-hieu", "re-gist-detail"]]);
    expect(placed.filter((p) => p.leaf.core !== undefined && p.leaf.core !== false)).toEqual([]);
  });

  it("assumed start levels per track (P2-a): An A2 / thinking 1, Nguyên B2 / thinking 2", () => {
    expect(map.assumed).toEqual({
      A: { grammar: "A2", vocab: "A2", reading: "A2", listening: "A2", writing: "A2", speaking: "A2", thinking: 1 },
      B: { grammar: "B2", vocab: "B2", reading: "B2", listening: "B2", writing: "B2", speaking: "B2", thinking: 2 },
    });
  });

  it("today's coverage matches the spec: An 17/40 groups, Nguyên 19/40 (tags of the track + skills of the v1 set)", () => {
    const groups = map.domains.flatMap((d) => d.groups);
    const cover = (track: string, set: string[]) =>
      groups.filter((g) => g.leaves.some((l) => (l.kind === "tag" && l.track === track) || (l.kind === "target" && set.includes(l.ref)))).length;
    expect(sets.map((s) => [s.id, cover(s.track, s.target_ids)])).toEqual([["A-v1", 17], ["B-v1", 19]]);
  });

  it("never contains the dollar-quote tag that migration 0019 wraps it in", () => {
    expect(readFileSync(path.join(CONTENT_DIR, "skill_map", "SM-1.json"), "utf8")).not.toContain("$j$");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/skillMapContent.test.ts`
Expected: FAIL — `Cannot find module '../../lib/skillmap/file'`.

- [ ] **Step 3: Create `lib/skillmap/types.ts`**

```ts
/**
 * Skill map (spec docs/superpowers/specs/2026-10-21-skill-map-levels-design.md §2): 7 fixed domains → 40 groups → leaves.
 * A leaf is a seed tag of one track (signal) or a catalogue target (evidence). Shared by both children and every level.
 */
export const DOMAIN_KEYS = ["grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking"] as const;
export type DomainKey = (typeof DOMAIN_KEYS)[number];

/** The 9 steps of P2-b. The thinking domain uses task levels 1–4 instead. */
export const CEFR_LEVELS = ["A1", "A2", "A2+", "B1", "B1+", "B2", "B2+", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Keys of a CEFR group's descriptions ("ví dụ nội dung theo cấp"). Thinking groups use {low, high}. */
export const LEVEL_BANDS = ["A1-A2", "B1", "B2", "C1-C2"] as const;

/** Same rule as the SQL checks on skill_groups.key and error_tags.group_key (migration 0019). */
export const GROUP_KEY_RE = /^[a-z]{2}-[a-z-]{2,30}$/;

/** Bucket of items without a group in the map (family tags added before SM-1, unknown keys). */
export const UNASSIGNED = "unassigned" as const;
export type BucketKey = DomainKey | typeof UNASSIGNED;

export function isDomainKey(k: string): k is DomainKey {
  return (DOMAIN_KEYS as readonly string[]).includes(k);
}

export type LeafKind = "tag" | "target";

export type SkillLeaf = {
  kind: LeafKind;
  trackId: string;
  /** Tag key (error_tags.key) or target id (targets.id). */
  refKey: string;
  label: string;
  levelFrom: CefrLevel | null;
  levelTo: CefrLevel | null;
  taskFrom: number | null;
  taskTo: number | null;
  core: boolean;
  hiddenInPicker: boolean;
  /** Target ids a tag is "related" to (spec §2 rule 4). */
  related: string[];
  /** A family's own tag ("Nhãn riêng"). */
  custom: boolean;
  /** Target in the learner's current target set. Always false for tags. */
  inSet: boolean;
};

export type SkillGroup = { key: string; name: string; descriptions: Record<string, string | null>; leaves: SkillLeaf[] };
export type SkillDomain = { key: DomainKey; name: string; scale: "cefr" | "task_level"; groups: SkillGroup[] };

/** The published map as one learner sees it (eng_skill_map): tags of the learner's track + the family's own, every target. */
export type SkillMapView = {
  mapId: string;
  trackId: string;
  /** Assumed start level per domain for the learner's track (SM-2 shows it as "giả định — chờ cô xác nhận"). */
  assumed: Record<string, string | number>;
  domains: SkillDomain[];
  /** Tags of this learner's track (seed or family) that have no group in the map. */
  unassigned: SkillLeaf[];
};
```

- [ ] **Step 4: Create `lib/skillmap/file.ts`**

```ts
/** content/skill_map/SM-1.json: zod schema + reader. Node only (tests); the app reads the published map from the database. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CONTENT_DIR } from "../config/content";
import { CEFR_LEVELS, DOMAIN_KEYS, GROUP_KEY_RE, LEVEL_BANDS } from "./types";

const cefr = z.enum(CEFR_LEVELS);
const task = z.number().int().min(1).max(4);
const text = (max: number) => z.string().trim().min(1).max(max);

const leaf = z.strictObject({
  kind: z.enum(["tag", "target"]),
  track: z.enum(["A", "B"]),
  ref: text(100),
  level_from: cefr.optional(),
  level_to: cefr.optional(),
  task_from: task.optional(),
  task_to: task.optional(),
  level_note: text(200).optional(),
  core: z.boolean().optional(),
  hidden_in_picker: z.boolean().optional(),
  related: z.array(text(100)).min(1).optional(),
});
const group = z.strictObject({
  key: z.string().regex(GROUP_KEY_RE),
  name_vi: text(80),
  desc: z.record(z.string(), z.string().min(1).nullable()),
  leaves: z.array(leaf),
});
const domain = z.strictObject({
  key: z.enum(DOMAIN_KEYS),
  name_vi: text(60),
  scale: z.enum(["cefr", "task_level"]),
  groups: z.array(group).min(1),
});
const assumed = z.strictObject({ grammar: cefr, vocab: cefr, reading: cefr, listening: cefr, writing: cefr, speaking: cefr, thinking: task });

export const skillMapFileSchema = z.strictObject({
  id: z.string().regex(/^SM-\d{1,3}$/),
  title_vi: text(120),
  catalogue_version: text(40),
  spec: text(200),
  note: text(1000),
  levels: z.array(cefr),
  level_bands: z.array(z.enum(LEVEL_BANDS)),
  task_levels: z.array(task),
  assumed: z.strictObject({ A: assumed, B: assumed }),
  domains: z.array(domain).length(7),
});
export type SkillMapFile = z.infer<typeof skillMapFileSchema>;

export const SKILL_MAP_PATH = path.join("skill_map", "SM-1.json");

export function readSkillMapFile(dir: string = CONTENT_DIR): { raw: unknown; file: SkillMapFile } {
  const raw = JSON.parse(readFileSync(path.join(dir, SKILL_MAP_PATH), "utf8")) as unknown;
  return { raw, file: skillMapFileSchema.parse(raw) };
}
```

- [ ] **Step 5: Create `content/skill_map/SM-1.json`** — exactly this content (one leaf per line; leaf order = display order inside a group: tags of A, tags of B, targets of A, targets of B):

```json
{
  "id": "SM-1",
  "title_vi": "Bản đồ kỹ năng A1–C2",
  "catalogue_version": "0.2.1-draft",
  "spec": "docs/superpowers/specs/2026-10-21-skill-map-levels-design.md",
  "note": "Nguồn sự thật của bản đồ kỹ năng SM-1 (seed bằng migration 0019; đã công bố thì không sửa — đổi = SM-2). core = false cho mọi lá (điểm cốt lõi theo cấp đến với nội dung v0.3). Cấp của nhãn ngữ pháp/từ vựng: tham khảo English Profile, gia sư kiểm lại.",
  "levels": ["A1","A2","A2+","B1","B1+","B2","B2+","C1","C2"],
  "level_bands": ["A1-A2","B1","B2","C1-C2"],
  "task_levels": [1,2,3,4],
  "assumed": {"A":{"grammar":"A2","vocab":"A2","reading":"A2","listening":"A2","writing":"A2","speaking":"A2","thinking":1},"B":{"grammar":"B2","vocab":"B2","reading":"B2","listening":"B2","writing":"B2","speaking":"B2","thinking":2}},
  "domains": [
    {
      "key": "grammar", "name_vi": "Ngữ pháp", "scale": "cefr",
      "groups": [
        {
          "key": "gr-tense", "name_vi": "Thì",
          "desc": {"A1-A2":"HT đơn/tiếp diễn, QK đơn, going to","B1":"HT hoàn thành, QK tiếp diễn, used to","B2":"QK hoàn thành, hoàn thành tiếp diễn, TL hoàn thành","C1-C2":"Thì để nói lịch sự, giữ khoảng cách"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"hien-tai-don","level_from":"A1","level_to":"A1","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"tag","track":"A","ref":"hien-tai-don-s-es","level_from":"A1","level_to":"A1","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"tag","track":"A","ref":"qua-khu-don","level_from":"A2","level_to":"A2","level_note":"tham khảo English Profile — gia sư kiểm lại","related":["A-L1-PAST-W"]},
            {"kind":"target","track":"A","ref":"A-L1-PAST-W","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"A","ref":"A-L1-PRESPERF-W","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"A","ref":"A-L1-FUTURE-W","level_from":"A2","level_to":"A2"}
          ]
        },
        {
          "key": "gr-modal", "name_vi": "Động từ khuyết thiếu",
          "desc": {"A1-A2":"can, must, should","B1":"have to, might, could","B2":"must have (suy đoán quá khứ), needn't have","C1-C2":"Sắc thái tinh: be bound to…"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"modal-suy-doan","level_from":"B2","level_to":"B2","level_note":"tham khảo English Profile — gia sư kiểm lại"}
          ]
        },
        {
          "key": "gr-conditional", "name_vi": "Câu điều kiện & giả định",
          "desc": {"A1-A2":"If loại 0/1","B1":"Loại 2, wish hiện tại","B2":"Loại 3, wish quá khứ, would rather","C1-C2":"Hỗn hợp, đảo ngữ (Had I known), giả định"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"cau-dieu-kien-dao-ngu","level_from":"B1","level_to":"C1","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"tag","track":"B","ref":"wish-would-rather","level_from":"B1","level_to":"B2","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"target","track":"B","ref":"B-L1-HYPO-W","level_from":"B2","level_to":"B2"}
          ]
        },
        {
          "key": "gr-passive-report", "name_vi": "Bị động, tường thuật, nhờ",
          "desc": {"A1-A2":null,"B1":"Bị động đơn giản, tường thuật câu kể","B2":"Bị động mọi thì, have sth done, tường thuật câu hỏi","C1-C2":"It is said that…, động từ tường thuật đa dạng"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"bi-dong-nho-tuong-thuat","level_from":"B1","level_to":"B2","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"target","track":"A","ref":"A-L1-PASSIVE-W","level_from":"B1","level_to":"B1"},
            {"kind":"target","track":"B","ref":"B-L1-REPORT-W","level_from":"B2","level_to":"B2"}
          ]
        },
        {
          "key": "gr-clause", "name_vi": "Mệnh đề & nối câu",
          "desc": {"A1-A2":"and, but, because, when","B1":"Mệnh đề quan hệ, although, unless","B2":"Quan hệ không xác định, rút gọn mệnh đề","C1-C2":"Mệnh đề phân từ, câu nhiều tầng"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L1-SENT-W","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"B","ref":"B-L1-COMPLEX-W","level_from":"B2","level_to":"B2"}
          ]
        },
        {
          "key": "gr-noun-det", "name_vi": "Danh từ, mạo từ, lượng từ",
          "desc": {"A1-A2":"a/the, some/any","B1":"few/little, đại từ","B2":"Mạo từ với danh từ trừu tượng","C1-C2":"Danh hóa, cụm danh từ học thuật"},
          "leaves": []
        },
        {
          "key": "gr-compare-prep", "name_vi": "So sánh, tính từ, giới từ",
          "desc": {"A1-A2":"So sánh hơn/nhất, in/on/at","B1":"as…as, too/enough","B2":"the more… the more","C1-C2":"nowhere near as…"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"gioi-tu-thoi-gian","level_from":"A1","level_to":"A2","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"tag","track":"A","ref":"so-sanh","level_from":"A2","level_to":"A2","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"target","track":"A","ref":"A-L1-COMP-W","level_from":"A2","level_to":"A2"}
          ]
        },
        {
          "key": "gr-verb-pattern", "name_vi": "V-ing / to V",
          "desc": {"A1-A2":"like doing, want to","B1":"Động từ thường gặp","B2":"stop/remember/try (đổi nghĩa)","C1-C2":"Phân từ hoàn thành"},
          "leaves": []
        },
        {
          "key": "gr-emphasis", "name_vi": "Nhấn mạnh & đảo ngữ",
          "desc": {"A1-A2":null,"B1":"Câu hỏi đuôi","B2":"Câu chẻ, Not only…","C1-C2":"Đảo ngữ phủ định, lược bỏ"},
          "leaves": []
        },
        {
          "key": "gr-transform", "name_vi": "Tổng hợp & biến đổi câu",
          "desc": {"A1-A2":null,"B1":"Tìm lỗi sai","B2":"Viết lại câu giữ nghĩa","C1-C2":"Biến đổi phức"},
          "leaves": [
            {"kind":"target","track":"B","ref":"B-L1-TRANSFORM-W","level_from":"B1","level_to":"B2"}
          ]
        }
      ]
    },
    {
      "key": "vocab", "name_vi": "Từ vựng", "scale": "cefr",
      "groups": [
        {
          "key": "vo-topic", "name_vi": "Từ theo chủ đề",
          "desc": {"A1-A2":"Gia đình, trường, thời tiết","B1":"Môi trường, công nghệ, sức khỏe","B2":"Xã hội, khoa học, truyền thông","C1-C2":"Chủ đề trừu tượng, chuyên sâu"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"tu-vung-chu-de"},
            {"kind":"target","track":"A","ref":"A-L2-CHUNKS","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"A","ref":"A-L2-PRECISE","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"B","ref":"B-L2-PRECISE","level_from":"B2+","level_to":"B2+"}
          ]
        },
        {
          "key": "vo-word-form", "name_vi": "Dạng từ",
          "desc": {"A1-A2":"-er, -ful","B1":"un-, dis-","B2":"Đủ họ từ danh/động/tính/trạng","C1-C2":"Từ hiếm, từ ghép"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"dang-tu","level_from":"B1","level_to":"B2","level_note":"tham khảo English Profile — gia sư kiểm lại"}
          ]
        },
        {
          "key": "vo-colloc-idiom", "name_vi": "Kết hợp từ, cụm động từ, thành ngữ",
          "desc": {"A1-A2":"make/do, get up","B1":"give up, heavy rain","B2":"Cụm động từ nhiều nghĩa, thành ngữ thông dụng","C1-C2":"Thành ngữ, ẩn dụ"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"cum-dong-tu","level_from":"B1","level_to":"B2","level_note":"tham khảo English Profile — gia sư kiểm lại"},
            {"kind":"tag","track":"B","ref":"thanh-ngu","level_from":"B2","level_to":"C1","level_note":"tham khảo English Profile — gia sư kiểm lại"}
          ]
        },
        {
          "key": "vo-context", "name_vi": "Nghĩa trong ngữ cảnh",
          "desc": {"A1-A2":"Đồng nghĩa dễ","B1":"Đoán nghĩa từ ngữ cảnh","B2":"Phân biệt từ gần nghĩa","C1-C2":"Sắc thái, hàm ý"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"tu-vung-ngu-canh"},
            {"kind":"target","track":"B","ref":"B-L2-CLOZE","level_from":"B1","level_to":"B2"}
          ]
        },
        {
          "key": "vo-register", "name_vi": "Văn phong & từ học thuật",
          "desc": {"A1-A2":null,"B1":"Thân mật / trang trọng","B2":"Từ học thuật phổ biến","C1-C2":"Đổi văn phong linh hoạt"},
          "leaves": [
            {"kind":"target","track":"B","ref":"B-L2-STANCE","level_from":"C1","level_to":"C1"}
          ]
        }
      ]
    },
    {
      "key": "reading", "name_vi": "Đọc", "scale": "cefr",
      "groups": [
        {
          "key": "re-gist-detail", "name_vi": "Ý chính & chi tiết",
          "desc": {"A1-A2":"Biển báo, tin nhắn, đoạn ngắn","B1":"Bài báo đơn giản","B2":"Bài dài, tóm tắt","C1-C2":"Văn bản phức, rất dài"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"doc-main-idea","related":["A-T1-TEXT-R"]},
            {"kind":"tag","track":"A","ref":"doc-details"},
            {"kind":"tag","track":"A","ref":"doc-hieu","hidden_in_picker":true},
            {"kind":"tag","track":"B","ref":"doc-main-idea"},
            {"kind":"tag","track":"B","ref":"doc-summarize"},
            {"kind":"target","track":"A","ref":"A-T1-TEXT-R"},
            {"kind":"target","track":"B","ref":"B-T1-EXAM-R"}
          ]
        },
        {
          "key": "re-inference", "name_vi": "Suy luận & dự đoán",
          "desc": {"A1-A2":"Suy luận dễ","B1":"Rút ra kết luận","B2":"Giả định, hàm ý","C1-C2":"Ẩn ý nhiều tầng"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"doc-inference"},
            {"kind":"tag","track":"B","ref":"doc-inference","related":["B-T2-ASSUME-R"]},
            {"kind":"tag","track":"B","ref":"doc-conclusions","related":["B-T11-QUALIFY"]},
            {"kind":"tag","track":"B","ref":"doc-prediction"},
            {"kind":"target","track":"A","ref":"A-T2-INFER-R"},
            {"kind":"target","track":"B","ref":"B-T2-ASSUME-R"}
          ]
        },
        {
          "key": "re-purpose-tone", "name_vi": "Mục đích, thái độ, giọng điệu",
          "desc": {"A1-A2":"Văn bản để làm gì","B1":"Ý kiến người viết","B2":"Thái độ, giọng điệu","C1-C2":"Mỉa mai, thiên kiến"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"doc-author-purpose"},
            {"kind":"tag","track":"B","ref":"doc-author-purpose"}
          ]
        },
        {
          "key": "re-structure", "name_vi": "Cấu trúc & lập luận của bài",
          "desc": {"A1-A2":"Trình tự","B1":"Nguyên nhân–kết quả","B2":"Luận điểm, sự kiện vs ý kiến, chứng cứ","C1-C2":"Lập luận phức, sắp xếp đoạn"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"doc-sequence"},
            {"kind":"tag","track":"B","ref":"doc-sequence"},
            {"kind":"tag","track":"B","ref":"doc-cause-effect"},
            {"kind":"tag","track":"B","ref":"doc-compare-contrast"},
            {"kind":"tag","track":"B","ref":"doc-fact-opinion","related":["B-T5-DATAOP"]},
            {"kind":"tag","track":"B","ref":"doc-evidence","related":["B-T7-ARGUE"]},
            {"kind":"target","track":"B","ref":"B-T1-ARG-R"}
          ]
        },
        {
          "key": "re-word-ref", "name_vi": "Từ & tham chiếu trong bài",
          "desc": {"A1-A2":"Đoán từ dễ","B1":"Gợi ý ngữ cảnh","B2":"Đồng/trái nghĩa, it/this chỉ gì","C1-C2":"Ngôn ngữ hình ảnh"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"doc-context-clues"},
            {"kind":"tag","track":"B","ref":"doc-context-clues"},
            {"kind":"tag","track":"B","ref":"doc-synonyms"},
            {"kind":"tag","track":"B","ref":"doc-antonyms"}
          ]
        },
        {
          "key": "re-strategy", "name_vi": "Chiến lược & đọc rộng",
          "desc": {"A1-A2":"Tìm thông tin","B1":"Đọc lướt, đọc tìm","B2":"Đọc nhanh bài dài","C1-C2":"Đọc rộng nhiều thể loại, văn học"},
          "leaves": []
        }
      ]
    },
    {
      "key": "listening", "name_vi": "Nghe", "scale": "cefr",
      "groups": [
        {
          "key": "li-gist-detail", "name_vi": "Ý chính & chi tiết",
          "desc": {"A1-A2":"Thông báo, số, tên","B1":"Clip, radio ngắn","B2":"Bài dài, tốc độ tự nhiên","C1-C2":"Bài giảng, nhiều giọng"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"nghe","related":["A-T1-TEXT-L"]},
            {"kind":"target","track":"A","ref":"A-T1-TEXT-L"}
          ]
        },
        {
          "key": "li-attitude", "name_vi": "Thái độ & hàm ý người nói",
          "desc": {"A1-A2":null,"B1":"Cảm xúc","B2":"Quan điểm, thái độ","C1-C2":"Hàm ý, mỉa mai"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-T2-INFER-L"}
          ]
        },
        {
          "key": "li-argument-notes", "name_vi": "Theo dõi lập luận & ghi chép",
          "desc": {"A1-A2":null,"B1":"Theo trình tự","B2":"Ghi ý chính","C1-C2":"Bài giảng, tranh luận"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-T1-PROCESS-L"},
            {"kind":"target","track":"B","ref":"B-T1-ARG-L"}
          ]
        },
        {
          "key": "li-sound", "name_vi": "Âm & giọng",
          "desc": {"A1-A2":"Nhận âm, số","B1":"Nối âm","B2":"Nhiều giọng khác nhau","C1-C2":"Nói nhanh, khẩu ngữ"},
          "leaves": []
        }
      ]
    },
    {
      "key": "writing", "name_vi": "Viết", "scale": "cefr",
      "groups": [
        {
          "key": "wr-sentence-mech", "name_vi": "Câu, chính tả, dấu câu",
          "desc": {"A1-A2":"Câu đúng trật tự, chính tả","B1":"Câu ghép, câu phức","B2":"Đa dạng kiểu câu","C1-C2":"Câu trau chuốt"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"viet-cau","related":["A-L3-PARA-W"]}
          ]
        },
        {
          "key": "wr-paragraph", "name_vi": "Đoạn & bố cục",
          "desc": {"A1-A2":"Đoạn 5–6 câu","B1":"Mở – thân – kết","B2":"Bài nhiều đoạn","C1-C2":"Bố cục linh hoạt"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L3-PARA-W","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"B","ref":"B-L3-ESSAY-W","level_from":"B2","level_to":"B2"}
          ]
        },
        {
          "key": "wr-cohesion", "name_vi": "Liên kết & mạch lạc",
          "desc": {"A1-A2":"and, because","B1":"first, however","B2":"Từ nối đa dạng, tham chiếu","C1-C2":"Liên kết tinh tế"},
          "leaves": [
            {"kind":"tag","track":"B","ref":"tu-noi-lap-luan","related":["B-T7-ARGUE"]},
            {"kind":"target","track":"A","ref":"A-L3-CAUSE-W","level_from":"A2+","level_to":"A2+"}
          ]
        },
        {
          "key": "wr-genre", "name_vi": "Thể loại",
          "desc": {"A1-A2":"Tin nhắn, email ngắn, kể chuyện","B1":"Thư, truyện, bài nhận xét","B2":"Bài luận, báo cáo, bài báo","C1-C2":"Đề xuất, phê bình, tóm tắt học thuật"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L4-DESC-W","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"A","ref":"A-L8-MESSAGE-W","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"B","ref":"B-L8-EMAIL-W","level_from":"B2","level_to":"B2"}
          ]
        },
        {
          "key": "wr-register", "name_vi": "Văn phong & độ rõ",
          "desc": {"A1-A2":null,"B1":"Thân mật / trang trọng","B2":"Hợp người đọc","C1-C2":"Giọng văn thuyết phục"},
          "leaves": [
            {"kind":"target","track":"B","ref":"B-L4-CLEAR-W","level_from":"B2+","level_to":"B2+"}
          ]
        }
      ]
    },
    {
      "key": "speaking", "name_vi": "Nói", "scale": "cefr",
      "groups": [
        {
          "key": "sp-pron", "name_vi": "Phát âm & ngữ điệu",
          "desc": {"A1-A2":"Âm cuối, trọng âm từ","B1":"Nối âm","B2":"Ngữ điệu, nhấn câu","C1-C2":"Nhấn để tạo nghĩa"},
          "leaves": [
            {"kind":"tag","track":"A","ref":"phat-am"},
            {"kind":"tag","track":"B","ref":"phat-am"},
            {"kind":"target","track":"A","ref":"A-X2-INTELL","level_from":"B1","level_to":"B1"}
          ]
        },
        {
          "key": "sp-fluency", "name_vi": "Trôi chảy & xoay xở",
          "desc": {"A1-A2":"Lượt ngắn, xoay khi thiếu từ","B1":"Nói liền ~1 phút","B2":"Ít ngập ngừng","C1-C2":"Tự nhiên"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-X1-TURN","level_from":"B1","level_to":"B1"},
            {"kind":"target","track":"A","ref":"A-L2-COMPENSATE-S","level_from":"B1","level_to":"B1"}
          ]
        },
        {
          "key": "sp-present", "name_vi": "Trình bày & giải thích",
          "desc": {"A1-A2":"Mô tả, kể","B1":"Giải thích quá trình, lý do","B2":"Trình bày quan điểm có cấu trúc","C1-C2":"Giải thích ý phức tạp"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L3-SEQ-S","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"A","ref":"A-L3-CAUSE-S","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"A","ref":"A-L4-DESC-S","level_from":"A2","level_to":"A2"},
            {"kind":"target","track":"A","ref":"A-L4-PROCESS-S","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"B","ref":"B-L3-TALK-S","level_from":"B2","level_to":"B2"},
            {"kind":"target","track":"B","ref":"B-L4-EXPLAIN-S","level_from":"B2+","level_to":"B2+"}
          ]
        },
        {
          "key": "sp-interact", "name_vi": "Tương tác & thảo luận",
          "desc": {"A1-A2":"Hỏi – đáp, đáp lời phù hợp","B1":"Đồng ý / phản đối","B2":"Thảo luận, nối ý người khác","C1-C2":"Tranh luận, thương lượng"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L8-EXCHANGE-S","level_from":"A2+","level_to":"A2+"},
            {"kind":"target","track":"A","ref":"A-L8-DISCUSS-S","level_from":"B1","level_to":"B1"},
            {"kind":"target","track":"B","ref":"B-L8-DISCUSS-S","level_from":"B2","level_to":"B2"}
          ]
        }
      ]
    },
    {
      "key": "thinking", "name_vi": "Tư duy & tự học", "scale": "task_level",
      "groups": [
        {
          "key": "th-cause", "name_vi": "Nguyên nhân & giải thích",
          "desc": {"low":"Nêu 1 nguyên nhân","high":"chuỗi nhiều nguyên nhân có điều kiện"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-T4-CAUSE","task_from":2,"task_to":2},
            {"kind":"target","track":"A","ref":"A-T4-PREDICT","task_from":2,"task_to":2},
            {"kind":"target","track":"B","ref":"B-T4-MECH","task_from":3,"task_to":3},
            {"kind":"target","track":"B","ref":"B-T4-ALT","task_from":4,"task_to":4}
          ]
        },
        {
          "key": "th-argue", "name_vi": "Lập luận & kết luận",
          "desc": {"low":"Nêu ý kiến có lý do","high":"lập luận từ nguồn, kết luận có điều kiện"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-T7-OPINION","task_from":2,"task_to":2},
            {"kind":"target","track":"B","ref":"B-T7-ARGUE","task_from":3,"task_to":3},
            {"kind":"target","track":"B","ref":"B-T7-COUNTER","task_from":4,"task_to":4},
            {"kind":"target","track":"B","ref":"B-T11-QUALIFY","task_from":4,"task_to":4},
            {"kind":"target","track":"B","ref":"B-T11-WEIGH","task_from":4,"task_to":4}
          ]
        },
        {
          "key": "th-evaluate", "name_vi": "Đánh giá nguồn & bằng chứng",
          "desc": {"low":"Phân biệt sự kiện/ý kiến","high":"đánh giá độ tin cậy, giới hạn"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-T5-FACTOP-R","task_from":1,"task_to":1},
            {"kind":"target","track":"B","ref":"B-T5-DATAOP","task_from":3,"task_to":3},
            {"kind":"target","track":"B","ref":"B-T5-SOURCE","task_from":3,"task_to":3},
            {"kind":"target","track":"B","ref":"B-T5-SUPPORT","task_from":3,"task_to":4}
          ]
        },
        {
          "key": "th-synthesis", "name_vi": "Tổng hợp & chuyển tải",
          "desc": {"low":"Kể lại một nguồn","high":"tổng hợp nhiều nguồn, giải thích số liệu, chuyển ý từ tiếng Việt"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-L7-RETELL-S"},
            {"kind":"target","track":"A","ref":"A-L7-SUMMARY-W"},
            {"kind":"target","track":"A","ref":"A-T9-COMPARE","task_from":2,"task_to":2},
            {"kind":"target","track":"B","ref":"B-L7-RELAY-W"},
            {"kind":"target","track":"B","ref":"B-L7-DATA"},
            {"kind":"target","track":"B","ref":"B-L7-XLING"},
            {"kind":"target","track":"B","ref":"B-T9-SYNTH","task_from":3,"task_to":3}
          ]
        },
        {
          "key": "th-exam", "name_vi": "Chiến lược làm bài thi",
          "desc": {"low":"Biết dạng đề","high":"quản lý thời gian, loại trừ đáp án"},
          "leaves": []
        },
        {
          "key": "th-self", "name_vi": "Tự học",
          "desc": {"low":"Tự làm không cần nhắc","high":"tự sửa bài, tự đánh giá đúng, dùng được ở chủ đề mới"},
          "leaves": [
            {"kind":"target","track":"A","ref":"A-A1-SELFASSESS"},
            {"kind":"target","track":"A","ref":"A-A3-HINTFIX"},
            {"kind":"target","track":"A","ref":"A-A3-REDRAFT"},
            {"kind":"target","track":"A","ref":"A-A5-REUSE"},
            {"kind":"target","track":"B","ref":"B-A1-PLAN"},
            {"kind":"target","track":"B","ref":"B-A3-REVISE"},
            {"kind":"target","track":"B","ref":"B-A5-REUSE"}
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 6: Run the test** — `npx vitest run tests/unit/skillMapContent.test.ts` → PASS (10 tests).

- [ ] **Step 7: Commit**

```bash
git add content/skill_map/SM-1.json lib/skillmap/types.ts lib/skillmap/file.ts tests/unit/skillMapContent.test.ts
git commit -m "feat(sm-1): skill map SM-1 content (7 domains, 40 groups, 40 tags + 70 skills) with integrity tests"
```

### Mapping of the 46 catalogue skills outside A-v1/B-v1 (for the tutor's review of SM-1.json)

| Skill | Group | Level | Skill | Group | Level |
|---|---|---|---|---|---|
| A-L1-SENT-W | gr-clause | A2 | B-L1-REPORT-W | gr-passive-report | B2 |
| A-L1-COMP-W | gr-compare-prep | A2 | B-L1-HYPO-W | gr-conditional | B2 |
| A-L1-PRESPERF-W | gr-tense | A2 | B-L2-STANCE | vo-register | C1 |
| A-L1-FUTURE-W | gr-tense | A2 | B-L3-ESSAY-W | wr-paragraph | B2 |
| A-L1-PASSIVE-W | gr-passive-report | B1 | B-L3-TALK-S | sp-present | B2 |
| A-L2-PRECISE | vo-topic | A2+ | B-L4-CLEAR-W | wr-register | B2+ |
| A-L3-SEQ-S | sp-present | A2 | B-L7-RELAY-W | th-synthesis | — |
| A-L4-DESC-S | sp-present | A2 | B-L7-DATA | th-synthesis | — |
| A-L4-DESC-W | wr-genre | A2 | B-L7-XLING | th-synthesis | — |
| A-L7-RETELL-S | th-synthesis | — | B-L8-DISCUSS-S | sp-interact | B2 |
| A-L7-SUMMARY-W | th-synthesis | — | B-L8-EMAIL-W | wr-genre | B2 |
| A-L8-EXCHANGE-S | sp-interact | A2+ | B-T1-ARG-L | li-argument-notes | — |
| A-L8-DISCUSS-S | sp-interact | B1 | B-T4-MECH | th-cause | TL3 |
| A-L8-MESSAGE-W | wr-genre | A2+ | B-T4-ALT | th-cause | TL4 |
| A-T1-PROCESS-L | li-argument-notes | — | B-T5-SUPPORT | th-evaluate | TL3–4 |
| A-T2-INFER-R | re-inference | — | B-T7-COUNTER | th-argue | TL4 |
| A-T2-INFER-L | li-attitude | — | B-T9-SYNTH | th-synthesis | TL3 |
| A-T4-PREDICT | th-cause | TL2 | B-T11-WEIGH | th-argue | TL4 |
| A-T5-FACTOP-R | th-evaluate | TL1 | B-A1-PLAN | th-self | — |
| A-T9-COMPARE | th-synthesis | TL2 | B-A3-REVISE | th-self | — |
| A-A1-SELFASSESS | th-self | — | B-A5-REUSE | th-self | — |
| A-A3-HINTFIX | th-self | — | | | |
| A-A3-REDRAFT | th-self | — | | | |
| A-A5-REUSE | th-self | — | | | |
| A-X2-INTELL | sp-pron | B1 | | | |

Judgement calls a tutor should re-check (all inside rule 3): `A-L2-PRECISE` → `vo-topic` (same group as `B-L2-PRECISE`), `A-L4-DESC-W` → `wr-genre` (a description is a text type at A2; `wr-register` has no A1–A2 content), `A-T1-PROCESS-L` → `li-argument-notes` ("Theo trình tự"), `A-T9-COMPARE` → `th-synthesis` (two sources), `B-T11-WEIGH` → `th-argue` (with `B-T11-QUALIFY`), `B-L1-HYPO-W` → `gr-conditional`.

---

### Task 2: Migration 0019 part 1 — skill tables, immutability, RLS, SM-1 seed

**Files:**
- Create: `db/migrations/0019_skill_map.sql`
- Modify: `tests/db/migrations.test.ts` (two table lists)
- Test: `tests/unit/migration0019.test.ts`, `tests/db/skillMap.test.ts`

**Interfaces:**
- Consumes: `content/skill_map/SM-1.json` (Task 1), `english.eng_forbid_published_change` (0005), `english.eng_current_member_id()` (0003), seed tags of 0015 + 0018, catalogue `0.2.1-draft` (0006).
- Produces (SQL):
  - `english.skill_maps(id text pk, title_vi, catalogue_version → catalogue_versions, assumed jsonb, source_hash, published_at)`
  - `english.skill_domains(map_id, key, ord, name_vi, scale)` pk `(map_id, key)`
  - `english.skill_groups(map_id, key, domain_key, ord, name_vi, descriptions jsonb)` pk `(map_id, key)`
  - `english.skill_leaves(map_id, kind, track_id, ref_key, group_key, ord, level_from, level_to, task_from, task_to, level_note, core, hidden_in_picker, related text[])` pk `(map_id, kind, track_id, ref_key)`
  - `english.eng_forbid_skill_map_change()` (trigger function, not callable by anyone)
  - Published row `skill_maps.id = 'SM-1'`.

- [ ] **Step 1: Write the failing unit test** — `tests/unit/migration0019.test.ts` (grown in Task 3)

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR, sourceHash } from "../../lib/config/content";
import { MIGRATIONS_DIR } from "../../scripts/lib/migrate";

const sql = readFileSync(path.join(MIGRATIONS_DIR, "0019_skill_map.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const fileText = readFileSync(path.join(CONTENT_DIR, "skill_map", "SM-1.json"), "utf8");
const TABLES = ["skill_maps", "skill_domains", "skill_groups", "skill_leaves"];

describe("0019_skill_map.sql", () => {
  it("ends by recording its own version, is expand-only and never touches schema public", () => {
    expect(sql.trim().endsWith("insert into english.schema_migrations(version) values ('0019') on conflict do nothing;")).toBe(true);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|rename\s+(to|column)|alter\s+column/i);
    expect(code).not.toMatch(/\bpublic\./);
    expect(code).not.toMatch(/grant\s+[a-z, ]+on all tables/i);
  });

  it("seeds SM-1 exactly as content/skill_map/SM-1.json, with its sha256, and publishes it once", () => {
    const m = /\$j\$([\s\S]*?)\$j\$::jsonb/.exec(sql);
    expect(m, "embedded JSON").not.toBeNull();
    expect(JSON.parse(m![1]!)).toEqual(JSON.parse(fileText));
    expect(sql.match(/\$j\$/g)).toHaveLength(2);
    expect(code).toContain(`v_hash constant text := '${sourceHash(JSON.parse(fileText))}';`);
    expect(code).toContain("if exists (select 1 from english.skill_maps m where m.id = j ->> 'id' and m.published_at is not null) then");
    expect(code).toMatch(/update english\.skill_maps set published_at = pg_catalog\.now\(\)\s+where id = j ->> 'id' and published_at is null;/);
  });

  it("the four tables are versioned configuration: immutable once published, never truncated, RLS on, read-only for members", () => {
    for (const t of TABLES) {
      expect(code).toContain(`create table if not exists english.${t} (`);
      expect(code).toContain(`alter table english.${t} enable row level security;`);
      expect(code).toMatch(new RegExp(`create policy ${t}_select on english\\.${t}\\s+for select to authenticated`));
    }
    expect(code).toMatch(/create trigger skill_maps_immutable\s+before update or delete on english\.skill_maps\s+for each row execute function english\.eng_forbid_published_change\('self'\);/);
    expect(code).toContain("foreach t in array array['skill_domains', 'skill_groups', 'skill_leaves'] loop");
    expect(code).toContain("'create trigger %I before insert or update or delete on english.%I for each row execute function english.eng_forbid_skill_map_change()'");
    expect(code).toContain("foreach t in array array['skill_maps', 'skill_domains', 'skill_groups', 'skill_leaves'] loop");
    expect(code).toContain("grant select on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves to authenticated;");
    expect(code).toContain(
      "revoke insert, update, delete, truncate on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves from public, anon, authenticated, service_role;",
    );
    expect(code).toContain("revoke all on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves from anon;");
    expect(code).toContain("revoke execute on function english.eng_forbid_skill_map_change() from public, anon, authenticated;");
  });

  it("the seed checks every leaf against the catalogue, the seed tags and its domain's scale before publishing", () => {
    expect(code).toContain("0019: SM-1 names a catalogue skill that does not exist");
    expect(code).toContain("0019: SM-1 names a seed tag that does not exist");
    expect(code).toContain("0019: a leaf uses the other scale than its domain");
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run tests/unit/migration0019.test.ts` → FAIL (ENOENT `0019_skill_map.sql`).

- [ ] **Step 3: Create the migration (part 1)** — `db/migrations/0019_skill_map.sql`. The two markers `__SM1_JSON__` and `__SM1_SHA256__` are replaced in Step 4 by a command (never by hand).

```sql
-- 0019_skill_map.sql
-- SM-1 · Bản đồ kỹ năng (spec docs/superpowers/specs/2026-10-21-skill-map-levels-design.md §2, §6):
--   1. Bốn bảng cấu hình có phiên bản: skill_maps (bản đồ; công bố = bất biến), skill_domains (7 mảng), skill_groups (40 nhóm, mô tả
--      theo cấp), skill_leaves (lá = nhãn có sẵn theo track hoặc kỹ năng danh mục; cấp; core; ẩn khỏi ô chọn; liên quan).
--   2. Seed SM-1 = đúng nội dung content/skill_map/SM-1.json (test so khớp JSON + sha256), kiểm từng lá, rồi công bố.
--   3. error_tags.group_key (nullable, chỉ nhãn riêng) + eng_add_error_tag_v2 (bắt buộc nhóm của bản đồ hiện hành)
--      + eng_set_tag_group (xếp nhóm cho nhãn riêng cũ chưa có nhóm). eng_add_error_tag của 0014 vẫn chạy (expand).
--   4. eng_skill_map(p_learner): bản đồ hiện hành cho một em (mảng → nhóm → lá; nhãn theo track + nhãn riêng của gia đình;
--      mọi kỹ năng danh mục có cờ "trong bộ"; mục "chưa xếp mảng").
-- Đổi bản đồ = phiên bản mới (SM-2, migration mới), phụ huynh duyệt. Mọi hàm gọi được: security definer, search_path = '',
-- chỉ service_role (server gọi SAU requireAccess). Không đụng schema public. Idempotent; chỉ thêm.

-- 1. Bảng ------------------------------------------------------------------------------------------------------------------------------
create table if not exists english.skill_maps (
  id text primary key check (id ~ '^SM-[0-9]{1,3}$'),
  title_vi text not null check (pg_catalog.length(pg_catalog.btrim(title_vi)) between 1 and 120),
  catalogue_version text not null references english.catalogue_versions(version),
  -- Cấp giả định theo track: {"A": {"grammar": "A2", …, "thinking": 1}, "B": {…}}. Cấu hình (SM-2 hiện "giả định"), không phải dữ liệu của em.
  assumed jsonb not null check (pg_catalog.jsonb_typeof(assumed) = 'object'),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz
);

create table if not exists english.skill_domains (
  map_id text not null references english.skill_maps(id),
  key text not null check (key in ('grammar', 'vocab', 'reading', 'listening', 'writing', 'speaking', 'thinking')),
  ord int not null check (ord between 1 and 7),
  name_vi text not null check (pg_catalog.length(pg_catalog.btrim(name_vi)) between 1 and 60),
  scale text not null check (scale in ('cefr', 'task_level')),
  primary key (map_id, key),
  unique (map_id, ord)
);

create table if not exists english.skill_groups (
  map_id text not null,
  key text not null check (key ~ '^[a-z]{2}-[a-z-]{2,30}$'),
  domain_key text not null,
  ord int not null check (ord between 1 and 99),
  name_vi text not null check (pg_catalog.length(pg_catalog.btrim(name_vi)) between 1 and 80),
  -- Mảng CEFR: {"A1-A2","B1","B2","C1-C2"} → chữ hoặc null; mảng task_level: {"low","high"}.
  descriptions jsonb not null check (pg_catalog.jsonb_typeof(descriptions) = 'object'),
  primary key (map_id, key),
  unique (map_id, domain_key, ord),
  foreign key (map_id, domain_key) references english.skill_domains(map_id, key)
);

create table if not exists english.skill_leaves (
  map_id text not null,
  kind text not null check (kind in ('tag', 'target')),
  track_id text not null references english.tracks(id),
  -- tag: error_tags.key (nhãn có sẵn, family_id null) của track_id; target: targets.id của danh mục của bản đồ.
  ref_key text not null check (pg_catalog.length(ref_key) between 1 and 100),
  group_key text not null,
  ord int not null check (ord between 1 and 999),
  level_from text check (level_from in ('A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2')),
  level_to text check (level_to in ('A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2')),
  task_from int check (task_from between 1 and 4),
  task_to int check (task_to between 1 and 4),
  level_note text check (level_note is null or pg_catalog.length(level_note) <= 200),
  core boolean not null default false,
  hidden_in_picker boolean not null default false,
  -- Mã kỹ năng danh mục "liên quan" (nhãn ↔ kỹ năng gần nghĩa, spec §2 quy tắc 4).
  related text[] not null default '{}',
  primary key (map_id, kind, track_id, ref_key),
  unique (map_id, group_key, ord),
  foreign key (map_id, group_key) references english.skill_groups(map_id, key),
  constraint skill_leaves_level_pairs check ((level_from is null) = (level_to is null) and (task_from is null) = (task_to is null)),
  constraint skill_leaves_one_scale check (level_from is null or task_from is null),
  constraint skill_leaves_task_order check (task_from is null or task_from <= task_to)
);

-- Bất biến sau công bố ------------------------------------------------------------------------------------------------------------------
-- skill_maps dùng lại eng_forbid_published_change('self') của 0005. Dòng con của một bản đồ ĐÃ công bố không thêm / sửa / xóa được.
create or replace function english.eng_forbid_skill_map_change() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_map text;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'english.%: TRUNCATE is forbidden on versioned configuration', tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    v_map := new.map_id;
  else
    v_map := old.map_id;
  end if;
  if exists (select 1 from english.skill_maps m where m.id = v_map and m.published_at is not null) then
    raise exception 'english.%: % is forbidden on a published skill map (publish a new version instead)', tg_table_name, tg_op
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;
revoke execute on function english.eng_forbid_skill_map_change() from public, anon, authenticated;

drop trigger if exists skill_maps_immutable on english.skill_maps;
create trigger skill_maps_immutable
  before update or delete on english.skill_maps
  for each row execute function english.eng_forbid_published_change('self');

do $$
declare
  t text;
begin
  foreach t in array array['skill_domains', 'skill_groups', 'skill_leaves'] loop
    execute format('drop trigger if exists %I on english.%I', t || '_immutable', t);
    execute format(
      'create trigger %I before insert or update or delete on english.%I for each row execute function english.eng_forbid_skill_map_change()',
      t || '_immutable', t);
  end loop;
  foreach t in array array['skill_maps', 'skill_domains', 'skill_groups', 'skill_leaves'] loop
    execute format('drop trigger if exists %I on english.%I', t || '_immutable_truncate', t);
    execute format(
      'create trigger %I before truncate on english.%I for each statement execute function english.eng_forbid_published_change()',
      t || '_immutable_truncate', t);
  end loop;
end
$$;

-- RLS: thành viên app đọc bản đồ ĐÃ công bố (như cấu hình ở 0005). Không có policy ghi; ghi chỉ bằng migration.
alter table english.skill_maps enable row level security;
alter table english.skill_domains enable row level security;
alter table english.skill_groups enable row level security;
alter table english.skill_leaves enable row level security;

drop policy if exists skill_maps_select on english.skill_maps;
create policy skill_maps_select on english.skill_maps
  for select to authenticated
  using (published_at is not null and english.eng_current_member_id() is not null);

drop policy if exists skill_domains_select on english.skill_domains;
create policy skill_domains_select on english.skill_domains
  for select to authenticated
  using (english.eng_current_member_id() is not null
         and exists (select 1 from english.skill_maps m where m.id = skill_domains.map_id and m.published_at is not null));

drop policy if exists skill_groups_select on english.skill_groups;
create policy skill_groups_select on english.skill_groups
  for select to authenticated
  using (english.eng_current_member_id() is not null
         and exists (select 1 from english.skill_maps m where m.id = skill_groups.map_id and m.published_at is not null));

drop policy if exists skill_leaves_select on english.skill_leaves;
create policy skill_leaves_select on english.skill_leaves
  for select to authenticated
  using (english.eng_current_member_id() is not null
         and exists (select 1 from english.skill_maps m where m.id = skill_leaves.map_id and m.published_at is not null));

grant select on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves to authenticated;
revoke insert, update, delete, truncate on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves from public, anon, authenticated, service_role;
revoke all on english.skill_maps, english.skill_domains, english.skill_groups, english.skill_leaves from anon;

-- 2. Seed SM-1 (nội dung = content/skill_map/SM-1.json; đã công bố thì chạy lại không đụng gì) ------------------------------------------
do $seed$
declare
  j constant jsonb := $j$__SM1_JSON__$j$::jsonb;
  v_hash constant text := '__SM1_SHA256__';
begin
  if exists (select 1 from english.skill_maps m where m.id = j ->> 'id' and m.published_at is not null) then
    return;
  end if;

  insert into english.skill_maps(id, title_vi, catalogue_version, assumed, source_hash)
  values (j ->> 'id', j ->> 'title_vi', j ->> 'catalogue_version', j -> 'assumed', v_hash)
  on conflict (id) do nothing;

  insert into english.skill_domains(map_id, key, ord, name_vi, scale)
  select j ->> 'id', d.d ->> 'key', d.ord::int, d.d ->> 'name_vi', d.d ->> 'scale'
  from pg_catalog.jsonb_array_elements(j -> 'domains') with ordinality as d(d, ord)
  on conflict do nothing;

  insert into english.skill_groups(map_id, key, domain_key, ord, name_vi, descriptions)
  select j ->> 'id', g.g ->> 'key', d.d ->> 'key', g.ord::int, g.g ->> 'name_vi', g.g -> 'desc'
  from pg_catalog.jsonb_array_elements(j -> 'domains') as d(d)
  cross join lateral pg_catalog.jsonb_array_elements(d.d -> 'groups') with ordinality as g(g, ord)
  on conflict do nothing;

  insert into english.skill_leaves(map_id, kind, track_id, ref_key, group_key, ord, level_from, level_to, task_from, task_to,
                                   level_note, core, hidden_in_picker, related)
  select j ->> 'id', l.l ->> 'kind', l.l ->> 'track', l.l ->> 'ref', g.g ->> 'key', l.ord::int,
         l.l ->> 'level_from', l.l ->> 'level_to', (l.l ->> 'task_from')::int, (l.l ->> 'task_to')::int, l.l ->> 'level_note',
         coalesce((l.l ->> 'core')::boolean, false), coalesce((l.l ->> 'hidden_in_picker')::boolean, false),
         array(select r.v from pg_catalog.jsonb_array_elements_text(coalesce(l.l -> 'related', '[]'::jsonb)) with ordinality as r(v, n) order by r.n)
  from pg_catalog.jsonb_array_elements(j -> 'domains') as d(d)
  cross join lateral pg_catalog.jsonb_array_elements(d.d -> 'groups') as g(g)
  cross join lateral pg_catalog.jsonb_array_elements(g.g -> 'leaves') with ordinality as l(l, ord)
  on conflict do nothing;

  -- Kiểm trước khi công bố (lỗi = cả migration dừng, không có bản đồ nửa vời).
  if exists (
    select 1 from english.skill_leaves lf
    where lf.map_id = j ->> 'id' and lf.kind = 'target'
      and not exists (select 1 from english.targets t
                      where t.id = lf.ref_key and t.descriptor_version = j ->> 'catalogue_version' and t.track_id = lf.track_id)) then
    raise exception '0019: SM-1 names a catalogue skill that does not exist in catalogue %', j ->> 'catalogue_version';
  end if;
  if exists (
    select 1 from english.skill_leaves lf
    where lf.map_id = j ->> 'id' and lf.kind = 'tag'
      and not exists (select 1 from english.error_tags t
                      where t.track_id = lf.track_id and t.key = lf.ref_key and t.family_id is null)) then
    raise exception '0019: SM-1 names a seed tag that does not exist (apply 0015 and 0018 first)';
  end if;
  if exists (
    select 1 from english.skill_leaves lf
    join english.skill_groups g on g.map_id = lf.map_id and g.key = lf.group_key
    join english.skill_domains dm on dm.map_id = g.map_id and dm.key = g.domain_key
    where lf.map_id = j ->> 'id'
      and ((dm.scale = 'cefr' and lf.task_from is not null) or (dm.scale = 'task_level' and lf.level_from is not null))) then
    raise exception '0019: a leaf uses the other scale than its domain';
  end if;

  update english.skill_maps set published_at = pg_catalog.now()
    where id = j ->> 'id' and published_at is null;
end
$seed$;

insert into english.schema_migrations(version) values ('0019') on conflict do nothing;
```

(The `schema_migrations` line stays the LAST line of the file; Task 3 inserts its sections above it.)

- [ ] **Step 4: Splice the JSON and its hash into the migration** (run from the repo root; it refuses to run twice)

```bash
node -e '
const fs = require("fs"), crypto = require("crypto");
const p = "db/migrations/0019_skill_map.sql";
const json = fs.readFileSync("content/skill_map/SM-1.json", "utf8").trimEnd();
const hash = crypto.createHash("sha256").update(JSON.stringify(JSON.parse(json))).digest("hex");
let sql = fs.readFileSync(p, "utf8");
if (!sql.includes("__SM1_JSON__") || !sql.includes("__SM1_SHA256__")) throw new Error("markers already replaced");
sql = sql.replace("__SM1_JSON__", () => json).replace("__SM1_SHA256__", () => hash);
fs.writeFileSync(p, sql);
console.log("SM-1 sha256", hash);'
```

Expected: prints `SM-1 sha256 22548cc5ce2313eeba7f1b8707192340bde7c7f1405d4ed54e4caa1df76c7030` (a different hash means SM-1.json differs from Task 1 Step 5). `sourceHash` in `lib/config/content.ts` is the same sha256 of `JSON.stringify(JSON.parse(...))`.

- [ ] **Step 5: Run the unit test** — `npx vitest run tests/unit/migration0019.test.ts` → PASS (4 tests).

- [ ] **Step 6: Write the failing DB test** — `tests/db/skillMap.test.ts` (file created here, grown in Task 3)

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customTagKey } from "../../lib/tutorwork/frameScore";
import { asCommit, createAuthUser, createTestDb, migrate, rowsAs, seed, type Seeded, type TestDb } from "./helpers";

/** SM-1 (migration 0019): the skill map. One database for the whole file. */
describe("SM-1 skill map (migration 0019)", () => {
  let db: TestDb;
  let s: Seeded;
  let family2: string;
  let parent2Member: string;
  let learner2: string;
  const M = () => s.members;
  const NG = () => s.learners.nguyen;
  const AN = () => s.learners.an;
  const q1 = async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.client.query<R>(sql, params)).rows;
  const n = async (sql: string, params: unknown[] = []) => ((await q1<{ n: number }>(sql, params))[0] as { n: number }).n;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
    const parent2User = await createAuthUser(db.client, "parent2@test.local");
    family2 = (await q1<{ id: string }>("insert into english.families(name) values ('Other family') returning id"))[0]!.id;
    parent2Member = (await q1<{ id: string }>("insert into english.members(user_id, family_id, role, display_name) values ($1, $2, 'parent', 'Other parent') returning id", [parent2User, family2]))[0]!.id;
    learner2 = (await q1<{ id: string }>("insert into english.learners(family_id, alias, track_id, is_test, status) values ($1, 'Other child', 'B', true, 'active') returning id", [family2]))[0]!.id;
    await q1("insert into english.relationships(member_id, learner_id, relation) values ($1, $2, 'parent')", [parent2Member, learner2]);
  });
  afterAll(async () => {
    await db?.drop();
  });

  describe("1. the published map", () => {
    it("SM-1 is published with 7 domains, 40 groups, 110 leaves (40 tags + 70 skills)", async () => {
      expect(await q1("select id, catalogue_version, published_at is not null as published from english.skill_maps")).toEqual([
        { id: "SM-1", catalogue_version: "0.2.1-draft", published: true },
      ]);
      expect((await q1<{ key: string }>("select key from english.skill_domains where map_id = 'SM-1' order by ord")).map((r) => r.key)).toEqual([
        "grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking",
      ]);
      expect(await n("select count(*)::int as n from english.skill_groups where map_id = 'SM-1'")).toBe(40);
      expect(await q1("select kind, count(*)::int as n from english.skill_leaves where map_id = 'SM-1' group by kind order by kind")).toEqual([
        { kind: "tag", n: 40 },
        { kind: "target", n: 70 },
      ]);
    });

    it("every seed tag still in use has exactly one leaf, and A's doc-hieu is hidden from the picker", async () => {
      expect(await n(`select count(*)::int as n from english.error_tags t where t.family_id is null and t.retired_at is null
                      and not exists (select 1 from english.skill_leaves lf where lf.map_id = 'SM-1' and lf.kind = 'tag' and lf.track_id = t.track_id and lf.ref_key = t.key)`)).toBe(0);
      expect(await q1("select track_id, ref_key, group_key from english.skill_leaves where hidden_in_picker")).toEqual([
        { track_id: "A", ref_key: "doc-hieu", group_key: "re-gist-detail" },
      ]);
      expect(await q1("select ref_key, level_from, level_to, task_from, task_to from english.skill_leaves where ref_key in ('B-L1-TRANSFORM-W', 'B-T5-SUPPORT', 'B-L7-DATA') order by ref_key")).toEqual([
        { ref_key: "B-L1-TRANSFORM-W", level_from: "B1", level_to: "B2", task_from: null, task_to: null },
        { ref_key: "B-L7-DATA", level_from: null, level_to: null, task_from: null, task_to: null },
        { ref_key: "B-T5-SUPPORT", level_from: null, level_to: null, task_from: 3, task_to: 4 },
      ]);
      expect(await q1("select related from english.skill_leaves where kind = 'tag' and track_id = 'B' and ref_key = 'doc-fact-opinion'")).toEqual([{ related: ["B-T5-DATAOP"] }]);
    });

    it("is immutable: no insert, update, delete or truncate on any of the four tables, even for the owner", async () => {
      const tries = [
        "update english.skill_maps set title_vi = 'x'",
        "delete from english.skill_maps",
        "update english.skill_groups set name_vi = 'x' where key = 'gr-tense'",
        "delete from english.skill_domains where key = 'thinking'",
        "update english.skill_leaves set core = true",
        "insert into english.skill_leaves(map_id, kind, track_id, ref_key, group_key, ord) values ('SM-1', 'tag', 'B', 'x-new', 'gr-tense', 999)",
        "truncate english.skill_leaves",
      ];
      for (const sql of tries) {
        const err = await db.client.query(sql).then(() => null, (e: unknown) => e as { code?: string });
        expect(err?.code, sql).toBe("42501");
      }
      // the other three are referenced by foreign keys (a plain TRUNCATE fails earlier); each still has its truncate guard
      expect(await n(`select count(*)::int as n from pg_trigger where not tgisinternal and tgname in
                      ('skill_maps_immutable_truncate', 'skill_domains_immutable_truncate', 'skill_groups_immutable_truncate', 'skill_leaves_immutable_truncate')`)).toBe(4);
    });

    it("running every migration again changes nothing", async () => {
      const before = await q1("select (select count(*) from english.skill_leaves)::int as l, (select published_at from english.skill_maps) as p");
      await migrate(db.client, true);
      expect(await q1("select (select count(*) from english.skill_leaves)::int as l, (select published_at from english.skill_maps) as p")).toEqual(before);
    });

    it("members read the published map; anon reads nothing", async () => {
      expect((await rowsAs<{ n: number }>(db.client, "authenticated", s.users.tutorNguyen, "select count(*)::int as n from english.skill_groups"))[0]?.n).toBe(40);
      const anon = await q1<{ t: string; ok: boolean }>(`select t, has_table_privilege('anon', ('english.' || t)::regclass, 'select') as ok
                    from unnest(array['skill_maps', 'skill_domains', 'skill_groups', 'skill_leaves']) as t`);
      expect(anon.every((r) => !r.ok)).toBe(true);
    });
  });
});
```

(`svc`, `fail`, `randomUUID`, `customTagKey`, `AN`, `NG`, `M`, `family2`, `parent2Member`, `learner2` are used by the sections Task 3 adds; until then ESLint may flag them as unused — run lint only at the end of Task 3.)

- [ ] **Step 7: Update the table lists** in `tests/db/migrations.test.ts`:
  - In "RLS is enabled on every english table", replace `"observations", "reading_reports", "recheck_events", "relationships", "results", "schema_migrations", "source_transcripts",` with `"observations", "reading_reports", "recheck_events", "relationships", "results", "schema_migrations", "skill_domains", "skill_groups", "skill_leaves", "skill_maps", "source_transcripts",`.
  - In "authenticated only has SELECT, and only on the readable tables", replace `"reading_reports", "recheck_events", "relationships", "results", "source_transcripts",` with `"reading_reports", "recheck_events", "relationships", "results", "skill_domains", "skill_groups", "skill_leaves", "skill_maps", "source_transcripts",`.

- [ ] **Step 8: Run the DB tests** — `npm run test:db -- tests/db/skillMap.test.ts tests/db/migrations.test.ts` → PASS.

- [ ] **Step 9: Commit**

```bash
git add db/migrations/0019_skill_map.sql tests/unit/migration0019.test.ts tests/db/skillMap.test.ts tests/db/migrations.test.ts
git commit -m "feat(sm-1): migration 0019 part 1 - immutable skill map tables, SM-1 seeded from the JSON and published"
```

---

### Task 3: Migration 0019 part 2 — `error_tags.group_key`, add-tag v2, set group, `eng_skill_map`

**Files:**
- Modify: `db/migrations/0019_skill_map.sql` (insert sections 3–4 ABOVE the final `schema_migrations` line)
- Test: `tests/unit/migration0019.test.ts`, `tests/db/skillMap.test.ts`

**Interfaces:**
- Consumes: tables of Task 2; `english.eng_actor_may_manage(p_member uuid, p_learner uuid)` (0007); `english.audit_log`; `english.target_sets` / `target_set_definitions` (0005).
- Produces (SQL, service_role only unless noted):
  - column `english.error_tags.group_key text null` — only `origin = 'custom'` rows may fill it, shape `^[a-z]{2}-[a-z-]{2,30}$`.
  - `english.eng_current_skill_map() returns text` — internal (nobody may execute it directly).
  - `english.eng_add_error_tag_v2(p_learner uuid, p_key text, p_label text, p_group_key text, p_by uuid) returns jsonb` → `{key, label_vi, group_key, created}`. Errors: `22004` missing argument; `P0002` learner; `42501` actor; `22023` key/label shape; `23514` `(unknown_group)`.
  - `english.eng_set_tag_group(p_learner uuid, p_tag_key text, p_group_key text, p_by uuid) returns jsonb` → `{key, group_key, changed}`. Errors: `22004`; `P0002` learner / no custom tag of this family + track with this key; `42501` actor; `23514` `(unknown_group)` / `(already_grouped)`. Writes `audit_log` action `error_tag.grouped`.
  - `english.eng_skill_map(p_learner uuid) returns jsonb` →
    `{map_id, track_id, assumed: {grammar…speaking: text, thinking: int}, domains: [{key, name_vi, scale, groups: [{key, name_vi, desc, leaves: [Leaf]}]}], unassigned: [Leaf]}` with
    `Leaf = {kind, track_id, ref_key, label_vi, level_from, level_to, task_from, task_to, core, hidden_in_picker, related: text[], custom, in_set}`.
    Leaves of a group, in order: seed tags of the learner's track (map order, hidden ones included with their flag), the family's grouped custom tags (by label), skills of the learner's current set (map order), the other catalogue skills (map order). `unassigned` = tags of the learner's track (seed or this family's) still in use that have no group in the map.

- [ ] **Step 1: Add failing unit assertions** — append inside the `describe` of `tests/unit/migration0019.test.ts`:

```ts
  it("error_tags.group_key is a nullable column (expand) that only family tags may fill, with the group-key shape", () => {
    expect(code).toContain("alter table english.error_tags add column if not exists group_key text;");
    expect(code).toContain("check (group_key is null or (origin = 'custom' and group_key ~ '^[a-z]{2}-[a-z-]{2,30}$'))");
  });

  it("keeps eng_add_error_tag of 0014 untouched (expand) and adds v2, set-group and the read function", () => {
    expect(code).not.toContain("function english.eng_add_error_tag(");
    for (const f of ["eng_current_skill_map(", "eng_add_error_tag_v2(", "eng_set_tag_group(", "eng_skill_map("]) {
      expect(code).toContain(`create or replace function english.${f}`);
    }
    expect(code).toContain("(unknown_group)");
    expect(code).toContain("(already_grouped)");
    expect(code).toContain("'error_tag.grouped'");
  });

  it("every function pins search_path; callable ones are security definer and closed to everyone but service_role", () => {
    for (const m of code.matchAll(/create or replace function english\.(\w+)\(([\s\S]*?)\n\$\$;/g)) {
      expect(m[0], `${m[1]} search_path`).toMatch(/set search_path = ''/);
      if (!/returns trigger/.test(m[0])) expect(m[0], `${m[1]} security definer`).toMatch(/security definer/);
    }
    for (const sig of ["eng_add_error_tag_v2(uuid, text, text, text, uuid)", "eng_set_tag_group(uuid, text, text, uuid)", "eng_skill_map(uuid)"]) {
      expect(code).toContain(`revoke execute on function english.${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function english.${sig} to service_role;`);
    }
    expect(code).toContain("revoke execute on function english.eng_current_skill_map() from public, anon, authenticated, service_role;");
  });
```

Run: `npx vitest run tests/unit/migration0019.test.ts` → FAIL (3 new tests).

- [ ] **Step 2: Insert section 3 into the migration** (above the final line)

```sql
-- 3. Nhãn riêng có nhóm ------------------------------------------------------------------------------------------------------------------
-- Chỉ nhãn riêng (origin 'custom') mang group_key; nhãn có sẵn lấy nhóm từ skill_leaves. Nhãn riêng cũ (trước SM-1) để trống →
-- mục "Chưa xếp mảng" cho tới khi gia sư/phụ huynh xếp (eng_set_tag_group).
alter table english.error_tags add column if not exists group_key text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'error_tags_group_key_shape' and conrelid = 'english.error_tags'::regclass
  ) then
    alter table english.error_tags add constraint error_tags_group_key_shape
      check (group_key is null or (origin = 'custom' and group_key ~ '^[a-z]{2}-[a-z-]{2,30}$'));
  end if;
end
$$;

-- Bản đồ hiện hành = bản đã công bố mới nhất. Hàm nội bộ.
create or replace function english.eng_current_skill_map() returns text
language sql stable security definer set search_path = ''
as $$
  select m.id from english.skill_maps m where m.published_at is not null order by m.published_at desc, m.id desc limit 1
$$;

-- "+ nhãn khác" phiên bản 2: như eng_add_error_tag (0014) và BẮT BUỘC một nhóm của bản đồ hiện hành.
-- Trùng tên với nhãn đang dùng → trả nhãn đó (created = false); nếu đó là nhãn riêng cũ chưa có nhóm thì xếp luôn vào nhóm vừa chọn.
create or replace function english.eng_add_error_tag_v2(p_learner uuid, p_key text, p_label text, p_group_key text, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_learner english.learners%rowtype;
  v_label text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  v_map text := english.eng_current_skill_map();
  v_existing english.error_tags%rowtype;
  v_key text;
  v_try int := 0;
begin
  if p_learner is null or p_key is null or p_group_key is null or p_by is null then
    raise exception 'eng_add_error_tag_v2: learner, key, group and actor are required' using errcode = '22004';
  end if;
  select * into v_learner from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_add_error_tag_v2: learner not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from english.members m where m.id = p_by and m.role in ('tutor', 'parent')) or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_add_error_tag_v2: this member may not add tags for this learner' using errcode = '42501';
  end if;
  if p_key !~ '^x-[a-z0-9][a-z0-9-]{0,44}$' or pg_catalog.length(v_label) not between 2 and 120 then
    raise exception 'eng_add_error_tag_v2: key must look like x-name and the label be 2 to 120 characters' using errcode = '22023';
  end if;
  if v_map is null or not exists (select 1 from english.skill_groups g where g.map_id = v_map and g.key = p_group_key) then
    raise exception 'eng_add_error_tag_v2: the group is not in the current skill map (unknown_group)' using errcode = '23514';
  end if;

  -- Cùng khóa với eng_add_error_tag (0014): hai lần thêm cùng tên cùng lúc trong một gia đình xếp hàng, dù gọi bản nào.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('error_tag:' || v_learner.family_id::text || ':' || v_learner.track_id || ':' || pg_catalog.lower(v_label), 0));
  select * into v_existing from english.error_tags t
  where t.track_id = v_learner.track_id and (t.family_id is null or t.family_id = v_learner.family_id)
    and t.retired_at is null and pg_catalog.lower(t.label_vi) = pg_catalog.lower(v_label)
  order by t.family_id nulls first limit 1;
  if found then
    if v_existing.origin = 'custom' and v_existing.group_key is null then
      update english.error_tags set group_key = p_group_key where id = v_existing.id;
      v_existing.group_key := p_group_key;
    end if;
    return pg_catalog.jsonb_build_object('key', v_existing.key, 'label_vi', v_existing.label_vi, 'group_key', v_existing.group_key, 'created', false);
  end if;

  loop
    v_try := v_try + 1;
    v_key := p_key || '-' || pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::text || pg_catalog.clock_timestamp()::text || v_try::text), 1, 5);
    begin
      insert into english.error_tags(track_id, key, label_vi, group_vi, family_id, origin, created_by, group_key)
      values (v_learner.track_id, v_key, v_label, 'Nhãn riêng', v_learner.family_id, 'custom', p_by, p_group_key);
      exit;
    exception when unique_violation then
      if v_try >= 10 then
        raise exception 'eng_add_error_tag_v2: could not make a unique key, try again' using errcode = 'P0001';
      end if;
    end;
  end loop;
  return pg_catalog.jsonb_build_object('key', v_key, 'label_vi', v_label, 'group_key', p_group_key, 'created', true);
end
$$;

-- "Xếp vào nhóm": cho một nhãn riêng CHƯA có nhóm (thêm trước SM-1 hoặc bằng hàm cũ). Gia sư / phụ huynh của em; nhãn của gia đình
-- và track của em. Gửi lại đúng nhóm đã xếp = trả lại (changed = false); nhóm khác → (already_grouped). Nhãn của nhà khác = không thấy.
create or replace function english.eng_set_tag_group(p_learner uuid, p_tag_key text, p_group_key text, p_by uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_learner english.learners%rowtype;
  v_member english.members%rowtype;
  v_tag english.error_tags%rowtype;
  v_map text := english.eng_current_skill_map();
begin
  if p_learner is null or p_tag_key is null or p_group_key is null or p_by is null then
    raise exception 'eng_set_tag_group: learner, tag, group and actor are required' using errcode = '22004';
  end if;
  select * into v_learner from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_set_tag_group: learner not found' using errcode = 'P0002';
  end if;
  select * into v_member from english.members m where m.id = p_by;
  if v_member.id is null or v_member.role not in ('tutor', 'parent') or not english.eng_actor_may_manage(p_by, p_learner) then
    raise exception 'eng_set_tag_group: this member may not change tags for this learner' using errcode = '42501';
  end if;
  select * into v_tag from english.error_tags t
  where t.track_id = v_learner.track_id and t.key = p_tag_key and t.family_id = v_learner.family_id
    and t.origin = 'custom' and t.retired_at is null
  for update;
  if not found then
    raise exception 'eng_set_tag_group: no family tag with this key for this learner' using errcode = 'P0002';
  end if;
  if v_map is null or not exists (select 1 from english.skill_groups g where g.map_id = v_map and g.key = p_group_key) then
    raise exception 'eng_set_tag_group: the group is not in the current skill map (unknown_group)' using errcode = '23514';
  end if;
  if v_tag.group_key is not null then
    if v_tag.group_key = p_group_key then
      return pg_catalog.jsonb_build_object('key', v_tag.key, 'group_key', v_tag.group_key, 'changed', false);
    end if;
    raise exception 'eng_set_tag_group: this tag already has a group (already_grouped)' using errcode = '23514';
  end if;

  update english.error_tags set group_key = p_group_key where id = v_tag.id;
  insert into english.audit_log(actor_user_id, actor_role, action, family_id, learner_id, payload)
  values (v_member.user_id, v_member.role, 'error_tag.grouped', v_learner.family_id, p_learner,
          pg_catalog.jsonb_build_object('tag_key', v_tag.key, 'group_key', p_group_key, 'map_id', v_map));
  return pg_catalog.jsonb_build_object('key', v_tag.key, 'group_key', p_group_key, 'changed', true);
end
$$;
```

- [ ] **Step 3: Insert section 4 (read function + privileges)** (above the final line)

```sql
-- 4. Đọc ----------------------------------------------------------------------------------------------------------------------------------
-- Bản đồ hiện hành cho một em (gia sư / phụ huynh; server gọi sau requireAccess). "Điểm cần chú ý" KHÔNG đổi SQL: app gộp
-- kết quả eng_weak_points theo bản đồ này.
create or replace function english.eng_skill_map(p_learner uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l english.learners%rowtype;
  v_map english.skill_maps%rowtype;
  v_set text[];
begin
  select * into v_l from english.learners l where l.id = p_learner;
  if not found then
    raise exception 'eng_skill_map: learner not found' using errcode = 'P0002';
  end if;
  select * into v_map from english.skill_maps m where m.published_at is not null order by m.published_at desc, m.id desc limit 1;
  if not found then
    raise exception 'eng_skill_map: no published skill map' using errcode = 'P0002';
  end if;
  select d.target_ids into v_set
  from english.target_sets ts
  join english.target_set_definitions d on d.id = ts.definition_id
  where ts.learner_id = p_learner and ts.effective_from <= pg_catalog.clock_timestamp()
  order by ts.effective_from desc, ts.seq desc
  limit 1;
  v_set := coalesce(v_set, '{}'::text[]);

  return (
    with leaves as (
      -- nhãn có sẵn của track em (kể cả lá ẩn khỏi ô chọn: dấu nhãn cũ vẫn cần tên và mảng)
      select lf.group_key, 0 as o1, lf.ord as o2, t.label_vi as o3,
             pg_catalog.jsonb_build_object(
               'kind', 'tag', 'track_id', lf.track_id, 'ref_key', lf.ref_key, 'label_vi', t.label_vi,
               'level_from', lf.level_from, 'level_to', lf.level_to, 'task_from', lf.task_from, 'task_to', lf.task_to,
               'core', lf.core, 'hidden_in_picker', lf.hidden_in_picker, 'related', pg_catalog.to_jsonb(lf.related),
               'custom', false, 'in_set', false) as leaf
      from english.skill_leaves lf
      join english.error_tags t on t.track_id = lf.track_id and t.key = lf.ref_key and t.family_id is null and t.retired_at is null
      where lf.map_id = v_map.id and lf.kind = 'tag' and lf.track_id = v_l.track_id
      union all
      -- nhãn riêng của gia đình đã có nhóm
      select t.group_key, 1, 0, t.label_vi,
             pg_catalog.jsonb_build_object(
               'kind', 'tag', 'track_id', t.track_id, 'ref_key', t.key, 'label_vi', t.label_vi,
               'level_from', null, 'level_to', null, 'task_from', null, 'task_to', null,
               'core', false, 'hidden_in_picker', false, 'related', '[]'::jsonb, 'custom', true, 'in_set', false)
      from english.error_tags t
      where t.family_id = v_l.family_id and t.track_id = v_l.track_id and t.retired_at is null and t.group_key is not null
        and exists (select 1 from english.skill_groups g where g.map_id = v_map.id and g.key = t.group_key)
      union all
      -- mọi kỹ năng danh mục của bản đồ; "trong bộ" = trong bộ kỹ năng hiện tại của em
      select lf.group_key, case when lf.ref_key = any (v_set) then 2 else 3 end, lf.ord, tg.title_vi,
             pg_catalog.jsonb_build_object(
               'kind', 'target', 'track_id', lf.track_id, 'ref_key', lf.ref_key, 'label_vi', tg.title_vi,
               'level_from', lf.level_from, 'level_to', lf.level_to, 'task_from', lf.task_from, 'task_to', lf.task_to,
               'core', lf.core, 'hidden_in_picker', lf.hidden_in_picker, 'related', pg_catalog.to_jsonb(lf.related),
               'custom', false, 'in_set', lf.ref_key = any (v_set))
      from english.skill_leaves lf
      join english.targets tg on tg.id = lf.ref_key and tg.descriptor_version = v_map.catalogue_version
      where lf.map_id = v_map.id and lf.kind = 'target'
    ),
    loose as (
      -- nhãn đang dùng của track em (có sẵn hoặc của gia đình) chưa có nhóm trong bản đồ
      select t.created_at, t.label_vi,
             pg_catalog.jsonb_build_object(
               'kind', 'tag', 'track_id', t.track_id, 'ref_key', t.key, 'label_vi', t.label_vi,
               'level_from', null, 'level_to', null, 'task_from', null, 'task_to', null,
               'core', false, 'hidden_in_picker', false, 'related', '[]'::jsonb, 'custom', t.origin = 'custom', 'in_set', false) as leaf
      from english.error_tags t
      where t.track_id = v_l.track_id and t.retired_at is null and (t.family_id is null or t.family_id = v_l.family_id)
        and not exists (select 1 from english.skill_leaves lf
                        where lf.map_id = v_map.id and lf.kind = 'tag' and lf.track_id = t.track_id and lf.ref_key = t.key)
        and not (t.group_key is not null
                 and exists (select 1 from english.skill_groups g where g.map_id = v_map.id and g.key = t.group_key))
    )
    select pg_catalog.jsonb_build_object(
      'map_id', v_map.id,
      'track_id', v_l.track_id,
      'assumed', coalesce(v_map.assumed -> v_l.track_id, '{}'::jsonb),
      'domains', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'key', d.key, 'name_vi', d.name_vi, 'scale', d.scale,
            'groups', (
              select coalesce(pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'key', g.key, 'name_vi', g.name_vi, 'desc', g.descriptions,
                  'leaves', (select coalesce(pg_catalog.jsonb_agg(x.leaf order by x.o1, x.o2, x.o3), '[]'::jsonb)
                             from leaves x where x.group_key = g.key))
                order by g.ord), '[]'::jsonb)
              from english.skill_groups g where g.map_id = v_map.id and g.domain_key = d.key))
          order by d.ord)
        from english.skill_domains d where d.map_id = v_map.id),
      'unassigned', (select coalesce(pg_catalog.jsonb_agg(u.leaf order by u.created_at, u.label_vi), '[]'::jsonb) from loose u))
  );
end
$$;

revoke execute on function english.eng_current_skill_map() from public, anon, authenticated, service_role;
revoke execute on function english.eng_add_error_tag_v2(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function english.eng_add_error_tag_v2(uuid, text, text, text, uuid) to service_role;
revoke execute on function english.eng_set_tag_group(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function english.eng_set_tag_group(uuid, text, text, uuid) to service_role;
revoke execute on function english.eng_skill_map(uuid) from public, anon, authenticated;
grant execute on function english.eng_skill_map(uuid) to service_role;
```

Run: `npx vitest run tests/unit/migration0019.test.ts` → PASS (7 tests).

- [ ] **Step 4: Add DB tests** — append inside the top `describe` of `tests/db/skillMap.test.ts`, after section 1:

```ts
  type Added = { key: string; label_vi: string; group_key: string | null; created: boolean };
  type Grouped = { key: string; group_key: string; changed: boolean };
  type Leaf = { kind: string; track_id: string; ref_key: string; label_vi: string; level_from: string | null; level_to: string | null;
    task_from: number | null; task_to: number | null; core: boolean; hidden_in_picker: boolean; related: string[]; custom: boolean; in_set: boolean };
  type MapJson = { map_id: string; track_id: string; assumed: Record<string, string | number>;
    domains: { key: string; name_vi: string; scale: string; groups: { key: string; name_vi: string; desc: Record<string, string | null>; leaves: Leaf[] }[] }[];
    unassigned: Leaf[] };
  const addV2 = (learner: string, label: string, group: string | null, by: string) =>
    svc<Added>("select english.eng_add_error_tag_v2($1, $2, $3, $4, $5) as r", [learner, customTagKey(label), label, group, by]);
  const addV1 = (learner: string, label: string, by: string) =>
    svc<Added>("select english.eng_add_error_tag($1, $2, $3, $4) as r", [learner, customTagKey(label), label, by]);
  const setGroup = (learner: string, key: string, group: string, by: string) =>
    svc<Grouped>("select english.eng_set_tag_group($1, $2, $3, $4) as r", [learner, key, group, by]);
  const mapOf = (learner: string) => svc<MapJson>("select english.eng_skill_map($1) as r", [learner]);
  const leavesOf = (m: MapJson) => m.domains.flatMap((d) => d.groups.flatMap((g) => g.leaves.map((l) => ({ ...l, group: g.key }))));
  let oldKey = "";
  let grouped = "";

  describe("2. a new family tag needs a group of the map (v2); the old function still works", () => {
    it("staff add a tag into a group; the row keeps its group; the same label again returns it", async () => {
      const a = await addV2(NG(), "Đảo ngữ phủ định", "gr-emphasis", M().tutorNguyen);
      expect(a).toMatchObject({ label_vi: "Đảo ngữ phủ định", group_key: "gr-emphasis", created: true });
      expect(a.key).toMatch(/^x-dao-ngu-phu-dinh-[0-9a-f]{5}$/);
      grouped = a.key;
      expect(await q1("select group_key, group_vi, origin from english.error_tags where key = $1", [a.key])).toEqual([{ group_key: "gr-emphasis", group_vi: "Nhãn riêng", origin: "custom" }]);
      expect(await addV2(NG(), " đảo ngữ  phủ định ", "gr-tense", M().parent)).toMatchObject({ key: a.key, group_key: "gr-emphasis", created: false });
    });

    it("a seed label returns the seed tag, whose group stays in the map (never in error_tags)", async () => {
      expect(await addV2(NG(), "Dạng từ", "vo-word-form", M().tutorNguyen)).toEqual({ key: "dang-tu", label_vi: "Dạng từ", group_key: null, created: false });
      await fail(db.client.query("update english.error_tags set group_key = 'vo-word-form' where track_id = 'B' and key = 'dang-tu'"), "23514");
    });

    it("refuses a group outside the map, a missing group, a bad key; the old function still adds an ungrouped tag", async () => {
      await fail(addV2(NG(), "Nhãn lạ", "gr-nope", M().tutorNguyen), "23514", /\(unknown_group\)/);
      await fail(addV2(NG(), "Nhãn lạ", "Ngữ pháp", M().tutorNguyen), "23514", /\(unknown_group\)/);
      await fail(addV2(NG(), "Nhãn lạ", null, M().tutorNguyen), "22004");
      await fail(svc("select english.eng_add_error_tag_v2($1, 'khong-x', 'Nhãn', 'gr-tense', $2) as r", [NG(), M().tutorNguyen]), "22023");
      const old = await addV1(NG(), "Lỗi chính tả thử", M().tutorNguyen);
      expect(old.created).toBe(true);
      oldKey = old.key;
      expect(await q1("select group_key from english.error_tags where key = $1", [oldKey])).toEqual([{ group_key: null }]);
    });

    it("only staff of this child: a student, the other child's tutor and another family are refused", async () => {
      for (const who of [M().studentNguyen, M().tutorAn, parent2Member]) await fail(addV2(NG(), "Không được", "gr-tense", who), "42501");
      await fail(addV2(randomUUID(), "Không có em", "gr-tense", M().tutorNguyen), "P0002");
    });
  });

  describe("3. 'Xếp vào nhóm' for an old family tag", () => {
    it("the parent groups it once; the same group again is a replay; another group is refused; an audit row is written", async () => {
      expect(await setGroup(NG(), oldKey, "wr-sentence-mech", M().parent)).toEqual({ key: oldKey, group_key: "wr-sentence-mech", changed: true });
      expect(await setGroup(NG(), oldKey, "wr-sentence-mech", M().tutorNguyen)).toEqual({ key: oldKey, group_key: "wr-sentence-mech", changed: false });
      await fail(setGroup(NG(), oldKey, "wr-genre", M().tutorNguyen), "23514", /\(already_grouped\)/);
      const log = await q1<{ payload: Record<string, unknown> }>("select payload from english.audit_log where action = 'error_tag.grouped' order by id desc limit 1");
      expect(log[0]?.payload).toEqual({ tag_key: oldKey, group_key: "wr-sentence-mech", map_id: "SM-1" });
    });

    it("a seed tag, another family's tag and an unknown key look the same: not found", async () => {
      const other = await addV1(learner2, "Nhãn nhà khác", parent2Member);
      await fail(setGroup(NG(), "dang-tu", "gr-tense", M().tutorNguyen), "P0002");
      await fail(setGroup(NG(), other.key, "gr-tense", M().tutorNguyen), "P0002");
      await fail(setGroup(NG(), "x-khong-co-abcde", "gr-tense", M().tutorNguyen), "P0002");
    });

    it("refuses an unknown group, and anyone who is not staff of this child", async () => {
      const t = await addV1(NG(), "Nhãn chưa xếp hai", M().tutorNguyen);
      await fail(setGroup(NG(), t.key, "gr-nope", M().tutorNguyen), "23514", /\(unknown_group\)/);
      for (const who of [M().studentNguyen, M().tutorAn, parent2Member]) await fail(setGroup(NG(), t.key, "gr-tense", who), "42501");
    });
  });

  describe("4. eng_skill_map", () => {
    it("Nguyên (B): 7 domains, 40 groups, the 24 B tags + the family's grouped tags, all 70 skills with the 12 of B-v1 flagged", async () => {
      const m = await mapOf(NG());
      expect([m.map_id, m.track_id]).toEqual(["SM-1", "B"]);
      expect(m.assumed).toEqual({ grammar: "B2", vocab: "B2", reading: "B2", listening: "B2", writing: "B2", speaking: "B2", thinking: 2 });
      expect(m.domains.map((d) => d.key)).toEqual(["grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking"]);
      expect(m.domains.flatMap((d) => d.groups)).toHaveLength(40);
      const all = leavesOf(m);
      const tags = all.filter((l) => l.kind === "tag");
      expect(tags.filter((l) => !l.custom)).toHaveLength(24);
      expect(tags.every((l) => l.track_id === m.track_id)).toBe(true);
      expect(tags.filter((l) => l.custom).map((l) => [l.ref_key, l.group]).sort()).toEqual([[grouped, "gr-emphasis"], [oldKey, "wr-sentence-mech"]].sort());
      const targets = all.filter((l) => l.kind === "target");
      expect(targets).toHaveLength(70);
      expect(targets.filter((l) => l.in_set).map((l) => l.ref_key).sort()).toEqual([
        "B-L1-COMPLEX-W", "B-L1-TRANSFORM-W", "B-L2-CLOZE", "B-L2-PRECISE", "B-L4-EXPLAIN-S", "B-T11-QUALIFY", "B-T1-ARG-R", "B-T1-EXAM-R",
        "B-T2-ASSUME-R", "B-T5-DATAOP", "B-T5-SOURCE", "B-T7-ARGUE",
      ].sort());
      expect(all.find((l) => l.ref_key === "B-L1-TRANSFORM-W")).toMatchObject({ label_vi: "Viết lại câu giữ nguyên nghĩa", level_from: "B1", level_to: "B2", group: "gr-transform" });
      expect(all.find((l) => l.ref_key === "doc-fact-opinion")).toMatchObject({ related: ["B-T5-DATAOP"], group: "re-structure", custom: false });
      // inside a group: seed tags, then family tags, then skills of the set, then the other skills
      const conditional = m.domains[0]!.groups.find((g) => g.key === "gr-conditional")!.leaves.map((l) => l.ref_key);
      expect(conditional).toEqual(["cau-dieu-kien-dao-ngu", "wish-would-rather", "B-L1-HYPO-W"]);
      // the still-ungrouped tag of the family is the only thing in "Chưa xếp mảng"
      expect(m.unassigned.map((l) => [l.ref_key, l.custom])).toEqual([[expect.stringMatching(/^x-nhan-chua-xep-hai-/), true]]);
    });

    it("An (A): 16 tags incl. the hidden 'Đọc hiểu (KET Reading)', the 12 skills of A-v1 flagged, no family tag of track B", async () => {
      const m = await mapOf(AN());
      expect(m.assumed).toEqual({ grammar: "A2", vocab: "A2", reading: "A2", listening: "A2", writing: "A2", speaking: "A2", thinking: 1 });
      const all = leavesOf(m);
      expect(all.filter((l) => l.kind === "tag")).toHaveLength(16);
      expect(all.filter((l) => l.hidden_in_picker).map((l) => [l.ref_key, l.label_vi, l.group])).toEqual([["doc-hieu", "Đọc hiểu (KET Reading)", "re-gist-detail"]]);
      expect(all.filter((l) => l.in_set)).toHaveLength(12);
      expect(all.some((l) => l.custom)).toBe(false);
      expect(m.unassigned).toEqual([]);
    });

    it("another family sees its own tags only; an unknown learner is not found", async () => {
      const m = await mapOf(learner2);
      expect(m.unassigned.map((l) => l.label_vi)).toEqual(["Nhãn nhà khác"]);
      expect(leavesOf(m).some((l) => l.custom)).toBe(false);
      expect(leavesOf(m).filter((l) => l.in_set)).toHaveLength(0); // no target set assigned
      await fail(mapOf(randomUUID()), "P0002");
    });

    it("the three functions are closed to everyone but service_role; the internal helper to everyone", async () => {
      const acl = await q1<{ proname: string; anon: boolean; auth: boolean; svc: boolean }>(`
        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
               has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'english' and p.proname in ('eng_add_error_tag_v2', 'eng_set_tag_group', 'eng_skill_map', 'eng_current_skill_map')
        order by p.proname`);
      expect(acl.map((a) => [a.proname, a.anon, a.auth, a.svc])).toEqual([
        ["eng_add_error_tag_v2", false, false, true],
        ["eng_current_skill_map", false, false, false],
        ["eng_set_tag_group", false, false, true],
        ["eng_skill_map", false, false, true],
      ]);
    });
  });
```

- [ ] **Step 5: Run** — `npm run test:db -- tests/db/skillMap.test.ts tests/db/tutorWork.test.ts tests/db/migrations.test.ts` → PASS (the 0014 tests of `eng_add_error_tag` still pass unchanged: expand). Then `npm run lint` → clean.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0019_skill_map.sql tests/unit/migration0019.test.ts tests/db/skillMap.test.ts
git commit -m "feat(sm-1): migration 0019 part 2 - family tags with a group (v2 + set group) and eng_skill_map"
```

---

### Task 4: `lib/skillmap` — shape, loader, pure grouping

**Files:**
- Create: `lib/skillmap/shape.ts`, `lib/skillmap/load.ts`, `lib/skillmap/group.ts`, `tests/unit/fixtures/skillMap.ts`
- Modify: `lib/copy/vi.ts` (new `skillMapCopy`, needed by `group.ts` for the "Chưa xếp mảng" name), `lib/tutorwork/types.ts` (`TagInfo.groupKey?`)
- Test: `tests/unit/skillMap.test.ts`

**Interfaces:**
- Consumes: types of Task 1; `eng_skill_map` jsonb of Task 3; `TagInfo`, `WeakPoint` from `lib/tutorwork/types.ts`.
- Produces:
  - `TagInfo` gains `groupKey?: string | null` (family tags: their group; seed tags: absent/null — their group comes from the map).
  - `parseSkillMap(raw: unknown): SkillMapView`
  - `loadSkillMap(learnerId: string): Promise<SkillMapView>` (server only)
  - `type GroupPlace = { domainKey: DomainKey; domainName: string; groupKey: string; groupName: string; hidden: boolean }`
  - `type Bucket<T> = { key: BucketKey; name: string; total: number; groups: { key: string; name: string; items: T[] }[] }`
  - `type WeakTile = { key: BucketKey; name: string; weakCount: number; worst: WeakPoint | null; points: WeakPoint[] }`
  - `placeOfGroup(map, groupKey: string): GroupPlace | null`; `placeOfTag(map, tag: { key: string; groupKey?: string | null }): GroupPlace | null`; `placeOfTarget(map, id: string): GroupPlace | null`; `domainOfGroup(map, groupKey: string): DomainKey | null`
  - `groupTags(map, tags: TagInfo[], opts?: { keep?: string[] }): Bucket<TagInfo>[]` — always the 7 domains in map order (groups without items dropped, empty domains kept), then a `"unassigned"` bucket only when something has no group; hidden leaves are dropped unless their key is in `keep`.
  - `groupTargets<T extends { id: string }>(map, items: T[]): Bucket<T>[]`
  - `groupWeakPoints(map, points: WeakPoint[]): WeakTile[]` — 7 tiles (+ `"unassigned"` when needed); `weakCount` = points whose status is not `ok`; `worst` = first such point in the given order (eng_weak_points already sorts worst first); hidden leaves are counted.
  - `firstTab<T>(buckets: Bucket<T>[], prefer?: (item: T) => boolean): BucketKey` — the bucket of the first preferred item, else the first non-empty bucket, else the first bucket.
  - `fixtureMap(): SkillMapView` (tests only).
  - `skillMapCopy` (see Step 3).

- [ ] **Step 1: Write the test fixture** — `tests/unit/fixtures/skillMap.ts` (a small Track B map with every domain; not a copy of SM-1)

```ts
import type { SkillLeaf, SkillMapView } from "@/lib/skillmap/types";

const leaf = (kind: SkillLeaf["kind"], refKey: string, over: Partial<SkillLeaf> = {}): SkillLeaf => ({
  kind, trackId: "B", refKey, label: refKey, levelFrom: null, levelTo: null, taskFrom: null, taskTo: null,
  core: false, hiddenInPicker: false, related: [], custom: false, inSet: false, ...over,
});
const g = (key: string, name: string, leaves: SkillLeaf[] = []) => ({ key, name, descriptions: {}, leaves });

/** Small map for UI and grouping tests: every domain present, a hidden leaf, a family tag with a group, one without. */
export function fixtureMap(): SkillMapView {
  return {
    mapId: "SM-1",
    trackId: "B",
    assumed: { grammar: "B2", vocab: "B2", reading: "B2", listening: "B2", writing: "B2", speaking: "B2", thinking: 2 },
    domains: [
      { key: "grammar", name: "Ngữ pháp", scale: "cefr", groups: [
        g("gr-conditional", "Câu điều kiện & giả định", [leaf("tag", "cau-dieu-kien-dao-ngu")]),
        g("gr-emphasis", "Nhấn mạnh & đảo ngữ", [leaf("tag", "x-dao-ngu-phu-dinh-ab12c", { custom: true, label: "Đảo ngữ phủ định" })]),
        g("gr-transform", "Tổng hợp & biến đổi câu", [leaf("target", "B-L1-TRANSFORM-W", { inSet: true })]),
      ] },
      { key: "vocab", name: "Từ vựng", scale: "cefr", groups: [
        g("vo-word-form", "Dạng từ", [leaf("tag", "dang-tu")]),
        g("vo-colloc-idiom", "Kết hợp từ, cụm động từ, thành ngữ", [leaf("tag", "cum-dong-tu"), leaf("tag", "thanh-ngu")]),
      ] },
      { key: "reading", name: "Đọc", scale: "cefr", groups: [
        g("re-gist-detail", "Ý chính & chi tiết", [leaf("tag", "doc-main-idea"), leaf("tag", "doc-hieu", { hiddenInPicker: true })]),
      ] },
      { key: "listening", name: "Nghe", scale: "cefr", groups: [g("li-sound", "Âm & giọng")] },
      { key: "writing", name: "Viết", scale: "cefr", groups: [g("wr-cohesion", "Liên kết & mạch lạc", [leaf("tag", "tu-noi-lap-luan")])] },
      { key: "speaking", name: "Nói", scale: "cefr", groups: [g("sp-pron", "Phát âm & ngữ điệu", [leaf("tag", "phat-am")])] },
      { key: "thinking", name: "Tư duy & tự học", scale: "task_level", groups: [
        g("th-argue", "Lập luận & kết luận", [leaf("target", "B-T7-ARGUE", { inSet: true })]),
      ] },
    ],
    unassigned: [leaf("tag", "x-dao-ngu-hardly", { custom: true, label: "Đảo ngữ với hardly" })],
  };
}
```

- [ ] **Step 2: Write the failing test** — `tests/unit/skillMap.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { skillMapCopy } from "@/lib/copy/vi";
import { domainOfGroup, firstTab, groupTags, groupTargets, groupWeakPoints, placeOfTag } from "@/lib/skillmap/group";
import { parseSkillMap } from "@/lib/skillmap/shape";
import type { TagInfo, WeakPoint } from "@/lib/tutorwork/types";
import { fixtureMap } from "./fixtures/skillMap";

const tag = (key: string, over: Partial<TagInfo> = {}): TagInfo => ({ key, label: key, group: null, custom: false, ...over });
const weak = (tagKey: string, status: WeakPoint["status"], sources = 1): WeakPoint => ({
  tagKey, label: tagKey, group: null, sources, bySource: { test: sources, lesson: 0, writing: 0, practice: 0 }, itemsWrong: { test: 0, practice: 0 },
  asked: 0, askedWrong: 0, lastSeen: "2026-10-20", recheckDueOn: null, recheckDue: false, lastRecheck: null, status, events: [],
});
const map = fixtureMap();

describe("groupTags", () => {
  const tags = [
    tag("dang-tu"), tag("cum-dong-tu"), tag("cau-dieu-kien-dao-ngu"), tag("doc-hieu"), tag("doc-main-idea"),
    tag("x-dao-ngu-hardly", { custom: true }), // family tag from before SM-1: no group
    tag("x-moi-abcde", { custom: true, groupKey: "gr-emphasis" }), // just added through v2 (not in the map yet)
    tag("khong-co-trong-ban-do"), // seed tag the map does not know
  ];

  it("always 7 domains in map order, empty ones kept, groups in map order, then 'Chưa xếp mảng'", () => {
    const b = groupTags(map, tags);
    expect(b.map((x) => x.key)).toEqual(["grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking", "unassigned"]);
    expect(b[0]?.groups.map((g) => [g.key, g.items.map((t) => t.key)])).toEqual([
      ["gr-conditional", ["cau-dieu-kien-dao-ngu"]],
      ["gr-emphasis", ["x-moi-abcde"]],
    ]);
    expect(b[1]?.groups.map((g) => g.name)).toEqual(["Dạng từ", "Kết hợp từ, cụm động từ, thành ngữ"]);
    expect(b[3]).toEqual({ key: "listening", name: "Nghe", total: 0, groups: [] });
    expect(b[7]).toMatchObject({ name: skillMapCopy.unassigned, total: 2 });
    expect(b[7]?.groups[0]?.items.map((t) => t.key)).toEqual(["x-dao-ngu-hardly", "khong-co-trong-ban-do"]);
  });

  it("drops a leaf hidden from the picker unless it is kept (already chosen or saved)", () => {
    expect(groupTags(map, tags)[2]?.groups[0]?.items.map((t) => t.key)).toEqual(["doc-main-idea"]);
    expect(groupTags(map, tags, { keep: ["doc-hieu"] })[2]?.groups[0]?.items.map((t) => t.key)).toEqual(["doc-hieu", "doc-main-idea"]); // input order
  });

  it("has no 'Chưa xếp mảng' bucket when everything has a group", () => {
    expect(groupTags(map, [tag("dang-tu")]).map((x) => x.key)).not.toContain("unassigned");
  });
});

describe("groupTargets, placeOfTag, domainOfGroup, firstTab", () => {
  it("places skills by the map; an id the map does not know goes to 'Chưa xếp mảng'", () => {
    const b = groupTargets(map, [{ id: "B-T7-ARGUE", title: "Lập luận" }, { id: "B-L1-TRANSFORM-W", title: "Viết lại câu" }, { id: "B-W-1", title: "?" }]);
    expect(b.find((x) => x.key === "thinking")?.total).toBe(1);
    expect(b.find((x) => x.key === "grammar")?.groups[0]?.items[0]?.id).toBe("B-L1-TRANSFORM-W");
    expect(b.find((x) => x.key === "unassigned")?.groups[0]?.items.map((x) => x.id)).toEqual(["B-W-1"]);
  });

  it("a family tag's own group wins; a seed tag uses its leaf; unknown → null", () => {
    expect(placeOfTag(map, { key: "x-new", groupKey: "sp-pron" })).toMatchObject({ domainKey: "speaking", groupKey: "sp-pron", hidden: false });
    expect(placeOfTag(map, { key: "doc-hieu" })).toMatchObject({ domainKey: "reading", groupName: "Ý chính & chi tiết", hidden: true });
    expect(placeOfTag(map, { key: "x-dao-ngu-hardly", groupKey: null })).toBeNull();
    expect(domainOfGroup(map, "vo-word-form")).toBe("vocab");
    expect(domainOfGroup(map, "gr-nope")).toBeNull();
  });

  it("firstTab: the tab of the first preferred item, else the first non-empty tab, else the first", () => {
    const b = groupTags(map, [tag("phat-am"), tag("dang-tu")]);
    expect(firstTab(b)).toBe("vocab");
    expect(firstTab(b, (t) => t.key === "phat-am")).toBe("speaking");
    expect(firstTab(groupTags(map, []))).toBe("grammar");
  });
});

describe("groupWeakPoints", () => {
  it("7 tiles: count of points that need attention, the worst one first, hidden leaves counted; unknown tags in 'Chưa xếp mảng'", () => {
    const tiles = groupWeakPoints(map, [weak("dang-tu", "repeat", 3), weak("cum-dong-tu", "watch"), weak("thanh-ngu", "ok"), weak("doc-hieu", "watch"), weak("x-la", "watch")]);
    expect(tiles.map((t) => [t.key, t.weakCount, t.worst?.tagKey ?? null])).toEqual([
      ["grammar", 0, null], ["vocab", 2, "dang-tu"], ["reading", 1, "doc-hieu"], ["listening", 0, null],
      ["writing", 0, null], ["speaking", 0, null], ["thinking", 0, null], ["unassigned", 1, "x-la"],
    ]);
    expect(tiles[1]?.points.map((p) => p.tagKey)).toEqual(["dang-tu", "cum-dong-tu", "thanh-ngu"]);
    expect(groupWeakPoints(map, []).map((t) => t.key)).not.toContain("unassigned");
  });
});

describe("parseSkillMap", () => {
  const rawLeaf = { kind: "tag", track_id: "B", ref_key: "dang-tu", label_vi: "Dạng từ", level_from: "B1", level_to: "B2", task_from: null, task_to: null,
    core: false, hidden_in_picker: false, related: [], custom: false, in_set: false };
  const raw = { map_id: "SM-1", track_id: "B", assumed: { grammar: "B2", thinking: 2 },
    domains: [{ key: "vocab", name_vi: "Từ vựng", scale: "cefr", groups: [{ key: "vo-word-form", name_vi: "Dạng từ", desc: { "A1-A2": "-er, -ful", B1: "un-, dis-" }, leaves: [rawLeaf] }] }],
    unassigned: [] };

  it("maps snake_case to the view", () => {
    expect(parseSkillMap(raw)).toEqual({
      mapId: "SM-1", trackId: "B", assumed: { grammar: "B2", thinking: 2 }, unassigned: [],
      domains: [{ key: "vocab", name: "Từ vựng", scale: "cefr", groups: [{ key: "vo-word-form", name: "Dạng từ", descriptions: { "A1-A2": "-er, -ful", B1: "un-, dis-" },
        leaves: [{ kind: "tag", trackId: "B", refKey: "dang-tu", label: "Dạng từ", levelFrom: "B1", levelTo: "B2", taskFrom: null, taskTo: null,
          core: false, hiddenInPicker: false, related: [], custom: false, inSet: false }] }] }],
    });
  });

  it("throws on an unknown domain or level instead of showing a half-right picker", () => {
    expect(() => parseSkillMap({ ...raw, domains: [{ ...raw.domains[0], key: "maths" }] })).toThrow();
    expect(() => parseSkillMap({ ...raw, domains: [{ ...raw.domains[0], groups: [{ ...raw.domains[0]!.groups[0], leaves: [{ ...rawLeaf, level_from: "D1" }] }] }] })).toThrow();
  });
});
```

- [ ] **Step 3: Run it** — `npx vitest run tests/unit/skillMap.test.ts` → FAIL (modules missing).

- [ ] **Step 4: Add the copy** — in `lib/copy/vi.ts`, right after `tagPicker`:

```ts
/** SM-1: bản đồ kỹ năng trong ô chọn nhãn / kỹ năng (gia sư, phụ huynh). Tên mảng và nhóm đến từ bản đồ (cơ sở dữ liệu). */
export const skillMapCopy = {
  tabsLabel: "Mảng kỹ năng",
  unassigned: "Chưa xếp mảng",
  unassignedHelp: "Nhãn riêng thêm trước khi có bản đồ kỹ năng. Bấm “Xếp vào nhóm” để đặt vào đúng mảng.",
  emptyDomain: "Chưa có mục nào ở mảng này.",
  search: "Tìm trong mọi mảng",
  searchPlaceholder: "Gõ để tìm…",
  noMatch: "Không có mục nào khớp.",
  place: (domain: string, group: string) => `${domain} · ${group}`,
  chosen: (labels: string) => `Đang chọn: ${labels}`,
  domainLabel: "Mảng",
  groupLabel: "Nhóm",
  pickDomain: "— Chọn mảng —",
  pickGroup: "— Chọn nhóm —",
  groupRequired: "Chọn mảng và nhóm cho nhãn mới.",
  setGroup: "Xếp vào nhóm",
  setGroupSave: "Lưu nhóm",
} as const;
```

In `lib/tutorwork/types.ts`, change `TagInfo` to:

```ts
export type TagInfo = {
  key: string;
  label: string;
  group: string | null;
  custom: boolean;
  /** Family tags only: the skill-map group chosen when it was added (SM-1). Seed tags take their group from the map. */
  groupKey?: string | null;
};
```

- [ ] **Step 5: Implement `lib/skillmap/shape.ts`**

```ts
/** Parse the jsonb of english.eng_skill_map (migration 0019). zod strips unknown keys; anything unexpected throws (→ 500, logged). */
import { z } from "zod";
import { CEFR_LEVELS, DOMAIN_KEYS, type SkillLeaf, type SkillMapView } from "./types";

const leafRow = z.object({
  kind: z.enum(["tag", "target"]),
  track_id: z.string(),
  ref_key: z.string(),
  label_vi: z.string(),
  level_from: z.enum(CEFR_LEVELS).nullable(),
  level_to: z.enum(CEFR_LEVELS).nullable(),
  task_from: z.number().int().nullable(),
  task_to: z.number().int().nullable(),
  core: z.boolean(),
  hidden_in_picker: z.boolean(),
  related: z.array(z.string()),
  custom: z.boolean(),
  in_set: z.boolean(),
});
const mapRow = z.object({
  map_id: z.string(),
  track_id: z.string(),
  assumed: z.record(z.string(), z.union([z.string(), z.number()])),
  domains: z.array(
    z.object({
      key: z.enum(DOMAIN_KEYS),
      name_vi: z.string(),
      scale: z.enum(["cefr", "task_level"]),
      groups: z.array(z.object({ key: z.string(), name_vi: z.string(), desc: z.record(z.string(), z.string().nullable()), leaves: z.array(leafRow) })),
    }),
  ),
  unassigned: z.array(leafRow),
});

const toLeaf = (l: z.infer<typeof leafRow>): SkillLeaf => ({
  kind: l.kind, trackId: l.track_id, refKey: l.ref_key, label: l.label_vi, levelFrom: l.level_from, levelTo: l.level_to,
  taskFrom: l.task_from, taskTo: l.task_to, core: l.core, hiddenInPicker: l.hidden_in_picker, related: l.related, custom: l.custom, inSet: l.in_set,
});

export function parseSkillMap(raw: unknown): SkillMapView {
  const m = mapRow.parse(raw);
  return {
    mapId: m.map_id,
    trackId: m.track_id,
    assumed: m.assumed,
    domains: m.domains.map((d) => ({
      key: d.key,
      name: d.name_vi,
      scale: d.scale,
      groups: d.groups.map((g) => ({ key: g.key, name: g.name_vi, descriptions: g.desc, leaves: g.leaves.map(toLeaf) })),
    })),
    unassigned: m.unassigned.map(toLeaf),
  };
}
```

- [ ] **Step 6: Implement `lib/skillmap/load.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSkillMap } from "./shape";
import type { SkillMapView } from "./types";

/** The published skill map as one learner sees it (eng_skill_map, service role). Call only after requireLearnerPage / requireAccess. */
export async function loadSkillMap(learnerId: string): Promise<SkillMapView> {
  const { data, error } = await createAdminClient().rpc("eng_skill_map", { p_learner: learnerId });
  if (error) throw new Error(`eng_skill_map failed: ${error.code ?? error.message ?? "error"}`);
  return parseSkillMap(data);
}
```

- [ ] **Step 7: Implement `lib/skillmap/group.ts`**

```ts
/**
 * Pure grouping of picker items and weak points by the skill map (no React, no database): used by the pickers (client) and the
 * weak-points page (server). Spec 2026-10-21 §5 (SM-1 rows).
 */
import { skillMapCopy } from "@/lib/copy/vi";
import type { TagInfo, WeakPoint } from "@/lib/tutorwork/types";
import { UNASSIGNED, type BucketKey, type DomainKey, type SkillMapView } from "./types";

export type GroupPlace = { domainKey: DomainKey; domainName: string; groupKey: string; groupName: string; hidden: boolean };
export type Bucket<T> = { key: BucketKey; name: string; total: number; groups: { key: string; name: string; items: T[] }[] };
export type WeakTile = { key: BucketKey; name: string; weakCount: number; worst: WeakPoint | null; points: WeakPoint[] };

type Index = { groups: Map<string, GroupPlace>; tags: Map<string, GroupPlace>; targets: Map<string, GroupPlace> };
const cache = new WeakMap<SkillMapView, Index>();

function index(map: SkillMapView): Index {
  const hit = cache.get(map);
  if (hit) return hit;
  const out: Index = { groups: new Map(), tags: new Map(), targets: new Map() };
  for (const d of map.domains)
    for (const g of d.groups) {
      const base = { domainKey: d.key, domainName: d.name, groupKey: g.key, groupName: g.name };
      out.groups.set(g.key, { ...base, hidden: false });
      for (const l of g.leaves) (l.kind === "tag" ? out.tags : out.targets).set(l.refKey, { ...base, hidden: l.hiddenInPicker });
    }
  cache.set(map, out);
  return out;
}

export function placeOfGroup(map: SkillMapView, groupKey: string): GroupPlace | null {
  return index(map).groups.get(groupKey) ?? null;
}

/** A family tag's own group wins (it may have been added after the page loaded); a seed tag uses its leaf of the learner's track. */
export function placeOfTag(map: SkillMapView, tag: { key: string; groupKey?: string | null }): GroupPlace | null {
  if (tag.groupKey) return placeOfGroup(map, tag.groupKey);
  return index(map).tags.get(tag.key) ?? null;
}

export function placeOfTarget(map: SkillMapView, id: string): GroupPlace | null {
  return index(map).targets.get(id) ?? null;
}

export function domainOfGroup(map: SkillMapView, groupKey: string): DomainKey | null {
  return placeOfGroup(map, groupKey)?.domainKey ?? null;
}

function bucketize<T>(map: SkillMapView, items: T[], placeOf: (item: T) => GroupPlace | null, keep: (item: T) => boolean): Bucket<T>[] {
  const domains = map.domains.map((d) => ({ key: d.key as BucketKey, name: d.name, total: 0, groups: d.groups.map((g) => ({ key: g.key, name: g.name, items: [] as T[] })) }));
  const loose: T[] = [];
  for (const item of items) {
    const p = placeOf(item);
    if (!p) {
      loose.push(item);
      continue;
    }
    if (p.hidden && !keep(item)) continue;
    const d = domains.find((x) => x.key === p.domainKey);
    const g = d?.groups.find((x) => x.key === p.groupKey);
    if (!d || !g) {
      loose.push(item);
      continue;
    }
    g.items.push(item);
    d.total += 1;
  }
  const out: Bucket<T>[] = domains.map((d) => ({ ...d, groups: d.groups.filter((g) => g.items.length > 0) }));
  if (loose.length > 0) out.push({ key: UNASSIGNED, name: skillMapCopy.unassigned, total: loose.length, groups: [{ key: UNASSIGNED, name: skillMapCopy.unassigned, items: loose }] });
  return out;
}

export function groupTags(map: SkillMapView, tags: TagInfo[], opts: { keep?: string[] } = {}): Bucket<TagInfo>[] {
  const keep = new Set(opts.keep ?? []);
  return bucketize(map, tags, (t) => placeOfTag(map, t), (t) => keep.has(t.key));
}

export function groupTargets<T extends { id: string }>(map: SkillMapView, items: T[]): Bucket<T>[] {
  return bucketize(map, items, (t) => placeOfTarget(map, t.id), () => true);
}

export function groupWeakPoints(map: SkillMapView, points: WeakPoint[]): WeakTile[] {
  return bucketize(map, points, (p) => placeOfTag(map, { key: p.tagKey }), () => true).map((b) => {
    const all = b.groups.flatMap((g) => g.items);
    // keep the order of eng_weak_points (worst first), not the group order
    const ordered = points.filter((p) => all.includes(p));
    const weak = ordered.filter((p) => p.status !== "ok");
    return { key: b.key, name: b.name, weakCount: weak.length, worst: weak[0] ?? null, points: ordered };
  });
}

export function firstTab<T>(buckets: Bucket<T>[], prefer?: (item: T) => boolean): BucketKey {
  if (prefer) {
    const hit = buckets.find((b) => b.groups.some((g) => g.items.some(prefer)));
    if (hit) return hit.key;
  }
  return (buckets.find((b) => b.total > 0) ?? buckets[0])?.key ?? "grammar";
}
```

(Weak points of family tags reach `placeOfTag` without a `groupKey`: the map already lists grouped family tags as leaves, so the leaf index finds them.)

- [ ] **Step 8: Run** — `npx vitest run tests/unit/skillMap.test.ts` → PASS; `npm run typecheck` → clean.

- [ ] **Step 9: Commit**

```bash
git add lib/skillmap/shape.ts lib/skillmap/load.ts lib/skillmap/group.ts lib/copy/vi.ts lib/tutorwork/types.ts tests/unit/skillMap.test.ts tests/unit/fixtures/skillMap.ts
git commit -m "feat(sm-1): lib/skillmap - parse and load eng_skill_map, group tags, skills and weak points by domain"
```

---

### Task 5: API — new family tag needs a group (v2), "Xếp vào nhóm" route, tags carry their group

**Files:**
- Modify: `lib/tutorwork/schemas.ts`, `lib/tutorwork/handlers.ts`, `lib/tutorwork/supabaseStore.ts`, `lib/tutorwork/shape.ts` (`parseTags`), `lib/tutorwork/load.ts` (`loadTags`), `lib/tutorwork/client.ts` (`failText`), `lib/copy/vi.ts` (`tutorWorkErrors`)
- Create: `app/api/learners/[id]/tags/group/route.ts`
- Test: `tests/unit/tutorWork.test.ts`

**Interfaces:**
- Consumes: `GROUP_KEY_RE` (Task 1); SQL `eng_add_error_tag_v2`, `eng_set_tag_group` (Task 3).
- Produces:
  - `addTagBodySchema = strictObject({ label: string 2..120, group_key: GROUP_KEY_RE })`
  - `setTagGroupBodySchema = strictObject({ tag_key: /^x-[a-z0-9][a-z0-9-]{0,60}$/, group_key: GROUP_KEY_RE })`
  - `TutorWorkStore.addTag(args: { learnerId: string; key: string; label: string; groupKey: string; byMemberId: string }): Promise<unknown>` (now calls `eng_add_error_tag_v2`)
  - `TutorWorkStore.setTagGroup(args: { learnerId: string; tagKey: string; groupKey: string; byMemberId: string }): Promise<unknown>`
  - `handleAddTag(deps, learnerId, body)` → 201/200 `{ key, label, group_key: string | null, created }`; 400 `invalid_body` / `unknown_group`.
  - `handleSetTagGroup(deps: TutorWorkDeps, learnerId: string, body: unknown): Promise<HandlerResult>` → 200 `{ key, group_key, changed }`; 400 `invalid_body` / `unknown_group`; 409 `already_grouped`; 404 not found / outside scope; 401; 403 student.
  - `POST /api/learners/:id/tags` body `{ label, group_key }`; `POST /api/learners/:id/tags/group` body `{ tag_key, group_key }`.
  - `loadTags(trackId)` rows now include `groupKey` (`string | null`).
  - `tutorWorkErrors.unknownGroup`, `tutorWorkErrors.alreadyGrouped`; `failText` maps `unknown_group` / `already_grouped`.

(Between this commit and Task 7 the old picker still posts `{ label }` only and gets 400: the branch is not deployed in between.)

- [ ] **Step 1: Update the failing tests** in `tests/unit/tutorWork.test.ts`

1. Imports: add `handleSetTagGroup` to the `@/lib/tutorwork/handlers` import; add `import { failText } from "@/lib/tutorwork/client";` and `import { tutorWorkErrors } from "@/lib/copy/vi";`; add `parseTags` to the `@/lib/tutorwork/shape` import.
2. In `makeStore`, replace the `addTag` line and add `setTagGroup`:

```ts
    addTag: vi.fn(async (a: { key: string; label: string; groupKey: string }) => ({ key: a.key, label_vi: a.label, group_key: a.groupKey, created: true })),
    setTagGroup: vi.fn(async (a: { tagKey: string; groupKey: string }) => ({ key: a.tagKey, group_key: a.groupKey, changed: true })),
```

3. In `describe("S5b-1 handlers: 401 / 404 / 403 come before anything else")`, replace the `all` and `writes` helpers and the three `Array(5)` with `Array(6)`:

```ts
  const all = (d: TutorWorkDeps) => [
    () => handleRecordResult(d, AN, goodQuick),
    () => handleTagResultItems(d, RESULT_AN, { items: [{ n: 4, tag_key: "dang-tu" }] }),
    () => handleAddTag(d, AN, { label: "Đảo ngữ", group_key: "gr-emphasis" }),
    () => handleTagEpisode(d, EPISODE_AN, { tags: ["dang-tu"] }),
    () => handleWriteSessionNote(d, AN, goodNote),
    () => handleSetTagGroup(d, AN, { tag_key: "x-cu-abcde", group_key: "wr-genre" }),
  ];
  const writes = (s: ReturnType<typeof makeStore>) => [s.recordResult, s.tagResultItems, s.addTag, s.tagEpisode, s.writeSessionNote, s.setTagGroup];
```

4. Replace the test `"'+ nhãn khác': the key is made on the server from the label; a label with no letters is refused"` with:

```ts
  it("'+ nhãn khác': the key is made on the server from the label, and a group of the skill map is required", async () => {
    const s = makeStore();
    const r = await handleAddTag(deps("tutorAn", s), AN, { label: "Đảo ngữ với hardly", group_key: "gr-emphasis" });
    expect(r).toEqual({ status: 201, body: { key: "x-dao-ngu-voi-hardly", label: "Đảo ngữ với hardly", group_key: "gr-emphasis", created: true } });
    expect(s.addTag).toHaveBeenCalledWith({ learnerId: AN, key: "x-dao-ngu-voi-hardly", label: "Đảo ngữ với hardly", groupKey: "gr-emphasis", byMemberId: "m-tutorAn" });
    expect((await handleAddTag(deps("tutorAn", s), AN, { label: "?!?!", group_key: "gr-emphasis" })).status).toBe(400);
    expect((await handleAddTag(deps("tutorAn", s), AN, { label: "Đảo ngữ" })).status).toBe(400); // no group
    expect((await handleAddTag(deps("tutorAn", s), AN, { label: "Đảo ngữ", group_key: "Ngữ pháp" })).status).toBe(400); // not a group key
    expect((await handleAddTag(deps("tutorAn", s), AN, { label: "x", key: "x-evil", group_key: "gr-emphasis" })).status).toBe(400);
    const existing = makeStore({ addTag: vi.fn(async () => ({ key: "dang-tu", label_vi: "Dạng từ", group_key: null, created: false })) });
    expect(await handleAddTag(deps("tutorAn", existing), AN, { label: "Dạng từ", group_key: "vo-word-form" })).toEqual({
      status: 200, body: { key: "dang-tu", label: "Dạng từ", group_key: null, created: false },
    });
    const unknown = makeStore({ addTag: vi.fn(async () => { throw new ReviewDbError("23514", "eng_add_error_tag_v2: x (unknown_group)"); }) });
    expect(await handleAddTag(deps("tutorAn", unknown), AN, { label: "Mới", group_key: "gr-nope" })).toMatchObject({ status: 400, body: { error: "unknown_group" } });
  });

  it("'Xếp vào nhóm': staff of the child group an old family tag; database answers are mapped", async () => {
    const s = makeStore();
    expect(await handleSetTagGroup(deps("parent", s), AN, { tag_key: "x-cu-abcde", group_key: "wr-sentence-mech" })).toEqual({
      status: 200, body: { key: "x-cu-abcde", group_key: "wr-sentence-mech", changed: true },
    });
    expect(s.setTagGroup).toHaveBeenCalledWith({ learnerId: AN, tagKey: "x-cu-abcde", groupKey: "wr-sentence-mech", byMemberId: "m-parent" });
    expect((await handleSetTagGroup(deps("tutorAn", s), AN, { tag_key: "x-cu-abcde" })).status).toBe(400);
    expect((await handleSetTagGroup(deps("tutorAn", s), AN, { tag_key: "dang-tu", group_key: "gr-tense" })).status).toBe(400); // seed tags are grouped by the map
    const grouped = makeStore({ setTagGroup: vi.fn(async () => { throw new ReviewDbError("23514", "eng_set_tag_group: x (already_grouped)"); }) });
    expect(await handleSetTagGroup(deps("tutorAn", grouped), AN, { tag_key: "x-cu-abcde", group_key: "wr-genre" })).toMatchObject({ status: 409, body: { error: "already_grouped" } });
    const unknown = makeStore({ setTagGroup: vi.fn(async () => { throw new ReviewDbError("23514", "eng_set_tag_group: x (unknown_group)"); }) });
    expect(await handleSetTagGroup(deps("tutorAn", unknown), AN, { tag_key: "x-cu-abcde", group_key: "gr-nope" })).toMatchObject({ status: 400, body: { error: "unknown_group" } });
    const missing = makeStore({ setTagGroup: vi.fn(async () => { throw new ReviewDbError("P0002", "eng_set_tag_group: no family tag"); }) });
    expect((await handleSetTagGroup(deps("tutorAn", missing), AN, { tag_key: "x-nope-abcde", group_key: "wr-genre" })).status).toBe(404);
  });

  it("tags read from the database carry the group of a family tag; the form words the two new errors", () => {
    expect(parseTags([
      { key: "dang-tu", label_vi: "Dạng từ", group_vi: "Từ vựng", origin: "seed", group_key: null },
      { key: "x-moi-abcde", label_vi: "Mới", group_vi: "Nhãn riêng", origin: "custom", group_key: "gr-emphasis" },
    ])).toEqual([
      { key: "dang-tu", label: "Dạng từ", group: "Từ vựng", custom: false, groupKey: null },
      { key: "x-moi-abcde", label: "Mới", group: "Nhãn riêng", custom: true, groupKey: "gr-emphasis" },
    ]);
    expect(failText({ ok: false, status: 400, error: "unknown_group" })).toBe(tutorWorkErrors.unknownGroup);
    expect(failText({ ok: false, status: 409, error: "already_grouped" })).toBe(tutorWorkErrors.alreadyGrouped);
  });
```

Run: `npx vitest run tests/unit/tutorWork.test.ts` → FAIL (`handleSetTagGroup` is not exported).

- [ ] **Step 2: Schemas** — in `lib/tutorwork/schemas.ts` add `import { GROUP_KEY_RE } from "@/lib/skillmap/types";` and replace `addTagBodySchema` with:

```ts
const groupKey = z.string().regex(GROUP_KEY_RE);

/** "+ nhãn khác": the label, and the skill-map group it belongs to (SM-1: required). */
export const addTagBodySchema = z.strictObject({
  label: z.string().trim().min(2).max(120),
  group_key: groupKey,
});
export type AddTagBody = z.infer<typeof addTagBodySchema>;

/** "Xếp vào nhóm": a family tag (key x-…) that has no group yet. */
export const setTagGroupBodySchema = z.strictObject({
  tag_key: z.string().trim().regex(/^x-[a-z0-9][a-z0-9-]{0,60}$/),
  group_key: groupKey,
});
export type SetTagGroupBody = z.infer<typeof setTagGroupBodySchema>;
```

- [ ] **Step 3: Handlers** — in `lib/tutorwork/handlers.ts`:
  - import `setTagGroupBodySchema` next to `addTagBodySchema`;
  - in `interface TutorWorkStore` replace the `addTag` line with:

```ts
  addTag(args: { learnerId: string; key: string; label: string; groupKey: string; byMemberId: string }): Promise<unknown>;
  setTagGroup(args: { learnerId: string; tagKey: string; groupKey: string; byMemberId: string }): Promise<unknown>;
```

  - replace `handleAddTag` and add `handleSetTagGroup` right after it:

```ts
export async function handleAddTag(deps: TutorWorkDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "tutorwork:write");
  if (!g.ok) return g.result;
  const parsed = addTagBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  const key = customTagKey(parsed.data.label);
  if (!key) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.addTag({
      learnerId: g.grant.learner.id,
      key,
      label: parsed.data.label,
      groupKey: parsed.data.group_key,
      byMemberId: g.grant.member.id,
    })) as { key: string; label_vi: string; group_key: string | null; created: boolean };
    return {
      status: r.created ? 201 : 200,
      body: { key: r.key, label: r.label_vi, group_key: r.group_key, created: r.created },
    };
  } catch (err) {
    if (err instanceof ReviewDbError && err.code === "23514" && /\(unknown_group\)/.test(err.detail)) return fail(400, "unknown_group");
    return fromDbError(err);
  }
}

/** "Xếp vào nhóm" (SM-1): put a family tag that has no group yet into a group of the skill map. Same access as adding a tag. */
export async function handleSetTagGroup(deps: TutorWorkDeps, learnerId: string, rawBody: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "tutorwork:write");
  if (!g.ok) return g.result;
  const parsed = setTagGroupBodySchema.safeParse(rawBody);
  if (!parsed.success) return fail(400, "invalid_body");
  try {
    const r = (await deps.store.setTagGroup({
      learnerId: g.grant.learner.id,
      tagKey: parsed.data.tag_key,
      groupKey: parsed.data.group_key,
      byMemberId: g.grant.member.id,
    })) as { key: string; group_key: string; changed: boolean };
    return { status: 200, body: { key: r.key, group_key: r.group_key, changed: r.changed } };
  } catch (err) {
    if (err instanceof ReviewDbError && err.code === "23514" && /\(unknown_group\)/.test(err.detail)) return fail(400, "unknown_group");
    if (err instanceof ReviewDbError && err.code === "23514" && /\(already_grouped\)/.test(err.detail)) return fail(409, "already_grouped");
    return fromDbError(err);
  }
}
```

- [ ] **Step 4: Store** — in `lib/tutorwork/supabaseStore.ts` replace `addTag` and add `setTagGroup` after it:

```ts
    async addTag(a) {
      const { data, error } = await db().rpc("eng_add_error_tag_v2", {
        p_learner: a.learnerId,
        p_key: a.key,
        p_label: a.label,
        p_group_key: a.groupKey,
        p_by: a.byMemberId,
      });
      if (error) dbError("eng_add_error_tag_v2", error);
      return data;
    },

    async setTagGroup(a) {
      const { data, error } = await db().rpc("eng_set_tag_group", {
        p_learner: a.learnerId,
        p_tag_key: a.tagKey,
        p_group_key: a.groupKey,
        p_by: a.byMemberId,
      });
      if (error) dbError("eng_set_tag_group", error);
      return data;
    },
```

- [ ] **Step 5: Tags carry their group** — in `lib/tutorwork/shape.ts` replace `tagRow` and `parseTags`:

```ts
const tagRow = z.object({
  key: text,
  label_vi: text,
  group_vi: nullableText,
  origin: z.enum(["seed", "custom"]),
  group_key: nullableText,
});

export function parseTags(raw: unknown): TagInfo[] {
  return z
    .array(tagRow)
    .parse(raw ?? [])
    .map((t) => ({
      key: t.key,
      label: t.label_vi,
      group: t.group_vi,
      custom: t.origin === "custom",
      groupKey: t.group_key,
    }));
}
```

In `lib/tutorwork/load.ts` `loadTags`, change the select to `.select("key, label_vi, group_vi, origin, group_key")`.

- [ ] **Step 6: Errors** — in `lib/copy/vi.ts` `tutorWorkErrors` add:

```ts
  unknownGroup: "Nhóm này không có trong bản đồ kỹ năng. Tải lại trang rồi chọn lại.",
  alreadyGrouped: "Nhãn này đã được xếp vào nhóm khác. Tải lại trang để xem.",
```

In `lib/tutorwork/client.ts` `failText`, before `if (r.status === 403)` add:

```ts
  if (r.error === "unknown_group") return tutorWorkErrors.unknownGroup;
  if (r.error === "already_grouped") return tutorWorkErrors.alreadyGrouped;
```

- [ ] **Step 7: Route** — `app/api/learners/[id]/tags/group/route.ts`

```ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleSetTagGroup } from "@/lib/tutorwork/handlers";
import { runTutorWorkRoute } from "@/lib/tutorwork/route";

/** POST /api/learners/:id/tags/group - put a family tag that has no group yet into a group of the skill map ("Xếp vào nhóm"). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runTutorWorkRoute("POST /api/learners/[id]/tags/group", (deps) => handleSetTagGroup(deps, id, body));
}
```

Also update the doc comment of `app/api/learners/[id]/tags/route.ts` to: `/** POST /api/learners/:id/tags - add a tag of the family's own ("+ nhãn khác") into a group of the skill map. The same name as an existing tag returns that tag. */`

- [ ] **Step 8: Run** — `npx vitest run tests/unit/tutorWork.test.ts` → PASS; `npm run typecheck` → clean (`useTags` posts an untyped body, so it still compiles; it switches to `{ label, group_key }` in Task 7).

- [ ] **Step 9: Commit**

```bash
git add lib/tutorwork lib/copy/vi.ts app/api/learners/\[id\]/tags tests/unit/tutorWork.test.ts
git commit -m "feat(sm-1): family tags need a skill-map group (eng_add_error_tag_v2) and can be grouped later (POST tags/group)"
```

---

### Task 6: `DomainTabs`, `GroupPicker`, `SetGroupControl`

**Files:**
- Create: `components/tutor/DomainTabs.tsx`, `components/tutor/GroupPicker.tsx`, `components/tutor/SetGroupControl.tsx`
- Test: `tests/unit/skillMapUi.test.ts`

**Interfaces:**
- Consumes: `Bucket<T>`, `SkillMapView`, `DomainKey`, `skillMapCopy`, `fixtureMap()`.
- Produces:
  - `<DomainTabs<T> buckets active onActive itemKey itemText renderItem testId />` — controlled (`active: string`, `onActive(key: string)`); renders the search box `search-${testId}`, a `role="tablist"` with one `role="tab"` per bucket (`tab-${testId}-${key}`, text = name + count), and EVERY panel (`panel-${testId}-${key}`, inactive ones `hidden`) with one `<h3>` per group. While a query is typed, tabs and panels are not rendered; matches show in `results-${testId}` with "Mảng · Nhóm" before each item. Wrapper test id: `tabs-${testId}`.
  - `<GroupPicker map value onChange testIdPrefix defaultDomain? />` — two native selects `${testIdPrefix}-domain` / `${testIdPrefix}-group`; `onChange(null)` when the domain changes.
  - `<SetGroupControl map tagKey onSetGroup />` with `type SetGroupFn = (key: string, groupKey: string) => Promise<{ ok: true } | { error: string }>` — a "Xếp vào nhóm" button (`set-group-${tagKey}`) that opens a `GroupPicker` (`set-group-${tagKey}-domain/-group`) and a save button (`set-group-${tagKey}-save`).

- [ ] **Step 1: Write the failing test** — `tests/unit/skillMapUi.test.ts`

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DomainTabs } from "@/components/tutor/DomainTabs";
import { GroupPicker } from "@/components/tutor/GroupPicker";
import { SetGroupControl } from "@/components/tutor/SetGroupControl";
import { skillMapCopy } from "@/lib/copy/vi";
import { groupTags } from "@/lib/skillmap/group";
import type { TagInfo } from "@/lib/tutorwork/types";
import { fixtureMap } from "./fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const tag = (key: string, over: Partial<TagInfo> = {}): TagInfo => ({ key, label: key, group: null, custom: false, ...over });
const map = fixtureMap();
const buckets = groupTags(map, [tag("dang-tu"), tag("cum-dong-tu"), tag("phat-am"), tag("doc-hieu"), tag("x-dao-ngu-hardly", { custom: true })]);
const tabs = (active: string) =>
  render(
    createElement(DomainTabs<TagInfo>, {
      buckets, active, onActive: vi.fn(), testId: "t", itemKey: (x: TagInfo) => x.key, itemText: (x: TagInfo) => x.label,
      renderItem: (x: TagInfo) => createElement("span", { "data-testid": `item-${x.key}` }, x.label),
    }),
  );

describe("DomainTabs", () => {
  it("7 domain tabs + 'Chưa xếp mảng', each with its count; the active one is selected", () => {
    const html = tabs("vocab");
    for (const k of ["grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking", "unassigned"]) expect(html).toContain(`data-testid="tab-t-${k}"`);
    const tab = html.match(/<button[^>]*data-testid="tab-t-vocab"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(tab).toContain('aria-selected="true"');
    expect(tab).toContain("Từ vựng");
    expect(tab).toMatch(/>2<\/span>/);
    expect(html).toContain(skillMapCopy.unassigned);
  });

  it("renders every panel, hides the inactive ones, titles each group, and says when a domain is empty", () => {
    const html = tabs("vocab");
    expect(html).toMatch(/<div[^>]*role="tabpanel"[^>]*data-testid="panel-t-vocab"/);
    expect(html).toMatch(/<div[^>]*hidden=""[^>]*data-testid="panel-t-speaking"/);
    expect(html).not.toMatch(/<div[^>]*hidden=""[^>]*data-testid="panel-t-vocab"/);
    expect(html).toContain(">Dạng từ</h3>");
    expect(html).toContain('data-testid="item-phat-am"'); // in the hidden speaking panel
    expect(html).not.toContain('data-testid="item-doc-hieu"'); // hidden from the picker
    expect(html).toContain(skillMapCopy.emptyDomain); // listening has nothing
    expect(html).toContain(`aria-label="${skillMapCopy.search}"`);
  });
});

describe("GroupPicker and SetGroupControl", () => {
  it("lists the 7 domains; the group select stays disabled until a domain is chosen, then lists its groups", () => {
    const none = render(createElement(GroupPicker, { map, value: null, onChange: vi.fn(), testIdPrefix: "add-tag" }));
    expect((none.match(/<option value="(grammar|vocab|reading|listening|writing|speaking|thinking)"/g) ?? []).length).toBe(7);
    expect(none).toMatch(/<select[^>]*disabled=""[^>]*data-testid="add-tag-group"|<select[^>]*data-testid="add-tag-group"[^>]*disabled=""/);
    const vocab = render(createElement(GroupPicker, { map, value: null, onChange: vi.fn(), testIdPrefix: "add-tag", defaultDomain: "vocab" }));
    expect(vocab).toContain('<option value="vo-word-form">Dạng từ</option>');
    expect(vocab).not.toContain('value="gr-conditional"');
  });

  it("'Xếp vào nhóm' starts as one button", () => {
    const html = render(createElement(SetGroupControl, { map, tagKey: "x-dao-ngu-hardly", onSetGroup: vi.fn() }));
    expect(html).toContain('data-testid="set-group-x-dao-ngu-hardly"');
    expect(html).toContain(skillMapCopy.setGroup);
  });
});
```

Run: `npx vitest run tests/unit/skillMapUi.test.ts` → FAIL (components missing).

- [ ] **Step 2: `components/tutor/DomainTabs.tsx`**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { skillMapCopy } from "@/lib/copy/vi";
import type { Bucket } from "@/lib/skillmap/group";

/**
 * Items of the skill map by domain (SM-1): one tab per domain (+ "Chưa xếp mảng"), group headings inside a tab, and a quick search
 * across every domain. Every panel is rendered and the inactive ones are `hidden`, so a choice in another tab keeps its state.
 * Controlled: the parent keeps the active tab (so it can jump to the tab of a tag it just added).
 */
export function DomainTabs<T>({
  buckets,
  active,
  onActive,
  itemKey,
  itemText,
  renderItem,
  testId,
}: {
  buckets: Bucket<T>[];
  active: string;
  onActive: (key: string) => void;
  itemKey: (item: T) => string;
  itemText: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  testId: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const hits = q
    ? buckets.flatMap((b) =>
        b.groups.flatMap((g) =>
          g.items
            .filter((it) => itemText(it).toLowerCase().includes(q) || g.name.toLowerCase().includes(q))
            .map((it) => ({ it, place: b.key === g.key ? b.name : skillMapCopy.place(b.name, g.name) })),
        ),
      )
    : [];

  return (
    <div className="flex flex-col gap-3" data-testid={`tabs-${testId}`}>
      <input
        type="search"
        aria-label={skillMapCopy.search}
        placeholder={skillMapCopy.searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid={`search-${testId}`}
        className="min-h-11 rounded-lg border border-line px-3 text-sm"
      />
      {q ? (
        <ul className="flex flex-col gap-2" data-testid={`results-${testId}`}>
          {hits.length === 0 ? <li className="text-sm text-muted">{skillMapCopy.noMatch}</li> : null}
          {hits.map(({ it, place }) => (
            <li key={itemKey(it)} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{place}</span>
              {renderItem(it)}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div role="tablist" aria-label={skillMapCopy.tabsLabel} className="flex flex-wrap gap-2">
            {buckets.map((b) => {
              const on = b.key === active;
              return (
                <button
                  key={b.key}
                  type="button"
                  role="tab"
                  id={`tab-${testId}-${b.key}`}
                  aria-selected={on}
                  aria-controls={`panel-${testId}-${b.key}`}
                  onClick={() => onActive(b.key)}
                  data-testid={`tab-${testId}-${b.key}`}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`}
                >
                  {b.name} <span className="ml-1 text-xs opacity-80">{b.total}</span>
                </button>
              );
            })}
          </div>
          {buckets.map((b) => (
            <div
              key={b.key}
              role="tabpanel"
              id={`panel-${testId}-${b.key}`}
              aria-labelledby={`tab-${testId}-${b.key}`}
              hidden={b.key !== active}
              data-testid={`panel-${testId}-${b.key}`}
              className="flex flex-col gap-3"
            >
              {b.groups.length === 0 ? <p className="text-sm text-muted">{skillMapCopy.emptyDomain}</p> : null}
              {b.groups.map((g) => (
                <section key={g.key} aria-label={g.name} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-muted">{g.name}</h3>
                  <ul className="flex flex-wrap gap-2">
                    {g.items.map((it) => (
                      <li key={itemKey(it)}>{renderItem(it)}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

(In the "Chưa xếp mảng" bucket the only group has the bucket's own key, so search results show just "Chưa xếp mảng".)

- [ ] **Step 3: `components/tutor/GroupPicker.tsx`**

```tsx
"use client";

import { useState } from "react";
import { skillMapCopy } from "@/lib/copy/vi";
import type { DomainKey, SkillMapView } from "@/lib/skillmap/types";

/** Domain, then group of that domain (two native selects: phone-friendly). `onChange(null)` while no group is chosen. */
export function GroupPicker({
  map,
  value,
  onChange,
  testIdPrefix,
  defaultDomain = null,
}: {
  map: SkillMapView;
  value: string | null;
  onChange: (groupKey: string | null) => void;
  testIdPrefix: string;
  defaultDomain?: DomainKey | null;
}) {
  const [domain, setDomain] = useState<string>(defaultDomain ?? "");
  const groups = map.domains.find((d) => d.key === domain)?.groups ?? [];
  const select = "min-h-11 min-w-0 rounded-lg border border-line bg-white px-2 text-sm";
  return (
    <div className="flex flex-wrap gap-2">
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-muted">{skillMapCopy.domainLabel}</span>
        <select
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            onChange(null);
          }}
          data-testid={`${testIdPrefix}-domain`}
          className={select}
        >
          <option value="">{skillMapCopy.pickDomain}</option>
          {map.domains.map((d) => (
            <option key={d.key} value={d.key}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-muted">{skillMapCopy.groupLabel}</span>
        <select
          value={value ?? ""}
          disabled={!domain}
          onChange={(e) => onChange(e.target.value || null)}
          data-testid={`${testIdPrefix}-group`}
          className={select}
        >
          <option value="">{skillMapCopy.pickGroup}</option>
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: `components/tutor/SetGroupControl.tsx`**

```tsx
"use client";

import { useState } from "react";
import { skillMapCopy } from "@/lib/copy/vi";
import type { SkillMapView } from "@/lib/skillmap/types";
import { GroupPicker } from "./GroupPicker";

export type SetGroupFn = (key: string, groupKey: string) => Promise<{ ok: true } | { error: string }>;

/** "Xếp vào nhóm" next to a family tag that has no group yet (added before SM-1). Once saved the tag moves to its domain tab. */
export function SetGroupControl({ map, tagKey, onSetGroup }: { map: SkillMapView; tagKey: string; onSetGroup: SetGroupFn }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={`set-group-${tagKey}`}
        className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-accent"
      >
        {skillMapCopy.setGroup}
      </button>
    );

  async function save() {
    if (group === null || busy) return;
    setBusy(true);
    setError(null);
    const r = await onSetGroup(tagKey, group);
    setBusy(false);
    if ("error" in r) setError(r.error);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <GroupPicker map={map} value={group} onChange={setGroup} testIdPrefix={`set-group-${tagKey}`} />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || group === null}
        data-testid={`set-group-${tagKey}-save`}
        className="min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-50"
      >
        {skillMapCopy.setGroupSave}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run** — `npx vitest run tests/unit/skillMapUi.test.ts` → PASS; `npm run typecheck && npm run lint` → clean.

- [ ] **Step 6: Commit**

```bash
git add components/tutor/DomainTabs.tsx components/tutor/GroupPicker.tsx components/tutor/SetGroupControl.tsx tests/unit/skillMapUi.test.ts
git commit -m "feat(sm-1): DomainTabs (7 tabs, group headings, quick search), GroupPicker and 'Xếp vào nhóm'"
```

---

### Task 7: Every picker by domain — tags, wrong-item selects, "Kỹ năng đã luyện hôm nay"

**Files:**
- Modify: `components/tutor/useTags.ts`, `components/tutor/AddTag.tsx`, `components/tutor/TagChips.tsx`, `components/tutor/TagSelect.tsx`, `components/tutor/SessionNoteForm.tsx`, `components/tutor/WritingTags.tsx`, `components/tutor/PendingTags.tsx`, `components/tutor/ResultForm.tsx`, `components/practice/AssignForm.tsx`
- Modify pages: `app/learners/[id]/notes/new/page.tsx`, `app/learners/[id]/results/new/page.tsx`, `app/learners/[id]/assign/page.tsx`, `app/review/[episodeId]/page.tsx`
- Test: `tests/unit/skillMapUi.test.ts` (append), `tests/unit/tutorWorkUi.test.ts`, `tests/unit/practiceUi.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6 (`loadSkillMap`, `groupTags`, `groupTargets`, `firstTab`, `placeOfTag`, `domainOfGroup`, `DomainTabs`, `GroupPicker`, `SetGroupControl`, `SetGroupFn`), routes of Task 5.
- Produces:
  - `type AddTagFn = (label: string, groupKey: string) => Promise<{ key: string } | { error: string }>` (exported from `components/tutor/useTags.ts`)
  - `useTags(learnerId, initial)` → `{ tags, add: AddTagFn, setGroup: SetGroupFn }`
  - `<AddTag map onAdd defaultDomain? prefill? />` — test ids `add-tag-input`, `add-tag-domain`, `add-tag-group`, `add-tag-button`
  - `<TagChips tags map selected onChange max locked? onAdd onSetGroup? testId? />` — tab ids `tab-${testId}-${domain}`; chips keep `tag-chip-${key}`; chosen line `${testId}-chosen`
  - `<TagSelect tags map value onChange onAdd label testId? />` — optgroups "Mảng · Nhóm"
  - New required prop `map: SkillMapView` on `SessionNoteForm`, `WritingTags`, `PendingTags`, `ResultForm`, `AssignForm`.
  - "Kỹ năng đã luyện hôm nay": tabs `tab-session-practised-${domain}`, chips keep `session-practised-${id}`.

- [ ] **Step 1: Append the failing tests** to `tests/unit/skillMapUi.test.ts`

Add imports at the top: `import { TagChips } from "@/components/tutor/TagChips";` and `import { TagSelect } from "@/components/tutor/TagSelect";`. Then append:

```ts
describe("pickers by domain", () => {
  const tags = [tag("dang-tu"), tag("thanh-ngu"), tag("phat-am"), tag("doc-hieu"), tag("x-dao-ngu-hardly", { custom: true, label: "Đảo ngữ với hardly" })];

  it("TagChips opens on the tab of the first chosen tag, says what is chosen, hides the hidden leaf, offers 'Xếp vào nhóm', and '+ nhãn khác' needs a group", () => {
    const html = render(createElement(TagChips, { tags, map, selected: ["phat-am"], onChange: vi.fn(), max: 3, onAdd: vi.fn(), onSetGroup: vi.fn(), testId: "session-tags" }));
    expect(html).toMatch(/<button[^>]*aria-selected="true"[^>]*data-testid="tab-session-tags-speaking"/);
    expect(html).toContain(skillMapCopy.chosen("phat-am"));
    expect(html).not.toContain('data-testid="tag-chip-doc-hieu"');
    expect(html).toContain('data-testid="set-group-x-dao-ngu-hardly"');
    expect(html).toContain('data-testid="add-tag-domain"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="add-tag-button"/);
  });

  it("TagChips keeps a hidden tag that was already saved, ticked and locked", () => {
    const html = render(createElement(TagChips, { tags, map, selected: ["doc-hieu"], locked: ["doc-hieu"], onChange: vi.fn(), max: 3, onAdd: vi.fn() }));
    expect(html).toMatch(/<button[^>]*aria-checked="true"[^>]*disabled=""[^>]*data-testid="tag-chip-doc-hieu"/);
  });

  it("TagSelect groups options as 'Mảng · Nhóm', 'Chưa xếp mảng' last; the hidden leaf only when it is the current value", () => {
    const html = render(createElement(TagSelect, { tags, map, value: null, onChange: vi.fn(), onAdd: vi.fn(), label: "Câu 4", testId: "q4" }));
    expect(html).toContain(`<optgroup label="${skillMapCopy.place("Từ vựng", "Dạng từ")}">`);
    expect(html.indexOf(`<optgroup label="${skillMapCopy.unassigned}">`)).toBeGreaterThan(html.indexOf(`<optgroup label="${skillMapCopy.place("Nói", "Phát âm & ngữ điệu")}">`));
    expect(html).not.toContain('value="doc-hieu"');
    expect(render(createElement(TagSelect, { tags, map, value: "doc-hieu", onChange: vi.fn(), onAdd: vi.fn(), label: "Câu 4" }))).toContain('value="doc-hieu"');
  });
});
```

Run: `npx vitest run tests/unit/skillMapUi.test.ts` → FAIL (`map` is not a prop of TagChips yet; the tab test ids are missing).

- [ ] **Step 2: `components/tutor/useTags.ts`** — replace the file:

```ts
"use client";

import { useCallback, useState } from "react";
import { tagPicker } from "@/lib/copy/vi";
import { failText, postJson } from "@/lib/tutorwork/client";
import type { TagInfo } from "@/lib/tutorwork/types";
import type { SetGroupFn } from "./SetGroupControl";

export type AddTagFn = (label: string, groupKey: string) => Promise<{ key: string } | { error: string }>;

/**
 * The tag list of one child plus "+ nhãn khác" (the server makes the key; a group of the skill map is required) and "Xếp vào nhóm"
 * for a family tag that has no group yet. Both update the list in place, so the tag moves to its domain tab at once.
 */
export function useTags(learnerId: string, initial: TagInfo[]) {
  const [tags, setTags] = useState<TagInfo[]>(initial);
  const add = useCallback<AddTagFn>(
    async (label, groupKey) => {
      const r = await postJson<{ key: string; label: string; group_key: string | null; created: boolean }>(`/api/learners/${learnerId}/tags`, {
        label,
        group_key: groupKey,
      });
      if (!r.ok) return { error: failText(r) };
      const { key, label: saved, group_key } = r.body;
      setTags((cur) =>
        cur.some((t) => t.key === key)
          ? cur.map((t) => (t.key === key && t.custom ? { ...t, groupKey: group_key } : t))
          : [...cur, { key, label: saved, group: tagPicker.customGroup, custom: true, groupKey: group_key }],
      );
      return { key };
    },
    [learnerId],
  );
  const setGroup = useCallback<SetGroupFn>(
    async (key, groupKey) => {
      const r = await postJson<{ key: string; group_key: string; changed: boolean }>(`/api/learners/${learnerId}/tags/group`, { tag_key: key, group_key: groupKey });
      if (!r.ok) return { error: failText(r) };
      setTags((cur) => cur.map((t) => (t.key === key ? { ...t, groupKey: r.body.group_key } : t)));
      return { ok: true as const };
    },
    [learnerId],
  );
  return { tags, add, setGroup };
}
```

- [ ] **Step 3: `components/tutor/AddTag.tsx`** — replace the file:

```tsx
"use client";

import { useState } from "react";
import { skillMapCopy, tagPicker } from "@/lib/copy/vi";
import type { DomainKey, SkillMapView } from "@/lib/skillmap/types";
import { GroupPicker } from "./GroupPicker";
import type { AddTagFn } from "./useTags";

/** "+ nhãn khác": a name and its place in the skill map — domain and group are both required (SM-1, spec M3). */
export function AddTag({
  map,
  onAdd,
  defaultDomain = null,
  prefill = "",
}: {
  map: SkillMapView;
  onAdd: AddTagFn;
  defaultDomain?: DomainKey | null;
  prefill?: string;
}) {
  const [label, setLabel] = useState(prefill);
  const [group, setGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const clean = label.trim();
  const ready = clean.length >= 2 && group !== null;

  async function submit() {
    if (busy || clean.length < 2) return;
    if (group === null) return setError(skillMapCopy.groupRequired);
    setBusy(true);
    setError(null);
    setDone(null);
    const r = await onAdd(clean, group);
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setDone(tagPicker.added(clean));
    setLabel("");
  }

  return (
    <div className="flex flex-col gap-2" data-testid="add-tag">
      <input
        type="text"
        aria-label={tagPicker.addTitle}
        placeholder={tagPicker.addOther}
        maxLength={120}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        data-testid="add-tag-input"
        className="min-h-11 min-w-0 rounded-lg border border-line px-3 text-sm"
      />
      <div className="flex flex-wrap items-end gap-2">
        <GroupPicker map={map} value={group} onChange={setGroup} testIdPrefix="add-tag" defaultDomain={defaultDomain} />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !ready}
          data-testid="add-tag-button"
          className="min-h-11 rounded-lg border border-accent bg-white px-4 text-sm font-semibold text-accent disabled:opacity-50"
        >
          {clean.length >= 2 ? tagPicker.addNamed(clean) : tagPicker.addOther}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-accent">
          {done}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: `components/tutor/TagChips.tsx`** — replace the file:

```tsx
"use client";

import { useMemo, useState } from "react";
import { fallbackLabels, skillMapCopy, tagPicker } from "@/lib/copy/vi";
import { domainOfGroup, firstTab, groupTags, placeOfTag } from "@/lib/skillmap/group";
import { isDomainKey, UNASSIGNED, type SkillMapView } from "@/lib/skillmap/types";
import type { TagInfo } from "@/lib/tutorwork/types";
import { AddTag } from "./AddTag";
import { DomainTabs } from "./DomainTabs";
import { SetGroupControl, type SetGroupFn } from "./SetGroupControl";
import type { AddTagFn } from "./useTags";

/**
 * Pick up to `max` tags as chips, by domain of the skill map (SM-1): tabs, group headings, quick search, "+ nhãn khác" (domain + group
 * required). `locked` keys are already saved: shown ticked and cannot be removed (append-only). A leaf hidden from the picker shows only
 * when it is already chosen. Family tags without a group sit under "Chưa xếp mảng", with "Xếp vào nhóm" when `onSetGroup` is given.
 */
export function TagChips({
  tags,
  map,
  selected,
  onChange,
  max,
  locked = [],
  onAdd,
  onSetGroup,
  testId = "tag-chips",
}: {
  tags: TagInfo[];
  map: SkillMapView;
  selected: string[];
  onChange: (next: string[]) => void;
  max: number;
  locked?: string[];
  onAdd: AddTagFn;
  onSetGroup?: SetGroupFn;
  testId?: string;
}) {
  const keep = [...selected, ...locked];
  const keepKey = keep.join("|");
  const buckets = useMemo(() => groupTags(map, tags, { keep: keepKey ? keepKey.split("|") : [] }), [map, tags, keepKey]);
  const [tab, setTab] = useState<string>(() => firstTab(buckets, (t) => selected.includes(t.key)));
  const active = buckets.some((b) => b.key === tab) ? tab : firstTab(buckets);
  const full = selected.length >= max;
  const labelOf = new Map(tags.map((t) => [t.key, t.label]));

  function toggle(key: string) {
    if (locked.includes(key)) return;
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key));
    else if (!full) onChange([...selected, key]);
  }

  async function addAndSelect(label: string, groupKey: string) {
    const r = await onAdd(label, groupKey);
    if ("key" in r) {
      const d = domainOfGroup(map, groupKey);
      if (d) setTab(d);
      if (!full && !selected.includes(r.key)) onChange([...selected, r.key]);
    }
    return r;
  }

  function chip(t: TagInfo) {
    const on = selected.includes(t.key);
    const isLocked = locked.includes(t.key);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        disabled={isLocked || (!on && full)}
        onClick={() => toggle(t.key)}
        data-testid={`tag-chip-${t.key}`}
        className={`min-h-11 rounded-full border px-4 text-sm ${
          on ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-ink hover:border-accent"
        } disabled:opacity-60`}
      >
        {on ? "✓ " : ""}
        {t.label}
        {t.custom ? <span className="ml-1 text-xs opacity-80">({tagPicker.customTag})</span> : null}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <p className="text-sm text-muted" aria-live="polite">
        {full ? tagPicker.maxReached(max) : tagPicker.selected(selected.length, max)}
      </p>
      {selected.length > 0 ? (
        <p className="text-sm" data-testid={`${testId}-chosen`}>
          {skillMapCopy.chosen(selected.map((k) => labelOf.get(k) ?? fallbackLabels.tag).join(", "))}
        </p>
      ) : null}
      <DomainTabs
        buckets={buckets}
        active={active}
        onActive={setTab}
        testId={testId}
        itemKey={(t) => t.key}
        itemText={(t) => t.label}
        renderItem={(t) => (
          <span className="flex flex-wrap items-center gap-2">
            {chip(t)}
            {onSetGroup && t.custom && placeOfTag(map, t) === null ? <SetGroupControl map={map} tagKey={t.key} onSetGroup={onSetGroup} /> : null}
          </span>
        )}
      />
      {active === UNASSIGNED ? <p className="text-xs text-muted">{skillMapCopy.unassignedHelp}</p> : null}
      <AddTag map={map} onAdd={addAndSelect} defaultDomain={isDomainKey(active) ? active : null} />
    </div>
  );
}
```

- [ ] **Step 5: `components/tutor/TagSelect.tsx`** — replace the file:

```tsx
"use client";

import { useState } from "react";
import { resultPage, skillMapCopy, tagPicker } from "@/lib/copy/vi";
import { groupTags } from "@/lib/skillmap/group";
import type { SkillMapView } from "@/lib/skillmap/types";
import type { TagInfo } from "@/lib/tutorwork/types";
import { AddTag } from "./AddTag";
import type { AddTagFn } from "./useTags";

const NEW = "__new__";

/** One tag for one wrong item: a native select grouped as "Mảng · Nhóm" of the skill map (phone-friendly), plus "+ nhãn khác". */
export function TagSelect({
  tags,
  map,
  value,
  onChange,
  onAdd,
  label,
  testId,
}: {
  tags: TagInfo[];
  map: SkillMapView;
  value: string | null;
  onChange: (key: string | null) => void;
  onAdd: AddTagFn;
  label: string;
  testId?: string;
}) {
  const [adding, setAdding] = useState(false);
  const buckets = groupTags(map, tags, { keep: value ? [value] : [] });

  async function addAndPick(l: string, groupKey: string) {
    const r = await onAdd(l, groupKey);
    if ("key" in r) {
      onChange(r.key);
      setAdding(false);
    }
    return r;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <select
        aria-label={label}
        data-testid={testId}
        value={adding ? NEW : (value ?? "")}
        onChange={(e) => {
          if (e.target.value === NEW) return setAdding(true);
          setAdding(false);
          onChange(e.target.value === "" ? null : e.target.value);
        }}
        className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-sm"
      >
        <option value="">{resultPage.tagNone}</option>
        {buckets.flatMap((b) =>
          b.groups.map((g) => (
            <optgroup key={`${b.key}:${g.key}`} label={b.key === g.key ? b.name : skillMapCopy.place(b.name, g.name)}>
              {g.items.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          )),
        )}
        <option value={NEW}>{tagPicker.addOther}</option>
      </select>
      {adding ? <AddTag map={map} onAdd={addAndPick} /> : null}
    </div>
  );
}
```

- [ ] **Step 6: Pass the map through the forms**

`components/tutor/WritingTags.tsx`:
- signature: `export function WritingTags({ learnerId, episodeId, tags: initialTags, saved, map }: { learnerId: string; episodeId: string; tags: TagInfo[]; saved: string[]; map: SkillMapView })` and add `import type { SkillMapView } from "@/lib/skillmap/types";`
- `const { tags, add, setGroup } = useTags(learnerId, initialTags);`
- the chips: `<TagChips tags={tags} map={map} selected={selected} onChange={setSelected} max={MAX_WRITING_TAGS} locked={alreadySaved} onAdd={add} onSetGroup={setGroup} testId="writing-tag-chips" />`

`components/practice/AssignForm.tsx`:
- add `map,` to the destructured props and `map: SkillMapView;` to their type; `import type { SkillMapView } from "@/lib/skillmap/types";`
- `const { tags, add, setGroup } = useTags(learnerId, initialTags);`
- the chips: `<TagChips tags={tags} map={map} selected={picked} onChange={setPicked} max={3} onAdd={add} onSetGroup={setGroup} testId="assign-tags" />`

`components/tutor/ResultForm.tsx`:
- in `type Props` add `/** The skill map of this learner (SM-1): the tag selects are grouped by domain. */ map: SkillMapView;` and import the type;
- add `map` to the destructured props of `ResultForm`;
- the select: add `map={map}` to `<TagSelect … />`.

`components/tutor/PendingTags.tsx`:
- imports: `import type { SkillMapView } from "@/lib/skillmap/types";` and change `import { useTags } from "./useTags";` to `import { useTags, type AddTagFn } from "./useTags";`
- `PendingResult` props: add `map: SkillMapView;`, change `add: (label: string) => Promise<…>` to `add: AddTagFn;`, destructure `map`, and pass `map={map}` to `<TagSelect … />`
- `PendingTags` signature: `export function PendingTags({ learnerId, items, tags: initialTags, isParent, map }: { learnerId: string; items: UntaggedItem[]; tags: TagInfo[]; isParent: boolean; map: SkillMapView })`, and render `<PendingResult key={i.resultId} item={i} tags={tags} add={add} map={map} onSaved={…} />`

`components/tutor/SessionNoteForm.tsx`:
- imports: `import { useMemo, useRef, useState } from "react";`, `import { firstTab, groupTargets } from "@/lib/skillmap/group";`, `import type { SkillMapView } from "@/lib/skillmap/types";`, `import { DomainTabs } from "./DomainTabs";`
- props: add `map,` to the destructuring and `/** The skill map of this learner (SM-1): skills and tags are picked by domain. */ map: SkillMapView;` to the type
- body: `const { tags, add, setGroup } = useTags(learnerId, initialTags);` and, below the existing `useState` lines:

```tsx
  const skillBuckets = useMemo(() => groupTargets(map, skills), [map, skills]);
  const [skillTab, setSkillTab] = useState<string>(() => firstTab(skillBuckets));
```

- replace the whole `<ul className="mt-2 flex flex-wrap gap-2"> … </ul>` of the practised skills (the `else` branch after `practisedNone`) with:

```tsx
            <div className="mt-2">
              <DomainTabs
                buckets={skillBuckets}
                active={skillTab}
                onActive={setSkillTab}
                testId="session-practised"
                itemKey={(t) => t.id}
                itemText={(t) => t.title}
                renderItem={(t) => {
                  const on = practised.includes(t.id);
                  return (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={!on && practised.length >= MAX_PRACTISED_PER_NOTE}
                      onClick={() => setPractised((cur) => (cur.includes(t.id) ? cur.filter((k) => k !== t.id) : [...cur, t.id]))}
                      data-testid={`session-practised-${t.id}`}
                      className={`min-h-11 rounded-full border px-4 text-sm ${
                        on ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-ink hover:border-accent"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {t.title}
                    </button>
                  );
                }}
              />
            </div>
```

- the tag chips: `<TagChips tags={tags} map={map} selected={weak} onChange={setWeak} max={MAX_WEAK_TAGS_PER_NOTE} onAdd={add} onSetGroup={setGroup} testId="session-tags" />`

(The tab test ids are `tab-session-practised-…`, so the e2e selector `button[data-testid^="session-practised-"]` still finds only skill chips.)

- [ ] **Step 7: Load the map on the four pages**

`app/learners/[id]/notes/new/page.tsx`: `import { loadSkillMap } from "@/lib/skillmap/load";`; the `Promise.all` becomes

```tsx
  const [tags, weak, previous, targets, map] = await Promise.all([
    loadTags(learner.trackId),
    loadWeakPoints(learner.id, "all"),
    loadLastNote(learner.id),
    loadTargetsView(learner.id),
    loadSkillMap(learner.id),
  ]);
```

and `<SessionNoteForm … map={map} />`.

`app/learners/[id]/results/new/page.tsx`: import `loadSkillMap`; `const [frames, tags, pending, allAssignments, map] = await Promise.all([loadFrames(learner.trackId), loadTags(learner.trackId), loadUntagged(learner.id, { role, memberId: member.id }), loadAssignments(learner.id), loadSkillMap(learner.id)]);`; pass `map={map}` to `<ResultForm>` and `<PendingTags>`.

`app/learners/[id]/assign/page.tsx`: import `loadSkillMap`; `const [tags, frames, assignments, map] = await Promise.all([loadTags(learner.trackId), loadFrames(learner.trackId), loadAssignments(learner.id), loadSkillMap(learner.id)]);`; `<AssignForm … map={map} />`.

`app/review/[episodeId]/page.tsx`: import `loadSkillMap`; the writing lookup becomes `await Promise.all([loadTags(learner.trackId), loadWritingTagKeys(learner.id, view.episode.id), loadSkillMap(learner.id)]).catch(() => null)` and the chips `<WritingTags learnerId={learner.id} episodeId={view.episode.id} tags={writing[0]} saved={writing[1]} map={writing[2]} />` (a failed map lookup leaves the chips out, as before; the review itself is never blocked).

- [ ] **Step 8: Update the existing UI tests**

`tests/unit/tutorWorkUi.test.ts`:
1. add `import { fixtureMap } from "./fixtures/skillMap";` and, after `const LEARNER = …;`, `const map = fixtureMap();`
2. `const props = { learnerId: LEARNER, tags, today: "2026-10-17", minDate: "2026-06-19" };` → `const props = { learnerId: LEARNER, tags, map, today: "2026-10-17", minDate: "2026-06-19" };`
3. `createElement(ResultForm, { learnerId: LEARNER, tags, today: "2026-10-17", minDate: "2026-06-19", frames: [], canClass: true })` → add `map, ` after `tags, `
4. every `tags, isParent:` (3×, PendingTags) → `tags, map, isParent:`
5. `const note = { learnerId: LEARNER, tags, skills:` → `const note = { learnerId: LEARNER, tags, map, skills:`
6. every `createElement(TagChips, { tags, selected` (2×) → `createElement(TagChips, { tags, map, selected`
7. `createElement(WritingTags, { learnerId: LEARNER, episodeId: "e1", tags, saved: ["dang-tu"] })` → add `map` after `saved: ["dang-tu"], `

`tests/unit/practiceUi.test.ts`: add `import { fixtureMap } from "./fixtures/skillMap";` and in the `form` helper add `map: fixtureMap(),` right after `frames: [],`.

(Every existing assertion still holds: all panels are rendered, so `tag-chip-cau-dieu-kien-dao-ngu` and the "(nhãn riêng)" chip are in the markup even when their tab is not the active one; `session-practised-B-W-1` lands in "Chưa xếp mảng".)

- [ ] **Step 9: Run** — `npx vitest run tests/unit/skillMapUi.test.ts tests/unit/tutorWorkUi.test.ts tests/unit/practiceUi.test.ts tests/unit/readingUi.test.ts` → PASS; `npm run typecheck && npm run lint` → clean.

- [ ] **Step 10: Commit**

```bash
git add components/tutor components/practice/AssignForm.tsx app/learners/\[id\]/notes/new/page.tsx app/learners/\[id\]/results/new/page.tsx app/learners/\[id\]/assign/page.tsx app/review/\[episodeId\]/page.tsx tests/unit/skillMapUi.test.ts tests/unit/tutorWorkUi.test.ts tests/unit/practiceUi.test.ts
git commit -m "feat(sm-1): tag pickers, wrong-item selects and 'skills practised today' by domain; a new family tag needs domain + group"
```

---

### Task 8: "Điểm cần chú ý" — 7 domain tiles, detail by domain, "Kỹ năng đọc" inside Đọc

**Files:**
- Create: `components/tutor/DomainTiles.tsx`
- Modify: `app/learners/[id]/weak/page.tsx`, `components/tutor/ReadingReportForm.tsx`, `lib/copy/vi.ts` (`weakPage`)
- Test: `tests/unit/skillMapUi.test.ts` (append)

**Interfaces:**
- Consumes: `groupWeakPoints`, `WeakTile`, `loadSkillMap`, `WeakTable`, `ReadingSkillsTable`, `loadSoft`, `loadReadingSkills`, `WeakWindow`.
- Produces:
  - `<DomainTiles tiles learnerId weeks active />` (server-safe): one link per tile `weak-tile-${key}` → `/learners/:id/weak?weeks=<w>&domain=<key>`, text = name, `weakPage.tileCount(n)` (`weak-tile-count-${key}`), `weakPage.tileWorst(label)` when there is one; last link `weak-tile-all` (`domain=all`); the open tile has `aria-current="page"`.
  - Weak page URL: `?weeks=4|8|all&domain=<grammar…thinking|unassigned|all>`. No `domain` → tiles + hint only. `domain=<key>` → tiles + `weak-detail-<key>` (heading = domain name, `WeakTable` of that domain; for `reading` also `ReadingSkillsTable`). `domain=all` → tiles + `weak-detail-all` (full `WeakTable`, no reading table).
  - After saving a reading report the form goes to `/learners/:id/weak?domain=reading`.

- [ ] **Step 1: Append the failing test** to `tests/unit/skillMapUi.test.ts`

Add imports at the top: `import { DomainTiles } from "@/components/tutor/DomainTiles";`, `import { weakPage } from "@/lib/copy/vi";` (merge with the existing `@/lib/copy/vi` import), `import { groupWeakPoints } from "@/lib/skillmap/group";` (merge), `import type { WeakPoint } from "@/lib/tutorwork/types";` (merge with the `TagInfo` import). Then append:

```ts
describe("DomainTiles", () => {
  const point = (tagKey: string, status: WeakPoint["status"]): WeakPoint => ({
    tagKey, label: tagKey, group: null, sources: 1, bySource: { test: 1, lesson: 0, writing: 0, practice: 0 }, itemsWrong: { test: 1, practice: 0 },
    asked: 0, askedWrong: 0, lastSeen: "2026-10-20", recheckDueOn: null, recheckDue: false, lastRecheck: null, status, events: [],
  });

  it("one tile per domain with how many points need attention and the worst one; links keep the window; 'Xem tất cả' last", () => {
    const tiles = groupWeakPoints(map, [point("dang-tu", "repeat"), point("thanh-ngu", "watch"), point("phat-am", "ok")]);
    const html = render(createElement(DomainTiles, { tiles, learnerId: "L1", weeks: "8", active: "vocab" }));
    for (const k of ["grammar", "vocab", "reading", "listening", "writing", "speaking", "thinking", "all"]) expect(html).toContain(`data-testid="weak-tile-${k}"`);
    expect(html).toContain('href="/learners/L1/weak?weeks=8&amp;domain=grammar"');
    expect(html).toContain('href="/learners/L1/weak?weeks=8&amp;domain=all"');
    expect(html).toContain(weakPage.tileCount(2));
    expect(html).toContain(weakPage.tileWorst("dang-tu"));
    expect(html).toContain(weakPage.tileCount(0)); // speaking: phat-am is "ok"
    expect(html.match(/<a[^>]*data-testid="weak-tile-vocab"[^>]*>/)?.[0]).toContain('aria-current="page"');
    expect(html.match(/<a[^>]*data-testid="weak-tile-grammar"[^>]*>/)?.[0]).not.toContain("aria-current");
  });
});
```

Run: `npx vitest run tests/unit/skillMapUi.test.ts` → FAIL (`DomainTiles` missing).

- [ ] **Step 2: Copy** — in `lib/copy/vi.ts` `weakPage`, after `pendingLink: …,` add:

```ts
  tilesTitle: "Theo mảng",
  tilesHint: "Bấm một mảng để xem từng điểm cần chú ý của mảng đó.",
  tileCount: (n: number) => (n === 0 ? "Chưa có điểm cần chú ý" : `${n} điểm cần chú ý`),
  tileWorst: (label: string) => `Cần chú ý nhất: ${label}`,
  tileAll: "Xem tất cả",
  allTitle: "Tất cả các mảng",
```

- [ ] **Step 3: `components/tutor/DomainTiles.tsx`**

```tsx
import Link from "next/link";
import { weakPage } from "@/lib/copy/vi";
import type { WeakTile } from "@/lib/skillmap/group";
import type { WeakWindow } from "@/lib/tutorwork/schemas";

/** First layer of "Điểm cần chú ý" (SM-1): one tile per domain — how many points need attention and the worst one. Staff only. */
export function DomainTiles({ tiles, learnerId, weeks, active }: { tiles: WeakTile[]; learnerId: string; weeks: WeakWindow; active: string | null }) {
  const href = (d: string) => `/learners/${learnerId}/weak?weeks=${weeks}&domain=${d}`;
  const box = (on: boolean) =>
    `flex min-h-11 h-full flex-col gap-1 rounded-xl border px-4 py-3 ${on ? "border-accent bg-[#E3ECE8]" : "border-line bg-white hover:border-accent"}`;
  return (
    <nav aria-label={weakPage.tilesTitle} className="mt-5" data-testid="weak-tiles">
      <h2 className="text-lg font-semibold">{weakPage.tilesTitle}</h2>
      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.key}>
            <Link href={href(t.key)} aria-current={t.key === active ? "page" : undefined} data-testid={`weak-tile-${t.key}`} className={box(t.key === active)}>
              <span className="font-semibold">{t.name}</span>
              <span className="text-sm" data-testid={`weak-tile-count-${t.key}`}>
                {weakPage.tileCount(t.weakCount)}
              </span>
              {t.worst ? <span className="text-sm text-muted">{weakPage.tileWorst(t.worst.label)}</span> : null}
            </Link>
          </li>
        ))}
        <li>
          <Link href={href("all")} aria-current={active === "all" ? "page" : undefined} data-testid="weak-tile-all" className={box(active === "all")}>
            <span className="font-semibold">{weakPage.tileAll}</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: The weak page** — replace `app/learners/[id]/weak/page.tsx`:

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { DomainTiles } from "@/components/tutor/DomainTiles";
import { ReadingSkillsTable } from "@/components/tutor/ReadingSkillsTable";
import { WeakTable } from "@/components/tutor/WeakTable";
import { learnerWithTrack, resultPage, weakPage } from "@/lib/copy/vi";
import { logAppError } from "@/lib/ops/logAppError";
import { loadReadingSkills } from "@/lib/reading/load";
import { loadSoft } from "@/lib/reading/soft";
import { groupWeakPoints } from "@/lib/skillmap/group";
import { loadSkillMap } from "@/lib/skillmap/load";
import { loadUntagged, loadWeakPoints } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";
import { WEAK_WINDOWS, type WeakWindow } from "@/lib/tutorwork/schemas";

export const dynamic = "force-dynamic";

/**
 * "Điểm cần chú ý" of one child (parent and tutor only): first 7 domain tiles of the skill map (SM-1), then — for ?domain= — the
 * tag × source table of that domain (the "Kỹ năng đọc" table lives in the Đọc domain), over 4 weeks / 8 weeks / all time.
 */
export default async function WeakPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ weeks?: string; domain?: string }> }) {
  const { id } = await params;
  const { weeks, domain } = await searchParams;
  const { member, learner } = await requireLearnerPage(id, "tutorwork:read");
  const window: WeakWindow = (WEAK_WINDOWS as readonly string[]).includes(weeks ?? "") ? (weeks as WeakWindow) : "8";
  const role = member.role === "tutor" ? "tutor" : "parent";
  const [view, pending, map] = await Promise.all([
    loadWeakPoints(learner.id, window),
    loadUntagged(learner.id, { role, memberId: member.id }),
    loadSkillMap(learner.id),
  ]);
  const tiles = groupWeakPoints(map, view.tags);
  const tile = tiles.find((t) => t.key === domain) ?? null;
  const pick = domain === "all" ? "all" : (tile?.key ?? null);
  // Fail soft: the reading table is an add-on of the Đọc tile; if it cannot be read the rest of the page still renders.
  const reading =
    pick === "reading"
      ? await loadSoft(
          () => loadReadingSkills(learner.id),
          (error) => logAppError({ route: "GET /learners/[id]/weak (reading skills)", code: "reading_skills", error, userId: member.userId }),
        )
      : null;

  return (
    <>
      <AppHeader name={member.displayName} showTestBadge={learner.isTest} />
      <main className="mx-auto max-w-5xl px-4 py-10" data-testid="weak-page">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent underline">
          {weakPage.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{weakPage.title(learner.alias)}</h1>
        <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)}</p>
        <p className="mt-3 text-muted">{weakPage.intro}</p>

        <nav aria-label={weakPage.windowLabel} className="mt-5 flex flex-wrap gap-2">
          {WEAK_WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/learners/${learner.id}/weak?weeks=${w}${pick ? `&domain=${pick}` : ""}`}
              aria-current={w === window ? "page" : undefined}
              data-testid={`weak-window-${w}`}
              className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium ${w === window ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`}
            >
              {weakPage.windows[w]}
            </Link>
          ))}
        </nav>

        {pending.length > 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-white px-4 py-3 text-sm" data-testid="weak-pending">
            <Link href={`/learners/${learner.id}/results/new#pending`} className="font-medium text-accent underline">
              {weakPage.pendingLink}
            </Link>{" "}
            · {resultPage.pendingTitle}: {pending.length}
          </p>
        ) : null}

        <DomainTiles tiles={tiles} learnerId={learner.id} weeks={window} active={pick} />

        {pick === null ? (
          <p className="mt-4 text-sm text-muted" data-testid="weak-tiles-hint">
            {weakPage.tilesHint}
          </p>
        ) : (
          <section className="mt-6" data-testid={`weak-detail-${pick}`}>
            <h2 className="text-xl font-semibold">{tile ? tile.name : weakPage.allTitle}</h2>
            <div className="mt-3">
              <WeakTable view={tile ? { ...view, tags: tile.points } : view} />
            </div>
            {pick === "reading" ? <ReadingSkillsTable view={reading} learnerId={learner.id} /> : null}
          </section>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 5: After saving a reading report, open the Đọc tile** — in `components/tutor/ReadingReportForm.tsx` replace

```ts
    router.push(`/learners/${learnerId}/weak`);
```

with

```ts
    router.push(`/learners/${learnerId}/weak?domain=reading`);
```

- [ ] **Step 6: Run** — `npx vitest run tests/unit/skillMapUi.test.ts tests/unit/readingUi.test.ts tests/unit/tutorWorkUi.test.ts` → PASS; `npm run typecheck && npm run lint` → clean.

- [ ] **Step 7: Commit**

```bash
git add components/tutor/DomainTiles.tsx components/tutor/ReadingReportForm.tsx app/learners/\[id\]/weak/page.tsx lib/copy/vi.ts tests/unit/skillMapUi.test.ts
git commit -m "feat(sm-1): 'Điểm cần chú ý' opens with 7 domain tiles; the reading-skills table moves into the Đọc tile"
```

---

### Task 9: End-to-end selectors follow the tabs and tiles (no new e2e file)

**Files:**
- Modify: `tests/e2e/tutorWork.spec.ts`, `tests/e2e/practice.spec.ts`, `tests/e2e/reading.spec.ts`

**Interfaces:**
- Consumes: test ids of Tasks 6–8 (`tab-<testId>-<domain>`, `add-tag-domain`, `add-tag-group`, `weak-tile-<key>`, `?domain=`).

Chips in an inactive tab are in the page but hidden, so a test clicks the tab first.

- [ ] **Step 1: `tests/e2e/tutorWork.spec.ts`**

In "a family tag: '+ nhãn khác' on the session screen creates it and ticks it", between `fill(label)` and the button click, add:

```ts
    await page.getByTestId("add-tag-domain").selectOption("grammar");
    await page.getByTestId("add-tag-group").selectOption("gr-emphasis");
```

In "session note: tags (max 3), …", replace the four tag lines with:

```ts
    await page.getByTestId("tab-session-tags-vocab").click();
    await page.getByTestId("tag-chip-dang-tu").click();
    await page.getByTestId("tag-chip-cum-dong-tu").click();
    await page.getByTestId("tab-session-tags-speaking").click();
    await page.getByTestId("tag-chip-phat-am").click();
    await page.getByTestId("tab-session-tags-vocab").click();
    await expect(page.getByTestId("tag-chip-thanh-ngu")).toBeDisabled(); // 4th is not allowed
    await expect(page.getByTestId("session-tags-chosen")).toContainText("Dạng từ");
```

In "Điểm cần chú ý: the table for the child, with windows; the parent sees it too", replace its first line after `loginAs` —

```ts
    await page.goto(`/learners/${NG}/weak?weeks=all`);
```

— with:

```ts
    await page.goto(`/learners/${NG}/weak?weeks=all`);
    await expect(page.getByTestId("weak-tile-vocab")).toBeVisible();
    await page.getByTestId("weak-tile-all").click();
    await expect(page).toHaveURL(/domain=all/);
```

(the following `weak-table` / `weak-row-` / `weak-window-4` lines stay; the window link keeps `domain=all`).

- [ ] **Step 2: `tests/e2e/practice.spec.ts`**

Before `await page.getByTestId("tag-chip-thanh-ngu").click();` add:

```ts
    await page.getByTestId("tab-assign-tags-vocab").click();
```

Replace

```ts
    await page.goto(`/learners/${NG}/weak?weeks=all`);
```

with

```ts
    await page.goto(`/learners/${NG}/weak?weeks=all&domain=vocab`);
```

- [ ] **Step 3: `tests/e2e/reading.spec.ts`**

Replace

```ts
    await expect(page).toHaveURL(new RegExp(`/learners/${LEARNER_IDS.nguyen}/weak$`));
```

with

```ts
    await expect(page).toHaveURL(new RegExp(`/learners/${LEARNER_IDS.nguyen}/weak\\?domain=reading$`));
```

- [ ] **Step 4: List locally** — `npx playwright test tests/e2e/tutorWork.spec.ts tests/e2e/practice.spec.ts tests/e2e/reading.spec.ts --list` → the same test count as before (they run for real in CI, job "E2E smoke").

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/tutorWork.spec.ts tests/e2e/practice.spec.ts tests/e2e/reading.spec.ts
git commit -m "test(sm-1): e2e selectors follow the domain tabs, the group picker and the weak-page tiles"
```

---

### Task 10: Docs, full checks, review, PR

**Files:**
- Modify: `docs/PROGRESS.md` (new section at the end), `CLAUDE.md` (Current status + next migration number), `docs/DESIGN.md` (new §19.7)

- [ ] **Step 1: `docs/PROGRESS.md`** — append:

```markdown
## SM-1 — Bản đồ kỹ năng (21/10/2026)

Nhánh `feature/skill-map`. Thiết kế `docs/superpowers/specs/2026-10-21-skill-map-levels-design.md` (§2, §5–§8, phần SM-1); kế hoạch `docs/superpowers/plans/2026-10-21-sm1-skill-map.md`. Không AI; học sinh không thấy gì mới.

### Đã thay đổi gì (nói đơn giản)

| Việc | Vì sao | Nằm ở |
|---|---|---|
| **Bản đồ kỹ năng SM-1**: 7 mảng (Ngữ pháp · Từ vựng · Đọc · Nghe · Viết · Nói · Tư duy & tự học), 40 nhóm có mô tả ngắn theo cấp; đủ 40 nhãn và 70 kỹ năng danh mục, mỗi cái đúng 1 nhóm; cấp tham khảo; cấp giả định theo track (An A2 / bậc 1, Nguyên B2 / bậc 2 — chưa hiện, dùng ở SM-2) | Biết con yếu mảng nào; ô chọn không còn danh sách phẳng | `content/skill_map/SM-1.json`, `0019` |
| **Ô chọn nhãn và "Kỹ năng đã luyện hôm nay" theo tab 7 mảng**, có tiêu đề nhóm và ô tìm nhanh; "Đọc hiểu (KET Reading)" của An ẩn khỏi ô chọn (dữ liệu cũ vẫn hiện đúng tên) | Chọn nhanh, đúng chỗ | Ghi buổi học, Ghi kết quả bài, Chờ gắn nhãn, Giao bài luyện, nhãn bài viết |
| **Nhãn riêng bắt buộc chọn mảng + nhóm**; nhãn riêng cũ nằm ở "Chưa xếp mảng" với nút "Xếp vào nhóm" | Mọi nhãn mới vào đúng bản đồ (quyết định M3) | `0019` (`eng_add_error_tag_v2`, `eng_set_tag_group`) |
| **"Điểm cần chú ý" mở đầu bằng 7 ô mảng** (số điểm cần chú ý + điểm nặng nhất); bấm ô → bảng chi tiết của mảng; bảng "Kỹ năng đọc" nằm trong ô Đọc; "Xem tất cả" = bảng cũ | Trả lời "con yếu mảng nào" | trang Điểm cần chú ý |

Bản đồ đã công bố thì **không sửa được** (cơ sở dữ liệu chặn); muốn đổi = bản `SM-2`, phụ huynh duyệt.

### SQL cần áp

- **`db/migrations/0019_skill_map.sql`** — Actions → **Apply database migrations** (gõ APPLY) hoặc dán vào SQL Editor. **Áp `0019` TRƯỚC khi thử preview hoặc gộp PR** (chỉ thêm: 4 bảng cấu hình, 1 cột trống `error_tags.group_key`, 4 hàm mới; hàm cũ `eng_add_error_tag` vẫn chạy → tương thích ngược với `main`). Code mới cần `0019`: chưa áp thì các trang có ô chọn nhãn và trang Điểm cần chú ý sẽ báo lỗi. `0019` cần `0015` và `0018` đã áp (nó tự kiểm và dừng nếu thiếu nhãn). Chạy lại an toàn. Nên bấm chạy tay *Weekly backup* trước khi áp.

### Cách thử trên preview (gia đình thử)

1. Đăng nhập `thu-giasu-nguyen` → Nguyên (thử) → **Ghi buổi học**: "Kỹ năng đã luyện hôm nay" và "Điểm cần củng cố" có tab 7 mảng; bấm tab **Từ vựng** chọn "Dạng từ", tab **Nói** chọn "Phát âm" → dòng "Đang chọn" liệt kê cả hai.
2. Gõ một nhãn mới ("Đảo ngữ thử"): nút thêm chỉ bấm được sau khi chọn **Mảng = Ngữ pháp, Nhóm = Nhấn mạnh & đảo ngữ**; nhãn hiện ở tab Ngữ pháp và đã được tích.
3. **Điểm cần chú ý**: thấy 7 ô + "Xem tất cả"; bấm ô **Từ vựng** → chỉ các điểm từ vựng; bấm ô **Đọc** → thấy bảng "Kỹ năng đọc".
4. Đăng nhập `thu-giasu-an` → An (thử) → **Ghi kết quả bài** → Nhập nhanh, một câu sai: ô chọn nhãn chia theo "Mảng · Nhóm", không có "Đọc hiểu (KET Reading)".

### Đối chiếu với spec — chỗ khác và vì sao

- **Cấp của mảng Tư duy & tự học** lưu bằng `task_from` / `task_to` (bậc 1–4), không phải một số `task_level`: kỹ năng `B-T5-SUPPORT` trải 2 bậc (TL3–TL4).
- **Kỹ năng L7** (nằm ở Tư duy & tự học) chưa có bậc nhiệm vụ, **kỹ năng T1/T2** (ở Đọc / Nghe) chưa có cấp CEFR: danh mục 0.2.1 chỉ ghi thang còn lại; điền ở nội dung v0.3.
- **"Hay dùng lên đầu" chưa làm**: app chưa đếm số lần dùng nhãn; làm cùng bộ lọc ± 1 cấp ở SM-2.
- **SM-1 không vào `config.lock.json` / `gen:config`**: khóa bằng `skill_maps.source_hash` + test so JSON nhúng trong `0019` với file; sửa file sau khi áp → test đỏ → phải làm SM-2.
- **Thêm dòng "Đang chọn: …"** phía trên các tab (một nhãn đã chọn có thể nằm ở tab khác).
- **Điểm cần chú ý**: 7 ô luôn hiện; bảng chi tiết hiện dưới ô đang mở; thêm ô "Xem tất cả" = bảng đầy đủ như trước.

### Để sau (SM-2 / nội dung v0.3)

Lọc ô chọn theo cấp hiện tại ± 1; "hay dùng" lên đầu; Hồ sơ cấp + sổ quyết định cấp + mốc thi ngoài; điểm cốt lõi (`core`) theo cấp; cấp CEFR cho kỹ năng L7 và bậc nhiệm vụ cho T1/T2.

### Tiêu chí đạt

`typecheck`, `lint`, `test` (gồm test database), `gen:config` xanh; CI (gồm E2E và bước áp migration hai lần) xanh; review Opus; gia sư rà `SM-1.json` (bảng xếp 46 kỹ năng trong kế hoạch); phụ huynh áp `0019` rồi làm 4 bước thử ở trên.
```

- [ ] **Step 2: `CLAUDE.md`** — three edits.

In "Current status", add this bullet right after the "Studio 1 · PR A" bullet:

```markdown
- **SM-1 (Bản đồ kỹ năng) — code trên nhánh `feature/skill-map`**, chờ CI + review Opus + phụ huynh duyệt PR; **áp `0019_skill_map.sql` TRƯỚC khi thử preview hoặc gộp** (chỉ thêm; cần 0015 + 0018): bản đồ 7 mảng · 40 nhóm (`content/skill_map/SM-1.json`, bất biến sau công bố → đổi = SM-2), ô chọn nhãn / kỹ năng theo tab mảng, nhãn riêng bắt buộc mảng + nhóm (`eng_add_error_tag_v2`, "Xếp vào nhóm"), Điểm cần chú ý 7 ô mảng. Kế hoạch `docs/superpowers/plans/2026-10-21-sm1-skill-map.md`.
```

In the "Seed cấu hình sinh tự động…" bullet, replace

```markdown
(số kế tiếp, **hiện là 0019** vì 0017 là migration S5c và 0018 là kỹ năng đọc của Studio 1 PR A)
```

with

```markdown
(số kế tiếp, **hiện là 0020** vì 0017 là S5c, 0018 là kỹ năng đọc của Studio 1 PR A và 0019 là bản đồ kỹ năng SM-1)
```

In "Đọc trước khi làm bất cứ việc gì", add after item 6:

```markdown
7. `content/skill_map/SM-1.json` — bản đồ kỹ năng (7 mảng · 40 nhóm); mọi nhãn / kỹ năng mới phải có đúng 1 nhóm.
```

- [ ] **Step 3: `docs/DESIGN.md`** — after §19.6 add:

```markdown
### 19.7. Bản đồ kỹ năng (SM-1, migration 0019)

- **Nguồn:** `content/skill_map/SM-1.json` (7 mảng → 40 nhóm có mô tả theo dải cấp → lá). Migration nhúng nguyên JSON + sha256 (`skill_maps.source_hash`); test so khớp với file. Đã công bố thì bất biến (trigger `eng_forbid_published_change('self')` cho `skill_maps`, `eng_forbid_skill_map_change()` cho ba bảng con; TRUNCATE luôn bị chặn) → đổi = `SM-2`.
- **Bảng:** `skill_maps(id, title_vi, catalogue_version, assumed, source_hash, published_at)`, `skill_domains(map_id, key, ord, name_vi, scale cefr|task_level)`, `skill_groups(map_id, key, domain_key, ord, name_vi, descriptions)`, `skill_leaves(map_id, kind tag|target, track_id, ref_key, group_key, ord, level_from/level_to (9 nấc CEFR) | task_from/task_to (1–4), level_note, core, hidden_in_picker, related text[])`. RLS: thành viên đọc bản đã công bố; không ai ghi trực tiếp.
- **Nhãn riêng:** `error_tags.group_key` (chỉ `origin = 'custom'`). `eng_add_error_tag_v2(p_learner, p_key, p_label, p_group_key, p_by)` bắt buộc nhóm của bản đồ hiện hành (`23514 (unknown_group)`); `eng_set_tag_group(p_learner, p_tag_key, p_group_key, p_by)` xếp nhóm một lần cho nhãn riêng chưa có nhóm (`(already_grouped)`, audit `error_tag.grouped`). `eng_add_error_tag` (0014) giữ nguyên.
- **Đọc:** `eng_skill_map(p_learner)` (service_role, sau `requireAccess`): mảng → nhóm → lá (nhãn có sẵn của track em kể cả lá ẩn, nhãn riêng của gia đình đã có nhóm, mọi kỹ năng danh mục với cờ `in_set`) + `unassigned`. "Điểm cần chú ý" không đổi SQL: `lib/skillmap/group.ts` gộp `eng_weak_points` theo bản đồ.
```

- [ ] **Step 4: Full checks** — `npm run typecheck && npm run lint && npm test && npm run gen:config` → all green (DB tests need local Postgres; `gen:config` does not know SM-1 and must report nothing new).

- [ ] **Step 5: Commit docs**

```bash
git add docs/PROGRESS.md CLAUDE.md docs/DESIGN.md
git commit -m "docs(sm-1): PROGRESS section, status + next migration 0020, DESIGN §19.7"
```

- [ ] **Step 6: Push and CI** — `git push`, then `gh workflow run ci.yml --ref feature/skill-map`; wait for green (E2E included).

- [ ] **Step 7: Opus review** — run the `reviewer` agent on `git diff main...HEAD`; fix findings in new commits; re-run CI.

- [ ] **Step 8: Open the PR** to `main` (`gh api repos/haleytruong89-moon/Enghlish-app/pulls --input pr.json`) with a Vietnamese body: làm gì · cách thử trên preview (4 bước) · **SQL cần phụ huynh áp: 0019 (áp TRƯỚC khi thử preview hoặc gộp)** · chỗ khác spec (bảng Deviations) · tiêu chí đạt/chưa · nhờ gia sư rà `SM-1.json`; ends with the session's PR footer.

---

## Self-review (done while writing this plan)

**Spec coverage (SM-1 only):**

| Spec item | Task |
|---|---|
| §2 7 domains, 40 groups, keys | 1 (JSON + test of all 40 keys), 2 (tables, seed) |
| §2 rule 2 leaves with levels, every leaf in exactly one group | 1 (tests: 40 tags, 70 targets, levels), 2–3 (DB tests) |
| §2 rule 3 placement + the one exception | 1 (rule computed in the test from the catalogue) |
| §2 rule 4 related | 1 (9 pairs), 3 (`related` in `eng_skill_map`) |
| §2 coverage An 17/40, Nguyên 19/40 | 1 |
| §1 M3 new family tag must have domain + group | 3 (v2), 5 (API), 7 (AddTag) |
| §1 M5 `doc-hieu` kept, Đọc · Ý chính & chi tiết, hidden | 1, 2 (DB), 4 (`groupTags` drops it unless kept), 7 |
| §1 P2-a assumed start levels stored | 1 (JSON), 2 (`skill_maps.assumed`), 3 (`eng_skill_map.assumed`) |
| §5 picker by 7 tabs, group headings, quick search, hidden leaves out | 6, 7 |
| §5 "hay dùng" first | not built — no usage data (Deviations) |
| §5 weak page 7 tiles → detail; reading table in Đọc | 8 |
| §6 `skill_maps`, `skill_domains`, `skill_groups`, `skill_leaves`, immutable | 2 |
| §6 `error_tags.group_key`, "Chưa xếp mảng" + set-group function | 3, 5, 6, 7 |
| §6 `eng_skill_map(p_learner)` | 3, 4 |
| §6 weak points: no SQL change, app groups | 4 (`groupWeakPoints`), 8 |
| §7 no student change, no AI, no auto level, no edit of locked content | Global Constraints; no student file is touched |
| §8 risk "xếp lá sai nhóm" → test + tutor review | 1 (tests), plan's 46-skill table, Task 10 PR asks the tutor |
| Gate: mockups approved before UI | 0 |

**Placeholder scan:** the only markers are `__SM1_JSON__` / `__SM1_SHA256__` inside the migration template, which Task 2 Step 4 replaces by a command (deliberate, so the 23 KB JSON is never typed twice); every code and doc step carries its full text.

**Dry run (21/10, while writing the plan):** the code of Tasks 1–9 was applied in a throw-away worktree exactly as written here: `npm run test:unit` 625/625 green (incl. the new files), `typecheck`, `lint` and `gen:config` clean; `tests/db/skillMap.test.ts` (16), `migrations`, `tutorWork`, `config` and `readingSkills` DB tests green on PGlite (Postgres 17, no local Postgres 16 available). The builder must still run the DB suite on the repo's Postgres 16 (`npm run test:db`).

**Type consistency:** `SkillMapView` / `SkillLeaf` (Task 1) are produced by `parseSkillMap` (Task 4) and consumed by `group.ts`, `DomainTabs`, `GroupPicker`, `SetGroupControl`, `AddTag`, `TagChips`, `TagSelect`, `DomainTiles`; `AddTagFn` is `(label, groupKey)` everywhere (useTags, AddTag, TagChips, TagSelect, PendingTags); `SetGroupFn` is defined in `SetGroupControl.tsx` and returned by `useTags`; store args `groupKey` / `tagKey` match the handlers and the RPC parameter names `p_group_key` / `p_tag_key` of 0019.

---

## Amendments — parent, 22/10/2026 (mockups approved the same day)

Do Tasks 11 and 12 together with Tasks 6–9; Task 10 (docs, checks, review, PR) runs last and must also cover them.

### Task 11: The app is always light, even when the device uses a dark theme

Why: the parent wants every screen light on Windows/phones set to dark mode, including browsers that force-darken pages (Chrome/Edge "auto dark"). `color-scheme: only light` opts out of forced darkening and keeps native controls (inputs, selects, scrollbars, date pickers) light.

**Files:**
- Modify: `app/layout.tsx` (viewport)
- Modify: `app/globals.css`
- Test: `tests/unit/lightOnly.test.ts` (new)
- Test: add one test to an existing Playwright spec (the smoke/home spec); no new e2e file

**Interfaces:** none (styling only).

- [ ] **Step 1: Write the failing unit test** — `tests/unit/lightOnly.test.ts`

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("always-light theme", () => {
  it("declares only-light in the viewport (meta color-scheme)", () => {
    expect(read("app/layout.tsx")).toMatch(/colorScheme:\s*"only light"/);
  });
  it("declares only-light on :root and keeps form controls light", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*only light/);
    expect(css).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*background-color:\s*#ffffff/);
  });
  it("has no dark-mode variants anywhere in app/ or components/", () => {
    // Guard: nobody adds dark: classes or a prefers-color-scheme: dark block later.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const out = execSync("grep -rlE 'dark:|prefers-color-scheme:\\s*dark' app components || true", { encoding: "utf8" });
    expect(out.trim()).toBe("");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run tests/unit/lightOnly.test.ts`: the first two tests fail).

- [ ] **Step 3: Implement**

`app/layout.tsx` — add one line to `viewport`:

```ts
export const viewport: Viewport = {
  themeColor: "#F4F5F0",
  colorScheme: "only light",
  width: "device-width",
  initialScale: 1,
};
```

`app/globals.css` — add after the `@theme` block:

```css
/* Always light (parent, 22/10/2026): also opts out of browser "auto dark" (forced darkening). */
:root {
  color-scheme: only light;
}

input,
select,
textarea {
  background-color: #ffffff;
  color: var(--color-ink);
}
```

- [ ] **Step 4: Add the e2e check** to the existing smoke spec (the file that already opens the login page), as its own `test.describe` block:

```ts
test.describe("dark device theme", () => {
  test.use({ colorScheme: "dark" });
  test("login page stays light", async ({ page }) => {
    await page.goto("/login");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(244, 245, 240)");
    const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(scheme).toBe("only light");
  });
});
```

(Use the spec's existing imports; if the login route differs, use the route the spec already visits.)

- [ ] **Step 5: Run** `npx vitest run tests/unit/lightOnly.test.ts` → PASS; `npm run typecheck && npm run lint`; `npx playwright test --list` shows the new test.

- [ ] **Step 6: Commit** — `feat(ui): always-light theme, opt out of forced dark mode`

### Task 12: No "TOMO" in any user-facing text

Why: the reading-skill list stays (same 14 / 6 skills), but the parent plans to have tutors assign work and AI grade against these criteria, so the UI must not tie them to one provider. Stored data is unchanged: `reading_reports.source = 'TOMO'` stays as a data value (no migration).

**Files:**
- Modify: `lib/copy/vi.ts` (reading-report intro, ~line 957, and any copy added in Tasks 6–9)
- Test: `tests/unit/copyNoProvider.test.ts` (new)

- [ ] **Step 1: Failing test** — `tests/unit/copyNoProvider.test.ts`

```ts
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("no provider name in UI text", () => {
  it("lib/copy/vi.ts never says TOMO", () => {
    const vi = readFileSync(new URL("../../lib/copy/vi.ts", import.meta.url), "utf8");
    expect(vi).not.toMatch(/tomo/i);
  });
  it("no component or page renders a literal TOMO", () => {
    const out = execSync("grep -rIl --include=*.tsx -i 'tomo' app components || true", { encoding: "utf8" });
    expect(out.trim()).toBe("");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (vi.ts line ~957 says "(TOMO)").

- [ ] **Step 3: Implement** — reading-report intro becomes:

```ts
  intro: "Nhập số câu và % đúng của từng kỹ năng theo báo cáo đọc trong tháng. Dòng để trống (hoặc số câu = 0) = tháng này không có câu.",
```

Also check the weak page / Đọc tile copy written in Task 8 says only "Kỹ năng đọc" (e.g. "Kỹ năng đọc (báo cáo tháng + bài trong app)"), and that no component prints `report.source`. Code comments in `lib/reading/*` may keep "TOMO" (not user-facing).

- [ ] **Step 4: Run** `npx vitest run tests/unit/copyNoProvider.test.ts` → PASS.

- [ ] **Step 5: Commit** — `fix(copy): reading skills UI does not name a provider`
