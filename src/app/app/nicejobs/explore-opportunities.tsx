import Link from "next/link";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Search } from "lucide-react";
import { ZodError } from "zod";
import { AccessError } from "@/server/authorization/engine";
import { applicationService } from "@/server/nicejobs/applications";
import { NiceJobsUnavailable } from "@/server/nicejobs/input";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { OpportunityDisclosure } from "./opportunity-disclosure";
import styles from "./explore-opportunities.module.css";

type Query = Record<string, string | string[] | undefined>;

function queryValue(query: Query, key: string) {
  return typeof query[key] === "string" ? query[key] as string : "";
}

function exploreHref(base: string, values: Record<string, string>) {
  const params = new URLSearchParams({ view: "opportunities" });
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return `${base}?${params}`;
}

function ExploreState({ title, message, href, label }: { title: string; message: string; href?: string; label?: string }) {
  return <section className={styles.state} role="status"><BriefcaseBusiness size={24} aria-hidden="true" /><h2>{title}</h2><p>{message}</p>{href && <Link href={href}>{label ?? "Try again"}<ArrowRight size={17} aria-hidden="true" /></Link>}</section>;
}

export function ExploreLoading() {
  return <div className={styles.explore}><header className={styles.heading}><p className={styles.kicker}>NICE JOBS</p><h1>Explore Opportunities</h1></header><p className={styles.loading} role="status">Loading opportunities...</p></div>;
}

export async function ExploreOpportunities({ userId, base, query }: { userId: string; base: string; query: Query }) {
  const search = queryValue(query, "search").trim();
  const divisionId = queryValue(query, "divisionId");
  const after = queryValue(query, "cursor");
  const versionId = queryValue(query, "versionId");
  const listHref = exploreHref(base, { search, divisionId });
  const heading = <header className={styles.heading}><p className={styles.kicker}>NICE JOBS</p><h1>Explore Opportunities</h1><p>See jobs that are open now. Read the work and terms before deciding what fits you.</p></header>;

  try {
    const page = await applicationService.opportunities(userId, versionId ? { versionId, limit: 1 } : { search, ...(divisionId ? { divisionId } : {}), ...(after ? { after } : {}), limit: 12 });
    if (versionId) {
      const job = page.records[0];
      return <div className={styles.explore}><Link className={styles.back} href={listHref}><ArrowLeft size={17} aria-hidden="true" /> Back to opportunities</Link>{!job ? <ExploreState title="This opportunity is not open" message="It may have changed or may not be available to your account." href={listHref} label="Explore open jobs" /> : <article className={styles.detail}><p className={styles.kicker}>JOB DETAILS</p><h1>{job.title}</h1><p className={styles.employer}>{job.disclosure?.legalEmployer ?? job.company}</p><div className={styles.tags}><span>{job.engagement.replaceAll("_", " ").toLowerCase()}</span>{job.areas.map(area => <span key={area.divisionId}>{area.division.name}</span>)}</div><section><h2>About this opportunity</h2><p>{job.description}</p></section><section><h2>Terms and requirements</h2><OpportunityDisclosure disclosure={job.disclosure} /></section><p className={styles.footnote}>Opening this page does not submit an application.</p></article>}</div>;
    }

    const options = await applicationService.options(userId, true);
    const values = { search, divisionId };
    return <div className={styles.explore}>{heading}<form action={base} method="get" role="search" className={styles.filters}><input type="hidden" name="view" value="opportunities" /><label><span>Search job titles</span><div className={styles.searchInput}><Search size={18} aria-hidden="true" /><input name="search" type="search" maxLength={120} defaultValue={search} placeholder="Job title" /></div></label><label><span>Area</span><select name="divisionId" defaultValue={divisionId}><option value="">All areas</option>{options.divisions.map(division => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label><button type="submit">Show jobs</button>{(search || divisionId) && <Link className={styles.clear} href={exploreHref(base, {})}>Clear</Link>}</form>
      {page.records.length ? <div className={styles.list}>{page.records.map(job => <article className={styles.job} key={job.id}><div><p className={styles.kicker}>OPEN JOB</p><h2>{job.title}</h2><p className={styles.employer}>{job.disclosure?.legalEmployer ?? job.company}</p><p className={styles.summary}>{job.description}</p><div className={styles.tags}><span>{job.engagement.replaceAll("_", " ").toLowerCase()}</span>{job.areas.map(area => <span key={area.divisionId}>{area.division.name}</span>)}</div></div><Link href={exploreHref(base, { ...values, versionId: job.id })} aria-label={`View details for ${job.title}`}>View details <ArrowRight size={17} aria-hidden="true" /></Link></article>)}</div> : <ExploreState title={page.nextCursor ? "No jobs on this page" : search || divisionId ? "No matching jobs" : "No jobs are open right now"} message={page.nextCursor ? "Other published jobs may be on the next page." : search || divisionId ? "Try another job title or area." : "Approved jobs will appear here when applications open."} href={search || divisionId ? exploreHref(base, {}) : undefined} label="Show all jobs" />}
      {page.nextCursor && <Link className={styles.more} href={exploreHref(base, { ...values, cursor: page.nextCursor })}>Next page <ArrowRight size={17} aria-hidden="true" /></Link>}
    </div>;
  } catch (error) {
    if (error instanceof AccessError) return <div className={styles.explore}>{heading}<ExploreState title="Opportunities are not available to this account" message="Your access may need to be reviewed." href={`${base}?view=worker-profile`} label="My profile" /></div>;
    if (error instanceof ZodError) return <div className={styles.explore}>{heading}<ExploreState title="Check your search" message="The search or filter could not be used. Please start again." href={exploreHref(base, {})} label="Clear filters" /></div>;
    if (!(error instanceof NiceJobsUnavailable)) safeDiagnostic("operation_failed");
    return <div className={styles.explore}>{heading}<ExploreState title={error instanceof NiceJobsUnavailable ? "Opportunities are temporarily unavailable" : "We could not load opportunities"} message="Please try again shortly." href={listHref} /></div>;
  }
}
