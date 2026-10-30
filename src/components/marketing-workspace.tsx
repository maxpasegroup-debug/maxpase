import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessError } from "@/server/authorization/engine";
import { brandMarketing, type MarketingAccess } from "@/server/group/brand-marketing";
import { MarketingControls } from "@/app/app/boss/brands/[id]/marketing/controls";

export async function MarketingWorkspace({ userId, brandId, mode, base, home, search, status, recordId }: { userId: string; brandId?: string; mode: MarketingAccess; base: string; home: string; search?: string; status?: string; recordId?: string }) {
  const path = (brand?: string, record?: string) => {
    const query = new URLSearchParams();
    if (mode === "SKILLCITY") query.set("view", "marketing");
    if (brand) query.set("brandId", brand);
    if (record) query.set("recordId", record);
    if (record && search) query.set("search", search);
    if (record && status) query.set("status", status);
    return `${base}?${query}`;
  };
  let options: { id: string; name: string }[] = [];
  if (mode === "SKILLCITY") options = await brandMarketing.options(userId, mode);
  if (!brandId) return <main className="boss-view boss-command"><nav className="boss-command-breadcrumb"><Link href={home}>Skill City workplace</Link></nav><header className="boss-heading"><div><p className="eyebrow">Brand operations</p><h1>Marketing</h1><p className="muted">Choose an authorized brand to plan campaigns and review work.</p></div></header><section className="executive-band">{options.length ? <ul className="executive-list">{options.map(option => <li key={option.id}><Link href={path(option.id)}>{option.name}</Link></li>)}</ul> : <p>No brand marketing workspace is authorized for this account.</p>}</section></main>;
  let data: Awaited<ReturnType<typeof brandMarketing.list>>;
  try { data = await brandMarketing.list(userId, brandId, mode, { search, status, recordId }); }
  catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const selected = data.selected;
  return <main className="boss-view boss-command">
    <nav className="boss-command-breadcrumb" aria-label="Breadcrumb"><Link href={home}>{mode === "BOSS" ? "Brand control centre" : "Skill City workplace"}</Link><span>/</span>{mode === "SKILLCITY" && <><Link href={path()}>Marketing</Link><span>/</span></>}<strong aria-current="page">{data.brand.name}</strong></nav>
    <header className="boss-heading"><div><p className="eyebrow">{data.brand.name} · internal planning</p><h1>Marketing</h1><p className="muted">Plan campaigns, draft content, assign internal work and record independent review. No content is published or sent from this workspace.</p></div></header>
    <section className="executive-band"><form method="get" className="startup-program-filters">{mode === "SKILLCITY" && <><input type="hidden" name="view" value="marketing"/><input type="hidden" name="brandId" value={brandId}/></>}<label>Search campaigns<input name="search" type="search" maxLength={100} defaultValue={search ?? ""}/></label><label>Status<select name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"].map(value => <option key={value}>{value}</option>)}</select></label><button className="button">Show results</button><Link href={path(brandId)}>Clear filters</Link></form>
      {data.rows.length ? <div className="table-scroll"><table className="business-table operations-table"><thead><tr><th>Campaign</th><th>Owner</th><th>Channel</th><th>Schedule</th><th>Review</th><th>Action</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td><strong>{row.title}</strong></td><td>{row.owner.displayName}</td><td>{row.payload.channel}</td><td>{row.payload.startsAt ? new Date(row.payload.startsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "Not set"}</td><td><span className="status">{row.status.replaceAll("_", " ")}</span></td><td><Link href={path(brandId, row.id)}>Open</Link></td></tr>)}</tbody></table></div> : <div className="business-empty"><h2>No matching campaigns</h2><p>Clear the filters or create a campaign draft for this brand.</p></div>}{data.hasMore && <p role="status">Showing 100 recent campaigns. Narrow the search to find older records.</p>}</section>
    {!selected && data.canPlan && <section className="executive-band"><h2>New campaign</h2><MarketingControls mode={mode} brandId={brandId} owners={data.owners} campaign={null} canPlan={data.canPlan} canDecide={data.canDecide} createReference={randomUUID()} workReference={randomUUID()}/></section>}
    {selected && <section className="executive-band"><h2>{selected.title}</h2><dl className="record-details"><div><dt>Review status</dt><dd>{selected.status.replaceAll("_", " ")}</dd></div><div><dt>Owner</dt><dd>{selected.owner.displayName}</dd></div><div><dt>Objective</dt><dd>{selected.payload.objective}</dd></div><div><dt>Channel</dt><dd>{selected.payload.channel} — planning only</dd></div><div><dt>Start</dt><dd>{selected.payload.startsAt ? new Date(selected.payload.startsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "Not scheduled"}</dd></div><div><dt>End</dt><dd>{selected.payload.endsAt ? new Date(selected.payload.endsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "Not scheduled"}</dd></div><div><dt>Publication</dt><dd>Not available</dd></div><div><dt>External sending</dt><dd>Not available</dd></div></dl>
      <h3>Draft content</h3>{selected.payload.assets.length ? <ul className="executive-list">{selected.payload.assets.map(asset => <li key={asset.id}><strong>{asset.title}</strong> · {asset.kind}<p>{asset.body}</p></li>)}</ul> : <p>No draft content assets yet. Add copy or a creative brief before requesting review.</p>}
      <h3>Internal work orders</h3>{data.workOrders.length ? <ul className="executive-list">{data.workOrders.map(task => <li key={task.id}><strong>{task.title}</strong> · {task.status} · {task.assignee?.displayName ?? "Unassigned"} · {task.dueDate ? new Date(task.dueDate).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "No deadline"}</li>)}</ul> : <p>No work orders recorded for this campaign.</p>}
      <h3>Approval history</h3>{data.history.length ? <ol className="executive-list">{data.history.map(entry => <li key={entry.id}><strong>{entry.toStatus.replaceAll("_", " ")}</strong> · {entry.reason} · {entry.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</li>)}</ol> : <p>No decisions recorded.</p>}
      <MarketingControls mode={mode} brandId={brandId} owners={data.owners} campaign={selected} canPlan={data.canPlan} canDecide={data.canDecide} createReference={randomUUID()} workReference={randomUUID()}/>
    </section>}
    <section className="executive-band"><h2>Control boundary</h2><p>Approval here records internal review only. Media upload, campaign publication, customer sharing and external messages require their own approved content, provider, consent and delivery controls.</p></section>
  </main>;
}
