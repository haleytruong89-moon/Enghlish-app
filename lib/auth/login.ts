/**
 * The login decision, with its two outside calls injected (unit-tested; the server action wires the real ones).
 *
 * A login name is turned into an email ON THE SERVER; the email is never returned. An unknown name and a wrong password
 * give the SAME answer, and an unknown name still goes through a sign-in attempt (with a placeholder email that cannot
 * exist) so both cases take the same path and a bystander cannot tell which names exist.
 */
import { auth } from "@/lib/copy/vi";
import { parseLoginInput } from "./loginName";

/** Reserved domain (RFC 2606): can never be a real account, so a sign-in with it always fails with "invalid credentials". */
export const PLACEHOLDER_EMAIL = "no-such-login@example.invalid";

export type SignInResult = { ok: true } | { ok: false; invalid: boolean };

export type LoginDeps = {
  /** Server-side lookup (english.eng_login_email). null = no such active name. Throws when the lookup itself failed. */
  emailForName: (name: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<SignInResult>;
};

export type LoginOutcome = { ok: true } | { ok: false; error: string };

export async function decideLogin(rawLogin: string, password: string, deps: LoginDeps): Promise<LoginOutcome> {
  const input = parseLoginInput(rawLogin);
  if (input.kind === "empty" || !password) return { ok: false, error: auth.errorMissing };
  if (input.kind === "invalid") return { ok: false, error: auth.errorInvalid };

  let email: string;
  if (input.kind === "email") {
    email = input.email;
  } else {
    let found: string | null;
    try {
      found = await deps.emailForName(input.name);
    } catch {
      return { ok: false, error: auth.errorGeneric };
    }
    email = found ?? PLACEHOLDER_EMAIL;
  }

  const result = await deps.signIn(email, password);
  if (result.ok) return { ok: true };
  return { ok: false, error: result.invalid ? auth.errorInvalid : auth.errorGeneric };
}
