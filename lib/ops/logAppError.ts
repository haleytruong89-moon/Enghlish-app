import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Record a server error in english.app_errors (DESIGN §14: no third-party log service,
 * no transcripts / student work in logs). Never throws.
 */
export async function logAppError(entry: {
  route: string;
  code: string;
  error: unknown;
  userId?: string | null;
  correlationId?: string | null;
}): Promise<void> {
  try {
    const err = entry.error instanceof Error ? entry.error : new Error("non-error thrown");
    await createAdminClient()
      .from("app_errors")
      .insert({
        route: entry.route,
        code: entry.code,
        // Error name + first line only; messages from our code never contain learner content.
        message: `${err.name}: ${err.message.split("\n")[0]?.slice(0, 300) ?? ""}`,
        user_id: entry.userId ?? null,
        correlation_id: entry.correlationId ?? null,
      });
  } catch {
    console.error(`app_errors insert failed for ${entry.route}`);
  }
}
