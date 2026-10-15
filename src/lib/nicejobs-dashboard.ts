export const dashboardSections = [
  ["home", "Home"], ["my-work", "My Work"], ["opportunities", "Find Opportunities"],
  ["my-onboarding", "My Learning"], ["worker-wallet", "My Earnings"],
  ["worker-profile", "My Profile"], ["worker-help", "Help & Support"],
] as const;

export function dashboardSection(view: string) {
  if (["opportunities", "my-applications"].includes(view)) return "opportunities";
  if (["my-onboarding", "worker-training"].includes(view)) return "my-onboarding";
  if (view === "worker-wallet" || /^worker-(incentive|statement|payout)/.test(view)) return "worker-wallet";
  if (view === "worker-profile") return view;
  if (["worker-help", "worker-sia", "worker-messages", "notifications"].includes(view)) return "worker-help";
  return ["home", "overview", "search"].includes(view) ? "home" : "my-work";
}

export function isParticipantDashboardView(view?: string, query: Record<string, unknown> = {}) {
  if (query.control === "boss" || query.management === "true") return false;
  return !view || ["home", "overview", "search", "notifications", "opportunities", "my-applications", "my-onboarding", "my-day", "my-work", "worker-training", "worker-reports", "worker-wallet", "worker-incentives", "worker-incentive-detail", "worker-statements", "worker-statement", "worker-payouts", "worker-resources", "worker-sops", "worker-help", "worker-sia", "worker-profile", "worker-messages", "my-leads", "my-followups", "lead-detail", "work-sops", "knowledge-detail"].includes(view) || !!view?.startsWith("worker-performance") || !!view?.startsWith("worker-pip");
}

export function learningPercent(completed: number, required: number, configured: boolean) {
  return configured && required > 0 ? Math.round(Math.min(required, Math.max(0, completed)) / required * 100) : null;
}

export function participantStage(worker: boolean, trainingRecords: number, acceptedOffer: boolean) {
  return worker ? "ACTIVE_WORKER" : trainingRecords > 0 || acceptedOffer ? "SELECTED_CANDIDATE" : "APPLICANT";
}
