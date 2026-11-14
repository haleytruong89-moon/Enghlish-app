import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/AppHeader";
import { DeskAlerts } from "@/components/desk/DeskAlerts";
import { SessionsBox } from "@/components/desk/SessionsBox";
import { AssignmentTable, itemsText } from "@/components/practice/AssignmentTable";
import { SubmissionPreview } from "@/components/practice/SubmissionPreview";
import { ResultForm } from "@/components/tutor/ResultForm";
import { parseResultEdit } from "@/lib/tutorwork/shape";
import { StudentPractice } from "@/components/student/StudentPractice";
import { deskCopy, assignPage, practiceStudent, resultPage, sourceLabels, todayPage } from "@/lib/copy/vi";
import { deskAlerts } from "@/lib/desk/alerts";
import { isOverdue } from "@/lib/practice/overdue";
import type { AssignmentView, ReviewPoints, StudentPracticeItem } from "@/lib/practice/types";
import { fitWithin, outputMime } from "@/lib/storage/clientUpload";
import { MAX_IMAGE_SIDE } from "@/lib/storage/rules";
import type { TodayData } from "@/lib/tutorwork/load";
import { fixtureMap } from "./fixtures/skillMap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const link: StudentPracticeItem = {
  assignmentId: "c0000000-0000-4000-8000-000000000001", kind: "link", title: "Unless, even if", sourceKey: "test-english", url: "https://www.test-english.com/x",
  hasFile: false, dueOn: "2026-10-20", assignedOn: "2026-10-16", reviewed: false, submission: null,
};
const pdf: StudentPracticeItem = {
  ...link, assignmentId: "c0000000-0000-4000-8000-000000000002", kind: "pdf", title: "Đề 3", sourceKey: null, url: null, hasFile: true,
  submission: { submittedAt: "2026-10-16T09:00:00Z", attempt: "first", usedHint: false, fileCount: 2, hasLink: false },
};
const review: ReviewPoints = { sessionDate: "2026-10-15", message: "Nhớ đọc kỹ đề nhé", labels: ["Câu điều kiện", "Cụm động từ"] };

/** Words a student must never meet: scores, right / wrong, ranks, streaks, counts of mistakes. */
const SCORE_WORDS = /điểm|(?<![\d/])\d{1,3}\s*\/\s*\d{1,3}(?![\d/])|đúng|sai\b|chính xác|thắng|streak|chuỗi ngày|xếp hạng|%|kỹ năng/i;

describe("student practice copy", () => {
  it("has no score words, no counts and no streak or ranking in any string the student can see", () => {
    const all: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") all.push(v);
      else if (typeof v === "function") all.push(String((v as (...a: never[]) => unknown)(...([1, 2] as never[]))));
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(practiceStudent);
    expect(all.length).toBeGreaterThan(30);
    for (const s of all) expect(s, s).not.toMatch(SCORE_WORDS);
    // the child is addressed as "bạn", the tutor with the single honorific
    expect(practiceStudent.firstQ).toContain("bạn");
  });
});

