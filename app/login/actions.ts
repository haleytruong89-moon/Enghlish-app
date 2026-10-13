"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/copy/vi";
import { createUserClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null; email: string };

const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const parsed = LoginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { error: auth.errorMissing, email };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const invalid = error.status === 400 || error.code === "invalid_credentials";
    return { error: invalid ? auth.errorInvalid : auth.errorGeneric, email };
  }
  redirect("/");
}
