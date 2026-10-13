import { describe, expect, it } from "vitest";
import type { AccessStore, Learner, Member, Relationship } from "@/lib/auth/requireAccess";
import { loadConfig } from "@/lib/config/content";
import { levelLabels, skillNames } from "@/lib/copy/vi";
import { authorizeTargetsPage } from "@/lib/targets/access";
import {
  buildTargetsView,
  pickCurrentAssignment,
  targetTitle,
  type DefinitionInput,
} from "@/lib/targets/view";

const cfg = loadConfig();
const toInputs = () => ({
  targets: cfg.catalogue.targets.map((t) => ({ id: t.id, titleVi: t.title_vi, dimensionId: t.dimension_id })),
  dimensions: cfg.catalogue.dimensions.map((d) => ({ id: d.id, nameVi: d.name_vi })),
  aggregates: cfg.catalogue.aggregate_indicators.map((a) => ({ id: a.id, definitionVi: a.definition_vi })),
});
const definition = (id: string): DefinitionInput => {
  const s = cfg.targetSets.find((x) => x.id === id);
  if (!s) throw new Error(`no set ${id}`);
  return {
    id: s.id,
    version: s.version,
    descriptorVersion: cfg.catalogue.meta.descriptor_version,
    catalogueVersion: cfg.catalogue.meta.version,
    targetIds: s.target_ids,
    trackingOnly: s.tracking_only,
  };
};

describe("pickCurrentAssignment", () => {
  const d = (iso: string) => new Date(iso);
  const now = d("2026-11-01T00:00:00Z");

  it("takes the latest effective_from that is not in the future", () => {
    const rows = [
      { definitionId: "A-v1", effectiveFrom: d("2026-10-13T00:00:00Z"), createdAt: d("2026-10-13T00:00:00Z") },
      { definitionId: "A-v2", effectiveFrom: d("2026-10-30T00:00:00Z"), createdAt: d("2026-10-30T00:00:00Z") },
      { definitionId: "A-v3", effectiveFrom: d("2026-12-01T00:00:00Z"), createdAt: d("2026-10-31T00:00:00Z") },
    ];
    expect(pickCurrentAssignment(rows, now)?.definitionId).toBe("A-v2");
  });

  it("breaks ties by creation time, and returns null when nothing is effective yet", () => {
    const same = d("2026-10-13T00:00:00Z");
    const rows = [
      { definitionId: "old", effectiveFrom: same, createdAt: d("2026-10-13T00:00:00Z") },
      { definitionId: "new", effectiveFrom: same, createdAt: d("2026-10-13T00:00:01Z") },
    ];
    expect(pickCurrentAssignment(rows, now)?.definitionId).toBe("new");
    expect(pickCurrentAssignment(rows, d("2026-01-01T00:00:00Z"))).toBeNull();
    expect(pickCurrentAssignment([], now)).toBeNull();
  });
});

