import Link from "next/link";
import { Play } from "lucide-react";
import { requireSession } from "@/server/auth/guards";
import { operationsService } from "@/server/domain/operations-service";
import { ActionForm } from "./operations-manager";
export default async function OperationsOverview() {
  const session = await requireSession();
  const metrics = await operationsService.overview(session.userId);
  const w = await operationsService.workspace(session.userId);
  const sections = [
    { name: "Pending approvals", count: metrics.pendingApprovals, route: "approvals?status=PENDING" },
    { name: "Overdue tasks", count: metrics.overdueTasks, route: "../execution/tasks?overdue=true" },
    { name: "Blocked projects", count: metrics.blockedProjects, route: "../execution/projects?status=BLOCKED" },
    { name: "Open escalations", count: metrics.unresolvedEscalations, route: "escalations?status=OPEN" },
    { name: "Important notifications", count: metrics.importantNotifications, route: "notifications?read=unread" },
    { name: "Failed events", count: metrics.failedEvents, route: "events?status=FAILED" }
  ];
  const canProcess = w.scopes["operations.process"].organizations.length + w.scopes["operations.process"].projects.length > 0;
  return <><div className="view-heading"><h1>Operations</h1>{canProcess && <ActionForm operation="process"><button className="button secondary"><Play size={16}/>Process due work</button></ActionForm>}</div><div className="operations-overview">{sections.map(s => <Link key={s.name} href={`/app/operations/${s.route}`}><span>{s.name}</span><strong>{s.count}</strong></Link>)}</div><section className="section"><h2>Work queues</h2><div className="operations-links">{[{ name: "My Tasks", route: "my-tasks" }, { name: "Approvals", route: "approvals" }, { name: "Requests", route: "requests" }, { name: "Notifications", route: "notifications" }, { name: "Activity", route: "activity" }, { name: "Workflows", route: "workflows" }, { name: "Workflow Runs", route: "instances" }, { name: "Operational Events", route: "events" }, { name: "Reminders", route: "reminders" }, { name: "Recurring Work", route: "recurring" }, { name: "Escalations", route: "escalations" }, { name: "Control Points", route: "controls" }, { name: "SIA Proposals", route: "sia" }].map(s => <Link href={`/app/operations/${s.route}`} key={s.route}>{s.name}</Link>)}</div></section></>;
}
