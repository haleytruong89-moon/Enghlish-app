/** Small pure helpers of the SM-2 forms (browser side, no server-only imports). */
import type { PostFail, PostOk } from "@/lib/tutorwork/client";

/**
 * A 409 means the server saw this client id with other content (or the state moved on): keep the same id and every retry would be
 * refused again. Any other answer keeps the id, so a lost answer is still recognised as the same save (replayed).
 */
export function clientIdAfter(result: PostOk<unknown> | PostFail, current: string, fresh: () => string = () => crypto.randomUUID()): string {
  return !result.ok && result.status === 409 ? fresh() : current;
}

/** The value of an aria-describedby: the ids that exist, space separated; undefined when none. */
export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const list = ids.filter((x): x is string => typeof x === "string" && x.length > 0);
  return list.length > 0 ? list.join(" ") : undefined;
}
