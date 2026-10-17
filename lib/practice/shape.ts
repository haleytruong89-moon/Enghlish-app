/**
 * Parse what the database returns for the practice screens (jsonb from the eng_* functions). zod strips unknown keys; anything
 * unexpected throws (→ 500, logged) instead of showing a half-right page. The student parsers are an ALLOWLIST: a field the student
 * must not see (tags, frame, result, answer key) is not read here, so it cannot reach the page even if a function started returning it.
 */
import { z } from "zod";
import { SOURCE_KEYS } from "./link";
import type { AssignmentView, ReviewPoints, StoredFile, StudentPracticeItem } from "./types";

const text = z.string();
const nullableText = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v ?? null);
const sourceKey = z
  .enum(SOURCE_KEYS)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const fileRow = z.object({ id: text, mime: text, bytes: z.number().int() });
const nullableFile = fileRow
  .nullable()
  .optional()
  .transform((v): StoredFile | null => v ?? null);

const submissionRow = z.object({
  id: text,
  created_at: text,
  attempt: z.enum(["first", "retry"]),
  used_hint: z.boolean().nullable().optional().transform((v) => v ?? null),
  link_url: nullableText,
  by_role: z.enum(["student", "tutor", "parent"]),
  files: z.array(fileRow).default([]),
});

const assignmentRow = z.object({
  id: text,
  kind: z.enum(["link", "pdf"]),
  title: text,
  url: nullableText,
  source_key: sourceKey,
  tag_keys: z.array(text).default([]),
  due_on: nullableText,
  frame_id: nullableText,
  created_at: text,
  retracted_at: nullableText,
  file: nullableFile,
  answer_file: nullableFile,
  submission: submissionRow.nullable().optional(),
  result_id: nullableText,
});

export function parseAssignments(raw: unknown): AssignmentView[] {
  return z
    .array(assignmentRow)
    .parse(raw ?? [])
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      url: a.url,
      sourceKey: a.source_key,
      tagKeys: a.tag_keys,
      dueOn: a.due_on,
      frameId: a.frame_id,
      createdAt: a.created_at,
      retractedAt: a.retracted_at,
      file: a.file,
      answerFile: a.answer_file,
      submission: a.submission
        ? {
            id: a.submission.id,
            createdAt: a.submission.created_at,
            attempt: a.submission.attempt,
            usedHint: a.submission.used_hint,
            linkUrl: a.submission.link_url,
            byRole: a.submission.by_role,
            files: a.submission.files,
          }
        : null,
      resultId: a.result_id,
    }));
}

const studentRow = z.object({
  assignment_id: text,
  kind: z.enum(["link", "pdf"]),
  title: text,
  source_key: sourceKey,
  url: nullableText,
  has_file: z.boolean().default(false),
  due_on: nullableText,
  assigned_on: text,
  reviewed: z.boolean().default(false),
  submission: z
    .object({
      submitted_at: text,
      attempt: z.enum(["first", "retry"]),
      used_hint: z.boolean().nullable().optional().transform((v) => v ?? null),
      file_count: z.number().int(),
      has_link: z.boolean(),
    })
    .nullable()
    .optional(),
});

export function parseStudentPractice(raw: unknown): StudentPracticeItem[] {
  return z
    .array(studentRow)
    .parse(raw ?? [])
    .map((r) => ({
      assignmentId: r.assignment_id,
      kind: r.kind,
      title: r.title,
      sourceKey: r.source_key,
      url: r.url,
      hasFile: r.has_file,
      dueOn: r.due_on,
      assignedOn: r.assigned_on,
      reviewed: r.reviewed,
      submission: r.submission
        ? {
            submittedAt: r.submission.submitted_at,
            attempt: r.submission.attempt,
            usedHint: r.submission.used_hint,
            fileCount: r.submission.file_count,
            hasLink: r.submission.has_link,
          }
        : null,
    }));
}

const reviewRow = z.object({
  session_date: text,
  message: nullableText,
  labels: z.array(text).default([]),
});

export function parseReviewPoints(raw: unknown): ReviewPoints | null {
  if (raw === null || raw === undefined) return null;
  const r = reviewRow.parse(raw);
  const message = r.message?.trim() ? r.message.trim() : null;
  if (r.labels.length === 0 && !message) return null;
  return { sessionDate: r.session_date, message, labels: r.labels };
}

const studentFileRow = z.object({ file_id: text, path: text, mime: text, title: text });
export function parseStudentFile(raw: unknown): { fileId: string; path: string; mime: string; title: string } | null {
  if (raw === null || raw === undefined) return null;
  const r = studentFileRow.parse(raw);
  return { fileId: r.file_id, path: r.path, mime: r.mime, title: r.title };
}
