# Bài đã giao (gỡ bài · quá hạn n ngày · mục "Bài đã giao") Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adults can remove (and restore) a Studio test the child has not sent, see how many days a test is late, and follow every assigned piece of work in one new section "Bài đã giao" with four tabs, while "Giao bài" only creates work.

**Architecture:** No SQL. "Gỡ bài" reuses the existing step event `skip` / `unskip` (migration 0007, `POST /api/activities/:id/events`, reason ≥ 3 characters, parent or the child's tutor), which already hides a step from the child (`eng_step_effective_date` → null → `eng_activity_released` false → not in `eng_my_today` / `eng_my_today_count`). The tabs are a pure function over the rows the app already loads (`loadStudioAssigned`, `loadAssignments`); the existing row components (`StudioAssignedTable`, `AssignmentTable`) are reused, filtered by tab.

**Tech Stack:** Next.js App Router · TypeScript strict · Tailwind · Vitest (unit `node`, DOM `jsdom`, DB with local Postgres) · Playwright e2e on CI.

**Spec:** the approved prototype https://claude.ai/artifact/HE9sDkBdDAHLGKHAxPr4Ko (artboards "Bài đã giao (mục mới)" and "Giao bài (sau khi tách)"), the review in chat 24/11 (parent: "ok", then "ok" to this plan). Decisions carried from that review:
- D-a: a separate section "Bài đã giao"; "Giao bài" keeps only the four ways + drafts being prepared.
- D-b: parent and the child's tutor may remove (same rule as the existing "Thu hồi" of link/PDF work and `eng_actor_may_manage`).
- D-c: work the child has SENT is never removed (evidence). Marking sent test work "không tính" is a separate SQL slice, not in this plan.
- D-d: tab "Cần thầy/cô xử lý" = sent work waiting for verdicts **or** checked but without feedback (parent did not object 24/11). One constant decides it (`NEEDS_FEEDBACK_TO_FINISH`).
- D-e (deviation from the prototype, stated in the PR): inside each tab the rows keep their two existing lists ("Bài trên app", "Bài link / PDF") instead of one merged list, so the existing actions (record result, submit for the child, retract, feedback) are reused unchanged.

## Global Constraints

- UI text only from `lib/copy/vi.ts`; adults are addressed neutrally, the tutor is `${tutorHonorific}` ("thầy/cô"). Document new labels in `docs/UX_COPY_GUIDE.md`.
- No `if (track === …)` (lint blocks it).
- Buttons and links ≥ 44 px tall (`min-h-11`).
- The child never sees scores; nothing in this plan changes the child's screens except that removed work disappears from Hôm nay.
- No SQL, no new API route, no AI.
- `npm run typecheck && npm run lint && npm test` green; `reviewer` agent on the diff before each PR; PR description in Vietnamese (làm gì · cách thử · SQL: không có · tiêu chí).
- No force-push; merge `origin/main` into the branch on conflict.

**Two PRs.** PR 1 = Tasks 1–5 on branch `feature/assigned-remove` (urgent: wrong work confuses the child today). PR 2 = Tasks 6–13 on branch `feature/assigned-board`, created from `main` after PR 1 is merged.

---

## PR 1 — Gỡ bài · Khôi phục · "Quá hạn n ngày"

### Task 1: Studio rows know how late they are and why they were removed

**Files:**
- Modify: `lib/studio/assigned.ts` (type `StudioAssignedRow`, `buildStudioAssigned`, new `sortStudioAssigned`)
- Test: `tests/unit/studioAssigned.test.ts`

**Interfaces:**
- Produces: `StudioAssignedRow.lateDays: number | null` (days after `dueOn`, only when `status === "overdue"`), `StudioAssignedRow.removedReason: string | null` (only when `status === "skipped"`), `sortStudioAssigned(rows: readonly StudioAssignedRow[]): StudioAssignedRow[]` (overdue first, longest late first; the rest keep their order).

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe` of `tests/unit/studioAssigned.test.ts`; `inq`, `attempts`, `episodes`, `results`, `TODAY = "2026-11-21"` exist there)

```ts
  it("an overdue test says how many days it is late; a removed one keeps the adult's reason", () => {
    const skipped = inq("7", "B-ST-000007", "2026-11-15", "2026-11-18");
    skipped.steps[0]!.schedule = { ...skipped.steps[0]!.schedule, skipped: true, lastReason: "Giao trùng bài" };
    const rows = buildStudioAssigned([...inquiries, skipped], attempts, episodes, results, TODAY);
    const by = Object.fromEntries(rows.map((r) => [r.instanceId, r]));
    expect(by["3"]).toMatchObject({ status: "overdue", lateDays: 1, removedReason: null });
    expect(by["2"]).toMatchObject({ status: "todo", lateDays: null });
    expect(by["7"]).toMatchObject({ status: "skipped", lateDays: null, removedReason: "Giao trùng bài" });
  });

  it("sortStudioAssigned: overdue first, the longest late on top; the others keep their order", () => {
    const late10 = inq("8", "B-ST-000008", "2026-11-01", "2026-11-11");
    const rows = sortStudioAssigned(buildStudioAssigned([...inquiries, late10], attempts, episodes, results, TODAY));
    expect(rows.map((r) => r.instanceId)).toEqual(["8", "3", "1", "2", "4", "5"]);
  });
```

Add `sortStudioAssigned` to the import line at the top of the file.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/studioAssigned.test.ts`
Expected: FAIL (`sortStudioAssigned` is not exported; `lateDays` undefined).

- [ ] **Step 3: Implement**

In `lib/studio/assigned.ts`:

```ts
import { daysBetween } from "@/lib/inquiries/dates";
```

Add to `StudioAssignedRow` (after `status`):

```ts
  /** Days after the due day, only for "overdue" (the due day itself is not late). */
  lateDays: number | null;
  /** The adult's reason when the test was removed ("Gỡ bài" = the step event `skip`), else null. */
  removedReason: string | null;
```

In `buildStudioAssigned`, inside `out.push({ … })` after `status,`:

```ts
      lateDays: status === "overdue" ? daysBetween(q.dueOn, todayIso) : null,
      removedReason: status === "skipped" ? step.schedule.lastReason : null,
```

After `studioOverdueCount`:

```ts
/** "Quá hạn lâu nhất lên đầu": overdue tests first (most days late first, then title); every other row keeps the given order. */
export function sortStudioAssigned(rows: readonly StudioAssignedRow[]): StudioAssignedRow[] {
  const late = rows.filter((r) => r.status === "overdue").sort((a, b) => (b.lateDays ?? 0) - (a.lateDays ?? 0) || a.title.localeCompare(b.title, "vi"));
  return [...late, ...rows.filter((r) => r.status !== "overdue")];
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/studioAssigned.test.ts && npm run typecheck`
Expected: PASS. If typecheck flags other places building a `StudioAssignedRow` literal (tests / fixtures), add `lateDays: null, removedReason: null` there.

- [ ] **Step 5: Commit**

```bash
git add lib/studio/assigned.ts tests/unit/studioAssigned.test.ts
git commit -m "feat(assigned): Studio rows carry days late and the removal reason; overdue first"
```

### Task 2: "Gỡ bài" / "Khôi phục" control

**Files:**
- Create: `components/studio/RemoveAssignedButton.tsx`
- Modify: `lib/copy/vi.ts` (`studioAssignedCopy`)
- Test: `tests/dom/removeAssigned.test.tsx`

**Interfaces:**
- Consumes: `POST /api/activities/:id/events` body `{ kind: "skip" | "unskip", reason: string }` → 201 (existing).
- Produces: `<RemoveAssignedButton activityId={string} removed={boolean} title={string} />` (client component).

- [ ] **Step 1: Add the copy** (in `studioAssignedCopy`, `lib/copy/vi.ts`; change `skipped` from "Đã bỏ qua" to "Đã gỡ")

```ts
    skipped: "Đã gỡ",
```

and add these keys at the end of `studioAssignedCopy`:

```ts
  overdueDays: (n: number) => `Quá hạn ${n} ngày`,
  remove: "Gỡ bài",
  removeTitle: (title: string) => `Gỡ bài "${title}"`,
  removeHelp: "Con sẽ không còn thấy bài này ở Hôm nay và bài không còn báo quá hạn. Khôi phục được bất cứ lúc nào.",
  reasonLabel: "Lý do gỡ bài",
  reasonPlaceholder: "Giao trùng bài Unit 14",
  reasonRequired: "Ghi lý do ngắn (ít nhất 3 chữ cái).",
  confirmRemove: "Gỡ bài",
  restore: "Khôi phục",
  restoreReason: "Khôi phục bài đã gỡ",
  cancel: "Thôi",
  saving: "Đang lưu…",
  failed: "Chưa lưu được. Thử lại.",
  removedReason: (r: string) => `Lý do gỡ: ${r}`,
```

- [ ] **Step 2: Write the failing DOM test** `tests/dom/removeAssigned.test.tsx`

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RemoveAssignedButton } from "@/components/studio/RemoveAssignedButton";
import { studioAssignedCopy as c } from "@/lib/copy/vi";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 1 }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Gỡ bài / Khôi phục (skip / unskip of the step)", () => {
  it("asks for a reason first; a too-short reason is refused without a request", async () => {
    render(<RemoveAssignedButton activityId="a1" removed={false} title="Destination C1 C2" />);
    fireEvent.click(screen.getByRole("button", { name: c.remove }));
    expect(screen.getByText(c.removeHelp)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: c.confirmRemove }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", c.reasonRequired);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends skip with the reason, then refreshes the page", async () => {
    render(<RemoveAssignedButton activityId="a1" removed={false} title="Destination C1 C2" />);
    fireEvent.click(screen.getByRole("button", { name: c.remove }));
    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: "  Giao trùng bài  " } });
    fireEvent.click(screen.getByRole("button", { name: c.confirmRemove }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/activities/a1/events", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ kind: "skip", reason: "Giao trùng bài" });
  });

  it("a removed test has one button: Khôi phục sends unskip with a fixed reason", async () => {
    render(<RemoveAssignedButton activityId="a2" removed title="Unit 14 · Idioms (L)" />);
    expect(screen.queryByRole("button", { name: c.remove })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: c.restore }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ kind: "unskip", reason: c.restoreReason });
  });

  it("a failed request shows an error and keeps the form open", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "conflict" }) });
    render(<RemoveAssignedButton activityId="a1" removed={false} title="X" />);
    fireEvent.click(screen.getByRole("button", { name: c.remove }));
    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: "Giao thử" } });
    fireEvent.click(screen.getByRole("button", { name: c.confirmRemove }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", c.failed);
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/dom/removeAssigned.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `components/studio/RemoveAssignedButton.tsx`

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { studioAssignedCopy as c } from "@/lib/copy/vi";

/**
 * "Gỡ bài" for a Studio test the child has not sent = the step event `skip` (0007): the step leaves the child's Hôm nay and the
 * overdue counts. "Khôi phục" = `unskip`. The reason is checked here for a friendly message and again by the API and the database.
 */
export function RemoveAssignedButton({ activityId, removed, title }: { activityId: string; removed: boolean; title: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(kind: "skip" | "unskip", why: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/activities/${activityId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, reason: why }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setError(c.failed);
    } finally {
      setBusy(false);
    }
  }

  const btn = "min-h-11 rounded-lg border px-4 text-sm font-semibold";
  if (removed) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" disabled={busy} onClick={() => send("unskip", c.restoreReason)} className={`${btn} border-accent bg-white text-accent`}>
          {busy ? c.saving : c.restore}
        </button>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${btn} border-[#b9582a] bg-white text-[#8a3a12]`} data-testid={`remove-${activityId}`}>
        {c.remove}
      </button>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const why = reason.trim();
        if (why.length < 3) return setError(c.reasonRequired);
        void send("skip", why);
      }}
    >
      <p className="text-sm font-semibold">{c.removeTitle(title)}</p>
      <p className="text-sm text-muted">{c.removeHelp}</p>
      <label htmlFor={`${id}-reason`} className="text-sm font-semibold">{c.reasonLabel}</label>
      <input
        id={`${id}-reason`}
        type="text"
        value={reason}
        placeholder={c.reasonPlaceholder}
        onChange={(e) => { setReason(e.target.value); setError(null); }}
        className="min-h-11 rounded-lg border border-line px-3"
      />
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={`${btn} border-[#8a3a12] bg-[#8a3a12] text-white disabled:opacity-60`}>
          {busy ? c.saving : c.confirmRemove}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className={`${btn} border-line bg-white`}>
          {c.cancel}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/dom/removeAssigned.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add components/studio/RemoveAssignedButton.tsx lib/copy/vi.ts tests/dom/removeAssigned.test.tsx
git commit -m "feat(assigned): Gỡ bài / Khôi phục control for Studio tests (skip / unskip, reason required)"
```

### Task 3: The list shows "Quá hạn n ngày", the reason, and the control

**Files:**
- Modify: `components/studio/StudioAssignedTable.tsx`
- Modify: `app/learners/[id]/assign/page.tsx` and `app/studio/new/page.tsx` (sort before rendering)
- Test: `tests/unit/studioAssignedTable.test.ts` (new; server render)

**Interfaces:**
- Consumes: `sortStudioAssigned`, `RemoveAssignedButton`, `studioAssignedCopy.overdueDays`, `.removedReason`.
- Produces: unchanged props `StudioAssignedTable({ rows })`; each `<li>` gets `data-late-days` when overdue.

- [ ] **Step 1: Write the failing render test** `tests/unit/studioAssignedTable.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioAssignedTable } from "@/components/studio/StudioAssignedTable";
import { studioAssignedCopy as c } from "@/lib/copy/vi";
import type { StudioAssignedRow } from "@/lib/studio/assigned";

const row = (o: Partial<StudioAssignedRow>): StudioAssignedRow => ({
  instanceId: "i1", activityId: "a1", title: "Destination C1 C2", items: 19, startOn: "2026-11-15", dueOn: "2026-11-17", assignedAt: "2026-11-15T01:00:00Z",
  status: "todo", lateDays: null, removedReason: null, attempts: 0, lastAttemptId: null, lastSubmittedAt: null, episodeId: null,
  feedbackGiven: false, feedbackReady: true, units: [], firstResult: null, ...o,
});
const html = (rows: StudioAssignedRow[]) => renderToStaticMarkup(createElement(StudioAssignedTable, { rows }));

describe("Bài làm trên app đã giao: late days, removal", () => {
  it("an overdue unsent test shows 'Quá hạn n ngày' and Gỡ bài", () => {
    const h = html([row({ status: "overdue", lateDays: 7 })]);
    expect(h).toContain(c.overdueDays(7));
    expect(h).toContain('data-late-days="7"');
    expect(h).toContain(c.remove);
  });
  it("a removed test shows Đã gỡ, the reason and Khôi phục, never Gỡ bài", () => {
    const h = html([row({ status: "skipped", removedReason: "Giao trùng bài" })]);
    expect(h).toContain(c.status.skipped);
    expect(h).toContain(c.removedReason("Giao trùng bài"));
    expect(h).toContain(c.restore);
    expect(h).not.toContain(`>${c.remove}<`);
  });
  it("sent work can never be removed", () => {
    for (const status of ["waiting", "checked"] as const) {
      const h = html([row({ status, attempts: 1, lastAttemptId: "t1", lastSubmittedAt: "2026-11-16T02:00:00Z", episodeId: "e1" })]);
      expect(h).not.toContain(c.remove);
      expect(h).not.toContain(c.restore);
    }
  });
});
```

(`RemoveAssignedButton` calls `useRouter`; if server rendering fails on it, add at the top of the test: `vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));` with `vi` imported from vitest.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/studioAssignedTable.test.ts`
Expected: FAIL (no "Quá hạn 7 ngày", no "Gỡ bài").

