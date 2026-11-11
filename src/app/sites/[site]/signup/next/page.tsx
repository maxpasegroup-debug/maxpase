import { Building2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { candidateAboutYou } from "@/server/nicejobs/candidate-about-you";
import { groupCompanies } from "@/server/group/structure";
import { JobsAuthShell } from "@/app/sites/jobs-ui/auth-shell";
import { completeOpportunityEcosystemAction } from "@/app/app/nicejobs/ecosystem-action";
import styles from "../opportunity-ecosystem.module.css";

export const metadata = { title: "Opportunity ecosystem | Nice Jobs", robots: { index: false, follow: false } };

const registeredCompanySlugs = new Set<string>(groupCompanies.map(company => company.slug));
const companies = [
  { slug: "aira-skill-city", name: "AIRA Skill City Private Limited", opportunities: "Opportunities across AIRA Startup School, AIRA Skill Studio and AIRA Labs." },
  { slug: "pearn", name: "TEARN Private Limited", opportunities: "Opportunities across TeachX Guru and LearnX Guru." },
  { slug: "top-rank-ai", name: "Top Rank AI Private Limited", opportunities: "Opportunities across the Top Rank AI platform." },
  { slug: "nidus-academy", name: "Nidus Academy", opportunities: "Opportunities across defence career and training programmes." }
].filter(company => company.slug === "nidus-academy" || registeredCompanySlugs.has(company.slug));

export default async function OpportunityEcosystem({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ error?: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  const progress = await candidateAboutYou.readOnboardingProgress(session.userId);
  if (!progress.aboutYou) redirect(`${paths.signup}/about-you`);
  const query = await searchParams;
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="ONE PLATFORM | MANY OPPORTUNITIES" title="Multiple Companies. Multiple Opportunities. One Platform." description="NICEJOBS brings together earning opportunities from companies across our business ecosystem.">
    <section className={styles.content} aria-label="NICEJOBS company ecosystem">
      <div className={styles.grid}>{companies.map((company, index) => <article className={styles.card} key={company.slug}>
        <div className={styles.cardTop}><span className={styles.number}>{String(index + 1).padStart(2, "0")}</span><Building2 size={18} aria-hidden="true"/></div>
        <h2>{company.name}</h2>
        <p>{company.opportunities}</p>
      </article>)}</div>
      <p className={styles.supporting}>Explore opportunities from our group companies through one platform. New opportunities may be introduced as they become available.</p>
      <p className={styles.notice}>Opportunities are subject to availability, eligibility and company approval. Earnings depend on actual performance and verified results. Income is not guaranteed.</p>
      {query.error === "retry" && <p className={styles.error} role="alert">We could not save your progress. Please try again.</p>}
      <form action={completeOpportunityEcosystemAction}><button className={styles.continue} type="submit">Continue <span aria-hidden="true">→</span></button></form>
    </section>
  </JobsAuthShell>;
}
