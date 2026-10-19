import Link from "next/link";
import { AccessError } from "@/server/authorization/engine";
import { onboardingService } from "@/server/nicejobs/onboarding";

export async function LearningOverview({ userId, base }: { userId: string; base: string }) {
  try {
    const list = await onboardingService.list(userId, true, { limit: 5 });
    if (!list.records.length) return <section><h2>Your learning</h2><p>No training track assigned yet.</p><Link href={`${base}?view=my-applications`}>Your applications and accepted offers</Link></section>;
    return <section><h2>Your learning</h2>{list.records.map(r => <article key={r.id}><h3>{r.title}</h3><p>{r.division} / {r.status.replaceAll("_", " ")}</p><p>{r.configuration.ojt ? `${r.ojt.completed} of ${r.ojt.required} required OJT activities completed` : "OJT track not configured"}</p><p>Trainer: {r.reviewer}</p><Link className="button" href={`${base}?view=my-onboarding&reference=${encodeURIComponent(r.reference)}`}>Continue training</Link></article>)}{list.nextCursor && <Link href={`${base}?view=my-onboarding`}>All training tracks</Link>}</section>;
  } catch (e) {
    if (e instanceof AccessError) return <section><h2>Your learning</h2><p>Training access is not authorized for this account.</p></section>;
    throw e;
  }
}
