# L2 · Tiến độ tự chạy Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work the child sends moves the Unit to "Đang học" by itself (and the child's mountain with it); "Đã học" stays the tutor's, proposed by a one-click card when the Unit is done well enough.

**Architecture:** Derived, not stored: SQL `eng_unit_auto_events` gives, per Unit, the newest work sent while the adult had left it not started; the app merges these as events (`mergeAutoEvents`) wherever Unit statuses are computed; the child's `eng_my_roadmap` merges them in SQL. A results rule adds the `unit_ready` card.

**Tech Stack:** Postgres (migration 0044, functions only), Next.js, TypeScript, Vitest (unit + db).

**Spec:** Parent approval 26/11 08:40 ("ok") of cách B (prototype https://claude.ai/artifact/Jtag5Rp1ESBRn7rMvRd1E9): auto "Đang học", "Đã học" one click at ≥ 60 %, Unit inferred from the title for tests without Units. DOMAIN §5.1 bản 0.11.

## Global Constraints

- Never down, never over the adult; coverage counts only adult "Đã học". Child sees no score / % / count.
- Migration additive, idempotent, ends with its schema_migrations insert; needs 0043. Copy in `lib/copy/vi.ts`.

---

- [x] **Task 1 — SQL 0044** (`db/migrations/0044_unit_progress_auto.sql`; test `tests/db/unitAuto.test.ts`, `tests/unit/migration0044.test.ts`): `eng_unit_auto_events`, `eng_unit_auto`, `eng_my_roadmap` = 0031 + auto.
- [x] **Task 2 — merge in the app** (`lib/curriculum/progress.ts` `mergeAutoEvents`, `curriculumProgress(…, auto)` + `autoOf`; `lib/curriculum/shape.ts` / `load.ts` `loadUnitAuto`; `lib/roadmap/shape.ts` / `load.ts`); tests `curriculumProgress.test.ts`, `roadmapAuto.test.ts`.
- [x] **Task 3 — labels** (`UnitStatusTable` `autoOf` badge; rule line on the Trạng thái Unit page; `curriculumCopy.autoBadge` / `autoRule`); test `l2Ui.test.ts`.
- [x] **Task 4 — "có thể Đã học" card** (`lib/results/actions.ts` `unit_ready` with `unitStatus` / `unsent` from `lib/results/load.ts`; `components/results/UnitDoneButton.tsx`; copy `resultsCopy.cards.unit_ready`); tests `results.test.ts`, `l2Ui.test.ts`.
- [x] **Task 5 — docs, review, PR** (DOMAIN §5.1, DESIGN §19.37, UX guide, PROGRESS; reviewer; PR with SQL 0044 to apply after 0043).
