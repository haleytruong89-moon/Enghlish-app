/** Models of the tutor (env overrides, no secret here). Pure. */
import { DEFAULT_CHECK_MODEL, DEFAULT_TUTOR_MODEL } from "./prompt";
type Env = Record<string, string | undefined>;
export const tutorModels = (env: Env = process.env) => ({
  hint: env.TUTOR_MODEL?.trim() || DEFAULT_TUTOR_MODEL,
  check: env.TUTOR_CHECK_MODEL?.trim() || DEFAULT_CHECK_MODEL,
  // The 5.5 models refuse a forced tool (400 tool_choice, test set 21/11): "auto" + the prompt says to answer only through the tool.
  toolChoice: (env.TUTOR_TOOL_CHOICE === "tool" ? "tool" : "auto") as "tool" | "auto",
});
