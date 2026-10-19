import { requireSession } from "@/server/auth/guards";
import { onboardingService } from "@/server/nicejobs/onboarding";
import { ParticipantPending } from "./participant-pending";
import { participantEntry } from "@/lib/participant-navigation";
import { NiceJobsWorkspace } from "./workspace";
import { ApplicationWorkspace } from "./application-workspace";
import { OnboardingWorkspace } from "./onboarding-workspace";
import { KnowledgeWorkspace, knowledgeViews } from "./knowledge-workspace";
import { PerformanceWorkspace, performanceViews } from "./performance-workspace";
import { LeadWorkspace, leadViews } from "./lead-workspace";
import { EmployeeWorkspace } from "./employee-workspace";
import { employeeService } from "@/server/nicejobs/employee";
import { FinanceWorkspace, financeViews } from "./finance-workspace";
import { WorkforceControlWorkspace, workforceControlViews } from "./workforce-control-workspace";
import { BossWorkspace } from "./boss-workspace";
import { isNiceJobsControlView } from "@/lib/nicejobs-control-navigation";
import { ParticipantDashboard } from "./participant-dashboard";
import { isParticipantDashboardView } from "@/lib/nicejobs-dashboard";
export default async function NiceJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const query = await searchParams;
  if (isNiceJobsControlView(String(query.view), query) || !query.view && (await employeeService.navigation(session.userId)).command) return <BossWorkspace userId={session.userId} realm="corporate" base="/app/nicejobs" query={query} />;
  if (isParticipantDashboardView(typeof query.view === "string" ? query.view : undefined, query)) return <ParticipantDashboard userId={session.userId} realm="corporate" base="/app/nicejobs" query={query} />;
  if (!query.view || ["my-day", "my-work", "worker-reports", "worker-wallet", "worker-resources", "worker-help"].includes(String(query.view))) {
    const nav = await employeeService.navigation(session.userId);
    const entry = participantEntry(nav.worker, nav.worker ? false : (await onboardingService.navigation(session.userId)).own, typeof query.view === "string" ? query.view : undefined);
    if (entry) {
      if (entry === "PENDING") return <ParticipantPending userId={session.userId} base="/app/nicejobs" view={String(query.view)} />;
      return <OnboardingWorkspace userId={session.userId} realm="corporate" base="/app/nicejobs" query={{ ...query, view: "my-day" }} />;
    }
  }
  if (workforceControlViews.includes(String(query.view))) return <WorkforceControlWorkspace userId={session.userId} realm="corporate" base="/app/nicejobs" query={query} />;
  if (financeViews.includes(String(query.view))) return <FinanceWorkspace userId={session.userId} realm="corporate" base="/app/nicejobs" query={query} />;
  if (performanceViews.includes(String(query.view))) return <PerformanceWorkspace userId={session.userId} realm="corporate" base="/app/nicejobs" query={query} />;
  if (knowledgeViews.includes(String(query.view))) return <KnowledgeWorkspace userId={session.userId} realm="corporate" base="/app/nicejobs" query={query} />;
  if (leadViews.includes(String(query.view))) return <LeadWorkspace userId={session.userId} realm="corporate" base="/app/nicejobs" query={query} />;
  const employeeViews = ["my-day", "my-work", "worker-reports", "worker-help", "worker-training", "worker-resources", "worker-sia", "worker-profile", "active-workforce", "worker-detail", "activation"];
  if (employeeViews.includes(String(query.view)) || !query.view && (await employeeService.navigation(session.userId)).worker) return <EmployeeWorkspace userId={session.userId} realm="corporate" base="/app/nicejobs" query={query} />;
  const Workspace = ["my-onboarding", "onboarding", "my-reviews", "training-management"].includes(String(query.view)) ? OnboardingWorkspace : ["opportunities", "my-applications", "applications"].includes(String(query.view)) ? ApplicationWorkspace : NiceJobsWorkspace;
  return <Workspace userId={session.userId} realm="corporate" base="/app/nicejobs" query={query} />;
}
