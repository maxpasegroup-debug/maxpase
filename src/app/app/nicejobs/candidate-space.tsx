import Link from "next/link";
import { ArrowRight, BookOpenCheck, BriefcaseBusiness, ClipboardList, Compass, FileText, Store, Target, Wallet } from "lucide-react";
import { participantDashboard, type DashboardResult } from "@/server/nicejobs/participant-dashboard";
import { applicationStage } from "@/lib/nicejobs-application-stage";
import styles from "./candidate-space.module.css";

function State({ result, empty }: { result: DashboardResult<unknown>; empty: string }) {
  return <p className={styles.state} role="status">{result.status === "UNAVAILABLE" ? "Your records are temporarily unavailable. Reload to try again." : result.status === "UNAUTHORIZED" ? "These records are not available to your account." : empty}</p>;
}

export async function CandidateSpace({ userId, base, name, worker = false }: { userId: string; base: string; name?: string; worker?: boolean }) {
  const data = await participantDashboard.candidateSpace(userId);
  const applications = data.applications.data?.records ?? [];
  const learning = data.learning.data?.records ?? [];
  const link = (view: string) => `${base}?view=${view}`;
  const destinations = [
    { label: "My Workspace", view: "home", icon: BriefcaseBusiness, note: "Your next step" },
    { label: "Explore Opportunities", view: "opportunities", icon: Compass, note: "Approved openings" },
    { label: "My Applications", view: "my-applications", icon: ClipboardList, note: "Decisions and offers" },
    { label: "My Work", view: "my-work", icon: BriefcaseBusiness, note: worker ? "Assigned work" : "After activation" },
    { label: "Training", view: "my-onboarding", icon: BookOpenCheck, note: "Assigned learning" },
    { label: "Daily Reports", view: "worker-reports", icon: FileText, note: worker ? "Record your day" : "After activation" },
    { label: "Marketplace", view: "opportunities", icon: Store, note: "Browse jobs" },
    { label: "My Wallet", view: "worker-wallet", icon: Wallet, note: "Recorded earnings" }
  ] as const;
  return <div className={styles.space}>
    <header className={styles.heading}><p>NICE JOBS</p><h1>My Workspace</h1><span>{name ? `Hello, ${name}. ` : ""}Your opportunities, applications and work stay in one place.</span></header>
    <div className={styles.intro}><div><h2>Your next step</h2><p>{applications.length ? applications[0].nextStep : data.applications.status === "UNAVAILABLE" ? "Your application updates are temporarily unavailable. Reload to try again." : data.applications.status === "UNAUTHORIZED" ? "Your application access needs review." : "Find an open opportunity and read its terms before starting an application."}</p></div><Link className={styles.primary} href={link("opportunities")}>Explore Opportunities <ArrowRight size={18} aria-hidden="true" /></Link></div>
    <nav className={styles.destinations} aria-label="My Workspace sections">{destinations.map(({ label, view, icon: Icon, note }) => <Link key={label} href={link(view)} aria-current={view === "home" ? "page" : undefined}><Icon size={21} aria-hidden="true" /><span><strong>{label}</strong><small>{note}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>)}</nav>
    <section aria-labelledby="space-jobs"><div className={styles.sectionHead}><h2 id="space-jobs">My jobs</h2><Link href={link("my-applications")}>All applications <ArrowRight size={17} aria-hidden="true" /></Link></div>
      {!applications.length ? <div className={styles.empty}><BriefcaseBusiness size={24} aria-hidden="true" /><State result={data.applications} empty="No jobs in your workspace yet. When you start an application, it will appear here." /></div> : <div className={styles.gallery}>{applications.map(application => <article key={application.reference} className={styles.tile}><div className={styles.tileIcon}><BriefcaseBusiness size={22} aria-hidden="true" /></div><div><h3>{application.title}</h3><p>{application.company} / {application.division}</p></div><span className={styles.status}>{applicationStage(application.status)} <span className={styles.detailStatus}>/ {application.status.replaceAll("_", " ").toLowerCase()}</span></span><p className={styles.next}>{application.nextStep}</p><Link href={`${link("job-space")}&reference=${encodeURIComponent(application.reference)}`} aria-label={`Open ${application.title} job space`}>View job space <ArrowRight size={17} aria-hidden="true" /></Link></article>)}</div>}
      {data.applications.data?.hasMore && <Link className={styles.more} href={link("my-applications")}>View all applications</Link>}
    </section>
    <section aria-labelledby="space-learning"><div className={styles.sectionHead}><h2 id="space-learning">Learning in progress</h2></div>
      {!learning.length ? <div className={styles.empty}><BookOpenCheck size={24} aria-hidden="true" />{data.learning.status === "UNAUTHORIZED" && !applications.some(application => application.status === "OFFER_ACCEPTED") ? <p className={styles.state}>Training opens after an accepted offer and explicit enrollment.</p> : <State result={data.learning} empty="No training enrollment yet. Accepted offers still require explicit enrollment." />}</div> : <div className={styles.list}>{learning.map(record => <article key={record.id} className={styles.item}><BookOpenCheck size={23} aria-hidden="true" /><div><h3>{record.title}</h3><p>{record.status.replaceAll("_", " ")} / {record.attention.replaceAll("_", " ")}</p></div><Link href={`${link("job-space")}&reference=${encodeURIComponent(record.reference)}`} aria-label={`Open ${record.title} job space`}>Continue <ArrowRight size={17} aria-hidden="true" /></Link></article>)}</div>}
    </section>
    <div className={styles.shortcuts}><Link href={link("vision")}><Target size={19} aria-hidden="true" /> My goals</Link>{worker && <Link href={link("my-day")}><BookOpenCheck size={19} aria-hidden="true" /> Today</Link>}</div>
    <p className={styles.boundary}>An application, approved offer or training enrollment does not grant work access. Work tools open only after separate authorized activation.</p>
  </div>;
}
