import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { account, app } from "@/lib/copy/vi";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: `${account.title} · ${app.name}` };
export const dynamic = "force-dynamic";

// Signed-out visitors are sent to /login by proxy.ts; this page has no data of its own.
export default function PasswordPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold">{account.title}</h1>
        <p className="mt-2 text-muted">{account.intro}</p>
        <div className="mt-6 rounded-2xl border border-line bg-white/70 p-6">
          <PasswordForm />
        </div>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-accent underline">
          {account.back}
        </Link>
      </main>
    </>
  );
}