describe("StudentPractice page", () => {
  const html = render(createElement(StudentPractice, { items: [link, pdf], review }));

  it("opens the link in a new tab, downloads the PDF through the app (never a storage path), and asks the two taps", () => {
    expect(html).toContain('data-testid="open-link"');
    expect(html).toContain('href="https://www.test-english.com/x"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(`href="/api/student/practice/${pdf.assignmentId}/file"`);
    expect(html).not.toMatch(/english-work|supabase|signed|token=/i);
    expect(html).toContain(practiceStudent.firstQ);
    expect(html).toContain(practiceStudent.hintQ);
  });

  it("shows only 'Việc cần ôn' labels and the tutor's message: no tags list, no score, no counts", () => {
    expect(html).toContain("Câu điều kiện");
    expect(html).toContain("Nhớ đọc kỹ đề nhé");
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(SCORE_WORDS);
    expect(html).toContain(`data-testid="sent-${pdf.assignmentId}"`); // the PDF one was already sent
  });

  it("an item the tutor has looked at can no longer be changed; an empty page says so politely", () => {
    const done = render(createElement(StudentPractice, { items: [{ ...pdf, reviewed: true }], review: null }));
    expect(done).toContain(practiceStudent.reviewed);
    expect(done).not.toContain("resend-");
    expect(done).toContain(practiceStudent.reviewNone);
    expect(render(createElement(StudentPractice, { items: [], review: null }))).toContain('data-testid="practice-empty"');
  });
});

describe("student navigation", () => {
  it("shows Việc tiếp theo and Bài luyện only when asked, and marks the current page", () => {
    expect(render(createElement(AppHeader, { name: "An" }))).not.toContain("nav-practice");
    const next = render(createElement(AppHeader, { name: "An", studentNav: "next" }));
    expect(next).toContain(practiceStudent.navPractice);
    expect(next).toContain(practiceStudent.navNext);
    const onPractice = render(createElement(AppHeader, { name: "An", studentNav: "practice" }));
    expect(onPractice.match(/aria-current="page"/g)).toHaveLength(1);
    expect(onPractice).toMatch(/aria-current="page"[^>]*>Bài luyện/);
  });
});

const assignment = (over: Partial<AssignmentView> = {}): AssignmentView => ({
  id: "c0000000-0000-4000-8000-000000000001", kind: "link", title: "Unless", url: "https://www.test-english.com/x", sourceKey: "test-english", tagKeys: [], units: [], unitItems: [],
  dueOn: null, frameId: null, createdAt: "2026-10-16T01:00:00Z", retractedAt: null, file: null, answerFile: null, submission: null, resultId: null, ...over,
});

describe("SubmissionPreview (staff)", () => {
  it("shows the screenshot through the access-checked route, the two taps the child declared, and a 'check them' note", () => {
    const html = render(
      createElement(SubmissionPreview, {
        assignment: assignment({
          submission: {
            id: "s1", createdAt: "2026-10-16T09:00:00Z", attempt: "retry", usedHint: true, linkUrl: "https://www.test-english.com/r", byRole: "student",
            files: [{ id: "d0000000-0000-4000-8000-000000000001", mime: "image/png", bytes: 1000 }, { id: "d0000000-0000-4000-8000-000000000002", mime: "application/pdf", bytes: 1000 }],
          },
        }),
      }),
    );
    expect(html).toContain('src="/api/files/d0000000-0000-4000-8000-000000000001"');
    expect(html).toContain('href="/api/files/d0000000-0000-4000-8000-000000000002"');
    expect(html).toContain(">xem to<");
    expect(html).toContain("Em khai: làm lại");
    expect(html).toContain("Em khai: có bấm Hint");
    expect(html).toContain("chưa dùng AI đọc ảnh");
    expect(html).toContain("https://www.test-english.com/r");
  });

  it("says nothing was sent when nothing was", () => {
    expect(render(createElement(SubmissionPreview, { assignment: assignment() }))).toContain('data-testid="submission-none"');
  });

  it("does not turn a non-https link into a clickable one", () => {
    const html = render(
      createElement(SubmissionPreview, {
        assignment: assignment({ submission: { id: "s", createdAt: "2026-10-16T09:00:00Z", attempt: "first", usedHint: false, linkUrl: "javascript:alert(1)", byRole: "student", files: [] } }),
      }),
    );
    expect(html).not.toContain("javascript:");
  });
});

describe("Bàn làm việc: practice", () => {
  const learnerId = "a0000000-0000-4000-8000-000000000001";
  const today = (practice: AssignmentView[]): TodayData => ({
    weak: { policyDays: 14, since: null, today: "2026-10-17", tags: [] }, repeats: [], due: [], untagged: [], lastNote: null, recent: null, practice, tagLabels: {},
  });
  const alertsHtml = (t: TodayData) =>
    render(createElement(DeskAlerts, { learnerId, items: deskAlerts({ learnerId, role: "tutor", todayIso: "2026-10-17", today: t, intakeMissing: false, curriculaCount: 1, flagCount: 0 }) }));

  it("shows only the counts of open practice (the list lives on the assign page)", () => {
    const html = render(createElement(SessionsBox, { learnerId, today: today([assignment()]), todayIso: "2026-10-17" }));
    expect(html).toContain(`href="/learners/${learnerId}/assign#assigned-list"`);
    expect(html).toContain(deskCopy.practiceCounts(1, 0, 0));
  });

  it("a submitted-but-unrecorded assignment becomes an attention row that opens the result form for it", () => {
    const a = assignment({
      submission: { id: "s1", createdAt: "2026-10-16T09:00:00Z", attempt: "first", usedHint: false, linkUrl: null, byRole: "student", files: [] },
    });
    const html = alertsHtml(today([a]));
    expect(html).toContain(`href="/learners/${learnerId}/results/new?assignment=${a.id}"`);
    expect(html).toContain(todayPage.submittedBadge);
    expect(html).toContain("cần ghi kết quả");
  });

  it("shows zero counts when nothing is open", () => {
    expect(render(createElement(SessionsBox, { learnerId, today: today([]), todayIso: "2026-10-17" }))).toContain(deskCopy.practiceCounts(0, 0, 0));
  });
});

describe("assign page labels", () => {
  it("names the link source the way the parent asked", () => {
    expect(sourceLabels["test-english"]).toBe("test-english");
    expect(sourceLabels.notebooklm).toBe("NotebookLM");
    expect(sourceLabels.gemini).toBe("Gemini");
    expect(sourceLabels.other).toBe("Link khác");
    expect(assignPage.kindLabel("link", "NotebookLM")).toContain("NotebookLM");
  });
});

describe("browser upload helpers", () => {
  it("fitWithin shrinks the longest side to the limit and never enlarges", () => {
    expect(fitWithin(3200, 1600)).toEqual({ width: MAX_IMAGE_SIDE, height: 800, scaled: true });
    expect(fitWithin(900, 4800)).toEqual({ width: 300, height: MAX_IMAGE_SIDE, scaled: true });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600, scaled: false });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
    expect(fitWithin(0, 0).scaled).toBe(false);
  });

  it("keeps screenshots as PNG and turns every other picture into JPEG", () => {
    expect(outputMime("image/png")).toBe("image/png");
    expect(outputMime("image/webp")).toBe("image/jpeg");
    expect(outputMime("image/jpeg")).toBe("image/jpeg");
  });
});

