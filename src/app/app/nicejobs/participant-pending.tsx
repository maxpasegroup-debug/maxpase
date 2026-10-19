import Link from "next/link";
import { ParticipantNav } from "./participant-nav";
import { LearningOverview } from "./learning-overview";

export function ParticipantPending({ userId, base, view }: { userId: string; base: string; view: string }) {
  const title = view === "worker-wallet" ? "Wallet" : view === "worker-reports" ? "Reports" : view === "worker-resources" ? "Resources" : view === "my-work" ? "Work" : "Help";
  return <section className="nj-workspace"><header><p>Nice Jobs / Your learning workspace</p><h1>{title}</h1></header><ParticipantNav base={base} view={view} />
    {view === "worker-wallet" ? <p>A worker wallet is unavailable before authorized workforce activation. No payable balance is implied.</p> : view === "worker-resources" ? <p>Customer-sharing materials require an active authorized assignment. Your assigned learning content is available in Training.</p> : view === "worker-reports" ? <p>Your practice submissions and trainer feedback are recorded in your training track. Daily work reports become available after authorized activation.</p> : view === "my-work" ? <p>Start with your assigned practice activities in Training. Production tasks require authorized workforce activation.</p> : <p>Your training track shows trainer assignment, feedback and any required rework. If a trainer is not assigned, contact the hiring team through your existing recruitment contact.</p>}
    <LearningOverview userId={userId} base={base} /><Link href={`${base}?view=my-applications`}>Your applications and offers</Link>
  </section>;
}
