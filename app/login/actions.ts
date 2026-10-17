"use server";

import { redirect } from "next/navigation";
import { decideLogin } from "@/lib/auth/login";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/** `login` is what the person typed (a login name or an email) — never the resolved email. */
export type LoginState = { error: string | null; login: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const login = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createUserClient();
  const outcome = await decideLogin(login, password, {
    async emailForName(name) {
      const { data, error } = await createAdminClient().rpc("eng_login_email", { p_name: name });
      if (error) throw new Error(`eng_login_email failed: ${error.code ?? "error"}`);
      return typeof data === "string" && data ? data : null;
    },
    async signIn(email, pw) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (!error) return { ok: true };
      return { ok: false, invalid: error.status === 400 || error.code === "invalid_credentials" };
    },
  });
  if (!outcome.ok) return { error: outcome.error, login };
  redirect("/");
}
