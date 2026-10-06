export const bossViews = { overview: "Master Command Center", companies: "Companies", brands: "Brands & Domains", people: "People", projects: "Projects", goals: "Goals", operations: "Operations", decisions: "Decisions", attention: "Attention", communications: "Communications", graph: "Business Graph", audit: "Audit & Security", system: "System", briefing: "Briefing", risks: "Risks", opportunities: "Opportunities", changes: "Changes" };
export type BossView = keyof typeof bossViews;
type Module = { label: string; href: string };
export const workspaceGroups: { key: string; label: string; views: BossView[]; href: string; modules: Module[] }[] = [
  { key: "overview", label: "Overview", views: ["overview", "briefing", "changes"], href: "/app/executive", modules: [{ label: "Executive briefing", href: "/app/executive/briefing" }, { label: "Recent changes", href: "/app/executive/changes" }] },
  { key: "companies", label: "Companies", views: ["companies", "brands", "graph"], href: "/app/business/companies", modules: [
    ["Company registry", "/app/business/companies"], ["Group structure", "/app/business/groups"], ["Organization structure", "/app/business/organizations"], ["Brands & domains", "/app/business/brands"], ["Products & services", "/app/business/products"], ["Ownership", "/app/business/ownership"], ["Company relationships", "/app/business/relationships"], ["AIRA Skill City", "/app/aira"]
  ].map(([label, href]) => ({ label, href })) },
  { key: "work", label: "Work", views: ["projects", "goals", "operations", "communications"], href: "/app/execution", modules: [
    ["Projects", "/app/execution/projects"], ["My tasks", "/app/operations/my-tasks"], ["All tasks", "/app/execution/tasks"], ["Goals", "/app/execution/goals"], ["Milestones", "/app/execution/milestones"], ["Dependencies", "/app/execution/dependencies"], ["Blockers", "/app/execution/blockers"], ["Project members", "/app/execution/members"], ["Workflows", "/app/operations/workflows"], ["Workflow runs", "/app/operations/instances"], ["Recurring work", "/app/operations/recurring"], ["Reminders", "/app/operations/reminders"], ["Communications", "/app/communications"]
  ].map(([label, href]) => ({ label, href })) },
  { key: "decisions", label: "Decisions", views: ["decisions", "attention", "risks", "opportunities"], href: "/app/operations/approvals", modules: [
    ["Approvals", "/app/operations/approvals"], ["Requests", "/app/operations/requests"], ["Notifications", "/app/operations/notifications"], ["Notification preferences", "/app/operations/preferences"], ["Escalations", "/app/operations/escalations"], ["Control points", "/app/operations/controls"], ["SIA proposals", "/app/operations/sia"], ["Decision records", "/app/executive/decisions"], ["Risks", "/app/executive/risks"], ["Opportunities", "/app/executive/opportunities"], ["Performance indicators", "/app/executive/kpis"]
  ].map(([label, href]) => ({ label, href })) },
  { key: "people", label: "People", views: ["people"], href: "/app/workforce/people", modules: [
    ["People", "/app/workforce/people"], ["User accounts", "/app/workforce/users"], ["Departments", "/app/workforce/departments"], ["Teams", "/app/workforce/teams"], ["Memberships", "/app/workforce/memberships"], ["Roles & designations", "/app/workforce/roles"], ["Permissions", "/app/workforce/permissions"], ["Access assignments", "/app/workforce/access"], ["Reporting", "/app/workforce/reporting"], ["Responsibilities", "/app/workforce/responsibilities"], ["Project responsibilities", "/app/execution/responsibilities"], ["Workforce structure", "/app/workforce/organizations"]
  ].map(([label, href]) => ({ label, href })) },
  { key: "system", label: "System", views: ["system", "audit"], href: "/app/security", modules: [
    ["Account preferences", "/app/account"], ["Security", "/app/security"], ["Activity history", "/app/operations/activity"], ["Operational events", "/app/operations/events"], ["SIA workspace", "/app/sia"], ["SIA access", "/app/workforce/sia"], ["Foundation", "/app/foundation"], ["Architecture", "/app/architecture"]
  ].map(([label, href]) => ({ label, href })) }
];
const filterKeys = ["projectId", "productId", "from", "until", "severity", "status"];
const returnKey = (key: string) => "boss" + key[0].toUpperCase() + key.slice(1);
const filterValue = (query: URLSearchParams, key: string) => query.get(query.has("returnView") ? returnKey(key) : key);
export const workspaceReturnKeys = ["returnView", "bossCompanyId", ...filterKeys.map(returnKey)];
export function isBossView(value: string): value is BossView { return Object.hasOwn(bossViews, value); }
export function groupForView(view: string) { return workspaceGroups.find(g => g.views.some(v => v === view)) ?? workspaceGroups[0]; }
export function groupForPath(path: string, view?: string) {
  if (path === "/app/boss") return groupForView(view ?? "overview");
  if (path === "/app/executive/metrics") return workspaceGroups[2];
  if (path.startsWith("/app/executive/") && isBossView(path.split("/")[3])) return groupForView(path.split("/")[3]);
  if (path === "/app/account" || path === "/app/security") return workspaceGroups[5];
  return workspaceGroups.find(g => g.modules.some(m => path === m.href || path.startsWith(m.href + "/")))
    ?? (path.startsWith("/app/executive") ? workspaceGroups[0] : workspaceGroups[2]);
}
export function workspacePageLabel(path: string, view?: string) {
  if (path === "/app/boss") return bossViews[isBossView(view ?? "") ? view as BossView : "overview"];
  if (path === "/app/executive") return "Executive Command Center";
  const detail = path.split("/")[3];
  if (path.startsWith("/app/executive/") && isBossView(detail)) return bossViews[detail];
  if (path === "/app/executive/metrics") return "Operational metrics";
  return workspaceGroups.flatMap(g => g.modules).find(m => m.href === path)?.label ?? groupForPath(path).label;
}
export function navigationBossHref(view: string, query: URLSearchParams, companyId?: string) {
  const params = new URLSearchParams({ view: isBossView(view) ? view : "overview" });
  const company = companyId ?? (query.has("returnView") ? query.get("bossCompanyId") : query.get("companyId") ?? query.get("organizationId"));
  if (company) params.set("companyId", company);
  for (const key of filterKeys) { const value = filterValue(query, key); if (value) params.set(key, value); }
  return `/app/boss?${params}`;
}
export function workspaceHref(href: string, companyId?: string, view?: string, query?: URLSearchParams) {
  const [path, search = ""] = href.split("?");
  const params = new URLSearchParams(search);
  if (companyId && !href.startsWith("/app/business/")) {
    if (!params.has("organizationId")) params.set("organizationId", companyId);
    params.set("companyId", companyId);
    if (href.startsWith("/app/workforce/")) params.set("organization", companyId);
  }
  if (view && isBossView(view)) {
    params.set("returnView", view);
    const originCompany = query?.has("returnView") ? query.get("bossCompanyId") : companyId;
    if (originCompany) params.set("bossCompanyId", originCompany);
  }
  for (const key of filterKeys) { const value = query && filterValue(query, key); if (value) params.set(returnKey(key), value); }
  return path + (params.size ? "?" + params : "");
}
