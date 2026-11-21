/** Models of the tutor (env overrides, no secret here). Pure. */
import { DEFAULT_CHECK_MODEL, DEFAULT_TUTOR_MODEL } from "./prompt";
type Env = Record<string, string | undefined>;
export const tutorModels = (env: Env = process.env) => ({
  hint: env.TUTOR_MODEL?.trim() || DEFAULT_TUTOR_MODEL,
  check: env.TUTOR_CHECK_MODEL?.trim() || DEFAULT_CHECK_MODEL,
});
