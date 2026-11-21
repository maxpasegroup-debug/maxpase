import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { createBossService } from "./boss-service";
import { operationalEvent } from "@/server/domain/operational-events";

type DB = Prisma.TransactionClient;

/** Default job templates are intentionally operational shells. They carry no
 * approval, company-management, or cross-brand capabilities. */
export const brandWorkspaceRoles = [
  { key: "brand-director", name: "Director", category: "Brand workspace" },
  { key: "brand-administrative-officer", name: "Administrative Officer", category: "Brand workspace" },
  { key: "brand-specialist", name: "Brand Specialist", category: "Brand workspace" },
  { key: "brand-employee", name: "Employee", category: "Brand workspace" }
] as const;

export const repositoryBrandSlugs = [
  "startup-school", "aira-skill-studio", "aira-labs", "aira-career-hub", "aira-media-company",
  "my-solar-solutions", "nte-naadu", "happinotes", "talkin-labs", "onspeak-mentor-hub", "bgos", "nice-jobs",
  "teachx-guru", "learnx-guru", "top-rank-ai"
] as const;

const specialistNames: Record<string, string> = {
  "startup-school": "Admissions & Programs Specialist", "aira-skill-studio": "Learning Programs Specialist",
  "aira-labs": "Technical & Automation Specialist", "aira-career-hub": "Career Operations Specialist",
  "aira-media-company": "Content Production Specialist", "my-solar-solutions": "Solar Operations Specialist",
  "nte-naadu": "Learning Operations Specialist", happinotes: "Content & Learning Specialist",
  "talkin-labs": "Conversation Product Specialist", "onspeak-mentor-hub": "Mentor Operations Specialist",
  bgos: "Business Operations Specialist", "nice-jobs": "Workforce Operations Specialist",
  "teachx-guru": "Teaching Platform Specialist", "learnx-guru": "Learning Platform Specialist",
  "top-rank-ai": "Platform Operations Specialist"
};

export function brandWorkspaceRolesForBrand(brandSlug: string) {
  return brandWorkspaceRoles.map(role => role.key === "brand-specialist" ? { ...role, name: specialistNames[brandSlug] ?? "Brand Specialist" } : role);
}

export function brandWorkspaceSlug(brandSlug: string) { return `brand-workspace-${brandSlug}`; }
export function brandWorkspacePath(brandSlug: string) { return `/app/brand/${encodeURIComponent(brandSlug)}`; }

/** Idempotently creates the dedicated brand organization and default role
 * records inside the caller's transaction. Existing roles are never widened. */
export async function ensureBrandWorkspace(db: DB, companyId: string, brandId: string, brandSlug: string, actorUserId?: string, actorPersonId?: string | null) {
  const company = await db.organization.findUnique({ where: { id: companyId }, select: { id: true, type: true, parentId: true, status: true, company: { select: { groupId: true, status: true } } } });
  const root = await db.organization.findUnique({ where: { slug: "maxpase-group" }, select: { id: true, type: true, parentId: true, status: true, group: { select: { id: true, status: true } } } });
  const brand = await db.brand.findFirst({ where: { id: brandId, slug: brandSlug, organizationId: companyId }, select: { id: true, status: true } });
  if (!root || root.type !== "GROUP" || root.parentId || root.status !== "ACTIVE" || !root.group || root.group.status !== "ACTIVE" || !company || company.type !== "COMPANY" || company.parentId !== root.id || company.status === "ARCHIVED" || !company.company || company.company.groupId !== root.group.id || company.company.status === "ARCHIVED" || !brand || brand.status === "ARCHIVED") throw new AccessError("Brand workspace requires a non-archived registered Group company and brand");

  const slug = brandWorkspaceSlug(brandSlug);
  let workspace = await db.organization.findUnique({ where: { slug }, select: { id: true, type: true, parentId: true, status: true, metadata: true } });
  let binding: { brandId?: string; brandSlug?: string; workspaceKind?: string } = {};
  try { binding = JSON.parse(workspace?.metadata ?? "{}"); } catch { throw new AccessError("Brand workspace metadata requires review"); }
  if (workspace && (workspace.type !== "BUSINESS_UNIT" || workspace.parentId !== companyId || binding.brandId !== brandId || binding.brandSlug !== brandSlug || binding.workspaceKind !== "BRAND_DEFAULT")) throw new AccessError("Brand workspace identity conflicts with an existing organization");
  if (!workspace) workspace = await db.organization.create({ data: { slug, name: `${brandSlug.replaceAll("-", " ")} workspace`, type: "BUSINESS_UNIT", parentId: companyId, status: brand.status === "ACTIVE" ? "ACTIVE" : "INACTIVE", metadata: JSON.stringify({ brandId, brandSlug, workspaceKind: "BRAND_DEFAULT" }) }, select: { id: true, type: true, parentId: true, status: true, metadata: true } });
  if (brand.status === "ACTIVE" && workspace.status === "INACTIVE") workspace = await db.organization.update({ where: { id: workspace.id }, data: { status: "ACTIVE" }, select: { id: true, type: true, parentId: true, status: true, metadata: true } });

  const roleTemplates = brandWorkspaceRolesForBrand(brandSlug);
  for (const definition of roleTemplates) {
    const role = await db.role.findUnique({ where: { organizationId_key: { organizationId: workspace.id, key: definition.key } }, select: { id: true, name: true, principalType: true, status: true, permissions: { select: { id: true } } } });
    const acceptedLegacyName = definition.key === "brand-specialist" && role?.name === "Brand Specialist";
    if (role && (role.name !== definition.name && !acceptedLegacyName || role.principalType !== "HUMAN" || role.status !== "ACTIVE" || role.permissions.length > 0)) throw new AccessError(`Brand role template ${definition.key} conflicts with an existing role and requires review`);
    if (!role) await db.role.create({ data: { organizationId: workspace.id, key: definition.key, name: definition.name, principalType: "HUMAN", category: definition.category, status: "ACTIVE" } });
  }
  if (actorUserId) await operationalEvent(db, { actorUserId, actorPersonId: actorPersonId ?? null, organizationId: workspace.id, action: "brand.workspace_defaults_prepared", entityType: "Brand", entityId: brand.id, result: "SUCCESS", metadata: { brandId: brand.id, brandSlug, workspaceOrganizationId: workspace.id, roles: roleTemplates.map(role => role.key) } });
  return { organizationId: workspace.id, route: brandWorkspacePath(brandSlug), roles: roleTemplates };
}

/** Boss-only explicit reconciliation entry point for Phase 4 onboarding and
 * controlled preparation of pre-existing brands. */
export function createBrandWorkspaceService(client: PrismaClient = prisma) {
  async function prepare(actorUserId: string, brandId: string) {
    return client.$transaction(async db => {
      const { ctx } = await createBossService(client).authority(actorUserId, db);
      const brand = await db.brand.findUnique({ where: { id: brandId }, select: { id: true, slug: true, organizationId: true } });
      if (!brand) throw new AccessError("Brand unavailable");
      return ensureBrandWorkspace(db, brand.organizationId, brand.id, brand.slug, actorUserId, ctx.user?.personId);
    });
  }
  return { prepare };
}
export const brandWorkspaceService = createBrandWorkspaceService();
