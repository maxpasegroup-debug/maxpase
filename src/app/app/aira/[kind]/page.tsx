import { Pagination } from "../../pagination";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { airaService } from "@/server/domain/aira-service";
import { companyKinds, type CompanyKind, programStatuses, batchStatuses, locationStatuses } from "@/server/domain/company-input";
import { CompanyManager } from "../company-manager";
export default async function CompanyRegistry({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { kind } = await params;
  if (!companyKinds.includes(kind as CompanyKind)) notFound();
  const k = kind as CompanyKind, session = await requireSession(), query = await searchParams;
  const get = (key: string) => typeof query[key] === "string" ? query[key] as string : undefined;
  const w = await airaService.workspace(session.userId);
  const page = await airaService.listPage(session.userId, k, { search: get("search"), status: get("status"), organizationId: get("organizationId"), divisionId: get("divisionId") }, { after: get("cursor") });
  const rows = page.records;
  const statuses = k === "programs" ? programStatuses : k === "batches" ? batchStatuses : k === "locations" ? locationStatuses : k === "participants" ? ["PLANNED", "ACTIVE", "COMPLETED", "WITHDRAWN"] : k === "workflows" ? ["DRAFT", "ACTIVE", "ARCHIVED"] : k === "instances" ? ["PENDING", "SUCCEEDED", "FAILED", "CANCELLED"] : k === "requests" ? ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"] : ["projects", "goals", "people", "divisions", "teams", "departments", "products", "responsibilities"].includes(k) ? k === "projects" ? ["PLANNED", "ACTIVE", "PAUSED", "BLOCKED", "COMPLETED", "CANCELLED", "ARCHIVED"] : k === "goals" ? ["DRAFT", "ACTIVE", "PAUSED", "AT_RISK", "MISSED", "ACHIEVED", "CANCELLED", "ARCHIVED"] : ["ACTIVE", "INACTIVE", "ARCHIVED"] : ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"];
  return <section><form className="list-toolbar"><label><span className="sr-only">Search</span><input name="search" placeholder="Search" defaultValue={get("search")}/></label><label><span className="sr-only">Status</span><select name="status" defaultValue={get("status")}><option value="">All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label><label><span className="sr-only">Organization</span><select name="organizationId" defaultValue={get("organizationId")}><option value="">All accessible AIRA scopes</option>{w.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>{get("divisionId") && <input type="hidden" name="divisionId" value={get("divisionId")}/>}<button className="button secondary">Filter</button></form><CompanyManager kind={k} rows={JSON.parse(JSON.stringify(rows))} workspace={w}/><Pagination path={`/app/aira/${kind}`} query={Object.fromEntries(Object.entries(query).filter(([, v]) => typeof v === "string")) as Record<string, string>} nextCursor={page.nextCursor}/></section>;
}
