"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { SiaMascot } from "./sia-mascot";

export function SiaGuide({ message, action, children, disclaimer = "SIA prepares guidance. People make decisions." }: {
  message: string;
  action?: { href: string; label: string };
  children?: ReactNode;
  disclaimer?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const launch = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) close.current?.focus(); }, [open]);

  return <aside className="sia-guide" aria-label="SIA guidance" onKeyDown={event => {
    if (event.key === "Escape" && open) { setOpen(false); launch.current?.focus(); }
  }}>
    {open && <div className="sia-guide-panel" id={panelId} role="region" aria-label="SIA guidance panel">
      <div className="sia-guide-head"><strong>SIA · your guide</strong><button ref={close} type="button" onClick={() => { setOpen(false); launch.current?.focus(); }} aria-label="Close SIA guidance"><X size={18} aria-hidden="true" /></button></div>
      {children ?? <p>{message}</p>}
      {action && <Link className="sia-guide-action" href={action.href}>{action.label}</Link>}
      <small>{disclaimer}</small>
    </div>}
    <button ref={launch} type="button" className="sia-guide-launch" aria-label={open ? "Close SIA guidance" : "Open SIA guidance"} aria-controls={open ? panelId : undefined} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className="sia-guide-figure"><SiaMascot /></span><span className="sia-guide-label">SIA guide</span>
    </button>
  </aside>;
}
