export const niceJobsControlGroups = [
  { key: "overview", label: "Overview", entries: [["workforce-command", "Needs attention", "nicejobs.command.read"]] },
  { key: "opportunities", label: "Opportunities", entries: [["templates", "Job templates", "nicejobs.job.read"], ["drafts", "Draft opportunities", "nicejobs.job.read"], ["published", "Published opportunities", "nicejobs.job.read"]] },
  { key: "applicants", label: "Applicants", entries: [["applications", "Applications and offers", "nicejobs.application.read"], ["onboarding", "Orientation and OJT", "nicejobs.onboarding.read"], ["my-reviews", "Assigned training reviews", "nicejobs.ojt.review"], ["activation", "Ready for activation", "nicejobs.worker.activate"]] },
  { key: "workforce", label: "Workforce", entries: [["training-management", "Training management", "nicejobs.onboarding.read"], ["active-workforce", "People and goals", "nicejobs.workspace.read"], ["lead-pool", "Leads and follow-ups", "nicejobs.lead.pool.read"], ["performance", "Performance and reports", "nicejobs.performance.read"], ["pips", "Improvement plans", "nicejobs.pip.read"], ["content-management", "Resources and communications", "nicejobs.knowledge.read"], ["workforce-exceptions", "Exceptions and ownership", "nicejobs.exception.read"]] },
  { key: "earnings", label: "Earnings", entries: [["finance-incentives", "Incentive decisions", "nicejobs.finance.incentive.read"], ["finance-wallets", "Wallets", "nicejobs.finance.wallet.read"], ["finance-settlements", "Settlement reviews", "nicejobs.finance.settlement.read"], ["finance-statements", "Statements", "nicejobs.finance.settlement.read"], ["finance-adjustments", "Corrections", "nicejobs.finance.wallet.adjust"], ["finance-payouts", "Payout intents", "nicejobs.finance.payout.read"], ["finance-exceptions", "Reconciliation exceptions", "nicejobs.finance.reconcile"], ["finance-policies", "Approved rules", "nicejobs.finance.policy.read"]] },
  { key: "system", label: "System", entries: [["boss-system", "Assistance and launch readiness", "nicejobs.command.read"], ["automation-workflows", "Reviewed workflows", "nicejobs.automation.read"], ["automation-runs", "Execution history", "nicejobs.automation.read"]] },
] as const;

const detailGroups: Record<string, string> = {
  "worker-detail": "workforce", "lead-detail": "workforce", "lead-policies": "workforce",
  "performance-detail": "workforce", "performance-frameworks": "workforce", "performance-evidence": "workforce", "pip-detail": "workforce", "knowledge-detail": "workforce",
  "finance-incentive-detail": "earnings", "finance-statement": "earnings", "finance-ledger": "earnings", "finance-payouts": "earnings",
  "automation-detail": "system", workforce: "workforce",
};
export function niceJobsControlGroup(view: string) {
  return niceJobsControlGroups.find(g => g.entries.some(([v]) => v === view))?.key ?? detailGroups[view] ?? null;
}
export function isNiceJobsControlView(view: string, query: Record<string, string | string[] | undefined>) {
  if (view === "lead-detail") return query.control === "boss";
  if (view === "knowledge-detail") return query.management === "true";
  return niceJobsControlGroup(view) !== null;
}
export function niceJobsControlHref(base: string, view: string, query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams({ view });
  // Record IDs, cursors and state filters belong to the old destination, not the new section.
  for (const key of ["companyId", "divisionId"]) if (typeof query[key] === "string" && query[key]) params.set(key, query[key]);
  return `${base}?${params}`;
}
export function niceJobsControlRecordHref(base: string, href: string, companyId: string) {
  const target = new URL(href, "http://nicejobs.local");
  if (target.origin !== "http://nicejobs.local" || target.pathname !== "/app/nicejobs") return null;
  target.pathname = base;
  target.searchParams.set("companyId", companyId);
  if (target.searchParams.get("view") === "lead-detail") target.searchParams.set("control", "boss");
  return target.pathname + target.search + target.hash;
}
