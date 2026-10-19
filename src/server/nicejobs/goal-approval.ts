import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AccessError } from "@/server/authorization/engine";
import { careerGoalPlan } from "./goal-plan";

export async function goalApprovalGuard(db: Prisma.TransactionClient, request: { id: string; type: string; resourceType: string; resourceId: string; organizationId: string; payload: string | null; requesterUserId: string }, approverPersonId: string | null) {
  if (request.type !== "NICE_JOBS_GOAL") return;
  const g = await db.goal.findUnique({ where: { id: request.resourceId } });
  const p = careerGoalPlan.safeParse(g?.metadata ? JSON.parse(g.metadata) : null);
  if (request.resourceType !== "GOAL" || !g || !p.success || p.data.requestId !== request.id || g.organizationId !== request.organizationId || !["DRAFT", "ACTIVE"].includes(g.status)) throw new AccessError("Goal proposal binding changed");
  const a = await db.niceJobsAssignment.findUnique({ where: { id: p.data.assignmentId }, include: { profile: true } });
  const requester = await db.user.findUnique({ where: { id: request.requesterUserId }, select: { personId: true } });
  const payload = JSON.parse(request.payload ?? "{}");
  if (!a || a.status !== "ACTIVE" || a.lifecycle !== "ACTIVE" || a.divisionId !== g.organizationId || a.profile.personId !== g.ownerPersonId || requester?.personId !== g.ownerPersonId || a.managerId !== approverPersonId || approverPersonId === g.ownerPersonId || payload.assignmentId !== a.id || payload.goalFingerprint !== createHash("sha256").update(JSON.stringify(p.data)).digest("hex")) throw new AccessError("Current assigned independent manager and unchanged proposal required");
}
