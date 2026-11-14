"use client";
import { GuardedLink as Link } from "@/components/ui/GuardedLink";
import { usePathname } from "next/navigation";
import { appFeedback } from "@/lib/copy/vi";
import { feedbackHref } from "@/lib/shell/paths";

/** "Góp ý về app" stays visible on a phone (spec §5 rule 5) while the sidebar drawer is closed. */
export function PhoneFeedbackLink({ learnerId }: { learnerId: string | null }) {
  return (
    <Link href={feedbackHref(usePathname() ?? "/", learnerId)} data-testid="feedback-link-phone" className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-accent underline md:hidden">
      {appFeedback.link}
    </Link>
  );
}