describe("a PDF has no Hint question", () => {
  it("the preview says 'not applicable' for a PDF submission, and the Hint answer for a link", () => {
    const sub = (usedHint: boolean | null) =>
      assignment({ submission: { id: "s", createdAt: "2026-10-16T09:00:00Z", attempt: "first", usedHint, linkUrl: null, byRole: "student", files: [] } });
    expect(render(createElement(SubmissionPreview, { assignment: sub(null) }))).toContain(resultPage.sentHintNA);
    expect(render(createElement(SubmissionPreview, { assignment: sub(true) }))).toContain(resultPage.sentHint);
    expect(render(createElement(SubmissionPreview, { assignment: sub(false) }))).not.toContain(resultPage.sentHintNA);
  });
});

describe("recorded assignment: 'Sửa kết quả' (the new result replaces the live one)", () => {
  const recorded = assignment({ resultId: "e0000000-0000-4000-8000-000000000001" });
  it("the table offers 'Sửa kết quả' for a recorded row and 'Ghi kết quả' for the others", () => {
    const html = render(
      createElement(AssignmentTable, { learnerId: "a0000000-0000-4000-8000-000000000001", assignments: [recorded, assignment({ id: "c0000000-0000-4000-8000-000000000009" })], tagLabels: {} }),
    );
    expect(html.match(new RegExp(assignPage.editResult, "g"))).toHaveLength(1);
    expect(html.match(new RegExp(`>${assignPage.recordResult}<`, "g"))).toHaveLength(1);
  });

  const edit = parseResultEdit({
    id: "e0000000-0000-4000-8000-000000000001", mode: "quick", frame_id: null, context: "home", attempt: "retry", source: "test", used_hint: true, title: "Unless",
    total_items: 10, correct: 8, wrong_items: [7, 4], item_tags: [{ n: 4, tag_key: "dang-tu" }, { n: 7, tag_key: null }], taken_on: "2026-10-10", assignment_id: "c0000000-0000-4000-8000-000000000001",
  });
  const form = (over: Record<string, unknown>) =>
    render(
      createElement(ResultForm, {
        learnerId: "a0000000-0000-4000-8000-000000000001", frames: [], map: fixtureMap(), tags: [{ key: "dang-tu", label: "Dạng từ", group: null, custom: false }],
        canClass: true, today: "2026-10-17", minDate: "2026-06-17", assignments: [recorded], initialAssignmentId: recorded.id, ...over,
      }),
    );

  it("opens filled in with the recorded values and a notice, with the assignment locked", () => {
    expect(edit?.wrongItems).toEqual([4, 7]);
    const html = form({ supersede: edit });
    expect(html).toContain('data-testid="supersede-notice"');
    expect(html).toContain(resultPage.supersedeTitle);
    expect(html).toContain(`results/new?assignment=${recorded.id}&amp;again=1`);
    expect(html).toContain('value="Unless"');
    expect(html).toContain('value="4, 7"');
    expect(html).toContain('value="2026-10-10"');
    expect(html).toMatch(/data-testid="assignment-pick"[^>]*disabled|disabled=""[^>]*data-testid="assignment-pick"/);
  });

  it("without supersede there is no notice; with initialRetry the attempt starts as 'Làm lại'", () => {
    expect(form({})).not.toContain("supersede-notice");
    expect(form({ initialRetry: true })).toMatch(/aria-pressed="true"[^>]*data-testid="attempt-retry"|data-testid="attempt-retry"[^>]*aria-pressed="true"/);
  });
});

