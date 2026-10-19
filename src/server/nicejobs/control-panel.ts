import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { niceJobsControlGroups } from "@/lib/nicejobs-control-navigation";
import { createEmployeeService } from "./employee";
import { toolAuthority } from "@/server/sia/context";
import { configuredProvider } from "@/server/sia/provider";

const scopeInput = z.object({ companyId: z.string().min(1).max(200).optional(), divisionId: z.string().min(1).max(200).optional() }).strict();
export function createNiceJobsControlPanel(client: PrismaClient = prisma) {
  async function navigation(userId: string, raw: unknown = {}) {
    const scope = scopeInput.parse(raw), b = await createEmployeeService(client).internal.boundary(client, userId);
    if (scope.companyId && scope.companyId !== b.company.id) throw new AccessError("Company unavailable");
    const divisions = b.ctx.nodes.filter(n => n.type === "DIVISION" && n.parentId === b.company.id);
    const allowed = (key: string) => divisions.some(d => (!scope.divisionId || scope.divisionId === d.id) && b.ctx.organizationIds(key).includes(d.id));
    const groups = niceJobsControlGroups.map(g => ({ key: g.key, label: g.label, entries: g.entries.filter(([, , key]) => allowed(key)).map(([view, label]) => ({ view, label })) })).filter(g => g.entries.length);
    if (!groups.length || scope.divisionId && !divisions.some(d => d.id === scope.divisionId)) throw new AccessError("Management scope unavailable");
    const division = scope.divisionId ? await client.organization.findUniqueOrThrow({ where: { id: scope.divisionId }, select: { name: true } }) : null;
    return { company: b.company.name, companyId: b.company.id, divisionId: scope.divisionId ?? null, division: division?.name ?? "Authorized business areas", groups };
  }
  async function assistance(userId: string, raw: unknown = {}, training=false) {
    const nav = await navigation(userId, raw), organizationId = nav.divisionId ?? nav.companyId;
    if (configuredProvider().name === "UNAVAILABLE") return { state: "NOT_CONFIGURED" as const, siaId: null, organizationId };
    const key=training?"get_training_management":"get_workforce_command",permissionKey=training?"nicejobs.onboarding.read":"nicejobs.command.read";
    const identities = await client.siaIdentity.findMany({ where: { status: "ACTIVE", tools: { some: { key, enabled: true, permissionKey } } }, select: { id: true }, orderBy: { id: "asc" }, take: 10 });
    for (const identity of identities) {
      try {
        await toolAuthority(client, userId, { siaId: identity.id, organizationId }, key);
        return { state: "AVAILABLE" as const, siaId: identity.id, organizationId };
      } catch (error) { if (!(error instanceof AccessError)) throw error; }
    }
    return { state: identities.length ? "NOT_AUTHORIZED" as const : "NOT_CONFIGURED" as const, siaId: null, organizationId };
  }
  return { navigation, assistance };
}
export const niceJobsControlPanel = createNiceJobsControlPanel();
