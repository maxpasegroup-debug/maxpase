import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { requestPortal } from "@/server/portals/request";
import { applicationService } from "@/server/nicejobs/applications";
import { NiceJobsUnavailable } from "@/server/nicejobs/input";
import { getPortalSession } from "@/server/portals/session";
import { OpportunityDisclosure } from "@/app/app/nicejobs/opportunity-disclosure";

export const metadata = { title: "Opportunities | Nice Jobs", description: "Published jobs at Nice Jobs" };

export default async function Opportunities({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ kind?: string; after?: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  const query = await searchParams;
  if (query.kind === "internships") redirect(paths.opportunities);
  const kind = "jobs";
  const after = typeof query.after === "string" && query.after.length <= 200 ? query.after : undefined;
  let page: Awaited<ReturnType<typeof applicationService.publicOpportunities>> | null = null;
  try { page = await applicationService.publicOpportunities({ kind, ...(after ? { after } : {}) }); }
  catch (error) { if (!(error instanceof NiceJobsUnavailable)) throw error; }
  const session = page ? await getPortalSession(site) : null;
  return <main className="portal-landing portal-jobs nj-public"><header className="portal-header"><Link className="portal-wordmark" href={paths.home}>Nice Jobs<span>AIRA CAREER HUB</span></Link><nav aria-label="Nice Jobs"><Link href={paths.home}>Home</Link><Link className="portal-button" href={paths.login}>Sign in<ArrowRight size={17} /></Link></nav></header>
    <div className="nj-public-inner"><Link className="nj-public-back" href={paths.home}><ArrowLeft size={17} /> Nice Jobs</Link><header className="nj-public-heading"><p className="portal-kicker">OPPORTUNITIES</p><h1>Find your next step.</h1><p>Explore current openings. Applications are reviewed by people; guidance helps you prepare your answers.</p></header>
      {!page ? <section className="nj-public-empty" role="status"><h2>Opportunities are temporarily unavailable.</h2><p>Please try again later.</p></section> : page.records.length ? <div className="nj-public-list">{page.records.map(job => <article key={job.id}><div><p className="portal-kicker">JOB / {job.code}</p><h2>{job.title}</h2><p className="nj-public-company">{job.disclosure?.legalEmployer}</p><p>{job.engagement.replaceAll("_", " ")}</p>{job.description && <p>{job.description}</p>}<OpportunityDisclosure disclosure={job.disclosure} /></div><Link className="portal-button" href={session ? `${paths.gateway}?view=opportunities&versionId=${encodeURIComponent(job.id)}` : `${paths.signup}?versionId=${encodeURIComponent(job.id)}`}>Apply now<ArrowRight size={18} /></Link></article>)}</div> : <section className="nj-public-empty"><h2>No {kind} are accepting applications right now.</h2><p>New opportunities will appear here when applications open.</p></section>}
      {page?.nextCursor && <Link className="portal-button" href={`${paths.opportunities}?kind=${kind}&after=${encodeURIComponent(page.nextCursor)}`}>More opportunities<ArrowRight size={18} /></Link>}
    </div></main>;
}