describe("buildTargetsView", () => {
  const { targets, dimensions, aggregates } = toInputs();

  it("Track A: 12 rows in set order, staff names from the UX guide, level = not enough work yet", () => {
    const view = buildTargetsView(definition("A-v1"), targets, dimensions, aggregates);
    expect(view.rows).toHaveLength(12);
    expect(view.rows.map((r) => r.id)).toEqual(definition("A-v1").targetIds);
    expect(view.rows[0]?.title).toBe(skillNames["A-L3-CAUSE-S"]?.staff);
    for (const r of view.rows) {
      expect(r.levelLabel).toBe(levelLabels.NOT_OBSERVED.label);
      expect(r.dimensionName.length).toBeGreaterThan(0);
    }
  });

  it("no row title shows a code, and none shows a score", () => {
    for (const id of ["A-v1", "B-v1"]) {
      const view = buildTargetsView(definition(id), targets, dimensions, aggregates);
      for (const r of view.rows) {
        expect(r.title, r.id).not.toMatch(/\b[AB]-[LTAX]\d/);
        expect(r.title, r.id).not.toMatch(/\d\/4/);
      }
    }
  });

  it("Track B: titles fall back to the catalogue Vietnamese title", () => {
    const view = buildTargetsView(definition("B-v1"), targets, dimensions, aggregates);
    expect(view.rows).toHaveLength(12);
    const exam = view.rows.find((r) => r.id === "B-T1-EXAM-R");
    expect(exam?.title).toBe(targetTitle({ id: "B-T1-EXAM-R", titleVi: "Đọc hiểu đoạn văn dạng đề thi vào 10", dimensionId: "T1" }));
    expect(exam?.title).toBe("Đọc hiểu đoạn văn dạng đề thi vào 10");
  });

  it("tracking-only items are separate from the rows (not in the denominator)", () => {
    const a = buildTargetsView(definition("A-v1"), targets, dimensions, aggregates);
    expect(a.trackingOnly.map((t) => t.id)).toEqual(["A1", "A3", "A5"]);
    const b = buildTargetsView(definition("B-v1"), targets, dimensions, aggregates);
    expect(b.trackingOnly.map((t) => t.id)).toEqual(["AGG-B-EXAM-MOCK", "AGG-B-L1-ERRORS"]);
    for (const view of [a, b]) {
      const rowIds = new Set(view.rows.map((r) => r.id));
      for (const t of view.trackingOnly) expect(rowIds.has(t.id)).toBe(false);
      expect(view.rows).toHaveLength(12);
    }
  });

  it("skips (never invents) a target that is missing from the loaded data", () => {
    const view = buildTargetsView(definition("A-v1"), targets.slice(1), dimensions, aggregates);
    expect(view.rows.length).toBeLessThanOrEqual(12);
    expect(view.rows.every((r) => r.title.length > 0)).toBe(true);
  });
});

describe("authorizeTargetsPage (parent/tutor only; 404 outside scope)", () => {
  const FAMILY = "f0000000-0000-4000-8000-000000000001";
  const AN = "a0000000-0000-4000-8000-000000000001";
  const NGUYEN = "b0000000-0000-4000-8000-000000000001";
  const NOW = new Date("2026-10-13T08:00:00Z");

  const mk = (key: string, role: Member["role"]): Member => ({
    id: `m-${key}`, userId: `u-${key}`, familyId: FAMILY, role, displayName: key,
  });
  const members = [mk("parent", "parent"), mk("tutorAn", "tutor"), mk("tutorNguyen", "tutor"), mk("studentAn", "student")];
  const learners: Learner[] = [
    { id: AN, familyId: FAMILY, memberId: "m-studentAn", alias: "An", trackId: "A", isTest: true, status: "active" },
    { id: NGUYEN, familyId: FAMILY, memberId: null, alias: "Nguyên", trackId: "B", isTest: true, status: "active" },
  ];
  const rels: Relationship[] = [
    { memberId: "m-tutorAn", learnerId: AN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
    { memberId: "m-tutorNguyen", learnerId: NGUYEN, relation: "tutor", validFrom: new Date("2026-01-01"), validTo: null },
  ];
  const store: AccessStore = {
    getMemberByUserId: async (u) => members.find((m) => m.userId === u) ?? null,
    getLearner: async (id) => learners.find((l) => l.id === id) ?? null,
    getRelationships: async (m, l) => rels.filter((r) => r.memberId === m && r.learnerId === l),
  };
  const deps = { store, allowRealLearners: false, now: NOW };
  const kind = async (user: string | null, learnerId: string) =>
    (await authorizeTargetsPage(user ? { id: `u-${user}` } : null, learnerId, deps)).kind;

  it("signed-out → login", async () => {
    expect(await kind(null, AN)).toBe("login");
  });

  it("parent sees both children; each tutor only their own learner", async () => {
    expect(await kind("parent", AN)).toBe("ok");
    expect(await kind("parent", NGUYEN)).toBe("ok");
    expect(await kind("tutorAn", AN)).toBe("ok");
    expect(await kind("tutorAn", NGUYEN)).toBe("not-found");
    expect(await kind("tutorNguyen", AN)).toBe("not-found");
  });

  it("students never get the page, not even for themselves", async () => {
    expect(await kind("studentAn", AN)).toBe("not-found");
    expect(await kind("studentAn", NGUYEN)).toBe("not-found");
  });

  it("malformed ids and unknown users → not-found", async () => {
    expect(await kind("parent", "not-a-uuid")).toBe("not-found");
    expect(await kind("nobody", AN)).toBe("not-found");
  });
});
