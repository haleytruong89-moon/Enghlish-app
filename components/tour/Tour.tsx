"use client";

import { useMemo } from "react";
import { tourCopy as c } from "@/lib/copy/vi";
import { TOUR_SEEN_KEY, tourSteps } from "@/lib/tour/steps";
import { GuidedTour } from "./GuidedTour";

/** 27/11 "Hướng dẫn" in the top bar: the app tour; opens by itself once for a tutor on a new device. */
export function Tour({ alias, autoStart }: { alias: string; autoStart: boolean }) {
  const steps = useMemo(() => tourSteps(alias), [alias]);
  return <GuidedTour steps={steps} seenKey={TOUR_SEEN_KEY} autoStart={autoStart} openText={c.open} openLabel={c.openLabel} openTestId="tour-open" />;
}