- [ ] **Step 3: Implement** in `components/studio/StudioAssignedTable.tsx`

Import: `import { RemoveAssignedButton } from "./RemoveAssignedButton";`

On the `<li>` add `data-late-days={r.lateDays ?? undefined}`.

Replace the status pill text `{c.status[r.status]}` with:

```tsx
{r.status === "overdue" && r.lateDays !== null ? c.overdueDays(r.lateDays) : c.status[r.status]}
```

After the `<p className="text-sm text-muted">…</p>` meta line add:

```tsx
{r.removedReason ? <p className="text-sm text-muted" data-testid={`studio-assigned-reason-${r.instanceId}`}>{c.removedReason(r.removedReason)}</p> : null}
{r.lastAttemptId === null ? (
  <div className="flex flex-wrap gap-2">
    <RemoveAssignedButton activityId={r.activityId} removed={r.status === "skipped"} title={r.title} />
  </div>
) : null}
```

In `app/learners/[id]/assign/page.tsx` and `app/studio/new/page.tsx`, sort before rendering: where `loadStudioAssigned(...)` resolves, wrap: `loadStudioAssigned(learner.id, todayVn()).then(sortStudioAssigned).catch(() => null)` (import `sortStudioAssigned` from `@/lib/studio/assigned`; in `app/studio/new/page.tsx` the variable is `l.id`).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/studioAssignedTable.test.ts tests/unit/studioAssigned.test.ts tests/unit/assignPage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/studio/StudioAssignedTable.tsx app/learners/[id]/assign/page.tsx app/studio/new/page.tsx tests/unit/studioAssignedTable.test.ts
git commit -m "feat(assigned): list shows Quá hạn n ngày, the removal reason and Gỡ bài / Khôi phục"
```

### Task 4: Database guarantee — a removed test leaves the child's Hôm nay

**Files:**
- Test: `tests/db/studentDesk.test.ts` (new `it` at the end of the main `describe`)

No production code: this pins the behaviour PR 1 relies on (0007 + 0009 + 0032).

- [ ] **Step 1: Write the test** (helpers `assign`, `step`, `today`, `count`, `q1`, `M()`, `U()` exist in the file)

```ts
  it("Gỡ bài = skip: the step leaves Hôm nay and the count; Khôi phục = unskip brings it back (parent or tutor, reason required)", async () => {
    const inst = await assign("nguyen", "B-W1-HOMEWORK", "2026-12-31");
    const act = await step(inst, 1);
    const before = await count(U().studentNguyen);
    expect((await today(U().studentNguyen)).some((i) => i.activity_id === act)).toBe(true);
    await fail(q1("select english.eng_activity_event($1, 'skip', null, 'ab', $2)", [act, M().tutorNguyen]), "23514");
    await q1("select english.eng_activity_event($1, 'skip', null, 'Giao trùng bài', $2)", [act, M().tutorNguyen]);
    expect((await today(U().studentNguyen)).some((i) => i.activity_id === act)).toBe(false);
    expect(await count(U().studentNguyen)).toBe(before - 1);
    await fail(q1("select english.eng_activity_event($1, 'skip', null, 'Giao thử', $2)", [act, M().tutorAn]), "42501");
    await q1("select english.eng_activity_event($1, 'unskip', null, 'Khôi phục bài đã gỡ', $2)", [act, M().parent]);
    expect((await today(U().studentNguyen)).some((i) => i.activity_id === act)).toBe(true);
    expect(await count(U().studentNguyen)).toBe(before);
  });
