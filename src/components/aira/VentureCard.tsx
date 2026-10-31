"use client";

import { ArrowUpRight, BriefcaseBusiness, Cpu, Rocket } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import type { Venture } from "./ventures";

const ventureIcons = {
  startup: Rocket,
  labs: Cpu,
  jobs: BriefcaseBusiness
} satisfies Record<Venture["id"], typeof Rocket>;

export function VentureCard({ venture, index }: { venture: Venture; index: number }) {
  function tilt(event: MouseEvent<HTMLAnchorElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--tilt-y", `${x * 8}deg`);
    event.currentTarget.style.setProperty("--tilt-x", `${-y * 8}deg`);
  }

  function reset(event: MouseEvent<HTMLAnchorElement>) {
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
  }

  const external = venture.href.startsWith("http");
  const Icon = ventureIcons[venture.id];
  return (
    <a
      className={`aira-card aira-card-${venture.id}`}
      data-venture-card=""
      href={venture.href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      style={{ "--accent": venture.accent, transitionDelay: `${index * 80}ms` } as CSSProperties}
      onMouseMove={tilt}
      onMouseLeave={reset}
    >
      <span className="aira-card-index">0{index + 1}</span>
      <span className={`aira-card-visual aira-card-visual-${venture.id}`} aria-hidden="true" />
      <span className="aira-card-icon" aria-hidden="true"><Icon /></span>
      <span className="aira-card-copy">
        <strong>{venture.label}</strong>
        <em>{venture.description}</em>
        <small>{venture.tone}</small>
      </span>
      <span className="aira-card-cta">{venture.cta}<ArrowUpRight size={16} /></span>
    </a>
  );
}
