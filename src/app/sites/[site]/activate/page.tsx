import { requestPortal } from "@/server/portals/request";
import { StaffActivationForm } from "./form";
import Link from "next/link";
import { SkillCityLogo } from "@/components/skillcity-logo";
import { prisma } from "@/server/db";
import { JobsDirectorActivationForm } from "./jobs-director-form";

export default async function StaffActivate({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ challenge?: string }> }) {
  const id = (await params).site;
  if (id !== "skillcity" && id !== "labs" && id !== "jobs") throw new Error("Employee activation unavailable");
  const { site, paths } = await requestPortal(id);
  const { challenge } = await searchParams;
  if (id === "jobs") {
    const challengeId = typeof challenge === "string" && /^[0-9a-f-]{36}$/i.test(challenge) ? challenge : "";
    const record = challengeId ? await prisma.emailAuthChallenge.findFirst({ where: { id: challengeId, purpose: "JOBS_DIRECTOR_EMAIL" }, select: { status: true, expiresAt: true, user: { select: { emailVerifiedAt: true, person: { select: { metadata: true } } } } } }) : null;
    let emailVerified = false;
    try { emailVerified = !!record && record.status === "CONSUMED" && !!record.user.emailVerifiedAt && JSON.parse(record.user.person?.metadata ?? "{}").staffOnboarding === "EMAIL_VERIFIED"; } catch { emailVerified = false; }
    return <main className={`portal-workspace portal-${site.theme}`}><header className="portal-header"><Link className="portal-wordmark" href={paths.home}>NICEJOBS</Link></header><section className="business-empty"><p className="eyebrow">AIRA CAREER HUB</p><h1>Activate NICEJOBS Director access</h1><p>Verify your email and mobile number, then create your own six-digit PIN.</p><JobsDirectorActivationForm challengeId={challengeId} emailVerified={emailVerified} login={paths.login}/></section></main>;
  }
  return <main className={`portal-workspace portal-${site.theme}`}>{id === "skillcity" && <header className="portal-header"><Link className="portal-wordmark" href={paths.home}><SkillCityLogo size={48} />{site.name}</Link></header>}<section className="business-empty"><p className="eyebrow">{site.name}</p><h1>Activate your employee account</h1><p>Use the code sent to your verified work email.</p><StaffActivationForm challengeId={typeof challenge === "string" ? challenge : ""} login={paths.login} site={id}/></section></main>;
}
