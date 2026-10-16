"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import { passwordChangeErrorText, validateNewPassword } from "@/lib/auth/passwordChange";
import { account } from "@/lib/copy/vi";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; text: string } | { kind: "done" };

const inputClass = "min-h-12 rounded-lg border border-line bg-white px-4 text-base";

/**
 * Changes the password of the person who is signed in, from the browser, with their OWN session
 * (anon key + session cookie): no service role, no server action, nothing about the password reaches our server.
 * `method="post"` and no `name` on the inputs: a submit before hydration can never put the password in the URL.
 */
export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const check = validateNewPassword(password, confirm);
    if (!check.ok) {
      setStatus({ kind: "error", text: check.error });
      return;
    }
    setStatus({ kind: "busy" });
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      );
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus({ kind: "error", text: passwordChangeErrorText(error) });
        return;
      }
      setPassword("");
      setConfirm("");
      setStatus({ kind: "done" });
    } catch {
      setStatus({ kind: "error", text: account.errorGeneric });
    }
  }

  const busy = status.kind === "busy";
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="new-password" className="text-sm font-medium">
          {account.newPassword}
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="confirm-password" className="text-sm font-medium">
          {account.confirmPassword}
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>

      {status.kind === "error" ? (
        <p id="password-error" role="alert" className="rounded-lg border border-an/30 bg-white px-4 py-3 text-sm text-an">
          {status.text}
        </p>
      ) : null}
      {status.kind === "done" ? (
        <p id="password-done" role="status" className="rounded-lg border border-accent/40 bg-white px-4 py-3 text-sm text-accent">
          {account.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="min-h-12 rounded-lg bg-accent px-6 text-base font-semibold text-white disabled:opacity-60"
      >
        {busy ? account.submitting : account.submit}
      </button>
    </form>
  );
}
