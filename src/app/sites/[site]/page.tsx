import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, ArrowDown, GraduationCap, FlaskConical, BriefcaseBusiness } from "lucide-react";
import { requestPortal } from "@/server/portals/request";
import { portalSites } from "@/server/portals/sites";
import { LabsLanding } from "../labs-ui/landing";
import { JobsLanding } from "../jobs-ui/landing";
import { applicationService } from "@/server/nicejobs/applications";
import { NiceJobsUnavailable } from "@/server/nicejobs/input";
const icons = { skillcity: GraduationCap, startup: GraduationCap, labs: FlaskConical, jobs: BriefcaseBusiness };
const startupFaqs = [
  ["What is AIRA Startup School?", "It is the startup project inside AIRA Skill City: a place for curious minds and ambitious founders to learn, experiment and take a practical next step."],
  ["What does the work focus on?", "Entrepreneurship, practical learning and founder projects. The school helps you turn an idea into focused work. It does not promise a company, funding or revenue."],
  ["How do I take part?", "Sign in through the Startup School gateway. Reading this page does not create an account or a founder project."],
  ["Who operates the school?", "AIRA Startup School is part of AIRA Skill City Private Limited, separate from AIRA Labs and Nice Jobs."]
] as const;
const skillcityFaqs = [
  ["What is AIRA Skill City?", "AIRA Skill City is the company home for practical learning, entrepreneurship, technology and career development."],
  ["Which projects sit inside it?", "AIRA Startup School, AIRA Labs and Nice Jobs each have their own public site, purpose and sign-in. This page introduces them. It is not one combined application."],
  ["Who signs in here?", "The Skill City gateway is for people with a Skill City account. Founders, business enquiries and candidates use the project site that matches their work."],
  ["Who is the legal entity?", "The company is AIRA Skill City Private Limited."]
] as const;
export async function generateMetadata({ params }: { params: Promise<{ site: string }> }): Promise<Metadata> { const { site } = await requestPortal((await params).site); return { title: site.name, description: site.id === "jobs" ? "Explore approved opportunities, learn through practice, and work towards earning with clear terms and guidance." : site.description, alternates: { canonical: `https://${site.domain}` } }; }
export default async function PortalLanding({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site), Icon = icons[site.id];
  if(site.id === "labs")return <LabsLanding home={paths.home} login={paths.login}/>;
  if (site.id === "jobs") {
    let preview: Awaited<ReturnType<typeof applicationService.publicOpportunities>> | null = null;
    try { preview = await applicationService.publicOpportunities({ kind: "jobs", limit: 3 }); }
    catch (error) { if (!(error instanceof NiceJobsUnavailable)) console.error("nicejobs_landing_catalogue_unavailable", error instanceof Error ? error.name : "Unknown"); }
    return <JobsLanding paths={paths} opportunities={preview?.records.map(record => ({ id: record.id, title: record.title, employer: record.disclosure?.legalEmployer ?? "Employer details on listing", areas: record.areas.map(area => area.division.name) })) ?? []} availability={preview ? "ready" : "unavailable"}/>;
  }
  if (site.id === "startup") return <main className="portal-landing portal-startup startup-experience" data-motion="">
    <header className="portal-header startup-header">
      <Link className="portal-wordmark" href={paths.home}><Icon size={28} /><span>{site.name}<span>AIRA SKILL CITY</span></span></Link>
      <nav aria-label={`${site.name} navigation`}><a className="portal-focus-link" href="#focus">Explore</a><a className="startup-faq-link" href="#faq">FAQ</a><Link className="portal-button" href={paths.login}>Login<ArrowUpRight size={17} /></Link></nav>
    </header>
    <section className="startup-hero">
      <div className="startup-hero-copy">
        <p className="portal-kicker">{site.eyebrow}</p>
        <h1>Big ideas start with <span>bold first steps.</span></h1>
        <p>{site.description}</p>
        <div className="startup-hero-actions"><Link className="portal-button" href={paths.login}>Enter gateway<ArrowRight size={18} /></Link><a href="#focus">Explore the school<ArrowDown size={17} /></a></div>
        <p className="startup-hero-note">LEARN <span>•</span> EXPERIMENT <span>•</span> BUILD</p>
      </div>
      <div className="startup-hero-art"><Image src={site.image} alt="A learning session at AIRA Startup School" fill priority sizes="(max-width: 760px) 100vw, 48vw" /></div>
    </section>
    <section className="startup-focus" id="focus">
      <header><p className="portal-kicker">KEY AREAS OF FOCUS</p><h2>Build the skills to make an idea real.</h2></header>
      <div className="startup-focus-grid">{site.focus.map((label, i) => <article key={label}><span className="startup-focus-icon">{i + 1}</span><span className="startup-focus-number">0{i + 1}</span><h3>{label}</h3><p>{["Explore opportunities and think like a founder.", "Learn by doing with practical, applied work.", "Turn ambition into focused founder projects."][i]}</p><a href={paths.login}>Learn more<ArrowUpRight size={15} /></a></article>)}</div>
    </section>
    <section className="startup-faq" id="faq" aria-labelledby="startup-faq-title">
      <header><p className="portal-kicker">BEFORE YOU BEGIN</p><h2 id="startup-faq-title">Questions about AIRA Startup School.</h2></header>
      <div>{startupFaqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
    </section>
    <section className="startup-next-step">
      <div><p className="portal-kicker">IDEAS INTO ENTERPRISE</p><h2>Make your next move count.</h2><p>{site.description}</p></div>
      <Link className="portal-button" href={paths.login}>Start your journey<ArrowRight size={18} /></Link>
    </section>
    <footer className="startup-footer"><div><strong>{site.name}</strong><p>Learn, experiment and turn an idea into focused founder work.</p><span>AIRA SKILL CITY PRIVATE LIMITED</span></div><nav aria-label="AIRA Startup School footer"><a href="#focus">Explore</a><a href="#faq">FAQ</a><Link href={paths.login}>Login</Link></nav></footer>
  </main>;
  return <main className={`portal-landing portal-${site.theme}`} data-motion=""><header className="portal-header"><Link className="portal-wordmark" href={paths.home}><Icon size={28} /><span>{site.name}<span>AIRA SKILL CITY</span></span></Link><nav aria-label={`${site.name} navigation`}><a className="portal-focus-link" href="#focus">Explore</a><a href="#ecosystem">Projects</a><a href="#faq">FAQ</a><Link className="portal-button" href={paths.login}>Login<ArrowUpRight size={17} /></Link></nav></header>
    <section className="portal-hero" style={{ backgroundImage: `url('${site.image}')` }}><div className="portal-hero-copy"><p className="portal-kicker">{site.eyebrow}</p><h1>{site.name}</h1><p>{site.description}</p><Link className="portal-button" href={paths.login}>Enter gateway<ArrowRight size={18} /></Link></div><div className="portal-hero-bottom"><span>{site.domain}</span><a href="#focus" aria-label="Explore"><ArrowDown size={22} /></a></div></section>
    <section className="portal-focus" id="focus"><header><p className="portal-kicker">MOVE FORWARD WITH PURPOSE</p><h2>Your skills. Your next step.</h2></header><div className="portal-focus-grid">{site.focus.map((label, i) => <article key={label}><span>0{i + 1}</span><h3>{label}</h3></article>)}</div></section>
    {site.id === "skillcity" && <section className="portal-focus" id="ecosystem"><header><p className="portal-kicker">THE AIRA ECOSYSTEM</p><h2>Choose your next direction.</h2></header><div className="portal-focus-grid">{portalSites.filter(s => s.id !== "skillcity").map(s => <article key={s.id}><h3>{s.name}</h3><p>{s.description}</p><a className="portal-button" href={`https://${s.domain}`}>Explore<ArrowUpRight size={18} /></a></article>)}</div></section>}
    {site.id === "skillcity" && <section className="skillcity-faq" id="faq" aria-labelledby="skillcity-faq-title"><header><p className="portal-kicker">THE COMPANY HOME</p><h2 id="skillcity-faq-title">Questions about AIRA Skill City.</h2></header><div>{skillcityFaqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>}
    <section className="portal-gateway-band"><div><p className="portal-kicker">YOUR {site.id === "skillcity" ? "SKILL CITY" : "STARTUP"} WORKSPACE</p><h2>Ready for your next chapter?</h2></div><Link className="portal-button" href={paths.login}>Sign in<ArrowUpRight size={18} /></Link></section>
    <footer className="skillcity-footer"><div><strong>{site.name}</strong><p>Practical learning, entrepreneurship, technology and careers.</p><span>AIRA SKILL CITY PRIVATE LIMITED</span></div><nav aria-label="AIRA Skill City footer"><a href="#focus">Explore</a><a href="#ecosystem">Projects</a><a href="#faq">FAQ</a><Link href={paths.login}>Login</Link></nav><nav aria-label="AIRA projects">{portalSites.filter(s => s.id !== "skillcity").map(s => <a key={s.id} href={`https://${s.domain}`}>{s.name}</a>)}</nav></footer></main>;
}
