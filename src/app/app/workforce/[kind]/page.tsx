import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { workforceKinds, type WorkforceKind } from "@/server/domain/workforce-input";
import { workforceService } from "@/server/domain/workforce-service";
import { WorkforceManager, type WorkforceRow, type Workspace } from "../workforce-manager";
export default async function WorkforcePage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { kind: requested } = await params;
  if (!workforceKinds.includes(requested as WorkforceKind)) notFound();
  const kind = requested as WorkforceKind;
  const session = await requireSession(); const search = await searchParams;
  const scalar = (key: string) => typeof search[key] === "string" ? search[key] as string : undefined;
  const organizationId = scalar("organization");
  if (organizationId) await workforceService.switchOrganization(session.userId, organizationId);
  const rows = await workforceService.list(session.userId, kind, { organizationId, search: scalar("search"), status: scalar("status") });
  const workspace = await workforceService.workspace(session.userId);
  const normalized = rows.map(row => {
    const r = row as unknown as WorkforceRow;
    const person = r.person as { memberships?: { organizationId: string }[] } | undefined;
    const memberships = (r.memberships ?? person?.memberships) as { organizationId: string }[] | undefined;
    return { ...r, organizationId: ["organizations", "departments", "teams"].includes(kind) ? r.id : r.organizationId ?? memberships?.[0]?.organizationId ?? organizationId };
  });
  const accounts = kind === "access" ? await workforceService.list(session.userId, "users", { organizationId }) : [];
  return <WorkforceManager kind={kind} rows={JSON.parse(JSON.stringify(normalized)) as WorkforceRow[]} workspace={workspace as Workspace} activeOrganization={organizationId ?? ""} search={scalar("search") ?? ""} status={scalar("status") ?? ""} accounts={JSON.parse(JSON.stringify(accounts)) as WorkforceRow[]}/>;
}
