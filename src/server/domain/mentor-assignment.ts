import { z } from "zod";

const approved = z.object({
  batchId: z.string().min(1), programId: z.string().min(1),
  preparedByUserId: z.string().min(1), mentorUserId: z.string().min(1),
  mentorEvidenceRef: z.string().min(8)
}).passthrough();

export function approvedPilotCohort(record: { kind: string; status: string; organizationId: string; payload: string } | null, decision: { actorUserId: string | null } | null, batchId: string, programId: string, organizationId: string) {
  if (!record || record.kind !== "STARTUP_KERALA_PILOT_INTAKE" || record.status !== "APPROVED" || record.organizationId !== organizationId || !decision?.actorUserId) return false;
  let value: z.infer<typeof approved>;
  try { value = approved.parse(JSON.parse(record.payload)); } catch { return false; }
  return value.batchId === batchId && value.programId === programId && decision.actorUserId !== value.preparedByUserId;
}

export function approvedPilotMentor(record: { kind: string; status: string; organizationId: string; payload: string } | null, decision: { actorUserId: string | null } | null, batchId: string, programId: string, organizationId: string, mentorUserId: string) {
  if (!approvedPilotCohort(record, decision, batchId, programId, organizationId)) return false;
  try { return approved.parse(JSON.parse(record!.payload)).mentorUserId === mentorUserId; } catch { return false; }
}
