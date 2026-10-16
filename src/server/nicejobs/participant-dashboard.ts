import { accountPreferences } from "@/server/account/preferences";
import { applicationService } from "./applications";
import { onboardingService } from "./onboarding";
import { employeeService } from "./employee";
import { knowledgeService } from "./knowledge";
import { operationsService } from "@/server/domain/operations-service";
import { AccessError } from "@/server/authorization/engine";
import { NiceJobsUnavailable } from "./input";
import { safeDiagnostic } from "@/server/security/diagnostics";
import { participantStage } from "@/lib/nicejobs-dashboard";
import { resultPage } from "@/server/domain/query-bounds";

export type DashboardResult<T> = { status: "AVAILABLE"; data: T } | { status: "UNAUTHORIZED" | "UNAVAILABLE"; data: null };
export async function dashboardRead<T>(read: () => Promise<T>): Promise<DashboardResult<T>> {
  try { return { status: "AVAILABLE", data: await read() }; }
  catch (error) {
    if (error instanceof AccessError) return { status: "UNAUTHORIZED", data: null };
    if (!(error instanceof NiceJobsUnavailable)) safeDiagnostic("operation_failed");
    return { status: "UNAVAILABLE", data: null };
  }
}

const dependencies = { account: accountPreferences, applications: applicationService, onboarding: onboardingService, employee: employeeService, knowledge: knowledgeService, operations: operationsService };
export function createParticipantDashboard(services = dependencies) {
  async function notifications(userId: string, read?: string, navigation?: Awaited<ReturnType<typeof services.employee.navigation>>) {
    return dashboardRead(async () => {
      const nav = navigation ?? await services.employee.navigation(userId);
      if (!nav.notificationOrganizationIds.length) throw new AccessError("Notification access unavailable");
      const rows = await services.operations.list(userId, "notifications", { read });
      return rows.filter(row => nav.notificationOrganizationIds.includes(String(row.organizationId)));
    });
  }
  async function notificationPage(userId: string, read?: string, after?: string) {
    const records = await notifications(userId, read);
    if (records.status !== "AVAILABLE") return records;
    return dashboardRead(async () => resultPage(records.data as (Record<string, unknown> & { id: string })[], { limit: 25, ...(after ? { after } : {}) }));
  }
  async function context(userId: string) {
    const account = await services.account.account(userId);
    const navigation = await dashboardRead(() => services.employee.navigation(userId));
    const unread = navigation.data ? await notifications(userId, "unread", navigation.data) : { status: navigation.status === "UNAUTHORIZED" ? "UNAUTHORIZED" as const : "UNAVAILABLE" as const, data: null };
    return { account, navigation, notifications: unread };
  }
  async function home(userId: string, worker: boolean) {
    const applications = await dashboardRead(() => services.applications.list(userId, true, { limit: 5 }));
    const learning = await dashboardRead(() => services.onboarding.list(userId, true, { limit: 5 }));
    const opportunities = await dashboardRead(() => services.applications.opportunities(userId, { limit: 3 }));
    const work = worker ? await dashboardRead(() => services.employee.day(userId)) : null;
    const stage = participantStage(work?.status === "AVAILABLE", learning.data?.records.length ?? 0, applications.data?.records.some(a => ["APPROVED", "OFFER", "OFFER_ACCEPTED"].includes(a.status)) ?? false);
    return { applications, learning, opportunities, work, stage };
  }
  async function candidateHome(userId: string) {
    const [applications, opportunities] = await Promise.all([
      dashboardRead(() => services.applications.list(userId, true, { limit: 3 })),
      dashboardRead(() => services.applications.opportunities(userId, { limit: 3 }))
    ]);
    return { applications, opportunities };
  }
  async function search(userId: string, worker: boolean, query: string) {
    const search = query.trim();
    if (!search || search.length > 120) return null;
    const jobs = await dashboardRead(() => services.applications.opportunities(userId, { search, limit: 10 }));
    const learning = await dashboardRead(() => services.onboarding.list(userId, true, { search, limit: 10 }));
    const resources = worker ? await dashboardRead(() => services.knowledge.list(userId, { kind: "RESOURCE", management: false, search, limit: 10 })) : null;
    return { jobs, learning, resources };
  }
  return { context, home, candidateHome, search, notifications, notificationPage };
}
export const participantDashboard = createParticipantDashboard();
