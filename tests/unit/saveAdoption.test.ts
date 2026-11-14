import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every adult screen that saves something shows the one save-status pattern (UX round 2, item 2).
const FILES = [
  "components/curriculum/VersionReview.tsx", "components/studio/DraftEditor.tsx", "components/import/ImportConfirm.tsx",
  "components/workdesk/IntakeCard.tsx", "components/workdesk/TeachingNotesCard.tsx",
  "components/tutor/SessionNoteForm.tsx", "components/tutor/ResultForm.tsx", "components/tutor/ReadingReportForm.tsx", "components/tutor/WritingTags.tsx",
  "components/tutor/PendingTags.tsx", "components/levels/BaselineForm.tsx", "components/levels/AdjustForm.tsx", "components/levels/ExternalResultForm.tsx",
  "components/practice/AssignForm.tsx", "components/studio/AssignStudioForm.tsx", "components/workdesk/FeedbackForm.tsx",
  "components/review/LessonNoteForm.tsx", "components/review/ScoringPanel.tsx", "components/review/ModifyForm.tsx", "components/skills/ManualForm.tsx",
];

describe("save-status adoption", () => {
  it.each(FILES)("%s uses useSaveStatus and renders SaveStatus", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toMatch(/useSaveStatus\(/);
    expect(src).toMatch(/<SaveStatus\b/);
  });
});
