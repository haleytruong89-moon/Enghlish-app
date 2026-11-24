// lib/ai/config.ts
/** AI settings read from the environment (no secret here). Pure: tests pass their own env. */
export const DEFAULT_STUDIO_MODEL = "claude-sonnet-5-5";
export const AI_FAKE_FIXTURE = "tests/fixtures/studio/fake-extract.json";
/** AI_FAKE answer per tool name (each AI job has its own forced tool); a tool not listed gets the Studio fixture. */
export const AI_FAKE_FIXTURES: Record<string, string> = {
  save_exercise: AI_FAKE_FIXTURE,
  save_curriculum_toc: "tests/fixtures/curriculum/fake-toc.json",
  save_read_answers: "tests/fixtures/import/fake-read-answers.json",
  give_hint: "tests/fixtures/tutor/fake-hint.json",
  check_hint: "tests/fixtures/tutor/fake-check.json",
  save_vocab_card: "tests/fixtures/notebook/fake-card.json",
  check_vocab_card: "tests/fixtures/notebook/fake-card-check.json",
  pick_sense: "tests/fixtures/notebook/fake-sense.json",
  explain_again: "tests/fixtures/notebook/fake-again.json",
};
export const fakeFixtureFor = (toolName: string): string => AI_FAKE_FIXTURES[toolName] ?? AI_FAKE_FIXTURE;
/** Version of the short consent text on /settings/ai (consents.notice_version). Change the text → new version. */
export const AI_NOTICE_VERSION = "ai-studio-tutor-v3";
/**
 * The AI tutor runs only for a child whose latest ai_text consent is this version (the text that tells the parent about it).
 * v3 (E2a, 23/11): the tutor is its own "Gia sư" page (not inside works) and the child's questions are kept for mum and the tutor.
 */
export const TUTOR_NOTICE_VERSION = "ai-studio-tutor-v3";
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
