"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { saveStatusCopy } from "@/lib/copy/vi";
import { hasUnsaved } from "@/lib/ui/unsavedGuard";

/** `next/link` that asks before leaving a page that still has unsaved changes (beforeunload cannot see in-app navigation). */
export function GuardedLink({ onClick, ...rest }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (hasUnsaved() && !window.confirm(saveStatusCopy.leaveConfirm)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}
