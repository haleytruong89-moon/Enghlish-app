# Duyệt đề: xóa phần, tự đánh số lại, bỏ nháp có hỏi lại, lỗi chặn Duyệt ghi rõ (21/11)

**Goal:** Fix what Nguyên's tutor hit on 20/11 when cutting "Word formation (M–P)" from 4 exercises to 2: no way to delete a part, deleting questions broke the numbering and blocked Duyệt, and the draft then disappeared (most likely "Bỏ bản nháp", one click, right beside Duyệt).

**Approved by the parent (chat 21/11):** the four items below. **No SQL, no AI.** Branch `feature/studio-editor-fixes`.

**Reproduced on a local database with the real file** (41 questions; M 1–13, N 14–23, O 24–35, P 36–41):
- keep M + N → Duyệt works;
- keep O + P, or M + O → `numbering` blocks Duyệt; if forced, the database refuses the frame ("a range outside 1..total_items").

## What changes

| # | Change | Where |
|---|---|---|
| 1 | **"Xóa phần"** on each part: removes the part and all its questions, after `window.confirm` (pattern of `VersionReview`, `AssignmentTable`) that names the part and the number of questions | `DraftEditor` |
| 2 | **Numbers follow the screen**: after removing a question or a part, adding a question, or moving a question to another part, questions are renumbered 1..N in part order. The "Số câu" input is removed (it changed the React key on every keystroke and, on a collision, later edits wrote to two questions). A draft that arrives with broken numbering shows a **"Đánh số lại"** button beside the alert | new `lib/studio/editOps.ts` (pure), `DraftEditor`, `ItemCard` |
| 3 | **"Bỏ bản nháp"** asks first (`window.confirm`) and sits alone at the far end, away from Lưu nháp / Duyệt | `DraftEditor` |
| 4 | **Blocked Duyệt says what and where**: under the buttons, one line per blocking issue ("Câu 12: Thiếu đáp án"; first 8, then "và n lỗi khác"); a click scrolls to the question | `DraftEditor`, `lib/copy/vi.ts` |

Also fixed because the same code is touched:
- "+ Phần" could reuse an existing part letter after a part was removed (→ `duplicate_part`). It now takes the first free letter.
- "+ Câu" in a part that is not the last gave the new question the highest number (→ `part_not_contiguous`). It is now placed at the end of its part.
- Edits address a question by identity, not by its number, so a draft with a duplicated number cannot get two questions overwritten by one edit.

## Rules of `editOps` (each has unit tests)

- `renumber(d)`: order = position of the question's part in `d.parts` (unknown part last), then old `n`, then old array position; new `n` = 1..N. Parts, passages and every other field are untouched.
- `removeItem(d, item)`, `removePart(d, key)`, `addItem(d, part)`, `addPart(d)`, `moveToPart(d, item, part)`: each returns a renumbered draft.
- `numberingBroken(d)`: true when `renumber(d)` would change any `n` (drives "Đánh số lại").
- Renumbering only happens in a draft (status `draft`). An approved test is never touched; "Sửa đề đã duyệt" already makes a new draft and a new template version, and attempts keep their own snapshot.

## Not in this slice

Reordering questions inside a part (was only possible through the removed number box); showing discarded drafts; anything on the child's screens. Findings of the whole-flow review go to `docs/PROGRESS.md` for the parent to choose from.

## Tests

- Unit `tests/unit/studioEditOps.test.ts`: the tutor's three cases (keep first two / last two / 1st + 3rd parts → always 1..N, valid, `buildStudioBuild` ranges inside 1..total); add in a middle part; first free letter; move to another part; duplicated numbers.
- DOM `tests/dom/studioDraftEditorOps.test.tsx`: Xóa phần (confirm no → nothing; yes → part and questions gone, numbers 1..N, Duyệt enabled); Xóa câu renumbers; Bỏ bản nháp asks first; blocked list names the question; "Đánh số lại".
- DB `tests/db/studioEditOps.test.ts`: a draft cut with `removePart` is approved and assigned; the child gets q1..qN.
- `npm run typecheck && npm run lint && npm test`; agent `reviewer` before the PR.
