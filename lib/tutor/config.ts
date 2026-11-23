/** Models of the tutor (env overrides, no secret here). Pure. */
import { DEFAULT_CHECK_MODEL, DEFAULT_TUTOR_MODEL } from "./prompt";
type Env = Record<string, string | undefined>;
export const tutorModels = (env: Env = process.env) => ({
  hint: env.TUTOR_MODEL?.trim() || DEFAULT_TUTOR_MODEL,
  check: env.TUTOR_CHECK_MODEL?.trim() || DEFAULT_CHECK_MODEL,
  // The 5.5 models refuse a forced tool (400 tool_choice, test set 21/11): "auto" + the prompt says to answer only through the tool.
  toolChoice: (env.TUTOR_TOOL_CHOICE === "tool" ? "tool" : "auto") as "tool" | "auto",
});

/**
 * The "Hỏi" button INSIDE a work (E1). Off unless TUTOR_IN_WORK=on: the parent decided 22/11 that the child gets no hints while
 * doing a work (practice or test); the tutor moves to its own "Gia sư" page (E2). The code stays so it can come back by setting.
 */
export const tutorInWorkEnabled = (env: Env = process.env): boolean => env.TUTOR_IN_WORK?.trim() === "on";
