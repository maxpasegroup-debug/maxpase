import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { businessService } from "@/server/domain/business-service";
import { businessKinds, type BusinessKind } from "@/server/domain/business-input";
import { BusinessManager, type Options, type Row } from "../business-manager";
import { getBusinessManagementScopes } from "@/server/domain/business-workspace";
export default async function BusinessPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: requested } = await params;
  if (!businessKinds.includes(requested as BusinessKind)) notFound();
  const kind = requested as BusinessKind;
  if (kind === "projects" || kind === "goals") redirect("/app/execution/" + kind);
  const session = await requireSession();
  const rows = await businessService.list(session.userId, kind);
  const options: Options = {};
  for (const source of ["organizations", "groups", "companies", "people", "brands", "products", "projects"] as const) {
    const records = await businessService.list(session.userId, source);
    options[source] = records.map(row => {
      const r = row as unknown as Record<string, unknown>;
      return { id: String(source === "groups" ? r.organizationId : r.id), name: String(r.displayName ?? r.name), organizationId: typeof r.organizationId === "string" ? r.organizationId : typeof r.parentId === "string" ? r.parentId : undefined };
    });
  }
  const scopes = await getBusinessManagementScopes(session.userId, kind);
  options.roles = (await businessService.assignableRoles(session.userId)).map(r => ({ id: r.id, name: r.name, organizationId: r.organizationId ?? undefined }));
  const normalized = rows.map(row => {
    const r = row as unknown as Row;
    const organization = r.organization as { slug: string; parentId: string | null } | undefined;
    return { ...r, name: r.name ?? r.displayName, slug: r.slug ?? organization?.slug, groupOrganizationId: kind === "companies" ? organization?.parentId : undefined };
  });
  return <BusinessManager kind={kind} rows={JSON.parse(JSON.stringify(normalized)) as Row[]} options={options} canManage={scopes.length > 0}/>;
}
