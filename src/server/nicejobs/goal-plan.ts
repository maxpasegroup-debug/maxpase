import { z } from "zod";

export const goalOutcome = z.object({
  outcome: z.string().trim().min(3).max(200),
  target: z.number().int().min(1).max(1_000_000),
  unit: z.string().trim().min(1).max(80),
}).strict();
export const careerGoalPlan = z.object({
  kind: z.literal("NICE_JOBS_30_DAY"), assignmentId: z.string(),
  outcome: goalOutcome, start: z.string().datetime(),
  provider: z.enum(["HUMAN_TEMPLATE", "DETERMINISTIC_DOMAIN_EVIDENCE"]),
  siaId: z.string().nullable(), policyVersionId: z.string().nullable(),
  policy: z.string().nullable(), previousGoalId: z.string().nullable(), requestId: z.string().nullable(),
  checkpoints: z.array(z.object({ day: z.number().int(), target: z.number().int() })).length(3),
  daily: z.array(z.object({ day: z.number().int(), target: z.number().int(), actions: z.array(z.string()) })).length(30),
  sourceTasks: z.array(z.string()).max(5),
}).strict();
export type CareerGoalPlan = z.infer<typeof careerGoalPlan>;
export function draftGoalPlan(outcome: z.infer<typeof goalOutcome>) {
  const cumulative = (day: number) => Math.ceil(outcome.target * day / 30);
  return {
    checkpoints: [10, 20, 30].map(day => ({ day, target: cumulative(day) })),
    daily: Array.from({ length: 30 }, (_, i) => ({ day: i + 1,
      target: cumulative(i + 1) - (i ? cumulative(i) : 0),
      actions: ["Review the approved instructions and practise the relevant skill", "Complete authorized assigned work", "Record evidence and request feedback", "Submit your daily report; raise blockers"],
    })),
  };
}
export function isCareerGoal(metadata: string | null | undefined) {
  if (!metadata) return false;
  try { return JSON.parse(metadata).kind === "NICE_JOBS_30_DAY"; } catch { return false; }
}