```

If step 1 of `B-W1-HOMEWORK` is not doable in the app for this fixture (check with `npx vitest run tests/db/studentDesk.test.ts -t "Gỡ bài"`), use the first step returned by `today()` for Nguyên whose `doable` is true instead of `step(inst, 1)`, and keep the rest.

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/db/studentDesk.test.ts -t "Gỡ bài"`
Expected: PASS (it documents existing behaviour). If it FAILS, stop: the premise of PR 1 is wrong; report to the parent before going on.

- [ ] **Step 3: Commit**

```bash
git add tests/db/studentDesk.test.ts
git commit -m "test(db): a skipped step leaves the child's Hôm nay and count; unskip restores it"
```

### Task 5: Docs, checks, review, PR 1

**Files:**
- Modify: `docs/UX_COPY_GUIDE.md` (new section at the end), `docs/PROGRESS.md` (new section at the end), `docs/DESIGN.md` (new `### 19.34`)

- [ ] **Step 1: Write the docs**

`docs/UX_COPY_GUIDE.md`:

```md
## Bài đã giao · PR 1 (24/11/2026) — Gỡ bài · Khôi phục · Quá hạn n ngày

- `studioAssignedCopy.status.skipped` đổi "Đã bỏ qua" → "Đã gỡ".
- `remove` "Gỡ bài" (chỉ bài con CHƯA nộp), `removeTitle`, `removeHelp` (nói rõ con không còn thấy bài, hết báo quá hạn, khôi phục được), `reasonLabel` "Lý do gỡ bài", `reasonPlaceholder`, `reasonRequired`, `confirmRemove`, `cancel` "Thôi".
- `restore` "Khôi phục"; lý do ghi sẵn `restoreReason` "Khôi phục bài đã gỡ".
- `overdueDays` "Quá hạn n ngày" thay cho "Quá hạn" ở danh sách người lớn. Con không bao giờ thấy chữ quá hạn.
- `removedReason` "Lý do gỡ: …".
```

`docs/PROGRESS.md`:

```md
## Bài đã giao · PR 1: Gỡ bài · Khôi phục · Quá hạn n ngày (24/11/2026)

Nhánh `feature/assigned-remove`. Kế hoạch `docs/superpowers/plans/2026-11-24-bai-da-giao.md`; bản mẫu https://claude.ai/artifact/HE9sDkBdDAHLGKHAxPr4Ko (phụ huynh duyệt 24/11). **Không có SQL.**

- "Bài làm trên app đã giao": bài con chưa nộp có nút **Gỡ bài** (ghi lý do ≥ 3 chữ cái). Bài gỡ rời Hôm nay của con, không còn đếm vào "còn n việc", không còn báo quá hạn ở Bàn làm việc; hiện "Đã gỡ · Lý do gỡ: …" + nút **Khôi phục**.
- Dùng lại sự kiện "bỏ bước" có sẵn (`skip` / `unskip`, 0007): phụ huynh hoặc thầy/cô của em; mọi lần gỡ / khôi phục được ghi lại.
- Bài con đã nộp không gỡ được (bài làm là bằng chứng). Đánh dấu "không tính" cho bài test đã nộp: lát riêng, cần SQL, chưa làm.
- "Quá hạn n ngày" thay cho "Quá hạn"; bài quá hạn lâu nhất lên đầu danh sách.

**Cách thử trên preview:** Giao bài → "Bài làm trên app đã giao" → bài "Destination C1 C2" quá hạn → Gỡ bài → ghi "Giao trùng" → Gỡ bài. Đăng nhập "Nguyên (thử)": Hôm nay không còn bài đó. Quay lại, bấm Khôi phục: bài trở lại.
```

`docs/DESIGN.md` (after §19.33):

```md
### 19.34. Gỡ bài trên app (không SQL)

- Gỡ bài = `eng_activity_event(step, 'skip', null, lý do, người)`; Khôi phục = `unskip`. `eng_step_effective_date` trả null khi bước đang bỏ → `eng_activity_released` false → bước không có trong `eng_my_today` / `eng_my_today_count`, không mở được, không tính quá hạn (`studioOverdueCount` bỏ qua "skipped").
- Chỉ hiện nút khi bài chưa có lần nộp nào (`lastAttemptId` null). Sự kiện chỉ thêm, có người + lý do.
- `StudioAssignedRow.lateDays` = số ngày sau hạn (chỉ "overdue"); `sortStudioAssigned` đưa bài quá hạn lâu nhất lên đầu.
```

- [ ] **Step 2: Full checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 3: Review**

Run the `reviewer` agent on `git diff origin/main...HEAD`; fix what it finds; rerun Step 2.

- [ ] **Step 4: Commit, push, open PR 1**

```bash
git add docs/UX_COPY_GUIDE.md docs/PROGRESS.md docs/DESIGN.md
git commit -m "docs(assigned): PR 1 Gỡ bài · Khôi phục · Quá hạn n ngày"
git push -u origin feature/assigned-remove
gh api repos/haleytruong89-moon/Enghlish-app/pulls -f title='Gỡ bài · Khôi phục · Quá hạn n ngày (bài trên app)' -f head='feature/assigned-remove' -f base='main' -F body=@/tmp/pr1.md
```

PR body (`/tmp/pr1.md`, Vietnamese): làm gì · cách thử (PROGRESS above) · **SQL: không có** · tiêu chí (gỡ → con không thấy; khôi phục → thấy lại; bài đã nộp không có nút) · attribution lines.

