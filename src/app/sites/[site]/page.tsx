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
import { StartupLanding } from "../startup-ui/landing";
const icons = { skillcity: GraduationCap, startup: GraduationCap, labs: FlaskConical, jobs: BriefcaseBusiness };
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
  if (site.id === "startup") return <StartupLanding site={site} paths={paths}/>;
  const focusCopy = ["Build practical capability through learning that connects to real work.", "A home for ideas, products and the work that makes them useful.", "A route into approved opportunity, with the terms clear before you commit."];
  return <main className="skillcity-experience" data-motion="">
    <header className="skillcity-header">
      <Link className="skillcity-brand" href={paths.home}><Icon size={26} /><span>{site.name}<small>AIRA SKILL CITY</small></span></Link>
      <nav aria-label={`${site.name} navigation`}><a href="#focus">Explore</a><a href="#ecosystem">Projects</a><a href="#faq">FAQ</a><Link className="skillcity-button" href={paths.login}>Login<ArrowUpRight size={17} /></Link></nav>
    </header>
    <section className="skillcity-hero" aria-labelledby="skillcity-title">
      <Image className="skillcity-hero-image" src={site.image} alt="A working session inside AIRA Skill City" fill priority sizes="100vw" />
      <div className="skillcity-hero-copy">
        <p className="skillcity-kicker">{site.eyebrow}</p>
        <h1 id="skillcity-title">AIRA <span>Skill City.</span></h1>
        <p className="skillcity-promise">One home for learning, startups and careers.</p>
        <p>{site.description}</p>
        <div className="skillcity-hero-actions"><Link className="skillcity-button" href={paths.login}>Enter gateway<ArrowRight size={18} /></Link><a href="#focus">Explore the city<ArrowDown size={17} /></a></div>
      </div>
      <div className="skillcity-hero-foot"><span>{site.domain}</span><a href="#focus" aria-label="Explore AIRA Skill City"><ArrowDown size={22} /></a></div>
    </section>
    <section className="skillcity-band" id="focus">
      <header><p className="skillcity-kicker">MOVE FORWARD WITH PURPOSE</p><h2>Your skills. Your next step.</h2></header>
      <div className="skillcity-grid">{site.focus.map((label, i) => <article key={label}><span className="skillcity-index">{i + 1}</span><span>0{i + 1}</span><h3>{label}</h3><p>{focusCopy[i]}</p></article>)}</div>
    </section>
    <section className="skillcity-band" id="ecosystem">
      <header><p className="skillcity-kicker">THE AIRA ECOSYSTEM</p><h2>Choose your next direction.</h2></header>
      <div className="skillcity-grid">{portalSites.filter(project => project.id !== "skillcity").map(project => <article key={project.id}><h3>{project.name}</h3><p>{project.description}</p><a href={`https://${project.domain}`}>Explore<ArrowUpRight size={16} /></a></article>)}</div>
    </section>
    <section className="skillcity-faq" id="faq" aria-labelledby="skillcity-faq-title">
      <header><p className="skillcity-kicker">THE COMPANY HOME</p><h2 id="skillcity-faq-title">Questions about AIRA Skill City.</h2></header>
      <div>{skillcityFaqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
    </section>
    <section className="skillcity-next">
      <div><p className="skillcity-kicker">YOUR SKILL CITY WORKSPACE</p><h2>Ready for your next chapter?</h2><p>Sign in to the company gateway. Each project keeps its own site and its own account.</p></div>
      <Link className="skillcity-button" href={paths.login}>Sign in<ArrowUpRight size={18} /></Link>
    </section>
    <footer className="skillcity-footer"><div><strong>{site.name}</strong><p>Practical learning, entrepreneurship, technology and careers.</p><span>AIRA SKILL CITY PRIVATE LIMITED</span></div><nav aria-label="AIRA Skill City footer"><a href="#focus">Explore</a><a href="#ecosystem">Projects</a><a href="#faq">FAQ</a><Link href={paths.login}>Login</Link></nav><nav aria-label="AIRA projects">{portalSites.filter(project => project.id !== "skillcity").map(project => <a key={project.id} href={`https://${project.domain}`}>{project.name}</a>)}</nav></footer>
  </main>;
}
