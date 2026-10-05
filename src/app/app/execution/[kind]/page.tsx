import { Pagination } from "../../pagination";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { executionKinds, type ExecutionKind } from "@/server/domain/execution-input";
import { executionService } from "@/server/domain/execution-service";
import { ExecutionManager, type Row } from "../execution-manager";
import { fields } from "../fields";
import { executionWorkspace } from "../workspace";
export default async function ExecutionPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { kind } = await params;
  if (!executionKinds.includes(kind as ExecutionKind)) notFound();
  const session = await requireSession();
  const values = await searchParams;
  const query = Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
  const page = await executionService.listPage(session.userId, kind as ExecutionKind, query, { after: query.cursor });
  const rows = page.records;
  const w = await executionWorkspace(session.userId);
  const filters = fields[kind].filter(f => ["organizationId", "projectId", "status", "ownerPersonId", "assigneePersonId", "priority"].includes(f.key));
  return <><form className="execution-filters" method="get" aria-label={`${kind} filters`}><label>Search<input name="search" defaultValue={query.search ?? ""}/></label>{filters.map(f => <label key={f.key}>{f.label}<select name={f.key} defaultValue={query[f.key] ?? ""}><option value="">All</option>{f.values?.map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}{f.source && w.options[f.source]?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>)}{kind === "tasks" && <><label>Due on or before (UTC)<input type="date" name="dueBefore" defaultValue={query.dueBefore ?? ""}/></label><label>Overdue only<input type="checkbox" name="overdue" value="true" defaultChecked={query.overdue === "true"}/></label></>}<button className="button secondary">Apply</button></form><ExecutionManager kind={kind} rows={JSON.parse(JSON.stringify(rows)) as Row[]} workspace={w}/><Pagination path={`/app/execution/${kind}`} query={query} nextCursor={page.nextCursor}/></>;
}
