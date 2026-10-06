import { Pagination } from "../../pagination";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { operationsService } from "@/server/domain/operations-service";
import { operationsKinds, type OperationsKind } from "@/server/domain/operations-input";
import { executionService } from "@/server/domain/execution-service";
import { OperationsManager, type Row } from "../operations-manager";
import { WorkspaceReturnFields } from "@/components/ui/workspace-return-fields";
import { SavedFilters } from "@/components/ui/saved-filters";
import { workSortOptions } from "@/lib/work-list";
export default async function OperationsPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { kind: route } = await params;
  if (!operationsKinds.includes(route as OperationsKind)) notFound();
  const kind = route as OperationsKind;
  const session = await requireSession();
  const values = await searchParams;
  const query = Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
  const page = await operationsService.listPage(session.userId, kind, query, { after: query.cursor });
  const rows = page.records;
  const w = await operationsService.workspace(session.userId);
  const operationalTargets = async (category: "requests" | "instances", resourceType: string) => (await operationsService.list(session.userId, category)).flatMap(r => "organizationId" in r ? [{ id: String(r.id), name: String("title" in r ? r.title : category), organizationId: String(r.organizationId), projectId: "projectId" in r ? r.projectId as string | null : null, resourceType }] : []);
  const targets = [
    ...w.companyTargets,
    ...w.organizations.map(o => ({ ...o, organizationId: o.id, projectId: null, resourceType: "ORGANIZATION" })),
    ...w.projects.map(p => ({ ...p, projectId: p.id, resourceType: "PROJECT" })),
    ...(await executionService.list(session.userId, "tasks")).flatMap(r => "title" in r && "organizationId" in r ? [{ id: r.id, name: r.title ?? "Task", organizationId: r.organizationId, projectId: "projectId" in r ? r.projectId : null, resourceType: "TASK" }] : []),
    ...(await executionService.list(session.userId, "goals")).flatMap(r => "title" in r && "organizationId" in r ? [{ id: r.id, name: r.title ?? "Goal", organizationId: r.organizationId, projectId: "projectId" in r ? r.projectId : null, resourceType: "GOAL" }] : []),
    ...await operationalTargets("requests", "REQUEST"), ...await operationalTargets("instances", "INSTANCE")
  ];
  const option = (name: string, label: string, options: { id: string; name: string }[]) => <label key={name}>{label}<select name={name} defaultValue={query[name] ?? ""}><option value="">{name === "approverUserId" ? "Assigned to me" : "All"}</option>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>;
  const statuses = kind === "approvals" ? ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"] : kind === "requests" || kind === "sia" ? ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"] : kind === "my-tasks" ? ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] : kind === "escalations" ? ["OPEN", "RESOLVED"] : kind === "workflows" ? ["DRAFT", "ACTIVE", "ARCHIVED"] : kind === "controls" ? ["ACTIVE", "ARCHIVED"] : kind === "recurring" ? ["ACTIVE", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"] : ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"];
  return <><details className="work-list-filter-panel"><summary>Search & filters</summary><form className="execution-filters" method="get" aria-label={`${kind} filters`}><WorkspaceReturnFields query={query}/><label>Search<input name="search" defaultValue={query.search ?? ""}/></label>{kind !== "preferences" && <>{option("organizationId", "Organization", w.organizations)}{option("projectId", "Project", w.projects)}{!["activity", "notifications"].includes(kind) && option("status", "Status", statuses.map(id => ({ id, name: id.replaceAll("_", " ") })))}</>}
    {kind === "approvals" && <>{option("requesterUserId", "Requester", w.users)}{option("approverUserId", "Approver", w.users)}</>}
    {kind === "requests" && option("requesterUserId", "Requester", w.users)}
    {kind === "notifications" && <>{option("read", "Read state", [{ id: "read", name: "Read" }, { id: "unread", name: "Unread" }])}{option("priority", "Priority", ["LOW", "NORMAL", "HIGH", "CRITICAL"].map(id => ({ id, name: id })))}<label>Type<input name="type" defaultValue={query.type ?? ""}/></label></>}
    {["events", "activity"].includes(kind) && <>{option("actorUserId", "Actor", w.users)}<label>Entity reference<input name="entityId" defaultValue={query.entityId ?? ""}/></label>{kind === "events" && <label>Type<input name="type" defaultValue={query.type ?? ""}/></label>}</>}
    {["approvals", "requests", "events", "activity"].includes(kind) && <><label>From (UTC)<input name="from" type="date" defaultValue={query.from ?? ""}/></label><label>Through (UTC)<input name="until" type="date" defaultValue={query.until ?? ""}/></label></>}
    {kind === "my-tasks" && <label>Due on or before (UTC)<input name="dueBefore" type="date" defaultValue={query.dueBefore ?? ""}/></label>}
    <label>Sort<select name="sort" defaultValue={query.sort ?? "reference"}>{workSortOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label><button className="button secondary">Apply</button></form></details><SavedFilters userId={session.userId}/><OperationsManager kind={kind} rows={JSON.parse(JSON.stringify(rows)) as Row[]} workspace={JSON.parse(JSON.stringify(w))} targets={targets}/><Pagination path={`/app/operations/${kind}`} query={query} nextCursor={page.nextCursor}/></>;
}
