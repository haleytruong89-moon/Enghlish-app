# L1 · "Xong một bài" Implementation Plan

> **For agentic workers:** Implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One adult screen per Studio submission: check the questions the app left to a person, see wrong answers and the child's retries, write feedback (with app-made suggestions, no AI), press "Xong bài", go to the next submission.

**Architecture:** A new page `/learners/[id]/finish/[attemptId]` (inside the learner layout) reads what already exists (episode view, item decisions, item meta + part names, unseen retries, Studio feedback) and hands a pure view model to one client component. The client calls the THREE existing APIs (grade items, write Studio feedback, mark retries seen). A queue (same Studio parts as "Chờ duyệt": questions to check, retries, missing feedback; oldest first) gives "Bài n / N" and "Bài tiếp". `/learners/[id]/finish` jumps to the oldest. No SQL, no AI.

**Tech Stack:** Next.js App Router, TypeScript strict, Tailwind, Vitest (unit, `renderToStaticMarkup`), Playwright (CI only).

**Spec:** Parent approval 26/11 07:18 ("ok") of the prototype https://claude.ai/artifact/NGdCAsNYyZ6Mgea4AzXC2j and its defaults: Studio only; done = no question waiting + at least one piece of feedback; skill scoring stays on the old review page (link only); no new SQL; the old inbox stays. Flow board on the same canvas. Audit 25/11 (L1).

## Global Constraints

- All UI copy in `lib/copy/vi.ts` (new block `finishCopy`); unknown labels fall back to `fallbackLabels.*`.
- No `if (track === …)`; no new tables, functions or migrations; no AI calls.
- Students never reach the page (gate `work:review`; outsiders 404). The child never sees scores; feedback text may not carry score words (`hasScoreWords`, enforced by the existing API; suggestions must not contain fractions, "%" or "điểm").
- Measurement rules unchanged: only the app's check or the adult's Đúng/Sai; out-of-app questions are shown as "Chỉ trên giấy" and never counted; blank = not right.
- `npm run typecheck && npm run lint && npm test` green; reviewer subagent before the PR.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/finish/view.ts` (new, pure) | Build parts / items from the episode view, decisions, meta, part names, retries; tally with local verdicts; suggestions; readiness |
| `lib/finish/queue.ts` (new, pure) | The ordered queue of submissions of one child; position + next |
| `lib/finish/paths.ts` (new) | `finishHref(learnerId, attemptId?)` |
| `lib/finish/load.ts` (new, server) | Load everything for one attempt + the queue |
| `components/finish/FinishWork.tsx` (new, client) | The screen: filter, Đúng/Sai, feedback form, "Xong bài" |
| `app/learners/[id]/finish/page.tsx` (new) | Jump to the oldest submission, or "nothing left" |
| `app/learners/[id]/finish/[attemptId]/page.tsx` (new) | The screen |
| `lib/desk/pending.ts`, `lib/desk/load.ts` | Studio rows (questions, retries, feedback) open the finish screen; merged rows prefer it |
| `lib/results/actions.ts` | The grade card opens `/learners/[id]/finish` |
| `components/studio/StudioAssignedTable.tsx` | "Xem cả bài làm · góp ý" → "Chấm và góp ý" on the finish screen |
| `lib/copy/vi.ts` | `finishCopy` |
| Tests | `tests/unit/finishView.test.ts`, `tests/unit/finishQueue.test.ts`, `tests/unit/finishUi.test.ts`, updates to deskPending / results / studioAssignedTable tests, one e2e check in `tests/e2e/studio.spec.ts` |

---

### Task 1: Pure view model (`lib/finish/view.ts`)

**Files:** Create `lib/finish/view.ts`; Test `tests/unit/finishView.test.ts`

**Interfaces:**
- Consumes: `ReviewEpisodeView` (`lib/review/types.ts`), `ItemMeta`, `Tally`, `partLabel`, `ratio` (`lib/results/score.ts`), `RetryItem` (`lib/studio/types.ts`), `questionNumber` (`lib/studio/view.ts`).
- Produces:
  ```ts
  export type Verdict = "correct" | "incorrect";
  export type FinishState = "correct" | "incorrect" | "blank" | "waiting" | "paper";
  export type FinishItem = { id: string; n: number; stem: string; given: string; key: string | null; state: FinishState; byAdult: boolean; needsAdult: boolean; retry: { text: string | null; revealed: boolean } | null };
  export type FinishPart = { key: string; label: string; items: FinishItem[] };
  export function buildFinishParts(i: { items: { id: string; stem: string }[]; answers: Record<string, unknown>; checks: ReviewEpisodeView["autoChecks"]; keys: ReviewEpisodeView["keys"]; decisions: Record<string, Verdict>; meta: ReadonlyMap<string, ItemMeta>; partNames: ReadonlyMap<string, string>; retries: readonly RetryItem[] }): FinishPart[];
  export function stateWith(item: FinishItem, local: Readonly<Record<string, Verdict>>): FinishState;
  export function tallyParts(parts: readonly FinishPart[], local?: Readonly<Record<string, Verdict>>): Tally;
  export function partTally(part: FinishPart, local?: Readonly<Record<string, Verdict>>): Tally;
  export function isIssue(item: FinishItem, local?: Readonly<Record<string, Verdict>>): boolean; // waiting, wrong, blank, or retried
  export function feedbackSuggestions(parts: readonly FinishPart[], local?: Readonly<Record<string, Verdict>>): { praise: string[]; fixes: string[] };
  export function finishReady(a: { waiting: number; hasFeedback: boolean }): { ready: boolean; missing: ("grade" | "feedback")[] };
  ```

- [ ] **Step 1: failing tests** — parts by `meta.part` in the order of first appearance, label via `partLabel(key, name)`, items sorted by `n`; a question with no part goes to a part keyed `""` labelled `finishCopy.noPart`; `needs_person` + decision → `byAdult`, no decision → `waiting` + `needsAdult`; out-of-app → `paper` (never counted); `stateWith` applies a local verdict only to a `needsAdult` item; tally counts blank as decided-not-right and ignores paper; suggestions: praise = the parts with ≥ 3 decided and all right (max 2), fixes = the parts with a wrong / blank answer, weakest first, max 3, text "Phần E · So sánh: xem lại câu 11, 12." (no fraction, no %); `finishReady`.
- [ ] **Step 2:** `npx vitest run --project unit tests/unit/finishView.test.ts` → FAIL (module missing).
- [ ] **Step 3:** implement (code in the repo; the copy strings come from `finishCopy.suggest`).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(finish): pure view model of one Studio submission`.

