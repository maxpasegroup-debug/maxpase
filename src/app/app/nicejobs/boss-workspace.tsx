import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Building2, BookOpen, LibraryBig, BriefcaseBusiness, Users, Wallet, ClipboardList, ChartNoAxesCombined, LayoutDashboard } from "lucide-react";
import { AccessError } from "@/server/authorization/engine";
import { ZodError } from "zod";
import { NiceJobsUnavailable } from "@/server/nicejobs/input";
import { niceJobsControlPanel } from "@/server/nicejobs/control-panel";
import { niceJobsControlGroup, niceJobsControlHref } from "@/lib/nicejobs-control-navigation";
import { NiceJobsWorkspace } from "./workspace";
import { ApplicationWorkspace } from "./application-workspace";
import { OnboardingWorkspace } from "./onboarding-workspace";
import { EmployeeWorkspace } from "./employee-workspace";
import { FinanceWorkspace, financeViews } from "./finance-workspace";
import { PerformanceWorkspace, performanceViews } from "./performance-workspace";
import { KnowledgeWorkspace, knowledgeViews } from "./knowledge-workspace";
import { LeadWorkspace, leadViews } from "./lead-workspace";
import { WorkforceControlWorkspace, workforceControlViews } from "./workforce-control-workspace";
import { BossSia } from "./boss-sia";
import { BossJobSetup } from "./boss-job-setup";
import { AdmissionsReview } from "./admissions-review";
import { IntroVideoSettings } from "./intro-video-settings";
import { niceJobsIntroMedia } from "@/server/nicejobs/intro-media";
import { OfficeAdminDashboard } from "./office-admin-dashboard";
import { workforceCommandCenter } from "@/server/nicejobs/command-center";
import { DirectorDashboard, DirectorWorkspaceShell } from "./director-dashboard";
import { niceJobsService } from "@/server/nicejobs/service";
import { knowledgeService } from "@/server/nicejobs/knowledge";
import { onboardingService } from "@/server/nicejobs/onboarding";

