import Link from "next/link";
import { startupReportsDesk } from "@/server/skillcity/startup-reports-desk";

type Report = Awaited<ReturnType<typeof startupReportsDesk.workspace>>;
const metric = (value: number) => new Intl.NumberFormat("en-IN").format(value);
const statusLabel = (status: string) => status.toLowerCase().replaceAll("_", " ");

export function StartupReportsWorkspace({ data, base }: { data: NonNullable<Report>; base: string }) {
  return <div className="sc-startup-reports">
    <header className="sc-heading"><p>AIRA SKILL CITY · STARTUP SKOOL</p><h1>Director reports</h1><span>Verified operating summaries from the Startup Skool teams. Sensitive case details and individual payroll lines are not included.</span></header>
    <form className="sc-report-filters" method="get" action={base}>
      <input type="hidden" name="view" value="startup-reports" />
      <label>Period<select name="period" defaultValue={data.period}><option value="ALL">All periods</option>{data.options.periods.map(value => <option key={value} value={value}>{value === new Date().toISOString().slice(0, 7) ? `This month · ${value}` : value}</option>)}</select></label>
      <label>State<select name="state" defaultValue={data.filters.state}><option value="">All states</option>{data.options.states.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>District<select name="district" defaultValue={data.filters.district}><option value="">All districts</option>{data.options.districts.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Centre<select name="centre" defaultValue={data.filters.centre}><option value="">All centres</option>{data.options.centres.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Department<select name="department" defaultValue={data.filters.department}><option value="">All departments</option>{data.options.departments.map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="submit">Apply filters</button>
      <Link href={`${base}?view=startup-reports`}>Clear</Link>
    </form>
    <p className="sc-report-audit-note">Report view is recorded in the activity audit. Generated {new Date(data.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</p>
    {data.partial && <p role="status" className="sc-report-limit-note">Some source lists reached their safety limit; these figures may be incomplete. Narrow the filters before using them for decisions.</p>}
    <section className="sc-section"><h2>AO-verified operational reports</h2><div className="sc-report-cards"><article><strong>{metric(data.verifiedReports.checked)}</strong><span>Checked / completed</span></article><article><strong>{metric(data.verifiedReports.forwarded)}</strong><span>Forwarded to leadership</span></article><article><strong>{metric(data.verifiedReports.awaitingReview)}</strong><span>Awaiting AO review</span></article></div></section>
    <section className="sc-section"><h2>Leads &amp; calling</h2><div className="sc-report-cards">
      <article><strong>{metric(data.leads.total)}</strong><span>Prospects</span></article><article><strong>{metric(data.leads.calls)}</strong><span>Recorded contact activities</span></article><article><strong>{metric(data.leads.callbacksDue)}</strong><span>Callbacks due</span></article><article><strong>{metric(data.leads.linkedApplications)}</strong><span>Linked applications</span></article><article><strong>{data.leads.conversionPercent}%</strong><span>Lead-to-application rate</span></article>
    </div></section>
    <section className="sc-section"><h2>Admissions progress</h2><div className="sc-report-cards">
      <article><strong>{metric(data.admissions.total)}</strong><span>Applications</span></article><article><strong>{metric(data.admissions.statuses.SUBMITTED)}</strong><span>New / submitted</span></article><article><strong>{metric(data.admissions.statuses.CLARIFICATION_REQUIRED + data.admissions.statuses.RETURNED_TO_AO)}</strong><span>Follow-up required</span></article><article><strong>{metric(data.admissions.awaitingLeadership)}</strong><span>Awaiting leadership</span></article><article><strong>{metric(data.admissions.statuses.APPROVED)}</strong><span>Approved</span></article>
    </div><p className="sc-report-footnote">An application is counted once, whether it came through public SIA or the existing legacy application path.</p></section>
    <section className="sc-section"><h2>Centres &amp; expansion</h2><div className="sc-report-cards">
      <article><strong>{metric(data.centres.total)}</strong><span>Centre records</span></article><article><strong>{metric(data.centres.proposals)}</strong><span>Proposals in review</span></article><article><strong>{metric(data.centres.readyForOpening)}</strong><span>Setup checklists complete</span></article><article><strong>{metric(data.centres.active)}</strong><span>Active centres</span></article><article><strong>{metric(data.centres.overdueSetupTasks)}</strong><span>Overdue setup tasks</span></article>
    </div></section>
    <section className="sc-section"><h2>Budget, expenses &amp; payroll review</h2><div className="sc-report-cards">
      <article><strong>{metric(data.finance.budgetRecords)}</strong><span>Budget records</span></article><article><strong>{metric(data.finance.expenses)}</strong><span>Expense / bill requests</span></article><article><strong>{metric(data.finance.awaitingReview)}</strong><span>Expense requests awaiting review</span></article><article><strong>{metric(data.finance.missingBills)}</strong><span>Approved / paid records missing a bill</span></article>
    </div>{data.finance.payrollRuns.length ? <div className="sc-report-table-wrap"><table className="sc-report-table"><thead><tr><th>Payroll period</th><th>Review status</th></tr></thead><tbody>{data.finance.payrollRuns.map((run, index) => <tr key={`${run.period}-${index}`}><td>{run.period}</td><td>{statusLabel(run.status)}</td></tr>)}</tbody></table></div> : <p className="sc-report-footnote">Payroll status appears for the selected period when the report is not narrowed by state, district, centre or department.</p>}</section>
    <section className="sc-section"><h2>People &amp; staffing</h2><div className="sc-report-cards"><article><strong>{metric(data.people.activeHeadcount)}</strong><span>Active employees</span></article><article><strong>{metric(data.people.staffingGaps)}</strong><span>Reported open positions</span></article></div></section>
    <section className="sc-section"><h2>Grievances, documents &amp; renewals</h2><div className="sc-report-cards"><article><strong>{metric(data.grievances.open)}</strong><span>Open grievances</span></article><article><strong>{metric(data.grievances.overdue)}</strong><span>Overdue grievances</span></article><article><strong>{metric(data.records.missingDocuments)}</strong><span>Missing supporting documents</span></article><article><strong>{metric(data.records.renewalsDueWithin90Days)}</strong><span>Property end dates within 90 days</span></article></div><p className="sc-report-footnote">{data.records.note}</p></section>
    <section className="sc-section"><h2>Next actions</h2><p>Open the appropriate workspace to review underlying records. Decisions, payments and payroll release remain in their existing permission-controlled flows.</p><div className="sc-report-links"><Link href={`${base}?view=startup-leads`}>Open Leads &amp; Calling</Link><Link href={`${base}?view=startup-admissions`}>Open Admissions</Link><Link href={`${base}?view=startup-operations#startup-centres`}>Open Centres</Link><Link href={`${base}?view=startup-hr`}>Open People &amp; Payroll</Link></div></section>
  </div>;
}
