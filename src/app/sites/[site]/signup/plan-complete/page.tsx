import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { candidateAboutYou } from "@/server/nicejobs/candidate-about-you";
import { JobsAuthShell } from "@/app/sites/jobs-ui/auth-shell";
import styles from "@/app/sites/jobs-ui/auth.module.css";

export const metadata = { title: "Initial plan saved | Nice Jobs", robots: { index: false, follow: false } };
export default async function PlanCompletePlaceholder({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  const progress = await candidateAboutYou.readOnboardingProgress(session.userId);
  if (!progress.aboutYou) redirect(`${paths.signup}/about-you`);
  if (!progress.ecosystemCompletedAt) redirect(`${paths.signup}/next`);
  if (!progress.monthlyTargetCompletedAt) redirect(`${paths.signup}/next-stage`);
  if (!progress.initialEarningPlanCompletedAt) redirect(`${paths.signup}/target-complete`);
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="INITIAL PLAN SAVED" title="Your next step is coming soon." description="Your initial earning plan has been reviewed. The next onboarding step will appear here when it is ready.">
    <p className={styles.status}><Check size={16} aria-hidden="true"/> Your progress is saved.</p>
    <Link className={styles.button} href={paths.gateway}>Continue to Nice Jobs <ArrowRight size={18}/></Link>
  </JobsAuthShell>;
}
