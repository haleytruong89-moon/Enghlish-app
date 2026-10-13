import type { Metadata } from "next";
import { app, auth } from "@/lib/copy/vi";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: `${auth.title} · ${app.name}` };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <p className="text-sm font-semibold tracking-wide text-accent">{app.name}</p>
      <h1 className="mt-1 text-3xl font-bold">{auth.title}</h1>
      <p className="mt-2 text-muted">{auth.intro}</p>
      <div className="mt-8 rounded-2xl border border-line bg-white/70 p-6">
        <LoginForm />
      </div>
    </main>
  );
}
