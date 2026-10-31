import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { startupPrograms, lifecycleStatuses, readStartupDraft } from "@/server/group/startup-programs";
import { ProgramControls } from "./program-controls";

export default async function StartupProgramsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ search?: string; status?: string; recordId?: string }> }) {
  const session = await requireSession(), { id } = await params, query = await searchParams;
  let data: Awaited<ReturnType<typeof startupPrograms.list>>;
  try { data = await startupPrograms.list(session.userId, id, query); }
  catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const chosen = query.recordId ? data.rows.find(row => row.id === query.recordId) : null;
  const filtered = query.recordId && !chosen ? await startupPrograms.scopedProgram(session.userId, id, query.recordId).then(result => result.row).catch(error => { if (error instanceof AccessError) return null; throw error; }) : null;
  const selected = chosen ?? (filtered ? { ...filtered, draft: readStartupDraft(filtered.metadata), publicationRequest: null } : null);
  return <main className="boss-view boss-command">
    <nav aria-label="Breadcrumb" className="boss-command-breadcrumb"><Link href={`/app/boss/brands/${encodeURIComponent(id)}`}>{data.brand.name} Master Control Center</Link><span>/</span><strong aria-current="page">Program Management</strong></nav>
    <header className="boss-heading"><div><p className="eyebrow">AIRA Startup Skool</p><h1>Program Management</h1><p className="muted">Review recorded programmes and prepare new drafts. Commercial approval, admissions and payments are separate decisions.</p></div></header>
    <section className="executive-band"><form method="get" className="startup-program-filters"><label>Search programmes<input name="search" type="search" defaultValue={query.search ?? ""} maxLength={100} placeholder="Name or identifier"/></label><label>Status<select name="status" defaultValue={query.status ?? ""}><option value="">All statuses</option>{lifecycleStatuses.map(status => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select></label><button className="button">Show results</button><Link href={`/app/boss/brands/${encodeURIComponent(id)}/programs`}>Clear filters</Link></form>
      {!data.rows.length ? <div className="business-empty"><h2>No matching programmes</h2><p>Try another search or status. No programme has been added to this view yet.</p></div> : <div className="table-scroll"><table className="business-table operations-table"><thead><tr><th>Programme</th><th>Duration</th><th>Tier proposal</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.slug}</small></td><td>{row.durationDays == null ? "Not configured" : `${row.durationDays} days`}</td><td>{row.draft?.tierProposal ? "Recorded proposal" : "Not configured"}</td><td><span className="status">{row.status}</span>{row.publicationRequest?.status === "PENDING" && <small>Publication review pending</small>}</td><td><Link href={`?recordId=${encodeURIComponent(row.id)}&search=${encodeURIComponent(query.search ?? "")}&status=${encodeURIComponent(query.status ?? "")}`}>View</Link></td></tr>)}</tbody></table></div>}{data.hasMore && <p role="status">Showing 100 most recently updated programmes. Narrow the search to find older records.</p>}
    </section>
    {data.canManage && !selected && <section className="executive-band"><h2>New programme</h2><ProgramControls brandId={id}/></section>}
    {selected && <section className="executive-band"><h2>{selected.name}</h2><dl className="record-details"><div><dt>Identifier</dt><dd>{selected.slug}</dd></div><div><dt>Lifecycle</dt><dd>{selected.status}</dd></div><div><dt>Description</dt><dd>{selected.description || "Not configured"}</dd></div><div><dt>Duration</dt><dd>{selected.durationDays == null ? "Not configured" : `${selected.durationDays} days`}</dd></div><div><dt>Capacity</dt><dd>{selected.capacity ?? "Not configured"}</dd></div><div><dt>Fee proposal</dt><dd>{selected.priceMinor == null ? "Not configured" : `${selected.priceMinor} ${selected.currency} minor units — unapproved`}</dd></div>{selected.draft && Object.entries(selected.draft).map(([key, value]) => <div key={key}><dt>{key.replaceAll(/([A-Z])/g, " $1")}</dt><dd>{value || "Not configured"}</dd></div>)}</dl><p>Lifecycle status does not approve fees, terms, intake, enrolment or founder-workspace access.</p>{data.canManage && <ProgramControls brandId={id} program={selected}/>}</section>}
  </main>;
}
