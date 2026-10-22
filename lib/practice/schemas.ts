/** Request bodies of the S5b-1 PR B routes (zod). Parsed AFTER requireAccess, so outsiders always get 404. */
import { z } from "zod";
import { ALLOWED_MIMES, MAX_FILES_PER_SUBMISSION } from "@/lib/storage/rules";
import { MAX_URL_LENGTH } from "./link";

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const clientId = z.string().min(8).max(100);
const tagKey = z.string().trim().min(1).max(61);
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "not a calendar date");
const httpsUrl = z.string().trim().max(MAX_URL_LENGTH);

/** What the browser says about a file it uploaded; the server checks it against what storage recorded. */
export const fileMetaSchema = z.strictObject({
  id: uuid,
  mime: z.enum(ALLOWED_MIMES),
  bytes: z.number().int().min(1),
});
export type FileMeta = z.infer<typeof fileMetaSchema>;

/** Ask for an upload target. `submission` = a screenshot / photo for an assignment (staff: submitting on the student's behalf). */
export const staffUploadBodySchema = z
  .strictObject({
    purpose: z.enum(["assignment_pdf", "answer_key", "external_result", "submission"]),
    assignment_id: uuid.optional(),
    mime: z.enum(ALLOWED_MIMES),
    bytes: z.number().int().min(1),
  })
  .refine((b) => (b.purpose === "submission") === (b.assignment_id !== undefined), { message: "only a submission names an assignment", path: ["assignment_id"] });
export type StaffUploadBody = z.infer<typeof staffUploadBodySchema>;

export const studentUploadBodySchema = z.strictObject({
  assignment_id: uuid,
  mime: z.enum(ALLOWED_MIMES),
  bytes: z.number().int().min(1),
});

export const createAssignmentBodySchema = z
  .strictObject({
    client_id: clientId,
    kind: z.enum(["link", "pdf"]),
    title: z.string().trim().min(1).max(200),
    url: httpsUrl.optional(),
    tags: z.array(tagKey).max(3).default([]),
    due_on: isoDate.nullable().optional(),
    frame_id: uuid.nullable().optional(),
    file: fileMetaSchema.optional(),
    answer_file: fileMetaSchema.nullable().optional(),
  })
  .refine((b) => (b.kind === "link" ? Boolean(b.url) && !b.file && !b.answer_file : !b.url && Boolean(b.file)), {
    message: "a link has an address and no file; a PDF has a file and no address",
    path: ["kind"],
  });
export type CreateAssignmentBody = z.infer<typeof createAssignmentBodySchema>;

export const retractBodySchema = z.strictObject({ reason: z.string().trim().max(300).optional() });

const submissionCore = {
  client_id: clientId,
  attempt: z.enum(["first", "retry"]),
  /** Link assignments ask "did you press Hint?"; a PDF has no such question and sends null. */
  used_hint: z.boolean().nullable(),
  link_url: httpsUrl.nullable().optional(),
  files: z.array(fileMetaSchema).max(MAX_FILES_PER_SUBMISSION).default([]),
};
export const studentSubmitBodySchema = z.strictObject({ assignment_id: uuid, ...submissionCore });
export const staffSubmitBodySchema = z.strictObject(submissionCore);
export type SubmitCore = z.infer<typeof staffSubmitBodySchema>;
