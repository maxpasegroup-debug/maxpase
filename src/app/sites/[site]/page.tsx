import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { requestPortal } from "@/server/portals/request";
import { AiraLanding } from "@/components/aira/AiraLanding";
import { venturesFor } from "@/components/aira/ventures";
import localFont from "next/font/local";
import { LabsLanding } from "../labs-ui/landing";
import { JobsLanding } from "../jobs-ui/landing";
import { StartupLanding } from "../startup-ui/landing";
import { applicationService } from "@/server/nicejobs/applications";
import { NiceJobsUnavailable } from "@/server/nicejobs/input";
import { niceJobsPortalSettings } from "@/server/nicejobs/portal-settings";
const display = localFont({ src: "../fonts/syne-latin.woff2", weight: "700 800", variable: "--aira-display", display: "swap" });
const text = localFont({ src: "../fonts/manrope-latin.woff2", weight: "400 600", variable: "--aira-text", display: "swap" });
const startupFaqs = [
  ["What is AIRA Startup Skool?", "It is the startup project inside AIRA Skill City: a place for curious minds and ambitious founders to learn, experiment and take a practical next step."],
  ["What does the work focus on?", "Entrepreneurship, practical learning and founder projects. The school helps you turn an idea into focused work. It does not promise a company, funding or revenue."],
  ["How do I take part?", "Start with the application through the signup journey. Reading this page alone does not create an account or a founder project."],
  ["Who currently operates this site?", "The existing portal is operated within AIRA Skill City Private Limited. A proposed standalone entity change has not yet been verified in this system."],
  ["How do I begin an application?", "Create an account, verify your email, and answer SIA's guided application questions. A person reviews your application."],
  ["Does applying guarantee a place?", "No. Your application status appears in your account. Programme enrolment is a separate decision."],
  ["Can I pay when I apply?", "No. Final terms, applicable tax, and any payment instructions are provided only after the required approvals."]
] as const;
const skillcityFaqs = [
  ["What is AIRA Skill City?", "AIRA Skill City is the company home for practical learning, entrepreneurship, technology and career development."],
  ["Which projects sit inside it?", "AIRA Startup Skool, AIRA Labs and Nice Jobs each have their own public site, purpose and sign-in. This page introduces them. It is not one combined application."],
  ["Who signs in here?", "The Skill City gateway is for people with a Skill City account. Founders, business enquiries and candidates use the project site that matches their work."],
  ["Who is the legal entity?", "The company is AIRA Skill City Private Limited."]
] as const;
export async function generateMetadata({ params }: { params: Promise<{ site: string }> }): Promise<Metadata> { const { site } = await requestPortal((await params).site); return { title: site.name, description: site.id === "jobs" ? "Explore approved opportunities, learn through practice, and work towards earning with clear terms and guidance." : site.description, alternates: { canonical: `https://${site.domain}` } }; }
export default async function PortalLanding({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if(site.id === "labs")return <LabsLanding home={paths.home} login={paths.login}/>;
  if (site.id === "jobs") {
    let preview: Awaited<ReturnType<typeof applicationService.publicOpportunities>> | null = null;
    let introVideo: Awaited<ReturnType<typeof niceJobsPortalSettings.introVideo>> = null;
    try { preview = await applicationService.publicOpportunities({ kind: "jobs", limit: 3 }); }
    catch (error) { if (!(error instanceof NiceJobsUnavailable)) console.error("nicejobs_landing_catalogue_unavailable", error instanceof Error ? error.name : "Unknown"); }
    try { introVideo = await niceJobsPortalSettings.introVideo(); }
    catch (error) { console.error("nicejobs_intro_video_unavailable", error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Error ? error.name : "Unknown"); }
    const videoUrl = introVideo?.fileId ? `${process.env.NODE_ENV === "production" ? "https://nicejobs.online/intro-video" : "/sites/jobs/intro-video"}?v=${encodeURIComponent(introVideo.fileId)}` : null;
    return <JobsLanding paths={paths} introVideo={{ title: introVideo?.title ?? "What is NICEJOBS?", url: videoUrl }} opportunities={preview?.records.map(record => ({ id: record.id, title: record.title, employer: record.disclosure?.legalEmployer ?? "Employer details on listing", areas: record.areas.map(area => area.division.name) })) ?? []} availability={preview ? "ready" : "unavailable"}/>;
  }
  if (site.id === "startup") {
    const local = paths.home.startsWith("/sites/");
    return <StartupLanding home={paths.home} login={paths.login} signup={paths.signup} name={site.name} description={site.description} image={site.image} ecosystem={local ? "/sites/skillcity" : "https://airaskillcity.com"} focus={site.focus} faqs={startupFaqs} />;
  }
  const local = paths.home.startsWith("/sites/");
  return <div className={`${display.variable} ${text.variable}`}>
    <AiraLanding
      home={paths.home}
      login={paths.login}
      contact={local ? "/sites/skillcity/contact" : "/contact"}
      ventures={venturesFor({
        startup: local ? "/sites/startup" : "https://airastartupskool.com",
        labs: local ? "/sites/labs" : "https://airalabs.online",
        jobs: local ? "/sites/jobs" : "https://nicejobs.online"
      })}
      faqs={skillcityFaqs}
    />
  </div>;
}
