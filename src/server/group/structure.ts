import type { Prisma } from "@prisma/client";
import { seedAiraStructure } from "@/server/domain/aira-seed";
import { groupIdentity } from "./identity";

export const groupCompanies = [
  { slug: "aira-skill-city", name: "AIRA SKILL CITY PRIVATE LIMITED", shortName: "AIRA Skill City" },
  { slug: "pearn", name: "PEARN PRIVATE LIMITED", shortName: "PEARN" },
  { slug: "top-rank-ai", name: "TOP RANK AI PRIVATE LIMITED", shortName: "Top Rank AI" }
] as const;
const brands = [
  { company: "aira-skill-city", slug: "aira-skill-city", name: "Aira Skill City", domain: "airaskillcity.com" },
  { company: "aira-skill-city", slug: "startup-school", name: "Startup School", domain: "airastartupskool.com" },
  { company: "aira-skill-city", slug: "aira-labs", name: "AIRA Labs", domain: "airalabs.online" },
  { company: "aira-skill-city", slug: "nice-jobs", name: "Nice Jobs", domain: "nicejobs.online" },
  { company: "pearn", slug: "teachx-guru", name: "TeachX Guru", domain: "teachx.guru" },
  { company: "pearn", slug: "learnx-guru", name: "LearnX Guru", domain: "learnx.guru" },
  { company: "top-rank-ai", slug: "top-rank-ai", name: "Top Rank AI", domain: null }
] as const;

// Explicit operator initialization, never called by a page or application startup.
export async function initializeGroupStructure(db: Prisma.TransactionClient) {
  const group = await db.organization.upsert({ where: { slug: groupIdentity.slug }, update: { name: groupIdentity.name }, create: { slug: groupIdentity.slug, name: groupIdentity.name, type: "GROUP", group: { create: { name: groupIdentity.name } } }, include: { group: true } });
  if (group.type !== "GROUP" || group.parentId || !group.group) throw new Error("Existing group structure conflicts with initialization");
  await db.groupProfile.update({ where: { id: group.group.id }, data: { name: groupIdentity.name } });
  const companies = [];
  for (const definition of groupCompanies) {
    const company = await db.organization.upsert({ where: { slug: definition.slug }, update: { name: definition.name }, create: { slug: definition.slug, name: definition.name, type: "COMPANY", parentId: group.id, company: { create: { groupId: group.group.id, legalName: definition.name, displayName: definition.shortName, metadata: JSON.stringify({ structureSource: "USER_CONFIRMED", legalInformationVerified: false }) } } }, include: { company: true } });
    if (company.type !== "COMPANY" || company.parentId !== group.id || !company.company || company.company.groupId !== group.group.id) throw new Error("Existing company structure conflicts with initialization");
    if (company.company.legalName && company.company.legalName !== definition.name) throw new Error("Existing company identity conflicts with initialization");
    await db.companyProfile.update({ where: { id: company.company.id }, data: { legalName: definition.name } });
    companies.push(company);
  }
  const aira = companies.find(c => c.slug === "aira-skill-city")!;
  await seedAiraStructure(db, aira.id);
  for (const definition of brands) {
    const company = companies.find(c => c.slug === definition.company)!;
    const existing = await db.brand.findUnique({ where: { organizationId_slug: { organizationId: company.id, slug: definition.slug } } });
    if (existing && existing.name !== definition.name) throw new Error("Existing brand identity conflicts with initialization");
    const brand = await db.brand.upsert({ where: { organizationId_slug: { organizationId: company.id, slug: definition.slug } }, update: {}, create: { organizationId: company.id, slug: definition.slug, name: definition.name, website: definition.domain ? "https://" + definition.domain : undefined, metadata: JSON.stringify({ structureSource: "USER_CONFIRMED", domainStatus: "NOT VERIFIED" }) } });
    if (definition.domain && brand.website !== "https://" + definition.domain) await db.brand.update({ where: { id: brand.id }, data: { website: "https://" + definition.domain } });
    if (definition.slug === "nice-jobs") await db.product.updateMany({ where: { organizationId: company.id, slug: "nice-jobs", brandId: null }, data: { brandId: brand.id } });
    if (["teachx-guru", "learnx-guru", "top-rank-ai"].includes(definition.slug)) {
      const product = await db.product.upsert({ where: { organizationId_slug: { organizationId: company.id, slug: definition.slug } }, update: {}, create: { organizationId: company.id, brandId: brand.id, name: definition.name, slug: definition.slug, type: "PLATFORM", lifecycle: "CONCEPT" } });
      if (product.name !== definition.name || product.brandId !== brand.id) throw new Error("Existing product identity conflicts with initialization");
    }
  }
  await db.auditEvent.create({ data: { organizationId: group.id, action: "group.structure_initialized", entityType: "Organization", entityId: group.id, result: "SUCCESS", metadata: JSON.stringify({ origin: "EXPLICIT_OPERATOR_INITIALIZATION", ownershipCreated: false }) } });
  await db.siaIdentity.updateMany({ where: { id: "sia-default" }, data: { title: `${groupIdentity.name} Virtual CEO` } });
  return { groupId: group.id, companies: companies.map(c => ({ id: c.id, name: c.name })) };
}