### Task 2: Queue + paths (`lib/finish/queue.ts`, `lib/finish/paths.ts`)

**Interfaces:**
- Consumes: `PendingAttempt`, `RetryAttempt` (`lib/studio/types.ts`), `FeedbackWaiting` (`lib/desk/pending.ts`).
- Produces:
  ```ts
  export const finishHref = (learnerId: string, attemptId?: string) => attemptId ? `/learners/${learnerId}/finish/${attemptId}` : `/learners/${learnerId}/finish`;
  export type QueueEntry = { attemptId: string; title: string; since: string; needs: ("check" | "retry" | "feedback")[] };
  export function buildFinishQueue(i: { learnerId: string; pending: readonly PendingAttempt[]; retries: readonly RetryAttempt[]; feedback: readonly FeedbackWaiting[] }): QueueEntry[]; // one entry per attempt, oldest first
  export function queuePlace(q: readonly QueueEntry[], attemptId: string): { index: number | null; total: number; prev: QueueEntry | null; next: QueueEntry | null };
  ```
- [ ] Tests: other children's attempts dropped; the three sources merged per attempt (earliest `since`, needs listed in that order); `queuePlace` when the attempt is in the queue (index 1-based, prev / next) and when it is not (done: `next` = the first entry). Implement, run, commit `feat(finish): queue of submissions waiting for an adult`.

### Task 3: Copy (`finishCopy` in `lib/copy/vi.ts`)

Add a block with: page title, crumbs, "Bài n / N", chips (sent day · waited n days, first attempt counted / given again, test of a test learner), steps 1–4, filter labels, item pills (`Đúng · app chấm`, `Sai · app chấm`, `Bỏ trống`, `Chờ thầy/cô`, `Đúng · thầy/cô chấm`, `Sai · thầy/cô chấm`, `Chỉ trên giấy`), retry lines, score box (tạm / chính thức), feedback labels (reuse limits from `MAX_FEEDBACK_PRAISE` / `MAX_FEEDBACK_ITEM`), suggestion texts, "Xong khi" checklist, buttons, done banner, errors, empty queue, link "Chấm kỹ năng · mức hỗ trợ (màn cũ)". Committed with Task 5.

### Task 4: Loader (`lib/finish/load.ts`)

**Interfaces:**
- Produces:
  ```ts
  export type FinishData = {
    attemptId: string; episodeId: string; learnerId: string; alias: string; title: string; submittedAt: string; waitingDays: number; counted: boolean;
    parts: FinishPart[]; feedback: SubmissionFeedbackView | null; feedbackReady: boolean; retrySeenThrough: string | null;
    queue: QueueEntry[];
  };
  export async function loadFinish(learnerId: string, attemptId: string, memberId: string, todayIso: string): Promise<FinishData | null | "not_studio">;
  export async function loadFinishQueue(learnerId: string, memberId: string, todayIso: string): Promise<QueueEntry[]>;
  ```
