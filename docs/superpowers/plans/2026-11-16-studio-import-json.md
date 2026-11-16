# Studio · Nhập bài soạn sẵn (.json) + "Đã xem ✓" Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tutor or parent of a child picks one or more pre-made Studio draft files (`.json`, made outside the app) on "Tạo bài từ đề". Each file becomes a normal Studio **draft** that is reviewed and approved on "Duyệt đề" as usual. No AI call and no SQL. A "Đã xem ✓" button on each flagged question clears its "Cần xem" flag.

**Architecture:** The handler reuses the two existing database functions of migration 0024:
- `eng_create_studio_draft` with `p_extract=false` (the "Soạn tay" path) creates an empty draft;
- `eng_save_studio_draft` stores the file's payload into it.

A new framework-free handler `handleImportDraft` in `lib/studio/handlers.ts` works as follows:
- It checks access first, then the file shape (zod), then that the file's track matches the child's track.
- It derives a deterministic `client_id` from the file content, so importing the same file again opens the same draft (`eng_create_studio_draft` replays).
- If an earlier import stopped between "create" and "save", the next import finishes it.
- If that draft was discarded, it creates a fresh one with a numbered `client_id`.

The browser reads each file, `JSON.parse`s it and POSTs one file per request to a new route. It then shows one result row per file.

**Tech Stack:** Next.js App Router route handler · TypeScript strict · zod 4 · Vitest (unit = node, dom = jsdom + @testing-library/react 16) · existing `lib/studio/*`.

**Spec:** Approved in chat 16/11 (Nhập bài soạn sẵn, 6 points: (1) gap/word_form keys are auto-checked → tutor checks them before Duyệt; (2) "Đã xem ✓" on flagged items; (3) book page in part names (file content, not code); (4) wrong-track refusal; (5) re-import = same draft, finish a half import; (6) one result row per file). Out of scope (told to the parent): Studio assignments counting toward curriculum coverage (needs SQL); one-click assigning of several drafts. Reference code: `lib/studio/handlers.ts` (`handleCreateDraft`, `handleSaveDraft`), `db/migrations/0024_studio_b1.sql` §3g / §3i.

## Global Constraints

- **No migration, no SQL.** Only the existing functions `eng_create_studio_draft`, `eng_studio_draft`, `eng_save_studio_draft` (via the existing `StudioStore`).
- **No AI call** on this path (no `aiGate`, no `logAiRun`, no `schedule`).
- `requireAccess` / `guard(deps, learnerId, "studio:write")` runs **first** in the handler (401 / 403 / 404 as elsewhere).
- Track is configuration: compare `file.track !== learner.trackId`. Never write `track === 'A'` / `'B'` literals (lint blocks it).
- Every UI string comes from `lib/copy/vi.ts`. The teaching person is `tutorHonorific`; adults only (the child sees nothing new).
- The browser never imports `node:crypto` or any server module. Hashing happens in the handler only.
- The file is stored only after it passes `studioDraftSchema` (the strict schema of stored drafts). Drafts with **blocking** validator issues are still imported, with the count reported, because the tutor fixes them in "Duyệt đề". A file that fails the **schema** is refused.
- Commit messages in English, ending with the attribution lines of the session. Branch `feature/studio-import-json`; one PR; `npm run typecheck && npm run lint && npm test` green before the PR; agent `reviewer` before opening the PR.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `lib/studio/importFile.ts` | Create | Pure (browser-safe) file format: constants, zod schema, type. |
| `lib/studio/requests.ts` | Modify | `importDraftBodySchema` (body = `{ file }`). |
| `lib/studio/handlers.ts` | Modify | `handleImportDraft` (+ `IMPORT_MAX_TRIES`). |
| `app/api/learners/[id]/studio/imports/route.ts` | Create | POST → `handleImportDraft`. |
| `lib/studio/importClient.ts` | Create | Browser: read one file, send it, turn the answer into a result row. |
| `components/ui/FilePicker.tsx` | Modify | Optional `multiple` + `onPickMany`. |
| `components/studio/ImportForm.tsx` | Create | The "Nhập bài soạn sẵn" card with result rows. |
| `app/studio/new/page.tsx` | Modify | Render `ImportForm` between `UploadForm` and the draft list. |
| `components/studio/ItemCard.tsx` | Modify | "Đã xem ✓" button on a flagged item. |
| `lib/copy/vi.ts` | Modify | `studioImportCopy`, `studioCopy.markSeen`. |
| `tests/unit/studioImport.test.ts` | Create | Schema + handler tests. |
| `tests/dom/studioImportForm.test.tsx` | Create | Form: picks several files, bad JSON not sent, one row per file. |
| `tests/dom/studioItemCardSeen.test.tsx` | Create | "Đã xem ✓" clears the flag. |
| `docs/STUDIO_IMPORT_FORMAT.md` | Create | The file format for whoever makes the files outside the app. |
| `docs/PROGRESS.md`, `docs/DESIGN.md`, `CLAUDE.md` | Modify | Slice notes, §19.26, status line. |

---

### Task 1: File format (pure)

**Files:**
- Create: `lib/studio/importFile.ts`
- Modify: `lib/studio/requests.ts` (append)
- Test: `tests/unit/studioImport.test.ts`

**Interfaces:**
- Produces: `STUDIO_IMPORT_FORMAT = "learning-os.studio-draft"`, `STUDIO_IMPORT_VERSION = 1`, `STUDIO_IMPORT_MAX_BYTES = 1_000_000`, `studioImportFileSchema`, `type StudioImportFile = { format; version; track: string; title: string; payload: StudioDraft }`, `importDraftBodySchema = z.strictObject({ file: z.unknown() })`.

