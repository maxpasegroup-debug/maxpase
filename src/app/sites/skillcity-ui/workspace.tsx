import { randomUUID } from "node:crypto";
import Link from "next/link";
import { BriefcaseBusiness, ClipboardCheck, GraduationCap, LogOut } from "lucide-react";
import { skillCityEmployeeDashboard, type EmployeeView } from "@/server/skillcity/employee-dashboard";
import { portalLogoutAction } from "../[site]/actions";
import { WorkForm } from "./work-form";
import { DirectorDirectives } from "./directives";
import { AdvisorAssistance } from "./advisor-assistance";
import { StaffDraftForm } from "@/components/staff-draft-form";
import { skillCityStaffDraftAction } from "./actions";
import { AdvisorPipelines } from "./advisor-pipelines";
import { DirectorCrm } from "./director-crm";
import { StaffInvitePanel } from "@/components/staff-invite-panel";
import { skillCityStaffInviteAction } from "./actions";
import { ManagerDesk } from "./manager-desk";
import { DeveloperWorkspace } from "./developer-workspace";
import { DeveloperAssignments } from "./developer-assignments";
import { CrossBrandQueue } from "./cross-brand-queue";
import { LabsBusinessDevelopment } from "./labs-business-development";

type Dashboard = Awaited<ReturnType<typeof skillCityEmployeeDashboard.dashboard>>;
const labels: Record<EmployeeView,string> = { advisor: "Advisory", director: "Director", manager: "Manager desk", developer: "Labs delivery", "business-development": "Labs business development" };
const leadNext: Record<string,string[]> = { NEW: ["NEW", "CONTACTED", "LOST"], CONTACTED: ["CONTACTED", "QUALIFIED", "LOST"], QUALIFIED: ["QUALIFIED", "AUDIT", "LOST"], AUDIT: ["AUDIT", "QUOTATION_READY", "LOST"], QUOTATION_READY: ["QUOTATION_READY", "LOST"] };
const date = (value: Date | string | null | undefined) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "Not scheduled";

