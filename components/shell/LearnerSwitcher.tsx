"use client";
import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { usePathname } from "next/navigation";
import { shellCopy } from "@/lib/copy/vi";
import { switchHref } from "@/lib/shell/paths";

/** "Nguyên · Track B / An · Track A" (prototype top bar). Switching keeps the part of the app that is open. */
export function LearnerSwitcher({ options, currentId }: { options: { id: string; label: string }[]; currentId: string | null }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label={shellCopy.switcherLabel} data-testid="learner-switcher" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Link
          key={o.id}
          href={switchHref(pathname, o.id)}
          aria-current={o.id === currentId ? "true" : undefined}
          data-testid={`learner-option-${o.id}`}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm no-underline ${o.id === currentId ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-ink hover:border-accent"}`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
