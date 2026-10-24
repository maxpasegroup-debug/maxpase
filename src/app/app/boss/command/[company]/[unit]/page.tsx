import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, Building2, FolderKanban, ShieldCheck, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { brandCommandService } from "@/server/group/brand-command";
import { workspaceHref } from "@/lib/workspace-navigation";
import { staffOnboardingService } from "@/server/skillcity/staff-onboarding";
import { StaffDraftForm } from "@/components/staff-draft-form";
import { bossStaffDraftAction, bossStaffInviteAction, bossStaffReviewAction } from "../../staff-actions";
import { RoleTemplateForm } from "../../role-template-form";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { StaffInvitePanel } from "@/components/staff-invite-panel";
import { niceJobsControlPanel } from "@/server/nicejobs/control-panel";

export default async function BrandCommandPage({ params }: { params: Promise<{ company: string; unit: string }> }) {
  const session = await requireSession();
  const { company, unit } = await params;
  let data: Awaited<ReturnType<typeof brandCommandService.read>>;
  try { data = await brandCommandService.read(session.userId, company, unit); }
  catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const hr = (path: string) => {
    const url = new URL(workspaceHref(path, data.companyId, "companies"), "http://localhost");
    url.searchParams.set("organizationId", data.scopeId);
    if (url.pathname.startsWith("/app/workforce/")) url.searchParams.set("organization", data.scopeId);
    return url.pathname + url.search;
  };
  const staff = company === "aira-skill-city" && data.canManagePeople ? await staffOnboardingService.options(session.userId, data.scopeId) : null;
  const drafts = staff?.canPrepare ? await staffInvite.drafts(session.userId, data.scopeId) : [];
  const careerHub = company === "aira-skill-city" && unit === "aira-career-hub";
  const niceJobs = careerHub ? await niceJobsControlPanel.navigation(session.userId, { companyId: data.companyId }).catch(error => { if (error instanceof AccessError) return null; throw error; }) : null;
  return <main className="boss-view boss-command">
    <nav aria-label="Breadcrumb" className="boss-command-breadcrumb"><Link href="/app/boss?view=companies"><ArrowLeft size={16}/> Companies</Link><span>/</span><span>{data.companyName}</span><span>/</span><strong>{data.label}</strong></nav>
    <header className="boss-heading"><div><p className="eyebrow">{data.companyName}</p><h1>{data.label}</h1><p className="muted">Command centre / {data.companyStatus}</p></div><Building2 size={24}/></header>
    <section className="executive-band"><h2>Configuration</h2><dl className="record-details"><div><dt>Division</dt><dd>{data.division?.status ?? "Not configured"}</dd></div><div><dt>Brand</dt><dd>{data.brand ? `${data.brand.name} / ${data.brand.status}` : "Not configured or not authorized"}</dd></div><div><dt>Product</dt><dd>{data.product ? `${data.product.name} / ${data.product.lifecycle} / ${data.product.status}` : "Not configured or not authorized"}</dd></div><div><dt>Domain</dt><dd>{data.brand?.website ?? "Not recorded"}</dd></div></dl><p className="muted">Recorded domain is not evidence of live DNS, TLS or customer access. Draft products cannot be sold from this view.</p></section>
    <section className="executive-band"><h2>Manage this scope</h2><nav className="boss-command-links" aria-label="Command centre tools">
      {careerHub && niceJobs && <Link href={`/app/boss/nicejobs?view=${encodeURIComponent(niceJobs.groups.find(group => group.key === "overview")?.entries[0].view ?? niceJobs.groups[0].entries[0].view)}&companyId=${encodeURIComponent(data.companyId)}`}><BriefcaseBusiness size={20}/><span>Nice Jobs control panel</span><ArrowUpRight size={16}/></Link>}
      {data.canReadDecisions && <Link href={hr("/app/operations/approvals?status=PENDING")}><ShieldCheck size={20}/><span>Decisions and approvals</span><ArrowUpRight size={16}/></Link>}
      {data.canReadWork && <Link href={hr("/app/execution/projects")}><FolderKanban size={20}/><span>Projects and work</span><ArrowUpRight size={16}/></Link>}
      {data.canReadPeople && <Link href={hr("/app/workforce/people")}><Users size={20}/><span>People and HR</span><ArrowUpRight size={16}/></Link>}
      {data.canManagePeople && <Link href={hr("/app/workforce/people?create=true")}><Users size={20}/><span>Add a person</span><ArrowUpRight size={16}/></Link>}
    </nav>{!niceJobs && !data.canReadPeople && !data.canReadWork && !data.canReadDecisions && <p>No management tools are authorized for this scope.</p>}
    {careerHub && !niceJobs && <p>Nice Jobs administration is not authorized for this Boss account. Existing access must be reviewed before the control panel can open.</p>}
    <p className="muted">Access requires a verified person, account credentials, active scoped membership and an approved role. The People &amp; Access workspace records each step and audits changes; creating a person alone grants no sign-in.</p>
    {data.canReadPeople && <nav className="boss-detail-links" aria-label="Access setup"><Link href={hr("/app/workforce/users")}>Accounts</Link><Link href={hr("/app/workforce/memberships")}>Memberships</Link><Link href={hr("/app/workforce/access")}>Roles and access</Link></nav>}
    </section>
    {staff?.canPrepare && <section className="executive-band"><h2>Employee onboarding</h2><StaffDraftForm action={bossStaffDraftAction} organizationId={data.scopeId} roles={staff.roles} managers={staff.managers} existingPeople={staff.existingPeople}/></section>}
    {staff?.canPrepare && <section className="executive-band"><h2>Invitations awaiting activation</h2><StaffInvitePanel rows={drafts} action={bossStaffInviteAction} reviewAction={bossStaffReviewAction} managers={staff.managers} deliveryReady={staffInvite.deliveryReady()}/></section>}
    {company === "aira-skill-city" && unit === "aira-skill-city" && <section className="executive-band"><h2>Access role setup</h2><RoleTemplateForm/></section>}
  </main>;
}
