import type { Prisma } from "@prisma/client";
import { seedAiraStructure } from "@/server/domain/aira-seed";
import { groupIdentity } from "./identity";
import { registerAiraProductDrafts } from "./product-drafts";

export const groupCompanies = [
  { slug: "aira-skill-city", name: "AIRA SKILL CITY PRIVATE LIMITED", shortName: "AIRA Skill City" },
  { slug: "pearn", name: "TEARN PRIVATE LIMITED", shortName: "TEARN" },
  { slug: "top-rank-ai", name: "TOP RANK AI PRIVATE LIMITED", shortName: "Top Rank AI" }
] as const;
const brands = [
  { company: "aira-skill-city", slug: "startup-school", name: "AIRA STARTUP SKOOL", parentSlug: null, domain: "airastartupskool.com" },
  { company: "aira-skill-city", slug: "aira-skill-studio", name: "AIRA SKILL STUDIO", parentSlug: null, domain: null },
  { company: "aira-skill-city", slug: "aira-labs", name: "AIRA LABS", parentSlug: null, domain: "airalabs.online" },
  { company: "aira-skill-city", slug: "aira-career-hub", name: "AIRA CAREER HUB", parentSlug: null, domain: null },
  { company: "aira-skill-city", slug: "my-solar-solutions", name: "MY SOLAR SOLUTIONS", parentSlug: "aira-labs", domain: null },
  { company: "aira-skill-city", slug: "nte-naadu", name: "NTE NAADU", parentSlug: "aira-labs", domain: null },
  { company: "aira-skill-city", slug: "happinotes", name: "HAPPINOTES", parentSlug: "aira-labs", domain: null },
  { company: "aira-skill-city", slug: "talkin-labs", name: "TALKIN LABS", parentSlug: "aira-labs", domain: null },
  { company: "aira-skill-city", slug: "bgos", name: "BGOS", parentSlug: "aira-labs", domain: null },
  { company: "aira-skill-city", slug: "nice-jobs", name: "NICEJOBS", parentSlug: "aira-career-hub", domain: "nicejobs.online" },
  { company: "pearn", slug: "teachx-guru", name: "TEACHX GURU", parentSlug: null, domain: "teachx.guru" },
  { company: "pearn", slug: "learnx-guru", name: "LEARNX GURU", parentSlug: null, domain: "learnx.guru" },
  { company: "top-rank-ai", slug: "top-rank-ai", name: "TOP TANK AI", parentSlug: null, domain: null }
] as const;
const previousBrandNames: Record<string, string[]> = {
  "startup-school": ["Startup School"],
  "aira-labs": ["AIRA Labs"], "nice-jobs": ["Nice Jobs"],
  "teachx-guru": ["TeachX Guru"], "learnx-guru": ["LearnX Guru"], "top-rank-ai": ["Top Rank AI"],
  happinotes: ["HappiNotes"]
};

