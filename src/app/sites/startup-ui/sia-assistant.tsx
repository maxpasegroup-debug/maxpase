import { SiaGuide } from "@/components/sia/sia-guide";
import type { StartupGuidance } from "@/server/sia/startup-guidance";

export function StartupSiaAssistant({ context, journey, guidance }: { context: "landing" | "login" | "signup" | "workspace"; journey?: string; guidance?: StartupGuidance }) {
  const copy = {
    landing: "I can help you see how the PBA journey works. Begin with a simple application when you feel ready.",
    login: "Welcome back. Sign in to see your application or learning space. New here? Start your journey first.",
    signup: "Create your account, verify your email, then tell us what you hope to build. A person makes the admissions decision.",
    workspace: "Take one step at a time. Your application status and the next action are shown on this page."
  }[context];
  return <SiaGuide message={copy} action={context === "landing" && journey ? { href: journey, label: "Book your journey" } : undefined} disclaimer="Prepared information only. People make admissions and learning decisions.">
    {guidance ? <><h3>{guidance.heading}</h3><p><strong>Recorded:</strong> {guidance.fact}</p><p><strong>Next step:</strong> {guidance.next}</p><details><summary>How this was prepared</summary><p>Source: {guidance.source}</p><p>Coverage: {guidance.coverage}</p><p>{guidance.limitation}</p></details></> : <p>{copy}</p>}
  </SiaGuide>;
}
