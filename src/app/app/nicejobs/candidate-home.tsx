import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, FileText, Sparkles } from "lucide-react";
import { participantDashboard, type DashboardResult } from "@/server/nicejobs/participant-dashboard";
import styles from "./candidate-home.module.css";

function ReadState({ result, empty, retry }: { result: DashboardResult<unknown>; empty: string; retry: string }) {
  if (result.status === "UNAUTHORIZED") return <p className={styles.state} role="status">These records are not available to your account.</p>;
  if (result.status === "UNAVAILABLE") return <p className={styles.state} role="status">This information is temporarily unavailable. <Link href={retry}>Try again</Link></p>;
  return <p className={styles.state}>{empty}</p>;
}

export async function CandidateHome({ userId, base, name }: { userId: string; base: string; name: string }) {
  const data = await participantDashboard.candidateHome(userId);
  const href = (view: string) => `${base}?view=${view}`;
  const applications = data.applications.data?.records ?? [];
  const opportunities = data.opportunities.data?.records ?? [];
  const next = data.applications.status === "UNAVAILABLE" ? { title: "Application updates are temporarily unavailable.", description: "Try again to see your recorded applications and next steps.", label: "Try again", link: href("home") }
    : data.applications.status === "UNAUTHORIZED" ? { title: "Application updates are not available to this account.", description: "You can still review approved opportunities if your account has access.", label: "Explore", link: href("opportunities") }
    : applications.length ? { title: "Keep up with your applications.", description: "See each recorded status and the next step from the hiring team.", label: "My applications", link: href("my-applications") }
    : data.opportunities.status === "UNAVAILABLE" ? { title: "Opportunity details are temporarily unavailable.", description: "Try again shortly to see what is open.", label: "Try again", link: href("home") }
    : data.opportunities.status === "UNAUTHORIZED" ? { title: "Opportunities are not available to this account.", description: "Your access may need to be reviewed before you can explore listings.", label: "My account", link: href("worker-profile") }
    : opportunities.length ? { title: "Explore an open opportunity.", description: "Read the requirements and terms before you decide to apply.", label: "See opportunities", link: href("opportunities") }
    : { title: "Check back for new opportunities.", description: "Approved listings will appear when applications open.", label: "Explore", link: href("opportunities") };
  return <div className={styles.home}>
    <section className={styles.welcome} aria-labelledby="candidate-welcome">
      <Image src="/images/nice-jobs-hero-v2.webp" alt="" fill priority sizes="(max-width: 760px) 100vw, 75vw" />
      <div><p className={styles.eyebrow}>YOUR NICE JOBS SPACE</p><h1 id="candidate-welcome">Hello, {name}.</h1><p>Find an opportunity that fits, understand the work, and take your next step.</p><Link className={styles.primary} href={href("opportunities")}>Explore Opportunities <ArrowRight size={18} aria-hidden="true" /></Link></div>
    </section>

    <section className={styles.next} aria-labelledby="candidate-next"><span className={styles.nextIcon}><Sparkles size={22} aria-hidden="true" /></span><div><p className={styles.eyebrow}>YOUR NEXT STEP</p><h2 id="candidate-next">{next.title}</h2><p>{next.description}</p></div><Link href={next.link}>{next.label}<ArrowRight size={17} aria-hidden="true" /></Link></section>

    <section className={styles.section} aria-labelledby="candidate-opportunities"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>DISCOVER</p><h2 id="candidate-opportunities">Open opportunities</h2></div><Link href={href("opportunities")}>Explore all <ArrowRight size={17} aria-hidden="true" /></Link></div>
      {!opportunities.length ? <ReadState result={data.opportunities} empty="No approved opportunities are open for applications right now. Check back after new listings are published." retry={href("home")} /> : <div className={styles.rows}>{opportunities.map(job => <article key={job.id} className={styles.row}><span className={styles.rowIcon}><BriefcaseBusiness size={21} aria-hidden="true" /></span><div><h3>{job.title}</h3><p>{job.description}</p><small>{job.disclosure?.legalEmployer ?? job.company} | {job.engagement.replaceAll("_", " ").toLowerCase()}</small></div><Link href={`${href("opportunities")}&versionId=${encodeURIComponent(job.id)}`} aria-label={`View ${job.title}`}>View details <ArrowRight size={17} aria-hidden="true" /></Link></article>)}</div>}
    </section>

    <section className={styles.section} aria-labelledby="candidate-applications"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>YOUR RECORDS</p><h2 id="candidate-applications">My applications</h2></div><Link href={href("my-applications")}>View all <ArrowRight size={17} aria-hidden="true" /></Link></div>
      {!applications.length ? <div className={styles.applicationEmpty}><FileText size={24} aria-hidden="true" /><ReadState result={data.applications} empty="You have no applications yet. When you apply, the status and next step will appear here." retry={href("home")} /></div> : <div className={styles.rows}>{applications.map(application => <article key={application.reference} className={styles.row}><span className={styles.rowIcon}><FileText size={21} aria-hidden="true" /></span><div><h3>{application.title}</h3><p>{application.nextStep}</p><small>{application.status.replaceAll("_", " ").toLowerCase()}</small></div><Link href={`${href("my-applications")}&reference=${encodeURIComponent(application.reference)}`} aria-label={`Open application for ${application.title}`}>Open <ArrowRight size={17} aria-hidden="true" /></Link></article>)}</div>}
    </section>
  </div>;
}
