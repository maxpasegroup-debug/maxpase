import type { Prisma } from "@prisma/client";
import { AccessError } from "@/server/authorization/engine";

type TaskForReview = { id: string; organizationId: string; assigneePersonId: string | null; updatedAt: Date; metadata: string | null };

export async function requireSkillCityTaskReviews(db: Prisma.TransactionClient, task: TaskForReview, required = false) {
  let metadata: { skillCityDeveloperReviewRequired?: boolean };
  try { metadata = JSON.parse(task.metadata ?? "{}"); } catch { throw new AccessError("Task review configuration unavailable"); }
  if (!required && metadata.skillCityDeveloperReviewRequired !== true) return;
  if (!task.assigneePersonId) throw new AccessError("Assigned developer required for reviewed completion");
  const duties = await db.responsibility.findMany({ where: { organizationId: task.organizationId, taskId: task.id, kind: "ACCOUNTABLE", status: "ACTIVE" }, select: { id: true, personId: true, metadata: true, createdAt: true }, take: 20 });
  const evidence = await db.taskEvidence.findMany({ where: { taskId: task.id }, select: { actorPersonId: true, data: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 });
  const lastContribution = evidence.find(item => { try { return JSON.parse(item.data).kind === "SKILLCITY_CONTRIBUTION"; } catch { return false; } })?.createdAt;
  const approvals: Record<string, string> = {};
  for (const kind of ["CODE_REVIEW", "TESTING"]) {
    const duty = duties.find(item => { try { return JSON.parse(item.metadata ?? "{}").skillCityDuty === kind && item.personId !== task.assigneePersonId; } catch { return false; } });
    if (!duty) throw new AccessError("Independent review and testing assignments required");
    const latest = evidence.find(item => { try { const data = JSON.parse(item.data); return data.kind === "SKILLCITY_REVIEW" && data.duty === kind && data.responsibilityId === duty.id && item.actorPersonId === duty.personId && item.createdAt >= task.updatedAt && item.createdAt >= duty.createdAt && (!lastContribution || item.createdAt >= lastContribution); } catch { return false; } });
    if (!latest || JSON.parse(latest.data).verdict !== "APPROVED") throw new AccessError("Current independent review and testing approval required");
    approvals[kind] = duty.id;
  }
  return approvals;
}
