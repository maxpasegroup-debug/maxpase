import { notFound, redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { candidateAboutYou } from "@/server/nicejobs/candidate-about-you";
import { initialEarningPlan } from "@/server/nicejobs/initial-earning-plan";
import { completeInitialEarningPlanAction } from "@/app/app/nicejobs/initial-earning-plan-action";
import { JobsAuthShell } from "@/app/sites/jobs-ui/auth-shell";
import styles from "../initial-earning-plan.module.css";

export const metadata = { title: "Your Initial Earning Plan | Nice Jobs", robots: { index: false, follow: false } };
function formatMinor(minor: string, currency: string) {
  const amount = Number(BigInt(minor)) / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export default async function InitialEarningPlanPage({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ error?: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  const progress = await candidateAboutYou.readOnboardingProgress(session.userId);
  if (!progress.aboutYou) redirect(`${paths.signup}/about-you`);
  if (!progress.ecosystemCompletedAt) redirect(`${paths.signup}/next`);
  if (!progress.monthlyTargetCompletedAt) redirect(`${paths.signup}/next-stage`);
  const target = await candidateAboutYou.readMonthlyEarningTarget(session.userId);
  if (!target) redirect(`${paths.signup}/next-stage`);
  let campaign;
  try { campaign = await initialEarningPlan.read(session.userId, target); }
  catch { campaign = { available: false as const, opportunityVersionId: null, programmeName: null, programmeCapacity: null, policy: null, qualifyingAdmissions: null }; }
  const { error } = await searchParams;
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="YOUR INITIAL PLAN" title="Your Initial Earning Plan" description="Let's explore an available opportunity based on your monthly target.">
    <section className={styles.content} aria-label="Initial earning plan">
      <div className={styles.target}><span>Your monthly target</span><strong>₹{target.toLocaleString("en-IN")}</strong></div>
      {campaign.available ? <>
        <article className={styles.campaign}>
          <p className={styles.kicker}>INITIAL CAMPAIGN</p>
          <h2>AIRA Startup School <span>AIRA Skill City Private Limited</span></h2>
          <ul>
            <li>AIRA Startup School offers practical business education programmes.</li>
            <li>You can introduce suitable prospective students.</li>
            <li>Qualifying admissions may generate incentives under approved campaign terms.</li>
          </ul>
        </article>
        <section className={styles.incentive} aria-label="Approved incentive information">
          <h3>Incentive information</h3>
          {!campaign.policy && <p>Incentive details will be shared after campaign confirmation.</p>}
          {campaign.policy?.perAdmissionMinor && <>
            <p><strong>{formatMinor(campaign.policy.perAdmissionMinor, campaign.policy.currency)}</strong> for the first qualifying admission under approved policy {campaign.policy.name} (version {campaign.policy.number}).</p>
            {campaign.qualifyingAdmissions ? <div className={styles.estimate}>
              <span>Illustrative qualifying admissions for your target</span>
              <strong>{campaign.qualifyingAdmissions.toLocaleString("en-IN")}</strong>
              <p>Based on the active published per-admission terms and your saved target.</p>
              <small>Illustrative calculation — not a guaranteed income.</small>
            </div> : <p className={styles.note}>An estimate is available only when the approved policy and target use INR.</p>}
          </>}
          {campaign.policy && !campaign.policy.perAdmissionMinor && <p>Published policy {campaign.policy.name} (version {campaign.policy.number}) is active. It does not define a per-admission amount for an admissions estimate.</p>}
        </section>
      </> : <section className={styles.unavailable} role="status"><h2>Campaign availability is currently being updated.</h2><p>We will show this opportunity when the campaign is active and places are available.</p></section>}
      <p className={styles.disclaimer}>Any illustration depends on qualifying admissions and approved terms. Actual incentives, if any, are subject to verification and campaign rules.</p>
      {error === "retry" && <p className={styles.error} role="alert">We could not save your progress. Please try again.</p>}
      <form action={completeInitialEarningPlanAction}><button className={styles.continue} type="submit">Continue <span aria-hidden="true">→</span></button></form>
    </section>
  </JobsAuthShell>;
}
