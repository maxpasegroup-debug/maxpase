export const niceJobsControlGroups = [
  { key: "companies", label: "Companies", entries: [["founder-companies", "Company and brand registry", "nicejobs.command.read"]] },
  { key: "programmes", label: "Products & Programmes", entries: [["founder-programmes", "Products and programmes", "nicejobs.job.read"]] },
  { key: "resources", label: "Resources", entries: [["content-management", "Content library", "nicejobs.knowledge.read"]] },
  { key: "opportunities", label: "Opportunities", entries: [["job-setup", "Set up launch jobs", "nicejobs.job.read"], ["templates", "Job templates", "nicejobs.job.read"], ["drafts", "Draft opportunities", "nicejobs.job.read"], ["published", "Published opportunities", "nicejobs.job.read"]] },
  { key: "incentives", label: "Incentives", entries: [["finance-policies", "Incentive rules", "nicejobs.finance.policy.read"], ["finance-incentives", "Incentive decisions", "nicejobs.finance.incentive.read"], ["finance-wallets", "Wallets", "nicejobs.finance.wallet.read"], ["finance-settlements", "Settlement reviews", "nicejobs.finance.settlement.read"], ["finance-statements", "Statements", "nicejobs.finance.settlement.read"], ["finance-adjustments", "Corrections", "nicejobs.finance.wallet.adjust"], ["finance-payouts", "Payout intents", "nicejobs.finance.payout.read"]] },
  { key: "participants", label: "Participants", entries: [["active-workforce", "People and goals", "nicejobs.workspace.read"], ["onboarding", "Orientation and OJT", "nicejobs.onboarding.read"], ["training-management", "Training management", "nicejobs.onboarding.read"], ["my-reviews", "Assigned training reviews", "nicejobs.ojt.review"], ["activation", "Ready for activation", "nicejobs.worker.activate"], ["lead-pool", "Leads and follow-ups", "nicejobs.lead.pool.read"], ["pips", "Improvement plans", "nicejobs.pip.read"]] },
  { key: "admissions", label: "Admissions", entries: [["applications", "Applications and offers", "nicejobs.application.read"], ["admissions", "Admission verification", "nicejobs.finance.reconcile"], ["finance-exceptions", "Reconciliation exceptions", "nicejobs.finance.reconcile"]] },
  { key: "reports", label: "Reports", entries: [["workforce-command", "Needs attention", "nicejobs.command.read"], ["performance", "Performance and reports", "nicejobs.performance.read"], ["workforce-exceptions", "Exceptions and ownership", "nicejobs.exception.read"], ["boss-system", "Assistance and launch readiness", "nicejobs.command.read"], ["intro-video", "Introduction video", "nicejobs.command.read"], ["automation-workflows", "Reviewed workflows", "nicejobs.automation.read"], ["automation-runs", "Execution history", "nicejobs.automation.read"]] },
] as const;

const detailGroups: Record<string, string> = {
  "worker-detail": "participants", "lead-detail": "participants", "lead-policies": "participants",
  "performance-detail": "reports", "performance-frameworks": "reports", "performance-evidence": "reports", "pip-detail": "participants", "knowledge-detail": "resources",
  "finance-incentive-detail": "incentives", "finance-statement": "incentives", "finance-ledger": "incentives", "finance-payouts": "incentives",
  "automation-detail": "reports", workforce: "participants",
  "intro-video": "reports",
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