- Reads: `episodes` (user client, `attempt_id` = the attempt, learner = this child), `loadEpisode`, `loadItemDecisions`, `studio_item_meta` + approved `studio_drafts.payload->parts` of the episode's template, `loadRetryPending(memberId)`, `loadStudioFeedback(learnerId, attemptId)` (live row), `loadStudioPending(memberId)` + `loadStudioAssigned` + `feedbackWaiting` for the queue. `"not_studio"` when the template is not a Studio one (the page redirects to `/review/[episodeId]`). Failures of the queue / retries / feedback lookups degrade to empty, never block the page.
- No unit test (thin glue over tested pure code); covered by the e2e check.

### Task 5: Screen + pages

**Files:** `components/finish/FinishWork.tsx`, `app/learners/[id]/finish/page.tsx`, `app/learners/[id]/finish/[attemptId]/page.tsx`; Test `tests/unit/finishUi.test.ts`

- Client state: `local: Record<itemId, Verdict>`, `only: boolean` (default true when any issue), `praise`, `fixes: string[]` (≤ 3; pre-filled from the live feedback, else empty), `busy`, `msg`, `done`.
- "Lưu phần đã chấm": `POST /api/review/studio/attempts/{attemptId}` `{ items: [{ item_id, result }], client_id }` (only local verdicts).
- "Xong bài" (enabled when `finishReady`): grade (if any local verdict) → feedback `POST /api/learners/{L}/studio/attempts/{attemptId}/feedback` `{ client_id, praise?, items: [{text}], supersedes_id? }` (skipped when unchanged and a live one exists) → retries `POST /api/review/studio/attempts/{attemptId}/retry-seen` `{ seen_through, client_id }` when `retrySeenThrough` → `router.refresh()`; the banner shows "Đã xong" + next link.
- Pages: gate `requireLearnerPage(id, "work:review")`; `/finish` redirects to `finishHref(id, queue[0].attemptId)` or shows the empty state with a link to the desk; `/finish/[attemptId]` 404 when not this child's, redirect for non-Studio.
- Tests (`renderToStaticMarkup`): pills and numbers, the filter default, waiting items have Đúng / Sai, decided ones do not, paper items say "Chỉ trên giấy", suggestions render as buttons, "Xong bài" disabled while a question waits, the done banner when `initiallyDone`, the next link, the parent sees the same controls (tutor or parent may finish; the API decides).
- Commit `feat(finish): "Xong một bài" screen`.

### Task 6: Entry points

- `lib/desk/pending.ts`: `studio_check` and `retry` rows → `finishHref(a.learnerId, a.attemptId)`; `feedbackWaiting(rows, learnerId)` → `finishHref(learnerId, attemptId)`; `mergeBySubmission` takes the first part whose href is a finish screen, else the first part.
- `lib/desk/load.ts`: pass `learnerId` to `feedbackWaiting`.
- `lib/results/actions.ts`: grade card `href: finishHref(learnerId)` (always the queue).
- `components/studio/StudioAssignedTable.tsx`: the submission link → `finishHref(learnerId, lastAttemptId)` with text `finishCopy.openFromTable`.
- Update tests: `tests/unit/deskPending.test.ts`, `tests/unit/results.test.ts` (grade href), `tests/unit/studioAssignedTable.test.ts`.
- Commit `feat(finish): desk, Chờ duyệt, Bài đã giao and the grade card open "Xong một bài"`.

### Task 7: e2e check, docs, review, PR

- `tests/e2e/studio.spec.ts`: after the retry, the tutor opens `/learners/${NGUYEN}/finish/${attemptId}` and sees `finish-page`, the retry line of q2 and the feedback form (before the old "Đã xem" step, which still works).
- `docs/PROGRESS.md` entry; this plan's "Đã làm"; `docs/DESIGN.md` §19.36 short note.
- `npm run typecheck && npm run lint && npx vitest run --project unit`; reviewer subagent; fix; PR (no SQL).

## Đã làm (26/11)

Task 1–7 xong trên nhánh `feature/l1-xong-mot-bai`: `lib/finish/{view,queue,paths,load}.ts`, `components/finish/FinishWork.tsx`, hai trang `app/learners/[id]/finish/…`, `finishCopy`, lối vào (Chờ duyệt, thẻ Chấm bài / Khen, Bài đã giao), test unit (`finishView`, `finishQueue`, `finishUi` + cập nhật deskPending / deskLoad / results / resultsUi), một bước e2e trong `studio.spec.ts`.
