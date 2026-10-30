type Dated = { updatedAt?: Date | null };
type Group = { status: string; _count: { _all: number }; _max: { updatedAt: Date | null } };
export type BrandMetric = { key: string; label: string; value: number | null; href: string | null; coverage: string; freshness: string };

function metric(key: string, label: string, value: number | null, href: string | null, records: Dated[], calculatedAt: Date, coverage: string): BrandMetric {
  const latest = records.reduce<Date | null>((last, row) => row.updatedAt && (!last || row.updatedAt > last) ? row.updatedAt : last, null);
  return { key, label, value, href: value === null ? null : href, coverage,
    freshness: value === null ? "Unavailable" : !latest ? "No recorded updates" : calculatedAt.getTime() - latest.getTime() > 7 * 86400000 ? "Last update over 7 days ago" : "Updated within 7 days" };
}
const total = (groups: Group[] | null) => groups?.reduce((sum, row) => sum + row._count._all, 0) ?? null;
const dates = (groups: Group[] | null) => groups?.map(row => ({ updatedAt: row._max.updatedAt })) ?? [];
const status = (groups: Group[] | null, value: string) => groups?.find(row => row.status === value)?._count._all ?? 0;
const shownGroup = (value: number | null) => value === null ? null : Math.min(value, 100);
const groupCoverage = (value: number | null, source: string) => value === null ? "Not authorized or not connected" : value > 100 ? `First 100 ${source}; more records exist in the source` : `Authorized ${source}`;

export function buildBrandReport(input: {
  brandId: string;
  startupConfigured: boolean;
  projects: ({ status: string } & Dated)[] | null;
  products: Dated[] | null;
  programs: Dated[] | null;
  admissions: Group[] | null;
  campaigns: Group[] | null;
  commercial: Group[] | null;
  overdueTasks: Dated[] | null;
  calculatedAt: Date;
}): BrandMetric[] {
  const base = `/app/boss/brands/${encodeURIComponent(input.brandId)}`;
  const shown = <T>(rows: T[] | null, limit: number) => rows === null ? null : Math.min(rows.length, limit);
  const coverage = <T>(rows: T[] | null, limit: number, scope: string) => rows === null ? "Not authorized" : rows.length > limit ? `First ${limit} authorized ${scope}; more records exist` : `Authorized ${scope} linked to this brand`;
  const projects = input.projects?.slice(0, 50) ?? [];
  const products = input.products?.slice(0, 100) ?? [];
  const programs = input.programs?.slice(0, 50) ?? [];
  const overdue = input.overdueTasks?.slice(0, 20) ?? [];
  return [
    metric("projects", "Projects shown", shown(input.projects, 50), "#projects", projects, input.calculatedAt, coverage(input.projects, 50, "projects")),
    metric("products", "Products shown", shown(input.products, 100), "#products", products, input.calculatedAt, coverage(input.products, 100, "products")),
    metric("programs", "Programmes shown", shown(input.programs, 50), "#programs", programs, input.calculatedAt, input.programs === null && !input.startupConfigured ? "No verified Startup School division" : coverage(input.programs, 50, "programmes")),
    metric("admissions", "Applications shown", shownGroup(total(input.admissions)), `${base}/admissions`, dates(input.admissions), input.calculatedAt, input.admissions === null ? input.startupConfigured ? "Not authorized" : "No verified Startup School division" : groupCoverage(total(input.admissions), "Startup School applications in the verified division")),
    metric("admissionReviews", "Applications in review shown", input.admissions === null ? null : shownGroup(status(input.admissions, "IN_REVIEW")), `${base}/admissions?status=IN_REVIEW`, dates(input.admissions), input.calculatedAt, input.admissions === null ? input.startupConfigured ? "Not authorized" : "No verified Startup School division" : groupCoverage(status(input.admissions, "IN_REVIEW"), "applications in review; review is not admission")),
    metric("campaigns", "Campaigns shown", shownGroup(total(input.campaigns)), `${base}/marketing`, dates(input.campaigns), input.calculatedAt, input.campaigns === null ? "Not authorized or brand inactive" : groupCoverage(total(input.campaigns), "brand-keyed internal campaigns")),
    metric("campaignReviews", "Campaigns awaiting review shown", input.campaigns === null ? null : shownGroup(status(input.campaigns, "IN_REVIEW")), `${base}/marketing?status=IN_REVIEW`, dates(input.campaigns), input.calculatedAt, input.campaigns === null ? "Not authorized or brand inactive" : groupCoverage(status(input.campaigns, "IN_REVIEW"), "campaigns in review; review is not publication")),
    metric("commercial", "Commercial proposals shown", shownGroup(total(input.commercial)), `${base}/commercial`, dates(input.commercial), input.calculatedAt, input.commercial === null ? input.startupConfigured ? "Not authorized or inactive" : "No verified Startup School division" : groupCoverage(total(input.commercial), "written terms proposals; not invoices or payments")),
    metric("blocked", "Blocked projects shown", input.projects === null ? null : projects.filter(row => row.status === "BLOCKED").length, "#projects", projects.filter(row => row.status === "BLOCKED"), input.calculatedAt, coverage(input.projects, 50, "projects")),
    metric("overdue", "Overdue tasks shown", shown(input.overdueTasks, 20), "#exceptions", overdue, input.calculatedAt, coverage(input.overdueTasks, 20, "overdue tasks on brand projects")),
    metric("sales", "Sales leads", null, null, [], input.calculatedAt, "No verified brand link in the shared CRM source"),
    metric("people", "Brand team", null, null, [], input.calculatedAt, "Company or division membership does not establish brand assignment"),
    metric("payments", "Payments", null, null, [], input.calculatedAt, "No verified brand payment source or approval evidence")
  ];
}
