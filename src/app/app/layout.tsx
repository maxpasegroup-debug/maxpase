import { LogOut } from "lucide-react";
import { logoutAction } from "@/server/auth/actions";
import { requireSession } from "@/server/auth/guards";
import { BOSS_EMAIL, groupIdentity } from "@/server/group/identity";
import { accountPreferences } from "@/server/account/preferences";
import { WorkspaceShell } from "@/components/workspace-shell";
import { prisma } from "@/server/db";
import { createAccessContext } from "@/server/authorization/engine";
import { boundedRead } from "@/server/domain/query-bounds";
import { QueryBudgetError } from "@/server/domain/query-bounds";
import { operationsService } from "@/server/domain/operations-service";
import { AccessError } from "@/server/authorization/engine";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession(), account = await accountPreferences.account(session.userId);
  const boss = session.email === BOSS_EMAIL;
  const root = boss ? await prisma.organization.findUnique({ where: { slug: groupIdentity.slug }, select: { id: true } }) : null;
  const access = await createAccessContext(session.userId, prisma, undefined, root ? { organizationId: root.id } : undefined);
  const ids = access.organizationIds("company.read").filter(id => access.organizationIds("organization.read").includes(id));
  const companies = await boundedRead(take => prisma.companyProfile.findMany({ take, where: { organizationId: { in: ids } }, select: { organizationId: true, displayName: true, legalName: true }, orderBy: { displayName: "asc" } }));
  let unread: number | null = null;
  try { if (access.grants.some(g => g.key === "notification.read")) unread = (await operationsService.list(session.userId, "notifications", { read: "unread" })).length; }
  catch (error) { if (!(error instanceof AccessError) && !(error instanceof QueryBudgetError)) throw error; }
  return <WorkspaceShell boss={boss} {...account} unread={unread} companies={companies.map(c => ({ id: c.organizationId, name: c.legalName ?? c.displayName }))} logout={<form action={logoutAction}><button className="icon-button" type="submit" title="Sign out" aria-label="Sign out"><LogOut size={20}/></button></form>}>{children}</WorkspaceShell>;
}
