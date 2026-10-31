"use client";

import { forwardRef } from "react";
import { VentureCard } from "./VentureCard";
import type { Venture } from "./ventures";

export const VenturePortals = forwardRef<HTMLDivElement, { variant: "overlay" | "flow"; ventures: Venture[] }>(function VenturePortals({ variant, ventures }, ref) {
  return (
    <div
      ref={ref}
      className={variant === "overlay" ? "aira-portals aira-overlay-portals" : "aira-portals aira-flow-portals"}
      id={variant === "flow" ? "ventures" : undefined}
    >
      {ventures.map((venture, index) => <VentureCard key={`${variant}-${venture.id}`} venture={venture} index={index} />)}
    </div>
  );
});
