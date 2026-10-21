/** Browser-side helpers for the S5b-1 forms (no server-only imports). */
import { tutorWorkErrors } from "@/lib/copy/vi";

export type PostOk<T> = { ok: true; status: number; body: T };
export type PostFail = { ok: false; status: number; error: string };

/** POST JSON; never throws (a network failure becomes `{ok:false, status:0}`). */
export async function postJson<T = Record<string, unknown>>(url: string, payload: unknown): Promise<PostOk<T> | PostFail> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, status: res.status, body: body as T };
    return {
      ok: false,
      status: res.status,
      error: typeof body.error === "string" ? body.error : "error",
    };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

/** One friendly sentence for a failed call. */
export function failText(r: PostFail): string {
  if (r.status === 0) return tutorWorkErrors.offline;
  if (r.error === "tutor_only") return tutorWorkErrors.classTutorOnly;
  if (r.error === "duplicate_first") return tutorWorkErrors.duplicateFirst;
  if (r.error === "duplicate_month") return tutorWorkErrors.duplicateMonth;
  if (r.error === "bad_month") return tutorWorkErrors.badMonth;
  if (r.error === "stale_report") return tutorWorkErrors.staleReport;
  if (r.error === "unknown_group") return tutorWorkErrors.unknownGroup;
  if (r.error === "already_grouped") return tutorWorkErrors.alreadyGrouped;
  if (r.status === 403) return tutorWorkErrors.forbidden;
  if (r.status === 409) return tutorWorkErrors.conflict;
  if (r.status === 400) return tutorWorkErrors.invalid;
  return tutorWorkErrors.generic;
}
