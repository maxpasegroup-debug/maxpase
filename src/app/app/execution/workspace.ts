import { executionService } from "@/server/domain/execution-service";
import type { Workspace, Row } from "./execution-manager";
export async function executionWorkspace(userId: string): Promise<Workspace> {
  const base = await executionService.workspace(userId);
  const options: Workspace["options"] = { organizations: base.organizations, projects: base.projects, people: base.people, products: base.products, brands: base.brands };
  const history: Workspace["history"] = {};
  for (const kind of ["tasks", "milestones", "goals"] as const) {
    const rows = await executionService.list(userId, kind);
    options[kind] = rows.map(r => ({ id: r.id, name: String("title" in r ? r.title : "name" in r ? r.name : ""), organizationId: "organizationId" in r ? r.organizationId ?? undefined : undefined, projectId: "projectId" in r ? r.projectId : null }));
    if (kind === "goals") for (const r of rows) history[r.id] = JSON.parse(JSON.stringify(await executionService.history(userId, r.id))) as Row[];
  }
  return { options, history, scopes: base.scopes };
}
