import type { Prisma } from "@prisma/client";
import { AccessError } from "@/server/authorization/engine";
import { trainingPlan } from "./onboarding-input";

type Enrollment = { status: string; plan: { versionId: string; configuration: string }; application: { companyId: string; divisionId: string; versionId: string; area: { version: { templateId: string } } } };
export async function linkedTrainingResource(db: Prisma.TransactionClient, enrollment: Enrollment, versionId: string, now = new Date()) {
  const p = trainingPlan.parse(JSON.parse(enrollment.plan.configuration));
  const references = [...(p.orientation?.modules.flatMap(m => m.lessons.map(l => l.reference)) ?? []), ...(p.ojt?.stages.flatMap(s => s.activities.map(a => a.reference)) ?? [])];
  if (enrollment.status === "CANCELLED" || enrollment.plan.versionId !== enrollment.application.versionId || !references.includes(versionId)) throw new AccessError("Training resource unavailable");
  const a = enrollment.application;
  const resource = await db.niceJobsKnowledgeVersion.findFirst({ where: {
    id: versionId, content: { companyId: a.companyId, kind: "RESOURCE" },
    organizationId: { in: [a.companyId, a.divisionId] }, visibility: "WORKER", resourceType: { not: "CUSTOMER_MATERIAL" },
    status: "PUBLISHED", publishedAt: { not: null }, privateReference: { not: null },
    AND: [{ OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    OR: [{ audience: "COMPANY", organizationId: a.companyId }, { audience: "DIVISION", organizationId: a.divisionId }, { audience: "JOB", jobId: a.area.version.templateId }, { audience: "JOB_VERSION", jobVersionId: a.versionId }]
  }, select: { id: true, organizationId: true, privateReference: true, title: true, captions: true, transcript: true } });
  if (!resource) throw new AccessError("Training resource unavailable");
  const file = await db.niceJobsContentFile.findFirst({ where: { id: resource.privateReference!, companyId: a.companyId, organizationId: resource.organizationId }, select: { filename: true, mime: true, mediaType: true } });
  if (!file) throw new AccessError("Training file unavailable");
  return { ...resource, file };
}
