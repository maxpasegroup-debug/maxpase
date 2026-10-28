"use client";
import { useState } from "react";
import Link from "next/link";
import { Bot, X } from "lucide-react";
import type { StartupGuidance } from "@/server/sia/startup-guidance";

export function StartupSiaAssistant({ context, journey, guidance }: { context: "landing" | "login" | "signup" | "workspace"; journey?: string; guidance?: StartupGuidance }) {
  const [open, setOpen] = useState(false);
  const copy = {
    landing: "I can help you see how the PBA journey works. Begin with a simple application when you feel ready.",
    login: "Welcome back. Sign in to see your application or learning space. New here? Start your journey first.",
    signup: "Create your account, verify your email, then tell us what you hope to build. A person makes the admissions decision.",
    workspace: "Take one step at a time. Your application status and the next action are shown on this page."
  }[context];
  return <aside className="startup-sia-assistant" aria-label="SIA guidance"><button type="button" className="startup-sia-launch" aria-label={open ? "Close SIA guidance" : "Open SIA guidance"} aria-expanded={open} onClick={() => setOpen(!open)}><Bot size={22} aria-hidden="true"/><span>SIA</span></button>{open && <div className="startup-sia-panel" role="region" aria-label="SIA guidance panel"><div><strong>SIA · your guide</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close SIA guidance"><X size={18}/></button></div>{guidance ? <><h3>{guidance.heading}</h3><p><strong>Recorded:</strong> {guidance.fact}</p><p><strong>Next step:</strong> {guidance.next}</p><details><summary>How this was prepared</summary><p>Source: {guidance.source}</p><p>Coverage: {guidance.coverage}</p><p>{guidance.limitation}</p></details></> : <><p>{copy}</p>{context === "landing" && journey && <Link href={journey}>Book your journey →</Link>}<small>Prepared information only. People make admissions and learning decisions.</small></>}</div>}</aside>;
}
