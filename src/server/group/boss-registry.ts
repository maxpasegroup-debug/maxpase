import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { buildAuditEventData } from "@/server/audit/audit-service";
import { createBossService } from "./boss-service";

export function createBossRegistry(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function company(userId: string, organizationId: string) {
    const { ctx, root } = await boss.authority(userId);
    const row = await client.companyProfile.findUnique({ where: { organizationId }, include: { organization: { select: { parentId: true, slug: true, status: true } } } });
    if (!row || row.organization.parentId !== root.id) throw new AccessError("Company unavailable");
    await ctx.requireAccess("company.read", { organizationId });
    await ctx.requireAccess("organization.read", { organizationId });
    const brands = (await ctx.decide("brand.read", { organizationId })).allowed ? await client.brand.findMany({ where: { organizationId }, select: { id: true, name: true, status: true, website: true }, orderBy: { name: "asc" }, take: 100 }) : null;
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
    const products = (await ctx.decide("product.read", { organizationId: row.organizationId })).allowed ? await client.product.findMany({ where: { brandId: row.id, organizationId: row.organizationId }, select: { id: true, name: true, status: true, lifecycle: true }, orderBy: { name: "asc" }, take: 100 }) : null;
    const mappedUnit = row.organization.slug === "aira-skill-city" ? ({ "aira-skill-city": "aira-skill-city", "startup-school": "aira-startup-school", "aira-labs": "aira-labs", "nice-jobs": "aira-career-hub" } as Record<string, string>)[row.slug] : undefined;
    const verifiedUnit = mappedUnit && mappedUnit !== row.organization.slug ? await client.organization.findFirst({ where: { slug: mappedUnit, parentId: row.organizationId, type: "DIVISION" }, select: { id: true } }) : null;
    const scope = { organizationId: row.organizationId };
    const workReadable = (await ctx.decide("project.read", scope)).allowed;
    const projects = workReadable ? await client.project.findMany({ where: { brandId: row.id, organizationId: row.organizationId }, select: { id: true, name: true, status: true }, orderBy: { updatedAt: "desc" }, take: 50 }) : null;
    return { row, products, commandHref: mappedUnit && (verifiedUnit || mappedUnit === row.organization.slug) ? `/app/boss/command/${row.organization.slug}/${mappedUnit}` : null, permissions: {
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
        const [products, projects, programs] = await Promise.all([db.product.count({ where: { brandId: id } }), db.project.count({ where: { brandId: id } }), db.program.count({ where: { brandId: id } })]);
        if (mode === "delete") {
          if (products || projects || programs) throw new AccessError("Brand has linked work. Archive it after closing dependent work.");
          await db.brand.delete({ where: { id } });
        } else {
          if (products || projects || programs) throw new AccessError("Close or archive linked products, projects and programmes first");
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
