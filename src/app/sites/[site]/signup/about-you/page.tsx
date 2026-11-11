import { notFound, redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { candidateAboutYou, type AboutYou } from "@/server/nicejobs/candidate-about-you";
import { JobsAuthShell } from "@/app/sites/jobs-ui/auth-shell";
import { AboutYouForm } from "@/app/app/nicejobs/about-you-form";

export const metadata = { title: "Tell us about yourself | Nice Jobs", robots: { index: false, follow: false } };
export default async function AboutYouPage({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  let initial: AboutYou | null;
  try { initial = await candidateAboutYou.read(session.userId); }
  catch { return <JobsAuthShell paths={paths} mode="signup" eyebrow="YOUR PROFILE" title="Tell us about yourself" description="This helps us understand your current situation."><p role="alert">We could not load your profile right now. Please try again.</p></JobsAuthShell>; }
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="YOUR PROFILE / STEP 1" title="Tell us about yourself" description="This helps us understand your current situation.">
    <AboutYouForm initial={initial} mode="ONBOARDING"/>
  </JobsAuthShell>;
}
