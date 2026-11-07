// lib/ai/config.ts
/** AI settings read from the environment (no secret here). Pure: tests pass their own env. */
export const DEFAULT_STUDIO_MODEL = "claude-sonnet-5-5";
export const AI_FAKE_FIXTURE = "tests/fixtures/studio/fake-extract.json";
/** Version of the short consent text on /settings/ai (consents.notice_version). Change the text → new version. */
export const AI_NOTICE_VERSION = "ai-studio-v1";
type Env = Record<string, string | undefined>;

export function studioModel(env: Env = process.env): string {
  return env.STUDIO_EXTRACT_MODEL?.trim() || DEFAULT_STUDIO_MODEL;
}
export function studioToolChoice(env: Env = process.env): "tool" | "auto" {
  return env.STUDIO_TOOL_CHOICE === "auto" ? "auto" : "tool";
}
/**
 * AI_FAKE=1 → the fixture instead of the network (tests, CI). Never on Vercel production and never when NODE_ENV is production — except
 * in CI (CI=true, where the e2e app runs a production build with the fake on purpose).
 */
export function aiFake(env: Env = process.env): boolean {
  if (env.AI_FAKE !== "1" || env.VERCEL_ENV === "production") return false;
  return env.NODE_ENV !== "production" || env.CI === "true";
}