---

## PR 2 — Mục "Bài đã giao" · Giao bài chỉ để tạo bài

Create the branch after PR 1 is merged: `git fetch origin && git checkout -b feature/assigned-board origin/main`.

### Task 6: The four tabs as a pure function

**Files:**
- Create: `lib/assigned/board.ts`
- Test: `tests/unit/assignedBoard.test.ts`

**Interfaces:**
- Consumes: `StudioAssignedRow`, `sortStudioAssigned` (Task 1); `AssignmentView` (`lib/practice/types.ts`); `isOverdue` (`lib/practice/overdue.ts`); `daysBetween`.
- Produces:
  - `type BoardTab = "need" | "doing" | "done" | "removed"`; `BOARD_TABS: readonly BoardTab[]`
  - `NEEDS_FEEDBACK_TO_FINISH: boolean` (= `true`, decision D-d)
  - `tabOfStudio(r: StudioAssignedRow): BoardTab`, `tabOfPractice(a: AssignmentView): BoardTab`
  - `buildBoard(studio: readonly StudioAssignedRow[] | null, practice: readonly AssignmentView[], todayIso: string): Board` where `type Board = { counts: Record<BoardTab, number>; studio: Record<BoardTab, StudioAssignedRow[]>; practice: Record<BoardTab, AssignmentView[]>; studioFailed: boolean }`
  - `parseTab(v: unknown, counts: Record<BoardTab, number>): BoardTab` (unknown → "need" when it has rows, else "doing")

- [ ] **Step 1: Write the failing tests** `tests/unit/assignedBoard.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildBoard, parseTab, tabOfPractice, tabOfStudio } from "@/lib/assigned/board";
import type { StudioAssignedRow } from "@/lib/studio/assigned";
import type { AssignmentView } from "@/lib/practice/types";

const TODAY = "2026-11-24";
const st = (id: string, o: Partial<StudioAssignedRow>): StudioAssignedRow => ({
  instanceId: id, activityId: `a-${id}`, title: `Bài ${id}`, items: 10, startOn: "2026-11-15", dueOn: "2026-11-30", assignedAt: "2026-11-15T01:00:00Z",
  status: "todo", lateDays: null, removedReason: null, attempts: 0, lastAttemptId: null, lastSubmittedAt: null, episodeId: null,
  feedbackGiven: false, feedbackReady: true, units: [], firstResult: null, ...o,
});
const pr = (id: string, o: Partial<AssignmentView>): AssignmentView => ({
  id, kind: "link", title: `Link ${id}`, url: "https://example.com", sourceKey: null, tagKeys: [], units: [], unitItems: [], dueOn: "2026-11-30",
  frameId: null, createdAt: "2026-11-15T01:00:00Z", retractedAt: null, file: null, answerFile: null, submission: null, resultId: null, feedback: [], ...o,
});
const sent = { id: "s1", at: "2026-11-20T01:00:00Z" } as unknown as AssignmentView["submission"];

describe("Bài đã giao: which tab a piece of work is in", () => {
  it("Studio: not sent → doing; waiting → need; checked without feedback → need; with feedback → done; removed → removed", () => {
    expect(["not_yet", "todo", "overdue"].map((s) => tabOfStudio(st("1", { status: s as StudioAssignedRow["status"] })))).toEqual(["doing", "doing", "doing"]);
    expect(tabOfStudio(st("1", { status: "waiting", lastAttemptId: "t" }))).toBe("need");
    expect(tabOfStudio(st("1", { status: "checked", lastAttemptId: "t", feedbackGiven: false }))).toBe("need");
    expect(tabOfStudio(st("1", { status: "checked", lastAttemptId: "t", feedbackGiven: true }))).toBe("done");
    // before 0037 nobody can give feedback: checked is done
    expect(tabOfStudio(st("1", { status: "checked", lastAttemptId: "t", feedbackReady: false }))).toBe("done");
    expect(tabOfStudio(st("1", { status: "skipped" }))).toBe("removed");
  });

  it("link / PDF: nothing sent → doing; sent without result or feedback → need; result + feedback, or result with nothing sent → done; retracted → removed", () => {
    expect(tabOfPractice(pr("1", {}))).toBe("doing");
    expect(tabOfPractice(pr("1", { submission: sent }))).toBe("need");
    expect(tabOfPractice(pr("1", { submission: sent, resultId: "r" }))).toBe("need");
    expect(tabOfPractice(pr("1", { submission: sent, resultId: "r", feedback: [{} as AssignmentView["feedback"][number]] }))).toBe("done");
    expect(tabOfPractice(pr("1", { resultId: "r" }))).toBe("done");
    expect(tabOfPractice(pr("1", { retractedAt: "2026-11-21T01:00:00Z" }))).toBe("removed");
  });

  it("buildBoard: counts over both lists; doing puts the longest-late first; a failed Studio read is reported, not hidden", () => {
    const b = buildBoard(
      [st("1", { status: "overdue", lateDays: 2 }), st("2", { status: "overdue", lateDays: 7 }), st("3", { status: "waiting", lastAttemptId: "t" })],
      [pr("p1", { dueOn: "2026-11-10" }), pr("p2", { dueOn: "2026-11-20" }), pr("p3", { retractedAt: "2026-11-21T01:00:00Z" })],
      TODAY,
    );
    expect(b.counts).toEqual({ need: 1, doing: 4, done: 0, removed: 1 });
    expect(b.studio.doing.map((r) => r.instanceId)).toEqual(["2", "1"]);
    expect(b.practice.doing.map((a) => a.id)).toEqual(["p1", "p2"]);
    expect(b.studioFailed).toBe(false);
    expect(buildBoard(null, [], TODAY).studioFailed).toBe(true);
  });

  it("parseTab: a known tab wins; otherwise need when it has work, else doing", () => {
    const counts = { need: 0, doing: 2, done: 1, removed: 0 };
    expect(parseTab("done", counts)).toBe("done");
    expect(parseTab("x", counts)).toBe("doing");
    expect(parseTab(undefined, { ...counts, need: 1 })).toBe("need");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/unit/assignedBoard.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `lib/assigned/board.ts`

```ts
/**
 * "Bài đã giao" (24/11): every piece of work given to one child, in four tabs by what the adult has to do. Pure. Studio tests and
 * link / PDF work keep their own row types (and their own row components): only the grouping and the order are decided here.
 */
import { isOverdue } from "@/lib/practice/overdue";
import type { AssignmentView } from "@/lib/practice/types";
import { sortStudioAssigned, type StudioAssignedRow } from "@/lib/studio/assigned";

export const BOARD_TABS = ["need", "doing", "done", "removed"] as const;
export type BoardTab = (typeof BOARD_TABS)[number];
/** D-d (24/11): checked work the adult has not given feedback on is still "Cần thầy/cô xử lý". */
export const NEEDS_FEEDBACK_TO_FINISH = true;

export function tabOfStudio(r: StudioAssignedRow): BoardTab {
  if (r.status === "skipped") return "removed";
  if (r.status === "waiting") return "need";
  if (r.status === "checked") return NEEDS_FEEDBACK_TO_FINISH && r.feedbackReady && !r.feedbackGiven ? "need" : "done";
  return "doing";
}

export function tabOfPractice(a: AssignmentView): BoardTab {
  if (a.retractedAt) return "removed";
  if (a.submission === null) return a.resultId ? "done" : "doing";
  if (a.resultId === null) return "need";
  return NEEDS_FEEDBACK_TO_FINISH && a.feedback.length === 0 ? "need" : "done";
}

export type Board = {
  counts: Record<BoardTab, number>;
  studio: Record<BoardTab, StudioAssignedRow[]>;
  practice: Record<BoardTab, AssignmentView[]>;
  studioFailed: boolean;
};

const empty = <T,>(): Record<BoardTab, T[]> => ({ need: [], doing: [], done: [], removed: [] });

