import Link from "next/link";
import { requireSession } from "@/server/auth/guards";
import { executionService } from "@/server/domain/execution-service";
import { UserTime } from "@/components/ui/user-time";
export default async function Overview() {
  const session = await requireSession();
  const data = await executionService.overview(session.userId);
  const labels: Record<string, string> = { activeProjects: "Active projects", blockedProjects: "Blocked projects", overdueTasks: "Overdue tasks", upcomingDeadlines: "Upcoming deadlines", activeGoals: "Active goals", atRiskGoals: "At-risk goals", recentlyCompleted: "Completed this week" };
  return <><p className="eyebrow">Execution workspace</p><h1>Execution overview</h1><p className="muted">As of <UserTime value={data.asOf}/></p><dl className="execution-metrics">{Object.entries(data.metrics).map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd>{value}</dd></div>)}</dl><section className="section"><h2>Attention</h2>{!data.attention.length ? <p className="muted">No attention items in your accessible scope.</p> : <div className="table-scroll"><table className="business-table"><thead><tr><th>Work</th><th>Condition</th><th>Deadline</th></tr></thead><tbody>{data.attention.map(a => <tr key={a.kind + a.id}><td>{a.projectId ? <Link href={`/app/execution/projects/${a.projectId}`}>{a.title}</Link> : a.title}</td><td>{a.kind.replaceAll("_", " ")}</td><td><UserTime value={a.date} empty="Not set"/></td></tr>)}</tbody></table></div>}</section><section className="section"><h2>Recently completed</h2>{data.completed.length ? data.completed.map(r => <p key={r.id}>{"title" in r ? r.title : "name" in r ? r.name : ""}</p>) : <p className="muted">No work completed in the last seven days.</p>}</section></>;
}