export function SkillCityWorkspace({ data, email, userId, base, home }: { data: Dashboard; email: string; userId: string; base: string; home: string }) {
  return <main className="portal-workspace portal-skillcity sc-workspace">
    <a className="sc-skip" href="#skillcity-work">Skip to work</a>
    <header className="portal-header"><Link className="portal-wordmark" href={home}>AIRA Skill City<span>EMPLOYEE WORKPLACE</span></Link><div className="sc-account"><span>{email}</span><form action={portalLogoutAction}><input type="hidden" name="site" value="skillcity"/><button title="Sign out" aria-label="Sign out"><LogOut size={18}/></button></form></div></header>
    {data.available.length>1&&<nav className="sc-nav" aria-label="Your workspaces">{data.available.map(view=><Link key={view} href={`${base}?view=${view}`} aria-current={data.view===view?"page":undefined}>{view==="advisor"?<GraduationCap size={18} aria-hidden="true"/>:view==="developer"||view==="manager"?<BriefcaseBusiness size={18} aria-hidden="true"/>:<ClipboardCheck size={18} aria-hidden="true"/>} {labels[view]}</Link>)}</nav>}
    <div className="sc-layout"><div className="sc-main" id="skillcity-work">{!data.view?<section className="sc-section"><h1>Employee access pending</h1><p>Your account does not yet have a verified Skill City employee assignment with the required permissions. Ask an authorized director to review your membership and role.</p></section>:null}
      {data.view === "advisor" && <CrossBrandQueue userId={userId} mode="SELF"/>}
      {data.view==="advisor"&&data.data&&"leads" in data.data&&<><header className="sc-heading"><p>Academic Advisor</p><h1>Today and follow-ups</h1><span>My assigned records only</span></header><section className="sc-section"><h2>My call and follow-up queue</h2>{data.data.leads.length===0?<p>No assigned open Labs leads in this page.</p>:<div className="sc-list">{data.data.leads.map(lead=><article key={lead.id}><header><h3>{lead.title}</h3><span>{lead.status.replaceAll("_"," ")}</span></header><p>Next follow-up: {date(lead.nextFollowUp??lead.dueAt)}</p><p>Last outcome: {lead.outcome||"Not recorded"}</p>{data.data.canUpdateLabs&&leadNext[lead.status]&&<details><summary>Record outcome and next action</summary><WorkForm actionName="LEAD" reference={randomUUID()} label="Save follow-up"><input type="hidden" name="id" value={lead.id}/><input type="hidden" name="version" value={lead.version}/><label>Status<select name="status" defaultValue={lead.status}>{leadNext[lead.status].map(status=><option key={status} value={status}>{status.replaceAll("_"," ")}</option>)}</select></label><label>Outcome<textarea name="outcome" required maxLength={3000} defaultValue={lead.outcome}/></label><label>Qualification evidence<textarea name="qualification" maxLength={3000} defaultValue={lead.qualification}/></label><label>Next follow-up (local time)<input name="nextFollowUp" type="datetime-local"/></label></WorkForm></details>}</article>)}</div>}</section><div className="sc-pipelines"><section className="sc-section"><h2>BGOS / AIRA Labs</h2><p>Existing assigned Labs enquiries. BGOS is a draft product and cannot be sold from this setup.</p><strong>{data.data.leads.length} open records in this page</strong></section><section className="sc-section"><h2>PBA / Startup School</h2><p>Assigned records appear below when authorized.</p></section><section className="sc-section"><h2>GenZ Builder / Skill Studio</h2><p>Assigned records appear below when authorized.</p></section></div><AdvisorPipelines pipelines={data.data.pipelines}/><section className="sc-section"><h2>Product information</h2>{!data.data.productReadable?<p>Product records are not authorized for this account.</p>:<ul>{data.data.products.map(product=><li key={product.slug}><strong>{product.name}</strong> / {product.lifecycle} / {product.status}. {product.description??"Approved customer description not configured."}</li>)}</ul>}<p>Approved product scripts are not configured. No salary or employment decision can be made here.</p></section></>}
      {data.view==="advisor"&&data.data&&"leads" in data.data&&data.data.labsId&&<AdvisorAssistance userId={userId} organizationId={data.data.labsId}/>}
      {data.view==="manager"&&<><header className="sc-heading"><p>AIRA Skill City</p><h1>Manager desk</h1><span>Direct reports and accessible work</span></header><ManagerDesk userId={userId}/></>}
      {data.view==="director"&&data.data&&"divisions" in data.data&&<>
        <header className="sc-heading"><p>AIRA Skill City</p><h1>Director desk</h1><span>Authorized company records</span></header>
        <section className="sc-section"><h2>Decisions awaiting me</h2>
          {data.data.decisions.length===0?<p>No pending approval assignments in accessible records.</p>:<div className="sc-list">{data.data.decisions.map(item=><article key={item.id}><h3>{item.title}</h3><p>Expires {date(item.expiresAt)}</p><WorkForm actionName="DECISION" reference={randomUUID()} label="Record decision" confirm="Record this decision? It will be audited and cannot be replayed."><input type="hidden" name="id" value={item.id}/><label>Decision<select name="decision"><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></select></label><label>Reason<textarea name="comment" required maxLength={3000}/></label></WorkForm></article>)}</div>}
          <p>Only assigned approvals within your current company authority can be decided here. Approval does not execute a tool or payment.</p>
        </section>
        <ManagerDesk userId={userId}/>
        <section className="sc-section"><h2>Brand marketing</h2><p>Plan drafts, content and internal work within authorized brands. Review does not publish or send.</p><Link href={`${base}?view=marketing`}>Open marketing workspaces</Link></section>
        <section className="sc-section"><h2>Startup School commercial terms</h2><p>Prepare written terms for independent review. No fee, invoice or payment is confirmed here.</p><Link href={`${base}?view=commercial`}>Open commercial controls</Link></section>
        <CrossBrandQueue userId={userId} mode="TEAM"/>
        <DeveloperAssignments userId={userId}/>
        <section className="sc-section"><h2>Startup Skool operations</h2><p>Programme decisions require verified authority and separate enrollment evidence.</p><p><Link href={`${base}?view=startup-applications`}>Application reviews</Link> · <Link href={`${base}?view=founder-management`}>Founder learning desk</Link> · <Link href={`${base}?view=pilot`}>Kerala pilot register</Link></p></section>
        {data.data.canManageLabsCustomers && <section className="sc-section"><h2>Labs customer access</h2><p>Grant a verified existing Labs customer account access to its matching enquiry. The account must already have a dedicated PIN, verified email, consent and customer role. An email match alone is insufficient.</p><WorkForm actionName="LABS_CUSTOMER_GRANT" reference={randomUUID()} label="Grant verified access" confirm="Have you independently verified the customer identity, consent and enquiry relationship?"><label>Enquiry ID<input name="leadId" required/></label><label>Verified customer email<input name="customerEmail" type="email" required/></label><label>Verification evidence<textarea name="evidence" required minLength={10} maxLength={1000}/></label></WorkForm></section>}
        <section className="sc-section"><h2>Divisions and exceptions</h2><p>Each available count opens its scoped source records, with last-update evidence and pagination. Memberships are division records, not proof of brand assignment.</p><div className="sc-pipelines">{data.data.divisions.map(division=><DirectorDivisionSummary key={division.id} division={division} base={base}/>)}</div></section>
        <DirectorDirectives userId={userId} organizationId={data.companyId}/>
        {"crm" in data.data && <DirectorCrm pipelines={data.data.crm}/>}
        {"staff" in data.data && data.data.staff.length > 0 && <section className="sc-section"><h2>Employee onboarding</h2>{data.data.staff.map(scope => <details key={scope.organizationId}><summary>{scope.name}</summary><StaffDraftForm action={skillCityStaffDraftAction} organizationId={scope.organizationId} roles={scope.roles} managers={scope.managers} existingPeople={scope.existingPeople}/><StaffInvitePanel rows={scope.drafts} action={skillCityStaffInviteAction} deliveryReady={data.data.inviteDeliveryReady}/></details>)}</section>}
      </>}
      {data.view==="developer"&&data.data&&"projects" in data.data&&<DeveloperWorkspace desk={data.data}/>}
      {data.view==="business-development"&&data.data&&"records" in data.data&&<LabsBusinessDevelopment desk={data.data}/>}
    </div></div>
  </main>;
}

function DirectorDivisionSummary({ division, base }: { division: { id: string; name: string; projects: number | null; tasks: number | null; programs: number | null; people: number | null; blockers: number | null; sales: number | null }; base: string }) {
  const fields = [["projects", "Open projects"], ["tasks", "Open tasks"], ["programs", "Active programmes"], ["people", "Division memberships"], ["blockers", "Blocked projects"], ["sales", "Open sales leads"]] as const;
  return <article><h3>{division.name}</h3><dl>{fields.map(([kind, label]) => <div key={kind}><dt>{label}</dt><dd>{division[kind] === null ? "Not authorized or not connected" : <Link href={`${base}?view=director-report&divisionId=${encodeURIComponent(division.id)}&kind=${kind}`}>{division[kind]} · View records</Link>}</dd></div>)}</dl></article>;
}
