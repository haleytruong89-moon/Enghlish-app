"use client";

import { useActionState } from "react";
import { auth } from "@/lib/copy/vi";
import { signIn, type LoginState } from "./actions";

const initial: LoginState = { error: null, email: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium">
          {auth.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className="min-h-12 rounded-lg border border-line bg-white px-4 text-base"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-medium">
          {auth.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className="min-h-12 rounded-lg border border-line bg-white px-4 text-base"
        />
      </div>

      {state.error ? (
        <p id="login-error" role="alert" className="rounded-lg border border-an/30 bg-white px-4 py-3 text-sm text-an">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-lg bg-accent px-6 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? auth.submitting : auth.submit}
      </button>
    </form>
  );
}