// Explicit operator initialization, never called by a page or application startup.
export async function initializeGroupStructure(db: Prisma.TransactionClient) {
  const group = await db.organization.upsert({ where: { slug: groupIdentity.slug }, update: { name: groupIdentity.name }, create: { slug: groupIdentity.slug, name: groupIdentity.name, type: "GROUP", group: { create: { name: groupIdentity.name } } }, include: { group: true } });
  if (group.type !== "GROUP" || group.parentId || !group.group) throw new Error("Existing group structure conflicts with initialization");
  await db.groupProfile.update({ where: { id: group.group.id }, data: { name: groupIdentity.name } });
  const companies = [];
  for (const definition of groupCompanies) {
    const legacyName = definition.slug === "pearn" ? "PEARN PRIVATE LIMITED" : null;
    const previous = await db.organization.findUnique({ where: { slug: definition.slug }, include: { company: true } });
    if (previous && ![definition.name, legacyName].includes(previous.name)) throw new Error("Existing company identity conflicts with initialization");
    if (previous?.company?.legalName && ![definition.name, legacyName].includes(previous.company.legalName)) throw new Error("Existing company identity conflicts with initialization");
    const company = await db.organization.upsert({ where: { slug: definition.slug }, update: { name: definition.name }, create: { slug: definition.slug, name: definition.name, type: "COMPANY", parentId: group.id, company: { create: { groupId: group.group.id, legalName: definition.name, displayName: definition.shortName, metadata: JSON.stringify({ structureSource: "USER_CONFIRMED", legalInformationVerified: false }) } } }, include: { company: true } });
    if (company.type !== "COMPANY" || company.parentId !== group.id || !company.company || company.company.groupId !== group.group.id) throw new Error("Existing company structure conflicts with initialization");
    await db.companyProfile.update({ where: { id: company.company.id }, data: { legalName: definition.name, ...(legacyName && previous?.company?.displayName === "PEARN" ? { displayName: definition.shortName } : {}) } });
    if (legacyName && (previous?.name === legacyName || previous?.company?.legalName === legacyName)) await db.auditEvent.create({ data: { organizationId: company.id, action: "group.company_name_corrected", entityType: "CompanyProfile", entityId: company.company.id, result: "SUCCESS", metadata: JSON.stringify({ previousName: legacyName, nextName: definition.name, source: "OWNER_CONFIRMED", stableSlug: definition.slug }) } });
    companies.push(company);
  }
  const aira = companies.find(c => c.slug === "aira-skill-city")!;
  await seedAiraStructure(db, aira.id);
  const legacyBrand = await db.brand.findUnique({ where: { organizationId_slug: { organizationId: aira.id, slug: "aira-skill-city" } }, include: { _count: { select: { childBrands: true, products: true, projects: true, programs: true } } } });
  if (legacyBrand && legacyBrand.status !== "ARCHIVED") {
    if (Object.values(legacyBrand._count).some(count => count > 0)) throw new Error("Legacy AIRA Skill City brand has linked records; review before archiving");
    await db.brand.update({ where: { id: legacyBrand.id }, data: { status: "ARCHIVED" } });
    await db.auditEvent.create({ data: { organizationId: aira.id, action: "group.legacy_brand_archived", entityType: "Brand", entityId: legacyBrand.id, result: "SUCCESS", metadata: JSON.stringify({ source: "OWNER_CONFIRMED", reason: "AIRA Skill City is the company and employee workplace, not a brand" }) } });
  }
  for (const definition of brands) {
    const company = companies.find(c => c.slug === definition.company)!;
    const parent = definition.parentSlug ? await db.brand.findUnique({ where: { organizationId_slug: { organizationId: company.id, slug: definition.parentSlug } } }) : null;
    if (definition.parentSlug && (!parent || parent.parentBrandId)) throw new Error("Parent brand is missing or nested unexpectedly");
    const existing = await db.brand.findUnique({ where: { organizationId_slug: { organizationId: company.id, slug: definition.slug } } });
    if (existing && existing.name !== definition.name && !previousBrandNames[definition.slug]?.includes(existing.name)) throw new Error("Existing brand identity conflicts with initialization");
    if (existing?.parentBrandId && existing.parentBrandId !== parent?.id) throw new Error("Existing brand parent conflicts with confirmed hierarchy");
    const brand = await db.brand.upsert({ where: { organizationId_slug: { organizationId: company.id, slug: definition.slug } }, update: { name: definition.name, parentBrandId: parent?.id ?? null }, create: { organizationId: company.id, slug: definition.slug, name: definition.name, parentBrandId: parent?.id ?? null, status: definition.parentSlug || definition.slug === "aira-career-hub" ? "INACTIVE" : "ACTIVE", website: definition.domain ? "https://" + definition.domain : undefined, metadata: JSON.stringify({ structureSource: "USER_CONFIRMED", domainStatus: "NOT VERIFIED" }) } });
    if (existing && (existing.name !== brand.name || existing.parentBrandId !== brand.parentBrandId)) await db.auditEvent.create({ data: { organizationId: company.id, action: "group.brand_hierarchy_corrected", entityType: "Brand", entityId: brand.id, result: "SUCCESS", metadata: JSON.stringify({ previousName: existing.name, nextName: brand.name, previousParentBrandId: existing.parentBrandId, nextParentBrandId: brand.parentBrandId, source: "OWNER_CONFIRMED" }) } });
    if (definition.domain && brand.website !== "https://" + definition.domain) await db.brand.update({ where: { id: brand.id }, data: { website: "https://" + definition.domain } });
    if (definition.slug === "nice-jobs" || definition.slug === "bgos") {
      const product = await db.product.findUnique({ where: { organizationId_slug: { organizationId: company.id, slug: definition.slug } } });
      const expectedPreviousBrandId = definition.slug === "bgos" ? parent!.id : null;
      if (product && product.brandId !== brand.id) {
        if (product.brandId !== expectedPreviousBrandId) throw new Error("Existing product brand conflicts with confirmed hierarchy");
        await db.product.update({ where: { id: product.id }, data: { brandId: brand.id } });
        await db.auditEvent.create({ data: { organizationId: company.id, action: "group.product_brand_corrected", entityType: "Product", entityId: product.id, result: "SUCCESS", metadata: JSON.stringify({ previousBrandId: product.brandId, nextBrandId: brand.id, source: "OWNER_CONFIRMED" }) } });
      }
    }
    if (["teachx-guru", "learnx-guru", "top-rank-ai"].includes(definition.slug)) {
      const productName = definition.slug === "top-rank-ai" ? "Top Rank AI" : definition.slug === "teachx-guru" ? "TeachX Guru" : "LearnX Guru";
      const product = await db.product.upsert({ where: { organizationId_slug: { organizationId: company.id, slug: definition.slug } }, update: {}, create: { organizationId: company.id, brandId: brand.id, name: productName, slug: definition.slug, type: "PLATFORM", lifecycle: "CONCEPT" } });
      if (product.name !== productName || product.brandId !== brand.id) throw new Error("Existing product identity conflicts with initialization");
    }
  }
  await registerAiraProductDrafts(db, aira.id);
  await db.auditEvent.create({ data: { organizationId: group.id, action: "group.structure_initialized", entityType: "Organization", entityId: group.id, result: "SUCCESS", metadata: JSON.stringify({ origin: "EXPLICIT_OPERATOR_INITIALIZATION", ownershipCreated: false }) } });
  await db.siaIdentity.updateMany({ where: { id: "sia-default" }, data: { title: `${groupIdentity.name} Virtual CEO` } });
  return { groupId: group.id, companies: companies.map(c => ({ id: c.id, name: c.name })) };
}
