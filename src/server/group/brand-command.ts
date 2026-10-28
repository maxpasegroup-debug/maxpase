import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { bossStructure } from "./boss-structure";
import { createBossService } from "./boss-service";

export function commandUnit(companySlug: string, unitSlug: string) {
  const company = bossStructure.find(item => item.slug === companySlug);
  if (!company) return null;
  if (companySlug === "aira-skill-city" && unitSlug === companySlug) return { company, label: "AIRA Skill City", brandSlug: unitSlug };
  const division = company.divisions.find(item => item.slug === unitSlug);
  if (division) return { company, label: division.label, divisionSlug: division.slug, productSlug: division.productSlug, productName: division.product };
  const brand = company.brands.find(item => item.slug === unitSlug);
  if (brand) return { company, label: brand.name, brandSlug: unitSlug };
  const subBrand = "subBrands" in company ? company.subBrands.find(item => item.slug === unitSlug) : undefined;
  if (subBrand) return { company, label: subBrand.name, brandSlug: unitSlug };
  const product = "products" in company ? company.products.find(name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === unitSlug) : undefined;
  return product ? { company, label: product, productSlug: unitSlug, productName: product } : null;
}

export function createBrandCommandService(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function read(userId: string, companySlug: string, unitSlug: string) {
    const unit = commandUnit(companySlug, unitSlug);
    if (!unit) throw new AccessError("Command centre unavailable");
    const { ctx, root } = await boss.authority(userId);
    const company = await client.organization.findUnique({ where: { slug: companySlug }, select: { id: true, parentId: true, type: true, status: true, company: { select: { legalName: true, status: true } } } });
    if (!company || company.parentId !== root.id || company.type !== "COMPANY") throw new AccessError("Company unavailable");
    for (const permission of ["organization.read", "company.read", "executive.read"]) await ctx.requireAccess(permission, { organizationId: company.id });
    const brandSlug = "brandSlug" in unit ? unit.brandSlug : unit.divisionSlug === "aira-startup-school" ? "startup-school" : unit.divisionSlug === "aira-career-hub" ? "nice-jobs" : unit.divisionSlug;
    const brand = brandSlug && (await ctx.decide("brand.read", { organizationId: company.id })).allowed
      ? await client.brand.findUnique({ where: { organizationId_slug: { organizationId: company.id, slug: brandSlug } }, select: { id: true, name: true, status: true, website: true } }) : null;
    const division = "divisionSlug" in unit ? await client.organization.findUnique({ where: { slug: unit.divisionSlug }, select: { id: true, parentId: true, type: true, status: true } }) : null;
    if (division && (division.parentId !== company.id || division.type !== "DIVISION")) throw new AccessError("Division scope unavailable");
    const product = "productSlug" in unit && unit.productSlug && (await ctx.decide("product.read", { organizationId: company.id })).allowed
      ? await client.product.findUnique({ where: { organizationId_slug: { organizationId: company.id, slug: unit.productSlug } }, select: { id: true, name: true, divisionId: true, status: true, lifecycle: true } }) : null;
    if (product && division && product.divisionId !== division.id) throw new AccessError("Product scope unavailable");
    const scopeId = division?.id ?? company.id;
    return { label: unit.label, companyId: company.id, companyName: company.company?.legalName ?? unit.company.legalName, companyStatus: company.company?.status ?? company.status, scopeId, division: division ? { status: division.status } : null, brand, product,
      canManagePeople: (await ctx.decide("person.create", { organizationId: scopeId })).allowed && (await ctx.decide("membership.manage", { organizationId: scopeId })).allowed,
      canReadPeople: (await ctx.decide("person.read", { organizationId: scopeId })).allowed,
      canReadWork: (await ctx.decide("project.read", { organizationId: scopeId })).allowed,
      canReadDecisions: (await ctx.decide("approval.read", { organizationId: scopeId })).allowed };
  }
  return { read };
}

export const brandCommandService = createBrandCommandService();
