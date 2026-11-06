import { Prisma, type PrismaClient } from "@prisma/client";
import type { OpportunityConfiguration } from "./opportunity-configuration";
import { opportunityProfile } from "./opportunity-configuration";

export async function opportunityCapacity(db: Prisma.TransactionClient | PrismaClient, companyId: string, versionId: string, profile: OpportunityConfiguration | null) {
  const rule = profile?.capacity;
  if (!rule) return null;
  const programme = profile?.programme ? await db.program.findFirst({ where: { id: profile.programme.id, companyOrganizationId: companyId }, select: { capacity: true } }) : null;
  const programmeVersions = profile?.programme ? await db.niceJobsVersion.findMany({ where: { engagement: "INDEPENDENT_PARTNER", template: { companyId } }, select: { id: true, configuration: true }, take: 501 }) : [];
  const programmeCoverageComplete = programmeVersions.length <= 500;
  const programmeVersionIds = programmeVersions.filter(v => opportunityProfile(v.configuration)?.programme?.id === profile?.programme?.id).map(v => v.id);
  const admitted = await db.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::integer AS count FROM "NiceJobsAdmission" a
    JOIN "NiceJobsReferralLink" r ON r.id = a."referralId"
    WHERE a."companyId" = ${companyId} AND r."versionId" = ${versionId} AND a.status = 'VERIFIED'
      AND NOT EXISTS (SELECT 1 FROM "NiceJobsSourceEvent" cancelled WHERE cancelled."admissionId" = a.id AND cancelled."eventType" = 'ADMISSION_CANCELLED' AND cancelled.status = 'VERIFIED')
      AND COALESCE((SELECT SUM(CASE WHEN payment."eventType" = 'PAYMENT_REFUNDED' THEN -payment."amountMinor" ELSE payment."amountMinor" END)
        FROM "NiceJobsSourceEvent" payment WHERE payment."admissionId" = a.id AND payment.status = 'VERIFIED'
          AND payment."eventType" IN ('PAYMENT_RECEIVED','PAYMENT_REFUNDED') AND payment.currency = ${rule.currency}), 0) >= ${BigInt(rule.qualifyingPaymentMinor)}`;
  const applicants = await db.$queryRaw<{ count: number }[]>`
    SELECT COUNT(DISTINCT person_id)::integer AS count FROM (
      SELECT "candidateId" AS person_id FROM "NiceJobsApplication" WHERE "versionId" = ${versionId} AND "companyId" = ${companyId} AND status NOT IN ('CLOSED','REJECTED','WITHDRAWN','OFFER_DECLINED')
      UNION
      SELECT p."personId" AS person_id FROM "NiceJobsAssignment" a JOIN "NiceJobsWorkerProfile" p ON p.id = a."profileId"
      WHERE a."versionId" = ${versionId} AND p."companyId" = ${companyId} AND a.status <> 'ENDED'
    ) participants`;
  const pending = await db.niceJobsApplication.count({ where: { companyId, versionId, status: { in: ["DRAFT", "ORIENTATION_INVITED", "SUBMITTED", "IN_REVIEW", "SHORTLISTED", "INTERVIEW", "MANAGEMENT_REVIEW"] } } });
  const confirmedAdmissions = admitted[0]?.count ?? 0, participants = applicants[0]?.count ?? 0;
  const programmeAdmissions = programme?.capacity && programmeVersionIds.length && programmeCoverageComplete ? await db.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::integer AS count FROM "NiceJobsAdmission" admission
    JOIN "NiceJobsReferralLink" referral ON referral.id = admission."referralId"
    JOIN "NiceJobsVersion" job ON job.id = referral."versionId"
    WHERE admission."companyId" = ${companyId} AND referral."versionId" IN (${Prisma.join(programmeVersionIds)})
      AND admission.status = 'VERIFIED'
      AND NOT EXISTS (SELECT 1 FROM "NiceJobsSourceEvent" cancelled WHERE cancelled."admissionId" = admission.id AND cancelled."eventType" = 'ADMISSION_CANCELLED' AND cancelled.status = 'VERIFIED')
      AND job.configuration::jsonb #>> '{opportunity,capacity,currency}' ~ '^[A-Z]{3}$'
      AND COALESCE((SELECT SUM(CASE WHEN payment."eventType" = 'PAYMENT_REFUNDED' THEN -payment."amountMinor" ELSE payment."amountMinor" END)
        FROM "NiceJobsSourceEvent" payment WHERE payment."admissionId" = admission.id AND payment.status = 'VERIFIED'
          AND payment."eventType" IN ('PAYMENT_RECEIVED','PAYMENT_REFUNDED')
          AND payment.currency = job.configuration::jsonb #>> '{opportunity,capacity,currency}'), 0)
          >= CASE WHEN job.configuration::jsonb #>> '{opportunity,capacity,qualifyingPaymentMinor}' ~ '^[1-9][0-9]{0,12}$'
            THEN (job.configuration::jsonb #>> '{opportunity,capacity,qualifyingPaymentMinor}')::bigint ELSE 9000000000001 END` : [];
  const programmeRemaining = !programmeCoverageComplete || programme?.capacity == null ? null : Math.max(0, programme.capacity - (programmeAdmissions[0]?.count ?? 0));
  return { admissionLimit: rule.admissionLimit, confirmedAdmissions, pendingApplications: pending, remainingAdmissions: Math.max(0, rule.admissionLimit - confirmedAdmissions), programmeRemaining, participantLimit: rule.participantLimit, participants, remainingParticipants: Math.max(0, rule.participantLimit - participants), available: programmeCoverageComplete && confirmedAdmissions < rule.admissionLimit && participants < rule.participantLimit && (programmeRemaining === null || programmeRemaining > 0) };
}