const icons = { office: LayoutDashboard, companies: Building2, programmes: BookOpen, resources: LibraryBig, opportunities: BriefcaseBusiness, incentives: Wallet, participants: Users, admissions: ClipboardList, reports: ChartNoAxesCombined };
export async function BossWorkspace({ userId, realm, base, query }: { userId: string; realm: string; base: string; query: Record<string, string | string[] | undefined> }) {
  const view = typeof query.view === "string" ? query.view : realm === "jobs" ? "office-admin" : "workforce-command";
  const scope = Object.fromEntries(["companyId", "divisionId"].flatMap(key => typeof query[key] === "string" && query[key] ? [[key, query[key]]] : []));
  try {
    const nav = await niceJobsControlPanel.navigation(userId, scope), group = niceJobsControlGroup(view);
    const current = nav.groups.find(g => g.key === group);
    if (!current) throw new AccessError("This section is not authorized");
    const scopedQuery = { ...query, companyId: nav.companyId };
    const href = (destination: string) => niceJobsControlHref(base, destination, scopedQuery);
    const assistance = ["office-admin", "workforce-command", "boss-system","training-management"].includes(view) ? await niceJobsControlPanel.assistance(userId, scope,view==="training-management") : null;
    const props = { userId, realm, base, query: { ...scopedQuery, view, control: "boss", ...(view === "content-management" && nav.divisionId ? { organizationId: nav.divisionId } : {}) } };
    const introMedia = view === "intro-video" ? await niceJobsIntroMedia.listForBoss(userId) : null;
    const directorData = view === "office-admin" && realm === "jobs" ? await workforceCommandCenter.overview(userId, scope) : null;
    const directorJobOptions = directorData && nav.groups.some(g => g.entries.some(entry => entry.view === "templates")) ? await niceJobsService.options(userId) : null;
    const directorResources = directorData && nav.groups.some(g => g.entries.some(entry => entry.view === "content-management")) ? await knowledgeService.list(userId, { kind: "RESOURCE", management: true, limit: 1 }) : null;
    const directorTraining = directorData && nav.groups.some(g => g.entries.some(entry => entry.view === "training-management")) ? await onboardingService.navigation(userId) : null;
    const content = directorData && assistance ? <DirectorDashboard groups={nav.groups} base={base} query={scopedQuery} data={directorData} assistance={assistance} realm={realm} division={nav.division} canCreateOpportunity={directorJobOptions?.canCreate ?? false} canManageResources={directorResources?.canManage ?? false} canManageTraining={directorTraining?.manage ?? false} /> : view === "office-admin" ? <OfficeAdminDashboard groups={nav.groups} base={base} query={scopedQuery} /> : view === "intro-video" ? <IntroVideoSettings items={introMedia?.items ?? []} organizationId={introMedia?.organizationId ?? ""} base={base} realm={realm} /> : view === "founder-companies" ? <section className="nj-workspace"><h1>Companies and brands</h1><p>Manage verified legal companies and their brands in the group registry. An organization record alone does not approve an employer, agreement, or commercial terms.</p><p><Link href="/app/boss?view=companies">Open company and brand registry</Link></p><p><Link href="/app/business/companies">Manage company records</Link></p><p>Partner agreements and admission verification settings are configured with each opportunity. Keep a partner opportunity unpublished until its issuer, signed terms and event source are verified.</p><p><Link href={href("job-setup")}>Review launch job requirements</Link></p></section> : view === "founder-programmes" ? <section className="nj-workspace"><h1>Products and programmes</h1><p>Manage products under {nav.company}. Select the verified parent brand in the company hierarchy for its programme registry and commercial terms. Programme publication does not approve fees, admissions or payments.</p><p><Link href={`/app/business/products?organizationId=${encodeURIComponent(nav.companyId)}`}>Manage products and services</Link></p><p><Link href="/app/boss?view=companies">Select a brand for programmes and written terms</Link></p><p><Link href={href("job-setup")}>Connect a configured programme to a Nice Jobs opportunity</Link></p></section> : view === "job-setup" ? <BossJobSetup userId={userId} realm={realm} base={base} /> : view === "admissions" ? <AdmissionsReview userId={userId} realm={realm} /> : view === "boss-system" ? <section className="nj-boss-system"><h1>System and launch readiness</h1>
      <dl className="nj-detail"><div><dt>TARA preparation</dt><dd>{assistance?.state.replaceAll("_", " ")}</dd></div><div><dt>Scheduled processing</dt><dd>Not configured / explicit authorized processing only</dd></div><div><dt>External WhatsApp delivery</dt><dd>Not configured / provider contract and live verification required</dd></div><div><dt>Payout delivery</dt><dd>Not configured / payout intents are not transferred funds</dd></div><div><dt>Real participant pilot</dt><dd>Not verified / manager and participant sign-off required</dd></div></dl>
      <h2>Human decision boundaries</h2><ul><li>Offers require management approval; acceptance records the candidate and immutable policy versions.</li><li>Activation requires readiness evidence and an authorized human.</li><li>Compensation rules, incentive decisions and settlements retain their independent approvals.</li><li>External messages require a verified provider, current consent, an approved policy and independent human approval followed by explicit dispatch confirmation.</li></ul>
      {realm === "corporate" && <p><Link href="/app/communications">Open separately authorized communication controls</Link></p>}
    </section> : workforceControlViews.includes(view) ? <WorkforceControlWorkspace {...props} /> : financeViews.includes(view) ? <FinanceWorkspace {...props} /> : performanceViews.includes(view) ? <PerformanceWorkspace {...props} /> : knowledgeViews.includes(view) ? <KnowledgeWorkspace {...props} /> : leadViews.includes(view) ? <LeadWorkspace {...props} /> : ["active-workforce", "worker-detail", "activation"].includes(view) ? <EmployeeWorkspace {...props} /> : ["onboarding", "my-reviews", "training-management"].includes(view) ? <OnboardingWorkspace {...props} /> : view === "applications" ? <ApplicationWorkspace {...props} /> : <NiceJobsWorkspace {...props} />;
    const controlContent = <div id="nicejobs-control-content" tabIndex={-1}>{content}
      {assistance && !(realm === "jobs" && view === "office-admin") && (assistance.state === "AVAILABLE" ? <BossSia realm={realm} base={base} companyId={nav.companyId} divisionId={nav.divisionId} requestKey={randomUUID()} training={view==="training-management"} /> : <p>TARA preparation: {assistance.state.replaceAll("_", " ").toLowerCase()}. Existing human workflows remain available.</p>)}
    </div>;
    if (realm === "jobs") return <DirectorWorkspaceShell groups={nav.groups} activeView={view} base={base} company={nav.company} division={nav.division} query={scopedQuery}><a className="nj-boss-skip" href="#nicejobs-control-content">Skip to workspace</a>{controlContent}</DirectorWorkspaceShell>;
    return <div className="nj-boss-panel"><a className="nj-boss-skip" href="#nicejobs-control-content">Skip to workspace</a><header className="nj-boss-heading"><p>AIRA Career Hub</p><h1>{realm === "jobs" ? "NICEJOBS Director workspace" : "Nice Jobs control panel"}</h1><p>{nav.company} / {nav.division}</p></header>
      <nav className="nj-boss-groups" aria-label="Nice Jobs control sections">{nav.groups.map(g => { const Icon = icons[g.key as keyof typeof icons]; return <Link key={g.key} href={href(g.entries[0].view)} aria-current={g.key === group ? "page" : undefined}><Icon size={20} aria-hidden="true" />{g.label}</Link>; })}</nav>
      <nav className="nj-boss-subnav" aria-label={`${current.label} workspaces`}>{current.entries.map(entry => <Link key={entry.view} href={href(entry.view)} aria-current={entry.view === view ? "page" : undefined}>{entry.label}</Link>)}</nav>
      <p className="nj-boss-breadcrumb"><Link href={href(nav.groups[0].entries[0].view)}>Control panel</Link> / {current.label} / {current.entries.find(e => e.view === view)?.label ?? "Record details"}</p>
      {controlContent}
    </div>;
  } catch (error) {
    if (error instanceof AccessError || error instanceof ZodError || error instanceof NiceJobsUnavailable) return <section className="nj-workspace"><h1>Nice Jobs control panel</h1><p role="alert">{error instanceof ZodError ? "These scope filters are invalid." : error instanceof NiceJobsUnavailable ? "Career Hub configuration is unavailable." : "This management scope is not authorized for your account."}</p><Link href={base}>Return to your gateway</Link></section>;
    throw error;
  }
}