export function buildBoard(studio: readonly StudioAssignedRow[] | null, practice: readonly AssignmentView[], todayIso: string): Board {
  const s = empty<StudioAssignedRow>();
  for (const r of sortStudioAssigned(studio ?? [])) s[tabOfStudio(r)].push(r);
  const p = empty<AssignmentView>();
  for (const a of practice) p[tabOfPractice(a)].push(a);
  // Doing: overdue link / PDF work first, the oldest due day first; the rest keep the loaded order (newest first).
  p.doing = [...p.doing.filter((a) => isOverdue(a, todayIso)).sort((x, y) => (x.dueOn ?? "").localeCompare(y.dueOn ?? "")), ...p.doing.filter((a) => !isOverdue(a, todayIso))];
  const counts = Object.fromEntries(BOARD_TABS.map((t) => [t, s[t].length + p[t].length])) as Record<BoardTab, number>;
  return { counts, studio: s, practice: p, studioFailed: studio === null };
}

export function parseTab(v: unknown, counts: Record<BoardTab, number>): BoardTab {
  if (typeof v === "string" && (BOARD_TABS as readonly string[]).includes(v)) return v as BoardTab;
  return counts.need > 0 ? "need" : "doing";
}
```

If `SubmissionView` / `SubmissionFeedbackView` make the test's casts fail typecheck, build the objects from the real types in `lib/practice/types.ts` instead of `as unknown as`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/assignedBoard.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/assigned/board.ts tests/unit/assignedBoard.test.ts
git commit -m "feat(assigned): four tabs of Bài đã giao as a pure function"
```

### Task 7: Sidebar section "Bài đã giao"

**Files:**
- Modify: `lib/shell/nav.ts` (`SECTION_KEYS`, `SECTIONS`), `lib/shell/paths.ts` (`RULES`), `lib/copy/vi.ts` (`shellCopy.sections.assigned`, `appFeedback.screens.assigned`)
- Test: `tests/unit/shellNav.test.ts`, `tests/unit/shellPaths.test.ts`

**Interfaces:**
- Produces: section key `"assigned"`, root `/learners/:id/assigned`; `activeFor("/learners/x/assigned")` → `{ section: "assigned", child: null }`.

- [ ] **Step 1: Write the failing tests** (append to each file's main `describe`)

`tests/unit/shellNav.test.ts`:

```ts
  it("Bài đã giao sits right after Giao bài and opens the child's list", () => {
    const keys = buildNav("tutor", "L1", { revisionsReady: true }).sections.map((s) => s.key);
    expect(keys.indexOf("assigned")).toBe(keys.indexOf("assign") + 1);
    const s = buildNav("parent", "L1", { revisionsReady: true }).sections.find((x) => x.key === "assigned")!;
    expect(s).toMatchObject({ label: "Bài đã giao", status: "live", href: "/learners/L1/assigned", children: [] });
  });
```

`tests/unit/shellPaths.test.ts`:

```ts
  it("/learners/:id/assigned lights Bài đã giao; switching child keeps the page", () => {
    expect(activeFor("/learners/L1/assigned")).toMatchObject({ section: "assigned", child: null });
    expect(switchHref("/learners/L1/assigned", "L2")).toBe("/learners/L2/assigned");
  });
```

(Import `buildNav` / `activeFor` / `switchHref` if the files do not already.) Existing tests that list every section key in order must gain `"assigned"` after `"assign"`; update those expectations.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/shellNav.test.ts tests/unit/shellPaths.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/shell/nav.ts`:

```ts
export const SECTION_KEYS = ["desk", "profile", "knowledge", "roadmap", "sessions", "assign", "assigned", "results", "curricula", "inbox"] as const;
```

and in `SECTIONS`, right after the `assign` entry:

```ts
  { key: "assigned", status: "live", lane: null, root: (id) => `${L(id)}/assigned`, children: () => [] },
```

`lib/copy/vi.ts`: in `shellCopy.sections` add `assigned: "Bài đã giao",` after `assign`; in `appFeedback.screens` add `assigned: "Bài đã giao",`.

`lib/shell/paths.ts`: in `RULES` right after the `lp("/assign")` rule:

```ts
  { re: lp("/assigned"), section: "assigned", child: null, screen: S.assigned },
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/shellNav.test.ts tests/unit/shellPaths.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/shell/nav.ts lib/shell/paths.ts lib/copy/vi.ts tests/unit/shellNav.test.ts tests/unit/shellPaths.test.ts
git commit -m "feat(assigned): sidebar section Bài đã giao"
```

### Task 8: The "Bài đã giao" page with four tabs

**Files:**
- Create: `components/assigned/BoardTabs.tsx`, `app/learners/[id]/assigned/page.tsx`
- Modify: `lib/copy/vi.ts` (new `assignedBoardCopy`)
- Test: `tests/unit/assignedBoardTabs.test.ts`

**Interfaces:**
- Consumes: `buildBoard`, `parseTab`, `BOARD_TABS`, `BoardTab` (Task 6); `loadStudioAssigned`, `loadAssignments`, `loadTags`, `maxPagesPerSubmission`, `requireLearnerPage(id, "practice:write")` (same gate as `/assign`); existing `StudioAssignedTable`, `AssignmentTable`.
- Produces: `<BoardTabs learnerId tab counts />` (server, links `?tab=`); page URL `/learners/:id/assigned?tab=need|doing|done|removed`.

- [ ] **Step 1: Copy** (`lib/copy/vi.ts`, after `studioAssignedCopy`)

```ts
// Bài đã giao (24/11): one place to follow every piece of work given to one child. Adults only.
export const assignedBoardCopy = {
  title: (alias: string) => `Bài đã giao · ${alias}`,
  intro: "Mọi bài đã giao ở một chỗ: bài trên app, bài link, bài PDF.",
  newWork: "+ Giao bài mới",
  tabsLabel: "Tình trạng bài",
  tab: { need: `Cần ${tutorHonorific} xử lý`, doing: "Con đang làm", done: "Đã xong", removed: "Đã gỡ" } as Record<"need" | "doing" | "done" | "removed", string>,
  tabCount: (label: string, n: number) => `${label} · ${n}`,
  hint: {
    need: `Con đã nộp, đang chờ ${tutorHonorific}: chấm câu tự luận, ghi kết quả hoặc góp ý.`,
    doing: "Con chưa nộp. Bài quá hạn lâu nhất nằm trên cùng; gỡ bài giao nhầm hoặc giao thử ở đây.",
    done: "Đã chấm và đã góp ý. Không còn việc gì.",
    removed: "Bài đã gỡ hoặc đã thu hồi. Con không thấy các bài này.",
  } as Record<"need" | "doing" | "done" | "removed", string>,
  empty: {
    need: `Không có bài nào chờ ${tutorHonorific}.`,
    doing: "Con không còn bài nào đang mở.",
    done: "Chưa có bài nào xong hẳn.",
    removed: "Chưa gỡ bài nào.",
  } as Record<"need" | "doing" | "done" | "removed", string>,
  studioList: "Bài trên app",
  practiceList: "Bài link / PDF",
  topicLink: "Bài chủ đề đã giao →",
};
```

- [ ] **Step 2: Write the failing render test** `tests/unit/assignedBoardTabs.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardTabs } from "@/components/assigned/BoardTabs";
import { assignedBoardCopy as c } from "@/lib/copy/vi";

