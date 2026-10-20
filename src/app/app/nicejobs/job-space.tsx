import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpenCheck, BriefcaseBusiness, FileText, Wallet } from "lucide-react";
import { prisma } from "@/server/db";
import { applicationService } from "@/server/nicejobs/applications";
import { onboardingService } from "@/server/nicejobs/onboarding";
import { employeeService } from "@/server/nicejobs/employee";
import { dashboardRead } from "@/server/nicejobs/participant-dashboard";
import { ApplicationWorkspace } from "./application-workspace";
import { OnboardingWorkspace } from "./onboarding-workspace";
import { EmployeeWorkspace } from "./employee-workspace";
import { KnowledgeWorkspace } from "./knowledge-workspace";
import styles from "./job-space.module.css";

type Props = { userId: string; realm: "corporate" | "jobs"; base: string; query: Record<string, string | string[] | undefined>; worker: boolean };

export async function JobSpace({ userId, realm, base, query, worker }: Props) {
  const reference = typeof query.reference === "string" ? query.reference : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference)) return <section className={styles.space}><h1>Job space unavailable</h1><p>Select a job from My Workspace.</p><Link href={`${base}?view=home`}>Back to My Workspace</Link></section>;
  const application = await dashboardRead(() => applicationService.detail(userId, reference, true));
  if (!application.data) return <section className={styles.space}><h1>Job space unavailable</h1><p role="status">{application.status === "UNAUTHORIZED" ? "This job does not belong to your account." : "We could not load this job right now."}</p><Link href={`${base}?view=home`}>Back to My Workspace</Link></section>;
  const job = application.data;
  const enrollment = job.status === "OFFER_ACCEPTED" ? await dashboardRead(() => onboardingService.enrollment(userId, reference)) : null;
  let activeAssignment = false;
  if (worker) {
    const day = await dashboardRead(() => employeeService.day(userId));
    if (day.data?.assignment.trainingReference) {
      const source = await dashboardRead(() => prisma.niceJobsApplication.findUnique({ where: { reference }, select: { id: true } }));
      activeAssignment = !!source.data && source.data.id === day.data.assignment.trainingReference;
    }
  }
  const tabs = ["overview", "application", ...(enrollment?.data ? ["training"] : []), ...(activeAssignment ? ["work", "resources", "earnings"] : [])];
  const requested = typeof query.tab === "string" ? query.tab : "overview";
  const tab = tabs.includes(requested) ? requested : "overview";
  const href = (next: string) => `${base}?view=job-space&reference=${encodeURIComponent(reference)}&tab=${next}`;
  const shared = { userId, realm, base, query: { ...query, reference } };
  return <div className={styles.space}>
    <Link className={styles.back} href={`${base}?view=home`}><ArrowLeft size={17} aria-hidden="true" /> My Workspace</Link>
    <header className={styles.header}><div className={styles.icon}><BriefcaseBusiness size={26} aria-hidden="true" /></div><div><p>{job.company} / {job.division}</p><h1>{job.title}</h1><span>{activeAssignment ? "Active work assignment" : job.status.replaceAll("_", " ").toLowerCase()}</span></div></header>
    <nav className={styles.tabs} aria-label={`${job.title} space`}>{tabs.map(item => <Link key={item} href={href(item)} aria-current={tab === item ? "page" : undefined}>{item[0].toUpperCase() + item.slice(1)}</Link>)}</nav>
    {tab === "overview" && <div className={styles.overview}><section><h2>Your next step</h2><p>{activeAssignment ? "Open today's work, review assigned tasks and submit the required evidence." : enrollment?.data ? "Continue your recorded training and check feedback." : job.nextStep}</p><Link href={href(activeAssignment ? "work" : enrollment?.data ? "training" : "application")}>Continue <ArrowRight size={17} aria-hidden="true" /></Link></section><section><h2>In this job space</h2><p><FileText size={18} aria-hidden="true" /> Application and decisions</p><p><BookOpenCheck size={18} aria-hidden="true" /> {enrollment?.data ? `Training: ${enrollment.data.status.replaceAll("_", " ").toLowerCase()}` : "Training opens after an accepted offer and enrollment"}</p><p><BriefcaseBusiness size={18} aria-hidden="true" /> {activeAssignment ? "Work tools available" : "Work opens after separate readiness and activation approval"}</p><p><Wallet size={18} aria-hidden="true" /> {activeAssignment ? "Earnings records, where configured" : "Earnings are not available before worker activation"}</p></section></div>}
    {tab === "application" && <ApplicationWorkspace {...shared} query={{ ...shared.query, view: "my-applications" }} />}
    {tab === "training" && enrollment?.data && <OnboardingWorkspace {...shared} query={{ ...shared.query, view: "my-onboarding" }} />}
    {tab === "work" && activeAssignment && <EmployeeWorkspace {...shared} query={{ ...shared.query, view: "my-day" }} />}
    {tab === "resources" && activeAssignment && <KnowledgeWorkspace {...shared} query={{ ...shared.query, view: "worker-resources" }} />}
    {tab === "earnings" && activeAssignment && <section className={styles.overview}><h2>Earnings for this work</h2><p>Only approved and recorded amounts appear in your wallet. Pending amounts and payouts are shown separately.</p><Link href={`${base}?view=worker-wallet`}>Open Wallet <ArrowRight size={17} aria-hidden="true" /></Link></section>}
  </div>;
}
