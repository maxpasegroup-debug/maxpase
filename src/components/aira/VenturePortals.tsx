"use client";

import { forwardRef } from "react";
import { VentureCard } from "./VentureCard";
import type { Venture } from "./ventures";

export const VenturePortals = forwardRef<HTMLDivElement, { variant: "overlay" | "flow"; ventures: Venture[]; onBrandSelect?: (brand: Venture["id"]) => void }>(function VenturePortals({ variant, ventures, onBrandSelect }, ref) {
  return (
    <div
      ref={ref}
      className={variant === "overlay" ? "aira-portals aira-overlay-portals" : "aira-portals aira-flow-portals"}
      id={variant === "flow" ? "ventures" : undefined}
    >
      {variant === "overlay" && <svg className="aira-portal-trails" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
        <path data-venture-trail="startup" pathLength="1" d="M500 505 C430 515 300 570 170 570" />
        <path data-venture-trail="labs" pathLength="1" d="M500 505 C500 530 500 550 500 570" />
        <path data-venture-trail="jobs" pathLength="1" d="M500 505 C570 515 700 570 830 570" />
      </svg>}
      {ventures.map((venture, index) => <VentureCard key={`${variant}-${venture.id}`} venture={venture} index={index} overlay={variant === "overlay"} onSelect={onBrandSelect} />)}
    </div>
  );
});
