import { notFound, redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { candidateAboutYou } from "@/server/nicejobs/candidate-about-you";
import { JobsAuthShell } from "@/app/sites/jobs-ui/auth-shell";
import { MonthlyTargetForm } from "@/app/app/nicejobs/monthly-target-form";

export const metadata = { title: "Monthly earning target | Nice Jobs", robots: { index: false, follow: false } };
export default async function MonthlyEarningTargetPage({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  const progress = await candidateAboutYou.readOnboardingProgress(session.userId);
  if (!progress.aboutYou) redirect(`${paths.signup}/about-you`);
  if (!progress.ecosystemCompletedAt) redirect(`${paths.signup}/next`);
  const target = await candidateAboutYou.readMonthlyEarningTarget(session.userId);
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="YOUR PROFILE | STEP 3" title="What is your monthly earning target?" description="Tell us how much you would like to earn through NICEJOBS opportunities.">
    <MonthlyTargetForm initial={target} mode="ONBOARDING"/>
  </JobsAuthShell>;
}
