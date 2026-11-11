import { candidateAboutYou } from "@/server/nicejobs/candidate-about-you";
import { MonthlyTargetForm } from "./monthly-target-form";

export async function MonthlyTargetProfile({ userId }: { userId: string }) {
  try {
    const value = await candidateAboutYou.readMonthlyEarningTarget(userId);
    return <section aria-labelledby="monthly-target-profile-title" className="nj-dashboard-profile-setting">
      <h2 id="monthly-target-profile-title">Monthly earning target</h2>
      <p>Update your personal NICEJOBS planning target at any time.</p>
      <MonthlyTargetForm initial={value} mode="PROFILE"/>
    </section>;
  } catch {
    return <section aria-labelledby="monthly-target-profile-title"><h2 id="monthly-target-profile-title">Monthly earning target</h2><p role="alert">This profile setting is temporarily unavailable. Please try again later.</p></section>;
  }
}
