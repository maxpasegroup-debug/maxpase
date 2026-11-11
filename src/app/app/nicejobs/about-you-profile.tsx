import { candidateAboutYou } from "@/server/nicejobs/candidate-about-you";
import { AboutYouForm } from "./about-you-form";
import { MonthlyTargetProfile } from "./monthly-target-profile";

export async function AboutYouProfile({ userId }: { userId: string }) {
  try {
    const value = await candidateAboutYou.read(userId);
    return <section aria-labelledby="about-you-profile-title" className="nj-dashboard-profile-setting">
      <h2 id="about-you-profile-title">About you</h2>
      <p>Update the option that best describes your current situation.</p>
      <AboutYouForm initial={value} mode="PROFILE"/>
      <MonthlyTargetProfile userId={userId}/>
    </section>;
  } catch {
    return <section aria-labelledby="about-you-profile-title"><h2 id="about-you-profile-title">About you</h2><p role="alert">This profile setting is temporarily unavailable. Please try again later.</p></section>;
  }
}