describe("Bài đã giao: the tab row", () => {
  it("four links with counts; the open one is marked for screen readers; ≥44px", () => {
    const h = renderToStaticMarkup(createElement(BoardTabs, { learnerId: "L1", tab: "doing", counts: { need: 2, doing: 3, done: 1, removed: 0 } }));
    for (const t of ["need", "doing", "done", "removed"] as const) expect(h).toContain(`href="/learners/L1/assigned?tab=${t}"`);
    expect(h).toContain(c.tabCount(c.tab.need, 2));
    expect(h).toContain(c.tabCount(c.tab.removed, 0));
    expect(h.match(/aria-current="page"/g)).toHaveLength(1);
    expect(h).toMatch(/aria-current="page"[^>]*>Con đang làm · 3|Con đang làm · 3/);
    expect(h).toContain("min-h-11");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/unit/assignedBoardTabs.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `components/assigned/BoardTabs.tsx`

```tsx
import Link from "next/link";
import { assignedBoardCopy as c } from "@/lib/copy/vi";
import { BOARD_TABS, type BoardTab } from "@/lib/assigned/board";

/** The four tabs of Bài đã giao as plain links (?tab=): works without JS, keeps the tab in the URL for "Bàn làm việc" links. */
export function BoardTabs({ learnerId, tab, counts }: { learnerId: string; tab: BoardTab; counts: Record<BoardTab, number> }) {
  return (
    <nav aria-label={c.tabsLabel} className="flex flex-wrap gap-2" data-testid="board-tabs">
      {BOARD_TABS.map((t) => {
        const on = t === tab;
        const warn = t === "need" && counts.need > 0 && !on;
        return (
          <Link
            key={t}
            href={`/learners/${learnerId}/assigned?tab=${t}`}
            aria-current={on ? "page" : undefined}
            data-testid={`board-tab-${t}`}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-semibold ${
              on ? "border-accent bg-accent text-white" : warn ? "border-[#e2c98f] bg-[#FBF1DC] text-[#6B4600]" : "border-line bg-white text-ink"
            }`}
          >
            {c.tabCount(c.tab[t], counts[t])}
          </Link>
        );
      })}
    </nav>
  );
}
```

`app/learners/[id]/assigned/page.tsx`:

```tsx
import Link from "next/link";
import { BoardTabs } from "@/components/assigned/BoardTabs";
import { AssignmentTable } from "@/components/practice/AssignmentTable";
import { StudioAssignedTable } from "@/components/studio/StudioAssignedTable";
import { buildBoard, parseTab } from "@/lib/assigned/board";
import { assignedBoardCopy as c, learnerWithTrack } from "@/lib/copy/vi";
import { todayVn } from "@/lib/inquiries/dates";
import { maxPagesPerSubmission } from "@/lib/practice/capabilities";
import { loadAssignments } from "@/lib/practice/load";
import { loadStudioAssigned } from "@/lib/studio/assignedLoad";
import { loadTags } from "@/lib/tutorwork/load";
import { requireLearnerPage } from "@/lib/tutorwork/page";

export const dynamic = "force-dynamic";

