import Link from "next/link";
import { requireSession } from "@/server/auth/guards";
import { executionService } from "@/server/domain/execution-service";
import { ExecutionManager, type Row } from "../../execution-manager";
import { executionWorkspace } from "../../workspace";
import { workspaceHref } from "@/lib/workspace-navigation";
export default async function ProjectDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const session = await requireSession();
  const detail = await executionService.detail(session.userId, id);
  const w = await executionWorkspace(session.userId);
  const values = await searchParams;
  const query = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const p = JSON.parse(JSON.stringify(detail.project)) as Row;
  const href = (path: string) => workspaceHref(path, query.get("companyId") ?? String(p.organizationId), query.get("returnView") ?? undefined, query);
  const label = (value: unknown, source: string) => w.options[source]?.find(o => o.id === value)?.name ?? "Not assigned";
  const tasks = (detail.sections.tasks ?? []) as Row[];
  const next = tasks.filter(t => ["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED"].includes(String(t.status))).slice(0, 5);
  return <><Link prefetch={false} href={href("/app/execution/projects")} className="muted">Projects</Link><p className="eyebrow section">Execution workspace</p><h1>{String(p.name)}</h1><p>{String(p.description ?? "No description recorded.")}</p><dl className="record-details"><div><dt>Organization</dt><dd>{label(p.organizationId, "organizations")}</dd></div><div><dt>Status / health</dt><dd>{String(p.status)} / {String(p.health)}</dd></div><div><dt>Owner</dt><dd>{label(p.ownerPersonId, "people")}</dd></div><div><dt>Accountable person</dt><dd>{label(p.accountablePersonId, "people")}</dd></div><div><dt>Start / target (UTC)</dt><dd>{String(p.startDate ?? "Not set").slice(0, 10)} / {String(p.targetDate ?? "Not set").slice(0, 10)}</dd></div><div><dt>Progress</dt><dd>{p.calculatedProgress == null ? "Unknown" : Number(p.calculatedProgress).toFixed(1) + "% derived"}</dd></div></dl><section className="section"><h2>Next actions</h2>{next.length ? next.map(t => <p key={t.id}>{String(t.title)} <span className="status">{String(t.status)}</span></p>) : <p className="muted">No open tasks visible.</p>}</section><ExecutionManager kind="projects" rows={JSON.parse(JSON.stringify([p])) as Row[]} workspace={w} compact/>{Object.entries(detail.sections).map(([kind, rows]) => <ExecutionManager key={kind} kind={kind} rows={JSON.parse(JSON.stringify(rows)) as Row[]} workspace={w} projectId={id} compact/>)}<section className="section"><h2>Responsibilities</h2><Link prefetch={false} className="button secondary" href={href(`/app/workforce/responsibilities?organizationId=${p.organizationId}&projectId=${id}`)}>Manage responsibilities</Link></section></>;
}
