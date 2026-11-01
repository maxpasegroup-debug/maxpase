import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { createBossService } from "./boss-service";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { isPreparedStaffRole, hasStaffWorkspaceCapabilities } from "@/server/skillcity/staff-roles";

const proposal = z.object({ companyId: z.string().min(1), proposedPortalHost: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/).max(253).optional(), proposedSenderEmail: z.email().max(254).optional(), decisionReference: z.string().trim().min(8).max(200) }).strict();

export function createHrCompanyConfig(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function list(actorId: string) {
    const { ctx, root } = await boss.authority(actorId);
    const companies = await client.organization.findMany({ where: { parentId: root.id, type: "COMPANY", id: { in: ctx.organizationIds("person.read") } }, select: { id: true, name: true, slug: true, status: true, hrOnboardingConfig: true, children: { where: { type: { in: ["DIVISION", "BUSINESS_UNIT"] } }, select: { id: true } } }, orderBy: { name: "asc" }, take: 100 });
    return Promise.all(companies.map(async company => {
      const roles = await client.role.findMany({ where: { organizationId: { in: [company.id, ...company.children.map(child => child.id)] }, status: "ACTIVE", principalType: "HUMAN" }, select: { key: true, organization: { select: { slug: true } }, permissions: { select: { permission: { select: { key: true } } } } }, take: 100 });
      const roleCount = roles.length;
      const skillCityAvailable = company.slug === "aira-skill-city";
      const prepared = roles.some(role => role.organization && isPreparedStaffRole(role.key, role.organization.slug) && hasStaffWorkspaceCapabilities(role.key, role.permissions.map(p => p.permission.key)));
      return { id: company.id, name: company.name, status: company.status, proposal: company.hrOnboardingConfig, roleCount, portal: skillCityAvailable ? "airaskillcity.com (company staff); airalabs.online (Labs staff)" : null, deliveryConfigured: skillCityAvailable && staffInvite.deliveryReady(), invitationInfrastructureReady: skillCityAvailable && prepared && staffInvite.deliveryReady() };
    }));
  }
  async function saveProposal(actorId: string, raw: unknown) {
    const input = proposal.parse(raw);
    return client.$transaction(async db => {
      const { ctx, root } = await boss.authority(actorId, db);
      const company = await db.organization.findFirst({ where: { id: input.companyId, parentId: root.id, type: "COMPANY" }, select: { id: true } });
      if (!company) throw new AccessError("Company unavailable");
      await ctx.requireAccess("company.manage", { organizationId: company.id });
      const row = await db.hrCompanyOnboardingConfig.upsert({ where: { companyId: company.id }, create: { companyId: company.id, proposedPortalHost: input.proposedPortalHost, proposedSenderEmail: input.proposedSenderEmail, decisionReference: input.decisionReference, updatedByUserId: actorId }, update: { proposedPortalHost: input.proposedPortalHost ?? null, proposedSenderEmail: input.proposedSenderEmail ?? null, decisionReference: input.decisionReference, updatedByUserId: actorId } });
      await operationalEvent(db, { actorUserId: actorId, actorPersonId: ctx.user!.personId, organizationId: company.id, action: "hr.company_onboarding_proposed", entityType: "HrCompanyOnboardingConfig", entityId: row.companyId, result: "SUCCESS", metadata: { decisionReference: input.decisionReference } });
      return row.companyId;
    });
  }
  return { list, saveProposal };
}
export const hrCompanyConfig = createHrCompanyConfig();