- [ ] **Step 1: Write the failing test** (create `tests/unit/studioImport.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { studioImportFileSchema, STUDIO_IMPORT_FORMAT } from "@/lib/studio/importFile";
import type { StudioDraft } from "@/lib/studio/schema";

export const CLEAN: StudioDraft = {
  parts: [{ key: "E", name: "E · Phrasal verbs · tr.115", instructions: "Complete the sentences." }],
  passages: [],
  items: [
    { n: 1, part: "E", kind: "gap", out_of_app: false, stem: "Break these outgoings ____ into essentials.", options: [], passage_ref: null, key: "down", accepted: [],
      tag_key: "cum-dong-tu", target_id: null, reading_skill_key: null, explanation_vi: "break down = chia nhỏ", needs_review: false, review_reason: null },
    { n: 2, part: "E", kind: "mcq", out_of_app: false, stem: "She ____ her savings.", options: [{ letter: "A", text: "dipped into" }, { letter: "B", text: "dipped out" }],
      passage_ref: null, key: "A", accepted: [], tag_key: "cum-dong-tu", target_id: null, reading_skill_key: null, explanation_vi: "dip into = rút ra dùng",
      needs_review: true, review_reason: "Kiểm lại đáp án với sách." },
  ],
};
export const FILE_B = { format: STUDIO_IMPORT_FORMAT, version: 1, track: "B", title: "Destination C1&C2 · Unit 14 · Phrasal verbs (E–G)", payload: CLEAN };

describe("Studio import file format", () => {
  it("accepts a well-formed file and refuses anything else", () => {
    expect(studioImportFileSchema.safeParse(FILE_B).success).toBe(true);
    expect(studioImportFileSchema.safeParse({ ...FILE_B, format: "other" }).success).toBe(false);
    expect(studioImportFileSchema.safeParse({ ...FILE_B, version: 2 }).success).toBe(false);
    expect(studioImportFileSchema.safeParse({ ...FILE_B, track: "b" }).success).toBe(false);
    expect(studioImportFileSchema.safeParse({ ...FILE_B, title: " " }).success).toBe(false);
    expect(studioImportFileSchema.safeParse({ ...FILE_B, extra: 1 }).success).toBe(false);
    // the payload is the strict stored-draft schema: an unknown item field is refused
    const bad = { ...FILE_B, payload: { ...CLEAN, items: [{ ...CLEAN.items[0], score: 1 }] } };
    expect(studioImportFileSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit tests/unit/studioImport.test.ts`
Expected: FAIL, because the module `@/lib/studio/importFile` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

`lib/studio/importFile.ts`:

```ts
/**
 * "Nhập bài soạn sẵn": the file format of a Studio draft made outside the app (docs/STUDIO_IMPORT_FORMAT.md). Pure and browser-safe:
 * the browser only reads the size limit; the server parses the file with the strict stored-draft schema.
 */
import { z } from "zod";
import { STUDIO_LIMITS, studioDraftSchema } from "./schema";

export const STUDIO_IMPORT_FORMAT = "learning-os.studio-draft";
export const STUDIO_IMPORT_VERSION = 1;
/** Largest file the browser sends (a 300-item draft is far below this). */
export const STUDIO_IMPORT_MAX_BYTES = 1_000_000;

export const studioImportFileSchema = z.strictObject({
  format: z.literal(STUDIO_IMPORT_FORMAT),
  version: z.literal(STUDIO_IMPORT_VERSION),
  /** The track id the file was made for; must equal the child's track. */
  track: z.string().regex(/^[A-Z]$/),
  title: z.string().trim().min(1).max(STUDIO_LIMITS.title),
  payload: studioDraftSchema,
});
export type StudioImportFile = z.infer<typeof studioImportFileSchema>;
```

Append to `lib/studio/requests.ts`:

```ts
/** "Nhập bài soạn sẵn": one file per request; its content is parsed by the handler (studioImportFileSchema) to tell a bad file from a bad body. */
export const importDraftBodySchema = z.strictObject({ file: z.unknown() });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project unit tests/unit/studioImport.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add lib/studio/importFile.ts lib/studio/requests.ts tests/unit/studioImport.test.ts
git commit -m "feat(studio): file format of pre-made drafts (Nhap bai soan san)"
```

---

### Task 2: Handler `handleImportDraft`

**Files:**
- Modify: `lib/studio/handlers.ts` (imports at the top; new section after `handleEditApproved`)
- Test: `tests/unit/studioImport.test.ts` (append)

**Interfaces:**
- Consumes: `studioImportFileSchema` (Task 1), `importDraftBodySchema` (Task 1). Existing: `guard`, `fail`, `fromStudioDbError`, `parseDraft`, `validateDraft`, `blockingIssues`, `StudioStore.createDraft / draft / saveDraft`.
- Produces: `export async function handleImportDraft(deps: StudioDeps, learnerId: string, raw: unknown): Promise<HandlerResult>`, `export const IMPORT_MAX_TRIES = 9`.
  - Success body: `{ id: string; status: DraftStatus; replayed: boolean; title: string; items: number; needs_review: number; blocking: number }`. Status 201 = new draft filled now; 200 = an earlier import (filled now or before).
  - Error bodies use `error`:
    - 400 `invalid_body`;
    - 400 `import_bad_file`;
    - 400 `import_wrong_track` with `file_track` and `learner_track`;
    - 409 `import_renamed` (the same file was imported and the draft was renamed since);
    - 409 `import_too_many` (discarded 9 times);
    - other 4xx from `fromStudioDbError`.

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/studioImport.test.ts`)

First copy the access and store setup from `tests/unit/studioHandlers.test.ts` lines 1–91: the constants `FAMILY, AN, NGUYEN, DRAFT, FILE`, `mk`, `members`, `learners`, `rels`, `access`, `DRAFT_ROW`, `GATE_ON`, `store()`, `deps()`.
- Import `CTX_B` from `./fixtures/studio`, `EMPTY_DRAFT` from `@/lib/studio/schema`, and `handleImportDraft, type StudioDeps, type StudioStore` from `@/lib/studio/handlers`.
- Drop the `FAKE_EXTRACT` / `normalizeExtract` lines and set `payload: EMPTY_DRAFT` in `DRAFT_ROW` instead.
- Then add:

```ts
import { createHash } from "node:crypto";
import { ReviewDbError } from "@/lib/review/handlers";

const EMPTY_ROW = { ...DRAFT_ROW, status: "draft", payload: EMPTY_DRAFT };
const FULL_ROW = { ...DRAFT_ROW, status: "draft", payload: CLEAN };
const hashOf = (f: unknown) => createHash("sha256").update(JSON.stringify(studioImportFileSchema.parse(f))).digest("hex").slice(0, 32);

describe("handleImportDraft (Nhập bài soạn sẵn)", () => {
  it("access first: student 403, the other child's tutor 404, nobody 401; nothing is written", async () => {
    const s = store();
    expect((await handleImportDraft(deps("studentNguyen", s), NGUYEN, { file: FILE_B })).status).toBe(403);
    expect((await handleImportDraft(deps("tutorAn", s), NGUYEN, { file: FILE_B })).status).toBe(404);
    expect((await handleImportDraft(deps(null, s), NGUYEN, { file: FILE_B })).status).toBe(401);
    expect(s.createDraft).not.toHaveBeenCalled();
  });

  it("refuses a bad body, a bad file and a file of the other track before writing", async () => {
    const s = store();
    expect((await handleImportDraft(deps("tutorNguyen", s), NGUYEN, "x")).body).toMatchObject({ error: "invalid_body" });
    expect((await handleImportDraft(deps("tutorNguyen", s), NGUYEN, { file: { ...FILE_B, version: 2 } })).body).toMatchObject({ error: "import_bad_file" });
    const wrong = await handleImportDraft(deps("tutorAn", s), AN, { file: FILE_B });
    expect(wrong).toMatchObject({ status: 400, body: { error: "import_wrong_track", file_track: "B", learner_track: "A" } });
    expect(s.createDraft).not.toHaveBeenCalled();
  });

  it("new file: a manual draft (no AI) with a content-based client id, then the payload saved on the draft's own time", async () => {
    const s = store({
      createDraft: vi.fn(async () => ({ id: DRAFT, status: "draft", replayed: false })),
      draft: vi.fn(async () => EMPTY_ROW),
    });
    const d = deps("parent", s);
    const r = await handleImportDraft(d, NGUYEN, { file: FILE_B });
    expect(r).toMatchObject({ status: 201, body: { id: DRAFT, status: "draft", replayed: false, title: FILE_B.title, items: 2, needs_review: 1, blocking: 0 } });
    expect(s.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      learnerId: NGUYEN, title: FILE_B.title, testFile: null, keyFile: null, extract: false, byMemberId: "m-parent", clientId: `imp-${hashOf(FILE_B)}`,
    }));
    expect(s.saveDraft).toHaveBeenCalledWith({ draftId: DRAFT, title: FILE_B.title, payload: CLEAN, base: EMPTY_ROW.updated_at, byMemberId: "m-parent" });
    expect(s.aiGate).not.toHaveBeenCalled();
    expect(s.logAiRun).not.toHaveBeenCalled();
    expect(d.jobs).toHaveLength(0);
  });

  it("same file again: the same draft; a half import (empty draft) is finished, a full one is left alone", async () => {
    const half = store({ createDraft: vi.fn(async () => ({ id: DRAFT, status: "draft", replayed: true })), draft: vi.fn(async () => EMPTY_ROW) });
    expect(await handleImportDraft(deps("tutorNguyen", half), NGUYEN, { file: FILE_B })).toMatchObject({ status: 200, body: { replayed: true, status: "draft" } });
    expect(half.saveDraft).toHaveBeenCalledTimes(1);

    const full = store({ createDraft: vi.fn(async () => ({ id: DRAFT, status: "draft", replayed: true })), draft: vi.fn(async () => FULL_ROW) });
    expect(await handleImportDraft(deps("tutorNguyen", full), NGUYEN, { file: FILE_B })).toMatchObject({ status: 200, body: { replayed: true, status: "draft" } });
    expect(full.saveDraft).not.toHaveBeenCalled();

    const approved = store({ createDraft: vi.fn(async () => ({ id: DRAFT, status: "approved", replayed: true })), draft: vi.fn(async () => ({ ...FULL_ROW, status: "approved" })) });
    expect(await handleImportDraft(deps("tutorNguyen", approved), NGUYEN, { file: FILE_B })).toMatchObject({ status: 200, body: { status: "approved", replayed: true } });
    expect(approved.saveDraft).not.toHaveBeenCalled();
  });

  it("a discarded earlier import: a fresh draft under the next numbered client id", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ id: DRAFT, status: "discarded", replayed: true })
      .mockResolvedValueOnce({ id: DRAFT, status: "draft", replayed: false });
    const s = store({ createDraft: create, draft: vi.fn(async () => EMPTY_ROW) });
    expect((await handleImportDraft(deps("tutorNguyen", s), NGUYEN, { file: FILE_B })).status).toBe(201);
    expect(create.mock.calls.map((c) => (c[0] as { clientId: string }).clientId)).toEqual([`imp-${hashOf(FILE_B)}`, `imp-${hashOf(FILE_B)}-2`]);
    const always = store({ createDraft: vi.fn(async () => ({ id: DRAFT, status: "discarded", replayed: true })) });
    expect((await handleImportDraft(deps("tutorNguyen", always), NGUYEN, { file: FILE_B })).body).toMatchObject({ error: "import_too_many" });
    expect(always.createDraft).toHaveBeenCalledTimes(9);
  });

  it("renamed since the first import → import_renamed; blocking issues are reported, not refused", async () => {
    const renamed = store({ createDraft: vi.fn(async () => { throw new ReviewDbError("23505", "eng_create_studio_draft: client_id was already used for another draft"); }) });
    expect(await handleImportDraft(deps("tutorNguyen", renamed), NGUYEN, { file: FILE_B })).toMatchObject({ status: 409, body: { error: "import_renamed" } });

    const noKey = { ...FILE_B, payload: { ...CLEAN, items: [{ ...CLEAN.items[0]!, key: null }, CLEAN.items[1]!] } };
    const s = store({ createDraft: vi.fn(async () => ({ id: DRAFT, status: "draft", replayed: false })), draft: vi.fn(async () => EMPTY_ROW) });
    expect(await handleImportDraft(deps("tutorNguyen", s), NGUYEN, { file: noKey })).toMatchObject({ status: 201, body: { blocking: 1 } });
    expect(s.saveDraft).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/studioImport.test.ts`
Expected: FAIL, because `handleImportDraft` is not exported from `@/lib/studio/handlers`.

- [ ] **Step 3: Write the implementation**

In `lib/studio/handlers.ts`:
- add `import { createHash } from "node:crypto";` as the first import;
- add `importDraftBodySchema` to the existing `./requests` import list;
- add `import { studioImportFileSchema } from "./importFile";`.

Then add after `handleEditApproved`:

```ts
// ---- Nhập bài soạn sẵn (a draft made outside the app; no AI, no SQL) -------------------------------------------------------
/** A file imported, discarded and imported again gets a fresh draft under `imp-<hash>-<k>`; after this many the server stops. */
export const IMPORT_MAX_TRIES = 9;

export async function handleImportDraft(deps: StudioDeps, learnerId: string, raw: unknown): Promise<HandlerResult> {
  const g = await guard(deps, learnerId, "studio:write");
  if (!g.ok) return g.result;
  const body = importDraftBodySchema.safeParse(raw);
  if (!body.success) return fail(400, "invalid_body");
  const parsed = studioImportFileSchema.safeParse(body.data.file);
  if (!parsed.success) return fail(400, "import_bad_file");
  const file = parsed.data;
  const { learner, member } = g.grant;
  if (file.track !== learner.trackId) return fail(400, "import_wrong_track", { file_track: file.track, learner_track: learner.trackId });
  const issues = validateDraft(file.payload, await deps.loadContext(learner.id, learner.trackId));
  const report = {
    title: file.title,
    items: file.payload.items.length,
    needs_review: file.payload.items.filter((i) => i.needs_review).length,
    blocking: blockingIssues(issues).length,
  };
  // Same content → same client id → eng_create_studio_draft replays the same draft (double click, retry, a second import).
  const hash = createHash("sha256").update(JSON.stringify(file)).digest("hex").slice(0, 32);
  try {
    for (let k = 1; k <= IMPORT_MAX_TRIES; k++) {
      const clientId = k === 1 ? `imp-${hash}` : `imp-${hash}-${k}`;
      const made = (await deps.store.createDraft({
        learnerId: learner.id, title: file.title, testFile: null, keyFile: null, extract: false, byMemberId: member.id, clientId,
      })) as { id: string; status: string; replayed: boolean };
      if (made.replayed && made.status === "discarded") continue;
      const { view } = parseDraft(await deps.store.draft(made.id), { showCost: false });
      // A new draft, or an earlier import that stopped between "create" and "save": fill it now.
      if (view.status === "draft" && view.payload.items.length === 0) {
        await deps.store.saveDraft({ draftId: made.id, title: file.title, payload: file.payload, base: view.updatedAt, byMemberId: member.id });
        return { status: made.replayed ? 200 : 201, body: { id: made.id, status: "draft", replayed: made.replayed, ...report } };
      }
      return { status: 200, body: { id: made.id, status: view.status, replayed: true, ...report } };
    }
    return fail(409, "import_too_many");
  } catch (err) {
    const r = fromStudioDbError(err);
    // eng_create_studio_draft: the same client id with another title = the draft of this file was renamed since.
    if (r.status === 409 && (r.body as { error?: string }).error === "conflict") return fail(409, "import_renamed");
    return r;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/studioImport.test.ts tests/unit/studioHandlers.test.ts`
Expected: PASS (all; the old Studio handler tests are unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/studio/handlers.ts tests/unit/studioImport.test.ts
git commit -m "feat(studio): import a pre-made draft as a manual draft (idempotent, track-checked)"
```

---

### Task 3: Route + copy + browser helper

**Files:**
- Create: `app/api/learners/[id]/studio/imports/route.ts`
- Create: `lib/studio/importClient.ts`
- Modify: `lib/copy/vi.ts` (new `studioImportCopy` right after `studioCopy`; `studioCopy.markSeen`)

**Interfaces:**
- Consumes: `handleImportDraft` (Task 2), `STUDIO_IMPORT_MAX_BYTES` (Task 1), `sendJson` (`lib/studio/client.ts`), `studioErrorText` (`lib/studio/view.ts`).
- Produces:
  - `type ImportRow = { name: string; ok: true; id: string; title: string; items: number; needsReview: number; blocking: number; replayed: boolean; status: string } | { name: string; ok: false; message: string }`
  - `export async function importOne(learnerId: string, f: File): Promise<ImportRow>`
  - `studioImportCopy` (keys below), `studioCopy.markSeen`.

- [ ] **Step 1: Route** (`app/api/learners/[id]/studio/imports/route.ts`)

```ts
import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { handleImportDraft } from "@/lib/studio/handlers";
import { runStudioRoute } from "@/lib/studio/route";

/** POST - "Nhập bài soạn sẵn": one pre-made draft file → a Studio draft of the child (no AI). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  return runStudioRoute("POST /api/learners/[id]/studio/imports", (deps) => handleImportDraft(deps, id, body));
}
```

- [ ] **Step 2: Copy** (`lib/copy/vi.ts`)

Add inside `studioCopy`, after `needsReview: "Cần xem",`:

```ts
  markSeen: "Đã xem ✓",
```

Add right after the closing `};` of `studioCopy`:

```ts
// Nhập bài soạn sẵn (16/11): a draft made outside the app → a normal Studio draft. Adults only; no AI.
export const studioImportCopy = {
  title: "Nhập bài soạn sẵn",
  intro: `Chọn một hay nhiều file .json đã soạn sẵn. Mỗi file thành một bản nháp; ${tutorHonorific} vẫn xem và bấm Duyệt như bài khác. Không dùng AI.`,
  fileLabel: "File bài soạn sẵn (.json)",
  chosen: (n: number) => `Đã chọn ${n} file`,
  start: "Nhập vào bản nháp",
  importing: (k: number, n: number) => `Đang nhập ${k}/${n}…`,
  rowOk: (title: string, items: number) => `✓ ${title} · ${items} câu`,
  rowFlagged: (n: number) => `${n} câu cần xem`,
  rowBlocking: (n: number) => `${n} lỗi cần sửa trước khi Duyệt`,
  rowAgain: "Đã nhập trước đó",
  rowApproved: "Đã duyệt trước đó",
  open: "Mở",
  rowFailed: (name: string) => `✗ ${name}`,
  errors: {
    not_json: "File không đọc được (không phải file .json).",
    too_big: "File quá lớn (tối đa 1 MB).",
    import_bad_file: "File không đúng khuôn bài soạn sẵn.",
    import_renamed: "File này đã nhập trước đó và bản nháp đã được đổi tên. Mở bản nháp trong danh sách Bài đã tạo.",
    import_too_many: "File này đã nhập và bỏ quá nhiều lần.",
  } as Record<string, string>,
  wrongTrack: (file: string, learner: string) => `File soạn cho Track ${file}, em này học Track ${learner}.`,
};
```

- [ ] **Step 3: Browser helper** (`lib/studio/importClient.ts`)

```ts
"use client";
/** Browser side of "Nhập bài soạn sẵn": read one file, send it, turn the answer into a result row. No server imports. */
import { studioImportCopy } from "@/lib/copy/vi";
import { STUDIO_IMPORT_MAX_BYTES } from "./importFile";
import { sendJson } from "./client";
import { studioErrorText } from "./view";

export type ImportRow =
  | { name: string; ok: true; id: string; title: string; items: number; needsReview: number; blocking: number; replayed: boolean; status: string }
  | { name: string; ok: false; message: string };
type Answer = { id: string; status: string; replayed: boolean; title: string; items: number; needs_review: number; blocking: number };

function errorText(code: string, body: unknown): string {
  if (code === "import_wrong_track") {
    const b = (body ?? {}) as { file_track?: string; learner_track?: string };
    return studioImportCopy.wrongTrack(b.file_track ?? "?", b.learner_track ?? "?");
  }
  return studioImportCopy.errors[code] ?? studioErrorText(code);
}

export async function importOne(learnerId: string, f: File): Promise<ImportRow> {
  if (f.size > STUDIO_IMPORT_MAX_BYTES) return { name: f.name, ok: false, message: studioImportCopy.errors.too_big! };
  let file: unknown;
  try {
    file = JSON.parse(await f.text());
  } catch {
    return { name: f.name, ok: false, message: studioImportCopy.errors.not_json! };
  }
  const r = await sendJson<Answer>(`/api/learners/${learnerId}/studio/imports`, "POST", { file });
  if (!r.ok) return { name: f.name, ok: false, message: errorText(r.error, r.body) };
  const a = r.body;
  return { name: f.name, ok: true, id: a.id, title: a.title, items: a.items, needsReview: a.needs_review, blocking: a.blocking, replayed: a.replayed, status: a.status };
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/api/learners/[id]/studio/imports/route.ts" lib/studio/importClient.ts lib/copy/vi.ts
git commit -m "feat(studio): import route, copy and browser helper"
```

---

### Task 4: "Nhập bài soạn sẵn" card on Tạo bài từ đề

**Files:**
- Modify: `components/ui/FilePicker.tsx`
- Create: `components/studio/ImportForm.tsx`
- Modify: `app/studio/new/page.tsx`
- Test: `tests/dom/studioImportForm.test.tsx`

**Interfaces:**
- Consumes: `importOne`, `ImportRow` (Task 3), `studioImportCopy` (Task 3).
- Produces:
  - `FilePicker` gets optional `multiple?: boolean` and `onPickMany?: (files: File[]) => void`; `onPick` becomes optional. Existing callers are unchanged.
  - `export function ImportForm({ learnerId }: { learnerId: string })`.
  - Test ids: `studio-import`, `studio-import-file`, `studio-import-start`, `studio-import-row-<index>`.

- [ ] **Step 1: Write the failing test** (`tests/dom/studioImportForm.test.tsx`)

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
import { ImportForm } from "@/components/studio/ImportForm";

afterEach(() => { cleanup(); vi.restoreAllMocks(); refresh.mockReset(); });

const okBody = { id: "d1", status: "draft", replayed: false, title: "Unit 14 · Idioms (L)", items: 12, needs_review: 2, blocking: 0 };

describe("ImportForm", () => {
  it("sends each readable file once, shows one row per file, refreshes the draft list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(okBody), { status: 201 }));
    render(<ImportForm learnerId="L1" />);
    const good = new File([JSON.stringify({ format: "learning-os.studio-draft" })], "U14-4.json", { type: "application/json" });
    const bad = new File(["not json"], "broken.json", { type: "application/json" });
    fireEvent.change(screen.getByTestId("studio-import-file"), { target: { files: [good, bad] } });
    fireEvent.click(screen.getByTestId("studio-import-start"));
    await waitFor(() => expect(screen.getByTestId("studio-import-row-1")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/learners/L1/studio/imports");
    expect(screen.getByTestId("studio-import-row-0").textContent).toContain("✓ Unit 14 · Idioms (L) · 12 câu");
    expect(screen.getByTestId("studio-import-row-0").textContent).toContain("2 câu cần xem");
    expect(screen.getByTestId("studio-import-row-1").textContent).toContain("không phải file .json");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("explains a file of the other track", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "import_wrong_track", file_track: "B", learner_track: "A" }), { status: 400 }));
    render(<ImportForm learnerId="L1" />);
    fireEvent.change(screen.getByTestId("studio-import-file"), { target: { files: [new File(["{}"], "x.json", { type: "application/json" })] } });
    fireEvent.click(screen.getByTestId("studio-import-start"));
    await waitFor(() => expect(screen.getByTestId("studio-import-row-0").textContent).toContain("File soạn cho Track B, em này học Track A."));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project dom tests/dom/studioImportForm.test.tsx`
Expected: FAIL, because `@/components/studio/ImportForm` cannot be resolved.

- [ ] **Step 3: FilePicker: optional multiple** (`components/ui/FilePicker.tsx`)

Replace the props block and the `onChange` of the input:

```tsx
export function FilePicker({
  testId,
  nameTestId,
  accept,
  name,
  onPick,
  onPickMany,
  multiple = false,
  ariaLabel,
  ariaDescribedBy,
  disabled = false,
}: {
  testId: string;
  nameTestId?: string;
  accept: string;
  /** Name of the file currently chosen (null = none). The caller owns the file itself. */
  name: string | null;
  onPick?: (file: File | undefined) => void;
  /** With `multiple`: every chosen file, in the order the browser gives them. */
  onPickMany?: (files: File[]) => void;
  multiple?: boolean;
  ariaLabel: string;
  ariaDescribedBy?: string;
  disabled?: boolean;
}) {
```

and on the `<input>`: add `multiple={multiple}` and use

```tsx
          onChange={(e) => {
            if (multiple) onPickMany?.(Array.from(e.target.files ?? []));
            else onPick?.(e.target.files?.[0]);
            e.target.value = "";
          }}
```

- [ ] **Step 4: ImportForm** (`components/studio/ImportForm.tsx`)

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilePicker } from "@/components/ui/FilePicker";
import { studioImportCopy } from "@/lib/copy/vi";
import { importOne, type ImportRow } from "@/lib/studio/importClient";

/** "Nhập bài soạn sẵn": several .json files → one Studio draft each (sent one by one), one result row per file. */
export function ImportForm({ learnerId }: { learnerId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [progress, setProgress] = useState<number | null>(null);

  async function run() {
    const out: ImportRow[] = [];
    setRows([]);
    for (let k = 0; k < files.length; k++) {
      setProgress(k + 1);
      out.push(await importOne(learnerId, files[k]!));
      setRows([...out]);
    }
    setProgress(null);
    setFiles([]);
    router.refresh();
  }

  return (
    <section aria-labelledby="studio-import-title" data-testid="studio-import" className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
      <h2 id="studio-import-title" className="text-lg font-semibold">{studioImportCopy.title}</h2>
      <p className="text-sm">{studioImportCopy.intro}</p>
      <div className="flex flex-col gap-1 text-sm font-semibold">
        {studioImportCopy.fileLabel}
        <FilePicker
          testId="studio-import-file"
          accept=".json,application/json"
          multiple
          name={files.length === 0 ? null : files.length === 1 ? files[0]!.name : studioImportCopy.chosen(files.length)}
          onPickMany={(fs) => { setFiles(fs); setRows([]); }}
          ariaLabel={studioImportCopy.fileLabel}
          disabled={progress !== null}
        />
      </div>
      <button type="button" disabled={files.length === 0 || progress !== null} onClick={() => void run()} data-testid="studio-import-start"
        className="min-h-12 self-start rounded-xl border border-accent bg-white px-5 font-semibold text-accent disabled:opacity-60">
        {progress !== null ? studioImportCopy.importing(progress, files.length) : studioImportCopy.start}
      </button>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {rows.map((r, k) => (
            <li key={`${r.name}-${k}`} data-testid={`studio-import-row-${k}`} className={`rounded-xl px-3.5 py-2 text-sm ${r.ok ? "bg-[#eef3ef]" : "bg-[#FBF1DC] text-[#6B4600]"}`}>
              {r.ok ? (
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="font-semibold">{studioImportCopy.rowOk(r.title, r.items)}</span>
                  {r.needsReview > 0 ? <span>· {studioImportCopy.rowFlagged(r.needsReview)}</span> : null}
                  {r.blocking > 0 ? <span className="text-[#8A1C12]">· {studioImportCopy.rowBlocking(r.blocking)}</span> : null}
                  {r.status === "approved" ? <span>· {studioImportCopy.rowApproved}</span> : r.replayed ? <span>· {studioImportCopy.rowAgain}</span> : null}
                  <Link href={`/studio/drafts/${r.id}`} className="ml-auto inline-flex min-h-11 items-center text-accent underline">{studioImportCopy.open}</Link>
                </span>
              ) : (
                <span><span className="font-semibold">{studioImportCopy.rowFailed(r.name)}</span> · {r.message}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Page** (`app/studio/new/page.tsx`)

Add `import { ImportForm } from "@/components/studio/ImportForm";` and render it between `<UploadForm … />` and `<div id="drafts">`:

```tsx
        <ImportForm learnerId={l.id} />
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run --project dom tests/dom/studioImportForm.test.tsx && npm run typecheck`
Expected: PASS; no type errors (the existing `FilePicker` callers still pass `onPick`).

- [ ] **Step 7: Commit**

```bash
git add components/ui/FilePicker.tsx components/studio/ImportForm.tsx app/studio/new/page.tsx tests/dom/studioImportForm.test.tsx
git commit -m "feat(studio): Nhap bai soan san card with one result row per file"
```

---

### Task 5: "Đã xem ✓" on a flagged question

**Files:**
- Modify: `components/studio/ItemCard.tsx` (the `item.needs_review` badge block, ~lines 35–40)
- Test: `tests/dom/studioItemCardSeen.test.tsx`

**Interfaces:**
- Consumes: `studioCopy.markSeen` (Task 3).
- Produces: test id `item-<n>-seen`. Clicking it calls `onChange({ needs_review: false, review_reason: null })`. The editor saves it with "Lưu nháp" / "Duyệt" as any other edit, and the "Chỉ câu cần xem" filter drops the item because the `ai_review` issue is gone.

- [ ] **Step 1: Write the failing test**

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ItemCard } from "@/components/studio/ItemCard";
import { CTX_B } from "../unit/fixtures/studio";
import type { StudioItem } from "@/lib/studio/schema";

afterEach(cleanup);

const item: StudioItem = {
  n: 3, part: "A", kind: "gap", out_of_app: false, stem: "x ____", options: [], passage_ref: null, key: "quantify", accepted: ["quantity"],
  tag_key: "tu-vung-ngu-canh", target_id: null, reading_skill_key: null, explanation_vi: "", needs_review: true, review_reason: "Key sách in sai.",
};

describe("ItemCard · Đã xem ✓", () => {
  it("shows the reason and clears the flag in one click; no button on an unflagged item", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ul><ItemCard item={item} parts={[{ key: "A", name: "A", instructions: "" }]} passages={[]} context={CTX_B} issues={[]} onChange={onChange} onRemove={() => {}} /></ul>);
    expect(screen.getByText(/Key sách in sai\./)).toBeTruthy();
    fireEvent.click(screen.getByTestId("item-3-seen"));
    expect(onChange).toHaveBeenCalledWith({ needs_review: false, review_reason: null });
    rerender(<ul><ItemCard item={{ ...item, needs_review: false, review_reason: null }} parts={[{ key: "A", name: "A", instructions: "" }]} passages={[]} context={CTX_B} issues={[]} onChange={onChange} onRemove={() => {}} /></ul>);
    expect(screen.queryByTestId("item-3-seen")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project dom tests/dom/studioItemCardSeen.test.tsx`
Expected: FAIL, because `item-3-seen` is not found.

- [ ] **Step 3: Implementation** (`components/studio/ItemCard.tsx`)

Replace the `item.needs_review ? (<span …>…</span>) : null` block with:

```tsx
        {item.needs_review ? (
          <>
            <span className="rounded-full bg-[#FBF1DC] px-2 py-0.5 text-xs text-[#6B4600]" title={item.review_reason ?? undefined}>
              {studioCopy.needsReview}
              {item.review_reason ? `: ${item.review_reason}` : ""}
            </span>
            <button type="button" onClick={() => onChange({ needs_review: false, review_reason: null })} data-testid={`item-${item.n}-seen`}
              className="min-h-11 rounded-lg border border-line bg-white px-3 text-xs font-semibold">
              {studioCopy.markSeen}
            </button>
          </>
        ) : null}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run --project dom tests/dom/studioItemCardSeen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/studio/ItemCard.tsx tests/dom/studioItemCardSeen.test.tsx
git commit -m "feat(studio): Da xem button clears a question's review flag"
```

---

### Task 6: Docs

**Files:**
- Create: `docs/STUDIO_IMPORT_FORMAT.md`
- Modify: `docs/DESIGN.md` (new §19.26 after §19.25), `docs/PROGRESS.md` (new section at the end), `CLAUDE.md` (one status line after W4e)

- [ ] **Step 1: `docs/STUDIO_IMPORT_FORMAT.md`** (Vietnamese prose; field names in code)

The file explains:
- **The wrapper**: `{ "format": "learning-os.studio-draft", "version": 1, "track": "B", "title": "…", "payload": { parts, passages, items } }`.
- **`payload`**: exactly the stored draft schema (`lib/studio/schema.ts` `studioDraftSchema`: strict, every item field present, `n` 1..N contiguous, each part's items contiguous, exactly one of `tag_key` / `reading_skill_key` per in-app item, `mcq` key = a letter of its options, no options on other kinds, `explanation_vi` ≤ 300 characters and never score-like).
- **Limits**: copied from `STUDIO_LIMITS`; ≤ 1 MB per file.
- **Re-importing**: the same content reopens the same draft; a draft that was discarded and then re-imported is created fresh.
- **Auto-checking**: `gap` / `word_form` keys are auto-checked (a wrong key marks the child wrong), while `transform` / `short` go to the tutor when the answer is not in the key. So put alternative right answers in `accepted`.
- **Book pages**: put the book page in the part `name` (e.g. "A · Topic vocabulary: Quantity · tr.114"), since the child sees part names too.
- **Check before handing a file over**: run it through `studioImportFileSchema` + `validateDraft` with the track's tags (0 blocking).

- [ ] **Step 2: DESIGN §19.26, PROGRESS section, CLAUDE status line**

- **DESIGN.md §19.26 "Nhập bài soạn sẵn"**:
  - covers the route, the handler order (access → body → file → track → validate (report only) → create (manual, `imp-<sha256[0..32]>[-k]`) → read → save if empty), and the replay rules from Task 2;
  - states that there is no SQL and no AI;
  - states that "Đã xem ✓" only edits the draft payload.
- **PROGRESS.md section "Nhập bài soạn sẵn (16/11)"**: what it does, **SQL: không có**, how to test on preview (below), criteria, and the known limit "bài Studio chưa tính vào độ phủ Giáo trình".
- **CLAUDE.md status line**: `- **Nhập bài soạn sẵn (.json) + "Đã xem ✓" — code trên nhánh \`feature/studio-import-json\`** (16/11, **không có SQL**, không AI): …`

- [ ] **Step 3: Commit**

```bash
git add docs/STUDIO_IMPORT_FORMAT.md docs/DESIGN.md docs/PROGRESS.md CLAUDE.md
git commit -m "docs: Nhap bai soan san format, design note and progress"
```

---

### Task 7: The 6 Destination files in the import format (outside the repo)

**Files (not in the repo):**
- Create: `/home/claude/dest/wrap.py`
- Create: `/home/claude/dest/check_import.ts`
- Output: `/home/claude/dest/out/import/*.json` + zip

**Interfaces:**
- Consumes: `/home/claude/dest/out/<slug>.json` (payloads), `/home/claude/dest/out/_index.json` (`slug`, `title`, `src` = one book ref per item such as `"A-1 · tr.114"`), `studioImportFileSchema` + `validateDraft` (repo).

- [ ] **Step 1: `wrap.py`**

For each `_index.json` entry:
1. Load its payload.
2. For each part, collect the printed pages of its items (from `src[n-1]`, the text after `tr.`).
3. Append `" · tr.<min>"` to the part name, or `" · tr.<min>–<max>"` when the pages differ, and keep the name ≤ 120 characters.
4. Write `{format:"learning-os.studio-draft", version:1, track:"B", title, payload}` to `out/import/<slug>.json`.

- [ ] **Step 2: `check_import.ts`**

Run from the repo: `cd /home/claude/shellplan && npx tsx /home/claude/dest/check_import.ts`. For every file in `out/import`, it:
- parses it with `studioImportFileSchema`;
- builds the context from `content/tags/tags_B.json` (all tags, `reading` from the group);
- runs `validateDraft`.

Expected: 6 files, 193 items, 0 blocking, needs_review total 18.

- [ ] **Step 3: Zip** `out/import/*.json` → `destination-unit14-import.zip`. It is sent to the parent with the PR message.

---

### Task 8: Verify, review, PR

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test`. Expected: all green.
- [ ] **Step 2:** Agent `reviewer` on the branch diff. Fix what it finds; re-run Step 1.
- [ ] **Step 3:** Push `feature/studio-import-json` and open the PR (Vietnamese), covering:
  - **Làm gì**: what the slice does.
  - **SQL cần phụ huynh áp: không có**.
  - **Cách thử trên preview** (learner "Nguyên (thử)"):
    1. Bàn làm việc → Giao bài → Tạo bài từ đề.
    2. "Nhập bài soạn sẵn" → 📎 chọn 6 file trong zip → "Nhập vào bản nháp" → 6 dòng ✓.
    3. Bấm "Mở" một bài → "Chỉ câu cần xem" → "Đã xem ✓" → Lưu nháp → Duyệt → Giao bài.
    4. Nhập lại cùng file → "Đã nhập trước đó", không thêm bản trùng.
    5. Thử nhập cho "An (thử)" → báo "File soạn cho Track B…".
  - **Tiêu chí đạt / chưa đạt**.
  - **Giới hạn**: bài Studio chưa tính vào độ phủ Giáo trình.
  - The attribution footer.
