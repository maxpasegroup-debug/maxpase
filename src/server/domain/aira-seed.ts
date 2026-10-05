import type { Prisma } from "@prisma/client";
import { airaDivisions } from "./company-structure";
export async function seedAiraStructure(db: Prisma.TransactionClient, companyId: string) {
  await db.companyProfile.updateMany({ where: { organizationId: companyId, description: null }, data: { description: "Company operating environment with AIRA Startup School, AIRA Labs, AIRA Skill Studio and AIRA Career Hub inside MAXPASE GROUP." } });
  const nodes = [];
  for (const division of airaDivisions) {
    const node = await db.organization.upsert({ where: { slug: division.slug }, update: {}, create: { ...division, type: "DIVISION", parentId: companyId, metadata: JSON.stringify({ developmentSeed: true, canonicalStructure: true }) } });
    if (node.parentId !== companyId || node.type !== "DIVISION" || node.name !== division.name) throw new Error("Canonical AIRA structure conflicts with existing data");
    nodes.push(node);
  }
  const career = nodes.find(n => n.slug === "aira-career-hub")!;
  const nice = await db.product.upsert({ where: { organizationId_slug: { organizationId: companyId, slug: "nice-jobs" } }, update: {}, create: { organizationId: companyId, divisionId: career.id, name: "Nice Jobs", slug: "nice-jobs", type: "PLATFORM", lifecycle: "CONCEPT", metadata: JSON.stringify({ developmentSeed: true, operationalStatusVerified: false }) } });
  if (nice.name !== "Nice Jobs" || nice.divisionId !== career.id) throw new Error("Nice Jobs must remain under AIRA Career Hub");
  return nodes;
}
