import type { Prisma } from "@prisma/client";

export const airaProductDrafts = [
  { slug: "bgos", name: "BGOS", divisionSlug: "aira-labs", brandSlug: "bgos" },
  { slug: "pba", name: "PBA", divisionSlug: "aira-startup-school", brandSlug: "startup-school" },
  { slug: "genz-builder", name: "GenZ Builder", divisionSlug: "aira-skill-studio", brandSlug: null }
] as const;

export const seniorAcademicAdvisorDraft = {
  title: "Senior Academic Advisor",
  companySlug: "aira-skill-city",
  engagement: "IN_HOUSE_EMPLOYEE",
  salaryCurrency: "INR",
  monthlySalaryMinor: 1800000,
  status: "DRAFT",
  managerPersonId: null,
  agreementApproval: null,
  payrollConfiguration: null,
  scope: ["BGOS", "PBA", "GenZ Builder"]
} as const;

export function isControlledAiraProduct(companySlug: string, slug: string) {
  return companySlug === "aira-skill-city" && airaProductDrafts.some(draft => draft.slug === slug);
}

export function assertControlledProductDraft(companySlug: string, slug: string, status: string, lifecycle: string) {
  if (isControlledAiraProduct(companySlug, slug) && (status !== "INACTIVE" || lifecycle !== "CONCEPT")) {
    throw new Error("Product requires reviewed terms and independent publication approval");
  }
}

export async function registerAiraProductDrafts(db: Prisma.TransactionClient, companyId: string) {
  for (const definition of airaProductDrafts) {
    const division = await db.organization.findUnique({ where: { slug: definition.divisionSlug } });
    if (!division || division.type !== "DIVISION" || division.parentId !== companyId) throw new Error("Product division conflicts with AIRA structure");
    const brand = definition.brandSlug ? await db.brand.findUnique({ where: { organizationId_slug: { organizationId: companyId, slug: definition.brandSlug } } }) : null;
    if (definition.brandSlug && !brand) throw new Error("Product brand is not registered");
    const existing = await db.product.findUnique({ where: { organizationId_slug: { organizationId: companyId, slug: definition.slug } } });
    if (existing) {
      if (existing.name !== definition.name || existing.divisionId !== division.id || existing.brandId !== (brand?.id ?? null) || existing.status !== "INACTIVE" || existing.lifecycle !== "CONCEPT") throw new Error("Product draft conflicts with existing record; review required");
      continue;
    }
    const product = await db.product.create({ data: {
      organizationId: companyId, divisionId: division.id, brandId: brand?.id ?? null,
      name: definition.name, slug: definition.slug, type: "PRODUCT", status: "INACTIVE", lifecycle: "CONCEPT",
      metadata: JSON.stringify({ setupStatus: "REVIEWED_DRAFT", commercialTerms: null, productOwnerPersonId: null, approvalAuthorityPersonId: null, publicationApproved: false })
    } });
    await db.auditEvent.create({ data: { organizationId: companyId, action: "product.reviewed_draft_registered", entityType: "Product", entityId: product.id, result: "SUCCESS", metadata: JSON.stringify({ divisionId: division.id, publicationApproved: false }) } });
  }
}
