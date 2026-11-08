import Link from "next/link";
import { ArrowRight, Bell, CheckCircle2, CircleAlert, ClipboardCheck, Repeat2 } from "lucide-react";

type Reminder = { title: string; detail: string; href: string; due?: string };
type Check = { label: string; status: "ready" | "attention" | "blocked"; detail: string };
type BrandReport = { id: string; name: string; active: number; drafts: number; ended: number; missingContacts: number };

export function HrOperationsWorkspace({ view, companyId, companyName, brandName, reminders, checks, report, brandReports, workflows, reminderMode }: {
  view: "reminders" | "workflows" | "reports" | "launch-checks";
  companyId?: string;
  companyName: string;
  brandName?: string;
  reminders: Reminder[];
  checks: Check[];
  report: { active: number; drafts: number; ended: number; missingContacts: number; documentsDue: number; lettersNeedingAttention: number; payrollAwaitingReconciliation: number };
  brandReports: BrandReport[];
  workflows: { title: string; detail: string; href: string }[];
  reminderMode: string;
}) {
  const scope = brandName ? `${companyName} / ${brandName}` : companyName;
  return <div className="hr-operations-workspace">
    {view === "reminders" && <section className="executive-band"><header className="hr-ops-heading"><div><h2><Bell size={19}/> HR reminders &amp; tasks</h2><p>{scope} · Items are generated from current HR records.</p></div><span className="boss-hr-count-pill">{reminders.length}</span></header>
      {reminderMode !== "ready" && <p className="hr-ops-note">Some reminder checks are unavailable until the HR database migration is applied.</p>}
      {reminders.length ? <ul className="hr-ops-reminders">{reminders.map((item, index) => <li key={`${item.title}-${index}`}><CircleAlert size={18}/><span><strong>{item.title}</strong><small>{item.detail}{item.due ? ` · Due ${item.due}` : ""}</small></span><Link href={item.href} aria-label={`Open ${item.title}`}><ArrowRight size={17}/></Link></li>)}</ul> : <p>No HR items currently need attention.</p>}
      <p className="hr-ops-note">These are in-dashboard reminders. Email or push delivery requires a configured notification workflow.</p>
    </section>}
    {view === "workflows" && <section className="executive-band"><header className="hr-ops-heading"><div><h2><Repeat2 size={19}/> Reusable HR workflows</h2><p>Start a consistent process for {scope}. Templates and records stay within the selected company.</p></div></header><div className="hr-ops-workflows">{workflows.map(item => <Link key={item.title} href={item.href}><strong>{item.title}</strong><small>{item.detail}</small><ArrowRight size={17}/></Link>)}</div><p className="hr-ops-note">Recruitment letters use saved company templates. Workflow steps are guided links and checklists; automatic cross-module actions are not enabled.</p></section>}
    {view === "reports" && <section className="executive-band"><header className="hr-ops-heading"><div><h2><ClipboardCheck size={19}/> Workforce reports</h2><p>{scope} · Live summary of authorized HR records.</p></div></header><div className="hr-ops-report-grid">{[["Active employees", report.active], ["Employment drafts", report.drafts], ["Former employees", report.ended], ["Missing contact details", report.missingContacts], ["Documents due for retention review", report.documentsDue], ["Letters needing attention", report.lettersNeedingAttention], ["Payroll awaiting reconciliation", report.payrollAwaitingReconciliation]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div>{!brandName && <><h3>By brand</h3>{brandReports.length ? <div className="hr-ops-table-wrap"><table className="hr-ops-table"><thead><tr><th>Brand</th><th>Active</th><th>Drafts</th><th>Ended</th><th>Missing contact details</th></tr></thead><tbody>{brandReports.map(row => <tr key={row.id}><th scope="row"><Link href={`/app/boss/departments/hr?companyId=${encodeURIComponent(companyId ?? "")}&brandId=${encodeURIComponent(row.id)}&view=people`}>{row.name}</Link></th><td>{row.active}</td><td>{row.drafts}</td><td>{row.ended}</td><td>{row.missingContacts}</td></tr>)}</tbody></table></div> : <p>No brands are available in this company scope.</p>}</>}
      <p className="hr-ops-note">Counts reflect current records and are operational summaries, not statutory payroll or compliance reports.</p>
    </section>}
    {view === "launch-checks" && <section className="executive-band"><header className="hr-ops-heading"><div><h2><ClipboardCheck size={19}/> Brand launch checks</h2><p>{scope} · Review each gate before inviting staff or using HR records operationally.</p></div></header><ul className="hr-ops-checks">{checks.map((item, index) => <li key={`${item.label}-${index}`} data-state={item.status}>{item.status === "ready" ? <CheckCircle2 size={19}/> : <CircleAlert size={19}/>}<span><strong>{item.label}</strong><small>{item.detail}</small></span><b>{item.status === "ready" ? "Ready" : item.status === "blocked" ? "Blocked" : "Needs review"}</b></li>)}</ul><p className="hr-ops-note">A “ready” state only confirms recorded setup. It does not verify legal, tax, identity, domain ownership, or external provider configuration.</p></section>}
  </div>;
}