describe("'Quá hạn' (D4): only a label for the tutor and the parent", () => {
  const SENT = { id: "s1", createdAt: "2026-10-16T09:00:00Z", attempt: "first" as const, usedHint: false, linkUrl: null, byRole: "student" as const, files: [] };
  it("overdue = due date before today, nothing sent, no result, not retracted; the due day itself is not late", () => {
    const base = assignment({ dueOn: "2026-10-17" });
    expect(isOverdue(base, "2026-10-18")).toBe(true);
    expect(isOverdue(base, "2026-10-17")).toBe(false); // due today
    expect(isOverdue(base, "2026-10-16")).toBe(false);
    expect(isOverdue({ ...base, dueOn: null }, "2026-10-18")).toBe(false); // no due date
    expect(isOverdue({ ...base, submission: SENT }, "2026-10-18")).toBe(false);
    expect(isOverdue({ ...base, resultId: "e0000000-0000-4000-8000-000000000001" }, "2026-10-18")).toBe(false);
    expect(isOverdue({ ...base, retractedAt: "2026-10-17T00:00:00Z" }, "2026-10-18")).toBe(false);
  });
  it("the Vietnamese day decides: 17:30 UTC on the 17th is already the 18th in Hà Nội", async () => {
    const { todayVn } = await import("@/lib/inquiries/dates");
    expect(todayVn(new Date("2026-10-17T16:59:00Z"))).toBe("2026-10-17");
    expect(todayVn(new Date("2026-10-17T17:01:00Z"))).toBe("2026-10-18");
    expect(isOverdue(assignment({ dueOn: "2026-10-17" }), todayVn(new Date("2026-10-17T16:59:00Z")))).toBe(false);
    expect(isOverdue(assignment({ dueOn: "2026-10-17" }), todayVn(new Date("2026-10-17T17:01:00Z")))).toBe(true);
  });
  it("the assignment table and the home card show the label for an overdue one, and not for the others", () => {
    const late = assignment({ id: "c0000000-0000-4000-8000-0000000000a1", dueOn: "2026-10-10" });
    const fine = assignment({ id: "c0000000-0000-4000-8000-0000000000a2", dueOn: "2026-10-30" });
    const sent = assignment({ id: "c0000000-0000-4000-8000-0000000000a3", dueOn: "2026-10-10", submission: SENT });
    const table = render(createElement(AssignmentTable, { learnerId: "a0000000-0000-4000-8000-000000000001", assignments: [late, fine, sent], tagLabels: {}, today: "2026-10-18" }));
    expect(table).toContain(`data-testid="overdue-${late.id}"`);
    expect(table).not.toContain(`data-testid="overdue-${fine.id}"`);
    expect(table).not.toContain(`data-testid="overdue-${sent.id}"`);
    expect(table).toContain(assignPage.overdue);

    const data: TodayData = { weak: { policyDays: 14, since: null, today: "2026-10-18", tags: [] }, repeats: [], due: [], untagged: [], lastNote: null, recent: null, practice: [late, fine], tagLabels: {} };
    const box = render(createElement(SessionsBox, { learnerId: "a0000000-0000-4000-8000-000000000001", today: data, todayIso: "2026-10-18" }));
    expect(box).toContain(deskCopy.practiceCounts(2, 0, 1));
  });
  it("the student's practice page never shows it, even for a late item", () => {
    const html = render(createElement(StudentPractice, { items: [{ ...link, dueOn: "2020-01-01" }], review }));
    expect(html).not.toContain(assignPage.overdue);
    expect(html).not.toContain(todayPage.practiceOverdue);
    expect(html).not.toMatch(/quá hạn|trễ|muộn/i);
  });
});

describe("the 'Luyện mục kiến thức' column with units (0029)", () => {
  const tl = { a: "Câu điều kiện", b: "Thành ngữ" };
  it("no units: the manual items as before; nothing: a dash", () => {
    expect(itemsText(assignment({ tagKeys: ["a", "b"] }), tl)).toBe("Câu điều kiện; Thành ngữ");
    expect(itemsText(assignment(), tl)).toBe(assignPage.nothingSent);
  });
  it("units first with the number of derived items, then '+ n mục thêm tay'", () => {
    const a = assignment({ units: [{ curriculumId: "c1", title: "Destination", codes: ["U3", "U4"] }], unitItems: ["x", "y", "z"], tagKeys: ["a"] });
    expect(itemsText(a, tl)).toBe("Unit 3–4 (3 mục) · + 1 mục thêm tay");
    expect(itemsText({ ...a, tagKeys: [] }, tl)).toBe("Unit 3–4 (3 mục)");
    expect(itemsText({ ...a, units: [...a.units, { curriculumId: "c2", title: "Reading", codes: ["U1"] }], tagKeys: [] }, tl)).toBe("Destination · Unit 3–4; Reading · Unit 1 (3 mục)");
  });
});
