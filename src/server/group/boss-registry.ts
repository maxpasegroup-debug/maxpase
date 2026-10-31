import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { createBossService } from "./boss-service";
import { marketingDivisionSlug } from "./brand-marketing-scope";

export function createBossRegistry(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function company(userId: string, organizationId: string) {
    const { ctx, root } = await boss.authority(userId);
    const row = await client.companyProfile.findUnique({ where: { organizationId }, include: { organization: { select: { parentId: true, slug: true, status: true } } } });
    if (!row || row.organization.parentId !== root.id) throw new AccessError("Company unavailable");
    await ctx.requireAccess("company.read", { organizationId });
    await ctx.requireAccess("organization.read", { organizationId });
    const brands = (await ctx.decide("brand.read", { organizationId })).allowed ? await client.brand.findMany({ where: { organizationId, parentBrandId: null, status: { not: "ARCHIVED" } }, select: { id: true, name: true, status: true, website: true, _count: { select: { childBrands: true } } }, orderBy: { name: "asc" }, take: 100 }) : null;
    const units = await client.organization.findMany({ where: { parentId: organizationId, type: { in: ["DIVISION", "BUSINESS_UNIT"] }, id: { in: ctx.organizationIds("organization.read") } }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" }, take: 100 });
    return { row, brands, units, canManageCompany: (await ctx.decide("company.manage", { organizationId })).allowed, canManageBrands: (await ctx.decide("brand.manage", { organizationId })).allowed };
  }
  async function brand(userId: string, brandId: string) {
    const { ctx, root } = await boss.authority(userId);
    const row = await client.brand.findUnique({ where: { id: brandId }, include: { organization: { select: { parentId: true, type: true, slug: true, status: true, company: { select: { displayName: true, status: true } } } } } });
    if (!row || row.organization.type !== "COMPANY") throw new AccessError("Brand unavailable");
    if (row.organization.parentId !== root.id) throw new AccessError("Brand unavailable");
    await ctx.requireAccess("brand.read", { organizationId: row.organizationId });
    await ctx.requireAccess("company.read", { organizationId: row.organizationId });
    const parent = row.parentBrandId ? await client.brand.findFirst({ where: { id: row.parentBrandId, organizationId: row.organizationId }, select: { id: true, name: true, slug: true, status: true } }) : null;
    if (row.parentBrandId && !parent) throw new AccessError("Brand parent unavailable");
    const children = await client.brand.findMany({ where: { organizationId: row.organizationId, parentBrandId: row.id }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" }, take: 100 });
    const products = (await ctx.decide("product.read", { organizationId: row.organizationId })).allowed ? await client.product.findMany({ where: { brandId: row.id, organizationId: row.organizationId }, select: { id: true, name: true, status: true, lifecycle: true, updatedAt: true }, orderBy: { name: "asc" }, take: 101 }) : null;
    const mappedUnit = row.organization.slug === "aira-skill-city" ? ({ "startup-school": "aira-startup-school", "aira-skill-studio": "aira-skill-studio", "aira-labs": "aira-labs", "aira-career-hub": "aira-career-hub", "nice-jobs": "aira-career-hub" } as Record<string, string>)[row.slug] : undefined;
    const verifiedUnit = mappedUnit && mappedUnit !== row.organization.slug ? await client.organization.findFirst({ where: { slug: mappedUnit, parentId: row.organizationId, type: "DIVISION" }, select: { id: true, status: true } }) : null;
    const scope = { organizationId: row.organizationId };
    const workReadable = (await ctx.decide("project.read", scope)).allowed;
    const projects = workReadable ? await client.project.findMany({ where: { brandId: row.id, organizationId: row.organizationId }, select: { id: true, name: true, status: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 51 }) : null;
    const startupDivision = row.organization.slug === "aira-skill-city" && row.slug === "startup-school" && verifiedUnit?.id
      ? verifiedUnit.id : null;
    const studioDivision = row.organization.slug === "aira-skill-city" && row.slug === "aira-skill-studio" && verifiedUnit?.id ? verifiedUnit.id : null;
    const programDivision = startupDivision ?? studioDivision;
    const canReadPrograms = !!programDivision && (await ctx.decide("program.read", { organizationId: programDivision })).allowed;
    const canReadAdmissions = !!startupDivision && canReadPrograms && (await ctx.decide("person.read", { organizationId: startupDivision })).allowed && (await ctx.decide("executive.read", { organizationId: startupDivision })).allowed;
    const canManagePrograms = canReadPrograms && (await ctx.decide("program.manage", { organizationId: programDivision! })).allowed;
    const programs = canReadPrograms ? await client.program.findMany({ where: { companyOrganizationId: row.organizationId, organizationId: programDivision!, OR: [{ brandId: row.id }, { brandId: null }] }, select: { id: true, name: true, status: true, kind: true, durationDays: true, capacity: true, updatedAt: true }, orderBy: { name: "asc" }, take: 51 }) : null;
    const marketingUnit = row.organization.slug === "aira-skill-city" ? marketingDivisionSlug(row.slug, parent?.slug) : undefined;
    const marketingDivision = marketingUnit ? await client.organization.findFirst({ where: { slug: marketingUnit, parentId: row.organizationId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } }) : null;
    const marketingScope = marketingUnit ? marketingDivision?.id : row.organizationId;
    const canReadMarketing = !!marketingScope && row.status === "ACTIVE" && (!parent || parent.status === "ACTIVE") && row.organization.status === "ACTIVE" && row.organization.company?.status === "ACTIVE" && (await ctx.decide("executive.read", { organizationId: marketingScope })).allowed;
    const now = new Date();
    const canReadTasks = (await ctx.decide("task.read", scope)).allowed;
    const overdueTasks = canReadTasks ? await client.task.findMany({ where: { organizationId: row.organizationId, project: { brandId: row.id, organizationId: row.organizationId }, dueDate: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, title: true, status: true, dueDate: true, updatedAt: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 21 }) : null;
    const counts = async (where: Prisma.ExecutiveRecordWhereInput) => client.executiveRecord.groupBy({ by: ["status"], where, _count: { _all: true }, _max: { updatedAt: true } });
    const admissions = canReadAdmissions ? await counts({ organizationId: startupDivision!, kind: "STARTUP_APPLICATION", sourceKey: { startsWith: "startup:application:" }, status: { in: ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED"] } }) : null;
    const campaigns = canReadMarketing ? await counts({ organizationId: marketingScope, kind: "BRAND_MARKETING_CAMPAIGN", sourceKey: { startsWith: `marketing:campaign:${row.id}:` } }) : null;
    const canReadCommercial = !!startupDivision && canReadPrograms && verifiedUnit?.status === "ACTIVE" && row.status === "ACTIVE" && row.organization.status === "ACTIVE" && row.organization.company?.status === "ACTIVE" && (await ctx.decide("executive.read", { organizationId: startupDivision })).allowed;
    const commercial = canReadCommercial ? await counts({ organizationId: startupDivision!, kind: "STARTUP_COMMERCIAL_TERMS", sourceKey: { startsWith: `startup:commercial:${row.id}:` } }) : null;
    return { row, parent, children, products, startupDivision, studioDivision, startupDivisionActive: verifiedUnit?.status === "ACTIVE", programs, canManagePrograms, canReadAdmissions, canReadMarketing, canReadCommercial, report: { admissions, campaigns, commercial, overdueTasks, calculatedAt: now }, commandHref: mappedUnit && (verifiedUnit || mappedUnit === row.organization.slug) ? `/app/boss/command/${row.organization.slug}/${mappedUnit}` : null, permissions: {
      manage: (await ctx.decide("brand.manage", scope)).allowed,
      work: workReadable,
      people: (await ctx.decide("person.read", scope)).allowed,
      approvals: (await ctx.decide("approval.read", scope)).allowed,
      products: (await ctx.decide("product.read", scope)).allowed
    }, projects };
  }
  async function remove(userId: string, kind: "company" | "brand", id: string, mode: "archive" | "delete") {
    return client.$transaction(async (db: Prisma.TransactionClient) => {
      const { ctx, root } = await boss.authority(userId, db);
      if (kind === "company") {
        const row = await db.companyProfile.findUnique({ where: { id }, include: { organization: true } });
        if (!row || row.organization.parentId !== root.id) throw new AccessError("Company unavailable");
        await ctx.requireAccess("company.manage", { organizationId: row.organizationId });
        await ctx.requireAccess("organization.manage", { organizationId: row.organizationId });
        const [children, brands, products, memberships] = await Promise.all([
          db.organization.count({ where: { parentId: row.organizationId } }), db.brand.count({ where: { organizationId: row.organizationId } }), db.product.count({ where: { organizationId: row.organizationId } }), db.membership.count({ where: { organizationId: row.organizationId } })
        ]);
        if (mode === "delete") throw new AccessError("Legal company records cannot be permanently deleted. Archive after closing active work.");
        if (children || brands || products || memberships) throw new AccessError("Company has linked records; registry archive requires a separate controlled review");
        if (row.status === "ARCHIVED") throw new AccessError("Company already archived");
        await db.companyProfile.update({ where: { id }, data: { status: "ARCHIVED" } });
        await db.organization.update({ where: { id: row.organizationId }, data: { status: "ARCHIVED" } });
        await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: root.id, action: "companies.archived", entityType: "companies", entityId: id, result: "SUCCESS" }) });
      } else {
        const row = await db.brand.findUnique({ where: { id }, include: { organization: true } });
        if (!row || row.organization.parentId !== root.id || row.organization.type !== "COMPANY") throw new AccessError("Brand unavailable");
        await ctx.requireAccess("brand.manage", { organizationId: row.organizationId });
        const [products, projects, programs, children] = await Promise.all([db.product.count({ where: { brandId: id } }), db.project.count({ where: { brandId: id } }), db.program.count({ where: { brandId: id } }), db.brand.count({ where: { parentBrandId: id } })]);
        if (mode === "delete") {
          if (products || projects || programs || children) throw new AccessError("Brand has linked work or child brands. Review dependents first.");
          await db.brand.delete({ where: { id } });
        } else {
          if (products || projects || programs || children) throw new AccessError("Close or archive linked products, projects, programmes and child brands first");
          if (row.status === "ARCHIVED") throw new AccessError("Brand already archived");
          await db.brand.update({ where: { id }, data: { status: "ARCHIVED" } });
        }
        await db.auditEvent.create({ data: buildAuditEventData({ actorUserId: userId, actorPersonId: ctx.user!.personId, organizationId: row.organizationId, action: `brands.${mode === "delete" ? "deleted" : "archived"}`, entityType: "brands", entityId: id, result: "SUCCESS" }) });
      }
    });
  }
  return { company, brand, remove };
}
export const bossRegistry = createBossRegistry();