/** "Bài đã giao" (24/11): follow every piece of work given to one child, by what the adult has to do. Tutor of the child or parent. */
export default async function AssignedBoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { learner, member } = await requireLearnerPage(id, "practice:write");
  const today = todayVn();
  const [studio, assignments, tags, maxFiles] = await Promise.all([
    loadStudioAssigned(learner.id, today).catch(() => null),
    loadAssignments(learner.id),
    loadTags(learner.trackId),
    maxPagesPerSubmission(),
  ]);
  const board = buildBoard(studio, assignments, today);
  const tab = parseTab(sp.tab, board.counts);
  const tagLabels = Object.fromEntries(tags.map((t) => [t.key, t.label]));
  const studioRows = board.studio[tab];
  const practiceRows = board.practice[tab];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4" data-testid="assigned-board">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{c.title(learner.alias)}</h1>
          <p className="mt-1 text-sm text-muted">{learnerWithTrack(learner.alias, learner.trackId)} · {c.intro}</p>
        </div>
        <Link href={`/learners/${learner.id}/assign`} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-semibold text-white">
          {c.newWork}
        </Link>
      </div>
      <BoardTabs learnerId={learner.id} tab={tab} counts={board.counts} />
      <p className="text-sm text-muted">{c.hint[tab]}</p>
      {board.studioFailed || studioRows.length > 0 ? (
        <div data-testid="board-studio">
          <StudioAssignedTable rows={board.studioFailed ? null : studioRows} title={c.studioList} />
        </div>
      ) : null}
      {practiceRows.length > 0 ? (
        <section className="flex flex-col gap-3" data-testid="board-practice" id="assigned-list">
          <h2 className="text-lg font-semibold">{c.practiceList}</h2>
          <AssignmentTable learnerId={learner.id} assignments={practiceRows} tagLabels={tagLabels} viewerMemberId={member.id} maxFiles={maxFiles} today={today} />
        </section>
      ) : null}
      {!board.studioFailed && studioRows.length === 0 && practiceRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-4 py-5 text-muted" data-testid="board-empty">{c.empty[tab]}</p>
      ) : null}
      <Link href={`/learners/${learner.id}/inquiries#assigned`} className="inline-flex min-h-11 items-center text-sm text-accent underline">
        {c.topicLink}
      </Link>
    </div>
  );
}
```

`StudioAssignedTable` gains an optional `title?: string` prop (default `c.title`), used in its `<h2>`:

```tsx
export function StudioAssignedTable({ rows, title = c.title }: { rows: StudioAssignedRow[] | null; title?: string }) {
```

and `{title}` replaces `{c.title}` inside the `<h2>`.

Check `AssignmentTable`'s props by opening `components/practice/AssignmentTable.tsx:36-50`; pass exactly the props the `/assign` page passes today.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/assignedBoardTabs.test.ts tests/unit/studioAssignedTable.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/assigned/BoardTabs.tsx app/learners/[id]/assigned/page.tsx components/studio/StudioAssignedTable.tsx lib/copy/vi.ts tests/unit/assignedBoardTabs.test.ts
git commit -m "feat(assigned): page Bài đã giao with four tabs over the existing lists"
```

### Task 9: "Giao bài" only creates work; drafts being prepared are shown there

**Files:**
- Modify: `app/learners/[id]/assign/page.tsx`, `app/studio/new/page.tsx`, `lib/copy/vi.ts` (`assignWaysCopy`)
- Test: `tests/unit/assignPage.test.ts`

**Interfaces:**
- Consumes: `loadDraftList(learnerId): Promise<DraftListItem[]>` (`lib/studio/load.ts`), `DraftList` (`components/studio/DraftList.tsx`).
- Produces: `/assign` shows: the four ways, a banner linking to `/learners/:id/assigned`, then "Bản nháp đang soạn" (drafts with `assigned === 0` and not superseded). No assigned lists on `/assign` or `/studio/new`.

- [ ] **Step 1: Copy** (in `assignWaysCopy`)

```ts
  followBanner: "Muốn xem con làm đến đâu, bài nào quá hạn?",
  followLink: "Mở Bài đã giao →",
  draftsTitle: (n: number) => `Bản nháp đang soạn · ${n}`,
  draftsHelp: "Bài chưa giao: con chưa thấy. Duyệt xong mới chọn hạn và giao.",
```

- [ ] **Step 2: Update the failing expectations** in `tests/unit/assignPage.test.ts`

In the test "no way: the chooser with four cards, the assigned list and the two 'see' links": rename it to "no way: the four cards, the follow banner and the drafts being prepared", and replace `expect(r.html).toContain('data-testid="assigned-list"')` with:

```ts
    expect(r.html).not.toContain('data-testid="assigned-list"');
    expect(r.html).not.toContain('data-testid="studio-assigned"');
    expect(r.html).toContain('data-testid="follow-banner"');
    expect(r.html).toContain('href="/learners/');
    expect(r.html).toContain("/assigned\"");
```

Also mock `loadDraftList` the same way the file mocks the other loaders (look at its `vi.mock(...)` block at the top) to return one draft `{ id: "d1", title: "U15-1", status: "draft", updatedAt: "2026-11-24T01:00:00Z", templateId: null, templateVersion: null, superseded: false, assigned: 0 }` and assert `expect(r.html).toContain("U15-1")`.

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/unit/assignPage.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

In `app/learners/[id]/assign/page.tsx`:
- remove the `list` and `studioList` constants and every place they are rendered, and the imports `AssignmentTable`, `StudioAssignedTable`, `loadStudioAssigned`, `loadAssignments`, `maxPagesPerSubmission` that become unused;
- add `loadDraftList(learner.id).catch(() => [])` to the `Promise.all` (import from `@/lib/studio/load`) and `import { DraftList } from "@/components/studio/DraftList";`;
- add after `head` in both branches (the chooser and the `kind` form):

```tsx
const follow = (
  <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#e3ece8] px-4 py-2 text-[15px] text-[#1f4439]" data-testid="follow-banner">
    <span>{assignWaysCopy.followBanner}</span>
    <Link href={`/learners/${learner.id}/assigned`} className="inline-flex min-h-11 items-center font-semibold underline">{assignWaysCopy.followLink}</Link>
  </p>
);
const open = drafts.filter((d) => d.assigned === 0 && !d.superseded);
const draftsBlock = open.length > 0 ? (
  <section className="flex flex-col gap-2" data-testid="assign-drafts">
    <p className="text-sm text-muted">{assignWaysCopy.draftsHelp}</p>
    <DraftList drafts={open} />
  </section>
) : null;
```

Render `{follow}` right after `{head}`, and `{draftsBlock}` after `<WayCards …/>` in the chooser branch (in the form branch after `<AssignForm …/>`). Keep the "Bài đã tạo từ đề →" link; drop "Bài chủ đề đã giao →" (it moved to Bài đã giao).

If `DraftList` renders its own `<h2>` with `studioCopy.draftsTitle`, keep it (do not duplicate a heading); `assignWaysCopy.draftsTitle` is then unused, delete it from the copy.

In `app/studio/new/page.tsx`: remove `<div className="mt-8"><StudioAssignedTable rows={assigned} /></div>`, the `loadStudioAssigned` call and its imports; after `<DiscardedDrafts …/>` add:

```tsx
<p className="mt-8"><Link href={`/learners/${l.id}/assigned`} className="inline-flex min-h-11 items-center text-accent underline">{assignWaysCopy.followLink}</Link></p>
```

(import `assignWaysCopy` from `@/lib/copy/vi`).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/assignPage.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/learners/[id]/assign/page.tsx app/studio/new/page.tsx lib/copy/vi.ts tests/unit/assignPage.test.ts
git commit -m "feat(assigned): Giao bài only creates work; drafts being prepared shown there"
```

### Task 10: Bàn làm việc goes straight to the right tab

**Files:**
- Modify: `lib/desk/alerts.ts` (two hrefs)
- Test: `tests/unit/deskAlerts.test.ts` (lines with `#assigned-list` and `#studio-assigned`)

- [ ] **Step 1: Update the expectations**

```ts
    expect(t[2]).toMatchObject({ title: deskCopy.alerts.overdueTitle(1), href: `/learners/${L}/assigned?tab=doing` });
```

```ts
    expect(rows.find((r) => r.key === "studio-overdue")).toMatchObject({ tone: "warn", href: "/learners/L1/assigned?tab=doing" });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/deskAlerts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** in `lib/desk/alerts.ts`: `href: \`${base}/assign#assigned-list\`` → `href: \`${base}/assigned?tab=doing\``, and `href: \`${base}/assign#studio-assigned\`` → `href: \`${base}/assigned?tab=doing\``. Then `grep -rn "assign#" app components lib` and point any other link at `/assigned` (tab `need` for "chờ chấm", `doing` for overdue).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/deskAlerts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/desk/alerts.ts tests/unit/deskAlerts.test.ts
git commit -m "feat(assigned): desk alerts open Bài đã giao on the right tab"
```

### Task 11: Warn before giving the same work twice

**Files:**
- Create: `lib/assigned/duplicates.ts`
- Modify: `components/studio/AssignStudioForm.tsx` (prop `duplicate`), `app/studio/drafts/[id]/page.tsx`, `components/practice/AssignForm.tsx` (prop `openTitles`), `app/learners/[id]/assign/page.tsx`, `lib/copy/vi.ts`
- Test: `tests/unit/assignedDuplicates.test.ts`, `tests/dom/studioAssignUnits.test.tsx` (one new `it`), `tests/dom/assignForm.test.tsx` (one new `it`)

**Interfaces:**
- Produces: `normTitle(t: string): string`; `openTitles(studio: readonly StudioAssignedRow[] | null, practice: readonly AssignmentView[]): string[]` (normalized titles of work still open = tab "doing"); `isDuplicate(title: string, open: readonly string[]): boolean`.
- `AssignStudioForm` new optional prop `duplicate?: boolean`; `AssignForm` new optional prop `openTitles?: string[]`.

- [ ] **Step 1: Copy** (`studioAssignedCopy`)

```ts
  duplicateWarning: "Con đang có một bài cùng tên chưa nộp. Giao thêm sẽ thành hai bài; nếu bài cũ giao nhầm, gỡ nó ở Bài đã giao.",
```

- [ ] **Step 2: Write the failing unit test** `tests/unit/assignedDuplicates.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { isDuplicate, normTitle, openTitles } from "@/lib/assigned/duplicates";
import type { StudioAssignedRow } from "@/lib/studio/assigned";
import type { AssignmentView } from "@/lib/practice/types";

const st = (title: string, status: StudioAssignedRow["status"]) => ({ title, status, feedbackReady: true, feedbackGiven: false } as StudioAssignedRow);
const pr = (title: string, o: Partial<AssignmentView> = {}) => ({ title, retractedAt: null, submission: null, resultId: null, feedback: [], ...o } as AssignmentView);

describe("same work given twice", () => {
  it("normTitle ignores case, spaces and the separators people type differently", () => {
    expect(normTitle("  Destination C1,  C2 - Unit 15 ")).toBe(normTitle("destination c1 c2 · unit 15"));
  });
  it("only work the child has not sent and that was not removed counts as open", () => {
    const open = openTitles([st("Unit 14 · Idioms (L)", "overdue"), st("Review 1", "checked"), st("Old", "skipped")], [pr("Link A"), pr("Link B", { retractedAt: "x" })]);
    expect(isDuplicate("unit 14 · idioms (l)", open)).toBe(true);
    expect(isDuplicate("Review 1", open)).toBe(false);
    expect(isDuplicate("Old", open)).toBe(false);
    expect(isDuplicate("Link A", open)).toBe(true);
    expect(isDuplicate("Link B", open)).toBe(false);
    expect(isDuplicate("", open)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/unit/assignedDuplicates.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `lib/assigned/duplicates.ts`

```ts
/** "Giao trùng" (24/11): a warning only — giving the same work twice stays allowed (a retry on purpose is legitimate). Pure. */
import type { AssignmentView } from "@/lib/practice/types";
import type { StudioAssignedRow } from "@/lib/studio/assigned";
import { tabOfPractice, tabOfStudio } from "./board";

export const normTitle = (t: string): string =>
  t.normalize("NFC").toLowerCase().replace(/[·,\-–—:|/]+/g, " ").replace(/\s+/g, " ").trim();

export function openTitles(studio: readonly StudioAssignedRow[] | null, practice: readonly AssignmentView[]): string[] {
  return [
    ...(studio ?? []).filter((r) => tabOfStudio(r) === "doing").map((r) => normTitle(r.title)),
    ...practice.filter((a) => tabOfPractice(a) === "doing").map((a) => normTitle(a.title)),
  ];
}

export const isDuplicate = (title: string, open: readonly string[]): boolean => {
  const t = normTitle(title);
  return t.length > 0 && open.includes(t);
};
```

- [ ] **Step 5: Wire the warnings**

`components/studio/AssignStudioForm.tsx`: add `duplicate = false` to the props (`{ draftId, today, learnerId, unitChoices = [], duplicate = false }` and its type `duplicate?: boolean`), and right after the `<h3>`:

```tsx
{duplicate ? <p role="note" className="w-full rounded-lg bg-[#FBF1DC] px-3 py-2 text-sm text-[#6B4600]" data-testid="assign-duplicate">{studioAssignedCopy.duplicateWarning}</p> : null}
```

(import `studioAssignedCopy`).

`app/studio/drafts/[id]/page.tsx`: load `loadStudioAssigned(draft.learnerId, todayVn()).catch(() => null)` and `loadAssignments(draft.learnerId).catch(() => [])` next to its other loads, then pass `duplicate={isDuplicate(draft.title, openTitles(studio, practice))}` to `<AssignStudioForm …/>`.

`components/practice/AssignForm.tsx`: add `openTitles = []` prop (`openTitles?: string[]`); under the title input render the same `<p role="note" …>` when `isDuplicate(title, openTitles)` (`title` = the form's title state; check its name in the file).

`app/learners/[id]/assign/page.tsx`: load `loadStudioAssigned(learner.id, todayVn()).catch(() => null)` and `loadAssignments(learner.id)` again (only for this), and pass `openTitles={openTitles(studio, assignments)}` to `<AssignForm …/>`.

- [ ] **Step 6: DOM tests**

`tests/dom/studioAssignUnits.test.tsx`, new `it` in its `describe`:

```tsx
  it("a duplicate shows a warning but still assigns", async () => {
    render(<AssignStudioForm draftId="d1" today="2026-11-21" learnerId="l1" unitChoices={[]} duplicate />);
    expect(screen.getByTestId("assign-duplicate").textContent).toBe(studioAssignedCopy.duplicateWarning);
    fireEvent.click(screen.getByRole("button", { name: studioCopy.assign }));
    await waitFor(() => expect(studioSend).toHaveBeenCalled());
  });
```

(import `studioAssignedCopy`, `studioCopy` from `@/lib/copy/vi`; if the submit button's name differs, read it from `components/studio/AssignStudioForm.tsx`.)

`tests/dom/assignForm.test.tsx`, new `it`: render `AssignForm` with the props the file already uses plus `openTitles={["destination c1 c2"]}`, type "Destination C1 C2" in the title field, expect `screen.getByRole("note").textContent` toBe `studioAssignedCopy.duplicateWarning`; type "Unit 16" → `screen.queryByRole("note")` is null.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/unit/assignedDuplicates.test.ts tests/dom/studioAssignUnits.test.tsx tests/dom/assignForm.test.tsx && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/assigned/duplicates.ts components/studio/AssignStudioForm.tsx app/studio/drafts/[id]/page.tsx components/practice/AssignForm.tsx app/learners/[id]/assign/page.tsx lib/copy/vi.ts tests/unit/assignedDuplicates.test.ts tests/dom/studioAssignUnits.test.tsx tests/dom/assignForm.test.tsx
git commit -m "feat(assigned): warn before giving the same open work twice"
```

### Task 12: "chưa góp ý" / "đã góp ý" on sent Studio work

**Files:**
- Modify: `lib/copy/vi.ts` (`studioAssignedCopy`), `components/studio/StudioAssignedTable.tsx`
- Test: `tests/unit/studioAssignedTable.test.ts`

- [ ] **Step 1: Copy**

```ts
  openWorkToFeedback: "Xem bài và góp ý",
  openWorkFed: "Xem bài · đã góp ý",
  noFeedbackYet: "chưa góp ý",
```

- [ ] **Step 2: Failing test** (append to `tests/unit/studioAssignedTable.test.ts`)

```ts
  it("sent work says whether feedback was given", () => {
    const base = { attempts: 1, lastAttemptId: "t1", lastSubmittedAt: "2026-11-16T02:00:00Z", episodeId: "e1", status: "checked" as const };
    const without = html([row({ ...base, feedbackGiven: false })]);
    expect(without).toContain(c.openWorkToFeedback);
    expect(without).toContain(c.noFeedbackYet);
    const fed = html([row({ ...base, feedbackGiven: true })]);
    expect(fed).toContain(c.openWorkFed);
    expect(fed).not.toContain(c.noFeedbackYet);
  });
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/unit/studioAssignedTable.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement** in `StudioAssignedTable.tsx`: the link text becomes

```tsx
{!r.feedbackReady ? c.openWork : r.feedbackGiven ? c.openWorkFed : c.openWorkToFeedback}
```

and in the meta line replace `{r.feedbackGiven ? <span …>{\` · ${c.feedbackGiven}\`}</span> : null}` with

```tsx
{r.feedbackReady && r.lastAttemptId ? <span data-testid={`studio-assigned-fb-${r.instanceId}`}>{` · ${r.feedbackGiven ? c.feedbackGiven : c.noFeedbackYet}`}</span> : null}
```

Remove `openWorkFeedback` from the copy if nothing else uses it (`grep -rn openWorkFeedback`).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/studioAssignedTable.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/copy/vi.ts components/studio/StudioAssignedTable.tsx tests/unit/studioAssignedTable.test.ts
git commit -m "feat(assigned): sent work says chưa góp ý / đã góp ý"
```

### Task 13: e2e, docs, checks, review, PR 2

**Files:**
- Modify: `tests/e2e/practice.spec.ts`, `tests/e2e/studio.spec.ts`, `docs/PROGRESS.md`, `docs/DESIGN.md` (`### 19.35`), `docs/UX_COPY_GUIDE.md`, `CLAUDE.md` (Current status: one line)

- [ ] **Step 1: e2e selectors**

Run: `grep -n "assigned-list\|studio-assigned\|see-topic\|/assign" tests/e2e/practice.spec.ts tests/e2e/studio.spec.ts`.
Every step that, after giving work, looks for the work in `#assigned-list` / `studio-assigned` on `/assign` or `/studio/new` must instead `page.goto(\`/learners/${id}/assigned?tab=doing\`)` (not yet sent) or `?tab=need` (sent) and look in `[data-testid="board-practice"]` / `[data-testid="board-studio"]`. Add one new e2e step in `studio.spec.ts` after a test is assigned: open `?tab=doing`, click `Gỡ bài` on it, type "Giao thử e2e", confirm, then check the tab `Đã gỡ · 1` and, signed in as the child, that Hôm nay no longer lists the title. (`npm run test:e2e -- --list` locally; the real run is the CI job "E2E smoke".)

- [ ] **Step 2: Docs**

`docs/PROGRESS.md`:

```md
## Bài đã giao · PR 2: mục mới "Bài đã giao" · Giao bài chỉ để tạo bài (24/11/2026)

Nhánh `feature/assigned-board`. Kế hoạch `docs/superpowers/plans/2026-11-24-bai-da-giao.md`. **Không có SQL.**

- Cột trái có mục **Bài đã giao** ngay dưới Giao bài: 4 tab "Cần thầy/cô xử lý" · "Con đang làm" · "Đã xong" · "Đã gỡ", mỗi tab có số bài; trong tab, bài trên app và bài link / PDF là hai danh sách (giữ nguyên các nút cũ: chấm, ghi kết quả, nộp thay, thu hồi, góp ý, gỡ bài).
- "Cần thầy/cô xử lý" gồm bài chờ chấm câu và bài đã chấm nhưng chưa góp ý (một hằng số `NEEDS_FEEDBACK_TO_FINISH`, đổi được).
- **Giao bài** chỉ còn 4 cách giao + "Bản nháp đang soạn" (bản nháp chưa giao) + dòng dẫn sang Bài đã giao. Trang "Tạo bài từ đề" bỏ danh sách đã giao.
- Bàn làm việc: báo "quá hạn" mở thẳng tab Con đang làm.
- Giao bài trùng tên với bài con chưa nộp: hiện cảnh báo (vẫn giao được).
- Bài đã nộp ghi rõ "chưa góp ý" / "đã góp ý".

**Cách thử trên preview:** cột trái → Bài đã giao → bấm qua 4 tab; Giao bài → không còn danh sách dài; mở một bản nháp đã từng giao → thấy cảnh báo trùng.
```

`docs/DESIGN.md` `### 19.35. Bài đã giao (không SQL)`: the tab rule of `tabOfStudio` / `tabOfPractice` (copy the two functions' doc in prose), `parseTab` default, the page reuses `StudioAssignedTable` / `AssignmentTable`, duplicate warning is advisory only.

`docs/UX_COPY_GUIDE.md`: `assignedBoardCopy` (all keys), `assignWaysCopy.followBanner` / `followLink` / `draftsHelp`, `studioAssignedCopy.duplicateWarning`, `openWorkToFeedback` / `openWorkFed` / `noFeedbackYet`, `shellCopy.sections.assigned`.

`CLAUDE.md` Current status, one new bullet: "**Bài đã giao** (24/11, không SQL): PR 1 gỡ bài / khôi phục / quá hạn n ngày; PR 2 mục mới Bài đã giao 4 tab, Giao bài chỉ để tạo bài. Kế hoạch `docs/superpowers/plans/2026-11-24-bai-da-giao.md`."

- [ ] **Step 3: Full checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 4: Review** — `reviewer` agent on `git diff origin/main...HEAD`; fix; rerun Step 3.

- [ ] **Step 5: Commit, push, open PR 2**

```bash
git add tests/e2e docs CLAUDE.md
git commit -m "docs(assigned): PR 2 Bài đã giao"
git push -u origin feature/assigned-board
gh api repos/haleytruong89-moon/Enghlish-app/pulls -f title='Mục Bài đã giao (4 tab) · Giao bài chỉ để tạo bài' -f head='feature/assigned-board' -f base='main' -F body=@/tmp/pr2.md
```

PR body in Vietnamese: làm gì · cách thử · **SQL: không có** · tiêu chí · deviation D-e (two lists per tab) · attribution lines. Wait for CI (`CI` workflow: unit · DB · E2E) to be green before reporting.
