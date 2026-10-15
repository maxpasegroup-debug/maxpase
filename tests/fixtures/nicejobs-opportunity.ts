import type { PrismaClient } from "@prisma/client";
import type { OpportunityConfiguration } from "@/server/nicejobs/opportunity-configuration";

export async function fixtureOpportunity(db: PrismaClient, managerUserId: string, internship = false): Promise<OpportunityConfiguration> {
  const company = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" }, include: { company: true } });
  const manager = await db.user.findUniqueOrThrow({ where: { id: managerUserId }, select: { personId: true } });
  return {
    legalEmployer: { organizationId: company.id, label: company.name, legalName: company.company!.legalName!, status: "CONFIRMED", evidence: "Isolated fixture assertion; no real legal verification" },
    brandId: null, brandLabel: null, divisionLabel: "Synthetic fixture business area", divisionStatus: "CONFIRMED", employmentType: internship ? "INTERN" : "CONTRACTOR",
    eligibility: "Synthetic fixture eligibility only", compensation: { status: "CONFIRMED", text: "Synthetic confirmed compensation for isolated tests only" }, incentives: { status: "NOT_APPLICABLE", text: null }, location: { status: "CONFIRMED", text: "Synthetic fixture location" }, workArrangement: "REMOTE", reportingManager: { personId: manager.personId, roleLabel: "Synthetic fixture manager" }
  };
}
