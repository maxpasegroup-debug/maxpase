import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { applicationService } from "./applications";
import { admissionAmount } from "./marginal-milestone";
import { incentivePolicy } from "./finance-input";
import { opportunityProfile } from "./opportunity-configuration";

type PublicOpportunities = typeof applicationService;
export type InitialEarningPlan = {
  available: boolean;
  opportunityVersionId: string | null;
  programmeName: string | null;
  programmeCapacity: number | null;
  policy: null | { name: string; currency: string; perAdmissionMinor: string | null; ruleType: string; number: number };
  qualifyingAdmissions: number | null;
};

export function requiredQualifyingAdmissions(targetRupees: number, policy: { currency: string; rule: { type: string; [key: string]: unknown }; rounding: "FLOOR" | "CEILING" | "HALF_UP" }): number | null {
  if (!Number.isSafeInteger(targetRupees) || targetRupees < 1 || policy.currency !== "INR" || !["ADMISSION_BONUS", "MARGINAL_MILESTONE"].includes(policy.rule.type)) return null;
  const targetMinor = BigInt(targetRupees) * 100n;
  let totalMinor = 0n;
  for (let count = 1; count <= 1_000_000; count++) {
    const amountMinor = admissionAmount(policy.rule as Parameters<typeof admissionAmount>[0], count, policy.rounding);
    totalMinor += BigInt(amountMinor);
    if (totalMinor >= targetMinor) return count;
  }
  return null;
}

export function createInitialEarningPlan(client: PrismaClient = prisma, applications: PublicOpportunities = applicationService, now: () => Date = () => new Date()) {
  async function read(userId: string, targetRupees: number): Promise<InitialEarningPlan> {
    await client.$transaction(async db => {
      await requirePortalAccess(db, userId, "jobs");
      const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, person: { select: { status: true } } } });
      if (user?.status !== "ACTIVE" || user.person?.status !== "ACTIVE") throw new AccessError("Account unavailable");
    });

    const available = await applications.publicOpportunities({ kind: "jobs", code: "PBA", limit: 50 });
    const campaign = available.records.find(record => record.code === "PBA" && record.areas.some(area => area.division.name.toLowerCase().includes("startup")));
    if (!campaign) return { available: false, opportunityVersionId: null, programmeName: null, programmeCapacity: null, policy: null, qualifyingAdmissions: null };

    const company = await client.organization.findUnique({ where: { slug: "aira-skill-city" }, select: { id: true, status: true, company: { select: { status: true } } } });
    if (!company || company.status !== "ACTIVE" || company.company?.status !== "ACTIVE") return { available: false, opportunityVersionId: null, programmeName: null, programmeCapacity: null, policy: null, qualifyingAdmissions: null };
    const version = await client.niceJobsVersion.findFirst({
      where: { id: campaign.id, status: "PUBLISHED", publishedAt: { not: null }, engagement: "INDEPENDENT_PARTNER", template: { code: "PBA", companyId: company.id, product: { slug: "nice-jobs" } }, publishedFor: { is: { companyId: company.id, status: "PUBLISHED", visibility: "PUBLIC" } }, areas: { some: { division: { slug: "aira-startup-school", parentId: company.id, status: "ACTIVE" } } } },
      select: { id: true, configuration: true, areas: { select: { divisionId: true, division: { select: { slug: true } } } } }
    });
    const profile = opportunityProfile(version?.configuration ?? null);
    const startupArea = version?.areas.find(area => area.division.slug === "aira-startup-school");
    const program = version && profile?.programme && profile.brandId ? await client.program.findFirst({
      where: { id: profile.programme.id, slug: "pba", companyOrganizationId: company.id, status: "ACTIVE", division: { slug: "aira-startup-school", status: "ACTIVE", parentId: company.id }, brand: { id: profile.brandId, slug: "startup-school", status: "ACTIVE", organizationId: company.id } },
      select: { name: true, capacity: true }
    }) : null;
    if (!version || !profile || !startupArea || !program) return { available: false, opportunityVersionId: null, programmeName: null, programmeCapacity: null, policy: null, qualifyingAdmissions: null };

    const policyVersions = await client.niceJobsIncentiveVersion.findMany({
      where: { status: "PUBLISHED", publishedAt: { not: null }, reviewedAt: { not: null }, effectiveAt: { lte: now() }, OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }], policy: { companyId: company.id, divisionId: startupArea.divisionId, jobVersionId: version.id } },
      select: { id: true, number: true, currency: true, definition: true, effectiveAt: true, expiresAt: true, publishedAt: true, reviewedAt: true, policy: { select: { name: true, companyId: true, divisionId: true, jobVersionId: true } } },
      orderBy: [{ effectiveAt: "desc" }, { number: "desc" }], take: 20
    });
    let approved: { name: string; currency: string; perAdmissionMinor: string | null; ruleType: string; number: number; parsed: ReturnType<typeof incentivePolicy.parse> } | null = null;
    for (const row of policyVersions) {
      try {
        const parsed = incentivePolicy.parse(JSON.parse(row.definition));
        if (row.policy.companyId !== company.id || row.policy.divisionId !== startupArea.divisionId || row.policy.jobVersionId !== version.id || parsed.divisionId !== startupArea.divisionId || parsed.jobVersionId !== version.id || parsed.currency !== row.currency) continue;
        const perAdmissionMinor = ["ADMISSION_BONUS", "MARGINAL_MILESTONE"].includes(parsed.rule.type)
          ? admissionAmount(parsed.rule as Parameters<typeof admissionAmount>[0], 1, parsed.rounding)
          : null;
        approved = { name: row.policy.name, currency: row.currency, perAdmissionMinor, ruleType: parsed.rule.type, number: row.number, parsed };
        break;
      } catch { /* Invalid or mismatched policy data is never shown to participants. */ }
    }
    return {
      available: true,
      opportunityVersionId: version.id,
      programmeName: program.name,
      programmeCapacity: program.capacity,
      policy: approved ? { name: approved.name, currency: approved.currency, perAdmissionMinor: approved.perAdmissionMinor, ruleType: approved.ruleType, number: approved.number } : null,
      qualifyingAdmissions: approved ? requiredQualifyingAdmissions(targetRupees, approved.parsed) : null
    };
  }
  return { read };
}

export const initialEarningPlan = createInitialEarningPlan();
